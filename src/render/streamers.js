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
 * PAPER LYING ON SOMETHING IS DRAWN ON IT, never through it. The physics
 * rests a node on the surface itself, and the twist and the flutter swing
 * the ribbon's edges about the node, half of the time below it: on the
 * water that drew the paper as dashes, the lake showing through wherever
 * the ribbon turned under it (the owner, 2026-09-29: "the paper tail rips
 * when on water"). So with a floorAt(x, z) the layer is made with, paper
 * coming within SETTLE_M of it settles flat, twist and flutter fading out,
 * and no vertex is drawn below LIFT_M over it.
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
import { STREAMER_SEGS, streamerColour } from '../share/roomwire.js';

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
const CONFETTI = 192;
const GLINT_S = 0.45;
const GLINT_M = 4;
export const CONFETTI_S = 4;
/* Above the floor, the least a ribbon is drawn: clear of the depth
 * buffer's resolution (the shell's camera has a 0.2 m near plane) out to
 * a quarter of a kilometre, so the surface under it never shows through. */
const LIFT_M = 0.02;
/* Paper this close above the floor is drawn settling onto it, flat at it. */
const SETTLE_M = 0.5;
const GONE = new THREE.Matrix4().makeScale(0, 0, 0);

/* Each seat's colour as linear RGB, made once. */
const SEAT_RGB = new Map();
function seatRgb(seat) {
  let c = SEAT_RGB.get(seat);
  if (!c) {
    c = new THREE.Color(streamerColour(seat));
    SEAT_RGB.set(seat, c);
  }
  return c;
}

/* A ribbon coloured per vertex: captured paper keeps its owner's colour,
 * so one streamer can be many. */
function ribbonMesh() {
  const pos = new Float32Array(MAXN * 2 * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAXN * 2 * 3), 3));
  const idx = [];
  for (let i = 0; i < MAXN - 1; i += 1) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, side: THREE.DoubleSide, roughness: 0.95, metalness: 0,
    emissive: new THREE.Color(0x2a2a2a),
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.name = 'streamer';
  return mesh;
}

/* The ribbon's colours from each link's seat, node i taking link i's (the
 * last node its link's). */
function paint(mesh, cols, n) {
  const attr = mesh.geometry.getAttribute('color');
  const c = attr.array;
  const count = Math.min(n, MAXN);
  for (let i = 0; i < count; i += 1) {
    const rgb = seatRgb(cols[Math.max(0, Math.min(i, cols.length - 1, count - 2))] || 1);
    for (const o of [i * 6, i * 6 + 3]) {
      c[o] = rgb.r;
      c[o + 1] = rgb.g;
      c[o + 2] = rgb.b;
    }
  }
  attr.needsUpdate = true;
}

/*
 * One ribbon's vertices from nodes x (3 n) for n nodes: head at node 0,
 * free end at node n - 1; `free` when both ends are free (a piece), so it
 * flutters all along. anchor, when given, is where node 0 is drawn.
 * floorAt, when given, is what the paper lies on; its height is asked at
 * each node and held for both of that node's vertices, which are the
 * ribbon's width apart.
 */
function shape(mesh, x, n, t, free, anchor, seed, eye, floorAt) {
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
    /* The drawn tow point pulls the first metres with it, fading out. */
    const k = anchor ? Math.max(0, 1 - i / 8) : 0;
    const floor = floorAt ? floorAt(x[i * 3] + ox * k, x[i * 3 + 2] + oz * k) : -Infinity;
    const lie = Math.min(1, Math.max(0, 1 - (x[i * 3 + 1] + oy * k - floor) / SETTLE_M));
    const fromEnd = (count - 1 - i);
    const amp = (1 - lie) * (free ? 0.05 : 0.008 + TAIL_AMP * Math.exp(-fromEnd / TAIL_M));
    const phase = 2 * Math.PI * FLUTTER_HZ * t - (2 * Math.PI * s) / WAVE_M + seed;
    const wave = amp * Math.sin(phase);
    const twist = 0.7 * s + 2.2 * t + seed + 0.6 * Math.sin(phase * 0.5);
    /* Lying, the twist is turned flat, toward whichever face is nearer. */
    let c = Math.cos(twist);
    let d = Math.sin(twist);
    if (lie > 0) {
      c = (1 - lie) * c + (c < 0 ? -lie : lie);
      d *= 1 - lie;
      const cl = Math.hypot(c, d);
      c /= cl;
      d /= cl;
    }
    const far = eye.perPx > 0 ? Math.hypot(x[i * 3] - eye.x, x[i * 3 + 1] - eye.y, x[i * 3 + 2] - eye.z) * eye.perPx * MIN_PX * 0.5 : 0;
    const half = Math.max(HALF_W, far);
    const wx = (sx * c + ux * d) * half;
    const wy = (sy * c + uy * d) * half;
    const wz = (sz * c + uz * d) * half;
    const px = x[i * 3] + ox * k + ux * wave;
    const py = x[i * 3 + 1] + oy * k + uy * wave;
    const pz = x[i * 3 + 2] + oz * k + uz * wave;
    const low = floor + LIFT_M;
    pos[i * 6] = px - wx;
    pos[i * 6 + 1] = Math.max(low, py - wy);
    pos[i * 6 + 2] = pz - wz;
    pos[i * 6 + 3] = px + wx;
    pos[i * 6 + 4] = Math.max(low, py + wy);
    pos[i * 6 + 5] = pz + wz;
  }
  mesh.geometry.setDrawRange(0, Math.max(0, count - 1) * 6);
  attr.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}

