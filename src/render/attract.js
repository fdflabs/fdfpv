/*
 * attract.js: the camera behind the title screen.
 *
 * A map describes its title shot in view.attract. With a `path`, a closed
 * line the map has already made safe to fly (lifted clear of everything
 * near each sample, from the same data the world was built from), the
 * camera flies that line. Without one it circles a point, which is also
 * the better shot of a compact course, where flying the racing line would
 * sprint round a few metres of knot. The airframe, when the shell passes
 * one, rides just ahead in three quarter view with a little of the pilot's
 * stick in its attitude. There is no second scene: when Fly is pressed the
 * shell stops calling update and the same world becomes the flight.
 *
 * Nothing here reaches the simulation. The shot runs off the wall clock
 * the caller passes, so a tab that was in the background resumes where the
 * clock says rather than racing to catch up.
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

/* A cinematic lens, not the FPV one, which made the airframe a speck. A
 * tall frame under the menu gets a little more. */
const FOV_WIDE = 44;
const FOV_TALL = 50;
/* Frames narrower than this are laid out with the menu along the bottom. */
const TALL_BELOW_ASPECT = 0.95;

/* The orbit: radians per millisecond, a turn in about 57 s, a look and not
 * a spin. Thumbnails scale their clock so one turn fits a clip. */
const ORBIT_RATE = 0.00011;
const ORBIT_PERIOD_MS = (Math.PI * 2) / ORBIT_RATE;
/* The circle a map without a shot of its own gets. */
const DEFAULT_ORBIT = { x: 0, y: 0, z: 0, radius: 9, eye: 2.4, aim: 0.85 };

/* The line: the most it banks into a turn (about 13 degrees: enough to
 * read as a pilot committing, little enough that the title type does not
 * sit crooked on the horizon), how hard the bank follows, and the
 * airframe's place, metres ahead along the line and to the camera's right
 * so it is seen three quarter rather than tail on. */
const BANK_LIMIT = 0.22;
const BANK_GAIN = 0.9;
const BANK_FOLLOW = 2.2;
const CRAFT_AHEAD = 1.62;
const CRAFT_RIGHT = 0.34;

/*
 * The menu covers the left third of a wide frame and the bottom of a tall
 * one, so the picture is shifted into the open part as a lens shift, a
 * window offset in the projection, never by moving the eye: the eye stays
 * on the line the map cleared (moving it by a share of the distance to the
 * subject once dropped the title shot underground on phones). Fractions of
 * the frame; positive Y lifts the picture, negative X moves it right.
 */
const SHIFT = { wideX: -0.118, wideY: 0.062, tallY: 0.172 };

/* A stick deflection smaller than this leaves the airframe's pose alone;
 * past it, each axis tips the airframe by its own share. */
const FLOURISH_DEADBAND = 0.14;
const FLOURISH = { roll: 0.28, pitch: 0.18, yaw: 0.22 };

function setLens(camera, overlay) {
  const fov = overlay && camera.aspect < TALL_BELOW_ASPECT ? FOV_TALL : FOV_WIDE;
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}

/*
 * The view offset. Its full frame is the camera's aspect wide and 1 high,
 * because setViewOffset sets aspect = fullWidth / fullHeight: a unit frame
 * would quietly make the camera square. With no shift the offset is turned
 * off rather than zeroed, since the flight camera shares this camera and
 * expects no view. It is set again only when the shift or the aspect moved.
 */
function shiftLens(camera, overlay) {
  const aspect = camera.aspect;
  const tall = aspect < TALL_BELOW_ASPECT;
  const x = overlay && !tall ? SHIFT.wideX * aspect : 0;
  const y = overlay ? (tall ? SHIFT.tallY : SHIFT.wideY) : 0;
  const view = camera.view;
  const on = Boolean(view && view.enabled);
  if (!x && !y) {
    if (on) {
      camera.clearViewOffset();
    }
    return;
  }
  if (on && view.fullWidth === aspect && view.offsetX === x && view.offsetY === y) {
    return;
  }
  camera.setViewOffset(aspect, 1, x, y, aspect, 1);
}

/* A place on a closed loop in [0, 1). The % operator keeps the sign of a
 * negative clock, and three's curves read before the first point when
 * handed one, so every lookup goes through here. Not a number is 0. */
function loopParam(u) {
  return Number.isFinite(u) ? ((u % 1) + 1) % 1 : 0;
}

/* One stick axis as the airframe shows it, nothing inside the deadband.
 * The shell passes all three axes whenever it passes options; an axis it
 * left out is not a number and the pose shows it. */
function flourish(opts, axis) {
  const v = opts ? opts[axis] : 0;
  return Math.abs(v) < FLOURISH_DEADBAND ? 0 : v;
}

/* Sets the airframe at `from` facing `toward`, banked, with the flourish.
 * Every model's nose is along -z and lookAt turns +z to the target, so a
 * half turn about Y comes last, after the bank and flourish it carries. */
function placeCraft(craft, from, toward, bank, opts) {
  if (!craft) {
    return;
  }
  craft.visible = true;
  craft.position.copy(from);
  craft.up.set(0, 1, 0);
  craft.lookAt(toward);
  craft.rotateZ(bank + flourish(opts, 'roll') * FLOURISH.roll);
  craft.rotateX(flourish(opts, 'pitch') * FLOURISH.pitch);
  craft.rotateY(-flourish(opts, 'yaw') * FLOURISH.yaw);
  craft.rotateY(Math.PI);
}

