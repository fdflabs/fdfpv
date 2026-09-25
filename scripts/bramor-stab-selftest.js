/*
 * bramor-stab-selftest.js: the Bramor's stabiliser, acro, elevons and
 * parachute switch, in Node.
 *
 * The same stabiliser as the other fixed wings' (src/native/plant_wing.c)
 * with the Bramor's own gains and limits, held to the flying wing's bar
 * (scripts/wing-stab-selftest.js) where the aircraft can reach it and to
 * its own derivation where it cannot: a 4.5 kg survey wing cruising at 1.23
 * times its stall does not pitch at a hundred degrees a second, and the
 * Stabilised bank cap is 45 degrees rather than 60, a survey autopilot's.
 * Stabilised flies level off the catapult with the sticks centred and
 * holds the bank and pitch asked for; Acro holds the attitude it is left
 * at and holds inverted; Manual rolls past the cap. Then the elevons'
 * readback and signs, and the chute as a switch: refused where there is
 * none, and pulled, it stops the motor and centres the surfaces in every
 * mode, and a reset or an airframe change stows it. Run with
 * npm run bramor:stab.
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
import {
  attitude, must, bramorPrelude, catapultRelease, BRAMOR_AIRFRAME, SKY_AIRFRAME, RC_STEP_MS,
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

let clockMs = 0;
/* Off the catapult, or level at a height for the manoeuvres. */
function launch() {
  must(sim.reset(), 'reset');
  clockMs = 0;
  bramorPrelude(sim);
}
function launchHigh(speed = 18) {
  must(sim.reset(), 'reset');
  clockMs = 0;
  bramorPrelude(sim);
  must(sim.e.sim_set_pose(0, 0, 150, 1, 0, 0, 0), 'pose');
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
 * body rates over the last quarter second (roll right and nose up
 * positive), and the end state. */
function fly(roll, pitch, duty, seconds, refBank = null) {
  const total = seconds * 1000;
  let worstBank = 0;
  let worst = 0;
  let sumBank = 0;
  let sumPitch = 0;
  let n = 0;
  let sumP = 0;
  let sumQ = 0;
  let m = 0;
  let s = null;
  for (let ms = 0; ms < total; ms += RC_STEP_MS) {
    must(sim.input((clockMs + ms) / 1000, roll, pitch, 0, duty), 'input');
    must(sim.step(RC_STEP_MS), 'step');
    s = sim.readState().state;
    const bank = fullBank(s);
    worstBank = Math.max(worstBank, Math.abs(bank));
    if (refBank !== null) {
      let d = bank - refBank;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      worst = Math.max(worst, Math.abs(d));
    }
    if (ms >= total - Math.min(1000, total)) {
      sumBank += bank;
      sumPitch += attitude(s).pitch;
      n += 1;
    }
    if (ms >= total - 250) {
      sumP += s[11];
      sumQ += -s[12];
      m += 1;
    }
  }
  clockMs += total;
  return {
    bank: sumBank / n, endBank: fullBank(s), pitch: sumPitch / n, endPitch: attitude(s).pitch, worstBank, worst,
    p: sumP / m, q: sumQ / m, v: Math.hypot(s[4], s[5], s[6]), vz: s[6], z: s[3], y: s[2], rpm: s[14],
  };
}
const deg = (x) => (x * DEG).toFixed(1);

console.log('stabilised');
must(sim.e.sim_wing_set_stab(1), 'set stab');
launch();
const level = fly(0, 0, 0.7, 12);
check('off the catapult, centred sticks fly level: bank within 3 degrees', Math.abs(level.bank * DEG) < 3, `${deg(level.bank)} deg`);
check('and never banked past 8 degrees on the way', level.worstBank * DEG < 8, `${deg(level.worstBank)} deg`);
check('and hold the trim pitch within 4 degrees', Math.abs(level.pitch * DEG - 2) < 4, `${deg(level.pitch)} deg`);
check('and straight: under 15 m off the line after 12 s', Math.abs(level.y) < 15, `${level.y.toFixed(1)} m`);
check('at a cruising speed, 14 to 20 m/s', level.v > 14 && level.v < 20, `${level.v.toFixed(1)} m/s`);
check('with the climb rate under 2 m/s', Math.abs(level.vz) < 2, `${level.vz.toFixed(2)} m/s`);
const banked = fly(1, 0, 0.9, 4);
check('full right stick banks right, 38 to 50 degrees', banked.bank * DEG > 38 && banked.bank * DEG < 50, `${deg(banked.bank)} deg`);
const rolledBack = fly(0, 0, 0.7, 4);
check('letting go levels it within 4 s', Math.abs(rolledBack.bank * DEG) < 4, `${deg(rolledBack.bank)} deg`);
const leftBank = fly(-0.5, 0, 0.8, 4);
check('half left stick banks left about 22 degrees', leftBank.bank * DEG < -15 && leftBank.bank * DEG > -29, `${deg(leftBank.bank)} deg`);
fly(0, 0, 0.7, 3);
const nosedUp = fly(0, 0.8, 1.0, 3);
check('up stick lifts the nose, 8 to 22 degrees, no tumble', nosedUp.pitch * DEG > 8 && nosedUp.pitch * DEG < 22 && nosedUp.worstBank * DEG < 20, `${deg(nosedUp.pitch)} deg, bank ${deg(nosedUp.worstBank)}`);
const settled = fly(0, 0, 0.7, 5);
check('and centring brings it back to trim', Math.abs(settled.pitch * DEG - 2) < 4 && Math.abs(settled.bank * DEG) < 4, `pitch ${deg(settled.pitch)}, bank ${deg(settled.bank)}`);

console.log('acro');
must(sim.e.sim_wing_set_stab(2), 'set acro');
launchHigh(17);
const acroLevel = fly(0, 0, 0.7, 1);
const acroHold = fly(0, 0, 0.7, 9, acroLevel.endBank);
check('centred sticks hold the attitude: bank within 3 degrees over 9 s', acroHold.worst * DEG < 3, `${deg(acroHold.worst)} deg`);
check('and the pitch where it was, within 3 degrees', Math.abs((acroHold.endPitch - acroLevel.endPitch) * DEG) < 3, `${deg(acroLevel.endPitch)} -> ${deg(acroHold.endPitch)} deg`);
check('and straight: under 15 m off the line', Math.abs(acroHold.y) < 15, `${acroHold.y.toFixed(1)} m`);

launchHigh(20);
fly(0, 0, 0.9, 1);
const rolling = fly(1, 0, 0.9, 0.8);
check('full right stick rolls at 70 to 100 degrees a second', rolling.p * DEG > 70 && rolling.p * DEG < 100, `${deg(rolling.p)} deg/s`);
/* A roll at 90 deg/s takes two seconds to reach inverted, and a wing this
 * heavy drops its nose through them, so it is flown the way a pilot flies
 * a slow roll: from a 25 degree climb at speed, with a little down stick
 * through the inverted half. */
launchHigh(24);
fly(0, 0.8, 1.0, 0.8);
fly(0, 0, 1.0, 0.4);
fly(1, 0, 1.0, 1.0);
const inverted = fly(1, -0.4, 1.0, 1.0);
const invHold = fly(0, 0, 1.0, 0.3);
const invLater = fly(0, 0, 1.0, 2, invHold.endBank);
check('and it keeps going past the stabilised cap: 150 degrees or more', Math.abs(inverted.endBank) * DEG > 150, `${deg(inverted.endBank)} deg`);
check('centred, it stays where it stopped: within 5 degrees for 2 s', invLater.worst * DEG < 5, `${deg(invHold.endBank)} deg, moved ${deg(invLater.worst)}, pitch ${deg(invHold.endPitch)} -> ${deg(invLater.endPitch)}`);

launchHigh(20);
fly(0, 0, 0.9, 1);
const partial = fly(0.6, 0, 0.9, 0.5);
const stop = fly(0, 0, 0.9, 0.3);
const stopHeld = fly(0, 0, 0.9, 3, stop.endBank);
check('a partial roll stops: rate under 10 degrees a second 0.3 s after centring', Math.abs(stop.p * DEG) < 10, `${deg(stop.p)} deg/s`);
check('within about 5 degrees of where the stick was centred', Math.abs((stop.endBank - partial.endBank) * DEG) < 6, `${deg(partial.endBank)} -> ${deg(stop.endBank)} deg`);
check('and holds that bank, no levelling, within 4 degrees over 3 s', stop.endBank * DEG > 15 && stopHeld.worst * DEG < 4, `${deg(stop.endBank)} deg, moved ${deg(stopHeld.worst)}`);

launchHigh(20);
fly(0, 0, 0.9, 1);
const pulling = fly(0, 1, 0.9, 0.5);
check('full up stick pitches at 25 to 45 degrees a second, what the wing has at 20 m/s', pulling.q * DEG > 25 && pulling.q * DEG < 45, `${deg(pulling.q)} deg/s`);
launchHigh(20);
fly(0, 0, 0.9, 1);
fly(0, 0.6, 0.9, 0.5);
const pitched = fly(0, 0, 0.9, 0.3);
const pitchHeld = fly(0, 0, 0.9, 2);
check('a nose up input is held, not trimmed away: within 4 degrees over 2 s', pitched.endPitch * DEG > 6 && Math.abs((pitchHeld.endPitch - pitched.endPitch) * DEG) < 4, `${deg(pitched.endPitch)} -> ${deg(pitchHeld.endPitch)} deg`);

console.log('manual');
must(sim.e.sim_wing_set_stab(0), 'clear stab');
launch();
fly(0, 0, 1.0, 2);
const manual = fly(1, 0, 0.9, 2);
check('with the stabiliser off, full stick rolls past the 45 degree cap', manual.worstBank * DEG > 60, `${deg(manual.worstBank)} deg in 2 s`);
must(sim.reset(), 'reset');
check('a reset keeps the setting', sim.e.sim_wing_stab() === 0);

console.log('elevons');
launchHigh(18);
const A = 10 / DEG;
const E = 6 / DEG;
const close = (a, b) => Math.abs(a - b) < 1e-12;
fly(1, 0, 0.5, 0.02);
let sf = surfaces();
check('full right roll: right elevon trailing edge up 10 degrees, left down 10', close(sf[1], A) && close(sf[0], -A) && sf[2] === 0 && sf[3] === 0, sf.map(deg).join(' '));
fly(0, 1, 0.5, 0.02);
sf = surfaces();
check('full up: both elevons trailing edge up 6 degrees', close(sf[0], E) && close(sf[1], E), sf.map(deg).join(' '));
fly(0, 0, 0.5, 0.02);
fly(1, 1, 0.5, 0.02);
sf = surfaces();
check('full right and up together: 16 and -4, inside the 16 degree clip', close(sf[1], A + E) && close(sf[0], E - A), sf.map(deg).join(' '));
fly(0, 0, 0.5, 0.02);
fly(0, 0, 1, 0.02);
sf = surfaces();
check('full yaw stick moves nothing: a flying wing has no rudder', sf.every((x) => x === 0), sf.map(deg).join(' '));

console.log('the chute as a switch');
for (const [mode, name] of [[0, 'Manual'], [1, 'Stabilised'], [2, 'Acro']]) {
  must(sim.e.sim_wing_set_stab(mode), 'mode');
  launchHigh(18);
  fly(0.5, 0.5, 0.8, 1);
  check(`${name}: stowed, the canopy reads 0`, sim.e.sim_wing_chute_open() === 0);
  check('pulled, it is accepted', sim.e.sim_wing_chute(1) === SIM_OK);
  const under = fly(1, 1, 1, 0.5);
  sf = surfaces();
  check('and with full sticks and throttle held the motor stops and the surfaces centre', under.rpm === 0 && sf.every((x) => x === 0), `rpm ${under.rpm.toFixed(0)}, ${sf.map(deg).join(' ')}`);
  check('and the canopy is opening', sim.e.sim_wing_chute_open() > 0 && sim.e.sim_wing_chute_open() < 1, sim.e.sim_wing_chute_open().toFixed(2));
  fly(1, 1, 1, 1.0);
  check('and open after 1.5 s', sim.e.sim_wing_chute_open() === 1);
}
must(sim.reset(), 'reset');
check('a reset stows it', sim.e.sim_wing_chute_open() === 0);
bramorPrelude(sim);
must(sim.e.sim_wing_chute(1), 'pull');
catapultRelease(sim);
check('and so does a relaunch off the catapult', sim.e.sim_wing_chute_open() === 0);
must(sim.e.sim_wing_chute(1), 'pull');
must(sim.e.sim_set_airframe(SKY_AIRFRAME), 'sky');
check('and changing aircraft', sim.e.sim_wing_chute_open() === 0);
check('an aircraft without a chute refuses the pull', sim.e.sim_wing_chute(1) !== SIM_OK && sim.e.sim_wing_chute_open() === 0);
must(sim.e.sim_set_airframe(0), 'five inch');
check('and so does a quad', sim.e.sim_wing_chute(1) !== SIM_OK);
check('anything but 0 or 1 is refused', sim.e.sim_wing_chute(2) !== SIM_OK);
/* 5 and 7 were reserved and are the Slow Stick and the Timber now, and 9
 * and 10 the Timber and the Cub on floats; past the end of the table is
 * refused whatever lands. */
check('one past the table and beyond are refused and leave the airframe alone', [11, 99].every((id) => sim.e.sim_set_airframe(id) !== SIM_OK) && sim.e.sim_airframe() === 0);
must(sim.e.sim_set_airframe(BRAMOR_AIRFRAME), 'bramor');
check('and 8 is the Bramor', sim.e.sim_airframe() === 8);

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
