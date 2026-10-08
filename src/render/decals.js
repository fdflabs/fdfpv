/*
 * decals.js: the paint shop's decals (configs/paint.js) on a built model.
 *
 * PROJECTED, NOT UNWRAPPED. The builders make their skins from lofts and
 * merged pieces with no texture layout a sticker could be painted into,
 * so a decal is projected: a box stood on the picked point along the
 * surface's normal there, and every triangle of the airframe inside it,
 * facing the way the box looks, cut to the box and kept, with the box's
 * face as its texture coordinates. That is three's DecalGeometry, with
 * the two things it lacks. A triangle facing away is dropped, so a number
 * on the wing's top skin is not printed through onto the bottom one, nor
 * a fuselage number onto the far side. And a piece with other skin over
 * it along the box's direction is dropped, because the merged pieces
 * overlap: the Skyhunter's boom fairings run on inside its wing, a few
 * millimetres under the top skin and facing up like it, and a stripe over
 * them was printed on both: a second copy drawn every frame a few
 * millimetres inside the wing, which the polygon offset below pulls
 * toward the camera.
 *
 * CHEAP BY CONSTRUCTION. Every decal of a model is drawn into ONE atlas
 * (a canvas, one cell per decal, larger cells when there are fewer), and
 * every decal on one mesh of the model is merged into ONE mesh, a child of
 * that mesh, sharing ONE material. So a livery with a number on each side,
 * stripes over the wing and a roundel on the fin costs a draw call per
 * mesh it lands on, not per decal, and nothing per frame: the geometry is
 * made when the paint changes and never touched again. A mesh's decals are
 * its own children, so they move with an aileron, and a wreck's pieces,
 * which are cut from every mesh under the craft (src/render/wreck.js),
 * carry the decals that were on them.
 *
 * A decal is a sticker: opaque, over the paint and over the Kadet's film
 * alike, so against the sun a number on the translucent fuselage is the
 * dark shape on the glowing film that a vinyl number is. It stands off the
 * skin by DECAL_LIFT along the normal and draws after the opaque skin with
 * the depth test and no depth write, so it never fights the skin and a
 * later decal lies over an earlier one where they cross, in list order.
 *
 * MIRRORING. The aircraft is symmetric about x = 0. A mirrored decal's
 * copy is the reflection of its box; a number's copy is then turned back
 * to read the right way round (DECAL_KINDS text), every other kind is a
 * true mirror image, so a chevron points forward on both sides.
 *
 * THE LETTERING AND THE SHAPES are src/render/decalart.js's, drawn from
 * strokes and paths, with no font to load and no image to fetch.
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
import { celMaterial } from './celmat.js';
import { drawDecal } from './decalart.js';
import { DECAL_KINDS } from '../../configs/paint.js';

/* How far a decal stands off the skin, metres: under a tenth of the
 * thinnest covering's shading step, and enough for a 24 bit depth buffer
 * at the chase camera's distance. */
export const DECAL_LIFT = 0.0008;
/* A triangle is printed on only if it faces the box's direction at least
 * this much (the cosine of about 72 degrees). */
const FACING = 0.3;
/* The box's depth either side of the skin, as a share of the decal's
 * height, and its least, metres. */
const DEPTH_SHARE = 0.5;
const DEPTH_MIN = 0.02;
/* Skin over a piece of a decal hides it when it stands this far out
 * along the box's normal, metres: past the rounding of skins merged
 * edge to edge, and under the thinnest thing laid on a skin (a servo
 * cover, a millimetre or two). */
const COVER_GAP = 0.0002;
/* The cells per side of the grid a box's cover is binned in. */
const COVER_GRID = 12;
/* The atlas side, texels: the graphics preset's ceiling (setAtlasPreset,
 * docs/redesign/LIVERY-LAYERS.md section 5), and no larger than a few
 * layers need, so a plane with a number on it costs what it did. */
