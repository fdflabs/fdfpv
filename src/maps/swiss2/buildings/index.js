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

import { chalet, barn, farmhouse, gasthof, shop, church } from '../../alps/kit.js';
import { makeBakeAll } from './bake.js';

/* What alps/village.js takes from a style's look.buildings. */
export function swissBuildings(look) {
  return { chalet, barn, farmhouse, gasthof, shop, church, bakeAll: makeBakeAll(look) };
}
