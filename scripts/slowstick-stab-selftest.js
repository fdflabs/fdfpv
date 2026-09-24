/*
 * slowstick-stab-selftest.js: the Slow Stick's stabiliser, acro, rudder mix
 * and surface readback, in the air and on its wheels, in Node.
 *
 * The same stabiliser as the other fixed wings' (src/native/plant_wing.c)
 * with the Slow Stick's own gains, and one difference that runs through
 * all of it: there are no ailerons. The roll stick is a second rudder
 * stick, so every roll the stabiliser or the pilot asks for is flown on the
 * rudder through the dihedral, and there is no turn coordinator, because
 * the rudder is the roll control. The bar is the Cub's where a rudder can
 * meet it and slower where it cannot, and says so: Stabilised flies level
 * and holds the bank and pitch asked for; Acro holds the attitude it is
 * left at and stops a roll near where the stick was centred, but is not
 * asked to roll inverted, which a rudder and twelve degrees of dihedral
 * cannot do; Manual is the airframe, which levels itself. Then the mix as
 * numbers, the aileron slots reading zero, and on the wheels: no wind up
 * sitting still, a take off with the sticks centred in every mode, and the
 * roll stick steering the tailwheel. Run with npm run slowstick:stab.
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
import { attitude, must, slowstickPrelude, slowstickGroundPrelude, wheelLoads, wingDebug, RC_STEP_MS } from '../tests/lib/wingpilot.js';

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
  slowstickPrelude(sim);
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
    v: Math.hypot(s[4], s[5], s[6]), vz: s[6], z: s[3], y: s[2],
  };
}

const deg = (x) => (x * DEG).toFixed(1);

console.log('stabilised');
must(sim.e.sim_wing_set_stab(1), 'set stab');
throwAt(3, 6);
const level = fly(0, 0, 0, 0.75, 10);
check('centred sticks fly level: bank within 3 degrees', Math.abs(level.bank * DEG) < 3, `${deg(level.bank)} deg`);
check('and never banked past 8 degrees on the way', level.worstBank * DEG < 8, `${deg(level.worstBank)} deg`);
check('and hold the trim pitch within 4 degrees', Math.abs(level.pitch * DEG - 2) < 4, `${deg(level.pitch)} deg`);
check('and straight: under 10 m off the line after 10 s', Math.abs(level.y) < 10, `${level.y.toFixed(1)} m`);
check('at the Slow Stick\'s cruise', level.v > 4.5 && level.v < 7, `${level.v.toFixed(1)} m/s`);
check('with the climb rate under 1 m/s', Math.abs(level.vz) < 1, `${level.vz.toFixed(2)} m/s`);
const banked = fly(1, 0, 0, 0.9, 5);
check('full right roll stick banks right on the rudder, 35 to 50 degrees', banked.bank * DEG > 35 && banked.bank * DEG < 50, `${deg(banked.bank)} deg`);
check('and the rudder is what did it: no aileron moved', surfaces()[0] === 0 && surfaces()[1] === 0, surfaces().map(deg).join(' '));
const rolledBack = fly(0, 0, 0, 0.75, 4);
check('letting go levels it within 4 s', Math.abs(rolledBack.bank * DEG) < 5, `${deg(rolledBack.bank)} deg`);
const leftBank = fly(-0.5, 0, 0, 0.75, 5);
check('half left stick banks left about 20 degrees', leftBank.bank * DEG < -13 && leftBank.bank * DEG > -28, `${deg(leftBank.bank)} deg`);
fly(0, 0, 0, 0.75, 4);
const nosedUp = fly(0, 0.6, 0, 1.0, 2);
check('up stick lifts the nose, 8 to 30 degrees, no tumble', nosedUp.pitch * DEG > 8 && nosedUp.pitch * DEG < 30 && nosedUp.worstBank * DEG < 15, `${deg(nosedUp.pitch)} deg, bank ${deg(nosedUp.worstBank)}`);
const settled = fly(0, 0, 0, 0.75, 5);
check('and centring brings it back to trim', Math.abs(settled.pitch * DEG - 2) < 4 && Math.abs(settled.bank * DEG) < 4, `pitch ${deg(settled.pitch)}, bank ${deg(settled.bank)}`);
const yawed = fly(0, 0, 1, 0.75, 1);
/* The yaw stick and the level hold share the one surface here, so the hold
 * takes back much of the yaw stick's rudder to keep the wings level; the
 * stick still wins, by less than on an aircraft with ailerons. */
check('full right yaw stick is rudder too, and wins over the level hold: right of a quarter of its throw', surfaces()[3] * DEG < -7.5, `rudder ${deg(surfaces()[3])} deg`);
check('and yaws the nose right', yawed.r * DEG > 3, `${deg(yawed.r)} deg/s`);
const unyawed = fly(0, 0, 0, 0.75, 5);
check('and letting go of it levels the wings again', Math.abs(unyawed.bank * DEG) < 4, `${deg(unyawed.bank)} deg`);

