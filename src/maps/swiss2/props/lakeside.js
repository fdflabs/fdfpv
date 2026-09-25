/*
 * lakeside.js: what people have built along swiss2's lake, and the boats
 * on it.
 *
 *   buildLakeside(ctx) -> { group, update(dtMs), boat, dispose(), stats }
 *
 * A Swiss lake is never empty shore. From the water's edge you look over
 * boats on their buoys to a village on the far side: whitewashed houses
 * with their timber upper storeys and their gables to the lake, a hotel
 * at the landing stage, a church, boathouses in a row at the water. The
 * lake-shore and lake-edge views had the water and the far slope and
 * nothing on them, so the frame had no subject and no middle distance.
 * This draws:
 *
 *   THE HAMLET on the south shore, eight hundred metres across the water
 *   from the north shore's views: houses in rows up the foot of the
 *   slope, close round the landing stage and thinning along the shore,
 *   a hotel at the stage, a church a little up the rise. Their footprints go to the map's (`footprints`),
 *   so the forest and the meadow keep off them and the ground under them
 *   is trodden.
 *
 *   BOATHOUSES along the south shore and at its two corners, which the
 *   north shore's views see as the frame's far left and right.
 *
 *   THE PROMENADE along the north shore: a gravel path along the top of
 *   the beach, benches on it facing the water, lamps and bins.
 *
 *   BOATS: a mooring field of rowing boats, motor launches and a yacht
 *   or two on buoys off the hamlet and off the jetty, and one sailing
 *   boat under way, back and forth across the wind (update() moves it;
 *   `boat` is where it is and how fast, for the wake the water draws).
 *
 *   STONES on the beach and in the shallows either side of the jetty,
 *   where the lake-edge view looks down into the water.
 *
 * All of it is vertex coloured, the props' one program (mesh.js), in one
 * static mesh and the sailing boat's own. None of it is within seven
 * hundred metres of the strip (the nearest, the promenade, is nineteen
 * hundred away), so as with nature.js's jetty none has a collider.
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

import * as THREE from 'three';
import { makeRng, noise2 } from '../../alps/noise.js';
import { LAKE_Y } from '../../alps/terrain.js';
import { lakeShore, jettyClear } from '../vegetation/zones.js';
import { ribbon } from '../../alps/ribbon.js';
import {
  UP, Mesher, propMaterial, shade, box, frame,
} from './mesh.js';

/* Albedos, linear. Whitewash is not paper white: the photographs' walls
 * in sun sit a little under the clouds. */
const PLASTERS = [[0.56, 0.54, 0.49], [0.55, 0.5, 0.4], [0.52, 0.45, 0.4], [0.5, 0.5, 0.47]];
const TIMBER = [0.075, 0.042, 0.025];
const HONEY = [0.17, 0.095, 0.045];
const ROOFS = [[0.075, 0.072, 0.075], [0.15, 0.06, 0.035], [0.1, 0.07, 0.052]];
const STONE = [0.2, 0.19, 0.17];
const GLASS = [0.012, 0.016, 0.02];
const FRAME_WHITE = [0.6, 0.6, 0.58];
const SHUTTERS = [[0.03, 0.11, 0.05], [0.28, 0.04, 0.03], [0.05, 0.05, 0.05], null];
const GERANIUM = [0.5, 0.025, 0.02];
const LEAF = [0.03, 0.07, 0.02];
const IRON = [0.03, 0.045, 0.035];
const SLAT = [0.2, 0.12, 0.06];
const CONCRETE = [0.3, 0.29, 0.27];

const STOREY = 2.8;

/*
 * A face of a building: its origin (the bottom left corner seen from
 * outside), the unit vectors along it and up it, and its outward normal.
 * Windows and doors are laid a hand's breadth proud of it.
 */
function face(o, u, n) {
  return { o, u, v: UP, n };
}
const onFace = (f, a, b, out) => f.o.clone().addScaledVector(f.u, a).addScaledVector(f.v, b).addScaledVector(f.n, out);
function panel(m, f, a, b, w, h, out, colour) {
  m.quad(onFace(f, a, b, out), onFace(f, a + w, b, out), onFace(f, a + w, b + h, out), onFace(f, a, b + h, out), colour);
}

/* A window on face f with its bottom left at (a, b): a white frame, the
 * dark glass and, if `shutter`, a shutter folded back either side. */
function windowOn(m, f, a, b, w, h, shutter) {
  panel(m, f, a - 0.09, b - 0.09, w + 0.18, h + 0.18, 0.03, FRAME_WHITE);
  panel(m, f, a, b, w, h, 0.05, GLASS);
  if (shutter) {
    panel(m, f, a - 0.12 - w / 2, b - 0.04, w / 2, h + 0.08, 0.06, shutter);
    panel(m, f, a + w + 0.12, b - 0.04, w / 2, h + 0.08, 0.06, shutter);
  }
}

/* A row of `n` windows across a face `len` wide, at height b. */
function windowRow(m, f, len, b, n, w, h, shutter) {
  const gap = len / n;
  for (let k = 0; k < n; k += 1) {
    windowOn(m, f, gap * (k + 0.5) - w / 2, b, w, h, shutter);
  }
}

/*
 * A house on the lake's shore, its gable to the water: `floors` storeys
 * over a stone plinth, the first `masonry` of them whitewashed and the
 * rest in dark timber, under a low Bernese roof with deep eaves, a
 * balcony with its geraniums across the gable, windows all round. At
 * (x, z), its front (the gable) facing along `face` (a yaw), w wide and d
 * deep. Stands level on the highest ground under it, the plinth down to
 * the lowest. Returns its footprint.
 */
