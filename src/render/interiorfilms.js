/*
 * interiorfilms.js: The Interior's films for the shell (docs/campaign/
 * interior/FILMS.md says how the screen wires them): one call plays a
 * film by id over the Interior's world, with the BOARD's map, its stills,
 * the squad's captures and the land's picture handed to the player
 * (src/render/warintro.js, which plays every film of the game).
 *
 *   playInteriorFilm(scene, camera, id, opts)  a handle as warintro.js
 *                       play() returns: frame(nowMs), afterDraw(canvas),
 *                       state(), done, dispose(). opts are play()'s, and
 *                       `map` (the standing world's id) is required: a
 *                       film plays only over its own map (#412)
 *   filmsFor(missionId) { prologue?, intro?, outro? }: the film ids a
 *                       mission plays at each moment, or null
 *   INTERIOR_FILM_IDS   every film in story order, for a menu
 *
 * opts.capture(item) is the squad's own still of a capture item ({ image,
 * seat } or null), the screen's from the room's record (CONTRACT-P0.md
 * section 7); without one the film shows the analyst reconstruction.
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

import { play } from './warintro.js';
import { BOARD_MAP } from '../share/interior/films/board.js';
import { FILMS, INTERIOR_FILM_IDS, MISSION_FILMS } from '../share/interior/films/index.js';
import { STILLS } from '../share/interior/films/stills.js';
import { PLACES, landEdit } from '../share/interior/places.js';
import { LAND, fetchWorldBytes, makeWorld } from '../share/interior/world.js';

export { INTERIOR_FILM_IDS };

export function filmsFor(missionId) {
  return MISSION_FILMS[missionId] ?? null;
}

/* The land cover as the BOARD paints it: dim screen colours a class. */
const LAND_RGB = {
  [LAND.water]: [29, 77, 107],
  [LAND.forest]: [24, 52, 38],
  [LAND.pasture]: [55, 70, 48],
  [LAND.crop]: [70, 76, 52],
  [LAND.shrub]: [46, 62, 42],
  [LAND.wetland]: [34, 62, 70],
  [LAND.bare]: [86, 80, 64],
  [LAND.built]: [104, 104, 100],
  [LAND.burned]: [40, 34, 32],
};
/* 11 m a pixel over the data's 23 km: the outro's zoom starts 900 m wide.
 * Painted in about 80 ms (measured in Node). */
const RASTER_PX = 2048;

/* The BOARD's land picture over the map's bounds, painted once a page
 * from the world's own bytes (world.js, places.js landEdit), the browser's
 * cache keeping the fetch. Resolves to a canvas. */
let rasterJob = null;
let raster = null;
export function landRaster() {
  if (!rasterJob) {
    rasterJob = fetchWorldBytes().then((bytes) => {
      const world = makeWorld({ ...bytes, edits: landEdit });
      const c = document.createElement('canvas');
      c.width = RASTER_PX;
      c.height = RASTER_PX;
      const g = c.getContext('2d');
      const img = g.createImageData(RASTER_PX, RASTER_PX);
      const [[x0, z0], [x1, z1]] = BOARD_MAP.bounds;
      for (let j = 0; j < RASTER_PX; j += 1) {
        for (let i = 0; i < RASTER_PX; i += 1) {
          const x = x0 + ((i + 0.5) / RASTER_PX) * (x1 - x0);
          const z = z0 + ((j + 0.5) / RASTER_PX) * (z1 - z0);
          const rgb = LAND_RGB[world.landAt(x, z)] ?? [40, 40, 40];
          const k = (j * RASTER_PX + i) * 4;
          img.data[k] = rgb[0];
          img.data[k + 1] = rgb[1];
          img.data[k + 2] = rgb[2];
          img.data[k + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
      raster = c;
      return c;
    });
    rasterJob.catch((e) => console.warn(`interiorfilms: no land picture for the BOARD: ${e.message}`));
  }
  return rasterJob;
}

/* opts.film plays a film built at the time (src/share/ops/spotfilm.js)
 * in place of a registered one; `id` is then its id. */
export function playInteriorFilm(scene, camera, id, opts = {}) {
  const film = opts.film ?? FILMS[id];
  if (!film) {
    throw new Error(`interiorfilms: no film ${id}`);
  }
  if (opts.map == null) {
    throw new Error('interiorfilms: opts.map, the standing world, is required: a film plays only over its own map');
  }
  landRaster();
  const [px, pz] = PLACES.pistaCero.at;
  const ground = opts.ground ?? (() => 0);
  return play(scene, camera, {
    /* After a skip in a room's briefing: round Pista Cero, high. */
    orbit: { centre: [px, ground(px, pz), pz], r: 900, y: ground(px, pz) + 420 },
    ...opts,
    film,
    board: {
      map: BOARD_MAP,
      stills: STILLS,
      capture: opts.capture ?? (() => null),
      raster: (layer) => (layer === 'land' ? raster : null),
    },
  });
}
