/*
 * surface.js: the flood drawn (docs/FLOOD.md): the river, the plunge
 * pool and any bank the water climbs, at the solver's own surface, in
 * the river's own material (index.js's, the #345 look), its depth the
 * solver's and its white water where the solver's water runs fast.
 *
 *   THE MESH is one vertex for each of the flood's cells that can ever
 *   carry the river (not the spillway's concrete, which the chute's own
 *   drawing covers, not the reservoir's side of the gates, not ground
 *   higher than RIVER_MAX), at the cell's centre, joined to its
 *   neighbours by two triangles a cell, and across the fine and the
 *   coarse block's join by a row that zips each coarse cell to its two
 *   fine ones. Its vertex shader reads each cell's level, depth and
 *   current from a float texture of the flood, by the cell's own texel
 *   (no filtering, so a level keeps every centimetre): a wet cell's
 *   vertex stands at the water's level, a dry one a metre under its own
 *   ground, so between them the sheet runs into the bank where the water
 *   meets it.
 *
 *   THE TEXTURE is the flood on the fine block's raster, a coarse cell
 *   in each of its four fine texels: level, depth, and the current in
 *   the world's x and z, refreshed from the solver when it has stepped
 *   (index.js readSpill).
 *
 *   THE RIVER'S OWN SHEET is cut where this one stands (inFlood), once
 *   the flood is drawn.
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

import { CLASS } from './bed.js';

/* Ground over this never carries the river, m: the reservoir stands at
 * 219 and the river below the dam at most some 10 m over its 103.5. */
const RIVER_MAX = 135;
/* A cell's water is counted over this depth, m, and drawn over DRAWN:
 * thinner, it is a film running over rock, which the jets off the
 * chute's lips throw their water clear of. */
const WET = 0.02;
const DRAWN = 0.25;
/* The current, m/s, over which the river's water breaks white, and the
 * Froude number. */
const WHITE_SPEED = [8, 16];
/* Fine cells from the grid's edge over which white water fades in. */
const EDGE_FADE = 6;
const WHITE_FROUDE = [0.9, 1.6];

/* The line the river's own sheet is cut with where the flood's stands
 * (index.js withField); the flood's own sheet strips it. */
export const FLOOD_CUT = 'if (itInFlood(vWaterWorld.xz)) discard;';

/* Uniforms that draw no flood: a body's until the flood is ready. */
export function placeholderFlood(THREE) {
  const texture = new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType);
  texture.needsUpdate = true;
  return {
    uItFlood: { value: texture },
    uItFloodA: { value: new THREE.Vector4(0, 0, 1, 0) },
    uItFloodG: { value: new THREE.Vector4(0, 0, 1, 0) },
    uItFloodN: { value: new THREE.Vector2(1, 1) },
  };
}

/* The flood's water level under world (x, z), or null where it has
 * none or is not drawn: from the texture's last refresh. */
export function floodLevelAt(uniforms, x, z) {
  const G = uniforms.uItFloodG.value;
  if (G.w <= 0) return null;
  const A = uniforms.uItFloodA.value;
  const N = uniforms.uItFloodN.value;
  const qx = x - A.x;
  const qz = z - A.y;
  const i = Math.floor((qx * A.z + qz * A.w - G.x) / G.z);
  const j = Math.floor((qx * -A.w + qz * A.z - G.y) / G.z);
  if (i < 0 || j < 0 || i >= N.x || j >= N.y) return null;
  const t = (j * N.x + i) * 4;
  const data = uniforms.uItFlood.value.image.data;
  return data[t + 1] > WET ? data[t] : null;
}

