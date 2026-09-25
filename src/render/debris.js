/*
 * debris.js: what a crash throws up, drawn where it happened.
 *
 * Render only. The crash physics reports where a part struck, how fast and
 * on what (sim_damage_events: the contact point, its normal, the closing
 * speed and the surface's material), and this turns each report into what
 * a camera would see there: a puff of dust off dirt, a spray of cut grass,
 * powder off snow, a white splash and its ring off water, leaves and twigs
 * out of a crown, splinters off a trunk, chips off asphalt and rock, crumbs
 * of foam off a crushed nose, black shards off a snapped carbon arm.
 *
 * None of it is physics. Every particle is a straight ballistic arc on the
 * wall clock, dropped on the ground plane of the spot it came from, with a
 * fixed pool so a crash costs the same draw calls as a clean lap: two point
 * clouds (fine flecks and soft puffs) and one instanced mesh of chunks. A
 * pool that is full takes the oldest slot, so a long tumble keeps its last
 * impacts rather than its first.
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
import { SURFACES } from '../../configs/parts.js';

const FLECKS = 700;
const PUFFS = 160;
const CHUNKS = 140;
const GRAVITY = 9.81;

/*
 * WHAT EACH SURFACE THROWS. Colours are sRGB hex, the look of the stuff in
 * daylight; counts are per unit of hit (a 10 m/s strike is one unit), so a
 * tap raises a wisp and a nose in raises a cloud.
 *   fleck   small bits flung out: [colour, count, speed m/s]
 *   puff    soft cloud that drifts and fades: [colour, count, grow]
 *   chunk   tumbling solids: [colour, count, [length, width, height] m]
 *   up      how much of the throw goes along the normal rather than across
 */
const LOOKS = {
  default: { fleck: [0x6a7a3a, 14, 2.4], puff: [0x9c8a6a, 3, 1.0], chunk: [0x5a4630, 3, [0.03, 0.02, 0.02]], up: 0.7 },
  grass: { fleck: [0x5d8a2e, 26, 2.8], puff: [0x8c7c5c, 3, 0.9], chunk: [0x4a3a26, 4, [0.035, 0.025, 0.02]], up: 0.75 },
  dirt: { fleck: [0x6b5236, 22, 2.6], puff: [0xa08462, 7, 1.4], chunk: [0x55402a, 6, [0.03, 0.025, 0.022]], up: 0.7 },
  sand: { fleck: [0xcdb78a, 22, 2.4], puff: [0xd8c7a0, 8, 1.5], chunk: null, up: 0.7 },
  asphalt: { fleck: [0x3a3a3c, 10, 3.2], puff: [0x8a8a86, 3, 0.8], chunk: [0x2e2e30, 3, [0.015, 0.012, 0.008]], up: 0.45 },
  concrete: { fleck: [0x9a9890, 10, 3.2], puff: [0xb8b6ae, 4, 0.9], chunk: [0x8e8c84, 3, [0.018, 0.014, 0.01]], up: 0.45 },
  rock: { fleck: [0x7c776e, 12, 3.4], puff: [0xa29c90, 4, 1.0], chunk: [0x6a655c, 4, [0.022, 0.018, 0.014]], up: 0.5 },
  snow: { fleck: [0xf2f5fa, 30, 2.2], puff: [0xf4f6fb, 9, 1.8], chunk: [0xe8edf5, 4, [0.03, 0.03, 0.025]], up: 0.8 },
  wood: { fleck: [0x8a6a44, 10, 3.0], puff: null, chunk: [0xc8a878, 7, [0.07, 0.008, 0.008]], up: 0.35 },
  foliage: { fleck: [0x4f7a2a, 30, 1.8], puff: null, chunk: [0x6a4a2a, 6, [0.09, 0.006, 0.006]], up: 0.4 },
  pvc: { fleck: [0xe8e4dc, 6, 3.0], puff: null, chunk: [0xf0ece4, 2, [0.02, 0.012, 0.004]], up: 0.35 },
  metal: { fleck: [0xffe2a0, 10, 5.0], puff: null, chunk: null, up: 0.3 },
  water: { fleck: [0xeef4f8, 40, 3.6], puff: [0xf4f8fb, 6, 1.6], chunk: null, up: 0.9 },
};

