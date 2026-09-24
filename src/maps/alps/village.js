/*
 * village.js: the road, the street and what stands along them.
 *
 * Thirty chalets in two rows either side of a street, the church at
 * the west end, two barns in the pasture, the hangar across the strip
 * and the fences round the fields, all from kit.js and baked into one
 * mesh per material. Returns the road so the traffic can drive it.
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

import { villageMaterials, makeBake, bakeAll, chalet, barn, church, hangar, fence } from './kit.js';
import { ribbon } from './ribbon.js';

export { villageMaterials };

/*
 * Build the village into ctx.scene. ctx carries heightAt, valleyAxis, a
 * seeded rng of its own, the colliders, the materials and the progress
 * hook. Returns the road ribbon, the village's ground height, the baked
 * group and the house count.
 */
export async function buildVillage(ctx) {
  const { scene, heightAt, valleyAxis, rng, colliders, mats } = ctx;
  /*
   * THE ROAD, down the east side of the floor from the head of the valley
   * to the lake shore, two lanes of asphalt with a painted centre line,
   * following the valley's own axis. The village street branches off it
   * across the south end of the strip.
   */
  const roadPts = [];
  for (let z = -2700; z <= 1950; z += 50) {
    roadPts.push({ x: valleyAxis(z) + 55, z });
  }
  const road = ribbon(roadPts, 6.5, 0.06, heightAt, mats.asphalt);
  scene.add(road.mesh);
  scene.add(ribbon(roadPts, 0.18, 0.09, heightAt, mats.paint).mesh);
  const streetPts = [];
  for (let x = valleyAxis(115) + 55; x >= -200; x -= 20) {
    streetPts.push({ x, z: 115 });
  }
  scene.add(ribbon(streetPts, 5, 0.06, heightAt, mats.asphalt).mesh);

  /*
   * THE VILLAGE: chalets along both sides of the street, a second row
   * behind, the church at the west end, two barns out in the pasture, the
   * hangar across the strip with its door on the apron. The plateau under
   * it is flat to a few centimetres, so the whole village is baked at one
   * height and drawn as one mesh per material.
   */
  const village = makeBake();
  const walls = [];
  let houses = 0;
  const villageY = heightAt(-90, 115);
  const placeChalet = (x, z, ry, w, d) => {
    const h = chalet(village, rng, { x, z, ry, w, d });
    walls.push({ x0: x - h.halfW, z0: z - h.halfD, x1: x + h.halfW, z1: z + h.halfD, top: h.top, y: villageY });
    houses += 1;
  };
  for (let k = 0; k < 7; k += 1) {
    const x = -38 - k * 24 - rng() * 4;
    placeChalet(x, 128 + rng() * 6, Math.PI / 2 + (rng() - 0.5) * 0.25, 8.5 + rng() * 2.5, 11 + rng() * 4);
    placeChalet(x - 6, 96 - rng() * 6, -Math.PI / 2 + (rng() - 0.5) * 0.25, 8.5 + rng() * 2.5, 11 + rng() * 4);
  }
  for (let k = 0; k < 5; k += 1) {
    const x = -50 - k * 30 - rng() * 6;
    placeChalet(x, 162 + rng() * 10, (rng() - 0.5) * 0.4, 8 + rng() * 2, 10 + rng() * 3);
    placeChalet(x - 8, 60 - rng() * 10, Math.PI + (rng() - 0.5) * 0.4, 8 + rng() * 2, 10 + rng() * 3);
  }
  const kirche = church(village, { x: -232, z: 112, ry: Math.PI / 2 });
  walls.push({ x0: -232 - kirche.halfD, z0: 112 - kirche.halfW, x1: -232 + kirche.halfD, z1: 112 + kirche.halfW, top: 9, y: villageY });
  walls.push({ x0: kirche.towerX - 3, z0: kirche.towerZ - 3, x1: kirche.towerX + 3, z1: kirche.towerZ + 3, top: kirche.top, y: villageY });
  for (const b of [{ x: -150, z: 240, ry: 0.3 }, { x: -60, z: -195, ry: -0.2 }]) {
    const h = barn(village, b);
    walls.push({ x0: b.x - h.halfW, z0: b.z - h.halfD, x1: b.x + h.halfW, z1: b.z + h.halfD, top: h.top, y: villageY });
  }
  const hang = hangar(village, { x: 42, z: -70, ry: -Math.PI / 2 });
  walls.push({ x0: 42 - hang.halfD, z0: -70 - hang.halfW, x1: 42 + hang.halfD, z1: -70 + hang.halfW, top: hang.top, y: villageY });
  /* Fields: fence lines round the pastures the cattle stand in. Fences
   * and cattle stand on the real ground, so they carry their own height
   * and the bake's shared height is taken back off them. */
  const onGround = (x, z) => heightAt(x, z) - villageY;
  fence(village, onGround, -40, 195, -260, 205);
  fence(village, onGround, -260, 205, -270, 335);
  fence(village, onGround, -270, 335, -30, 325);
  fence(village, onGround, -30, 325, -40, 195);
  fence(village, onGround, -10, -145, -230, -155);
  fence(village, onGround, -230, -155, -240, -295);
  const villageGroup = bakeAll(village, mats);
  villageGroup.position.y = villageY;
  scene.add(villageGroup);
  for (const wl of walls) {
    colliders.addBox('wall', wl.x0, wl.y, wl.z0, wl.x1, wl.y + wl.top, wl.z1);
  }
  await ctx.paint(0.7);

  return { road, villageY, group: villageGroup, houses, onGround };
}