const ATLAS_FOR = [[4, 512], [16, 1024], [Infinity, 2048]];
const ATLAS_CEILING = { low: 512, medium: 1024, high: 2048 };
let atlasCeiling = ATLAS_CEILING.medium;

/* The graphics preset (src/render/quality.js GRAPHICS_IDS) a livery's
 * atlas is drawn for; liveries dressed after it take it. */
export function setAtlasPreset(graphics) {
  atlasCeiling = ATLAS_CEILING[graphics] ?? ATLAS_CEILING.medium;
}

function atlasSide(n) {
  return Math.min(atlasCeiling, ATLAS_FOR.find(([most]) => n <= most)[1]);
}

/* The cells per side for n decals. */
function gridFor(n) {
  return Math.max(1, Math.ceil(Math.sqrt(n)));
}

/* A layer's sticker look by its finish (configs/paint.js LAYER_FINISHES):
 * the cel material's rim and highlight, gloss being the sticker's own. */
const FINISH_LOOK = {
  gloss: { rim: 0.22, spec: 0.3, specWidth: 0.012 },
  matte: { rim: 0.08, spec: 0, specWidth: 0.012 },
  metallic: { rim: 0.38, spec: 0.65, specWidth: 0.03 },
  chrome: { rim: 0.55, spec: 1, specWidth: 0.006 },
};

/* What a decal's picture depends on, so an unchanged one is not drawn
 * again. */
function pictureKey(d) {
  return `${d.k}|${d.t ?? ''}|${d.f ?? ''}|${d.c}|${d.c2}|${d.a}|${d.o ?? 100}`;
}

function makeCanvas(side) {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(side, side);
  }
  const c = document.createElement('canvas');
  c.width = side;
  c.height = side;
  return c;
}

/* Draw every decal's picture into its cell. */
function drawAtlas(canvas, decals) {
  const ATLAS = canvas.width;
  const g = canvas.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, ATLAS, ATLAS);
  const n = gridFor(decals.length);
  const cell = ATLAS / n;
  const pad = Math.max(4, Math.round(cell * 0.03));
  const inner = cell - 2 * pad;
  decals.forEach((d, i) => {
    const x0 = (i % n) * cell + pad;
    const y0 = Math.floor(i / n) * cell + pad;
    g.save();
    g.beginPath();
    g.rect(x0, y0, inner, inner);
    g.clip();
    /* The cell is square in texels and d.a wide by 1 high on the model, so
     * the picture is drawn in the model's own proportions and squeezed. */
    g.setTransform(inner / d.a, 0, 0, inner, x0, y0);
    g.globalAlpha = (d.o ?? 100) / 100;
    drawDecal(g, d, d.a);
    g.restore();
  });
}

/* A decal's cell in texture coordinates: [u0, v0, du, dv], v up. */
function cellUv(i, count, ATLAS) {
  const n = gridFor(count);
  const cell = ATLAS / n;
  const pad = Math.max(4, Math.round(cell * 0.03));
  const u0 = ((i % n) * cell + pad + 0.5) / ATLAS;
  const top = (Math.floor(i / n) * cell + pad + 0.5) / ATLAS;
  const size = (cell - 2 * pad - 1) / ATLAS;
  return [u0, 1 - top - size, size, size];
}

/* The meshes a decal can land on: the airframe's lit skin. Not the
 * rotors, not the ink hulls or lamps (not cel), not glass (transparent),
 * not the Bramor's catapult or chute, not the hangar's parts
 * (src/render/partsfit.js: tyres, pod, tape), not a decal, and nothing
 * hidden. The flying model carries a hidden box the size of the whole
 * aircraft for check 15 (opts.measure, in every builder), in the skin's
 * own material; the hangar's model has none. A decal's box that reached
 * one of its faces printed there, and since the decal mesh is not hidden
 * with it, a sticker placed on the model hung in the air beside the
 * aircraft in flight and nowhere in the hangar. With each, its matrix into
 * the craft group's frame at the pose it was built in. */
