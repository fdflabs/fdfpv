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

import { LESSONS, LessonWatch, lessonById } from '../src/game/training.js';
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

/* A flight as frames: each segment is { ms, grounded, yawRate, crashed }. */
const FRAME_MS = 16;
function fly(id, segments, { laps = [] } = {}) {
  const w = new LessonWatch(lessonById(id));
  let t = 0;
  let heading = 0.3;
  for (const s of segments) {
    for (let end = t + s.ms; t < end; t += FRAME_MS) {
      heading += (s.yawRate ?? 0) * FRAME_MS / 1000;
      w.tick({ simMs: t, crashed: Boolean(s.crashed), grounded: Boolean(s.grounded), heading: Math.atan2(Math.sin(heading), Math.cos(heading)) });
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

console.log(failed ? `FAIL, ${failed} case(s)` : `PASS, ${LESSONS.length} lessons judged`);
process.exit(failed ? 1 : 0);
