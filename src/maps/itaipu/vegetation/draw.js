/*
 * draw.js: the vegetation as it is drawn. Two things:
 *
 * THE TREES round the camera, every one of them a planted tree
 * (plant.js), drawn as swiss2 draws its broadleaves (swiss2/vegetation/
 * species.js and plantmat.js): the whole model near, the reduced model in
 * the middle distance, the two dissolving into each other across a fade.
 * The forest's trees stop at the middle band's edge, where the canopy
 * below takes over; the trees that stand alone (the fields', the parks',
 * the eucalyptus rows) carry on as reduced models to FAR, because nothing
 * else draws them and the reference photographs have them in every
 * pasture seen from the air.
 *
 * THE CANOPY, the forest's far drawing: one surface over the whole
 * forest at the height the canopy model gives it, in a mesh per hero
 * tile, coloured by the satellite (vertex colours, the same reflectance
 * the ground's material decodes, look/ground.js) and shaded in the
 * fragment as crowns: a cell pattern ten metres across whose cells are
 * domes, dark in the gaps between them, each crown its own brightness,
 * with a finer one of the clumps inside a crown. Seen from the air a
 * closed forest is that: a carpet of crowns. The surface dissolves out
 * inside the trees' middle band on the same dither the trees dissolve
 * on (plantmat.js DITHER_GLSL), so the two share every pixel exactly once
 * at the seam. Where the forest ends the surface drops to the ground in
 * one grid cell, a sloped skirt shaded as leaves.
 *
 * Nothing here is physics: the colliders and the forest volume are
 * plant.js's.
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
import { buildVariant, triangles } from '../../swiss2/vegetation/species.js';
import { plantMaterial, plantDepthMaterial, DITHER_GLSL } from '../../swiss2/vegetation/plantmat.js';
import {
  HALF, KINDS, K_LONE, K_EUCALYPTUS, YAW_COS, YAW_SIN,
} from './plant.js';
import { FOREST_GRADE } from '../look/ground.js';

/*
 * The bands per preset, m: the whole model to `near`, the reduced model
 * to `mid` for the forest and to `far` for the trees that stand alone,
 * each dissolving over `fade`; caps are instances per kind and level.
 * `shell` is the canopy's grid, m.
 */
export const TIERS = {
  high: { near: 70, mid: 220, far: 1500, fade: 14, capNear: 1500, capMid: 6000, shell: 20 },
  medium: { near: 40, mid: 170, far: 1100, fade: 10, capNear: 700, capMid: 3500, shell: 20 },
  low: { near: 0, mid: 120, far: 800, fade: 8, capNear: 0, capMid: 2000, shell: 20 },
};

/* The foliage's tint over swiss2's atlas, which was painted for a Bernese
 * beech: the Atlantic forest in December is a deeper, bluer green, and a
 * tree alone in a pasture a lighter one. */
const TINT_FOREST = new THREE.Color(0.62, 0.74, 0.6);
const TINT_LONE = new THREE.Color(0.8, 0.88, 0.7);

const SPARSE = (k) => k === K_LONE || k === K_EUCALYPTUS;

/*
 * The trees round the camera. `forest` is plantHero's; `atlases`
 * swiss2's (loadAtlases); `wind` swiss2's wind uniforms. Returns the
 * meshes (in `group`), update(camera) and the builds' triangle counts.
 */
