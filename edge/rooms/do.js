/*
 * do.js: the rooms Worker, fdfpv-rooms, and its Durable Object.
 *
 * One Room object per private room, named `prv:<code>`, speaking the wire
 * in src/share/roomwire.js through the hibernation WebSocket API. All the
 * room's logic is edge/rooms/core.js; this file is the adapter: it accepts
 * sockets, carries each one's attachment, runs the core's actions, drives
 * the 30 Hz tick while anybody flies, and purges the room's storage ten
 * minutes after the last pilot leaves.
 *
 * The Worker in front of it:
 *
 *   POST /v2/create          { map, friendly } -> { code }, a new private room
 *   GET  /v2/room/<CODE>     the room's WebSocket
 *   GET  /v2/public[/<map>]  public rooms, edge/rooms/lobby.js, named
 *                            `pub:<map>:<shard>`; open only while the
 *                            PUBLIC_ROOMS var in wrangler.toml is "on"
 *   GET  /                   a line of text, for a person checking it is up
 *
 * ADDRESSES. The connecting address is used for two things only, both in
 * memory: the per address join and create limits, and a host's kick, held
 * for 30 minutes in the room object and written nowhere. Observability
 * logging is off in wrangler.toml so it does not land in logs either.
 *
 * Deploy: npx wrangler deploy --config edge/rooms/wrangler.toml
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

import { DurableObject } from 'cloudflare:workers';
import { RoomCore, PRIVATE_CAP, TICK_MS } from './core.js';
import { CLOSE, codeFromBytes, normaliseCode } from '../../src/share/roomwire.js';
import { Lobby, publicMeta, publicRoute, reportCount } from './lobby.js';

export { Lobby };

const PURGE_MS = 10 * 60 * 1000;
const CREATES_PER_MIN = 6;

/*
 * The simulator's own origins. A browser always sends Origin on a
 * WebSocket upgrade and on a cross origin POST, so a page on another site
 * cannot put its visitors in our rooms. A request with no Origin is not a
 * browser, and a script can write any Origin it likes, so this is not a
 * lock against scripts; the rate limits are.
 */
const ORIGINS = [
  /^https:\/\/fdflabs\.github\.io$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
];

function originAllowed(origin) {
  return !origin || ORIGINS.some((re) => re.test(origin));
}

function cors(origin) {
  return origin && originAllowed(origin)
    ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST, GET, OPTIONS', 'access-control-allow-headers': 'content-type', vary: 'origin' }
    : {};
}

function hex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function newToken() {
  return hex(crypto.getRandomValues(new Uint8Array(16)));
}

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.core = null;
    this.timer = null;
    /* The keepalive, answered without waking the object. */
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async load() {
    if (this.core) {
      return this.core;
    }
    const meta = await this.ctx.storage.get('meta');
    if (!meta) {
      return null;
    }
    const race = await this.ctx.storage.get('race');
    this.core = new RoomCore(meta);
    this.core.race.restore(race);
    this.core.combat.restore(await this.ctx.storage.get('combat'));
    this.core.restore(this.ctx.getWebSockets().map((ws) => ({ conn: ws, attachment: ws.deserializeAttachment() })));
    return this.core;
  }

  run(actions) {
    for (const a of actions) {
      if (a.send) {
        try {
          a.send.send(a.data);
        } catch (e) {
          /* A socket closing under us: its close event cleans up. */
        }
      } else if (a.close) {
        try {
          a.close.close(a.code, a.reason);
        } catch (e) {
          /* Already closed. */
        }
      } else if (a.attach) {
        a.attach.serializeAttachment(a.value);
      } else if (a.store) {
        this.ctx.storage.put(a.store, a.value);
      } else if (a.tick && !this.timer) {
        this.timer = setTimeout(() => {
          this.timer = null;
          this.run(this.core.tick(Date.now()));
        }, TICK_MS);
      } else if (a.empty) {
        this.ctx.storage.setAlarm(Date.now() + PURGE_MS);
      }
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/init' && request.method === 'POST') {
      if (await this.ctx.storage.get('meta')) {
        return new Response('taken', { status: 409 });
      }
      const body = await request.json();
      const meta = {
        code: body.code,
        cap: PRIVATE_CAP,
        friendly: Boolean(body.friendly),
        map: body.map,
        epoch: Date.now(),
      };
      await this.ctx.storage.put('meta', meta);
      /* A room made and never joined is purged like an emptied one. */
      await this.ctx.storage.setAlarm(Date.now() + PURGE_MS);
      return new Response('ok');
    }
    if (request.headers.get('upgrade') !== 'websocket') {
      return new Response('expected a websocket', { status: 426 });
    }
    await publicMeta(this.ctx.storage, request);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ address: request.headers.get('x-room-address') || '' });
    /* A code nobody made is answered at the hello (webSocketMessage), not
     * here: a close sent before the 101 has reached the client was lost
     * in local workerd often enough to leave a client waiting forever. */
    const core = await this.load();
    if (core) {
      this.run(core.open(server, Date.now()));
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    const core = await this.load();
    if (!core) {
      ws.close(CLOSE.nosuch, 'nosuch');
      return;
    }
    const data = typeof message === 'string' ? message : new Uint8Array(message);
    const attached = ws.deserializeAttachment() || {};
    this.run(core.message(ws, data, Date.now(), attached.address || '', newToken));
    reportCount(this.env, core);
  }

  async webSocketClose(ws) {
    const core = await this.load();
    if (core) {
      this.run(core.close(ws, Date.now()));
      reportCount(this.env, core);
    }
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }

  async alarm() {
    if (this.ctx.getWebSockets().length) {
      await this.ctx.storage.setAlarm(Date.now() + PURGE_MS);
      return;
    }
    await this.ctx.storage.deleteAll();
    this.core = null;
  }
}