function house(m, heightAt, rng, spec) {
  const { x, z, yaw, w, d, floors, masonry, balconies = 1, pitch = 0.42 } = spec;
  const [ex, ey, ez] = frame(yaw);
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ({ x: x + ex.x * a * w / 2 + ez.x * b * d / 2, z: z + ex.z * a * w / 2 + ez.z * b * d / 2 }));
  const grounds = corners.map((c) => heightAt(c.x, c.z));
  const y0 = Math.max(...grounds) + 0.35;
  const low = Math.min(...grounds) - 0.4;
  const at = (a, b, c) => new THREE.Vector3(x, y0, z).addScaledVector(ex, a).addScaledVector(ey, b).addScaledVector(ez, c);
  const plaster = spec.plaster ?? PLASTERS[Math.floor(rng() * PLASTERS.length)];
  const roof = spec.roof ?? ROOFS[Math.floor(rng() * ROOFS.length)];
  const shutter = spec.shutter !== undefined ? spec.shutter : SHUTTERS[Math.floor(rng() * SHUTTERS.length)];
  box(m, at(0, (low - y0) / 2, 0), ex, ey, ez, w / 2 + 0.12, (y0 - low) / 2 + 0.02, d / 2 + 0.12, STONE);
  for (let s = 0; s < floors; s += 1) {
    const wood = s >= masonry;
    const tone = wood ? shade(TIMBER, 0.85 + 0.3 * rng()) : plaster;
    box(m, at(0, s * STOREY + STOREY / 2, 0), ex, ey, ez, w / 2 + (wood ? 0.06 : 0), STOREY / 2, d / 2 + (wood ? 0.06 : 0), tone, [0.95, 0.95, 1, 0.6, 0.9, 0.9]);
  }
  const top = floors * STOREY;
  const rise = (w / 2) * Math.tan(pitch);
  const gableTone = shade(TIMBER, 0.95);
  /* The gables, front (-ez) and back. */
  m.tri(at(w / 2 + 0.06, top, -d / 2 - 0.06), at(0, top + rise, -d / 2 - 0.06), at(-w / 2 - 0.06, top, -d / 2 - 0.06), gableTone);
  m.tri(at(-w / 2 - 0.06, top, d / 2 + 0.06), at(0, top + rise, d / 2 + 0.06), at(w / 2 + 0.06, top, d / 2 + 0.06), gableTone);
  /* The roof: two slabs with deep eaves and a deeper overhang over the
   * gables, dark boards under them, a fascia along their edges. */
  const eave = 1.1;
  const over = 1.5;
  const drop = eave * Math.tan(pitch);
  for (const s of [1, -1]) {
    const r0 = at(0, top + rise + 0.22, -d / 2 - over);
    const r1 = at(0, top + rise + 0.22, d / 2 + over);
    const e0 = at(s * (w / 2 + eave), top - drop + 0.22, -d / 2 - over);
    const e1 = at(s * (w / 2 + eave), top - drop + 0.22, d / 2 + over);
    const tone = shade(roof, 0.9 + 0.2 * rng());
    if (s > 0) {
      m.quad(r0, e0, e1, r1, tone);
      m.quad(r0.clone().setY(r0.y - 0.22), r1.clone().setY(r1.y - 0.22), e1.clone().setY(e1.y - 0.22), e0.clone().setY(e0.y - 0.22), shade(TIMBER, 0.6));
    } else {
      m.quad(r1, e1, e0, r0, tone);
      m.quad(r1.clone().setY(r1.y - 0.22), r0.clone().setY(r0.y - 0.22), e0.clone().setY(e0.y - 0.22), e1.clone().setY(e1.y - 0.22), shade(TIMBER, 0.6));
    }
    const fa = e0.clone().setY(e0.y - 0.22);
    const fb = e1.clone().setY(e1.y - 0.22);
    m.quad(s > 0 ? fb : fa, s > 0 ? fa : fb, s > 0 ? e0 : e1, s > 0 ? e1 : e0, shade(HONEY, 0.7));
  }
  /* A chimney through the back slope. */
  const cx = w * 0.22 * (rng() < 0.5 ? -1 : 1);
  box(m, at(cx, top + rise * (1 - Math.abs(cx) / (w / 2)) + 0.5, d * 0.2), ex, ey, ez, 0.35, 0.9, 0.35, shade(plaster, 0.8));
  /* The windows. Front and back: the gable end, facing -ez and +ez. */
  const front = face(at(-w / 2, 0, -d / 2), ex, ez.clone().negate());
  const back = face(at(w / 2, 0, d / 2), ex.clone().negate(), ez);
  const left = face(at(-w / 2, 0, d / 2), ez.clone().negate(), ex.clone().negate());
  const right = face(at(w / 2, 0, -d / 2), ez, ex);
  const across = Math.max(2, Math.round(w / 3.4));
  const along = Math.max(2, Math.round(d / 3.2));
  for (let s = 0; s < floors; s += 1) {
    const b = s * STOREY + 0.9;
    windowRow(m, front, w, b, across, 0.95, 1.2, s < masonry ? shutter : null);
    windowRow(m, back, w, b, Math.max(2, across - 1), 0.9, 1.1, s < masonry ? shutter : null);
    windowRow(m, left, d, b, along, 0.9, 1.15, s < masonry ? shutter : null);
    windowRow(m, right, d, b, along, 0.9, 1.15, s < masonry ? shutter : null);
  }
  /* The gable's own window pair under the ridge. */
  windowRow(m, front, w, top + 0.4, 2, 0.8, 1, null);
  /* The door in the front, off centre. */
  panel(m, front, w * 0.62, 0.02, 1.05, 2.1, 0.04, shade(HONEY, 0.8));
  /* Balconies across the gable on the upper storeys, a box of geraniums
   * along each rail. */
  for (let s = 0; s < balconies; s += 1) {
    const fl = (floors - 1 - s) * STOREY + 0.05;
    if (fl < STOREY * 0.9) {
      break;
    }
    const out = 1.15;
    box(m, at(0, fl, -d / 2 - out / 2), ex, ey, ez, w / 2 + 0.3, 0.08, out / 2, shade(HONEY, 0.8));
    box(m, at(0, fl + 0.55, -d / 2 - out + 0.04), ex, ey, ez, w / 2 + 0.3, 0.47, 0.04, shade(HONEY, 1.1), [1, 1, 1, 0.6, 1, 0.8]);
    for (const sx of [-1, 1]) {
      box(m, at(sx * (w / 2 + 0.26), fl + 0.55, -d / 2 - out / 2), ex, ey, ez, 0.04, 0.47, out / 2, shade(HONEY, 1));
    }
    box(m, at(0, fl + 1.12, -d / 2 - out + 0.02), ex, ey, ez, w / 2 + 0.2, 0.12, 0.13, GERANIUM, [1, 1, 1.15, 0.5, 1.05, 0.8]);
    box(m, at(0, fl + 0.98, -d / 2 - out + 0.02), ex, ey, ez, w / 2 + 0.2, 0.05, 0.14, LEAF);
  }
  return footprintOf(corners);
}

const footprintOf = (corners) => ({
  minX: Math.min(...corners.map((c) => c.x)),
  maxX: Math.max(...corners.map((c) => c.x)),
  minZ: Math.min(...corners.map((c) => c.z)),
  maxZ: Math.max(...corners.map((c) => c.z)),
});

