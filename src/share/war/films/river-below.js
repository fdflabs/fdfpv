/*
 * river-below.js: mission 5's film, "The River Below" (docs/campaign/
 * INTROS.md section 5.5): speed and a new place. The river far below the
 * dam, a ride up the gorge the way the swarms will come, MIRADOR's scope
 * with every track rising from one stretch of river, the heavy aircraft
 * on the road, and the rise over the powerhouse. Carancho's flight runs
 * out of birds on the radio. Data only (src/share/war/film.js).
 *
 * Departures from 5.5, each for something the player does not have, and
 * the film does not fake. Shot 1 has no smudge of smoke downriver: a film
 * draws no smoke but a hit target's. Shot 3 starts its own rider nearer
 * the face and runs 8 s, not 6: a swarm's 21 m/s covers 126 m in 6 s, so
 * the shot 2 rider would still be in the gorge. The SCOPE's tracks are FPV groups climbing off one
 * point on the river, the carrier's (itaipu-5.js river-surface), which
 * the scope does not draw itself.
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
  CAST, CREST_Y, FACE_UP, LINE_AT, LINE_OFF, along, crest,
} from './2030.js';
import { PLUME } from './spillway.js';

/* The river below the dam (the map's water.json `river`). */
const RIVER_Y = 103.5;
/* Where the carrier holds on the river (itaipu-5.js river-surface's end),
 * the point the scope's tracks climb off. */
const SOURCE = [-900, RIVER_Y, 300];
/* The heavy pair on the road, side by side where the line of aircraft
 * stands (2030.js), 5 m apart: the ten inch and the Striker. */
const PAIR_MID = (along('ten') + along('strk')) / 2;
const onRoad = (x) => ({ keys: [{ t: 0, p: crest(LINE_AT, LINE_OFF, null, PAIR_MID + x), yaw: FACE_UP }] });

