/*
 * cap580-gates.js: the Extreme Flight 67 in CAP 580 plant against the
 * bands in tests/cap580-thresholds.json.
 *
 * Checks C1 to C17 from docs/CAP580-STAGE1.md, the Extra 300 3D's set
 * (extra-gates.js) on this aircraft's own derivation, npm run
 * cap580:derive. C1 to C5 are its performance as an aeroplane: a level
 * cruise, the stall, a glide, its top speed and a roll rate at full
 * aileron. C6 to C12 are the 3D regime its measured thrust, 2.6 times its
 * weight, opens: hanging on the prop, straight up at full throttle, the
 * torque roll and the ailerons in the wash beating it, full elevator and
 * rudder at zero airspeed (and nothing with the prop stopped), the
 * harrier and the knife edge. C6 holds the hover stick to the bench
 * table's own, 0.535: the plant turns the stick into rpm by the bench's
 * measured curve (throttle_rpm). C13 and C14 are its taildragger gear. C15 holds
 * the Extra's, the Night Timber's and the Hercules' recorded hashes where
 * they were before this aircraft (extra:gates E15 holds the rest), C16
 * flies the CAP's recording in Node and in headless Chrome and holds the
 * two hashes equal, and C17 has the figure judge (src/game/figuredetect.js)
 * name the hover, the torque roll, the harrier and the knife edge it
 * watched C6, C8, C11 and C12 fly. Bands are never widened here: a plant
 * outside one is a finding for the derivation. Run with npm run
 * cap580:gates.
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
  CAP_AIRFRAME, capGroundPrelude, capTakeoffSticks, hangSticks, fly, wingDebug, wheelLoads, attitude, must,
  extraGroundPrelude, nighttimberGroundPrelude, herculesGroundPrelude, RC_STEP_MS,
} from '../tests/lib/wingpilot.js';
import { FigureDetector } from '../src/game/figuredetect.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const th = JSON.parse(await readFile(join(root, 'tests/cap580-thresholds.json'), 'utf8'));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const DEG = 180 / Math.PI;

async function capSim() {
  const sim = await loadSim(wasmBytes);
  if (sim.init(configText) !== SIM_OK) throw new Error('sim_init failed');
  if (sim.e.sim_set_airframe(CAP_AIRFRAME) !== SIM_OK) throw new Error('sim_set_airframe failed');
  if (sim.setCellVoltage(4.1) !== SIM_OK) throw new Error('sim_set_cell_voltage failed');
  return sim;
}

const rows = [];
let failed = 0;
let skipped = 0;
let waits = 0;
function gate(id, name, ok, measured, band) {
  rows.push([id, name, measured, band, ok === null ? 'SKIP' : (ok ? 'ok' : 'FAIL')]);
  if (ok === null) skipped += 1;
  else if (!ok) failed += 1;
}
/* A measured figure today's plant cannot meet, listed for the lane that
 * owns the plant: printed with its numbers, never counted as a pass. */
function waiting(id, name, measured, band) {
  rows.push([id, name, measured, band, 'WAIT']);
  waits += 1;
}
/* The figure judge watching the flights it is shown, as main.js feeds it
 * every plant step on a fixed wing. */
const named = [];
let judge = null;
const watch = () => { judge = new FigureDetector((fig) => named.push(fig.figure)); };
const unwatch = () => { if (judge) judge.flush(); judge = null; };
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
  const s = sim.readState().state;
  if (judge) judge.step(RC_STEP_MS / 1000, s);
  return s;
}
/* Nose straight up, still, at 60 m. cos and sin of 45 deg. */
const H = Math.SQRT1_2;
function hanging(sim) {
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_set_pose(0, 600, 60, H, 0, -H, 0), 'sim_set_pose');
  clockMs = 0;
}
/* The throttle that holds the height, a rate loop with an integral,
 * starting from the stick given. */
function heightHold(start) {
  let i = start;
  return (s, vzTarget = 0) => {
    i = Math.max(0, Math.min(1, i + 0.0008 * (vzTarget - s[6])));
    return clamp(i + 0.08 * (vzTarget - s[6]));
  };
}

