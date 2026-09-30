/*
 * rooms-account-check.js: a signed in pilot's callsign in a room, end to
 * end on this machine, with no Google.
 *
 *   node scripts/rooms-account-check.js
 *
 * Starts the tracks server with sign-in on (tracks-api/node.js, Google
 * stood in for by a key made here and served as a JWKS), and the rooms
 * server (edge/rooms/node.js) with ACCOUNTS_ORIGIN pointing at it, as the
 * VM runs them. Then: a guest joins as before and is shown by picker name
 * alone; a signed in pilot's hello carries its session and every other
 * pilot is told its callsign; a hello that names a callsign of its own, a
 * made up session and an ended one all join as guests; and with the
 * accounts server gone a signed in pilot still flies, as a guest.
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
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { PROTO } from '../src/share/roomwire.js';
import { startTracks } from '../tracks-api/node.js';
import { startRooms } from '../edge/rooms/node.js';

const CLIENT_ID = 'rooms-check.apps.googleusercontent.com';
const RS256 = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
const PAGE = 'https://fdflabs.github.io';

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${!ok && detail ? `  (${detail})` : ''}`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const google = await crypto.subtle.generateKey(RS256, true, ['sign', 'verify']);
const jwk = await crypto.subtle.exportKey('jwk', google.publicKey);
const jwks = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ keys: [{ kty: 'RSA', kid: 'k1', alg: 'RS256', n: jwk.n, e: jwk.e }] }));
});
await new Promise((resolve) => jwks.listen(0, '127.0.0.1', resolve));

async function idToken(sub) {
  const b64 = (x) => Buffer.from(x).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' }));
  const body = b64(JSON.stringify({ iss: 'https://accounts.google.com', aud: CLIENT_ID, sub, iat: now, exp: now + 600 }));
  const sig = new Uint8Array(await crypto.subtle.sign(RS256, google.privateKey, new TextEncoder().encode(`${head}.${body}`)));
  return `${head}.${body}.${b64(sig)}`;
}

const scratch = mkdtempSync(join(tmpdir(), 'fdfpv-rooms-account-'));
let tracks = await startTracks({
  db: join(scratch, 'tracks.db'), port: 0, googleClientId: CLIENT_ID, accountsSecret: 'rooms-check-secret',
  googleJwksUrl: `http://127.0.0.1:${jwks.address().port}/certs`,
});
const tracksOrigin = `http://127.0.0.1:${tracks.port}`;
const rooms = await startRooms({ db: join(scratch, 'rooms.db'), port: 0, accountsOrigin: tracksOrigin });
const roomsOrigin = `http://127.0.0.1:${rooms.port}`;

async function api(method, path, body, session) {
  const res = await fetch(`${tracksOrigin}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(session ? { authorization: `Bearer ${session}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

function pilot(code) {
  const ws = new WebSocket(`${roomsOrigin.replace(/^http/, 'ws')}/v2/room/${code}`, { headers: { origin: PAGE } });
  const p = { ws, got: [], closed: null };
  ws.on('message', (data, binary) => {
    if (!binary && data.toString() !== 'pong') {
      p.got.push(JSON.parse(data.toString()));
    }
  });
  ws.on('close', (c) => {
    p.closed = c;
  });
  ws.on('error', () => {});
  p.open = new Promise((resolve) => {
    ws.on('open', resolve);
    ws.on('close', resolve);
  });
  p.until = async (what, ms = 5000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const hit = what(p);
      if (hit) {
        return hit;
      }
      await sleep(20);
    }
    return null;
  };
  return p;
}

const profile = { airframe: 'cub1400', map: 'swiss2', figure: 3 };
async function seat(code, extra = {}) {
  const p = pilot(code);
  await p.open;
  p.ws.send(JSON.stringify({ type: 'hello', proto: PROTO, build: 'check', name: [1, 2, 42], profile, ...extra }));
  /* A clock ping straight behind the hello, as the simulator sends: it
   * must be answered after the welcome, not lost while the session is
   * looked up. */
  p.ws.send(JSON.stringify({ type: 't', c: 1 }));
  p.welcome = await p.until((x) => x.got.find((m) => m.type === 'welcome') || (x.closed && { closed: x.closed }));
  return p;
}

