/*
 * wing-record.js: write tests/inputs/wing-baseline.rec, the stick stream
 * the cross-host wing check replays, or with `bramor` and `bramor-chute`
 * the Bramor's tests/inputs/bramor-baseline.rec and bramor-chute.rec. Run
 * it when the pilot in tests/lib/wingpilot.js changes; the recording is
 * committed, like the quad's baseline.rec, so the check never depends on
 * JS maths. The wing's committed recording was made against an earlier
 * plant and this no longer writes the same bytes; the hash is pinned to
 * the committed stream, so it stays as it is. The other aircraft's
 * recorders left with them on 2026-10-20; tests/inputs/p51-air.rec stays
 * as a stick stream replaylib:selftest flies on the five inch, and can no
 * longer be written.
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

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { encodeRec } from '../tests/lib/recfile.js';
import { bramorPrelude, recordChuteFlight, recordScriptedFlight, wingPrelude } from '../tests/lib/wingpilot.js';

/* The wing by default; `bramor` the Bramor off its catapult and
 * `bramor-chute` its descent under the canopy, for bramor-gates.js. */
const PLANES = {
  wing: { file: 'tests/inputs/wing-baseline.rec', record: (sim) => recordScriptedFlight(sim, { prelude: wingPrelude, rudder: false }) },
  bramor: { file: 'tests/inputs/bramor-baseline.rec', record: (sim) => recordScriptedFlight(sim, { prelude: bramorPrelude, rudder: false }) },
  'bramor-chute': { file: 'tests/inputs/bramor-chute.rec', record: recordChuteFlight },
};
const plane = PLANES[process.argv[2] || 'wing'];
if (!plane) {
  throw new Error(`wing-record: unknown plane ${process.argv[2]}; one of ${Object.keys(PLANES).join(', ')}`);
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sim = await loadSim(new Uint8Array(await readFile(join(root, 'dist/sim.wasm'))));
if (sim.init(await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8')) !== SIM_OK) {
  throw new Error('sim_init failed');
}
const samples = plane.record(sim);
const out = join(root, plane.file);
await writeFile(out, encodeRec(250, samples));
console.log(`wrote ${out}: ${samples.length} samples at 250 Hz, ${(samples.length / 250).toFixed(1)} s`);
