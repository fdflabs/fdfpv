/*
 * slick-gates.js: Extreme Flight's 105.5 in Slick 580 plant against the
 * bands in tests/slick-thresholds.json.
 *
 * Checks S1 to S16 from docs/SLICK-STAGE1.md, the Extra's E1 to E16
 * (scripts/extra-gates.js) on this aircraft. S1 to S5 are its performance
 * as an aeroplane: a level cruise, the stall at its Reynolds number, a
 * glide, its top speed on the DA-120 and a roll rate at full aileron. S6
 * to S12 are the 3D regime its thrust of two and a half times its weight
 * opens: hanging on the prop, the vertical climb, the torque roll and the
 * ailerons in the wash beating it, full elevator and rudder at zero
 * airspeed (and nothing with the engine stopped), the harrier and the
 * knife edge. S13 and S14 are its taildragger gear: standing at the
 * sheet's pose and a take off roll. S15 holds every other aircraft's
 * recorded hash where main's module has it (the Extra's E15 list), and
 * S16 flies the Slick's recording in Node and in headless Chrome and holds
 * the two hashes equal. Bands are never widened here: a plant outside one
 * is a finding for the derivation. Run with npm run slick:gates.
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

import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { replayTrace } from '../tests/lib/replay.js';
import { decodeRec } from '../tests/lib/recfile.js';
import { findChrome, runBrowserHarness } from '../tests/lib/browser.js';
import { startServer } from '../tests/lib/server.js';
import {
  SLICK_AIRFRAME, slickGroundPrelude, slickTakeoffSticks, hangSticks, fly, wingDebug, wheelLoads, attitude, must,
  bombshellGroundPrelude, kadetGroundPrelude, slowstickGroundPrelude, skyPrelude, wingPrelude, cubGroundPrelude, p51RecPrelude, p51AirPrelude, f16GroundPrelude,
  zagiPrelude, uglystikGroundPrelude, dlgRecPrelude, tigermothGroundPrelude,
  gliderRecPrelude, bramorPrelude, bramorChutePrelude, timberRecPrelude, timberFloatRecPrelude, RC_STEP_MS,
} from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const th = JSON.parse(await readFile(join(root, 'tests/slick-thresholds.json'), 'utf8'));
const extraTh = JSON.parse(await readFile(join(root, 'tests/extra-thresholds.json'), 'utf8'));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const DEG = 180 / Math.PI;

async function slickSim() {
  const sim = await loadSim(wasmBytes);
  if (sim.init(configText) !== SIM_OK) throw new Error('sim_init failed');
  if (sim.e.sim_set_airframe(SLICK_AIRFRAME) !== SIM_OK) throw new Error('sim_set_airframe failed');
  if (sim.setCellVoltage(4.1) !== SIM_OK) throw new Error('sim_set_cell_voltage failed');
  return sim;
}

const rows = [];
let failed = 0;
let skipped = 0;
function gate(id, name, ok, measured, band) {
  rows.push([id, name, measured, band, ok === null ? 'SKIP' : (ok ? 'ok' : 'FAIL')]);
  if (ok === null) skipped += 1;
  else if (!ok) failed += 1;
}
const within = (v, b) => v >= b.min && v <= b.max;
const band = (b) => `${b.min} to ${b.max}`;
const fullBank = (s) => Math.atan2(2 * (s[9] * s[10] + s[7] * s[8]), 1 - 2 * (s[8] * s[8] + s[9] * s[9]));
const speed = (s) => Math.hypot(s[4], s[5], s[6]);
const clamp = (v) => Math.max(-1, Math.min(1, v));

/* The flights start 600 m to the side of the field and 60 m up. */
const AIR = [0, 600, 60, 1, 0, 0, 0];
const slow = { guard: false, start: AIR };

let clockMs = 0;
function step(sim, sticks) {
  must(sim.input(clockMs / 1000, ...sticks), 'sim_input');
  must(sim.step(RC_STEP_MS), 'sim_step');
  clockMs += RC_STEP_MS;
  return sim.readState().state;
}
/* Nose straight up, still, at 60 m. cos and sin of 45 deg. */
const H = Math.SQRT1_2;
function hanging(sim) {
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_set_pose(0, 600, 60, H, 0, -H, 0), 'sim_set_pose');
  clockMs = 0;
}
/* The throttle that holds the height, a rate loop with an integral,
 * starting from the stick given; a throttle stick has no travel under its
 * idle stop, so it is held to 0..1 (the Extra's gate never asked for less). */
