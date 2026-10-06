/*
 * prologue.js: The Interior's opening film, "Where are they?"
 * (`interior-prologue`, docs/campaign/interior/INTROS.md P): years of not
 * finding, told in old radio voices over old photographs, then a modern
 * camera ball opening on the land and the title. Played once before
 * Mission 1's intro the first time a pilot opens the campaign, and from
 * the menu after (FILMS.md). Data only (src/share/war/film.js).
 *
 * Departures from INTROS P, each for a reason:
 *   - shot 4's three overlapping "No confirmation." are three takes, one
 *     a voice (film-intp-7a to 7c), overlapped by the timeline
 *     (`overlap`), as INTROS 1 asks ("built in the mix, not in the
 *     takes"), all inside shot 4, which smashes to shot 5's silence; the
 *     table's "spans 4 to 5" would have run a voice into the silence
 *   - sound beds stand in for the effects the player has no channel for:
 *     'static' (the old receiver) under the archive, 'wind' under the
 *     camera ball, THE INTERIOR from the title (FILMS.md, music)
 *   - shots 6 and 7 are the Bramor's own camera ball, so the aircraft is
 *     not in frame: a dolly along its route over Sector Alpha
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

import { BOARD_CAMERA, at } from './common.js';

/* The Bramor's route over Sector Alpha at survey height, south west to
 * north east, toward Puente Doble and Monte Cerrado's edge. */
const SURVEY_AGL = 420;

export default {
  id: 'interior-prologue',
  version: 1,
  map: 'interior',
  music: null,
  shots: [
    {
      id: 'static',
      min: 6,
      grade: 'archive',
      music: 'static',
      camera: BOARD_CAMERA,
      board: { black: true },
      lines: [
        { line: 'film-intp-1', lead: 1.0, tail: 0.3 },
        { line: 'film-intp-2', lead: 0.4, tail: 0.2 },
        { line: 'film-intp-3', lead: 1.2, tail: 0.6 },
      ],
      out: 'cut',
    },
    {
      id: 'roads',
      min: 7,
      grade: 'archive',
      camera: BOARD_CAMERA,
      board: {
        black: true,
        stills: [
          { id: 'arch-checkpoint', to: { at: 'end', s: -3.2 }, push: 0.06 },
          { id: 'arch-road', from: { at: 'end', s: -3.6 }, push: 0.05 },
        ],
      },
      lines: [{ line: 'film-intp-4', lead: 0.8, tail: 0.8 }],
      out: 'cut',
    },
    {
      id: 'forest',
      min: 8,
      grade: 'archive',
      camera: BOARD_CAMERA,
      board: {
        black: true,
        stills: [
          { id: 'arch-forest', slot: 'left', to: { at: 'end', s: -3.4 }, push: 0.05 },
          { id: 'arch-aerial', slot: 'right', from: 0.6, to: { at: 'end', s: -3.4 }, push: 0.05 },
          { id: 'arch-poster', from: { at: 'end', s: -3.8 }, push: 0.06 },
        ],
      },
      lines: [
        { line: 'film-intp-5', lead: 0.6, tail: 0.3 },
        { line: 'film-intp-6', lead: 0.5, tail: 0.8 },
      ],
      out: 'cut',
    },
    {
      id: 'circles',
      min: 6,
      grade: 'archive',
      camera: BOARD_CAMERA,
      board: {
        black: true,
        stills: [
          { id: 'arch-radios', to: { at: 'start', s: 2.6 }, push: 0.04 },
          { id: 'arch-map', from: { at: 'start', s: 2.0 }, push: 0.08 },
        ],
      },
      lines: [
        { line: 'film-intp-7a', lead: 0.2 },
        { line: 'film-intp-7b', lead: 0.55, overlap: true },
        { line: 'film-intp-7c', lead: 0.5, overlap: true, tail: 0.1 },
      ],
      out: 'smash',
    },
    {
      id: 'silence',
      min: 2,
      music: '',
      camera: BOARD_CAMERA,
      board: { black: true },
      out: 'smash',
    },
    {
      id: 'ball-on',
      min: 9,
      grade: 'air',
      music: 'wind',
      /* The camera ball switching on over Sector Alpha at five in the
       * afternoon, Puente Doble far off up the road. */
      camera: {
        type: 'dolly',
        agl: true,
        lens: 24,
        ease: 'lin',
        path: [at(4.15, 3.55, SURVEY_AGL), at(4.55, 4.0, SURVEY_AGL + 10), at(4.95, 4.45, SURVEY_AGL + 20)],
        look: [at(5.3, 6.6, 0), at(5.5, 7.2, 0)],
      },
      ball: { on: 1.0, hud: 1.6 },
      lines: [{ line: 'film-intp-8', lead: 2.5, tail: 1.0 }],
      out: 'cut',
    },
    {
      id: 'ball-slew',
      min: 9,
      grade: 'air',
      /* The ball slews from the farmland to Monte Cerrado's edge, endless. */
      camera: {
        type: 'dolly',
        agl: true,
        lens: 50,
        ease: 'io',
        path: [at(4.95, 4.45, SURVEY_AGL + 20), at(5.25, 4.85, SURVEY_AGL + 25), at(5.55, 5.25, SURVEY_AGL + 30)],
        look: [at(6.4, 5.9, 0), at(7.6, 7.4, 0), at(8.7, 8.9, 0)],
      },
      ball: {},
      lines: [{ line: 'film-intp-9', lead: 3.0, tail: 1.6 }],
      out: 'cut',
    },
    {
      id: 'title',
      min: 7,
      music: 'interior',
      camera: BOARD_CAMERA,
      board: { black: true },
      titles: [{
        key: 'interior.film.title', from: 0.8, to: { at: 'end', s: -0.6 }, kind: 'card',
      }],
      lines: [{ line: 'film-intp-10', lead: 2.0, tail: 1.6 }],
      out: 'dip',
      outS: 1.2,
    },
    {
      id: 'end',
      min: 3,
      camera: BOARD_CAMERA,
      board: { black: true },
      out: 'cut',
    },
  ],
};
