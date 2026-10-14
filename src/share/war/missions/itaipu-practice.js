/*
 * itaipu-practice.js: the practice, one Striker at a time over the
 * reservoir for Training's Defence track (docs/redesign/TRAINING.md
 * track 5: "a Striker caught in a training stage (the stage engine's own
 * spawn, no war round)"). Not in the campaign: it states no `act`, so
 * campaign.js ACT1 leaves it out, `released` lets any room start it, and
 * src/ui/campaign.js observe pays and logs nothing for it.
 *
 * No stakes: the Striker has no target, so its route ends in a 'leave'
 * (routes.js planAgent), never an arrival, and the output never moves.
 * No result: its one stage exits only into itself, killed or gone, and
 * when the pilot is out of airframes (the rack full again, a round), so
 * the match is never won or lost and resultOf's stars stay 0; it ends
 * when the host ends it. The kill's credit is the room's as in any war
 * (war.js dead `credited`), which the lesson reads from the flight's log.
 *
 * "Slow" is the route, not the Striker: a kind's speed is the engine's
 * (routes.js KIND, 26.6 m/s for every Striker), so the pass is long, about
 * 4 km across the reservoir in front of the dam (some 150 s), for time to
 * find it, hold it in the camera and catch it.
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

import { targets } from './itaipu-1.js';
import { withWaves } from '../stages.js';

/* The id Training's Defence lessons fly (src/game/training.js). */
export const PRACTICE_ID = 'itaipu-practice';

/* Between one Striker's end and the next one's stage. */
const BEAT_MS = 4000;

export default withWaves({
  id: PRACTICE_ID,
  /* A string key (src/strings): Practice. */
  title: 'war.mission.practice',
  /* No briefing and no lines of its own: the generic end lines, which a
   * practice never reaches. */
  radio: { brief: [], win: 'win', lose: 'lose-output' },
  map: 'itaipu',
  targets,
  output: 14000,
  floorMw: 7700,
  starMw: 11200,
  airframes: 4,
  stages: [
    {
      id: 'pass',
      round: true,
      title: 'war.stage.practice.pass',
      spawns: [
        { at: 5, kind: 'strike', n: 1, per: 0, route: 'practice-pass', group: 'mark' },
      ],
      objectives: [{
        id: 'mark', text: 'war.obj.practice.mark', kind: 'kill', done: { killed: 1, group: 'mark' },
      }],
      exits: [
        {
          when: { gone: { group: 'mark' } }, to: 'pass', after: BEAT_MS, result: 'auto', clear: 'leave',
        },
        {
          when: { allOut: true }, to: 'pass', after: BEAT_MS, result: 'auto', clear: 'leave',
        },
      ],
    },
  ],
  routes: {
    'practice-pass': [[-1600, 249, -3200], [0, 249, -2800], [400, 249, -5000]],
  },
});
