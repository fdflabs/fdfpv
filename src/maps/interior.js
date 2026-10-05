/*
 * interior.js: the Interior, The Interior campaign's map (docs/campaign/
 * interior/, TECH-NEEDS N1, N2, N21): Mission 1's corridor of a 16 km
 * square of northern ranch land, forest and river, the land real and
 * everything on it invented. IN DEVELOPMENT: Mission 1's places only.
 *
 * WHAT IT IS BUILT FROM. The ground, the land cover and the river are the
 * room's own bytes and data in src/share/interior/ (world.js, hydro.js),
 * so the room and every screen stand a person on the same ground and see
 * the same trees (canopy.js); everything the story put there is
 * places.js's. Nothing is fetched from a data repository: the whole
 * shared ground is under 2 MB.
 *
 *   interior/terrain.js  the ground on the streamed terrain engine, its
 *                        tiles cut from height.bin in memory
 *   interior/look.js     the sun at the mission's hour, the sky, the air,
 *                        the post chain (Itaipu's sky, swiss2's kit)
 *   interior/ground.js   the ground's material, from the land cover
 *   interior/trees.js    the canopy drawn from canopy.js's own trees
 *   interior/built.js    roads, the river, the bridge, the buildings,
 *                        Pista Cero and the camp's fixed parts, with
 *                        their colliders and roofs
 *
 * TIME OF DAY: options.hour (a local solar hour, 16.6667 for Mission 1's
 * 16:40), or ?hour= in the address, else 16:40; map.setLocalTime(h)
 * moves the sun afterwards (look.js). The room's clock owns the hour
 * (src/share/interior/clock.js).
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

import * as THREE from 'three';
import { Colliders } from '../game/collide.js';
import { disposeSceneGraph } from '../render/shell.js';
import { SESSION_TEXTURES } from '../render/session-textures.js';
import { yieldToPaint } from '../ui/loading.js';
import { qualityFor } from '../render/quality.js';
import { str } from '../strings/index.js';
import { makeRoofs } from './alps/roofs.js';
import { HALF, PLAY_HALF } from '../share/interior/frame.js';
import { makeWorld, fetchWorldBytes } from '../share/interior/world.js';
import { landEdit, PLACES, dirOf } from '../share/interior/places.js';
import { makeCanopy } from '../share/interior/canopy.js';
import { M1_CLOCK } from '../share/interior/clock.js';
import { buildTerrain, TERRAIN_Q } from './interior/terrain.js';
import { makeLook } from './interior/look.js';
import { buildTrees } from './interior/trees.js';
import { buildBuilt } from './interior/built.js';
import { buildLife } from './interior/life.js';

/* The phases buildMap names to the loading screen, in order. */
export const PHASES = ['data', 'heightmaps', 'vegetation', 'town', 'shaders'];

/* The facing a spawn's yaw stands for: 0 north (-z), a quarter turn
 * west (+yaw). */
const yawOf = ([dx, dz]) => Math.atan2(-dx, -dz);

/* Pista Cero's strip, facing up it (east north east): where a launch
 * starts, and the shell's spawn. */
const STRIP_DIR = dirOf(PLACES.pistaCero.at, [PLACES.pistaCero.at[0] + 460, PLACES.pistaCero.at[1] - 90]);
const SPAWN = {
  x: PLACES.pistaCero.at[0] - 180, z: PLACES.pistaCero.at[1] + 30, yaw: yawOf(STRIP_DIR),
};

/* The title's loop over the corridor: Pista Cero, Puente Doble, the
 * colonia, the cañada, Claro Viejo and back, at a survey height. */
const LOOP_KM = [[3.0, 2.0], [5.6, 7.7], [9.3, 6.2], [9.2, 8.8], [8.6, 9.5], [6.5, 6.0]];
function attractPath(world) {
  const out = [];
  const keys = LOOP_KM.map(([e, n]) => [e * 1000 - PLAY_HALF, PLAY_HALF - n * 1000]);
  for (let i = 0; i < keys.length; i += 1) {
    const [ax, az] = keys[i];
    const [bx, bz] = keys[(i + 1) % keys.length];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 100));
    for (let k = 0; k < n; k += 1) {
      const x = ax + ((bx - ax) * k) / n;
      const z = az + ((bz - az) * k) / n;
      out.push({ x, y: world.groundAt(x, z) + 320, z });
    }
  }
  return out;
}

function hourFor(options) {
  const fromOptions = options && Number(options.hour);
  if (Number.isFinite(fromOptions)) {
    return fromOptions;
  }
  const q = Number(new URLSearchParams(window.location.search).get('hour'));
  return Number.isFinite(q) && q > 0 ? q : M1_CLOCK.startHour;
}

