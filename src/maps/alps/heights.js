/*
 * heights.js: the valley's shape alone, as numbers: its constants, the
 * analytic ground and the heightfield the shell's physics plane reads.
 * Apart from terrain.js, which draws it, so the room server (Node, no
 * three.js) samples the very ground a pilot hits (edge/rooms/grounds.js).
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

import { fbm, noise2, smoothstep } from './noise.js';

/* The heightfield: a square this many metres on a side, centred on the
 * origin, sampled on a grid this fine. Thirty metre cells are coarse for a
 * hillside under a landing wing, which is why the floor near the strip is
 * flattened analytically rather than trusted to the grid. A twenty metre
 * grid was considered for the cel bands and refused: the terrain is one
 * mesh that is never culled, so it would be a hundred thousand more
 * triangles in every frame, a sixth of the whole budget, for normals on
 * a floor that is flat anyway. */
export const FIELD = 6000;
export const HALF = FIELD / 2;
export const CELLS = 200;
export const CELL = FIELD / CELLS;

/* The valley runs along z. Its floor is this wide before the walls start,
 * the walls reach the ridge line this far out, and the ridge stands this
 * high over the floor before the peaks are put on it. The Lauterbrunnen
 * floor is about a kilometre wide with walls of the same height; this is
 * a little tighter so a wing sees both walls at once. */
export const FLOOR_HALF = 220;
export const WALL_REACH = 2100;
export const RIDGE = 1400;

/* The strip: grass, this long along the valley and this wide, at the
 * origin, and the village beside it. */
export const STRIP_L = 160;
export const STRIP_W = 12;
export const STRIP_Y = 0.02;

/* The lake fills the basin at the south end; its surface is a hair below
 * the meadow so the shore reads. The basin starts going down at LAKE_N,
 * past the end of the valley road at z 1950 so the road and its traffic
 * stop on the shore rather than driving on under the water, and closes
 * again before the field's edge so the lake has a far shore of its own
 * rather than running under the range beyond. */
export const LAKE_N = 1860;
export const LAKE_Z = 2150;
export const LAKE_Y = -1.5;
export const LAKE_END = 2750;

/* How far into the basin z is, nought on the meadow to one at the lake's
 * full depth, before the walls close it in across the valley. */
export function lakeBasin(z) {
  return smoothstep(LAKE_N, LAKE_Z + 150, z) * (1 - smoothstep(LAKE_END - 250, LAKE_END + 50, z));
}

/* The side valley hangs, as a glacial side valley does: its floor stands
 * this far above the main valley's wall behind a lip this far out from
 * the axis, and the stream falls down the face of the lip into a pool
 * scooped at its foot. The lip is what gives the valley a waterfall;
 * nature.js stands its headwall on the lip's lower edge, twenty metres
 * short of LIP_DX, so the pool is scooped right under it. */
export const SIDE_Z = -1300;
export const LIP_DX = 1060;
export const LIP_RISE = 70;
export const POOL = { dx: 1022, z: -1295, r: 24, depth: 3.5, y: 190 };

/* Trees stop here on the average, and the paint's forest floor with
 * them; snow starts here, wandering a hundred and fifty metres either
 * way with the noise, and never on a face steeper than this. Rock with
 * its strata is what shows between the two. */
export const TREE_LINE = 700;
export const SNOW_LINE = 880;
export const SNOW_MAX_SLOPE = 1.6;


export function valleyAxis(z) {
  return 180 * Math.sin(z / 1500) + 60 * Math.sin(z / 430 + 1.2);
}

/*
 * The stream's centre line, west of the axis down the floor and swinging
 * east into the side valley north of SIDE_Z + 840. The village's bridge
 * is built where this crosses the street, so the line is shape rather
 * than placement and lives here, where the paint can follow it too.
 */
export function streamX(z) {
  const t = (z - SIDE_Z) / 3350;
  const side = t < 0.25 ? 1 - t / 0.25 : 0;
  return valleyAxis(z) - 95 - 30 * Math.sin(z / 260) + side * side * 700;
}

