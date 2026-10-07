/*
 * flightcheck.js: what a quad's flight characteristics are, measured by
 * flying it headlessly on dist/sim.wasm: thrust to weight, hover throttle,
 * climb rate per stick position, peak roll acceleration and the effect of
 * each Betaflight throttle cap, beside the figures STAGE1.md declares for
 * plant 0. A tool, not a check: it prints and exits 0, and only a crash
 * (bad argument, missing file, the module refusing a call) exits non-zero.
 *
 *   node scripts/flightcheck.js [--airframe=<id>] [--gravity=<scale>]
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

/*
 * The verify suite already bands several of these figures, but a band only
 * says "inside tolerance": it cannot say what the number is, nor whether
 * the code still models the aircraft the specification declares. A check
 * inside its band can be modelling a different aircraft, and this tool is
 * what found that. It measures; it never tunes.
 *
 * With no flag it flies plant 0, the five inch STAGE1.md declares and every
 * band was written against. Nobody flies it since the five inch left the
 * game (2026-10-03), but the verify suite still does. --airframe measures a
 * quad from configs/airframes.js on its own plant and default tune, with
 * nothing declared beside it.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { AIRFRAMES } from '../configs/airframes.js';
import { THROTTLE_CAP_CHOICES } from '../configs/rates.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const G = 9.80665;

const argOf = (prefix) => process.argv.slice(2).find((a) => a.startsWith(prefix))?.slice(prefix.length);

const airframeId = argOf('--airframe=') || '';
const seat = airframeId ? AIRFRAMES.find((a) => a.id === airframeId && !a.fixedWing) : null;
if (airframeId && !seat) {
  throw new Error(`--airframe=${airframeId} is not a quad in configs/airframes.js`);
}

/*
 * The shell can assert a heavier normal through sim_set_gravity, and the cap
 * table quoted in the menu must be read off the machine a pilot flies. 1.0
 * is the module's own default, so it is never sent.
 */
const gravityText = argOf('--gravity=');
const gravity = gravityText === undefined ? 1 : Number(gravityText);
if (!(gravity >= 0.5 && gravity <= 2.5)) {
  throw new Error(`--gravity=${gravity} is outside the module's 0.5 to 2.5`);
}

const plant0 = !seat;
const massKg = seat ? seat.grams / 1000 : 0.71;
const wasm = readFileSync(join(ROOT, 'dist/sim.wasm'));
const baseText = readFileSync(join(ROOT, seat ? `configs/${seat.defaultTune}.diff` : 'tests/fixtures/config-baseline.diff'), 'utf8');
const baseConfig = { text: baseText, failure: 'sim_init failed' };

/* The airframe is a mode that survives init, so it is seated first, the
 * order the shell uses. */
async function freshSim(config) {
  const sim = await loadSim(wasm);
  if (seat) {
    const rc = sim.e.sim_set_airframe(seat.simId);
    if (rc !== SIM_OK) {
      throw new Error(`sim_set_airframe returned ${rc}`);
    }
  }
  if (gravity !== 1) {
    const rc = sim.e.sim_set_gravity(gravity);
    if (rc !== SIM_OK) {
      throw new Error(`sim_set_gravity returned ${rc}`);
    }
  }
  if (sim.init(config.text) !== SIM_OK) {
    throw new Error(config.failure);
  }
  sim.reset();
  sim.setCellVoltage(4.2);
  return sim;
}

/*
 * One input per 1 ms step, timestamped ahead of the step and accumulated
 * from the state's own clock. The printed digits depend on this exact
 * timing. `each` sees the state after every step when given.
 */
function hold(sim, ms, sticks, each = null) {
  const { roll = 0, pitch = 0, yaw = 0, throttle = 0 } = sticks;
  let t = sim.readState().state[0];
  for (let i = 0; i < ms; i++) {
    t += 0.001;
    sim.input(t, roll, pitch, yaw, throttle);
    sim.step(1);
    if (each) {
      each(sim.readState().state);
    }
  }
  return sim.readState().state;
}

/* Metres gained in the second after 2.5 s held at `throttle`. */
async function climbAt(throttle, config = baseConfig) {
  const sim = await freshSim(config);
  const zA = hold(sim, 2500, { throttle })[3];
  const zB = hold(sim, 1000, { throttle })[3];
  return zB - zA;
}

async function hoverStick(steps, config = baseConfig) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < steps; i++) {
    const mid = (lo + hi) / 2;
    if ((await climbAt(mid, config)) > 0) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return (lo + hi) / 2;
}

/*
 * The full duty override runs on a craft free to climb, and a climbing
 * rotor unloads, so rpm (and the ratio) sit a percent or two above the
 * static derivation: hence "climbing". kt and the duct augmentation are per
 * airframe, so they are read off the compiled plant rather than typed in.
 * The weight is nominal (G, not the --gravity scale).
 */
