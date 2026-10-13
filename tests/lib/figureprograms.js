/*
 * figureprograms.js: the figures as programs of phases a pilot calls out
 * to themselves ("pull to the vertical, hold the line, kick the
 * rudder..."), flown by the person paced pilot (personpilot.js) on the
 * Extra 330 in Manual from level at 22 m/s, 150 m up. The sweep
 * (scripts/figures-plant-sweep.js) flies the unproven ones and the
 * manoeuvre table (scripts/figures-table.js) every one with a program.
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

import { loadSim } from './simmod.js';
import { must, EXTRA_AIRFRAME, CAP_AIRFRAME, SLICK_AIRFRAME, hangSticks, personLoop } from './wingpilot.js';
import { clamp, quant, eyes, PERSON } from './personpilot.js';
import { FigureDetector, ROLL_STOP } from '../../src/game/figuredetect.js';
import { SURFACES, tierBlock, tierThrowsDeg, tierPoints, pointsInertia } from '../../configs/surfaces.js';
import { addonParams } from '../../configs/hangar-parts.js';
import { SEAT_GATES, wingSeat } from '../../scripts/lib/propcurve.js';

const MS = 2;
/* The hand moves every 50 ms, twice PERSON's ten a second: the figures'
 * gains and let go leads below were measured at this pace. */
export const EVERY = 50;
const H = EVERY / 1000;
const PI = Math.PI;

function see(s) {
  const [w, x, y, z] = [s[7], s[8], s[9], s[10]];
  return {
    s, nz: 2 * (x * z - w * y), lz: 2 * (y * z + w * x), uz: 1 - 2 * (x * x + y * y),
    p: s[11], q: s[12], r: s[13], v: Math.hypot(s[4], s[5], s[6]), vz: s[6], z: s[3],
    along: (s[4] * (1 - 2 * (y * y + z * z)) + s[5] * 2 * (x * y + w * z) + s[6] * 2 * (x * z - w * y)),
  };
}

/* ---- The pilot's phases. Each gets the seen state and its own memory,
 * and returns [roll, pitch, yaw, throttle] and whether it is done. ---- */

/*
 * The throttles a person sets for the aircraft flown, on the pack fly()
 * seats (4.1 V a cell, the gates'). level: the throttle that holds the
 * launch's 22 m/s level, the height held on the elevator, measured on the
 * plant (scripts/figures-margins.js levelThrottle, pinned here and checked
 * there). The programs flew 0.75 on every aircraft until 2026-10-12: on
 * the old plant that held the Extra at 22.7 m/s, on the seated pack 27.7.
 * The Slick has no pack to seat (an engine, docs/SLICK-STAGE1.md), and
 * keeps the 0.75 its programs were flown at, which holds its engine at
 * 41.7 m/s: at the 0.158 that holds 22, its 0.55 pulls take the wing to
 * 15.3 deg of alpha against its 10.9 deg stall (CL max over the wing's
 * slope, npm run slick:derive) and the loop, the Immelmann, the humpty and
 * the knife edge are lost, a refit of its own. hover: the stick that
 * hangs the weight on the prop standing, the hover's derivation (the
 * Extra's wingSeat hoverStick, the E6 gate's; the CAP's C6 and the
 * Slick's S6 derived throttles). harrier: the throttle the harrier's
 * derivation levels it at (the Extra's 0.408 from extra:derive, as
 * extra-gates.js starts E11; the CAP's C11 and the Slick's S11
 * dutyDerived).
 */
const thresholds = (name) => JSON.parse(readFileSync(new URL(`../${name}-thresholds.json`, import.meta.url), 'utf8'));
const CAP_TH = thresholds('cap580');
const SLICK_TH = thresholds('slick');
export const LEVEL_THROTTLE = { [EXTRA_AIRFRAME]: 0.563, [CAP_AIRFRAME]: 0.507 };
export const SEATED = {
  [EXTRA_AIRFRAME]: { level: LEVEL_THROTTLE[EXTRA_AIRFRAME], hover: wingSeat('FW_EXTRA3D1308').hoverStick(SEAT_GATES), harrier: 0.408 },
  [CAP_AIRFRAME]: { level: LEVEL_THROTTLE[CAP_AIRFRAME], hover: CAP_TH.c6_hover.derived, harrier: CAP_TH.c11_harrier.dutyDerived },
  [SLICK_AIRFRAME]: { level: 0.75, hover: SLICK_TH.s6_hover.derived, harrier: SLICK_TH.s11_harrier.dutyDerived },
};

/* A phase's throttle: a stick, or the name of one SEATED sets for the
 * aircraft flown. */
const thrOf = (thr, m) => (typeof thr === 'string' ? m.flight.seat[thr] : thr);
/* Wings level and the nose on the horizon, upright or inverted. */
const levelSticks = (d, thr) => [
  quant(clamp(-0.4 * d.lz * Math.sign(d.uz || 1) - 0.04 * d.p, 0.4)),
  quant(clamp(Math.sign(d.uz || 1) * (-1.2 * d.nz) + 0.12 * d.q + (d.uz > 0 ? 0.04 : -0.08), 0.4)),
  0, thr,
];
const level = (ms, thr = 'level') => ({ name: `level ${ms}`, step: (d, m) => [levelSticks(d, thrOf(thr, m)), m.t >= ms] });
/* Elevator held until the nose has turned `rad` (seen), let go early; the
 * throttle a stick or the name of one SEATED sets. */
const pull = (stick, rad, thr = 1) => ({
  name: `pull ${stick} ${(rad / PI).toFixed(2)}pi`,
  step: (d, m) => {
    m.turned = (m.turned ?? 0) + Math.abs(d.q) * H;
    return [[0, stick, 0, thrOf(thr, m)], m.turned > rad - Math.abs(d.q) * 0.25];
  },
});
/* A part loop flown round: "the pull or push half-loop must also be of
 * (not necessarily similar) constant radius" (British Aerobatic
 * Association, judging, "Humpty Bumps",
 * https://www.aerobatics.org.uk/judging/topics/humpty-bumps), as
 * figures-plant-check.js flies its loop: the entry stick sets the size,
 * and once the nose has come 30 deg round the person flies the pitch rate
 * V / R that keeps that radius as the speed changes, on its LOOP_GAINS
 * (kp 0.1, ki 0.2). Let go early as pull() does. */
const round = (entry, rad, thr) => ({
  name: `round ${entry} ${(rad / PI).toFixed(2)}pi`,
  step: (d, m) => {
    const sense = Math.sign(entry);
    const w = -sense * d.q;
    m.turned = (m.turned ?? 0) + Math.abs(d.q) * H;
    if (m.R === undefined && m.turned > 0.5) m.R = d.v / Math.max(0.5, w);
    let stick = entry;
    if (m.R !== undefined) {
      const err = d.v / m.R - w;
      m.i = clamp((m.i ?? 0) + 0.2 * err * H, 0.5);
      stick = clamp(entry + sense * (0.1 * err + m.i));
    }
    return [[0, quant(stick), 0, thr], m.turned > rad - Math.abs(d.q) * 0.25];
  },
});
/* Ailerons held until the wings have turned `rad`, let go `lead` s of
 * the roll rate early. */
const roll = (stick, rad, thr = 'level', pitch = 0, push = true, lead = 0.35) => ({
  name: `roll ${stick} ${(rad / PI).toFixed(2)}pi`,
  step: (d, m) => {
    m.turned = (m.turned ?? 0) + Math.abs(d.p) * H;
    return [[stick, pitch + (push && d.uz < -0.3 ? -0.12 : 0), Math.abs(d.lz) > 0.5 ? quant(-0.6 * d.lz) : 0, thrOf(thr, m)], m.turned > rad - Math.abs(d.p) * lead];
  },
});
/* A slow roll: "The rate of roll must be constant" (British Aerobatic
 * Association, judging, "Slow Rolls",
 * https://www.aerobatics.org.uk/judging/topics/slow-rolls). A fixed 0.15
 * of stick rolled the Extra at 2 rad/s wings level and under the judge's
 * 1.2 through the knife edges, where the top rudder's yaw rolls against
 * it, so the roll came apart in two. The person holds the rate they see
 * on the aileron instead: kp of stick per rad/s of the rate's error and
 * the hand settling on what holds it (ki per second). The rate is the
 * person's, 1.7 rad/s, a turn in 3.7 s, over the judge's 3 s and its 1.2
 * with room. Gains measured 2026-10-12 over kp 0 to 0.06 and ki 0.05 to
 * 0.4 on the Extra, CAP and Slick: kp 0.03, ki 0.2 named the slow roll
 * on all three (8, 8, 8.5); ki 0.05 lost it on the Slick. */
