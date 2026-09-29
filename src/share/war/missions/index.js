/*
 * index.js: every war mission, by id (docs/WARFARE-PLAN.md section 4.2).
 * The one table the room (edge/rooms/war.js) and the client
 * (src/share/roomwar.js) both read, so a mission the room can start is
 * always one every screen can fly. A new mission is a file beside this one
 * and a line here.
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

import itaipu1 from './itaipu-1.js';

export const MISSIONS = Object.freeze({ [itaipu1.id]: itaipu1 });
