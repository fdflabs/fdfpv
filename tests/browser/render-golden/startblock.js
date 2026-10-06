/*
 * render-golden/startblock.js: src/art/startblock.js's launch stand sizes
 * over pad sizes from a whoop's to past the default, including missing and
 * nonsense ones, and the lone pilot's lane over grids of every shape.
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

import * as block from '../../../src/art/startblock.js';

const PADS = [0.1, 0.09, 0.05, 0.6, 0.75, 1.2, 0, -1, undefined, null, '0.3', 'x', NaN, Infinity];

export function cases() {
  return {
    exports: () => Object.keys(block).sort(),
    dims: () => PADS.map((p) => [String(p), block.startBlockDims(p)]),
    lanes: () => {
      const rows = [];
      for (const pads of [undefined, 0, 1, 2, 3, 4, 5, 2.4, 2.6, -3]) {
        for (const spacing of [undefined, 1.5, 0.8, 0, -2, '2']) {
          rows.push([String(pads), String(spacing), block.startBlockLaneOffset({ pads, spacing })]);
        }
      }
      return rows;
    },
  };
}