const rateRoll = (rate, rad, thr = 0.9) => ({
  name: `rate roll ${rate} ${(rad / PI).toFixed(2)}pi`,
  step: (d, m) => {
    m.turned = (m.turned ?? 0) + d.p * H;
    const err = rate - d.p;
    m.i = clamp((m.i ?? 0.15) + 0.2 * err * H);
    const ail = quant(clamp(m.i + 0.03 * err));
    return [[ail, d.uz < -0.3 ? -0.12 : 0, Math.abs(d.lz) > 0.5 ? quant(-0.6 * d.lz) : 0, thr], m.turned > rad - Math.abs(d.p) * 0.35];
  },
});
/* The gains a line is held with: the nose's error to a rate (kp, 1/s) and
 * the rate's error to the stick (kr, s), figures-plant-check.js's. With
 * this pilot's 0.2 s lag a rate gain of 0.5 rang on every plant (the
 * Extra's vertical weaved 0.24 rms in its up component, 2026-10-11), and
 * on the prop curves (562dc785e, the elevator in a stronger slipstream)
 * 0.3 rings too: the hammerhead's up line went stop to stop on the
 * elevator, the wings flipping through 170 deg. kr 0.2 was the calmest
 * at every kp from 1 to 4 there (0.11 rms at kp 4), measured 2026-10-12. */
export const LINE_GAINS = { kp: 4, kr: 0.2 };
/* A person holding a line also settles their hand on what holds it: the
 * proportional hold alone left the Extra's nose 8 deg past the vertical
 * as it slowed on the prop curves. ki per second on the stick the hold
 * asks for, figures-plant-check.js's; each line starts its own. */
const LINE_KI = 1;
/* The elevator's share of the line hold kept at a measured gain margin
 * (scripts/figures-margins.js): the pitch rate a unit of elevator buys
 * grows with the slipstream and the airspeed, K = a + b throttle + c V^2
 * rad/s per stick on the Extra (fitted to its 84 measured steps, the
 * plant at most 25 % over the fit; re-fitted 2026-10-12 on the gates'
 * 4.1 V seat and the measured wash speed, w36-physics, from 1.738 + 1.89
 * thr + 0.0026 V^2 on the seat alone and 1.637 + 1.563 thr + 0.00281 V^2
 * before it), and the rate gain is LINE_GM / K. LINE_GM is the largest,
 * to a hundredth, that keeps the 6 dB of the bandwidth criterion on the
 * elevator's measured frequency response, level at a third, two thirds
 * and full throttle (6.1, 6.7 and 7.9 dB; 0.40 keeps 5.9 at a third; it
 * was 0.40 on the seat alone and 0.36 on the unseated pack): the step
 * reads the gain a quarter low at the loop's 180 deg frequency, 11 to
 * 12.5 rad/s. LINE_GAINS' fixed 0.2 keeps 3.2 and 0 dB at a third and
 * two thirds, and at full throttle none (-2.6 dB): the humpty's up line
 * went stop to stop on the
 * elevator and snapped the wing. The rudder's is LINE_YAW_KR, below. */
export const LINE_PITCH_K = { a: 1.695, b: 1.782, c: 0.00274 };
export const LINE_GM = 0.39;
export const lineKr = (thr, v) => LINE_GM / (LINE_PITCH_K.a + LINE_PITCH_K.b * thr + LINE_PITCH_K.c * v * v);
/* The rudder's share of the line hold, kept at the bandwidth criterion's
 * 6 dB on each aircraft's measured frequency response where the lines
 * are flown (scripts/figures-margins.js lineRudder): [speed m/s, kr] by
 * speed, straight between, held past the ends. Its response is not a
 * gain (it rises to the loop's 180 deg frequency, 12 to 16 rad/s on the
 * Extra; its step response turns over with the airspeed, the fin
 * weathervaning the yaw back within the 0.25 s, so a step fit like the
 * elevator's has nothing to fit), and up the vertical, up the 45 and
 * level it varies with the speed more than with the line (the Extra 0.07
 * to 0.09 at 14 m/s, 0.057 to 0.066 at 22), so kr goes by the speed and
 * each speed takes the least of its lines. Measured 2026-10-12 on the
 * combined plant (w36-physics); the diving lines settle (idle holds
 * them) only at 30 m/s on the Extra. LINE_GAINS' 0.2, flown until then,
 * kept -1.9 to -5 dB on the Extra (its yaw rang at 1.2 rad/s rms over
 * the lines of seven figures, the Cuban 8's 45s at 29 m/s worst), 1.4 to
 * 5.7 on the CAP and about 3 on the Slick at the speeds they fly level;
 * on these the Extra's rings at 0.5. Pinned here and checked there. */
export const LINE_YAW_KR = {
  [EXTRA_AIRFRAME]: [[8, 0.097], [14, 0.07], [18, 0.062], [22, 0.057], [26, 0.058], [30, 0.059]],
  [CAP_AIRFRAME]: [[8, 0.264], [14, 0.161], [18, 0.138], [22, 0.117], [26, 0.105], [30, 0.098]],
  [SLICK_AIRFRAME]: [[8, 0.472], [14, 0.327], [18, 0.243], [22, 0.214], [26, 0.179], [30, 0.156]],
};
export function lineYawKr(airframe, v) {
  const t = LINE_YAW_KR[airframe];
  if (v <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i += 1) {
    if (v <= t[i][0]) return t[i - 1][1] + (v - t[i - 1][0]) / (t[i][0] - t[i - 1][0]) * (t[i][1] - t[i - 1][1]);
  }
  return t[t.length - 1][1];
}
const holdLine = (d, m, target, thr) => {
  const [r] = hangSticks(d.s, { target, rollStick: 0, ...LINE_GAINS });
  const y = hangSticks(d.s, { target, rollStick: 0, kp: LINE_GAINS.kp, kr: lineYawKr(m.flight.airframe, d.v) })[2];
  const p = hangSticks(d.s, { target, rollStick: 0, kp: LINE_GAINS.kp, kr: lineKr(thr, d.v) })[1];
  m.trimP = clamp((m.trimP ?? 0) + LINE_KI * p * H, 0.5);
  m.trimY = clamp((m.trimY ?? 0) + LINE_KI * y * H, 0.5);
  return [quant(r), quant(clamp(p + m.trimP)), quant(clamp(y + m.trimY)), thr];
};
/* The nose held on a world direction (a vertical or a 45 line). */
const line = (target, ms, thr = 1, until = null) => ({
  name: `line ${target.map((x) => x.toFixed(2))}`,
  step: (d, m) => [holdLine(d, m, target, thr), m.t >= ms || (until && until(d))],
});
const UP = [0, 0, 1];
const DOWN = [0, 0, -1];
/* Point rolls: n stops in a full roll, each held a beat. The person
 * counts the roll they see all the way, the run on past each let go
 * included (figures-plant-check.js's points): counting only while the
 * stick was in lost what each hold carried, and once the prop curves
 * (562dc785e) rolled the Extra at 5.1 rad/s at half stick, the 2-point
 * roll's 0.6 s lead let go at 36 deg and stopped at 105, still rolling
 * at 0.4 rad/s, not on its back: the judge saw no point and named an
 * aileron roll. POINT_LEAD is taken from roll() above (and
 * figures-plant-check.js's aileron roll), one person's one anticipation,
 * not measured for points. The roll measured carrying 68 deg after a
 * 5.1 rad/s let go, 0.23 s (the person's 0.2 s unseen, half a 50 ms beat,
 * the Extra's own 0.03 s run on, 2026-10-12), but a 0.25 s lead lands the
 * Extra's first 4-point stop at 102 deg, where the top rudder keeps 0.4
 * to 0.5 rad/s of roll on, over the judge's stop, and the figure is lost:
 * the hold has no aileron, a gap of the hold, not of the lead. */
const POINT_LEAD = 0.35;
/*
 * The point's stop (FAI/CIVA Sporting Code Section 6 Part 1, B.9.26.2 and
 * B.9.26.3: the rotation stops at regular intervals, each pause clearly
 * recognizable and of identical duration; B.9.25.3: "The wings must stop
 * precisely after the desired degree of rotation"). Let go at the mark,
 * the roll's own damping slows it; once the person sees it stopped (the
 * judge's own stop, figuredetect.js ROLL_STOP, 0.35 rad/s) they hold the
 * point's bank on the ailerons, a loop at PERSON's pace on the roll they
 * count: before, the hold had no aileron, the roll ran on through a stop
 * (the knife edge's top rudder keeps 0.4 to 0.5 rad/s on) and the judge
 * saw 4 or 5 of an 8-point roll's 7 pauses. POINT_STOP is each
 * aircraft's crossover and plant gain from scripts/figures-margins.js
 * pointStop, the bandwidth criterion's 45 deg and 6 dB kept at every
 * point's bank, at the level pass; proportional, no trim's integral: a
 * point is held under half a second, where a trim cornered at a quarter
 * of the crossover settles nothing and costs 14 deg of phase. Pinned
 * here and checked there.
 *
 * POINT_HOLD_MS, every stop's length, identical (B.9.26.3); no source
 * gives one. FITTED from the judge's recognition: a pause is seen from
 * 100 ms stopped (figuredetect.js PAUSE_MIN_MS) and the roll is one roll
 * while a pause lasts under 800 ms (ROLL_BRIDGE_MS). Swept 2026-10-12
 * over 200 to 700 ms on the 2- and 8-point rolls on all three and
 * figures-plant-check.js's 4-point roll: 400, 450 and 500 name the 2-
 * and 8-point rolls on all three (the 8-point 3.5 / 0.5 / 2, 4 / 0.5 /
 * 3, 4 / 0.5 / 2.5); at 450 the Extra's clean 4-point grades 6, no
 * better than its sagging one, and its gate fails; 400, the points'
 * hold before, keeps all three. 300 and 350 lose the Extra's 8-point,
 * 200 its 2-point, 550 and over the Slick's 8-point.
 */
