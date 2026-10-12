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
 * The fixed kr 0.2 the lines flew before keeps 3.2 and 0 dB at a third
 * and two thirds and is unstable at full throttle.
 *
 * The line hold's rudder (figureprograms.js LINE_YAW_KR): the same loop
 * on the yaw, stick = kr (kp e - r), on each aircraft. Its response
 * (responseAt, the yaw rate per rudder) is not a gain: it rises to the
 * loop's 180 deg frequency, so each kr is the largest, to a thousandth,
 * that keeps 6 dB there. It is measured where the lines are flown, held
 * steady by an attitude hold with no delay and the throttle on the
 * speed: up the vertical, up and down the 45 and level, at 8 to 30 m/s.
 * A line that does not settle within a metre a second of its speed (too
 * slow for the throttle to hold it level, too fast to hold it diving) is
 * not taken; the kr at a speed is the least of the lines'. Like the
 * elevator's, the trim's integral (LINE_KI) is not in the loop measured.
 *
 * The knife edge (figureprograms.js KNIFE): three loops of personLoop
 * (wingpilot.js) at PERSON's own pace, a look every 100 ms, the bank on
 * the ailerons, the nose's elevation on the rudder and the heading on the
 * elevator, each at the crossover crossoverFor finds on the Extra's
 * measured response in a level knife edge, stepped down its grid until
 * the loop as flown (its trim's integral and the 0.25 s of delay and
 * hold) keeps the criterion too. The climb rate's outer loop, a quarter
 * as fast (PERSON.outer), is not measured.
 *
 * The knife-edge loop (figureprograms.js KNIFE_LOOP) flies the knife
 * edge's bank and heading loops and one more, the path's angle on the
 * rudder, measured in the same level knife edge: crossoverFor's
 * crossover and plant gain, and the margins of the loop as flown at half
 * that crossover. Its pace, its share of the rudder and its floor are
 * not measured.
 *
 *   node scripts/figures-margins.js
 *
 * Exits 1 if a constant pinned in figureprograms.js (the line's fit, the
 * rudder's gains, the knife edge's crossovers and trims, each seated
 * aircraft's level throttle) is not what the plant measures, or a
 * measured margin is short of the criterion.
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
import { must, attitude, responseAt, crossoverFor, hangSticks, EXTRA_AIRFRAME, CAP_AIRFRAME, SLICK_AIRFRAME } from '../tests/lib/wingpilot.js';
import { PERSON } from '../tests/lib/personpilot.js';
import { EVERY, LINE_GAINS, LINE_PITCH_K, LINE_GM, lineKr, LINE_YAW_KR, KNIFE, KNIFE_LOOP, LEVEL_THROTTLE } from '../tests/lib/figureprograms.js';

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

/* The throttle that holds the programs' launch speed level
 * (figureprograms.js LEVEL_THROTTLE): launched at 22 m/s, the wings and
 * the height held on the ailerons and elevator with no delay, the speed
 * it settles at over the last 5 of 30 s, bisected to a thousandth. */
const LAUNCH_V = 22;
async function levelSpeed(airframe, thr) {
  const sim = await fresh();
  setUp(sim, airframe);
  must(sim.e.sim_set_pose(0, 0, 300, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(LAUNCH_V), 'sim_wing_launch');
  let iz = 0, ip = 0, sv = 0, n = 0;
  for (let ms = 0; ms < 30000; ms += 4) {
    const s = sim.readState().state;
    const a = attitude(s);
    const dz = s[3] - 300;
    iz = Math.max(-0.3, Math.min(0.3, iz - 0.002 * dz * 0.004));
    const want = Math.max(-0.3, Math.min(0.3, -0.02 * dz - 0.05 * s[6] + iz));
    ip = Math.max(-0.5, Math.min(0.5, ip + 0.5 * (want - a.pitch) * 0.004));
    must(sim.input(ms / 1000, Math.max(-0.9, Math.min(0.9, -1.2 * a.bank - 0.12 * s[11])),
      Math.max(-0.9, Math.min(0.9, 2 * (want - a.pitch) + 0.15 * s[12] + ip)), 0, thr), 'sim_input');
    must(sim.step(4), 'sim_step');
    if (ms >= 25000) { sv += Math.hypot(s[4], s[5], s[6]); n += 1; }
  }
  return sv / n;
}
export async function levelThrottle(airframe) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 10; i += 1) {
    const mid = (lo + hi) / 2;
    if (await levelSpeed(airframe, mid) < LAUNCH_V) lo = mid; else hi = mid;
  }
  const thr = Number(((lo + hi) / 2).toFixed(3));
  return { throttle: thr, speed: Number((await levelSpeed(airframe, thr)).toFixed(1)) };
}

