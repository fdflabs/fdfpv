/*
 * cards.js: the asset library's layers of crossed cards, first the
 * Interior's near field (src/maps/interior/nearfield.js places them):
 * grass, weeds, reeds and bushes from the leaf and grass atlases, drawn
 * round the camera as one instanced mesh a layer.
 *
 * A card is STRIDE floats: x, y, z (its foot), yaw, height, width, its
 * region (an index into the layer's `regions`) and its tint (the integer
 * part an index into `tints`, the fraction a brightness between 0.82 and
 * 1.18). The map works out where cards stand, in tiles of these, and
 * hands the tiles in reach to fill(); the layer draws them, each clump
 * shrinking into the ground over the outer part of the layer's reach
 * (uNfReach, inner and outer edge) at a distance of its own.
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

import { ALPHA_CUT } from './atlas.js';
import { thermalKind } from '../../thermal.js';

/* Floats per clump: x, y, z, yaw, height, width, region, tint. */
export const STRIDE = 8;

/* Three cards crossed at sixty degrees, a metre wide and a metre high,
 * standing on the origin; the instance scales them. A card's normal is
 * tipped toward the sky, so a clump is lit like the turf or the bush it
 * is and not like a sheet of paper. */
function clumpGeometry(THREE, tip) {
  const pos = [];
  const uv = [];
  const nrm = [];
  const idx = [];
  for (let k = 0; k < 3; k += 1) {
    const a = (k / 3) * Math.PI + 0.3;
    const cx = Math.cos(a) * 0.5;
    const cz = Math.sin(a) * 0.5;
    const base = pos.length / 3;
    pos.push(-cx, 0, -cz, cx, 0, cz, -cx, 1, -cz, cx, 1, cz);
    uv.push(0, 0, 1, 0, 0, 1, 1, 1);
    for (let q = 0; q < 4; q += 1) {
      nrm.push(-Math.sin(a) * tip, 1, Math.cos(a) * tip);
    }
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

/*
 * One layer of cards: { mesh, fill(list of tile arrays), uniforms,
 * dispose }. `atlas` the texture the regions are cut from; `cap` the
 * most cards it draws; `tip` how far a card's normal leans from the sky
 * toward its face; `name` names the mesh and the program,
 * `interior-near-${name}`, the key it had before the move.
 * `regions` the atlas's uv rectangles in the order a clump's region
 * index names them; `radius` the reach its clumps shrink out to;
 * `tints` vec3 per tint index, linear multipliers on the atlas.
 */
export function cardLayer(THREE, {
  atlas, regions, cap, radius, tip, tints, name, rough,
}) {
  const geo = clumpGeometry(THREE, tip);
  const buf = new THREE.InstancedInterleavedBuffer(new Float32Array(Math.max(1, cap) * STRIDE), STRIDE, 1);
  buf.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aCard', new THREE.InterleavedBufferAttribute(buf, 4, 0));
  geo.setAttribute('aCard2', new THREE.InterleavedBufferAttribute(buf, 4, 4));
  geo.instanceCount = 0;
  const mat = new THREE.MeshStandardMaterial({
    map: atlas, alphaTest: ALPHA_CUT, side: THREE.DoubleSide, roughness: rough, metalness: 0,
  });
  const uniforms = {
    uNfRegions: { value: regions.map((r) => new THREE.Vector4(r.u0, r.v0, r.du, r.dv)) },
    uNfTints: { value: tints.map((t) => new THREE.Vector3(...t)) },
    uNfReach: { value: new THREE.Vector2(0, radius) },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aCard;
        attribute vec4 aCard2;
        uniform vec4 uNfRegions[${regions.length}];
        uniform vec3 uNfTints[${tints.length}];
        uniform vec2 uNfReach;
        varying vec3 vNfTint;
        varying float vNfUp;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vec4 nfReg = uNfRegions[int(aCard2.z + 0.5)];
        vMapUv = nfReg.xy + uv * nfReg.zw;
        vNfUp = uv.y;
        vNfTint = uNfTints[int(floor(aCard2.w))] * (0.82 + 0.36 * fract(aCard2.w));`)
      .replace('#include <beginnormal_vertex>', `
        float nfC = cos(aCard.w);
        float nfS = sin(aCard.w);
        vec3 objectNormal = vec3(nfC * normal.x + nfS * normal.z, normal.y, -nfS * normal.x + nfC * normal.z);`)
      .replace('#include <begin_vertex>', `
        float nfD = distance(cameraPosition.xz, aCard.xz);
        /* Each clump its own edge, between seven tenths of the reach and
         * all of it, so the layer thins out instead of stopping; and a
         * layer that takes over from a nearer one grows in where that one
         * thins out (uNfReach.x, its inner edge). */
        float nfJit = fract(aCard.x * 12.9898 + aCard.z * 78.233);
        float nfEdge = uNfReach.y * (0.7 + 0.3 * nfJit);
        float nfGrow = (1.0 - smoothstep(nfEdge * 0.7, nfEdge, nfD)) * smoothstep(uNfReach.x * (0.6 + 0.3 * nfJit), uNfReach.x * (0.9 + 0.3 * nfJit), nfD);
        vec3 transformed = vec3(
          (nfC * position.x + nfS * position.z) * aCard2.y,
          position.y * aCard2.x * nfGrow,
          (-nfS * position.x + nfC * position.z) * aCard2.y) * step(0.001, nfGrow) + aCard.xyz;`)
      .replace('#include <project_vertex>', `
        vec4 mvPosition = viewMatrix * vec4(transformed, 1.0);
        gl_Position = projectionMatrix * mvPosition;`)
      .replace('#include <worldpos_vertex>', `
        vec4 worldPosition = vec4(transformed, 1.0);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vNfTint;
        varying float vNfUp;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        /* Darker at the root, where the clump shades itself. */
        diffuseColor.rgb *= vNfTint * mix(0.45, 1.0, smoothstep(0.0, 0.7, vNfUp));`);
  };
  mat.customProgramCacheKey = () => `interior-near-${name}`;
  const mesh = new THREE.Mesh(geo, thermalKind(mat, 'vegetation'));
  mesh.name = `interior-near-${name}`;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  function fill(tiles) {
    const arr = buf.array;
    let n = 0;
    for (const t of tiles) {
      const k = Math.min(t.length / STRIDE, cap - n);
      arr.set(k * STRIDE === t.length ? t : t.subarray(0, k * STRIDE), n * STRIDE);
      n += k;
    }
    buf.clearUpdateRanges();
    buf.addUpdateRange(0, n * STRIDE);
    buf.needsUpdate = true;
    geo.instanceCount = n;
    return n;
  }
  return {
    mesh,
    fill,
    uniforms,
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
