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
import { BRAMOR_CATAPULT } from '../../configs/airframes.js';

export const WING_AIRFRAME = 2;
export const SKY_AIRFRAME = 3;
export const CUB_AIRFRAME = 4;
export const GLIDER_AIRFRAME = 6;
export const BRAMOR_AIRFRAME = 8;
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
 * onStep({ ms, v, vz, bank, pitch, p, qAero, s }), start (a pose, the
 * seven numbers sim_set_pose takes, set before the throw; the reset's
 * origin unless given).
 */
export function fly(sim, opts) {
  const {
    duty, speed0 = 12, holdBank = 0, vzTarget = null, vTarget = null, pitchTargetFn = null,
    pitchHand = null, rollStick = null, seconds = 25, pitchMin = -0.2, pitchMax = 0.15,
    trimMax = 0.2, guard = true, t0Ms = 0, onStep = null, yawStick = 0, start = null,
  } = opts;
  must(sim.reset(), 'sim_reset');
  if (start) {
    must(sim.e.sim_set_pose(...start), 'sim_set_pose');
  }
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
 * attack reaches the stall. Thrown at 13 m/s unless told otherwise, which
 * is where the Bramor already stalls. */
export function stallSpeed(sim, alphaStall, { speed0 = 13 } = {}) {
  let stallV = null;
  fly(sim, {
    duty: 0, speed0, seconds: 12, pitchMax: 0.7, pitchMin: -0.3, guard: false,
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

/*
 * The Bramor's catapult: the aircraft at the rail's front end, `height`
 * metres up with the nose `pitchDeg` up along the rail, heading down world
 * +x, released at `speed` along the rail, the rail the shell draws
 * (configs/airframes.js). A chute still out is stowed first, as the shell
 * does. No steps: a replay's clock starts after the prelude.
 */
export { BRAMOR_CATAPULT };
/* cos and sin of 10 deg to 17 digits: half the rail's 20, and the Bramor
 * chute recording's half bank. Literals, because a recording's prelude is
 * part of the hashed trace and JS Math.cos is not specified to the bit. */
const COS_10 = 0.98480775301220802;
const SIN_10 = 0.17364817766693033;
export function catapultRelease(sim, { speed, pitchDeg, height } = BRAMOR_CATAPULT) {
  if (pitchDeg !== 20) {
    throw new Error(`catapultRelease: the rail is 20 deg, not ${pitchDeg}`);
  }
  must(sim.e.sim_wing_chute(0), 'sim_wing_chute');
  must(sim.e.sim_set_pose(0, 0, height, COS_10, 0, -SIN_10, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(speed), 'sim_wing_launch');
}

/*
 * Off the catapult at full throttle with the harness pilot's hand on it:
 * the wings held level and, after `holdMs` with the stick centred (the
 * aircraft left alone to fly off the rail's angle), an airspeed hold at
 * `climbSpeed`, which is the best climb. Returns the lowest airspeed and
 * the lowest height above the release point over the whole run, and the
 * height gained and the speed at the end.
 */
export function catapultTest(sim, { climbSpeed = 16, seconds = 10, holdMs = 1000, launch = BRAMOR_CATAPULT } = {}) {
  must(sim.reset(), 'sim_reset');
  catapultRelease(sim, launch);
  let vMin = Infinity;
  let dzMin = Infinity;
  let trim = 0.1;
  let s = sim.readState().state;
  for (let ms = 0; ms < seconds * 1000; ms += RC_STEP_MS) {
    s = sim.readState().state;
    const { pitch, bank } = attitude(s);
    const v = Math.hypot(s[4], s[5], s[6]);
    vMin = Math.min(vMin, v);
    dzMin = Math.min(dzMin, s[3] - launch.height);
    const roll = Math.max(-1, Math.min(1, -1.2 * bank - 0.12 * s[11]));
    let pitchStick = 0;
    if (ms >= holdMs) {
      trim += 0.00002 * (v - climbSpeed);
      trim = Math.max(-1, Math.min(1, trim));
      const pitchT = Math.max(-0.5, Math.min(1.2, 0.04 * (v - climbSpeed) + trim));
      pitchStick = Math.max(-1, Math.min(1, 2.5 * (pitchT - pitch) - 0.25 * -s[12]));
    }
    must(sim.input(ms / 1000, roll, pitchStick, 0, 1), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
  }
  s = sim.readState().state;
  return { vMin, dzMin, dz: s[3] - launch.height, v: Math.hypot(s[4], s[5], s[6]), vz: s[6] };
}

/*
 * The parachute from cruise: level at `duty` in Stabilised with the sticks
 * centred, `height` metres over a ground plane at z = 0, then the pull and
 * the sticks left alone. The pull is from level flight, not a dive, so
 * the descent is never arrested in the air after the first two seconds. Returns the descent rate and the attitude over
 * the last `settleS` seconds before touchdown, the peak load in the first
 * two seconds, and how and where it came to rest.
 */
export function chuteTest(sim, { height = 60, speed = 16, duty = 0.667, cruiseMs = 4000, settleS = 5, mu = 1.4 } = {}) {
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_wing_set_stab(1), 'sim_wing_set_stab');
  must(sim.e.sim_set_pose(0, 0, height, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(speed), 'sim_wing_launch');
  must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, mu, 0), 'sim_set_ground');
  let ms = 0;
  for (; ms < cruiseMs; ms += RC_STEP_MS) {
    must(sim.input(ms / 1000, 0, 0, 0, duty), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
  }
  const pulledAt = sim.readState().state;
  must(sim.e.sim_wing_chute(1), 'sim_wing_chute');
  const trace = [];
  let prev = pulledAt;
  let peakG = 0;
  let touchdown = null;
  const upz = (s) => 1 - 2 * (s[8] * s[8] + s[9] * s[9]);
  for (let t = 0; t < 60000; t += RC_STEP_MS, ms += RC_STEP_MS) {
    must(sim.input(ms / 1000, 0, 0, 0, duty), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    const s = sim.readState().state;
    if (t < 2000) {
      const dt = RC_STEP_MS / 1000;
      const a = Math.hypot(s[4] - prev[4], s[5] - prev[5], s[6] - prev[6] + 9.81 * dt) / dt / 9.81;
      peakG = Math.max(peakG, a);
    }
    prev = s;
    trace.push({ t: t / 1000, z: s[3], vz: s[6], upz: upz(s), rpm: s[14] });
    /* Touchdown: the first step the descent is arrested, read off the
     * state rather than the contact count, which a resting hull settles to
     * zero inside one RC slice. */
    if (touchdown === null && t > 2000 && s[6] > -1.0) {
      touchdown = { t: t / 1000, vz: trace.length > 1 ? trace[trace.length - 2].vz : s[6], z: s[3] };
    }
    if (touchdown !== null && t / 1000 > touchdown.t + 3) {
      break;
    }
  }
  const before = trace.filter((o) => touchdown && o.t < touchdown.t - 0.5 && o.t >= touchdown.t - 0.5 - settleS);
  const mean = (k) => before.reduce((a, o) => a + o[k], 0) / before.length;
  const end = sim.readState().state;
  return {
    sink: -mean('vz'), upzMean: mean('upz'), upzWorst: Math.max(...before.map((o) => o.upz)),
    peakG, touchdown, rest: { z: end[3], upz: upz(end), v: Math.hypot(end[4], end[5], end[6]), w: Math.hypot(end[11], end[12], end[13]) },
    rpmAfter: trace.length > 250 ? trace[250].rpm : null, drift: Math.hypot(end[1] - pulledAt[1], end[2] - pulledAt[2]),
    open: sim.e.sim_wing_chute_open(),
  };
}

/* What the Bramor's recording does before its first sample: its airframe
 * and the catapult. */
export function bramorPrelude(sim) {
  must(sim.e.sim_set_airframe(BRAMOR_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  catapultRelease(sim);
}

/* The Bramor's chute recording: at cruise speed 60 m up, banked 20 deg
 * right so the swing onto its back is not symmetric, the chute pulled the
 * moment the replay starts. */
export function bramorChutePrelude(sim) {
  must(sim.e.sim_set_airframe(BRAMOR_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_wing_chute(0), 'sim_wing_chute');
  must(sim.e.sim_set_pose(0, 0, 60, COS_10, SIN_10, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(16), 'sim_wing_launch');
  must(sim.e.sim_wing_chute(1), 'sim_wing_chute');
}

/*
 * Fifteen seconds under the canopy with every stick held at full and the
 * throttle open, so the hashed trace carries the pull, the opening, the
 * swing onto its back and the descent, and shows that the motor and the
 * surfaces ignore the sticks while the chute is out.
 */
export function recordChuteFlight(sim) {
  must(sim.reset(), 'sim_reset');
  bramorChutePrelude(sim);
  const samples = [];
  for (let ms = 0; ms < 15000; ms += RC_STEP_MS) {
    samples.push({ tUs: ms * 1000, roll: 1, pitch: 1, yaw: 1, throttle: 1 });
    must(sim.input(ms / 1000, 1, 1, 1, 1), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
  }
  return samples;
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

/* The load on each contact point, newtons: left main, right main,
 * tailwheel, and the prop's tip, which is zero unless it has struck. */
export function wheelLoads(sim) {
  if (!sim.wheelPtr) {
    sim.wheelPtr = sim.e.malloc(4 * 8);
  }
  must(sim.e.sim_wheel_loads(sim.wheelPtr), 'sim_wheel_loads');
  return Array.from(new Float64Array(sim.e.memory.buffer, sim.wheelPtr, 4));
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

/*
 * The Cub's take off, the way a taildragger is flown off a strip: full
 * throttle, the wings held level on the ailerons, the stick well forward
 * to bring the tail up to 2 deg of pitch, and at the rotation speed back to
 * 8 deg, which it holds into the climb. The phase is the airspeed's, not
 * the wheels', so a hop as the tail comes up does not rotate early. The
 * rudder stays centred, so any swing is the aircraft's own. Returns the
 * sticks for this step from the state.
 */
export function takeoffSticks(s, { vRotate = 8.9 } = {}) {
  const { pitch, bank } = attitude(s);
  const v = Math.hypot(s[4], s[5], s[6]);
  const qAero = -s[12];
  const pitchT = (v < vRotate ? 2 : 8) * Math.PI / 180;
  const roll = Math.max(-1, Math.min(1, -1.2 * bank - 0.12 * s[11]));
  const pitchStick = Math.max(-1, Math.min(1, 4 * (pitchT - pitch) - 0.5 * qAero));
  return [roll, pitchStick, 0, 1];
}

/*
 * The Cub's recording for the cross-host check: from standing on the strip,
 * a second at idle, the take off above, eight seconds of climb, then level
 * at 75 percent, half a second of full right roll, a held 45 deg bank, a
 * chop and two seconds of full right rudder, twenty two seconds in all,
 * clear of the ground from the climb on, 11 m at the lowest. The gear, the
 * take off roll and the liftoff, is in the hashed trace.
 */
export function recordCubFlight(sim) {
  must(sim.reset(), 'sim_reset');
  cubGroundPrelude(sim);
  const samples = [];
  let trim = 0;
  for (let ms = 0; ms < 22000; ms += RC_STEP_MS) {
    const s = sim.readState().state;
    const { pitch, bank } = attitude(s);
    const p = s[11];
    const qAero = -s[12];
    const vz = s[6];
    let sticks;
    const levelPitch = () => {
      trim += 0.00002 * (0 - vz);
      trim = Math.max(-0.2, Math.min(0.2, trim));
      const pitchT = Math.max(-0.2, Math.min(0.15, 0.05 * (0 - vz) + trim));
      return Math.max(-1, Math.min(1, 2.5 * (pitchT - pitch) - 0.25 * qAero));
    };
    if (ms < 1000) {
      sticks = [0, 0, 0, 0];
    } else if (ms < 9000) {
      sticks = takeoffSticks(s);
    } else if (ms < 12000) {
      sticks = [Math.max(-1, Math.min(1, -1.2 * bank - 0.12 * p)), levelPitch(), 0, 0.75];
    } else if (ms < 12500) {
      sticks = [1, 0, 0, 0.75];
    } else if (ms < 18000) {
      sticks = [Math.max(-1, Math.min(1, -1.2 * (bank - Math.PI / 4) - 0.12 * p)), levelPitch(), 0, 0.85];
    } else {
      sticks = [Math.max(-1, Math.min(1, -1.2 * bank - 0.12 * p)), 0, ms >= 19000 && ms < 21000 ? 1 : 0, 0];
    }
    const [roll, pitchStick, yaw, duty] = sticks;
    samples.push({ tUs: ms * 1000, roll, pitch: pitchStick, yaw, throttle: duty });
    must(sim.input(ms / 1000, roll, pitchStick, yaw, duty), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
  }
  return samples;
}

/* The Radian's recording, and every flight of it that starts in the air:
 * its airframe and the shell's hand throw, 10 m/s. */
export function gliderPrelude(sim) {
  must(sim.e.sim_set_airframe(GLIDER_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_wing_launch(10), 'sim_wing_launch');
}

/*
 * The Radian's recording for the cross-host check: the flight a glider is
 * for. Thrown at 80 m, a hundred metres short of the strongest thermal and
 * on the line that puts it at the centre of a 30 deg circle, a powered
 * climb at full throttle for six seconds, the motor off and the prop
 * folded, a glide to the thermal, forty seconds circling in it, then out
 * of it level, half a second of full right roll, two and a half seconds
 * of full right rudder, and the motor at 40 percent to the end. Seventy
 * seconds at most, all of it clear of the ground, so the fold, the unfold
 * and the rising air are all in the hashed trace. The pilot is the harness
 * pilot's bank and airspeed hold.
 */
export const GLIDER_REC_START = [0, 82.8, 80];
export function recordGliderFlight(sim) {
  must(sim.reset(), 'sim_reset');
  gliderRecPrelude(sim);
  const samples = [];
  let trim = 0;
  let circleFrom = null;
  let phase = 0;
  for (let ms = 0; ms < 70000; ms += RC_STEP_MS) {
    const s = sim.readState().state;
    const { pitch, bank } = attitude(s);
    const p = s[11];
    const qAero = -s[12];
    const v = Math.hypot(s[4], s[5], s[6]);
    const holdBank = (target) => Math.max(-1, Math.min(1, -1.2 * (bank - target) - 0.12 * p));
    /* An airspeed hold on the pitch attitude, as fly()'s, with its trim
     * started afresh in each phase and a glider's stick: a little of it,
     * because a glider held nose up past its stall mushes down stalled
     * at the speed asked for, and a speed loop cannot tell. */
    const holdSpeed = (vT, lo, hi, most = 1) => {
      trim += 0.00002 * (v - vT);
      trim = Math.max(-0.15, Math.min(0.15, trim));
      const pitchT = Math.max(lo, Math.min(hi, 0.04 * (v - vT) + trim));
      return Math.max(-most, Math.min(most, 2.5 * (pitchT - pitch) - 0.25 * qAero));
    };
    if (circleFrom === null && ms >= 6000 && (s[1] >= 110 || ms >= 20000)) {
      circleFrom = ms;
    }
    const nowPhase = ms < 6000 ? 0 : circleFrom === null ? 1 : 2;
    if (nowPhase !== phase) {
      trim = 0;
      phase = nowPhase;
    }
    const t = circleFrom === null ? -1 : ms - circleFrom;
    let sticks;
    if (ms < 6000) {
      sticks = [holdBank(0), holdSpeed(11, -0.2, 0.6), 0, 1];
    } else if (circleFrom === null) {
      sticks = [holdBank(0), holdSpeed(8.5, -0.3, 0.1, 0.3), 0, 0];
    } else if (t < 40000) {
      sticks = [holdBank(Math.PI / 6), holdSpeed(8.5, -0.3, 0.1, 0.3), 0, 0];
    } else if (t < 44000) {
      sticks = [holdBank(0), holdSpeed(9, -0.3, 0.1, 0.3), 0, 0];
    } else if (t < 44500) {
      sticks = [1, 0, 0, 0];
    } else if (t < 47000) {
      sticks = [holdBank(0), 0, 1, 0];
    } else if (t < 50000) {
      sticks = [holdBank(0), holdSpeed(9, -0.3, 0.1, 0.3), 0, 0.4];
    } else {
      break;
    }
    const [roll, pitchStick, yaw, duty] = sticks;
    samples.push({ tUs: ms * 1000, roll, pitch: pitchStick, yaw, throttle: duty });
    must(sim.input(ms / 1000, roll, pitchStick, yaw, duty), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
  }
  return samples;
}

/* The pose the recording starts from, facing along +x, 12.8 m to the left
 * of the line through the thermal at (110, 70): a right hand circle at
 * 30 deg and 8.5 m/s begun abeam the core is centred on it. No steps,
 * because a replay's clock starts after it. */
export function gliderRecPose(sim) {
  const [x, y, z] = GLIDER_REC_START;
  must(sim.e.sim_set_pose(x, y, z, 1, 0, 0, 0), 'sim_set_pose');
}

/* What a replay of the Radian's recording does before its first sample. */
export function gliderRecPrelude(sim) {
  must(sim.e.sim_set_airframe(GLIDER_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  gliderRecPose(sim);
  must(sim.e.sim_wing_launch(10), 'sim_wing_launch');
}

/*
 * The GWS Slow Stick, airframe 5: three channels, no ailerons, so the roll
 * stick drives its rudder and it banks through its dihedral. Thrown at a
 * little over its stall, or standing on its wheels at the drawn pose: the
 * CG 0.1349 m up and 6.91 deg nose up (src/render/slowstickcraft.js).
 */
export const SLOWSTICK_AIRFRAME = 5;
export const SLOWSTICK_REST = { z: 0.1349, pitchDeg: 6.91 };
export function slowstickPrelude(sim) {
  must(sim.e.sim_set_airframe(SLOWSTICK_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_wing_launch(6), 'sim_wing_launch');
}
export function slowstickGroundPrelude(sim, { mu = 1.4, e = 0 } = {}) {
  must(sim.e.sim_set_airframe(SLOWSTICK_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, mu, e), 'sim_set_ground');
  const h = SLOWSTICK_REST.pitchDeg * Math.PI / 360;
  must(sim.e.sim_set_pose(0, 0, SLOWSTICK_REST.z, Math.cos(h), 0, -Math.sin(h), 0), 'sim_set_pose');
}

/*
 * The Slow Stick's recording for the cross-host check: from standing on
 * the strip, a second at idle, full throttle with every stick centred until
 * it flies itself off, six seconds of climb, then level at 75 percent with
 * the wings held on the roll stick, which is the rudder, a second of full
 * right roll stick, a held 30 deg bank, and a chop with two seconds of full
 * right yaw stick: twenty two seconds, the take off in the hashed trace.
 */
export function recordSlowStickFlight(sim) {
  must(sim.reset(), 'sim_reset');
  slowstickGroundPrelude(sim);
  const samples = [];
  let trim = 0;
  for (let ms = 0; ms < 22000; ms += RC_STEP_MS) {
    const s = sim.readState().state;
    const { pitch, bank } = attitude(s);
    const p = s[11];
    const qAero = -s[12];
    const vz = s[6];
    const hold = (b) => Math.max(-1, Math.min(1, -1.2 * (bank - b) - 0.12 * p));
    const levelPitch = () => {
      trim += 0.00002 * (0 - vz);
      trim = Math.max(-0.2, Math.min(0.2, trim));
      const pitchT = Math.max(-0.2, Math.min(0.15, 0.05 * (0 - vz) + trim));
      return Math.max(-1, Math.min(1, 2.5 * (pitchT - pitch) - 0.25 * qAero));
    };
    let sticks;
    if (ms < 1000) {
      sticks = [0, 0, 0, 0];
    } else if (ms < 9000) {
      sticks = [0, 0, 0, 1];
    } else if (ms < 12000) {
      sticks = [hold(0), levelPitch(), 0, 0.75];
    } else if (ms < 13000) {
      sticks = [1, 0, 0, 0.75];
    } else if (ms < 18000) {
      sticks = [hold(Math.PI / 6), levelPitch(), 0, 0.85];
    } else {
      sticks = [hold(0), 0, ms >= 19000 && ms < 21000 ? 1 : 0, 0];
    }
    const [roll, pitchStick, yaw, duty] = sticks;
    samples.push({ tUs: ms * 1000, roll, pitch: pitchStick, yaw, throttle: duty });
    must(sim.input(ms / 1000, roll, pitchStick, yaw, duty), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
  }
  return samples;
}

/*
 * BMJR's 1/2A Texaco Buzzard Bombshell, airframe 11: the Slow Stick's
 * three channels, no ailerons, so the roll stick drives its rudder and it
 * banks through its polyhedral. Thrown at a little over its stall, or
 * standing on its wheels and tail skid at the drawn pose: the CG 0.1318 m
 * up and 8.50 deg nose up (src/render/bombshellcraft.js).
 */
export const BOMBSHELL_AIRFRAME = 11;
export const BOMBSHELL_REST = { z: 0.1318, pitchDeg: 8.50 };
export function bombshellPrelude(sim) {
  must(sim.e.sim_set_airframe(BOMBSHELL_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_wing_launch(8.5), 'sim_wing_launch');
}
export function bombshellGroundPrelude(sim, { mu = 1.4, e = 0 } = {}) {
  must(sim.e.sim_set_airframe(BOMBSHELL_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, mu, e), 'sim_set_ground');
  const h = BOMBSHELL_REST.pitchDeg * Math.PI / 360;
  must(sim.e.sim_set_pose(0, 0, BOMBSHELL_REST.z, Math.cos(h), 0, -Math.sin(h), 0), 'sim_set_pose');
}

/*
 * The Bombshell's recording for the cross-host check: from standing on the
 * strip, a second at idle, eleven of full throttle with every stick
 * centred while the stabiliser lifts the tail and it flies itself off and
 * climbs, then level at 75 percent with the wings held on the roll stick,
 * which is the rudder, a second of full right roll stick, a held 30 deg
 * bank, and the throttle back to idle with a second and a half of full
 * right yaw stick: twenty two seconds, the take off in the hashed trace,
 * and still flying at the end, so nothing in it touches the ground but the
 * wheels and the skid it starts on.
 */
export function recordBombshellFlight(sim) {
  must(sim.reset(), 'sim_reset');
  bombshellGroundPrelude(sim);
  const samples = [];
  let trim = 0;
  for (let ms = 0; ms < 22000; ms += RC_STEP_MS) {
    const s = sim.readState().state;
    const { pitch, bank } = attitude(s);
    const p = s[11];
    const qAero = -s[12];
    const vz = s[6];
    const hold = (b) => Math.max(-1, Math.min(1, -1.2 * (bank - b) - 0.12 * p));
    const levelPitch = () => {
      trim += 0.00002 * (0 - vz);
      trim = Math.max(-0.2, Math.min(0.2, trim));
      const pitchT = Math.max(-0.2, Math.min(0.15, 0.05 * (0 - vz) + trim));
      return Math.max(-1, Math.min(1, 2.5 * (pitchT - pitch) - 0.25 * qAero));
    };
    let sticks;
    if (ms < 1000) {
      sticks = [0, 0, 0, 0];
    } else if (ms < 12000) {
      sticks = [0, 0, 0, 1];
    } else if (ms < 14000) {
      sticks = [hold(0), levelPitch(), 0, 0.75];
    } else if (ms < 15000) {
      sticks = [1, 0, 0, 0.75];
    } else if (ms < 19000) {
      sticks = [hold(Math.PI / 6), levelPitch(), 0, 0.9];
    } else {
      sticks = [hold(0), 0, ms >= 20000 && ms < 21500 ? 1 : 0, 0];
    }
    const [roll, pitchStick, yaw, duty] = sticks;
    samples.push({ tUs: ms * 1000, roll, pitch: pitchStick, yaw, throttle: duty });
    must(sim.input(ms / 1000, roll, pitchStick, yaw, duty), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
  }
  return samples;
}

/*
 * The Timber, docs/TIMBER-STAGE1.md: airframe 7, a STOL taildragger with
 * flaps and slats. On the strip, standing on its three wheels facing down
 * it, at the pose the plant settles to, the drawn model's
 * (src/render/timbercraft.js): the CG 0.2117 m up and 11.81 deg nose up.
 * The flaps are the notch given, set before the pose so a reset has them
 * there; the slats on, as the kit is flown for STOL. No steps here.
 */
export const TIMBER_AIRFRAME = 7;
export const TIMBER_REST = { z: 0.2117, pitchDeg: 11.81 };
export function timberPrelude(sim, { flaps = 0 } = {}) {
  must(sim.e.sim_set_airframe(TIMBER_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_wing_set_flaps(flaps), 'sim_wing_set_flaps');
  must(sim.e.sim_wing_launch(12), 'sim_wing_launch');
}
export function timberGroundPrelude(sim, { mu = 1.4, e = 0, flaps = 0 } = {}) {
  must(sim.e.sim_set_airframe(TIMBER_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_wing_set_flaps(flaps), 'sim_wing_set_flaps');
  must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, mu, e), 'sim_set_ground');
  const h = TIMBER_REST.pitchDeg * Math.PI / 360;
  must(sim.e.sim_set_pose(0, 0, TIMBER_REST.z, Math.cos(h), 0, -Math.sin(h), 0), 'sim_set_pose');
}

/*
 * The Timber's take off, a STOL one: full throttle from standing with the
 * stick forward to bring the tail up to 9 deg of pitch, which keeps the
 * flapped wing short of its stall, and once clear of the grass by a metre
 * 12 deg into the climb. The wings held level on the ailerons; the rudder
 * centred, so any swing is the aircraft's own. The sticks for this step.
 */
export function timberTakeoffSticks(s, { pitchDeg = 9, climbDeg = 12 } = {}) {
  const { pitch, bank } = attitude(s);
  const pitchT = (s[3] > 1.2 ? climbDeg : pitchDeg) * Math.PI / 180;
  const roll = Math.max(-1, Math.min(1, -1.2 * bank - 0.12 * s[11]));
  const pitchStick = Math.max(-1, Math.min(1, 10 * (pitchT - pitch) - 0.5 * -s[12]));
  return [roll, pitchStick, 0, 1];
}

/*
 * The Timber's recording for the cross-host check, flown on half flaps,
 * the manual's take off setting, so the flaps' lift, drag, moment and mix
 * are all in the hashed trace: from standing on the strip, a second at
 * idle, the take off above and its climb, then level at 65 percent, half
 * a second of full right roll, a held 45 deg bank, and a chop with two
 * seconds of full right rudder. Twenty two seconds.
 */
export const timberRecPrelude = (sim) => timberGroundPrelude(sim, { flaps: 1 });
export function recordTimberFlight(sim) {
  must(sim.reset(), 'sim_reset');
  timberRecPrelude(sim);
  const samples = [];
  let trim = 0;
  for (let ms = 0; ms < 22000; ms += RC_STEP_MS) {
    const s = sim.readState().state;
    const { pitch, bank } = attitude(s);
    const p = s[11];
    const qAero = -s[12];
    const vz = s[6];
    const hold = (b) => Math.max(-1, Math.min(1, -1.2 * (bank - b) - 0.12 * p));
    const levelPitch = () => {
      trim += 0.00002 * (0 - vz);
      trim = Math.max(-0.2, Math.min(0.2, trim));
      const pitchT = Math.max(-0.2, Math.min(0.15, 0.05 * (0 - vz) + trim));
      return Math.max(-1, Math.min(1, 2.5 * (pitchT - pitch) - 0.25 * qAero));
    };
    let sticks;
    if (ms < 1000) {
      sticks = [0, 0, 0, 0];
    } else if (ms < 8000) {
      sticks = timberTakeoffSticks(s);
    } else if (ms < 11000) {
      sticks = [hold(0), levelPitch(), 0, 0.65];
    } else if (ms < 11500) {
      sticks = [1, 0, 0, 0.65];
    } else if (ms < 18000) {
      sticks = [hold(Math.PI / 4), levelPitch(), 0, 0.8];
    } else {
      sticks = [hold(0), 0, ms >= 19000 && ms < 21000 ? 1 : 0, 0];
    }
    const [roll, pitchStick, yaw, duty] = sticks;
    samples.push({ tUs: ms * 1000, roll, pitch: pitchStick, yaw, throttle: duty });
    must(sim.input(ms / 1000, roll, pitchStick, yaw, duty), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
  }
  return samples;
}

/*
 * THE FLOATS, docs/FLOATS-STAGE1.md: the Timber and the Cub on floats,
 * airframes 9 and 10, on a body of water declared everywhere at z = 0 with
 * no ground under it. REST is each one's pose floating on still water, from
 * scripts/floats-derive.js's hydrostatics: the CG's height over the water
 * and the trim, nose up. The prelude clears the water, declares it, with a
 * swell or a wind if asked, and puts the aircraft there; no steps. Water is
 * kept across a reset, so a prelude declares it every time.
 */
export const TIMBERF_AIRFRAME = 9;
export const CUBF_AIRFRAME = 10;
export const FLOAT_REST = {
  [TIMBERF_AIRFRAME]: { z: 0.2074, pitchDeg: 2.52 },
  [CUBF_AIRFRAME]: { z: 0.1765, pitchDeg: 0.64 },
};
export function floatsWaterPrelude(sim, airframe, { flaps = 0, swell = null, wind = null } = {}) {
  must(sim.e.sim_set_airframe(airframe), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  if (airframe === TIMBERF_AIRFRAME) {
    must(sim.e.sim_wing_set_flaps(flaps), 'sim_wing_set_flaps');
  }
  must(sim.e.sim_set_ground(0, 0, 0, 1, 0, 0, 0, 0, 0), 'sim_set_ground');
  must(sim.e.sim_water_clear(), 'sim_water_clear');
  const body = sim.e.sim_water_add(0, 0, 0);
  if (body < 0) {
    throw new Error(`sim_water_add: ${body}`);
  }
  if (swell) {
    must(sim.e.sim_water_swell(body, swell.height, swell.period, swell.dx, swell.dy), 'sim_water_swell');
  }
  if (wind) {
    must(sim.e.sim_water_wind(body, wind.speed, wind.dx, wind.dy, wind.fetch), 'sim_water_wind');
  }
  const rest = FLOAT_REST[airframe];
  const h = rest.pitchDeg * Math.PI / 360;
  must(sim.e.sim_set_pose(0, 0, rest.z, Math.cos(h), 0, -Math.sin(h), 0), 'sim_set_pose');
}

/* What the floats did on the last step, sim_float_state's ten numbers. */
export function floatState(sim) {
  if (!sim.floatPtr) {
    sim.floatPtr = sim.e.malloc(10 * 8);
  }
  must(sim.e.sim_float_state(sim.floatPtr), 'sim_float_state');
  return Array.from(new Float64Array(sim.e.memory.buffer, sim.floatPtr, 10));
}

/*
 * The take off off the water as the manual flies it: full throttle, the
 * stick held back to bring the floats onto the step, relaxed once they are
 * on it to hold stepDeg while the speed builds, and back again, all the
 * way, to rotate at vRotate, so the aircraft takes the attitude full up
 * elevator holds; the wings held level on the ailerons, the rudder
 * centred. `onStep` is the pilot's own judgement, the floats carrying
 * under a quarter of the weight on their buoyancy, which the caller
 * passes in; once on the step the pilot does not go back.
 */
export function floatTakeoffSticks(s, { onStep, vRotate, stepDeg = 4 }) {
  const { pitch, bank } = attitude(s);
  const v = Math.hypot(s[4], s[5], s[6]);
  const roll = Math.max(-1, Math.min(1, -1.2 * bank - 0.12 * s[11]));
  if (!onStep || v >= vRotate) {
    return [roll, 1, 0, 1];
  }
  const pitchStick = Math.max(-1, Math.min(1, 10 * (stepDeg * Math.PI / 180 - pitch) - 0.5 * -s[12]));
  return [roll, pitchStick, 0, 1];
}

/*
 * The Timber on floats' recording for the cross-host check, half flaps,
 * the manual's take off setting, on a light swell so the wave field is in
 * the hashed trace: a second floating at idle, the take off above, the
 * climb, level flight at 65 percent with a held bank, a descent on the
 * half flaps it took off with (a recording carries sticks and nothing
 * else, so the flaps cannot move in it) and a landing held off nose up
 * back on the water, and a taxi with full right rudder. Thirty seconds.
 */
export const TIMBERF_SWELL = { height: 0.1, period: 2.0, dx: 0.6, dy: 0.8 };
export const timberFloatRecPrelude = (sim) => floatsWaterPrelude(sim, TIMBERF_AIRFRAME, { flaps: 1, swell: TIMBERF_SWELL });
export function recordTimberFloatFlight(sim) {
  must(sim.reset(), 'sim_reset');
  timberFloatRecPrelude(sim);
  const samples = [];
  let onStep = false;
  let trim = 0;
  for (let ms = 0; ms < 30000; ms += RC_STEP_MS) {
    const s = sim.readState().state;
    const { pitch, bank } = attitude(s);
    const hold = (b) => Math.max(-1, Math.min(1, -1.2 * (bank - b) - 0.12 * s[11]));
    const levelPitch = () => {
      trim += 0.00002 * (0 - s[6]);
      trim = Math.max(-0.2, Math.min(0.2, trim));
      const pitchT = Math.max(-0.2, Math.min(0.15, 0.05 * (0 - s[6]) + trim));
      return Math.max(-1, Math.min(1, 2.5 * (pitchT - pitch) + 0.25 * s[12]));
    };
    const toPitch = (deg) => Math.max(-1, Math.min(1, 3 * (deg * Math.PI / 180 - pitch) + 0.3 * s[12]));
    let sticks;
    if (ms < 1000) {
      sticks = [0, 0, 0, 0];
    } else if (ms < 6000) {
      if (!onStep) {
        onStep = floatState(sim)[0] < 0.25 * 1.934 * 9.81 && ms > 1200;
      }
      if (s[3] > 6) {
        sticks = [hold(0), levelPitch(), 0, 0.65];
      } else if (s[3] > 1.5) {
        sticks = [hold(0), toPitch(10), 0, 1];
      } else {
        sticks = floatTakeoffSticks(s, { onStep, vRotate: 7.6 });
      }
    } else if (ms < 12000) {
      sticks = [hold(ms >= 7500 && ms < 10000 ? 0.5 : 0), levelPitch(), 0, 0.65];
    } else if (ms < 26000) {
      const air = s[3] > 0.45;
      sticks = air ? [hold(0), toPitch(s[3] > 1.0 ? -6 : 7), 0, s[3] > 1.0 ? 0.15 : 0] : [hold(0), 1, 0, 0];
    } else {
      sticks = [0, 0.5, 1, 0.3];
    }
    const [roll, pitchStick, yaw, duty] = sticks;
    samples.push({ tUs: ms * 1000, roll, pitch: pitchStick, yaw, throttle: duty });
    must(sim.input(ms / 1000, roll, pitchStick, yaw, duty), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
  }
  return samples;
}
