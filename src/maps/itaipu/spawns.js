/*
 * spawns.js: where each kind of aircraft starts on Itaipu
 * (docs/ITAIPU-PLAN.md section 10, package H).
 *
 *   plane,  the main dam's crest road, past the east intake gantry crane,
 *   quad    facing west along the road toward the dam
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
 * THE CREST START, by the owner (2026-09-29): planes and quads take off
 * from "the top street" of the main concrete dam by the violet intake
 * gantry, where the action is, but not among the intakes, where the war
 * mode's drones end their runs. The main dam's frame is dam/index.js's: t
 * metres along the crest from (-352.9, -1826.5) toward (636.7, -1610.5),
 * s metres across it, downstream positive. The east gantry stands at t
 * 817.6 (the dam's survey, sites.intakeGantries), the last intake at t
 * 802.3, and the start at t 950, s 1.5: 148 m from that intake, 132 m past
 * the gantry and 63 m short of the main dam's east end.
 *
 * Measured in the page (scripts/itaipu-spawns-check.js holds it): the road
 * between the upstream parapet and the lamps on the downstream one is
 * clear of every solid from s -2 to s 5 on the main dam, and to s 3 on the
 * diversion structure east of it, at every height a craft stands, and
 * flat at 225 m. Facing west, 950 m of that straight lies ahead, past the
 * gantry, whose legs and jib crane stand on the deck upstream of the
 * parapet, off the road.
 *
 * A ROOM'S ROW. Slot k of a room starts at slots[k], metres to the
 * spawn's right and forward (src/game/slots.js): a column back down the
 * crest away from the intakes, 20 m apart and 1 m either side of s 1.5,
 * so every seat is on the clear road; the last, at t 1090, is on the
 * diversion structure's crest.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful,
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

/* t 950, s 1.5 in the main dam's frame, facing -t. */
export const CREST_SPAWN = {
  x: 574.93,
  z: -1622.45,
  yaw: 1.3559,
  y: CREST_Y,
  slots: [[0, 0], [1, -20], [-1, -40], [1, -60], [-1, -80], [1, -100], [-1, -120], [1, -140]],
};

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
    return home;
  };
}
