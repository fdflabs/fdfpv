/*
 * itaipu-drill.js: the drill, mission 1 as it was before it became First
 * Light (docs/campaign/MISSIONS.md M1): its five fixed rounds and routes,
 * by day. Not in the campaign (src/game/campaign.js ACT1 names the
 * missions a pilot is offered); a room can still be asked for it by id.
 * It is what the war's checks fly when what they test is the referee, the
 * markers, the fuzes or the hunters rather than a mission's story: a
 * Striker on the yard 2 s after the go, a swarm at 4 s, a Hunter in round
 * 3, as those checks were written against, and as the record of the games
 * before the stage engine has them (scripts/war-legacy-games.js). Mission
 * 4, the night raid, is it at night until it gets its own design.
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

import { ids, targets } from './itaipu-1.js';
import { round, withWaves } from '../stages.js';

export default withWaves({
  id: 'itaipu-drill',
  /* A string key (src/strings): Drill. */
  title: 'war.mission.drill',
  /* No briefing of its own; the generic end lines. */
  radio: { brief: [], win: 'win', lose: 'lose-output' },
  map: 'itaipu',
  targets,
  output: 14000,
  floorMw: 7700,
  starMw: 11200,
  airframes: 4,
  /* Rounds of waves (stages.js round): a wave's `at` is seconds after
   * its round starts. */
  stages: [
    round('round-1', [
      { at: 2, kind: 'scout', n: 1, per: 0.25, route: 'reservoir-orbit' },
      { at: 2, kind: 'strike', n: 1, per: 0.75, route: 'reservoir-west', target: 'yard-right', spread: 60 },
      { at: 4, kind: 'fpv', n: 2, per: 1, route: 'gorge', target: ids('penstock', [5, 6]), spread: 10 },
    ]),
    round('round-2', [
      { at: 2, kind: 'loiter', n: 1, per: 0.75, route: 'high-east', target: 'intake-12', spread: 25 },
      { at: 20, kind: 'boat', n: 2, per: 1, route: 'surface-east', target: 'intake-17', spread: 20 },
    ]),
    round('round-3', [
      { at: 2, kind: 'scout', n: 1, per: 0.25, route: 'west-orbit' },
      { at: 2, kind: 'fpv', n: 4, per: 1.5, route: 'gorge', target: ids('penstock', [10, 11, 12, 13]), spread: 10 },
      { at: 20, kind: 'hunter', n: 1, per: 0.5, route: 'gorge-hunt' },
    ]),
    round('round-4', [
      { at: 2, kind: 'loiter', n: 2, per: 1.25, route: 'high-west', target: ids('gate', [2, 6, 10]), spread: 25 },
      { at: 40, kind: 'strike', n: 3, per: 1.5, route: 'reservoir-mid', target: ids('intake', [2, 4, 6, 8]), spread: 30 },
    ]),
    round('round-5', [
      { at: 2, kind: 'loiter', n: 1, per: 1, route: 'high-east', target: ids('intake', [9, 11]), spread: 25 },
      { at: 20, kind: 'boat', n: 1, per: 0.75, route: 'surface-east', target: ids('intake', [13, 19]), spread: 20 },
      { at: 30, kind: 'strike', n: 2, per: 1.5, route: 'reservoir-east', target: ids('intake', [14, 15, 16, 18, 19]), spread: 30 },
      { at: 40, kind: 'hunter', n: 1, per: 0.5, route: 'gorge-hunt' },
      { at: 45, kind: 'fpv', n: 4, per: 1.5, route: 'gorge', target: ids('penstock', [0, 1, 2, 3, 15, 16]), spread: 10 },
    ], { last: true }),
  ],
  routes: {
    'reservoir-orbit': [[300, 470, -5000], [300, 470, -3200]],
    'west-orbit': [[-2400, 470, -3700], [-1700, 470, -2800]],
    'reservoir-west': [[-1600, 249, -3200], [-1600, 249, -1700], [-1800, 300, -1000]],
    'reservoir-mid': [[400, 249, -5000], [0, 249, -2800], [-50, 249, -2200]],
    'reservoir-east': [[1500, 249, -5000], [500, 249, -2200]],
    gorge: [[-1100, 180, 400], [-760, 180, 0], [-640, 180, -450], [-400, 180, -800], [-150, 180, -1100], [0, 185, -1350]],
    'high-east': [[1200, 700, -3400], [800, 650, -2700]],
    'high-west': [[-1700, 700, -3100], [-1300, 650, -2400]],
    'surface-east': [[1000, 219, -2800], [700, 219, -2300], [450, 219, -1880]],
    'gorge-hunt': [[-760, 200, 0], [-100, 260, -1300]],
  },
});
