/*
 * long-night-outro.js: The Long Night's outro, played on a win only
 * (main.js warOutroFrame, the mission's `outro`). The night is over: the
 * dam lit and standing, a bird home on the crest with its props running
 * down, MIRADOR's scope empty at last, and the river below the dam, where
 * day two's attack comes from (The River Below's premise), without its
 * card while it is held. Its first line is the mission's win debrief, so
 * the win is said once (warradio.js OUTROS). Data only
 * (src/share/war/film.js); the intro's frame (long-night.js, 2030.js) is
 * reused.
 *
 * It plays in the match's night world: the world has no dawn to show
 * (TECH-NEEDS T1.11), so the film does not paint one on, and the sunrise
 * is the win line's words. No attacker, no person, only the war's
 * aircraft.
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
  CREST_Y, LINE_AT, LINE_OFF, along, crest, standing,
} from './2030.js';

/* The dam's middle on the crest, and the orbit's angle (0 is +z, south)
 * from the reservoir's side round to the east. */
const MID = crest(9.5, 0, CREST_Y + 1);
const NORTH_A = Math.PI;

export default {
  id: 'long-night-outro',
  version: 1,
  cast: {
    ten: { airframe: '10inch', spins: true },
  },
  routes: {},
  agents: [],
  shots: [
    {
      id: 'crest',
      min: 8,
      grade: 'night',
      lines: [{ line: 'debrief-itaipu-4-win', lead: 1.0, tail: 1.2 }],
      /* Round the lit dam from over the reservoir, slowly. */
      camera: {
        type: 'orbit', lens: 35, centre: MID, r: 260, h: 90, a: [NORTH_A * 0.9, NORTH_A * 0.72], look: MID,
      },
      fade: [[0, 1], [1.0, 0]],
      out: 'cut',
    },
    {
      id: 'home',
      min: 5,
      grade: 'night',
      lines: [{ line: 'film-itaipu-4-o2', lead: 0.8, tail: 0.8 }],
      /* The ten inch on the crest deck, its props running down. */
      camera: {
        type: 'handheld', lens: 35, at: crest(LINE_AT, LINE_OFF + 0.9, CREST_Y + 0.3, along('ten') + 0.1), look: { cast: 'ten', up: 0.05 }, amp: 0.008, drift: 2,
      },
      cast: {
        ten: { ...standing('ten'), spin: [[0, 110], [2.5, 0]] },
      },
      out: 'cut',
    },
    {
      id: 'scope',
      min: 7,
      grade: 'night',
      lines: [{ line: 'film-itaipu-4-o3', lead: 0.8, tail: 1.0 }],
      /* MIRADOR's scope, the open water empty. */
      camera: {
        type: 'telephoto', lens: 50, at: crest(9.5, 300, 260), look: crest(9.5, 2000, 240),
      },
      scope: {
        at: [250, -2700],
        r: 1800,
        groups: [],
        lines: [[[-202.2, -1794.2], [430.8, -1655.0]]],
        marks: [
          { key: 'war.scope.dam', at: [110, -1560] },
        ],
      },
      out: 'dip',
    },
    {
      id: 'river',
      min: 10,
      grade: 'night',
      lines: [{ line: 'film-itaipu-4-o4', lead: 1.0, tail: 1.6 }],
      /* Over the downstream face, a long lens down the river below the
       * dam: day two's water. No title card while The River Below is
       * held. */
      camera: {
        type: 'telephoto', lens: 85, ease: 'lin', at: crest(9.5, -40, CREST_Y + 40), look: [[-700, 160, 300], [-900, 150, 900]],
      },
      out: 'handoff',
    },
  ],
};
