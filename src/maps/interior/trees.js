/*
 * trees.js: the Interior's forest drawn from canopy.js's own trees
 * (TECH-NEEDS N2: "same data drives the drawn trees, so what you see
 * matches what the room decides").
 *
 * Every tree the room's line of sight tests is a crown drawn where it
 * stands, as big as it is, in four tiers by distance:
 *
 *   near    chunks to NEAR_M: each crown a lumpy twenty sided ball
 *           subdivided once (80 triangles), its trunk under it, casting
 *           shadows;
 *   mid     chunks to MID_M: each crown the plain twenty sided ball (20),
 *           drawn only while the tree itself is nearer than its own
 *           hand over distance (below);
 *   points  chunks from PTS_LO to PTS_HI: each tree one point, shaded in
 *           the fragment as the ellipsoid it is (its outline, its normal),
 *           by the same lit material as the balls, from its hand over
 *           distance to PTS_M's;
 *   blocks  past PTS_M to FAR_M: one point a FAR_BLOCK square of forest,
 *           four crowns' domes in one disc, made once at load.
 *
 * THE HAND OVERS ARE PER TREE, NOT PER CHUNK. A chunk is a square, and a
 * tier that ends on chunks ends in straight lines: round 0's "forest
 * block that ends in a map square" was the mid tier's crowns meeting the
 * old far points on CHUNK's grid. Now the mid balls and the points both
 * hold the trees round the hand over and the GPU picks one for each
 * tree by its own distance against a threshold jittered by its own seed
 * across a band (MID_BAND, PTS_BAND), so the edge is a soft ragged ring
 * with no line in it. A tier's chunks reach a chunk's half diagonal and
 * some relief (CHUNK_SLOP) past its hand over, so every tree the GPU
 * gives it is in it.
 *
 * THE CROWNS are the asset library's (src/render/library/crowns.js);
 * this file places them. Their look is in the fragment, so the geometry
 * the room's line of sight is held to (canopy-los.js casts at the near and mid meshes on
 * the CPU) is untouched. A ball's pixel is kept only where its ray meets
 * the true ellipsoid, lobed a few decimetres in, and is lit by that
 * ellipsoid's normal, so no outline is a polygon's and no face is flat,
 * and nothing is drawn outside the crown canopyBlocks tests. A crown is
 * darker underneath and lit and yellower at its top, broken into clumps
 * of leaves (a value noise in world metres, bump and albedo, faded out
 * as it gets under a pixel), and rimmed by the low sun coming through its
 * outer leaves. Its green is its stand's: species grow in patches, so a noise
 * over the forest picks each tree's place on a palette from dark green
 * to olive and yellow green, the tree's own hash moving it a step or
 * two; a few dry crowns, and the lapacho's pink and yellow rare and
 * muted, as a tree in flower is one crown in hundreds.
 *
 * The crowns' sizes are canopy.js's ellipsoids: the ball's unit radius
 * scaled to r across and ry up, centred at cy, and scaled once more by
 * its own fit (fitOf), so its faces sit as far inside the true crown as
 * its corners stand outside: scripts/canopy-los.js measures how often the
 * drawn crowns and canopyBlocks disagree, which is only ever within a
 * few decimetres of a crown's skin.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { HALF } from '../../share/interior/frame.js';
import {
  KIND, STAND, TREE_CELL, hash01, noise,
} from '../../share/interior/canopy.js';
import { LAND } from '../../share/interior/world.js';
import { opened } from '../../share/interior/places.js';
import { thermalKind } from '../../render/thermal.js';
import { makeLit } from '../../render/library/lit.js';
import { crownGeometry, crownMaterial, fitOf } from '../../render/library/crowns.js';

export const CHUNK = 256;
export const NEAR_M = 300;
export const MID_M = 1200;
export const FAR_M = 14000;
/* The mid balls hand a tree to the points at MID_HAND less up to
 * MID_BAND by its seed; the points hand it to the blocks at PTS_M less
 * up to PTS_BAND, metres from the camera. */
/* How far a tree's crown can stand from its chunk's middle as distOf
 * measures it, metres: the half diagonal (181) and, measured over the
 * whole map, at most 50 m between a crown's middle and the chunk middle's
 * ground plus 12, so at most 188 m, and a margin. */
