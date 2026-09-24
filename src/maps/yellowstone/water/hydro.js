/*
 * hydro.js: hydro.json read and checked, and the river corridors worked out,
 * with no Three.js in it.
 *
 * Rivers are polylines of world [x, z] with a width in metres per vertex;
 * lakes are rings with a surface y and optional holes (the islands). This
 * file folds the few shapes the data could plausibly arrive in to one, and
 * lays a river onto the drape grid of ../thermal/grid.js: the cells within
 * reach of the channel, and at every grid node the signed distance to the
 * centre line as a fraction of the half width, which the water's fragment
 * shader cuts the banks from. Pure, so the selftest runs it under Node.
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

import { EXTENT, regionOf } from '../thermal/catalog.js';
import { CellSet } from '../thermal/grid.js';

/* NHD carries no width for most flowlines. A stream with none is drawn at
 * this, which is what a small Yellowstone creek is. */
const DEFAULT_WIDTH = 4;

/* How far past the water's edge the corridor reaches, as a fraction of the
 * half width, for the wet bank the shader paints. */
export const BANK = 0.35;

const finite = (v) => Number.isFinite(v);

function readPoint(p) {
  if (Array.isArray(p) && finite(p[0]) && finite(p[1])) {
    return { x: p[0], z: p[1], w: finite(p[2]) ? p[2] : undefined };
  }
  if (p && finite(p.x) && finite(p.z)) {
    return { x: p.x, z: p.z, w: finite(p.w) ? p.w : finite(p.width) ? p.width : undefined };
  }
  return null;
}

function readRiver(raw, k) {
  const line = raw.points ?? raw.line ?? raw.coords ?? raw.coordinates;
  if (!Array.isArray(line)) {
    return { bad: 'river without points' };
  }
  const pts = line.map(readPoint);
  if (pts.some((p) => p === null)) {
    return { bad: 'river point not [x, z]' };
  }
  if (pts.length < 2) {
    return { bad: 'river of one point' };
  }
  const widths = raw.width ?? raw.widths;
  for (let i = 0; i < pts.length; i += 1) {
    let w = pts[i].w;
    if (w === undefined) {
      w = Array.isArray(widths) ? widths[i] : widths;
    }
    pts[i].w = finite(w) && w > 0 ? Math.min(w, 400) : DEFAULT_WIDTH;
  }
  return { name: typeof raw.name === 'string' ? raw.name : null, id: raw.id ?? `river#${k}`, points: pts };
}

function readRing(ring) {
  if (!Array.isArray(ring)) {
    return null;
  }
  const pts = ring.map(readPoint);
  if (pts.length < 3 || pts.some((p) => p === null)) {
    return null;
  }
  const a = pts[0];
  const b = pts[pts.length - 1];
  if (a.x === b.x && a.z === b.z) {
    pts.pop();
  }
  return pts.map((p) => ({ x: p.x, z: p.z }));
}

function readLake(raw, k) {
  const y = raw.y ?? raw.surface ?? raw.surfaceY ?? raw.elevation;
  if (!finite(y)) {
    return { bad: 'lake without a surface y' };
  }
  /* `rings` is GeoJSON's shape, the outline then its holes, which is what
   * the data pipeline writes; `ring` and `holes` are accepted too. */
  const rings = Array.isArray(raw.rings) ? raw.rings : null;
  const outer = readRing(rings ? rings[0] : (raw.ring ?? raw.polygon ?? raw.outer ?? raw.points));
  if (!outer) {
    return { bad: 'lake ring unreadable' };
  }
  const holes = (rings ? rings.slice(1) : (raw.holes ?? [])).map(readRing).filter(Boolean);
  let x0 = Infinity; let z0 = Infinity; let x1 = -Infinity; let z1 = -Infinity;
  for (const p of outer) {
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
  }
  return { name: typeof raw.name === 'string' ? raw.name : null, id: raw.id ?? `lake#${k}`, y, outer, holes, box: { x0, z0, x1, z1 }, area: Math.abs(ringArea(outer)) };
}

export function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    a += (ring[j].x - ring[i].x) * (ring[j].z + ring[i].z);
  }
  return a / 2;
}

/* Even odd point in ring. */
export function inRing(ring, x, z) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function inLake(lake, x, z) {
  const b = lake.box;
  if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1 || !inRing(lake.outer, x, z)) {
    return false;
  }
  return !lake.holes.some((h) => inRing(h, x, z));
}

/*
 * The whole file: `{ rivers: [...], lakes: [...] }`. Rivers are bucketed by
 * every level 0 region their corridor touches, since the water of a region
 * is built when that region is.
 */
