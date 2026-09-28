/*
 * streamers.js: toilet paper drawn (docs/COMBAT-PLAN.md section 2.6). A
 * ribbon through each chain's nodes, 10 cm wide, twisted along its length
 * and in time and fluttering sideways toward its free end at 13 Hz, the
 * flutter Carruthers and Filippone measured on a streamer of aspect ratio
 * 30; and a burst of paper where a cut happens.
 *
 * Render only. The physics is src/game/streamer.js, the nodes come from it
 * or from an owner's frames; nothing here feeds back, so the trigonometry
 * the look needs is free to use.
 *
 * NO WORK ON A QUIET FRAME beyond the ribbons that are out: one buffer
 * update each, and nothing allocated after a ribbon is first built.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';
import { STREAMER_SEGS } from '../share/roomwire.js';

const HALF_W = 0.0508;
const MAXN = STREAMER_SEGS + 1;
const FLUTTER_HZ = 13;
const WAVE_M = 2.5;
/* The free end's flutter, metres, over its last few metres. */
const TAIL_AMP = 0.12;
const TAIL_M = 3;
/* A ribbon is never drawn thinner than this many pixels across: ten
 * centimetres of paper is two pixels at thirty metres, and a pilot has to
 * see what they are chasing. */
const MIN_PX = 2.5;
const CONFETTI = 96;
const CONFETTI_S = 4;
const GONE = new THREE.Matrix4().makeScale(0, 0, 0);

