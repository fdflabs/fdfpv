/*
 * showcase.js: the airframe turning on its stand in Settings.
 *
 * It draws through a small WebGL context of its own, made when Settings
 * opens and freed when it closes, so a flight never shares the GPU with a
 * second renderer, and it is kept cheap: no antialiasing, no shadow map, a
 * pixel ratio of 1, the low-power hint and the light model without
 * outline hulls. The flying world's draw budget never sees it. How the
 * model answers the sticks is craftpose.js's.
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
import { createCraftPose, damp } from './craftpose.js';
import { disposeSceneGraph } from './shell.js';
import { SESSION_TEXTURES } from './session-textures.js';

/*
 * The shot was composed around a 5 inch whose blade tips sweep 0.1735 m.
 * Every length on the stage (camera distance and planes, look point,
 * shadow catcher, wash disc) is that composition times the airframe's own
 * sweep over this, so a 65 mm whoop fills the frame as the 5 inch did
 * instead of sitting as a speck on a large empty stage.
 */
const COMPOSED_SWEEP = 0.1735;

/* Where the camera rests: azimuth and elevation, radians, and distance in
 * composed metres. A drag turns the azimuth; it eases back toward rest
 * plus the drag at this rate per second. */
const REST = { az: Math.PI - 0.62, el: 0.34, dist: 1.32 };
const AZ_FOLLOW = 3.2;
const DRAG_RAD_PER_PX = 0.007;

/* A canvas smaller than this on either side is not laid out yet. */
const MIN_SIDE_PX = 8;

/* Returned when no WebGL context can be had: the studio simply is not
 * drawn. */
function unavailable() {
  const nothing = () => {};
  return { update: nothing, render: nothing, setActive: nothing, dispose: nothing, failed: true };
}

/* A flat disc on the stand's floor, `y` below the model's origin. */
function floorDisc(radius, y, color, opacity) {
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 16),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = y;
  return disc;
}

/*
 * Builds the studio on `canvas`. opts.build({ fog, lite }) makes the model
 * (the shell passes the seated airframe's builder) and opts.sweep is its
 * blade or duct sweep in metres. Returns { update, render, setActive,
 * dispose, failed }.
 */
export function createShowcase(canvas, opts = {}) {
  const scale = (opts.sweep > 0 ? opts.sweep : COMPOSED_SWEEP) / COMPOSED_SWEEP;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      depth: true,
      stencil: false,
      powerPreference: 'low-power',
      failIfMajorPerformanceCaveat: false,
    });
  } catch (e) {
    return unavailable();
  }
  renderer.setClearColor(0x1a241c, 1);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = false;
  if (renderer.debug) {
    renderer.debug.checkShaderErrors = false;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.04 * scale, 4 * scale);
  const lookAt = new THREE.Vector3(0, 0.01 * scale, 0.02 * scale);
  scene.add(new THREE.HemisphereLight(0xf0e6d0, 0x2a3828, 0.82));
  const key = new THREE.DirectionalLight(0xffe2b8, 2.45);
  key.position.set(0.48, 0.92, -0.52);
  key.castShadow = false;
  scene.add(key);
  /* A soft dark disc under the model for a shadow, and a mint one that
   * brightens and spreads with throttle as the prop wash. */
  scene.add(floorDisc(0.22 * scale, -0.064 * scale, 0x0e140f, 0.38));
  const wash = floorDisc(0.12 * scale, -0.052 * scale, 0x7dffb4, 0);
  scene.add(wash);

  const hero = opts.build({ fog: false, lite: true });
  const pose = new THREE.Group();
  pose.add(hero.group);
  scene.add(pose);
  const solver = createCraftPose();

  const view = { az: REST.az, drag: 0, dist: REST.dist * scale };
  const drag = { on: false, x: 0 };
  let active = false;

  canvas.style.touchAction = 'none';
  const pointer = {
    pointerdown(e) {
      e.preventDefault();
      drag.on = true;
      drag.x = e.clientX;
      canvas.setPointerCapture(e.pointerId);
    },
    pointermove(e) {
      if (drag.on) {
        view.drag += (e.clientX - drag.x) * DRAG_RAD_PER_PX;
        drag.x = e.clientX;
      }
    },
    pointerup: release,
    pointercancel: release,
  };
  function release(e) {
    drag.on = false;
    if (canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
  }
  for (const [type, fn] of Object.entries(pointer)) {
    canvas.addEventListener(type, fn);
  }

  /* Follows the canvas's laid out size; false while it has none. A wide
   * canvas gets a slightly wider lens. */
  const drawn = { w: 0, h: 0 };
  function fit() {
    const w = canvas.clientWidth | 0;
    const h = canvas.clientHeight | 0;
    if (w < MIN_SIDE_PX || h < MIN_SIDE_PX) {
      return false;
    }
    if (w !== drawn.w || h !== drawn.h) {
      drawn.w = w;
      drawn.h = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.fov = w > h * 1.15 ? 32 : 28;
      camera.updateProjectionMatrix();
    }
    return true;
  }
  const watcher = new ResizeObserver(() => {
    if (active) {
      fit();
    }
  });
  watcher.observe(canvas);

  /* Opening the studio starts the model level with its props stopped. */
  function setActive(on) {
    if (on && !active) {
      solver.reset(pose);
      hero.blades.slice(0, 4).forEach((blade) => {
        blade.rotation.y = 0;
      });
    }
    active = on;
    if (on) {
      fit();
    }
  }

  function update(dtMs, channels, nowMs, cameraAngle, angleMode) {
    if (!active) {
      return;
    }
    const thr = solver.update(dtMs, channels, nowMs, cameraAngle, angleMode, hero, pose);
    wash.material.opacity = thr * 0.12;
    wash.scale.setScalar(0.85 + thr * 0.55);
    const dt = Math.min(0.05, Math.max(0, dtMs) * 0.001);
    view.az = damp(view.az, REST.az + view.drag, AZ_FOLLOW, dt);
    const across = Math.cos(REST.el) * view.dist;
    camera.position.set(Math.sin(view.az) * across, Math.sin(REST.el) * view.dist + 0.04, Math.cos(view.az) * across);
    camera.up.set(0, 1, 0);
    camera.lookAt(lookAt);
  }

  function render() {
    if (active && !document.hidden && fit()) {
      renderer.render(scene, camera);
    }
  }

  function dispose() {
    active = false;
    watcher.disconnect();
    for (const [type, fn] of Object.entries(pointer)) {
      canvas.removeEventListener(type, fn);
    }
    disposeSceneGraph(scene, SESSION_TEXTURES);
    try {
      renderer.dispose();
    } catch (e) {
      /* The context is already gone; nothing left to free. */
    }
  }

  return { update, render, setActive, dispose, failed: false };
}
