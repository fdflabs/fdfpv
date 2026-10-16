/*
 * corridor.js: mission 6's film, "The Corridor" (docs/campaign/INTROS.md
 * section 5.6): scale. A 500 kV tower from its foot, a ride down the
 * west corridor at wire height, the town the line feeds, one Striker
 * following the wires on a long lens, two of the squad's aircraft on the
 * crest road in the golden light, and the rise until both corridors are
 * lines into the dusk. Data only (src/share/war/film.js).
 *
 * Two departures from 5.6, each for something the game does not have.
 * There is no GRID insert (DESPACHO's board), which no film camera
 * draws, so DESPACHO's line plays over the far end of the west corridor,
 * its last towers marching into Hernandarias, the town they feed, as
 * Lights Out's does over the town its yard feeds. Shot 5 shows the
 * Striker fixed wing and the interceptor, not the Bramor and the
 * Skyhunter: only the war's aircraft fly in a war (configs/airframes.js
 * WAR_AIRFRAMES, held by films:lint), and any of them spots (itaipu-6.js
 * SPOTTING).
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

import TOWERS from '../itaipu-towers.js';
import {
  CAST, CREST_Y, FACE_UP, LINE_AT, LINE_OFF, along, crest,
} from './2030.js';

/* A west corridor tower's foot, and a point `up` metres over it. */
const W = TOWERS.w;
const over = (k, up) => [W[k].x, W[k].y + up, W[k].z];
/* 15 m out from the line on its north side, 29 m over the tower's foot:
 * level with the phases (power.js, a 500 kV tower's hang at 30.6 m),
 * 4 m clear of the outer one at 11 m. */
const OUT = W.map((_, k) => {
  const a = W[Math.max(0, k - 1)];
  const b = W[Math.min(W.length - 1, k + 1)];
  const m = Math.hypot(b.x - a.x, b.z - a.z);
  return [(-(b.z - a.z) / m) * 15, ((b.x - a.x) / m) * 15];
});
const beside = (k) => [W[k].x + OUT[k][0], W[k].y + 29, W[k].z + OUT[k][1]];
/* Hernandarias's west district (src/share/war/grid.js hernandarias-w),
 * where the west corridor's last towers run. */
const TOWN_W = [-4900, 215, 600];
/* The Striker and the interceptor on the crest road where the line of
 * aircraft stands (2030.js), side by side. */
const PAIR_MID = (along('strk') + along('int')) / 2;
const onRoad = (x) => ({ keys: [{ t: 0, p: crest(LINE_AT, LINE_OFF, null, PAIR_MID + x), yaw: FACE_UP }] });

export default {
  id: 'corridor',
  version: 1,
  cast: {
    strk: CAST.strk,
    int: CAST.int,
  },
  routes: {
    /* Along the west corridor toward the dam, 6 m over its towers'
     * tops: following the wires. */
    'wires-in': [over(9, 51), over(8, 51), over(7, 51), over(6, 51), over(5, 51)],
  },
  agents: [
    {
      id: 'one', kind: 'strike', route: 'wires-in', n: 1, pass: { shot: 'wires', at: 4.0, point: over(7, 51) }, shots: ['wires'],
    },
  ],
  shots: [
    {
      id: 'tower',
      min: 9,
      grade: 'warm',
      /* A quarter orbit at the foot of the west corridor's second
       * tower, tilting up its legs to the crossarm against the sky. */
      camera: {
        type: 'orbit', lens: 24, centre: over(1, 0), r: 22, h: 2, a: [Math.PI * 1.15, Math.PI * 1.4], look: [over(1, 14), over(1, 44)],
      },
      fade: [[0, 1], [1.2, 0]],
      out: 'match',
    },
    {
      id: 'ride',
      min: 9,
      grade: 'warm',
      lines: [{ line: 'film-itaipu-6-1', lead: 1.5, tail: 1.0 }],
      /* Down the corridor level with the wires, the towers passing on
       * the lens's left. */
      camera: {
        type: 'dolly', lens: 24, ease: 'lin', path: [beside(1), beside(2), beside(3)], look: [over(3, 30), over(4, 30)],
      },
      out: 'cut',
    },
    {
      id: 'town',
      min: 8,
      grade: 'warm',
      lines: [{ line: 'film-itaipu-6-2', lead: 0.5, tail: 1.0 }],
      /* DESPACHO's line over the town the west corridor feeds: its last
       * towers marching into Hernandarias, on a long lens from over the
       * right bank. */
      camera: {
        type: 'telephoto', lens: 85, ease: 'lin', at: [-3300, 360, -350], look: [over(7, 20), TOWN_W],
      },
      out: 'cut',
    },
    {
      id: 'wires',
      min: 8,
      grade: 'warm',
      lines: [{ line: 'film-itaipu-6-3', lead: 1.5, tail: 1.0 }],
      /* The west corridor to the horizon on a 600 mm lens, its towers
       * stacked, and one Striker coming down it along the wires. */
      camera: {
        type: 'telephoto', lens: 600, ease: 'lin', at: [-2930, 300, -110], look: { agent: 'one' },
      },
      hero: { agent: 'one', minPx: 40 },
      out: 'cut',
    },
    {
      id: 'road',
      min: 6,
      grade: 'warm',
      /* The Striker and the interceptor on the crest road from behind
       * and above, the reservoir beyond them: tonight's eyes. */
      camera: {
        type: 'handheld', lens: 35, at: crest(LINE_AT, LINE_OFF - 6, CREST_Y + 3.5, PAIR_MID + 5), look: crest(LINE_AT, LINE_OFF + 3, CREST_Y + 0.3, PAIR_MID - 1), amp: 0.008, drift: 2.5,
      },
      cast: { strk: onRoad(-2), int: onRoad(2) },
      out: 'cut',
    },
    {
      id: 'rise',
      min: 15,
      grade: 'dusk',
      lines: [{ line: 'film-itaipu-6-4', lead: 3.0, tail: 1.0 }],
      /* From the crest road very high over the dam, until both
       * corridors are lines running away to the south west and the
       * south east. */
      camera: {
        type: 'crane', lens: 18, base: crest(LINE_AT, LINE_OFF, CREST_Y, PAIR_MID - 12), h: [3, 420], look: [crest(4, LINE_OFF, CREST_Y), [-600, 150, 1800]],
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
