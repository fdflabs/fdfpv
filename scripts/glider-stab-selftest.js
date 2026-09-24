/*
 * glider-stab-selftest.js: the Radian's stabiliser, acro, rudder, surface
 * readback and folding prop, in Node.
 *
 * The same stabiliser as the other fixed wings' (src/native/plant_wing.c)
 * with the Radian's own gains, and the Cub's bar in the air: Stabilised
 * flies level with the sticks centred and holds the bank and pitch asked
 * for, the turn coordinator keeping the ball in the middle against the
 * long ailerons' adverse yaw; Acro holds the attitude it is left at, stops
 * within about 5 degrees of where the stick was centred, and holds
 * inverted; the rudder is the yaw stick in every mode. What a glider adds:
 * with the throttle closed every mode still flies, a centred Stabilised
 * glide is a glide and not a dive, and the prop folds and unfolds with the
 * throttle in every mode. Last, the four surface angles the renderer reads
 * and their signs. Run with npm run glider:stab.
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
import { attitude, must, GLIDER_AIRFRAME, wingDebug, RC_STEP_MS } from '../tests/lib/wingpilot.js';

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
function wingSurfaces() {
  must(sim.e.sim_wing_surfaces(surfPtr), 'sim_wing_surfaces');
  return Array.from(new Float64Array(sim.e.memory.buffer, surfPtr, 2));
}

/* Thrown well clear of the ground and of the thermals, which start 110 m
 * away and are nothing at all under 5 m: at 3 m for the short checks, and
 * high, where a long roll has room, at a place with no thermal under it. */
let clockMs = 0;
function throwAt(z, speed) {
  must(sim.reset(), 'reset');
  clockMs = 0;
  must(sim.e.sim_set_airframe(GLIDER_AIRFRAME), 'airframe');
  must(sim.setCellVoltage(4.1), 'cells');
  must(sim.e.sim_set_pose(0, z > 5 ? -300 : 0, z, 1, 0, 0, 0), 'pose');
  must(sim.e.sim_wing_launch(speed), 'launch');
}

/* Bank from atan2, not attitude()'s asin, so a wing past ninety degrees
 * or inverted reads as what it is. Harness arithmetic only. */
function fullBank(s) {
  const w = s[7], x = s[8], y = s[9], z = s[10];
  return Math.atan2(2 * (y * z + w * x), 1 - 2 * (x * x + y * y));
}

/* Fixed sticks for a while, as cub-stab-selftest.js flies them. */
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
    worstBank, worst: worstRef, p: sumP / m, q: sumQ / m, r: sumR / m,
    v: Math.hypot(s[4], s[5], s[6]), vz: s[6], z: s[3], y: s[2], omega: s[14],
  };
}

const deg = (x) => (x * DEG).toFixed(1);

console.log('stabilised');
must(sim.e.sim_wing_set_stab(1), 'set stab');
throwAt(100, 10);
const level = fly(0, 0, 0, 0.5, 10);
check('centred sticks fly level: bank within 3 degrees', Math.abs(level.bank * DEG) < 3, `${deg(level.bank)} deg`);
check('and never banked past 8 degrees on the way', level.worstBank * DEG < 8, `${deg(level.worstBank)} deg`);
check('and hold the trim pitch within 4 degrees', Math.abs(level.pitch * DEG) < 4, `${deg(level.pitch)} deg`);
check('and straight: under 15 m off the line after 10 s', Math.abs(level.y + 300) < 15, `${(level.y + 300).toFixed(1)} m`);
check('at a cruising speed', level.v > 8 && level.v < 16, `${level.v.toFixed(1)} m/s`);
check('with the climb rate under 2 m/s', Math.abs(level.vz) < 2, `${level.vz.toFixed(2)} m/s`);
const banked = fly(1, 0, 0, 0.8, 4);
check('full right stick banks right, 50 to 65 degrees', banked.bank * DEG > 50 && banked.bank * DEG < 65, `${deg(banked.bank)} deg`);
check('and the turn coordinator keeps the sideslip under 3 degrees', Math.abs(banked.beta * DEG) < 3, `${deg(banked.beta)} deg`);
const rolledBack = fly(0, 0, 0, 0.5, 3);
check('letting go levels it within 3 s', Math.abs(rolledBack.bank * DEG) < 4, `${deg(rolledBack.bank)} deg`);
const leftBank = fly(-0.5, 0, 0, 0.5, 3);
check('half left stick banks left about 30 degrees', leftBank.bank * DEG < -22 && leftBank.bank * DEG > -38, `${deg(leftBank.bank)} deg`);
fly(0, 0, 0, 0.5, 3);
const nosedUp = fly(0, 0.6, 0, 1.0, 2);
check('up stick lifts the nose, 10 to 30 degrees, no tumble', nosedUp.pitch * DEG > 10 && nosedUp.pitch * DEG < 32 && nosedUp.worstBank * DEG < 25, `${deg(nosedUp.pitch)} deg, bank ${deg(nosedUp.worstBank)}`);
const settled = fly(0, 0, 0, 0.5, 4);
check('and centring brings it back to trim', Math.abs(settled.pitch * DEG) < 4 && Math.abs(settled.bank * DEG) < 4, `pitch ${deg(settled.pitch)}, bank ${deg(settled.bank)}`);
const yawed = fly(0, 0, 1, 0.5, 1);
check('full right yaw stick wins over the coordinator: rudder right of half its throw', surfaces()[3] * DEG < -15, `rudder ${deg(surfaces()[3])} deg`);
check('and yaws the nose right', yawed.r * DEG > 3, `${deg(yawed.r)} deg/s`);
const unyawed = fly(0, 0, 0, 0.5, 4);
check('and letting go of it levels the wings again', Math.abs(unyawed.bank * DEG) < 4, `${deg(unyawed.bank)} deg`);
const glideLevel = fly(0, 0, 0, 0, 12);
check('throttle closed, centred sticks glide: wings level, a glider\'s sink, not a dive', Math.abs(glideLevel.bank * DEG) < 3 && glideLevel.vz < 0 && glideLevel.vz > -1.2 && glideLevel.v > 6.8 && glideLevel.v < 11, `sinking ${(-glideLevel.vz).toFixed(2)} m/s at ${glideLevel.v.toFixed(1)} m/s, bank ${deg(glideLevel.bank)}`);
check('with the prop folded: nothing turning', glideLevel.omega === 0, `${glideLevel.omega} rad/s`);
const thermalTurn = fly(0.5, 0, 0, 0, 8);
check('and half right stick circles it at about 30 degrees, still gliding', thermalTurn.bank * DEG > 22 && thermalTurn.bank * DEG < 38 && thermalTurn.v > 6.8, `${deg(thermalTurn.bank)} deg at ${thermalTurn.v.toFixed(1)} m/s`);

