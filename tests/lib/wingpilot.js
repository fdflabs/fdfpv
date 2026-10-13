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

import { SIM_OK } from './simmod.js';
import { PERSON, quant, eyes } from './personpilot.js';
import { BRAMOR_CATAPULT } from '../../configs/airframes.js';

/* p51-gates.js reads PERSON from here, as it did before it moved. */
export { PERSON };

export const WING_AIRFRAME = 2;
export const SKY_AIRFRAME = 3;
export const CUB_AIRFRAME = 4;
export const GLIDER_AIRFRAME = 6;
export const BRAMOR_AIRFRAME = 8;
export const RC_STEP_MS = 4;
/* OA Composites' NRJ discus launch glider, docs/DLG-STAGE1.md. */
export const DLG_AIRFRAME = 21;

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

/*
 * THE PERSON PILOT (personpilot.js, docs/FLIGHTMODEL.md "A hover a
 * person can fly"): it sees the aircraft 0.2 s late (the
 * effective delay of a trained operator in compensatory tracking, McRuer
 * and Jex, "A Review of Quasi-Linear Pilot Models", IEEE Trans. HFE 8(3),
 * 1967) and moves the sticks ten times a second in fiftieths of their
 * travel. Its gains are McRuer's crossover model's: the pilot adapts so
 * the open loop near crossover is omega_c e^(-tau s) / s, so on a loop
 * whose plant is K/s near crossover the pilot is a gain, omega_c / K, and
 * omega_c = (pi/2 - PM) / tau. PM is 45 deg, the phase margin that
 * defines a pilot loop's bandwidth in the bandwidth criterion
 * (MIL-STD-1797A; Peahl, Kolkailah and Sandlin, "A Survey of Handling
 * Qualities Criteria and Their Applications to High Performance
 * Aircraft", NASA grant NCC2-338, 1986, ntrs.nasa.gov 19860021266: "the
 * frequency at which the phase margin is 45 degrees or the gain margin
 * is 6 dB"), so omega_c 3.93 rad/s, by the same survey's Neal-Smith
 * figures a little past the 3.0 to 3.5 rad/s pilots fly attitude at. An
 * outer loop (speed, glide path) crosses a quarter as high, the corner
 * as3x:derive puts under its rate loop (docs/FLIGHTMODEL.md), and every
 * loop trims out its steady error on an integral cornered a quarter
 * below its own crossover, the same rule: a pilot re-trims slowly
 * ("re-trimmed to relieve any control pressure", FAA-H-8083-3C ch. 9).
 */
/* The loop's whole delay is the person's 0.2 s and half the 0.1 s the
 * stick is held between looks (a sample and hold lags by half its
 * period); its trim's integral, a quarter below crossover, costs
 * atan(1/4) of the margin there. */
const TAU_PERSON = (PERSON.delayMs + PERSON.everyMs / 2) / 1000;
const DT_PERSON = PERSON.everyMs / 1000;

/* One loop of the person: error in, command out, gain wc / plantGain,
 * the trim's integral cornered at wc / 4 and held while the command is
 * against its limit in the error's direction (a pilot does not keep
 * pushing a stick that is on its stop). Stepped once per look. */
export function personLoop(wc, plantGain, { min = -1, max = 1, u0 = 0 } = {}) {
  if (!(plantGain > 0)) throw new Error(`personLoop: plant gain ${plantGain} is not positive`);
  const k = wc / plantGain;
  /* u0, the command the loop starts trimmed at: a stabilised approach is
   * entered "re-trimmed to relieve any control pressure" (FAA-H-8083-3C
   * ch. 9), not fought on the integral. */
  let trim = u0 / k;
  return {
    k,
    step(e) {
      const free = k * (e + trim);
      if (!((free >= max && e > 0) || (free <= min && e < 0))) trim += e * DT_PERSON * wc / 4;
      return Math.max(min, Math.min(max, k * (e + trim)));
    },
  };
}

/* A person on some of the sticks: law(seen) is asked for them every
 * everyMs with the state delayMs old (the oldest there is, at the
 * start), and its answer is held, rounded to fiftieths, between looks.
 * Call it every step with the clock and the state now. */
export function person(law) {
  const seen = [];
  let held = null;
  let lookMs = -Infinity;
  return (ms, s) => {
    seen.push({ ms, s: s.slice() });
    while (seen.length > 1 && seen[1].ms <= ms - PERSON.delayMs) seen.shift();
    if (ms - lookMs >= PERSON.everyMs) {
      lookMs = ms;
      held = law(seen[0].s).map((x) => Math.round(x * PERSON.steps) / PERSON.steps);
    }
    return held;
  };
}

/* The pitch stick that holds the attitude where a loop is flown:
 * start(sim) puts the aircraft there and returns the sticks it flies
 * with, whose others (the throttle, whose slipstream on the tail moves
 * the trim by a twentieth of the stick) are kept. Found by bisection, the
 * attitude unmoved from 0.3 to 1.0 s, once the launch's own transient is
 * past: extrapolated from the rate a tenth of stick buys over 0.2 to
 * 0.4 s, the trim missed by a tenth of the stick, which dove the approach
 * at 10 deg/s from its first second. */
