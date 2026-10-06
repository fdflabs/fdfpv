/*
 * chunks.js: one quadtree node's mesh.
 *
 * A chunk is 64 cells of its own level on a side, every sample drawn, so
 * the triangles on screen are the level's grid itself and the ground query
 * can read them back exactly (see engine.js). Cells are split on the
 * diagonal from (c, r + 1) to (c + 1, r), the one PlaneGeometry laid flat
 * uses and src/maps/alps/terrain.js reads, so this terrain agrees with the
 * rest of the project about which way a cell folds.
 *
 * Cracks between chunks of different levels are closed with skirts: every
 * edge hangs a vertical strip, facing out, down to a depth the whole
 * chunk's relief below its lowest sample. A neighbour one or four levels
 * coarser meets the edge somewhere between the two, and the higher side's
 * skirt covers the gap. Skirts and not stitched edges because a stitched
 * edge moves the fine chunk's border vertices onto the coarse line, which
 * changes the ground under a craft at a chunk border depending on what the
 * neighbour happens to be drawn at; a skirt changes nothing on the surface.
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

/* Cells per chunk side. 64 keeps a chunk to one draw of 8 192 triangles
 * plus its skirts, and makes four chunks of a level exactly one tile. */
export const CHUNK = 64;

/* The skirt hangs this far below the chunk's lowest sample at least, and
 * further on relief: the gap to a coarser neighbour is bounded by how far
 * the ground moves inside one coarse cell, which is bounded by the chunk's
 * own relief. */
const SKIRT_MIN = 40;
/* Extra depth on the extent's edge, past how far apron.js can tuck the
 * apron under the border. */
const RIM_SKIRT = 1200;

/*
 * Index buffers, shared by every chunk of the same clipped size: a full
 * chunk and the few partial shapes along the extent's far edges. Shared
 * so the GPU holds one copy; three.js uploads an attribute once however
 * many geometries reference it.
 */
const indexCache = new Map();

function gridIndex(nx, nz) {
  const key = `${nx}x${nz}`;
  const hit = indexCache.get(key);
  if (hit) {
    return hit;
  }
  const row = nx + 1;
  const grid = row * (nz + 1);
  const perimeter = 2 * (nx + nz);
  const idx = [];
  for (let r = 0; r < nz; r += 1) {
    for (let q = 0; q < nx; q += 1) {
      const a = r * row + q;
      const b = a + row;
      const d = a + 1;
      const e = b + 1;
      idx.push(a, b, d, b, e, d);
    }
  }
  /* The skirt: the perimeter walked so that (dz, 0, -dx) of the walk
   * points out of the chunk, which puts every skirt face's front outward.
   * Bottom vertex k of the walk is grid + k. */
  const walk = perimeterWalk(nx, nz);
  for (let k = 0; k < perimeter; k += 1) {
    const t0 = walk[k];
    const t1 = walk[(k + 1) % perimeter];
    const b0 = grid + k;
    const b1 = grid + ((k + 1) % perimeter);
    idx.push(t0, t1, b0, t1, b1, b0);
  }
  const attr = new THREE.BufferAttribute(
    grid + perimeter > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1,
  );
  indexCache.set(key, attr);
  return attr;
}

/* The grid vertex indices round the edge: north edge east, east edge
 * south, south edge west, west edge north. */
function perimeterWalk(nx, nz) {
  const row = nx + 1;
  const out = [];
  for (let q = 0; q < nx; q += 1) {
    out.push(q);
  }
  for (let r = 0; r < nz; r += 1) {
    out.push(r * row + nx);
  }
  for (let q = nx; q > 0; q -= 1) {
    out.push(nz * row + q);
  }
  for (let r = nz; r > 0; r -= 1) {
    out.push(r * row);
  }
  return out;
}

/*
 * Build a chunk's geometry, a few rows at a time. `sample(c, r)` is the
 * level's height at the chunk's local sample (c, r), valid for c in
 * [-1, nx + 1] and r in [-1, nz + 1] (one beyond for the normals; the
 * caller clamps where no data is loaded). It is read once into a local
 * array when the job starts.
 *
 * Returns a job: step(deadline) fills rows until performance.now() passes
 * the deadline and returns the finished { geo, minY, maxY, bottom, bytes }
 * once the last row is in, else null. A frame's ration is a couple of
 * milliseconds, so a build that could not be split would be the hitch the
 * ration exists to prevent.
 *
 * Positions and normals only: the material that draws the ground shades
 * it from world position (src/maps/itaipu/look/ground.js), so a vertex
 * colour or a uv would be bytes nothing reads.
 *
 * Positions are local to the chunk's min corner, which the mesh is placed
 * at, so a vertex 50 km out keeps millimetre precision in float32.
 */
