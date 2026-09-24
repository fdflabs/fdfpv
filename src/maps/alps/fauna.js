/*
 * fauna.js: the cattle, the goats, the hikers and their dog, the
 * paragliders. Everything alive in the valley that is not driving.
 *
 * All of it is decoration on the wall clock: a cow lifting its head or a
 * canopy turning over the wall is nothing a replay needs to agree on
 * and nothing the wing can hit. The herd is instanced in parts, a body
 * and a head each, so thirty cows are a handful of draw calls and every
 * head can still bob on its own; the four that walk the fence have
 * their legs as two more instanced pairs that swing.
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
import { makeParts, bakeParts, instanced, box, boxUp } from './parts.js';
import { makePath, arc } from './path.js';
import { smoothstep } from './noise.js';
import { streamX } from './terrain.js';

const COAT = {
  simmental: 0xa3563a,
  holstein: 0x2a2b2f,
  white: 0xf1ede4,
  muzzle: 0xd9bfae,
  hoof: 0x3a3230,
  udder: 0xe6b6ae,
  horn: 0xd8cfbd,
  bell: 0xc9a54a,
  strap: 0x4a3626,
};

/* Temporaries for the per frame matrix work; nothing here allocates. */
const M = new THREE.Matrix4();
const M2 = new THREE.Matrix4();
const M3 = new THREE.Matrix4();

/* T(x, y, z) R_y(yaw) T(px, py, pz) R_z(a): a part of a thing at
 * (x, y, z) facing yaw, pivoting about its own (px, py, pz). */
function partMatrix(out, x, y, z, yaw, px, py, pz, a) {
  out.makeTranslation(x, y, z);
  out.multiply(M2.makeRotationY(yaw));
  if (px !== 0 || py !== 0 || pz !== 0) {
    out.multiply(M2.makeTranslation(px, py, pz));
  }
  if (a !== 0) {
    out.multiply(M3.makeRotationZ(a));
  }
  return out;
}

/*
 * A cow, nose along +x, origin on the ground under the barrel. The body
 * with or without legs (a walker's legs are their own parts), the head
 * on its own with the pivot at the shoulder, and the two diagonal leg
 * pairs with the pivot at the hip. Simmental is red brown with a white
 * face, belly and legs; the Holstein is black with white patches.
 */
const HEAD_PIVOT = { x: 0.82, y: 1.3 };
const HIP = 0.68;

function cowBody(breed, legs) {
  const P = makeParts();
  const coat = breed === 'simmental' ? COAT.simmental : COAT.holstein;
  P.push(coat, box(1.7, 0.85, 0.72), 0, 1.05, 0);
  P.push(COAT.white, box(1.4, 0.3, 0.78), -0.05, 0.75, 0);
  if (breed === 'simmental') {
    P.push(COAT.white, box(0.5, 0.5, 0.76), 0.1, 1.15, 0);
  } else {
    P.push(COAT.white, box(0.45, 0.45, 0.76), 0.35, 1.12, 0);
    P.push(COAT.white, box(0.35, 0.4, 0.76), -0.55, 1.0, 0);
  }
  P.push(COAT.udder, box(0.3, 0.16, 0.28), -0.4, 0.55, 0);
  P.push(coat, box(0.05, 0.6, 0.05), -0.88, 0.95, 0);
  P.push(COAT.hoof, box(0.09, 0.14, 0.09), -0.88, 0.6, 0);
  if (legs) {
    for (const lx of [-0.62, 0.62]) {
      for (const lz of [-0.24, 0.24]) {
        P.push(COAT.white, boxUp(0.16, 0.66, 0.16), lx, 0, lz);
        P.push(COAT.hoof, boxUp(0.17, 0.08, 0.17), lx, 0, lz);
      }
    }
  }
  return bakeParts(P);
}

