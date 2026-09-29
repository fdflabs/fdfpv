/*
 * reconcile.js: two gaps between the published tiles and what the
 * terrain engine (src/maps/yellowstone/terrain/engine.js) can draw,
 * closed on the loaded tiles before the first chunk is built.
 *
 * 1. THE COARSE LEVELS OVER THE HERO. Package A built level 0 from the
 *    bare DEM with 1 m water beds, and the hero from it with the dam's
 *    edits (the smear taken out, the embankments raised) and 3 m beds,
 *    so the two differ exactly where the dam is. The engine hands a
 *    10 m chunk over to 30 m at 1.3 km from the camera (split 1, a level
 *    0 node's 1920 m side over its fan of three, doubled), which would
 *    make the rockfill and earth dams, the flattened footprints and the
 *    deep beds pop in and out as the camera moves. So every level 0
 *    sample the hero also has is set to the hero's (a 30 m sample is
 *    every third 10 m one, section 14's shared samples), and levels 1 to
 *    3 over that region are the tent filter of the result, Yellowstone's
 *    integer (1 2 1) x (1 2 1) / 16 rounded half up (tools/itaipu/
 *    build_terrain.py tent_down), so every level agrees with the ground
 *    the craft lands on.
 *
 * 2. THE HERO'S FAR EDGES. A level 0 node is 1920 m and splits into nine
 *    640 m hero nodes, and it splits only when all nine have data. The
 *    hero square runs 25 600 m from the ring's low corner, which is not a
 *    whole number of 1920 m nodes (13.3), so the nodes along the hero's
 *    east and south edges straddle it and would never split: the last
 *    640 m of the hero would be drawn at 30 m, with level 0's ground
 *    under the craft there and the hero's under whatever a part placed.
 *    The hero tiles those nodes also need are made here from level 0,
 *    bilinear at 10 m (the hero's own resampling, grids.py upsample_hero),
 *    their shared edges copied from the real hero tiles beside them so
 *    no chunk edge disagrees. The drawn 10 m ground then reaches 6 400 m
 *    east and south, a whole node past the hero square.
 *
 * Both are data the pipeline could publish instead (a pyramid built from
 * the edited hero, and a hero square of whole 7 680 m level 0 tiles), and
 * the day it does these become no-ops that the check reports as such.
 *
 * Pure and synchronous over `get(level, i, j)`, which returns a loaded
 * tile's Uint16Array (modified in place) or null, so scripts/itaipu-check.js
 * runs the same code on the files in Node.
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

import { HERO, TILE_CELLS, TILE_SAMPLES } from '../../yellowstone/terrain/frame.js';

/* Hero samples per level 0 sample, and hero nodes per level 0 node. */
const FAN = 3;
/* Hero tiles per axis a level 0 node's children can reach: a node is
 * 64 cells of 30 m, its children 64 cells of 10 m each. */
const HERO_NODE_CELLS = 64;

/* The tiles holding global sample (gx, gz) of a level: one, or up to four
 * where the sample is on shared tile edges. */
function holders(gx, gz) {
  const is = [Math.floor(gx / TILE_CELLS)];
  const js = [Math.floor(gz / TILE_CELLS)];
  if (gx % TILE_CELLS === 0 && gx > 0) {
    is.push(gx / TILE_CELLS - 1);
  }
  if (gz % TILE_CELLS === 0 && gz > 0) {
    js.push(gz / TILE_CELLS - 1);
  }
  const out = [];
  for (const i of is) {
    for (const j of js) {
      out.push([i, j, (gz - j * TILE_CELLS) * TILE_SAMPLES + (gx - i * TILE_CELLS)]);
    }
  }
  return out;
}

export function sampleAt(get, level, gx, gz) {
  for (const [i, j, k] of holders(gx, gz)) {
    const t = get(level, i, j);
    if (t) {
      return t[k];
    }
  }
  return -1;
}

function setAt(get, level, gx, gz, code) {
  let n = 0;
  for (const [i, j, k] of holders(gx, gz)) {
    const t = get(level, i, j);
    if (t && t[k] !== code) {
      t[k] = code;
      n = 1;
    }
  }
  return n;
}

/* One coarser sample from the finer level's nine round it, in the
 * pipeline's integers. */
export function tentAt(get, level, kx, kz) {
  const w = [1, 2, 1];
  let sum = 0;
  for (let b = -1; b <= 1; b += 1) {
    for (let a = -1; a <= 1; a += 1) {
      const v = sampleAt(get, level - 1, 2 * kx + a, 2 * kz + b);
      if (v < 0) {
        throw new Error(`itaipu terrain: level ${level - 1} sample ${2 * kx + a}, ${2 * kz + b} is not loaded`);
      }
      sum += w[a + 1] * w[b + 1] * v;
    }
  }
  return Math.floor((sum + 8) / 16);
}

/*
 * The hero tiles the edge nodes need and the data does not list, as
 * [i, j], for `heroTiles` the manifest's [i, j] list.
 */
export function heroPads(heroTiles) {
  const have = new Set(heroTiles.map(([i, j]) => `${i}_${j}`));
  const nodeOf = (t) => Math.floor((t * TILE_CELLS) / (HERO_NODE_CELLS * FAN));
  const is = heroTiles.map(([i]) => i);
  const js = heroTiles.map(([, j]) => j);
  /* The level 0 nodes over the listed tiles, and every hero tile under
   * them. */
  const n0 = [nodeOf(Math.min(...is)), nodeOf(Math.max(...is) + 1 - 1e-9)];
  const m0 = [nodeOf(Math.min(...js)), nodeOf(Math.max(...js) + 1 - 1e-9)];
  const tileOf = (node) => Math.floor((node * FAN * HERO_NODE_CELLS) / TILE_CELLS);
  const lastOf = (node) => Math.floor(((node + 1) * FAN * HERO_NODE_CELLS - 1) / TILE_CELLS);
  const out = [];
  for (let j = tileOf(m0[0]); j <= lastOf(m0[1]); j += 1) {
    for (let i = tileOf(n0[0]); i <= lastOf(n0[1]); i += 1) {
      if (!have.has(`${i}_${j}`)) {
        out.push([i, j]);
      }
    }
  }
  return out;
}

