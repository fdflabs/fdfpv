/*
 * plantmat.js: the materials trees are drawn with, as three's own
 * MeshStandardMaterial with a few lines spliced in, so the pipeline's
 * lights, image based lighting, shadows, fog and tone mapping reach every
 * leaf exactly as they reach a wall.
 *
 * What is spliced in:
 *
 *   Wind. The whole tree leans with a slow sway that grows with the
 *   square of the height, gusting across the valley, and the branch tips
 *   flutter on top of it by how far out on the branch they are (the
 *   geometry's aFlex). Worked in world space and taken back into the
 *   instance's frame, so the shadow pass, which runs the same vertex
 *   code, moves the same way.
 *
 *   A distance band. Each level of detail draws only between two
 *   distances, and dissolves in and out of its band with a screen door
 *   dither on the same hash the next level uses, so where one fades out
 *   the other fills exactly the pixels it left and a tree never doubles
 *   or vanishes on the boundary.
 *
 *   Foliage normals that are not flipped on the back face. A leaf card's
 *   normals are bent outward from the crown at build time (species.js);
 *   three's double sided lighting would turn them inward on every card
 *   seen from behind, which is half of them, and the crown would shade
 *   as a sponge.
 *
 *   Light through the leaves. Looking toward the sun through a crown,
 *   needles and leaves glow; a share of the sun's light reaches the eye
 *   through the foliage in a lobe round the sun's direction.
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
import { ALPHA_CUT } from './atlas.js';

/* One set of wind uniforms shared by every plant material, so a gust
 * moves the forest and the meadow together. uWindDir is the direction
 * the wind blows toward, in the ground plane; uWind its strength, one
 * being a fresh breeze. */
export function windUniforms() {
  return {
    uTime: { value: 0 },
    uWindDir: { value: new THREE.Vector2(0.8, -0.6).normalize() },
    uWind: { value: 0.6 },
  };
}

/* The hash the dither bands share: the same pixel draws the same number
 * in every level, which is what makes the bands complementary. */
export const DITHER_GLSL = /* glsl */ `
float plantHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
/* A level keeps a pixel whose hash is under its fade in and not under
 * its fade out; the next level fades in on the same curve, so between
 * them every pixel is drawn exactly once. */
bool plantKeep(float n, float d, vec4 band) {
  return n < smoothstep(band.x, band.y, d) && n >= smoothstep(band.z, band.w, d);
}
bool plantOut(float d, vec4 band) {
  return d <= band.x || d >= band.w;
}
`;

/* Leaves and needles are not glossy: three's standard material reflects
 * the whole sky at a grazing angle (its Fresnel term runs to one), which
 * turned every card seen edge on white and a meadow at eye height into
 * straw. A leaf's sheen is a third of that. */
export const LEAF_SPEC_GLSL = `#include <lights_physical_fragment>
  material.specularF90 = 0.3;
  material.specularColor *= 0.5;`;

/*
 * The wind as a world space offset for a vertex `h` metres up its tree
 * (model units scaled to metres by the caller), on a tree standing at
 * `origin`, with `flex` its flutter weight.
 */
const WIND_GLSL = /* glsl */ `
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWind;
uniform float uSway;
uniform float uFlutter;
vec3 plantWind(vec3 origin, float h, float flex, vec3 p) {
  float ph = dot(origin.xz, vec2(0.071, 0.053));
  float gust = 0.55 + 0.45 * sin(uTime * 0.31 + dot(origin.xz, uWindDir) * 0.012);
  float sway = (sin(uTime * 0.83 + ph) * 0.7 + sin(uTime * 1.71 + ph * 1.7) * 0.3 + 0.35) * uWind * gust;
  vec3 dir = vec3(uWindDir.x, 0.0, uWindDir.y);
  vec3 w = dir * sway * uSway * h * h;
  float fl = flex * uWind * gust * uFlutter * sin(uTime * 4.1 + ph * 3.0 + p.x * 1.7 + p.z * 1.3 + p.y * 0.9);
  return w + vec3(0.0, fl, 0.0) + dir * fl * 0.5;
}
`;

/* The instanced vertex splice: wind in world space brought back into the
 * instance's frame (a yaw and a uniform scale, so its inverse is the
 * transpose over the scale squared), and the distance the band reads. */
const VERTEX_SPLICE = /* glsl */ `
vec3 transformed = vec3( position );
vec3 plantOrigin = instanceMatrix[3].xyz;
float plantS2 = dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz);
{
  float hMetres = max(position.y, 0.0) * sqrt(plantS2);
  vec3 w = plantWind(plantOrigin, hMetres, plantFlex, position);
  transformed += transpose(mat3(instanceMatrix)) * w / plantS2;
}
`;