function cowHead(breed) {
  const P = makeParts();
  const sim = breed === 'simmental';
  const coat = sim ? COAT.simmental : COAT.holstein;
  P.push(coat, box(0.5, 0.36, 0.34), 0.2, 0, 0);
  P.push(sim ? COAT.white : COAT.holstein, box(0.48, 0.34, 0.28), 0.6, -0.02, 0);
  P.push(COAT.muzzle, box(0.14, 0.24, 0.24), 0.9, -0.08, 0);
  if (!sim) {
    P.push(COAT.white, box(0.02, 0.2, 0.1), 0.85, 0.02, 0);
  }
  for (const t of [-1, 1]) {
    P.push(coat, box(0.06, 0.05, 0.2), 0.5, 0.1, t * 0.22);
    P.push(COAT.horn, new THREE.ConeGeometry(0.03, 0.2, 5), 0.52, 0.22, t * 0.13, 0, t * 0.7, 0);
  }
  /* The bell on its strap, the one thing that says Switzerland from
   * ten metres. */
  P.push(COAT.strap, box(0.06, 0.4, 0.4), 0.36, -0.02, 0);
  P.push(COAT.bell, box(0.1, 0.13, 0.1), 0.4, -0.29, 0);
  return bakeParts(P);
}

function cowLegPair(pair) {
  const P = makeParts();
  const legs = pair === 0 ? [[0.62, 0.24], [-0.62, -0.24]] : [[0.62, -0.24], [-0.62, 0.24]];
  for (const [lx, lz] of legs) {
    P.push(COAT.white, box(0.16, 0.66, 0.16), lx, -0.33, lz);
    P.push(COAT.hoof, box(0.17, 0.08, 0.17), lx, -0.62, lz);
  }
  return bakeParts(P);
}

/*
 * A goat: a small barrel, a head held up, back swept horns, a beard, a
 * tail that stands up. Baked static in a few colours; goats on an alp
 * are seen from the air, where the shape and the scatter are the whole
 * thing.
 */
function goat(P, x, y, z, yaw, coat) {
  const cx = Math.cos(yaw);
  const sx = Math.sin(yaw);
  const at = (lx, lz) => [x + lx * cx + lz * sx, z - lx * sx + lz * cx];
  const body = at(0, 0);
  P.push(coat, box(0.85, 0.42, 0.34), body[0], y + 0.68, body[1], yaw);
  const head = at(0.5, 0);
  P.push(coat, box(0.3, 0.24, 0.18), head[0], y + 0.92, head[1], yaw, 0, 0.35);
  const beard = at(0.58, 0);
  P.push(COAT.white, box(0.05, 0.12, 0.05), beard[0], y + 0.74, beard[1], yaw);
  for (const t of [-1, 1]) {
    const h = at(0.42, t * 0.06);
    P.push(COAT.horn, new THREE.ConeGeometry(0.025, 0.28, 5), h[0], y + 1.12, h[1], yaw, 0, 0.9);
  }
  const tail = at(-0.45, 0);
  P.push(coat, box(0.05, 0.16, 0.05), tail[0], y + 0.92, tail[1], yaw, 0, 0.5);
  for (const lx of [-0.3, 0.3]) {
    for (const lz of [-0.11, 0.11]) {
      const l = at(lx, lz);
      P.push(coat, boxUp(0.08, 0.5, 0.08), l[0], y, l[1], yaw);
    }
  }
}

/*
 * A hiker: boots, trousers as two instanced legs that swing, a jacket,
 * a rucksack, a head under a cap, two poles. Authored facing +x with the
 * origin at the feet. The legs are their own instanced parts pivoting at
 * the hip, so the body geometry has none.
 */
const HIKER_HIP = 0.86;
function hikerBody(jacket, cap) {
  const P = makeParts();
  const skin = 0xe2b596;
  P.push(jacket, box(0.3, 0.6, 0.42), 0, 1.17, 0);
  P.push(0x5b4a3a, box(0.22, 0.48, 0.34), -0.25, 1.2, 0);
  P.push(0x5b4a3a, box(0.1, 0.05, 0.3), -0.1, 1.44, 0);
  for (const t of [-1, 1]) {
    P.push(jacket, box(0.1, 0.55, 0.1), 0.02, 1.15, t * 0.27);
    P.push(skin, box(0.09, 0.08, 0.09), 0.04, 0.85, t * 0.27);
    /* Poles, the slight lean forward a walker gives them. */
    P.push(0x2b2d31, box(0.02, 1.15, 0.02), 0.2, 0.58, t * 0.33, 0, 0, -0.12);
  }
  P.push(skin, new THREE.SphereGeometry(0.12, 10, 8), 0.02, 1.62, 0);
  P.push(cap, box(0.22, 0.09, 0.22), 0.03, 1.73, 0);
  P.push(cap, box(0.1, 0.02, 0.2), 0.16, 1.7, 0);
  return bakeParts(P);
}

