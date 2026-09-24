/*
 * kit.js: what is built in the valley.
 *
 * The chalets, the church, the barns, the hangar, the fences, the cattle,
 * the pines and the road. Everything is authored at the origin on flat
 * ground and placed by the valley, which knows the terrain; nothing here
 * reads a height. Each builder returns geometry sorted by material so the
 * valley can bake a whole village into a handful of meshes: a chalet is
 * forty boxes and thirty chalets are one draw call per material, not
 * twelve hundred.
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

/* The village's palette: one material per surface, shared by every
 * building, so a baked village is one mesh per entry. */
export function villageMaterials() {
  return {
    stone: celMaterial({ color: 0xc9c2b6, rim: 0.12 }),
    timber: celMaterial({ color: 0x8d5f38, rim: 0.12 }),
    timberDark: celMaterial({ color: 0x5e3f26, rim: 0.1 }),
    roof: celMaterial({ color: 0x6a5a4c, rim: 0.12 }),
    roofRed: celMaterial({ color: 0x8c3b2e, rim: 0.1 }),
    trim: celMaterial({ color: 0xf1ebdd, rim: 0.1 }),
    glass: celMaterial({ color: 0x2b3a4a, rim: 0.35, rimColor: 0xcfe4ff }),
    shutter: celMaterial({ color: 0x3f6b3a, rim: 0.1 }),
    metal: celMaterial({ color: 0xb9bec4, rim: 0.25 }),
    hangar: celMaterial({ color: 0x9aa39a, rim: 0.2 }),
    hangarRoof: celMaterial({ color: 0x6f7a74, rim: 0.15 }),
    door: celMaterial({ color: 0x3a3f42, rim: 0.2 }),
    cross: celMaterial({ color: 0xd8b04a, rim: 0.3 }),
    fence: celMaterial({ color: 0x7a6a52, rim: 0.1 }),
    cowWhite: celMaterial({ color: 0xf2eee6, rim: 0.15 }),
    cowBrown: celMaterial({ color: 0x6b4a33, rim: 0.15 }),
    asphalt: celMaterial({ color: 0x4a4c50, rim: 0 }),
    paint: celMaterial({ color: 0xe6e2d8, rim: 0 }),
  };
}

/*
 * A bake is a list of { key, geometry, matrix } collected by the
 * builders. bakeAll merges every geometry of a key into one mesh with
 * that key's material, which is what makes a village cheap to draw.
 */
export function makeBake() {
  const parts = {};
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const push = (key, geometry, x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    e.set(rx, ry, rz);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
    const g = geometry.clone();
    g.applyMatrix4(m);
    (parts[key] ??= []).push(g);
  };
  return { parts, push };
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
  return group;
}

/* A box with its bottom on y = 0, the way a building part is thought of. */
function boxUp(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  return g;
}

/*
 * A gable roof over a footprint w by d, ridge along z, pitch in radians,
 * eaves out by `over` on every side. Two slabs meeting at the ridge, a
 * ridge beam, and the two gable triangles filled so nothing is hollow.
 * Returns the ridge height for whatever wants to stand on it.
 */
function gableRoof(bake, key, w, d, pitch, over, y0, x, z, ry, trimKey = null) {
  const half = w / 2 + over;
  const run = half;
  const rise = Math.tan(pitch) * (w / 2);
  const slabLen = Math.sqrt(run * run + (rise + Math.tan(pitch) * over) * (rise + Math.tan(pitch) * over));
  const slabT = 0.18;
  const length = d + 2 * over;
  const ridgeY = y0 + rise;
  const cx = Math.cos(ry);
  const sx = Math.sin(ry);
  /* Each slab is a box lying along the pitch, centred at the mid point of
   * its own run, rotated about z by the pitch, then the whole roof yawed. */
  for (const side of [-1, 1]) {
    const midX = side * half / 2;
    const midY = ridgeY - (rise + Math.tan(pitch) * over) / 2 + slabT / 2 * Math.cos(pitch);
    const wx = x + midX * cx;
    const wz = z - midX * sx;
    bake.push(key, new THREE.BoxGeometry(slabLen, slabT, length), wx, midY, wz, ry, 0, side * pitch);
  }
  /* The gables: a triangle each end, as a thin extruded shape. */
  const tri = new THREE.Shape();
  tri.moveTo(-w / 2, 0);
  tri.lineTo(w / 2, 0);
  tri.lineTo(0, rise);
  tri.lineTo(-w / 2, 0);
  const triGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.12, bevelEnabled: false });
  for (const end of [-1, 1]) {
    const ex = x + 0 * cx;
    const ez = z + end * (d / 2 - 0.06) * cx;
    bake.push(trimKey ?? key, triGeo, ex + end * (d / 2 - 0.06) * sx, y0, ez, ry);
  }
  bake.push(key, new THREE.BoxGeometry(0.28, 0.2, length), x, ridgeY + 0.04, z, ry);
  return ridgeY;
}

