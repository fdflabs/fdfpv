/*
 * terrain.js: the photographic valley's own walls.
 *
 * The alps' valley (src/maps/alps/terrain.js) is a U whose walls climb
 * from the floor as a smooth ramp, and its thirty metre cells could not
 * draw anything else. Every valley photograph the loop is judged against
 * is Lauterbrunnen, whose walls are not ramps: a flat floor meets pale
 * limestone faces three hundred metres tall, a forested bench runs along
 * the top of them, a second, broken band of cliff stands over the bench,
 * and only then do alpine slopes go on up to the ridge. This file gives
 * swiss2 those walls, and the cel alps keep theirs: alps.js builds this
 * field only for a style that asks for it (style.heightfield).
 *
 * THE SHAPE is the alps' ground plus a wall profile across the valley,
 * added where the walls are and nowhere else:
 *
 *   swissHeight = terrainHeight + reach * rise
 *
 * `rise` is how far the profile (a scree apron, the lower face, the
 * bench, the upper face, the slope above) stands over the alps' own
 * mean wall, eased in to nothing where the alps' wall is already the
 * higher, near the ridge, so the peaks and the ridge are the alps'. It is
 * exactly nought until the scree starts, WALL_FROM metres at the least
 * from the valley's axis, so the floor, the strip, the village, the road,
 * the stream and the lake stand on the ground they always stood on.
 * `reach` holds the alps' ground where something is built on the wall
 * that must not move: the side valley with its lip, pool, fall and
 * stream, the break in the west wall where the hiking path, the gondola
 * and the paragliders are, and the field's ends, where the range beyond
 * meets the field's own edge.
 *
 * THE FIELD. Thirty metre cells cannot draw a face that climbs three
 * hundred metres in forty, so the cells the walls change are split
 * FINE times each way: the field is the alps' grid everywhere, and a
 * finer grid on the cells whose shape the coarse one misses by more than
 * TOL. height() reads the triangles the mesh draws, fine or coarse, as
 * the alps' field does, so the ground a craft meets is the ground it sees
 * (swiss2GroundGeometry draws exactly these). Where a fine cell meets a
 * coarse one the fine cell's edge is held to the coarse edge's straight
 * line, and the coarse cell is drawn as a fan through the same points, so
 * the two share every vertex and there is no crack and no T junction.
 * `data` stays the coarse grid, sampled from the new shape, for what
 * reads the field as a texture (the mountains' shadow, the clouds).
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';
import { noise2, smoothstep } from '../alps/noise.js';
import {
  HALF, CELL, CELLS, FLOOR_HALF, WALL_REACH, RIDGE, SIDE_Z, terrainHeight, valleyAxis,
} from '../alps/terrain.js';

/* Fine steps per coarse cell on the walls: ten metres. */
const FINE = 3;
const FCELL = CELL / FINE;
const FN = CELLS * FINE + 1;
/* Metres the coarse grid may miss the walls' shape by in a cell before
 * the cell is drawn fine. */
const TOL = 1.5;

/* The nearest the scree at a wall's foot comes to the valley's axis. A
 * floor cell reaches a cell and a bit past FLOOR_HALF, and the axis
 * leans across a cell by up to eight metres, so anything nearer would
 * move a vertex of a triangle the floor is read from. */
export const WALL_FROM = FLOOR_HALF + 110;

/* The alps' wall without its peaks: the mean it climbs by. */
function alpsMean(a) {
  return RIDGE * Math.pow(smoothstep(FLOOR_HALF, WALL_REACH, a), 1.35);
}

/*
 * How much of the profile the wall takes at z on one side, nought to
 * one. The side valley is held for 200 m either side of its trough and
 * comes back over the next 280: the fall's lip, its pool, the headwall's
 * middle and the stream out of the trough are inside it. The west wall is
 * held for 350 m either side of z 15, where the hiking path zigzags up
 * from the church, the gondola climbs to its top station and the
 * paragliders circle at 560 to 690 m; a Lauterbrunnen wall has such
 * breaks, where the cableways and the paths go up. The ends of the field
 * are held so the range beyond meets the field's edge as it always has.
 */
function reach(z, east) {
  let w = 1 - smoothstep(2550, 2950, Math.abs(z));
  if (east) {
    w *= smoothstep(200, 480, Math.abs(z - SIDE_Z));
  } else {
    w *= smoothstep(350, 600, Math.abs(z - 15));
  }
  return w;
}

/*
 * The profile across one wall at z, in metres from the axis and metres
 * over the scree's foot, its parts wandering along the valley with slow
 * noises of their own on each side: where the lower face stands and how
 * tall and steep it is, notches where the streams come over its rim, how
 * wide and high the bench is, and whether the upper band is a face or,
 * where the noise breaks it, a steep slope.
 */