function targetsOf(craft) {
  const skip = new Set([...(craft.blades || []), ...(craft.discs || [])]);
  if (craft.launcher) {
    skip.add(craft.launcher);
  }
  const out = [];
  const under = (o) => {
    for (let p = o; p && p !== craft.group; p = p.parent) {
      if (!p.visible || skip.has(p) || p.name === 'chute' || p.name === 'launcher' || p.name === 'parts' || p.userData.decal) {
        return true;
      }
    }
    return false;
  };
  craft.group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.geometry || !o.geometry.attributes.position) {
      return;
    }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (!mats.every((m) => m && m.userData.cel && m.side !== THREE.BackSide && !m.transparent) || under(o)) {
      return;
    }
    /* The mesh's matrix into the group, and its parent's: the decals are
     * drawn in the parent's frame, one mesh for all the parent's children
     * (a wing's panels, a pivot's surface), so they cost a draw call per
     * part that moves, not per piece of skin. */
    const m = new THREE.Matrix4();
    let home = null;
    for (let p = o; p && p !== craft.group; p = p.parent) {
      if (p.matrixAutoUpdate) {
        p.updateMatrix();
      }
      m.premultiply(p.matrix);
      if (p === o.parent) {
        home = new THREE.Matrix4();
      }
      if (home) {
        home.premultiply(p.matrix);
      }
    }
    home = home ?? new THREE.Matrix4();
    out.push({
      mesh: o,
      home: o.parent,
      matrix: m,
      normal: new THREE.Matrix3().getNormalMatrix(m),
      toHome: home.clone().invert(),
      normalHome: new THREE.Matrix3().setFromMatrix4(home).transpose(),
      twoSided: mats.some((x) => x.side === THREE.DoubleSide),
    });
  });
  return out;
}

/* A target's triangles in the group frame, nine numbers each, and their
 * bounds as the 8 corners of a box: worked out once per model, since every
 * layer and every mirror copy reads them (a livery of 32 mirrored layers
 * used to transform each vertex 128 times). */
function trianglesOf(target) {
  if (target.tri) {
    return target.tri;
  }
  const geo = target.mesh.geometry;
  const pos = geo.attributes.position;
  const index = geo.index;
  const count = index ? index.count : pos.count;
  const tri = new Float64Array(Math.floor(count / 3) * 9);
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tri.length / 3; i += 1) {
    vt.fromBufferAttribute(pos, index ? index.getX(i) : i).applyMatrix4(target.matrix);
    tri[3 * i] = vt.x;
    tri[3 * i + 1] = vt.y;
    tri[3 * i + 2] = vt.z;
    for (const [k, v] of [[0, vt.x], [1, vt.y], [2, vt.z]]) {
      lo[k] = Math.min(lo[k], v);
      hi[k] = Math.max(hi[k], v);
    }
  }
  target.tri = tri;
  target.corners = [0, 1, 2, 3, 4, 5, 6, 7].map((c) => new THREE.Vector3(c & 1 ? hi[0] : lo[0], c & 2 ? hi[1] : lo[1], c & 4 ? hi[2] : lo[2]));
  return tri;
}

/* Whether a target's bounds miss the box across its face (right and up),
 * and, with `depth`, along its normal too. */
function misses(target, box, depth) {
  trianglesOf(target);
  for (const [axis, half] of depth ? [[box.right, box.hw], [box.up, box.hh], [box.n, box.hd]] : [[box.right, box.hw], [box.up, box.hh]]) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of target.corners) {
      const d = e1.subVectors(c, box.p).dot(axis);
      lo = Math.min(lo, d);
      hi = Math.max(hi, d);
    }
    if (lo > half || hi < -half) {
      return true;
    }
  }
  return false;
}

