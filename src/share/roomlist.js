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
 * AN EMPTY ROOM'S CLOSE is kept as `closesAt` on this page's own clock:
 * the room's emptySince plus EMPTY_CLOSE_MS, moved by how far this clock
 * is from the server's (`now` in the answer), so a phone whose clock is
 * off by minutes still counts down the right five. A server from before
 * emptySince sends neither, and its empty rooms have no closing time.
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

import {
  EMPTY_CLOSE_MS, LIST_EVERY_MS, ROOM_MODES, normaliseCode, normaliseRoomName, validNamePick,
} from './roomwire.js';
import { roomsOrigin } from './rooms.js';

const ID_RE = /^[a-z0-9_]{1,32}$/;
const STATES = ['waiting', 'countdown', 'on'];

/* Whole minutes until an empty room closes, at least 1 until it has, or
 * null for a room with pilots or no closing time. */
export function closesInMin(r, now = Date.now()) {
  return r.closesAt == null ? null : Math.max(0, Math.ceil((r.closesAt - now) / 60000));
}

/* A lobby line as the browser draws it, or null. `skew` is this clock
 * less the server's, ms. */
export function checkRoomLine(r, skew = 0) {
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
  const empty = r.n === 0 && Number.isFinite(r.emptySince);
  return {
    code: r.code,
    name: r.name,
    pick: r.pick.slice(),
    map: r.map,
    n: r.n,
    cap: r.cap,
    game,
    state: STATES.includes(r.state) ? r.state : 'waiting',
    closesAt: empty ? r.emptySince + EMPTY_CLOSE_MS + skew : null,
  };
}

/* onChange() after every answer that changed what the list shows. */
export function createRoomList(onChange = () => {}) {
  let rooms = null; /* null until the first answer */
  let open = null;
  let busy = false; /* the server refuses new public rooms for now (edge/rooms/health.js) */
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
      busy = body.busy === true;
      const skew = Number.isFinite(body.now) ? Date.now() - body.now : 0;
      rooms = Array.isArray(body.rooms) ? body.rooms.map((r) => checkRoomLine(r, skew)).filter(Boolean) : [];
      failed = false;
    } catch (e) {
      /* Kept: the last list is still the best guess, and the screen says
       * the server is not answering until it does. */
      failed = true;
    }
    asking = false;
    /* What the screen shows: the minutes left, not the ms, or every answer
     * would redraw it. */
    const seen = rooms && rooms.map((r) => ({ ...r, closesAt: closesInMin(r) }));
    const now = JSON.stringify([seen, open, busy, failed]);
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
    busy: () => busy,
    failed: () => failed,
  };
}
