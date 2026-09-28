/*
 * p51-stab-selftest.js: the P-51's stabiliser, acro, rudder, flaps,
 * retracts and surface readback, in the air and on its wheels, in Node.
 *
 * timber-stab-selftest.js's cases with the P-51's throws, acro rates and
 * gains, then what the retracts add: the switch and its refusals, the
 * gear's travel, a reset and an airframe change putting it down, the
 * wheels carrying nothing once it is up. The same stabiliser as the other
 * fixed wings' (src/native/plant_wing.c) with the P-51's own gains:
 * Stabilised flies level with the sticks centred and holds the bank and
 * pitch asked for; Acro holds the attitude it is left at, stops within
 * about 5 degrees of where the stick was centred, and holds inverted; the
 * rudder is the yaw stick in every mode. On the wheels the surfaces stay
 * where the sticks put them and nothing winds up; and where the Timber's
 * roll tracks straight with the sticks centred, the P-51's swings left in
 * every mode, the prop's P factor and the kick of the tail coming up,
 * which the take off pilot's right rudder holds straight. Last, the four
 * surface angles the renderer reads and their signs. Run with
 * npm run p51:stab.
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

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { GROUND_MU, GROUND_E } from '../src/game/collide.js';
import { AIRFRAMES } from '../configs/airframes.js';
import {
  attitude, must, p51Prelude, p51GroundPrelude, p51TakeoffSticks, wheelLoads, wingDebug, TIMBER_AIRFRAME, P51_AIRFRAME, RC_STEP_MS,
} from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DEG = 180 / Math.PI;

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}${detail ? `  (${detail})` : ''}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

const sim = await loadSim(new Uint8Array(await readFile(join(root, 'dist/sim.wasm'))));
must(sim.init(await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8')), 'init');
must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, GROUND_MU, GROUND_E), 'ground');
const surfPtr = sim.e.malloc(4 * 8);

function surfaces() {
  must(sim.e.sim_plane_surfaces(surfPtr), 'sim_plane_surfaces');
  return Array.from(new Float64Array(sim.e.memory.buffer, surfPtr, 4));
}
function wingSurfaces() {
  must(sim.e.sim_wing_surfaces(surfPtr), 'sim_wing_surfaces');
  return Array.from(new Float64Array(sim.e.memory.buffer, surfPtr, 2));
}

let clockMs = 0;
function throwAt(z, speed) {
  must(sim.reset(), 'reset');
  clockMs = 0;
  p51Prelude(sim, { flaps: sim.flapNotch ?? 0 });
  must(sim.reset(), 'reset');
  must(sim.e.sim_set_pose(0, 0, z, 1, 0, 0, 0), 'pose');
  must(sim.e.sim_wing_launch(speed), 'launch');
}

/* Bank from atan2, not attitude()'s asin, so a wing past ninety degrees
 * or inverted reads as what it is. Harness arithmetic only. */
function fullBank(s) {
  const w = s[7], x = s[8], y = s[9], z = s[10];
  return Math.atan2(2 * (y * z + w * x), 1 - 2 * (x * x + y * y));
}

/* Fixed sticks for a while. Returns the last second's mean bank and pitch,
 * the worst bank seen, the worst distance from a reference bank, the mean
 * body rates over the last quarter second (roll right, nose up and nose
 * right positive), the mean sideslip over the last second, and the end
 * state. */
