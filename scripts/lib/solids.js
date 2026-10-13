/*
 * solids.js: a page expression that finds solids on the seated map, for
 * the checks that need one to stand a control in or a craft beside
 * (scripts/world-spawns-check.js, scripts/chase-walls-check.js). It reads
 * the page's own probes (src/main.js __surface, __nearSolid), so what it
 * finds is what the plant meets.
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

/* m: looked for this far round the given point, on a grid this fine. */
export const SEARCH_M = 8000;
const SEARCH_STEP_M = 25;
/* m: solid from a metre over the ground to this over it. */
export const SOLID_TALL_M = 6;
const SOLID_HITS = 40;
const SOLID_APART_M = 50;

/* Up to SOLID_HITS points round `home`, each inside a solid from a metre
 * over the ground to SOLID_TALL_M over it and SOLID_APART_M from the
 * others, nearest first. Tall, because the facing control's line
 * passes a low wall: 15 m out it is 4.75 m up, and a fence that low is no
 * reason to turn. The grid finds a tall solid within a step, then each
 * move goes the solid's gap toward whichever of eight bearings is nearer
 * it, so a thin wall the grid steps over is still entered. */
export const FIND_SOLIDS = `((h) => {
  const ground = (x, z) => window.__surface(x, z, window.__surface(x, z, -1000));
  const gap = (x, z) => {
    const y = ground(x, z);
    const a = window.__nearSolid(x, y + 1, z, ${SEARCH_STEP_M});
    const b = window.__nearSolid(x, y + ${SOLID_TALL_M}, z, ${SEARCH_STEP_M});
    return Math.max(a == null ? Infinity : a, b == null ? Infinity : b);
  };
  const enter = (x, z) => {
    let g = gap(x, z);
    for (let k = 0; k < 40 && g > 0; k += 1) {
      let best = null;
      for (let a = 0; a < 8; a += 1) {
        const nx = x + Math.cos(a * Math.PI / 4) * Math.max(0.25, g);
        const nz = z + Math.sin(a * Math.PI / 4) * Math.max(0.25, g);
        const ng = gap(nx, nz);
        if (best === null || ng < best[2]) { best = [nx, nz, ng]; }
      }
      if (!(best[2] < g)) { return null; }
      [x, z, g] = best;
    }
    return g === 0 ? { x, z } : null;
  };
  const hits = [];
  for (let r = ${SEARCH_STEP_M}; r <= ${SEARCH_M} && hits.length < ${SOLID_HITS}; r += ${SEARCH_STEP_M}) {
    for (let x = -r; x <= r; x += ${SEARCH_STEP_M}) {
      for (let z = -r; z <= r; z += ${SEARCH_STEP_M}) {
        if (Math.max(Math.abs(x), Math.abs(z)) !== r || !(gap(h.x + x, h.z + z) < ${SEARCH_STEP_M})) { continue; }
        const at = enter(h.x + x, h.z + z);
        if (at && hits.length < ${SOLID_HITS} && hits.every((o) => Math.hypot(o.x - at.x, o.z - at.z) > ${SOLID_APART_M})) { hits.push(at); }
      }
    }
  }
  return hits;
})`;
