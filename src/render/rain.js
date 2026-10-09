/*
 * rain.js: rain streaks round the camera, from the room's air
 * (docs/WEATHER-CONTRACT.md: a gust front rains as it passes).
 *
 * One LineSegments of fixed streaks in a box that wraps round the camera,
 * moved entirely in the vertex shader by a time uniform: no per frame
 * buffer upload, one draw call, and hidden (no draw call at all) while it
 * is dry, which is every calm flight. Visual only: the plant never sees it.
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

import { thermalShader } from './thermal.js';

const STREAKS = 2400;
/* The box the streaks wrap in, m: wide enough that its edge is lost in the
 * streaks' own thinning with distance, small enough to stay dense. */
const BOX = 36;
const FALL = 9;
/* A streak is the drop's path over this long, s: a camera's exposure. */
const SMEAR = 0.035;

const VERT = `
attribute vec4 aSeed;
uniform vec3 uCam;
uniform float uTime;
uniform vec2 uWind;
varying float vFade;
void main() {
  vec3 v = vec3(uWind.x, -${FALL.toFixed(1)}, uWind.y);
  vec3 p = aSeed.xyz * ${BOX.toFixed(1)} + v * uTime;
  p = mod(p - uCam, ${BOX.toFixed(1)}) - ${(BOX / 2).toFixed(1)} + uCam;
  p -= aSeed.w * v * ${SMEAR};
  vec3 d = p - uCam;
  vFade = (1.0 - aSeed.w) * (1.0 - smoothstep(${(BOX * 0.25).toFixed(1)}, ${(BOX * 0.5).toFixed(1)}, length(d)));
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const FRAG = `
uniform float uOpacity;
varying float vFade;
void main() {
  gl_FragColor = vec4(0.78, 0.82, 0.86, uOpacity * vFade);
}`;

export function createRain() {
  /* Two vertices a streak, the same seed; w is 0 at the head, 1 at the tail. */
  const seed = new Float32Array(STREAKS * 8);
  let h = 0x2545f491;
  const rnd = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };
  for (let i = 0; i < STREAKS; i += 1) {
    const x = rnd();
    const y = rnd();
    const z = rnd();
    seed.set([x, y, z, 0, x, y, z, 1], i * 8);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(STREAKS * 6), 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uCam: { value: new THREE.Vector3() },
      uTime: { value: 0 },
      uWind: { value: new THREE.Vector2() },
      uOpacity: { value: 0 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
  });
  /* Rain falls from a colder cloud and cools as it evaporates, so its
   * streaks read a little under the air's temperature, and a thin shower
   * is mostly seen through in the long wave band. */
  thermalShader(mat, 'float thT = thEnv.y - 0.05; float thA = 0.3;', 'rain');
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.renderOrder = 4;
  lines.visible = false;
  lines.name = 'rain';

  /* Once a frame: the camera, a clock in seconds, the wind (m/s, map x and
   * z) and how hard it rains, 0 to 1. */
  function frame(camera, timeS, windX, windZ, wet) {
    lines.visible = wet > 0.01;
    if (!lines.visible) {
      return;
    }
    const u = mat.uniforms;
    u.uCam.value.copy(camera.position);
    /* The clock wraps so a float32 in the shader keeps its precision. */
    u.uTime.value = timeS % 3600;
    u.uWind.value.set(windX, windZ);
    u.uOpacity.value = 0.55 * (wet < 1 ? wet : 1);
  }

  return { object: lines, frame };
}
