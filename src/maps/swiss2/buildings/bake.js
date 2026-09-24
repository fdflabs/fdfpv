/*
 * bake.js: the photographic village baked by surface, not by key.
 *
 * The cel village is one mesh per material key, thirty six of them, and
 * each is drawn in the view and in both of the sun's shadow maps: ninety
 * three draws for a village. Here a key is a finish (look.js's
 * buildingFinish: a surface, a tint, a weather), so every key that shares
 * a photographed surface is one mesh, and the village is thirteen.
 *
 * A key may carry marks after a colon. `f`, near only: detail that says
 * what a house is made of at twenty metres and is a speck at three
 * hundred (the window frames, the shutters, the balusters, the purlin
 * ends, the geraniums). Those are baked apart, by 250 metre cell, each
 * cell a LOD that drops them past NEAR metres from the camera. They draw
 * with the same materials as the rest, so a cell coming into range
 * compiles nothing new mid flight. `o`, casts no shadow: a glazing bar
 * or a flower head is below what the shadow maps resolve, and costs a
 * draw and its triangles in each of them. `v`, the boards run upright.
 *
 * Every part is given its texture coordinates here, in metres along its
 * own faces (look.js's worldUv), scaled by the key's own `uv`, before the
 * merge, because after it a log wall and a shutter are one geometry.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { disposeSources } from '../../alps/kit.js';
import { worldUv } from '../look.js';

const CELL = 250;
/* How far past a cell's own radius its near detail is still drawn. */
const NEAR = 170;

/* A part as the merge wants it: unindexed, metre uvs (turned a quarter
 * for boards that run upright), the key's colour and finish on every
 * vertex, nothing else. */
function prepare(geo, finish, uvScale, upright) {
  const g = worldUv(geo.index ? geo.toNonIndexed() : geo);
  const n = g.getAttribute('position').count;
  const uv = g.getAttribute('uv').array;
  for (let i = 0; i < uv.length; i += 2) {
    const u = uv[i] * uvScale;
    const v = uv[i + 1] * uvScale;
    uv[i] = upright ? v : u;
    uv[i + 1] = upright ? u : v;
  }
  const col = new Float32Array(n * 3);
  const fin = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    col.set(finish.tint, i * 3);
    fin.set(finish.finish, i * 3);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.getAttribute('position'));
  out.setAttribute('normal', g.getAttribute('normal'));
  out.setAttribute('uv', g.getAttribute('uv'));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('s2Finish', new THREE.BufferAttribute(fin, 3));
  return out;
}

/*
 * Make the style's bakeAll. `look` answers buildingFinish(key) and
 * buildingGroups(mats); `uvScale` is metres of texture per metre of the
 * key's surface where it is not one (a log is wider than a board).
 */
export function makeBakeAll(look, uvScale = {}) {
  return function bakeAll(bake, mats, { castShadow = true } = {}) {
    const materials = look.buildingGroups(mats);
    const far = {};
    const cells = new Map();
    const at = new THREE.Vector3();
    for (const key of Object.keys(bake.parts)) {
      const [name, mark = ''] = key.split(':');
      const finish = look.buildingFinish(name);
      for (const src of bake.parts[key]) {
        const g = prepare(src, finish, uvScale[name] ?? 1, mark.includes('v'));
        src.dispose();
        const bucket = `${finish.group}|${mark.includes('o') ? 'flat' : 'casts'}`;
        if (!mark.includes('f')) {
          (far[bucket] ??= []).push(g);
          continue;
        }
        g.computeBoundingBox();
        g.boundingBox.getCenter(at);
        const id = `${Math.floor(at.x / CELL)},${Math.floor(at.z / CELL)}`;
        let cell = cells.get(id);
        if (!cell) {
          cell = { groups: {}, box: new THREE.Box3() };
          cells.set(id, cell);
        }
        cell.box.union(g.boundingBox);
        (cell.groups[bucket] ??= []).push(g);
      }
    }
    const mesh = (bucket, geos, name) => {
      const [group, cast] = bucket.split('|');
      const m = new THREE.Mesh(mergeGeometries(geos, false), materials[group]);
      for (const g of geos) {
        g.dispose();
      }
      m.castShadow = castShadow && cast === 'casts';
      m.receiveShadow = true;
      m.name = name;
      return m;
    };
    const root = new THREE.Group();
    for (const [bucket, geos] of Object.entries(far)) {
      root.add(mesh(bucket, geos, `village-${bucket.replace('|', '-')}`));
    }
    for (const [id, cell] of cells) {
      const centre = cell.box.getCenter(new THREE.Vector3());
      const radius = cell.box.getSize(at).length() / 2;
      const near = new THREE.Group();
      for (const [bucket, geos] of Object.entries(cell.groups)) {
        const m = mesh(bucket, geos, `village-${bucket.replace('|', '-')}-near-${id}`);
        m.geometry.translate(-centre.x, -centre.y, -centre.z);
        near.add(m);
      }
      const lod = new THREE.LOD();
      lod.name = `village-near-${id}`;
      lod.position.copy(centre);
      lod.addLevel(near, 0);
      lod.addLevel(new THREE.Object3D(), radius + NEAR);
      root.add(lod);
    }
    /* Instanced parts, as the cel bake has them: one InstancedMesh each
     * with the key's own material from the village table. */
    for (const name of Object.keys(bake.instances)) {
      const entry = bake.instances[name];
      if (!entry.matrices.length || !mats[entry.key]) {
        continue;
      }
      const m = new THREE.InstancedMesh(entry.geometry, mats[entry.key], entry.matrices.length);
      entry.matrices.forEach((mx, i) => m.setMatrixAt(i, mx));
      m.castShadow = castShadow;
      m.receiveShadow = true;
      m.name = `village-${name}`;
      root.add(m);
    }
    disposeSources(new Set(Object.values(bake.instances).map((e) => e.geometry)));
    return root;
  };
}
