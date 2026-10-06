/*
 * geometry.js: the small vector kit the track document is computed with.
 *
 * Points and directions are plain { x, y, z } records in the document frame:
 * right handed, z up, metres, the frame the physics uses (schema.md,
 * Conventions). Every function returns a new record and never edits its
 * arguments, because a track document is shared between the builder, the
 * course and the board's lap check, and a helper that wrote into a position
 * would move a gate in all three.
 *
 * THE ARITHMETIC IS A CONTRACT. A flag's scoring square is placed off a knot
 * of the racing line, and the board checks posted laps against those squares
 * with this module, so the same document has to give the same doubles in
 * every build. That is why length is a square root of a sum of squares rather
 * than Math.hypot (they differ in the last bit), and why normalize divides
 * rather than multiplying by a reciprocal. tests/fixtures/trackbuilder holds
 * the outputs this has to reproduce.
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

const TURN = 2 * Math.PI;

/* A direction shorter than this has no direction. Two knots a nanometre
 * apart are the same knot as far as a course is concerned. */
const TINY = 1e-9;

/* Slack on both ends of the angle wrap. Documents round to six decimals, and
 * pi rounded that way is 3.141593, a little MORE than pi: without the slack a
 * gate facing due west would wrap to -3.141593 on read, round, wrap back on
 * the next read, and change sign on every save. */
const WRAP_SLACK = 1e-6;

export function v(x = 0, y = 0, z = 0) {
  return { x, y, z };
}

export function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(a, k) {
  return { x: a.x * k, y: a.y * k, z: a.z * k };
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
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}

export function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/* A unit vector along `a`, or a copy of `fallback` when `a` has no length.
 * Coincident knots are common while an author drags things about, and a NaN
 * here would spread through every sample of the line without a word. */
export function normalize(a, fallback = { x: 1, y: 0, z: 0 }) {
  const n = length(a);
  if (n <= TINY) {
    return { x: fallback.x, y: fallback.y, z: fallback.z };
  }
  return { x: a.x / n, y: a.y / n, z: a.z / n };
}

export function lerp(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

/* Below lo gives lo, above hi gives hi, tested in that order, so a range
 * given backwards answers lo for anything under it. NaN passes through. */
export function clamp(x, lo, hi) {
  if (x < lo) {
    return lo;
  }
  if (x > hi) {
    return hi;
  }
  return x;
}

/* Into (-pi, pi], give or take WRAP_SLACK at each end. Whole turns are taken
 * off one at a time, so it is meant for headings, not for arbitrary numbers:
 * an infinity never comes back. */
export function wrapAngle(a) {
  let out = a;
  while (out > Math.PI + WRAP_SLACK) {
    out -= TURN;
  }
  while (out <= -Math.PI - WRAP_SLACK) {
    out += TURN;
  }
  return out;
}

/*
 * The three axes of an opening tilted by `pitch` and turned to `yaw`
 * (schema.md, How an aperture element becomes openings):
 *
 *   normal      the way the opening faces, before a sequence entry's sign
 *   widthAxis   level and in the opening's plane, along clearW
 *   heightAxis  normal x widthAxis, along clearH; straight up when upright
 *
 * The width axis depends on yaw alone, so the frame stays orthonormal even
 * when the opening lies flat and the normal points at the sky.
 */
export function apertureFrame(yaw, pitch) {
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const level = Math.cos(pitch);
  const normal = { x: level * cosYaw, y: level * sinYaw, z: Math.sin(pitch) };
  const widthAxis = { x: -sinYaw, y: cosYaw, z: 0 };
  return { normal, widthAxis, heightAxis: cross(normal, widthAxis) };
}

/* The level direction a heading points along. */
export function yawVector(yaw) {
  return { x: Math.cos(yaw), y: Math.sin(yaw), z: 0 };
}

/* The unit level direction a quarter turn anticlockwise from `dir`, seen from
 * above: the left hand of a quad flying along it, which is the side a pass
 * side of "left" means. Only the level part of `dir` counts; with none, the
 * heading is taken as +x. */
export function leftOf(dir) {
  const ahead = normalize({ x: dir.x, y: dir.y, z: 0 });
  return { x: -ahead.y, y: ahead.x, z: 0 };
}
