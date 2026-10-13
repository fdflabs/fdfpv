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
 * default Heading, zero, at every rate the tune screen offers (the rest
 * of the stock setup kept). The receiver reads the sticks through the
 * rates (plant_wing.c as3x_channel), so a lower rate leaves the gyro more
 * of a stick. F1 is judged at the stock rate and the table's own, the
 * high, the two as3x-derive.js holds it at; at the others it is printed,
 * not judged. F2 is flown at the stock rate:
 *   F1  the stick: each axis' stick stepped to half and to full, the
 *       body rate's answer on that axis (the stepped flight's rate less
 *       the same flight's unstepped, over 0.8 s) under AS3X matches
 *       Manual's within what a pilot can see: the just noticeable
 *       difference in visual velocity, a Weber fraction "about 7% at the
 *       optimal speeds" of 4 to 64 deg/s, rising either side of them
 *       (De Bruyn and Orban, "Human velocity and direction discrimination
 *       measured with random dot patterns", Vision Research 28(12), 1988,
 *       1323-1335; 84 percent correct), taken as 7 percent of Manual's
 *       peak rate, the strictest the source allows. The other axes'
 *       gyros stay on under a stepped stick (priority is per axis, the
 *       AS3000 manual), and what they do to the coupling is the
 *       aircraft's, inside that fraction (lead decision 2026-10-12).
 *   F2  the air: a gust, a 2 m/s step of side wind (the weather's gusty
 *       RMS, src/game/weather.js) and, separately, a 2 m/s step of rising
 *       air, each from 1 s on: the three rates' departure from the calm
 *       flight, integrated over 2 s, is less under AS3X than Manual.
 *
 *   F0  the receiver as3x-derive.js flies F1 on to set every table's
 *       gains matches the plant's mode 3, at every rate.
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
import { AS3X, RATES, planeSim, rowOf, receiverOf, numOf, pilotFlight, stockRate, tuneOf } from './lib/as3xloop.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = await readFile(join(root, 'src/native/plant_wing.c'), 'utf8');
const argv = process.argv.slice(2);
const only = argv.includes('--plane') ? argv[argv.indexOf('--plane') + 1] : null;
const D = 180 / Math.PI;
const AX = ['roll', 'pitch', 'yaw'];
const T0 = 1000;
const STICK_MS = 800;
const GUST_MS = 2000;
/* De Bruyn and Orban 1988's velocity JND, above. */
const WEBER = 0.07;

let failed = 0, passed = 0, seen = 0;
const check = (name, ok, detail) => {
  if (ok) passed += 1; else failed += 1;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}  (${detail})`);
};
/* Printed, not judged: F1 at a rate the derivation does not fly. */
const see = (name, ok, detail) => {
  seen += 1;
  console.log(`  ${ok ? 'seen' : 'OVER'}  ${name}  (${detail}, not judged)`);
};

for (const [name, a] of Object.entries(AS3X)) {
  if (only && name !== only) continue;
  const body = rowOf(src, name);
  const stock = stockRate(name);
  for (const rate of [stock, ...RATES.filter((r) => r !== stock)]) {
    const block = tuneOf(name, rate);
    const judged = rate === stock || rate === 'high';
    const rx = receiverOf(body, block);
    const V = Object.values(TABLE).find((t) => t.simId === a.sim).cruiseMs;
    const thr = numOf(body, 'stab_trim_throttle');
    const sim = await planeSim(a.sim, SEAT_GATES, block);
    must(sim.setHeading([0, 0, 0]), 'sim_wing_set_heading');
    console.log(`\n${name} at ${V} m/s, throttle ${thr}, ${rate} rate${rate === stock ? ' (stock)' : ''}, throws ${rx.th.map((x) => (x * D).toFixed(1)).join(', ')} deg, expo ${rx.expo.join(', ')}`);

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

    /* F0: as3x-derive.js sets every table's gains by F1 flown on
     * lib/as3xloop.js's receiver (pilotFlight); here
     * that receiver against the plant's own mode 3, a stick held and let
     * go on each axis, every step's rates. */
    {
      let worst = 0;
      for (let ax = 0; ax < 3; ax += 1) {
        const sticks = (i) => { const st = [0, 0, 0]; if (i >= T0 && i < T0 + 600) st[ax] = 0.3; return st; };
        const p = pilotFlight(sim, V, thr, rx, null, sticks, T0 + 1500), e = pilotFlight(sim, V, thr, rx, [1, 1, 1], sticks, T0 + 1500);
        p.forEach((w, i) => w.forEach((x, k) => { worst = Math.max(worst, Math.abs(x - e[i][k])); }));
      }
      check('F0 the derivation\'s receiver flies as the plant\'s mode 3', worst < 1e-9, `worst rate difference ${worst.toExponential(1)} rad/s`);
    }

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
        const m = answer(0, ax, s, T0);
        const g = apart(answer(3, ax, s, T0), m);
        const peak = Math.max(...m.map(Math.abs));
        (judged ? check : see)(`F1 ${AX[ax]} stick ${s}: AS3X's rate answers as Manual's, within the eye's ${Math.round(WEBER * 100)} percent`, g <= WEBER * peak,
          `${(g * D).toFixed(2)} deg/s apart, ${(100 * g / peak).toFixed(1)} percent of the ${(peak * D).toFixed(0)} deg/s peak`);
      }
    }
    if (rate !== stock) continue;

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
}
console.log(`\n${passed} passed, ${failed} failed, ${seen} seen and not judged`);
process.exit(failed ? 1 : 0);
