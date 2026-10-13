/*
 * harrierkick.js: the 3D aircraft's harriers as their gates fly them, and
 * E11b's kick on them, shared with as3x-derive.js, which holds the full
 * AS3X Heading to E11b's property. From level the nose is raised until
 * the angle of attack is 40 deg and held there on the elevator, the
 * throttle holding the height, the wings on the ailerons and the heading
 * on the rudder, each with an integral as a pilot's hands hold a trim
 * (extra-gates.js E11, cap580-gates.js C11 and slick-gates.js S11 have
 * the why of each constant; PROGRAMS below carries them).
 *
 * Harness arithmetic in JS maths, which is allowed here because nothing
 * it prints is hashed.
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

import { fly, wingDebug, attitude, must, RC_STEP_MS } from '../../tests/lib/wingpilot.js';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const DEG = 180 / Math.PI;
const AIR = [0, 600, 60, 1, 0, 0, 0];
const slow = { guard: false, start: AIR };
const fullBank = (s) => Math.atan2(2 * (s[9] * s[10] + s[7] * s[8]), 1 - 2 * (s[8] * s[8] + s[9] * s[9]));
const speed = (s) => Math.hypot(s[4], s[5], s[6]);
const clamp = (v) => Math.max(-1, Math.min(1, v));

/* Each gate's harrier: its thresholds' entry (alphaDeg; the kick's sticks
 * are E11b's, the one gate that kicks), the entry flight's throttle and
 * speed, the height hold's start and gains and its floor, the time the
 * nose takes to come up, whether the elevator flies the measured angle
 * of attack (E11, C11) or the nose's attitude (S11), the elevator's
 * gains, and when the harrier has settled, where a kick lands. */
const extraT11 = () => JSON.parse(readFileSync(join(ROOT, 'tests/extra-thresholds.json'), 'utf8')).e11_harrier;
export const PROGRAMS = {
  extra: (t11 = extraT11()) => ({
    t11, duty: 0.300, speed0: 12, hold: { start: 0.408, ki: 0.0008, kp: 0.08, lo: -1 },
    rampMs: 5000, onAttitude: false, kp: 1.5, kq: 0.15, settleMs: 20000,
  }),
  cap: () => {
    const t11 = JSON.parse(readFileSync(join(ROOT, 'tests/cap580-thresholds.json'), 'utf8')).c11_harrier;
    return {
      t11: { ...t11, kickStick: extraT11().kickStick }, duty: 0.5, speed0: t11.speed0,
      hold: { start: t11.dutyDerived, ki: 0.0008, kp: 0.08, lo: -1 },
      rampMs: 5000, onAttitude: false, kp: 1.5, kq: 0.15, settleMs: 20000,
    };
  },
  slick: () => {
    const t11 = JSON.parse(readFileSync(join(ROOT, 'tests/slick-thresholds.json'), 'utf8')).s11_harrier;
    return {
      t11: { ...t11, kickStick: extraT11().kickStick }, duty: 0.4, speed0: 18,
      hold: { start: t11.dutyDerived, ki: 0.001, kp: 0.2, lo: 0 },
      rampMs: 10000, onAttitude: true, kp: 2.0, kq: 0.6, settleMs: 30000,
    };
  },
};

/* The harrier on `sim` (the aircraft seated) in `mode`, flown on program
 * `prog`: a roll stick pulse `kick` for 0.3 s once settled, or a roll
 * rate `rateKick` rad/s given the body then; `long` flies the 12 s more
 * of a disturbed flight undisturbed. */
