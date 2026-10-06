/*
 * frame.js: the single place a position or rotation crosses between the
 * physics frame and the Three.js frame (CLAUDE.md). Converting anywhere
 * else is how a sign error in yaw gets in.
 *
 * The plant (sim_abi.h) is right handed with z up, x forward and y to the
 * left. Three.js is right handed with y up and -z into the screen. The
 * change of basis is a proper rotation,
 *
 *   x_three = -y_sim    the quad's right is the screen's right
 *   y_three =  z_sim    up is up
 *   z_three = -x_sim    forward is into the screen
 *
 * and because it is a rotation, a quaternion's vector part permutes the
 * same way while w stays.
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

/*
 * The world's size relative to the aircraft: world metres are sim metres
 * divided by this. It is 1, so a metre in the physics is a metre in the
 * world, and it must stay 1 unless that property is given up on purpose.
 *
 * It was once 1.25, to answer "the gates and the town are too small next to
 * the drone". That cannot work: the scale divides the craft's displacement
 * and touches nothing in the world, and a gate's height on screen,
 * viewportHeight * clearH / (2 * depth * tan(fov / 2)), does not contain it.
 * All 1.25 did was make every course a quarter longer to fly (a 542 m lap
 * flown as 678 m), which on a leaderboard adds a quarter to every time, and
 * the next report was "the gates feel small and the field is large".
 * Apparent size is the camera's, and src/render/lens.js holds it.
 *
 * The scale is kept as a seam because, if a ratio were ever wanted, this is
 * the one conversion it belongs in. What the shell measures in world metres
 * (terrain, colliders, the surface bias, gate apertures) never passes
 * through it; facts about the airframe (its 0.110 m arm, its 2.0 m/s
 * landing limit) stay in sim metres. tests/thresholds.json repeats the
 * value so a change has to be made twice, deliberately.
 */
export const WORLD_SCALE = 1;

/* A length belonging to the aircraft (its model, collision ellipsoid,
 * camera mount, rest height) in world metres. */
export function simLenToWorld(metres) {
  return metres / WORLD_SCALE;
}

/* A world length back in sim metres. */
function worldLenToSim(metres) {
  return metres * WORLD_SCALE;
}

/*
 * The craft's sim position (z up) into a Three.js vector-like `out`, in
 * world metres. It is the displacement about the sim origin only: the
 * shell adds the spawn's world position afterwards, since that is already
 * a world length and must not be scaled twice.
 */
export function simPosToThree(x, y, z, out) {
  out.set(simLenToWorld(-y), simLenToWorld(z), simLenToWorld(-x));
  return out;
}

/* A point on the aircraft in the plant's body frame (x forward, y left,
 * z up, metres about the CG) as [x, y, z] in a model's build frame (x
 * right, y up, z aft): the same permutation, unscaled, since a builder
 * draws at true size and scales the whole model once. For parts lists
 * written in the plant's frame, such as docs/COMBAT-DRONES.md's. */
export function bodyPosToModel(x, y, z) {
  return [-y, z, -x];
}

/* The plant's body to world quaternion (w, x, y, z) into a Three.js
 * Quaternion. */
export function simQuatToThree(w, x, y, z, out) {
  out.set(-y, z, -x, w);
  return out;
}

/*
 * A Three.js world point, already free of the spawn's offset and yaw (the
 * shell owns those), back into sim metres. A bounce writes the plant's
 * position, so it returns through this file as it left.
 */
export function threePosToSim(x, y, z, out) {
  out.x = worldLenToSim(-z);
  out.y = worldLenToSim(-x);
  out.z = worldLenToSim(y);
  return out;
}

/* A direction back into the plant's frame. The scale is the same on every
 * axis, so a direction needs none and a unit vector stays one. */
export function threeDirToSim(x, y, z, out) {
  out.x = -z;
  out.y = -x;
  out.z = y;
  return out;
}

/*
 * A map track's document frame (src/builder/, schemaVersion 4 in
 * src/trackbuilder/schema.md), the second frame converted here, also right
 * handed, z up and SI. It stores absolute positions on a field document's
 * axes, centred on the world with heights from the world's zero rather
 * than from the ground:
 *
 *   x_three =  x_doc    across the world
 *   y_three =  z_doc    up
 *   z_three = -y_doc    the document's +y is into the screen
 *
 * Again a proper rotation: orientations permute their vector part and keep
 * w.
 */
export function docPosToThree(x, y, z, out) {
  out.set(x, z, -y);
  return out;
}

export function threePosToDoc(x, y, z, out) {
  out.x = x;
  out.y = -z;
  out.z = y;
  return out;
}

/* A document orientation { w, x, y, z } into a Three.js Quaternion. */
export function docQuatToThree(w, x, y, z, out) {
  out.set(x, z, -y, w);
  return out;
}

/* Three.js quaternion components back into a document's { w, x, y, z }. */
export function threeQuatToDoc(x, y, z, w, out) {
  out.w = w;
  out.x = x;
  out.y = -z;
  out.z = y;
  return out;
}
