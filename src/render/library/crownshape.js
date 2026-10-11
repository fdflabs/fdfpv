/*
 * crownshape.js: the shape of a lobed tree crown, one model for what is
 * drawn and what hides (docs/ASSET-LIBRARY.md, Lit tree crowns).
 *
 * A real broadleaf crown is not an ellipsoid: it is a few heaps of
 * foliage round a denser middle, with sky between the heaps at its edge.
 * Here a crown is LOBES spheres in its unit ellipsoid (x and z over r, y
 * over ry from its middle): a core, a top and side heaps round it, every
 * one inside the unit sphere, so a crown never reaches past the ellipsoid
 * a map sizes it by. A world point is in the crown when it is in one of
 * its lobes, and a line is hidden by it when it passes through one.
 *
 * TEMPLATES layouts are made once, by integer hashes and a table of
 * sixteen headings written out (no Math.sin or Math.cos), so Node, the
 * room and every browser make the same numbers; a tree picks its layout
 * by its own number. The drawing reads the same numbers as a uniform
 * array (crowns.js), and canopy.js tests lines against them.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.

/* An integer hash of a square and a salt, as a number in [0, 1). */

import { hash01 } from './hash.js';

export const LOBES = 7;
export const TEMPLATES = 12;

const C8 = [1, 0.9238795325112867, 0.7071067811865476, 0.38268343236508984];
const HEAD_COS = new Float64Array(16);
const HEAD_SIN = new Float64Array(16);
for (let k = 0; k < 16; k += 1) {
  const q = k & 3;
  const c = C8[q];
  const s = q === 0 ? 0 : C8[4 - q];
  const cs = [[c, s], [-s, c], [-c, -s], [s, -c]][k >> 2];
  HEAD_COS[k] = cs[0];
  HEAD_SIN[k] = cs[1];
}

/*
 * The layouts, TEMPLATES * LOBES lobes of [x, y, z, radius] in a crown's
 * unit space. The core fills the middle low down, the top heap stands
 * over it, and five side heaps go round at headings about a fifth of a
 * turn apart, each a little higher or lower and nearer or farther out:
 * between neighbours their outer halves leave the notches and the holes
 * a crown's edge has. Every lobe's far side is inside the unit sphere.
 */
export const LOBE_DATA = new Float64Array(TEMPLATES * LOBES * 4);
for (let t = 0; t < TEMPLATES; t += 1) {
  const put = (k, x, y, z, r) => {
    const n = Math.sqrt(x * x + y * y + z * z);
    const rr = n + r > 0.995 ? 0.995 - n : r;
    LOBE_DATA.set([x, y, z, rr], (t * LOBES + k) * 4);
  };
  put(0, 0, -0.16, 0, 0.76 + 0.05 * hash01(t, 0, 81));
  const th = Math.floor(hash01(t, 1, 82) * 16);
  put(1, 0.12 * HEAD_COS[th], 0.48 + 0.04 * hash01(t, 1, 83), 0.12 * HEAD_SIN[th], 0.42 + 0.06 * hash01(t, 1, 84));
  const start = Math.floor(hash01(t, 2, 85) * 16);
  for (let k = 2; k < LOBES; k += 1) {
    const step = (k - 2) * 3 + ((k - 2) * 7 + t) % 2;
    const h = (start + step + Math.floor(hash01(t, k, 86) * 2)) % 16;
    const d = 0.46 + 0.1 * hash01(t, k, 87);
    const y = -0.4 + 0.55 * hash01(t, k, 88);
    put(k, d * HEAD_COS[h], y, d * HEAD_SIN[h], 0.4 + 0.1 * hash01(t, k, 89));
  }
}

/* A tree's layout from its own number in [0, 1). */
export const templateOf = (u) => Math.min(TEMPLATES - 1, Math.floor(u * TEMPLATES));

/*
 * Whether the segment from p to p + d (t in [0, 1]) meets crown `tree`
 * ({ x, cy, z, r, ry, lobe }), lobe its template. The segment is put in
 * the crown's unit space, where every lobe is a sphere.
 */
export function lobesHit(tree, px, py, pz, dx, dy, dz) {
  const ox = (px - tree.x) / tree.r;
  const oy = (py - tree.cy) / tree.ry;
  const oz = (pz - tree.z) / tree.r;
  const ex = dx / tree.r;
  const ey = dy / tree.ry;
  const ez = dz / tree.r;
  const a = ex * ex + ey * ey + ez * ez;
  const base = tree.lobe * LOBES * 4;
  for (let k = 0; k < LOBES; k += 1) {
    const i = base + k * 4;
    const qx = ox - LOBE_DATA[i];
    const qy = oy - LOBE_DATA[i + 1];
    const qz = oz - LOBE_DATA[i + 2];
    const rr = LOBE_DATA[i + 3];
    const c = qx * qx + qy * qy + qz * qz - rr * rr;
    if (c <= 0) {
      return true;
    }
    if (a === 0) {
      continue;
    }
    const b = 2 * (qx * ex + qy * ey + qz * ez);
    const disc = b * b - 4 * a * c;
    if (disc < 0) {
      continue;
    }
    const s = Math.sqrt(disc);
    if ((-b + s) / (2 * a) >= 0 && (-b - s) / (2 * a) <= 1) {
      return true;
    }
  }
  return false;
}

/* The highest point of crown `tree` over (x, z), world y, or -Infinity. */
export function lobesTop(tree, x, z) {
  const ux = (x - tree.x) / tree.r;
  const uz = (z - tree.z) / tree.r;
  let top = -Infinity;
  const base = tree.lobe * LOBES * 4;
  for (let k = 0; k < LOBES; k += 1) {
    const i = base + k * 4;
    const ax = ux - LOBE_DATA[i];
    const az = uz - LOBE_DATA[i + 2];
    const q = LOBE_DATA[i + 3] * LOBE_DATA[i + 3] - ax * ax - az * az;
    if (q > 0) {
      const y = LOBE_DATA[i + 1] + Math.sqrt(q);
      top = y > top ? y : top;
    }
  }
  return top === -Infinity ? top : tree.cy + tree.ry * top;
}
