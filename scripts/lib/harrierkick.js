/*
 * harrierkick.js: the Extra's harrier as extra-gates.js E11 and E11b fly
 * it, shared with as3x-derive.js, which holds the full AS3X Heading to
 * E11b's property. From level at 12 m/s the nose is raised over 5 s
 * until the angle of attack is 40 deg and held there on the elevator,
 * the throttle holding the height, the wings on the ailerons and the
 * heading on the rudder, each with an integral as a pilot's hands hold
 * a trim, for 20 s (extra-gates.js E11 has the why of each constant).
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

import { fly, wingDebug, must, RC_STEP_MS } from '../../tests/lib/wingpilot.js';

const DEG = 180 / Math.PI;
const AIR = [0, 600, 60, 1, 0, 0, 0];
const slow = { guard: false, start: AIR };
const fullBank = (s) => Math.atan2(2 * (s[9] * s[10] + s[7] * s[8]), 1 - 2 * (s[8] * s[8] + s[9] * s[9]));
const speed = (s) => Math.hypot(s[4], s[5], s[6]);
const clamp = (v) => Math.max(-1, Math.min(1, v));

/* The harrier on `sim` (the Extra seated) in `mode`, t11 the thresholds'
 * e11_harrier: a roll stick pulse `kick` for 0.3 s at 20 s, or a roll
 * rate `rateKick` rad/s given the body at 20 s; `long` flies the 32 s of
 * a disturbed flight undisturbed. */
export function harrierFlight(sim, t11, mode, kick = 0, rateKick = 0, long = false) {
  let clockMs = 0;
  const step = (sticks) => {
    must(sim.input(clockMs / 1000, ...sticks), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    clockMs += RC_STEP_MS;
    return sim.readState().state;
  };
  const heightHold = (start) => {
    let i = start;
    return (s, vzTarget = 0) => {
      i = Math.max(0, Math.min(1, i + 0.0008 * (vzTarget - s[6])));
      return clamp(i + 0.08 * (vzTarget - s[6]));
    };
  };
  must(sim.e.sim_wing_set_stab(mode), 'sim_wing_set_stab');
  const r = fly(sim, { duty: 0.300, vzTarget: 0, seconds: 8, speed0: 12, ...slow });
  clockMs = r.endMs;
  const target = t11.alphaDeg / DEG;
  const thr = heightHold(0.408);
  let iP = 0;
  let iB = 0;
  let s = sim.readState().state;
  const psi0 = Math.atan2(2 * (s[7] * s[10] + s[8] * s[9]), 1 - 2 * (s[9] * s[9] + s[10] * s[10]));
  let sv = 0, sd = 0, se = 0, n = 0, worstBank = 0, zMin = Infinity, zMax = -Infinity, sa = 0;
  const banks = [];
  let pre = 0, preN = 0, iae = 0, pPre = 0, pKick = 0;
  const disturbed = kick || rateKick;
  const after = [];
  for (let ms = 0; ms < (disturbed || long ? 32000 : 20000); ms += RC_STEP_MS) {
    if (rateKick && ms === 20000) {
      must(sim.e.sim_set_velocity(s[4], s[5], s[6], s[11] + rateKick, s[12], s[13]), 'sim_set_velocity');
      s = sim.readState().state;
    }
    const alpha = wingDebug(sim)[0];
    const bank = fullBank(s);
    const psi = Math.atan2(2 * (s[7] * s[10] + s[8] * s[9]), 1 - 2 * (s[9] * s[9] + s[10] * s[10]));
    const at = Math.min(target, 0.1 + target * ms / 5000);
    iP = Math.max(-1, Math.min(1, iP + 1.5 * (at - alpha) * RC_STEP_MS / 1000));
    const pitchStick = clamp(1.5 * (at - alpha) + 0.15 * s[12] + iP);
    iB = Math.max(-0.5, Math.min(0.5, iB - 1.0 * bank * RC_STEP_MS / 1000));
    const roll = clamp(-0.6 * bank - 0.06 * s[11] + iB + (kick && ms >= 20000 && ms < 20300 ? kick : 0));
    let dpsi = psi - psi0;
    while (dpsi > Math.PI) dpsi -= 2 * Math.PI;
    while (dpsi < -Math.PI) dpsi += 2 * Math.PI;
    const yaw = clamp(1.0 * dpsi + 0.2 * s[13]);
    const t = thr(s);
    s = step([roll, pitchStick, yaw, t]);
    if (disturbed && ms >= 15000 && ms < 20000) { pre += bank * DEG; preN += 1; pPre += s[11]; }
    if (kick && ms + RC_STEP_MS === 20300) pKick = s[11] - pPre / preN;
    if (disturbed && ms >= 20000) iae += Math.abs(bank * DEG - pre / preN) * RC_STEP_MS / 1000;
    if (ms >= 20000) after.push(bank * DEG);
    if (ms >= 10000 && ms < 20000) {
      banks.push(bank * DEG);
      worstBank = Math.max(worstBank, Math.abs(bank * DEG));
      zMin = Math.min(zMin, s[3]); zMax = Math.max(zMax, s[3]);
    }
    if (ms >= 15000) {
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
export function kickIae(sim, t11, mode, rate) {
  const still = harrierFlight(sim, t11, mode, 0, 0, true).after, kicked = harrierFlight(sim, t11, mode, 0, rate).after;
  return kicked.reduce((x, b, i) => x + Math.abs(b - still[i]) * RC_STEP_MS / 1000, 0);
}
export function harrierKicks(sim, t11, heading) {
  const own = (mode, rate) => kickIae(sim, t11, mode, rate);
  return t11.kickStick.map((k) => {
    const rate = harrierFlight(sim, t11, 0, k).pKick;
    const m = own(0, rate);
    must(sim.setHeading(heading), 'sim_wing_set_heading');
    const g = own(3, rate);
    must(sim.setHeading([0, 0, 0]), 'sim_wing_set_heading');
    return { k, rate, m, g };
  });
}
