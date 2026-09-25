/*
 * sheet-page.js: the page side of the crash suite's contact sheets.
 *
 * Builds the map a scenario names (?map=), through the game's own shell
 * and map builders, with the aircraft it names (?craft=, a configs/
 * airframes.js id) drawn by the game's own model, and poses both from the
 * scenario's recorded trace. The scenario's plant frame is put where the
 * shell puts a run: its origin on the map's spawn, on the ground there (on
 * the water, for ?water=1), turned by the spawn's yaw, through
 * src/render/frame.js, the one conversion. The solids a scenario flies
 * into are not in the map, so they are drawn here as plain shapes of the
 * sizes the suite collided with.
 *
 * window.__crashSheet.solids(list, ground) draws the solids and, for a
 * scenario on a slope, the slope; .show(frame) poses the craft and the
 * camera, all in plant coordinates, and renders one frame for the harness
 * to capture.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';
import { buildShell } from '../../src/render/shell.js';
import { mapById } from '../../src/maps/registry.js';
import { waterFor } from '../../src/game/water.js';
import { simPosToThree, simQuatToThree } from '../../src/render/frame.js';

const params = new URLSearchParams(window.location.search);
const mapId = params.get('map') ?? 'airfield';
const airframe = params.get('craft') ?? '5inch';
const onWater = params.get('water') === '1';

const canvas = document.getElementById('view');
const shell = buildShell(canvas, { airframe, pixelRatio: 1 });

/* What each kind of solid looks like: near enough the material the shell
 * gives it (src/game/collide.js contactMaterial) to read at a glance. */
const LOOK = {
  gate: 0xe8e8e0,
  pole: 0x7a5a3a,
  wall: 0xa8a098,
  tree: 0x5b4330,
  canopy: 0x3f6b2e,
};

async function build() {
  const entry = mapById(mapId);
  const mod = await entry.load();
  const view = await mod.buildMap(shell, () => {}, { quality: params.get('quality') ?? 'high' });
  const water = await waterFor(mapId);
  const sp = onWater && water.length ? water[0].spawn : view.spawn;
  const y0 = onWater && water.length ? water[0].surfaceY : view.height(sp.x, sp.z, sp.y ?? Infinity);
  const qSpawn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), sp.yaw);
  const tmp = new THREE.Vector3();
  const world = (p) => {
    simPosToThree(p[0], p[1], p[2], tmp);
    tmp.applyQuaternion(qSpawn);
    return new THREE.Vector3(tmp.x + sp.x, tmp.y + y0, tmp.z + sp.z);
  };
  return { view, world, qSpawn, found: entry.id };
}

const ready = build();
const extras = new THREE.Group();

window.__crashSheet = {
  ready: ready.then((b) => ({ map: b.found })),
  async solids(list, ground) {
    const { view, world } = await ready;
    extras.removeFromParent();
    extras.clear();
    for (const s of list) {
      const mat = new THREE.MeshLambertMaterial({ color: LOOK[s.kind] ?? 0x999999 });
      if (s.shape === 'sphere') {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s.r, 2), mat);
        m.position.copy(world(s.c));
        extras.add(m);
      } else if (s.shape === 'capsule') {
        const a = world(s.a);
        const b = world(s.b);
        const len = a.distanceTo(b);
        const m = new THREE.Mesh(new THREE.CylinderGeometry(s.r, s.r, len, 16), mat);
        m.position.copy(a).add(b).multiplyScalar(0.5);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        extras.add(m);
      } else if (s.shape === 'plane') {
        /* A wall: 12 m wide, 6 m high, 0.4 m thick, its face on the plane. */
        const p = world(s.p);
        const n = world([s.p[0] + s.n[0], s.p[1] + s.n[1], s.p[2] + s.n[2]]).sub(p).normalize();
        const m = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 0.4), mat);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
        m.position.copy(p).addScaledVector(n, -0.2);
        m.position.y = world([s.p[0], s.p[1], 3]).y;
        extras.add(m);
      }
    }
    if (ground) {
      /* A slope the map does not have: a 120 m square of grass on the
       * scenario's ground plane. */
      const p = world(ground.p);
      const n = world([ground.p[0] + ground.n[0], ground.p[1] + ground.n[1], ground.p[2] + ground.n[2]]).sub(p).normalize();
      const m = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshLambertMaterial({ color: 0x5d7a3a }));
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      m.position.copy(p);
      extras.add(m);
    }
    view.scene.add(extras);
    return true;
  },
  /* frame: { pos, quat (w x y z), cam, look, fov }, plant frame. */
  async show(frame) {
    const { view, world, qSpawn } = await ready;
    shell.quad.visible = true;
    shell.quad.position.copy(world(frame.pos));
    const q = new THREE.Quaternion();
    simQuatToThree(frame.quat[0], frame.quat[1], frame.quat[2], frame.quat[3], q);
    shell.quad.quaternion.copy(q.premultiply(qSpawn));
    const cam = shell.camera;
    cam.fov = frame.fov ?? 50;
    cam.near = 0.05;
    cam.updateProjectionMatrix();
    cam.position.copy(world(frame.cam));
    cam.up.set(0, 1, 0);
    cam.lookAt(world(frame.look));
    if (view.updateAnim) {
      view.updateAnim(0);
    }
    if (view.updateShadowFocus) {
      view.updateShadowFocus(shell.quad.position);
    }
    view.post.render();
    return true;
  },
};
