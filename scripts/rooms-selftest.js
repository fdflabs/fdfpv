/*
 * rooms-selftest.js: the rooms' wire and one room's logic, in plain Node,
 * with no Cloudflare in the loop. Run with npm run rooms:selftest.
 *
 * It drives edge/rooms/core.js the way edge/rooms/do.js does, with fake
 * sockets that record what the room sent them: joining, the welcome, the
 * cap, seats, a reconnect with a token, a hibernation (a fresh core from
 * the sockets' attachments), the version refusal, the rate limits, a
 * host's kick, and the batches. Then the peer track the browser draws
 * from (src/game/peer.js) and the name and figure tables the wire counts.
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
  CLOSE, FLAG_QUAD, FLAG_SMOKE, POSE_BYTES, PROTO, PROFILE_MAX_BYTES, NAME_ADJECTIVES, NAME_ANIMALS,
  checkProfile, codeFromBytes, decodeBatch, decodePose, encodeBatch, encodePose, normaliseCode, validNamePick,
} from '../src/share/roomwire.js';
import { PeerTrack, DELAY_MS, EXTRAP_MAX_MS, STALE_MS, nearWeight } from '../src/game/peer.js';
import { SLOT_RIGHT_M, slotSpawn, stationFor } from '../src/game/slots.js';
import en from '../src/strings/en.js';
import es from '../src/strings/es.js';
import {
  TYPE_PARTS_RELAY, decodePartsRelay, encodeParts,
} from '../src/share/roomwire.js';
import { PARTS_PER_S } from '../edge/rooms/wrecks.js';
import { RoomCore, KICK_MS, PRIVATE_CAP, POSE_PER_S, TEXT_PER_S, TEXT_CLOSE_PER_S, JOINS_PER_MIN } from '../edge/rooms/core.js';

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

console.log('wire');
const pose = {
  flags: FLAG_SMOKE, seq: 65535, t: 123456, px: 12.5, py: 301.25, pz: -4000.5,
  qx: 0, qy: 0.7071, qz: 0, qw: 0.7071, vx: 31.23, vy: -2.5, vz: 0.01,
  wx: 1.234, wy: -3.2, wz: 0.001, c0: 0.2, c1: -0.2, c2: 0.05, c3: -0.8, motor: 900, flaps: 0.3,
};
const bytes = encodePose(pose);
check('a POSE is 46 bytes', bytes.length === POSE_BYTES && POSE_BYTES === 46, `${bytes.length}`);
const back = decodePose(bytes);
check('position survives as float32', Math.abs(back.px - 12.5) < 1e-6 && Math.abs(back.py - 301.25) < 1e-4 && Math.abs(back.pz + 4000.5) < 1e-3);
check('attitude to sixteen bits', Math.abs(back.qy - 0.7071) < 1e-3 && Math.abs(back.qw - 0.7071) < 1e-3);
check('velocity to a centimetre a second', Math.abs(back.vx - 31.23) < 0.006 && Math.abs(back.vy + 2.5) < 0.006);
check('body rates to a milliradian a second', Math.abs(back.wx - 1.234) < 6e-4 && Math.abs(back.wy + 3.2) < 6e-4);
check('a plane\'s surfaces to a degree', Math.abs(back.c0 - 0.2) < 0.01 && Math.abs(back.c3 + 0.8) < 0.01, `${back.c0} ${back.c3}`);
check('motor and flaps', Math.abs(back.motor - 880) <= 80 && Math.abs(back.flaps - 0.3) < 0.01, `${back.motor} ${back.flaps}`);
check('flags, sequence and time', back.flags === FLAG_SMOKE && back.seq === 65535 && back.t === 123456);
const quad = decodePose(encodePose({ ...pose, flags: FLAG_QUAD, c0: 2000, c1: 2400, c2: 0, c3: 5200 }));
check('a quad\'s rotors to 40 rad/s, clamped at the top', quad.c0 === 2000 && quad.c1 === 2400 && quad.c3 === 127 * 40, `${quad.c0} ${quad.c1} ${quad.c3}`);
check('a wrong length is nothing', decodePose(bytes.subarray(0, 45)) === null);
const batch = decodeBatch(encodeBatch(999, [{ seat: 3, pose: bytes }, { seat: 7, pose: bytes }]));
check('a batch carries each seat and its pose', batch && batch.roomMs === 999 && batch.poses.length === 2
  && batch.poses[1].seat === 7 && Math.abs(batch.poses[1].pz + 4000.5) < 1e-3);
check('a batch of one peer is 52 bytes', encodeBatch(0, [{ seat: 1, pose: bytes }]).length === 52);
check('codes: six from the alphabet', normaliseCode(' k7pz2m ') === 'K7PZ2M' && normaliseCode('K7PZ2') === null && normaliseCode('A7PZ2M') === null && normaliseCode('O7PZ2M') === null);
check('a code from random bytes is a code', normaliseCode(codeFromBytes([0, 27, 28, 255, 100, 13])) !== null);
check('picker names are three indices in range', validNamePick([0, 0, 10]) && validNamePick([NAME_ADJECTIVES - 1, NAME_ANIMALS - 1, 99])
  && !validNamePick([NAME_ADJECTIVES, 0, 10]) && !validNamePick([0, 0, 100]) && !validNamePick(['Swift', 0, 10]) && !validNamePick([0, 0]));
const profile = { airframe: 'cub1400', map: 'swiss2', figure: 3, livery: { scheme: 'sport' }, parts: { prop: 'stock', addons: ['smoke'] } };
check('a profile passes', checkProfile(profile) !== null);
check('a profile with free text in an id does not', checkProfile({ ...profile, airframe: 'hello there' }) === null);
check('nor one too large', checkProfile({ ...profile, livery: { blob: 'x'.repeat(PROFILE_MAX_BYTES) } }) === null);
check('nor one with an unknown figure', checkProfile({ ...profile, figure: 12 }) === null);

console.log('a room');
let tokens = 0;
const newToken = () => {
  tokens += 1;
  return tokens.toString(16).padStart(32, '0');
};
let now = 1_000_000;
const meta = { code: 'K7PZ2M', cap: PRIVATE_CAP, friendly: false, map: 'swiss2', epoch: now - 5000 };
let room = new RoomCore(meta);

function sock(name, address = '10.0.0.1') {
  return { name, address, got: [], closed: null, attachment: null };
}
/* Apply a room's actions to the fake sockets, as do.js does. */
let ticks = 0;
let empties = 0;
function run(actions) {
  for (const a of actions) {
    if (a.send) {
      a.send.got.push(typeof a.data === 'string' ? JSON.parse(a.data) : a.data);
    } else if (a.close) {
      a.close.closed = { code: a.code, reason: a.reason };
    } else if (a.attach) {
      a.attach.attachment = a.value;
    } else if (a.tick) {
      ticks += 1;
    } else if (a.empty) {
      empties += 1;
    }
  }
  return actions;
}
function hello(s, extra = {}) {
  run(room.open(s, now));
  return run(room.message(s, JSON.stringify({ type: 'hello', proto: PROTO, build: 'test', name: [1, 2, 42], profile, ...extra }), now, s.address, newToken));
}
const texts = (s, type) => s.got.filter((m) => m && m.type === type);