const CHUNK_SLOP = 210;
const MID_HAND = MID_M - CHUNK_SLOP;
const MID_BAND = 160;
const PTS_M = 2600;
const PTS_BAND = 320;
const PTS_LO = MID_HAND - MID_BAND - CHUNK_SLOP;
const PTS_HI = PTS_M + CHUNK_SLOP;
const FAR_BLOCK = 16;
/* Main thread time a frame may spend making chunks' instance lists. */
const BUILD_MS = 3;
/* The instance capacity of each tier: the most crowns its reach can
 * hold at the forest's density, with room. */
const NEAR_CAP = 24000;
const MID_CAP = 90000;
const PTS_CAP = 480000;

/* Crown albedos, linear, in the order a stand walks them: dark green,
 * green, fresh yellow green, olive, grey green. A forest late in
 * the dry season (BIBLE.md 2.3), semi deciduous: most crowns green, a
 * few turning. */
const PALETTE = [
  [0.018, 0.046, 0.026], [0.028, 0.062, 0.026], [0.042, 0.086, 0.024], [0.06, 0.106, 0.026],
  [0.056, 0.086, 0.03], [0.064, 0.08, 0.034], [0.042, 0.066, 0.036],
];
/* How dark a crown goes for the crowns over it: the factor's floor, and
 * what a block of the far forest takes as a stand's average (the points
 * in front of it are darkened one by one; a block is a dozen crowns and
 * has no neighbours of its own to read). Measured on the chunk round the
 * camp: 877 trees, factors spread from the floor to 1 with a fifth of
 * them (the emergents and the proud crowns) at 1, mean 0.80. */
const OCC_FLOOR = 0.35;
const OCC_FAR = 0.8;
const DRY = [0.078, 0.07, 0.046];
const PINK = [0.16, 0.06, 0.09];
const YELLOW = [0.17, 0.13, 0.03];
const KIND_TONE = [];
KIND_TONE[KIND.broadleaf] = [1, 1, 1];
KIND_TONE[KIND.emergent] = [1, 1, 1];
KIND_TONE[KIND.lone] = [1, 1, 1];
KIND_TONE[KIND.palm] = [1.1, 1.1, 1];
KIND_TONE[KIND.shrub] = [1.3, 1.18, 1.05];
const out3 = [0, 0, 0];
/* A tree's crown colour into out3. `flowers` false for a block, a
 * dozen crowns' worth: one tree in flower is no block's colour. */
function crownColour(t, flowers = true) {
  const roof = t.kind === KIND.broadleaf || t.kind === KIND.emergent;
  if (flowers && roof && t.tint > 0.9986) {
    return PINK;
  }
  if (flowers && roof && t.tint > 0.9978) {
    return YELLOW;
  }
  const r1 = hash01(Math.floor(t.tint * 4096), 7, 41);
  const r2 = hash01(Math.floor(t.tint * 4096), 9, 43);
  const r3 = hash01(Math.floor(t.tint * 4096), 11, 53);
  if (r1 > 0.992) {
    return DRY;
  }
  /* The stand: a noise 70 m a feature, a noise 220 m a feature, and the
   * region's lean a noise 500 m a feature, so a slope of the forest is
   * olive and the next a darker green, and from 450 m up the roof is
   * patches of lighter and darker stands and not one carpet. */
  const stand = noise(t.x, t.z, 70, 31) * 0.5 + noise(t.x, t.z, 220, 35) * 0.25 + noise(t.x, t.z, 500, 33) * 0.25;
  const f = Math.min(0.999, Math.max(0, stand * 1.5 - 0.25 + (r1 - 0.5) * 0.7)) * PALETTE.length;
  const k = Math.floor(f);
  const a = PALETTE[k];
  const b = PALETTE[Math.min(PALETTE.length - 1, k + 1)];
  const u = f - k;
  const lum = 0.72 + 0.5 * r2;
  /* Each tree's own lean, blue green to yellow green: two neighbours of
   * one stand are not one colour. */
  const lean = r3 - 0.5;
  /* A palm's fronds a little lighter; a shrub's scrub paler, drier and
   * yellower than the roof over it. */
  const [kr, kg, kb] = KIND_TONE[t.kind];
  out3[0] = (a[0] + (b[0] - a[0]) * u) * lum * kr * (1 - 0.3 * lean);
  out3[1] = (a[1] + (b[1] - a[1]) * u) * lum * kg;
  out3[2] = (a[2] + (b[2] - a[2]) * u) * lum * kb * (1 + 0.5 * lean);
  return out3;
}
/* A tree's seed for the hand overs, in [0, 1), not its colour's. */
const seedOf = (t) => hash01(Math.floor(t.tint * 65536), 3, 47);


