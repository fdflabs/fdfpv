/*
 * rock/index.js: the carved rock on the photographic valley's walls.
 *
 * carve.js says which of the heightfield's cells are rock and what shape
 * the rock is; this draws it. The carved cells' own triangles are taken
 * out of the ground's mesh (trimGround) and a finer skin, lifted and sunk
 * along the wall's normal by carve.js's beds, ledges, lips and flutes,
 * is drawn there instead, in the ground's own material, so the paint's
 * limestone, strata, streaks and snow go on over real faces and ledges.
 * The ground a craft meets is the heightfield still; carve.js keeps the
 * drawn skin within PROUD metres out of it and SUNK metres into it.
 *
 * LEVELS. The skin is cut into chunks of CHUNK cells a side, each drawn
 * at one of four meshes by its distance: a metre and a half grid near,
 * two and a half metres out to a kilometre, then five and fifteen. The
 * two coarse ones are built for every chunk at load and are small; the
 * two fine ones would be tens of megabytes for the whole valley, so
 * they are built as the camera comes near a chunk, three milliseconds a
 * frame, into a pool of slots. A chunk whose fine mesh is not built yet shows
 * the next coarser one. All of it is one BatchedMesh, one draw call and
 * one per shadow map, with each chunk culled to the frustum on its own.
 * Where two chunks at different levels meet, their edges differ by up to
 * the beds' depth, so every edge shared with another carved chunk hangs
 * a skirt into the wall that fills the crack.
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
import { HALF, CELL, CELLS } from '../../alps/terrain.js';
import { carveMask, carveAt, carvedAt, PROUD, SUNK } from './carve.js';

const CHUNK = 4;
const NCH = CELLS / CHUNK;
/* Grid steps per cell, and the distance out to which each level is
 * drawn, in metres from the camera to the chunk's box. */
const LEVELS = [
  { n: 20, reach: 260 },
  { n: 12, reach: 1000 },
  { n: 6, reach: 2600 },
  { n: 2, reach: Infinity },
];
/* The fine levels' slots: enough for every carved chunk inside their
 * reach and HOLD from anywhere over the field, which at most is 32 and
 * 172 (measured on a sixty metre grid of cameras, by plan distance). A
 * chunk that finds no slot free shows its next coarser level. */
const SLOTS = [32, 190];
/* Metres past its reach before a chunk lets a level go. */
const HOLD = 40;
/* How deep a skirt hangs into the wall. */
const SKIRT = SUNK + 1.5;
/* Milliseconds a frame the fine levels may spend building. */
const BUDGET_MS = 3;

/*
 * One chunk at one level: positions, normals, cavity and triangles.
 * Positions are read on the grid with a ring round it, so a normal on
 * the chunk's edge is the same one its neighbour computes.
 */