/*
 * A chalet. Stone ground floor, timber upper floor a little wider, a low
 * pitched gable roof with deep eaves, a balcony along the front with a
 * rail, windows with light frames and green shutters on every face, a
 * door, a chimney. Sizes vary; the proportions do not, because they are
 * what say "chalet" from a hundred metres up.
 */
export function chalet(bake, rng, { x, z, ry = 0, w = 9, d = 12 }) {
  const stoneH = 2.4;
  const timberH = 2.7;
  const eave = 1.3;
  const cx = Math.cos(ry);
  const sx = Math.sin(ry);
  /* Local to world for a point (lx, lz) in the chalet's own frame. */
  const at = (lx, lz) => ({ x: x + lx * cx + lz * sx, z: z - lx * sx + lz * cx });

  bake.push('stone', boxUp(w, stoneH, d), x, 0, z, ry);
  bake.push('timber', boxUp(w + 0.5, timberH, d + 0.5), x, stoneH, z, ry);
  /* Horizontal boarding: a few dark lines across the timber. */
  for (let k = 1; k < 4; k += 1) {
    bake.push('timberDark', new THREE.BoxGeometry(w + 0.56, 0.06, d + 0.56), x, stoneH + k * (timberH / 4), z, ry);
  }
  const ridgeY = gableRoof(bake, 'roof', w + 0.5, d + 0.5, 0.42, eave, stoneH + timberH, x, z, ry, 'timberDark');

  /* The balcony along the +x face of the upper floor. */
  const balc = at(w / 2 + 0.25 + 0.55, 0);
  bake.push('timberDark', new THREE.BoxGeometry(1.1, 0.14, d - 1), balc.x, stoneH + 0.02, balc.z, ry);
  for (let k = -1; k <= 1; k += 1) {
    const p = at(w / 2 + 0.25 + 1.05, k * (d - 1.2) / 2);
    bake.push('timberDark', boxUp(0.1, 1.0, 0.1), p.x, stoneH, p.z, ry);
  }
  const rail = at(w / 2 + 0.25 + 1.05, 0);
  bake.push('timberDark', new THREE.BoxGeometry(0.08, 0.08, d - 1), rail.x, stoneH + 1.0, rail.z, ry);

  /* Windows: a light frame proud of the wall, dark glass, a shutter each
   * side. Two rows on the long faces, one on the gables. */
  const win = (face, along, yy, shutters = true) => {
    const glassGeo = new THREE.BoxGeometry(0.06, 1.1, 0.9);
    const frameGeo = new THREE.BoxGeometry(0.1, 1.3, 1.1);
    const shutGeo = new THREE.BoxGeometry(0.05, 1.2, 0.42);
    const halfW = w / 2 + (yy > stoneH ? 0.25 : 0) + 0.02;
    const halfD = d / 2 + (yy > stoneH ? 0.25 : 0) + 0.02;
    let p;
    let yaw;
    if (face === 0 || face === 2) {
      p = at(face === 0 ? halfW : -halfW, along);
      yaw = ry;
    } else {
      p = at(along, face === 1 ? halfD : -halfD);
      yaw = ry + Math.PI / 2;
    }
    bake.push('trim', frameGeo, p.x, yy + 0.65, p.z, yaw);
    bake.push('glass', glassGeo, p.x, yy + 0.65, p.z, yaw);
    if (shutters) {
      const lateral = face === 0 || face === 2 ? { dx: sx, dz: cx } : { dx: cx, dz: -sx };
      for (const s of [-1, 1]) {
        bake.push('shutter', shutGeo, p.x + s * 0.72 * lateral.dx, yy + 0.65, p.z + s * 0.72 * lateral.dz, yaw);
      }
    }
  };
  const cols = Math.max(2, Math.floor(d / 3.2));
  for (let c = 0; c < cols; c += 1) {
    const along = -d / 2 + (c + 0.5) * (d / cols);
    win(0, along, stoneH + 0.9);
    win(2, along, stoneH + 0.9);
    if (c % 2 === 0) {
      win(2, along, 0.7);
    }
  }
  win(1, -w / 4, stoneH + 0.9);
  win(1, w / 4, stoneH + 0.9);
  win(3, 0, stoneH + 0.9);
  /* The door on the -z gable, and the chimney through the roof. */
  const door = at(w / 4, -d / 2 - 0.02);
  bake.push('trim', new THREE.BoxGeometry(1.3, 2.2, 0.1), door.x, 1.1, door.z, ry);
  bake.push('timberDark', new THREE.BoxGeometry(1.0, 2.0, 0.12), door.x, 1.0, door.z, ry);
  const chim = at(-w / 4, d / 4);
  bake.push('stone', boxUp(0.7, ridgeY + 0.9, 0.7), chim.x, 0, chim.z, ry);
  return { top: ridgeY + 0.3, halfW: w / 2 + eave, halfD: d / 2 + eave };
}

