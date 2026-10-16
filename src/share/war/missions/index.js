/*
 * index.js: every war mission, by id (docs/WARFARE-PLAN.md section 4.2).
 * The one table the room (edge/rooms/war.js) and the client
 * (src/share/roomwar.js) both read, so a mission the room can start is
 * always one every screen can fly. A new mission is a file beside this one
 * and a line here.
 *
 * A campaign mission's file states its place, and src/game/campaign.js
 * derives ACT1 from it (actOf), so the list a screen shows and the gate
 * the room holds are this table's:
 *
 *   act      the campaign act it is flown in (1, Defend the Paraná)
 *   order    its place in the act, 1 up, flown in that order
 *   key      the card's words, string keys `campaign.m.<key>` and
 *            `campaign.m.<key>_blurb`
 *   free     the one mission a pilot without the campaign may fly
 *   release  whether a pilot may fly it at all (the owner, 2026-10-04:
 *            "only make the first mission available, until its 100%
 *            correct, then only when storyline, videos, etc. of mission 2
 *            is done do you make that available"): 'available' is offered
 *            and started; 'development' is shown Under Development and
 *            only a developer's room starts it (campaign.js released).
 *            The room refuses anything else (edge/rooms/war.js start), so
 *            this field is the gate, not the screen. A mission is made
 *            available here and nowhere else. First Light went back to
 *            'development' on 2026-10-07 (the owner: it has no narration,
 *            nothing of what Mission 1 of The Interior has; under
 *            construction until it is as finished); the owner's own
 *            account flew it while held (DEV_ACCOUNTS, devHost). The owner
 *            released all four Act 1 missions on 2026-10-15 ("release
 *            yes i approve", all four so the campaign plays in order),
 *            and The River Below and The Corridor (5 and 6) on
 *            2026-10-16 ("make everything available to everyone").
 *
 * The drill has no act, so no campaign offers it, nor the practice
 * (itaipu-practice.js), Training's one Striker at a time.
 *
 * A wave is { at, kind, n, per, route, target, spread }: n attackers for
 * one pilot and `per` more for each pilot after the first (waveSize), all
 * going for `target`, or, where it is a list, the k-th of them for
 * target[k % target.length] (waveTarget), so a group splits over several
 * and costs more than one target's megawatts when it gets through. The
 * room sizes a wave by the pilots at the go and writes each attacker's n
 * and target in its birth, so a screen never sizes one itself.
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

import itaipu1 from './itaipu-1.js';
import itaipu2 from './itaipu-2.js';
import itaipu3 from './itaipu-3.js';
import itaipu4 from './itaipu-4.js';
import itaipu5 from './itaipu-5.js';
import itaipu6 from './itaipu-6.js';
import drill from './itaipu-drill.js';
import practice from './itaipu-practice.js';
import { idsOf } from '../stages.js';
import { WAR_AIRFRAMES } from '../../../../configs/airframes.js';

/* Act 1 of the campaign, Defend the Paraná, in order, and after it the
 * drill (itaipu-drill.js) and the practice (itaipu-practice.js), which no
 * campaign offers. Each flown only in
 * the war's aircraft (`aircraft`, configs/airframes.js WAR_AIRFRAMES):
 * the room refuses any other (edge/rooms/war.js flies). */
export const MISSIONS = Object.freeze(Object.fromEntries([itaipu1, itaipu2, itaipu3, itaipu4, itaipu5, itaipu6, drill, practice]
  .map((m) => [m.id, { ...m, aircraft: WAR_AIRFRAMES }])));

/* Act missions that are only planned: no file yet, so nothing to fly,
 * shown Coming Soon (release 'soon'). Writing one's file moves its row
 * there. */
export const PLANNED = Object.freeze([
  { id: 'itaipu-7', act: 1, order: 7, key: 'breach' },
]);

/* The time of day a mission is flown at (TECH-NEEDS T1.11): its `time`,
 * 'night' for the night raid's older `night` flag, or null for the map's
 * own. */
export function missionTime(mission) {
  return mission?.time ?? (mission?.night ? 'night' : null);
}

/* How many attackers a wave sends against `pilots` pilots (at least 1). */
export function waveSize(wave, pilots) {
  return Math.max(1, Math.round(wave.n + (wave.per || 0) * (Math.max(1, pilots) - 1)));
}

/* The target of a wave's k-th attacker, or null for a wave with none.
 * A target of { set } is the match's draw of that set (sets, m.sets). */
export function waveTarget(wave, k, sets = null) {
  if (wave.target == null) {
    return null;
  }
  const t = idsOf(wave.target, sets);
  return t[k % t.length];
}
