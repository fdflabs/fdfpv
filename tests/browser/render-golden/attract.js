/*
 * render-golden/attract.js: the title camera of src/render/attract.js,
 * sampled through time: the default orbit, a map's orbit, and lines of
 * several shapes, wide and narrow frames, with and without the menu
 * overlay, with and without the airframe and its flourish, and clocks
 * that start negative, stall and run backwards. Positions to ten
 * significant figures.
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
import { makeAttractCamera } from '../../../src/render/attract.js';

const sig = (v) => (typeof v === 'number' ? Number(v.toPrecision(10)) + 0 : `${v}`);
const arr = (v) => v.toArray().map(sig);

function snap(camera, craft) {
  const v = camera.view;
  return {
    p: arr(camera.position),
    q: arr(camera.quaternion),
    up: arr(camera.up),
    fov: camera.fov,
    aspect: sig(camera.aspect),
    view: v ? [v.enabled, sig(v.fullWidth), v.fullHeight, sig(v.offsetX), sig(v.offsetY), sig(v.width), v.height] : null,
    proj: camera.projectionMatrix.toArray().map(sig),
    craft: craft ? { visible: craft.visible, p: arr(craft.position), q: arr(craft.quaternion), up: arr(craft.up) } : null,
  };
}

const ring = (n, r, y, wobble) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2;
  return { x: Math.cos(a) * r * (1 + wobble * Math.sin(3 * a)), y: y + wobble * 4 * Math.cos(2 * a), z: Math.sin(a) * r };
});
const figureEight = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2;
  return { x: Math.sin(a) * 40, y: 6 + (i % 3), z: Math.sin(2 * a) * 18 };
});

const VIEWS = {
  none: null,
  noAttract: {},
  orbit: { attract: { x: 5, y: 2, z: -7, radius: 14, eye: 3.5, aim: 1.2 } },
  lowOrbit: { attract: { x: 0, y: 0, z: 0, radius: 60, eye: 1.5, aim: 0.3 } },
  shortPath: { attract: { path: ring(3, 20, 5, 0), radius: 3 } },
  ring: { attract: { path: ring(16, 30, 8, 0.15) } },
  eight: { attract: { path: figureEight, speed: 20, lookAhead: 10, aimDrop: 1 } },
  tiny: { attract: { path: ring(5, 2, 1, 0), lookAhead: 30 } },
  straightish: { attract: { path: [{ x: 0, y: 3, z: 0 }, { x: 0, y: 3, z: 50 }, { x: 0.01, y: 3, z: 100 }, { x: 0, y: 3, z: 150 }] } },
};

const CLOCK = [-500, 0, 16, 33, 50, 1000, 1000, 5000, 4000, 4016, 60000, 1e7, NaN];

function run(view, aspect, overlay, withCraft, flourish) {
  const cam = makeAttractCamera(view);
  const camera = new THREE.PerspectiveCamera(70, aspect, 0.1, 5000);
  const craft = withCraft ? new THREE.Object3D() : null;
  const rows = [{ kind: cam.kind, periodMs: sig(cam.periodMs), length: cam.length === undefined ? null : sig(cam.length) }];
  for (const t of CLOCK) {
    const opts = { overlay, craft, ...(flourish ? { roll: Math.sin(t) * 0.9, pitch: 0.1, yaw: -0.5 } : {}) };
    try {
      cam.update(t, camera, opts);
      rows.push(snap(camera, craft));
    } catch (e) {
      rows.push({ threw: String(e.message) });
    }
  }
  /* Overlay toggled off on the same camera, and the frame resized. */
  cam.update(70000, camera, { overlay: false, craft });
  rows.push(snap(camera, craft));
  camera.aspect = aspect * 0.5;
  camera.updateProjectionMatrix();
  cam.update(70016, camera, { overlay: true, craft });
  rows.push(snap(camera, craft));
  return rows;
}

export function cases() {
  const out = {};
  for (const [name, view] of Object.entries(VIEWS)) {
    out[name] = () => [
      run(view, 16 / 9, true, true, false),
      run(view, 16 / 9, false, false, false),
      run(view, 0.5, true, true, true),
      run(view, 0.96, true, false, true),
    ];
  }
  return out;
}
