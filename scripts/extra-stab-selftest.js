/*
 * extra-stab-selftest.js: the Extra 300's stabiliser, AS3X, rudder and
 * surface readback, in the air and on its wheels, in Node.
 *
 * The Cub's checks (cub-stab-selftest.js) on the Extra's own gains and
 * throws, two and a half times the Cub's: Stabilised flies level with the
 * sticks centred and holds the bank and pitch asked for; AS3X, the mode
 * the Extra ships in, rolls and pitches at full stick as fast as Manual,
 * levels nothing, and damps what it is left with; the rudder is the yaw
 * stick in every mode. On its wheels the surfaces stay where the
 * sticks put them, a take off roll with the sticks centred flies off, and
 * the yaw stick steers the tailwheel. Last, the four surface angles the
 * renderer reads and their signs. Run with npm run extra:stab.
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

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { GROUND_MU, GROUND_E } from '../src/game/collide.js';
import { attitude, must, extraPrelude, extraGroundPrelude, wheelLoads, wingDebug, RC_STEP_MS, rudderHold } from '../tests/lib/wingpilot.js';

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
  extraPrelude(sim);
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
throwAt(3, 12);
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
/* The coordinator's gain is the Cub's over a rudder twelve times its
 * authority; the stick still wins. */
check('full right yaw stick wins over the coordinator: rudder right of half its throw', surfaces()[3] * DEG < -27.5, `rudder ${deg(surfaces()[3])} deg`);
check('and yaws the nose right', yawed.r * DEG > 3, `${deg(yawed.r)} deg/s`);
const unyawed = fly(0, 0, 0, 0.75, 4);
check('and letting go of it levels the wings again', Math.abs(unyawed.bank * DEG) < 4, `${deg(unyawed.bank)} deg`);

/* AS3X, mode 3, against Manual flown the same way: the receiver's damper
 * fades out as the stick leaves centre (Spektrum's priority), so a full
 * stick is Manual's rate, no cap; nothing levels it; and centred, it damps
 * the rate the aircraft is left with harder than the airframe alone. */
/* The lead in is flown in Manual and the mode set at the step, so both
 * meet the stick from the same state. */
function bothModes(fn) {
  const out = {};
  for (const [mode, name] of [[0, 'manual'], [3, 'as3x']]) {
    must(sim.e.sim_wing_set_stab(0), 'set manual');
    out[name] = fn(() => must(sim.e.sim_wing_set_stab(mode), 'set mode'));
  }
  return out;
}
console.log('as3x');
const rollRates = bothModes((mode) => {
  throwAt(120, 16);
  fly(0, 0, 0, 1.0, 1);
  mode();
  return fly(1, 0, 0, 1.0, 0.5).p;
});
check('full right stick rolls at Manual\'s rate, within 2 percent: no cap', Math.abs(rollRates.as3x / rollRates.manual - 1) < 0.02, `${deg(rollRates.as3x)} against ${deg(rollRates.manual)} deg/s`);
const pullRates = bothModes((mode) => {
  throwAt(120, 16);
  fly(0, 0, 0, 1.0, 1);
  mode();
  return fly(0, 1, 0, 1.0, 0.5).q;
});
check('full up stick pitches at Manual\'s rate, within 2 percent: no cap', Math.abs(pullRates.as3x / pullRates.manual - 1) < 0.02, `${deg(pullRates.as3x)} against ${deg(pullRates.manual)} deg/s`);
const released = bothModes((mode) => {
  throwAt(120, 16);
  fly(0, 0, 0, 1.0, 1);
  mode();
  fly(0, 1, 0, 1.0, 0.3);
  return Math.abs(fly(0, 0, 0, 1.0, 0.1).q);
});
check('centred after a pull, the pitch rate 0.1 s on is below Manual\'s: it damps', released.as3x < released.manual, `${deg(released.as3x)} against ${deg(released.manual)} deg/s`);
must(sim.e.sim_wing_set_stab(3), 'set as3x');
throwAt(120, 16);
fly(0, 0, 0, 1.0, 1);
fly(0.35, 0, 0, 1.0, 0.5);
const leftIn = fly(0, 0, 0, 1.0, 0.3);
const bankLeft = fly(0, 0, 0, 1.0, 2);
check('a bank it is left in is not levelled: still past half of it 2 s on', Math.abs(leftIn.endBank) * DEG > 15 && Math.abs(bankLeft.endBank) > 0.5 * Math.abs(leftIn.endBank), `${deg(leftIn.endBank)} -> ${deg(bankLeft.endBank)} deg`);
const as3xYaw = fly(0, 0, 1, 0.75, 1);
check('full right yaw stick yaws the nose right', as3xYaw.rAll * DEG > 3, `${deg(as3xYaw.rAll)} deg/s over the hold`);