function hikerLeg() {
  const P = makeParts();
  P.push(0x4a4c52, box(0.14, 0.82, 0.16), 0, -0.41, 0);
  P.push(0x3a2c22, box(0.24, 0.1, 0.16), 0.04, -0.82, 0);
  return bakeParts(P);
}

/* The dog: a Bernese, black with the white chest and a tan face, the
 * tail up. One mesh, it trots as a whole. */
function dog() {
  const P = makeParts();
  const black = 0x26262a;
  P.push(black, box(0.6, 0.3, 0.24), 0, 0.46, 0);
  P.push(COAT.white, box(0.16, 0.24, 0.26), 0.2, 0.42, 0);
  P.push(black, box(0.24, 0.22, 0.2), 0.4, 0.62, 0);
  P.push(0xb87a48, box(0.12, 0.12, 0.14), 0.52, 0.58, 0);
  P.push(COAT.white, box(0.06, 0.08, 0.14), 0.58, 0.56, 0);
  for (const t of [-1, 1]) {
    P.push(black, box(0.08, 0.14, 0.05), 0.36, 0.66, t * 0.12);
  }
  P.push(black, box(0.06, 0.32, 0.06), -0.32, 0.66, 0, 0, 0, 0.6);
  P.push(COAT.white, box(0.06, 0.08, 0.06), -0.42, 0.8, 0);
  for (const lx of [-0.2, 0.2]) {
    for (const lz of [-0.08, 0.08]) {
      P.push(black, boxUp(0.07, 0.34, 0.07), lx, 0, lz);
    }
  }
  return bakeParts(P);
}

/*
 * A paraglider: nine cells along an arc over the pilot, in two colours
 * that alternate so the stripes read from a kilometre, four lines down
 * to a harness with a helmet on top. Origin at the pilot, nose +x.
 */
function paraglider(colours) {
  const P = makeParts();
  const R = 6.4;
  const cells = 9;
  const span = 1.9;
  const chord = 2.3;
  /* Each cell a slice of one thick arch, so neighbours share their
   * edges and the canopy reads as one wing, not a row of bricks. The
   * profile is in z and y, extruded along x, the chord. */
  for (let k = 0; k < cells; k += 1) {
    const a0 = -span / 2 + (k / cells) * span;
    const a1 = -span / 2 + ((k + 1) / cells) * span;
    const shape = new THREE.Shape();
    const pt = (a, r) => [r * Math.sin(a), r * Math.cos(a)];
    shape.moveTo(...pt(a0, R - 0.22));
    shape.lineTo(...pt(a0, R + 0.22));
    shape.lineTo(...pt(a1, R + 0.22));
    shape.lineTo(...pt(a1, R - 0.22));
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: chord, bevelEnabled: false });
    /* Shape x is the span, y is up, the extrusion is +z: turn it so the
     * extrusion runs along x, nose forward, and the span along z. */
    g.translate(0, 0, -chord / 2);
    g.rotateY(Math.PI / 2);
    P.push(colours[k % 2], g, 0, 0, 0);
  }
  for (const a of [-0.75, -0.3, 0.3, 0.75]) {
    const dy = R * Math.cos(a) - 0.3;
    const dz = R * Math.sin(a);
    const len = Math.hypot(dy, dz);
    P.push(0x8d9096, box(0.02, len, 0.02), 0, 0.3 + dy / 2, dz / 2, 0, Math.atan2(dz, dy), 0);
  }
  P.push(0x2b2d31, box(0.45, 0.6, 0.45), 0.05, 0, 0);
  P.push(0x2b2d31, box(0.7, 0.24, 0.32), 0.45, -0.1, 0);
  P.push(0xf1eee6, new THREE.SphereGeometry(0.14, 8, 6), 0.05, 0.44, 0);
  return bakeParts(P);
}

