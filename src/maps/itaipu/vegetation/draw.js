/*
 * draw.js: the vegetation as it is drawn. Three things:
 *
 * THE TREES round the camera, every one of them a planted tree
 * (plant.js), drawn as swiss2 draws its broadleaves (swiss2/vegetation/
 * species.js and plantmat.js): the whole model near, the reduced model in
 * the middle distance, the two dissolving into each other across a fade.
 * Every kind but the palm is swiss2's broadleaf generator; the palm is
 * built here (palm), fronds of the atlas's flat spray round a slender
 * trunk. Each kind's leaves carry its own green in the vertex colours,
 * lighter and yellower at the crown's rim where the sun comes through
 * the outer leaves, so a forest is many greens and not one.
 *
 * THE FAR TREES, past the models' band: swiss2's impostors
 * (swiss2/vegetation/impostor.js), every kind photographed from 24 sides
 * at load and drawn as one camera facing quad a tree, all kinds in one
 * draw. They carry on where nothing else draws a tree: the fields', the
 * parks', the eucalyptus rows, the forest's edge and its emergents
 * standing over the canopy, to FAR. The closed forest's inside stops at
 * the models' band, where the canopy below takes over.
 *
 * THE CANOPY, the forest's far drawing: one surface over the whole
 * forest at the height the canopy model gives it, one batch of chunks
 * (SHELL_CHUNK), coloured by the satellite (vertex colours, the same reflectance
 * the ground's material decodes, look/ground.js) and shaded in the
 * fragment as crowns: a cell pattern ten metres across whose cells are
 * domes, dark in the gaps between them, each crown its own brightness,
 * with a finer one of the clumps inside a crown, and bigger crowns over
 * the small ones here and there. Seen from the air a closed forest is
 * that: a carpet of crowns. Inside the trees' band the surface sinks to
 * the forest's understorey, dark between the drawn trees, and rises to
 * the canopy's top across the band the trees dissolve in. Where the
 * forest ends the surface drops to the ground in one grid cell, a sloped
 * skirt shaded as leaves.
 *
 * Nothing here is physics: the colliders and the forest volume are
 * plant.js's, and the palm's colliders (palmClumps) are placed from the
 * same numbers its fronds are.
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
import { makeRng } from '../../alps/noise.js';
import { REGIONS } from '../../swiss2/vegetation/atlas.js';
import {
  buildVariant, crownClumps, triangles, CLUMP_REACH,
} from '../../swiss2/vegetation/species.js';
import { plantMaterial, plantDepthMaterial } from '../../swiss2/vegetation/plantmat.js';
import { bakeImpostors, impostorMaterial, impostorDepthMaterial } from '../../swiss2/vegetation/impostor.js';
import {
  HALF, KINDS, YAW_COS, YAW_SIN,
} from './plant.js';
import { FOREST_GRADE, noiseTexture } from '../look/ground.js';
import { thermalKind } from '../../../render/thermal.js';

/*
 * The bands per preset, m: the whole model to `near`, the reduced model
 * to `mid`, each dissolving over `fade`, and the impostors from there to
 * `far`, dissolving out over `farFade`; caps are instances per kind and
 * level, and `capFar` impostors. `shell` is the canopy's grid, m.
 */
export const TIERS = {
  high: {
    near: 70, mid: 220, far: 2500, fade: 14, farFade: 250, capNear: 1500, capMid: 6000, capFar: 30000, shell: 20,
  },
  medium: {
    near: 40, mid: 170, far: 1800, fade: 10, farFade: 200, capNear: 700, capMid: 3500, capFar: 20000, shell: 20,
  },
  low: {
    near: 0, mid: 120, far: 1200, fade: 8, farFade: 150, capNear: 0, capMid: 2000, capFar: 12000, shell: 20,
  },
};

/* Each kind's green over swiss2's atlas, which was painted for a Bernese
 * beech: the Atlantic forest in December is deeper and bluer, the second
 * canopy tree (the edge's young growth) brighter, a tree alone in a
 * pasture lighter, a eucalyptus grey, an emergent's sunlit top yellower
 * and a palm yellow. In KINDS' order (plant.js). */
const TINTS = [
  [0.6, 0.74, 0.56],
  [0.68, 0.8, 0.58],
  [0.8, 0.88, 0.7],
  [0.72, 0.8, 0.74],
  [0.72, 0.78, 0.54],
  [1.02, 1.12, 0.66],
];
/* The rim's lift: at the crown's shell its leaves are this much lighter
 * and yellower, rising from RIM0 of the crown's radii out. */
const RIM = [0.12, 0.15, -0.03];
const RIM0 = 0.7;

const UP = new THREE.Vector3(0, 1, 0);

/* swiss2's species.js Builder, which it does not export: the attributes
 * its plant materials read. */
