/*
 * as3x-feel.js: AS3X never changes the way the plane flies, only how
 * the air moves it. The owner, 2026-10-12: "i dont actually want the as3x
 * to stabilize things wildly just do small corrections never actually
 * change the way the plane behaves". Spektrum's own account: stick
 * priority "reduces the amount of gyro gain as you move the control stick
 * away from center" (the AS3000 manual; 160, every factory preset's, "the
 * gain goes to 0 at 40% stick input").
 *
 * For every aircraft with an AS3X row, level at its table's cruise on the
 * stick that flies it level (stab_trim_throttle), the receiver at its
 * default Heading, zero:
 *   F1  the stick: each axis' stick stepped to half and to full, the
 *       body rate's answer on that axis (the stepped flight's rate less
 *       the same flight's unstepped, over 0.8 s) under AS3X matches
 *       Manual's. The tolerance is the run-to-run spread of Manual's own
 *       answer: the same step taken 0.1 s earlier and later, the most its
 *       answer differs between those three, since a pilot never moves the
 *       stick at the same instant twice.
 *   F2  the air: a gust, a 2 m/s step of side wind (the weather's gusty
 *       RMS, src/game/weather.js) and, separately, a 2 m/s step of rising
 *       air, each from 1 s on: the three rates' departure from the calm
 *       flight, integrated over 2 s, is less under AS3X than Manual.
 *
 * --plane NAME runs one table. Exit 1 on any failure.
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

import { must } from '../tests/lib/wingpilot.js';
import { TABLE } from '../configs/power.js';
import { SEAT_GATES } from './lib/propcurve.js';
import { AS3X, planeSim, rowOf, receiverOf, numOf } from './lib/as3xloop.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = await readFile(join(root, 'src/native/plant_wing.c'), 'utf8');
const argv = process.argv.slice(2);
const only = argv.includes('--plane') ? argv[argv.indexOf('--plane') + 1] : null;
const D = 180 / Math.PI;
const AX = ['roll', 'pitch', 'yaw'];
const T0 = 1000;
const STICK_MS = 800;
const GUST_MS = 2000;

let failed = 0, passed = 0;
const check = (name, ok, detail) => {
  if (ok) passed += 1; else failed += 1;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}  (${detail})`);
};

for (const [name, a] of Object.entries(AS3X)) {
  if (only && name !== only) continue;
  const body = rowOf(src, name);
  const rx = receiverOf(body);
  const V = Object.values(TABLE).find((t) => t.simId === a.sim).cruiseMs;
  const thr = numOf(body, 'stab_trim_throttle');
  const sim = await planeSim(a.sim, SEAT_GATES);
  must(sim.setHeading([0, 0, 0]), 'sim_wing_set_heading');
  console.log(`\n${name} at ${V} m/s, throttle ${thr}`);

  /* A level flight from launch; from t0 the sticks st, and air(ms) set
   * the air each step. The rates every step from t0 for ms. */
  const fly = (mode, t0, st, ms, air = null) => {
    must(sim.reset(), 'sim_reset');
    must(sim.e.sim_wing_set_stab(mode), 'sim_wing_set_stab');
    must(sim.e.sim_set_pose(0, 0, 300, 1, 0, 0, 0), 'sim_set_pose');
    must(sim.e.sim_wing_launch(V), 'sim_wing_launch');
    const w = [];
    for (let t = 0; t < t0 + ms; t += 1) {
      if (air) air(t >= t0);
      const sticks = t >= t0 ? [...st, thr] : [0, 0, 0, thr];
      must(sim.input(t / 1000, ...sticks), 'sim_input');
      must(sim.step(1), 'sim_step');
      if (t >= t0) w.push(sim.readState().state.slice(11, 14));
    }
    if (air) air(false);
    return w;
  };

  /* F1 */
  const answer = (mode, ax, s, t0) => {
    const st = [0, 0, 0];
    st[ax] = s;
    const moved = fly(mode, t0, st, STICK_MS), still = fly(mode, t0, [0, 0, 0], STICK_MS);
    return moved.map((w, i) => w[ax] - still[i][ax]);
  };
  const apart = (x, y) => Math.max(...x.map((v, i) => Math.abs(v - y[i])));
  for (let ax = 0; ax < 3; ax += 1) {
    if (!(rx.k[ax] > 0)) continue;
    for (const s of [0.5, 1]) {
      const m = [T0 - 100, T0, T0 + 100].map((t0) => answer(0, ax, s, t0));
      const tol = Math.max(apart(m[0], m[1]), apart(m[1], m[2]), apart(m[0], m[2]));
      const g = apart(answer(3, ax, s, T0), m[1]);
      const peak = Math.max(...m[1].map(Math.abs));
      check(`F1 ${AX[ax]} stick ${s}: AS3X's rate answers as Manual's, within Manual's own spread`, g <= tol,
        `${(g * D).toFixed(2)} deg/s apart, spread ${(tol * D).toFixed(2)}, peak ${(peak * D).toFixed(0)} deg/s`);
    }
  }

  /* F2 */
  const gusts = [
    ['a 2 m/s side gust', (on) => must(sim.e.sim_set_wind(0, on ? 2 : 0, 0), 'sim_set_wind')],
    ['a 2 m/s rising gust', (on) => must(sim.e.sim_set_air_vertical(on ? 2 : 0), 'sim_set_air_vertical')],
  ];
  for (const [what, air] of gusts) {
    const iae = (mode) => {
      const hit = fly(mode, T0, [0, 0, 0], GUST_MS, air), calm = fly(mode, T0, [0, 0, 0], GUST_MS);
      return hit.reduce((x, w, i) => x + [0, 1, 2].reduce((y, k) => y + Math.abs(w[k] - calm[i][k]), 0) * 0.001, 0);
    };
    const m = iae(0), g = iae(3);
    check(`F2 ${what}: the rates' departure over 2 s is less under AS3X`, g < m,
      `${(g * D).toFixed(1)} against Manual's ${(m * D).toFixed(1)} deg, ${(g / m).toFixed(2)}`);
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
