/*
 * spool-derive.js: how fast each electric prop answers the throttle,
 * plant_wing.c's prop_spool, measured off the plant. Each powered aircraft
 * stands nose up and still at a throttle, then the stick steps; the row is
 * the time to 63 and 90 percent of the thrust's change, up from half to
 * full and back, and from rest to full. The plant integrates the rotor at
 * its 1 ms step, explicitly, so the check fails if any time constant is
 * under ten steps. Run with npm run spool:derive (dist/sim.wasm built).
 *
 * Harness arithmetic in JS maths, which is allowed: nothing it prints is
 * hashed, and every flight is the plant's own deterministic step.
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

import { AIRFRAMES } from '../configs/airframes.js';
import { loadSim } from '../tests/lib/simmod.js';
import { wingDebug, must } from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const MS = 1;
const NOSE_UP = [Math.SQRT1_2, 0, -Math.SQRT1_2, 0];
const LEAST_MS = 10;

async function planeSim(af) {
  const sim = await loadSim(wasmBytes);
  must(sim.init(configText), 'sim_init');
  must(sim.e.sim_set_airframe(af.simId), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  return sim;
}

/* Thrust after each 1 ms, the stick at `from` for 3 s then `to` for 1 s;
 * held in place each step so the airspeed stays nothing. */
function step(sim, from, to) {
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
  const out = [];
  for (let ms = 0; ms < 4000; ms += MS) {
    must(sim.e.sim_set_pose(0, 0, 300, ...NOSE_UP), 'sim_set_pose');
    must(sim.input(ms / 1000, 0, 0, 0, ms < 3000 ? from : to), 'sim_input');
    must(sim.step(MS), 'sim_step');
    if (ms >= 2999) out.push(wingDebug(sim)[8]);
  }
  return out;
}

function times(T) {
  const a = T[0], b = T[T.length - 1];
  const at = (f) => T.findIndex((x) => (b > a ? x >= a + f * (b - a) : x <= a + f * (b - a)));
  return [at(0.632), at(0.9)];
}

let bad = 0;
for (const af of AIRFRAMES.filter((a) => a.fixedWing && !a.id.endsWith('f'))) {
  const sim = await planeSim(af);
  const up = step(sim, 0.5, 1);
  if (!(up[up.length - 1] > 0)) continue;
  const rows = [['half to full', up], ['full to half', step(sim, 1, 0.5)], ['rest to full', step(sim, 0, 1)]].map(([k, T]) => [k, ...times(T)]);
  /* A glow engine's speed is still the throttle's in the step it is
   * asked, the next millisecond here: prop_spool is the electric motor's. */
  if (rows.every((r) => r[2] <= 1)) {
    console.log(`${af.id.padEnd(14)} the step it is asked: not electric`);
    continue;
  }
  const least = Math.min(...rows.map((r) => r[1]));
  const ok = least >= LEAST_MS;
  if (!ok) bad += 1;
  console.log(`${af.id.padEnd(14)} ${rows.map(([k, t63, t90]) => `${k} ${t63}/${t90} ms`).join(', ')}${ok ? '' : '  UNDER TEN STEPS'}`);
}
if (bad) {
  console.log(`${bad} aircraft spool faster than the step resolves`);
  process.exit(1);
}
