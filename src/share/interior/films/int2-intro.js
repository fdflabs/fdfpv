/*
 * int2-intro.js: Mission 2's intro, Eyes in the Forest (`int2-intro`,
 * M2_00, docs/campaign/interior/INTROS.md M2): Claro Viejo the morning
 * after, empty, walked into at a man's height with nobody in frame; the
 * camp then and now side by side on the BOARD; the question turned round
 * (not how they escaped, what they saw); the recon quad lifting at the
 * clearing's edge. The room's briefing (missions/interior-2.js filmMs).
 * Data only (src/share/war/film.js).
 *
 * Faceless (PLAN.md 9 B): no person in any shot; the walk is a camera's.
 *
 * Departures from INTROS M2, each for a reason:
 *   - shot 3's left still is cap:shelters (Mission 1's capture when this
 *     device holds it, else its reconstruction), the camp as it was; the
 *     right is int2-empty, drawn for the game
 *   - film-int2-12 and -12b are one line with an `or` (film.js): the
 *     player's M1_SYMBOL_CAPTURED flag picks which is said
 *   - the quad's shot is held on the ground and lifting, not ridden: the
 *     mission hands off to the pilot's own launch
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

import { BOARD_CAMERA } from './common.js';
import { CAMP_PROPS, PLACES } from '../places.js';

/* Claro Viejo to the three places a watcher could see the road from, with
 * a margin, on the BOARD at 16:9. */
const CV = PLACES.claroViejo.at;
const ZONES = [PLACES.cruceTranquera, PLACES.lomaDelVigia, PLACES.corralViejo].map((p) => p.at);
const xs = [CV[0], ...ZONES.map((z) => z[0])];
const zs = [CV[1], ...ZONES.map((z) => z[1])];
const SECTOR = {
  at: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2],
  span: Math.round(1.3 * Math.max(Math.max(...xs) - Math.min(...xs), ((Math.max(...zs) - Math.min(...zs)) * 16) / 9)),
};
const CAMP_VIEW = { at: CV, span: 900 };

/* Scene points round the clearing: [x, y over the ground, z]. */
const [CX, CZ] = CAMP_PROPS.middle;
const near = (ox, h, oz) => [CX + ox, h, CZ + oz];
const ROPE = CAMP_PROPS.hammocks[0].from;
/* The quad at the clearing's south edge, facing out over the camp. */
const PAD = near(4, 0.25, 22);

export default {
  id: 'int2-intro',
  version: 1,
  map: 'interior',
  music: null,
  cast: {
    quad: { airframe: '7inch', spins: true },
  },
  shots: [
    {
      id: 'walk',
      min: 7,
      grade: 'air',
      music: 'room',
      /* In from the clearing's edge at a man's height, a body camera's
       * gait, to the middle: the cold fire, the stripped shelters. */
      camera: {
        type: 'dolly',
        agl: true,
        lens: 18,
        ease: 'lin',
        path: [near(-6, 1.6, 30), near(-3, 1.6, 18), near(-1, 1.6, 8)],
        look: [near(1, 0.6, 2), near(2, 0.4, 1)],
      },
      lines: [{ line: 'film-int2-1', lead: 3.0, tail: 0.6 }],
      out: 'cut',
    },
    {
      id: 'rope',
      min: 5,
      grade: 'air',
      /* A rope left on a hammock's pole. */
      camera: {
        type: 'handheld', agl: true, lens: 35, at: [ROPE[0] + 2.2, 1.5, ROPE[1] + 1.6], look: [ROPE[0], 1.5, ROPE[1]], amp: 0.02, drift: 4,
      },
      lines: [
        { line: 'film-int2-2', lead: 0.8, tail: 0.2 },
        { line: 'film-int2-3', lead: 0.4, tail: 1.0 },
      ],
      out: 'cut',
    },
    {
      id: 'split',
      min: 9,
      grade: 'room',
      camera: BOARD_CAMERA,
      board: {
        view: CAMP_VIEW,
        layers: [{ id: 'land' }, { id: 'camp' }],
        stills: [
          { id: 'cap:shelters', slot: 'left', from: 0.3, push: 0.03 },
          { id: 'int2-empty', slot: 'right', from: 0.9, push: 0.03 },
        ],
      },
      lines: [{ line: 'film-int2-4', lead: 1.2, tail: 1.2 }],
      out: 'cut',
    },
    {
      id: 'maybe',
      min: 9,
      grade: 'room',
      camera: BOARD_CAMERA,
      board: {
        view: CAMP_VIEW,
        layers: [{ id: 'land' }, { id: 'camp' }],
        stills: [
          { id: 'cap:shelters', slot: 'left', push: 0.03 },
          { id: 'int2-empty', slot: 'right', push: 0.03 },
        ],
      },
      lines: [
        { line: 'film-int2-5', lead: 0.5, tail: 0.2 },
        { line: 'film-int2-6', lead: 0.3, tail: 0.2 },
        { line: 'film-int2-7', lead: 0.3, tail: 0.2 },
        { line: 'film-int2-8', lead: 0.3, tail: 0.6 },
      ],
      out: 'cut',
    },
    {
      id: 'question',
      min: 7,
      grade: 'room',
      camera: BOARD_CAMERA,
      board: {
        view: SECTOR,
        layers: [{ id: 'land' }, { id: 'river' }, { id: 'camp' }, { id: 'roads', from: 1.0 }],
      },
      lines: [
        { line: 'film-int2-9', lead: 1.0, tail: 0.2 },
        { line: 'film-int2-10', lead: 1.0, tail: 0.8 },
      ],
      out: 'cut',
    },
    {
      id: 'sight',
      min: 6,
      grade: 'room',
      camera: BOARD_CAMERA,
      board: {
        view: SECTOR,
        layers: [{ id: 'land' }, { id: 'river' }, { id: 'camp' }, { id: 'roads' }, { id: 'm2-zones', from: 0.6 }, { id: 'm2-sight', from: 1.2 }],
      },
      lines: [
        { line: 'film-int2-11', lead: 1.2, tail: 0.2 },
        { line: 'film-int2-12', or: { line: 'film-int2-12b', flag: 'M1_SYMBOL_CAPTURED' }, lead: 1.0, tail: 1.2 },
      ],
      out: 'cut',
    },
    {
      id: 'lift',
      min: 6,
      grade: 'air',
      music: 'interior',
      /* The recon quad at the clearing's edge, nobody near; its motors
       * spin up and it lifts to a man's height, under the crowns. */
      cast: {
        quad: {
          agl: true,
          keys: [{ t: 0, p: PAD, yaw: 0 }, { t: { at: 'end', s: -3.0 }, p: PAD, yaw: 0 }, { t: { at: 'end' }, p: [PAD[0], 2.2, PAD[2]], yaw: 0 }],
          spin: [[0, 0], [{ at: 'end', s: -3.4 }, 0], [{ at: 'end', s: -3.0 }, 200]],
        },
      },
      camera: {
        type: 'telephoto', agl: true, lens: 35, at: [PAD[0] + 4, 1.2, PAD[2] + 5], look: { cast: 'quad', up: 0.2 },
      },
      lines: [{ line: 'film-int2-13', lead: 1.0, tail: 1.4 }],
      out: 'handoff',
    },
  ],
};
