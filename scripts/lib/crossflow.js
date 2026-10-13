/*
 * crossflow.js: a fuselage's crossflow drag coefficient from its drawn
 * sections, for the 3D aircraft's side_cda (plant_wing.c, the fuselage in
 * a crossflow), so a knife edge's side force is the section the aircraft
 * has and not a round body's.
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
 * Allen and Perkins' crossflow coefficient, 1.2 (NACA TR 1048), is a
 * circular cylinder's. The drawn fuselages are rounded boxes, mostly
 * superellipses |y/w|^e + |z/h|^e = 1 with e 2 to 3.8, deeper than they
 * are wide. Delany and Sorensen, NACA TN 3038 (1953), Table I, at R = 1e5,
 * the drag on the frontal width: the circle 1.0; the ellipse of fineness
 * (streamwise over frontal) 1:2 1.6 and 2:1 0.6; the 1:1 rounded square
 * at corner radius ratio r/b 0.333 1.0, and the 1:2 rectangle at 0.250
 * 1.6. So at those corner radii a rounded rectangle has its ellipse's
 * drag. A superellipse's corner, matched at 45 deg to a rounded
 * rectangle's, 2^(-1/e) = 1 - 0.586 r/b, is r/b 0.27 at e 4 and 0.37 at
 * e 2.8; e 2 is the ellipse itself. Table I's circle read 1.0 where the
 * references read 1.2, which TN 3038 puts down to "the flow of air
 * through the gaps in the tunnel walls at the ends of the model", so a
 * section is taken as its ratio to the same tunnel's circle, times 1.2.
 * Between the three fineness ratios measured, linear: FITTED, the data
 * give no shape between them. Finer than 1:2 (the thin tail posts) is
 * taken at 1:2's 1.6, a lower bound: Table I's sharp edged 1:2 rectangle
 * is already 2.2.
 *
 * Squarer than e 4 (the Kadet's box at e 5) and the drawn rounded
 * rectangles (the Ugly Stik's, a quarter inch on every corner), Table I's
 * sharper rectangles, the corner radius over the section's shorter side,
 * rho (r/b of a square; twice Table I's r/b on the 1:2, whose b is the
 * long side): 1:2 rho 0.042 2.2, 0.167 1.9; 1:1 rho 0.021 2.0, 0.167 1.2;
 * 2:1 rho 0.042 1.4, 0.167 0.7. The 1:1's and 2:1's 0.167 are at R 2e5,
 * Table I's footnote, the rest at 1e5; a sharp cornered section separates
 * at its corners at either. The 2:1 rectangle at rho 0.5 (0.4) is a
 * stadium, not a superellipse, and is left out: e 2 there is the 2:1
 * ellipse's 0.6. Linear in rho between those and on to each fineness's
 * value at e 4's rho, where the sections above take it: FITTED, so a
 * section of e 4 or rounder is what it was before the sharper ones came
 * in (the 1:1's measured 1.0 is at rho 0.333, the join puts it at 0.27).
 * Sharper than the sharpest measured, that one's.
 */
const FINENESS = [0.5, 1.0, 2.0];
const OVER_CIRCLE = [1.6, 1.0, 0.6];
const SHARP = [
  [[0.042, 2.2], [0.167, 1.9]],
  [[0.021, 2.0], [0.167, 1.2]],
  [[0.042, 1.4], [0.167, 0.7]],
];

/* The corner radius over the side of the rounded square a superellipse
 * of squareness e matches at 45 deg: 2^(-1/e) = 1 - (2 - sqrt 2) rho. */
export function cornerOf(e) {
  if (!(e >= 2)) throw new Error(`crossflow: squareness ${e} is pinched, not a rounded box`);
  return (1 - 2 ** (-1 / e)) / (2 - Math.SQRT2);
}
const RHO_E4 = cornerOf(4.0);

/* One measured fineness's ratio at corner rho. */
function atFineness(k, rho) {
  if (rho >= RHO_E4) return OVER_CIRCLE[k];
  const pts = [...SHARP[k], [RHO_E4, OVER_CIRCLE[k]]];
  if (rho <= pts[0][0]) return pts[0][1];
  let i = 0;
  while (rho > pts[i + 1][0]) i += 1;
  const u = (rho - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
  return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u;
}

/* The drag of a section of fineness f (its width along the crossflow over
 * its depth across it) and corner rho over the circle's; rho left out is
 * a section of e 4 or rounder. */
export function sectionRatio(f, rho = RHO_E4) {
  if (!(f > 0 && f <= FINENESS[FINENESS.length - 1])) {
    throw new Error(`crossflow: fineness ${f} is outside TN 3038's, up to 2:1`);
  }
  if (!(rho >= 0)) throw new Error(`crossflow: corner ${rho} is not a section's`);
  if (f <= FINENESS[0]) return atFineness(0, rho);
  let i = 0;
  while (f > FINENESS[i + 1]) i += 1;
  const u = (f - FINENESS[i]) / (FINENESS[i + 1] - FINENESS[i]);
  return atFineness(i, rho) + (atFineness(i + 1, rho) - atFineness(i, rho)) * u;
}

/*
 * A fuselage's section ratio averaged over its side view from s0 to s1,
 * each station weighted by its depth, as the crossflow force is. at(s)
 * gives the station's depth, fineness and corner.
 */
export function profileRatio(at, s0, s1, n = 4000) {
  let num = 0;
  let den = 0;
  for (let k = 0; k < n; k += 1) {
    const { depth, f, rho } = at(s0 + (s1 - s0) * (k + 0.5) / n);
    num += depth * sectionRatio(f, rho);
    den += depth;
  }
  return num / den;
}

export const smoothstep = (i, u) => u * u * (3 - 2 * u);

/*
 * The same over a drawn model's superellipse rows, [station, half width,
 * top, bottom, e], blended between rows as its fuseAt does: blend(i, u)
 * on row i's segment, smoothstep unless the drawing says otherwise.
 */
export function fuselageRatio(fuse, n = 4000, blend = smoothstep) {
  const at = (s) => {
    let i = 0;
    while (s > fuse[i + 1][0]) i += 1;
    const a = fuse[i];
    const b = fuse[i + 1];
    const t = blend(i, (s - a[0]) / (b[0] - a[0]));
    const lerp = (j) => a[j] + (b[j] - a[j]) * t;
    const depth = lerp(2) - lerp(3);
    return { depth, f: (2 * lerp(1)) / depth, rho: cornerOf(lerp(4)) };
  };
  return profileRatio(at, fuse[0][0], fuse[fuse.length - 1][0], n);
}
