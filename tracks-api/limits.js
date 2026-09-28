/*
 * limits.js: the tracks server's numbers, in one place.
 *
 * A module of their own because a Worker's entry module may export nothing
 * but its handler, and the selftest needs the same numbers the server uses.
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
