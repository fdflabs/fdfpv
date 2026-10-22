/*
 * render-golden/photo-look.js: the photographic material kit every
 * photographed map's builders are answered with (makePhotoLook, worldUv
 * and finishScene, src/maps/swiss2/look.js when this was recorded) and
 * the sun's shadow cascades (makeSun, src/maps/swiss2/light.js), which
 * Itaipu and the Interior take from the Swiss valley's folder, pinned
 * before they move into the shared asset library (docs/ASSET-LIBRARY.md),
 * so the move is proved to change nothing: every material the kit makes
 * with its shader text and program key, the metre uvs it gives a
 * geometry, what finishScene does to a scene, and the sun's lights.
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
import * as look from '../../../src/render/library/photolook.js';
import { makeSun } from '../../../src/render/library/sun.js';
import { SURFACES } from '../../../src/render/library/surfaces.js';
import {
  describeGeometry, describeMaterial, describeObject, makeTable, hashText, describeValue,
} from '../render-golden-lib.js';

/* The sun the Swiss valley lit itself with (src/maps/swiss2/light.js, gone
 * with the valleys on 2026-10-20), kept here as the values the golden was
 * recorded with. */
const SUN_COLOR = new THREE.Color(1.0, 0.96, 0.9);
const SUN_IRRADIANCE = 2.7 * 1.3;

const sig = (v) => (typeof v === 'number' ? Number(v.toPrecision(12)) + 0 : v);
const round = (o) => JSON.parse(JSON.stringify(o, (k, v) => sig(v)));

function texture(w, h, v) {
  const t = new THREE.DataTexture(new Uint8Array(w * h * 4).fill(v), w, h);
  t.needsUpdate = true;
  return t;
}

/* The kit's inputs: every surface a set of three small maps, a ground
 * that says what it was asked for, the heights' uniforms. */
function made() {
  const surfaces = Object.fromEntries(SURFACES.map((n, k) => [n, { col: texture(2, 2, 40 + k), nrm: texture(2, 2, 128), arm: texture(2, 2, 200 - k) }]));
  const ground = (opts) => {
    const m = new THREE.MeshStandardMaterial({ color: 0x336633 });
    m.userData.groundOpts = JSON.stringify(opts);
    return m;
  };
  const heights = { texture: { value: null }, grid: { value: new THREE.Vector4(1, 2, 3, 4) } };
  return look.makePhotoLook({ surfaces, ground, heights });
}

function shaders(m) {
  if (!m || m.onBeforeCompile === THREE.Material.prototype.onBeforeCompile) {
    return m ? { key: m.customProgramCacheKey() === m.onBeforeCompile.toString() ? 'default' : m.customProgramCacheKey() } : null;
  }
  const lib = THREE.ShaderLib[m.type === 'MeshPhysicalMaterial' ? 'physical' : 'standard'];
  const shader = {
    vertexShader: lib.vertexShader,
    fragmentShader: lib.fragmentShader,
    uniforms: THREE.UniformsUtils.clone(lib.uniforms),
    defines: { ...(m.defines || {}) },
  };
  const before = new Set(Object.keys(shader.uniforms));
  m.onBeforeCompile(shader, null);
  const table = makeTable();
  return {
    vertex: hashText(shader.vertexShader),
    fragment: hashText(shader.fragmentShader),
    added: Object.keys(shader.uniforms).filter((k) => !before.has(k)).sort().map((k) => [k, describeValue(shader.uniforms[k].value, table)]),
    defines: shader.defines,
    key: m.customProgramCacheKey(),
  };
}
const both = (m, table) => ({ material: describeMaterial(m, table), shaders: shaders(m) });

const NAMES = ['strip', 'timber', 'boat-hull', 'gravel-path', 'path', 'drift', 'reeds', 'reeds-deep', 'reed-heads'];
const PARTS = ['far-range', 'paint', 'lift', 'windsock', 'fauna'];

export function cases() {
  return {
    exports: () => Object.keys(look).sort(),
    kit: () => {
      const k = made();
      return { keys: Object.keys(k).sort(), style: k.style };
    },
    village: () => {
      const k = made();
      const table = makeTable();
      const v = k.village();
      return Object.fromEntries(Object.keys(v).map((key) => [key, { ...both(v[key], table), finish: round(k.buildingFinish(key)) }]));
    },
    groups: () => {
      const k = made();
      const table = makeTable();
      const g = k.buildingGroups({ glass: 'the glass', water: 'the water' });
      return Object.fromEntries(Object.keys(g).map((key) => [key, typeof g[key] === 'string' ? g[key] : both(g[key], table)]));
    },
    named: () => {
      const k = made();
      const table = makeTable();
      return {
        material: NAMES.map((n) => [n, both(k.material(n, { side: THREE.DoubleSide }), table)]),
        materialPlain: NAMES.map((n) => [n, describeMaterial(k.material(n), table)]),
        parts: PARTS.map((n) => [n, both(k.parts(n, {}), table)]),
        missing: [() => k.material('nope'), () => k.parts('nope'), () => k.buildingFinish('nope')].map((f) => {
          try {
            f();
            return 'no throw';
          } catch (e) {
            return e.message;
          }
        }),
      };
    },
    worldUv: () => {
      const table = makeTable();
      const box = new THREE.BoxGeometry(4, 3, 7, 2, 1, 1);
      box.rotateY(0.4);
      box.translate(10, 2, -5);
      const roof = new THREE.ConeGeometry(5, 3, 4);
      return { box: describeGeometry(look.worldUv(box), table), roof: describeGeometry(look.worldUv(roof), table) };
    },
    finishScene: () => {
      const k = made();
      const scene = new THREE.Scene();
      const shared = new THREE.BoxGeometry(2, 2, 2);
      const timber = k.material('timber');
      scene.add(new THREE.Mesh(shared, timber), new THREE.Mesh(shared, timber), new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
      const seen = [];
      look.finishScene(scene, (m) => seen.push(m.type));
      return { scene: describeObject(scene, makeTable()), lit: seen };
    },
    sun: () => {
      const out = {};
      for (const [id, q] of [['high', { id: 'high', shadows: true, field: { shadowMap: 4096, shadowHalf: 90 } }], ['low', { id: 'low', shadows: false, field: {} }]]) {
        const scene = new THREE.Scene();
        const sun = makeSun(scene, q, new THREE.Vector3(0.3, 0.8, -0.5), id === 'low' ? { color: new THREE.Color(1, 0.9, 0.8), irradiance: 2 } : { color: SUN_COLOR, irradiance: SUN_IRRADIANCE });
        const camera = new THREE.PerspectiveCamera(60, 1.5, 1, 9000);
        camera.position.set(10, 50, 30);
        camera.lookAt(200, 0, -400);
        sun.update(new THREE.Vector3(13.37, 2, -41.2), camera);
        out[id] = {
          keys: Object.keys(sun).sort(),
          scene: describeObject(scene, makeTable()),
          shadows: sun.lights.map((l) => round({
            cast: l.castShadow, map: l.shadow.mapSize.toArray(), cam: [l.shadow.camera.near, l.shadow.camera.far, l.shadow.camera.left, l.shadow.camera.top], bias: [l.shadow.bias, l.shadow.normalBias], ud: l.userData,
          })),
        };
      }
      return out;
    },
  };
}