export function harrierFlight(sim, prog, mode, kick = 0, rateKick = 0, long = false) {
  const { t11, settleMs } = prog;
  let clockMs = 0;
  const step = (sticks) => {
    must(sim.input(clockMs / 1000, ...sticks), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    clockMs += RC_STEP_MS;
    return sim.readState().state;
  };
  const heightHold = ({ start, ki, kp, lo }) => {
    let i = start;
    return (s, vzTarget = 0) => {
      i = Math.max(0, Math.min(1, i + ki * (vzTarget - s[6])));
      return Math.max(lo, Math.min(1, i + kp * (vzTarget - s[6])));
    };
  };
  must(sim.e.sim_wing_set_stab(mode), 'sim_wing_set_stab');
  const r = fly(sim, { duty: prog.duty, vzTarget: 0, seconds: 8, speed0: prog.speed0, ...slow });
  clockMs = r.endMs;
  const target = t11.alphaDeg / DEG;
  const thr = heightHold(prog.hold);
  let iP = 0;
  let iB = 0;
  let s = sim.readState().state;
  const psi0 = Math.atan2(2 * (s[7] * s[10] + s[8] * s[9]), 1 - 2 * (s[9] * s[9] + s[10] * s[10]));
  let sv = 0, sd = 0, se = 0, n = 0, worstBank = 0, zMin = Infinity, zMax = -Infinity, sa = 0;
  const banks = [];
  let pre = 0, preN = 0, iae = 0, pPre = 0, pKick = 0;
  const disturbed = kick || rateKick;
  const after = [];
  for (let ms = 0; ms < (disturbed || long ? settleMs + 12000 : settleMs); ms += RC_STEP_MS) {
    if (rateKick && ms === settleMs) {
      must(sim.e.sim_set_velocity(s[4], s[5], s[6], s[11] + rateKick, s[12], s[13]), 'sim_set_velocity');
      s = sim.readState().state;
    }
    const alpha = prog.onAttitude ? attitude(s).pitch : wingDebug(sim)[0];
    const bank = fullBank(s);
    const psi = Math.atan2(2 * (s[7] * s[10] + s[8] * s[9]), 1 - 2 * (s[9] * s[9] + s[10] * s[10]));
    const at = Math.min(target, 0.1 + target * ms / prog.rampMs);
    iP = Math.max(-1, Math.min(1, iP + 1.5 * (at - alpha) * RC_STEP_MS / 1000));
    const pitchStick = clamp(prog.kp * (at - alpha) + prog.kq * s[12] + iP);
    iB = Math.max(-0.5, Math.min(0.5, iB - 1.0 * bank * RC_STEP_MS / 1000));
    const roll = clamp(-0.6 * bank - 0.06 * s[11] + iB + (kick && ms >= settleMs && ms < settleMs + 300 ? kick : 0));
    let dpsi = psi - psi0;
    while (dpsi > Math.PI) dpsi -= 2 * Math.PI;
    while (dpsi < -Math.PI) dpsi += 2 * Math.PI;
    const yaw = clamp(1.0 * dpsi + 0.2 * s[13]);
    const t = thr(s);
    s = step([roll, pitchStick, yaw, t]);
    if (disturbed && ms >= settleMs - 5000 && ms < settleMs) { pre += bank * DEG; preN += 1; pPre += s[11]; }
    if (kick && ms + RC_STEP_MS === settleMs + 300) pKick = s[11] - pPre / preN;
    if (disturbed && ms >= settleMs) iae += Math.abs(bank * DEG - pre / preN) * RC_STEP_MS / 1000;
    if (ms >= settleMs) after.push(bank * DEG);
    if (ms >= settleMs - 10000 && ms < settleMs) {
      banks.push(bank * DEG);
      worstBank = Math.max(worstBank, Math.abs(bank * DEG));
      zMin = Math.min(zMin, s[3]); zMax = Math.max(zMax, s[3]);
    }
    if (ms >= settleMs - 5000) {
      sv += speed(s); sd += t; se += pitchStick; n += 1; sa += wingDebug(sim)[0];
    }
  }
  const mean = banks.reduce((x, y) => x + y, 0) / banks.length;
  const spread = Math.sqrt(banks.reduce((x, y) => x + (y - mean) ** 2, 0) / banks.length);
  let cross = 0;
  for (let i = 1; i < banks.length; i += 1) if ((banks[i - 1] - mean) * (banks[i] - mean) < 0) cross += 1;
  must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
  return { iae, pKick, after, v: sv / n, d: sd / n, e: se / n, a: sa / n * DEG, worstBank, spread, period: cross > 1 ? (2 * 10) / cross : null, drift: zMax - zMin };
}

/* E11b: each of t11.kickStick's pulses flown in Manual for the roll rate
 * it puts on the body, then that rate given at once, in Manual and in
 * AS3X at the Heading share vector `heading`; what the kick itself does
 * to the bank (the kicked flight less the same flight unkicked),
 * integrated over the 12 s after (kickIae). */
export function kickIae(sim, prog, mode, rate) {
  const still = harrierFlight(sim, prog, mode, 0, 0, true).after, kicked = harrierFlight(sim, prog, mode, 0, rate).after;
  return kicked.reduce((x, b, i) => x + Math.abs(b - still[i]) * RC_STEP_MS / 1000, 0);
}
export function harrierKicks(sim, prog, heading) {
  const own = (mode, rate) => kickIae(sim, prog, mode, rate);
  return prog.t11.kickStick.map((k) => {
    const rate = harrierFlight(sim, prog, 0, k).pKick;
    const m = own(0, rate);
    must(sim.setHeading(heading), 'sim_wing_set_heading');
    const g = own(3, rate);
    must(sim.setHeading([0, 0, 0]), 'sim_wing_set_heading');
    return { k, rate, m, g };
  });
}
