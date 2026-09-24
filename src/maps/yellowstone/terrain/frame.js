/*
 * frame.js: the Yellowstone contract's numbers, in one place.
 *
 * Everything here is restated from docs/YELLOWSTONE-PLAN.md and nothing
 * else: the extent, the tile pyramid and its encoding. Plain data and a
 * few pure functions, no three.js, so the synthetic tile writer in Node
 * and the engine in the browser read the same copy.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/* World x and z both run over [-HALF, HALF]. */
export const HALF = 50000;
export const EXTENT = 2 * HALF;

/* World y is metres above sea level minus this. */
export const Y0 = 2200;

/* A tile is this many cells on a side and one more sample, sharing its
 * edge samples with its neighbours. */
export const TILE_CELLS = 256;
export const TILE_SAMPLES = TILE_CELLS + 1;
export const TILE_BYTES = TILE_SAMPLES * TILE_SAMPLES * 2;

/* Level -1 is the ten metre hero level, 0 to 5 the pyramid. */
export const HERO = -1;
export const COARSEST = 5;
export const LEVELS = [-1, 0, 1, 2, 3, 4, 5];

/* Metres per cell at a level. */
export function cellOf(level) {
  return level === HERO ? 10 : 30 * 2 ** level;
}

/* Metres per tile side at a level. */
export function tileSizeOf(level) {
  return TILE_CELLS * cellOf(level);
}

/* Tiles per axis that touch the extent at a level. The last one runs past
 * the far edge: 100 km is not a whole number of tiles at any level. */
export function tilesPerAxis(level) {
  return Math.ceil(EXTENT / tileSizeOf(level));
}

/* The path of a tile under the data's base URL. */
export function tilePath(level, i, j) {
  return level === HERO ? `hero/${i}_${j}.bin` : `${level}/${i}_${j}.bin`;
}

/* The encoding: decimetres from a kilometre below Y0. */
export function decode(v) {
  return v * 0.1 - 1000;
}

export function encode(y) {
  return Math.max(0, Math.min(65535, Math.round((y + 1000) * 10)));
}

/* Landmarks from the contract's table, world metres. */
export const LANDMARKS = {
  oldFaithful: { x: -26325, z: 17964 },
  grandPrismatic: { x: -27143, z: 10790 },
  mammoth: { x: -17033, z: -38420 },
  lowerFalls: { x: -83, z: -10748 },
  lakeCentre: { x: 11718, z: 18939 },
  westYellowstone: { x: -49335, z: -7343 },
};
