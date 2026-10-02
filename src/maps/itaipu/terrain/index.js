/*
 * terrain/index.js: Itaipu's ground, on the streamed terrain engine.
 *
 * The engine (src/maps/terrain/engine.js) is a quadtree of
 * 64 cell chunks over a tile pyramid, streamed round the craft and the
 * camera; here it runs on Itaipu's frame (frame.js), the ring of 40.96 km
 * and the hero of 10.24 km. The whole pyramid is 86 tiles, 11.4 MB, so
 * it is not streamed: every tile is fetched before the first chunk is
 * built, and then the engine's own load walks the selection round the
 * spawn. The data's pyramid is built from the edited hero and the hero
 * tiles are whole level 0 nodes (data v2, scripts/itaipu-check.js holds
 * both), so every level draws the same ground and every node over the
 * hero splits to 10 m. The ceiling is above the whole set, so nothing is
 * ever evicted and nothing is fetched in flight.
 *
 * What the map gets: the engine, whose height(x, z) is the drawn ground
 * (the craft's), and ground(x, z), the finest data at a point, which is
 * the ground the parts place things on. With every tile resident and the
 * hero reaching every node that can split to it, the two are the same
 * wherever the craft can make the engine draw 10 m.
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

import { Terrain } from '../../terrain/engine.js';
import { tileKey } from '../../terrain/tiles.js';
import { HERO } from '../../terrain/frame.js';
import { ITAIPU_FRAME } from './frame.js';
import { conformTile } from './conform.js';

/*
 * The engine's budgets per preset:
 *
 *   split      a node splits when a focus is nearer its box than this many
 *              times its children's side doubled (engine.js).
 *   buildMs    main thread time a frame may spend building chunk meshes,
 *              sliced by rows and carried over to the next frame.
 *   tileCeiling  bytes of elevation tiles held when nothing pins them.
 *   meshCap    built chunk meshes kept, drawn or not, before the least
 *              recently drawn are freed.
 *   prefetch, prefetchHero  radius round the craft, metres, inside which
 *              the finest tiles are fetched before the selection needs
 *              them.
 *
 * The tile ceiling holds the whole pyramid, 86 tiles of 132 098
 * bytes on data v2, 11.4 MB, under section 13's 12 MB. The mesh
 * cap holds the chunk buffers under section 13's 24 MB: a chunk is 67 kB
 * of positions and normals (chunks.js; measured 11.0 MB over 173 built,
 * scripts/itaipu-check.js), so 180 is 12.1 MB, and the selection draws
 * 105 to 116 of them at High from the spawn and from 400 m, which leaves
 * the rest for the ones just flown past.
 */
export const TERRAIN_Q = {
  low: { split: 0.7, buildMs: 1.5, tileCeiling: 12e6, meshCap: 140, prefetch: 6000, prefetchHero: 2500 },
  medium: { split: 0.85, buildMs: 2, tileCeiling: 12e6, meshCap: 160, prefetch: 6000, prefetchHero: 2500 },
  high: { split: 1, buildMs: 2, tileCeiling: 12e6, meshCap: 180, prefetch: 6000, prefetchHero: 3000 },
};

/* Every tile the manifest lists, as [level, i, j]. */
function listed(manifest) {
  const out = [];
  for (const l of manifest.levels) {
    for (let j = 0; j < l.grid; j += 1) {
      for (let i = 0; i < l.grid; i += 1) {
        out.push([l.level, i, j]);
      }
    }
  }
  for (const [i, j] of manifest.hero.tiles) {
    out.push([HERO, i, j]);
  }
  return out;
}

/*
 * Build the terrain. `spawn` and `eye` are THREE.Vector3s the first
 * selection is made from; `shape` conform.js's { bound, fill }, the
 * heights the ground is held under and over, applied to every tile
 * before a chunk is built from it, the hero samples it lowered left in
 * terrain.cut as [x, z]; `progress(f)` in [0, 1].
 */
export async function buildTerrain({
  base, manifest, material, scene, quality, spawn, eye, shape, progress,
}) {
  const terrain = new Terrain({
    base, manifest, material, scene, quality, frame: ITAIPU_FRAME,
  });
  terrain.group.name = 'itaipu-terrain';
  /* Drawn after the scene's other opaque things (three sorts by a group's
   * renderOrder first): the ground's material is the dearest per pixel,
   * and whatever stands on it (the canopy over the forest, the town, the
   * dam) then hides it before it is shaded rather than after. */
  terrain.group.renderOrder = 1;
  const store = terrain.store;
  const all = listed(manifest);
  const keys = all.map(([level, i, j]) => tileKey(level, i, j));
  for (const [level, i, j] of all) {
    if (!store.exists(level, i, j)) {
      throw new Error(`itaipu: the manifest's ${level}/${i}_${j} is not in its files`);
    }
    store.want(level, i, j, level);
  }
  await store.settle(keys, (got, n) => progress(0.7 * (got / n)));
  if (store.failed.size) {
    const [first] = store.failed.values();
    throw new Error(`itaipu: ${store.failed.size} terrain tile(s) failed to load, first: ${first}`);
  }
  /* The hero samples the cut lowered (one listed twice where two tiles
   * share it): the planting keeps off them (terrain.cut). */
  const cut = [];
  for (const [level, i, j] of all) {
    conformTile(level, i, j, store.get(level, i, j), ITAIPU_FRAME.half, shape, cut);
  }
  terrain.cut = cut;
  await terrain.load(spawn, eye, (f) => progress(0.7 + 0.3 * f));
  return terrain;
}
