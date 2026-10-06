/*
 * session-textures.js: textures that outlive every map, which a map's
 * dispose (disposeSceneGraph in shell.js) must leave alone.
 *
 * Only the cel ramp, today: one texture in celmat.js that every cel
 * material points at, including the session's own airframe, which is
 * still flying when the map it sat in is freed. A file of its own so each
 * map can import it without importing another map.
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

import { celRampTexture } from './celmat.js';

const sessionLived = [celRampTexture()];

export const SESSION_TEXTURES = new Set(sessionLived);
