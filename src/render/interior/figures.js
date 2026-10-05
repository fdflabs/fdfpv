/*
 * figures.js: the Interior's people, drawn low and instanced (TECH-NEEDS
 * N3): a body of a few boxes in each of Mission 1's poses, readable as a
 * person from 100 to 600 m and warm in the thermal picture. No face, no
 * hands, nothing harmed: a person is a shape and a colour.
 *
 * ONE MESH A POSE. Each action routes.js names (walk, stand, lookUp,
 * carryLong, sit, crouchTarp, takeDownAntenna, pushMotorcycle) is a body
 * built once; walking and carrying have two strides, picked by the clock.
 * Every frame each person is written into its pose's instanced mesh, so
 * all the people on screen are at most a dozen draws.
 *
 * THE HEAT. A person's clothes and skin stand some degrees over the
 * ground they walk on: a per vertex heat (src/render/thermal.js, the
 * 'hot' kind's attribute, 110 degrees a unit) of HEAT over the surface's
 * own sunlit temperature, more at the head.
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

/* Heat over the passive surface, 110 C a unit: 0.07 is about 8 C. */
const HEAT = 0.07;
const HEAD_HEAT = 0.1;
/* Linear colours of the parts: skin, and a pale shirt and darker
 * trousers the instance's colour tints. */
const SKIN = [0.32, 0.2, 0.13];
const SHIRT = [1, 1, 1];
const TROUSERS = [0.45, 0.45, 0.45];
const DARK = [0.08, 0.07, 0.06];

/* A body's pose: angles in radians (each leg's and arm's swing forward,
 * the knees' bend back, the trunk's lean forward, the head tipped back),
 * the hips' height, and what it holds. */
const POSES = {
  stand: {},
  walk0: { legA: 0.42, legB: -0.42, armA: -0.35, armB: 0.35 },
  walk1: { legA: -0.42, legB: 0.42, armA: 0.35, armB: -0.35 },
  lookUp: { head: 0.7, lean: -0.12 },
  carry0: {
    legA: 0.4, legB: -0.4, armA: -0.9, armB: 0.2, long: true,
  },
  carry1: {
    legA: -0.4, legB: 0.4, armA: -0.9, armB: -0.2, long: true,
  },
  sit: {
    hips: 0.45, legA: 1.45, legB: 1.45, kneeBend: 1.5, armA: 0.6, armB: 0.6,
  },
  crouchTarp: {
    hips: 0.5, legA: 1.2, legB: 0.8, kneeBend: 2.0, lean: 0.6, armA: 1.6, armB: 1.3,
  },
  takeDownAntenna: { armA: 2.9, armB: 2.7, head: 0.4 },
  pushMotorcycle: {
    legA: 0.35, legB: -0.35, lean: 0.25, armA: 1.2, armB: 1.2,
  },
};
/* Which pose an action and a stride draw. */
const ACTION_POSE = {
  walk: ['walk0', 'walk1'],
  carryLong: ['carry0', 'carry1'],
  stand: ['stand'],
  lookUp: ['lookUp'],
  sit: ['sit'],
  crouchTarp: ['crouchTarp'],
  takeDownAntenna: ['takeDownAntenna'],
  pushMotorcycle: ['pushMotorcycle'],
};
export const POSE_NAMES = Object.keys(POSES);

function part(THREE, w, h, d, colour, heat, m) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.deleteAttribute('uv');
  g.applyMatrix4(m);
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