/*
 * The box of one decal: its origin, its axes (image right, image up, into
 * the skin's normal) and its half sizes, in the group frame. The image's
 * up is the nose (-z) on a face that looks up or down, else +y, turned
 * about the normal by the decal's r. `mirror` reflects the box across
 * x = 0 and flips its right axis back so it stays a rotation.
 */
function boxOf(d, mirror) {
  const s = mirror ? -1 : 1;
  const p = new THREE.Vector3(d.p[0] * s, d.p[1], d.p[2]);
  const n = new THREE.Vector3(d.n[0] * s, d.n[1], d.n[2]).normalize();
  const ref = Math.abs(n.y) > 0.7 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
  const up = ref.sub(n.clone().multiplyScalar(ref.dot(n))).normalize();
  const turn = ((mirror ? -d.r : d.r) * Math.PI) / 180;
  up.applyAxisAngle(n, turn);
  const right = new THREE.Vector3().crossVectors(up, n);
  const w = d.s * d.a;
  /* SKEW leans the picture's up toward its right: a point Y up the box
   * sits k Y further right. The box is widened to hold the lean, and
   * clipped in the leaned frame (toBox), so nothing samples past its
   * cell. A mirror image leans the mirrored way. */
  const k = Math.tan((((mirror && !DECAL_KINDS[d.k].text) ? -1 : 1) * (d.x ?? 0) * Math.PI) / 180);
  return { p, n, up, right, k, iw: w / 2, hw: w / 2 + Math.abs(k) * (d.s / 2), hh: d.s / 2, hd: Math.max(DEPTH_MIN, d.s * DEPTH_SHARE) };
}

const va = new THREE.Vector3();
const vb = new THREE.Vector3();
const vc = new THREE.Vector3();
const e1 = new THREE.Vector3();
const e2 = new THREE.Vector3();

/* One vertex in the box's space: [x, y, z] in -1..1 inside, and its
 * normal in the group frame. */
const vt = new THREE.Vector3();
function toBox(box, v, nrm) {
  vt.subVectors(v, box.p);
  const y = vt.dot(box.up);
  return {
    q: [(vt.dot(box.right) - box.k * y) / box.iw, y / box.hh, vt.dot(box.n) / box.hd],
    n: nrm.clone(),
  };
}

function lerpV(a, b, t) {
  return {
    q: [a.q[0] + (b.q[0] - a.q[0]) * t, a.q[1] + (b.q[1] - a.q[1]) * t, a.q[2] + (b.q[2] - a.q[2]) * t],
    n: a.n.clone().lerp(b.n, t),
  };
}

/* Sutherland Hodgman against |q[axis]| <= 1, both sides. */
function clip(poly, axis) {
  let out = poly;
  for (const side of [1, -1]) {
    const inp = out;
    out = [];
    for (let i = 0; i < inp.length; i += 1) {
      const a = inp[i];
      const b = inp[(i + 1) % inp.length];
      const da = 1 - side * a.q[axis];
      const db = 1 - side * b.q[axis];
      if (da >= 0) {
        out.push(a);
      }
      if ((da >= 0) !== (db >= 0)) {
        out.push(lerpV(a, b, da / (da - db)));
      }
    }
    if (!out.length) {
      return out;
    }
  }
  return out;
}

/*
 * Every triangle of the targets that could lie over a point in the box,
 * whichever way it faces: in the box's frame in metres, [x right, y up,
 * z out along the normal] for each corner, nine numbers a triangle, and
 * binned in a COVER_GRID square grid over the box's face so a point is
 * tested against the few that fall on its cell. Above the box is kept:
 * skin over a point need not be inside the box to hide it.
 */