const old = sock('old');
hello(old, { proto: 1 });
check('an old client is told to update', old.closed && old.closed.code === CLOSE.update && old.closed.reason === 'update');

const a = sock('a');
hello(a);
const wa = texts(a, 'welcome')[0];
check('the first pilot gets seat 1 and is the host', wa && wa.seat === 1 && wa.host === 1 && wa.peers.length === 0);
check('with a 128 bit token and the room clock', wa && /^[0-9a-f]{32}$/.test(wa.token) && wa.roomMs === 5000);
check('and the room\'s map, code and cap', wa && wa.map === 'swiss2' && wa.code === 'K7PZ2M' && wa.cap === 8 && wa.friendly === false);
check('the seat is attached to the socket', a.attachment && a.attachment.seat === 1 && a.attachment.token === wa.token);
now += 10;
const b = sock('b', '10.0.0.2');
hello(b, { name: [3, 4, 77] });
const wb = texts(b, 'welcome')[0];
check('the second gets seat 2 and sees the first', wb && wb.seat === 2 && wb.peers.length === 1 && wb.peers[0].seat === 1 && wb.peers[0].profile.airframe === 'cub1400');
check('and the first is told', texts(a, 'join').some((m) => m.seat === 2 && m.name[2] === 77));
const bad = sock('bad', '10.0.0.3');
hello(bad, { name: ['Rude', 2, 42] });
check('a typed name is refused', bad.closed && bad.closed.code === CLOSE.bad);

