/*
 * bugs.js: a tester's ticket, sent to the public board.
 *
 *   POST {board}/api/bugs   { kind, title, what, expected?, steps?,
 *                             reporter?, context?, images? }
 *
 * `images` holds up to four screenshots as data: URLs, already shrunk and
 * re-encoded to what the board accepts by src/ui/bugshots.js. The board is
 * the one board.js resolves (a ?board= query, a stored override, then the
 * default). A board that is down rejects here and the form says so; it
 * never takes the game down with it.
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

import { boardOrigin } from './board.js';
import { str } from '../strings/index.js';

/* The kinds a ticket can be, in the order the form lists them. The ids are
 * the board's closed list. */
export const BUG_KINDS = [
  ['crash', 'bugs.crash_or_freeze'],
  ['blocking', 'bugs.cannot_play'],
  ['wrong', 'bugs.wrong_behaviour'],
  ['visual', 'bugs.looks_wrong'],
  ['feel', 'ui.flight_feel'],
  ['other', 'bugs.other'],
].map(([id, key]) => ({ id, label: str(key) }));

/*
 * Who and what a report is about, beyond the shell's own snapshot
 * (COMPLETENESS 66): the build (the page's stamped commit, `local` for a
 * checkout), the aircraft seated, the activity (the Ui's mode, empty on
 * the title), and the controller the pilot chose (src/input/stickstore.js
 * loadPadChoice: a pad's id as the browser names it, else `none` for the
 * keyboard on purpose or `auto` for no choice yet).
 * Plain inputs in, so the selftest holds it in Node.
 */
const FIELD_CHARS = 40;
const CONTROLLER_CHARS = 100;
export function reportFields({ version = null, airframe = '', mode = null, pad = null } = {}) {
  const text = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  const controller = pad && pad.kind === 'pad' ? text(pad.id, CONTROLLER_CHARS) : text(pad && pad.kind, FIELD_CHARS);
  return {
    build: text(version, FIELD_CHARS) || 'local',
    airframe: text(airframe, FIELD_CHARS),
    activity: text(mode, FIELD_CHARS),
    controller,
  };
}

/* Resolves to the board's answer (null when it is empty or not JSON).
 * Rejects with an Error carrying `status` when the board refuses, worded
 * as the board worded it if it did, and with fetch's own error when there
 * is no board to reach. */
export async function submitBug(payload, origin = boardOrigin()) {
  const base = String(origin || '').trim().replace(/\/+$/, '');
  const res = await fetch(`${base}/api/bugs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let answer = null;
  if (text) {
    try {
      answer = JSON.parse(text);
    } catch (e) {
      answer = null;
    }
  }
  if (res.ok) {
    return answer;
  }
  const refusal = new Error((answer && answer.error) || text || str('board.the_board_answered', { status: res.status }));
  refusal.status = res.status;
  throw refusal;
}