export function treeLod({
  forest, atlases, tier, group, sunDir, wind,
}) {
  const nearOn = tier.near > 0;
  const builds = KINDS.map((v) => ({
    near: nearOn ? buildVariant(v, 'near') : null,
    mid: buildVariant(v, 'mid'),
  }));
  const bandNear = [-2, -1, tier.near - tier.fade, tier.near];
  const midIn = nearOn ? [tier.near - tier.fade, tier.near] : [-2, -1];
  const mats = {
    nearFoliage: plantMaterial('foliage', { map: atlases.foliage, band: bandNear, wind }),
    nearBark: plantMaterial('bark', { map: atlases.bark.map, normalMap: atlases.bark.normalMap, band: bandNear, wind }),
    midForest: plantMaterial('foliage', { map: atlases.foliage, band: [...midIn, tier.mid - tier.fade, tier.mid], wind }),
    midSparse: plantMaterial('foliage', { map: atlases.foliage, band: [...midIn, tier.far - tier.fade, tier.far], wind }),
    nearSparse: plantMaterial('foliage', { map: atlases.foliage, band: bandNear, wind }),
    foliageDepth: plantDepthMaterial('foliage', { map: atlases.foliage, wind }),
    barkDepth: plantDepthMaterial('bark', { wind }),
  };
  mats.nearFoliage.color.copy(TINT_FOREST);
  mats.midForest.color.copy(TINT_FOREST);
  mats.nearSparse.color.copy(TINT_LONE);
  mats.midSparse.color.copy(TINT_LONE);

  const mk = (geo, mat, depth, cap, name) => {
    const m = new THREE.InstancedMesh(geo, mat, cap);
    m.count = 0;
    m.visible = false;
    m.frustumCulled = false;
    m.castShadow = true;
    m.receiveShadow = true;
    m.customDepthMaterial = depth;
    m.name = name;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(m);
    return m;
  };
  const levels = KINDS.map((v, k) => {
    const sparse = SPARSE(k);
    const L = { near: null, bark: null, mid: null };
    if (nearOn) {
      L.near = mk(builds[k].near.foliage, sparse ? mats.nearSparse : mats.nearFoliage, mats.foliageDepth, tier.capNear, `${v.name}-near`);
      L.bark = mk(builds[k].near.bark, mats.nearBark, mats.barkDepth, tier.capNear, `${v.name}-bark`);
      L.bark.instanceMatrix = L.near.instanceMatrix;
    }
    L.mid = mk(builds[k].mid.foliage, sparse ? mats.midSparse : mats.midForest, mats.foliageDepth, tier.capMid, `${v.name}-mid`);
    return L;
  });

  /* The trees that stand alone, all of them, looked at every refill:
   * a few thousand, against the forest's three hundred thousand, which
   * are read off the grid round the camera. */
  const sparse = [];
  for (let t = 0; t < forest.count; t += 1) {
    if (SPARSE(forest.k[t])) {
      sparse.push(t);
    }
  }

  const put = (arr, i, t) => {
    const s = forest.s[t];
    const c = YAW_COS[forest.yaw[t]] * s;
    const sn = YAW_SIN[forest.yaw[t]] * s;
    const o = i * 16;
    arr[o] = c;
    arr[o + 1] = 0;
    arr[o + 2] = -sn;
    arr[o + 3] = 0;
    arr[o + 4] = 0;
    arr[o + 5] = s;
    arr[o + 6] = 0;
    arr[o + 7] = 0;
    arr[o + 8] = sn;
    arr[o + 9] = 0;
    arr[o + 10] = c;
    arr[o + 11] = 0;
    arr[o + 12] = forest.x[t];
    arr[o + 13] = forest.y[t] - 0.2;
    arr[o + 14] = forest.z[t];
    arr[o + 15] = 1;
  };

  const frustum = new THREE.Frustum();
  const viewProj = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  const here = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const last = new THREE.Vector3(Infinity, 0, 0);
  const lastDir = new THREE.Vector3();
  /* Where a tree's shadow falls, per metre of its height. */
  const shadowRun = new THREE.Vector3();
  if (sunDir) {
    const flat = Math.hypot(sunDir.x, sunDir.z);
    shadowRun.set(-sunDir.x / flat, 0, -sunDir.z / flat).multiplyScalar(flat / Math.max(sunDir.y, 0.2));
  }
  const seen = (t, h, d) => {
    const x = forest.x[t];
    const y = forest.y[t];
    const z = forest.z[t];
    const sx = x + shadowRun.x * h;
    const sz = z + shadowRun.z * h;
    sphere.center.set((x + sx) * 0.5, y + h * 0.5, (z + sz) * 0.5);
    sphere.radius = 0.5 * Math.hypot(sx - x, h, sz - z) + 0.25 * h + 4 + 0.06 * d;
    return frustum.intersectsSphere(sphere);
  };
  const nNear = new Uint32Array(KINDS.length);
  const nMid = new Uint32Array(KINDS.length);
  const stats = {
    near: 0, mid: 0, dropped: 0, refills: 0,
  };
  const reachNear = tier.near + tier.fade;
  const midFrom = Math.max(0, tier.near - tier.fade);
  const take = (t, pos, reach) => {
    const k = forest.k[t];
    const h = KINDS[k].h * forest.s[t];
    const dx = forest.x[t] - pos.x;
    const dy = forest.y[t] + 0.6 * h - pos.y;
    const dz = forest.z[t] - pos.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > reach || !seen(t, h, d)) {
      return;
    }
    const L = levels[k];
    if (nearOn && d < reachNear) {
      if (nNear[k] < tier.capNear) {
        put(L.near.instanceMatrix.array, nNear[k], t);
        nNear[k] += 1;
      } else {
        stats.dropped += 1;
      }
    }
    if (d > midFrom) {
      if (nMid[k] < tier.capMid) {
        put(L.mid.instanceMatrix.array, nMid[k], t);
        nMid[k] += 1;
      } else {
        stats.dropped += 1;
      }
    }
  };

  /* Refilled when the camera has moved three metres or turned two
   * degrees. */
  const update = (camera) => {
    const pos = camera.getWorldPosition(here);
    camera.getWorldDirection(dir);
    if (pos.distanceToSquared(last) < 9 && dir.dot(lastDir) > 0.9994) {
      return;
    }
    last.copy(pos);
    lastDir.copy(dir);
    camera.updateMatrixWorld();
    viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProj);
    nNear.fill(0);
    nMid.fill(0);
    stats.dropped = 0;
    const reach = tier.mid + tier.fade;
    const { n, cell, start, items } = forest.grid;
    const i0 = Math.max(0, Math.floor((pos.x - reach + HALF) / cell));
    const i1 = Math.min(n - 1, Math.floor((pos.x + reach + HALF) / cell));
    const j0 = Math.max(0, Math.floor((pos.z - reach + HALF) / cell));
    const j1 = Math.min(n - 1, Math.floor((pos.z + reach + HALF) / cell));
    for (let j = j0; j <= j1; j += 1) {
      for (let i = i0; i <= i1; i += 1) {
        const c = j * n + i;
        for (let q = start[c]; q < start[c + 1]; q += 1) {
          const t = items[q];
          if (!SPARSE(forest.k[t])) {
            take(t, pos, reach);
          }
        }
      }
    }
    const far = tier.far + tier.fade;
    for (const t of sparse) {
      take(t, pos, far);
    }
    stats.near = 0;
    stats.mid = 0;
    levels.forEach((L, k) => {
      for (const [m, count] of [[L.near, nNear[k]], [L.bark, nNear[k]], [L.mid, nMid[k]]]) {
        if (!m) {
          continue;
        }
        m.count = count;
        m.visible = count > 0;
        m.instanceMatrix.clearUpdateRanges();
        m.instanceMatrix.addUpdateRange(0, count * 16);
        m.instanceMatrix.needsUpdate = true;
      }
      stats.near += nNear[k];
      stats.mid += nMid[k];
    });
    stats.refills += 1;
  };

  const modelTris = KINDS.map((v, k) => ({
    name: v.name,
    near: builds[k].near ? triangles(builds[k].near.foliage) + triangles(builds[k].near.bark) : 0,
    mid: triangles(builds[k].mid.foliage),
  }));
  return {
    update,
    stats,
    modelTris,
    levels,
    dispose() {
      for (const b of builds) {
        for (const g of [b.near?.foliage, b.near?.bark, b.mid.foliage]) {
          if (g) {
            g.dispose();
          }
        }
      }
      for (const m of Object.values(mats)) {
        m.dispose();
      }
    },
  };
}

