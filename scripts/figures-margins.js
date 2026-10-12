/*
 * figures-margins.js: the loops the figure programs (tests/lib/figureprograms.js)
 * close through the person's eyes and hand, measured on the compiled plant
 * of the Extra 330 in Manual, and the phase and gain margins they keep.
 *
 * The person sees 0.2 s late and holds the stick 50 ms between looks, a
 * sample and hold lagging half of that, so every loop carries a delay of
 * 0.225 s (PERSON in personpilot.js; the figures' hand moves at EVERY).
 * A loop is designed to the bandwidth criterion PERSON cites: a 45 deg
 * phase margin and a 6 dB gain margin (MIL-STD-1797A, in Peahl,
 * Kolkailah and Sandlin, NASA NCC2-338, 1986).
 *
 * The line hold's elevator. A line is held by hangSticks (wingpilot.js):
 * stick = kr (kp e - q), the nose's error to a pitch rate and the rate's
 * error to the stick, both seen late. Its plant is the pitch rate per unit
 * of elevator, which is a gain to well past the loop's 180 deg frequency
 * (its phase within 27 deg of zero to 16 rad/s, below) and grows with the
 * slipstream on the tail and the airspeed: measured as the pitch rate
 * 0.25 s after a twentieth of elevator, against the same flight without
 * it, level, nose up and nose down, at idle to full throttle and 6 to 30
 * m/s, it fits K = a + b throttle + c V^2 rad/s per stick. The loop is
 * then kr G(jw) e^(-0.225 s) (1 + kp / s), and kr = LINE_GM / K. Its
 * margins are measured on G, the elevator's frequency response
 * (responseAt), level and trimmed at a third, two thirds and full
 * throttle: the step reads the gain about a quarter low at the loop's 180
 * deg frequency, so LINE_GM is the largest that keeps 6 dB on all three.
 * The fixed kr 0.2 the lines flew before kept 3.3 and 1.3 dB at a third
 * and two thirds and was unstable at full throttle.
 *
 *   node scripts/figures-margins.js
 *
 * Exits 1 if the fit in figureprograms.js is not what the plant measures
 * (to the third figure) or a measured margin is short of the criterion.
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

import { loadSim } from '../tests/lib/simmod.js';
import { must, attitude, responseAt, EXTRA_AIRFRAME } from '../tests/lib/wingpilot.js';
import { PERSON } from '../tests/lib/personpilot.js';
import { EVERY, LINE_GAINS, LINE_PITCH_K, LINE_GM, lineKr } from '../tests/lib/figureprograms.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');

export const TAU = (PERSON.delayMs + EVERY / 2) / 1000;
const DB = (x) => 20 * Math.log10(x);

async function fresh() {
  const sim = await loadSim(wasmBytes);
  return sim;
}

function setUp(sim, airframe = EXTRA_AIRFRAME) {
  must(sim.init(configText), 'sim_init');
  must(sim.e.sim_set_airframe(airframe), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
}

/* The pitch rate a twentieth of elevator buys 0.25 s after it goes in,
 * per unit stick, and the speed it went in at: launched at V with the
 * nose pitched pitchDeg, the throttle held. */
function elevatorStep(sim, V, thr, pitchDeg) {
  const flight = (a) => {
    setUp(sim);
    const h = pitchDeg * Math.PI / 360;
    must(sim.e.sim_set_pose(0, 0, 300, Math.cos(h), 0, -Math.sin(h), 0), 'sim_set_pose');
    must(sim.e.sim_wing_launch(V), 'sim_wing_launch');
    let v0 = 0;
    for (let ms = 0; ms < 450; ms += 2) {
      must(sim.input(ms / 1000, 0, ms >= 200 ? a : 0, 0, thr), 'sim_input');
      must(sim.step(2), 'sim_step');
      if (ms === 200) {
        const s = sim.readState().state;
        v0 = Math.hypot(s[4], s[5], s[6]);
      }
    }
    return { q: sim.readState().state[12], v: v0 };
  };
  const still = flight(0);
  const moved = flight(0.05);
  return { thr, v: still.v, k: -(moved.q - still.q) / 0.05 };
}