export function pitchTrim(sim, start) {
  const drift = (d) => {
    const sticks = start(sim).slice();
    sticks[1] = d;
    let p0 = 0;
    for (let ms = 0; ms < 1000; ms += RC_STEP_MS) {
      must(sim.input(ms / 1000, ...sticks), 'sim_input');
      must(sim.step(RC_STEP_MS), 'sim_step');
      if (ms + RC_STEP_MS === 300) p0 = attitude(sim.readState().state).pitch;
    }
    return attitude(sim.readState().state).pitch - p0;
  };
  let lo = -1, hi = 1;
  for (let i = 0; i < 20; i += 1) {
    const mid = (lo + hi) / 2;
    if (drift(mid) < 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/* One stick's response at a frequency w, where a loop is flown:
 * start(sim) puts the aircraft there, and hold(s) gives the sticks that
 * keep it there (a plain attitude hold), so the response is the
 * aircraft's about that flight and not about a spiral or a dive it drifts
 * into with the sticks left still. The flight is flown twice, as it is
 * and with stick `axis` swept a twentieth either side at w on top of
 * hold's; the sim is deterministic, so the differences between the two
 * flights, in read(state) and in the stick sent, are the sweep's alone,
 * and their ratio over four periods after two settle is the aircraft's
 * response whatever hold did with it (the closed loop identification of
 * an open loop plant). Its magnitude per unit stick and its phase,
 * radians. */
export function responseAt(sim, start, hold, w, axis, read) {
  const amp = 0.05;
  const T = 2 * Math.PI / w;
  const fly = (a) => {
    start(sim);
    const ys = [];
    const us = [];
    for (let ms = 0; ms < 6 * T * 1000; ms += RC_STEP_MS) {
      const st = hold(sim.readState().state).slice();
      st[axis] += a * Math.sin(w * ms / 1000);
      must(sim.input(ms / 1000, ...st), 'sim_input');
      must(sim.step(RC_STEP_MS), 'sim_step');
      us.push(st[axis]);
      ys.push(read(sim.readState().state));
    }
    return { ys, us };
  };
  const still = fly(0);
  const swept = fly(amp);
  let ys = 0, yc = 0, us = 0, uc = 0;
  for (let i = 0; i < still.ys.length; i += 1) {
    const t = i * RC_STEP_MS / 1000;
    if (t < 2 * T) continue;
    const dy = swept.ys[i] - still.ys[i];
    const du = swept.us[i] - still.us[i];
    ys += dy * Math.sin(w * t);
    yc += dy * Math.cos(w * t);
    us += du * Math.sin(w * t);
    uc += du * Math.cos(w * t);
  }
  const phase = Math.atan2(yc, ys) - Math.atan2(uc, us);
  return { mag: Math.hypot(ys, yc) / Math.hypot(us, uc), phase: Math.atan2(Math.sin(phase), Math.cos(phase)) };
}

/* Where the person crosses on an inner loop, the airframe's own response
 * taken in (McRuer and Jex 1967: the pilot's crossover regresses to keep
 * its margin where the controlled element lags more than K / s), by the
 * bandwidth criterion PERSON cites: the lower of the frequency where the
 * phase margin is 45 deg and the one where the gain margin is 6 dB. The
 * loop is the person's gain, 1 / |response| at the crossover, its delay
 * and its trim's integral, on the airframe's measured response from 0.4
 * to 12 rad/s, the phase unwrapped up the grid. A crossover holds when
 * the margin there is PERSON's and above it the loop never comes back to
 * unity, nor past half where its phase is beyond -180 deg: a lightly
 * damped mode over the crossover (the Dutch roll in the bank) otherwise
 * rings the loop it was never checked against. The highest that holds,
 * on a grid from 0.8 to 4 rad/s, and its plant gain as personLoop takes
 * it, the magnitude times w. start and hold are responseAt's; read must
 * give the response its own sense (rising with the stick at low
 * frequency), the other sense throws. */
export function responseGrid(sim, start, hold, axis, read) {
  const grid = [];
  for (let i = 2; i <= 60; i += 1) grid.push({ w: i / 5, ...responseAt(sim, start, hold, i / 5, axis, read) });
  for (let i = 1; i < grid.length; i += 1) {
    grid[i].phase = grid[i - 1].phase + Math.atan2(Math.sin(grid[i].phase - grid[i - 1].phase), Math.cos(grid[i].phase - grid[i - 1].phase));
  }
  return grid;
}
export function crossoverFor(sim, start, hold, axis, read) {
  const grid = responseGrid(sim, start, hold, axis, read);
  if (grid[0].phase > Math.PI / 4 || grid[0].phase < -3 * Math.PI / 4) throw new Error(`crossoverFor: the response's phase at ${grid[0].w} rad/s is ${(grid[0].phase * 180 / Math.PI).toFixed(0)} deg, read has the wrong sense`);
  let best = null;
  for (const c of grid.filter((g) => g.w >= 0.8 - 1e-9 && g.w <= 4 + 1e-9)) {
    const loop = (g) => {
      const i = c.w / (4 * g.w);
      return { mag: Math.hypot(1, i) * g.mag / c.mag, phase: g.phase - g.w * TAU_PERSON - Math.atan(i) };
    };
    const pm = Math.PI + loop(c).phase;
    const above = grid.filter((g) => g.w > c.w + 1e-9).map(loop);
    const holds = pm >= PERSON.pmRad && above.every((l) => l.mag < 1 && (l.phase > -Math.PI || l.mag <= 0.5));
    if (holds) best = { wc: c.w, gain: c.mag * c.w, pm };
  }
  if (best === null) throw new Error('crossoverFor: no frequency on the grid keeps the margin');
  return best;
}

/* The leads a person adds, s, flying an attitude and its rate together on
 * an element that lags more than K / s near crossover (McRuer and Jex
 * 1967; McRuer and Krendel, AGARDograph 188, 1974: the pilot Kp s e^-tau
 * s on an acceleration element). */
export const PERSON_LEADS = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5];

/* The loop as flown at crossover wc with lead on a measured response grid
 * ({ w, mag, phase } from 0.4 to 12 rad/s, the phase unwrapped): its
 * margins and whether it keeps the criterion. */
export function leadLoop(g, wc, lead) {
  const c = g.find((x) => Math.abs(x.w - wc) < 1e-9);
  const k = 1 / (c.mag * Math.hypot(1, lead * wc));
  const L = g.map((x) => {
    const i = wc / (4 * x.w);
    return { w: x.w, mag: k * x.mag * Math.hypot(1, lead * x.w) * Math.hypot(1, i), phase: x.phase + Math.atan(lead * x.w) - x.w * TAU_PERSON - Math.atan(i) };
  });
  const cross = L.find((l) => l.w >= wc - 1e-9 && l.mag < 1) ?? L[L.length - 1];
  const turn = L.find((l) => l.w > cross.w && l.phase <= -Math.PI);
  const pmDeg = (Math.PI + cross.phase) * 180 / Math.PI;
  const gmDb = turn ? -20 * Math.log10(turn.mag) : null;
  const above = L.filter((l) => l.w > cross.w + 1e-9);
  const meets = pmDeg >= 45 && (gmDb === null || gmDb >= 6) && above.every((l) => l.mag < 1 && (l.phase > -Math.PI || l.mag <= 0.5));
  return { wc, gain: Number((c.mag * Math.hypot(1, lead * wc) * wc).toFixed(3)), lead, pmDeg: Number(pmDeg.toFixed(1)), gmDb: gmDb === null ? null : Number(gmDb.toFixed(1)), meets };
}
/* The design on a grid: the highest crossover (0.8 to 4 rad/s) and lead
 * that keep the criterion; where none does, the one with the most gain
 * margin at 45 deg of phase (or, where none reaches 45 deg, the most
 * phase), marked short. */
export function leadDesign(g, leads) {
  let best = null;
  let fallback = null;
  for (const lead of leads) {
    for (let i = 4; i <= 20; i += 1) {
      const l = leadLoop(g, i / 5, lead);
      if (l.meets && (!best || l.wc > best.wc || (l.wc === best.wc && l.pmDeg > best.pmDeg))) best = l;
      const gm = l.gmDb ?? Infinity;
      const better = !fallback || (l.pmDeg >= 45 ? fallback.pmDeg < 45 || gm > (fallback.gmDb ?? Infinity) : fallback.pmDeg < 45 && l.pmDeg > fallback.pmDeg);
      if (better) fallback = l;
    }
  }
  const pick = best ?? fallback;
  const { meets, ...rest } = pick;
  return { ...rest, short: !best };
}

/*
 * THE PERSON ON THE AILERONS, for a long approach: successive loop closure
 * (McRuer, Ashkenas and Graham, Aircraft Dynamics and Automatic Control,
 * 1973): the bank as the inner loop at its own crossover (crossoverFor on
 * the roll stick), the heading as an outer loop and the runway centreline
 * offset as the outermost, each crossing PERSON.outer of the loop inside
 * it (the separation that keeps the inner loop's dynamics out of the
 * outer's crossover). Their plants near crossover: a bank turns the
 * heading at g / V per radian, a heading moves the aircraft across the
 * line at V per radian. Conventions: bank right positive, the roll stick
 * right positive; the heading and the offset left positive, so a right
 * bank turns the heading right (negative). Its step(s, offset, heading)
 * gives the roll stick; the trims start at zero (wings level).
 */
export function lateralPerson(sim, start, hold, V) {
  const bankOf = (s) => attitude(s).bank;
  const inner = crossoverFor(sim, start, hold, 0, bankOf);
  const bank = personLoop(inner.wc, inner.gain);
  const wHead = inner.wc * PERSON.outer;
  const head = personLoop(wHead, 9.80665 / V, { min: -Math.PI / 4, max: Math.PI / 4 });
  const line = personLoop(wHead * PERSON.outer, V, { min: -Math.PI / 6, max: Math.PI / 6 });
  return {
    inner,
    step(s, offset, heading) {
      const headWant = line.step(-offset);
      const bankWant = -head.step(headWant - heading);
      return bank.step(bankWant - bankOf(s));
    },
  };
}

/* The climb rate a unit of throttle buys at a speed, the throttle's whole
 * travel: the thrust's change, idle to full, as the aircraft's
 * acceleration held level at V for 1.2 s (the prop spun up, prop_spool),
 * times V / g, the excess power's climb. start(sim) puts it on the
 * airframe in its configuration. */
export function climbPerThrottle(sim, start, V, gamma = 0, pitchStick = 0) {
  /* Held at V along the path, at the attitude where the wing carries the
   * weight there (its lift's share, found on the vertical acceleration),
   * so the drag is the approach's own and not the zero lift's. */
  const fly = (thr, theta) => {
    start(sim);
    const h = theta / 2;
    for (let ms = 0; ms <= 1200; ms += RC_STEP_MS) {
      must(sim.e.sim_set_pose(0, 0, 300, Math.cos(h), 0, -Math.sin(h), 0), 'sim_set_pose');
      must(sim.e.sim_set_velocity(V * Math.cos(gamma), 0, V * Math.sin(gamma), 0, 0, 0), 'sim_set_velocity');
      must(sim.input(ms / 1000, 0, pitchStick, 0, thr), 'sim_input');
      must(sim.step(RC_STEP_MS), 'sim_step');
    }
    const s = sim.readState().state;
    const ax = (s[4] - V * Math.cos(gamma)) / (RC_STEP_MS / 1000);
    const az = (s[6] - V * Math.sin(gamma)) / (RC_STEP_MS / 1000);
    /* Along the path and across it. */
    return { along: ax * Math.cos(gamma) + az * Math.sin(gamma), across: -ax * Math.sin(gamma) + az * Math.cos(gamma) };
  };
  let lo = -0.3, hi = 0.5;
  for (let i = 0; i < 30; i += 1) {
    const mid = (lo + hi) / 2;
    if (fly(0, mid).across < 0) lo = mid; else hi = mid;
  }
  const theta = (lo + hi) / 2;
  /* The throttle that holds the speed down the path, where the thrust's
   * share along it balances what slows it: found, not interpolated, since
   * thrust goes with the prop's speed squared on its curve and a prop
   * turned slowly at speed is past its zero thrust. The climb a throttle
   * buys is the slope there, a twentieth of the travel either side. */
  let tl = 0, th = 1;
  for (let i = 0; i < 20; i += 1) {
    const mid = (tl + th) / 2;
    if (fly(mid, theta).along < 0) tl = mid; else th = mid;
  }
  const trim = (tl + th) / 2;
  const up = Math.min(1, trim + 0.05), dn = Math.max(0, trim - 0.05);
  const slope = (fly(up, theta).along - fly(dn, theta).along) / (up - dn);
  return { climbPer: slope * V / 9.80665, trim, theta };
}

/* What the receiver last wrote to the aileron, elevator and rudder
 * servos, rad (sim_wing_command), before the servos hold it against the
 * air. */
export function wingCommand(sim) {
  if (!sim.wingCommandPtr) {
    sim.wingCommandPtr = sim.e.malloc(3 * 8);
  }
  must(sim.e.sim_wing_command(sim.wingCommandPtr), 'sim_wing_command');
  return Array.from(new Float64Array(sim.e.memory.buffer, sim.wingCommandPtr, 3));
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

/* Level flight speed at a throttle, wings held level, climb rate held at zero,
 * from a throw at speed0 (12 m/s unless the airframe needs another). */
export function levelSpeed(sim, duty, speed0 = 12) {
  const r = fly(sim, { duty, vzTarget: 0, speed0 });
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
/*
 * Full throttle held where it is: from a reset, `pose` and `vel` (the
 * velocity and rates as sim_set_velocity takes them, still by default)
 * written back every 1 ms step for `ms`, so an electric prop has spun up to the full
 * throttle's speed (plant_wing.c, prop_spool) while the aircraft goes
 * nowhere. The last step is the one the caller reads.
 */
export function fullThrottleHeld(sim, pose, vel = [0, 0, 0, 0, 0, 0], ms = 2000) {
  must(sim.reset(), 'sim_reset');
  for (let t = 0; t < ms; t += 1) {
    must(sim.e.sim_set_pose(...pose), 'sim_set_pose');
    must(sim.e.sim_set_velocity(...vel), 'sim_set_velocity');
    must(sim.input(t / 1000, 0, 0, 0, 1), 'sim_input');
    must(sim.step(1), 'sim_step');
  }
}

export function propTorque(sim) {
  fullThrottleHeld(sim, [0, 0, 50, 1, 0, 0, 0]);
  const d = wingDebug(sim);
  /* The motor's roll alone: the slipstream's (sim_wing_slip,
   * docs/FLIGHTMODEL.md) is taken out. */
  return { rollMoment: d[12] - wingSlip(sim)[0], thrust: d[8], aeroRoll: d[5] };
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
    peakG, touchdown, end, rest: { z: end[3], upz: upz(end), v: Math.hypot(end[4], end[5], end[6]), w: Math.hypot(end[11], end[12], end[13]) },
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
 * runway's heading is held on the rudder, the P-51's feet (p51TakeoffSticks
 * below): the prop's swirl on the fin swings a tractor left as the power
 * comes on (docs/FLIGHTMODEL.md), and a pilot holds it with right rudder.
 * Returns the sticks for this step from the state.
 */
/* A pilot's feet on the take off roll: the runway's centreline held on
 * the rudder, the nose aimed back at it 0.3 rad per metre off it, and full
 * rudder by 10 deg off that aim. The swirl on the fin swings a tractor
 * faster than the gains of before the slipstream caught, and the prop's
 * gyroscope kicks it as the tail comes up. */
export function rudderHold(s) {
  return Math.max(-1, Math.min(1, 6.0 * (runwayHeading(s) + 0.3 * s[2]) + 0.6 * s[13]));
}

/* A powered stall's wings held level on the rudder, the ailerons neutral,
 * as the handbook flies one (FAA-H-8083-3C ch. 5, power on stalls: right
 * rudder against the tractor's left turning tendencies, a wing picked up
 * with the rudder and not the ailerons, which near the stall take the
 * down going wing deeper into it). The rudder only aircraft's wings level
 * law, -1.2 bank - 0.12 p, on the yaw stick. */
/*
 * A stall's no spin yaw limit, deg/s, re-derived 2026-10-11 from what a
 * spin is (docs/FLIGHTMODEL.md): autorotation, the dropping wing rolling
 * on with the yaw coming with it. With the wings inside the bank limit
 * (the wing drop's) the aircraft only turns, and a turn at bank phi and
 * speed V yaws at g tan(phi) / V; a yaw past the turn the bank limit
 * allows at the mush's speed is a rotation no turn makes. It replaces an
 * unsourced 20 deg/s.
 */
export function turnYawLimitDeg(maxBankDeg, v) {
  return 9.81 * Math.tan(maxBankDeg * Math.PI / 180) / v * 180 / Math.PI;
}

/*
 * The same definition taken at every sample, not frozen at the mush's
 * speed: while the wing is past its stall angle, a yaw rate past the turn
 * g tan(bank) / V the bank and the instantaneous speed allow is a rotation
 * no turn makes. The bank is the instantaneous one, but never under the
 * gate's own bank limit: inside that limit the wings are what the gate
 * calls held, and a yaw there with the wings near level is a skid or the
 * Dutch roll's, not the autorotation a spin is (at a level wing the turn
 * allows no yaw at all, so a 0.3 deg/s skid would read as a spin). The speed is floored at SPIN_V_FLOOR: below it the formula's
 * limit runs to infinity while the aircraft is not flying at all (the
 * slowest stall here is the Slow Stick's 4.4 m/s), so a tail slide or a
 * hover would never be judged; at 2 m/s a 15 deg bank already allows 75
 * deg/s. add(s, alpha, t) for each sample; .worst is the largest yaw past
 * its limit, deg/s (negative while every sample is inside), with its time,
 * bank, speed and yaw.
 */
export const SPIN_V_FLOOR = 2;
export function spinWatch(alphaStall, maxBankDeg) {
  const w = { worst: -Infinity, at: null };
  w.add = (s, alpha, t) => {
    if (!(alpha > alphaStall)) return;
    const bank = Math.abs(fullBank(s));
    const v = Math.max(SPIN_V_FLOOR, Math.hypot(s[4], s[5], s[6]));
    const yaw = Math.abs(s[13]) * 180 / Math.PI;
    const limit = turnYawLimitDeg(Math.min(89, Math.max(bank * 180 / Math.PI, maxBankDeg)), v);
    if (yaw - limit > w.worst) {
      w.worst = yaw - limit;
      w.at = { t, bank: bank * 180 / Math.PI, v, yaw, limit };
    }
  };
  w.said = () => (w.at === null ? 'never past the stall' : `yaw past the turn its bank allows by ${w.worst.toFixed(1)} deg/s at ${w.at.t.toFixed(2)} s (${w.at.yaw.toFixed(1)} against ${w.at.limit.toFixed(1)}, bank ${w.at.bank.toFixed(1)}, ${w.at.v.toFixed(1)} m/s)`);
  w.ok = () => w.worst <= 0;
  return w;
}

/*
 * A pilot flying a loop straight, as a real one does on the ailerons and
 * the rudder (the take offs' handbook pilot, the air's): the wings held
 * across the loop's plane, the left wing on world +y the whole way round
 * as an inside loop keeps it, and the nose in that plane. The roll error
 * is the angle about the body's x that brings its y axis onto world y,
 * on the wings' level law (-1.2 rad, -0.12 p); the yaw error the nose's
 * heading off the loop's line, on rudderHold's law (6.0, 0.6 r). Returns [roll,
 * yaw] sticks.
 */
export function loopHold(s) {
  const [w, x, y, z] = [s[7], s[8], s[9], s[10]];
  const xb = [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)];
  const yb = [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)];
  /* (yb x world y) . xb: the signed angle about x that takes yb onto y. */
  const c = [-yb[2], 0, yb[0]];
  const theta = Math.asin(Math.max(-1, Math.min(1, c[0] * xb[0] + c[2] * xb[2])));
  const roll = Math.max(-1, Math.min(1, 1.2 * theta - 0.12 * s[11]));
  /* The nose's heading off the loop's line where the nose has one, the
   * out of plane angle where it is near the vertical. */
  const off = Math.abs(xb[0]) > 0.3 ? Math.atan2(xb[1], Math.abs(xb[0])) : Math.asin(Math.max(-1, Math.min(1, xb[1])));
  const yaw = Math.max(-1, Math.min(1, 6.0 * off + 0.6 * s[13]));
  return [roll, yaw];
}

/*
 * A pilot's take off roll, as the handbook flies one (FAA-H-8083-3C ch. 6,
 * https://www.faasafety.gov/files/events/SO/SO15/2022/SO15112841/Chapter6TakeoffsAndDepartureClimbs.pdf):
 * the throttle advanced "smoothly and continuously" to full, here over
 * the first second (FITTED: the handbook gives no time), because "an
 * abrupt application of power may cause the airplane to yaw sharply to
 * the left because of the torque effects"; the line held on the rudder
 * (rudderHold); and on an aircraft with ailerons, the wings held level on
 * them. ms is the time since the roll began.
 */
export function takeoffRoll(s, ms, { ailerons = true } = {}) {
  const roll = ailerons ? Math.max(-1, Math.min(1, -1.2 * fullBank(s) - 0.12 * s[11])) : 0;
  return [roll, 0, rudderHold(s), Math.min(1, ms / 1000)];
}

export function rudderLevel(s) {
  return Math.max(-1, Math.min(1, -1.2 * fullBank(s) - 0.12 * s[11]));
}

export function takeoffSticks(s, { vRotate = 8.9 } = {}) {
  const { pitch, bank } = attitude(s);
  const v = Math.hypot(s[4], s[5], s[6]);
  const qAero = -s[12];
  const pitchT = (v < vRotate ? 2 : 8) * Math.PI / 180;
  const roll = Math.max(-1, Math.min(1, -1.2 * bank - 0.12 * s[11]));
  const pitchStick = Math.max(-1, Math.min(1, 4 * (pitchT - pitch) - 0.5 * qAero));
  return [roll, pitchStick, rudderHold(s), 1];
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
 * SIG's Kadet Senior, airframe 12, docs/KADET-STAGE1.md: the Bombshell's
 * three channels, no ailerons, so the roll stick drives its rudder and it
 * banks through its dihedral, on a tricycle gear whose nose wheel steers
 * with the rudder. Thrown at a little over its stall, or standing level on
 * its three wheels at the drawn pose, the CG 0.3072 m up
 * (src/render/kadetcraft.js).
 */
export const KADET_AIRFRAME = 12;
export const KADET_REST = { z: 0.3072, pitchDeg: 0 };
export function kadetPrelude(sim) {
  must(sim.e.sim_set_airframe(KADET_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_wing_launch(12), 'sim_wing_launch');
}
export function kadetGroundPrelude(sim, { mu = 1.4, e = 0 } = {}) {
  must(sim.e.sim_set_airframe(KADET_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, mu, e), 'sim_set_ground');
  const h = KADET_REST.pitchDeg * Math.PI / 360;
  must(sim.e.sim_set_pose(0, 0, KADET_REST.z, Math.cos(h), 0, -Math.sin(h), 0), 'sim_set_pose');
}
/* A tricycle's take off: full throttle with the sticks centred, and the
 * elevator eased up toward 0.8 as the speed passes 1.1 Vs, as
 * the SIG manual has the pilot do ("a lot of elevator application is
 * required for liftoff" from grass). */
export function kadetTakeoffSticks(s, { vRotate = 7.9 } = {}) {
  const v = Math.hypot(s[4], s[5], s[6]);
  return [0, v < vRotate ? 0 : Math.min(0.8, (v - vRotate) * 0.8), 0, 1];
}

/*
 * The Kadet's recording for the cross-host check: from standing on the
 * strip, a second at idle, nine of full throttle with the sticks centred
 * and the elevator eased up at the rotation speed, then level at 75
 * percent with the wings held on the roll stick, which is the rudder, a
 * second of full right roll stick, a held 30 deg bank, and the throttle
 * back to idle with a second and a half of full right yaw stick: twenty
 * two seconds, the take off in the hashed trace, and still flying at the
 * end.
 */
export function recordKadetFlight(sim) {
  must(sim.reset(), 'sim_reset');
  kadetGroundPrelude(sim);
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
    } else if (ms < 10000) {
      sticks = ms < 5000 ? kadetTakeoffSticks(s) : [hold(0), Math.max(-1, Math.min(1, 2.5 * (0.15 - pitch) - 0.25 * qAero)), 0, 1];
    } else if (ms < 13000) {
      sticks = [hold(0), levelPitch(), 0, 0.75];
    } else if (ms < 14000) {
      sticks = [1, 0, 0, 0.75];
    } else if (ms < 19000) {
      sticks = [hold(Math.PI / 6), levelPitch(), 0, 0.85];
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
 * FMS's P-51D Mustang, airframe 15, docs/P51-STAGE1.md: a warbird on
 * retracting taildragger gear, flaps, ailerons, elevator and rudder. On the
 * strip it stands on three points at the pose the plant settles to, the
 * drawn model's (src/render/p51craft.js); thrown, at a cruise.
 */
export const P51_AIRFRAME = 15;
export const P51_REST = { z: 0.2291, pitchDeg: 13.13 };
export function p51Prelude(sim, { flaps = 0 } = {}) {
  must(sim.e.sim_set_airframe(P51_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_wing_set_flaps(flaps), 'sim_wing_set_flaps');
  must(sim.e.sim_wing_launch(15), 'sim_wing_launch');
}
export function p51GroundPrelude(sim, { mu = 1.4, e = 0, flaps = 0 } = {}) {
  must(sim.e.sim_set_airframe(P51_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_wing_set_flaps(flaps), 'sim_wing_set_flaps');
  must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, mu, e), 'sim_set_ground');
  const h = P51_REST.pitchDeg * Math.PI / 360;
  must(sim.e.sim_set_pose(0, 0, P51_REST.z, Math.cos(h), 0, -Math.sin(h), 0), 'sim_set_pose');
}

/* The heading of a state, about world z, left positive. */
/* The nose's heading off the runway's, world +x, radians, left positive. */
export const runwayHeading = (s) => Math.atan2(2 * (s[7] * s[10] + s[8] * s[9]), 1 - 2 * (s[9] * s[9] + s[10] * s[10]));

/*
 * A warbird's take off: the throttle opened over a second and a half, the
 * stick forward to bring the tail up to 4 deg, rotated to 8 deg at 11 m/s,
 * 1.1 Vs, the wings on the ailerons and the heading held on the rudder,
 * which the swing to the left asks to be right rudder, with right rudder
 * fed in as the tail comes up: 1.3 of stick per rad/s of the nose's
 * pitching down, the prop's J Omega (0.83 N m s) over what full rudder
 * holds at 10 m/s (0.64 N m), docs/P51-STAGE1.md. The sticks for this
 * step, `ms` into the roll.
 */
export function p51TakeoffSticks(s, ms) {
  const v = Math.hypot(s[4], s[5]);
  const { pitch, bank } = attitude(s);
  const pt = (v < 11 ? 4 : 8) * Math.PI / 180;
  const ps = Math.max(-1, Math.min(1, 3 * (pt - pitch) + 0.3 * s[12]));
  const roll = Math.max(-1, Math.min(1, -1.2 * bank - 0.12 * s[11]));
  const yaw = Math.max(-1, Math.min(1, 6.0 * runwayHeading(s) + 0.6 * s[13] + 1.3 * s[12]));
  return [roll, ps, yaw, Math.min(1, ms / 1500)];
}

/*
 * The P-51's recording for the cross-host check, on half flaps: from
 * standing on the strip, a second at idle, the take off above and a climb,
 * then level at 75 percent, half a second of full right aileron, a held 45
 * deg bank, and a chop with a second and a half of full left rudder.
 * Twenty two seconds, the gear down throughout: a stick stream cannot
 * carry the gear switch, so the gear's travel is p51-air's.
 */
export const p51RecPrelude = (sim) => p51GroundPrelude(sim, { flaps: 1 });
export function recordP51Flight(sim) {
  must(sim.reset(), 'sim_reset');
  p51RecPrelude(sim);
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
    } else if (ms < 4000) {
      sticks = p51TakeoffSticks(s, ms - 1000);
    } else if (ms < 9000) {
      sticks = [hold(0), Math.max(-1, Math.min(1, 2.5 * (0.2 - pitch) - 0.25 * qAero)), 0, 1];
    } else if (ms < 12000) {
      sticks = [hold(0), levelPitch(), 0, 0.75];
    } else if (ms < 12500) {
      sticks = [1, 0, 0, 0.75];
    } else if (ms < 18000) {
      sticks = [hold(Math.PI / 4), levelPitch(), 0, 0.9];
    } else {
      sticks = [hold(0), 0, ms >= 19000 && ms < 20500 ? -1 : 0, 0];
    }
    const [roll, pitchStick, yaw, duty] = sticks;
    samples.push({ tUs: ms * 1000, roll, pitch: pitchStick, yaw, throttle: duty });
    must(sim.input(ms / 1000, roll, pitchStick, yaw, duty), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
  }
  return samples;
}

/*
 * The P-51 in the air with the gear selected up, for the cross-host check
 * of the retracts: thrown at 15 m/s 60 m up, the gear travelling up in the
 * first six seconds of the replay. Then level at 75 percent, a pull to the
 * stall with full up held, which drops a wing, and the recovery.
 */
export function p51AirPrelude(sim) {
  must(sim.e.sim_set_airframe(P51_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_set_pose(0, 600, 60, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(15), 'sim_wing_launch');
  must(sim.e.sim_wing_set_gear(1), 'sim_wing_set_gear');
}
export function recordP51AirFlight(sim) {
  must(sim.reset(), 'sim_reset');
  p51AirPrelude(sim);
  const samples = [];
  let trim = 0;
  for (let ms = 0; ms < 20000; ms += RC_STEP_MS) {
    const s = sim.readState().state;
    const { pitch, bank } = attitude(s);
    const qAero = -s[12];
    const hold = (b) => Math.max(-1, Math.min(1, -1.2 * (bank - b) - 0.12 * s[11]));
    let sticks;
    if (ms < 9000) {
      trim += 0.00002 * (0 - s[6]);
      trim = Math.max(-0.2, Math.min(0.2, trim));
      const pitchT = Math.max(-0.2, Math.min(0.15, 0.05 * (0 - s[6]) + trim));
      sticks = [hold(0), Math.max(-1, Math.min(1, 2.5 * (pitchT - pitch) - 0.25 * qAero)), 0, 0.75];
    } else if (ms < 14000) {
      sticks = [0, Math.min(1, (ms - 9000) / 2000), 0, 0];
    } else {
      sticks = [hold(0), Math.max(-1, Math.min(1, 2.5 * (-0.05 - pitch) - 0.25 * qAero)), 0, 0.75];
    }
    const [roll, pitchStick, yaw, duty] = sticks;
    samples.push({ tUs: ms * 1000, roll, pitch: pitchStick, yaw, throttle: duty });
    must(sim.input(ms / 1000, roll, pitchStick, yaw, duty), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
  }
  return samples;
}

/*
 * Freewing's F-16 V3 70 mm EDF, airframe 16, docs/F16-STAGE1.md: ailerons,
 * all moving stabilators and a rudder, a ducted fan whose speed lags the
 * stick, on a tricycle gear whose nose wheel steers with the rudder.
 * Launched at the pattern speed, or standing level on its three wheels at
 * the drawn pose, the CG 0.140 m up (src/render/f16craft.js).
 */
export const F16_AIRFRAME = 16;
export const F16_REST = { z: 0.140, pitchDeg: 0 };
export function f16Prelude(sim) {
  must(sim.e.sim_set_airframe(F16_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_wing_launch(20), 'sim_wing_launch');
  /* Launched in the air, the retracts go up, as the P-51's do. */
  must(sim.e.sim_wing_set_gear(1), 'sim_wing_set_gear');
}
export function f16GroundPrelude(sim, { mu = 1.4, e = 0 } = {}) {
  must(sim.e.sim_set_airframe(F16_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, mu, e), 'sim_set_ground');
  const h = F16_REST.pitchDeg * Math.PI / 360;
  must(sim.e.sim_set_pose(0, 0, F16_REST.z, Math.cos(h), 0, -Math.sin(h), 0), 'sim_set_pose');
}
/* A tricycle jet's take off: the throttle held at `duty`, the sticks
 * centred, and past 1.2 Vs the elevator eased up to full over two metres
 * a second, the gradual application of up elevator Model Aviation
 * describes; the fan's thrust through the CG high over the mains holds
 * the nose wheel down until full up lifts it (docs/F16-STAGE1.md). Once
 * the nose is 8 deg up the elevator eases off to hold it there, as a
 * pilot does, so it does not over rotate onto its tail. Given hand (kept
 * by the caller), the hand keeps pulling until the nose is there, an
 * integral over a second as herculesTakeoffSticks' (FAA-H-8083-3C ch. 6:
 * the attitude "should be held until the airplane lifts off"); without
 * it the hold is proportional and droops where the trim wants more up
 * elevator, as near the ground (plant_wing.c GROUND EFFECT). The
 * recordings fly without it, as they were recorded. */
export function f16TakeoffSticks(s, { vRotate = 14.4, duty = 1, hand = null } = {}) {
  const v = Math.hypot(s[4], s[5], s[6]);
  if (v < vRotate) {
    return [0, 0, 0, duty];
  }
  const { pitch } = attitude(s);
  const ease = Math.min(1, (v - vRotate) * 0.5);
  const err = 8 * Math.PI / 180 - pitch;
  const held = pitch > 4 * Math.PI / 180;
  if (hand && held) hand.i = Math.max(-1, Math.min(1, hand.i + 4 * err * RC_STEP_MS / 1000));
  const hold = Math.max(-1, Math.min(1, 3.0 * err + 0.3 * s[12] + (hand ? hand.i : 0)));
  return [0, held ? Math.min(ease, hold) : ease, 0, duty];
}

/*
 * The F-16's recording for the cross-host check: from standing on the
 * strip, a second with the fan stopped, then full throttle and the take
 * off, level at 60 percent with the wings held on the ailerons, a second
 * of full right roll stick, a held 45 deg bank, and the throttle closed
 * with a second and a half of full right yaw stick: twenty two seconds,
 * the fan's spool up and down both in the hashed trace, and still flying
 * at the end.
 */
export function recordF16Flight(sim) {
  must(sim.reset(), 'sim_reset');
  f16GroundPrelude(sim);
  const samples = [];
  let trim = 0;
  for (let ms = 0; ms < 22000; ms += RC_STEP_MS) {
    const s = sim.readState().state;
    const { pitch, bank } = attitude(s);
    const p = s[11];
    const qAero = -s[12];
    const vz = s[6];
    const hold = (b) => Math.max(-1, Math.min(1, -0.8 * (bank - b) - 0.05 * p));
    const levelPitch = () => {
      trim += 0.00002 * (0 - vz);
      trim = Math.max(-0.2, Math.min(0.2, trim));
      const pitchT = Math.max(-0.2, Math.min(0.15, 0.05 * (0 - vz) + trim));
      return Math.max(-1, Math.min(1, 2.5 * (pitchT - pitch) - 0.25 * qAero));
    };
    let sticks;
    if (ms < 1000) {
      sticks = [0, 0, 0, 0];
    } else if (ms < 7000) {
      sticks = ms < 4000 ? f16TakeoffSticks(s) : [hold(0), Math.max(-1, Math.min(1, 2.5 * (0.2 - pitch) - 0.25 * qAero)), 0, 1];
    } else if (ms < 12000) {
      sticks = [hold(0), levelPitch(), 0, 0.6];
    } else if (ms < 13000) {
      sticks = [ms < 12300 ? 1 : hold(Math.PI / 4), levelPitch(), 0, 0.6];
    } else if (ms < 18000) {
      sticks = [hold(Math.PI / 4), levelPitch(), 0, 0.8];
    } else {
      sticks = [hold(0), levelPitch(), ms >= 19000 && ms < 20500 ? 1 : 0, 0];
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
 * passes in; once on the step the pilot does not go back. With
 * `rotateDeg` the rotation is to that attitude and no further, and the
 * heading is held on the rudder: under power the wash over the tail
 * (docs/FLIGHTMODEL.md) makes full up elevator pitch the floats onto their
 * heels, which holds them in the water, and its swirl swings the nose.
 */
export function floatTakeoffSticks(s, { onStep, vRotate, stepDeg = 4, rotateDeg = null }) {
  const { pitch, bank } = attitude(s);
  const v = Math.hypot(s[4], s[5], s[6]);
  const roll = Math.max(-1, Math.min(1, -1.2 * bank - 0.12 * s[11]));
  if (rotateDeg !== null && onStep && v >= vRotate) {
    const ps = Math.max(-1, Math.min(1, 10 * (rotateDeg * Math.PI / 180 - pitch) - 0.5 * -s[12]));
    return [roll, ps, rudderHold(s), 1];
  }
  if (!onStep || v >= vRotate) {
    return [roll, 1, rotateDeg !== null ? rudderHold(s) : 0, 1];
  }
  const pitchStick = Math.max(-1, Math.min(1, 10 * (stepDeg * Math.PI / 180 - pitch) - 0.5 * -s[12]));
  return [roll, pitchStick, rotateDeg !== null ? rudderHold(s) : 0, 1];
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

/*
 * The aerobats' hands, which the Edge 540 brought and the Ugly Stik and the
 * Tiger Moth fly with (the Edge was removed on 2026-09-29). The heading,
 * yaw about world z from +x, and the bank through the whole circle (right
 * wing down positive, pi on its back), from the state.
 */
export function edgeHeading(s) {
  return Math.atan2(2 * (s[7] * s[10] + s[8] * s[9]), 1 - 2 * (s[9] * s[9] + s[10] * s[10]));
}
export function fullBank(s) {
  return Math.atan2(2 * (s[9] * s[10] + s[7] * s[8]), 1 - 2 * (s[8] * s[8] + s[9] * s[9]));
}

/*
 * The hands for level flight upright or on its back: the bank held
 * on the ailerons toward `b` (0 or pi), and on the elevator a pitch over
 * the horizon that holds the climb rate at nought, fly()'s loop, whose
 * elevator sense turns over with the aircraft. `trim` is the hand's slow
 * part, an object kept between steps.
 */
export function edgeRoll(s, b = 0) {
  const e = Math.atan2(Math.sin(fullBank(s) - b), Math.cos(fullBank(s) - b));
  return Math.max(-1, Math.min(1, -0.8 * e - 0.05 * s[11]));
}
/*
 * A person's hands holding the wings level through a stall, designed as
 * every other person loop is (responseGrid and leadDesign, the bandwidth
 * criterion's 45 deg and 6 dB on the airframe's own measured response):
 * the bank on the ailerons at the two conditions the hold flies, the entry
 * (wings level at `entry` m/s, the gate's approach to the stall, held at
 * its attitude) and the stall itself (full up held `stallS` s from that
 * entry, the mush the hold is judged in). A stalled wing's roll damping is
 * a fraction of the attached wing's, so one gain sized on the entry's roll
 * mode crosses far higher in the stall, past its margin, and rings (the
 * Tiger Moth's T8a, 2026-10-13). Where the bank lags more than K / s at
 * crossover, as it does stalled, the person adds lead, flying the bank and
 * its rate together, as on the hover's tilt (leadDesign); where no
 * crossover and lead keep the criterion, the best there is, marked short
 * on .design. The person flies the entry's loop until they see the stall,
 * the wing past alphaStall 0.2 s late (as faaPowerOnStall recognises it),
 * and the stall's from then on: a gain schedule, the crossover model's
 * adaptation to a changed controlled element (McRuer and Jex 1967). The
 * loop is personLoop's, its trim carried across the switch so the stick
 * does not jump. rudder(s) is the gate's rudder (none by default), duty
 * its throttle; the pull is the same full up the gate holds, at `duty`
 * (the entry at entryDuty, the gate's own, where it differs). Each
 * condition is captured once from a flight the gate itself flies, then set
 * again for every swept flight (responseAt), so the sweep's input clock
 * starts at zero. Returns the hold, a function of the state and the
 * plant's angle of attack called every RC_STEP_MS, with the two designs on
 * .design.
 */
export function stallWingsHold(sim, { entry, duty, entryDuty = duty, alphaStall, stallS = 5, rudder = () => 0, start = [0, 0, 300, 1, 0, 0, 0] }) {
  const bankHold = (s) => Math.max(-1, Math.min(1, -1.2 * fullBank(s) - 0.12 * s[11]));
  const capture = () => {
    const s = sim.readState().state;
    return { pos: [s[1], s[2], s[3]], q: [s[7], s[8], s[9], s[10]], vel: [s[4], s[5], s[6]], om: [s[11], s[12], s[13]] };
  };
  let ms = fly(sim, { duty: entryDuty, vTarget: entry, seconds: 25, guard: false, speed0: entry, start }).endMs;
  const atEntry = capture();
  const theta0 = attitude(sim.readState().state).pitch;
  for (let t = 0; t < stallS * 1000; t += RC_STEP_MS) {
    const s = sim.readState().state;
    must(sim.input(ms / 1000, bankHold(s), 1, rudder(s), duty), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    ms += RC_STEP_MS;
  }
  const inStall = capture();
  const setTo = (c) => () => {
    must(sim.reset(), 'sim_reset');
    must(sim.e.sim_set_pose(...c.pos, ...c.q), 'sim_set_pose');
    must(sim.e.sim_wing_launch(Math.hypot(...c.vel)), 'sim_wing_launch');
    must(sim.e.sim_set_velocity(...c.vel, ...c.om), 'sim_set_velocity');
  };
  const entryStart = setTo(atEntry);
  const stallStart = setTo(inStall);
  const trim = pitchTrim(sim, () => { entryStart(); return [0, 0, 0, entryDuty]; });
  const holds = {
    entry: (s) => [bankHold(s), Math.max(-1, Math.min(1, trim + 2.5 * (theta0 - attitude(s).pitch) + 0.25 * s[12])), rudder(s), entryDuty],
    stall: (s) => [bankHold(s), 1, rudder(s), duty],
  };
  const read = (s) => fullBank(s);
  const designAt = (start, h) => leadDesign(responseGrid(sim, () => { start(); return h(sim.readState().state); }, h, 0, read), PERSON_LEADS);
  const design = { entry: designAt(entryStart, holds.entry), stall: designAt(stallStart, holds.stall) };
  const eye = eyes({ stepMs: RC_STEP_MS });
  let d0 = design.entry;
  let loop = personLoop(d0.wc, d0.gain);
  let stalled = false, stick = 0, t = 0;
  const hold = (s, alpha) => {
    eye.push({ bank: fullBank(s), p: s[11], alpha });
    if (eye.looks(t)) {
      const d = eye.ago();
      if (!stalled && Math.abs(d.alpha) > alphaStall) {
        stalled = true;
        d0 = design.stall;
        loop = personLoop(d0.wc, d0.gain, { u0: stick });
      }
      stick = quant(loop.step(-(d.bank + d0.lead * d.p)));
    }
    t += RC_STEP_MS;
    return stick;
  };
  hold.design = design;
  return hold;
}

/*
 * The power on stall as FAA-H-8083-3C ch. 5 ("Full Stalls, Power-On")
 * flies it, for an aircraft whose wings are levelled on the rudder: "hold
 * that attitude until the full stall occurs ... continual adjustments ...
 * to maintain coordinated flight", here full up and rudderLevel; then "the
 * pilot should recognize when the stall has occurred and take action
 * without delay to prevent a prolonged stalled condition ... reducing the
 * AOA ... level the wings ... coordinate with rudder ... the throttle is
 * already at the climb power setting". The stall is recognised when the
 * wing passes alphaStall, acted on 0.2 s later (the person's delay,
 * PERSON's), then the elevator neutral, the wings on rudderLevel
 * and the power kept. "With sufficient airspeed and control effectiveness"
 * the airplane is returned to its flightpath, so the wings are judged once
 * the speed is back to v0. Returns the stall's time (null if none), the
 * worst bank and whether it was ever on its back through both phases, the
 * time the speed is back to v0 and the wings within maxBankDeg after the
 * recovery began, and the worst bank after the speed is back.
 * stepFn(sticks) steps the gate's sim and returns the state; alphaOf()
 * reads the wing's angle.
 */
export function faaPowerOnStall(stepFn, s0, { alphaStall, duty, seconds, recoverSeconds, v0, maxBankDeg, alphaOf }) {
  let s = s0, tStall = null, worstBank = 0, inverted = false;
  const lagS = 0.2;
  const watch = (st) => {
    const b = Math.abs(fullBank(st));
    worstBank = Math.max(worstBank, b * 180 / Math.PI);
    inverted = inverted || b > Math.PI / 2;
  };
  let t = 0;
  for (; t < seconds; t += RC_STEP_MS / 1000) {
    s = stepFn([0, 1, rudderLevel(s), duty]);
    watch(s);
    if (tStall === null && alphaOf() > alphaStall) tStall = t;
    if (tStall !== null && t >= tStall + lagS) break;
  }
  let tSpeed = null, tLevel = null, worstAfter = 0;
  for (let r = 0; r < recoverSeconds; r += RC_STEP_MS / 1000) {
    s = stepFn([0, 0, rudderLevel(s), duty]);
    watch(s);
    const v = Math.hypot(s[4], s[5], s[6]);
    const bank = Math.abs(fullBank(s)) * 180 / Math.PI;
    if (tSpeed === null && v >= v0) tSpeed = r;
    if (tLevel === null && bank <= maxBankDeg) tLevel = r;
    if (tSpeed !== null) worstAfter = Math.max(worstAfter, bank);
  }
  return { tStall, worstBank, inverted, tSpeed, tLevel, worstAfter };
}

export function edgeLevel(s, { b = 0, trim }) {
  const { pitch } = attitude(s);
  const qAero = -s[12];
  const roll = edgeRoll(s, b);
  const sgn = Math.cos(fullBank(s)) < 0 ? -1 : 1;
  trim.v = Math.max(-0.2, Math.min(0.2, trim.v - 0.0001 * s[6]));
  const pitchT = Math.max(-0.2, Math.min(0.2, trim.v - 0.05 * s[6]));
  const stick = Math.max(-1, Math.min(1, sgn * 2.5 * (pitchT - pitch) - 0.25 * qAero));
  return [roll, stick];
}

/*
 * The Zagi HP, docs/ZAGI-STAGE1.md: airframe 17, a flying wing with
 * elevons and no rudder, thrown by hand and landed on its belly. Its
 * throw is the shell's (src/main.js throwWing): level at 10 m/s, 1.36
 * times its trimmed stall, 1.2 m over where it rests on its 12 mm belly,
 * the motor off as Zagi's manual says; 600 m to the side of the field's
 * thermals, the ground raised as the shell raises it.
 */
export const ZAGI_AIRFRAME = 17;
export const ZAGI_THROW = { speed: 10, height: 0.012 + 1.2 };
export function zagiPrelude(sim, { mu = 1.4, e = 0 } = {}) {
  must(sim.e.sim_set_airframe(ZAGI_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, mu, e), 'sim_set_ground');
  must(sim.e.sim_set_pose(0, 600, ZAGI_THROW.height, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(ZAGI_THROW.speed), 'sim_wing_launch');
}

/* Wings level on the roll stick, and the nose held at a pitch on the
 * elevons, gently: the Zagi answers a tenth of its stick. */
/* trim, when given ({ i: 0 }, kept by the caller): the hand that trims a
 * steady moment out, 0.2 of stick per radian of error a second (the
 * wings hold's before stallWingsHold); without it the hold is the proportional one it was. */
export function zagiHold(s, { bank = 0, pitch = 0, trim = null } = {}) {
  const a = attitude(s);
  const roll = Math.max(-1, Math.min(1, -1.0 * (a.bank - bank) - 0.08 * s[11]));
  if (trim) trim.i = Math.max(-1, Math.min(1, trim.i + 0.2 * (pitch - a.pitch) * RC_STEP_MS / 1000));
  const pitchStick = Math.max(-1, Math.min(1, 1.2 * (pitch - a.pitch) - 0.10 * -s[12] + (trim ? trim.i : 0)));
  return [roll, pitchStick];
}

/*
 * The Zagi's recording, for zagi-gates.js S18: the throw with the motor
 * off, then full throttle climbing out, level at 60 percent, a full
 * elevon roll to the right and level again, the throttle closed into a
 * glide, full up held into the stall's mush, and the recovery.
 */
export function recordZagiFlight(sim) {
  must(sim.reset(), 'sim_reset');
  zagiPrelude(sim);
  const samples = [];
  for (let ms = 0; ms < 25000; ms += RC_STEP_MS) {
    const s = sim.readState().state;
    let sticks;
    if (ms < 1000) {
      sticks = [...zagiHold(s, { pitch: 0.03 }), 0, 0];
    } else if (ms < 7000) {
      sticks = [...zagiHold(s, { pitch: 0.35 }), 0, 1];
    } else if (ms < 11000) {
      sticks = [...zagiHold(s, { pitch: 0.02 }), 0, 0.6];
    } else if (ms < 12200) {
      sticks = [1, 0, 0, 0.6];
    } else if (ms < 15000) {
      sticks = [...zagiHold(s, { pitch: 0.02 }), 0, 0.6];
    } else if (ms < 18000) {
      sticks = [...zagiHold(s, { pitch: -0.05 }), 0, 0];
    } else if (ms < 22000) {
      sticks = [0, 1, 0, 0];
    } else {
      sticks = [...zagiHold(s, { pitch: -0.05 }), 0, 0.5];
    }
    const [roll, pitchStick, yaw, duty] = sticks;
    samples.push({ tUs: ms * 1000, roll, pitch: pitchStick, yaw, throttle: duty });
    must(sim.input(ms / 1000, roll, pitchStick, yaw, duty), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
  }
  return samples;
}

/*
 * Phil Kraft's Das Ugly Stik, airframe 19, docs/UGLYSTIK-STAGE1.md: a
 * sport aerobat on a tricycle gear whose nose wheel steers with the
 * rudder. On the strip it stands on its three wheels at the pose the plant
 * settles to with the engine idling, 2.06 deg nose down and the CG 0.2024
 * m up (the drawn model's is 1.48 deg nose down, src/render/
 * uglystikcraft.js, before the idle's thrust leans it onto its nose
 * wheel), the quaternion's half angle's cos and sin written out to 17
 * digits because a recording's prelude is hashed and JS Math.cos is not
 * specified to the bit; thrown, at its cruise.
 */
export const UGLYSTIK_AIRFRAME = 19;
export const UGLYSTIK_REST = { z: 0.2024, pitchDeg: -2.06 };
const UGLYSTIK_REST_C = 0.99983842004120882;
const UGLYSTIK_REST_S = -0.017975923049993122;
export function uglystikPrelude(sim) {
  must(sim.e.sim_set_airframe(UGLYSTIK_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_wing_launch(17), 'sim_wing_launch');
}
export function uglystikGroundPrelude(sim, { mu = 1.4, e = 0 } = {}) {
  must(sim.e.sim_set_airframe(UGLYSTIK_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, mu, e), 'sim_set_ground');
  must(sim.e.sim_set_pose(0, 0, UGLYSTIK_REST.z, UGLYSTIK_REST_C, 0, -UGLYSTIK_REST_S, 0), 'sim_set_pose');
}

/*
 * The Stik's take off, a tricycle's: full throttle, the wings held level
 * on the ailerons and the heading on the rudder and the nose wheel it
 * steers, and at `vRotate` a firm pull that raises the nose to 8 deg: on
 * RCM's 3/8 in of elevator the Stik sitting nose down takes most of the
 * stick to rotate. Returns roll, pitch and yaw sticks.
 */
export function uglystikTakeoffSticks(s, { vRotate = 11.4 } = {}) {
  const { pitch } = attitude(s);
  const v = Math.hypot(s[4], s[5], s[6]);
  const qAero = -s[12];
  const pitchStick = v < vRotate ? 0 : Math.max(-1, Math.min(1, 5.0 * (8 * Math.PI / 180 - pitch) - 0.25 * qAero));
  /* The heading on the rudder, the take off pilot's (rudderHold): the
   * swirl swings the Stik on its roll as it swings every tractor. */
  return [edgeRoll(s), pitchStick, rudderHold(s)];
}

/*
 * The Stik's recording for the cross-host check: from standing on the
 * strip, a second at idle, the take off above and a climb, then level at
 * three quarter throttle, a full aileron roll, three seconds on its back,
 * rolled upright again, half up stick into a loop at full throttle, the
 * sticks let go, and a chop: twenty six seconds, the gear, the roll, the
 * inverted trim and the loop all in the hashed trace, still flying at the
 * end.
 */
export function recordUglystikFlight(sim) {
  must(sim.reset(), 'sim_reset');
  uglystikGroundPrelude(sim);
  const samples = [];
  const trim = { v: 0 };
  for (let ms = 0; ms < 26000; ms += RC_STEP_MS) {
    const s = sim.readState().state;
    const { pitch } = attitude(s);
    const qAero = -s[12];
    let sticks;
    if (ms < 1000) {
      sticks = [0, 0, 0, 0];
    } else if (ms < 6000) {
      sticks = [...uglystikTakeoffSticks(s), 1];
    } else if (ms < 9000) {
      sticks = [edgeRoll(s), Math.max(-1, Math.min(1, 2.5 * (0.3 - pitch) - 0.25 * qAero)), 0, 1];
    } else if (ms < 12000) {
      sticks = [...edgeLevel(s, { trim }), 0, 0.75];
    } else if (ms < 15800) {
      sticks = [1, 0, 0, 0.75];
    } else if (ms < 16800) {
      sticks = [...edgeLevel(s, { trim }), 0, 0.75];
    } else if (ms < 18700) {
      sticks = [1, 0, 0, 0.75];
    } else if (ms < 20000) {
      sticks = [...edgeLevel(s, { b: Math.PI, trim }), 0, 0.75];
    } else if (ms < 22000) {
      sticks = [...edgeLevel(s, { trim }), 0, 1];
    } else if (ms < 24500) {
      sticks = [0, 0.5, 0, 1];
    } else {
      sticks = [edgeRoll(s), 0, 0, 0];
    }
    const [roll, pitchStick, yaw, duty] = sticks;
    samples.push({ tUs: ms * 1000, roll, pitch: pitchStick, yaw, throttle: duty });
    must(sim.input(ms / 1000, roll, pitchStick, yaw, duty), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
  }
  return samples;
}

/*
 * OA Composites' NRJ, airframe 21 (DLG_AIRFRAME above): lying on its
 * belly on the grass, the pod's belly 0.042 m under the CG, facing thermal
 * A (110, 70), and thrown from there by the discus launch.
 */
export const DLG_REST_Z = 0.042;
export const DLG_THERMAL_A = [110, 70];
export function dlgGroundPrelude(sim, { mu = 1.4, e = 0 } = {}) {
  must(sim.e.sim_set_airframe(DLG_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
  must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, mu, e), 'sim_set_ground');
  /* The half angle's cos and sin from the heading's by the half angle
   * formulas, in + - * / and sqrt, which IEEE rounds exactly: a
   * recording's prelude is hashed, and JS Math.cos is not specified to
   * the bit. */
  const [ax, ay] = DLG_THERMAL_A;
  const c = ax / Math.sqrt(ax * ax + ay * ay);
  must(sim.e.sim_set_pose(0, 0, DLG_REST_Z, Math.sqrt((1 + c) / 2), 0, 0, Math.sqrt((1 - c) / 2)), 'sim_set_pose');
}

/* What a replay of the NRJ's recording does before its first sample: on
 * the grass, and the throw begun. */
export function dlgRecPrelude(sim) {
  dlgGroundPrelude(sim);
  must(sim.e.sim_wing_discus(), 'sim_wing_discus');
}

/*
 * The NRJ's recording for the cross-host check: the flight a DLG is for.
 * Thrown in Manual from the grass toward thermal A, the turn and the zoom
 * on the launch preset with the sticks centred, then from the top an
 * airspeed hold steering for the thermal, thirty seconds circling in it at
 * 35 degrees, out of it level, half a second of full right roll, two
 * seconds of full right rudder, and a glide to the end at sixty seconds,
 * all of it clear of the ground. So the turn, the release, the preset, the
 * drag across the Reynolds numbers and the rising air are all in the
 * hashed trace. The pilot is the harness pilot's bank and airspeed hold, a
 * glider's (recordGliderFlight's).
 */
export function recordDlgFlight(sim) {
  must(sim.reset(), 'sim_reset');
  dlgRecPrelude(sim);
  const samples = [];
  let trim = 0;
  let circleFrom = null;
  let topAt = null;
  for (let ms = 0; ms < 60000; ms += RC_STEP_MS) {
    const s = sim.readState().state;
    const { pitch, bank } = attitude(s);
    const p = s[11];
    const qAero = -s[12];
    const v = Math.hypot(s[4], s[5], s[6]);
    const holdBank = (target) => Math.max(-1, Math.min(1, -1.0 * (bank - target) - 0.08 * p));
    const holdSpeed = (vT) => {
      trim += 0.00002 * (v - vT);
      trim = Math.max(-0.15, Math.min(0.15, trim));
      const pitchT = Math.max(-0.35, Math.min(0.1, 0.04 * (v - vT) + trim));
      return Math.max(-0.4, Math.min(0.4, 2.5 * (pitchT - pitch) - 0.25 * qAero));
    };
    if (topAt === null && ms > 600 && sim.e.sim_wing_discus_phase() === 0) {
      topAt = ms;
    }
    const dx = DLG_THERMAL_A[0] - s[1];
    const dy = DLG_THERMAL_A[1] - s[2];
    if (topAt !== null && circleFrom === null && Math.hypot(dx, dy) < 12) {
      circleFrom = ms;
      trim = 0;
    }
    const t = circleFrom === null ? -1 : ms - circleFrom;
    let sticks;
    if (topAt === null) {
      sticks = [0, 0, 0, 0];
    } else if (circleFrom === null) {
      const w = s[7], x = s[8], y = s[9], z = s[10];
      const heading = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
      let err = Math.atan2(dy, dx) - heading;
      err = Math.atan2(Math.sin(err), Math.cos(err));
      sticks = [holdBank(Math.max(-0.4, Math.min(0.4, -1.2 * err))), holdSpeed(6.5), 0, 0];
    } else if (t < 30000) {
      sticks = [holdBank(35 * Math.PI / 180), holdSpeed(6), 0, 0];
    } else if (t < 34000) {
      sticks = [holdBank(0), holdSpeed(6.5), 0, 0];
    } else if (t < 34500) {
      sticks = [1, 0, 0, 0];
    } else if (t < 36500) {
      sticks = [holdBank(0), 0, 1, 0];
    } else {
      sticks = [holdBank(0), holdSpeed(6.5), 0, 0];
    }
    const [roll, pitchStick, yaw, duty] = sticks;
    samples.push({ tUs: ms * 1000, roll, pitch: pitchStick, yaw, throttle: duty });
    must(sim.input(ms / 1000, roll, pitchStick, yaw, duty), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
  }
  return samples;
}

/* A biplane's two wings as the last step took them, sim_wing_biplane: the
 * top wing's own CL, the bottom's, and each one's linear lift. */
export function wingBiplane(sim) {
  if (!sim.bipPtr) {
    sim.bipPtr = sim.e.malloc(4 * 8);
  }
  must(sim.e.sim_wing_biplane(sim.bipPtr), 'sim_wing_biplane');
  return Array.from(new Float64Array(sim.e.memory.buffer, sim.bipPtr, 4));
}

/* The prop's slipstream as the last step took it, sim_wing_slip: its roll,
 * pitch and yaw moments in the body frame, the disc's pressure jump, the
 * induced speed and the swirl's sideways speed over the fin. Zeros without
 * a wash. */
export function wingSlip(sim) {
  if (!sim.slipPtr) {
    sim.slipPtr = sim.e.malloc(6 * 8);
  }
  must(sim.e.sim_wing_slip(sim.slipPtr), 'sim_wing_slip');
  return Array.from(new Float64Array(sim.e.memory.buffer, sim.slipPtr, 6));
}

/*
 * Great Planes' Tiger Moth ARF, airframe 23, docs/TIGERMOTH-STAGE1.md: a
 * scale biplane on a taildragger's gear whose tail wheel turns with the
 * rudder. On the strip it stands on its three wheels at the pose the plant
 * settles to, 8.16 deg nose up and the CG 0.2654 m up (the drawn model's,
 * src/render/tigermothcraft.js), the quaternion's half angle's cos and sin
 * written out to 17 digits because a recording's prelude is hashed and JS
 * Math.cos is not specified to the bit.
 */
export const TIGERMOTH_AIRFRAME = 23;
export const TIGERMOTH_REST = { z: 0.2654, pitchDeg: 8.16 };
const TIGERMOTH_REST_C = 0.99746567947907760;
const TIGERMOTH_REST_S = 0.071149267468766889;
export function tigermothGroundPrelude(sim, { mu = 1.4, e = 0 } = {}) {
  must(sim.e.sim_set_airframe(TIGERMOTH_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, mu, e), 'sim_set_ground');
  must(sim.e.sim_set_pose(0, 0, TIGERMOTH_REST.z, TIGERMOTH_REST_C, 0, -TIGERMOTH_REST_S, 0), 'sim_set_pose');
}

/*
 * The Tiger Moth's take off, Great Planes' manual's: "hold a bit of up
 * elevator to keep the tail on the ground to maintain tail wheel
 * steering, then gradually advance the throttle. As the model gains speed
 * decrease up elevator allowing the tail to come off the ground", "always
 * be ready to apply right rudder to counteract engine torque", then
 * "gently applying up elevator". The throttle opened over two seconds;
 * the tail held down to a third of `vRotate`, then raised to 1 deg of
 * pitch; the wings held level on the ailerons and the heading on the
 * rudder and the tail wheel it turns, `yawHold` of it (nought is the
 * pilot's feet off); at `vRotate` 6 deg of pitch. `ms` is the time since
 * the throttle started to open.
 */
export function tigermothTakeoffSticks(s, ms, { vRotate = 11.4, yawHold = 1 } = {}) {
  const { pitch, bank } = attitude(s);
  const v = Math.hypot(s[4], s[5], s[6]);
  const qAero = -s[12];
  const roll = Math.max(-1, Math.min(1, -0.8 * bank - 0.05 * s[11]));
  let pitchStick;
  if (v < vRotate / 3) {
    pitchStick = 0.3;
  } else {
    const pitchT = (v < vRotate ? 1 : 6) * Math.PI / 180;
    pitchStick = Math.max(-1, Math.min(1, 2.5 * (pitchT - pitch) - 0.25 * qAero));
  }
  const yaw = Math.max(-1, Math.min(1, yawHold * (6.0 * edgeHeading(s) + 0.6 * s[13])));
  return [roll, pitchStick, yaw, Math.min(1, ms / 2000)];
}

/*
 * The Tiger Moth's hands for level flight: the Edge's (edgeLevel) with the
 * elevator's own slow part, an integral of the pitch error kept in
 * `trim.e`, as the Stik's and the Pitts's.
 */
export function tigermothLevel(s, { b = 0, trim }) {
  const [roll, stick] = edgeLevel(s, { b, trim });
  const { pitch } = attitude(s);
  const sgn = Math.cos(fullBank(s)) < 0 ? -1 : 1;
  const pitchT = Math.max(-0.2, Math.min(0.2, trim.v - 0.05 * s[6]));
  trim.e = Math.max(-0.8, Math.min(0.8, (trim.e ?? 0) + 0.004 * sgn * (pitchT - pitch)));
  return [roll, Math.max(-1, Math.min(1, stick + trim.e))];
}

/*
 * The Tiger Moth's recording for the cross-host check: from standing on
 * the strip, a second at idle, the take off above and a climb, level at
 * three quarter throttle, a turn entered on the ailerons alone (its
 * adverse yaw), level again, the same turn with the rudder with them, a
 * slow pull to full up into the stall, the sticks let go, and a climb
 * away at full throttle: twenty eight seconds, the gear, the adverse yaw,
 * both wings' stalls and the recovery in the hashed trace, and still
 * flying at the end.
 */
export function recordTigermothFlight(sim) {
  must(sim.reset(), 'sim_reset');
  tigermothGroundPrelude(sim);
  const samples = [];
  const trim = { v: 0, e: 0 };
  for (let ms = 0; ms < 28000; ms += RC_STEP_MS) {
    const s = sim.readState().state;
    const { pitch } = attitude(s);
    const qAero = -s[12];
    let sticks;
    if (ms < 1000) {
      sticks = [0, 0, 0, 0];
    } else if (ms < 7000) {
      sticks = tigermothTakeoffSticks(s, ms - 1000);
    } else if (ms < 11000) {
      sticks = [edgeRoll(s), Math.max(-1, Math.min(1, 2.5 * (0.15 - pitch) - 0.25 * qAero)), 0, 1];
    } else if (ms < 14000) {
      sticks = [...tigermothLevel(s, { trim }), 0, 0.75];
    } else if (ms < 15000) {
      sticks = [1, 0, 0, 0.75];
    } else if (ms < 17000) {
      sticks = [...tigermothLevel(s, { trim }), 0, 0.75];
    } else if (ms < 18000) {
      sticks = [1, 0, 1, 0.75];
    } else if (ms < 20000) {
      sticks = [...tigermothLevel(s, { trim }), 0, 0.75];
    } else if (ms < 24000) {
      sticks = [edgeRoll(s), Math.min(1, (ms - 20000) / 3000), 0, 0.2];
    } else if (ms < 25000) {
      sticks = [0, 0, 0, 0.75];
    } else {
      sticks = [edgeRoll(s), Math.max(-1, Math.min(1, 2.5 * (0.1 - pitch) - 0.25 * qAero)), 0, 1];
    }
    const [roll, pitchStick, yaw, duty] = sticks;
    samples.push({ tUs: ms * 1000, roll, pitch: pitchStick, yaw, throttle: duty });
    must(sim.input(ms / 1000, roll, pitchStick, yaw, duty), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
  }
  return samples;
}

/* The Striker, docs/COMBAT-DRONES.md section 7: one plant for each engine,
 * its combat.propulsion in configs/airframes.js, which npm run
 * combat:gates holds to the module. */
export const STRIKER_PROP_AIRFRAME = 27;
export const STRIKER_JET_AIRFRAME = 28;

/*
 * E-flite's Extra 300 3D 1.3m, airframe 29 (14 until it was removed on
 * 2026-09-29), docs/EXTRA-STAGE1.md: a
 * taildragger standing 6.7 deg nose up on its wheels, the CG 0.2221 m up
 * (src/render/extracraft.js), or thrown at its cruise.
 */
export const EXTRA_AIRFRAME = 29;
export const EXTRA_REST = { z: 0.2221, pitchDeg: 6.7 };
export function extraPrelude(sim) {
  must(sim.e.sim_set_airframe(EXTRA_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_wing_launch(15), 'sim_wing_launch');
}
export function extraGroundPrelude(sim, { mu = 1.4, e = 0 } = {}) {
  must(sim.e.sim_set_airframe(EXTRA_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, mu, e), 'sim_set_ground');
  const h = EXTRA_REST.pitchDeg * Math.PI / 360;
  must(sim.e.sim_set_pose(0, 0, EXTRA_REST.z, Math.cos(h), 0, -Math.sin(h), 0), 'sim_set_pose');
}

/*
 * A 3D pilot's hands on an aircraft hanging on its prop: the nose held on
 * a world direction (straight up unless given) by the elevator and the
 * rudder in the slipstream, and the roll rate on the ailerons toward
 * rollRate (rad/s, body), or the ailerons left where rollStick puts them.
 * The error is the rotation that takes the nose onto the target, in the
 * body's axes; each axis asks for a rate proportional to it and the
 * stick closes the rate. Nose up stick is a negative body pitch rate, and
 * right yaw stick a negative body yaw rate. Returns roll, pitch and yaw
 * sticks.
 */
export function hangSticks(s, { target = [0, 0, 1], rollRate = null, rollStick = 0, kp = 10, kr = 0.8 } = {}) {
  const w = s[7], x = s[8], y = s[9], z = s[10];
  const nose = [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)];
  /* nose x target, the rotation vector (small angle), world to body. */
  const cw = [
    nose[1] * target[2] - nose[2] * target[1],
    nose[2] * target[0] - nose[0] * target[2],
    nose[0] * target[1] - nose[1] * target[0],
  ];
  const xx = x * x, yy = y * y, zz = z * z, wx = w * x, wy = w * y, wz = w * z, xy = x * y, xz = x * z, yz = y * z;
  const e = [
    (1 - 2 * (yy + zz)) * cw[0] + 2 * (xy + wz) * cw[1] + 2 * (xz - wy) * cw[2],
    2 * (xy - wz) * cw[0] + (1 - 2 * (xx + zz)) * cw[1] + 2 * (yz + wx) * cw[2],
    2 * (xz + wy) * cw[0] + 2 * (yz - wx) * cw[1] + (1 - 2 * (xx + yy)) * cw[2],
  ];
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  const pitch = clamp(-kr * (kp * e[1] - s[12]));
  const yaw = clamp(-kr * (kp * e[2] - s[13]));
  const roll = rollRate == null ? rollStick : clamp(kr * (rollRate - s[11]));
  return [roll, pitch, yaw];
}

/*
 * The Extra's take off: full throttle with the elevator held a little up
 * to keep the tailwheel steering, as E-flite's manual says, then eased to
 * neutral so the tail comes up, and at the rotation speed the nose raised
 * to 8 deg. The wings are held level on the ailerons and the heading on
 * the rudder. Returns roll, pitch and yaw sticks.
 */
export function extraTakeoffSticks(s, { vRotate = 10 } = {}) {
  const { pitch, bank } = attitude(s);
  const v = Math.hypot(s[4], s[5], s[6]);
  const qAero = -s[12];
  const heading = Math.atan2(2 * (s[7] * s[10] + s[8] * s[9]), 1 - 2 * (s[9] * s[9] + s[10] * s[10]));
  const pitchT = (v < 5 ? 6 : (v < vRotate ? 2 : 8)) * Math.PI / 180;
  const roll = Math.max(-1, Math.min(1, -0.6 * bank - 0.06 * s[11]));
  const pitchStick = Math.max(-1, Math.min(1, 1.5 * (pitchT - pitch) - 0.12 * qAero));
  const yaw = Math.max(-1, Math.min(1, 1.5 * heading + 0.2 * s[13]));
  return [roll, pitchStick, yaw];
}

/*
 * The Extra's recording for the cross-host check: from standing on the
 * strip, a second at idle, a taildragger's take off at full throttle, a
 * climb, a pull to the vertical, hanging on the prop with the throttle
 * holding height and the ailerons holding the torque, then two seconds of
 * torque roll with them let go, full throttle out of it and back to
 * level, and a second of full rudder: twenty two seconds, every
 * slipstream term in the hashed trace.
 */
export function recordExtraFlight(sim) {
  must(sim.reset(), 'sim_reset');
  extraGroundPrelude(sim);
  const samples = [];
  let iT = 0.6;
  for (let ms = 0; ms < 22000; ms += RC_STEP_MS) {
    const s = sim.readState().state;
    const { pitch, bank } = attitude(s);
    const p = s[11];
    const qAero = -s[12];
    const vz = s[6];
    const hold = (b) => Math.max(-1, Math.min(1, -0.6 * (bank - b) - 0.06 * p));
    const nose = (t) => Math.max(-1, Math.min(1, 1.5 * (t - pitch) - 0.12 * qAero));
    let sticks;
    if (ms < 1000) {
      sticks = [0, 0, 0, 0];
    } else if (ms < 7000) {
      sticks = [...extraTakeoffSticks(s), 1];
    } else if (ms < 9000) {
      sticks = [hold(0), nose(0.45), 0, 1];
    } else if (ms < 16000) {
      iT += 0.0008 * (0 - vz);
      iT = Math.max(0.3, Math.min(1, iT));
      const thr = Math.max(0, Math.min(1, iT - 0.08 * vz));
      sticks = [...hangSticks(s, { rollRate: ms < 14000 ? 0 : null }), ms < 11000 ? 0.75 : thr];
    } else if (ms < 20000) {
      sticks = [hold(0), nose(0.1), 0, 1];
    } else {
      sticks = [hold(0), nose(0.1), ms < 21000 ? 1 : 0, 0.6];
    }
    const [roll, pitchStick, yaw, duty] = sticks;
    samples.push({ tUs: ms * 1000, roll, pitch: pitchStick, yaw, throttle: duty });
    must(sim.input(ms / 1000, roll, pitchStick, yaw, duty), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
  }
  return samples;
}

/*
 * E-flite's Night Timber X 1.2m, airframe 30, docs/NIGHTTIMBER-STAGE1.md:
 * a taildragger standing 4.5 deg nose up on its tundra tyres, the CG
 * 0.2562 m up, as E-flite's side photograph has it, or thrown at its
 * cruise. The flaps' notch as given, up unless asked.
 */
export const NIGHTTIMBER_AIRFRAME = 30;
export const NIGHTTIMBER_REST = { z: 0.2562, pitchDeg: 4.5 };
export function nighttimberPrelude(sim, { flaps = 0 } = {}) {
  must(sim.e.sim_set_airframe(NIGHTTIMBER_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_wing_set_flaps(flaps), 'sim_wing_set_flaps');
  must(sim.e.sim_wing_launch(13), 'sim_wing_launch');
}
export function nighttimberGroundPrelude(sim, { mu = 1.4, e = 0, flaps = 0 } = {}) {
  must(sim.e.sim_set_airframe(NIGHTTIMBER_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_wing_set_flaps(flaps), 'sim_wing_set_flaps');
  must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, mu, e), 'sim_set_ground');
  const h = NIGHTTIMBER_REST.pitchDeg * Math.PI / 360;
  must(sim.e.sim_set_pose(0, 0, NIGHTTIMBER_REST.z, Math.cos(h), 0, -Math.sin(h), 0), 'sim_set_pose');
}

/*
 * The Night Timber's recording for the cross-host check: from standing on
 * the strip with half flaps (left there: a replay carries the sticks, not
 * the flap switch), a second at idle, the take off at full throttle, a
 * pull to the vertical, hanging on
 * the prop with the throttle holding height and the ailerons holding the
 * torque, then two seconds with them let go, full throttle out of it and
 * back to level, a second of full rudder: twenty two seconds, the flaps,
 * the slipstream and the high angle terms in the hashed trace.
 */
export function recordNightTimberFlight(sim) {
  must(sim.reset(), 'sim_reset');
  nighttimberGroundPrelude(sim, { flaps: 1 });
  const samples = [];
  let iT = 0.8;
  for (let ms = 0; ms < 22000; ms += RC_STEP_MS) {
    const s = sim.readState().state;
    const { pitch, bank } = attitude(s);
    const p = s[11];
    const qAero = -s[12];
    const vz = s[6];
    const hold = (b) => Math.max(-1, Math.min(1, -0.6 * (bank - b) - 0.06 * p));
    const nose = (t) => Math.max(-1, Math.min(1, 1.5 * (t - pitch) - 0.12 * qAero));
    let sticks;
    if (ms < 1000) {
      sticks = [0, 0, 0, 0];
    } else if (ms < 7000) {
      sticks = [...extraTakeoffSticks(s), 1];
    } else if (ms < 9000) {
      sticks = [hold(0), nose(0.45), 0, 1];
    } else if (ms < 16000) {
      iT += 0.0008 * (0 - vz);
      iT = Math.max(0.3, Math.min(1, iT));
      const thr = Math.max(0, Math.min(1, iT - 0.08 * vz));
      sticks = [...hangSticks(s, { rollRate: ms < 14000 ? 0 : null }), ms < 11000 ? 0.9 : thr];
    } else if (ms < 20000) {
      sticks = [hold(0), nose(0.1), 0, 1];
    } else {
      sticks = [hold(0), nose(0.1), ms < 21000 ? 1 : 0, 0.6];
    }
    const [roll, pitchStick, yaw, duty] = sticks;
    samples.push({ tUs: ms * 1000, roll, pitch: pitchStick, yaw, throttle: duty });
    must(sim.input(ms / 1000, roll, pitchStick, yaw, duty), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
  }
  return samples;
}

/*
 * AeroTetris's C-130 Hercules 3077, airframe 31, docs/HERCULES-STAGE1.md:
 * a tricycle standing level on its wheels, the CG 0.2604 m up
 * (src/render/herculescraft.js), or thrown at its cruise.
 */
export const HERCULES_AIRFRAME = 31;
export const HERCULES_REST = { z: 0.2604, pitchDeg: 0 };
export function herculesPrelude(sim) {
  must(sim.e.sim_set_airframe(HERCULES_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_wing_launch(16), 'sim_wing_launch');
}
export function herculesGroundPrelude(sim, { mu = 1.4, e = 0 } = {}) {
  must(sim.e.sim_set_airframe(HERCULES_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, mu, e), 'sim_set_ground');
  const h = HERCULES_REST.pitchDeg * Math.PI / 360;
  must(sim.e.sim_set_pose(0, 0, HERCULES_REST.z, Math.cos(h), 0, -Math.sin(h), 0), 'sim_set_pose');
}
/* A tricycle's take off as the Kadet's: full throttle, the wings held
 * level on the ailerons and the heading on the rudder and nose wheel
 * against the four props' torque, the elevator eased up past 1.1 Vs. */
/* The take off as FAA-H-8083-3C ch. 6 flies it: at VR, 1.1 Vs, back
 * pressure raises the nose to the lift-off attitude, "the slightly
 * nose-high pitch attitude should be held until the airplane lifts off",
 * and not forced off ("excessive back-elevator pressure would only result
 * in an excessively high-pitch attitude and may delay the takeoff"): the
 * attitude where the wing makes the weight at 1.1 Vs, CL max / 1.21 on the
 * zero lift line (hercules:derive liftoffPitchDeg, 5.66 deg), held on the
 * elevator with takeoffSticks' gains and a hand that keeps pulling until
 * the nose is there (hold.i, an integral over a second, kept by the
 * caller); the wings on the ailerons, the heading on the rudder. It
 * replaces a 0.6 elevator cap no source held. */
export function herculesTakeoffSticks(s, { vRotate = 10.63, liftoffPitchDeg = 5.66, hold = { i: 0 } } = {}) {
  const { pitch, bank } = attitude(s);
  const v = Math.hypot(s[4], s[5], s[6]);
  const heading = Math.atan2(2 * (s[7] * s[10] + s[8] * s[9]), 1 - 2 * (s[9] * s[9] + s[10] * s[10]));
  const roll = Math.max(-1, Math.min(1, -0.8 * bank - 0.1 * s[11]));
  const yaw = Math.max(-1, Math.min(1, 1.5 * heading + 0.2 * s[13]));
  const err = liftoffPitchDeg * Math.PI / 180 - pitch;
  if (v >= vRotate) hold.i = Math.max(-1, Math.min(1, hold.i + 4 * err * RC_STEP_MS / 1000));
  const elev = v < vRotate ? 0 : Math.max(-1, Math.min(1, 4 * err + 0.5 * s[12] + hold.i));
  return [roll, elev, yaw, 1];
}

/*
 * The Hercules' recording for the cross-host check: from standing on the
 * strip, a second at rest, eight of full throttle taking off, a climb to
 * 70 percent with the wings held on the ailerons, a held 30 deg bank to
 * the right, a second of full rudder and the throttle back to a glide:
 * twenty four seconds, the take off and the four props' torque in the
 * hashed trace, and still flying at the end.
 */
export function recordHerculesFlight(sim) {
  must(sim.reset(), 'sim_reset');
  herculesGroundPrelude(sim);
  const samples = [];
  const pull = { i: 0 };
  for (let ms = 0; ms < 24000; ms += RC_STEP_MS) {
    const s = sim.readState().state;
    const { pitch, bank } = attitude(s);
    const hold = (b) => Math.max(-1, Math.min(1, -0.8 * (bank - b) - 0.1 * s[11]));
    const nose = (t) => Math.max(-1, Math.min(1, 2.0 * (t - pitch) + 0.2 * s[12]));
    let sticks;
    if (ms < 1000) {
      sticks = [0, 0, 0, 0];
    } else if (ms < 9000) {
      sticks = herculesTakeoffSticks(s, { hold: pull });
    } else if (ms < 14000) {
      sticks = [hold(0), nose(0.12), 0, 1];
    } else if (ms < 19000) {
      sticks = [hold(30 * Math.PI / 180), nose(0.05), 0, 0.7];
    } else if (ms < 20000) {
      sticks = [hold(0), nose(0.05), 1, 0.7];
    } else {
      sticks = [hold(0), nose(-0.05), 0, 0];
    }
    const [roll, pitchStick, yaw, duty] = sticks;
    samples.push({ tUs: ms * 1000, roll, pitch: pitchStick, yaw, throttle: duty });
    must(sim.input(ms / 1000, roll, pitchStick, yaw, duty), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
  }
  return samples;
}

/*
 * Extreme Flight's 67 in CAP 580, airframe 32, docs/CAP580-STAGE1.md: a
 * taildragger standing nose up on its carbon gear as the photographs have
 * it, the CG over the grass as npm run cap580:derive gives it
 * (src/render/capcraft.js draws the same), or thrown at its cruise.
 */
export const CAP_AIRFRAME = 32;
export const CAP_REST = { z: 0.3130, pitchDeg: 10.87 };
export function capPrelude(sim) {
  must(sim.e.sim_set_airframe(CAP_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_wing_launch(18), 'sim_wing_launch');
}
export function capGroundPrelude(sim, { mu = 1.4, e = 0 } = {}) {
  must(sim.e.sim_set_airframe(CAP_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, mu, e), 'sim_set_ground');
  const h = CAP_REST.pitchDeg * Math.PI / 360;
  must(sim.e.sim_set_pose(0, 0, CAP_REST.z, Math.cos(h), 0, -Math.sin(h), 0), 'sim_set_pose');
}
/* The CAP's take off, the Extra's hands: the elevator a little up to keep
 * the tailwheel steering, eased so the tail comes up past 6 m/s, and the
 * nose raised to 8 deg at 1.2 times the stall (cap580:derive). */
export function capTakeoffSticks(s, { vRotate = 12.75 } = {}) {
  const { pitch, bank } = attitude(s);
  const v = Math.hypot(s[4], s[5], s[6]);
  const qAero = -s[12];
  const heading = Math.atan2(2 * (s[7] * s[10] + s[8] * s[9]), 1 - 2 * (s[9] * s[9] + s[10] * s[10]));
  const pitchT = (v < 6 ? CAP_REST.pitchDeg : (v < vRotate ? 2 : 8)) * Math.PI / 180;
  const roll = Math.max(-1, Math.min(1, -0.6 * bank - 0.06 * s[11]));
  const pitchStick = Math.max(-1, Math.min(1, 1.5 * (pitchT - pitch) - 0.12 * qAero));
  const yaw = Math.max(-1, Math.min(1, 1.5 * heading + 0.2 * s[13]));
  return [roll, pitchStick, yaw];
}

/*
 * The CAP's recording for the cross-host check, the Extra's program: a
 * second at idle, the take off, a climb, a pull to the vertical, hanging
 * on the prop with the throttle on the height and the ailerons on the
 * torque, two seconds of torque roll with them let go, full throttle out
 * and back to level, and a second of full rudder: twenty two seconds,
 * every slipstream term in the hashed trace.
 */
export function recordCapFlight(sim) {
  must(sim.reset(), 'sim_reset');
  capGroundPrelude(sim);
  const samples = [];
  let iT = 0.6;
  for (let ms = 0; ms < 22000; ms += RC_STEP_MS) {
    const s = sim.readState().state;
    const { pitch, bank } = attitude(s);
    const p = s[11];
    const qAero = -s[12];
    const vz = s[6];
    const hold = (b) => Math.max(-1, Math.min(1, -0.6 * (bank - b) - 0.06 * p));
    const nose = (t) => Math.max(-1, Math.min(1, 1.5 * (t - pitch) - 0.12 * qAero));
    let sticks;
    if (ms < 1000) {
      sticks = [0, 0, 0, 0];
    } else if (ms < 7000) {
      sticks = [...capTakeoffSticks(s), 1];
    } else if (ms < 9000) {
      sticks = [hold(0), nose(0.45), 0, 1];
    } else if (ms < 16000) {
      iT += 0.0008 * (0 - vz);
      iT = Math.max(0.3, Math.min(1, iT));
      const thr = Math.max(0, Math.min(1, iT - 0.08 * vz));
      sticks = [...hangSticks(s, { rollRate: ms < 14000 ? 0 : null }), ms < 11000 ? 0.75 : thr];
    } else if (ms < 20000) {
      sticks = [hold(0), nose(0.1), 0, 1];
    } else {
      sticks = [hold(0), nose(0.1), ms < 21000 ? 1 : 0, 0.6];
    }
    const [roll, pitchStick, yaw, duty] = sticks;
    samples.push({ tUs: ms * 1000, roll, pitch: pitchStick, yaw, throttle: duty });
    must(sim.input(ms / 1000, roll, pitchStick, yaw, duty), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
  }
  return samples;
}

/*
 * Extreme Flight's 105.5 in Slick 580, airframe 33, docs/SLICK-STAGE1.md:
 * a taildragger standing 9.38 deg nose up on its wheels, the CG 0.4082 m
 * up, as the sheet's side view has it (npm run slick:derive), or thrown at
 * its sport pace.
 */
export const SLICK_AIRFRAME = 33;
export const SLICK_REST = { z: 0.4082, pitchDeg: 9.38 };
export function slickPrelude(sim) {
  must(sim.e.sim_set_airframe(SLICK_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_wing_launch(22), 'sim_wing_launch');
}
export function slickGroundPrelude(sim, { mu = 1.4, e = 0 } = {}) {
  must(sim.e.sim_set_airframe(SLICK_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, mu, e), 'sim_set_ground');
  const h = SLICK_REST.pitchDeg * Math.PI / 360;
  must(sim.e.sim_set_pose(0, 0, SLICK_REST.z, Math.cos(h), 0, -Math.sin(h), 0), 'sim_set_pose');
}

/*
 * The Slick's take off, the Extra's at its own speeds: the tail held down
 * to 8 m/s on the elevator, eased up to 2 deg, and at 15 m/s, 1.1 of its
 * stall, the nose to 8 deg. The wings on the ailerons, the heading on the
 * rudder. Returns roll, pitch and yaw sticks.
 */
export function slickTakeoffSticks(s, { vTail = 8, vRotate = 15 } = {}) {
  const { pitch, bank } = attitude(s);
  const v = Math.hypot(s[4], s[5], s[6]);
  const qAero = -s[12];
  const heading = Math.atan2(2 * (s[7] * s[10] + s[8] * s[9]), 1 - 2 * (s[9] * s[9] + s[10] * s[10]));
  const pitchT = (v < vTail ? SLICK_REST.pitchDeg : (v < vRotate ? 2 : 8)) * Math.PI / 180;
  const roll = Math.max(-1, Math.min(1, -0.6 * bank - 0.06 * s[11]));
  const pitchStick = Math.max(-1, Math.min(1, 1.5 * (pitchT - pitch) - 0.12 * qAero));
  const yaw = Math.max(-1, Math.min(1, 1.5 * heading + 0.2 * s[13]));
  return [roll, pitchStick, yaw];
}

/*
 * The Slick's recording for the cross-host check, the Extra's flight on
 * this aircraft: from standing on the strip, a second at idle, the take
 * off at full throttle, a climb, a pull to the vertical, hanging on the
 * prop with the throttle holding height and the ailerons the torque, two
 * seconds of torque roll with them let go, full throttle out of it and
 * back to level, and a second of full rudder: twenty four seconds, the
 * engine's spool, the slipstream and the gyroscope in the hashed trace.
 */
export function recordSlickFlight(sim) {
  must(sim.reset(), 'sim_reset');
  slickGroundPrelude(sim);
  const samples = [];
  let iT = 0.6;
  for (let ms = 0; ms < 24000; ms += RC_STEP_MS) {
    const s = sim.readState().state;
    const { pitch, bank } = attitude(s);
    const p = s[11];
    const qAero = -s[12];
    const vz = s[6];
    const hold = (b) => Math.max(-1, Math.min(1, -0.6 * (bank - b) - 0.06 * p));
    const nose = (t) => Math.max(-1, Math.min(1, 1.5 * (t - pitch) - 0.12 * qAero));
    let sticks;
    if (ms < 1000) {
      sticks = [0, 0, 0, 0];
    } else if (ms < 7000) {
      sticks = [...slickTakeoffSticks(s), 1];
    } else if (ms < 10000) {
      sticks = [hold(0), nose(ms < 8500 ? 0.2 : 1.4), 0, 1];
    } else if (ms < 18000) {
      iT += 0.0008 * (0 - vz);
      iT = Math.max(0.3, Math.min(1, iT));
      const thr = Math.max(0, Math.min(1, iT - 0.08 * vz));
      sticks = [...hangSticks(s, { rollRate: ms < 16000 ? 0 : null }), ms < 12000 ? 0.75 : thr];
    } else if (ms < 22000) {
      sticks = [hold(0), nose(0.1), 0, 1];
    } else {
      sticks = [hold(0), nose(0.1), ms < 23000 ? 1 : 0, 0.6];
    }
    const [roll, pitchStick, yaw, duty] = sticks;
    samples.push({ tUs: ms * 1000, roll, pitch: pitchStick, yaw, throttle: duty });
    must(sim.input(ms / 1000, roll, pitchStick, yaw, duty), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
  }
  return samples;
}
