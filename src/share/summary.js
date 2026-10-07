/*
 * summary.js: the course the shell would fly, for the title menu and the
 * launch card, read from the share seat without building anything (the
 * builder would pull the renderer in with it).
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

import { inspectCourse } from './listing.js';

/* The seated course's listing (src/share/listing.js inspectCourse), or
 * null when nothing is seated or the seat cannot be read: a menu shows no
 * course rather than failing. */
export function activeCourseSummary() {
  let seated;
  try {
    seated = inspectCourse();
  } catch (e) {
    return null;
  }
  const flyable = Boolean(seated) && seated.kind !== 'none' && Boolean(seated.doc);
  return flyable ? seated : null;
}