export const POINT_STOP = {
  [EXTRA_AIRFRAME]: { wc: 2.8, gain: 9.353 },
  [CAP_AIRFRAME]: { wc: 2.8, gain: 5.198 },
  [SLICK_AIRFRAME]: { wc: 2.6, gain: 5.191 },
};
export const POINT_HOLD_MS = 400;
/* The point's stop as the person flies it: e is the roll still to go to
 * the point (rad, in the roll's own sense) on the roll the person counts,
 * the judge's own measure (figuredetect.js marks each stop on the roll's
 * running total, not the bank: on the bank seen, the 8-point roll's stops
 * after the half came out 10 to 40 deg short on the judge's count); call
 * every look (EVERY) with the memory of this point and the phase's clock.
 * Returns the aileron, in the roll's own sense. */
export function pointStop(mem, airframe, seenP, e, t) {
  if (Math.abs(seenP) < ROLL_STOP) mem.engaged = true;
  if (mem.ail === undefined || t % PERSON.everyMs === 0) {
    const { wc, gain } = POINT_STOP[airframe];
    mem.ail = mem.engaged ? quant(clamp((wc / gain) * e)) : 0;
  }
  return mem.ail;
}
const points = (n, stick = 0.5) => ({
  name: `${n} points`,
  step: (d, m) => {
    m.q = m.q ?? 0;
    m.turned = (m.turned ?? 0) + Math.sign(stick) * d.p * H;
    if (m.stop) {
      m.stop.held += EVERY;
      const ail = Math.sign(stick) * pointStop(m.stop, m.flight.airframe, d.p, m.q * 2 * PI / n - m.turned, m.t);
      if (m.stop.held >= POINT_HOLD_MS) m.stop = null;
      return [[ail, d.uz < -0.5 ? -0.15 : d.uz > 0.5 ? 0.05 : 0, Math.abs(d.lz) > 0.5 ? quant(-0.6 * d.lz) : 0, m.flight.seat.level], false];
    }
    if (m.turned > (m.q + 1) * 2 * PI / n - Math.abs(d.p) * POINT_LEAD) {
      m.q += 1;
      if (m.q < n) m.stop = { held: 0 };
    }
    return [[stick, 0.05, 0, m.flight.seat.level], m.q >= n];
  },
});
/*
 * A knife edge as a person flies one, three loops through the eyes and
 * the hand at PERSON's pace (a look every 100 ms, whose 0.25 s of delay
 * and hold crossoverFor designs to): the bank held at 90 deg on the
 * ailerons, the nose's elevation on the rudder (top rudder, the sideslip
 * that holds the height), the heading on the elevator, full throttle.
 * The elevation the rudder holds is itself set by the climb rate the
 * person sees, an outer loop a quarter as fast (PERSON.outer), whose
 * plant is g over the elevation that holds a level knife edge: a radian
 * more of it climbs at that rate per second. Each loop is personLoop's,
 * at the crossover and plant gain scripts/figures-margins.js measures on
 * the Extra in a level knife edge at full throttle (crossoverFor, the
 * bandwidth criterion's 45 deg and 6 dB), pinned here and checked there,
 * with the margins each keeps. The rudder and elevation start trimmed
 * where that knife edge settles, as a person puts the top rudder in as
 * they roll to it. The fixed top rudder it flew before (-0.6, no aileron)
 * rolled the Extra on through the knife edge at up to 0.87 rad/s, onto
 * its back in 2 s.
 */
export const KNIFE = {
  bank: { wc: 2, gain: 13.785 },
  elevation: { wc: 0.8, gain: 1.064 },
  heading: { wc: 2, gain: 6.039 },
  trim: { rudder: 0.38, elevation: 0.188, speed: 32.9 },
};
const G = 9.80665;
const knife = (ms) => ({
  name: `knife ${ms}`,
  step: (d, m) => {
    const [w, x, y, z] = [d.s[7], d.s[8], d.s[9], d.s[10]];
    const psi = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
    if (!m.bank) {
      m.side = Math.sign(d.lz) || 1;
      m.psi0 = psi;
      m.bank = personLoop(KNIFE.bank.wc, KNIFE.bank.gain);
      m.elevation = personLoop(KNIFE.elevation.wc, KNIFE.elevation.gain, { u0: KNIFE.trim.rudder });
      m.heading = personLoop(KNIFE.heading.wc, KNIFE.heading.gain);
      m.climb = personLoop(KNIFE.elevation.wc * PERSON.outer, G / KNIFE.trim.elevation, { min: -0.5, max: 0.8, u0: KNIFE.trim.elevation });
    }
    const done = m.t >= ms;
    if (m.sticks && m.t % PERSON.everyMs !== 0) return [m.sticks, done];
    let dpsi = m.psi0 - psi;
    if (dpsi > PI) dpsi -= 2 * PI;
    if (dpsi < -PI) dpsi += 2 * PI;
    const want = m.climb.step(-d.vz);
    m.sticks = [
      quant(m.bank.step(m.side * PI / 2 - Math.atan2(d.lz, d.uz))),
      quant(-m.side * m.heading.step(dpsi)),
      quant(-m.side * m.elevation.step(want - Math.asin(clamp(d.nz)))),
      1,
    ];
    m.flight.knife = m.sticks;
    return [m.sticks, done];
  },
});
/*
 * A knife-edge loop: a loop flown on its knife edge, the rudder pulling
 * the nose round and the wings square to the loop's plane. The person
 * enters from the knife edge above, whose sticks are where they start:
 * the ailerons hold the bank (the wing square to the plane) and the
 * elevator the plane (the nose in it), on the knife edge's own two loops
 * (KNIFE.bank, KNIFE.heading), the rudder the path round the loop, full
 * throttle throughout.
 *
 * The rudder flies the path's angle round the loop onto a mark the
 * person moves on at V / R, R set at the entry speed by the loop's pace
 * (rate, rad/s): a constant radius as the speed changes ("the radius
 * kept constant", BAeA judging, "Loops and Part Loops"), as round()
 * does for an inside loop. The mark is brought up to pace over rampS,
 * the rudder fed in as a person does, not stepped. Its loop is
 * personLoop's on the rudder's measured response in the level knife
 * edge, read as the path's angle (scripts/figures-margins.js: crossoverFor
 * puts it at 1.6 rad/s on a plant gain of 0.971), flown at half that
 * crossover: the CAP's side force per rudder near the stop is about
 * twice its slope at the knife edge's trim (0.4, 1.2 and 2.8 g at half,
 * three quarters and full rudder, launched at 25 m/s at full throttle,
 * against the Extra's 1.1, 2.0 and 2.7; 2026-10-12, the side force 0.4
 * to 0.7 s after the step), and the loop flown at the trim's crossover
 * rang on it at 3 rad/s, the rudder from the stop to 0.46 and back. On
 * top the person asks the rudder the turn needs as a share of the knife
 * edge's: the side force toward the loop's centre (V^2 / R and the
 * weight's share) in g, times the rudder that held the 1 g knife edge
 * (ff of it), the rest the loop's.
 *
 * rate, rateMin, rampS and ff are FITTED, swept 2026-10-12 on all three
 * from the level entry: rate 0.45 to 0.55, rateMin none, 0.4 and 0.45,
 * ff 0.4 to 0.7, rampS 1 and 2. With rateMin 0.4 and rampS 2, ff 0.4 and
 * 0.55 named it on all three at every rate; ff 0.7 lost the CAP (its
 * rudder overshot and the path's rate fell under the detector's arc),
 * rampS 1 lost the CAP in 8 of the 9, rateMin 0.45 took the Slick
 * to 0 to 3. The floor was over the top, where the speed is lowest: at
 * V / R alone the path turned 0.3 rad/s there, a breath over the
 * detector's arc (ARC_OFF 0.25), and one dip took the loop apart.
 * Swept again over the same 54 on the gates' 4.1 V seat (w36-seat-voltage,
 * 2026-10-12): with no floor and rampS 2, ff 0.4 and 0.55 name it on all
 * three at every rate (Extra, CAP and Slick 9 / 8 / 5 at these values);
 * with the floor at 0.4, ff 0.4 gives the Slick 0 at every rate and ff
 * 0.55 names it 9 / 8 / 3; ff 0.7 loses the CAP at every rate either
 * way, rampS 1 loses it in 23 of the 27, and the floor at 0.45
 * gives the Slick 0 at ff 0.4 and 0.55. So no floor (rateMin 0). No
 * margin is measured for the pace, the share or the floor. Swept again
 * over the same 54 on the combined plant (w36-physics, 2026-10-12): no
 * floor, rampS 2 and ff 0.4 or 0.55 name it on all three at every rate
 * (10 / 8 / 6 at these values); ff 0.7 loses the CAP in 14 of 18 and
 * rampS 1 at ff 0.55 in 4 of 9; the floor at 0.45 gives the Slick 0 to 2. The gains are
 * not scheduled on the speed (20 to 38 m/s round the loop): scaled by
 * the entry speed over V it lost the CAP and the Slick, by its square
 * it spun the CAP off at 4 m/s; the knife edge's loops keep 9 dB, past
 * the 1.3 dB that 38 m/s over their 32.9 adds. With the
 * throttle cut over the top (to 0.2 or 0.5, from 0.9 or 1.1 of a half
 * turn) the Extra did not finish the loop and reached the ground in all
 * four. It lets go 0.3 s of the path's rate early.
 */
