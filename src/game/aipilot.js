/*
 * aipilot.js: the first AI pilot (docs/redesign/PLAN.md 18, PILLARS 12): a
 * person's eyes and hands on a quad's sticks, racing a ghost's line.
 *
 * WHAT IT FLIES. The real plant, through the real input path: every 4 ms
 * it hands sim_input four sticks and the module does the rest, Betaflight
 * and all. It never writes a pose, a velocity or a force in flight. The
 * quad is in Betaflight's ANGLE mode, the flag a radio's aux switch raises
 * (sim_abi.h sim_set_angle_mode), so the roll and pitch sticks ask for a
 * tilt; the pilot this models flies angle, as a pilot in the game may.
 *
 * WHO FLIES IT. tests/lib/personpilot.js's person: the aircraft seen 0.2 s
 * late, the sticks moved ten times a second in fiftieths of their travel.
 * Its gains are McRuer's crossover model's, as tests/lib/wingpilot.js
 * derives them for every person paced check: the open loop near crossover
 * is wc e^(-tau s) / s with a 45 deg phase margin, less the atan(1/4) the
 * trim's integral costs, so
 *
 *   wc = (pi/2 - PERSON.pmRad - atan(1/4)) / tau
 *
 * where tau is the person's (the delay and half a hold, TAU_PERSON) plus
 * the aircraft's own answer to the stick: Betaflight's angle loop for the
 * tilt, the motors for the climb. Those two, the hover and the climb's
 * gain per unit of throttle are not assumed: learnSticks() measures them on
 * the pilot's own plant before it flies, as a pilot learns a new quad on
 * its first hover. The line, an outer loop, crosses PERSON.outer of the
 * speed loop inside it.
 *
 * WHAT IT CHASES. A ghost's line: where the ghost is, and how fast and
 * which way it is turning there, at the ghost's lap time. The person
 * compares what they see of themselves with where the ghost was at that
 * same instant, and flies the ghost's turn tau ahead of it, the time their
 * eyes, hands and aircraft lose: a pursuit on the line ahead with the
 * error closed on the line as seen. Feedback on the ghost tau ahead
 * instead (pure pursuit on t + lead) flies tighter at a walking pace but
 * cuts the corner before tests/fixtures/map-track-v4.json's dive gate:
 * measured with aipilot:harness on 2026-10-13, it took no lap behind a
 * 9 m/s ghost, where this closes every lap at 77 percent of the half
 * opening.
 *
 * FRAMES. The law works in the plant's world frame (Z up, metres, SI). A
 * line is handed in already in that frame: lineFromGhost() converts a
 * GhostLap (scene frame, y up) with src/render/frame.js, given the scene
 * point the plant's origin is drawn at.
 *
 * DETERMINISM. The sticks are a pure function of the states the plant
 * returned, so one engine flies the same line the same way every time. The
 * law uses Math.sin, cos and atan2, so another engine may round a stick
 * differently: a replay of an AI pilot keeps its sticks, it does not ask
 * this file for them again.
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

import { PERSON, eyes, quant } from '../../tests/lib/personpilot.js';
import { angleRateDeg } from '../fc/ratescurve.js';
import { rateAxis } from '../../configs/rates.js';
import { threePosToSim } from '../render/frame.js';

export const G = 9.80665;
/* The RC step the shell and every check feed sim_input at. */
export const AI_STEP_MS = 4;
/* Betaflight 4.5's angle_limit default, the tilt at full stick: the tunes
 * do not set it, and aipilot:harness reads the plant's tilt against it. */
export const ANGLE_LIMIT_DEG = 60;
/* The tilt the person asks for at most: a pilot's comfortable bank, kept
 * off the stops. */
const TILT_MAX = (50 * Math.PI) / 180;
/* Below this the ghost's heading is noise, and the nose is held. */
const HEADING_MIN_SPEED = 1;
/* The throttle step learnSticks() reads the climb's gain from. */
const CLIMB_STEP = 0.05;

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/* The crossover a loop of total delay tau seconds flies at. */
export function crossover(tau) {
  return (Math.PI / 2 - PERSON.pmRad - Math.atan(0.25)) / tau;
}

/* One loop of the person, wingpilot.js personLoop's rule: gain wc over the
 * plant's gain, the trim's integral cornered at wc / 4 and held while the
 * command is on a stop in the error's direction. Stepped once a look,
 * dt seconds apart. */
function loop(wc, plantGain, dt, { min = -Infinity, max = Infinity, u0 = 0 } = {}) {
  const k = wc / plantGain;
  let trim = u0 / k;
  return (e) => {
    const free = k * (e + trim);
    if (!((free >= max && e > 0) || (free <= min && e < 0))) trim += (e * dt * wc) / 4;
    return clamp(k * (e + trim), min, max);
  };
}

