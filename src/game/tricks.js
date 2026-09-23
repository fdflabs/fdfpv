import { str } from '../strings/index.js';
/*
 * tricks.js: the freestyle trick catalogue and the score model, as published
 * numbers and nothing else.
 *
 * Every figure in this file is transcribed from one spreadsheet: The Whoop
 * Pilots' freestyle scoring calculator, "Tyrantt_Pro_Whooper.xlsx", supplied
 * by the owner on 2026-08-30. It is the scoring sheet a real freestyle
 * competition runs on: a judge picks each trick off a list, marks how it was
 * flown, and the sheet applies the penalties. Nothing here is invented and
 * nothing here is tuned to feel good. When a number in this file looks wrong,
 * the sheet is the argument, not this file.
 *
 * The extracted workbook lives at
 *   tests/fixtures/freestyle-scoring/twp-calculator.json
 * and `npm run score:selftest` asserts this file still agrees with it, name
 * for name and point for point. The workbook itself is not vendored: it is 1.4 MB
 * of XLSX carrying three embedded images, and the project needs the numbers
 * rather than the file. That is the same rule src/game/track.js applies to
 * the MultiGP course PDFs.
 *
 * WHICH SHEET. The workbook scores indoor and outdoor separately, and the
 * two disagree: an indoor Flip is 75 points where an outdoor Flip is 50,
 * because indoor tricks are named against a specific obstacle class and
 * outdoor tricks are not. Freestyle city is a town, so this file carries the
 * OUTDOOR list, from the sheet "Trick List - Outdoor". The indoor sheet's
 * obstacle classes (Single Gate, Cube, Under/Over, Triple Gate Stack, Dive
 * Gate, Wall Taps) are in the evidence JSON if a hall is ever built.
 *
 * WHAT IS NOT HERE, and it is deliberate. The workbook also carries "Trick
 * of the Week", a KWAD letter bonus and a map-of-the-week multiplier. Those
 * are the administration of a weekly online competition, not a property of
 * flying, and a simulator that awarded a doubling for whichever trick a
 * coordinator posted on a Monday would be scoring the calendar. The tables
 * are preserved in the evidence JSON. They are the obvious shape for a daily
 * challenge later, which is the only reason to say what they were.
 *
 * Units: points are points, dimensionless. Angles anywhere near this file
 * are turns, not degrees and not radians, because the sheet's own language
 * is "180 degrees" and "360 degrees" and a turn is the honest unit for a
 * thing that is counted rather than measured.
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
 * The catalogue. 90 tricks in ten categories, in the sheet's own order, which
 * is roughly easiest first within each category.
 *
 * `points` is the sheet's base value before any adjustment. Every multiplier
 * below scales it. The explanations are not carried: they are a paragraph
 * each, they are the judge's definition rather than the simulator's, and the
 * recogniser in src/game/trickdetect.js has to state its own conditions in
 * code anyway. They are in the evidence JSON where a wiki page can read them.
 */
