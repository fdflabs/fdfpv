/*
 * sight.js: where a point falls in a pilot's camera picture, from the
 * camera report the room keeps (docs/campaign/interior/CONTRACT-P0.md
 * section 3, `cam`): its direction, a unit vector in the ops frame (z up),
 * the tangent of half the horizontal field of view, and the picture's
 * width over its height. Only products, square roots and divisions, so
 * the answer is the same on every engine (CLAUDE.md: no Math.sin, cos or
 * pow on the room's path).
 *
 * The picture's right is the direction crossed with up (z), its up the
 * right crossed with the direction; a camera looking straight down takes
 * east as its right.
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

/*
 * A point `to` of size `size` metres seen from `from` by camera `cam` ({
 * dir, tanHalf, aspect }): null when it is behind the camera, else
 *   off    0 at the picture's centre, 1 at its nearest edge (the larger of
 *          the horizontal and vertical offsets, each over its half width)
 *   inside off <= 1
 *   size   the point's size over the picture's width at its depth (0.1 is
 *          a tenth of the frame across)
 *   dist   metres
 */
export function sight(from, cam, to, size) {
  const d = cam.dir;
  const v = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const along = v[0] * d[0] + v[1] * d[1] + v[2] * d[2];
  if (!(along > 0)) {
    return null;
  }
  /* right = dir x z, normalised; up = right x dir. */
  let rx = d[1];
  let ry = -d[0];
  let rn = Math.sqrt(rx * rx + ry * ry);
  if (rn < 1e-9) {
    rx = 1;
    ry = 0;
    rn = 1;
  }
  rx /= rn;
  ry /= rn;
  const ux = ry * d[2];
  const uy = -rx * d[2];
  const uz = rx * d[1] - ry * d[0];
  const half = along * cam.tanHalf;
  const h = (v[0] * rx + v[1] * ry) / half;
  const w = (v[0] * ux + v[1] * uy + v[2] * uz) / (half / (cam.aspect || 1));
  const off = Math.max(Math.abs(h), Math.abs(w));
  return {
    off, inside: off <= 1, size: size / (2 * half), dist: Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]),
  };
}

/* Whether a camera report is usable: a finite unit direction, a positive
 * tangent, a positive aspect. The boundary check for a client's `cam`. */
export function validCam(cam) {
  if (!cam || !Array.isArray(cam.dir) || cam.dir.length !== 3 || !cam.dir.every(Number.isFinite)) {
    return false;
  }
  const n = cam.dir[0] ** 2 + cam.dir[1] ** 2 + cam.dir[2] ** 2;
  return Math.abs(n - 1) < 1e-3 && Number.isFinite(cam.tanHalf) && cam.tanHalf > 0 && cam.tanHalf < 10
    && Number.isFinite(cam.aspect) && cam.aspect > 0.1 && cam.aspect < 10;
}
