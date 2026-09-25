/*
 * carve.js: where the photographic valley's walls are carved rock, and
 * the shape of that rock.
 *
 * The heightfield's thirty metre cells draw every wall as a smooth ramp,
 * where the valley in the photographs is stepped limestone: ledges, a
 * face under each, an overhanging lip, vertical fluting and cracks. The
 * ground a craft meets stays the heightfield, exactly; what is carved
 * here is only drawn. So every carving is an offset along the wall's
 * normal from that ground, never more than PROUD metres out of it (a
 * craft flies through at most that much drawn rock) and never more than
 * SUNK metres into it (a craft meets the ground at most that far in front
 * of the drawn face). Where a carved cell meets an uncarved one the
 * offset fades to nothing, so the carved skin and the heightfield's own
 * triangles meet edge to edge.
 *
 * Which cells are carved is the ground's paint (ground.js s2Ground)
 * read at each cell's middle: the two limestone cliff bands, the faces
 * too steep for turf and the rock ribs. Its noises are ported here from
 * the GLSL (s2Hash, s2Noise) so the skin stands where the paint already
 * puts rock; the rest of what the paint reads per pixel (the relief, the
 * finer noises) is taken at its average.
 *
 * Nothing here knows about three.js: rock/index.js builds the meshes.
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

import { noise2, smoothstep } from '../../alps/noise.js';
import { HALF, CELL, CELLS } from '../../alps/terrain.js';

/* The most the drawn rock stands out of the ground a craft meets, and
 * the most it sinks into it, in metres along the wall's normal. */
export const PROUD = 1.3;
export const SUNK = 3.6;

/* The walls' two cliff bands, which ground.js paints from these and
 * this file carves: their heights in metres, and the lower one's half
 * height (a base and how much the noise adds) and the noise's range over
 * which it goes from broken to whole along the wall. */
export const CLIFF_LOW = 420;
export const CLIFF_HIGH = 1010;
export const LOW_HALF = [35, 35];
export const LOW_GATE = [0.38, 0.55];

/* Metres over which the carving fades out toward an uncarved cell. */
const FADE = 9;

const fract = (v) => v - Math.floor(v);

/* ground.js's s2Hash and s2Noise, in doubles rather than the GPU's
 * floats: close enough to put the skin where the paint is. */
