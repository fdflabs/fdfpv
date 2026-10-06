/*
 * uglystik-stab-selftest.js: the Ugly Stik's stabiliser, acro, rudder and
 * surface readback, in the air and on its wheels, in Node.
 *
 * scripts/edge-stab-selftest.js flown on the Stik (docs/UGLYSTIK-STAGE1.md):
 * the same stabiliser as the other fixed wings' (src/native/plant_wing.c)
 * with the Stik's own gains, sized to RCM's travel limits, and the Cub's
 * bar: Stabilised flies level with the sticks centred and holds the bank
 * and pitch asked for; Acro holds the attitude it is left at, stops near
 * where the stick was centred, rolls at what it asks and holds inverted;
 * the rudder is the yaw stick in every mode. On its wheels, the Kadet's
 * tricycle checks: sitting on the grass the surfaces stay where the sticks
 * put them and nothing winds up; a take off with the heading held and a
 * firm pull at 1.2 Vs flies off straight in every mode; and the nose
 * wheel steers at a taxi. Last, the four surface angles the renderer reads
 * and their signs, RCM's throws at full stick. Run with npm run
 * uglystik:stab.
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
import { attitude, must, uglystikPrelude, uglystikGroundPrelude, uglystikTakeoffSticks, wheelLoads, wingDebug, RC_STEP_MS } from '../tests/lib/wingpilot.js';

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
  uglystikPrelude(sim);
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
throwAt(30, 17.3);
const level = fly(0, 0, 0, 0.75, 10);
check('centred sticks fly level: bank within 3 degrees', Math.abs(level.bank * DEG) < 3, `${deg(level.bank)} deg`);
check('and never banked past 8 degrees on the way', level.worstBank * DEG < 8, `${deg(level.worstBank)} deg`);
check('and hold the trim pitch within 4 degrees', Math.abs(level.pitch * DEG - 2) < 4, `${deg(level.pitch)} deg`);
check('and straight: under 15 m off the line after 10 s', Math.abs(level.y) < 15, `${level.y.toFixed(1)} m`);
check('at a cruising speed', level.v > 14 && level.v < 22, `${level.v.toFixed(1)} m/s`);
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
check('full right yaw stick wins over the coordinator: rudder right of half its throw', surfaces()[3] * DEG < -7.31, `rudder ${deg(surfaces()[3])} deg`);
check('and yaws the nose right', yawed.r * DEG > 3, `${deg(yawed.r)} deg/s`);
const unyawed = fly(0, 0, 0, 0.75, 4);
check('and letting go of it levels the wings again', Math.abs(unyawed.bank * DEG) < 4, `${deg(unyawed.bank)} deg`);

console.log('acro');
must(sim.e.sim_wing_set_stab(2), 'set acro');
throwAt(30, 17.3);
const acroLevel = fly(0, 0, 0, 0.75, 1);
const acroHold = fly(0, 0, 0, 0.75, 9, acroLevel.endBank);
check('centred sticks hold the attitude: bank within 3 degrees over 9 s', acroHold.worst * DEG < 3, `${deg(acroHold.worst)} deg`);
check('and the pitch where it was, within 3 degrees', Math.abs((acroHold.endPitch - acroLevel.endPitch) * DEG) < 3, `${deg(acroLevel.endPitch)} -> ${deg(acroHold.endPitch)} deg`);
check('and straight: under 15 m off the line after 10 s', Math.abs(acroHold.y) < 15, `${acroHold.y.toFixed(1)} m`);

throwAt(120, 17.3);
fly(0, 0, 0, 0.75, 1);
const rolling = fly(1, 0, 0, 0.75, 0.6);
check('full right stick rolls at 68 to 92 degrees a second, the 80 Acro asks', rolling.p * DEG > 68 && rolling.p * DEG < 92, `${deg(rolling.p)} deg/s`);
const inverted = fly(1, 0, 0, 0.75, 1.6);
const invHold = fly(0, 0, 0, 1.0, 0.3);
const invLater = fly(0, 0, 0, 1.0, 2, invHold.endBank);
check('and it keeps going past the stabilised cap: 150 degrees or more', Math.abs(inverted.endBank) * DEG > 150, `${deg(inverted.endBank)} deg`);
check('centred, it stays where it stopped: within 5 degrees for 2 s', invLater.worst * DEG < 5, `${deg(invHold.endBank)} deg, moved ${deg(invLater.worst)}`);

throwAt(120, 17.3);
fly(0, 0, 0, 0.75, 1);
const partial = fly(0.6, 0, 0, 0.75, 0.5);
const stop = fly(0, 0, 0, 0.75, 0.3);
const stopHeld = fly(0, 0, 0, 0.75, 3, stop.endBank);
check('a partial roll stops sharply: rate under 10 degrees a second 0.3 s after centring', Math.abs(stop.p * DEG) < 10, `${deg(stop.p)} deg/s`);
check('within about 5 degrees of where the stick was centred', Math.abs((stop.endBank - partial.endBank) * DEG) < 6, `${deg(partial.endBank)} -> ${deg(stop.endBank)} deg`);
check('and holds that bank, no levelling, within 4 degrees over 3 s', stop.endBank * DEG > 15 && stopHeld.worst * DEG < 4, `${deg(stop.endBank)} deg, moved ${deg(stopHeld.worst)}`);

throwAt(120, 17.3);
fly(0, 0, 0, 0.75, 1);
const pulling = fly(0, 1, 0, 0.75, 0.5);
check('full up stick pitches at 51 to 69 degrees a second, the 60 Acro asks, short of the accelerated stall at the trim, 76, and does not snap', pulling.q * DEG > 51 && pulling.q * DEG < 69 && Math.abs(pulling.p * DEG) < 30, `${deg(pulling.q)} deg/s, roll ${deg(pulling.p)} deg/s`);
throwAt(120, 17.3);
fly(0, 0, 0, 0.75, 1);
fly(0, 0.5, 0, 0.75, 0.4);
const pitched = fly(0, 0, 0, 0.75, 0.3);
const pitchHeld = fly(0, 0, 0, 0.75, 2);
check('a nose up input is held, not trimmed away: within 4 degrees over 2 s', pitched.endPitch * DEG > 8 && Math.abs((pitchHeld.endPitch - pitched.endPitch) * DEG) < 4, `${deg(pitched.endPitch)} -> ${deg(pitchHeld.endPitch)} deg`);

/* On its back: rolled over and let go, Acro holds it inverted and level,
 * where Manual needs half the stick of down elevator. The Stik rolls at
 * 80 deg/s, so a flip takes over two seconds and the nose falls through
 * it: it is pulled up 30 deg first, as a pilot does, and comes out near
 * level on its back. */
