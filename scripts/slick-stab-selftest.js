/*
 * slick-stab-selftest.js: the Slick 580's stabiliser, AS3X, rudder and
 * surface readback, in the air and on its wheels, in Node.
 *
 * The Extra's checks (extra-stab-selftest.js) on the Slick's own throws,
 * the data sheet's, and its speeds, a 12.5 kg aircraft's: Stabilised flies
 * level with the sticks centred and holds the bank and pitch asked for;
 * AS3X, the gyro mode it ships in, rolls and pitches at full stick as fast as Manual,
 * levels nothing, and damps what it is left with; the rudder is the yaw
 * stick in every mode. On its wheels the surfaces stay where the
 * sticks put them, a take off roll with the sticks centred flies off, and
 * the yaw stick steers the tailwheel. Last, the four surface angles the
 * renderer reads and their signs. Run with npm run slick:stab.
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
import { attitude, must, slickPrelude, slickGroundPrelude, wheelLoads, wingDebug, RC_STEP_MS, rudderHold } from '../tests/lib/wingpilot.js';

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
  slickPrelude(sim);
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
/* The Extra's speeds as the same multiples of this aircraft's stall,
 * 13.9 m/s against the Extra's 8.5 (npm run slick:derive): its 12 m/s
 * throw, 1.4 Vs, and its 16 m/s pulls, 1.9 Vs. */
const V_LEVEL = 19.5, V_PULL = 26;

console.log('stabilised');
must(sim.e.sim_wing_set_stab(1), 'set stab');
throwAt(3, V_LEVEL);
/* At the stick FW_SLICK2680's stabiliser trims for (stab_trim_throttle,
 * npm run stab:glide): the engine floats on its map, so at 22 m/s a stick
 * of 0.155 turns the prop at the speed that holds it level. */
const level = fly(0, 0, 0, 0.155, 10);
check('centred sticks fly level: bank within 3 degrees', Math.abs(level.bank * DEG) < 3, `${deg(level.bank)} deg`);
check('and never banked past 8 degrees on the way', level.worstBank * DEG < 8, `${deg(level.worstBank)} deg`);
check('and hold the trim pitch within 4 degrees', Math.abs(level.pitch * DEG - 2) < 4, `${deg(level.pitch)} deg`);
/* The Extra's 15 m in 10 s at its 18 m/s, 4.8 deg of track, here at this
 * cruise's speed. */
check('and straight: under 4.8 degrees of track off the line after 10 s', Math.abs(level.y) < 10 * level.v * Math.tan(4.8 / DEG), `${level.y.toFixed(1)} m`);
check('at stab:glide\'s cruise for that stick, 22.35 m/s within 15 percent', level.v > 19.0 && level.v < 25.7, `${level.v.toFixed(1)} m/s`);
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
  throwAt(120, V_PULL);
  fly(0, 0, 0, 1.0, 1);
  mode();
  return fly(1, 0, 0, 1.0, 0.5).p;
});
check('full right stick rolls at Manual\'s rate, within 2 percent: no cap', Math.abs(rollRates.as3x / rollRates.manual - 1) < 0.02, `${deg(rollRates.as3x)} against ${deg(rollRates.manual)} deg/s`);
const pullRates = bothModes((mode) => {
  throwAt(120, V_PULL);
  fly(0, 0, 0, 1.0, 1);
  mode();
  return fly(0, 1, 0, 1.0, 0.5).q;
});
check('full up stick pitches at Manual\'s rate, within 2 percent: no cap', Math.abs(pullRates.as3x / pullRates.manual - 1) < 0.02, `${deg(pullRates.as3x)} against ${deg(pullRates.manual)} deg/s`);
const released = bothModes((mode) => {
  throwAt(120, V_PULL);
  fly(0, 0, 0, 1.0, 1);
  mode();
  fly(0, 1, 0, 1.0, 0.3);
  return Math.abs(fly(0, 0, 0, 1.0, 0.1).q);
});
check('centred after a pull, the pitch rate 0.1 s on is below Manual\'s: it damps', released.as3x < released.manual, `${deg(released.as3x)} against ${deg(released.manual)} deg/s`);
must(sim.e.sim_wing_set_stab(3), 'set as3x');
throwAt(120, V_PULL);
fly(0, 0, 0, 1.0, 1);
fly(0.35, 0, 0, 1.0, 0.5);
const leftIn = fly(0, 0, 0, 1.0, 0.3);
const bankLeft = fly(0, 0, 0, 1.0, 2);
check('a bank it is left in is not levelled: still past half of it 2 s on', Math.abs(leftIn.endBank) * DEG > 15 && Math.abs(bankLeft.endBank) > 0.5 * Math.abs(leftIn.endBank), `${deg(leftIn.endBank)} -> ${deg(bankLeft.endBank)} deg`);
const as3xYaw = fly(0, 0, 1, 0.75, 1);
check('full right yaw stick yaws the nose right', as3xYaw.rAll * DEG > 3, `${deg(as3xYaw.rAll)} deg/s over the hold`);

