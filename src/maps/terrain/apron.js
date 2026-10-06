/*
 * apron.js: the country beyond the map's square.
 *
 * The data draws nothing outside the extent, and from altitude a pilot
 * sees tens of kilometres. Past the edge there would be the scene
 * background under the horizon, a pale void. So one coarse ring of ground
 * stands outside, the frame's apron.depth deep, grown from the coarsest
 * level's own border heights out into invented country, and ground a
 * craft can land on rather than a hole to fall through.
 *
 * Its inner edge sits 200 m inside the extent and well below the border:
 * a level's last whole cell need not reach the edge exactly, so the ring
 * tucks under the terrain rather than leaving a strip, and the terrain
 * chunks' own skirts close the step down to it.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';
import { fbm, smoothstep } from './noise.js';

/* How far inside the extent's edge the apron starts. */
const APRON_TUCK_IN = 200;
/* How far under the border the inner edge is tucked: under the lowest
 * coarse sample within two cells either way, by this much and by the
 * relief there, so a finer level's edge, which can dip between coarse
 * samples, stays above it. The chunks on the edge hang their skirts deep
 * enough to meet it (RIM_SKIRT in chunks.js). */
const TUCK = 60;
const TUCK_REACH = 1920;

/* Grid lines, the same along x and z: every 2 km across the inside, so the
 * bands along each edge follow the border, then growing from 1 km at the
 * edge to 6 km far out. */
function lines(inner, outer) {
  const pos = [];
  let d = 0;
  let step = 1000;
  while (inner + d < outer) {
    pos.push(inner + d);
    d += step;
    step = Math.min(6000, step * 1.18);
  }
  pos.push(outer);
  const out = [];
  for (let k = pos.length - 1; k >= 0; k -= 1) {
    out.push(-pos[k]);
  }
  const across = Math.round((2 * inner) / 2000);
  for (let k = 1; k < across; k += 1) {
    out.push(-inner + (k * 2 * inner) / across);
  }
  for (const p of pos) {
    out.push(p);
  }
  return out;
}

/*
 * `border(x, z)` is the terrain's height at the nearest point of the
 * extent's edge, read from the coarsest level. The apron eases from just
 * under it to a rolling upland that the fog takes, at the frame's
 * apron.base and apron.amp. Positions only, as the chunks are (chunks.js
 * chunkJob says why).
 */
export function buildApron(border, material, frame) {
  const HALF = frame.half;
  const APRON_IN = HALF - APRON_TUCK_IN;
  const APRON_OUT = HALF + frame.apron.depth;
  const xs = lines(APRON_IN, APRON_OUT);
  const n = xs.length;
  const h = new Float64Array(n * n);
  for (let r = 0; r < n; r += 1) {
    for (let q = 0; q < n; q += 1) {
      const x = xs[q];
      const z = xs[r];
      const out = Math.max(Math.abs(x), Math.abs(z)) - APRON_IN;
      if (out < 0) {
        continue;
      }
      /* The nearest point of the extent's edge, and the lowest coarse
       * sample along the edge round it. */
      const alongX = Math.abs(z) > Math.abs(x);
      const bx = alongX ? Math.max(-HALF, Math.min(HALF, x)) : Math.sign(x) * HALF;
      const bz = alongX ? Math.sign(z) * HALF : Math.max(-HALF, Math.min(HALF, z));
      let low = Infinity;
      let high = -Infinity;
      for (let k = -4; k <= 4; k += 1) {
        const along = (k * TUCK_REACH) / 4;
        const px = alongX ? Math.max(-HALF, Math.min(HALF, bx + along)) : bx;
        const pz = alongX ? bz : Math.max(-HALF, Math.min(HALF, bz + along));
        const b = border(px, pz);
        low = Math.min(low, b);
        high = Math.max(high, b);
      }
      /* A finer level can dip between coarse samples by about as much as
       * the ground round here moves, so the tuck grows with the relief. */
      const edge = low - TUCK - (high - low);
      const hills = frame.apron.base + frame.apron.amp * (fbm(x / 14000 + 3.3, z / 14000 - 1.2, 4) - 0.35);
      const t = smoothstep(0, 9000, out);
      h[r * n + q] = edge * (1 - t) + hills * t;
    }
  }
  /* Cells wholly inside the inner square are not drawn. */
  const inside = (q, r) => xs[q] >= -APRON_IN && xs[q + 1] <= APRON_IN && xs[r] >= -APRON_IN && xs[r + 1] <= APRON_IN;
  const pos = [];
  const idx = [];
  for (let r = 0; r < n; r += 1) {
    for (let q = 0; q < n; q += 1) {
      pos.push(xs[q], h[r * n + q], xs[r]);
    }
  }
  for (let r = 0; r < n - 1; r += 1) {
    for (let q = 0; q < n - 1; q += 1) {
      if (inside(q, r)) {
        continue;
      }
      const a = r * n + q;
      const b = a + n;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'terrain-apron';
  mesh.receiveShadow = true;
  /* Colour pass only, as the far chunks are (engine.js). */
  mesh.layers.set(1);

  /* The same triangles, read back: the ground outside the extent. */
  const find = (v) => {
    let lo = 0;
    let hi = n - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (xs[mid] <= v) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  };
  const height = (x, z) => {
    const q = find(Math.max(xs[0], Math.min(xs[n - 1], x)));
    const r = find(Math.max(xs[0], Math.min(xs[n - 1], z)));
    const fu = Math.max(0, Math.min(1, (x - xs[q]) / (xs[q + 1] - xs[q])));
    const fv = Math.max(0, Math.min(1, (z - xs[r]) / (xs[r + 1] - xs[r])));
    const h00 = h[r * n + q];
    const h10 = h[r * n + q + 1];
    const h01 = h[(r + 1) * n + q];
    const h11 = h[(r + 1) * n + q + 1];
    if (fu + fv <= 1) {
      return h00 + (h10 - h00) * fu + (h01 - h00) * fv;
    }
    return h11 + (h01 - h11) * (1 - fu) + (h10 - h11) * (1 - fv);
  };
  return { mesh, height, triangles: idx.length / 3 };
}
