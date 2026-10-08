/*
 * limits.js: the tracks server's numbers, in one place.
 *
 * A module of their own because a Worker's entry module may export nothing
 * but its handler, and the selftest needs the same numbers the server uses.
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

/*
 * THE DOCUMENT CAP. The builder's logo budget is 384 kB of data URL
 * (BRANDING_MAX_CHARS in model.js), and a 150 gate course is 59 kB of JSON
 * (measured with tests/lib/maptrack.js), so 512 kB holds a full logo budget
 * on a 150 gate course with room over. worker.js caps the body at the document plus its envelope.
 */
export const DOCUMENT_MAX_CHARS = 512 * 1024;

/* Track names: the builder's own rename field allows 80. */
export const TRACK_NAME_MAX = 80;

/*
 * WRITES PER ADDRESS: 30 in 10 minutes. The simulator uploads a track when
 * it is saved (Ctrl S, leaving the builder, starting a new one), one upload
 * in flight at a time and none when nothing changed since the last one, so
 * a pilot building flat out saves a few times a minute at most. Thirty in
 * ten minutes is that with a wide margin, and it caps what one address can
 * push into a free tier database at about four thousand writes a day.
 */
export const WRITE_LIMIT = 30;
export const WRITE_WINDOW_S = 600;

export const PAGE_DEFAULT = 24;
export const PAGE_MAX = 50;

/*
 * ACCOUNTS (accounts.js), in the same ten minute window as the saves.
 * A sign in is one click of Google's button, so twenty from one address in
 * ten minutes is a household signing in and out with room over. The other
 * account writes are a callsign now and then and the progress sync, which
 * the page sends at most once a minute while something changed, so sixty
 * is a pilot with three tabs open.
 */
export const SIGNIN_LIMIT = 20;
/* Hangar visits read (GET /api/hangar/<callsign>), same window: a pilot
 * looking round a few friends' hangars asks a handful; 120 keeps one
 * address from walking the callsign list. */
export const HANGAR_VISIT_LIMIT = 120;
export const ACCOUNT_WRITE_LIMIT = 60;

/* A session lasts thirty days from its sign in, and an account keeps at
 * most this many, its oldest dropped first: a pilot's computers and
 * browsers, with room over. */
export const SESSION_DAYS = 30;
export const SESSIONS_PER_ACCOUNT = 20;

/*
 * THE PROGRESS BLOB CAP, 512 kB, the same as a track document. The bulk
 * of a blob is saved liveries, up to MAX_SAVED (24) per plane
 * (configs/paint.js), each under a room profile's 4 kB. A pilot with a
 * handful of saves on each plane is tens of kB; one with all 24 on every
 * plane is past the cap, and that sync is refused with a 413 the page
 * shows, rather than the server keeping megabytes per account.
 */
export const PROGRESS_MAX_CHARS = 512 * 1024;

/*
 * MY HANGAR IN THE BLOB (src/share/progressmerge.js blobRefusal). One
 * computer holds at most MAX_BUILDS builds (src/ui/builds.js), so a sync
 * carrying more is refused. A build is capped at 8 kB: the largest one a
 * pilot can make, every region coloured and finished, MAX_DECALS text
 * decals at TEXT_MAX letters (configs/paint.js), a 32 letter name, power,
 * parts, a full tuning entry and a loadout, measured 3452 characters (the
 * 10 inch, 2026-10-01), so 8 kB is that with more than twice over,
 * and 48 at the cap are 384 kB, inside PROGRESS_MAX_CHARS above.
 */
export const MAX_BUILDS = 48;
export const BUILD_MAX_CHARS = 8 * 1024;

/* Loadouts, settings.combat, one per combat aircraft (configs/combat.js):
 * there are four today, and 64 is that with room for many more. */
export const COMBAT_MAX_ENTRIES = 64;
