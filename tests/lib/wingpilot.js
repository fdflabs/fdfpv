/*
 * wingpilot.js: a pilot's hand on the wing, for the checks.
 *
 * The wing has no flight controller, so a measurement of its plant needs
 * somebody holding it level, holding a bank, or raising the nose: this
 * file. A bank hold on the roll stick, and on the pitch stick either an
 * attitude hold under a bounded climb-rate or airspeed loop, a scripted
 * hand, or a target that ramps. Deliberately simple and deterministic:
 * the same code runs in Node and in the browser harness, and the state
 * trace it produces is what the cross-host check hashes.
 *
 * Everything takes a loaded sim (tests/lib/simmod.js) that has been
 * initialised and put on the wing airframe, and steps it in 4 ms slices at
 * the wing's RC rate.
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

import { SIM_OK } from './simmod.js';

export const WING_AIRFRAME = 2;
export const SKY_AIRFRAME = 3;
export const CUB_AIRFRAME = 4;
export const RC_STEP_MS = 4;

export function must(code, where) {
  if (code !== SIM_OK) {
    throw new Error(`${where}: sim returned ${code}`);
  }
}

/* Pitch and bank from the state's quaternion. Bank is right wing down
 * positive; pitch is nose above the horizon positive. */
export function attitude(s) {
  const w = s[7], x = s[8], y = s[9], z = s[10];
  const bxz = 2 * (x * z - w * y);
  const byz = 2 * (y * z + w * x);
  return {
    pitch: Math.asin(Math.max(-1, Math.min(1, bxz))),
    bank: Math.asin(Math.max(-1, Math.min(1, byz))),
  };
}

export function wingDebug(sim) {
  if (!sim.wingDebugPtr) {
    sim.wingDebugPtr = sim.e.malloc(20 * 8);
  }
  must(sim.e.sim_wing_debug(sim.wingDebugPtr), 'sim_wing_debug');
  return Array.from(new Float64Array(sim.e.memory.buffer, sim.wingDebugPtr, 20));
}

/*
 * One flight from a reset. Returns the mean of the last five seconds:
 * { v, vz, bank, pitch, p } and the samples themselves.
 *
 * opts: duty (throttle 0..1), speed0 (the throw, m/s), holdBank (rad),
 * vzTarget (climb-rate hold, m/s), vTarget (airspeed hold, m/s),
 * pitchTargetFn(ms) (a target attitude, rad), pitchHand(ms) (a stick
 * value, bypassing the attitude loop), rollStick (fixed), seconds,
 * pitchMin, pitchMax, trimMax (rad), guard (the stall guard), t0Ms (where
 * the clock starts, so consecutive flights keep timestamps rising),
 * yawStick (fixed, 0 unless given; the wing has no rudder),
 * onStep({ ms, v, vz, bank, pitch, p, qAero, s }).
 */
export function fly(sim, opts) {
  const {
    duty, speed0 = 12, holdBank = 0, vzTarget = null, vTarget = null, pitchTargetFn = null,
    pitchHand = null, rollStick = null, seconds = 25, pitchMin = -0.2, pitchMax = 0.15,
    trimMax = 0.2, guard = true, t0Ms = 0, onStep = null, yawStick = 0,
  } = opts;
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_wing_launch(speed0), 'sim_wing_launch');
  let trim = 0;
  const samples = [];
  const total = seconds * 1000;
  for (let ms = 0; ms < total; ms += RC_STEP_MS) {
    const s = sim.readState().state;
    const { pitch, bank } = attitude(s);
    const p = s[11];
    const qAero = -s[12];
    const v = Math.hypot(s[4], s[5], s[6]);
    const vz = s[6];
    const roll = rollStick != null ? rollStick : Math.max(-1, Math.min(1, -1.2 * (bank - holdBank) - 0.12 * p));
    let pitchT = pitchTargetFn ? pitchTargetFn(ms) : 0;
    if (vzTarget != null) {
      trim += 0.00002 * (vzTarget - vz);
      pitchT = 0.05 * (vzTarget - vz) + trim;
    }
    if (vTarget != null) {
      trim += 0.00002 * (v - vTarget);
      pitchT = 0.04 * (v - vTarget) + trim;
    }
    trim = Math.max(-trimMax, Math.min(trimMax, trim));
    pitchT = Math.max(pitchMin, Math.min(pitchMax, pitchT));
    if (guard && v < 9.5 && vTarget == null && !pitchTargetFn && !pitchHand) {
      pitchT = Math.min(pitchT, -0.08);
    }
    const pitchStick = pitchHand
      ? pitchHand(ms)
      : Math.max(-1, Math.min(1, 2.5 * (pitchT - pitch) - 0.25 * qAero));
    must(sim.input((t0Ms + ms) / 1000, roll, pitchStick, yawStick, duty), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    if (ms >= total - 5000) {
      samples.push({ v, vz, bank, pitch, p, x: s[1], y: s[2], z: s[3], t: ms / 1000 });
    }
    if (onStep) {
      onStep({ ms, v, vz, bank, pitch, p, qAero, s });
    }
  }
  const mean = (k) => samples.reduce((a, o) => a + o[k], 0) / samples.length;
  return { v: mean('v'), vz: mean('vz'), bank: mean('bank'), pitch: mean('pitch'), p: mean('p'), samples, endMs: t0Ms + total };
}

