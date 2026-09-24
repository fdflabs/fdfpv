/*
 * wing-stab-selftest.js: the wing's stabiliser, in Node.
 *
 * The wing's one flight controller is the attitude loop in
 * src/native/plant_wing.c, switched on by the Stabilised tune. This
 * throws the wing with it on and asks the four things a pilot would:
 * centred sticks fly level and straight, the roll stick asks for a bank
 * and gets one, letting go levels it again, and the pitch stick lifts the
 * nose without a tumble. Then it turns the stabiliser off and checks the
 * sticks are the elevons again, so the manual gates in wing-gates.js are
 * still measuring what they say. Run with npm run wing:stab.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { GROUND_MU, GROUND_E } from '../src/game/collide.js';
import { attitude, must, wingPrelude, RC_STEP_MS } from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DEG = 180 / Math.PI;

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

const sim = await loadSim(new Uint8Array(await readFile(join(root, 'dist/sim.wasm'))));
must(sim.init(await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8')), 'init');
must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, GROUND_MU, GROUND_E), 'ground');

let clockMs = 0;
function throwIt() {
  must(sim.reset(), 'reset');
  clockMs = 0;
  wingPrelude(sim);
  must(sim.e.sim_set_pose(0, 0, 3, 1, 0, 0, 0), 'pose');
  must(sim.e.sim_wing_launch(10), 'launch');
}
/* Fly with fixed sticks for a while and report the last second's mean
 * attitude, the worst bank seen, and the state at the end. */
function hold(roll, pitch, duty, seconds) {
  const total = seconds * 1000;
  let worstBank = 0;
  let sumBank = 0;
  let sumPitch = 0;
  let n = 0;
  let s = null;
  for (let ms = 0; ms < total; ms += RC_STEP_MS) {
    must(sim.input((clockMs + ms) / 1000, roll, pitch, 0, duty), 'input');
    must(sim.step(RC_STEP_MS), 'step');
    s = sim.readState().state;
    const { bank, pitch: pitchAtt } = attitude(s);
    worstBank = Math.max(worstBank, Math.abs(bank));
    if (ms >= total - 1000) {
      sumBank += bank;
      sumPitch += pitchAtt;
      n += 1;
    }
  }
  clockMs += total;
  return { bank: sumBank / n, pitch: sumPitch / n, worstBank, v: Math.hypot(s[4], s[5], s[6]), vz: s[6], z: s[3], y: s[2] };
}

console.log('stabilised');
check('the stabiliser is off until asked', sim.e.sim_wing_stab() === 0, `${sim.e.sim_wing_stab()}`);
must(sim.e.sim_wing_set_stab(1), 'set stab');
check('and on when asked', sim.e.sim_wing_stab() === 1);

throwIt();
const level = hold(0, 0, 0.65, 10);
check('centred sticks fly level: bank within 3 degrees', Math.abs(level.bank * DEG) < 3, `${(level.bank * DEG).toFixed(1)} deg`);
check('and never banked past 8 degrees on the way', level.worstBank * DEG < 8, `${(level.worstBank * DEG).toFixed(1)} deg`);
check('and hold the trim pitch within 4 degrees', Math.abs(level.pitch * DEG - 2) < 4, `${(level.pitch * DEG).toFixed(1)} deg`);
check('and straight: under 15 m off the line after 10 s', Math.abs(level.y) < 15, `${level.y.toFixed(1)} m`);
check('at a cruising speed', level.v > 12 && level.v < 22, `${level.v.toFixed(1)} m/s`);
check('with the climb rate under 2 m/s', Math.abs(level.vz) < 2, `${level.vz.toFixed(2)} m/s`);

const banked = hold(1, 0, 0.75, 3);
check('full right stick banks right, 50 to 65 degrees', banked.bank * DEG > 50 && banked.bank * DEG < 65, `${(banked.bank * DEG).toFixed(1)} deg`);
const rolledBack = hold(0, 0, 0.65, 3);
check('and letting go levels it within 3 s', Math.abs(rolledBack.bank * DEG) < 4, `${(rolledBack.bank * DEG).toFixed(1)} deg`);
const leftBank = hold(-0.5, 0, 0.75, 3);
check('half left stick banks left about 30 degrees', leftBank.bank * DEG < -22 && leftBank.bank * DEG > -38, `${(leftBank.bank * DEG).toFixed(1)} deg`);
hold(0, 0, 0.65, 3);
const nosedUp = hold(0, 0.6, 0.9, 2);
check('up stick lifts the nose, 10 to 30 degrees, no tumble', nosedUp.pitch * DEG > 10 && nosedUp.pitch * DEG < 32 && nosedUp.worstBank * DEG < 25, `${(nosedUp.pitch * DEG).toFixed(1)} deg, bank ${(nosedUp.worstBank * DEG).toFixed(1)}`);
const settled = hold(0, 0, 0.65, 4);
check('and centring brings it back to trim', Math.abs(settled.pitch * DEG - 2) < 4 && Math.abs(settled.bank * DEG) < 4, `pitch ${(settled.pitch * DEG).toFixed(1)}, bank ${(settled.bank * DEG).toFixed(1)}`);

console.log('acro');
/* Bank from atan2, not attitude()'s asin, so a wing past ninety degrees
 * or inverted reads as what it is. Harness arithmetic only. */
function fullBank(s) {
  const w = s[7], x = s[8], y = s[9], z = s[10];
  return Math.atan2(2 * (y * z + w * x), 1 - 2 * (x * x + y * y));
}
/* Fixed sticks for a while, with the bank and pitch at the end, the worst
 * distance from a reference bank, and the mean body rates over the last
 * quarter second (roll right positive, nose up positive). */