/*
 * The village church: a whitewashed nave under a steep roof and a tower
 * at its west end with a clock on each face under a slender spire.
 */
function church(m, heightAt, { x, z, yaw }) {
  const [ex, ey, ez] = frame(yaw);
  const w = 8.5;
  const d = 17;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ({ x: x + ex.x * a * w / 2 + ez.x * b * d / 2, z: z + ex.z * a * w / 2 + ez.z * b * d / 2 }));
  const grounds = corners.map((c) => heightAt(c.x, c.z));
  const y0 = Math.max(...grounds) + 0.3;
  const low = Math.min(...grounds) - 0.4;
  const at = (a, b, c) => new THREE.Vector3(x, y0, z).addScaledVector(ex, a).addScaledVector(ey, b).addScaledVector(ez, c);
  const white = [0.6, 0.59, 0.55];
  box(m, at(0, (low - y0) / 2, 0), ex, ey, ez, w / 2 + 0.15, (y0 - low) / 2, d / 2 + 0.15, STONE);
  const h = 7.5;
  box(m, at(0, h / 2, 0), ex, ey, ez, w / 2, h / 2, d / 2, white);
  const rise = (w / 2) * Math.tan(0.8);
  const roof = [0.08, 0.075, 0.08];
  for (const s of [1, -1]) {
    const r0 = at(0, h + rise + 0.2, -d / 2 - 0.4);
    const r1 = at(0, h + rise + 0.2, d / 2 + 0.4);
    const e0 = at(s * (w / 2 + 0.5), h - 0.3, -d / 2 - 0.4);
    const e1 = at(s * (w / 2 + 0.5), h - 0.3, d / 2 + 0.4);
    m.quad(...(s > 0 ? [r0, e0, e1, r1] : [r1, e1, e0, r0]), roof);
  }
  m.tri(at(-w / 2, h, d / 2), at(0, h + rise, d / 2), at(w / 2, h, d / 2), white);
  /* Tall windows down the nave's sides. */
  const left = face(at(-w / 2, 0, d / 2), ez.clone().negate(), ex.clone().negate());
  const right = face(at(w / 2, 0, -d / 2), ez, ex);
  for (const f of [left, right]) {
    for (let k = 0; k < 4; k += 1) {
      panel(m, f, 2.2 + k * 3.8, 2.4, 1.1, 3.2, 0.04, [0.03, 0.035, 0.04]);
    }
  }
  /* The tower at the front, its spire, and a clock on each face. */
  const tw = 2.3;
  const th = 17;
  const tc = at(0, th / 2, -d / 2 - tw + 0.3);
  box(m, tc, ex, ey, ez, tw, th / 2, tw, white);
  const apex = tc.clone().addScaledVector(ey, th / 2 + 11);
  const baseY = th / 2 + 0.1;
  const ring = [];
  for (let k = 0; k < 8; k += 1) {
    const t = (k / 8) * Math.PI * 2 + Math.PI / 8;
    ring.push(tc.clone().addScaledVector(ey, baseY).addScaledVector(ex, Math.cos(t) * tw * 1.18).addScaledVector(ez, Math.sin(t) * tw * 1.18));
  }
  for (let k = 0; k < 8; k += 1) {
    m.tri(ring[(k + 1) % 8], ring[k], apex, shade(roof, k % 2 ? 0.9 : 1.15));
  }
  const tower = [
    face(tc.clone().addScaledVector(ex, -tw).addScaledVector(ez, -tw).addScaledVector(ey, -th / 2), ex, ez.clone().negate()),
    face(tc.clone().addScaledVector(ex, tw).addScaledVector(ez, tw).addScaledVector(ey, -th / 2), ex.clone().negate(), ez),
    face(tc.clone().addScaledVector(ex, -tw).addScaledVector(ez, tw).addScaledVector(ey, -th / 2), ez.clone().negate(), ex.clone().negate()),
    face(tc.clone().addScaledVector(ex, tw).addScaledVector(ez, -tw).addScaledVector(ey, -th / 2), ez, ex),
  ];
  for (const f of tower) {
    panel(m, f, tw - 0.85, th - 3.6, 1.7, 1.7, 0.04, [0.04, 0.04, 0.045]);
    panel(m, f, tw - 0.7, th - 3.45, 1.4, 1.4, 0.06, [0.7, 0.68, 0.6]);
    panel(m, f, tw - 0.4, th - 6.2, 0.8, 1.6, 0.04, [0.03, 0.03, 0.035]);
  }
  panel(m, tower[0], tw - 0.75, 0.02, 1.5, 2.6, 0.05, shade(HONEY, 0.7));
  return footprintOf(corners);
}

/*
 * A boat shed at the water, its gable to the lake: a timber box on piles
 * with its lake end open over a slip. At (x, z) on the shore, its length
 * along `yaw` pointing out over the water.
 */
