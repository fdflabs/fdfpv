/*
 * water-bench.js: what the Itaipu flood costs (scripts/lib/flood-bench.js),
 * in Node and in Chrome: the shipped bed and warmed state with gate 3
 * gone, ms per step and the steps of the room's clock a second the
 * main thread takes at live.js's frame budget against the 50 the room
 * needs. The lead's budget is measured in Chrome; Node is printed beside
 * it. --no-chrome for Node alone (a skip is not a pass). The two runs'
 * hashes must agree.
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
import { performance } from 'node:perf_hooks';

import { benchFlood } from './lib/flood-bench.js';
import { FRAME_BUDGET_MS } from '../src/maps/itaipu/water/live.js';
import { findChrome, runBrowserHarness } from '../tests/lib/browser.js';
import { startServer } from '../tests/lib/server.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const FILES = {
  'flood.wasm': 'dist/flood.wasm',
  'itaipu-flood.json': 'src/maps/itaipu/water/itaipu-flood.json',
  'itaipu-flood.bin': 'src/maps/itaipu/water/itaipu-flood.bin',
  'itaipu-flood-warm.bin': 'src/maps/itaipu/water/itaipu-flood-warm.bin',
};
const read = async (name) => new Uint8Array(await readFile(join(root, FILES[name])));

const show = (where, r) => console.log(`  ${where}: ${r.msPerStep.toFixed(2)} ms a step (worst slice ${r.worst.toFixed(2)}), ${r.wet} wet cells of ${r.cells}; `
  + `the room needs ${r.needPerSecond} steps a second, a ${FRAME_BUDGET_MS} ms slice of 60 frames takes ${r.canPerSecond.toFixed(1)}; hash ${r.hash}`);

const node = await benchFlood(read, () => performance.now());
show('Node', node);
let failed = 0;
if (process.argv.includes('--no-chrome') || !findChrome()) {
  console.log('  SKIP  Chrome (no Chrome here, or --no-chrome); a skip is not a pass');
} else {
  const server = await startServer(root);
  try {
    const out = await runBrowserHarness(`${server.origin}/tests/browser/flood-bench.html`, { timeoutMs: 600000 });
    const r = out.result || {};
    if (!r.ok) {
      failed += 1;
      console.log(`  FAIL  the Chrome run: ${r.message || r.errorName || JSON.stringify(out).slice(0, 200)}`);
    } else {
      show('Chrome', r);
      const same = r.hash === node.hash;
      if (!same) failed += 1;
      console.log(`  ${same ? 'pass' : 'FAIL'}  the same water in Node and Chrome  (${node.hash} / ${r.hash})`);
    }
  } finally {
    await server.close();
  }
}
process.exit(failed ? 1 : 0);
