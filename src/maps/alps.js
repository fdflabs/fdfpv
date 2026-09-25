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
 *   look.js      where the parts get their materials
 *   ribbon.js    a surface laid along a line over the ground
 *   noise.js     the seeded noise all of it is shaped with
 *
 * The order and the contract are shared by every look of the valley.
 * buildValley takes a style: the stage it is lit on, the ground it is
 * painted with, the look its parts ask for materials, the nature it
 * grows and the post chain it is seen through. The cel style is here;
 * src/maps/swiss2.js is the same valley drawn to read as a photograph.
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
import { skyDome } from '../render/scene.js';
import { attachComposer } from './field.js';
import { yieldToPaint } from '../ui/loading.js';
import { qualityFor } from '../render/quality.js';
import { str } from '../strings/index.js';
import { makeRng } from './alps/noise.js';
import {
  HALF, CELL, STRIP_L, STRIP_W, STRIP_Y, LAKE_Y,
  valleyAxis, buildHeightfield, groundTexture, terrainMesh, farRange, groundZone,
} from './alps/terrain.js';
import { buildNature } from './alps/nature.js';
import { buildVillage, villageMaterials } from './alps/village.js';
import { makeRoofs } from './alps/roofs.js';
import { buildLife } from './alps/life.js';
import { CEL_LOOK } from './alps/look.js';

/* The wing spawns on the strip facing north, down the valley. Yaw 0 is
 * forward along -z, see src/render/frame.js. */
export const SPAWN = { x: 0, z: 40, yaw: 0 };

/* Alpine haze: the sky the field flies under, a longer fog so the far
 * ridges dissolve rather than end, and a camera that can see them. */
const HORIZON = 0xe9eef5;
const SUN_DIR = new THREE.Vector3(0.45, 0.62, 0.64).normalize();
const FOG_NEAR = 1200;
const FOG_FAR = 9000;
const CAMERA_FAR = 14000;

/*
 * The cel style: the sky dome, a sun whose shadow box follows the craft,
 * the painted ground, the cel look, the nature as nature.js grows it and
 * the race field's ink and bloom chain on top.
 */
const CEL_STYLE = {
  id: 'alps',
  name: () => str('registry.the_alps'),
  look: CEL_LOOK,
  mats: villageMaterials,
  stage(shell, q) {
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
    return { scene, updateShadowFocus };
  },
  ground(field) {
    return terrainMesh(field, groundTexture(field));
  },
  nature: buildNature,
  compose: attachComposer,
};

/*
 * Build the valley in a style. The stage, the ground and the range
 * beyond, the strip, then the parts in the order they have always been
 * built in, each with a seeded rng of its own, so every style stands the
 * same village on the same ground.
 */
