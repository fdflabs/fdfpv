/*
 * trees.js: the Interior's forest drawn from canopy.js's own trees
 * (TECH-NEEDS N2: "same data drives the drawn trees, so what you see
 * matches what the room decides").
 *
 * Every tree the room's line of sight tests is a crown drawn where it
 * stands, as big as it is, in three tiers by the distance from the camera
 * to its CHUNK (a square CHUNK metres a side, so a chunk is in one tier
 * on every screen and the tiers do not tear inside it):
 *
 *   near   to NEAR_M: each crown a lumpy twenty sided ball subdivided
 *          once (80 triangles), its trunk under it, casting shadows;
 *   mid    to MID_M: each crown the plain twenty sided ball (20);
 *   far    to FAR_M: the forest as points, one a FAR_BLOCK square of
 *          forest, a shaded disc as wide as the crowns standing there,
 *          in one draw that culls itself by the same chunk rule on the
 *          GPU (a point is triangles nobody pays for in the budget, and
 *          at that range a crown is a few pixels across).
 *
 * The near and mid tiers are refilled from per chunk instance lists as
 * chunks change tier, a few chunks a frame by time; the far points are
 * made once at load for the played square and its margin.
 *
 * The crowns' sizes are canopy.js's ellipsoids: the ball's unit radius
 * scaled to r across and ry up, centred at cy, and scaled once more by
 * its own fit (fitOf), so its faces sit as far inside the true crown as
 * its corners stand outside: scripts/canopy-los.js measures how often the
 * drawn crowns and canopyBlocks disagree, which is only ever within a
 * few decimetres of a crown's skin.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { HALF, PLAY_HALF } from '../../share/interior/frame.js';
import { KIND, TREE_CELL, hash01 } from '../../share/interior/canopy.js';
import { LAND } from '../../share/interior/world.js';
import { opened } from '../../share/interior/places.js';
import { thermalKind, thermalShader } from '../../render/thermal.js';

export const CHUNK = 256;
export const NEAR_M = 300;
export const MID_M = 1200;
export const FAR_M = 7500;
const FAR_BLOCK = 16;
/* How far past the played square the far points reach, metres. */
const FAR_MARGIN = 2500;
/* Main thread time a frame may spend making chunks' instance lists. */
const BUILD_MS = 3;
/* The instance capacity of each tier: the most crowns its reach can
 * hold at the forest's density, with room. */
const NEAR_CAP = 24000;
const MID_CAP = 90000;

/* Crown colours, linear: the forest's greens, a few dry and bare crowns
 * at the season's end, and the flowering lapacho's pink and yellow. */
const GREENS = [
  [0.034, 0.068, 0.022], [0.042, 0.078, 0.026], [0.03, 0.058, 0.02], [0.05, 0.075, 0.03], [0.038, 0.062, 0.028],
  [0.058, 0.07, 0.034], [0.07, 0.068, 0.04],
];
const PINK = [0.32, 0.1, 0.16];
const YELLOW = [0.36, 0.28, 0.04];
function crownColour(t) {
  if (t.tint > 0.996) {
    return PINK;
  }
  if (t.tint > 0.992) {
    return YELLOW;
  }
  const g = GREENS[Math.floor(t.tint * 97) % GREENS.length];
  return t.kind === KIND.palm ? [g[0] * 1.2, g[1] * 1.15, g[2]] : g;
}

/* A ball with lumps: an icosahedron subdivided `detail` times, each
 * vertex pushed in or out by a hash of its direction. */
