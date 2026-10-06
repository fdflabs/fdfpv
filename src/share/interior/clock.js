/*
 * clock.js: the hour of the Interior's day a mission stands at, on the
 * room's clock (TECH-NEEDS N1, F12: "a sun that moves across a mission on
 * the room clock").
 *
 * Mission 1 is "16:40 into sunset; the return at sunset" (MISSIONS.md
 * M1), 20 to 30 minutes of play, and the sun sets two minutes after the
 * latest the script can need. Sixteen forty to the sun's setting is about
 * an hour and a half of the day (src/maps/interior/sun.js), so the day
 * runs faster than the room: RATE hours of day for every hour of room,
 * which puts the sunset at 32 minutes into the mission. The room owns
 * the mission's start; every screen turns the room's milliseconds into
 * an hour with localHour and hands it to the map (map.setLocalTime).
 *
 * Arithmetic only: the room may ask whether the light is gone.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * startHour   the local solar hour at the mission's start (16:40)
 * sunsetHour  when the sun's centre meets the horizon (sun.js sunsetHour,
 *             written here as a number so the room needs no trigonometry)
 * rate        hours of day per hour of room
 */
export const M1_CLOCK = { startHour: 16 + 40 / 60, sunsetHour: 18.2446, rate: 2.95 };

/* The local hour `roomMs` into a mission that started at `startedMs`. */
export function localHour(clock, startedMs, roomMs) {
  return clock.startHour + ((roomMs - startedMs) / 3600000) * clock.rate;
}

/* The room's milliseconds after the start at which the sun sets. */
export function sunsetMs(clock) {
  return ((clock.sunsetHour - clock.startHour) / clock.rate) * 3600000;
}