export const TRICKS = [

  /* Open Air Tricks */
  { name: 'Flip', category: str('tricks.open_air_tricks'), difficulty: 'Beginner', points: 50 },
  { name: 'Roll', category: str('tricks.open_air_tricks'), difficulty: 'Beginner', points: 50 },
  { name: str('tricks.yaw_spin'), category: str('tricks.open_air_tricks'), difficulty: 'Beginner', points: 50 },
  { name: str('tricks.segmented_flips_rolls'), category: str('tricks.open_air_tricks'), difficulty: 'Beginner', points: 75 },
  { name: str('tricks.invert_rewind'), category: str('tricks.open_air_tricks'), difficulty: 'Beginner', points: 75 },
  { name: str('tricks.vanny_roll'), category: str('tricks.open_air_tricks'), difficulty: 'Beginner', points: 125 },
  { name: str('tricks.double_flip'), category: str('tricks.open_air_tricks'), difficulty: 'Beginner', points: 150 },
  { name: str('tricks.double_roll'), category: str('tricks.open_air_tricks'), difficulty: 'Beginner', points: 150 },
  { name: str('tricks.juicy_flick'), category: str('tricks.open_air_tricks'), difficulty: 'Novice', points: 200 },
  { name: 'Snapback', category: str('tricks.open_air_tricks'), difficulty: 'Novice', points: 200 },
  { name: str('tricks.rubik_s_cube'), category: str('tricks.open_air_tricks'), difficulty: 'Intermediate', points: 325 },
  { name: str('tricks.cubik_s_rube'), category: str('tricks.open_air_tricks'), difficulty: 'Intermediate', points: 325 },
  { name: str('tricks.inverted_yaw_spin'), category: str('tricks.open_air_tricks'), difficulty: 'Advanced', points: 400 },
  { name: str('tricks.inverted_yaw_tracking'), category: str('tricks.open_air_tricks'), difficulty: 'Advanced', points: 425 },

  /* Powerloops */
  { name: 'Powerloop', category: 'Powerloops', difficulty: 'Novice', points: 200 },
  { name: str('tricks.immelmann_turn'), category: 'Powerloops', difficulty: 'Novice', points: 250 },
  { name: str('tricks.power_split'), category: 'Powerloops', difficulty: 'Intermediate', points: 300 },
  { name: str('tricks.power_flip'), category: 'Powerloops', difficulty: 'Intermediate', points: 350 },
  { name: str('tricks.reversed_power_flip'), category: 'Powerloops', difficulty: 'Intermediate', points: 325 },
  { name: str('tricks.power_swap'), category: 'Powerloops', difficulty: 'Intermediate', points: 350 },
  { name: str('tricks.power_switch'), category: 'Powerloops', difficulty: 'Advanced', points: 425 },
  { name: str('tricks.power_roll'), category: 'Powerloops', difficulty: 'Advanced', points: 450 },
  { name: str('tricks.inverted_360_powerloop'), category: 'Powerloops', difficulty: 'Master', points: 650 },
  { name: 'Barani', category: 'Powerloops', difficulty: 'Master', points: 700 },
  { name: str('tricks.beginner_switch'), category: 'Powerloops', difficulty: 'Beginner', points: 150 },
  { name: 'Immelloop', category: 'Powerloops', difficulty: 'Intermediate', points: 300 },
  { name: 'Immelmatt', category: 'Powerloops', difficulty: 'Advanced', points: 450 },
  { name: 'Rollani', category: 'Powerloops', difficulty: 'Master', points: 800 },
  { name: 'Flipani', category: 'Powerloops', difficulty: 'Master', points: 850 },

  /* Maverick Loops */
  { name: str('tricks.maverick_loop'), category: str('tricks.maverick_loops'), difficulty: 'Beginner', points: 100 },
  { name: str('tricks.mavvy_roll'), category: str('tricks.maverick_loops'), difficulty: 'Novice', points: 250 },
  { name: str('tricks.half_mavvy'), category: str('tricks.maverick_loops'), difficulty: 'Advanced', points: 450 },
  { name: str('tricks.mavik_s_loop'), category: str('tricks.maverick_loops'), difficulty: 'Advanced', points: 475 },
  { name: 'Mavani', category: str('tricks.maverick_loops'), difficulty: 'Advanced', points: 500 },
  { name: str('tricks.donkey_loop'), category: str('tricks.maverick_loops'), difficulty: 'Master', points: 600 },
  { name: 'Mavvelmann', category: str('tricks.maverick_loops'), difficulty: 'Novice', points: 250 },

  /* Matty Flips */
  { name: str('tricks.beginner_matty'), category: str('tricks.matty_flips'), difficulty: 'Beginner', points: 100 },
  { name: str('tricks.matty_flip'), category: str('tricks.matty_flips'), difficulty: 'Novice', points: 200 },
  { name: str('tricks.matty_twister'), category: str('tricks.matty_flips'), difficulty: 'Intermediate', points: 350 },
  { name: str('tricks.half_matty'), category: str('tricks.matty_flips'), difficulty: 'Intermediate', points: 350 },
  { name: str('tricks.540_half_matty'), category: str('tricks.matty_flips'), difficulty: 'Advanced', points: 425 },
  { name: str('tricks.matty_360'), category: str('tricks.matty_flips'), difficulty: 'Advanced', points: 425 },
  { name: 'Forani', category: str('tricks.matty_flips'), difficulty: 'Advanced', points: 475 },
  { name: str('tricks.anti_matty'), category: str('tricks.matty_flips'), difficulty: 'Novice', points: 250 },
  { name: str('tricks.power_matty'), category: str('tricks.matty_flips'), difficulty: 'Intermediate', points: 300 },
  { name: str('tricks.matty_roll'), category: str('tricks.matty_flips'), difficulty: 'Advanced', points: 425 },

  /* SplitS */
  { name: 'Split-S', category: 'SplitS', difficulty: 'Beginner', points: 100 },
  { name: str('tricks.540_split_s'), category: 'SplitS', difficulty: 'Novice', points: 250 },
  { name: 'Split-Back', category: 'SplitS', difficulty: 'Intermediate', points: 300 },
  { name: str('tricks.split_yaw'), category: 'SplitS', difficulty: 'Intermediate', points: 300 },
  { name: str('tricks.split_stall_matty_rewind'), category: 'SplitS', difficulty: 'Intermediate', points: 350 },

  /* Pole Dancing */
  { name: str('tricks.orbit_x2'), category: str('tricks.pole_dancing'), difficulty: 'Beginner', points: 75 },
  { name: 'Cradle', category: str('tricks.pole_dancing'), difficulty: 'Beginner', points: 150 },
  { name: str('tricks.side_lock_rewind'), category: str('tricks.pole_dancing'), difficulty: 'Beginner', points: 150 },
  { name: 'Whiplash', category: str('tricks.pole_dancing'), difficulty: 'Beginner', points: 175 },
  { name: str('tricks.pole_dance'), category: str('tricks.pole_dancing'), difficulty: 'Advanced', points: 450 },
  { name: str('tricks.trippy_spin_x2'), category: str('tricks.pole_dancing'), difficulty: 'Advanced', points: 500 },
  { name: str('tricks.trippy_switch'), category: str('tricks.pole_dancing'), difficulty: 'Advanced', points: 550 },
  { name: str('tricks.double_rolling_trippy_spin'), category: str('tricks.pole_dancing'), difficulty: 'Master', points: 750 },

  /* Jump Roping */
  { name: str('tricks.jump_rope'), category: str('tricks.jump_roping'), difficulty: 'Beginner', points: 100 },
  { name: str('tricks.cinnamon_roll'), category: str('tricks.jump_roping'), difficulty: 'Beginner', points: 175 },
  { name: str('tricks.burrito_roll'), category: str('tricks.jump_roping'), difficulty: 'Novice', points: 250 },
  { name: str('tricks.side_loop'), category: str('tricks.jump_roping'), difficulty: 'Novice', points: 200 },
  { name: str('tricks.double_dutch'), category: str('tricks.jump_roping'), difficulty: 'Intermediate', points: 300 },

  /* Rewinds */
  { name: str('tricks.flip_stall_rewind'), category: 'Rewinds', difficulty: 'Novice', points: 275 },
  { name: str('tricks.360_stall_rewind'), category: 'Rewinds', difficulty: 'Novice', points: 275 },
  { name: str('tricks.matty_stall_rewind'), category: 'Rewinds', difficulty: 'Intermediate', points: 350 },
  { name: str('tricks.half_matty_stall_rewind'), category: 'Rewinds', difficulty: 'Intermediate', points: 375 },
  { name: str('tricks.540_half_matty_stall_rewind'), category: 'Rewinds', difficulty: 'Advanced', points: 450 },
  { name: str('tricks.stall_rewind'), category: 'Rewinds', difficulty: 'Beginner', points: 75 },

  /* Wall Tricks */
  { name: 'Dive', category: str('tricks.wall_tricks'), difficulty: 'Beginner', points: 100 },
  { name: str('tricks.wall_ride'), category: str('tricks.wall_tricks'), difficulty: 'Beginner', points: 150 },
  { name: str('tricks.wall_tap'), category: str('tricks.wall_tricks'), difficulty: 'Beginner', points: 150 },
  { name: str('tricks.roll_tap'), category: str('tricks.wall_tricks'), difficulty: 'Novice', points: 250 },
  { name: str('tricks.loop_tap'), category: str('tricks.wall_tricks'), difficulty: 'Intermediate', points: 300 },
  { name: str('tricks.ceiling_tap'), category: str('tricks.wall_tricks'), difficulty: 'Intermediate', points: 300 },
  { name: str('tricks.reverse_wall_ride'), category: str('tricks.wall_tricks'), difficulty: 'Intermediate', points: 300 },
  { name: str('tricks.downtown_tap'), category: str('tricks.wall_tricks'), difficulty: 'Intermediate', points: 350 },
  { name: str('tricks.maverick_tap_rewind'), category: str('tricks.wall_tricks'), difficulty: 'Advanced', points: 500 },
  { name: str('tricks.power_switch_tap'), category: str('tricks.wall_tricks'), difficulty: 'Advanced', points: 550 },

  /* Gaps */
  { name: str('tricks.knife_edge'), category: 'Gaps', difficulty: 'Beginner', points: 150 },
  { name: str('tricks.reverse_knife_edge'), category: 'Gaps', difficulty: 'Intermediate', points: 300 },
  { name: str('tricks.ninja_star'), category: 'Gaps', difficulty: 'Advanced', points: 450 },

  /* Other Tricks */
  { name: 'Facepunch', category: str('tricks.other_tricks'), difficulty: 'Beginner', points: 100 },
  { name: str('tricks.slide_disarm'), category: str('tricks.other_tricks'), difficulty: 'Novice', points: 200 },
  { name: 'Perch', category: str('tricks.other_tricks'), difficulty: 'Novice', points: 200 },
  { name: str('tricks.eject_roll'), category: str('tricks.other_tricks'), difficulty: 'Novice', points: 200 },
  { name: 'Blindflip', category: str('tricks.other_tricks'), difficulty: 'Intermediate', points: 300 },
  { name: str('tricks.true_barani'), category: str('tricks.other_tricks'), difficulty: 'Intermediate', points: 375 },
  { name: str('tricks.stellar_eject_roll'), category: str('tricks.other_tricks'), difficulty: 'Advanced', points: 450 },];

