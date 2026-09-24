/*
 * materials.js: the two materials every vehicle in the valley is drawn
 * with.
 *
 * BODY. One physical material for everything opaque, with a clear coat:
 * the finish rides on each vertex (kit.js), so a car's paint, its black
 * plastic, its tyres and its chrome are one draw, and the whole traffic is
 * one shader program. Roughness and metalness are scaled per vertex, the
 * clear coat switched off where there is no paint, a lamp that is on
 * glows, and the sky's light is cut down inside a cabin or a wheel well,
 * where three's image based light would otherwise reach as if outdoors.
 *
 * GLASS. Drawn apart and over what is behind it: a tint that lets the
 * seats show when you look straight in and turns to a mirror of the sky
 * as you look along it, which is what a car's windows do in daylight. The
 * reflection is added, not blended (premultiplied), so the sky in a
 * window is as bright as the sky in a puddle whatever the tint.
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

const need = (src, chunk) => {
  if (!src.includes(chunk)) {
    throw new Error(`swiss2 vehicles: three has no ${chunk}; the vehicle finish would silently vanish`);
  }
};

export function vehicleMaterials() {
  const body = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 1,
    metalness: 1,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
  });
  body.onBeforeCompile = (shader) => {
    need(shader.fragmentShader, '#include <lights_fragment_end>');
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 s2Fin;\nvarying vec4 vS2Fin;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvS2Fin = s2Fin;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vS2Fin;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= vS2Fin.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= max(vS2Fin.y, 0.0);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * max(-vS2Fin.y, 0.0);')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nmaterial.clearcoat *= vS2Fin.z;')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.indirectDiffuse *= vS2Fin.w;
        reflectedLight.indirectSpecular *= vS2Fin.w;
        #ifdef USE_CLEARCOAT
          clearcoatSpecularIndirect *= vS2Fin.w;
        #endif`);
  };
  body.customProgramCacheKey = () => 's2-vehicle';

  const glass = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color().setRGB(0.012, 0.016, 0.016, THREE.LinearSRGBColorSpace),
    roughness: 0.03,
    metalness: 0,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    opacity: 0.74,
    envMapIntensity: 0.9,
    side: THREE.DoubleSide,
  });
  glass.onBeforeCompile = (shader) => {
    need(shader.fragmentShader, '#include <opaque_fragment>');
    need(shader.fragmentShader, '#include <premultiplied_alpha_fragment>');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
        float s2Look = 1.0 - saturate(dot(normalize(vViewPosition), normal));
        gl_FragColor.a = mix(opacity, 1.0, s2Look * s2Look * s2Look);`)
      .replace('#include <premultiplied_alpha_fragment>', '');
  };
  glass.customProgramCacheKey = () => 's2-vehicle-glass';
  return { body, glass };
}
