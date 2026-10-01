/*
 * night.js: Itaipu lit at night for mission 4, "Night raid", and its
 * lights going out where the war hits the grid (src/share/war/grid.js).
 * Laid over the day's geometry once every part is built, never touching
 * it, and never built for `time` 'day' (look/index.js's gate).
 *
 * WHAT IS LIT:
 *
 *   street lamps   every lamp the map stands (the dam's crest lamps, read
 *                  back from dam/index.js's instanced mesh by name, and
 *                  the dressed road's, town.lampsAt), and a lamp every
 *                  STREET_SPACING metres along every town road
 *                  (STREET_CLASSES) that runs through built up ground
 *                  (BUILT_CELL): a glowing head over the road's edge and
 *                  a pool of light on the road under it. These have no
 *                  post: a post is a collider (the town's streamed set,
 *                  not this file's), and at night the head and its pool
 *                  are what a lamp is;
 *   windows        every building wall of the town's (its `render` batch,
 *                  itaipu-town-render-c-b), lit in the shader: a window
 *                  every WINDOW_W by WINDOW_H metres, each on or off by a
 *                  hash of its building's cell and its place on the wall,
 *                  a building's share of lit rooms and its rooms' colour
 *                  hashed too, and one building in a few wholly dark;
 *   the station    the powerhouse roof floodlit and its downstream face
 *                  by two real lights over the tailrace, the substations'
 *                  yards (osm/power.json) by masts on a grid;
 *   aviation       a red light blinking on every tower taller than
 *                  AVIATION_H;
 *   past the map   the cities the hero square does not build (grid.js's
 *                  `ring` districts: Foz do Iguacu's and Ciudad del Este's
 *                  centres and the towns round them) as a carpet of
 *                  points on the ring's ground;
 *   the sky        a warm glow over every lit town, on the cloud deck's
 *                  base and in the clear air above it (sky.js).
 *
 * WHY IT COSTS NEXT TO NOTHING. Section 13's budget (300 draw calls, 2.5 M
 * triangles a view) and the GPU's: every glowing thing is a point of a
 * THREE.Points (four draw calls in all, no triangles), sized in metres
 * but never under a pixel or two so a town reads from the air; every
 * pool is a texel of one RG texture over the hero square (POOL_PX), the
 * light it pours and the height it lies at, which every lit material
 * adds to its diffuse light in its own shader (cityLight), falling off
 * above and below that height so a crest pool does not light the face
 * under it; the windows are arithmetic in the walls' own shader. The
 * only real lights are the powerhouse's two.
 *
 * THE OUTAGES. Each point, pool, window and the sky's glow is in a
 * district of grid.js (districtOf, the same Voronoi cells, in the shader
 * and here), and its brightness is its district's level, which setPower
 * hands over each frame from the room's war state (src/main.js).
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
import { DISTRICTS, MAX_DISTRICTS, districtOf } from '../../../share/war/grid.js';

/* The dam's own instanced lamp mesh (dam/index.js instanced(), 'lamps'),
 * read by name, and where its lamp's lens is in an instance's frame:
 * dam/index.js LAMP, the head box at (arm, height - 0.25), 0.18 deep. */
const DAM_LAMP_MESH = 'itaipu-dam-lamps';
const DAM_LAMP_LENS = new THREE.Vector3(2.4, 9.62, 0);
/* The town's walls, the render batch of the buildings that cast
 * (town/mesh.js names a batch group-cast-road). */
const TOWN_WALLS = 'itaipu-town-render-c-b';

/* Radiance, not display colour: a point's colour over 1 is a brighter
 * light, which swiss2/post.js's bloom (threshold 6.0, tuned for the sun's
 * disc) catches after the night's dark meter key (light.js) has turned
 * everything else down. */
const LAMP_RADIANCE = [9, 6.4, 3.1];
const MAST_RADIANCE = [7.5, 7.8, 8.2];
const AVIATION_RADIANCE = [14, 0.6, 0.3];
/* The cities past the map: sodium and LED, mixed. */
const RING_RADIANCE = [[3.2, 2.1, 0.9], [2.6, 2.5, 2.3]];