export default {
  id: 'river-below',
  version: 2,
  cast: {
    ten: CAST.ten,
    strk: CAST.strk,
  },
  routes: {
    /* Up the river 10 m over the water and into the gorge, the swarm's
     * way (itaipu-5.js gorge, from lower down). */
    'river-run': [[-1100, 114, 700], [-980, 114, 500], [-900, 114, 300], [-800, 116, 100], [-740, 120, -100], [-660, 126, -300], [-560, 132, -500]],
    /* The last of the gorge to the downstream face, and the pull up. */
    'face-run': [[-120, 178, -1150], [-30, 181, -1300], [0, 182, -1360], [15, 215, -1420], [25, 255, -1455]],
    /* What the scope shows: groups climbing off one point on the river. */
    'scope-launch': [[SOURCE[0], SOURCE[1] + 2, SOURCE[2]], [-760, 180, 0], [-640, 180, -450], [-400, 180, -800]],
  },
  agents: [
    {
      id: 'rider', kind: 'fpv', route: 'river-run', n: 1, pass: { shot: 'gorge', at: 0, point: [-940, 114, 400] }, shots: ['gorge'],
    },
    {
      id: 'rider2', kind: 'fpv', route: 'face-run', n: 1, pass: { shot: 'face', at: 0, point: [-30, 181, -1300] }, shots: ['face'],
    },
    {
      id: 'l1', kind: 'fpv', route: 'scope-launch', n: 3, pass: { shot: 'scope', at: { at: 'end' }, point: [-640, 180, -450] }, shots: [],
    },
    {
      id: 'l2', kind: 'fpv', route: 'scope-launch', n: 3, pass: { shot: 'scope', at: { at: 'end' }, point: [-760, 180, 0] }, shots: [],
    },
    {
      id: 'l3', kind: 'fpv', route: 'scope-launch', n: 3, pass: { shot: 'scope', at: { at: 'end' }, point: [-830, 142.75, 150] }, shots: [],
    },
  ],
  shots: [
    {
      id: 'river',
      min: 6,
      grade: 'steel',
      lines: [{ line: 'film-itaipu-5-1', lead: 1.0, tail: 1.0 }],
      /* The river far below the dam on a long lens, in the morning haze,
       * down its reach to the south west. */
      camera: {
        type: 'telephoto', lens: 400, ease: 'hold', at: [-450, 230, -1000], look: [-1300, 110, 1600],
      },
      /* The slate (INTROS.md 1.8): where, when and the stakes. */
      titles: [
        {
          key: 'war.slate.itaipu_5.place', when: 'war.slate.itaipu_5.when', sub: 'war.slate.itaipu_5.stakes', from: 1.5, to: { at: 'end', s: -0.8 }, kind: 'slate',
        },
      ],
      fade: [[0, 1], [1.2, 0]],
      out: 'cut',
    },
    {
      id: 'gorge',
      min: 9,
      grade: 'steel',
      lines: [{ line: 'film-itaipu-5-2', lead: 2.0, tail: 1.0 }],
      /* Riding a quad up the river 10 m over the water, upriver, the
       * gorge's walls closing in. */
      camera: {
        type: 'drone', lens: 14, ride: { agent: 'rider' }, back: 1.2, up: 0.35, lag: 60, ease: 'lin',
      },
      hero: { agent: 'rider', minPx: 40 },
      out: 'match',
    },
    {
      id: 'face',
      min: 8,
      grade: 'steel',
      /* The gorge's head, the downstream face and its penstocks ahead,
       * and the pull up at it. */
      camera: {
        type: 'drone', lens: 14, ride: { agent: 'rider2' }, back: 1.2, up: 0.35, lag: 60, ease: 'lin',
      },
      hero: { agent: 'rider2', minPx: 40 },
      out: 'smash',
    },
    {
      id: 'scope',
      min: 7,
      grade: 'steel',
      lines: [{ line: 'film-itaipu-5-3', lead: 0.5, tail: 1.0 }],
      /* MIRADOR's scope over the river: the tracks come from one place,
       * again and again. */
      camera: {
        type: 'telephoto', lens: 50, at: crest(9.5, 300, 260), look: crest(9.5, 2000, 240),
      },
      scope: {
        at: [-750, -300],
        r: 1700,
        groups: ['l1', 'l2', 'l3'],
        appear: [{ at: 'vo.start', s: 0.3 }, { at: 'vo.end', s: -0.5 }],
        lines: [[[-202.2, -1794.2], [430.8, -1655.0]]],
        marks: [
          { key: 'war.scope.dam', at: [110, -1560] },
          { key: 'war.scope.river', at: [-1050, 650] },
        ],
      },
      out: 'cut',
    },
    {
      id: 'road',
      min: 6,
      grade: 'warm',
      /* The ten inch and the Striker on the crest road, readied by
       * nobody. */
      camera: {
        type: 'handheld', lens: 35, at: crest(LINE_AT, LINE_OFF + 9, CREST_Y + 1.4, PAIR_MID + 1), look: crest(LINE_AT, LINE_OFF, CREST_Y + 0.5, PAIR_MID), amp: 0.008, drift: 2.5,
      },
      cast: { ten: onRoad(-2.5), strk: onRoad(2.5) },
      out: 'cut',
    },
    {
      id: 'rise',
      min: 11,
      grade: 'steel',
      lines: [{ line: 'film-itaipu-5-4', lead: 2.5, tail: 1.0 }],
      /* Out of the plunge pool's spray below the spillway's jets, rising
       * over the powerhouse, the river and the gorge below. */
      camera: {
        type: 'crane', lens: 24, base: [PLUME[0] + 70, RIVER_Y, PLUME[2] + 40], h: [3, 140], look: [[60, 175, -1560], [-1000, 120, 600]],
      },
      titles: [
        {
          mission: true, from: 5.0, to: { at: 'end', s: -0.6 }, kind: 'mission',
        },
      ],
      out: 'handoff',
    },
  ],
};
