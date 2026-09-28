/*
 * smoke.js: the smoke system's trail (configs/hangar-parts.js, the
 * 'smoke' add-on), drawn from the tail's nozzle while the pilot has it on.
 *
 * EMITTED ON THE SIM CLOCK. Puffs leave the nozzle at EMIT_HZ of simulated
 * time, puff n at exactly n / EMIT_HZ seconds since the run's reset, each
 * placed where the nozzle was at that instant (between the last two drawn
 * poses) with a jitter hashed from n. So the trail is the same trail
 * however fast the frames come, and a dropped frame drops nothing. It is
 * a picture only: nothing here reaches the plant.
 *
 * A puff leaves at the aircraft's speed less a little, slows in the air
 * over DRAG_S, grows from a finger's width to a metre and a half, sinks a
 * little as it cools, and fades out over LIFE_S.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';

const EMIT_HZ = 90;
const LIFE_S = 5;
const DRAG_S = 0.6;
const MAX = Math.ceil(EMIT_HZ * LIFE_S) + 8;

/* A number in [0, 1) from an integer, the same everywhere. */
function hash(n, salt) {
  let x = (n * 374761393 + salt * 668265263) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

const VERT = `
attribute float aAge;
attribute float aSeed;
uniform float uScale;
varying float vAlpha;
varying float vSeed;
void main() {
  float u = clamp(aAge / ${LIFE_S.toFixed(1)}, 0.0, 1.0);
  float size = 0.10 + 1.1 * sqrt(u) + 0.3 * aSeed * u;
  vAlpha = aAge < 0.0 ? 0.0 : smoothstep(0.0, 0.03, u) * (1.0 - u) * (1.0 - u) * 0.6;
  vSeed = aSeed;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  /* Puffs right in front of the lens fade instead of filling it. */
  float px = size * uScale / max(0.1, -mv.z);
  vAlpha *= 1.0 - smoothstep(160.0, 420.0, px);
  gl_PointSize = min(px, 420.0);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
varying float vAlpha;
varying float vSeed;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  if (r > 1.0) discard;
  float soft = (1.0 - r * r) * (1.0 - 0.25 * smoothstep(0.2, 1.0, r));
  float shade = 0.80 + 0.14 * vSeed + 0.12 * (0.5 - d.y);
  gl_FragColor = vec4(vec3(shade), vAlpha * soft);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createSmoke() {
  const pos = new Float32Array(MAX * 3);
  const age = new Float32Array(MAX).fill(-1);
  const seed = new Float32Array(MAX);
  const born = new Float64Array(MAX).fill(-1);
  const origin = new Float32Array(MAX * 3);
  const vel = new Float32Array(MAX * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aAge', new THREE.BufferAttribute(age, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 600 } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 3;
  const group = new THREE.Group();
  group.name = 'smoke';
  group.add(points);

  const prevAt = new THREE.Vector3();
  const nowAt = new THREE.Vector3();
  let prevT = -1;
  let next = 0;

  function clear() {
    age.fill(-1);
    born.fill(-1);
    prevT = -1;
    next = 0;
    geo.getAttribute('aAge').needsUpdate = true;
  }

  /*
   * Once a frame: the sim time now (s since the run's reset), the nozzle's
   * world position now or null when the smoke is off, the aircraft's world
   * velocity, and the viewport's height in pixels for the puffs' size.
   */
  function update(simT, nozzle, velocity, viewHeight, fovDeg) {
    mat.uniforms.uScale.value = viewHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
    /* A reset turned the clock back: start the emission afresh. */
    if (prevT >= 0 && simT < prevT) {
      prevT = -1;
    }
    if (nozzle) {
      nowAt.copy(nozzle);
      if (prevT < 0) {
        prevAt.copy(nowAt);
        prevT = simT;
        next = Math.ceil(simT * EMIT_HZ);
      }
      const span = simT - prevT;
      for (; next / EMIT_HZ <= simT; next += 1) {
        const tn = next / EMIT_HZ;
        const k = span > 0 ? (tn - prevT) / span : 1;
        const slot = next % MAX;
        born[slot] = tn;
        seed[slot] = hash(next, 1);
        origin[slot * 3] = prevAt.x + (nowAt.x - prevAt.x) * k + (hash(next, 2) - 0.5) * 0.04;
        origin[slot * 3 + 1] = prevAt.y + (nowAt.y - prevAt.y) * k + (hash(next, 3) - 0.5) * 0.04;
        origin[slot * 3 + 2] = prevAt.z + (nowAt.z - prevAt.z) * k + (hash(next, 4) - 0.5) * 0.04;
        /* Out of the nozzle at 70 percent of the aircraft's speed, with
         * some spread of its own. */
        vel[slot * 3] = 0.7 * velocity.x + (hash(next, 5) - 0.5) * 0.8;
        vel[slot * 3 + 1] = 0.7 * velocity.y + (hash(next, 6) - 0.5) * 0.8;
        vel[slot * 3 + 2] = 0.7 * velocity.z + (hash(next, 7) - 0.5) * 0.8;
      }
      prevAt.copy(nowAt);
      prevT = simT;
    } else {
      prevT = -1;
    }
    for (let i = 0; i < MAX; i += 1) {
      if (born[i] < 0) {
        age[i] = -1;
        continue;
      }
      const a = simT - born[i];
      /* Past its life, or from before a reset turned the clock back. */
      if (a > LIFE_S || a < 0) {
        born[i] = -1;
        age[i] = -1;
        continue;
      }
      age[i] = a;
      /* Travel under drag: v DRAG_S (1 - e^(-a / DRAG_S)); a slow sink. */
      const s = DRAG_S * (1 - Math.exp(-a / DRAG_S));
      pos[i * 3] = origin[i * 3] + vel[i * 3] * s;
      pos[i * 3 + 1] = origin[i * 3 + 1] + vel[i * 3 + 1] * s - 0.06 * a;
      pos[i * 3 + 2] = origin[i * 3 + 2] + vel[i * 3 + 2] * s;
    }
    geo.getAttribute('position').needsUpdate = true;
    geo.getAttribute('aAge').needsUpdate = true;
    geo.getAttribute('aSeed').needsUpdate = true;
  }

  /* How many puffs are in the air, for a check. */
  function live() {
    let n = 0;
    for (let i = 0; i < MAX; i += 1) {
      if (born[i] >= 0) {
        n += 1;
      }
    }
    return n;
  }

  return { group, update, clear, live };
}
