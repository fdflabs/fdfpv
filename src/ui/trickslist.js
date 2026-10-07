/*
 * trickslist.js: what the Tricks screen lists. The list is derived, never
 * written: one row per pattern the recogniser matches (src/game/
 * trickdetect.js PATTERNS) that has a price in the trick table and has
 * been landed in the proving flights (src/game/proven.js). So nothing is
 * offered that the game would not score, and nothing scoreable is left
 * out. The bare building blocks (a quarter, half or whole flip, roll or
 * yaw) are skipped: they are what tricks are made of, priced as
 * consolation, and eleven of them would bury the real tricks.
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

import { PATTERNS } from '../game/trickdetect.js';
import { PROVEN } from '../game/proven.js';
import { trickByName } from '../game/tricks.js';
import { str } from '../strings/index.js';

const BUILDING_BLOCK = /^(1\/4|1\/2|3\/4|1) (Flip|Roll|Yaw)/;

/* The scoreable tricks, grouped by category in alphabetical order and
 * cheapest first within each. A pattern name met twice is listed once. */
export function scoreableTricks() {
  const listed = new Map();
  for (const pattern of PATTERNS) {
    const name = pattern.name;
    if (listed.has(name) || BUILDING_BLOCK.test(name)) continue;
    const trick = trickByName(name);
    const proof = PROVEN[name];
    if (!trick || trick.points == null || !proof || proof.landed <= 0) continue;
    listed.set(name, {
      name,
      points: trick.points,
      category: trick.category || str('bugs.other'),
      difficulty: trick.difficulty || '',
      steps: pattern.steps,
      proven: proof,
    });
  }
  return [...listed.values()].sort((a, b) => (a.category === b.category
    ? a.points - b.points
    : a.category.localeCompare(b.category)));
}

/* How dependable a trick's scoring is, from its proving flights: landed
 * in every one is reliable, anything less is fussy and says how often. */
export function trickStatus(t) {
  const { landed, runs } = t.proven;
  if (landed >= runs) {
    return {
      tag: str('ui.reliable'),
      line: str('ui.scored_on_all_test_flights_across', { runs }) + str('ui.angles_and_three_degrees_of_overshoot'),
    };
  }
  return {
    tag: str('ui.fussy'),
    line: str('ui.scored_on_of_test_flights_so', { landed, runs }) + str('ui.it_wants_flying_cleanly_to_register'),
  };
}

export function countScoreableTricks() {
  return scoreableTricks().length;
}
