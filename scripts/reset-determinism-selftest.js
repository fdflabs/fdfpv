/*
 * reset-determinism-selftest.js: a reset leaves nothing of the flight
 * before it. Each scenario below is flown on a fresh module, then again on
 * one that has first flown every other scenario (a crash, a chute, Acro's
 * latched attitude, a turbine spooled down, a piston engine at its idle),
 * and the two state traces must be bit identical. The P-51's flaps, the
 * Cub's crash, the Extra's Acro, the Slick's idle stop and the Timber's
 * windmill flew it first; the crash, Acro and the drives are flown on the
 * Bramor and the Striker since those aircraft left the module on
 * 2026-10-20, the flaps with them.
 *
 * What a reset keeps on purpose is the pilot's switches (the stabiliser
 * mode). It is an input, so every scenario sets it itself before its
 * reset, as a respawn finds it.
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
  { name: 'Striker prop, full throttle into the ground', af: W.STRIKER_PROP_AIRFRAME, stab: 0, z: 3, v: 20,
    sticks: () => [0.3, -1, 0, 1] },
  { name: 'Bramor, Acro, a roll and let go', af: W.BRAMOR_AIRFRAME, stab: 2, z: 60, v: 18,
    sticks: (t) => [t < 1 ? 1 : 0, 0, 0, 0.6] },
  { name: 'Striker jet, throttle chopped', af: W.STRIKER_JET_AIRFRAME, stab: 0, z: 80, v: 30,
    sticks: (t) => [0, 0, 0, t < 1 ? 1 : 0] },
  { name: 'Striker prop, Stabilised, the engine at its idle', af: W.STRIKER_PROP_AIRFRAME, stab: 1, z: 60, v: 20,
    sticks: () => [0, 0, 0, 0] },
  { name: 'Bramor, the chute pulled', af: W.BRAMOR_AIRFRAME, stab: 1, z: 100, v: 16,
    sticks: (t) => [0, 0, 0, t < 1 ? 0.6 : 0], chuteAt: 1 },
];

function fly(sim, sc) {
  must(sim.e.sim_set_airframe(sc.af), 'sim_set_airframe');
  if (sc.stab != null) must(sim.e.sim_wing_set_stab(sc.stab), 'sim_wing_set_stab');
  must(sim.reset(), 'sim_reset');
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
/* The negative control: a switch the reset keeps on purpose, the
 * stabiliser mode, left to the flight before (the Bramor's Acro scenario
 * flown without setting it) gives two flights from the same calls. The
 * check must see it. (The P-51's flap notch set after the reset was the
 * control until the P-51 left the module.) */
{
  const late = (sim, prior) => {
    must(sim.e.sim_set_airframe(W.BRAMOR_AIRFRAME), 'sim_set_airframe');
    must(sim.e.sim_wing_set_stab(prior), 'sim_wing_set_stab');
    must(sim.reset(), 'sim_reset');
    return fly(sim, { ...SCENARIOS[1], stab: null });
  };
  const a = late(await freshSim(), 0);
  const b = late(await freshSim(), 2);
  const ok = a !== b;
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  negative control: the stabiliser mode left to the flight before is seen (${a} against ${b})`);
}
/*
 * The seat, in either order. A host may reset the module and then seat the
 * aircraft (a respawn into another craft, and many harnesses), or seat it
 * and then reset (src/main.js, sim_init after sim_set_airframe). The craft
 * must fly the same flight both ways and again after a reset, bit for bit:
 * sim_set_airframe to another aircraft leaves none of the last one's state
 * behind. Every airframe the module accepts, seated over a quad (the five
 * inch, the module's default) and over a fixed wing (the Bramor), set
 * going by sim_set_velocity at a stick step, not sim_wing_launch, whose
 * own reset of the drive hid it.
 */
const COUNT = Number(/#define SIM_AIRFRAME_COUNT (\d+)/.exec(await readFile(join(root, 'src/native/sim_internal.h'), 'utf8'))[1]);
function seatFly(sim, wing) {
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_set_pose(0, 0, 60, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_set_velocity(wing ? 18 : 0, 0, 0, 0, 0, 0), 'sim_set_velocity');
  const h = createHash('sha256');
  for (let ms = 0; ms < 2000; ms += W.RC_STEP_MS) {
    must(sim.input(ms / 1000, 0, ms > 500 ? 0.1 : 0, 0, ms > 1000 ? 0.8 : 0.5), 'sim_input');
    must(sim.step(W.RC_STEP_MS), 'sim_step');
    h.update(new Uint8Array(sim.readState().state.buffer.slice(0)));
  }
  return h.digest('hex').slice(0, 16);
}
/* Which ids the module seats, and which of them are fixed wings (they
 * take sim_wing_launch), each probed on a module of its own. */
const ids = [];
const wings = new Set();
for (let id = 0; id < COUNT; id += 1) {
  const probe = await freshSim();
  if (probe.e.sim_set_airframe(id) !== 0) continue;
  ids.push(id);
  if (probe.e.sim_wing_launch(0) === 0) wings.add(id);
}
let seatBad = 0;
for (const id of ids) {
  const before = await loadSim(wasmBytes);
  must(before.e.sim_set_airframe(id), 'sim_set_airframe');
  must(before.init(configText), 'sim_init');
  must(before.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
  const want = seatFly(before, wings.has(id));
  const got = [];
  for (const prior of [0, W.BRAMOR_AIRFRAME].filter((p) => p !== id)) {
    const sim = await freshSim();
    must(sim.e.sim_set_airframe(prior), 'sim_set_airframe prior');
    must(sim.reset(), 'sim_reset');
    must(sim.e.sim_set_airframe(id), 'sim_set_airframe');
    must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
    got.push([`seated after a reset on ${prior}`, seatFly(sim, wings.has(id))]);
    must(sim.reset(), 'sim_reset');
    got.push([`then after a reset`, seatFly(sim, wings.has(id))]);
  }
  const off = got.filter(([, h]) => h !== want);
  if (off.length) {
    seatBad += 1;
    console.log(`FAIL  airframe ${id}: seated then reset ${want}; ${off.map(([w, h]) => `${w} ${h}`).join(', ')}`);
  }
}
if (seatBad) failed += seatBad;
console.log(`${seatBad ? 'FAIL' : 'ok  '}  the seat in either order: ${ids.length - seatBad} of ${ids.length} airframes (${ids.join(' ')}) fly the same flight seated before a reset, after one, and again after another`);
console.log(failed ? `${failed} FAILED` : `reset-determinism: ${SCENARIOS.length} scenarios bit identical fresh and after the others`);
process.exit(failed ? 1 : 0);
