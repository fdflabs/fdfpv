/*
 * look.js: the Interior's light, sky and air, and the post chain, built
 * from Itaipu's sky (src/maps/itaipu/look/sky.js) and swiss2's
 * photographic kit, as Itaipu's look is, with a sun that moves.
 *
 * THE SUN MOVES (TECH-NEEDS N1, M1 "16:40 into sunset"). sun.js gives its
 * place at a local hour; setLocalTime(h) moves the directional lights,
 * the sky's disc and the post chain's glare to it and warms and dims it
 * as it gets low. The map is built at a starting hour (the mission's,
 * from the room's clock: src/share/interior/clock.js), and the sky's
 * palette and the environment's light are chosen once from that hour's
 * sun: Itaipu's 'morning' air (a sun under 30 degrees in thick, hazy
 * air) while the sun is over SKY_LOW, 'golden' under it. A pass from one
 * to the other inside a mission is drawn by rebuilding the look, which
 * nothing does yet: Mission 1 starts with the sun 22 degrees up and the
 * room decides when its light is gone.
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
import { loadSurface, SURFACES } from '../swiss2/assets.js';
import { makePhotoLook, finishScene } from '../swiss2/look.js';
import { buildPhotoComposer } from '../swiss2/post.js';
import { makeClouds } from '../swiss2/clouds.js';
import { photoCraftLook } from '../swiss2/craftlook.js';
import { makeLit, TIMES } from '../itaipu/look/light.js';
import { skyBackdrop, skyEnvironment, airFor } from '../itaipu/look/sky.js';
import { loadGroundArrays, noiseTexture } from '../itaipu/look/ground.js';
import { thermalKind, thermalShader } from '../../render/thermal.js';
import { sunAt } from './sun.js';
import { groundMaterial, landTexture } from './ground.js';

export const CAMERA_FAR = 170000;
/* Under this sine of the sun's elevation (about 15 degrees) the sky is
 * Itaipu's golden hour's, over it its morning's. */
const SKY_LOW = 0.26;
/* As Itaipu's look: the far shadow map grows with the camera's height. */
const FAR_HALF = 700;
const FAR_REACH = 2.5;
const FAR_HALF_MAX = 2500;
const FAR_NORMAL_BIAS = 0.6;

/* The sun's colour and strength by the sine of its elevation: the morning
 * light of Itaipu's TIMES at 28 degrees and over, its golden hour's at 8,
 * a red ember on the horizon. */
function sunLight(sinEl, out) {
  const hi = TIMES.morning;
  const lo = TIMES.golden;
  const t = THREE.MathUtils.clamp((sinEl - 0.14) / (0.47 - 0.14), 0, 1);
  out.color.copy(lo.color).lerp(hi.color, t);
  const fade = THREE.MathUtils.smoothstep(sinEl, -0.01, 0.08);
  out.irradiance = (lo.irradiance + (hi.irradiance - lo.irradiance) * t) * fade;
  return out;
}

/*
 * A directional sun of two cascades, as swiss2/light.js makeSun, whose
 * direction is read every update rather than fixed when it was made.
 */
function makeSunRig(scene, q, dir, light) {
  const lights = [];
  const add = (half, size, depth, bias, normalBias) => {
    const l = new THREE.DirectionalLight(light.color, light.irradiance);
    l.castShadow = q.shadows;
    l.shadow.mapSize.set(size, size);
    l.shadow.camera.near = 1;
    l.shadow.camera.far = depth;
    l.shadow.camera.left = -half;
    l.shadow.camera.right = half;
    l.shadow.camera.top = half;
    l.shadow.camera.bottom = -half;
    l.shadow.bias = bias;
    l.shadow.normalBias = normalBias;
    l.userData.half = half;
    l.userData.texel = (2 * half) / size;
    l.userData.depth = depth;
    scene.add(l);
    scene.add(l.target);
    lights.push(l);
  };
  add(q.field.shadowHalf || 72, q.field.shadowMap || 2048, 900, -0.0006, 0.04);
  if (q.shadows && q.id === 'high') {
    add(FAR_HALF, 2048, 6000, -0.0004, FAR_NORMAL_BIAS);
  }
  const xAxis = new THREE.Vector3();
  const yAxis = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  function update(focus, camera) {
    xAxis.crossVectors(up, dir).normalize();
    yAxis.crossVectors(dir, xAxis);
    lights.forEach((l, k) => {
      centre.copy(focus);
      if (k === 1 && camera) {
        camera.getWorldDirection(fwd);
        fwd.y = 0;
        if (fwd.lengthSq() > 1e-6) {
          fwd.normalize();
          centre.addScaledVector(fwd, l.userData.half * 0.75);
        }
      }
      const texel = l.userData.texel;
      const a = Math.round(centre.dot(xAxis) / texel) * texel;
      const b = Math.round(centre.dot(yAxis) / texel) * texel;
      const c = centre.dot(dir);
      centre.copy(xAxis).multiplyScalar(a).addScaledVector(yAxis, b).addScaledVector(dir, c);
      l.target.position.copy(centre);
      l.position.copy(centre).addScaledVector(dir, l.userData.depth * 0.5);
      l.target.updateMatrixWorld();
      l.updateMatrixWorld();
      l.color.copy(light.color);
      l.intensity = light.irradiance;
    });
  }
  return { lights, update };
}

function shape(l, half) {
  const c = l.shadow.camera;
  c.left = -half;
  c.right = half;
  c.top = half;
  c.bottom = -half;
  c.updateProjectionMatrix();
  l.userData.half = half;
  l.userData.texel = (2 * half) / l.shadow.mapSize.x;
}