/* The uniforms the flood's sheet and the river's own both read. */
export function floodUniforms(THREE, bed) {
  const { grid } = bed;
  const [F, C] = grid.blocks;
  const rows = F.nz + 2 * C.nz;
  const data = new Float32Array(F.nx * rows * 4);
  const texture = new THREE.DataTexture(data, F.nx, rows, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return {
    uItFlood: { value: texture },
    /* The grid's frame: its origin and its u axis in the world's plan. */
    uItFloodA: { value: new THREE.Vector4(grid.origin[0], grid.origin[1], grid.a[0], grid.a[1]) },
    /* Its corner in (u, d), its fine cell, and 1 once it is drawn. */
    uItFloodG: { value: new THREE.Vector4(grid.x0, grid.z0, grid.dx, 0) },
    uItFloodN: { value: new THREE.Vector2(F.nx, rows) },
  };
}

/* The texture refreshed from the flood `fl` (flood.js makeFlood's): the
 * fine raster's texels from either block. */
export function floodRead(fl, uniforms) {
  const { grid } = fl.bed;
  const [F, C] = grid.blocks;
  const tex = uniforms.uItFlood.value;
  const out = tex.image.data;
  const h = fl.f.h(); const hu = fl.f.hu(); const hv = fl.f.hv(); const b = fl.f.bed();
  const [ax, az] = grid.a;
  const [nx, nz] = grid.n;
  const rows = F.nz + 2 * C.nz;
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < F.nx; i += 1) {
      const k = j < F.nz ? j * F.nx + i : C.off + ((j - F.nz) >> 1) * C.nx + (i >> 1);
      const d = h[k];
      const vu = d > WET ? hu[k] / d : 0;
      const vd = d > WET ? hv[k] / d : 0;
      const t = (j * F.nx + i) * 4;
      out[t] = d + b[k];
      out[t + 1] = d;
      out[t + 2] = ax * vu + nx * vd;
      out[t + 3] = az * vu + nz * vd;
    }
  }
  tex.needsUpdate = true;
  uniforms.uItFloodG.value.w = 1;
}