export function boatShed(m, heightAt, rng, { x, z, yaw, len, w, h }) {
  const [ex, ey, ez] = frame(yaw);
  const y0 = Math.max(LAKE_Y + 0.6, heightAt(x, z) + 0.1);
  const at = (a, b, d) => new THREE.Vector3(x, y0, z).addScaledVector(ex, a).addScaledVector(ey, b).addScaledVector(ez, d);
  const wall = [0.07, 0.048, 0.032];
  /* The piles, down into the lake bed. */
  for (let a = -len / 2; a <= len / 2 + 0.01; a += len / 4) {
    for (const d of [-w / 2, w / 2]) {
      const p = at(a, 0, d);
      const bed = Math.min(heightAt(p.x, p.z), y0) - 0.8;
      box(m, new THREE.Vector3(p.x, (bed + y0) / 2, p.z), ex, ey, ez, 0.11, (y0 - bed) / 2, 0.11, shade(wall, 0.7));
    }
  }
  /* The side walls and the landward gable in boards, the lake end open
   * down to a lintel. */
  const rows = Math.round(h / 0.28);
  for (let r = 0; r < rows; r += 1) {
    const ya = (h * r) / rows;
    const yb = (h * (r + 1)) / rows;
    const tone = shade(wall, 0.8 + 0.35 * rng());
    m.quad(at(-len / 2, ya, w / 2), at(len / 2, ya, w / 2), at(len / 2, yb, w / 2), at(-len / 2, yb, w / 2), tone);
    m.quad(at(len / 2, ya, -w / 2), at(-len / 2, ya, -w / 2), at(-len / 2, yb, -w / 2), at(len / 2, yb, -w / 2), tone);
    m.quad(at(-len / 2, ya, -w / 2), at(-len / 2, ya, w / 2), at(-len / 2, yb, w / 2), at(-len / 2, yb, -w / 2), tone);
    if (ya > h * 0.72) {
      m.quad(at(len / 2, ya, w / 2), at(len / 2, ya, -w / 2), at(len / 2, yb, -w / 2), at(len / 2, yb, w / 2), tone);
    }
  }
  /* The dark inside, seen through the open end. */
  m.quad(at(-len / 2, 0, -w / 2), at(-len / 2, 0, w / 2), at(len / 2 - 0.1, 0, w / 2), at(len / 2 - 0.1, 0, -w / 2), [0.015, 0.013, 0.011]);
  m.quad(at(-len / 2 + 0.05, 0, w / 2), at(-len / 2 + 0.05, 0, -w / 2), at(-len / 2 + 0.05, h, -w / 2), at(-len / 2 + 0.05, h, w / 2), [0.01, 0.009, 0.008]);
  const pitch = 0.62;
  const ridge = h + (w / 2) * Math.tan(pitch);
  for (const a of [-len / 2, len / 2]) {
    m.tri(at(a, h, -w / 2), at(a, ridge, 0), at(a, h, w / 2), shade(wall, 0.9));
    m.tri(at(a, h, w / 2), at(a, ridge, 0), at(a, h, -w / 2), shade(wall, 0.9));
  }
  const roof = [0.1, 0.05, 0.03];
  const o = 0.5;
  const drop = o * Math.tan(pitch);
  for (const s of [1, -1]) {
    const courses = 5;
    for (let r = 0; r < courses; r += 1) {
      const t0 = r / courses;
      const t1 = (r + 1) / courses;
      const y = (t) => ridge + 0.06 + (h - drop - ridge - 0.06) * t;
      const d = (t) => s * (w / 2 + o) * t;
      const a = at(len / 2 + o, y(t0), d(t0));
      const b = at(-len / 2 - o, y(t0), d(t0));
      const c = at(-len / 2 - o, y(t1), d(t1));
      const e = at(len / 2 + o, y(t1), d(t1));
      const tone = shade(roof, 0.85 + 0.25 * rng());
      if (s > 0) {
        m.quad(a, b, c, e, tone);
        m.quad(a, e, c, b, shade(roof, 0.4));
      } else {
        m.quad(b, a, e, c, tone);
        m.quad(b, c, e, a, shade(roof, 0.4));
      }
    }
  }
  return { top: y0 + ridge + 0.2, low: y0 - 1 };
}

/*
 * A hull, `len` long and `beam` wide, its sheer `depth` over its keel, at
 * the origin of frame (c, ex along it bow first, ey up, ez across): lofted
 * through stations from a transom stern to a fine bow. `open` boats show
 * their inside and thwarts; a decked one is closed over.
 */
function hull(m, c, ex, ey, ez, { len, beam, depth, colour, inside, stripe = null, open = true, deck = null }) {
  const stations = [[-0.5, 0.78, 0.9], [-0.25, 0.97, 1], [0, 1, 1], [0.25, 0.86, 1], [0.42, 0.5, 1.04], [0.5, 0.02, 1.1]];
  const at = (t, half, y) => c.clone().addScaledVector(ex, t * len).addScaledVector(ey, y).addScaledVector(ez, half);
  const keelY = (t) => -depth * (0.62 + 0.38 * (1 - Math.abs(t * 2) ** 3)) * 0.55;
  for (let k = 0; k < stations.length - 1; k += 1) {
    const [t0, w0, s0] = stations[k];
    const [t1, w1, s1] = stations[k + 1];
    const h0 = (beam / 2) * w0;
    const h1 = (beam / 2) * w1;
    const top0 = depth * 0.45 * s0;
    const top1 = depth * 0.45 * s1;
    for (const side of [1, -1]) {
      const g0 = at(t0, side * h0, top0);
      const g1 = at(t1, side * h1, top1);
      const c0 = at(t0, side * h0 * 0.7, keelY(t0) * 0.55);
      const c1 = at(t1, side * h1 * 0.7, keelY(t1) * 0.55);
      const k0 = at(t0, 0, keelY(t0));
      const k1 = at(t1, 0, keelY(t1));
      const quad = side > 0 ? (a, b, cc, d, col) => m.quad(a, b, cc, d, col) : (a, b, cc, d, col) => m.quad(d, cc, b, a, col);
      quad(c0, c1, g1, g0, colour);
      quad(k0, k1, c1, c0, shade(colour, 0.7));
      if (stripe) {
        const s0p = at(t0, side * h0 * 1.005, top0 - depth * 0.08);
        const s1p = at(t1, side * h1 * 1.005, top1 - depth * 0.08);
        quad(s0p, s1p, at(t1, side * h1 * 1.005, top1 - depth * 0.02), at(t0, side * h0 * 1.005, top0 - depth * 0.02), stripe);
      }
      if (open) {
        const i0 = at(t0, side * h0 * 0.92, top0);
        const i1 = at(t1, side * h1 * 0.92, top1);
        const f0 = at(t0, side * h0 * 0.6, keelY(t0) * 0.4);
        const f1 = at(t1, side * h1 * 0.6, keelY(t1) * 0.4);
        quad(i0, i1, f1, f0, inside);
      }
    }
    if (open) {
      m.quad(at(t0, -h0 * 0.6, keelY(t0) * 0.4), at(t0, h0 * 0.6, keelY(t0) * 0.4), at(t1, h1 * 0.6, keelY(t1) * 0.4), at(t1, -h1 * 0.6, keelY(t1) * 0.4), shade(inside, 0.8));
    } else {
      m.quad(at(t0, -h0, top0), at(t0, h0, top0), at(t1, h1, top1), at(t1, -h1, top1), deck ?? colour);
    }
  }
  /* The transom. */
  const [ts, ws, ss] = stations[0];
  const hs = (beam / 2) * ws;
  m.quad(at(ts, hs, depth * 0.45 * ss), at(ts, -hs, depth * 0.45 * ss), at(ts, -hs * 0.7, keelY(ts) * 0.55), at(ts, hs * 0.7, keelY(ts) * 0.55), shade(colour, 0.8));
  if (open) {
    for (const t of [-0.12, 0.18]) {
      box(m, at(t, 0, depth * 0.3), ex, ey, ez, 0.12, 0.025, beam * 0.45, shade(inside, 1.3));
    }
  }
}

/* Boats on the lake's moorings: a rowing boat, a motor launch, a small
 * yacht with her sail furled on the boom. */
