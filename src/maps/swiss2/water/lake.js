/*
 * lake.js: the lake at the valley's southern foot. The mirror it holds
 * up to the valley is the asset library's (library/water/mirror.js).
 *
 * The water is a grid five metres a cell over the basin, kept wherever
 * the ground under it is below the surface or near it, each vertex
 * carrying how deep the water is there (LAKE_Y less the ground), so the
 * shore is wherever the terrain comes up through it and the shallows are
 * as clear as they are shallow. The terrain hides the grid past the
 * shore.
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
import { LAKE_Y } from '../../alps/terrain.js';

const CELL = 5;

/* The lake's water: a grid over the shore's box, cells kept where any
 * corner is under water or within half a metre of it. */
export function lakeGeometry(heightAt, shore) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const p of shore) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    z0 = Math.min(z0, p.z);
    z1 = Math.max(z1, p.z);
  }
  x0 -= 20;
  z0 -= 20;
  x1 += 20;
  z1 += 20;
  const nx = Math.ceil((x1 - x0) / CELL);
  const nz = Math.ceil((z1 - z0) / CELL);
  const depth = new Float32Array((nx + 1) * (nz + 1));
  for (let j = 0; j <= nz; j += 1) {
    for (let i = 0; i <= nx; i += 1) {
      depth[j * (nx + 1) + i] = LAKE_Y - heightAt(x0 + i * CELL, z0 + j * CELL);
    }
  }
  const index = new Int32Array((nx + 1) * (nz + 1)).fill(-1);
  const pos = [];
  const water = [];
  const idx = [];
  const vert = (i, j) => {
    const k = j * (nx + 1) + i;
    if (index[k] < 0) {
      index[k] = pos.length / 3;
      pos.push(x0 + i * CELL, LAKE_Y, z0 + j * CELL);
      water.push(depth[k], 0, 0, 0);
    }
    return index[k];
  };
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const d = Math.max(depth[j * (nx + 1) + i], depth[j * (nx + 1) + i + 1], depth[(j + 1) * (nx + 1) + i], depth[(j + 1) * (nx + 1) + i + 1]);
      if (d < -0.5) {
        continue;
      }
      const a = vert(i, j);
      const b = vert(i + 1, j);
      const c = vert(i, j + 1);
      const e = vert(i + 1, j + 1);
      idx.push(a, c, b, b, c, e);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('aWater', new THREE.Float32BufferAttribute(water, 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  /* The depth on every grid corner, for the dense patch the near water is
   * drawn on when the lake has waves (index.js), which has none of its
   * own. */
  g.userData.depth = { data: depth, w: nx + 1, h: nz + 1, x0, z0, cell: CELL };
  return g;
}
