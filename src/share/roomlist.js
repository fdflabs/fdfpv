/*
 * roomlist.js: the room browser's list of public rooms, fetched from the
 * rooms server (GET /v2/rooms, edge/rooms/lobby.js) while somebody is
 * looking at it, and never otherwise.
 *
 * WHY A POLL. The list changes when a room is made, fills or empties, a
 * few times a minute in a busy hour, and one GET of a cached answer every
 * LIST_EVERY_MS from each open browser costs the one core VM next to
 * nothing (the lobby rebuilds it once a second at most, however many ask).
 * A push would need a socket per browsing tab held open for no pose at all.
 * The poll stops the moment the screen closes, and skips a hidden tab.
 *
 * Every entry is checked here, at the boundary: a line that does not have
 * the shape the lobby sends is dropped rather than drawn.
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

import { ROOM_MODES, normaliseCode, normaliseRoomName, validNamePick } from './roomwire.js';
import { roomsOrigin } from './rooms.js';

export const LIST_EVERY_MS = 4000;
const ID_RE = /^[a-z0-9_]{1,32}$/;
const STATES = ['waiting', 'countdown', 'on'];

/* A lobby line as the browser draws it, or null. */
export function checkRoomLine(r) {
  if (!r || typeof r !== 'object' || !normaliseCode(r.code) || !validNamePick(r.pick) || !ID_RE.test(String(r.map))) {
    return null;
  }
  if (!Number.isInteger(r.n) || !Number.isInteger(r.cap) || r.n < 0 || r.cap < 1) {
    return null;
  }
  if (r.name !== null && normaliseRoomName(r.name) !== r.name) {
    return null;
  }
  const game = ROOM_MODES.includes(r.game) ? r.game : null;
  return {
    code: r.code, name: r.name, pick: r.pick.slice(), map: r.map, n: r.n, cap: r.cap, game, state: STATES.includes(r.state) ? r.state : 'waiting',
  };
}

/* onChange() after every answer that changed what the list shows. */
export function createRoomList(onChange = () => {}) {
  let rooms = null; /* null until the first answer */
  let open = null;
  let failed = false;
  let timer = null;
  let asking = false;
  let shown = '';

  async function ask() {
    const origin = roomsOrigin();
    if (asking || !origin || (typeof document !== 'undefined' && document.hidden)) {
      return;
    }
    asking = true;
    try {
      const res = await fetch(`${origin}/v2/rooms`, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`http ${res.status}`);
      }
      const body = await res.json();
      open = body.open === true;
      rooms = Array.isArray(body.rooms) ? body.rooms.map(checkRoomLine).filter(Boolean) : [];
      failed = false;
    } catch (e) {
      /* Kept: the last list is still the best guess, and the screen says
       * the server is not answering until it does. */
      failed = true;
    }
    asking = false;
    const now = JSON.stringify([rooms, open, failed]);
    if (now !== shown) {
      shown = now;
      onChange();
    }
  }

  return {
    /* Poll while `on`: the browser screen is open. */
    watch(on) {
      if (on && !timer) {
        ask();
        timer = setInterval(ask, LIST_EVERY_MS);
      } else if (!on && timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    refresh: ask,
    rooms: () => rooms,
    open: () => open,
    failed: () => failed,
  };
}
