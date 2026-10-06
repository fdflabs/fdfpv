/*
 * terrain.js: the Interior's ground on the streamed terrain engine
 * (src/maps/terrain/), fed from the room's own bytes.
 *
 * ONE GROUND. The engine's level 0 is 30 m samples in 257 square tiles,
 * and src/share/interior/height.bin is exactly that grid over the data's
 * square, three tiles a side: so the level 0 tiles are cut out of it in
 * memory, never fetched, and what the engine draws there is the ground
 * world.js groundAt reads for the room. Levels 1 and 2 are made from
 * level 0 by the pipeline's tent filter (every other sample, weights 1, 2,
 * 1 over its three by three), as tools/itaipu does on disk. There is no
 * hero level: the bare earth model is 30 m, and a 10 m level would be
 * the same ground interpolated.
 *
 * Past the data's square the engine's apron invents the rolling country
 * the fog takes (APRON).
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { Terrain } from '../terrain/engine.js';
import { makeFrame, TILE_CELLS, TILE_SAMPLES, TILE_BYTES, tilePath } from '../terrain/frame.js';
import { HALF, H_N } from '../../share/interior/frame.js';

/* Level 2's one tile covers the square; level 0's three a side are it. */
const COARSEST = 2;

/*
 * Past the square: the region's rolling ranch country, about the data's
 * own mean height (the ground runs 200 to 390 m) and its relief, 150
 * kilometres deep: past the horizon from survey altitude's 1800 m (150
 * km), so no edge of it shows against the sky.
 */
export const APRON = { base: 270, amp: 45, depth: 150000 };
export const INTERIOR_FRAME = makeFrame({ half: HALF, coarsest: COARSEST, apron: APRON });

/* The engine's budgets, as Itaipu's (src/maps/itaipu/terrain/index.js
 * TERRAIN_Q) less the hero level's: 9 + 4 + 1 tiles of 132 kB is 1.8 MB,
 * all pinned, so the ceiling never evicts. */
export const TERRAIN_Q = {
  low: { split: 0.7, buildMs: 1.5, tileCeiling: 4e6, meshCap: 140, prefetch: 6000, prefetchHero: 0 },
  medium: { split: 0.85, buildMs: 2, tileCeiling: 4e6, meshCap: 160, prefetch: 6000, prefetchHero: 0 },
  high: { split: 1, buildMs: 2, tileCeiling: 4e6, meshCap: 180, prefetch: 6000, prefetchHero: 0 },
};

/* One level's samples (n by n, x fastest) from the finer level's: the
 * tent filter at every other sample, the edge repeated past the end. */
function coarser(fine, n) {
  const m = Math.floor((n - 1) / 2) + 1;
  const out = new Float64Array(m * m);
  const at = (i, j) => fine[Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i))];
  const w = [1, 2, 1];
  for (let j = 0; j < m; j += 1) {
    for (let i = 0; i < m; i += 1) {
      let s = 0;
      for (let b = 0; b < 3; b += 1) {
        for (let a = 0; a < 3; a += 1) {
          s += w[a] * w[b] * at(2 * i + a - 1, 2 * j + b - 1);
        }
      }
      out[j * m + i] = Math.floor(s / 16 + 0.5);
    }
  }
  return { data: out, n: m };
}

/* Tile (ti, tj) of a level whose samples are `grid` (n by n): its 257
 * square, the grid's edge repeated where the tile runs past it. */
function cutTile(grid, n, ti, tj) {
  const out = new Uint16Array(TILE_SAMPLES * TILE_SAMPLES);
  for (let j = 0; j < TILE_SAMPLES; j += 1) {
    const gj = Math.min(n - 1, tj * TILE_CELLS + j);
    for (let i = 0; i < TILE_SAMPLES; i += 1) {
      const gi = Math.min(n - 1, ti * TILE_CELLS + i);
      out[j * TILE_SAMPLES + i] = grid[gj * n + gi];
    }
  }
  return out;
}

/* Every level's tiles, by the path the engine would fetch them from. */
export function makeTiles(heights) {
  const tiles = new Map();
  const levels = [];
  let grid = Float64Array.from(heights);
  let n = H_N;
  for (let level = 0; level <= COARSEST; level += 1) {
    if (level > 0) {
      ({ data: grid, n } = coarser(grid, n));
    }
    const count = Math.ceil((n - 1) / TILE_CELLS);
    const list = [];
    for (let tj = 0; tj < count; tj += 1) {
      for (let ti = 0; ti < count; ti += 1) {
        tiles.set(tilePath(level, ti, tj), cutTile(grid, n, ti, tj));
        list.push([ti, tj]);
      }
    }
    levels.push({ level, grid: count, tiles: list });
  }
  return { tiles, manifest: { levels, hero: { tiles: [] } } };
}

/*
 * The terrain: { terrain (the engine), tiles }. `heights` world.js's
 * decoded height.bin; the rest as src/maps/itaipu/terrain/index.js.
 */
export async function buildTerrain({
  heights, material, scene, quality, spawn, eye, progress,
}) {
  const { tiles, manifest } = makeTiles(heights);
  const base = 'interior-memory/';
  const fetchImpl = async (url) => {
    const t = tiles.get(url.slice(base.length));
    if (!t) {
      return { ok: false, status: 404 };
    }
    return { ok: true, status: 200, arrayBuffer: async () => t.buffer.slice(0, TILE_BYTES) };
  };
  const terrain = new Terrain({
    base, manifest, material, scene, quality, frame: INTERIOR_FRAME, fetchImpl,
  });
  terrain.group.name = 'interior-terrain';
  terrain.group.renderOrder = 1;
  for (const l of manifest.levels) {
    for (const [i, j] of l.tiles) {
      terrain.store.want(l.level, i, j, l.level);
    }
  }
  await terrain.load(spawn, eye, progress);
  return terrain;
}
