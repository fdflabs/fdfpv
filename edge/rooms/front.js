/*
 * front.js: the rooms server's HTTP front, for either platform.
 *
 *   POST /v2/create          { map, friendly } -> { code }, a new private room
 *   GET  /v2/room/<CODE>     the room's WebSocket
 *   GET  /v2/public[/<map>]  public rooms, edge/rooms/lobby.js, named
 *                            `pub:<map>:<shard>`; open only while
 *                            env.PUBLIC_ROOMS is "on"
 *   GET  /                   a line of text, for a person checking it is up
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
 * for two things only, both in memory: the per address join and create
 * limits, and a host's kick, held for 30 minutes in the room object and
 * written nowhere.
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

import { codeFromBytes, normaliseCode } from '../../src/share/roomwire.js';
import { publicRoute } from './lobby.js';

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

/* Per process (per isolate on Cloudflare, where there are many, so there
 * it slows one address hammering one isolate and is not a global limit). */
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