function fly(roll, pitch, yaw, duty, seconds, refBank = null) {
  const total = seconds * 1000;
  let worstBank = 0;
  let worstRef = 0;
  let sumBank = 0;
  let sumPitch = 0;
  let sumBeta = 0;
  let n = 0;
  let sumP = 0;
  let sumQ = 0;
  let sumR = 0;
  let sumRAll = 0;
  let mAll = 0;
  let m = 0;
  let s = null;
  for (let ms = 0; ms < total; ms += RC_STEP_MS) {
    must(sim.input((clockMs + ms) / 1000, roll, pitch, yaw, duty), 'input');
    must(sim.step(RC_STEP_MS), 'step');
    s = sim.readState().state;
    const bank = fullBank(s);
    worstBank = Math.max(worstBank, Math.abs(bank));
    if (refBank !== null) {
      let d = bank - refBank;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      worstRef = Math.max(worstRef, Math.abs(d));
    }
    if (ms >= total - 1000) {
      sumBank += bank;
      sumPitch += attitude(s).pitch;
      sumBeta += wingDebug(sim)[1];
      n += 1;
    }
    sumRAll += -s[13];
    mAll += 1;
    if (ms >= total - 250) {
      sumP += s[11];
      sumQ += -s[12];
      sumR += -s[13];
      m += 1;
    }
  }
  clockMs += total;
  return {
    bank: sumBank / n, endBank: fullBank(s), pitch: sumPitch / n, endPitch: attitude(s).pitch, beta: sumBeta / n,
    worstBank, worst: worstRef, p: sumP / m, q: sumQ / m, r: sumR / m, rAll: sumRAll / mAll,
    v: Math.hypot(s[4], s[5], s[6]), vz: s[6], z: s[3], y: s[2],
  };
}

const deg = (x) => (x * DEG).toFixed(1);

console.log('stabilised');
must(sim.e.sim_wing_set_stab(1), 'set stab');
throwAt(40, 16);
const level = fly(0, 0, 0, 0.75, 10);
check('centred sticks fly level: bank within 3 degrees', Math.abs(level.bank * DEG) < 3, `${deg(level.bank)} deg`);
check('and never banked past 8 degrees on the way', level.worstBank * DEG < 8, `${deg(level.worstBank)} deg`);
check('and hold the trim pitch within 4 degrees', Math.abs(level.pitch * DEG - 2) < 4, `${deg(level.pitch)} deg`);
check('and straight: under 15 m off the line after 10 s', Math.abs(level.y) < 15, `${level.y.toFixed(1)} m`);
check('at a cruising speed', level.v > 12 && level.v < 22, `${level.v.toFixed(1)} m/s`);
check('with the climb rate under 2 m/s', Math.abs(level.vz) < 2, `${level.vz.toFixed(2)} m/s`);
const banked = fly(1, 0, 0, 0.95, 4);
check('full right stick banks right, 50 to 65 degrees', banked.bank * DEG > 50 && banked.bank * DEG < 65, `${deg(banked.bank)} deg`);
check('and the turn coordinator keeps the sideslip under 2 degrees', Math.abs(banked.beta * DEG) < 2, `${deg(banked.beta)} deg`);
const rolledBack = fly(0, 0, 0, 0.75, 3);
check('letting go levels it within 3 s', Math.abs(rolledBack.bank * DEG) < 4, `${deg(rolledBack.bank)} deg`);
const leftBank = fly(-0.5, 0, 0, 0.75, 3);
check('half left stick banks left about 30 degrees', leftBank.bank * DEG < -22 && leftBank.bank * DEG > -38, `${deg(leftBank.bank)} deg`);
fly(0, 0, 0, 0.65, 3);
const nosedUp = fly(0, 0.6, 0, 1.0, 2);
check('up stick lifts the nose, 10 to 30 degrees, no tumble', nosedUp.pitch * DEG > 10 && nosedUp.pitch * DEG < 32 && nosedUp.worstBank * DEG < 25, `${deg(nosedUp.pitch)} deg, bank ${deg(nosedUp.worstBank)}`);
const settled = fly(0, 0, 0, 0.75, 4);
check('and centring brings it back to trim', Math.abs(settled.pitch * DEG - 2) < 4 && Math.abs(settled.bank * DEG) < 4, `pitch ${deg(settled.pitch)}, bank ${deg(settled.bank)}`);
const yawed = fly(0, 0, 1, 0.75, 1);
/* The coordinator's gain is twice the Skyhunter's, for a rudder with
 * two thirds of its yaw acceleration per stick; the stick still wins. */
check('full right yaw stick wins over the coordinator: rudder right of half its throw', surfaces()[3] < -0.5 * 12.1224 * Math.PI / 180, `rudder ${deg(surfaces()[3])} deg`);
check('and yaws the nose right', yawed.r * DEG > 3, `${deg(yawed.r)} deg/s`);
const unyawed = fly(0, 0, 0, 0.75, 4);
check('and letting go of it levels the wings again', Math.abs(unyawed.bank * DEG) < 4, `${deg(unyawed.bank)} deg`);

