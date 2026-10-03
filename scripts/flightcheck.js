/*
 * flightcheck.js: measure the quad's flight characteristics off the compiled
 * module and put them next to STAGE1.md's declared reference airframe.
 *
 * npm run verify already bands eight of these. This exists for the two things
 * a band cannot tell you: what the numbers ARE, and whether the code still
 * agrees with the airframe the project says it is modelling. A check that is
 * inside its band can still be modelling a different aircraft from the one in
 * the specification, and that is exactly what this found.
 *
 * Read only. It measures, it does not tune.
 *
 * Usage, from the simulator root:  node scripts/flightcheck.js
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
import { THROTTLE_CAP_CHOICES } from '../configs/rates.js';
import { AIRFRAMES } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const G = 9.80665;

/*
 * WHICH AIRCRAFT. With no flag, plant 0, the five inch STAGE1.md declares
 * and every band below was written against: no pilot flies it since the
 * five inch was removed (2026-10-03), but it is still the reference the
 * verify suite flies. `--airframe=<id>` measures a quad in
 * configs/airframes.js instead, on its own plant and its own default tune,
 * with nothing declared beside it.
 *
 * It matters most for the throttle cap table at the bottom. That table is
 * read straight into the menu by configs/rates.js, and hover lands in a
 * different place on the stick on every machine: different sag, different
 * motor loading, and the cap's effect is measured rather than derived for
 * exactly that reason.
 */
const AIRFRAME_ID = process.argv.slice(2)
  .find((a) => a.startsWith('--airframe='))?.slice('--airframe='.length) ?? null;
const SEATED = AIRFRAME_ID ? AIRFRAMES.find((a) => a.id === AIRFRAME_ID && !a.fixedWing) : null;
if (AIRFRAME_ID && !SEATED) {
  throw new Error(`--airframe=${AIRFRAME_ID} is not a quad in configs/airframes.js`);
}
/*
 * --gravity=SCALE, default 1.0, which is the module's own default and the
 * machine every band below was written against. The shell asserts a
 * heavier normal through sim_set_gravity (see WEIGHT in src/ui/ui.js), and
 * the cap table configs/rates.js quotes in the throttle limit menu has to
 * be read off the machine a pilot actually flies, not the harness's. So the
 * table is regenerated with this flag at the shell's base, and every other
 * figure this script prints stays at 1.0 unless asked.
 */
const GRAVITY = Number(process.argv.slice(2)
  .find((a) => a.startsWith('--gravity='))?.slice('--gravity='.length) ?? '1');
if (!(GRAVITY >= 0.5 && GRAVITY <= 2.5)) {
  throw new Error(`--gravity=${GRAVITY} is outside the module's 0.5 to 2.5`);
}
function setGravity(sim) {
  if (GRAVITY === 1) {
    return;
  }
  const rc = sim.e.sim_set_gravity(GRAVITY);
  if (rc !== SIM_OK) {
    throw new Error(`sim_set_gravity returned ${rc}`);
  }
}
const MASS = SEATED ? SEATED.grams / 1000 : 0.71;

/* State indices, sim_abi.h. */
const ST = { T: 0, Z: 3, VX: 4, VZ: 6, P: 11, RPM0: 14, V: 18, I: 19 };

const wasm = await readFile(join(root, 'dist/sim.wasm'));
/* Plant 0's baseline is the fixture the whole verify suite is built on; a
 * seated quad's is its default tune, which is what the shell seats with
 * it. */
const config = await readFile(
  join(root, SEATED ? `configs/${SEATED.defaultTune}.diff` : 'tests/fixtures/config-baseline.diff'),
  'utf8',
);
/* A fresh cell. */
const CELL_V = 4.2;

/* The airframe is a mode that survives init, so it goes on before it, the
 * order the shell uses. */
function seat(sim) {
  if (!SEATED) {
    return;
  }
  const rc = sim.e.sim_set_airframe(SEATED.simId);
  if (rc !== SIM_OK) {
    throw new Error(`sim_set_airframe returned ${rc}`);
  }
}

async function fresh(cellV = CELL_V) {
  const sim = await loadSim(wasm);
  seat(sim);
  setGravity(sim);
  if (sim.init(config) !== SIM_OK) {
    throw new Error('sim_init failed');
  }
  sim.reset();
  sim.setCellVoltage(cellV);
  return sim;
}

