/*
 * rooms-account-check.js: a signed in pilot's callsign in a room, end to
 * end on this machine, with no Google.
 *
 *   node scripts/rooms-account-check.js
 *
 * Starts the tracks server with sign-in on (tracks-api/node.js, Google
 * stood in for by a key made here and served as a JWKS), and the rooms
 * server (edge/rooms/node.js) with ACCOUNTS_ORIGIN pointing at it, as the
 * VM runs them. Then: a signed in pilot's hello carries its session and
 * every other pilot is told its callsign; nobody plays without an account
 * (the owner, 2026-10-03), so a build from before the sign in is sent to
 * reload, and a hello with no session, one that names a callsign of its
 * own, a made up session, an ended one and an account with no callsign yet
 * are all refused with CLOSE_SIGNIN, in a free room and in a war, combat
 * and tag room alike; a socket that speaks before its hello is closed;
 * and with the accounts server gone a signed in pilot is refused with
 * CLOSE_ACCOUNTS, quickly, rather than seated unchecked.
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
import {
  ACCOUNT_JOIN, CLOSE, CLOSE_ACCOUNTS, CLOSE_SIGNIN, PROTO, WAR_JOIN,
} from '../src/share/roomwire.js';
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

async function makeRoom(room = { map: 'swiss2' }) {
  const res = await fetch(`${roomsOrigin}/v2/create`, { method: 'POST', headers: { origin: PAGE }, body: JSON.stringify(room) });
  return (await res.json()).code;
}

const SIGNIN = CLOSE_SIGNIN;
const NEW = { account: ACCOUNT_JOIN };
const closedWith = (p, code) => Boolean(p.welcome && p.welcome.closed === code);

console.log('signed in pilots');
let r = await api('POST', '/api/account/google', { credential: await idToken('pilot-1') });
const session = r.body.session;
r = await api('PUT', '/api/account/callsign', { callsign: 'Maverick' }, session);
check('has claimed a callsign on the accounts server', r.status === 200 && r.body.callsign === 'Maverick');
r = await api('POST', '/api/account/google', { credential: await idToken('pilot-2') });
const other = r.body.session;
await api('PUT', '/api/account/callsign', { callsign: 'Iceman' }, other);

const code = await makeRoom();
const first = await seat(code, { ...NEW, session: other });
check('a signed in pilot is seated', first.welcome.seat === 1 && !first.welcome.closed, JSON.stringify(first.welcome));
const signed = await seat(code, { ...NEW, name: [3, 4, 77], session });
check('and a second', signed.welcome.seat === 2, JSON.stringify(signed.welcome));
const told = await first.until((x) => x.got.find((m) => m.type === 'join' && m.seat === 2));
check('the others are told its callsign', told && told.callsign === 'Maverick', JSON.stringify(told));
check('beside the picker name a build from before shows', told && JSON.stringify(told.name) === '[3,4,77]');
check('the pilot already there is listed with its callsign', signed.welcome.peers.length === 1 && signed.welcome.peers[0].callsign === 'Iceman',
  JSON.stringify(signed.welcome.peers));
check('the clock ping sent behind the hello is answered after the welcome',
  Boolean(await signed.until((x) => x.got.findIndex((m) => m.type === 't') > x.got.findIndex((m) => m.type === 'welcome'))));

console.log('nobody plays without an account');
const old = await seat(code);
check('a build from before the sign in (no account in its hello) is sent to reload', closedWith(old, CLOSE.update), JSON.stringify(old.welcome));
const guest = await seat(code, { ...NEW, name: [1, 2, 42] });
check('a hello with no session is refused, to sign in', closedWith(guest, SIGNIN), JSON.stringify(guest.welcome));
const forged = await seat(code, { ...NEW, name: [7, 8, 15], callsign: 'Maverick' });
check('so is a hello that names a callsign itself', closedWith(forged, SIGNIN), JSON.stringify(forged.welcome));
const madeUp = await seat(code, { ...NEW, name: [9, 10, 16], session: 'a'.repeat(64) });
check('and a made up session', closedWith(madeUp, SIGNIN), JSON.stringify(madeUp.welcome));
r = await api('POST', '/api/account/google', { credential: await idToken('pilot-1') });
const second = r.body.session;
await api('DELETE', '/api/account/session', undefined, second);
const ended = await seat(code, { ...NEW, name: [11, 12, 17], session: second });
check('and a session that was signed out', closedWith(ended, SIGNIN), JSON.stringify(ended.welcome));
r = await api('POST', '/api/account/google', { credential: await idToken('pilot-3') });
const nameless = await seat(code, { ...NEW, name: [12, 13, 18], session: r.body.session });
check('and an account with no callsign yet', closedWith(nameless, SIGNIN), JSON.stringify(nameless.welcome));
const binary = pilot(code);
await binary.open;
binary.ws.send(new Uint8Array([0x10, 0, 0]));
binary.ws.send(JSON.stringify({ type: 'hello', proto: PROTO, build: 'check', name: [2, 3, 19], profile, ...NEW, session }));
const binaryEnd = await binary.until((x) => x.got.find((m) => m.type === 'welcome') || (x.closed && { closed: x.closed }));
check('a socket whose first word is not its hello is closed, so no hello rides past the check', binaryEnd && binaryEnd.closed === CLOSE.bad,
  JSON.stringify(binaryEnd));
const roster = await first.until((x) => x.got.filter((m) => m.type === 'join').length >= 1 && x);
check('none of them was ever seated beside the pilots', roster && roster.got.filter((m) => m.type === 'join').length === 1,
  JSON.stringify(roster && roster.got.filter((m) => m.type === 'join')));

console.log('a war, combat and tag room the same');
for (const room of [{ map: 'itaipu', mode: 'war' }, { map: 'swiss2', mode: 'combat' }, { map: 'swiss2', mode: 'tag' }]) {
  const at = await makeRoom(room);
  const war = room.mode === 'war' ? { war: WAR_JOIN } : {};
  const oldOne = await seat(at, war);
  const unsigned = await seat(at, { ...war, ...NEW, name: [4, 5, 21] });
  const pilotOne = await seat(at, { ...war, ...NEW, name: [5, 6, 22], session });
  check(`${room.mode}: a build from before is sent to reload`, closedWith(oldOne, CLOSE.update), JSON.stringify(oldOne.welcome));
  check(`${room.mode}: an unsigned seat is refused, to sign in`, closedWith(unsigned, SIGNIN), JSON.stringify(unsigned.welcome));
  check(`${room.mode}: a signed in pilot is seated, as the room's game`, pilotOne.welcome.seat === 1 && pilotOne.welcome.mode === room.mode,
    JSON.stringify(pilotOne.welcome && { seat: pilotOne.welcome.seat, mode: pilotOne.welcome.mode, closed: pilotOne.welcome.closed }));
  pilotOne.ws.close(1000);
}

r = await api('PUT', '/api/account/callsign', { callsign: 'Goose' }, session);
const renamed = await seat(await makeRoom(), { ...NEW, session });
const room2 = renamed.welcome.code;
const watcher = await seat(room2, { ...NEW, name: [2, 2, 22], session: other });
check('a changed callsign is the one the next join shows', watcher.welcome.peers.some((p) => p.callsign === 'Goose'));

for (const p of [first, signed, renamed, watcher]) {
  p.ws.close(1000);
}

console.log('the accounts server down');
await tracks.stop();
const code3 = await makeRoom();
const t0 = Date.now();
const down = await seat(code3, { ...NEW, name: [4, 4, 44], session });
const waited = Date.now() - t0;
check('a signed in pilot is refused with its own reason, to try again', closedWith(down, CLOSE_ACCOUNTS), JSON.stringify(down.welcome));
check('without waiting on it for long', waited < 3000, `${waited} ms`);

await sleep(100);
await rooms.stop();
jwks.close();
rmSync(scratch, { recursive: true, force: true });
tracks = null;
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
