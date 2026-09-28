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
import { RoomCore, KICK_MS, PRIVATE_CAP, POSE_PER_S, TEXT_PER_S, TEXT_CLOSE_PER_S, JOINS_PER_MIN } from '../edge/rooms/core.js';
import { COUNTDOWN_MS, TRACK_MAX_BYTES, roomTrack } from '../edge/rooms/race.js';
import { createRoomRace, orderStandings } from '../src/share/roomrace.js';
import { Race, PLANE_REACH } from '../src/game/race.js';
import { raceGatesOf } from '../src/builder/course.js';
import { mapTrackDocument } from '../tests/lib/maptrack.js';

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
let lastStore = null;
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
    } else if (a.store) {
      lastStore = { key: a.store, value: JSON.parse(JSON.stringify(a.value)) };
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

/*
 * RACING TOGETHER (Phase 4, edge/rooms/race.js and src/share/roomrace.js).
 * Two clients in one room race a three gate track through the room, each
 * scoring its own gates with a real Race (src/game/race.js) over the
 * builder's own gates (raceGatesOf), exactly as the shell does: the host
 * loads the track, both say their world has it, the host starts, both are
 * held until the shared goAt, then each flies its gates on its own clock,
 * one wrecks and flies on, and both are handed the same results. Then a
 * joiner who arrives mid race, a finish the room dropped, a retire, a
 * dropped socket, the host ending a race, and a hibernation.
 */
console.log('race: the track');
const raceDoc = mapTrackDocument({ id: 'trk-race0001', name: 'Three in the valley', types: ['gate', 'hoop30', 'gate'], radius: 60 });
const rt = roomTrack(raceDoc);
check('a host\'s map track is the room\'s track, three gates, in its world', rt.track && rt.track.gates === 3 && rt.track.map === 'swiss2' && rt.track.id === 'trk-race0001');
check('without its logos, which are free content', rt.track && Array.isArray(rt.track.doc.branding.logos) && rt.track.doc.branding.logos.length === 0);
const branded = JSON.parse(JSON.stringify(raceDoc));
branded.branding = { logos: [{ id: 'l1', name: 'x', dataUrl: `data:image/png;base64,${'A'.repeat(1000)}` }] };
check('a branded one loses the logo, not the track', roomTrack(branded).track && roomTrack(branded).track.doc.branding.logos.length === 0);
check('a name off the word list is dropped', roomTrack({ ...raceDoc, name: 'fuck this track' }).track.name === '');
check('a document that is not a map track is refused', roomTrack({ schemaVersion: 3, elements: [] }).error === 'bad' && roomTrack('text').error === 'bad');
check('a track with no gate to race is refused', roomTrack(mapTrackDocument({ gates: 0 })).error === 'nogate');
const hugeDoc = mapTrackDocument({ gates: 220, radius: 400 });
check(`over ${TRACK_MAX_BYTES / 1024} kB is refused`, roomTrack(hugeDoc).error === 'big', roomTrack(hugeDoc).error || 'accepted');

console.log('race: two pilots');
room = new RoomCore(meta);
now += 60000;
const ha = sock('race-a', '10.2.0.1');
const hb = sock('race-b', '10.2.0.2');
/* Each pilot's client, its messages straight into the room. */
const clients = new Map();
function client(s) {
  const rr = createRoomRace((obj) => run(room.message(s, JSON.stringify(obj), now, s.address, newToken)));
  const c = { s, rr, read: 0 };
  clients.set(s, c);
  return c;
}
/* What each socket got since the last pump, handed to its client. */
function pump() {
  for (const c of clients.values()) {
    for (; c.read < c.s.got.length; c.read += 1) {
      const m = c.s.got[c.read];
      if (!m || m instanceof Uint8Array) {
        continue;
      }
      if (m.type === 'welcome') {
        c.rr.onWelcome(m);
      } else {
        c.rr.onMessage(m);
      }
    }
  }
}
const A = client(ha);
const B = client(hb);
hello(ha);
now += 10;
hello(hb, { name: [5, 6, 50] });
pump();
check('a room starts with no track and no race', A.rr.track() === null && A.rr.race().state === 'lobby' && A.rr.role(0) === 'lobby');
B.rr.loadTrack(raceDoc);
pump();
check('only the host loads a track', A.rr.track() === null && B.rr.track() === null);
A.rr.loadTrack(raceDoc);
pump();
check('the host loads it and everybody has it', A.rr.track() && B.rr.track() && B.rr.track().id === 'trk-race0001' && B.rr.track().doc.sequence.length === 3);
check('and the room keeps it for a hibernation', lastStore && lastStore.key === 'race' && lastStore.value.track.id === 'trk-race0001');
A.rr.start(2);
pump();
check('a race with nobody ready is refused', A.rr.error() === 'none_ready' && A.rr.race().state === 'lobby');
A.rr.ready(true);
B.rr.ready(true);
pump();
check('each says its world has the track, and everybody sees who is ready', B.rr.race().ready.join() === '1,2');
B.rr.start(2);
pump();
check('only the host starts', A.rr.race().state === 'lobby');
A.rr.start(2);
pump();
const goRoom = now - meta.epoch + COUNTDOWN_MS;
const race1 = B.rr.race();
check(`the host starts it: a countdown to a room time ${COUNTDOWN_MS / 1000} s on, the same on both`, race1.state === 'on' && race1.goAt === goRoom && A.rr.race().goAt === goRoom && race1.laps === 2);
check('both ready pilots are racing', race1.racers.join() === '1,2');
check('each is held on the line until goAt', A.rr.role(goRoom - 1) === 'countdown' && A.rr.holdMs(goRoom - 2500) === 2500 && B.rr.holdMs(goRoom) === 0);
check('each is put on the line once', A.rr.takeStart(goRoom - 5000) === A.rr.race() && A.rr.takeStart(goRoom - 4000) === null);
B.rr.takeStart(goRoom - 5000);
const beforeGo = ha.got.length;
run(room.message(hb, JSON.stringify({ type: 'event', kind: 'gate', race: race1.id, lap: 0, gate: 1, t: 0, points: 0 }), now, hb.address));
check('a pass before goAt is nobody\'s business', ha.got.length === beforeGo);

/* A joiner during the countdown waits for the next race. */
now += 100;
const hc = sock('race-c', '10.2.0.3');
const C = client(hc);
hello(hc, { name: [7, 8, 60] });
pump();
check('a pilot who joins after the start spectates, with the track and the race', C.rr.role(goRoom + 10) === 'spectating' && C.rr.track() && C.rr.race().id === race1.id);
check('and is not put on the line', C.rr.takeStart(goRoom + 10) === null && C.rr.holdMs(goRoom - 100) === 0);

/*
 * The flying. Each pilot's own Race over the builder's gates; a pass is the
 * craft's travel through the opening from 3 m before it to 3 m past, and a
 * move between gates is not flown (allow false), as a teleport. Times are
 * the room clock on each side, which in this check is the room's own.
 */
function centreOf(g) {
  const cy = g.apertures[0].centreY;
  return { x: g.x + g.ay.x * cy, y: g.y + g.ay.y * cy, z: g.z + g.ay.z * cy };
}
function flyer(c, plane) {
  const race = new Race(raceGatesOf(raceDoc), 'full', { reach: plane ? PLANE_REACH : 0 });
  return { c, race, at: null, passes: 0 };
}
const pA = flyer(A, false);
const pB = flyer(B, true);
/* Through the race's next gate at room time tRoom, and the pass handed on
 * as src/main.js hands it on. */
function flyGate(p, tRoom) {
  const race = p.race;
  const g = race.gates[race.next];
  const c = centreOf(g);
  const from = { x: c.x - g.az.x * 3, y: c.y - g.az.y * 3, z: c.z - g.az.z * 3 };
  const to = { x: c.x + g.az.x * 3, y: c.y + g.az.y * 3, z: c.z + g.az.z * 3 };
  race.update(p.at || from, from, tRoom - 60, 0, false);
  const lapsBefore = race.laps.length;
  const res = race.update(from, to, tRoom, 0, true);
  p.at = to;
  if (res.passed == null) {
    return false;
  }
  const scored = race.call && race.call.gate === res.passed ? race.call.points : 0;
  race.call = null;
  const cross = race.lapStartMs + (race.splits.length ? race.splits[race.splits.length - 1] : 0);
  now = meta.epoch + tRoom;
  p.c.rr.pass({
    lapDone: race.laps.length > lapsBefore,
    gate: race.lapStartMs != null ? race.splits.length + 1 : 0,
    gatePoints: scored,
    hoop: Boolean(race.gates[res.passed].apertures[0].round),
    lagMs: tRoom - cross,
  }, tRoom);
  p.passes += 1;
  pump();
  return true;
}
/* A pass is timed at its crossing, which a chord 60 ms long through the
 * middle of the opening puts 30 ms before the frame that saw it. */
const CROSS_LAG = 30;
/* A: a gate every 2 s from 1 s after the go, seven passes for two laps
 * (the start crossing, then three a lap). B: every 2.5 s, and a wreck in
 * lap 1 after two gates: the lap in flight is void and R puts it back on
 * its line, the lap already flown stays. */
const plan = [];
for (let k = 0; k < 7; k += 1) {
  plan.push({ t: goRoom + 1000 + 2000 * k, p: pA });
}
for (let k = 0; k < 11; k += 1) {
  plan.push({ t: goRoom + 1200 + 2500 * k, p: pB });
}
plan.sort((x, y) => x.t - y.t);
let sawAAhead = false;
let flewAll = true;
for (const step of plan) {
  if (step.p === pB && pB.passes === 6 && !pB.wrecked) {
    pB.wrecked = true;
    pB.race.voidLap('wrecked', 0);
    pB.race.reset();
    pB.at = null;
  }
  if (step.p.c.rr.done()) {
    continue;
  }
  flewAll = flyGate(step.p, step.t) && flewAll;
  const liveB = B.rr.standings();
  if (liveB.length === 2 && liveB[0].seat === 1 && liveB[0].ms == null && liveB[0].lap === 1) {
    sawAAhead = true;
  }
}
check('every scripted pass through a gate scored', flewAll);
check('each pilot sees the other move round live, from the relayed passes', sawAAhead);
const aFinish = goRoom + 1000 + 2000 * 6;
const res1 = A.rr.race();
check('both flew their laps, and the race is over when the last one finishes', A.rr.done() && B.rr.done() && res1.state === 'results');
const rowsA = A.rr.standings();
const rowsB = B.rr.standings();
const rowsC = C.rr.standings();
check('the results agree on every screen, the spectator\'s too', JSON.stringify(rowsA) === JSON.stringify(rowsB) && JSON.stringify(rowsA) === JSON.stringify(rowsC));
check('A wins, timed from goAt to the crossing on the room clock', rowsA[0].seat === 1 && rowsA[0].place === 1 && rowsA[0].ms === aFinish - CROSS_LAG - goRoom, JSON.stringify(rowsA[0]));
check('B second, after its wreck cost it the lap in flight', rowsA[1].seat === 2 && rowsA[1].ms > rowsA[0].ms && rowsA[1].lap === 2 && B.rr.laps() === 2, JSON.stringify(rowsA[1]));
check('the plane\'s points are carried, the quad has none', rowsA[1].points > 0 && rowsA[0].points === 0, `${rowsA[1].points} ${rowsA[0].points}`);
check('each results screen is shown once', A.rr.takeResults() === A.rr.race() && A.rr.takeResults() === null && C.rr.takeResults() !== null);
check('a spectator\'s passes were never counted', !rowsA.some((r) => r.seat === 3));

console.log('race: a rematch, a lost finish, a retire');
A.rr.ready(true);
B.rr.ready(true);
C.rr.ready(true);
pump();
now += 1000;
A.rr.start(1);
pump();
const race2 = A.rr.race();
const go2 = race2.goAt;
check('the host races again on the same track, everybody ready is in it', race2.state === 'on' && race2.id === race1.id + 1 && race2.racers.join() === '1,2,3' && race2.laps === 1);
check('the joiner is racing this time', C.rr.takeStart(go2 - 100) === C.rr.race() && C.rr.role(go2 + 1) === 'racing');
pA.race.reset();
pA.at = null;
pA.passes = 0;
/* The room drops A's finish (over its text rate): it comes again. */
const realMessage = room.message.bind(room);
let dropFinish = true;
room.message = (conn, data, ...rest) => {
  if (dropFinish && conn === ha && typeof data === 'string' && data.includes('"finish"')) {
    dropFinish = false;
    return [];
  }
  return realMessage(conn, data, ...rest);
};
for (let k = 0; k < 4; k += 1) {
  flyGate(pA, go2 + 500 + 1500 * k);
}
room.message = realMessage;
const heldBefore = (A.rr.race().standings.find((r) => r.seat === 1) || {}).ms;
check('a finish the room did not get shows as flown on the pilot\'s own screen', A.rr.role(go2 + 5000) === 'finished' && heldBefore == null && A.rr.standings()[0].ms === 5000 - CROSS_LAG, JSON.stringify(A.rr.standings()[0]));
now = meta.epoch + go2 + 5000 + 100;
A.rr.frame(go2 + 5000 + 100);
pump();
check('and is not sent again before its pause', (A.rr.race().standings.find((r) => r.seat === 1) || {}).ms == null);
now = meta.epoch + go2 + 5000 + 1600;
A.rr.frame(go2 + 5000 + 1600);
pump();
check('then is sent again, and the room has it', (B.rr.race().standings.find((r) => r.seat === 1) || {}).ms === 5000 - CROSS_LAG);
now = meta.epoch + go2 + 6000;
run(room.close(hb, now));
clients.delete(hb);
pump();
check('a racer whose socket drops is out while it is gone', A.rr.race().standings.find((r) => r.seat === 2).out === 'left' && A.rr.race().state === 'on');
const hb2 = sock('race-b2', hb.address);
const B2 = client(hb2);
hello(hb2, { name: [5, 6, 50], token: texts(hb, 'welcome')[0].token });
pump();
check('and back in the race when the same seat comes back', B2.rr.seat() === 2 && A.rr.race().standings.find((r) => r.seat === 2).out === null && B2.rr.role(go2 + 7000) === 'racing');
C.rr.retire(go2 + 7000);
pump();
check('a pilot who leaves the race is out, last', B2.rr.race().standings.find((r) => r.seat === 3).out === 'retired' && A.rr.race().state === 'on');
A.rr.end();
pump();
const res2 = A.rr.race();
check('the host ends it: results now, the unfinished after the finished', res2.state === 'results'
  && res2.standings.map((r) => r.seat).join() === '1,2,3' && res2.standings[1].ms == null && res2.standings[2].out === 'retired');

console.log('race: rules');
A.rr.start(3);
pump();
const race3 = A.rr.race();
A.rr.loadTrack(mapTrackDocument({ id: 'trk-race0002' }));
pump();
check('no new track while a race is on', A.rr.error() === 'busy' && A.rr.track().id === 'trk-race0001');
check('the host picks the laps', race3.laps === 3 && race3.state === 'on');
run(room.message(ha, JSON.stringify({ type: 'event', kind: 'gate', race: race3.id, lap: 99, gate: 1, t: 10, points: 0 }), meta.epoch + race3.goAt + 100, ha.address));
check('a pass with a lap past the race is dropped', !room.race.race.progress[1]);
check('the order puts the finished first, then laps, gates and who got there first, the out last', orderStandings([
  { seat: 1, ms: null, lap: 1, gate: 2, t: 900, out: null },
  { seat: 2, ms: 5000, lap: 3, gate: 0, t: 5000, out: null },
  { seat: 3, ms: null, lap: 1, gate: 2, t: 800, out: null },
  { seat: 4, ms: null, lap: 2, gate: 0, t: 999, out: 'left' },
  { seat: 5, ms: 4000, lap: 3, gate: 0, t: 4000, out: null },
]).map((r) => r.seat).join() === '5,2,3,1,4');

console.log('race: hibernation');
const saved = lastStore.value;
const asleep = [ha, hb2, hc].map((s) => ({ conn: s, attachment: s.attachment }));
room = new RoomCore(meta);
room.restore(asleep);
room.race.restore(saved);
const hd = sock('race-d', '10.2.0.4');
hello(hd, { name: [9, 9, 19] });
const wd = texts(hd, 'welcome')[0];
check('a room that slept still has its track and its race', wd.track && wd.track.id === 'trk-race0001' && wd.race.id === race3.id && wd.race.state === 'on');
check('and the readiness starts again from the pilots', wd.race.ready.length === 0);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