console.log('acro');
must(sim.e.sim_wing_set_stab(2), 'set acro');
throwAt(100, 12);
const acroLevel = fly(0, 0, 0, 0.5, 1);
const acroHold = fly(0, 0, 0, 0.5, 9, acroLevel.endBank);
check('centred sticks hold the attitude: bank within 3 degrees over 9 s', acroHold.worst * DEG < 3, `${deg(acroHold.worst)} deg`);
check('and the pitch where it was, within 3 degrees', Math.abs((acroHold.endPitch - acroLevel.endPitch) * DEG) < 3, `${deg(acroLevel.endPitch)} -> ${deg(acroHold.endPitch)} deg`);
check('and straight: under 15 m off the line after 10 s', Math.abs(acroHold.y + 300) < 15, `${(acroHold.y + 300).toFixed(1)} m`);

throwAt(150, 16);
fly(0, 0, 0, 1.0, 1);
const rolling = fly(1, 0, 0, 1.0, 1.2);
check('full right stick rolls at 68 to 88 degrees a second', rolling.p * DEG > 68 && rolling.p * DEG < 88, `${deg(rolling.p)} deg/s`);
const inverted = fly(1, 0, 0, 1.0, 1.0);
const invHold = fly(0, 0, 0, 1.0, 0.3);
const invLater = fly(0, 0, 0, 1.0, 2, invHold.endBank);
check('and it keeps going past the stabilised cap: 150 degrees or more', Math.abs(inverted.endBank) * DEG > 150, `${deg(inverted.endBank)} deg`);
check('centred, it stays where it stopped: within 5 degrees for 2 s', invLater.worst * DEG < 5, `${deg(invHold.endBank)} deg, moved ${deg(invLater.worst)}`);

throwAt(150, 16);
fly(0, 0, 0, 1.0, 1);
const partial = fly(0.6, 0, 0, 1.0, 0.7);
const stop = fly(0, 0, 0, 1.0, 0.25);
const stopHeld = fly(0, 0, 0, 1.0, 3, stop.endBank);
check('a partial roll stops sharply: rate under 10 degrees a second 0.25 s after centring', Math.abs(stop.p * DEG) < 10, `${deg(stop.p)} deg/s`);
check('within about 5 degrees of where the stick was centred', Math.abs((stop.endBank - partial.endBank) * DEG) < 6, `${deg(partial.endBank)} -> ${deg(stop.endBank)} deg`);
check('and holds that bank, no levelling, within 4 degrees over 3 s', stop.endBank * DEG > 15 && stopHeld.worst * DEG < 4, `${deg(stop.endBank)} deg, moved ${deg(stopHeld.worst)}`);