/* The rudder's loop on a line held at `pitchDeg` and V (see the head):
 * its gain margin's magnitude and frequency, or null where the line does
 * not settle at V or the phase does not reach -180 deg by 20 rad/s. */
export const YAW_SPEEDS = [8, 14, 18, 22, 26, 30];
export const YAW_LINES = [90, 45, 0, -45];
function yawPoint(sim, airframe, pitchDeg, V) {
  const h = pitchDeg * Math.PI / 360;
  const target = [Math.cos(2 * h), 0, Math.sin(2 * h)];
  const trim = { thr: 0.5, p: 0, y: 0 };
  let it;
  const start = (s) => {
    setUp(s, airframe);
    must(s.e.sim_set_pose(0, 0, 300, Math.cos(h), 0, -Math.sin(h), 0), 'sim_set_pose');
    must(s.e.sim_wing_launch(V), 'sim_wing_launch');
    it = { ...trim };
    return [0, 0, 0, it.thr];
  };
  /* The wings held square to the line's plane (the span on the world's
   * y, its error about the nose), the nose on the line, each with a
   * trim's integral, and the speed on the throttle. */
  const hold = (s) => {
    const [, p, y] = hangSticks(s, { target, rollStick: 0, kp: 4, kr: 0.3 });
    const [qw, qx, qy, qz] = [s[7], s[8], s[9], s[10]];
    const n = [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy + qw * qz), 2 * (qx * qz - qw * qy)];
    const l = [2 * (qx * qy - qw * qz), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz + qw * qx)];
    const v = Math.hypot(s[4], s[5], s[6]);
    it.thr = Math.max(0, Math.min(1, it.thr + 0.0006 * (V - v)));
    it.p = Math.max(-1, Math.min(1, it.p + 0.004 * p));
    it.y = Math.max(-1, Math.min(1, it.y + 0.004 * y));
    return [clip(l[2] * n[0] - l[0] * n[2] - 0.12 * s[11]), Math.max(-1, Math.min(1, p + it.p)), Math.max(-1, Math.min(1, y + it.y)),
      Math.max(0, Math.min(1, it.thr + 0.1 * (V - v)))];
  };
  start(sim);
  let lo = Infinity, hi = -Infinity;
  for (let ms = 0; ms < 40000; ms += 4) {
    must(sim.input(ms / 1000, ...hold(sim.readState().state)), 'sim_input');
    must(sim.step(4), 'sim_step');
    if (ms >= 35000) {
      const s = sim.readState().state;
      const v = Math.hypot(s[4], s[5], s[6]);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  if (hi - lo > 1 || Math.abs((hi + lo) / 2 - V) > 1) return null;
  Object.assign(trim, it);
  const kp = LINE_GAINS.kp;
  let prev = null;
  for (let i = 4; i <= 80; i += 2) {
    const w = i / 4;
    const g = responseAt(sim, start, hold, w, 2, (st) => -st[13]);
    let phase = g.phase - w * TAU + Math.atan2(-kp / w, 1);
    if (prev) phase = prev.phase + Math.atan2(Math.sin(phase - prev.phase), Math.cos(phase - prev.phase));
    const now = { w, mag: g.mag * Math.hypot(1, kp / w), phase };
    /* A response that jumps between neighbouring frequencies (half or
     * twice the magnitude, 60 deg of phase in half a rad/s) is a flight
     * that does not hold still under the sweep, not the rudder's: not
     * taken (the Slick level at 22 m/s, 0.6 to 20 per stick). */
    if (prev && (now.mag > 2 * prev.mag || now.mag < prev.mag / 2 || Math.abs(phase - prev.phase) > Math.PI / 3)) return null;
    if (prev && phase <= -Math.PI) {
      const f = (-Math.PI - prev.phase) / (phase - prev.phase);
      return { w180: Number((prev.w + f * (w - prev.w)).toFixed(1)), mag: prev.mag + f * (now.mag - prev.mag) };
    }
    prev = now;
  }
  return null;
}

/* Each aircraft's rudder gain by speed: [V, kr] for every speed some line
 * settles at, kr the least the lines allow at 6 dB, and what each line
 * measured. */
export async function lineRudder(airframe) {
  const sim = await fresh();
  const krs = [];
  const lines = {};
  for (const V of YAW_SPEEDS) {
    let least = null;
    for (const pitchDeg of YAW_LINES) {
      const pt = yawPoint(sim, airframe, pitchDeg, V);
      const kr = pt ? Math.floor(1000 * 0.5 / pt.mag) / 1000 : null;
      lines[`${pitchDeg} deg ${V} m/s`] = pt ? { w180: pt.w180, mag: Number(pt.mag.toFixed(2)), kr } : null;
      if (kr !== null && (least === null || kr < least)) least = kr;
    }
    if (least !== null) krs.push([V, least]);
  }
  return { airframe, kr: krs, lines };
}

/*
 * The knife edge (figureprograms.js knife): the Extra rolled to 90 deg at
 * 22 m/s and full throttle, held there by an attitude hold with no delay
 * while a stick is swept (responseAt, crossoverFor): the bank on the
 * ailerons, the nose's elevation on the rudder, the heading on the
 * elevator, the climb rate setting the elevation. It settles at 32.9 m/s;
 * the trims are the rudder and the elevation there after 20 s.
 */
const KNIFE_V = 22;
const bankOf = (s) => Math.atan2(2 * (s[9] * s[10] + s[7] * s[8]), 1 - 2 * (s[8] * s[8] + s[9] * s[9]));
const elevationOf = (s) => Math.asin(Math.max(-1, Math.min(1, 2 * (s[8] * s[10] - s[7] * s[9]))));
const headingOf = (s) => Math.atan2(2 * (s[7] * s[10] + s[8] * s[9]), 1 - 2 * (s[9] * s[9] + s[10] * s[10]));
const clip = (x) => Math.max(-0.9, Math.min(0.9, x));
function knifeFlight() {
  let climb = 0;
  const start = (sim) => {
    setUp(sim);
    must(sim.e.sim_set_pose(0, 0, 300, Math.SQRT1_2, Math.SQRT1_2, 0, 0), 'sim_set_pose');
    must(sim.e.sim_wing_launch(KNIFE_V), 'sim_wing_launch');
    climb = 0.15;
    return [0, 0, 0, 1];
  };
  const hold = (s) => {
    climb = Math.max(-0.6, Math.min(0.6, climb - 0.0005 * s[6]));
    const elevation = climb - 0.05 * s[6];
    return [
      clip(-0.8 * (bankOf(s) - Math.PI / 2) - 0.05 * s[11]),
      clip(0.8 * headingOf(s) + 0.15 * s[12]),
      clip(-3 * (elevation - elevationOf(s)) + 0.3 * s[13]),
      1,
    ];
  };
  return { start, hold };
}

/* A person's loop on a measured plant, as personLoop flies it at
 * PERSON's pace: k = wc / gain, the trim's integral cornered at wc / 4,
 * a delay of PERSON's 0.2 s and half its 0.1 s hold. Its phase margin at
 * unity and gain margin at -180 deg on the plant's measured response. */
function loopMargins(sim, start, hold, axis, read, { wc, gain }) {
  const tau = (PERSON.delayMs + PERSON.everyMs / 2) / 1000;
  const grid = [];
  for (let i = 2; i <= 60; i += 1) {
    const w = i / 5;
    const g = responseAt(sim, start, hold, w, axis, read);
    const integ = wc / (4 * w);
    grid.push({ w, mag: (wc / gain) * g.mag * Math.hypot(1, integ), phase: g.phase - w * tau - Math.atan(integ) });
  }
  for (let i = 1; i < grid.length; i += 1) {
    const d = grid[i].phase - grid[i - 1].phase;
    grid[i].phase = grid[i - 1].phase + Math.atan2(Math.sin(d), Math.cos(d));
  }
  const cross = grid.find((g, i) => g.mag < 1 && i > 0 && grid[i - 1].mag >= 1) ?? grid.find((g) => g.mag < 1);
  const turn = grid.find((g) => g.phase <= -Math.PI);
  return {
    pmDeg: Number(((Math.PI + cross.phase) * 180 / Math.PI).toFixed(1)), wcFound: cross.w,
    gmDb: turn ? Number((-DB(turn.mag)).toFixed(1)) : null, w180: turn ? turn.w : null,
  };
}

export async function knifeLoops() {
  const sim = await fresh();
  const { start, hold } = knifeFlight();
  const loops = {
    bank: [0, bankOf],
    elevation: [2, (s) => -elevationOf(s)],
    heading: [1, (s) => -headingOf(s)],
  };
  const out = {};
  /* crossoverFor takes the margin where the gain alone crosses unity; the
   * trim's integral lifts the loop a few per cent over it there, and the
   * crossover the person then flies can sit a grid step higher with a
   * degree or two less. So the design steps down crossoverFor's grid
   * (0.2 rad/s) from its answer to the highest whose flown loop keeps the
   * criterion, its plant gain read off the response there. */
  for (const [name, [axis, read]] of Object.entries(loops)) {
    const x = crossoverFor(sim, start, hold, axis, read);
    let design = { wc: x.wc, gain: Number(x.gain.toFixed(3)) };
    let flown = loopMargins(sim, start, hold, axis, read, design);
    while (!(flown.pmDeg >= 45 && (flown.gmDb === null || flown.gmDb >= 6)) && design.wc > 0.8 + 1e-9) {
      const wc = Number((design.wc - 0.2).toFixed(1));
      design = { wc, gain: Number((responseAt(sim, start, hold, wc, axis, read).mag * wc).toFixed(3)) };
      flown = loopMargins(sim, start, hold, axis, read, design);
    }
    out[name] = { crossoverFor: x.wc, ...design, ...flown };
  }
  start(sim);
  let st = null;
  for (let ms = 0; ms < 20000; ms += 4) {
    const s = sim.readState().state;
    st = hold(s);
    must(sim.input(ms / 1000, ...st), 'sim_input');
    must(sim.step(4), 'sim_step');
  }
  const s = sim.readState().state;
  out.trim = { rudder: Number((-st[2]).toFixed(2)), elevation: Number(elevationOf(s).toFixed(3)), speed: Number(Math.hypot(s[4], s[5], s[6]).toFixed(1)) };
  return out;
}

/* The knife-edge loop's rudder on the path's angle (figureprograms.js
 * KNIFE_LOOP): where crossoverFor puts it in the level knife edge, and
 * the margins of the loop flown at half that crossover on the same plant
 * gain, its trim's integral and the 0.25 s of delay and hold included. */
const pathOf = (s) => -Math.asin(Math.max(-1, Math.min(1, s[6] / Math.hypot(s[4], s[5], s[6]))));
export async function knifeLoopPath() {
  const sim = await fresh();
  const { start, hold } = knifeFlight();
  const x = crossoverFor(sim, start, hold, 2, pathOf);
  const flown = loopMargins(sim, start, hold, 2, pathOf, KNIFE_LOOP.path);
  return { crossoverFor: x.wc, gain: Number(x.gain.toFixed(3)), wc: KNIFE_LOOP.path.wc, ...flown };
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
  const levelThrottles = {};
  /* The aircraft with a pack to seat; the Slick's engine has none. */
  for (const [name, airframe] of [['extra', EXTRA_AIRFRAME], ['cap', CAP_AIRFRAME]]) {
    levelThrottles[name] = { airframe, ...await levelThrottle(airframe) };
  }
  const lineRudders = {};
  for (const [name, airframe] of [['extra', EXTRA_AIRFRAME], ['cap', CAP_AIRFRAME], ['slick', SLICK_AIRFRAME]]) {
    lineRudders[name] = await lineRudder(airframe);
  }
  return {
    levelThrottle: levelThrottles,
    lineRudder: lineRudders,
    knife: await knifeLoops(),
    knifeLoop: { path: await knifeLoopPath() },
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
  for (const name of ['bank', 'elevation', 'heading']) {
    const k = m.knife[name];
    if (k.wc !== KNIFE[name].wc || !same(k.gain, KNIFE[name].gain)) out.push(`figureprograms.js KNIFE.${name} ${JSON.stringify(KNIFE[name])} is not the plant's crossover ${k.wc} rad/s, gain ${k.gain}`);
    if (!(k.pmDeg >= 45 && (k.gmDb === null || k.gmDb >= 6))) out.push(`the knife edge's ${name} loop keeps ${k.gmDb} dB and ${k.pmDeg} deg`);
  }
  const p = m.knifeLoop.path;
  if (p.crossoverFor !== 2 * KNIFE_LOOP.path.wc || !same(p.gain, KNIFE_LOOP.path.gain)) {
    out.push(`figureprograms.js KNIFE_LOOP.path ${JSON.stringify(KNIFE_LOOP.path)} is not half the plant's crossover ${p.crossoverFor} rad/s on its gain ${p.gain}`);
  }
  if (!(p.pmDeg >= 45 && (p.gmDb === null || p.gmDb >= 6))) out.push(`the knife-edge loop's path loop keeps ${p.gmDb} dB and ${p.pmDeg} deg`);
  if (Math.abs(m.knife.trim.rudder - KNIFE.trim.rudder) > 0.005 || Math.abs(m.knife.trim.elevation - KNIFE.trim.elevation) > 0.0005
    || Math.abs(m.knife.trim.speed - KNIFE.trim.speed) > 0.05) {
    out.push(`figureprograms.js KNIFE.trim ${JSON.stringify(KNIFE.trim)} is not where the knife edge settles ${JSON.stringify(m.knife.trim)}`);
  }
  for (const [name, r] of Object.entries(m.lineRudder)) {
    if (JSON.stringify(LINE_YAW_KR[r.airframe]) !== JSON.stringify(r.kr)) out.push(`figureprograms.js LINE_YAW_KR for the ${name} ${JSON.stringify(LINE_YAW_KR[r.airframe])} is not the plant's ${JSON.stringify(r.kr)}`);
  }
  for (const [name, l] of Object.entries(m.levelThrottle)) {
    if (Math.abs(LEVEL_THROTTLE[l.airframe] - l.throttle) > 0.0005) out.push(`figureprograms.js LEVEL_THROTTLE for the ${name} ${LEVEL_THROTTLE[l.airframe]} is not the throttle that holds 22 m/s level, ${l.throttle}`);
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
  for (const [name, r] of Object.entries(m.lineRudder)) console.log(`line rudder, the ${name}: kr ${r.kr.map(([v, k]) => `${k} at ${v}`).join(', ')} m/s`);
  for (const [name, l] of Object.entries(m.levelThrottle)) console.log(`level at 22 m/s, the ${name}: throttle ${l.throttle} (settles at ${l.speed} m/s)`);
  for (const name of ['bank', 'elevation', 'heading']) {
    const k = m.knife[name];
    console.log(`knife edge ${name}: crossoverFor ${k.crossoverFor} rad/s, flown at ${k.wc} rad/s on a plant gain of ${k.gain}, PM ${k.pmDeg} deg at ${k.wcFound} rad/s, GM ${k.gmDb === null ? 'none to 12 rad/s' : `${k.gmDb} dB at ${k.w180} rad/s`}`);
  }
  console.log(`knife edge trim: rudder ${m.knife.trim.rudder}, elevation ${m.knife.trim.elevation} rad at ${m.knife.trim.speed} m/s`);
  const p = m.knifeLoop.path;
  console.log(`knife-edge loop path: crossoverFor ${p.crossoverFor} rad/s on a plant gain of ${p.gain}, flown at ${p.wc} rad/s, PM ${p.pmDeg} deg at ${p.wcFound} rad/s, GM ${p.gmDb === null ? 'none to 12 rad/s' : `${p.gmDb} dB at ${p.w180} rad/s`}`);
  const bad = marginFailures(m);
  for (const b of bad) console.log(`FAIL ${b}`);
  console.log(`\nfigures margins: ${bad.length ? `${bad.length} failed` : 'all hold'}`);
  process.exit(bad.length ? 1 : 0);
}
