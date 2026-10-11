/*
 * foot.js: a room's pilots on foot (docs/ON-FOOT.md). The room relays
 * where each pilot stands (roomwire.js FOOT) to everyone drawing the
 * pilots, watchers too, and keeps none of it: a sender says it again at
 * least once a second while it means anything, so a pilot who joins, or a
 * room back from a hibernation, has it within a second.
 *
 * Validated here, at the boundary: the exact length, only the flags there
 * are, a finite place within FOOT_REACH_M (roomwire.js isFoot), and no
 * more than FOOT_PER_S a second from a seat. Anything else is dropped
 * without a word, as a bad POSE is.
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

import { FOOT_HZ, isFoot, relayFoot } from '../../src/share/roomwire.js';

/* The owner sends at FOOT_HZ; a slow frame's catch up fits under half as
 * much again, and the rest are dropped. */
export const FOOT_PER_S = FOOT_HZ + 5;

export function onFoot(core, conn, s, data, now) {
  if (!isFoot(data)) {
    return [];
  }
  s.footRate ??= { since: now, n: 0 };
  if (now - s.footRate.since >= 1000) {
    s.footRate.since = now;
    s.footRate.n = 0;
  }
  s.footRate.n += 1;
  if (s.footRate.n > FOOT_PER_S) {
    return [];
  }
  return core.roster(conn, relayFoot(s.seat, data));
}
