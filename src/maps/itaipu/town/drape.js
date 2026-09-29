/*
 * drape.js: flat things laid on the hero's ground exactly, a road or a
 * yard's gravel, by cutting them along the ground's own triangles.
 *
 * The hero's ground is a 10 m grid of heights drawn as two triangles a
 * cell, split on the diagonal from (x0, z0 + 10) to (x0 + 10, z0)
 * (src/maps/yellowstone/terrain/engine.js tri, which ctx.ground reads).
 * So the ground is a plane over every triangle bounded by the lines
 * x = 10 i, z = 10 j and x + z = 10 k (the grid's origin, -20 480 m, is a
 * whole number of cells). A convex piece cut along those lines lies in
 * one triangle, and a piece whose corners are each at the ground's height
 * there IS the ground there, not a chord of it: a ribbon made of such
 * pieces follows every fold the terrain draws, which a ribbon sampled
 * every few metres does not (it bridges a hollow and buries itself in a
 * crest by up to the terrain's curvature over the sample step).
 *
 * Pure: no THREE, so the checks run it in Node.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/* The hero's ground cell, metres (docs/ITAIPU-PLAN.md section 4). */
export const GROUND_CELL = 10;

/* Pieces thinner than this are dropped: they draw nothing a camera can
 * resolve and only cost triangles. Square metres. */
const SLIVER = 1e-4;

/*
 * The part of convex polygon `poly` ([[x, z]...]) on the side of the line
 * a x + b z = c where a x + b z >= c (sign 1) or <= c (sign -1).
 */
function halfPlane(poly, a, b, c, sign) {
  const out = [];
  const n = poly.length;
  for (let i = 0; i < n; i += 1) {
    const p = poly[i];
    const q = poly[i + 1 === n ? 0 : i + 1];
    const dp = (a * p[0] + b * p[1] - c) * sign;
    const dq = (a * q[0] + b * q[1] - c) * sign;
    if (dp >= 0) {
      out.push(p);
    }
    /* Strictly across: a corner on the line is kept once, above. */
    if ((dp > 0 && dq < 0) || (dp < 0 && dq > 0)) {
      const t = dp / (dp - dq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

function area(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    s += p[0] * q[1] - q[0] * p[1];
  }
  return s / 2;
}

/*
 * Cut convex polygon `poly` along the ground's triangles and call
 * emit(piece) with each convex piece, [[x, z]...], at least a triangle.
 * Strips across x first, then cells along z, then the one diagonal a
 * cell has.
 */
export function cutToGround(poly, emit, cell = GROUND_CELL) {
  let x0 = Infinity;
  let x1 = -Infinity;
  for (const p of poly) {
    x0 = Math.min(x0, p[0]);
    x1 = Math.max(x1, p[0]);
  }
  for (let i = Math.floor(x0 / cell); i * cell < x1; i += 1) {
    let strip = halfPlane(poly, 1, 0, i * cell, 1);
    strip = strip.length >= 3 ? halfPlane(strip, 1, 0, (i + 1) * cell, -1) : strip;
    if (strip.length < 3) {
      continue;
    }
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const p of strip) {
      z0 = Math.min(z0, p[1]);
      z1 = Math.max(z1, p[1]);
    }
    for (let j = Math.floor(z0 / cell); j * cell < z1; j += 1) {
      let sq = halfPlane(strip, 0, 1, j * cell, 1);
      sq = sq.length >= 3 ? halfPlane(sq, 0, 1, (j + 1) * cell, -1) : sq;
      if (sq.length < 3) {
        continue;
      }
      /* The cell's diagonal: x + z = x0 + z0 + cell. */
      const d = (i + j + 1) * cell;
      for (const sign of [-1, 1]) {
        const piece = halfPlane(sq, 1, 1, d, sign);
        if (piece.length >= 3 && Math.abs(area(piece)) > SLIVER) {
          emit(piece);
        }
      }
    }
  }
}

/*
 * A ribbon `width` wide along the polyline `points` ([[x, z]...]) as
 * convex polygons: a rectangle per segment and, at each bend, the wedge
 * that closes the outside of the turn (a bevel), so the ribbon has no
 * notch where a street turns. The inside of the turn overlaps, which on
 * one surface drawn in one material is invisible.
 */
export function ribbon(points, width) {
  const h = width / 2;
  const out = [];
  const norms = [];
  for (let k = 0; k + 1 < points.length; k += 1) {
    const [ax, az] = points[k];
    const [bx, bz] = points[k + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (!(len > 1e-6)) {
      norms.push(null);
      continue;
    }
    const nx = -(bz - az) / len;
    const nz = (bx - ax) / len;
    norms.push([nx, nz]);
    out.push([
      [ax + nx * h, az + nz * h], [ax - nx * h, az - nz * h],
      [bx - nx * h, bz - nz * h], [bx + nx * h, bz + nz * h],
    ]);
  }
  for (let k = 1; k + 1 < points.length; k += 1) {
    const u = norms[k - 1];
    const v = norms[k];
    if (!u || !v) {
      continue;
    }
    const cross = u[0] * v[1] - u[1] * v[0];
    if (Math.abs(cross) < 1e-9) {
      continue;
    }
    /* The outside of the turn is where the two rectangles' edges part. */
    const s = cross > 0 ? -1 : 1;
    const [px, pz] = points[k];
    out.push([[px, pz], [px + u[0] * h * s, pz + u[1] * h * s], [px + v[0] * h * s, pz + v[1] * h * s]]);
  }
  return out;
}