/* Points: the light's size in metres, and the fewest pixels it covers. */
const LAMP_M = 0.5;
const MAST_M = 1.4;
const AVIATION_M = 1.6;
const RING_M = 6;
const MIN_PX = 2;

/* The streets: which classes of road are lit (OSM's highway), a lamp
 * every STREET_SPACING metres on the right of the way, its head
 * STREET_HEAD over the ground and STREET_REACH in from the road's edge;
 * only where a building stands within a BUILT_CELL cell or the eight
 * round it; never within DAM_CLEAR of a dam lamp (the crest road is the
 * dam's) or STREET_CLEAR of another lamp. */
const STREET_CLASSES = new Set([
  'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link',
  'residential', 'unclassified', 'living_street',
]);
const STREET_SPACING = 32;
const STREET_HEAD = 8;
const STREET_REACH = 1;
const BUILT_CELL = 120;
const DAM_CLEAR = 40;
const STREET_CLEAR = 12;

/* Masts over a substation's yard, every MAST_SPACING metres, MAST_H up. */
const MAST_SPACING = 45;
const MAST_H = 15;
/* A tower this tall or more carries a red light on its top. Metres. */
const AVIATION_H = 45;

/* The powerhouse roof's floodlights: rows POWERHOUSE_ROWS metres either
 * side of its axis, every POWERHOUSE_SPACING along it; and its two real
 * lights over the tailrace, FACE_OUT downstream of its downstream wall
 * (dam/index.js POWERHOUSE, half width 49.5) at FACE_Y. */
const POWERHOUSE_HALF = 49.5;
const POWERHOUSE_ROWS = [-25, 25];
const POWERHOUSE_SPACING = 30;
const FACE_OUT = 60;
const FACE_Y = 140;
const FACE_COLOR = new THREE.Color(0.85, 0.9, 1.0);
const FACE_INTENSITY = 5000;
const FACE_RANGE = 160;

/*
 * The pools: one texel per POOL_M metres over the hero square, R the
 * light poured there (a lamp's peak is POOL_PEAK of it, summed and
 * clamped), G the height it lies at between POOL_Y[0] and POOL_Y[1],
 * as each pool's weight averages it. A pool is round, `r` metres to its
 * edge, a smooth bump. Each surface takes POOL_IRR of irradiance at R 1,
 * in POOL_COLOR, while it is within POOL_ABOVE over the pool's height
 * or POOL_BELOW under it, faded to nothing across that band.
 */
const POOL_PX = 2048;
const POOL_PEAK = 0.6;
const POOL_Y = [60, 320];
const POOL_IRR = 7;
const POOL_COLOR = new THREE.Color(1.0, 0.74, 0.46);
const POOL_ABOVE = 12;
const POOL_BELOW = 3;
const POOL_R = { street: 15, dam: 16, mast: 26, roof: 26 };

/* Windows: a bay WINDOW_W wide and a storey WINDOW_H tall from FLOOR_0
 * over the ground, the pane the middle of each (WINDOW_PANE, as shares
 * of the bay); a building is a WINDOW_CELL cell of the walls behind it.
 * DARK_SHARE of the cells are wholly dark, the rest light between
 * LIT_SHARE[0] and LIT_SHARE[1] of their windows. WINDOW_RAD is the
 * pane's radiance at full. */
const WINDOW_W = 2.9;
const WINDOW_H = 3.1;
const FLOOR_0 = 0.5;
const WINDOW_PANE = [0.2, 0.8, 0.3, 0.8];
const WINDOW_CELL = 22;
const DARK_SHARE = 0.15;
const LIT_SHARE = [0.12, 0.7];
const WINDOW_RAD = 1.1;

/* The cities past the map: points per square kilometre at the middle,
 * thinning to the city's radius. */
const RING_DENSITY = 600;

/* Shared by every shader here and the sky: each district's level, its
 * Voronoi seed, the count. */
