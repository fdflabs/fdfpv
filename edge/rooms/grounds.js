/*
 * grounds.js: the ground a pilot hits, for the room (AI pilots,
 * edge/rooms/bots.js). Each map's is the valley's world
 * (src/share/valley/world.js groundAt), the very ground its page lays
 * its roofs over and the shell's physics plane reads: the field, the
 * range beyond it, the alps' headwall, the strip and the lake's surface.
 * So an AI pilot meets the ground where a person would, inside the field
 * and beyond it. What stands on the ground (buildings, trees, roofs) is
 * not here: the page places it as it draws, and the room has no copy.
 *
 * Built on first use and kept for the process: the Swiss valley's world
 * takes about 0.2 s in Node, the alps' 45 ms (measured 2026-10-11, Node
 * 22: 195 to 198 ms and 44 to 46 ms over three fresh processes each; the
 * field alone, before the far range and the headwall, was 193 and 19 ms).
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

const MAPS = new Set(['swiss2', 'alps']);
const BUILT = new Map();

/* The map's ground, (x, z) to y in scene metres, or null for a map the
 * room has no ground for. */
export function groundOf(map) {
  if (!MAPS.has(map)) {
    return null;
  }
  if (!BUILT.has(map)) {
    BUILT.set(map, makeValleyWorld(map).groundAt);
  }
  return BUILT.get(map);
}
