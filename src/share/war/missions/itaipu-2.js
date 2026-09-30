/*
 * itaipu-2.js: Defend the Paraná, act 1, mission 2, "Save the spillway
 * gates". The fourteen radial gates on the right bank (gate-0 to gate-13,
 * west to east, their upstream faces at 212 m) are the targets: Loiterers
 * dive on them from the north west, Sea drones come down the reservoir's
 * west arm and into the approach channel, Strikers run low up the
 * channel, and Hunters come for the pilots. Rules, rounds and airframes
 * as mission 1 (edge/rooms/war.js); scripts/war-routes-check.js checks
 * the routes, scripts/war-balance.js --mission=itaipu-2 flies it.
 *
 * A gate is worth 350 MW (itaipu-1.js): the gates are fourteen of the
 * mission's twenty targets here, so the floor sits where losing about
 * half of them would take the plant.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { ids, targets } from './itaipu-1.js';

export default {
  id: 'itaipu-2',
  /* A string key (src/strings): Save the spillway gates. */
  title: 'war.mission.itaipu_2',
  map: 'itaipu',
  targets,
  output: 14000,
  floorMw: 11550,
  starMw: 12950,
  airframes: 4,
  waves: [
    { round: 0, at: 2, kind: 'scout', n: 1, per: 0.25, route: 'reservoir-orbit' },
    { round: 0, at: 2, kind: 'loiter', n: 2, per: 1, route: 'high-west', target: ids('gate', [3, 7]), spread: 20 },
    { round: 1, at: 2, kind: 'boat', n: 2, per: 1, route: 'surface-gates', target: ids('gate', [1, 4, 9]), spread: 10 },
    { round: 1, at: 30, kind: 'strike', n: 1, per: 0.75, route: 'channel-low', target: ids('gate', [6]), spread: 15 },
    { round: 2, at: 2, kind: 'strike', n: 3, per: 1.25, route: 'channel-low', target: ids('gate', [0, 5, 10, 12]), spread: 15 },
    { round: 2, at: 20, kind: 'hunter', n: 1, per: 0.5, route: 'gorge-hunt' },
    { round: 3, at: 2, kind: 'scout', n: 1, per: 0.25, route: 'west-orbit' },
    { round: 3, at: 2, kind: 'loiter', n: 2, per: 1.25, route: 'high-west', target: ids('gate', [2, 8, 11]), spread: 20 },
    { round: 3, at: 25, kind: 'boat', n: 2, per: 1, route: 'surface-gates', target: ids('gate', [13, 6]), spread: 10 },
    { round: 4, at: 2, kind: 'loiter', n: 2, per: 1, route: 'high-west', target: ids('gate', [4, 9]), spread: 20 },
    { round: 4, at: 20, kind: 'boat', n: 2, per: 1, route: 'surface-gates', target: ids('gate', [0, 13]), spread: 10 },
    { round: 4, at: 35, kind: 'strike', n: 3, per: 1.5, route: 'channel-low', target: ids('gate', [1, 3, 7, 11]), spread: 15 },
    { round: 4, at: 40, kind: 'hunter', n: 1, per: 0.5, route: 'gorge-hunt' },
  ],
  routes: {
    'reservoir-orbit': [[300, 470, -5000], [300, 470, -3200]],
    'west-orbit': [[-2400, 470, -3700], [-1700, 470, -2800]],
    'high-west': [[-1700, 700, -3100], [-1300, 650, -2400]],
    'surface-gates': [[-1500, 219, -2800], [-1250, 219, -1800], [-1080, 219, -1250]],
    'channel-low': [[-1150, 249, -4200], [-1100, 249, -1700]],
    'gorge-hunt': [[-760, 200, 0], [-100, 260, -1300]],
  },
};
