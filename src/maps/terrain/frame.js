/*
 * frame.js: the terrain engine's tile format, in one place.
 *
 * The tile pyramid and its encoding, which every map on the engine
 * shares, and the frame value a map passes for its own square. Plain data
 * and a few pure functions, no three.js, so the Node checks and the
 * engine in the browser read the same copy.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/* A tile is this many cells on a side and one more sample, sharing its
 * edge samples with its neighbours. */
export const TILE_CELLS = 256;
export const TILE_SAMPLES = TILE_CELLS + 1;
export const TILE_BYTES = TILE_SAMPLES * TILE_SAMPLES * 2;

/* Level -1 is the ten metre hero level, 0 up to the frame's coarsest the
 * pyramid. */
export const HERO = -1;

/* Metres per cell at a level. */
export function cellOf(level) {
  return level === HERO ? 10 : 30 * 2 ** level;
}

/* Metres per tile side at a level. */
export function tileSizeOf(level) {
  return TILE_CELLS * cellOf(level);
}

/* The path of a tile under the data's base URL. */
export function tilePath(level, i, j) {
  return level === HERO ? `hero/${i}_${j}.bin` : `${level}/${i}_${j}.bin`;
}

/*
 * THE FRAME AS A VALUE, for the engine (engine.js) and the apron
 * (apron.js), which every map passes for its own square. The level
 * scheme, the tile paths and the encoding are fixed; what a map chooses
 * is how far its square reaches (world x and z run over [-half, half]),
 * its coarsest level, and the country the apron invents past the edge
 * (base and amp metres of world y, depth metres past the edge).
 */
export function makeFrame({ half, coarsest, apron }) {
  return {
    half, extent: 2 * half, coarsest, apron,
  };
}

/* The encoding: decimetres from a kilometre below world y 0. */
export function decode(v) {
  return v * 0.1 - 1000;
}

