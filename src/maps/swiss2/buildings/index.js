/*
 * buildings/: the photographic valley's own houses.
 *
 * The village's layout is alps/village.js's and stays it: the same
 * sites, the same footprints and extents, the same draws of the rng, so
 * every collider and everything placed round a house is where the cel
 * alps have it. What this style changes is how a house is made and how
 * the village is baked (bake.js).
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

import { chalet, barn, farmhouse, gasthof, shop, church } from './houses.js';
import { hangar } from './hangar.js';
import { makeBakeAll } from './bake.js';
import { furnish } from '../village/index.js';

/* A log is wider than the boards the photograph shows: the log walls'
 * texture is stretched to about eighteen centimetres a course. */
const LOG_UV = 0.72;

/* What alps/village.js takes from a style's look.buildings. furnish()
 * leaves the village's layout on the hook for the people who walk it
 * (village/people.js), who are placed after the village is built. */
export function swissBuildings(look) {
  const uv = { larchDark: LOG_UV, larch: LOG_UV, honey: LOG_UV, weathered: LOG_UV };
  const hook = {
    chalet, barn, farmhouse, gasthof, shop, church, hangar, bakeAll: makeBakeAll(look, uv),
    layout: null,
    furnish(ctx) {
      hook.layout = furnish(ctx);
    },
  };
  return hook;
}
