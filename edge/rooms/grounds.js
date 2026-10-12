/*
 * grounds.js: the ground a pilot hits, for the room (AI pilots,
 * edge/rooms/bots.js). Each map's is the one its page reads from the same
 * shared module, so an AI pilot meets the ground where a person would:
 *
 *   swiss2, alps  the valley's world (src/share/valley/world.js groundAt),
 *                 the very ground the page lays its roofs over and the
 *                 shell's physics plane reads: the field, the range beyond
 *                 it, the alps' headwall, the strip and the lake's surface.
 *   itaipu        src/share/itaipu/world.js groundAt: the terrain's finest
 *                 level over the whole pyramid, cut to the concrete, the
 *                 ground the page stands its parts, spawn and debris on
 *                 (itaipu.js floorAt). Not the water: over the lakes a
 *                 person's craft meets the surface (itaipu.js wet), this
 *                 meets the bed. Read from the data folder
 *                 (FDFPV_ITAIPU_DATA, src/share/itaipu/node.js), which is
 *                 its own repository; without it the room has no ground
 *                 for Itaipu (null).
 *   interior      src/share/interior/world.js groundAt, the page's floorAt
 *                 and the drawn level 0, from the bytes beside it.
 *
 * What stands on the ground (buildings, trees, roofs) is not here: the
 * page places it as it draws, and the room has no copy.
 *
 * Built on first use and kept for the process: the Swiss valley's world
 * takes about 0.2 s in Node, the alps' 45 ms (measured 2026-10-11, Node
 * 22: 195 to 198 ms and 44 to 46 ms over three fresh processes each; the
 * field alone, before the far range and the headwall, was 193 and 19 ms).
 * Itaipu's takes 416 to 432 ms and holds 10.6 MB (86 tiles of 257 by
 * 257 samples), the Interior's 12 to 13 ms and 5.4 MB (measured
 * 2026-10-12, Node 22, three fresh processes each, heap plus array
 * buffers after a collection); built only when a room asks for one.
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

import { makeValleyWorld } from '../../src/share/valley/world.js';
import { makeItaipuWorld } from '../../src/share/itaipu/world.js';
import { readItaipuBytes } from '../../src/share/itaipu/node.js';
import { makeWorld } from '../../src/share/interior/world.js';
import { readWorldBytes } from '../../src/share/interior/node.js';

/* Each map's ground, or null where the room cannot have one. */
const MAKERS = Object.freeze({
  swiss2: () => makeValleyWorld('swiss2').groundAt,
  alps: () => makeValleyWorld('alps').groundAt,
  itaipu: () => {
    const bytes = readItaipuBytes();
    return bytes && makeItaipuWorld(bytes).groundAt;
  },
  interior: () => makeWorld(readWorldBytes()).groundAt,
});
const BUILT = new Map();

/* The map's ground, (x, z) to y in scene metres, or null for a map the
 * room has no ground for. */
export function groundOf(map) {
  if (!Object.hasOwn(MAKERS, map)) {
    return null;
  }
  if (!BUILT.has(map)) {
    BUILT.set(map, MAKERS[map]());
  }
  return BUILT.get(map);
}