function heightHold(start, ki = 0.0008, kp = 0.08) {
  let i = start;
  return (s, vzTarget = 0) => {
    i = Math.max(0, Math.min(1, i + ki * (vzTarget - s[6])));
    return Math.max(0, Math.min(1, i + kp * (vzTarget - s[6])));
  };
}

console.log('slick gates: the plant against docs/SLICK-STAGE1.md');
const sim = await slickSim();
must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
check: {
  if (sim.e.sim_airframe() !== SLICK_AIRFRAME) {
    gate('S0', 'the Slick is selected', false, `airframe ${sim.e.sim_airframe()}`, `${SLICK_AIRFRAME}`);
    break check;
  }

  const e1 = fly(sim, { duty: th.s1_level_75.duty, vzTarget: 0, seconds: 30, speed0: 32, ...slow });
  gate('S1', 'cruise: level speed at 75 percent', within(e1.v, th.s1_level_75), `${e1.v.toFixed(2)} m/s, sink ${(-e1.vz).toFixed(2)}`, band(th.s1_level_75));

  let stallV = null;
  fly(sim, {
    duty: 0, speed0: 20, seconds: 14, pitchMax: 0.7, pitchMin: -0.3, ...slow,
    pitchTargetFn: (ms) => Math.min(0.6, 0.06 * ms / 1000),
    onStep: (o) => { if (stallV == null && o.ms > 1000 && wingDebug(sim)[0] > th.s2_stall.alphaStall) stallV = o.v; },
  });
  gate('S2', 'stall speed, power off', stallV != null && within(stallV, th.s2_stall), stallV == null ? 'no stall reached' : `${stallV.toFixed(2)} m/s`, band(th.s2_stall));

  const g3 = fly(sim, { duty: 0, vTarget: th.s3_glide.speed, seconds: 30, ...slow, speed0: th.s3_glide.speed });
  const ratio = Math.sqrt(Math.max(0, g3.v * g3.v - g3.vz * g3.vz)) / -g3.vz;
  gate('S3', 'glide ratio, power off', within(ratio, th.s3_glide), `${ratio.toFixed(2)} at ${g3.v.toFixed(2)} m/s, sink ${(-g3.vz).toFixed(2)}`, band(th.s3_glide));

  const e4 = fly(sim, { duty: th.s4_top.duty, vzTarget: 0, seconds: 40, speed0: 40, ...slow });
  gate('S4', 'top speed, level', within(e4.v, th.s4_top), `${e4.v.toFixed(2)} m/s, sink ${(-e4.vz).toFixed(2)}`, band(th.s4_top));

  /* S5: level at the roll speed, then full right aileron: the peak roll
   * rate in the first second over the speed then. */
  {
    const t5 = th.s5_roll;
    const r = fly(sim, { duty: t5.duty, vTarget: t5.speed, seconds: 15, speed0: t5.speed, ...slow });
    clockMs = r.endMs;
    let peak = 0;
    let vAt = t5.speed;
    for (let ms = 0; ms < 1000; ms += RC_STEP_MS) {
      const s = step(sim, [1, 0, 0, t5.duty]);
      if (s[11] > peak) { peak = s[11]; vAt = speed(s); }
    }
    const pb2v = peak * 2.680 / (2 * vAt);
    gate('S5', 'roll rate, full aileron, pb/2V', within(pb2v, t5), `${pb2v.toFixed(3)}: ${(peak * DEG).toFixed(0)} deg/s at ${vAt.toFixed(1)} m/s`, band(t5));
  }

  /* S6: hanging on the prop. From still, nose up, the nose held by the
   * elevator and rudder in the slipstream, the roll rate held at nothing
   * on the ailerons as a 3D pilot holds the torque, the height by the
   * throttle: the mean stick and the height's drift over 3 to 8 s. */
  {
    const t6 = th.s6_hover;
    hanging(sim);
    const thr = heightHold(th.s6_hover.derived);
    let sum = 0;
    let n = 0;
    let z3 = null;
    let s = sim.readState().state;
    let zMin = Infinity, zMax = -Infinity;
    for (let ms = 0; ms < 8000; ms += RC_STEP_MS) {
      const t = thr(s);
      s = step(sim, [...hangSticks(s, { rollRate: 0 }), t]);
      if (ms >= 3000) {
        sum += t; n += 1;
        if (z3 === null) z3 = s[3];
        zMin = Math.min(zMin, s[3]); zMax = Math.max(zMax, s[3]);
      }
    }
    const mean = sum / n;
    const drift = zMax - zMin;
    gate('S6', 'hangs on the prop at the hover throttle', within(mean, t6) && drift <= t6.maxHeightDrift,
      `stick ${mean.toFixed(4)}, height within ${drift.toFixed(2)} m, nose ${(attitude(s).pitch * DEG).toFixed(1)} deg`, `${band(t6)}, within ${t6.maxHeightDrift} m`);
  }

  /* S7: straight up at full throttle from the hover: the climb speed after
   * 8 s, when it has settled. */
  {
    hanging(sim);
    let s = sim.readState().state;
    for (let ms = 0; ms < 8000; ms += RC_STEP_MS) {
      s = step(sim, [...hangSticks(s, { rollRate: 0 }), 1]);
    }
    gate('S7', 'climbs straight up at full throttle', within(s[6], th.s7_vertical), `${s[6].toFixed(2)} m/s up, nose ${(attitude(s).pitch * DEG).toFixed(1)} deg`, band(th.s7_vertical));
  }

  /* S8, E9: the torque roll, the ailerons let go, then full right
   * aileron: the mean roll rate over 3 to 6 s (right positive). */
  const rollHanging = (rollStick) => {
    hanging(sim);
    const thr = heightHold(th.s6_hover.derived);
    let s = sim.readState().state;
    let sum = 0;
    let n = 0;
    for (let ms = 0; ms < 6000; ms += RC_STEP_MS) {
      s = step(sim, [...hangSticks(s, { rollStick }), thr(s)]);
      if (ms >= 3000) { sum += s[11]; n += 1; }
    }
    return { p: sum / n * DEG, pitch: attitude(s).pitch * DEG };
  };
  {
    const r8 = rollHanging(0);
    gate('S8', 'torque roll: the ailerons let go, it turns left', r8.p < 0 && within(-r8.p, th.s8_torque_roll), `${r8.p.toFixed(0)} deg/s ${r8.p < 0 ? 'left' : 'RIGHT'}, nose ${r8.pitch.toFixed(1)} deg`, `${th.s8_torque_roll.min} to ${th.s8_torque_roll.max} left`);
    const r9 = rollHanging(1);
    gate('S9', 'full right aileron in the wash beats the torque', r9.p > 0 && within(r9.p, th.s9_aileron_hover), `${r9.p.toFixed(0)} deg/s ${r9.p > 0 ? 'right' : 'LEFT'}, nose ${r9.pitch.toFixed(1)} deg`, `${th.s9_aileron_hover.min} to ${th.s9_aileron_hover.max} right`);
  }

  /* S10: hanging still, one full stick for 20 ms from rest at the hover
   * throttle, and again with the engine at its idle (a petrol engine does
   * not stop on the stick): the first angular
   * acceleration, nose up positive and nose right positive. */
  {
    const t10 = th.s10_zero_speed;
    const kick = (sticks, throttle) => {
      hanging(sim);
      /* The prop spun up and the wash formed: held still at the throttle
       * for a second, ten of the motor's time constants (prop_spool,
       * docs/FLIGHTMODEL.md), then the stick steps. */
      for (let ms = 0; ms < 1000; ms += RC_STEP_MS) {
        must(sim.e.sim_set_pose(0, 600, 60, H, 0, -H, 0), 'sim_set_pose');
        must(sim.e.sim_set_velocity(0, 0, 0, 0, 0, 0), 'sim_set_velocity');
        step(sim, [0, 0, 0, throttle]);
      }
      let s = sim.readState().state;
      for (let ms = 0; ms < 20; ms += RC_STEP_MS) s = step(sim, [...sticks, throttle]);
      return { q: -s[12] / 0.020, r: -s[13] / 0.020 };
    };
    /* The stick that hangs it: the rpm share sqrt(W / T) on the throttle's curve. */
    const hoverDuty = th.s6_hover.derived;
    const up = kick([0, 1, 0], hoverDuty);
    const upDead = kick([0, 1, 0], 0);
    const right = kick([0, 0, 1], hoverDuty);
    const rightDead = kick([0, 0, 1], 0);
    gate('S10', 'full elevator at zero airspeed, in the wash', up.q >= t10.pitchMin && up.q <= t10.pitchMax && Math.abs(upDead.q) <= t10.idleMax * up.q,
      `${up.q.toFixed(1)} rad/s^2 nose up; engine at idle ${upDead.q.toFixed(2)}`, `${t10.pitchMin} to ${t10.pitchMax}; at idle under ${t10.idleMax * 100} percent`);
    gate('S10b', 'full rudder at zero airspeed, in the wash', right.r >= t10.yawMin && right.r <= t10.yawMax && Math.abs(rightDead.r) <= t10.idleMax * right.r,
      `${right.r.toFixed(1)} rad/s^2 nose right; engine at idle ${rightDead.r.toFixed(2)}`, `${t10.yawMin} to ${t10.yawMax}; at idle under ${t10.idleMax * 100} percent`);
  }

  /* S11: the harrier. From level at 18 m/s the nose is raised over 10 s
   * until the angle of attack is 40 deg and held there on the elevator,
   * the throttle holding the height, the wings on the ailerons and the
   * heading on the rudder, each with an integral as a pilot's hands hold
   * a trim, for 30 s. The Extra's pilot with slower hands on the throttle
   * and more pitch damping, for an aircraft of thirty times its pitch
   * inertia, and flying the nose's attitude, which level is the angle of
   * attack, as a harrier pilot does: chasing the measured alpha through
   * the stalled wing's rock on this aircraft rode a phugoid of 7 to 14
   * m/s. The mean of the last 5 s, its alpha as the plant reads it. */
  {
    const t11 = th.s11_harrier;
    const r = fly(sim, { duty: 0.4, vzTarget: 0, seconds: 8, speed0: 18, ...slow });
    clockMs = r.endMs;
    const target = t11.alphaDeg / DEG;
    const thr = heightHold(th.s11_harrier.dutyDerived, 0.001, 0.2);
    let iP = 0;
    let iB = 0;
    let s = sim.readState().state;
    const psi0 = Math.atan2(2 * (s[7] * s[10] + s[8] * s[9]), 1 - 2 * (s[9] * s[9] + s[10] * s[10]));
    let sv = 0, sd = 0, se = 0, n = 0, worstBank = 0, zMin = Infinity, zMax = -Infinity, sa = 0;
    for (let ms = 0; ms < 30000; ms += RC_STEP_MS) {
      const alpha = attitude(s).pitch;
      const bank = fullBank(s);
      const psi = Math.atan2(2 * (s[7] * s[10] + s[8] * s[9]), 1 - 2 * (s[9] * s[9] + s[10] * s[10]));
      const at = Math.min(target, 0.1 + target * ms / 10000);
      iP = Math.max(-1, Math.min(1, iP + 1.5 * (at - alpha) * RC_STEP_MS / 1000));
      const pitchStick = clamp(2.0 * (at - alpha) + 0.6 * s[12] + iP);
      iB = Math.max(-0.5, Math.min(0.5, iB - 1.0 * bank * RC_STEP_MS / 1000));
      const roll = clamp(-0.6 * bank - 0.06 * s[11] + iB);
      let dpsi = psi - psi0;
      while (dpsi > Math.PI) dpsi -= 2 * Math.PI;
      while (dpsi < -Math.PI) dpsi += 2 * Math.PI;
      const yaw = clamp(1.0 * dpsi + 0.2 * s[13]);
      const t = thr(s);
      s = step(sim, [roll, pitchStick, yaw, t]);
      if (ms >= 25000) {
        sv += speed(s); sd += t; se += pitchStick; n += 1; sa += wingDebug(sim)[0];
        worstBank = Math.max(worstBank, Math.abs(bank * DEG));
        zMin = Math.min(zMin, s[3]); zMax = Math.max(zMax, s[3]);
      }
    }
    const v = sv / n, d = sd / n, e = se / n, a = sa / n * DEG;
    gate('S11', 'harrier: level at 40 deg of alpha', v >= t11.vMin && v <= t11.vMax && d >= t11.dutyMin && d <= t11.dutyMax && e < 1 && worstBank <= t11.maxBankDeg && zMax - zMin <= t11.maxHeightDrift,
      `${v.toFixed(2)} m/s at throttle ${d.toFixed(3)}, alpha ${a.toFixed(1)} deg, elevator stick ${e.toFixed(2)}, bank under ${worstBank.toFixed(1)}, height within ${(zMax - zMin).toFixed(2)} m`,
      `${t11.vMin} to ${t11.vMax} m/s, ${t11.dutyMin} to ${t11.dutyMax}, elevator short of full, bank under ${t11.maxBankDeg}, within ${t11.maxHeightDrift} m`);
  }

  /* S12: the knife edge. From level at 15 m/s, rolled right to 90 deg on
   * the ailerons. A pilot holds the height on the rudder through the
   * sideslip: the height's rate asks for a sideslip, the rudder flies the
   * aircraft onto it (left rudder, nose toward the sky, is more), each
   * with an integral, and the yaw rate damped; the speed on the throttle,
   * the heading on the elevator, for 15 s; the mean of the last 5. */
  {
    const t12 = th.s12_knife_edge;
    const r = fly(sim, { duty: 0.6, vTarget: t12.speed, seconds: 10, speed0: t12.speed, ...slow });
    clockMs = r.endMs;
    let s = sim.readState().state;
    let iA = 0, iH = 0, iB = 0, iT = th.s12_knife_edge.dutyDerived;
    const psi0 = Math.atan2(2 * (s[7] * s[10] + s[8] * s[9]), 1 - 2 * (s[9] * s[9] + s[10] * s[10]));
    let sb = 0, sd = 0, sr = 0, n = 0, zMin = Infinity, zMax = -Infinity, worstBank = 0;
    for (let ms = 0; ms < 15000; ms += RC_STEP_MS) {
      const dt = RC_STEP_MS / 1000;
      const bank = fullBank(s);
      const bankT = Math.min(Math.PI / 2, ms / 1000 * 3);
      iA = Math.max(-0.5, Math.min(0.5, iA - 1.0 * (bank - bankT) * dt));
      const roll = clamp(-0.8 * (bank - bankT) - 0.05 * s[11] + iA);
      iH = Math.max(-0.3, Math.min(0.9, iH + 0.2 * (0 - s[6]) * dt));
      const betaT = 0.3 + 0.2 * (0 - s[6]) + iH;
      const beta = wingDebug(sim)[1];
      iB = Math.max(-1, Math.min(1, iB + 3 * (betaT - beta) * dt));
      const yaw = ms < 300 ? 0 : clamp(-3 * (betaT - beta) - iB + 0.3 * s[13]);
      const psi = Math.atan2(2 * (s[7] * s[10] + s[8] * s[9]), 1 - 2 * (s[9] * s[9] + s[10] * s[10]));
      let dpsi = psi - psi0;
      while (dpsi > Math.PI) dpsi -= 2 * Math.PI;
      while (dpsi < -Math.PI) dpsi += 2 * Math.PI;
      const pitchStick = clamp(0.8 * dpsi + 0.15 * s[12]);
      iT = Math.max(0, Math.min(1, iT + 0.0005 * (t12.speed - speed(s))));
      const t = clamp(iT + 0.1 * (t12.speed - speed(s)));
      s = step(sim, [roll, pitchStick, yaw, t]);
      if (ms >= 10000) {
        sb += wingDebug(sim)[1]; sd += t; sr += yaw; n += 1;
        zMin = Math.min(zMin, s[3]); zMax = Math.max(zMax, s[3]);
        worstBank = Math.max(worstBank, Math.abs(bank * DEG - 90));
      }
    }
    const bm = sb / n * DEG, d = sd / n, rd = sr / n;
    gate('S12', 'knife edge: rolled to 90 deg, the rudder holding height', bm >= t12.betaMin && bm <= t12.betaMax && d >= t12.dutyMin && d <= t12.dutyMax && Math.abs(rd) < 1 && zMax - zMin <= t12.maxHeightDrift,
      `sideslip ${bm.toFixed(1)} deg at throttle ${d.toFixed(3)}, rudder stick ${rd.toFixed(2)}, bank off 90 by under ${worstBank.toFixed(1)}, height within ${(zMax - zMin).toFixed(2)} m`,
      `${t12.betaMin} to ${t12.betaMax} deg, ${t12.dutyMin} to ${t12.dutyMax}, rudder short of full, within ${t12.maxHeightDrift} m`);
  }

  /* S13: on the strip at the drawn pose, 3 s with every stick centred. */
  const onStrip = () => {
    must(sim.reset(), 'sim_reset');
    slickGroundPrelude(sim);
    clockMs = 0;
  };
  {
    const r13 = th.s13_rest;
    onStrip();
    let hull = 0;
    let s = null;
    for (let ms = 0; ms < 3000; ms += RC_STEP_MS) {
      s = step(sim, [0, 0, 0, 0]);
      hull = Math.max(hull, sim.e.sim_ground_contacts());
    }
    const loads = wheelLoads(sim);
    const rest = { pitch: attitude(s).pitch * DEG, z: s[3], tail: loads[2] / (loads[0] + loads[1] + loads[2]) };
    gate('S13', 'standing on its wheels', rest.pitch >= r13.pitchMin && rest.pitch <= r13.pitchMax && rest.z >= r13.zMin && rest.z <= r13.zMax && rest.tail >= r13.tailMin && rest.tail <= r13.tailMax && hull === 0 && loads[3] === 0,
      `${rest.pitch.toFixed(2)} deg, CG ${rest.z.toFixed(4)} m, tail ${(rest.tail * 100).toFixed(1)} percent, loads ${loads.map((f) => f.toFixed(2)).join(' ')} N, hull ${hull}`,
      `${r13.pitchMin} to ${r13.pitchMax} deg, ${r13.zMin} to ${r13.zMax} m, ${r13.tailMin * 100} to ${r13.tailMax * 100} percent, no hull or prop`);
  }

  /* S14: full throttle from standing, the take off sticks of
   * wingpilot.js; liftoff is the last step on the wheels before 200 ms
   * clear of them. */
  {
    const t14 = th.s14_takeoff;
    onStrip();
    for (let ms = 0; ms < 1000; ms += RC_STEP_MS) step(sim, [0, 0, 0, 0]);
    const x0 = sim.readState().state[1];
    let last = null;
    let off = 0;
    let lof = null;
    for (let ms = 0; ms < 6000 && !lof; ms += RC_STEP_MS) {
      const s = step(sim, [...slickTakeoffSticks(sim.readState().state), 1]);
      const loaded = wheelLoads(sim).some((f) => f > 0);
      if (loaded) {
        last = { dist: s[1] - x0, v: speed(s), t: ms / 1000, y: s[2] };
        off = 0;
      } else {
        off += RC_STEP_MS;
        if (off >= 200) lof = last;
      }
    }
    gate('S14', 'takes off, tail up, from standing', lof != null && lof.dist >= t14.distMin && lof.dist <= t14.distMax,
      lof == null ? 'never left the ground' : `${lof.dist.toFixed(2)} m to liftoff at ${lof.v.toFixed(2)} m/s, ${lof.t.toFixed(2)} s, ${lof.y.toFixed(2)} m off the line`,
      `${t14.distMin} to ${t14.distMax} m`);
  }
}