function chunkMesh(field, mask, chunk, level) {
  const n = LEVELS[level].n;
  const s = CELL / n;
  const G = CHUNK * n + 1;
  const P = G + 2;
  const x0 = -HALF + chunk.ci * CHUNK * CELL;
  const z0 = -HALF + chunk.cj * CHUNK * CELL;
  const pos = new Float32Array(P * P * 3);
  const cavAt = new Float32Array(P * P * 2);
  const done = new Uint8Array(P * P);
  const o = {};
  const at = (gi, gj) => {
    const k = (gj + 1) * P + gi + 1;
    if (!done[k]) {
      const x = x0 + gi * s;
      const z = z0 + gj * s;
      carveAt(field, mask, x, z, level, o);
      pos[k * 3] = x + o.e * o.nx;
      pos[k * 3 + 1] = o.y0 + o.e * o.ny;
      pos[k * 3 + 2] = z + o.e * o.nz;
      cavAt[k * 2] = o.cav;
      cavAt[k * 2 + 1] = o.bare;
      done[k] = 1;
    }
    return k;
  };
  const vid = new Int32Array(G * G).fill(-1);
  const vp = [];
  const vn = [];
  const vc = [];
  const tri = [];
  const normal = (gi, gj, out) => {
    const a = at(gi + 1, gj) * 3;
    const b = at(gi - 1, gj) * 3;
    const c = at(gi, gj + 1) * 3;
    const d = at(gi, gj - 1) * 3;
    const t1x = pos[a] - pos[b];
    const t1y = pos[a + 1] - pos[b + 1];
    const t1z = pos[a + 2] - pos[b + 2];
    const t2x = pos[c] - pos[d];
    const t2y = pos[c + 1] - pos[d + 1];
    const t2z = pos[c + 2] - pos[d + 2];
    const nx = t2y * t1z - t2z * t1y;
    const ny = t2z * t1x - t2x * t1z;
    const nz = t2x * t1y - t2y * t1x;
    const l = Math.hypot(nx, ny, nz) || 1;
    out[0] = nx / l;
    out[1] = ny / l;
    out[2] = nz / l;
    return out;
  };
  const nrm = [0, 0, 0];
  const vertex = (gi, gj) => {
    const g = gj * G + gi;
    if (vid[g] < 0) {
      const k = at(gi, gj);
      vid[g] = vp.length / 3;
      vp.push(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
      normal(gi, gj, nrm);
      vn.push(nrm[0], nrm[1], nrm[2]);
      vc.push(cavAt[k * 2], cavAt[k * 2 + 1]);
    }
    return vid[g];
  };
  /* A skirt down one edge of a cell, from grid point (gi, gj) n steps
   * along (di, dj), hung into the wall and faced both ways. */
  const skirt = (gi, gj, di, dj) => {
    let prevTop = -1;
    let prevLow = -1;
    for (let q = 0; q <= n; q += 1) {
      const top = vertex(gi + di * q, gj + dj * q);
      const low = vp.length / 3;
      vp.push(vp[top * 3] - vn[top * 3] * SKIRT, vp[top * 3 + 1] - vn[top * 3 + 1] * SKIRT, vp[top * 3 + 2] - vn[top * 3 + 2] * SKIRT);
      vn.push(vn[top * 3], vn[top * 3 + 1], vn[top * 3 + 2]);
      vc.push(0.5, 1);
      if (prevTop >= 0) {
        tri.push(prevTop, top, low, prevTop, low, prevLow);
        tri.push(prevTop, low, top, prevTop, prevLow, low);
      }
      prevTop = top;
      prevLow = low;
    }
  };
  for (const [i, j] of chunk.cells) {
    const li = (i - chunk.ci * CHUNK) * n;
    const lj = (j - chunk.cj * CHUNK) * n;
    for (let b = 0; b < n; b += 1) {
      for (let a = 0; a < n; a += 1) {
        /* Split on the diagonal the ground's own quads are, so where the
         * carving is nought the skin lies exactly on the ground. */
        const A = vertex(li + a, lj + b);
        const B = vertex(li + a, lj + b + 1);
        const C = vertex(li + a + 1, lj + b + 1);
        const D = vertex(li + a + 1, lj + b);
        tri.push(A, B, D, B, C, D);
      }
    }
    const inChunk = (ii, jj) => Math.floor(ii / CHUNK) === chunk.ci && Math.floor(jj / CHUNK) === chunk.cj;
    const carved = (ii, jj) => ii >= 0 && jj >= 0 && ii < CELLS && jj < CELLS && mask[jj * CELLS + ii] === 1;
    if (!inChunk(i - 1, j) && carved(i - 1, j)) {
      skirt(li, lj, 0, 1);
    }
    if (!inChunk(i + 1, j) && carved(i + 1, j)) {
      skirt(li + n, lj, 0, 1);
    }
    if (!inChunk(i, j - 1) && carved(i, j - 1)) {
      skirt(li, lj, 1, 0);
    }
    if (!inChunk(i, j + 1) && carved(i, j + 1)) {
      skirt(li, lj + n, 1, 0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vp), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(vn), 3));
  geo.setAttribute('s2Cav', new THREE.BufferAttribute(new Float32Array(vc), 2));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(tri), 1));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/* How many vertices and indices a chunk's mesh has at a level, without
 * building it, to size the fine levels' slots. */
function chunkSize(mask, chunk, level) {
  const n = LEVELS[level].n;
  const G = CHUNK * n + 1;
  const seen = new Uint8Array(G * G);
  let verts = 0;
  let index = 0;
  const carved = (ii, jj) => ii >= 0 && jj >= 0 && ii < CELLS && jj < CELLS && mask[jj * CELLS + ii] === 1;
  for (const [i, j] of chunk.cells) {
    const li = (i - chunk.ci * CHUNK) * n;
    const lj = (j - chunk.cj * CHUNK) * n;
    for (let b = 0; b <= n; b += 1) {
      for (let a = 0; a <= n; a += 1) {
        const g = (lj + b) * G + li + a;
        if (!seen[g]) {
          seen[g] = 1;
          verts += 1;
        }
      }
    }
    index += n * n * 6;
    const edges = [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]].filter(([a, b]) => (Math.floor(a / CHUNK) !== chunk.ci || Math.floor(b / CHUNK) !== chunk.cj) && carved(a, b)).length;
    verts += edges * (n + 1);
    index += edges * n * 12;
  }
  return { verts, index };
}