/* The trunks' bark: swiss2's photographed bark (`bark` its { map,
 * normalMap }), wrapped twice round a trunk and repeated up it every
 * metre and a half whatever the trunk's height, so a tall trunk's bark is
 * no coarser than a short one's. A grey brown under it, as the region's
 * hardwoods are. Without `bark`, the plain grey brown. */
function trunkMaterial(THREE, bark) {
  if (!bark) {
    return new THREE.MeshStandardMaterial({ color: 0x3a3631, roughness: 1, metalness: 0 });
  }
  const mat = new THREE.MeshStandardMaterial({
    color: 0x666a6a, map: bark.map, normalMap: bark.normalMap, roughness: 1, metalness: 0,
  });
  mat.onBeforeCompile = (shader) => {
    const anchor = '#include <uv_vertex>';
    if (!shader.vertexShader.includes(anchor)) {
      throw new Error(`interior trees: three's vertex shader has no ${anchor} to patch`);
    }
    shader.vertexShader = shader.vertexShader.replace(anchor, `${anchor}
      {
        vec2 trunkUv = vec2(uv.x * 2.0, uv.y * length(instanceMatrix[1].xyz) / 1.5);
        vMapUv = trunkUv;
        vNormalMapUv = trunkUv;
      }`);
  };
  mat.customProgramCacheKey = () => 'interior-trunk';
  return mat;
}

/* THE CROWNS' SHADE ON EACH OTHER: no tier past the near one casts a
 * shadow, so from 450 m up the roof was one bright carpet with no depth.
 * Each tree's factor, OCC_FLOOR to 1, by the crowns that stand over it
 * among those it touches (its neighbours within two squares, read from a
 * box a crown wider than the chunk so a chunk's edge is no seam): a crown
 * buried under taller neighbours darkens, an emergent over the roof
 * keeps all its light. Baked into the crown's colour, so every tier and
 * every hour of the clock has it for nothing on the GPU. */
