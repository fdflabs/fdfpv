/*
 * jelly.js: what a plane meets when it flies into a pylon or a sky hoop's
 * rim.
 *
 * The owner's rule for plane racing: "make the pylons like jelly, to where
 * they never hurt the plane, they just whack it." And of the hoops and the
 * pylons both: "if you run into the actual pylon, it will move, but it
 * won't break the plane, and you'll be able to fly through with no more
 * than a slight scare." Plane racing here is casual, for a small child as
 * much as for a pilot, and a course that ends a run on a clipped cone is
 * not that.
 *
 * SO FOR A FIXED WING THESE PIECES ARE NOT SOLIDS AT ALL. The shell's sweep
 * and the crash physics' declared solids both pass through the JELLY_KINDS
 * (collide.js softKinds, crashworld.js nearestSolids), so nothing about a
 * pylon or a rim can reach the plant's contact, its parts or its damage.
 * What the plane gets instead is a whack, worked out here and written
 * straight onto the plant's velocity by the shell (main.js jellyPass):
 *
 *   it loses speed along the jelly's normal, the part of its travel that
 *   went into the soft body: SOAK of it is soaked up and the jelly pushes
 *   back PUSH of it, so a head on hit at any speed leaves the plane
 *   flying on at 1 - SOAK - PUSH of what it had, 70 percent, and a glancing
 *   one hardly slows it at all;
 *
 *   it is knocked about: a roll kick, and a pitch kick where the hit was
 *   above or below it, up to KICK radians a second in proportion to how
 *   square the hit was, and a roll of at least half of that however
 *   square. A head on hit rolls it at 1.5 rad/s, 86 degrees a second: a
 *   jolt a pilot sees and rides through, and one a beginner's stabilised
 *   plane levels out of by itself.
 *
 * The plane flies on through where the jelly stood, as a plane through an
 * inflatable does, and the piece wobbles and springs back (the builder
 * draws that, src/builder/buildmode.js). A quad is not a plane: for a quad
 * these kinds stay what they were, the pylon an inflated cantilever in the
 * plant (crashworld.js pylonGive) and a quad hoop's rim a firm tube.
 *
 * Pure arithmetic on plain { x, y, z } in the scene frame; no Three.js.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { KINDS } from './collide.js';

export const JELLY_KINDS = ['pylon', 'hoop'];
export const JELLY_MASK = JELLY_KINDS.reduce((m, k) => m | (1 << KINDS.indexOf(k)), 0);

/* The share of the speed into the jelly it soaks up, the share it pushes
 * back with, and the largest kick, rad/s. See the header. */
export const SOAK = 0.2;
export const PUSH = 0.1;
export const KICK = 3.0;
/* A whack always rolls the plane by at least this share of the kick, so
 * a hit dead on the nose, which has no side to it, still knocks it. */
const ROLL_FLOOR = 0.5;
/* How much of the span reaches a solid: the wing is a thin plate, and a
 * wingtip passing a cone is not a hit until it is most of the way in. */
export const REACH_OF_SPAN = 0.4;

/* The closest points of segment p1 q1 and segment p2 q2: their parameters
 * (Ericson, Real-Time Collision Detection, 5.1.9). */
function closest(p1x, p1y, p1z, q1x, q1y, q1z, p2x, p2y, p2z, q2x, q2y, q2z, out) {
  const d1x = q1x - p1x;
  const d1y = q1y - p1y;
  const d1z = q1z - p1z;
  const d2x = q2x - p2x;
  const d2y = q2y - p2y;
  const d2z = q2z - p2z;
  const rx = p1x - p2x;
  const ry = p1y - p2y;
  const rz = p1z - p2z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  let s = 0;
  let t = 0;
  if (a <= 1e-12 && e <= 1e-12) {
    s = 0;
    t = 0;
  } else if (a <= 1e-12) {
    t = clamp(f / e);
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-12) {
      s = clamp(-c / a);
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const den = a * e - b * b;
      s = den > 1e-12 ? clamp((b * f - c * e) / den) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a);
      }
    }
  }
  out.s = s;
  out.t = t;
}

const par = { s: 0, t: 0 };

/*
 * The soft collider nearest the craft's travel from a to b among the ones
 * setBuilt added (the builder's pieces; no map carries one), if its surface
 * comes within `reach` of that travel. Writes out.i, out.gap (metres from
 * the surface, negative inside it) and out.n, the unit normal from the
 * collider's axis to the craft; returns out.i, or -1.
 */
export function jellyNear(col, a, b, reach, out) {
  out.i = -1;
  out.gap = Infinity;
  if (!col || !col.built) {
    return -1;
  }
  for (let i = col.baseCount; i < col.count; i += 1) {
    if (!(JELLY_MASK & (1 << col.fkind[i])) || col.fbox[i]) {
      continue;
    }
    closest(a.x, a.y, a.z, b.x, b.y, b.z, col.fax[i], col.fay[i], col.faz[i], col.fbx[i], col.fby[i], col.fbz[i], par);
    const px = a.x + (b.x - a.x) * par.s;
    const py = a.y + (b.y - a.y) * par.s;
    const pz = a.z + (b.z - a.z) * par.s;
    const cx = col.fax[i] + (col.fbx[i] - col.fax[i]) * par.t;
    const cy = col.fay[i] + (col.fby[i] - col.fay[i]) * par.t;
    const cz = col.faz[i] + (col.fbz[i] - col.faz[i]) * par.t;
    const dx = px - cx;
    const dy = py - cy;
    const dz = pz - cz;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const gap = d - col.fr[i];
    if (gap < reach && gap < out.gap) {
      out.i = i;
      out.gap = gap;
      if (d > 1e-6) {
        out.n = { x: dx / d, y: dy / d, z: dz / d };
      } else {
        /* Dead on the axis: back along the travel. */
        const tx = b.x - a.x;
        const ty = b.y - a.y;
        const tz = b.z - a.z;
        const tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
        out.n = { x: -tx / tl, y: -ty / tl, z: -tz / tl };
      }
    }
  }
  return out.i;
}

/*
 * The whack, for velocity v (m/s, scene frame) meeting jelly whose normal
 * n points from the jelly to the craft, with the craft's own right and up
 * axes in the scene. Returns null when the craft is not moving into it,
 * and otherwise { v, roll, pitch, loss, square }: the velocity to fly on
 * at, the kicks to add to the body rates (rad/s, roll about the nose,
 * pitch about the right wing), the fraction of speed it lost and how
 * square the hit was, 0 to 1.
 */
export function whack(v, n, right, up) {
  const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  const into = -(v.x * n.x + v.y * n.y + v.z * n.z);
  if (!(speed > 1e-6) || !(into > 0)) {
    return null;
  }
  const square = into / speed;
  const back = into * (SOAK + PUSH);
  const out = { x: v.x + n.x * back, y: v.y + n.y * back, z: v.z + n.z * back };
  const after = Math.sqrt(out.x * out.x + out.y * out.y + out.z * out.z);
  const side = n.x * right.x + n.y * right.y + n.z * right.z;
  const vert = n.x * up.x + n.y * up.y + n.z * up.z;
  const k = KICK * square;
  return {
    v: out,
    roll: k * (ROLL_FLOOR + (1 - ROLL_FLOOR) * Math.abs(side)) * (side < 0 ? -1 : 1),
    pitch: k * 0.5 * vert,
    loss: 1 - after / speed,
    square,
  };
}