class Mesher {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.col = [];
    this.flex = [];
    this.idx = [];
  }

  vert(p, n, u, v, c, f) {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.col.push(c[0], c[1], c[2]);
    this.flex.push(f);
    return this.pos.length / 3 - 1;
  }

  strip(a, b) {
    for (let k = 0; k + 1 < a.length; k += 1) {
      this.idx.push(a[k], b[k], a[k + 1], a[k + 1], b[k], b[k + 1]);
    }
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aFlex', new THREE.Float32BufferAttribute(this.flex, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/* The palm's proportions in its model's height: the trunk's radius at the
 * foot, a frond's length, and the crown's head, which the colliders
 * (palmClumps) and the fronds share. */
const PALM_R = 0.017;
const PALM_FROND = 0.36;
const palmHead = (v) => {
  const rng = makeRng(v.seed * 7);
  return { top: v.trunk * v.h, bx: (rng() - 0.5) * 0.08 * v.h, bz: (rng() - 0.5) * 0.08 * v.h };
};

/*
 * A jeriva (Syagrus romanzoffiana), the palm of every pasture and park
 * round the dam: a slender grey trunk and a head of arching feathery
 * fronds, the top ones rising, the lowest hanging, a dead one or two
 * brown under them. A frond is two cards of the atlas's flat fir spray
 * (a stem with leaflets both sides, which is what a pinnate frond is)
 * along its arch, rolled either side of level into a shallow V, as the
 * jeriva's leaflets stand in more than one plane. 'mid' has half the
 * fronds on fewer segments, and the trunk from the atlas's bark strip.
 */
function palm(variant, lod) {
  const near = lod === 'near';
  const rng = makeRng(variant.seed * 7 + (near ? 1 : 4));
  const H = variant.h;
  const foliage = new Mesher();
  const barkB = near ? new Mesher() : foliage;
  const strip = REGIONS.bark;
  const region = REGIONS.fir;
  const { top, bx, bz } = palmHead(variant);
  const r0 = PALM_R * H;
  const sides = near ? 7 : 4;
  const rows = near ? 6 : 1;
  const rings = [];
  for (let j = 0; j <= rows; j += 1) {
    const t = j / rows;
    const y = top * t;
    const r = r0 * (1 - 0.25 * t) + r0 * 0.6 * Math.exp(-y / 0.5);
    const cx = bx * t * t;
    const cz = bz * t * t;
    const boot = t > 0.93 ? 0.7 : 1;
    const ring = [];
    for (let i = 0; i <= sides; i += 1) {
      const a = (i / sides) * Math.PI * 2;
      const n = new THREE.Vector3(Math.cos(a), 0.05, Math.sin(a)).normalize();
      const p = new THREE.Vector3(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r);
      const uv = near
        ? [(i / sides) * Math.max(1, Math.round((2 * Math.PI * r) / 0.9)), y / 1.1]
        : [strip.u0 + (i / sides) * strip.du, strip.v0 + t * strip.dv];
      const c = (0.78 + 0.12 * t) * boot;
      ring.push(barkB.vert(p, n, uv[0], uv[1], [c, c * 0.98, c * 0.93], 0));
    }
    rings.push(ring);
  }
  for (let j = 0; j < rows; j += 1) {
    barkB.strip(rings[j], rings[j + 1]);
  }
  const head = new THREE.Vector3(bx, top, bz);
  const fronds = near ? 16 : 8;
  const frond = (a, pitch, L, droop, colourAt, rolls) => {
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const path = (u) => head.clone()
      .addScaledVector(dir, L * u * Math.cos(pitch))
      .addScaledVector(UP, L * (u * Math.sin(pitch) - droop * u * u));
    const tangent = (u) => path(Math.min(1, u + 0.02)).sub(path(Math.max(0, u - 0.02))).normalize();
    const nrm = dir.clone().multiplyScalar(0.45).addScaledVector(UP, 0.55).normalize();
    for (const roll of rolls) {
      card(foliage, {
        path,
        side: (u) => {
          const tg = tangent(u);
          const sd = new THREE.Vector3().crossVectors(UP, tg).normalize();
          const bi = new THREE.Vector3().crossVectors(tg, sd);
          return sd.multiplyScalar(Math.cos(roll)).addScaledVector(bi, Math.sin(roll));
        },
        w: (u) => L * 0.16 * (0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, 0.15 + u))),
        segs: near ? 4 : 2,
        region,
        colour: colourAt,
        normalAt: () => nrm,
        flexAt: (u) => 0.35 + 0.65 * u,
      });
    }
  };
  for (let i = 0; i < fronds; i += 1) {
    const s = i / (fronds - 1);
    const a = i * 2.39996 + rng() * 0.4;
    const pitch = 1.05 - 1.45 * s + (rng() - 0.5) * 0.25;
    const L = PALM_FROND * H * (0.85 + 0.25 * rng()) * (s < 0.15 ? 0.8 : 1);
    const tint = 0.9 + 0.2 * rng();
    const colourAt = (u) => {
      const ao = (0.62 + 0.38 * u) * (0.8 + 0.2 * (1 - s)) * tint;
      return [ao, ao, ao];
    };
    frond(a, pitch, L, 0.25 + 0.45 * s, colourAt, [0.55, -0.55]);
  }
  if (near) {
    for (let i = 0; i < 2; i += 1) {
      const a = rng() * Math.PI * 2;
      frond(a, -1.25, PALM_FROND * H * 0.8, 0.1, () => [0.95, 0.72, 0.42], [0]);
    }
  }
  return { foliage: foliage.geometry(), bark: near ? barkB.geometry() : null };
}

/* A card along a path, as swiss2's species.js card(), which it does not
 * export. */
