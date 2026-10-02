/*
 * look/index.js: how Itaipu is drawn. swiss2's photographic style over
 * the terrain engine, src/maps/terrain/ (docs/ITAIPU-PLAN.md section 1,
 * point 5).
 *
 * From swiss2, unchanged and shared: the terrain photographs and the
 * surfaces (swiss2/assets.js), the material kit every part is handed
 * (swiss2/look.js makePhotoLook, as ctx.mats), the
 * sun's shadow cascades (swiss2/light.js makeSun, which takes its
 * direction), the post chain (swiss2/post.js: occlusion, aerial
 * perspective, the metered exposure, AgX, FXAA) and the photographed
 * craft (swiss2/craftlook.js).
 *
 * Itaipu's own: the sun, fixed to the satellite's, and the exposure
 * (light.js); the light injection, without the Alps' terrain shadow and
 * cloud deck, which are baked on the Alps' square (light.js says why); a
 * clear tropical sky, which is the environment too, and the air the post
 * chain is given (sky.js); and the ground, the satellite's colour with
 * swiss2's photographed grain under it (ground.js), finished where the
 * place asks for it: the canyon's basalt, the reservoir's margin and the
 * rockfill dam's faces; and the turf, blades of grass round a camera near
 * the ground (ground.js makeTurf).
 *
 * The low cloud swiss2 marches in its post chain is made and never handed
 * a terrain, so it draws nothing (clouds.js: until setTerrain, "the march
 * draws nothing"): the post chain takes one, and the day was clear.
 *
 * TIME OF DAY: `time`, makeLook's own option ('day', the default, or
 * 'night', for mission 4, "Night raid"), read from options.time when the
 * map is built (src/maps/itaipu.js buildMap) and from `?time=night` in
 * the address (src/main.js loadMap). It never changes after the map is
 * built: night.js's fixtures go up once, in buildMap, once every part is
 * in. What it touches: the sun (dim, cool, standing in for the moon) and
 * the sky (dark and starred, with the towns' glow, sky.js), both
 * light.js's; the lamps, the windows, the light pools every lit material
 * adds and the cities past the map (look/night.js), never the dam's, the
 * town's or the water's own geometry. setPower dims them district by
 * district as the war takes the grid down.
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
import { loadSurface, SURFACES } from '../../swiss2/assets.js';
import { makeSun } from '../../swiss2/light.js';
import { makePhotoLook, finishScene } from '../../swiss2/look.js';
import { buildPhotoComposer } from '../../swiss2/post.js';
import { makeClouds } from '../../swiss2/clouds.js';
import { photoCraftLook } from '../../swiss2/craftlook.js';
import {
  sunDirection, makeLit, sunFor, isNight, makeNightAmbient,
} from './light.js';
import { skyBackdrop, skyEnvironment, airFor } from './sky.js';
import {
  groundMaterial, makeTurf, noiseTexture, loadImage, loadSite, loadGroundArrays,
} from './ground.js';
import { dressNight } from './night.js';
import { thermalKind, thermalShader } from '../../../render/thermal.js';

/* Past the horizon from 500 m (80 km) the apron and the fog have it. */
export const CAMERA_FAR = 90000;

/*
 * THE FAR SHADOW MAP IS SIZED TO THE VIEW. swiss2's makeSun keeps its far
 * map 700 m either side of a point ahead of the camera, which from the
 * craft is the whole shadowed world; from 600 m up (the aerial views) it
 * was a patch near the frame's foot, and the dam's buttresses, the
 * powerhouse and every tree past it cast no shadow at all, where in the
 * photographs from the air the dam's shaded side is the darkest thing in
 * the frame. Once FAR_REACH times the camera's height over the ground
 * passes swiss2's FAR_HALF (from 280 m up), that is the map's half width,
 * to FAR_HALF_MAX; its texel
 * grows with it, so a high view's shadows are softer, as they are at that
 * distance anyway, and its normal bias with the texel so the coarser map
 * does not shade the ground it is cast on.
 */
