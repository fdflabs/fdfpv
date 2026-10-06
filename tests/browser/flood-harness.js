/*
 * flood-harness.js: run the shallow water solver's known-answer cases
 * (scripts/lib/flood-scenarios.js) in Chrome and report each one's state
 * hash, for scripts/water-check.js to hold against Node's. See
 * flood-harness.html.
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

import { SCENARIOS } from '../../scripts/lib/flood-scenarios.js';

async function run() {
  const wasm = new Uint8Array(await (await fetch('/dist/flood.wasm')).arrayBuffer());
  const hashes = [];
  for (const [name, scenario] of SCENARIOS) {
    const r = await scenario(wasm);
    hashes.push(`${name}: ${r.hash}`);
  }
  return { ok: true, hashes };
}

run()
  .then((result) => window.__simHarnessResolve(result))
  .catch((e) => window.__simHarnessResolve({ ok: false, errorName: e.name, message: String(e.message) }));
