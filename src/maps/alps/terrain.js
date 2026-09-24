/*
 * terrain.js: the valley's ground: its shape, its paint, its mesh and the
 * range beyond it.
 *
 * One analytic valley sampled into a heightfield that the mesh, the
 * colour, the tree line and the shell's physics plane all read. Nothing
 * here is placed on the ground; that is the other modules' business.
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
import { celMaterial } from '../../render/celmat.js';
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

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* The paths the paint draws on the ground, as polylines in metres: the
 * track along the stream from the bridge to the lake, the track up the
 * side valley to the pool, and a hiker's zigzag up the west wall from
 * the church. Drawn as canvas strokes over the texels, which is the one
 * cheap way to put a two metre line on a three metre texel. */
export function groundPaths() {
  const stream = [];
  for (let z = 115; z <= 1330; z += 40) {
    stream.push({ x: streamX(z) + 7, z });
  }
  const side = [];
  for (let k = 0; k <= 16; k += 1) {
    const t = k / 16;
    const z = SIDE_Z + 60 * Math.sin(t * 5) - 10 * t;
    const dx = 75 + t * (POOL.dx - 30 - 75);
    side.push({ x: valleyAxis(z) + dx + 12 * Math.sin(t * 9), z });
  }
  const zigzag = [{ x: -250, z: 112 }];
  for (let k = 1; k <= 8; k += 1) {
    zigzag.push({ x: -250 - k * 95, z: 112 + (k % 2 === 0 ? 40 : -140) });
  }
  return [stream, side, zigzag];
}

/*
 * The ground's colour, painted from the same terrain, a texel every
 * four metres: meadow on the floor with mown stripes on the village
 * plateau and hayfield patches beyond it, pasture with flowers above,
 * the forest floor under the trees, scree fanning out below the cliffs,
 * rock with its strata on the steep faces, snow with wind lines on the
 * ridges, gravel round the lake with silt under the shallows, and the
 * paths stroked on top.
 *
 * Two passes. The zones are mixed once per block of six texels,
 * twenty three metres, where the slope, the forest and the noise are
 * read, because nothing they drive is finer than the thirty metre
 * heightfield and the ten noise reads a block are most of the cost;
 * the texels then read the block colour bilinearly and add only what
 * is finer than a block: the strata, the stripes, the wind lines and
 * the flower speckle. Measured in headless Chrome on this box: the
 * texel pass doing the zone mixing itself was over 600 ms, blocks of
 * four texels were 210 to 230 ms of blocks and 285 to 320 ms of
 * texels, and this is what fits the build budget. One canvas, one
 * keyed texture: the cel material takes a map and nothing else, so a
 * second tiling detail texture would mean a change to celmat.js's
 * shader, and that is not this file's to make.
 */
