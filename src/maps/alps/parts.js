/*
 * parts.js: vertex coloured parts, baked into one mesh.
 *
 * The village bakes by material: one mesh per surface colour, because a
 * chalet has six colours and thirty chalets share them. Everything that
 * moves is the other way round: a car has eight colours and there is one
 * of it, so a mesh per colour is eight draw calls for one car. Here a
 * part carries its colour as a vertex attribute and every part of a thing
 * merges into ONE geometry drawn with ONE white cel material, so a bus is
 * a draw call, a cow is a draw call, and the whole row of parked cars is
 * a draw call. The cel ramp, the rim and the cloud shadow come from the
 * material as they do for everything else in the valley.
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

/* The one material a parts bake is drawn with: white, so the vertex colour
 * is the colour. Options are celMaterial's; the caller picks the finish. */
export function partsMaterial(opts = {}) {
  const mat = celMaterial({ color: 0xffffff, ...opts });
  mat.vertexColors = true;
  return mat;
}

/*
 * A parts list. push(colour, geometry, x, y, z, ry, rx, rz, sx, sy, sz)
 * clones the geometry, places it, colours every vertex and keeps it. The
 * Euler order is three's XYZ, the same as kit.js: a part tilted about z
 * and then yawed about y reads as tilt first, yaw second.
 */
export function makeParts() {
  const list = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const c = new THREE.Color();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  /* A geometry that already carries its colours, a baked wheel say,
   * placed as it is. */
  const pushBaked = (geometry, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    /* Unindexed from the start: a merge wants every geometry alike, and an
     * extrusion is never indexed. */
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    e.set(rx, ry, rz);
    q.setFromEuler(e);
    p.set(x, y, z);
    s.set(sx, sy, sz);
    m.compose(p, q, s);
    g.applyMatrix4(m);
    list.push(g);
    return g;
  };
  const push = (colour, geometry, x, y, z, ry, rx, rz, sx, sy, sz) => {
    const g = pushBaked(geometry, x, y, z, ry, rx, rz, sx, sy, sz);
    c.set(colour);
    const n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    for (let k = 0; k < n; k += 1) {
      col[k * 3] = c.r;
      col[k * 3 + 1] = c.g;
      col[k * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  };
  return { list, push, pushBaked };
}

/* One draw for many of a thing, casting and taking shadow. */
export function instanced(geometry, material, count) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  /* Instances that walk or ride leave the sphere three computes from
   * their first matrices; the draw is one call either way. */
  mesh.frustumCulled = false;
  return mesh;
}

/* One geometry from a parts list. The list's geometries are consumed. */
export function bakeParts(parts) {
  const merged = mergeGeometries(parts.list, false);
  for (const g of parts.list) {
    g.dispose();
  }
  parts.list.length = 0;
  return merged;
}

/* Copy every part of `src` into `dst`, placed at (x, y, z) and yawed:
 * how a parked car's parts join the row's single bake. */
export function placeParts(dst, src, x, y, z, ry) {
  const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
  for (const g of src.list) {
    const c = g.clone();
    c.applyMatrix4(m);
    dst.list.push(c);
  }
}

/*
 * A raked panel between two points (ax, ay) and (bx, by) of a side
 * profile, `w` across in z and `t` thick. The town's vehicles are drawn
 * this way for a reason worth keeping: a box given a guessed tilt is
 * inverted half the time, a box spanning two named points cannot be.
 */
export function panel(parts, colour, ax, ay, bx, by, w, t) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-4) {
    return;
  }
  parts.push(colour, new THREE.BoxGeometry(len, t, w), (ax + bx) / 2, (ay + by) / 2, 0, 0, 0, Math.atan2(dy, dx));
}

export function box(w, h, d) {
  return new THREE.BoxGeometry(w, h, d);
}

/* A profile in the xy plane, as [x, y] pairs, extruded `depth` along z
 * and centred on z = 0: a bus front, a boat hull, anything whose side
 * view is the shape. */
export function extrudeZ(points, depth) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let k = 1; k < points.length; k += 1) {
    shape.lineTo(points[k][0], points[k][1]);
  }
  shape.lineTo(points[0][0], points[0][1]);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  return g;
}

/* A box standing on y = 0. */
export function boxUp(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  return g;
}

/* A cylinder along z, the way an axle or a wheel lies under a vehicle
 * drawn along x. */
export function cylZ(r, len, seg = 12) {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateX(Math.PI / 2);
  return g;
}

/* A darker cut of a paint colour: the valance, the cladding, the shadow
 * side of a roof. */
export function shade(colour, k) {
  return new THREE.Color(colour).multiplyScalar(k).getHex();
}
