/*
 * tracksorigin.js: where this page finds the tracks server, which holds
 * the accounts and the waitlist (tracks-api/). Named for what it first
 * served. It lived in cloud.js, the track uploader, until that left with
 * the track builder (the combat-only cut, 2026-10-20).
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

/*
 * The deployed server: tracks-api/node.js on the owner's VM, behind Caddy
 * (deploy/vm/README.md), at the origin src/share/api.js names. A fork
 * without a server sets PRODUCTION_TRACKS_ORIGIN to PLACEHOLDER_ORIGIN,
 * which counts as no server at all: the page then has no accounts and no
 * sign in (src/share/account.js accountsAvailable).
 */
const PLACEHOLDER_ORIGIN = 'https://fdfpv-tracks.example.workers.dev';
export const PRODUCTION_TRACKS_ORIGIN = API_ORIGIN;
const ORIGIN_KEY = 'webfpv.tracks.origin';

function trim(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

export function tracksOrigin() {
  try {
    const asked = new URLSearchParams(window.location.search).get('tracks');
    if (asked === 'off') {
      localStorage.removeItem(ORIGIN_KEY);
    } else if (asked && /^https?:\/\//.test(asked)) {
      localStorage.setItem(ORIGIN_KEY, trim(asked));
    }
  } catch (e) {
    /* No URL or no storage: the stored value or the default decides. */
  }
  try {
    const stored = trim(localStorage.getItem(ORIGIN_KEY));
    if (stored) {
      return stored;
    }
  } catch (e) {
    /* Private mode. */
  }
  try {
    /* Loopback, and a pull request's preview on its own host
     * (docs/PREVIEWS.md): no production server, so a build nobody merged
     * never signs in or writes an account. */
    if (!SITE_HOSTS.includes(window.location.hostname)) {
      return '';
    }
  } catch (e) {
    return '';
  }
  return PRODUCTION_TRACKS_ORIGIN === PLACEHOLDER_ORIGIN ? '' : PRODUCTION_TRACKS_ORIGIN;
}

export function tracksConfigured() {
  return Boolean(tracksOrigin());
}