console.log('cap580 gates: the plant against docs/CAP580-STAGE1.md');
const sim = await capSim();
must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
check: {
  if (sim.e.sim_airframe() !== CAP_AIRFRAME) {
    gate('C0', 'the CAP is selected', false, `airframe ${sim.e.sim_airframe()}`, `${CAP_AIRFRAME}`);
    break check;
  }

  const e1 = fly(sim, { duty: th.c1_level_75.duty, vzTarget: 0, seconds: 30, speed0: th.c1_level_75.speed0, ...slow });
  gate('C1', 'cruise: level speed at 75 percent', within(e1.v, th.c1_level_75), `${e1.v.toFixed(2)} m/s, sink ${(-e1.vz).toFixed(2)}`, band(th.c1_level_75));

  let stallV = null;
  fly(sim, {
    duty: 0, speed0: th.c2_stall.speed0, seconds: 14, pitchMax: 0.7, pitchMin: -0.3, ...slow,
    pitchTargetFn: (ms) => Math.min(0.6, 0.06 * ms / 1000),
    onStep: (o) => { if (stallV == null && o.ms > 1000 && wingDebug(sim)[0] > th.c2_stall.alphaStall) stallV = o.v; },
  });
  gate('C2', 'stall speed, power off', stallV != null && within(stallV, th.c2_stall), stallV == null ? 'no stall reached' : `${stallV.toFixed(2)} m/s`, band(th.c2_stall));

  const g3 = fly(sim, { duty: 0, vTarget: th.c3_glide.speed, seconds: 30, ...slow, speed0: th.c3_glide.speed });
  const ratio = Math.sqrt(Math.max(0, g3.v * g3.v - g3.vz * g3.vz)) / -g3.vz;
  gate('C3', 'glide ratio, power off', within(ratio, th.c3_glide), `${ratio.toFixed(2)} at ${g3.v.toFixed(2)} m/s, sink ${(-g3.vz).toFixed(2)}`, band(th.c3_glide));

  const e4 = fly(sim, { duty: th.c4_top.duty, vzTarget: 0, seconds: 40, speed0: th.c4_top.speed0, ...slow });
  gate('C4', 'top speed, level', within(e4.v, th.c4_top), `${e4.v.toFixed(2)} m/s, sink ${(-e4.vz).toFixed(2)}`, band(th.c4_top));

  /* C5: level at the roll speed, then full right aileron: the peak roll
   * rate in the first second over the speed then. */
  {
    const t5 = th.c5_roll;
    const r = fly(sim, { duty: t5.duty, vTarget: t5.speed, seconds: 15, speed0: t5.speed, ...slow });
    clockMs = r.endMs;
    let peak = 0;
    let vAt = t5.speed;
    for (let ms = 0; ms < 1000; ms += RC_STEP_MS) {
      const s = step(sim, [1, 0, 0, t5.duty]);
      if (s[11] > peak) { peak = s[11]; vAt = speed(s); }
    }
    const pb2v = peak * t5.span / (2 * vAt);
    gate('C5', 'roll rate, full aileron, pb/2V', within(pb2v, t5), `${pb2v.toFixed(3)}: ${(peak * DEG).toFixed(0)} deg/s at ${vAt.toFixed(1)} m/s`, band(t5));
  }

  /* C6: hanging on the prop. From still, nose up, the nose held by the
   * elevator and rudder in the slipstream, the roll rate held at nothing
   * on the ailerons as a 3D pilot holds the torque (with an integral, as a
   * pilot's hand settles on the aileron the torque needs: the CAP's net
   * torque is most of what full aileron gives), the height by the
   * throttle: the mean stick and the height's drift over 3 to 8 s. */
  {
    const t6 = th.c6_hover;
    hanging(sim);
    watch();
    const thr = heightHold(th.c6_hover.derived);
    let sum = 0;
    let n = 0;
    let z3 = null;
    let s = sim.readState().state;
    let zMin = Infinity, zMax = -Infinity;
    let iR = 0;
    for (let ms = 0; ms < 8000; ms += RC_STEP_MS) {
      const t = thr(s);
      iR = Math.max(-1, Math.min(1, iR - 2.0 * s[11] * RC_STEP_MS / 1000));
      s = step(sim, [...hangSticks(s, { rollStick: clamp(iR - 0.8 * s[11]) }), t]);
      if (ms >= 3000) {
        sum += t; n += 1;
        if (z3 === null) z3 = s[3];
        zMin = Math.min(zMin, s[3]); zMax = Math.max(zMax, s[3]);
      }
    }
    unwatch();
    const mean = sum / n;
    const drift = zMax - zMin;
    gate('C6', 'hangs on the prop at the bench\'s hover throttle', within(mean, t6) && drift <= t6.maxHeightDrift,
      `stick ${mean.toFixed(4)}, height within ${drift.toFixed(2)} m, nose ${(attitude(s).pitch * DEG).toFixed(1)} deg`, `${band(t6)}, within ${t6.maxHeightDrift} m`);
  }

  /* C7: straight up at full throttle from the hover: the climb speed after
   * 8 s, when it has settled. */
  {
    hanging(sim);
    let s = sim.readState().state;
    for (let ms = 0; ms < 8000; ms += RC_STEP_MS) {
      s = step(sim, [...hangSticks(s, { rollRate: 0 }), 1]);
    }
    gate('C7', 'climbs straight up at full throttle', within(s[6], th.c7_vertical), `${s[6].toFixed(2)} m/s up, nose ${(attitude(s).pitch * DEG).toFixed(1)} deg`, band(th.c7_vertical));
  }

  /* C8, E9: the torque roll, the ailerons let go, then full right
   * aileron: the mean roll rate over 3 to 6 s (right positive). */
  const rollHanging = (rollStick, judged = false) => {
    hanging(sim);
    if (judged) watch();
    const thr = heightHold(th.c6_hover.derived);
    let s = sim.readState().state;
    let sum = 0;
    let n = 0;
    for (let ms = 0; ms < 6000; ms += RC_STEP_MS) {
      s = step(sim, [...hangSticks(s, { rollStick }), thr(s)]);
      if (ms >= 3000) { sum += s[11]; n += 1; }
    }
    unwatch();
    return { p: sum / n * DEG, pitch: attitude(s).pitch * DEG };
  };
  {
    const r8 = rollHanging(0, true);
    gate('C8', 'torque roll: the ailerons let go, it turns left', r8.p < 0 && within(-r8.p, th.c8_torque_roll), `${r8.p.toFixed(0)} deg/s ${r8.p < 0 ? 'left' : 'RIGHT'}, nose ${r8.pitch.toFixed(1)} deg`, `${th.c8_torque_roll.min} to ${th.c8_torque_roll.max} left`);
    const r9 = rollHanging(1);
    gate('C9', 'full right aileron in the wash beats the torque', r9.p > 0 && within(r9.p, th.c9_aileron_hover), `${r9.p.toFixed(0)} deg/s ${r9.p > 0 ? 'right' : 'LEFT'}, nose ${r9.pitch.toFixed(1)} deg`, `${th.c9_aileron_hover.min} to ${th.c9_aileron_hover.max} right`);
  }

  /* C10: hanging still, one full stick for 20 ms from rest at the hover
   * throttle, and again with the prop stopped: the first angular
   * acceleration, nose up positive and nose right positive. */
  {
    const t10 = th.c10_zero_speed;
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
    const hoverDuty = th.c6_hover.derived;
    const up = kick([0, 1, 0], hoverDuty);
    const upDead = kick([0, 1, 0], 0);
    const right = kick([0, 0, 1], hoverDuty);
    const rightDead = kick([0, 0, 1], 0);
    gate('C10', 'full elevator at zero airspeed, in the wash', up.q >= t10.pitchMin && up.q <= t10.pitchMax && Math.abs(upDead.q) <= t10.deadMax * up.q,
      `${up.q.toFixed(1)} rad/s^2 nose up; prop stopped ${upDead.q.toFixed(2)}`, `${t10.pitchMin} to ${t10.pitchMax}; stopped under ${t10.deadMax * 100} percent`);
    gate('C10b', 'full rudder at zero airspeed, in the wash', right.r >= t10.yawMin && right.r <= t10.yawMax && Math.abs(rightDead.r) <= t10.deadMax * right.r,
      `${right.r.toFixed(1)} rad/s^2 nose right; prop stopped ${rightDead.r.toFixed(2)}`, `${t10.yawMin} to ${t10.yawMax}; stopped under ${t10.deadMax * 100} percent`);
  }

  /* C11: the harrier. From level at 12 m/s the nose is raised over 5 s
   * until the angle of attack is 40 deg and held there on the elevator,
   * the throttle holding the height, the wings on the ailerons and the
   * heading on the rudder, each with an integral as a pilot's hands hold
   * a trim, for 20 s. The wing rocks as it goes into the stall, which is
   * what a harrier does; the mean of the last 5 s, and the rock's spread
   * over the last 10 s. C11b: flown again in AS3X, the receiver the CAP
   * flies with, which must damp the rock, its bank's spread under
   * Manual's, as the Extra's E11b. */
  {
    const t11 = th.c11_harrier;
    const harrier = (mode) => {
      must(sim.e.sim_wing_set_stab(mode), 'sim_wing_set_stab');
      const r = fly(sim, { duty: 0.5, vzTarget: 0, seconds: 8, speed0: t11.speed0, ...slow });
      clockMs = r.endMs;
      if (mode === 0) watch();
      const target = t11.alphaDeg / DEG;
      const thr = heightHold(t11.duty0);
      let iP = 0;
      let iB = 0;
      let s = sim.readState().state;
      const psi0 = Math.atan2(2 * (s[7] * s[10] + s[8] * s[9]), 1 - 2 * (s[9] * s[9] + s[10] * s[10]));
      let sv = 0, sd = 0, se = 0, n = 0, worstBank = 0, zMin = Infinity, zMax = -Infinity, sa = 0;
      const banks = [];
      for (let ms = 0; ms < 20000; ms += RC_STEP_MS) {
        const alpha = wingDebug(sim)[0];
        const bank = fullBank(s);
        const psi = Math.atan2(2 * (s[7] * s[10] + s[8] * s[9]), 1 - 2 * (s[9] * s[9] + s[10] * s[10]));
        const at = Math.min(target, 0.1 + target * ms / 5000);
        iP = Math.max(-1, Math.min(1, iP + 1.5 * (at - alpha) * RC_STEP_MS / 1000));
        const pitchStick = clamp(1.5 * (at - alpha) + 0.15 * s[12] + iP);
        iB = Math.max(-0.5, Math.min(0.5, iB - 1.0 * bank * RC_STEP_MS / 1000));
        const roll = clamp(-0.6 * bank - 0.06 * s[11] + iB);
        let dpsi = psi - psi0;
        while (dpsi > Math.PI) dpsi -= 2 * Math.PI;
        while (dpsi < -Math.PI) dpsi += 2 * Math.PI;
        const yaw = clamp(1.0 * dpsi + 0.2 * s[13]);
        const t = thr(s);
        s = step(sim, [roll, pitchStick, yaw, t]);
        if (ms >= 10000) banks.push(bank * DEG);
        if (ms >= 15000) {
          sv += speed(s); sd += t; se += pitchStick; n += 1; sa += wingDebug(sim)[0];
          worstBank = Math.max(worstBank, Math.abs(bank * DEG));
          zMin = Math.min(zMin, s[3]); zMax = Math.max(zMax, s[3]);
        }
      }
      if (mode === 0) unwatch();
      must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
      const mean = banks.reduce((x, y) => x + y, 0) / banks.length;
      const spread = Math.sqrt(banks.reduce((x, y) => x + (y - mean) ** 2, 0) / banks.length);
      return { v: sv / n, d: sd / n, e: se / n, a: sa / n * DEG, worstBank, spread, drift: zMax - zMin };
    };
    const m = harrier(0);
    const g = harrier(3);
    gate('C11', 'harrier: level at 40 deg of alpha', m.v >= t11.vMin && m.v <= t11.vMax && m.d >= t11.dutyMin && m.d <= t11.dutyMax && m.e < 1 && m.worstBank <= t11.maxBankDeg && m.drift <= t11.maxHeightDrift,
      `${m.v.toFixed(2)} m/s at throttle ${m.d.toFixed(3)}, alpha ${m.a.toFixed(1)} deg, elevator stick ${m.e.toFixed(2)}, bank under ${m.worstBank.toFixed(1)} (sd ${m.spread.toFixed(1)}), height within ${m.drift.toFixed(2)} m`,
      `${t11.vMin} to ${t11.vMax} m/s, ${t11.dutyMin} to ${t11.dutyMax}, elevator short of full, bank under ${t11.maxBankDeg}, within ${t11.maxHeightDrift} m`);
    gate('C11b', 'harrier in AS3X: the gyro damps the rock', g.spread < m.spread && g.drift <= t11.maxHeightDrift,
      `bank sd ${g.spread.toFixed(1)} against Manual's ${m.spread.toFixed(1)}, worst ${g.worstBank.toFixed(1)}, height within ${g.drift.toFixed(2)} m`,
      `under Manual's, within ${t11.maxHeightDrift} m`);
  }

  /* C12: the knife edge. From level at the gate's speed, rolled right to
   * 90 deg on the ailerons. A pilot holds the height on the rudder through
   * the sideslip: the height's rate asks for a sideslip, the rudder flies
   * the aircraft onto it (left rudder, nose toward the sky, is more), each
   * with an integral, and the yaw rate damped; the speed on the throttle,
   * the heading on the elevator, for 15 s; the mean of the last 5. */
  const knifeEdge = (V) => {
    const r = fly(sim, { duty: 0.6, vTarget: V, seconds: 10, speed0: V, ...slow });
    clockMs = r.endMs;
    let s = sim.readState().state;
    let iA = 0, iH = 0, iB = 0, iT = 0.6;
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
      iT = Math.max(0, Math.min(1, iT + 0.0005 * (V - speed(s))));
      const t = clamp(iT + 0.1 * (V - speed(s)));
      s = step(sim, [roll, pitchStick, yaw, t]);
      if (ms >= 10000) {
        sb += wingDebug(sim)[1]; sd += t; sr += yaw; n += 1;
        zMin = Math.min(zMin, s[3]); zMax = Math.max(zMax, s[3]);
        worstBank = Math.max(worstBank, Math.abs(bank * DEG - 90));
      }
    }
    return { bm: sb / n * DEG, d: sd / n, rd: sr / n, drift: zMax - zMin, worstBank };
  };
  /* C12's knife edge is also C17's: the judge names it by the wing in
   * the vertical plane (FAI F3P-AA 23), whatever sideslip holds it up. */
  watch();
  const k12 = knifeEdge(th.c12_knife_edge.speed);
  unwatch();
  {
    const t12 = th.c12_knife_edge;
    const k = k12;
    const { bm, d, rd, worstBank } = k;
    gate('C12', 'knife edge: rolled to 90 deg, the rudder holding height', bm >= t12.betaMin && bm <= t12.betaMax && d >= t12.dutyMin && d <= t12.dutyMax && Math.abs(rd) < 1 && k.drift <= t12.maxHeightDrift,
      `sideslip ${bm.toFixed(1)} deg at throttle ${d.toFixed(3)}, rudder stick ${rd.toFixed(2)}, bank off 90 by under ${worstBank.toFixed(1)}, height within ${k.drift.toFixed(2)} m`,
      `${t12.betaMin} to ${t12.betaMax} deg, ${t12.dutyMin} to ${t12.dutyMax}, rudder short of full, within ${t12.maxHeightDrift} m`);
  }
  /* C13: on the strip at the drawn pose, 3 s with every stick centred. */
  const onStrip = () => {
    must(sim.reset(), 'sim_reset');
    capGroundPrelude(sim);
    clockMs = 0;
  };
  {
    const r13 = th.c13_rest;
    onStrip();
    let hull = 0;
    let s = null;
    for (let ms = 0; ms < 3000; ms += RC_STEP_MS) {
      s = step(sim, [0, 0, 0, 0]);
      hull = Math.max(hull, sim.e.sim_ground_contacts());
    }
    const loads = wheelLoads(sim);
    const rest = { pitch: attitude(s).pitch * DEG, z: s[3], tail: loads[2] / (loads[0] + loads[1] + loads[2]) };
    gate('C13', 'standing on its wheels', rest.pitch >= r13.pitchMin && rest.pitch <= r13.pitchMax && rest.z >= r13.zMin && rest.z <= r13.zMax && rest.tail >= r13.tailMin && rest.tail <= r13.tailMax && hull === 0 && loads[3] === 0,
      `${rest.pitch.toFixed(2)} deg, CG ${rest.z.toFixed(4)} m, tail ${(rest.tail * 100).toFixed(1)} percent, loads ${loads.map((f) => f.toFixed(2)).join(' ')} N, hull ${hull}`,
      `${r13.pitchMin} to ${r13.pitchMax} deg, ${r13.zMin} to ${r13.zMax} m, ${r13.tailMin * 100} to ${r13.tailMax * 100} percent, no hull or prop`);
  }

  /* C14: full throttle from standing, the take off sticks of
   * wingpilot.js; liftoff is the last step on the wheels before 200 ms
   * clear of them. */
  {
    const t14 = th.c14_takeoff;
    onStrip();
    for (let ms = 0; ms < 1000; ms += RC_STEP_MS) step(sim, [0, 0, 0, 0]);
    const x0 = sim.readState().state[1];
    let last = null;
    let off = 0;
    let lof = null;
    for (let ms = 0; ms < 6000 && !lof; ms += RC_STEP_MS) {
      const s = step(sim, [...capTakeoffSticks(sim.readState().state), 1]);
      const loaded = wheelLoads(sim).some((f) => f > 0);
      if (loaded) {
        last = { dist: s[1] - x0, v: speed(s), t: ms / 1000, y: s[2] };
        off = 0;
      } else {
        off += RC_STEP_MS;
        if (off >= 200) lof = last;
      }
    }
    gate('C14', 'takes off, tail up, from standing', lof != null && lof.dist >= t14.distMin && lof.dist <= t14.distMax,
      lof == null ? 'never left the ground' : `${lof.dist.toFixed(2)} m to liftoff at ${lof.v.toFixed(2)} m/s, ${lof.t.toFixed(2)} s, ${lof.y.toFixed(2)} m off the line`,
      `${t14.distMin} to ${t14.distMax} m`);
  }
  /* C17: what the judge named on the four 3D flights above, in order. */
  {
    const want = th.c17_figures.named;
    const got = want.map((id) => named.includes(id));
    gate('C17', 'the figure judge names its 3D figures', got.every(Boolean),
      `named ${named.join(', ') || 'nothing'} (the knife edge at ${th.c12_knife_edge.speed} m/s held ${k12.bm.toFixed(1)} deg of sideslip)`, want.join(', '));
  }
}