async function makeRoom() {
  const res = await fetch(`${roomsOrigin}/v2/create`, { method: 'POST', headers: { origin: PAGE }, body: JSON.stringify({ map: 'swiss2' }) });
  return (await res.json()).code;
}

console.log('a signed in pilot');
let r = await api('POST', '/api/account/google', { credential: await idToken('pilot-1') });
const session = r.body.session;
r = await api('PUT', '/api/account/callsign', { callsign: 'Maverick' }, session);
check('has claimed a callsign on the accounts server', r.status === 200 && r.body.callsign === 'Maverick');

const code = await makeRoom();
const guest = await seat(code);
check('a guest joins as today', guest.welcome.seat === 1 && !guest.welcome.closed);
const signed = await seat(code, { name: [3, 4, 77], session });
check('the signed in pilot is seated', signed.welcome.seat === 2, JSON.stringify(signed.welcome));
const told = await guest.until((x) => x.got.find((m) => m.type === 'join' && m.seat === 2));
check('the others are told its callsign', told && told.callsign === 'Maverick', JSON.stringify(told));
check('beside the picker name a build from before shows', told && JSON.stringify(told.name) === '[3,4,77]');
check('the guest is listed with no callsign', signed.welcome.peers.length === 1 && !('callsign' in signed.welcome.peers[0]));
check('the clock ping sent behind the hello is answered after the welcome',
  Boolean(await signed.until((x) => x.got.findIndex((m) => m.type === 't') > x.got.findIndex((m) => m.type === 'welcome'))));
const late = await seat(code, { name: [5, 6, 12] });
check('a pilot who joins later sees the callsign in the welcome', late.welcome.peers.some((p) => p.seat === 2 && p.callsign === 'Maverick'));

console.log('nobody else can be it');
const forged = await seat(code, { name: [7, 8, 15], callsign: 'Maverick' });
const forgedJoin = await guest.until((x) => x.got.find((m) => m.type === 'join' && m.seat === forged.welcome.seat));
check('a hello that names a callsign itself joins as a guest', forgedJoin && !('callsign' in forgedJoin), JSON.stringify(forgedJoin));
const madeUp = await seat(code, { name: [9, 10, 16], session: 'a'.repeat(64) });
const madeUpJoin = await guest.until((x) => x.got.find((m) => m.type === 'join' && m.seat === madeUp.welcome.seat));
check('so does a made up session', madeUpJoin && !('callsign' in madeUpJoin));
r = await api('POST', '/api/account/google', { credential: await idToken('pilot-1') });
const second = r.body.session;
await api('DELETE', '/api/account/session', undefined, second);
const ended = await seat(code, { name: [11, 12, 17], session: second });
const endedJoin = await guest.until((x) => x.got.find((m) => m.type === 'join' && m.seat === ended.welcome.seat));
check('and a session that was signed out', endedJoin && !('callsign' in endedJoin));
r = await api('PUT', '/api/account/callsign', { callsign: 'Goose' }, session);
const renamed = await seat(await makeRoom(), { session });
const room2 = renamed.welcome.code;
const watcher = await seat(room2, { name: [2, 2, 22] });
check('a changed callsign is the one the next join shows', watcher.welcome.peers.some((p) => p.callsign === 'Goose'));

for (const p of [guest, signed, late, forged, madeUp, ended, renamed, watcher]) {
  p.ws.close(1000);
}

console.log('the accounts server down');
await tracks.stop();
const code3 = await makeRoom();
const first = await seat(code3);
const t0 = Date.now();
const alone = await seat(code3, { name: [4, 4, 44], session });
const waited = Date.now() - t0;
const aloneJoin = await first.until((x) => x.got.find((m) => m.type === 'join' && m.seat === alone.welcome.seat));
check('a signed in pilot still flies, as a guest', alone.welcome.seat === 2 && aloneJoin && !('callsign' in aloneJoin), JSON.stringify(alone.welcome));
check('without waiting on it for long', waited < 3000, `${waited} ms`);
first.ws.close(1000);
alone.ws.close(1000);

await sleep(100);
await rooms.stop();
jwks.close();
rmSync(scratch, { recursive: true, force: true });
tracks = null;
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
