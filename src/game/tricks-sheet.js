/*
 * tricks-sheet.js: the freestyle scoring workbook's tables.
 *
 * GENERATED FILE. Do not edit by hand: run `node scripts/tricks-gen.js`,
 * which reads tests/fixtures/freestyle-scoring/twp-calculator.json and says
 * how each table is taken from it. src/game/tricks.js is the module to
 * import; it re-exports these.
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

import { str } from '../strings/index.js';

const trick = (name, category, difficulty, points) => ({ name, category, difficulty, points });
const block = (name, points) => ({ name, points });

/* The Whoop Pilots freestyle scoring calculator, "Trick List - Outdoor", 90 rows. */
export const TRICKS = [
  trick('Flip', str('tricks.open_air_tricks'), 'Beginner', 50),
  trick('Roll', str('tricks.open_air_tricks'), 'Beginner', 50),
  trick(str('tricks.yaw_spin'), str('tricks.open_air_tricks'), 'Beginner', 50),
  trick(str('tricks.segmented_flips_rolls'), str('tricks.open_air_tricks'), 'Beginner', 75),
  trick(str('tricks.invert_rewind'), str('tricks.open_air_tricks'), 'Beginner', 75),
  trick(str('tricks.vanny_roll'), str('tricks.open_air_tricks'), 'Beginner', 125),
  trick(str('tricks.double_flip'), str('tricks.open_air_tricks'), 'Beginner', 150),
  trick(str('tricks.double_roll'), str('tricks.open_air_tricks'), 'Beginner', 150),
  trick(str('tricks.juicy_flick'), str('tricks.open_air_tricks'), 'Novice', 200),
  trick('Snapback', str('tricks.open_air_tricks'), 'Novice', 200),
  trick(str('tricks.rubik_s_cube'), str('tricks.open_air_tricks'), 'Intermediate', 325),
  trick(str('tricks.cubik_s_rube'), str('tricks.open_air_tricks'), 'Intermediate', 325),
  trick(str('tricks.inverted_yaw_spin'), str('tricks.open_air_tricks'), 'Advanced', 400),
  trick(str('tricks.inverted_yaw_tracking'), str('tricks.open_air_tricks'), 'Advanced', 425),
  trick('Powerloop', 'Powerloops', 'Novice', 200),
  trick(str('tricks.immelmann_turn'), 'Powerloops', 'Novice', 250),
  trick(str('tricks.power_split'), 'Powerloops', 'Intermediate', 300),
  trick(str('tricks.power_flip'), 'Powerloops', 'Intermediate', 350),
  trick(str('tricks.reversed_power_flip'), 'Powerloops', 'Intermediate', 325),
  trick(str('tricks.power_swap'), 'Powerloops', 'Intermediate', 350),
  trick(str('tricks.power_switch'), 'Powerloops', 'Advanced', 425),
  trick(str('tricks.power_roll'), 'Powerloops', 'Advanced', 450),
  trick(str('tricks.inverted_360_powerloop'), 'Powerloops', 'Master', 650),
  trick('Barani', 'Powerloops', 'Master', 700),
  trick(str('tricks.beginner_switch'), 'Powerloops', 'Beginner', 150),
  trick('Immelloop', 'Powerloops', 'Intermediate', 300),
  trick('Immelmatt', 'Powerloops', 'Advanced', 450),
  trick('Rollani', 'Powerloops', 'Master', 800),
  trick('Flipani', 'Powerloops', 'Master', 850),
  trick(str('tricks.maverick_loop'), str('tricks.maverick_loops'), 'Beginner', 100),
  trick(str('tricks.mavvy_roll'), str('tricks.maverick_loops'), 'Novice', 250),
  trick(str('tricks.half_mavvy'), str('tricks.maverick_loops'), 'Advanced', 450),
  trick(str('tricks.mavik_s_loop'), str('tricks.maverick_loops'), 'Advanced', 475),
  trick('Mavani', str('tricks.maverick_loops'), 'Advanced', 500),
  trick(str('tricks.donkey_loop'), str('tricks.maverick_loops'), 'Master', 600),
  trick('Mavvelmann', str('tricks.maverick_loops'), 'Novice', 250),
  trick(str('tricks.beginner_matty'), str('tricks.matty_flips'), 'Beginner', 100),
  trick(str('tricks.matty_flip'), str('tricks.matty_flips'), 'Novice', 200),
  trick(str('tricks.matty_twister'), str('tricks.matty_flips'), 'Intermediate', 350),
  trick(str('tricks.half_matty'), str('tricks.matty_flips'), 'Intermediate', 350),
  trick(str('tricks.540_half_matty'), str('tricks.matty_flips'), 'Advanced', 425),
  trick(str('tricks.matty_360'), str('tricks.matty_flips'), 'Advanced', 425),
  trick('Forani', str('tricks.matty_flips'), 'Advanced', 475),
  trick(str('tricks.anti_matty'), str('tricks.matty_flips'), 'Novice', 250),
  trick(str('tricks.power_matty'), str('tricks.matty_flips'), 'Intermediate', 300),
  trick(str('tricks.matty_roll'), str('tricks.matty_flips'), 'Advanced', 425),
  trick('Split-S', 'SplitS', 'Beginner', 100),
  trick(str('tricks.540_split_s'), 'SplitS', 'Novice', 250),
  trick('Split-Back', 'SplitS', 'Intermediate', 300),
  trick(str('tricks.split_yaw'), 'SplitS', 'Intermediate', 300),
  trick(str('tricks.split_stall_matty_rewind'), 'SplitS', 'Intermediate', 350),
  trick(str('tricks.orbit_x2'), str('tricks.pole_dancing'), 'Beginner', 75),
  trick('Cradle', str('tricks.pole_dancing'), 'Beginner', 150),
  trick(str('tricks.side_lock_rewind'), str('tricks.pole_dancing'), 'Beginner', 150),
  trick('Whiplash', str('tricks.pole_dancing'), 'Beginner', 175),
  trick(str('tricks.pole_dance'), str('tricks.pole_dancing'), 'Advanced', 450),
  trick(str('tricks.trippy_spin_x2'), str('tricks.pole_dancing'), 'Advanced', 500),
  trick(str('tricks.trippy_switch'), str('tricks.pole_dancing'), 'Advanced', 550),
  trick(str('tricks.double_rolling_trippy_spin'), str('tricks.pole_dancing'), 'Master', 750),
  trick(str('tricks.jump_rope'), str('tricks.jump_roping'), 'Beginner', 100),
  trick(str('tricks.cinnamon_roll'), str('tricks.jump_roping'), 'Beginner', 175),
  trick(str('tricks.burrito_roll'), str('tricks.jump_roping'), 'Novice', 250),
  trick(str('tricks.side_loop'), str('tricks.jump_roping'), 'Novice', 200),
  trick(str('tricks.double_dutch'), str('tricks.jump_roping'), 'Intermediate', 300),
  trick(str('tricks.flip_stall_rewind'), 'Rewinds', 'Novice', 275),
  trick(str('tricks.360_stall_rewind'), 'Rewinds', 'Novice', 275),
  trick(str('tricks.matty_stall_rewind'), 'Rewinds', 'Intermediate', 350),
  trick(str('tricks.half_matty_stall_rewind'), 'Rewinds', 'Intermediate', 375),
  trick(str('tricks.540_half_matty_stall_rewind'), 'Rewinds', 'Advanced', 450),
  trick(str('tricks.stall_rewind'), 'Rewinds', 'Beginner', 75),
  trick('Dive', str('tricks.wall_tricks'), 'Beginner', 100),
  trick(str('tricks.wall_ride'), str('tricks.wall_tricks'), 'Beginner', 150),
  trick(str('tricks.wall_tap'), str('tricks.wall_tricks'), 'Beginner', 150),
  trick(str('tricks.roll_tap'), str('tricks.wall_tricks'), 'Novice', 250),
  trick(str('tricks.loop_tap'), str('tricks.wall_tricks'), 'Intermediate', 300),
  trick(str('tricks.ceiling_tap'), str('tricks.wall_tricks'), 'Intermediate', 300),
  trick(str('tricks.reverse_wall_ride'), str('tricks.wall_tricks'), 'Intermediate', 300),
  trick(str('tricks.downtown_tap'), str('tricks.wall_tricks'), 'Intermediate', 350),
  trick(str('tricks.maverick_tap_rewind'), str('tricks.wall_tricks'), 'Advanced', 500),
  trick(str('tricks.power_switch_tap'), str('tricks.wall_tricks'), 'Advanced', 550),
  trick(str('tricks.knife_edge'), 'Gaps', 'Beginner', 150),
  trick(str('tricks.reverse_knife_edge'), 'Gaps', 'Intermediate', 300),
  trick(str('tricks.ninja_star'), 'Gaps', 'Advanced', 450),
  trick('Facepunch', str('tricks.other_tricks'), 'Beginner', 100),
  trick(str('tricks.slide_disarm'), str('tricks.other_tricks'), 'Novice', 200),
  trick('Perch', str('tricks.other_tricks'), 'Novice', 200),
  trick(str('tricks.eject_roll'), str('tricks.other_tricks'), 'Novice', 200),
  trick('Blindflip', str('tricks.other_tricks'), 'Intermediate', 300),
  trick(str('tricks.true_barani'), str('tricks.other_tricks'), 'Intermediate', 375),
  trick(str('tricks.stellar_eject_roll'), str('tricks.other_tricks'), 'Advanced', 450),
];

