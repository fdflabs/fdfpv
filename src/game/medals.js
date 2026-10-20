/*
 * medals.js: the bronze, silver and gold a pilot's progress holds per
 * course (docs/FLIGHTCLUB-PROGRESSION.md section 2): the steps, which of
 * two is better, and which steps a new one reaches.
 *
 * The course documents that carried a gold time, the laps that reached a
 * medal and the publish that set one left with the track builder and the
 * race (the combat-only cut, 2026-10-20). What stays is the vocabulary of
 * the medals already in pilots' progress: the merge on the server
 * (src/share/progressmerge.js), the pay per step (src/game/progress.js)
 * and the pilot's stats read it.
 *
 * Pure: no DOM, no storage, so the progress merge on the server and the
 * selftest read the same rules.
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

export const MEDAL_STEPS = ['bronze', 'silver', 'gold'];
const rank = (m) => MEDAL_STEPS.indexOf(m);

/* The better of two medals, either possibly absent. */
export function betterMedal(a, b) {
  return rank(a) >= rank(b) ? (rank(a) < 0 ? null : a) : b;
}

/* The steps `now` reaches that `before` did not, lowest first: what a
 * medal pays for (src/game/progress.js awardMedal). */
export function newSteps(before, now) {
  return MEDAL_STEPS.slice(rank(before) + 1, rank(now) + 1);
}
