/*
 * tree-nan-selftest.js: an F-16 into a tree stays a number, and the module
 * flies again after it.
 *
 * The swiss2 collision audit (#254, its first finding): an F-16 at 60 m/s
 * into a spruce went from 57 to 252 m/s at t = 0.300 s and was NaN by
 * 0.35 s, and a later throw on the same page froze it. The cause was the
 * crown's drag judged against the spin a step began with (crash.c,
 * point_spin, fixed in 74e6b844). That fix's regression row lives in the
 * crash suite (scripts/lib/crash-scenarios.js, "no craft gains energy"),
 * which no checks.yml step runs; this is the same failure in seconds, in
 * checks.yml.
 *
 * For the F-16 (plant 16) at 40 and 60 m/s, level through a conifer's
 * crown to its trunk, crash damage on, on the module dist/sim.wasm:
 *
 *   1. every state of 2 s is finite;
 *   2. no step ends with more than 1 percent more energy than the throw
 *      had (the runaway was a factor of 18 in 0.3 s);
 *   3. then, on the SAME module, sim_reset and the same throw again: every
 *      state finite, and its trace bit for bit a fresh module's. A module
 *      a NaN had poisoned flew the next throw wrong, which is the page
 *      freezing seen from the plant.
 *
 * On the module before 74e6b844 rows 1 and 2 fail for both speeds.
 *
 *   node scripts/tree-nan-selftest.js [path/to/sim.wasm]
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

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { Rig } from './lib/crash-scenarios.js';
import { SURFACE } from '../configs/parts.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasm = new Uint8Array(await readFile(process.argv[2] ?? join(root, 'dist/sim.wasm')));
const config = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');

const F16 = 16;
const G0 = 9.80665;
const SLACK = 0.01;
const MS = 2000;

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}${detail ? `  (${detail})` : ''}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}
const must = (c, w) => {
  if (c !== SIM_OK) throw new Error(`${w}: ${c}`);
};

/* The crash suite's conifer: a 0.25 m trunk at x = 40 with a crown 1.2 m
 * across from 5 to 24 m, the craft level at 8 m, 18 m short of it. */
function setTree(r) {
  r.sim.e.sim_tree_clear();
  r.sim.e.sim_tree_add(40, 0, 0, 0.25, 5, 24, 1.2);
}

/* One throw at v on the rig as it stands: finite throughout, and the most
 * energy any step ended with over what it was thrown with. */
function fly(r, v) {
  const z0 = 8;
  r.pose([22, 0, z0], [1, 0, 0, 0]);
  r.velocity([v, 0, 0]);
  const e0 = 0.5 * v * v + G0 * z0;
  let eMax = e0;
  let finite = true;
  let firstBad = null;
  r.run(MS, [0, 0, 0, 0], (s) => {
    if (!s.every(Number.isFinite)) {
      if (finite) firstBad = s[0];
      finite = false;
    }
    eMax = Math.max(eMax, 0.5 * (s[4] * s[4] + s[5] * s[5] + s[6] * s[6]) + G0 * s[3]);
  });
  return { finite, firstBad, gain: eMax / e0 - 1 };
}

for (const v of [40, 60]) {
  console.log(`F-16 at ${v} m/s through a conifer's crown`);
  const r = await Rig.create(loadSim, wasm, config, { id: F16, ground: 'grass' });
  setTree(r);
  const first = fly(r, v);
  check(`${v} m/s: every state is finite`, first.finite, first.finite ? `${MS} ms` : `NaN from t = ${first.firstBad} s`);
  check(`${v} m/s: no step ends with more than ${100 * SLACK} percent more energy than the throw`,
    first.finite && first.gain <= SLACK, `${first.finite ? (100 * first.gain).toFixed(3) : 'infinite'} percent`);

  /* Reset the same module and throw again, as the shell's next throw does. */
  const { sim } = r;
  must(sim.setCellVoltage(4.2), 'volts');
  must(sim.reset(), 'reset');
  must(sim.setCellVoltage(4.1), 'volts');
  must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, 1.4, 0), 'ground');
  must(sim.e.sim_set_ground_material(SURFACE.grass), 'material');
  const again = new Rig(sim);
  setTree(again);
  const second = fly(again, v);
  const fresh = await Rig.create(loadSim, wasm, config, { id: F16, ground: 'grass' });
  setTree(fresh);
  fly(fresh, v);
  check(`${v} m/s: reset on the same module, the same throw again is finite and a fresh module's, bit for bit`,
    second.finite && again.digest.hex() === fresh.digest.hex(),
    `${second.finite ? 'finite' : 'NaN'}, after ${again.digest.hex().slice(0, 12)}, fresh ${fresh.digest.hex().slice(0, 12)}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