/* The crowns' cell pattern and the forest's outline, shared by the
 * canopy's colour and its shadow pass. vegCells: the offset from the
 * nearest cell point to p (xy), the gap to the second nearest (z) and the
 * nearest cell's own number (w). vegInside: the forest mask, bilinear at
 * its 10 m, so the outline is the mask's and not the grid's. */
const CROWN_GLSL = /* glsl */ `
${DITHER_GLSL}
uniform vec4 uShellBand;
uniform sampler2D uForest;
uniform float uHalf;
varying vec3 vVegW;
varying vec3 vVegN;
vec2 vegHash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
vec4 vegCells(vec2 g) {
  vec2 ip = floor(g);
  vec2 fp = fract(g);
  float d1 = 8.0;
  float d2 = 8.0;
  vec2 o1 = vec2(0.0);
  float id = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 b = vec2(float(i), float(j));
      vec2 h = vegHash2(ip + b);
      vec2 r = b + 0.15 + 0.7 * h - fp;
      float d = dot(r, r);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        o1 = r;
        id = h.x;
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  return vec4(-o1, sqrt(d2) - sqrt(d1), id);
}
/* The crowns as domes: in each cell a sphere's cap round a jittered
 * point, of its own radius; where caps overlap the higher one shows, so
 * two crowns meet in a crease that curves, and where none reaches is a
 * gap. Returns the dome's slope (xy, clamped), its height over its radius
 * (z, -1 in a gap) and the crown's number (w). */
vec4 vegCaps(vec2 g) {
  vec2 ip = floor(g);
  vec2 fp = fract(g);
  float best = -1.0;
  vec2 slope = vec2(0.0);
  float rr = 1.0;
  float id = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 b = vec2(float(i), float(j));
      vec2 h = vegHash2(ip + b);
      vec2 d = fp - (b + 0.2 + 0.6 * h);
      float r = 0.6 + 0.28 * fract(h.x * 13.7 + h.y * 3.1);
      float q = r * r - dot(d, d);
      if (q > 0.0) {
        float top = sqrt(q);
        if (top > best) {
          best = top;
          slope = d / max(top, 0.25 * r);
          rr = r;
          id = h.y;
        }
      }
    }
  }
  return best < 0.0 ? vec4(0.0, 0.0, -1.0, 0.0) : vec4(slope, best / rr, id);
}
bool vegInside(vec3 w) {
  return texture2D(uForest, (w.xz + uHalf) / (2.0 * uHalf)).r >= 0.5;
}
`;

