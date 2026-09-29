/*
 * zagi-stab-selftest.js: the Zagi's stabiliser, acro and elevons, in Node.
 *
 * The same stabiliser as the other fixed wings' (src/native/plant_wing.c)
 * with the Zagi's own gains and limits, held to the flying wing's bar
 * (scripts/wing-stab-selftest.js and bramor-stab-selftest.js): Stabilised
 * flies level off the hand throw with the sticks centred and holds the
 * bank and pitch asked for, up to 60 and 30 degrees; Acro holds the
 * attitude it is left at, holds inverted, and rolls at the rate it asks
 * for; Manual rolls past the cap. Then the elevons' readback and signs:
 * one throw, 14.5 deg, on either stick, clipped at it, and nothing on the
 * yaw stick, since a Zagi has no rudder. Run with npm run zagi:stab.
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

import { loadSim } from '../tests/lib/simmod.js';
import { attitude, must, zagiPrelude, ZAGI_AIRFRAME, RC_STEP_MS } from '../tests/lib/wingpilot.js';

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
const surfPtr = sim.e.malloc(4 * 8);
function surfaces() {
  must(sim.e.sim_plane_surfaces(surfPtr), 'sim_plane_surfaces');
  return Array.from(new Float64Array(sim.e.memory.buffer, surfPtr, 4));
}

let clockMs = 0;
/* Off the hand, or level at a height for the manoeuvres. */
function launch() {
  must(sim.reset(), 'reset');
  clockMs = 0;
  zagiPrelude(sim);
}
function launchHigh(speed = 15) {
  must(sim.reset(), 'reset');
  clockMs = 0;
  zagiPrelude(sim);
  must(sim.e.sim_set_pose(0, 600, 150, 1, 0, 0, 0), 'pose');
  must(sim.e.sim_wing_launch(speed), 'launch');
}

/* Bank from atan2, so a wing past ninety degrees or inverted reads as
 * what it is. Harness arithmetic only. */
function fullBank(s) {
  const w = s[7], x = s[8], y = s[9], z = s[10];
  return Math.atan2(2 * (y * z + w * x), 1 - 2 * (x * x + y * y));
}

/* Fixed sticks for a while, the Bramor's: the last second's mean bank and
 * pitch, the worst bank, the worst distance from a reference bank, the
 * last quarter second's mean body rates, and the end state. */
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
    p: sumP / m, q: sumQ / m, v: Math.hypot(s[4], s[5], s[6]), vz: s[6], z: s[3], y: s[2] - 600,
  };
}
const deg = (x) => (x * DEG).toFixed(1);

console.log('stabilised');
must(sim.e.sim_wing_set_stab(1), 'set stab');
launch();
const level = fly(0, 0, 0.6, 12);
check('off the hand, centred sticks fly level: bank within 3 degrees', Math.abs(level.bank * DEG) < 3, `${deg(level.bank)} deg`);
check('and never banked past 8 degrees on the way', level.worstBank * DEG < 8, `${deg(level.worstBank)} deg`);
check('and hold the trim pitch within 4 degrees', Math.abs(level.pitch * DEG - 2) < 4, `${deg(level.pitch)} deg`);
check('and straight: under 15 m off the line after 12 s', Math.abs(level.y) < 15, `${level.y.toFixed(1)} m`);
check('and it flew away from the throw: above 3 m after 12 s', level.z > 3, `${level.z.toFixed(1)} m`);
const banked = fly(1, 0, 0.7, 4);
check('full right stick banks right, 52 to 66 degrees', banked.bank * DEG > 52 && banked.bank * DEG < 66, `${deg(banked.bank)} deg`);
const rolledBack = fly(0, 0, 0.6, 4);
check('letting go levels it within 4 s', Math.abs(rolledBack.bank * DEG) < 4, `${deg(rolledBack.bank)} deg`);
const leftBank = fly(-0.5, 0, 0.7, 4);
check('half left stick banks left about 30 degrees', leftBank.bank * DEG < -22 && leftBank.bank * DEG > -38, `${deg(leftBank.bank)} deg`);
fly(0, 0, 0.6, 3);
const nosedUp = fly(0, 0.8, 1.0, 3);
check('up stick lifts the nose, 16 to 30 degrees, no tumble', nosedUp.pitch * DEG > 16 && nosedUp.pitch * DEG < 30 && nosedUp.worstBank * DEG < 20, `${deg(nosedUp.pitch)} deg, bank ${deg(nosedUp.worstBank)}`);
const settled = fly(0, 0, 0.6, 5);
check('and centring brings it back to trim', Math.abs(settled.pitch * DEG - 2) < 4 && Math.abs(settled.bank * DEG) < 4, `pitch ${deg(settled.pitch)}, bank ${deg(settled.bank)}`);

