/*
 * daytime.js: the one answer to "where is the sun and is it night" that
 * the page and the room can both import (FOUNDATIONS item 7,
 * docs/DAYTIME-CONTRACT.md). Three-free and arithmetic only, so a room or
 * a Node check can load it. Each map keeps its own look (colour,
 * exposure, sky); only the decision lives here.
 *
 * The numbers are the ones already shipping: the named times and their
 * sun are src/maps/itaipu/look/light.js TIMES, and the night threshold is
 * the Interior's (src/maps/interior/look.js setLocalTime). They are
 * copied, not imported, because light.js needs three; npm run
 * daytime:selftest fails the moment either side moves without the other.
 *
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

/* The times a world can be built at, in TIMES's order. */
export const TIME_NAMES = Object.freeze(['day', 'morning', 'noon', 'golden', 'night']);

/* The sun (or, at 'night', the moon standing where the day's sun does)
 * per named time: degrees, azimuth clockwise from north. Degrees because
 * that is how light.js states them; a renderer converts. */
export const SUN_OF = Object.freeze({
  day: Object.freeze({ azimuth: 90.1, elevation: 65.8 }),
  morning: Object.freeze({ azimuth: 106, elevation: 28 }),
  noon: Object.freeze({ azimuth: 180, elevation: 87 }),
  golden: Object.freeze({ azimuth: 248, elevation: 8 }),
  night: Object.freeze({ azimuth: 90.1, elevation: 65.8 }),
});

/* Sine of the sun's elevation at or below which it is night: the sun
 * 2.9 degrees under the horizon, the Interior's dusk flip since it
 * shipped. One threshold, so the sky, the sensors and the sounds turn
 * together. */
export const NIGHT_SIN = -0.05;

/* Night for a moving sun, from the sine of its elevation. */
export function isNightSun(sinEl) {
  return !(sinEl > NIGHT_SIN);
}

/* Night for a named time. null or undefined is the map's own, which is
 * day for every map today; a name outside TIME_NAMES is a caller's
 * mistake and throws, as light.js timeOf does. */
export function nightOfTime(name) {
  if (name == null) {
    return false;
  }
  if (!TIME_NAMES.includes(name)) {
    throw new Error(`daytime: time is one of ${TIME_NAMES.join(', ')}, got ${JSON.stringify(name)}`);
  }
  return name === 'night';
}
