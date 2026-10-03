/*
 * leaf.js: a spillway gate's leaf turned on its trunnions to an opening
 * (src/share/war/hoist.js says which opening at which room ms). Pure, so
 * the room (edge/rooms/war.js: where the leaf's chunks are when a warhead
 * goes off, and where its holes are) and the map (the leaf drawn, its
 * colliders, its broken pieces) turn it the same way.
 *
 * A gate's hinge (its structure's frame.hinge, src/share/war/damage.js):
 *
 *   p      a point on the trunnions' axis, scene metres (y up)
 *   a      the axis, level, across the bay (unit)
 *   n      level, square to it, downstream (unit): the leaf's skin is
 *          upstream of the axis, at -n
 *   r      the skin's radius about the axis, m
 *   sill   the sill's height, m
 *   rest   the opening (the lip's height over the sill, m) the leaf's
 *          chunks are written at
 *   max    the most it opens, m
 *
 * The leaf at opening o is the leaf at rest turned about the axis so the
 * lip, a point of the skin's arc at the skin's foot, stands o over the
 * sill. A turn is { c, s }, the cosine and sine of that angle, found from
 * the lip's two positions with + - * / and Math.sqrt only: the same to
 * the bit on every engine, as the room's damage needs.
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

/* A hinge's two axes made unit, once a hinge: the written ones are to
 * the micrometre, and a turn about axes a hair off unit is a hair off a
 * rotation. */
const UNIT = new WeakMap();
function axes(h) {
  let u = UNIT.get(h);
  if (!u) {
    const la = Math.sqrt(h.a[0] * h.a[0] + h.a[2] * h.a[2]);
    const ln = Math.sqrt(h.n[0] * h.n[0] + h.n[2] * h.n[2]);
    u = { a: [h.a[0] / la, 0, h.a[2] / la], n: [h.n[0] / ln, 0, h.n[2] / ln] };
    UNIT.set(h, u);
  }
  return u;
}

/* No turn: the leaf as its chunks are written. */
export const REST = Object.freeze({ c: 1, s: 0 });

/* The lip's place about the axis at opening o: [across n, up]. */
function lip(h, o) {
  const open = o < 0 ? 0 : o > h.max ? h.max : o;
  let dy = h.sill + open - h.p[1];
  if (dy > h.r) {
    dy = h.r;
  } else if (dy < -h.r) {
    dy = -h.r;
  }
  return [-Math.sqrt(h.r * h.r - dy * dy), dy];
}

/* The turn taking the leaf from rest to opening o (clamped to 0..max). */
export function leafTurn(h, o) {
  const [d0, y0] = lip(h, h.rest);
  const [d1, y1] = lip(h, o);
  const rr = h.r * h.r;
  return { c: (d0 * d1 + y0 * y1) / rr, s: (y0 * d1 - d0 * y1) / rr };
}

/* The same turn the other way: from opening o back to rest. */
export function unturn(t) {
  return { c: t.c, s: -t.s };
}

/* Point P of the leaf at rest, turned by t: about the axis through h.p. */
export function turnPoint(h, t, P) {
  const { a, n } = axes(h);
  const rx = P[0] - h.p[0];
  const ry = P[1] - h.p[1];
  const rz = P[2] - h.p[2];
  const along = rx * a[0] + rz * a[2];
  const d = rx * n[0] + rz * n[2];
  const d2 = d * t.c + ry * t.s;
  const y2 = ry * t.c - d * t.s;
  return [h.p[0] + a[0] * along + n[0] * d2, h.p[1] + y2, h.p[2] + a[2] * along + n[2] * d2];
}

/* A direction of the leaf at rest, turned by t. */
export function turnDir(h, t, v) {
  const { a, n } = axes(h);
  const along = v[0] * a[0] + v[2] * a[2];
  const d = v[0] * n[0] + v[2] * n[2];
  const d2 = d * t.c + v[1] * t.s;
  const y2 = v[1] * t.c - d * t.s;
  return [a[0] * along + n[0] * d2, y2, a[2] * along + n[2] * d2];
}

/* A height y of the skin's arc at rest, as it stands turned by t. */
export function turnHeight(h, t, y) {
  let dy = y - h.p[1];
  if (dy > h.r) {
    dy = h.r;
  } else if (dy < -h.r) {
    dy = -h.r;
  }
  const d = -Math.sqrt(h.r * h.r - dy * dy);
  return h.p[1] + dy * t.c - d * t.s;
}