console.log('acro');
must(sim.e.sim_wing_set_stab(2), 'set acro');
throwAt(40, 16);
const acroLevel = fly(0, 0, 0, 0.75, 1);
const acroHold = fly(0, 0, 0, 0.75, 9, acroLevel.endBank);
check('centred sticks hold the attitude: bank within 3 degrees over 9 s', acroHold.worst * DEG < 3, `${deg(acroHold.worst)} deg`);
check('and the pitch where it was, within 3 degrees', Math.abs((acroHold.endPitch - acroLevel.endPitch) * DEG) < 3, `${deg(acroLevel.endPitch)} -> ${deg(acroHold.endPitch)} deg`);
check('and straight: under 15 m off the line after 10 s', Math.abs(acroHold.y) < 15, `${acroHold.y.toFixed(1)} m`);

throwAt(120, 16);
fly(0, 0, 0, 1.0, 1);
const rolling = fly(1, 0, 0, 1.0, 0.8);
check('full right stick rolls at 102 to 132 degrees a second', rolling.p * DEG > 102 && rolling.p * DEG < 132, `${deg(rolling.p)} deg/s`);
/* A longer hold than the Timber's quarter second: at 120 deg/s it takes
 * 1.3 s to pass 150. */
const inverted = fly(1, 0, 0, 1.0, 0.5);
const invHold = fly(0, 0, 0, 1.0, 0.3);
const invLater = fly(0, 0, 0, 1.0, 2, invHold.endBank);
check('and it keeps going past the stabilised cap: 150 degrees or more', Math.abs(inverted.endBank) * DEG > 150, `${deg(inverted.endBank)} deg`);
check('centred, it stays where it stopped: within 5 degrees for 2 s', invLater.worst * DEG < 5, `${deg(invHold.endBank)} deg, moved ${deg(invLater.worst)}`);

throwAt(120, 16);
fly(0, 0, 0, 1.0, 1);
const partial = fly(0.6, 0, 0, 1.0, 0.5);
const stop = fly(0, 0, 0, 1.0, 0.25);
const stopHeld = fly(0, 0, 0, 1.0, 3, stop.endBank);
check('a partial roll stops sharply: rate under 10 degrees a second 0.25 s after centring', Math.abs(stop.p * DEG) < 10, `${deg(stop.p)} deg/s`);
check('within about 5 degrees of where the stick was centred', Math.abs((stop.endBank - partial.endBank) * DEG) < 6, `${deg(partial.endBank)} -> ${deg(stop.endBank)} deg`);
check('and holds that bank, no levelling, within 4 degrees over 3 s', stop.endBank * DEG > 15 && stopHeld.worst * DEG < 4, `${deg(stop.endBank)} deg, moved ${deg(stopHeld.worst)}`);

throwAt(120, 16);
fly(0, 0, 0, 1.0, 1);
const pulling = fly(0, 1, 0, 1.0, 0.5);
check('full up stick pitches at 45 to 71 degrees a second', pulling.q * DEG > 45 && pulling.q * DEG < 71, `${deg(pulling.q)} deg/s`);
throwAt(120, 16);
fly(0, 0, 0, 1.0, 1);
fly(0, 0.5, 0, 1.0, 0.45);
const pitched = fly(0, 0, 0, 1.0, 0.3);
const pitchHeld = fly(0, 0, 0, 1.0, 2);
check('a nose up input is held, not trimmed away: within 4 degrees over 2 s', pitched.endPitch * DEG > 8 && Math.abs((pitchHeld.endPitch - pitched.endPitch) * DEG) < 4, `${deg(pitched.endPitch)} -> ${deg(pitchHeld.endPitch)} deg`);

throwAt(120, 16);
fly(0, 0, 0, 0.75, 1);
const beforeYaw = fly(0, 0, 0, 0.75, 0.5);
const acroYaw = fly(0, 0, 1, 0.75, 1);
/* Over the whole hold, not its last quarter second: with no turn
 * coordinator in Acro (2026-09-25) the rudder's yaw overshoots and the nose
 * fishtails before it settles, and a quarter second sample can land in the
 * swing back. */
