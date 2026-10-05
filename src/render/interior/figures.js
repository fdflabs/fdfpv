/*
 * figures.js: the Interior's people, drawn low and instanced (TECH-NEEDS
 * N3): a body of tapered limbs, a chest, a head and what is worn on it in
 * each of Mission 1's poses, readable as a person and a posture from 100
 * to 600 m through the camera ball's lens, and warm in the thermal
 * picture. No face, no hands but a block, nothing harmed: a person is a
 * shape, a posture and the colours of their clothes.
 *
 * ONE MESH A POSE AND A KIT. Each action routes.js names (walk, stand,
 * lookUp, carryLong, sit, crouchTarp, takeDownAntenna, pushMotorcycle,
 * and the rider's ride) is a body built once in each of two kits (a cap,
 * or a wide hat and a pack); walking and carrying have two strides,
 * picked by the clock. Every frame each person is written into their
 * pose's and kit's instanced mesh with three colours, the shirt, the
 * trousers and the hat or hair (tint.js), so the face and the boots keep
 * their own. A mesh nobody is in is not drawn.
 *
 * THE HEAT. A person is skin at 34 C seen through clothes: a per vertex
 * coupling (src/render/thermal.js, the body kind's attribute) of how much
 * of the skin's warmth over the air shows, HEAT through the clothes and
 * more at the head, so a person reads 30 to 34 C by night and a little
 * over by day with the sun on the cloth.
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
import { hash01 } from '../../share/interior/canopy.js';
import {
  slotTint, addSlotTints, setSlotTints, slotTintsChanged,
} from './tint.js';

/* How much of the skin's temperature over the air shows through, per
 * part (src/render/thermal.js, the body kind): clothes most of it, the
 * head and hands, bare skin and hair, nearly all; boots, a hat and a pack
 * little; a carried pole none. */
const HEAT = 0.6;
const HEAD_HEAT = 0.85;
/* Linear colours of the parts. Slot 1 (the shirt) is the instance's
 * colour, slot 2 the trousers', slot 3 the hat's or the hair's
 * (tint.js); the parts a slot paints are white here. */
const SKIN = [0.3, 0.19, 0.12];
const WHITE = [1, 1, 1];
const BOOT = [0.045, 0.035, 0.03];
const PACK = [0.07, 0.075, 0.045];
const POLE = [0.32, 0.27, 0.18];
const SHIRT = 1;
const LOWER = 2;
const HAT = 3;
/* Trousers and hats, linear: jeans, olive, khaki, black, grey; a straw
 * hat, olive, black, a faded red cap, and bare dark hair. */
const LOWERS = [[0.05, 0.07, 0.12], [0.08, 0.085, 0.05], [0.2, 0.16, 0.1], [0.025, 0.025, 0.025], [0.12, 0.12, 0.11], [0.04, 0.055, 0.1]];
const HATS = [[0.3, 0.24, 0.13], [0.08, 0.09, 0.05], [0.03, 0.03, 0.03], [0.22, 0.05, 0.03], [0.035, 0.025, 0.02], [0.28, 0.27, 0.24]];

/*
 * A body's pose: angles in radians. A leg is [swing forward about the
 * hip, the knee's bend back, its spread out from the side]; an arm
 * [swing forward about the shoulder, the elbow's bend, spread]. The
 * trunk's lean forward, the head tipped back (looking up), the hips'
 * height, and whether it carries the long object.
 */