/*
 * The building blocks, from the sheet "Custom Trick Building Blocks". A
 * competitor who flies something the list does not name adds up the parts
 * instead, and this is the price list for a part.
 *
 * The recogniser uses these for the same reason a judge does: a quarter roll
 * that is not part of anything larger is still a quarter roll, and scoring it
 * as nothing means the first thirty seconds of a run reads as zero. They are
 * the floor under the catalogue, not a second catalogue.
 */
export const BUILDING_BLOCKS = [
  { name: str('tricks.1_4_flip'), points: 25 },
  { name: str('tricks.1_2_flip'), points: 50 },
  { name: str('tricks.3_4_flip'), points: 75 },
  { name: str('tricks.1_flip'), points: 100 },
  { name: str('tricks.1_4_roll'), points: 25 },
  { name: str('tricks.1_2_roll'), points: 50 },
  { name: str('tricks.3_4_roll'), points: 75 },
  { name: str('tricks.1_roll'), points: 100 },
  { name: str('tricks.1_4_yaw_spin'), points: 25 },
  { name: str('tricks.1_2_yaw_spin'), points: 50 },
  { name: str('tricks.3_4_yaw_spin'), points: 75 },
  { name: str('tricks.1_yaw_spin'), points: 100 },
  { name: str('tricks.1_4_powerloop'), points: 25 },
  { name: str('tricks.1_2_power_loop'), points: 100 },
  { name: str('tricks.3_4_power_loop'), points: 150 },
  { name: str('tricks.1_2_maverick'), points: 50 },
  { name: 'Split-S', points: 100 },
  { name: str('tricks.1_4_matty_flip'), points: 25 },
  { name: str('tricks.1_2_matty_flip'), points: 100 },
  { name: str('tricks.1_2_trippy_spin'), points: 50 },
  { name: str('tricks.1_trippy_spin'), points: 100 },
  { name: 'Rewind', points: 100 },
  { name: 'Dive', points: 100 },
  { name: 'Eject', points: 100 },
  { name: str('tricks.juicy_flick'), points: 200 },
  { name: str('tricks.wall_tap'), points: 150 },
  { name: str('tricks.1_4_jump_rope'), points: 25 },
  { name: str('tricks.1_2_jump_rope'), points: 50 },];

