/*
 * int3-intro.js: Mission 3's briefing film, No Man's Land (docs/campaign/
 * interior/INTROS.md M3 intro, M3_00): the post closing up, the map
 * filling with UNKNOWN round it, Vega's mantra, then the launch.
 *
 * Shots 1 to 3 of INTROS (the gate from a mast camera, cars leaving, a
 * blocked road) need Puesto Arenal and its roads on the land, which WORLD
 * has not built (CONTRACT-M3.md gap 8): until then the BOARD carries
 * them, the post marked and zoomed to, and Rojas's line plays over it.
 *
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
  BOARD_CAMERA, PISTA_DIR, SETS, at, yawTo,
} from './common.js';
import { gridToWorld } from '../frame.js';
import { M3_AT } from '../routes.js';

/* The whole played square, then the post's corner of it. */
const WHOLE = { at: gridToWorld(8, 8), span: 17000 };
const POST = { at: gridToWorld(4.6, 13.6), span: 4200 };
const BASE = [{ id: 'land' }, { id: 'river' }, { id: 'roads' }];

/* The Bramor on its catapult at Pista Cero, along the strip. */
const RAIL = at(3.06, 1.985, 0);
const RAIL_YAW = yawTo(PISTA_DIR[0], PISTA_DIR[1]);
const behind = (d, side, h) => [RAIL[0] - PISTA_DIR[0] * d - PISTA_DIR[1] * side, h, RAIL[2] - PISTA_DIR[1] * d + PISTA_DIR[0] * side];
/* North west, toward the post, from the rail. */
const [PX, , PZ] = at(...M3_AT.post, 0);

export default {
  id: 'int3-intro',
  version: 1,
  map: 'interior',
  music: null,
  sets: SETS,
  cast: {
    bramor: { airframe: 'bramor2300', spins: true, launcher: true },
  },
  shots: [
    {
      id: 'post',
      min: 7,
      grade: 'room',
      camera: BOARD_CAMERA,
      board: {
        view: {
          from: WHOLE, to: POST, a: 0.4, b: { at: 'vo.end', s: 0.6 },
        },
        layers: [...BASE, { id: 'pista' }, { id: 'post', from: 0.6 }],
      },
      lines: [{ line: 'film-int3-1', lead: 0.5, tail: 1.2 }],
      out: 'cut',
    },
    {
      id: 'hostiles',
      min: 7,
      grade: 'room',
      camera: BOARD_CAMERA,
      board: { view: POST, layers: [...BASE, { id: 'post' }] },
      lines: [
        { line: 'film-int3-2', lead: 0.4, tail: 0.2 },
        { line: 'film-int3-3', lead: 0.3, tail: 0.2 },
        { line: 'film-int3-4', lead: 0.4, tail: 0.8 },
      ],
      out: 'cut',
    },
    {
      id: 'unknown',
      min: 8,
      grade: 'room',
      camera: BOARD_CAMERA,
      board: {
        view: POST,
        layers: [...BASE, { id: 'post' }, { id: 'post-unknown', from: 1.0 }],
      },
      lines: [
        { line: 'film-int3-5', lead: 0.6, tail: 0.2 },
        { line: 'film-int3-6', lead: 0.5, tail: 0.2 },
        { line: 'film-int3-7', lead: 0.5, tail: 0.8 },
      ],
      out: 'cut',
    },
    {
      id: 'mantra',
      min: 12,
      grade: 'room',
      camera: BOARD_CAMERA,
      /* Each word lights more of the UNKNOWN dots, the last line all. */
      board: {
        view: POST,
        layers: [...BASE, { id: 'post' }],
        marks: [
          { layer: 'post-find', item: 'all', at: { at: 'vo.start', line: 0 } },
          { layer: 'post-follow', item: 'all', at: { at: 'vo.start', line: 1 } },
          { layer: 'post-identify', item: 'all', at: { at: 'vo.start', line: 2 } },
          { layer: 'post-unknown', item: 'all', at: { at: 'vo.start', line: 3 } },
        ],
      },
      lines: [
        { line: 'film-int3-8', lead: 1.0, tail: 0 },
        { line: 'film-int3-9', lead: 1.0, tail: 0 },
        { line: 'film-int3-10', lead: 1.0, tail: 0 },
        { line: 'film-int3-11', lead: 2.0, tail: 1.0 },
      ],
      out: 'cut',
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
      /* In behind it on the rail, the strip ahead, the post far off to
       * the north west: the pilot's seat, which the hand-off blends into. */
      camera: {
        type: 'dolly',
        agl: true,
        lens: 24,
        ease: 'out',
        path: [behind(9, 3.5, 3.2), behind(6.5, 1.5, 2.2), behind(4.2, 0.2, 1.6)],
        look: [[RAIL[0] + PISTA_DIR[0] * 30, 1.2, RAIL[2] + PISTA_DIR[1] * 30], [RAIL[0] + (PX - RAIL[0]) * 0.004, 2, RAIL[2] + (PZ - RAIL[2]) * 0.004]],
      },
      out: 'handoff',
    },
  ],
};