console.log('poses and batches');
ticks = 0;
run(room.message(a, encodePose({ ...pose, t: 5100 }), now));
check('a pose starts the tick', ticks === 1);
run(room.message(a, encodePose({ ...pose, t: 5133 }), now));
check('and a second does not start another', ticks === 1);
const before = b.got.length;
now += 33;
run(room.tick(now));
const got = b.got.slice(before).filter((m) => m instanceof Uint8Array);
const dec = got.length ? decodeBatch(got[0]) : null;
check('the tick sends the other pilot one batch with the newest pose', got.length === 1 && dec.poses.length === 1 && dec.poses[0].seat === 1 && dec.poses[0].t === 5133);
check('and the sender nothing of its own', !a.got.some((m) => m instanceof Uint8Array));
ticks = 0;
now += 33;
run(room.tick(now));
check('a tick with nothing new stops ticking', ticks === 0 && room.ticking === false);
run(room.message(b, encodePose(pose), now));
check('the next pose starts it again', ticks === 1);
now += 1000;
room.tick(now);
let stored = 0;
for (let i = 0; i < 40; i += 1) {
  const p = encodePose({ ...pose, seq: i });
  room.message(a, p, now);
  if (room.seats.get(a).pose === p) {
    stored += 1;
  }
}
check(`poses over ${POSE_PER_S} a second are dropped`, stored === POSE_PER_S, `${stored}`);

console.log('text');
now += 1000;
run(room.message(a, JSON.stringify({ type: 't', c: 12.5 }), now));
const t = texts(a, 't')[0];
check('a clock ping comes back with the room time', t && t.c === 12.5 && t.s === now - meta.epoch);
let answered = 0;
for (let i = 0; i < 10; i += 1) {
  const n = a.got.length;
  run(room.message(a, JSON.stringify({ type: 't', c: i }), now));
  answered += a.got.length - n;
}
check(`text over ${TEXT_PER_S} a second is dropped`, answered === TEXT_PER_S - 1, `${answered}`);
for (let i = 0; i < TEXT_CLOSE_PER_S; i += 1) {
  run(room.message(a, JSON.stringify({ type: 't', c: i }), now));
}
check(`over ${TEXT_CLOSE_PER_S} a second closes the socket`, a.closed && a.closed.code === CLOSE.rate);
run(room.close(a, now));
check('and the others are told', texts(b, 'leave').some((m) => m.seat === 1));

console.log('reconnect');
now += 2000;
const a2 = sock('a2');
hello(a2, { token: wa.token });
const wa2 = texts(a2, 'welcome')[0];
check('a token takes its seat back after a drop', wa2 && wa2.seat === 1 && wa2.token === wa.token);
check('and is still the host, a dropped socket costs nobody the room', wa2 && wa2.host === 1);
const c = sock('c', '10.0.0.4');
hello(c);
const wc = texts(c, 'welcome')[0];
check('a newcomer gets the lowest free seat', wc && wc.seat === 3 && wc.peers.length === 2);
const b2 = sock('b2', '10.0.0.2');
hello(b2, { token: wb.token });
check('a token whose socket is still open replaces it', b.closed && b.closed.code === CLOSE.replaced && texts(b2, 'welcome')[0].seat === 2);

const r3 = new RoomCore(meta);
const saved = room;
room = r3;
const other = sock('other', '10.3.0.1');
hello(other);
const back5 = sock('back5', '10.3.0.2');
hello(back5, { token: 'f'.repeat(32), seat: 5 });
check('after a restart a known seat is given back to a token the room forgot', texts(back5, 'welcome')[0].seat === 5);
const noToken = sock('notoken', '10.3.0.3');
hello(noToken, { seat: 6 });
check('but not to a newcomer naming one', texts(noToken, 'welcome')[0].seat === 2);
room = saved;

