/*
 * capture.js: the room's judge of a capture (docs/campaign/interior/
 * TECH-NEEDS.md N5, CONTRACT-P0.md section 7). A screen proposes a still
 * of an item with the grade its own scorer gave it; the room measures the
 * same still from its own numbers (the pilot's pose and camera report at
 * the still's room ms, the item's place and size, the crowns) and keeps
 * the lower grade. The screen knows the blur, which the room cannot; the
 * room knows the pose, which the screen could forge. Captures are the
 * squad's: one pilot's counts for everyone.
 *
 * Campaign agnostic: an ITEM is mission data, { id, at: [x, y, z] or a
 * contact's id in `contact`, size (metres across), minGrade?, set? }.
 *
 * VIEW's scorer should call gradeOf with its own size and off, so the
 * screen and the room cut the grades at the same numbers.
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

import { sight } from './sight.js';

/* Worst to best. */
export const GRADES = Object.freeze(['poor', 'usable', 'clean']);

/* The cuts: the item's size over the frame's width at least `size`, its
 * offset from the centre (0 centre, 1 edge) at most `off`. */
export const CUTS = Object.freeze({
  clean: { size: 0.1, off: 0.25 },
  usable: { size: 0.04, off: 0.5 },
  poor: { size: 0.01, off: 1 },
});

export const rank = (grade) => GRADES.indexOf(grade);

/* The best grade a framing earns, or null for none. */
export function gradeOf(size, off) {
  for (const g of [...GRADES].reverse()) {
    if (size >= CUTS[g].size && off <= CUTS[g].off) {
      return g;
    }
  }
  return null;
}

/*
 * The room's grade for a still of an item at `at` (its centre, ops frame)
 * of `size` metres, by a pilot at `from` with camera report `cam`:
 * { grade, size, off } or { error }: 'frame' (behind the camera, outside
 * the picture or too small to grade), 'blocked' (crowns between).
 */
export function judgeCapture(at, size, from, cam, world) {
  const s = sight(from, cam, at, size);
  if (!s || !s.inside) {
    return { error: 'frame' };
  }
  if (world.canopyBlocks(from, at)) {
    return { error: 'blocked' };
  }
  const grade = gradeOf(s.size, s.off);
  if (!grade) {
    return { error: 'frame' };
  }
  return { grade, size: Math.round(s.size * 1000) / 1000, off: Math.round(s.off * 1000) / 1000 };
}

/* The lower of two grades. */
export function lower(a, b) {
  return rank(a) <= rank(b) ? a : b;
}
