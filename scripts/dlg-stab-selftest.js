/*
 * dlg-stab-selftest.js: the NRJ's stabiliser, acro, rudder, surface
 * readback and the discus launch's preset in every mode, in Node.
 *
 * The same stabiliser as the other fixed wings' (src/native/plant_wing.c)
 * with the NRJ's own gains, and the Radian's bar: Stabilised glides level
 * with the sticks centred and holds the bank asked for, the turn
 * coordinator keeping the ball in the middle; Acro holds the attitude it
 * is left at, stops within about 5 degrees of where the stick was
 * centred, and holds inverted; the rudder is the yaw stick in every mode.
 * What a discus launch glider adds: there is no motor, so the throttle
 * moves nothing; and in every mode the launch preset flies the zoom and
 * lets go at its top: the preset's down elevator in every mode,
 * Stabilised holding the release's pitch and Acro its attitude.
 * Last, the four surface angles the renderer reads and their signs. Run
 * with npm run dlg:stab.
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
import { attitude, must, DLG_AIRFRAME, wingDebug, RC_STEP_MS } from '../tests/lib/wingpilot.js';

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

/* Thrown at 100 m, well clear of the ground, at a place with no thermal
 * under it (the three are 110 m and more from the origin's side). */
let clockMs = 0;
function throwAt(z, speed) {
  must(sim.reset(), 'reset');
  clockMs = 0;
  must(sim.e.sim_set_airframe(DLG_AIRFRAME), 'airframe');
  must(sim.setCellVoltage(4.1), 'cells');
  must(sim.e.sim_set_pose(0, z > 5 ? -300 : 0, z, 1, 0, 0, 0), 'pose');
  must(sim.e.sim_wing_launch(speed), 'launch');
}

function fullBank(s) {
  const w = s[7], x = s[8], y = s[9], z = s[10];
  return Math.atan2(2 * (y * z + w * x), 1 - 2 * (x * x + y * y));
}

/* Fixed sticks for a while, as glider-stab-selftest.js flies them. */
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
      m += 1;
    }
  }
  clockMs += total;
  return {
    bank: sumBank / n, endBank: fullBank(s), pitch: sumPitch / n, endPitch: attitude(s).pitch, beta: sumBeta / n,
    worstBank, worst: worstRef, p: sumP / m, q: sumQ / m, rAll: sumRAll / mAll,
    v: Math.hypot(s[4], s[5], s[6]), vz: s[6], z: s[3], y: s[2], omega: s[14],
  };
}

const deg = (x) => (x * DEG).toFixed(1);

console.log('stabilised');
must(sim.e.sim_wing_set_stab(1), 'set stab');
throwAt(100, 6);
const level = fly(0, 0, 0, 0, 12);
check('centred sticks glide level: bank within 3 degrees', Math.abs(level.bank * DEG) < 3, `${deg(level.bank)} deg`);
check('and never banked past 8 degrees on the way', level.worstBank * DEG < 8, `${deg(level.worstBank)} deg`);
check('and straight: under 15 m off the line after 12 s', Math.abs(level.y + 300) < 15, `${(level.y + 300).toFixed(1)} m`);
check('a glide and not a dive: 4.5 to 7 m/s, sinking 0.2 to 0.6 m/s', level.v > 4.5 && level.v < 7 && level.vz < -0.2 && level.vz > -0.6, `${level.v.toFixed(2)} m/s, ${(-level.vz).toFixed(2)} m/s down`);
const banked = fly(1, 0, 0, 0, 4);
check('full right stick banks right, 42 to 56 degrees', banked.bank * DEG > 42 && banked.bank * DEG < 56, `${deg(banked.bank)} deg`);
check('and the turn coordinator keeps the sideslip under 3 degrees', Math.abs(banked.beta * DEG) < 3, `${deg(banked.beta)} deg`);
const rolledBack = fly(0, 0, 0, 0, 3);
check('letting go levels it within 3 s', Math.abs(rolledBack.bank * DEG) < 4, `${deg(rolledBack.bank)} deg`);
const thermalTurn = fly(0.6, 0, 0, 0, 8);
check('and 0.6 of right stick circles it at about 30 degrees, still gliding', thermalTurn.bank * DEG > 22 && thermalTurn.bank * DEG < 38 && thermalTurn.v > 4.5, `${deg(thermalTurn.bank)} deg at ${thermalTurn.v.toFixed(1)} m/s`);
fly(0, 0, 0, 0, 4);
const yawed = fly(0, 0, 1, 0, 1);
check('full right yaw stick wins over the coordinator: rudder right of half its throw', surfaces()[3] * DEG < -7.75, `rudder ${deg(surfaces()[3])} deg`);
check('and yaws the nose right', yawed.rAll * DEG > 3, `${deg(yawed.rAll)} deg/s`);

