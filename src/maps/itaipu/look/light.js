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
 * swiss2's the kit needs and the light Itaipu has: vS2World. swiss2's
 * also takes the sky's diffuse light down to 0.62, because its
 * photographed sky is nearly as strong a light as the sun; Itaipu's sky
 * (sky.js) is drawn at a clear sky's strength and lights at full.
 *
 * THE KEY AND THE FILL. Round 1 lit Itaipu with swiss2's photographed
 * Alpine sky, nearly as strong a light as the sun, and every view was
 * overcast: the ground's darkest twentieth at lightness 0.24 where the
 * photographs' is at 0.12 (tools/swiss2-loop/colour.py). The sky is now
 * a clear tropical one (sky.js), and its light on the level is about a
 * fifth of the sun's, as a clear sky's is at this height of sun, so a
 * shadow is two and a half stops under the sunlit ground and blue with
 * the sky it is lit by. The sun is the valley's irradiance, a little
 * warmer: at 65.8 degrees there is little air in the way, and the
 * photographs' sunlit concrete and red earth are warm against the shade.
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

export const SUN_COLOR = new THREE.Color(1.0, 0.93, 0.82);
export const SUN_IRRADIANCE = 3.51;
/* The post chain's base exposure (swiss2/post.js AIR.exposure), before
 * the meter. The valley's 1.45 left the views light under the clear sky:
 * the ground's median lightness 0.51 over eight of the loop's views, the
 * photographs' 0.41 over all of them. At 1.15 it is 0.40 over all 22. */
export const EXPOSURE = 1.15;

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
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vS2World;');
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
