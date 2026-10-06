/*
 * render-golden/showcase.js: the Settings studio of src/render/showcase.js
 * on a canvas of its own: the stage it builds (lights, shadow catcher,
 * wash disc, camera), how it is scaled to the airframe's sweep, the
 * renderer's settings, the camera's orbit under sticks and a pointer drag,
 * the wash following throttle, activation resetting the pose, and the
 * stand-in returned when no WebGL context can be had. The airframe comes
 * from a fixed stand-in builder so the case pins the studio, not a model.
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
import { createShowcase } from '../../../src/render/showcase.js';
import { describeObject, makeTable } from '../render-golden-lib.js';

const sig = (v) => (typeof v === 'number' ? Number(v.toPrecision(10)) + 0 : `${v}`);
const arr = (v) => v.toArray().map(sig);

/* A minimal airframe with the parts the pose writes to. */
function standInBuilder(calls) {
  return (opts) => {
    calls.push(opts);
    const group = new THREE.Group();
    group.name = 'stand-in';
    const mat = new THREE.MeshBasicMaterial({ color: 0x888888 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.1), mat);
    group.add(box);
    const blades = [];
    const discs = [];
    for (let m = 0; m < 4; m++) {
      const blade = new THREE.Group();
      blade.rotation.y = 1 + m;
      group.add(blade);
      blades.push(blade);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.03, 8), new THREE.MeshBasicMaterial({ transparent: true }));
      group.add(disc);
      discs.push(disc);
    }
    const cameraMount = new THREE.Group();
    group.add(cameraMount);
    return { group, blades, discs, cameraMount, leds: null, stator: new THREE.MeshStandardMaterial() };
  };
}

function canvasOf(w, h) {
  const canvas = document.createElement('canvas');
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas.style.position = 'absolute';
  document.body.appendChild(canvas);
  /* Synthetic pointers have no live pointer to capture. */
  const captured = new Set();
  canvas.setPointerCapture = (id) => captured.add(id);
  canvas.hasPointerCapture = (id) => captured.has(id);
  canvas.releasePointerCapture = (id) => captured.delete(id);
  return canvas;
}

function pointer(canvas, type, x) {
  canvas.dispatchEvent(new PointerEvent(type, { clientX: x, pointerId: 7, bubbles: true, cancelable: true }));
}

function stage(scene, heroGroup) {
  const table = makeTable();
  return scene.children.map((c) => (c.getObjectByName('stand-in') || c === heroGroup ? { type: c.type, holdsHero: true, p: arr(c.position), q: arr(c.quaternion) } : describeObject(c, table)));
}

/* Reaches the studio's scene and camera through the hook three calls on a
 * scene at the start of every draw (r160's renderer keeps its methods on
 * the instance, so the prototype cannot be watched). */
function capture(fn) {
  const real = THREE.Object3D.prototype.onBeforeRender;
  let seen = null;
  THREE.Object3D.prototype.onBeforeRender = function onBeforeRender(renderer, scene, camera) {
    if (this.isScene) {
      seen = { scene, camera, renderer };
    }
  };
  try {
    fn();
  } finally {
    THREE.Object3D.prototype.onBeforeRender = real;
  }
  return seen;
}

function session(w, h, opts) {
  const canvas = canvasOf(w, h);
  const calls = [];
  const show = createShowcase(canvas, { ...opts, build: standInBuilder(calls) });
  const rows = [{ keys: Object.keys(show).sort(), failed: show.failed, buildOpts: calls, touchAction: canvas.style.touchAction }];
  const drawn = capture(() => {
    show.render();
    show.setActive(true);
    show.render();
  });
  const { scene, camera, renderer } = drawn;
  const clear = new THREE.Color();
  renderer.getClearColor(clear);
  rows.push({
    renderer: {
      clear: clear.getHexString(),
      alpha: renderer.getClearAlpha(),
      ratio: renderer.getPixelRatio(),
      colorSpace: renderer.outputColorSpace,
      toneMapping: renderer.toneMapping,
      shadows: renderer.shadowMap.enabled,
      size: [canvas.width, canvas.height],
      attrs: (({ antialias, alpha, depth, stencil, powerPreference, failIfMajorPerformanceCaveat }) => ({ antialias, alpha, depth, stencil, powerPreference, failIfMajorPerformanceCaveat }))(renderer.getContext().getContextAttributes()),
    },
    camera: { fov: camera.fov, near: sig(camera.near), far: sig(camera.far), aspect: sig(camera.aspect) },
    stage: stage(scene),
  });
  const hero = scene.getObjectByName('stand-in');
  const snap = (label) => ({
    label,
    cam: [...arr(camera.position), ...arr(camera.quaternion)],
    pose: [...arr(hero.parent.position), ...arr(hero.parent.quaternion)],
    blades: hero.children.filter((c) => c.isGroup).map((b) => sig(b.rotation.y)),
    wash: scene.children.filter((c) => c.isMesh).map((m) => [sig(m.material.opacity), ...arr(m.scale)]),
  });
  let now = 1000;
  for (let i = 0; i < 60; i++) {
    now += 16.7;
    if (i === 10) {
      pointer(canvas, 'pointerdown', 100);
    }
    if (i > 10 && i < 20) {
      pointer(canvas, 'pointermove', 100 + (i - 10) * 13);
    }
    if (i === 20) {
      pointer(canvas, 'pointerup', 230);
    }
    if (i === 22) {
      pointer(canvas, 'pointermove', 500);
    }
    if (i === 30) {
      pointer(canvas, 'pointerdown', 50);
      pointer(canvas, 'pointercancel', 60);
    }
    show.update(i === 40 ? 400 : 16.7, { roll: 0.3, pitch: -0.2, yaw: 0.6, throttle: (i % 20) / 20 }, now, 30, i > 45);
    if (i % 6 === 0) {
      rows.push(snap(`f${i}`));
    }
  }
  show.setActive(false);
  show.update(16, { throttle: 1 }, now + 16, 30, false);
  rows.push(snap('inactive update'));
  show.setActive(true);
  rows.push(snap('reactivated'));
  show.setActive(true);
  show.update(16, { throttle: 0.5 }, now + 32, 30, false);
  rows.push(snap('active again'));
  show.dispose();
  pointer(canvas, 'pointerdown', 10);
  pointer(canvas, 'pointermove', 400);
  const after = capture(() => show.render());
  rows.push({ disposedRenders: Boolean(after) });
  canvas.remove();
  return rows;
}

export function cases() {
  return {
    wide: () => session(480, 300, {}),
    tall: () => session(240, 320, { sweep: 0.0506 }),
    badSweep: () => session(320, 320, { sweep: -1 }),
    noContext: () => {
      const canvas = canvasOf(100, 100);
      canvas.getContext = () => null;
      /* three reports the failed context on the console itself; that one
       * message is the expected outcome here, anything else still fails. */
      const realError = console.error;
      const logged = [];
      console.error = (...args) => {
        const text = args.join(' ');
        if (/Error creating WebGL context/.test(text)) {
          logged.push(text);
        } else {
          realError(...args);
        }
      };
      let show;
      try {
        show = createShowcase(canvas, { build: standInBuilder([]) });
      } finally {
        console.error = realError;
      }
      canvas.remove();
      const calls = ['update', 'render', 'setActive', 'dispose'].map((k) => typeof show[k] === 'function' && show[k]() === undefined);
      return { keys: Object.keys(show).sort(), failed: show.failed, calls, logged: logged.length };
    },
  };
}
