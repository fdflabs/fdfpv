/*
 * spotfilm.js: the end scene of being spotted (docs/campaign/interior/
 * CONTRACT-SPOTTED.md): a camera cut from the pilot's view to a wide,
 * slow orbit high over the people as they scatter, for the spotter's
 * `scene` seconds, then the fail card. A film for the war's player
 * (src/share/war/film.js), built when it happens, because where the
 * people are is only known then.
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

/* The orbit: wide enough to hold a group running 50 m apart, high
 * enough to read as a watcher's picture, a sixth of a turn. */
export const SPOT_ORBIT = { r: 260, h: 180, turn: 1.05, lens: 40 };

/*
 * The film over the people at `at` ([x, z] in the world's metres, three
 * frame) of map `map`, `s` seconds long, starting on the side of
 * bearing `from` (radians, the aircraft's side, so the cut keeps the
 * screen's direction).
 */
export function spotFilm(map, at, s, from = 0) {
  if (!(s > 0) || !Array.isArray(at) || !at.every(Number.isFinite)) {
    throw new Error('spotfilm: needs a length and a place');
  }
  return {
    id: 'spotted',
    version: 1,
    map,
    music: null,
    cast: {},
    shots: [{
      id: 'scatter',
      min: s,
      grade: 'steel',
      camera: {
        type: 'orbit', agl: true, ease: 'io', centre: [at[0], 0, at[1]], r: SPOT_ORBIT.r, h: SPOT_ORBIT.h, a: [from, from + SPOT_ORBIT.turn], lens: SPOT_ORBIT.lens,
      },
      out: 'cut',
    }],
  };
}
