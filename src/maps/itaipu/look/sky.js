/*
 * sky.js: Itaipu's sky and the air under it.
 *
 * A CLEAR TROPICAL DAY, NOT THE ALPS'. Rounds 0 and 1 drew swiss2's
 * photographed sky (assets/swiss2/sky_back.jpg), turned and stretched to
 * Itaipu's sun: a thin, hazy summer sky over the Alps, grey white in
 * every view, and a light nearly as strong as the sun's, which left the
 * dam in a flat, shadowless overcast. The reference photographs are hard
 * sun under a deep blue sky with fair weather cumulus. Measured over
 * their clear patches (aerial-dam, aerial-dam-wide, penstocks,
 * crest-road, river-below), the sky is sRGB about (115, 160, 220)
 * overhead going to (150, 185, 215) at the horizon.
 * No photographed sky in the tree is that, so it is drawn:
 *
 *   the clear sky, a deep blue zenith (ZENITH) going to the horizon's
 *   haze (AIR.haze) over the lowest few tens of degrees (FALL), and the
 *   sun's glow through the haze (the post chain's own term, below);
 *
 *   the cumulus, flat bottomed domes over the whole region, grey
 *   underneath and lit white on top, veiled by the air with distance;
 *
 *   the sun's disc, far brighter than anything a photograph stores, for
 *   the bloom.
 *
 * THE HORIZON IS THE AIR. The post chain veils everything with a depth by
 * the air (swiss2/post.js AIR_GLSL), and at infinite distance a ray is the
 * air's own light, haze plus the sun's glow. The sky at and below the
 * horizon is exactly that, so the far plateau fades into a sky of its own
 * colour, with no line where the backdrop meets the ground.
 *
 * THE LIGHT IS THIS SKY. The environment the ground is lit and reflected
 * from is this backdrop, drawn once into a cube round a point over the
 * dam without the disc (the sun is the directional light), then
 * prefiltered. So the sky fill is the same blue as the sky in the frame,
 * and as weak as a clear sky is against a high sun: its irradiance on the
 * level is about a fifth of the sun's (light.js).
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
import { AIR as VALLEY_AIR } from '../../swiss2/post.js';
import { SUN_COLOR, SUN_IRRADIANCE, EXPOSURE } from './light.js';

/*
 * The air, swiss2's shape (post.js AIR) with Itaipu's sky. The haze is the
 * clear sky's horizon, as bright as the Alps' grey and bluer. The
 * extinction, the height it thins over and the print are the valley's
 * (at 0.8 of the extinction the far ground kept more of its contrast,
 * where the photographs' already has less than the renders'); the
 * exposure is Itaipu's (light.js).
 */
export const AIR = {
  ...VALLEY_AIR,
  haze: new THREE.Color().setRGB(0.36, 0.43, 0.54, THREE.LinearSRGBColorSpace),
  exposure: EXPOSURE,
};

/* The sky overhead, linear radiance in the sun's units. */
const ZENITH = new THREE.Color().setRGB(0.04, 0.16, 0.5, THREE.LinearSRGBColorSpace);
/* How fast the zenith gives way to the haze going down: the haze's share
 * is (1 - sin elevation)^FALL. */
const FALL = 3.5;
/* The sun's glow through the haze, as a share of the post chain's at the
 * horizon, overhead: there is less air above than along the horizon. */
const GLOW_HIGH = 0.35;

/*
 * The cumulus: a deck at CLOUD_BASE, world metres, of clouds CLOUD_SIZE
 * across where the noise (skyFbm, mean 0.48, deviation 0.12) is over
 * CLOUD_EDGE's first value, their full body from its second: about a
 * fifth of the sky, a fair weather day's. The deck is flat, not a
 * volume (round 2 marched a slab and its steps showed as slices on every
 * cloud's side); what a volume would show is in the shading. A cloud
 * overhead shows its base, grey and darker the thicker the cloud (the
 * noise over its edge), and one toward the horizon shows its sunlit side
 * and top, so the light goes from CLOUD_SHADE overhead to CLOUD_LIT low
 * down, both as shares of the sun's irradiance, and a thin rim toward the
 * sun glows. The air takes a cloud over CLOUD_FADE metres. A camera over
 * the deck sees none: every view and course is under it.
 */
const CLOUD_BASE = 1600;
const CLOUD_SIZE = 1100;
const CLOUD_EDGE = [0.6, 0.7];
const CLOUD_FADE = 40000;
const CLOUD_LIT = 0.34;
const CLOUD_SHADE = 0.13;

/* A point over the dam the environment is drawn from, and its size. */
const ENV_AT = new THREE.Vector3(0, 400, -1500);
const ENV_PX = 256;