export const KNIFE_LOOP = { path: { wc: 0.8, gain: 0.958 }, rate: 0.5, rateMin: 0, rampS: 2, ff: 0.55 };
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const knifeLoop = () => ({
  name: 'knife loop',
  step: (d, m) => {
    const [w, x, y, z] = [d.s[7], d.s[8], d.s[9], d.s[10]];
    const n = [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)];
    const l = [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)];
    const u = [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)];
    const v = [d.s[4] / d.v, d.s[5] / d.v, d.s[6] / d.v];
    if (!m.normal) {
      /* The loop's plane is the vertical one along the path, its normal
       * the wings' up as the knife edge holds it, and its centre on the
       * top wing's side. */
      const [ail, ele, rud] = m.flight.knife;
      m.side = Math.sign(l[2]) || 1;
      const hu = Math.hypot(u[0], u[1]);
      const hv = Math.hypot(v[0], v[1]);
      m.normal = [u[0] / hu, u[1] / hu, 0];
      m.along = [v[0] / hv, v[1] / hv, 0];
      m.R = d.v / KNIFE_LOOP.rate;
      m.rudder = -m.side * rud;
      m.bank = personLoop(KNIFE.bank.wc, KNIFE.bank.gain, { u0: ail });
      m.plane = personLoop(KNIFE.heading.wc, KNIFE.heading.gain, { u0: -ele });
      m.path = personLoop(KNIFE_LOOP.path.wc, KNIFE_LOOP.path.gain, { u0: m.rudder * (1 - KNIFE_LOOP.ff) });
      m.was = Math.atan2(v[2], dot3(v, m.along));
      m.turned = 0;
      m.mark = 0;
    }
    const at = Math.atan2(v[2], dot3(v, m.along));
    let step = at - m.was;
    if (step > PI) step -= 2 * PI;
    if (step < -PI) step += 2 * PI;
    m.was = at;
    m.turned += step;
    const done = m.turned > 2 * PI - 0.3 * d.v / m.R;
    if (m.sticks && m.t % PERSON.everyMs !== 0) return [m.sticks, done];
    const pace = Math.max(KNIFE_LOOP.rateMin, d.v / m.R) * Math.min(1, m.t / 1000 / KNIFE_LOOP.rampS);
    m.mark = Math.min(2 * PI, m.mark + pace * PERSON.everyMs / 1000);
    const g = (d.v * pace + G * m.side * l[2]) / G;
    const rud = clamp(KNIFE_LOOP.ff * m.rudder * g + m.path.step(m.mark - m.turned));
    m.sticks = [
      quant(m.bank.step(-Math.atan2(dot3(l, m.normal), dot3(u, m.normal)))),
      quant(-m.plane.step(dot3(n, m.normal))),
      quant(-m.side * rud),
      1,
    ];
    return [m.sticks, done];
  },
});
/*
 * A rolling circle: a 360 deg turn rolled continuously. "The rate of roll
 * must be constant", "The rate of change of direction throughout the turn
 * should be constant", "CGT should be horizontal, with constant
 * altitude" (British Aerobatic Association, judging, "Rolling Circles",
 * https://www.aerobatics.org.uk/judging/topics/rolling-turns-1). The
 * ailerons hold the slow roll's rate (rateRoll's law, 1.6 rad/s), the
 * turn's rate is that over the rolls asked, and the person puts the
 * force the circle needs, toward its centre and up against the weight,
 * on whichever surface faces it as the wings come round: the elevator
 * for the share along the wings' up, the rudder (the sideslip, as in a
 * knife edge) for the share along the span. A g on the elevator is
 * 1/ELEVATOR_G of stick, measured on the Extra level at full throttle
 * (12.2, 13.3 and 14.4 g per unit stick at 20, 24 and 28 m/s, the
 * normal acceleration 0.3 to 0.6 s after a twentieth or a tenth of
 * elevator, 2026-10-12), a g on the rudder the knife edge's trim rudder
 * (KNIFE.trim) scaled by its dynamic pressure. The person paces the turn
 * on the roll they count, a turn of heading for every `rolls` of roll,
 * and lets the roll go on the last as roll() does, so the two finish
 * together, wings level on the heading; the heading's
 * lag behind that and the climb rate the person sees add to the force:
 * kpsi 1/s and kz 2/s, FITTED on a four-roll circle: swept over kpsi 0.5
 * and 1, kz 1 and 2, and the surfaces' per g taken a half under and over,
 * 6 of the 12 name it on all three and this is the only one over 6 on
 * each (Extra 6.5, CAP 8, Slick 9.5). No margin is measured for these
 * loops.
 */
const ELEVATOR_G = (v) => 12.16 + 0.286 * (v - 20);
const rollingCircle = (rolls, rate = 1.6) => ({
  name: `rolling circle ${rolls}`,
  step: (d, m) => {
    const [w, x, y, z] = [d.s[7], d.s[8], d.s[9], d.s[10]];
    const hv = Math.hypot(d.s[4], d.s[5]);
    const track = Math.atan2(d.s[5], d.s[4]);
    m.prev = m.prev ?? track;
    let step = track - m.prev;
    if (step > PI) step -= 2 * PI;
    if (step < -PI) step += 2 * PI;
    m.turned = (m.turned ?? 0) + step;
    m.prev = track;
    m.rolled = (m.rolled ?? 0) + d.p * H;
    const omega = rate / rolls;
    const toCentre = d.v * (omega + (m.rolled / rolls - m.turned));
    const a = [toCentre * -d.s[5] / hv, toCentre * d.s[4] / hv, G - 2 * d.vz];
    const up = [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)];
    const span = [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)];
    const gUp = (a[0] * up[0] + a[1] * up[1] + a[2] * up[2]) / G;
    const gSpan = (a[0] * span[0] + a[1] * span[1] + a[2] * span[2]) / G;
    const err = rate - d.p;
    m.i = clamp((m.i ?? 0.15) + 0.2 * err * H);
    const q = (KNIFE.trim.speed / Math.max(10, d.v)) ** 2;
    return [[quant(clamp(m.i + 0.03 * err)), quant(clamp(gUp / ELEVATOR_G(d.v))), quant(clamp(-gSpan * KNIFE.trim.rudder * q)), 1],
      m.rolled > rolls * 2 * PI - Math.abs(d.p) * 0.35];
  },
});
/*
 * The hover as a person flies one ("the tail, elevator and rudder will
 * keep the plane in a perfect vertical position", "Throttle needs to be
 * adjusted so that the plane stays in one position; no climbing or going
 * down", "you have to move all four channels to keep the plane precisely
 * positioned": Quique Somenzini, "The Torque Roll", Model Airplane News,
 * https://www.modelairplanenews.com/quique-somenzini-the-torque-roll/),
 * the loops through the eyes and the hand at PERSON's pace (a look every
 * 100 ms, its 0.25 s of delay and hold): the nose on the vertical by the
 * elevator and the rudder, each on its own axis of the nose's tilt; the
 * roll rate held out on the ailerons (the torque's, as a pilot learns to
 * hold it), or let go for the torque roll, with aileron only to the
 * torque's side when the rotation sags under the rate the torque alone
 * turns it at hanging still (design.torque, rad/s, right positive): "If
 * there is any wind, you will need some left aileron to keep the plane
 * rotating", "When the plane is facing into the wind, it has a tendency
 * to stop rotating" (Somenzini), the hover's own drift the wind here;
 * the climb rate on the throttle. Outer loops a quarter as fast
 * (PERSON.outer) set what the inner ones hold: the height the climb rate,
 * the drift the person sees against the ground the tilt (a radian of it
 * accelerates the hover at g), and where the hover stopped the drift. Each stops being zero once
 * the person sees the aircraft stopped (under the detector's 3 m/s).
 *
 * HOVER is each aircraft's design, scripts/figures-margins.js hoverLoops
 * on its measured response hanging still at its hover stick (SEATED),
 * pinned here and checked there: the crossover wc (rad/s), the plant gain
 * personLoop takes, and for the tilt the lead (s) the person adds. The
 * nose's tilt per stick is near a double integrator below 0.6 rad/s (its
 * phase within 30 deg of -180), and from there to 4 rad/s the plant's
 * phase stays 105 to 156 deg behind, so a person flying it on a gain, as
 * crossoverFor designs, keeps under 35 deg at every crossover: on such an
 * element the person adds lead, flying the tilt and its rate together
 * (McRuer and Jex 1967; McRuer and Krendel, AGARDograph 188, 1974, the
 * crossover model's pilot on an acceleration element, Kp s e^-tau s). The
 * seen rate is the body rate the eyes read off two looks. The roll rate
 * and the climb rate are rate plants, flown on a gain as crossoverFor
 * designs them. A loop whose design cannot keep the bandwidth criterion
 * flies the best there is at a 45 deg phase margin and says so (short),
 * and blocks the figures flown on it (scripts/figures-table.js).
 */
