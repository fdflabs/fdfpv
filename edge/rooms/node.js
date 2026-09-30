/*
 * node.js: the rooms server on plain Node, the VM's adapter.
 *
 *   ROOMS_DB=/var/lib/fdfpv-rooms/rooms.db PORT=8797 ADMIN_SECRET=... node edge/rooms/node.js
 *
 * and ACCOUNTS_ORIGIN=http://127.0.0.1:8787 to show signed in pilots'
 * callsigns (sessionCallsign below), and TURN_SECRET with TURN_URLS for
 * voice chat's TURN relay (edge/rooms/turn.js; without them voice goes
 * peer to peer through STUN alone).
 *
 * The same rooms as do.js serves on Cloudflare: front.js answers every
 * request, each room is a RoomHost (host.js) around a RoomCore, and the
 * public rooms' Lobby is lobby.js's own class. What this file supplies is
 * what a Durable Object would have, in one process:
 *
 *   a namespace      env.ROOMS and env.LOBBY: idFromName and get, with one
 *                    object per name, made on first use
 *   one at a time    every call into one object waits for the one before
 *                    it (Room.enqueue), which is the promise a Durable
 *                    Object's input gate makes and host.js relies on
 *   storage          a room's keys in SQLite at ROOMS_DB, so a private
 *                    room's code and whatever else host.js keeps outlive
 *                    a restart, and its pilots reconnect into their seats
 *   alarms           a timer, with its time in SQLite so a restart keeps
 *                    the purge
 *   sockets          the ws package, each wrapped as a conn with an
 *                    attachment; there is no hibernation, the core simply
 *                    stays in memory
 *   the keepalive    a text "ping" answered "pong" here, never reaching
 *                    the room, as setWebSocketAutoResponse does
 *
 * The Lobby keeps its book in memory only: a restart drops every socket,
 * so every count it held is wrong afterwards. Instead every stored room
 * announces itself as the process starts (host.js announce), so the room
 * browser lists the public ones again at once, with nobody in them yet,
 * and each reports its real count as its pilots come back.
 *
 * What each room costs, messages and bytes each way, is counted here, at
 * the sockets, and edge/rooms/health.js turns the counts into the admin
 * report (GET /v2/admin/health, with ADMIN_SECRET; without one it refuses
 * everyone, as the tracks server's admin routes do) and the valve that
 * refuses new public rooms while the core is short.
 *
 * On SIGTERM (systemctl restart) every socket is closed with 1012, service
 * restart, which the client (src/share/rooms.js) answers by reconnecting.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { deserialize, serialize } from 'node:v8';
import { WebSocketServer } from 'ws';
import front from './front.js';
import { PURGE_MS, RoomHost } from './host.js';
import { Lobby } from './lobby.js';
import { Health, roomCounters } from './health.js';
import { answer, listener, refuseUpgrade, upgradeListener } from '../node-http.js';
import { normaliseName } from '../../src/share/pilot.js';
import { turnMinter } from './turn.js';

/* The largest message the simulator sends is a host's race track, logos
 * stripped (src/share/roomrace.js), which the room caps at 64 kB (race.js
 * TRACK_MAX_BYTES). A MiB is that many times over, and even an unstripped
 * track fits (the tracks server's documents are at most 512 kB).
 * Cloudflare takes up to 32 MiB, which a process capped at 256 MB must not. */
const MAX_MESSAGE_BYTES = 1024 * 1024;
const CLOSE_RESTART = 1012;

/*
 * THE ROUND TRIP A PAGE CANNOT MEASURE. A page learns the room's clock
 * from its own pings (src/share/roomclock.js), and a page whose frames are
 * slow reads each reply only when its frame's work is done, so every round
 * trip it measures is long by part of a frame and its clock is off by half
 * of that. A WebSocket ping frame is answered by the browser's network
 * stack, not the page, so the room measures the true round trip itself,
 * every PROBE_MS, and each clock reply carries the shortest of the last
 * PROBE_KEEP (core.js, as `rtt`). The Durable Object has no ping frames,
 * so its replies carry none and a page uses its own.
 */
const PROBE_MS = 2000;
const PROBE_KEEP = 16;

/*
 * A SIGNED IN PILOT'S HELLO carries its session token (src/share/rooms.js),
 * and the room shows the callsign that session holds instead of a picker
 * name. The token is checked by the accounts server (tracks-api/accounts.js,
 * GET /api/account) at ACCOUNTS_ORIGIN, the tracks server on this same
 * machine over loopback, rather than by a signature this server could check
 * alone: that way a signed out session, a changed callsign or a deleted
 * account is true in the next join, with no secret shared between the two
 * servers and nothing about accounts kept here. The token is used for that
 * one request and not kept. The pilot's address goes with it as the
 * accounts server's client address, as Caddy would send it.
 *
 * Anything short of a clean answer is a guest's join: no ACCOUNTS_ORIGIN
 * (do.js on Cloudflare, the selftests), no session, a session that has
 * ended, the accounts server down or slower than ACCOUNT_WAIT_MS. The
 * pilot flies either way, under their picker name.
 */