/*
 * How a trick was flown, and what that costs. Sheet "Info Tables", columns
 * AG and AH, and the same table restated on the Landing Page.
 *
 *   CLEAN   flown as described.
 *   SLOPPY  no contact, but the motion broke up: segmented where it should
 *           have been one loop. 35% off.
 *   BUMP    completed, but tapped a gate, a wall or the ground without
 *           disarming. Half points, and it halves the streak.
 *   MISSED  did not complete, no contact. Nothing, and the streak stalls
 *           rather than dying.
 *   CRASH   did not complete, contact and disarm. Nothing, and the streak
 *           is gone.
 *
 * `streak` names what happens to the run's streak multiplier and is read by
 * src/game/score.js. The workbook says it in prose; this says it in a word
 * so that one switch statement can implement it.
 */
export const EXECUTION = {
  CLEAN: { points: 1.0, streak: 'grow', label: str('tricks.clean') },
  SLOPPY: { points: 0.65, streak: 'grow', label: str('tricks.sloppy') },
  BUMP: { points: 0.5, streak: 'halve', label: str('tricks.bump') },
  MISSED: { points: 0.0, streak: 'hold', label: str('tricks.missed') },
  CRASH: { points: 0.0, streak: 'kill', label: str('tricks.crash') },
};

/*
 * Flying the same trick again, later in the run. Sheet "Info Tables",
 * columns T and U, indexed by how many times it has already been landed.
 *
 * Third repeat is worth nothing at all, which is the sheet being blunt about
 * what it wants: a run of thirty flips is not a freestyle run.
 */