/* The mesh's geometry over `bed` (bed.js's), positions in the world. */
export function floodGeometry(THREE, bed) {
  const { grid, frame } = bed;
  const [F, C] = grid.blocks;
  const pos = [];
  const cell = [];
  const ground = [];
  const edge = [];
  const index = new Map();
  /* A cell's vertex, made once; -1 for a cell the river never reaches. */
  const vertex = (k, u, d, ti, tj) => {
    if (index.has(k)) return index.get(k);
    const cls = bed.cls[k];
    const skip = cls === CLASS.concrete || cls === CLASS.reservoir || bed.b[k] > RIVER_MAX || d < 0;
    if (skip) {
      index.set(k, -1);
      return -1;
    }
    const [x, z] = frame.at(u, d);
    const n = pos.length / 3;
    pos.push(x, 0, z);
    cell.push(ti, tj);
    ground.push(bed.b[k]);
    /* Cells from the grid's outer edge, in fine cells: the boundaries'
     * water comes in or goes out there, and does not break white. */
    edge.push(Math.min(ti, F.nx - 1 - ti, tj, F.nz + 2 * C.nz - 1 - tj));
    index.set(k, n);
    return n;
  };
  const tris = [];
  const quad = (a, b2, c, d) => {
    if (a >= 0 && b2 >= 0 && c >= 0) tris.push(a, c, b2);
    if (b2 >= 0 && c >= 0 && d >= 0) tris.push(b2, c, d);
  };
  /* Each block's cells, and the texel each reads. */
  const fineAt = (i, j) => vertex(j * F.nx + i, F.x0 + (i + 0.5) * F.dx, F.z0 + (j + 0.5) * F.dx, i, j);
  const coarseAt = (i, j) => vertex(C.off + j * C.nx + i, C.x0 + (i + 0.5) * C.dx, C.z0 + (j + 0.5) * C.dx, 2 * i, F.nz + 2 * j);
  for (let j = 0; j + 1 < F.nz; j += 1) {
    for (let i = 0; i + 1 < F.nx; i += 1) {
      quad(fineAt(i, j), fineAt(i + 1, j), fineAt(i, j + 1), fineAt(i + 1, j + 1));
    }
  }
  for (let j = 0; j + 1 < C.nz; j += 1) {
    for (let i = 0; i + 1 < C.nx; i += 1) {
      quad(coarseAt(i, j), coarseAt(i + 1, j), coarseAt(i, j + 1), coarseAt(i + 1, j + 1));
    }
  }
  /* The join: each coarse cell of the coarse block's first row to the
   * two fine cells over it, and to the next coarse cell's first. */
  const last = F.nz - 1;
  for (let i = 0; i < C.nx; i += 1) {
    const c0 = coarseAt(i, 0);
    const f0 = fineAt(2 * i, last);
    const f1 = fineAt(2 * i + 1, last);
    if (f0 >= 0 && f1 >= 0 && c0 >= 0) tris.push(f0, c0, f1);
    if (i + 1 < C.nx) {
      const c1 = coarseAt(i + 1, 0);
      const f2 = fineAt(2 * i + 2, last);
      if (f1 >= 0 && c0 >= 0 && c1 >= 0) tris.push(f1, c0, c1);
      if (f1 >= 0 && c1 >= 0 && f2 >= 0) tris.push(f1, c1, f2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('aWater', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 4), 4));
  g.setAttribute('aCell', new THREE.Float32BufferAttribute(cell, 2));
  g.setAttribute('aGround', new THREE.Float32BufferAttribute(ground, 1));
  g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
  g.setIndex(tris);
  g.computeBoundingBox();
  g.boundingBox.min.y = 60;
  g.boundingBox.max.y = 240;
  g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
  return g;
}

/* The uniforms' declarations, and whether a world point is under the
 * flood's sheet (for the river's own, which it replaces there). */
export const FLOOD_GLSL = /* glsl */ `
  uniform sampler2D uItFlood;
  uniform vec4 uItFloodA;
  uniform vec4 uItFloodG;
  uniform vec2 uItFloodN;
  bool itInFlood(vec2 p) {
    if (uItFloodG.w <= 0.0) return false;
    vec2 q = p - uItFloodA.xy;
    vec2 a = uItFloodA.zw;
    vec2 g = (vec2(dot(q, a), dot(q, vec2(-a.y, a.x))) - uItFloodG.xy) / uItFloodG.z;
    return g.x > 1.0 && g.y > 1.0 && g.x < uItFloodN.x - 1.0 && g.y < uItFloodN.y - 1.0;
  }`;

/*
 * `mat` (index.js's river material, withField's) made the flood's sheet's:
 * the vertex at the cell's water or under its ground, the depth the
 * shading reads the solver's, and white water where the current runs
 * fast or near critical. The splices are checked: a shader that has lost
 * a line throws rather than drawing something else.
 */
export function floodMaterial(mat) {
  const base = mat.onBeforeCompile;
  const baseKey = mat.customProgramCacheKey();
  const BEGIN = '#include <begin_vertex>';
  const COMMON = '#include <common>';
  const READ = 'vec4 iWater = itWater(vWaterWorld.xz);';
  const SPILL = 'float spill = itPlunge(vWaterWorld.xz);';
  mat.onBeforeCompile = function onBeforeCompile(shader, renderer) {
    base.call(this, shader, renderer);
    const vs = shader.vertexShader;
    const fs = shader.fragmentShader;
    if (!vs.includes(BEGIN) || !vs.includes(COMMON) || !fs.includes(READ) || !fs.includes(SPILL) || !fs.includes(FLOOD_CUT)) {
      throw new Error('itaipu flood: the river\'s shader no longer has the lines the flood is spliced at');
    }
    shader.vertexShader = vs
      .replace(COMMON, `${COMMON}
        ${FLOOD_GLSL}
        attribute vec2 aCell;
        attribute float aGround;
        attribute float aEdge;
        varying vec4 vFlood;`)
      .replace(BEGIN, `${BEGIN}
        {
          vec4 fl = texelFetch(uItFlood, ivec2(aCell), 0);
          bool wet = fl.y > ${DRAWN.toFixed(3)};
          transformed.y = wet ? fl.x : aGround - 1.0;
          float speed = length(fl.zw);
          float froude = speed / sqrt(9.81 * max(fl.y, 0.05));
          vFlood = vec4(wet ? fl.y : -1.0,
            max(smoothstep(${WHITE_SPEED[0].toFixed(1)}, ${WHITE_SPEED[1].toFixed(1)}, speed),
              smoothstep(${WHITE_FROUDE[0].toFixed(2)}, ${WHITE_FROUDE[1].toFixed(2)}, froude) * smoothstep(0.5, 3.0, speed)),
            fl.zw);
          /* None over water too thin to break white, nor where the
           * grid's boundaries bring water in or let it out. */
          vFlood.y *= smoothstep(0.3, 1.5, fl.y) * smoothstep(2.0, ${EDGE_FADE.toFixed(1)}, aEdge);
        }`);
    shader.fragmentShader = fs
      .replace(COMMON, `${COMMON}
        varying vec4 vFlood;`)
      .replace(FLOOD_CUT, '')
      .replace(READ, 'vec4 iWater = vec4(vFlood.x, 0.0, 0.0, 0.0);')
      .replace(SPILL, 'float spill = max(itPlunge(vWaterWorld.xz), vFlood.y);');
  };
  mat.customProgramCacheKey = () => `${baseKey}-flood`;
  return mat;
}