const SKY_GLSL = /* glsl */ `
  uniform vec3 uSun;
  uniform vec3 uSunCol;
  uniform vec3 uZenith;
  uniform vec3 uHaze;
  uniform vec3 uAirSun;
  uniform vec3 uCam;
  uniform float uDisc;
  varying vec3 vDir;

  float skyHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float skyNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(skyHash(i), skyHash(i + vec2(1.0, 0.0)), u.x),
      mix(skyHash(i + vec2(0.0, 1.0)), skyHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float skyFbm(vec2 p) {
    float s = 0.0;
    float a = 0.5;
    for (int k = 0; k < 6; k++) {
      s += a * skyNoise(p);
      p = mat2(1.6, 1.2, -1.2, 1.6) * p;
      a *= 0.5;
    }
    return s;
  }

  vec3 skyAt(vec3 d) {
    /* post.js airT's light at the end of an endless ray. */
    const float g = 0.72;
    float mu = dot(d, uSun);
    float hg = (1.0 - g * g) / (4.0 * PI * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
    float up = max(d.y, 0.0);
    float t = pow(1.0 - up, ${FALL.toFixed(2)});
    vec3 c = mix(uZenith, uHaze, t) + uAirSun * hg * mix(${GLOW_HIGH.toFixed(2)}, 1.0, t);
    if (d.y > 0.01 && uCam.y < ${CLOUD_BASE.toFixed(1)}) {
      float run = (${CLOUD_BASE.toFixed(1)} - uCam.y) / d.y;
      vec2 p = (uCam.xz + d.xz * run) / ${CLOUD_SIZE.toFixed(1)};
      float n = skyFbm(p + 0.35 * vec2(skyNoise(p * 0.5 + 7.1), skyNoise(p * 0.5 + 3.3)));
      float cover = smoothstep(${CLOUD_EDGE[0].toFixed(3)}, ${CLOUD_EDGE[1].toFixed(3)}, n);
      if (cover > 0.0) {
        float thick = smoothstep(${CLOUD_EDGE[0].toFixed(3)}, ${(CLOUD_EDGE[1] + 0.12).toFixed(3)}, n);
        float side = 1.0 - smoothstep(0.04, 0.45, d.y);
        float lit = mix(${CLOUD_SHADE.toFixed(3)} * (1.25 - 0.5 * thick), ${CLOUD_LIT.toFixed(3)} * (0.85 + 0.15 * thick), side)
          + 0.3 * hg * (1.0 - thick);
        vec3 cloud = uSunCol * lit + uZenith * 0.6;
        float air = 1.0 - exp(-run / ${CLOUD_FADE.toFixed(1)});
        c = mix(c, mix(cloud, c, air), cover * smoothstep(0.01, 0.05, d.y));
      }
    }
    return c;
  }
`;

/*
 * The backdrop: a sphere round the camera on the far plane. Radiance, not
 * colour; the post chain exposes it with everything else.
 */
export function skyBackdrop(sunDir) {
  const sunCol = SUN_COLOR.clone().multiplyScalar(SUN_IRRADIANCE);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      uSun: { value: sunDir.clone() },
      uSunCol: { value: sunCol },
      uZenith: { value: ZENITH.clone() },
      uHaze: { value: AIR.haze.clone() },
      uAirSun: { value: SUN_COLOR.clone().multiplyScalar(AIR.mie) },
      uCam: { value: new THREE.Vector3() },
      uDisc: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        /* On the far plane whatever the projection: the water's mirror
         * draws with an oblique near plane (swiss2/water/lake.js), which
         * clipped the sphere into a curved edge across the reservoir. */
        gl_Position.z = gl_Position.w * 0.99999;
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      ${SKY_GLSL}
      void main() {
        vec3 d = normalize(vDir);
        vec3 c = skyAt(d);
        float disc = smoothstep(0.99998, 0.999992, dot(d, uSun));
        gl_FragColor = vec4(c + uSunCol * (1000.0 * disc * uDisc), 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), mat);
  sky.renderOrder = -1000;
  sky.frustumCulled = false;
  sky.name = 'sky';
  sky.onBeforeRender = (renderer, scene, camera) => {
    sky.position.setFromMatrixPosition(camera.matrixWorld);
    sky.updateMatrixWorld();
    mat.uniforms.uCam.value.copy(sky.position);
  };
  return sky;
}

/*
 * The environment: the backdrop without its disc, drawn into a cube from
 * ENV_AT and prefiltered. Called before the backdrop is added to the
 * map's scene. Returns the PMREM target; the caller owns it.
 */
export function skyEnvironment(renderer, sky) {
  const cube = new THREE.WebGLCubeRenderTarget(ENV_PX, { type: THREE.HalfFloatType });
  const eye = new THREE.CubeCamera(1, 4000, cube);
  eye.position.copy(ENV_AT);
  eye.updateMatrixWorld();
  const scene = new THREE.Scene();
  scene.add(sky);
  sky.material.uniforms.uDisc.value = 0;
  eye.update(renderer, scene);
  sky.material.uniforms.uDisc.value = 1;
  scene.remove(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromCubemap(cube.texture);
  pmrem.dispose();
  cube.dispose();
  return target;
}
