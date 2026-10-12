/*
 * reset-determinism-selftest.js: a reset leaves nothing of the flight
 * before it. Each scenario below is flown on a fresh module, then again on
 * one that has first flown every other scenario (crashes, a chute, Acro's
 * latched attitude, a mapped engine, a windmilling prop, flaps and gear),
 * and the two state traces must be bit identical.
 *
 * What a reset keeps on purpose is the pilot's switches (the stabiliser
 * mode, the flap notch, the slats fitted: src/main.js "The plant holds the
 * notch across resets"). They are inputs, so every scenario sets each of
 * them itself before its reset; the flaps then stand where the notch puts
 * them (sim_wing_flaps_settle), as a respawn finds them.
 *
 *   node scripts/reset-determinism-selftest.js
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

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim } from '../tests/lib/simmod.js';
import * as W from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const { must } = W;

/* Each: the airframe, the switches, the start, then the sticks by time. */
const SCENARIOS = [
  { name: 'P-51, full flap approach, a stick step', af: W.P51_AIRFRAME, stab: 0, flaps: 2, z: 10, v: 10.94,
    sticks: (t) => [0, t > 0.5 ? 0.1 : 0, 0, 0.3] },
  { name: 'Cub, full throttle into the ground', af: W.CUB_AIRFRAME, stab: 0, flaps: 0, z: 3, v: 12,
    sticks: () => [0.3, -1, 0, 1] },
  { name: 'Extra, Acro, a roll and let go', af: W.EXTRA_AIRFRAME, stab: 2, flaps: 0, z: 60, v: 18,
    sticks: (t) => [t < 1 ? 1 : 0, 0, 0, 0.6] },
  { name: 'Slick, throttle chopped to the idle stop', af: W.SLICK_AIRFRAME, stab: 0, flaps: 0, z: 80, v: 30,
    sticks: (t) => [0, 0, 0, t < 1 ? 1 : 0] },
  { name: 'Timber, Stabilised, the prop windmilling', af: W.TIMBER_AIRFRAME, stab: 1, flaps: 1, z: 60, v: 16,
    sticks: () => [0, 0, 0, 0] },
  { name: 'Bramor, the chute pulled', af: W.BRAMOR_AIRFRAME, stab: 1, flaps: 0, z: 100, v: 16,
    sticks: (t) => [0, 0, 0, t < 1 ? 0.6 : 0], chuteAt: 1 },
];

function fly(sim, sc) {
  must(sim.e.sim_set_airframe(sc.af), 'sim_set_airframe');
  must(sim.e.sim_wing_set_stab(sc.stab), 'sim_wing_set_stab');
  if (sc.settle === false) {
    must(sim.reset(), 'sim_reset');
    must(sim.e.sim_wing_set_flaps(sc.flaps), 'sim_wing_set_flaps');
  } else {
    must(sim.e.sim_wing_set_flaps(sc.flaps), 'sim_wing_set_flaps');
    must(sim.reset(), 'sim_reset');
    must(sim.e.sim_wing_flaps_settle(), 'sim_wing_flaps_settle');
  }
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_set_pose(0, 0, sc.z, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(sc.v), 'sim_wing_launch');
  const h = createHash('sha256');
  for (let ms = 0; ms < 3000; ms += W.RC_STEP_MS) {
    if (sc.chuteAt != null && ms === sc.chuteAt * 1000) must(sim.e.sim_wing_chute(1), 'sim_wing_chute');
    must(sim.input(ms / 1000, ...sc.sticks(ms / 1000)), 'sim_input');
    must(sim.step(W.RC_STEP_MS), 'sim_step');
    h.update(new Uint8Array(sim.readState().state.buffer.slice(0)));
  }
  return h.digest('hex').slice(0, 16);
}

async function freshSim() {
  const sim = await loadSim(wasmBytes);
  must(sim.init(configText), 'sim_init');
  return sim;
}

let failed = 0;
const fresh = [];
for (const sc of SCENARIOS) fresh.push(fly(await freshSim(), sc));
/* One module, every scenario in turn and then each again in reverse, so
 * each is flown after all the others. */
const used = await freshSim();
for (const sc of SCENARIOS) fly(used, sc);
for (let i = SCENARIOS.length - 1; i >= 0; i -= 1) {
  const got = fly(used, SCENARIOS[i]);
  const ok = got === fresh[i];
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${SCENARIOS[i].name}: fresh ${fresh[i]}, after the others ${got}`);
}
/* The negative control, the order that misled a probe: the notch moved
 * after the reset slews the flaps out from where the last flight's notch
 * left them, so the same calls give two flights. The check must see it. */
{
  const late = (sim, prior) => {
    must(sim.e.sim_set_airframe(W.P51_AIRFRAME), 'sim_set_airframe');
    must(sim.e.sim_wing_set_flaps(prior), 'sim_wing_set_flaps');
    must(sim.reset(), 'sim_reset');
    return fly(sim, { ...SCENARIOS[0], settle: false });
  };
  const a = late(await freshSim(), 0);
  const b = late(await freshSim(), 2);
  const ok = a !== b;
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  negative control: the notch set after the reset is seen (${a} against ${b})`);
}
console.log(failed ? `${failed} FAILED` : `reset-determinism: ${SCENARIOS.length} scenarios bit identical fresh and after the others`);
process.exit(failed ? 1 : 0);
