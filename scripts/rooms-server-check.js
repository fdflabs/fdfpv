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
 * rate limit, and, when public rooms are open, the room browser: a named
 * public room made and listed, a bad name refused, a private room never
 * listed, and a quick join. A room made for the war: one off the war's
 * map and a mission on another map refused; a private Itaipu one made for
 * mission 2 says so in its welcome, and once its host has started mission
 * 3 a later welcome says mission 3; a build that would not ask the war's
 * consent is closed for a reload instead of seated. A public one (the
 * owner opened the war to public rooms, 2026-10-01): listed as the war's
 * with its mission, a quick join on its world never handed it, and a
 * public room not made for the war still refuses the war.
 * The host sets the private room up for Catch the Ace in place: both
 * pilots told, the code and the pilots the same, a later welcome saying
 * so; refused to the other pilot, and refused while a combat round is on.
 *
 * With no origin it starts edge/rooms/node.js itself, on a scratch SQLite
 * file, and adds what only a process of its own can show: a restart with
 * two pilots flying, after which both reconnect into their own seats of
 * the same private room, with its race track, and the purge alarm carried
 * across the restart, and the public room listed again straight after it.
 *
 * A check against a live server makes one private room and leaves it to
 * be purged five minutes after, like any room nobody is in.
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
import { Socket, connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import {
  CHAT_PRESETS, CLOSE, PROTO, TYPE_PARTS_RELAY, WAR_JOIN, decodeBatch, encodeParts, encodePose,
} from '../src/share/roomwire.js';
import { ABANDON_MS, TEXT_CLOSE_PER_S } from '../edge/rooms/core.js';
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

/* The admin route's secret: this check's own when it starts the server,
 * else ADMIN_SECRET for a live one (without it only the refusal is
 * checked). */
const adminSecret = given ? (process.env.ADMIN_SECRET || '') : 'rooms-server-check-secret';
let scratch = null;
let server = null;
let origin = given;
async function startLocal() {
  const { startRooms } = await import('../edge/rooms/node.js');
  server = await startRooms({ db: join(scratch, 'rooms.db'), port: server ? server.port : 0, adminSecret });
  origin = `http://127.0.0.1:${server.port}`;
}
/*
 * The writes the server started here hands its TCP sockets to send, each
 * one a syscall. edge/rooms/node.js corks a socket for the rest of the
 * turn when it sends on it (Conn.send), so everything one turn sends a
 * pilot goes out in one write, which holds only while ws writes its frames
 * to that same socket. Counted round a join below, so a ws release that
 * writes somewhere else fails here instead of quietly costing a syscall a
 * frame.
 */
let serverFlushes = 0;
if (!given) {
  for (const method of ['_write', '_writev']) {
    const flush = Socket.prototype[method];
    Socket.prototype[method] = function countedFlush(...args) {
      if (server && this.localPort === server.port) {
        serverFlushes += 1;
      }
      return flush.apply(this, args);
    };
  }
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
res = await fetch(`${origin}/v2/version`);
const version = res.status === 200 ? await res.json() : null;
check(given ? 'GET /v2/version names the commit it runs, or none' : 'GET /v2/version: a checkout has no REVISION, so no commit',
  version && typeof version.dirty === 'boolean' && (given ? version.commit === null || /^[0-9a-f]{40}$/.test(version.commit) : version.commit === null),
  JSON.stringify(version));
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

console.log('the admin counters (Phase 6)');
res = await fetch(`${origin}/v2/admin/health`);
check('the counters are refused without the admin secret', res.status === 401 || res.status === 404, `${res.status}`);
if (adminSecret) {
  let health = null;
  for (let k = 0; k < 30 && !(health && health.pilots >= 2); k += 1) {
    a.ws.send(pose(a));
    await sleep(100);
    res = await fetch(`${origin}/v2/admin/health`, { headers: { authorization: `Bearer ${adminSecret}` } });
    health = res.ok ? await res.json() : null;
  }
  check('with it: the two pilots, their room, and what the server is costing', health && health.pilots >= 2 && health.rooms >= 1
    && health.now && Number.isFinite(health.now.cpu) && Number.isFinite(health.now.lagP99Ms) && health.memory.rss > 0 && health.busy === false,
  JSON.stringify(health && { pilots: health.pilots, rooms: health.rooms, now: health.now }));
  check('and a private room is listed without its code', health && health.perRoom.length >= 1 && health.perRoom.every((r) => r.room !== code));
}

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
const c = pilot(`room/${code}`);
await c.open;
await sleep(100);
const gotBefore = a.got.length + b.got.length;
serverFlushes = 0;
c.say({ type: 'hello', proto: PROTO, build: 'check', name: [5, 6, 12], profile });
c.welcome = await c.until((x) => x.text('welcome')[0] || x.closed);
c.clockAt = Date.now();
check('a pilot who joins after is welcomed with the race track', c.welcome.track && c.welcome.track.id === raceDoc.id && c.welcome.track.gates === 3);
check('and sees the wreck where it lies', Boolean(await c.until((x) => x.text('event').find((m) => m.kind === 'crash' && m.seat === 1)))
  && Boolean(await c.until((x) => x.got.find((m) => m instanceof Uint8Array && m[0] === TYPE_PARTS_RELAY))));
if (!given) {
  await a.until((x) => x.text('join').find((m) => m.seat === c.welcome.seat));
  await b.until((x) => x.text('join').find((m) => m.seat === c.welcome.seat));
  const sent = c.got.length + a.got.length + b.got.length - gotBefore;
  check('the join\'s messages left each socket in one write, not one write a message', sent >= 5 && serverFlushes < sent,
    `${sent} messages in ${serverFlushes} writes`);
}
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

console.log('public rooms and the room browser');
res = await fetch(`${origin}/v2/public`);
const pub = await res.json();
const make = (body) => fetch(`${origin}/v2/create`, { method: 'POST', headers: { origin: 'https://fdflabs.github.io' }, body: JSON.stringify(body) });
const listed = async () => (await (await fetch(`${origin}/v2/rooms`)).json());
let publicCode = null;
if (pub.open) {
  res = await make({ map: 'swiss2', public: true, name: ' Server  check ' });
  publicCode = (await res.json()).code;
  check('a named public room is made', res.status === 200 && /^[A-Z0-9]{6}$/.test(publicCode));
  let rooms = await listed();
  const line = rooms.rooms.find((r) => r.code === publicCode);
  check('the browser lists it with its name, before anybody joins', rooms.open === true && line && line.name === 'Server check' && line.n === 0, JSON.stringify(line));
  check('and not the private room, which has pilots in it', !rooms.rooms.some((r) => r.code === code));
  res = await make({ map: 'swiss2', public: true, name: 'fuck this' });
  check('a name the word filter refuses is refused', res.status === 400 && (await res.json()).error === 'name');
  const p = await seat(`room/${publicCode}`);
  check('a pilot joins it by its code', p.welcome && p.welcome.public === true && p.welcome.code === publicCode && p.welcome.name === 'Server check' && p.welcome.cap === 16, JSON.stringify(p.welcome));
  const q = await seat('public/swiss2', { name: [2, 3, 44] });
  check('a quick join on its world lands in the busiest room there', q.welcome && q.welcome.code === publicCode, JSON.stringify(q.welcome && q.welcome.code));
  rooms = await listed();
  check('and the list, read at once, counts both', rooms.rooms.find((r) => r.code === publicCode).n === 2);
  p.ws.close(1000);
  q.ws.close(1000);
} else {
  check('public rooms say they are closed', pub.open === false && pub.cap === 16);
}

console.log('a room made for the war');
/* The front makes CREATES_PER_MIN rooms a minute for an address (front.js),
 * and the checks above used this minute's. */
await sleep(61000);
check('the private room made for nothing says no game and no mission', a.welcome.mode === null && a.welcome.mission === null,
  JSON.stringify({ mode: a.welcome.mode, mission: a.welcome.mission }));
res = await make({ map: 'swiss2', mode: 'war' });
check('a war room off the war\'s map is refused', res.status === 400 && (await res.json()).error === 'bad');
res = await make({ map: 'itaipu', mode: 'war', mission: 'nowhere-1' });
check('a mission nobody wrote is refused', res.status === 400 && (await res.json()).error === 'bad');
res = await make({ map: 'swiss2', mission: 'itaipu-1' });
check('a mission for a room not made for the war is refused', res.status === 400 && (await res.json()).error === 'bad');
res = await make({ map: 'itaipu', mode: 'war', mission: 'itaipu-2' });
const warCode = (await res.json()).code;
check('a private Itaipu room made for mission 2', res.status === 200 && /^[A-Z0-9]{6}$/.test(warCode || ''), warCode);
/* A room the server would not make has nothing to seat in. */
if (warCode) {
  const unasked = await seat(`room/${warCode}`);
  check('a build that would not ask the consent is told to reload, not seated', Boolean(unasked.closed) && unasked.closed.code === CLOSE.update,
    JSON.stringify(unasked.closed));
  const w1 = await seat(`room/${warCode}`, { war: WAR_JOIN });
  check('its welcome says war, mission 2', w1.welcome && w1.welcome.mode === 'war' && w1.welcome.mission === 'itaipu-2',
    JSON.stringify(w1.welcome && { mode: w1.welcome.mode, mission: w1.welcome.mission }));
  w1.say({ type: 'war', op: 'start', mission: 'itaipu-3' });
  check('its host starts mission 3', Boolean(await w1.until((x) => x.text('war').find((m) => m.war && m.war.mission === 'itaipu-3'))));
  w1.say({ type: 'war', op: 'end' });
  await w1.until((x) => x.text('war').find((m) => m.war && m.war.state === 'ended'));
  const w2 = await seat(`room/${warCode}`, { name: [3, 4, 55], war: WAR_JOIN });
  check('a later welcome says mission 3', w2.welcome && w2.welcome.mode === 'war' && w2.welcome.mission === 'itaipu-3',
    JSON.stringify(w2.welcome && { mode: w2.welcome.mode, mission: w2.welcome.mission }));
  w1.ws.close(1000);
  w2.ws.close(1000);
}

console.log('the host sets the room up in place');
check('a welcome says the room takes the setup message', a.welcome.setup === true, String(a.welcome.setup));
a.say({ type: 'setup', mode: 'tag' });
const toldA = await a.until((x) => x.text('setup').find((m) => m.mode === 'tag'));
const toldB = await b.until((x) => x.text('setup').find((m) => m.mode === 'tag'));
check('the host sets it up for Catch the Ace: both pilots are told', Boolean(toldA && toldB), JSON.stringify(toldB));
b.say({ type: 'setup', mode: 'combat' });
check('the other pilot may not', Boolean(await b.until((x) => x.text('refused').find((m) => m.why === 'host'))));
const third = await seat(`room/${code}`, { name: [4, 5, 66] });
check('a later welcome: the same room, set up for Catch the Ace', third.welcome && third.welcome.code === code && third.welcome.mode === 'tag' && third.welcome.peers.length === 2,
  JSON.stringify(third.welcome && { code: third.welcome.code, mode: third.welcome.mode, peers: third.welcome.peers.length }));
third.ws.close(1000);
a.say({ type: 'combat', op: 'start', minutes: 3 });
await a.until((x) => x.text('combat').length > 0);
a.say({ type: 'setup', mode: null });
check('not while a game is on', Boolean(await a.until((x) => x.text('refused').find((m) => m.why === 'combat'))), JSON.stringify(a.text('refused')));
a.say({ type: 'combat', op: 'stop' });
await sleep(300);

if (pub.open) {
  console.log('a public room made for the war');
  /* Another minute: the five above. */
  await sleep(61000);
  res = await make({ map: 'itaipu', public: true, mode: 'war', mission: 'itaipu-2', name: 'Server check war' });
  const pubWar = (await res.json()).code;
  check('a public Itaipu room made for the war is made', res.status === 200 && /^[A-Z0-9]{6}$/.test(pubWar || ''), pubWar);
  const warLine = (await listed()).rooms.find((r) => r.code === pubWar);
  check('the browser lists it as the war\'s, with its mission', warLine && warLine.mode === 'war' && warLine.game === 'war' && warLine.mission === 'itaipu-2',
    JSON.stringify(warLine));
  const pw = await seat(`room/${pubWar}`, { war: WAR_JOIN });
  const quick = await seat('public/itaipu', { name: [2, 5, 31] });
  check('a quick join on Itaipu is never handed it', quick.welcome && quick.welcome.code && quick.welcome.code !== pubWar && quick.welcome.mode !== 'war',
    JSON.stringify(quick.welcome && { code: quick.welcome.code, mode: quick.welcome.mode }));
  quick.say({ type: 'war', op: 'start', mission: 'itaipu-1' });
  check('and the public room it lands in, not made for the war, refuses the war', Boolean(await quick.until((x) => x.text('refused').find((m) => m.why === 'private'))),
    JSON.stringify(quick.text('refused')));
  pw.say({ type: 'war', op: 'start', mission: 'itaipu-2' });
  check('the public war room\'s host starts mission 2 there', Boolean(await pw.until((x) => x.text('war').find((m) => m.war && m.war.mission === 'itaipu-2' && m.war.state !== 'lobby'))));
  pw.say({ type: 'war', op: 'end' });
  pw.ws.close(1000);
  quick.ws.close(1000);
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
  /* A Catch the Ace match on, to come back with them. */
  a.say({ type: 'tag', op: 'start', goal: 90 });
  check('the host starts a Catch the Ace match', Boolean(await b.until((x) => x.text('tag').find((m) => m.tag && m.tag.state === 'countdown'))));
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
  /* The host across the restart: B came back first and acted for A; A
   * back is the host again, and B is told. */
  check('B, back first, was told it acts as host while A was away', b2.welcome.host === 2, `${b2.welcome.host}`);
  check('A back is the host again, in its welcome and to B', a2.welcome.host === 1
    && Boolean(await b2.until((x) => x.text('host').find((m) => m.seat === 1))));
  b2.say({ type: 'combat', op: 'start', minutes: 5 });
  check('so B\'s combat start is refused, and B is told why: host', Boolean(await b2.until((x) => x.text('refused').find((m) => m.why === 'host'))));
  a2.say({ type: 'combat', op: 'start', minutes: 5 });
  check('A\'s is refused while the match its two players came back to runs: tag', Boolean(await a2.until((x) => x.text('refused').find((m) => m.why === 'tag'))));
  /* The host hands the room to B and B hands it back, each told. */
  a2.say({ type: 'handhost', seat: 2 });
  check('A hands the room to B: B is told it is the host', Boolean(await b2.until((x) => x.text('host').at(-1)?.seat === 2)));
  b2.say({ type: 'handhost', seat: 1 });
  check('and B hands it back: A is told', Boolean(await a2.until((x) => x.text('host').at(-1)?.seat === 1)));
  /* B leaves for good: the match has one player, and the room ends it by
   * itself after ABANDON_MS, with nobody flying to drive the clock. */
  b2.ws.close(1000);
  const ended = await a2.until((x) => x.text('tag').find((m) => m.tag && m.tag.state === 'results'), ABANDON_MS + 5000);
  check(`the match left with one player ends by itself after ${ABANDON_MS / 1000} s`, Boolean(ended) && ended.tag.winner === null);
  a2.say({ type: 'combat', op: 'start', minutes: 5 });
  check('and then the host\'s combat round starts', Boolean(await a2.until((x) => x.text('combat').find((m) => m.state === 'countdown'))));
  if (publicCode) {
    const again = await listed();
    check('the public room is back in the browser though nobody has come back to it', again.rooms.some((r) => r.code === publicCode), JSON.stringify(again));
  }
  await server.stop();
  rmSync(scratch, { recursive: true, force: true });
} else {
  for (const p of [a, b]) {
    p.ws.close(1000);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
