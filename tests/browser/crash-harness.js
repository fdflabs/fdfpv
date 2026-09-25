/*
 * crash-harness.js: fly the plant's crash scenarios in Chrome and report
 * their trace digests. See crash-harness.html.
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

import { loadSim } from '../lib/simmod.js';
import { allDigests } from '../../scripts/lib/crash-scenarios.js';

async function run() {
  const wasm = new Uint8Array(await (await fetch('/dist/sim.wasm')).arrayBuffer());
  const configText = await (await fetch('/tests/fixtures/config-baseline.diff')).text();
  return { ok: true, digests: await allDigests(loadSim, wasm, configText) };
}

run()
  .then((result) => window.__simHarnessResolve(result))
  .catch((e) => window.__simHarnessResolve({ ok: false, errorName: e.name, message: String(e.message) }));
