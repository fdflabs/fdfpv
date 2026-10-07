/*
 * collide-state-selftest.js: pin the stateful edges of src/game/collide.js
 * as a transcript. Plain Node, no browser. Run with npm run
 * collide-state:selftest.
 *
 * Covers what collide:golden reaches only in passing: the clip watch over
 * scripted and seeded frame streams (its whole object after every tick),
 * setCraftAirframe over every airframe in configs/airframes.js and bad
 * dimension sets (the seated live bindings after each, throws included),
 * the moving and box setters, and a Colliders' own fields after
 * construction, after build and after hit() calls that miss, hit and bail.
 * Floats are recorded exactly (canon prints the shortest round trip), so a
 * one-bit drift moves the digest. See scripts/lib/transcript.js.
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

import * as C from '../src/game/collide.js';
import { AIRFRAMES, airframeById } from '../configs/airframes.js';
import { canon, transcript, seeded, pick } from './lib/transcript.js';

const t = transcript();

const BINDINGS = ['CRAFT_ARM', 'CRAFT_PROP_R', 'CRAFT_HULL_R', 'CRAFT_R', 'CRAFT_WORLD_R', 'CRAFT_WORLD_ARM_AXIS',
  'CRAFT_WORLD_HULL', 'CRAFT_V_DOWN', 'CRAFT_V_UP', 'CRAFT_V_HALF', 'CRAFT_V_OFF', 'CRAFT_WORLD_V_HALF',
  'CRAFT_WORLD_V_OFF'];
const seated = () => BINDINGS.map((k) => C[k]);
const FIVE_INCH = seated();

/* ------------------------------------------------------------- airframes */

t.note('five inch at load', FIVE_INCH);
const dimSets = [
  ...AIRFRAMES.map((a) => [a.id, a.dims]),
  ['unknown id', airframeById('no-such-craft')?.dims],
  ['undefined', undefined],
  ['null', null],
  ['legacy vHalf', { arm: 0.1, propR: 0.05, vHalf: 0.04 }],
  ['hull inside prop', { arm: 0.2, propR: 0.09, hullR: 0.05, vHalfDown: 0.03, vHalfUp: 0.03 }],
  ['no vertical', { arm: 0.2, propR: 0.05, hullR: 0.06 }],
  ['zero up', { arm: 0.2, propR: 0.05, vHalfDown: 0.02, vHalfUp: 0 }],
  ['NaN arm', { arm: NaN, propR: 0.05, vHalfDown: 0.02, vHalfUp: 0.03 }],
];
for (const [name, dims] of dimSets) {
  t.rec(`setCraftAirframe ${name}`, () => C.setCraftAirframe(dims));
  t.note(`seated after ${name}`, seated());
  t.note(`vertical after ${name}`, [C.craftVerticalHalf?.(), C.craftVerticalOffset?.()]);
}
C.setCraftAirframe(airframeById('5inch').dims);
t.note('back on the five inch', seated());

/* ------------------------------------------------------------ clip watch */

const BASE = {
  launchStaging: false, hold: false, poseLock: false, spawnGrace: false, landed: false, turtle: false,
  interiorDepth: -1, unresolved: false, roofContact: false, buriedDepth: 0, x: 0, y: 1, z: 0, contact: false,
  takingOff: false, rateMag: 0, throttle: 0.2,
};
const tick = (label, w, over, dt) => {
  t.rec(label, () => [C.clipWatchTick(w, { ...BASE, ...over }, dt), w]);
};
const run = (name, steps, w = C.makeClipWatch()) => {
  let n = 0;
  for (const [over, dt, count] of steps) {
    for (let k = 0; k < count; k += 1) {
      const o = typeof over === 'function' ? over(n) : over;
      tick(`${name} ${n}`, w, o, dt);
      n += 1;
    }
  }
  return w;
};
t.note('fresh watch', C.makeClipWatch());
t.note('constants', [C.CLIP_CENTER_EPS, C.CLIP_DEEP, C.CLIP_CRASH_HOLD_MS, C.CLIP_SPAWN_GRACE_MS]);
run('deep', [[{ interiorDepth: C.CLIP_DEEP }, 16, 1]]);
run('inside then out', [[{ interiorDepth: 0.03 }, 16, 5], [{}, 16, 2], [{ interiorDepth: 0.03 }, 16, 12]]);
/* Stuck and thrash each: arm, run to the limit having moved (re-arm), run
 * again standing still (fire), and drop out (disarm). */
