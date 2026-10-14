/*
 * tricks-sheet.js: the freestyle scoring workbook's tables.
 *
 * GENERATED FILE. Do not edit by hand: run `node scripts/tricks-gen.js`,
 * which reads tests/fixtures/freestyle-scoring/twp-calculator.json and says
 * how each table is taken from it. src/game/tricks.js is the module to
 * import; it re-exports these.
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

const trick = (name, category, difficulty, points) => ({ name, category, difficulty, points });
const block = (name, points) => ({ name, points });

/* The Whoop Pilots freestyle scoring calculator, "Trick List - Outdoor", 90 rows. */
export const TRICKS = [
  trick('Flip', str('tricks.open_air_tricks'), 'Beginner', 50),
  trick('Roll', str('tricks.open_air_tricks'), 'Beginner', 50),
  trick('Yaw Spin', str('tricks.open_air_tricks'), 'Beginner', 50),
  trick('Segmented Flips/Rolls', str('tricks.open_air_tricks'), 'Beginner', 75),
  trick('Invert Rewind', str('tricks.open_air_tricks'), 'Beginner', 75),
  trick('Vanny Roll', str('tricks.open_air_tricks'), 'Beginner', 125),
  trick('Double Flip', str('tricks.open_air_tricks'), 'Beginner', 150),
  trick('Double Roll', str('tricks.open_air_tricks'), 'Beginner', 150),
  trick('Juicy Flick', str('tricks.open_air_tricks'), 'Novice', 200),
  trick('Snapback', str('tricks.open_air_tricks'), 'Novice', 200),
  trick('Rubik\'s Cube', str('tricks.open_air_tricks'), 'Intermediate', 325),
  trick('Cubik\'s Rube', str('tricks.open_air_tricks'), 'Intermediate', 325),
  trick('Inverted Yaw Spin', str('tricks.open_air_tricks'), 'Advanced', 400),
  trick('Inverted Yaw Tracking', str('tricks.open_air_tricks'), 'Advanced', 425),
  trick('Powerloop', 'Powerloops', 'Novice', 200),
  trick('Immelmann Turn', 'Powerloops', 'Novice', 250),
  trick('Power Split', 'Powerloops', 'Intermediate', 300),
  trick('Power Flip', 'Powerloops', 'Intermediate', 350),
  trick('Reversed Power Flip', 'Powerloops', 'Intermediate', 325),
  trick('Power Swap', 'Powerloops', 'Intermediate', 350),
  trick('Power Switch', 'Powerloops', 'Advanced', 425),
  trick('Power Roll', 'Powerloops', 'Advanced', 450),
  trick('Inverted 360 Powerloop', 'Powerloops', 'Master', 650),
  trick('Barani', 'Powerloops', 'Master', 700),
  trick('Beginner Switch', 'Powerloops', 'Beginner', 150),
  trick('Immelloop', 'Powerloops', 'Intermediate', 300),
  trick('Immelmatt', 'Powerloops', 'Advanced', 450),
  trick('Rollani', 'Powerloops', 'Master', 800),
  trick('Flipani', 'Powerloops', 'Master', 850),
  trick('Maverick Loop', str('tricks.maverick_loops'), 'Beginner', 100),
  trick('Mavvy Roll', str('tricks.maverick_loops'), 'Novice', 250),
  trick('Half Mavvy', str('tricks.maverick_loops'), 'Advanced', 450),
  trick('Mavik\'s Loop', str('tricks.maverick_loops'), 'Advanced', 475),
  trick('Mavani', str('tricks.maverick_loops'), 'Advanced', 500),
  trick('Donkey Loop', str('tricks.maverick_loops'), 'Master', 600),
  trick('Mavvelmann', str('tricks.maverick_loops'), 'Novice', 250),
  trick('Beginner Matty', str('tricks.matty_flips'), 'Beginner', 100),
  trick('Matty Flip', str('tricks.matty_flips'), 'Novice', 200),
  trick('Matty Twister', str('tricks.matty_flips'), 'Intermediate', 350),
  trick('Half Matty', str('tricks.matty_flips'), 'Intermediate', 350),
  trick('540 Half Matty', str('tricks.matty_flips'), 'Advanced', 425),
  trick('Matty 360', str('tricks.matty_flips'), 'Advanced', 425),
  trick('Forani', str('tricks.matty_flips'), 'Advanced', 475),
  trick('Anti Matty', str('tricks.matty_flips'), 'Novice', 250),
  trick('Power Matty', str('tricks.matty_flips'), 'Intermediate', 300),
  trick('Matty Roll', str('tricks.matty_flips'), 'Advanced', 425),
  trick('Split-S', 'SplitS', 'Beginner', 100),
  trick('540 Split S', 'SplitS', 'Novice', 250),
  trick('Split-Back', 'SplitS', 'Intermediate', 300),
  trick('Split Yaw', 'SplitS', 'Intermediate', 300),
  trick('Split Stall Matty Rewind', 'SplitS', 'Intermediate', 350),
  trick('Orbit x2', str('tricks.pole_dancing'), 'Beginner', 75),
  trick('Cradle', str('tricks.pole_dancing'), 'Beginner', 150),
  trick('Side-Lock Rewind', str('tricks.pole_dancing'), 'Beginner', 150),
  trick('Whiplash', str('tricks.pole_dancing'), 'Beginner', 175),
  trick('Pole Dance', str('tricks.pole_dancing'), 'Advanced', 450),
  trick('Trippy Spin x2', str('tricks.pole_dancing'), 'Advanced', 500),
  trick('Trippy Switch', str('tricks.pole_dancing'), 'Advanced', 550),
  trick('Double Rolling Trippy Spin', str('tricks.pole_dancing'), 'Master', 750),
  trick('Jump Rope', str('tricks.jump_roping'), 'Beginner', 100),
  trick('Cinnamon Roll', str('tricks.jump_roping'), 'Beginner', 175),
  trick('Burrito Roll', str('tricks.jump_roping'), 'Novice', 250),
  trick('Side Loop', str('tricks.jump_roping'), 'Novice', 200),
  trick('Double Dutch', str('tricks.jump_roping'), 'Intermediate', 300),
  trick('Flip Stall Rewind', 'Rewinds', 'Novice', 275),
  trick('360 Stall Rewind', 'Rewinds', 'Novice', 275),
  trick('Matty Stall Rewind', 'Rewinds', 'Intermediate', 350),
  trick('Half Matty Stall Rewind', 'Rewinds', 'Intermediate', 375),
  trick('540 Half Matty Stall Rewind', 'Rewinds', 'Advanced', 450),
  trick('Stall Rewind', 'Rewinds', 'Beginner', 75),
  trick('Dive', str('tricks.wall_tricks'), 'Beginner', 100),
  trick('Wall Ride', str('tricks.wall_tricks'), 'Beginner', 150),
  trick('Wall Tap', str('tricks.wall_tricks'), 'Beginner', 150),
  trick('Roll Tap', str('tricks.wall_tricks'), 'Novice', 250),
  trick('Loop Tap', str('tricks.wall_tricks'), 'Intermediate', 300),
  trick('Ceiling Tap', str('tricks.wall_tricks'), 'Intermediate', 300),
  trick('Reverse Wall Ride', str('tricks.wall_tricks'), 'Intermediate', 300),
  trick('Downtown Tap', str('tricks.wall_tricks'), 'Intermediate', 350),
  trick('Maverick Tap Rewind', str('tricks.wall_tricks'), 'Advanced', 500),
  trick('Power Switch Tap', str('tricks.wall_tricks'), 'Advanced', 550),
  trick('Knife Edge', 'Gaps', 'Beginner', 150),
  trick('Reverse Knife Edge', 'Gaps', 'Intermediate', 300),
  trick('Ninja Star', 'Gaps', 'Advanced', 450),
  trick('Facepunch', str('tricks.other_tricks'), 'Beginner', 100),
  trick('Slide Disarm', str('tricks.other_tricks'), 'Novice', 200),
  trick('Perch', str('tricks.other_tricks'), 'Novice', 200),
  trick('Eject Roll', str('tricks.other_tricks'), 'Novice', 200),
  trick('Blindflip', str('tricks.other_tricks'), 'Intermediate', 300),
  trick('True Barani', str('tricks.other_tricks'), 'Intermediate', 375),
  trick('Stellar Eject Roll', str('tricks.other_tricks'), 'Advanced', 450),
];

/* "Custom Trick Building Blocks", 28 rows. */
export const BUILDING_BLOCKS = [
  block('1/4 Flip', 25),
  block('1/2 Flip', 50),
  block('3/4 Flip', 75),
  block('1 Flip', 100),
  block('1/4 Roll', 25),
  block('1/2 Roll', 50),
  block('3/4 Roll', 75),
  block('1 Roll', 100),
  block('1/4 Yaw Spin', 25),
  block('1/2 Yaw Spin', 50),
  block('3/4 Yaw Spin', 75),
  block('1 Yaw Spin', 100),
  block('1/4 powerloop', 25),
  block('1/2 Power Loop', 100),
  block('3/4 Power Loop', 150),
  block('1/2 Maverick', 50),
  block('Split-S', 100),
  block('1/4 Matty Flip', 25),
  block('1/2 Matty Flip', 100),
  block('1/2 Trippy Spin', 50),
  block('1 Trippy Spin', 100),
  block('Rewind', 100),
  block('Dive', 100),
  block('Eject', 100),
  block('Juicy Flick', 200),
  block('Wall Tap', 150),
  block('1/4 Jump Rope', 25),
  block('1/2 Jump Rope', 50),
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
