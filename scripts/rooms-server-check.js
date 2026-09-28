/*
 * rooms-server-check.js: a running rooms server, over real sockets.
 *
 *   node scripts/rooms-server-check.js                 (npm run rooms:server)
 *   node scripts/rooms-server-check.js http://127.0.0.1:8797
 *   node scripts/rooms-server-check.js https://129.151.39.48
 *
 * rooms:selftest proves the room logic by calling it; this proves an
 * adapter serving it (edge/rooms/do.js on Cloudflare or under wrangler dev,
 * edge/rooms/node.js on the VM) by speaking the wire to it the way the
 * browser does: the front's routes and origin check, a private room made
 * and joined by two pilots, the keepalive, poses batched from one to the
 * other, a wreck (Phase 2) passed on and shown to a pilot who joins after,
 * the host's race track (Phase 4) kept by the room and in a later welcome,
 * quick chat (Phase 5) rebuilt from its index, a code nobody made, the text
 * rate limit, and a public room when they are open.
 *
 * With no origin it starts edge/rooms/node.js itself, on a scratch SQLite
 * file, and adds what only a process of its own can show: a restart with
 * two pilots flying, after which both reconnect into their own seats of
 * the same private room, with its race track, and the purge alarm carried
 * across the restart.
 *
 * A check against a live server makes one private room and leaves it to
 * be purged ten minutes after, like any room nobody is in.
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

import { mkdtempSync, rmSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import {
  CHAT_PRESETS, CLOSE, PROTO, TYPE_PARTS_RELAY, decodeBatch, encodeParts, encodePose,
} from '../src/share/roomwire.js';
import { TEXT_CLOSE_PER_S } from '../edge/rooms/core.js';
import { mapTrackDocument } from '../tests/lib/maptrack.js';

const given = String(process.argv[2] || '').replace(/\/+$/, '');

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

let scratch = null;
let server = null;
let origin = given;
async function startLocal() {
  const { startRooms } = await import('../edge/rooms/node.js');
  server = await startRooms({ db: join(scratch, 'rooms.db'), port: server ? server.port : 0 });
  origin = `http://127.0.0.1:${server.port}`;
}
if (!given) {
  scratch = mkdtempSync(join(tmpdir(), 'fdfpv-rooms-'));
  await startLocal();
}
const wsOrigin = () => origin.replace(/^http/, 'ws');

/* A pilot's socket that keeps everything it is sent. */
function pilot(path, headers = {}) {
  const ws = new WebSocket(`${wsOrigin()}/v2/${path}`, { headers });
  const p = { ws, got: [], closed: null, refused: null };
  ws.binaryType = 'nodebuffer';
  ws.on('message', (data, binary) => {
    p.got.push(binary ? new Uint8Array(data) : (data.toString() === 'pong' ? 'pong' : JSON.parse(data.toString())));
  });
  ws.on('close', (code, reason) => {
    p.closed = { code, reason: reason.toString() };
  });
  ws.on('unexpected-response', (req, res) => {
    p.refused = res.statusCode;
    p.closed = { code: 0, reason: 'refused' };
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
  p.text = (type) => p.got.filter((m) => m && m.type === type);
  p.say = (msg) => ws.send(JSON.stringify(msg));
  return p;
}

const profile = { airframe: 'cub1400', map: 'swiss2', figure: 3, livery: { scheme: 'sport' }, parts: { prop: 'stock', addons: [] } };
async function seat(path, extra = {}) {
  const p = pilot(path);
  await p.open;
  p.say({ type: 'hello', proto: PROTO, build: 'check', name: [1, 2, 42], profile, ...extra });
  p.welcome = await p.until((x) => x.text('welcome')[0] || x.closed);
  p.clockAt = Date.now();
  return p;
}
const roomMsOf = (p) => p.welcome.roomMs + (Date.now() - p.clockAt);
const pose = (p, x = 10) => encodePose({
  flags: 0, seq: 1, t: roomMsOf(p), px: x, py: 300, pz: 5, qx: 0, qy: 0, qz: 0, qw: 1,
  vx: 1, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, c0: 0, c1: 0, c2: 0, c3: 0, motor: 0, flaps: 0,
});

console.log(`rooms server at ${origin}${given ? '' : ' (edge/rooms/node.js, started here)'}`);

console.log('the front');
let res = await fetch(`${origin}/`);
check('GET / says what it is', res.status === 200 && /fdfpv rooms/.test(await res.text()));
res = await fetch(`${origin}/v2/create`, { method: 'POST', headers: { origin: 'https://evil.example' }, body: '{"map":"swiss2"}' });
check('a page on another site is refused', res.status === 403);
res = await fetch(`${origin}/v2/create`, { method: 'OPTIONS', headers: { origin: 'https://fdflabs.github.io' } });
check('the simulator\'s origin gets its CORS answer', res.status === 204 && res.headers.get('access-control-allow-origin') === 'https://fdflabs.github.io');
res = await fetch(`${origin}/v2/create`, { method: 'POST', headers: { origin: 'https://fdflabs.github.io' }, body: 'not json' });
check('a create that is not JSON is refused', res.status === 400);
res = await fetch(`${origin}/v2/create`, { method: 'POST', headers: { origin: 'https://fdflabs.github.io' }, body: JSON.stringify({ map: 'swiss2' }) });
const { code } = await res.json();
check('a private room is made', res.status === 200 && /^[A-Z0-9]{6}$/.test(code), code);
check('with CORS for the page', res.headers.get('access-control-allow-origin') === 'https://fdflabs.github.io');
const evil = pilot(`room/${code}`, { origin: 'https://evil.example' });
await evil.until((x) => x.closed);
check('a socket from another site is refused', evil.refused === 403, `${evil.refused}`);

console.log('two pilots');
const a = await seat(`room/${code}`, {});
check('the first pilot is seated as the host', a.welcome.seat === 1 && a.welcome.host === 1 && a.welcome.code === code, JSON.stringify(a.welcome));
const b = await seat(`room/${code}`, { name: [3, 4, 77] });
check('the second is seated beside them', b.welcome.seat === 2 && b.welcome.peers.length === 1 && b.welcome.peers[0].seat === 1);
check('and the first is told', Boolean(await a.until((x) => x.text('join').find((m) => m.seat === 2))));
a.ws.send('ping');
check('the keepalive is answered', Boolean(await a.until((x) => x.got.includes('pong'))));
a.ws.send(pose(a));
const batch = await b.until((x) => x.got.find((m) => m instanceof Uint8Array && decodeBatch(m)));
const decoded = batch ? decodeBatch(batch) : null;
check('a pose reaches the other pilot in a batch', decoded && decoded.poses.length === 1 && decoded.poses[0].seat === 1);

console.log('a race track (Phase 4), a wreck (Phase 2) and quick chat (Phase 5)');
const raceDoc = mapTrackDocument({ id: 'trk-check001', name: 'Server check', types: ['gate', 'hoop30', 'gate'], radius: 60 });
a.say({ type: 'track', doc: raceDoc });
check('the host\'s track reaches the other pilot', Boolean(await b.until((x) => x.got.find((m) => m && m.track && m.track.id === raceDoc.id))));
const table = [
  { kind: 0, parent: -1, cg: [0, 0, 0], boxMin: [-0.3, -0.1, -0.1], boxMax: [0.3, 0.1, 0.1] },
  { kind: 2, parent: 0, cg: [0, 0.5, 0], boxMin: [-0.1, -0.2, -0.02], boxMax: [0.1, 0.2, 0.02] },
];
a.say({ type: 'event', kind: 'crash', table });
check('a crash is passed on', Boolean(await b.until((x) => x.text('event').find((m) => m.kind === 'crash' && m.seat === 1))));
a.ws.send(encodeParts(roomMsOf(a), [{ part: 1, x: 10, y: 300, z: 5, qx: 0, qy: 0, qz: 0, qw: 1 }]));
check('and its pieces, relayed with the seat', Boolean(await b.until((x) => x.got.find((m) => m instanceof Uint8Array && m[0] === TYPE_PARTS_RELAY))));
const c = await seat(`room/${code}`, { name: [5, 6, 12] });
check('a pilot who joins after is welcomed with the race track', c.welcome.track && c.welcome.track.id === raceDoc.id && c.welcome.track.gates === 3);
check('and sees the wreck where it lies', Boolean(await c.until((x) => x.text('event').find((m) => m.kind === 'crash' && m.seat === 1)))
  && Boolean(await c.until((x) => x.got.find((m) => m instanceof Uint8Array && m[0] === TYPE_PARTS_RELAY))));
a.say({ type: 'event', kind: 'chat', id: 1 });
const chat = await b.until((x) => x.text('event').find((m) => m.kind === 'chat'));
check('quick chat is rebuilt from its index', chat && chat.id === 1 && chat.seat === 1 && CHAT_PRESETS[chat.id] && !('text' in chat));
c.ws.close(1000);
await sleep(200);

console.log('refusals');
const nobody = pilot('room/BCDFGH');
await nobody.open;
nobody.say({ type: 'hello', proto: PROTO, build: 'check', name: [1, 2, 3], profile });
await nobody.until((x) => x.closed);
check('a code nobody made is answered nosuch', nobody.closed && nobody.closed.code === CLOSE.nosuch, JSON.stringify(nobody.closed));
const flood = pilot(`room/${code}`);
await flood.open;
for (let i = 0; i <= TEXT_CLOSE_PER_S; i += 1) {
  flood.say({ type: 'nothing' });
}
await flood.until((x) => x.closed);
check('a text flood is closed for its rate', flood.closed && flood.closed.code === CLOSE.rate, JSON.stringify(flood.closed));

console.log('public rooms');
res = await fetch(`${origin}/v2/public`);
const pub = await res.json();
if (pub.open) {
  const p = await seat('public/swiss2');
  check('a public room seats a pilot', p.welcome && p.welcome.public === true && Number.isInteger(p.welcome.shard) && p.welcome.cap === 16, JSON.stringify(p.welcome));
  p.ws.close(1000);
} else {
  check('public rooms say they are closed', pub.open === false && pub.cap === 16);
}

/* A raw request on its own connection: the first line of the answer. */
function raw(text) {
  return new Promise((resolve) => {
    const u = new URL(origin);
    const sock = connect(Number(u.port), u.hostname, () => sock.end(text));
    let got = '';
    sock.on('data', (d) => {
      got += d;
    });
    sock.on('close', () => resolve(got.split('\r\n')[0]));
    sock.on('error', () => resolve(''));
  });
}

if (server) {
  console.log('malformed requests (edge/rooms/node.js)');
  const plain = await raw('GET / HTTP/1.1\r\nHost: a b\r\nConnection: close\r\n\r\n');
  const upgrade = await raw('GET /v2/room/BCDFGH HTTP/1.1\r\nHost: [x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
    + 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n');
  res = await fetch(`${origin}/`);
  check('a Host no URL can hold is answered, not thrown', /^HTTP\/1\.1 [45]\d\d/.test(plain), plain);
  check('and on an upgrade too', upgrade === '' || /^HTTP\/1\.1 [45]\d\d/.test(upgrade), upgrade);
  check('and the server is still up', res.status === 200);

  console.log('a restart with two pilots flying (edge/rooms/node.js)');
  const seats = { a: a.welcome, b: b.welcome };
  await server.stop();
  await a.until((x) => x.closed);
  await b.until((x) => x.closed);
  check('the pilots are told the service is restarting', a.closed.code === 1012 && b.closed.code === 1012, `${a.closed.code} ${b.closed.code}`);
  await startLocal();
  const objects = server.env.ROOMS.objects;
  check('the stored room is back with its purge alarm', objects.has(`prv:${code}`) && objects.get(`prv:${code}`).alarmTimer !== null);
  /* Reconnect as src/share/rooms.js does: its token and its seat. */
  const b2 = await seat(`room/${code}`, { name: [3, 4, 77], token: seats.b.token, seat: seats.b.seat });
  const a2 = await seat(`room/${code}`, { token: seats.a.token, seat: seats.a.seat });
  check('the second pilot is back in seat 2, though it came back first', b2.welcome && b2.welcome.seat === 2 && b2.welcome.code === code, JSON.stringify(b2.welcome));
  check('and the first in seat 1, with the same tokens', a2.welcome && a2.welcome.seat === 1 && a2.welcome.token === seats.a.token && b2.welcome.token === seats.b.token);
  a2.ws.send(pose(a2, 20));
  check('the room kept its race track across the restart', a2.welcome.track && a2.welcome.track.id === raceDoc.id, JSON.stringify(a2.welcome.track && a2.welcome.track.id));
  check('and they see each other fly again', Boolean(await b2.until((x) => x.got.find((m) => m instanceof Uint8Array && decodeBatch(m)))));
  await server.stop();
  rmSync(scratch, { recursive: true, force: true });
} else {
  for (const p of [a, b]) {
    p.ws.close(1000);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
