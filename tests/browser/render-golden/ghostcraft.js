/*
 * render-golden/ghostcraft.js: what src/render/ghostcraft.js does to a
 * craft model: the two translucent materials it puts on every mesh, the
 * rotors it removes and frees, the draw order, the name tag (drawn calls
 * recorded, not pixels, so fonts cannot move it) and presence fading.
 * The model itself belongs to the craft builders and is not described
 * here, so a change to a model does not read as a change to the ghost.
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
import { buildGhostCraft } from '../../../src/render/ghostcraft.js';
import { craftBuilderFor } from '../../../src/render/craft.js';
import { describeMaterial, describeTexture, makeTable } from '../render-golden-lib.js';

/* Every 2D drawing call on any canvas, while a recorder is open. The
 * prototype is wrapped once, for the page's life. */
let sink = null;
for (const name of ['clearRect', 'fillText', 'fillRect', 'strokeText']) {
  const op = CanvasRenderingContext2D.prototype[name];
  CanvasRenderingContext2D.prototype[name] = function recorded(...args) {
    if (sink) {
      sink.push([name, `${this.canvas.width}x${this.canvas.height}`, this.font, this.textAlign, this.textBaseline, this.fillStyle, ...args]);
    }
    return op.apply(this, args);
  };
}

function recordCanvas(fn) {
  const calls = [];
  sink = calls;
  try {
    return [fn(), calls];
  } finally {
    sink = null;
  }
}

/* Disposals of materials, geometries and textures while `fn` runs. */
function recordDisposals(fn) {
  const disposed = [];
  const kinds = [THREE.Material, THREE.BufferGeometry, THREE.Texture];
  const reals = kinds.map((K) => K.prototype.dispose);
  kinds.forEach((K, i) => {
    K.prototype.dispose = function dispose() {
      disposed.push(this.type || this.constructor.name);
      return reals[i].call(this);
    };
  });
  try {
    return [fn(), disposed];
  } finally {
    kinds.forEach((K, i) => { K.prototype.dispose = reals[i]; });
  }
}

/* The ghost's meshes as the materials and flags they carry, grouped, so
 * the description says what the ghost did and not what the model is. */
function describeGhost(ghost) {
  const table = makeTable();
  const meshes = {};
  let tag = null;
  ghost.group.traverse((n) => {
    if (n.isSprite) {
      tag = {
        p: n.position.toArray(),
        s: n.scale.toArray(),
        renderOrder: n.renderOrder,
        visible: n.visible,
        material: describeMaterial(n.material, table),
        map: describeTexture(n.material.map, table),
        parentIsGroup: n.parent === ghost.group,
      };
      return;
    }
    if (n.isMesh) {
      const material = describeMaterial(n.material, table);
      const key = JSON.stringify([typeof material === 'string' ? material : material.ref, n.renderOrder, n.castShadow, n.receiveShadow]);
      meshes[key] = meshes[key] || { material, count: 0 };
      meshes[key].count += 1;
    }
  });
  return { keys: Object.keys(ghost).sort(), name: ghost.group.name, visible: ghost.group.visible, meshes, tag };
}

/* The same model built bare: its meshes, materials and rotor geometries,
 * which the ghost's work is measured against. */
function counts(airframe) {
  const craft = craftBuilderFor(airframe)({ name: 'ghost-craft', lite: true, fog: true, worldScale: true });
  const materials = new Set();
  let meshes = 0;
  craft.group.traverse((n) => {
    if (n.isMesh) {
      meshes += 1;
      materials.add(n.material);
    }
  });
  const rotorGeometries = new Set();
  const rotorNodes = new Set();
  let rotorMeshes = 0;
  for (const r of craft.blades) {
    r.traverse((n) => {
      rotorNodes.add(n);
      rotorMeshes += n.isMesh ? 1 : 0;
      if (n.geometry) {
        rotorGeometries.add(n.geometry);
      }
    });
  }
  const keptMaterials = new Set();
  craft.group.traverse((n) => {
    if (n.isMesh && !rotorNodes.has(n)) {
      keptMaterials.add(n.material);
    }
  });
  return { meshes, materials: materials.size, keptMaterials: keptMaterials.size, rotorMeshes, rotorGeometries: rotorGeometries.size, discs: craft.discs.length };
}

const AIRFRAMES = ['interceptor', '7inch', '10inch', undefined];

export function cases() {
  return {
    /* The ghost's own disposals are what follows the builder's: the same
     * build made bare first says where the builder's end. */
    build: () => AIRFRAMES.map((id) => {
      const [source, bare] = recordDisposals(() => counts(id ?? 'interceptor'));
      const [[ghost, drawn], disposed] = recordDisposals(() => recordCanvas(() => buildGhostCraft(id)));
      const builderSame = JSON.stringify(disposed.slice(0, bare.length)) === JSON.stringify(bare);
      const own = disposed.slice(bare.length);
      const ghostMeshes = Object.values(describeGhost(ghost).meshes).reduce((a, m) => a + m.count, 0);
      return {
        id: String(id),
        ghost: { ...describeGhost(ghost), meshes: Object.values(describeGhost(ghost).meshes).map((m) => [m.material, m.count === source.discs ? 'discs' : m.count === ghostMeshes - source.discs ? 'the rest' : m.count]) },
        drawn,
        builderSame,
        /* Every mesh but the rotors' is kept, the materials it replaced on
         * them are freed, and so is every rotor geometry. */
        keptAllButRotors: ghostMeshes === source.meshes - source.rotorMeshes,
        freedMaterials: own.filter((t) => /Material$/.test(t)).length === source.keptMaterials,
        freedRotorGeometry: own.filter((t) => /Geometry$/.test(t)).length === source.rotorGeometries,
        freedOther: own.filter((t) => !/Material$|Geometry$/.test(t)),
      };
    }),
    label: () => {
      const ghost = buildGhostCraft('interceptor');
      const rows = [];
      for (const text of ['Ana', 'Ana', '', null, 'A name far longer than thirty two characters in all', 42, 'Ana']) {
        const sprite = ghost.group.children.find((c) => c.isSprite);
        const version = sprite.material.map.version;
        const [, drawn] = recordCanvas(() => ghost.setLabel(text));
        rows.push({ text: String(text), drawn, visible: sprite.visible, uploads: sprite.material.map.version - version });
      }
      return rows;
    },
    presence: () => {
      const ghost = buildGhostCraft('interceptor');
      const mats = [];
      ghost.group.traverse((n) => {
        if (n.material && !mats.includes(n.material)) {
          mats.push(n.material);
        }
      });
      return [-1, 0, 0.004, 0.0041, 0.5, 1, 2, NaN].map((a) => {
        ghost.setPresence(a);
        return [String(a), ghost.group.visible, ...mats.map((m) => m.opacity)];
      });
    },
  };
}
