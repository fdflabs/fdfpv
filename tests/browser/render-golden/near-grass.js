/*
 * render-golden/near-grass.js: the Interior's near field (grass, meadow,
 * reeds and shrubs as layers of crossed cards round the camera,
 * src/maps/interior/nearfield.js), pinned before its card layer moves
 * into the shared asset library (docs/ASSET-LIBRARY.md), so the move is
 * proved to change nothing: the meshes, their materials and shader text,
 * and every card each layer is filled with from three cameras, on a made
 * up land of every cover.
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
import * as near from '../../../src/maps/interior/nearfield.js';
import { LAND } from '../../../src/share/interior/world.js';
import { describeObject, makeTable, hashText, describeValue } from '../render-golden-lib.js';

const sig = (v) => (typeof v === 'number' ? Number(v.toPrecision(12)) + 0 : v);
const round = (o) => JSON.parse(JSON.stringify(o, (k, v) => sig(v)));

/* Bands of every cover, a crown every 23 m in the forest bands. */
function madeWorld() {
  const covers = [LAND.pasture, LAND.forest, LAND.crop, LAND.shrub, LAND.wetland, LAND.bare, LAND.built, LAND.burned];
  const world = {
    landAt: (x, z) => covers[(((Math.floor(x / 37) + 2 * Math.floor(z / 53)) % covers.length) + covers.length) % covers.length],
    groundAt: (x, z) => 120 + 0.01 * x - 0.02 * z + Math.sin(x / 20),
  };
  const canopy = {
    treesIn(x0, z0, x1, z1, out) {
      for (let x = Math.ceil(x0 / 23) * 23; x < x1; x += 23) {
        for (let z = Math.ceil(z0 / 23) * 23; z < z1; z += 23) {
          out.push({ x, z, r: 3 + (Math.abs(x + z) % 5) });
        }
      }
      return out;
    },
  };
  return { world, canopy };
}

function texture() {
  const t = new THREE.DataTexture(new Uint8Array(16).fill(200), 2, 2);
  t.needsUpdate = true;
  return t;
}

function patched(m) {
  const lib = THREE.ShaderLib.standard;
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
    key: m.customProgramCacheKey(),
  };
}

function build(quality) {
  const scene = new THREE.Scene();
  const { world, canopy } = madeWorld();
  const f = near.buildNearField({
    THREE, scene, world, canopy, quality, atlases: { grass: texture(), foliage: texture() },
  });
  return { f, scene };
}

const camera = (x, h, z) => {
  const c = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 5000);
  c.position.set(x, 120 + 0.01 * x - 0.02 * z + Math.sin(x / 20) + h, z);
  return c;
};

/* Every layer's cards after a view: count and the bytes of the cards. */
function cards(f) {
  const s = f.stats();
  return {
    stats: round({ ...s, lastMs: undefined }),
  };
}

export function cases() {
  return {
    exports: () => Object.keys(near).sort(),
    built: () => {
      const { f, scene } = build('high');
      const table = makeTable();
      const out = {
        scene: describeObject(scene, table),
        shaders: f.group.children.map((m) => patched(m.material)),
      };
      f.dispose();
      return out;
    },
    views: () => {
      const out = {};
      for (const quality of ['high', 'medium', 'low']) {
        const { f } = build(quality);
        const got = [];
        for (const [x, h, z] of [[0, 2, 0], [500, 30, -400], [-1300, 80, 900], [3, 2.5, 4]]) {
          f.view(camera(x, h, z));
          got.push({
            ...cards(f),
            layers: f.group.children.map((m) => [m.name, m.visible, m.geometry.instanceCount, describeObject(m).geometry.attrs.aCard.hash,
              m.material.userData && Object.keys(m.material.userData).length]),
          });
        }
        out[quality] = got;
        f.dispose();
      }
      return round(out);
    },
  };
}
