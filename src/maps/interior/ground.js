/*
 * ground.js: the Interior's ground material, coloured from the land cover
 * (src/share/interior/land.bin with places.js's painting over it), never
 * from a satellite photograph.
 *
 * WHY NOT IMAGERY. Itaipu's ground is a Sentinel-2 picture, which is the
 * right answer for a real place and the wrong one here: at 10 m it shows
 * the source area's real roads, farmsteads and field tracks, which the
 * owner's rule forbids (docs/campaign/interior/PLAN.md section 1) and
 * which would let anyone lay the map over the real land. So the ground
 * is the land cover's classes, each a measured colour (CLASS below: the
 * reflectances Itaipu's loop graded its own classes to, src/maps/itaipu/
 * look/ground.js CLASS_TARGET, and the region's red earth), broken up by
 * noise at field and patch scale, the crops field by field, and near the
 * camera Itaipu's photographed layers (litter, grass, laterite) for the
 * grain. Roads, the river and everything built are drawn on top
 * (built.js), where places.js puts them.
 *
 * The class texture is the 10 m land cover itself, read at the four
 * cells round a fragment and blended, its lookup bent a few metres by
 * noise so a field's edge is not a staircase.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';
import { HALF, L_CELL, L_N } from '../../share/interior/frame.js';
import { LAND } from '../../share/interior/world.js';
import { thermalKind } from '../../render/thermal.js';

/*
 * Linear reflectance per class, and the photographed layer
 * (itaipu/look/ground.js LAYERS: 0 litter, 1 grass, 2 sparse grass,
 * 3 laterite, 4 tracks) that gives it its grain near the camera. The
 * late dry season: pasture between green and straw, the crops a field
 * of soy, a field of stubble, a ploughed field of red earth.
 */
const CLASS = [];
CLASS[LAND.water] = { col: [0.035, 0.034, 0.028], layer: 3 };
CLASS[LAND.forest] = { col: [0.029, 0.05, 0.017], layer: 0 };
CLASS[LAND.pasture] = { col: [0.082, 0.085, 0.036], layer: 1 };
CLASS[LAND.crop] = { col: [0.09, 0.085, 0.04], layer: 2 };
CLASS[LAND.shrub] = { col: [0.055, 0.066, 0.028], layer: 2 };
CLASS[LAND.wetland] = { col: [0.045, 0.068, 0.036], layer: 1 };
CLASS[LAND.bare] = { col: [0.135, 0.072, 0.033], layer: 3 };
CLASS[LAND.built] = { col: [0.145, 0.088, 0.05], layer: 4 };
CLASS[LAND.burned] = { col: [0.024, 0.021, 0.018], layer: 3 };

const v3 = (c) => `vec3(${c.map((x) => x.toFixed(4)).join(', ')})`;

const GLSL = /* glsl */ `
uniform highp usampler2D uLand;
uniform sampler2D uNoise;
uniform highp sampler2DArray uLayerCol;
varying vec3 vInWorld;

float inHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec4 inTex(vec2 w, float m, float o) {
  return texture(uNoise, w / (256.0 * m) + o);
}
/* A crop field's colour. The fields are the cells of a jittered grid
 * about 480 m apart, each the land nearest its point (so straight edges
 * at odd angles, as fields are), and each soy in leaf, stubble or, now
 * and then, ploughed red earth. */
vec3 inCrop(vec2 w) {
  vec2 g = w / 480.0;
  vec2 c0 = floor(g);
  float best = 1e9;
  vec2 id = c0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = c0 + vec2(float(i), float(j));
      vec2 p = c + vec2(inHash(c + 3.1), inHash(c + 7.7)) * 0.9 + 0.05;
      float d = dot(g - p, g - p);
      if (d < best) { best = d; id = c; }
    }
  }
  float h = inHash(id + 17.0);
  vec3 soy = vec3(0.056, 0.082, 0.03);
  vec3 straw = vec3(0.12, 0.1, 0.062);
  vec3 dry = vec3(0.1, 0.092, 0.05);
  vec3 red = vec3(0.11, 0.064, 0.036);
  return h < 0.45 ? soy : h < 0.75 ? straw : h < 0.9 ? dry : red;
}
vec3 inClass(uint k, vec2 w) {
  ${CLASS.map((c, k) => `if (k == ${k}u) { return ${k === LAND.crop ? 'inCrop(w)' : v3(c.col)}; }`).join('\n  ')}
  return vec3(0.08);
}
int inLayer(uint k) {
  ${CLASS.map((c, k) => `if (k == ${k}u) { return ${c.layer}; }`).join('\n  ')}
  return 1;
}
`;