/* Level flight speed at a throttle, wings held level, climb rate held at zero. */
export function levelSpeed(sim, duty) {
  const r = fly(sim, { duty, vzTarget: 0 });
  return { v: r.v, vz: r.vz, pitch: r.pitch };
}

/* Power off at an airspeed: sink rate and the glide ratio. */
export function glide(sim, speed) {
  const r = fly(sim, { duty: 0, speed0: speed, vTarget: speed });
  const sink = -r.vz;
  return { v: r.v, sink, ratio: Math.sqrt(Math.max(0, r.v * r.v - r.vz * r.vz)) / sink };
}

/* Full right stick from level flight: the peak roll rate and the speed then. */
export function rollRate(sim, duty) {
  const r = fly(sim, { duty, speed0: 20, vzTarget: 0, seconds: 8 });
  let peak = 0;
  let vAt = r.v;
  for (let ms = 0; ms < 1500; ms += RC_STEP_MS) {
    must(sim.input((r.endMs + ms) / 1000, 1, 0, 0, duty), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    const s = sim.readState().state;
    if (Math.abs(s[11]) > Math.abs(peak)) {
      peak = s[11];
      vAt = Math.hypot(s[4], s[5], s[6]);
    }
  }
  return { rateDegS: peak * 180 / Math.PI, v: vAt };
}

/* A held bank at a throttle: the turn radius from the ground track against
 * the formula V^2 / (g tan bank) at the bank and speed flown. */
export function turn(sim, duty, bankRad) {
  const r = fly(sim, { duty, speed0: 18, holdBank: bankRad, vzTarget: 0, seconds: 30 });
  const pts = r.samples;
  const head = (i) => Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x);
  let dpsi = 0;
  let prev = head(0);
  for (let i = 1; i < pts.length - 1; i += 1) {
    const h = head(i);
    let d = h - prev;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    dpsi += d;
    prev = h;
  }
  const dt = pts[pts.length - 1].t - pts[0].t;
  const radius = r.v / (Math.abs(dpsi) / dt);
  const formula = r.v * r.v / (9.81 * Math.tan(Math.abs(r.bank)));
  return { v: r.v, bankDeg: r.bank * 180 / Math.PI, radius, formula, offPercent: (radius / formula - 1) * 100 };
}

/* Full throttle at a held airspeed, the best over a sweep: climb rate. */
export function bestClimb(sim, speeds = [11, 12, 13, 14, 15, 16, 17, 18]) {
  let best = null;
  for (const vT of speeds) {
    const r = fly(sim, { duty: 1, speed0: vT, vTarget: vT, seconds: 20, pitchMax: 1.2, pitchMin: -0.5, trimMax: 1.0 });
    if (!best || r.vz > best.vz) {
      best = { v: r.v, vz: r.vz, pitchDeg: r.pitch * 180 / Math.PI };
    }
  }
  return best;
}

/* Power off, the nose raised steadily: the speed at which the angle of
 * attack reaches the stall. */
export function stallSpeed(sim, alphaStall) {
  let stallV = null;
  fly(sim, {
    duty: 0, speed0: 13, seconds: 12, pitchMax: 0.7, pitchMin: -0.3, guard: false,
    pitchTargetFn: (ms) => Math.min(0.6, 0.06 * ms / 1000),
    onStep: (o) => {
      if (stallV == null && o.ms > 1000 && wingDebug(sim)[0] > alphaStall) {
        stallV = o.v;
      }
    },
  });
  return stallV;
}

/* A hand throw, by default at 10 m/s and sixty percent throttle, an
 * eighth of up stick for two seconds, wings held level: where the wing is
 * after three. */
export function throwTest(sim, { speed = 10, duty = 0.6, up = 0.12 } = {}) {
  fly(sim, { duty, speed0: speed, seconds: 3, pitchHand: (ms) => (ms < 2000 ? up : 0) });
  const s = sim.readState().state;
  return { z: s[3], v: Math.hypot(s[4], s[5], s[6]) };
}

/* Cruise, then throttle off with the pitch stick neutral: the worst pitch
 * in the next three seconds. */
