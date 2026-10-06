#!/usr/bin/env node
/*
 * camera-lock-check.js: `npm run camera:lock`, the camera ball's check
 * (docs/campaign/interior/TECH-NEEDS.md N14). Plain Node, no browser.
 *
 *   1. LOCK. A Bramor orbits a point at survey altitude over rolling
 *      ground, its heading weaving, at every optical zoom and digital
 *      crop; the ball locked on the point keeps it inside 1 % of the frame
 *      from centre (off <= 0.01) every frame, both in the picture the
 *      shell draws (the three.js camera threeCameraOf makes through
 *      frame.js) and in the room's judgement (sight() from the pose toward
 *      the last aim point reported at 2 a second, CONTRACT-P0.md 3).
 *   2. PARITY. The pointing the room judges by equals the picture's: for
 *      random points of the ground, from orbits, from straight overhead and
 *      at the horizon, sight()'s off and the three.js camera's projection
 *      agree, and inside / outside the frame agree.
 *   3. FREE. Unlocked, the ball holds pan from the heading and tilt from
 *      the horizon; its aim lies on the ground; a report taken at its own
 *      instant puts its aim at the room's frame centre.
 *   4. POINT TRACK. Slewing a locked ball moves the point along the
 *      ground, and the zoom stays inside the ball's range.
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

import {
  CAMERA_BALLS, ballFor, bearingOf, createBall, threeCameraOf,
} from '../src/avionics/camball.js';
import { sight } from '../src/share/ops/sight.js';
import { docPosToThree } from '../src/render/frame.js';

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}${detail ? `  (${detail})` : ''}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

/* Rolling ground, tens of metres of relief. */
const heightAt = (x, y) => 20 * Math.sin(x / 300) + 15 * Math.cos(y / 410);

const v3 = { set(x, y, z) { this.v = [x, y, z]; return this; } };
const toThree = (p) => docPosToThree(p[0], p[1], p[2], v3).v.slice();

/* A point through the three.js camera: NDC { x, y } or null behind. */
function project(cam, aspect, p) {
  const P = toThree(p);
  const d = [P[0] - cam.position[0], P[1] - cam.position[1], P[2] - cam.position[2]];
  /* Rotate by the conjugate quaternion: world into the camera. */
  const [qx, qy, qz, qw] = cam.quaternion;
  const ix = -qx; const iy = -qy; const iz = -qz;
  const tx = 2 * (iy * d[2] - iz * d[1]);
  const ty = 2 * (iz * d[0] - ix * d[2]);
  const tz = 2 * (ix * d[1] - iy * d[0]);
  const c = [
    d[0] + qw * tx + (iy * tz - iz * ty),
    d[1] + qw * ty + (iz * tx - ix * tz),
    d[2] + qw * tz + (ix * ty - iy * tx),
  ];
  if (c[2] >= -1e-9) {
    return null;
  }
  const tv = Math.tan((cam.fov * Math.PI) / 360);
  return { x: (c[0] / -c[2]) / (tv * aspect), y: (c[1] / -c[2]) / tv };
}
const offOf = (n) => Math.max(Math.abs(n.x), Math.abs(n.y));
const unit = (a, b) => {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const n = Math.hypot(...d);
  return d.map((c) => c / n);
};

const spec = ballFor('bramor2300');
check('the Bramor carries a ball', Boolean(spec));
check('its optical zoom reaches 16x (the lead, 2026-10-05)', spec && spec.zoom[1] >= 16, `${spec.zoom[0]}x to ${spec.zoom[1]}x`);
check('only the aircraft listed carry one', ballFor('5inch') === null && Object.keys(CAMERA_BALLS).length >= 1);