const NOTHING = { fleck: null, puff: null, chunk: null, up: 0.5 };

/*
 * WHAT THE AIRCRAFT SHEDS, by the struck part's material (configs/parts.js
 * MATERIALS): the foam of a crushed nose, the black of a snapped carbon arm,
 * a prop's nylon. On a break or a crush, with the surface's own throw.
 */
const SHED = {
  'cf-plate': [0x1a1a1c, 5, [0.04, 0.01, 0.004]],
  'cf-tube': [0x1a1a1c, 4, [0.05, 0.008, 0.008]],
  epo: [0xf4f2ec, 9, [0.022, 0.018, 0.016]],
  epp: [0x2a2a2e, 7, [0.022, 0.018, 0.016]],
  'nylon-gf': [0x222226, 4, [0.03, 0.01, 0.004]],
  pc: [0xdadde2, 4, [0.025, 0.02, 0.003]],
  ply: [0xc49a64, 5, [0.05, 0.012, 0.004]],
  /* Balsa splinters: long, thin and pale, the way a stick and a sheet
   * break along the grain. */
  balsa: [0xe6d3a3, 9, [0.07, 0.005, 0.003]],
};

function softDot() {
  const n = 32;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      const dx = (x + 0.5) / n * 2 - 1;
      const dy = (y + 0.5) / n * 2 - 1;
      const r = Math.sqrt(dx * dx + dy * dy);
      const a = r >= 1 ? 0 : (1 - r) * (1 - r);
      const i = (y * n + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}

/* A seeded generator, so a burst looks the same each time it is replayed
 * from the same event rather than differently on every machine. */
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function pointPool(count, size, dot) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 4);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const mat = new THREE.PointsMaterial({
    size,
    map: dot,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    sizeAttenuation: true,
    fog: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return {
    points,
    pos,
    col,
    vel: new Float32Array(count * 3),
    life: new Float32Array(count),
    age: new Float32Array(count),
    floor: new Float32Array(count),
    alpha: new Float32Array(count),
    drag: new Float32Array(count),
    count,
    next: 0,
  };
}

export function createDebris() {
  const group = new THREE.Group();
  group.name = 'debris';
  const dot = softDot();
  const flecks = pointPool(FLECKS, 0.035, dot);
  const puffs = pointPool(PUFFS, 0.55, dot);
  group.add(flecks.points);
  group.add(puffs.points);

  const chunkGeo = new THREE.BoxGeometry(1, 1, 1);
  const chunkMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const chunks = new THREE.InstancedMesh(chunkGeo, chunkMat, CHUNKS);
  chunks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  chunks.frustumCulled = false;
  chunks.castShadow = false;
  chunks.count = 0;
  const chunkColor = new THREE.Color();
  for (let i = 0; i < CHUNKS; i += 1) {
    chunks.setColorAt(i, chunkColor.set(0xffffff));
  }
  group.add(chunks);
  const ch = {
    pos: new Float32Array(CHUNKS * 3),
    vel: new Float32Array(CHUNKS * 3),
    spin: new Float32Array(CHUNKS * 3),
    rot: new Float32Array(CHUNKS * 3),
    size: new Float32Array(CHUNKS * 3),
    floor: new Float32Array(CHUNKS),
    age: new Float32Array(CHUNKS),
    life: new Float32Array(CHUNKS),
    next: 0,
    used: 0,
  };
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  const t1 = new THREE.Vector3();
  const t2 = new THREE.Vector3();
  let seq = 1;

  /* Two directions across the normal, for spreading a throw. */
  function basis(nx, ny, nz) {
    t1.set(ny, -nx, 0);
    if (t1.lengthSq() < 1e-6) {
      t1.set(0, nz, -ny);
    }
    t1.normalize();
    t2.set(nx, ny, nz).cross(t1).normalize();
  }

  function throwDir(r, nx, ny, nz, up, spread, out) {
    const a = r() * Math.PI * 2;
    const k = spread * (0.3 + 0.7 * r());
    out.set(
      nx * up + (t1.x * Math.cos(a) + t2.x * Math.sin(a)) * k,
      ny * up + (t1.y * Math.cos(a) + t2.y * Math.sin(a)) * k,
      nz * up + (t1.z * Math.cos(a) + t2.z * Math.sin(a)) * k,
    );
    return out;
  }

  function addPoint(pool, x, y, z, vx, vy, vz, color, alpha, life, floor, drag) {
    const i = pool.next;
    pool.next = (pool.next + 1) % pool.count;
    pool.pos[i * 3] = x;
    pool.pos[i * 3 + 1] = y;
    pool.pos[i * 3 + 2] = z;
    pool.vel[i * 3] = vx;
    pool.vel[i * 3 + 1] = vy;
    pool.vel[i * 3 + 2] = vz;
    c.set(color);
    pool.col[i * 4] = c.r;
    pool.col[i * 4 + 1] = c.g;
    pool.col[i * 4 + 2] = c.b;
    pool.col[i * 4 + 3] = alpha;
    pool.alpha[i] = alpha;
    pool.life[i] = life;
    pool.age[i] = 0;
    pool.floor[i] = floor;
    pool.drag[i] = drag;
  }

  function addChunk(x, y, z, vx, vy, vz, color, dims, floor, r) {
    const i = ch.next;
    ch.next = (ch.next + 1) % CHUNKS;
    ch.used = Math.max(ch.used, ch.next === 0 ? CHUNKS : ch.next);
    ch.pos[i * 3] = x;
    ch.pos[i * 3 + 1] = y;
    ch.pos[i * 3 + 2] = z;
    ch.vel[i * 3] = vx;
    ch.vel[i * 3 + 1] = vy;
    ch.vel[i * 3 + 2] = vz;
    for (let k = 0; k < 3; k += 1) {
      ch.spin[i * 3 + k] = (r() - 0.5) * 30;
      ch.rot[i * 3 + k] = r() * Math.PI * 2;
      ch.size[i * 3 + k] = dims[k] * (0.6 + 0.8 * r());
    }
    ch.floor[i] = floor;
    ch.age[i] = 0;
    ch.life[i] = 6 + 4 * r();
    chunks.setColorAt(i, c.set(color));
    chunks.instanceColor.needsUpdate = true;
    chunks.count = ch.used;
  }

  /*
   * One impact. `point` and `normal` are world (Three.js) vectors, `speed`
   * the closing speed in m/s, `surface` a configs/parts.js SURFACES index,
   * `shed` the struck part's material name or null, `floorY` the ground's
   * height there, and `kind` 'hit' for a contact or 'break' for a part
   * leaving, which throws its own pieces as well as the surface's. A
   * negative `surface` is a part leaving with nothing under it.
   */
  function emit(point, normal, speed, surface, shed, floorY, kind) {
    /* No surface (a part leaving in the air): only its own pieces. */
    const name = SURFACES[surface] ?? 'default';
    const look = surface >= 0 ? (LOOKS[name] ?? LOOKS.default) : NOTHING;
    const units = Math.min(3, Math.max(0.25, speed / 10));
    const r = rng(seq * 2654435761);
    seq += 1;
    let nx = normal.x;
    let ny = normal.y;
    let nz = normal.z;
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (!(nl > 1e-6)) {
      nx = 0;
      ny = 1;
      nz = 0;
    } else {
      nx /= nl;
      ny /= nl;
      nz /= nl;
    }
    basis(nx, ny, nz);
    const x = point.x + nx * 0.02;
    const y = point.y + ny * 0.02;
    const z = point.z + nz * 0.02;
    const floor = Math.min(floorY, y - 0.001);
    if (look.fleck) {
      const [color, count, v0] = look.fleck;
      const n = Math.round(count * units);
      for (let i = 0; i < n; i += 1) {
        throwDir(r, nx, ny, nz, look.up, 1, p);
        const v = v0 * (0.4 + 0.9 * r()) * (0.6 + 0.4 * units);
        addPoint(flecks, x, y, z, p.x * v, p.y * v, p.z * v, color, 0.95,
          0.9 + 1.2 * r() + (name === 'water' ? 0 : 1.5), floor, name === 'foliage' ? 2.2 : 0.4);
      }
    }
    if (look.puff) {
      const [color, count, grow] = look.puff;
      const n = Math.round(count * units);
      for (let i = 0; i < n; i += 1) {
        throwDir(r, nx, ny, nz, 0.5, 1.2, p);
        const v = grow * (0.3 + 0.7 * r());
        addPoint(puffs, x + p.x * 0.05, y + p.y * 0.05, z + p.z * 0.05,
          p.x * v, p.y * v + 0.25, p.z * v, color, 0.42, 1.4 + 1.6 * r(), floor, 2.5);
      }
    }
    if (name === 'water') {
      /* The ring: spray thrown flat across the surface. */
      const n = Math.round(24 * units);
      for (let i = 0; i < n; i += 1) {
        const a = (i / n) * Math.PI * 2 + r() * 0.2;
        const v = 1.6 + 1.6 * r();
        addPoint(flecks, x, y, z,
          (t1.x * Math.cos(a) + t2.x * Math.sin(a)) * v + nx * 1.2,
          (t1.y * Math.cos(a) + t2.y * Math.sin(a)) * v + ny * 1.2,
          (t1.z * Math.cos(a) + t2.z * Math.sin(a)) * v + nz * 1.2,
          0xf6fafc, 0.9, 0.8 + 0.5 * r(), floor, 0.8);
      }
    }
    if (look.chunk) {
      const [color, count, dims] = look.chunk;
      const n = Math.round(count * units);
      for (let i = 0; i < n; i += 1) {
        throwDir(r, nx, ny, nz, look.up, 1, p);
        const v = 2.2 * (0.4 + 0.8 * r()) * (0.6 + 0.4 * units);
        addChunk(x, y, z, p.x * v, p.y * v, p.z * v, color, dims, floor, r);
      }
    }
    const own = shed ? SHED[shed] : null;
    if (own && (kind === 'break' || kind === 'crush')) {
      const [color, count, dims] = own;
      const n = Math.max(1, Math.round(count * Math.min(2, units)));
      for (let i = 0; i < n; i += 1) {
        throwDir(r, nx, ny, nz, 0.6, 1.1, p);
        const v = 2.8 * (0.4 + 0.8 * r());
        addChunk(x, y, z, p.x * v, p.y * v, p.z * v, color, dims, floor, r);
      }
    }
  }

  function stepPool(pool, dt, fall) {
    for (let i = 0; i < pool.count; i += 1) {
      if (pool.age[i] >= pool.life[i]) {
        pool.col[i * 4 + 3] = 0;
        continue;
      }
      pool.age[i] += dt;
      const k = Math.max(0, 1 - pool.drag[i] * dt);
      const b = i * 3;
      pool.vel[b] *= k;
      pool.vel[b + 1] = pool.vel[b + 1] * k - fall * dt;
      pool.vel[b + 2] *= k;
      pool.pos[b] += pool.vel[b] * dt;
      pool.pos[b + 1] += pool.vel[b + 1] * dt;
      pool.pos[b + 2] += pool.vel[b + 2] * dt;
      if (pool.pos[b + 1] < pool.floor[i]) {
        pool.pos[b + 1] = pool.floor[i];
        pool.vel[b] *= 0.3;
        pool.vel[b + 1] = 0;
        pool.vel[b + 2] *= 0.3;
      }
      const u = pool.age[i] / pool.life[i];
      pool.col[i * 4 + 3] = pool.alpha[i] * (u < 0.1 ? u / 0.1 : 1 - (u - 0.1) / 0.9);
    }
    pool.points.geometry.attributes.position.needsUpdate = true;
    pool.points.geometry.attributes.color.needsUpdate = true;
  }

  let active = 0;

  /* Once a frame, wall clock seconds. */
  function update(dtS) {
    const dt = Math.min(0.05, Math.max(0, dtS));
    active = 0;
    for (let i = 0; i < FLECKS; i += 1) {
      if (flecks.age[i] < flecks.life[i]) {
        active += 1;
      }
    }
    for (let i = 0; i < PUFFS; i += 1) {
      if (puffs.age[i] < puffs.life[i]) {
        active += 1;
      }
    }
    for (let i = 0; i < ch.used; i += 1) {
      if (ch.age[i] < ch.life[i]) {
        active += 1;
      }
    }
    if (active === 0) {
      group.visible = false;
      return 0;
    }
    group.visible = true;
    stepPool(flecks, dt, GRAVITY);
    /* A puff is dust hanging in the air: it barely falls. */
    stepPool(puffs, dt, 0.15);
    for (let i = 0; i < ch.used; i += 1) {
      const b = i * 3;
      if (ch.age[i] >= ch.life[i]) {
        mtx.makeScale(0, 0, 0);
        chunks.setMatrixAt(i, mtx);
        continue;
      }
      ch.age[i] += dt;
      const grounded = ch.pos[b + 1] <= ch.floor[i] + 1e-4 && ch.vel[b + 1] <= 0;
      if (!grounded) {
        ch.vel[b + 1] -= GRAVITY * dt;
        for (let k = 0; k < 3; k += 1) {
          ch.vel[b + k] *= 1 - 0.3 * dt;
          ch.pos[b + k] += ch.vel[b + k] * dt;
          ch.rot[b + k] += ch.spin[b + k] * dt;
        }
        if (ch.pos[b + 1] < ch.floor[i]) {
          ch.pos[b + 1] = ch.floor[i];
          ch.vel[b] *= 0.35;
          ch.vel[b + 1] = -ch.vel[b + 1] * 0.25;
          ch.vel[b + 2] *= 0.35;
          ch.spin[b] *= 0.4;
          ch.spin[b + 1] *= 0.4;
          ch.spin[b + 2] *= 0.4;
          if (ch.vel[b + 1] < 0.3) {
            ch.vel[b + 1] = 0;
            /* Lying down: flat on its biggest face. */
            ch.rot[b] = 0;
            ch.rot[b + 2] = 0;
          }
        }
      }
      const fade = ch.life[i] - ch.age[i] < 1 ? Math.max(0, ch.life[i] - ch.age[i]) : 1;
      e.set(ch.rot[b], ch.rot[b + 1], ch.rot[b + 2]);
      q.setFromEuler(e);
      s.set(ch.size[b] * fade, ch.size[b + 2] * fade, ch.size[b + 1] * fade);
      p.set(ch.pos[b], ch.pos[b + 1] + s.y * 0.5, ch.pos[b + 2]);
      mtx.compose(p, q, s);
      chunks.setMatrixAt(i, mtx);
    }
    chunks.instanceMatrix.needsUpdate = true;
    return active;
  }

  function clear() {
    flecks.age.fill(1e9);
    puffs.age.fill(1e9);
    flecks.col.fill(0);
    puffs.col.fill(0);
    ch.age.fill(1e9);
    ch.used = 0;
    ch.next = 0;
    chunks.count = 0;
    group.visible = false;
  }

  clear();

  return { group, emit, update, clear, active: () => active };
}
