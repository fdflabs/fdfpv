/*
 * obstacles.js: the things a pilot can fly around, as kinded line segments.
 *
 * A Powerloop, a Matty or an Orbit is named by what the craft wound around,
 * so the recogniser needs the world reduced to axes: a pole is an upright
 * line you orbit in the horizontal plane, a bar is a level line you loop in
 * a vertical one. This file turns a built collider set into that list, keeps
 * it in a flat x/z grid so the per millisecond "what am I near" query stays
 * cheap, and says when two segments are one line, so a railing built from
 * several collinear colliders counts as one thing.
 *
 * Three.js world space, y up, metres. Every threshold below was tuned in
 * flight; none comes from a table. The outputs are pinned bit for bit by
 * scripts/obstacles-golden.js, which is why the arithmetic order is fixed.
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

import { KINDS, TURNED } from './collide.js';

export const OB_POLE = 0;
export const OB_BAR = 1;
export const OB_KIND_NAME = ['pole', 'bar'];

/* Indexed by kind. An unknown kind reads undefined on purpose: its grid
 * bounds go NaN and it is held but never indexed. */
const REACH = [18, 14];
const OVERHANG = [3, 2.5];

/* Engaging a new obstacle needs it this much closer, in squared distance
 * (about 32% in distance), so two near equal axes do not flicker. */
const STICKY = 1.75;

/* Packs a cell pair into one number. It aliases far apart cells, and the
 * goldens pin that, so it stays a number key. */
const ROW = 100003;

/* Squared distance from the axis of o, or MISS when the point is past the
 * ends (plus a capped overhang) or beyond reach. A NaN result is a hit. */
const MISS = -1;

function measure(o, x, y, z) {
  const rx = x - o.cx;
  const ry = y - o.cy;
  const rz = z - o.cz;
  const t = rx * o.dx + ry * o.dy + rz * o.dz;
  const hang = OVERHANG[o.kind];
  const over = hang < o.half ? hang : o.half;
  if (t > o.half + over || t < -o.half - over) return MISS;
  const px = rx - o.dx * t;
  const py = ry - o.dy * t;
  const pz = rz - o.dz * t;
  const d2 = px * px + py * py + pz * pz;
  const reach = REACH[o.kind];
  return d2 > reach * reach ? MISS : d2;
}

export class ObstacleField {
  constructor(cell = 16) {
    this.items = [];
    this.cell = cell;
    this.grid = null;
  }

  get count() {
    return this.items.length;
  }

  countOf(kind) {
    let n = 0;
    for (const o of this.items) if (o.kind === kind) n++;
    return n;
  }

  add(kind, cx, cy, cz, dx, dy, dz, half) {
    this.items.push({ kind, cx, cy, cz, dx, dy, dz, half, id: this.items.length });
    return this;
  }

  /* Each obstacle goes into every cell its reach square touches, so a query
   * reads one cell. Items are visited in id order, which keeps every cell's
   * list ascending and makes ties resolve to the lower id. */
  build() {
    const grid = new Map();
    const cell = this.cell;
    for (const o of this.items) {
      const reach = REACH[o.kind];
      const rx = reach + Math.abs(o.dx) * o.half;
      const rz = reach + Math.abs(o.dz) * o.half;
      const xHi = Math.floor((o.cx + rx) / cell);
      const zLo = Math.floor((o.cz - rz) / cell);
      const zHi = Math.floor((o.cz + rz) / cell);
      for (let ix = Math.floor((o.cx - rx) / cell); ix <= xHi; ix++) {
        for (let iz = zLo; iz <= zHi; iz++) {
          const key = ix * ROW + iz;
          const list = grid.get(key);
          if (list) list.push(o);
          else grid.set(key, [o]);
        }
      }
    }
    this.grid = grid;
    return this;
  }

  cellAt(x, z) {
    if (!this.grid) return undefined;
    return this.grid.get(Math.floor(x / this.cell) * ROW + Math.floor(z / this.cell));
  }

  /* Fills out with { ob, d2 } for every obstacle in reach, nearest first,
   * equal distances in id order, at most max of them. out is the caller's
   * array, reused every millisecond, so it is cleared before anything else. */
  nearAll(x, y, z, out, max) {
    out.length = 0;
    const list = this.cellAt(x, z);
    if (!list) return 0;
    for (const o of list) {
      const d2 = measure(o, x, y, z);
      if (d2 === MISS) continue;
      let at = out.length;
      while (at > 0 && out[at - 1].d2 > d2) at--;
      out.splice(at, 0, { ob: o, d2 });
      if (out.length > max) out.length = max;
    }
    return out.length;
  }