/* A barn: low walls, a big steep roof, a hay door in the gable. */
export function barn(bake, { x, z, ry = 0, w = 11, d = 16 }) {
  const wallH = 3.2;
  bake.push('timberDark', boxUp(w, wallH, d), x, 0, z, ry);
  bake.push('stone', boxUp(w + 0.2, 0.8, d + 0.2), x, 0, z, ry);
  const ridgeY = gableRoof(bake, 'roofRed', w, d, 0.62, 0.9, wallH, x, z, ry, 'timberDark');
  const cx = Math.cos(ry);
  const sx = Math.sin(ry);
  const doorX = x + (-d / 2 - 0.02) * sx;
  const doorZ = z + (-d / 2 - 0.02) * cx;
  bake.push('trim', new THREE.BoxGeometry(2.6, 2.6, 0.1), doorX, 1.3, doorZ, ry);
  bake.push('door', new THREE.BoxGeometry(2.2, 2.3, 0.12), doorX, 1.15, doorZ, ry);
  return { top: ridgeY, halfW: w / 2 + 0.9, halfD: d / 2 + 0.9 };
}

/* The church: a nave under a steep roof, a square tower at the west end
 * with a clock face, and a tall spire with a cross. */
export function church(bake, { x, z, ry = 0 }) {
  const w = 10;
  const d = 22;
  const wallH = 7;
  bake.push('stone', boxUp(w, wallH, d), x, 0, z, ry);
  const ridgeY = gableRoof(bake, 'roof', w, d, 0.75, 0.6, wallH, x, z, ry, 'stone');
  const cx = Math.cos(ry);
  const sx = Math.sin(ry);
  const tw = 5;
  const tx = x + (-d / 2 - tw / 2 + 0.5) * sx;
  const tz = z + (-d / 2 - tw / 2 + 0.5) * cx;
  const towerH = 17;
  bake.push('stone', boxUp(tw, towerH, tw), tx, 0, tz, ry);
  bake.push('trim', new THREE.CylinderGeometry(1.1, 1.1, 0.12, 16), tx + (-tw / 2 - 0.02) * sx * 0 + (-tw / 2 - 0.02) * cx, towerH - 3, tz + (tw / 2 + 0.02) * sx, ry, 0, Math.PI / 2);
  for (let k = 0; k < 4; k += 1) {
    const a = ry + k * Math.PI / 2;
    const px = tx + Math.cos(a) * (tw / 2 + 0.02);
    const pz = tz - Math.sin(a) * (tw / 2 + 0.02);
    bake.push('trim', new THREE.BoxGeometry(0.08, 1.6, 0.9), px, towerH - 1.4, pz, a);
    bake.push('glass', new THREE.BoxGeometry(0.06, 1.4, 0.7), px, towerH - 1.4, pz, a);
  }
  const spire = new THREE.ConeGeometry(tw * 0.62, 10, 4);
  spire.translate(0, 5, 0);
  bake.push('roof', spire, tx, towerH, tz, ry + Math.PI / 4);
  bake.push('cross', boxUp(0.16, 2.2, 0.16), tx, towerH + 10, tz, ry);
  bake.push('cross', new THREE.BoxGeometry(1.2, 0.16, 0.16), tx, towerH + 11.5, tz, ry);
  for (let k = 0; k < 4; k += 1) {
    const along = -d / 2 + (k + 0.5) * (d / 4);
    for (const side of [-1, 1]) {
      const px = x + side * (w / 2 + 0.02) * cx + along * sx;
      const pz = z - side * (w / 2 + 0.02) * sx + along * cx;
      bake.push('trim', new THREE.BoxGeometry(0.1, 3.4, 1.2), px, 4, pz, ry);
      bake.push('glass', new THREE.BoxGeometry(0.06, 3.2, 1.0), px, 4, pz, ry);
    }
  }
  return { top: towerH + 12, halfW: w / 2 + 1, halfD: d / 2 + tw + 1, towerX: tx, towerZ: tz, towerHalf: tw / 2 };
}