export function groundTexture(field) {
  /* The village plateau's footprint, the same terms terrainHeight holds
   * it flat with, so the mown stripes stop where the plateau does. */
  const plateau = (x, z) => (1 - smoothstep(STRIP_L / 2 + 60, STRIP_L / 2 + 260, Math.abs(z))) * (1 - smoothstep(150, 320, Math.abs(x + 60)));
  const PX = 1536;
  const PER = 6;
  const BLOCKS = PX / PER;
  const step = FIELD / PX;
  const bstep = FIELD / BLOCKS;

  const meadow = [0x6f, 0x9a, 0x3e];
  const hay = [0x82, 0xa3, 0x44];
  const pasture = [0x8c, 0xa6, 0x4f];
  const flowers = [0xa4, 0xb3, 0x58];
  const forest = [0x3a, 0x59, 0x2c];
  const scree = [0x9c, 0x99, 0x92];
  const screeDark = [0x83, 0x80, 0x7a];
  const rock = [0x6c, 0x6d, 0x6c];
  const snow = [0xf4, 0xf6, 0xfa];
  const gravel = [0xb6, 0xb0, 0xa1];
  const silt = [0x98, 0xab, 0x86];
  const bed = [0x2d, 0x55, 0x58];
  const lerp3 = (out, b, t) => {
    out[0] += (b[0] - out[0]) * t;
    out[1] += (b[1] - out[1]) * t;
    out[2] += (b[2] - out[2]) * t;
  };

  /* Per block: the zone colour and the weights the texels finish with. */
  const nb = BLOCKS * BLOCKS;
  const bCol = new Float32Array(nb * 3);
  const bFaces = new Float32Array(nb);
  const bSnowy = new Float32Array(nb);
  const bFlat = new Float32Array(nb);
  const bBloom = new Float32Array(nb);
  const bGrain = new Float32Array(nb);
  const bPatch = new Float32Array(nb);
  const c = [0, 0, 0];
  for (let j = 0; j < BLOCKS; j += 1) {
    const z = -HALF + (j + 0.5) * bstep;
    for (let i = 0; i < BLOCKS; i += 1) {
      const x = -HALF + (i + 0.5) * bstep;
      const k = j * BLOCKS + i;
      const y = field.height(x, z);
      const sx = (field.height(x + bstep, z) - field.height(x - bstep, z)) / (2 * bstep);
      const sz = (field.height(x, z + bstep) - field.height(x, z - bstep)) / (2 * bstep);
      const slope = Math.hypot(sx, sz);
      const grain = fbm(x / 80, z / 80, 2);
      const patch = noise2(x / 34 + 9.1, z / 34 + 3.7);
      bGrain[k] = grain;
      bPatch[k] = patch;
      bFlat[k] = plateau(x, z);

      /* The floor and the pasture. Hayfields are patches of a yellower
       * green a hundred metres across. */
      const up = smoothstep(60, 500, y);
      c[0] = meadow[0];
      c[1] = meadow[1];
      c[2] = meadow[2];
      lerp3(c, hay, smoothstep(0.55, 0.7, noise2(x / 140 + 3.3, z / 140 + 8.8)) * (1 - up));
      lerp3(c, pasture, up);
      /* Flower patches on the pasture below the tree line: a warmer
       * green, and the texels speckle it. */
      const bloom = smoothstep(0.58, 0.7, patch) * smoothstep(40, 120, y) * (1 - smoothstep(TREE_LINE - 200, TREE_LINE, y)) * (1 - smoothstep(0.45, 0.7, slope));
      bBloom[k] = bloom;
      lerp3(c, flowers, bloom);
      /* The forest floor, exactly under the density the trees are
       * planted with. */
      lerp3(c, forest, forestDensity(x, y, z, slope, sz) * 0.9);
      /* Scree below the cliffs, streaked down the fall line. Uphill is
       * against the gradient; steep ground forty five metres up from a
       * moderate slope is where the cliff sheds. */
      if (slope > 0.04 && slope < 0.85) {
        const ax = x - sx / slope * 45;
        const az = z - sz / slope * 45;
        const usx = (field.height(ax + 6, az) - field.height(ax - 6, az)) / 12;
        const usz = (field.height(ax, az + 6) - field.height(ax, az - 6)) / 12;
        const sc = smoothstep(0.85, 1.15, Math.hypot(usx, usz)) * smoothstep(0.3, 0.55, slope);
        if (sc > 0.02) {
          const streak = noise2((-sz * x + sx * z) / slope / 7 + 1.7, y / 40);
          lerp3(c, streak > 0.5 ? scree : screeDark, sc);
        }
      }
      /* Rock on the steep faces and above the trees; the faces get
       * their strata from the texels. */
      const rockiness = Math.max(smoothstep(0.8, 1.05, slope), smoothstep(TREE_LINE + 80, TREE_LINE + 220, y + 60 * grain));
      lerp3(c, rock, rockiness);
      bFaces[k] = smoothstep(0.7, 1.0, slope) * rockiness;
      /* Snow above the line on anything that will hold it, and old snow
       * in the hollows below it. */
      const line = SNOW_LINE + 150 * grain;
      let snowy = smoothstep(line - 100, line + 100, y) * (1 - smoothstep(SNOW_MAX_SLOPE - 0.3, SNOW_MAX_SLOPE + 0.3, slope));
      if (y > line - 330 && slope < 0.8) {
        const hollow = smoothstep(0.66, 0.74, noise2(x / 60 + 2.2, z / 60 + 7.9)) * smoothstep(line - 330, line - 180, y) * (1 - smoothstep(0.5, 0.8, slope));
        snowy = Math.max(snowy, hollow);
      }
      bSnowy[k] = snowy;
      lerp3(c, snow, snowy);
      /* The lake basin: gravel round the shore, silt under the
       * shallows, the bed under the deep water. */
      if (y < LAKE_Y + 3.5 && z > LAKE_N) {
        const basin = lakeBasin(z);
        const shore = (1 - smoothstep(LAKE_Y + 1.5, LAKE_Y + 3.5, y)) * smoothstep(0.2, 0.5, basin);
        lerp3(c, gravel, shore);
        lerp3(c, silt, (1 - smoothstep(LAKE_Y - 3, LAKE_Y - 1.2, y)) * shore);
        lerp3(c, bed, (1 - smoothstep(LAKE_Y - 9, LAKE_Y - 4, y)) * shore);
      }
      const tone = 1 + 0.04 * grain;
      bCol[k * 3] = c[0] * tone;
      bCol[k * 3 + 1] = c[1] * tone;
      bCol[k * 3 + 2] = c[2] * tone;
    }
  }
  const paths = groundPaths();

  return canvasTexture(PX, PX, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    const px = img.data;
    const last = BLOCKS - 1;
    /* Which two blocks a texel sits between along x, and how far, worked
     * out once per column rather than four million times. */
    const col0 = new Int32Array(w);
    const col1 = new Int32Array(w);
    const colF = new Float32Array(w);
    const colN = new Int32Array(w);
    for (let i = 0; i < w; i += 1) {
      const u = Math.max(0, Math.min(last, (i + 0.5) / PER - 0.5));
      col0[i] = Math.floor(u);
      col1[i] = Math.min(last, col0[i] + 1);
      colF[i] = u - col0[i];
      colN[i] = colF[i] < 0.5 ? col0[i] : col1[i];
    }
    for (let j = 0; j < h; j += 1) {
      const z = -HALF + (j + 0.5) * step;
      const v = Math.max(0, Math.min(last, (j + 0.5) / PER - 0.5));
      const j0 = Math.floor(v);
      const j1 = Math.min(last, j0 + 1);
      const fv = v - j0;
      const row0 = j0 * BLOCKS;
      const row1 = j1 * BLOCKS;
      const rowN = fv < 0.5 ? row0 : row1;
      for (let i = 0; i < w; i += 1) {
        const x = -HALF + (i + 0.5) * step;
        const fu = colF[i];
        const k00 = (row0 + col0[i]) * 3;
        const k10 = (row0 + col1[i]) * 3;
        const k01 = (row1 + col0[i]) * 3;
        const k11 = (row1 + col1[i]) * 3;
        const w00 = (1 - fu) * (1 - fv);
        const w10 = fu * (1 - fv);
        const w01 = (1 - fu) * fv;
        const w11 = fu * fv;
        let r = bCol[k00] * w00 + bCol[k10] * w10 + bCol[k01] * w01 + bCol[k11] * w11;
        let g = bCol[k00 + 1] * w00 + bCol[k10 + 1] * w10 + bCol[k01 + 1] * w01 + bCol[k11 + 1] * w11;
        let b = bCol[k00 + 2] * w00 + bCol[k10 + 2] * w10 + bCol[k01 + 2] * w01 + bCol[k11 + 2] * w11;
        /* The nearest block's weights are enough for what follows: a
         * stripe or a stratum edge crossing a block boundary is not a
         * thing anyone sees. */
        const kn = rowN + colN[i];
        const snowy = bSnowy[kn];
        const faces = bFaces[kn] * (1 - snowy);
        if (faces > 0.02) {
          /* Strata: bands thirty metres tall, warped a little by the
           * grain so they never read as contour lines, a dark one and a
           * light one to every four. */
          const y = field.height(x, z);
          const band = ((y + 16 * bGrain[kn] + 8 * bPatch[kn]) / 30) % 1;
          if (band < 0.2) {
            const t = 0.16 * faces;
            r *= 1 - t;
            g *= 1 - t;
            b *= 1 - t;
          } else if (band > 0.6 && band < 0.76) {
            const t = 0.1 * faces;
            r *= 1 + t;
            g *= 1 + t;
            b *= 1 + t;
          }
        }
        if (snowy > 0.3) {
          /* Wind lines combed across the snow from the south west. */
          const wind = noise2((x - z) / 5.2, (x + z) / 260 + 4.4);
          if (wind > 0.56) {
            const t = 0.07 * snowy;
            r *= 1 - t;
            g *= 1 - t * 0.6;
            b *= 1 - t * 0.2;
          }
        }
        const flat = bFlat[kn];
        if (flat > 0.02) {
          /* Mown fields, a hundred and twenty five metres square, each
           * striped one way or the other or left long, five texels to a
           * stripe. One set of stripes over the whole plateau converged
           * on the vanishing point and read from the air as a fan of
           * light rays; a stripe that is not a whole number of texels
           * wide beats between two and three texel bands. */
          let fh = Math.imul((i >> 5) + 7, 73856093) ^ Math.imul((j >> 5) + 3, 19349663);
          fh = (Math.imul(fh ^ (fh >>> 13), 1274126177) >>> 0) % 3;
          if (fh > 0) {
            const lane = fh === 1 ? i : j;
            const t = 1 + (Math.floor(lane / 5) % 2 === 0 ? 0.035 : -0.03) * flat;
            r *= t;
            g *= t;
            b *= t;
          }
        }
        const bloom = bBloom[kn];
        if (bloom > 0.05) {
          /* Yellow and white speckle in the flower patches. */
          let hsh = (i * 374761393 + j * 668265263) | 0;
          hsh = Math.imul(hsh ^ (hsh >>> 13), 1274126177);
          const speck = ((hsh ^ (hsh >>> 16)) >>> 0) / 4294967296;
          if (speck > 0.93) {
            const t = bloom * 0.55;
            const white = speck > 0.985;
            r += ((white ? 0xf2 : 0xe9) - r) * t;
            g += ((white ? 0xf2 : 0xd8) - g) * t;
            b += ((white ? 0xe6 : 0x62) - b) * t;
          }
        }
        const k = (j * w + i) * 4;
        px[k] = r;
        px[k + 1] = g;
        px[k + 2] = b;
        px[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    /* The paths, stroked over the texels. The canvas's y runs with z. */
    ctx.strokeStyle = '#b8ad95';
    ctx.lineWidth = 0.8;
    ctx.lineJoin = 'round';
    for (const path of paths) {
      ctx.beginPath();
      path.forEach((p, k) => {
        const u = (p.x + HALF) / step;
        const v = (p.z + HALF) / step;
        if (k === 0) {
          ctx.moveTo(u, v);
        } else {
          ctx.lineTo(u, v);
        }
      });
      ctx.stroke();
    }
  });
}

/* The terrain mesh from the heightfield, a plane on its side with every
 * vertex lifted, normals computed so the cel shading reads the relief. */
export function terrainMesh(field, tex) {
  const geo = new THREE.PlaneGeometry(FIELD, FIELD, CELLS, CELLS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position');
  for (let k = 0; k < pos.count; k += 1) {
    pos.setY(k, field.height(pos.getX(k), pos.getZ(k)));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, celMaterial({ color: 0xffffff, rim: 0.12, map: tex, key: 'alps-ground' }));
  mesh.receiveShadow = true;
  return mesh;
}

/*
 * THE RANGE BEYOND. The valley's own field ends at three kilometres, and
 * a valley in the Alps does not: past every ridge there is a higher one.
 * A coarse ring of peaks, twenty four kilometres across, snow above the
 * rock, stands outside the field to fill the horizon. It has no collider
 * and nothing lands on it; the fog takes it before the field's edge is
 * noticed, and the sky dome takes it before the far plane does.
 */
/*
 * The ranges beyond the valley, and since the pilot asked for a bigger
 * world, ground a craft can fly over and hit rather than scenery it
 * passes through: 24 km across against the valley's 6. Returns the mesh
 * and a height sampler read on the mesh's own triangles, split on the
 * diagonal PlaneGeometry uses, as the valley's heightfield is, so what
 * stops a craft is what is drawn.
 */
export function farRange(field) {
  const size = 24000;
  /* 300 m cells: all of it stands in fog, and at 250 the strip's view
   * swung over its 600k triangle budget with the traffic. 300 also puts a
   * grid line on the field's edge at 3 km, so the seam is a shared edge. */
  const n = 80;
  const geo = new THREE.PlaneGeometry(size, size, n, n);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position');
  const colour = new Float32Array(pos.count * 3);
  const rock = new THREE.Color(0x7d7b77);
  const snow = new THREE.Color(0xf4f6fa);
  const green = new THREE.Color(0x4f7a3a);
  const forest = new THREE.Color(0x2f4a26);
  const c = new THREE.Color();
  for (let k = 0; k < pos.count; k += 1) {
    const x = pos.getX(k);
    const z = pos.getZ(k);
    const r = Math.hypot(x, z);
    /* Nothing inside the field, a skirt rising from the field's edge,
     * peaks to two and a half kilometres beyond it. The skirt starts at
     * the edge rather than inside it: begun six hundred metres in, it
     * stood up through the valley floor as a bare green wall a few
     * hundred metres past the lake's far shore. */
    const skirt = smoothstep(HALF - 100, HALF + 2300, r);
    let h = skirt * (1500 + 900 * fbm(x / 2200, z / 2200, 4) + 350 * fbm(x / 700, z / 700, 3)) - 40 * (1 - skirt);
    /* Past the field's edge the range starts where the valley's own ground
     * stops and eases into its peaks. Without this the valley's side walls
     * ended at 1.3 km and the range began at the bottom of a trench round
     * the whole world. The heightfield clamps to its edge, so outside it
     * reads the edge height straight out. */
    const out = Math.max(Math.abs(x), Math.abs(z)) - HALF;
    if (out >= 0) {
      h = Math.max(h, field.height(x, z) * (1 - smoothstep(0, 2500, out)));
    }
    pos.setY(k, h);
    const t = smoothstep(1300, 1900, h + 200 * fbm(x / 900, z / 900, 2));
    /* The lower slopes in forest and pasture, as the valley's own are. */
    c.copy(green).lerp(forest, smoothstep(0.38, 0.55, fbm(x / 600 + 4.2, z / 600 + 1.3, 2)) * (1 - smoothstep(450, 750, h)));
    c.lerp(rock, smoothstep(450, 1000, h)).lerp(snow, t);
    colour[k * 3] = c.r;
    colour[k * 3 + 1] = c.g;
    colour[k * 3 + 2] = c.b;
  }
  pos.needsUpdate = true;
  geo.setAttribute('color', new THREE.BufferAttribute(colour, 3));
  geo.computeVertexNormals();
  const mat = celMaterial({ color: 0xffffff, rim: 0.1 });
  mat.vertexColors = true;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'far-range';
  /* PlaneGeometry's vertex (i, j), laid flat, is at x = i * cell - size / 2
   * and z = j * cell - size / 2, index i + (n + 1) * j. */
  const cell = size / n;
  const data = new Float32Array(pos.count);
  for (let k = 0; k < pos.count; k += 1) {
    data[k] = pos.getY(k);
  }
  const at = (i, j) => data[Math.max(0, Math.min(n, j)) * (n + 1) + Math.max(0, Math.min(n, i))];
  const height = (x, z) => {
    const u = (x + size / 2) / cell;
    const v = (z + size / 2) / cell;
    const i = Math.floor(u);
    const j = Math.floor(v);
    const fu = Math.max(0, Math.min(1, u - i));
    const fv = Math.max(0, Math.min(1, v - j));
    const h00 = at(i, j);
    const h10 = at(i + 1, j);
    const h01 = at(i, j + 1);
    const h11 = at(i + 1, j + 1);
    if (fu + fv <= 1) {
      return h00 + (h10 - h00) * fu + (h01 - h00) * fv;
    }
    return h11 + (h01 - h11) * (1 - fu) + (h10 - h11) * (1 - fv);
  };
  return { mesh, height };
}