/* Hold a stick set for ms milliseconds, sampling every step. */
function hold(sim, ms, sticks, onStep) {
  const s = { roll: 0, pitch: 0, yaw: 0, throttle: 0, ...sticks };
  let t = sim.readState().state[ST.T];
  for (let i = 0; i < ms; i += 1) {
    t += 0.001;
    sim.input(t, s.roll, s.pitch, s.yaw, s.throttle);
    sim.step(1);
    if (onStep) {
      onStep(i, sim.readState().state);
    }
  }
  return sim.readState().state;
}

/* Steady climb rate after settling at a fixed throttle, m/s. */
async function climbAt(throttle) {
  const sim = await fresh();
  hold(sim, 2500, { throttle });
  const a = sim.readState().state[ST.Z];
  hold(sim, 1000, { throttle });
  const b = sim.readState().state[ST.Z];
  return b - a;
}

/* The throttle that holds altitude, by bisection on the climb rate. */
async function hoverThrottle() {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 18; i += 1) {
    const mid = (lo + hi) / 2;
    if (await climbAt(mid) > 0) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return (lo + hi) / 2;
}

const rows = [];
function row(what, measured, declared, note) {
  rows.push({ what, measured, declared, note });
}

/* ---- static thrust, from the motors alone ---- */
const bench = await fresh();
bench.motorOverride(-1, 1.0);
hold(bench, 3000, { throttle: 0 });
const benchState = bench.readState().state;
const rpmFull = (benchState[ST.RPM0] + benchState[ST.RPM0 + 1]
  + benchState[ST.RPM0 + 2] + benchState[ST.RPM0 + 3]) / 4;
/* kt from plant.c, read off the compiled constants rather than typed:
 * thrust is kt * omega^2 per motor, and it is per airframe. Slot 10 is
 * PLANT.kt, slot 58 the static duct augmentation, 1.0 on an open prop. */
const KT = bench.e.sim_bf_debug(10);
const DUCT = typeof bench.e.sim_bf_debug === 'function' ? (bench.e.sim_bf_debug(58) || 1) : 1;
const wFull = rpmFull * Math.PI / 30;
const thrustFull = 4 * KT * wFull * wFull * DUCT;
const twr = thrustFull / (MASS * G);
/* STAGE1.md's 4.5 : 1 is plant 0's reference and nobody else's. */
const TWR_DECLARED = SEATED ? '' : '4.5 : 1';
const TWR_ALARM = SEATED ? Infinity : 5.5;
/* Not static, and the label says so: the override holds full duty on a
 * craft that is free to climb, and a climbing rotor unloads, so the rpm
 * here sits a percent or two over the derivation's and the figure with it.
 * The static value is the derivation's, kt times k_duct at the solved rpm. */
row('thrust to weight, climbing', `${twr.toFixed(2)} : 1`, TWR_DECLARED,
  twr > TWR_ALARM ? 'MORE THAN DOUBLE THE SPEC' : '');
row('full throttle RPM, per motor', `${rpmFull.toFixed(0)}`, '', '');
row('pack under full load', `${benchState[ST.V].toFixed(1)} V, ${benchState[ST.I].toFixed(0)} A`, '', '');

/* ---- hover ---- */
const hover = await hoverThrottle();
/* The hover band is check 5's, plant 0's; a seated quad is printed bare. */
const HOVER_BAND = SEATED ? [0, 1] : [0.20, 0.30];
const HOVER_LABEL = SEATED ? '' : '0.20 to 0.30 (check 5)';
row('hover throttle', hover.toFixed(3), HOVER_LABEL,
  hover < HOVER_BAND[0] ? 'below the band' : (hover > HOVER_BAND[1] ? 'above the band' : ''));
row('stick above hover', `${((1 - hover) * 100).toFixed(0)} percent of travel`, '', '');

/* ---- climb authority, which is what a throttle stick actually buys ---- */
const climbRows = [];
for (const t of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0]) {
  climbRows.push({ t, v: await climbAt(t) });
}

