/*
 * kit.js: what the valley's village is built from.
 *
 * The chalets, the farms, the barns, the Gasthof, the shop, the church,
 * the hangar and the strip's furniture, the bridge, the fountain, the
 * benches, the poles, the signs and the fences. Everything
 * is authored at the origin on flat ground in its own frame and placed
 * by the valley, which knows the terrain; nothing here reads a height.
 *
 * Every builder writes into a bake, sorted by material, so the whole
 * village is one mesh per surface colour, and anything repeated more
 * than twenty times (a fence post, a pole, a cone) goes through the
 * bake's instance table and is one InstancedMesh.
 *
 * Roofs are closed solids built face by face (roofShell), not slabs
 * laid near each other: the gable is closed by the wall's own profile,
 * the eaves overhang on every side, and a chimney passes through the
 * shell rather than standing beside it. That is what the ink outline
 * pass needs: no coplanar faces fighting and no back faces seen through
 * a front.
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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { celMaterial } from '../../render/celmat.js';
import {
  roofRecord, shedTop, flatTop, pyramidTop, spireCore,
} from './roofs.js';

/* The village's palette: one material per surface colour, shared by every
 * building, so a baked village is one mesh per entry. The boarding runs
 * from dark larch to honey; roofs are shingle or slate, never terracotta. */
export function villageMaterials() {
  return {
    stone: celMaterial({ color: 0xc4bcae, rim: 0.12 }),
    render: celMaterial({ color: 0xf7f3ea, rim: 0.1 }),
    larchDark: celMaterial({ color: 0x4d3524, rim: 0.1 }),
    larch: celMaterial({ color: 0x6e4b2e, rim: 0.12 }),
    honey: celMaterial({ color: 0xa97a44, rim: 0.12 }),
    weathered: celMaterial({ color: 0x847765, rim: 0.12 }),
    boardLine: celMaterial({ color: 0x2a1d14, rim: 0.05 }),
    shingle: celMaterial({ color: 0x5b4c3e, rim: 0.12 }),
    shingleDark: celMaterial({ color: 0x3f3329, rim: 0.1 }),
    slate: celMaterial({ color: 0x4a4e57, rim: 0.14 }),
    trim: celMaterial({ color: 0xf3eee3, rim: 0.1 }),
    glass: celMaterial({ color: 0x24313f, rim: 0.35, rimColor: 0xcfe4ff }),
    shutterGreen: celMaterial({ color: 0x3f6b3a, rim: 0.1 }),
    shutterRed: celMaterial({ color: 0x7d2f2a, rim: 0.1 }),
    geranium: celMaterial({ color: 0xd8323c, rim: 0.2 }),
    metal: celMaterial({ color: 0xb9bec4, rim: 0.25 }),
    ink: celMaterial({ color: 0x1e2124, rim: 0.05 }),
    hangar: celMaterial({ color: 0x9aa39a, rim: 0.2 }),
    hangarRoof: celMaterial({ color: 0x6f7a74, rim: 0.15 }),
    door: celMaterial({ color: 0x3a3f42, rim: 0.2 }),
    cross: celMaterial({ color: 0xd8b04a, rim: 0.3 }),
    fence: celMaterial({ color: 0x7a6a52, rim: 0.1 }),
    asphalt: celMaterial({ color: 0x4a4c50, rim: 0 }),
    gravel: celMaterial({ color: 0x9c9483, rim: 0 }),
    cobble: celMaterial({ color: 0x8f8a82, rim: 0.05 }),
    concrete: celMaterial({ color: 0xb5b2aa, rim: 0.05 }),
    paint: celMaterial({ color: 0xe6e2d8, rim: 0 }),
    signBlue: celMaterial({ color: 0x1f4f9e, rim: 0.2 }),
    signRed: celMaterial({ color: 0xc4262b, rim: 0.2 }),
    cone: celMaterial({ color: 0xf07a1a, rim: 0.2 }),
    water: celMaterial({ color: 0x3d7a97, rim: 0.4, rimColor: 0xe6f3ff }),
    fuel: celMaterial({ color: 0xc63a2e, rim: 0.2 }),
    logEnd: celMaterial({ color: 0xd9b98a, rim: 0.1 }),
  };
}

/*
 * A bake is what the builders write into: geometry by material key, and
 * an instance table for parts repeated too often to bake. bakeAll merges
 * every geometry of a key into one mesh with that key's material and
 * turns each instance entry into one InstancedMesh.
 */
export function makeBake() {
  const parts = {};
  const instances = {};
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const pushM = (key, geometry, matrix) => {
    const g = geometry.clone();
    g.applyMatrix4(matrix);
    (parts[key] ??= []).push(g);
  };
  const push = (key, geometry, x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    e.set(rx, ry, rz);
    q.setFromEuler(e);
    m.compose(p.set(x, y, z), q, s.set(sx, sy, sz));
    pushM(key, geometry, m);
  };
  const instance = (name, key, geometry, matrix) => {
    const entry = (instances[name] ??= { key, geometry, matrices: [] });
    entry.matrices.push(matrix.clone());
  };
  /* Every roof shell put into this bake, as roofs.js records: the
   * village's surfaces, and what its walls are cut under. And the solid
   * parts its builders noted (frame's solid()), for roofs.js standWalls. */
  const roofs = [];
  const solids = [];
  return { parts, instances, push, pushM, instance, roofs, solids };
}

export function bakeAll(bake, mats, { castShadow = true } = {}) {
  const group = new THREE.Group();
  for (const key of Object.keys(bake.parts)) {
    const geos = bake.parts[key];
    if (!geos.length || !mats[key]) {
      continue;
    }
    /* Boxes are indexed and extrusions are not, and a merge wants one or
     * the other; the whole village goes unindexed, which costs nothing at
     * this size. */
    const merged = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)), false);
    const mesh = new THREE.Mesh(merged, mats[key]);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.name = `village-${key}`;
    group.add(mesh);
  }
  for (const name of Object.keys(bake.instances)) {
    const entry = bake.instances[name];
    if (!entry.matrices.length || !mats[entry.key]) {
      continue;
    }
    const mesh = new THREE.InstancedMesh(entry.geometry, mats[entry.key], entry.matrices.length);
    entry.matrices.forEach((mx, i) => mesh.setMatrixAt(i, mx));
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.name = `village-${name}`;
    group.add(mesh);
  }
  /* The merged parts were cloned from the sources, so those can go; an
   * instanced mesh draws its source directly and keeps it. */
  disposeSources(new Set(Object.values(bake.instances).map((e) => e.geometry)));
  return group;
}

/*
 * A frame is a place and a heading to build in. put() takes a part in
 * the frame's own coordinates (x across, y up, z along, +x the front)
 * and bakes it in the world; frames nest, so a window is a frame on a
 * wall which is a frame on a house. Only the placer ever knows where
 * the house is.
 */
export function frame(parent, x, y, z, ry = 0) {
  const bake = parent.bake ?? parent;
  const one = new THREE.Vector3(1, 1, 1);
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
    one,
  );
  if (parent.m) {
    m.premultiply(parent.m);
  }
  const local = new THREE.Matrix4();
  const tmp = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const compose = (lx, ly, lz, lry, lrx, lrz, sx, sy, sz) => {
    e.set(lrx, lry, lrz);
    q.setFromEuler(e);
    local.compose(p.set(lx, ly, lz), q, s.set(sx, sy, sz));
    return tmp.multiplyMatrices(m, local);
  };
  const put = (key, geometry, lx = 0, ly = 0, lz = 0, lry = 0, lrx = 0, lrz = 0, sx = 1, sy = 1, sz = 1) => {
    const mx = compose(lx, ly, lz, lry, lrx, lrz, sx, sy, sz);
    if (geometry.userData.roof) {
      bake.roofs.push(roofRecord(geometry.userData.roof, mx.elements, key));
    }
    bake.pushM(key, geometry, mx);
  };
  /* A roof drawn by some other means than put (swiss2's sagging roofs
   * reshape the shell first), recorded at this frame's origin. */
  const noteRoof = (roof, key, sag) => {
    bake.roofs.push(roofRecord(roof, m.elements, key, sag));
  };
  const inst = (name, key, geometry, lx = 0, ly = 0, lz = 0, lry = 0, sc = 1) => {
    bake.instance(name, key, geometry, compose(lx, ly, lz, lry, 0, 0, sc, sc, sc));
  };
  /* A solid part of the building in this frame's coordinates, for its
   * colliders (roofs.js partSolids): `cover` false for one that stands on
   * the roof, a chimney, and stays solid while the roof is ground. */
  const solid = (x0, y0, z0, x1, y1, z1, cover = true) => {
    bake.solids.push({ e: m.elements.slice(), box: [x0, y0, z0, x1, y1, z1], cover });
  };
  /* A roof drawn by other means than a roofShell, as its upper faces in
   * this frame (roofs.js gableTop and the rest). */
  const roofFaces = (shape, key) => {
    bake.roofs.push(roofRecord(shape, m.elements, key));
  };
  const at = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyMatrix4(m);
  return { bake, m, put, inst, at, noteRoof, solid, roofFaces };
}

