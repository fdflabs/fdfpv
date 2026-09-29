/*
 * light.js: Itaipu's sun and the light every material is passed through.
 *
 * THE SUN IS THE PHOTOGRAPH'S. The colour under the ground is Sentinel-2's
 * pass of 20 December 2025 at 10:49 local (docs/ITAIPU-PLAN.md section 8):
 * azimuth 90.1 degrees, elevation 65.8. The shadows baked into it fall
 * west, so the renderer's sun stands where the satellite's stood and its
 * shadows fall the same way instead of fighting them. Never retuned.
 *
 * THE INJECTION. swiss2's material kit (src/maps/swiss2/look.js) reads
 * each fragment's world position from vS2World, which swiss2's own
 * injector (swiss2/light.js makeLit) declares; that injector also lays
 * the Alps field's terrain shadow and a cloud deck over every material,
 * both tied to the Alps' 6 km square. Itaipu's day was clear (0.02 %
 * cloud) and its sun is 65.8 degrees up, where a terrain's own shadow is
 * the dam's, which the shadow maps draw. So this injector is the part of
 * swiss2's the kit needs and the light Itaipu has: vS2World, and the
 * sky's diffuse light taken down to swiss2's measured SKY_DIFFUSE, for
 * the same reason (the photographed sky is nearly as strong a light as
 * the sun, a hazy day's flat light).
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

export const SUN_AZIMUTH_DEG = 90.1;
export const SUN_ELEVATION_DEG = 65.8;

/* swiss2/light.js SKY_DIFFUSE, measured off the same sky photograph. */
const SKY_DIFFUSE = 0.62;

/* Toward the sun. Azimuth is clockwise from north, and north is -z. */
export function sunDirection() {
  const e = THREE.MathUtils.degToRad(SUN_ELEVATION_DEG);
  const a = THREE.MathUtils.degToRad(SUN_AZIMUTH_DEG);
  return new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a)).normalize();
}

const LIT_TYPES = new Set(['MeshStandardMaterial', 'MeshPhysicalMaterial', 'MeshLambertMaterial', 'MeshPhongMaterial', 'MeshToonMaterial']);

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
    throw new Error('itaipu light: a lit material leaves no place to find its world position');
  }
  if (!shader.fragmentShader.includes('#include <lights_fragment_maps>')) {
    throw new Error('itaipu light: a lit material has no #include <lights_fragment_maps>');
  }
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vS2World;')
    .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
      #if defined( RE_IndirectDiffuse )
        iblIrradiance *= ${SKY_DIFFUSE.toFixed(3)};
      #endif`);
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
