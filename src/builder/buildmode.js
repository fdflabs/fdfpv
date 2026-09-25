/*
 * buildmode.js: build a track inside a world, and fly it.
 *
 * The owner's ask: "How can I get into a creative mode, builder mode, with
 * the current map, so we can build our tracks and place gates within the
 * actual architecture of the map." The track builder page draws a plan of an
 * empty field, so a gate off the side of a cliff for a drop could not be put
 * anywhere near a cliff. This puts the builder where the cliffs are.
 *
 * THREE STATES, AND B MOVES BETWEEN THEM.
 *
 *   off       the pilot is flying the map. B (a pad's Back) starts building.
 *   building  the aircraft is parked where it was and a free camera flies
 *             the valley with no collision. A crosshair reads the surface
 *             it points at off the GPU (pick.js) and a ghost gate shows
 *             where the next one would go. B flies the track.
 *   testing   the track's gates are the map's course for a run from the
 *             start gate, on the race's own scoring, lap clock and results.
 *             B goes back to building, to the camera where it was left.
 *
 * Escape while building steps back one thing at a time: drop what is held,
 * then the selection, then leave building for the flight that was paused.
 *
 * WHAT IT TOUCHES IN THE SHELL, and only through `host` (main.js): the
 * run's mode (a paused run is a frozen plant, which is exactly the parked
 * aircraft this needs), the race (a new Race over the built gates), and the
 * seated map's view. For a test flight the view's course is swapped for the
 * built one: its gates, its target and its spawn, and its mode reads 'race'
 * so the OSD, the lap clock and the results are the race's. Everything is
 * put back when the run returns to building or building ends. That swap is
 * the whole of how "a built track races on the existing race flow" is done,
 * and the reason it is a swap on the view rather than a second map: the
 * valley took most of a minute to build and a test flight should take none.
 *
 * WHAT IT DOES NOT DO YET, by the plan agreed with the owner: the racing
 * line and geometry warnings (phase 2), the board and ghosts (phase 3), the
 * town and Yellowstone (phase 4).
 *
 * THE GATES ARE SOLID, the way a field gate is: every edit hands the whole
 * built set to the valley's colliders (Colliders.setBuilt), which put it in
 * beside the frozen few thousand, so a test flight into a frame is the
 * shell's own contact and, with crash damage on, the plant's.
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
import { str } from '../strings/index.js';
import { ELEMENTS } from '../trackbuilder/elements.js';
import { elementById, touch } from '../trackbuilder/model.js';
import { listMapTracks, makeAutosaver, readMapAutosave, saveTrack } from '../trackbuilder/storage.js';
import {
  colourTargetSide, disposeStandaloneGate, dressGate, lightTarget, standaloneGate,
} from '../render/scene.js';
import { createPicker, marchHeight, PICK_RANGE } from './pick.js';
import {
  BUILD_TYPES, SNAP_MODES, addGate, gateFlags, gateSpec, headingOf, makeStart, moveInLap, newCourse,
  openingCentre, openingsOf, orderOf, poseOf, qAxis, raceGatesOf, readoutFor, removeGate, setPose, snapPose,
  spawnFor, turnGate, worldCaps,
} from './course.js';

/* The camera's two speeds, metres a second: a slow one to put a gate on a
 * ledge, and one to cross the six kilometre valley in about a minute. */
const SPEED_SLOW = 6;
const SPEED_FAST = 90;
/* Turn rates for keys and sticks, radians a second, and mouse radians a
 * pixel. */
const TURN_RATE = 1.6;
const LOOK_RATE = 1.1;
const MOUSE_RATE = 0.0024;
/* One press of a turn key, and one with Shift held for the fine one. */
const TURN_STEP = 15 * Math.PI / 180;
const TURN_FINE = 1 * Math.PI / 180;
/* A press of Page Up or Down on a placed gate, metres, and fine. */
const NUDGE = 0.5;
const NUDGE_FINE = 0.1;
/* How far in front of the camera an air gate hangs, and its limits. */
const AIR_DEFAULT = 20;
const AIR_MIN = 3;
const AIR_MAX = 150;
/* A stick deflection under this is a stick at rest. */
const DEAD = 0.12;
/* How far a ray has to move, metres at its origin or radians of direction,
 * before the crosshair asks the GPU again. */
const RAY_EPS = 0.02;
/* How long the camera has to be still before the GPU is asked for the
 * exact surface under the crosshair, milliseconds. */
const REST_MS = 150;
/* Escape that arrives this soon after the pointer was released is the
 * release, not a request to step back. Chrome hands the page the key that
 * ended the lock on some builds and not on others. */
const UNLOCK_GRACE_MS = 250;

/* Standard gamepad buttons (the W3C mapping). */
const PAD = {
  a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, back: 8, start: 9, ls: 10, rs: 11,
  up: 12, down: 13, left: 14, right: 15,
};

