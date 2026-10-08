/*
 * training-selftest.js: every lesson (src/game/training.js) is data that
 * names things that exist, has its words in both languages, and its judge
 * passes the flight that does the step and fails the near miss, on tick
 * streams at the shell's frame rate. Contract:
 * docs/TRAINING-DAMAGE-CONTRACT.md.
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

import { readFileSync } from 'node:fs';
import { GLIDE, LESSONS, LessonWatch, SKIPS, STRIPS, TRACKS, gateCue, glidePoints, headingOf, lessonById, passesOf } from '../src/game/training.js';
import { TUNES } from '../configs/registry.js';
import { airframeById } from '../configs/airframes.js';
import { MAPS } from '../src/maps/registry.js';
import en from '../src/strings/en.js';
import es from '../src/strings/es.js';

let failed = 0;
function expect(what, got, want) {
  const ok = got === want;
  if (!ok) {
    failed += 1;
  }
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}: ${JSON.stringify(got)}${ok ? '' : ` (want ${JSON.stringify(want)})`}`);
}

for (const l of LESSONS) {
  if (l.airframe) {
    expect(`${l.id} airframe ${l.airframe} exists`, Boolean(airframeById(l.airframe)), true);
  }
  if (l.tune) {
    const t = TUNES.find((x) => x.id === l.tune);
    expect(`${l.id} tune ${l.tune} flies its airframe`, t ? t.airframe : null, l.airframe);
  }
  if (l.place) {
    expect(`${l.id} place ${l.place} exists`, MAPS.some((m) => m.id === l.place), true);
  }
  for (const k of [`training.lesson.${l.id}`, `training.lesson.${l.id}_note`]) {
    expect(`${k} en and es`, typeof en[k] === 'string' && typeof es[k] === 'string', true);
  }
}
expect('ids are unique', new Set(LESSONS.map((l) => l.id)).size, LESSONS.length);

/* A flight as frames: each segment is { ms, grounded, yawRate, crashed,
 * agl, x, z, battery }; `gates` after the frames is passes and rims in
 * order, 'g' and 'r'. */
const FRAME_MS = 16;
function fly(id, segments, { laps = [], gates = '' } = {}) {
  const w = new LessonWatch(lessonById(id));
  let t = 0;
  let heading = 0.3;
  for (const s of segments) {
    for (let end = t + s.ms; t < end; t += FRAME_MS) {
      heading += (s.yawRate ?? 0) * FRAME_MS / 1000;
      w.tick({
        simMs: t, crashed: Boolean(s.crashed), grounded: Boolean(s.grounded), heading: Math.atan2(Math.sin(heading), Math.cos(heading)),
        agl: s.agl ?? (s.grounded ? 0 : 30), pos: { x: s.x ?? 0, z: s.z ?? 0 }, battery: s.battery ?? 'ok',
      });
    }
  }
  for (const g of gates) {
    if (g === 'g') {
      w.gatePass();
    } else {
      w.rim();
    }
  }
  for (const lap of laps) {
    if (lap.rim) {
      w.rim();
    }
    w.lap(lap);
  }
  return w.passed;
}
const ground = (ms) => ({ ms, grounded: true });
const air = (ms, yawRate = 0) => ({ ms, grounded: false, yawRate });
const crash = { ms: 32, crashed: true, grounded: true };
const at = (ms, agl, x = 0, z = 0) => ({ ms, grounded: false, agl, x, z });

