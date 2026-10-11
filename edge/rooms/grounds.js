/*
 * grounds.js: the ground a pilot hits, for the room (AI pilots,
 * edge/rooms/bots.js). Each map's is the very heightfield its page builds
 * and the shell's physics plane reads (field.height), from the same
 * three-free module, so an AI pilot meets the ground where a person would.
 * What stands on the ground (buildings, trees) is not here: the page
 * places it as it draws, and the room has no copy.
 *
 * Built on first use and kept for the process: the Swiss valley's field
 * takes about a second in Node (measured 980 ms), the alps' 34 ms, once.
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
  LAKE_Y, STRIP_L, STRIP_W, STRIP_Y, buildHeightfield,
} from '../../src/maps/alps/heights.js';
import { buildSwissField } from '../../src/maps/swiss2/field.js';

/* src/maps/alps.js ground, inside the valley's floor, where the far range
 * and the headwall stand under the field: the field (the Swiss valley's
 * or the alps' own, as alps.js takes style.heightfield), the strip on it,
 * and water no lower than the lake's surface. */
function valleyGround(field) {
  return (x, z) => {
    const h = field.height(x, z);
    if (Math.abs(x) <= STRIP_W / 2 && Math.abs(z) <= STRIP_L / 2) {
      return Math.max(h, STRIP_Y);
    }
    return h < LAKE_Y ? LAKE_Y : h;
  };
}

const MAKERS = Object.freeze({
  swiss2: () => valleyGround(buildSwissField()),
  alps: () => valleyGround(buildHeightfield()),
});
const BUILT = new Map();

/* The map's ground, (x, z) to y in scene metres, or null for a map the
 * room has no ground for. */
export function groundOf(map) {
  if (!MAKERS[map]) {
    return null;
  }
  if (!BUILT.has(map)) {
    BUILT.set(map, MAKERS[map]());
  }
  return BUILT.get(map);
}