export function createBuildMode(host) {
  const { shell, input, ui } = host;
  const renderer = shell.renderer;
  const camera = shell.camera;
  const picker = createPicker(renderer);
  const autosave = makeAutosaver(500);

  let state = 'off';
  let view = null;
  let doc = null;
  /* The gates as built, by element id: { made, group }. */
  const meshes = new Map();
  let root = null;
  let ghost = null;
  let selected = null;
  let held = null;
  let typeIndex = 0;
  let snapIndex = 0;
  let airDistance = AIR_DEFAULT;
  const turn = { yaw: 0, pitch: 0, roll: 0 };
  /* The free camera: where it is and where it looks. */
  const cam = { pos: new THREE.Vector3(), yaw: 0, pitch: 0 };
  let parked = null;
  let tested = false;
  let hit = null;
  let hitAt = -Infinity;
  /* The ray the crosshair's reading was taken along, hit or miss, and
   * whether it is the GPU's exact one. */
  let hitRay = { origin: new THREE.Vector3(Infinity, 0, 0), dir: new THREE.Vector3(), exact: false };
  let asked = false;
  let movedAt = 0;
  const lastRay = { origin: new THREE.Vector3(Infinity, 0, 0), dir: new THREE.Vector3() };
  const mouse = { dx: 0, dy: 0, dragging: false };
  let unlockedAt = -Infinity;
  let padPrev = [];
  let message = { text: '', until: 0 };
  let showHelp = true;
  let hud = null;
  let hudText = '';
  let helpText = '';
  let hidden = [];
  /* The view's own course, put back after a test flight. */
  let patched = null;
  const aim = {
    active: false, sceneIndex: -1, centre: new THREE.Vector3(), travel: { x: 0, y: 0, z: -1 }, clearH: 0, correct: true, distance: 0, virtual: false,
  };
  let courseGates = [];

  const fwd = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const raycaster = new THREE.Raycaster();

  function say(text, ms = 2600) {
    message = { text, until: performance.now() + ms };
  }

  /* ---------------------------------------------------------------- */
  /* Meshes                                                            */
  /* ---------------------------------------------------------------- */

  function makeGate(el, index, isStart) {
    const made = standaloneGate(gateSpec(el), index, isStart, gateFlags(el));
    const group = made.group;
    group.userData.elementId = el.id;
    return { made, group };
  }

  function place(group, el) {
    const { base, quat } = poseOf(el);
    group.position.set(base.x, base.y, base.z);
    group.quaternion.set(quat.x, quat.y, quat.z, quat.w);
    group.updateMatrixWorld(true);
  }

  /* Every gate from the document: numbers follow the lap, so any change to
   * the lap redraws them all. A track is tens of gates, and a redraw is a
   * few milliseconds on the frame the edit happens in. */
  function rebuildAll() {
    for (const m of meshes.values()) {
      m.group.removeFromParent();
      disposeStandaloneGate(m.made);
    }
    meshes.clear();
    doc.sequence.forEach((s, i) => {
      const el = elementById(doc, s.elementId);
      if (!el || meshes.has(el.id)) {
        return;
      }
      const m = makeGate(el, i, i === 0);
      place(m.group, el);
      root.add(m.group);
      meshes.set(el.id, m);
    });
    dressAll();
    solidify();
  }

  /* The gates as the craft meets them: every frame member, panel and mast
   * of every gate where the document has it now, replacing the last set.
   * The free camera never asks the colliders, so building flies through
   * them all. */
  function solidify() {
    if (!view || !view.colliders) {
      return;
    }
    const caps = [];
    for (const [id, m] of meshes) {
      const el = elementById(doc, id);
      if (el) {
        caps.push(...worldCaps(el, m.made.colliders));
      }
    }
    view.colliders.setBuilt(caps);
  }

  /* While building: every gate's ring on, the selected one lit. */
  function dressAll() {
    for (const [id, m] of meshes) {
      const gt = dressable(m, 0);
      if (id === selected && !held) {
        lightTarget(gt);
        colourTargetSide(gt, true);
      } else {
        dressGate(gt, 'follow');
      }
      m.group.visible = id !== held;
    }
  }

  /* The shape dressGate and lightTarget read, from a built gate. */
  function dressable(m, apertureIndex) {
    const made = m.made;
    return {
      ringMat: made.ringMat,
      haloMat: made.haloMat,
      glowMat: made.glowMat,
      ringMeshes: made.ringMeshes,
      haloMeshes: made.haloMeshes,
      litApertures: [apertureIndex],
      ringColor: made.ringColor,
      glowMesh: made.glowMesh,
      glowGain: 1,
      cueGroup: made.cueGroup,
      fillMat: made.fillMat,
      aperture: made.apertures[apertureIndex] ?? made.apertures[0],
      trackGlow: made.apertures.length > 1,
      virtual: false,
    };
  }

  const ghostMat = new THREE.MeshBasicMaterial({
    color: 0x8fe9ff, transparent: true, opacity: 0.42, depthWrite: false,
  });

  function ghostType() {
    if (held) {
      return elementById(doc, held).type;
    }
    return BUILD_TYPES[typeIndex];
  }

  /* The ghost is a real gate of the type about to be placed, in one pale
   * see-through material, so what it shows is the size and shape that will
   * land. */
  function ensureGhost() {
    const type = ghostType();
    const el = held ? elementById(doc, held) : { type, dims: ELEMENTS[type].dims, flagSide: ELEMENTS[type].flagSide };
    const key = held ? `held:${held}` : type;
    if (ghost && ghost.key === key) {
      return;
    }
    if (ghost) {
      ghost.group.removeFromParent();
      disposeStandaloneGate(ghost.made);
    }
    const made = standaloneGate(gateSpec(el), 0, false, gateFlags(el));
    made.group.traverse((o) => {
      if (o.isMesh) {
        o.material = ghostMat;
        o.castShadow = false;
        o.renderOrder = 10;
      }
    });
    /* The target's light is a pane across the opening and a glow round it;
     * in the ghost's one material they would fill the hole the ghost is
     * there to show. */
    for (const part of [made.glowMesh, made.cueGroup, ...(made.haloMeshes || [])]) {
      if (part) {
        part.visible = false;
      }
    }
    ghost = { key, made, group: made.group, centreY: openingsOf(el)[0].centreY, pose: null };
    root.add(ghost.group);
  }

  /* ---------------------------------------------------------------- */
  /* The camera                                                        */
  /* ---------------------------------------------------------------- */

  function cameraFromShell() {
    cam.pos.copy(camera.position);
    euler.setFromQuaternion(camera.quaternion, 'YXZ');
    cam.yaw = euler.y;
    cam.pitch = Math.max(-1.5, Math.min(1.5, euler.x));
  }

  function forward(out) {
    euler.set(cam.pitch, cam.yaw, 0, 'YXZ');
    return out.set(0, 0, -1).applyEuler(euler);
  }

  function keyAxis(pos, neg) {
    return (input.keys.has(pos) ? 1 : 0) - (input.keys.has(neg) ? 1 : 0);
  }

  function stick(v) {
    return Math.abs(v) < DEAD ? 0 : v;
  }

  function driveCamera(dtS, pad, padDown) {
    const shift = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
    const fast = shift || padDown(PAD.lt);
    const speed = fast ? SPEED_FAST : SPEED_SLOW;
    let ahead = keyAxis('KeyW', 'KeyS');
    let side = keyAxis('KeyD', 'KeyA');
    let rise = keyAxis('KeyE', 'KeyQ');
    let yawIn = keyAxis('ArrowLeft', 'ArrowRight');
    let lookIn = keyAxis('ArrowUp', 'ArrowDown');
    /* A pad or a radio: the right stick flies it like a drone, pitch ahead
     * and roll sideways, and the left turns it and climbs, with the
     * throttle's middle as a hover so a radio's unsprung throttle has a
     * place to rest. */
    if (pad) {
      const ch = input.channels;
      ahead += stick(ch.pitch);
      side += stick(ch.roll);
      yawIn -= stick(ch.yaw);
      rise += stick((ch.throttle - 0.5) * 2);
      if (!padDown(PAD.rt)) {
        lookIn += (padDown(PAD.up) ? 1 : 0) - (padDown(PAD.down) ? 1 : 0);
      }
    }
    cam.yaw += yawIn * TURN_RATE * dtS;
    cam.pitch += lookIn * LOOK_RATE * dtS;
    if (document.pointerLockElement === shell.canvas || mouse.dragging) {
      cam.yaw -= mouse.dx * MOUSE_RATE;
      cam.pitch -= mouse.dy * MOUSE_RATE;
    }
    mouse.dx = 0;
    mouse.dy = 0;
    cam.pitch = Math.max(-1.5, Math.min(1.5, cam.pitch));
    const sy = Math.sin(cam.yaw);
    const cy = Math.cos(cam.yaw);
    cam.pos.x += (-sy * ahead + cy * side) * speed * dtS;
    cam.pos.z += (-cy * ahead - sy * side) * speed * dtS;
    cam.pos.y += rise * speed * dtS;
    camera.position.copy(cam.pos);
    euler.set(cam.pitch, cam.yaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(euler);
    camera.updateMatrixWorld();
  }

  /* ---------------------------------------------------------------- */
  /* Placement                                                         */
  /* ---------------------------------------------------------------- */

  function excluded() {
    const out = [root, shell.quad];
    return out.filter(Boolean);
  }

  /*
   * The crosshair's surface. While the camera moves it is the map's height
   * function, read on the CPU for nothing; once the camera has been still
   * for REST_MS the GPU is asked for the exact surface, the rock and the
   * roofs included, and that answer stands until the camera moves again.
   * Asking every frame cost the main thread a synchronous trip to Chrome's
   * GPU process each time (pick.js), measured at 57 to 75 ms with the GPU
   * busy; asking once per stop costs one.
   */
  function trackCrosshair(now) {
    const got = picker.poll();
    if (got !== undefined) {
      asked = false;
      if (got.origin.equals(lastRay.origin) && got.dir.equals(lastRay.dir)) {
        hit = got.hit;
        hitRay = { origin: got.origin, dir: got.dir, exact: true };
        hitAt = now;
      }
    }
    forward(fwd);
    const moved = lastRay.origin.distanceTo(cam.pos) > RAY_EPS || lastRay.dir.angleTo(fwd) > RAY_EPS * 0.05;
    if (moved) {
      lastRay.origin.copy(cam.pos);
      lastRay.dir.copy(fwd);
      movedAt = now;
      hit = marchHeight(host.heightAt, cam.pos, fwd);
      hitRay = { origin: cam.pos.clone(), dir: fwd.clone(), exact: false };
      hitAt = now;
      return;
    }
    if (!hitRay.exact && !asked && now - movedAt > REST_MS) {
      asked = picker.request(view.scene, lastRay.origin, lastRay.dir, excluded());
    }
  }

  function camFrame() {
    forward(fwd);
    return { position: { x: cam.pos.x, y: cam.pos.y, z: cam.pos.z }, forward: { x: fwd.x, y: fwd.y, z: fwd.z } };
  }

  function ghostPose(h) {
    return snapPose(SNAP_MODES[snapIndex], h, camFrame(), turn, airDistance, ghost.centreY);
  }

  /* Where the ghost is right now, for the frame. */
  function updateGhost() {
    const show = state === 'building' && (held || !selected);
    if (!show) {
      if (ghost) {
        ghost.group.visible = false;
      }
      return;
    }
    ensureGhost();
    const pose = ghostPose(hit);
    ghost.pose = pose;
    ghost.group.visible = true;
    ghost.group.position.set(pose.base.x, pose.base.y, pose.base.z);
    ghost.group.quaternion.set(pose.quat.x, pose.quat.y, pose.quat.z, pose.quat.w);
  }

  /* The gate under the crosshair, if one is nearer than the world there. */
  function gateUnderCrosshair(worldDistance) {
    raycaster.set(cam.pos, forward(fwd));
    raycaster.far = Math.min(PICK_RANGE, worldDistance ?? PICK_RANGE);
    const visible = [...meshes.values()].map((m) => m.group).filter((g) => g.visible);
    const hits = raycaster.intersectObjects(visible, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.elementId) {
        o = o.parent;
      }
      if (o) {
        return o.userData.elementId;
      }
    }
    return null;
  }

  function edited() {
    touch(doc);
    autosave.schedule(doc);
    solidify();
  }

  /* Enter, a click, or the pad's A: put down, drop, or pick up a selection. */
  function commit() {
    ensureGhost();
    /* Exact, for the moment it matters: the crosshair's reading may be a
     * frame old. */
    const now = picker.pick(view.scene, cam.pos, forward(fwd), excluded());
    if (held) {
      const el = elementById(doc, held);
      const pose = ghostPose(now);
      setPose(el, pose.base, pose.quat);
      place(meshes.get(held).group, el);
      held = null;
      edited();
      dressAll();
      say(str('build.moved', { n: orderOf(doc, el.id) + 1 }));
      return;
    }
    const onGate = gateUnderCrosshair(now ? now.distance : null);
    if (onGate) {
      selected = selected === onGate ? null : onGate;
      dressAll();
      return;
    }
    if (selected) {
      selected = null;
      dressAll();
      return;
    }
    const pose = ghostPose(now);
    const el = addGate(doc, BUILD_TYPES[typeIndex], pose.base, pose.quat);
    edited();
    rebuildAll();
    say(str('build.placed', { n: orderOf(doc, el.id) + 1, mode: str(`build.snap_${pose.mode}`) }));
  }

  function grab() {
    if (!selected) {
      say(str('build.select_first'));
      return;
    }
    held = selected;
    dressAll();
  }

  function deleteSelected() {
    if (!selected) {
      say(str('build.select_first'));
      return;
    }
    const n = orderOf(doc, selected) + 1;
    removeGate(doc, selected);
    selected = null;
    held = null;
    edited();
    rebuildAll();
    say(str('build.deleted', { n }));
  }

  function selectStep(step) {
    const ids = doc.sequence.map((s) => s.elementId);
    if (!ids.length) {
      return;
    }
    const at = selected ? ids.indexOf(selected) : (step > 0 ? -1 : 0);
    selected = ids[(at + step + ids.length) % ids.length];
    held = null;
    dressAll();
  }

  function reorder(step) {
    if (!selected) {
      say(str('build.select_first'));
      return;
    }
    if (moveInLap(doc, selected, step)) {
      edited();
      rebuildAll();
      say(str('build.now_gate', { n: orderOf(doc, selected) + 1 }));
    }
  }

  function startHere() {
    if (!selected) {
      say(str('build.select_first'));
      return;
    }
    makeStart(doc, selected);
    edited();
    rebuildAll();
    say(str('build.start_set'));
  }

  /* Turn the selected gate in place, or the ghost's turn for the next one. */
  function rotate(axis, dir, fine) {
    const step = dir * (fine ? TURN_FINE : TURN_STEP);
    if (selected && !held) {
      const el = elementById(doc, selected);
      const next = turnGate(el, axis, step);
      setPose(el, next.base, next.quat);
      place(meshes.get(selected).group, el);
      edited();
      return;
    }
    turn[axis] += step;
  }

  function upright() {
    if (selected && !held) {
      const el = elementById(doc, selected);
      const c = openingCentre(el, 0);
      const t = poseOf(el).quat;
      const travel = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(t.x, t.y, t.z, t.w));
      const q = qAxis(0, 1, 0, headingOf(travel.x, travel.z));
      const cy = openingsOf(el)[0].centreY;
      setPose(el, { x: c.x, y: c.y - cy, z: c.z }, q);
      place(meshes.get(selected).group, el);
      edited();
      return;
    }
    turn.yaw = 0;
    turn.pitch = 0;
    turn.roll = 0;
  }

  function nudge(dir, fine) {
    if (!selected || held) {
      say(str('build.select_first'));
      return;
    }
    const el = elementById(doc, selected);
    el.position.z += dir * (fine ? NUDGE_FINE : NUDGE);
    place(meshes.get(selected).group, el);
    edited();
  }

  function save() {
    say(saveTrack(doc) ? str('build.saved', { name: doc.name }) : str('build.save_failed'));
  }

  /* The next saved track for this map, round the list. */
  function openNext() {
    const list = listMapTracks(view.id);
    if (!list.length) {
      say(str('build.none_saved'));
      return;
    }
    const at = list.findIndex((d) => d.id === doc.id);
    adopt(list[(at + 1) % list.length]);
    say(str('build.opened', { name: doc.name, n: raceGatesOf(doc).length }));
  }

  function fresh() {
    if (doc.elements.length) {
      saveTrack(doc);
    }
    adopt(newCourse(view.id, str('build.untitled')));
    say(str('build.new_track'));
  }

  function adopt(next) {
    doc = next;
    selected = null;
    held = null;
    autosave.schedule(doc);
    rebuildAll();
  }

  /* ---------------------------------------------------------------- */
  /* States                                                            */
  /* ---------------------------------------------------------------- */

  function hideShellHud(on) {
    if (on) {
      hidden = [ui.osd, ui.banner, ui.lock].filter(Boolean).map((el) => [el, el.style.visibility]);
      for (const [el] of hidden) {
        el.style.visibility = 'hidden';
      }
    } else {
      for (const [el, was] of hidden) {
        el.style.visibility = was;
      }
      hidden = [];
    }
  }

  function enter() {
    view = host.view();
    const saved = readMapAutosave(view.id);
    doc = saved ? saved.doc : newCourse(view.id, str('build.untitled'));
    root = new THREE.Group();
    root.name = 'build-track';
    view.scene.add(root);
    rebuildAll();
    cameraFromShell();
    tested = false;
    host.hold();
    state = 'building';
    showHud(true);
    hideShellHud(true);
    say(str('build.entered', { n: raceGatesOf(doc).length }), 3600);
  }

  /* The view's course, swapped for the built one for a run. */
  function seatCourse(gates) {
    patched = {
      gates: view.gates, setNextGate: view.setNextGate, targetAim: view.targetAim, approachSide: view.approachSide, spawn: view.spawn, mode: view.mode,
    };
    view.gates = gates;
    view.setNextGate = setNextGate;
    view.targetAim = () => aim;
    view.approachSide = approachSide;
    view.spawn = spawnFor(gates);
    view.mode = 'race';
  }

  function unseatCourse() {
    if (!patched) {
      return;
    }
    Object.assign(view, patched);
    patched = null;
    courseGates = [];
    aim.active = false;
  }

  function setNextGate(i) {
    for (const gt of courseGates) {
      dressGate(gt, 'dark');
    }
    const target = courseGates[i];
    if (!target) {
      aim.active = false;
      aim.sceneIndex = -1;
      return;
    }
    lightTarget(target);
    aim.travel = target.axes.travel;
    aim.centre.set(target.centre.x, target.centre.y, target.centre.z);
    aim.clearH = target.aperture.clearH;
    aim.sceneIndex = i;
    aim.active = true;
    sideNow();
  }

  function approachSide(x, y, z) {
    if (!aim.active) {
      return null;
    }
    return (x - aim.centre.x) * aim.travel.x + (y - aim.centre.y) * aim.travel.y + (z - aim.centre.z) * aim.travel.z < 0;
  }

  /* Green from the side the target is flown from, red from behind, every
   * frame, the way the field colours its own target. */
  function sideNow() {
    if (!aim.active) {
      return;
    }
    const p = camera.position;
    aim.distance = p.distanceTo(aim.centre);
    aim.correct = approachSide(p.x, p.y, p.z);
    colourTargetSide(courseGates[aim.sceneIndex], aim.correct);
  }

  function startTest() {
    const gates = raceGatesOf(doc);
    if (!gates.length) {
      say(str('build.place_first'));
      return;
    }
    held = null;
    parked = { pos: cam.pos.clone(), yaw: cam.yaw, pitch: cam.pitch };
    courseGates = gates.map((g) => ({ ...g, ...dressable(meshes.get(g.elementId), 0), aperture: g.aperture, cue: '' }));
    for (const m of meshes.values()) {
      m.group.visible = true;
    }
    if (ghost) {
      ghost.group.visible = false;
    }
    seatCourse(courseGates);
    host.setCourse(courseGates, `.build.${doc.id}`);
    state = 'testing';
    tested = true;
    showHud(false);
    hideShellHud(false);
    host.fly();
  }

  function backToBuild() {
    unseatCourse();
    host.setCourse([], '');
    host.hold();
    if (parked) {
      cam.pos.copy(parked.pos);
      cam.yaw = parked.yaw;
      cam.pitch = parked.pitch;
    }
    state = 'building';
    lastRay.origin.set(Infinity, 0, 0);
    hitRay.exact = false;
    dressAll();
    showHud(true);
    hideShellHud(true);
  }

  /*
   * Leave building altogether. `resume` is false when the shell is taking
   * the world away (a map swap, the title): the run is not ours to restart
   * then, only our patches to take back.
   */
  function exit(resume = false) {
    if (state === 'off') {
      return;
    }
    const wasTesting = state === 'testing';
    autosave.flush();
    unseatCourse();
    if (view) {
      host.setCourse([], '');
    }
    for (const m of meshes.values()) {
      disposeStandaloneGate(m.made);
    }
    meshes.clear();
    solidify();
    if (ghost) {
      disposeStandaloneGate(ghost.made);
      ghost = null;
    }
    if (root) {
      root.removeFromParent();
      root = null;
    }
    selected = null;
    held = null;
    state = 'off';
    showHud(false);
    hideShellHud(false);
    if (document.pointerLockElement === shell.canvas) {
      document.exitPointerLock();
    }
    if (resume) {
      /* A test flight moved the aircraft to the track, so free flight
       * starts over from the map's own spawn; otherwise it carries on from
       * where it was parked. */
      if (tested || wasTesting) {
        host.fly();
      } else {
        host.resume();
      }
    }
    view = null;
  }

  /* ---------------------------------------------------------------- */
  /* Input                                                             */
  /* ---------------------------------------------------------------- */

  function ctrl() {
    return input.keys.has('ControlLeft') || input.keys.has('ControlRight');
  }

  function shiftHeld() {
    return input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
  }

  /* The keys, from main.js's key hook. True when the key was building's. */
  function onKey(code, repeat) {
    if (state === 'off') {
      if (code === 'KeyB' && !repeat && host.canBuild()) {
        enter();
        return true;
      }
      return false;
    }
    if (state === 'testing') {
      if (code === 'KeyB' && !repeat && host.onFlightScreen()) {
        backToBuild();
        return true;
      }
      return false;
    }
    /* Building owns the keyboard: nothing reaches the flight keys (R would
     * restart a run nobody is flying). F8 still files a bug. */
    if (code === 'F8') {
      return false;
    }
    const rotateKeys = {
      KeyJ: ['yaw', 1], KeyL: ['yaw', -1], KeyI: ['pitch', -1], KeyK: ['pitch', 1], KeyU: ['roll', 1], KeyO: ['roll', -1],
    };
    if (rotateKeys[code]) {
      rotate(rotateKeys[code][0], rotateKeys[code][1], shiftHeld());
      return true;
    }
    if (code === 'PageUp' || code === 'PageDown') {
      nudge(code === 'PageUp' ? 1 : -1, shiftHeld());
      return true;
    }
    if (repeat) {
      return true;
    }
    if (ctrl() && code === 'KeyS') {
      save();
      return true;
    }
    if (ctrl() && code === 'KeyO') {
      openNext();
      return true;
    }
    const act = {
      KeyB: startTest,
      Enter: commit,
      NumpadEnter: commit,
      KeyG: grab,
      Delete: deleteSelected,
      Backspace: deleteSelected,
      Tab: () => selectStep(shiftHeld() ? -1 : 1),
      BracketLeft: () => reorder(-1),
      BracketRight: () => reorder(1),
      Home: startHere,
      Digit1: () => setSnap(0),
      Digit2: () => setSnap(1),
      Digit3: () => setSnap(2),
      Equal: () => setDistance(airDistance + 5),
      NumpadAdd: () => setDistance(airDistance + 5),
      Minus: () => setDistance(airDistance - 5),
      NumpadSubtract: () => setDistance(airDistance - 5),
      KeyT: () => cycleType(1),
      KeyZ: upright,
      KeyN: fresh,
      KeyH: () => { showHelp = !showHelp; },
      Escape: stepBack,
    };
    if (act[code]) {
      act[code]();
    }
    /* Every other key is swallowed too, for the same reason as R. */
    return true;
  }

  function stepBack() {
    if (performance.now() - unlockedAt < UNLOCK_GRACE_MS) {
      return;
    }
    if (held) {
      held = null;
      dressAll();
      return;
    }
    if (selected) {
      selected = null;
      dressAll();
      return;
    }
    exit(true);
  }

  function setSnap(i) {
    snapIndex = i;
    say(str('build.snap_now', { mode: str(`build.snap_${SNAP_MODES[i]}`) }), 1600);
  }

  function setDistance(m) {
    airDistance = Math.max(AIR_MIN, Math.min(AIR_MAX, m));
  }

  function cycleType(step) {
    if (held) {
      return;
    }
    typeIndex = (typeIndex + step + BUILD_TYPES.length) % BUILD_TYPES.length;
    say(ELEMENTS[BUILD_TYPES[typeIndex]].label, 1400);
  }

  /* Browser defaults the builder's keys would otherwise trigger: Tab moves
   * focus, Ctrl+S and Ctrl+O open the browser's own dialogs, Page Up and
   * Down scroll. Only while building. */
  function onKeyDownCapture(e) {
    if (state !== 'building') {
      return;
    }
    const mine = e.code === 'Tab' || e.code === 'PageUp' || e.code === 'PageDown' || e.code === 'Home'
      || ((e.ctrlKey || e.metaKey) && (e.code === 'KeyS' || e.code === 'KeyO'));
    if (mine) {
      e.preventDefault();
    }
  }
  window.addEventListener('keydown', onKeyDownCapture, true);

  shell.canvas.addEventListener('mousedown', (e) => {
    if (state !== 'building') {
      return;
    }
    const locked = document.pointerLockElement === shell.canvas;
    if (e.button === 0) {
      if (locked) {
        commit();
      } else if (shell.canvas.requestPointerLock) {
        /* The first click takes the mouse; placing is the next one. */
        shell.canvas.requestPointerLock();
      }
    } else if (e.button === 2) {
      if (locked) {
        grab();
      } else {
        mouse.dragging = true;
      }
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 2) {
      mouse.dragging = false;
    }
  });
  window.addEventListener('mousemove', (e) => {
    if (state !== 'building') {
      return;
    }
    mouse.dx += e.movementX || 0;
    mouse.dy += e.movementY || 0;
  });
  shell.canvas.addEventListener('wheel', (e) => {
    if (state !== 'building') {
      return;
    }
    e.preventDefault();
    setDistance(airDistance - Math.sign(e.deltaY) * 2);
  }, { passive: false });
  shell.canvas.addEventListener('contextmenu', (e) => {
    if (state === 'building') {
      e.preventDefault();
    }
  });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== shell.canvas) {
      unlockedAt = performance.now();
    }
  });

  /*
   * The pad's buttons, as edges, and only on a pad the browser maps to the
   * standard layout. A radio in joystick mode reports its SWITCHES as
   * buttons, in whatever order its firmware chose, and one of them landing
   * on Back would throw a pilot into the builder mid flight the moment they
   * flicked it. A radio still drives the camera with its sticks.
   */
  function readPad() {
    const gp = input.firstGamepad();
    const now = [];
    if (gp && gp.buttons && gp.mapping === 'standard') {
      for (let i = 0; i < gp.buttons.length; i += 1) {
        now.push(Boolean(gp.buttons[i] && gp.buttons[i].pressed));
      }
    }
    const was = padPrev;
    padPrev = now;
    return {
      gp,
      down: (i) => Boolean(now[i]),
      pressed: (i) => Boolean(now[i]) && !was[i],
    };
  }

  function padActions(p) {
    const rt = p.down(PAD.rt);
    if (p.pressed(PAD.back)) {
      startTest();
      return;
    }
    if (p.pressed(PAD.a)) {
      commit();
    }
    if (p.pressed(PAD.b)) {
      if (held || selected) {
        stepBack();
      }
    }
    if (p.pressed(PAD.x)) {
      deleteSelected();
    }
    if (p.pressed(PAD.y)) {
      if (rt) {
        startHere();
      } else {
        grab();
      }
    }
    if (p.pressed(PAD.lb)) {
      if (rt) {
        reorder(-1);
      } else {
        selectStep(-1);
      }
    }
    if (p.pressed(PAD.rb)) {
      if (rt) {
        reorder(1);
      } else {
        selectStep(1);
      }
    }
    if (p.pressed(PAD.start)) {
      save();
    }
    if (p.pressed(PAD.ls)) {
      setSnap((snapIndex + 1) % SNAP_MODES.length);
    }
    if (p.pressed(PAD.rs)) {
      cycleType(1);
    }
    if (p.pressed(PAD.left)) {
      rotate(rt ? 'roll' : 'yaw', 1, false);
    }
    if (p.pressed(PAD.right)) {
      rotate(rt ? 'roll' : 'yaw', -1, false);
    }
    if (rt && p.pressed(PAD.up)) {
      rotate('pitch', -1, false);
    }
    if (rt && p.pressed(PAD.down)) {
      rotate('pitch', 1, false);
    }
  }

  /* ---------------------------------------------------------------- */
  /* The frame                                                         */
  /* ---------------------------------------------------------------- */

  /*
   * Once a frame from main.js, after the shell has placed its own camera
   * and before the world is drawn. Cheap when off: one pad read.
   */
  function frame(dtMs) {
    const p = readPad();
    if (state === 'off') {
      if (p.pressed(PAD.back) && host.canBuild()) {
        enter();
      }
      return;
    }
    if (host.view() !== view || host.mode() === 'title') {
      /* The shell took the run somewhere else: the title, or a new world. */
      exit(false);
      return;
    }
    if (state === 'testing') {
      if (p.pressed(PAD.back) && host.onFlightScreen()) {
        backToBuild();
        return;
      }
      sideNow();
      return;
    }
    if (host.mode() !== 'paused') {
      /* Something resumed the plant under us (a menu); park it again. */
      host.hold();
    }
    padActions(p);
    if (state !== 'building') {
      return;
    }
    const dtS = Math.min(0.1, dtMs / 1000);
    driveCamera(dtS, p.gp ? p.gp : null, p.down);
    shell.quad.visible = true;
    trackCrosshair(performance.now());
    updateGhost();
    updateHud();
  }

  /* ---------------------------------------------------------------- */
  /* The display                                                       */
  /* ---------------------------------------------------------------- */

  function showHud(on) {
    if (on && !hud) {
      hud = document.createElement('div');
      hud.className = 'build-hud';
      Object.assign(hud.style, {
        position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '5', fontFamily: 'var(--ui-font)', color: '#f3ead4',
      });
      const cross = document.createElement('div');
      Object.assign(cross.style, {
        position: 'absolute', left: '50%', top: '50%', width: '18px', height: '18px', marginLeft: '-9px', marginTop: '-9px',
        border: '2px solid rgba(143, 233, 255, 0.95)', borderRadius: '50%', boxShadow: '0 0 4px rgba(0,0,0,0.8)',
      });
      const panel = document.createElement('div');
      Object.assign(panel.style, {
        position: 'absolute', left: '16px', top: '64px', maxWidth: '520px', padding: '10px 14px', whiteSpace: 'pre-line',
        background: 'rgba(12, 18, 14, 0.78)', borderRadius: '6px', fontSize: '14px', lineHeight: '1.45',
      });
      const help = document.createElement('div');
      Object.assign(help.style, {
        position: 'absolute', right: '16px', bottom: '16px', maxWidth: '460px', padding: '10px 14px', whiteSpace: 'pre-line',
        background: 'rgba(12, 18, 14, 0.7)', borderRadius: '6px', fontSize: '12px', lineHeight: '1.5', opacity: '0.92',
      });
      hud.append(cross, panel, help);
      hud.panel = panel;
      hud.help = help;
      (document.getElementById('ui') || document.body).append(hud);
      hudText = '';
      helpText = '';
    }
    if (hud) {
      hud.style.display = on ? '' : 'none';
    }
  }

  function fmtM(m) {
    return m.toFixed(1);
  }

  function updateHud() {
    if (!hud) {
      return;
    }
    const gates = raceGatesOf(doc);
    const lines = [
      str('build.title', { name: doc.name, n: gates.length }),
      str('build.placing', {
        type: ELEMENTS[ghostType()].label,
        mode: str(`build.snap_${SNAP_MODES[snapIndex]}`),
        distance: Math.round(airDistance),
      }),
    ];
    if (ghost && ghost.pose && ghost.group.visible) {
      if (ghost.pose.mode !== SNAP_MODES[snapIndex]) {
        lines.push(str('build.no_surface'));
      }
      const c = new THREE.Vector3(0, ghost.centreY, 0).applyQuaternion(ghost.group.quaternion).add(ghost.group.position);
      const above = c.y - host.heightAt(c.x, c.z);
      const last = held ? null : gates[gates.length - 1];
      if (last) {
        const d = Math.hypot(c.x - last.centre.x, c.y - last.centre.y, c.z - last.centre.z);
        lines.push(str('build.ghost_readout_from', {
          height: fmtM(above), n: gates.length, distance: fmtM(d), drop: fmtM(last.centre.y - c.y),
        }));
      } else {
        lines.push(str('build.ghost_readout', { height: fmtM(above) }));
      }
    }
    if (selected) {
      const i = orderOf(doc, selected);
      const r = readoutFor(gates, i, host.heightAt);
      if (r) {
        lines.push(r.next
          ? str('build.selected_readout_next', {
            n: i + 1, count: gates.length, height: fmtM(r.height), next: r.next.order + 1, distance: fmtM(r.next.distance), drop: fmtM(r.next.drop),
          })
          : str('build.selected_readout', { n: i + 1, count: gates.length, height: fmtM(r.height) }));
      }
      if (held) {
        lines.push(str('build.holding'));
      }
    }
    if (message.text && performance.now() < message.until) {
      lines.push(message.text);
    }
    const text = lines.join('\n');
    if (text !== hudText) {
      hudText = text;
      hud.panel.textContent = text;
    }
    const help = showHelp ? str('build.help') : str('build.help_hidden');
    if (help !== helpText) {
      helpText = help;
      hud.help.textContent = help;
    }
  }

  /* ---------------------------------------------------------------- */
  /* The harness                                                       */
  /* ---------------------------------------------------------------- */

  /* What scripts/build-check.js reads and drives. Nothing in the product
   * calls it. */
  window.__build = {
    state: () => ({
      state,
      map: view ? view.id : null,
      doc: doc ? JSON.parse(JSON.stringify(doc)) : null,
      selected,
      held,
      snap: SNAP_MODES[snapIndex],
      airDistance,
      type: BUILD_TYPES[typeIndex],
      hit: hit ? { point: hit.point.toArray(), normal: hit.normal.toArray(), distance: hit.distance } : null,
      /* Where the reading above was taken from, so a harness can wait for
       * the one taken along the camera's current ray. */
      hitRay: { origin: hitRay.origin.toArray(), dir: hitRay.dir.toArray(), exact: hitRay.exact, ageMs: performance.now() - hitAt },
      ghost: ghost && ghost.pose ? { base: [ghost.pose.base.x, ghost.pose.base.y, ghost.pose.base.z], mode: ghost.pose.mode, visible: ghost.group.visible } : null,
      gates: doc ? raceGatesOf(doc).map((g) => ({
        id: g.elementId, centre: [g.centre.x, g.centre.y, g.centre.z], travel: [g.axes.travel.x, g.axes.travel.y, g.axes.travel.z], up: [g.axes.up.x, g.axes.up.y, g.axes.up.z],
      })) : [],
      camera: { pos: cam.pos.toArray(), yaw: cam.yaw, pitch: cam.pitch, forward: forward(new THREE.Vector3()).toArray() },
      hud: hudText,
    }),
    /* Put the free camera somewhere, looking along yaw and pitch. */
    look(x, y, z, yaw, pitch) {
      cam.pos.set(x, y, z);
      cam.yaw = yaw;
      cam.pitch = pitch;
      return true;
    },
    /* The exact pick for the crosshair as it is now. */
    pickNow() {
      const h = picker.pick(view.scene, cam.pos, forward(fwd), excluded());
      return h ? { point: h.point.toArray(), normal: h.normal.toArray(), distance: h.distance } : null;
    },
    library: () => (view ? listMapTracks(view.id).map((d) => ({ id: d.id, name: d.name, gates: d.sequence.length })) : []),
    rename(name) {
      doc.name = String(name);
      edited();
      return doc.name;
    },
  };

  return {
    onKey,
    frame,
    exit,
    get active() {
      return state !== 'off';
    },
    get testing() {
      return state === 'testing';
    },
    /* True while the builder's own camera is the one drawn. */
    get cameraLive() {
      return state === 'building';
    },
  };
}
