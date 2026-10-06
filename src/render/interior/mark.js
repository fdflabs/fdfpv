/*
 * mark.js: the Column's mark (BIBLE.md section 9), painted by hand on a
 * tarp, as a texture drawn at load: an original mark, nothing taken from
 * any real group's emblem.
 *
 * The shape, as the bible gives it: a row of five short vertical strokes
 * stepping down in height from left to right, standing under one long
 * horizontal bar, all inside a circle left open at the bottom (a gap of
 * about a fifth of the ring): a small file of people walking under a roof
 * of trees. Ochre on olive canvas, the strokes uneven, the old paint
 * weathered half away (M1: "a faded painted texture").
 *
 * The brush's wobble and the weathering are hashed from the pixel, not
 * random, so every screen paints the same mark.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { hash01 } from '../../share/interior/canopy.js';

export const MARK_PX = 256;
const CANVAS = [92, 98, 70];
const OCHRE = [176, 112, 52];

/*
 * The mark's coverage at a point (u, v) in [-1, 1] (v up), 0 to 1: the
 * open ring, the bar, the five strokes, each a stroke of the brush's
 * width with a hashed wobble.
 */
export function markCoverage(u, v) {
  const w = 0.075;
  const wob = (k) => (hash01(Math.floor((u + 1) * 40), Math.floor((v + 1) * 40), k) - 0.5) * 0.03;
  let c = 0;
  /* The ring, radius 0.82, open at the bottom over a fifth of its turn. */
  const r = Math.sqrt(u * u + v * v);
  const a = Math.atan2(u, -v);
  if (Math.abs(r - 0.82 + wob(1)) < w && Math.abs(a) > Math.PI / 5) {
    c = 1;
  }
  /* The bar across the upper middle. */
  if (Math.abs(v - 0.34 + wob(2)) < w * 0.85 && Math.abs(u) < 0.56) {
    c = 1;
  }
  /* Five strokes under it, stepping down from left to right. */
  for (let k = 0; k < 5; k += 1) {
    const x = -0.44 + k * 0.22;
    const top = 0.2;
    const len = 0.62 - k * 0.09;
    if (Math.abs(u - x + wob(3 + k)) < w * 0.7 && v < top && v > top - len) {
      c = 1;
    }
  }
  return c;
}

/* The painted tarp as RGBA bytes, MARK_PX square, row 0 the top. */
export function markPixels() {
  const data = new Uint8Array(MARK_PX * MARK_PX * 4);
  for (let j = 0; j < MARK_PX; j += 1) {
    for (let i = 0; i < MARK_PX; i += 1) {
      const u = (i + 0.5) / MARK_PX * 2 - 1;
      const v = 1 - (j + 0.5) / MARK_PX * 2;
      /* Weathered: the paint gone in blotches, the canvas mottled. */
      const wear = hash01(i >> 3, j >> 3, 31) * 0.6 + hash01(i, j, 32) * 0.4;
      const paint = markCoverage(u, v) * (wear > 0.35 ? 0.85 : 0.25);
      const mottle = 0.9 + 0.2 * hash01(i >> 2, j >> 2, 33);
      const k = (j * MARK_PX + i) * 4;
      for (let ch = 0; ch < 3; ch += 1) {
        data[k + ch] = Math.round((CANVAS[ch] * (1 - paint) + OCHRE[ch] * paint) * mottle);
      }
      data[k + 3] = 255;
    }
  }
  return data;
}