function districtUniforms() {
  const seeds = [];
  const radii = new Float32Array(MAX_DISTRICTS);
  for (let i = 0; i < MAX_DISTRICTS; i += 1) {
    const d = DISTRICTS[i];
    seeds.push(new THREE.Vector2(d ? d.at[0] : 1e9, d ? d.at[1] : 1e9));
    radii[i] = d && d.r ? d.r : 0;
  }
  return {
    uCityLevel: { value: new Float32Array(MAX_DISTRICTS).fill(1) },
    uCitySeed: { value: seeds },
    uCityR: { value: radii },
    uCityCount: { value: DISTRICTS.length },
  };
}

/* The district lookup, as grid.js districtOf. */
export const DISTRICT_GLSL = /* glsl */ `
  uniform float uCityLevel[${MAX_DISTRICTS}];
  uniform vec2 uCitySeed[${MAX_DISTRICTS}];
  uniform int uCityCount;
  float cityLevelAt(vec2 xz) {
    float best = 3.4e38;
    int k = 0;
    for (int i = 0; i < ${MAX_DISTRICTS}; i++) {
      if (i >= uCityCount) {
        break;
      }
      vec2 d = xz - uCitySeed[i];
      float d2 = dot(d, d);
      if (d2 < best) {
        best = d2;
        k = i;
      }
    }
    return uCityLevel[k];
  }
`;

const fmt = (v) => v.toFixed(4);
const vec3Of = (c) => `vec3(${fmt(c[0])}, ${fmt(c[1])}, ${fmt(c[2])})`;

/* What every lit material gets at night: the pools, and on the town's
 * walls the windows. Its world position from the vertex's own
 * mvPosition, whatever instancing or batching put it there. */
const CITY_PARS = /* glsl */ `
  ${DISTRICT_GLSL}
  uniform sampler2D uCityPools;
  uniform float uCityHalf;
  varying vec3 vCityW;
  float cityHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  vec3 cityGeoNormal() {
    return normalize(cross(dFdx(vCityW), dFdy(vCityW)));
  }
  /* The pools' irradiance at this fragment, POOL_COLOR times it. */
  vec3 cityPool(vec3 n) {
    vec2 uv = (vCityW.xz + uCityHalf) / (2.0 * uCityHalf);
    if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) {
      return vec3(0.0);
    }
    vec2 pool = texture2D(uCityPools, uv).rg;
    if (pool.r < 0.002) {
      return vec3(0.0);
    }
    float dy = vCityW.y - mix(${fmt(POOL_Y[0])}, ${fmt(POOL_Y[1])}, pool.g);
    float band = dy >= 0.0 ? 1.0 - dy / ${fmt(POOL_ABOVE)} : 1.0 + dy / ${fmt(POOL_BELOW)};
    float facing = 0.25 + 0.75 * max(n.y, 0.0);
    return ${vec3Of([POOL_COLOR.r, POOL_COLOR.g, POOL_COLOR.b])} * (${fmt(POOL_IRR)} * pool.r * clamp(band, 0.0, 1.0) * facing * cityLevelAt(vCityW.xz));
  }
`;