for (const pre of [-1e6, -400]) {
  const w = C.makeClipWatch();
  w.insideMs = pre;
  run(`stuck ${pre}`, [[(n) => ({ unresolved: true, interiorDepth: 0.02, x: n < 40 ? n * 0.05 : 2 }), 10, 80],
    [{ unresolved: true, interiorDepth: 0.02, roofContact: true }, 10, 2], [{ unresolved: true, interiorDepth: 0.02, landed: 1 }, 10, 2],
    [{ unresolved: true, interiorDepth: 0.02, x: 3 }, 10, 40]], w);
}
run('thrash', [[(n) => ({ contact: true, rateMag: 15, x: n < 60 ? n * 0.05 : 3 }), 12, 150],
  [{ contact: true, throttle: 0.9, turtle: true }, 12, 2], [{ contact: true, throttle: 0.9, takingOff: true }, 12, 2],
  [{ contact: 0, rateMag: 40 }, 12, 2], [{ contact: 'y', throttle: 1 }, 12, 80]]);
run('buried', [[{ buriedDepth: 0.3 }, 20, 10], [{ buriedDepth: 0.3, turtle: true }, 20, 2], [{ buriedDepth: 0.3 }, 20, 40]]);
for (const gate of ['launchStaging', 'hold', 'poseLock', 'spawnGrace']) {
  const w = run(`before ${gate}`, [[{ unresolved: true, interiorDepth: 0.02, contact: true, rateMag: 20, buriedDepth: 1 }, 7, 6]]);
  tick(`gate ${gate}`, w, { [gate]: true, interiorDepth: 1 }, 16);
}
run('odd dt', [[{ interiorDepth: 0.02, contact: true, rateMag: 20, buriedDepth: 1 }, -3, 2],
  [{ interiorDepth: 0.02 }, Infinity, 1], [{ interiorDepth: 0.02 }, undefined, 1]]);
for (const seed of [11, 12, 13]) {
  const r = seeded(seed);
  const w = C.makeClipWatch();
  const s = { ...BASE };
  for (let k = 0; k < 400; k += 1) {
    if (r() < 0.1) s[pick(r, ['landed', 'turtle', 'unresolved', 'roofContact', 'contact', 'takingOff'])] = r() < 0.5;
    if (r() < 0.02) s[pick(r, ['hold', 'spawnGrace', 'poseLock', 'launchStaging'])] = r() < 0.3;
    if (r() < 0.1) s.interiorDepth = pick(r, [-1, 0, 0.005, 0.0100001, 0.04, 0.0799, NaN]);
    if (r() < 0.08) s.buriedDepth = pick(r, [0, 0.21, 0.22, 0.5]);
    if (r() < 0.1) s.rateMag = pick(r, [0, 11.99, 12, 50]);
    if (r() < 0.1) s.throttle = pick(r, [0, 0.549, 0.55, 1]);
    s.x += r() * 0.02 - 0.004;
    s.y += r() * 0.004 - 0.002;
    s.z -= r() * 0.01;
    t.rec(`seed${seed} ${k}`, () => [C.clipWatchTick(w, { ...s }, pick(r, [16, 16, 8, 33, 0])), w]);
  }
}
const foreign = { extra: 'kept', stuckMs: 9, haveThrash: true };
t.rec('reset foreign', () => [C.resetClipWatch(foreign) === foreign, foreign]);

/* -------------------------------------------------------------- Colliders */

