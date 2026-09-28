/*
 * front.js: the rooms server's HTTP front, for either platform.
 *
 *   POST /v2/create          { map, friendly, public, name, mode } -> { code },
 *                            a new room; public only while env.PUBLIC_ROOMS
 *                            is "on"; 400 { error: 'name' } for a name the
 *                            shape or the word filter refuses
 *   GET  /v2/room/<CODE>     the room's WebSocket, public or private
 *   GET  /v2/rooms           the room browser's list (edge/rooms/lobby.js)
 *   GET  /v2/public          { open, cap }: whether public rooms are open
 *   GET  /v2/public/<map>    quick join: a WebSocket into the busiest
 *                            public room of that map with a seat, or a new
 *                            one; ?shard= from a page older than the
 *                            browser is ignored
 *   GET  /                   a line of text, for a person checking it is up
 *
 * Every room, public or private, is the object `prv:<code>`: the prefix is
 * older than public rooms with codes, and a room stored under it must
 * still be found after the deploy that brought them.
 *
 * A TYPED ROOM NAME is the one piece of free text a room carries, so it is
 * judged here, on the server, and nowhere else decides: the shape
 * (roomwire.js normaliseRoomName: trimmed, spaces collapsed, ROOM_NAME_MIN
 * to ROOM_NAME_MAX letters, Latin letters, digits and a little
 * punctuation) and the tracks server's word filter (tracks-api/words.js,
 * the same list, imported, not copied). A blank name is no name: the room
 * shows its picker name.
 *
 * It is a fetch handler over web standard Request and Response, and it
 * reaches rooms and the lobby only through env.ROOMS and env.LOBBY, which
 * have the shape of Durable Object namespaces (idFromName, get, and a
 * stub's fetch). do.js hands it the real namespaces; node.js hands it
 * in-process ones. What a room's stub answers to a WebSocket request is
 * the platform's own business and is passed back untouched.
 *
 * ADDRESSES. The connecting address, request header cf-connecting-ip on
 * both platforms (node.js sets it from the proxy in front of it), is used
 * for two things only, both in memory: the per address join, create and
 * list limits, and a host's kick, held for 30 minutes in the room object
 * and written nowhere.
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

import {
  PUBLIC_CAP, ROOM_MODES, codeFromBytes, normaliseCode, normaliseRoomName,
} from '../../src/share/roomwire.js';
import { badWordIn } from '../../tracks-api/words.js';
import { lobbyStub } from './lobby.js';

const CREATES_PER_MIN = 6;
const PUBLIC_JOINS_PER_MIN = 20;
/* The browser polls the list every few seconds while it is open
 * (src/share/roomlist.js), so this is several open browsers from one
 * address, and a script past that is refused rather than served. */
const LISTS_PER_MIN = 120;

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

/* Per process (per isolate on Cloudflare, where there are many, so there
 * they slow one address hammering one isolate and are not global limits):
 * one counter per limit, address to { since, n } over a minute. */
function limiter(perMin) {
  const seen = new Map();
  return (address, now) => {
    const c = seen.get(address);
    if (!c || now - c.since > 60000) {
      if (seen.size > 5000) {
        seen.clear();
      }
      seen.set(address, { since: now, n: 1 });
      return true;
    }
    c.n += 1;
    return c.n <= perMin;
  };
}
const createAllowed = limiter(CREATES_PER_MIN);
const joinAllowed = limiter(PUBLIC_JOINS_PER_MIN);
const listAllowed = limiter(LISTS_PER_MIN);

const MAP_RE = /^[a-z0-9_]{1,32}$/;

const newCode = () => codeFromBytes(crypto.getRandomValues(new Uint8Array(6)));

/* Make the room `code` (host.js init); false when the code was taken. */
async function makeRoom(env, code, room) {
  const stub = env.ROOMS.get(env.ROOMS.idFromName(`prv:${code}`));
  const res = await stub.fetch('https://room/init', { method: 'POST', body: JSON.stringify({ ...room, code }) });
  return res.ok;
}

