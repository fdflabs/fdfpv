/*
 * water-check.js: the shallow water solver (src/sim/water/flood.c,
 * dist/flood.wasm) against answers known without it, and against itself
 * on another engine.
 *
 *   1. dist/flood.wasm is built from flood.c as it stands
 *   2. the cases with known answers (scripts/lib/flood-scenarios.js):
 *      a lake at rest over a random bed for ten minutes (well balanced),
 *      a closed basin's volume to 1e-9 through fronts, friction and a
 *      link, Ritter's dam break along both axes (profile, front, front
 *      speed against 2 sqrt(g h0)), critical flow over a crest, and the
 *      opening link as a weir, an orifice and drowned
 *   3. the cost: ns per cell per step on a 256 x 256 grid all moving
 *   4. Node and Chrome: every case's state hash identical (skipped, and
 *      said so, where there is no Chrome)
 *
 * Plain Node and the committed module, so it runs in CI; the Chrome part
 * runs where a Chrome is.
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

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import { SCENARIOS, cost } from './lib/flood-scenarios.js';
import { findChrome, runBrowserHarness } from '../tests/lib/browser.js';
import { startServer } from '../tests/lib/server.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasm = new Uint8Array(await readFile(join(root, 'dist/flood.wasm')));

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

console.log('1. dist/flood.wasm is flood.c as it stands');
{
  const dir = await mkdtemp(join(tmpdir(), 'flood-'));
  const out = join(dir, 'flood.wasm');
  const r = spawnSync('bash', [join(root, 'scripts/build-flood.sh')], { env: { ...process.env, FLOOD_OUT: out }, encoding: 'utf8' });
  if (r.status !== 0 && /emcc not found/.test(r.stderr)) {
    console.log('  SKIP  no Emscripten here; a skip is not a pass');
  } else if (r.status !== 0) {
    check('flood.c compiles', false, r.stderr.trim().split('\n').slice(-3).join(' / '));
  } else {
    const built = new Uint8Array(await readFile(out));
    const same = built.length === wasm.length && built.every((v, i) => v === wasm[i]);
    check('a rebuild is byte identical to the committed dist/flood.wasm', same, same ? `${wasm.length} bytes` : 'rebuild with npm run build:flood and commit it');
  }
  await rm(dir, { recursive: true, force: true });
}

console.log('2. the cases with known answers');
const hashes = [];
for (const [name, run] of SCENARIOS) {
  const t0 = performance.now();
  const r = await run(wasm);
  for (const k of r.checks) {
    check(k.name, k.ok, k.detail);
  }
  if (r.figures.tip) {
    const t = r.figures.tip;
    console.log(`        the ${t.d} m tip, not held to Ritter's: ${t.speed.toFixed(2)} m/s against ${t.want.toFixed(2)}, ${(100 * (1 - t.speed / t.want)).toFixed(1)} % slow`);
  }
  hashes.push(`${name}: ${r.hash}`);
  console.log(`        ${name}: ${(performance.now() - t0).toFixed(0)} ms, hash ${r.hash}`);
}

console.log('3. the cost');
{
  const r = await cost(wasm, () => performance.now());
  console.log(`  ${r.cells} cells all wet and moving: ${r.nsPerCell.toFixed(1)} ns per cell per step, ${r.msPerStep.toFixed(2)} ms per step`);
}

console.log('4. Node and Chrome');
if (process.argv.includes('--no-chrome') || !findChrome()) {
  console.log('  SKIP  no Chrome here (or --no-chrome); a skip is not a pass');
} else {
  const server = await startServer(root);
  try {
    const out = await runBrowserHarness(`${server.origin}/tests/browser/flood-harness.html`, { timeoutMs: 600000 });
    const res = out.result || {};
    if (!res.ok) {
      check('the Chrome run completes', false, res.message || res.errorName || JSON.stringify(out).slice(0, 200));
    } else {
      for (let i = 0; i < hashes.length; i += 1) {
        const same = res.hashes[i] === hashes[i];
        check(`state hash identical in Node and Chrome: ${hashes[i].split(':')[0]}`, same,
          same ? hashes[i].split(': ')[1] : `node ${hashes[i]} / chrome ${res.hashes[i]}`);
      }
    }
  } finally {
    await server.close();
  }
}

console.log(`\nwater-check: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