async function bench() {
  const sim = await freshSim(baseConfig);
  sim.motorOverride(-1, 1.0);
  const s = hold(sim, 3000, { throttle: 0 });
  const rpm = (s[14] + s[15] + s[16] + s[17]) / 4;
  const kt = sim.e.sim_bf_debug(10);
  const duct = sim.e.sim_bf_debug(58) || 1;
  const omega = (rpm * Math.PI) / 30;
  const twr = (4 * kt * omega * omega * duct) / (massKg * G);
  return { twr, rpm, volts: s[18], amps: s[19] };
}

async function peakRollAccel() {
  const sim = await freshSim(baseConfig);
  let p = hold(sim, 1500, { throttle: 0.35 })[11];
  let peak = 0;
  hold(sim, 400, { throttle: 0.35, roll: 1 }, (s) => {
    peak = Math.max(peak, (s[11] - p) / 0.001);
    p = s[11];
  });
  return peak;
}

const capConfig = (cap) => ({
  text: `${baseText}\nrateprofile 0\nset throttle_limit_type = ${cap < 100 ? 'SCALE' : 'OFF'}\nset throttle_limit_percent = ${cap}\n`,
  failure: 'sim_init failed with the cap lines',
});

const CLIMB_STICKS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0];

const b = await bench();
const hover = await hoverStick(18);
const climbs = [];
for (const throttle of CLIMB_STICKS) {
  climbs.push({ throttle, climb: await climbAt(throttle) });
}
const rollPeak = await peakRollAccel();

/* The 4.5 : 1 and the hover band belong to plant 0 only. */
let hoverNote = '';
if (plant0 && hover < 0.20) {
  hoverNote = 'below the band';
} else if (plant0 && hover > 0.30) {
  hoverNote = 'above the band';
}
const rows = [
  ['thrust to weight, climbing', `${b.twr.toFixed(2)} : 1`, plant0 ? '4.5 : 1' : '', plant0 && b.twr > 5.5 ? 'MORE THAN DOUBLE THE SPEC' : ''],
  ['full throttle RPM, per motor', b.rpm.toFixed(0), '', ''],
  ['pack under full load', `${b.volts.toFixed(1)} V, ${b.amps.toFixed(0)} A`, '', ''],
  ['hover throttle', hover.toFixed(3), plant0 ? '0.20 to 0.30 (check 5)' : '', hoverNote],
  ['stick above hover', `${((1 - hover) * 100).toFixed(0)} percent of travel`, '', ''],
  ['peak roll acceleration', `${((rollPeak * 180) / Math.PI).toFixed(0)} deg/s^2`, '', ''],
];
const tableLine = ([name, measured, declared, note]) => `${name.padEnd(30)}${measured.padEnd(26)}${declared.padEnd(24)}${note}`;

console.log('');
console.log(`FLIGHT CHARACTERISTICS, measured off dist/sim.wasm${gravity !== 1 ? ` at gravity ${gravity} times 9.80665` : ''}`);
console.log('');
console.log(tableLine(['quantity', 'measured', 'STAGE1.md says', 'note']));
rows.forEach((r) => console.log(tableLine(r)));

console.log('');
console.log('CLIMB RATE AGAINST THROTTLE, steady state after 2.5 s');
console.log('');
console.log(`${'stick'.padStart(6)}${'climb m/s'.padStart(12)}   what the stick is doing`);
for (const { throttle, climb } of climbs) {
  const bar = `${climb < -0.5 ? 'falling ' : ''}${'#'.repeat(Math.max(0, Math.round(Math.abs(climb) / 1.2)))}`;
  console.log(`${throttle.toFixed(2).padStart(6)}${climb.toFixed(1).padStart(12)}   ${bar}`);
}
const gentle = climbs.filter((c) => Math.abs(c.climb) <= 8).map((c) => c.throttle.toFixed(2));
console.log('');
console.log(`hover sits at ${(hover * 100).toFixed(0)} percent of stick travel.`);
console.log(`sampled stick positions inside +/- 8 m/s: ${gentle.length ? gentle.join(', ') : 'none'}`);

/*
 * configs/rates.js copies the hover column of this table into the menu's
 * hover hint, per airframe. Hover lands at a different stick on every
 * machine (sag, motor loading), so the cap's effect is measured: hover over
 * the cap (the predicted column) overstates it.
 */
console.log('');
console.log('THROTTLE CAP, Betaflight throttle_limit_type = SCALE');
console.log('');
console.log(`${'cap'.padStart(5)}${'hover stick'.padStart(14)}${'predicted'.padStart(12)}${'climb at full stick'.padStart(22)}`);
for (const cap of THROTTLE_CAP_CHOICES) {
  const config = capConfig(cap);
  const stick = await hoverStick(16, config);
  const top = await freshSim(config);
  const z0 = hold(top, 2500, { throttle: 1 })[3];
  const climb = hold(top, 1000, { throttle: 1 })[3] - z0;
  const predicted = hover / (cap / 100);
  console.log(`${String(cap).padStart(5)}${`${(stick * 100).toFixed(1)} pct`.padStart(14)}${`${(predicted * 100).toFixed(1)} pct`.padStart(12)}${`${climb.toFixed(1)} m/s`.padStart(22)}`);
}