function profile(z, east, out) {
  const s = east ? 0 : 41.7;
  const n = (scale, k) => noise2(z / scale + s + 7.31 * k, 3.17 * k + s);
  out.foot = WALL_FROM + 60 + 70 * n(900, 1) + 24 * (n(160, 2) - 0.5);
  /* The foot stands back from what is built at the floor's edge: the
   * lake's shore, which the old basin carries out to five hundred metres
   * from the axis, and the west farm (swiss2/village/farm.js, its house
   * four hundred metres out at z 518). */
  const lake = smoothstep(1650, 1850, z);
  const farm = east ? 0 : 1 - smoothstep(60, 220, Math.abs(z - 518));
  out.foot = Math.max(out.foot, out.foot + (620 - out.foot) * lake, out.foot + (490 - out.foot) * farm);
  const notch = smoothstep(0.72, 0.88, n(110, 3));
  out.h1 = (300 + 150 * (n(1100, 4) - 0.5)) * (1 - 0.3 * notch);
  out.w1 = 36 + 18 * (n(500, 5) - 0.5) + 30 * notch;
  out.bench = 170 + 150 * (n(1300, 6) - 0.5);
  out.rise = 80 + 60 * (n(700, 7) - 0.5);
  const whole = smoothstep(0.3, 0.55, n(800, 8));
  out.h2 = (190 + 120 * (n(1000, 9) - 0.5)) * (0.45 + 0.55 * whole);
  out.w2 = 42 + 180 * (1 - whole);
  return out;
}

/* How far past the scree's foot the profile climbs at `a` metres from
 * the axis: the apron, the lower face, the bench, the upper face and the
 * slope above, each eased at its ends. */
const SCREE = 70;
const footOf = (p) => Math.max(WALL_FROM, p.foot - SCREE);
function climb(p, a) {
  /* The apron is scree and the wood that grows on it, concave, steepest
   * where it meets the face, as a talus lies. */
  const a0 = footOf(p);
  const t = Math.max(0, Math.min(1, (a - a0) / (p.foot + 4 - a0)));
  let y = 40 * t * t;
  y += p.h1 * smoothstep(p.foot, p.foot + p.w1, a);
  const c1 = p.foot + p.w1;
  y += p.rise * smoothstep(c1, c1 + p.bench, a);
  const c2 = c1 + p.bench;
  y += p.h2 * smoothstep(c2, c2 + p.w2, a);
  const d = a - (c2 + p.w2);
  y += 0.5 * 0.5 * (d + Math.sqrt(d * d + 900));
  return y;
}

/* Where the profile has handed the wall back to the alps' own, short of
 * the ridge: the alps' mean stops climbing at WALL_REACH and the
 * profile's slope would not, so past this the peaks, the ridge and the
 * field's edges (which the range beyond meets) are the alps'. */
const RISE_TO = WALL_REACH - 50;

/* A smooth maximum of d and nought over k metres: nought below -k. */
function smax0(d, k) {
  if (d >= k) {
    return d;
  }
  if (d <= -k) {
    return 0;
  }
  return ((d + k) * (d + k)) / (4 * k);
}

const P = {};
/* What the walls add to the alps' ground at (x, z). */
export function wallRise(x, z) {
  const dx = x - valleyAxis(z);
  const east = dx > 0;
  const a = Math.abs(dx);
  if (a <= WALL_FROM) {
    return 0;
  }
  const w = reach(z, east);
  if (w <= 0) {
    return 0;
  }
  profile(z, east, P);
  const a0 = footOf(P);
  if (a <= a0) {
    return 0;
  }
  if (a >= RISE_TO) {
    return 0;
  }
  const over = climb(P, a) - (alpsMean(a) - alpsMean(a0));
  /* Eased over forty metres where the profile hands back to the alps'
   * slope near the ridge, and over next to nothing at the foot, where the
   * two start level and the easing would stand a kerb at the apron's toe. */
  const k = 0.5 + 40 * smoothstep(a0 + 150, a0 + 450, a);
  return w * smoothstep(a0, a0 + 6, a) * (1 - smoothstep(RISE_TO - 550, RISE_TO, a)) * smax0(over, k);
}

/* How much of the scree apron at a face's foot (x, z) is on, nought to
 * one: the ground's paint lays scree there (ground.js groundMasks), and
 * the carved rock keeps off it (rock/carve.js). */
export function apronAt(x, z) {
  const dx = x - valleyAxis(z);
  const east = dx > 0;
  const a = Math.abs(dx);
  const w = a > WALL_FROM ? reach(z, east) : 0;
  if (w <= 0) {
    return 0;
  }
  profile(z, east, P);
  return w * smoothstep(footOf(P), footOf(P) + 20, a) * (1 - smoothstep(P.foot + 5, P.foot + 25, a));
}

