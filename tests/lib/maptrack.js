/*
 * maptrack.js: a small track built inside a world, for tests.
 *
 * Three gates hung in a ring in the air, each flown along the ring, built
 * with the in-sim builder's own functions (src/builder/course.js) and handed
 * back as the plain schemaVersion 4 document the builder would publish. No
 * terrain is read, so it is a fixture for the lap check and the board, not
 * for flying: nothing here knows where the ground of the named world is.
 *
 * Used by scripts/lap-selftest.js here and by the board's selftest through
 * its pinned checkout of this repository, so both sides test a map track
 * against the same document.
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

import { addGate, headingOf, newCourse, qAxis } from '../../src/builder/course.js';
import { toPlain } from '../../src/trackbuilder/model.js';

/*
 * `opts.map` is the world ('swiss2'), `opts.centre` the ring's centre in the
 * scene ([x, y, z], y up), `opts.radius` its radius in metres, `opts.gates`
 * how many, `opts.name` the title, and `opts.id` pins the document's id so
 * two calls can build the same course under one id.
 */
export function mapTrackDocument(opts = {}) {
  const map = opts.map ?? 'swiss2';
  const [cx, cy, cz] = opts.centre ?? [120, 640, -80];
  const radius = opts.radius ?? 40;
  const n = opts.gates ?? 3;
  const doc = newCourse(map, opts.name ?? 'Ring in the air');
  if (opts.id) {
    doc.id = opts.id;
  }
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    /* Counter clockwise seen from above, so the travel is the ring's
     * tangent: (-sin a, 0, cos a) at the point (cos a, 0, sin a). */
    const base = { x: cx + radius * Math.cos(a), y: cy, z: cz + radius * Math.sin(a) };
    const quat = qAxis(0, 1, 0, headingOf(-Math.sin(a), Math.cos(a)));
    addGate(doc, opts.type ?? 'gate', base, quat);
  }
  return toPlain(doc);
}
