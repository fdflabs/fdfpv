/*
 * glidepath.js: the landing aid a lesson draws (src/game/training.js
 * glidePoints), a line of rings down the approach to the strip's
 * threshold, the pilot flying through them as through gates. Drawn only;
 * no collider, so a ring the craft clips changes nothing in the flight.
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

const RADIUS = 2.4;
const TUBE = 0.07;
const COLOUR = 0x6fd3a0;

export function createGlidePath() {
  const group = new THREE.Group();
  group.name = 'glide-path';
  group.visible = false;
  const geo = new THREE.TorusGeometry(RADIUS, TUBE, 6, 40);
  const mat = new THREE.MeshBasicMaterial({ color: COLOUR, transparent: true, opacity: 0.8, depthWrite: false });
  let shownFor = null;

  return {
    group,
    /* points from glidePoints, the strip they lead to; null hides it. The
     * rings are rebuilt only when the strip or its ground changes. */
    show(points, strip) {
      if (!points) {
        group.visible = false;
        return;
      }
      const key = JSON.stringify(points[0]);
      if (key !== shownFor) {
        shownFor = key;
        group.clear();
        const yaw = Math.atan2(strip.dirX, strip.dirZ);
        for (const p of points) {
          const ring = new THREE.Mesh(geo, mat);
          ring.position.set(p.x, p.y, p.z);
          ring.rotation.y = yaw;
          ring.renderOrder = 2;
          group.add(ring);
        }
      }
      group.visible = true;
    },
  };
}
