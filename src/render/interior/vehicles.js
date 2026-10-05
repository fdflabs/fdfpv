/*
 * vehicles.js: the Interior's motorcycles and its pickup (TECH-NEEDS N4,
 * M1: the camp's three or four old motorcycles, the one passing through
 * Sector Bravo, the pickup at the colonia's store), low and instanced as
 * the people are (figures.js): a few boxes each, the engine warm in the
 * thermal picture, the rider or driver drawn by figures.js when there is
 * one.
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

import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { thermalKind } from '../thermal.js';

/* A box at (x, y, z) (its middle), w x h x d, coloured, with heat. */
function box(THREE, x, y, z, w, h, d, colour, heat) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.deleteAttribute('uv');
  g.translate(x, y, z);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const th = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    col.set(colour, i * 3);
    th[i] = heat;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('thermal', new THREE.BufferAttribute(th, 1));
  return g;
}

const TYRE = [0.03, 0.03, 0.03];
const METAL = [0.25, 0.25, 0.26];
const PAINT = [1, 1, 1];
/* Heat over the passive surface (src/render/thermal.js, the hot kind's
 * attribute, 110 K a unit): an air cooled single's cylinder and its pipe
 * run 60 to 120 K over the air, a pickup's bonnet over its engine 20 to
 * 40 K. */
const ENGINE_HEAT = 0.55;
const HOOD_HEAT = 0.25;

/* An old 125 cc motorcycle, 2 m long, facing -z, on the ground at y 0. */
function motorcycle(THREE) {
  return mergeGeometries([
    box(THREE, 0, 0.32, -0.68, 0.1, 0.62, 0.62, TYRE, 0.005),
    box(THREE, 0, 0.32, 0.68, 0.12, 0.62, 0.62, TYRE, 0.005),
    box(THREE, 0, 0.5, 0, 0.24, 0.3, 0.7, METAL, ENGINE_HEAT),
    box(THREE, 0, 0.78, -0.12, 0.28, 0.2, 0.5, PAINT, 0.03),
    box(THREE, 0, 0.78, 0.38, 0.26, 0.1, 0.6, [0.06, 0.05, 0.05], 0.02),
    box(THREE, 0, 0.95, -0.66, 0.7, 0.05, 0.05, METAL, 0.01),
    box(THREE, 0, 0.62, -0.68, 0.06, 0.6, 0.06, METAL, 0.01),
  ]);
}

/* A worn double cab pickup, 5.2 m long, facing -z. */
function pickup(THREE) {
  const parts = [];
  for (const x of [-0.78, 0.78]) {
    for (const z of [-1.6, 1.5]) {
      parts.push(box(THREE, x, 0.38, z, 0.26, 0.76, 0.76, TYRE, 0.01));
    }
  }
  parts.push(box(THREE, 0, 0.82, 0, 1.8, 0.62, 5.2, PAINT, 0.02));
  parts.push(box(THREE, 0, 1.42, -0.35, 1.7, 0.62, 2.3, PAINT, 0.02));
  parts.push(box(THREE, 0, 1.46, -0.36, 1.72, 0.44, 2.1, [0.05, 0.06, 0.07], 0.01));
  parts.push(box(THREE, 0, 0.82, -2.1, 1.6, 0.5, 0.8, METAL, HOOD_HEAT));
  return mergeGeometries(parts);
}

/*
 * The vehicles: { group, set(list), stats(), dispose() }. `set` takes
 * [{ kind: 'motorcycle' | 'pickup', x, y, z, heading, tint, running }]
 * (scene frame, heading clockwise from north); a parked one's engine is
 * cooling, a running one's hot.
 */
export function makeVehicles(THREE, { cap = 32 } = {}) {
  const group = new THREE.Group();
  group.name = 'interior-vehicles';
  const mat = thermalKind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 }), 'hot', { attr: true });
  const meshes = { motorcycle: new THREE.InstancedMesh(motorcycle(THREE), mat, cap), pickup: new THREE.InstancedMesh(pickup(THREE), mat, cap) };
  for (const [k, m] of Object.entries(meshes)) {
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    m.count = 0;
    m.frustumCulled = false;
    m.castShadow = true;
    m.name = `interior-${k}`;
    group.add(m);
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const col = new THREE.Color();
  let drawn = 0;
  return {
    group,
    meshes,
    set(list) {
      for (const m of Object.values(meshes)) {
        m.count = 0;
      }
      drawn = 0;
      for (const v of list) {
        const m = meshes[v.kind];
        if (!m || m.count >= cap) {
          continue;
        }
        q.setFromAxisAngle(up, -v.heading);
        pos.set(v.x, v.y, v.z);
        m4.compose(pos, q, one);
        m.setMatrixAt(m.count, m4);
        col.setRGB(...(v.tint || [0.5, 0.1, 0.08]));
        m.setColorAt(m.count, col);
        m.count += 1;
        drawn += 1;
      }
      for (const m of Object.values(meshes)) {
        m.instanceMatrix.needsUpdate = true;
        m.instanceColor.needsUpdate = true;
      }
    },
    stats: () => ({ drawn }),
    dispose() {
      for (const m of Object.values(meshes)) {
        m.geometry.dispose();
      }
      mat.dispose();
      group.removeFromParent();
    },
  };
}