console.log('hibernation');
const conns = [a2, b2, c].map((s) => ({ conn: s, attachment: s.attachment }));
room = new RoomCore(meta);
room.restore(conns);
check('a fresh core from the attachments has the same seats', [...room.seats.values()].map((s) => s.seat).sort().join() === '1,2,3');
check('and the same host', room.host() === 1);
ticks = 0;
run(room.message(c, encodePose(pose), now));
const nb = b2.got.length;
now += 33;
run(room.tick(now));
check('and relays poses as before', ticks >= 1 && b2.got.slice(nb).some((m) => m instanceof Uint8Array && decodeBatch(m).poses[0].seat === 3));

console.log('the cap');
const extra = [];
for (let i = 0; i < PRIVATE_CAP; i += 1) {
  const s = sock(`x${i}`, `10.1.0.${i}`);
  hello(s);
  extra.push(s);
}
const seated = extra.filter((s) => texts(s, 'welcome').length);
check(`a private room holds ${PRIVATE_CAP}`, room.seats.size === PRIVATE_CAP && seated.length === PRIVATE_CAP - 3);
check('the next is told it is full', extra.slice(PRIVATE_CAP - 3).every((s) => s.closed && s.closed.code === CLOSE.full));
const seats = [...room.seats.values()].map((s) => s.seat).sort((x, y) => x - y);
check('every seat is distinct, 1 to 8, so every pilot has a slot of its own', seats.join() === '1,2,3,4,5,6,7,8', seats.join());

console.log('kicks');
const victim = extra[0];
const vw = texts(victim, 'welcome')[0];
run(room.message(c, JSON.stringify({ type: 'kick', seat: vw.seat }), now));
check('only the host can kick', !victim.closed);
now += 1000;
run(room.message(a2, JSON.stringify({ type: 'kick', seat: vw.seat }), now));
check('the host kicks', victim.closed && victim.closed.code === CLOSE.kicked);
check('and the others see them leave', texts(c, 'leave').some((m) => m.seat === vw.seat));
const again = sock('again', victim.address);
hello(again, { token: vw.token });
check('back with the same token is refused', again.closed && again.closed.code === CLOSE.kicked);
const fresh = sock('fresh', victim.address);
hello(fresh);
check('back from the same address without it is refused', fresh.closed && fresh.closed.code === CLOSE.kicked);
now += KICK_MS + 1;
const later = sock('later', victim.address);
hello(later);
check('and allowed once the 30 minutes are up', !later.closed && texts(later, 'welcome').length === 1);

console.log('joins per address');
const r2 = new RoomCore({ ...meta, cap: 100 });
room = r2;
let refused = 0;
for (let i = 0; i < JOINS_PER_MIN + 2; i += 1) {
  const s = sock(`j${i}`, '10.9.9.9');
  hello(s);
  if (s.closed && s.closed.code === CLOSE.rate) {
    refused += 1;
  }
}
check(`over ${JOINS_PER_MIN} joins a minute from one address are refused`, refused === 2, `${refused}`);

console.log('leaving');
room = new RoomCore(meta);
const only = sock('only');
hello(only);
empties = 0;
run(room.message(only, JSON.stringify({ type: 'profile', profile: { ...profile, airframe: '5inch' } }), now));
check('a profile change is attached', only.attachment.profile.airframe === '5inch');
run(room.close(only, now));
check('the last one out empties the room', empties === 1 && room.seats.size === 0);

console.log('drawing a peer');
const track = new PeerTrack();
const out = { px: 0, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1 };
check('nothing yet draws nothing', track.sample(0, 0, out) === false);
/* A peer flying +x at 30 m/s, yawing at 1 rad/s about the craft's y, a
 * sample every 33 ms, each arriving 50 ms after it was taken. */
