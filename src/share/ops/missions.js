/*
 * missions.js: every ops mission the room can run, by id, and the world
 * (canopy and routes, docs/campaign/interior/CONTRACT-P0.md section 2)
 * each map gives the room. A campaign adds its missions here as data;
 * nothing else in src/share/ops/ names one.
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

export const MISSIONS = Object.freeze({});

/* Each map's { canopyBlocks, poseOnRoute }. */
const WORLDS = Object.freeze({});

export function worldFor(map) {
  const w = WORLDS[map];
  if (!w) {
    throw new Error(`ops: no world for map ${map}`);
  }
  return w;
}
