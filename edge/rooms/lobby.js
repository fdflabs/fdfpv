/*
 * lobby.js: public rooms, one set of shards per map (docs/MULTIPLAYER-PLAN.md
 * sections 1 and 2), behind the Worker's PUBLIC_ROOMS switch.
 *
 *   GET /v2/public          { open, cap }: whether public rooms are open
 *   GET /v2/public/<map>    a public room's WebSocket, in the least full
 *                           shard of that map with a free seat; ?shard=N
 *                           asks for that shard back (a reconnect)
 *
 * One Lobby Durable Object holds, per map, how many pilots each shard
 * has. The Worker asks it for a shard, and each public Room tells it its
 * count whenever a pilot joins or leaves; it never sees a pose, a name or
 * an address. A shard it hands out counts one more pilot for PENDING_MS,
 * until the room's own count arrives, so a burst of joiners does not all
 * land on one shard past its cap. The rare joiner who still finds a room
 * full is told so and asks again (src/share/rooms.js).
 *
 * LEAST FULL, by the lead's decision (2026-09-28), where the plan's
 * section 2 said fullest: the pilots are spread over the open shards
 * rather than packed into the first, and a new shard opens only when
 * every open one is full.
 *
 * LobbyBook is the logic, for rooms:selftest; Lobby is its Durable Object, keeping the book in its storage so a lobby
 * evicted from memory does not forget the rooms that are still flying.
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

import { PUBLIC_CAP } from '../../src/share/roomwire.js';

export const PENDING_MS = 30000;
/* Bounds on what a stranger can make the lobby hold: maps are the
 * simulator's own few, and 64 shards of 16 is a thousand pilots a map. */
export const MAX_MAPS = 64;
export const MAX_SHARDS = 64;
export const PUBLIC_JOINS_PER_MIN = 20;
const MAP_RE = /^[a-z0-9_]{1,32}$/;

export class LobbyBook {
  /* maps: { [map]: { [shard]: { n, pending: [ms] } } }, as stored. */
  constructor(maps = {}) {
    this.maps = maps;
  }

  load(shard, now) {
    shard.pending = shard.pending.filter((at) => now - at < PENDING_MS);
    return shard.n + shard.pending.length;
  }

  /* The shard a joiner goes to, or -1 when the map cannot be had. */
  assign(map, now, want = -1) {
    if (!MAP_RE.test(map)) {
      return -1;
    }
    if (!this.maps[map]) {
      if (Object.keys(this.maps).length >= MAX_MAPS) {
        return -1;
      }
      this.maps[map] = {};
    }
    const shards = this.maps[map];
    let pick = -1;
    if (Number.isInteger(want) && want >= 0 && want < MAX_SHARDS
      && (!shards[want] || this.load(shards[want], now) < PUBLIC_CAP)) {
      pick = want;
    } else {
      /* Entries come in ascending shard order, so a tie keeps the lowest. */
      let least = PUBLIC_CAP;
      for (const [key, shard] of Object.entries(shards)) {
        const n = this.load(shard, now);
        const i = Number(key);
        if (n < least) {
          least = n;
          pick = i;
        }
      }
      for (let i = 0; pick < 0 && i < MAX_SHARDS; i += 1) {
        if (!shards[i]) {
          pick = i;
        }
      }
    }
    if (pick < 0) {
      return -1;
    }
    if (!shards[pick]) {
      shards[pick] = { n: 0, pending: [] };
    }
    shards[pick].pending.push(now);
    return pick;
  }

  /* A room's own count, which replaces whatever the book guessed. */
  count(map, shard, n) {
    const shards = this.maps[map];
    if (!shards) {
      if (!n || !MAP_RE.test(map) || Object.keys(this.maps).length >= MAX_MAPS) {
        return;
      }
      this.maps[map] = {};
    }
    if (n > 0) {
      this.maps[map][shard] = { n, pending: [] };
      return;
    }
    delete this.maps[map][shard];
    if (!Object.keys(this.maps[map]).length) {
      delete this.maps[map];
    }
  }
}