/* A pull with the power off, the Extra's check of the owner's case
 * (2026-10-09), on a petrol engine. The DA-120 does not stop on the stick:
 * at its idle the 28 x 10 still turns at 1,300 rpm, J Omega 0.93 N m s
 * (slick:derive's j_prop), and pitching the nose up at q yaws it right by
 * J Omega q, a prop turning clockwise from behind. At the break that yaw
 * drops the right wing, as the Extra's touch of right rudder does, and
 * the driven idle's torque with it (the half pull's note below; the run
 * that first showed the gyroscope, docs/SLICK-STAGE1.md). Level at 1.9 Vs, the throttle closed, then the
 * elevator held: a quarter stick, short of the stall, stays wings level; a
 * half stick drops the right wing; a small rudder at the break moves the
 * drop the way it yaws (the handbook's wing drop toward the yaw). In
 * Manual, Acro and AS3X.
 *
 * The engine held at its idle in a 26 m/s glide is driven by the air (the
 * drive's torque, docs/FLIGHTMODEL.md "The prop's torque, from the
 * drive"), and the mount takes that torque the prop's way: a steady roll
 * to the right, 1.3 deg/s with the sticks centred, before any pull. A
 * pilot trims it out on the ailerons, so in Manual the first second holds
 * the wings level on the wings' level law (wingpilot.js loopHold's, -1.2
 * rad and -0.12 p) and the pull flies on the aileron that held them,
 * frozen, so what the pull does to the wings is still the pull's. Acro's
 * and AS3X's sticks are rates: centred, they hold the wings themselves. */
function trimWings(seconds) {
  const total = seconds * 1000;
  let sum = 0;
  let n = 0;
  for (let ms = 0; ms < total; ms += RC_STEP_MS) {
    const s = sim.readState().state;
    const roll = Math.max(-1, Math.min(1, -1.2 * fullBank(s) - 0.12 * s[11]));
    must(sim.input((clockMs + ms) / 1000, roll, 0, 0, 0), 'input');
    must(sim.step(RC_STEP_MS), 'step');
    if (ms >= total - 500) {
      sum += roll;
      n += 1;
    }
  }
  clockMs += total;
  return sum / n;
}
function powerOffPull(mode, pitch, rudder, { prop = true } = {}) {
  must(sim.e.sim_wing_set_stab(mode), 'set mode');
  /* prop false: the idling prop's gyroscope and its torque on the mount
   * taken out (sim_wing_set_gyro, sim_wing_set_mount, measurement switches;
   * the throw's reset puts them back, so they are set after it). */
  throwAt(120, V_PULL);
  if (!prop) {
    must(sim.e.sim_wing_set_gyro(0), 'gyro off');
    must(sim.e.sim_wing_set_mount(0), 'mount off');
  }
  const trim = mode === 0 ? trimWings(1) : (fly(0, 0, 0, 0, 1), 0);
  const lead = fly(trim, pitch, 0, 0, 1.2);
  const after = fly(trim, pitch, rudder, 0, 1.0);
  must(sim.e.sim_wing_set_stab(0), 'set manual');
  return { bank: after.endBank, worst: Math.max(lead.worstBank, after.worstBank), trim };
}
console.log('power off pull');
/* The half stick pull is a zoom: the nose comes up past 60 deg and the
 * speed goes at the top, where the controls lose the air and the wing
 * drops. What drops it is the idling prop: its gyroscope (J Omega q) and
 * the driven idle's torque on the mount. A scratch build with j_prop
 * zeroed and that torque clipped held every mode level to 0.0 deg; with
 * either alone the drop was right in every mode (Manual 33 and 17 deg,
 * Acro 7 and 7, AS3X 1.4 and 1.0, the sticks centred and untrimmed). Acro
 * holds the rate until the ailerons run out of air and the drop comes in
 * the last half second (12 deg). AS3X holds the attitude too (as3x_kh,
 * Spektrum's heading hold) and its drop has only begun at the end (2.4
 * deg): to the right, as the gyro and the torque have it, and less than
 * Acro's. The 3 deg it was held over before came from AS3X fighting a
 * strip aileron reversal in the stall that NACA TR 419 says does not
 * happen (the aero lane's lateral model). */
