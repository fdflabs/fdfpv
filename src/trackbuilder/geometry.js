/*
 * geometry.js: vectors, the aperture frame, and the marker offset.
 *
 * COORDINATE CONVENTION, and it is the simulator's, deliberately, because the
 * track document is going to be handed to the simulator later and a document
 * in a different frame would need a conversion nobody would remember to do.
 *
 *   Right handed, Z up, metres.
 *   +X runs across the field's WIDTH.
 *   +Y runs across the field's DEPTH.
 *   +Z is up.
 *   The field's near left corner is the origin, so every point on the field
 *   has x in [0, width] and y in [0, depth]. Nothing is negative by default,
 *   which makes a track document readable by eye.
 *
 *   yaw is a rotation about +Z measured from +X, counter clockwise seen from
 *   above, in radians.
 *   pitch is the angle the aperture normal is RAISED ABOVE THE HORIZONTAL,
 *   in radians. Zero is a vertical gate whose normal lies flat. +pi/2 is a
 *   horizontal aperture whose normal points at the sky, which is a dive gate.
 *   -pi/2 points at the ground.
 *
 * Degrees appear in the inspector's display strings and nowhere else.
 *
 * The Y up conversion Three.js needs happens in exactly one place, view3d.js,
 * where the scene root is rotated once. Not here.
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

export function v(x = 0, y = 0, z = 0) {
  return { x, y, z };
}

export function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(a, s) {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function length(a) {
  return Math.sqrt(dot(a, a));
}

export function dist(a, b) {
  return length(sub(a, b));
}

/* Normalise, returning a stated fallback rather than NaN for a zero vector,
 * because a zero direction turns up whenever two knots land on each other and
 * a NaN would poison the whole spline silently. */
export function normalize(a, fallback = { x: 1, y: 0, z: 0 }) {
  const n = length(a);
  if (!(n > 1e-9)) {
    return { ...fallback };
  }
  return { x: a.x / n, y: a.y / n, z: a.z / n };
}

export function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

export function clamp(x, lo, hi) {
  return x < lo ? lo : (x > hi ? hi : x);
}


/*
 * Wrap to (-pi, pi], with a microradian of slack at both ends.
 *
 * THE SLACK IS LOAD BEARING. The document rounds every number to six decimal
 * places, and pi rounded to six places is 3.141593, which is 3.5e-7 LARGER
 * than pi. A wrap with no tolerance sends that to -3.141593, which rounds to
 * itself, which is 3.5e-7 smaller than -pi, which wraps back to +3.141593,
 * and a gate turned to face due west flips sign on every save. The tolerance
 * is one part in a million of a radian, which is a micrometre of arc at a
 * metre, so nothing real is affected and the round trip is exact.
 */
const WRAP_SLACK = 1e-6;

export function wrapAngle(a) {
  const tau = Math.PI * 2;
  let x = a;
  while (x <= -Math.PI - WRAP_SLACK) {
    x += tau;
  }
  while (x > Math.PI + WRAP_SLACK) {
    x -= tau;
  }
  return x;
}

/*
 * The aperture frame.
 *
 * normal   the direction the opening faces, before the entry sign is applied
 * widthAxis  in plane and horizontal, the opening's width runs along it
 * heightAxis in plane, normal cross widthAxis, the opening's height runs
 *            along it. For a vertical gate this is straight up.
 *
 * The three are orthonormal for every yaw and every pitch, including the
 * degenerate pitch of exactly +pi/2 where the height axis swings to lie
 * along the ground.
 */
export function apertureFrame(yaw, pitch) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const normal = { x: cp * cy, y: cp * sy, z: sp };
  const widthAxis = { x: -sy, y: cy, z: 0 };
  const heightAxis = cross(normal, widthAxis);
  return { normal, widthAxis, heightAxis };
}

/*
 * Where the two VERTICAL posts stand under a tilted frame, in the element's
 * own document frame, origin on the plan, z up.
 *
 * A standing gate has two uprights at the sides of the opening. A dive gate
 * used to grow a single mast on the centreline, offset along the heading,
 * the moment the aperture left vertical. At a custom tilt that mast sits in
 * the hole: the frame has rotated and the post has not. The feet here are
 * the lower outer corners of the frame, so the posts stay at the sides for
 * every pitch, including a flat dive.
 */


/* Ground direction of an element's yaw: the way it "faces" on the plan. */
export function yawVector(yaw) {
  return { x: Math.cos(yaw), y: Math.sin(yaw), z: 0 };
}

/* The horizontal left hand perpendicular of a direction of travel, which is
 * what a pass side is measured against. z cross d gives the left of d. */
export function leftOf(dir) {
  const flat = { x: dir.x, y: dir.y, z: 0 };
  const n = normalize(flat, { x: 1, y: 0, z: 0 });
  return { x: -n.y, y: n.x, z: 0 };
}

