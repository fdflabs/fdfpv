/*
 * clock.js: the hour of the Interior's day a mission stands at, on the
 * room's clock (TECH-NEEDS N1, F12: "a sun that moves across a mission on
 * the room clock").
 *
 * Mission 1 is "16:40 into sunset; the return at sunset" (MISSIONS.md
 * M1). Sixteen forty to the sun's setting is about an hour and a half of
 * the day (src/maps/interior/sun.js), so the day runs faster than the
 * room: RATE hours of day for every hour of room. The light is a fail
 * (interior-1.js), so RATE is set from a measured run, not the script's
 * 20 to 30 minutes: a first timer at the Bramor's speeds, its track a
 * fifth longer than the straight line, two minutes searching and eight
 * seconds lining up each still (interior-stages-selftest.js, light),
 * lands 48.2 min after the go at 18 m/s, 42.5 at 22 and 39.6 at 25 (at
 * 2.95 the sun set at 32.1 min and every one of them lost the light).
 * 1.58 puts the sunset at 59.9 min: 11.7 min of light left at 18 m/s,
 * while a pilot who dawdles or gets lost still loses it. The room owns
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
export const M1_CLOCK = { startHour: 16 + 40 / 60, sunsetHour: 18.2446, rate: 1.58 };

/*
 * Missions 2 and 3 (BIBLE.md 2.3): until they had clocks both drew M1's
 * 16:40, the hazy gold afternoon, under every mission. No light rule ends
 * either, so their rates are picked for the picture, not measured.
 *
 * M2 "early morning into midday": 06:45, the sun 14 degrees up in the
 * east. At M1's rate a 35 minute run would end at 07:40; at 3 it ends
 * near 08:30, the sun at 38 degrees, the morning light gone into the day
 * (midday itself would need a sun that visibly crawls, about 9 hours of
 * day an hour of room). The overcast is the look's (look.js WEATHER).
 *
 * M3 "late afternoon into night": 17:15, the sun 14 degrees up in the
 * west, at M1's rate, so the Interior's evening runs at one speed. The
 * sun sets 37.8 min after the go, inside the mission's 30 to 40 minutes,
 * and the frame turns night (daytime.js NIGHT_SIN) about 8 minutes later:
 * the light goes as the mission ends, and thermal matters more as it goes
 * (MISSIONS.md M3).
 */
export const M2_CLOCK = { startHour: 6.75, sunsetHour: 18.2446, rate: 3 };
export const M3_CLOCK = { startHour: 17.25, sunsetHour: 18.2446, rate: 1.58 };

/* The local hour `roomMs` into a mission that started at `startedMs`. */
export function localHour(clock, startedMs, roomMs) {
  return clock.startHour + ((roomMs - startedMs) / 3600000) * clock.rate;
}

/* The room's milliseconds after the start at which the sun sets. */
export function sunsetMs(clock) {
  return ((clock.sunsetHour - clock.startHour) / clock.rate) * 3600000;
}