const HULLS = [[0.55, 0.55, 0.53], [0.52, 0.52, 0.5], [0.08, 0.14, 0.24], [0.22, 0.04, 0.03], [0.2, 0.12, 0.06]];
function mooredBoat(m, rng, x, z, yaw, kind) {
  const [ex, ey, ez] = frame(yaw);
  const c = new THREE.Vector3(x, LAKE_Y + 0.02, z);
  const colour = HULLS[Math.floor(rng() * HULLS.length)];
  if (kind === 'row') {
    hull(m, c, ex, ey, ez, { len: 4.2, beam: 1.4, depth: 0.7, colour, inside: [0.2, 0.12, 0.06], stripe: rng() < 0.5 ? [0.3, 0.04, 0.03] : null });
  } else if (kind === 'launch') {
    hull(m, c, ex, ey, ez, { len: 6, beam: 2.1, depth: 1.1, colour: [0.55, 0.55, 0.53], inside: [0.16, 0.1, 0.06], stripe: [0.05, 0.12, 0.25] });
    /* A canvas over the cockpit. */
    box(m, c.clone().addScaledVector(ey, 0.62).addScaledVector(ex, -0.6), ex, ey, ez, 1.7, 0.15, 0.85, [0.06, 0.12, 0.22]);
    box(m, c.clone().addScaledVector(ey, 0.75).addScaledVector(ex, 0.55), ex, ey, ez, 0.05, 0.25, 0.8, [0.1, 0.12, 0.13]);
  } else {
    hull(m, c, ex, ey, ez, { len: 7.5, beam: 2.4, depth: 1.3, colour: [0.56, 0.56, 0.54], inside: [0.2, 0.2, 0.2], open: false, deck: [0.34, 0.3, 0.24] });
    box(m, c.clone().addScaledVector(ey, 0.85).addScaledVector(ex, -0.4), ex, ey, ez, 1.3, 0.28, 0.8, [0.55, 0.55, 0.53]);
    box(m, c.clone().addScaledVector(ey, 5.2).addScaledVector(ex, 0.6), ex, ey, ez, 0.06, 4.6, 0.06, [0.5, 0.5, 0.5]);
    box(m, c.clone().addScaledVector(ey, 1.55).addScaledVector(ex, -0.9), ex, ey, ez, 1.5, 0.12, 0.12, [0.1, 0.18, 0.3]);
  }
  /* The buoy she lies to, off her bow. */
  const b = c.clone().addScaledVector(ex, kind === 'yacht' ? 6.5 : 4.2);
  box(m, b.setY(LAKE_Y + 0.12), ex, ey, ez, 0.22, 0.2, 0.22, rng() < 0.5 ? [0.6, 0.6, 0.58] : [0.7, 0.2, 0.02]);
}

/*
 * The sailing boat under way, in its own frame: bow along +x, the wind
 * over the +z side, heeled away from it, the main sheeted out to
 * leeward. Mirrored across its centreline (scale z -1) on the other tack.
 */
function sailingBoat() {
  const m = new Mesher();
  const heel = 0.16;
  const ex = new THREE.Vector3(1, 0, 0);
  const ey = new THREE.Vector3(0, Math.cos(heel), -Math.sin(heel));
  const ez = new THREE.Vector3(0, Math.sin(heel), Math.cos(heel));
  const c = new THREE.Vector3(0, 0.05, 0);
  hull(m, c, ex, ey, ez, { len: 6.5, beam: 2.2, depth: 1.1, colour: [0.58, 0.58, 0.56], inside: [0.2, 0.2, 0.2], open: false, deck: [0.36, 0.32, 0.26], stripe: [0.05, 0.1, 0.2] });
  const at = (a, b, d) => c.clone().addScaledVector(ex, a).addScaledVector(ey, b).addScaledVector(ez, d);
  box(m, at(0.3, 5, 0), ex, ey, ez, 0.06, 4.6, 0.06, [0.55, 0.55, 0.55]);
  /* The main, off the mast to the boom's end out to leeward (-z), and
   * the jib from the forestay to its clew; both faces. */
  const sail = [0.66, 0.65, 0.62];
  const head = at(0.3, 9.4, 0);
  const tack = at(0.3, 1.1, 0);
  const clew = at(-2.6, 1.2, -1.1);
  m.tri(tack, clew, head, sail);
  m.tri(tack, head, clew, shade(sail, 0.85));
  box(m, at(-1.15, 1.15, -0.55), new THREE.Vector3().subVectors(clew, tack).normalize(), ey, new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(clew, tack).normalize(), ey).normalize(), 1.55, 0.05, 0.05, [0.5, 0.5, 0.5]);
  const jHead = at(0.3, 7.8, 0);
  const jTack = at(3.15, 0.55, 0);
  const jClew = at(0.9, 0.9, -1.0);
  m.tri(jTack, jClew, jHead, sail);
  m.tri(jTack, jHead, jClew, shade(sail, 0.85));
  return m.geometry();
}

/* An irregular stone, r across, its top at y + r * 0.45: a squashed
 * sphere pushed about by the noise, grey limestone, darker and greener
 * where the water covers it. */
function stone(m, rng, x, y, z, r) {
  const rows = 4;
  const cols = 7;
  const seed = rng() * 100;
  const squash = 0.45 + 0.25 * rng();
  const pts = [];
  for (let j = 0; j <= rows; j += 1) {
    const lat = -Math.PI / 2 + (j / rows) * Math.PI;
    const row = [];
    for (let i = 0; i < cols; i += 1) {
      const lon = (i / cols) * Math.PI * 2;
      const k = 0.75 + 0.5 * noise2(seed + Math.cos(lon) * 1.3 + j * 0.7, seed + Math.sin(lon) * 1.3);
      row.push(new THREE.Vector3(x + Math.cos(lat) * Math.cos(lon) * r * k, y + Math.sin(lat) * r * squash * k, z + Math.cos(lat) * Math.sin(lon) * r * k));
    }
    pts.push(row);
  }
  const base = shade([0.36, 0.35, 0.32], 0.7 + 0.45 * rng());
  const colourAt = (p) => {
    if (p.y < LAKE_Y + 0.05) {
      return [base[0] * 0.55, base[1] * 0.62, base[2] * 0.45];
    }
    return p.y < LAKE_Y + 0.25 ? shade(base, 0.6) : base;
  };
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const a = pts[j][i];
      const b = pts[j][(i + 1) % cols];
      const c = pts[j + 1][(i + 1) % cols];
      const d = pts[j + 1][i];
      const mid = a.clone().add(c).multiplyScalar(0.5);
      m.quad(a, d, c, b, colourAt(mid));
    }
  }
}

