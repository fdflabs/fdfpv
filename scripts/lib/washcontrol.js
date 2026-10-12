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
 * A control surface in the wash, its host surface at a large angle,
 * keeps a share of its effect that depends on which way it is deflected
 * (~/Desktop/fdfpv-loop/research/wash-control/WASH-CONTROL.md):
 *
 * with the incidence, toward the windward side (a down flap on a wing at
 * a positive angle): NACA TN 3307 (Kuhn and Draper 1954, a 30 percent
 * plain flap on a NACA 0015 wing in the slipstream of two large props,
 * figs. 13c and 16c, Tc'' 0.71) keeps of its pitching moment 1 to 20 deg
 * of the airframe's angle, 0.47 at 40, 0.30 at 50, 0.13 at 60, 0.10 at
 * 70, 0.07 at 80, 0.05 at 90; Ma, Smeur and de Croon's flapped MH32 at
 * 70 percent throttle (4TU.ResearchData doi:10.4121/16620226, the up and
 * down flaps' increments at plus and minus each angle averaged, so the
 * camber's own asymmetry cancels, and over 5.5, 8 and 11 m/s) keeps 0.49,
 * 0.32, 0.14 and 0.03 at 40 to 70, the same curve;
 *
 * against it, toward the leeward side (an up elevator on a tail at a
 * positive angle, the harrier's): Ma 2022 the same way, all of it to 10
 * deg (0.99, inside the speeds' spread), 0.95 at 20, 0.93
 * at 30, 0.89 at 40, 0.74 at 50, 0.55 at 60, 0.37 at 70, 0.25 at 80, 0.16
 * at 90 (the three speeds within 0.02 of each other at 40 deg, 0.12 at
 * 50 and up to 0.18 past).
 *
 * The data's surfaces are 25 to 30 percent of the chord at up to 38.7 deg
 * of deflection (Ma's half deflections within 0.05 of the full); the 3D
 * aircraft's 40 to 50 percent elevators at 45 deg take the same curves,
 * ESTIMATED: no measurement of a larger surface deflected against the
 * incidence was found (TN 3307's 60 percent flap is with it). With no
 * freestream (Tc'' 1, the hover) nothing turns the wash off the surface:
 * the loss fades out from 0.91, TN 3307's highest Tc'', to 1. alpha: the
 * body's angle, rad; dp: the disc's T / A, Pa; V: the airspeed, m/s; rho,
 * kg/m^3; side: 'with', 'against', or 'both' (a pair of ailerons, one
 * each way: the mean).
 */
const KW_DEG = [10, 20, 30, 40, 50, 60, 70, 80, 90];
const KW_WITH = [1.0, 1.0, 0.735, 0.47, 0.30, 0.13, 0.10, 0.07, 0.05];
const KW_AGAINST = [1.0, 0.95, 0.93, 0.89, 0.74, 0.55, 0.37, 0.25, 0.16];

function curve(k, a) {
  if (a <= KW_DEG[0]) return k[0];
  for (let i = 0; i < KW_DEG.length - 1; i += 1) {
    if (a <= KW_DEG[i + 1]) return k[i] + (k[i + 1] - k[i]) * (a - KW_DEG[i]) / (KW_DEG[i + 1] - KW_DEG[i]);
  }
  return k[k.length - 1];
}

export function washKw(alpha, dp, V, rho, side) {
  if (!['with', 'against', 'both'].includes(side)) throw new Error(`washKw: side ${side}`);
  const a = Math.abs(alpha) * 180 / Math.PI;
  const kw = side === 'with' ? curve(KW_WITH, a) : side === 'against' ? curve(KW_AGAINST, a) : 0.5 * (curve(KW_WITH, a) + curve(KW_AGAINST, a));
  const tcl = dp > 0 ? dp / (dp + 0.5 * rho * V * V) : 0;
  const fade = tcl <= 0.91 ? 1 : tcl >= 1 ? 0 : (1 - tcl) / 0.09;
  return 1 - fade * (1 - kw);
}
