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
 * circular cylinder's. The drawn 3D fuselages are rounded boxes,
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
 */
const FINENESS = [0.5, 1.0, 2.0];
const OVER_CIRCLE = [1.6, 1.0, 0.6];
const E_MAX = 4.0;

/* The drag of a section of fineness f (its width along the crossflow over
 * its depth across it) over the circle's. */
export function sectionRatio(f) {
  if (!(f > 0 && f <= FINENESS[FINENESS.length - 1])) {
    throw new Error(`crossflow: fineness ${f} is outside TN 3038's, up to 2:1`);
  }
  if (f <= FINENESS[0]) return OVER_CIRCLE[0];
  let i = 0;
  while (f > FINENESS[i + 1]) i += 1;
  const u = (f - FINENESS[i]) / (FINENESS[i + 1] - FINENESS[i]);
  return OVER_CIRCLE[i] + (OVER_CIRCLE[i + 1] - OVER_CIRCLE[i]) * u;
}

/*
 * The fuselage's section ratio averaged over its side view, each station
 * weighted by its depth, as the crossflow force is. fuse: the drawn
 * model's rows, [station, half width, top, bottom, e] in metres, blended
 * between rows by smoothstep as the render's fuseAt does.
 */
export function fuselageRatio(fuse, n = 4000) {
  let num = 0;
  let den = 0;
  const s0 = fuse[0][0];
  const s1 = fuse[fuse.length - 1][0];
  for (let k = 0; k < n; k += 1) {
    const s = s0 + (s1 - s0) * (k + 0.5) / n;
    let i = 0;
    while (s > fuse[i + 1][0]) i += 1;
    const a = fuse[i];
    const b = fuse[i + 1];
    const u = (s - a[0]) / (b[0] - a[0]);
    const t = u * u * (3 - 2 * u);
    const at = (j) => a[j] + (b[j] - a[j]) * t;
    if (at(4) > E_MAX) throw new Error(`crossflow: station ${s.toFixed(3)} is squarer than e ${E_MAX}`);
    const depth = at(2) - at(3);
    num += depth * sectionRatio((2 * at(1)) / depth);
    den += depth;
  }
  return num / den;
}
