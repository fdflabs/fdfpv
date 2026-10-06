/*
 * look.js: the Interior's light, sky and air, and the post chain, built
 * from Itaipu's sky (src/maps/itaipu/look/sky.js) and swiss2's
 * photographic kit, as Itaipu's look is, with a sun that moves.
 *
 * THE SUN MOVES (TECH-NEEDS N1, M1 "16:40 into sunset"). sun.js gives its
 * place at a local hour, and setLocalTime(h) is the one place an hour
 * becomes a picture: the directional lights, the sky's disc, zenith,
 * horizon and glow, the air the post chain veils the ground with, the
 * sky light the environment is baked from and the camera's meter all
 * follow the sun's height (LIGHT, below). The map is built at a starting
 * hour (the mission's, from the room's clock: src/share/interior/clock.js)
 * by the same call, so a map built at 18:08 and one built at 16:40 and
 * clocked on to 18:08 draw the same frame.
 *
 * THE MOCKS' LIGHT. The owner's art direction (Golden-Hour Jungle
 * Encampment, Sunset Drone Survey) is a low, warm late afternoon: frames
 * at a mean lightness of 0.17 to 0.25 against round 2's 0.30 to 0.47,
 * lit crowns and earth at a hue of 25 to 40 degrees, the sky glowing
 * orange toward the sun and staying blue grey away from it. Rounds 0 to
 * 2 drew 16:40 with Itaipu's morning air, a white sun and a pale blue
 * haze all round, which the lead's sheets read as flat and grey green.
 * So the Interior's sun is warmer than the physical one at the same
 * height (a dry season's smoke and dust redden it, BIBLE.md 2.3); the
 * horizon's haze stays blue grey and the warmth toward the sun is the
 * air's glow (mie), over four times Itaipu's, so a frame into the sun is
 * gold and one away from it blue grey; the sunlit ground and crowns throw
 * a little of that light back into the shade (BOUNCE); the meter's target
 * falls with the sun and the base exposure rises as it sets, so the frame
 * darkens into the dusk as a camera's does without going black; and a
 * grade (GRADE) warms and saturates the middle tones, the lit crowns and
 * earth, a little, as the mocks' print does.
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
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { buildPhotoComposer } from '../swiss2/post.js';
import { makeClouds } from '../swiss2/clouds.js';
import { photoCraftLook } from '../swiss2/craftlook.js';
import { makeLit } from '../itaipu/look/light.js';
import { skyBackdrop, airFor } from '../itaipu/look/sky.js';
import { loadGroundArrays, noiseTexture } from '../itaipu/look/ground.js';
import { thermalKind, thermalShader } from '../../render/thermal.js';
import { sunAt } from './sun.js';
import { groundMaterial, landTexture } from './ground.js';

export const CAMERA_FAR = 170000;
/* As Itaipu's look: the far shadow map grows with the camera's height. */
const FAR_HALF = 700;
const FAR_REACH = 2.5;
const FAR_HALF_MAX = 2500;
const FAR_NORMAL_BIAS = 0.6;
/* The air's extinction as a share of Itaipu's morning's (round 1A: at
 * 0.55 the survey views were washed grey; the reference aerials show the
 * fields' colour and the tracks five kilometres off). */
const AIR_THIN = 0.2;

/*
 * THE LIGHT BY THE SUN'S HEIGHT: rows by the sine of its elevation, each
 * the sun's colour and irradiance; the sky's zenith and the horizon's
 * haze (linear radiance, the haze also the air's own colour in the post
 * chain, so the far ground fades into the sky behind it); the air's glow
 * toward the sun, as a share of the sun's colour (post.js airT's uMie,
 * the sky's uAirSun); the environment's share of the sky's radiance (the
 * shade's light against the sun's); the post chain's base exposure and
 * the meter's target (post.js uExposure, uKey); the print's S curve; and
 * the grade's strength (GRADE). Between rows the values are blended
 * linearly.
 *
 *   night  well under the horizon: no sun, the haze a moonless dusk's
 *   dusk   4 degrees under: the sun gone, the west still faintly warm
 *   sunset the disc on the horizon, a red ember, the haze itself warm
 *   ember  3 degrees: orange and weak through the long air
 *   gold   10 degrees, mid mission: deep gold, the haze going amber
 *   start  22 degrees, 16:40, every scored view: the mocks' warm sun,
 *          a blue grey horizon, the strongest glow toward the sun
 *   high   40 degrees and over, an hour no mission flies: Itaipu's
 *          clear day, a little hazier
 *
 * The 22 degree row's haze is a little under round 1A's lightness (0.42
 * against 0.47; that round's survey views gained from the haze's being
 * lighter than round 0's), and its shade is lit at 0.8 of the sky where
 * Itaipu's is at 0.55: at 0.55 the camp's shaded clearing printed at sRGB
 * (12, 16, 19) against the mock's (56, 46, 38).
 */
