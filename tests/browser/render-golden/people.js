/*
 * render-golden/people.js: the Interior's people (a body of tapered
 * limbs in each pose and kit, instanced, coloured per slot:
 * src/render/library/people/figures.js and tint.js when this was recorded),
 * pinned before they move into the shared asset library
 * (docs/ASSET-LIBRARY.md), so the move is proved to change nothing: every
 * pose's body, the material and its shader text, and a crowd in every
 * action set at three moments.
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
import * as figures from '../../../src/render/library/people/figures.js';
import * as tint from '../../../src/render/library/tint.js';
import { describeObject, makeTable, hashText } from '../render-golden-lib.js';

const ACTIONS = ['walk', 'carryLong', 'stand', 'lookUp', 'sit', 'crouchTarp', 'takeDownAntenna', 'pushMotorcycle', 'ride', 'unknown'];

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

/* Thirty people, three of every action, some with no seed, scale or tint. */
function crowd() {
  return Array.from({ length: 31 }, (_, k) => ({
    x: 3 * k - 40,
    y: 0.5 * Math.sin(k),
    z: 7 * Math.cos(k * 1.3),
    heading: k * 0.7,
    action: ACTIONS[k % ACTIONS.length],
    ...(k % 4 ? { tint: [0.1 + 0.02 * k, 0.3, 0.2] } : {}),
    ...(k % 3 ? { seed: 1000 + 17 * k } : {}),
    ...(k % 5 === 0 ? { scale: 0.7 } : {}),
  }));
}

export function cases() {
  return {
    exports: () => ({ figures: Object.keys(figures).sort(), tint: Object.keys(tint).sort(), POSE_NAMES: figures.POSE_NAMES }),
    bodies: () => {
      const f = figures.makeFigures(THREE, { cap: 8 });
      const table = makeTable();
      const out = {
        keys: Object.keys(f).sort(),
        meshes: Object.keys(f.meshes),
        group: describeObject(f.group, table),
        shaders: [...new Set(f.group.children.map((m) => m.material))].map((m) => (m.onBeforeCompile === THREE.Material.prototype.onBeforeCompile ? null : patched(m))),
      };
      f.dispose();
      return out;
    },
    crowd: () => {
      const f = figures.makeFigures(THREE, { cap: 4 });
      const out = [];
      for (const ms of [0, 470, 12345]) {
        f.set(crowd(), ms);
        out.push({ stats: f.stats(), group: describeObject(f.group, makeTable()) });
      }
      f.dispose();
      return out;
    },
    tintSlots: () => {
      const g = new THREE.BoxGeometry();
      const m = new THREE.InstancedMesh(g, tint.slotTint(new THREE.MeshStandardMaterial({ vertexColors: true })), 3);
      tint.addSlotTints(THREE, m, 3);
      tint.setSlotTints(m, 1, [0.1, 0.2, 0.3], [0.4, 0.5, 0.6], [0.7, 0.8, 0.9]);
      tint.slotTintsChanged(m);
      return { mesh: describeObject(m), shader: patched(m.material), versions: [m.instanceColor.version, g.attributes.tintB.version, g.attributes.tintC.version] };
    },
  };
}