function crownGeometry(THREE, detail, lump) {
  /* Welded, so its normals are smooth: a crown is a soft heap of leaves,
   * not a cut stone. */
  const geo = mergeVertices(new THREE.IcosahedronGeometry(1, detail).deleteAttribute('normal').deleteAttribute('uv'));
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + lump * (hash01(Math.round(x * 97), Math.round(y * 97), Math.round(z * 97) + 5) - 0.5);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/* The scale that has a unit ball's polyhedron straddle the unit sphere:
 * its faces' nearest distance to the middle d and its corners' farthest
 * c, scaled by 2 / (d + c) so both miss the sphere by the same. */
function fitOf(geo) {
  const p = geo.attributes.position;
  const idx = geo.index.array;
  let d = Infinity;
  let c = 0;
  const v = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let k = 0; k < idx.length; k += 3) {
    for (let j = 0; j < 3; j += 1) {
      v[j][0] = p.getX(idx[k + j]);
      v[j][1] = p.getY(idx[k + j]);
      v[j][2] = p.getZ(idx[k + j]);
      c = Math.max(c, Math.hypot(v[j][0], v[j][1], v[j][2]));
    }
    const ux = v[1][0] - v[0][0];
    const uy = v[1][1] - v[0][1];
    const uz = v[1][2] - v[0][2];
    const wx = v[2][0] - v[0][0];
    const wy = v[2][1] - v[0][1];
    const wz = v[2][2] - v[0][2];
    const nx = uy * wz - uz * wy;
    const ny = uz * wx - ux * wz;
    const nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz);
    d = Math.min(d, Math.abs(nx * v[0][0] + ny * v[0][1] + nz * v[0][2]) / l);
  }
  return 2 / (d + c);
}

function chunkKey(i, j) {
  return i * 4096 + j;
}

/*
 * The trees: { group, view(camera, target), stats(), dispose(), near }
 * (near the near tier's crown mesh, for scripts/canopy-los.js's raycast).
 * `canopy` canopy.js makeCanopy's; `world` world.js makeWorld's.
 */
