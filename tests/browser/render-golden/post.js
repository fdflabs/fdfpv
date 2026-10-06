/*
 * render-golden/post.js: src/render/post.js's composer. The chain each
 * quality builds (passes, their uniforms, targets and which carry depth),
 * which layer 1 objects it promotes into the depth prepass, the renderer,
 * scene and camera state its prepass leaves behind, resizing under a new
 * pixel ratio, what dispose frees, attachComposer's wiring, the sharpen
 * pass, and pictures of a frame through each chain (and of the prepass's
 * packed normals and depth) on SwiftShader.
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
import * as postModule from '../../../src/render/post.js';

const { buildComposer, attachComposer, makeSharpenPass, sizeSharpenPass } = postModule;
import { describeValue, makeTable, picture, canvas2d } from '../render-golden-lib.js';

let renderer = null;
const W = 320;
const H = 180;

const QUALITIES = {
  none: null,
  high: { field: { outline: true, bloom: true } },
  medium: { field: { outline: true, bloom: false } },
  low: { field: { outline: false, bloom: false } },
  noField: {},
};

/* A small world with everything the chain reacts to: lit solids at
 * several depths with creases, a ground seen edge on, a far ridge, a
 * bright object for bloom, layer 1 objects that occlude (a ring) and do
 * not (an additive glow, a no depth write sky), a layer 2 grass strip,
 * and a background colour. */
function world() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fb4dc);
  scene.fog = new THREE.Fog(0x8fb4dc, 30, 90);
  scene.add(new THREE.HemisphereLight(0xdde8ff, 0x445533, 0.7));
  const sun = new THREE.DirectionalLight(0xffeedd, 2);
  sun.position.set(4, 8, 3);
  scene.add(sun);
  const lambert = (c) => new THREE.MeshLambertMaterial({ color: c });
  const add = (mesh, x, y, z, layer) => {
    mesh.position.set(x, y, z);
    if (layer !== undefined) {
      mesh.layers.set(layer);
    }
    scene.add(mesh);
    return mesh;
  };
  const ground = add(new THREE.Mesh(new THREE.PlaneGeometry(200, 200), lambert(0x557a3a)), 0, 0, 0);
  ground.rotation.x = -Math.PI / 2;
  add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), lambert(0xc06030)), -1.6, 0.75, -4).rotation.y = 0.6;
  add(new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), lambert(0x3060c0)), 1.4, 1, -6);
  add(new THREE.Mesh(new THREE.ConeGeometry(6, 9, 5), lambert(0x6a6a70)), 8, 4.5, -40);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff })), 0, 2.4, -8);
  add(new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.12, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffd45c })), 0, 1.6, -10, 1).name = 'ring';
  add(new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ color: 0x40ff80, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })), 0, 1.6, -10.05, 1).name = 'glow';
  add(new THREE.Mesh(new THREE.SphereGeometry(80, 8, 6), new THREE.MeshBasicMaterial({ color: 0xa0c4ec, side: THREE.BackSide, depthWrite: false })), 0, 0, 0, 1).name = 'sky';
  const both = add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), lambert(0xffffff)), 2.5, 0.2, -3, 1);
  both.layers.enable(0);
  both.name = 'inkAndNoInk';
  add(new THREE.Mesh(new THREE.PlaneGeometry(6, 0.6), lambert(0x88aa44)), 0, 0.3, -3.5, 2).name = 'grass';
  return scene;
}

function cameraFor() {
  const camera = new THREE.PerspectiveCamera(60, W / H, 0.2, 200);
  camera.position.set(0.3, 1.6, 3);
  camera.lookAt(0, 1.1, -6);
  camera.layers.enable(1);
  camera.layers.enable(2);
  return camera;
}

/* The renderer as the shell sets it, at the case's size, put back after. */
function withStage(fn, ratio = 1) {
  const size = renderer.getSize(new THREE.Vector2());
  const keepRatio = renderer.getPixelRatio();
  renderer.setPixelRatio(ratio);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  try {
    return fn();
  } finally {
    renderer.setPixelRatio(keepRatio);
    renderer.setSize(size.x, size.y, false);
  }
}

