/*
 * hover-probe.js: can a person hover it? Every powered fixed wing the
 * hangar offers, nose up at no airspeed, flown for 10 s by a pilot with a
 * person's limits rather than flightmodel-probe.js's HOVER, which reads
 * the state the instant it changes. This pilot sees the aircraft 0.2 s
 * late (a trained pilot's effective delay in compensatory tracking, McRuer
 * and Jex, IEEE Trans. HFE 1967), moves the sticks ten times a second in
 * steps of a fiftieth of their travel, and flies by what is visible from
 * the ground: the nose off vertical and how fast it is moving, the roll
 * rate (held out with a slow trim on the ailerons, as a pilot learns to
 * hold the torque), the drift against the background (leaned against with
 * the nose), and the climb (on the throttle, a slow hand on a held
 * setting). Pilots differ, so the gains are a grid; the row is how many of
 * its pilots hold the hover for the 10 s, the nose within 20 deg of
 * vertical and the height within 10 m, and the best one's figures. It
 * measures, it does not judge.
 *
 *   node scripts/hover-probe.js [--only key,...] [--lag seconds]
 *
 * --lag replaces the pilot's 0.2 s delay: 0.2 is a person looking at a
 * real aircraft, so 0.2 plus the sim's stick to picture time (docs/PERF.md,
 * the tail under a busy GPU) is the same person flying the sim.
 *
 * Per aircraft, in Manual and in the mode its default tune flies:
 *
 *   TW      thrust over weight at full throttle, nose up, as
 *           flightmodel-probe.js's
 *   HOLD    pilots of the grid holding 10 s, of all of them, and the best
 *           pilot's time, worst nose angle, throttle and torque roll turns
 *
 * Harness arithmetic in JS maths, which is allowed: nothing it prints is
 * hashed, and every flight is the plant's own deterministic step.
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

import { TABLE } from '../configs/power.js';
import { AIRFRAMES } from '../configs/airframes.js';
import { tuneById } from '../configs/registry.js';
import { loadSim } from '../tests/lib/simmod.js';
import { wingDebug, must } from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const DEG = 180 / Math.PI;
const G = 9.80665;
const MS = 4;
const NOSE_UP = [Math.SQRT1_2, 0, -Math.SQRT1_2, 0];

/* The pilot's limits and the grid of pilots. */
const LAG_DEFAULT_S = 0.2;
const EVERY_MS = 100;
const STEPS = 50;
const SECONDS = 10;
const GRID = { kp: [0.2, 0.4, 0.7, 1, 1.5, 2.5], kd: [0, 0.1, 0.2, 0.4, 0.7, 1], kr: [0.1, 0.3], kv: [0.1, 0.2, 0.3], kt: [0.02, 0.05, 0.1] };

const arg = (k) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : null;
};
const only = arg('--only') ? new Set(arg('--only').split(',')) : null;
const LAG_S = arg('--lag') === null ? LAG_DEFAULT_S : Number(arg('--lag'));
if (!(LAG_S >= 0 && LAG_S <= 1)) {
  throw new Error(`hover-probe: --lag wants seconds from 0 to 1, got ${arg('--lag')}`);
}

const clamp = (x, m = 1) => Math.max(-m, Math.min(m, x));
const quant = (x) => clamp(Math.round(x * STEPS) / STEPS);

/* The fixed wings with a power table, a glider's skipped at its zero
 * thrust: the war drone, which has none, flies at plant.c's mass. */
function planes() {
  return AIRFRAMES.filter((a) => a.fixedWing && (TABLE[a.id] || a.id === 'striker2500') && !a.id.endsWith('f'));
}

function massOf(af) {
  return TABLE[af.id] ? TABLE[af.id].massKg : 13.8249;
}

async function planeSim(af) {
  const sim = await loadSim(wasmBytes);
  must(sim.init(configText), 'sim_init');
  must(sim.e.sim_set_airframe(af.simId), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  return sim;
}

/* Nose up and still with the prop already turning at `throttle`: a pilot
 * arrives in a hover with the motor running, so the prop is held there a
 * second, ten of the slowest motor's time constants (prop_spool), first. */
function start(sim, mode, throttle = 0) {
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_wing_set_stab(mode), 'sim_wing_set_stab');
  for (let ms = 0; ms < 1000; ms += MS) {
    must(sim.e.sim_set_pose(0, 0, 50, ...NOSE_UP), 'sim_set_pose');
    must(sim.e.sim_set_velocity(0, 0, 0, 0, 0, 0), 'sim_set_velocity');
    must(sim.input(0, 0, 0, 0, throttle), 'sim_input');
    must(sim.step(MS), 'sim_step');
  }
  must(sim.e.sim_set_pose(0, 0, 50, ...NOSE_UP), 'sim_set_pose');
  must(sim.e.sim_set_velocity(0, 0, 0, 0, 0, 0), 'sim_set_velocity');
}

