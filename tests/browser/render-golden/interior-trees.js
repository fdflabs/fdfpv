/*
 * render-golden/interior-trees.js: the Interior's forest as
 * src/maps/interior/trees.js builds it, pinned before its crowns move into
 * the shared asset library (docs/ASSET-LIBRARY.md), so the move is proved
 * to change nothing.
 *
 * The forest is built on a small made up canopy and world, not the map's
 * data (that needs the whole height and land files): a few dozen trees of
 * every kind round the middle, closed forest within STAND_R of it and open
 * land beyond, so every tier (near and mid balls, points, far blocks) has
 * trees in it once the camera has settled. What is described is the whole
 * group (geometry, instances, materials) and, because the crowns are
 * patched MeshStandardMaterials whose GLSL describeObject does not see,
 * every material's shaders as its onBeforeCompile leaves three's standard
 * ones.
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
import * as trees from '../../../src/maps/interior/trees.js';
import { KIND, STAND } from '../../../src/share/interior/canopy.js';
import { LAND } from '../../../src/share/interior/world.js';
import * as crownshape from '../../../src/render/library/crownshape.js';
import { describeObject, hashText, hashBytes } from '../render-golden-lib.js';

const STAND_R = 900;

/* Trees on an 8 m grid round the middle, out to 1600 m on two lines so the
 * mid and point tiers have some, every kind and a spread of tints (the
 * tint picks the colour, the flowers and the dry crowns). */
function madeTrees() {
  const out = [];
  const kinds = [KIND.broadleaf, KIND.palm, KIND.lone, KIND.emergent, KIND.shrub];
  let n = 0;
  const add = (x, z) => {
    const k = kinds[n % kinds.length];
    const r = 2.5 + (n % 7) * 0.6;
    const ry = r * (0.7 + (n % 3) * 0.15);
    const ground = 0.01 * x - 0.02 * z;
    const h = 9 + (n % 9);
    out.push({
      x, z, ground, h, r, ry, cy: ground + h - ry, kind: k, tint: ((n * 0.61803398875) % 1), lobe: n % 12,
    });
    n += 1;
  };
  for (let x = -40; x <= 40; x += 8) {
    for (let z = -40; z <= 40; z += 8) {
      add(x + 1.5, z - 2.5);
    }
  }
  for (let d = 60; d <= 1600; d += 37) {
    add(d, 3);
    add(-5, -d);
  }
  return out;
}

function madeWorld() {
  const list = madeTrees();
  const canopy = {
    treesIn(x0, z0, x1, z1, out) {
      for (const t of list) {
        if (t.x >= x0 && t.x < x1 && t.z >= z0 && t.z < z1) {
          out.push(t);
        }
      }
      return out;
    },
    standAt: (x, z) => (Math.hypot(x, z) < STAND_R ? STAND.closed : STAND.open),
    treeAt: (ci, cj) => list[(ci * 31 + cj * 17) % list.length],
  };
  const world = {
    landAt: (x, z) => (Math.abs(x) < 200 && z > 300 ? LAND.shrub : LAND.forest),
    groundAt: (x, z) => 0.01 * x - 0.02 * z,
  };
  return { canopy, world };
}

/* A material's shaders as its onBeforeCompile leaves three's standard
 * ones, and the uniforms it adds. */
function patched(m) {
  if (m.onBeforeCompile === THREE.Material.prototype.onBeforeCompile) {
    return null;
  }
  const lib = THREE.ShaderLib.standard;
  const shader = {
    vertexShader: lib.vertexShader,
    fragmentShader: lib.fragmentShader,
    uniforms: THREE.UniformsUtils.clone(lib.uniforms),
    defines: { ...(m.defines || {}) },
  };
  const before = new Set(Object.keys(shader.uniforms));
  m.onBeforeCompile(shader, null);
  return {
    vertex: hashText(shader.vertexShader),
    fragment: hashText(shader.fragmentShader),
    added: Object.keys(shader.uniforms).filter((k) => !before.has(k)).sort(),
    defines: shader.defines,
  };
}

function build(quality) {
  const scene = new THREE.Scene();
  const { canopy, world } = madeWorld();
  const t = trees.buildTrees({
    THREE, scene, quality, canopy, world, bark: null,
  });
  const camera = new THREE.PerspectiveCamera(44, 16 / 9, 0.5, 20000);
  camera.position.set(-30, 60, 90);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  t.settle(camera);
  return { t, scene };
}

export function cases() {
  return {
    lobes: () => ({
      exports: Object.keys(crownshape).sort(),
      LOBES: crownshape.LOBES,
      TEMPLATES: crownshape.TEMPLATES,
      data: hashBytes(new Float64Array(crownshape.LOBE_DATA)),
      templates: [0, 0.3, 0.5, 0.999].map(crownshape.templateOf),
    }),
    exports: () => Object.keys(trees).sort().map((k) => [k, typeof trees[k] === 'number' ? trees[k] : typeof trees[k]]),
    high: () => {
      const { t } = build('high');
      const mats = [];
      t.group.traverse((o) => {
        if (o.material && !mats.includes(o.material)) {
          mats.push(o.material);
        }
      });
      const out = {
        keys: Object.keys(t).sort(),
        group: describeObject(t.group),
        shaders: mats.map((m) => [m.name, m.type, m.customProgramCacheKey(), patched(m)]),
        stats: (({ lastMs, ...rest }) => rest)(t.stats()),
      };
      t.dispose();
      return out;
    },
    low: () => {
      const { t } = build('low');
      const out = describeObject(t.group);
      t.dispose();
      return out;
    },
  };
}
