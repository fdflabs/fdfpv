/*
 * int1-intro.js: Mission 1's intro, The Old War (`int1-intro`, M1_00,
 * docs/campaign/interior/INTROS.md M1): a temporary room with nothing
 * glamorous in it, three sectors on a map, a job described as routine by
 * people who suspect it is not; then Pista Cero in the late sun. The
 * room's briefing (src/share/interior/missions/interior-1.js filmMs).
 * Data only (src/share/war/film.js).
 *
 * Faceless (PLAN.md 9 B): the room is its set's monitors, table, cables,
 * a chair's back and a cup (common.js ROOM), and the BOARD. No person.
 *
 * Departures from INTROS M1, each for a reason:
 *   - shot 8 does not ride the launch. Launching Survey One is the
 *     mission's first objective (MISSIONS.md M1 stage 1), so the film
 *     ends behind the Bramor on its rail, the prop turning, and hands off
 *     to the pilot there; riding a launch the pilot then repeats would
 *     have them launch twice
 *   - THE INTERIOR's bed comes in on that last shot, the launch's moment,
 *     and the room's tone is a bed of its own ('room') before it
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

import {
  BOARD_CAMERA, PISTA_DIR, SETS, at, room, yawTo,
} from './common.js';
import { PLACES } from '../places.js';

/* The whole M1 corridor on the BOARD, Pista Cero to Claro Viejo with a
 * margin: the window's height is its span over 16:9, so the span covers
 * the corridor's north to south run at that shape. */
const [P0, P1] = [PLACES.pistaCero.at, PLACES.claroViejo.at];
const CORRIDOR = {
  at: [(P0[0] + P1[0]) / 2, (P0[1] + P1[1]) / 2],
  span: Math.round(1.3 * Math.max(Math.abs(P1[0] - P0[0]), (Math.abs(P1[1] - P0[1]) * 16) / 9)),
};

/* The Bramor on its catapult at Pista Cero, along the strip. */
const RAIL = at(3.06, 1.985, 0);
const RAIL_YAW = yawTo(PISTA_DIR[0], PISTA_DIR[1]);
/* Behind it, along the strip, and off to its side. */
const behind = (d, side, h) => [RAIL[0] - PISTA_DIR[0] * d - PISTA_DIR[1] * side, h, RAIL[2] - PISTA_DIR[1] * d + PISTA_DIR[0] * side];