/* ---- angular response: roll acceleration from a step, which is torque over
 * inertia and so is the only direct read on the inertia tensor ---- */
const roll = await fresh();
hold(roll, 1500, { throttle: 0.35 });
let peakAccel = 0;
let lastP = roll.readState().state[ST.P];
hold(roll, 400, { throttle: 0.35, roll: 1 }, (i, st) => {
  const a = (st[ST.P] - lastP) / 0.001;
  lastP = st[ST.P];
  if (a > peakAccel) {
    peakAccel = a;
  }
});
row('peak roll acceleration', `${(peakAccel * 180 / Math.PI).toFixed(0)} deg/s^2`, '', '');

console.log(`\nFLIGHT CHARACTERISTICS, measured off dist/sim.wasm${GRAVITY === 1 ? '' : ` at gravity ${GRAVITY} times 9.80665`}\n`);
console.log(`${'quantity'.padEnd(30)}${'measured'.padEnd(26)}${'STAGE1.md says'.padEnd(24)}note`);
for (const r of rows) {
  console.log(`${r.what.padEnd(30)}${String(r.measured).padEnd(26)}${String(r.declared).padEnd(24)}${r.note}`);
}

console.log('\nCLIMB RATE AGAINST THROTTLE, steady state after 2.5 s\n');
console.log(`${'stick'.padStart(6)}${'climb m/s'.padStart(12)}   what the stick is doing`);
for (const c of climbRows) {
  const bar = '#'.repeat(Math.max(0, Math.round(Math.abs(c.v) / 1.2)));
  console.log(`${c.t.toFixed(2).padStart(6)}${c.v.toFixed(1).padStart(12)}   ${c.v < -0.5 ? 'falling ' : ''}${bar}`);
}

/* Where a pilot actually lives: the band around hover that gives a sane
 * climb, as a fraction of stick travel. */
const usable = climbRows.filter((c) => Math.abs(c.v) <= 8);
console.log(`\nhover sits at ${(hover * 100).toFixed(0)} percent of stick travel.`);
console.log(`sampled stick positions inside +/- 8 m/s: ${usable.map((c) => c.t.toFixed(2)).join(', ') || 'none'}`);

/*
 * The throttle cap, measured rather than assumed.
 *
 * This is the check that the setting reaches the motors at all. It appends
 * the same two rate profile lines the menu writes, re-inits, and finds hover
 * again: under SCALE, hover must move UP the stick by exactly 1/cap, and the
 * top of the stick must still reach full thrust times the cap.
 */
console.log('\nTHROTTLE CAP, Betaflight throttle_limit_type = SCALE\n');
console.log(`${'cap'.padStart(5)}${'hover stick'.padStart(14)}${'predicted'.padStart(12)}${'climb at full stick'.padStart(22)}`);
for (const cap of THROTTLE_CAP_CHOICES) {
  const lines = `\nrateprofile 0\nset throttle_limit_type = ${cap < 100 ? 'SCALE' : 'OFF'}\nset throttle_limit_percent = ${cap}\n`;
  const capped = async () => {
    const sim = await loadSim(wasm);
    seat(sim);
    setGravity(sim);
    if (sim.init(config + lines) !== SIM_OK) {
      throw new Error('sim_init failed with the cap lines');
    }
    sim.reset();
    sim.setCellVoltage(CELL_V);
    return sim;
  };
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 16; i += 1) {
    const mid = (lo + hi) / 2;
    const sim = await capped();
    hold(sim, 2500, { throttle: mid });
    const a = sim.readState().state[ST.Z];
    hold(sim, 1000, { throttle: mid });
    if (sim.readState().state[ST.Z] - a > 0) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  const stick = (lo + hi) / 2;
  const top = await capped();
  hold(top, 2500, { throttle: 1 });
  const z0 = top.readState().state[ST.Z];
  hold(top, 1000, { throttle: 1 });
  const climb = top.readState().state[ST.Z] - z0;
  console.log(
    `${String(cap).padStart(5)}${`${(stick * 100).toFixed(1)} pct`.padStart(14)}`
    + `${`${(hover / (cap / 100) * 100).toFixed(1)} pct`.padStart(12)}${`${climb.toFixed(1)} m/s`.padStart(22)}`,
  );
}
