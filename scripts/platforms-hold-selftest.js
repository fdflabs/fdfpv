/*
 * platforms-hold-selftest.js: an aircraft nobody flies, on hold
 * (src/share/ops/hold.js, docs/campaign/interior/CONTRACT-HOLDS.md).
 * npm run platforms:hold.
 *
 *   orbit      a Bramor left at 120 m orbits for ten minutes of room
 *              clock, every 50 ms within 0.01 m of its radius, at its
 *              altitude, at its speed
 *              and where the textbook circle puts it at the end
 *   no jump    the hold at the ms it began is where the aircraft was,
 *              moving along its track
 *   slow       a Bramor left under its air start speed holds at that
 *              speed, not slower
 *   hover      a 7 inch left in the air stays within 0.5 m for ten
 *              minutes
 *   repeat     the same hold read twice, and read late, gives the same
 *              numbers bit for bit
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

import { airframeById } from '../configs/airframes.js';
import { holdOf, holdPose } from '../src/share/ops/hold.js';

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
  if (!ok) {
    failed += 1;
  }
}

const TEN_MIN = 600000;
const bramor = airframeById('bramor2300');
const seven = airframeById('7inch');
const t0 = 41234;
const left = { p: [350.5, -1200.25, 120], v: [12, 16, 0.4] };
const h = holdOf(left, bramor, t0);

let worstR = 0;
let worstZ = 0;
let worstV = 0;
for (let t = t0; t <= t0 + TEN_MIN; t += 50) {
  const q = holdPose(h, t);
  const d = Math.hypot(q.p[0] - h.c[0], q.p[1] - h.c[1]);
  worstR = Math.max(worstR, Math.abs(d - h.r));
  worstZ = Math.max(worstZ, Math.abs(q.p[2] - 120));
  worstV = Math.max(worstV, Math.abs(Math.hypot(q.v[0], q.v[1]) - h.speed));
}
check('orbit: within its radius for ten minutes', worstR < 0.01 && worstZ === 0 && worstV < 1e-6,
  `r ${h.r.toFixed(1)} m, speed ${h.speed} m/s, worst radius error ${worstR.toExponential(2)} m`);

/* The angle against the textbook circle, read with Math here only: the
 * check may use it, the hold may not. */
const end = holdPose(h, t0 + TEN_MIN);
const ang = h.speed / h.r * (TEN_MIN / 1000);
const rx = 350.5 - h.c[0];
const ry = -1200.25 - h.c[1];
const ex = h.c[0] + rx * Math.cos(ang) - ry * Math.sin(ang);
const ey = h.c[1] + rx * Math.sin(ang) + ry * Math.cos(ang);
const drift = Math.hypot(end.p[0] - ex, end.p[1] - ey);
check('orbit: where the circle says after ten minutes', drift < 0.01, `${drift.toExponential(2)} m off`);

const at = holdPose(h, t0);
const jump = Math.hypot(at.p[0] - 350.5, at.p[1] + 1200.25, at.p[2] - 120);
const dot = (at.v[0] * 12 + at.v[1] * 16) / (Math.hypot(at.v[0], at.v[1]) * 20);
check('no jump: the hold begins where the aircraft was, along its track', jump < 1e-9 && dot > 1 - 1e-12,
  `jump ${jump.toExponential(2)} m, track cosine ${dot}`);

const slow = holdOf({ p: [0, 0, 80], v: [5, 0, 0] }, bramor, 0);
check('slow: held at the air start speed', Math.abs(slow.speed - 1.3 * bramor.stall) < 1e-12, `${slow.speed} m/s`);

const hv = holdOf({ p: [10, 20, 30], v: [3, 1, 0] }, seven, t0);
let worstH = 0;
for (let t = t0; t <= t0 + TEN_MIN; t += 1000) {
  const q = holdPose(hv, t);
  worstH = Math.max(worstH, Math.hypot(q.p[0] - 10, q.p[1] - 20, q.p[2] - 30));
}
check('hover: a 7 inch stays within 0.5 m', worstH <= 0.5, `worst ${worstH} m`);

const a = holdPose(h, t0 + 333333);
const b = holdPose(holdOf(left, bramor, t0), t0 + 333333);
check('repeat: bit identical', a.p.every((x, i) => Object.is(x, b.p[i])) && a.v.every((x, i) => Object.is(x, b.v[i])));

if (failed) {
  console.log(`platforms:hold: ${failed} failed`);
  process.exit(1);
}
console.log('platforms:hold: all passed');
