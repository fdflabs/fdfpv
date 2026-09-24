/*
 * stream.js: the stream, from the hanging valley over its ledge to the
 * fall, and from the pool down the side valley and across the floor to
 * the lake.
 *
 * Three ribbons along nature.js's lines (zones.js): above the fall on the
 * headwall's ledge, the torrent from the pool down the trough, and the
 * floor's stream. Each is five vertices across, laid on the ground a
 * hand's breadth up, carrying the distance down its length, the position
 * across it, the slope of its bed and the direction it flows, which is
 * everything the running water material (surface.js) needs to stream its
 * ripples downhill, break white over the steep runs and thin out at the
 * banks.
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

const ACROSS = [-1, -0.5, 0, 0.5, 1];

/* One ribbon along `pts` (in flow order), `width` metres wide, on
 * `groundAt`, `lift` over it. */
export function streamGeometry(pts, width, groundAt, lift = 0.16) {
  /* Resample to two metres, so the torrent's steps are followed. */
  const line = [];
  for (let k = 0; k + 1 < pts.length; k += 1) {
    const a = pts[k];
    const b = pts[k + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2));
    for (let q = 0; q < n; q += 1) {
      line.push({ x: a.x + ((b.x - a.x) * q) / n, z: a.z + ((b.z - a.z) * q) / n });
    }
  }
  line.push(pts[pts.length - 1]);
  const pos = [];
  const water = [];
  const flow = [];
  const idx = [];
  let s = 0;
  const ys = line.map((p) => groundAt(p.x, p.z));
  for (let k = 0; k < line.length; k += 1) {
    const a = line[Math.max(0, k - 1)];
    const b = line[Math.min(line.length - 1, k + 1)];
    const tx = b.x - a.x;
    const tz = b.z - a.z;
    const tl = Math.hypot(tx, tz) || 1;
    if (k > 0) {
      s += Math.hypot(line[k].x - line[k - 1].x, line[k].z - line[k - 1].z);
    }
    /* The bed's fall over ten metres either side, which is what the
     * water feels, not the heightfield's facets. */
    const k0 = Math.max(0, k - 5);
    const k1 = Math.min(line.length - 1, k + 5);
    const run = Math.max(1, (k1 - k0) * 2);
    const slope = Math.max(0, Math.min(0.8, (ys[k0] - ys[k1]) / run));
    const nx = -tz / tl;
    const nz = tx / tl;
    for (const t of ACROSS) {
      const w = (t * width) / 2;
      const x = line[k].x + nx * w;
      const z = line[k].z + nz * w;
      /* Level across at the centre's height, so a higher bank stands
       * out of the water; on a lower bank never more than a hand over
       * the ground, so it does not float off the downhill side. */
      const y = Math.min(ys[k], groundAt(x, z) + 0.25) + lift;
      pos.push(x, y, z);
      water.push(0.15 + 0.55 * (1 - t * t), s, t, slope);
      flow.push(tx / tl, tz / tl);
    }
  }
  const cols = ACROSS.length;
  for (let k = 0; k + 1 < line.length; k += 1) {
    for (let c = 0; c + 1 < cols; c += 1) {
      const a = k * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      idx.push(a, b, d, b, e, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('aWater', new THREE.Float32BufferAttribute(water, 4));
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