const quadTh = JSON.parse(await readFile(join(root, 'tests/thresholds.json'), 'utf8'));
const replayBase = { configText, renderHz: quadTh.replay.canonical_render_hz.value, traceStrideMs: quadTh.replay.trace_stride_ms.value };
const recOf = async (f) => decodeRec(new Uint8Array(await readFile(join(root, f))));
const hashOf = async (f, prelude) => (await replayTrace(await loadSim(wasmBytes), await recOf(f), { ...replayBase, prelude })).slice(0, 16);
const u = extraTh.e15_unmoved;
const got = {
  quad: await hashOf('tests/inputs/baseline.rec', undefined),
  wing: await hashOf('tests/inputs/wing-baseline.rec', wingPrelude),
  sky: await hashOf('tests/inputs/sky-baseline.rec', skyPrelude),
  cub: await hashOf('tests/inputs/cub-baseline.rec', (s) => cubGroundPrelude(s)),
  glider: await hashOf('tests/inputs/glider-baseline.rec', gliderRecPrelude),
  bramor: await hashOf('tests/inputs/bramor-baseline.rec', bramorPrelude),
  bramorChute: await hashOf('tests/inputs/bramor-chute.rec', bramorChutePrelude),
  slowstick: await hashOf('tests/inputs/slowstick-baseline.rec', (s) => slowstickGroundPrelude(s)),
  bombshell: await hashOf('tests/inputs/bombshell-baseline.rec', (s) => bombshellGroundPrelude(s)),
  timber: await hashOf('tests/inputs/timber-baseline.rec', timberRecPrelude),
  timberf: await hashOf('tests/inputs/timberf-baseline.rec', timberFloatRecPrelude),
  kadet: await hashOf('tests/inputs/kadet-baseline.rec', (s) => kadetGroundPrelude(s)),
  p51: await hashOf('tests/inputs/p51-baseline.rec', p51RecPrelude),
  p51air: await hashOf('tests/inputs/p51-air.rec', p51AirPrelude),
  f16: await hashOf('tests/inputs/f16-baseline.rec', (s) => f16GroundPrelude(s)),
  zagi: await hashOf('tests/inputs/zagi-baseline.rec', (s) => zagiPrelude(s)),
  uglystik: await hashOf('tests/inputs/uglystik-baseline.rec', (s) => uglystikGroundPrelude(s)),
  dlg: await hashOf('tests/inputs/dlg-baseline.rec', dlgRecPrelude),
  tigermoth: await hashOf('tests/inputs/tigermoth-baseline.rec', (s) => tigermothGroundPrelude(s)),
};
const names = Object.keys(got);
gate('S15', 'every other aircraft unmoved', names.every((k) => got[k] === u[k]),
  names.map((k) => got[k]).join(', '), names.map((k) => u[k]).join(', '));