/* What the pilot sees: world up in the body frame, the body's belly and
 * right wing axes in the world's horizontal, the rates and the speeds. */
function read(s) {
  const [w, x, y, z] = [s[7], s[8], s[9], s[10]];
  return {
    s,
    upB: [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
    belly: [2 * (x * z + w * y), 2 * (y * z - w * x)],
    right: [2 * (x * y - w * z), 1 - 2 * (x * x + z * z)],
    p: s[11], vz: s[6], z: s[3],
  };
}

function tw(sim, af) {
  start(sim, 0, 1);
  let thrust = 0;
  for (let ms = 0; ms < 1500; ms += MS) {
    must(sim.input(ms / 1000, 0, 0, 0, 1), 'sim_input');
    must(sim.step(MS), 'sim_step');
    thrust = Math.max(thrust, wingDebug(sim)[8]);
  }
  return thrust / (massOf(af) * G);
}

function fly(sim, mode, g) {
  start(sim, mode, 0.6);
  const lag = Math.round(LAG_S * 1000 / MS);
  const seen = [];
  let st = [0, 0, 0, 0.6], base = 0.6, trim = 0, held = 0, worst = 0, roll = 0;
  for (let ms = 0; ms < SECONDS * 1000; ms += MS) {
    const o = read(sim.readState().state);
    seen.push(o);
    const off = Math.acos(clamp(o.upB[0])) * DEG;
    if (held === ms && off < 20 && Math.abs(o.z - 50) < 10) {
      held = ms + MS;
      worst = Math.max(worst, off);
    }
    roll += o.p * MS / 1000;
    if (ms % EVERY_MS === 0 && seen.length > lag + 25) {
      const d = seen[seen.length - 1 - lag];
      const was = seen[seen.length - 26 - lag];
      const dt = 25 * MS / 1000;
      const h = EVERY_MS / 1000;
      base = Math.max(0, clamp(base - h * (0.05 * (d.z - 50) + 0.1 * d.vz)));
      trim = clamp(trim - 0.3 * h * d.p);
      const lean = (a) => clamp(g.kv * (a[0] * d.s[4] + a[1] * d.s[5]), 0.3);
      st = [
        quant(trim - g.kr * d.p),
        quant(g.kp * (d.upB[2] - lean(d.belly)) + g.kd * (d.upB[2] - was.upB[2]) / dt),
        quant(-g.kp * (d.upB[1] - lean(d.right)) - g.kd * (d.upB[1] - was.upB[1]) / dt),
        Math.max(0, quant(base - g.kt * d.vz)),
      ];
    }
    must(sim.input(ms / 1000, ...st), 'sim_input');
    must(sim.step(MS), 'sim_step');
  }
  return { held: held / 1000, worst, thr: st[3], turns: roll / (2 * Math.PI) };
}

function grid() {
  const out = [];
  for (const kp of GRID.kp) for (const kd of GRID.kd) for (const kr of GRID.kr) for (const kv of GRID.kv) for (const kt of GRID.kt) {
    out.push({ kp, kd, kr, kv, kt });
  }
  return out;
}

const f = (x, d = 1) => x.toFixed(d);
const pilots = grid();
for (const af of planes()) {
  if (only && !only.has(af.id)) continue;
  const sim = await planeSim(af);
  const own = tuneById(af.defaultTune);
  const modes = [[0, 'Manual']];
  if ((own.wingStab || 0) !== 0) {
    modes.push([own.wingStab, own.name]);
  }
  const ratio = tw(sim, af);
  if (!(ratio > 0)) {
    continue;
  }
  console.log(`${af.id}  TW ${f(ratio, 2)}  pilot delay ${LAG_S} s`);
  for (const [mode, name] of modes) {
    let n = 0, best = null;
    for (const g of pilots) {
      const r = fly(sim, mode, g);
      if (r.held >= SECONDS) n += 1;
      if (!best || r.held > best.held) best = r;
    }
    console.log(`  ${name.padEnd(12)} ${String(n).padStart(3)} of ${pilots.length} pilots hold 10 s; best ${f(best.held)} s, nose within ${f(best.worst, 0)} deg, throttle ${f(best.thr, 2)}, torque roll ${f(best.turns, 1)} turns`);
  }
}