/* floorAt(x, z): the height of what paper lies on there, or null for none. */
export function createStreamerLayer(floorAt = null) {
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
    /* Lit a little from inside, so the burst reads bright in any light. */
    new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.95, emissive: 0xffffff, emissiveIntensity: 0.35 }),
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

  /* The glint where the cut was: a four pointed star, additive, flashing
   * big and fading in GLINT_S. One sprite, reused; a canvas texture drawn
   * once. */
  const glintCanvas = document.createElement('canvas');
  glintCanvas.width = 128;
  glintCanvas.height = 128;
  const g2 = glintCanvas.getContext('2d');
  const halo = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
  halo.addColorStop(0, 'rgba(255,255,255,1)');
  halo.addColorStop(0.18, 'rgba(255,245,200,0.8)');
  halo.addColorStop(1, 'rgba(255,220,120,0)');
  g2.fillStyle = halo;
  g2.fillRect(0, 0, 128, 128);
  g2.fillStyle = 'rgba(255,255,255,0.95)';
  g2.beginPath();
  g2.moveTo(64, 0);
  g2.lineTo(69, 59);
  g2.lineTo(128, 64);
  g2.lineTo(69, 69);
  g2.lineTo(64, 128);
  g2.lineTo(59, 69);
  g2.lineTo(0, 64);
  g2.lineTo(59, 59);
  g2.closePath();
  g2.fill();
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(glintCanvas), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  }));
  glint.visible = false;
  glint.renderOrder = 4;
  group.add(glint);
  let glintLife = 0;
  let glintCount = 0;

  /* Draw chain `id` of `key` (a seat) this frame; cols is each link's
   * colour seat, tow point first (a Uint8Array or array). */
  function draw(key, cols, id, x, n, t, free, anchor) {
    const name = `${key}:${id}`;
    let r = ribbons.get(name);
    if (!r) {
      r = { mesh: ribbonMesh(), paint: '', used: true, seed: (key * 1.7 + id * 0.9) % 6.28 };
      ribbons.set(name, r);
      group.add(r.mesh);
    }
    r.used = true;
    r.mesh.visible = n > 1;
    if (n > 1) {
      const key2 = `${n}|${Array.prototype.join.call(cols, ',')}`;
      if (key2 !== r.paint) {
        r.paint = key2;
        paint(r.mesh, cols, n);
      }
      shape(r.mesh, x, n, t, free, anchor, r.seed, eye, floorAt);
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

  /* A cut's burst at p, in the cut paper's colour, with a glint; `level`
   * 1 for the pilot who made the cut, less for the others. */
  function burst(p, colour, level = 1) {
    const c = new THREE.Color(colour);
    glint.position.set(p[0], p[1], p[2]);
    glint.visible = true;
    glintLife = GLINT_S;
    glint.userData.level = level;
    glintCount += 1;
    for (let k = 0; k < Math.round(64 * level); k += 1) {
      const i = nextBit;
      const b = bit[i];
      nextBit = (nextBit + 1) % CONFETTI;
      b.life = CONFETTI_S * (0.6 + 0.4 * Math.random());
      b.p.set(p[0], p[1], p[2]);
      b.v.set(Math.random() * 10 - 5, Math.random() * 7 - 1.5, Math.random() * 10 - 5);
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
    if (glintLife > 0) {
      glintLife -= dt;
      const u = Math.max(0, glintLife / GLINT_S);
      glint.scale.setScalar(GLINT_M * (glint.userData.level || 1) * (0.4 + 0.6 * Math.sqrt(1 - u) + 0.3 * u));
      glint.material.opacity = u;
      glint.material.rotation += dt * 4;
      glint.visible = glintLife > 0;
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
    glintLife = 0;
    glint.visible = false;
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
    /* For the checks: how many glints were flashed, and paper squares out. */
    effects: () => ({ glints: glintCount, bits: bits.count }),
    /* For the checks: the colour seats each drawn ribbon of `key` wears,
     * tow point first, from its vertices. */
    colours(key) {
      const out = {};
      for (const [name, r] of ribbons) {
        const [k, id] = name.split(':').map(Number);
        if (k !== key || !r.mesh.visible) {
          continue;
        }
        const c = r.mesh.geometry.getAttribute('color').array;
        const n = r.mesh.geometry.drawRange.count / 6 + 1;
        const seats = [];
        for (let i = 0; i < n - 1; i += 1) {
          let best = 0;
          let bestD = Infinity;
          for (const [seat, rgb] of SEAT_RGB) {
            const d = Math.abs(rgb.r - c[i * 6]) + Math.abs(rgb.g - c[i * 6 + 1]) + Math.abs(rgb.b - c[i * 6 + 2]);
            if (d < bestD) {
              bestD = d;
              best = seat;
            }
          }
          if (!seats.length || seats[seats.length - 1][0] !== best) {
            seats.push([best, 1]);
          } else {
            seats[seats.length - 1][1] += 1;
          }
        }
        out[id] = seats;
      }
      return out;
    },
  };
}
