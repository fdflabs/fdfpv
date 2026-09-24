/*
 * grass.js: the meadow under the camera, blade by blade near and gone by
 * the time the terrain's own paint can carry it.
 *
 * Clumps of grass (three crossed cards from the grass atlas, some of them
 * carrying the meadow's flowers) are scattered on tiles sixteen metres
 * square round the camera. A tile is worked out once, when it first comes
 * into range, and kept: its clumps' positions, turns, heights and tints.
 * The instanced draw is refilled from the tiles in range whenever the
 * camera crosses into a new tile. In the shader a clump shrinks into the
 * ground over the outer third of the radius, so the edge of the grass is
 * never a line.
 *
 * What grows where: hay meadow knee high on the valley floor, mown short
 * on the village's plateau, thin and short under the forest, alpine turf
 * above the tree line, nothing on rock, snow, water, the strip, the road
 * or the buildings (layout.coverOff), and lush along the stream's banks.
 * Flowers where the paint puts its flower patches.
 *
 * The cards' normals are the ground's, tipped a little toward the card:
 * lit like the turf it stands in rather than like a stack of paper.
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
import { makeRng, noise2, smoothstep } from '../../alps/noise.js';
import { STRIP_L, TREE_LINE, SNOW_LINE, forestDensity, treeLine } from '../../alps/terrain.js';
import { ALPHA_CUT, GRASS_REGIONS } from './atlas.js';
import { LEAF_SPEC_GLSL } from './plantmat.js';

const TILE = 16;
const REGION_KEYS = ['clump0', 'clump1', 'clump2', 'clump3', 'clump4', 'clump5', 'flower0', 'flower1', 'flower2', 'flower3'];
/* Floats per clump: x, y, z, yaw, height, width, region, tint. */
const STRIDE = 8;

/* Three cards crossed at sixty degrees, a metre wide and a metre high,
 * standing on the origin; the instance scales them. */
