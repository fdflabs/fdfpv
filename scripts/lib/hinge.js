/*
 * hinge.js: a plain flap's hinge moment, and how much of it a servo
 * holds, for the plant's servo blow-back (plant_wing.c, FixedWingParams
 * hinge_hold): past the dynamic pressure where the air's moment on the
 * hinge exceeds what the servo's stall torque gives through the linkage,
 * the surface is pushed back short of its throw.
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
 * The slope. Ames and Sears, NACA Report 721 (1941), the NACA 0009 plain
 * flap's section data at an effective Reynolds number of 3.4 million,
 * sealed gap, read off its figures (page, curve, plus or minus the
 * read): fig. 1(b) p. 4, the experimental (d alpha / d delta) at constant
 * normal force, TAU_E here its magnitude, +-0.015 (the theoretical curve
 * on the same figure reads Glauert's tau, scripts/surfaces-derive.js
 * tauOf (in git at d281b9911; it left with the surface tiers), within
 * 0.016 at every cf, which is the check on the read); fig.
 * 2(a) p. 5, the experimental (d ch / d delta) at constant normal force,
 * per deg, +-0.0003; fig. 2(b) p. 5, the experimental (d ch / d cn) at
 * constant delta, +-0.005. The report's eq. (3) and its p. 7 give the
 * slope at a constant angle of attack, which is what a servo holding the
 * surface on a flying airframe meets:
 *   (dCh/d delta)_alpha = (dch/d delta)_cn + (dch/dcn)_delta (dCN/d alpha) TAU_E
 * with only (dCN/d alpha) corrected for the surface's aspect ratio, eq.
 * (11): p dcn/da / (1 + 57.3 r dcn/da / (pi A)), dcn/da 0.095 per deg
 * (the report's, p. 6), r 1 (a single fin, fig. 4(b)) and p off fig. 4(a)
 * (+-0.01), held at its ends outside the A 3 to 6 it gives (ESTIMATED: a
 * fin's effective aspect ratio is under 3). The flap chord is the root
 * mean square one, as the report defines its coefficients:
 * Ch = H / (q b_f c_f^2).
 */
const CF = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
const TAU_E = [0.299, 0.452, 0.575, 0.679, 0.770, 0.847, 0.913, 0.960];
const CH_D_CN = [-0.0089, -0.00925, -0.00875, -0.0077, -0.00632, -0.00461, -0.00283, -0.00139];
const CH_CN = [-0.031, -0.057, -0.083, -0.109, -0.135, -0.157, -0.176, -0.196];
const CN_A = 0.095;
const P_A = [3, 4, 5, 6];
const P_P = [0.79, 0.92, 0.96, 0.98];

/* Linear in x through (xs, ys), held at the ends. */
function lerp(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  let i = 0;
  while (x > xs[i + 1]) i += 1;
  return ys[i] + (ys[i + 1] - ys[i]) * (x - xs[i]) / (xs[i + 1] - xs[i]);
}

function check(cf, A) {
  if (!(cf >= CF[0] && cf <= CF[CF.length - 1])) {
    throw new Error(`hinge: chord fraction ${cf} is outside NACA Report 721's figures, ${CF[0]} to ${CF[CF.length - 1]}`);
  }
  if (!(A > 0)) throw new Error(`hinge: aspect ratio ${A}`);
}

/* (dCN/d alpha) per deg, eq. (11). */
const cnAlpha = (A) => lerp(P_A, P_P, A) * CN_A / (1 + 57.3 * CN_A / (Math.PI * A));

/* The hinge moment slope at a constant angle of attack, per rad, of a
 * plain flap of chord fraction cf on a surface of aspect ratio A. */
export function hingeSlope(cf, A) {
  check(cf, A);
  const perDeg = lerp(CF, CH_D_CN, cf) + lerp(CF, CH_CN, cf) * cnAlpha(A) * lerp(CF, TAU_E, cf);
  return perDeg * 180 / Math.PI;
}

/* The slope against the surface's own angle of attack at a constant
 * deflection, (dch/dcn) (dCN/d alpha), over hingeSlope: what an angle of
 * attack loads the hinge with, as a share of what the same deflection
 * does. Both are negative, so the share is positive, under one. */