/*
 * Source geometry, cached by its dimensions: a village asks for the same
 * box a thousand times. The bake clones what it is given, so the sources
 * are freed once the bake is merged.
 */
const SRC = new Map();
function cached(key, make) {
  let g = SRC.get(key);
  if (!g) {
    g = make();
    /* Unindexed once here rather than once per clone: the bake merges
     * thousands of these and the merge wants them all the same kind. */
    if (g.index) {
      g = g.toNonIndexed();
    }
    SRC.set(key, g);
  }
  return g;
}
function disposeSources(keep) {
  for (const g of SRC.values()) {
    if (!keep.has(g)) {
      g.dispose();
    }
  }
  SRC.clear();
}
/* A box centred at the origin. */
function box(w, h, d) {
  return cached(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
}
/* A box with its bottom on y = 0, the way a building part is thought of. */
function boxUp(w, h, d) {
  return cached(`u${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0));
}
function cyl(rTop, rBot, h, n) {
  return cached(`c${rTop},${rBot},${h},${n}`, () => new THREE.CylinderGeometry(rTop, rBot, h, n).translate(0, h / 2, 0));
}

/*
 * A closed solid from a list of planar polygons, each wound counter
 * clockwise seen from outside. Flat normals, one triangle fan per face,
 * so the cel bands read each face as one plane. Every roof and every
 * wedge in the village comes through here.
 */
function polySolid(faces) {
  const pos = [];
  const nrm = [];
  const uv = [];
  for (const f of faces) {
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let i = 0; i < f.length; i += 1) {
      const a = f[i];
      const b = f[(i + 1) % f.length];
      nx += (a[1] - b[1]) * (a[2] + b[2]);
      ny += (a[2] - b[2]) * (a[0] + b[0]);
      nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    for (let i = 1; i < f.length - 1; i += 1) {
      for (const v of [f[0], f[i], f[i + 1]]) {
        pos.push(v[0], v[1], v[2]);
        nrm.push(nx, ny, nz);
        uv.push(0, 0);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}

/* A convex profile in the xy plane, wound counter clockwise, extruded
 * from z0 to z1: a wedge, a ramp, a gable wall. */
function prism(profile, z0, z1) {
  const front = profile.map(([x, y]) => [x, y, z1]);
  const back = profile.map(([x, y]) => [x, y, z0]).reverse();
  const faces = [front, back];
  for (let i = 0; i < profile.length; i += 1) {
    const a = profile[i];
    const b = profile[(i + 1) % profile.length];
    faces.push([[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]]);
  }
  return polySolid(faces);
}

/*
 * A roof as one closed shell. The top surface is given as faces on the
 * eave outline; the underside is the same surface a thickness lower,
 * and the edge is closed with a quad per boundary edge. The frame's
 * origin is the wall plate: y = 0 where the rafters meet the wall.
 *
 *   kind     'gable', 'halfhip' (the Bernese half hip) or 'hip'
 *   hw, hd   half width across the ridge and half depth along it
 *   ov       eaves overhang on the long sides
 *   ovA, ovB overhang at the -z and +z ends (a farmhouse has none where
 *            the barn joins)
 *   pitch    radians; t is the shell's thickness square to the slope
 *   f        half hip: fraction of the rise the gable stays vertical
 *
 * Returns the geometry and the numbers a wall needs to close its gable
 * against the underside.
 */
function roofShell({ kind, hw, hd, ov, ovA = ov, ovB = ov, pitch, t = 0.2, f = 0.5 }) {
  const tanP = Math.tan(pitch);
  const dy = t / Math.cos(pitch);
  const ex = hw + ov;
  const zA = -(hd + ovA);
  const zB = hd + ovB;
  const yT = -ov * tanP + dy;
  const yR = hw * tanP + dy;
  const top = [];
  let rzA = zA;
  let rzB = zB;
  let yH = yR;
  let xh = 0;
  if (kind === 'gable') {
    top.push([[-ex, yT, zA], [-ex, yT, zB], [0, yR, zB], [0, yR, zA]]);
    top.push([[ex, yT, zB], [ex, yT, zA], [0, yR, zA], [0, yR, zB]]);
  } else if (kind === 'hip') {
    rzA = zA + ex;
    rzB = zB - ex;
    top.push([[-ex, yT, zA], [-ex, yT, zB], [0, yR, rzB], [0, yR, rzA]]);
    top.push([[ex, yT, zB], [ex, yT, zA], [0, yR, rzA], [0, yR, rzB]]);
    top.push([[-ex, yT, zB], [ex, yT, zB], [0, yR, rzB]]);
    top.push([[ex, yT, zA], [-ex, yT, zA], [0, yR, rzA]]);
  } else {
    xh = (1 - f) * ex;
    yH = yT + f * (yR - yT);
    rzA = zA + (1 - f) * ex;
    rzB = zB - (1 - f) * ex;
    top.push([[-ex, yT, zA], [-ex, yT, zB], [-xh, yH, zB], [0, yR, rzB], [0, yR, rzA], [-xh, yH, zA]]);
    top.push([[ex, yT, zB], [ex, yT, zA], [xh, yH, zA], [0, yR, rzA], [0, yR, rzB], [xh, yH, zB]]);
    top.push([[-xh, yH, zB], [xh, yH, zB], [0, yR, rzB]]);
    top.push([[xh, yH, zA], [-xh, yH, zA], [0, yR, rzA]]);
  }
  /* Boundary edges: a directed edge whose reverse no face owns. */
  const key = (v) => `${v[0].toFixed(3)},${v[1].toFixed(3)},${v[2].toFixed(3)}`;
  const owned = new Set();
  for (const face of top) {
    for (let i = 0; i < face.length; i += 1) {
      owned.add(`${key(face[i])}>${key(face[(i + 1) % face.length])}`);
    }
  }
  const edges = [];
  for (const face of top) {
    for (let i = 0; i < face.length; i += 1) {
      const a = face[i];
      const b = face[(i + 1) % face.length];
      if (!owned.has(`${key(b)}>${key(a)}`)) {
        edges.push([a, b]);
      }
    }
  }
  const drop = (v) => [v[0], v[1] - dy, v[2]];
  const faces = [...top];
  for (const face of top) {
    faces.push(face.map(drop).reverse());
  }
  for (const [a, b] of edges) {
    faces.push([b, a, drop(a), drop(b)]);
  }
  const geo = polySolid(faces);
  /* The upper faces and the walls they stand on, so a frame that puts
   * this shell can record it as a surface (frame, roofs.js). */
  geo.userData.roof = { top, dy, hw, hd };
  return { geo, edges, yT, yR, yH, xh, ex, zA, zB, rzA, rzB, dy, tanP };
}

/*
 * The profile of a wall that closes under a roof: from the wall plate at
 * +hw over the gable to -hw, three centimetres under the rafters so the
 * two never share a plane. A hip roof needs no gable at all.
 */
function gableProfile(roof, kind, hw) {
  const eps = 0.03;
  if (kind === 'hip') {
    return [[hw, 0], [-hw, 0]];
  }
  if (kind === 'gable') {
    return [[hw, 0], [0, hw * roof.tanP - eps], [-hw, 0]];
  }
  const yFlat = roof.yH - roof.dy - eps;
  return [[hw, 0], [roof.xh, yFlat], [-roof.xh, yFlat], [-hw, 0]];
}

/*
 * Everything that sits on a roof shell once it is up: the fascia or
 * bargeboard on every edge, the ridge cap, rafter tails under the long
 * eaves, snow guards where asked for. The frame is the roof's.
 */
function dressRoof(f, roof, { key, fascia, snowGuard = false, rafters = true }) {
  const { yT, yR, ex, zA, zB, rzA, rzB, dy, tanP } = roof;
  for (const [a, b] of roof.edges) {
    const dx = b[0] - a[0];
    const dyy = b[1] - a[1];
    const dz = b[2] - a[2];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    if (Math.abs(dz) > Math.abs(dx)) {
      /* An eave along the ridge: a vertical fascia board just outside it. */
      const len = Math.abs(dz) + 0.12;
      const out = Math.sign(mid[0]) || Math.sign(dz);
      f.put(fascia, box(0.06, 0.22, len), mid[0] + out * 0.03, mid[1] - 0.09, mid[2]);
    } else {
      /* A verge or a hip eave in an end plane: a board along the slope,
       * its top a whisker above the roof so it reads as an edge. */
      const len = Math.hypot(dx, dyy) + 0.1;
      const ang = Math.atan2(dyy, dx);
      const out = Math.sign(mid[2]);
      /* The board sits a little into the roof, whichever way the edge
       * was wound: the normal that points down is the one into it. */
      let nx = Math.sin(ang);
      let ny = -Math.cos(ang);
      if (ny > 0) {
        nx = -nx;
        ny = -ny;
      }
      f.put(fascia, box(len, 0.22, 0.06), mid[0] + nx * 0.09, mid[1] + ny * 0.09, mid[2] + out * 0.03, 0, 0, ang);
    }
  }
  /* Ridge cap, its lower half buried in the apex. */
  const ridgeLen = rzB - rzA;
  if (ridgeLen > 0.2) {
    f.put(key, box(0.34, 0.16, ridgeLen + 0.1), 0, yR - 0.02, (rzA + rzB) / 2);
  }
  if (rafters) {
    const n = Math.max(2, Math.round((zB - zA) / 2.2));
    const ov = ex - (roof.hw ?? 0);
    for (const side of [-1, 1]) {
      for (let k = 0; k < n; k += 1) {
        const z = zA + 0.5 + (k + 0.5) * ((zB - zA - 1) / n);
        const len = ov + 0.3;
        const cx = side * (ex - len / 2 + 0.05);
        const cy = yT - dy - 0.08 + (len / 2 - 0.05) * tanP;
        f.put('boardLine', box(len, 0.14, 0.12), cx, cy, z, 0, 0, -side * Math.atan(tanP));
      }
    }
  }
  if (snowGuard) {
    for (const side of [-1, 1]) {
      const x = side * (ex - 0.7);
      const ySurf = yT + 0.7 * tanP;
      f.put('metal', box(0.05, 0.05, zB - zA - 0.8), x, ySurf + 0.24, 0);
      const n = Math.max(2, Math.round((zB - zA) / 3));
      for (let k = 0; k < n; k += 1) {
        const z = zA + 0.5 + (k + 0.5) * ((zB - zA - 1) / n);
        f.put('metal', box(0.04, 0.3, 0.04), x, ySurf + 0.1, z);
      }
    }
  }
}

/*
 * A window as an opening: a frame ring proud of the wall, the glass set
 * five centimetres back inside it, a mullion, a sill, and a shutter
 * each side. The frame's +z is out of the wall.
 */
function windowFrame(w, h, bar = 0.08, depth = 0.1) {
  return cached(`w${w},${h},${bar},${depth}`, () => {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, -h / 2);
    shape.lineTo(w / 2, -h / 2);
    shape.lineTo(w / 2, h / 2);
    shape.lineTo(-w / 2, h / 2);
    shape.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-w / 2 + bar, -h / 2 + bar);
    hole.lineTo(-w / 2 + bar, h / 2 - bar);
    hole.lineTo(w / 2 - bar, h / 2 - bar);
    hole.lineTo(w / 2 - bar, -h / 2 + bar);
    hole.closePath();
    shape.holes.push(hole);
    return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  });
}
function glassPane(w, h) {
  return cached(`g${w},${h}`, () => new THREE.PlaneGeometry(w, h));
}
function casement(wall, x, y, w, h, { shutter = null, sill = true, mullion = true } = {}) {
  const win = frame(wall, x, y, 0, 0);
  win.put('trim', windowFrame(w, h), 0, 0, 0);
  win.put('glass', glassPane(w - 0.16, h - 0.16), 0, 0, 0.05);
  if (mullion) {
    win.put('trim', box(0.05, h - 0.16, 0.03), 0, 0, 0.07);
    win.put('trim', box(w - 0.16, 0.05, 0.03), 0, h * 0.18, 0.07);
  }
  if (sill) {
    win.put('trim', box(w + 0.12, 0.06, 0.16), 0, -h / 2 - 0.03, 0.08);
  }
  if (shutter) {
    const sw = w / 2 - 0.02;
    for (const s of [-1, 1]) {
      win.put(shutter, box(sw, h, 0.05), s * (w / 2 + sw / 2 + 0.05), 0, 0.025);
    }
  }
}
/* A door in a frame, its step outside. */
function doorway(wall, x, w, h, { key = 'boardLine', step = 'stone', y0 = SOCLE } = {}) {
  const d = frame(wall, x, y0 + h / 2, 0, 0);
  d.put('trim', windowFrame(w + 0.16, h + 0.16, 0.08, 0.1), 0, 0, 0);
  d.put(key, box(w, h, 0.06), 0, 0, 0.04);
  d.put('metal', box(0.04, 0.04, 0.1), w / 2 - 0.12, 0, 0.1);
  if (step) {
    /* The step swallows the socle's lip in front of the door. */
    d.put(step, box(w + 0.5, y0 + 0.02, 0.5), 0, -h / 2 - y0 / 2 + 0.01, 0.25);
  }
}

/*
 * A balcony the whole width of a face: deck, board balustrade, handrail,
 * posts, consoles under the deck and geranium boxes on the rail. The
 * wall frame's +z is out of the wall; the balcony hangs at y = 0.
 */
function balcony(wall, len, { out = 1.3, board = 'larch' } = {}) {
  /* Solid as a wall, deck to rail, under the eaves (roofs.js). */
  wall.solid(-len / 2, -0.12, 0, len / 2, 1.05, out);
  wall.put('boardLine', box(len, 0.12, out), 0, 0.06, out / 2);
  /* The balustrade is boarded in the house's own timber with a dark
   * rail over it; a dark panel the whole width reads as a hole. */
  wall.put(board, box(len, 0.82, 0.05), 0, 0.12 + 0.41, out - 0.06);
  wall.put('boardLine', box(len + 0.08, 0.07, 0.12), 0, 0.985, out - 0.06);
  const posts = Math.max(2, Math.round(len / 2.4));
  for (let k = 0; k <= posts; k += 1) {
    const x = -len / 2 + 0.06 + k * ((len - 0.12) / posts);
    wall.put('boardLine', boxUp(0.1, 0.9, 0.1), x, 0.06, out - 0.08);
  }
  const consoles = Math.max(2, Math.round(len / 2.2));
  for (let k = 0; k < consoles; k += 1) {
    const x = -len / 2 + 0.4 + (k + 0.5) * ((len - 0.8) / consoles);
    wall.put('boardLine', box(0.1, 0.12, out - 0.1), x, -0.06, (out - 0.1) / 2);
  }
  const pots = Math.max(1, Math.round(len / 1.4));
  for (let k = 0; k < pots; k += 1) {
    const x = -len / 2 + 0.5 + (k + 0.5) * ((len - 1) / pots);
    wall.put('boardLine', box(0.5, 0.12, 0.16), x, 1.08, out - 0.06);
    wall.put('geranium', box(0.46, 0.14, 0.2), x, 1.2, out - 0.06);
  }
}

/* A stack of logs under the eaves, cut ends out. */
function woodpile(wall, x, len, rows = 3) {
  const log = cached('log', () => new THREE.CylinderGeometry(0.13, 0.13, 0.5, 6).rotateX(Math.PI / 2));
  const n = Math.max(2, Math.floor(len / 0.3));
  for (let r = 0; r < rows; r += 1) {
    const count = n - (r % 2);
    for (let k = 0; k < count; k += 1) {
      const lx = x - ((count - 1) * 0.3) / 2 + k * 0.3;
      wall.put('logEnd', log, lx, 0.14 + r * 0.26, 0.28);
    }
  }
}

/* A stone plinth under a footprint, from the cut foundation up to the
 * socle the walls stand on. Every building starts here. */
const SOCLE = 0.12;
function plinth(f, w, d, found) {
  f.put('stone', box(w + 0.2, found + SOCLE, d + 0.2), 0, (SOCLE - found) / 2, 0);
}

/* Horizontal boarding lines on a face, thin and proud, so the timber
 * reads as boards rather than a painted block. */
function boarding(wall, len, y0, h, rows = 3) {
  for (let k = 1; k <= rows; k += 1) {
    wall.put('boardLine', box(len, 0.05, 0.02), 0, y0 + k * (h / (rows + 1)), 0.01);
  }
}

/* A chimney through the roof: a stone stack with a cap and a dark flue. */
function chimney(f, x, z, y0, y1) {
  /* It stands on the roof, so it stays solid while the roof is ground. */
  f.solid(x - 0.45, y0, z - 0.45, x + 0.45, y1 + 0.22, z + 0.45, false);
  f.put('stone', boxUp(0.7, y1 - y0, 0.7), x, y0, z);
  f.put('stone', box(0.9, 0.1, 0.9), x, y1 + 0.05, z);
  f.put('ink', box(0.3, 0.12, 0.3), x, y1 + 0.16, z);
}

/*
 * The upper storey of a timber building: the wall as one solid whose
 * profile closes the gable under the roof, the roof shell on top, its
 * dressing, and the chimney. Returns the roof so the caller can put
 * windows in the gable and read the ridge height.
 */
function timberTop(f, { w, d, y0, floors, floorH, kind, key, roofKey, fascia, ov, ovA = ov, ovB = ov, pitch, snowGuard, chimneyAt, f: hipF = 0.5 }) {
  /* A hip's end slopes meet the wall plate only when the ends overhang
   * as much as the sides. */
  if (kind === 'hip') {
    ovA = ov;
    ovB = ov;
  }
  const hw = w / 2;
  const hd = d / 2;
  const plate = y0 + floors * floorH;
  const roof = roofShell({ kind, hw, hd, ov, ovA, ovB, pitch, f: hipF });
  roof.hw = hw;
  const profile = [[hw, y0], ...gableProfile(roof, kind, hw).map(([x, y]) => [x, y + plate]), [-hw, y0]];
  f.put(key, prism(profile, -hd, hd));
  const rf = frame(f, 0, plate, 0, 0);
  rf.put(roofKey, roof.geo);
  dressRoof(rf, roof, { key: roofKey, fascia, snowGuard });
  if (chimneyAt) {
    chimney(f, chimneyAt[0], chimneyAt[1], plate - 0.5, plate + roof.yR + 0.8);
  }
  return { roof, plate, top: plate + roof.yR + 0.9 };
}

/*
 * A chalet. Stone or rendered ground floor, one or two timber floors
 * jettied a little over it, a low pitched roof with deep eaves, a
 * balcony the width of the sunny side (+x) or of both long sides,
 * shutters and geraniums, a door with a step, a woodpile under the
 * eaves. The spec is one of the variants the village picks from.
 */
export function chalet(f, rng, spec) {
  const {
    w = 9, d = 12, floors = 1, roof = 'gable', board = 'larch', base = 'stone',
    balconies = 'one', shutter = 'shutterGreen', roofKey = 'shingle', fascia = 'trim',
    found = 0.3, pitch = 0.46, ov = 1.3, ovE = 1.2, ovA = ovE, ovB = ovE, blankA = false,
  } = spec;
  const baseH = 2.5;
  const floorH = 2.55;
  const jet = 0.3;
  const wu = w + 2 * jet;
  const hw = w / 2;
  const hwu = wu / 2;
  const hd = d / 2;
  plinth(f, w, d, found);
  f.put(base, boxUp(w, baseH, d), 0, SOCLE, 0);
  const top = timberTop(f, {
    w: wu, d, y0: SOCLE + baseH, floors, floorH, kind: roof, key: board, roofKey, fascia,
    ov, ovA, ovB, pitch, snowGuard: true, chimneyAt: [-w / 4, d / 5],
  });
  const y1 = SOCLE + baseH;
  /* The four wall frames, +z out of each. */
  const east = frame(f, hwu, 0, 0, Math.PI / 2);
  const west = frame(f, -hwu, 0, 0, -Math.PI / 2);
  const south = frame(f, 0, 0, hd, 0);
  const north = frame(f, 0, 0, -hd, Math.PI);
  const eastBase = frame(f, hw, 0, 0, Math.PI / 2);
  const westBase = frame(f, -hw, 0, 0, -Math.PI / 2);
  const cols = Math.max(2, Math.round(d / 3.1));
  const slot = (c) => -hd + (c + 0.5) * (d / cols);
  for (let k = 0; k < floors; k += 1) {
    const fy = y1 + k * floorH;
    const hasBalcony = k === floors - 1 || floors === 1 || rng() < 0.6;
    for (const [wall, on] of [[east, true], [west, balconies === 'both']]) {
      boarding(wall, d - 0.2, fy, floorH);
      if (on && hasBalcony) {
        balcony(frame(wall, 0, fy, 0, 0), d - 0.6, { board });
      }
      for (let c = 0; c < cols; c += 1) {
        const x = wall === east ? -slot(c) : slot(c);
        if (on && hasBalcony && c === Math.floor(cols / 2)) {
          casement(wall, x, fy + 1.05, 0.9, 1.9, { sill: false });
        } else {
          casement(wall, x, fy + 1.45, 0.95, 1.05, { shutter });
        }
      }
    }
  }
  for (const wall of blankA ? [south] : [south, north]) {
    boarding(wall, wu - 0.2, y1, floors * floorH);
    for (let k = 0; k < floors; k += 1) {
      const fy = y1 + k * floorH;
      casement(wall, -wu / 4, fy + 1.45, 0.95, 1.05, { shutter });
      casement(wall, wu / 4, fy + 1.45, 0.95, 1.05, { shutter });
    }
    if (roof !== 'hip') {
      casement(wall, 0, top.plate + 0.5, 0.6, 0.6, { shutter, mullion: false });
    }
  }
  /* Ground floor: the door and a window row on the front, windows and
   * the woodpile on the back, one window each gable end. */
  doorway(eastBase, -slot(0), 1.05, 2.05);
  for (let c = 1; c < cols; c += 1) {
    casement(eastBase, -slot(c), SOCLE + 1.35, 0.9, 1.0, { shutter });
  }
  casement(westBase, slot(0), SOCLE + 1.35, 0.9, 1.0, { shutter });
  woodpile(westBase, slot(cols - 1) - 0.2, Math.min(3.2, d / cols - 0.4));
  casement(frame(f, 0, 0, hd, 0), hw / 2, SOCLE + 1.35, 0.9, 1.0, { shutter });
  if (!blankA) {
    casement(frame(f, 0, 0, -hd, Math.PI), hw / 2, SOCLE + 1.35, 0.9, 1.0, { shutter });
  }
  const hb = balconies === 'none' ? 0 : 1.4;
  return { hw: Math.max(top.roof.ex, hwu + hb), hd: hd + Math.max(ovA, ovB), top: top.top };
}

/*
 * A barn: stone footing, dark boarding, a steep roof with a hay door in
 * the gable and big doors on the end. 'stall' is the long gabled cattle
 * barn; 'hay' is the squarer half hipped store with a lean-to along one
 * side.
 */
export function barn(f, spec) {
  const { kind = 'stall', w = 11, d = 16, found = 0.3, board = 'larchDark', roofKey = 'shingleDark', ovA = 1.1, ovB = 1.1 } = spec;
  const hw = w / 2;
  const hd = d / 2;
  const footH = 1.1;
  const wallH = kind === 'stall' ? 3.4 : 4.2;
  plinth(f, w, d, found);
  f.put('stone', boxUp(w, footH, d), 0, SOCLE, 0);
  const top = timberTop(f, {
    w, d, y0: SOCLE + footH, floors: 1, floorH: wallH, kind: kind === 'stall' ? 'gable' : 'halfhip', key: board,
    roofKey, fascia: 'boardLine', ov: 0.9, ovA, ovB, pitch: kind === 'stall' ? 0.72 : 0.62, snowGuard: false,
    chimneyAt: null, f: 0.55,
  });
  const gable = frame(f, 0, 0, hd, 0);
  doorway(gable, 0, 3.0, 3.0, { key: 'boardLine', step: null });
  f.put('boardLine', box(0.08, 3.0, 0.1), 0, SOCLE + 1.5, hd + 0.06);
  /* The hay door up in the gable, and the hoist beam over it. */
  const hayY = top.plate + (kind === 'stall' ? 1.0 : 0.6);
  gable.put('trim', windowFrame(1.6, 1.6, 0.08, 0.1), 0, hayY, 0);
  gable.put('ink', box(1.44, 1.44, 0.04), 0, hayY, 0.03);
  gable.put('boardLine', box(0.14, 0.14, 1.4), 0, hayY + 1.0, 0.6);
  const back = frame(f, 0, 0, -hd, Math.PI);
  casement(back, -w / 4, SOCLE + footH + 1.4, 0.8, 0.6, { mullion: false });
  casement(back, w / 4, SOCLE + footH + 1.4, 0.8, 0.6, { mullion: false });
  for (const wall of [frame(f, hw, 0, 0, Math.PI / 2), frame(f, -hw, 0, 0, -Math.PI / 2)]) {
    boarding(wall, d - 0.2, SOCLE + footH, wallH, 4);
    const n = Math.max(2, Math.round(d / 4));
    for (let k = 0; k < n; k += 1) {
      casement(wall, -hd + (k + 0.5) * (d / n), SOCLE + footH + 1.6, 0.8, 0.6, { mullion: false });
    }
  }
  let hwOut = top.roof.ex;
  if (kind === 'hay') {
    /* The lean-to: a shed roof off the +x wall on posts, over the
     * woodpile and the cart. */
    const out = 3.0;
    const y0 = SOCLE + footH + wallH - 1.2;
    const shed = prism([[hw, y0 + 0.9], [hw + out, y0], [hw + out, y0 + 0.16], [hw, y0 + 1.06]], -hd + 0.5, hd - 0.5);
    f.put(roofKey, shed);
    /* Ground, on posts: its frame at its middle, falling toward +x. */
    frame(f, hw + out / 2, y0, 0).roofFaces({
      top: shedTop(-out / 2, 1.06, out / 2, 0.16, -hd + 0.5, hd - 0.5), dy: 0.16, hw: out / 2, hd: hd - 0.5, open: true, kind: 'leanTo',
    }, roofKey);
    for (const z of [-hd + 0.8, 0, hd - 0.8]) {
      f.put('boardLine', boxUp(0.18, y0 + 0.1, 0.18), hw + out - 0.2, SOCLE, z);
      f.solid(hw + out - 0.29, SOCLE, z - 0.09, hw + out - 0.11, y0, z + 0.09);
    }
    woodpile(frame(f, hw, 0, 0, Math.PI / 2), 0, d * 0.5, 4);
    hwOut = Math.max(hwOut, hw + out);
  }
  return { hw: hwOut, hd: hd + Math.max(ovA, ovB), top: top.top };
}

/*
 * A farmhouse with the barn attached under one long ridge, the Bernese
 * way: the house at the +z end, the barn behind it, the barn's roof a
 * little higher and steeper so the join reads.
 */
export function farmhouse(f, rng, spec) {
  const { found = 0.3, board = 'larch', shutter = 'shutterGreen' } = spec;
  const houseD = 12;
  const barnD = 15;
  const w = 10.5;
  const house = frame(f, 0, 0, barnD / 2, 0);
  const h = chalet(house, rng, {
    w, d: houseD, floors: 1, roof: 'halfhip', board, base: 'stone', balconies: 'one', shutter,
    found, ov: 1.4, ovB: 1.3, ovA: 0, blankA: true, pitch: 0.48,
  });
  /* The barn is turned round so its doors face away from the house, and
   * neither roof overhangs the join: the barn's taller gable takes it. */
  const barnF = frame(f, 0, 0, -houseD / 2, Math.PI);
  const b = barn(barnF, { kind: 'stall', w: w + 0.6, d: barnD, found, board: 'larchDark', ovA: 0 });
  return { hw: Math.max(h.hw, b.hw), hd: (houseD + barnD) / 2 + 1.3, top: Math.max(h.top, b.top) };
}

/*
 * The Gasthof: three storeys, a rendered ground floor, timber above,
 * balconies on every floor along the front, a half hipped roof and a
 * sign board on a bracket. The front is +x.
 */
export function gasthof(f, rng, spec) {
  const { found = 0.3, board = 'honey', shutter = 'shutterRed' } = spec;
  const w = 12;
  const d = 17;
  const baseH = 3.0;
  const floorH = 2.7;
  const hw = w / 2;
  const hd = d / 2;
  plinth(f, w, d, found);
  f.put('render', boxUp(w, baseH, d), 0, SOCLE, 0);
  const top = timberTop(f, {
    w, d, y0: SOCLE + baseH, floors: 2, floorH, kind: 'halfhip', key: board, roofKey: 'slate', fascia: 'trim',
    ov: 1.4, ovA: 1.2, ovB: 1.2, pitch: 0.5, snowGuard: true, chimneyAt: [-2.5, 3], f: 0.5,
  });
  const y1 = SOCLE + baseH;
  const east = frame(f, hw, 0, 0, Math.PI / 2);
  const west = frame(f, -hw, 0, 0, -Math.PI / 2);
  const cols = 5;
  const slot = (c) => -hd + (c + 0.5) * (d / cols);
  for (let k = 0; k < 2; k += 1) {
    const fy = y1 + k * floorH;
    boarding(east, d - 0.2, fy, floorH);
    boarding(west, d - 0.2, fy, floorH);
    balcony(frame(east, 0, fy, 0, 0), d - 0.6, { out: 1.4, board });
    for (let c = 0; c < cols; c += 1) {
      casement(east, -slot(c), fy + 1.05, 0.9, 1.9, { sill: false });
      casement(west, slot(c), fy + 1.5, 0.95, 1.1, { shutter });
    }
  }
  /* The ground floor: a door in the middle, big windows either side. */
  doorway(east, -slot(2), 1.3, 2.3, { key: 'larchDark' });
  for (const c of [0, 1, 3, 4]) {
    casement(east, -slot(c), SOCLE + 1.6, 1.5, 1.4, { shutter });
  }
  for (const c of [0, 2, 4]) {
    casement(west, slot(c), SOCLE + 1.6, 1.2, 1.2, { shutter });
  }
  for (const wall of [frame(f, 0, 0, hd, 0), frame(f, 0, 0, -hd, Math.PI)]) {
    for (let k = 0; k < 2; k += 1) {
      const fy = y1 + k * floorH;
      casement(wall, -w / 4, fy + 1.5, 0.95, 1.1, { shutter });
      casement(wall, w / 4, fy + 1.5, 0.95, 1.1, { shutter });
    }
    casement(wall, 0, SOCLE + 1.6, 1.2, 1.2, { shutter });
  }
  /* The sign: a board hung off a wrought bracket beside the door. */
  east.put('ink', box(0.06, 0.06, 1.3), -slot(2) + 1.6, y1 - 0.5, 0.65);
  east.put('ink', box(0.06, 0.4, 0.06), -slot(2) + 1.6, y1 - 0.7, 1.25);
  east.put('trim', box(0.9, 0.5, 0.05), -slot(2) + 1.6, y1 - 1.15, 1.25);
  east.put('signRed', box(0.8, 0.4, 0.06), -slot(2) + 1.6, y1 - 1.15, 1.25);
  return { hw: Math.max(top.roof.ex, hw + 1.5), hd: hd + 1.2, top: top.top };
}

/*
 * The bakery: two storeys, a rendered ground floor with one big shop
 * window and a long sign board over it, timber above, a gabled roof.
 */
export function shop(f, rng, spec) {
  const { found = 0.3, board = 'weathered', shutter = 'shutterGreen' } = spec;
  const w = 9;
  const d = 11;
  const baseH = 2.9;
  const hw = w / 2;
  const hd = d / 2;
  plinth(f, w, d, found);
  f.put('render', boxUp(w, baseH, d), 0, SOCLE, 0);
  const top = timberTop(f, {
    w: w + 0.4, d, y0: SOCLE + baseH, floors: 1, floorH: 2.55, kind: 'gable', key: board, roofKey: 'shingle', fascia: 'trim',
    ov: 1.2, ovA: 1.2, ovB: 1.2, pitch: 0.44, snowGuard: true, chimneyAt: [-2, 2.5],
  });
  const y1 = SOCLE + baseH;
  const east = frame(f, hw, 0, 0, Math.PI / 2);
  const eastUp = frame(f, hw + 0.2, 0, 0, Math.PI / 2);
  doorway(east, -hd + 1.6, 1.1, 2.05, { key: 'larchDark' });
  casement(east, 1.2, SOCLE + 1.3, 4.2, 1.5, { mullion: false });
  east.put('trim', box(d - 1.0, 0.6, 0.12), 0, y1 - 0.45, 0.06);
  east.put('signRed', box(d - 1.2, 0.5, 0.04), 0, y1 - 0.45, 0.13);
  /* The hanging pretzel: a gold ring on a bracket at the corner. */
  const ring = cached('pretzel', () => new THREE.TorusGeometry(0.35, 0.07, 6, 12));
  east.put('ink', box(0.05, 0.05, 0.9), hd - 0.6, y1 + 0.4, 0.45);
  east.put('cross', ring, hd - 0.6, y1 - 0.1, 0.85);
  boarding(eastUp, d - 0.2, y1, 2.55);
  for (const x of [-3, 0, 3]) {
    casement(eastUp, x, y1 + 1.45, 0.95, 1.05, { shutter });
  }
  const westUp = frame(f, -hw - 0.2, 0, 0, -Math.PI / 2);
  boarding(westUp, d - 0.2, y1, 2.55);
  for (const x of [-3, 0, 3]) {
    casement(westUp, x, y1 + 1.45, 0.95, 1.05, { shutter });
  }
  casement(frame(f, -hw, 0, 0, -Math.PI / 2), 0, SOCLE + 1.5, 1.0, 1.1, { shutter });
  for (const wall of [frame(f, 0, 0, hd, 0), frame(f, 0, 0, -hd, Math.PI)]) {
    casement(wall, -2, y1 + 1.45, 0.95, 1.05, { shutter });
    casement(wall, 2, y1 + 1.45, 0.95, 1.05, { shutter });
    casement(wall, 0, top.plate + 0.75, 0.7, 0.7, { shutter, mullion: false });
    casement(wall, 0, SOCLE + 1.5, 1.0, 1.1, { shutter });
  }
  return { hw: top.roof.ex, hd: hd + 1.2, top: top.top };
}

/*
 * The church: a white rendered nave under a steep slate roof, a square
 * tower at the +z end with a bell opening on each face, a clock on the
 * two faces that matter, an octagonal slate spire with a ball and cross,
 * and the graveyard wall round the plot with its gate toward +z.
 */
export function church(f, spec) {
  const { found = 0.3 } = spec;
  const w = 10;
  const d = 20;
  const wallH = 7;
  const hw = w / 2;
  const hd = d / 2;
  const tw = 5.5;
  const towerH = 18;
  plinth(f, w, d, found);
  const top = timberTop(f, {
    w, d, y0: SOCLE, floors: 1, floorH: wallH, kind: 'gable', key: 'render', roofKey: 'slate', fascia: 'trim',
    ov: 0.5, ovA: 0.4, ovB: 0, pitch: 0.95, snowGuard: false, chimneyAt: null,
  });
  /* Tall arched nave windows: a frame and glass, the arch read by a
   * half disc over each. */
  const arch = cached('arch', () => {
    const half = new THREE.Shape();
    half.absarc(0, 0, 0.55, 0, Math.PI, false);
    half.closePath();
    return new THREE.ExtrudeGeometry(half, { depth: 0.1, bevelEnabled: false });
  });
  for (const wall of [frame(f, hw, 0, 0, Math.PI / 2), frame(f, -hw, 0, 0, -Math.PI / 2)]) {
    for (let k = 0; k < 4; k += 1) {
      const x = -hd + 1.5 + (k + 0.5) * ((d - 3) / 4);
      casement(wall, x, SOCLE + 3.6, 1.1, 3.2, { mullion: true });
      wall.put('trim', arch, x, SOCLE + 5.2, 0);
    }
  }
  doorway(frame(f, 0, 0, -hd, Math.PI), 0, 1.8, 3.0, { key: 'larchDark' });
  /* The tower, built into the +z end: its -z face inside the nave's
   * gable wall so the two solids share nothing visible. */
  const tz = hd + tw / 2 - 0.3;
  f.put('stone', box(tw + 0.2, found + SOCLE, tw + 0.2), 0, (SOCLE - found) / 2, tz);
  f.put('render', boxUp(tw, towerH, tw), 0, SOCLE, tz);
  f.put('slate', box(tw + 0.5, 0.3, tw + 0.5), 0, SOCLE + towerH + 0.15, tz);
  /* Eight sided, a flat to each face of the tower, its flats just
   * inside the cap so nothing overhangs unsupported. */
  const spire = cached('spire', () => new THREE.ConeGeometry(tw * 0.58, 13, 8).translate(0, 6.5, 0));
  f.put('slate', spire, 0, SOCLE + towerH + 0.3, tz, Math.PI / 8);
  /* The tower's cap and spire are ground over the tower's walls: the
   * cone's corners are ConeGeometry's, a quarter turn apart from +z,
   * turned an eighth. */
  const cap = frame(f, 0, SOCLE + towerH + 0.3, tz);
  cap.roofFaces({
    top: [...flatTop(-(tw + 0.5) / 2, -(tw + 0.5) / 2, (tw + 0.5) / 2, (tw + 0.5) / 2, 0), ...pyramidTop(8, tw * 0.58, 0, 13, -Math.PI / 8)],
    dy: 0.3, hw: tw / 2, hd: tw / 2, kind: 'spire',
  }, 'slate');
  for (const b of spireCore(tw * 0.58, 0, 13)) {
    cap.solid(...b);
  }
  const ball = cached('ball', () => new THREE.SphereGeometry(0.32, 8, 6));
  f.put('cross', ball, 0, SOCLE + towerH + 13.3, tz);
  f.put('cross', boxUp(0.12, 2.0, 0.12), 0, SOCLE + towerH + 13.5, tz);
  f.put('cross', box(1.0, 0.12, 0.12), 0, SOCLE + towerH + 14.9, tz);
  doorway(frame(f, 0, 0, tz + tw / 2, 0), 0, 1.6, 2.8, { key: 'larchDark' });
  for (let k = 0; k < 4; k += 1) {
    const a = k * Math.PI / 2;
    const face = frame(f, Math.sin(a) * tw / 2, 0, tz + Math.cos(a) * tw / 2, a);
    /* The bell opening: a dark recess in a frame, louvred, under an
     * arch. */
    face.put('trim', windowFrame(1.3, 2.2, 0.1, 0.12), 0, SOCLE + towerH - 2.6, 0);
    face.put('ink', box(1.14, 2.04, 0.04), 0, SOCLE + towerH - 2.6, 0.03);
    for (let l = 0; l < 4; l += 1) {
      face.put('trim', box(1.14, 0.06, 0.08), 0, SOCLE + towerH - 3.4 + l * 0.5, 0.08);
    }
    face.put('trim', arch, 0, SOCLE + towerH - 1.45, 0);
    if (k === 0 || k === 1) {
      /* The clock: a white face in a dark ring, two hands at ten past
       * ten, the twelve marks as small ticks. */
      const cy = SOCLE + towerH - 6.2;
      const disc = cached('clock', () => new THREE.CylinderGeometry(1.15, 1.15, 0.08, 24).rotateX(Math.PI / 2));
      const rim = cached('clockrim', () => new THREE.CylinderGeometry(1.3, 1.3, 0.05, 24).rotateX(Math.PI / 2));
      face.put('ink', rim, 0, cy, 0.025);
      face.put('trim', disc, 0, cy, 0.09);
      for (let t = 0; t < 12; t += 1) {
        const ta = t * Math.PI / 6;
        face.put('ink', box(0.08, 0.2, 0.03), Math.sin(ta) * 0.98, cy + Math.cos(ta) * 0.98, 0.145, 0, 0, -ta);
      }
      face.put('ink', box(0.1, 0.72, 0.04), 0.25, cy + 0.2, 0.15, 0, 0, 0.55);
      face.put('ink', box(0.08, 0.95, 0.04), -0.3, cy + 0.32, 0.16, 0, 0, -0.55);
      face.put('cross', box(0.16, 0.16, 0.05), 0, cy, 0.17);
    }
    casement(face, 0, SOCLE + 8, 0.6, 1.6, { mullion: false, sill: false });
    casement(face, 0, SOCLE + 4, 0.6, 1.6, { mullion: false, sill: false });
  }
  /* The graveyard: a low stone wall round the plot with a gate toward
   * +z beside the tower, a few stones and crosses in the grass. */
  const gx = hw + 6;
  const gzA = -hd - 5;
  const gzB = tz + tw / 2 + 4;
  const wallY = 0.9;
  const seg = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    f.put('stone', boxUp(0.4, wallY, len), (x0 + x1) / 2, 0, (z0 + z1) / 2, Math.atan2(x1 - x0, z1 - z0));
    f.put('stone', boxUp(0.5, 0.1, len), (x0 + x1) / 2, wallY, (z0 + z1) / 2, Math.atan2(x1 - x0, z1 - z0));
  };
  seg(-gx, gzA, gx, gzA);
  seg(gx, gzA, gx, gzB);
  seg(-gx, gzA, -gx, gzB);
  seg(-gx, gzB, -1.6, gzB);
  seg(1.6, gzB, gx, gzB);
  for (const x of [-1.6, 1.6]) {
    f.put('stone', boxUp(0.6, 1.5, 0.6), x, 0, gzB);
    f.put('stone', box(0.7, 0.1, 0.7), x, 1.5, gzB);
  }
  for (let k = 0; k < 10; k += 1) {
    const side = k < 5 ? 1 : -1;
    const x = side * (hw + 2.4 + (k % 2) * 1.8);
    const z = -hd + 1 + (k % 5) * ((d - 2) / 5);
    if (k % 3 === 0) {
      f.put('trim', boxUp(0.12, 1.1, 0.12), x, 0, z);
      f.put('trim', box(0.6, 0.12, 0.12), x, 0.85, z);
    } else {
      f.put('stone', boxUp(0.6, 0.75, 0.14), x, 0, z);
    }
  }
  return {
    hw, hd, top: SOCLE + top.roof.yR + wallH + 0.5,
    tower: { z: tz, half: tw / 2, top: SOCLE + towerH + 15.2 },
    yard: { hw: gx + 0.3, zA: gzA - 0.3, zB: gzB + 0.3 },
  };
}

/*
 * The hangar by the strip: a portal framed shed, walls with real
 * thickness so the inside is a room, purlins under the roof, a sliding
 * door on a rail standing a third open at the +z end, a side door, the
 * concrete apron in front with tie down rings and the fuel pump.
 */
export function hangar(f, spec) {
  const { found = 0.3 } = spec;
  const w = 24;
  const d = 30;
  const wallH = 5;
  const hw = w / 2;
  const hd = d / 2;
  const t = 0.2;
  const pitch = 0.3;
  const slab = 0.05;
  f.put('concrete', box(w + 0.6, found + slab, d + 0.6), 0, (slab - found) / 2, 0);
  f.put('hangar', boxUp(t, wallH, d), hw - t / 2, slab, 0);
  f.put('hangar', boxUp(t, wallH, d), -hw + t / 2, slab, 0);
  f.put('hangar', boxUp(w - 2 * t, wallH, t), 0, slab, -hd + t / 2);
  /* The +z end: two piers and a lintel round the door opening. */
  const opening = 17;
  const openH = 4.2;
  const pierW = (w - 2 * t - opening) / 2;
  f.put('hangar', boxUp(pierW, wallH, t), -(opening / 2 + pierW / 2), slab, hd - t / 2);
  f.put('hangar', boxUp(pierW, wallH, t), opening / 2 + pierW / 2, slab, hd - t / 2);
  f.put('hangar', boxUp(opening, wallH - openH, t), 0, slab + openH, hd - t / 2);
  const roof = roofShell({ kind: 'gable', hw, hd, ov: 0.5, pitch, t: 0.15 });
  roof.hw = hw;
  const plate = slab + wallH;
  const rise = hw * Math.tan(pitch) - 0.03;
  for (const z of [hd - t, -hd]) {
    f.put('hangar', prism([[-hw, plate], [hw, plate], [0, plate + rise]], z, z + t));
  }
  const rf = frame(f, 0, plate, 0, 0);
  rf.put('hangarRoof', roof.geo);
  dressRoof(rf, roof, { key: 'hangarRoof', fascia: 'metal', rafters: false });
  /* Purlins under the roof, showing at the open end, and the portal
   * legs on the outside every five metres with a girt between them. */
  for (const x of [-10.5, -7, -3.5, 0, 3.5, 7, 10.5]) {
    const y = plate + (hw - Math.abs(x)) * Math.tan(pitch) - 0.12;
    f.put('metal', box(0.16, 0.2, d - 0.5), x, y, 0);
  }
  for (let k = 0; k <= 6; k += 1) {
    const z = -hd + k * (d / 6);
    for (const side of [-1, 1]) {
      f.put('metal', boxUp(0.24, wallH - 0.1, 0.3), side * (hw + 0.12), slab, Math.max(-hd + 0.2, Math.min(hd - 0.2, z)));
    }
  }
  for (const side of [-1, 1]) {
    f.put('metal', box(0.1, 0.16, d), side * (hw + 0.05), slab + 2.6, 0);
    const wall = frame(f, side * hw, 0, 0, side * Math.PI / 2);
    for (const z of [-9, -3, 3, 9]) {
      casement(wall, z, slab + 3.7, 1.4, 0.8, { mullion: false, sill: false });
    }
  }
  doorway(frame(f, hw, 0, 0, Math.PI / 2), -7.5, 1.0, 2.1, { key: 'door', step: 'concrete', y0: slab });
  /* The sliding door: one leaf hung outside the end wall on a rail, slid
   * a third of the way along it so the left third of the opening stands
   * open. The rail runs on past the corner to take the leaf. */
  const leafW = opening + 0.4;
  const slid = opening / 3;
  const leafX = slid;
  const leafZ = hd + 0.12;
  f.put('door', box(leafW, openH + 0.1, 0.12), leafX, slab + (openH + 0.1) / 2, leafZ);
  for (let k = 1; k < 4; k += 1) {
    f.put('ink', box(leafW - 0.2, 0.08, 0.03), leafX, slab + k * (openH / 4), leafZ + 0.075);
  }
  f.put('trim', box(0.35, 0.9, 0.04), leafX - leafW / 2 + 0.5, slab + 1.6, leafZ + 0.08);
  f.put('metal', box(24, 0.16, 0.14), 3, slab + openH + 0.35, hd + 0.2);
  for (let k = 0; k < 6; k += 1) {
    f.put('metal', box(0.12, 0.3, 0.1), leafX - leafW / 2 + 1 + k * ((leafW - 2) / 5), slab + openH + 0.15, hd + 0.16);
  }
  /* The apron, its tie down rings, and the fuel pump on its own pad. */
  const apronD = 22;
  f.put('concrete', box(w + 8, 0.1, apronD), 0, slab - 0.05, hd + 0.3 + apronD / 2);
  const ring = cached('tiedown', () => new THREE.TorusGeometry(0.16, 0.025, 6, 12).rotateX(Math.PI / 2));
  for (const x of [-5, 5]) {
    for (const z of [hd + 5, hd + 11, hd + 17]) {
      f.put('metal', ring, x, slab + 0.03, z);
    }
  }
  const pump = frame(f, -hw - 1.5, 0, hd + 7, Math.PI / 2);
  pump.put('concrete', box(2.0, 0.16, 1.4), 0, slab + 0.03, 0);
  pump.put('fuel', boxUp(0.7, 1.55, 0.5), 0, slab + 0.11, 0);
  pump.put('trim', box(0.46, 0.5, 0.03), 0, slab + 1.2, 0.26);
  pump.put('ink', box(0.16, 0.1, 0.03), 0, slab + 0.8, 0.26);
  pump.put('ink', cyl(0.02, 0.02, 1.3, 6), 0.4, slab + 0.3, 0.1);
  pump.put('ink', box(0.1, 0.22, 0.1), 0.4, slab + 1.4, 0.1);
  for (let k = 0; k < 3; k += 1) {
    pump.put('metal', cyl(0.3, 0.3, 0.9, 10), -1.6 - k * 0.7, slab + 0.11, -0.2);
  }
  return { hw: hw + 0.6, hd, top: plate + roof.yR + 0.2 };
}

/*
 * The bridge where the street crosses the stream: a stone barrel with a
 * segmental arch the stream runs under, the deck asphalted, parapets
 * with end posts, and an asphalt ramp with stone wing walls each side.
 * Local x is along the street, the arch opens along z.
 */
export function bridge(f, { span = 5, deckY = 1.05 } = {}) {
  const half = span / 2 + 0.7;
  const foot = half + 1.2;
  const rise = 0.75;
  const width = 6;
  const shape = new THREE.Shape();
  shape.moveTo(-foot, 0);
  shape.lineTo(-half, 0);
  for (let k = 1; k < 12; k += 1) {
    const a = Math.PI - (k / 12) * Math.PI;
    shape.lineTo(Math.cos(a) * half, Math.sin(a) * rise);
  }
  shape.lineTo(half, 0);
  shape.lineTo(foot, 0);
  shape.lineTo(foot, deckY);
  shape.lineTo(-foot, deckY);
  shape.closePath();
  const barrel = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  barrel.translate(0, 0, -width / 2);
  f.put('stone', barrel);
  f.put('asphalt', box(2 * foot, 0.05, 5), 0, deckY + 0.025, 0);
  for (const s of [-1, 1]) {
    f.put('stone', box(2 * foot, 0.5, 0.35), 0, deckY + 0.25, s * (width / 2 - 0.175));
    for (const e of [-1, 1]) {
      f.put('stone', boxUp(0.5, 0.75, 0.5), e * (foot + 0.1), deckY, s * (width / 2 - 0.2));
    }
  }
  const rampL = 7;
  for (const s of [-1, 1]) {
    const x0 = s * foot;
    const x1 = s * (foot + rampL);
    const ramp = s > 0
      ? [[x0, 0], [x1, 0], [x0, deckY]]
      : [[x1, 0], [x0, 0], [x0, deckY]];
    f.put('asphalt', prism(ramp, -2.5, 2.5));
    const wing = s > 0
      ? [[x0, 0], [x1, 0], [x0, deckY + 0.25]]
      : [[x1, 0], [x0, 0], [x0, deckY + 0.25]];
    f.put('stone', prism(wing, 2.5, 3.0));
    f.put('stone', prism(wing, -3.0, -2.5));
  }
  return { hw: foot + rampL, hd: width / 2, top: deckY + 0.8 };
}

/* The fountain in the square: an octagonal stone basin on a step,
 * water in it, a column with a spout. */
export function fountain(f) {
  const basin = cached('basin', () => {
    const shape = new THREE.Shape();
    const hole = new THREE.Path();
    for (let k = 0; k < 8; k += 1) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      const fn = k === 0 ? 'moveTo' : 'lineTo';
      shape[fn](Math.cos(a) * 1.9, Math.sin(a) * 1.9);
      hole[fn](Math.cos(a) * 1.6, Math.sin(a) * 1.6);
    }
    shape.closePath();
    hole.closePath();
    shape.holes.push(hole);
    return new THREE.ExtrudeGeometry(shape, { depth: 0.75, bevelEnabled: false }).rotateX(-Math.PI / 2);
  });
  f.put('cobble', cyl(2.6, 2.6, 0.12, 8), 0, 0, 0, Math.PI / 8);
  f.put('stone', basin, 0, 0.12, 0);
  f.put('water', cyl(1.64, 1.64, 0.55, 8), 0, 0.14, 0, Math.PI / 8);
  f.put('stone', cyl(0.24, 0.3, 1.7, 8), 0, 0.12, 0);
  f.put('stone', cyl(0.36, 0.36, 0.14, 8), 0, 1.82, 0);
  f.put('metal', box(0.06, 0.06, 0.6), 0, 1.35, 0.3);
  f.put('metal', box(0.06, 0.3, 0.06), 0, 1.2, 0.58);
  return { hw: 2.6, hd: 2.6, top: 2.0 };
}

/* A bench: timber slats on two iron ends, its back toward -z. */
export function bench(f) {
  f.put('fence', box(1.8, 0.05, 0.42), 0, 0.46, 0);
  f.put('fence', box(1.8, 0.38, 0.05), 0, 0.72, -0.2);
  for (const x of [-0.75, 0.75]) {
    f.put('ink', box(0.06, 0.44, 0.42), x, 0.22, 0);
    f.put('ink', box(0.06, 0.5, 0.06), x, 0.7, -0.2);
  }
}

/* The bus shelter: three timber walls, a shed roof, a bench inside, the
 * stop's post and disc beside it. Open toward +z. */
export function busShelter(f) {
  const w = 3.2;
  const d = 1.6;
  f.put('concrete', box(w + 0.4, 0.1, d + 0.4), 0, 0.05, 0);
  f.put('larchDark', boxUp(w, 2.3, 0.08), 0, 0.1, -d / 2);
  for (const s of [-1, 1]) {
    f.put('larchDark', boxUp(0.08, 2.3, d - 0.08), s * (w / 2 - 0.04), 0.1, 0.04);
  }
  f.put('shingleDark', prism([[-w / 2 - 0.3, 2.4], [w / 2 + 0.3, 2.4], [w / 2 + 0.3, 2.55], [-w / 2 - 0.3, 2.75]], -d / 2 - 0.3, d / 2 + 0.5));
  /* The roof is ground; under it, the three walls and the open front. */
  frame(f, 0, 2.4, 0.1).roofFaces({
    top: shedTop(-w / 2 - 0.3, 0.35, w / 2 + 0.3, 0.15, -d / 2 - 0.4, d / 2 + 0.4), dy: 0.15, hw: w / 2, hd: d / 2, open: true, kind: 'shelter',
  }, 'shingleDark');
  f.solid(-w / 2, 0.1, -d / 2 - 0.04, w / 2, 2.4, -d / 2 + 0.04);
  for (const s of [-1, 1]) {
    f.solid(s * (w / 2 - 0.04) - 0.04, 0.1, -d / 2 + 0.08, s * (w / 2 - 0.04) + 0.04, 2.4, d / 2);
  }
  const seat = frame(f, 0, 0.1, -d / 2 + 0.4, 0);
  bench(seat);
  f.put('metal', cyl(0.03, 0.03, 2.6, 6), w / 2 + 0.6, 0, d / 2 + 0.2);
  const disc = cached('stopdisc', () => new THREE.CylinderGeometry(0.28, 0.28, 0.04, 16).rotateX(Math.PI / 2));
  f.put('signBlue', disc, w / 2 + 0.6, 2.4, d / 2 + 0.2);
  f.put('trim', box(0.36, 0.08, 0.05), w / 2 + 0.6, 2.4, d / 2 + 0.2);
  return { hw: w / 2 + 0.8, hd: d / 2 + 0.5, top: 2.8 };
}

/* A road sign on a post: a place name board (blue on white) or a round
 * speed limit (white in red). */
export function roadSign(f, kind = 'place') {
  f.put('metal', cyl(0.035, 0.035, 2.4, 6), 0, 0, 0);
  if (kind === 'place') {
    f.put('trim', box(1.7, 0.7, 0.03), 0, 2.2, 0.035);
    f.put('signBlue', box(1.6, 0.6, 0.03), 0, 2.2, 0.06);
    f.put('trim', box(1.0, 0.16, 0.02), -0.15, 2.28, 0.08);
    f.put('trim', box(0.5, 0.1, 0.02), -0.4, 2.06, 0.08);
  } else {
    const disc = cached('signdisc', () => new THREE.CylinderGeometry(0.4, 0.4, 0.03, 16).rotateX(Math.PI / 2));
    const inner = cached('signinner', () => new THREE.CylinderGeometry(0.3, 0.3, 0.03, 16).rotateX(Math.PI / 2));
    f.put('signRed', disc, 0, 2.3, 0.03);
    f.put('trim', inner, 0, 2.3, 0.06);
    f.put('ink', box(0.08, 0.3, 0.02), -0.09, 2.3, 0.08);
    f.put('ink', box(0.16, 0.3, 0.02), 0.09, 2.3, 0.08);
  }
}

/* A telegraph pole with its crossarm and two insulators. The pole and
 * arm are one instanced geometry; the insulators another. */
export function poleGeometry() {
  return cached('pole', () => mergeGeometries([
    new THREE.CylinderGeometry(0.1, 0.15, 8, 6).translate(0, 4, 0),
    new THREE.BoxGeometry(1.2, 0.1, 0.1).translate(0, 7.5, 0),
  ].map((g) => g.toNonIndexed()), false));
}
export function insulatorGeometry() {
  return cached('insulator', () => mergeGeometries([
    new THREE.CylinderGeometry(0.05, 0.06, 0.16, 6).translate(-0.45, 7.63, 0),
    new THREE.CylinderGeometry(0.05, 0.06, 0.16, 6).translate(0.45, 7.63, 0),
  ].map((g) => g.toNonIndexed()), false));
}
export function telegraphPole(f) {
  f.inst('pole', 'fence', poleGeometry(), 0, -0.3, 0, 0);
  f.inst('insulator', 'trim', insulatorGeometry(), 0, -0.3, 0, 0);
}

/* A traffic cone with its square base, instanced along the strip. */
export function coneGeometry() {
  return cached('cone', () => mergeGeometries([
    new THREE.ConeGeometry(0.16, 0.5, 8).translate(0, 0.27, 0),
    new THREE.BoxGeometry(0.36, 0.04, 0.36).translate(0, 0.02, 0),
  ].map((g) => g.toNonIndexed()), false));
}
export function cone(f, x, z) {
  f.inst('cone', 'cone', coneGeometry(), x, 0, z, 0);
}

/* A run of post and rail fence between two points, each post lifted to
 * its own ground height by the caller's heightAt, the rails tilted to
 * follow. Posts are instanced; the rails are baked. skip(x, z) lets the
 * caller leave a gap, for a gate or the stream. */
export function fence(bake, heightAt, ax, az, bx, bz, skip = null) {
  const post = cached('post', () => new THREE.BoxGeometry(0.14, 1.3, 0.14).translate(0, 0.55, 0));
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.round(len / 3));
  const yaw = Math.atan2(-(bz - az), bx - ax);
  const m = new THREE.Matrix4();
  const pt = (k) => {
    const t = k / n;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    return { x, z, y: heightAt(x, z) };
  };
  for (let k = 0; k <= n; k += 1) {
    const p = pt(k);
    if (skip && skip(p.x, p.z)) {
      continue;
    }
    m.makeTranslation(p.x, p.y, p.z);
    bake.instance('post', 'fence', post, m);
    if (k < n) {
      const q = pt(k + 1);
      if (skip && skip(q.x, q.z)) {
        continue;
      }
      const seg = Math.hypot(q.x - p.x, q.z - p.z, q.y - p.y);
      const tilt = Math.atan2(q.y - p.y, Math.hypot(q.x - p.x, q.z - p.z));
      for (const h of [0.5, 0.95]) {
        bake.push('fence', box(+seg.toFixed(2), 0.08, 0.06), (p.x + q.x) / 2, (p.y + q.y) / 2 + h, (p.z + q.z) / 2, yaw, 0, tilt);
      }
    }
  }
}

/*
 * The style hook. A style that builds its own houses (swiss2 does, in
 * src/maps/swiss2/buildings/) writes into the same bake with the same
 * shapes underneath: these are the pieces it reuses. The cel alps never
 * reach them through here; exporting them changes nothing it builds.
 */
export { box, boxUp, cyl, cached, disposeSources, polySolid, prism, roofShell, gableProfile, SOCLE };
