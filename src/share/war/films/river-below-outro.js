/*
 * river-below-outro.js: The River Below's outro (docs/campaign/
 * RIVER-BELOW-OUTRO.md), played on a win only (main.js warOutroFrame, the
 * mission's `outro`). The river quiet below the dam, the heavy pair home
 * on the crest road, MIRADOR's scope empty over the gorge, and the lines
 * leaving the dam: what they go after next, The Corridor's premise,
 * with no card, as no Act 1 outro has one. CARANCHO's win line opens
 * it, so the win is said once (warradio.js OUTROS). Data only
 * (src/share/war/film.js); the intro's frame (river-below.js) is
 * reused, its opening lens the same, now with nothing on the water.
 *
 * It plays in the match's day world. No attacker, no person, only the
 * war's aircraft.
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
  CAST, CREST_Y, LINE_AT, LINE_OFF, crest,
} from './2030.js';
import { PAIR_MID, RIVER_Y, onRoad } from './river-below.js';

/* On the west line's own axis, behind its first tower (lights-out.js
 * STACK_AT, higher): the towers stack as they leave for the towns. */
const LINES_AT = [-2178, 300, -1340];

export default {
  id: 'river-below-outro',
  version: 1,
  cast: {
    ten: { ...CAST.ten, spins: true },
    strk: CAST.strk,
  },
  routes: {},
  agents: [],
  shots: [
    {
      id: 'river',
      min: 8,
      grade: 'steel',
      lines: [{ line: 'debrief-itaipu-5-win', lead: 1.0, tail: 1.4 }],
      /* Down the river's reach from over the right bank, the gorge
       * quiet: the intro's opening lens, now with nothing on the water. */
      camera: {
        type: 'telephoto', lens: 135, ease: 'io', at: [-450, 240, -1000], look: [[-1150, RIVER_Y, 800], [-1250, RIVER_Y, 1050]],
      },
      fade: [[0, 1], [1.0, 0]],
      out: 'cut',
    },
    {
      id: 'home',
      min: 5,
      grade: 'warm',
      lines: [{ line: 'film-itaipu-5-o2', lead: 0.8, tail: 0.8 }],
      /* The ten inch home on the crest road, low and close, its props
       * running down, the Striker beside it. */
      camera: {
        type: 'handheld', lens: 35, at: crest(LINE_AT, LINE_OFF + 1.6, CREST_Y + 0.35, PAIR_MID - 2.1), look: { cast: 'ten', up: 0.1 }, amp: 0.006, drift: 2,
      },
      cast: { ten: { ...onRoad(-2.5), spin: [[0, 110], [2.5, 0]] }, strk: onRoad(2.5) },
      out: 'cut',
    },
    {
      id: 'scope',
      min: 7,
      grade: 'steel',
      lines: [{ line: 'film-itaipu-5-o3', lead: 0.8, tail: 1.0 }],
      /* MIRADOR's scope over the river, where the intro's tracks rose:
       * nothing. */
      camera: {
        type: 'telephoto', lens: 50, at: crest(9.5, 300, 260), look: crest(9.5, 2000, 240),
      },
      scope: {
        at: [-750, -300],
        r: 1700,
        groups: [],
        lines: [[[-202.2, -1794.2], [430.8, -1655.0]]],
        marks: [
          { key: 'war.scope.dam', at: [110, -1560] },
          { key: 'war.scope.river', at: [-1050, 650] },
        ],
      },
      out: 'dip',
    },
    {
      id: 'lines',
      min: 10,
      grade: 'warm',
      lines: [{ line: 'film-itaipu-5-o4', lead: 1.0, tail: 1.6 }],
      /* The west line's towers leaving the right bank for the towns, on
       * a long lens, the pan running out along them. */
      camera: {
        type: 'telephoto', lens: 200, ease: 'io', at: LINES_AT, look: [[-2650, 255, -560], [-2970, 250, -50]],
      },
      out: 'handoff',
    },
  ],
};
