/*
 * flight-report.js: the numbers a pilot judges a simulator by, measured by
 * flying a fixed set of manoeuvres headlessly on dist/sim.wasm: hover trim
 * and drift, the rate step response per axis, punch-out, forward flight
 * speed, pack sag and draw, a propwash proxy and motor authority. A tool,
 * not a check: nothing is compared with a threshold, it prints and exits
 * 0, and only a crash (missing file, the module refusing the config) exits
 * non-zero. Read it after a tuning change.
 *
 *   node scripts/flight-report.js [config.diff]
 *
 * The config defaults to configs/betaflight-default.diff. It always flies
 * plant 0: no airframe is seated.
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

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSim, SIM_OK } from '../tests/lib/simmod.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEG = 180 / Math.PI;

const configPath = process.argv[2] ?? join(ROOT, 'configs/betaflight-default.diff');
const configText = readFileSync(configPath, 'utf8');
const wasm = readFileSync(join(ROOT, 'dist/sim.wasm'));

async function freshSim(cellVolts = 4.2) {
  const sim = await loadSim(wasm);
  if (sim.init(configText) !== SIM_OK) {
    throw new Error('sim_init failed');
  }
  sim.reset();
  sim.setCellVoltage(cellVolts);
  return sim;
}

/*
 * Flies `segments` ({ms, roll, pitch, yaw, throttle}) from clock `start` and
 * returns the end clock. Sticks go out on a 250 Hz RC grid, as the shell
 * sends them, so the flight controller sees realistic frames rather than a
 * fresh command every 1 ms step. The grid starts at `start`: sim_input
 * rejects a timestamp older than the last one, so a flight continuing on
 * the same instance must pass the previous end clock, or every sample is
 * dropped and the craft keeps flying the previous sticks.
 */
function fly(sim, segments, sample = null, start = 0) {
  let clock = start;
  let nextFrame = start;
  segments.forEach((seg, index) => {
    const { roll = 0, pitch = 0, yaw = 0, throttle = 0 } = seg;
    for (let i = 0; i < seg.ms; i++) {
      if (nextFrame <= clock) {
        sim.input(nextFrame / 1000, roll, pitch, yaw, throttle);
        nextFrame += 4;
      }
      sim.step(1);
      clock += 1;
      if (sample) {
        sample(sim.readState().state, index);
      }
    }
  });
  return clock;
}

const lastState = (sim) => sim.readState().state;

async function hover() {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    const sim = await freshSim(4.0);
    fly(sim, [{ ms: 2000, throttle: mid }]);
    if (lastState(sim)[6] > 0) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  const trim = (lo + hi) / 2;
  const sim = await freshSim(4.0);
  fly(sim, [{ ms: 4000, throttle: trim }]);
  const s = lastState(sim);
  const drift = Math.hypot(s[1], s[2]);
  return `hover: throttle ${(trim * 100).toFixed(1)}%  rpm ${s[14].toFixed(0)}  lateral drift over 4 s ${drift.toFixed(3)} m`;
}

/* A thumb ramping the stick in and out over 13 frames of 5 ms, rather than
 * an ideal step. */
const ramp = (axis, levels) => levels.map((i) => ({ ms: 5, throttle: 0.4, [axis]: i / 12 }));
const UP = [...Array(13).keys()];
const DOWN = [...UP].reverse();

/*
 * Samples keep their sign: in this frame pitch and yaw run negative for a
 * positive stick, and an unsigned figure would report the normal return to
 * centre as a huge reversal. The first 60 ms after the hold fall inside
 * the ramp out itself, so the reversal is read only after them.
 */