  /* The one obstacle being flown. current is kept while it is still in
   * reach and not beaten by the STICKY margin. */
  near(x, y, z, current) {
    const list = this.cellAt(x, z);
    if (!list) return null;
    let best = null;
    let bestD2 = Infinity;
    let curD2 = Infinity;
    for (const o of list) {
      const d2 = measure(o, x, y, z);
      if (d2 === MISS) continue;
      if (d2 < bestD2) {
        best = o;
        bestD2 = d2;
      }
      if (o === current) curD2 = d2;
    }
    return curD2 < Infinity && curD2 <= bestD2 * STICKY ? current : best;
  }
}

/* Whether b's centre sits on a's line, with a's direction. It is not
 * symmetric, and trickdetect always passes the stored obstacle first. */
export function sameAxis(a, b) {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a === b) return true;
  const dot = a.dx * b.dx + a.dy * b.dy + a.dz * b.dz;
  if ((dot < 0 ? -dot : dot) < 0.985) return false;
  const rx = b.cx - a.cx;
  const ry = b.cy - a.cy;
  const rz = b.cz - a.cz;
  const t = rx * a.dx + ry * a.dy + rz * a.dz;
  const px = rx - a.dx * t;
  const py = ry - a.dy * t;
  const pz = rz - a.dz * t;
  return px * px + py * py + pz * pz <= 0.75 * 0.75;
}

/* A capsule: an upright thin one is a pole, a level thin one high enough
 * off the ground is a bar. Canopy blobs are foliage, never an axis. */
function capsuleObstacle(field, c, i, groundAt) {
  const ax = c.fax[i], ay = c.fay[i], az = c.faz[i];
  const bx = c.fbx[i], by = c.fby[i], bz = c.fbz[i];
  const ex = bx - ax, ey = by - ay, ez = bz - az;
  const len = Math.sqrt(ex * ex + ey * ey + ez * ez);
  if (len < 1e-6 || KINDS[c.fkind[i]] === 'canopy') return;
  const ux = ex / len, uy = ey / len, uz = ez / len;
  const cx = (ax + bx) * 0.5, cy = (ay + by) * 0.5, cz = (az + bz) * 0.5;
  const r = c.fr[i];
  const thick = r * 2;
  const upright = uy < 0 ? -uy : uy;
  if (upright >= 0.9 && thick <= 0.9 && len >= 2.5) {
    field.add(OB_POLE, cx, cy, cz, 0, 1, 0, len * 0.5);
    return;
  }
  // 1 - 0.9 is not 0.1 in doubles, and the difference decides real capsules.
  if (!(upright <= 1 - 0.9 && thick <= 0.8 && len >= 2.0)) return;
  const lowY = (ay < by ? ay : by) - r;
  const ground = groundAt ? groundAt(cx, cz, lowY) : 0;
  if (lowY - ground >= 1.5) field.add(OB_BAR, cx, cy, cz, ux, uy, uz, len * 0.5);
}

/* A box, axis aligned or turned. Its base is clamped to the ground under
 * its world footprint centre, so a post sunk into a slope is measured from
 * where it comes out. */
function boxObstacle(field, c, i, groundAt) {
  const turned = c.fbox[i] === TURNED;
  const cx = (c.fax[i] + c.fbx[i]) * 0.5;
  const cz = (c.faz[i] + c.fbz[i]) * 0.5;
  const w = turned ? c.fu1[i] - c.fu0[i] : c.fbx[i] - c.fax[i];
  const d = turned ? c.fw1[i] - c.fw0[i] : c.fbz[i] - c.faz[i];
  const ground = groundAt ? groundAt(cx, cz, c.fay[i]) : 0;
  const y0 = Math.max(c.fay[i], ground);
  const y1 = c.fby[i];
  const h = y1 - y0;
  if (h <= 0) return;
  const alongX = w > d;
  const foot = alongX ? w : d;
  const thin = alongX ? d : w;
  const cy = (y0 + y1) * 0.5;
  if (foot <= 0.9 && h >= 2.5) {
    field.add(OB_POLE, cx, cy, cz, 0, 1, 0, h * 0.5);
    return;
  }
  if (!(foot >= 2.0 && thin <= 0.8 && h <= 0.8 && y0 - ground >= 1.5)) return;
  const ux = turned ? c.fux[i] : 1;
  const uz = turned ? c.fuz[i] : 0;
  // Unary minus on purpose: an axis aligned z bar gets dx = -0, and that is pinned.
  if (alongX) field.add(OB_BAR, cx, cy, cz, ux, 0, uz, foot * 0.5);
  else field.add(OB_BAR, cx, cy, cz, -uz, 0, ux, foot * 0.5);
}

/* groundAt(x, z, fromY) gives the ground under a point measured from below
 * fromY; without one the ground is 0 and the clearance test still runs. */
export function deriveObstacles(colliders, groundAt) {
  const field = new ObstacleField();
  const kinds = colliders && colliders.fbox;
  if (kinds) {
    for (let i = 0; i < kinds.length; i++) {
      if (kinds[i]) boxObstacle(field, colliders, i, groundAt);
      else capsuleObstacle(field, colliders, i, groundAt);
    }
  }
  return field.build();
}
