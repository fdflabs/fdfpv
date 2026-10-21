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
 * page makes with Itaipu selected and asserting none of them is under
 * src/maps/interior.
 *
 * The Alps and the Swiss valley were removed on 2026-10-20, the combat-only
 * cut ("leave only combat quads and planes in pdcs no recreational stuff"),
 * the freestyle town and the airfield on 2026-09-28 on the owner's ask
 * ("leave only alps and swiss"), and Industrial bando, Municipal baths and
 * Bardwell's yard before them on 2026-08-30. They are in the history if they
 * are ever wanted back. A stored or linked id of one of them is not an
 * unknown id: src/maps/retired.js says where it went.
 *
 * `poster` is the still the world card shows.
 * A first visit to Freestyle used to be four dark rectangles with the word
 * "loading" on them for the best part of a minute, which is the worst
 * possible moment to tell somebody nothing about the place they are choosing.
 * A map with no poster falls back to the rectangle, so the field is
 * optional rather than load bearing.
 *
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
  /* First: mapById answers an unknown id with it, and the title shows it
   * (src/boot.js TITLE_WORLD). Named "(in development)" while it was terrain and water only; it has
   * its dam, towns and forests now and the released mission flies on it. */
  {
    id: 'itaipu',
    poster: 'assets/posters/itaipu.jpg',
    name: str('registry.itaipu'),
    mode: 'freestyle',
    note: str('registry.itaipu_note'),
    buildMs: MAP_BUILD_MS.itaipu,
    load: () => import('./itaipu.js'),
  },
  /* In development, and named so: The Interior campaign's map
   * (docs/campaign/interior/WORLD.md), Mission 1's corridor. */
  {
    id: 'interior',
    name: str('registry.interior'),
    mode: 'freestyle',
    note: str('registry.interior_note'),
    buildMs: MAP_BUILD_MS.interior,
    load: () => import('./interior.js'),
  },
];

export function mapById(id) {
  return MAPS.find((m) => m.id === id) ?? MAPS[0];
}