console.log('acro');
must(sim.e.sim_wing_set_stab(2), 'set acro');
throwAt(100, 8);
const acroLevel = fly(0, 0, 0, 0, 1);
const acroHold = fly(0, 0, 0, 0, 6, acroLevel.endBank);
check('centred sticks hold the attitude: bank within 3 degrees over 6 s', acroHold.worst * DEG < 3, `${deg(acroHold.worst)} deg`);
check('and the pitch where it was, within 3 degrees', Math.abs((acroHold.endPitch - acroLevel.endPitch) * DEG) < 3, `${deg(acroLevel.endPitch)} -> ${deg(acroHold.endPitch)} deg`);
throwAt(100, 9);
const rolling = fly(1, 0, 0, 0, 0.8);
check('full right stick rolls at the 150 degrees a second Acro asks for, 125 to 175', rolling.p * DEG > 125 && rolling.p * DEG < 175, `${deg(rolling.p)} deg/s`);
const inverted = fly(1, 0, 0, 0, 0.3);
const invHold = fly(0, 0, 0, 0, 0.3);
const invLater = fly(0, 0, 0, 0, 1.5, invHold.endBank);
check('and it keeps going past the stabilised cap: 150 degrees or more', Math.abs(inverted.endBank) * DEG > 150, `${deg(inverted.endBank)} deg`);
check('centred, it stays where it stopped: within 5 degrees for 1.5 s', invLater.worst * DEG < 5, `${deg(invHold.endBank)} deg, moved ${deg(invLater.worst)}`);
throwAt(100, 8);
fly(0, 0, 0, 0, 1);
const partial = fly(0.5, 0, 0, 0, 0.4);
const stop = fly(0, 0, 0, 0, 0.25);
const stopHeld = fly(0, 0, 0, 0, 2, stop.endBank);
check('a partial roll stops sharply: rate under 15 degrees a second 0.25 s after centring', Math.abs(stop.p * DEG) < 15, `${deg(stop.p)} deg/s`);
check('within about 6 degrees of where the stick was centred', Math.abs((stop.endBank - partial.endBank) * DEG) < 6, `${deg(partial.endBank)} -> ${deg(stop.endBank)} deg`);
check('and holds that bank, no levelling, within 4 degrees over 2 s', stop.endBank * DEG > 15 && stopHeld.worst * DEG < 4, `${deg(stop.endBank)} deg, moved ${deg(stopHeld.worst)}`);
throwAt(100, 9);
const pulling = fly(0, 1, 0, 0, 0.4);
check('full up stick pitches at 45 to 70 degrees a second', pulling.q * DEG > 45 && pulling.q * DEG < 70, `${deg(pulling.q)} deg/s`);

console.log('manual');
must(sim.e.sim_wing_set_stab(0), 'clear stab');
throwAt(100, 8);
const manual = fly(1, 0, 0, 0, 1.0);
check('with the stabiliser off, full stick rolls past the 50 degree cap', manual.worstBank * DEG > 70, `${deg(manual.worstBank)} deg in 1 s`);
must(sim.reset(), 'reset');
check('a reset keeps the setting', sim.e.sim_wing_stab() === 0);

console.log('no motor');
for (const [mode, name] of [[0, 'Manual'], [1, 'Stabilised'], [2, 'Acro']]) {
  must(sim.e.sim_wing_set_stab(mode), 'mode');
  throwAt(100, 7);
  const full = fly(0, 0, 0, 1, 0.2);
  check(`${name}: full throttle turns nothing and pushes nothing`, full.omega === 0 && wingDebug(sim)[8] === 0, `${full.omega} rad/s, ${wingDebug(sim)[8]} N`);
}

/*
 * THE LAUNCH PRESET in each mode: thrown from 1.5 m with the sticks
 * centred, the zoom holds on the preset and lets go at its top. The
 * phase is the plant's own (sim_wing_discus_phase).
 */