/* A body in pose `p`, facing -z (the scene's north), feet at y 0. */
function bodyGeometry(THREE, p) {
  const M = () => new THREE.Matrix4();
  const hips = p.hips ?? 0.92;
  const lean = p.lean ?? 0;
  const parts = [];
  /* Legs: a thigh and a shin each, swung about the hip (+ forward). */
  for (const [side, swing] of [[-1, p.legA ?? 0], [1, p.legB ?? 0]]) {
    const hip = M().makeTranslation(side * 0.11, hips, 0).multiply(M().makeRotationX(swing));
    const thigh = hip.clone().multiply(M().makeTranslation(0, -0.23, 0));
    parts.push(part(THREE, 0.15, 0.46, 0.17, TROUSERS, HEAT * 0.8, thigh));
    const knee = hip.clone().multiply(M().makeTranslation(0, -0.46, 0)).multiply(M().makeRotationX(-(p.kneeBend ?? 0)));
    const shin = knee.clone().multiply(M().makeTranslation(0, -0.23, 0));
    parts.push(part(THREE, 0.13, 0.46, 0.15, TROUSERS, HEAT * 0.7, shin));
  }
  /* The trunk, leaning about the hips, with the head and the arms on it. */
  const trunk = M().makeTranslation(0, hips, 0).multiply(M().makeRotationX(-lean));
  parts.push(part(THREE, 0.38, 0.58, 0.22, SHIRT, HEAT, trunk.clone().multiply(M().makeTranslation(0, 0.29, 0))));
  const neck = trunk.clone().multiply(M().makeTranslation(0, 0.6, 0)).multiply(M().makeRotationX(p.head ?? 0));
  parts.push(part(THREE, 0.2, 0.24, 0.22, SKIN, HEAD_HEAT, neck.clone().multiply(M().makeTranslation(0, 0.14, 0))));
  for (const [side, swing] of [[-1, p.armA ?? 0], [1, p.armB ?? 0]]) {
    const shoulder = trunk.clone().multiply(M().makeTranslation(side * 0.25, 0.54, 0)).multiply(M().makeRotationX(swing));
    parts.push(part(THREE, 0.11, 0.6, 0.12, SHIRT, HEAT * 0.9, shoulder.clone().multiply(M().makeTranslation(0, -0.3, 0))));
  }
  /* The long object, slung under the right arm along the body. */
  if (p.long) {
    const sling = trunk.clone().multiply(M().makeTranslation(0.24, 0.3, 0.05)).multiply(M().makeRotationX(0.5));
    parts.push(part(THREE, 0.05, 1.05, 0.06, DARK, 0.01, sling));
  }
  return mergeGeometries(parts);
}

/*
 * The people: { group, set(list, ms), stats(), dispose() }. `set` takes
 * [{ x, y, z, heading, action, tint, scale }] (scene frame, routes.js
 * poses, heading clockwise from north; scale 1 an adult) and the room ms
 * for the strides. `cap`
 * is the most people any one pose holds.
 */
export function makeFigures(THREE, { cap = 256 } = {}) {
  const group = new THREE.Group();
  group.name = 'interior-figures';
  const mat = thermalKind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }), 'hot', { attr: true });
  const meshes = {};
  for (const name of POSE_NAMES) {
    const m = new THREE.InstancedMesh(bodyGeometry(THREE, POSES[name]), mat, cap);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    m.count = 0;
    m.frustumCulled = false;
    m.castShadow = true;
    m.name = `interior-figure-${name}`;
    meshes[name] = m;
    group.add(m);
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
  const col = new THREE.Color();
  let drawn = 0;
  return {
    group,
    meshes,
    set(list, ms) {
      for (const m of Object.values(meshes)) {
        m.count = 0;
      }
      drawn = 0;
      list.forEach((p, k) => {
        const poses = ACTION_POSE[p.action] || ACTION_POSE.stand;
        /* A stride a little under a second, out of step person to person. */
        const stride = Math.floor(ms / 450 + k * 0.37);
        const name = poses[((stride % poses.length) + poses.length) % poses.length];
        const m = meshes[name];
        if (m.count >= cap) {
          return;
        }
        q.setFromAxisAngle(up, -p.heading);
        pos.set(p.x, p.y, p.z);
        scale.setScalar(p.scale || 1);
        m4.compose(pos, q, scale);
        m.setMatrixAt(m.count, m4);
        col.setRGB(...(p.tint || [0.4, 0.38, 0.3]));
        m.setColorAt(m.count, col);
        m.count += 1;
        drawn += 1;
      });
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