export function hingeAlpha(cf, A) {
  check(cf, A);
  return lerp(CF, CH_CN, cf) * cnAlpha(A) * 180 / Math.PI / hingeSlope(cf, A);
}

/*
 * Past the small angles. Ames and Sears, NACA TN 759 (1940), fig. 13(d),
 * the same section's 0.30c plain flap at alpha 0.5 deg, tab neutral: the
 * flap's hinge moment coefficient increment at 0, 5, 10, 20, 30 and 45
 * deg of flap, -0, -0.060, -0.120, -0.265, -0.335 and -0.455 (+-0.01).
 * Its slope to 10 deg is 0.012 per deg (Report 721's 2D slope at cf 0.3
 * reads 0.0133, its data among the report's), so the moment over that
 * slope is the angle a linear flap would need for the same moment: the
 * HINGE_SHAPE plant_wing.c inverts. Past 45 deg the last segment's slope
 * is held (ESTIMATED: the report stops there). One 30 percent flap's
 * shape is taken for every chord (ESTIMATED: TN 759 measured the one).
 */
export const SHAPE_DEG = [0, 5, 10, 20, 30, 45];
export const SHAPE_CH = [0, 0.060, 0.120, 0.265, 0.335, 0.455];
const SHAPE_SLOPE = 0.012;
export const SHAPE_EQ_DEG = SHAPE_CH.map((c) => c / SHAPE_SLOPE);

/* The equivalent linear angle, deg, of a deflection of d deg. */
export function shapeDeg(d) {
  const n = SHAPE_DEG.length;
  if (d >= SHAPE_DEG[n - 1]) {
    const s = (SHAPE_EQ_DEG[n - 1] - SHAPE_EQ_DEG[n - 2]) / (SHAPE_DEG[n - 1] - SHAPE_DEG[n - 2]);
    return SHAPE_EQ_DEG[n - 1] + s * (d - SHAPE_DEG[n - 1]);
  }
  return lerp(SHAPE_DEG, SHAPE_EQ_DEG, d);
}

/* The deflection, deg, whose equivalent linear angle is e deg. */
export function shapeInv(e) {
  const n = SHAPE_DEG.length;
  if (e >= SHAPE_EQ_DEG[n - 1]) {
    const s = (SHAPE_EQ_DEG[n - 1] - SHAPE_EQ_DEG[n - 2]) / (SHAPE_DEG[n - 1] - SHAPE_DEG[n - 2]);
    return SHAPE_DEG[n - 1] + (e - SHAPE_EQ_DEG[n - 1]) / s;
  }
  return lerp(SHAPE_EQ_DEG, SHAPE_DEG, e);
}

/* kg-cm, the servo makers' unit, in N m. */
export const KGCM = 9.80665e-2;

/*
 * The linkage. A servo's arm and the surface's horn are set so that the
 * servo's travel gives the surface its full throw, the radio's endpoints
 * at 1000 and 2000 us, which turn a standard servo about +-45 deg
 * (ESTIMATED: no kit here publishes its arm and horn holes). By virtual
 * work the servo meets the hinge moment times the surface's angle over
 * its own: throw / 45 deg.
 */
export const SERVO_TRAVEL_DEG = 45;

/*
 * The hold, Pa rad: the dynamic pressure times the equivalent linear
 * angle the servos on one panel stand against, n T (45 / throw) /
 * (|dCh/d delta| b_f c_f^2). A panel blows back where q times the shape
 * of its angle passes it.
 */
export function hold({ cf, ar, span, chordRms, throwDeg, servosPerPanel, kgcm }) {
  const t = servosPerPanel * kgcm * KGCM * SERVO_TRAVEL_DEG / throwDeg;
  return t / (Math.abs(hingeSlope(cf, ar)) * span * chordRms * chordRms);
}

/* The airspeed, m/s at rho, where the full throw first blows back. */
export function blowBackSpeed(h, throwDeg, rho = 1.225) {
  const q = h / (shapeDeg(throwDeg) * Math.PI / 180);
  return Math.sqrt(2 * q / rho);
}
