/*
 * ambient.js: the ordinary life of Mission 1's corridor (TECH-NEEDS N21,
 * MISSIONS.md M1 stage 2): cattle on the pastures of Sector Alpha and
 * Sector Bravo, workers by a tractor and a parked harvester in a field
 * beside the colonia, a family outside a house. Decoration on the wall
 * clock, as the Alps' fauna is (src/maps/alps/fauna.js): nothing here is
 * a contact, nothing a pilot classifies, the same nowhere but on this
 * screen. The machines stand still and are solid; the animals and the
 * people are not.
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
import { gridToWorld } from '../../share/interior/frame.js';
import { BUILDINGS } from '../../share/interior/places.js';
import { hash01 } from '../../share/interior/canopy.js';
import { thermalKind } from '../thermal.js';

/* Herds: a home in the design grid, a head count, how far they spread. */
const HERDS = [
  { at: [9.95, 5.7], n: 26, spread: 140 },
  { at: [4.25, 6.85], n: 18, spread: 110 },
  { at: [6.9, 3.2], n: 14, spread: 90 },
];
/* The machines and their crew, in a field west of the colonia. */
const TRACTOR = { at: [8.32, 5.82], dir: [0.8, 0.6] };
const HARVESTER = { at: [8.37, 5.865], dir: [1, 0] };
/* Cattle coat colours, linear: white zebu, red, black, brindle. */
const COATS = [[0.55, 0.52, 0.46], [0.24, 0.1, 0.05], [0.05, 0.045, 0.04], [0.33, 0.25, 0.16], [0.6, 0.57, 0.5]];

function part(THREE, x, y, z, w, h, d, heat) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.deleteAttribute('uv');
  g.translate(x, y, z);
  const th = new Float32Array(g.attributes.position.count).fill(heat);
  g.setAttribute('thermal', new THREE.BufferAttribute(th, 1));
  return g;
}

/* A zebu cow, 2.2 m long, facing -z: warm all over (about 38 C). */
function cowGeometry(THREE) {
  return mergeGeometries([
    part(THREE, 0, 1.0, 0, 0.62, 0.62, 1.7, 0.08),
    part(THREE, 0, 1.38, -0.45, 0.4, 0.22, 0.35, 0.08),
    part(THREE, 0, 1.05, -1.0, 0.3, 0.32, 0.5, 0.09),
    ...[[-0.2, -0.6], [0.2, -0.6], [-0.2, 0.62], [0.2, 0.62]].map(([x, z]) => part(THREE, x, 0.36, z, 0.13, 0.72, 0.13, 0.06)),
  ]);
}

