/*
 * as3x-derive.js: the gains of mode 3's rate damper (FixedWingParams.as3x_k),
 * E-flite's AS3X with SAFE Select off, for each aircraft that ships with it.
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
/* The aircraft that ship with AS3X: their table and sim id. */
const AS3X = {
  FW_EXTRA3D1308: { sim: 29 },
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

/* Control power per axis at V, level, full throttle: rad/s^2 per rad.
 * The stick is held 100 ms with the aircraft written back to level at V
 * each 1 ms step, so the servos (servo_rate) have reached it, then one
 * step's rate over the surface's angle, against the same with the stick
 * centred. */
function power(sim, V) {
  const one = (sticks) => {
    must(sim.reset(), 'sim_reset');
    must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
    for (let ms = 0; ms <= 100; ms += 1) {
      must(sim.e.sim_set_pose(0, 0, 300, 1, 0, 0, 0), 'sim_set_pose');
      must(sim.e.sim_set_velocity(V, 0, 0, 0, 0, 0), 'sim_set_velocity');
      must(sim.input(ms / 1000, ...sticks, 1), 'sim_input');
      must(sim.step(1), 'sim_step');
    }
    const s = sim.readState().state;
    must(sim.e.sim_plane_surfaces(sim.surfPtr), 'sim_plane_surfaces');
    return { om: [s[11], s[12], s[13]], sf: Array.from(new Float64Array(sim.e.memory.buffer, sim.surfPtr, 4)) };
  };
  const base = one([0, 0, 0]);
  const axis = (sticks, k, surf) => {
    const r = one(sticks);
    return Math.abs((r.om[k] - base.om[k]) / 0.001 / (r.sf[surf] - base.sf[surf]));
  };
  return [axis([0.1, 0, 0], 0, 1), axis([0, 0.1, 0], 1, 2), axis([0, 0, 0.1], 2, 3)];
}

/* The heading's rate per stick: what the airframe itself turns at a
 * tenth of stick, level at 16 m/s and hanging on the prop at the hover's
 * throttle, the larger of the two, so the gyro never asks the stick for
 * less rotation than the aircraft gives it in either. Rad/s per unit
 * stick, signed as the rate. Each 0.4 s, the last 0.2 s's mean over the
 * centred stick's. */
function hoverHeld(sim) {
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
  must(sim.e.sim_set_pose(0, 0, 50, Math.SQRT1_2, 0, -Math.SQRT1_2, 0), 'sim_set_pose');
  let thr = 0.6, iR = 0, iP = 0, iY = 0, t = 0, st = [0, 0, 0, 0.6];
  const clamp = (x) => Math.max(-1, Math.min(1, x));
  for (let ms = 0; ms < 6000; ms += MS) {
    const s = sim.readState().state;
    const [w, x, y, z] = [s[7], s[8], s[9], s[10]];
    /* World up in the body's z and y: the nose's lean off vertical. */
    const up2 = 1 - 2 * (x * x + y * y), upY = 2 * (y * z + w * x);
    thr = Math.max(0, Math.min(1, thr - 0.002 * s[6] - 0.0005 * (s[3] - 50)));
    iR = Math.max(-1.5, Math.min(1.5, iR - 0.008 * s[11]));
    iP = clamp(iP + 0.004 * up2);
    iY = clamp(iY - 0.004 * upY);
    st = [clamp(iR - 0.5 * s[11]), clamp(iP + 3 * up2 + 0.5 * s[12]), clamp(iY - 3 * upY + 0.5 * s[13]), thr];
    must(sim.input(t / 1000, ...st), 'sim_input');
    must(sim.step(MS), 'sim_step');
    t += MS;
  }
  return { st, t };
}
function slopes(sim) {
  const out = [];
  for (let ax = 0; ax < 3; ax += 1) {
    const at = (prep) => {
      const r = prep();
      let t = r.t, sum = 0, n = 0;
      const base = sim.readState().state[11 + ax];
      const st = r.st.slice();
      st[ax] = Math.max(-1, Math.min(1, st[ax] + 0.1));
      for (let ms = 0; ms < 400; ms += MS) {
        must(sim.input(t / 1000, ...st), 'sim_input');
        must(sim.step(MS), 'sim_step');
        t += MS;
        if (ms >= 200) { sum += sim.readState().state[11 + ax] - base; n += 1; }
      }
      return sum / n / 0.1;
    };
    const cruise = at(() => {
      must(sim.reset(), 'sim_reset');
      must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
      must(sim.e.sim_set_pose(0, 0, 300, 1, 0, 0, 0), 'sim_set_pose');
      must(sim.e.sim_wing_launch(16), 'sim_wing_launch');
      return { st: [0, 0, 0, 0.624], t: 0 };
    });
    const hover = at(() => hoverHeld(sim));
    out.push(Math.abs(cruise) > Math.abs(hover) ? cruise : hover);
  }
  return out;
}

/* The loop as the plant runs it, frame, hold and servo slew included:
 * level at 35 m/s, past the top speed as a dive takes it (analysis pass
 * 2's case), each axis kicked 1 rad/s with the sticks centred in mode 3;
 * the most the kick's rate is still off by 1 to 1.5 s on, rad/s. */
function kickLeft(sim) {
  const out = [];
  for (let ax = 0; ax < 3; ax += 1) {
    must(sim.reset(), 'sim_reset');
    must(sim.e.sim_wing_set_stab(3), 'sim_wing_set_stab');
    must(sim.e.sim_set_pose(0, 0, 300, 1, 0, 0, 0), 'sim_set_pose');
    must(sim.e.sim_wing_launch(35), 'sim_wing_launch');
    let t = 0;
    for (let ms = 0; ms < 400; ms += MS) {
      must(sim.input(t / 1000, 0, 0, 0, 1), 'sim_input');
      must(sim.step(MS), 'sim_step');
      t += MS;
    }
    const s = sim.readState().state;
    const w = [s[11], s[12], s[13]];
    w[ax] += 1;
    must(sim.e.sim_set_velocity(s[4], s[5], s[6], ...w), 'sim_set_velocity');
    let late = 0;
    for (let ms = 0; ms < 1500; ms += MS) {
      must(sim.input(t / 1000, 0, 0, 0, 1), 'sim_input');
      must(sim.step(MS), 'sim_step');
      t += MS;
      if (ms >= 1000) late = Math.max(late, Math.abs(sim.readState().state[11 + ax] - s[11 + ax]));
    }
    out.push(late);
  }
  must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
  return out;
}
const KICK_MAX = 0.05;

const r3 = (x) => Number(x.toFixed(3));
const r4 = (x) => Number(x.toFixed(4));
let bad = 0;
for (const [name, a] of Object.entries(AS3X)) {
  const sim = await planeSim(a.sim);
  const V = topSpeed(sim);
  const M = power(sim, V);
  const k = M.map((m) => r4(Math.PI / (4 * m * TAU)));
  /* The heading's integral corner a quarter of the rate loop's crossover,
   * pi / (4 tau), the usual PI rule: kh = k pi / (16 tau). */
  const kh = k.map((x) => r4(x * Math.PI / (16 * TAU)));
  const body = src.slice(src.indexOf(`const FixedWingParams ${name} = {`)).split('\n};')[0];
  const rate = slopes(sim).map(r3);
  const ok = body.includes(`.as3x_k = { ${k.join(', ')} },`) && body.includes(`.as3x_kh = { ${kh.join(', ')} },`) && body.includes(`.as3x_rate = { ${rate.join(', ')} },`);
  const left = kickLeft(sim);
  const settles = left.every((x) => x < KICK_MAX);
  console.log(`${name.padEnd(18)} at 35 m/s a 1 rad/s kick leaves ${left.map((x) => x.toFixed(3)).join(', ')} rad/s 1 s on${settles ? '' : '  OSCILLATES'}`);
  if (!settles) bad += 1;
  console.log(`${name.padEnd(18)} top speed ${V.toFixed(2)} m/s, control power ${M.map((m) => m.toFixed(1)).join(' ')} rad/s^2 per rad: as3x_k ${k.join(', ')}, as3x_kh ${kh.join(', ')}, as3x_rate ${rate.join(', ')}${check && !ok ? '  DIFFERS' : ''}`);
  if (!ok) bad += 1;
}
if (check && bad) {
  console.log(`${bad} table(s) differ from their derivation`);
  process.exit(1);
}
