/*
 * hercules-perf.js: what a room's cap of paradrops costs
 * (docs/HERCULES-CONTRACT.md). tests/paradrop-perf.html draws the cap, 300
 * loads, a hundred of them falling in gusty air and the rest down, shown
 * and hidden on alternate frames, each frame timed with a WebGL timer
 * query; the GPU cost is the median of the paired differences, and the
 * CPU cost the median time of their update. Budget: 0.5 ms of GPU and 0.5
 * ms of CPU a frame at the cap, against the 16.7 ms of a 60 Hz frame.
 * Needs a real GPU (SIM_GPU=1) and a quiet one: the GPU's other users are
 * printed first (nvidia-smi pmon), and a busy GPU makes the number say
 * nothing.
 *
 * usage: SIM_GPU=1 node scripts/hercules-perf.js [outdir]
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

const GPU_BUDGET_MS = 0.5;
const CPU_BUDGET_MS = 0.5;
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = resolve(process.argv[2] || join(root, 'tmp', 'hercules-perf'));
await mkdir(outDir, { recursive: true });

const pmon = spawnSync('nvidia-smi', ['pmon', '-c', '1'], { encoding: 'utf8' }).stdout || 'nvidia-smi not found';
console.log(pmon.trim());
if (process.env.SIM_GPU !== '1') {
  console.log('FAIL  run with SIM_GPU=1: a software rasteriser says nothing about a GPU');
  process.exit(1);
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const page = await openPage({ root, width: 1300, height: 760, url: '/tests/paradrop-perf.html' });
let failed = 0;
try {
  await page.until('window.paradropPerfReady === true', 120000);
  const r = await page.evaluate('window.paradropPerf(400, 100)');
  if (r.error) {
    throw new Error(r.error);
  }
  const off = median(r.off);
  const on = median(r.on);
  const gpu = median(r.diff);
  const cpu = median(r.cpu);
  console.log(`300 drops (100 falling): GPU ${off.toFixed(3)} ms without, ${on.toFixed(3)} with, median paired cost ${gpu.toFixed(3)} ms over ${r.diff.length} pairs; draw calls ${r.calls.off} to ${r.calls.on}; update CPU ${cpu.toFixed(3)} ms`);
  const okGpu = gpu <= GPU_BUDGET_MS;
  const okCpu = cpu <= CPU_BUDGET_MS;
  console.log(`  ${okGpu ? 'ok  ' : 'FAIL'}  GPU at the cap within ${GPU_BUDGET_MS} ms`);
  console.log(`  ${okCpu ? 'ok  ' : 'FAIL'}  CPU at the cap within ${CPU_BUDGET_MS} ms`);
  if (!okGpu || !okCpu) failed += 1;
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(outDir, 'paradrop-perf.png'), Buffer.from(data, 'base64'));
  await writeFile(join(outDir, 'paradrop-perf.json'), JSON.stringify({ off, on, gpu, cpu, calls: r.calls, pmon }, null, 1));
} finally {
  await page.close();
}
process.exit(failed ? 1 : 0);