throwAt(150, 16);
fly(0, 0, 0, 1.0, 1);
const pulling = fly(0, 1, 0, 1.0, 0.5);
check('full up stick pitches at 50 to 70 degrees a second', pulling.q * DEG > 50 && pulling.q * DEG < 70, `${deg(pulling.q)} deg/s`);
throwAt(150, 16);
fly(0, 0, 0, 1.0, 1);
fly(0, 0.5, 0, 1.0, 0.4);
const pitched = fly(0, 0, 0, 1.0, 0.3);
const pitchHeld = fly(0, 0, 0, 1.0, 2);
check('a nose up input is held, not trimmed away: within 4 degrees over 2 s', pitched.endPitch * DEG > 8 && Math.abs((pitchHeld.endPitch - pitched.endPitch) * DEG) < 4, `${deg(pitched.endPitch)} -> ${deg(pitchHeld.endPitch)} deg`);

throwAt(150, 14);
fly(0, 0, 0, 0.6, 1);
const beforeYaw = fly(0, 0, 0, 0.6, 0.5);
const acroYaw = fly(0, 0, 1, 0.6, 1);
check('full right yaw stick yaws the nose right', acroYaw.r * DEG > 3, `${deg(acroYaw.r)} deg/s`);
check('and the roll lock holds the bank against it, within 5 degrees', Math.abs((acroYaw.endBank - beforeYaw.endBank) * DEG) < 5, `${deg(beforeYaw.endBank)} -> ${deg(acroYaw.endBank)} deg`);

throwAt(100, 10);
const acroGlide = fly(0, 0, 0, 0, 6);
check('throttle closed, centred sticks hold the glide it was thrown into: pitch within 4 degrees, the prop folded', Math.abs((acroGlide.endPitch - acroLevel.endPitch) * DEG) < 4 && acroGlide.omega === 0, `${deg(acroGlide.endPitch)} deg, ${acroGlide.omega} rad/s`);

console.log('manual');
must(sim.e.sim_wing_set_stab(0), 'clear stab');
throwAt(100, 12);
const manual = fly(1, 0, 0, 0.5, 1.5);
check('with the stabiliser off, full stick rolls past the 60 degree cap', manual.worstBank * DEG > 70, `${deg(manual.worstBank)} deg in 1.5 s`);
must(sim.reset(), 'reset');
check('a reset keeps the setting', sim.e.sim_wing_stab() === 0);

console.log('the folding prop');
for (const [mode, name] of [[0, 'Manual'], [1, 'Stabilised'], [2, 'Acro']]) {
  must(sim.e.sim_wing_set_stab(mode), 'mode');
  throwAt(100, 10);
  const off = fly(0, 0, 0, 0.049, 0.1);
  const on = fly(0, 0, 0, 0.05, 0.1);
  const offAgain = fly(0, 0, 0, 0, 0.1);
  check(`${name}: under 5 percent folded and still, at 5 percent open and turning, closed folded again`, off.omega === 0 && on.omega > 0 && offAgain.omega === 0, `${off.omega.toFixed(0)}, ${on.omega.toFixed(0)}, ${offAgain.omega.toFixed(0)} rad/s`);
}

console.log('surfaces');
must(sim.e.sim_wing_set_stab(0), 'clear stab');
throwAt(100, 12);
const A = 15 / DEG;
const T = 24.4 / DEG;
const R = 30 / DEG;
const close = (a, b) => Math.abs(a - b) < 1e-12;
fly(1, 0, 0, 0.5, 0.02);
let sf = surfaces();
check('full right roll: right aileron trailing edge up 15 degrees, left down 15', close(sf[1], A) && close(sf[0], -A) && sf[2] === 0 && sf[3] === 0, sf.map(deg).join(' '));
const ws = wingSurfaces();
check('and sim_wing_surfaces reads the same two ailerons', ws[0] === sf[0] && ws[1] === sf[1], ws.map(deg).join(' '));
fly(0, 1, 0, 0.5, 0.02);
sf = surfaces();
check('full up: elevator trailing edge up 24.4 degrees, ailerons still', close(sf[2], T) && sf[0] === 0 && sf[1] === 0, sf.map(deg).join(' '));
fly(0, 0, 1, 0.5, 0.02);
sf = surfaces();
check('full right yaw: rudder trailing edge right, 30 degrees negative', close(sf[3], -R), sf.map(deg).join(' '));
fly(0, 0, -0.5, 0.5, 0.02);
sf = surfaces();
check('half left yaw: rudder trailing edge left, positive, with expo', sf[3] > 0 && sf[3] < 0.5 * R, sf.map(deg).join(' '));
check('a null pointer is refused', sim.e.sim_plane_surfaces(0) !== SIM_OK);

console.log('the reserved slot');
check('airframe 5, reserved and empty, is refused and the Radian stays selected', sim.e.sim_set_airframe(5) !== SIM_OK && sim.e.sim_airframe() === GLIDER_AIRFRAME, `airframe ${sim.e.sim_airframe()}`);

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
