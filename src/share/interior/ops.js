/*
 * ops.js: the Interior's world as the room's ops modules call it
 * (docs/campaign/interior/CONTRACT-P0.md section 2, src/share/ops/
 * missions.js worldFor), in THE OPS FRAME: src/render/frame.js's document
 * frame, x east, y north, z up, metres, its origin the map's scene
 * origin, the middle of the played square.
 *
 *   canopyBlocks(from, to)     [x, y, z], [x, y, z] -> true when a crown
 *                              stands between them (canopy.js)
 *   canopyLos(from, to)        'blocked' | 'gap' | 'open' (canopy.js)
 *   poseOnRoute(routeId, ms)   ms since the contact started that route ->
 *                              { x, y, z, heading, action } or null once
 *                              it is over (routes.js); heading radians
 *                              anticlockwise from east, for a screen
 *   groundAt(x, y)             the ground's height, z
 *
 * Everything inside the Interior's modules is in the scene's frame (y up,
 * z south); the turn between the two is frame.js's own, imported, not
 * written here.
 *
 * MISSION DATA'S ORIGIN. MISSIONS.md 1.9's design grid has its south west
 * corner at ORIGIN metres west and south of the scene origin, so a grid
 * point (e, n) km is the ops frame's [e * 1000 - ORIGIN[0], n * 1000 -
 * ORIGIN[1]] (src/share/interior/missions/interior-1.js G).
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

import { docPosToThree, threePosToDoc } from '../../render/frame.js';
import { PLAY_HALF } from './frame.js';
import { makeWorld } from './world.js';
import { landEdit } from './places.js';
import { makeCanopy } from './canopy.js';
import { makeRoutes } from './routes.js';

export const ORIGIN = [PLAY_HALF, PLAY_HALF];

/*
 * The ops world over the ground's bytes ({ height, land }: node.js
 * readWorldBytes in the room, world.js fetchWorldBytes in a browser).
 */
export function makeOpsWorld(bytes) {
  const world = makeWorld({ ...bytes, edits: landEdit });
  const canopy = makeCanopy(world);
  const routes = makeRoutes(world);
  /* frame.js's conversions write into anything with set(x, y, z). */
  const vec = () => ({
    x: 0,
    y: 0,
    z: 0,
    set(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    },
  });
  const a = vec();
  const b = vec();
  const sceneOf = (p, out) => {
    docPosToThree(p[0], p[1], p[2], out);
    return [out.x, out.y, out.z];
  };
  const pose = { x: 0, y: 0, z: 0 };
  return {
    world,
    canopy,
    routes,
    canopyBlocks: (from, to) => canopy.canopyBlocks(sceneOf(from, a), sceneOf(to, b)),
    canopyLos: (from, to) => canopy.canopyLos(sceneOf(from, a), sceneOf(to, b)),
    groundAt: (x, y) => {
      docPosToThree(x, y, 0, a);
      return world.groundAt(a.x, a.z);
    },
    poseOnRoute(routeId, ms) {
      const p = routes.poseOnRoute(routeId, ms);
      if (!p) {
        return null;
      }
      threePosToDoc(p.x, p.y, p.z, pose);
      return {
        x: pose.x, y: pose.y, z: pose.z, heading: p.headingDoc, action: p.action,
      };
    },
  };
}
