/*
 * first-light-outro.js: First Light's outro (docs/campaign/
 * FIRST-LIGHT-OUTRO.md), played on a win only, after the match ends on
 * the room's clock. The day the intro opened on is over: the dam held,
 * one bird home, the water rising, the spillway's gates shut for the
 * afternoon (The Spillway's premise). Its first line is the mission's
 * win debrief, folded into the film (the owner, 2026-10-08), so the win
 * is said once. Data only.
 *
 * It plays in the match's own world, so a yard the squad let through
 * smokes in shot 2 as it does in play: the film needs no branch on the
 * result. No attacker, no person, only the war's aircraft. Its music is
 * every war film's, the war bed's intro track (FILMS.md 5: no new music).
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
import {
  CAST, CREST_Y, FACE_UP, LINE_AT, LINE_OFF, along, crest, lineCast, linePlace,
} from './2030.js';

const YARD = AT['yard-right'].at;
const GATE_MID = AT['gate-7'].at;

/* A quad home: down onto its place in the line from 2.5 m over it. */
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
  id: 'first-light-outro',
  version: 5,
  cast: CAST,
  routes: {},
  agents: [],
  shots: [
    {
      id: 'crest',
      min: 6,
      grade: 'warm',
      lines: [{ line: 'debrief-itaipu-1-win', lead: 1.0, tail: 1.2 }],
      /* Over the line of aircraft, fewer of them than the intro's, rising
       * over the upstream face to the reservoir in full day. */
      camera: {
        type: 'crane', lens: 24, base: crest(LINE_AT, LINE_OFF - 12, CREST_Y), h: [2, 45], look: [crest(LINE_AT, LINE_OFF, CREST_Y + 1), crest(LINE_AT, 1500, 230)],
      },
      cast: lineCast(['strk', 'q3', 'int2']),
      fade: [[0, 1], [1.0, 0]],
      out: 'cut',
    },
    {
      id: 'yard',
      min: 5,
      grade: 'warm',
      /* The right bank's switchyard on a long lens from the crest: whole,
       * or smoking where the squad let a Striker through. */
      camera: {
        type: 'telephoto', lens: 300, ease: 'lin', at: crest(2, -20, CREST_Y + 18), look: [[YARD[0] + 60, YARD[1] + 12, YARD[2]], [YARD[0] - 60, YARD[1] + 12, YARD[2]]],
      },
      out: 'cut',
    },
    {
      id: 'rack',
      min: 5,
      grade: 'warm',
      lines: [{ line: 'film-itaipu-1-o2', lead: 0.8, tail: 0.8 }],
      /* One survivor settling on its pad among the others, props running
       * down; low on the deck as the intro's spin up, the lens on it. */
      camera: {
        type: 'handheld', lens: 24, at: crest(LINE_AT, LINE_OFF + 2.4, CREST_Y + 0.8, along('q2') + 0.6), look: { cast: 'q2', up: 0.1 }, amp: 0.01, drift: 2,
      },
      cast: { ...lineCast(['strk', 'q2', 'q3', 'int2']), q2: { as: 'q2s', ...landing } },
      out: 'cut',
    },
    {
      id: 'gauge',
      min: 6,
      grade: 'steel',
      lines: [{ line: 'film-itaipu-1-o3', lead: 1.5, tail: 1.0 }],
      /* Low over the water off the upstream face, looking along it: the
       * waterline on the concrete running away into the distance. */
      camera: {
        type: 'dolly', lens: 35, path: [crest(4, 140, 224), crest(6, 140, 225)], look: [crest(11, 0, 216), crest(13, 0, 216)],
      },
      out: 'dip',
    },
    {
      id: 'gates',
      min: 8,
      grade: 'steel',
      lines: [{ line: 'film-itaipu-1-o4', lead: 1.0, tail: 1.6 }],
      /* The spillway's gates, shut, from over the reservoir, widening.
       * No title card while The Spillway is held (the owner, 2026-10-08). */
      camera: {
        type: 'telephoto', lens: [200, 35], at: [GATE_MID[0] + 220, 300, GATE_MID[2] - 620], look: [[GATE_MID[0], GATE_MID[1] + 8, GATE_MID[2]], [GATE_MID[0], GATE_MID[1] - 20, GATE_MID[2] + 300]],
      },
      out: 'handoff',
    },
  ],
};