console.log('the discus launch in each mode');
function launch(mode) {
  must(sim.reset(), 'reset');
  clockMs = 0;
  must(sim.e.sim_set_airframe(DLG_AIRFRAME), 'airframe');
  must(sim.e.sim_wing_set_stab(mode), 'mode');
  must(sim.e.sim_set_pose(0, 0, 1.5, 1, 0, 0, 0), 'pose');
  must(sim.e.sim_wing_discus(), 'discus');
  let zoomPitch = [];
  let zoomElev = [];
  let top = 0;
  let endMs = null;
  let afterElev = null;
  for (let ms = 0; ms < 8000; ms += RC_STEP_MS) {
    must(sim.input(ms / 1000, 0, 0, 0, 0), 'input');
    must(sim.step(RC_STEP_MS), 'step');
    const s = sim.readState().state;
    const phase = sim.e.sim_wing_discus_phase();
    top = Math.max(top, s[3]);
    if (phase === 2 && ms > 800 && ms < 2500) {
      zoomPitch.push(attitude(s).pitch);
      zoomElev.push(surfaces()[2]);
    }
    if (phase === 0 && endMs === null && ms > 600) {
      endMs = ms;
    }
    if (endMs !== null && afterElev === null && ms > endMs + 100) {
      afterElev = surfaces()[2];
    }
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  return { top, endMs, pitch: mean(zoomPitch), elev: mean(zoomElev), afterElev };
}
const DE_PRESET = -0.12563;
const lm = launch(0);
check('Manual: the preset carries its down elevator through the zoom, the stick centred', Math.abs(lm.elev - DE_PRESET) < 1e-9, `${deg(lm.elev)} deg against ${deg(DE_PRESET)}`);
check('and lets it go at the top', lm.endMs !== null && Math.abs(lm.afterElev) < 1e-12, `the zoom ends at ${lm.endMs} ms, then ${lm.afterElev === null ? 'none' : deg(lm.afterElev)} deg`);
const ls = launch(1);
check('Stabilised: the zoom\'s first two seconds hold the release\'s 70 degrees, within 5', Math.abs(ls.pitch * DEG - 70) < 5, `${deg(ls.pitch)} deg, top ${ls.top.toFixed(1)} m`);
const la = launch(2);
check('Acro: the zoom\'s first two seconds hold the release\'s attitude, within 5 degrees', Math.abs(la.pitch * DEG - 70) < 5, `${deg(la.pitch)} deg, top ${la.top.toFixed(1)} m`);
check('in every mode the zoom ends at its top, 3 to 5 s after the throw', [lm, ls, la].every((o) => o.endMs > 3000 && o.endMs < 5000), [lm, ls, la].map((o) => o.endMs).join(', '));

console.log('surfaces');
must(sim.e.sim_wing_set_stab(0), 'clear stab');
throwAt(100, 8);
const A = 19 / DEG;
const T = 17.5 / DEG;
const R = 15.5 / DEG;
const close = (a, b) => Math.abs(a - b) < 1e-12;
fly(1, 0, 0, 0, 0.02);
let sf = surfaces();
check('full right roll: right flaperon trailing edge up 19 degrees, left down 19', close(sf[1], A) && close(sf[0], -A) && sf[2] === 0 && sf[3] === 0, sf.map(deg).join(' '));
const ws = wingSurfaces();
check('and sim_wing_surfaces reads the same two flaperons', ws[0] === sf[0] && ws[1] === sf[1], ws.map(deg).join(' '));
fly(0, 1, 0, 0, 0.02);
sf = surfaces();
check('full up: elevator trailing edge up 17.5 degrees, flaperons still', close(sf[2], T) && sf[0] === 0 && sf[1] === 0, sf.map(deg).join(' '));
fly(0, 0, 1, 0, 0.02);
sf = surfaces();
check('full right yaw: rudder trailing edge right, 15.5 degrees negative', close(sf[3], -R), sf.map(deg).join(' '));
fly(0, 0, -0.5, 0, 0.02);
sf = surfaces();
check('half left yaw: rudder trailing edge left, positive, with expo', sf[3] > 0 && sf[3] < 0.5 * R, sf.map(deg).join(' '));

console.log('the discus launch, refused where it does not belong');
must(sim.e.sim_set_airframe(6), 'radian');
check('on the Radian, which has no peg, sim_wing_discus is refused', sim.e.sim_wing_discus() !== SIM_OK && sim.e.sim_wing_discus_phase() === 0);
must(sim.e.sim_set_airframe(0), 'quad');
check('and on the five inch', sim.e.sim_wing_discus() !== SIM_OK);
must(sim.e.sim_set_airframe(DLG_AIRFRAME), 'dlg');
must(sim.e.sim_wing_discus(), 'discus');
must(sim.reset(), 'reset');
check('a reset ends a launch under way', sim.e.sim_wing_discus_phase() === 0);

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