function card(b, { path, side, w, segs, region, colour, normalAt, flexAt }) {
  const left = [];
  const right = [];
  for (let i = 0; i <= segs; i += 1) {
    const t = i / segs;
    const c = path(t);
    const s = side(t);
    const n = normalAt(t, c);
    const v = region.v0 + t * region.dv;
    const col = colour(t);
    const f = flexAt(t);
    left.push(b.vert(c.clone().addScaledVector(s, -w(t)), n, region.u0, v, col, f));
    right.push(b.vert(c.clone().addScaledVector(s, w(t)), n, region.u0 + region.du, v, col, f));
  }
  b.strip(left, right);
}

/*
 * Kind k's model at one level: swiss2's buildVariant or the palm, its
 * leaves tinted (TINTS, RIM), and the numbers the impostors need, as
 * buildVariant returns them.
 */
export function buildKind(k, lod) {
  const v = KINDS[k];
  if (v.kind !== 'palm') {
    const out = buildVariant(v, lod);
    tintLeaves(out.foliage, TINTS[k], { cy: 0.6 * v.h, rx: v.rx * v.h, ry: v.ry * v.h });
    return out;
  }
  const out = palm(v, lod);
  const { top } = palmHead(v);
  tintLeaves(out.foliage, TINTS[k], { cy: top, rx: PALM_FROND * v.h, ry: PALM_FROND * v.h * 0.6 });
  const box = new THREE.Box3();
  for (const g of [out.foliage, out.bark]) {
    if (g) {
      box.union(g.boundingBox);
    }
  }
  const crown = Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z);
  const cy = (box.min.y + box.max.y) / 2;
  const radius = Math.hypot(box.max.y - cy, crown) * 1.02;
  return { ...out, height: box.max.y, crown, cy, radius };
}

/* The leaves' vertex colours times the kind's green, lifted toward the
 * crown's rim. A leaf vertex is one with a flutter weight: the trunk and
 * the limbs, drawn from the bark strip in the far model, have little or
 * none (species.js: limbs 0.15 at most, leaf cards 0.35 at least). */
function tintLeaves(geo, tint, { cy, rx, ry }) {
  const pos = geo.getAttribute('position');
  const col = geo.getAttribute('color');
  const flex = geo.getAttribute('aFlex');
  for (let i = 0; i < pos.count; i += 1) {
    if (flex.getX(i) < 0.3) {
      continue;
    }
    const e = Math.hypot(pos.getX(i) / rx, (pos.getY(i) - cy) / ry, pos.getZ(i) / rx);
    const rim = Math.min(1, Math.max(0, (e - RIM0) / 0.35));
    for (let c = 0; c < 3; c += 1) {
      col.array[i * 3 + c] *= tint[c] * (1 + RIM[c] * rim);
    }
  }
  col.needsUpdate = true;
}

/*
 * Kind k's colliders' crown in its model's frame, the clumps
 * ({ x, y, z, r }) CROWN_SPHERES of which the streamed set holds, and its
 * trunk post. A broadleaf's are its crown's clumps, CLUMP_REACH out,
 * which are inside every drawn crown however a craft comes at it. A
 * palm's are four spheres round its head, where its fronds leave the
 * trunk: inside the frond ring, above the trunk it stands on.
 */
export function kindCrown(k) {
  const v = KINDS[k];
  if (v.kind === 'palm') {
    const { top, bx, bz } = palmHead(v);
    const reach = 0.1 * v.h;
    const r = 0.13 * v.h;
    const clumps = [[1, 0], [0, 1], [-1, 0], [0, -1]].map(([dx, dz]) => ({
      x: bx + dx * reach, y: top + 0.02 * v.h, z: bz + dz * reach, r,
    }));
    return {
      trunkTop: top, trunkR: PALM_R * v.h * 1.1, clumps, lowest: top + 0.02 * v.h - r,
    };
  }
  const { clumps } = crownClumps(v);
  return {
    trunkTop: v.trunk * v.h,
    trunkR: 0.3 * (v.h / 22) * 1.1,
    clumps: clumps.map((q) => ({
      x: q.c.x, y: q.c.y, z: q.c.z, r: q.rc * CLUMP_REACH,
    })),
    lowest: Math.min(...clumps.map((q) => q.c.y - q.rc * CLUMP_REACH)),
  };
}

/* How much lighter the far trees' leaves are photographed (bakeFar). */
const FAR_LIFT = 1.5;

/*
 * Photograph the kinds for the impostors. swiss2 bakes on the shell's
 * renderer, which a part is not handed (src/maps/itaipu.js), so this
 * bakes on a renderer of its own, on an offscreen canvas, and reads the
 * two atlases back into textures of the page's: the bytes as the bake
 * wrote them (the albedo sRGB encoded, the normals linear), mipmapped
 * where they are drawn. `builds` are buildKind's at 'near'.
 */
