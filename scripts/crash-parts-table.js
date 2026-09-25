/*
 * crash-parts-table.js: print every airframe's part table as dist/sim.wasm
 * reads it back, as the Markdown tables in docs/CRASH-STAGE1.md section 7.
 *
 * Run: node scripts/crash-parts-table.js
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

import { loadSim } from '../tests/lib/simmod.js';
import { MATERIALS } from '../configs/parts.js';
import { readPartTable } from './lib/crash.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasm = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');

const AIRFRAMES = [
  ['5 inch', 0, 0], ['whoop, true scale', 1, 0], ['whoop as the shell flies it (SIM_PARTS_WHOOP_SCALED)', 0, 1],
  ['flying wing 1000', 2, 0], ['Skyhunter 1800', 3, 0], ['Cub 1400', 4, 0], ['Slow Stick', 5, 0],
  ['Radian 2000', 6, 0], ['Timber 1500', 7, 0], ['Bramor 2300', 8, 0], ['Timber on floats', 9, 0], ['Cub on floats', 10, 0],
  ['Buzzard Bombshell', 11, 0],
];
const f = (v, d = 3) => v.toFixed(d);
for (const [name, id, table] of AIRFRAMES) {
  const sim = await loadSim(wasm);
  sim.init(configText);
  sim.e.sim_set_airframe(id);
  sim.e.sim_set_part_table(table);
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
