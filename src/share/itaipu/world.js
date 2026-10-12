/*
 * world.js: Itaipu's ground, the same answer the page's terrain gives as
 * its finest (src/maps/terrain/engine.js finestAt) once the whole pyramid
 * is loaded and cut to the concrete (src/maps/itaipu/terrain/index.js
 * buildTerrain, which loads and conforms every tile before anything reads
 * one). That is the ground the page stands its parts and its spawn on,
 * and the one its debris rests on (itaipu.js floorAt): the same on every
 * screen. What a person's craft touches near the camera is the drawn
 * level (terrain.height), which is this wherever the engine draws its
 * finest, plus the water's surface over the lakes (itaipu.js wet), which
 * is not here.
 *
 * makeItaipuWorld(bytes) is pure: no fetch, no file system, so the room
 * (edge/rooms/grounds.js), the checks and scripts/lib/itaipu-ground.js all
 * read the one copy; node.js only finds the bytes. finestAt's arithmetic
 * is engine.js's, operation for operation, so the two agree to the bit
 * (npm run world:layer holds them to that over the whole extent).
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import {
  HERO, TILE_CELLS, TILE_SAMPLES, cellOf, decode,
} from '../../maps/terrain/frame.js';
import { ITAIPU_FRAME } from '../../maps/itaipu/terrain/frame.js';
import { conformBound, conformTile, fillUnder } from '../../maps/itaipu/terrain/conform.js';
import { embankmentCrests, embankmentSection, junctionRims } from '../../maps/itaipu/dam/index.js';

/* Every tile the manifest lists, as [level, i, j]: the page loads exactly
 * these (itaipu/terrain/index.js listed). */
export function listedTiles(manifest) {
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

/* The heights the ground is held under and over where it meets the dam,
 * as itaipu.js hands buildTerrain its `shape`. */
export function damShape(dam) {
  return {
    bound: conformBound(junctionRims(dam), embankmentCrests(dam)),
    fill: fillUnder(embankmentSection(dam)),
  };
}

/* engine.js tri: a cell's two triangles, split on the diagonal from
 * (ci, cj + 1) to (ci + 1, cj), as the chunks draw it. */
function tri(data, ci, cj, fu, fv) {
  const k = cj * TILE_SAMPLES + ci;
  const h00 = decode(data[k]);
  const h10 = decode(data[k + 1]);
  const h01 = decode(data[k + TILE_SAMPLES]);
  const h11 = decode(data[k + TILE_SAMPLES + 1]);
  if (fu + fv <= 1) {
    return h00 + (h10 - h00) * fu + (h01 - h00) * fv;
  }
  return h11 + (h01 - h11) * (1 - fu) + (h10 - h11) * (1 - fv);
}

/*
 * The world from the data folder's contents: `manifest` and `dam` its two
 * JSON files parsed, `tile(level, i, j)` a listed tile's samples as a
 * Uint16Array (it is conformed in place). Returns { manifest, dam, cut,
 * groundAt(x, z) }; `cut` is the hero samples the dam's cut lowered, as
 * buildTerrain leaves them in terrain.cut.
 *
 * groundAt throws outside the frame's square: there the page draws its
 * apron (terrain/apron.js), a made up country this module has no copy of,
 * and nothing that flies is meant to be out there.
 */
export function makeItaipuWorld({ manifest, dam, tile }) {
  const shape = damShape(dam);
  const tiles = new Map();
  const cut = [];
  for (const [level, i, j] of listedTiles(manifest)) {
    const data = tile(level, i, j);
    if (!(data instanceof Uint16Array) || data.length !== TILE_SAMPLES * TILE_SAMPLES) {
      throw new Error(`itaipu: tile ${level}/${i}_${j} is not ${TILE_SAMPLES} by ${TILE_SAMPLES} samples`);
    }
    conformTile(level, i, j, data, ITAIPU_FRAME.half, shape, cut);
    tiles.set(`${level}:${i}:${j}`, data);
  }
  const HALF = ITAIPU_FRAME.half;
  const EXTENT = ITAIPU_FRAME.extent;
  const COARSEST = ITAIPU_FRAME.coarsest;
  const groundAt = (x, z) => {
    if (!(x >= -HALF && z >= -HALF && x <= HALF && z <= HALF)) {
      throw new RangeError(`itaipu ground: (${x}, ${z}) is outside the map's square`);
    }
    for (let level = HERO; level <= COARSEST; level += 1) {
      const cell = cellOf(level);
      const gx = (x + HALF) / cell;
      const gz = (z + HALF) / cell;
      const ci = Math.floor(gx);
      const cj = Math.floor(gz);
      const ti = Math.floor(Math.min(ci, Math.floor(EXTENT / cell) - 1) / TILE_CELLS);
      const tj = Math.floor(Math.min(cj, Math.floor(EXTENT / cell) - 1) / TILE_CELLS);
      const data = tiles.get(`${level}:${ti}:${tj}`);
      if (!data) {
        continue;
      }
      const lx = Math.min(TILE_CELLS - 1, ci - ti * TILE_CELLS);
      const lz = Math.min(TILE_CELLS - 1, cj - tj * TILE_CELLS);
      return tri(data, lx, lz, Math.min(1, gx - ti * TILE_CELLS - lx), Math.min(1, gz - tj * TILE_CELLS - lz));
    }
    throw new Error(`itaipu ground: no tile at (${x}, ${z}); the manifest lists the coarsest level whole`);
  };
  return {
    manifest, dam, cut, groundAt,
  };
}
