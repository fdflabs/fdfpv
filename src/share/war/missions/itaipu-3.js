/*
 * itaipu-3.js: Defend the Paraná, act 1, mission 3, "Switchyard
 * blackout". The right bank switchyard (yard-right, 2 800 MW, hit within
 * 40 m of its middle) is the target of every wave: Strikers low over the
 * reservoir's west arm and on over the shore, Loiterers diving from the
 * north west, an FPV swarm up the gorge and out over the right bank, and
 * among the Strikers DECOYS: the 'decoy' kind flies and looks like a
 * Striker (its marker says STRIKER until 300 m, src/ui/warmarkers.js),
 * is worth nothing where it arrives, and dies to any warhead, so a
 * pilot who spends airframes on them has fewer for the real ones.
 *
 * The yard is one target: once hit it takes nothing more (war.js take),
 * so its 2 800 MW goes the first time an attacker gets through; rounds 3
 * and 5 send Strikers at the west intakes and round 4 a swarm up the
 * gorge at three penstocks, so a lost yard is not the end of the danger. The floor is the plant without the yard and two units more.
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
  id: 'itaipu-3',
  /* A string key (src/strings): Switchyard blackout. */
  title: 'war.mission.itaipu_3',
  map: 'itaipu',
  /* Minutes, low and high, a squad takes (docs/campaign/MISSIONS.md 2);
   * Operations' briefing shows it (src/ui/briefing.js). */
  estimatedMinutes: [10, 14],
  targets,
  output: 14000,
  floorMw: 9700,
  starMw: 12600,
  airframes: 4,
  /* Rounds of waves (stages.js round): a wave's `at` is seconds after
   * its round starts. */
  stages: [
    round('round-1', [
      { at: 2, kind: 'scout', n: 1, per: 0.25, route: 'west-orbit' },
      { at: 2, kind: 'strike', n: 1, per: 0.75, route: 'reservoir-west-far', target: 'yard-right', spread: 60 },
      { at: 4, kind: 'decoy', n: 1, per: 0.5, route: 'reservoir-west-far', target: 'yard-right', spread: 60 },
    ]),
    round('round-2', [
      { at: 2, kind: 'fpv', n: 3, per: 1, route: 'gorge-yard', target: 'yard-right', spread: 30 },
      { at: 10, kind: 'loiter', n: 1, per: 0.75, route: 'high-yard', target: 'yard-right', spread: 60 },
    ]),
    round('round-3', [
      { at: 2, kind: 'decoy', n: 1, per: 1, route: 'reservoir-west', target: 'yard-right', spread: 60 },
      { at: 6, kind: 'strike', n: 1, per: 0.75, route: 'reservoir-west-far', target: 'yard-right', spread: 60 },
      { at: 10, kind: 'decoy', n: 1, per: 0.5, route: 'reservoir-west', target: 'yard-right', spread: 60 },
    ]),
    round('round-4', [
      { at: 2, kind: 'fpv', n: 4, per: 1.25, route: 'gorge', target: ids('penstock', [0, 1, 2]), spread: 10 },
      { at: 10, kind: 'strike', n: 2, per: 1, route: 'reservoir-mid', target: ids('intake', [0, 2, 4]), spread: 30 },
      { at: 40, kind: 'hunter', n: 1, per: 0.5, route: 'gorge-hunt' },
    ]),
    round('round-5', [
      { at: 2, kind: 'strike', n: 1, per: 0.75, route: 'reservoir-west-far', target: 'yard-right', spread: 60 },
      { at: 8, kind: 'decoy', n: 2, per: 1, route: 'reservoir-west', target: 'yard-right', spread: 60 },
      { at: 40, kind: 'fpv', n: 2, per: 0.75, route: 'gorge-yard', target: 'yard-right', spread: 30 },
      { at: 40, kind: 'hunter', n: 1, per: 0.5, route: 'gorge-hunt' },
      { at: 50, kind: 'strike', n: 2, per: 1, route: 'reservoir-mid', target: ids('intake', [1, 3, 5]), spread: 30 },
    ], { last: true }),
  ],
  routes: {
    'west-orbit': [[-2400, 470, -3700], [-1700, 470, -2800]],
    'reservoir-west': [[-1600, 249, -2800], [-1600, 249, -1700], [-1800, 300, -1000]],
    /* The first round's, from further out: the squad takes off 2.7 km
     * east of the yard and needs the time to get there. */
    'reservoir-west-far': [[-1600, 249, -4800], [-1600, 249, -1700], [-1800, 300, -1000]],
    'reservoir-mid': [[400, 249, -5000], [0, 249, -2800], [-50, 249, -2200]],
    'high-yard': [[-2800, 700, -2600], [-2500, 650, -1500]],
    'gorge-yard': [[-1100, 180, 400], [-760, 180, 0], [-800, 260, -300], [-1500, 300, -400]],
    gorge: [[-1100, 180, 400], [-760, 180, 0], [-640, 180, -450], [-400, 180, -800], [-150, 180, -1100], [0, 185, -1350]],
    'gorge-hunt': [[-760, 200, 0], [-100, 260, -1300]],
  },
});
