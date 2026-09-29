/*
 * quickie-gates.js: the Quickie 500 plant against the bands in
 * tests/quickie-thresholds.json.
 *
 * Checks Q1 to Q18 from docs/QUICKIE-STAGE1.md, on the pattern of
 * uglystik-gates.js. Q1 to Q4 are its performance: the top speed the class
 * is about, its stall, a long flat glide and a .40's climb. Q5 to Q9 are
 * what a pylon racer is for, flown in Manual so it is the airframe doing
 * it: a fast roll that stops where the stick is centred, a 6 g pylon turn
 * that bleeds its speed and needs no rudder, carrying its speed once the
 * throttle is closed, a 10 g corner with no snap, and a bank it holds on
 * the straight. Q11 is the engine's torque; Q12 to Q15 the ground: the
 * taildragger's rest on its mains and skid, a take off from the ground as
 * the class runs it, a landing with no bounce, and the glow idle. Q16
 * holds every other aircraft's recorded hash where it was before this one
 * existed, and Q17 flies the Quickie's recording in Node and in headless
 * Chrome and holds the two hashes equal. Q18 is its symmetric section: on
 * its back as upright with a touch of push. There is no Q10: the phugoid
 * at race speed is damped to 0.9 of critical (scripts/quickie-derive.js)
 * and has no period to measure. Bands are never widened here: a plant
 * outside one is a finding for the derivation. Run with
 * npm run quickie:gates.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { replayTrace } from '../tests/lib/replay.js';
import { decodeRec } from '../tests/lib/recfile.js';
import { findChrome, runBrowserHarness } from '../tests/lib/browser.js';
import { startServer } from '../tests/lib/server.js';
import { GROUND_MU, GROUND_E } from '../src/game/collide.js';
import {
  QUICKIE_AIRFRAME, quickieGroundPrelude, quickieTakeoffSticks, quickieTurnSticks, edgeLevel, edgeRoll, edgeHeading, fullBank,
  fly, glide, stallSpeed, propTorque, wingDebug, wheelLoads, attitude, must, RC_STEP_MS,
  wingPrelude, skyPrelude, cubGroundPrelude, gliderRecPrelude, bramorPrelude, bramorChutePrelude,
  slowstickGroundPrelude, bombshellGroundPrelude, timberRecPrelude, timberFloatRecPrelude, kadetGroundPrelude,
  p51RecPrelude, p51AirPrelude, edgeGroundPrelude, f16GroundPrelude, extraGroundPrelude, uglystikGroundPrelude, zagiPrelude, dlgRecPrelude,
} from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const th = JSON.parse(await readFile(join(root, 'tests/quickie-thresholds.json'), 'utf8'));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const DEG = 180 / Math.PI;
/* The plant's span, FW_QUICKIE1293, for the helix angle. */
const SPAN = 1.2934;