function s2Hash(x, y) {
  let a = fract(x * 0.1031);
  let b = fract(y * 0.1031);
  let c = a;
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  a += d;
  b += d;
  c += d;
  return fract((a + b) * c);
}
function s2Noise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = s2Hash(ix, iy);
  const b = s2Hash(ix + 1, iy);
  const c = s2Hash(ix, iy + 1);
  const d = s2Hash(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/*
 * How much the paint makes bare rock of the ground at (x, z), from the
 * slope `tan` and the normal's horizontal part (nx, nz): ground.js's
 * cov[4], the maximum of the cliff bands, the faces too steep for turf
 * and the ribs, with its per pixel noises at their middle value.
 */
export function paintRock(x, y, z, tan, nx, nz) {
  const macro = 0.5;
  const meso = 0.5;
  let gx = nx * nx + 1e-4;
  let gz = nz * nz + 1e-4;
  const gs = gx + gz;
  gx /= gs;
  gz /= gs;
  const wallTo = smoothstep(0.3, 0.6, tan);
  const ravine = s2Noise(z / 130, y / 330 + 0.4 * macro) * gx + s2Noise(x / 130 + 3.1, y / 330 + 0.4 * macro) * gz;
  const b1 = CLIFF_LOW + 150 * (s2Noise(x / 1400 + 3.3, z / 1400 + 3.3) - 0.5);
  const b2 = CLIFF_HIGH + 130 * (s2Noise(x / 1700 + 8.1, z / 1700 + 8.1) - 0.5);
  const bw1 = LOW_HALF[0] + LOW_HALF[1] * meso;
  const bw2 = 45 + 45 * s2Noise(x / 300 + 2.9, z / 300 + 2.9);
  const cliff = Math.max(
    (1 - smoothstep(bw1 * 0.55, bw1, Math.abs(y - b1))) * smoothstep(LOW_GATE[0], LOW_GATE[1], s2Noise(x / 330 + 1.7, z / 330 + 1.7)),
    (1 - smoothstep(bw2 * 0.55, bw2, Math.abs(y - b2))) * smoothstep(0.3, 0.5, s2Noise(x / 410 + 6.2, z / 410 + 6.2)),
  ) * wallTo;
  const face = smoothstep(1.2, 1.575, tan);
  const rib = smoothstep(0.35, 0.2, ravine) * smoothstep(0.75, 1.1, tan);
  return Math.max(face, 0.85 * rib, cliff);
}

/*
 * The carved cells: one byte per heightfield cell, row j at z = -HALF +
 * j * CELL, set where the paint makes the cell's middle rock and the
 * ground is a wall rather than a floor, and `keep(x, z)` (the fall's
 * headwall, the paths, the lift, the stream, the houses) does not hold
 * the ground as it is anywhere in the cell. The field's outermost ring is
 * never carved: the range beyond meets the field's own edge there.
 */
export function carveMask(field, keep) {
  const mask = new Uint8Array(CELLS * CELLS);
  for (let j = 1; j < CELLS - 1; j += 1) {
    for (let i = 1; i < CELLS - 1; i += 1) {
      const x = -HALF + (i + 0.5) * CELL;
      const z = -HALF + (j + 0.5) * CELL;
      const y = field.height(x, z);
      const sx = (field.height(x + 15, z) - field.height(x - 15, z)) / 30;
      const sz = (field.height(x, z + 15) - field.height(x, z - 15)) / 30;
      const tan = Math.hypot(sx, sz);
      if (tan < 0.45) {
        continue;
      }
      const inv = 1 / Math.hypot(sx, 1, sz);
      if (paintRock(x, y, z, tan, -sx * inv, -sz * inv) < 0.5) {
        continue;
      }
      let kept = false;
      for (let q = 0; q < 9 && !kept; q += 1) {
        kept = keep(x + ((q % 3) - 1) * CELL * 0.5, z + (Math.floor(q / 3) - 1) * CELL * 0.5);
      }
      if (!kept) {
        mask[j * CELLS + i] = 1;
      }
    }
  }
  return mask;
}

/* Whether the heightfield cell holding (x, z) is carved. */
export function carvedAt(mask, x, z) {
  const i = Math.floor((x + HALF) / CELL);
  const j = Math.floor((z + HALF) / CELL);
  return i >= 0 && j >= 0 && i < CELLS && j < CELLS && mask[j * CELLS + i] === 1;
}

/*
 * How far (x, z) is from the nearest uncarved ground, in metres, up to
 * FADE: the carving's weight goes from nought there to one FADE metres
 * in. Only the eight cells round the one the point is in are read, which
 * is enough while FADE is under a cell.
 */
function toUncarved(mask, x, z) {
  const u = (x + HALF) / CELL;
  const v = (z + HALF) / CELL;
  const i = Math.min(CELLS - 1, Math.floor(u));
  const j = Math.min(CELLS - 1, Math.floor(v));
  let best = FADE;
  for (let dj = -1; dj <= 1; dj += 1) {
    for (let di = -1; di <= 1; di += 1) {
      const a = i + di;
      const b = j + dj;
      if (a >= 0 && b >= 0 && a < CELLS && b < CELLS && mask[b * CELLS + a] === 1) {
        continue;
      }
      const dx = Math.max(a - u, 0, u - (a + 1)) * CELL;
      const dz = Math.max(b - v, 0, v - (b + 1)) * CELL;
      best = Math.min(best, Math.hypot(dx, dz));
    }
  }
  return best;
}

/* A bed's floor, the n-th boundary between beds: every BED metres on
 * the average, each moved up to a sixth of that either way so the ledges
 * are not ruled. Strictly increasing in n. */
const BED = 26;
function bedFloor(n) {
  return (n + 0.34 * (s2Hash(n * 1.37 + 0.5, 7.3) - 0.5)) * BED;
}

/*
 * The carved surface at a point of ground. `out` gets the offset along
 * the wall's normal (e, metres, positive out of the ground), the normal
 * itself (nx, ny, nz), a cavity term (cav, one in the open and less under
 * an overhang, in a crack, at the inside corner of a ledge) that the
 * material darkens the sky's light by, and how bare the rock is (bare,
 * one for rock and nought for a ledge that holds turf).
 *
 * The beds follow the height, tilted and warped by slow noises so they
 * cross the wall's contours as real strata do. In each bed, going down
 * the fall line: the lip, a face that drops back under it (the first
 * part faster than vertical, an overhang), a ledge at its foot, and a
 * slab running back out to the next lip. The face's rate is set against
 * the wall's own slope so it stands upright whatever the wall's angle,
 * and the ledge's so it lies nearly level; how deep the bed is follows
 * from those and the bed's height, capped by PROUD and SUNK. Beds are
 * tens of metres tall, so the wall reads as slabs with the odd ledge
 * rather than as a staircase (at eight metres it was terraced like a
 * paddy), and some hardly stand out at all. Over it all, what a
 * limestone wall is from across a valley: vertical. Pillars and the bays
 * between them tens of metres wide, fluting a few metres across, and
 * the odd crack.
 *
 * `lod` 0 is all of it, 1 leaves the cracks out and halves the fine
 * fluting, 2 and up keep only the pillars and the beds' mean depth: those
 * meshes are too coarse to hold a ledge, and a ledge they cannot hold
 * only aliases.
 */
export function carveAt(field, mask, x, z, lod, out) {
  const y0 = field.height(x, z);
  const gx = (field.height(x + 12, z) - field.height(x - 12, z)) / 24;
  const gz = (field.height(x, z + 12) - field.height(x, z - 12)) / 24;
  const tan = Math.hypot(gx, gz);
  const inv = 1 / Math.hypot(gx, 1, gz);
  out.y0 = y0;
  out.nx = -gx * inv;
  out.ny = inv;
  out.nz = -gz * inv;
  out.e = 0;
  out.cav = 1;
  out.bare = 1;
  const w = smoothstep(0, FADE, toUncarved(mask, x, z)) * smoothstep(0.35, 0.6, tan);
  if (w <= 0) {
    return out;
  }
  /* The fall line's horizontal bearing weights two upright planes the
   * vertical features are read on, so they stay put as the wall turns. */
  let fx = gx * gx + 1e-4;
  let fz = gz * gz + 1e-4;
  const fs = fx + fz;
  fx /= fs;
  fz /= fs;
  const upright = (sx, sy, off) => noise2(z / sx + off, y0 / sy) * fx + noise2(x / sx + off + 5.1, y0 / sy) * fz;
  const sin = tan * inv;
  const cot = 1 / Math.max(tan, 0.05);

  /* Pillars and bays, into the wall only. */
  const bay = upright(46, 260, 0.3 * noise2(y0 / 90, 1.7));
  const bayE = -2.2 * smoothstep(0.42, 0.68, bay);

  /* The beds dip, a few degrees one way here and another there, so a
   * ledge crosses the wall's contours rather than drawing them. */
  const dipX = 0.24 * (noise2(x / 2600 + 1.3, z / 2600) - 0.5);
  const dipZ = 0.24 * (noise2(x / 2600 + 7.1, z / 2600 + 4.2) - 0.5);
  const ys = y0 + 22 * (noise2(x / 420, z / 420) - 0.5) + 6 * (noise2(x / 75 + 3.3, z / 75) - 0.5) + dipX * x + dipZ * z;
  let n = Math.floor(ys / BED);
  if (ys < bedFloor(n)) {
    n -= 1;
  } else if (ys >= bedFloor(n + 1)) {
    n += 1;
  }
  const lo = bedFloor(n);
  const hi = bedFloor(n + 1);
  const H = hi - lo;
  /* Nought at the lip, one at the next lip down. */
  const q = (hi - ys) / H;
  /* The bed's own character, wandering along the wall: how far past
   * vertical its face leans, how level its ledge lies, whether it stands
   * out at all, and whether its ledge has turf on it. Only the finest
   * grid holds an upright face and its lip; the next drew them as a saw
   * edge along the wall, so there the face leans back. */
  const kFace = lod === 0 ? 1.0 + 0.5 * noise2(n * 0.61 + x / 260, z / 260 + n * 0.29) : 0.55;
  const kLedge = 0.6 + 0.35 * noise2(n * 0.43 + x / 310 + 4.4, z / 310);
  const ledge = smoothstep(0.3, 0.55, noise2(n * 0.53 + x / 220, z / 220 + n * 0.71));
  const turf = smoothstep(0.55, 0.7, noise2(n * 0.37 + x / 150 + 8.8, z / 150 + n * 1.3)) * ledge;
  const a = kFace * cot;
  const b = kLedge * tan;
  const along = H / Math.max(sin, 0.2);
  /* The depth a bed may have is the wall's, not the bed's: the lip of
   * one bed is the foot of the slab of the next, and they must meet. */
  const cap = 2.4 + 2.2 * noise2(x / 190, z / 190 + 2.2);
  /* On a gentle wall a craft meets the rock nearly level, and a metre
   * out along the normal is two across: held to two there. */
  const proud = Math.min(PROUD - 0.15, 0.3 * cap + 0.2, 1.8 * sin);
  /* Going down from the lip: the face drops the bed's depth at the rate
   * that stands it upright, the ledge at its foot climbs back LEDGE of it
   * at the rate that lays it level, and the slab below takes the rest
   * back to the next lip over the bed's remaining length, a few degrees
   * steeper than the wall. A bed too short for all three is shallower. */
  const LEDGE = 0.4;
  const deep = Math.min(cap * (0.15 + 0.85 * ledge), (0.8 * along) / (1 / a + LEDGE / b));
  const lFace = deep / a / along;
  const lLedge = (LEDGE * deep) / b / along;
  let bedE;
  let cav = 1;
  let bare = 1;
  let onFace = 0.35;
  if (q < lFace) {
    /* The lip overhangs: forty per cent of the depth goes in the first
     * third of the face. */
    const v = q / lFace;
    const g = v < 0.33 ? 0.4 * smoothstep(0, 0.33, v) : 0.4 + 0.6 * ((v - 0.33) / 0.67);
    bedE = proud - deep * g;
    cav -= 0.45 * ledge * smoothstep(0.02, 0.12, v) * (1 - smoothstep(0.3, 0.6, v));
    cav -= 0.3 * ledge * smoothstep(0.75, 1.0, v);
    onFace = 1;
  } else if (q < lFace + lLedge) {
    const v = (q - lFace) / lLedge;
    bedE = proud - deep + LEDGE * deep * v;
    cav -= 0.3 * ledge * (1 - smoothstep(0.0, 0.35, v));
    bare = 1 - turf * smoothstep(0.05, 0.3, v);
  } else {
    const v = (q - lFace - lLedge) / (1 - lFace - lLedge);
    bedE = proud - (1 - LEDGE) * deep * (1 - v);
    bare = 1 - turf * (1 - smoothstep(0.0, 0.15, v));
    onFace = 0.8;
  }

  let e;
  if (lod >= 2) {
    /* The bed's mean depth, so the coarse skin sits where the fine one
     * does on the average. */
    e = proud - deep * (lFace * 0.6 + lLedge * (1 - LEDGE / 2) + (1 - lFace - lLedge) * (1 - LEDGE) / 2) + bayE;
    cav = 0.9;
    bare = 1 - 0.5 * turf;
  } else {
    e = bedE + bayE;
    /* Fluting: grooves eleven metres across and three to five, long in
     * the fall line, deepest on the faces. */
    const wide = smoothstep(0.4, 0.8, upright(11, 70, 0.4 * noise2(x / 40, z / 40)));
    const fine = smoothstep(0.35, 0.85, upright(4.5, 28, 7.7 + 0.4 * noise2(z / 30, x / 30))) * (lod === 0 ? 1 : 0.5);
    e -= onFace * (1.1 * wide + 0.8 * fine);
    cav -= onFace * (0.15 * wide + 0.2 * fine);
    if (lod === 0) {
      const crack = smoothstep(0.8, 0.9, upright(2.6, 30, 11.3 + 0.8 * noise2(ys / 14, x / 50 + z / 50))) * onFace;
      e -= 1.6 * crack;
      cav -= 0.45 * crack;
    }
  }
  cav -= 0.2 * smoothstep(0.42, 0.68, bay);
  /* The sunk side eased into its cap rather than cut flat. */
  if (e < 0) {
    e = -SUNK * Math.tanh(-e / SUNK);
  }
  out.e = Math.min(e, PROUD, 1.9 * sin) * w;
  out.cav = 1 - (1 - Math.max(0.2, cav)) * w;
  out.bare = bare * w;
  return out;
}