/* A bench on the promenade: two concrete feet, a seat and a back of
 * slats, facing along `yaw`. */
function bench(m, x, y, z, yaw) {
  const [ex, ey, ez] = frame(yaw + Math.PI / 2);
  const at = (a, b, d) => new THREE.Vector3(x, y, z).addScaledVector(ex, a).addScaledVector(ey, b).addScaledVector(ez, d);
  for (const a of [-0.8, 0.8]) {
    box(m, at(a, 0.22, 0), ex, ey, ez, 0.05, 0.22, 0.24, CONCRETE);
    box(m, at(a, 0.62, 0.22), ex, ey, ez, 0.04, 0.3, 0.035, IRON);
  }
  for (let k = 0; k < 3; k += 1) {
    box(m, at(0, 0.46, -0.16 + k * 0.15), ex, ey, ez, 0.95, 0.025, 0.055, shade(SLAT, 0.9 + 0.1 * k));
  }
  for (let k = 0; k < 2; k += 1) {
    box(m, at(0, 0.66 + k * 0.17, 0.25), ex, ey, ez, 0.95, 0.055, 0.02, shade(SLAT, 1 - 0.08 * k));
  }
}

/* A promenade lamp: a cast iron post in the municipal dark green on a
 * stepped foot, a collar under the lantern, the lantern's four panes of
 * glass under a pointed cap with its finial. */
function lamp(m, x, y, z, yaw) {
  const [ex, ey, ez] = frame(yaw);
  const at = (b) => new THREE.Vector3(x, y, z).addScaledVector(ey, b);
  box(m, at(0.12), ex, ey, ez, 0.2, 0.12, 0.2, IRON);
  box(m, at(0.38), ex, ey, ez, 0.14, 0.14, 0.14, IRON);
  box(m, at(0.62), ex, ey, ez, 0.09, 0.1, 0.09, IRON);
  box(m, at(2.05), ex, ey, ez, 0.05, 1.35, 0.05, IRON);
  box(m, at(3.43), ex, ey, ez, 0.11, 0.04, 0.11, IRON);
  box(m, at(3.5), ex, ey, ez, 0.07, 0.04, 0.07, IRON);
  const glass = [0.62, 0.6, 0.52];
  box(m, at(3.8), ex, ey, ez, 0.17, 0.26, 0.17, glass, [1, 1, 1, 0.9, 1, 1]);
  for (const a of [-1, 1]) {
    for (const d of [-1, 1]) {
      box(m, at(3.8).addScaledVector(ex, a * 0.17).addScaledVector(ez, d * 0.17), ex, ey, ez, 0.018, 0.27, 0.018, IRON);
    }
  }
  box(m, at(4.07), ex, ey, ez, 0.22, 0.025, 0.22, IRON);
  const apex = at(4.38);
  const rim = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, d]) => at(4.09).addScaledVector(ex, a * 0.22).addScaledVector(ez, d * 0.22));
  for (let k = 0; k < 4; k += 1) {
    m.tri(rim[k], rim[(k + 1) % 4], apex, shade(IRON, k % 2 ? 1 : 1.3));
  }
  box(m, at(4.45), ex, ey, ez, 0.02, 0.08, 0.02, IRON);
}

/* A bin by a bench, on its post. */
function bin(m, x, y, z) {
  const [ex, ey, ez] = frame(0.3);
  box(m, new THREE.Vector3(x, y + 0.3, z), ex, ey, ez, 0.035, 0.3, 0.035, IRON);
  box(m, new THREE.Vector3(x, y + 0.62, z), ex, ey, ez, 0.17, 0.22, 0.17, [0.04, 0.09, 0.05]);
  box(m, new THREE.Vector3(x, y + 0.86, z), ex, ey, ez, 0.19, 0.02, 0.19, IRON);
}

/* The sailing boat's course: back and forth across the wind, which blows
 * down the valley toward +x, -z, from one side of the lake to the other,
 * turning at each end. Position and heading at `s` metres along it. */
const COURSE = { cx: 185, cz: 2360, ux: 0.6, uz: 0.8, half: 230, turn: 28 };
function onCourse(s) {
  const { cx, cz, ux, uz, half, turn } = COURSE;
  const leg = 2 * half;
  const arc = Math.PI * turn;
  const lap = 2 * (leg + arc);
  let t = ((s % lap) + lap) % lap;
  /* Across the course: to one side on the outward leg, the other back. */
  const vx = -uz;
  const vz = ux;
  if (t < leg) {
    const a = -half + t;
    return { x: cx + ux * a + vx * turn, z: cz + uz * a + vz * turn, hx: ux, hz: uz };
  }
  t -= leg;
  if (t < arc) {
    const th = t / turn;
    const px = cx + ux * half;
    const pz = cz + uz * half;
    const ox = vx * Math.cos(th) + ux * Math.sin(th);
    const oz = vz * Math.cos(th) + uz * Math.sin(th);
    return { x: px + ox * turn, z: pz + oz * turn, hx: -vx * Math.sin(th) + ux * Math.cos(th), hz: -vz * Math.sin(th) + uz * Math.cos(th) };
  }
  t -= arc;
  if (t < leg) {
    const a = half - t;
    return { x: cx + ux * a - vx * turn, z: cz + uz * a - vz * turn, hx: -ux, hz: -uz };
  }
  t -= leg;
  const th = t / turn;
  const px = cx - ux * half;
  const pz = cz - uz * half;
  const ox = -vx * Math.cos(th) - ux * Math.sin(th);
  const oz = -vz * Math.cos(th) - uz * Math.sin(th);
  return { x: px + ox * turn, z: pz + oz * turn, hx: vx * Math.sin(th) - ux * Math.cos(th), hz: vz * Math.sin(th) - uz * Math.cos(th) };
}

/* Metres a second the sailing boat makes, and where on its course it is
 * when the valley is first drawn: out in the middle of the lake, where
 * the north shore's views and the view from above all see it. */
const BOAT_SPEED = 2.4;
const BOAT_START = 300;
/* The water's own wind (water/index.js), which the boats lie to. */
const WIND = new THREE.Vector2(0.8, -0.6).normalize();

/*
 * Build it all. ctx: heightAt, footprints (the map's walls, which the
 * hamlet's houses join), and path (the material the map's gravel paths
 * are drawn with, for the promenade).
 */