async function quickieSim() {
  const sim = await loadSim(wasmBytes);
  if (sim.init(configText) !== SIM_OK) throw new Error('sim_init failed');
  if (sim.e.sim_set_airframe(QUICKIE_AIRFRAME) !== SIM_OK) throw new Error('sim_set_airframe failed');
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
const speed = (s) => Math.hypot(s[4], s[5], s[6]);
const pct = (a, b) => 100 * Math.abs(a - b) / b;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

let clockMs = 0;
function step(sim, sticks) {
  must(sim.input(clockMs / 1000, ...sticks), 'sim_input');
  must(sim.step(RC_STEP_MS), 'sim_step');
  clockMs += RC_STEP_MS;
  const s = sim.readState().state;
  const loads = wheelLoads(sim);
  return { s, loads, loaded: loads.slice(0, 3).some((f) => f > 0), hull: sim.e.sim_ground_contacts() };
}

/* edgeLevel's hands with an integral on the elevator, the Stik's, for the
 * push on its back. */
function level(s, { b = 0, trim }) {
  const [roll, stick] = edgeLevel(s, { b, trim });
  const { pitch } = attitude(s);
  const sgn = Math.cos(fullBank(s)) < 0 ? -1 : 1;
  const pitchT = Math.max(-0.2, Math.min(0.2, trim.v - 0.05 * s[6]));
  trim.i = Math.max(-0.8, Math.min(0.8, (trim.i ?? 0) + 0.004 * sgn * (pitchT - pitch)));
  return [roll, Math.max(-1, Math.min(1, stick + trim.i))];
}

/* Level flight at `speed0` along world +x, 300 m up, upright or on its
 * back, for `settleMs` at `duty`: the state after and the means over its
 * last two seconds. */
function settle(sim, { inverted = false, speed0 = 39, duty = 1, settleMs = 8000 } = {}) {
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
  must(sim.e.sim_set_pose(0, 0, 300, inverted ? 0 : 1, inverted ? 1 : 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(speed0), 'sim_wing_launch');
  clockMs = 0;
  const trim = { v: 0 };
  const b = inverted ? Math.PI : 0;
  let o = { s: sim.readState().state };
  const tail = [];
  for (let ms = 0; ms < settleMs; ms += RC_STEP_MS) {
    const [roll, pitch] = level(o.s, { b, trim });
    o = step(sim, [roll, pitch, 0, duty]);
    if (ms >= settleMs - 2000) tail.push({ v: speed(o.s), vz: o.s[6], stick: pitch, alpha: wingDebug(sim)[0] });
  }
  const mean = (k) => tail.reduce((a, x) => a + x[k], 0) / tail.length;
  return { s: o.s, v: mean('v'), vz: mean('vz'), stick: mean('stick'), alpha: mean('alpha'), trim };
}

/* A level 180 deg turn at load factor n from flat out, full throttle,
 * ailerons and elevator only. The turn is counted from where the bank
 * first reaches within 5 deg of the turn's; the speed then and at 180 deg
 * of heading, the radius from the speed and the heading rate, the worst
 * sideslip, and after the roll in the worst bank error and roll rate. */
function pylonTurn(sim, n) {
  const s0 = settle(sim, { settleMs: 8000 }).s;
  const bankT = Math.acos(1 / n);
  const turn = {};
  let o = { s: s0 };
  let start = null;
  let heading = 0;
  let prev = edgeHeading(s0);
  let worstBeta = 0, worstBankErr = 0, worstP = 0, rSum = 0, rN = 0, nSum = 0;
  for (let ms = 0; ms < 8000; ms += RC_STEP_MS) {
    const d = wingDebug(sim);
    o = step(sim, [...quickieTurnSticks(o.s, d[3], { n, turn }), 0, 1]);
    const h = edgeHeading(o.s);
    const bank = fullBank(o.s);
    if (start === null && Math.abs(bank) >= bankT - 5 / DEG) {
      start = { v: speed(o.s), ms };
      prev = h;
      continue;
    }
    if (start === null) {
      prev = h;
      continue;
    }
    const dh = wrap(h - prev);
    prev = h;
    heading += dh;
    const dd = wingDebug(sim);
    worstBeta = Math.max(worstBeta, Math.abs(dd[1]) * DEG);
    if (ms - start.ms > 300) {
      worstBankErr = Math.max(worstBankErr, Math.abs(wrap(Math.abs(bank) - bankT)) * DEG);
      worstP = Math.max(worstP, Math.abs(o.s[11]) * DEG);
    }
    const v = speed(o.s);
    if (Math.abs(dh) > 0) { rSum += v / (Math.abs(dh) / (RC_STEP_MS / 1000)); rN += 1; }
    nSum += dd[2] * dd[3] * 0.32565 / (1.5876 * 9.81);
    if (Math.abs(heading) >= Math.PI) {
      return { ok: true, v0: start.v, v1: v, lostPct: 100 * (start.v - v) / start.v, r: rSum / rN, beta: worstBeta, bankErr: worstBankErr, p: worstP, t: (ms - start.ms) / 1000, n: nSum / rN, dz: o.s[3] - s0[3] };
    }
  }
  return { ok: false };
}

console.log('quickie gates: the plant against docs/QUICKIE-STAGE1.md');
const sim = await quickieSim();
check: {
  if (sim.e.sim_airframe() !== QUICKIE_AIRFRAME) {
    gate('Q0', 'the Quickie is selected', false, `airframe ${sim.e.sim_airframe()}`, `${QUICKIE_AIRFRAME}`);
    break check;
  }

  const top = settle(sim, { settleMs: 20000 });
  gate('Q1', 'top speed, level, full throttle', within(top.v, th.q1_top) && Math.abs(top.vz) < 0.2,
    `${top.v.toFixed(2)} m/s (${(top.v / 0.44704).toFixed(1)} mph), sink ${(-top.vz).toFixed(2)}, elevator stick ${top.stick.toFixed(3)}`, band(th.q1_top));

  const q2 = stallSpeed(sim, th.q2_stall.alphaStall);
  gate('Q2', 'stall speed, power off', q2 != null && within(q2, th.q2_stall), q2 == null ? 'no stall reached' : `${q2.toFixed(2)} m/s`, band(th.q2_stall));

  const q3 = glide(sim, th.q3_glide.speed);
  gate('Q3', 'glide ratio at 1.4 Vs, power off', within(q3.ratio, th.q3_glide), `${q3.ratio.toFixed(2)} at ${q3.v.toFixed(1)} m/s, sink ${q3.sink.toFixed(2)}`, band(th.q3_glide));

  let best = null;
  for (const vT of th.q4_climb.speeds) {
    const r = fly(sim, { duty: 1, speed0: vT, vTarget: vT, seconds: 12, pitchMax: 1.4, pitchMin: -0.5, trimMax: 1.2, guard: false, start: [0, 0, 300, 1, 0, 0, 0] });
    if (!best || r.vz > best.vz) best = { v: r.v, vz: r.vz, pitchDeg: r.pitch * DEG };
  }
  gate('Q4', 'best climb, full throttle', within(best.vz, th.q4_climb), `${best.vz.toFixed(2)} m/s at ${best.v.toFixed(1)} m/s, pitch ${best.pitchDeg.toFixed(0)} deg`, band(th.q4_climb));

  /* Q5: full right aileron from level flat out, the peak rate; then the
   * same held for 0.3 s and centred, the bank it runs on. */
  {
    settle(sim, { speed0: th.q5_roll.speed, settleMs: 4000 });
    let peak = 0, vAt = 0;
    for (let t = 0; t < 1500; t += RC_STEP_MS) {
      const o = step(sim, [1, 0, 0, 1]);
      if (Math.abs(o.s[11]) > Math.abs(peak)) { peak = o.s[11]; vAt = speed(o.s); }
    }
    const pb = Math.abs(peak) * SPAN / (2 * vAt);
    gate('Q5', 'full aileron flat out: pb/2V', within(pb, th.q5_roll),
      `${pb.toFixed(4)}: ${Math.abs(peak * DEG).toFixed(0)} deg/s at ${vAt.toFixed(1)} m/s, ${peak > 0 ? 'right' : 'LEFT'}`, band(th.q5_roll));

    const t5 = th.q5_stop;
    let o = { s: settle(sim, { speed0: th.q5_roll.speed, settleMs: 4000 }).s };
    let turned = 0;
    for (let t = 0; t < t5.holdMs; t += RC_STEP_MS) { o = step(sim, [1, 0, 0, 1]); turned += o.s[11] * RC_STEP_MS / 1000; }
    const atRelease = turned;
    const pRelease = o.s[11] * DEG;
    let rateAfter = 0;
    for (let t = 0; t < 1000; t += RC_STEP_MS) {
      o = step(sim, [0, 0, 0, 1]);
      turned += o.s[11] * RC_STEP_MS / 1000;
      if (t + RC_STEP_MS === t5.afterMs) rateAfter = Math.abs(o.s[11]) * DEG;
    }
    const overrun = (turned - atRelease) * DEG;
    gate('Q5b', 'centred, the roll stops: fast, not twitchy', Math.abs(overrun) <= t5.maxOverrunDeg && rateAfter <= t5.maxRateAfterDegS,
      `${(atRelease * DEG).toFixed(0)} deg in ${t5.holdMs} ms at ${pRelease.toFixed(0)} deg/s, ran on ${overrun.toFixed(1)} deg, ${rateAfter.toFixed(1)} deg/s ${t5.afterMs} ms after`,
      `on under ${t5.maxOverrunDeg} deg, under ${t5.maxRateAfterDegS} deg/s after ${t5.afterMs} ms`);
  }

  {
    const t6 = th.q6_pylon;
    const r = pylonTurn(sim, t6.n);
    gate('Q6', `a 180 deg pylon turn at ${t6.n} g, no rudder`, r.ok && r.lostPct >= t6.lostPctMin && r.lostPct <= t6.lostPctMax && r.r >= t6.rMin && r.r <= t6.rMax && r.beta <= t6.maxBetaDeg,
      r.ok ? `${r.v0.toFixed(1)} to ${r.v1.toFixed(1)} m/s, lost ${r.lostPct.toFixed(2)} percent, radius ${r.r.toFixed(1)} m, ${r.t.toFixed(2)} s, ${r.n.toFixed(2)} g, sideslip under ${r.beta.toFixed(1)} deg, height ${r.dz.toFixed(1)} m` : 'never came round',
      `lost ${t6.lostPctMin} to ${t6.lostPctMax} percent, radius ${t6.rMin} to ${t6.rMax} m, sideslip under ${t6.maxBetaDeg} deg`);
  }

  /* Q7: from level flat out, the throttle closed and the height held. */
  {
    const t7 = th.q7_coast;
    let o = { s: settle(sim, { settleMs: 8000 }).s };
    const trim = { v: 0 };
    const x0 = o.s[1];
    let t = null;
    let dist = null;
    const vEnd = 1.5 * 9.31;
    for (let ms = 0; ms < 30000 && t === null; ms += RC_STEP_MS) {
      o = step(sim, [...level(o.s, { trim }), 0, 0]);
      if (speed(o.s) <= vEnd) { t = (ms + RC_STEP_MS) / 1000; dist = o.s[1] - x0; }
    }
    gate('Q7', 'carries its speed: idle, height held, to 1.5 Vs', t !== null && within(t, t7) && dist >= t7.distMin && dist <= t7.distMax,
      t === null ? 'never slowed' : `${t.toFixed(2)} s over ${dist.toFixed(0)} m`, `${band(t7)} s, ${t7.distMin} to ${t7.distMax} m`);
  }

  {
    const t8 = th.q8_hard_turn;
    const r = pylonTurn(sim, t8.n);
    gate('Q8', `a 10 g corner: no snap`, r.ok && r.lostPct >= t8.lostPctMin && r.lostPct <= t8.lostPctMax && r.bankErr <= t8.maxBankErrDeg && r.p <= t8.maxRollRateDegS,
      r.ok ? `${r.v0.toFixed(1)} to ${r.v1.toFixed(1)} m/s, lost ${r.lostPct.toFixed(2)} percent, radius ${r.r.toFixed(1)} m, ${r.n.toFixed(2)} g, bank within ${r.bankErr.toFixed(1)} deg, roll rate under ${r.p.toFixed(0)} deg/s` : 'never came round',
      `lost ${t8.lostPctMin} to ${t8.lostPctMax} percent, bank within ${t8.maxBankErrDeg} deg, roll under ${t8.maxRollRateDegS} deg/s`);
  }

  /* Q9: level flat out, rolled to 20 deg at once, every stick let go. */
  {
    const t9 = th.q9_neutral;
    const s = settle(sim, { settleMs: 6000 }).s;
    const psi = edgeHeading(s);
    const h = t9.bankDeg / DEG / 2;
    const c = Math.cos(psi / 2);
    const z = Math.sin(psi / 2);
    must(sim.e.sim_set_pose(s[1], s[2], s[3], c * Math.cos(h), c * Math.sin(h), z * Math.sin(h), z * Math.cos(h)), 'sim_set_pose');
    const b0 = fullBank(sim.readState().state) * DEG;
    let worst = Math.abs(b0);
    let o = null;
    for (let ms = 0; ms < t9.atS * 1000; ms += RC_STEP_MS) {
      o = step(sim, [0, 0, 0, t9.duty]);
      worst = Math.max(worst, Math.abs(fullBank(o.s) * DEG));
    }
    const b9 = fullBank(o.s) * DEG;
    gate('Q9', 'hands off from a 20 deg bank: it holds it', Math.sign(b9) === Math.sign(b0) && within(Math.abs(b9), t9) && worst <= t9.maxBankDeg,
      `${b0.toFixed(1)} deg, ${b9.toFixed(1)} at ${t9.atS} s, never past ${worst.toFixed(1)}, ${speed(o.s).toFixed(2)} m/s`,
      `${band(t9)} deg at ${t9.atS} s, never past ${t9.maxBankDeg}`);
  }

  const q11 = propTorque(sim);
  gate('Q11', 'prop torque, static full throttle', q11.rollMoment < 0 && within(-q11.rollMoment, th.q11_prop_torque),
    `${(-q11.rollMoment).toFixed(3)} N m ${q11.rollMoment < 0 ? 'rolling left' : 'WRONG WAY'} at ${q11.thrust.toFixed(1)} N`, `${band(th.q11_prop_torque)} N m, rolling left`);

  /* The ground. */
  const onStrip = () => {
    must(sim.reset(), 'sim_reset');
    must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
    quickieGroundPrelude(sim, { mu: GROUND_MU, e: GROUND_E });
    clockMs = 0;
  };
  let rest = null;
  {
    const r12 = th.q12_rest;
    onStrip();
    let hull = 0;
    let o = null;
    for (let ms = 0; ms < 3000; ms += RC_STEP_MS) {
      o = step(sim, [0, 0, 0, 0]);
      hull = Math.max(hull, o.hull);
    }
    rest = { pitch: attitude(o.s).pitch * DEG, z: o.s[3], skid: o.loads[2] / (o.loads[0] + o.loads[1] + o.loads[2]) };
    gate('Q12', 'standing on its mains and skid', rest.pitch >= r12.pitchMin && rest.pitch <= r12.pitchMax && rest.z >= r12.zMin && rest.z <= r12.zMax && rest.skid >= r12.skidMin && rest.skid <= r12.skidMax && hull === 0 && o.loads[3] === 0 && Math.hypot(o.s[4], o.s[5]) < 0.01,
      `${rest.pitch.toFixed(2)} deg, CG ${rest.z.toFixed(4)} m, skid ${(rest.skid * 100).toFixed(1)} percent, loads ${o.loads.map((f) => f.toFixed(2)).join(' ')} N, hull ${hull}`,
      `${r12.pitchMin} to ${r12.pitchMax} deg, ${r12.zMin} to ${r12.zMax} m, ${r12.skidMin * 100} to ${r12.skidMax * 100} percent, no hull or prop`);
  }

  /* Q13: ROG, full throttle from standing; liftoff is the last step on the
   * wheels before 200 ms clear of them. */
  {
    const t13 = th.q13_takeoff;
    onStrip();
    for (let ms = 0; ms < 1000; ms += RC_STEP_MS) step(sim, [0, 0, 0, 0]);
    const x0 = sim.readState().state[1];
    let last = null;
    let off = 0;
    let lof = null;
    let worstHeading = 0;
    let prop = 0;
    const hold = {};
    for (let ms = 0; ms < 8000 && !lof; ms += RC_STEP_MS) {
      const o = step(sim, [...quickieTakeoffSticks(sim.readState().state, { hold }), 1]);
      prop = Math.max(prop, o.loads[3]);
      if (o.loaded) {
        last = { dist: o.s[1] - x0, v: speed(o.s), t: ms / 1000 };
        worstHeading = Math.max(worstHeading, Math.abs(edgeHeading(o.s)) * DEG);
        off = 0;
      } else {
        off += RC_STEP_MS;
        if (off >= 200) lof = last;
      }
    }
    gate('Q13', 'takes off from the ground, ROG', lof != null && lof.dist >= t13.distMin && lof.dist <= t13.distMax && lof.v >= t13.vMin && lof.v <= t13.vMax && prop === 0,
      lof == null ? 'never left the ground' : `${lof.dist.toFixed(2)} m to liftoff at ${lof.v.toFixed(2)} m/s, ${lof.t.toFixed(2)} s, heading within ${worstHeading.toFixed(1)} deg${prop ? ', PROP STRUCK' : ''}`,
      `${t13.distMin} to ${t13.distMax} m, ${t13.vMin} to ${t13.vMax} m/s`);
  }

  /* Q14: a glide at idle from 6 m at 1.4 Vs, 13 m/s, sinking a metre a
   * second on the approach, the sink eased to 0.1 m/s over the last 1.5 m,
   * and on the wheels the stick let go. */
  {
    const t14 = th.q14_landing;
    must(sim.reset(), 'sim_reset');
    quickieGroundPrelude(sim, { mu: GROUND_MU, e: GROUND_E });
    must(sim.e.sim_set_pose(0, 0, 6, 1, 0, 0, 0), 'sim_set_pose');
    must(sim.e.sim_wing_launch(13), 'sim_wing_launch');
    clockMs = 0;
    let touched = null;
    let hull = 0;
    let bounce = 0;
    let tr = 0;
    let o = { s: sim.readState().state, loaded: false, loads: [0, 0, 0, 0] };
    for (let ms = 0; ms < 25000; ms += RC_STEP_MS) {
      const { pitch } = attitude(o.s);
      const v = speed(o.s);
      const soft = v > 12 ? (12 / v) ** 2 : 1;
      const vzT = o.s[3] > 1.5 ? -0.8 : -0.1 - 0.45 * Math.max(0, o.s[3] - 0.13);
      tr = Math.max(-0.2, Math.min(0.2, tr + 0.0003 * (vzT - o.s[6])));
      const target = Math.max(-5 / DEG, Math.min(8 / DEG, tr + 0.15 * (vzT - o.s[6])));
      const pitchStick = touched !== null ? 0 : Math.max(-1, Math.min(1, soft * (4 * (target - pitch) + 0.25 * o.s[12])));
      o = step(sim, [edgeRoll(o.s), pitchStick, 0, 0]);
      if (o.loaded && touched === null) touched = { v: speed(o.s), vz: o.s[6], x: o.s[1], z: o.s[3] };
      if (touched !== null) {
        hull = Math.max(hull, o.hull + (o.loads[3] > 0 ? 1 : 0));
        bounce = Math.max(bounce, o.s[3] - touched.z);
      }
    }
    const land = { pitch: attitude(o.s).pitch * DEG, v: Math.hypot(o.s[4], o.s[5]), roll: touched ? o.s[1] - touched.x : 0 };
    gate('Q14', 'lands on its wheels, no bounce', touched !== null && land.v < 0.05 && Math.abs(land.pitch - rest.pitch) <= t14.pitchTolDeg && hull === 0 && bounce <= t14.maxBounceM && o.loads.slice(0, 3).every((f) => f > 0),
      touched === null ? 'never touched down' : `touched at ${touched.v.toFixed(2)} m/s sinking ${(-touched.vz).toFixed(2)}, rose ${(bounce * 100).toFixed(1)} cm after, rolled ${land.roll.toFixed(1)} m, at rest at ${land.pitch.toFixed(2)} deg, hull or prop ${hull}`,
      `at rest within ${t14.pitchTolDeg} deg of Q12, no bounce past ${t14.maxBounceM * 100} cm, no hull or prop`);
  }

  {
    const t15 = th.q15_idle;
    onStrip();
    let o = null;
    for (let ms = 0; ms < t15.seconds * 1000; ms += RC_STEP_MS) o = step(sim, [0, 0, 0, 0]);
    const d = wingDebug(sim);
    const rpm = o.s[14];
    const vg = Math.hypot(o.s[4], o.s[5]);
    gate('Q15', 'at idle the engine turns and it stands', rpm >= t15.rpmMin && rpm <= t15.rpmMax && vg <= t15.maxSpeed && d[8] > 0,
      `${rpm.toFixed(0)} rpm, ${d[8].toFixed(3)} N of thrust, ground speed ${(vg * 1000).toFixed(3)} mm/s`,
      `${t15.rpmMin} to ${t15.rpmMax} rpm, ground speed under ${t15.maxSpeed * 1000} mm/s`);
  }

  {
    const t18 = th.q18_inverted;
    const inv = settle(sim, { inverted: true, settleMs: 20000 });
    gate('Q18', 'on its back flat out: as upright, a touch of push', pct(inv.v, top.v) <= t18.levelPct && Math.abs(inv.vz) < 0.2 && inv.stick < 0 && -inv.stick >= t18.pushMin && -inv.stick <= t18.pushMax,
      `${inv.v.toFixed(2)} against ${top.v.toFixed(2)} m/s, ${pct(inv.v, top.v).toFixed(1)} percent, sink ${(-inv.vz).toFixed(2)}, stick ${inv.stick.toFixed(3)}, alpha ${(inv.alpha * DEG).toFixed(2)} deg`,
      `within ${t18.levelPct} percent, a push of ${t18.pushMin} to ${t18.pushMax}`);
  }
}

const quadTh = JSON.parse(await readFile(join(root, 'tests/thresholds.json'), 'utf8'));
const replayBase = { configText, renderHz: quadTh.replay.canonical_render_hz.value, traceStrideMs: quadTh.replay.trace_stride_ms.value };
const recOf = async (f) => decodeRec(new Uint8Array(await readFile(join(root, f))));
const hashOf = async (f, prelude) => (await replayTrace(await loadSim(wasmBytes), await recOf(f), { ...replayBase, prelude })).slice(0, 16);
const u = th.q16_unmoved;
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
  edge: await hashOf('tests/inputs/edge-baseline.rec', (s) => edgeGroundPrelude(s)),
  f16: await hashOf('tests/inputs/f16-baseline.rec', (s) => f16GroundPrelude(s)),
  extra: await hashOf('tests/inputs/extra-baseline.rec', (s) => extraGroundPrelude(s)),
  uglystik: await hashOf('tests/inputs/uglystik-baseline.rec', (s) => uglystikGroundPrelude(s)),
  zagi: await hashOf('tests/inputs/zagi-baseline.rec', (s) => zagiPrelude(s)),
  dlg: await hashOf('tests/inputs/dlg-baseline.rec', dlgRecPrelude),
};
const names = Object.keys(got);
gate('Q16', 'every other aircraft unmoved', names.every((kk) => got[kk] === u[kk]),
  names.map((kk) => got[kk]).join(', '), names.map((kk) => u[kk]).join(', '));

const recPath = 'tests/inputs/quickie-baseline.rec';
let qRec = null;
try {
  qRec = await recOf(recPath);
} catch {
  qRec = null;
}
if (!qRec) {
  gate('Q17', 'Node and Chrome agree', false, `${recPath} missing: npm run quickie:record`, 'identical');
} else {
  const qOpts = { ...replayBase, prelude: (s) => quickieGroundPrelude(s) };
  const nodeHash = (await replayTrace(await loadSim(wasmBytes), qRec, qOpts)).slice(0, 16);
  const nodeAgain = (await replayTrace(await loadSim(wasmBytes), qRec, qOpts)).slice(0, 16);
  if (!findChrome()) {
    gate('Q17', 'Node and Chrome agree', null, `node ${nodeHash} twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}, no Chrome here`, 'identical');
  } else {
    const server = await startServer(root);
    try {
      const out = await runBrowserHarness(`${server.origin}/tests/browser/wing-harness.html?plane=quickie`);
      const result = out.result || {};
      const chromeHash = result.ok ? String(result.hash).slice(0, 16) : `error: ${result.message || result.errorName || JSON.stringify(out).slice(0, 80)}`;
      gate('Q17', 'Node and Chrome agree', nodeAgain === nodeHash && result.ok && chromeHash === nodeHash, `node ${nodeHash} (twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}), chrome ${chromeHash}`, 'identical');
    } finally {
      await server.close();
    }
  }
}

console.log('');
for (const [id, name, measured, b, status] of rows) {
  console.log(`  ${status.padEnd(4)}  ${id.padEnd(4)} ${name.padEnd(52)} ${String(measured).padEnd(70)} ${b}`);
}
console.log(`\n${failed ? `${failed} FAILED, ` : ''}${rows.length - failed - skipped} of ${rows.length} gates hold${skipped ? `, ${skipped} SKIPPED (a skip is not a pass)` : ''}`);
process.exit(failed ? 1 : 0);
