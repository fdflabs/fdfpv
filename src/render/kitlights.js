/*
 * kitlights.js: the arm LEDs' patterns (docs/KITS.md section 4), as a
 * pure function of the flight clock, so a replay and a peer flash in
 * step, and Node can check it without a renderer.
 *
 * Cost: the LEDs are unlit (MeshBasicMaterial) meshes, one material per
 * arm, changed in place each frame; no real light, no allocation per
 * frame. They read at night and at dusk because they ignore the scene's
 * light, and the cel worlds' bloom (src/render/post.js) picks them up.
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

/* The order a chase runs round the arms: the builder's motor order
 * (combatcraft.js MOTOR_SIGNS), front left first. */
const CHASE_STEP_MS = 110;
const STROBE_MS = 1000;
const FLASH_MS = 60;

/*
 * How bright LED m is, 0 to 1, and how far its colour is pulled to red
 * (battery), at flight time tMs with throttle and battery each 0 to 1.
 * Battery 1 is a full pack. Writes into `out` ({ level, red }) and
 * returns it, so a frame allocates nothing.
 */
export function ledLevel(pattern, m, tMs, throttle, battery, out) {
  out.red = 0;
  switch (pattern) {
    case 'chase':
      out.level = Math.floor(tMs / CHASE_STEP_MS) % 4 === m ? 1 : 0.12;
      break;
    case 'strobe': {
      const p = tMs % STROBE_MS;
      out.level = p < FLASH_MS || (p >= 2 * FLASH_MS && p < 3 * FLASH_MS) ? 1 : 0.05;
      break;
    }
    case 'throttle':
      out.level = 0.15 + 0.85 * Math.min(1, Math.max(0, throttle));
      break;
    case 'battery':
      out.level = 1;
      out.red = 1 - Math.min(1, Math.max(0, battery));
      break;
    default:
      out.level = 1;
  }
  return out;
}
