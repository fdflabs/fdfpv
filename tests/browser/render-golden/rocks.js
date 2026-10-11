/*
 * render-golden/rocks.js: the Swiss valley's scanned boulders and stones
 * (src/maps/swiss2/vegetation/rocks.js when this was recorded), pinned
 * before their model, material, colliders and levels move into the shared
 * asset library (docs/ASSET-LIBRARY.md), so the move is proved to change
 * nothing: the stones the water lays, every rock placed on a made up
 * slope, the colliders handed to the map, the meshes and materials, and
 * which rocks each level draws from one camera.
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
import * as rocks from '../../../src/maps/swiss2/vegetation/rocks.js';
import { makeRng } from '../../../src/render/library/noise.js';
import { describeObject, makeTable, hashText, hashBytes } from '../render-golden-lib.js';

const sig = (v) => (typeof v === 'number' ? Number(v.toPrecision(12)) + 0 : v);
const round = (o) => JSON.parse(JSON.stringify(o, (k, v) => sig(v)));

/* Rolling ground between 380 and 820 m, steep enough in places for the
 * boulders' slope rule to place them. */
const heightAt = (x, z) => 600 + 120 * Math.sin(x / 50) + 100 * Math.cos(z / 40);
const slopeAt = (x, z) => {
  const sx = 2.4 * Math.cos(x / 50);
  const sz = -2.5 * Math.sin(z / 40);
  return { sx, sz, s: Math.hypot(sx, sz) };
};

function madeLayout() {
  const upper = [];
  const lower = [];
  for (let k = 0; k < 40; k += 1) {
    upper.push({ x: -300 + 7 * k, z: 200 + 3 * Math.sin(k) });
    lower.push({ x: 100 + 9 * k, z: -150 + 20 * Math.sin(k / 3) });
  }
  return {
    keepOff: (x, z) => Math.hypot(x - 40, z + 60) < 120,
    slopeAt,
    upper,
    lower,
    carved: (x, z) => x > 2000 && z > 2000,
  };
}

/* Every collider the rocks hand the map, in order. */
function recorder() {
  const calls = [];
  return {
    calls,
    add: (...a) => calls.push(['add', ...a]),
    addSphere: (...a) => calls.push(['sphere', ...a]),
  };
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
  return {
    vertex: hashText(shader.vertexShader),
    fragment: hashText(shader.fragmentShader),
    added: Object.keys(shader.uniforms).filter((k) => !before.has(k)).sort(),
    key: m.customProgramCacheKey(),
    band: shader.uniforms.uBand.value.toArray(),
    thermal: m.userData.thermal ?? null,
  };
}

function shore() {
  const out = [];
  for (let k = 0; k < 60; k += 1) {
    const a = (k / 60) * Math.PI * 2;
    out.push({ x: 300 * Math.cos(a), z: 1900 + 200 * Math.sin(a), a });
  }
  return out;
}

function stones() {
  const lakeAt = (x, z) => 372 + 0.004 * (z - 1900) + 0.002 * x;
  return rocks.waterStones({
    heightAt: lakeAt,
    layout: madeLayout(),
    rng: makeRng(20260929),
    shore: shore(),
    keepClear: (x, z) => Math.abs(x - 55) < 30 && z < 1800,
  });
}

async function built(withColliders) {
  const group = new THREE.Group();
  const colliders = withColliders ? recorder() : null;
  const extra = stones().slice(0, 40).map((s) => ({ ...s, x: s.x - 200, z: s.z - 1700 }));
  extra.push({ x: 5, z: 7, size: 2.2 });
  for (let k = 0; k < 10; k += 1) {
    extra.push({ x: 5 + 25 * Math.cos(k), z: 30 + 25 * Math.sin(k), size: 1.2 + 0.4 * k });
  }
  const r = await rocks.buildRocks({
    heightAt, layout: madeLayout(), rng: makeRng(20260927), count: 140, nearR: 160, fade: 12, colliders, group, envMap: null, extra,
  });
  return { r, group, colliders };
}

/* What each level draws from a camera: per mesh its count and the bytes of
 * the matrices it was handed. */
function drawn(group, r, at, look) {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 20000);
  camera.position.set(...at);
  camera.lookAt(...look);
  camera.updateMatrixWorld();
  r.update(camera);
  return group.children.map((m) => [m.name, m.count, m.visible, hashBytes(m.instanceMatrix.array.subarray(0, m.count * 16))]);
}

export function cases() {
  return {
    exports: () => Object.keys(rocks).sort().map((k) => [k, typeof rocks[k]]),
    waterStones: () => {
      const s = stones();
      return { n: s.length, stones: round(s) };
    },
    build: async () => {
      const { r, group, colliders } = await built(true);
      const table = makeTable();
      const mats = [...new Set(group.children.map((m) => m.material))];
      const out = {
        keys: Object.keys(r).sort(),
        count: r.count,
        stones: r.stones,
        group: describeObject(group, table),
        materials: mats.map(patched),
        colliders: { n: colliders.calls.length, calls: round(colliders.calls) },
      };
      r.dispose();
      return out;
    },
    levels: async () => {
      const { r, group } = await built(false);
      const out = {
        near: drawn(group, r, [5, 740, -40], [5, 705, 30]),
        far: drawn(group, r, [-900, 1400, -900], [0, 600, 0]),
        turned: drawn(group, r, [-900, 1400, -900], [-1800, 600, -1800]),
      };
      r.dispose();
      return out;
    },
  };
}