/*
 * The hangar by the strip: a wide shed with a barrel roof, its big door
 * standing open a little, a fuel drum row and an apron slab in front.
 */
export function hangar(bake, { x, z, ry = 0 }) {
  const w = 22;
  const d = 26;
  const wallH = 4.5;
  const cx = Math.cos(ry);
  const sx = Math.sin(ry);
  bake.push('hangar', boxUp(w, wallH, d), x, 0, z, ry);
  /* Barrel roof: a half cylinder along z, radius half the width. */
  const barrel = new THREE.CylinderGeometry(w / 2, w / 2, d + 0.6, 24, 1, false, 0, Math.PI);
  /* The half with x positive, turned so that it is the half with y
   * positive, then laid along z: the roof, not a trough. */
  barrel.rotateZ(Math.PI / 2);
  barrel.rotateY(Math.PI / 2);
  bake.push('hangarRoof', barrel, x, wallH, z, ry);
  /* End walls under the barrel: a half disc each end. */
  const endCap = new THREE.CircleGeometry(w / 2, 24, 0, Math.PI);
  for (const end of [-1, 1]) {
    bake.push('hangar', endCap, x + end * (d / 2) * sx, wallH, z + end * (d / 2) * cx, ry + (end > 0 ? 0 : Math.PI));
  }
  /* The door on the +z end, open a third. */
  const dx = x + (d / 2 + 0.05) * sx;
  const dz = z + (d / 2 + 0.05) * cx;
  bake.push('door', new THREE.BoxGeometry(w - 4, wallH - 0.2, 0.12), dx, (wallH - 0.2) / 2, dz, ry);
  bake.push('trim', new THREE.BoxGeometry(w - 3.6, 0.3, 0.2), dx, wallH - 0.1, dz, ry);
  /* Apron and fuel drums. */
  const ax = x + (d / 2 + 9) * sx;
  const az = z + (d / 2 + 9) * cx;
  bake.push('asphalt', new THREE.BoxGeometry(w + 8, 0.06, 18), ax, 0.01, az, ry);
  for (let k = 0; k < 4; k += 1) {
    const px = x + (w / 2 + 1.2) * cx + (-d / 2 + 2 + k * 1.1) * sx;
    const pz = z - (w / 2 + 1.2) * sx + (-d / 2 + 2 + k * 1.1) * cx;
    bake.push('metal', new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10).translate(0, 0.45, 0), px, 0, pz);
  }
  return { top: wallH + w / 2, halfW: w / 2, halfD: d / 2 };
}

/* A run of post and rail fence between two points on flat ground; the
 * valley lifts each post to its own ground height. */
export function fence(bake, heightAt, ax, az, bx, bz) {
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.round(len / 3));
  const yaw = Math.atan2(-(bz - az), bx - ax);
  for (let k = 0; k <= n; k += 1) {
    const t = k / n;
    const px = ax + (bx - ax) * t;
    const pz = az + (bz - az) * t;
    const py = heightAt(px, pz);
    bake.push('fence', boxUp(0.14, 1.2, 0.14), px, py - 0.1, pz);
    if (k < n) {
      const nx = ax + (bx - ax) * ((k + 1) / n);
      const nz = az + (bz - az) * ((k + 1) / n);
      const ny = heightAt(nx, nz);
      const mx = (px + nx) / 2;
      const mz = (pz + nz) / 2;
      const my = (py + ny) / 2;
      const seg = Math.hypot(nx - px, nz - pz, ny - py);
      const tilt = Math.atan2(ny - py, Math.hypot(nx - px, nz - pz));
      for (const h of [0.55, 1.0]) {
        bake.push('fence', new THREE.BoxGeometry(seg, 0.08, 0.06), mx, my + h, mz, yaw, 0, tilt);
      }
    }
  }
}

/* Cattle: a body, a head and four legs, brown or white, standing where
 * the valley puts them. Cheap and unmistakable from the air. */
export function cow(bake, rng, { x, y, z, ry }) {
  const key = rng() < 0.6 ? 'cowBrown' : 'cowWhite';
  const cx = Math.cos(ry);
  const sx = Math.sin(ry);
  bake.push(key, new THREE.BoxGeometry(2.0, 1.0, 0.9), x, y + 1.1, z, ry);
  bake.push(key, new THREE.BoxGeometry(0.7, 0.6, 0.5), x + 1.2 * cx, y + 1.35, z - 1.2 * sx, ry);
  for (const lx of [-0.7, 0.7]) {
    for (const lz of [-0.3, 0.3]) {
      bake.push(key, boxUp(0.18, 0.7, 0.18), x + lx * cx + lz * sx, y, z - lx * sx + lz * cx, ry);
    }
  }
}