export function readHydro(json) {
  if (!json || typeof json !== 'object') {
    throw new Error('hydro.json: expected { rivers, lakes }');
  }
  const refused = {};
  const refuse = (why) => { refused[why] = (refused[why] ?? 0) + 1; };
  const rivers = [];
  for (const [k, raw] of (json.rivers ?? []).entries()) {
    const r = readRiver(raw ?? {}, k);
    if (r.bad) {
      refuse(r.bad);
    } else {
      rivers.push(r);
    }
  }
  const lakes = [];
  for (const [k, raw] of (json.lakes ?? []).entries()) {
    const l = readLake(raw ?? {}, k);
    if (l.bad) {
      refuse(l.bad);
    } else {
      lakes.push(l);
    }
  }
  const regions = new Map();
  let riverKm = 0;
  for (const r of rivers) {
    const keys = new Set();
    for (let i = 1; i < r.points.length; i += 1) {
      const a = r.points[i - 1];
      const b = r.points[i];
      riverKm += Math.hypot(b.x - a.x, b.z - a.z) / 1000;
      const reach = Math.max(a.w, b.w) * (0.5 + BANK) + 20;
      for (const [x, z] of [[a.x - reach, a.z - reach], [a.x + reach, a.z + reach], [b.x - reach, b.z - reach], [b.x + reach, b.z + reach], [a.x - reach, a.z + reach], [a.x + reach, a.z - reach]]) {
        keys.add(regionOf(Math.max(-EXTENT, Math.min(EXTENT - 1e-6, x)), Math.max(-EXTENT, Math.min(EXTENT - 1e-6, z))).key);
      }
    }
    for (const key of keys) {
      if (!regions.has(key)) {
        regions.set(key, []);
      }
      regions.get(key).push(r);
    }
  }
  return {
    rivers,
    lakes,
    regions,
    counts: {
      rivers: rivers.length,
      riverKm: Math.round(riverKm * 10) / 10,
      lakes: lakes.length,
      lakeKm2: Math.round(lakes.reduce((s, l) => s + l.area, 0) / 1e4) / 100,
      refused,
    },
  };
}

/*
 * The corridor of a set of rivers inside a box, on a grid of `step` metres:
 * every cell within the water plus its bank, and a function giving each grid
 * node its signed distance across the nearest channel as a fraction of the
 * half width (the sign says which bank) and its distance along the river,
 * for the flow streaks. Signed rather than absolute because a signed distance
 * is linear across a straight channel, so the GPU's interpolation over a
 * cell reproduces it and the bank the shader cuts is straight.
 */
export function riverCorridor(rivers, box, step) {
  const set = new CellSet(step);
  const segs = [];
  for (const r of rivers) {
    let along = 0;
    for (let i = 1; i < r.points.length; i += 1) {
      const a = r.points[i - 1];
      const b = r.points[i];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 1e-6) {
        continue;
      }
      const reach = (Math.max(a.w, b.w) / 2) * (1 + BANK) + step;
      const sx0 = Math.min(a.x, b.x) - reach;
      const sx1 = Math.max(a.x, b.x) + reach;
      const sz0 = Math.min(a.z, b.z) - reach;
      const sz1 = Math.max(a.z, b.z) + reach;
      const seg = { a, b, len, along, river: r, box: [sx0, sz0, sx1, sz1] };
      along += len;
      if (sx1 < box.x0 || sx0 > box.x1 || sz1 < box.z0 || sz0 > box.z1) {
        continue;
      }
      segs.push(seg);
      /* Cells whose centre is within reach of the segment, clipped to the
       * region so neighbouring regions do not both draw a cell. */
      const i0 = set.index(Math.max(sx0, box.x0));
      const i1 = set.index(Math.min(sx1, box.x1 - 1e-6));
      const j0 = set.index(Math.max(sz0, box.z0));
      const j1 = set.index(Math.min(sz1, box.z1 - 1e-6));
      for (let i = i0; i <= i1; i += 1) {
        for (let j = j0; j <= j1; j += 1) {
          const cx = set.coord(i) + step / 2;
          const cz = set.coord(j) + step / 2;
          const d = segDistance(seg, cx, cz);
          if (Math.abs(d.d) <= d.w / 2 * (1 + BANK) + step * 0.75) {
            set.add(i, j);
          }
        }
      }
    }
  }
  /* A tiny index of the segments by 100 m bins, so a node looks at a few
   * segments and not all of them. */
  const BIN = 100;
  const bins = new Map();
  for (const s of segs) {
    for (let bi = Math.floor(s.box[0] / BIN); bi <= Math.floor(s.box[2] / BIN); bi += 1) {
      for (let bj = Math.floor(s.box[1] / BIN); bj <= Math.floor(s.box[3] / BIN); bj += 1) {
        const key = `${bi},${bj}`;
        if (!bins.has(key)) {
          bins.set(key, []);
        }
        bins.get(key).push(s);
      }
    }
  }
  const across = (x, z) => {
    const near = bins.get(`${Math.floor(x / BIN)},${Math.floor(z / BIN)}`) ?? [];
    let best = null;
    for (const s of near) {
      const d = segDistance(s, x, z);
      const edge = Math.abs(d.d) - d.w / 2;
      if (!best || edge < best.edge) {
        best = {
          edge, v: d.d / (d.w / 2), along: s.along + d.t * s.len, river: s.river, w: d.w,
          dx: (s.b.x - s.a.x) / s.len, dz: (s.b.z - s.a.z) / s.len,
        };
      }
    }
    return best;
  };
  return { set, across, segments: segs.length };
}

/* Signed distance from a segment, interpolated width, and the parameter. */
function segDistance(s, x, z) {
  const dx = s.b.x - s.a.x;
  const dz = s.b.z - s.a.z;
  let t = ((x - s.a.x) * dx + (z - s.a.z) * dz) / (s.len * s.len);
  t = Math.max(0, Math.min(1, t));
  const px = s.a.x + dx * t;
  const pz = s.a.z + dz * t;
  const side = Math.sign(dx * (z - s.a.z) - dz * (x - s.a.x)) || 1;
  return { d: side * Math.hypot(x - px, z - pz), w: s.a.w + (s.b.w - s.a.w) * t, t };
}

