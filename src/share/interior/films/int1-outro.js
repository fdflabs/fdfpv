/*
 * int1-outro.js: Mission 1's outro (`int1-outro`, M1_10, docs/campaign/
 * interior/INTROS.md M1): the night after; the squad's own stills; the
 * symbol against an old photograph; the camp shrinking to nothing inside
 * the region. Played after Survey One lands, before the debrief
 * (FILMS.md). Data only (src/share/war/film.js).
 *
 * The squad's captures are `cap:<item>` (the room's record, handed to the
 * player by the screen, opts.stills); a capture the squad did not make is
 * its analyst reconstruction, `rec:<item>`, marked RECONSTRUCTION (N8).
 * Shot 3's new image of the mark is cap:symbol when M1_SYMBOL_CAPTURED,
 * else rec:symbol, by that same rule.
 *
 * Departures from INTROS M1: the sustained COLUMN note is THE COLUMN's
 * bed, which opens on one held note (FILMS.md, music), from shot 3 to the
 * dip; the landing's canopy flutter is the 'wind' bed.
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
  BOARD_CAMERA, PISTA_DIR, at, yawTo,
} from './common.js';
import { PLACES } from '../places.js';
import { PLAY_HALF } from '../frame.js';

/* Where the Bramor comes down under its canopy: the recovery field, off
 * the strip's east end. */
const FIELD = at(3.32, 2.1, 0);
const DRIFT = PISTA_DIR;
const CAMP = PLACES.claroViejo.at;
/* The whole played square, 16 km north to south at the BOARD's 16:9,
 * the camp kept in the middle as it shrinks to a dot. */
const REGION = { at: CAMP, span: Math.round((2 * PLAY_HALF * 16) / 9) };

export default {
  id: 'int1-outro',
  version: 1,
  map: 'interior',
  music: null,
  cast: {
    chute: { airframe: 'bramor2300', chute: true },
  },
  shots: [
    {
      id: 'landing',
      min: 5,
      grade: 'dusk',
      music: 'wind',
      /* Under its canopy at dusk over the recovery field, to the ground. */
      cast: {
        chute: {
          agl: true,
          keys: [
            { t: 0, p: [FIELD[0] - DRIFT[0] * 14, 30, FIELD[2] - DRIFT[1] * 14], yaw: yawTo(DRIFT[0], DRIFT[1]) },
            { t: { at: 'end' }, p: [FIELD[0], 0.6, FIELD[2]], yaw: yawTo(DRIFT[0], DRIFT[1]) },
          ],
        },
      },
      camera: {
        type: 'telephoto',
        agl: true,
        lens: 35,
        ease: 'out',
        at: [FIELD[0] + DRIFT[1] * 38, 6, FIELD[2] - DRIFT[0] * 38],
        look: { cast: 'chute', up: 2 },
      },
      out: 'dip',
    },
    {
      id: 'captures',
      min: 8,
      grade: 'room',
      music: 'room',
      camera: BOARD_CAMERA,
      /* The squad's own captures, one after another, each with the seat
       * that took it. */
      board: {
        black: true,
        stills: [
          { id: 'cap:bridge', slot: [0.03, 0.12, 0.3], from: 0.3 },
          { id: 'cap:shelters', slot: [0.35, 0.12, 0.3], from: 1.6 },
          { id: 'cap:motorcycles', slot: [0.67, 0.12, 0.3], from: 2.9 },
          { id: 'cap:antenna', slot: [0.19, 0.52, 0.3], from: 4.2 },
          { id: 'cap:personnel', slot: [0.51, 0.52, 0.3], from: 5.5 },
        ],
      },
      out: 'cut',
    },
    {
      id: 'match',
      min: 8,
      grade: 'room',
      music: 'column',
      camera: BOARD_CAMERA,
      board: {
        black: true,
        match: {
          a: 'cap:symbol', b: 'arch-symbol', from: 0, at: { at: 'vo.start', line: 0, s: -0.4 },
        },
        hand: { from: { at: 'vo.end', line: 1 }, to: { at: 'vo.end', line: 1, s: 2.2 } },
      },
      lines: [
        { line: 'film-int1-11', lead: 1.5, tail: 0.2 },
        { line: 'film-int1-12', lead: 0.6, tail: 0.2 },
        { line: 'film-int1-13', lead: 0.4, tail: 0.8 },
      ],
      out: 'cut',
    },
    {
      id: 'held',
      min: 5,
      grade: 'room',
      camera: BOARD_CAMERA,
      board: {
        black: true,
        match: {
          a: 'cap:symbol', b: 'arch-symbol', at: 0,
        },
      },
      lines: [{ line: 'film-int1-14', lead: 1.0, tail: 1.0 }],
      out: 'cut',
    },
    {
      id: 'zoom',
      min: 8,
      grade: 'room',
      camera: BOARD_CAMERA,
      /* From the clearing to the whole Interior; the camp a dot. */
      board: {
        view: {
          from: { at: CAMP, span: 900 }, to: REGION, a: 0.6, b: { at: 'end', s: -0.4 },
        },
        layers: [{ id: 'land' }, { id: 'river' }, { id: 'camp' }],
      },
      lines: [{ line: 'film-int1-15', lead: 3.5, tail: 0.8 }],
      out: 'cut',
    },
    {
      id: 'around',
      min: 7,
      grade: 'room',
      camera: BOARD_CAMERA,
      /* Roads, bridges, settlements and the forest marked round the dot. */
      board: {
        view: REGION,
        layers: [
          { id: 'land' }, { id: 'river' }, { id: 'camp' },
          { id: 'roads', from: { at: 'vo.start', u: 0.1 } },
          { id: 'bridges', from: { at: 'vo.start', u: 0.35 } },
          { id: 'settlements', from: { at: 'vo.start', u: 0.55 } },
          { id: 'forest', from: { at: 'vo.start', u: 0.75 } },
        ],
      },
      lines: [{ line: 'film-int1-16', lead: 2.5, tail: 1.2 }],
      out: 'dip',
      outS: 1.2,
    },
    {
      id: 'complete',
      min: 2.5,
      music: '',
      camera: BOARD_CAMERA,
      board: { black: true },
      titles: [{
        key: 'interior.film.complete', from: 0.2, to: { at: 'end' }, kind: 'card',
      }],
      out: 'cut',
    },
  ],
};
