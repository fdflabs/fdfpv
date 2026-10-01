/*
 * strikerpilot.js: a harness pilot for the Striker (docs/COMBAT-DRONES.md
 * section 7), flown in Manual on the plant's elevons, for
 * scripts/combat-gates.js. Its sticks are a test's hands, not the shell's
 * stabiliser: wings held level, and a height or an airspeed held on the
 * pitch through an attitude loop whose gain falls with the square of the
 * speed, since the elevons' authority grows with it and the Striker flies
 * from 11 to 65 m/s. Harness arithmetic in JS maths, allowed here because
 * it only chooses sticks: the plant integrates them.
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

import { SIM_OK } from '../../tests/lib/simmod.js';
import { combatAddon, combatSimId } from '../../configs/combat.js';

export const RC_MS = 4;

function must(code, where) {
  if (code !== SIM_OK) {
    throw new Error(`${where}: the module returned ${code}`);
  }
}

function setBlock(sim, fn, values) {
  const ptr = sim.e.malloc(values.length * 8);
  new Float64Array(sim.e.memory.buffer, ptr, values.length).set(values);
  const rc = sim.e[fn](ptr);
  sim.e.free(ptr);
  return rc;
}

/* Pitch and bank from the state's quaternion: nose up and right wing down
 * positive. */
export function attitude(s) {
  const w = s[7], x = s[8], y = s[9], z = s[10];
  return {
    pitch: Math.asin(Math.max(-1, Math.min(1, 2 * (x * z - w * y)))),
    bank: Math.asin(Math.max(-1, Math.min(1, 2 * (y * z + w * x)))),
  };
}

/* The wing's debug block: [0] alpha, [3] CL, [8] thrust, N. */
export function wingDebug(sim) {
  if (!sim.wingDebugPtr) {
    sim.wingDebugPtr = sim.e.malloc(20 * 8);
  }
  must(sim.e.sim_wing_debug(sim.wingDebugPtr), 'sim_wing_debug');
  return Array.from(new Float64Array(sim.e.memory.buffer, sim.wingDebugPtr, 20));
}

/*
 * The Striker as the shell seats it: its propulsion's plant, the tune,
 * the payload and accessories through sim_set_addons and their spread,
 * Manual, a reset. `choice` is configs/combat.js's, its propulsion
 * included.
 */
export async function seatStriker(loadSim, wasm, tuneText, af, choice) {
  const sim = await loadSim(wasm);
  must(sim.e.sim_set_airframe(combatSimId(af, choice)), 'sim_set_airframe');
  must(sim.init(tuneText), 'sim_init');
  const add = combatAddon(af, choice);
  if (add) {
    must(sim.setAddons(add.block), 'sim_set_addons');
    must(setBlock(sim, 'sim_set_addon_inertia', add.inertia), 'sim_set_addon_inertia');
  }
  must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
  must(sim.reset(), 'sim_reset');
  return sim;
}

/*
 * Fly from a pose: `z0` up, level, at `v0` along x, the engine as the
 * reset left it (a turbine at its idle) unless `launch`, which is the
 * rail's release and runs a turbine up; `quat` its attitude, level
 * unless given. `hold` is { z } (the height), { v } (an airspeed, on the
 * pitch), { vz } (a sink or climb rate, a function of the height over
 * z = 0) or { pitch } (an attitude, a function of the ms); `thr` the stick
 * or a function of the ms.
 * Returns the mean of the last `meanS` seconds and calls onStep each
 * stick step.
 */
export function flyStriker(sim, {
  thr = 0.6, seconds = 40, meanS = 8, z0 = 300, v0 = 20, launch = false, quat = [1, 0, 0, 0], hold = { z: null }, onStep = null,
  pitchMin = -0.35, pitchMax = 0.6,
} = {}) {
  must(sim.e.sim_set_pose(0, 0, z0, ...quat), 'sim_set_pose');
  if (launch) {
    must(sim.e.sim_wing_launch(v0), 'sim_wing_launch');
  } else {
    must(sim.e.sim_set_velocity(v0, 0, 0, 0, 0, 0), 'sim_set_velocity');
  }
  const zT = hold.z ?? z0;
  let trim = 0.02;
  const tail = [];
  const total = seconds * 1000;
  for (let ms = 0; ms < total; ms += RC_MS) {
    const s = sim.readState().state;
    const { pitch, bank } = attitude(s);
    const v = Math.hypot(s[4], s[5], s[6]);
    const vz = s[6];
    const q = -s[12];
    let pitchT;
    if (hold.pitch) {
      pitchT = hold.pitch(ms);
    } else if (hold.v != null) {
      trim += 0.00004 * (v - hold.v);
      trim = Math.max(pitchMin, Math.min(pitchMax, trim));
      pitchT = trim + 0.03 * (v - hold.v);
    } else {
      const vzT = hold.vz ? hold.vz(s[3]) : Math.max(-4, Math.min(4, 0.25 * (zT - s[3])));
      trim += 0.00006 * (vzT - vz);
      trim = Math.max(pitchMin, Math.min(pitchMax, trim));
      pitchT = trim + 0.03 * (vzT - vz);
    }
    pitchT = Math.max(pitchMin, Math.min(pitchMax, pitchT));
    const k = (20 / Math.max(v, 10)) ** 2;
    const pitchIn = Math.max(-1, Math.min(1, 3.0 * k * (pitchT - pitch) - 0.6 * Math.sqrt(k) * q));
    const roll = Math.max(-1, Math.min(1, -1.5 * Math.sqrt(k) * bank - 0.15 * Math.sqrt(k) * s[11]));
    const t = typeof thr === 'function' ? thr(ms) : thr;
    must(sim.input(ms / 1000, roll, pitchIn, 0, t), 'sim_input');
    must(sim.step(RC_MS), 'sim_step');
    if (ms >= total - meanS * 1000) {
      tail.push({ v, vz, pitch, z: s[3] });
    }
    if (onStep) {
      onStep({ ms, v, vz, pitch, bank, s });
    }
  }
  const mean = (key) => tail.reduce((a, o) => a + o[key], 0) / tail.length;
  return { v: mean('v'), vz: mean('vz'), pitch: mean('pitch'), z: mean('z') };
}
