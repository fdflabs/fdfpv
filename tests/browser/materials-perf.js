/*
 * materials-perf.js: the page side of scripts/materials-perf.js. One
 * aircraft, every region in one finish, the camera close enough that it
 * fills the screen (the worst case: every pixel runs the finish), timed
 * by a GPU query round each frame's draw. window.__run(config) answers
 * one config.
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
import { pixelRatioFor } from '/src/render/quality.js';
import { craftBuilderFor } from '/src/render/craft.js';
import { dressLivery } from '/src/render/livery.js';
import { dressFinish } from '/src/render/finish.js';

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
const gl = renderer.getContext();
const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
const frame = () => new Promise((r) => requestAnimationFrame(r));

const pending = [];
function collect(into) {
  while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
    const q = pending.shift();
    if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) {
      into.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
    }
    gl.deleteQuery(q);
  }
}

window.__run = async ({ preset, craft, finish, frames = 240 }) => {
  renderer.setPixelRatio(pixelRatioFor(preset, 1, { w: innerWidth, h: innerHeight }));
  renderer.setSize(innerWidth, innerHeight, false);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x202428);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(3, 6, 2);
  scene.add(sun, new THREE.AmbientLight(0xffffff, 0.6));
  const model = dressLivery(craftBuilderFor(craft)({ name: 'perf', fog: false }), craft);
  scene.add(model.group);
  const finishes = {};
  if (finish !== 'kit') {
    for (const id of Object.keys(model.livery.materials())) {
      finishes[id] = finish;
    }
  }
  dressFinish(model, finishes, 0);
  const box = new THREE.Box3().setFromObject(model.group);
  const size = box.getSize(new THREE.Vector3());
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.01, 50);
  const gpu = [];
  for (let k = 0; k < 60 + frames; k += 1) {
    /* Turning slowly over it from above, so the highlights move. */
    const a = k * 0.01;
    const d = Math.max(size.x, size.z) * 0.75;
    camera.position.set(Math.cos(a) * d, d * 0.8, Math.sin(a) * d);
    camera.lookAt(box.getCenter(new THREE.Vector3()));
    let q = null;
    if (timer && k >= 60) {
      q = gl.createQuery();
      gl.beginQuery(timer.TIME_ELAPSED_EXT, q);
    }
    renderer.render(scene, camera);
    if (q) {
      gl.endQuery(timer.TIME_ELAPSED_EXT);
      pending.push(q);
    }
    collect(gpu);
    await frame();
  }
  for (let k = 0; k < 30 && pending.length; k += 1) {
    await frame();
    collect(gpu);
  }
  model.group.traverse((o) => o.geometry && o.geometry.dispose());
  const s = [...gpu].sort((x, y) => x - y);
  return { preset, craft, finish, pixels: canvas.width * canvas.height, gpuMs: s.length ? s[Math.floor(s.length / 2)] : null, n: s.length };
};

window.__gpuName = () => {
  const d = gl.getExtension('WEBGL_debug_renderer_info');
  return { renderer: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown', timer: Boolean(timer) };
};
window.__ready = true;