const at = (t) => {
  const half = (t / 1000) * 0.5;
  return { flags: 0, seq: 0, t, px: 30 * (t / 1000), py: 50, pz: 0, qx: 0, qy: Math.sin(half), qz: 0, qw: Math.cos(half), vx: 30, vy: 0, vz: 0, wx: 0, wy: 1, wz: 0 };
};
for (let t = 0; t <= 1000; t += 33) {
  track.push(at(t), t + 50);
}
const newestT = track.newest().t;
const nowT = newestT + 50;
track.sample(nowT, 0, out);
check(`a far peer is drawn ${DELAY_MS} ms in the past`, Math.abs(out.px - 30 * ((nowT - DELAY_MS) / 1000)) < 0.01, `${out.px.toFixed(3)}`);
track.sample(nowT, 1, out);
check('a near peer is drawn in the present', Math.abs(out.px - 30 * (nowT / 1000)) < 0.01, `${out.px.toFixed(3)} for ${(30 * nowT / 1000).toFixed(3)}`);
check('turned by its body rate to the present', Math.abs(out.qy - Math.sin((nowT / 1000) * 0.5)) < 1e-3, `${out.qy.toFixed(4)}`);
track.sample(newestT + 2000 - 60, 1, out);
check(`extrapolation stops at ${EXTRAP_MAX_MS} ms`, Math.abs(out.px - 30 * ((newestT + EXTRAP_MAX_MS) / 1000)) < 0.01, `${out.px.toFixed(3)}`);
check(`nothing for ${STALE_MS} ms is not drawn`, track.sample(newestT + 50 + STALE_MS + 1, 1, out) === false);
check('near is 1 to 60 m, far is 0 from 100 m, linear between', nearWeight(10) === 1 && nearWeight(60) === 1 && nearWeight(80) === 0.5 && nearWeight(100) === 0 && nearWeight(500) === 0);
const before2 = track.poses.length;
track.push(at(10), 5000);
check('an old sample is dropped, never reordered', track.poses.length === before2);

console.log('slots');
const sp = { x: 10, z: 40, yaw: Math.PI / 2 };
check('slot 0 is the map\'s own spawn, the same object', slotSpawn(sp, 0) === sp);
check('out of a room there is no slot', slotSpawn(sp, -1) === sp);
const s1 = slotSpawn(sp, 1);
check('slot 1 is 8 m to the spawn\'s right: facing -x, right is -z', Math.abs(s1.x - 10) < 1e-9 && Math.abs(s1.z - 32) < 1e-9 && s1.yaw === sp.yaw, `${s1.x} ${s1.z}`);
const all = SLOT_RIGHT_M.map((_, i) => slotSpawn(sp, i));
const apart = all.every((a, i) => all.every((b, j) => i === j || Math.hypot(a.x - b.x, a.z - b.z) >= 8 - 1e-9));
check('every slot is at least 8 m from every other', apart);
const st = stationFor(sp, 0);
check('the stations are 12 m behind the row: facing -x, behind is +x', Math.abs(st.x - 22) < 1e-9, `${st.x}`);

console.log('names');
const missing = [];
for (const table of [en, es]) {
  for (let i = 0; i < NAME_ADJECTIVES; i += 1) {
    if (!table[`rooms.adj.${i}`]) {
      missing.push(`adj.${i}`);
    }
  }
  for (let i = 0; i < NAME_ANIMALS; i += 1) {
    if (!table[`rooms.animal.${i}`]) {
      missing.push(`animal.${i}`);
    }
  }
}
check(`every picker word the wire can name is in English and Spanish`, missing.length === 0, missing.join(' '));

