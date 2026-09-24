/*
 * nature.js: what grows and flows in the valley.
 *
 * The lake, the stream, the pines on the slopes and the broadleaf on the
 * floor. Trees are instanced, three draw calls a forest whatever its
 * size. Everything reads the terrain through ctx.heightAt and places
 * nothing the village or the road needs to know about.
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
import { celMaterial } from '../../render/celmat.js';
import { fbm, smoothstep } from './noise.js';
import { ribbon } from './ribbon.js';
import { FIELD, STRIP_L, LAKE_Z, LAKE_Y } from './terrain.js';

/*
 * Pines as three instanced meshes: a trunk and two cone tiers sharing the
 * same transforms, so a forest is three draw calls whatever its size.
 * Trunk of one shared height; the tiers scale with the tree.
 */
export function pineForest(placements) {
  const count = placements.length;
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 3.2, 6);
  trunkGeo.translate(0, 1.6, 0);
  const lower = new THREE.ConeGeometry(3.4, 6.5, 7);
  lower.translate(0, 3.2 + 3.25, 0);
  const upper = new THREE.ConeGeometry(2.3, 5.5, 7);
  upper.translate(0, 3.2 + 4.5 + 2.75, 0);
  const trunkMat = celMaterial({ color: 0x5a3f2a, rim: 0.12 });
  const lowerMat = celMaterial({ color: 0x2b552a, rim: 0.16 });
  const upperMat = celMaterial({ color: 0x376b33, rim: 0.16 });
  const meshes = [
    new THREE.InstancedMesh(trunkGeo, trunkMat, count),
    new THREE.InstancedMesh(lower, lowerMat, count),
    new THREE.InstancedMesh(upper, upperMat, count),
  ];
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  placements.forEach((t, i) => {
    p.set(t.x, t.y - 0.2, t.z);
    q.setFromAxisAngle(up, t.yaw);
    s.set(t.scale, t.scale * t.tall, t.scale);
    m.compose(p, q, s);
    for (const mesh of meshes) {
      mesh.setMatrixAt(i, m);
    }
  });
  const group = new THREE.Group();
  for (const mesh of meshes) {
    mesh.castShadow = true;
    group.add(mesh);
  }
  return group;
}

/* Broadleaf trees for the valley floor: a trunk and a crown of two blobs,
 * instanced the same way. */
export function broadleafGrove(placements) {
  const count = placements.length;
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.42, 3.6, 6);
  trunkGeo.translate(0, 1.8, 0);
  const crownA = new THREE.IcosahedronGeometry(3.4, 1);
  crownA.translate(0, 5.4, 0);
  const crownB = new THREE.IcosahedronGeometry(2.4, 1);
  crownB.translate(1.4, 7.4, -0.8);
  const meshes = [
    new THREE.InstancedMesh(trunkGeo, celMaterial({ color: 0x6b4a2f, rim: 0.14 }), count),
    new THREE.InstancedMesh(crownA, celMaterial({ color: 0x4f8f3c, rim: 0.28 }), count),
    new THREE.InstancedMesh(crownB, celMaterial({ color: 0x64a64a, rim: 0.28 }), count),
  ];
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  placements.forEach((t, i) => {
    p.set(t.x, t.y - 0.2, t.z);
    q.setFromAxisAngle(up, t.yaw);
    s.set(t.scale, t.scale, t.scale);
    m.compose(p, q, s);
    for (const mesh of meshes) {
      mesh.setMatrixAt(i, m);
    }
  });
  const group = new THREE.Group();
  for (const mesh of meshes) {
    mesh.castShadow = true;
    group.add(mesh);
  }
  return group;
}

/*
 * Build the living valley into ctx.scene. ctx carries the heightfield
 * as heightAt(x, z), the valley axis, a seeded rng of its own, the
 * colliders and the progress hook. Returns what the title's stats read.
 */
export async function buildNature(ctx) {
  const { scene, heightAt, valleyAxis, rng, colliders } = ctx;
  /* The lake: a plane at its level inside the basin the terrain dips
   * into. The floor under it is painted meadow, which the water hides. */
  const lake = new THREE.Mesh(
    new THREE.PlaneGeometry(1500, 1500),
    celMaterial({ color: 0x3e6f8e, rim: 0.35, rimColor: 0xdfeeff }),
  );
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(0, LAKE_Y, LAKE_Z);
  scene.add(lake);

  /*
   * THE STREAM, out of the side valley and down the floor to the lake,
   * west of the strip. Water a hair over the meadow; the meadow's own
   * roll gives it its bends.
   */
  const streamPts = [];
  for (let k = 0; k <= 40; k += 1) {
    const t = k / 40;
    const z = -1300 + t * 3350;
    const side = t < 0.25 ? (1 - t / 0.25) : 0;
    streamPts.push({ x: valleyAxis(z) - 95 - 30 * Math.sin(z / 260) + side * side * 700, z });
  }
  scene.add(ribbon(streamPts, 5, 0.1, heightAt, celMaterial({ color: 0x3d7a97, rim: 0.4, rimColor: 0xe6f3ff })).mesh);
  await ctx.paint(0.55);

  /*
   * TREES. Pines on the slopes where the paint says forest, thinning to
   * the tree line; broadleaf on the floor along the stream and round the
   * village. Both instanced, three draw calls each. Colliders only within
   * reach of the strip: further out the hillside is the first thing hit.
   */
  const pinePlaces = [];
  let tries = 0;
  while (pinePlaces.length < 3400 && tries < 200000) {
    tries += 1;
    const x = (rng() - 0.5) * FIELD * 0.92;
    const z = (rng() - 0.5) * FIELD * 0.92;
    const y = heightAt(x, z);
    if (y < 40 || y > 720) {
      continue;
    }
    const sx = (heightAt(x + 12, z) - heightAt(x - 12, z)) / 24;
    const sz = (heightAt(x, z + 12) - heightAt(x, z - 12)) / 24;
    if (Math.hypot(sx, sz) > 0.72) {
      continue;
    }
    const density = (1 - smoothstep(560, 720, y)) * (0.55 + 0.45 * fbm(x / 140, z / 140, 2));
    if (rng() > density) {
      continue;
    }
    const scale = 0.75 + rng() * 0.7;
    pinePlaces.push({ x, y, z, yaw: rng() * Math.PI * 2, scale, tall: 0.9 + rng() * 0.35 });
    if (Math.hypot(x, z) < 700) {
      colliders.addPost('tree', x, z, y, y + 14 * scale, 3.2 * scale);
    }
  }
  scene.add(pineForest(pinePlaces));
  const grove = [];
  for (let k = 0; k < 220; k += 1) {
    let x;
    let z;
    if (rng() < 0.6) {
      const at = streamPts[Math.floor(rng() * streamPts.length)];
      x = at.x + (rng() - 0.5) * 40;
      z = at.z + (rng() - 0.5) * 80;
    } else {
      x = -60 - rng() * 250;
      z = -300 + rng() * 700;
    }
    if (Math.abs(x) < 20 && Math.abs(z) < STRIP_L / 2 + 40) {
      continue;
    }
    const y = heightAt(x, z);
    if (y > 60) {
      continue;
    }
    grove.push({ x, y, z, yaw: rng() * Math.PI * 2, scale: 0.7 + rng() * 0.8 });
    if (Math.hypot(x, z) < 500) {
      colliders.addSphere('canopy', x, y + 5.4, z, 3.2);
    }
  }
  scene.add(broadleafGrove(grove));

  return { pines: pinePlaces.length, broadleaf: grove.length, streamPts };
}