export function buildTrees({
  THREE, scene, quality, canopy, world, sunDir,
}) {
  const group = new THREE.Group();
  group.name = 'interior-trees';
  scene.add(group);
  const crownMat = thermalKind(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 }), 'vegetation');
  const trunkMat = thermalKind(new THREE.MeshStandardMaterial({ color: 0x4a3f33, roughness: 1, metalness: 0 }), 'vegetation');
  const nearGeo = crownGeometry(THREE, 1, 0.12);
  const midGeo = crownGeometry(THREE, 0, 0.08);
  const nearFit = fitOf(nearGeo);
  const midFit = fitOf(midGeo);
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 1, 5, 1, true);
  trunkGeo.translate(0, 0.5, 0);
  const near = new THREE.InstancedMesh(nearGeo, crownMat, NEAR_CAP);
  const mid = new THREE.InstancedMesh(midGeo, crownMat, MID_CAP);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, NEAR_CAP);
  for (const m of [near, mid, trunks]) {
    m.count = 0;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(m);
  }
  near.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NEAR_CAP * 3), 3);
  mid.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MID_CAP * 3), 3);
  near.castShadow = quality === 'high';
  trunks.castShadow = quality === 'high';
  near.receiveShadow = true;
  mid.receiveShadow = true;
  near.name = 'interior-crowns-near';
  mid.name = 'interior-crowns-mid';
  trunks.name = 'interior-trunks';

  /* Per chunk: its trees as instance data, made on demand and kept. */
  const chunks = new Map();
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  function makeChunk(ci, cj) {
    const x0 = -HALF + ci * CHUNK;
    const z0 = -HALF + cj * CHUNK;
    const list = canopy.treesIn(x0, z0, x0 + CHUNK, z0 + CHUNK, []);
    const crowns = new Float32Array(list.length * 16);
    const crownsMid = new Float32Array(list.length * 16);
    const trunkM = new Float32Array(list.length * 16);
    const cols = new Float32Array(list.length * 3);
    list.forEach((t, k) => {
      q.setFromAxisAngle(yAxis, t.tint * 6.283);
      pos.set(t.x, t.cy, t.z);
      scl.set(t.r * nearFit, t.ry * nearFit, t.r * nearFit);
      m4.compose(pos, q, scl);
      m4.toArray(crowns, k * 16);
      scl.set(t.r * midFit, t.ry * midFit, t.r * midFit);
      m4.compose(pos, q, scl);
      m4.toArray(crownsMid, k * 16);
      const base = t.cy - t.ry * 0.7;
      pos.set(t.x, t.ground - 0.3, t.z);
      const thick = t.kind === KIND.palm ? 1.4 : 1 + t.r * 0.25;
      scl.set(thick, base - t.ground + 0.3, thick);
      m4.compose(pos, q, scl);
      m4.toArray(trunkM, k * 16);
      const c = crownColour(t);
      cols[k * 3] = c[0];
      cols[k * 3 + 1] = c[1];
      cols[k * 3 + 2] = c[2];
    });
    const ch = {
      ci, cj, n: list.length, crowns, crownsMid, trunks: trunkM, cols, tier: -1,
    };
    chunks.set(chunkKey(ci, cj), ch);
    return ch;
  }

  /* THE FAR POINTS: a point a FAR_BLOCK square that is forest (or
   * shrub) and not opened, at the block's middle jittered, sized to the
   * crowns there, over the played square and its margin. */
  const farHalf = Math.min(HALF, PLAY_HALF + FAR_MARGIN);
  const farPos = [];
  const farCol = [];
  const farSize = [];
  for (let z = -farHalf; z < farHalf; z += FAR_BLOCK) {
    for (let x = -farHalf; x < farHalf; x += FAR_BLOCK) {
      const bi = Math.floor((x + HALF) / FAR_BLOCK);
      const bj = Math.floor((z + HALF) / FAR_BLOCK);
      const px = x + FAR_BLOCK * (0.2 + 0.6 * hash01(bi, bj, 21));
      const pz = z + FAR_BLOCK * (0.2 + 0.6 * hash01(bi, bj, 22));
      const cls = world.landAt(px, pz);
      if (cls !== LAND.forest && cls !== LAND.shrub) {
        continue;
      }
      if (opened(px, pz, 4)) {
        continue;
      }
      /* The block's own tree for its height: the one in the square its
       * middle falls in, if any. */
      const t = canopy.treeAt(Math.floor((px + HALF) / TREE_CELL), Math.floor((pz + HALF) / TREE_CELL));
      const h = t ? t.h : 14;
      farPos.push(px, world.groundAt(px, pz) + h * 0.8, pz);
      /* The block's colour: its own tree's when it has one (the lapacho's
       * flowers then show from afar as often as they do close to), else
       * a green of the hash; three quarters of the size of the block, so
       * the forest floor in shade shows between, as it does between the
       * crowns drawn near. */
      const c = crownColour(t || { tint: hash01(bi, bj, 23) * 0.97, kind: KIND.broadleaf });
      farCol.push(c[0], c[1], c[2]);
      farSize.push(cls === LAND.forest ? FAR_BLOCK * 0.82 : FAR_BLOCK * 0.5);
    }
  }
  const farGeo = new THREE.BufferGeometry();
  farGeo.setAttribute('position', new THREE.Float32BufferAttribute(farPos, 3));
  farGeo.setAttribute('color', new THREE.Float32BufferAttribute(farCol, 3));
  farGeo.setAttribute('size', new THREE.Float32BufferAttribute(farSize, 1));
  const farMat = new THREE.ShaderMaterial({
    uniforms: {
      uSun: { value: sunDir },
      uSunI: { value: 2.9 },
      uScale: { value: 450 },
      uNear: { value: MID_M },
      uFar: { value: FAR_M },
      uHalf: { value: HALF },
      uChunk: { value: CHUNK },
    },
    vertexShader: /* glsl */ `
      attribute float size;
      attribute vec3 color;
      uniform float uScale;
      uniform float uNear;
      uniform float uFar;
      uniform float uHalf;
      uniform float uChunk;
      varying vec3 vCol;
      void main() {
        vCol = color;
        /* The chunk's middle, as trees.js tierOf works it out, so a chunk
         * drawn as crowns is never drawn as points too. */
        vec2 c = (floor((position.xz + uHalf) / uChunk) + 0.5) * uChunk - uHalf;
        vec3 mid = vec3(c.x, position.y, c.y);
        float d = distance(mid, cameraPosition);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (d < uNear || d > uFar) ? 0.0 : size * uScale / -mv.z;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun;
      uniform float uSunI;
      varying vec3 vCol;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(p, p);
        if (r2 > 1.0) discard;
        /* A ball's light, seen from above: up toward the sky, the sun's
         * side brighter. */
        vec3 n = normalize(vec3(p.x, sqrt(1.0 - r2) + 0.4, -p.y));
        float sun = max(dot(n, normalize(uSun)), 0.0);
        /* As a lit crown is: its albedo times the sun's irradiance over pi
         * on its face, and the sky's fill. */
        vec3 col = vCol * (0.22 + uSunI * 0.3183 * sun);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  thermalShader(farMat, 'float thT = thPassive(thLum(vCol), 0.6, 0.9, 7.0, -1.5, 2.5);', 'interior far canopy');
  const far = new THREE.Points(farGeo, farMat);
  far.frustumCulled = false;
  far.name = 'interior-crowns-far';
  group.add(far);

  /* The tier a chunk is in for a camera at (cx, cy, cz): 0 near, 1 mid,
   * 2 far or beyond. */
  const tierOf = (ci, cj, cam) => {
    const mx = -HALF + (ci + 0.5) * CHUNK;
    const mz = -HALF + (cj + 0.5) * CHUNK;
    const my = world.groundAt(mx, mz) + 12;
    const d = Math.sqrt((mx - cam.x) ** 2 + (my - cam.y) ** 2 + (mz - cam.z) ** 2);
    return d < NEAR_M ? 0 : d < MID_M ? 1 : 2;
  };

  let wanted = [];
  let dirty = true;
  const last = new THREE.Vector3(Infinity, 0, 0);
  const stats = {
    chunks: 0, near: 0, mid: 0, far: farPos.length / 3, built: 0, pending: 0, lastMs: 0,
  };

  function refill(ready) {
    let n = 0;
    let m = 0;
    for (const ch of ready) {
      if (ch.tier === 0) {
        if (n + ch.n > NEAR_CAP) {
          continue;
        }
        near.instanceMatrix.array.set(ch.crowns, n * 16);
        trunks.instanceMatrix.array.set(ch.trunks, n * 16);
        near.instanceColor.array.set(ch.cols, n * 3);
        n += ch.n;
      } else if (ch.tier === 1) {
        if (m + ch.n > MID_CAP) {
          continue;
        }
        mid.instanceMatrix.array.set(ch.crownsMid, m * 16);
        mid.instanceColor.array.set(ch.cols, m * 3);
        m += ch.n;
      }
    }
    near.count = n;
    trunks.count = n;
    mid.count = m;
    for (const im of [near, mid, trunks]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) {
        im.instanceColor.needsUpdate = true;
      }
    }
    stats.near = n;
    stats.mid = m;
  }

  function view(camera) {
    const cam = camera.position;
    const t0 = performance.now();
    /* The chunks within MID_M of the camera, nearest first. */
    if (cam.distanceTo(last) > 24 || dirty) {
      const reach = Math.ceil(MID_M / CHUNK) + 1;
      const ci0 = Math.floor((cam.x + HALF) / CHUNK);
      const cj0 = Math.floor((cam.z + HALF) / CHUNK);
      const list = [];
      const max = Math.floor((2 * HALF) / CHUNK) - 1;
      for (let cj = Math.max(0, cj0 - reach); cj <= Math.min(max, cj0 + reach); cj += 1) {
        for (let ci = Math.max(0, ci0 - reach); ci <= Math.min(max, ci0 + reach); ci += 1) {
          const tier = tierOf(ci, cj, cam);
          if (tier < 2) {
            list.push({ ci, cj, tier });
          }
        }
      }
      list.sort((a, b) => a.tier - b.tier);
      wanted = list;
      last.copy(cam);
      dirty = true;
    }
    let pending = 0;
    const ready = [];
    for (const w of wanted) {
      let ch = chunks.get(chunkKey(w.ci, w.cj));
      if (!ch) {
        if (performance.now() - t0 > BUILD_MS) {
          pending += 1;
          continue;
        }
        ch = makeChunk(w.ci, w.cj);
        stats.built += 1;
        dirty = true;
      }
      if (ch.tier !== w.tier) {
        dirty = true;
      }
      ch.tier = w.tier;
      ready.push(ch);
    }
    if (dirty) {
      refill(ready);
      dirty = pending > 0;
    }
    stats.chunks = chunks.size;
    stats.pending = pending;
    stats.lastMs = performance.now() - t0;
  }

  /* Every chunk the camera's first place wants, made now: the first frame
   * the pilot sees has its trees. */
  function settle(camera) {
    for (let k = 0; k < 400; k += 1) {
      view(camera);
      if (!stats.pending) {
        return;
      }
    }
  }

  return {
    group,
    near,
    mid,
    far,
    view,
    settle,
    /* The sun's irradiance, for the far points' light (look.js moves it). */
    setSun(irradiance) {
      farMat.uniforms.uSunI.value = irradiance;
    },
    stats: () => ({ ...stats }),
    dispose() {
      for (const g of [nearGeo, midGeo, trunkGeo, farGeo]) {
        g.dispose();
      }
      for (const m of [crownMat, trunkMat, farMat]) {
        m.dispose();
      }
      group.removeFromParent();
    },
  };
}