function ribbonMesh(colour) {
  const pos = new Float32Array(MAXN * 2 * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const idx = [];
  for (let i = 0; i < MAXN - 1; i += 1) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(colour), side: THREE.DoubleSide, roughness: 0.95, metalness: 0,
    emissive: new THREE.Color(colour), emissiveIntensity: 0.18,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.name = 'streamer';
  return mesh;
}

/*
 * One ribbon's vertices from nodes x (3 n) for n nodes: head at node 0,
 * free end at node n - 1; `free` when both ends are free (a piece), so it
 * flutters all along. anchor, when given, is where node 0 is drawn.
 */
function shape(mesh, x, n, t, free, anchor, seed, eye) {
  const attr = mesh.geometry.getAttribute('position');
  const pos = attr.array;
  const count = Math.min(n, MAXN);
  const ox = anchor ? anchor[0] - x[0] : 0;
  const oy = anchor ? anchor[1] - x[1] : 0;
  const oz = anchor ? anchor[2] - x[2] : 0;
  for (let i = 0; i < count; i += 1) {
    const a = Math.max(0, i - 1);
    const b = Math.min(count - 1, i + 1);
    let tx = x[b * 3] - x[a * 3];
    let ty = x[b * 3 + 1] - x[a * 3 + 1];
    let tz = x[b * 3 + 2] - x[a * 3 + 2];
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl;
    ty /= tl;
    tz /= tl;
    /* A side across the paper: square to it and to up, or to x when the
     * paper hangs straight down. */
    let sx = ty * 0 - tz * 1;
    let sy = tz * 0 - tx * 0;
    let sz = tx * 1 - ty * 0;
    let sl = Math.hypot(sx, sy, sz);
    if (sl < 0.2) {
      sx = 0;
      sy = tz;
      sz = -ty;
      sl = Math.hypot(sx, sy, sz) || 1;
    }
    sx /= sl;
    sy /= sl;
    sz /= sl;
    const ux = ty * sz - tz * sy;
    const uy = tz * sx - tx * sz;
    const uz = tx * sy - ty * sx;
    const s = i;
    const fromEnd = (count - 1 - i);
    const amp = free ? 0.05 : 0.008 + TAIL_AMP * Math.exp(-fromEnd / TAIL_M);
    const phase = 2 * Math.PI * FLUTTER_HZ * t - (2 * Math.PI * s) / WAVE_M + seed;
    const wave = amp * Math.sin(phase);
    const twist = 0.7 * s + 2.2 * t + seed + 0.6 * Math.sin(phase * 0.5);
    const c = Math.cos(twist);
    const d = Math.sin(twist);
    const far = eye.perPx > 0 ? Math.hypot(x[i * 3] - eye.x, x[i * 3 + 1] - eye.y, x[i * 3 + 2] - eye.z) * eye.perPx * MIN_PX * 0.5 : 0;
    const half = Math.max(HALF_W, far);
    const wx = (sx * c + ux * d) * half;
    const wy = (sy * c + uy * d) * half;
    const wz = (sz * c + uz * d) * half;
    /* The drawn tow point pulls the first metres with it, fading out. */
    const k = anchor ? Math.max(0, 1 - i / 8) : 0;
    const px = x[i * 3] + ox * k + ux * wave;
    const py = x[i * 3 + 1] + oy * k + uy * wave;
    const pz = x[i * 3 + 2] + oz * k + uz * wave;
    pos[i * 6] = px - wx;
    pos[i * 6 + 1] = py - wy;
    pos[i * 6 + 2] = pz - wz;
    pos[i * 6 + 3] = px + wx;
    pos[i * 6 + 4] = py + wy;
    pos[i * 6 + 5] = pz + wz;
  }
  mesh.geometry.setDrawRange(0, Math.max(0, count - 1) * 6);
  attr.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}

export function createStreamerLayer() {
  const group = new THREE.Group();
  group.name = 'streamers';
  const ribbons = new Map(); /* 'key:id' -> { mesh, used } */
  /* The camera, for the least width: its position, and metres a pixel at
   * one metre. */
  const eye = { x: 0, y: 0, z: 0, perPx: 0 };
  const eyeAt = new THREE.Vector3();

  /* Paper in the air where a cut was: small squares, falling as tissue
   * falls (0.7 m/s, src/game/streamer.js), tumbling. */
  const bits = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.09, 0.06),
    new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.95 }),
    CONFETTI,
  );
  bits.frustumCulled = false;
  bits.count = 0;
  bits.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CONFETTI * 3), 3);
  group.add(bits);
  const bit = Array.from({ length: CONFETTI }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), spin: new THREE.Vector3(), q: new THREE.Euler() }));
  let nextBit = 0;
  const m4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);

  /* Draw chain `id` of `key` (a seat) this frame. */
  function draw(key, colour, id, x, n, t, free, anchor) {
    const name = `${key}:${id}`;
    let r = ribbons.get(name);
    if (!r || r.colour !== colour) {
      if (r) {
        drop(name);
      }
      r = { mesh: ribbonMesh(colour), colour, used: true, seed: (key * 1.7 + id * 0.9) % 6.28 };
      ribbons.set(name, r);
      group.add(r.mesh);
    }
    r.used = true;
    r.mesh.visible = n > 1;
    if (n > 1) {
      shape(r.mesh, x, n, t, free, anchor, r.seed, eye);
    }
  }

  function drop(name) {
    const r = ribbons.get(name);
    if (r) {
      r.mesh.removeFromParent();
      r.mesh.geometry.dispose();
      r.mesh.material.dispose();
      ribbons.delete(name);
    }
  }

  /* A cut's burst at p, in the cut paper's colour. */
  function burst(p, colour) {
    const c = new THREE.Color(colour);
    for (let k = 0; k < 24; k += 1) {
      const i = nextBit;
      const b = bit[i];
      nextBit = (nextBit + 1) % CONFETTI;
      b.life = CONFETTI_S * (0.6 + 0.4 * Math.random());
      b.p.set(p[0], p[1], p[2]);
      b.v.set(Math.random() * 6 - 3, Math.random() * 4 - 1, Math.random() * 6 - 3);
      b.spin.set(Math.random() * 12 - 6, Math.random() * 12 - 6, Math.random() * 12 - 6);
      bits.setColorAt(i, c);
    }
    bits.instanceColor.needsUpdate = true;
  }

  /* Once a frame, after every draw(): ribbons not drawn are hidden, the
   * burst moves. */
  function update(dt) {
    for (const r of ribbons.values()) {
      if (!r.used) {
        r.mesh.visible = false;
      }
      r.used = false;
    }
    let live = 0;
    for (let i = 0; i < CONFETTI; i += 1) {
      const b = bit[i];
      if (b.life <= 0) {
        bits.setMatrixAt(i, GONE);
        continue;
      }
      b.life -= dt;
      /* Drag takes it to tissue's fall speed in a few tenths. */
      const k = Math.min(1, dt * 4);
      b.v.x += (0 - b.v.x) * k;
      b.v.z += (0 - b.v.z) * k;
      b.v.y += (-0.7 - b.v.y) * k;
      b.p.addScaledVector(b.v, dt);
      b.q.x += b.spin.x * dt;
      b.q.y += b.spin.y * dt;
      b.q.z += b.spin.z * dt;
      quat.setFromEuler(b.q);
      m4.compose(b.p, quat, one);
      bits.setMatrixAt(i, m4);
      live = i + 1;
    }
    bits.count = live;
    bits.instanceMatrix.needsUpdate = true;
  }

  function clear() {
    for (const name of [...ribbons.keys()]) {
      drop(name);
    }
    for (const b of bit) {
      b.life = 0;
    }
    bits.count = 0;
  }

  /* Once a frame, before draw(): where the camera is. */
  function view(camera, viewHeight) {
    camera.getWorldPosition(eyeAt);
    eye.x = eyeAt.x;
    eye.y = eyeAt.y;
    eye.z = eyeAt.z;
    eye.perPx = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, viewHeight);
  }

  return {
    group, view, draw, burst, update, clear, count: () => ribbons.size,
  };
}