export default {
  id: 'int1-intro',
  version: 1,
  map: 'interior',
  music: null,
  sets: SETS,
  cast: {
    bramor: { airframe: 'bramor2300', spins: true, launcher: true },
  },
  shots: [
    {
      id: 'monitors',
      min: 6,
      grade: 'room',
      music: 'room',
      set: 'room',
      /* Along the folding table: past the cables, the cup, a chair's back,
       * to the BOARD's edge. */
      camera: {
        type: 'dolly',
        agl: true,
        lens: 35,
        ease: 'io',
        path: [room(-1.55, 1.02, -0.15), room(-1.0, 1.0, -0.3), room(-0.35, 1.06, -0.42)],
        look: [room(-0.85, 0.86, -1.15), room(0.1, 1.0, -1.25), room(1.05, 1.42, -1.98)],
      },
      board: { view: CORRIDOR, layers: [{ id: 'land' }] },
      lines: [{ line: 'film-int1-1', lead: 1.5, tail: 0.9 }],
      out: 'cut',
    },
    {
      id: 'sectors',
      min: 6,
      grade: 'room',
      camera: BOARD_CAMERA,
      board: {
        view: CORRIDOR,
        layers: [{ id: 'land' }, { id: 'river' }, { id: 'pista' }, { id: 'sectors', from: 0.4 }],
      },
      lines: [
        { line: 'film-int1-2', lead: 0.6, tail: 0.2 },
        { line: 'film-int1-3', lead: 0.4, tail: 0.6 },
      ],
      out: 'cut',
    },
    {
      id: 'stills',
      min: 9,
      grade: 'room',
      camera: BOARD_CAMERA,
      board: {
        view: CORRIDOR,
        layers: [{ id: 'land' }, { id: 'river' }, { id: 'sectors' }],
        stills: [
          { id: 'int1-gen', slot: 'left', to: { at: 'vo.start', line: 1, s: -0.2 }, push: 0.04 },
          { id: 'int1-moto', slot: 'right', from: 0.5, to: { at: 'vo.start', line: 1, s: -0.2 }, push: 0.04 },
          { id: 'int1-mast', slot: 'left', from: { at: 'vo.start', line: 1, s: -0.6 }, push: 0.04 },
          { id: 'int1-pair', slot: 'right', from: { at: 'vo.start', line: 1 }, push: 0.06 },
        ],
      },
      lines: [
        { line: 'film-int1-4', lead: 0.5, tail: 0.2 },
        { line: 'film-int1-5', lead: 1.5, tail: 0.8 },
      ],
      out: 'cut',
    },
    {
      id: 'roads',
      min: 7,
      grade: 'room',
      camera: BOARD_CAMERA,
      board: {
        view: CORRIDOR,
        layers: [{ id: 'land' }, { id: 'river' }, { id: 'sectors' }, { id: 'roads', from: 1.2 }],
        stills: [
          { id: 'int1-mast', slot: 'left', to: 1.4 },
          { id: 'int1-pair', slot: 'right', to: 1.4 },
        ],
      },
      lines: [
        { line: 'film-int1-6', lead: 0.4, tail: 0.2 },
        { line: 'film-int1-7', lead: 0.5, tail: 0.8 },
      ],
      out: 'cut',
    },
    {
      id: 'marks',
      min: 8,
      grade: 'room',
      camera: BOARD_CAMERA,
      /* Each word's thing marks on the map as it is said: roads, bridges,
       * towers, construction, vehicles, a fifth of the line apart. */
      board: {
        view: CORRIDOR,
        layers: [{ id: 'land' }, { id: 'river' }, { id: 'sectors' }, { id: 'roads' }],
        marks: [
          { layer: 'roads-tick', item: 'all', at: { at: 'vo.start', u: 0.02 } },
          { layer: 'bridges', item: 'all', at: { at: 'vo.start', u: 0.2 } },
          { layer: 'towers', item: 'all', at: { at: 'vo.start', u: 0.4 } },
          { layer: 'construction', item: 'all', at: { at: 'vo.start', u: 0.6 } },
          { layer: 'vehicles', item: 'all', at: { at: 'vo.start', u: 0.8 } },
        ],
      },
      lines: [{ line: 'film-int1-8', lead: 0.8, tail: 1.4 }],
      out: 'cut',
    },
    {
      id: 'station',
      min: 6,
      grade: 'room',
      set: 'room',
      /* From the player's seat, slightly low: the line is said to it. */
      camera: {
        type: 'handheld',
        agl: true,
        lens: 50,
        at: room(0.05, 1.1, 0.95),
        look: room(0, 1.5, -1.98),
        amp: 0.012,
        drift: 5,
      },
      board: {
        view: CORRIDOR,
        layers: [{ id: 'land' }, { id: 'river' }, { id: 'sectors' }, { id: 'roads' }, { id: 'bridges' }, { id: 'towers' }, { id: 'construction' }],
      },
      lines: [
        { line: 'film-int1-9', lead: 0.6, tail: 0.2 },
        { line: 'film-int1-10', lead: 1.5, tail: 0.9 },
      ],
      out: 'smash',
    },
    {
      id: 'rail',
      min: 5,
      grade: 'warm',
      music: '',
      /* The Bramor on its catapult at Pista Cero in the late sun, nobody
       * in frame; the prop starts. */
      cast: {
        bramor: {
          agl: true, keys: [{ t: 0, p: [RAIL[0], 0, RAIL[2]], yaw: RAIL_YAW }], spin: [[0, 0], [{ at: 'end', s: -2.0 }, 0], [{ at: 'end' }, 60]],
        },
      },
      camera: {
        type: 'telephoto', agl: true, lens: 35, at: behind(-9, 7, 1.6), look: [RAIL[0], 0.9, RAIL[2]],
      },
      out: 'smash',
    },
    {
      id: 'behind',
      min: 6,
      grade: 'warm',
      music: 'interior',
      cast: {
        bramor: {
          agl: true, keys: [{ t: 0, p: [RAIL[0], 0, RAIL[2]], yaw: RAIL_YAW }], spin: [[0, 90]],
        },
      },
      /* Moving in behind it on the rail, low, the strip ahead: the
       * pilot's seat, which the hand-off blends into. */
      camera: {
        type: 'dolly',
        agl: true,
        lens: 24,
        ease: 'out',
        path: [behind(9, 3.5, 3.2), behind(6.5, 1.5, 2.2), behind(4.2, 0.2, 1.6)],
        look: [[RAIL[0] + PISTA_DIR[0] * 30, 1.2, RAIL[2] + PISTA_DIR[1] * 30], [RAIL[0] + PISTA_DIR[0] * 40, 2, RAIL[2] + PISTA_DIR[1] * 40]],
      },
      out: 'handoff',
    },
  ],
};
