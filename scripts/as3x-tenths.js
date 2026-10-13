/*
 * as3x-tenths.js: the AS3X Heading at every share the tune screen sets
 * (configs/tuning.js HEADING_STEP, tenths) never leaves a 3D aircraft's
 * kicked harrier rocking worse than Manual. The owner's rule, "small
 * corrections, never change the way the plane behaves" (lead decision
 * 2026-10-13). On each aircraft whose gate flies a harrier
 * (lib/as3xloop.js AS3X `kick`), its own harrier (lib/harrierkick.js
 * PROGRAMS) is kicked as extra-gates.js E11b kicks it, and the rock the
 * kick leaves, integrated over the 12 s after, must be under Manual's,
 * both kicks, at each tenth from 0.1 to 1: the three axes at that tenth
 * together, and each axis alone at it, the others off. as3x-derive.js
 * holds the table's Heading to the same; this flies the plant's own mode
 * 3 at the table's. Mixes of different tenths per axis are not flown.
 * Exit 1 on any failure.
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

import { fileURLToPath } from 'node:url';

import { must } from '../tests/lib/wingpilot.js';
import { SEAT_GATES } from './lib/propcurve.js';
import { AS3X, planeSim, fanOut } from './lib/as3xloop.js';
import { PROGRAMS, harrierFlight, kickIae } from './lib/harrierkick.js';

const self = fileURLToPath(import.meta.url);
const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };

if (opt('--plane')) {
  const name = opt('--plane');
  const sim = await planeSim(AS3X[name].sim, SEAT_GATES);
  const prog = PROGRAMS[AS3X[name].kick]();
  const manual = prog.t11.kickStick.map((st) => {
    const rate = harrierFlight(sim, prog, 0, st).pKick;
    return { rate, m: kickIae(sim, prog, 0, rate) };
  });
  const ratios = (share) => {
    must(sim.setHeading(share), 'sim_wing_set_heading');
    const r = manual.map(({ rate, m }) => kickIae(sim, prog, 3, rate) / m);
    must(sim.setHeading([0, 0, 0]), 'sim_wing_set_heading');
    return r;
  };
  const rows = [];
  for (let i = 1; i <= 10; i += 1) {
    const t = i / 10;
    rows.push({ t, all: ratios([t, t, t]), alone: [0, 1, 2].map((ax) => ratios([0, 1, 2].map((a) => (a === ax ? t : 0)))) });
  }
  await new Promise((resolve) => { process.stdout.write(JSON.stringify({ zero: ratios([0, 0, 0]), rows }), resolve); });
  process.exit(0);
}

const names = Object.keys(AS3X).filter((n) => AS3X[n].kick);
const fleet = await fanOut(self, names);
let failed = 0, passed = 0;
const f = (r) => r.map((x) => x.toFixed(2)).join(' and ');
for (const name of names) {
  const { zero, rows } = fleet[name];
  console.log(`\n${name}: the kicked harrier's rock, of Manual's (Heading 0: ${f(zero)}, not judged)`);
  for (const { t, all, alone } of rows) {
    const worst = Math.max(...all, ...alone.flat());
    const ok = worst < 1;
    if (ok) passed += 1; else failed += 1;
    console.log(`  ${ok ? 'pass' : 'FAIL'}  Heading ${t.toFixed(1)}: all three ${f(all)}; roll alone ${f(alone[0])}, pitch ${f(alone[1])}, yaw ${f(alone[2])}`);
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