function occlusionOf(list, around, x0, z0) {
  const out = new Float32Array(list.length).fill(1);
  const grid = new Map();
  for (const t of around) {
    grid.set(Math.floor((t.x - x0) / TREE_CELL + 4) * 1024 + Math.floor((t.z - z0) / TREE_CELL + 4), t);
  }
  list.forEach((t, k) => {
    const top = t.ground + t.h;
    let sum = 0;
    const ci = Math.floor((t.x - x0) / TREE_CELL + 4);
    const cj = Math.floor((t.z - z0) / TREE_CELL + 4);
    for (let j = -2; j <= 2; j += 1) {
      for (let i = -2; i <= 2; i += 1) {
        const n = grid.get((ci + i) * 1024 + cj + j);
        if (!n || n === t) {
          continue;
        }
        const reach = t.r + n.r + 2;
        const d = Math.hypot(n.x - t.x, n.z - t.z);
        const rise = n.ground + n.h - top;
        if (d >= reach || rise <= 0) {
          continue;
        }
        sum += (1 - d / reach) * Math.min(1, rise / 6);
      }
    }
    out[k] = Math.max(OCC_FLOOR, 1 / (1 + 2.5 * sum));
  });
  return out;
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
  THREE, scene, quality, canopy, world, bark,
}) {
  const group = new THREE.Group();
  group.name = 'interior-trees';
  scene.add(group);
  const viewPx = { value: 450 };
  const nearGeo = crownGeometry(THREE, 1, 0.12);
  const midGeo = crownGeometry(THREE, 0, 0.08);
  const nearFit = fitOf(nearGeo);
  const midFit = fitOf(midGeo);
  const nearMat = crownMaterial(THREE, 0, { uCrFit: { value: nearFit } });
  const midMat = crownMaterial(THREE, 1, { uCrFit: { value: midFit }, uCrHand: { value: new THREE.Vector2(MID_HAND, MID_BAND) } });
  const ptsMat = crownMaterial(THREE, 2, {
    uCrBand: { value: new THREE.Vector4(MID_HAND, MID_BAND, PTS_M, PTS_BAND) }, uCrPx: viewPx,
  });
  const blockBand = new THREE.Vector4(PTS_M, PTS_BAND, FAR_M, 0);
  const blockMat = crownMaterial(THREE, 3, {
    uCrBand: { value: blockBand }, uCrPx: viewPx,
  });
  /* The balls are meshes, which the look's finishScene gives its one
   * sun from two cascades; the points are not, so they take it here, or
   * they would be lit twice. */
  const lit = makeLit();
  lit(ptsMat);
  lit(blockMat);
  const trunkMat = thermalKind(trunkMaterial(THREE, bark), 'vegetation');
  const midSeed = new THREE.InstancedBufferAttribute(new Float32Array(MID_CAP), 1);
  midSeed.setUsage(THREE.DynamicDrawUsage);
  midGeo.setAttribute('aSeed', midSeed);
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 1, 5, 1, true);
  trunkGeo.translate(0, 0.5, 0);
  const near = new THREE.InstancedMesh(nearGeo, nearMat, NEAR_CAP);
  const mid = new THREE.InstancedMesh(midGeo, midMat, MID_CAP);
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

  /* A point layer: positions (the crown's middle), colours and shapes
   * (r, ry, seed), `cap` of each, drawn by `mat`. */
  function pointLayer(cap, mat, name, dynamic) {
    const geo = new THREE.BufferGeometry();
    const attrs = [['position', 3], ['color', 3], ['aShape', 3]].map(([n, k]) => {
      const a = new THREE.BufferAttribute(new Float32Array(cap * k), k);
      if (dynamic) {
        a.setUsage(THREE.DynamicDrawUsage);
      }
      geo.setAttribute(n, a);
      return a;
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.receiveShadow = true;
    pts.name = name;
    /* The disc's size in pixels needs the target's height, which only
     * the renderer knows as it draws. */
    const vp = new THREE.Vector4();
    pts.onBeforeRender = (renderer) => {
      renderer.getCurrentViewport(vp);
      viewPx.value = vp.w * 0.5;
    };
    group.add(pts);
    return { geo, pts, attrs };
  }
  const ptsLayer = pointLayer(PTS_CAP, ptsMat, 'interior-crowns-points', true);
  ptsLayer.geo.setDrawRange(0, 0);

  /* Per chunk: its trees as point data, made on demand and kept, and as
   * instance matrices once a ball tier first wants it. */
  const chunks = new Map();
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  function makeChunk(ci, cj) {
    const x0 = -HALF + ci * CHUNK;
    const z0 = -HALF + cj * CHUNK;
    /* The chunk's trees and, two squares round them, the neighbours
     * that shade them. */
    const around = canopy.treesIn(x0 - 2 * TREE_CELL, z0 - 2 * TREE_CELL, x0 + CHUNK + 2 * TREE_CELL, z0 + CHUNK + 2 * TREE_CELL, []);
    const list = around.filter((t) => t.x >= x0 && t.x < x0 + CHUNK && t.z >= z0 && t.z < z0 + CHUNK);
    const occ = occlusionOf(list, around, x0, z0);
    const at = new Float32Array(list.length * 3);
    const shape = new Float32Array(list.length * 3);
    const cols = new Float32Array(list.length * 3);
    const seeds = new Float32Array(list.length);
    /* What the balls' matrices need besides: the tint (its turn), the
     * ground and whether it is a palm (its trunk). */
    const extra = new Float32Array(list.length * 3);
    list.forEach((t, k) => {
      extra[k * 3] = t.tint;
      extra[k * 3 + 1] = t.ground;
      extra[k * 3 + 2] = t.kind === KIND.palm ? 1 : 0;
      at[k * 3] = t.x;
      at[k * 3 + 1] = t.cy;
      at[k * 3 + 2] = t.z;
      seeds[k] = seedOf(t);
      shape[k * 3] = t.r;
      shape[k * 3 + 1] = t.ry;
      shape[k * 3 + 2] = seeds[k];
      const c = crownColour(t);
      cols[k * 3] = c[0] * occ[k];
      cols[k * 3 + 1] = c[1] * occ[k];
      cols[k * 3 + 2] = c[2] * occ[k];
    });
    const ch = {
      ci, cj, n: list.length, at, shape, cols, seeds, extra, crowns: null, tier: -1, pts: false,
    };
    chunks.set(chunkKey(ci, cj), ch);
    return ch;
  }
  function chunkMatrices(ch) {
    const {
      n, at, shape, extra,
    } = ch;
    ch.crowns = new Float32Array(n * 16);
    ch.crownsMid = new Float32Array(n * 16);
    ch.trunks = new Float32Array(n * 16);
    for (let k = 0; k < n; k += 1) {
      const x = at[k * 3];
      const cy = at[k * 3 + 1];
      const z = at[k * 3 + 2];
      const r = shape[k * 3];
      const ry = shape[k * 3 + 1];
      const ground = extra[k * 3 + 1];
      q.setFromAxisAngle(yAxis, extra[k * 3] * 6.283);
      pos.set(x, cy, z);
      scl.set(r * nearFit, ry * nearFit, r * nearFit);
      m4.compose(pos, q, scl);
      m4.toArray(ch.crowns, k * 16);
      scl.set(r * midFit, ry * midFit, r * midFit);
      m4.compose(pos, q, scl);
      m4.toArray(ch.crownsMid, k * 16);
      const base = cy - ry * 0.7;
      pos.set(x, ground - 0.3, z);
      const thick = extra[k * 3 + 2] ? 1.4 : 1 + r * 0.25;
      scl.set(thick, base - ground + 0.3, thick);
      m4.compose(pos, q, scl);
      m4.toArray(ch.trunks, k * 16);
    }
  }

  /* THE BLOCKS: a point a FAR_BLOCK square that canopy.js grows closed
   * or gallery forest on (or shrub land) and not opened, at the block's middle jittered, as wide as a block
   * and a half so the forest closes, over the whole of the ground's data
   * (the ground is drawn to its edge, and a forest that stopped short
   * left a bare band round the map). */
  const farHalf = HALF;
  const farPos = [];
  const farCol = [];
  const farShape = [];
  for (let z = -farHalf; z < farHalf; z += FAR_BLOCK) {
    for (let x = -farHalf; x < farHalf; x += FAR_BLOCK) {
      const bi = Math.floor((x + HALF) / FAR_BLOCK);
      const bj = Math.floor((z + HALF) / FAR_BLOCK);
      const px = x + FAR_BLOCK * (0.2 + 0.6 * hash01(bi, bj, 21));
      const pz = z + FAR_BLOCK * (0.2 + 0.6 * hash01(bi, bj, 22));
      /* The closed forest and the gallery forest, as canopy.js grows
       * them (a gallery along a creek through pasture is forest too). */
      const stand = canopy.standAt(px, pz);
      if (stand !== STAND.closed && stand !== STAND.gallery) {
        continue;
      }
      const cls = world.landAt(px, pz);
      if (opened(px, pz, 4)) {
        continue;
      }
      /* The block's own tree for its height: the one in the square its
       * middle falls in, if any. */
      const t = canopy.treeAt(Math.floor((px + HALF) / TREE_CELL), Math.floor((pz + HALF) / TREE_CELL));
      const h = t && t.kind === KIND.broadleaf ? t.h : 14;
      const r = cls === LAND.shrub ? FAR_BLOCK * 0.4 : FAR_BLOCK * 0.72;
      const ry = Math.min(r, 0.42 * h);
      farPos.push(px, world.groundAt(px, pz) + h - ry, pz);
      const c = crownColour({
        x: px, z: pz, tint: t ? t.tint : hash01(bi, bj, 23), kind: KIND.broadleaf,
      }, false);
      farCol.push(c[0] * OCC_FAR, c[1] * OCC_FAR, c[2] * OCC_FAR);
      farShape.push(r, ry, hash01(bi, bj, 24));
    }
  }
  const farGeo = new THREE.BufferGeometry();
  farGeo.setAttribute('position', new THREE.Float32BufferAttribute(farPos, 3));
  farGeo.setAttribute('color', new THREE.Float32BufferAttribute(farCol, 3));
  farGeo.setAttribute('aShape', new THREE.Float32BufferAttribute(farShape, 3));
  const far = new THREE.Points(farGeo, blockMat);
  far.frustumCulled = false;
  far.receiveShadow = true;
  far.name = 'interior-crowns-far';
  {
    const vp = new THREE.Vector4();
    far.onBeforeRender = (renderer) => {
      renderer.getCurrentViewport(vp);
      viewPx.value = vp.w * 0.5;
    };
  }
  group.add(far);

  /* A chunk's distance from a camera at cam, as the tiers measure it. */
  const distOf = (ci, cj, cam) => {
    const mx = -HALF + (ci + 0.5) * CHUNK;
    const mz = -HALF + (cj + 0.5) * CHUNK;
    const my = world.groundAt(mx, mz) + 12;
    return Math.sqrt((mx - cam.x) ** 2 + (my - cam.y) ** 2 + (mz - cam.z) ** 2);
  };

  let wanted = [];
  let moved = true;
  let ballKey = '';
  let ptsKey = '';
  const last = new THREE.Vector3(Infinity, 0, 0);
  const stats = {
    chunks: 0, near: 0, mid: 0, points: 0, far: farPos.length / 3, built: 0, pending: 0, lastMs: 0,
  };

  function refillBalls(ready) {
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
        midSeed.array.set(ch.seeds, m);
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
    midSeed.needsUpdate = true;
    stats.near = n;
    stats.mid = m;
  }

  function refillPoints(ready) {
    const [pa, ca, sa] = ptsLayer.attrs;
    let n = 0;
    for (const ch of ready) {
      if (!ch.pts || n + ch.n > PTS_CAP) {
        continue;
      }
      pa.array.set(ch.at, n * 3);
      ca.array.set(ch.cols, n * 3);
      sa.array.set(ch.shape, n * 3);
      n += ch.n;
    }
    for (const a of ptsLayer.attrs) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * 3);
      a.needsUpdate = true;
    }
    ptsLayer.geo.setDrawRange(0, n);
    stats.points = n;
  }

  function view(camera) {
    const cam = camera.position;
    const t0 = performance.now();
    /* The chunks a tier wants for this camera, nearest tier first. */
    if (cam.distanceTo(last) > 24 || moved) {
      const reach = Math.ceil(PTS_HI / CHUNK) + 1;
      const ci0 = Math.floor((cam.x + HALF) / CHUNK);
      const cj0 = Math.floor((cam.z + HALF) / CHUNK);
      const list = [];
      const max = Math.floor((2 * HALF) / CHUNK) - 1;
      for (let cj = Math.max(0, cj0 - reach); cj <= Math.min(max, cj0 + reach); cj += 1) {
        for (let ci = Math.max(0, ci0 - reach); ci <= Math.min(max, ci0 + reach); ci += 1) {
          const d = distOf(ci, cj, cam);
          const tier = d < NEAR_M ? 0 : d < MID_M ? 1 : 2;
          const pts = d >= PTS_LO && d < PTS_HI;
          if (tier < 2 || pts) {
            list.push({
              ci, cj, tier, pts, d,
            });
          }
        }
      }
      list.sort((a, b) => a.tier - b.tier || a.d - b.d);
      wanted = list;
      last.copy(cam);
      moved = false;
    }
    let pending = 0;
    const ready = [];
    for (const w of wanted) {
      let ch = chunks.get(chunkKey(w.ci, w.cj));
      if (!ch || (w.tier < 2 && !ch.crowns)) {
        if (performance.now() - t0 > BUILD_MS) {
          pending += 1;
          continue;
        }
        ch = ch || makeChunk(w.ci, w.cj);
        if (w.tier < 2) {
          chunkMatrices(ch);
        }
        stats.built += 1;
      }
      ch.tier = w.tier;
      ch.pts = w.pts;
      ready.push(ch);
    }
    /* Refill a layer only when the chunks it draws changed. */
    let bk = '';
    let pk = '';
    for (const ch of ready) {
      if (ch.tier < 2) {
        bk += `${ch.ci},${ch.cj},${ch.tier};`;
      }
      if (ch.pts) {
        pk += `${ch.ci},${ch.cj};`;
      }
    }
    if (bk !== ballKey) {
      refillBalls(ready);
      ballKey = bk;
    }
    if (pk !== ptsKey) {
      refillPoints(ready);
      ptsKey = pk;
    }
    stats.chunks = chunks.size;
    stats.pending = pending;
    /* While chunks are still being made (a jump of the camera), the
     * blocks stand in from the balls' hand over, so the forest a point
     * has not reached yet is there, coarse, and not missing. */
    blockBand.x = pending ? MID_HAND : PTS_M;
    blockBand.y = pending ? MID_BAND : PTS_BAND;
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
    points: ptsLayer.pts,
    view,
    settle,
    /* The look moves the sun's light itself; the crowns are lit
     * materials. Kept for the map's call. */
    setSun() {},
    stats: () => ({ ...stats }),
    dispose() {
      for (const g of [nearGeo, midGeo, trunkGeo, farGeo, ptsLayer.geo]) {
        g.dispose();
      }
      for (const m of [nearMat, midMat, ptsMat, blockMat, trunkMat]) {
        m.dispose();
      }
      group.removeFromParent();
    },
  };
}