/* Least squares K = a + b thr + c V^2 over the steps. */
function fit(rows) {
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const B = [0, 0, 0];
  for (const r of rows) {
    const x = [1, r.thr, r.v * r.v];
    for (let i = 0; i < 3; i += 1) {
      B[i] += x[i] * r.k;
      for (let j = 0; j < 3; j += 1) A[i][j] += x[i] * x[j];
    }
  }
  for (let i = 0; i < 3; i += 1) {
    for (let k = i + 1; k < 3; k += 1) {
      const f = A[k][i] / A[i][i];
      for (let j = 0; j < 3; j += 1) A[k][j] -= f * A[i][j];
      B[k] -= f * B[i];
    }
  }
  const c = [0, 0, 0];
  for (let i = 2; i >= 0; i -= 1) {
    let s = B[i];
    for (let j = i + 1; j < 3; j += 1) s -= A[i][j] * c[j];
    c[i] = s / A[i][i];
  }
  return { a: c[0], b: c[1], c: c[2] };
}

export async function lineElevatorFit() {
  const sim = await fresh();
  const rows = [];
  for (const pitchDeg of [0, 90, -90]) {
    for (const thr of [0, 0.3, 0.6, 1]) {
      for (const V of [6, 10, 14, 18, 22, 26, 30]) rows.push(elevatorStep(sim, V, thr, pitchDeg));
    }
  }
  return { rows, k: fit(rows) };
}

/* The line hold's margins where the Extra flies level and trimmed at a
 * throttle (the speed it settles at), from the elevator's measured
 * frequency response (responseAt): the loop kr G(jw) e^(-jw TAU) (1 + kp / jw),
 * its phase margin at unity and gain margin at -180 deg, for a kr. */
export async function lineMargins(thr, kr) {
  const sim = await fresh();
  const start = (s) => {
    setUp(s);
    must(s.e.sim_set_pose(0, 0, 300, 1, 0, 0, 0), 'sim_set_pose');
    must(s.e.sim_wing_launch(22), 'sim_wing_launch');
    return [0, 0, 0, thr];
  };
  const hold = (s) => {
    const a = attitude(s);
    return [Math.max(-0.9, Math.min(0.9, -1.2 * a.bank - 0.12 * s[11])), Math.max(-0.9, Math.min(0.9, 0.05 - 1.5 * a.pitch + 0.15 * s[12])), 0, thr];
  };
  const grid = [];
  for (let i = 4; i <= 64; i += 1) {
    const w = i / 4;
    const g = responseAt(sim, start, hold, w, 1, (s) => -s[12]);
    const lead = Math.atan2(-LINE_GAINS.kp / w, 1);
    grid.push({ w, mag: kr * g.mag * Math.hypot(1, LINE_GAINS.kp / w), phase: g.phase - w * TAU + lead, plantPhase: g.phase });
  }
  for (let i = 1; i < grid.length; i += 1) {
    const d = grid[i].phase - grid[i - 1].phase;
    grid[i].phase = grid[i - 1].phase + Math.atan2(Math.sin(d), Math.cos(d));
  }
  const cross = grid.find((g) => g.mag < 1);
  const turn = grid.find((g) => g.phase <= -Math.PI);
  return {
    pmDeg: cross ? (Math.PI + cross.phase) * 180 / Math.PI : null,
    wc: cross ? cross.w : null,
    gmDb: turn ? -DB(turn.mag) : null,
    w180: turn ? turn.w : null,
    plantPhaseDeg: Math.max(...grid.filter((g) => g.w <= 16).map((g) => Math.abs(g.plantPhase))) * 180 / Math.PI,
    speed: null,
  };
}

/* The speed the Extra settles at, level at a throttle, held as
 * lineMargins holds it. */
