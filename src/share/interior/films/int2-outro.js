/*
 * int2-outro.js: Mission 2's outro, Eyes in the Forest (`int2-outro`,
 * M2_10, docs/campaign/interior/INTROS.md M2): the two camps side by
 * side, the history matching only the old one; then the alarm from a
 * remote post that starts Mission 3, and one word. Data only
 * (src/share/war/film.js).
 *
 * Faceless (PLAN.md 9 B): the stills are the camera ball's, from the
 * air; matches are frames joined by lines, never a face.
 *
 * Departures from INTROS M2, each for a reason:
 *   - shot 1's stills are the squad's captures of each camp (cap:shelters
 *     is Mission 1's, else its reconstruction; cap:nuevo_overview this
 *     mission's, else its reconstruction): one frame a camp, no portraits
 *   - shot 5, the BOARD from the player's station, is the BOARD alone (no
 *     room set in this film, as Mission 3's): the line carries it
 *   - the alert's card reads COMMUNICATION LOST alone: the card's letter
 *     spacing runs a longer one off a 16:9 screen
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
import { gridToWorld } from '../frame.js';
import { PLACES } from '../places.js';
import { M3_AT } from '../routes.js';

const BOTH = {
  at: [(PLACES.claroViejo.at[0] + PLACES.claroNuevo.at[0]) / 2, (PLACES.claroViejo.at[1] + PLACES.claroNuevo.at[1]) / 2],
  span: Math.round(1.4 * Math.abs(PLACES.claroNuevo.at[0] - PLACES.claroViejo.at[0])),
};
const ARENAL = { at: gridToWorld(...M3_AT.post), span: 2400 };

export default {
  id: 'int2-outro',
  version: 1,
  map: 'interior',
  music: null,
  shots: [
    {
      id: 'camps',
      min: 9,
      grade: 'room',
      music: 'room',
      camera: BOARD_CAMERA,
      board: {
        view: BOTH,
        layers: [{ id: 'land' }, { id: 'river' }, { id: 'roads' }, { id: 'm2-camps' }],
        stills: [
          { id: 'cap:shelters', slot: 'left', from: 0.4, push: 0.03 },
          { id: 'cap:nuevo_overview', slot: 'right', from: 1.2, push: 0.03 },
        ],
      },
      lines: [
        { line: 'film-int2-14', lead: 2.0, tail: 0.2 },
        { line: 'film-int2-15', lead: 1.0, tail: 1.0 },
      ],
      out: 'cut',
    },
    {
      id: 'apart',
      min: 8,
      grade: 'room',
      camera: BOARD_CAMERA,
      board: {
        view: BOTH,
        layers: [{ id: 'land' }, { id: 'river' }, { id: 'roads' }, { id: 'm2-camps' }],
        stills: [
          { id: 'cap:shelters', slot: 'left', push: 0.03 },
          { id: 'cap:nuevo_overview', slot: 'right', push: 0.03 },
        ],
      },
      lines: [
        { line: 'film-int2-16', lead: 0.6, tail: 0.2 },
        { line: 'film-int2-17', lead: 0.5, tail: 0.2 },
        { line: 'film-int2-18', lead: 0.6, tail: 1.0 },
      ],
      out: 'cut',
    },
    {
      id: 'alert',
      min: 4,
      grade: 'room',
      music: '',
      camera: BOARD_CAMERA,
      board: { view: BOTH, layers: [{ id: 'land' }, { id: 'roads' }, { id: 'm2-camps' }] },
      titles: [{
        key: 'interior.film.m2_alert', from: 0.3, to: { at: 'end' }, kind: 'card',
      }],
      lines: [{ line: 'film-int2-19', lead: 0.6, tail: 0.8 }],
      out: 'smash',
    },
    {
      id: 'arenal',
      min: 8,
      grade: 'room',
      camera: BOARD_CAMERA,
      board: { view: ARENAL, layers: [{ id: 'land' }, { id: 'river' }, { id: 'roads' }, { id: 'm2-arenal', from: 0.4 }] },
      lines: [
        { line: 'film-int2-20', lead: 1.0, tail: 0.2 },
        { line: 'film-int2-21', lead: 0.4, tail: 0.2 },
        { line: 'film-int2-22', lead: 0.4, tail: 0.6 },
      ],
      out: 'cut',
    },
    {
      id: 'launch',
      min: 4,
      grade: 'room',
      camera: BOARD_CAMERA,
      board: { view: ARENAL, layers: [{ id: 'land' }, { id: 'river' }, { id: 'roads' }, { id: 'm2-arenal' }] },
      lines: [{ line: 'film-int2-23', lead: 1.2, tail: 0.8 }],
      out: 'smash',
    },
    {
      id: 'black',
      min: 2,
      music: '',
      camera: BOARD_CAMERA,
      board: { black: true },
      out: 'cut',
    },
  ],
};