export const HOVER = {
  [EXTRA_AIRFRAME]: {
    pitch: { wc: 2, gain: 2.086, lead: 0.15 }, yaw: { wc: 2.8, gain: 2.125, lead: 0.15 }, roll: { wc: 2.4, gain: 7.637 }, climb: { wc: 1.8, gain: 34.936 }, torque: -3.31,
  },
  [CAP_AIRFRAME]: {
    pitch: { wc: 2.2, gain: 1.701, lead: 0.25 }, yaw: { wc: 1.4, gain: 0.665, lead: 0.2 }, roll: { wc: 2.8, gain: 8.481 }, climb: { wc: 1.8, gain: 33.323 }, torque: -3.29,
  },
  [SLICK_AIRFRAME]: {
    pitch: { wc: 2.4, gain: 1.636, lead: 0.3 }, yaw: { wc: 2.2, gain: 0.893, lead: 0.35 }, roll: { wc: 2.8, gain: 2.403 }, climb: { wc: 0.8, gain: 22.671 }, torque: -2.26,
  },
};
/* The drift's tilt and the height's climb rate a person asks for at most:
 * 0.25 rad (14 deg, a point's band off the vertical on the judge's
 * hoverDeduction) and 2 m/s (under the 3 m/s that ends the hover). */
const HOVER_TILT = 0.25;
const HOVER_CLIMB = 2;
const HOVER_STOP = 3;
const bodyTilt = (s, target) => {
  const [w, x, y, z] = [s[7], s[8], s[9], s[10]];
  const nose = [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)];
  const c = [nose[1] * target[2] - nose[2] * target[1], nose[2] * target[0] - nose[0] * target[2], nose[0] * target[1] - nose[1] * target[0]];
  return [
    2 * (x * y - w * z) * c[0] + (1 - 2 * (x * x + z * z)) * c[1] + 2 * (y * z + w * x) * c[2],
    2 * (x * z + w * y) * c[0] + 2 * (y * z - w * x) * c[1] + (1 - 2 * (x * x + y * y)) * c[2],
  ];
};
/* The hover's law on the seen state s, stepped every PERSON.everyMs:
 * returns [roll, pitch, yaw, throttle], unquantised (the hand's fiftieths
 * are the phase's). The nose's tilt about the body pitch axis (rising
 * with up elevator) and the yaw axis (rising with right rudder), seen
 * with its rate (the body rates -q and -r, the tilts' own rates at the
 * vertical). design is HOVER's;
 * hoverStick the throttle the law starts trimmed at. Its state: where the
 * hover stopped (null until it has), the time since, and letRoll. */
export function hoverLaw(design, hoverStick) {
  const outer = design.pitch.wc * PERSON.outer;
  const L = {
    pitch: personLoop(design.pitch.wc, design.pitch.gain),
    yaw: personLoop(design.yaw.wc, design.yaw.gain),
    roll: personLoop(design.roll.wc, design.roll.gain),
    spin: personLoop(design.roll.wc, design.roll.gain, design.torque < 0 ? { min: -1, max: 0 } : { min: 0, max: 1 }),
    climb: personLoop(design.climb.wc, design.climb.gain, { min: 0, max: 1, u0: hoverStick }),
    height: personLoop(design.climb.wc * PERSON.outer, 1, { min: -HOVER_CLIMB, max: HOVER_CLIMB }),
    vx: personLoop(outer, G, { min: -HOVER_TILT, max: HOVER_TILT }),
    vy: personLoop(outer, G, { min: -HOVER_TILT, max: HOVER_TILT }),
    x: personLoop(outer * PERSON.outer, 1, { min: -HOVER_CLIMB, max: HOVER_CLIMB }),
    y: personLoop(outer * PERSON.outer, 1, { min: -HOVER_CLIMB, max: HOVER_CLIMB }),
  };
  const st = { at: null, ms: 0, letRoll: false };
  return {
    st,
    step(s) {
      if (st.at === null && Math.hypot(s[4], s[5], s[6]) < HOVER_STOP) st.at = [s[1], s[2], s[3]];
      if (st.at !== null) st.ms += PERSON.everyMs;
      const [wx, wy, wz] = st.at === null ? [0, 0, 0] : [L.x.step(st.at[0] - s[1]), L.y.step(st.at[1] - s[2]), L.height.step(st.at[2] - s[3])];
      const tx = L.vx.step(wx - s[4]);
      const ty = L.vy.step(wy - s[5]);
      const n = Math.hypot(tx, ty, 1);
      const [ep, ey] = bodyTilt(s, [tx / n, ty / n, 1 / n]);
      return [
        st.letRoll ? L.spin.step(design.torque - s[11]) : L.roll.step(-s[11]),
        L.pitch.step(-(ep - design.pitch.lead * s[12])),
        L.yaw.step(-(ey - design.yaw.lead * s[13])),
        L.climb.step(wz - s[6]),
      ];
    },
  };
}
/* Catch the hover from the vertical and hold it holdMs once stopped; for
 * the torque roll, let the ailerons go letGoMs into it, once it hangs
 * still, as E8 does (extra-gates.js): let go while it still drifts, the
 * Extra's roll sagged under 1 rad/s against the 3.3 it turns at still
 * (Somenzini's wind, above). Gives up at HOVER_GIVE_UP_MS if it never
 * stops. */
const HOVER_GIVE_UP_MS = 15000;
/* The hover is caught off an up line, a quarter loop into the vertical as
 * the tailslide is entered: the line held at the tailslide's 0.4 until the
 * speed the person sees falls under HOVER_CATCH m/s, then the hover's
 * loops take the throttle to hold it where it stops. FITTED, swept 2026-10-12 over 4
 * to 10 m/s on all three: 5 to 10 name the hover and the torque roll on
 * each (at 7, 7.5 / 8 / 8.5 and 7.5 / 8 / 7.5), 4 lets the Extra fall off
 * the line into the ground. The pull to the vertical at 0.6 of stick from
 * 14 m/s, flown before, snapped the Slick onto its back and the hover was
 * caught 15 m over the ground. */
const HOVER_CATCH = 7;
const hover = (holdMs, { letGoMs = Infinity } = {}) => ({
  name: `hover ${holdMs}`,
  step: (d, m) => {
    m.law = m.law ?? hoverLaw(HOVER[m.flight.airframe], m.flight.seat.hover);
    const done = m.law.st.ms >= holdMs || m.t >= HOVER_GIVE_UP_MS;
    if (m.sticks && m.t % PERSON.everyMs !== 0) return [m.sticks, done];
    m.law.st.letRoll = m.law.st.ms >= letGoMs;
    m.sticks = m.law.step(d.s).map((x) => quant(x));
    return [m.sticks, done];
  },
});
/* A harrier, flown as extra-gates.js's E11 flies it, by what a person
 * sees: the nose raised over 5 s to 40 deg above the horizon (on a level
 * path, the wing's 40 deg of alpha, E11's) and held there on the
 * elevator, the throttle holding the height, the wings on the ailerons
 * and the heading on the rudder, each with an integral as a hand settles
 * on a trim; E11's gains. A fixed 0.75 of elevator at 12 m/s, the
 * program's before, looped the Extra in the prop's slipstream. Inverted,
 * the same with the elevator and the heading's sense turned over. The
 * throttle starts at the aircraft's derived harrier throttle (SEATED;
 * the Extra's 0.408 on the seated pack, was 0.516). Not yet named
 * (2026-10-12): through the person's 0.2 s the height loop closes the throttle in the climb the
 * nose's rise makes, the wash goes, the wing stalls and mushes; E11
 * holds the same law at 4 ms with no delay. The 3D lane's to fly. */