function box(THREE, sinkList, cx, cz, dx, dz, w, d, y0, y1, colour) {
  const g = new THREE.BoxGeometry(w, y1 - y0, d).toNonIndexed();
  g.deleteAttribute('uv');
  g.rotateY(Math.atan2(dx, dz) - Math.PI / 2);
  g.translate(cx, (y0 + y1) / 2, cz);
  const col = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < g.attributes.position.count; i += 1) {
    col.set(colour, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  sinkList.push(g);
}

/* The turned box solid for box() above. */
function solidBox(colliders, cx, cz, dx, dz, w, d, y0, y1) {
  const u = cx * dx + cz * dz;
  const v = -cx * dz + cz * dx;
  return colliders.addTurnedBox('obstacle', dx, dz, u - w / 2, u + w / 2, y0, y1, v - d / 2, v + d / 2);
}

/*
 * The ambient world: { group, update(seconds, figures), people(seconds),
 * stats(), dispose() }. `people(seconds)` is the workers' and the
 * family's poses, for the map to hand to figures.js with the contacts.
 */
export function buildAmbient({
  THREE, world, colliders,
}) {
  const ground = world.groundAt;
  const group = new THREE.Group();
  group.name = 'interior-ambient';
  const cows = [];
  HERDS.forEach((h, hi) => {
    const [hx, hz] = gridToWorld(...h.at);
    for (let k = 0; k < h.n; k += 1) {
      cows.push({
        x: hx + (hash01(hi, k, 51) - 0.5) * h.spread,
        z: hz + (hash01(hi, k, 52) - 0.5) * h.spread,
        phase: hash01(hi, k, 53) * 100,
        coat: COATS[Math.floor(hash01(hi, k, 54) * COATS.length)],
        heading: hash01(hi, k, 55) * 6.283,
      });
    }
  });
  const cowMat = thermalKind(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), 'hot', { attr: true });
  const herd = new THREE.InstancedMesh(cowGeometry(THREE), cowMat, cows.length);
  herd.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cows.length * 3), 3);
  herd.name = 'interior-cattle';
  herd.castShadow = true;
  herd.frustumCulled = false;
  group.add(herd);
  const col = new THREE.Color();
  cows.forEach((c, k) => herd.setColorAt(k, col.setRGB(...c.coat)));

  /* The machines: a tractor and a harvester, solid. */
  const parts = [];
  let solids = 0;
  {
    const [x, z] = gridToWorld(...TRACTOR.at);
    const [dx, dz] = TRACTOR.dir;
    const g = ground(x, z);
    box(THREE, parts, x, z, dx, dz, 3.6, 1.9, g + 0.4, g + 1.6, [0.35, 0.05, 0.03]);
    box(THREE, parts, x - dx * 0.6, z - dz * 0.6, dx, dz, 1.2, 1.4, g + 1.6, g + 2.7, [0.08, 0.08, 0.08]);
    box(THREE, parts, x - dx * 1.1, z - dz * 1.1, dx, dz, 1.4, 2.3, g, g + 1.6, [0.03, 0.03, 0.03]);
    solidBox(colliders, x, z, dx, dz, 3.6, 2.3, g - 0.1, g + 1.6);
    solidBox(colliders, x - dx * 0.6, z - dz * 0.6, dx, dz, 1.2, 1.4, g + 1.6, g + 2.7);
    solids += 2;
  }
  {
    const [x, z] = gridToWorld(...HARVESTER.at);
    const [dx, dz] = HARVESTER.dir;
    const g = ground(x, z);
    box(THREE, parts, x, z, dx, dz, 7.5, 3.3, g + 0.5, g + 3.4, [0.12, 0.3, 0.08]);
    box(THREE, parts, x + dx * 4.6, z + dz * 4.6, dx, dz, 1.8, 6.5, g + 0.3, g + 1.3, [0.32, 0.28, 0.06]);
    box(THREE, parts, x - dx * 1.2, z - dz * 1.2, dx, dz, 1.8, 1.6, g + 3.4, g + 4.4, [0.06, 0.07, 0.08]);
    solidBox(colliders, x, z, dx, dz, 7.5, 3.3, g - 0.1, g + 3.4);
    solidBox(colliders, x + dx * 4.6, z + dz * 4.6, dx, dz, 1.8, 6.5, g + 0.3, g + 1.3);
    solidBox(colliders, x - dx * 1.2, z - dz * 1.2, dx, dz, 1.8, 1.6, g + 3.4, g + 4.4);
    solids += 3;
  }
  const machineMat = thermalKind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4 }), 'built');
  const machines = new THREE.Mesh(mergeGeometries(parts), machineMat);
  machines.name = 'interior-machines';
  machines.castShadow = true;
  machines.receiveShadow = true;
  group.add(machines);

  /* The crew and the family. */
  const [tx, tz] = gridToWorld(...TRACTOR.at);
  const house = BUILDINGS.find((b) => b.id === 'colonia-house-3');
  const crew = [
    { x: tx + 3, z: tz + 2, action: 'stand', tint: [0.2, 0.3, 0.5] },
    { x: tx + 5, z: tz - 1, action: 'crouchTarp', tint: [0.5, 0.45, 0.3] },
    { x: tx + 1, z: tz + 4, action: 'walk', walk: 6, tint: [0.6, 0.6, 0.55] },
    { x: house.at[0] + 6, z: house.at[1] + 2, action: 'sit', tint: [0.6, 0.2, 0.2] },
    { x: house.at[0] + 7, z: house.at[1] + 3.5, action: 'sit', tint: [0.3, 0.35, 0.6] },
    { x: house.at[0] + 4, z: house.at[1] + 5, action: 'walk', walk: 4, scale: 0.62, tint: [0.75, 0.6, 0.2] },
  ];

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  return {
    group,
    /* The herd grazes, a few metres a minute, on the wall clock. */
    update(seconds) {
      cows.forEach((c, k) => {
        const t = seconds / 40 + c.phase;
        const x = c.x + Math.sin(t) * 6 + Math.sin(t * 0.37) * 9;
        const z = c.z + Math.cos(t * 0.8) * 6 + Math.cos(t * 0.29) * 9;
        const head = Math.atan2(Math.cos(t) * 6 + Math.cos(t * 0.37) * 3.3, -(-Math.sin(t * 0.8) * 4.8 - Math.sin(t * 0.29) * 2.6));
        q.setFromAxisAngle(up, -head);
        pos.set(x, ground(x, z), z);
        m4.compose(pos, q, one);
        herd.setMatrixAt(k, m4);
      });
      herd.instanceMatrix.needsUpdate = true;
    },
    people(seconds) {
      return crew.map((p, k) => {
        const walking = p.walk ? Math.sin(seconds / 6 + k) : 0;
        const x = p.x + walking * (p.walk || 0);
        const z = p.z;
        return {
          x, y: ground(x, z), z, heading: walking > 0 ? Math.PI / 2 : -Math.PI / 2, action: p.walk ? 'walk' : p.action, tint: p.tint, scale: p.scale,
        };
      });
    },
    stats: () => ({ cattle: cows.length, people: crew.length, solids }),
    dispose() {
      herd.geometry.dispose();
      machines.geometry.dispose();
      cowMat.dispose();
      machineMat.dispose();
      group.removeFromParent();
    },
  };
}