export function chop(sim) {
  const r = fly(sim, { duty: 0.65, speed0: 15, vzTarget: 0, seconds: 10 });
  let worst = 0;
  for (let ms = 0; ms < 3000; ms += RC_STEP_MS) {
    const s = sim.readState().state;
    const { pitch, bank } = attitude(s);
    worst = Math.max(worst, Math.abs(pitch));
    const roll = Math.max(-1, Math.min(1, -1.2 * bank - 0.12 * s[11]));
    must(sim.input((r.endMs + ms) / 1000, roll, 0, 0, 0), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
  }
  return { worstPitchDeg: worst * 180 / Math.PI };
}

/*
 * The two manoeuvres only an aircraft with a tail has a band for. Both
 * start from level flight at 65 percent held by fly(), then carry on from
 * where it left the aircraft, with the clock still rising.
 */

/* The phugoid: level at 65 percent, a second of a little up stick, then
 * hands off with the wings held level. The period is the mean spacing of
 * the airspeed's upward crossings of the speed it settles at, over thirty
 * seconds. */
export function phugoid(sim) {
  const r = fly(sim, { duty: 0.65, speed0: 15, vzTarget: 0, seconds: 15 });
  const vs = [];
  for (let ms = 0; ms < 32000; ms += RC_STEP_MS) {
    const s = sim.readState().state;
    const { bank } = attitude(s);
    const roll = Math.max(-1, Math.min(1, -1.2 * bank - 0.12 * s[11]));
    must(sim.input((r.endMs + ms) / 1000, roll, ms < 1000 ? 0.3 : 0, 0, 0.65), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    if (ms >= 2000) {
      vs.push({ t: ms / 1000, v: Math.hypot(s[4], s[5], s[6]) });
    }
  }
  /* Crossings of where the speed settles, not of the window's mean: a
   * damped oscillation's mean is dragged toward its first, largest swing. */
  const tail = vs.filter((o) => o.t >= vs[vs.length - 1].t - 5);
  const mean = tail.reduce((a, o) => a + o.v, 0) / tail.length;
  const ups = [];
  for (let i = 1; i < vs.length; i += 1) {
    const a = vs[i - 1].v - mean;
    const b = vs[i].v - mean;
    if (a < 0 && b >= 0) {
      ups.push(vs[i - 1].t + (vs[i].t - vs[i - 1].t) * (-a / (b - a)));
    }
  }
  const period = ups.length >= 2 ? (ups[ups.length - 1] - ups[0]) / (ups.length - 1) : null;
  const vMax = Math.max(...vs.map((o) => o.v));
  const vMin = Math.min(...vs.map((o) => o.v));
  return { period, cycles: ups.length - 1, mean, swing: vMax - vMin };
}

/* Full right rudder from level at 65 percent, the pitch stick at neutral.
 * wingsLevel: the roll stick holds the wings level, and the result is the
 * mean sideslip over the last two of six seconds (aero sign: positive is
 * the wind from the right). Otherwise the ailerons stay centred for two
 * seconds, and the result is the peak nose right yaw rate in the first one
 * and a half and the bank at two (right wing down positive). */
export function rudderStep(sim, { wingsLevel }) {
  const r = fly(sim, { duty: 0.65, speed0: 15, vzTarget: 0, seconds: 15 });
  const total = wingsLevel ? 6000 : 2000;
  let peakR = 0;
  let sumBeta = 0;
  let n = 0;
  let s = null;
  for (let ms = 0; ms < total; ms += RC_STEP_MS) {
    s = sim.readState().state;
    const { bank } = attitude(s);
    const roll = wingsLevel ? Math.max(-1, Math.min(1, -1.2 * bank - 0.12 * s[11])) : 0;
    must(sim.input((r.endMs + ms) / 1000, roll, 0, 1, 0.65), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    s = sim.readState().state;
    if (ms < 1500) {
      peakR = Math.max(peakR, -s[13]);
    }
    if (ms >= total - 2000) {
      sumBeta += wingDebug(sim)[1];
      n += 1;
    }
  }
  const w = s[7], x = s[8], y = s[9], z = s[10];
  const bank = Math.atan2(2 * (y * z + w * x), 1 - 2 * (x * x + y * y));
  return { betaDeg: (sumBeta / n) * 180 / Math.PI, peakRDegS: peakR * 180 / Math.PI, bankDeg: bank * 180 / Math.PI, v: Math.hypot(s[4], s[5], s[6]) };
}

/* The prop's reaction at a standstill and full throttle: one step from
 * rest, where the air has nothing to say yet, so the roll moment is the
 * motor's alone. Returns the torque about body x, negative rolling left. */
export function propTorque(sim) {
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_set_pose(0, 0, 50, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.input(0, 0, 0, 0, 1), 'sim_input');
  must(sim.step(1), 'sim_step');
  const d = wingDebug(sim);
  return { rollMoment: d[12], thrust: d[8], aeroRoll: d[5] };
}

/* What every replay of the wing recording does before its first sample. */
export function wingPrelude(sim) {
  must(sim.e.sim_set_airframe(WING_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_wing_launch(10), 'sim_wing_launch');
}

/* The same for the Skyhunter's recording: its airframe, a harder throw. */
export function skyPrelude(sim) {
  must(sim.e.sim_set_airframe(SKY_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_wing_launch(12), 'sim_wing_launch');
}

/* The Cub's, thrown: its airframe and a throw a little over its stall. */
export function cubPrelude(sim) {
  must(sim.e.sim_set_airframe(CUB_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_wing_launch(11), 'sim_wing_launch');
}

/* The Cub on the ground, standing on its three wheels at the end of the
 * strip, facing down it (world +x), with the ground plane at z = 0 as
 * the shell raises it. The pose is where it settles, so a recording can
 * start at once: the CG 0.1463 m up and 11.0 deg nose up, the drawn
 * model's pose (src/render/cubcraft.js). No steps here,
 * because a replay's clock starts after the prelude. */
export const CUB_REST = { z: 0.1463, pitchDeg: 11.0 };
export function cubGroundPrelude(sim, { mu = 1.4, e = 0 } = {}) {
  must(sim.e.sim_set_airframe(CUB_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, mu, e), 'sim_set_ground');
  const h = CUB_REST.pitchDeg * Math.PI / 360;
  must(sim.e.sim_set_pose(0, 0, CUB_REST.z, Math.cos(h), 0, -Math.sin(h), 0), 'sim_set_pose');
}

/* The load on each wheel, newtons: left main, right main, tailwheel. */
export function wheelLoads(sim) {
  if (!sim.wheelPtr) {
    sim.wheelPtr = sim.e.malloc(3 * 8);
  }
  must(sim.e.sim_wheel_loads(sim.wheelPtr), 'sim_wheel_loads');
  return Array.from(new Float64Array(sim.e.memory.buffer, sim.wheelPtr, 3));
}

/*
 * One continuous flight with the pilot's hand on it, recorded as the stick
 * tuples it sent, so the cross-host check can replay exactly those in Node
 * and in Chrome and hash the module's trace. The pilot's own arithmetic
 * uses JS maths, which is not bit specified between engines, so it is not
 * allowed to run inside the check: it runs once here, in Node, and the
 * recording is what ships. Twenty seconds: a throw and level at 65
 * percent, full right stick, a held bank, a chop. With rudder, the chop
 * also gets two seconds of full right yaw stick, so an aircraft that has
 * one has it in the hashed trace; the wing's recording is made without.
 */
export function recordScriptedFlight(sim, { prelude = wingPrelude, rudder = false } = {}) {
  must(sim.reset(), 'sim_reset');
  prelude(sim);
  const samples = [];
  let trim = 0;
  for (let ms = 0; ms < 20000; ms += RC_STEP_MS) {
    const s = sim.readState().state;
    const { pitch, bank } = attitude(s);
    const p = s[11];
    const qAero = -s[12];
    const vz = s[6];
    let roll;
    let pitchStick;
    let duty;
    if (ms < 6000) {
      duty = 0.65;
      roll = Math.max(-1, Math.min(1, -1.2 * bank - 0.12 * p));
      trim += 0.00002 * (0 - vz);
      trim = Math.max(-0.2, Math.min(0.2, trim));
      const pitchT = Math.max(-0.2, Math.min(0.15, 0.05 * (0 - vz) + trim));
      pitchStick = Math.max(-1, Math.min(1, 2.5 * (pitchT - pitch) - 0.25 * qAero));
    } else if (ms < 7500) {
      duty = 0.65;
      roll = 1;
      pitchStick = 0;
    } else if (ms < 15000) {
      duty = 0.65;
      roll = Math.max(-1, Math.min(1, -1.2 * (bank - Math.PI / 4) - 0.12 * p));
      trim += 0.00002 * (0 - vz);
      trim = Math.max(-0.2, Math.min(0.2, trim));
      const pitchT = Math.max(-0.2, Math.min(0.15, 0.05 * (0 - vz) + trim));
      pitchStick = Math.max(-1, Math.min(1, 2.5 * (pitchT - pitch) - 0.25 * qAero));
    } else {
      duty = 0;
      roll = Math.max(-1, Math.min(1, -1.2 * bank - 0.12 * p));
      pitchStick = 0;
    }
    const yaw = rudder && ms >= 16000 && ms < 18000 ? 1 : 0;
    samples.push({ tUs: ms * 1000, roll, pitch: pitchStick, yaw, throttle: duty });
    must(sim.input(ms / 1000, roll, pitchStick, yaw, duty), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
  }
  return samples;
}
