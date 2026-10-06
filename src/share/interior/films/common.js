/*
 * common.js: what The Interior's films share (docs/campaign/interior/
 * INTROS.md, FILMS.md): where the world's camera parks while the BOARD
 * covers the frame, the operations room's set and its camera points, and
 * the frame helpers. Data only.
 *
 * THE FRAME. Scene metres, y up, on the Interior's map (src/maps/
 * interior.js); a place is the design grid's (km east, km north of the
 * played square's south west corner, src/share/interior/frame.js), and
 * every world camera of these films is `agl`, its heights metres over
 * the ground under each point (src/share/war/film.js), because the land
 * is real and not one height.
 *
 * THE ROOM is a set, a closed box built by the player (src/render/
 * filmroom.js) ROOM_AGL metres over Pista Cero, so a handheld shot of
 * monitors and a table stands inside the map and over its ground, sees
 * nothing of the world through walls, and carries no person: faceless by
 * construction (PLAN.md 9 B).
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

import { gridToWorld } from '../frame.js';
import { PLACES, dirOf } from '../places.js';

/* A design grid place h metres over the ground: [x, h, z]. */
export function at(e, n, h = 0) {
  const [x, z] = gridToWorld(e, n);
  return [x, h, z];
}

/* The yaw that turns a body's nose (-z) onto the horizontal (dx, dz). */
export const yawTo = (dx, dz) => Math.atan2(-dx, -dz);

/* Where the world's camera waits while the BOARD covers the frame: over
 * Pista Cero, looking at the sky, so the unseen draw costs least. */
export const PARK = { at: at(3.0, 2.0, 300), look: at(3.0, 2.6, 900) };

/* A BOARD shot's camera. */
export const BOARD_CAMERA = {
  type: 'board', agl: true, at: PARK.at, look: PARK.look,
};

/* The operations room: a set ROOM_AGL metres over Pista Cero, its floor
 * there, its table along x. Every point inside it is ROOM_AT plus a local
 * offset (room). */
export const ROOM_AGL = 1500;
export const ROOM_AT = [PLACES.pistaCero.at[0], ROOM_AGL, PLACES.pistaCero.at[1]];
export const room = (x, y, z) => [ROOM_AT[0] + x, ROOM_AT[1] + y, ROOM_AT[2] + z];
/* The room's camera feed monitor shows `feed`, a still of the survey's
 * infrastructure imagery, panning slowly. */
export const SETS = {
  room: {
    kind: 'ops-room', at: ROOM_AT, agl: true, feed: 'rec:bridge',
  },
};

/* Pista Cero's runway line (places.js PISTA_DIR, the container's and the
 * tent's long axis): the catapult points along it. */
export const PISTA_DIR = dirOf(gridToWorld(2.75, 1.95), gridToWorld(3.25, 2.05));
