/*
 * wing-record.js: write tests/inputs/wing-baseline.rec, the stick stream
 * the cross-host wing check replays. Run it when the pilot in
 * tests/lib/wingpilot.js changes; the recording is committed, like the
 * quad's baseline.rec, so the check never depends on JS maths.
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

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { encodeRec } from '../tests/lib/recfile.js';
import { recordScriptedFlight } from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sim = await loadSim(new Uint8Array(await readFile(join(root, 'dist/sim.wasm'))));
if (sim.init(await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8')) !== SIM_OK) {
  throw new Error('sim_init failed');
}
const samples = recordScriptedFlight(sim);
const out = join(root, 'tests/inputs/wing-baseline.rec');
await writeFile(out, encodeRec(250, samples));
console.log(`wrote ${out}: ${samples.length} samples at 250 Hz, ${(samples.length / 250).toFixed(1)} s`);
