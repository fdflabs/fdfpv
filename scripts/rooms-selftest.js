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
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import {
  CLOSE, FLAG_AIRBORNE, FLAG_CRASHED, FLAG_QUAD, FLAG_SMOKE, POSE_BYTES, PROTO, PROFILE_MAX_BYTES, NAME_ADJECTIVES, NAME_ANIMALS,
  checkProfile, codeFromBytes, decodeBatch, decodePose, encodeBatch, encodePose, normaliseCode, validNamePick,
} from '../src/share/roomwire.js';
import { PeerTrack, DELAY_MS, EXTRAP_MAX_MS, STALE_MS, nearWeight, ACCEL_MAX, ACCEL_MS } from '../src/game/peer.js';
import { SLOT_RIGHT_M, slotSpawn, stationFor } from '../src/game/slots.js';
import en from '../src/strings/en.js';
import es from '../src/strings/es.js';
import {
  TYPE_PARTS_RELAY, decodePartsRelay, encodeParts,
} from '../src/share/roomwire.js';
import { PARTS_PER_S } from '../edge/rooms/wrecks.js';
import {
  ABANDON_MS, HOLD_MS, REPEAT_MS, RESEAT_MS, RoomCore, TICK_MS, KICK_MS, KICKED_JOIN_GAP_MS, PRIVATE_CAP, POSE_PER_S, TEXT_PER_S, CLOCK_PER_S, TEXT_CLOSE_PER_S, JOINS_PER_MIN,
} from '../edge/rooms/core.js';
import { HULLS } from '../configs/hulls.js';
import { AIRFRAME_IDS } from '../configs/airframes.js';
import {
  BREAK_MPS, LATE_MS, checkHit, hullDistance, hullFor,
} from '../src/game/midair.js';
import { COUNTDOWN_MS } from '../edge/rooms/timing.js';
import {
  CHAT_BURST, CHAT_EVERY_MS, CHAT_PRESETS, CLOSE_REMOVED, EMOTES, FLAG_SPAWNING, PUBLIC_CAP, REPORT_REASONS, REPORT_WINDOW_MS,
} from '../src/share/roomwire.js';
import {
  IMPOSSIBLE_LIMIT, POSE_MAX_SPEED, REMOVE_MS, REPORTS_PER_WINDOW, SPAWN_MS,
} from '../edge/rooms/safety.js';
import { SYNC_GAP_MS } from '../src/share/roomclock.js';
import { UNDO_MS, createRoomSafety } from '../src/share/roomsafety.js';
import { str } from '../src/strings/index.js';
import { browserSection } from './rooms-selftest-browser.js';
import { blocksSection } from './rooms-selftest-blocks.js';
import { scaleSection } from './rooms-selftest-scale.js';
import { sessionSection } from './rooms-selftest-session.js';
import { weatherSection } from './rooms-selftest-weather.js';
import { stockSurfacesSection } from './rooms-selftest-surfaces.js';
import { visibilitySection } from './rooms-selftest-visibility.js';
import { setupSection } from './rooms-selftest-setup.js';
import { footSection } from './rooms-selftest-foot.js';
import { watchSection, watchStateSection } from './rooms-selftest-watch.js';
import { warSection } from './rooms-selftest-war.js';
import { opsSection } from './rooms-selftest-ops.js';
import {
  emptyRoomSection, gameLobbySection, loadFailSection, lobbyReadySection, sessionStatesSection, warLobbySection,
} from './rooms-selftest-gamelobby.js';
import { RoomHost } from '../edge/rooms/host.js';

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
check('a tick with nothing new goes on while the sender is held (HOLD_MS)', ticks === 1 && room.ticking === true);
ticks = 0;
now += HOLD_MS;
run(room.tick(now));
check(`and stops once nobody has sent a pose for ${HOLD_MS} ms`, ticks === 0 && room.ticking === false);
run(room.message(b, livePose(), now));
check('the next pose starts it again', ticks === 1);
now += 1000;
room.tick(now);
let stored = 0;
for (let i = 0; i < POSE_PER_S + 5; i += 1) {
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
check(`clock pings over ${CLOCK_PER_S} a second are dropped`, answered === CLOCK_PER_S - 1, `${answered}`);
check('and the client\'s clock sync fits under that', 1000 / SYNC_GAP_MS <= CLOCK_PER_S, `${1000 / SYNC_GAP_MS}`);
now += 1000;
/* b is not the host, so each kick is answered: refused. */
let refusedB = 0;
for (let i = 0; i < 10; i += 1) {
  run(room.message(b, JSON.stringify({ type: 't', c: i }), now));
  const n = b.got.length;
  run(room.message(b, JSON.stringify({ type: 'kick', seat: 1 }), now));
  refusedB += b.got.length - n;
}
check(`other text over ${TEXT_PER_S} a second is dropped, counted apart from the clock`, refusedB === TEXT_PER_S, `${refusedB}`);
now += 1000;
/* A phrase and a wave after a full second of other text: counted on the
 * chat allowance alone (edge/rooms/safety.js), so both reach a. */
for (let i = 0; i < TEXT_PER_S; i += 1) {
  run(room.message(b, JSON.stringify({ type: 'kick', seat: 1 }), now));
}
const heardBefore = texts(a, 'event').length;
run(room.message(b, JSON.stringify({ type: 'event', kind: 'chat', id: 0 }), now));
run(room.message(b, JSON.stringify({ type: 'event', kind: 'emote', id: 0 }), now));
check(`chat and emotes are not counted on the ${TEXT_PER_S} a second of other text`, texts(a, 'event').length - heardBefore === 2, `${texts(a, 'event').length - heardBefore}`);
now += 1000;
for (let i = 0; i <= TEXT_CLOSE_PER_S; i += 1) {
  run(room.message(a, JSON.stringify(i % 2 ? { type: 't', c: i } : { type: 'nothing' }), now));
}
check(`over ${TEXT_CLOSE_PER_S} a second, clock pings and the rest together, closes the socket`, a.closed && a.closed.code === CLOSE.rate);
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
const reseat5 = sock('reseat5', '10.3.0.2');
hello(reseat5, { token: 'f'.repeat(32), seat: 5 });
check('after a restart a known seat is given back to a token the room forgot', texts(reseat5, 'welcome')[0].seat === 5);
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
/* The owner's decision (2026-09-28): the player is kept out, not their
 * address, which is often a household; new joins from it are slowed. */
const fresh = sock('fresh', victim.address);
hello(fresh);
check(`a fresh browser on the kicked player's address, at once, is slowed, not kicked: ${KICKED_JOIN_GAP_MS / 1000} s`,
  fresh.closed && fresh.closed.code === CLOSE.rate);
now += KICKED_JOIN_GAP_MS;
const sibling = sock('sibling', victim.address);
hello(sibling, { name: [7, 8, 70] });
check('a sibling on the same address joins after the wait, the kick notwithstanding', !sibling.closed && texts(sibling, 'welcome').length === 1);
const burst = [];
for (let i = 0; i < 3; i += 1) {
  const b = sock(`burst${i}`, victim.address);
  hello(b, { name: [i, 9, 60 + i] });
  burst.push(b);
}
check('a burst of fresh tokens from that address right after is slowed, every one', burst.every((b) => b.closed && b.closed.code === CLOSE.rate));
const again2 = sock('again2', victim.address);
hello(again2, { token: vw.token });
check('and the kicked token is still refused after the wait', again2.closed && again2.closed.code === CLOSE.kicked);
const elsewhere = sock('elsewhere', '10.0.9.9');
run(room.close(sibling, now));
hello(elsewhere, { name: [2, 2, 22] });
check('another address is not slowed at all', !elsewhere.closed && texts(elsewhere, 'welcome').length === 1);
run(room.close(elsewhere, now));
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
run(room.message(only, JSON.stringify({ type: 'profile', profile: { ...profile, airframe: '7inch' } }), now));
check('a profile change is attached', only.attachment.profile.airframe === '7inch');
/* A tab open from before the five inch and the whoop were removed
 * (2026-10-03) still says them: the room seats the successor, and the old
 * aircraft's paint and parts do not ride along onto it. */
for (const gone of ['5inch', 'whoop65']) {
  run(room.message(only, JSON.stringify({ type: 'profile', profile: { ...profile, airframe: gone, livery: { body: '#ff0000' }, parts: { prop: 'x' } } }), now));
  const seated = only.attachment.profile;
  check(`a profile on the retired ${gone} is seated as the interceptor, its paint and parts dropped`,
    seated.airframe === 'interceptor' && seated.livery === null && seated.parts === null, JSON.stringify(seated));
}
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
{
  /* ACCEL (src/game/peer.js): a peer in a level 20 m/s turn of 15 m, a
   * 2.7 g turn, sampled every 33 ms, drawn 80 ms past its newest sample.
   * On its velocity alone it was drawn on the tangent; on the
   * acceleration its last two velocities give it is drawn on the path. */
  const R = 15;
  const V = 20;
  const turn = (t, flags = 0) => {
    const a = (V / R) * (t / 1000);
    return { flags, seq: 0, t, px: R * Math.cos(a), py: 50, pz: -R * Math.sin(a), qx: 0, qy: 0, qz: 0, qw: 1,
      vx: -V * Math.sin(a), vy: 0, vz: -V * Math.cos(a), wx: 0, wy: 0, wz: 0 };
  };
  const tr = new PeerTrack();
  for (let t = 0; t <= 990; t += 33) {
    tr.push(turn(t), t + 40);
  }
  const lastT = tr.newest().t;
  const at = lastT + 80;
  const o = {};
  tr.sample(at, 1, o);
  const truth = turn(at);
  const off = Math.hypot(o.px - truth.px, o.pz - truth.pz);
  const n = turn(lastT);
  const tangent = Math.hypot(n.px + n.vx * 0.08 - truth.px, n.pz + n.vz * 0.08 - truth.pz);
  check('a turning near peer is drawn on its path, not its tangent', off < 0.01 && tangent > 0.05,
    `${(off * 100).toFixed(2)} cm off, against ${(tangent * 100).toFixed(1)} cm on the tangent`);
  /* A bounce: the velocity reverses between two samples. The present is
   * carried at most ACCEL_MAX, never the hundreds of m/s^2 the step implies. */
  const b = new PeerTrack();
  const still = { flags: 0, seq: 0, t: 0, px: 0, py: 5, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1, vx: 0, vy: -10, vz: 0, wx: 0, wy: 0, wz: 0 };
  b.push(still, 0);
  b.push({ ...still, t: 33, vy: 10 }, 33);
  b.sample(33 + 50, 1, o);
  const extra = o.py - (5 + 10 * 0.05);
  check(`a bounce is carried at no more than ACCEL_MAX (${ACCEL_MAX} m/s^2)`, extra > 0 && extra <= 0.5 * ACCEL_MAX * 0.05 * 0.05 + 1e-9,
    `${(extra * 100).toFixed(1)} cm past its velocity, against ${(0.5 * ACCEL_MAX * 0.0025 * 100).toFixed(1)} at the bound`);
  const c = new PeerTrack();
  c.push({ ...still, flags: FLAG_CRASHED }, 0);
  c.push({ ...still, t: 33, vy: 10, flags: FLAG_CRASHED }, 33);
  c.sample(33 + 50, 1, o);
  check('a crashed peer is carried on its velocity alone', Math.abs(o.py - (5 + 10 * 0.05)) < 1e-9, `${o.py.toFixed(4)}`);
  /* A stream that stalls: the acceleration runs for ACCEL_MS, then the
   * velocity it left, so the peer is not flung away while it waits. */
  const d = new PeerTrack();
  d.push({ ...still, vy: 0 }, 0);
  d.push({ ...still, t: 33, vy: 1 }, 33);
  d.sample(33 + EXTRAP_MAX_MS, 1, o);
  const acc = 1 / 0.033;
  const ta = ACCEL_MS / 1000;
  const want = 5 + 1 * (EXTRAP_MAX_MS / 1000) + acc * ta * (EXTRAP_MAX_MS / 1000 - ta / 2);
  check(`a stalled stream is accelerated for ACCEL_MS (${ACCEL_MS}) only`, Math.abs(o.py - want) < 1e-9, `${o.py.toFixed(4)} for ${want.toFixed(4)}`);
}
track.sample(newestT + 2000 - 60, 1, out);
check(`extrapolation stops at ${EXTRAP_MAX_MS} ms`, Math.abs(out.px - 30 * ((newestT + EXTRAP_MAX_MS) / 1000)) < 0.01, `${out.px.toFixed(3)}`);
check(`nothing for ${STALE_MS} ms is not drawn`, track.sample(newestT + 50 + STALE_MS + 1, 1, out) === false);
check('near is 1 to 60 m, far is 0 from 100 m, linear between', nearWeight(10) === 1 && nearWeight(60) === 1 && nearWeight(80) === 0.5 && nearWeight(100) === 0 && nearWeight(500) === 0);
const before2 = track.poses.length;
track.push(at(10), 5000);
check('an old sample is dropped, never reordered', track.poses.length === before2);
const stillT = track.newest().t;
track.push(at(stillT), 9000);
check('the newest sample again is no new sample, but its pilot is not stale', track.poses.length === before2 && track.sample(9000 + STALE_MS - 1, 1, out) === true);

console.log('a slow page stays in the room');
check(`the room repeats a held pose every ${REPEAT_MS} ms, under the client's STALE_MS`, REPEAT_MS + 2 * TICK_MS < STALE_MS && HOLD_MS > STALE_MS);
/*
 * A pilot whose page draws a frame every FRAME ms sends each frame's 30 Hz
 * poses at once (src/main.js roomPoseStep), and a watcher's page draws
 * them through a PeerTrack every 16 ms, as src/main.js onBatch and
 * roomDrawPeer do. `frames` is when the slow page's frames come, `status`
 * a profile status the slow page sends at that room time, or null.
 * Returns the watcher's track, the room, and how long, after the slow
 * page's first frame, the watcher drew nothing.
 */
function slowRoom({ frame, seconds, stopAt = Infinity, status = null }) {
  let clock = 3_000_000;
  const smeta = { code: 'SLOW22', cap: PRIVATE_CAP, friendly: true, map: 'swiss2', epoch: clock - 1000 };
  const r = new RoomCore(smeta);
  const slow = sock('slow', '10.9.0.1');
  const watcher = sock('watcher', '10.9.0.2');
  const deliver = (actions) => {
    for (const x of actions) {
      if (x.send) {
        x.send.got.push(typeof x.data === 'string' ? JSON.parse(x.data) : x.data);
      }
    }
  };
  for (const [i, s] of [slow, watcher].entries()) {
    deliver(r.open(s, clock));
    deliver(r.message(s, JSON.stringify({ type: 'hello', proto: PROTO, build: 'test', name: [1, 2, 60 + i], profile }), clock, s.address, newToken));
  }
  const seat = r.seats.get(slow).seat;
  const wtrack = new PeerTrack();
  const end = clock + seconds * 1000;
  let nextFrame = clock + frame;
  let nextTick = clock;
  let sentT = clock - smeta.epoch;
  let seq = 0;
  let hiddenMs = 0;
  let lastHeard = null;
  let toldStatus = false;
  for (; clock < end; clock += 1) {
    const roomNow = clock - smeta.epoch;
    if (status && !toldStatus && clock >= stopAt) {
      toldStatus = true;
      deliver(r.message(slow, JSON.stringify({ type: 'profile', profile: { ...profile, status } }), clock));
    }
    if (clock >= nextFrame && clock < stopAt) {
      for (; sentT + 1000 / 30 <= roomNow; sentT += 1000 / 30) {
        seq += 1;
        deliver(r.message(slow, encodePose({ ...pose, flags: FLAG_AIRBORNE, seq, t: Math.round(sentT + 1000 / 30) }), clock));
      }
      nextFrame += frame;
    }
    if (r.ticking && clock >= nextTick) {
      deliver(r.tick(clock));
      nextTick = clock + TICK_MS;
    } else if (!r.ticking) {
      nextTick = clock + TICK_MS;
    }
    for (const m of watcher.got.splice(0)) {
      const b = m instanceof Uint8Array ? decodeBatch(m) : null;
      for (const p of b ? b.poses : []) {
        if (p.seat === seat) {
          wtrack.push(p, roomNow);
          lastHeard = clock;
        }
      }
    }
    if (clock % 16 === 0 && wtrack.newest() && clock < stopAt && !wtrack.sample(roomNow, 1, out)) {
      hiddenMs += 16;
    }
  }
  return { r, wtrack, hiddenMs, lastHeard, end, epoch: smeta.epoch };
}
const slowest = slowRoom({ frame: 2500, seconds: 15 });
check('a pilot whose page draws a frame every 2.5 s is drawn by the others the whole time', slowest.hiddenMs === 0, `${slowest.hiddenMs} ms hidden in 15 s`);
const crawl = slowRoom({ frame: 4500, seconds: 15 });
check('and one at a frame every 4.5 s, still inside HOLD_MS', crawl.hiddenMs === 0, `${crawl.hiddenMs} ms hidden in 15 s`);
const dead = slowRoom({ frame: 1000, seconds: 15, stopAt: 3_000_000 + 4000 });
check('a page that stops sending is repeated no longer than HOLD_MS after its last pose', dead.lastHeard != null && dead.lastHeard <= 3_000_000 + 4000 + HOLD_MS,
  `last heard ${dead.lastHeard - 3_000_000 - 4000} ms after it stopped`);
check('and is then hidden, and the room stops ticking for it', !dead.wtrack.sample(dead.end - dead.epoch, 1, out) && dead.r.ticking === false);
const menu = slowRoom({ frame: 1000, seconds: 8, stopAt: 3_000_000 + 4000, status: 'menu' });
check('a page that says it went to a menu is not repeated at all', menu.lastHeard != null && menu.lastHeard <= 3_000_000 + 4000 + TICK_MS,
  `last heard ${menu.lastHeard - 3_000_000 - 4000} ms after the menu`);

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
  const before3 = texts(wa, 'event').length;
  /* A whack on a builder course's jelly piece, from a tab older than the
   * cut that took the builder out (2026-10-20). */
  run(room.message(wb, JSON.stringify({ type: 'event', kind: 'whack', map: 'swiss2', course: 'k1', i: 42, n: [0, 0, 1], square: 0.8 }), now));
  check('an old tab\'s whack is an event kind nobody owns now, and goes nowhere', texts(wa, 'event').length === before3);
  run(room.message(wb, JSON.stringify({ type: 'event', kind: 'nonsense' }), now));
  check('an event kind nobody owns is ignored', texts(wa, 'event').length === before3);
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
/* The live two page check lost a wave this way: a page that had just
 * joined, or had been stalled, was still syncing its clock (SYNC_PINGS
 * pings, SYNC_GAP_MS apart, src/share/roomclock.js) when the pilot said a
 * phrase and waved, and the pings took the room's text allowance. */
now += 10000;
const [c5, e5] = [events(p5b, 'chat').length, events(p5b, 'emote').length];
for (let i = 0; i < 1000 / SYNC_GAP_MS; i += 1) {
  say(p5a, { type: 't', c: i });
}
say(p5a, { type: 'event', kind: 'chat', id: 1 });
say(p5a, { type: 'event', kind: 'emote', id: EMOTES.indexOf('wave') });
check('a phrase and a wave said while the clock syncs both arrive', events(p5b, 'chat').length === c5 + 1 && events(p5b, 'emote').length === e5 + 1,
  `${events(p5b, 'chat').length - c5} ${events(p5b, 'emote').length - e5}`);

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
run(room.message(twin, JSON.stringify({ type: 'unreport', seat: sa }), now, twin.address, newToken));
const twinBack = texts(twin, 'unreported');
check('nor can it take the first tab\'s report back', twinBack.length === 1 && twinBack[0].undone === false
  && room.safety.reports.filter((r) => r.seat === sa).length === 1);
run(room.close(twin, now));
say(p5c, { type: 'unreport', seat: sa });
check('a pilot who never reported takes nothing back', texts(p5c, 'unreported')[0].undone === false
  && room.safety.reports.filter((r) => r.seat === sa).length === 1);
/* A second on, so the room's text rate (TEXT_PER_S) counts afresh. */
now += 1000;
say(p5b, { type: 'unreport', seat: 'all' });
say(p5b, { type: 'unreport' });
check('an unreport with no seat is refused', texts(p5b, 'unreported').length === 0);
say(p5b, { type: 'unreport', seat: sa });
const back5b = texts(p5b, 'unreported');
check('the reporter takes their own report back, told to them only', back5b.length === 1 && back5b[0].seat === sa && back5b[0].undone === true
  && texts(p5c, 'unreported').length === 1 && texts(p5a2, 'unreported').length === 0 && room.safety.reports.length === 0);
say(p5c, { type: 'report', seat: sa, reason: 1 });
check('so one more pilot\'s report is one report, and removes nobody', !p5a2.closed);
say(p5c, { type: 'unreport', seat: sa });
check('taken back as well', texts(p5c, 'unreported')[1].undone === true && room.safety.reports.length === 0);
say(p5b, { type: 'report', seat: sa, reason: REPORT_REASONS.indexOf('ramming') });
now += REPORT_WINDOW_MS;
say(p5b, { type: 'unreport', seat: sa });
check('a report that no longer counts has nothing to take back', texts(p5b, 'unreported')[1].undone === false);
say(p5b, { type: 'report', seat: sa, reason: REPORT_REASONS.indexOf('ramming') });
say(p5c, { type: 'report', seat: sa, reason: 1 });
check('a second pilot\'s report removes them', p5a2.closed && p5a2.closed.code === CLOSE_REMOVED);
check('and the room sees them leave', texts(p5b, 'leave').some((m) => m.seat === sa));
const back5 = sock('back5', '10.5.0.1');
hello(back5, { token: texts(p5a, 'welcome')[0].token });
check('back with their token is refused', back5.closed && back5.closed.code === CLOSE.kicked);
const back6 = sock('back6', '10.5.0.1');
hello(back6);
check('a fresh browser on their address is slowed, not refused as them', back6.closed && back6.closed.code === CLOSE.rate);
now += KICKED_JOIN_GAP_MS;
const back6b = sock('back6b', '10.5.0.1');
hello(back6b, { name: [6, 6, 66] });
check('and gets in after the wait, as a sibling would', !back6b.closed && texts(back6b, 'welcome').length === 1);
run(room.close(back6b, now));
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

console.log('phase 5: a report asks first, and can be taken back');
room = new RoomCore(meta);
const [ra, rb, rc] = ['ra', 'rb', 'rc'].map((name, i) => {
  const s = sock(name, `10.9.0.${i + 1}`);
  hello(s);
  return s;
});
/* ra's own client (src/share/roomsafety.js), its messages put straight
 * into the room a second apart, so the text rate never decides. */
const sentByRa = [];
const raSafety = createRoomSafety((m) => {
  sentByRa.push(m);
  now += 1000;
  run(room.message(ra, JSON.stringify(m), now, ra.address, newToken));
}, (seat) => `pilot ${seat}`);
const rbSeat = seatOf(rb);
const reasonOf = (id) => `report:${REPORT_REASONS.indexOf(id)}`;
const optionValues = (seat) => raSafety.peerOptions(seat, false).map((o) => o.value);
raSafety.peerPick(rbSeat, reasonOf('ramming'));
check('picking a reason sends nothing yet', sentByRa.length === 0 && room.safety.reports.length === 0 && !raSafety.isMuted(rbSeat));
check('the row asks, with only Confirm and Cancel', raSafety.question(rbSeat) === str('friends.report_confirm', { name: `pilot ${rbSeat}`, reason: str('rooms.report.ramming') })
  && optionValues(rbSeat).join() === 'confirm,cancel');
raSafety.peerPick(rbSeat, 'cancel');
check('cancel sends nothing, and the row is the pilot\'s again', sentByRa.length === 0 && raSafety.question(rbSeat) === null && optionValues(rbSeat)[0] === 'mute');
raSafety.peerPick(rbSeat, reasonOf('spam'));
raSafety.peerPick(rbSeat, 'confirm');
check('confirm sends the report and the mute', sentByRa.map((m) => m.type).join() === 'report,mute' && sentByRa[0].reason === REPORT_REASONS.indexOf('spam')
  && room.safety.reports.length === 1 && raSafety.isMuted(rbSeat) && ra.attachment.muted.length === 1);
check('then the pilot\'s row takes it back, and reports them no more', optionValues(rbSeat).join() === 'unmute,unreport,unreport_unmute');
check(`and an Undo row sits under it for ${UNDO_MS / 1000} s`, raSafety.undoRows(rbSeat).length === 1 && raSafety.undoRows(seatOf(rc)).length === 0);
raSafety.undoRows(rbSeat)[0].pick('unreport');
raSafety.unreported(rbSeat, texts(ra, 'unreported')[0].undone);
check('undo takes the report back in the room and keeps the mute', room.safety.reports.length === 0 && raSafety.isMuted(rbSeat)
  && ra.attachment.muted.length === 1 && raSafety.note() === str('friends.unreported', { name: `pilot ${rbSeat}` }));
check('and the row offers the reasons again, and unmute on its own', optionValues(rbSeat).join() === `unmute,${[0, 1, 2].map((i) => `report:${i}`).join()}`);
raSafety.peerPick(rbSeat, reasonOf('following'));
raSafety.peerPick(rbSeat, 'confirm');
check('a report on a pilot already muted does not own the mute', optionValues(rbSeat).join() === 'unmute,unreport');
raSafety.peerPick(rbSeat, 'unmute');
raSafety.peerPick(seatOf(rc), reasonOf('ramming'));
raSafety.peerPick(seatOf(rc), 'confirm');
say(rb, { type: 'report', seat: seatOf(rc), reason: 0 });
check('two reports in a room of three remove a pilot, as before', rc.closed && rc.closed.code === CLOSE_REMOVED);
raSafety.peerPick(rbSeat, 'unreport');
check('and a report taken back from the row is gone from the room', !room.safety.reports.some((r) => r.seat === rbSeat));
room = new RoomCore(meta);
const [ua, ub] = ['ua', 'ub'].map((name, i) => {
  const s = sock(name, `10.9.1.${i + 1}`);
  hello(s);
  return s;
});
const uaSafety = createRoomSafety((m) => {
  now += 1000;
  run(room.message(ua, JSON.stringify(m), now, ua.address, newToken));
}, (seat) => `pilot ${seat}`);
uaSafety.peerPick(seatOf(ub), reasonOf('spam'));
uaSafety.peerPick(seatOf(ub), 'confirm');
uaSafety.peerPick(seatOf(ub), 'unreport_unmute');
check('undo and unmute takes back the report and the mute that came with it', room.safety.reports.length === 0 && !uaSafety.isMuted(seatOf(ub))
  && ua.attachment.muted.length === 0);

console.log('blocks: a mute that outlasts the room (COMPLETENESS 60)');
{
  room = new RoomCore(meta);
  const [ka, kb, kc] = ['ka', 'kb', 'kc'].map((name, i) => {
    const s = sock(name, `10.9.2.${i + 1}`);
    hello(s);
    return s;
  });
  /* The account as src/share/account.js keeps it, its server's answers
   * at once; kc is a guest, with no callsign to block. */
  const kept = [];
  const calls = [];
  let refuse = false;
  const adapter = {
    callsignOf: (seat) => (seat === seatOf(kc) ? null : `Pilot${seat}`),
    held: () => kept.slice(),
    setBlocked: async (c, on) => {
      calls.push(`${c}:${on}`);
      if (refuse) {
        throw new Error('down');
      }
      if (on) {
        kept.push(c);
      } else {
        kept.splice(kept.indexOf(c), 1);
      }
      return kept.slice();
    },
    fetch: async () => kept.slice(),
  };
  const settle = () => new Promise((r) => setTimeout(r, 0));
  const ka1 = createRoomSafety((m) => {
    now += 1000;
    run(room.message(ka, JSON.stringify(m), now, ka.address, newToken));
  }, (seat) => `pilot ${seat}`, () => {}, adapter);
  const kbSeat = seatOf(kb);
  const opts = (seat) => ka1.peerOptions(seat, false).map((o) => o.value).filter((v) => !v.startsWith('report:'));
  check('a signed in pilot\'s row offers Block beside Mute', opts(kbSeat).join() === 'mute,block');
  check('a guest\'s row does not: there is no account to keep it on', opts(seatOf(kc)).join() === 'mute');
  const signedOut = createRoomSafety(() => {}, (seat) => `pilot ${seat}`, () => {}, { ...adapter, held: () => null });
  check('nor does anybody\'s while this pilot is signed out', signedOut.peerOptions(kbSeat, false)[0].value === 'mute'
    && !signedOut.peerOptions(kbSeat, false).some((o) => o.value === 'block'));
  ka1.peerPick(kbSeat, 'block');
  check('Block mutes in this room at once, since the room learns blocks only at a join',
    ka1.isMuted(kbSeat) && ka.attachment.muted.length === 1 && calls.join() === `Pilot${kbSeat}:true`);
  await settle();
  check('and keeps it on the account, the row then offering only Unblock', kept.join() === `Pilot${kbSeat}` && opts(kbSeat).join() === 'unblock'
    && ka1.note() === str('friends.blocked_note', { name: `pilot ${kbSeat}` }));
  ka1.peerPick(kbSeat, 'unblock');
  await settle();
  check('Unblock takes it off the account and the room\'s mute', kept.length === 0 && ka.attachment.muted.length === 0
    && ka1.note() === str('friends.unblocked_note', { name: `pilot ${kbSeat}` }));
  check('but the seat reads muted, with nothing to pick, until the next join', ka1.isMuted(kbSeat) && opts(kbSeat).join() === '');
  ka1.welcomed();
  check('after which it is an ordinary seat again', !ka1.isMuted(kbSeat) && opts(kbSeat).join() === 'mute,block');
  kept.push(`pilot${kbSeat}`);
  ka1.welcomed();
  await settle();
  check('a block from another computer arrives at the next welcome and mutes the seat with nothing sent, whatever the case',
    ka1.isMuted(kbSeat) && ka.attachment.muted.length === 0 && opts(kbSeat).join() === 'unblock');
  kept.length = 0;
  ka1.welcomed();
  await settle();
  refuse = true;
  ka1.peerPick(kbSeat, 'block');
  await settle();
  check('a block the account could not keep says so, and the room\'s mute holds', ka1.note() === str('friends.block_failed', { name: `pilot ${kbSeat}` })
    && ka1.isMuted(kbSeat) && opts(kbSeat).join() === 'unmute,block');
}

console.log('phase 5: kicks and caps');
const pubMeta = {
  code: 'PBLC23', public: true, cap: PUBLIC_CAP, friendly: false, map: 'swiss2', epoch: now - 5000, name: 'Sky Club', pick: [1, 2, 33], mode: null, hidden: false,
};
room = new RoomCore(pubMeta);
const pub = [];
for (let i = 0; i < PUBLIC_CAP + 1; i += 1) {
  const s = sock(`pub${i}`, `10.7.0.${i}`);
  hello(s);
  pub.push(s);
}
const wp = texts(pub[0], 'welcome')[0];
check(`a public room holds ${PUBLIC_CAP} and says it is public, with its code and name`, room.seats.size === PUBLIC_CAP && wp.public === true && wp.cap === PUBLIC_CAP
  && wp.code === 'PBLC23' && wp.name === 'Sky Club' && wp.pick.join() === '1,2,33');
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
check('the room\'s speed limit is 100 m/s, the leaderboard\'s teleport speed', POSE_MAX_SPEED === 100);
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

/*
 * No ramming bench (the owner, 2026-09-29: "kill anti ramming rule"). Two
 * Cubs fly back and forth along one line, 30 m either side of the middle
 * at 15 m/s, mirror images, so they meet head on in the middle every 4 s,
 * each pass through the room's own referee: twenty mid airs in 82 s.
 */
console.log('phase 5: every mid air counts');
{
  room = new RoomCore(meta);
  const r1 = sock('r1', '10.9.1.1');
  const r2 = sock('r2', '10.9.1.2');
  hello(r1);
  hello(r2);
  const LEG_MS = 4000;
  const start = now;
  /* A's x at ms u of the flight: -30 to 30 and back, and its heading. */
  const legOf = (u) => {
    const k = Math.floor(u / LEG_MS);
    const f = (u - k * LEG_MS) / LEG_MS;
    const dir = k % 2 === 0 ? 1 : -1;
    return { x: dir * (60 * f - 30), dir };
  };
  const cubAt = (x, dir) => encodePose({
    flags: FLAG_AIRBORNE, seq: 1, t: now - meta.epoch, px: x, py: 80, pz: 0,
    qx: 0, qy: dir > 0 ? -Math.SQRT1_2 : Math.SQRT1_2, qz: 0, qw: Math.SQRT1_2,
    vx: 15 * dir, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, c0: 0, c1: 0, c2: 0, c3: 0, motor: 0, flaps: 0,
  });
  let flagged = 0;
  const MEETS = 20;
  const endAt = start + LEG_MS / 2 + MEETS * LEG_MS + 1000;
  while (now < endAt) {
    now += 33;
    const { x, dir } = legOf(now - start);
    run(room.message(r1, cubAt(x, dir), now));
    run(room.message(r2, cubAt(-x, -dir), now));
    const n = r1.got.length;
    run(room.tick(now));
    /* Past the first pose's spawn protection, nobody is marked spawning. */
    if (now - start > SPAWN_MS + 100) {
      for (const m of r1.got.slice(n).filter((q) => q instanceof Uint8Array)) {
        flagged += decodeBatch(m).poses.filter((q) => (q.flags & FLAG_SPAWNING) !== 0).length;
      }
    }
  }
  const hitsOf = (s) => texts(s, 'hit');
  const h1 = hitsOf(r1);
  const h2 = hitsOf(r2);
  const span = h1.length ? h1.at(-1).tc - h1[0].tc : 0;
  check(`${MEETS} head on passes after the spawn protection: ${MEETS} mid airs, every one sent to both pilots`,
    h1.length === MEETS && JSON.stringify(h1) === JSON.stringify(h2), `${h1.length} and ${h2.length}`);
  check('all of them inside five minutes', span > 0 && span < 5 * 60 * 1000, `${(span / 1000).toFixed(1)} s from the first to the last`);
  for (const nth of [5, 10, 20]) {
    const h = h1[nth - 1];
    check(`the ${nth}th mid air in five minutes still counts: a hit between the two, with a part broken on each`,
      Boolean(h) && [h.a, h.b].sort().join() === [seatOf(r1), seatOf(r2)].sort().join() && h.A.brk > 0 && h.B.brk > 0,
      h ? `${((h.tc - h1[0].tc) / 1000).toFixed(1)} s after the first` : 'none');
  }
  check('and neither pilot is ever made untouchable for it: no relayed pose is marked spawning', flagged === 0, `${flagged} marked`);
}

/* The public lobby became the room browser's: scripts/rooms-selftest-browser.js. */

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

warSection(check);
opsSection(check);
warLobbySection(check);
gameLobbySection(check);
lobbyReadySection(check);
emptyRoomSection(check);
loadFailSection(check);
sessionStatesSection(check);
sessionSection(check);
weatherSection(check);
stockSurfacesSection(check);
visibilitySection(check);
setupSection(check);
footSection(check);
watchSection(check);
watchStateSection(check);
await browserSection(check);
await blocksSection(check);
await scaleSection(check);

/* ---------------------------------------------------------------------
 * Stale games and the host: a refused host action says why, and the host
 * is the same pilot across a restart. A game a restart restored with its
 * players gone for good was ended here on Catch the Ace and Streamer
 * Combat, whose players were fixed at their start, until both left in
 * the combat-only cut (2026-10-20). The war enlists whoever comes
 * (war.js join), so a war a restart restored is its newcomers'; one whose
 * pilots cannot fly it is ended by the room (rooms-selftest-gamelobby.js,
 * a load failure counted out).
 * ------------------------------------------------------------------- */
console.log('stale games and the host');
{
  const quad = { airframe: 'interceptor', map: 'itaipu', figure: 1, livery: null, parts: null };
  const smeta = { code: 'K7PZ2M', cap: PRIVATE_CAP, friendly: false, map: 'itaipu', epoch: 0 };
  let clock = 1000;
  /* A room as host.js loads it from `kept` (storage), its sockets `socks`. */
  const load = async (kept, socks = []) => {
    const h = new RoomHost({
      storage: { get: async (k) => kept.get(k), list: async () => kept, getAlarm: async () => null },
      getWebSockets: () => socks,
    }, {});
    return h.load();
  };
  const apply = (kept) => (actions) => {
    for (const x of actions) {
      if (x.send) {
        x.send.got.push(typeof x.data === 'string' ? JSON.parse(x.data) : x.data);
      } else if (x.store && kept) {
        kept.set(x.store, JSON.parse(JSON.stringify(x.value)));
      }
    }
    return actions;
  };
  const join = (r, so, kept, extra = {}) => {
    apply(kept)(r.open(so, clock));
    return apply(kept)(r.message(so, JSON.stringify({ type: 'hello', proto: PROTO, build: 't', name: [2, 3, 30], profile: quad, ...extra }), clock, so.address, newToken));
  };
  const say = (r, so, obj, kept) => apply(kept)(r.message(so, JSON.stringify(obj), clock, so.address));
  const refusals = (so) => texts(so, 'refused').map((m) => m.why);
  const WAR_START = { type: 'war', op: 'start', mission: 'itaipu-1' };

  /* A war its players are in holds the room: another game's start is
   * refused, with the reason, and so is a pilot who is not the host. */
  const r3 = new RoomCore(smeta);
  const p3 = [0, 1].map((i) => sock(`p3${i}`, `10.7.3.${i + 1}`));
  for (const so of p3) {
    join(r3, so, null);
  }
  say(r3, p3[0], WAR_START, null);
  say(r3, p3[0], { type: 'ops', op: 'start', mission: 'interior-1' }, null);
  say(r3, p3[1], WAR_START, null);
  say(r3, p3[1], { type: 'war', op: 'end' }, null);
  check('a start under a running war is refused: "war", to the host', r3.war.on() && !r3.ops.on() && refusals(p3[0]).join() === 'war', refusals(p3[0]).join());
  check('a host action from a pilot who is not the host is refused: "host"', refusals(p3[1]).join() === 'host,host' && r3.war.on());

  /* The host across a restart: A made the room, B joined; the server
   * restarts and B reconnects first. B acts for A until A is back, then A
   * is the host again, and everybody is told. */
  const hk = new Map([['meta', smeta]]);
  const r4 = new RoomCore(smeta);
  const A = sock('hostA', '10.7.4.1');
  const B = sock('hostB', '10.7.4.2');
  join(r4, A, hk);
  join(r4, B, hk);
  const wA = texts(A, 'welcome')[0];
  const wB = texts(B, 'welcome')[0];
  check('the pilot who made the room is its host, and it is stored', r4.host() === wA.seat && hk.get('hosting').token === wA.token);
  const r5 = await load(hk);
  const B2 = sock('hostB2', '10.7.4.2');
  const A2 = sock('hostA2', '10.7.4.1');
  join(r5, B2, hk, { token: wB.token, seat: wB.seat });
  check('B back first acts as host while A is away', r5.host() === wB.seat && texts(B2, 'welcome')[0].host === wB.seat);
  clock += 2000;
  join(r5, A2, hk, { token: wA.token, seat: wA.seat });
  check('A back: the host again, in A\'s welcome', r5.host() === wA.seat && texts(A2, 'welcome')[0].host === wA.seat);
  check('and B is told the host changed', texts(B2, 'host').at(-1).seat === wA.seat);
  say(r5, B2, WAR_START, hk);
  check('so B\'s start is refused as not the host', refusals(B2).join() === 'host' && !r5.war.on());
  /* A leaves and does not come back: B acts at once, and the room is B's
   * for good once RESEAT_MS has gone by. */
  apply(hk)(r5.close(A2, clock));
  check('the host gone, B is told it acts for them', texts(B2, 'host').at(-1).seat === wB.seat && r5.host() === wB.seat);
  clock += RESEAT_MS + 100;
  apply(hk)(r5.tick(clock));
  check('and after RESEAT_MS the room is B\'s, stored', hk.get('hosting').token === wB.token);

  /* Handing the room over: only the host can, only to a pilot here. */
  const hh = new Map([['meta', smeta]]);
  const r6 = new RoomCore(smeta);
  const H = sock('handA', '10.7.6.1');
  const G = sock('handB', '10.7.6.2');
  join(r6, H, hh);
  join(r6, G, hh);
  const wG = texts(G, 'welcome')[0];
  say(r6, G, { type: 'handhost', seat: 1 }, hh);
  check('a pilot who is not the host cannot take it: refused "host"', refusals(G).join() === 'host' && r6.host() === 1);
  say(r6, H, { type: 'handhost', seat: 7 }, hh);
  check('nor can the host hand it to a seat nobody holds: refused "gone"', refusals(H).join() === 'gone' && r6.host() === 1);
  say(r6, H, { type: 'handhost', seat: wG.seat }, hh);
  check('the host hands it over: everybody is told, and it is stored', r6.host() === wG.seat && hh.get('hosting').token === wG.token
    && texts(H, 'host').at(-1).seat === wG.seat && texts(G, 'host').at(-1).seat === wG.seat);
  say(r6, H, WAR_START, hh);
  say(r6, G, WAR_START, hh);
  check('then the old host\'s start is refused and the new host\'s runs', refusals(H).at(-1) === 'host' && r6.war.on());

  /* A room made before the host was stored: the first pilot back after a
   * restart holds it, and is stored, so the next restart keeps it. */
  const old = new Map([['meta', smeta]]);
  const r7 = await load(old);
  const F = sock('first', '10.7.7.1');
  join(r7, F, old, { token: 'a'.repeat(32), seat: 2 });
  check('a room with no stored host: the first pilot back holds it, stored, and its welcome says so',
    r7.host() === texts(F, 'welcome')[0].seat && texts(F, 'welcome')[0].host === texts(F, 'welcome')[0].seat && old.get('hosting').token === texts(F, 'welcome')[0].token);
}

console.log('the room tick keeps the clock');
{
  /*
   * RoomHost's tick on a stand-in clock: every timer fires `late` ms after
   * it was asked for, as on an event loop that is always that busy, and
   * once, `stallAt`, a timer fires `stall` ms late. The core is a stand-in
   * that wants ticking for ever and records when each tick ran.
   */
  const tickTimes = ({ late, seconds, stallAt = Infinity, stall = 0 }) => {
    const real = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, now: Date.now };
    const start = 9_000_000;
    let clock = start;
    let pending = null;
    const ran = [];
    globalThis.setTimeout = (fn, ms) => {
      pending = { at: clock + Math.max(0, ms) + late, fn };
      return pending;
    };
    globalThis.clearTimeout = () => {
      pending = null;
    };
    Date.now = () => clock;
    try {
      const h = new RoomHost({ storage: {}, getWebSockets: () => [] }, {});
      h.core = {
        meta: { public: false },
        tick: (now) => {
          ran.push(now);
          return [{ tick: true }];
        },
      };
      h.run([{ tick: true }]);
      let stalled = false;
      while (pending && clock < start + seconds * 1000) {
        const p = pending;
        pending = null;
        clock = p.at;
        if (!stalled && clock >= stallAt) {
          stalled = true;
          clock += stall;
        }
        p.fn();
      }
    } finally {
      globalThis.setTimeout = real.setTimeout;
      globalThis.clearTimeout = real.clearTimeout;
      Date.now = real.now;
    }
    return ran;
  };
  const rate = (ran) => (ran.length - 1) / ((ran.at(-1) - ran[0]) / 1000);
  const busy = tickTimes({ late: 5, seconds: 10 });
  check(`with every timer 5 ms late the room still ticks at ${(1000 / TICK_MS).toFixed(0)} Hz`, Math.abs(rate(busy) - 1000 / TICK_MS) < 0.1, `${rate(busy).toFixed(2)} Hz`);
  const busier = tickTimes({ late: 25, seconds: 10 });
  check('and with every timer 25 ms late', Math.abs(rate(busier) - 1000 / TICK_MS) < 0.1, `${rate(busier).toFixed(2)} Hz`);
  const stalled = tickTimes({ late: 1, seconds: 3, stallAt: 9_001_000, stall: 400 });
  const gaps = stalled.slice(1).map((t, i) => t - stalled[i]);
  /*
   * The ticks now keep time with the senders, 30 Hz each, so a sender's
   * jitter puts two of its poses between two ticks over and over. Every
   * one of them must still reach a near peer, in order (core.js
   * RECENT_POSES): poses every 1000 / 30 ms in phase with the ticks,
   * each up to 4 ms early or late, ticks exactly every TICK_MS.
   */
  const jstart = 10_000_000;
  const jr = new RoomCore({ code: 'JITTR2', cap: PRIVATE_CAP, friendly: true, map: 'swiss2', epoch: jstart - 1000 });
  const sender = sock('jsender', '10.9.1.1');
  const near = sock('jnear', '10.9.1.2');
  for (const [i, so] of [sender, near].entries()) {
    run(jr.open(so, jstart));
    run(jr.message(so, JSON.stringify({ type: 'hello', proto: PROTO, build: 'test', name: [1, 2, 70 + i], profile }), jstart, so.address, newToken));
  }
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const sendAt = [];
  for (let k = 0; k < 300; k += 1) {
    sendAt.push(Math.round(jstart + TICK_MS + (k * 1000) / 30 + (rand() * 8 - 4)));
  }
  const relayed = new Set();
  let twoInOne = 0;
  let nextJTick = jstart + TICK_MS;
  let sinceTick = 0;
  for (let clock = jstart, k = 0; clock <= sendAt.at(-1) + 200; clock += 1) {
    for (; k < sendAt.length && sendAt[k] <= clock; k += 1) {
      run(jr.message(sender, encodePose({ ...pose, flags: FLAG_AIRBORNE, seq: k, t: sendAt[k] - jr.meta.epoch }), clock));
      sinceTick += 1;
    }
    if (clock >= nextJTick) {
      twoInOne += sinceTick > 1 ? 1 : 0;
      sinceTick = 0;
      run(jr.tick(clock));
      nextJTick += TICK_MS;
    }
  }
  for (const m of near.got) {
    for (const p of m instanceof Uint8Array ? decodeBatch(m).poses : []) {
      relayed.add(p.t);
    }
  }
  check('with a sender\'s jitter putting two poses between ticks, a near peer is still sent every pose', twoInOne > 10 && relayed.size === sendAt.length,
    `${relayed.size} of ${sendAt.length} relayed, ${twoInOne} ticks with two`);
  check('a stall of 400 ms is one long gap, not a burst of ticks to catch up', Math.min(...gaps) >= TICK_MS - 1 && gaps.filter((g) => g > 2 * TICK_MS).length === 1,
    `shortest gap ${Math.min(...gaps).toFixed(1)} ms`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
