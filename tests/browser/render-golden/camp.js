/*
 * render-golden/camp.js: the Interior's camp (shelters of poles and
 * tarps, the mast, the fire and its smoke, the lookout, the stores and
 * the clutter, and its lights: src/render/interior/camp.js, camplight.js
 * and campdressing.js when this was recorded), pinned before it moves
 * into the shared asset library (docs/ASSET-LIBRARY.md), so the move is
 * proved to change nothing: both camps' meshes, materials and shader
 * text, every collider and roof they hand the map, and what the room's
 * word and the clock change.
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
import * as camp from '../../../src/render/interior/camp.js';
import { NUEVO_PROPS } from '../../../src/share/interior/places.js';
import { describeObject, makeTable, hashText, describeValue } from '../render-golden-lib.js';

const sig = (v) => (typeof v === 'number' ? Number(v.toPrecision(12)) + 0 : v);
const round = (o) => JSON.parse(JSON.stringify(o, (k, v) => sig(v)));

/* Every collider call, in order; ax grows by one a solid, as the map's. */
function recorder() {
  const calls = [];
  const ax = [];
  const rec = (name) => (...a) => {
    calls.push([name, ...a]);
    ax.push(ax.length);
    return ax.length - 1;
  };
  return {
    calls,
    ax,
    add: rec('add'),
    addPost: rec('post'),
    addTurnedBox: rec('box'),
    retire: (i) => calls.push(['retire', i]),
    restore: (i) => calls.push(['restore', i]),
  };
}

function patched(m) {
  if (m.onBeforeCompile === THREE.Material.prototype.onBeforeCompile) {
    return null;
  }
  const lib = THREE.ShaderLib[m.type === 'MeshBasicMaterial' ? 'basic' : m.type === 'LineBasicMaterial' ? 'basic' : m.type === 'SpriteMaterial' ? 'sprite' : 'standard'];
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
    type: m.type,
    vertex: hashText(shader.vertexShader),
    fragment: hashText(shader.fragmentShader),
    added: Object.keys(shader.uniforms).filter((k) => !before.has(k)).sort().map((k) => [k, describeValue(shader.uniforms[k].value, table)]),
    key: m.customProgramCacheKey(),
  };
}

const world = { groundAt: (x, z) => 80 + 0.004 * x - 0.003 * z + 0.2 * Math.sin(x / 9) };

function build(props, name) {
  const colliders = recorder();
  const roofs = [];
  const c = camp.buildCamp({
    THREE, world, colliders, roofs, ...(props ? { props, name } : {}),
  });
  return { c, colliders, roofs };
}

function materials(group) {
  const set = new Set();
  group.traverse((o) => {
    for (const m of [].concat(o.material || [])) {
      set.add(m);
    }
  });
  return [...set].map(patched);
}

export function cases() {
  return {
    exports: () => Object.keys(camp).sort(),
    viejo: () => {
      const { c, colliders, roofs } = build(null);
      const out = {
        keys: Object.keys(c).sort(),
        frames: round(Object.fromEntries(Object.entries(c.frames).map(([k, f]) => [k, Object.fromEntries(Object.entries(f).filter(([, v]) => typeof v !== 'function'))]))),
        stats: c.stats(),
        state: c.state(),
        group: describeObject(c.group, makeTable()),
        shaders: materials(c.group),
        colliders: round(colliders.calls),
        roofs: round(roofs),
      };
      c.dispose();
      return out;
    },
    nuevo: () => {
      const { c, colliders, roofs } = build(NUEVO_PROPS, 'interior-camp-nuevo');
      const out = {
        stats: c.stats(),
        group: describeObject(c.group, makeTable()),
        colliders: round(colliders.calls),
        roofs: round(roofs),
      };
      c.dispose();
      return out;
    },
    word: () => {
      const { c, colliders } = build(null);
      const out = [];
      for (const [next, s] of [[{ mark: 'shelter-2', tarp: 0.5 }, 3], [{ mast: 1 }, 40.5], [{ mast: 0, cold: true }, 101], [{ mark: null, cold: false }, 7]]) {
        c.setCamp(next);
        c.update(s);
        out.push({ state: c.state(), group: describeObject(c.group, makeTable()), light: Object.keys(c.light).sort() });
      }
      out.push(round(colliders.calls.filter((k) => k[0] === 'retire' || k[0] === 'restore')));
      c.dispose();
      return out;
    },
  };
}
