/*
 * registry.js: the maps, and the only place any of them is named.
 *
 * THE LOADERS ARE DYNAMIC IMPORTS AND THAT IS THE POINT. The freestyle city
 * is 59 vendored source files, about nineteen thousand meshes and a few
 * hundred Canvas2D textures. A player who only ever flies a track must
 * not pay for any of it: no module fetch, no geometry, no texture generation,
 * no render target. A static import at the top of main.js would fetch the
 * whole graph at boot, so the import lives inside the loader thunk and
 * nothing calls that thunk until a map is chosen. tests/lib/checks.js
 * measures that, by recording every request the page makes with a track
 * selected and asserting none of them is under src/maps/city.
 *
 * There used to be four freestyle worlds. Industrial bando, Municipal baths
 * and Bardwell's yard were removed on 2026-08-30 on the owner's ask, so
 * Freestyle offers the town and nothing else. They are in the history at
 * 974f4ce if they are ever wanted back; what is not in the history is the
 * time a player spends deciding between four things when they wanted one.
 *
 * The track world is loaded the same way, for symmetry and because the loading
 * screen then has one shape to report. It is loaded at boot because the title
 * screen has a world behind it.
 *
 * `poster` is the still the world card shows while its clip is being made.
 * A first visit to Freestyle used to be four dark rectangles with the word
 * "loading" on them for the best part of a minute, which is the worst
 * possible moment to tell somebody nothing about the place they are choosing.
 * The file is generated: `npm run gen:posters`, see scripts/posters.js, which
 * also holds the camera each one is taken from. A map with no poster falls
 * back to the rectangle, so the field is optional rather than load bearing.
 *
 * `build` marks a world a course can be built inside, with B from a flight
 * (src/builder/). The two valleys first: one terrain, one height function and
 * nothing to fly under, which is where placement was proven. The town and
 * Yellowstone come later.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { MAP_BUILD_MS } from './build-cost.js';
import { str } from '../strings/index.js';

export const MAPS = [
  {
    id: 'custom',
    name: str('ui.track'),
    mode: 'race',
    note: str('registry.a_track_from_the_board_or'),
    buildMs: MAP_BUILD_MS.custom,
    load: () => import('./custom.js'),
  },
  {
    id: 'city',
    name: str('ui.freestyle_city'),
    mode: 'freestyle',
    note: str('registry.a_whole_town_no_gates_no'),
    buildMs: MAP_BUILD_MS.city,
    poster: 'assets/posters/city.jpg',
    load: () => import('./city/index.js'),
  },
  {
    id: 'airfield',
    poster: 'assets/posters/airfield.jpg',
    name: str('registry.airfield'),
    mode: 'freestyle',
    note: str('registry.five_hundred_metres_of_mown_grass'),
    buildMs: MAP_BUILD_MS.airfield,
    load: () => import('./airfield.js'),
  },
  {
    id: 'alps',
    poster: 'assets/posters/alps.jpg',
    name: str('registry.the_alps'),
    mode: 'freestyle',
    note: str('registry.a_glacial_valley_six_kilometres'),
    buildMs: MAP_BUILD_MS.alps,
    build: true,
    load: () => import('./alps.js'),
  },
  /* The same valley, drawn to read as a photograph rather than a
   * cartoon: src/maps/swiss2.js builds it through the alps' own
   * builders, so choosing it fetches the alps modules too, and nothing
   * of it is fetched until it is chosen. */
  {
    id: 'swiss2',
    poster: 'assets/posters/swiss2.jpg',
    name: str('registry.swiss2'),
    mode: 'freestyle',
    note: str('registry.swiss2_note'),
    buildMs: MAP_BUILD_MS.swiss2,
    build: true,
    load: () => import('./swiss2.js'),
  },
  /* In development, and the name says so, so a pilot who picks it knows
   * what they are getting: rough edges, no roads, and a first build of
   * the streamed terrain. */
  {
    id: 'yellowstone',
    poster: 'assets/posters/yellowstone.jpg',
    name: str('registry.yellowstone'),
    mode: 'freestyle',
    note: str('registry.yellowstone_note'),
    buildMs: MAP_BUILD_MS.yellowstone,
    load: () => import('./yellowstone.js'),
  },
];

export function mapById(id) {
  return MAPS.find((m) => m.id === id) ?? MAPS[0];
}