const FAR_HALF = 700;
const FAR_REACH = 2.5;
const FAR_HALF_MAX = 2500;
const FAR_NORMAL_BIAS = 0.6;

/*
 * Load everything the look needs and make the scene it draws. `base` is
 * the data folder's URL. Returns the stage the map builds into.
 */
export async function makeLook({
  renderer, camera, q, base, manifest, time,
}) {
  const night = isNight(time);
  const sunLight = sunFor(time);
  const AIR = airFor(time);
  const owned = [];
  const own = (t) => {
    owned.push(t);
    return t;
  };
  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const layerPx = q.id === 'high' ? 1024 : 512;
  const im = manifest.imagery;
  const [arrays, site, heroCol, ringCol, heroMask, ringMask, ...sets] = await Promise.all([
    loadGroundArrays(layerPx, aniso),
    loadSite(base, manifest.frame.ring[1]),
    loadImage(`${base}${im.hero.file}`, true, aniso),
    loadImage(`${base}${im.ring.file}`, true, aniso),
    loadImage(`${base}${im.hero.masks}`, false, aniso),
    loadImage(`${base}${im.ring.masks}`, false, aniso),
    ...SURFACES.map((n) => loadSurface(n, aniso)),
  ]);
  for (const t of [arrays.col, arrays.nrh, site.reservoir, heroCol, ringCol, heroMask, ringMask]) {
    own(t);
  }
  const surfaces = {};
  SURFACES.forEach((n, k) => {
    surfaces[n] = sets[k];
    own(sets[k].col);
    own(sets[k].nrm);
    own(sets[k].arm);
  });

  const sunDir = sunDirection();
  const scene = new THREE.Scene();
  /* For whatever draws by the time of day without being handed the look:
   * the sensor's thermal weather (src/avionics/sensors.js). */
  scene.userData.timeOfDay = night ? 'night' : 'day';
  scene.background = AIR.haze.clone();
  const sky = skyBackdrop(sunDir, time);
  const envTarget = skyEnvironment(renderer, sky);
  scene.add(sky);
  scene.environment = envTarget.texture;
  camera.far = CAMERA_FAR;
  camera.updateProjectionMatrix();

  const sun = makeSun(scene, q, sunDir, sunLight);
  const clouds = makeClouds({
    sun: { direction: sunDir, ...sunLight },
    sky: AIR.haze,
    air: AIR,
  });
  /* Night's own low sky fill (light.js): the day has none, the sky's
   * environment map already carries its share (the module doc, THE
   * LIGHT IS THIS SKY). */
  const nightAmbient = night ? makeNightAmbient() : null;
  if (nightAmbient) {
    scene.add(nightAmbient);
  }
  const lit = makeLit();
  const noise = own(noiseTexture(aniso));
  const ground = groundMaterial({
    tex: {
      heroCol, ringCol, heroMask, ringMask,
    },
    arrays,
    site,
    heroHalf: manifest.frame.hero[1],
    ringHalf: manifest.frame.ring[1],
    white: im.colour.white,
    water: im.colour.water,
    noise,
  });
  /* The ground's heights on the hero's 10 m grid, for the kit's walls,
   * which weather by their height over the ground (swiss2/look.js
   * WEATHER_BODY): filled by setHeights once the terrain is in. */
  const heights = { texture: { value: null }, grid: { value: new THREE.Vector3() } };
  /* The blades round the camera (ground.js makeTurf), standing on those
   * heights: drawn once setHeights has them. */
  const turf = makeTurf({
    tex: { heroCol, heroMask },
    site,
    noise,
    heights,
    heroHalf: manifest.frame.hero[1],
    ringHalf: manifest.frame.ring[1],
    white: im.colour.white,
    renderer,
  });
  scene.add(turf.mesh);
  let groundAt = null;
  const look = makePhotoLook({
    surfaces,
    marks: {},
    ground: () => {
      throw new Error('itaipu look: the ground is the terrain\'s own material (look/ground.js), not a kit piece');
    },
    heights,
  });

  let nightFixtures = null;
  return {
    scene,
    sun,
    sunDir,
    lit,
    ground,
    time: night ? 'night' : 'day',
    /* Mission 4's own fixtures, once every part is in (itaipu.js, after
     * the parts loop): a no-op by day. See look/night.js. The ground's
     * material is lit too, though no terrain chunk may be in the scene's
     * graph yet. */
    dressNight(extras) {
      if (!night) {
        return;
      }
      nightFixtures = dressNight({
        scene, heights, materials: [ground], ...extras,
      });
    },
    /* Each power district's level (src/share/war/grid.js), from the
     * room's war: the night's lights dim with them. Nothing by day. */
    setPower(levels) {
      if (nightFixtures) {
        nightFixtures.setPower(levels);
      }
    },
    night: () => nightFixtures,
    /* ctx.mats: the photographic kit, the light every material goes
     * through, the surfaces' texture sets and the environment. */
    mats: {
      look,
      lit,
      surfaces,
      envMap: scene.environment,
      thermal: { kind: thermalKind, shader: thermalShader },
    },
    /* `height(x, z)` over the square [-half, half] at `cell` metres. */
    setHeights(height, half, cell) {
      const n = Math.round((2 * half) / cell) + 1;
      const data = new Float32Array(n * n);
      for (let j = 0; j < n; j += 1) {
        for (let i = 0; i < n; i += 1) {
          data[j * n + i] = height(-half + i * cell, -half + j * cell);
        }
      }
      const t = own(new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.FloatType));
      t.needsUpdate = true;
      heights.texture.value = t;
      heights.grid.value.set(half, cell, n);
      groundAt = height;
    },
    /* Every material in the scene through the light, and the kit's
     * textured meshes their metre uvs: once, after every part is in. */
    finish() {
      finishScene(scene, lit);
    },
    updateShadowFocus(target) {
      const far = sun.lights[1];
      if (far && groundAt) {
        const over = camera.position.y - groundAt(camera.position.x, camera.position.z);
        const half = THREE.MathUtils.clamp(over * FAR_REACH, FAR_HALF, FAR_HALF_MAX);
        if (Math.abs(half - far.userData.half) > 25) {
          const c = far.shadow.camera;
          c.left = -half;
          c.right = half;
          c.top = half;
          c.bottom = -half;
          c.updateProjectionMatrix();
          far.userData.half = half;
          far.userData.texel = (2 * half) / far.shadow.mapSize.x;
          far.shadow.normalBias = FAR_NORMAL_BIAS * (half / FAR_HALF);
        }
      }
      sun.update(target, camera);
      turf.update(camera, groundAt);
    },
    /* The post chain and the photographed craft, onto a built map. */
    compose(shell, map) {
      const post = buildPhotoComposer(shell.renderer, map.scene, shell.camera, q, {
        direction: sunDir, ...sunLight, at: lit.sun,
      }, clouds, AIR);
      const d = shell.resize();
      post.setSize(d.w, d.h);
      const sceneDispose = map.dispose;
      map.post = post;
      /* The post chain that draws this scene, for the sensor checks,
       * which route a frame through the SensorManager with it
       * (scripts/sensor-check.js). */
      map.scene.userData.post = post;
      shell.setCraftLook(photoCraftLook(lit));
      map.dispose = () => {
        shell.setCraftLook(null);
        post.dispose();
        sceneDispose();
      };
      return map;
    },
    /* After the scene graph's own dispose: what the graph cannot reach. */
    dispose() {
      if (nightFixtures) {
        nightFixtures.dispose();
      }
      envTarget.dispose();
      clouds.dispose();
      ground.dispose();
      turf.dispose();
      for (const t of owned) {
        t.dispose();
      }
    },
  };
}
