/*
 * wing-record.js: write tests/inputs/wing-baseline.rec, the stick stream
 * the cross-host wing check replays, with `sky` the Skyhunter's
 * tests/inputs/sky-baseline.rec, or with `cub` the Cub's
 * tests/inputs/cub-baseline.rec, which takes off from the ground, or with
 * `bramor` and `bramor-chute` the Bramor's tests/inputs/bramor-baseline.rec
 * and bramor-chute.rec, or with `slowstick` the Slow Stick's
 * tests/inputs/slowstick-baseline.rec, which takes off from the ground
 * too. Run it when the pilot in
 * tests/lib/wingpilot.js changes; the recording is committed, like the
 * quad's baseline.rec, so the check never depends on JS maths. The wing's
 * committed recording was made against an earlier plant and this no longer
 * writes the same bytes; the hash is pinned to the committed stream, so
 * it stays as it is.
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
import {
  bramorPrelude, recordChuteFlight, recordCubFlight, recordGliderFlight, recordScriptedFlight,
  recordSlowStickFlight, recordTimberFlight, recordTimberFloatFlight, recordBombshellFlight, recordKadetFlight, recordEdgeFlight, recordExtraFlight, recordPittsFlight, recordUglystikFlight, recordP51Flight, recordP51AirFlight, recordF16Flight, recordZagiFlight, skyPrelude, wingPrelude,
} from '../tests/lib/wingpilot.js';

/* The wing by default; `sky` records the Skyhunter, with its rudder in the
 * flight, for skyhunter-gates.js S16; `cub` the Cub's take off and flight
 * for cub-gates.js C23; `glider` the Radian's climb, glide and thermal for
 * glider-gates.js G21; `bramor` the Bramor off its catapult and
 * `bramor-chute` its descent under the canopy, for bramor-gates.js;
 * `slowstick` the Slow Stick's take off and flight for slowstick-gates.js
 * S18; `timber` the Timber's take off on half flaps and flight for
 * timber-gates.js T15; `timberf` the Timber on floats' take off off a
 * swell, flight and landing back on the water for floats-gates.js;
 * `bombshell` the Buzzard Bombshell's take off and flight for
 * bombshell-gates.js S18; `kadet` the Kadet Senior's take off and flight
 * for kadet-gates.js S18; `p51` the P-51's take off and flight and
 * `p51-air` its retracts and stall in the air, for p51-gates.js S18; `edge`
 * the Edge 540's take off, roll, inverted run and snap for edge-gates.js
 * E18; `extra` the Extra 300's take off, hover, torque roll and flight
 * for extra-gates.js E16; `f16` the F-16's take off and flight, its fan
 * spooling up and down, for f16-gates.js S18; `zagi` the Zagi's hand throw, climb, roll,
 * glide and stall for zagi-gates.js Z18; `uglystik` the Ugly Stik's
 * take off, roll, inverted run and loop for uglystik-gates.js U18;
 * `pitts` the Pitts's take off, roll, snap and recovery for
 * pitts-gates.js B5. */
const PLANES = {
  wing: { file: 'tests/inputs/wing-baseline.rec', record: (sim) => recordScriptedFlight(sim, { prelude: wingPrelude, rudder: false }) },
  sky: { file: 'tests/inputs/sky-baseline.rec', record: (sim) => recordScriptedFlight(sim, { prelude: skyPrelude, rudder: true }) },
  cub: { file: 'tests/inputs/cub-baseline.rec', record: recordCubFlight },
  glider: { file: 'tests/inputs/glider-baseline.rec', record: recordGliderFlight },
  bramor: { file: 'tests/inputs/bramor-baseline.rec', record: (sim) => recordScriptedFlight(sim, { prelude: bramorPrelude, rudder: false }) },
  'bramor-chute': { file: 'tests/inputs/bramor-chute.rec', record: recordChuteFlight },
  slowstick: { file: 'tests/inputs/slowstick-baseline.rec', record: recordSlowStickFlight },
  timber: { file: 'tests/inputs/timber-baseline.rec', record: recordTimberFlight },
  timberf: { file: 'tests/inputs/timberf-baseline.rec', record: recordTimberFloatFlight },
  bombshell: { file: 'tests/inputs/bombshell-baseline.rec', record: recordBombshellFlight },
  f16: { file: 'tests/inputs/f16-baseline.rec', record: recordF16Flight },
  kadet: { file: 'tests/inputs/kadet-baseline.rec', record: recordKadetFlight },
  edge: { file: 'tests/inputs/edge-baseline.rec', record: recordEdgeFlight },
  extra: { file: 'tests/inputs/extra-baseline.rec', record: recordExtraFlight },
  pitts: { file: 'tests/inputs/pitts-baseline.rec', record: recordPittsFlight },
  uglystik: { file: 'tests/inputs/uglystik-baseline.rec', record: recordUglystikFlight },
  p51: { file: 'tests/inputs/p51-baseline.rec', record: recordP51Flight },
  'p51-air': { file: 'tests/inputs/p51-air.rec', record: recordP51AirFlight },
  zagi: { file: 'tests/inputs/zagi-baseline.rec', record: recordZagiFlight },
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
