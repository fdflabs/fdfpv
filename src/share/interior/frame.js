/*
 * frame.js: the Interior's world frame, shared by the room and every
 * screen (docs/campaign/interior/WORLD.md).
 *
 * WORLD METRES, Y UP: x east, z south, y height above the bare earth
 * model's datum (EGM2008), the origin the middle of the map. This is the
 * frame every map and the room already use (src/share/war/stages.js reads
 * a pilot's pose as [x, y, z] in it), not the physics' z up body frame,
 * which never leaves src/render/frame.js.
 *
 * Two squares:
 *
 *   HALF        the data's square, [-HALF, HALF] in x and z: the ground
 *               and the land cover reach this far (23 km a side), so the
 *               edge of the played square is never the edge of the land.
 *   PLAY_HALF   the played square, 16 km a side, MISSIONS.md 1.9's map:
 *               its design grid runs 0 to 16 km east and north from the
 *               played square's south west corner.
 *
 * The design grid is for authoring only (places.js writes positions in
 * it because MISSIONS.md does): it is never shown, and it is not a real
 * coordinate of anything.
 *
 * Arithmetic only (+ - * /): the same answer to the bit on every engine.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

/* The data's square and the played one, metres. */
export const HALF = 11520;
export const PLAY_HALF = 8000;

/* The ground's grid (height.bin): samples H_CELL apart, H_N a side, the
 * first at (-HALF, -HALF). The terrain engine's level 0, 257 samples a
 * tile, so the square is three tiles a side. */
export const H_CELL = 30;
export const H_N = (2 * HALF) / H_CELL + 1;

/* The land cover's grid (land.bin): cells L_CELL square, L_N a side, the
 * first covering [-HALF, -HALF + L_CELL). */
export const L_CELL = 10;
export const L_N = (2 * HALF) / L_CELL;

/* A design grid position (km east, km north of the played square's south
 * west corner) in world metres, [x, z]. */
export function gridToWorld(eastKm, northKm) {
  return [eastKm * 1000 - PLAY_HALF, PLAY_HALF - northKm * 1000];
}

/* World [x, z] as design grid km [east, north]. */
export function worldToGrid(x, z) {
  return [(x + PLAY_HALF) / 1000, (PLAY_HALF - z) / 1000];
}

/* Inside the played square. */
export function inPlay(x, z) {
  return x >= -PLAY_HALF && x <= PLAY_HALF && z >= -PLAY_HALF && z <= PLAY_HALF;
}
