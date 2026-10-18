/*
 * roomlobby.js: a pilot's Ready in a room's lobby (edge/rooms/gamelobby.js),
 * said until the room lists it. A text over the room's rate is dropped,
 * not queued (edge/rooms/core.js TEXT_PER_S), and a page's texts on
 * joining a room fill that rate for a second, so a Ready pressed then was
 * lost and the pilot never readied. As the race's ready
 * (src/share/roomrace.js ready), it goes again every FINISH_RESEND_MS
 * until the lobby says it, or the lobby closes.
 *
 * Pure: no DOM, no timers, the time handed in, so a check in Node drives
 * it against edge/rooms/core.js.
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

import { FINISH_RESEND_MS } from './roomrace.js';
import { WATCH_SEAT } from './watchseat.js';

/* send(obj) puts one text message on the room's socket. */
export function createLobbyReady(send) {
  /* What the pilot asked, until the room lists it: true, false or null. */
  let want = null;
  let sentAt = -Infinity;

  const api = {
    /* The pilot's press. nowMs: the page's clock in ms (performance.now,
     * a frame's time), the same every call. */
    set(ready, lobby, seat, nowMs) {
      want = Boolean(ready);
      sentAt = -Infinity;
      api.frame(lobby, seat, nowMs);
    },
    /* Every frame: lobby the room's (null when it is closed), seat this
     * page's. Said again until the lobby lists it; forgotten when it
     * does, when the lobby closes (a round started clears every flag),
     * and on the watch seat, which is never asked. */
    frame(lobby, seat, nowMs) {
      if (want === null) {
        return;
      }
      if (!lobby || seat == null || seat === WATCH_SEAT || Boolean(lobby.ready[seat]) === want) {
        want = null;
        return;
      }
      if (nowMs - sentAt < FINISH_RESEND_MS) {
        return;
      }
      sentAt = nowMs;
      send({ type: 'lobby', op: 'ready', ready: want });
    },
    /* Another room, or none. */
    clear() {
      want = null;
    },
    /* What is still being said, for the checks. */
    pending() {
      return want;
    },
  };
  return api;
}
