/*
 * people.js: the villagers and the hikers in the square.
 *
 * A dozen figures, each with its own height, build and clothes: two at a
 * café table, the waiter, two hikers at the yellow sign, two neighbours
 * talking by the fountain, one on each of two benches, one pacing inside
 * the bus's loop and two walking the path along the churchyard wall. The
 * body is jointed where a body bends (hips, knees, shoulders, elbows,
 * the neck), each part a shape of its own proportion, and a walker's
 * legs and arms swing in a gait with the knee flexing through the swing.
 *
 * DRAWN AS ONE. Every figure is posed on the CPU each frame into one
 * mesh, drawn with the vehicles' own material (its colour and finish on
 * each vertex): one draw, and the shader program the traffic already
 * compiled, so the figures cost no program and no draw of their own
 * beyond the mesh and its two shadow passes. A dozen figures are fifteen
 * thousand vertices; past NEAR metres the mesh is hidden and not posed.
 *
 * NOT SOLID. People carry no collider, and they stand and walk only
 * where nothing else can meet them: off the PostAuto's swept path (the
 * layout's own test, and a figure authored on it fails the build), off
 * the houses, and away from the square-eye camera.
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
import { makeKit, fin } from '../vehicles/kit.js';

const NEAR = 400;
/* A body's joints at 1.75 m, metres over the soles. */
const THIGH = 0.44;
const SHIN = 0.43;
/* The shoulders over the torso's root at the waist. */
const SHOULDER = 0.4;
const UPPER = 0.29;
const FORE = 0.26;
/* One gait cycle, two steps, at a stroll. */
const STRIDE = 1.45;

const cloth = (c) => fin(c, 0.88);
const SKIN = [0xe0b49a, 0xd4a488, 0xc99478, 0xb07a5e, 0xe8c2aa];
const HAIR = [0x2a1d16, 0x4a3222, 0x6e5234, 0xa89070, 0x8a8a88, 0xcfcac2];

/* Geometry for the parts, built along the bone: a limb hangs from its
 * joint down -y; the torso rises from the waist. Each is 8 sided: at
 * the distances anyone sees a person in this valley, more is waste. */
const limb = (r0, r1, len) => new THREE.CylinderGeometry(r0, r1, len, 8, 1).translate(0, -len / 2, 0);

/*
 * One figure's parts, each baked with its colours: the part's name, the
 * bone it rides on, and its geometry in that bone's frame. `look` is the
 * figure's clothes and build.
 */