async function trimSpeed(thr) {
  const sim = await fresh();
  setUp(sim);
  must(sim.e.sim_set_pose(0, 0, 300, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(22), 'sim_wing_launch');
  for (let ms = 0; ms < 20000; ms += 4) {
    const s = sim.readState().state;
    const a = attitude(s);
    must(sim.input(ms / 1000, Math.max(-0.9, Math.min(0.9, -1.2 * a.bank - 0.12 * s[11])), Math.max(-0.9, Math.min(0.9, 0.05 - 1.5 * a.pitch + 0.15 * s[12])), 0, thr), 'sim_input');
    must(sim.step(4), 'sim_step');
  }
  const s = sim.readState().state;
  return Math.hypot(s[4], s[5], s[6]);
}

/* Every loop's measured margins, as the manoeuvre table carries them,
 * and what is wrong with them: a fit that is not the plant's, or a
 * margin short of the criterion. */
export async function measureMargins() {
  const { rows, k } = await lineElevatorFit();
  /* Where the fit is under the plant the gain is over the design: the
   * margin's side. Over it (idle and slow, where neither the slipstream
   * nor the airspeed works the tail) the gain is under, the calm side. */
  const under = Math.max(...rows.map((r) => r.k / (k.a + k.b * r.thr + k.c * r.v * r.v)));
  const level = [];
  for (const thr of [0.3, 0.6, 1]) {
    const v = await trimSpeed(thr);
    const kr = lineKr(thr, v);
    const was = await lineMargins(thr, LINE_GAINS.kr);
    const now = await lineMargins(thr, kr);
    level.push({
      throttle: thr, speed: Number(v.toFixed(1)), kr: Number(kr.toFixed(3)),
      gmDb: Number(now.gmDb.toFixed(1)), w180: now.w180, pmDeg: Number(now.pmDeg.toFixed(0)), wc: now.wc,
      plantPhaseDeg: Number(now.plantPhaseDeg.toFixed(0)),
      fixedKr02GmDb: was.gmDb === null ? null : Number(was.gmDb.toFixed(1)),
    });
  }
  return {
    criterion: 'bandwidth criterion: 45 deg phase margin, 6 dB gain margin (MIL-STD-1797A; Peahl, Kolkailah and Sandlin, NASA NCC2-338, 1986)',
    delayS: TAU,
    lineElevator: {
      fit: { a: Number(k.a.toFixed(3)), b: Number(k.b.toFixed(3)), c: Number(k.c.toFixed(5)), steps: rows.length, plantOverFitMax: Number((under - 1).toFixed(2)) },
      lineGm: LINE_GM,
      level,
    },
  };
}

export function marginFailures(m) {
  const out = [];
  const f = m.lineElevator.fit;
  const same = (x, y) => Math.abs(x - y) <= 0.0005 * Math.max(1, Math.abs(y));
  if (!(same(LINE_PITCH_K.a, f.a) && same(LINE_PITCH_K.b, f.b) && Math.abs(LINE_PITCH_K.c - f.c) < 0.000005)) {
    out.push(`figureprograms.js LINE_PITCH_K ${JSON.stringify(LINE_PITCH_K)} is not the plant's fit ${JSON.stringify(f)}`);
  }
  for (const l of m.lineElevator.level) {
    if (!(l.gmDb >= 6 && l.pmDeg >= 45)) out.push(`the line's elevator at throttle ${l.throttle} keeps ${l.gmDb} dB and ${l.pmDeg} deg`);
  }
  return out;
}

const main = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (main) {
  const m = await measureMargins();
  const f = m.lineElevator.fit;
  console.log(`line elevator: K = ${f.a} + ${f.b} thr + ${f.c} V^2 rad/s per stick over ${f.steps} steps; the plant at most ${(f.plantOverFitMax * 100).toFixed(0)} % over it`);
  for (const l of m.lineElevator.level) {
    console.log(`  level at throttle ${l.throttle} (${l.speed} m/s): kr ${l.kr} GM ${l.gmDb} dB at ${l.w180} rad/s, PM ${l.pmDeg} deg at ${l.wc} rad/s, plant phase within ${l.plantPhaseDeg} deg to 16 rad/s; the fixed kr 0.2 ${l.fixedKr02GmDb === null ? 'over unity to 16 rad/s, unstable' : `${l.fixedKr02GmDb} dB`}`);
  }
  const bad = marginFailures(m);
  for (const b of bad) console.log(`FAIL ${b}`);
  console.log(`\nfigures margins: ${bad.length ? `${bad.length} failed` : 'all hold'}`);
  process.exit(bad.length ? 1 : 0);
}
