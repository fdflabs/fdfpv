/*
 * as3x-derive.js: the gains of mode 3's rate damper (FixedWingParams.as3x_k),
 * E-flite's AS3X with SAFE Select off, for each aircraft that ships with it
 * and each one a pilot may fit a Spektrum AS3X receiver to (docs/CONTROLLERS.md).
 * AS3X adds to each servo's command a term against the body's rate on that
 * axis; Horizon publishes no gains, only that too much shows as
 * "oscillation at high speed" (the Extra 300 3D manual, p. 4 and its AS3X
 * troubleshooting guide, p. 13). So the gain is the most a rate loop with
 * the receiver's delay can carry at the aircraft's top speed, halved: the
 * 6 dB gain margin MIL-F-9490D asks of a flight control loop.
 *
 * A rate loop k on a surface of control power M (rad/s^2 of body rate per
 * rad of surface) with a pure delay tau crosses over near w = k M, where
 * the delay's phase is k M tau; it oscillates at k M tau = pi / 2. Half
 * that, k = pi / (4 M tau). M is the plant's own at the top speed, level
 * at full throttle: one 4 ms step with a small stick against the same
 * step centred, over the surface's angle that stick gave. tau is the
 * servo frame AS3X writes at, 22 ms, Spektrum's default ("22ms is the
 * default setting", the AS3000 manual), the gyro's sample held a frame
 * before the servo sees it. The gain is at centre stick; plant_wing.c
 * takes it out as the stick moves, Spektrum's priority.
 *
 * With --check it fails when a table differs from what it derives. Run
 * with npm run as3x:derive (dist/sim.wasm built first).
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

import { loadSim } from '../tests/lib/simmod.js';
import { must, attitude } from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const src = await readFile(join(root, 'src/native/plant_wing.c'), 'utf8');
const check = process.argv.includes('--check');

const TAU = 0.022;
const MS = 4;
/* The aircraft with an AS3X row: their table and sim id. The Extra and
 * the Timber ship with it; the rest may be fitted with it. */
const AS3X = {
  FW_EXTRA3D1308: { sim: 29 },
  FW_TIMBER1500: { sim: 7 },
  FW_TIMBER1500F: { sim: 9 },
  FW_CUB1400: { sim: 4 },
  FW_CUB1400F: { sim: 10 },
  FW_SLOWSTICK1180: { sim: 5 },
  FW_RADIAN2000: { sim: 6 },
  FW_BOMBSHELL1118: { sim: 11 },
  FW_KADET1981: { sim: 12 },
  FW_P51D1450: { sim: 15 },
  FW_F16878: { sim: 16 },
  FW_ZAGI1219: { sim: 17 },
  FW_UGLYSTIK1567: { sim: 19 },
  FW_TIGERMOTH1803: { sim: 23 },
};

async function planeSim(id) {
  const sim = await loadSim(wasmBytes);
  must(sim.init(configText), 'sim_init');
  must(sim.e.sim_set_airframe(id), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  sim.surfPtr = sim.e.malloc(4 * 8);
  return sim;
}

/* Level at full throttle, the pitch held on the elevator, until the speed
 * stops growing: the top speed. */
function topSpeed(sim) {
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
  must(sim.e.sim_set_pose(0, 0, 300, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(15), 'sim_wing_launch');
  let t = 0, s;
  for (let ms = 0; ms < 30000; ms += MS) {
    s = sim.readState().state;
    const { pitch } = attitude(s);
    const stick = Math.max(-1, Math.min(1, 2 * (0 - pitch) + 0.2 * s[12] - 0.05 * s[6]));
    must(sim.input(t / 1000, 0, stick, 0, 1), 'sim_input');
    must(sim.step(MS), 'sim_step');
    t += MS;
  }
  return Math.hypot(s[4], s[5], s[6]);
}

/* Control power per axis at V, level, full throttle: rad/s^2 per rad. */
function power(sim, V) {
  const one = (sticks) => {
    must(sim.reset(), 'sim_reset');
    must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
    must(sim.e.sim_set_pose(0, 0, 300, 1, 0, 0, 0), 'sim_set_pose');
    must(sim.e.sim_wing_launch(V), 'sim_wing_launch');
    must(sim.input(0, ...sticks, 1), 'sim_input');
    must(sim.step(MS), 'sim_step');
    const s = sim.readState().state;
    must(sim.e.sim_plane_surfaces(sim.surfPtr), 'sim_plane_surfaces');
    return { om: [s[11], s[12], s[13]], sf: Array.from(new Float64Array(sim.e.memory.buffer, sim.surfPtr, 4)) };
  };
  const base = one([0, 0, 0]);
  /* The receiver's roll and pitch commands, back out of the mix: an
   * elevon is pitch plus roll, a tail's ailerons are opposed and its
   * elevator a slot of its own, so both read the same way. */
  const cmd = (sf) => [(sf[1] - sf[0]) / 2, sf[2] + (sf[0] + sf[1]) / 2, sf[3]];
  const axis = (sticks, k) => {
    const r = one(sticks);
    const d = cmd(r.sf)[k] - cmd(base.sf)[k];
    /* An axis with no surface of its own (no ailerons on a rudder mix,
     * no rudder on the Zagi) has nothing for the gyro to move. */
    if (d === 0) return 0;
    return Math.abs((r.om[k] - base.om[k]) / (MS / 1000) / d);
  };
  return [axis([0.1, 0, 0], 0), axis([0, 0.1, 0], 1), axis([0, 0, 0.1], 2)];
}

const r4 = (x) => Number(x.toFixed(4));
let bad = 0;
for (const [name, a] of Object.entries(AS3X)) {
  const sim = await planeSim(a.sim);
  const V = topSpeed(sim);
  const M = power(sim, V);
  const k = M.map((m) => (m > 0 ? r4(Math.PI / (4 * m * TAU)) : 0));
  const body = src.slice(src.indexOf(`const FixedWingParams ${name} = {`)).split('\n};')[0];
  const ok = body.includes(`.as3x_k = { ${k.join(', ')} },`);
  console.log(`${name.padEnd(18)} top speed ${V.toFixed(2)} m/s, control power ${M.map((m) => m.toFixed(1)).join(' ')} rad/s^2 per rad: as3x_k ${k.join(', ')}${check && !ok ? '  DIFFERS' : ''}`);
  if (!ok) bad += 1;
}
if (check && bad) {
  console.log(`${bad} table(s) differ from their derivation`);
  process.exit(1);
}
