/*
 * rocks.js: the boulders under the cliffs, on the scree and along the
 * torrent, and the stones the map lays on the stream's banks, the lake's
 * shore and the field walls, as photogrammetry scans rather than
 * icosahedra.
 *
 * Four stones from a CC0 scanned set (docs/SWISS2-ASSETS-VEG.md),
 * decimated offline to nine hundred triangles for near and a hundred and
 * sixty for far, each normalised to a metre across and standing on its
 * own base. Placed by nature.js's rules: thickest on steep ground and in
 * clumps, a scatter along the torrent in the side valley, never where
 * keepOff says. Each is turned about its axis, tilted part way to the
 * slope and sunk by the slope so its downhill edge does not float.
 *
 * Every level is refilled, when the camera has moved or turned, from
 * the rocks it can see: the near level from those inside the near band,
 * the far level from those past it. A static far level held all
 * eighteen hundred boulders and was drawn whole for the view and for
 * both shadow maps, nine hundred thousand triangles in every view, most
 * of them behind the camera or collapsed in the shader to nothing. The
 * far level is two of the scans, which is variety enough past the near
 * band with every stone turned and squashed its own way. Stones under a
 * metre and a bit are a third level that keeps the far scan at every
 * distance, since the near one would be nine hundred triangles for a
 * few pixels, and is drawn only as far as a stone that size can be seen.
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
import { makeRng, noise2, smoothstep } from '../../alps/noise.js';
import { FIELD, SNOW_LINE, LAKE_Y, valleyAxis } from '../../alps/terrain.js';
import { ROAD_DX, ROAD_END } from './zones.js';
import { assetUrl } from './atlas.js';
import { DITHER_GLSL } from './plantmat.js';

const SHAPES = ['rock1', 'rock3', 'rock4', 'rock6'];
const COLLIDE_R = 700;
/* The near level's room per shape. */
const NEAR_CAP = 1200;
/* A stone under this size in metres is drawn at the far scan's detail
 * wherever it is, and no further off than STONE_R. */
const STONE = 1.1;
const STONE_R = 900;
/* Past this a boulder is under a pixel. */
const FAR_R = 4500;

/* An instanced standard material that draws only inside a distance band
 * (from the instance's origin), dissolving across its edges on the
 * plants' hash, and collapsing its vertices outside it. */
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

/* Where the boulders lie, nature.js's two passes, and then the stones
 * the map asks for. A stone asked for with `sink` is set that share of
 * its height into the ground (or the stream's bed) rather than by the
 * slope. */
