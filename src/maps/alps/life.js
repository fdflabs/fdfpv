/*
 * life.js: what moves in the valley.
 *
 * The town's cars parked along the street and driving the road on the
 * wall clock, the cattle in the pastures, the windsock on the strip.
 * updateAnim moves the traffic on the step clock the shell hands it;
 * updateWind swings the sock on the wall clock. Nothing here is solid
 * to the wing but the parked cars.
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
import { celMaterial, updateCelTime } from '../../render/celmat.js';
import { makeVehicle, CAR } from '../city/vendored/world/vehicles.js';
import { makeBake, bakeAll, cow } from './kit.js';
import { alongRibbon } from './ribbon.js';
import { STRIP_W } from './terrain.js';

function windsock(mastMat) {
  const g = new THREE.Group();
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 4.5, 8), mastMat);
  mast.position.y = 2.25;
  mast.castShadow = true;
  g.add(mast);
  const pivot = new THREE.Group();
  pivot.position.y = 4.5;
  const geo = new THREE.CylinderGeometry(0.28, 0.09, 1.8, 10, 1, true);
  geo.translate(0, -0.9, 0);
  geo.rotateZ(-Math.PI / 2);
  const sock = new THREE.Mesh(geo, celMaterial({ color: 0xf07a1a, rim: 0.1, side: THREE.DoubleSide }));
  sock.castShadow = true;
  pivot.add(sock);
  g.add(pivot);
  return { group: g, pivot };
}

/*
 * Build the traffic, the cattle and the sock into ctx.scene. ctx carries
 * heightAt, a seeded rng, the colliders, the materials, the road ribbon
 * from the village and the village's onGround. Returns the two update
 * hooks and the counts.
 */
export function buildLife(ctx) {
  const { scene, heightAt, rng, colliders, mats, road, onGround, villageY } = ctx;
  /*
   * CARS: the town's, parked along the village street and outside the
   * hangar, and a handful driving the valley road on the wall clock.
   */
  const kinds = ['hatch', 'sedan', 'wagon', 'minivan', 'van', 'kei', 'keitruck', 'boxtruck'];
  const colours = [CAR.white, CAR.silver, CAR.wine, CAR.forest, CAR.skyblue, CAR.cream, CAR.slate];
  let parked = 0;
  const parkAt = (x, z, ry) => {
    const kind = kinds[Math.floor(rng() * kinds.length)];
    const y = heightAt(x, z);
    scene.add(makeVehicle({ kind, color: colours[Math.floor(rng() * colours.length)], x, y: y + 0.02, z, ry }));
    colliders.addBox('wall', x - 2.3, y, z - 2.3, x + 2.3, y + 1.6, z + 2.3);
    parked += 1;
  };
  for (let k = 0; k < 7; k += 1) {
    parkAt(-45 - k * 26, 120.5, Math.PI + (rng() - 0.5) * 0.2);
  }
  parkAt(64, -46, Math.PI / 2);
  parkAt(64, -52, Math.PI / 2);
  parkAt(14, 92, 0);
  const movers = [];
  for (let k = 0; k < 6; k += 1) {
    const dir = k % 2 === 0 ? 1 : -1;
    const kind = kinds[Math.floor(rng() * 5)];
    const v = makeVehicle({ kind, color: colours[Math.floor(rng() * colours.length)], x: 0, y: 0, z: 0, ry: 0 });
    scene.add(v);
    movers.push({ group: v, dir, offset: k * 780 + rng() * 200, lane: dir * 1.7 });
  }
  const roadLen = road.dist[road.dist.length - 1];
  function placeMovers(tMs) {
    for (const mv of movers) {
      const run = (mv.offset + tMs * 0.014) % roadLen;
      const at = alongRibbon(road, mv.dir > 0 ? run : roadLen - run);
      const nx = -Math.sin(at.yaw);
      const nz = -Math.cos(at.yaw);
      const px = at.x + nx * mv.lane;
      const pz = at.z + nz * mv.lane;
      mv.group.position.set(px, heightAt(px, pz) + 0.08, pz);
      mv.group.rotation.y = at.yaw + (mv.dir > 0 ? 0 : Math.PI);
    }
  }
  placeMovers(0);

  /* The cattle, on the real ground in the two fenced pastures. */
  const herd = makeBake();
  for (let k = 0; k < 34; k += 1) {
    const inNorth = k >= 20;
    const x = inNorth ? -40 - rng() * 170 : -60 - rng() * 190;
    const z = inNorth ? -165 - rng() * 120 : 215 + rng() * 100;
    cow(herd, rng, { x, y: onGround(x, z), z, ry: rng() * Math.PI * 2 });
  }
  const herdGroup = bakeAll(herd, mats);
  herdGroup.position.y = villageY;
  scene.add(herdGroup);

  const sock = windsock(mats.metal);
  sock.group.position.set(STRIP_W / 2 + 6, heightAt(STRIP_W / 2 + 6, 30), 30);
  scene.add(sock.group);
  colliders.addPost('pole', STRIP_W / 2 + 6, 30, sock.group.position.y, sock.group.position.y + 4.5, 0.045);

  /* Wall clock decoration only: the sock swings to a valley wind that
   * blows up the valley by day. Nothing here is solid. */
  function updateWind(t) {
    updateCelTime(t);
    sock.pivot.rotation.y = Math.PI * 0.5 + Math.sin(t * 0.31) * 0.3 + Math.sin(t * 1.7) * 0.05;
    sock.pivot.rotation.z = -0.25 + Math.sin(t * 0.57) * 0.12;
  }

  return { updateAnim: placeMovers, updateWind, parked, movers: movers.length, cattle: 34 };
}