/*
 * Cells something already stands on: any vertex of the scene's meshes
 * (the paths, the stream, the lift's towers, the fall, the houses) within
 * a few metres of the ground, bar the ground's own and the range's.
 * Carving under them would sink or bury them. Returns whether the cell
 * holding (x, z) is one.
 */
export function occupiedCells(scene, heightAt, skip) {
  const taken = new Uint8Array(CELLS * CELLS);
  const v = new THREE.Vector3();
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || skip.has(o) || !o.geometry.getAttribute('position')) {
      return;
    }
    const p = o.geometry.getAttribute('position');
    for (let k = 0; k < p.count; k += 1) {
      v.fromBufferAttribute(p, k).applyMatrix4(o.matrixWorld);
      const i = Math.floor((v.x + HALF) / CELL);
      const j = Math.floor((v.z + HALF) / CELL);
      if (i < 0 || j < 0 || i >= CELLS || j >= CELLS || taken[j * CELLS + i]) {
        continue;
      }
      const h = heightAt(v.x, v.z);
      if (v.y > h - 12 && v.y < h + 12) {
        taken[j * CELLS + i] = 1;
      }
    }
  });
  return (x, z) => {
    const i = Math.floor((x + HALF) / CELL);
    const j = Math.floor((z + HALF) / CELL);
    return i >= 0 && j >= 0 && i < CELLS && j < CELLS && taken[j * CELLS + i] === 1;
  };
}

/*
 * Take the carved cells out of the ground's mesh. The ground is
 * terrainGeometry's PlaneGeometry laid flat, whose quad (i, j) is the
 * six indices at 6 * (j * CELLS + i).
 */
export function trimGround(geometry, mask) {
  const src = geometry.getIndex().array;
  const out = new (src.constructor)(src.length);
  let w = 0;
  for (let q = 0; q < CELLS * CELLS; q += 1) {
    if (mask[q]) {
      continue;
    }
    for (let k = 0; k < 6; k += 1) {
      out[w + k] = src[q * 6 + k];
    }
    w += 6;
  }
  geometry.setIndex(new THREE.BufferAttribute(out.slice(0, w), 1));
}

/*
 * Build the carved rock. `keep(x, z)` holds ground as it is; `material`
 * is the ground's material made for the skin (ground.js, carved: 1).
 * Returns the mesh, update(camera) for every frame, carved(x, z) for
 * what must not stand on the old ground there, the mask, and stats.
 */