function bakeFar(builds, atlases, frame = 128) {
  const r = new THREE.WebGLRenderer({ canvas: new OffscreenCanvas(16, 16), antialias: false, alpha: true });
  /* The leaves photographed FAR_LIFT lighter than they are: the drawn
   * models also take the light through their leaves (plantmat.js
   * translucency), which a picture of them lit by the sun alone lacks,
   * and the far trees were a step darker than the near ones at the seam. */
  const lit = builds.map((b) => {
    const foliage = b.foliage.clone();
    const col = foliage.getAttribute('color');
    for (let i = 0; i < col.array.length; i += 1) {
      col.array[i] *= FAR_LIFT;
    }
    return { ...b, foliage };
  });
  try {
    const baked = bakeImpostors(r, lit, { foliage: atlases.foliage, bark: atlases.bark.map }, frame);
    const size = baked.albedo.image.width;
    const gl = r.getContext();
    const read = (tex, colorSpace) => {
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, r.properties.get(tex).__webglTexture, 0);
      const px = new Uint8Array(size * size * 4);
      gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, px);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fb);
      const t = new THREE.DataTexture(px, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
      t.colorSpace = colorSpace;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.anisotropy = 4;
      t.needsUpdate = true;
      /* Once on the GPU the 19 MB copy is not needed. */
      t.onUpdate = () => {
        t.image.data = null;
      };
      return t;
    };
    const albedo = read(baked.albedo, THREE.SRGBColorSpace);
    const normal = read(baked.normal, THREE.NoColorSpace);
    baked.dispose();
    return {
      albedo,
      normal,
      info: baked.info,
      frame,
      dispose() {
        albedo.dispose();
        normal.dispose();
      },
    };
  } finally {
    for (const b of lit) {
      b.foliage.dispose();
    }
    r.dispose();
    r.forceContextLoss();
  }
}

/*
 * swiss2's impostor shader finds a frame's cell in the atlas from the
 * frame's number as the varying brings it, by mod and floor, and the
 * number arrives a hair under the whole number it was: at a frame on the
 * atlas's left edge (every seventeenth) the floor lands a row short, and
 * the far crowns were black bands. Here the number is rounded first, in
 * the drawn and the shadow material alike. swiss2/vegetation/impostor.js
 * has the same line.
 */
const FRAME_CELL = /vec2 cell = vec2\(mod\(f, (\d+)\.0\), floor\(f \/ \d+\.0\)\);/;
function roundFrames(mat) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer);
    if (!FRAME_CELL.test(shader.fragmentShader)) {
      throw new Error('itaipu vegetation: swiss2\'s impostor frame lookup changed, and roundFrames no longer finds it');
    }
    shader.fragmentShader = shader.fragmentShader.replace(FRAME_CELL, (m, grid) => (
      `float fr = floor(f + 0.5); vec2 cell = vec2(mod(fr, ${grid}.0), floor(fr / ${grid}.0));`));
  };
  const key = mat.customProgramCacheKey();
  mat.customProgramCacheKey = () => `${key}|itaipu-rounded`;
}

/* The far trees' grid, m a cell: coarse, so the refill tests a few
 * hundred cells against the view and not every tree. */
const FAR_CELL = 250;

/*
 * The trees round the camera. `forest` is plantHero's; `atlases`
 * swiss2's (loadAtlases); `wind` swiss2's wind uniforms. Returns the
 * meshes (in `group`), update(camera) and the builds' triangle counts.
 */
