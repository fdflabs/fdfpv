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
import { CERTS, GLIDE, LESSONS, LessonWatch, SKIPS, EIGHT_BANK, LESSON_SETTINGS, SLIP_G, applyLesson, heldSettings, restoreSettings, STALL_FLOOR_M, STALL_RECOVERED, bankOf, lateralG, STICK_END, STICK_HOLD_MS, THERMAL_CLIMB_M, certsEarned, onStrip, STRIPS, TRACKS, gateCue, glidePoints, headingOf, lessonById, passesOf } from '../src/game/training.js';
import { TUNES } from '../configs/registry.js';
import { airframeById } from '../configs/airframes.js';
import { MAPS } from '../src/maps/registry.js';
import { MEDAL_STEPS, medalFor } from '../src/game/medals.js';
import { modeById } from '../src/share/modes.js';
import { MAPS as WEATHER_MAPS, PRESETS as WEATHER } from '../src/game/weather.js';
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
expect('a lesson\'s room is an activity of the registry', LESSONS.every((l) => l.room === undefined || Boolean(modeById(l.room))), true);
expect('ids are unique', new Set(LESSONS.map((l) => l.id)).size, LESSONS.length);

/* A flight as frames: each segment is { ms, grounded, yawRate, crashed,
 * agl, x, z, battery }; `gates` after the frames is passes and rims in
 * order, 'g' and 'r'. */