function screenPicture() {
  const c = renderer.domElement;
  const { canvas, ctx } = canvas2d(c.width, c.height);
  ctx.drawImage(c, 0, 0);
  return picture(canvas);
}

function targetPicture(target) {
  const w = target.width;
  const h = target.height;
  const px = new Uint8Array(w * h * 4);
  renderer.readRenderTargetPixels(target, 0, 0, w, h, px);
  const { canvas, ctx } = canvas2d(w, h);
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  }
  ctx.putImageData(img, 0, 0);
  return picture(canvas);
}

function describeTarget(rt) {
  if (!rt) {
    return null;
  }
  return { w: rt.width, h: rt.height, type: rt.texture.type, format: rt.texture.format, filter: [rt.texture.minFilter, rt.texture.magFilter], depth: rt.depthBuffer, depthTexture: Boolean(rt.depthTexture), samples: rt.samples };
}

function describePass(p, table) {
  const out = { type: p.constructor.name, enabled: p.enabled, needsSwap: p.needsSwap, clear: p.clear, renderToScreen: p.renderToScreen };
  const uniforms = p.uniforms || (p.material && p.material.uniforms);
  if (uniforms) {
    out.uniforms = Object.fromEntries(Object.keys(uniforms).sort().map((k) => [k, describeValue(uniforms[k].value, table)]));
  }
  if (p.material && p.material.fragmentShader) {
    out.fragmentTaps = (p.material.fragmentShader.match(/texture2D\s*\(/g) || []).length;
  }
  if (p.constructor.name === 'UnrealBloomPass') {
    out.bloom = { strength: p.strength, radius: p.radius, threshold: p.threshold, resolution: p.resolution.toArray() };
  }
  return out;
}

function describeChain(post, table) {
  return {
    keys: Object.keys(post).sort(),
    passes: post.composer.passes.map((p) => describePass(p, table)),
    composer: [describeTarget(post.composer.renderTarget1), describeTarget(post.composer.renderTarget2)],
    writeDepth: post.composer.writeBuffer.depthBuffer,
    readDepth: post.composer.readBuffer.depthBuffer,
    normalTarget: describeTarget(post.normalTarget),
    bloomTargets: post.bloom ? [post.bloom.renderTargetBright, ...post.bloom.renderTargetsHorizontal, ...post.bloom.renderTargetsVertical].map(describeTarget) : null,
    handles: ['outline', 'bloom', 'grade', 'sharpen'].map((k) => [k, post[k] ? post[k].constructor.name : null]),
    sharpenIsLast: post.composer.passes[post.composer.passes.length - 1] === post.sharpen,
  };
}

function stateOf(scene, camera) {
  const c = new THREE.Color();
  renderer.getClearColor(c);
  return {
    background: scene.background ? scene.background.getHexString() : null,
    fog: Boolean(scene.fog),
    override: scene.overrideMaterial,
    mask: camera.layers.mask,
    autoClear: renderer.autoClear,
    clear: [c.getHexString(), renderer.getClearAlpha()],
    shadowAuto: renderer.shadowMap.autoUpdate,
    target: renderer.getRenderTarget(),
  };
}

export function cases(stage) {
  ({ renderer } = stage);
  return {
    exports: () => Object.keys(postModule).sort(),
    chains: () => withStage(() => Object.fromEntries(Object.entries(QUALITIES).map(([name, q]) => {
      const scene = world();
      const post = buildComposer(renderer, scene, cameraFor(), q);
      const chain = describeChain(post, makeTable());
      const layers = [];
      scene.traverse((o) => {
        if (o.name) {
          layers.push([o.name, o.layers.mask]);
        }
      });
      post.dispose();
      return [name, { chain, layers }];
    }))),
    shaders: () => withStage(() => {
      const post = buildComposer(renderer, world(), cameraFor(), null);
      const out = post.composer.passes.filter((p) => p.material && p.material.fragmentShader).map((p) => [p.constructor.name, (p.material.fragmentShader.match(/texture2D\s*\(/g) || []).length]);
      post.dispose();
      return out;
    }),
    state: () => withStage(() => {
      const scene = world();
      const camera = cameraFor();
      renderer.setClearColor(0x123456, 0.5);
      renderer.autoClear = true;
      renderer.shadowMap.autoUpdate = true;
      const post = buildComposer(renderer, scene, camera, null);
      const before = stateOf(scene, camera);
      post.render();
      const after = stateOf(scene, camera);
      post.dispose();
      return { same: JSON.stringify(before) === JSON.stringify(after), before: { ...before, override: before.override === null, target: before.target === null } };
    }),
    pictures: () => withStage(() => Object.fromEntries(Object.entries(QUALITIES).map(([name, q]) => {
      const scene = world();
      const camera = cameraFor();
      const post = buildComposer(renderer, scene, camera, q);
      post.setSize(W, H);
      post.render();
      const shot = screenPicture();
      const prepass = post.normalTarget ? targetPicture(post.normalTarget) : null;
      post.dispose();
      return [name, { shot, prepass }];
    }))),
    sharpened: () => withStage(() => {
      const scene = world();
      const post = buildComposer(renderer, scene, cameraFor(), null);
      post.sharpen.enabled = true;
      post.setSize(W, H);
      post.render();
      const shot = screenPicture();
      post.dispose();
      return shot;
    }),
    resize: () => withStage(() => {
      const post = buildComposer(renderer, world(), cameraFor(), null);
      const rows = [];
      for (const [ratio, w, h] of [[1, W, H], [0.55, W, H], [2, 100, 60], [1, 1, 1], [0.3, 7, 3]]) {
        renderer.setPixelRatio(ratio);
        post.setSize(w, h);
        rows.push({ ratio, w, h, chain: describeChain(post, makeTable()) });
      }
      post.dispose();
      return rows;
    }),
    dispose: () => withStage(() => {
      const freed = [];
      const kinds = [THREE.Material, THREE.WebGLRenderTarget, THREE.BufferGeometry];
      const reals = kinds.map((K) => K.prototype.dispose);
      const post = buildComposer(renderer, world(), cameraFor(), null);
      const names = new Map([[post.composer.renderTarget1, 'rt1'], [post.composer.renderTarget2, 'rt2'], [post.normalTarget, 'normal'], [post.grade.material, 'grade'], [post.sharpen.material, 'sharpen'], [post.outline.material, 'outline'], [post.composer.copyPass.material, 'copy']]);
      kinds.forEach((K, i) => {
        K.prototype.dispose = function dispose() {
          freed.push(names.get(this) || this.type || this.constructor.name);
          return reals[i].call(this);
        };
      });
      try {
        post.dispose();
      } finally {
        kinds.forEach((K, i) => { K.prototype.dispose = reals[i]; });
      }
      return freed.sort();
    }),
    attach: () => withStage(() => {
      const calls = [];
      const scene = world();
      const shell = { renderer, camera: cameraFor(), resize: () => { calls.push('resize'); return { w: 200, h: 100 }; } };
      const map = { scene, dispose: () => calls.push('scene dispose') };
      const back = attachComposer(shell, map, QUALITIES.medium);
      const sized = [back.post.composer.renderTarget1.width, back.post.composer.renderTarget1.height];
      const realDispose = back.post.dispose;
      back.post.dispose = () => {
        calls.push('post dispose');
        realDispose();
      };
      back.dispose();
      return { same: back === map, sized, calls, chain: back.post.bloom === null };
    }),
    sharpenPass: () => {
      const p = makeSharpenPass();
      sizeSharpenPass(p, 1600, 900, 0.5);
      const a = p.material.uniforms.uTexel.value.toArray();
      sizeSharpenPass(p, 0, 0, 0);
      const b = p.material.uniforms.uTexel.value.toArray();
      return { enabled: p.enabled, needsSwap: p.needsSwap, a, b, uniforms: Object.keys(p.material.uniforms).sort() };
    },
  };
}
