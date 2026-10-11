/*
 * spillway-outro.js: The Spillway's outro (docs/campaign/
 * SPILLWAY-OUTRO.md), played on a win only (main.js warOutroFrame, the
 * mission's `outro`). The spill running, a bird home on the pier, the
 * river quiet, and the switchyard in the late light: tonight's target,
 * Lights Out's premise, without its card while it is held. Data only
 * (src/share/war/film.js). The win's line opens it, so the win is said
 * once (warradio.js OUTROS). The intro's frame (spillway.js) is reused.
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

import AT from '../itaipu-targets.js';
import { CREST_Y, crest } from './2030.js';
import {
  MID, PLUME, UPSTREAM_A, gate,
} from './spillway.js';

const YARD = AT['yard-right'].at;

export default {
  id: 'spillway-outro',
  version: 1,
  cast: {
    ten: { airframe: '10inch', spins: true },
  },
  routes: {},
  agents: [],
  shots: [
    {
      id: 'spill',
      min: 8,
      grade: 'steel',
      lines: [{ line: 'debrief-itaipu-2-win', lead: 1.0, tail: 1.2 }],
      /* On round from where the intro's orbit left the gates, the spill
       * running into the chute's spray. */
      camera: {
        type: 'orbit', lens: 35, centre: MID, r: 230, h: 100, a: [UPSTREAM_A - Math.PI * 0.55, UPSTREAM_A - Math.PI * 0.75], look: [MID, PLUME],
      },
      fade: [[0, 1], [1.0, 0]],
      out: 'cut',
    },
    {
      id: 'pier',
      min: 5,
      grade: 'warm',
      lines: [{ line: 'film-itaipu-2-o2', lead: 0.8, tail: 0.8 }],
      /* The intro's pier shot turned round: the ten inch home, its props
       * running down. */
      camera: {
        type: 'handheld', lens: 50, at: gate(1.66, 1.2, 225.75), look: { cast: 'ten', up: 0.15 }, amp: 0.006, drift: 2,
      },
      cast: {
        ten: { keys: [{ t: 0, p: gate(1.5, 0.4, null), yaw: UPSTREAM_A - Math.PI / 2 }], spin: [[0, 110], [2.5, 0]] },
      },
      out: 'cut',
    },
    {
      id: 'river',
      min: 7,
      grade: 'steel',
      lines: [{ line: 'film-itaipu-2-o3', lead: 1.2, tail: 1.0 }],
      /* From over the gates' downstream side, a long lens down the chute
       * onto the plume and the river below it. */
      camera: {
        type: 'telephoto', lens: 50, ease: 'lin', at: gate(8, -40, 270), look: [PLUME, [PLUME[0] + 40, PLUME[1] - 10, PLUME[2] + 260]],
      },
      out: 'dip',
    },
    {
      id: 'yard',
      min: 10,
      grade: 'warm',
      lines: [{ line: 'film-itaipu-2-o4', lead: 1.0, tail: 1.6 }],
      /* The right bank's switchyard from the crest, as First Light's
       * outro saw it. No title card while Lights Out is held (FIRST-LIGHT-
       * OUTRO.md section 5). */
      camera: {
        type: 'telephoto', lens: 300, ease: 'lin', at: crest(2, -20, CREST_Y + 18), look: [[YARD[0] - 60, YARD[1] + 12, YARD[2]], [YARD[0] + 60, YARD[1] + 12, YARD[2]]],
      },
      out: 'handoff',
    },
  ],
};