/* 1. LOCK, over one whole orbit per lens. */
const C = [1000, 2000];
const groundC = heightAt(C[0], C[1]);
const R = 650;
const ALT = 500;
const V = 22;
const ASPECT = 16 / 9;
for (const optical of [1, 4, 16]) {
  for (const digital of [1, 2, 4]) {
    const ball = createBall(spec);
    let worstPic = 0;
    let worstRoom = 0;
    let lastAim = null;
    let lastReport = -Infinity;
    let locked = false;
    const period = (2 * Math.PI * R) / V;
    const dt = 1 / 60;
    for (let t = 0; t < period; t += dt) {
      const a = (V / R) * t;
      const p = [C[0] + R * Math.cos(a), C[1] + R * Math.sin(a), groundC + ALT + 5 * Math.sin(t / 7)];
      /* Counter clockwise orbit: the track is a + 90 degrees; the nose
       * weaves either side of it, as a pilot's does. */
      const track = bearingOf(-Math.sin(a), Math.cos(a));
      const craft = { p, heading: track + 0.25 * Math.sin(t * 0.9) };
      if (!locked) {
        /* The pilot points the ball at the spot, then locks it. */
        const d = unit(p, [C[0], C[1], groundC]);
        ball.state.pan = bearingOf(d[0], d[1]) - craft.heading;
        ball.state.tilt = Math.asin(d[2]);
        ball.state.zoom = optical;
        ball.step(0, {}, craft, heightAt);
        locked = ball.lockHere();
        check(`lock taken at ${optical}x / ${digital}x on the ground`, locked && Math.abs(ball.state.lock[2] - heightAt(ball.state.lock[0], ball.state.lock[1])) < 0.2);
      }
      ball.step(dt, {}, craft, heightAt);
      const tanHalf = ball.tanHalf(digital);
      const cam = threeCameraOf(p, ball.state.dir, tanHalf, ASPECT);
      const n = project(cam, ASPECT, ball.state.lock);
      worstPic = Math.max(worstPic, n ? offOf(n) : Infinity);
      if (t - lastReport >= 0.5) {
        lastReport = t;
        lastAim = ball.state.aim.slice();
      }
      const s = sight(p, { dir: unit(p, lastAim), tanHalf, aspect: ASPECT }, ball.state.lock, 1);
      worstRoom = Math.max(worstRoom, s ? s.off : Infinity);
    }
    check(`orbit at ${optical}x optical, ${digital}x digital: lock inside 1 % of centre in the picture`, worstPic <= 0.01, `worst ${worstPic.toExponential(2)}`);
    check(`orbit at ${optical}x optical, ${digital}x digital: lock inside 1 % of centre for the room`, worstRoom <= 0.01, `worst ${worstRoom.toExponential(2)}`);
  }
}

/* 2. PARITY: the room's sight() against the picture, random cameras and
 * points, including straight down and level. */
{
  let rnd = 0x2545F491;
  const r = () => {
    rnd ^= rnd << 13; rnd >>>= 0;
    rnd ^= rnd >>> 17;
    rnd ^= rnd << 5; rnd >>>= 0;
    return rnd / 4294967296;
  };
  let worst = 0;
  let disagree = 0;
  let n = 0;
  const cases = [];
  for (let i = 0; i < 400; i += 1) {
    const p = [r() * 4000, r() * 4000, 300 + r() * 900];
    const tilt = i < 20 ? -Math.PI / 2 : i < 40 ? 0 : -r() * 1.5;
    const bearing = r() * 2 * Math.PI;
    const dir = [Math.cos(tilt) * Math.sin(bearing), Math.cos(tilt) * Math.cos(bearing), Math.sin(tilt)];
    const tanHalf = Math.tan(spec.hfov / 2) / (1 + r() * 63);
    const aspect = [16 / 9, 4 / 3, 9 / 16, 21 / 9][i % 4];
    cases.push({
      p, dir, tanHalf, aspect,
    });
  }
  for (const c of cases) {
    const cam = threeCameraOf(c.p, c.dir, c.tanHalf, c.aspect);
    for (let k = 0; k < 20; k += 1) {
      /* Points in and around the frame: along the axis, off by up to
       * twice the half field each way. */
      const along = 200 + r() * 3000;
      const centre = c.p.map((x, j) => x + c.dir[j] * along);
      const spread = along * c.tanHalf * 2;
      const q = [centre[0] + (r() - 0.5) * 2 * spread, centre[1] + (r() - 0.5) * 2 * spread, centre[2] + (r() - 0.5) * 2 * spread];
      const s = sight(c.p, c, q, 1);
      const m = project(cam, c.aspect, q);
      if (!s || !m) {
        disagree += Number(Boolean(s) !== Boolean(m));
        continue;
      }
      n += 1;
      worst = Math.max(worst, Math.abs(s.off - offOf(m)));
      disagree += Number(s.inside !== (offOf(m) <= 1));
    }
  }
  check('parity: the room\'s off equals the picture\'s', worst < 1e-6, `${n} points, worst |delta| ${worst.toExponential(2)}`);
  check('parity: in frame for the room exactly when in the picture', disagree === 0, `${disagree} disagreements`);
}