function fly(roll, pitch, duty, seconds, refBank = null) {
  const total = seconds * 1000;
  let worst = 0;
  let sumP = 0;
  let sumQ = 0;
  let n = 0;
  let s = null;
  for (let ms = 0; ms < total; ms += RC_STEP_MS) {
    must(sim.input((clockMs + ms) / 1000, roll, pitch, 0, duty), 'input');
    must(sim.step(RC_STEP_MS), 'step');
    s = sim.readState().state;
    if (refBank !== null) {
      let d = fullBank(s) - refBank;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      worst = Math.max(worst, Math.abs(d));
    }
    if (ms >= total - 250) {
      sumP += s[11];
      sumQ += -s[12];
      n += 1;
    }
  }
  clockMs += total;
  return { bank: fullBank(s), pitch: attitude(s).pitch, worst, p: sumP / n, q: sumQ / n, z: s[3], y: s[2] };
}
function throwHigh() {
  must(sim.reset(), 'reset');
  clockMs = 0;
  wingPrelude(sim);
  must(sim.e.sim_set_pose(0, 0, 120, 1, 0, 0, 0), 'pose');
  must(sim.e.sim_wing_launch(16), 'launch');
}

check('a mode past acro is refused', sim.e.sim_wing_set_stab(3) !== SIM_OK && sim.e.sim_wing_stab() === 1);
must(sim.e.sim_wing_set_stab(2), 'set acro');
check('acro is mode 2', sim.e.sim_wing_stab() === 2);

throwIt();
const acroLevel = fly(0, 0, 0.65, 1);
const acroHold = fly(0, 0, 0.65, 9, acroLevel.bank);
check('centred sticks hold the attitude: bank within 3 degrees over 9 s', acroHold.worst * DEG < 3, `${(acroHold.worst * DEG).toFixed(2)} deg`);
check('and the pitch where it was, within 3 degrees', Math.abs((acroHold.pitch - acroLevel.pitch) * DEG) < 3, `${(acroLevel.pitch * DEG).toFixed(1)} -> ${(acroHold.pitch * DEG).toFixed(1)} deg`);
check('and straight: under 15 m off the line after 10 s', Math.abs(acroHold.y) < 15, `${acroHold.y.toFixed(1)} m`);

throwHigh();
fly(0, 0, 0.75, 1);
const rolling = fly(1, 0, 0.75, 0.5);
check('full right stick rolls at 170 to 220 degrees a second', rolling.p * DEG > 170 && rolling.p * DEG < 220, `${(rolling.p * DEG).toFixed(0)} deg/s`);
const inverted = fly(1, 0, 0.75, 0.4);
const invHold = fly(0, 0, 0.75, 0.3);
const invLater = fly(0, 0, 0.75, 2, invHold.bank);
check('and it keeps going past the stabilised cap: 150 degrees or more', Math.abs(inverted.bank) * DEG > 150, `${(inverted.bank * DEG).toFixed(0)} deg`);
check('centred, it stays where it stopped: within 5 degrees for 2 s', invLater.worst * DEG < 5, `${(invHold.bank * DEG).toFixed(0)} deg, moved ${(invLater.worst * DEG).toFixed(1)}`);

throwHigh();
fly(0, 0, 0.75, 1);
fly(0.6, 0, 0.75, 0.3);
const stop = fly(0, 0, 0.75, 0.25);
const stopHeld = fly(0, 0, 0.75, 3, stop.bank);
check('a partial roll stops sharply: rate under 10 degrees a second 0.25 s after centring', Math.abs(stop.p * DEG) < 10, `${(stop.p * DEG).toFixed(1)} deg/s`);
check('and holds that bank, no levelling, within 4 degrees over 3 s', stop.bank * DEG > 20 && stopHeld.worst * DEG < 4, `${(stop.bank * DEG).toFixed(1)} deg, moved ${(stopHeld.worst * DEG).toFixed(1)}`);

throwHigh();
fly(0, 0, 0.9, 1);
const pulling = fly(0, 1, 0.9, 0.5);
check('full up stick pitches at 70 to 115 degrees a second', pulling.q * DEG > 70 && pulling.q * DEG < 115, `${(pulling.q * DEG).toFixed(0)} deg/s`);
throwHigh();
fly(0, 0, 0.9, 1);
fly(0, 0.5, 0.9, 0.3);
const pitched = fly(0, 0, 0.9, 0.3);
const pitchHeld = fly(0, 0, 0.9, 2);
check('a nose up input is held, not trimmed away: within 4 degrees over 2 s', pitched.pitch * DEG > 8 && Math.abs((pitchHeld.pitch - pitched.pitch) * DEG) < 4, `${(pitched.pitch * DEG).toFixed(1)} -> ${(pitchHeld.pitch * DEG).toFixed(1)} deg`);
must(sim.e.sim_wing_set_stab(1), 'back to stabilised');

console.log('manual again');
must(sim.e.sim_wing_set_stab(0), 'clear stab');
throwIt();
const manual = hold(1, 0, 0.65, 1.5);
check('with the stabiliser off, full stick rolls past the 60 degree cap', manual.worstBank * DEG > 70, `${(manual.worstBank * DEG).toFixed(0)} deg in 1.5 s`);
must(sim.reset(), 'reset');
check('a reset keeps the setting', sim.e.sim_wing_stab() === 0);

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
