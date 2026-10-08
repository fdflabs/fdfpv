/*
 * int3-outro.js: Mission 3's outro, No Man's Land (docs/campaign/
 * interior/INTROS.md M3 outro, M3_09): the northern vehicle on the BOARD,
 * the squad's still of it when someone captured it, else the analyst's
 * reconstruction; its containers; who could pay for that. Night in the
 * room, then black and the debrief.
 *
 * film-int3-18 (the drone's full watch) is not cued: the unknown drone is
 * not built (CONTRACT-M3.md gap 5).
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


import { BOARD_CAMERA } from './common.js';

export default {
  id: 'int3-outro',
  version: 1,
  map: 'interior',
  music: null,
  shots: [
    {
      id: 'vehicle',
      min: 10,
      grade: 'room',
      music: 'room',
      camera: BOARD_CAMERA,
      board: {
        black: true,
        stills: [{ id: 'cap:north_vehicle', slot: 'centre', from: 0.3, push: 0.03 }],
      },
      lines: [
        { line: 'film-int3-12', lead: 1.5, tail: 0.2 },
        { line: 'film-int3-13', lead: 0.6, tail: 0.2 },
        { line: 'film-int3-14', lead: 0.4, tail: 0.8 },
      ],
      out: 'cut',
    },
    {
      id: 'containers',
      min: 9,
      grade: 'room',
      camera: BOARD_CAMERA,
      /* Into the bed: the still pushed in hard on the containers. */
      board: {
        black: true,
        stills: [{ id: 'cap:north_vehicle', slot: 'centre', push: 0.35 }],
      },
      lines: [{ line: 'film-int3-15', lead: 0.8, tail: 1.0 }],
      out: 'cut',
    },
    {
      id: 'money',
      min: 11,
      grade: 'room',
      camera: BOARD_CAMERA,
      board: {
        black: true,
        stills: [{ id: 'int3-north-close', slot: 'centre', from: 0.2, push: 0.05 }],
      },
      lines: [
        { line: 'film-int3-16', lead: 0.8, tail: 0 },
        { line: 'film-int3-17', lead: 1.2, tail: 3.0 },
      ],
      out: 'dip',
    },
    {
      id: 'complete',
      min: 3,
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