throwAt(120, 17.3);
fly(0, 0, 0, 1.0, 1);
fly(0, 1, 0, 1.0, 0.5);
fly(1, 0, 0, 1.0, 1.15);
fly(1, 0, 0, 1.0, 1.15);
const flipped = fly(0, 0, 0, 0.75, 0.5);
const invFlown = fly(0, 0, 0, 0.75, 5, flipped.endBank);
check('rolled over and let go, Acro flies it on its back: bank within 5 degrees for 5 s', Math.abs(flipped.endBank) * DEG > 150 && invFlown.worst * DEG < 5, `${deg(flipped.endBank)} deg, moved ${deg(invFlown.worst)}`);
check('and its pitch where it was left, within 4 degrees', Math.abs((invFlown.endPitch - flipped.endPitch) * DEG) < 4, `${deg(flipped.endPitch)} -> ${deg(invFlown.endPitch)} deg`);

throwAt(120, 17.3);
fly(0, 0, 0, 0.75, 1);
const beforeYaw = fly(0, 0, 0, 0.75, 0.5);
const acroYaw = fly(0, 0, 1, 0.75, 1);
check('full right yaw stick yaws the nose right', acroYaw.rAll * DEG > 3, `${deg(acroYaw.rAll)} deg/s over the hold`);
check('and the roll lock holds the bank against it, within 5 degrees', Math.abs((acroYaw.endBank - beforeYaw.endBank) * DEG) < 5, `${deg(beforeYaw.endBank)} -> ${deg(acroYaw.endBank)} deg`);

console.log('manual');
must(sim.e.sim_wing_set_stab(0), 'clear stab');
throwAt(30, 17.3);
const manual = fly(1, 0, 0, 0.75, 1.5);
check('with the stabiliser off, full stick rolls past the 60 degree cap', manual.worstBank * DEG > 70, `${deg(manual.worstBank)} deg in 1.5 s`);
must(sim.reset(), 'reset');
check('a reset keeps the setting', sim.e.sim_wing_stab() === 0);

console.log('surfaces');
throwAt(30, 17.3);
/* RCM's travel limits, the table's angles. */
const A = 12.5969 * 3.14159265358979323846 / 180;
const T = 12.9765 * 3.14159265358979323846 / 180;
const R = 14.6270 * 3.14159265358979323846 / 180;
const close = (a, b) => Math.abs(a - b) < 1e-12;
fly(1, 0, 0, 0.5, 0.02);
let sf = surfaces();
check('full right roll: right aileron trailing edge up 12.6 degrees, left down 12.6', close(sf[1], A) && close(sf[0], -A) && sf[2] === 0 && sf[3] === 0, sf.map(deg).join(' '));
const ws = wingSurfaces();
check('and sim_wing_surfaces reads the same two ailerons', ws[0] === sf[0] && ws[1] === sf[1], ws.map(deg).join(' '));
fly(0, 1, 0, 0.5, 0.02);
sf = surfaces();
check('full up: elevator trailing edge up 13.0 degrees, ailerons still', close(sf[2], T) && sf[0] === 0 && sf[1] === 0, sf.map(deg).join(' '));
fly(0, 0, 1, 0.5, 0.02);
sf = surfaces();
check('full right yaw: rudder trailing edge right, 14.6 degrees negative', close(sf[3], -R), sf.map(deg).join(' '));
fly(0, 0, -0.5, 0.5, 0.02);
sf = surfaces();
check('half left yaw: rudder trailing edge left, positive, with expo', sf[3] > 0 && sf[3] < 0.5 * R, sf.map(deg).join(' '));
check('a null pointer is refused', sim.e.sim_plane_surfaces(0) !== SIM_OK);