function spliceVertex(shader, uniforms, flexAttr) {
  shader.uniforms.uTime = uniforms.uTime;
  shader.uniforms.uWindDir = uniforms.uWindDir;
  shader.uniforms.uWind = uniforms.uWind;
  shader.uniforms.uSway = uniforms.uSway;
  shader.uniforms.uFlutter = uniforms.uFlutter;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${WIND_GLSL}\n${flexAttr ? 'attribute float aFlex;' : ''}\nvarying float vPlantDist;`)
    .replace('#include <begin_vertex>', `${flexAttr ? 'float plantFlex = aFlex;' : 'float plantFlex = 0.0;'}\n${VERTEX_SPLICE}\nvPlantDist = distance(cameraPosition, plantOrigin + vec3(0.0, 10.0 * sqrt(plantS2), 0.0));`);
}

/*
 * A plant material. `kind` is 'foliage' (the atlas, alpha tested, both
 * faces, bent normals kept, light through it) or 'bark' (tiled bark with
 * its normal map, front faces). `band` is the distance band as
 * (inStart, inEnd, outStart, outEnd) in metres; the geometry must carry
 * aFlex for foliage.
 */
export function plantMaterial(kind, { map, normalMap, band, wind, sway = 6e-5, flutter = 0.06, translucency = 0.45 }) {
  const foliage = kind === 'foliage';
  const mat = new THREE.MeshStandardMaterial({
    map,
    normalMap: foliage ? null : normalMap,
    vertexColors: true,
    roughness: foliage ? 0.78 : 0.92,
    metalness: 0,
    side: foliage ? THREE.DoubleSide : THREE.FrontSide,
    alphaTest: foliage ? ALPHA_CUT : 0,
    envMapIntensity: foliage ? 0.8 : 1,
  });
  const uniforms = {
    ...wind,
    uSway: { value: sway },
    uFlutter: { value: foliage ? flutter : 0 },
    uBand: { value: new THREE.Vector4(...band) },
    uTransl: { value: translucency },
  };
  mat.userData.plant = uniforms;
  mat.onBeforeCompile = (shader) => {
    spliceVertex(shader, uniforms, foliage);
    shader.uniforms.uBand = uniforms.uBand;
    shader.uniforms.uTransl = uniforms.uTransl;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${DITHER_GLSL}\nuniform vec4 uBand;\nuniform float uTransl;\nvarying float vPlantDist;`)
      .replace('#include <clipping_planes_fragment>', `
        if (!plantKeep(plantHash(gl_FragCoord.xy), vPlantDist, uBand)) discard;
        #include <clipping_planes_fragment>`);
    if (foliage) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <normal_fragment_begin>', `
          float faceDirection = gl_FrontFacing ? 1.0 : -1.0;
          vec3 normal = normalize(vNormal);
          vec3 nonPerturbedNormal = normal;`)
        .replace('#include <lights_physical_fragment>', LEAF_SPEC_GLSL)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          #if NUM_DIR_LIGHTS > 0
          {
            vec3 L = directionalLights[0].direction;
            float into = pow(saturate(dot(-geometryViewDir, L)), 3.0);
            float wrap = 0.35 + 0.65 * saturate(dot(-geometryNormal, L) * 0.5 + 0.5);
            reflectedLight.directDiffuse += directionalLights[0].color * material.diffuseColor * uTransl * (0.4 + into) * wrap;
          }
          #endif`);
    }
  };
  mat.customProgramCacheKey = () => `swiss2-plant-${kind}`;
  return mat;
}

/* The shadow pass's material for a plant: the same wind, the same alpha
 * cut on the same atlas, packed depth as three's own. */
export function plantDepthMaterial(kind, { map, wind, sway = 6e-5, flutter = 0.06 }) {
  const foliage = kind === 'foliage';
  /* The shadow is cut at a higher alpha than the leaves are drawn at: a
   * crown lets light through between its sprays, and at the drawing cut
   * it threw a shadow as solid as a wall over its own far half. */
  const mat = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: foliage ? map : null,
    alphaTest: foliage ? 0.8 : 0,
    side: foliage ? THREE.DoubleSide : THREE.FrontSide,
  });
  const uniforms = { ...wind, uSway: { value: sway }, uFlutter: { value: foliage ? flutter : 0 } };
  mat.onBeforeCompile = (shader) => {
    spliceVertex(shader, uniforms, foliage);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vPlantDist;');
  };
  mat.customProgramCacheKey = () => `swiss2-plant-depth-${kind}`;
  return mat;
}
