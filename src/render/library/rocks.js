/*
 * rocks.js: the asset library's scanned rocks, first the Swiss valley's
 * (src/maps/swiss2/vegetation/rocks.js places them).
 *
 * Four stones from a CC0 scanned set (docs/SWISS2-ASSETS-VEG.md),
 * decimated offline to nine hundred triangles for near and a hundred and
 * sixty for far, each normalised to a metre across and standing on its
 * own base. A map decides where its rocks lie; this loads the scans,
 * fits each placed rock its colliders and draws the rocks in three
 * levels, refilled from the camera.
 *
 * A rock is a record { x, y, z, q, s, sy, shape }: its foot, a
 * THREE.Quaternion, its size in metres, how much taller or flatter than
 * the scan it is, and which of SHAPES.
 *
 * THE LEVELS. Every level is refilled, when the camera has moved or
 * turned, from the rocks it can see: the near level from those inside the
 * near band, the far level from those past it. A static far level held
 * all eighteen hundred of the Swiss valley's boulders and was drawn whole
 * for the view and for both shadow maps, nine hundred thousand triangles
 * in every view, most of them behind the camera or collapsed in the
 * shader to nothing. The far level is each boulder's own scan, decimated:
 * it was two of the four, so half the boulders changed their outline at
 * the near band's edge and were drawn past it as a stone their colliders
 * do not fit (rockCapsules), for two draws fewer. Stones under STONE are a
 * third level that keeps the far scan at every distance, since the near
 * one would be nine hundred triangles for a few pixels, and is drawn only
 * as far as a stone that size can be seen.
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

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetUrl } from './vegetation/atlas.js';
import { DITHER_GLSL } from './vegetation/plantmat.js';
import { thermalKind } from '../thermal.js';

export const SHAPES = ['rock1', 'rock3', 'rock4', 'rock6'];
/* The near level's room per shape. */
const NEAR_CAP = 1200;
/* A stone under this size in metres is drawn at the far scan's detail
 * wherever it is, and no further off than STONE_R. */
export const STONE = 1.1;
const STONE_R = 900;
/* Past this a boulder is under a pixel. */
const FAR_R = 4500;

/* An instanced standard material that draws only inside a distance band
 * (from the instance's origin), dissolving across its edges on the
 * plants' hash, and collapsing its vertices outside it. The program key
 * is the Swiss valley's, kept from before the move. */
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
  return thermalKind(mat, 'rock');
}

/*
 * The scans and their maps. Returns { geos, scans, maps }: each shape's
 * near and far geometry by `${shape}_near` / `${shape}_far`, each one's
 * vertices in its own frame (a flat [x, y, z, ...], for the colliders),
 * and the three textures.
 */
export async function loadRocks() {
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
  /* Read through the attribute, which may be interleaved or quantised. */
  const verts = (g) => {
    const a = g.getAttribute('position');
    const out = new Float32Array(a.count * 3);
    for (let i = 0; i < a.count; i += 1) {
      out[i * 3] = a.getX(i);
      out[i * 3 + 1] = a.getY(i);
      out[i * 3 + 2] = a.getZ(i);
    }
    return out;
  };
  const scans = {
    near: SHAPES.map((name) => verts(geos[`${name}_near`])),
    far: SHAPES.map((name) => verts(geos[`${name}_far`])),
  };
  return { geos, scans, maps: { map, normalMap, arm } };
}

/* How far inside the drawn rock its collider's surface may stand at the
 * rock's most outlying point, metres: the swept audit's tolerance is 0.5. */
const ROCK_INSET = 0.35;

/*
 * A boulder's colliders: up to three capsules side by side down the
 * longest way of the scan as it is placed, as thick as its thinnest way,
 * round enough that the drawn rock stands no more than ROCK_INSET outside
 * them but at its knobs, and none of it under the ground (the plane of
 * the slope at its foot) counted. `shapes` are the scans' vertices in
 * their own frame, each a flat [x, y, z, ...]: its near and far scan. One
 * sphere of 0.42 s round a point a quarter up left up to 3 m of a big
 * rock outside it; one capsule round enough for a boulder's width stood
 * metres over its top, the scans being wider than they are tall.
 */
