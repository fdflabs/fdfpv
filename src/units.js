/*
 * units.js: imperial lengths the race gates are specified in, as metres.
 *
 * A leaf with no imports, shared by src/game/track.js and
 * src/trackbuilder/elements.js. Those two must not import each other (the
 * builder writes track documents, the game reads them, and the dependency
 * runs one way only, see trackdoc.js), yet both need the same foot and the
 * same gate tube. One small module both can reach keeps a single copy of
 * each figure. src/maps/build-cost.js is split out for the same reason.
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

/* The international foot is defined as exactly 0.3048 m. */
export const FT = 0.3048;

/* Kept as a twelfth of the foot rather than the literal 0.0254: the two
 * differ in the last bit (FT / 12 is 0.025400000000000002), and track
 * geometry built on this value is pinned bit for bit by track:golden. */
export const IN = FT / 12;

/*
 * Outside diameter of the tube a gate frame is drawn with. MultiGP does not
 * publish one; their gates are schedule 40 PVC, and 1 inch nominal schedule
 * 40 pipe measures 1.315 in across. That is an assumption, not a citation,
 * and it only affects how thick the frame looks, never the opening a quad
 * flies through.
 */
export const FRAME_TUBE_OD = 1.315 * IN;
