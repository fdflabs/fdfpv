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
  CLOSE, FLAG_AIRBORNE, FLAG_CRASHED, FLAG_QUAD, FLAG_SMOKE, POSE_BYTES, PROTO, PROFILE_MAX_BYTES, NAME_ADJECTIVES, NAME_ANIMALS,
  checkProfile, codeFromBytes, decodeBatch, decodePose, encodeBatch, encodePose, normaliseCode, validNamePick,
} from '../src/share/roomwire.js';
import { PeerTrack, DELAY_MS, EXTRAP_MAX_MS, STALE_MS, nearWeight } from '../src/game/peer.js';
import { SLOT_RIGHT_M, slotSpawn, stationFor } from '../src/game/slots.js';
import en from '../src/strings/en.js';
import es from '../src/strings/es.js';
import { RoomCore, KICK_MS, PRIVATE_CAP, POSE_PER_S, TEXT_PER_S, TEXT_CLOSE_PER_S, JOINS_PER_MIN } from '../edge/rooms/core.js';
import { HULLS } from '../configs/hulls.js';
import { AIRFRAME_IDS } from '../configs/airframes.js';
import { BREAK_MPS, LATE_MS, checkHit } from '../src/game/midair.js';
import {
  CHAT_BURST, CHAT_EVERY_MS, CHAT_PRESETS, CLOSE_REMOVED, EMOTES, FLAG_SPAWNING, PUBLIC_CAP, REPORT_REASONS,
} from '../src/share/roomwire.js';
import {
  BENCH_MS, IMPOSSIBLE_LIMIT, POSE_MAX_SPEED, REMOVE_MS, REPORTS_PER_WINDOW, SPAWN_MS,
} from '../edge/rooms/safety.js';
import { LobbyBook, MAX_MAPS, PENDING_MS } from '../edge/rooms/lobby.js';
import { TELEPORT_SPEED } from '../src/game/verify.js';

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
/* A pose stamped with the room's clock now, as an honest client stamps it:
 * the room refuses one further than POSE_CLOCK_SLOP_MS from its clock. */