async function rateStep(axis, rateIndex) {
  const program = [
    ...ramp(axis, UP),
    { ms: 900, throttle: 0.4, [axis]: 1 },
    ...ramp(axis, DOWN),
    { ms: 400, throttle: 0.4 },
  ];
  const holdIndex = UP.length;
  const trace = [];
  const held = [];
  const after = [];
  const sim = await freshSim();
  fly(sim, program, (s, index) => {
    const v = s[rateIndex] * DEG;
    trace.push(Math.abs(v));
    if (index === holdIndex) {
      held.push(v);
    } else if (index > holdIndex) {
      after.push(v);
    }
  });
  const tail = held.slice(-200);
  const steady = tail.reduce((a, v) => a + v, 0) / tail.length;
  const size = Math.abs(steady);
  const dir = Math.sign(steady) || 1;
  const peak = Math.max(...held.map((v) => v * dir));
  const reversal = Math.max(0, ...after.slice(60).map((v) => -v * dir));
  const rise90 = trace.findIndex((v) => v >= 0.9 * size);
  return `${axis} step: steady ${size.toFixed(0)} deg/s  overshoot ${(100 * (peak / size - 1)).toFixed(1)}%  rise90 ${rise90} ms  reverse after release ${reversal.toFixed(0)} deg/s`;
}

/* The altitude at the end of the 3 s, not a peak. */
async function punch() {
  const sim = await freshSim();
  const end = fly(sim, [{ ms: 1500, throttle: 0.26 }]);
  const z0 = lastState(sim)[3];
  fly(sim, [{ ms: 3000, throttle: 1 }], null, end);
  const z1 = lastState(sim)[3];
  return `punch: ${(z1 - z0).toFixed(1)} m gained in 3 s from hover`;
}

/* The attitude is the body x axis elevation: how nose-down it flies. */
async function forwardFlight() {
  const sim = await freshSim();
  fly(sim, [{ ms: 12000, throttle: 0.75, pitch: -0.55 }]);
  const s = lastState(sim);
  const speed = Math.hypot(s[4], s[5], s[6]);
  const [w, x, y, z] = [s[7], s[8], s[9], s[10]];
  const attitude = Math.asin(Math.max(-1, Math.min(1, 2 * (w * y - z * x)))) * DEG;
  return `forward flight: 55% pitch stick at 75% throttle for 12 s -> ${speed.toFixed(1)} m/s, attitude ${attitude.toFixed(0)} deg`;
}

async function battery() {
  let vmin = 99;
  let amax = 0;
  const sim = await freshSim();
  fly(sim, [{ ms: 1000, throttle: 0.3 }, { ms: 1500, throttle: 1 }, { ms: 800, throttle: 0.2 }, { ms: 1500, throttle: 1 }], (s) => {
    vmin = Math.min(vmin, s[18]);
    amax = Math.max(amax, s[19]);
  });
  return `battery: min pack ${vmin.toFixed(1)} V, peak draw ${amax.toFixed(0)} A on repeated punches from 4.20 V/cell`;
}

/* A propwash proxy: the peak body rate disturbance dropping hard and
 * catching. */
async function descentAndCatch() {
  let wobble = 0;
  const sim = await freshSim();
  fly(sim, [{ ms: 1200, throttle: 0.28 }, { ms: 1500, throttle: 0.05 }, { ms: 1200, throttle: 0.55 }], (s) => {
    wobble = Math.max(wobble, Math.hypot(s[11], s[12]) * DEG);
  });
  return `descent and catch: peak body rate disturbance ${wobble.toFixed(0)} deg/s`;
}

async function authority() {
  let min = 1e9;
  let max = 0;
  const sim = await freshSim();
  fly(sim, [{ ms: 800, throttle: 0.55, roll: 1 }], (s) => {
    const rpms = s.slice(14, 18);
    min = Math.min(min, ...rpms);
    max = Math.max(max, ...rpms);
  });
  return `authority: full roll at 55% throttle spreads motors ${min.toFixed(0)} to ${max.toFixed(0)} rpm`;
}

/* Printed once at the end, so a crash part way prints nothing. */
const lines = [
  `FLIGHT REPORT  config=${configPath.split('/').pop()}`,
  '',
  await hover(),
  await rateStep('roll', 11),
  await rateStep('pitch', 12),
  await rateStep('yaw', 13),
  await punch(),
  await forwardFlight(),
  await battery(),
  await descentAndCatch(),
  await authority(),
];
console.log(lines.join('\n'));
