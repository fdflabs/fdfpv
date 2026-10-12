/*
 * as3x-margins.js: the stability margins of every AS3X loop (plant mode 3)
 * on every aircraft with an AS3X row, roll, pitch and yaw, at every
 * flight condition scripts/lib/as3xloop.js measurePlane flies (slow
 * flight, cruise, top speed, the full throttle dive, the harrier and the
 * hover where they apply), with the Heading at the factory's zero and at
 * the most a pilot can set. With --check it fails when any loop is under
 * the margin rule (6 dB, 45 deg) anywhere with the Heading at the AR631's
 * default, zero, the receiver as it ships; the full Heading's rows are
 * printed for what a pilot who turns it up spends. The rule is
 * Spektrum's "the highest setting that will not cause oscillation at any
 * speed" (the AR631 manual), held under the onset by MIL-F-9490D's
 * margin. --plane NAME
 * measures one table and prints it as JSON; --json FILE writes the
 * fleet's numbers.
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

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AS3X, GM_MIN_DB, PM_MIN_DEG, rowOf, receiverOf, margins, measurePlane, revive, fanOut } from './lib/as3xloop.js';

const self = fileURLToPath(import.meta.url);
const root = dirname(dirname(self));
const src = await readFile(join(root, 'src/native/plant_wing.c'), 'utf8');
const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };

if (opt('--plane')) {
  process.stdout.write(JSON.stringify(await measurePlane(opt('--plane'), src)));
  process.exit(0);
}

const AX = ['roll', 'pitch', 'yaw'];
const fleet = await fanOut(self, Object.keys(AS3X));
const rows = [];
let bad = 0;
const f = (x, d = 1) => (x === null || !Number.isFinite(x) ? '  none' : x.toFixed(d).padStart(6));
for (const name of Object.keys(AS3X)) {
  const m = revive(fleet[name]);
  const rx = receiverOf(rowOf(src, name));
  for (const c of m.conds) {
    for (let axis = 0; axis < 3; axis += 1) {
      if (!c.resp[axis] || !(rx.k[axis] > 0)) continue;
      for (const heading of [0, 1]) {
        const r = margins(c.resp[axis], axis, rx.k[axis], heading * rx.kh[axis], rx.T);
        const low = r.gmDb < GM_MIN_DB || (r.pmDeg !== null && r.pmDeg < PM_MIN_DEG);
        /* The gate is the receiver as it ships, Heading zero; the full
         * Heading's rows are what a pilot who turns it up spends. */
        if (low && heading === 0) bad += 1;
        rows.push({ name, cond: c.id, V: c.V, axis: AX[axis], heading, ...r });
        console.log(`${name.padEnd(18)} ${c.id.padEnd(7)} ${c.V.toFixed(1).padStart(5)} m/s ${AX[axis].padEnd(5)} heading ${heading}  GM ${f(r.gmDb)} dB at ${f(r.w180, 0)} rad/s  PM ${f(r.pmDeg, 0)} deg at ${f(r.wc, 1)} rad/s  peak |S| ${f(r.msDb)} dB${low ? '  UNDER THE MARGIN' : ''}`);
      }
    }
  }
}
if (opt('--json')) await writeFile(opt('--json'), JSON.stringify(rows));
if (argv.includes('--check') && bad) {
  console.log(`${bad} AS3X loop(s) under ${GM_MIN_DB} dB or ${PM_MIN_DEG} deg`);
  process.exit(1);
}