check('full right yaw stick yaws the nose right', acroYaw.rAll * DEG > 3, `${deg(acroYaw.rAll)} deg/s over the hold`);
check('and the roll lock holds the bank against it, within 5 degrees', Math.abs((acroYaw.endBank - beforeYaw.endBank) * DEG) < 5, `${deg(beforeYaw.endBank)} -> ${deg(acroYaw.endBank)} deg`);

console.log('manual');
must(sim.e.sim_wing_set_stab(0), 'clear stab');
throwAt(40, 16);
const manual = fly(1, 0, 0, 0.75, 1.5);
check('with the stabiliser off, full stick rolls past the 60 degree cap', manual.worstBank * DEG > 70, `${deg(manual.worstBank)} deg in 1.5 s`);
must(sim.reset(), 'reset');
check('a reset keeps the setting', sim.e.sim_wing_stab() === 0);

console.log('surfaces');
throwAt(30, 13);
const A = 19.8769 * Math.PI / 180;
const T = 25.8721 * Math.PI / 180;
const R = 12.1224 * Math.PI / 180;
const close = (a, b) => Math.abs(a - b) < 1e-12;
fly(1, 0, 0, 0.5, 0.02);
let sf = surfaces();
check('full right roll: right aileron trailing edge up 19.9 degrees, left down 19.9', close(sf[1], A) && close(sf[0], -A) && sf[2] === 0 && sf[3] === 0, sf.map(deg).join(' '));
const ws = wingSurfaces();
check('and sim_wing_surfaces reads the same two ailerons', ws[0] === sf[0] && ws[1] === sf[1], ws.map(deg).join(' '));
fly(0, 1, 0, 0.5, 0.02);
sf = surfaces();
check('full up: elevator trailing edge up 25.9 degrees, ailerons still', close(sf[2], T) && sf[0] === 0 && sf[1] === 0, sf.map(deg).join(' '));
fly(0, 0, 1, 0.5, 0.02);
sf = surfaces();
check('full right yaw: rudder trailing edge right, 12.1 degrees negative', close(sf[3], -R), sf.map(deg).join(' '));
fly(0, 0, -0.5, 0.5, 0.02);
sf = surfaces();
check('half left yaw: rudder trailing edge left, positive, with expo', sf[3] > 0 && sf[3] < 0.5 * R, sf.map(deg).join(' '));
check('a null pointer is refused', sim.e.sim_plane_surfaces(0) !== SIM_OK);