/*
 * Close both gaps. `heroTiles` is the manifest's hero list, `coarsest`
 * the frame's. Returns the pads made, as { i, j, data }, for the caller to
 * add to its store, and what changed per level, in samples.
 */
export function reconcile(get, heroTiles, coarsest) {
  const changed = {};
  /* The hero's extent in hero samples, and the level 0 samples on it. */
  const is = heroTiles.map(([i]) => i);
  const js = heroTiles.map(([, j]) => j);
  const hx = [Math.min(...is) * TILE_CELLS, (Math.max(...is) + 1) * TILE_CELLS];
  const hz = [Math.min(...js) * TILE_CELLS, (Math.max(...js) + 1) * TILE_CELLS];
  let gx = [Math.ceil(hx[0] / FAN), Math.floor(hx[1] / FAN)];
  let gz = [Math.ceil(hz[0] / FAN), Math.floor(hz[1] / FAN)];
  changed[0] = 0;
  for (let z = gz[0]; z <= gz[1]; z += 1) {
    for (let x = gx[0]; x <= gx[1]; x += 1) {
      const v = sampleAt(get, HERO, x * FAN, z * FAN);
      if (v < 0) {
        throw new Error(`itaipu terrain: hero sample ${x * FAN}, ${z * FAN} is not loaded`);
      }
      changed[0] += setAt(get, 0, x, z, v);
    }
  }
  /* Every coarser sample whose tent reads a changed one. */
  for (let level = 1; level <= coarsest; level += 1) {
    gx = [Math.ceil((gx[0] - 1) / 2), Math.floor((gx[1] + 1) / 2)];
    gz = [Math.ceil((gz[0] - 1) / 2), Math.floor((gz[1] + 1) / 2)];
    const next = [];
    for (let z = gz[0]; z <= gz[1]; z += 1) {
      for (let x = gx[0]; x <= gx[1]; x += 1) {
        next.push([x, z, tentAt(get, level, x, z)]);
      }
    }
    /* Written after all are read: a level's tent reads only the finer
     * level, but a sample on a shared edge is in two tiles of this one. */
    changed[level] = 0;
    for (const [x, z, v] of next) {
      changed[level] += setAt(get, level, x, z, v);
    }
  }

  const pads = [];
  for (const [i, j] of heroPads(heroTiles)) {
    const data = new Uint16Array(TILE_SAMPLES * TILE_SAMPLES);
    for (let b = 0; b <= TILE_CELLS; b += 1) {
      for (let a = 0; a <= TILE_CELLS; a += 1) {
        const hxs = i * TILE_CELLS + a;
        const hzs = j * TILE_CELLS + b;
        const fx = hxs / FAN;
        const fz = hzs / FAN;
        const x0 = Math.floor(fx);
        const z0 = Math.floor(fz);
        const u = fx - x0;
        const v = fz - z0;
        const c00 = sampleAt(get, 0, x0, z0);
        const c10 = u > 0 ? sampleAt(get, 0, x0 + 1, z0) : c00;
        const c01 = v > 0 ? sampleAt(get, 0, x0, z0 + 1) : c00;
        const c11 = u > 0 && v > 0 ? sampleAt(get, 0, x0 + 1, z0 + 1) : u > 0 ? c10 : c01;
        if (c00 < 0 || c10 < 0 || c01 < 0 || c11 < 0) {
          throw new Error(`itaipu terrain: level 0 round ${x0}, ${z0} is not loaded for hero pad ${i}_${j}`);
        }
        const code = c00 * (1 - u) * (1 - v) + c10 * u * (1 - v) + c01 * (1 - u) * v + c11 * u * v;
        data[b * TILE_SAMPLES + a] = Math.floor(code + 0.5);
      }
    }
    pads.push({ i, j, data });
  }
  /* A pad's edge shared with a real hero tile is that tile's, so the two
   * chunks either side of it draw one line. */
  const real = (i, j) => (heroTiles.some(([a, b]) => a === i && b === j) ? get(HERO, i, j) : null);
  for (const p of pads) {
    for (let s = 0; s <= TILE_CELLS; s += 1) {
      const w = real(p.i - 1, p.j);
      if (w) {
        p.data[s * TILE_SAMPLES] = w[s * TILE_SAMPLES + TILE_CELLS];
      }
      const n = real(p.i, p.j - 1);
      if (n) {
        p.data[s] = n[TILE_CELLS * TILE_SAMPLES + s];
      }
    }
  }
  /* And between two pads, the lower one's copy wins: both are level 0's
   * bilinear, so they agree already but for the edges just copied. */
  const padAt = new Map(pads.map((p) => [`${p.i}_${p.j}`, p.data]));
  for (const p of pads) {
    const w = padAt.get(`${p.i - 1}_${p.j}`);
    const n = padAt.get(`${p.i}_${p.j - 1}`);
    for (let s = 0; s <= TILE_CELLS; s += 1) {
      if (w) {
        p.data[s * TILE_SAMPLES] = w[s * TILE_SAMPLES + TILE_CELLS];
      }
      if (n) {
        p.data[s] = n[TILE_CELLS * TILE_SAMPLES + s];
      }
    }
  }
  return { pads, changed };
}