function coverOf(box, targets) {
  const tris = [];
  const cells = Array.from({ length: COVER_GRID * COVER_GRID }, () => []);
  const cellOf = (v, half) => Math.min(COVER_GRID - 1, Math.max(0, Math.floor(((v + half) / (2 * half)) * COVER_GRID)));
  const q = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const target of targets) {
    if (misses(target, box, false)) {
      continue;
    }
    const all = trianglesOf(target);
    for (let t = 0; t < all.length / 3; t += 3) {
      for (let k = 0; k < 3; k += 1) {
        vt.set(all[3 * (t + k)], all[3 * (t + k) + 1], all[3 * (t + k) + 2]).sub(box.p);
        q[3 * k] = vt.dot(box.right);
        q[3 * k + 1] = vt.dot(box.up);
        q[3 * k + 2] = vt.dot(box.n);
      }
      const [x0, y0, z0, x1, y1, z1, x2, y2, z2] = q;
      const xLo = Math.min(x0, x1, x2);
      const xHi = Math.max(x0, x1, x2);
      const yLo = Math.min(y0, y1, y2);
      const yHi = Math.max(y0, y1, y2);
      if (xLo > box.hw || xHi < -box.hw || yLo > box.hh || yHi < -box.hh || Math.max(z0, z1, z2) < -box.hd) {
        continue;
      }
      const at = tris.length / 9;
      tris.push(...q);
      for (let j = cellOf(yLo, box.hh); j <= cellOf(yHi, box.hh); j += 1) {
        for (let i = cellOf(xLo, box.hw); i <= cellOf(xHi, box.hw); i += 1) {
          cells[j * COVER_GRID + i].push(at);
        }
      }
    }
  }
  return { tris, cells, cellOf };
}

/* Whether skin lies over the point (x, y, z) of the box's frame, metres:
 * a triangle of the cover whose face holds (x, y) and whose surface there
 * stands more than COVER_GAP further out along the normal. */
function covered(cover, box, x, y, z) {
  const { tris } = cover;
  for (const at of cover.cells[cover.cellOf(y, box.hh) * COVER_GRID + cover.cellOf(x, box.hw)]) {
    const o = at * 9;
    const ax = tris[o];
    const ay = tris[o + 1];
    const bx = tris[o + 3] - ax;
    const by = tris[o + 4] - ay;
    const cx = tris[o + 6] - ax;
    const cy = tris[o + 7] - ay;
    const det = bx * cy - by * cx;
    if (Math.abs(det) < 1e-14) {
      continue;
    }
    const px = x - ax;
    const py = y - ay;
    const s = (px * cy - py * cx) / det;
    const t = (bx * py - by * px) / det;
    if (s < 0 || t < 0 || s + t > 1) {
      continue;
    }
    const over = tris[o + 2] + s * (tris[o + 5] - tris[o + 2]) + t * (tris[o + 8] - tris[o + 2]);
    if (over > z + COVER_GAP) {
      return true;
    }
  }
  return false;
}

/*
 * One decal on one target: the triangles, in the target mesh's own frame,
 * as flat arrays of positions, normals and uvs, or null for none. `uv` is
 * the decal's atlas cell, `flip` mirrors its picture left to right, and
 * `cover` is coverOf the box, for the pieces other skin hides.
 */
