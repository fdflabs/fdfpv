/*
 * render-golden/interior-vehicles.js: the Interior's motorcycles and
 * pickup (low and instanced, the paint tinted per instance:
 * src/render/library/vehicles/instanced.js when this was recorded), pinned before
 * they move into the shared asset library (docs/ASSET-LIBRARY.md), so
 * the move is proved to change nothing: both bodies, the material and its
 * shader text, and a set of vehicles placed twice.
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
import * as vehicles from '../../../src/render/library/vehicles/instanced.js';
import { describeObject, makeTable, hashText } from '../render-golden-lib.js';

function patched(m) {
  const lib = THREE.ShaderLib.standard;
  const shader = {
    vertexShader: lib.vertexShader,
    fragmentShader: lib.fragmentShader,
    uniforms: THREE.UniformsUtils.clone(lib.uniforms),
    defines: { ...(m.defines || {}) },
  };
  m.onBeforeCompile(shader, null);
  return {
    vertex: hashText(shader.vertexShader), fragment: hashText(shader.fragmentShader), key: m.customProgramCacheKey(), defines: shader.defines,
  };
}

function fleet(n) {
  return Array.from({ length: n }, (_, k) => ({
    kind: ['motorcycle', 'pickup', 'motorcycle', 'boat'][k % 4],
    x: 4 * k, y: 0.3 * k, z: -2 * k, heading: 0.9 * k, ...(k % 3 ? { tint: [0.1 * (k % 5), 0.2, 0.3] } : {}),
  }));
}

export function cases() {
  return {
    exports: () => Object.keys(vehicles).sort(),
    bodies: () => {
      const v = vehicles.makeVehicles(THREE, { cap: 4 });
      const out = { keys: Object.keys(v).sort(), group: describeObject(v.group, makeTable()), shader: patched(v.meshes.motorcycle.material) };
      v.dispose();
      return out;
    },
    placed: () => {
      const v = vehicles.makeVehicles(THREE, { cap: 4 });
      const out = [];
      for (const n of [9, 3, 0]) {
        v.set(fleet(n));
        out.push({ stats: v.stats(), group: describeObject(v.group, makeTable()) });
      }
      v.dispose();
      return out;
    },
  };
}
