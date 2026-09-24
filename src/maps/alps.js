/*
 * alps.js: a Swiss valley for the wing.
 *
 * The airfield is flat because a first wing needs nothing in the way.
 * This is the opposite: a glacial valley six kilometres long, a floor of
 * meadow with a grass strip and a village on it, pine on the lower
 * slopes, rock above, snow on the ridges a kilometre and more over the
 * floor, a side valley opening off the east wall, a lake at the southern
 * foot and a range of higher peaks beyond. A wing at cruise crosses the
 * floor in twenty seconds and needs the whole length to climb to a
 * ridge, which is what a valley is for.
 *
 * This file is the order things are built in and the contract the shell
 * reads. The parts live beside it in src/maps/alps/:
 *
 *   terrain.js   the valley's shape, paint and mesh, and the range beyond
 *   nature.js    the lake, the stream, the forests
 *   village.js   the road, the street, the buildings and the fences
 *   life.js      the traffic, the cattle and the windsock
 *   kit.js       what the village is built from
 *   ribbon.js    a surface laid along a line over the ground
 *   noise.js     the seeded noise all of it is shaped with
 *
 * Everything reads one heightfield through ctx.heightAt, so the ground
 * the wing lands on is the ground it sees, and the shell samples the same
 * function under the craft every step to lay its physics plane with the
 * slope it finds there. Shapes are procedural and seeded, the same valley
 * on every load, and none of it touches the step clock: the plant never
 * reads these files.
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
import { Colliders } from '../game/collide.js';
import { disposeSceneGraph } from '../render/shell.js';
import { SESSION_TEXTURES } from '../render/session-textures.js';
import { celMaterial } from '../render/celmat.js';
import { skyDome } from '../render/scene.js';
import { attachComposer } from './field.js';
import { yieldToPaint } from '../ui/loading.js';
import { qualityFor } from '../render/quality.js';
import { str } from '../strings/index.js';
import { makeRng } from './alps/noise.js';
import {
  HALF, CELL, STRIP_L, STRIP_W, STRIP_Y, LAKE_Y,
  valleyAxis, buildHeightfield, groundTexture, terrainMesh, farRange,
} from './alps/terrain.js';
import { buildNature } from './alps/nature.js';
import { buildVillage, villageMaterials } from './alps/village.js';
import { buildLife } from './alps/life.js';

/* The wing spawns on the strip facing north, down the valley. Yaw 0 is
 * forward along -z, see src/render/frame.js. */
const SPAWN = { x: 0, z: 40, yaw: 0 };

/* Alpine haze: the sky the field flies under, a longer fog so the far
 * ridges dissolve rather than end, and a camera that can see them. */
const HORIZON = 0xe9eef5;
const SUN_DIR = new THREE.Vector3(0.45, 0.62, 0.64).normalize();
const FOG_NEAR = 1200;
const FOG_FAR = 9000;
const CAMERA_FAR = 14000;

