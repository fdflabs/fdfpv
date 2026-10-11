/*
 * controlrec-selftest.js: the control recorder's arithmetic, in Node.
 *
 *     node scripts/controlrec-selftest.js
 *
 * A synthetic flight: frames of 16 or 50 ms, RC slots every 4 ms, the
 * roll stick a 0.5 Hz sine of 0.1 with radio noise of one 11-bit count,
 * the nose 10 degrees off vertical. Checks each step row carries the slot
 * in force at its start, the ring keeps the newest rows, the CSV reads
 * back, and thumbStats gives the sine's deflection and one reversal a
 * second while the noise adds none, and the frames' wait and interval.
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

import assert from 'node:assert/strict';

import { COLUMN as C, ControlRecorder, parseCsv, thumbStats, toCsv } from '../src/share/controlrec.js';

const RC_MS = 4;
const roll = (tMs) => 0.1 * Math.sin((2 * Math.PI * 0.5 * tMs) / 1000);
/* Nose 10 degrees off vertical, pitched: body x up, quaternion about y. */
const half = ((80 * Math.PI) / 180) / 2;
const Q = [Math.cos(half), 0, -Math.sin(half), 0];

function fly(rec, seconds) {
  let simMs = 0;
  let wall = 1000;
  let rcNext = 0;
  let k = 0;
  while (simMs < seconds * 1000) {
    const dt = k % 10 === 9 ? 50 : 16;
    k += 1;
    wall += dt;
    rec.beginFrame(wall, dt, dt);
    const end = simMs + dt;
    while (rcNext < end) {
      /* The reading went in 3 ms before its slot's wall moment. */
      const noise = (rcNext / RC_MS) % 2 ? 1 / 1024 : 0;
      rec.noteSlot(rcNext, wall - (end - rcNext) - 3, roll(rcNext) + noise, 0, 0, 0.6);
      rcNext += RC_MS;
    }
    for (let s = 1; s <= dt; s += 1) {
      const st = new Array(20).fill(0);
      st[0] = (simMs + s) / 1000;
      [st[7], st[8], st[9], st[10]] = Q;
      st[11] = 0.25;
      rec.step(st, [0.01, -0.01, 0.02, 0]);
    }
    simMs = end;
  }
}

const rec = new ControlRecorder(30000);
fly(rec, 5);
assert.equal(rec.count, 0, 'off records nothing');
rec.setEnabled(true);
fly(rec, 40);
assert.equal(rec.count, 30000, 'the ring holds its size');
const rows = rec.rows();
assert.ok(rows[rows.length - 1][C.t_s] >= 40 && rows[rows.length - 1][C.t_s] < 40.05, 'newest row last');
for (const r of rows.slice(0, 2000)) {
  const tMs = r[C.t_s] * 1000;
  const slot = Math.floor((tMs - 1) / RC_MS) * RC_MS;
  const noise = (slot / RC_MS) % 2 ? 1 / 1024 : 0;
  assert.ok(Math.abs(r[C.roll] - (roll(slot) + noise)) < 1e-12, `step ${tMs} carries slot ${slot}`);
}
assert.equal(rows[0][C.elev], 0.02);

const back = parseCsv(toCsv(rows));
assert.equal(back.length, rows.length);
assert.ok(Math.abs(back[123][C.roll] - rows[123][C.roll]) < 1e-7, 'csv round trip');

const s = thumbStats(back);
console.log(JSON.stringify(s, (k, v) => (typeof v === 'number' ? Number(v.toFixed(3)) : v)));
assert.ok(Math.abs(s.sticks.roll.peak - 0.1) < 0.003, 'roll peak');
assert.ok(Math.abs(s.sticks.roll.meanAbs - 0.2 / Math.PI) < 0.004, 'roll mean deflection');
assert.ok(Math.abs(s.sticks.roll.reversalsPerS - 0.5) < 0.05, 'a 0.5 Hz sine turns once a second, counted as half turns');
assert.equal(s.sticks.pitch.reversalsPerS, 0, 'a still stick does not reverse');
assert.ok(Math.abs(s.noseUpHeldS - 30) < 0.01, 'nose within 20 degrees all the way');
assert.equal(s.frameInterval.p50, 16);
assert.equal(s.frameInterval.max, 50);
assert.ok(s.stickToFrame.p50 > 0 && s.stickToFrame.max < 60, 'stick to frame wait in range');
console.log('controlrec-selftest: ok');