function clumpGeometry() {
  const pos = [];
  const uv = [];
  const nrm = [];
  const idx = [];
  for (let k = 0; k < 3; k += 1) {
    const a = (k / 3) * Math.PI + 0.3;
    const cx = Math.cos(a) * 0.5;
    const cz = Math.sin(a) * 0.5;
    const nx = -Math.sin(a);
    const nz = Math.cos(a);
    const base = pos.length / 3;
    for (let r = 0; r <= 1; r += 1) {
      const y = r;
      pos.push(-cx, y, -cz, cx, y, cz);
      uv.push(0, y, 1, y);
      for (let q = 0; q < 2; q += 1) {
        nrm.push(nx * 0.35, 1, nz * 0.35);
      }
    }
    for (let r = 0; r < 1; r += 1) {
      const a0 = base + r * 2;
      idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

/*
 * What the ground at (x, z) grows: the chance a clump stands, its height
 * in metres, and the share of flower clumps. Zero chance where nothing
 * grows.
 */
function coverAt(x, z, heightAt, layout) {
  if (layout.coverOff(x, z) || layout.lakeWet(x, z)) {
    return null;
  }
  const bank = layout.streamDist(x, z);
  if (bank < 3.2) {
    return null;
  }
  const y = heightAt(x, z);
  if (y > SNOW_LINE - 40) {
    return null;
  }
  const sx = (heightAt(x + 2, z) - heightAt(x - 2, z)) / 4;
  const sz = (heightAt(x, z + 2) - heightAt(x, z - 2)) / 4;
  const s = Math.hypot(sx, sz);
  if (s > 1.0) {
    return null;
  }
  const rocky = smoothstep(0.7, 1.0, s);
  const forest = forestDensity(x, y, z, s, sz);
  const line = treeLine(x, z);
  const alpine = smoothstep(line - 60, line + 120, y);
  /* The plateau the terrain holds flat for the strip and the village is
   * mown; its footprint is terrain.js's flat term. */
  const mown = (1 - smoothstep(STRIP_L / 2 + 60, STRIP_L / 2 + 260, Math.abs(z))) * (1 - smoothstep(150, 320, Math.abs(x + 60)));
  let p = 0.95 * (1 - rocky * 0.85) * (1 - 0.7 * forest);
  /* Grazed and mown pasture, ankle high, with hay meadow standing
   * to the knee in patches. */
  const hay = smoothstep(0.55, 0.7, noise2(x / 140 + 3.3, z / 140 + 8.8));
  let h = (0.26 + 0.24 * hay) * (1 - 0.4 * alpine) * (1 - 0.5 * forest);
  h = h * (1 - mown) + 0.13 * mown;
  if (bank < 9) {
    h *= 1.3;
  }
  if (y > TREE_LINE + 250) {
    p *= 0.6;
  }
  const bloom = smoothstep(0.58, 0.7, noise2(x / 34 + 9.1, z / 34 + 3.7)) * (1 - forest) * (1 - mown * 0.8);
  return { p, h, bloom: 0.12 + 0.55 * bloom, forest };
}

function buildTile(ti, tj, heightAt, layout, spacing) {
  const rng = makeRng((ti * 73856093) ^ (tj * 19349663) ^ 0x5bd1e995);
  const out = [];
  const n = Math.floor(TILE / spacing);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const x = ti * TILE + (i + rng()) * spacing;
      const z = tj * TILE + (j + rng()) * spacing;
      const c = coverAt(x, z, heightAt, layout);
      if (!c || rng() > c.p) {
        continue;
      }
      const flower = rng() < c.bloom * 0.35;
      const region = flower ? 6 + Math.floor(rng() * 4) : Math.floor(rng() * 6);
      const h = (flower ? Math.max(0.3, c.h * 1.05) : c.h) * (0.7 + rng() * 0.6);
      const w = flower ? 0.45 : 0.85 + rng() * 0.45;
      const tint = (0.82 + rng() * 0.3) * (1 - 0.3 * c.forest);
      out.push(x, heightAt(x, z) - 0.03, z, rng() * Math.PI * 2, h, w, region, tint);
    }
  }
  return Float32Array.from(out);
}

/*
 * The meadow round the camera. `radius` is where it has shrunk to
 * nothing, `spacing` the jittered grid it is scattered on, `cap` the most
 * clumps drawn at once. Returns the mesh (added to group), update(camera
 * position) and dispose().
 */
export function buildGrass({ heightAt, layout, atlas, wind, radius, spacing, cap, group, tint = [0.82, 0.95, 0.72] }) {
  const base = clumpGeometry();
  const geo = new THREE.InstancedBufferGeometry();
  for (const k of ['position', 'uv', 'normal']) {
    geo.setAttribute(k, base.getAttribute(k));
  }
  geo.setIndex(base.getIndex());
  const data = new Float32Array(cap * STRIDE);
  const buf = new THREE.InstancedInterleavedBuffer(data, STRIDE);
  buf.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aClump', new THREE.InterleavedBufferAttribute(buf, 4, 0));
  geo.setAttribute('aClump2', new THREE.InterleavedBufferAttribute(buf, 4, 4));
  geo.instanceCount = 0;

  const mat = new THREE.MeshStandardMaterial({
    map: atlas,
    alphaTest: ALPHA_CUT,
    side: THREE.DoubleSide,
    roughness: 0.82,
    metalness: 0,
    envMapIntensity: 0.8,
  });
  const regions = REGION_KEYS.map((k) => {
    const r = GRASS_REGIONS[k];
    return new THREE.Vector4(r.u0, r.v0, r.du, r.dv);
  });
  const uniforms = {
    ...wind,
    uRegions: { value: regions },
    uRadius: { value: radius },
    uTint: { value: new THREE.Color(...tint) },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aClump;
        attribute vec4 aClump2;
        uniform float uTime;
        uniform vec2 uWindDir;
        uniform float uWind;
        uniform vec4 uRegions[${REGION_KEYS.length}];
        uniform float uRadius;
        uniform vec3 uTint;
        varying vec3 vGrassTint;
        varying float vGrassUp;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vec4 reg = uRegions[int(aClump2.z + 0.5)];
        vMapUv = reg.xy + uv * reg.zw;`)
      .replace('#include <beginnormal_vertex>', `
        float gc = cos(aClump.w);
        float gs = sin(aClump.w);
        vec3 objectNormal = vec3(gc * normal.x + gs * normal.z, normal.y, -gs * normal.x + gc * normal.z);`)
      .replace('#include <begin_vertex>', `
        float gDist = distance(cameraPosition.xz, aClump.xz);
        /* Each clump has its own edge between half the radius and all
         * of it, so the meadow thins out rather than stopping. */
        float edge = uRadius * (0.5 + 0.5 * fract(aClump.x * 12.9898 + aClump.z * 78.233));
        float grow = 1.0 - smoothstep(edge * 0.75, edge, gDist);
        vec3 p = position * vec3(aClump2.y, aClump2.x * grow, aClump2.y);
        vec3 transformed = aClump.xyz + vec3(gc * p.x + gs * p.z, p.y, -gs * p.x + gc * p.z);
        /* Wind: waves of gusts rolling across the meadow downwind, the
         * blade tips bending most. */
        float along = dot(aClump.xz, uWindDir);
        float wave = 0.5 + 0.5 * sin(along * 0.23 - uTime * 2.1) * sin(along * 0.061 - uTime * 0.7 + aClump.x * 0.02);
        float bend = uv.y * uv.y * aClump2.x * uWind * (0.25 + 0.75 * wave) * 0.55;
        bend += uv.y * aClump2.x * 0.06 * sin(uTime * 3.3 + aClump.x * 1.3 + aClump.z * 1.7);
        transformed.xz += uWindDir * bend;
        transformed.y -= abs(bend) * 0.35 * uv.y;
        vGrassTint = uTint * aClump2.w;
        vGrassUp = uv.y;
        if (grow <= 0.0) transformed = aClump.xyz;`)
      .replace('#include <project_vertex>', `
        vec4 mvPosition = viewMatrix * vec4(transformed, 1.0);
        gl_Position = projectionMatrix * mvPosition;`)
      .replace('#include <worldpos_vertex>', `
        #if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
          vec4 worldPosition = vec4(transformed, 1.0);
        #endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrassTint;\nvarying float vGrassUp;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= vGrassTint * mix(0.38, 1.0, smoothstep(0.0, 0.75, vGrassUp));`)
      .replace('#include <normal_fragment_begin>', `
        float faceDirection = gl_FrontFacing ? 1.0 : -1.0;
        vec3 normal = normalize(vNormal);
        vec3 nonPerturbedNormal = normal;`)
      .replace('#include <lights_physical_fragment>', LEAF_SPEC_GLSL)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        #if NUM_DIR_LIGHTS > 0
        {
          vec3 L = directionalLights[0].direction;
          float into = pow(saturate(dot(-geometryViewDir, L)), 3.0);
          reflectedLight.directDiffuse += directionalLights[0].color * material.diffuseColor * 0.3 * (0.2 + into);
        }
        #endif`);
  };
  mat.customProgramCacheKey = () => 'swiss2-grass';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = 'swiss2-grass';
  group.add(mesh);

  const tiles = new Map();
  let lastKey = '';
  const stats = { clumps: 0, tiles: 0 };
  const update = (pos) => {
    const ci = Math.floor(pos.x / TILE);
    const cj = Math.floor(pos.z / TILE);
    /* Above the grass's radius there is nothing to draw. */
    const ground = heightAt(pos.x, pos.z);
    if (pos.y - ground > radius) {
      geo.instanceCount = 0;
      lastKey = '';
      return;
    }
    const key = `${ci},${cj}`;
    if (key === lastKey) {
      return;
    }
    lastKey = key;
    const span = Math.ceil(radius / TILE) + 1;
    let n = 0;
    const keep = new Set();
    for (let dj = -span; dj <= span; dj += 1) {
      for (let di = -span; di <= span; di += 1) {
        const ti = ci + di;
        const tj = cj + dj;
        const cx = (ti + 0.5) * TILE - pos.x;
        const cz = (tj + 0.5) * TILE - pos.z;
        if (Math.hypot(cx, cz) > radius + TILE * 0.75) {
          continue;
        }
        const tk = `${ti},${tj}`;
        keep.add(tk);
        let t = tiles.get(tk);
        if (!t) {
          t = buildTile(ti, tj, heightAt, layout, spacing);
          tiles.set(tk, t);
        }
        const room = Math.min(t.length, (cap - n) * STRIDE);
        data.set(t.subarray(0, room), n * STRIDE);
        n += room / STRIDE;
      }
    }
    /* Tiles well out of range are forgotten, so a long flight does not
     * keep the whole valley's grass. */
    if (tiles.size > keep.size * 3) {
      for (const k of tiles.keys()) {
        if (!keep.has(k)) {
          tiles.delete(k);
        }
      }
    }
    geo.instanceCount = n;
    buf.clearUpdateRanges();
    buf.addUpdateRange(0, n * STRIDE);
    buf.needsUpdate = true;
    stats.clumps = n;
    stats.tiles = keep.size;
  };
  return {
    mesh,
    update,
    stats,
    dispose() {
      geo.dispose();
      base.dispose();
      mat.dispose();
    },
  };
}