console.log('flaps');
{
  const notchOf = (n) => sim.e.sim_wing_set_flaps(n);
  must(sim.e.sim_wing_set_stab(0), 'manual');
  check('a notch outside 0 to 2 is refused', notchOf(3) !== SIM_OK && notchOf(-1) !== SIM_OK);
  check('so is a slat setting other than 0 or 1', sim.e.sim_wing_set_slats(2) !== SIM_OK);
  sim.flapNotch = 0;
  throwAt(40, 14);
  fly(0, 0, 0, 0.65, 0.5);
  check('flaps up read zero', sim.e.sim_wing_flaps() === 0, `${sim.e.sim_wing_flaps()}`);
  must(notchOf(2), 'full');
  let t = 0;
  while (sim.e.sim_wing_flaps() < 0.61297025535 && t < 5) {
    fly(0, 0, 0, 0.65, 0.02);
    t += 0.02;
  }
  check('full flaps take the slow servos\' 3 s to come down', t > 2.9 && t < 3.1, `${t.toFixed(2)} s to ${deg(sim.e.sim_wing_flaps())} deg`);
  must(notchOf(1), 'half');
  fly(0, 0, 0, 0.65, 3);
  check('and half is 16.3 degrees, FMS\'s 22 mm', Math.abs(sim.e.sim_wing_flaps() * DEG - 16.335) < 0.01, `${deg(sim.e.sim_wing_flaps())} deg`);
  fly(0, 0, 0, 0.65, 0.02);
  check('with no mix in the elevator: FMS gives none', Math.abs(surfaces()[2]) < 1e-12, `elevator ${deg(surfaces()[2])} deg`);
  must(notchOf(2), 'full');
  must(sim.reset(), 'reset');
  check('a reset keeps the notch and puts the flaps there at once', Math.abs(sim.e.sim_wing_flaps() - 0.61297025535831962) < 1e-9, `${deg(sim.e.sim_wing_flaps())} deg`);
  must(sim.e.sim_set_airframe(TIMBER_AIRFRAME), 'timber');
  check('an airframe change raises them', sim.e.sim_wing_flaps() === 0);
  must(sim.e.sim_set_airframe(P51_AIRFRAME), 'p51');
  check('back on the P-51 the notch is up', sim.e.sim_wing_flaps() === 0);
  must(sim.e.sim_set_ground(0, 0, 0, 1, 0, 0, 0, GROUND_MU, GROUND_E), 'ground off');

  must(sim.e.sim_wing_set_stab(1), 'stabilised');
  sim.flapNotch = 2;
  throwAt(40, 12);
  const slow = fly(0, 0, 0, 0.7, 10);
  check('Stabilised on full flaps: centred sticks fly level, bank within 3 degrees', Math.abs(slow.bank * DEG) < 3 && slow.worstBank * DEG < 8, `${deg(slow.bank)} deg, worst ${deg(slow.worstBank)}`);
  check('at the trim pitch within 4 degrees, slowly', Math.abs(slow.pitch * DEG - 2) < 4 && slow.v < 15, `${deg(slow.pitch)} deg at ${slow.v.toFixed(1)} m/s`);
  const slowBank = fly(1, 0, 0, 0.9, 4);
  check('and full right stick still banks 50 to 65 degrees', slowBank.bank * DEG > 50 && slowBank.bank * DEG < 65, `${deg(slowBank.bank)} deg`);

  must(sim.e.sim_wing_set_stab(2), 'acro');
  sim.flapNotch = 0;
  throwAt(60, 16);
  const before = fly(0, 0, 0, 0.75, 1);
  must(notchOf(2), 'full');
  const during = fly(0, 0, 0, 0.75, 3, before.endBank);
  check('Acro holds its attitude while the flaps come down: pitch within 5 degrees', Math.abs((during.endPitch - before.endPitch) * DEG) < 5, `${deg(before.endPitch)} -> ${deg(during.endPitch)} deg`);
  check('and the bank within 3 degrees', during.worst * DEG < 3, `moved ${deg(during.worst)}`);
  must(notchOf(0), 'up');
  sim.flapNotch = 0;
  must(sim.e.sim_wing_set_stab(0), 'manual');
  must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, GROUND_MU, GROUND_E), 'ground');
}

console.log('on the wheels');
const heading = (s) => Math.atan2(2 * (s[7] * s[10] + s[8] * s[9]), 1 - 2 * (s[9] * s[9] + s[10] * s[10]));
/* The P-51 standing at the end of the strip in a mode, then sticks from a
 * function of the time, for a while. Records what the checks need; stops
 * early once the aircraft has been off its wheels for untilAirborneMs. */
function onGround(mode) {
  must(sim.e.sim_wing_set_stab(mode), 'set mode');
  must(sim.reset(), 'reset');
  clockMs = 0;
  p51GroundPrelude(sim, { mu: GROUND_MU, e: GROUND_E });
  must(sim.reset(), 'reset');
  p51GroundPrelude(sim, { mu: GROUND_MU, e: GROUND_E });
}
function roll(sticks, seconds, { untilAirborneMs = null } = {}) {
  const out = { worstSurf: [0, 0, 0, 0], worstBank: 0, worstY: 0, liftoff: null, last: null, airborneMs: 0, s: null };
  for (let ms = 0; ms < seconds * 1000; ms += RC_STEP_MS) {
    must(sim.input((clockMs + ms) / 1000, ...sticks(ms)), 'input');
    must(sim.step(RC_STEP_MS), 'step');
    const s = sim.readState().state;
    out.s = s;
    const sf = surfaces();
    for (let i = 0; i < 4; i += 1) out.worstSurf[i] = Math.max(out.worstSurf[i], Math.abs(sf[i]));
    const loaded = wheelLoads(sim).some((f) => f > 0);
    if (loaded) {
      /* The last moment on the wheels: the liftoff, once it stays off. */
      out.last = { x: s[1], v: Math.hypot(s[4], s[5], s[6]), heading: heading(s), pitch: attitude(s).pitch, ms };
    }
    if (out.liftoff === null) {
      out.worstBank = Math.max(out.worstBank, Math.abs(fullBank(s)));
      out.worstY = Math.max(out.worstY, Math.abs(s[2]));
    }
    if (!loaded) {
      out.airborneMs += RC_STEP_MS;
      if (out.liftoff === null && out.airborneMs >= 200) {
        out.liftoff = out.last;
      }
      if (untilAirborneMs !== null && out.airborneMs >= untilAirborneMs) {
        clockMs += ms + RC_STEP_MS;
        return out;
      }
    } else {
      out.airborneMs = 0;
    }
  }
  clockMs += seconds * 1000;
  return out;
}

