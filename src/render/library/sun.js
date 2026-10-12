/*
 * sun.js: the asset library's sun with its shadow cascades, first the
 * Swiss valley's (src/maps/swiss2/light.js), which Itaipu lights itself
 * with too. The light a material reads from it is lit.js's (one sun from
 * the cascades) or a map's own injector.
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

/*
 * The sun: one light, or on High two that split it, each with its shadow
 * map. update(focus, camera) keeps the near map round the focus and the
 * far one on the ground ahead of the camera, both snapped to their texel
 * in the light's own frame so a moving camera does not make the edges
 * crawl. `color` and `irradiance` are the map's sun's (linear, and W/m2
 * as the map's exposure takes it). `q` is the quality tier: `shadows`,
 * `id` ('high' adds the far map) and `field.shadowMap` and
 * `field.shadowHalf` for the near map's size and reach.
 */
export function makeSun(scene, q, dir, { color, irradiance }) {
  const lights = [];
  const add = (half, size, depth, bias, normalBias) => {
    const light = new THREE.DirectionalLight(color, irradiance);
    light.castShadow = q.shadows;
    light.shadow.mapSize.set(size, size);
    light.shadow.camera.near = 1;
    light.shadow.camera.far = depth;
    light.shadow.camera.left = -half;
    light.shadow.camera.right = half;
    light.shadow.camera.top = half;
    light.shadow.camera.bottom = -half;
    light.shadow.bias = bias;
    light.shadow.normalBias = normalBias;
    light.userData.half = half;
    light.userData.texel = (2 * half) / size;
    light.userData.depth = depth;
    scene.add(light);
    scene.add(light.target);
    lights.push(light);
    return light;
  };
  const nearSize = q.field.shadowMap || 2048;
  add(q.field.shadowHalf || 72, nearSize, 900, -0.0006, 0.04);
  if (q.shadows && q.id === 'high') {
    add(700, 2048, 4000, -0.0004, 0.6);
  }
  /* The light's own frame, for snapping. */
  const zAxis = dir.clone().normalize();
  const xAxis = new THREE.Vector3(0, 1, 0).cross(zAxis).normalize();
  const yAxis = zAxis.clone().cross(xAxis);
  const centre = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const snap = (v, texel, out) => {
    const a = Math.round(v.dot(xAxis) / texel) * texel;
    const b = Math.round(v.dot(yAxis) / texel) * texel;
    const c = v.dot(zAxis);
    return out.copy(xAxis).multiplyScalar(a).addScaledVector(yAxis, b).addScaledVector(zAxis, c);
  };
  function update(focus, camera) {
    lights.forEach((light, k) => {
      centre.copy(focus);
      if (k === 1 && camera) {
        camera.getWorldDirection(fwd);
        fwd.y = 0;
        if (fwd.lengthSq() > 1e-6) {
          fwd.normalize();
          centre.addScaledVector(fwd, light.userData.half * 0.75);
        }
      }
      snap(centre, light.userData.texel, centre);
      light.target.position.copy(centre);
      light.position.copy(centre).addScaledVector(zAxis, light.userData.depth * 0.5);
      light.target.updateMatrixWorld();
      light.updateMatrixWorld();
    });
  }
  return { lights, update };
}