const quadTh = JSON.parse(await readFile(join(root, 'tests/thresholds.json'), 'utf8'));
const replayBase = { configText, renderHz: quadTh.replay.canonical_render_hz.value, traceStrideMs: quadTh.replay.trace_stride_ms.value };
const recOf = async (f) => decodeRec(new Uint8Array(await readFile(join(root, f))));
const hashOf = async (f, prelude) => (await replayTrace(await loadSim(wasmBytes), await recOf(f), { ...replayBase, prelude })).slice(0, 16);
const u = th.c15_unmoved;
const got = {
  extra: await hashOf('tests/inputs/extra-baseline.rec', (s) => extraGroundPrelude(s)),
  nighttimber: await hashOf('tests/inputs/nighttimber-baseline.rec', (s) => nighttimberGroundPrelude(s, { flaps: 1 })),
  hercules: await hashOf('tests/inputs/hercules-baseline.rec', (s) => herculesGroundPrelude(s)),
};
const names = Object.keys(got);
gate('C15', 'the other 3D aircraft and the Hercules unmoved', names.every((k) => got[k] === u[k]),
  names.filter((k) => got[k] !== u[k]).map((k) => `${k} ${got[k]}`).join(', ') || `all ${names.length} as pinned`, 'the pins in c15_unmoved');

