/*
 * registry.js: the maps, and the only place any of them is named.
 *
 * THE LOADERS ARE DYNAMIC IMPORTS AND THAT IS THE POINT. A world is
 * thousands of meshes, its photographs and its baked textures. A player who
 * only ever flies one valley must not pay for another: no module fetch, no
 * geometry, no texture generation, no render target. A static import at the
 * top of main.js would fetch the whole graph at boot, so the import lives
 * inside the loader thunk and nothing calls that thunk until a map is
 * chosen. tests/lib/checks.js measures that, by recording every request the
 * page makes with the Alps selected and asserting none of them is under
 * src/maps/swiss2.
 *
 * The freestyle town and the airfield were removed on 2026-09-28 on the
 * owner's ask ("leave only alps and swiss"), and Industrial bando, Municipal
 * baths and Bardwell's yard before them on 2026-08-30. They are in the
 * history if they are ever wanted back. A stored or linked id of one of
 * them is not an unknown id: src/maps/retired.js says where it went.
 *
 * The worlds a track is flown in are loaded the same way, for symmetry and
 * because the loading screen then has one shape to report.
 *
 * `poster` is the still the world card shows while its clip is being made.
 * A first visit to Freestyle used to be four dark rectangles with the word
 * "loading" on them for the best part of a minute, which is the worst
 * possible moment to tell somebody nothing about the place they are choosing.
 * The file is generated: `npm run gen:posters`, see scripts/posters.js, which
 * also holds the camera each one is taken from. A map with no poster falls
 * back to the rectangle, so the field is optional rather than load bearing.
 *
 * `build` marks a world a track can be built inside (src/builder/), and so
 * the worlds Track mode flies and My tracks offers a new track in. The two
 * valleys: one terrain, one height function and nothing to fly under, which
 * is where placement was proven.
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
  /*
   * TRACK MODE, WHICH IS A SEAT AND NOT A WORLD. What it flies is the track
   * seated from My tracks or a board link, in the world that track was
   * built in (src/main.js worldId), and a seat with no track in it stands
   * at `home`, the title's own valley. It has no loader on purpose: nothing
   * may build it, and src/main.js loadMap says so if anything tries.
   */
  {
    id: 'track',
    name: str('ui.track'),
    mode: 'race',
    note: str('registry.a_track_built_in_the_alps'),
    home: 'swiss2',
    buildMs: MAP_BUILD_MS.swiss2,
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
  /* Named "(in development)" while it was terrain and water only; it has
   * its dam, towns and forests now and the released mission flies on it.
   * A builder world: its two courses are builder documents
   * (docs/itaipu-courses/). */
  {
    id: 'itaipu',
    poster: 'assets/posters/itaipu.jpg',
    name: str('registry.itaipu'),
    mode: 'freestyle',
    note: str('registry.itaipu_note'),
    buildMs: MAP_BUILD_MS.itaipu,
    build: true,
    load: () => import('./itaipu.js'),
  },
];

export function mapById(id) {
  return MAPS.find((m) => m.id === id) ?? MAPS[0];
}
