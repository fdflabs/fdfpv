/*
 * vehicles.js: the Interior's motorcycles and its pickup (TECH-NEEDS N4,
 * M1: the camp's three or four old motorcycles, the one passing through
 * Sector Bravo, the pickup at the colonia's store), low and instanced as
 * the people are (figures.js): the engine warm in the thermal picture,
 * the rider or driver drawn by figures.js when there is one.
 *
 * A motorcycle has to read as one from the air through the camera ball:
 * two round wheels with dark tyres, a fork and bars, a painted tank and
 * side panel, a long dark seat, the engine and its pipe. Only the paint
 * takes the instance's colour (tint.js); tyres, metal and seat keep their
 * own.
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
import {
  slotTint, addSlotTints, setSlotTints, slotTintsChanged,
} from './tint.js';

const TYRE = [0.025, 0.025, 0.025];
const RIM = [0.32, 0.32, 0.33];
const METAL = [0.18, 0.18, 0.19];
const CHROME = [0.55, 0.55, 0.52];
const SEAT = [0.035, 0.03, 0.03];
const PAINT = [1, 1, 1];
const LAMP = [0.7, 0.68, 0.6];
const GLASS = [0.05, 0.06, 0.07];
/* Heat over the passive surface (src/render/thermal.js, the hot kind's
 * attribute, 110 K a unit): an air cooled single's cylinder and its pipe
 * run 60 to 120 K over the air, a pickup's bonnet over its engine 20 to
 * 40 K. */
const ENGINE_HEAT = 0.55;
const PIPE_HEAT = 0.7;
const HOOD_HEAT = 0.25;

/* A part: geometry g0 moved by m, one colour and heat; painted parts
 * take the instance's colour (tint.js slot 1). */
function part(THREE, g0, colour, heat, m) {
  const g = g0.index ? g0.toNonIndexed() : g0;
  g.deleteAttribute('uv');
  g.applyMatrix4(m);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    col.set(colour, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('thermal', new THREE.BufferAttribute(new Float32Array(n).fill(heat), 1));
  g.setAttribute('slot', new THREE.BufferAttribute(new Float32Array(n).fill(colour === PAINT ? 1 : 0), 1));
  return g;
}

/* A box at (x, y, z) (its middle), w x h x d. */
function box(THREE, x, y, z, w, h, d, colour, heat) {
  return part(THREE, new THREE.BoxGeometry(w, h, d), colour, heat, new THREE.Matrix4().makeTranslation(x, y, z));
}

/* A rod of radius r from a to b ([x, y, z]). */
function rod(THREE, a, b, r, colour, heat, seg = 6) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  const m = new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new THREE.Vector3(1, 1, 1));
  return part(THREE, g, colour, heat, m);
}

/* A wheel on an axle across the bike at (y, z): tyre, rim and hub. */
function wheel(THREE, y, z, r, w) {
  const across = (rad, width, colour, heat) => part(THREE, new THREE.CylinderGeometry(rad, rad, width, 14, 1).rotateZ(Math.PI / 2), colour, heat, new THREE.Matrix4().makeTranslation(0, y, z));
  return [across(r, w, TYRE, 0.005), across(r * 0.72, w + 0.008, RIM, 0.01), across(r * 0.25, w + 0.05, METAL, 0.01)];
}