/*
 * Where the farm track leaves the square for the south west farm, as
 * village.js lays it, as far as it runs toward the gondola: the hikers
 * walk its verge from the square to the base station and back.
 */
const TRACK = [{ x: -206, z: 128 }, { x: -215, z: 135 }, { x: -262, z: 170 }];

/* The pastures' barns, as village.js places them, as boxes a cow keeps
 * out of. */
const BARNS = [
  { x0: -161, x1: -139, z0: 234, z1: 256 },
  { x0: -68, x1: -52, z0: -205, z1: -185 },
];

/*
 * A polyline offset `d` to the right of travel, each vertex along its
 * averaged normal: the verge a walker keeps to beside a track.
 */
function verge(pts, d) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: p.x - ((b.z - a.z) / len) * d, z: p.z + ((b.x - a.x) / len) * d };
  });
}

/*
 * Build everything into ctx.scene and return update(t) for the wall
 * clock and the head count. Cattle stand on the real ground through
 * ctx.heightAt; the pastures are the two fenced fields village.js
 * fences.
 */
export function buildFauna(ctx) {
  const { scene, heightAt, rng, liftBase, look } = ctx;
  const mat = look.parts('fauna', { rim: 0.18 });
  const updaters = [];

  /* THE HERD: twenty in the south pasture, ten in the north, and four
   * Simmental walking the south field's north fence. A cow drawn in a
   * barn or in the stream, which runs through the north pasture, is
   * drawn again. */
  const grazers = [];
  const clear = (x, z) => Math.abs(x - streamX(z)) > 7
    && BARNS.every((b) => x < b.x0 - 3 || x > b.x1 + 3 || z < b.z0 - 3 || z > b.z1 + 3);
  for (let k = 0; k < 30; k += 1) {
    const north = k >= 20;
    let x;
    let z;
    do {
      x = north ? -40 - rng() * 170 : -60 - rng() * 190;
      z = north ? -165 - rng() * 120 : 220 + rng() * 95;
    } while (!clear(x, z));
    grazers.push({
      x, y: heightAt(x, z), z, yaw: rng() * Math.PI * 2,
      breed: rng() < 0.6 ? 'simmental' : 'holstein',
      phase: rng() * Math.PI * 2, rate: 0.06 + rng() * 0.04,
    });
  }
  /* The walkers' beat: a long thin ellipse just inside the fence, so the
   * turn at each end is a walk round rather than an about face. */
  const loop = [];
  for (let k = 0; k < 48; k += 1) {
    const a = (k / 48) * Math.PI * 2;
    loop.push({ x: -150 + 85 * Math.cos(a), z: 209 + 3.5 * Math.sin(a) });
  }
  const fenceLoop = makePath(loop, true);
  const walkers = [];
  for (let k = 0; k < 4; k += 1) {
    walkers.push({ s0: k * 30 + rng() * 10, speed: 0.4 + rng() * 0.1, phase: rng() * Math.PI * 2 });
  }
  const byBreed = (breed) => grazers.filter((c) => c.breed === breed);
  const herd = {
    simBody: instanced(cowBody('simmental', true), mat, byBreed('simmental').length),
    holBody: instanced(cowBody('holstein', true), mat, byBreed('holstein').length),
    walkBody: instanced(cowBody('simmental', false), mat, walkers.length),
    simHead: instanced(cowHead('simmental'), mat, byBreed('simmental').length + walkers.length),
    holHead: instanced(cowHead('holstein'), mat, byBreed('holstein').length),
    legsA: instanced(cowLegPair(0), mat, walkers.length),
    legsB: instanced(cowLegPair(1), mat, walkers.length),
  };
  for (const [key, mesh] of Object.entries(herd)) {
    mesh.name = `herd-${key}`;
    scene.add(mesh);
  }
  const sim = byBreed('simmental');
  const hol = byBreed('holstein');
  sim.forEach((c, i) => herd.simBody.setMatrixAt(i, partMatrix(M, c.x, c.y, c.z, c.yaw, 0, 0, 0, 0)));
  hol.forEach((c, i) => herd.holBody.setMatrixAt(i, partMatrix(M, c.x, c.y, c.z, c.yaw, 0, 0, 0, 0)));
  herd.simBody.instanceMatrix.needsUpdate = true;
  herd.holBody.instanceMatrix.needsUpdate = true;

  /* A grazing head is down, and comes up for a few seconds every minute
   * or so, with a chew while it is down. A walker's head is level and
   * nods with its step. */
  const grazeAngle = (c, t) => {
    const up = smoothstep(0.86, 0.95, Math.sin(t * c.rate + c.phase));
    return -0.78 + 0.85 * up + 0.04 * Math.sin(t * 2.3 + c.phase) * (1 - up);
  };
  updaters.push((t) => {
    sim.forEach((c, i) => herd.simHead.setMatrixAt(i, partMatrix(M, c.x, c.y, c.z, c.yaw, HEAD_PIVOT.x, HEAD_PIVOT.y, 0, grazeAngle(c, t))));
    hol.forEach((c, i) => herd.holHead.setMatrixAt(i, partMatrix(M, c.x, c.y, c.z, c.yaw, HEAD_PIVOT.x, HEAD_PIVOT.y, 0, grazeAngle(c, t))));
    walkers.forEach((w, i) => {
      const s = w.s0 + w.speed * t;
      const at = fenceLoop.at(s);
      const y = heightAt(at.x, at.z);
      const step = s * 2.4 + w.phase;
      const swing = 0.32 * Math.sin(step);
      const bob = 0.015 * Math.abs(Math.cos(step));
      herd.walkBody.setMatrixAt(i, partMatrix(M, at.x, y + bob, at.z, at.yaw, 0, 0, 0, 0));
      herd.simHead.setMatrixAt(sim.length + i, partMatrix(M, at.x, y + bob, at.z, at.yaw, HEAD_PIVOT.x, HEAD_PIVOT.y, 0, -0.25 + 0.08 * Math.sin(step * 2)));
      herd.legsA.setMatrixAt(i, partMatrix(M, at.x, y + bob, at.z, at.yaw, 0, HIP, 0, swing));
      herd.legsB.setMatrixAt(i, partMatrix(M, at.x, y + bob, at.z, at.yaw, 0, HIP, 0, -swing));
    });
    for (const key of ['simHead', 'holHead', 'walkBody', 'legsA', 'legsB']) {
      herd[key].instanceMatrix.needsUpdate = true;
    }
  });

  /* THE GOATS, on the alp above the village where the wall eases
   * before the pines: eight, baked, still. */
  const flock = makeParts();
  const goatCoats = [COAT.white, COAT.white, 0x8a6a48, 0x2f2c2a, 0xcfc4b0];
  for (let k = 0; k < 8; k += 1) {
    const x = -540 - rng() * 70;
    const z = 130 + rng() * 80;
    goat(flock, x, heightAt(x, z), z, rng() * Math.PI * 2, goatCoats[Math.floor(rng() * goatCoats.length)]);
  }
  const goats = new THREE.Mesh(bakeParts(flock), mat);
  goats.castShadow = true;
  scene.add(goats);

  /* THE HIKERS, three in file with a dog running ahead, from the square
   * along the farm track to the gondola's base station and back, on the
   * grass verge to their right each way, turning at each end. The far
   * end is three metres off the back of the station. */
  const dir = { x: Math.cos(liftBase.yaw), z: -Math.sin(liftBase.yaw) };
  const way = [...TRACK, { x: liftBase.x - dir.x * 11, z: liftBase.z - dir.z * 11 }];
  const V = 2.6;
  const out = verge(way, V);
  const back = verge([...way].reverse(), V);
  const turn = (p, q) => {
    const a0 = Math.atan2(p.z - q.z, p.x - q.x);
    return arc(q.x, q.z, V, a0, a0 - Math.PI, 6).slice(1, -1);
  };
  const trail = makePath([
    ...out,
    ...turn(out[out.length - 1], way[way.length - 1]),
    ...back,
    ...turn(back[back.length - 1], way[0]),
  ], true);
  const hikers = [
    { body: hikerBody(0xc23a2e, 0x2b2d31), s0: 0 },
    { body: hikerBody(0x2f5fa8, 0xd9c45a), s0: -2.6 },
    { body: hikerBody(0x9bb23a, 0x8a3a2a), s0: -5.0 },
  ];
  const legs = instanced(hikerLeg(), mat, hikers.length * 2);
  scene.add(legs);
  hikers.forEach((h, i) => {
    h.mesh = new THREE.Mesh(h.body, mat);
    h.mesh.name = `hiker${i}`;
    h.mesh.castShadow = true;
    scene.add(h.mesh);
  });
  const hound = new THREE.Mesh(dog(), mat);
  hound.castShadow = true;
  scene.add(hound);
  const WALK = 1.25;
  updaters.push((t) => {
    hikers.forEach((h, i) => {
      const s = h.s0 + WALK * t;
      const at = trail.at(s);
      const step = s * 3.4 + i;
      const y = heightAt(at.x, at.z) + 0.03 * Math.abs(Math.sin(step));
      h.mesh.position.set(at.x, y, at.z);
      h.mesh.rotation.y = at.yaw;
      const swing = 0.42 * Math.sin(step);
      legs.setMatrixAt(i * 2, partMatrix(M, at.x, y, at.z, at.yaw, 0, HIKER_HIP, 0.09, swing));
      legs.setMatrixAt(i * 2 + 1, partMatrix(M, at.x, y, at.z, at.yaw, 0, HIKER_HIP, -0.09, -swing));
    });
    legs.instanceMatrix.needsUpdate = true;
    /* The dog ranges ahead and drops back, never slower than a trot. */
    const sd = WALK * t + 5 + 3 * Math.sin(0.35 * t);
    const at = trail.at(sd);
    hound.position.set(at.x, heightAt(at.x, at.z) + 0.04 * Math.abs(Math.sin(t * 7)), at.z);
    hound.rotation.y = at.yaw;
  });

  /* THE PARAGLIDERS: three, thermalling over the west wall, each on its
   * own circle at its own rate, banked into the turn, drifting up and
   * down with the lift. */
  const gliders = [
    { colours: [0xe8702a, 0xf2f0ea], cx: -880, cz: -180, cy: 620, r: 80, w: 0.11, phase: 0.0 },
    { colours: [0x2f66b3, 0xf2f0ea], cx: -960, cz: 60, cy: 690, r: 110, w: -0.085, phase: 2.1 },
    { colours: [0xc23a2e, 0xe8c840], cx: -820, cz: 240, cy: 560, r: 65, w: 0.13, phase: 4.0 },
  ];
  gliders.forEach((g, i) => {
    g.group = new THREE.Group();
    g.group.name = `paraglider${i}`;
    g.group.rotation.order = 'YXZ';
    const mesh = new THREE.Mesh(paraglider(g.colours), mat);
    mesh.castShadow = true;
    g.group.add(mesh);
    scene.add(g.group);
  });
  updaters.push((t) => {
    for (const g of gliders) {
      const a = g.w * t + g.phase;
      const x = g.cx + g.r * Math.cos(a);
      const z = g.cz + g.r * Math.sin(a);
      const y = g.cy + 12 * Math.sin(t * 0.045 + g.phase);
      /* Heading is the tangent; with w positive the centre is on the
       * right, so the bank is to the right. */
      const hx = -Math.sin(a) * Math.sign(g.w);
      const hz = Math.cos(a) * Math.sign(g.w);
      g.group.position.set(x, y, z);
      g.group.rotation.y = Math.atan2(-hz, hx);
      g.group.rotation.x = 0.38 * Math.sign(g.w);
    }
  });

  return {
    update: (t) => {
      for (const fn of updaters) {
        fn(t);
      }
    },
    cattle: grazers.length + walkers.length,
    goats: 8,
  };
}