function rockCapsules(r, shapes, ground) {
  const e = new THREE.Matrix4().compose(new THREE.Vector3(r.x, r.y, r.z), r.q, new THREE.Vector3(r.s, r.s * r.sy, r.s)).elements;
  const pts = [];
  for (const v of shapes) {
    for (let i = 0; i < v.length; i += 3) {
      const x = e[0] * v[i] + e[4] * v[i + 1] + e[8] * v[i + 2] + e[12];
      const y = e[1] * v[i] + e[5] * v[i + 1] + e[9] * v[i + 2] + e[13];
      const z = e[2] * v[i] + e[6] * v[i + 1] + e[10] * v[i + 2] + e[14];
      if (y >= ground(x, z) - 0.2) {
        pts.push([x, y, z]);
      }
    }
  }
  /* All of it in the ground: nothing to hit that the ground is not. */
  if (pts.length < 4) {
    return [];
  }
  const c = [0, 0, 0];
  for (const p of pts) {
    for (let k = 0; k < 3; k += 1) {
      c[k] += p[k] / pts.length;
    }
  }
  /* The principal axes, longest first: power iteration on the covariance,
   * each next axis with the ones before taken out. */
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) {
    for (let a = 0; a < 3; a += 1) {
      for (let b = 0; b < 3; b += 1) {
        C[a][b] += (p[a] - c[a]) * (p[b] - c[b]);
      }
    }
  }
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const axes = [];
  for (const seed of [[1, 0.3, 0.2], [0.2, 1, 0.3], [0.3, 0.2, 1]]) {
    let u = seed;
    for (let k = 0; k < 32; k += 1) {
      let w = [0, 1, 2].map((a) => dot(C[a], u));
      for (const q of axes) {
        const d = dot(w, q);
        w = w.map((v, a) => v - d * q[a]);
      }
      const l = Math.hypot(...w) || 1;
      u = w.map((v) => v / l);
    }
    axes.push(u);
  }
  /* The rock's extent along each axis, about the middle of each. */
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) {
    const d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
    for (let a = 0; a < 3; a += 1) {
      const t = dot(d, axes[a]);
      lo[a] = Math.min(lo[a], t);
      hi[a] = Math.max(hi[a], t);
    }
  }
  const mid = [0, 1, 2].map((a) => (lo[a] + hi[a]) / 2);
  const half = [0, 1, 2].map((a) => (hi[a] - lo[a]) / 2);
  const at = (t1, t2, t3) => [0, 1, 2].map((k) => c[k] + axes[0][k] * t1 + axes[1][k] * t2 + axes[2][k] * t3);
  /* As thick as the rock is thin; one capsule down its length, or two or
   * three side by side across its width, each as long as the rock's plan
   * (an ellipse) is where it runs. */
  const thick = Math.max(0.2, half[2]);
  const n = half[1] - thick <= ROCK_INSET ? 1 : half[1] <= 2 * thick + ROCK_INSET ? 2 : 3;
  const segs = [];
  for (let k = 0; k < n; k += 1) {
    const off = n === 1 ? 0 : (half[1] - thick) * (n === 2 ? (k === 0 ? -1 : 1) : k - 1);
    const reach = Math.max(0, half[0] - thick) * Math.sqrt(Math.max(0, 1 - (off / half[1]) ** 2));
    segs.push([at(mid[0] - reach, mid[1] + off, mid[2]), at(mid[0] + reach, mid[1] + off, mid[2])]);
  }
  /* Each its own radius, from the vertices nearest it: all but their
   * furthest tenth, a knob or a lip. Sized to the furthest, a capsule
   * round a domed scan stood two metres of air over its edges. */
  const segDist = (p, [A, B]) => {
    const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const l2 = dot(ab, ab);
    const t = l2 > 0 ? Math.max(0, Math.min(1, dot([p[0] - A[0], p[1] - A[1], p[2] - A[2]], ab) / l2)) : 0;
    return Math.hypot(p[0] - A[0] - ab[0] * t, p[1] - A[1] - ab[1] * t, p[2] - A[2] - ab[2] * t);
  };
  const near = segs.map(() => []);
  for (const p of pts) {
    let k = 0;
    let d = Infinity;
    segs.forEach((sg, j) => {
      const dj = segDist(p, sg);
      if (dj < d) {
        d = dj;
        k = j;
      }
    });
    near[k].push(d);
  }
  const reach = (l) => (l.length ? l.sort((a, b) => a - b)[Math.floor((l.length - 1) * 0.9)] : 0);
  return segs.map(([A, B], k) => ({ A, B, r: Math.max(0.2, reach(near[k]) - ROCK_INSET) }));
}

/*
 * A placed rock's colliders, as the map's collider calls: ['sphere', x,
 * y, z, r] or ['capsule', ax, ay, az, bx, by, bz, r]. A stone under STONE
 * is a sphere, most of it in the ground; a boulder the capsules that fit
 * its scan (rockCapsules), `ground(x, z)` the height under it. A pebble
 * of 0.45 m or less has none.
 */
export function rockColliders(rock, scans, ground) {
  const { x, y, z, s, sy, shape } = rock;
  if (s > 0.45 && s < STONE) {
    return [['sphere', x, y + 0.25 * s * sy, z, 0.42 * s]];
  }
  if (s < STONE) {
    return [];
  }
  return rockCapsules(rock, [scans.near[shape], scans.far[shape]], ground).map((c) => ['capsule', ...c.A, ...c.B, c.r]);
}

/*
 * The rocks' meshes, for the map to add to its scene: a level's mesh per
 * shape, named `${name}-${shape}-near` and `-far`, and `${name}-stones`.
 * `loaded` is loadRocks()'s; `nearR` where the near level hands over to
 * the far, across `fade` metres. Returns { meshes, update(camera),
 * stones, dispose() }, dispose freeing the scans as well.
 */
export function rockLevels({ loaded, rocks, nearR, fade, envMap, name }) {
  const { geos, maps } = loaded;
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
  const meshes = [];
  const mk = (geo, mat, cap, meshName) => {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, cap));
    m.count = 0;
    m.visible = false;
    m.frustumCulled = false;
    m.castShadow = true;
    m.receiveShadow = true;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.name = meshName;
    meshes.push(m);
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
      meshes: SHAPES.map((shape) => mk(geos[`${shape}_near`], nearMat, NEAR_CAP, `${name}-${shape}-near`)),
    },
    {
      list: big,
      from: nearR - fade,
      to: FAR_R,
      shapeOf: (r) => r.shape,
      meshes: SHAPES.map((shape, k) => mk(geos[`${shape}_far`], farMat, big.filter((r) => r.shape === k).length, `${name}-${shape}-far`)),
    },
    {
      list: stones,
      from: 0,
      to: STONE_R,
      shapeOf: () => 0,
      meshes: [mk(geos[`${SHAPES[2]}_far`], stoneMat, stones.length, `${name}-stones`)],
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
    meshes,
    update,
    stones: stones.length,
    dispose() {
      for (const t of [maps.map, maps.normalMap, maps.arm]) {
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