/* The stick, in -1..1, whose rate curve gives `frac` of full stick's rate:
 * in ANGLE mode Betaflight asks for that fraction of angle_limit, so this
 * is how a pilot who knows their sticks reaches a tilt. Bisection on the
 * curve the menu draws (src/fc/ratescurve.js), which is monotonic. */
export function stickFor(rates, axis, frac) {
  const a = rateAxis(rates, axis);
  const full = angleRateDeg(rates.type, a, 1);
  const want = clamp(Math.abs(frac), 0, 1) * full;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i += 1) {
    const mid = 0.5 * (lo + hi);
    if (angleRateDeg(rates.type, a, mid) < want) lo = mid;
    else hi = mid;
  }
  return Math.sign(frac) * 0.5 * (lo + hi);
}

function bank(s) {
  const [w, x, y, z] = [s[7], s[8], s[9], s[10]];
  return Math.atan2(2 * (y * z + w * x), 1 - 2 * (x * x + y * y));
}

/* Level and still in free air, the sticks held for settleMs: the clock
 * after. */
function settle(sim, sticks, settleMs) {
  sim.reset();
  sim.e.sim_set_pose(0, 0, 100, 1, 0, 0, 0);
  for (let ms = 0; ms < settleMs; ms += AI_STEP_MS) {
    sim.input(ms / 1000, ...sticks);
    sim.step(AI_STEP_MS);
  }
  return settleMs;
}

/* One stick stepped from `from` to `to` on a settled quad: read(state)
 * less its value at the step, every step for spanMs. */
function stepResponse(sim, from, to, read, spanMs) {
  let ms = settle(sim, from, 1000);
  const base = read(sim.readState().state);
  const out = [];
  for (const end = ms + spanMs; ms < end; ms += AI_STEP_MS) {
    sim.input(ms / 1000, ...to);
    sim.step(AI_STEP_MS);
    out.push(read(sim.readState().state) - base);
  }
  return out;
}

/* Seconds until a response first reaches 63 percent of its value at the
 * end of the span: a first order lag's time constant. */
function lag63(r) {
  const end = r[r.length - 1];
  const i = r.findIndex((x) => Math.abs(x) >= 0.632 * Math.abs(end));
  return ((i + 1) * AI_STEP_MS) / 1000;
}

/*
 * What a pilot learns on a new quad's first hover, measured on `sim` (a
 * seated plant in ANGLE mode with the rates `rates`), flown in free air
 * and reset afterwards: the throttle that hovers (bisection on the climb
 * rate, as tests/lib/checks.js finds it), the tilt loop's time to 63
 * percent of a half stick's tilt and that tilt (radians), and the climb's
 * lag and gain (vertical acceleration per unit throttle) for a throttle
 * step of CLIMB_STEP above the hover.
 */
export function learnSticks(sim, rates) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i += 1) {
    const mid = 0.5 * (lo + hi);
    settle(sim, [0, 0, 0, mid], 2000);
    if (sim.readState().state[6] > 0) hi = mid;
    else lo = mid;
  }
  const hover = 0.5 * (lo + hi);
  const tilt = stepResponse(sim, [0, 0, 0, hover], [stickFor(rates, 'roll', 0.5), 0, 0, hover], bank, 1000);
  const vz = stepResponse(sim, [0, 0, 0, hover], [0, 0, 0, hover + CLIMB_STEP], (s) => s[6], 400);
  const accel = vz.map((v, i) => ((v - (i ? vz[i - 1] : 0)) * 1000) / AI_STEP_MS);
  sim.reset();
  return {
    hover,
    tiltLag: lag63(tilt),
    halfStickTilt: tilt[tilt.length - 1],
    climbLag: lag63(accel),
    climbGain: accel[accel.length - 1] / CLIMB_STEP,
  };
}

/*
 * A GhostLap as a line in the plant's frame: at(tMs) gives { p, v, a },
 * position, velocity and acceleration there, the lap looped so a race of
 * several laps keeps chasing it (a lap is closed: it ends on the line it
 * started on). origin is the scene point the plant's (0, 0, 0) is drawn at.
 */
export function lineFromGhost(lap, origin = { x: 0, y: 0, z: 0 }) {
  const pose = { px: 0, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1, cut: false };
  const out = { x: 0, y: 0, z: 0 };
  const dur = lap.durationMs;
  const H = 1000 / lap.rateHz;
  const posAt = (t) => {
    lap.sample(((t % dur) + dur) % dur, pose);
    threePosToSim(pose.px - origin.x, pose.py - origin.y, pose.pz - origin.z, out);
    return [out.x, out.y, out.z];
  };
  /* Velocity over one grid step either side; acceleration over three,
   * a tenth of a second, so the spline's knots do not show in it. */
  const A = 3 * H;
  const diff = (t, h) => {
    const a = posAt(t - h);
    const b = posAt(t + h);
    return [0, 1, 2].map((k) => (b[k] - a[k]) / ((2 * h) / 1000));
  };
  return {
    durationMs: dur,
    at(tMs) {
      const va = diff(tMs - A, A);
      const vb = diff(tMs + A, A);
      return { p: posAt(tMs), v: diff(tMs, H), a: [0, 1, 2].map((k) => (vb[k] - va[k]) / ((2 * A) / 1000)) };
    },
  };
}