function project(box, target, uv, flip, cover) {
  const geo = target.mesh.geometry;
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const index = geo.index;
  const count = index ? index.count : pos.count;
  const pa = [];
  const na = [];
  const ta = [];
  const at = (i) => (index ? index.getX(i) : i);
  const ns = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const ps = [va, vb, vc];
  const lift = box.n.clone().multiplyScalar(DECAL_LIFT);
  const out = new THREE.Vector3();
  const outN = new THREE.Vector3();
  if (misses(target, box, true)) {
    return null;
  }
  const all = trianglesOf(target);
  for (let t = 0; t + 2 < count; t += 3) {
    for (let k = 0; k < 3; k += 1) {
      ps[k].set(all[3 * (t + k)], all[3 * (t + k) + 1], all[3 * (t + k) + 2]);
    }
    /* Quick reject: all three past the same face of the box. */
    let reject = false;
    for (const [axis, half] of [[box.right, box.hw], [box.up, box.hh], [box.n, box.hd]]) {
      const d0 = e1.subVectors(va, box.p).dot(axis);
      const d1 = e1.subVectors(vb, box.p).dot(axis);
      const d2 = e1.subVectors(vc, box.p).dot(axis);
      if ((d0 > half && d1 > half && d2 > half) || (d0 < -half && d1 < -half && d2 < -half)) {
        reject = true;
        break;
      }
    }
    if (reject) {
      continue;
    }
    e1.subVectors(vb, va);
    e2.subVectors(vc, va);
    const face = new THREE.Vector3().crossVectors(e1, e2);
    const len = face.length();
    /* A two sided sheet may be wound either way; its facing is taken
     * whichever side looks at the box, and the triangle is turned over so
     * the decal's winding faces out. */
    const facing = len < 1e-12 ? 0 : face.dot(box.n) / len;
    const back = target.twoSided && facing < 0;
    if ((back ? -facing : facing) < FACING) {
      continue;
    }
    for (let k = 0; k < 3; k += 1) {
      const vi = at(t + k);
      if (nor) {
        ns[k].fromBufferAttribute(nor, vi).applyMatrix3(target.normal).normalize();
      } else {
        ns[k].copy(face).divideScalar(len);
      }
      if (back) {
        ns[k].negate();
      }
    }
    let poly = [toBox(box, va, ns[0]), toBox(box, vb, ns[1]), toBox(box, vc, ns[2])];
    for (const axis of [0, 1, 2]) {
      poly = clip(poly, axis);
      if (poly.length < 3) {
        break;
      }
    }
    if (poly.length < 3) {
      continue;
    }
    for (let k = 1; k + 1 < poly.length; k += 1) {
      const tri = back ? [poly[0], poly[k + 1], poly[k]] : [poly[0], poly[k], poly[k + 1]];
      /* Hidden or not by the triangle's middle, in the box's frame in
       * metres: a triangle of the fan, not the whole piece, so a seam
       * laid over part of a large skin triangle takes only what it
       * covers. */
      const mid = (axis, half) => ((tri[0].q[axis] + tri[1].q[axis] + tri[2].q[axis]) / 3) * half;
      if (covered(cover, box, mid(0, box.iw) + box.k * mid(1, box.hh), mid(1, box.hh), mid(2, box.hd))) {
        continue;
      }
      for (const v of tri) {
        out.copy(box.p)
          .addScaledVector(box.right, v.q[0] * box.iw + box.k * v.q[1] * box.hh)
          .addScaledVector(box.up, v.q[1] * box.hh)
          .addScaledVector(box.n, v.q[2] * box.hd)
          .add(lift)
          .applyMatrix4(target.toHome);
        pa.push(out.x, out.y, out.z);
        outN.copy(v.n).applyMatrix3(target.normalHome).normalize();
        na.push(outN.x, outN.y, outN.z);
        const u = (v.q[0] + 1) / 2;
        const w = (v.q[1] + 1) / 2;
        ta.push(uv[0] + (flip ? 1 - u : u) * uv[2], uv[1] + w * uv[3]);
      }
    }
  }
  return pa.length ? { pa, na, ta } : null;
}

function layerOf(craft) {
  let s = craft.group.userData.decalLayer;
  if (!s) {
    s = {
      key: '',
      pictures: '',
      targets: targetsOf(craft),
      canvas: null,
      texture: null,
      materials: {},
      meshes: [],
      cache: new Map(),
    };
    craft.group.userData.decalLayer = s;
  }
  return s;
}

/* The sticker material of a finish, made the first time it is worn. */
function materialFor(s, finish) {
  if (!s.materials[finish]) {
    const m = celMaterial({ color: 0xffffff, map: s.texture, key: `paint-decal-${finish}`, transparent: true, ...FINISH_LOOK[finish] });
    m.depthWrite = false;
    m.polygonOffset = true;
    m.polygonOffsetFactor = -1;
    m.polygonOffsetUnits = -4;
    m.name = 'paint-decal';
    m.addEventListener('dispose', () => m.map && m.map.dispose());
    s.materials[finish] = m;
  }
  return s.materials[finish];
}

