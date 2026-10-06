/*
 * sun.js: where the Interior's sun stands at a local hour, for the
 * drawing only (the room needs no sun: src/share/interior/clock.js holds
 * the mission's hours as numbers).
 *
 * The day is the dry season's end, when the region burns and the air is
 * hazy (BIBLE.md 2.3, M1 "hot, hazy, light wind"): the sun's declination
 * DECLINATION, at the land's latitude LATITUDE, rounded to the degree so
 * nothing here pins a place. Local hours are solar hours: the game's
 * clock is the story's, not a time zone's.
 *
 * Trigonometry is allowed here and only here: this is the screen's sky,
 * never something the room or the physics computes.
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

const RAD = Math.PI / 180;
/* Degrees: south of the equator, and the sun a little south of it. */
const LATITUDE = -22;
const DECLINATION = -9;

/*
 * The sun at a local solar hour: { azimuth, elevation } in radians,
 * azimuth clockwise from north (world -z), and the direction toward it as
 * world [x, y, z] (x east, z south, y up).
 */
export function sunAt(hours) {
  const lat = LATITUDE * RAD;
  const dec = DECLINATION * RAD;
  const ha = (hours - 12) * 15 * RAD;
  const sinEl = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha);
  const el = Math.asin(sinEl);
  const cosAz = (Math.sin(dec) - Math.sin(el) * Math.sin(lat)) / (Math.cos(el) * Math.cos(lat));
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  if (ha > 0) {
    az = 2 * Math.PI - az;
  }
  const dir = [Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)];
  return { azimuth: az, elevation: el, dir };
}

/* The local hour the sun's centre touches the horizon in the evening. */
export function sunsetHour() {
  let lo = 12;
  let hi = 20;
  for (let k = 0; k < 40; k += 1) {
    const mid = (lo + hi) / 2;
    if (sunAt(mid).elevation > 0) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return lo;
}
