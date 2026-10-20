/*
 * render-golden/scene.js: src/render/scene.js, the sky dome the Alps draw:
 * its graph and how it follows the camera, and pictures on SwiftShader of
 * the sky toward and away from the sun. The gates it held left with the
 * track builder (the combat-only cut, 2026-10-20); the sky cases are as
 * they were.
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
import * as sceneModule from '../../../src/render/scene.js';
import { updateCelTime, CLOTH_CHUNK } from '../../../src/render/celmat.js';
import { describeObject, picture, canvas2d } from '../render-golden-lib.js';

const { skyDome } = sceneModule;

let renderer = null;

/* Numbers to the twelve significant digits the lib rounds transforms to,
 * so an ulp of arithmetic is not a failure; structure stays exact. */
function rounded(v) {
  if (typeof v === 'number') {
    return Number(v.toPrecision(12));
  }
  if (Array.isArray(v)) {
    return v.map(rounded);
  }
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rounded(x)]));
  }
  return v;
}

/*
 * A described graph without the shader source hashes. The lib hashes the
 * GLSL text, comments and all, so a rewrite of a shader's prose would fail
 * a golden its pixels pass. What a shader draws is pinned by the pictures
 * below, every shader in this module being in at least one of them.
 */
/*
 * Also, a geometry equal to one described before it in the same case (a
 * gate's dozens of identical number pips) is written as the ref it
 * repeats, which keeps that it is a geometry of its own and keeps the
 * golden a readable size.
 */
/*
 * A cel material's program cache key carries celmat.js's cloth shader text
 * (the key is the injected source itself, so it cannot disagree with the
 * shader). That text is celmat's to change, and celmat's own golden pins
 * what it draws; here it stands as a name, found by celmat's own export,
 * so this golden still tells a cloth program from a plain one and from any
 * other key without pinning another module's source.
 */
function programKey(key) {
  return typeof key === 'string' ? key.split(CLOTH_CHUNK).join('<celmat CLOTH_CHUNK>') : key;
}

function scrub(v, seen = new Map()) {
  if (Array.isArray(v)) {
    return v.map((x) => scrub(x, seen));
  }
  if (!v || typeof v !== 'object') {
    return v;
  }
  if (typeof v.ref === 'string' && v.ref.startsWith('g') && v.attrs) {
    const { ref, ...content } = v;
    const key = JSON.stringify(content);
    if (seen.has(key)) {
      return { ref, as: seen.get(key) };
    }
    seen.set(key, ref);
  }
  const out = {};
  for (const [k, x] of Object.entries(v)) {
    if ((k === 'vertexShader' || k === 'fragmentShader') && v.type === 'ShaderMaterial') {
      continue;
    }
    out[k] = k === 'cacheKey' ? programKey(x) : scrub(x, seen);
  }
  return out;
}

/* The renderer's state, put back after a case. */
function withStage(fn) {
  updateCelTime(0);
  try {
    return fn();
  } finally {
    renderer.setRenderTarget(null);
  }
}

/* The scene drawn and read back as a picture, in sRGB as the screen
 * shows it. */
function shoot(scene, camera, w = 256, h = 160) {
  const target = new THREE.WebGLRenderTarget(w, h, { colorSpace: THREE.SRGBColorSpace });
  renderer.setRenderTarget(target);
  renderer.setClearColor(0x30343c, 1);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  const px = new Uint8Array(w * h * 4);
  renderer.readRenderTargetPixels(target, 0, 0, w, h, px);
  target.dispose();
  const { canvas, ctx } = canvas2d(w, h);
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  }
  ctx.putImageData(img, 0, 0);
  return picture(canvas);
}

/* A camera that sees layer 1, where every lit part of a gate lives. */
function cameraAt(pos, look, far = 400) {
  const camera = new THREE.PerspectiveCamera(50, 1.6, 0.05, far);
  camera.position.set(...pos);
  camera.lookAt(...look);
  camera.layers.enable(1);
  return camera;
}

export function cases(stage) {
  ({ renderer } = stage);
  return {
    exports: () => ({
      scene: Object.keys(sceneModule).sort(),
    }),
    sky: () => {
      const sky = skyDome();
      const graph = scrub(describeObject(sky));
      /* It follows the camera, every draw. */
      const camera = cameraAt([120, 35, -900], [0, 0, 0], 4000);
      camera.updateMatrixWorld();
      sky.onBeforeRender(renderer, new THREE.Scene(), camera);
      return { graph, followed: rounded(sky.position.toArray()), world: rounded(sky.matrixWorld.elements) };
    },
    picSkySun: () => withStage(() => {
      const scene = new THREE.Scene();
      scene.add(skyDome());
      return shoot(scene, cameraAt([0, 2, 0], [0.6, 2.5, 0.62], 4000));
    }),
    /* The sun's edge off centre, where the disc's ramp is. */
    picSkySunEdge: () => withStage(() => {
      const scene = new THREE.Scene();
      scene.add(skyDome());
      const camera = new THREE.PerspectiveCamera(6, 1.6, 0.05, 4000);
      camera.position.set(0, 2, 0);
      camera.lookAt(0.61, 2.5, 0.6);
      return shoot(scene, camera);
    }),
    picSkyAway: () => withStage(() => {
      const scene = new THREE.Scene();
      scene.add(skyDome());
      return shoot(scene, cameraAt([500, 300, -800], [500 - 0.6, 300 + 0.25, -800 - 0.62], 4000));
    }),
    picSkyZenith: () => withStage(() => {
      const scene = new THREE.Scene();
      scene.add(skyDome());
      const camera = new THREE.PerspectiveCamera(100, 1.6, 0.05, 4000);
      camera.position.set(0, 2, 0);
      camera.up.set(0, 0, -1);
      camera.lookAt(0, 3, 0);
      return shoot(scene, camera);
    }),
  };
}
