/*
 * chunks.js: one quadtree node's mesh, and the ground's paint.
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
 * scripts/yellowstone-check.js samples every drawn border to prove the
 * depth is enough.
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
import { Y0, LANDMARKS } from './frame.js';
import { fbm, noise2, smoothstep } from './noise.js';

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
 * THE PAINT, as five grounds mixed on height, slope and noise: meadow on
 * the flat valley floors, lodgepole forest over the plateau in a mosaic of
 * old burns and regrowth, rock on the steep faces and above the tree line,
 * snow on the high ground that will hold it, and pale sinter on the
 * geyser basins. Every input is world position and the level's own slope,
 * so the same place is the same colour at every level, give or take the
 * slope a coarse level smooths away.
 */
const SRGB = (hex) => new THREE.Color(hex);
const MEADOW = SRGB(0xa3ad5c);
const SAGE = SRGB(0x9aa27a);
const FOREST = SRGB(0x2f4d2a);
const REGROWTH = SRGB(0x587440);
const ROCK = SRGB(0x847b70);
const SNOW = SRGB(0xeef2f6);
const SINTER = SRGB(0xd9cfb4);

/* Where the ground is sinter: the geyser basins and Mammoth's terraces,
 * as discs round the contract's landmarks, broken up by noise. The thermal
 * features part draws the features themselves; this is only the pale
 * ground they stand on, so a basin reads from altitude. */
const BASINS = [
  { x: LANDMARKS.oldFaithful.x, z: LANDMARKS.oldFaithful.z - 250, r: 520 },
  { x: LANDMARKS.grandPrismatic.x, z: LANDMARKS.grandPrismatic.z, r: 480 },
  { x: -27700, z: 5200, r: 700 },
  { x: LANDMARKS.mammoth.x, z: LANDMARKS.mammoth.z, r: 400 },
];

function sinterAt(x, z) {
  let s = 0;
  for (const b of BASINS) {
    const d = Math.hypot(x - b.x, z - b.z) / b.r;
    if (d < 1.2) {
      s = Math.max(s, 1 - smoothstep(0.55, 1.1, d + 0.35 * (noise2(x / 180, z / 180) - 0.5)));
    }
  }
  return s;
}

const c = new THREE.Color();
const mix = (col, t) => {
  c.r += (col.r - c.r) * t;
  c.g += (col.g - c.g) * t;
  c.b += (col.b - c.b) * t;
};

/*
 * Linear rgb of the ground at a point, into out[k..k+2]. `cover` is the
 * land cover (landcover.js) when the data has it, and `footprint` the
 * metres one vertex stands for, which is how wide a patch of it is
 * averaged. Without land cover the grounds are guessed from height and
 * slope alone, which is what the synthetic tiles get, and the apron past
 * where the land cover reaches.
 */
export function paint(x, z, y, slope, out, k, cover, footprint) {
  const asl = y + Y0;
  const grain = fbm(x / 1400, z / 1400, 3);
  const fine = noise2(x / 90, z / 90);
  if (cover && cover.covers(x, z)) {
    const barren = cover.colourAt(x, z, footprint, lc);
    c.setRGB(lc[0], lc[1], lc[2]);
    /* Barren is sinter on the flat and bare rock on a slope or a peak. */
    mix(ROCK, barren * Math.max(smoothstep(0.3, 0.55, slope), smoothstep(2650, 2850, asl)));
  } else {
    guess(x, z, asl, slope, grain, fine);
  }
  /* Rock on faces too steep for anything, whatever the cover says. */
  mix(ROCK, smoothstep(0.75, 1.1, slope + 0.2 * (fine - 0.5)));
  /* Snow where the ground is high and will hold it. */
  const snow = smoothstep(3150, 3300, asl + 180 * (grain - 0.5)) * (1 - smoothstep(0.9, 1.3, slope));
  mix(SNOW, snow);
  /* A little tone so a forest a kilometre wide is not one flat colour. */
  const tone = 0.92 + 0.16 * fine;
  out[k] = c.r * tone;
  out[k + 1] = c.g * tone;
  out[k + 2] = c.b * tone;
}

const lc = [0, 0, 0];

