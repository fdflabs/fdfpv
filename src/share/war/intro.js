/*
 * intro.js: how long the war mode's default intro film runs, the room's
 * briefing for a mission with no film of its own (src/share/war/films,
 * film.js), and how long the mission brief card after any film holds.
 * Each mission's own film is films/index.js briefingMs(mission); this is
 * the default's, which the room's checks use for their test missions.
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

import { briefingMs } from './films/index.js';

/* The default film's whole length: the briefing of a mission without a
 * film of its own. */
export const INTRO_MS = briefingMs(null);

/* The mission brief card's span (src/ui/briefcard.js), after the film and
 * before the countdown, in a room's briefing of either campaign
 * (edge/rooms/war.js, ops.js): the host's Deploy cuts it short. 30 s is a
 * card of about 120 words read at 4 a second, the last pilot's to finish
 * it; a pilot who has read it presses Deploy. */
export const CARD_MS = 30000;