const SESSION_RE = /^[0-9a-f]{64}$/;
const ACCOUNT_WAIT_MS = 2000;

async function sessionCallsign(text, env, address) {
  if (!env.ACCOUNTS_ORIGIN || !text.includes('"session"')) {
    return null;
  }
  let msg;
  try {
    msg = JSON.parse(text);
  } catch (e) {
    return null;
  }
  if (!msg || msg.type !== 'hello' || typeof msg.session !== 'string' || !SESSION_RE.test(msg.session)) {
    return null;
  }
  try {
    const res = await fetch(`${env.ACCOUNTS_ORIGIN}/api/account`, {
      headers: { authorization: `Bearer ${msg.session}`, 'cf-connecting-ip': address || 'rooms' },
      signal: AbortSignal.timeout(ACCOUNT_WAIT_MS),
    });
    if (res.status === 401) {
      return null;
    }
    if (!res.ok) {
      console.error(`accounts answered ${res.status}; a signed in pilot joins as a guest`);
      return null;
    }
    const body = await res.json();
    return normaliseName(body && body.callsign);
  } catch (e) {
    console.error('accounts unreachable; a signed in pilot joins as a guest:', e && e.message ? e.message : e);
    return null;
  }
}

/* Every room's storage in one SQLite file: kv holds what host.js puts,
 * as v8 structured clone bytes like a Durable Object's; alarms holds each
 * room's next alarm. */
