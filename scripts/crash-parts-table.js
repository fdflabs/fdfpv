/*
 * crash-parts-table.js: print every airframe's part table as dist/sim.wasm
 * reads it back, as the Markdown tables in docs/CRASH-STAGE1.md section 7.
 *
 * Run: node scripts/crash-parts-table.js
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

import { loadSim } from '../tests/lib/simmod.js';
import { MATERIALS } from '../configs/parts.js';
import { readPartTable } from './lib/crash.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasm = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');

const AIRFRAMES = [
  ['5 inch, plant 0', 0],
  ['flying wing 1000', 2], ['Skyhunter 1800', 3], ['Cub 1400', 4], ['Slow Stick', 5],
  ['Radian 2000', 6], ['Timber 1500', 7], ['Bramor 2300', 8], ['Timber on floats', 9], ['Cub on floats', 10],
  ['Buzzard Bombshell', 11], ['Kadet Senior', 12], ['P-51D Mustang', 15], ['Zagi HP', 17], ['Ugly Stik', 19], ['NRJ DLG', 21],
  ['Tiger Moth', 23],
];
const f = (v, d = 3) => v.toFixed(d);
for (const [name, id] of AIRFRAMES) {
  const sim = await loadSim(wasm);
  sim.init(configText);
  sim.e.sim_set_airframe(id);
  sim.reset();
  const parts = readPartTable(sim);
  console.log(`\n### ${name}\n`);
  console.log('| # | part | parent | material | mass kg | centre m | joint m | M limit N m | F limit N | k N/m | crush kPa |');
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const p of parts) {
    const par = p.parent < 0 ? 'root' : parts[p.parent].label;
    console.log(`| ${p.index} | ${p.label} | ${par} | ${MATERIALS[p.material]} | ${f(p.mass, 4)} | ${p.cg.map((v) => f(v)).join(', ')} `
      + `| ${p.parent < 0 ? '' : p.joint.map((v) => f(v)).join(', ')} | ${p.parent < 0 ? '' : f(p.momentLimit, 2)} | ${p.parent < 0 ? '' : f(p.forceLimit, 0)} `
      + `| ${p.stiffness.toExponential(1)} | ${p.crushStress > 0 ? `${f(p.crushStress / 1000, 0)} over ${f(p.crushArea * 1e4, 1)} cm2, ${f(p.crushDepth * 1000, 0)} mm` : ''} |`);
  }
}