function guess(x, z, asl, slope, grain, fine) {
  c.copy(FOREST);
  /* The 1988 burns and what grew back: a mosaic kilometres across. */
  mix(REGROWTH, smoothstep(0.52, 0.66, grain) * 0.85);
  /* Meadow in patches on flat low ground, the way the valley floors open
   * out of the forest; sage in the dry north. */
  const flat = 1 - smoothstep(0.035, 0.11, slope + 0.03 * (fine - 0.5));
  const opening = smoothstep(0.5, 0.64, fbm(x / 2600 + 5.1, z / 2600 - 2.7, 3));
  mix(MEADOW, flat * opening * (1 - smoothstep(2500, 2750, asl + 120 * grain)));
  mix(SAGE, 1 - smoothstep(1950, 2150, asl + 80 * fine));
  mix(ROCK, smoothstep(2950, 3100, asl + 150 * (grain - 0.5)));
  const sinter = sinterAt(x, z);
  if (sinter > 0) {
    mix(SINTER, sinter * flat);
  }
}

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
 * once the last row is in, else null. A chunk is a couple of milliseconds
 * of paint on this machine and a frame's ration is three, so a build that
 * could not be split would be the hitch the ration exists to prevent.
 *
 * Positions are local to the chunk's min corner, which the mesh is placed
 * at, so a vertex 50 km out keeps millimetre precision in float32.
 */
export function chunkJob({ nx, nz, cell, x0, z0, sample, rim, cover }) {
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
  /* Linear colour in sixteen bits: eight bands a dark forest green into
   * visible steps, and float would be twice the bytes for nothing. */
  const col = set ? set.col : new Uint16Array(count * 3);
  const rgb = [0, 0, 0];
  const uv = set ? set.uv : new Float32Array(count * 2);
  const du = cell / GRAIN_M;
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
      uv[k * 2] = q * du;
      uv[k * 2 + 1] = r * du;
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
      paint(x0 + q * cell, z0 + r * cell, y, Math.sqrt(sx * sx + sz * sz), rgb, 0, cover, cell);
      col[k * 3] = Math.min(65535, Math.round(rgb[0] * 65535));
      col[k * 3 + 1] = Math.min(65535, Math.round(rgb[1] * 65535));
      col[k * 3 + 2] = Math.min(65535, Math.round(rgb[2] * 65535));
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
      col[b * 3] = col[t * 3];
      col[b * 3 + 1] = col[t * 3 + 1];
      col[b * 3 + 2] = col[t * 3 + 2];
      uv[b * 2] = uv[t * 2];
      uv[b * 2 + 1] = uv[t * 2 + 1] + 0.25;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3, true));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(gridIndex(nx, nz));
    /* Bounds by hand: computeBoundingSphere walks every vertex again, and
     * these are known. The skirt is inside them. */
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(0, bottom, 0), new THREE.Vector3(nx * cell, maxY, nz * cell));
    geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());
    return { geo, minY, maxY, bottom, bytes: pos.byteLength + nrm.byteLength + col.byteLength + uv.byteLength };
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
 * THE GRAIN: a grey texture the vertex paint is multiplied by, tiled every
 * GRAIN_M metres in world space, so ground seen from two metres has
 * texture where the paint is thirty metre vertex colour: blotches a few
 * metres across, dark crowns and shrubs a metre or two wide, and a fine
 * speckle. Every node side is a whole number of tiles (640 m is four), so
 * a chunk's local uv joins its neighbour's without a seam. Its mean is
 * near 0.9, so it darkens the paint a little and evenly once mipmapped.
 */
export const GRAIN_M = 160;

export function groundGrain(anisotropy) {
  const N = 512;
  const c = document.createElement('canvas');
  c.width = N;
  c.height = N;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(N, N);
  /* Periodic value noise: the lattice wraps at `per` cells. */
  const pnoise = (x, y, per) => {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = x - i;
    const fy = y - j;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const h = (a, b) => noise2(((a % per) + per) % per + 0.5, ((b % per) + per) % per + 0.5);
    const a = h(i, j);
    const b = h(i + 1, j);
    const cc = h(i, j + 1);
    const d = h(i + 1, j + 1);
    return a + (b - a) * u + (cc - a) * v + (a - b - cc + d) * u * v;
  };
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      const blot = pnoise((x / N) * 24, (y / N) * 24, 24);
      const crown = pnoise((x / N) * 96 + 3, (y / N) * 96 + 7, 96);
      const fine = pnoise((x / N) * 256, (y / N) * 256, 256);
      let v = 0.9 + 0.12 * (blot - 0.5) + 0.08 * (fine - 0.5);
      v -= 0.2 * smoothstep(0.62, 0.78, crown);
      const k = (y * N + x) * 4;
      const g = Math.round(Math.max(0, Math.min(1, v)) * 255);
      img.data[k] = g;
      img.data[k + 1] = g;
      img.data[k + 2] = g;
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = anisotropy;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

/*
 * Vertex arrays of freed chunks, kept for the next chunk of the same size.
 * Once the mesh cap is reached a chunk is freed for every one built, so
 * without this each build is 130 kB of new typed arrays for the collector,
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
      col: geo.getAttribute('color').array,
      uv: geo.getAttribute('uv').array,
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