export function treeLod({
  forest, atlases, tier, group, sunDir, wind,
}) {
  const nearOn = tier.near > 0;
  const builds = KINDS.map((v, k) => ({
    near: buildKind(k, 'near'),
    mid: buildKind(k, 'mid'),
  }));
  const baked = bakeFar(builds.map((b) => b.near), atlases);
  const bandNear = [-2, -1, tier.near - tier.fade, tier.near];
  const midIn = nearOn ? [tier.near - tier.fade, tier.near] : [-2, -1];
  const bandFar = [tier.mid - tier.fade, tier.mid, tier.far - tier.farFade, tier.far];
  const mats = {
    nearFoliage: plantMaterial('foliage', {
      map: atlases.foliage, band: bandNear, wind, translucency: 0.55,
    }),
    nearBark: plantMaterial('bark', { map: atlases.bark.map, normalMap: atlases.bark.normalMap, band: bandNear, wind }),
    mid: plantMaterial('foliage', {
      map: atlases.foliage, band: [...midIn, tier.mid - tier.fade, tier.mid], wind, translucency: 0.55,
    }),
    foliageDepth: plantDepthMaterial('foliage', { map: atlases.foliage, wind }),
    barkDepth: plantDepthMaterial('bark', { wind }),
    far: impostorMaterial(baked, bandFar),
  };
  mats.farDepth = impostorDepthMaterial(mats.far);
  for (const m of [mats.nearFoliage, mats.nearBark, mats.mid, mats.far]) {
    thermalKind(m, 'vegetation');
  }
  roundFrames(mats.far);
  roundFrames(mats.farDepth);
  /* The shadow pass draws a front sided material's back faces, and the
   * shadow billboard shows the sun its front (swiss2's vegetation). */
  mats.far.shadowSide = THREE.DoubleSide;
  const imp = mats.far.userData.impostor;
  if (sunDir) {
    imp.uImpLight.value.copy(sunDir).normalize();
  }

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
    const L = { near: null, bark: null, mid: null };
    if (nearOn) {
      L.near = mk(builds[k].near.foliage, mats.nearFoliage, mats.foliageDepth, tier.capNear, `${v.name}-near`);
      L.bark = mk(builds[k].near.bark, mats.nearBark, mats.barkDepth, tier.capNear, `${v.name}-bark`);
      L.bark.instanceMatrix = L.near.instanceMatrix;
    }
    L.mid = mk(builds[k].mid.foliage, mats.mid, mats.foliageDepth, tier.capMid, `${v.name}-mid`);
    return L;
  });

  /* The impostors: a quad instanced over the far trees in view, refilled
   * with the models. aTree is the instance's origin (as the models', 0.2 m
   * down) and scale, aTree2 its heading in radians and its kind, the
   * impostor atlas's variant. */
  const farGeo = new THREE.InstancedBufferGeometry();
  farGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  farGeo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  farGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const aTree = new THREE.InstancedBufferAttribute(new Float32Array(tier.capFar * 4), 4);
  const aTree2 = new THREE.InstancedBufferAttribute(new Float32Array(tier.capFar * 2), 2);
  aTree.setUsage(THREE.DynamicDrawUsage);
  aTree2.setUsage(THREE.DynamicDrawUsage);
  farGeo.setAttribute('aTree', aTree);
  farGeo.setAttribute('aTree2', aTree2);
  farGeo.instanceCount = 0;
  const farMesh = new THREE.Mesh(farGeo, mats.far);
  farMesh.name = 'itaipu-far-trees';
  farMesh.frustumCulled = false;
  farMesh.castShadow = true;
  farMesh.receiveShadow = true;
  farMesh.customDepthMaterial = mats.farDepth;
  farMesh.visible = false;
  group.add(farMesh);

  /* The far trees on their own coarse grid, each cell with the height its
   * trees stand between, for the view test. */
  const farGrid = (() => {
    const n = Math.ceil((2 * HALF) / FAR_CELL);
    const cellOf = (t) => {
      const i = Math.max(0, Math.min(n - 1, Math.floor((forest.x[t] + HALF) / FAR_CELL)));
      const j = Math.max(0, Math.min(n - 1, Math.floor((forest.z[t] + HALF) / FAR_CELL)));
      return j * n + i;
    };
    const start = new Uint32Array(n * n + 1);
    const y0 = new Float32Array(n * n).fill(Infinity);
    const y1 = new Float32Array(n * n).fill(-Infinity);
    let count = 0;
    for (let t = 0; t < forest.count; t += 1) {
      if (forest.far[t]) {
        const c = cellOf(t);
        start[c + 1] += 1;
        y0[c] = Math.min(y0[c], forest.y[t]);
        y1[c] = Math.max(y1[c], forest.y[t] + KINDS[forest.k[t]].h * forest.s[t]);
        count += 1;
      }
    }
    for (let c = 1; c <= n * n; c += 1) {
      start[c] += start[c - 1];
    }
    const at = start.slice();
    const items = new Uint32Array(count);
    for (let t = 0; t < forest.count; t += 1) {
      if (forest.far[t]) {
        items[at[cellOf(t)]++] = t;
      }
    }
    return {
      n, start, items, y0, y1, count,
    };
  })();

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
  const lastFar = new THREE.Vector3(Infinity, 0, 0);
  const lastFarDir = new THREE.Vector3();
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
    near: 0, mid: 0, far: 0, dropped: 0, refills: 0, farRefills: 0, farTrees: farGrid.count,
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

  /* The impostors round `pos`: the far trees of every cell in view past
   * the models' full band, to `far`. The cell's sphere is widened by the
   * shadow a tree its height throws, as the models' test is. */
  const fillFar = (pos) => {
    const { n, start, items, y0, y1 } = farGrid;
    const reach = tier.far + tier.fade;
    const from = tier.mid - tier.fade - 2;
    const i0 = Math.max(0, Math.floor((pos.x - reach + HALF) / FAR_CELL));
    const i1 = Math.min(n - 1, Math.floor((pos.x + reach + HALF) / FAR_CELL));
    const j0 = Math.max(0, Math.floor((pos.z - reach + HALF) / FAR_CELL));
    const j1 = Math.min(n - 1, Math.floor((pos.z + reach + HALF) / FAR_CELL));
    const run = Math.hypot(shadowRun.x, shadowRun.z);
    let m = 0;
    for (let j = j0; j <= j1; j += 1) {
      for (let i = i0; i <= i1; i += 1) {
        const c = j * n + i;
        if (start[c] === start[c + 1]) {
          continue;
        }
        const tall = y1[c] - y0[c];
        sphere.center.set(-HALF + (i + 0.5) * FAR_CELL, (y0[c] + y1[c]) * 0.5, -HALF + (j + 0.5) * FAR_CELL);
        sphere.radius = FAR_CELL * Math.SQRT1_2 + tall * (0.5 + run) + 20;
        if (!frustum.intersectsSphere(sphere)) {
          continue;
        }
        for (let q = start[c]; q < start[c + 1]; q += 1) {
          const t = items[q];
          const dx = forest.x[t] - pos.x;
          const dy = forest.y[t] - pos.y;
          const dz = forest.z[t] - pos.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > reach * reach || d2 < from * from) {
            continue;
          }
          if (m >= tier.capFar) {
            stats.dropped += 1;
            continue;
          }
          aTree.array[m * 4] = forest.x[t];
          aTree.array[m * 4 + 1] = forest.y[t] - 0.2;
          aTree.array[m * 4 + 2] = forest.z[t];
          aTree.array[m * 4 + 3] = forest.s[t];
          aTree2.array[m * 2] = (forest.yaw[t] * Math.PI) / 8;
          aTree2.array[m * 2 + 1] = forest.k[t];
          m += 1;
        }
      }
    }
    farGeo.instanceCount = m;
    farMesh.visible = m > 0;
    for (const a of [aTree, aTree2]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, m * a.itemSize);
      a.needsUpdate = true;
    }
    stats.far = m;
    stats.farRefills += 1;
  };

  /* The models refilled when the camera has moved three metres or turned
   * two degrees; the impostors, which begin at the models' far edge, when
   * it has moved twenty or turned three. */
  const update = (camera) => {
    const pos = camera.getWorldPosition(here);
    camera.getWorldDirection(dir);
    imp.uImpView.value.copy(pos);
    const models = !(pos.distanceToSquared(last) < 9 && dir.dot(lastDir) > 0.9994);
    const far = !(pos.distanceToSquared(lastFar) < 400 && dir.dot(lastFarDir) > 0.9986);
    if (!models && !far) {
      return;
    }
    camera.updateMatrixWorld();
    viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProj);
    if (far) {
      lastFar.copy(pos);
      lastFarDir.copy(dir);
      fillFar(pos);
    }
    if (!models) {
      return;
    }
    last.copy(pos);
    lastDir.copy(dir);
    nNear.fill(0);
    nMid.fill(0);
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
          take(items[q], pos, reach);
        }
      }
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
    near: triangles(builds[k].near.foliage) + triangles(builds[k].near.bark),
    mid: triangles(builds[k].mid.foliage),
  }));
  if (!nearOn) {
    for (const b of builds) {
      b.near.foliage.dispose();
      b.near.bark.dispose();
    }
  }
  return {
    update,
    stats,
    modelTris,
    levels,
    dispose() {
      for (const b of builds) {
        for (const g of [b.near.foliage, b.near.bark, b.mid.foliage]) {
          g.dispose();
        }
      }
      farGeo.dispose();
      baked.dispose();
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
 * point, of its own radius times open (under 1, more gaps); where caps
 * overlap the higher one shows, so two crowns meet in a crease that
 * curves, and where none reaches is a gap. Returns the dome's slope (xy,
 * clamped), its height over its radius (z, -1 in a gap) and the crown's
 * number (w). */
vec4 vegCaps(vec2 g, float open) {
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
      float r = (0.6 + 0.28 * fract(h.x * 13.7 + h.y * 3.1)) * open;
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
 * clump in it under three, a stand of one age eighty; and the big crowns
 * (the emergents' and the old trees') seventeen across, which stand over
 * the smaller ones where they reach, so the carpet is not one size of
 * crown repeated. */
const CROWN_M = 8.0;
const BIG_M = 17.0;
const CLUMP_M = 2.8;
const STAND_M = 80.0;

const SHELL_VERTEX = /* glsl */ `
vVegW = (modelMatrix * vec4(transformed, 1.0)).xyz;
vVegN = normalize(mat3(modelMatrix) * objectNormal);
`;

/* The understorey: inside the trees' band the canopy sinks to UNDER of
 * its height, so what shows between the drawn crowns is the forest's
 * dark lower storey and not a lawn, and at the forest's edge the skirt
 * is a wall from there to the ground. It rises to the top over the band
 * the trees dissolve in, and a little before it. The sink is by the
 * viewer's distance (EYE), the same in the colour pass and the shadow
 * pass, so the shadow falls from where the surface is drawn. */
const UNDER = 0.45;
const SINK_GLSL = (eye) => /* glsl */ `
{
  float vegD = distance(${eye}, (modelMatrix * vec4(transformed, 1.0)).xyz);
  vSink = 1.0 - smoothstep(uShellBand.x - 40.0, uShellBand.y, vegD);
  transformed.y -= aLift * ${(1 - UNDER).toFixed(2)} * vSink;
}
`;
const SINK_PARS = 'uniform vec4 uShellBand;\nattribute float aLift;\nvarying float vSink;';

/* Each crown's own green, as a multiplier on the graded satellite colour,
 * by its number: the Atlantic forest from the air in summer is a mosaic of
 * them, deep blue green, plain, the yellow green of the pioneers, olive
 * and bronze, grey green, and here and there the silver of an embauba
 * (Cecropia). [upper bound of the number, r, g, b], normalised below so
 * the mosaic's mean is the satellite's colour. */
const CROWN_PALETTE = [
  [0.3, 0.86, 0.96, 0.92],
  [0.55, 1.0, 1.0, 1.0],
  [0.75, 1.12, 1.1, 0.84],
  [0.88, 1.04, 0.95, 0.78],
  [0.96, 0.92, 1.0, 1.06],
  [1.0, 1.22, 1.2, 1.12],
];
const PALETTE_MEAN = [1, 2, 3].map((c) => CROWN_PALETTE.reduce((s, e, k) => s + e[c] * (e[0] - (k ? CROWN_PALETTE[k - 1][0] : 0)), 0));
const PALETTE_GLSL = (() => {
  const col = (e) => `vec3(${[1, 2, 3].map((c) => (e[c] / PALETTE_MEAN[c - 1]).toFixed(3)).join(', ')})`;
  let out = col(CROWN_PALETTE[CROWN_PALETTE.length - 1]);
  for (let k = CROWN_PALETTE.length - 2; k >= 0; k -= 1) {
    out = `(id < ${CROWN_PALETTE[k][0].toFixed(2)} ? ${col(CROWN_PALETTE[k])} : ${out})`;
  }
  return `vec3 vegPalette(float id) { return ${out}; }`;
})();
/* The crown pattern's mean: the dome's shade over a cell (its cap, its
 * edge and the gaps) and a clump's, worked out over a cap's area. The
 * pattern is divided by it, so the forest's mean is the satellite's
 * reflectance at every distance and the crowns fading out under a pixel
 * or two neither lighten nor darken it. */
const DOME_MEAN = 0.8;
const CLUMP_MEAN = 0.81;

function shellMaterial(band, forestTex, noise) {
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
    uVegNoise: { value: noise },
  };
  mat.userData.shell = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vVegW;\nvarying vec3 vVegN;\n${SINK_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${SINK_GLSL('cameraPosition')}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${SHELL_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${CROWN_GLSL}
        ${PALETTE_GLSL}
        uniform sampler2D uVegNoise;
        varying float vSink;
        vec4 vegCrown;
        vec4 vegClump;
        vec4 vegFine;
        vec4 vegStand;
        float vegK;
        float vegKc;
        /* The noise texture as value noise m metres a feature, faded to
         * its mean by its own mipmaps. */
        vec4 vegTex(vec2 w, float m, float o) {
          return texture2D(uVegNoise, w / (256.0 * m) + o);
        }`)
      .replace('#include <clipping_planes_fragment>', `
        if (!vegInside(vVegW)) discard;
        {
          /* On the top the pattern lies in the ground's plane; on the
           * edge's face, up it. */
          vec2 p = abs(vVegN.y) > 0.6 ? vVegW.xz : vec2(vVegW.x + vVegW.z, vVegW.y * 1.4);
          float px = max(length(fwidth(p)), 1e-3);
          /* The stands, smooth: a slow brightness (x), how open the
           * canopy is (y, fewer and smaller crowns), and the region's
           * cast, bluer or yellower (z), over 60 and 220 m. */
          vec4 s1 = vegTex(vVegW.xz, 60.0, 0.17);
          vec4 s2 = vegTex(vVegW.xz, 220.0, 0.61);
          vegStand = vec4(s1.r * 0.6 + s2.r * 0.4, smoothstep(0.3, 0.7, s1.g * 0.5 + s2.g * 0.5), s2.b, 0.0);
          /* The crowns and their clumps while each is a few pixels
           * across; under that their mean, and the understorey inside the
           * trees' band has neither. */
          vegK = (1.0 - smoothstep(${(0.25 * CROWN_M).toFixed(2)}, ${(0.9 * CROWN_M).toFixed(2)}, px)) * (1.0 - vSink);
          vegKc = (1.0 - smoothstep(${(0.2 * CLUMP_M).toFixed(2)}, ${(0.7 * CLUMP_M).toFixed(2)}, px)) * (1.0 - vSink);
          vegCrown = vec4(0.0, 0.0, 1.0, 0.5);
          vegClump = vec4(0.0, 0.0, 1.0, 0.5);
          /* No crown is round: the pattern is wandered a few metres, so
           * an outline is lobed where its clumps stand out of it. */
          p += (vegTex(p, 5.0, 0.43).rg - 0.5) * 5.0 + (vegTex(p, 1.6, 0.87).ba - 0.5) * 1.6;
          if (vegK > 0.0) {
            vegCrown = vegCaps(p / ${CROWN_M.toFixed(1)}, mix(1.04, 0.84, vegStand.y));
            /* A crown's top in metres is its cap's height over its
             * radius times its size; a big one stands 3 m under its own
             * top among the small ones, as a crown does in its
             * neighbours. */
            vec4 big = vegCaps(p / ${BIG_M.toFixed(1)} + 3.7, 1.0);
            if (big.z * ${BIG_M.toFixed(1)} - 3.0 > vegCrown.z * ${CROWN_M.toFixed(1)}) {
              vegCrown = vec4(big.xy, big.z, fract(big.w * 3.1 + 0.37));
            }
          }
          if (vegKc > 0.0) {
            vegClump = vegCaps(p / ${CLUMP_M.toFixed(1)} + 17.0, 1.0);
          }
          /* The leaves: two octaves under a metre, the clumps of a crown's
           * outer foliage, as brightness (r, a) and the tilt of each (gb). */
          vegFine = vegTex(p, 0.85, 0.33) * 0.6 + vegTex(p, 0.37, 0.71) * 0.4;
        }
        #include <clipping_planes_fragment>`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          /* A crown is lit on its dome and dark down its sides, and a gap
           * between crowns is deep shade; a clump on it the same, less.
           * Each crown its own green and brightness, round the stand's. */
          float dome = vegCrown.z < 0.0 ? 0.22 : mix(0.5, 1.0, sqrt(vegCrown.z));
          float clump = vegClump.z < 0.0 ? 0.5 : mix(0.6, 1.0, vegClump.z);
          float leaf = 0.8 + 0.4 * (vegFine.r * 0.5 + vegFine.a * 0.5);
          float own = 0.75 + 0.5 * fract(vegCrown.w * 13.1);
          float lit = mix(1.0, dome * own / ${DOME_MEAN.toFixed(2)}, vegK) * mix(1.0, clump / ${CLUMP_MEAN.toFixed(2)}, vegKc) * leaf;
          lit *= 0.84 + 0.32 * vegStand.x;
          /* Past the crowns, their groups: the big crowns and the gaps
           * between stands as value noise a crown or two across, which its
           * own mipmaps fade, so a far forest is still a textured mass. */
          vec4 groups = vegTex(vVegW.xz, 11.0, 0.29) * 0.6 + vegTex(vVegW.xz, 27.0, 0.53) * 0.4;
          lit *= mix(0.55 + 0.9 * groups.r, 1.0, vegK);
          vec3 hue = mix(vec3(1.0), vegPalette(vegCrown.w), vegK) * mix(vec3(0.95, 1.0, 1.05), vec3(1.05, 1.01, 0.9), vegStand.z);
          /* The understorey, in the crowns' shade: dark, broken, no crown. */
          vec3 under = vec3(0.3) * (0.7 + 0.6 * vegFine.b);
          diffuseColor.rgb *= mix(lit * hue, under, vSink);
        }`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        material.specularF90 = 0.3;
        material.specularColor *= 0.5;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 up = normalize(vVegN);
          vec3 tu = abs(up.y) > 0.6 ? vec3(1.0, 0.0, 0.0) : normalize(vec3(1.0, 0.0, 1.0));
          vec3 tv = abs(up.y) > 0.6 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
          vec2 slope = vegCrown.xy * 0.45 * vegK + vegClump.xy * 0.75 * vegKc + (vegFine.gb - 0.5) * 2.0;
          /* No facet steeper than about 60 degrees: past it a cap's rim is
           * a black crease, where a crown's edge is a soft shadow. */
          slope *= min(1.0, 1.7 / max(length(slope), 1e-3));
          vec3 nW = normalize(up + tu * slope.x + tv * slope.y);
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }`);
  };
  mat.customProgramCacheKey = () => 'itaipu-canopy';
  return thermalKind(mat, 'vegetation');
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
      .replace('#include <common>', `#include <common>\nvarying vec3 vVegW;\nvarying vec3 vVegN;\nuniform vec3 uEye;\n${SINK_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${SINK_GLSL('uEye')}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\nvVegW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvVegN = vec3(0.0, 1.0, 0.0);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${CROWN_GLSL}`)
      .replace('#include <clipping_planes_fragment>', `
        if (!vegInside(vVegW)) discard;
        #include <clipping_planes_fragment>`);
  };
  mat.customProgramCacheKey = () => 'itaipu-canopy-depth';
  return mat;
}

