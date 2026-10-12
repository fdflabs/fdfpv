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

/*
 * THE GAME CLOCK (slice 2, owner 2026-10-10: one game time per room,
 * shared by all its players; night reachable in normal play). A clock is
 * { hour, rate, at }: the local solar hour `hour` at room ms `at`, and
 * `rate` hours of day per hour of room (0, the time standing, for a
 * chosen time and a war mission's; the Interior's M1_CLOCK rate for its
 * missions). null is no clock: each world at its own time, as before
 * clocks. The room server makes the clock (edge/rooms/core.js daytime)
 * and every pilot's screen reads the same one; solo, the pilot's
 * setting or the address makes it (src/main.js gameClock).
 */

/* The hour each named time stands for, on the Interior's sun
 * (src/maps/interior/sun.js): the hour whose sun is nearest the name's
 * SUN_OF elevation on the same side of noon, to the minute. Noon is the
 * sun's highest, 77 degrees at this latitude and season, under TIMES's
 * 87. Night is any hour well after dusk. npm run daytime:selftest holds
 * each within a degree. */
export const TIME_HOUR = Object.freeze({
  day: 10 + 35 / 60,
  morning: 7 + 47 / 60,
  noon: 12,
  golden: 17 + 40 / 60,
  night: 22,
});

/* Sine of the sun's elevation at a local solar hour: sun.js's arithmetic,
 * copied for the same reason as the names above (sun.js is a map
 * module); the selftest holds them equal minute by minute. */
const LAT_RAD = (-22 * Math.PI) / 180;
const DEC_RAD = (-9 * Math.PI) / 180;
export function sunSinAt(hour) {
  const ha = (((hour - 12) * 15) * Math.PI) / 180;
  return Math.sin(LAT_RAD) * Math.sin(DEC_RAD) + Math.cos(LAT_RAD) * Math.cos(DEC_RAD) * Math.cos(ha);
}

const DAYLIGHT = TIME_NAMES.filter((n) => n !== 'night');

/* The named time a world built at one time (Itaipu's) is built at for an
 * hour: night when the sun is down by NIGHT_SIN, else the daylight name
 * whose hour is nearest. TIME_HOUR's own hours come back as their names. */
export function timeOfHour(hour) {
  const h = ((hour % 24) + 24) % 24;
  if (isNightSun(sunSinAt(h))) {
    return 'night';
  }
  let best = DAYLIGHT[0];
  for (const n of DAYLIGHT) {
    if (Math.abs(TIME_HOUR[n] - h) < Math.abs(TIME_HOUR[best] - h)) {
      best = n;
    }
  }
  return best;
}

/* A named time as a standing clock; null (each world's own) is no clock. */
export function clockOfTime(name) {
  nightOfTime(name); /* throws on a name outside TIME_NAMES */
  return name == null ? null : Object.freeze({ hour: TIME_HOUR[name], rate: 0, at: 0 });
}

/* A clock from the network or the address, or null: anything that is not
 * three finite numbers with the start hour within a day is no clock. */
export function clockOf(x) {
  if (!x || typeof x !== 'object') {
    return null;
  }
  const { hour, rate, at } = x;
  if (![hour, rate, at].every(Number.isFinite) || hour < 0 || hour > 24) {
    return null;
  }
  return Object.freeze({ hour, rate, at });
}

/* The local hour on `clock` at room ms `roomMs`: src/share/interior/
 * clock.js localHour's arithmetic, which the selftest holds it to. A
 * standing clock needs no room time. */
export function hourAt(clock, roomMs) {
  return clock.rate === 0 ? clock.hour : clock.hour + ((roomMs - clock.at) / 3600000) * clock.rate;
}

/* The named time a world that is built once is built at: its clock's
 * start, so a moving clock never rebuilds it, or null for its own. */
export function timeOfClock(clock) {
  return clock ? timeOfHour(clock.hour) : null;
}

/*
 * THE FRAME'S DAYTIME: what the world the craft is in shows this frame,
 * published once a frame by the flight loop from the map's own flag
 * (scene.userData.timeOfDay, which Itaipu's night build and the
 * Interior's moving sun write), and read by everything that acts on the
 * dark: object detection's light, the world's sounds, the thermal
 * weather, a Night Timber's factory lights. One holder, so none of them
 * can disagree with the sky (FND-7 survey: five holders did). `time` is
 * the sounds' key: 'night' when the flag says so, else the named time the
 * world was built at, never 'night' over a lit sky. The hangar and the
 * menus publish day.
 */
const frame = { night: false, time: 'day' };
export function publishDaytime(night, builtAt) {
  frame.night = night === true;
  frame.time = frame.night ? 'night' : (builtAt !== 'night' && TIME_NAMES.includes(builtAt) ? builtAt : 'day');
}

/* The frame's { night, time }: one object, read, never kept or written. */
export function daytimeNow() {
  return frame;
}