const WINDOW_PARS = /* glsl */ `
  uniform highp sampler2D uCityHeight;
  uniform vec3 uCityGrid;
  float cityBox(float f, float a, float b, float w) {
    return smoothstep(a - w, a + w, f) * (1.0 - smoothstep(b - w, b + w, f));
  }
  /* n is the face's own normal, the vertex's (a wall is flat), not the
   * normal map's or the derivatives': along is a dot with the world
   * position, kilometres from the origin, so a direction off by a
   * hundredth moves a window by metres and the wall turns to noise. */
  vec3 cityWindows(vec3 n) {
    if (abs(n.y) > 0.35) {
      return vec3(0.0);
    }
    vec2 g = (vCityW.xz + uCityGrid.x) / uCityGrid.y;
    float groundY = texture2D(uCityHeight, (g + 0.5) / uCityGrid.z).r;
    float h = vCityW.y - groundY - ${fmt(FLOOR_0)};
    if (h < 0.0) {
      return vec3(0.0);
    }
    vec2 t = normalize(vec2(-n.z, n.x));
    vec2 bay = vec2(dot(vCityW.xz, t) / ${fmt(WINDOW_W)}, h / ${fmt(WINDOW_H)});
    vec2 id = floor(bay);
    vec2 f = fract(bay);
    vec2 cell = floor((vCityW.xz - n.xz * 2.0) / ${fmt(WINDOW_CELL)});
    float hb = cityHash(cell);
    float share = hb < ${fmt(DARK_SHARE)} ? 0.0 : mix(${fmt(LIT_SHARE[0])}, ${fmt(LIT_SHARE[1])}, cityHash(cell + 17.31));
    float hw = cityHash(id + cell * vec2(131.0, 71.0));
    float on = step(hw, share);
    vec2 w = fwidth(bay);
    float pane = cityBox(f.x, ${fmt(WINDOW_PANE[0])}, ${fmt(WINDOW_PANE[1])}, w.x) * cityBox(f.y, ${fmt(WINDOW_PANE[2])}, ${fmt(WINDOW_PANE[3])}, w.y);
    float hc = cityHash(id * 0.37 + cell * 5.3 + 2.1);
    vec3 col = hc < 0.55 ? vec3(1.0, 0.6, 0.28) : hc < 0.85 ? vec3(1.0, 0.82, 0.58) : hc < 0.96 ? vec3(0.78, 0.86, 1.0) : vec3(0.45, 0.6, 1.0);
    /* Past a pixel a bay, the average of the wall: the share lit times
     * the pane's area, in the mean colour, rather than a shimmer. */
    float far = smoothstep(0.35, 0.9, max(w.x, w.y));
    float area = ${fmt((WINDOW_PANE[1] - WINDOW_PANE[0]) * (WINDOW_PANE[3] - WINDOW_PANE[2]))};
    float lit = mix(on * pane, share * area, far);
    col = mix(col, vec3(1.0, 0.72, 0.42), far);
    return col * (${fmt(WINDOW_RAD)} * lit * cityLevelAt(vCityW.xz));
  }
`;

/*
 * Night's light into `mat`, a lit material (its shader has
 * lights_fragment_end): the pools on everything, the windows where
 * `windows`. Chained before whatever the material compiles with, and
 * its program keyed apart from the day's and from the walls'.
 */
function cityLight(mat, uniforms, windows) {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey();
  mat.onBeforeCompile = function onBeforeCompile(shader, renderer) {
    prev.call(this, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    if (!shader.vertexShader.includes('#include <project_vertex>') || !shader.fragmentShader.includes('#include <lights_fragment_end>')) {
      throw new Error(`itaipu night: ${mat.type} ${mat.name} has no place for the city's light`);
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCityW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvCityW = (inverse(viewMatrix) * mvPosition).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${CITY_PARS}${windows ? WINDOW_PARS : ''}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.directDiffuse += cityPool(cityGeoNormal()) * BRDF_Lambert(material.diffuseColor);`);
    if (windows) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += cityWindows(inverseTransformDirection(normalize(vNormal), viewMatrix));`);
    }
  };
  mat.customProgramCacheKey = () => `${prevKey}|city${windows ? 'w' : ''}`;
  mat.needsUpdate = true;
}

const LIT_TYPES = new Set(['MeshStandardMaterial', 'MeshPhysicalMaterial', 'MeshLambertMaterial', 'MeshPhongMaterial', 'MeshToonMaterial']);

/* The glow points' shader: sized in metres, never under MIN_PX, round,
 * added over what is behind; each point's district dims it, and a
 * blinking set (uBlink) is on half of each 1.4 s, its phase per point. */
