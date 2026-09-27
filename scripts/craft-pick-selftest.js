/*
 * craft-pick-selftest.js: the aircraft picker's facts and rules, in Node.
 *
 * 1. What the picker says about each aircraft is true: its weight is the
 *    compiled plant's mass (the sum of its part table, the table the crash
 *    physics carries), its size is the figure its own facts quote, and it
 *    has a line in every language.
 * 2. The lists the tabs show, and the direct cycle, [ and ], which visits
 *    every aircraft and comes back round.
 * 3. The layout a drag reads is the layout drawn: slotOf undoes slotX.
 *
 * Run with npm run pick:selftest.
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

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { readPartTable } from './lib/crash.js';
import { AIRFRAMES, airframeById } from '../configs/airframes.js';
import en from '../src/strings/en.js';
import es from '../src/strings/es.js';
import { cycleCraft, kindOf, pickList, slotOf, slotX } from '../src/ui/carousel.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');

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

/* The whoop flies the five inch's plant; the machine the picker shows is
 * the real 65 mm one, which is the module's airframe 1 (sim_abi.h). */
const MASS_PLANT = { whoop65: 1 };

console.log('1. what the picker says');
for (const af of AIRFRAMES) {
  const sim = await loadSim(wasmBytes);
  const plant = MASS_PLANT[af.id] ?? af.simId;
  if (sim.init(configText) !== SIM_OK || sim.e.sim_set_airframe(plant) !== SIM_OK || sim.reset() !== SIM_OK) {
    check(`${af.id}: the module takes plant ${plant}`, false);
    continue;
  }
  const grams = readPartTable(sim).reduce((s, p) => s + p.mass, 0) * 1000;
  check(`${af.id} weighs ${af.grams} g, the plant's ${grams.toFixed(1)} g`, Math.abs(grams - af.grams) < 0.05);
  const quoted = af.facts.some((f) => f === `${af.sizeMm} mm`);
  check(`${af.id} is ${af.sizeMm} mm, the figure its facts quote`, quoted, af.facts.join(', '));
  const key = `carousel.note.${af.id}`;
  check(`${af.id} has a line in English and Spanish`, Boolean(en[key]) && Boolean(es[key]) && en[key] !== es[key]);
}

console.log('2. the lists and the cycle');
check('the quads are the quads', pickList('quad').every((id) => !airframeById(id).fixedWing) && pickList('quad').length === 2);
check('the planes are the planes', pickList('plane').every((id) => airframeById(id).fixedWing) && pickList('plane').length === 9);
check('all is every aircraft, in the table\'s order', pickList('all').join() === AIRFRAMES.map((a) => a.id).join());
check('kindOf agrees', kindOf('5inch') === 'quad' && kindOf('cub1400f') === 'plane');
{
  const seen = [];
  let id = '5inch';
  for (let k = 0; k < AIRFRAMES.length; k += 1) {
    id = cycleCraft(id, 1);
    seen.push(id);
  }
  check('] visits every aircraft once and comes back to the first', new Set(seen).size === AIRFRAMES.length && id === '5inch', seen.join(' '));
  check('[ goes the other way', cycleCraft('5inch', -1) === AIRFRAMES[AIRFRAMES.length - 1].id && cycleCraft(cycleCraft('cub1400', 1), -1) === 'cub1400');
}

console.log('3. the layout');
{
  const ds = [-2.4, -1.5, -1, -0.3, 0, 0.4, 1, 1.7, 2.5];
  const worst = Math.max(...ds.map((d) => Math.abs(slotOf(slotX(d)) - d)));
  check('slotOf undoes slotX', worst < 1e-12, `worst ${worst.toExponential(1)}`);
  check('the neighbours stand either side, in order', ds.every((d, i) => i === 0 || slotX(d) > slotX(ds[i - 1])));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