export function buildCliffs({ field, keep, material }) {
  const t0 = performance.now();
  const mask = carveMask(field, keep);
  const chunks = [];
  const byChunk = new Map();
  for (let j = 0; j < CELLS; j += 1) {
    for (let i = 0; i < CELLS; i += 1) {
      if (!mask[j * CELLS + i]) {
        continue;
      }
      const key = Math.floor(j / CHUNK) * NCH + Math.floor(i / CHUNK);
      let c = byChunk.get(key);
      if (!c) {
        c = { ci: Math.floor(i / CHUNK), cj: Math.floor(j / CHUNK), cells: [], box: new THREE.Box3(), ids: [-1, -1, -1, -1], shown: -1 };
        byChunk.set(key, c);
        chunks.push(c);
      }
      c.cells.push([i, j]);
    }
  }
  /* The coarse levels now; the fine ones' slots sized for the largest
   * chunk at each. */
  const coarse = [];
  let verts = 0;
  let index = 0;
  for (const c of chunks) {
    for (const level of [2, 3]) {
      const g = chunkMesh(field, mask, c, level);
      coarse.push([c, level, g]);
      verts += g.getAttribute('position').count;
      index += g.getIndex().count;
      c.box.union(g.boundingBox);
    }
    c.box.expandByScalar(PROUD + SKIRT);
  }
  const slotSize = [0, 1].map((level) => chunks.reduce((m, c) => {
    const z = chunkSize(mask, c, level);
    return { verts: Math.max(m.verts, z.verts), index: Math.max(m.index, z.index) };
  }, { verts: 0, index: 0 }));
  verts += SLOTS[0] * slotSize[0].verts + SLOTS[1] * slotSize[1].verts;
  index += SLOTS[0] * slotSize[0].index + SLOTS[1] * slotSize[1].index;
  const mesh = new THREE.BatchedMesh(coarse.length + SLOTS[0] + SLOTS[1], verts, index, material);
  mesh.name = 'swiss2-cliffs';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  /* The batch's box is the whole valley's: the chunks cull themselves. */
  mesh.frustumCulled = false;
  for (const [c, level, g] of coarse) {
    c.ids[level] = mesh.addGeometry(g);
    mesh.setVisibleAt(c.ids[level], false);
    g.dispose();
  }
  /* The fine levels' slots, each reserved at the largest size and empty,
   * with where its range starts kept so a refill uploads only its own. */
  const slots = [[], []];
  const empty = new THREE.BufferGeometry();
  empty.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
  empty.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(3), 3));
  empty.setAttribute('s2Cav', new THREE.BufferAttribute(new Float32Array(2), 2));
  empty.setIndex(new THREE.BufferAttribute(new Uint32Array(3), 1));
  let vStart = verts - SLOTS[0] * slotSize[0].verts - SLOTS[1] * slotSize[1].verts;
  let iStart = index - SLOTS[0] * slotSize[0].index - SLOTS[1] * slotSize[1].index;
  for (const level of [0, 1]) {
    for (let k = 0; k < SLOTS[level]; k += 1) {
      const id = mesh.addGeometry(empty, slotSize[level].verts, slotSize[level].index);
      mesh.setVisibleAt(id, false);
      slots[level].push({ id, chunk: null, vStart, iStart, level });
      vStart += slotSize[level].verts;
      iStart += slotSize[level].index;
    }
  }
  empty.dispose();

  /* For the checks that walk the page: whether a point's ground is
   * carved, and by how much the drawn rock may stand out of it there. */
  mesh.userData.carved = (x, z) => carvedAt(mask, x, z);
  mesh.userData.proud = PROUD;
  const cam = new THREE.Vector3();
  const dist = new Map();
  const fill = (slot, chunk) => {
    const g = chunkMesh(field, mask, chunk, slot.level);
    mesh.setGeometryAt(slot.id, g);
    /* setGeometryAt marks the whole batch for upload; the slot's own
     * ranges are all that changed. */
    const size = slotSize[slot.level];
    for (const name of ['position', 'normal', 's2Cav']) {
      const a = mesh.geometry.getAttribute(name);
      a.addUpdateRange(slot.vStart * a.itemSize, size.verts * a.itemSize);
    }
    mesh.geometry.getIndex().addUpdateRange(slot.iStart, size.index);
    g.dispose();
    if (slot.chunk) {
      slot.chunk.ids[slot.level] = -1;
    }
    slot.chunk = chunk;
    chunk.ids[slot.level] = slot.id;
  };
  const want = (c, level) => dist.get(c) < LEVELS[level].reach + (c.ids[level] >= 0 ? HOLD : 0);
  let pending = true;
  const last = new THREE.Vector3(Infinity, 0, 0);
  const stats = {
    cells: mask.reduce((a, b) => a + b, 0), chunks: chunks.length, slotSize, mostFine: [0, 0], buildMs: Math.round(performance.now() - t0),
  };

  function update(camera) {
    camera.getWorldPosition(cam);
    if (!pending && cam.distanceToSquared(last) < 4) {
      return;
    }
    last.copy(cam);
    for (const c of chunks) {
      dist.set(c, c.box.distanceToPoint(cam));
    }
    /* Build the nearest missing fine meshes first, into a free slot or
     * one a chunk out of reach holds. */
    const start = performance.now();
    pending = false;
    for (const level of [1, 0]) {
      const need = chunks.filter((c) => c.ids[level] < 0 && want(c, level)).sort((a, b) => dist.get(a) - dist.get(b));
      const held = slots[level].filter((s) => s.chunk && want(s.chunk, level)).length;
      stats.mostFine[level] = Math.max(stats.mostFine[level], held + need.length);
      for (const c of need) {
        if (performance.now() - start > BUDGET_MS) {
          pending = true;
          break;
        }
        const slot = slots[level].find((s) => !s.chunk || !want(s.chunk, level));
        if (!slot) {
          break;
        }
        fill(slot, c);
      }
    }
    for (const c of chunks) {
      const d = dist.get(c);
      let show = 3;
      for (let level = 0; level < 3; level += 1) {
        if (c.ids[level] >= 0 && d < LEVELS[level].reach + (c.shown === level ? HOLD : 0)) {
          show = level;
          break;
        }
      }
      if (show !== c.shown) {
        if (c.shown >= 0 && c.ids[c.shown] >= 0) {
          mesh.setVisibleAt(c.ids[c.shown], false);
        }
        mesh.setVisibleAt(c.ids[show], true);
        c.shown = show;
      }
    }
    /* A slot refilled for another chunk may still be marked shown. */
    for (const level of [0, 1]) {
      for (const s of slots[level]) {
        mesh.setVisibleAt(s.id, !!s.chunk && s.chunk.shown === level);
      }
    }
  }

  return {
    mesh,
    mask,
    update,
    stats,
    carved: (x, z) => carvedAt(mask, x, z),
    dispose() {
      mesh.dispose();
      material.dispose();
    },
  };
}
