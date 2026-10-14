/*
 * lights-out-outro.js: Lights Out's outro (docs/campaign/
 * LIGHTS-OUT-OUTRO.md), played on a win only (main.js warOutroFrame, the
 * mission's `outro`). The yard standing in the last light, a bird home on
 * the crest, the west arm empty, and the lines out of the yard: the night
 * that comes next, The Long Night's premise, without its card while it is
 * held. Data only (src/share/war/film.js). The win's line opens it, so
 * the win is said once (warradio.js OUTROS). The intro's frame
 * (lights-out.js) and First Light's line of aircraft (2030.js) are reused.
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

import {
  CAST, CREST_Y, FACE_UP, LINE_AT, LINE_OFF, along, crest, lineCast, linePlace,
} from './2030.js';
import {
  CORRIDOR_AT, TOWERS, TOWN, YARD,
} from './lights-out.js';

/* A quad home: down onto its place in the line from 2.5 m over it, as
 * First Light's outro has it (first-light-outro.js). */
const home = linePlace('q2');
const landing = {
  keys: [
    { t: 0, p: [home[0], CREST_Y + 2.5, home[2]], yaw: FACE_UP },
    { t: 1.6, p: [home[0], CREST_Y + 0.4, home[2]], yaw: FACE_UP },
    { t: 2.0, p: home, yaw: FACE_UP },
  ],
  spin: [[0, 80], [2.0, 60], [3.0, 0]],
};

export default {
  id: 'lights-out-outro',
  version: 1,
  cast: CAST,
  routes: {},
  agents: [],
  shots: [
    {
      id: 'yard',
      min: 8,
      grade: 'dusk',
      lines: [{ line: 'debrief-itaipu-3-win', lead: 1.0, tail: 1.2 }],
      /* On round over the yard from where the intro's orbit left it:
       * whole, or smoking where the squad let one through. */
      camera: {
        type: 'orbit', lens: 24, centre: YARD, r: 360, h: 140, a: [Math.PI * 0.37, Math.PI * 0.2], look: [YARD, TOWN],
      },
      fade: [[0, 1], [1.0, 0]],
      out: 'cut',
    },
    {
      id: 'rack',
      min: 5,
      grade: 'dusk',
      lines: [{ line: 'film-itaipu-3-o2', lead: 0.8, tail: 0.8 }],
      /* A survivor settling on its pad on the crest, props running down:
       * First Light's rack shot, at the end of the day. */
      camera: {
        type: 'handheld', lens: 24, at: crest(LINE_AT, LINE_OFF + 2.4, CREST_Y + 0.8, along('q2') + 0.6), look: { cast: 'q2', up: 0.1 }, amp: 0.01, drift: 2,
      },
      cast: { ...lineCast(['strk', 'q2', 'q3', 'int2']), q2: { as: 'q2s', ...landing } },
      out: 'cut',
    },
    {
      id: 'west-arm',
      min: 7,
      grade: 'dusk',
      lines: [{ line: 'film-itaipu-3-o3', lead: 1.2, tail: 1.0 }],
      /* The west arm from low over the water, empty, the pan running up
       * it to the far shore. */
      camera: {
        type: 'telephoto', lens: 50, ease: 'lin', at: [-1600, 245, -1900], look: [[-1700, 222, -3200], [-2300, 222, -3400]],
      },
      out: 'dip',
    },
    {
      id: 'lines',
      min: 10,
      grade: 'night',
      lines: [{ line: 'film-itaipu-3-o4', lead: 1.0, tail: 1.6 }],
      /* The intro's towers out of the yard, the pan run back toward it.
       * No title card while The Long Night is held. */
      camera: {
        type: 'telephoto', lens: 300, ease: 'lin', at: CORRIDOR_AT, look: [TOWERS[1], TOWERS[0]],
      },
      out: 'handoff',
    },
  ],
};
