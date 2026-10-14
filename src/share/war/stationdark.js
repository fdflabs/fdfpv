/*
 * stationdark.js: The Long Night's twist A, Station dark (MISSIONS.md M4,
 * TECH-NEEDS T1.10): from the room ms the room says the dam's floodlights
 * were put out by order (the war view's stationDark, edge/rooms/war.js),
 * each of the dam's own districts (grid.js's station bus, but the two
 * switchyards, which are the grid's) goes out as a hit puts one out, its
 * flicker grid.js levelAt's, and stays out to the match's end. Every
 * input is the room's, so every screen agrees.
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

import { DISTRICTS, levelAt } from './grid.js';

/* The districts the order puts out, by index. */
export const STATION_DARK_DISTRICTS = DISTRICTS
  .map((d, i) => (d.bus === 'station' && !/yard$/.test(d.id) ? i : -1))
  .filter((i) => i >= 0);

/* `levels` (grid.js createGrid().levels, in place) at room ms t, under an
 * order given at room ms `at` (null: none). Returns `levels`. */
export function stationOrder(levels, at, t) {
  if (at == null) {
    return levels;
  }
  for (const i of STATION_DARK_DISTRICTS) {
    levels[i] = Math.min(levels[i], levelAt(at, i, t));
  }
  return levels;
}