/* Per isolate and best effort: a Worker has many isolates, so this slows
 * one address hammering one of them and is not a global limit. */
const creates = new Map();
function createAllowed(address, now) {
  const c = creates.get(address);
  if (!c || now - c.since > 60000) {
    creates.set(address, { since: now, n: 1 });
    if (creates.size > 5000) {
      creates.clear();
    }
    return true;
  }
  c.n += 1;
  return c.n <= CREATES_PER_MIN;
}

const MAP_RE = /^[a-z0-9_]{1,32}$/;

async function create(request, env, origin) {
  const address = request.headers.get('cf-connecting-ip') || '';
  if (!createAllowed(address, Date.now())) {
    return Response.json({ error: 'rate' }, { status: 429, headers: cors(origin) });
  }
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return Response.json({ error: 'bad' }, { status: 400, headers: cors(origin) });
  }
  if (!body || !MAP_RE.test(String(body.map))) {
    return Response.json({ error: 'bad' }, { status: 400, headers: cors(origin) });
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = codeFromBytes(crypto.getRandomValues(new Uint8Array(6)));
    const stub = env.ROOMS.get(env.ROOMS.idFromName(`prv:${code}`));
    const res = await stub.fetch('https://room/init', {
      method: 'POST',
      body: JSON.stringify({ code, map: body.map, friendly: Boolean(body.friendly) }),
    });
    if (res.ok) {
      return Response.json({ code }, { headers: cors(origin) });
    }
  }
  return Response.json({ error: 'busy' }, { status: 503, headers: cors(origin) });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('origin');
    if (!originAllowed(origin)) {
      return new Response('forbidden', { status: 403 });
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(origin) });
    }
    if (url.pathname === '/v2/create' && request.method === 'POST') {
      return create(request, env, origin);
    }
    if (url.pathname.startsWith('/v2/public')) {
      return publicRoute(request, env, url, cors(origin));
    }
    const m = url.pathname.match(/^\/v2\/room\/([^/]+)$/);
    if (m) {
      const code = normaliseCode(m[1]);
      if (!code || request.headers.get('upgrade') !== 'websocket') {
        return new Response('no such room', { status: 404 });
      }
      const headers = new Headers(request.headers);
      headers.set('x-room-address', request.headers.get('cf-connecting-ip') || '');
      /* Only the public route may make a room public. */
      headers.delete('x-room-public');
      const stub = env.ROOMS.get(env.ROOMS.idFromName(`prv:${code}`));
      return stub.fetch(new Request(request.url, { headers }));
    }
    if (url.pathname === '/') {
      return new Response('fdfpv rooms, protocol 2\n', { headers: { 'content-type': 'text/plain' } });
    }
    return new Response('not found', { status: 404 });
  },
};
