/*
 * watchseat.js: the seat a watcher is welcomed to (edge/rooms/core.js
 * watch): it sees the room's games and plays in none. Every room game's
 * client reads it, the war's and the ops missions' among them. Here
 * because this file imports nothing, so the games' modules (roomtag.js
 * and roomjam.js, which src/share/modes.js imports) take it without an
 * import cycle.
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

export const WATCH_SEAT = 0;