for (const [mode, name] of [[1, 'Stabilised'], [2, 'Acro']]) {
  onGround(mode);
  const rest0 = sim.readState().state;
  const sit = roll(() => [0, 0, 0, 0], 5);
  const moved = Math.abs(attitude(sit.s).pitch - attitude(rest0).pitch) * DEG;
  check(`${name}, sitting on the grass for 5 s: every surface where the centred sticks put it`, sit.worstSurf.every((x) => x === 0), sit.worstSurf.map(deg).join(' '));
  check('and the aircraft has not moved: pitch within 0.5 degrees, still on its wheels', moved < 0.5 && wheelLoads(sim).slice(0, 3).every((f) => f > 0), `moved ${moved.toFixed(2)} deg`);
  const held = roll((ms) => [ms < 2000 ? 1 : 0, ms < 2000 ? 1 : 0, 0, 0], 2.02);
  const sf = surfaces();
  check('full right and up stick held 2 s on the ground is full aileron and elevator, nothing more', Math.abs(held.worstSurf[1] - A) < 1e-9 && Math.abs(held.worstSurf[2] - T) < 1e-9 && sf.every((x) => x === 0), `${held.worstSurf.map(deg).join(' ')}, then ${sf.map(deg).join(' ')}`);
  check('and no wind up: released, every surface is back at zero on the next step', sf.every((x) => x === 0), sf.map(deg).join(' '));
}

/* The take off roll: full throttle, the stick forward to raise the tail
 * and back at rotation as p51TakeoffSticks flies it, the wings held on the
 * ailerons. With the rudder left alone it swings left in every mode, since
 * on its wheels the stabiliser is not flying it; with the take off pilot's
 * right rudder it tracks the runway. */
for (const [mode, name] of [[0, 'Manual'], [1, 'Stabilised'], [2, 'Acro']]) {
  for (const feet of [false, true]) {
    onGround(mode);
    roll(() => [0, 0, 0, 0], 1);
    const run = roll((ms) => {
      const st = p51TakeoffSticks(sim.readState().state, ms);
      return feet ? st : [st[0], st[1], 0, st[3]];
    }, 8, { untilAirborneMs: 2000 });
    const lof = run.liftoff;
    check(`${name}, ${feet ? 'the rudder flown' : 'the rudder left alone'}: it flies off the strip`, lof !== null, lof ? `at ${lof.x.toFixed(1)} m and ${lof.v.toFixed(1)} m/s` : 'never left the ground');
    if (!lof) continue;
    if (feet) {
      check('with right rudder it tracks: heading within 5 degrees and under 1 m off the line at liftoff', Math.abs(lof.heading * DEG) < 5 && run.worstY < 1, `heading ${deg(lof.heading)} deg, ${run.worstY.toFixed(2)} m off`);
    } else {
      check('it swings left: heading over 3 degrees left at liftoff', lof.heading * DEG > 3, `heading ${deg(lof.heading)} deg`);
    }
    check('wings level the whole roll: bank under 5 degrees to liftoff', run.worstBank * DEG < 5, `${deg(run.worstBank)} deg`);
    if (mode === 2 && feet) {
      const after = roll(() => [0, 0, 0, 1], 2);
      check('and Acro holds the attitude it lifted off in, pitch within 4 degrees 2 s later', Math.abs((attitude(after.s).pitch - lof.pitch) * DEG) < 4, `${deg(lof.pitch)} -> ${deg(attitude(after.s).pitch)} deg`);
    }
  }
}

