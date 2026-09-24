/*
 * rocks.js: the boulders under the cliffs, on the scree and along the
 * torrent, as photogrammetry scans rather than icosahedra.
 *
 * Four stones from a CC0 scanned set (docs/SWISS2-ASSETS-VEG.md),
 * decimated offline to nine hundred triangles for near and a hundred and
 * sixty for far, each normalised to a metre across and standing on its
 * own base. Placed by nature.js's rules: thickest on steep ground and in
 * clumps, a scatter along the torrent in the side valley, never where
 * keepOff says. Each is turned about its axis, tilted part way to the
 * slope and sunk by the slope so its downhill edge does not float.
 *
 * The far level holds every rock and dissolves itself out near the
 * camera in the shader; the near level is refilled from the rocks near
 * the camera when it has moved, as the trees are.
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
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { noise2, smoothstep } from '../../alps/noise.js';
import { FIELD, SNOW_LINE } from '../../alps/terrain.js';
import { assetUrl } from './atlas.js';
import { DITHER_GLSL } from './plantmat.js';

const SHAPES = ['rock1', 'rock3', 'rock4', 'rock6'];
const COLLIDE_R = 700;

/* An instanced standard material that draws only inside a distance band
 * (from the instance's origin), dissolving across its edges on the
 * plants' hash, and collapsing its vertices outside it so the far level's
 * thousands of rocks cost nothing where the near level stands. */
function bandedRockMaterial(maps, band) {
  const mat = new THREE.MeshStandardMaterial({
    map: maps.map,
    normalMap: maps.normalMap,
    roughnessMap: maps.arm,
    aoMap: maps.arm,
    aoMapIntensity: 0.8,
    roughness: 1,
    metalness: 0,
    color: new THREE.Color(0.93, 0.93, 0.95),
  });
  const uBand = { value: new THREE.Vector4(...band) };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uBand = uBand;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${DITHER_GLSL}\nuniform vec4 uBand;\nvarying float vRockDist;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vRockDist = distance(cameraPosition, instanceMatrix[3].xyz);
        if (plantOut(vRockDist, uBand)) gl_Position = vec4(0.0, 0.0, -2.0, 1.0);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${DITHER_GLSL}\nuniform vec4 uBand;\nvarying float vRockDist;`)
      .replace('#include <clipping_planes_fragment>', `
        if (!plantKeep(plantHash(gl_FragCoord.xy), vRockDist, uBand)) discard;
        #include <clipping_planes_fragment>`);
  };
  mat.customProgramCacheKey = () => 'swiss2-rock';
  mat.userData.band = uBand;
  return mat;
}

/* Where the boulders lie, nature.js's two passes. */
function placeRocks({ heightAt, layout, rng, count, colliders }) {
  const { keepOff, slopeAt, upper } = layout;
  const rocks = [];
  const up = new THREE.Vector3(0, 1, 0);
  const drop = (x, z, size) => {
    const sl = slopeAt(x, z);
    const n = new THREE.Vector3(-sl.sx, 1, -sl.sz).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(up, up.clone().lerp(n, 0.6).normalize());
    q.multiply(new THREE.Quaternion().setFromAxisAngle(up, rng() * Math.PI * 2));
    const s = size * (0.8 + rng() * 0.4);
    const y = heightAt(x, z) - s * (0.08 + 0.35 * Math.min(1, sl.s));
    const sy = 0.75 + rng() * 0.5;
    rocks.push({ x, y, z, q, s, sy, shape: Math.floor(rng() * SHAPES.length) });
    if (colliders && Math.hypot(x, z) < COLLIDE_R) {
      colliders.addSphere('rock', x, y + 0.25 * s * sy, z, 0.42 * s);
    }
  };
  for (let tries = 0; tries < count * 120 && rocks.length < count; tries += 1) {
    const x = (rng() - 0.5) * FIELD * 0.94;
    const z = (rng() - 0.5) * FIELD * 0.94;
    const y = heightAt(x, z);
    if (y < 70 || y > SNOW_LINE + 250) {
      continue;
    }
    const sl = slopeAt(x, z);
    const clump = smoothstep(0.5, 0.75, noise2(x / 90 + 1.1, z / 90 + 6.3));
    const p = smoothstep(0.5, 1.15, sl.s) * (0.25 + 0.75 * clump);
    if (rng() > p || keepOff(x, z)) {
      continue;
    }
    const pick = rng();
    const size = pick < 0.55 ? 1.6 : pick < 0.87 ? 3.2 : 5.8;
    drop(x, z, size);
    /* A few smaller stones round a boulder, as there are. */
    const extra = Math.floor(rng() * 3);
    for (let k = 0; k < extra; k += 1) {
      const a = rng() * Math.PI * 2;
      const r = size * (0.8 + rng() * 1.5);
      const ex = x + Math.cos(a) * r;
      const ez = z + Math.sin(a) * r;
      if (!keepOff(ex, ez)) {
        drop(ex, ez, 0.6 + rng() * 0.8);
      }
    }
  }
  for (let k = 0; k < 110; k += 1) {
    const at = upper[Math.floor(rng() * upper.length)];
    const side = rng() < 0.5 ? -1 : 1;
    const x = at.x + (rng() - 0.5) * 4;
    const z = at.z + side * (2.5 + rng() * 7);
    if (!keepOff(x, z)) {
      drop(x, z, rng() < 0.7 ? 1.3 : 2.6);
    }
  }
  return rocks;
}

