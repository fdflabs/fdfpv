/*
 * chasearm.js: the chase camera's arm against the world's solids.
 *
 * A camera behind the craft sat wherever the craft's travel put it,
 * clamped only above the ground and the roofs (src/main.js chaseCamera),
 * so flying along a wall, past the dam's face or out from under a bridge
 * put it inside the wall and the picture was the wall's inside. pullIn
 * walks the line from the craft to the camera through the map's colliders
 * (src/game/collide.js gapAt, the solids the plant meets) and stops the
 * camera CAMERA_CLEAR_M short of the first one: the arm folds in at once
 * and the camera's own smoothing lets it out again.
 *
 * The walk is sphere tracing: gapAt says nothing is nearer than g, so
 * the camera can move g less its own clearance with nothing crossed.
 * A craft nearer a solid than CAMERA_CLEAR_M (parked on a dam's deck,
 * 0.2 m over it, or scraping a wall) lends the camera its own gap as the
 * clearance: at CAMERA_CLEAR_M the deck under a parked plane stopped the
 * walk where it began and put the camera inside the plane.
 *
 * Read only: gapAt runs outside the sim step and writes nothing a sweep
 * reads, so no recorded flight changes.
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

/* m: what the camera keeps clear. The near plane is 0.2 m (src/render/
 * shell.js), and at 70 degrees vertical on a 16 by 9 picture its corners
 * stand 0.35 m from the eye; under that a wall cuts into the corners. */
export const CAMERA_CLEAR_M = 0.4;
/* m: the least step, so a camera grazing a solid still gets along. */
const MIN_STEP_M = 0.05;
const MAX_STEPS = 64;

/*
 * Moves `cam` ({ x, y, z }, changed in place) toward `anchor` until the
 * line from the anchor to it is CAMERA_CLEAR_M from every solid in
 * `colliders`, or as far as the anchor itself is when that is less.
 * Returns the share of the arm kept, 1 when nothing was in the way.
 */
export function pullIn(colliders, anchor, cam) {
  const dx = cam.x - anchor.x;
  const dy = cam.y - anchor.y;
  const dz = cam.z - anchor.z;
  const len = Math.hypot(dx, dy, dz);
  if (!(len > 0)) {
    return 1;
  }
  const clear = Math.min(CAMERA_CLEAR_M, colliders.gapAt(anchor.x, anchor.y, anchor.z, CAMERA_CLEAR_M));
  let s = 0;
  let safe = 0;
  for (let k = 0; k < MAX_STEPS; k += 1) {
    const f = s / len;
    const g = colliders.gapAt(anchor.x + dx * f, anchor.y + dy * f, anchor.z + dz * f, len - s + clear);
    if (g < clear) {
      break;
    }
    safe = s;
    if (!(g < Infinity) || s >= len) {
      return 1;
    }
    s = Math.min(len, s + Math.max(MIN_STEP_M, g - clear));
  }
  const kept = safe / len;
  cam.x = anchor.x + dx * kept;
  cam.y = anchor.y + dy * kept;
  cam.z = anchor.z + dz * kept;
  return kept;
}