export function terrainHeight(x, z) {
  const axis = valleyAxis(z);
  const dx = x - axis;
  const across = Math.abs(dx);
  /* Behind the side valley's lip the wall climbs at a third of its
   * pace, which is the hanging valley's floor: without it the ground
   * went on up at the wall's own slope and the lip was only a kink in
   * the hillside, with nothing level for the stream to come over. */
  const side = dx > LIP_DX ? Math.exp(-Math.pow((z - SIDE_Z) / 420, 2)) : 0;
  const reach = across - (across - LIP_DX) * 0.65 * side;
  const wall = smoothstep(FLOOR_HALF, WALL_REACH, reach);
  let h = Math.pow(wall, 1.35) * RIDGE;
  /* Peaks and shoulders on the walls, more the higher they stand. */
  h += (260 * fbm(x / 900, z / 900, 4) + 90 * fbm(x / 260, z / 260, 3)) * Math.pow(wall, 0.8);
  /* The side valley: a trough into the east wall a kilometre and a bit
   * north of the strip, deep where the wall is high, hanging behind a
   * lip with the pool at the lip's foot. */
  if (dx > 0) {
    const t = Math.exp(-Math.pow((z - SIDE_Z) / 420, 2));
    h -= 0.55 * h * t;
    h += LIP_RISE * smoothstep(LIP_DX - 30, LIP_DX + 30, dx) * t;
    /* The pool: a level shelf at the lip's foot, scooped in the middle,
     * blended into the trough over the next half radius out. */
    const pd = Math.hypot(dx - POOL.dx, z - POOL.z);
    if (pd < POOL.r * 1.6) {
      const shelf = 1 - smoothstep(POOL.r, POOL.r * 1.6, pd);
      const bowl = POOL.depth * (1 - smoothstep(POOL.r * 0.3, POOL.r, pd));
      h = h * (1 - shelf) + (POOL.y - bowl) * shelf;
    }
  }
  /* The floor: pasture with a roll to it, and the lake basin at the
   * south end going below the water and coming back up for the far
   * shore. */
  const floor = 1 - wall;
  h += floor * (7 * fbm(x / 300, z / 300, 3) + 3);
  const basin = lakeBasin(z) * (1 - smoothstep(FLOOR_HALF + 150, FLOOR_HALF + 500, across));
  h -= basin * 22;
  /* Past the lake the floor climbs to a wooded shoulder that closes the
   * valley at the field's edge. Without it the floor ran flat off the
   * edge and the range beyond stood up behind the far shore as a bare
   * green wall. */
  h += 200 * Math.pow(smoothstep(LAKE_END - 60, HALF, z), 1.3) * floor * (0.8 + 0.4 * fbm(x / 400 + 2.1, z / 400, 2));
  /* The strip, the hangar and the village stand on ground held flat: a
   * plateau from the east apron to the church, longer than the strip. */
  const flat = (1 - smoothstep(STRIP_L / 2 + 60, STRIP_L / 2 + 260, Math.abs(z))) * (1 - smoothstep(150, 320, Math.abs(x + 60)));
  h = h * (1 - flat) + 0 * flat;
  return h;
}

/* The tree line, wandering sixty metres either way with the noise. */
export function treeLine(x, z) {
  return TREE_LINE + 120 * (noise2(x / 700 + 3.1, z / 700 + 1.7) - 0.5);
}

/*
 * Where the forest stands, as a density from nought to one, shared by
 * the paint and the planting so the forest floor is painted exactly
 * under the trees. Spruce from the foot of the walls to the tree line,
 * thinning out over the last hundred and fifty metres, fuller on the
 * north facing slopes, and broken into stands and meadows by the noise.
 * `facing` is the terrain's slope along z: positive faces north.
 */
export function forestDensity(x, y, z, slope, facing) {
  if (y < 30 || slope > 0.95) {
    return 0;
  }
  const line = treeLine(x, z);
  const band = smoothstep(30, 90, y) * (1 - smoothstep(line - 150, line, y));
  const stands = 0.45 + 0.55 * fbm(x / 210, z / 210, 2);
  const meadow = 1 - smoothstep(0.62, 0.72, noise2(x / 320 + 5.5, z / 320 + 2.5));
  const north = 0.75 + 0.5 * smoothstep(-0.3, 0.4, facing);
  return Math.max(0, Math.min(1, band * stands * meadow * north));
}

/*
 * The heightfield the mesh and the collider read, sampled once from the
 * analytic terrain and read back on the mesh's own triangles, so what
 * stands on it stands on what is drawn. Continuous across a cell edge,
 * as the bilinear read before it was; a step there would read as a kerb
 * to a landing wing.
 */
export function buildHeightfield() {
  const n = CELLS + 1;
  const data = new Float32Array(n * n);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      data[j * n + i] = terrainHeight(-HALF + i * CELL, -HALF + j * CELL);
    }
  }
  const at = (i, j) => data[Math.max(0, Math.min(CELLS, j)) * n + Math.max(0, Math.min(CELLS, i))];
  const height = (x, z) => {
    const u = (x + HALF) / CELL;
    const v = (z + HALF) / CELL;
    const i = Math.floor(u);
    const j = Math.floor(v);
    const fu = Math.max(0, Math.min(1, u - i));
    const fv = Math.max(0, Math.min(1, v - j));
    const h00 = at(i, j);
    const h10 = at(i + 1, j);
    const h01 = at(i, j + 1);
    const h11 = at(i + 1, j + 1);
    /* The two triangles the mesh draws, split on the diagonal from
     * (i, j + 1) to (i + 1, j) as PlaneGeometry rotated flat indexes them,
     * rather than a bilinear patch: the two disagree mid-cell by up to
     * fifteen centimetres on the valley floor, which sank the road and the
     * cars on it under the drawn grass. Still continuous across edges. */
    if (fu + fv <= 1) {
      return h00 + (h10 - h00) * fu + (h01 - h00) * fv;
    }
    return h11 + (h01 - h11) * (1 - fu) + (h10 - h11) * (1 - fv);
  };
  return { data, n, height };
}
