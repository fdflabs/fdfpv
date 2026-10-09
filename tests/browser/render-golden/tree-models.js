/*
 * render-golden/tree-models.js: the leaf card tree models the Swiss valley
 * grows and Itaipu borrows (species.js, plantmat.js, impostor.js and the
 * leaf and grass atlas, under src/maps/swiss2/vegetation/ when this was
 * recorded), pinned before they move into the shared asset library
 * (docs/ASSET-LIBRARY.md), so the move is proved to change nothing.
 *
 * Every variant at both levels of detail with its numbers and buffers,
 * its collider clumps; the plant and impostor materials with the GLSL
 * their onBeforeCompile leaves (describeObject does not see it); an
 * impostor draw's instance buffers; and the atlases as loaded, their
 * regions and the URLs the files are fetched from.
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
import * as species from '../../../src/maps/swiss2/vegetation/species.js';
import * as plantmat from '../../../src/maps/swiss2/vegetation/plantmat.js';
import * as impostor from '../../../src/maps/swiss2/vegetation/impostor.js';
import * as atlas from '../../../src/maps/swiss2/vegetation/atlas.js';
import {
  describeGeometry, describeMaterial, describeTexture, describeObject, makeTable, hashText,
} from '../render-golden-lib.js';

const sig = (v) => (typeof v === 'number' ? Number(v.toPrecision(12)) + 0 : v);
const round = (o) => JSON.parse(JSON.stringify(o, (k, v) => sig(v)));
const exportsOf = (m) => Object.keys(m).sort().map((k) => [k, typeof m[k]]);

/* A material's shaders as its onBeforeCompile leaves three's standard
 * (or depth) ones, and the uniforms it adds. */
function patched(m, lib = THREE.ShaderLib.standard) {
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
    key: m.customProgramCacheKey(),
  };
}

function texture(w, h) {
  const t = new THREE.DataTexture(new Uint8Array(w * h * 4).fill(128), w, h);
  t.needsUpdate = true;
  return t;
}

export function cases() {
  return {
    exports: () => ({
      species: exportsOf(species), plantmat: exportsOf(plantmat), impostor: exportsOf(impostor), atlas: exportsOf(atlas),
    }),
    constants: () => round({
      VARIANTS: species.VARIANTS,
      CLUMP_REACH: species.CLUMP_REACH,
      AZIMUTHS: impostor.AZIMUTHS,
      ELEVATIONS: impostor.ELEVATIONS,
      GRID: impostor.GRID,
      MAX_VARIANTS: impostor.MAX_VARIANTS,
      ALPHA_CUT: atlas.ALPHA_CUT,
      REGIONS: atlas.REGIONS,
      GRASS_REGIONS: atlas.GRASS_REGIONS,
      url: atlas.assetUrl('leaves.webp').replace(window.location.origin, ''),
      glsl: ['DITHER_GLSL', 'PLANT_TINT_GLSL', 'LEAF_SPEC_GLSL'].map((k) => [k, hashText(plantmat[k])]).concat([['IMP_FRAME_GLSL', hashText(impostor.IMP_FRAME_GLSL)]]),
    }),
    variants: () => species.VARIANTS.map((v) => {
      const table = makeTable();
      const lods = ['near', 'mid'].map((lod) => {
        const b = species.buildVariant(v, lod);
        return round({
          lod,
          keys: Object.keys(b).sort(),
          height: b.height,
          crown: b.crown,
          cy: b.cy,
          radius: b.radius,
          foliage: describeGeometry(b.foliage, table),
          bark: describeGeometry(b.bark, table),
          tris: [species.triangles(b.foliage), species.triangles(b.bark)],
        });
      });
      return { kind: v.kind, lods, clumps: round(species.crownClumps(v)) };
    }),
    plantMaterials: () => {
      const map = texture(4, 4);
      const normalMap = texture(4, 4);
      const wind = plantmat.windUniforms();
      const out = { wind: Object.keys(wind).sort() };
      for (const kind of ['foliage', 'bark']) {
        const m = plantmat.plantMaterial(kind, { map, normalMap, band: [10, 20, 300, 340], wind });
        const d = plantmat.plantDepthMaterial(kind, { map, wind });
        out[kind] = {
          material: describeMaterial(m, makeTable()),
          shaders: patched(m),
          depth: describeMaterial(d, makeTable()),
          depthShaders: patched(d, THREE.ShaderLib.depth),
        };
        const t = plantmat.plantMaterial(kind, { map, normalMap, band: [0, 0, 80, 90], wind, sway: 1e-4, flutter: 0.1, translucency: 0.3 });
        out[`${kind}Tuned`] = describeMaterial(t, makeTable());
      }
      return out;
    },
    impostors: () => {
      const baked = {
        albedo: texture(8, 8), normal: texture(8, 8), frame: 128, info: [{ radius: 6, cy: 7 }, { radius: 4.5, cy: 5.5 }],
      };
      const m = impostor.impostorMaterial(baked, [200, 260, 3000, 3400]);
      const d = impostor.impostorDepthMaterial(m);
      const forest = {
        x: [0, 10, 20], y: [1, 2, 3], z: [5, -5, 0], s: [1, 0.8, 1.2], yaw: [0.1, 1, 2], v: [0, 1, 0],
      };
      const mesh = impostor.impostorMesh(forest, [0, 2], m, d);
      return {
        material: describeMaterial(m, makeTable()),
        shaders: patched(m),
        depthShaders: patched(d, THREE.ShaderLib.depth),
        uniforms: Object.keys(m.userData.impostor).sort(),
        mesh: describeObject(mesh),
        depth: mesh.customDepthMaterial === d,
      };
    },
    atlases: async () => {
      const a = await atlas.loadAtlases();
      const table = makeTable();
      return Object.fromEntries(Object.keys(a).sort().map((k) => {
        const v = a[k];
        if (v && v.isTexture) {
          return [k, describeTexture(v, table)];
        }
        if (v && typeof v === 'object') {
          return [k, Object.fromEntries(Object.keys(v).sort().map((j) => [j, v[j] && v[j].isTexture ? describeTexture(v[j], table) : typeof v[j]]))];
        }
        return [k, typeof v];
      }));
    },
  };
}