const POSES = {
  stand: {
    legA: [0.04, 0.04, 0.05], legB: [-0.06, 0.02, 0.07], armA: [0.12, 0.3, 0.14], armB: [-0.05, 0.2, 0.12],
  },
  walk0: {
    legA: [0.45, 0.08], legB: [-0.4, 0.45], armA: [-0.42, 0.35, 0.08], armB: [0.38, 0.5, 0.08], lean: 0.06,
  },
  walk1: {
    legA: [-0.4, 0.45], legB: [0.45, 0.08], armA: [0.38, 0.5, 0.08], armB: [-0.42, 0.35, 0.08], lean: 0.06,
  },
  /* Looking up, a hand shading the eyes. */
  lookUp: {
    legA: [0.02, 0, 0.08], legB: [-0.04, 0, 0.08], armA: [2.3, 2.1, 0.25], armB: [0, 0.2, 0.12], head: 0.75, lean: -0.12,
  },
  /* A long pole on the right shoulder, the right hand on it. */
  carry0: {
    legA: [0.42, 0.08], legB: [-0.38, 0.42], armA: [-0.35, 0.4, 0.1], armB: [0.7, 2.1, 0.05], lean: 0.08, long: true,
  },
  carry1: {
    legA: [-0.38, 0.42], legB: [0.42, 0.08], armA: [0.35, 0.5, 0.1], armB: [0.7, 2.1, 0.05], lean: 0.08, long: true,
  },
  /* On the ground, knees up, arms round them. */
  sit: {
    hips: 0.17, legA: [1.9, 2.6, 0.18], legB: [1.75, 2.4, 0.12], armA: [0.95, 0.9, 0.05], armB: [0.9, 1.0, 0.05], lean: 0.3, head: 0.1,
  },
  /* Squatting, both hands up at a tarp's edge. */
  crouchTarp: {
    hips: 0.5, legA: [1.5, 2.3, 0.2], legB: [1.1, 2.0, 0.15], lean: 0.45, armA: [1.9, 0.4, 0.15], armB: [1.6, 0.5, 0.2], head: 0.35,
  },
  takeDownAntenna: {
    legA: [0.15, 0.1, 0.12], legB: [-0.2, 0.05, 0.12], armA: [2.85, 0.15, 0.1], armB: [2.65, 0.25, 0.12], head: 0.5, lean: -0.08,
  },
  pushMotorcycle: {
    legA: [0.4, 0.15], legB: [-0.45, 0.4], lean: 0.3, armA: [1.05, 0.35, 0], armB: [1.15, 0.3, -0.05],
  },
  /* On a motorcycle's seat, feet on the pegs, hands on the bars. */
  ride: {
    hips: 0.86, legA: [1.15, 1.45, 0.22], legB: [1.15, 1.45, 0.22], lean: 0.32, armA: [1.0, 0.45, 0.12], armB: [1.0, 0.45, 0.12],
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
  ride: ['ride'],
};
export const POSE_NAMES = Object.keys(POSES);
/* Two kits of every pose: a cap and nothing on the back, or a wide
 * brimmed hat and a pack. */
const KITS = ['cap', 'hat'];

/* One part: geometry g0 moved by m, one colour, one heat coupling, one
 * tint slot. Every part carries the same attributes so the body merges. */
function part(THREE, g0, colour, heat, slot, m) {
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
  g.setAttribute('slot', new THREE.BufferAttribute(new Float32Array(n).fill(slot), 1));
  return g;
}

/* A body in pose p wearing kit, facing -z (the scene's north), feet at
 * y 0. */
function bodyGeometry(THREE, p, kit) {
  const M = () => new THREE.Matrix4();
  const T = (x, y, z) => M().makeTranslation(x, y, z);
  const X = (a) => M().makeRotationX(a);
  const Z = (a) => M().makeRotationZ(a);
  const cyl = (r0, r1, h, seg = 7) => new THREE.CylinderGeometry(r0, r1, h, seg, 1);
  const hips = p.hips ?? 0.93;
  const lean = p.lean ?? 0;
  const parts = [];
  /* Legs: a thigh, a shin and a boot kept level with the ground. */
  for (const [side, leg] of [[-1, p.legA || [0, 0]], [1, p.legB || [0, 0]]]) {
    const [swing, bend, spread = 0.05] = leg;
    const hip = T(side * 0.1, hips, 0).multiply(X(swing)).multiply(Z(side * spread));
    parts.push(part(THREE, cyl(0.085, 0.065, 0.46), WHITE, HEAT * 0.8, LOWER, hip.clone().multiply(T(0, -0.23, 0))));
    const knee = hip.clone().multiply(T(0, -0.45, 0)).multiply(X(-bend));
    parts.push(part(THREE, cyl(0.062, 0.05, 0.44), WHITE, HEAT * 0.7, LOWER, knee.clone().multiply(T(0, -0.22, 0))));
    const ankle = knee.clone().multiply(T(0, -0.44, 0)).multiply(X(bend - swing));
    parts.push(part(THREE, new THREE.BoxGeometry(0.1, 0.09, 0.25), BOOT, 0.25, 0, ankle.clone().multiply(T(0, -0.02, -0.05))));
  }
  /* The trunk, leaning about the hips: a pelvis, and a chest broader at
   * the shoulders, with the neck, the head and the arms on it. */
  const trunk = T(0, hips, 0).multiply(X(-lean));
  parts.push(part(THREE, cyl(0.165, 0.155, 0.2, 8).scale(1, 1, 0.68), WHITE, HEAT * 0.8, LOWER, trunk.clone().multiply(T(0, 0.02, 0))));
  parts.push(part(THREE, cyl(0.2, 0.165, 0.5, 8).scale(1, 1, 0.58), WHITE, HEAT, SHIRT, trunk.clone().multiply(T(0, 0.35, 0))));
  parts.push(part(THREE, cyl(0.05, 0.055, 0.1, 6), SKIN, HEAD_HEAT, 0, trunk.clone().multiply(T(0, 0.63, 0))));
  const head = trunk.clone().multiply(T(0, 0.66, 0)).multiply(X(p.head ?? 0)).multiply(T(0, 0.11, 0));
  parts.push(part(THREE, new THREE.SphereGeometry(0.105, 8, 6).scale(0.9, 1.08, 1), SKIN, HEAD_HEAT, 0, head));
  if (kit === 'cap') {
    parts.push(part(THREE, new THREE.SphereGeometry(0.11, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), WHITE, 0.4, HAT, head.clone().multiply(T(0, 0.015, 0.005))));
    parts.push(part(THREE, new THREE.BoxGeometry(0.15, 0.014, 0.1), WHITE, 0.3, HAT, head.clone().multiply(T(0, 0.03, -0.12))));
  } else {
    parts.push(part(THREE, cyl(0.095, 0.11, 0.1, 8), WHITE, 0.35, HAT, head.clone().multiply(T(0, 0.075, 0))));
    parts.push(part(THREE, cyl(0.21, 0.21, 0.014, 10), WHITE, 0.3, HAT, head.clone().multiply(T(0, 0.03, 0))));
    parts.push(part(THREE, new THREE.BoxGeometry(0.3, 0.4, 0.16), PACK, 0.15, 0, trunk.clone().multiply(T(0, 0.34, 0.19))));
    parts.push(part(THREE, cyl(0.07, 0.07, 0.34, 6).rotateZ(Math.PI / 2), PACK, 0.1, 0, trunk.clone().multiply(T(0, 0.58, 0.2))));
  }
  /* Arms: a sleeve to the elbow, a sleeve to the wrist and a hand. */
  for (const [side, arm] of [[-1, p.armA || [0, 0]], [1, p.armB || [0, 0]]]) {
    const [swing, bend, spread = 0.1] = arm;
    const shoulder = trunk.clone().multiply(T(side * 0.215, 0.55, 0)).multiply(X(swing)).multiply(Z(side * spread));
    parts.push(part(THREE, cyl(0.058, 0.05, 0.3), WHITE, HEAT * 0.9, SHIRT, shoulder.clone().multiply(T(0, -0.15, 0))));
    const elbow = shoulder.clone().multiply(T(0, -0.29, 0)).multiply(X(bend));
    parts.push(part(THREE, cyl(0.048, 0.04, 0.26), WHITE, HEAT * 0.9, SHIRT, elbow.clone().multiply(T(0, -0.13, 0))));
    parts.push(part(THREE, new THREE.BoxGeometry(0.06, 0.1, 0.04), SKIN, HEAD_HEAT, 0, elbow.clone().multiply(T(0, -0.31, 0))));
  }
  /* The long object, a 2.6 m pole or pipe on the right shoulder, its
   * front end a little up. */
  if (p.long) {
    const pole = trunk.clone().multiply(T(0.16, 0.6, -0.25)).multiply(X(Math.PI / 2 - 0.12));
    parts.push(part(THREE, cyl(0.03, 0.03, 2.6, 6), POLE, 0.05, 0, pole));
  }
  return mergeGeometries(parts);
}

/*
 * The people: { group, set(list, ms), stats(), dispose() }. set takes
 * [{ x, y, z, heading, action, tint, seed, scale }] (scene frame,
 * routes.js poses, heading clockwise from north; tint the shirt; seed a
 * whole number for the person's kit, trousers and hat, the list index
 * when absent; scale 1 an adult) and the room ms for the strides. cap is
 * the most people any one mesh holds.
 */
export function makeFigures(THREE, { cap = 256 } = {}) {
  const group = new THREE.Group();
  group.name = 'interior-figures';
  const mat = slotTint(thermalKind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }), 'body', { attr: true }));
  const meshes = {};
  for (const name of POSE_NAMES) {
    for (const kit of KITS) {
      const m = new THREE.InstancedMesh(bodyGeometry(THREE, POSES[name], kit), mat, cap);
      addSlotTints(THREE, m, cap);
      m.count = 0;
      m.visible = false;
      m.frustumCulled = false;
      m.castShadow = true;
      m.name = `interior-figure-${name}`;
      meshes[`${name}:${kit}`] = m;
      group.add(m);
    }
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
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
        const seed = p.seed ?? k;
        const m = meshes[`${name}:${KITS[Math.floor(hash01(seed, 7, 71) * KITS.length)]}`];
        if (m.count >= cap) {
          return;
        }
        q.setFromAxisAngle(up, -p.heading);
        pos.set(p.x, p.y, p.z);
        scale.setScalar(p.scale || 1);
        m4.compose(pos, q, scale);
        m.setMatrixAt(m.count, m4);
        setSlotTints(m, m.count, p.tint || [0.4, 0.38, 0.3],
          LOWERS[Math.floor(hash01(seed, 11, 72) * LOWERS.length)], HATS[Math.floor(hash01(seed, 13, 73) * HATS.length)]);
        m.count += 1;
        drawn += 1;
      });
      for (const m of Object.values(meshes)) {
        m.visible = m.count > 0;
        m.instanceMatrix.needsUpdate = true;
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
