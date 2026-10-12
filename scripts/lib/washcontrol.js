/*
 * washcontrol.js: what a control surface in a prop's wash keeps of its
 * wash share past the stall, as plant_wing.c takes it (kw), so a
 * derivation predicts on the tail the plant flies.
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

/*
 * NACA TN 3307 (Kuhn and Draper 1954), a 30 percent flap in the
 * slipstream of two large props, figs. 13c and 16c, at Tc'' 0.71: the flap
 * keeps of its pitching moment 1 to 20 deg of the airframe's angle, 0.47
 * at 40, 0.30 at 50, 0.13 at 60, 0.10 at 70, 0.07 at 80, 0.05 at 90,
 * FITTED as this curve; with no freestream (Tc'' 1, the hover) the loss
 * fades out from 0.91, the data's highest. alpha: the body's angle, rad;
 * dp: the disc's T / A, Pa; V: the airspeed, m/s; rho, kg/m^3. Applied to
 * the elevator's angle in the wash and to its wash share both.
 */
const KW_DEG = [20, 40, 50, 60, 70, 80, 90];
const KW = [1.0, 0.47, 0.30, 0.13, 0.10, 0.07, 0.05];

export function washKw(alpha, dp, V, rho) {
  const a = Math.abs(alpha) * 180 / Math.PI;
  let kw = 1;
  if (a > KW_DEG[0]) {
    kw = KW[6];
    for (let i = 0; i < 6; i += 1) {
      if (a <= KW_DEG[i + 1]) { kw = KW[i] + (KW[i + 1] - KW[i]) * (a - KW_DEG[i]) / (KW_DEG[i + 1] - KW_DEG[i]); break; }
    }
  }
  const tcl = dp > 0 ? dp / (dp + 0.5 * rho * V * V) : 0;
  const fade = tcl <= 0.91 ? 1 : tcl >= 1 ? 0 : (1 - tcl) / 0.09;
  return 1 - fade * (1 - kw);
}