export async function buildValley(shell, progress, q, style) {
  const renderer = shell.renderer;
  const camera = shell.camera;
  const stage = await style.stage(shell, q);
  const { scene } = stage;
  progress(0.1);
  await yieldToPaint();

  /* A style may bring its own field (swiss2's walls, swiss2/terrain.js);
   * the cel style reads the valley's own. */
  const field = style.heightfield ? style.heightfield() : buildHeightfield();
  scene.add(await style.ground(field, stage));
  const far = farRange(field, style.look);
  scene.add(far.mesh);
  progress(0.45);
  await yieldToPaint();

  /* The strip, on the flat the terrain holds for it. */
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(STRIP_W, STRIP_L),
    style.look.material('strip', { color: 0x8fb04a, rim: 0 }),
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
  const mats = style.mats();
  const paint = async (fraction) => {
    progress(fraction);
    await yieldToPaint();
  };
  const base = { scene, heightAt, valleyAxis, colliders, mats, paint, look: style.look };

  const nature = await style.nature({ ...base, rng: makeRng(20260924), stage, field, renderer, quality: q, camera });
  const village = await buildVillage({ ...base, rng: makeRng(20260925) });
  const life = buildLife({
    ...base, rng: makeRng(20260926), road: village.road, onGround: village.onGround, villageY: village.villageY,
    roofs: village.roofs,
  });
  /* A style's finish sees the whole built world, the village's walls
   * among the colliders included, and may still add colliders of its
   * own, so the broadphase is built after it, and roofs of its own, into
   * the village's list. */
  if (style.finish) {
    await style.finish(scene, stage, {
      field, far, colliders, heightAt, nature, roofs: village.roofs,
    });
  }
  colliders.build();
  /* Every roof the valley has, the village's, the farm's, the gondola's
   * and a style's own, as ground a craft can land on (alps/roofs.js). */
  const roofs = makeRoofs(village.roofs);
  progress(0.9);
  await yieldToPaint();

  scene.add(shell.quad);
  renderer.compile(scene, camera);
  progress(1);

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
  const zone = {};
  /* The terrain, the strip and the lake, with no roof. */
  const ground = (x, z) => {
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
  };
  /* The ground's material off the painted zones. */
  const terrainSurface = (x, z) => {
    if (!(Math.abs(x) <= HALF && Math.abs(z) <= HALF)) {
      return 'rock';
    }
    if (Math.abs(x) <= STRIP_W / 2 && Math.abs(z) <= STRIP_L / 2) {
      return 'grass';
    }
    groundZone(field, x, z, 2, zone);
    if (zone.snow > 0.5) {
      return 'snow';
    }
    if (zone.rock > 0.5 || zone.scree > 0.5) {
      return 'rock';
    }
    if (zone.lake && zone.shore > 0.5) {
      return 'dirt';
    }
    return 'grass';
  };
  return {
    id: style.id,
    name: style.name(),
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
     * the basin. And the roofs: the highest within a step of fromY, the
     * city's rule, so a craft over a roof lands on it and one under the
     * eaves does not (alps/roofs.js). */
    height: (x, z, fromY) => roofs.height(x, z, fromY, ground(x, z)),
    /* The shell's obstacle pass, every pass: while a roof is the craft's
     * ground, the walls under it let the sweep through (roofs.js). */
    cover: (x, z, fromY) => roofs.cover(colliders, x, z, fromY),
    roofs: roofs.records,
    roofTop: (i, x, z) => roofs.top(i, x, z),
    /* What a roof the craft is on covers, for the crash physics' solids. */
    coveredAt: (x, z, fromY) => roofs.covered(x, z, fromY),
    /* What the ground is, for the crash physics (src/game/crashworld.js):
     * a roof's covering where y is a roof's top, else read off the same
     * zones the ground is painted by, so the snow a wing digs into is the
     * snow on screen. The far range is rock. */
    surfaceAt: (x, z, y) => (y == null ? null : roofs.materialAt(x, z, y)) ?? terrainSurface(x, z),
    setNextGate() {},
    targetAim: () => AIM,
    approachSide: () => null,
    hasRacingLine: false,
    setRacingLine() {},
    updateRacingLine() { return null; },
    updateShadowFocus: stage.updateShadowFocus,
    updateWind(t, focus, wash) {
      life.updateWind(t, focus, wash);
      if (nature.updateWind) {
        nature.updateWind(t, focus, wash);
      }
    },
    updateAnim: life.updateAnim,
    /* The plant's waves on the lake: the shell hands them over at every
     * reset in the map's frame, and the sim clock every drawn frame
     * (src/render/lakewaves.js). probeWater is the drawn surface's height
     * at a point, for the check that it is the plant's. */
    setWaves(bodies) {
      if (nature.setWaves) {
        nature.setWaves(bodies);
      }
    },
    updateWaves(t, craft) {
      if (nature.updateWaves) {
        nature.updateWaves(t, craft);
      }
    },
    probeWater: (x, z) => (nature.probeWater ? nature.probeWater(x, z) : null),
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
      if (nature.disposeWaves) {
        nature.disposeWaves();
      }
      shell.evictSessionRoots(scene);
      disposeSceneGraph(scene, SESSION_TEXTURES);
      if (stage.dispose) {
        stage.dispose();
      }
    },
  };
}

/* The race field's composer on top, and its dispose folded into ours, the
 * same as the airfield. */
export async function buildMap(shell, onProgress, options) {
  const progress = onProgress ?? (() => {});
  const q = qualityFor(options && options.quality);
  return CEL_STYLE.compose(shell, await buildValley(shell, progress, q, CEL_STYLE), q);
}