function figureParts(look) {
  const s = look.height / 1.75;
  const w = look.build;
  const skin = fin(look.skin, 0.62, 0, 0, 1);
  const hair = fin(look.hair, 0.7);
  const top = cloth(look.jacket);
  const legs = cloth(look.trousers);
  const shoe = fin(look.shoes ?? 0x2a2622, 0.6);
  const parts = [];
  const part = (bone, build) => {
    const K = makeKit();
    build(K);
    parts.push({ bone, geometry: K.bake() });
  };
  part('pelvis', (K) => {
    K.push(legs, new THREE.CylinderGeometry(0.155 * w, 0.15 * w, 0.2, 8), 0, 0.02, 0, 0, 0, 0, 0.72, 1, 1);
  });
  part('torso', (K) => {
    K.push(top, new THREE.CylinderGeometry(0.175 * w, 0.15 * w, 0.44 * s, 8).translate(0, 0.22 * s, 0), 0, 0, 0, 0, 0, 0, 0.62, 1, 1);
    K.push(top, new THREE.SphereGeometry(0.17 * w, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.42 * s, 0, 0, 0, 0, 0.62, 0.45, 1.02);
    if (look.coat) {
      K.push(top, new THREE.CylinderGeometry(0.17 * w, 0.2 * w, 0.42, 8).translate(0, -0.21, 0), 0, 0.02, 0, 0, 0, 0, 0.66, 1, 1);
    }
    if (look.pack) {
      K.push(cloth(look.pack), new THREE.BoxGeometry(0.2, 0.46, 0.3), -0.2 * w, 0.25 * s, 0);
      K.push(cloth(0x1e1f22), new THREE.BoxGeometry(0.12, 0.12, 0.26), -0.25 * w, 0.02 * s, 0);
    }
    K.push(skin, new THREE.CylinderGeometry(0.048, 0.055, 0.12, 8), 0, 0.5 * s, 0);
  });
  part('head', (K) => {
    K.push(skin, new THREE.SphereGeometry(0.1, 10, 7), 0.01, 0.1, 0, 0, 0, 0, 1.02, 1.16, 0.84);
    K.push(skin, new THREE.BoxGeometry(0.04, 0.05, 0.03), 0.105, 0.09, 0);
    K.push(hair, new THREE.SphereGeometry(0.107, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.55), -0.012, 0.115, 0, 0, 0, 0.35, 1.04, 1.14, 0.9);
    if (look.cap) {
      K.push(cloth(look.cap), new THREE.CylinderGeometry(0.1, 0.108, 0.07, 10), 0, 0.2, 0, 0, 0, 0, 1.02, 1, 0.9);
      K.push(cloth(look.cap), new THREE.BoxGeometry(0.1, 0.012, 0.16), 0.11, 0.17, 0);
    }
  });
  for (const side of ['L', 'R']) {
    part(`thigh${side}`, (K) => K.push(legs, limb(0.085 * w, 0.063 * w, THIGH * s)));
    part(`shin${side}`, (K) => {
      K.push(legs, limb(0.06 * w, 0.046 * w, (SHIN - 0.06) * s));
      K.push(shoe, new THREE.BoxGeometry(0.26, 0.085, 0.1), 0.06, -SHIN * s + 0.02, 0);
    });
    part(`upper${side}`, (K) => K.push(top, limb(0.056 * w, 0.046 * w, UPPER * s)));
    part(`fore${side}`, (K) => {
      K.push(look.shortSleeves ? skin : top, limb(0.043 * w, 0.036 * w, FORE * s));
      K.push(skin, new THREE.SphereGeometry(0.045, 6, 4), 0.012, -FORE * s - 0.05, 0, 0, 0, 0, 0.55, 1.35, 0.8);
    });
  }
  return { parts, s, w };
}

/*
 * The cast. Where each stands or walks is the layout's square (x, z
 * relative to the fountain square's centre); what each does is its
 * `do`: stand, talk (toward `face`), sit (on a chair or a bench, facing
 * `yaw`), or walk a route back and forth.
 */
function cast(layout) {
  const { square } = layout;
  const at = (dx, dz) => ({ x: square.x + dx, z: square.z + dz });
  const { chairs, benches } = layout;
  /* Sitting on a chair or a bench (which faces its +z): a little back
   * on the seat, facing where it faces, the hips at `h`. */
  const seat = (c, h) => c && ({ x: c.x - Math.sin(c.ry) * 0.06, z: c.z - Math.cos(c.ry) * 0.06, yaw: c.ry - Math.PI / 2, seat: h });
  const list = [
    { look: { height: 1.68, build: 0.95, jacket: 0x6b2530, trousers: 0x2b2f3a, coat: true }, do: 'sit', ...seat(chairs[0], 0.54) },
    { look: { height: 1.82, build: 1.05, jacket: 0xd8d4c8, trousers: 0x3a4a62, shortSleeves: true }, do: 'sit', ...seat(chairs[1], 0.54) },
    { look: { height: 1.76, build: 1.0, jacket: 0xf0eee8, trousers: 0x151618, shortSleeves: true }, do: 'stand', ...at(8.6, -13), yaw: -2.2 },
    { look: { height: 1.8, build: 1.05, jacket: 0xb8321f, trousers: 0x3c3e44, pack: 0x2d4a6a, cap: 0x2a2c30 }, do: 'stand', ...at(-15.6, 11.9), yaw: 0.5, lookUp: true },
    { look: { height: 1.66, build: 0.95, jacket: 0x2f6aa8, trousers: 0x5a5146, pack: 0x7a2a22 }, do: 'talk', ...at(-15.2, 13.9), face: at(-15.6, 11.9) },
    { look: { height: 1.7, build: 1.0, jacket: 0x4a5a3a, trousers: 0x4b4238 }, do: 'talk', ...at(-4.2, -2.4), face: at(-5.3, -0.8) },
    { look: { height: 1.62, build: 0.92, jacket: 0x8a6a8e, trousers: 0x2c2c34, coat: true }, do: 'talk', ...at(-5.3, -0.8), face: at(-4.2, -2.4) },
    { look: { height: 1.74, build: 1.1, jacket: 0x5b5e63, trousers: 0x3a3730 }, do: 'sit', ...seat(benches[2], 0.55) },
    { look: { height: 1.64, build: 0.96, jacket: 0x31465e, trousers: 0x2a2a2e, coat: true }, do: 'sit', ...seat(benches[0], 0.55) },
    { look: { height: 1.72, build: 0.97, jacket: 0xc79a3a, trousers: 0x27334a }, do: 'walk', route: [at(-3.0, 4.6), at(-7.8, 3.2), at(-10.0, -0.5), at(-9.4, -3.6)], v: 1.1, t0: 0 },
    { look: { height: 1.84, build: 1.02, jacket: 0x2d6b4e, trousers: 0x4a4a4e, pack: 0xc05a1a }, do: 'walk', route: [at(-20.5, -11), at(-20.5, 11)], v: 1.3, t0: 3 },
    { look: { height: 1.7, build: 0.98, jacket: 0xd46a2a, trousers: 0x2f3440, pack: 0x384048, cap: 0xc9c2b0 }, do: 'walk', route: [at(-20.5, -11), at(-20.5, 11)], v: 1.3, t0: 14 },
  ];
  return list.filter((p) => p.x !== undefined || p.route);
}

/*
 * Build the people. layout is village/index.js's, heightAt the ground,
 * material the vehicles' body material. Returns the mesh and
 * update(t, camera), t the wall clock in seconds.
 */
export function buildPeople({ layout, heightAt, material }) {
  const people = cast(layout);
  const floor = (x, z) => {
    const s = layout.square;
    const on = Math.abs(x - s.x) < s.w / 2 && Math.abs(z - s.z) < s.d / 2;
    return on ? layout.villageY + layout.slabY : heightAt(x, z);
  };
  const figures = people.map((p, k) => {
    const look = {
      skin: SKIN[k % SKIN.length], hair: HAIR[(k * 5 + 2) % HAIR.length], ...p.look,
    };
    const spots = p.route ?? [p];
    for (const q of spots) {
      if (!layout.busClear(q.x, q.z, p.do === 'sit' ? 0 : 0.4)) {
        throw new Error(`swiss2 people: figure ${k} stands in the PostAuto's way at ${q.x.toFixed(1)}, ${q.z.toFixed(1)}`);
      }
    }
    let route = null;
    if (p.route) {
      const pts = [...p.route, ...p.route.slice(1, -1).reverse()];
      const dist = [0];
      for (let i = 1; i <= pts.length; i += 1) {
        const a = pts[i - 1];
        const b = pts[i % pts.length];
        dist.push(dist[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
      }
      route = { pts, dist, length: dist[dist.length - 1] };
    }
    return { ...p, route, ...figureParts(look), phase: k * 1.7 };
  });

  /* One geometry: every part of every figure, its bind (the part in its
   * bone's frame) kept to pose from. */
  const geos = [];
  let count = 0;
  for (const f of figures) {
    for (const part of f.parts) {
      const g = part.geometry;
      part.start = count;
      part.count = g.getAttribute('position').count;
      part.bindP = g.getAttribute('position').array.slice();
      part.bindN = g.getAttribute('normal').array.slice();
      count += part.count;
      geos.push(g);
    }
  }
  const pos = new Float32Array(count * 3);
  const nrm = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const fn = new Float32Array(count * 4);
  let o = 0;
  for (const g of geos) {
    const n = g.getAttribute('position').count;
    col.set(g.getAttribute('color').array, o * 3);
    fn.set(g.getAttribute('s2Fin').array, o * 4);
    o += n;
    g.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('normal', new THREE.BufferAttribute(nrm, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geometry.setAttribute('s2Fin', new THREE.BufferAttribute(fn, 4));
  const centre = new THREE.Vector3(layout.square.x, layout.villageY + layout.slabY, layout.square.z);
  geometry.boundingSphere = new THREE.Sphere(centre, 45);
  geometry.boundingBox = new THREE.Box3().setFromCenterAndSize(centre, new THREE.Vector3(90, 20, 90));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'villagers';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;

  const bones = {};
  const M = new THREE.Matrix4();
  const R = new THREE.Matrix4();
  const e = new THREE.Euler(0, 0, 0, 'YZX');
  const joint = (parent, x, y, z, rz, ry = 0, rx = 0) => {
    e.set(rx, ry, rz);
    R.makeRotationFromEuler(e).setPosition(x, y, z);
    return new THREE.Matrix4().multiplyMatrices(parent, R);
  };
  const write = (part, m) => {
    const me = m.elements;
    const p = part.bindP;
    const nn = part.bindN;
    let i = part.start * 3;
    for (let k = 0; k < p.length; k += 3) {
      const x = p[k];
      const y = p[k + 1];
      const z = p[k + 2];
      pos[i] = me[0] * x + me[4] * y + me[8] * z + me[12];
      pos[i + 1] = me[1] * x + me[5] * y + me[9] * z + me[13];
      pos[i + 2] = me[2] * x + me[6] * y + me[10] * z + me[14];
      const a = nn[k];
      const b = nn[k + 1];
      const c = nn[k + 2];
      nrm[i] = me[0] * a + me[4] * b + me[8] * c;
      nrm[i + 1] = me[1] * a + me[5] * b + me[9] * c;
      nrm[i + 2] = me[2] * a + me[6] * b + me[10] * c;
      i += 3;
    }
  };

  /* Where a walker is at t, its heading, and how far it has walked. */
  const walkAt = (f, t) => {
    const r = f.route;
    const d = ((t + f.t0) * f.v) % r.length;
    let i = 1;
    while (r.dist[i] < d) {
      i += 1;
    }
    const a = r.pts[i - 1];
    const b = r.pts[i % r.pts.length];
    const u = (d - r.dist[i - 1]) / Math.max(1e-6, r.dist[i] - r.dist[i - 1]);
    const x = a.x + (b.x - a.x) * u;
    const z = a.z + (b.z - a.z) * u;
    return { x, z, yaw: Math.atan2(-(b.z - a.z), b.x - a.x), d: (t + f.t0) * f.v };
  };

  /*
   * A pose: the joint angles, radians. Thighs and upper arms swing about
   * z (forward positive), knees fold back, elbows forward.
   */
  const pose = (f, t) => {
    const q = { bob: 0, lean: 0.03, thighL: 0, thighR: 0, kneeL: 0.04, kneeR: 0.04, armL: 0.04, armR: -0.04, elbowL: 0.18, elbowR: 0.2, sway: 0, head: 0, nod: 0 };
    const idle = t * 0.37 + f.phase;
    q.sway = 0.018 * Math.sin(idle);
    q.head = 0.25 * Math.sin(idle * 0.6);
    if (f.do === 'walk') {
      const phi = (f.walked / STRIDE) * Math.PI * 2;
      const sn = Math.sin(phi);
      q.thighL = 0.4 * sn;
      q.thighR = -0.4 * sn;
      q.kneeL = 0.08 + 0.62 * Math.max(0, Math.cos(phi - 0.5));
      q.kneeR = 0.08 + 0.62 * Math.max(0, Math.cos(phi + Math.PI - 0.5));
      q.armL = -0.32 * sn;
      q.armR = 0.32 * sn;
      q.elbowL = 0.25 + 0.2 * Math.max(0, -sn);
      q.elbowR = 0.25 + 0.2 * Math.max(0, sn);
      q.lean = 0.06;
      q.head = 0.08 * Math.sin(idle * 0.4);
      q.sway = 0.02 * Math.sin(phi);
    } else if (f.do === 'sit') {
      q.thighL = 1.45;
      q.thighR = 1.4;
      q.kneeL = 1.5;
      q.kneeR = 1.35;
      q.armL = 0.55;
      q.armR = 0.5 + 0.05 * Math.sin(idle);
      q.elbowL = 0.9;
      q.elbowR = 1.1;
      q.lean = -0.02;
      q.bob = 0;
    } else if (f.do === 'talk') {
      /* The talker's right hand comes up now and again with what is
       * being said. */
      const g = Math.max(0, Math.sin(t * 0.9 + f.phase));
      q.armR = 0.15 + 0.35 * g;
      q.elbowR = 0.3 + 1.1 * g;
      q.head = 0.1 * Math.sin(idle * 1.3);
      q.nod = 0.05 * Math.sin(t * 2.1 + f.phase);
    } else if (f.lookUp) {
      q.nod = -0.18;
      q.armL = 0.1;
      q.elbowL = 0.5;
    }
    return q;
  };

  const place = (f, t) => {
    let x = f.x;
    let z = f.z;
    let yaw = f.yaw ?? 0;
    if (f.do === 'walk') {
      const w = walkAt(f, t);
      x = w.x;
      z = w.z;
      yaw = w.yaw;
      f.walked = w.d;
    } else if (f.face) {
      yaw = Math.atan2(-(f.face.z - z), f.face.x - x);
    }
    const q = pose(f, t);
    const s = f.s;
    const y = floor(x, z);
    const root = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z);
    /* The pelvis stands as high as the straighter leg reaches, so the
     * foot under the body is on the ground whatever the gait. */
    const reach = (th, kn) => 0.04 + THIGH * s * Math.cos(th) + (SHIN + 0.022) * s * Math.cos(th - kn);
    const hip = f.do === 'sit' ? f.seat : Math.max(reach(q.thighL, q.kneeL), reach(q.thighR, q.kneeR)) + q.bob;
    const pelvis = joint(root, 0, hip, q.sway, 0);
    const torso = joint(pelvis, 0, 0.1, 0, -q.lean);
    const head = joint(torso, 0, 0.52 * s, 0, q.nod, q.head);
    bones.pelvis = pelvis;
    bones.torso = torso;
    bones.head = head;
    const hw = 0.092 * f.w;
    bones.thighL = joint(pelvis, 0, -0.04, hw, q.thighL);
    bones.thighR = joint(pelvis, 0, -0.04, -hw, q.thighR);
    bones.shinL = joint(bones.thighL, 0, -THIGH * s, 0, -q.kneeL);
    bones.shinR = joint(bones.thighR, 0, -THIGH * s, 0, -q.kneeR);
    const sw = 0.2 * f.w;
    const sy = SHOULDER * s;
    bones.upperL = joint(torso, 0, sy, sw, q.armL, 0, -0.07);
    bones.upperR = joint(torso, 0, sy, -sw, q.armR, 0, 0.07);
    bones.foreL = joint(bones.upperL, 0, -UPPER * s, 0, q.elbowL);
    bones.foreR = joint(bones.upperR, 0, -UPPER * s, 0, q.elbowR);
    for (const part of f.parts) {
      write(part, bones[part.bone]);
    }
  };

  const eye = new THREE.Vector3();
  return {
    mesh,
    count: figures.length,
    update(t, camera) {
      eye.setFromMatrixPosition(camera.matrixWorld);
      mesh.visible = eye.distanceTo(centre) < NEAR;
      if (!mesh.visible) {
        return;
      }
      for (const f of figures) {
        place(f, t);
      }
      geometry.getAttribute('position').needsUpdate = true;
      geometry.getAttribute('normal').needsUpdate = true;
    },
  };
}
