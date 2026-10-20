/*
 * scene.js: the sky dome the Alps draw behind them.
 *
 * It held the race gates the in-sim builder stood in a world until they
 * left with the builder (the combat-only cut, 2026-10-20); the dome is
 * the part a kept world still draws.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';

/*
 * The cel sky: a horizon to zenith gradient posterised into nine bands,
 * mixed half back to smooth so a band edge never reads as one hard arc
 * across the frame, then a warm glow round the sun and its disc. The
 * height gain lifts the bands off the horizon. The direction is
 * renormalised per fragment because the sun's disc is a threshold on it,
 * and an interpolated unit vector is short inside a face. The disc mixes
 * to a ceiling below white with a soft ramp (1.0 to 1.6 degrees) so it
 * neither clips nor stairs. The zenith is pale on purpose: sky and lit
 * grass must sit in different value bands, and blue carries little
 * luminance.
 *
 * The clouds are cel too, drawn on a plane CEL_CLOUD_Y over the camera
 * and drifting on the wind (CEL_CLOUD_WIND, metres a second): a cell's
 * outline is a hard threshold on a soft noise with a two pixel ramp, and
 * inside it two tones, a lit cream and a shade the blue grey of the
 * zenith, split by the same noise read a little toward the sun, so each
 * cloud has a lit side and a shaded underside as the cel props do. They
 * fade into the horizon's band, where the plane runs out to infinity.
 * The sky had none, and a cloudless dome read as unfinished, not styled.
 */
const CEL_CLOUD_Y = 1400;
const CEL_CLOUD_SIZE = 900;
const CEL_CLOUD_WIND = new THREE.Vector2(-6, 3);
const SKY_ZENITH = 0x6ea3d8;
const SKY_HORIZON = 0xf2e3cb;
const SUN_DIRECTION = new THREE.Vector3(0.60, 0.50, 0.62).normalize();

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 uHigh;
  uniform vec3 uHorizon;
  uniform vec3 uSun;
  uniform vec2 uDrift;
  varying vec3 vDir;
  float celHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float celNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(celHash(i), celHash(i + vec2(1.0, 0.0)), u.x),
      mix(celHash(i + vec2(0.0, 1.0)), celHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float celCloud(vec2 p) {
    return celNoise(p) * 0.55 + celNoise(p * 2.1 + 3.7) * 0.3 + celNoise(p * 4.3 + 9.2) * 0.15;
  }
  void main() {
    vec3 dir = normalize(vDir);
    float altitude = clamp(dir.y * 1.25 + 0.06, 0.0, 1.0);
    float bands = altitude * 9.0;
    float poster = (floor(bands) + smoothstep(0.35, 0.95, fract(bands))) / 9.0;
    vec3 sky = mix(uHorizon, uHigh, mix(altitude, poster, 0.5));
    float toSun = max(dot(dir, normalize(uSun)), 0.0);
    if (dir.y > 0.02) {
      vec2 at = (dir.xz * (${CEL_CLOUD_Y.toFixed(1)} / dir.y) + uDrift) / ${CEL_CLOUD_SIZE.toFixed(1)};
      float n = celCloud(at);
      float w = fwidth(n);
      float body = smoothstep(0.72 - w, 0.72 + w, n);
      /* The same noise a step toward the sun: where it is thinner there,
       * this side faces the sun and is lit. */
      float lit = smoothstep(-w, w, n - celCloud(at + normalize(uSun.xz) * 0.2) + 0.035);
      vec3 cloud = mix(vec3(0.46, 0.52, 0.63), vec3(0.66, 0.66, 0.64), lit);
      float far = smoothstep(0.02, 0.22, dir.y);
      sky = mix(sky, mix(uHorizon, cloud, far), body * far);
    }
    sky += vec3(1.0, 0.80, 0.42) * pow(toSun, 40.0) * 0.30;
    sky = mix(sky, vec3(0.985, 0.965, 0.905), smoothstep(0.99961, 0.99985, toSun));
    gl_FragColor = vec4(sky, 1.0);
  }
`;

/*
 * The sky as a dome round the camera. It is recentred on the rendering
 * camera before every draw and drawn first with no depth test, so a world
 * wider than its 1500 m radius (the Alps) never flies out of it and it is
 * never in front of a far ridge.
 *
 * A world passes its own sun (a unit vector toward the light its
 * shadows come from, so the disc is where the shadows say it is) and its
 * own horizon (its fog's colour, so a far ridge fades into the band
 * behind it, not into a colour the sky does not have), and may pass its
 * zenith. Left out, each is the dome's own (docs/LOOK.md).
 */
export function skyDome({ sun = SUN_DIRECTION, horizon = SKY_HORIZON, zenith = SKY_ZENITH } = {}) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      uHigh: { value: new THREE.Color(zenith) },
      uHorizon: { value: new THREE.Color(horizon) },
      uSun: { value: sun.clone() },
      uDrift: { value: new THREE.Vector2() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: SKY_FRAGMENT,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1500, 40, 24), mat);
  dome.renderOrder = -1000;
  dome.frustumCulled = false;
  /* The clouds stand still over the ground, so they are offset by the
   * camera as well as drifted by the wind. */
  const born = performance.now() / 1000;
  dome.onBeforeRender = (renderer, scene, camera) => {
    dome.position.setFromMatrixPosition(camera.matrixWorld);
    dome.updateMatrixWorld();
    const t = performance.now() / 1000 - born;
    mat.uniforms.uDrift.value.set(dome.position.x - CEL_CLOUD_WIND.x * t, dome.position.z - CEL_CLOUD_WIND.y * t);
  };
  return dome;
}