const C = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
const LIGHT = [
  {
    sin: -0.17, sun: C(1.0, 0.3, 0.1), irradiance: 0, zenith: C(0.002, 0.004, 0.012), haze: C(0.008, 0.01, 0.02), mie: 0, env: 1.6, exposure: 3, key: 0.03, contrast: 0.85, grade: 0,
  },
  {
    sin: -0.07, sun: C(1.0, 0.3, 0.1), irradiance: 0, zenith: C(0.006, 0.014, 0.045), haze: C(0.05, 0.045, 0.06), mie: 0.25, env: 1.6, exposure: 3, key: 0.05, contrast: 0.85, grade: 0.4,
  },
  {
    sin: 0, sun: C(1.0, 0.34, 0.1), irradiance: 0.45, zenith: C(0.012, 0.035, 0.12), haze: C(0.2, 0.13, 0.1), mie: 1.3, env: 1.5, exposure: 2.4, key: 0.065, contrast: 0.8, grade: 0.8,
  },
  {
    sin: 0.052, sun: C(1.0, 0.4, 0.13), irradiance: 1.5, zenith: C(0.014, 0.042, 0.15), haze: C(0.3, 0.2, 0.14), mie: 1.6, env: 1.3, exposure: 1.7, key: 0.072, contrast: 0.8, grade: 1,
  },
  {
    sin: 0.174, sun: C(1.0, 0.5, 0.2), irradiance: 2.9, zenith: C(0.02, 0.07, 0.24), haze: C(0.42, 0.32, 0.24), mie: 1.5, env: 1, exposure: 1.3, key: 0.08, contrast: 0.78, grade: 1,
  },
  {
    sin: 0.375, sun: C(1.0, 0.62, 0.32), irradiance: 3.4, zenith: C(0.028, 0.1, 0.32), haze: C(0.41, 0.42, 0.44), mie: 2.2, env: 0.8, exposure: 1.15, key: 0.085, contrast: 0.75, grade: 1,
  },
  {
    sin: 0.643, sun: C(1.0, 0.9, 0.76), irradiance: 3.4, zenith: C(0.035, 0.15, 0.43), haze: C(0.45, 0.47, 0.5), mie: 0.5, env: 0.55, exposure: 1.15, key: 0.125, contrast: 0.85, grade: 0,
  },
];
/* The light the sunlit ground and crowns throw back, a hemisphere light
 * in the sun's colour, from below at full and from above at half, as a
 * share of the sun's irradiance: what warms the shade under a low sun
 * where the sky alone leaves it blue. */
const BOUNCE = 0.04;
const COLOUR_KEYS = ['sun', 'zenith', 'haze'];
const NUMBER_KEYS = ['irradiance', 'mie', 'env', 'exposure', 'key', 'contrast', 'grade'];

/* LIGHT's values at the sine of the sun's elevation, into `out`. */
function lightAt(sinEl, out) {
  let k = 0;
  while (k < LIGHT.length - 2 && sinEl > LIGHT[k + 1].sin) {
    k += 1;
  }
  const a = LIGHT[k];
  const b = LIGHT[k + 1];
  const t = THREE.MathUtils.clamp((sinEl - a.sin) / (b.sin - a.sin), 0, 1);
  for (const n of COLOUR_KEYS) {
    out[n].copy(a[n]).lerp(b[n], t);
  }
  for (const n of NUMBER_KEYS) {
    out[n] = a[n] + (b[n] - a[n]) * t;
  }
  return out;
}