class Store {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kv (name TEXT NOT NULL, key TEXT NOT NULL, value BLOB NOT NULL, PRIMARY KEY (name, key));
      CREATE TABLE IF NOT EXISTS alarms (name TEXT PRIMARY KEY, at INTEGER NOT NULL);
    `);
    this.getQ = this.db.prepare('SELECT value FROM kv WHERE name = ? AND key = ?');
    this.putQ = this.db.prepare('INSERT INTO kv (name, key, value) VALUES (?, ?, ?) ON CONFLICT (name, key) DO UPDATE SET value = excluded.value');
    this.listQ = this.db.prepare('SELECT key, value FROM kv WHERE name = ? ORDER BY key');
    this.dropQ = this.db.prepare('DELETE FROM kv WHERE name = ?');
    this.alarmQ = this.db.prepare('INSERT INTO alarms (name, at) VALUES (?, ?) ON CONFLICT (name) DO UPDATE SET at = excluded.at');
    this.unalarmQ = this.db.prepare('DELETE FROM alarms WHERE name = ?');
  }

  /* The names with anything stored, and each one's alarm or null. */
  names() {
    const rows = this.db.prepare(
      'SELECT n.name AS name, a.at AS at FROM (SELECT name FROM kv UNION SELECT name FROM alarms) n LEFT JOIN alarms a ON a.name = n.name',
    ).all();
    return rows.map((r) => ({ name: r.name, at: r.at == null ? null : Number(r.at) }));
  }

  storage(name, onAlarm) {
    return {
      get: async (key) => {
        const row = this.getQ.get(name, key);
        return row ? deserialize(row.value) : undefined;
      },
      put: async (key, value) => {
        this.putQ.run(name, key, serialize(value));
      },
      list: async () => new Map(this.listQ.all(name).map((r) => [r.key, deserialize(r.value)])),
      deleteAll: async () => {
        this.dropQ.run(name);
        this.unalarmQ.run(name);
      },
      setAlarm: async (at) => {
        this.alarmQ.run(name, Math.round(at));
        onAlarm(at);
      },
    };
  }
}

/* The Lobby's storage: memory, see the header. */
function memoryStorage() {
  const kept = new Map();
  return {
    get: async (key) => (kept.has(key) ? structuredClone(kept.get(key)) : undefined),
    put: async (key, value) => {
      kept.set(key, structuredClone(value));
    },
    list: async () => new Map([...kept].map(([k, v]) => [k, structuredClone(v)])),
    deleteAll: async () => kept.clear(),
    setAlarm: async () => {},
  };
}

/* A socket as host.js sees one: the attachment is a structured clone both
 * ways, as it is on a Durable Object, so nothing aliases the core's state. */
class Conn {
  constructor(ws, counters) {
    this.ws = ws;
    this.counters = counters;
    this.attachment = null;
    this.corked = false;
    /* The last PROBE_KEEP protocol round trips, ms, and when the ping in
     * flight went. */
    this.rtts = [];
    this.probeAt = null;
  }

  /* The shortest recent round trip at the protocol level, or undefined
   * before one has come back. core.js puts it in its clock replies. */
  get netRtt() {
    return this.rtts.length ? Math.min(...this.rtts) : undefined;
  }

  probe() {
    if (this.probeAt == null && this.ws.readyState === 1) {
      this.probeAt = performance.now();
      this.ws.ping();
    }
  }

  pong() {
    if (this.probeAt == null) {
      return;
    }
    this.rtts.push(Math.round((performance.now() - this.probeAt) * 1000) / 1000);
    this.probeAt = null;
    if (this.rtts.length > PROBE_KEEP) {
      this.rtts.shift();
    }
  }

  send(data) {
    this.counters.outMsgs += 1;
    this.counters.outBytes += typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength;
    /* Everything this socket is sent in one turn of the loop goes out in
     * one write: ws writes every message on its own, and a combat round's
     * relay is 31 streamers a pilot a tenth of a second, each a syscall
     * that cost more than the rest of the room's work (rooms:load's
     * profile, 2026-09-29). Nothing waits: the turn ends, the write goes.
     * _socket is ws's own field (ws is pinned, package.json); ws corks it
     * round each frame, and corks nest. */
    const socket = this.ws._socket;
    if (!this.corked && socket) {
      this.corked = true;
      socket.cork();
      setImmediate(() => {
        this.corked = false;
        socket.uncork();
      });
    }
    this.ws.send(data);
  }

  close(code, reason) {
    this.ws.close(code, reason);
  }

  serializeAttachment(value) {
    this.attachment = structuredClone(value);
  }

  deserializeAttachment() {
    return structuredClone(this.attachment);
  }
}

/* What a room's stub answers to a WebSocket request: not a Response
 * (Node's refuses status 101) but the function that takes the socket in,
 * which the server below calls once ws has finished the handshake. */
class Upgrade {
  constructor(accept) {
    this.status = 101;
    this.accept = accept;
  }
}

class Room {
  constructor(name, store, env) {
    this.name = name;
    this.env = env;
    this.sockets = new Set();
    this.counters = roomCounters();
    this.queue = Promise.resolve();
    this.alarmTimer = null;
    this.host = new RoomHost({
      storage: store.storage(name, (at) => this.schedule(at)),
      getWebSockets: () => [...this.sockets],
    }, env);
  }

  /* One call at a time into this room; an error is logged and does not
   * stop the calls queued after it. */
  enqueue(fn) {
    const run = this.queue.then(fn);
    this.queue = run.catch((e) => console.error(`room ${this.name}:`, e && e.stack ? e.stack : e));
    return run;
  }

  schedule(at) {
    clearTimeout(this.alarmTimer);
    this.alarmTimer = setTimeout(() => this.enqueue(async () => {
      this.alarmTimer = null;
      await this.host.alarm();
      this.dropIfIdle();
    }), Math.max(0, at - Date.now()));
  }

  async fetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    if (url.pathname === '/init' && request.method === 'POST') {
      const body = await request.json();
      const made = await this.enqueue(() => this.host.init(body));
      return made ? new Response('ok') : new Response('taken', { status: 409 });
    }
    if (request.headers.get('upgrade') !== 'websocket') {
      return new Response('expected a websocket', { status: 426 });
    }
    /* Taken in by whichever object holds the name by then, in case this
     * one was dropped while the handshake finished. */
    return new Upgrade((ws) => this.env.ROOMS.get(this.name).connect(ws, request));
  }

  /* A purged room, or a socket to a code nobody made, leaves an object
   * with nothing in it: a Durable Object would be evicted, this is dropped. */
  dropIfIdle() {
    if (!this.host.core && !this.sockets.size && !this.alarmTimer) {
      this.env.ROOMS.drop(this.name, this);
    }
  }

  connect(ws, request) {
    const conn = new Conn(ws, this.counters);
    const address = request.headers.get('x-room-address') || '';
    this.sockets.add(conn);
    this.enqueue(() => this.host.accept(conn, request));
    /* The socket's first text is its hello, which waits for its callsign
     * (sessionCallsign), and everything after it, the close included,
     * waits behind it, so the room still sees this socket in order. The
     * wait is outside the room's queue: a slow answer holds up this pilot's
     * join and nobody else's flight. */
    let gate = null;
    ws.on('pong', () => conn.pong());
    conn.probe();
    const probes = setInterval(() => conn.probe(), PROBE_MS);
    ws.on('message', (data, binary) => {
      this.counters.inMsgs += 1;
      this.counters.inBytes += data.length;
      if (!binary && data.length === 4 && data.toString() === 'ping') {
        conn.send('pong');
        return;
      }
      const value = binary ? data : data.toString();
      if (!gate) {
        gate = binary ? Promise.resolve(null) : sessionCallsign(value, this.env, address);
      }
      gate.then((callsign) => this.enqueue(() => this.host.message(conn, value, callsign)));
    });
    ws.on('close', (code) => {
      clearInterval(probes);
      this.sockets.delete(conn);
      (gate || Promise.resolve()).then(() => this.enqueue(async () => {
        await this.host.close(conn, code);
        this.dropIfIdle();
      }));
    });
    /* ws emits close after error, and close does the cleaning up. */
    ws.on('error', () => {});
  }
}

/* A Durable Object namespace in one process: one object per name. */
class Namespace {
  constructor(make) {
    this.make = make;
    this.objects = new Map();
  }

  idFromName(name) {
    return name;
  }

  get(name) {
    if (!this.objects.has(name)) {
      this.objects.set(name, this.make(name));
    }
    return this.objects.get(name);
  }

  drop(name, object) {
    if (this.objects.get(name) === object) {
      this.objects.delete(name);
    }
  }
}

/* The one Lobby, its fetch queued like a room's. */
function lobbyObject(env) {
  const lobby = new Lobby({ storage: memoryStorage() }, env);
  let queue = Promise.resolve();
  return {
    fetch(input, init) {
      const request = input instanceof Request ? input : new Request(input, init);
      const run = queue.then(() => lobby.fetch(request));
      queue = run.catch((e) => console.error('lobby:', e && e.stack ? e.stack : e));
      return run;
    },
  };
}

/* roomCap: every new room's cap, for scripts/rooms-load.js alone; a seat
 * is a byte on the wire and the client colours sixteen, so the process's
 * own entry point below never reads it. */
export function startRooms({
  db, port, host = '127.0.0.1', publicRooms = 'on', adminSecret = '', roomCap = 0, accountsOrigin = '', turnSecret = '', turnUrls = '',
}) {
  if (!(Number.isInteger(roomCap) && roomCap >= 0 && roomCap <= 64)) {
    throw new Error(`roomCap ${roomCap}: 0 (the usual caps) to 64`);
  }
  const store = new Store(db);
  const env = {
    PUBLIC_ROOMS: publicRooms, ADMIN_SECRET: adminSecret, ROOM_CAP: roomCap, ACCOUNTS_ORIGIN: accountsOrigin.replace(/\/+$/, ''),
    TURN: turnMinter(turnSecret, turnUrls),
  };
  env.ROOMS = new Namespace((name) => new Room(name, store, env));
  env.LOBBY = new Namespace(() => lobbyObject(env));
  env.HEALTH = new Health(() => [...env.ROOMS.objects.values()].map((room) => {
    const core = room.host.core;
    return { counters: room.counters, pilots: core ? core.seats.size : 0, meta: core ? core.meta : null, activity: core ? core.activity(Date.now()) : null };
  }));

  /* Rooms stored before a restart: each gets its alarm back, or a purge
   * PURGE_MS from now if it had none (it had pilots when the process
   * stopped, and they have that long to come back). */
  for (const { name, at } of store.names()) {
    const room = env.ROOMS.get(name);
    room.schedule(at ?? Date.now() + PURGE_MS);
    room.enqueue(() => room.host.announce());
  }

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  const server = http.createServer(listener(front, env));
  server.on('upgrade', upgradeListener(async (req, socket, head) => {
    const result = await answer(front, req, env);
    if (!(result instanceof Upgrade)) {
      await refuseUpgrade(socket, result);
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => result.accept(ws));
  }));

  function stop() {
    env.HEALTH.stop();
    for (const ws of wss.clients) {
      ws.close(CLOSE_RESTART, 'restart');
    }
    server.close();
    return new Promise((resolve) => {
      /* The close frames need a moment on the wire before the process goes. */
      setTimeout(() => {
        for (const ws of wss.clients) {
          ws.terminate();
        }
        store.db.close();
        resolve();
      }, 500);
    });
  }

  return new Promise((resolve) => {
    server.listen(port, host, () => resolve({ server, env, stop, port: server.address().port }));
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const running = await startRooms({
    db: process.env.ROOMS_DB || 'rooms.db',
    port: Number(process.env.PORT || 8797),
    host: process.env.HOST || '127.0.0.1',
    publicRooms: process.env.PUBLIC_ROOMS || 'on',
    adminSecret: process.env.ADMIN_SECRET || '',
    accountsOrigin: process.env.ACCOUNTS_ORIGIN || '',
    turnSecret: process.env.TURN_SECRET || '',
    turnUrls: process.env.TURN_URLS || '',
  });
  console.log(`fdfpv rooms on ${process.env.HOST || '127.0.0.1'}:${running.port}${process.env.ADMIN_SECRET ? '' : ', no ADMIN_SECRET: the admin route refuses everyone'}${running.env.TURN ? '' : ', no TURN relay: voice is peer to peer through STUN alone'}`);
  process.on('SIGTERM', async () => {
    await running.stop();
    process.exit(0);
  });
}