/* A typed name as the room keeps it: null for none, false for refused. */
export function roomNameFor(raw) {
  if (raw == null || (typeof raw === 'string' && !raw.trim())) {
    return null;
  }
  const name = normaliseRoomName(raw);
  return name && !badWordIn(name) ? name : false;
}

async function create(request, env, origin) {
  const address = request.headers.get('cf-connecting-ip') || '';
  const refuse = (status, error) => Response.json({ error }, { status, headers: cors(origin) });
  if (!createAllowed(address, Date.now())) {
    return refuse(429, 'rate');
  }
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return refuse(400, 'bad');
  }
  if (!body || !MAP_RE.test(String(body.map)) || (body.mode != null && !ROOM_MODES.includes(body.mode))) {
    return refuse(400, 'bad');
  }
  const open = body.public === true;
  if (open && env.PUBLIC_ROOMS !== 'on') {
    return refuse(403, 'closed');
  }
  const name = roomNameFor(body.name);
  if (name === false) {
    return refuse(400, 'name');
  }
  const room = { map: body.map, friendly: Boolean(body.friendly), public: open, name, mode: body.mode ?? null };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = newCode();
    if (await makeRoom(env, code, room)) {
      return Response.json({ code }, { headers: cors(origin) });
    }
  }
  return refuse(503, 'busy');
}

/* A socket into the room `code`, with the connecting address for its
 * limits and kicks. */
function roomSocket(request, env, code) {
  const headers = new Headers(request.headers);
  headers.set('x-room-address', request.headers.get('cf-connecting-ip') || '');
  const stub = env.ROOMS.get(env.ROOMS.idFromName(`prv:${code}`));
  return stub.fetch(new Request(request.url, { headers }));
}

/* The /v2/rooms and /v2/public routes. */
async function publicRoute(request, env, url, headers) {
  const open = env.PUBLIC_ROOMS === 'on';
  const address = request.headers.get('cf-connecting-ip') || '';
  if (url.pathname === '/v2/rooms') {
    if (!open) {
      return Response.json({ open, rooms: [] }, { headers });
    }
    if (!listAllowed(address, Date.now())) {
      return new Response('rate', { status: 429, headers });
    }
    const list = await (await lobbyStub(env).fetch('https://lobby/list')).text();
    return new Response(`{"open":true,"rooms":${list}}`, {
      headers: { ...headers, 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }
  if (url.pathname === '/v2/public') {
    return Response.json({ open, cap: PUBLIC_CAP }, { headers });
  }
  const m = url.pathname.match(/^\/v2\/public\/([a-z0-9_]{1,32})$/);
  if (!m || !open || request.headers.get('upgrade') !== 'websocket') {
    return new Response(open ? 'no such room' : 'public rooms are closed', { status: 404 });
  }
  if (!joinAllowed(address, Date.now())) {
    return new Response('rate', { status: 429 });
  }
  const res = await lobbyStub(env).fetch('https://lobby/quick', { method: 'POST', body: JSON.stringify({ map: m[1], code: newCode() }) });
  const got = await res.json();
  if (!got.code || (got.fresh && !(await makeRoom(env, got.code, { map: m[1], friendly: false, public: true, name: null, mode: null })))) {
    return new Response('busy', { status: 503 });
  }
  return roomSocket(request, env, got.code);
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
    if (url.pathname.startsWith('/v2/public') || url.pathname === '/v2/rooms') {
      return publicRoute(request, env, url, cors(origin));
    }
    const m = url.pathname.match(/^\/v2\/room\/([^/]+)$/);
    if (m) {
      const code = normaliseCode(m[1]);
      if (!code || request.headers.get('upgrade') !== 'websocket') {
        return new Response('no such room', { status: 404 });
      }
      return roomSocket(request, env, code);
    }
    if (url.pathname === '/') {
      return new Response('fdfpv rooms, protocol 2\n', { headers: { 'content-type': 'text/plain' } });
    }
    return new Response('not found', { status: 404 });
  },
};
