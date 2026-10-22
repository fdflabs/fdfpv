/*
 * board.js: which public leaderboard this page talks to.
 *
 * The board takes the F8 reports (src/share/bugs.js), the stats
 * (src/share/stats.js) and the pilots' name claims and key links
 * (src/share/account.js) at this origin. Its tracks, times, ghosts,
 * freestyle runs and weekly events are Flight Club's, and this page asks
 * for none of them since the combat-only cut (the times in #5, the tracks
 * and a ?share= course link on 2026-10-20).
 *
 * The board's base is, first match wins: a ?board= query, an override kept
 * in localStorage, then the board beside the page (a loopback page talks
 * to a development board on 3180, a deployed page to the /board mount on
 * the API host). The base may carry a path, so everything is joined onto
 * it as text with its trailing slashes trimmed, never through new URL().
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

import { API_ORIGIN, SITE_HOSTS } from './api.js';
import { carryRenamedKeys } from './oldkeys.js';

/* The development board, next to a shell served from loopback. */
export const DEFAULT_BOARD_ORIGIN = 'http://127.0.0.1:3180';
/* A deployed shell is a static site with nothing to ask at run time, so
 * its board is named here: the /board mount on the API host, which the
 * rooms and tracks servers share (deploy/vm/README.md). */
export const PRODUCTION_BOARD_ORIGIN = `${API_ORIGIN}/board`;
const OVERRIDE_KEY = 'fdfpv.board.origin';

/* Read at call time, never at load, so moving the old name here before
 * anything asks is enough. */
carryRenamedKeys([['webfpv.board.origin', OVERRIDE_KEY]]);

/* A fork with no board of its own sets its production board to this, and
 * the page then asks no board at all. */
const NO_BOARD = 'https://fdfpv.example/board';

/* Hostnames that mean a developer's machine; '' is a file:// open. */
const DEV_HOSTS = new Set(['', 'localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

const baseOf = (value) => String(value || '').trim().replace(/\/+$/, '');

/* `fn` with every failure read as "not available". The window, its query
 * and storage are each missing somewhere: Node, a sandbox, private mode. */
function guarded(fn, otherwise) {
  try {
    return fn();
  } catch (e) {
    return otherwise;
  }
}

export function boardConfigured() {
  return boardOrigin() !== NO_BOARD;
}

export function defaultBoardOrigin() {
  const NO_WINDOW = {};
  const host = guarded(() => window.location.hostname, NO_WINDOW);
  if (host === NO_WINDOW) {
    return DEFAULT_BOARD_ORIGIN;
  }
  if (DEV_HOSTS.has(host)) {
    return DEFAULT_BOARD_ORIGIN;
  }
  /* A pull request's preview (docs/PREVIEWS.md) posts nothing to the
   * real board. */
  return SITE_HOSTS.includes(host) ? PRODUCTION_BOARD_ORIGIN : NO_BOARD;
}

export function boardOrigin() {
  const asked = guarded(() => baseOf(new URLSearchParams(window.location.search).get('board')), '');
  if (asked) {
    return asked;
  }
  const kept = guarded(() => baseOf(localStorage.getItem(OVERRIDE_KEY)), '');
  return kept || defaultBoardOrigin();
}
