/*
 * lights-out.js: mission 3's film, "Lights Out" (docs/campaign/INTROS.md
 * section 5.3): the grid as the stake. The 500 kV lines leaving the
 * switchyard, the yard in the last light, the right bank's town it feeds,
 * and two Strikers over the west arm, one of them a decoy. Data only
 * (src/share/war/film.js).
 *
 * Three departures from 5.3, each for something the world does not do
 * yet. There is no GRID insert (DESPACHO's board): the film has MIRADOR's
 * scope and the Interior's BOARD, neither a grid, so DESPACHO's line plays
 * over Hernandarias on a long lens, the town the yard feeds. The town's
 * lights do not come on: the light does not change inside a film or a
 * mission (TECH-NEEDS T1.11), so the grade carries the dusk, and the
 * shot that crossed the edge of town (5.3's 4) is cut: with no lights
 * coming on it was the town shot again, 9 s of the same scrub and roofs
 * with no line over it (w50-films). And the last shot has no
 * aircraft on the road below: the orbit is the yard and the town beyond
 * it, with the mission's card.
 *
 * THE FRAME. Scene metres, y up, -z north. The yard's middle is YARD
 * (itaipu-targets.js yard-right), its equipment 225 to 249 m; the 500 kV
 * line west out of it runs from its portal at (-2546, -605) through
 * towers at (-2636, -310), (-2771, -157), (-2912, 11) and (-3546, 104)
 * (OpenStreetMap, src/maps/itaipu/town/power.js); Hernandarias's
 * southern districts are round (-4500, -1300) (grid.js DISTRICTS).
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

export const YARD = AT['yard-right'].at;
/* Hernandarias's southern districts, and the line's towers west. */
export const TOWN = [-4500, 228, -1300];
export const TOWERS = [[-2636, 262, -310], [-3546, 255, 104]];
/* Where the long lens on the towers stands: 900 m off the first, over
 * the yard's north side, so the line stacks up the frame rather than one
 * tower filling it. */
export const CORRIDOR_AT = [-2350, 290, -1150];
/* The intro's opening lens: on the line's own axis, 900 m behind its
 * first tower, so the first four (bearings 28.5 to 31.4 degrees from
 * here) stack inside the 300 mm frame for the whole shot instead of the
 * pan leaving them for open scrub. */
const STACK_AT = [-2178, 262, -1340];
/* A low place on the yard's pad between two rows of its equipment. */
const AISLE = [-2270, 225, -455];

export default {
  id: 'lights-out',
  version: 3,
  routes: {
    /* The stage 1 pair down the west arm, side by side: the same shape,
     * the same speed. */
    'pair-real': [[-1608, 249, -4200], [-1608, 249, -1700]],
    'pair-lie': [[-1592, 249, -4200], [-1592, 249, -1700]],
  },
  agents: [
    {
      id: 'real', kind: 'strike', route: 'pair-real', n: 1, pass: { shot: 'pair', at: { at: 'end' }, point: [-1608, 249, -2250] }, shots: ['pair'],
    },
    {
      id: 'lie', kind: 'decoy', route: 'pair-lie', n: 1, pass: { shot: 'pair', at: { at: 'end' }, point: [-1592, 249, -2250] }, shots: ['pair'],
    },
  ],
  shots: [
    {
      id: 'corridor',
      min: 8,
      grade: 'dusk',
      /* The line's towers out of the yard, stacked by the long lens, the
       * pan running west along them toward the horizon. */
      camera: {
        type: 'telephoto', lens: 300, ease: 'io', at: STACK_AT, look: [[-2680, 258, -460], [-2900, 258, -130]],
      },
      /* The slate (INTROS.md 1.8): where, when and the stakes. */
      titles: [
        {
          key: 'war.slate.itaipu_3.place', when: 'war.slate.itaipu_3.when', sub: 'war.slate.itaipu_3.stakes', from: 1.5, to: { at: 'end', s: -0.8 }, kind: 'slate',
        },
      ],
      fade: [[0, 1], [1.2, 0]],
      out: 'cut',
    },
    {
      id: 'yard',
      min: 9,
      grade: 'dusk',
      lines: [{ line: 'film-itaipu-3-1', lead: 2.0, tail: 1.0 }],
      /* Low in an aisle of the yard, rising out of it between the rows
       * and over them, toward the dam. */
      camera: {
        type: 'crane', lens: 24, base: AISLE, h: [3, 70], look: [[YARD[0], YARD[1] + 6, YARD[2]], [-900, 240, -1300]],
      },
      out: 'cut',
    },
    {
      id: 'town',
      min: 7,
      grade: 'dusk',
      lines: [{ line: 'film-itaipu-3-2', lead: 0.5, tail: 1.0 }],
      /* DESPACHO's line over the town the yard feeds, on a long lens from
       * over the right bank. */
      camera: {
        type: 'telephoto', lens: 135, ease: 'lin', at: [-3500, 300, -1000], look: [TOWN, [TOWN[0] - 150, TOWN[1], TOWN[2] + 100]],
      },
      out: 'cut',
    },
    {
      id: 'pair',
      min: 7,
      grade: 'dusk',
      lines: [{ line: 'film-itaipu-3-3', lead: 1.0, tail: 1.0 }],
      /* Two Strikers head on over the west arm, identical; one is the
       * decoy. */
      camera: {
        type: 'telephoto', lens: 400, ease: 'lin', at: [-1600, 245, -1900], look: [[-1600, 249, -2440], [-1600, 249, -2250]],
      },
      hero: { agent: 'real', minPx: 60 },
      out: 'cut',
    },
    {
      id: 'orbit',
      min: 15,
      grade: 'dusk',
      lines: [{ line: 'film-itaipu-3-4', lead: 3.0, tail: 1.0 }],
      /* A quarter turn over the yard from the east, the town beyond it. */
      camera: {
        type: 'orbit', lens: 24, centre: YARD, r: 320, h: 120, a: [Math.PI * 0.62, Math.PI * 0.37], look: [YARD, TOWN],
      },
      titles: [
        {
          mission: true, from: 7.0, to: { at: 'end', s: -0.6 }, kind: 'mission',
        },
      ],
      out: 'handoff',
    },
  ],
};
