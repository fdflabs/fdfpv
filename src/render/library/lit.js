/*
 * lit.js: the asset library's sun for lit materials, first Itaipu's
 * (src/maps/itaipu/look/light.js) and taken up by the Interior.
 *
 * THE INJECTION. swiss2's material kit (src/maps/swiss2/look.js) reads
 * each fragment's world position from vS2World, which swiss2's own
 * injector (swiss2/light.js makeLit) declares; that injector also lays
 * the Alps field's terrain shadow and a cloud deck over every material,
 * both tied to the Alps' 6 km square. Itaipu's day was clear (0.02 %
 * cloud) and its sun is 65.8 degrees up, where a terrain's own shadow is
 * the dam's, which the shadow maps draw. So this injector is the part of
 * swiss2's the kit needs and the light Itaipu has: vS2World. swiss2's
 * also takes the sky's diffuse light down to 0.62, because its
 * photographed sky is nearly as strong a light as the sun; Itaipu's sky
 * (itaipu/look/sky.js) is drawn at a clear sky's strength and lights at full.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.

/* An integer hash of a square and a salt, as a number in [0, 1). */

import * as THREE from 'three';

const LIT_TYPES = new Set(['MeshStandardMaterial', 'MeshPhysicalMaterial', 'MeshLambertMaterial', 'MeshPhongMaterial', 'MeshToonMaterial']);

/*
 * THE CASCADES ARE ONE SUN. On High, swiss2's makeSun (swiss2/light.js)
 * stands two directional lights in the sun's place, each at the sun's
 * full irradiance: a sharp shadow map round the craft and a wide one
 * past it. swiss2's injector hands each fragment to one of them, the
 * near where its map covers the fragment and the far elsewhere, with a
 * short blend at the near map's edge. Until round 4 this injector left
 * that out, so on High every lit surface took the sun twice, and past
 * the near map's 72 m every shadow was only the far light's, half the
 * sun still falling in it: the grey shade from the air that round 4's
 * measurements found (the ground's darkest twentieth at lightness 0.16
 * against the photographs' 0.12). This is swiss2's own blend.
 */
const CASCADE_PRELUDE = /* glsl */ `
  #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 1
    vec3 itCas = vDirectionalShadowCoord[ 0 ].xyz / vDirectionalShadowCoord[ 0 ].w;
    vec2 itEdge = min(itCas.xy, 1.0 - itCas.xy);
    float itNear = smoothstep(0.0, 0.07, min(itEdge.x, itEdge.y)) * step(itCas.z, 1.0);
  #endif
`;
/* After the directional light's own sun is worked out, its share: the
 * near map's light where the near map covers, the far's elsewhere. No
 * declaration: the unrolled loop's copies share one scope. */
const CASCADE_SHARE = /* glsl */ `
    #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 1
      directLight.color *= vec3(UNROLLED_LOOP_INDEX == 0 ? itNear : 1.0 - itNear);
    #endif`;
const CASCADE_LOOP = (() => {
  const loop = THREE.ShaderChunk.lights_fragment_begin;
  const at = loop.indexOf('getDirectionalLightInfo(');
  if (at < 0 || loop.lastIndexOf('getDirectionalLightInfo(') !== at) {
    throw new Error('lit: three changed its directional light loop; the cascades would silently light every surface twice');
  }
  const end = loop.indexOf(';', at) + 1;
  return `${loop.slice(0, end)}${CASCADE_SHARE}${loop.slice(end)}`;
})();

function inject(shader) {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vS2World;');
  if (shader.vertexShader.includes('#include <project_vertex>')) {
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      {
        vec4 s2w = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          s2w = instanceMatrix * s2w;
        #endif
        vS2World = (modelMatrix * s2w).xyz;
      }`);
  } else if (shader.vertexShader.includes('#include <fog_vertex>')) {
    shader.vertexShader = shader.vertexShader.replace('#include <fog_vertex>', '#include <fog_vertex>\nvS2World = (inverse(viewMatrix) * mvPosition).xyz;');
  } else {
    throw new Error('lit: a lit material leaves no place to find its world position');
  }
  if (!shader.fragmentShader.includes('#include <lights_fragment_begin>')) {
    throw new Error('lit: a lit material has no #include <lights_fragment_begin> to take one sun from the cascades');
  }
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vS2World;')
    .replace('#include <lights_fragment_begin>', `${CASCADE_PRELUDE}\n${CASCADE_LOOP}`);
}

/*
 * The injector, the shape swiss2's has: lit(material) -> material, and
 * lit.sun, the sun at a point as GLSL for a shader that is not a lit
 * material (the post chain's meter): nothing stands between the sun and
 * any point here but the shadow maps.
 */
export function makeLit() {
  function lit(mat) {
    if (!mat || mat.userData.s2Lit || !LIT_TYPES.has(mat.type)) {
      return mat;
    }
    const prev = mat.onBeforeCompile;
    const prevKey = mat.customProgramCacheKey();
    mat.onBeforeCompile = function onBeforeCompile(shader, renderer) {
      prev.call(this, shader, renderer);
      inject(shader);
    };
    mat.customProgramCacheKey = () => `itlit|${prevKey}`;
    mat.userData.s2Lit = true;
    mat.needsUpdate = true;
    return mat;
  }
  lit.sun = {
    glsl: /* glsl */ `
      float s2TerrainSun(vec3 p) { return 1.0; }
      float s2Cloud(vec3 p) { return 1.0; }
    `,
    uniforms: {},
  };
  return lit;
}