console.log('manual');
must(sim.e.sim_wing_set_stab(0), 'clear stab');
throwAt(3, 12);
const manual = fly(1, 0, 0, 0.75, 1.5);
check('with the stabiliser off, full stick rolls past the 60 degree cap', manual.worstBank * DEG > 70, `${deg(manual.worstBank)} deg in 1.5 s`);
must(sim.reset(), 'reset');
check('a reset keeps the setting', sim.e.sim_wing_stab() === 0);

console.log('surfaces');
throwAt(30, 13);
const A = 36.53 / DEG;
const T = 39.67 / DEG;
const R = 55.05 / DEG;
const close = (a, b) => Math.abs(a - b) < 1e-12;
fly(1, 0, 0, 0.5, 0.02);
let sf = surfaces();
check('full right roll: right aileron trailing edge up 36.5 degrees, left down 36.5', close(sf[1], A) && close(sf[0], -A) && sf[2] === 0 && sf[3] === 0, sf.map(deg).join(' '));
const ws = wingSurfaces();
check('and sim_wing_surfaces reads the same two ailerons', ws[0] === sf[0] && ws[1] === sf[1], ws.map(deg).join(' '));
fly(0, 1, 0, 0.5, 0.02);
sf = surfaces();
check('full up: elevator trailing edge up 39.7 degrees, ailerons still', close(sf[2], T) && sf[0] === 0 && sf[1] === 0, sf.map(deg).join(' '));
fly(0, 0, 1, 0.5, 0.02);
sf = surfaces();
check('full right yaw: rudder trailing edge right, 55 degrees negative', close(sf[3], -R), sf.map(deg).join(' '));
fly(0, 0, -0.5, 0.5, 0.02);
sf = surfaces();
check('half left yaw: rudder trailing edge left, positive, with expo', sf[3] > 0 && sf[3] < 0.5 * R, sf.map(deg).join(' '));
check('a null pointer is refused', sim.e.sim_plane_surfaces(0) !== SIM_OK);

console.log('on the wheels');
const heading = (s) => Math.atan2(2 * (s[7] * s[10] + s[8] * s[9]), 1 - 2 * (s[9] * s[9] + s[10] * s[10]));
/* The Extra standing at the end of the strip in a mode, then sticks from a
 * function of the time, for a while. Records what the checks need; stops
 * early once the aircraft has been off its wheels for untilAirborneMs. */
function onGround(mode) {
  must(sim.e.sim_wing_set_stab(mode), 'set mode');
  must(sim.reset(), 'reset');
  clockMs = 0;
  extraGroundPrelude(sim, { mu: GROUND_MU, e: GROUND_E });
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

for (const [mode, name] of [[1, 'Stabilised'], [3, 'AS3X']]) {
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

/* The take off roll at full throttle. On its wheels every mode flies as
 * Manual, so with the rudder left alone the prop's swirl on the fin swings
 * it left in each (docs/FLIGHTMODEL.md); with the pilot's right rudder
 * holding the runway's heading (rudderHold) it tracks. */
for (const [mode, name] of [[0, 'Manual'], [1, 'Stabilised'], [3, 'AS3X']]) {
  for (const feet of [false, true]) {
    onGround(mode);
    roll(() => [0, 0, 0, 0], 1);
    const run = roll(() => [0, 0, feet ? rudderHold(sim.readState().state) : 0, 1], 8, { untilAirborneMs: 2000 });
    const lof = run.liftoff;
    check(`${name}, full throttle, ${feet ? 'the heading held on the rudder' : 'the sticks centred'}: it flies off the strip`, lof !== null, lof ? `at ${lof.x.toFixed(1)} m and ${lof.v.toFixed(1)} m/s` : 'never left the ground');
    if (!lof) continue;
    if (!feet) {
      check('it swings left: heading left of the runway at liftoff', lof.heading * DEG > 0, `heading ${deg(lof.heading)} deg`);
      continue;
    }
    check('tracking straight: heading within 5 degrees and under 0.5 m off the line at liftoff', Math.abs(lof.heading * DEG) < 5 && run.worstY < 0.5, `heading ${deg(lof.heading)} deg, ${run.worstY.toFixed(2)} m off`);
    check('wings level the whole roll: bank under 5 degrees to liftoff', run.worstBank * DEG < 5, `${deg(run.worstBank)} deg`);
  }
}

/* Taxiing on the Cub's taxi thrust, 1.65 N: 0.21 of the Extra's
 * throttle, where the Cub's check takes 0.35 of its own. */
for (const [mode, name] of [[1, 'Stabilised'], [3, 'AS3X']]) {
  onGround(mode);
  roll(() => [0, 0, 0, 0.21], 2);
  const h0 = heading(sim.readState().state);
  const taxi = roll(() => [0, 0, 1, 0.21], 4);
  const turned = (heading(taxi.s) - h0) * DEG;
  check(`${name}, taxiing: full right yaw stick steers the tailwheel right, over 45 degrees in 4 s`, turned < -45 && wheelLoads(sim).slice(0, 3).every((f) => f > 0), `${turned.toFixed(0)} deg`);
}

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