console.log('acro');
must(sim.e.sim_wing_set_stab(2), 'set acro');
throwAt(3, 6);
const acroLevel = fly(0, 0, 0, 0.75, 1);
const acroHold = fly(0, 0, 0, 0.75, 9, acroLevel.endBank);
check('centred sticks hold the attitude: bank within 3 degrees over 9 s', acroHold.worst * DEG < 3, `${deg(acroHold.worst)} deg`);
check('and the pitch where it was, within 3 degrees', Math.abs((acroHold.endPitch - acroLevel.endPitch) * DEG) < 3, `${deg(acroLevel.endPitch)} -> ${deg(acroHold.endPitch)} deg`);

throwAt(60, 6.5);
fly(0, 0, 0, 0.9, 2);
const rolling = fly(1, 0, 0, 0.9, 0.8);
check('full right stick rolls on the rudder at 35 to 70 degrees a second', rolling.p * DEG > 35 && rolling.p * DEG < 70, `${deg(rolling.p)} deg/s`);

throwAt(60, 6.5);
fly(0, 0, 0, 0.9, 2);
const partial = fly(0.6, 0, 0, 0.9, 0.8);
const stop = fly(0, 0, 0, 0.9, 0.6);
const stopHeld = fly(0, 0, 0, 0.9, 4, stop.endBank);
check('a partial roll stops: rate under 10 degrees a second 0.6 s after centring', Math.abs(stop.p * DEG) < 10, `${deg(stop.p)} deg/s`);
check('within about 8 degrees of where the stick was centred', Math.abs((stop.endBank - partial.endBank) * DEG) < 8, `${deg(partial.endBank)} -> ${deg(stop.endBank)} deg`);
check('and holds that bank against the dihedral, within 4 degrees over 4 s', stop.endBank * DEG > 10 && stopHeld.worst * DEG < 4, `${deg(stop.endBank)} deg, moved ${deg(stopHeld.worst)}`);

throwAt(60, 6.5);
fly(0, 0, 0, 0.9, 2);
const pulling = fly(0, 1, 0, 0.9, 0.5);
check('full up stick pitches at 45 to 71 degrees a second', pulling.q * DEG > 45 && pulling.q * DEG < 71, `${deg(pulling.q)} deg/s`);
throwAt(60, 6.5);
fly(0, 0, 0, 0.9, 2);
fly(0, 0.5, 0, 0.9, 0.3);
const pitched = fly(0, 0, 0, 0.9, 0.3);
const pitchHeld = fly(0, 0, 0, 0.9, 2);
check('a nose up input is held, not trimmed away: within 4 degrees over 2 s', pitched.endPitch * DEG > 6 && Math.abs((pitchHeld.endPitch - pitched.endPitch) * DEG) < 4, `${deg(pitched.endPitch)} -> ${deg(pitchHeld.endPitch)} deg`);

console.log('manual');
must(sim.e.sim_wing_set_stab(0), 'clear stab');
throwAt(3, 6);
fly(0, 0, 0, 0.75, 2);
const manual = fly(1, 0, 0, 0.75, 1.5);
check('with the stabiliser off, full roll stick banks it right on the rudder, past 30 degrees', manual.endBank * DEG > 30, `${deg(manual.endBank)} deg in 1.5 s`);
const selfLevel = fly(0, 0, 0, 0.75, 8);
check('and let go, the dihedral levels it: under 15 degrees 8 s later, no roll through', Math.abs(selfLevel.endBank * DEG) < 15 && selfLevel.endBank > -5 / DEG, `${deg(selfLevel.endBank)} deg`);
must(sim.reset(), 'reset');
check('a reset keeps the setting', sim.e.sim_wing_stab() === 0);

