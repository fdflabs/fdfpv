/*
 * intro.js: how long the war mode's default intro film runs, the room's
 * briefing for a mission with no film of its own (src/share/war/films,
 * film.js). Each mission's own is films/index.js briefingMs(mission);
 * this is the default's, which the room's checks use for their test
 * missions.
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

import { briefingMs } from './films/index.js';

/* The default film's whole length: the briefing of a mission without a
 * film of its own. */
export const INTRO_MS = briefingMs(null);