console.log('phase 2: shared wrecks');
{
  room = new RoomCore(meta);
  const wa = sock('wa', '10.2.0.1');
  const wb = sock('wb', '10.2.0.2');
  hello(wa);
  now += 5;
  hello(wb);
  const table = [
    { kind: 0, parent: -1, cg: [0, 0, 0], boxMin: [-0.3, -0.1, -0.1], boxMax: [0.3, 0.1, 0.1] },
    { kind: 2, parent: 0, cg: [0, 0.5, 0], boxMin: [-0.1, -0.2, -0.02], boxMax: [0.1, 0.2, 0.02] },
    { kind: 2, parent: 0, cg: [0, -0.5, 0], boxMin: [-0.1, -0.2, -0.02], boxMax: [0.1, 0.2, 0.02] },
  ];
  const pieces = [{ part: 1, x: 10.5, y: 301.25, z: -40, qx: 0, qy: 0.7071, qz: 0, qw: 0.7071 }];
  const binaries = (x) => x.got.filter((m) => m instanceof Uint8Array);
  run(room.message(wa, encodeParts(100, pieces), now));
  check('parts before a crash are nothing', binaries(wb).length === 0);
  run(room.message(wa, JSON.stringify({ type: 'event', kind: 'crash', table: [{ kind: 0 }] }), now));
  check('a crash with a bad part table is not passed on', !texts(wb, 'event').length);
  now += 1000;
  run(room.message(wa, JSON.stringify({ type: 'event', kind: 'crash', table }), now));
  const ev = texts(wb, 'event').find((m) => m.kind === 'crash');
  check('a crash reaches the others with the seat and the table', ev && ev.seat === 1 && ev.table.length === 3 && ev.table[1].cg[1] === 0.5);
  check('and is kept with the seat, for a hibernation', wa.attachment.wreck && typeof wa.attachment.wreck.crash === 'string');
  run(room.message(wa, encodeParts(200, pieces), now));
  const relayed = binaries(wb).at(-1);
  const dp = relayed ? decodePartsRelay(relayed) : null;
  check('parts are relayed with the seat after the type', relayed && relayed[0] === TYPE_PARTS_RELAY && dp.seat === 1 && dp.roomMs === 200);
  check('each piece\'s world pose survives', dp && dp.pieces[0].part === 1 && Math.abs(dp.pieces[0].y - 301.25) < 1e-4 && Math.abs(dp.pieces[0].qy - 0.7071) < 1e-3);
  check('a PARTS frame is 27 bytes a piece plus 6, and the relay one more', encodeParts(0, pieces).length === 27 && relayed.length === 28);
  now += 1000;
  let sent = 0;
  for (let i = 0; i < 25; i += 1) {
    const n = binaries(wb).length;
    run(room.message(wa, encodeParts(300 + i, pieces), now));
    sent += binaries(wb).length - n;
  }
  check(`parts over ${PARTS_PER_S} a second are dropped`, sent === PARTS_PER_S, `${sent}`);
  const wc = sock('wc', '10.2.0.3');
  hello(wc);
  check('a pilot who joins late gets the wreck as it lies', texts(wc, 'event').some((m) => m.kind === 'crash' && m.seat === 1)
    && binaries(wc).some((m) => m[0] === TYPE_PARTS_RELAY && decodePartsRelay(m).roomMs === 300 + PARTS_PER_S - 1));
  room = new RoomCore(meta);
  room.restore([wa, wb, wc].map((x) => ({ conn: x, attachment: x.attachment })));
  const wd = sock('wd', '10.2.0.4');
  hello(wd);
  check('and after a hibernation too', texts(wd, 'event').some((m) => m.kind === 'crash') && binaries(wd).some((m) => m[0] === TYPE_PARTS_RELAY));
  run(room.message(wa, JSON.stringify({ type: 'event', kind: 'crash', clear: true }), now));
  check('a clear reaches the others', texts(wb, 'event').some((m) => m.kind === 'crash' && m.clear === true && m.seat === 1));
  const we = sock('we', '10.2.0.5');
  hello(we);
  check('and the room forgets the wreck', !texts(we, 'event').length && !binaries(we).length && wa.attachment.wreck === null);
  now += 1000;
  run(room.message(wb, JSON.stringify({ type: 'event', kind: 'whack', map: 'swiss2', course: 'k1', i: 42, n: [0, 0, 1], square: 0.8 }), now));
  const wh = texts(wa, 'event').find((m) => m.kind === 'whack');
  check('a whack reaches the others with the seat', wh && wh.seat === 2 && wh.i === 42 && wh.square === 0.8 && wh.course === 'k1');
  const before3 = texts(wa, 'event').length;
  run(room.message(wb, JSON.stringify({ type: 'event', kind: 'whack', map: 'swiss2', course: 'k1', i: 42, n: [0, 0, 9], square: 0.8 }), now));
  check('a whack with a bad normal is not', texts(wa, 'event').length === before3);
  run(room.message(wb, JSON.stringify({ type: 'event', kind: 'nonsense' }), now));
  check('an event kind nobody owns is ignored', texts(wa, 'event').length === before3);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