/* A crown eight metres across (the forest's middle spacing, plant.js), a
 * clump in it under three, a stand of one age eighty. */
const CROWN_M = 8.0;
const CLUMP_M = 2.8;
const STAND_M = 80.0;

const SHELL_VERTEX = /* glsl */ `
vVegW = (modelMatrix * vec4(transformed, 1.0)).xyz;
vVegN = normalize(mat3(modelMatrix) * objectNormal);
`;

function shellMaterial(band, forestTex) {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
    envMapIntensity: 0.6,
  });
  const uniforms = {
    uShellBand: { value: new THREE.Vector4(...band) },
    uForest: { value: forestTex },
    uHalf: { value: HALF },
  };
  mat.userData.shell = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vVegW;\nvarying vec3 vVegN;')
      .replace('#include <project_vertex>', `#include <project_vertex>\n${SHELL_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${CROWN_GLSL}\nvec4 vegCrown;\nvec4 vegClump;\nvec4 vegStand;`)
      .replace('#include <clipping_planes_fragment>', `
        if (!vegInside(vVegW) || !plantKeep(plantHash(gl_FragCoord.xy), distance(cameraPosition, vVegW), uShellBand)) discard;
        {
          /* On the top the pattern lies in the ground's plane; on the
           * edge's face, up it. */
          vec2 p = abs(vVegN.y) > 0.6 ? vVegW.xz : vec2(vVegW.x + vVegW.z, vVegW.y * 1.4);
          vegCrown = vegCaps(p / ${CROWN_M.toFixed(1)});
          vegClump = vegCaps(p / ${CLUMP_M.toFixed(1)} + 17.0);
          vegStand = vegCells(vVegW.xz / ${STAND_M.toFixed(1)} + 5.0);
        }
        #include <clipping_planes_fragment>`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          /* A crown is lit on its dome and dark down its sides and in
           * the gaps; a clump on it the same, less. */
          float dome = vegCrown.z < 0.0 ? 0.35 : mix(0.5, 1.0, sqrt(vegCrown.z));
          float fine = vegClump.z < 0.0 ? 0.8 : mix(0.84, 1.0, vegClump.z);
          float lit = dome * fine * (0.84 + 0.32 * vegCrown.w) * (0.88 + 0.24 * vegStand.w);
          vec3 hue = mix(vec3(0.95, 1.0, 1.06), vec3(1.07, 1.03, 0.88), fract(vegCrown.w * 7.31));
          diffuseColor.rgb *= lit * hue;
        }`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        material.specularF90 = 0.3;
        material.specularColor *= 0.5;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 up = normalize(vVegN);
          vec3 tu = abs(up.y) > 0.6 ? vec3(1.0, 0.0, 0.0) : normalize(vec3(1.0, 0.0, 1.0));
          vec3 tv = abs(up.y) > 0.6 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
          vec2 slope = vegCrown.xy * 0.9 + vegClump.xy * 0.35;
          vec3 nW = normalize(up + tu * slope.x + tv * slope.y);
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }`);
  };
  mat.customProgramCacheKey = () => 'itaipu-canopy';
  return mat;
}

/* The canopy's shadow: the same outline and the same dissolve, from the
 * view's eye, not the light's. */