function placeRocks({ heightAt, layout, rng, count, colliders, extra }) {
  const { keepOff, slopeAt, upper } = layout;
  const rocks = [];
  const up = new THREE.Vector3(0, 1, 0);
  const drop = (x, z, size, sink = null) => {
    const sl = slopeAt(x, z);
    const n = new THREE.Vector3(-sl.sx, 1, -sl.sz).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(up, up.clone().lerp(n, 0.6).normalize());
    q.multiply(new THREE.Quaternion().setFromAxisAngle(up, rng() * Math.PI * 2));
    const s = size * (0.8 + rng() * 0.4);
    const sy = 0.75 + rng() * 0.5;
    const y = heightAt(x, z) - s * (sink === null ? 0.08 + 0.35 * Math.min(1, sl.s) : sink * sy);
    const shape = Math.floor(rng() * SHAPES.length);
    /* Not on carved rock (swiss2/rock/), turned away after its draws so
     * the stones after it lie where they lay. */
    if (layout.carved && layout.carved(x, z)) {
      return;
    }
    rocks.push({ x, y, z, q, s, sy, shape });
    if (colliders && Math.hypot(x, z) < COLLIDE_R && s > 0.45) {
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
    const more = Math.floor(rng() * 3);
    for (let k = 0; k < more; k += 1) {
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
  for (const e of extra) {
    drop(e.x, e.z, e.size, e.sink ?? null);
  }
  return rocks;
}

/*
 * The stones the water has laid: along the floor's stream, where round
 * 2's banks were grass to the water's edge, reaches of stones down both
 * banks and a boulder in the bed now and then, broken by grassy reaches;
 * and round the lake, stones along the waterline, fewer where the jetty
 * and the village's beach are. Returns { x, z, size, sink } for
 * buildRocks's `extra`.
 */
export function waterStones({ heightAt, layout, rng, shore, keepClear }) {
  const out = [];
  const { lower } = layout;
  for (let k = 0; k + 1 < lower.length; k += 1) {
    const a = lower[k];
    const b = lower[k + 1];
    const tx = b.x - a.x;
    const tz = b.z - a.z;
    const tl = Math.hypot(tx, tz) || 1;
    for (const side of [-1, 1]) {
      const rocky = smoothstep(0.35, 0.6, noise2(a.z / 45 + side * 7.3, 5.1 + side));
      const n = Math.round(rocky * (2 + 5 * rng()));
      for (let q = 0; q < n; q += 1) {
        const along = rng();
        const off = 2.1 + rng() * 2.6;
        const x = a.x + tx * along + side * (-tz / tl) * off;
        const z = a.z + tz * along + side * (tx / tl) * off;
        out.push({ x, z, size: 0.35 + 0.7 * rng() * rng(), sink: 0.3 });
      }
    }
    if (rng() < 0.12) {
      const along = rng();
      const off = (rng() - 0.5) * 3;
      out.push({ x: a.x + tx * along - (tz / tl) * off, z: a.z + tz * along + (tx / tl) * off, size: 0.8 + 0.8 * rng(), sink: 0.45 });
    }
  }
  for (const s of shore) {
    if (rng() > 0.45 || keepClear(s.x, s.z)) {
      continue;
    }
    const n = 1 + Math.floor(rng() * 3);
    for (let q = 0; q < n; q += 1) {
      const r = (rng() - 0.35) * 5;
      const x = s.x + Math.cos(s.a) * r + (rng() - 0.5) * 6;
      const z = s.z + Math.sin(s.a) * r + (rng() - 0.5) * 6;
      if (heightAt(x, z) > LAKE_Y - 1.2) {
        out.push({ x, z, size: 0.4 + 0.9 * rng() * rng(), sink: 0.3 });
      }
    }
  }
  /* Boulders the glacier left along the shore, in twos and threes, some
   * on the beach and some standing in the shallows: a lake's edge is
   * never only gravel. Their own generator, so the stones above stand
   * where they stood. */
  const brng = makeRng(20261001);
  for (const s of shore) {
    if (brng() > 0.5 || keepClear(s.x, s.z)) {
      continue;
    }
    const n = 1 + Math.floor(brng() * 2.6);
    for (let q = 0; q < n; q += 1) {
      const r = (brng() - 0.55) * 9;
      const x = s.x + Math.cos(s.a) * r + (brng() - 0.5) * 5;
      const z = s.z + Math.sin(s.a) * r + (brng() - 0.5) * 5;
      if (!keepClear(x, z) && heightAt(x, z) > LAKE_Y - 1.5) {
        out.push({ x, z, size: 1.2 + 1.6 * brng() * brng(), sink: 0.35 });
      }
    }
  }
  /* Cobbles the waves have sorted along the waterline, from the wash
   * down into the shallows, where the water shows them: the shingle the
   * ground paints stands up in them. Thickest on the north shore either
   * side of the jetty, where the views stand; a lake's worth of them at
   * that density would be a quarter of a million triangles from the air.
   * Their own generator again. */
  const crng = makeRng(20261002);
  const jx = valleyAxis(ROAD_END) + ROAD_DX;
  for (const s of shore) {
    const north = Math.sin(s.a) < -0.3;
    const n = Math.floor(crng() * (north ? 8 + 44 * (1 - smoothstep(60, 160, Math.abs(s.x - jx))) : 5));
    for (let q = 0; q < n; q += 1) {
      const along = (crng() - 0.5) * 22;
      const r = (crng() - 0.6) * 7;
      const x = s.x + Math.cos(s.a) * r - Math.sin(s.a) * along;
      const z = s.z + Math.sin(s.a) * r + Math.cos(s.a) * along;
      const y = heightAt(x, z);
      if (!keepClear(x, z) && y > LAKE_Y - 0.8 && y < LAKE_Y + 0.6) {
        out.push({ x, z, size: 0.16 + 0.3 * crng() * crng(), sink: 0.35 });
      }
    }
  }
  return out;
}

/*
 * Load the scans, place the rocks and build their levels into `group`.
 * `extra` is the stones the map lays by its own rules, as
 * { x, z, size, sink }. Returns update(camera), the counts, and
 * dispose().
 */
export async function buildRocks({ heightAt, layout, rng, count, nearR, fade, colliders, group, envMap, extra = [] }) {
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
  const rocks = placeRocks({ heightAt, layout, rng, count, colliders, extra });
  const maps = { map, normalMap, arm };
  const nearMat = bandedRockMaterial(maps, [-2, -1, nearR - fade, nearR]);
  const farMat = bandedRockMaterial(maps, [nearR - fade, nearR, 1e9, 2e9]);
  const stoneMat = bandedRockMaterial(maps, [-2, -1, 1e9, 2e9]);
  for (const m of [nearMat, farMat, stoneMat]) {
    if (envMap) {
      m.envMap = envMap;
    }
  }
  const m4 = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const matrixOf = (r) => m4.compose(p.set(r.x, r.y, r.z), r.q, s.set(r.s, r.s * r.sy, r.s));
  const mk = (geo, mat, cap, name) => {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, cap));
    m.count = 0;
    m.visible = false;
    m.frustumCulled = false;
    m.castShadow = true;
    m.receiveShadow = true;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.name = name;
    group.add(m);
    return m;
  };
  /* A level: the rocks it may draw, the distances it draws them
   * between, and a mesh per shape, `shapeOf` choosing the mesh. */
  const stones = rocks.filter((r) => r.s < STONE);
  const big = rocks.filter((r) => r.s >= STONE);
  const levels = [
    {
      list: big,
      from: 0,
      to: nearR + fade,
      shapeOf: (r) => r.shape,
      meshes: SHAPES.map((name) => mk(geos[`${name}_near`], nearMat, NEAR_CAP, `swiss2-${name}-near`)),
    },
    {
      list: big,
      from: nearR - fade,
      to: FAR_R,
      shapeOf: (r) => r.shape % 2,
      meshes: [0, 1].map((k) => mk(geos[`${SHAPES[k]}_far`], farMat, big.filter((r) => r.shape % 2 === k).length, `swiss2-${SHAPES[k]}-far`)),
    },
    {
      list: stones,
      from: 0,
      to: STONE_R,
      shapeOf: () => 0,
      meshes: [mk(geos[`${SHAPES[2]}_far`], stoneMat, stones.length, 'swiss2-stones')],
    },
  ];
  /* A stone under a metre, bedded a third into the ground, throws a
   * shadow a hand wide: not worth a draw in each shadow map. */
  levels[2].meshes[0].castShadow = false;
  const last = new THREE.Vector3(Infinity, 0, 0);
  const lastDir = new THREE.Vector3();
  const here = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const frustum = new THREE.Frustum();
  const viewProj = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  /* Refilled when the camera has moved three metres or turned two
   * degrees, as the trees are. */
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
    for (const L of levels) {
      const n = L.meshes.map(() => 0);
      for (const r of L.list) {
        const dx = r.x - pos.x;
        const dy = r.y - pos.y;
        const dz = r.z - pos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < L.from * L.from || d2 > L.to * L.to) {
          continue;
        }
        /* The stone and the shadow it throws, with a margin for turning
         * between refills. */
        sphere.center.set(r.x, r.y, r.z);
        sphere.radius = r.s * 2.5 + 3 + 0.06 * Math.sqrt(d2);
        if (!frustum.intersectsSphere(sphere)) {
          continue;
        }
        const k = L.shapeOf(r);
        const mesh = L.meshes[k];
        if (n[k] < mesh.instanceMatrix.count) {
          mesh.setMatrixAt(n[k], matrixOf(r));
          n[k] += 1;
        }
      }
      L.meshes.forEach((mesh, k) => {
        mesh.count = n[k];
        mesh.visible = n[k] > 0;
        mesh.instanceMatrix.clearUpdateRanges();
        mesh.instanceMatrix.addUpdateRange(0, n[k] * 16);
        mesh.instanceMatrix.needsUpdate = true;
      });
    }
  };
  return {
    update,
    count: rocks.length,
    stones: stones.length,
    dispose() {
      for (const t of [map, normalMap, arm]) {
        t.dispose();
      }
      for (const g of Object.values(geos)) {
        g.dispose();
      }
      nearMat.dispose();
      farMat.dispose();
      stoneMat.dispose();
    },
  };
}
