/*
 * node.js: the rooms server on plain Node, the VM's adapter.
 *
 *   ROOMS_DB=/var/lib/fdfpv-rooms/rooms.db PORT=8797 node edge/rooms/node.js
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
import { answer, listener, refuseUpgrade, upgradeListener } from '../node-http.js';

/* The largest message the simulator sends is a host's race track, logos
 * stripped (src/share/roomrace.js), which the room caps at 64 kB (race.js
 * TRACK_MAX_BYTES). A MiB is that many times over, and even an unstripped
 * track fits (the tracks server's documents are at most 512 kB).
 * Cloudflare takes up to 32 MiB, which a process capped at 256 MB must not. */
const MAX_MESSAGE_BYTES = 1024 * 1024;
const CLOSE_RESTART = 1012;

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
  constructor(ws) {
    this.ws = ws;
    this.attachment = null;
  }

  send(data) {
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
    const conn = new Conn(ws);
    this.sockets.add(conn);
    this.enqueue(() => this.host.accept(conn, request));
    ws.on('message', (data, binary) => {
      if (!binary && data.length === 4 && data.toString() === 'ping') {
        ws.send('pong');
        return;
      }
      this.enqueue(() => this.host.message(conn, binary ? data : data.toString()));
    });
    ws.on('close', () => {
      this.sockets.delete(conn);
      this.enqueue(async () => {
        await this.host.close(conn);
        this.dropIfIdle();
      });
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

export function startRooms({ db, port, host = '127.0.0.1', publicRooms = 'on' }) {
  const store = new Store(db);
  const env = { PUBLIC_ROOMS: publicRooms };
  env.ROOMS = new Namespace((name) => new Room(name, store, env));
  env.LOBBY = new Namespace(() => lobbyObject(env));

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
  });
  console.log(`fdfpv rooms on ${process.env.HOST || '127.0.0.1'}:${running.port}`);
  process.on('SIGTERM', async () => {
    await running.stop();
    process.exit(0);
  });
}
