/*
 * render-golden/budget.js: src/render/budget.js's ledger over a stage
 * holding one of each thing it measures.
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
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { measureBudget } from '../../../src/render/budget.js';

let renderer = null;
let W = 0;
let H = 0;

/* Fragment shaders the tap counter has to read the way a pixel runs them:
 * a helper called from several places, a helper calling a helper, a fetch
 * written only inside a comment, and a loop it can only flag. */
const SHADERS = {
  helpers: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    // texture2D(tDiffuse, vUv) in a line comment is not a fetch
    /* nor is texture2D(tDiffuse, vUv) in a block comment */
    vec4 tap(vec2 o) { return texture2D(tDiffuse, vUv + o); }
    vec4 pair(vec2 o) { return tap(o) + tap(-o); }
    float lum(vec3 c) { return dot(c, vec3(0.3, 0.6, 0.1)); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      c += pair(vec2(0.01, 0.0)) + pair(vec2(0.0, 0.01));
      c += tap(vec2(0.02));
      gl_FragColor = vec4(c.rgb * lum(c.rgb) / 6.0, 1.0);
    }`,
  looped: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = vec4(0.0);
      for (int i = 0; i < 4; i++) { c += texture2D(tDiffuse, vUv + float(i) * 0.001); }
      gl_FragColor = c * 0.25;
    }`,
  plain: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() { gl_FragColor = texture2D(tDiffuse, vUv); }`,
};

function shaderPass(name, fragmentShader) {
  const pass = new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader,
  });
  pass.material.name = name;
  return pass;
}

/* A scene with one of each thing the budget walks: a shadow casting light,
 * indexed and unindexed meshes, one geometry drawn by two meshes, points, a
 * line, a mesh the renderer may not cull, and a light that casts no shadow. */
function budgetScene() {
  const scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(3, 5, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(512, 256);
  scene.add(sun);
  const spot = new THREE.SpotLight(0xffffff, 1);
  spot.castShadow = true;
  spot.shadow.mapSize.set(128, 128);
  scene.add(spot);
  scene.add(new THREE.AmbientLight(0x404040, 1));

  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1, 3, 2, 1), new THREE.MeshStandardMaterial());
  box.castShadow = true;
  scene.add(box);
  const shared = new THREE.SphereGeometry(0.5, 12, 8);
  const a = new THREE.Mesh(shared, new THREE.MeshLambertMaterial());
  a.position.set(-1.5, 0, 0);
  const b = new THREE.Mesh(shared, new THREE.MeshBasicMaterial());
  b.position.set(1.5, 0, 0);
  b.frustumCulled = false;
  scene.add(a, b);
  const flat = new THREE.PlaneGeometry(8, 8, 4, 4).toNonIndexed();
  const ground = new THREE.Mesh(flat, new THREE.MeshPhongMaterial());
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.6;
  ground.receiveShadow = true;
  scene.add(ground);
  const ptsGeo = new THREE.BufferGeometry();
  ptsGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 1, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  scene.add(new THREE.Points(ptsGeo, new THREE.PointsMaterial()));
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 2, 0], 3));
  lineGeo.setAttribute('color', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0], 3));
  scene.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial()));
  /* A mesh with no position attribute: counted as a mesh, listed nowhere. */
  const empty = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  empty.visible = false;
  scene.add(empty);
  return scene;
}

function budgetCamera() {
  const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 100);
  camera.position.set(0, 2, 6);
  camera.lookAt(0, 0, 0);
  return camera;
}

/* A post chain shaped like the shell's: a multisampled scene target with
 * its own depth texture, a half resolution pass into a target of its own,
 * and full resolution passes through the composer's ping pong pair. */
function budgetPost(scene, camera) {
  const msaa = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
  const depthed = new THREE.WebGLRenderTarget(W, H);
  depthed.depthTexture = new THREE.DepthTexture(W, H);
  const half = new THREE.WebGLRenderTarget(W / 2, H / 2, { format: THREE.RedFormat, type: THREE.FloatType, depthBuffer: false });
  const composer = new EffectComposer(renderer, msaa);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(shaderPass('helpers', SHADERS.helpers));
  composer.addPass(shaderPass('looped', SHADERS.looped));
  const out = shaderPass('', SHADERS.plain);
  composer.addPass(out);
  const halfQuad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }',
      fragmentShader: SHADERS.plain,
    }),
  );
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  return {
    composer,
    render() {
      renderer.setRenderTarget(depthed);
      renderer.render(scene, camera);
      halfQuad.material.uniforms.tDiffuse.value = depthed.texture;
      renderer.setRenderTarget(half);
      renderer.render(halfQuad, ortho);
      renderer.setRenderTarget(null);
      composer.render();
    },
  };
}


export function cases(stage) {
  ({ renderer, W, H } = stage);
  return {
    /* measureBudget over the stage above: the ledger's every line. */
    ledger: () => {
      const scene = budgetScene();
      const camera = budgetCamera();
      const post = budgetPost(scene, camera);
      /* The first frame allocates the shadow maps; the ledger reads a warm
       * frame, as the shell's capture does. */
      post.render();
      return measureBudget({ renderer }, { scene, post }, { view: 'golden stage' });
    },
    /* No composer and no name: the unnamed view, and only the targets the
     * frame bound plus the canvas. */
    bare: () => {
      const scene = budgetScene();
      const camera = budgetCamera();
      const post = { render() { renderer.setRenderTarget(null); renderer.render(scene, camera); } };
      post.render();
      return measureBudget({ renderer }, { scene, post });
    },
  };
}
