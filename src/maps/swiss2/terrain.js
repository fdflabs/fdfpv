/*
 * terrain.js: the photographic valley's own walls.
 *
 * The alps' valley (src/maps/alps/terrain.js) is a U whose walls climb
 * from the floor as a smooth ramp, and its thirty metre cells could not
 * draw anything else. Every valley photograph the loop is judged against
 * is Lauterbrunnen, whose walls are not ramps: a flat floor meets pale
 * limestone faces three hundred metres tall, a forested bench runs along
 * the top of them, a second, broken band of cliff stands over the bench,
 * and only then do alpine slopes go on up to the ridge. This file gives
 * swiss2 those walls, and the cel alps keep theirs: alps.js builds this
 * field only for a style that asks for it (style.heightfield).
 *
 * THE SHAPE is the alps' ground plus a wall profile across the valley,
 * added where the walls are and nowhere else:
 *
 *   swissHeight = terrainHeight + reach * rise
 *
 * `rise` is how far the profile (a scree apron, the lower face, the
 * bench, the upper face, the slope above) stands over the alps' own
 * mean wall, eased in to nothing where the alps' wall is already the
 * higher, near the ridge, so the peaks and the ridge are the alps'. It is
 * exactly nought until the scree starts, WALL_FROM metres at the least
 * from the valley's axis, so the floor, the strip, the village, the road,
 * the stream and the lake stand on the ground they always stood on.
 * `reach` holds the alps' ground where something is built on the wall
 * that must not move: the side valley with its lip, pool, fall and
 * stream, the break in the west wall where the hiking path, the gondola
 * and the paragliders are, and the field's ends, where the range beyond
 * meets the field's own edge.
 *
 * THE FIELD. Thirty metre cells cannot draw a face that climbs three
 * hundred metres in forty, so the cells the walls change are split
 * FINE times each way: the field is the alps' grid everywhere, and a
 * finer grid on the cells whose shape the coarse one misses by more than
 * TOL. height() reads the triangles the mesh draws, fine or coarse, as
 * the alps' field does, so the ground a craft meets is the ground it sees
 * (swiss2GroundGeometry draws exactly these). Where a fine cell meets a
 * coarse one the fine cell's edge is held to the coarse edge's straight
 * line, and the coarse cell is drawn as a fan through the same points, so
 * the two share every vertex and there is no crack and no T junction.
 * `data` stays the coarse grid, sampled from the new shape, for what
 * reads the field as a texture (the mountains' shadow, the clouds).
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
import { CELLS, HALF } from '../alps/heights.js';
import { FCELL, FINE, FN } from './field.js';

/* The field itself lives in field.js, so the room server can read it;
 * every importer of this file still finds it here. */
export * from './field.js';

/*
 * The ground's mesh for the field: the coarse cells as the alps draw
 * them, the fine cells at their own grid, and a coarse cell that borders
 * a fine one drawn through the fine one's points on that edge, each of
 * its two triangles as a fan from its centroid (the points lie on the
 * triangle's own edge, so the fan is the same plane). Every cell's
 * triangles are a run of the index, noted in userData.cells so the carved
 * rock can take a cell out (rock/index.js, trimGround).
 */
export function swissGroundGeometry(field) {
  const { data, n, fine, fh } = field;
  const isFine = (i, j) => i >= 0 && j >= 0 && i < CELLS && j < CELLS && fine[j * CELLS + i] === 1;
  const pos = [];
  const vid = new Int32Array(FN * FN).fill(-1);
  const vertex = (I, J) => {
    const k = J * FN + I;
    if (vid[k] < 0) {
      vid[k] = pos.length / 3;
      const y = I % FINE === 0 && J % FINE === 0 ? data[(J / FINE) * n + I / FINE] : fh[k];
      pos.push(-HALF + I * FCELL, y, -HALF + J * FCELL);
    }
    return vid[k];
  };
  const index = [];
  const start = new Uint32Array(CELLS * CELLS);
  const count = new Uint32Array(CELLS * CELLS);
  /* A triangle whose sides may carry fine points: `loop` is its corners
   * in winding order with the points between, and a plain triangle when
   * there are none. */
  const fan = (loop) => {
    if (loop.length === 3) {
      index.push(loop[0], loop[1], loop[2]);
      return;
    }
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const c of [loop[0], loop.corner1, loop.corner2]) {
      cx += pos[c * 3];
      cy += pos[c * 3 + 1];
      cz += pos[c * 3 + 2];
    }
    const cen = pos.length / 3;
    pos.push(cx / 3, cy / 3, cz / 3);
    for (let k = 0; k < loop.length; k += 1) {
      index.push(cen, loop[k], loop[(k + 1) % loop.length]);
    }
  };
  /* The lattice points strictly between two lattice points on a line. */
  const between = (I0, J0, I1, J1) => {
    const out = [];
    const steps = Math.max(Math.abs(I1 - I0), Math.abs(J1 - J0));
    for (let s = 1; s < steps; s += 1) {
      out.push(vertex(I0 + ((I1 - I0) * s) / steps, J0 + ((J1 - J0) * s) / steps));
    }
    return out;
  };
  for (let j = 0; j < CELLS; j += 1) {
    for (let i = 0; i < CELLS; i += 1) {
      const q = j * CELLS + i;
      start[q] = index.length;
      const I = i * FINE;
      const J = j * FINE;
      if (fine[q]) {
        for (let b = 0; b < FINE; b += 1) {
          for (let c = 0; c < FINE; c += 1) {
            const A = vertex(I + c, J + b);
            const B = vertex(I + c, J + b + 1);
            const C = vertex(I + c + 1, J + b + 1);
            const D = vertex(I + c + 1, J + b);
            index.push(A, B, D, B, C, D);
          }
        }
      } else {
        const A = vertex(I, J);
        const B = vertex(I, J + FINE);
        const C = vertex(I + FINE, J + FINE);
        const D = vertex(I + FINE, J);
        const left = isFine(i - 1, j) ? between(I, J, I, J + FINE) : [];
        const top = isFine(i, j - 1) ? between(I + FINE, J, I, J) : [];
        const bottom = isFine(i, j + 1) ? between(I, J + FINE, I + FINE, J + FINE) : [];
        const right = isFine(i + 1, j) ? between(I + FINE, J + FINE, I + FINE, J) : [];
        const t1 = [A, ...left, B, D, ...top];
        t1.corner1 = B;
        t1.corner2 = D;
        fan(t1);
        const t2 = [B, ...bottom, C, ...right, D];
        t2.corner1 = C;
        t2.corner2 = D;
        fan(t2);
      }
      count[q] = index.length - start[q];
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(index), 1));
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  geo.userData.cells = { start, count };
  return geo;
}
