/*
 * attract.js: the title's flight over Itaipu (docs/ITAIPU-PLAN.md section
 * 14, package H).
 *
 * The title camera looks along the line it flies (src/render/attract.js),
 * so a loop round the dam at a distance shows the dam only side on, out of
 * a 44 degree lens. This line flies AT the dam instead: in over the
 * reservoir toward the main dam's crest, over it and down the tailrace past
 * the powerhouse, along the canyon, round to face the spillway and up its
 * chute, then back out over the right bank and the reservoir. The legs
 * toward the crest and toward the spillway put the dam across the frame.
 *
 * CLEARANCE. Each key point's height is a floor, not a promise: the line is
 * lifted wherever the highest thing within LOOK metres of a point (the
 * terrain, the water, and every roof record, the dam's crest among them)
 * comes within OVER metres of it. OVER is four times the 30 m section 14
 * asks of the camera, because the height query knows nothing of the solids
 * that are not roofs (the transmission towers and their conductors, the
 * trees), and scripts/itaipu-spawns-check.js measures the camera's
 * clearance to every collider along the whole loop.
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

/* The loop's key points, world metres, in flying order: x, z and the
 * lowest the camera flies there. */
const KEYS = [
  [600, -3300, 380],
  [150, -2300, 330],
  [40, -1750, 300],
  [-60, -1250, 240],
  [-450, -600, 230],
  [-800, -250, 230],
  [-1000, -700, 280],
  [-1000, -1300, 320],
  [-500, -2600, 380],
];
/* Metres between the line's points, the radius searched round each and the
 * air kept over the highest thing in it. */
const STEP = 100;
const LOOK = 120;
const OVER = 120;

/* The ground, water and roofs under a disc of LOOK round (x, z): its
 * centre and 16 points on its rim. */
function topNear(height, x, z) {
  let top = height(x, z);
  for (let k = 0; k < 16; k += 1) {
    const a = (k / 16) * 2 * Math.PI;
    top = Math.max(top, height(x + LOOK * Math.cos(a), z + LOOK * Math.sin(a)));
  }
  return top;
}

/* The title's path, { x, y, z } every STEP metres round the closed loop,
 * over `height(x, z)`, the map's highest surface (roofs included). */
export function attractPath(height) {
  const out = [];
  for (let i = 0; i < KEYS.length; i += 1) {
    const [ax, az, ay] = KEYS[i];
    const [bx, bz, by] = KEYS[(i + 1) % KEYS.length];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / STEP));
    for (let k = 0; k < n; k += 1) {
      const u = k / n;
      const x = ax + (bx - ax) * u;
      const z = az + (bz - az) * u;
      out.push({ x, y: Math.max(ay + (by - ay) * u, topNear(height, x, z) + OVER), z });
    }
  }
  return out;
}