function swissHeight(x, z) {
  return terrainHeight(x, z) + wallRise(x, z);
}

/*
 * The field: the coarse grid, the cells drawn fine and the fine grid's
 * heights, and height(x, z) read on the triangles the mesh draws.
 */
export function buildSwissField() {
  const n = CELLS + 1;
  const data = new Float32Array(n * n);
  const rise = new Float32Array(n * n);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const x = -HALF + i * CELL;
      const z = -HALF + j * CELL;
      rise[j * n + i] = wallRise(x, z);
      data[j * n + i] = terrainHeight(x, z) + rise[j * n + i];
    }
  }

  /* A cell is fine where the walls' rise inside it strays from the two
   * triangles its corners make by more than TOL. The floor never is: the
   * rise is nought there. */
  const fine = new Uint8Array(CELLS * CELLS);
  for (let j = 0; j < CELLS; j += 1) {
    for (let i = 0; i < CELLS; i += 1) {
      const r00 = rise[j * n + i];
      const r10 = rise[j * n + i + 1];
      const r01 = rise[(j + 1) * n + i];
      const r11 = rise[(j + 1) * n + i + 1];
      const x0 = -HALF + i * CELL;
      const z0 = -HALF + j * CELL;
      if (Math.max(r00, r10, r01, r11) <= 0 && wallRise(x0 + CELL / 2, z0 + CELL / 2) <= 0) {
        continue;
      }
      let worst = 0;
      for (let b = 0; b <= FINE && worst <= TOL; b += 1) {
        for (let q = 0; q <= FINE; q += 1) {
          const fu = q / FINE;
          const fv = b / FINE;
          const flat = fu + fv <= 1
            ? r00 + (r10 - r00) * fu + (r01 - r00) * fv
            : r11 + (r01 - r11) * (1 - fu) + (r10 - r11) * (1 - fv);
          worst = Math.max(worst, Math.abs(wallRise(x0 + fu * CELL, z0 + fv * CELL) - flat));
        }
      }
      if (worst > TOL) {
        fine[j * CELLS + i] = 1;
      }
    }
  }
  const isFine = (i, j) => i >= 0 && j >= 0 && i < CELLS && j < CELLS && fine[j * CELLS + i] === 1;

  /* The fine grid's heights, on every lattice point of a fine cell: the
   * new shape inside, the coarse edge's straight line on an edge shared
   * with a coarse cell, the coarse grid's own value on its corners. */
  const fh = new Float32Array(FN * FN).fill(NaN);
  for (let j = 0; j < CELLS; j += 1) {
    for (let i = 0; i < CELLS; i += 1) {
      if (!fine[j * CELLS + i]) {
        continue;
      }
      for (let b = 0; b <= FINE; b += 1) {
        for (let q = 0; q <= FINE; q += 1) {
          const I = i * FINE + q;
          const J = j * FINE + b;
          const k = J * FN + I;
          if (!Number.isNaN(fh[k])) {
            continue;
          }
          const onI = q === 0 || q === FINE;
          const onJ = b === 0 || b === FINE;
          const ci = i + (q === FINE ? 1 : 0);
          const cj = j + (b === FINE ? 1 : 0);
          if (onI && onJ) {
            fh[k] = data[cj * n + ci];
          } else if (onI && !(isFine(ci - 1, j) && isFine(ci, j))) {
            fh[k] = data[j * n + ci] + (data[(j + 1) * n + ci] - data[j * n + ci]) * (b / FINE);
          } else if (onJ && !(isFine(i, cj - 1) && isFine(i, cj))) {
            fh[k] = data[cj * n + i] + (data[cj * n + i + 1] - data[cj * n + i]) * (q / FINE);
          } else {
            fh[k] = swissHeight(-HALF + I * FCELL, -HALF + J * FCELL);
          }
        }
      }
    }
  }

  const at = (i, j) => data[Math.max(0, Math.min(CELLS, j)) * n + Math.max(0, Math.min(CELLS, i))];
  /* The two triangles of a quad, split on the diagonal from (0, 1) to
   * (1, 0) as the alps' PlaneGeometry and every quad here are. */
  const tri = (h00, h10, h01, h11, fu, fv) => (fu + fv <= 1
    ? h00 + (h10 - h00) * fu + (h01 - h00) * fv
    : h11 + (h01 - h11) * (1 - fu) + (h10 - h11) * (1 - fv));
  const height = (x, z) => {
    const u = (x + HALF) / CELL;
    const v = (z + HALF) / CELL;
    const i = Math.floor(u);
    const j = Math.floor(v);
    if (isFine(i, j)) {
      const I = Math.min(i * FINE + FINE - 1, Math.max(i * FINE, Math.floor((x + HALF) / FCELL)));
      const J = Math.min(j * FINE + FINE - 1, Math.max(j * FINE, Math.floor((z + HALF) / FCELL)));
      const fu = Math.max(0, Math.min(1, (x + HALF) / FCELL - I));
      const fv = Math.max(0, Math.min(1, (z + HALF) / FCELL - J));
      const k = J * FN + I;
      return tri(fh[k], fh[k + 1], fh[k + FN], fh[k + FN + 1], fu, fv);
    }
    const fu = Math.max(0, Math.min(1, u - i));
    const fv = Math.max(0, Math.min(1, v - j));
    return tri(at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1), fu, fv);
  };
  let fineCells = 0;
  for (let q = 0; q < fine.length; q += 1) {
    fineCells += fine[q];
  }
  return {
    data, n, height, fine, fh, fineCells,
  };
}