console.log('surfaces');
throwAt(30, 6);
const T = 15 / DEG;
const R = 30 / DEG;
const close = (a, b) => Math.abs(a - b) < 1e-12;
fly(1, 0, 0, 0.5, 0.02);
let sf = surfaces();
check('full right roll: full right rudder, 30 degrees negative, and no aileron', close(sf[3], -R) && sf[0] === 0 && sf[1] === 0 && sf[2] === 0, sf.map(deg).join(' '));
const ws = wingSurfaces();
check('and sim_wing_surfaces reads the two aileron slots as zero', ws[0] === 0 && ws[1] === 0, ws.map(deg).join(' '));
fly(0, 0, 1, 0.5, 0.02);
sf = surfaces();
check('full right yaw: the same full right rudder', close(sf[3], -R) && sf[0] === 0 && sf[1] === 0, sf.map(deg).join(' '));
fly(1, 0, 1, 0.5, 0.02);
sf = surfaces();
check('both right together clip at the rudder\'s travel', close(sf[3], -R), sf.map(deg).join(' '));
fly(1, 0, -1, 0.5, 0.02);
sf = surfaces();
check('right roll and left yaw cancel', sf[3] === 0, sf.map(deg).join(' '));
fly(-0.5, 0, 0, 0.5, 0.02);
sf = surfaces();
check('half left roll: rudder trailing edge left, positive, with expo', sf[3] > 0 && sf[3] < 0.5 * R, sf.map(deg).join(' '));
fly(0, 1, 0, 0.5, 0.02);
sf = surfaces();
check('full up: elevator trailing edge up 15 degrees, rudder still', close(sf[2], T) && sf[3] === 0 && sf[0] === 0 && sf[1] === 0, sf.map(deg).join(' '));
check('a null pointer is refused', sim.e.sim_plane_surfaces(0) !== SIM_OK);

console.log('on the wheels');
const heading = (s) => Math.atan2(2 * (s[7] * s[10] + s[8] * s[9]), 1 - 2 * (s[9] * s[9] + s[10] * s[10]));
/* The Slow Stick standing at the end of the strip in a mode, then sticks
 * from a function of the time, for a while. Records what the checks need;
 * stops early once the aircraft has been off its wheels for untilAirborneMs. */
function onGround(mode) {
  must(sim.e.sim_wing_set_stab(mode), 'set mode');
  must(sim.reset(), 'reset');
  clockMs = 0;
  slowstickGroundPrelude(sim, { mu: GROUND_MU, e: GROUND_E });
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
  check('full right and up stick held 2 s on the ground is full rudder and elevator, nothing more', Math.abs(held.worstSurf[3] - 30 / DEG) < 1e-9 && Math.abs(held.worstSurf[2] - 15 / DEG) < 1e-9 && held.worstSurf[0] === 0 && held.worstSurf[1] === 0, `${held.worstSurf.map(deg).join(' ')}, then ${sf.map(deg).join(' ')}`);
  check('and no wind up: released, every surface is back at zero on the next step', sf.every((x) => x === 0), sf.map(deg).join(' '));
}

for (const [mode, name] of [[0, 'Manual'], [1, 'Stabilised'], [2, 'Acro']]) {
  onGround(mode);
  roll(() => [0, 0, 0, 0], 1);
  const run = roll(() => [0, 0, 0, 1], 8, { untilAirborneMs: 2000 });
  const lof = run.liftoff;
  check(`${name}, full throttle and the sticks centred: it flies off the strip`, lof !== null, lof ? `at ${lof.x.toFixed(1)} m and ${lof.v.toFixed(1)} m/s` : 'never left the ground');
  if (!lof) continue;
  check('tracking straight: heading within 5 degrees and under 0.5 m off the line at liftoff', Math.abs(lof.heading * DEG) < 5 && run.worstY < 0.5, `heading ${deg(lof.heading)} deg, ${run.worstY.toFixed(2)} m off`);
  check('wings level the whole roll: bank under 5 degrees to liftoff', run.worstBank * DEG < 5, `${deg(run.worstBank)} deg`);
  if (mode === 2) {
    const after = roll(() => [0, 0, 0, 1], 2);
    check('and Acro holds the attitude it lifted off in, pitch within 4 degrees 2 s later', Math.abs((attitude(after.s).pitch - lof.pitch) * DEG) < 4, `${deg(lof.pitch)} -> ${deg(attitude(after.s).pitch)} deg`);
  }
}

for (const [mode, name] of [[0, 'Manual'], [1, 'Stabilised'], [2, 'Acro']]) {
  onGround(mode);
  /* Half throttle: at the Cub's 35 percent this aircraft's thrust only
   * just meets its rolling resistance. The heading summed step by step,
   * since a turn this tight goes round more than once in 4 s. */
  roll(() => [0, 0, 0, 0.5], 2);
  let prev = heading(sim.readState().state);
  let turned = 0;
  let allLoaded = true;
  for (let k = 0; k < 40; k += 1) {
    const taxi = roll(() => [1, 0, 0, 0.5], 0.1);
    const h = heading(taxi.s);
    turned += Math.atan2(Math.sin(h - prev), Math.cos(h - prev)) * DEG;
    prev = h;
    allLoaded = allLoaded && wheelLoads(sim).slice(0, 3).every((f) => f > 0);
  }
  check(`${name}, taxiing: full right roll stick steers the tailwheel right, over 45 degrees in 4 s`, turned < -45 && allLoaded, `${turned.toFixed(0)} deg`);
}

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