const livePose = (extra = {}) => encodePose({ ...pose, t: now - meta.epoch, ...extra });

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
run(room.message(b, livePose(), now));
check('the next pose starts it again', ticks === 1);
now += 1000;
room.tick(now);
let stored = 0;
for (let i = 0; i < 40; i += 1) {
  const p = livePose({ seq: i });
  room.message(a, p, now);
  /* By sequence, not identity: a spawning seat's pose is stored as a flagged copy. */
  if (decodePose(room.seats.get(a).pose).seq === i) {
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
run(room.message(c, livePose(), now));
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

/* ---------------------------------------------------------------------
 * Phase 3, mid air: the room's referee (edge/rooms/referee.js) through the
 * core, as do.js drives it. The fairness grid is scripts/midair-harness.js
 * and the real plant scripts/midair-plant.js; these are the room's rules.
 * ------------------------------------------------------------------- */
console.log('mid air referee');
{
  const hulls = Object.keys(HULLS);
  check('configs/hulls.js has every airframe', AIRFRAME_IDS.every((id) => hulls.includes(id)) && hulls.length === AIRFRAME_IDS.length,
    AIRFRAME_IDS.filter((id) => !hulls.includes(id)).join(' '));
  const cub = { airframe: 'cub1400', map: 'swiss2', figure: 1, livery: null, parts: null };
  /* A room of two Cubs head on at 15 m/s each, level at 80 m, meeting at
   * room time MEET, past Phase 5's five seconds of spawn protection from
   * each one's first pose; `flagsB` on every B sample, B's samples `lagB`
   * ms late, and the room made `friendly` or not. */
  const MEET = SPAWN_MS + 2000;
  const pass = ({ meet = MEET, friendly = false, flagsB = 0, lagB = 0, profileB = cub, stamp = (t) => t } = {}) => {
    let clock = 0;
    const r = new RoomCore({ code: 'K7PZ2M', cap: PRIVATE_CAP, friendly, map: 'swiss2', epoch: 0 });
    const sa = sock('ma', '10.1.0.1');
    const sb = sock('mb', '10.1.0.2');
    const mine = (s) => (actions) => {
      for (const a of actions) {
        if (a.send) {
          a.send.got.push(typeof a.data === 'string' ? JSON.parse(a.data) : a.data);
        }
      }
    };
    mine(sa)(r.open(sa, 0));
    mine(sa)(r.message(sa, JSON.stringify({ type: 'hello', proto: PROTO, build: 't', name: [1, 2, 11], profile: cub }), 0, sa.address, newToken));
    mine(sb)(r.open(sb, 0));
    mine(sb)(r.message(sb, JSON.stringify({ type: 'hello', proto: PROTO, build: 't', name: [3, 4, 12], profile: profileB }), 0, sb.address, newToken));
    const pose = (x, dir, flags, t) => encodePose({
      flags: FLAG_AIRBORNE | flags, seq: 1, t: stamp(t), px: x, py: 80, pz: 0,
      qx: 0, qy: dir > 0 ? -Math.SQRT1_2 : Math.SQRT1_2, qz: 0, qw: Math.SQRT1_2,
      vx: 15 * dir, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, c0: 0, c1: 0, c2: 0, c3: 0, motor: 0, flaps: 0,
    });
    const queue = [];
    for (let t = 0; t <= meet + 1000; t += 33) {
      queue.push([t, sa, pose(15 * (t - meet) / 1000, 1, 0, t)]);
      queue.push([t + lagB, sb, pose(-15 * (t - meet) / 1000, -1, flagsB, t)]);
    }
    queue.sort((x, y) => x[0] - y[0]);
    let tick = 33;
    for (const [at, s, bytes] of queue) {
      while (tick <= at) {
        clock = tick;
        r.tick(clock);
        tick += 33;
      }
      clock = at;
      mine(s)(r.message(s, bytes, clock));
    }
    const hitsOf = (s) => s.got.filter((m) => m && m.type === 'hit');
    return { a: hitsOf(sa), b: hitsOf(sb), log: r.referee.log, room: r };
  };
  const plain = pass();
  const h = plain.a[0];
  check('two Cubs head on: one hit, to both seats, the same one', plain.a.length === 1 && plain.b.length === 1 && JSON.stringify(plain.a[0]) === JSON.stringify(plain.b[0]),
    `${plain.a.length} and ${plain.b.length}`);
  check('just before they would meet, CG to CG', h && h.tc > MEET - 50 && h.tc < MEET, h ? `${h.tc} ms` : '');
  check('inside Phase 5\'s spawn protection nobody is hit: the same pass 2 s after spawning', pass({ meet: 2000 }).a.length === 0);
  check('the hit counts toward Phase 5\'s ramming bench, on both seats', (() => {
    const p = pass();
    const counts = [...p.room.safety.pilots.values()].map((x) => x.hits.length);
    return counts.length === 2 && counts.every((n) => n === 1);
  })());
  check('a hit a client can act on (checkHit)', h && checkHit(h));
  check('each side is struck by the other: A\'s normal points back along its flight, in its own body frame', h && h.A.n[0] < -0.9 && h.B.n[0] < -0.9,
    h ? `${h.A.n} ${h.B.n}` : '');
  check('each is 15 m/s faster than the pair\'s centre of mass, forward', h && Math.abs(h.A.dv[0] - 15) < 0.1 && Math.abs(h.B.dv[0] - 15) < 0.1,
    h ? `${h.A.dv[0]} ${h.B.dv[0]}` : '');
  check(`at 30 m/s closing, over ${BREAK_MPS}, each breaks a part off`, h && h.A.brk > 0 && h.B.brk > 0, h ? `${h.A.brk} ${h.B.brk}` : '');
  check('a friendly room passes them through each other', pass({ friendly: true }).a.length === 0);
  check('a spawning aircraft is untouchable', pass({ flagsB: FLAG_SPAWNING }).a.length === 0);
  check('so is a wreck', pass({ flagsB: FLAG_CRASHED }).a.length === 0);
  check('a seat 100 ms late is waited for: the same hit', (() => {
    const late = pass({ lagB: 100 });
    return late.a.length === 1 && late.a[0].tc === h.tc;
  })());
  check(`a seat later than LATE_MS (${LATE_MS} ms) is not: it ghosts through`, pass({ lagB: LATE_MS + 100 }).a.length === 0);
  check('an airframe this room does not know is never judged', pass({ profileB: { ...cub, airframe: 'zeppelin' } }).a.length === 0);
  check('a clock gone wrong, stamping a second ahead, is not judged', pass({ stamp: (t) => t + 1000 }).a.length === 0);
}
/*
 * PHASE 5, SAFETY: edge/rooms/safety.js and edge/rooms/lobby.js, driven
 * through the core the way do.js drives them.
 */
console.log('phase 5: quick chat and emotes, by id only');
now += 60000;
room = new RoomCore(meta);
const p5a = sock('p5a', '10.5.0.1');
const p5b = sock('p5b', '10.5.0.2');
const p5c = sock('p5c', '10.5.0.3');
for (const s of [p5a, p5b, p5c]) {
  hello(s);
}
const seatOf = (s) => texts(s, 'welcome')[0].seat;
const events = (s, kind) => s.got.filter((m) => m && m.type === 'event' && m.kind === kind);
const say = (s, obj) => run(room.message(s, JSON.stringify(obj), now, s.address, newToken));
say(p5a, { type: 'event', kind: 'chat', id: 1 });
const heard = events(p5b, 'chat');
check('a preset chat reaches the others as its id and the sender\'s seat',
  heard.length === 1 && heard[0].id === 1 && heard[0].seat === seatOf(p5a) && events(p5c, 'chat').length === 1);
check('rebuilt by the room: exactly type, kind, seat and id', heard[0] && Object.keys(heard[0]).sort().join() === 'id,kind,seat,type');
check('and not echoed to the sender', events(p5a, 'chat').length === 0);
now += 10000;
const nb5 = p5b.got.length;
say(p5a, { type: 'event', kind: 'chat', id: 2, text: 'meet me at' });
say(p5a, { type: 'event', kind: 'chat', id: 'hello' });
say(p5a, { type: 'event', kind: 'chat', id: CHAT_PRESETS.length });
say(p5a, { type: 'event', kind: 'chat', id: -1 });
check('a chat carrying a text field, a word for an id, or an id off the list reaches nobody', p5b.got.length === nb5);
now += 1000;
say(p5a, { type: 'chat', text: 'hello' });
say(p5a, { type: 'event', kind: 'emote', id: 0, name: 'x' });
check('nor does a made up type or an emote with an extra field', p5b.got.length === nb5);
now += 10000;
say(p5a, { type: 'event', kind: 'emote', id: EMOTES.indexOf('wave') });
check('an emote goes out by id', events(p5b, 'emote').length === 1 && events(p5b, 'emote')[0].id === EMOTES.indexOf('wave'));
now += 10000;
let sent5 = 0;
for (let i = 0; i < CHAT_BURST + 2; i += 1) {
  const n = events(p5b, 'chat').length;
  say(p5a, { type: 'event', kind: 'chat', id: 0 });
  sent5 += events(p5b, 'chat').length - n;
  now += 100;
}
check(`quick chat and emotes: ${CHAT_BURST} at once, then dropped`, sent5 === CHAT_BURST, `${sent5}`);
now += CHAT_EVERY_MS;
const n5 = events(p5b, 'chat').length;
say(p5a, { type: 'event', kind: 'chat', id: 0 });
say(p5a, { type: 'event', kind: 'chat', id: 0 });
check(`then one every ${CHAT_EVERY_MS} ms`, events(p5b, 'chat').length === n5 + 1);

console.log('phase 5: mute');
now += 10000;
say(p5b, { type: 'mute', seats: [seatOf(p5a)] });
check('a mute is kept with the muting pilot\'s seat, as the muted seat\'s token', p5b.attachment.muted.length === 1
  && p5b.attachment.muted[0] === texts(p5a, 'welcome')[0].token);
const mb = events(p5b, 'chat').length;
const mc = events(p5c, 'chat').length;
say(p5a, { type: 'event', kind: 'chat', id: 3 });
check('a muted pilot\'s chat does not reach who muted them', events(p5b, 'chat').length === mb);
check('and still reaches everybody else', events(p5c, 'chat').length === mc + 1);
run(room.close(p5a, now));
const p5a2 = sock('p5a2', '10.5.0.1');
hello(p5a2, { token: texts(p5a, 'welcome')[0].token });
now += 10000;
run(room.message(p5a2, JSON.stringify({ type: 'event', kind: 'chat', id: 3 }), now, p5a2.address, newToken));
check('and still does not after they drop and take their seat back', events(p5b, 'chat').length === mb);
room = (() => {
  const r = new RoomCore(meta);
  r.restore([p5a2, p5b, p5c].map((s) => ({ conn: s, attachment: s.attachment })));
  return r;
})();
now += 10000;
run(room.message(p5a2, JSON.stringify({ type: 'event', kind: 'chat', id: 3 }), now, p5a2.address, newToken));
check('nor after the room hibernates', events(p5b, 'chat').length === mb && events(p5c, 'chat').length === mc + 3, `${events(p5b, 'chat').length - mb} ${events(p5c, 'chat').length - mc}`);
say(p5b, { type: 'mute', seats: [] });
now += 10000;
run(room.message(p5a2, JSON.stringify({ type: 'event', kind: 'chat', id: 4 }), now, p5a2.address, newToken));
check('unmuted, their chat arrives again', events(p5b, 'chat').length === mb + 1);
say(p5b, { type: 'mute', seats: 'everyone' });
check('a mute that is not a list of seats is refused', p5b.attachment.muted.length === 0);

console.log('phase 5: reports');
const sa = seatOf(p5a2) || texts(p5a2, 'welcome')[0].seat;
say(p5b, { type: 'report', seat: sa, reason: REPORT_REASONS.length });
say(p5b, { type: 'report', seat: seatOf(p5b), reason: 0 });
say(p5b, { type: 'report', seat: 99, reason: 0 });
check('a report with no such reason, of yourself, or of nobody, is refused', texts(p5b, 'reported').length === 0);
say(p5b, { type: 'report', seat: sa, reason: REPORT_REASONS.indexOf('ramming') });
check('a report is acknowledged to the reporter only', texts(p5b, 'reported').length === 1 && texts(p5c, 'reported').length === 0 && texts(p5a2, 'reported').length === 0);
check(`one report in a room of 3 removes nobody (it takes max(2, a third))`, !p5a2.closed && room.safety.reportsToRemove() === 2);
const twin = sock('twin', p5b.address);
hello(twin);
run(room.message(twin, JSON.stringify({ type: 'report', seat: sa, reason: 1 }), now, twin.address, newToken));
check('a second tab on the reporter\'s address is not a second reporter', !p5a2.closed);
run(room.close(twin, now));
say(p5c, { type: 'report', seat: sa, reason: 1 });
check('a second pilot\'s report removes them', p5a2.closed && p5a2.closed.code === CLOSE_REMOVED);
check('and the room sees them leave', texts(p5b, 'leave').some((m) => m.seat === sa));
const back5 = sock('back5', '10.5.0.1');
hello(back5, { token: texts(p5a, 'welcome')[0].token });
check('back with their token is refused', back5.closed && back5.closed.code === CLOSE.kicked);
const back6 = sock('back6', '10.5.0.1');
hello(back6);
check('back from their address is refused', back6.closed && back6.closed.code === CLOSE.kicked);
now += REMOVE_MS + 1;
const back7 = sock('back7', '10.5.0.1');
hello(back7);
check('allowed back after 30 minutes', !back7.closed);
const r9 = new RoomCore({ ...meta, cap: 16 });
room = r9;
const nine = [];
for (let i = 0; i < 9; i += 1) {
  const s = sock(`n${i}`, `10.6.0.${i}`);
  hello(s);
  nine.push(s);
}
check('in a room of 9 it takes 3 reporters', r9.safety.reportsToRemove() === 3);
let filed5 = 0;
for (let i = 1; i <= REPORTS_PER_WINDOW + 1; i += 1) {
  run(r9.message(nine[0], JSON.stringify({ type: 'report', seat: seatOf(nine[i]), reason: 2 }), now, nine[0].address, newToken));
  filed5 = texts(nine[0], 'reported').length;
}
check(`a pilot files ${REPORTS_PER_WINDOW} reports in five minutes, no more`, filed5 === REPORTS_PER_WINDOW, `${filed5}`);

console.log('phase 5: kicks and caps');
const pubMeta = { code: null, public: true, shard: 2, cap: PUBLIC_CAP, friendly: false, map: 'swiss2', epoch: now - 5000 };
room = new RoomCore(pubMeta);
const pub = [];
for (let i = 0; i < PUBLIC_CAP + 1; i += 1) {
  const s = sock(`pub${i}`, `10.7.0.${i}`);
  hello(s);
  pub.push(s);
}
const wp = texts(pub[0], 'welcome')[0];
check(`a public room holds ${PUBLIC_CAP} and says it is public, with its shard`, room.seats.size === PUBLIC_CAP && wp.public === true && wp.shard === 2 && wp.cap === PUBLIC_CAP && wp.code === null);
check('the next is told it is full', pub[PUBLIC_CAP].closed && pub[PUBLIC_CAP].closed.code === CLOSE.full);
run(room.message(pub[0], JSON.stringify({ type: 'kick', seat: 2 }), now, pub[0].address, newToken));
check('in a public room nobody kicks, not even the first in: reports decide', !pub[1].closed);
check(`a private room still holds ${PRIVATE_CAP}`, PRIVATE_CAP === 8);

console.log('phase 5: pose sanity');
room = new RoomCore(meta);
const f1 = sock('f1', '10.8.0.1');
const f2 = sock('f2', '10.8.0.2');
hello(f1);
hello(f2);
const relayed = () => {
  const n = f2.got.length;
  now += 34;
  run(room.tick(now));
  const got = f2.got.slice(n).filter((m) => m instanceof Uint8Array);
  return got.length ? decodeBatch(got[0]).poses[0] : null;
};
run(room.message(f1, livePose({ px: 0, py: 10, pz: 0 }), now));
const first = relayed();
check('a first pose is a spawn: relayed with the spawning flag set by the room', first && (first.flags & FLAG_SPAWNING) !== 0);
now += SPAWN_MS;
run(room.message(f1, livePose({ px: 1, py: 10, pz: 0 }), now));
const flying = relayed();
check(`${SPAWN_MS} ms later it flies untouched: the flag is off`, flying && (flying.flags & FLAG_SPAWNING) === 0);
run(room.message(f1, livePose({ px: 1, py: 10, pz: 0, flags: FLAG_SPAWNING }), now));
check('a sender\'s own spawning flag is left as it is (it only ever protects)', (relayed().flags & FLAG_SPAWNING) !== 0);
now += 100;
run(room.message(f1, livePose({ px: 500, py: 10, pz: 0 }), now));
const jumped = relayed();
check(`a jump faster than ${POSE_MAX_SPEED} m/s is a respawn or a forgery: spawning again`, jumped && (jumped.flags & FLAG_SPAWNING) !== 0 && Math.abs(jumped.px - 500) < 1e-3);
check('the room\'s speed limit is the board\'s teleport speed', POSE_MAX_SPEED === TELEPORT_SPEED);
now += SPAWN_MS;
const impossible = [
  ['a position that is not a number', livePose({ px: NaN })],
  ['a position a hundred kilometres out', livePose({ px: 100000 })],
  [`a velocity over ${POSE_MAX_SPEED} m/s`, livePose({ px: 500, vx: 150 })],
  ['a sample time a minute off the room clock', encodePose({ ...pose, px: 500, pz: 0, t: now - meta.epoch + 60000 })],
];
for (const [what, b] of impossible) {
  run(room.message(f1, b, now));
  check(`${what} is not relayed`, relayed() === null);
}
for (let i = 0; i < IMPOSSIBLE_LIMIT; i += 1) {
  now += 40;
  run(room.message(f1, livePose({ px: NaN }), now));
}
check(`${IMPOSSIBLE_LIMIT} impossible poses in a minute remove the seat`, f1.closed && f1.closed.code === CLOSE_REMOVED);

console.log('phase 5: ramming');
room = new RoomCore(meta);
const g1 = sock('g1', '10.9.0.1');
const g2 = sock('g2', '10.9.0.2');
const g3 = sock('g3', '10.9.0.3');
for (const s of [g1, g2, g3]) {
  hello(s);
}
run(room.message(g1, livePose(), now));
now += SPAWN_MS + 1;
check('a flying seat can be touched', !room.safety.untouchable(seatOf(g1), now));
for (let i = 0; i < 3; i += 1) {
  room.safety.noteHit(seatOf(g1), i % 2 ? seatOf(g2) : seatOf(g3), now);
  now += 1000;
}
check('three hits in five minutes is still flying', !room.safety.untouchable(seatOf(g1), now));
room.safety.noteHit(seatOf(g1), seatOf(g2), now);
check('a fourth benches the seat: untouchable and unable to touch', room.safety.untouchable(seatOf(g1), now));
check('its two victims, hit twice each, are not', !room.safety.untouchable(seatOf(g2), now) && !room.safety.untouchable(seatOf(g3), now));
run(room.message(g1, livePose(), now));
const n3 = g3.got.length;
now += 34;
run(room.tick(now));
const benched = g3.got.slice(n3).filter((m) => m instanceof Uint8Array).map((m) => decodeBatch(m).poses.find((q) => q.seat === seatOf(g1)))[0];
check('everybody sees the benched seat as spawning', benched && (benched.flags & FLAG_SPAWNING) !== 0);
now += BENCH_MS;
check(`for ${BENCH_MS / 60000} minutes`, !room.safety.untouchable(seatOf(g1), now));

console.log('phase 5: the public lobby');
let t5 = 0;
const book = new LobbyBook();
check('the first pilot on a map opens shard 0', book.assign('swiss2', t5) === 0);
book.count('swiss2', 0, 1);
check('the next joins it', book.assign('swiss2', t5) === 0);
book.count('swiss2', 0, PUBLIC_CAP);
check('a full shard opens the next', book.assign('swiss2', t5) === 1);
book.count('swiss2', 1, 1);
book.count('swiss2', 0, 10);
check('the least full shard with a seat is picked', book.assign('swiss2', t5) === 1);
book.count('swiss2', 1, 12);
check('which moves as the counts do', book.assign('swiss2', t5) === 0);
const burst = new LobbyBook();
const spread = [];
for (let i = 0; i < PUBLIC_CAP + 4; i += 1) {
  spread.push(burst.assign('alps', t5));
}
check(`a burst before any room reports fills shard 0 to ${PUBLIC_CAP}, then opens shard 1`,
  spread.filter((x) => x === 0).length === PUBLIC_CAP && spread.filter((x) => x === 1).length === 4);
t5 += PENDING_MS;
check('a reservation nobody took lapses', burst.assign('alps', t5) === 0);
book.count('swiss2', 1, 0);
check('an emptied shard is forgotten', !('1' in book.maps.swiss2));
check('a reconnect asks for its shard back', book.assign('swiss2', t5, 5) === 5);
check('each map has its own shards', book.assign('field', t5) === 0);
check('a map name that is not an id is refused', book.assign('../x', t5) === -1 && book.assign('Swiss 2', t5) === -1);
const flood = new LobbyBook();
for (let i = 0; i < MAX_MAPS; i += 1) {
  flood.assign(`m${i}`, t5);
}
check(`the lobby holds at most ${MAX_MAPS} maps`, flood.assign('onemore', t5) === -1);

console.log('phase 5: every preset in both languages');
const gaps = [];
for (const [lang, table] of [['en', en], ['es', es]]) {
  for (const id of CHAT_PRESETS) {
    if (!table[`rooms.chat.${id}`]) {
      gaps.push(`${lang} chat.${id}`);
    }
  }
  for (const id of EMOTES) {
    if (!table[`rooms.emote.${id}`] || !table[`rooms.emote_line.${id}`]) {
      gaps.push(`${lang} emote.${id}`);
    }
  }
  for (const id of REPORT_REASONS) {
    if (!table[`rooms.report.${id}`]) {
      gaps.push(`${lang} report.${id}`);
    }
  }
}
check('every chat, emote and report reason has its words in English and Spanish', gaps.length === 0, gaps.join(' '));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