/*
 * The ground's mesh for the field: the coarse cells as the alps draw
 * them, the fine cells at their own grid, and a coarse cell that borders
 * a fine one drawn through the fine one's points on that edge, each of
 * its two triangles as a fan from its centroid (the points lie on the
 * triangle's own edge, so the fan is the same plane). Every cell's
 * triangles are a run of the index, noted in userData.cells so the carved
 * rock can take a cell out (rock/index.js, trimGround).
 */
export function swissGroundGeometry(field) {
  const { data, n, fine, fh } = field;
  const isFine = (i, j) => i >= 0 && j >= 0 && i < CELLS && j < CELLS && fine[j * CELLS + i] === 1;
  const pos = [];
  const vid = new Int32Array(FN * FN).fill(-1);
  const vertex = (I, J) => {
    const k = J * FN + I;
    if (vid[k] < 0) {
      vid[k] = pos.length / 3;
      const y = I % FINE === 0 && J % FINE === 0 ? data[(J / FINE) * n + I / FINE] : fh[k];
      pos.push(-HALF + I * FCELL, y, -HALF + J * FCELL);
    }
    return vid[k];
  };
  const index = [];
  const start = new Uint32Array(CELLS * CELLS);
  const count = new Uint32Array(CELLS * CELLS);
  /* A triangle whose sides may carry fine points: `loop` is its corners
   * in winding order with the points between, and a plain triangle when
   * there are none. */
  const fan = (loop) => {
    if (loop.length === 3) {
      index.push(loop[0], loop[1], loop[2]);
      return;
    }
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const c of [loop[0], loop.corner1, loop.corner2]) {
      cx += pos[c * 3];
      cy += pos[c * 3 + 1];
      cz += pos[c * 3 + 2];
    }
    const cen = pos.length / 3;
    pos.push(cx / 3, cy / 3, cz / 3);
    for (let k = 0; k < loop.length; k += 1) {
      index.push(cen, loop[k], loop[(k + 1) % loop.length]);
    }
  };
  /* The lattice points strictly between two lattice points on a line. */
  const between = (I0, J0, I1, J1) => {
    const out = [];
    const steps = Math.max(Math.abs(I1 - I0), Math.abs(J1 - J0));
    for (let s = 1; s < steps; s += 1) {
      out.push(vertex(I0 + ((I1 - I0) * s) / steps, J0 + ((J1 - J0) * s) / steps));
    }
    return out;
  };
  for (let j = 0; j < CELLS; j += 1) {
    for (let i = 0; i < CELLS; i += 1) {
      const q = j * CELLS + i;
      start[q] = index.length;
      const I = i * FINE;
      const J = j * FINE;
      if (fine[q]) {
        for (let b = 0; b < FINE; b += 1) {
          for (let c = 0; c < FINE; c += 1) {
            const A = vertex(I + c, J + b);
            const B = vertex(I + c, J + b + 1);
            const C = vertex(I + c + 1, J + b + 1);
            const D = vertex(I + c + 1, J + b);
            index.push(A, B, D, B, C, D);
          }
        }
      } else {
        const A = vertex(I, J);
        const B = vertex(I, J + FINE);
        const C = vertex(I + FINE, J + FINE);
        const D = vertex(I + FINE, J);
        const left = isFine(i - 1, j) ? between(I, J, I, J + FINE) : [];
        const top = isFine(i, j - 1) ? between(I + FINE, J, I, J) : [];
        const bottom = isFine(i, j + 1) ? between(I, J + FINE, I + FINE, J + FINE) : [];
        const right = isFine(i + 1, j) ? between(I + FINE, J + FINE, I + FINE, J) : [];
        const t1 = [A, ...left, B, D, ...top];
        t1.corner1 = B;
        t1.corner2 = D;
        fan(t1);
        const t2 = [B, ...bottom, C, ...right, D];
        t2.corner1 = C;
        t2.corner2 = D;
        fan(t2);
      }
      count[q] = index.length - start[q];
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(index), 1));
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  geo.userData.cells = { start, count };
  return geo;
}