/* "Custom Trick Building Blocks", 28 rows. */
export const BUILDING_BLOCKS = [
  block(str('tricks.1_4_flip'), 25),
  block(str('tricks.1_2_flip'), 50),
  block(str('tricks.3_4_flip'), 75),
  block(str('tricks.1_flip'), 100),
  block(str('tricks.1_4_roll'), 25),
  block(str('tricks.1_2_roll'), 50),
  block(str('tricks.3_4_roll'), 75),
  block(str('tricks.1_roll'), 100),
  block(str('tricks.1_4_yaw_spin'), 25),
  block(str('tricks.1_2_yaw_spin'), 50),
  block(str('tricks.3_4_yaw_spin'), 75),
  block(str('tricks.1_yaw_spin'), 100),
  block(str('tricks.1_4_powerloop'), 25),
  block(str('tricks.1_2_power_loop'), 100),
  block(str('tricks.3_4_power_loop'), 150),
  block(str('tricks.1_2_maverick'), 50),
  block('Split-S', 100),
  block(str('tricks.1_4_matty_flip'), 25),
  block(str('tricks.1_2_matty_flip'), 100),
  block(str('tricks.1_2_trippy_spin'), 50),
  block(str('tricks.1_trippy_spin'), 100),
  block('Rewind', 100),
  block('Dive', 100),
  block('Eject', 100),
  block(str('tricks.juicy_flick'), 200),
  block(str('tricks.wall_tap'), 150),
  block(str('tricks.1_4_jump_rope'), 25),
  block(str('tricks.1_2_jump_rope'), 50),
];

/* The execution grades, best first, with what each does to the streak. */
export const EXECUTION = {
  CLEAN: { points: 1, streak: 'grow', label: str('tricks.clean') },
  SLOPPY: { points: 0.65, streak: 'grow', label: str('tricks.sloppy') },
  BUMP: { points: 0.5, streak: 'halve', label: str('tricks.bump') },
  MISSED: { points: 0, streak: 'hold', label: str('tricks.missed') },
  CRASH: { points: 0, streak: 'kill', label: str('tricks.crash') },
};

/* Penalty for the nth repeat of a trick; the last value holds past the end. */
export const REPEAT_TRICK = [1, 0.75, 0.5, 0];

/* Each further back to back repeat multiplies the trick by this. */
export const BACK_TO_BACK_HALVING = 0.5;

/* Penalty for the nth trick in a row on one obstacle; the last value holds. */
export const REPEAT_OBSTACLE = [1, 1, 1, 1, 0.66, 0.33, 0];

/* [obstacle switches needed, end of run multiplier]. */
export const OBSTACLE_BONUS = [
  [0, 1],
  [3, 1.05],
  [6, 1.1],
  [9, 1.2],
  [12, 1.35],
  [15, 1.5],
  [18, 1.7],
  [21, 2],
];
