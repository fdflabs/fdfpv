/*
 * specs-selftest.js: every aircraft the player can fly is heard as an
 * engine, with numbers from its configs (src/render/enginespec.js).
 *
 *   npm run audio:specs
 *
 * Checks: every airframe, on every power option and every quad prop, gets
 * a spec whose model the engine has and whose parameters the engine
 * accepts, with whole positive blade counts; the hover rpm table is what
 * the plant hovers at now, within 1 percent; the Striker is heard as the
 * engine it carries. Plain Node, a few seconds.
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
import { AIRFRAMES, airframeById } from '../../configs/airframes.js';
import { MOTORS } from '../../configs/motors.js';
import { POWER } from '../../configs/power.js';
import { loadSim } from '../../tests/lib/simmod.js';
import { engineSpecFor, HOVER_RPM } from '../../src/render/enginespec.js';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
/* Restated from src/render/engine-worklet.js on purpose: a list a check
 * reads out of the file it checks cannot fail. */
const MODELS = new Set(['quad', 'wing', 'edf', 'glow2', 'glow4', 'boxer2', 'turbojet']);
const PARAMS = new Set(['motors', 'blades', 'poles', 'rpmRef', 'washV', 'rpmScale', 'idleRpm', 'gain', 'windRef', 'windGain']);

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) {
    failed += 1;
  }
}

function valid(spec) {
  if (!spec || !MODELS.has(spec.model)) {
    return `model ${spec && spec.model}`;
  }
  for (const [k, v] of Object.entries(spec.params || {})) {
    if (!PARAMS.has(k) || !(Number.isFinite(v) && v >= 0)) {
      return `${k} = ${v}`;
    }
  }
  const b = spec.params && spec.params.blades;
  if (b != null && !(Number.isInteger(b) && b > 0)) {
    return `blades ${b}`;
  }
  return '';
}

for (const af of AIRFRAMES) {
  const choices = [{}];
  if (MOTORS[af.id]) {
    for (const prop of MOTORS[af.id].props) {
      for (const option of MOTORS[af.id].options) {
        choices.push({ [af.id]: { option: option.id, prop: prop.id } });
      }
    }
  }
  if (POWER[af.id]) {
    for (const option of POWER[af.id]) {
      choices.push({ [af.id]: { option: option.id } });
    }
  }
  const bad = [];
  const seen = new Set();
  for (const power of choices) {
    const spec = engineSpecFor(af.id, power, {});
    const why = valid(spec);
    if (why) {
      bad.push(`${JSON.stringify(power)}: ${why}`);
    }
    seen.add(spec.model);
  }
  check(`${af.id}: every choice is an engine the worklet has`, bad.length === 0, bad.length ? bad.join('; ') : `${choices.length} choices, ${[...seen].join(', ')}`);
}

const striker = airframeById('striker2500');
check('the Striker is heard as the engine it carries',
  engineSpecFor(striker.id, {}, { striker2500: { payload: 'standard', accessories: [], propulsion: 'jet' } }).model === 'turbojet'
  && engineSpecFor(striker.id, {}, { striker2500: { payload: 'standard', accessories: [], propulsion: 'prop' } }).model === 'boxer2');
check('the F-16 is a ducted fan, not the turbojet', engineSpecFor('f16878', {}, {}).model === 'edf');
check('a four stroke is heard as one', engineSpecFor('kadet1981', {}, {}).model === 'glow4');

/* The hover table against the plant. */
const wasm = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
for (const [id, want] of Object.entries(HOVER_RPM)) {
  const af = airframeById(id);
  const tune = await readFile(join(root, `configs/${af.defaultTune}.diff`), 'utf8');
  let lo = 0.05;
  let hi = 0.8;
  let rpm = 0;
  for (let i = 0; i < 22; i += 1) {
    const mid = 0.5 * (lo + hi);
    const sim = await loadSim(wasm);
    sim.e.sim_set_airframe(af.simId);
    sim.init(tune);
    sim.setAngleMode(true);
    sim.reset();
    sim.setCellVoltage(4.0);
    sim.e.sim_set_pose(0, 0, 20, 1, 0, 0, 0);
    let vz = 0;
    for (let ms = 0; ms < 2500; ms += 4) {
      sim.input(ms / 1000, 0, 0, 0, mid);
      sim.step(4);
      const s = sim.readState().state;
      vz = s[6];
      rpm = (s[14] + s[15] + s[16] + s[17]) / 4;
    }
    if (vz > 0) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  check(`${id} hovers at the table's rpm`, Math.abs(rpm / want - 1) < 0.01, `${Math.round(rpm)} against ${want}`);
}

if (failed) {
  console.log(`audio:specs: ${failed} FAILED`);
  process.exit(1);
}
console.log('audio:specs: all pass');
