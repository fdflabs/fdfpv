/*
 * timing.js: the room clock's spans that more than one room game counts
 * by. The war (war.js) and the ops missions (ops.js) start and judge on
 * the same two as the race and Catch the Ace did, so they live here and
 * not in either game: a game's file can go without taking the others'
 * clock with it.
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

/* Long enough for a pilot on a menu to be put on the start line and see
 * the numbers before they fly. */
export const COUNTDOWN_MS = 6000;

/* A seat silent for longer than this (a menu, a tab in the background) is
 * not waited for. Shorter silences are, a stall or a pause for breath: a
 * seat that the frontier ran past while it was quiet would have its first
 * samples back judged as not there, by how late they are, and lag would
 * decide. The midair referee's KEEP_MS, how much past a room holds. */
export const WAIT_MS = 2000;
