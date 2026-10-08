/*
 * hangar-room-perf.js: the page side of scripts/hangar-room-perf.js. Builds
 * the room the game draws (src/render/hangarroomview.js) on a renderer
 * made as the shell makes its own (src/render/shell.js buildShell: no
 * depth, no antialias, sRGB out), walks the pilot a fixed loop and times
 * each frame's draw on the GPU. window.__run(config) answers one config.
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
import { createRoomView } from '/src/render/hangarroomview.js';
import { ROOMS, LAYOUTS, occupancy, startPose, walk } from '/src/game/hangarroom.js';
import { qualityFor, pixelRatioFor } from '/src/render/quality.js';
import { craftBuilderFor } from '/src/render/craft.js';
import { dressLivery } from '/src/render/livery.js';

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance',
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const gl = renderer.getContext();
const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
const frame = () => new Promise((r) => requestAnimationFrame(r));

/* GPU time of one draw: a query round it, read back frames later. */
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

window.__run = async ({ preset, tier, naive = false, craft = 'cub1400', frames = 300, shot = false }) => {
  const graphics = qualityFor(preset);
  renderer.setPixelRatio(pixelRatioFor(preset, 1, { w: innerWidth, h: innerHeight }));
  renderer.setSize(innerWidth, innerHeight, false);
  const view = createRoomView(renderer, { graphics, naive });
  view.setRoom(tier);
  const model = craft ? dressLivery(craftBuilderFor(craft)({ name: 'room-craft', fog: false }), craft) : null;
  view.setCraft(model);
  /* A full trophy wall, every slot taken. */
  view.setTrophies(Array.from({ length: 18 }, (_, i) => `mission:m${i}:win`));
  const room = ROOMS[tier];
  const occ = occupancy(room, LAYOUTS[tier]);
  let pose = startPose(room);
  const gpu = [];
  const cpu = [];
  const calls = [];
  const tris = [];
  const dt = 1 / 60;
  for (let k = 0; k < 60 + frames; k += 1) {
    /* A loop round the room: forward, a steady turn, the walls and the
     * furniture sliding the pilot along. */
    pose = walk(room, occ, pose, { forward: 1, turn: 0.45 }, dt);
    view.update(dt, pose, k * dt * 1000, Math.sin(k * 0.01) * 0.6);
    const t0 = performance.now();
    let q = null;
    if (timer && k >= 60) {
      q = gl.createQuery();
      gl.beginQuery(timer.TIME_ELAPSED_EXT, q);
    }
    view.draw();
    if (q) {
      gl.endQuery(timer.TIME_ELAPSED_EXT);
      pending.push(q);
    }
    if (k >= 60) {
      cpu.push(performance.now() - t0);
      calls.push(view.stats().calls);
      tris.push(view.stats().triangles);
    }
    collect(gpu);
    await frame();
  }
  for (let k = 0; k < 30 && pending.length; k += 1) {
    await frame();
    collect(gpu);
  }
  const mem = { ...renderer.info.memory, programs: renderer.info.programs.length };
  let png = null;
  if (shot) {
    view.draw();
    png = canvas.toDataURL('image/png');
  }
  view.dispose();
  if (model) {
    model.group.traverse((o) => o.geometry && o.geometry.dispose());
  }
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const p95 = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length * 0.95)] : null; };
  return {
    preset, tier, naive, craft, frames,
    pixels: renderer.domElement.width * renderer.domElement.height,
    calls: Math.max(...calls), tris: Math.max(...tris),
    textures: mem.textures, geometries: mem.geometries, programs: mem.programs,
    gpuMs: med(gpu), gpuP95: p95(gpu), gpuN: gpu.length, cpuMs: med(cpu),
    png,
  };
};

window.__craftCalls = (ids) => ids.map((id) => {
  const m = craftBuilderFor(id)({ name: 'count', fog: false });
  let n = 0;
  m.group.traverse((o) => { if (o.isMesh && o.visible) n += 1; });
  return { id, meshes: n };
});
window.__gpuName = () => {
  const d = gl.getExtension('WEBGL_debug_renderer_info');
  return { renderer: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown', timer: Boolean(timer) };
};
window.__ready = true;