console.log('acro');
must(sim.e.sim_wing_set_stab(2), 'set acro');
launchHigh(15);
const acroLevel = fly(0, 0, 0.6, 1);
const acroHold = fly(0, 0, 0.6, 9, acroLevel.endBank);
check('centred sticks hold the attitude: bank within 3 degrees over 9 s', acroHold.worst * DEG < 3, `${deg(acroHold.worst)} deg`);
check('and the pitch where it was, within 3 degrees', Math.abs((acroHold.endPitch - acroLevel.endPitch) * DEG) < 3, `${deg(acroLevel.endPitch)} -> ${deg(acroHold.endPitch)} deg`);
check('and straight: under 15 m off the line', Math.abs(acroHold.y) < 15, `${acroHold.y.toFixed(1)} m`);

launchHigh(18);
fly(0, 0, 0.8, 1);
const rolling = fly(1, 0, 0.8, 0.6);
check('full right stick rolls at 190 to 250 degrees a second, the 220 it asks for', rolling.p * DEG > 190 && rolling.p * DEG < 250, `${deg(rolling.p)} deg/s`);
const inverted = fly(1, 0, 0.8, 0.3);
const invHold = fly(0, -0.3, 0.8, 0.3);
const invLater = fly(0, 0, 0.8, 2, invHold.endBank);
check('and keeps going past the stabilised cap, to inverted', Math.abs(inverted.endBank) * DEG > 150, `${deg(inverted.endBank)} deg`);
check('centred, it stays where it stopped: within 5 degrees for 2 s', invLater.worst * DEG < 5, `${deg(invHold.endBank)} deg, moved ${deg(invLater.worst)}`);

launchHigh(15);
fly(0, 0, 0.6, 1);
const partial = fly(0.6, 0, 0.6, 0.3);
const stop = fly(0, 0, 0.6, 0.3);
const stopHeld = fly(0, 0, 0.6, 3, stop.endBank);
check('a partial roll stops: rate under 10 degrees a second 0.3 s after centring', Math.abs(stop.p * DEG) < 10, `${deg(stop.p)} deg/s`);
check('within about 5 degrees of where the stick was centred', Math.abs((stop.endBank - partial.endBank) * DEG) < 6, `${deg(partial.endBank)} -> ${deg(stop.endBank)} deg`);
check('and holds that bank, no levelling, within 4 degrees over 3 s', stop.endBank * DEG > 15 && stopHeld.worst * DEG < 4, `${deg(stop.endBank)} deg, moved ${deg(stopHeld.worst)}`);

launchHigh(18);
fly(0, 0, 0.8, 1);
const pulling = fly(0, 1, 0.8, 0.5);
check('full up stick pitches at 80 to 115 degrees a second, the 100 it asks for', pulling.q * DEG > 80 && pulling.q * DEG < 115, `${deg(pulling.q)} deg/s`);
launchHigh(15);
fly(0, 0, 0.6, 1);
fly(0, 0.5, 0.6, 0.3);
const pitched = fly(0, 0, 0.6, 0.3);
const pitchHeld = fly(0, 0, 0.6, 2);
check('a nose up input is held, not trimmed away: within 4 degrees over 2 s', pitched.endPitch * DEG > 6 && Math.abs((pitchHeld.endPitch - pitched.endPitch) * DEG) < 4, `${deg(pitched.endPitch)} -> ${deg(pitchHeld.endPitch)} deg`);

console.log('manual');
must(sim.e.sim_wing_set_stab(0), 'clear stab');
launchHigh(15);
fly(0, 0, 0.6, 1);
const manual = fly(1, 0, 0.6, 1);
check('with the stabiliser off, full stick rolls past the 60 degree cap', manual.worstBank * DEG > 90, `${deg(manual.worstBank)} deg in 1 s`);
must(sim.reset(), 'reset');
check('a reset keeps the setting', sim.e.sim_wing_stab() === 0);

console.log('elevons');
launchHigh(15);
const T = 14.4775 / DEG;
const close = (a, b) => Math.abs(a - b) < 1e-12;
fly(1, 0, 0.5, 0.02);
let sf = surfaces();
check('full right roll: right elevon trailing edge up 14.5 degrees, left down 14.5', close(sf[1], T) && close(sf[0], -T) && sf[2] === 0 && sf[3] === 0, sf.map(deg).join(' '));
fly(0, 1, 0.5, 0.02);
sf = surfaces();
check('full up: both elevons trailing edge up 14.5 degrees', close(sf[0], T) && close(sf[1], T), sf.map(deg).join(' '));
fly(0, 0, 0.5, 0.02);
fly(1, 1, 0.5, 0.02);
sf = surfaces();
check('full right and up together: the right clipped at 14.5, the left centred', close(sf[1], T) && close(sf[0], 0), sf.map(deg).join(' '));
fly(0, 0, 0.5, 0.02);
must(sim.input(clockMs / 1000, 0, 0, 1, 0.5), 'input');
must(sim.step(RC_STEP_MS), 'step');
clockMs += RC_STEP_MS;
sf = surfaces();
check('full yaw stick moves nothing: a Zagi has no rudder', sf.every((x) => x === 0), sf.map(deg).join(' '));
check('17 is the Zagi', sim.e.sim_airframe() === ZAGI_AIRFRAME);

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