export const REPEAT_TRICK = [1.0, 0.75, 0.5, 0.0];

/*
 * Flying the same trick again IMMEDIATELY. Sheet "Info Tables", columns Q
 * and R, indexed by the length of the back to back run. It halves each time
 * and the sheet tabulates it out to 34 places; a halving needs no table.
 */
export const BACK_TO_BACK_HALVING = 0.5;

/*
 * Staying on the same obstacle. Sheet "Info Tables", columns W and X,
 * indexed by how many tricks in a row have used it. Three is free, then it
 * falls away and the sixth is worth nothing.
 *
 * Nothing reads this yet. Obstacle awareness is stage 2 of this system, and
 * the table is here so that stage 2 is a wiring job rather than a second
 * reading of the workbook. See PROGRESS.md, 2026-08-30.
 */
export const REPEAT_OBSTACLE = [1.0, 1.0, 1.0, 1.0, 0.66, 0.33, 0.0];

/*
 * The run bonus for moving around. Sheet "Info Tables", columns AC, AD and
 * AE: a ladder on the number of times the run switched obstacle, applied to
 * the whole run's trick score as (multiplier - 1) * trickScore.
 *
 * Read as [switches, multiplier], lowest first, and the highest row whose
 * switch count has been reached wins. The sheet's first column, unique
 * obstacle count, is 1 on every row after the first and so decides nothing;
 * it is dropped here rather than carried as a column of ones.
 */
