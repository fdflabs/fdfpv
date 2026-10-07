/*
 * arcade-check.js: the physics model flag (Expert or Arcade, written through
 * the wasm export sim_set_flight_style) changes the physics. On a hands-off
 * hover Arcade, the ideal quad, does not drift sideways at all, Expert, a
 * real frame with build tolerance, does, and the two traces differ. Runs
 * against the compiled dist/sim.wasm. Run with npm run lint:arcade.
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

/*
 * "Physics model doesn't do anything" was reported, and it was half true.
 * The plant reads the arcade flag, so the model is real, and the module
 * exports the setter, so the call lands; but the Freestyle room's row was
 * info-only and pointed at a launch card freestyle never shows, so on the
 * one path a pilot would look the setting could not be changed. The row was
 * fixed in ui.js; this is the other half, proof that the flag is worth
 * writing. Verify cannot see it: its determinism checks run one style and
 * assert the trace is stable, which would still hold if the flag did nothing.
 *
 * The hover has NO stick demand. A first draft commanded a hard roll, and a
 * rolled quad flies sideways in either style, so both drifted about four
 * metres and the number said nothing. Hands off, Arcade (flat plant axes, no
 * build tolerance) hangs exactly where it was put and a real frame cannot.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim } from '../tests/lib/simmod.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const STYLES = { expert: 0, arcade: 1 };
const ITERATIONS = 3000;
const THROTTLE = 0.55;
const CELL_VOLTS = 4.2;
/* The printed drift depends on exactly these sample points. */
const SAMPLE_EVERY = 500;
const SAMPLE_UNTIL = 2500;
const SAMPLED_DOUBLES = 6;

const wasm = await readFile(join(root, 'dist/sim.wasm'));
const tune = await readFile(join(root, 'configs/betaflight-default.diff'), 'utf8');

async function hover(style) {
  const sim = await loadSim(wasm);
  sim.init(tune);
  if (typeof sim.e.sim_set_flight_style !== 'function') {
    return null;
  }
  /* The style goes in before reset; the ABI says it survives reset and init. */
  sim.e.sim_set_flight_style(style);
  sim.reset();
  sim.setCellVoltage(CELL_VOLTS);
  const samples = [];
  let t = 0;
  for (let i = 0; i < ITERATIONS; i++) {
    sim.input(t, 0, 0, 0, THROTTLE);
    sim.step(1);
    if (i % SAMPLE_EVERY === 0 && i <= SAMPLE_UNTIL) {
      samples.push(Array.from(sim.readState().state.subarray(0, SAMPLED_DOUBLES)));
    }
    t += 0.001;
  }
  return samples;
}

function lateralDrift(samples) {
  return Math.max(...samples.map(([, x, y]) => Math.max(Math.abs(x), Math.abs(y))));
}

const expert = await hover(STYLES.expert);
const arcade = await hover(STYLES.arcade);

console.log('arcade check: does the physics model flag change the physics');
if (!expert || !arcade) {
  console.log('  dist/sim.wasm does not export sim_set_flight_style');
  console.log('');
  console.log('FAIL, the flag cannot be set at all');
  process.exit(1);
}

const eL = lateralDrift(expert);
const aL = lateralDrift(arcade);
console.log(`  expert lateral drift  ${eL.toExponential(3)} m`);
console.log(`  arcade lateral drift  ${aL.toExponential(3)} m`);

const arcadeTrace = arcade.flat();
const identical = expert.flat().every((v, i) => v === arcadeTrace[i]);
const problems = [
  [identical, 'the two styles produce an identical trace, so the flag does nothing'],
  [aL > 1e-9, `arcade drifted ${aL.toExponential(3)} m sideways, so it is not the ideal quad`],
  [eL <= 1e-6, `expert drifted only ${eL.toExponential(3)} m, so build asymmetry is not being applied`],
].filter(([bad]) => bad).map(([, text]) => text);

console.log('');
if (problems.length) {
  console.log(`FAIL, ${problems.length} problem(s):`);
  for (const text of problems) {
    console.log(`  ${text}`);
  }
  process.exit(1);
}
console.log('PASS, arcade is the ideal quad and expert is not');