function glowMaterial(uniforms, sizeM, { blink = false } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...uniforms,
      uSize: { value: sizeM },
      uMinPx: { value: MIN_PX },
      uHalfH: { value: 450 },
      uBlink: { value: blink ? 1 : 0 },
      uTime: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uCityLevel[${MAX_DISTRICTS}];
      uniform float uSize;
      uniform float uMinPx;
      uniform float uHalfH;
      uniform float uBlink;
      uniform float uTime;
      attribute float aDistrict;
      attribute vec3 aColor;
      varying vec3 vCol;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float lv = uCityLevel[int(aDistrict + 0.5)];
        if (uBlink > 0.5) {
          lv = step(0.5, fract(uTime / 1.4 + fract(position.x * 0.013 + position.z * 0.007)));
        }
        float px = uSize * projectionMatrix[1][1] * uHalfH / max(-mv.z, 0.1);
        /* A light smaller than its least pixels is that many pixels,
         * dimmer by how much smaller, but never under a quarter. */
        vCol = aColor * lv * clamp(px / uMinPx, 0.25, 1.0);
        gl_PointSize = lv > 0.001 ? max(px, uMinPx) : 0.0;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vCol;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float r2 = dot(c, c) * 4.0;
        if (r2 > 1.0) {
          discard;
        }
        float a = 1.0 - r2;
        gl_FragColor = vec4(vCol * (a * a), 1.0);
      }
    `,
  });
}

/* A THREE.Points of `pts` ([x, y, z, colour [r, g, b]]...), each in the
 * district round it. */
function glowPoints(pts, material, name) {
  const pos = new Float32Array(pts.length * 3);
  const col = new Float32Array(pts.length * 3);
  const dis = new Float32Array(pts.length);
  pts.forEach((p, i) => {
    pos.set([p[0], p[1], p[2]], i * 3);
    col.set(p[3], i * 3);
    dis[i] = districtOf(p[0], p[2]);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aDistrict', new THREE.BufferAttribute(dis, 1));
  g.computeBoundingSphere();
  const points = new THREE.Points(g, material);
  points.name = name;
  /* The point size needs the target's height: the mirror's is not the
   * screen's. */
  const size = new THREE.Vector2();
  points.onBeforeRender = (renderer) => {
    const rt = renderer.getRenderTarget();
    material.uniforms.uHalfH.value = (rt ? rt.height : renderer.getDrawingBufferSize(size).y) / 2;
    material.uniforms.uTime.value = performance.now() / 1000;
  };
  return points;
}

/* A grid of [x, z] every `step` metres inside `ring` ([[x, z]...]). */
function gridInside(ring, step) {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const [x, z] of ring) {
    x0 = Math.min(x0, x);
    z0 = Math.min(z0, z);
    x1 = Math.max(x1, x);
    z1 = Math.max(z1, z);
  }
  const inside = (x, z) => {
    let k = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, zi] = ring[i];
      const [xj, zj] = ring[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
        k = !k;
      }
    }
    return k;
  };
  const out = [];
  for (let z = z0 + step / 2; z < z1; z += step) {
    for (let x = x0 + step / 2; x < x1; x += step) {
      if (inside(x, z)) {
        out.push([x, z]);
      }
    }
  }
  return out;
}

/* A hash of two integers to [0, 1), the same everywhere. */
function hash2(a, b) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/*
 * The street lamps the town's roads get at night: [{ head: [x, y, z],
 * pool: [x, y, z] }]. `roads` is osm/roads.json's features, `buildings`
 * town.buildings ({ x, z }), `avoid` the lamps already standing (the
 * dam's and the dressed road's, [x, y, z]).
 */
function streetLamps(roads, buildings, avoid, ground, half) {
  const built = new Set();
  for (const b of buildings) {
    built.add(`${Math.floor(b.x / BUILT_CELL)},${Math.floor(b.z / BUILT_CELL)}`);
  }
  const builtNear = (x, z) => {
    const i = Math.floor(x / BUILT_CELL);
    const j = Math.floor(z / BUILT_CELL);
    for (let a = -1; a <= 1; a += 1) {
      for (let b = -1; b <= 1; b += 1) {
        if (built.has(`${i + a},${j + b}`)) {
          return true;
        }
      }
    }
    return false;
  };
  /* Every lamp so far in a hash of DAM_CLEAR cells, for the clearances. */
  const near = new Map();
  const cellKey = (x, z) => `${Math.floor(x / DAM_CLEAR)},${Math.floor(z / DAM_CLEAR)}`;
  const put = (x, z, dam) => {
    const k = cellKey(x, z);
    if (!near.has(k)) {
      near.set(k, []);
    }
    near.get(k).push([x, z, dam]);
  };
  const clearOf = (x, z) => {
    const i = Math.floor(x / DAM_CLEAR);
    const j = Math.floor(z / DAM_CLEAR);
    for (let a = -1; a <= 1; a += 1) {
      for (let b = -1; b <= 1; b += 1) {
        for (const [px, pz, dam] of near.get(`${i + a},${j + b}`) || []) {
          const d2 = (px - x) ** 2 + (pz - z) ** 2;
          if (d2 < (dam ? DAM_CLEAR * DAM_CLEAR : STREET_CLEAR * STREET_CLEAR)) {
            return false;
          }
        }
      }
    }
    return true;
  };
  for (const [x, , z, dam] of avoid) {
    put(x, z, dam);
  }
  const out = [];
  for (const f of roads) {
    if (f.square === 'ring' || f.onDam || f.bridge || f.tunnel || !STREET_CLASSES.has(f.highway)) {
      continue;
    }
    const off = f.width / 2 - STREET_REACH;
    let next = STREET_SPACING / 2;
    let walked = 0;
    for (let k = 0; k + 1 < f.points.length; k += 1) {
      const [ax, az] = f.points[k];
      const [bx, bz] = f.points[k + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (!(len > 1e-6)) {
        continue;
      }
      /* The right of the way, walked from its first point. */
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      while (next <= walked + len) {
        const u = (next - walked) / len;
        const x = ax + (bx - ax) * u + nx * off;
        const z = az + (bz - az) * u + nz * off;
        next += STREET_SPACING;
        if (Math.abs(x) > half || Math.abs(z) > half || !builtNear(x, z) || !clearOf(x, z)) {
          continue;
        }
        const y = ground(x, z);
        if (!Number.isFinite(y)) {
          continue;
        }
        put(x, z, false);
        out.push({ head: [x, y + STREET_HEAD, z], pool: [x, y, z] });
      }
      walked += len;
    }
  }
  return out;
}

/* The pools into a POOL_PX square RG texture over [-half, half]. */
function poolTexture(pools, half) {
  const n = POOL_PX;
  const m = (2 * half) / n;
  const light = new Float32Array(n * n);
  const ySum = new Float32Array(n * n);
  for (const [x, y, z, r, peak] of pools) {
    const ci = (x + half) / m - 0.5;
    const cj = (z + half) / m - 0.5;
    const reach = r / m;
    const i0 = Math.max(0, Math.floor(ci - reach));
    const i1 = Math.min(n - 1, Math.ceil(ci + reach));
    const j0 = Math.max(0, Math.floor(cj - reach));
    const j1 = Math.min(n - 1, Math.ceil(cj + reach));
    for (let j = j0; j <= j1; j += 1) {
      for (let i = i0; i <= i1; i += 1) {
        const d2 = ((i - ci) ** 2 + (j - cj) ** 2) / (reach * reach);
        if (d2 >= 1) {
          continue;
        }
        const w = peak * (1 - d2) * (1 - d2);
        light[j * n + i] += w;
        ySum[j * n + i] += w * y;
      }
    }
  }
  const data = new Uint8Array(n * n * 2);
  for (let k = 0; k < n * n; k += 1) {
    const l = light[k];
    if (l <= 0) {
      continue;
    }
    const y = ySum[k] / l;
    data[k * 2] = Math.round(Math.min(1, l) * 255);
    data[k * 2 + 1] = Math.round(Math.max(0, Math.min(1, (y - POOL_Y[0]) / (POOL_Y[1] - POOL_Y[0]))) * 255);
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/* Each instance's lens in the world, out of the dam's lamp mesh. */
function damLenses(mesh) {
  const out = [];
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const foot = new THREE.Vector3();
  for (let i = 0; i < mesh.count; i += 1) {
    mesh.getMatrixAt(i, m);
    v.copy(DAM_LAMP_LENS).applyMatrix4(m);
    foot.setFromMatrixPosition(m);
    out.push({ head: [v.x, v.y, v.z], pool: [v.x, foot.y, v.z] });
  }
  return out;
}

/* The cities past the map, as points on the ring's ground: denser at the
 * middle, none past the radius, scattered by hash. */
function ringCities(ground) {
  const out = [];
  DISTRICTS.forEach((d, di) => {
    if (!d.ring) {
      return;
    }
    const n = Math.round(RING_DENSITY * Math.PI * (d.r / 1000) ** 2 * 0.5);
    for (let k = 0; k < n; k += 1) {
      /* Radius by the square root of a hash squared: crowded in the
       * middle, thin to the edge. */
      const u = hash2(di * 7919 + 1, k);
      const a = hash2(di * 7919 + 2, k) * 2 * Math.PI;
      const r = d.r * u;
      const x = d.at[0] + r * Math.cos(a);
      const z = d.at[1] + r * Math.sin(a);
      const y = ground(x, z);
      if (!Number.isFinite(y)) {
        continue;
      }
      out.push([x, y + 4, z, RING_RADIANCE[hash2(di, k) < 0.6 ? 0 : 1]]);
    }
  });
  return out;
}

/*
 * The night, once every part is built and in `scene`. `ground(x, z)` the
 * finest terrain; `half` the hero square's half side; `roads`
 * osm/roads.json's features; `town` the town part's model (buildings,
 * structures, lampsAt); `substations` osm/power.json's; `powerhouse`
 * dam.json's powerhouse ({ axis, figures.roofY }); `heights` the look's
 * ground heights uniform ({ texture, grid }), for the windows; `materials`
 * the lit materials not in the scene's graph yet (the terrain's). Returns
 * { group, setPower(levels), stats(), dispose() }; `group` is in `scene`.
 */
export function dressNight({
  scene, ground, half, roads, town, substations, powerhouse, heights, materials = [],
}) {
  const group = new THREE.Group();
  group.name = 'itaipu-night';
  const uniforms = districtUniforms();
  const owned = [];

  const damMesh = scene.getObjectByName(DAM_LAMP_MESH);
  const dam = damMesh ? damLenses(damMesh) : [];
  const dressed = town.lampsAt.map((p) => ({ head: [p[0], p[1] - 0.2, p[2]], pool: [p[0], ground(p[0], p[2]), p[2]] }));
  const streets = streetLamps(
    roads,
    town.buildings,
    [...dam.map((l) => [...l.head, true]), ...dressed.map((l) => [...l.head, false])],
    ground,
    half,
  );

  const masts = [];
  for (const s of substations) {
    for (const [x, z] of gridInside(s.outer, MAST_SPACING)) {
      if (Math.abs(x) < half && Math.abs(z) < half) {
        const y = ground(x, z);
        masts.push({ head: [x, y + MAST_H, z], pool: [x, y, z] });
      }
    }
  }

  /* The powerhouse roof, along its axis. */
  const roof = [];
  const faces = [];
  if (powerhouse) {
    const axis = powerhouse.axis;
    const y = powerhouse.figures.roofY;
    for (let k = 0; k + 1 < axis.length; k += 1) {
      const [ax, az] = axis[k];
      const [bx, bz] = axis[k + 1];
      const len = Math.hypot(bx - ax, bz - az);
      /* Downstream: the side of the axis away from the reservoir, +z. */
      let nx = -(bz - az) / len;
      let nz = (bx - ax) / len;
      if (nz < 0) {
        nx = -nx;
        nz = -nz;
      }
      for (let t = POWERHOUSE_SPACING / 2; t < len; t += POWERHOUSE_SPACING) {
        for (const s of POWERHOUSE_ROWS) {
          const x = ax + ((bx - ax) * t) / len + nx * s;
          const z = az + ((bz - az) * t) / len + nz * s;
          roof.push({ head: [x, y + 6, z], pool: [x, y, z] });
        }
      }
      if (k === 0) {
        for (const t of [len * 0.3, len * 0.75]) {
          const out = POWERHOUSE_HALF + FACE_OUT;
          faces.push([ax + ((bx - ax) * t) / len + nx * out, FACE_Y, az + ((bz - az) * t) / len + nz * out]);
        }
      }
    }
  }

  const aviation = [];
  for (const s of town.structures) {
    if (s.kind === 'tower' && s.size.h >= AVIATION_H) {
      aviation.push([s.x, s.y + s.size.h + 0.6, s.z, AVIATION_RADIANCE]);
    }
  }
  const ring = ringCities(ground);

  /* The pools, then the texture every lit material reads. */
  const pools = [
    ...streets.map((l) => [...l.pool, POOL_R.street, POOL_PEAK]),
    ...dressed.map((l) => [...l.pool, POOL_R.street, POOL_PEAK]),
    ...dam.map((l) => [...l.pool, POOL_R.dam, POOL_PEAK]),
    ...masts.map((l) => [...l.pool, POOL_R.mast, POOL_PEAK]),
    ...roof.map((l) => [...l.pool, POOL_R.roof, POOL_PEAK]),
  ];
  const poolTex = poolTexture(pools, half);
  owned.push(poolTex);

  const cityUniforms = {
    ...uniforms,
    uCityPools: { value: poolTex },
    uCityHalf: { value: half },
  };
  const wallUniforms = {
    ...cityUniforms,
    uCityHeight: heights.texture,
    uCityGrid: heights.grid,
  };
  const walls = new Set();
  const wallMesh = scene.getObjectByName(TOWN_WALLS);
  if (wallMesh) {
    walls.add(wallMesh.material);
  }
  const lit = new Set(materials);
  scene.traverse((o) => {
    if (!o.isMesh) {
      return;
    }
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m && LIT_TYPES.has(m.type)) {
        lit.add(m);
      }
    }
  });
  for (const m of lit) {
    cityLight(m, walls.has(m) ? wallUniforms : cityUniforms, walls.has(m));
  }

  const lampPts = [
    ...[...streets, ...dressed, ...dam, ...roof].map((l) => [...l.head, LAMP_RADIANCE]),
  ];
  const mastPts = masts.map((l) => [...l.head, MAST_RADIANCE]);
  const glows = [
    glowPoints(lampPts, glowMaterial(uniforms, LAMP_M), 'itaipu-night-lamps'),
    glowPoints(mastPts, glowMaterial(uniforms, MAST_M), 'itaipu-night-masts'),
    glowPoints(aviation, glowMaterial(uniforms, AVIATION_M, { blink: true }), 'itaipu-night-aviation'),
    glowPoints(ring, glowMaterial(uniforms, RING_M), 'itaipu-night-cities'),
  ].filter((p) => p.geometry.getAttribute('position').count > 0);
  for (const p of glows) {
    group.add(p);
  }

  /* The powerhouse's two real lights, each in its district. */
  const lights = faces.map((p) => {
    const light = new THREE.PointLight(FACE_COLOR, FACE_INTENSITY, FACE_RANGE, 2);
    light.position.set(p[0], p[1], p[2]);
    group.add(light);
    return { light, district: districtOf(p[0], p[2]) };
  });

  /* The sky's glow over the towns: the same levels (sky.js). */
  const sky = scene.getObjectByName('sky');
  if (sky && sky.material.uniforms.uCityOn) {
    const su = sky.material.uniforms;
    su.uCityOn.value = 1;
    su.uCityLevel.value = uniforms.uCityLevel.value;
    su.uCitySeed.value = uniforms.uCitySeed.value;
    su.uCityR.value = uniforms.uCityR.value;
    su.uCityCount.value = uniforms.uCityCount.value;
  }

  scene.add(group);

  const counts = {
    streetLamps: streets.length,
    damLamps: dam.length,
    roadLamps: dressed.length,
    roofLights: roof.length,
    masts: masts.length,
    aviation: aviation.length,
    ringPoints: ring.length,
    pools: pools.length,
    litMaterials: lit.size,
    windowMaterials: walls.size,
    realLights: lights.length,
    drawCalls: glows.length,
  };
  return {
    group,
    /* Each district's level, 0 to 1, grid.js's order (src/main.js, from
     * the room's war state). */
    setPower(levels) {
      const to = uniforms.uCityLevel.value;
      for (let i = 0; i < DISTRICTS.length; i += 1) {
        to[i] = levels[i];
      }
      for (const l of lights) {
        l.light.intensity = FACE_INTENSITY * to[l.district];
      }
    },
    levels: () => Array.from(uniforms.uCityLevel.value.slice(0, DISTRICTS.length)),
    stats: () => ({ ...counts }),
    dispose() {
      for (const p of glows) {
        p.geometry.dispose();
        p.material.dispose();
      }
      for (const t of owned) {
        t.dispose();
      }
      group.clear();
    },
  };
}