/* An old 125 cc motorcycle, 2 m long, facing -z, on the ground at y 0. */
function motorcycle(THREE) {
  const R = 0.31;
  const F = -0.67;
  const B = 0.66;
  const ellipsoid = (x, y, z, sx, sy, sz, colour) => part(THREE, new THREE.SphereGeometry(1, 10, 6).scale(sx, sy, sz), colour, 0.03, new THREE.Matrix4().makeTranslation(x, y, z));
  return mergeGeometries([
    ...wheel(THREE, R, F, R, 0.09),
    ...wheel(THREE, R, B, R, 0.11),
    /* The fork, its head, the bars and the lamp. */
    rod(THREE, [-0.07, R, F], [-0.07, 0.93, F + 0.2], 0.022, CHROME, 0.01),
    rod(THREE, [0.07, R, F], [0.07, 0.93, F + 0.2], 0.022, CHROME, 0.01),
    box(THREE, 0, 0.66, F + 0.02, 0.13, 0.04, 0.42, PAINT, 0.02),
    rod(THREE, [-0.36, 1.03, F + 0.27], [0.36, 1.03, F + 0.27], 0.014, SEAT, 0.01),
    rod(THREE, [-0.1, 0.97, F + 0.24], [0.1, 0.97, F + 0.24], 0.03, METAL, 0.01),
    part(THREE, new THREE.CylinderGeometry(0.085, 0.07, 0.1, 10).rotateX(Math.PI / 2), PAINT, 0.03, new THREE.Matrix4().makeTranslation(0, 0.88, F + 0.13)),
    part(THREE, new THREE.CircleGeometry(0.07, 10).rotateY(Math.PI), LAMP, 0.03, new THREE.Matrix4().makeTranslation(0, 0.88, F + 0.075)),
    rod(THREE, [-0.3, 1.03, F + 0.28], [-0.33, 1.2, F + 0.3], 0.008, METAL, 0.01, 4),
    rod(THREE, [0.3, 1.03, F + 0.28], [0.33, 1.2, F + 0.3], 0.008, METAL, 0.01, 4),
    box(THREE, -0.33, 1.22, F + 0.3, 0.07, 0.05, 0.015, GLASS, 0.01),
    box(THREE, 0.33, 1.22, F + 0.3, 0.07, 0.05, 0.015, GLASS, 0.01),
    /* The frame from the head down under the tank to the swing arm. */
    rod(THREE, [0, 0.9, F + 0.24], [0, 0.48, 0.0], 0.035, METAL, 0.02),
    rod(THREE, [0, 0.82, F + 0.3], [0, 0.78, 0.45], 0.03, METAL, 0.02),
    rod(THREE, [-0.1, R, B], [-0.1, 0.42, 0.1], 0.025, METAL, 0.01),
    rod(THREE, [0.1, R, B], [0.1, 0.42, 0.1], 0.025, METAL, 0.01),
    rod(THREE, [-0.11, R + 0.04, B - 0.04], [-0.11, 0.78, 0.42], 0.025, CHROME, 0.01),
    rod(THREE, [0.11, R + 0.04, B - 0.04], [0.11, 0.78, 0.42], 0.025, CHROME, 0.01),
    /* The tank, the side panel and the tail, painted; the seat. */
    ellipsoid(0, 0.87, -0.2, 0.15, 0.1, 0.27, PAINT),
    box(THREE, 0, 0.68, 0.16, 0.25, 0.17, 0.26, PAINT, 0.03),
    box(THREE, 0, 0.8, 0.62, 0.15, 0.05, 0.36, PAINT, 0.02),
    box(THREE, 0, 0.84, 0.24, 0.25, 0.08, 0.62, SEAT, 0.02),
    box(THREE, 0, 0.88, 0.72, 0.26, 0.025, 0.3, METAL, 0.01),
    box(THREE, 0, 0.72, B + 0.12, 0.13, 0.03, 0.34, SEAT, 0.01),
    /* The engine, its finned cylinder and the pipe along the right. */
    box(THREE, 0, 0.4, 0.0, 0.24, 0.26, 0.36, METAL, ENGINE_HEAT),
    part(THREE, new THREE.BoxGeometry(0.2, 0.2, 0.18), METAL, ENGINE_HEAT, new THREE.Matrix4().makeTranslation(0, 0.58, -0.17).multiply(new THREE.Matrix4().makeRotationX(0.35))),
    rod(THREE, [0.06, 0.5, -0.24], [0.15, 0.27, -0.1], 0.03, CHROME, PIPE_HEAT),
    rod(THREE, [0.15, 0.27, -0.1], [0.17, 0.42, 0.78], 0.035, CHROME, PIPE_HEAT),
    /* The pegs. */
    rod(THREE, [-0.22, 0.32, 0.05], [0.22, 0.32, 0.05], 0.015, METAL, 0.01, 4),
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
 * The vehicles: { group, set(list), stats(), dispose() }. set takes
 * [{ kind: 'motorcycle' | 'pickup', x, y, z, heading, tint, running }]
 * (scene frame, heading clockwise from north; tint the paint); a parked
 * one's engine is cooling, a running one's hot.
 */
export function makeVehicles(THREE, { cap = 32 } = {}) {
  const group = new THREE.Group();
  group.name = 'interior-vehicles';
  const mat = slotTint(thermalKind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 }), 'hot', { attr: true }));
  const meshes = { motorcycle: new THREE.InstancedMesh(motorcycle(THREE), mat, cap), pickup: new THREE.InstancedMesh(pickup(THREE), mat, cap) };
  for (const [k, m] of Object.entries(meshes)) {
    addSlotTints(THREE, m, cap);
    m.count = 0;
    m.visible = false;
    m.castShadow = true;
    m.name = `interior-${k}`;
    group.add(m);
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
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
        setSlotTints(m, m.count, v.tint || [0.5, 0.1, 0.08], PAINT, PAINT);
        m.count += 1;
        drawn += 1;
      }
      for (const m of Object.values(meshes)) {
        m.visible = m.count > 0;
        m.instanceMatrix.needsUpdate = true;
        /* Culled by where its vehicles are (figures.js). */
        if (m.visible) {
          m.computeBoundingSphere();
        }
        slotTintsChanged(m);
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