console.log('on the wheels');
const heading = (s) => Math.atan2(2 * (s[7] * s[10] + s[8] * s[9]), 1 - 2 * (s[9] * s[9] + s[10] * s[10]));
/* The Stik standing at the end of the strip in a mode, then sticks from a
 * function of the time, for a while. Records what the checks need; stops
 * early once the aircraft has been off its wheels for untilAirborneMs. */
function onGround(mode) {
  must(sim.e.sim_wing_set_stab(mode), 'set mode');
  must(sim.reset(), 'reset');
  clockMs = 0;
  uglystikGroundPrelude(sim, { mu: GROUND_MU, e: GROUND_E });
}
function roll(sticks, seconds, { untilAirborneMs = null } = {}) {
  const out = { worstSurf: [0, 0, 0, 0], worstBank: 0, worstY: 0, liftoff: null, last: null, airborneMs: 0, s: null };
  for (let ms = 0; ms < seconds * 1000; ms += RC_STEP_MS) {
    must(sim.input((clockMs + ms) / 1000, ...sticks(ms)), 'input');
    must(sim.step(RC_STEP_MS), 'step');
    const s = sim.readState().state;
    out.s = s;
    const sf2 = surfaces();
    for (let i = 0; i < 4; i += 1) out.worstSurf[i] = Math.max(out.worstSurf[i], Math.abs(sf2[i]));
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
  const sf2 = surfaces();
  check('full right and up stick held 2 s on the ground is full aileron and elevator, nothing more', Math.abs(held.worstSurf[1] - A) < 1e-9 && Math.abs(held.worstSurf[2] - T) < 1e-9 && sf2.every((x) => x === 0), `${held.worstSurf.map(deg).join(' ')}, then ${sf2.map(deg).join(' ')}`);
  check('and no wind up: released, every surface is back at zero on the next step', sf2.every((x) => x === 0), sf2.map(deg).join(' '));
}

for (const [mode, name] of [[0, 'Manual'], [1, 'Stabilised'], [2, 'Acro']]) {
  onGround(mode);
  roll(() => [0, 0, 0, 0], 1);
  const run = roll(() => [...uglystikTakeoffSticks(sim.readState().state), 1], 8, { untilAirborneMs: 2000 });
  const lof = run.liftoff;
  check(`${name}, full throttle, the heading held and a firm pull at 1.2 Vs: it flies off the strip`, lof !== null, lof ? `at ${lof.x.toFixed(1)} m and ${lof.v.toFixed(1)} m/s` : 'never left the ground');
  if (!lof) continue;
  check('tracking straight: heading within 5 degrees and under 0.5 m off the line at liftoff', Math.abs(lof.heading * DEG) < 5 && run.worstY < 0.5, `heading ${deg(lof.heading)} deg, ${run.worstY.toFixed(2)} m off`);
  check('wings level the whole roll: bank under 5 degrees to liftoff', run.worstBank * DEG < 5, `${deg(run.worstBank)} deg`);
  if (mode === 2) {
    const after = roll(() => [0, 0, 0, 1], 2);
    check('and Acro holds the attitude it lifted off in, pitch within 4 degrees 2 s later', Math.abs((attitude(after.s).pitch - lof.pitch) * DEG) < 4, `${deg(lof.pitch)} -> ${deg(attitude(after.s).pitch)} deg`);
  }
}

/* The nose wheel steers with the rudder, 0.6 of its angle: at a walk with
 * full right yaw stick held, it comes round well past 90 deg in 4 s on its
 * 1.94 m radius. Every mode flies as Manual on the wheels. */
for (const [mode, name] of [[0, 'Manual'], [1, 'Stabilised'], [2, 'Acro']]) {
  onGround(mode);
  roll(() => [0, 0, 0, 0.1], 2);
  let prev = heading(sim.readState().state);
  let turned = 0;
  let allLoaded = true;
  for (let k = 0; k < 40; k += 1) {
    const taxi = roll(() => [0, 0, 1, 0.1], 0.1);
    const h = heading(taxi.s);
    turned += Math.atan2(Math.sin(h - prev), Math.cos(h - prev)) * DEG;
    prev = h;
    allLoaded = allLoaded && wheelLoads(sim).slice(0, 3).every((f) => f > 0);
  }
  const v = Math.hypot(sim.readState().state[4], sim.readState().state[5]);
  check(`${name}, taxiing: full right yaw stick turns it right on its nose wheel, past 45 degrees in 4 s, on all three wheels`, turned < -45 && allLoaded, `${turned.toFixed(1)} deg at ${v.toFixed(1)} m/s`);
}

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
