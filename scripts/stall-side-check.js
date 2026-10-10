/*
 * stall-side-check.js: no fixed air frame drops a fixed wing. Every
 * fixed wing aircraft, power off, launched level at 15 m/s with the sticks
 * centred, then full up elevator held 3 s: through the stall, in still
 * air, it holds its wings level, within 3 deg; and a fifth of rudder (or
 * of aileron, on an aircraft without a rudder) with it takes the wing one
 * way, the other rudder the other way by about as much: the aircraft has
 * no side of its own. The
 * tables carry no built in side (docs/STALL-STAGE1.md): the owner,
 * 2026-10-09, found every power off pull dropping the left wing. In Manual.
 *
 *   node scripts/stall-side-check.js   (npm run stall-side:check)
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
import { must } from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const MS = 4;
const TOUCH = 0.2;
const IDLE_RPM = 1000;
const DEG = 180 / Math.PI;

/* Bank from the quaternion, atan2 so past 90 deg reads as it is. */
function bankOf(s) {
  const [w, x, y, z] = [s[7], s[8], s[9], s[10]];
  return Math.atan2(2 * (y * z + w * x), 1 - 2 * (x * x + y * y));
}

/* Launched level at 15 m/s, power off, full up held: the bank, measured
 * until the nose passes 60 deg up (past that a loop's bank reads as a
 * roll), its worst and where it ends. */
function pull(sim, touch, axis) {
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
  must(sim.e.sim_set_pose(0, 0, 300, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(15), 'sim_wing_launch');
  let t = 0, worst = 0, end = 0, idle = 0;
  for (let ms = 0; ms < 3000; ms += MS) {
    const sticks = [0, 1, 0, 0];
    sticks[axis] = touch;
    must(sim.input(t / 1000, ...sticks), 'sim_input');
    must(sim.step(MS), 'sim_step');
    t += MS;
    const s = sim.readState().state;
    const [w, x, y, z] = [s[7], s[8], s[9], s[10]];
    if (Math.abs(Math.asin(Math.max(-1, Math.min(1, 2 * (w * y - x * z))))) > 60 / DEG) break;
    end = bankOf(s);
    worst = Math.max(worst, Math.abs(end));
    idle = Math.max(idle, s[14]);
  }
  return { worst, end, idle };
}

let bad = 0;
const say = (ok, what) => {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${what}`);
  if (!ok) bad += 1;
};
/* The P-51 keeps a measured asymmetry (docs/STALL-STAGE1.md). */
const KEEPS_SIDE = new Set(['p51d1450']);
for (const af of AIRFRAMES.filter((a) => a.fixedWing && !KEEPS_SIDE.has(a.id))) {
  const sim = await loadSim(wasmBytes);
  must(sim.init(configText), 'sim_init');
  must(sim.e.sim_set_airframe(af.simId), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  const level = pull(sim, 0, 2);
  /* An engine that idles with the throttle closed (a glow, gas or turbine
   * one, over IDLE_RPM) still turns its prop: its torque, swirl and
   * gyroscope have a side, and it is the prop's, so the checks are for an
   * aircraft whose power is off. An electric prop's ESC floor turns it a
   * few hundred rpm, which moves nothing. */
  if (level.idle > IDLE_RPM) {
    console.log(`  info  ${af.id}: the engine idles at ${level.idle.toFixed(0)} rpm and its prop banks it ${(level.end * DEG).toFixed(1)} deg; not judged`);
    continue;
  }
  say(level.worst * DEG < 3, `${af.id}: full up, power off, sticks else centred: wings within 3 deg (${(level.worst * DEG).toFixed(2)})`);
  /* The rudder where there is one, else the aileron. */
  const left = pull(sim, -TOUCH, 2), right = pull(sim, TOUCH, 2);
  const axis = Math.abs(left.end - right.end) > 1e-6 ? 2 : 0;
  const l = axis === 2 ? left : pull(sim, -TOUCH, 0), r = axis === 2 ? right : pull(sim, TOUCH, 0);
  /* Mirror: left and right take the wing opposite ways from where the
   * centred pull leaves it, by about as much. Which way a rudder rolls an
   * aircraft is its own (a low wing without dihedral rolls against it). */
  const dl = l.end - level.end, dr = r.end - level.end;
  say(dl * dr < 0 && Math.abs(Math.abs(dl) - Math.abs(dr)) < 0.5 * Math.max(Math.abs(dl), Math.abs(dr)),
    `${af.id}: ${axis === 2 ? 'rudder' : 'aileron'} either way takes the wing either way, by about as much (${(dl * DEG).toFixed(1)}, ${(dr * DEG).toFixed(1)} deg from the centred pull)`);
}
if (bad) {
  console.log(`${bad} FAILED`);
  process.exit(1);
}
console.log('every aircraft with its power off holds its wings level through the stall, and rudder either way takes them either way');