/* 3. FREE. */
{
  const ball = createBall(spec);
  const p = [0, 0, 600];
  ball.state.pan = 0.3;
  ball.state.tilt = -0.6;
  ball.step(0.016, {}, { p, heading: 1.0 }, heightAt);
  const b1 = ball.state.bearing;
  ball.step(0.016, {}, { p, heading: 1.5 }, heightAt);
  check('free: the ball turns with the heading (pan held)', Math.abs(ball.state.bearing - b1 - 0.5) < 1e-9 && Math.abs(ball.state.pan - 0.3) < 1e-9);
  check('free: tilt held from the horizon', Math.abs(Math.asin(ball.state.dir[2]) + 0.6) < 1e-9);
  check('free: its aim is on the ground', ball.state.hit && Math.abs(ball.state.aim[2] - heightAt(ball.state.aim[0], ball.state.aim[1])) < 0.2);
  const s = sight(p, { dir: unit(p, ball.state.aim), tanHalf: ball.tanHalf(1), aspect: ASPECT }, ball.state.aim, 1);
  check('free: a report at its own instant centres its aim for the room', s && s.off < 1e-6);
  ball.state.tilt = 0.1;
  ball.step(0.016, {}, { p, heading: 0 }, heightAt);
  check('free: looking above the horizon reports a far point on the axis', ball.state.hit === null && Math.hypot(...ball.state.aim.map((c, i) => c - p[i])) > 19000);
  ball.step(1, { tilt: 1 }, { p, heading: 0 }, heightAt);
  check('free: tilt stops at the gimbal\'s limit', ball.state.tilt <= spec.tilt[1] + 1e-12);
  ball.step(10, { zoom: 1 }, { p, heading: 0 }, heightAt);
  check('zoom stops at the lens\'s longest', ball.state.zoom === spec.zoom[1]);
  ball.step(10, { zoom: -1 }, { p, heading: 0 }, heightAt);
  check('zoom stops at the lens\'s widest', ball.state.zoom === spec.zoom[0]);
}

/* 4. POINT TRACK. */
{
  const ball = createBall(spec);
  const p = [0, -800, 600];
  ball.state.tilt = -0.6;
  ball.step(0.016, {}, { p, heading: 0 }, heightAt);
  ball.lockHere();
  const before = ball.state.lock.slice();
  ball.step(0.5, { pan: 1 }, { p, heading: 0 }, heightAt);
  const after = ball.state.lock;
  check('point track: slewing right moves the lock east (looking north)', after[0] > before[0] + 1 && Math.abs(after[1] - before[1]) < 1);
  check('point track: the moved lock stays on the ground', Math.abs(after[2] - heightAt(after[0], after[1])) < 1e-9);
  ball.unlock();
  check('unlock releases the point', ball.state.lock === null);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