function clearMeshes(s) {
  for (const m of s.meshes) {
    m.removeFromParent();
    m.geometry.dispose();
  }
  s.meshes = [];
}

/*
 * Put a craft's decals on it: `decals` as configs/paint.js keeps them.
 * An unchanged list does nothing; an empty one takes every decal off.
 * Returns how many meshes the decals are drawn as.
 */
export function dressDecals(craft, all = []) {
  /* A hidden layer is kept in the list and drawn nowhere. */
  const decals = all.filter((d) => !d.h);
  const key = JSON.stringify(decals);
  const t0 = performance.now();
  const had = craft.group.userData.decalLayer;
  if (!decals.length && !had) {
    return 0;
  }
  const s = layerOf(craft);
  if (key === s.key) {
    return s.meshes.length;
  }
  s.key = key;
  clearMeshes(s);
  if (!decals.length) {
    return 0;
  }
  const side = atlasSide(decals.length);
  if (!s.canvas || s.canvas.width !== side) {
    if (s.texture) {
      s.texture.dispose();
    }
    s.canvas = makeCanvas(side);
    s.pictures = '';
    s.texture = new THREE.CanvasTexture(s.canvas);
    s.texture.colorSpace = THREE.SRGBColorSpace;
    s.texture.anisotropy = 4;
    for (const m of Object.values(s.materials)) {
      m.map = s.texture;
    }
  }
  const pictures = `${decals.length}:${decals.map(pictureKey).join(';')}`;
  if (pictures !== s.pictures) {
    s.pictures = pictures;
    drawAtlas(s.canvas, decals);
    s.texture.needsUpdate = true;
  }
  /* Per parent, the decals in list order, each followed by its mirror. */
  const byHome = new Map();
  const cache = new Map();
  decals.forEach((d, i) => {
    const uv = cellUv(i, decals.length, side);
    const finish = d.fi ?? 'gloss';
    const copies = d.m ? [false, true] : [false];
    for (const mirror of copies) {
      const flip = mirror && !DECAL_KINDS[d.k].text;
      const ck = `${d.p}|${d.n}|${d.s}|${d.a}|${d.r}|${d.x ?? 0}|${mirror}|${flip}|${uv}`;
      let parts = s.cache.get(ck);
      if (!parts) {
        const box = boxOf(d, mirror);
        const cover = coverOf(box, s.targets);
        parts = s.targets.map((t) => project(box, t, uv, flip, cover));
      }
      cache.set(ck, parts);
      parts.forEach((part, ti) => {
        if (!part) {
          return;
        }
        const t = s.targets[ti];
        const at = `${s.targets.indexOf(t)}|${finish}`;
        if (!byHome.has(at)) {
          byHome.set(at, { t, finish, first: i, parts: [] });
        }
        byHome.get(at).parts.push(part);
      });
    }
  });
  s.cache = cache;
  const joined = (parts, key) => {
    const out = new Float32Array(parts.reduce((n, p) => n + p[key].length, 0));
    let at = 0;
    for (const p of parts) {
      out.set(p[key], at);
      at += p[key].length;
    }
    return out;
  };
  /* One mesh per moving part per finish. Layers of one finish keep list
   * order inside their mesh; across finishes the mesh holding the earlier
   * layer draws first, which is list order wherever the finishes are not
   * interleaved over the same spot. */
  for (const { t, finish, first, parts } of byHome.values()) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(joined(parts, 'pa'), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(joined(parts, 'na'), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(joined(parts, 'ta'), 2));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, materialFor(s, finish));
    mesh.renderOrder = first;
    mesh.name = 'paint-decals';
    mesh.userData.decal = true;
    mesh.castShadow = false;
    mesh.receiveShadow = t.mesh.receiveShadow;
    mesh.layers.mask = t.mesh.layers.mask;
    t.home.add(mesh);
    s.meshes.push(mesh);
  }
  /* For livery:layers, the cost the contract budgets. */
  s.ms = performance.now() - t0;
  return s.meshes.length;
}