const FRAME_MS = 16;
const TIMBER_STALL = airframeById('timber1500').stall;
function fly(id, segments, { laps = [], gates = '' } = {}) {
  const w = new LessonWatch(lessonById(id));
  let t = 0;
  let heading = 0.3;
  for (const s of segments) {
    for (let end = t + s.ms; t < end; t += FRAME_MS) {
      heading += (s.yawRate ?? 0) * FRAME_MS / 1000;
      w.tick({
        simMs: t, crashed: Boolean(s.crashed), grounded: Boolean(s.grounded), heading: Math.atan2(Math.sin(heading), Math.cos(heading)),
        agl: s.agl ?? (s.grounded ? 0 : 30), pos: { x: s.x ?? 0, y: s.y ?? 0, z: s.z ?? 0 }, battery: s.battery ?? 'ok', airUp: s.up ?? 0, bank: s.bank ?? 0, slipG: s.slip ?? 0,
        sticks: { roll: 0, pitch: 0, yaw: 0, throttle: 0.5, ...s.sticks }, airspeed: s.v ?? null, stall: s.stall === undefined ? TIMBER_STALL : s.stall,
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
    w.lap(lap, lap.ghostMs ?? null);
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
/* Sticks: each end of each stick held a second, recorded channels. */
const stick = (ms, sticks) => ({ ms, grounded: true, sticks });
const ENDS = [{ roll: 1 }, { roll: -0.96 }, { pitch: 1 }, { pitch: -1 }, { yaw: 0.97 }, { yaw: -1 }, { throttle: 1 }, { throttle: 0.02 }];
const sweep = (ms, ends = ENDS) => ends.flatMap((e) => [stick(ms, e), stick(200, {})]);
expect('sticks: every end held 1.1 s', fly('first_sticks', sweep(1100)), true);
expect('sticks: two ends at once count both', fly('first_sticks', [...sweep(1100, [ENDS[1], ...ENDS.slice(3)]), stick(1100, { roll: 1, pitch: 1 })]), true);
expect('sticks: every end held 0.9 s', fly('first_sticks', sweep(900)), false);
expect('sticks: the throttle never closed', fly('first_sticks', sweep(1100, ENDS.slice(0, 7))), false);
expect('sticks: roll only to 90 percent', fly('first_sticks', sweep(1100, [{ roll: 0.9 }, { roll: -0.9 }, ...ENDS.slice(2)])), false);
expect('sticks: an end let go at 0.6 s twice', fly('first_sticks', [...sweep(1100, ENDS.slice(1)), stick(600, { roll: 1 }), stick(100, {}), stick(600, { roll: 1 })]), false);
expect('sticks: a crash after half, then the other half', fly('first_sticks', [...sweep(1100, ENDS.slice(0, 4)), crash, ...sweep(1100, ENDS.slice(4))]), false);
expect('sticks: centred for ten seconds', fly('first_sticks', [stick(10000, {})]), false);
expect('sticks: the ends are 95 percent, held a second (the lead, 2026-10-13)', STICK_END === 0.95 && STICK_HOLD_MS === 1000, true);

/* The stall, on the Timber's own derived clean stall (TIMBER_STALL). */
const flyAt = (ms, agl, v, more = {}) => ({ ms, grounded: false, agl, v, ...more });
expect('stall: the Timber\'s clean stall is its derived 7.2 m/s', TIMBER_STALL, 7.2);
expect('stall: under it at 40 m, back to 1.3 times it', fly('wing_stall', [flyAt(3000, 40, 12), flyAt(1000, 40, 6.5), flyAt(1000, 38, 9.5)]), true);
expect('stall: a first one under the floor, then one above it', fly('wing_stall', [flyAt(1000, 25, 6.5), flyAt(1000, 25, 10), flyAt(3000, 45, 12), flyAt(800, 45, 7), flyAt(800, 41, 9.4)]), true);
expect('stall: back only to 9 m/s, 1.25 times', fly('wing_stall', [flyAt(3000, 40, 12), flyAt(1000, 40, 6.5), flyAt(3000, 40, 9)]), false);
expect('stall: the whole stall at 25 m', fly('wing_stall', [flyAt(3000, 25, 12), flyAt(1000, 25, 6.5), flyAt(1000, 25, 10)]), false);
expect('stall: under the floor in the recovery', fly('wing_stall', [flyAt(1000, 40, 6.5), flyAt(500, 28, 8), flyAt(1000, 31, 10)]), false);
expect('stall: slow flight, never under the stall', fly('wing_stall', [flyAt(3000, 40, 7.5), flyAt(3000, 40, 12)]), false);
expect('stall: slow on the ground, then fast in the air', fly('wing_stall', [{ ms: 2000, grounded: true, v: 3 }, flyAt(3000, 40, 12)]), false);
expect('stall: a crash in the recovery', fly('wing_stall', [flyAt(1000, 40, 6.5), crash, flyAt(3000, 40, 12)]), false);
expect('stall: a quad has no stall', fly('wing_stall', [flyAt(1000, 40, 0.5, { stall: null }), flyAt(1000, 40, 15, { stall: null })]), false);
expect('stall: the floor is 30 m and recovery 1.3 times (the lead, 2026-10-13)', STALL_FLOOR_M === 30 && STALL_RECOVERED === 1.3, true);

/* The figure eight: heading by yaw rate, bank in radians (right wing
 * down positive), slip in g. A circle in 8 s at 30 degrees of bank. */
const DEG = Math.PI / 180;
const left = (ms, bank = 30, slip = 0) => ({ ms, grounded: false, yawRate: CIRCLE, bank: -bank * DEG, slip });
const right = (ms, bank = 30, slip = 0) => ({ ms, grounded: false, yawRate: -CIRCLE, bank: bank * DEG, slip });
const roll = (ms) => ({ ms, grounded: false, bank: 0 });
expect('eight: a circle left, a circle right', fly('wing_eight', [roll(1000), left(8200), roll(600), right(8200)]), true);
expect('eight: right first, then left, at 22 and 44 degrees', fly('wing_eight', [right(8200, 22), roll(600), left(8200, 44)]), true);
expect('eight: an overrun of the first circle, then the reversal', fly('wing_eight', [left(11000), roll(600), right(8200)]), true);
expect('eight: a slip of 0.15 g, then a whole clean eight', fly('wing_eight', [left(4000, 30, 0.15), left(8200), right(8200)]), true);
expect('eight: a slip of 0.12 g in the second circle', fly('wing_eight', [left(8200), right(4000), right(500, 30, -0.12), right(4000)]), false);
expect('eight: 0.09 g of slip throughout', fly('wing_eight', [left(8200, 30, 0.09), right(8200, 30, -0.09)]), true);
expect('eight: two circles left', fly('wing_eight', [left(16400)]), false);
expect('eight: a left circle and three quarters right', fly('wing_eight', [left(8200), right(6000)]), false);
expect('eight: banked 15 degrees', fly('wing_eight', [left(8200, 15), right(8200, 15)]), false);
expect('eight: banked 50 degrees', fly('wing_eight', [left(8200, 50), right(8200, 50)]), false);
expect('eight: flat, rudder only (bank 0)', fly('wing_eight', [left(8200, 0), right(8200, 0)]), false);
expect('eight: crossed, yawing left banked right', fly('wing_eight', [{ ms: 8200, grounded: false, yawRate: CIRCLE, bank: 30 * DEG }, right(8200)]), false);
expect('eight: touching down between the circles', fly('wing_eight', [left(8200), ground(300), right(8200)]), false);
expect('eight: 0.1 g and 20 to 45 degrees (the lead, 2026-10-13)', SLIP_G === 0.1 && Math.abs(EIGHT_BANK[0] - 20 * DEG) < 1e-12 && Math.abs(EIGHT_BANK[1] - 45 * DEG) < 1e-12, true);

/* The glider track. A thermal: height y climbed, throttle closed, in
 * rising air; a frame's height steps linearly through a segment. */
const glide = (ms, y0, y1, up = 1.5, throttle = 0) => ({ ms, grounded: false, up, sticks: { throttle }, y0, y1 });
function soar(id, segments) {
  const out = [];
  for (const g of segments) {
    const n = Math.max(1, Math.round(g.ms / 200));
    for (let i = 0; i < n; i += 1) {
      out.push({ ...g, ms: g.ms / n, y: g.y0 + (g.y1 - g.y0) * ((i + 1) / n) });
    }
  }
  return fly(id, out);
}
expect('thermal: 12 m up, throttle closed, rising air', soar('glider_thermal', [glide(20000, 100, 112)]), true);
expect('thermal: a sink first, then 10 m from the lowest', soar('glider_thermal', [glide(5000, 100, 95), glide(20000, 95, 105.5)]), true);
expect('thermal: 12 m up under power', soar('glider_thermal', [glide(20000, 100, 112, 1.5, 0.4)]), false);
expect('thermal: 12 m up in still air, a zoom', soar('glider_thermal', [glide(5000, 100, 112, 0)]), false);
expect('thermal: 6 m, a burst of throttle, 6 m', soar('glider_thermal', [glide(5000, 100, 106), glide(500, 106, 107, 1.5, 0.5), glide(5000, 107, 113)]), false);
expect('thermal: 9 m only', soar('glider_thermal', [glide(20000, 100, 109)]), false);
expect('thermal: 10 m (TRAINING.md 9), past a zoom from 15 m/s', THERMAL_CLIMB_M === 10
  && (15 ** 2 - airframeById('radian2000').stall ** 2) / (2 * 9.81) < THERMAL_CLIMB_M, true);
const strip = STRIPS.swiss2;
expect('the strip box: the threshold\'s centre, the far end, a wheel at the edge', onStrip(strip, { x: 0, z: 80 }) && onStrip(strip, { x: 0, z: -80 }) && onStrip(strip, { x: 5.9, z: 0 }), true);
expect('the strip box: short of the threshold, past the far end, off the side', onStrip(strip, { x: 0, z: 81 }) || onStrip(strip, { x: 0, z: -81 }) || onStrip(strip, { x: 6.1, z: 0 }), false);
expect('strip landing: down and still on it', fly('glider_land', [air(6000), { ms: 1200, grounded: true, x: 1, z: 20 }]), true);
expect('strip landing: down and still beside it', fly('glider_land', [air(6000), { ms: 1200, grounded: true, x: 9, z: 20 }]), false);
expect('strip landing: short of it in the grass', fly('glider_land', [air(6000), { ms: 1200, grounded: true, x: 0, z: 110 }]), false);
expect('launch: 21 s up on the Radian', fly('glider_launch', [ground(300), air(21000)]), true);
expect('launch: 15 s up', fly('glider_launch', [ground(300), air(15000), ground(500)]), false);
expect('a strip landing flies where there is a strip', LESSONS.filter((l) => l.steps.some((st) => st.onStrip)).every((l) => Boolean(STRIPS[l.place])), true);
expect('a lesson\'s weather is a preset with thermals where it asks for one', LESSONS.filter((l) => l.weather).every((l) => WEATHER[l.weather] && WEATHER[l.weather].thermal > 0
  && (!l.steps.some((st) => st.thermal) || Boolean(WEATHER_MAPS[l.place]))), true);

/* Racing a pilot: the round event a finished room race logs. */
const raced = (rounds) => {
  const w = new LessonWatch(lessonById('race_pilot'));
  rounds.forEach((r) => w.round(r));
  return w.passed;
};
expect('pilot: a race finished with two on the grid', raced([{ game: 'race', world: 'swiss2', pilots: 2 }]), true);
expect('pilot: alone on the grid, then with three', raced([{ game: 'race', pilots: 1 }, { game: 'race', pilots: 3 }]), true);
expect('pilot: a race finished alone', raced([{ game: 'race', world: 'swiss2', pilots: 1 }]), false);
expect('pilot: a combat round with four', raced([{ game: 'combat', world: 'swiss2' }, { game: 'tag', pilots: 4 }]), false);
expect('pilot: a laps-only flight', fly('race_pilot', [], { laps: [{ ms: 30000 }] }), false);
/* A lap under a time: the medal is medals.js's own, from a course's gold. */
const GOLD = { goldMs: 30000 };
const lapOn = (ms, medals = GOLD) => ({ ms, medal: medalFor(medals, ms) });
expect('bronze: a lap at 1.3 times gold', fly('race_bronze', [], { laps: [lapOn(39000)] }), true);
expect('bronze: a gold lap passes too', fly('race_bronze', [], { laps: [lapOn(29000)] }), true);
expect('bronze: slower than bronze, then bronze', fly('race_bronze', [], { laps: [lapOn(41000), lapOn(40000)] }), true);
expect('bronze: a lap at 1.4 times gold', fly('race_bronze', [], { laps: [lapOn(42000)] }), false);
expect('bronze: a fast lap on a course with no medals', fly('race_bronze', [], { laps: [lapOn(10000, null)] }), false);
expect('every medal step is a medal', LESSONS.flatMap((l) => l.steps).filter((st) => st.medal !== undefined).every((st) => MEDAL_STEPS.includes(st.medal)), true);

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
/* The bank's sign and the lateral g against the plant's frame: a roll
 * that puts the right wing down is a positive bank; a level turn at that
 * bank, its acceleration g tan(bank) to the right, reads no slip, and the
 * same acceleration with the wings level reads tan(bank) g. */
function rolled(t, roll, vy) {
  const st = new Float64Array(20);
  st[0] = t;
  st[4] = 15;
  st[5] = vy;
  st[7] = Math.cos(roll / 2);
  st[8] = Math.sin(roll / 2);
  return st;
}
{
  const b = 30 * Math.PI / 180;
  const st = rolled(0, b, 0);
  const leftTipZ = 2 * (st[9] * st[10] + st[7] * st[8]);
  expect('a positive bank lifts the left wing: the right is down', bankOf(st) > 0 && leftTipZ > 0 && Math.abs(bankOf(st) - b) < 1e-12, true);
  const a = -9.81 * Math.tan(b);
  expect('a coordinated level turn reads no slip', Math.abs(lateralG(rolled(0, b, 0), rolled(0.001, b, a * 0.001))) < 1e-9, true);
  expect('the same turn flat reads tan(bank) g', Math.abs(Math.abs(lateralG(rolled(0, 0, 0), rolled(0.001, 0, a * 0.001))) - Math.tan(b)) < 1e-9, true);
  expect('one state twice has no slip to read', lateralG(rolled(0, b, 0), rolled(0, b, 0)), null);
}
expect('every lesson is on a listed track', LESSONS.every((l) => TRACKS.includes(l.track)), true);
for (const t of TRACKS) {
  expect(`training.track.${t} en and es`, typeof en[`training.track.${t}`] === 'string' && typeof es[`training.track.${t}`] === 'string', true);
}

/* The aids. The Swiss valley's strip is the Alps' terrain's, which Node
 * cannot import (it needs Three.js), so its length is read from the source. */
const stripL = Number(/export const STRIP_L = (\d+)/.exec(readFileSync(new URL('../src/maps/alps/heights.js', import.meta.url), 'utf8'))[1]);
expect('the strip\'s threshold is the Alps terrain\'s strip end', STRIPS.swiss2.z, stripL / 2);
expect('the strip\'s length and width are the Alps terrain\'s', [STRIPS.swiss2.length, STRIPS.swiss2.width].join(), [stripL, Number(/export const STRIP_W = (\d+)/.exec(readFileSync(new URL('../src/maps/alps/heights.js', import.meta.url), 'utf8'))[1])].join());
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

/* Certifications: every lesson of the track passed, a skip's covered
 * passes included; one short earns nothing. */
const allOf = (track, t = 5) => Object.fromEntries(LESSONS.filter((l) => l.track === track).map((l) => [l.id, t]));
for (const t of CERTS) {
  expect(`${t}: a track with a certification is a listed track, its words in en and es`, TRACKS.includes(t) && typeof en[`training.cert.${t}`] === 'string' && typeof es[`training.cert.${t}`] === 'string', true);
  expect(`${t}: every lesson passed earns it`, certsEarned(allOf(t)).join(), t);
  const short = allOf(t);
  delete short[Object.keys(short).at(-1)];
  expect(`${t}: its last lesson missing earns nothing`, certsEarned(short).length, 0);
}
expect('First flight has no certification (PROGRESSION.md 7)', CERTS.includes('first'), false);
expect('racing: the clean lap\'s skip passes count, as passesOf writes them', certsEarned({
  ...Object.fromEntries(passesOf('race_clean').map((id) => [id, 5])), race_bronze: 6, race_ghost: 7, race_pilot: 8,
}).join(), 'racing');
expect('a time that is not a pass earns nothing', certsEarned({ ...allOf('racing'), race_pilot: 0 }).length, 0);
expect('two tracks at once', certsEarned({ ...allOf('racing'), ...allOf('multirotor') }).join(), 'multirotor,racing');

/* A lesson's settings go back when it is left. `seat` stands in for
 * settings.js seatAirframe, which also resets the tune. */
{
  const seat = (st, id) => {
    st.airframe = id;
    st.tune = `${id}-default`;
    st.seats = (st.seats || 0) + 1;
  };
  const ok = () => true;
  const before = { airframe: 'bramor2300', tune: 'bramor-as3x', flightMode: 'angle', weather: 'calm', livery: 'kept' };
  const s = { ...before };
  const held = JSON.parse(JSON.stringify(heldSettings(s)));
  applyLesson(s, lessonById('glider_thermal'), seat);
  expect('a lesson seats its aircraft, tune and weather', [s.airframe, s.tune, s.weather].join(), 'radian2000,radian-stab,breeze');
  applyLesson(s, lessonById('quad_hover'), seat);
  expect('and a quad lesson its flight mode', [s.airframe, s.flightMode].join(), 'interceptor,angle');
  expect('what was held puts every one back, through storage\'s JSON', restoreSettings(s, held, seat, ok)
    && LESSON_SETTINGS.every((k) => s[k] === before[k]) && s.livery === 'kept', true);
  const t = { ...before };
  applyLesson(t, lessonById('first_takeoff'), seat);
  restoreSettings(t, held, seat, (k, v) => k !== 'weather' && v !== 'bramor-as3x');
  expect('a value the build refuses is not put back', [t.airframe, t.tune, t.weather].join(), 'bramor2300,bramor2300-default,calm');
  const u = { ...before };
  restoreSettings(u, held, seat, ok);
  expect('the same aircraft is not seated again', u.seats, undefined);
  expect('nothing held, nothing to put back', restoreSettings(u, null, seat, ok) || restoreSettings(u, 'x', seat, ok), false);
}

console.log(failed ? `FAIL, ${failed} case(s)` : `PASS, ${LESSONS.length} lessons judged`);
process.exit(failed ? 1 : 0);
