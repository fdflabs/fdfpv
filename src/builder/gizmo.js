/*
 * gizmo.js: three arrows and three rings on a gate, for the mouse.
 *
 * When the builder's mouse is free (Esc), the selected gate carries this:
 * an arrow along the level line of travel, one across it and one straight
 * up, which drag it along themselves, and a ring about each of the gate's
 * own axes, which turn it about its opening. The axes are course.js
 * gizmoAxes; what a drag does to the gate is buildmode.js's. This file is
 * the meshes, their colours, staying the same size on screen, and which
 * handle a ray from the mouse is on.
 *
 * Each handle is drawn thin and picked fat: an invisible mesh around it a
 * few times its width takes the ray, so a handle a pixel or two wide on
 * screen is still easy to catch. All of it is drawn over the world
 * (depthTest off), since a gate half in a cliff still needs its handles.
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

/* The gizmo's size as a fraction of its distance from the camera, so it
 * is about the same size on screen near or far. */
const SCREEN = 0.16;
/* An arrow's length and a ring's radius, in gizmo units (SCREEN of the
 * distance each). */
const ARROW = 1;
const RING = 0.72;

/* Move handles by the gizmoAxes move key, turn handles by its turn key;
 * the usual red, green and blue for across, up and along. */
const HANDLES = [
  { name: 'move-across', kind: 'move', axis: 'across', colour: 0xff5a5a },
  { name: 'move-up', kind: 'move', axis: 'up', colour: 0x6fe06f },
  { name: 'move-travel', kind: 'move', axis: 'travel', colour: 0x5aa8ff },
  { name: 'turn-yaw', kind: 'turn', axis: 'yaw', colour: 0x6fe06f },
  { name: 'turn-pitch', kind: 'turn', axis: 'pitch', colour: 0xff5a5a },
  { name: 'turn-roll', kind: 'turn', axis: 'roll', colour: 0x5aa8ff },
];

const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

function arrowMeshes(mat, pickMat) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, ARROW * 0.78, 8), mat);
  shaft.position.y = ARROW * 0.39;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.07, ARROW * 0.22, 14), mat);
  head.position.y = ARROW * 0.89;
  const pick = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, ARROW, 6), pickMat);
  pick.position.y = ARROW * 0.5;
  g.add(shaft, head, pick);
  return { group: g, pick, drawn: [shaft, head] };
}

function ringMeshes(mat, pickMat) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(RING, 0.014, 6, 64), mat);
  const pick = new THREE.Mesh(new THREE.TorusGeometry(RING, 0.08, 6, 32), pickMat);
  g.add(ring, pick);
  return { group: g, pick, drawn: [ring] };
}

export function createGizmo() {
  const group = new THREE.Group();
  group.name = 'build-gizmo';
  group.visible = false;
  group.renderOrder = 30;
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });
  const handles = HANDLES.map((h) => {
    const mat = new THREE.MeshBasicMaterial({
      color: h.colour, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false,
    });
    const made = h.kind === 'move' ? arrowMeshes(mat, pickMat) : ringMeshes(mat, pickMat);
    for (const m of made.drawn) {
      m.renderOrder = 30;
    }
    made.pick.userData.handle = h.name;
    group.add(made.group);
    return { ...h, ...made, mat };
  });
  const pickables = handles.map((h) => h.pick);
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  let hovered = null;

  /* Stand it on `axes` (course.js gizmoAxes), sized for a camera at `eye`. */
  function place(axes, eye) {
    const p = axes.pivot;
    group.position.set(p.x, p.y, p.z);
    group.scale.setScalar(Math.max(0.5, eye.distanceTo(group.position) * SCREEN));
    for (const h of handles) {
      const a = h.kind === 'move' ? axes.move[h.axis] : axes.turn[h.axis];
      v.set(a.x, a.y, a.z).normalize();
      q.setFromUnitVectors(h.kind === 'move' ? Y : Z, v);
      h.group.quaternion.copy(q);
    }
    group.updateMatrixWorld(true);
  }

  /* The handle a ray meets, by name, or null. */
  function handleOn(raycaster) {
    if (!group.visible) {
      return null;
    }
    const hits = raycaster.intersectObjects(pickables, false);
    return hits.length ? hits[0].object.userData.handle : null;
  }

  function hover(name) {
    if (name === hovered) {
      return;
    }
    hovered = name;
    for (const h of handles) {
      h.mat.opacity = !name || h.name === name ? 0.95 : 0.35;
      h.mat.color.set(h.colour);
      if (h.name === name) {
        h.mat.color.lerp(new THREE.Color(0xffffff), 0.45);
      }
    }
  }

  function dispose() {
    group.traverse((o) => {
      if (o.geometry) {
        o.geometry.dispose();
      }
    });
    handles.forEach((h) => h.mat.dispose());
    pickMat.dispose();
  }

  return {
    group,
    place,
    handleOn,
    hover,
    dispose,
    /* A point on a handle in the scene, for the harness to press on: an
     * arrow's head, or a ring `deg` degrees round from its own x, 45 by
     * default, half way between two arrows where no arrow crosses it. */
    pointOn(name, deg = 45) {
      const h = handles.find((x) => x.name === name);
      const a = (deg * Math.PI) / 180;
      const local = h.kind === 'move' ? new THREE.Vector3(0, ARROW * 0.85, 0) : new THREE.Vector3(RING * Math.cos(a), RING * Math.sin(a), 0);
      return h.group.localToWorld(local);
    },
    get hovered() {
      return hovered;
    },
    kindOf(name) {
      const h = handles.find((x) => x.name === name);
      return h ? { kind: h.kind, axis: h.axis } : null;
    },
  };
}
