/*
 * navlights.js: a plane's nav lights and wingtip strobes (docs/KITS.md
 * section 4), put on any built plane from its own drawing: red at the
 * left wingtip, green at the right, white at the tail, found as the
 * model's furthest points, so no builder is touched. Unlit meshes only,
 * no real light; the strobes run on the flight clock through the craft's
 * group's userData.setLights, as the quads' LEDs do.
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
import { navLevel } from './kitlights.js';

const RED = 0xff2010;
const GREEN = 0x20ff40;
const WHITE = 0xffffff;

/* The model's furthest vertex along a direction, in the group's frame
 * (model x right, y up, z aft: src/render/frame.js bodyPosToModel). */
function furthest(group, dir) {
  group.updateMatrixWorld(true);
  const toGroup = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  let best = -Infinity;
  const at = new THREE.Vector3();
  group.traverse((o) => {
    if (!o.isMesh || !o.visible || !o.geometry.attributes.position) {
      return;
    }
    m.multiplyMatrices(toGroup, o.matrixWorld);
    const a = o.geometry.attributes.position;
    for (let i = 0; i < a.count; i += 1) {
      v.fromBufferAttribute(a, i).applyMatrix4(m);
      const d = v.dot(dir);
      if (d > best) {
        best = d;
        at.copy(v);
      }
    }
  });
  return at;
}

/*
 * Nav lights and strobes on a built plane, by lights { nav, strobe }.
 * Sets craft.group.userData.setLights(tMs) when there are strobes. The
 * bulbs are sized by the span so a glider's read as a Cub's do. `fog` as
 * the craft was built: a far light fades with its plane.
 */
export function addNavLights(craft, lights, fog = true) {
  if (!craft || !lights || !(lights.nav || lights.strobe)) {
    return craft;
  }
  const group = craft.group;
  const left = furthest(group, new THREE.Vector3(-1, 0, 0));
  const right = furthest(group, new THREE.Vector3(1, 0, 0));
  const tail = furthest(group, new THREE.Vector3(0, 0, 1));
  const r = Math.max(0.004, (right.x - left.x) * 0.008);
  const bulb = new THREE.SphereGeometry(r, 8, 6);
  const add = (hex, at, name) => {
    const mesh = new THREE.Mesh(bulb, new THREE.MeshBasicMaterial({ color: hex, fog }));
    mesh.name = name;
    mesh.position.copy(at);
    group.add(mesh);
    return mesh;
  };
  if (lights.nav) {
    add(RED, left, 'nav-left');
    add(GREEN, right, 'nav-right');
    add(WHITE, tail, 'nav-tail');
  }
  if (lights.strobe) {
    const lift = new THREE.Vector3(0, r * 2.2, 0);
    const strobes = [add(WHITE, left.clone().add(lift), 'strobe-left'), add(WHITE, right.clone().add(lift), 'strobe-right')];
    /* A builder's own lights (a Night Timber's factory set) keep running
     * beside these. */
    const own = group.userData.setLights;
    group.userData.setLights = (tMs, ...rest) => {
      if (own) {
        own(tMs, ...rest);
      }
      const on = navLevel(tMs) > 0.5;
      for (const s of strobes) {
        s.visible = on;
      }
    };
  }
  return craft;
}