const stickRec = await recOf('tests/inputs/slick-baseline.rec');
const stickOpts = { ...replayBase, prelude: (s) => slickGroundPrelude(s) };
const nodeHash = (await replayTrace(await loadSim(wasmBytes), stickRec, stickOpts)).slice(0, 16);
const nodeAgain = (await replayTrace(await loadSim(wasmBytes), stickRec, stickOpts)).slice(0, 16);
if (!findChrome()) {
  gate('S16', 'Node and Chrome agree', null, `node ${nodeHash} twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}, no Chrome here`, 'identical');
} else {
  const server = await startServer(root);
  try {
    const out = await runBrowserHarness(`${server.origin}/tests/browser/wing-harness.html?plane=slick`);
    const result = out.result || {};
    const chromeHash = result.ok ? String(result.hash).slice(0, 16) : `error: ${result.message || result.errorName || JSON.stringify(out).slice(0, 80)}`;
    gate('S16', 'Node and Chrome agree', nodeAgain === nodeHash && result.ok && chromeHash === nodeHash, `node ${nodeHash} (twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}), chrome ${chromeHash}`, 'identical');
  } finally {
    await server.close();
  }
}

console.log('');
for (const [id, name, measured, b, status] of rows) {
  console.log(`  ${status.padEnd(4)}  ${id.padEnd(4)} ${name.padEnd(52)} ${String(measured).padEnd(70)} ${b}`);
}
console.log(`\n${failed ? `${failed} FAILED, ` : ''}${rows.length - failed - skipped} of ${rows.length} gates hold${skipped ? `, ${skipped} SKIPPED (a skip is not a pass)` : ''}`);
process.exit(failed ? 1 : 0);
