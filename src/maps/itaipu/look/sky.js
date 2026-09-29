/*
 * sky.js: swiss2's photographed sky over Itaipu, turned to Itaipu's sun.
 *
 * The sky is swiss2's (assets/swiss2/sky_back.jpg and sky_env.hdr, CC0),
 * the only photographed sky in the tree. Its sun stands at SUN_U round
 * the equirect; Itaipu's is due east (light.js). So the backdrop and the
 * environment are both turned about the vertical by the difference, the
 * backdrop in its shader and the environment by rolling the HDR's
 * columns before it is prefiltered, so the bright side of the sky that
 * lights the ground is the side the sun is on. The photograph's sun is
 * 37.8 degrees up and Itaipu's 65.8, which a turn cannot mend: the sky's
 * glow sits lower than this sun. Recorded, not hidden; the loop owns the
 * sky from round 0.
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
import { SKY_K, SKY_SPAN_DEG, SUN_U } from '../../swiss2/assets.js';
import { SUN_COLOR } from '../../swiss2/light.js';

/* How far round the equirect to read so the photograph's sun lands on
 * `sunDir`, in u. */
export function skyTurn(sunDir) {
  return (SUN_U - 0.5) - Math.atan2(sunDir.z, sunDir.x) / (2 * Math.PI);
}

/* Roll an equirect DataTexture's columns by `turn` of its width, in
 * place: texel u afterwards is texel u + turn before. */
export function turnEquirect(tex, turn) {
  const { width, height, data } = tex.image;
  const ch = data.length / (width * height);
  const s = ((Math.round(turn * width) % width) + width) % width;
  if (!s) {
    return;
  }
  const row = new data.constructor(width * ch);
  for (let y = 0; y < height; y += 1) {
    const at = y * width * ch;
    row.set(data.subarray(at, at + width * ch));
    for (let x = 0; x < width; x += 1) {
      const from = ((x + s) % width) * ch;
      for (let c = 0; c < ch; c += 1) {
        data[at + x * ch + c] = row[from + c];
      }
    }
  }
  tex.needsUpdate = true;
}

/*
 * The backdrop: swiss2.js's skyBackdrop with the turn. Radiance, not
 * colour; the post chain exposes it with everything else, and the sun's
 * disc is drawn over it far brighter than a photograph stores, for the
 * bloom.
 */
export function skyBackdrop(back, sunDir) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      uBack: { value: back },
      uInvK: { value: 1 / SKY_K },
      uSpan: { value: SKY_SPAN_DEG },
      uTurn: { value: skyTurn(sunDir) },
      uSun: { value: sunDir.clone() },
      uSunCol: { value: SUN_COLOR.clone().multiplyScalar(4000) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      uniform sampler2D uBack;
      uniform float uInvK;
      uniform float uSpan;
      uniform float uTurn;
      uniform vec3 uSun;
      uniform vec3 uSunCol;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float u = atan(d.z, d.x) * RECIPROCAL_PI2 + 0.5 + uTurn;
        float elev = asin(clamp(d.y, -1.0, 1.0)) * 57.29578;
        float v = clamp((elev + (uSpan - 90.0)) / uSpan, 0.001, 0.999);
        vec3 c = texture2D(uBack, vec2(u, v)).rgb * uInvK;
        float disc = smoothstep(0.99998, 0.999992, dot(d, uSun));
        gl_FragColor = vec4(c + uSunCol * disc, 1.0);
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
  };
  return sky;
}