/*
 * THE GRADE, after the print and before the antialiasing, on display
 * values: the middle tones warmed (fully at lightness 0.45 to 0.55,
 * fading out under 0.12 and over 0.9) and the darks a touch cooler, and
 * the colour's saturation up by an eighth, all scaled by the hour's
 * uGrade. A warm sun alone leaves the lit crowns olive after AgX, which
 * takes saturation out as a value climbs; the mocks' lit leaves and earth
 * are a saturated gold. Warming the highlights as well printed the sky
 * and the cloud cream. One full screen pass, a texture read and a few
 * multiplies.
 */
const GRADE = {
  uniforms: {
    tDiffuse: { value: null },
    uGrade: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uGrade;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float mid = smoothstep(0.12, 0.45, l) * (1.0 - smoothstep(0.55, 0.9, l));
      vec3 tone = mix(vec3(0.97, 1.0, 1.03), vec3(1.06, 1.0, 0.86), mid);
      vec3 g = mix(vec3(l), c, 1.0 + 0.12 * uGrade) * mix(vec3(1.0), tone, uGrade);
      gl_FragColor = vec4(clamp(g, 0.0, 1.0), 1.0);
    }
  `,
};

/* The environment: drawn from a point over the corridor's middle, 256 a
 * side, as Itaipu's sky.js skyEnvironment does, but kept: one cube, one
 * prefilter and one target for the look's life, so a rebake as the sun
 * goes down compiles nothing and scene.environment stays the same
 * texture. Rebaked when the sun has moved ENV_STEP in sine (about a
 * degree) or the gain has changed, a few times a mission. */
const ENV_AT = new THREE.Vector3(0, 400, 0);
const ENV_PX = 256;
const ENV_STEP = 0.018;

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
 * finish(), compose(shell, map), dispose() }. `land` is the land
 * cover's cells with places.js's painting (ground.js paintedLand).
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

  const sunDir = new THREE.Vector3(0, 1, 0);
  const now = {
    sun: new THREE.Color(), zenith: new THREE.Color(), haze: new THREE.Color(), irradiance: 0, mie: 0, env: 0, exposure: 0, key: 0, contrast: 0, grade: 0,
  };
  /* The directional lights' colour and strength, read by the sun rig
   * every frame. */
  const light = { color: now.sun, irradiance: 0 };
  /* Itaipu's morning air for its shape (the extinction's height, the
   * print's slope), thinned (AIR_THIN); its haze, glow, meter target and
   * print contrast are the hour's (LIGHT), set by setLocalTime. */
  const base = airFor('morning');
  const AIR = { ...base, beta: base.beta.clone().multiplyScalar(AIR_THIN), haze: now.haze };
  const scene = new THREE.Scene();
  scene.userData.timeOfDay = 'day';
  /* The thermal picture's air, water and sky (src/render/thermal.js CLIMATE). */
  scene.userData.climate = 'interior';
  scene.background = new THREE.Color();
  const sky = skyBackdrop(sunDir, 'morning');
  const su = sky.material.uniforms;
  scene.add(sky);
  camera.far = CAMERA_FAR;
  camera.updateProjectionMatrix();

  const envCube = new THREE.WebGLCubeRenderTarget(ENV_PX, { type: THREE.HalfFloatType });
  const envEye = new THREE.CubeCamera(1, 4000, envCube);
  envEye.position.copy(ENV_AT);
  envEye.updateMatrixWorld();
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(sky.geometry, sky.material);
  envSky.frustumCulled = false;
  envSky.onBeforeRender = (r, s, cam) => {
    envSky.position.setFromMatrixPosition(cam.matrixWorld);
    envSky.updateMatrixWorld();
    su.uCam.value.copy(envSky.position);
  };
  envScene.add(envSky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envTarget = null;
  const envBaked = { sin: NaN, gain: NaN };
  /* The sky without its disc (the sun is the directional light) at the
   * hour's share of its radiance. */
  function bakeEnvironment() {
    const disc = su.uDisc.value;
    const cube = su.uCube.value;
    su.uDisc.value = 0;
    su.uGain.value = now.env;
    su.uDirect.value = 1;
    su.uCube.value = null;
    envEye.update(renderer, envScene);
    su.uDisc.value = disc;
    su.uGain.value = 1;
    su.uDirect.value = 0;
    su.uCube.value = cube;
    envTarget = pmrem.fromCubemap(envCube.texture, envTarget);
    scene.environment = envTarget.texture;
    envBaked.sin = sunDir.y;
    envBaked.gain = now.env;
  }

  const sun = makeSunRig(scene, q, sunDir, light);
  const bounce = new THREE.HemisphereLight();
  scene.add(bounce);
  /* The glare (post.js PhotoPass.glare) reads this object's fields each
   * frame; the air pass and the meter copy theirs when they are made, so
   * setLocalTime sets those itself (applyPost). */
  const sunState = { direction: sunDir, color: now.sun, irradiance: 0 };
  const clouds = makeClouds({ sun: sunState, sky: AIR.haze, air: AIR });
  const lit = makeLit();
  const noise = own(noiseTexture(aniso));
  const landTex = own(landTexture(land));
  const ground = groundMaterial({
    land: landTex, arrays, noise, sunDir,
  });
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
  let post = null;
  let meter = null;
  let grade = null;

  /* The hour's sun and air into the post chain's air pass and meter. */
  function applyPost() {
    if (!post) {
      return;
    }
    const g = post.grade.material.uniforms;
    g.uSunDir.value.copy(sunDir);
    g.uSunCol.value.copy(now.sun);
    g.uHaze.value.copy(now.haze);
    g.uMie.value = now.mie;
    g.uExposure.value = now.exposure;
    g.uKey.value = now.key;
    g.uContrast.value = now.contrast;
    if (grade) {
      grade.uniforms.uGrade.value = now.grade;
    }
    if (meter) {
      const m = meter.tapMat.uniforms;
      m.uSunDir.value.copy(sunDir);
      m.uSunCol.value.copy(now.sun);
      m.uHaze.value.copy(now.haze);
      m.uMie.value = now.mie;
      meter.sunDir.copy(sunDir);
    }
  }

  function setLocalTime(h) {
    sunDir.set(...sunAt(h).dir).normalize();
    lightAt(sunDir.y, now);
    light.irradiance = now.irradiance;
    sunState.irradiance = now.irradiance;
    su.uSun.value.copy(sunDir);
    su.uSunCol.value.copy(now.sun).multiplyScalar(now.irradiance);
    su.uZenith.value.copy(now.zenith);
    su.uHaze.value.copy(now.haze);
    su.uAirSun.value.copy(now.sun).multiplyScalar(now.mie);
    scene.background.copy(now.haze);
    bounce.color.copy(now.sun).multiplyScalar(0.5);
    bounce.groundColor.copy(now.sun);
    bounce.intensity = now.irradiance * BOUNCE;
    scene.userData.timeOfDay = sunDir.y > -0.05 ? 'day' : 'night';
    if (!(Math.abs(sunDir.y - envBaked.sin) < ENV_STEP) || Math.abs(now.env - envBaked.gain) > 0.02) {
      bakeEnvironment();
    }
    applyPost();
    return now.irradiance;
  }
  setLocalTime(hours);

  return {
    scene,
    sun,
    sunDir,
    lit,
    ground,
    setLocalTime,
    sunIrradiance: () => now.irradiance,
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
      sunState.at = lit.sun;
      post = buildPhotoComposer(shell.renderer, map.scene, shell.camera, q, sunState, clouds, AIR);
      /* The meter is not handed back; it is the pass with the taps. */
      meter = post.composer.passes.find((p) => p.tapMat) || null;
      grade = new ShaderPass(GRADE);
      post.composer.insertPass(grade, post.composer.passes.indexOf(post.grade) + 1);
      applyPost();
      const d = shell.resize();
      post.setSize(d.w, d.h);
      const sceneDispose = map.dispose;
      map.post = post;
      map.scene.userData.post = post;
      shell.setCraftLook(photoCraftLook(lit));
      map.dispose = () => {
        shell.setCraftLook(null);
        post.dispose();
        grade.material.dispose();
        grade = null;
        post = null;
        meter = null;
        sceneDispose();
      };
      return map;
    },
    dispose() {
      envTarget.dispose();
      envCube.dispose();
      pmrem.dispose();
      sky.disposeCube();
      clouds.dispose();
      ground.dispose();
      for (const t of owned) {
        t.dispose();
      }
    },
  };
}