function shellDepthMaterial(band, eye, forestTex) {
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uShellBand: { value: new THREE.Vector4(...band) },
      uForest: { value: forestTex },
      uHalf: { value: HALF },
      uEye: eye,
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vVegW;\nvarying vec3 vVegN;')
      .replace('#include <project_vertex>', `#include <project_vertex>\nvVegW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvVegN = vec3(0.0, 1.0, 0.0);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${CROWN_GLSL}\nuniform vec3 uEye;`)
      .replace('#include <clipping_planes_fragment>', `
        if (!vegInside(vVegW) || !plantKeep(plantHash(gl_FragCoord.xy), distance(uEye, vVegW), uShellBand)) discard;
        #include <clipping_planes_fragment>`);
  };
  mat.customProgramCacheKey = () => 'itaipu-canopy-depth';
  return mat;
}

/*
 * The canopy over the hero, a mesh per 2560 m hero tile. `topAt(x, z)`
 * is the canopy's height over the ground there, or a negative number
 * where there is no forest; `colourAt(x, z)` the linear reflectance
 * there, [r, g, b]; `ground(x, z)` the terrain; `forest` the mask's
 * forest weight, 0 to 255, 1024 x 1024 over the hero, north row first.
 * Returns the meshes (in `group`), setEye(camera position) and the
 * triangle count.
 */
export function canopyShell({
  ground, topAt, colourAt, forest, tier, group,
}) {
  const band = [tier.mid - tier.fade, tier.mid, 1e9, 2e9];
  const eye = { value: new THREE.Vector3() };
  const forestTex = new THREE.DataTexture(forest, 1024, 1024, THREE.RedFormat, THREE.UnsignedByteType);
  forestTex.magFilter = THREE.LinearFilter;
  forestTex.minFilter = THREE.LinearFilter;
  forestTex.generateMipmaps = false;
  forestTex.needsUpdate = true;
  const mat = shellMaterial(band, forestTex);
  const depth = shellDepthMaterial(band, eye, forestTex);
  const TILE = 2560;
  const step = tier.shell;
  const m = TILE / step;
  const row = m + 1;
  let tris = 0;
  const meshes = [];
  for (let tj = 0; tj < 4; tj += 1) {
    for (let ti = 0; ti < 4; ti += 1) {
      const x0 = -HALF + ti * TILE;
      const z0 = -HALF + tj * TILE;
      const top = new Float32Array(row * row);
      let any = false;
      for (let v = 0; v <= m; v += 1) {
        for (let u = 0; u <= m; u += 1) {
          const h = topAt(x0 + u * step, z0 + v * step);
          top[v * row + u] = h;
          any = any || h >= 0;
        }
      }
      if (!any) {
        continue;
      }
      /* Only the vertices a forest cell uses. Outside the forest a
       * vertex is at the ground, so a cell on the edge is a slope from
       * the canopy down, and the mask's outline (vegInside) cuts it half
       * way: the edge's face. */
      const index = new Int32Array(row * row).fill(-1);
      const pos = [];
      const col = [];
      const idx = [];
      const vert = (u, v) => {
        const k = v * row + u;
        if (index[k] < 0) {
          const x = x0 + u * step;
          const z = z0 + v * step;
          const h = top[k];
          index[k] = pos.length / 3;
          pos.push(x, ground(x, z) + (h >= 0 ? h : -0.5), z);
          const c = colourAt(x, z);
          /* Graded as the ground's forest is, so the two meet unseen. */
          const shade = h >= 0 ? 1 : 0.6;
          col.push(c[0] * shade * FOREST_GRADE[0], c[1] * shade * FOREST_GRADE[1], c[2] * shade * FOREST_GRADE[2]);
        }
        return index[k];
      };
      for (let v = 0; v < m; v += 1) {
        for (let u = 0; u < m; u += 1) {
          const a = top[v * row + u];
          const b = top[v * row + u + 1];
          const c = top[(v + 1) * row + u];
          const d = top[(v + 1) * row + u + 1];
          if (a < 0 && b < 0 && c < 0 && d < 0) {
            continue;
          }
          const ia = vert(u, v);
          const ib = vert(u + 1, v);
          const ic = vert(u, v + 1);
          const id = vert(u + 1, v + 1);
          idx.push(ia, ic, ib, ib, ic, id);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `itaipu-canopy-${ti}-${tj}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.customDepthMaterial = depth;
      group.add(mesh);
      meshes.push(mesh);
      tris += idx.length / 3;
    }
  }
  return {
    meshes,
    tris,
    setEye(p) {
      eye.value.copy(p);
    },
    dispose() {
      mat.dispose();
      depth.dispose();
      forestTex.dispose();
    },
  };
}
