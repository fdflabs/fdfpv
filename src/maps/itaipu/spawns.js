/*
 * spawns.js: where each kind of aircraft starts on Itaipu
 * (docs/ITAIPU-PLAN.md section 10, package H).
 *
 *   plane   the crest road of the left bank rockfill dam, OSM way
 *           262638260, facing north west along it toward the main dam
 *   quad    open ground beside the Mirante da Barragem, facing the crest
 *   float   the water body's own spawn from water.json: the reservoir
 *           800 m north of the crest, or the river 2 km below the dam
 *   air     400 m over the reservoir, 3 km north of the crest, heading
 *           for it
 *
 * The shell asks spawnFor(current, kind, wish) at every reset (src/main.js
 * mapSpawn). `current` is the view's spawn: the map's own default, or a
 * course's start that the builder or a seated track put there, which is
 * handed back untouched. `kind` is 'plane', 'quad' or 'float' (an
 * aircraft on floats on this map, which has water); `wish` is the page's
 * ?spawn= ('reservoir', 'river' or 'air'), or null.
 *
 * WHY THE PLANE SPAWN MOVED FROM THE PLAN'S. The plan put it at x 975,
 * z -1487 on OSM way 30657423, which is a service road down the rockfill
 * dam's face, 49 m off the crest and 16 m under it. The crest is way
 * 262638260 (package A; dam.json's rockfill axis follows it). Its
 * straightest stretch runs 571 m from (1931, -543) to (2220, -51), never
 * more than 2 m off the chord (the numbers are the chord's): the spawn is
 * 150 m in from its south east end, so the row of a room's planes behind
 * it stays on that straight, and 421 m of it lie ahead with the main dam
 * in view beyond. The crest is 14 m wide (dam/index.js EMBANKMENT_HALF).
 *
 * WHY THE QUAD SPAWN MOVED OFF THE VIEWPOINT. The viewpoint's OSM node
 * stands on a building's roof, with its walls within 2 m (measured in the
 * page: height() 182.5 over ground at 173.6). 110 m east of it the ground
 * is open and level for 60 m round, room for a room's row of eight.
 *
 * A ROOM'S ROW. Slot k of a room starts at slots[k], metres to the
 * spawn's right and forward (src/game/slots.js). The plane spawn's row is
 * a staggered column behind it down the crest, 20 m apart and 3 m either
 * side of the centre line, because the default row across the heading, 8
 * m apart out to 32 m, would put six of eight planes off a 14 m crest and
 * onto the rockfill's slope. The other spawns take the default row: the
 * quads' field is level for the whole of it, and water is water.
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

/* The crest road's height (section 6), the fromY hint that has height()
 * answer the crest's own record rather than anything under it. */
const CREST_Y = 225;

export const PLANE_SPAWN = {
  x: 2144.2,
  z: -180.1,
  yaw: 0.530,
  y: CREST_Y,
  slots: [[0, 0], [3, -20], [-3, -40], [3, -60], [-3, -80], [3, -100], [-3, -120], [3, -140]],
};

export const QUAD_SPAWN = { x: 315, z: -995, yaw: 0.361 };

export const AIR_SPAWN = {
  x: 1500, z: -4200, yaw: 2.623, air: { y: 619 },
};

/*
 * The spawn picker for a map whose water bodies are `lakes` (src/maps/
 * itaipu.js lakesOf, reservoir first) and whose own default spawn is
 * `home`. A wish the map has no spawn for is no wish.
 */
export function makeSpawnFor(home, lakes) {
  const water = Object.fromEntries(lakes.map((l) => [l.name, l.spawn]));
  return (current, kind, wish) => {
    if (current !== home) {
      return current;
    }
    if (wish === 'air') {
      return AIR_SPAWN;
    }
    if (kind === 'float') {
      return water[wish] ?? lakes[0].spawn;
    }
    return kind === 'plane' ? PLANE_SPAWN : QUAD_SPAWN;
  };
}
