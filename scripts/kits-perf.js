/*
 * kits-perf.js: what the kit's lights cost on the GPU (docs/KITS.md
 * section 4). tests/kits-perf.html draws a dark, fogged field with four
 * quads and four planes as rooms draw other pilots, every light on (arm
 * LEDs on Chase, nav lights and strobes) shown and hidden on alternate
 * frames, each frame timed with a WebGL timer query; the cost is the
 * median of the paired differences. Budget: +0.3 ms a frame for all eight. Needs a real GPU
 * (SIM_GPU=1) and a quiet one: the GPU's other users are printed first
 * (nvidia-smi pmon), and a busy GPU makes the number say nothing.
 *
 * usage: SIM_GPU=1 node scripts/kits-perf.js [outdir]
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

import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';

const BUDGET_MS = 0.3;
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = resolve(process.argv[2] || join(root, 'tmp', 'kits-perf'));
await mkdir(outDir, { recursive: true });

const pmon = spawnSync('nvidia-smi', ['pmon', '-c', '1'], { encoding: 'utf8' }).stdout || 'nvidia-smi not found';
console.log(pmon.trim());
if (process.env.SIM_GPU !== '1') {
  console.log('FAIL  run with SIM_GPU=1: a software rasteriser says nothing about a GPU');
  process.exit(1);
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const page = await openPage({ root, width: 1300, height: 760, url: '/tests/kits-perf.html' });
let failed = 0;
try {
  await page.until('window.kitsPerfReady === true', 120000);
  const r = await page.evaluate('window.kitsPerf(600)');
  if (r.error) {
    throw new Error(r.error);
  }
  const off = median(r.off);
  const on = median(r.on);
  const delta = median(r.diff);
  const sorted = [...r.diff].sort((a, b) => a - b);
  const q = (p) => sorted[Math.floor(p * (sorted.length - 1))];
  await writeFile(join(outDir, 'kits-perf.json'), JSON.stringify({ off, on, delta, ...r, pmon }, null, 2));
  console.log(`${r.lights} light meshes; draw calls: lights off ${r.calls.off}, on ${r.calls.on}`);
  console.log(`GPU ms a frame over ${r.diff.length} pairs: off ${off.toFixed(3)}, on ${on.toFixed(3)}`);
  console.log(`paired cost: median ${delta.toFixed(3)} ms, quartiles ${q(0.25).toFixed(3)} to ${q(0.75).toFixed(3)}`);
  const ok = delta <= BUDGET_MS;
  failed += ok ? 0 : 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  eight aircraft's lights cost ${delta.toFixed(3)} ms against a budget of ${BUDGET_MS}`);
  const errs = page.errors.filter((e) => !e.startsWith('network:'));
  if (errs.length) {
    failed += 1;
    console.log(`FAIL  page errors: ${errs.slice(0, 3).join(' | ')}`);
  }
} catch (e) {
  failed += 1;
  console.log(`FAIL  the check stopped: ${e.message}; the page said: ${page.errors.slice(0, 3).join(' | ')}`);
} finally {
  await page.close();
}
process.exit(failed ? 1 : 0);