/*
 * The look at local hour `hours`: { scene, ground (the terrain's
 * material), mats (the kit, as Itaipu's ctx.mats), lit, sunDir,
 * setLocalTime(h), updateShadowFocus(target), setHeights(fn),
 * finish(), compose(shell, map), dispose() }. `land` is world.js's
 * decoded land cover.
 */
export async function makeLook({
  renderer, camera, q, hours, land,
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
  const [arrays, ...sets] = await Promise.all([
    loadGroundArrays(layerPx, aniso),
    ...SURFACES.map((n) => loadSurface(n, aniso)),
  ]);
  own(arrays.col);
  own(arrays.nrh);
  const surfaces = {};
  SURFACES.forEach((n, k) => {
    surfaces[n] = sets[k];
    own(sets[k].col);
    own(sets[k].nrm);
    own(sets[k].arm);
  });

  const at = sunAt(hours);
  const sunDir = new THREE.Vector3(...at.dir).normalize();
  const skyTime = sunDir.y > SKY_LOW ? 'morning' : 'golden';
  const light = sunLight(sunDir.y, { color: new THREE.Color(), irradiance: 0 });
  /* Itaipu's air at that hour, thinned: its morning air is the humid
   * morning's, thicker than a dry season's late afternoon, which is hazy
   * (BIBLE.md 2.3) but must still show a survey camera the ground three
   * kilometres off. */
  const base = airFor(skyTime);
  const AIR = { ...base, beta: base.beta.clone().multiplyScalar(0.55) };
  const scene = new THREE.Scene();
  scene.userData.timeOfDay = 'day';
  scene.background = AIR.haze.clone();
  const sky = skyBackdrop(sunDir, skyTime);
  const envTarget = skyEnvironment(renderer, sky, skyTime);
  scene.add(sky);
  scene.environment = envTarget.texture;
  camera.far = CAMERA_FAR;
  camera.updateProjectionMatrix();

  const sun = makeSunRig(scene, q, sunDir, light);
  /* The post chain and the clouds read this object's fields each frame,
   * so moving the sun is changing them. */
  const sunState = { direction: sunDir, color: light.color, irradiance: light.irradiance };
  const clouds = makeClouds({ sun: sunState, sky: AIR.haze, air: AIR });
  const lit = makeLit();
  const noise = own(noiseTexture(aniso));
  const landTex = own(landTexture(land));
  const ground = groundMaterial({ land: landTex, arrays, noise });
  const heights = { texture: { value: null }, grid: { value: new THREE.Vector3() } };
  const look = makePhotoLook({
    surfaces,
    marks: {},
    ground: () => {
      throw new Error('interior look: the ground is the terrain\'s own material (ground.js), not a kit piece');
    },
    heights,
  });
  let groundAt = null;

  function setLocalTime(h) {
    const s = sunAt(h);
    sunDir.set(...s.dir).normalize();
    sunLight(sunDir.y, light);
    sunState.irradiance = light.irradiance;
    sky.material.uniforms.uSun.value.copy(sunDir);
    sky.material.uniforms.uSunCol.value.copy(light.color).multiplyScalar(light.irradiance);
    scene.userData.timeOfDay = sunDir.y > -0.05 ? 'day' : 'night';
    return light.irradiance;
  }

  return {
    scene,
    sun,
    sunDir,
    lit,
    ground,
    skyTime,
    setLocalTime,
    sunIrradiance: () => light.irradiance,
    mats: {
      look,
      lit,
      surfaces,
      envMap: scene.environment,
      thermal: { kind: thermalKind, shader: thermalShader },
    },
    /* The ground's heights on a grid for the kit's walls, which weather
     * by their height over the ground (swiss2/look.js). */
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
    finish() {
      finishScene(scene, lit);
    },
    updateShadowFocus(target) {
      const [near, far] = sun.lights;
      if (far && groundAt) {
        const over = camera.position.y - groundAt(camera.position.x, camera.position.z);
        const half = THREE.MathUtils.clamp(over * FAR_REACH, FAR_HALF, FAR_HALF_MAX);
        if (Math.abs(half - far.userData.half) > 25) {
          shape(far, half);
          far.shadow.normalBias = FAR_NORMAL_BIAS * (half / FAR_HALF);
        }
      }
      /* A low sun's near map stretches into a long strip of casters
       * (Itaipu's look, LOW_SUN_ONE_MAP): under 17 degrees the far map
       * alone is the sun. */
      if (far) {
        near.visible = sunDir.y >= 0.3;
      }
      sun.update(target, camera);
      sky.updateCube(renderer, camera);
    },
    compose(shell, map) {
      /* buildPhotoComposer keeps the object it is handed and reads it each
       * frame, so the live one goes in and setLocalTime reaches it. */
      sunState.at = lit.sun;
      const post = buildPhotoComposer(shell.renderer, map.scene, shell.camera, q, sunState, clouds, AIR);
      const d = shell.resize();
      post.setSize(d.w, d.h);
      const sceneDispose = map.dispose;
      map.post = post;
      map.scene.userData.post = post;
      shell.setCraftLook(photoCraftLook(lit));
      map.dispose = () => {
        shell.setCraftLook(null);
        post.dispose();
        sceneDispose();
      };
      return map;
    },
    dispose() {
      envTarget.dispose();
      sky.disposeCube();
      clouds.dispose();
      ground.dispose();
      for (const t of owned) {
        t.dispose();
      }
    },
  };
}