export function chunkJob({ nx, nz, cell, sample, rim }) {
  const row = nx + 1;
  const grid = row * (nz + 1);
  const perimeter = 2 * (nx + nz);
  const count = grid + perimeter;
  const hw = nx + 3;
  const heights = scratch(hw * (nz + 3));
  for (let r = -1; r <= nz + 1; r += 1) {
    for (let q = -1; q <= nx + 1; q += 1) {
      heights[(r + 1) * hw + q + 1] = sample(q, r);
    }
  }
  const h = (q, r) => heights[(r + 1) * hw + q + 1];
  const spare = pool.get(count);
  const set = spare && spare.length ? spare.pop() : null;
  const pos = set ? set.pos : new Float32Array(count * 3);
  const nrm = set ? set.nrm : new Int8Array(count * 3);
  const inv2 = 1 / (2 * cell);
  let minY = Infinity;
  let maxY = -Infinity;
  let next = 0;

  function rowOf(r) {
    for (let q = 0; q <= nx; q += 1) {
      const k = r * row + q;
      const y = h(q, r);
      pos[k * 3] = q * cell;
      pos[k * 3 + 1] = y;
      pos[k * 3 + 2] = r * cell;
      if (y < minY) {
        minY = y;
      }
      if (y > maxY) {
        maxY = y;
      }
      const sx = (h(q + 1, r) - h(q - 1, r)) * inv2;
      const sz = (h(q, r + 1) - h(q, r - 1)) * inv2;
      const len = Math.sqrt(sx * sx + 1 + sz * sz);
      nrm[k * 3] = Math.round((-sx / len) * 127);
      nrm[k * 3 + 1] = Math.round((1 / len) * 127);
      nrm[k * 3 + 2] = Math.round((-sz / len) * 127);
    }
  }

  function finish() {
    /* A chunk on the extent's edge meets the apron there, which is grown
     * from the coarsest level and tucked well under it (apron.js); its
     * skirt goes deep enough that the step down to it is always closed. */
    const bottom = minY - Math.max(SKIRT_MIN, maxY - minY) - (rim ? RIM_SKIRT : 0);
    const walk = perimeterWalk(nx, nz);
    for (let k = 0; k < perimeter; k += 1) {
      const t = walk[k];
      const b = grid + k;
      pos[b * 3] = pos[t * 3];
      pos[b * 3 + 1] = bottom;
      pos[b * 3 + 2] = pos[t * 3 + 2];
      nrm[b * 3] = nrm[t * 3];
      nrm[b * 3 + 1] = nrm[t * 3 + 1];
      nrm[b * 3 + 2] = nrm[t * 3 + 2];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3, true));
    geo.setIndex(gridIndex(nx, nz));
    /* Bounds by hand: computeBoundingSphere walks every vertex again, and
     * these are known. The skirt is inside them. */
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(0, bottom, 0), new THREE.Vector3(nx * cell, maxY, nz * cell));
    geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());
    return { geo, minY, maxY, bottom, bytes: pos.byteLength + nrm.byteLength };
  }

  return {
    /* At least one row a call, so a late frame still makes progress. */
    step(deadline) {
      for (let done = 0; next <= nz; next += 1, done += 1) {
        if (done > 0 && performance.now() >= deadline) {
          return null;
        }
        rowOf(next);
      }
      return finish();
    },
  };
}

/*
 * Vertex arrays of freed chunks, kept for the next chunk of the same size.
 * Once the mesh cap is reached a chunk is freed for every one built, so
 * without this each build is 67 kB of new typed arrays for the collector,
 * and its pauses land in whatever frame it picks.
 */
const pool = new Map();
const POOL_MAX = 24;

export function recycleChunk(geo) {
  const pos = geo.getAttribute('position');
  if (!pos) {
    return;
  }
  const count = pos.count;
  let list = pool.get(count);
  if (!list) {
    list = [];
    pool.set(count, list);
  }
  if (list.length < POOL_MAX) {
    list.push({
      pos: pos.array,
      nrm: geo.getAttribute('normal').array,
    });
  }
}

/* One heights buffer, reused: only one chunk job is ever in hand. */
let scratchBuf = new Float64Array(0);
function scratch(n) {
  if (scratchBuf.length < n) {
    scratchBuf = new Float64Array(n);
  }
  return scratchBuf;
}

/* Triangles a chunk of this clipped size draws, skirts included. */
export function chunkTriangles(nx, nz) {
  return 2 * nx * nz + 4 * (nx + nz);
}

/* Free the shared index buffers: the last step of the map's dispose. */
export function disposeChunkIndices() {
  indexCache.clear();
  pool.clear();
  scratchBuf = new Float64Array(0);
}