const HARRIER_RAD = 40 * PI / 180;
const HARRIER_RAMP_MS = 5000;
const harrier = (ms, { inverted = false, rollStick = null } = {}) => ({
  name: `harrier ${ms}`,
  step: (d, m) => {
    const sign = inverted ? -1 : 1;
    const [w, x, y, z] = [d.s[7], d.s[8], d.s[9], d.s[10]];
    const psi = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
    m.psi0 = m.psi0 ?? psi;
    let dpsi = psi - m.psi0;
    if (dpsi > PI) dpsi -= 2 * PI;
    if (dpsi < -PI) dpsi += 2 * PI;
    const pitchErr = Math.min(HARRIER_RAD, HARRIER_RAD * m.t / HARRIER_RAMP_MS) - Math.asin(clamp(d.nz));
    m.iP = clamp((m.iP ?? 0) + 1.5 * pitchErr * H);
    const bank = Math.atan2(sign * d.lz, sign * d.uz);
    m.iB = clamp((m.iB ?? 0) - bank * H, 0.5);
    m.iT = clamp((m.iT ?? m.flight.seat.harrier) - 0.2 * d.vz * H, 1);
    const ail = rollStick ?? quant(clamp(-0.6 * bank - 0.06 * d.p + m.iB));
    const ele = quant(clamp(sign * (1.5 * pitchErr + m.iP) + 0.15 * d.q));
    const rud = quant(clamp(sign * dpsi + 0.2 * d.r));
    return [[ail, ele, rud, Math.max(0, quant(m.iT - 0.08 * d.vz))], m.t >= HARRIER_RAMP_MS + ms];
  },
});
/* Slowing down level to a speed, throttle closed, the height held on the
 * elevator as the speed bleeds (harrier-probe.js's entry, E11's): the
 * nose on the horizon alone glides the Extra at 10.7 m/s upright and
 * 13.1 inverted at idle, so a harrier's slow to 10 never ended and the
 * flight sank 180 m into the ground. The height's sink rate to the stick
 * on top of the level hold, and the hand settling on it. */
const slow = (to) => ({
  name: `slow to ${to}`,
  step: (d, m) => {
    const [r, pi, y] = levelSticks(d, 0);
    m.iV = clamp((m.iV ?? 0) - 0.05 * d.vz * H, 0.4);
    return [[r, quant(clamp(pi + Math.sign(d.uz || 1) * (m.iV - 0.04 * d.vz))), y, 0], d.v < to];
  },
});
/* Full rudder until the nose points down (a stall turn's pivot), the
 * throttle eased to 0.2: at 0.5 the slipstream's torque rolled the Extra
 * through the turn round, which a judge marks ("Is the aeroplane
 * pitching or rolling during the turn?", BAeA judging, "Stall Turns"),
 * and the pivot graded 0 to 2. Let go with the nose 49 deg below the
 * horizon, the down line's hold taking it from there. */
const kick = () => ({ name: 'kick', step: (d) => [[0, 0, -1, 0.2], d.nz < -0.75] });
/* How long the person leaves the sticks once it slides back before they
 * fly the nose down themselves: the Extra can settle falling flat at 10
 * m/s with the sticks left alone, its nose on the horizon (with the
 * elevator's line gain at a 6 dB margin, scripts/figures-margins.js, it
 * fell 180 m that way into the ground), and a person would not wait. */
const SLIDE_LET_GO_MS = 1500;
/* Throttle off, the nose held up the vertical on the elevator and rudder
 * until the aircraft slides back, then the sticks let go until it falls
 * through (a tailslide). A pilot who lets go at the stop leaves the yaw
 * rate the climb's rudder was holding against the slipstream, and the
 * nose pivots over before it slides. */
const slide = () => ({
  name: 'slide',
  step: (d, m) => {
    if (m.backAt === undefined && d.along < -1) m.backAt = m.t;
    const back = m.backAt !== undefined;
    return [back ? [0, 0, 0, 0] : holdLine(d, m, UP, 0), m.t > 600 && (d.nz < -0.3 || (back && m.t - m.backAt > SLIDE_LET_GO_MS))];
  },
});
/*
 * A waterfall as David Scott teaches it ("Master the 3D Waterfall", Model
 * Airplane News): "maintaining full up-elevator, and applying full power
 * and a little right rudder", the wings level or it "will barrel roll
 * out of this stunt", `turns` times round, then out level (Scott: "increase
 * the throttle and exit"). The right rudder (positive stick, the nose right) holds off the
 * yaw the prop's gyroscope puts on the pitch rotation: with none the
 * Extra yawed left at 1.5 rad/s through it. At full power and next to no
 * airspeed the prop's torque rolls the Extra left at 2 rad/s, so the
 * person feeds in right aileron with the power, as a torque roll is held,
 * and then keeps the wings on the ailerons (the bank they see, through
 * the attitude: dl_z/dt = p u_z).
 *
 * Scott's throttle cut "on the back side of the loop" and the "few clicks
 * of power" at the bottom are not flown: at the values below, the power
 * cut at 0.6 or 0.75 of a turn (to idle or to half, the rudder centred,
 * back at 0.9) broke the pivot at the cut, 0.8 to 0.9 of a turn, and none
 * of the four was named; nor was any of 81 cut flights over the first
 * sweep's values. Round 3 found the same from rest (the rate under 2
 * rad/s within 0.3 s; at these speeds the elevator's authority is the
 * prop's wash). A plant finding (docs/TRICKS-CATALOG.md), not a choice.
 *
 * rudder, aileron and wings are FITTED, swept 2026-10-12 on the Extra at
 * the Extreme aileron and elevator (PROGRAM_TIERS) from the 75 deg upline
 * at 4 m/s over rudder 0.1 to 0.2, aileron 0.6 to 1 and wings 0 to 2 per
 * unit of l_z, 53 flights: the waterfall was named in 26, at 3.5 to 7.
 * With the aileron at 0.8 or more and the wings at 0.75 or less, 25 of
 * 29 (one a tumble); at 0.6 of aileron none (the torque rolled it, two
 * tumbles); the wings at 1 or more, through the person's 0.2 s, rang and
 * named it once in 18. Round the values taken (rudder 0.12 to 0.18,
 * aileron 0.9 and 1, wings 0.25 to 0.75) 16 of 18, at 4 to 7, no tumble.
 * On the gates' 4.1 V seat (w36-seat-voltage, 2026-10-12), the same grid
 * of 175 entered from the level pass at the throttle that holds 22 m/s
 * (SEATED, 0.563) names it in 4 (the aileron at 1, the wings at 0 or
 * 0.25, the rudder 0.1 to 0.15, at 3.5 to 6), and none of those in more
 * than 3 of 7 entries at 0.543 to 0.583: not a fit. At these values the
 * first half turn pivots at 7 to 8 rad/s, then the pivot decays to 3 or
 * 4 rad/s and the second turn is flown as a loop at 7 m/s. The
 * waterfall's own throttle at 0.7 to 1 changes nothing; the entry does:
 * from a level pass at 0.65 the grid names it in 13 of the 175, at 0.75
 * (27.3 m/s) in 77, at these values 5.5. Lost, not refitted here.
 * On the combined plant (w36-physics, 2026-10-12) it is named in none of
 * about 1000 flights: the 175 from the level pass and from ENTRY_V and
 * 22 to 32 m/s; the rudder 0 to 1, and a yaw rate damper on it of 0.1
 * to 0.8 per rad/s; the waterfall's throttle 0.5 to 1; the elevator 0.7
 * and 1; the upline at 60, 75 and 90 deg, let go at 2, 4 and 7 m/s. The
 * same 175 from 28 m/s on the seat alone (c44822817's module) name it in
 * 87. Inverted after the first half turn at 5 to 9 m/s in the static
 * wash, the yaw runs away to the left to 7 rad/s with the rudder full
 * right, and it is named a spin: a plant finding, the wash lane's.
 * No margin is measured for these loops.
 */
export const WATERFALL = { rudder: 0.15, aileron: 1, wings: 0.5 };
const waterfall = (turns) => ({
  name: `waterfall ${turns}`,
  step: (d, m) => {
    m.turned = (m.turned ?? 0) + Math.abs(d.q) * H;
    const ail = quant(clamp(WATERFALL.aileron - WATERFALL.wings * d.lz * Math.sign(d.uz || 1)));
    return [[ail, 1, WATERFALL.rudder, 1], m.turned > turns * 2 * PI - Math.abs(d.q) * 0.25];
  },
});