async function buildInterior(shell, progress, q, hours) {
  const { renderer, camera } = shell;
  progress(0.02, 'data');
  const bytes = await fetchWorldBytes();
  const world = makeWorld({ ...bytes, edits: landEdit });
  const canopy = makeCanopy(world);
  const look = await makeLook({
    renderer, camera, q, hours, land: world.land,
  });
  const { scene } = look;
  progress(0.15, 'heightmaps');
  await yieldToPaint();
  const spawnAt = new THREE.Vector3(SPAWN.x, world.groundAt(SPAWN.x, SPAWN.z), SPAWN.z);
  const terrain = await buildTerrain({
    heights: world.heights,
    material: look.ground,
    scene,
    quality: TERRAIN_Q[q.id] || TERRAIN_Q.high,
    spawn: spawnAt,
    eye: spawnAt.clone(),
    progress: (f) => progress(0.15 + 0.35 * f),
  });
  const ground = world.groundAt;
  progress(0.5, 'vegetation');
  await yieldToPaint();
  const trees = buildTrees({
    THREE, scene, quality: q.id, canopy, world, sunDir: look.sunDir,
  });
  trees.setSun(look.sunIrradiance());
  progress(0.7, 'town');
  await yieldToPaint();
  const colliders = new Colliders();
  const roofRecords = [];
  const built = await buildBuilt({
    THREE, scene, world, colliders, roofs: roofRecords,
  });
  const life = buildLife({
    THREE, scene, world, colliders, roofs: roofRecords,
  });
  colliders.build();
  life.setCamp({ mark: 'shelter-1', tarp: 0, mast: 0 });
  /* ?people=demo: every route's people at once, for the checks' views. */
  const demo = new URLSearchParams(window.location.search).get('people') === 'demo';
  const roofs = makeRoofs(roofRecords);
  look.setHeights(ground, PLAY_HALF + 500, 30);
  camera.position.copy(spawnAt).add(new THREE.Vector3(0, 2, 0));
  trees.settle(camera);
  look.finish();
  progress(0.93, 'shaders');
  scene.add(shell.quad);
  renderer.compile(scene, camera);
  progress(1);

  scene.userData.interior = {
    terrain, camera, look, world, canopy, trees, built, colliders, life,
  };
  const height = (x, z, fromY) => roofs.height(x, z, fromY, terrain.height(x, z));
  return {
    id: 'interior',
    name: str('registry.interior'),
    mode: 'freestyle',
    graphics: q.id,
    scene,
    colliders,
    gates: [],
    curve: null,
    spawn: SPAWN,
    notes: [],
    attract: {
      path: attractPath(world), speed: 30, lookAhead: 80, aimDrop: 40,
    },
    height,
    floorAt: (x, z, fromY) => roofs.height(x, z, fromY, ground(x, z)),
    cover: (x, z, fromY) => roofs.cover(colliders, x, z, fromY),
    roofs: roofs.records,
    roofTop: (i, x, z) => roofs.top(i, x, z),
    coveredAt: (x, z, fromY) => roofs.covered(x, z, fromY),
    roofSlabs: (x, z, fromY, reach, out) => roofs.slabs(x, z, fromY, reach, out),
    surfaceAt: (x, z, y) => (y == null ? null : roofs.materialAt(x, z, y)),
    /* Río Sereno as the plant's channel (src/game/water.js), so a float
     * lands on it and a wreck sinks in it. */
    rivers: built.rivers,
    /* The canopy: the highest crown over (x, z), for the contact pass. */
    canopyAt: (x, z) => canopy.crownTopAt(x, z),
    /* The room's contacts and the camp's state, drawn (life.js). */
    setContacts: (list, roomMs) => life.setContacts(list, roomMs),
    setCamp: (state) => life.setCamp(state),
    /* The room's clock moves the sun (look.js). */
    setLocalTime: (h) => trees.setSun(look.setLocalTime(h)),
    setNextGate() {},
    targetAim: () => ({ active: false, sceneIndex: -1, correct: true, distance: 0 }),
    approachSide: () => null,
    hasRacingLine: false,
    setRacingLine() {},
    updateRacingLine() { return null; },
    updateShadowFocus(target) {
      look.updateShadowFocus(target);
      terrain.update(target, camera.position);
      trees.view(camera, target);
      built.view(camera);
    },
    updateWind() {},
    updateAnim(step) {
      built.update(step);
      /* The physics' step count, a millisecond a step. */
      life.update(step / 1000);
      if (demo) {
        life.demo(step);
      }
    },
    stats: () => ({
      terrain: terrain.stats(),
      colliders: colliders.stats(),
      trees: trees.stats(),
      built: built.stats(),
      life: life.stats(),
    }),
    dispose() {
      terrain.dispose();
      trees.dispose();
      built.dispose();
      life.dispose();
      scene.userData.interior = null;
      shell.evictSessionRoots(scene);
      disposeSceneGraph(scene, SESSION_TEXTURES);
      look.dispose();
    },
    references: { square: { measured: 2 * HALF, unit: 'm', real: 'invented' } },
  };
}

export async function buildMap(shell, onProgress, options) {
  const progress = onProgress ?? (() => {});
  const q = qualityFor(options && options.quality);
  const map = await buildInterior(shell, progress, q, hourFor(options));
  return map.scene.userData.interior.look.compose(shell, map);
}