const stickRec = await recOf('tests/inputs/cap580-baseline.rec');
const stickOpts = { ...replayBase, prelude: (s) => capGroundPrelude(s) };
const nodeHash = (await replayTrace(await loadSim(wasmBytes), stickRec, stickOpts)).slice(0, 16);
const nodeAgain = (await replayTrace(await loadSim(wasmBytes), stickRec, stickOpts)).slice(0, 16);
if (!findChrome()) {
  gate('C16', 'Node and Chrome agree', null, `node ${nodeHash} twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}, no Chrome here`, 'identical');
} else {
  const server = await startServer(root);
  try {
    const out = await runBrowserHarness(`${server.origin}/tests/browser/wing-harness.html?plane=cap`);
    const result = out.result || {};
    const chromeHash = result.ok ? String(result.hash).slice(0, 16) : `error: ${result.message || result.errorName || JSON.stringify(out).slice(0, 80)}`;
    gate('C16', 'Node and Chrome agree', nodeAgain === nodeHash && result.ok && chromeHash === nodeHash, `node ${nodeHash} (twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}), chrome ${chromeHash}`, 'identical');
  } finally {
    await server.close();
  }
}

console.log('');
for (const [id, name, measured, b, status] of rows) {
  console.log(`  ${status.padEnd(4)}  ${id.padEnd(4)} ${name.padEnd(52)} ${String(measured).padEnd(70)} ${b}`);
}
console.log(`\n${failed ? `${failed} FAILED, ` : ''}${rows.length - failed - skipped - waits} of ${rows.length} gates hold${skipped ? `, ${skipped} SKIPPED (a skip is not a pass)` : ''}${waits ? `, ${waits} WAIT on the plant (not a pass: docs/CAP580-STAGE1.md lists each)` : ''}`);
process.exit(failed ? 1 : 0);