expect('height: 21 s at 30 m', fly('wing_height', [ground(300), at(21000, 30)]), true);
expect('height: 15 s, a dip to 20 m, 15 s', fly('wing_height', [at(15000, 30), at(500, 20), at(15000, 30)]), false);
expect('approaches: three landings', fly('wing_approaches', [air(5000), ground(1200), air(5000), ground(1200), air(5000), ground(1200)]), true);
expect('approaches: one long landing is not three', fly('wing_approaches', [air(5000), ground(6000)]), false);
expect('approaches: a crash on the third', fly('wing_approaches', [air(5000), ground(1200), air(5000), ground(1200), air(5000), crash, ground(1200)]), false);
expect('dead stick: low battery, then down', fly('wing_deadstick', [air(5000), { ms: 500, grounded: false, battery: 'warning' }, ground(1200)]), true);
expect('dead stick: down with a full pack', fly('wing_deadstick', [air(5000), ground(1200)]), false);
expect('hover: 16 s in the box', fly('quad_hover', [ground(300), at(16000, 2, 0.5, -0.5)]), true);
expect('hover: drifts 5 m away', fly('quad_hover', [at(8000, 2), at(8000, 2, 5, 0)]), false);
expect('hover: too high', fly('quad_hover', [at(16000, 6)]), false);
expect('throttle: 6 s at 10 m', fly('quad_throttle', [at(3000, 4), at(6000, 10.4)]), true);
expect('throttle: 6 s at 12 m', fly('quad_throttle', [at(6000, 12)]), false);
expect('precision: ten in a row', fly('quad_precision', [], { gates: 'gggrgggggggggg' }), true);
expect('precision: a touch at nine', fly('quad_precision', [], { gates: 'gggggggggrggg' }), false);
const CIRCLE = 2 * Math.PI / 8; /* rad/s: a circle in 8 s */

expect('takeoff: 21 s up', fly('first_takeoff', [ground(500), air(21000)]), true);
expect('takeoff: 19 s up', fly('first_takeoff', [ground(500), air(19000), ground(500)]), false);
expect('takeoff: two 12 s hops', fly('first_takeoff', [air(12000), ground(200), air(12000)]), false);
expect('takeoff: a crash at 15 s, then 21 s', fly('first_takeoff', [air(15000), crash, air(21000)]), true);
expect('turns: left then right', fly('first_turns', [air(3000), air(8200, CIRCLE), air(8200, -CIRCLE)]), true);
expect('turns: right then left', fly('first_turns', [air(3000), air(8200, -CIRCLE), air(8200, CIRCLE)]), false);
expect('turns: three quarters each way', fly('first_turns', [air(6000, CIRCLE), air(6000, -CIRCLE)]), false);
expect('turns: left, touch down, right', fly('first_turns', [air(8200, CIRCLE), ground(200), air(8200, -CIRCLE)]), true);
expect('turns: half left, touch down, half left', fly('first_turns', [air(4500, CIRCLE), ground(200), air(4500, CIRCLE), air(8200, -CIRCLE)]), false);
expect('land: fly then still', fly('first_land', [ground(300), air(5000), ground(1200)]), true);
expect('land: hop of 1 s', fly('first_land', [ground(300), air(1000), ground(1200)]), false);
expect('land: crash on touchdown', fly('first_land', [air(5000), crash, ground(1200)]), false);
expect('unaided: all four', fly('first_unaided', [ground(300), air(21000), air(8200, CIRCLE), air(8200, -CIRCLE), ground(1200)]), true);
expect('unaided: no landing', fly('first_unaided', [air(21000), air(8200, CIRCLE), air(8200, -CIRCLE)]), false);
expect('race lap: one lap', fly('race_lap', [], { laps: [{ ms: 30000, rim: true }] }), true);
expect('race clean: rim, then clean', fly('race_clean', [], { laps: [{ rim: true }, {}] }), true);
expect('race clean: rim only', fly('race_clean', [], { laps: [{ rim: true }] }), false);
expect('ghost: faster', fly('race_ghost', [], { laps: [{ ms: 29000, ghostMs: 30000 }] }), true);
expect('ghost: slower', fly('race_ghost', [], { laps: [{ ms: 31000, ghostMs: 30000 }] }), false);
expect('ghost: no ghost', fly('race_ghost', [], { laps: [{ ms: 29000, ghostMs: null }] }), false);

/* The turn sign against the plant's frame (src/render/frame.js: z up, x
 * forward, y left): rotate the nose by the state's quaternion and see
 * which side it points to. A heading that rises must be a nose that went
 * to +y, the left. */