async function buildAlps(shell, progress, q) {
  const renderer = shell.renderer;
  const camera = shell.camera;
  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(HORIZON);
  scene.fog = new THREE.Fog(HORIZON, FOG_NEAR, FOG_FAR);
  const sky = skyDome();
  sky.layers.set(1);
  scene.add(sky);
  camera.far = CAMERA_FAR;
  camera.updateProjectionMatrix();

  const sun = new THREE.DirectionalLight(0xfff1dc, 1.5);
  sun.castShadow = q.shadows;
  const shadowMap = q.field.shadowMap || 2048;
  const shadowHalf = q.field.shadowHalf || 72;
  sun.shadow.mapSize.set(shadowMap, shadowMap);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 600;
  sun.shadow.camera.left = -shadowHalf;
  sun.shadow.camera.right = shadowHalf;
  sun.shadow.camera.top = shadowHalf;
  sun.shadow.camera.bottom = -shadowHalf;
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 0.05;
  scene.add(sun);
  scene.add(sun.target);
  scene.add(new THREE.HemisphereLight(0xa9c4e6, 0x55703a, 0.5));
  progress(0.1);
  await yieldToPaint();

  const field = buildHeightfield();
  scene.add(terrainMesh(field, groundTexture(field)));
  const far = farRange(field);
  scene.add(far.mesh);
  progress(0.45);
  await yieldToPaint();

  /* The strip, on the flat the terrain holds for it. */
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(STRIP_W, STRIP_L),
    celMaterial({ color: 0x8fb04a, rim: 0 }),
  );
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(0, STRIP_Y, 0);
  strip.receiveShadow = true;
  scene.add(strip);

  /*
   * What the parts are handed. Each gets its own seeded rng so a change
   * in one part's draws does not move the others; the colliders and the
   * scene are shared, and the paint hook lets a long part let the loading
   * bar breathe.
   */
  const colliders = new Colliders();
  const heightAt = (x, z) => field.height(x, z);
  const mats = villageMaterials();
  const paint = async (fraction) => {
    progress(fraction);
    await yieldToPaint();
  };
  const base = { scene, heightAt, valleyAxis, colliders, mats, paint };

  const nature = await buildNature({ ...base, rng: makeRng(20260924) });
  const village = await buildVillage({ ...base, rng: makeRng(20260925) });
  const life = buildLife({
    ...base, rng: makeRng(20260926), road: village.road, onGround: village.onGround, villageY: village.villageY,
  });
  colliders.build();
  progress(0.9);
  await yieldToPaint();

  scene.add(shell.quad);
  renderer.compile(scene, camera);
  progress(1);

  const shadowTexel = q.field.shadowMap > 0 ? (2 * shadowHalf) / q.field.shadowMap : 0;
  const shadowFocus = new THREE.Vector3();
  function updateShadowFocus(target) {
    if (shadowTexel > 0) {
      shadowFocus.set(
        Math.round(target.x / shadowTexel) * shadowTexel,
        Math.round(target.y / shadowTexel) * shadowTexel,
        Math.round(target.z / shadowTexel) * shadowTexel,
      );
    } else {
      shadowFocus.copy(target);
    }
    sun.position.copy(shadowFocus).addScaledVector(SUN_DIR, 260);
    sun.target.position.copy(shadowFocus);
    sun.target.updateMatrixWorld();
  }

  /*
   * The title shot: a long loop up the valley and back at a hundred and
   * fifty metres over whatever is under it, so the strip, the village,
   * the lake and the side valley each cross the frame once a lap.
   * scripts/attract-check.js walks it against the terrain.
   */
  const attractPath = [];
  for (let i = 0; i < 36; i += 1) {
    const a = (i / 36) * Math.PI * 2;
    const x = Math.sin(a) * 260;
    const z = Math.cos(a) * 1500 + 200;
    attractPath.push({ x, y: field.height(x, z) + 150, z });
  }

  /* The relief the world is claimed to have, measured off the built
   * field rather than restated from the constants. */
  let floorWidth = 0;
  for (let x = -HALF; x <= HALF; x += CELL) {
    if (field.height(x, SPAWN.z) < 60) {
      floorWidth += CELL;
    }
  }
  let ridge = 0;
  for (let k = 0; k < field.data.length; k += 1) {
    ridge = Math.max(ridge, field.data[k]);
  }

  const AIM = { active: false, sceneIndex: -1, correct: true, distance: 0 };
  return {
    id: 'alps',
    name: str('registry.the_alps'),
    mode: 'freestyle',
    graphics: q.id,
    scene,
    colliders,
    gates: [],
    curve: null,
    spawn: SPAWN,
    notes: [],
    attract: {
      path: attractPath,
      speed: 22,
      lookAhead: 40,
      aimDrop: 8,
    },
    /* The terrain itself, plus the strip's two centimetres and the lake's
     * surface: a wing that lands on the water rests on it rather than in
     * the basin. fromY is taken for the shell's call shape and ignored:
     * nothing here is a deck a craft could be under. */
    height: (x, z) => {
      /* Inside the field the far range sits under the valley's ground, so
       * the higher of the two is the ground. Outside it only the far range
       * is drawn: the heightfield there is its own edge clamped outward, an
       * invisible floor that is not what the pilot sees. */
      const inField = Math.abs(x) <= HALF && Math.abs(z) <= HALF;
      const h = inField ? Math.max(field.height(x, z), far.height(x, z)) : far.height(x, z);
      if (Math.abs(x) <= STRIP_W / 2 && Math.abs(z) <= STRIP_L / 2) {
        return Math.max(h, STRIP_Y);
      }
      return h < LAKE_Y ? LAKE_Y : h;
    },
    setNextGate() {},
    targetAim: () => AIM,
    approachSide: () => null,
    hasRacingLine: false,
    setRacingLine() {},
    updateRacingLine() { return null; },
    updateShadowFocus,
    updateWind: life.updateWind,
    updateAnim: life.updateAnim,
    references: {
      valleyFloorWidth: {
        measured: floorWidth,
        unit: 'm',
        real: str('references.400_to_1000'),
      },
      ridgeOverFloor: {
        measured: Math.round(ridge),
        unit: 'm',
        real: str('references.1000_to_1500'),
      },
      stripLength: {
        measured: strip.geometry.parameters.height,
        unit: 'm',
        real: '160',
      },
    },
    stats: () => ({
      colliders: colliders.stats(),
      pines: nature.pines,
      broadleaf: nature.broadleaf,
      houses: village.houses,
      cars: life.movers + life.parked,
      cattle: life.cattle,
    }),
    dispose() {
      shell.evictSessionRoots(scene);
      disposeSceneGraph(scene, SESSION_TEXTURES);
    },
  };
}

/* The race field's composer on top, and its dispose folded into ours, the
 * same as the airfield. */
export async function buildMap(shell, onProgress, options) {
  const progress = onProgress ?? (() => {});
  const q = qualityFor(options && options.quality);
  return attachComposer(shell, await buildAlps(shell, progress, q), q);
}