const halfBank = {};
for (const [mode, name] of [[0, 'Manual'], [2, 'Acro'], [3, 'AS3X']]) {
  /* AS3X holds the attitude here through its Heading, which the AR631
   * has only where a pilot turns it up ("You can increase this value to
   * make the aircraft hold its attitude when control input is neutral";
   * it is "defaulted to zero"): these pulls fly it at the full Heading. */
  must(sim.setHeading(mode === 3 ? [1, 1, 1] : [0, 0, 0]), 'sim_wing_set_heading');
  const quarter = powerOffPull(mode, 0.25, 0);
  if (mode === 0) {
    check('Manual: the idle glide wants a touch of left aileron, against the driven idle prop\'s roll to the right', quarter.trim < 0 && quarter.trim > -0.05, `stick ${quarter.trim.toFixed(4)}`);
  }
  if (mode === 3) {
    /* AS3X holds the heading on the rudder against the precession's yaw,
     * and the rudder's side force over the CG rolls it right: with j_prop
     * zeroed this pull stays within 3 deg (the same scratch build). */
    check(`${name}: a quarter stick pull, power off: the gyro's rudder against the prop's precession rolls it right`, quarter.bank > 0, `${deg(quarter.bank)} deg, ${deg(quarter.worst)} at most`);
  } else {
    /* The floating idle (3,407 rpm on the DA-120's map) turns the prop
     * fast enough that its gyroscope and its spin-down torque on the mount
     * drop the right wing even short of the stall, as P19g reads the
     * P-51's: the drop is asserted to the right, and the same pull with
     * the two taken out (the measurement switches) holds within 3 deg,
     * the airframe's own aero. */
    const bare = powerOffPull(mode, 0.25, 0, { prop: false });
    check(`${name}: a quarter stick pull, power off, short of the stall: the idling prop drops the right wing, the airframe alone within 3 deg`, quarter.bank > 0 && bare.worst * DEG < 3, `${deg(quarter.bank)} deg right with the prop, ${deg(bare.worst)} at most without`);
  }
  const half = powerOffPull(mode, 0.5, 0);
  halfBank[mode] = half.bank;
  if (mode === 3) {
    check(`${name}: a half stick pull through the stall at idle, no rudder: the gyro holds the wings until the air goes, the drop right and under Acro's`, half.bank > 0 && half.bank < halfBank[2], `${deg(half.bank)} deg against Acro's ${deg(halfBank[2])}`);
  } else {
    check(`${name}: a half stick pull through the stall at idle, no rudder: the idling prop's gyroscope and torque drop the right wing`, half.bank * DEG > 3, `${deg(half.bank)} deg`);
  }
  const left = powerOffPull(mode, 0.5, -0.05);
  const right = powerOffPull(mode, 0.5, 0.05);
  check(`${name}: a touch of left rudder takes the drop left of it, right rudder right of it`, left.bank < half.bank && right.bank > half.bank, `${deg(left.bank)}, ${deg(half.bank)} and ${deg(right.bank)} deg`);
}
must(sim.setHeading([0, 0, 0]), 'sim_wing_set_heading');

console.log('manual');
must(sim.e.sim_wing_set_stab(0), 'clear stab');
throwAt(3, V_LEVEL);
const manual = fly(1, 0, 0, 0.75, 1.5);
check('with the stabiliser off, full stick rolls past the 60 degree cap', manual.worstBank * DEG > 70, `${deg(manual.worstBank)} deg in 1.5 s`);
must(sim.reset(), 'reset');
check('a reset keeps the setting', sim.e.sim_wing_stab() === 0);

console.log('surfaces');
throwAt(30, 13);
const A = 37.5 / DEG;
const T = 47.5 / DEG;
const R = 45.0 / DEG;
const close = (a, b) => Math.abs(a - b) < 1e-12;
fly(1, 0, 0, 0.5, 0.02);
let sf = surfaces();
check('full right roll: right aileron trailing edge up 37.5 degrees, left down 37.5', close(sf[1], A) && close(sf[0], -A) && sf[2] === 0 && sf[3] === 0, sf.map(deg).join(' '));
const ws = wingSurfaces();
check('and sim_wing_surfaces reads the same two ailerons', ws[0] === sf[0] && ws[1] === sf[1], ws.map(deg).join(' '));
fly(0, 1, 0, 0.5, 0.02);
sf = surfaces();
check('full up: elevator trailing edge up 47.5 degrees, ailerons still', close(sf[2], T) && sf[0] === 0 && sf[1] === 0, sf.map(deg).join(' '));
fly(0, 0, 1, 0.5, 0.02);
sf = surfaces();
check('full right yaw: rudder trailing edge right, 45 degrees negative', close(sf[3], -R), sf.map(deg).join(' '));
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
  slickGroundPrelude(sim, { mu: GROUND_MU, e: GROUND_E });
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

/* Taxiing on the idle: the DA-120's 12 N at 1,300 rpm already rolls it
 * against the grass (the Extra's check taxies on the Cub's 1.65 N). */
for (const [mode, name] of [[1, 'Stabilised'], [3, 'AS3X']]) {
  onGround(mode);
  roll(() => [0, 0, 0, 0], 2);
  const h0 = heading(sim.readState().state);
  const taxi = roll(() => [0, 0, 1, 0], 4);
  const turned = (heading(taxi.s) - h0) * DEG;
  /* The Extra's 45 deg in 4 s on its 0.98 m wheelbase; at the same speed
   * and tailwheel angle a turn's rate goes as one over the wheelbase, the
   * Slick's 1.69 m (npm run slick:derive): 26 deg. */
  check(`${name}, taxiing: full right yaw stick steers the tailwheel right, over 26 degrees in 4 s`, turned < -26 && wheelLoads(sim).slice(0, 3).every((f) => f > 0), `${turned.toFixed(0)} deg`);
}

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