/*
 * The speed a vertical figure is entered at, set on the level pass as a
 * person sets it: full throttle under it, closed over it, the wings and
 * the nose held level, until the speed they see crosses it; or ENTRY_MS,
 * where an aircraft that cannot reach it gives up and flies the figure
 * from where it is. The programs' level pass holds 22 m/s (SEATED), and
 * on the gates' 4.1 V seat and the measured wash speed (w36-physics) the
 * Extra's tailslide and the Slick's hammerhead are lost from it. ENTRY_V
 * is FITTED, swept 2026-10-12 over 22 to 34 m/s on the Extra, the CAP
 * and the Slick (tailslide, hammerhead), with the line's rudder on
 * LINE_YAW_KR: the hammerhead is named on all three at every entry (3.5
 * to 7.5), the tailslide on the CAP at every entry and on the Extra at
 * all but 22 and 28; 32, near the middle of 29 to 34, names the
 * tailslide on all three (10 / 10 / 9.5) and the hammerhead 7 / 6.5 / 7.
 * On LINE_GAINS' rudder it was 30, the middle of 28 to 32, where the
 * Slick's hammerhead was named.
 */
export const ENTRY_V = 32;
const ENTRY_MS = 15000;
const entry = (V = ENTRY_V) => ({
  name: `entry ${V}`,
  step: (d, m) => {
    m.below = m.below ?? d.v < V;
    return [levelSticks(d, m.below ? 1 : 0), (m.below ? d.v >= V : d.v <= V) || m.t >= ENTRY_MS];
  },
});
const L = (ms = 3000) => level(ms);
const D45 = [Math.SQRT1_2, 0, -Math.SQRT1_2];
const U45 = [Math.SQRT1_2, 0, Math.SQRT1_2];
const U75 = [Math.cos(75 * PI / 180), 0, Math.sin(75 * PI / 180)];
const B45 = [-Math.SQRT1_2, 0, -Math.SQRT1_2];
const B_U45 = [-Math.SQRT1_2, 0, Math.SQRT1_2];

/* The programs. The aircraft starts level at 22 m/s heading +x, 150 m up,
 * over no ground: the plant raises none unless the host does, so fly()
 * ends a flight that reaches the height it started from less 150 m and
 * calls it crashed. A program that loses that much has flown into the
 * field it would be flown over. */
export const PROGRAMS = {
  half_roll: [L(), roll(0.5, PI), level(3000)],
  double_roll: [L(), roll(0.6, 4 * PI), L()],
  slow_roll: [L(), rateRoll(1.7, 2 * PI), L()],
  two_point_roll: [L(), points(2), L()],
  /* An eighth at 0.6 of stick (6.4 rad/s) passed in 0.12 s, inside the
   * 0.2 s the person has not seen: its points fell anywhere (117 to 408
   * deg). At 0.25 an eighth takes 0.3 s and the points sit 3 to 21 deg
   * short of their marks. On the combined plant (w36-physics,
   * 2026-10-12), with no aileron in the hold, the roll ran on through
   * the stops and the judge saw 4 to 6 of the 7 pauses (named on the
   * Extra only at some sticks, 0.21 to 0.27, not at 0.25). With the
   * point's stop (pointStop, POINT_STOP) every one of the 7 is seen on
   * all three and it is named 3.5 / 0.5 / 2: the points within 1 to 1.5
   * of their marks, the rate between them steady (0 to 1 point), the
   * path off its line (3 to 4.5) and the roll's total (2 to 3) the rest.
   * The stick is the program's 0.25, not re-fitted: B.9.26.2's constant
   * rate between the stops is what it is judged on. */
  eight_point_roll: [L(), points(8, 0.25), L()],
  barrel_roll: [L(), roll(0.35, 2 * PI, 1, 0.3, false), L()],
  outside_loop: [L(), pull(-0.55, 2 * PI), L()],
  immelmann: [L(), pull(0.55, PI), roll(0.5, PI), L()],
  split_s: [L(), roll(0.5, PI), pull(0.55, PI, 0.5), L()],
  /* The Cubans' 5/8 and 3/4 loops on the round loop's law from the
   * Extra's 0.3 (a fixed 0.55 at full throttle flew the 5/8 past its 45,
   * 0.85 of a turn swept, and its radius spread 69 %), and their half
   * rolls on the 45s let go at 0.25 s of the rate, the 0.23 s the roll
   * measured carrying (POINT_LEAD) on the beat: at 0.6 throttle down the
   * 45 the Extra rolls 5.6 rad/s and roll()'s 0.35 stopped it 25 deg
   * short. FITTED to the Cubans: swept 0.2 to 0.35, 0.25 named the half
   * Cuban highest on all three; the level rolls keep 0.35, which 0.25
   * moves (the Extra's half roll 9 to 7). The reverse Cubans' lines
   * after each roll hold the 45 they rolled on; they held the other 45,
   * 90 deg round, and the rudder fought the nose there. On the combined
   * plant (w36-physics, 2026-10-12) the Cuban 8 grades 0 on the Extra at
   * every lead 0.2 to 0.35, line throttle 0.5 to 0.7 and entry from the
   * level pass or 24 to 30 m/s but two (3.5): its 3/4 loop's radius
   * spreads 65 % (6 points) as the yaw rings on the 45 before it, the
   * rudder on LINE_GAINS' 0.2. On LINE_YAW_KR it is named 3 / 3.5 / 2,
   * and the lead swept again over 0.2 to 0.35 names the half Cuban
   * highest at 0.25 and 0.3 (7 / 6.5 / 6.5 and 6.5 / 7 / 6.5): 0.25
   * kept. */
  half_cuban: [L(), round(0.3, 1.25 * PI, 0.6), line(B45, 800, 0.6), roll(0.5, PI, 0.6, 0, true, 0.25), line(B45, 800, 0.6), pull(0.55, 0.25 * PI), L()],
  cuban_8: [L(), round(0.3, 1.25 * PI, 0.6), line(B45, 800, 0.6), roll(0.5, PI, 0.6, 0, true, 0.25), line(B45, 800, 0.6),
    round(0.3, 1.5 * PI, 0.6), line(D45, 800, 0.6), roll(0.5, PI, 0.6, 0, true, 0.25), line(D45, 800, 0.6), pull(0.55, 0.25 * PI), L()],
  reverse_half_cuban: [L(), pull(0.55, 0.25 * PI), line(U45, 800), roll(0.5, PI, 0.75, 0, true, 0.25), line(U45, 600), round(0.3, 1.25 * PI, 0.6), L()],
  reverse_cuban_8: [L(), pull(0.55, 0.25 * PI), line(U45, 800), roll(0.5, PI, 0.75, 0, true, 0.25), line(U45, 600), round(0.3, 1.5 * PI, 0.6),
    line(B_U45, 800), roll(0.5, PI, 0.75, 0, true, 0.25), line(B_U45, 600), round(0.3, 1.25 * PI, 0.6), L()],
  /* The top on the round loop's law from the Extra's 0.3, the stick
   * figures-plant-check.js's loop holds short of the stall: a full stick
   * stalled the wing and flicked it (snap pieces on the plant). */
  humpty_bump: [L(), pull(0.55, 0.5 * PI), line(UP, 1500), round(0.3, PI, 0.4), line(DOWN, 1500, 0.3), pull(0.55, 0.5 * PI, 0.6), L()],
  /* The up line at the tailslide's 0.4, which slows each aircraft (the
   * Slick climbs at 28 m/s on 0.6), kicked at 9 m/s: swept over 5 to 11
   * m/s on all three, 9 names it on each; at 7 and under the CAP's rudder
   * has too little air to turn it round. FITTED, swept again on the gates'
   * 4.1 V seat (2026-10-12): 9, 10 and 11 name it on all three (Extra,
   * CAP, Slick 6 / 4.5 / 6 at 9); the CAP takes 0 at 7 and 8, is not
   * named at 6 and crashes at 5. Swept again from ENTRY_V on the combined
   * plant (w36-physics, 2026-10-12) on LINE_YAW_KR: 8 to 11 name it on
   * all three (7 / 6.5 / 7 at 9; the CAP 1.5 at 8); under 8 the CAP is not
   * named. */
  hammerhead: [L(), entry(), pull(0.55, 0.5 * PI), line(UP, 8000, 0.4, (d) => d.v < 9), kick(), line(DOWN, 1500, 0.3), pull(0.55, 0.5 * PI, 0.6), L()],
  /* On the gates' 4.1 V seat (w36-seat-voltage, 2026-10-12), from the
   * level pass at the throttle that holds 22 m/s (SEATED), the Extra slides
   * back, its nose pivots on the yaw instead of falling through, and it
   * falls flat: named a parachute, the tailslide in none of 7 entries at
   * 0.543 to 0.583; from 0.65 and over (25 m/s and more) it names it 9.5.
   * The CAP names it 8.5 at its 0.507 and in 4 of 7 entries 0.056 under
   * the Extra's, and figures-plant-check.js's tailslide, its slide held to
   * the stop on the climb's trims, names it 9 on the Extra at 0.563.
   * On the combined plant (w36-physics) from that pass the slide's let go
   * was swept, 2026-10-12: the line held, the line held with the rudder
   * centred, or the sticks let go at the throttle cut, each let go at a
   * seen speed along the nose of -1, 0, 1, 2 and 3 m/s; none of the 15
   * names it on the Extra (a parachute, 9 to 10: the nose yaws round,
   * 1.5 to 3 rad/s, as it slides back, with the rudder centred too). From
   * ENTRY_V it is named with the let go unchanged (10 / 10 / 9.5). */
  tailslide: [L(), entry(), pull(0.55, 0.5 * PI), line(UP, 4000, 0.4, (d) => d.v < 4), slide(), line(DOWN, 1500, 0.3), pull(0.55, 0.5 * PI, 0.6), L()],
  knife_edge_pass: [L(), roll(0.5, 0.5 * PI, 1), knife(3000), roll(-0.5, 0.5 * PI), L()],
  ke_loop: [L(), roll(0.5, 0.5 * PI, 1), knife(1000), knifeLoop(), roll(-0.5, 0.5 * PI), L()],
  /* One roll, the catalogue's 2.4.2.1: a turn as fast as the judge's
   * slowest roll (1.2 rad/s) asks 2.7 g toward the centre at 22 m/s, all
   * of it on the rudder where the wings are level, near three times the
   * weight the Extra's knife edge holds on it; not named on any of the
   * three at 1.25 to 1.6 rad/s. Four rolls named it 6.5 / 8 / 9.5 on the
   * Extra, CAP and Slick, but four rolls is Aresti 2.4.7.1. On the
   * combined plant (w36-physics, 2026-10-12) the 36 of kpsi and kz's
   * sweep name four rolls in none; one roll in 10 on the Extra or the CAP
   * (0 to 6.5), on all three in none. */
  rolling_circle: [L(), rollingCircle(1), L()],
  /* Not promoted (2026-10-12): the hover's rudder loop keeps 35 deg and
   * 2.3 dB on the Extra and 47 deg and 5.3 dB on the CAP at the best
   * crossover and lead there is (scripts/figures-margins.js hoverLoops),
   * short of the criterion, so these hovers are held by gains a person
   * could not hold to it. docs/TRICKS-CATALOG.md, "Hover". */
  hover: [L(), pull(0.55, 0.5 * PI), line(UP, 8000, 0.4, (d) => d.v < HOVER_CATCH), hover(5000), line(DOWN, 800, 0.3), pull(0.55, 0.5 * PI, 0.6), L()],
  torque_roll: [L(), pull(0.55, 0.5 * PI), line(UP, 8000, 0.4, (d) => d.v < HOVER_CATCH), hover(7000, { letGoMs: 3000 }), line(DOWN, 800, 0.3), pull(0.55, 0.5 * PI, 0.6), L()],
  harrier: [slow(12), harrier(5000), L()],
  inverted_harrier: [L(), roll(0.5, PI), slow(12), harrier(5000, { inverted: true }), roll(0.5, PI), L()],
  rolling_harrier: [slow(12), harrier(1500), harrier(4000, { rollStick: 0.35 }), L()],
  /* Entered from an upline bled to 4 m/s at the tailslide's 0.4, the
   * nose 75 deg up. From a stable elevator, Scott's entry (9 m/s and
   * sinking at a third of the throttle), the Extra flew micro loops at 8
   * to 13 m/s and 2 to 4 rad/s, no pivot; from the vertical upline it
   * pivoted 0.63 of a turn and spun. Two turns: the Extreme elevator's. */
  waterfall: [L(), entry(), pull(0.55, 75 * PI / 180), line(U75, 8000, 0.4, (d) => d.v < 4), waterfall(2), L()],
  /* The wall stops the aircraft dead out of a fast pull: a quarter turn
   * inside 700 ms and the hover or the harrier right after it
   * (figuredetect.js). The pull at full stick and the hover's throttle
   * from 13 m/s, swept 2026-10-12 over 9 to 16 m/s and the pull's
   * throttle at 0.4, 0.5, 0.6, the hover's and full, 78 flights: named on
   * the Extra only, in 7, at 5.5 to 6.5, from 12 to 14 m/s at 0.5, 0.6
   * or the hover's, and never on the CAP or the Slick (a hover after the
   * pull, a snap, or the line up between); at full throttle, flown before,
   * the Extra snapped and flew into the ground from 9, 11, 12, 13 and 14
   * m/s. Not a fit. */
  wall: [slow(13), pull(1, 0.5 * PI, 'hover'), hover(3000), line(DOWN, 800, 0.3), pull(0.55, 0.5 * PI, 0.6), L()],
};