export const OBSTACLE_BONUS = [
  [0, 1.0],
  [3, 1.05],
  [6, 1.1],
  [9, 1.2],
  [12, 1.35],
  [15, 1.5],
  [18, 1.7],
  [21, 2.0],
];

/*
 * The streak multiplier's growth rate. From the calculator's own cell:
 *
 *   G(n) = G(n-1) + O(n-1) / 10000
 *
 * where O is the previous trick's score after the execution, repeat and back
 * to back adjustments but BEFORE the streak itself, so the streak cannot
 * compound on its own output. G starts at 1. A 200 point trick therefore buys
 * two hundredths of multiplier, and a full clean run of thirty tricks lands
 * somewhere near 1.9: this is a reward for not crashing for a long time, and
 * it is deliberately not a per-combo multiplier. The combo multiplier is a
 * separate thing that the workbook does not have, and it is defined and
 * argued in src/game/score.js rather than smuggled in here.
 */
export const STREAK_DIVISOR = 10000;

/* Name to entry, built once. The recogniser and the scorer both look tricks
 * up by the name they are printed under, because that name is the only
 * identifier the workbook gives them. */
const BY_NAME = new Map();
for (const t of TRICKS) {
  BY_NAME.set(t.name, t);
}
for (const b of BUILDING_BLOCKS) {
  /* A block is only reachable by name if the catalogue has not already
   * claimed the name. Split-S is in both, at 100 points in both, and the
   * catalogue entry is the one that carries a category. */
  if (!BY_NAME.has(b.name)) {
    BY_NAME.set(b.name, {
      name: b.name, category: str('tricks.building_blocks'), difficulty: 'Block', points: b.points,
    });
  }
}

/* The trick, or undefined. Callers that pass a name they built themselves
 * are wrong and should fail loudly, so this does not invent a default. */
export function trickByName(name) {
  return BY_NAME.get(name);
}

/* Base points for a named trick. Throws rather than scoring zero: a typo in
 * a pattern is a bug in the recogniser, and a silent zero hides it for
 * months. */
export function trickPoints(name) {
  const t = BY_NAME.get(name);
  if (!t) {
    throw new Error(`tricks: no trick named ${name}`);
  }
  return t.points;
}

/* Every name the catalogue and the blocks know, for the lint. */
export function trickNames() {
  return Array.from(BY_NAME.keys());
}

/*
 * The repeat penalty for a trick landed `priorCount` times already in this
 * run. Past the end of the table the answer stays at the last row, which is
 * zero, so a fifth repeat is worth what a fourth is: nothing.
 */
export function repeatTrickFactor(priorCount) {
  if (!(priorCount > 0)) {
    return REPEAT_TRICK[0];
  }
  return priorCount < REPEAT_TRICK.length
    ? REPEAT_TRICK[priorCount]
    : REPEAT_TRICK[REPEAT_TRICK.length - 1];
}

/*
 * The back to back penalty for the nth consecutive landing of the same
 * trick, n counted from 1. A halving per step, computed by repeated
 * multiplication rather than Math.pow: CLAUDE.md keeps pow out of anything
 * that has to give the same answer twice, and n here is a small integer.
 */
export function backToBackFactor(runLength) {
  let f = 1;
  for (let i = 1; i < runLength; i += 1) {
    f *= BACK_TO_BACK_HALVING;
  }
  return f;
}

/* The obstacle repeat penalty, same clamping rule as the trick repeat. */
export function repeatObstacleFactor(inARow) {
  if (!(inARow > 0)) {
    return REPEAT_OBSTACLE[0];
  }
  return inARow < REPEAT_OBSTACLE.length
    ? REPEAT_OBSTACLE[inARow]
    : REPEAT_OBSTACLE[REPEAT_OBSTACLE.length - 1];
}

/* The run's obstacle bonus multiplier for a given number of switches. */
export function obstacleBonusMultiplier(switches) {
  let m = OBSTACLE_BONUS[0][1];
  for (const [need, mult] of OBSTACLE_BONUS) {
    if (switches >= need) {
      m = mult;
    }
  }
  return m;
}
