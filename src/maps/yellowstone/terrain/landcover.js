/*
 * landcover.js: NLCD land cover, the paint's first answer to "what is
 * the ground here".
 *
 * The data carries NLCD 2021 classes on the level 0 and level 1 grids.
 * The paint reads the level 1 grid (60 m) for every level of the terrain,
 * all 49 tiles of it held from the load (3.2 MB), so a place is the same
 * colour whichever level draws it and a level change never repaints the
 * ground. A coarse level averages the class colours over its own cell's
 * footprint rather than picking one sample, or a 960 m cell would take
 * whatever single 60 m pixel it happened to land on and the far ground
 * would shimmer as the chunks changed.
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
import { HALF, TILE_CELLS, TILE_SAMPLES } from './frame.js';
import { noise2 } from './noise.js';

const CELL = 60;

/* NLCD class to cel paint, sRGB. Barren (31) is the geyser basins' sinter
 * and the peaks' bare rock at once; the paint tells them apart by slope
 * and height afterwards. */
const CLASSES = {
  11: 0x44606a, // open water: what shows if the water is not drawn
  12: 0xeef2f6, // perennial snow and ice
  21: 0x9d9a88, // developed, open space
  22: 0x9a9486, // developed, low
  23: 0x8f8a80, // developed, medium
  24: 0x86827a, // developed, high
  31: 0xd6cdb3, // barren: sinter, scree, bare rock
  41: 0x5f7a3a, // deciduous forest: aspen
  42: 0x2f4d2a, // evergreen forest: lodgepole
  43: 0x44613a, // mixed forest
  52: 0x98a079, // shrub: sagebrush
  71: 0xa7ad5e, // grassland
  81: 0xb0b561, // pasture
  82: 0xb9a867, // crops
  90: 0x4c6a45, // woody wetland
  95: 0x7f9a55, // herbaceous wetland
};
const FALLBACK = 42;

/* Linear rgb per class byte, and whether it is barren. */
const TABLE = new Float32Array(256 * 3);
for (let k = 0; k < 256; k += 1) {
  const c = new THREE.Color(CLASSES[k] ?? CLASSES[FALLBACK]);
  TABLE[k * 3] = c.r;
  TABLE[k * 3 + 1] = c.g;
  TABLE[k * 3 + 2] = c.b;
}

export class LandCover {
  constructor(tiles) {
    /* (i * 256 + j) -> Uint8Array of 257 * 257 classes. */
    this.tiles = tiles;
  }

  /*
   * Load every level 1 land cover tile the manifest lists, or return null
   * when it lists none (the synthetic tiles have none, and the paint falls
   * back to height and slope alone).
   */
  static async load(base, manifest, fetchImpl = (u) => fetch(u)) {
    const paths = Object.keys((manifest && manifest.files) || {}).filter((p) => /^landcover\/1\/\d+_\d+\.bin$/.test(p));
    if (!paths.length) {
      return null;
    }
    const tiles = new Map();
    const queue = [...paths];
    const worker = async () => {
      while (queue.length) {
        const p = queue.shift();
        const res = await fetchImpl(`${base}${p}`);
        if (!res.ok) {
          throw new Error(`yellowstone: land cover ${p}: HTTP ${res.status}`);
        }
        const buf = await res.arrayBuffer();
        if (buf.byteLength !== TILE_SAMPLES * TILE_SAMPLES) {
          throw new Error(`yellowstone: land cover ${p}: ${buf.byteLength} bytes`);
        }
        const [i, j] = p.slice('landcover/1/'.length, -4).split('_').map(Number);
        tiles.set(i * 256 + j, new Uint8Array(buf));
      }
    };
    await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
    return new LandCover(tiles);
  }

  /* The class at a world point, nearest 60 m sample. */
  classAtWorld(x, z) {
    return this.classAt(Math.round((x + HALF) / CELL), Math.round((z + HALF) / CELL));
  }

  classAt(gx, gz) {
    const ti = Math.floor(gx / TILE_CELLS);
    const tj = Math.floor(gz / TILE_CELLS);
    const t = this.tiles.get(ti * 256 + tj);
    if (!t) {
      return FALLBACK;
    }
    return t[(gz - tj * TILE_CELLS) * TILE_SAMPLES + (gx - ti * TILE_CELLS)];
  }

  /*
   * The mean class colour over a square `size` metres across centred on
   * (x, z), into out[0..2]; returns the share of it that is barren.
   * Sampled on the 60 m grid, at most 9 by 9 samples however large the
   * square, which is enough for the average and bounds the cost of a
   * 960 m cell.
   */
  colourAt(x, z, size, out) {
    if (size < CELL * 2) {
      return this.fine(x, z, out);
    }
    const cx = (x + HALF) / CELL;
    const cz = (z + HALF) / CELL;
    const half = Math.max(0, (size / CELL) / 2);
    const n = Math.min(4, Math.floor(half));
    const step = n > 0 ? half / n : 0;
    let r = 0;
    let g = 0;
    let b = 0;
    let barren = 0;
    let count = 0;
    for (let a = -n; a <= n; a += 1) {
      for (let c = -n; c <= n; c += 1) {
        const k = this.classAt(Math.round(cx + a * step), Math.round(cz + c * step));
        r += TABLE[k * 3];
        g += TABLE[k * 3 + 1];
        b += TABLE[k * 3 + 2];
        barren += k === 31 ? 1 : 0;
        count += 1;
      }
    }
    out[0] = r / count;
    out[1] = g / count;
    out[2] = b / count;
    return barren / count;
  }

  /*
   * For the fine levels, whose vertices are closer than the 60 m grid:
   * the four samples round the point blended, read at a point pushed up
   * to 35 m aside by noise, so a forest's edge wanders the way a forest's
   * edge does instead of stepping round the grid's squares.
   */
  fine(x, z, out) {
    const wx = x + 70 * (noise2(x / 55 + 11.3, z / 55 - 4.1) - 0.5);
    const wz = z + 70 * (noise2(x / 55 - 7.7, z / 55 + 2.9) - 0.5);
    const gx = (wx + HALF) / CELL;
    const gz = (wz + HALF) / CELL;
    const i = Math.floor(gx);
    const j = Math.floor(gz);
    const fu = gx - i;
    const fv = gz - j;
    /* Unrolled: this runs for every vertex of every fine chunk, and a
     * loop over little arrays here was garbage the collector then paused
     * a frame to clear. */
    const k00 = this.classAt(i, j);
    const k10 = this.classAt(i + 1, j);
    const k01 = this.classAt(i, j + 1);
    const k11 = this.classAt(i + 1, j + 1);
    const w00 = (1 - fu) * (1 - fv);
    const w10 = fu * (1 - fv);
    const w01 = (1 - fu) * fv;
    const w11 = fu * fv;
    for (let c = 0; c < 3; c += 1) {
      out[c] = TABLE[k00 * 3 + c] * w00 + TABLE[k10 * 3 + c] * w10 + TABLE[k01 * 3 + c] * w01 + TABLE[k11 * 3 + c] * w11;
    }
    return (k00 === 31 ? w00 : 0) + (k10 === 31 ? w10 : 0) + (k01 === 31 ? w01 : 0) + (k11 === 31 ? w11 : 0);
  }
}