/* What the hangar seats for `tiers` ({ a, e, r }, configs/surfaces.js) on
 * the plant `airframe`, as scripts/surfaces-gates.js seatTiers does: the
 * tier block, the tier's throws over the table's tune, the bigger servos
 * as add-ons. Returns the tiers seated: an aircraft the hangar offers no
 * surface tiers on flies stock whatever is asked. */
function seatTiers(sim, airframe, tiers) {
  const id = Object.keys(SURFACES).find((k) => SURFACES[k].sim === airframe);
  const block = id ? tierBlock(id, tiers) : null;
  if (!block) return null;
  must(sim.setTiers(block), 'sim_wing_set_tiers');
  must(sim.clearTune(), 'sim_wing_tune_clear');
  const tune = sim.tune();
  const th = tierThrowsDeg(id, tiers);
  tune[3] = th[0] * PI / 180;
  tune[4] = th[1] * PI / 180;
  tune[5] = th[2] * PI / 180;
  must(sim.setTune(tune), 'sim_wing_set_tune');
  const pts = tierPoints(id, tiers);
  if (pts.length) {
    must(sim.setAddons(addonParams(id, { prop: 'stock', addons: [] }, null, 0, pts)), 'sim_set_addons');
    must(sim.setAddonInertia(Float64Array.from(pointsInertia(pts))), 'sim_set_addon_inertia');
  }
  return tiers;
}

/* The hangar's control surface tiers (configs/surfaces.js) a program
 * needs, where stock throws do not fly it. The waterfall program on the
 * Extra, 2026-10-12: stock, its first pivot 0.56 of a turn, named two
 * snap rolls; the 3D elevator with the stock, 3D or Extreme aileron and
 * the sport elevator with the Extreme, 0.7 to 0.8 of a turn and a spin
 * or snap; the Extreme elevator with the stock aileron,
 * 0.77 and a half roll, the torque winning; the Extreme elevator with the
 * sport, 3D or Extreme aileron names it (6, 5 and 6). The CAP has no
 * tiers in the hangar (configs/surfaces-tiers.js), so it flies it stock;
 * the Slick has them (w36-surface-tiers, 4cf3179d1). */
export const PROGRAM_TIERS = { waterfall: { a: 'extreme', e: 'extreme' } };

/* airframe: the plant's id, the Extra's by default; the CAP and the Slick
 * fly the same programs at the same launch to check a promotion. tiers:
 * the hangar's control surface tiers to seat (PROGRAM_TIERS), stock when
 * null; the flight says what it seated (null for stock). */
export async function fly(program, { wasmBytes, configText, trace = false, airframe = EXTRA_AIRFRAME, tiers = null }) {
  const sim = await loadSim(wasmBytes);
  must(sim.init(configText), 'sim_init');
  must(sim.e.sim_set_airframe(airframe), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  const seated = tiers ? seatTiers(sim, airframe, tiers) : null;
  must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
  must(sim.e.sim_set_pose(0, 0, 150, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(22), 'sim_wing_launch');
  const got = [];
  const det = new FigureDetector((f) => got.push(f));
  const eye = eyes({ stepMs: MS, everyMs: EVERY });
  let i = 0;
  /* What one phase leaves the next in this flight (the knife edge's
   * sticks for the loop flown from it). */
  const flight = { seat: SEATED[airframe], airframe };
  let mem = { t: 0, flight };
  let st = [0, 0, 0, flight.seat.level];
  let ms = 0;
  let minZ = Infinity;
  let crashed = false;
  for (; ms < 90000 && i < program.length; ms += MS) {
    const o = see(sim.readState().state);
    eye.push(o);
    if (o.z < minZ) minZ = o.z;
    if (o.z <= 0) {
      crashed = true;
      break;
    }
    det.step(MS / 1000, o.s);
    mem.t += MS;
    if (eye.looks(ms)) {
      const d = eye.ago();
      const [sticks, done] = program[i].step(d, mem);
      st = sticks;
      if (trace) console.log(`  ${ms} ${program[i].name} along ${o.along.toFixed(1)} q ${o.q.toFixed(2)} r ${o.r.toFixed(2)} v ${o.v.toFixed(1)} z ${o.z.toFixed(0)} nz ${o.nz.toFixed(2)} uz ${o.uz.toFixed(2)} [${st.join(',')}]`);
      if (done) {
        i += 1;
        mem = { t: 0, flight };
      }
    }
    must(sim.input(ms / 1000, ...st), 'sim_input');
    must(sim.step(MS), 'sim_step');
  }
  det.flush();
  return { got, finished: i >= program.length, crashed, ms, minZ, seated };
}
