/*
 * render-golden/celmat.js: src/render/celmat.js. The toon gradient chunk
 * as patched, the colour ramp, the materials each option set produces
 * (settings, identity for the scenery merger, which share a compiled
 * program), the uniforms their compile hook adds, the per frame clock's
 * registry across compiles, recompiles and disposals, the outline hull,
 * and pictures of every option drawn on SwiftShader: rim, specular, cloud
 * shadow at two clock times, waving cloth, fog, maps with alpha test,
 * transparency and double sided faces.
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
import * as cel from '../../../src/render/celmat.js';
import { SESSION_TEXTURES } from '../../../src/render/session-textures.js';
import { describeMaterial, describeObject, describeTexture, describeValue, makeTable, picture, canvas2d } from '../render-golden-lib.js';

let renderer = null;

function checkerTexture() {
  const { canvas, ctx } = canvas2d(16, 16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      ctx.fillStyle = (i + j) % 2 ? 'rgba(255,40,40,1)' : 'rgba(40,40,255,0.2)';
      ctx.fillRect(i * 4, j * 4, 4, 4);
    }
  }
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}
const MAP = checkerTexture();

const OPTIONS = {
  plain: {},
  coloured: { color: 0x3a7d44 },
  rim: { color: 0x202833, rim: 0.9, rimStart: 0.3, rimColor: 0xffc070 },
  spec: { color: 0xc0c8d0, spec: 1, specWidth: 0.05, specColor: 0xfff0d0 },
  cloud: { color: 0x7fa060, cloudShadow: 1 },
  cloth: { color: 0xd04040, cloth: cel.FLAG_SAIL_CLOTH * 4 },
  noFog: { color: 0x9090a0, fog: false },
  mapped: { map: MAP, key: 'checker', alphaTest: 0.5 },
  glass: { color: 0x80c0ff, transparent: true, opacity: 0.4, side: THREE.DoubleSide },
};

/* A plane whose aCloth runs 0 at x = -1 to 1 at x = 1, height on y. */
function clothPlane() {
  const g = new THREE.PlaneGeometry(2, 2, 12, 12);
  const p = g.attributes.position;
  const a = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    a[i * 2] = (p.getX(i) + 1) / 2;
    a[i * 2 + 1] = (p.getY(i) + 1) / 2;
  }
  g.setAttribute('aCloth', new THREE.BufferAttribute(a, 2));
  return g;
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

function litScene(fogged) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x404830, 0.6));
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
  sun.position.set(3, 5, 2);
  scene.add(sun);
  if (fogged) {
    scene.fog = new THREE.Fog(0x9fb0c8, 4, 14);
  }
  return scene;
}

function sphereShot(opts, t) {
  const scene = litScene(true);
  const mat = cel.celMaterial(opts);
  const geo = opts.cloth ? clothPlane() : new THREE.SphereGeometry(1, 48, 32);
  const near = new THREE.Mesh(geo, mat);
  near.rotation.y = opts.cloth ? 0.5 : 0;
  scene.add(near);
  const far = new THREE.Mesh(geo, mat);
  far.position.set(2.6, 0.2, -9);
  scene.add(far);
  if (opts.cloudShadow) {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.2;
    scene.add(ground);
  }
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 100);
  camera.position.set(0.6, 1.2, 3.6);
  camera.lookAt(0.4, -0.1, -1);
  cel.updateCelTime(t);
  const shot = shoot(scene, camera);
  mat.dispose();
  return shot;
}

/* The cloud shadows seen from high above a wide field, where their
 * shapes (hundreds of metres across) fill the frame. */
function cloudsFromAbove(t) {
  const scene = litScene(false);
  const mat = cel.celMaterial({ color: 0x8fb070, cloudShadow: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), mat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const camera = new THREE.PerspectiveCamera(60, 1.6, 10, 5000);
  camera.position.set(200, 1400, 300);
  camera.lookAt(200, 0, 299);
  cel.updateCelTime(t);
  const shot = shoot(scene, camera);
  mat.dispose();
  return shot;
}

/* A fake compile: three's toon sources through the material's hook. */
function compileHook(mat) {
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.toon.vertexShader, fragmentShader: THREE.ShaderLib.toon.fragmentShader };
  mat.onBeforeCompile(shader, renderer);
  return shader;
}