/* The canopy's chunks, metres a side. A mesh per 2 560 m hero tile was
 * up to 16 meshes, each drawn in every pass that saw a corner of it: 30
 * to 40 of yard-west's calls and most of its shadow maps' canopy. One
 * batch of 640 m chunks is one call a pass, and each pass draws only the
 * chunks in its own frustum. The vertices are in the world and every
 * chunk's matrix is the identity: the shell's shaders take the world
 * position from modelMatrix alone. */
const SHELL_CHUNK = 640;

/*
 * The canopy over the hero, one BatchedMesh of SHELL_CHUNK chunks. `topAt(x, z)`
 * is the canopy's height over the ground there, or a negative number
 * where there is no forest; `colourAt(x, z)` the linear reflectance
 * there, [r, g, b]; `ground(x, z)` the terrain; `forest` the mask's
 * forest weight, 0 to 255, 1024 x 1024 over the hero, north row first.
 * Returns the batch as `meshes` (in `group`), setEye(camera position) and the
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
  const noise = noiseTexture(4);
  const mat = shellMaterial(band, forestTex, noise);
  const depth = shellDepthMaterial(band, eye, forestTex);
  const step = tier.shell;
  const m = SHELL_CHUNK / step;
  const row = m + 1;
  const n = (2 * HALF) / SHELL_CHUNK;
  let tris = 0;
  const geos = [];
  for (let tj = 0; tj < n; tj += 1) {
    for (let ti = 0; ti < n; ti += 1) {
      const x0 = -HALF + ti * SHELL_CHUNK;
      const z0 = -HALF + tj * SHELL_CHUNK;
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
      const lift = [];
      const idx = [];
      const vert = (u, v) => {
        const k = v * row + u;
        if (index[k] < 0) {
          const x = x0 + u * step;
          const z = z0 + v * step;
          const h = top[k];
          index[k] = pos.length / 3;
          pos.push(x, ground(x, z) + (h >= 0 ? h : -0.5), z);
          lift.push(Math.max(0, h));
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
      geo.setAttribute('aLift', new THREE.Float32BufferAttribute(lift, 1));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      geos.push(geo);
      tris += idx.length / 3;
    }
  }
  const verts = geos.reduce((s, g) => s + g.getAttribute('position').count, 0);
  const indices = geos.reduce((s, g) => s + g.getIndex().count, 0);
  const mesh = new THREE.BatchedMesh(geos.length, verts, indices, mat);
  mesh.name = 'itaipu-canopy';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.customDepthMaterial = depth;
  /* The batch's sphere is the hero's: the chunks cull themselves. */
  mesh.frustumCulled = false;
  for (const g of geos) {
    mesh.addGeometry(g);
    g.dispose();
  }
  group.add(mesh);
  return {
    meshes: [mesh],
    tris,
    setEye(p) {
      eye.value.copy(p);
    },
    dispose() {
      mat.dispose();
      depth.dispose();
      forestTex.dispose();
      noise.dispose();
    },
  };
}