/* The land cover as an unsigned byte texture, one texel a 10 m cell, row
 * 0 the data's north edge (z = -HALF). */
export function landTexture(cells) {
  const t = new THREE.DataTexture(cells, L_N, L_N, THREE.RedIntegerFormat, THREE.UnsignedByteType);
  t.internalFormat = 'R8UI';
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}

/*
 * The material: `land` landTexture's, `arrays` itaipu/look/ground.js
 * loadGroundArrays's, `noise` its noiseTexture's; the caller owns them.
 */
export function groundMaterial({ land, arrays, noise }) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uLand = { value: land };
    shader.uniforms.uNoise = { value: noise };
    shader.uniforms.uLayerCol = { value: arrays.col };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vInWorld;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vInWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec2 w = vInWorld.xz;
          /* The lookup bent up to 7 m, so an edge on the 10 m cells is ragged. */
          vec2 bend = (vec2(inTex(w, 23.0, 0.31).r, inTex(w, 23.0, 0.77).g) - 0.5) * 14.0;
          vec2 f = (w + bend + ${HALF.toFixed(1)}) / ${L_CELL.toFixed(1)} - 0.5;
          ivec2 c = ivec2(floor(f));
          vec2 t = fract(f);
          ivec2 hi = ivec2(${L_N - 1});
          uint k00 = texelFetch(uLand, clamp(c, ivec2(0), hi), 0).r;
          uint k10 = texelFetch(uLand, clamp(c + ivec2(1, 0), ivec2(0), hi), 0).r;
          uint k01 = texelFetch(uLand, clamp(c + ivec2(0, 1), ivec2(0), hi), 0).r;
          uint k11 = texelFetch(uLand, clamp(c + ivec2(1, 1), ivec2(0), hi), 0).r;
          vec3 col = mix(mix(inClass(k00, w), inClass(k10, w), t.x), mix(inClass(k01, w), inClass(k11, w), t.x), t.y);
          uint kk = t.x < 0.5 ? (t.y < 0.5 ? k00 : k01) : (t.y < 0.5 ? k10 : k11);
          /* Patches: dry against lush over tens of metres, darker and
           * lighter over a few. */
          float big = inTex(w, 41.0, 0.13).r * 0.6 + inTex(w, 13.0, 0.57).g * 0.4;
          float small = inTex(w, 2.7, 0.41).b;
          vec3 dry = vec3(1.18, 1.06, 0.86);
          vec3 lush = vec3(0.88, 1.04, 0.9);
          col *= mix(lush, dry, smoothstep(0.25, 0.75, big));
          /* Paddocks: a pasture is fenced into fields grazed differently,
           * the cells of the crops' grid at another scale. */
          if (kk == ${LAND.pasture}u) {
            vec2 pg = floor(w / 340.0 + vec2(inTex(w, 90.0, 0.2).r, inTex(w, 90.0, 0.6).g) * 0.6);
            col *= 0.9 + 0.22 * inHash(pg + 41.0);
          }
          col *= 0.86 + 0.28 * small;
          /* The photographed grain near the camera, as a ratio to its own
           * mean so the class's colour holds. */
          float dist = length(vInWorld - cameraPosition);
          float near = 1.0 - smoothstep(120.0, 420.0, dist);
          if (near > 0.0) {
            int layer = inLayer(kk);
            vec3 grain = texture(uLayerCol, vec3(w / 2.0, float(layer))).rgb;
            vec3 mean = textureLod(uLayerCol, vec3(0.5, 0.5, float(layer)), 12.0).rgb;
            col *= mix(vec3(1.0), clamp(grain / max(mean, vec3(0.01)), 0.3, 2.2), near * 0.8);
          }
          diffuseColor.rgb = col;
        }`);
  };
  m.customProgramCacheKey = () => 'interior-ground';
  m.name = 'interior-ground';
  return thermalKind(m, 'vegetation');
}