export function cases(stage) {
  ({ renderer } = stage);
  return {
    exports: () => Object.keys(cel).sort(),
    constants: () => ({ FLAG_SAIL_CLOTH: cel.FLAG_SAIL_CLOTH, chunkTypes: [typeof cel.CLOUD_SHADOW_GLSL, typeof cel.CLOTH_CHUNK] }),
    chunk: () => THREE.ShaderChunk.gradientmap_pars_fragment,
    ramp: () => {
      const t = cel.celRampTexture();
      return { same: t === cel.celRampTexture(), texture: describeTexture(t, makeTable()), bytes: Array.from(t.image.data) };
    },
    materials: () => {
      const table = makeTable();
      const keys = [];
      const out = Object.fromEntries(Object.entries(OPTIONS).map(([name, opts]) => {
        const m = cel.celMaterial(opts);
        const d = describeMaterial(m, table);
        delete d.cacheKey;
        const key = m.customProgramCacheKey();
        if (!keys.includes(key)) {
          keys.push(key);
        }
        return [name, { material: d, celKey: m.userData.celKey, cel: m.userData.cel, program: keys.indexOf(key) }];
      }));
      let threw = null;
      try {
        cel.celMaterial({ map: MAP });
      } catch (e) {
        threw = e.message;
      }
      return { out, threw, gradientShared: cel.celMaterial().gradientMap === cel.celRampTexture() };
    },
    uniforms: () => Object.fromEntries(Object.entries(OPTIONS).map(([name, opts]) => {
      const shader = compileHook(cel.celMaterial(opts));
      const table = makeTable();
      return [name, Object.fromEntries(Object.keys(shader.uniforms).sort().map((k) => [k, describeValue(shader.uniforms[k].value, table)]))];
    })),
    clock: () => {
      const base = cel.celTimeCount();
      const mats = [cel.celMaterial(), cel.celMaterial({ cloth: 0.1 }), cel.celMaterial({ rim: 0 })];
      const shaders = mats.map(compileHook);
      const afterCompile = cel.celTimeCount() - base;
      const again = compileHook(mats[0]);
      const afterRecompile = cel.celTimeCount() - base;
      cel.updateCelTime(12.25);
      const values = [...shaders.map((s) => s.uniforms.uCelTime.value), again.uniforms.uCelTime.value];
      mats[1].dispose();
      const afterDispose = cel.celTimeCount() - base;
      mats[0].dispose();
      mats[2].dispose();
      return { afterCompile, afterRecompile, values, afterDispose, end: cel.celTimeCount() - base };
    },
    /* session-textures.js: what a map's dispose must keep, which is the
     * ramp and only the ramp. */
    session: () => [...SESSION_TEXTURES].map((t) => (t === cel.celRampTexture() ? 'ramp' : t.constructor.name)),
    hull: () => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 3), new THREE.MeshBasicMaterial());
      mesh.scale.set(2, 2, 2);
      const back = cel.outlineHull(mesh);
      const custom = cel.outlineHull(new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshBasicMaterial()), 1.13, 0xff00ff);
      return { returned: back === mesh, sharesGeometry: mesh.children[0].geometry === mesh.geometry, mesh: describeObject(mesh), custom: describeObject(custom) };
    },
    pictures: () => Object.fromEntries(Object.entries(OPTIONS).map(([name, opts]) => [name, sphereShot(opts, 3.5)])),
    picturesLater: () => ({ cloud: sphereShot(OPTIONS.cloud, 140), cloth: sphereShot(OPTIONS.cloth, 1.9) }),
    clouds: () => ({ early: cloudsFromAbove(3.5), late: cloudsFromAbove(900) }),
  };
}