for (const [mode, name] of [[1, 'Stabilised'], [2, 'Acro']]) {
  onGround(mode);
  roll(() => [0, 0, 0, 0.3], 2);
  /* Summed step by step, as the Timber's. */
  let prevH = heading(sim.readState().state);
  let turnedRad = 0;
  let taxi = null;
  for (let i = 0; i < 40; i += 1) {
    taxi = roll(() => [0, 0, 1, 0.3], 0.1);
    const h = heading(taxi.s);
    turnedRad += Math.atan2(Math.sin(h - prevH), Math.cos(h - prevH));
    prevH = h;
  }
  const turned = turnedRad * DEG;
  check(`${name}, taxiing: full right yaw stick steers the tailwheel right, over 45 degrees in 4 s`, turned < -45 && wheelLoads(sim).slice(0, 3).every((f) => f > 0), `${turned.toFixed(0)} deg`);
}

console.log('retracts');
{
  must(sim.e.sim_wing_set_stab(0), 'manual');
  check('a gear switch other than 0 or 1 is refused', sim.e.sim_wing_set_gear(2) !== SIM_OK && sim.e.sim_wing_set_gear(-1) !== SIM_OK);
  must(sim.e.sim_set_airframe(TIMBER_AIRFRAME), 'timber');
  check('the Timber, on fixed gear, refuses gear up and takes gear down', sim.e.sim_wing_set_gear(1) !== SIM_OK && sim.e.sim_wing_set_gear(0) === SIM_OK && sim.e.sim_wing_gear() === 0);
  must(sim.e.sim_set_airframe(P51_AIRFRAME), 'p51');
  onGround(0);
  roll(() => [0, 0, 0, 0], 1);
  check('standing, the gear is down and locked', sim.e.sim_wing_gear() === 0 && wheelLoads(sim).slice(0, 3).every((f) => f > 0));
  must(sim.e.sim_wing_set_gear(1), 'gear up');
  const folding = roll(() => [0, 0, 0, 0], 0.1);
  check('selected up on the ground, the wheels let go at once: it sits on its belly', wheelLoads(sim).slice(0, 3).every((f) => f === 0) && folding.s[3] < 0.2, `CG ${folding.s[3].toFixed(3)} m, gear ${sim.e.sim_wing_gear().toFixed(3)}`);
  const belly = roll(() => [0, 0, 0, 0], 3);
  check('and comes to rest on the scoop and the prop, not the wheels', sim.e.sim_ground_contacts() > 0 && wheelLoads(sim).slice(0, 3).every((f) => f === 0), `hull ${sim.e.sim_ground_contacts()}, prop ${wheelLoads(sim)[3].toFixed(1)} N, CG ${belly.s[3].toFixed(3)} m`);
  must(sim.reset(), 'reset');
  check('a reset puts the gear down and locked', sim.e.sim_wing_gear() === 0);
  throwAt(60, 16);
  must(sim.e.sim_wing_set_gear(1), 'gear up');
  fly(0, 0, 0, 0.75, 3);
  const half = sim.e.sim_wing_gear();
  check('in the air, half way up after 3 s', Math.abs(half - 0.5) < 0.01, `${half.toFixed(3)}`);
  must(sim.e.sim_set_airframe(TIMBER_AIRFRAME), 'timber');
  must(sim.e.sim_set_airframe(P51_AIRFRAME), 'p51');
  check('an airframe change puts it down and locked', sim.e.sim_wing_gear() === 0);
  /* The slots the table has no aircraft in yet, off the table, so a plane
   * that lands in one of them is not counted as a slot left empty. */
  const flown = new Set(AIRFRAMES.map((a) => a.simId));
  const slots = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24].filter((id) => !flown.has(id));
  const empty = slots.filter((id) => sim.e.sim_set_airframe(id) === SIM_OK);
  check('the slots reserved for the other new aircraft, and past the end, are refused while empty', empty.length === 0 && sim.e.sim_airframe() === P51_AIRFRAME, empty.length ? `accepted ${empty.join(' ')}` : '');
}

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