/* A Durable Object in the plain class form, with no import of
 * cloudflare:workers, so rooms:selftest can load this file in Node. */
export class Lobby {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.cached = null;
  }

  async book() {
    if (!this.cached) {
      this.cached = new LobbyBook((await this.ctx.storage.get('maps')) || {});
    }
    return this.cached;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const body = await request.json();
    const book = await this.book();
    if (url.pathname === '/assign') {
      const shard = book.assign(String(body.map), Date.now(), body.want);
      await this.ctx.storage.put('maps', book.maps);
      return Response.json({ shard });
    }
    if (url.pathname === '/count') {
      book.count(String(body.map), body.shard, body.n);
      await this.ctx.storage.put('maps', book.maps);
      return new Response('ok');
    }
    return new Response('not found', { status: 404 });
  }
}

function lobbyStub(env) {
  return env.LOBBY.get(env.LOBBY.idFromName('lobby'));
}

/* Called by the Room after every event: a public room whose count moved
 * tells the lobby. Best effort; a lost count is corrected by the next. */
export function reportCount(env, core) {
  if (!core || !core.meta.public || core.lastCount === core.seats.size) {
    return null;
  }
  core.lastCount = core.seats.size;
  return lobbyStub(env).fetch('https://lobby/count', {
    method: 'POST',
    body: JSON.stringify({ map: core.meta.map, shard: core.meta.shard, n: core.seats.size }),
  }).catch(() => null);
}

/* A public room's meta, made on its first socket from what the Worker
 * put in x-room-public; a private room has it from /init. */
export async function publicMeta(storage, request) {
  const asked = request.headers.get('x-room-public');
  if (!asked || await storage.get('meta')) {
    return;
  }
  const { map, shard } = JSON.parse(asked);
  await storage.put('meta', { code: null, public: true, shard, cap: PUBLIC_CAP, friendly: false, map, epoch: Date.now() });
}

/* Per isolate and best effort, like the create limit in do.js. */
const joins = new Map();
function joinAllowed(address, now) {
  const c = joins.get(address);
  if (!c || now - c.since > 60000) {
    if (joins.size > 5000) {
      joins.clear();
    }
    joins.set(address, { since: now, n: 1 });
    return true;
  }
  c.n += 1;
  return c.n <= PUBLIC_JOINS_PER_MIN;
}

/* The Worker's /v2/public routes. headers is the CORS set for the origin. */
export async function publicRoute(request, env, url, headers) {
  const open = env.PUBLIC_ROOMS === 'on';
  if (url.pathname === '/v2/public') {
    return Response.json({ open, cap: PUBLIC_CAP }, { headers });
  }
  const m = url.pathname.match(/^\/v2\/public\/([a-z0-9_]{1,32})$/);
  if (!m || !open || request.headers.get('upgrade') !== 'websocket') {
    return new Response(open ? 'no such room' : 'public rooms are closed', { status: 404 });
  }
  const address = request.headers.get('cf-connecting-ip') || '';
  if (!joinAllowed(address, Date.now())) {
    return new Response('rate', { status: 429 });
  }
  const want = url.searchParams.has('shard') ? Number(url.searchParams.get('shard')) : -1;
  const res = await lobbyStub(env).fetch('https://lobby/assign', { method: 'POST', body: JSON.stringify({ map: m[1], want }) });
  const { shard } = await res.json();
  if (!(shard >= 0)) {
    return new Response('busy', { status: 503 });
  }
  const forward = new Headers(request.headers);
  forward.set('x-room-address', address);
  forward.set('x-room-public', JSON.stringify({ map: m[1], shard }));
  const stub = env.ROOMS.get(env.ROOMS.idFromName(`pub:${m[1]}:${shard}`));
  return stub.fetch(new Request(request.url, { headers: forward }));
}