export function buildLakeside({ heightAt, footprints, path }) {
  const rng = makeRng(20261101);
  const m = new Mesher();
  const group = new THREE.Group();
  group.name = 'swiss2-lakeside';
  const { shore: rim, cx: lakeX, cz: lakeZ } = lakeShore(heightAt, 288);
  const walls = [];
  /* The shore point nearest x on the south or north side, and the unit
   * vector from it away from the water. */
  const shoreAt = (x, south) => {
    const p = rim.filter((q) => (south ? q.z > lakeZ : q.z < lakeZ)).reduce((best, q) => (Math.abs(q.x - x) < Math.abs(best.x - x) ? q : best));
    const l = Math.hypot(p.x - lakeX, p.z - lakeZ);
    return { x: p.x, z: p.z, ox: (p.x - lakeX) / l, oz: (p.z - lakeZ) / l };
  };
  const faceLake = (p) => Math.atan2(-p.ox, p.oz);

  /* THE HAMLET: rows stepping up from the south shore, close together
   * round the church and the hotel and thinning out along the shore
   * either side, as a lake village grows from its landing stage. The
   * front row's gables are to the water; up the slope a house turns
   * its ridge along the contour now and then. Each house's size and
   * finish from the hamlet's own rng. */
  const CENTRE = 90;
  const rows = [
    { back: 15, step: 19, reach: 230 },
    { back: 33, step: 21, reach: 190 },
    { back: 52, step: 23, reach: 150 },
    { back: 72, step: 27, reach: 110 },
  ];
  /* The hotel's and the church's plots, which the rows leave free. */
  const keepClear = [{ x: 76, back: 18, r: 14 }, { x: 58, back: 70, r: 14 }];
  const sites = [];
  let houses = 0;
  rows.forEach(({ back, step, reach }, row) => {
    for (let sx = CENTRE - reach + (row % 2) * step * 0.5; sx <= CENTRE + reach; sx += step) {
      const along = sx + (rng() - 0.5) * step * 0.4;
      const thin = Math.abs(along - CENTRE) / reach;
      const p = shoreAt(along, true);
      const b = back + (rng() - 0.5) * 6;
      const x = p.x + p.ox * b;
      const z = p.z + p.oz * b;
      const g = heightAt(x, z);
      const spare = rng();
      if (spare < thin * 0.55 || g < LAKE_Y + 1 || g > LAKE_Y + 30 || keepClear.some((c) => Math.abs(along - c.x) < c.r && Math.abs(b - c.back) < c.r)) {
        continue;
      }
      const big = rng();
      const turned = row > 0 && rng() < 0.3;
      const w = 8.5 + 3.5 * big;
      const d = 10 + 4 * rng();
      /* Eaves and balconies reach about two metres past the walls. */
      const r = Math.hypot(w, d) / 2 + 2;
      if (sites.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + r)) {
        continue;
      }
      sites.push({ x, z, r });
      walls.push(house(m, heightAt, rng, {
        x,
        z,
        yaw: faceLake(p) + (turned ? Math.PI / 2 : 0) + (rng() - 0.5) * 0.3,
        w,
        d,
        floors: 2 + (big > 0.6 ? 1 : 0),
        masonry: 1 + (rng() < 0.35 ? 1 : 0),
        balconies: 1 + (big > 0.6 ? 1 : 0),
      }));
      houses += 1;
    }
  });
  /* The hotel at the landing stage: four whitewashed storeys, green
   * shutters, balconies, a dark roof. */
  {
    const p = shoreAt(76, true);
    const x = p.x + p.ox * 18;
    const z = p.z + p.oz * 18;
    walls.push(house(m, heightAt, rng, {
      x, z, yaw: faceLake(p), w: 17, d: 13, floors: 4, masonry: 4, balconies: 3, pitch: 0.36, plaster: [0.6, 0.58, 0.52], roof: [0.14, 0.06, 0.04], shutter: SHUTTERS[0],
    }));
    /* The landing stage for the lake boats, out from in front of it. */
    const [ex, ey, ez] = frame(faceLake(p) - Math.PI / 2);
    const deckY = LAKE_Y + 1.1;
    for (let a = 0; a < 26; a += 4) {
      for (const d of [-1.6, 1.6]) {
        const q = new THREE.Vector3(p.x, 0, p.z).addScaledVector(ex, a - 4).addScaledVector(ez, d);
        const bed = Math.min(heightAt(q.x, q.z), deckY) - 0.8;
        box(m, q.setY((bed + deckY) / 2), ex, ey, ez, 0.13, (deckY - bed) / 2, 0.13, shade(TIMBER, 0.8));
      }
    }
    const deck = new THREE.Vector3(p.x, deckY + 0.1, p.z).addScaledVector(ex, 9);
    box(m, deck, ex, ey, ez, 13.5, 0.1, 1.9, shade(HONEY, 0.9));
    const hut = new THREE.Vector3(p.x, deckY + 1.3, p.z).addScaledVector(ex, 19);
    box(m, hut, ex, ey, ez, 2, 1.2, 1.7, [0.5, 0.48, 0.44]);
    box(m, hut.clone().setY(deckY + 2.65), ex, ey, ez, 2.5, 0.12, 2.1, [0.1, 0.1, 0.1]);
  }
  /* The church, up the slope behind the hotel. */
  {
    const p = shoreAt(58, true);
    walls.push(church(m, heightAt, { x: p.x + p.ox * 70, z: p.z + p.oz * 70, yaw: faceLake(p) }));
  }

  /* BOATHOUSES at the water: a row along the hamlet's front and one at
   * each corner of the south shore. */
  let sheds = 0;
  for (const sx of [-150, -96, -18, 180, 232, 330, 560]) {
    const p = shoreAt(sx, true);
    const x = p.x - p.ox * 2;
    const z = p.z - p.oz * 2;
    boatShed(m, heightAt, rng, { x, z, yaw: Math.atan2(-p.oz, -p.ox), len: 8 + 3 * rng(), w: 5 + rng(), h: 2.6 + 0.4 * rng() });
    sheds += 1;
  }

  /* THE MOORINGS: boats on buoys off the hamlet and off the north
   * shore's jetty, all lying head to the wind. */
  const windYaw = Math.atan2(-WIND.y, -WIND.x);
  const kinds = ['row', 'row', 'launch', 'yacht', 'launch', 'row'];
  let boats = 0;
  const moor = (x, z) => {
    if (LAKE_Y - heightAt(x, z) < 1.2) {
      return;
    }
    mooredBoat(m, rng, x, z, windYaw + (rng() - 0.5) * 0.3, kinds[Math.floor(rng() * kinds.length)]);
    boats += 1;
  };
  for (let k = 0; k < 16; k += 1) {
    const p = shoreAt(-60 + k * 24 + (rng() - 0.5) * 10, true);
    const out = 35 + 45 * rng();
    moor(p.x - p.ox * out, p.z - p.oz * out);
  }
  const clear = jettyClear(heightAt);
  for (let k = 0; k < 7; k += 1) {
    const p = shoreAt(230 + k * 26 + (rng() - 0.5) * 8, false);
    const out = 30 + 40 * rng();
    const x = p.x - p.ox * out;
    const z = p.z - p.oz * out;
    if (!clear(x, z)) {
      moor(x, z);
    }
  }

  /* THE PROMENADE on the north shore: a gravel path along the top of
   * the beach from the stream's mouth to the lake's east end, benches on
   * its lake side facing the water, lamps between them, a bin by every
   * other bench. The benches and lamps are spaced by hand, as a commune
   * spaces them, so that one of each stands where the lake-edge view
   * looks out over them: the jetty's lamp to the left of the track down
   * to it, a bench to the right. */
  const jetty = shoreAt(197, false);
  const UP_BEACH = 17;
  const line = rim
    .filter((q) => q.z < lakeZ && q.x > 60 && q.x < 470)
    .sort((a, b) => a.x - b.x)
    .map((q) => {
      const l = Math.hypot(q.x - lakeX, q.z - lakeZ);
      const ox = (q.x - lakeX) / l;
      const oz = (q.z - lakeZ) / l;
      return { x: q.x + ox * UP_BEACH, z: q.z + oz * UP_BEACH, ox, oz };
    });
  const walk = [];
  for (let k = 1; k < line.length; k += 1) {
    const a = line[k - 1];
    const b = line[k];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 3));
    for (let q = 0; q < n; q += 1) {
      walk.push({ x: a.x + ((b.x - a.x) * q) / n, z: a.z + ((b.z - a.z) * q) / n });
    }
  }
  walk.push(line[line.length - 1]);
  const promenade = ribbon(walk, 2.6, 0.06, heightAt, path).mesh;
  promenade.name = 'swiss2-promenade';
  promenade.receiveShadow = true;
  group.add(promenade);
  /* The path's footprint, in short boxes along it, so the meadow's grass
   * keeps off it. */
  for (let k = 0; k < walk.length; k += 3) {
    const p = walk[k];
    walls.push({ minX: p.x - 1.6, maxX: p.x + 1.6, minZ: p.z - 1.6, maxZ: p.z + 1.6 });
  }
  /* Where the path is at x, and which way the water is from it, two
   * metres toward the water from its middle. */
  const besidePath = (x) => {
    let k = 1;
    while (k < line.length - 1 && line[k].x < x) {
      k += 1;
    }
    const a = line[k - 1];
    const b = line[k];
    const t = Math.max(0, Math.min(1, (x - a.x) / Math.max(1e-6, b.x - a.x)));
    const ox = a.ox + (b.ox - a.ox) * t;
    const oz = a.oz + (b.oz - a.oz) * t;
    const px = a.x + (b.x - a.x) * t - ox * 2;
    const pz = a.z + (b.z - a.z) * t - oz * 2;
    return { x: px, z: pz, y: heightAt(px, pz), yaw: Math.atan2(-oz, -ox), ox, oz };
  };
  const BENCHES = [112, 150, 189, 228, 268, 310, 352, 396, 438];
  const LAMPS = [131, 168, 200, 248, 289, 331, 374, 417];
  BENCHES.forEach((bx, k) => {
    const p = besidePath(bx);
    bench(m, p.x, p.y + 0.02, p.z, p.yaw);
    if (k % 2 === 0) {
      bin(m, p.x + p.oz * 1.5, p.y, p.z - p.ox * 1.5);
    }
  });
  for (const lx of LAMPS) {
    const p = besidePath(lx);
    lamp(m, p.x, p.y, p.z, p.yaw);
  }
  const benches = BENCHES.length;
  const lamps = LAMPS.length;

  /* STONES along the beach and out into the shallows either side of the
   * jetty: big ones bedded in the gravel at the water's edge, smaller
   * ones scattered out under the water, where the lake-edge view looks
   * down into it. */
  const srng = makeRng(20261102);
  let stones = 0;
  for (let k = 0; k < 160 && stones < 70; k += 1) {
    const x = jetty.x + (srng() - 0.5) * 70;
    const z = jetty.z - 6 + srng() * 26;
    const g = heightAt(x, z);
    const depth = LAKE_Y - g;
    if (clear(x, z) || depth > 1.4 || depth < -0.9) {
      continue;
    }
    const r = (depth > 0.2 ? 0.25 : 0.35) + 0.6 * srng() * srng();
    stone(m, srng, x, g + r * 0.12, z, r);
    stones += 1;
  }

  const mat = propMaterial();
  const mesh = new THREE.Mesh(m.geometry(), mat);
  mesh.name = 'swiss2-lakeside';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  /* The sailing boat under way. */
  const sail = new THREE.Mesh(sailingBoat(), mat);
  sail.name = 'swiss2-sailing-boat';
  sail.castShadow = true;
  group.add(sail);
  const boat = new THREE.Vector4();
  let s = BOAT_START;
  const place = () => {
    const p = onCourse(s);
    sail.position.set(p.x, LAKE_Y, p.z);
    sail.rotation.set(0, Math.atan2(-p.hz, p.hx), 0);
    /* The wind over the port side or the starboard: heel and main to
     * the other. */
    const cross = p.hx * WIND.y - p.hz * WIND.x;
    sail.scale.set(1, 1, cross > 0 ? -1 : 1);
    sail.updateMatrixWorld();
    boat.set(p.x, p.z, p.hx * BOAT_SPEED, p.hz * BOAT_SPEED);
  };
  place();

  for (const f of walls) {
    footprints.push(f);
  }
  return {
    group,
    boat,
    update(dtMs) {
      s += (BOAT_SPEED * Math.min(dtMs, 100)) / 1000;
      place();
    },
    stats: {
      houses, sheds, boats, benches, lamps, stones, triangles: m.pos.length / 9,
    },
    dispose() {
      group.removeFromParent();
      mesh.geometry.dispose();
      sail.geometry.dispose();
      promenade.geometry.dispose();
      mat.dispose();
    },
  };
}