/* Circling a point: the eye on a circle, the airframe hovering over the
 * centre and turning with it, or the centre itself in frame. */
function orbitShot(spec) {
  const at = spec ?? DEFAULT_ORBIT;
  const hover = new THREE.Vector3();
  const facing = new THREE.Vector3();
  const look = new THREE.Vector3();
  return {
    kind: 'orbit',
    periodMs: ORBIT_PERIOD_MS,
    update(nowMs, camera, opts) {
      const overlay = Boolean(opts && opts.overlay);
      const craft = opts && opts.craft;
      const a = nowMs * ORBIT_RATE;
      setLens(camera, overlay);
      camera.up.set(0, 1, 0);
      camera.position.set(at.x + Math.sin(a) * at.radius, at.y + at.eye, at.z + Math.cos(a) * at.radius);
      hover.set(at.x, at.y + Math.min(1.15, at.eye * 0.42), at.z);
      facing.set(hover.x - Math.cos(a), hover.y, hover.z + Math.sin(a));
      placeCraft(craft, hover, facing, 0, opts);
      if (craft) {
        look.copy(hover);
        look.y += 0.04;
      } else {
        look.set(at.x, at.y + at.aim, at.z);
      }
      camera.lookAt(look);
      shiftLens(camera, overlay);
    },
  };
}

/* Heading change from a to b, wrapped into [-pi, pi]. */
function turn(a, b) {
  let d = b - a;
  while (d > Math.PI) {
    d -= Math.PI * 2;
  }
  while (d < -Math.PI) {
    d += Math.PI * 2;
  }
  return d;
}

/*
 * Flying the line. The curve is centripetal Catmull-Rom: the line's
 * clearance was checked at its samples, and centripetal is the
 * parameterisation that cannot overshoot or loop between unevenly spaced
 * samples, so the camera stays inside the checked corridor.
 *
 * The bank follows the turn rate (the heading change across the look
 * ahead, so a corner banks the same at any speed), smoothed so the aim
 * stepping between segments does not flick the horizon. A clock that steps
 * back, as a capture rewinding to the top of its loop does, restarts the
 * smoothing rather than yanking the bank.
 */
function lineShot(spec, points) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p.x, p.y, p.z)), true, 'centripetal');
  const length = Math.max(1, curve.getLength());
  const speed = spec.speed ?? 12;
  const lookAhead = Math.min(length * 0.2, spec.lookAhead ?? 16);
  const aimDrop = spec.aimDrop ?? 2.0;
  const ahead = Math.min(lookAhead * 0.45, CRAFT_AHEAD);
  const at = (u, offset, out) => curve.getPointAt(loopParam(u + offset / length), out);
  const eye = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const behind = new THREE.Vector3();
  const craftAt = new THREE.Vector3();
  const craftAim = new THREE.Vector3();
  const flat = new THREE.Vector3();
  const right = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  let bank = 0;
  let prevMs = null;
  return {
    kind: 'path',
    length,
    periodMs: (length / speed) * 1000,
    update(nowMs, camera, opts) {
      const overlay = Boolean(opts && opts.overlay);
      const craft = opts && opts.craft;
      const u = loopParam((nowMs * 0.001 * speed) / length);
      curve.getPointAt(u, eye);
      at(u, lookAhead, aim);
      at(u, ahead, craftAt);
      at(u, ahead + lookAhead * 0.35, craftAim);
      at(u, -lookAhead, behind);
      const rate = turn(Math.atan2(eye.x - behind.x, eye.z - behind.z), Math.atan2(aim.x - eye.x, aim.z - eye.z));
      const target = Math.max(-BANK_LIMIT, Math.min(BANK_LIMIT, rate * BANK_GAIN));
      const dt = prevMs == null || nowMs < prevMs ? 0 : Math.min(0.1, (nowMs - prevMs) * 0.001);
      prevMs = nowMs;
      bank += (target - bank) * Math.min(1, dt * BANK_FOLLOW);

      flat.copy(aim).sub(eye);
      flat.y = 0;
      if (flat.lengthSq() < 1e-8) {
        flat.set(0, 0, 1);
      } else {
        flat.normalize();
      }
      right.crossVectors(flat, UP);
      if (right.lengthSq() < 1e-8) {
        right.set(1, 0, 0);
      } else {
        right.normalize();
      }
      craftAt.addScaledVector(right, CRAFT_RIGHT);

      setLens(camera, overlay);
      camera.up.set(0, 1, 0);
      camera.position.copy(eye);
      aim.y -= aimDrop;
      camera.lookAt(aim);
      camera.rotateZ(bank);
      placeCraft(craft, craftAt, craftAim, bank, opts);
      shiftLens(camera, overlay);
    },
  };
}

/*
 * The title camera for `view`: { kind, periodMs, length?, update(nowMs,
 * camera, opts) }, opts carrying overlay (the menu is up), craft (the
 * airframe to pose) and the stick's roll, pitch and yaw. A line needs at
 * least four points; anything less is an orbit.
 */
export function makeAttractCamera(view) {
  const spec = view && view.attract ? view.attract : null;
  const points = spec && Array.isArray(spec.path) ? spec.path : null;
  return points && points.length >= 4 ? lineShot(spec, points) : orbitShot(spec);
}
