/*
 * old-faithful.js: Old Faithful, its mound, its vent, its eruption and the
 * boardwalk round it.
 *
 * The geyser stands on a low dome of geyserite, sixty to eighty metres
 * across and three or four metres high, grey white where it is dry, dark
 * and wet round the vent, and streaked orange and brown down the channels
 * its runoff has cut. The vent is a slot a couple of metres long in a
 * knobbly lip. The eruption (schedule.js) is splashing preplay, then a
 * column that climbs to 32 to 56 m inside a quarter of a minute, holds,
 * and declines over a minute or three into a steam phase. The boardwalk
 * rings it at about a hundred metres, which is where the benches are.
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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { boardwalk, lathe, rockMaterial, heroGeyser, sinterMound } from './kit.js';

const MOUND_A = 40;
const MOUND_B = 30;
const MOUND_H = 3.4;
const TURN = 0.5;

export function buildOldFaithful(env, f) {
  const { heightAt } = env;
  const x = f.x;
  const z = f.z;
  const group = new THREE.Group();
  group.name = 'old-faithful';
  const mound = sinterMound(env, { x, z, a: MOUND_A, b: MOUND_B, h: MOUND_H, turn: TURN, key: 'old-faithful', wet: 7 });
  group.add(mound.mesh);

  /* The vent: a slot in a knobbly lip, elongated along the dome's long
   * axis, its foot sunk into the dome top. */
  const top = mound.top;
  const lip = lathe([
    [2.2, -0.3, 0xb9b3a6],
    [1.75, 0.35, 0xd6d2c8],
    [1.35, 0.55, 0xcfc9bb],
    [1.0, 0.4, 0x6b645c],
    [0.75, -0.6, 0x2d2926],
  ], {
    x, z, foot: top, segs: 18,
    shape: (a, row) => (1 + 0.9 * Math.cos(a - TURN) ** 2) * 0.62 * (row === 1 || row === 2 ? 1 + 0.12 * Math.sin(a * 7 + row) : 1),
  });
  /* The vent and the benches are one vertex coloured mesh, one draw. */
  const vent = new THREE.Mesh(mergeGeometries([lip, benches(heightAt, x, z)], false), rockMaterial());
  vent.name = 'old-faithful-vent-and-benches';
  vent.userData.bake = true;
  vent.castShadow = true;
  group.add(vent);

  const geyser = heroGeyser(env, {
    id: 'old-faithful', style: 'old-faithful', vent: { x, y: top + 0.3, z }, peakMax: 56,
    jet: { drops: 900, size: 1.3, spread: 0.07, width: 0.9 },
    plume: { size: 6.5, count: 80, rise: 75, life: 16, spread: 5 },
    seed: 1870, rng: env.rng, feature: f,
  });
  group.add(geyser.group);

  /* The boardwalk: a ring at about a hundred metres, open to the north
   * west where the real one turns off toward the inn. */
  const ring = [];
  for (let k = 0; k <= 60; k += 1) {
    const a = 2.6 + (k / 60) * Math.PI * 1.7;
    ring.push({ x: x + Math.cos(a) * 98, z: z + Math.sin(a) * 92 });
  }
  const walk = boardwalk(heightAt, ring, { width: 3.2, clear: 0.4, name: 'old-faithful-boardwalk' });
  group.add(walk);

  return {
    id: 'old-faithful',
    group,
    geyser,
    update: (t) => geyser.update(t),
    setDemo: (on) => geyser.setDemo(on),
    particles: geyser.particles,
    focus: { x, y: top, z, r: 110, height: 60 },
  };
}

/* Rows of benches on the south side, facing the vent, a short step inside
 * the ring, as one geometry. */
function benches(heightAt, x, z) {
  const geo = new THREE.BoxGeometry(3.2, 0.12, 0.45);
  geo.translate(0, 0.45, 0);
  const leg = new THREE.BoxGeometry(3.0, 0.45, 0.3);
  leg.translate(0, 0.225, 0);
  const merged = mergeTwo(geo, leg);
  const places = [];
  for (let row = 0; row < 2; row += 1) {
    for (let k = -6; k <= 6; k += 1) {
      const a = Math.PI / 2 + k * 0.075;
      const r = 90 - row * 3;
      places.push({ x: x + Math.cos(a) * r, z: z + Math.sin(a) * r * 0.94, yaw: -a + Math.PI / 2 });
    }
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const parts = places.map((p) => {
    q.setFromAxisAngle(up, p.yaw);
    m.compose(new THREE.Vector3(p.x, heightAt(p.x, p.z) - 0.05, p.z), q, one);
    return merged.clone().applyMatrix4(m);
  });
  return mergeGeometries(parts, false);
}

function mergeTwo(a, b) {
  const pos = [...a.getAttribute('position').array, ...b.getAttribute('position').array];
  const n = a.getAttribute('position').count;
  const idx = [...a.index.array, ...Array.from(b.index.array, (i) => i + n)];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const col = new Float32Array(pos.length);
  const wood = new THREE.Color(0x7a5b3e);
  for (let k = 0; k < col.length; k += 3) {
    col[k] = wood.r;
    col[k + 1] = wood.g;
    col[k + 2] = wood.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
