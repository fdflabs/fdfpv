/*
 * human.js: the person who flies, as numbers. The pilot on foot
 * (src/game/onfoot.js) walks and looks with these, and the pilot's view
 * from the field stands at EYE_HEIGHT. Each measured value names its
 * source; docs/ON-FOOT.md has the references in full. ESTIMATED marks a
 * value chosen for a body that walks, not measured.
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

/* m: the room pilot figure's height (src/share/peers.js buildPilotFigure). */
export const STATURE = 1.75;

/* Eye height over stature, 0.936 (Drillis and Contini 1966, body segment
 * proportions, docs/ON-FOOT.md). 0.936 x 1.75 = 1.638 m. */
export const EYE_HEIGHT = 1.64;

/* m/s: comfortable gait speed of adults 20 to 59, 1.39 to 1.46 m/s, and
 * maximum walking speed of adults in their twenties, about 2.5 m/s
 * (Bohannon 1997, Age and Ageing 26:15-19, docs/ON-FOOT.md). */
export const WALK_SPEED = 1.4;
export const RUN_SPEED = 2.5;

/* s from standing to pace, and from pace to standing. ESTIMATED: about
 * one step. */
export const ACCEL_S = 0.5;

/* m: the body as an upright capsule this wide each way of its centre
 * line, ESTIMATED (a shoulder half width). */
export const BODY_RADIUS = 0.25;

/* m: the highest rise a stride takes without a hand, ESTIMATED (a knee
 * high step). A bigger rise is a wall. */
export const STEP_UP = 0.35;

/* rad: the steepest ground a person walks up, 35 deg, ESTIMATED. */
export const MAX_SLOPE = (35 * Math.PI) / 180;

/* m/s^2. */
export const GRAVITY = 9.81;