/*
 * Load the scans, place the rocks and build both levels into `group`.
 * Returns update(position), the counts, and dispose().
 */
export async function buildRocks({ heightAt, layout, rng, count, nearR, fade, colliders, group, envMap }) {
  const loader = new GLTFLoader();
  const tl = new THREE.TextureLoader();
  const [gltf, map, normalMap, arm] = await Promise.all([
    loader.loadAsync(assetUrl('rocks.glb')),
    tl.loadAsync(assetUrl('rock-diff.webp')),
    tl.loadAsync(assetUrl('rock-normal.webp')),
    tl.loadAsync(assetUrl('rock-arm.webp')),
  ]);
  map.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, normalMap, arm]) {
    t.anisotropy = 4;
    /* glTF uv has its origin top left, as GLTFLoader loads its own maps. */
    t.flipY = false;
  }
  const geos = {};
  gltf.scene.traverse((o) => {
    if (o.isMesh) {
      geos[o.name] = o.geometry;
    }
  });
  const rocks = placeRocks({ heightAt, layout, rng, count, colliders });
  const maps = { map, normalMap, arm };
  const nearMat = bandedRockMaterial(maps, [-2, -1, nearR - fade, nearR]);
  const farMat = bandedRockMaterial(maps, [nearR - fade, nearR, 1e9, 2e9]);
  for (const m of [nearMat, farMat]) {
    if (envMap) {
      m.envMap = envMap;
    }
  }
  const byShape = SHAPES.map(() => []);
  rocks.forEach((r) => byShape[r.shape].push(r));
  const m4 = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const matrixOf = (r) => m4.compose(p.set(r.x, r.y, r.z), r.q, s.set(r.s, r.s * r.sy, r.s));
  const near = [];
  const cap = 1200;
  SHAPES.forEach((name, k) => {
    const list = byShape[k];
    const far = new THREE.InstancedMesh(geos[`${name}_far`], farMat, Math.max(1, list.length));
    list.forEach((r, i) => far.setMatrixAt(i, matrixOf(r)));
    far.count = list.length;
    far.computeBoundingSphere();
    far.castShadow = true;
    far.receiveShadow = true;
    far.name = `swiss2-${name}-far`;
    group.add(far);
    const nm = new THREE.InstancedMesh(geos[`${name}_near`], nearMat, cap);
    nm.count = 0;
    nm.frustumCulled = false;
    nm.castShadow = true;
    nm.receiveShadow = true;
    nm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    nm.name = `swiss2-${name}-near`;
    group.add(nm);
    near.push({ mesh: nm, list });
  });
  const last = new THREE.Vector3(Infinity, 0, 0);
  const reach = nearR + fade;
  const update = (pos) => {
    if (pos.distanceToSquared(last) < 16) {
      return;
    }
    last.copy(pos);
    for (const { mesh, list } of near) {
      let n = 0;
      for (const r of list) {
        const dx = r.x - pos.x;
        const dy = r.y - pos.y;
        const dz = r.z - pos.z;
        if (dx * dx + dy * dy + dz * dz < reach * reach && n < cap) {
          mesh.setMatrixAt(n, matrixOf(r));
          n += 1;
        }
      }
      mesh.count = n;
      mesh.visible = n > 0;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, n * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
  return {
    update,
    count: rocks.length,
    dispose() {
      for (const t of [map, normalMap, arm]) {
        t.dispose();
      }
      for (const g of Object.values(geos)) {
        g.dispose();
      }
      nearMat.dispose();
      farMat.dispose();
    },
  };
}