/*
 * A craft's decals dressed over several frames: each layer's projection
 * (the costly part) done in slices of at most `budgetMs` a frame into the
 * cache dressDecals reads, then dressDecals itself, which then only draws
 * the atlas and joins the meshes. For a room's peers, so a pilot joining
 * with a full livery is not one long frame on everyone else's screen.
 * A later call for the same craft cancels an earlier one still running.
 * Returns a promise of how many meshes it drew, or null if cancelled.
 */
export function dressDecalsLater(craft, all = [], budgetMs = 4) {
  const decals = all.filter((d) => !d.h);
  const s = layerOf(craft);
  const run = (s.spreadRun ?? 0) + 1;
  s.spreadRun = run;
  const side = atlasSide(decals.length);
  const jobs = [];
  decals.forEach((d, i) => {
    const uv = cellUv(i, decals.length, side);
    for (const mirror of d.m ? [false, true] : [false]) {
      const flip = mirror && !DECAL_KINDS[d.k].text;
      jobs.push({ d, mirror, flip, uv, ck: `${d.p}|${d.n}|${d.s}|${d.a}|${d.r}|${d.x ?? 0}|${mirror}|${flip}|${uv}` });
    }
  });
  const slices = [];
  return new Promise((resolve) => {
    const step = () => {
      if (s.spreadRun !== run) {
        resolve(null);
        return;
      }
      const t0 = performance.now();
      while (jobs.length && performance.now() - t0 < budgetMs) {
        const j = jobs.shift();
        if (!s.cache.has(j.ck)) {
          const box = boxOf(j.d, j.mirror);
          const cover = coverOf(box, s.targets);
          s.cache.set(j.ck, s.targets.map((t) => project(box, t, j.uv, j.flip, cover)));
        }
      }
      if (jobs.length) {
        slices.push(performance.now() - t0);
        requestAnimationFrame(step);
        return;
      }
      const t1 = performance.now();
      const n = dressDecals(craft, all);
      slices.push(t1 - t0 + (performance.now() - t1));
      s.spread = { frames: slices.length, worstMs: Math.max(...slices), totalMs: slices.reduce((x, y) => x + y, 0) };
      resolve(n);
    };
    step();
  });
}

/* A layer's outline on the model, for the hangar's transform handles:
 * its centre and four corners (top left, top right, bottom right, bottom
 * left of the picture) and the middle of its top and right edges, in the
 * craft group's frame. */
export function layerOutline(d) {
  const b = boxOf(d, false);
  const at = (x, y) => b.p.clone().addScaledVector(b.right, x * b.iw + b.k * y * b.hh).addScaledVector(b.up, y * b.hh);
  return { centre: at(0, 0), corners: [at(-1, 1), at(1, 1), at(1, -1), at(-1, -1)], top: at(0, 1), right: at(1, 0) };
}

/* The meshes a pick can land on, for the hangar's placing: the same the
 * decals are printed on. */
export function paintTargets(craft) {
  return layerOf(craft).targets.map((t) => t.mesh);
}

/* What is drawn for a check: the decal meshes, their triangles, and
 * whether the atlas holds a picture. */
export function readDecals(craft) {
  const s = craft.group.userData.decalLayer;
  if (!s) {
    return { meshes: 0, triangles: 0, decals: 0 };
  }
  const triangles = s.meshes.reduce((n, m) => n + m.geometry.attributes.position.count / 3, 0);
  return {
    meshes: s.meshes.length, triangles, decals: s.key ? JSON.parse(s.key).length : 0,
    atlas: s.canvas ? s.canvas.width : 0, ms: s.ms ?? 0, finishes: Object.keys(s.materials).length, spread: s.spread ?? null,
  };
}
