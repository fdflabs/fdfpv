/*
 * tricks.js: the freestyle trick catalogue and the score factors built on it.
 *
 * The tables themselves are generated into tricks-sheet.js from the scoring
 * workbook extract; this module is the one callers import. It adds a name
 * index over tricks and building blocks, plus the small penalty and bonus
 * curves the scorer applies to each trick and each run.
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

import { str } from '../strings/index.js';
import {
  TRICKS,
  BUILDING_BLOCKS,
  REPEAT_TRICK,
  BACK_TO_BACK_HALVING,
  REPEAT_OBSTACLE,
  OBSTACLE_BONUS,
} from './tricks-sheet.js';

export {
  TRICKS,
  BUILDING_BLOCKS,
  EXECUTION,
  REPEAT_TRICK,
  BACK_TO_BACK_HALVING,
  REPEAT_OBSTACLE,
  OBSTACLE_BONUS,
} from './tricks-sheet.js';

/*
 * Not in the extract: the workbook calculator's streak cell is
 * G(n) = G(n-1) + O(n-1) / 10000, where O is the previous trick's points
 * after execution, repeat and back to back adjustments, before the streak.
 */
export const STREAK_DIVISOR = 10000;

// Resolved at load, like the sheet's own labels, so the locale active at
// import time decides the category text.
const blockCategory = str('tricks.building_blocks');

// Catalogue entries go in first so a name that is also a building block
// (Split-S) keeps its catalogue entry.
const byName = new Map(TRICKS.map((t) => [t.name, t]));
for (const { name, points } of BUILDING_BLOCKS) {
  if (!byName.has(name)) byName.set(name, { name, category: blockCategory, difficulty: 'Block', points });
}

export function trickByName(name) {
  return byName.get(name);
}

export function trickPoints(name) {
  const entry = byName.get(name);
  if (!entry) throw new Error(`tricks: no trick named ${name}`);
  return entry.points;
}

export function trickNames() {
  return [...byName.keys()];
}

// The comparisons are deliberately loose: callers have passed strings and
// fractions, and the scores they got are pinned by the golden record.
function tablePenalty(table, count) {
  if (!(count > 0)) return table[0];
  return count < table.length ? table[count] : table[table.length - 1];
}

export function repeatTrickFactor(priorCount) {
  return tablePenalty(REPEAT_TRICK, priorCount);
}

export function repeatObstacleFactor(inARow) {
  return tablePenalty(REPEAT_OBSTACLE, inARow);
}

export function backToBackFactor(runLength) {
  let f = 1;
  // Stopping at 0 keeps an unbounded run from looping forever.
  for (let i = 1; i < runLength && f > 0; i++) f *= BACK_TO_BACK_HALVING;
  return f;
}

export function obstacleBonusMultiplier(switches) {
  let mult = OBSTACLE_BONUS[0][1];
  for (const [need, m] of OBSTACLE_BONUS) {
    if (switches >= need) mult = m;
  }
  return mult;
}
