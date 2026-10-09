/*
 * swiss2-veg-check.js: the page behind swiss2-veg-check.html.
 *
 * Loads swiss2's plant atlases (vegetation/atlas.js loadAtlases) onto a
 * renderer of its own and hands scripts/swiss2-veg-check.js two
 * measurements as window.__veg:
 *
 *   frames(): the impostors' frame lookup (vegetation/impostor.js
 *     IMP_FRAME_GLSL) run on every frame number the atlas holds, the
 *     number arriving as a varying across a tilted quad in perspective,
 *     the way the far trees bring it. Each pixel says whether the lookup
 *     landed inside that frame's own cell. Returns the frames where any
 *     pixel did not.
 *
 *   uploaded(): the fraction of texels over half alpha in the top five
 *     levels of the foliage and grass atlases, as the GPU was handed
 *     them (each level drawn at its own size and read back). It never
 *     reads the canvases themselves: Chrome moves a canvas read back more
 *     than once off the GPU, which is the fix, and a check that did would
 *     pass without it.
 *
 * `events` records the WebGL context being lost and restored, which the
 * check causes by killing the GPU process.
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
import { loadAtlases } from '../../src/render/library/vegetation/atlas.js';
import {
  IMP_FRAME_GLSL, GRID, MAX_VARIANTS, AZIMUTHS, ELEVATIONS,
} from '../../src/render/library/vegetation/impostor.js';

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(64, 64);
document.body.appendChild(renderer.domElement);
const events = [];
renderer.domElement.addEventListener('webglcontextlost', () => events.push('lost'));
renderer.domElement.addEventListener('webglcontextrestored', () => events.push('restored'));

/* Draw `mesh` seen by `camera` into a size x size target and read it back. */
function drawn(mesh, camera, size) {
  const rt = new THREE.WebGLRenderTarget(size, size);
  const scene = new THREE.Scene();
  scene.add(mesh);
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  const px = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
  renderer.setRenderTarget(null);
  rt.dispose();
  return px;
}

function frames() {
  const material = new THREE.ShaderMaterial({
    uniforms: { uF: { value: 0 }, uPad: { value: 1.5 / 128 }, uAlbedo: { value: null } },
    vertexShader: `
      uniform float uF;
      varying vec2 vImpUv;
      varying vec4 vImpF;
      varying vec4 vImpW;
      void main() {
        vImpUv = uv;
        vImpF = vec4(uF);
        vImpW = vec4(1.0, 0.0, 0.0, 0.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uF;
      ${IMP_FRAME_GLSL}
      void main() {
        vec2 at = impFrame(vImpF.x) * ${GRID}.0;
        vec2 cell = vec2(mod(uF, ${GRID}.0), floor(uF / ${GRID}.0));
        bool inside = all(greaterThanEqual(at, cell)) && all(lessThanEqual(at, cell + 1.0));
        gl_FragColor = vec4(inside ? 0.0 : 1.0, 1.0, 0.0, 1.0);
      }`,
    side: THREE.DoubleSide,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(4, 40), material);
  quad.rotation.x = -1.35;
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0.3, 1.5, 3);
  camera.lookAt(0, 0, -10);
  const misses = [];
  const count = MAX_VARIANTS * AZIMUTHS * ELEVATIONS.length;
  for (let f = 0; f < count; f += 1) {
    material.uniforms.uF.value = f;
    const px = drawn(quad, camera, 256);
    let bad = 0;
    let lit = 0;
    for (let i = 0; i < px.length; i += 4) {
      lit += px[i + 1] > 127 ? 1 : 0;
      bad += px[i + 1] > 127 && px[i] > 127 ? 1 : 0;
    }
    if (bad || !lit) {
      misses.push({ f, bad, lit });
    }
  }
  quad.geometry.dispose();
  material.dispose();
  return { count, misses };
}

function uploadedCover(texture, level) {
  const { width, height } = texture.mipmaps[level];
  const material = new THREE.ShaderMaterial({
    uniforms: { map: { value: texture } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D map; varying vec2 vUv; void main() { gl_FragColor = textureLod(map, vUv, ${level}.0); }`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const size = Math.max(width, height);
  const px = drawn(quad, new THREE.OrthographicCamera(), size);
  quad.geometry.dispose();
  material.dispose();
  let n = 0;
  for (let k = 3; k < px.length; k += 4) {
    n += px[k] > 127 ? 1 : 0;
  }
  /* The target is square and the texture is stretched over it, so the
   * fraction is the texture's. */
  return n / (px.length / 4);
}

/* The top five levels of both atlases, by name: foliage0 is the top. */
const each = (measure) => Object.fromEntries(['foliage', 'grass'].flatMap((k) => [0, 1, 2, 3, 4].map((level) => [`${k}${level}`, measure(k, level)])));

const atlases = await loadAtlases();
window.__veg = {
  events,
  frames,
  uploaded: () => each((k, level) => uploadedCover(atlases[k], level)),
};