/*
 * The pilot. opts: line (lineFromGhost's shape), rates (the profile the
 * plant is seated with), learnt (learnSticks' answer), startMs (the line's
 * time at the pilot's clock zero), person (PERSON by default) and quantise
 * (the hand's fiftieths, on by default). sticks(ms, state) is called every
 * AI_STEP_MS with the clock and the plant's state block, and returns
 * [roll, pitch, yaw, throttle].
 */
export function aiPilot({ line, rates, learnt, startMs = 0, person = PERSON, quantise = true }) {
  const eyeS = (person.delayMs + person.everyMs / 2) / 1000;
  const dt = person.everyMs / 1000;
  const tiltTau = eyeS + learnt.tiltLag;
  const climbTau = eyeS + learnt.climbLag;
  const wTilt = crossover(tiltTau);
  const wClimb = crossover(climbTau);
  const wLine = wTilt * PERSON.outer;
  const sight = eyes({ stepMs: AI_STEP_MS, delayMs: person.delayMs, everyMs: person.everyMs });
  /* A tilt of theta accelerates the quad g tan(theta) sideways: g per
   * radian near level, the speed loop's plant. */
  const along = loop(wTilt, G, dt, { min: -TILT_MAX, max: TILT_MAX });
  const across = loop(wTilt, G, dt, { min: -TILT_MAX, max: TILT_MAX });
  const climb = loop(wClimb, learnt.climbGain, dt, { min: 0, max: 1, u0: learnt.hover });
  /* The yaw stick's plant is its rate curve; the loop asks a rate. */
  const turn = loop(wTilt, 1, dt);
  const yawFull = (angleRateDeg(rates.type, rateAxis(rates, 'yaw'), 1) * Math.PI) / 180;
  const limitRad = (ANGLE_LIMIT_DEG * Math.PI) / 180;
  const hand = (x) => (quantise ? quant(x) : x);
  let held = [0, 0, 0, learnt.hover];
  let heading = null;
  return {
    wTilt,
    wClimb,
    wLine,
    sticks(ms, s) {
      sight.push(s.slice(0, 11));
      if (!sight.looks(ms)) return held;
      const seen = sight.ago();
      const tSeen = startMs + ms - person.delayMs;
      const was = line.at(tSeen);
      const ahead = line.at(tSeen + tiltTau * 1000);
      const upAhead = line.at(tSeen + climbTau * 1000);
      const pos = [seen[1], seen[2], seen[3]];
      const vel = [seen[4], seen[5], seen[6]];
      const [w, x, y, z] = [seen[7], seen[8], seen[9], seen[10]];
      const psi = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
      /* The line as seen: a speed asked along each world axis. */
      const want = [0, 1, 2].map((k) => was.v[k] + wLine * (was.p[k] - pos[k]));
      /* The speed: a tilt along and across the nose, closing the seen
       * error, and the ghost's turn ahead flown as it comes. */
      const c = Math.cos(psi);
      const sn = Math.sin(psi);
      const ex = want[0] - vel[0];
      const ey = want[1] - vel[1];
      const [ax, ay] = ahead.a;
      const fwdTilt = clamp(along(ex * c + ey * sn) + (ax * c + ay * sn) / G, -TILT_MAX, TILT_MAX);
      const leftTilt = clamp(across(-ex * sn + ey * c) + (-ax * sn + ay * c) / G, -TILT_MAX, TILT_MAX);
      /* Thrust tilted by the bank and the pitch lifts by their cosines:
       * a pilot adds throttle in a turn for it. */
      const lift = Math.cos(fwdTilt) * Math.cos(leftTilt);
      const thr = clamp((climb(want[2] - vel[2]) + upAhead.a[2] / learnt.climbGain) / lift, 0, 1);
      /* The nose along the ghost's track ahead. */
      const sp = Math.hypot(ahead.v[0], ahead.v[1]);
      if (sp > HEADING_MIN_SPEED) heading = Math.atan2(ahead.v[1], ahead.v[0]);
      else if (heading === null) heading = psi;
      const rate = turn(Math.atan2(Math.sin(heading - psi), Math.cos(heading - psi)));
      /* Nose down to go forward (the pitch stick back is nose up); a left
       * tilt is a negative bank; a left turn is a negative yaw stick. */
      held = [
        hand(stickFor(rates, 'roll', -leftTilt / limitRad)),
        hand(stickFor(rates, 'pitch', -fwdTilt / limitRad)),
        hand(stickFor(rates, 'yaw', clamp(-rate / yawFull, -1, 1))),
        hand(thr),
      ];
      return held;
    },
  };
}
