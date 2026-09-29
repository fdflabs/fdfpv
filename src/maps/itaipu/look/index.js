/*
 * look/index.js: how Itaipu is drawn. swiss2's photographic style over
 * Yellowstone's terrain engine (docs/ITAIPU-PLAN.md section 1, point 5).
 *
 * From swiss2, unchanged and shared: the terrain photographs and the
 * surfaces (swiss2/assets.js), the photographed sky, the material kit
 * every part is handed (swiss2/look.js makePhotoLook, as ctx.mats), the
 * sun's shadow cascades (swiss2/light.js makeSun, which takes its
 * direction), the post chain (swiss2/post.js: occlusion, aerial
 * perspective, the metered exposure, AgX, FXAA) and the photographed
 * craft (swiss2/craftlook.js).
 *
 * Itaipu's own: the sun, fixed to the satellite's (light.js); the light
 * injection, without the Alps' terrain shadow and cloud deck, which are
 * baked on the Alps' square (light.js says why); the sky turned to that
 * sun (sky.js); and the ground, the satellite's colour with swiss2's
 * photographed grain under it (ground.js), finished where the place asks
 * for it: the canyon's basalt, the reservoir's margin and the rockfill
 * dam's faces.
 *
 * The low cloud swiss2 marches in its post chain is made and never handed
 * a terrain, so it draws nothing (clouds.js: until setTerrain, "the march
 * draws nothing"): the post chain takes one, and the day was clear.
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
import {
  loadTerrainArrays, loadSurface, loadSky, SURFACES,
} from '../../swiss2/assets.js';
import { makeSun, SUN_COLOR, SUN_IRRADIANCE } from '../../swiss2/light.js';
import { makePhotoLook, finishScene } from '../../swiss2/look.js';
import { buildPhotoComposer, AIR } from '../../swiss2/post.js';
import { makeClouds } from '../../swiss2/clouds.js';
import { photoCraftLook } from '../../swiss2/craftlook.js';
import { sunDirection, makeLit } from './light.js';
import {
  skyBackdrop, skyTurn, turnEquirect, stretchEquirect,
} from './sky.js';
import { groundMaterial, loadImage, loadSite } from './ground.js';

/* Past the horizon from 500 m (80 km) the apron and the fog have it. */
export const CAMERA_FAR = 90000;

/*
 * Load everything the look needs and make the scene it draws. `base` is
 * the data folder's URL. Returns the stage the map builds into.
 */
export async function makeLook({
  renderer, camera, q, base, manifest,
}) {
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
  const [arrays, sky, site, heroCol, ringCol, heroMask, ringMask, ...sets] = await Promise.all([
    loadTerrainArrays(layerPx, aniso),
    loadSky(),
    loadSite(base, manifest.frame.ring[1]),
    loadImage(`${base}${im.hero.file}`, true, aniso),
    loadImage(`${base}${im.ring.file}`, true, aniso),
    loadImage(`${base}${im.hero.masks}`, false, aniso),
    loadImage(`${base}${im.ring.masks}`, false, aniso),
    ...SURFACES.map((n) => loadSurface(n, aniso)),
  ]);
  for (const t of [arrays.col, arrays.nrh, sky.back, site.reservoir, heroCol, ringCol, heroMask, ringMask]) {
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
  scene.background = AIR.haze.clone();
  scene.add(skyBackdrop(sky.back, sunDir));
  turnEquirect(sky.env, skyTurn(sunDir));
  stretchEquirect(sky.env, sunDir);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromEquirectangular(sky.env);
  pmrem.dispose();
  sky.env.dispose();
  scene.environment = envTarget.texture;
  camera.far = CAMERA_FAR;
  camera.updateProjectionMatrix();

  const sun = makeSun(scene, q, sunDir);
  const clouds = makeClouds({
    sun: { direction: sunDir, color: SUN_COLOR, irradiance: SUN_IRRADIANCE },
    sky: AIR.haze,
    air: AIR,
  });
  const lit = makeLit();
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
    anisotropy: aniso,
  });
  /* The ground's heights on the hero's 10 m grid, for the kit's walls,
   * which weather by their height over the ground (swiss2/look.js
   * WEATHER_BODY): filled by setHeights once the terrain is in. */
  const heights = { texture: { value: null }, grid: { value: new THREE.Vector3() } };
  const look = makePhotoLook({
    surfaces,
    marks: {},
    ground: () => {
      throw new Error('itaipu look: the ground is the terrain\'s own material (look/ground.js), not a kit piece');
    },
    heights,
  });

  return {
    scene,
    sun,
    sunDir,
    lit,
    ground,
    /* ctx.mats: the photographic kit, the light every material goes
     * through, the surfaces' texture sets and the environment. */
    mats: {
      look, lit, surfaces, envMap: scene.environment,
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
    },
    /* Every material in the scene through the light, and the kit's
     * textured meshes their metre uvs: once, after every part is in. */
    finish() {
      finishScene(scene, lit);
    },
    updateShadowFocus(target) {
      sun.update(target, camera);
    },
    /* The post chain and the photographed craft, onto a built map. */
    compose(shell, map) {
      const post = buildPhotoComposer(shell.renderer, map.scene, shell.camera, q, {
        direction: sunDir, color: SUN_COLOR, irradiance: SUN_IRRADIANCE, at: lit.sun,
      }, clouds);
      const d = shell.resize();
      post.setSize(d.w, d.h);
      const sceneDispose = map.dispose;
      map.post = post;
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
      envTarget.dispose();
      clouds.dispose();
      ground.dispose();
      for (const t of owned) {
        t.dispose();
      }
    },
  };
}