function stateYawPitch(yaw, pitch) {
  /* q = yaw about z, then pitch about the body's y. */
  const cy = Math.cos(yaw / 2);
  const sy = Math.sin(yaw / 2);
  const cp = Math.cos(pitch / 2);
  const sp = Math.sin(pitch / 2);
  const st = new Float64Array(16);
  st[7] = cy * cp;
  st[8] = -sy * sp;
  st[9] = cy * sp;
  st[10] = sy * cp;
  return st;
}
function noseOf(st) {
  const [w, x, y, z] = [st[7], st[8], st[9], st[10]];
  return [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)];
}
for (const yaw of [0.4, 1.5, -0.7, 2.9]) {
  const st = stateYawPitch(yaw, 0.3);
  const nose = noseOf(st);
  expect(`heading ${yaw} read back`, Math.abs(headingOf(st) - yaw) < 1e-9, true);
  expect(`heading ${yaw} > 0 is a nose to the left (+y)`, Math.sign(nose[1]) === Math.sign(Math.sin(yaw)), true);
}
expect('every lesson is on a listed track', LESSONS.every((l) => TRACKS.includes(l.track)), true);
for (const t of TRACKS) {
  expect(`training.track.${t} en and es`, typeof en[`training.track.${t}`] === 'string' && typeof es[`training.track.${t}`] === 'string', true);
}

/* The aids. The Swiss valley's strip is the Alps' terrain's, which Node
 * cannot import (it needs Three.js), so its length is read from the source. */
const stripL = Number(/export const STRIP_L = (\d+)/.exec(readFileSync(new URL('../src/maps/alps/terrain.js', import.meta.url), 'utf8'))[1]);
expect('the strip\'s threshold is the Alps terrain\'s strip end', STRIPS.swiss2.z, stripL / 2);
expect('every quad mode is angle or acro', LESSONS.every((l) => l.mode == null || ['angle', 'acro'].includes(l.mode)), true);
expect('every lesson\'s aid is a known one', LESSONS.every((l) => l.aid === undefined || ['glide', 'gate'].includes(l.aid)), true);
expect('a glide lesson flies where there is a strip', LESSONS.filter((l) => l.aid === 'glide').every((l) => Boolean(STRIPS[l.place])), true);
const pts = glidePoints(STRIPS.swiss2, 3);
expect('the glide path has its gates', pts.length, GLIDE.count);
expect('all short of the threshold, on the approach side', pts.every((p) => p.z > STRIPS.swiss2.z && p.x === STRIPS.swiss2.x), true);
expect('each higher than the one nearer the strip, at the slope', pts.every((p, i) => i === 0 || Math.abs((p.y - pts[i - 1].y) / (p.z - pts[i - 1].z) - Math.tan(GLIDE.slope)) < 1e-12), true);
expect('the nearest one a metre or so over the ground', pts[0].y - 3 > 0.5 && pts[0].y - 3 < 3, true);
const eye = { x: 0, y: 0, z: 0, forward: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 } };
const near = (a, b) => Math.abs(a - b) < 1e-9;
expect('a gate dead ahead needs no arrow', gateCue(eye, { x: 0, y: 1, z: -40 }).ahead, true);
expect('a gate to the right: the arrow points right', near(gateCue(eye, { x: 10, y: 0, z: 0 }).angle, Math.PI / 2), true);
expect('to the left: left', near(gateCue(eye, { x: -10, y: 0, z: 0 }).angle, -Math.PI / 2), true);
expect('above: up', near(gateCue(eye, { x: 0, y: 10, z: 0 }).angle, 0), true);
expect('behind and a little right: right, not ahead', gateCue(eye, { x: 1, y: 0, z: 20 }).angle > 0 && !gateCue(eye, { x: 1, y: 0, z: 20 }).ahead, true);

/* I fly already: each track's skip is its own lesson, and what a lesson
 * covers is earlier lessons of its own track. */
for (const t of Object.keys(SKIPS)) {
  const l = lessonById(SKIPS[t]);
  expect(`${t}: its skip is one of its lessons`, Boolean(l) && l.track === t, true);
}
for (const l of LESSONS.filter((x) => x.covers)) {
  const at = LESSONS.indexOf(l);
  expect(`${l.id} covers earlier lessons of its track`, l.covers.every((id) => {
    const c = lessonById(id);
    return c && c.track === l.track && LESSONS.indexOf(c) < at;
  }), true);
}
expect('a pass of the unaided round passes the first flight track', passesOf('first_unaided').join(), 'first_unaided,first_takeoff,first_turns,first_land');
expect('a pass of a lesson that covers nothing passes itself', passesOf('first_land').join(), 'first_land');
expect('training.skip en and es', ['training.skip', 'training.skip_note'].every((k) => typeof en[k] === 'string' && typeof es[k] === 'string'), true);

console.log(failed ? `FAIL, ${failed} case(s)` : `PASS, ${LESSONS.length} lessons judged`);
process.exit(failed ? 1 : 0);
