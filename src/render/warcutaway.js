/*
 * warcutaway.js: a war mission's cutaways, the short looks at a place the
 * stage engine asks for (src/share/war/stages.js cues: a breach opening,
 * a target going dark), every screen at the room ms the room told it.
 *
 * HOW IT IS SHOWN DEPENDS ON WHO IS WATCHING. A pilot in control (flying,
 * airborne, an airframe left) gets it as a picture in picture in the
 * lower right corner, PIP_W of the screen wide, and keeps the whole of
 * its own view: an FPV pilot's only instrument is the picture, and a cut
 * of CUT_MS at a Striker's 26.6 m/s is 66 m flown blind, at the moment a
 * stage turns, which is when the next attackers come. A pilot not in
 * control (spectating with every airframe spent, a wreck waiting to
 * respawn, on the ground, between rounds) gets a real cut: the whole
 * screen for CUT_MS, letterboxed, the shell's camera given back after.
 * The choice is made when the cutaway starts and kept for it, so the
 * picture does not jump between the two if the pilot takes off.
 *
 * THE SHOT. A cue names a target (its place from the mission) or a point
 * `at`, and may name where the camera stands (`from`) and its lens (`fov`,
 * degrees as three.js takes them) and its length (`ms`). Without `from`
 * it stands STAND_M from the place, STAND_UP_M over it, on the side of
 * the place toward this screen's own camera (so a pilot sees it from
 * where it is), and pushes in PUSH of the way over the shot.
 *
 * COST. The picture in picture is a second draw of the scene, at its own
 * small size, with no post chain and none of the scene's own pre draw
 * work (the water's mirror is a whole scene draw: the inset reuses the
 * main view's), and the shadow maps the main view drew. It runs for the
 * cutaway's ms only.
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

export const CUT_MS = 2500;
export const PIP_W = 0.3;
const PIP_ASPECT = 16 / 9;
const PIP_MARGIN_PX = 16;
const STAND_M = 220;
const STAND_UP_M = 80;
const PUSH = 0.15;
const FOV = 38;

const smooth = (u) => u * u * (3 - 2 * u);

/*
 * opts: renderer, scene() the world's scene, camera the shell's camera,
 * place(cue) the cutaway's place [x, y, z] or null (the mission's target
 * or the cue's point), and inControl() whether this pilot is flying now.
 */
export function createWarCutaway({
  renderer, scene, camera, place, inControl,
}) {
  const cam = new THREE.PerspectiveCamera(FOV, PIP_ASPECT, 1, 20000);
  const look = new THREE.Vector3();
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const size = new THREE.Vector2();
  let shot = null;
  let frame = null;
  let bars = null;
  /* What the checks read: every cutaway as shown. */
  const log = [];

  function overlay() {
    if (frame) {
      return;
    }
    frame = document.createElement('div');
    frame.className = 'war-cutaway';
    Object.assign(frame.style, {
      position: 'fixed', right: `${PIP_MARGIN_PX}px`, bottom: `${PIP_MARGIN_PX}px`, zIndex: '39', pointerEvents: 'none', display: 'none',
      border: '2px solid rgba(255, 196, 92, 0.9)', boxShadow: '0 0 12px rgba(0, 0, 0, 0.6)',
    });
    bars = document.createElement('div');
    bars.className = 'war-cutaway-bars';
    Object.assign(bars.style, {
      position: 'fixed', inset: '0', zIndex: '39', pointerEvents: 'none', display: 'none',
      boxShadow: 'inset 0 calc(max(0px, (100vh - 100vw / 2.39) / 2)) 0 #000, inset 0 calc(-1 * max(0px, (100vh - 100vw / 2.39) / 2)) 0 #000',
    });
    document.body.append(frame, bars);
  }

  /* A cue's cutaway, heard at performance.now() nowWall, room ms at;
   * `pip` says how to show it in place of inControl() (the checks). */
  function request(cue, nowWall, at = null, pip = null) {
    const p = place(cue);
    if (!p) {
      return false;
    }
    look.set(p[0], p[1], p[2]);
    if (cue.from) {
      from.set(cue.from[0], cue.from[1], cue.from[2]);
    } else {
      const dx = camera.position.x - p[0];
      const dz = camera.position.z - p[2];
      const h = Math.hypot(dx, dz) || 1;
      from.set(p[0] + (dx / h) * STAND_M, p[1] + STAND_UP_M, p[2] + (dz / h) * STAND_M);
    }
    to.copy(from).lerp(look, PUSH);
    const inset = pip ?? Boolean(inControl());
    shot = {
      from: from.clone(), to: to.clone(), look: look.clone(), fov: cue.fov ?? FOV, ms: cue.ms ?? CUT_MS, t0: nowWall, pip: inset,
    };
    log.push({
      at, pip: inset, ms: shot.ms, place: p.slice(),
    });
    overlay();
    return true;
  }

  function poseOn(c, nowWall) {
    const u = smooth(Math.min(1, (nowWall - shot.t0) / shot.ms));
    c.position.lerpVectors(shot.from, shot.to, u);
    c.up.set(0, 1, 0);
    c.lookAt(shot.look);
    if (c.fov !== shot.fov) {
      c.fov = shot.fov;
      c.updateProjectionMatrix();
    }
  }

  return {
    request,

    /* Whether one is showing now. */
    active(nowWall) {
      if (shot && nowWall - shot.t0 >= shot.ms) {
        shot = null;
        frame.style.display = 'none';
        bars.style.display = 'none';
      }
      return Boolean(shot);
    },

    /*
     * Once a frame, after the shell's camera and before its draw: a cut
     * poses the shell's camera (returns true: the owner gives its fov back
     * after), a picture in picture its own.
     */
    frame(nowWall) {
      if (!this.active(nowWall)) {
        return false;
      }
      if (shot.pip) {
        poseOn(cam, nowWall);
        frame.style.display = 'block';
        bars.style.display = 'none';
        return false;
      }
      poseOn(camera, nowWall);
      bars.style.display = 'block';
      frame.style.display = 'none';
      return true;
    },

    /* After the main view is drawn: the picture in picture, if one is up. */
    drawPip(nowWall) {
      if (!shot || !shot.pip || nowWall - shot.t0 >= shot.ms) {
        return;
      }
      const sc = scene();
      if (!sc) {
        return;
      }
      renderer.getSize(size);
      const w = Math.round(size.x * PIP_W);
      const h = Math.round(w / PIP_ASPECT);
      frame.style.width = `${w}px`;
      frame.style.height = `${h}px`;
      const x = size.x - w - PIP_MARGIN_PX;
      const y = PIP_MARGIN_PX;
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      const auto = renderer.autoClear;
      const shadows = renderer.shadowMap.autoUpdate;
      const hook = sc.onBeforeRender;
      renderer.setRenderTarget(null);
      renderer.autoClear = false;
      renderer.shadowMap.autoUpdate = false;
      sc.onBeforeRender = THREE.Object3D.prototype.onBeforeRender;
      renderer.setScissorTest(true);
      renderer.setScissor(x, y, w, h);
      renderer.setViewport(x, y, w, h);
      try {
        renderer.clear(true, true, false);
        renderer.render(sc, cam);
      } finally {
        sc.onBeforeRender = hook;
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, size.x, size.y);
        renderer.autoClear = auto;
        renderer.shadowMap.autoUpdate = shadows;
      }
    },

    state() {
      return { shot: shot ? { pip: shot.pip, ms: shot.ms } : null, log: log.slice() };
    },

    dispose() {
      shot = null;
      if (frame) {
        frame.remove();
        bars.remove();
        frame = null;
        bars = null;
      }
    },
  };
}