const own = (c) => {
  const out = {};
  for (const k of Object.keys(c)) {
    const v = c[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && !ArrayBuffer.isView(v) ? `<${v.constructor?.name}>` : v;
  }
  return out;
};
const HIT = ['hitIndex', 'hitKind', 'hitT', 'hitOverlap', 'hitNormalDot', 'hitNx', 'hitNy', 'hitNz', 'hitPen',
  'hitMoving', 'hitArm', 'hitArmX', 'hitArmY', 'hitArmZ', 'hitPart'];
const report = (c) => HIT.map((k) => c[k]);

const fresh = new C.Colliders();
t.note('constructed', own(fresh));
t.note('constructed keys', Object.keys(fresh));
t.rec('hit before build', () => [fresh.hit(0, 1, 0, 0, 0.5, 0), report(fresh)]);
t.rec('setBoxTop before build', () => fresh.setBoxTop(0, 1));
t.rec('setBoxExtentY before build', () => fresh.setBoxExtentY(0, 0, 1));

const c = new C.Colliders();
c.addBox('wall', -1, 0, -1, 1, 2, 1);
c.add('pole', 5, 0, 5, 5, 4, 5, 0.2);
c.addBox('wall', 10, 0, 10, 12, 1, 12);
const train = c.addMoving('train', 1, 1, 3);
const car = c.addMoving('train', 0.5, 0.5, 1);
c.build();
t.rec('moving after add', () => [c.movingCount, c.movingCx, c.movingPx, c.movingCy, c.movingPy, c.movingCz, c.movingPz]);
t.rec('seatMoving', () => c.seatMoving(train, 20, 1, -5) === c);
t.rec('setMovingCentre', () => c.setMovingCentre(train, 20.5, 1.25, -5.5) === c);
t.rec('setMovingCentre again', () => c.setMovingCentre(train, 21, 1.5, -6) === c);
t.rec('setMovingCentre car', () => c.setMovingCentre(car, -0, NaN, 3) === c);
t.rec('moving now', () => [c.movingCx, c.movingCy, c.movingCz, c.movingPx, c.movingPy, c.movingPz]);
t.rec('seatMoving car', () => [c.seatMoving(car, 1, 2, 3) === c, c.movingCx, c.movingPx, c.movingPy, c.movingPz]);
const boxes = () => [0, 1, 2].map((i) => [c.fay[i], c.fby[i]]);
for (const [label, fn] of [
  ['setBoxExtentY ok', () => c.setBoxExtentY(0, -0.5, 3) === c],
  ['setBoxExtentY flat', () => c.setBoxExtentY(2, 1, 1) === c],
  ['setBoxExtentY inverted', () => c.setBoxExtentY(0, 3, 2)],
  ['setBoxExtentY NaN', () => c.setBoxExtentY(0, NaN, 2)],
  ['setBoxExtentY capsule', () => c.setBoxExtentY(1, 0, 2)],
  ['setBoxExtentY out of range', () => c.setBoxExtentY(99, 0, 2)],
  ['setBoxTop ok', () => c.setBoxTop(0, 4) === c],
  ['setBoxTop at bottom', () => c.setBoxTop(2, 1) === c],
  ['setBoxTop below', () => c.setBoxTop(0, -1)],
  ['setBoxTop NaN', () => c.setBoxTop(0, NaN)],
  ['setBoxTop capsule', () => c.setBoxTop(1, 9)],
]) {
  t.rec(label, fn);
  t.note(`boxes after ${label}`, boxes());
}
t.note('built', own(c));
const hits = [
  ['miss', [30, 5, 30, 31, 5, 31]],
  ['into wall', [-3, 1, 0, -0.5, 1, 0]],
  ['into pole', [3, 1, 5, 5, 1, 5]],
  ['into train', [17, 1, -6, 21, 1.5, -6]],
  ['into wall turned', [-3, 1, 0, -0.5, 1, 0, 0.05, 0, 0.3826834, 0, 0.9238795, 0.01]],
  ['NaN', [NaN, 1, 0, 0, 1, 0]],
  ['Infinity', [0, 1, 0, Infinity, 1, 0]],
  ['miss again', [30, 5, 30, 31, 5, 31]],
];
for (const [label, args] of hits) {
  t.rec(`hit ${label}`, () => [c.hit(...args), report(c)]);
}
t.note('after hits', own(c));
t.note('seated at end', canon(seated()) === canon(FIVE_INCH));

t.finish('collide state', 'ba3b88ce7cdc32991e8aaa8807990c87ffca8359e3db19f8dfb93a5ef9c03e54');
