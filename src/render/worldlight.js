/*
 * worldlight.js: whether the world the craft is in is at night, for the
 * lights that switch themselves on after dark (a Night Timber X's,
 * docs/NIGHTTIMBER-STAGE1.md section 5). The flight loop sets it from the
 * map's own flag, scene.userData.timeOfDay, which the maps write as their
 * sky goes dark (Itaipu's night build, the interior's clock); everything
 * else, the hangar and the menus among them, is day. One flag rather than
 * the scene handed to every builder: a craft is built before it knows
 * which world it will fly in, and the interior's dusk comes mid flight.
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

let night = false;

/* The world's night flag: true at night, anything else day. */
export function setWorldNight(on) {
  night = on === true;
}

export function worldNight() {
  return night;
}

/* A factory light's switch against the world: auto follows the night. */
export function factoryLit(mode) {
  return mode === 'on' || (mode !== 'off' && night);
}
