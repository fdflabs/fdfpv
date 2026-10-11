/*
 * materials-perf.js: what the flake and brushed finishes cost a frame on
 * the GPU (docs/redesign/MATERIALS.md 5). One aircraft of the most
 * regions fills the screen, every region in one finish, every quality
 * preset, the GPU median of each beside gloss's. Fails when a new finish
 * costs more than BUDGET_MS over gloss at any preset.
 *
 *     SIM_GPU=1 node scripts/materials-perf.js [--frames=240]
 *
 * On this machine run it through ~/.cache/run-check-slot.sh, after
 * nvidia-smi pmon -c 1 says nothing else is drawing on GPU 0: the card is
 * shared with the desktop and a query counts its work too.
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

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { GRAPHICS_IDS } from '../src/render/quality.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const frames = Number((process.argv.find((a) => a.startsWith('--frames=')) || '--frames=240').slice(9));
/* A full screen of the finish is the worst case a pilot meets (the
 * hangar's close orbit); a quarter millisecond over gloss there is held
 * to on every preset. */
const BUDGET_MS = 0.25;
const CRAFT = process.env.MATERIALS_CRAFT || 'p51d1450';
const FINISHES = ['kit', 'gloss', 'carbon', 'flake', 'brushed'];

let failed = 0;
const page = await openPage({ root, width: 1600, height: 900, url: '/tests/browser/materials-perf.html' });
try {
  await page.until('window.__ready === true', 120000);
  const gpu = await page.evaluate('window.__gpuName()');
  console.log(`renderer ${gpu.renderer}; timer query ${gpu.timer ? 'present' : 'absent'}; craft ${CRAFT}`);
  if (!gpu.timer) {
    throw new Error('no timer query on this renderer: run with SIM_GPU=1');
  }
  console.log('preset   ' + FINISHES.map((f) => f.padEnd(9)).join(''));
  for (const preset of GRAPHICS_IDS) {
    const row = {};
    for (const finish of FINISHES) {
      row[finish] = (await page.evaluate(`window.__run(${JSON.stringify({ preset, craft: CRAFT, finish, frames })})`)).gpuMs;
    }
    console.log(preset.padEnd(9) + FINISHES.map((f) => row[f].toFixed(3).padEnd(9)).join(''));
    for (const f of ['flake', 'brushed']) {
      const over = row[f] - row.gloss;
      const ok = over <= BUDGET_MS;
      failed += ok ? 0 : 1;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${preset} ${f}: ${over >= 0 ? '+' : ''}${over.toFixed(3)} ms over gloss (budget ${BUDGET_MS})`);
    }
  }
} catch (e) {
  failed += 1;
  console.log(`FAIL the run stopped: ${e.message}; the page said: ${page.errors.slice(0, 3).join(' | ')}`);
} finally {
  await page.close();
}
process.exit(failed ? 1 : 0);
