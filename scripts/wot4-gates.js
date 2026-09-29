/*
 * wot4-gates.js: the Wot 4 plant against the bands in
 * tests/wot4-thresholds.json.
 *
 * The gates of docs/WOT4-STAGE1.md, on the pattern of edge-gates.js, and
 * the ones this aircraft is here for: a club sport aerobat that does
 * everything well and forgives mistakes. W1 to W4 are the speeds: level at
 * the trim, the stall, the glide, the top. W5 the roll, crisp and axial.
 * W7 the vertical. W8 inverted on a breath of down elevator. W9 a big
 * loop. W10 the docile stall, wings level. W11 the spin on the rudder and
 * its recovery hands off. W12 the knife edge pass and its coupling. W6 the
 * prop's torque. W13 to W16 the taildragger gear: standing, the take off,
 * tracking, the taxi turn, an easy landing. W17 holds every other
 * aircraft's recorded hash where it was before the Wot 4 existed, and W18
 * flies the Wot 4's recording in Node and in headless Chrome and holds the
 * two trace hashes equal. Bands are never widened here: a plant outside
 * one is a finding for the derivation. Run with npm run wot4:gates.
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
  WOT4_AIRFRAME, glide, stallSpeed, propTorque, wingDebug, wheelLoads, attitude, must,
  wot4GroundPrelude, wot4TakeoffSticks, edgeLevel, edgeRoll, fullBank, edgeHeading, RC_STEP_MS,
  wingPrelude, skyPrelude, cubGroundPrelude, gliderRecPrelude, bramorPrelude, bramorChutePrelude,
  slowstickGroundPrelude, bombshellGroundPrelude, kadetGroundPrelude, timberRecPrelude, timberFloatRecPrelude,
  p51RecPrelude, p51AirPrelude, edgeGroundPrelude, extraGroundPrelude, f16GroundPrelude,
} from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const th = JSON.parse(await readFile(join(root, 'tests/wot4-thresholds.json'), 'utf8'));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const DEG = 180 / Math.PI;
const SPAN = 1.334;
const ALPHA_STALL = th.w2_stall.alphaStall;

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
const clamp = (x) => Math.max(-1, Math.min(1, x));
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

/* The Edge's level hand (edgeLevel) with an integral on the elevator
 * stick itself: on its back the Wot 4 wants a third of its elevator's
 * throw more than upright, past what edgeLevel's pitch trim, bounded at
 * 0.2 rad, can ask of its proportional stick, which left it sinking at
 * 1.2 m/s with the trim pinned. */
function levelHand(s, { b, trim }) {
  const [roll, stick] = edgeLevel(s, { b, trim });
  const sgn = Math.cos(fullBank(s)) < 0 ? -1 : 1;
  trim.s = Math.max(-0.6, Math.min(0.6, (trim.s || 0) + sgn * 0.0004 * -s[6]));
  return [roll, clamp(stick + trim.s)];
}

/* Level flight along world +x, 300 m up, upright or on its back, the
 * hands of levelHand for `settleMs` at `duty`: the mean of the last two
 * seconds. */
function settle(sim, { inverted = false, speed0 = 17, duty = 0.75, settleMs = 6000 } = {}) {
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
    const [roll, pitch] = levelHand(o.s, { b, trim });
    o = step(sim, [roll, pitch, 0, duty]);
    if (ms >= settleMs - 2000) tail.push({ v: speed(o.s), vz: o.s[6], stick: pitch, alpha: wingDebug(sim)[0] });
  }
  const mean = (k) => tail.reduce((a, x) => a + x[k], 0) / tail.length;
  return { s: o.s, v: mean('v'), vz: mean('vz'), stick: mean('stick'), alpha: mean('alpha') };
}

/* The heading and the pitch of the nose, world frame, from the state. */
const heading = edgeHeading;
const noseUp = (s) => attitude(s).pitch;

console.log('wot4 gates: the plant against docs/WOT4-STAGE1.md');
const sim = await loadSim(wasmBytes);
if (sim.init(configText) !== SIM_OK) throw new Error('sim_init failed');
must(sim.e.sim_set_airframe(WOT4_AIRFRAME), 'sim_set_airframe');
must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');

check: {
  if (sim.e.sim_airframe() !== WOT4_AIRFRAME) {
    gate('W0', 'the Wot 4 is selected', false, `airframe ${sim.e.sim_airframe()}`, `${WOT4_AIRFRAME}`);
    break check;
  }

  const up = settle(sim, { settleMs: 20000 });
  gate('W1', 'level at three quarter throttle, the trim', within(up.v, th.w1_level_75) && Math.abs(up.vz) < 0.2 && Math.abs(up.stick) < th.w1_level_75.maxStick,
    `${up.v.toFixed(2)} m/s, sink ${(-up.vz).toFixed(2)}, elevator stick ${up.stick.toFixed(3)}`, `${band(th.w1_level_75)}, stick under ${th.w1_level_75.maxStick}`);

  const w2 = stallSpeed(sim, ALPHA_STALL);
  gate('W2', 'stall speed, power off', w2 != null && within(w2, th.w2_stall), w2 == null ? 'no stall reached' : `${w2.toFixed(2)} m/s`, band(th.w2_stall));

  const w3 = glide(sim, th.w3_glide.speed);
  gate('W3', 'glide ratio at 1.4 Vs, power off', within(w3.ratio, th.w3_glide), `${w3.ratio.toFixed(2)} at ${w3.v.toFixed(1)} m/s, sink ${w3.sink.toFixed(2)}`, band(th.w3_glide));

  const top = settle(sim, { duty: 1, speed0: 23, settleMs: 20000 });
  gate('W4', 'top speed, level', within(top.v, th.w4_top) && Math.abs(top.vz) < 0.2, `${top.v.toFixed(2)} m/s, sink ${(-top.vz).toFixed(2)}`, band(th.w4_top));

  /* W5: full aileron from level at 20 m/s, a whole roll, the elevator and
   * rudder centred: the helix angle over the first half second, the time
   * to 90 percent of that rate, and the sideslip the ailerons' adverse
   * yaw swings the nose through over that half second, before gravity,
   * which bends the path as it goes round, has anything to do with it. The body's pitch and yaw rates against its roll rate over
   * the whole roll, gravity's share in them, are recorded. */
  const rollOnce = (tune) => {
    settle(sim, { speed0: th.w5_roll.speed, duty: 0.75, settleMs: 2500 });
    if (tune) {
      const ptr = sim.e.malloc(11 * 8);
      new Float64Array(sim.e.memory.buffer, ptr, 11).set(tune);
      must(sim.e.sim_wing_set_tune(ptr), 'sim_wing_set_tune');
    }
    let s = sim.readState().state;
    let turned = 0, off = 0, on = 0, slip = 0;
    const tr = [];
    for (let t = 0; t < 4000 && Math.abs(turned) < 2 * Math.PI; t += RC_STEP_MS) {
      s = step(sim, [1, 0, 0, 0.75]).s;
      turned += s[11] * RC_STEP_MS / 1000;
      tr.push({ t: t + RC_STEP_MS, p: s[11], v: speed(s) });
      if (t < 500) slip = Math.max(slip, Math.abs(wingDebug(sim)[1]));
      off += Math.hypot(s[12], s[13]);
      on += Math.abs(s[11]);
    }
    const early = tr.filter((x) => x.t > 250 && x.t <= 500);
    const rate = early.reduce((a, x) => a + x.p, 0) / early.length;
    const vAt = early.reduce((a, x) => a + x.v, 0) / early.length;
    const at = tr.find((x) => Math.abs(x.p) >= 0.9 * Math.abs(rate));
    if (tune) must(sim.e.sim_wing_tune_clear(), 'sim_wing_tune_clear');
    return { pb: Math.abs(rate) * SPAN / (2 * vAt), degS: rate * DEG, v: vAt, t90: at ? at.t / 1000 : null, slipDeg: slip * DEG, offAxis: off / on, full: Math.abs(turned) >= 2 * Math.PI, rollS: tr[tr.length - 1].t / 1000 };
  };
  const w5 = rollOnce(null);
  const t5 = th.w5_roll;
  gate('W5', 'full aileron, high rate: crisp and axial', within(w5.pb, t5) && w5.full && w5.t90 !== null && w5.t90 <= t5.t90Max && w5.slipDeg >= t5.slipMinDeg && w5.slipDeg <= t5.slipMaxDeg,
    `pb/2V ${w5.pb.toFixed(3)}, ${Math.abs(w5.degS).toFixed(0)} deg/s at ${w5.v.toFixed(1)} m/s, 90 percent in ${w5.t90 === null ? 'never' : w5.t90.toFixed(2)} s, sideslip under ${w5.slipDeg.toFixed(1)} deg; a whole roll in ${w5.rollS.toFixed(2)} s, off axis ${w5.offAxis.toFixed(3)}`,
    `${band(t5)}, 90 percent within ${t5.t90Max} s, sideslip ${t5.slipMinDeg} to ${t5.slipMaxDeg} deg`);
  {
    const rad = (d) => d * Math.PI / 180;
    const tune = new Float64Array(11);
    tune[3] = rad(th.w5_low.throws[0]); tune[4] = rad(th.w5_low.throws[1]); tune[5] = rad(th.w5_low.throws[2]);
    tune[6] = 0.30; tune[7] = 0.30; tune[8] = 0.30;
    const lo = rollOnce(tune);
    gate('W5b', 'full aileron, low rate', within(lo.pb, th.w5_low), `pb/2V ${lo.pb.toFixed(3)}, ${Math.abs(lo.degS).toFixed(0)} deg/s`, band(th.w5_low));
  }

  /* W7: straight up at full throttle, the climb it settles at over the
   * last three of twelve seconds. Set on its tail at 12 m/s and held
   * there: the elevator on the nose's angle, with an integral for the
   * trim's Cm0 at the vertical's small lift; the ailerons on the roll rate
   * with an integral, taking the prop's torque; the rudder on the yaw
   * rate with an integral. (The Edge's hands pull up from level
   * and read the bank off the wings' world direction, which straight up
   * cannot tell from its reverse; on the Wot 4, whose ailerons are a fifth
   * of the Edge's, the pull's P factor left a sideslip holding the torque
   * that those hands then chased round.) */
  {
    must(sim.reset(), 'sim_reset');
    must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
    must(sim.e.sim_set_pose(0, 0, 300, Math.SQRT1_2, 0, -Math.SQRT1_2, 0), 'sim_set_pose');
    must(sim.e.sim_wing_launch(12), 'sim_wing_launch');
    clockMs = 0;
    const climbAngle = (s) => Math.atan2(2 * (s[8] * s[10] - s[7] * s[9]), 1 - 2 * (s[9] * s[9] + s[10] * s[10]));
    let s = sim.readState().state;
    let iR = 0, iQ = 0, iY = 0;
    const tail = [];
    for (let t = 0; t < 12000; t += RC_STEP_MS) {
      const dt = RC_STEP_MS / 1000;
      iR = Math.max(-0.5, Math.min(0.5, iR - 1.0 * s[11] * dt));
      iQ = Math.max(-0.5, Math.min(0.5, iQ + 1.0 * (Math.PI / 2 - climbAngle(s)) * dt));
      iY = Math.max(-1, Math.min(1, iY + 3.0 * s[13] * dt));
      s = step(sim, [clamp(-0.5 * s[11] + 3 * iR), clamp(2.5 * (Math.PI / 2 - climbAngle(s)) + 0.5 * s[12] + iQ), clamp(2.0 * s[13] + iY), 1]).s;
      if (t >= 9000) tail.push({ vz: s[6], pitch: climbAngle(s), beta: wingDebug(sim)[1], r: s[13], T: wingDebug(sim)[8] });
    }
    const mean = (k) => tail.reduce((a, x) => a + x[k], 0) / tail.length;
    const vz = mean('vz'), p = mean('pitch');
    gate('W7', 'straight up at full throttle', within(vz, th.w7_vertical) && Math.abs(p * DEG - 90) < 5,
      `${vz.toFixed(2)} m/s climbing at ${(p * DEG).toFixed(1)} deg, sideslip ${(mean('beta') * DEG).toFixed(1)} deg, yaw ${(mean('r') * DEG).toFixed(1)} deg/s, thrust ${mean('T').toFixed(1)} N`, `${band(th.w7_vertical)} m/s, within 5 deg of vertical`);
  }

  /* W8: on its back at full throttle, against upright at full throttle:
   * the push it takes over the stick upright. */
  {
    const inv = settle(sim, { inverted: true, duty: 1, speed0: 23, settleMs: 20000 });
    const t8 = th.w8_inverted;
    const push = top.stick - inv.stick;
    gate('W8', 'on its back: a breath of down elevator holds it', Math.abs(inv.vz) < 0.2 && within(push, t8) && pct(inv.v, top.v) <= t8.levelPct,
      `a push of ${push.toFixed(3)}: stick ${inv.stick.toFixed(3)} on its back, ${top.stick.toFixed(3)} upright; ${inv.v.toFixed(2)} m/s against ${top.v.toFixed(2)}, sink ${(-inv.vz).toFixed(2)}`, `${band(t8)} of stick, within ${t8.levelPct} percent of the speed`);
  }

  /* W9: a loop from level at full throttle, the stick held at `stick`
   * of up, the wings held on the ailerons against the bank: the height it
   * spans, the speed over the top and whether the wing stalls anywhere. */
  {
    const t9 = th.w9_loop;
    settle(sim, { speed0: 23, duty: 1, settleMs: 4000 });
    let s = sim.readState().state;
    const z0 = s[3];
    let zMax = z0, vTop = null, alphaMax = 0, pitchTurned = 0, alive = true;
    for (let t = 0; t < 12000 && pitchTurned < 2 * Math.PI; t += RC_STEP_MS) {
      const o = step(sim, [0, t9.stick, 0, 1]);
      s = o.s;
      pitchTurned += -s[12] * RC_STEP_MS / 1000;
      alphaMax = Math.max(alphaMax, wingDebug(sim)[0]);
      if (s[3] > zMax) { zMax = s[3]; vTop = speed(s); }
      if (s[3] < 5) alive = false;
    }
    const dia = zMax - z0;
    gate('W9', 'a big loop at full throttle', alive && pitchTurned >= 2 * Math.PI && dia >= t9.diaMin && vTop >= t9.topOverVs * th.w2_stall.derived && alphaMax < ALPHA_STALL,
      `${dia.toFixed(1)} m high, ${vTop.toFixed(1)} m/s over the top, alpha at most ${(alphaMax * DEG).toFixed(1)} deg`,
      `at least ${t9.diaMin} m, over the top at ${t9.topOverVs} Vs or more, never stalled`);
  }

  /* W10: the docile stall. From level at 14 m/s, the throttle closed and
   * the stick eased to full back over four seconds and held six: the bank
   * it rolls to, and it mushes on without spinning. */
  {
    const t10 = th.w10_stall;
    settle(sim, { speed0: 14, duty: 0.4, settleMs: 2000 });
    let worstBank = 0, yawRate = 0, alphaMax = 0, n = 0, sink = 0;
    for (let t = 0; t < 10000; t += RC_STEP_MS) {
      const o = step(sim, [0, Math.min(1, t / 4000), 0, 0]);
      alphaMax = Math.max(alphaMax, wingDebug(sim)[0]);
      if (t >= 3000) worstBank = Math.max(worstBank, Math.abs(fullBank(o.s)));
      if (t >= 6000) { yawRate += Math.abs(o.s[13]); sink += -o.s[6]; n += 1; }
    }
    gate('W10', 'the stall held full back: wings level, no drop', alphaMax > ALPHA_STALL && worstBank * DEG <= t10.maxBankDeg && yawRate / n * DEG < t10.maxYawDegS,
      `alpha to ${(alphaMax * DEG).toFixed(1)} deg, bank at most ${(worstBank * DEG).toFixed(1)} deg, yaw ${(yawRate / n * DEG).toFixed(1)} deg/s, sink ${(sink / n).toFixed(2)} m/s`,
      `past the stall, bank under ${t10.maxBankDeg} deg, yaw under ${t10.maxYawDegS} deg/s`);
  }

  /* W11: the spin. From 14 m/s, power off, full up and full rudder held
   * `holdS`; then hands off, every stick centred: the rotation the rudder's
   * way, and how soon and how far on it stops by itself. */
  {
    const t11 = th.w11_spin;
    const spin = (yaw) => {
      settle(sim, { speed0: 14, duty: 0.4, settleMs: 1500 });
      let yawTurned = 0, alphaMax = 0;
      for (let t = 0; t < t11.holdS * 1000; t += RC_STEP_MS) {
        const o = step(sim, [0, 1, yaw, 0]);
        yawTurned += o.s[13] * RC_STEP_MS / 1000;
        alphaMax = Math.max(alphaMax, wingDebug(sim)[0]);
      }
      let stopped = null, after = 0;
      for (let t = 0; t < 3000 && stopped === null; t += RC_STEP_MS) {
        const o = step(sim, [0, 0, 0, 0]);
        after += Math.hypot(o.s[11], o.s[13]) * RC_STEP_MS / 1000;
        if (Math.hypot(o.s[11], o.s[13]) < 30 / DEG && wingDebug(sim)[0] < ALPHA_STALL) stopped = (t + RC_STEP_MS) / 1000;
      }
      return { yawTurned, alphaMax, stopped, after };
    };
    const r = spin(1), l = spin(-1);
    const said = (x) => `${(x.yawTurned * DEG).toFixed(0)} deg of yaw, alpha to ${(x.alphaMax * DEG).toFixed(1)}, hands off stopped ${x.stopped === null ? 'never' : `in ${x.stopped.toFixed(2)} s`} after ${(x.after * DEG).toFixed(0)} deg`;
    const ok = (x, sgn) => sgn * x.yawTurned * DEG >= t11.minYawDeg && x.alphaMax > ALPHA_STALL && x.stopped !== null && x.stopped <= t11.recoverS && x.after * DEG <= t11.recoverDeg;
    /* Right rudder is a nose right yaw, a negative body z rate here. */
    gate('W11', 'full up and rudder: it turns the rudder\'s way; let go, it stops', ok(r, -1) && ok(l, 1),
      `right: ${said(r)}; left: ${said(l)}`, `${t11.minYawDeg} deg the rudder's way in ${t11.holdS} s, stopped within ${t11.recoverS} s and ${t11.recoverDeg} deg`);
  }

  /* W12: a knife edge pass. From level at full throttle, rolled right to
   * 90 deg on the ailerons in the first second and held there, full left
   * rudder, the nose toward the sky; the elevator holds the heading. Over
   * the pass that follows, the sink's growth, how much of the weight the
   * sideslip leaves unheld, and the aileron the pilot holds against the
   * coupling. */
  {
    const t12 = th.w12_knife;
    settle(sim, { speed0: 23, duty: 1, settleMs: 4000 });
    let s = sim.readState().state;
    const h0 = heading(s);
    let iA = 0, aSum = 0, n = 0, worst = 0, betaSum = 0, vz0 = null;
    for (let t = 0; t < 1000 + t12.passS * 1000; t += RC_STEP_MS) {
      const dt = RC_STEP_MS / 1000;
      const bank = fullBank(s);
      const bankT = Math.min(Math.PI / 2, t / 1000 * 4);
      iA = Math.max(-0.6, Math.min(0.6, iA - 2.0 * (bank - bankT) * dt));
      const roll = clamp(-0.8 * (bank - bankT) - 0.05 * s[11] + iA);
      const pitchStick = clamp(0.8 * wrap(heading(s) - h0) + 0.15 * s[12]);
      const yaw = t < 300 ? 0 : -1;
      s = step(sim, [roll, pitchStick, yaw, 1]).s;
      if (t + RC_STEP_MS === 1000) vz0 = s[6];
      if (t >= 1000) { aSum += roll; betaSum += wingDebug(sim)[1]; n += 1; worst = Math.max(worst, Math.abs(bank * DEG - 90)); }
    }
    const sinkAcc = (vz0 - s[6]) / t12.passS;
    const ail = aSum / n;
    gate('W12', 'knife edge: a pass on full rudder, and its coupling', within(sinkAcc, t12) && Math.abs(ail) >= t12.minAileron && Math.abs(ail) <= t12.maxAileron && worst < 20,
      `the sink growing ${sinkAcc.toFixed(2)} m/s^2 over ${t12.passS} s at sideslip ${(betaSum / n * DEG).toFixed(1)} deg, aileron held ${ail.toFixed(3)}, bank within ${worst.toFixed(1)} deg of 90`,
      `${band(t12)} m/s^2, aileron ${t12.minAileron} to ${t12.maxAileron} held`);
  }

  const w6 = propTorque(sim);
  gate('W6', 'prop torque, static full throttle', w6.rollMoment < 0 && within(-w6.rollMoment, th.w6_prop_torque),
    `${(-w6.rollMoment).toFixed(3)} N m ${w6.rollMoment < 0 ? 'rolling left' : 'WRONG WAY'} at ${w6.thrust.toFixed(1)} N`, `${band(th.w6_prop_torque)} N m, rolling left`);

  /* The gear. */
  const onStrip = () => {
    must(sim.reset(), 'sim_reset');
    must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
    wot4GroundPrelude(sim, { mu: GROUND_MU, e: GROUND_E });
    clockMs = 0;
  };
  onStrip();
  let hull = 0;
  let o = null;
  for (let ms = 0; ms < 3000; ms += RC_STEP_MS) {
    o = step(sim, [0, 0, 0, 0]);
    hull = Math.max(hull, o.hull);
  }
  const rest = { pitch: attitude(o.s).pitch * DEG, z: o.s[3], tail: o.loads[2] / (o.loads[0] + o.loads[1] + o.loads[2]) };
  const r13 = th.w13_rest;
  gate('W13', 'standing on its wheels', rest.pitch >= r13.pitchMin && rest.pitch <= r13.pitchMax && rest.z >= r13.zMin && rest.z <= r13.zMax && rest.tail >= r13.tailMin && rest.tail <= r13.tailMax && hull === 0 && Math.hypot(o.s[4], o.s[5]) < 0.01,
    `${rest.pitch.toFixed(2)} deg, CG ${rest.z.toFixed(4)} m, tail ${(rest.tail * 100).toFixed(1)} percent, hull ${hull}`,
    `${r13.pitchMin} to ${r13.pitchMax} deg, ${r13.zMin} to ${r13.zMax} m, ${r13.tailMin * 100} to ${r13.tailMax * 100} percent, no hull`);

  const takeoff = (yawHold) => {
    onStrip();
    let last = null;
    let off = 0;
    let worstHeading = 0;
    let worstY = 0;
    let p = { s: sim.readState().state };
    for (let ms = 0; ms < 10000; ms += RC_STEP_MS) {
      p = step(sim, wot4TakeoffSticks(p.s, ms, { vRotate: th.w14_takeoff.vRotate, yawHold }));
      if (p.loaded) {
        last = { dist: p.s[1], v: speed(p.s), t: (ms + RC_STEP_MS) / 1000 };
        worstHeading = Math.max(worstHeading, Math.abs(edgeHeading(p.s)));
        worstY = Math.max(worstY, Math.abs(p.s[2]));
        off = 0;
      } else if ((off += RC_STEP_MS) >= 200) {
        return { ...last, worstHeading, worstY, prop: p.loads[3] };
      }
    }
    return null;
  };
  const w14 = takeoff(1);
  const t14 = th.w14_takeoff;
  gate('W14', 'take off roll from rest', w14 != null && w14.dist >= t14.distMin && w14.dist <= t14.distMax && w14.v >= t14.vMin && w14.v <= t14.vMax,
    w14 == null ? 'never left the ground' : `${w14.dist.toFixed(2)} m to liftoff at ${w14.v.toFixed(2)} m/s, ${w14.t.toFixed(2)} s`,
    `${t14.distMin} to ${t14.distMax} m, ${t14.vMin} to ${t14.vMax} m/s`);
  const s14 = th.w14_straight;
  gate('W14b', 'the roll tracks straight on the rudder', w14 != null && w14.worstHeading * DEG < s14.maxHeadingDeg && w14.worstY < s14.maxOffLine,
    w14 == null ? 'never left the ground' : `heading within ${(w14.worstHeading * DEG).toFixed(1)} deg, ${w14.worstY.toFixed(2)} m off the line`,
    `under ${s14.maxHeadingDeg} deg, under ${s14.maxOffLine} m`);
  const loose = takeoff(0);
  gate('W14c', 'feet off the rudder: the swing, recorded', loose != null,
    loose == null ? 'never left the ground' : `heading ${(loose.worstHeading * DEG).toFixed(1)} deg at worst, ${loose.worstY.toFixed(2)} m off the line`, 'a record, not a band');

  /* W15: taxi, full right rudder at walking pace. */
  onStrip();
  for (let ms = 0; ms < 2000; ms += RC_STEP_MS) step(sim, [0, 0, 0, th.w15_taxi.duty]);
  let h0 = null;
  let vSum = 0;
  let n15 = 0;
  let allLoaded = true;
  for (let ms = 0; ms < 5000; ms += RC_STEP_MS) {
    o = step(sim, [0, 0, 1, th.w15_taxi.duty]);
    allLoaded = allLoaded && o.loads.slice(0, 3).every((f) => f > 0);
    if (ms === 3000) h0 = edgeHeading(o.s);
    if (ms > 3000) { vSum += speed(o.s); n15 += 1; }
  }
  const dh = wrap(edgeHeading(o.s) - h0);
  const r15 = (vSum / n15) / Math.abs(dh / 1.996);
  gate('W15', 'taxi turn on the tailwheel', dh < 0 && within(r15, th.w15_taxi) && allLoaded, `${r15.toFixed(2)} m at ${(vSum / n15).toFixed(2)} m/s, ${dh < 0 ? 'turning right' : 'WRONG WAY'}${allLoaded ? '' : ', a wheel lifted'}`, `${band(th.w15_taxi)} m, turning right`);

  /* W16: an easy landing, flown as a club pilot flies a taildragger in:
   * from 12 m at 12 m/s, the throttle closed, the airspeed held under
   * 1.3 Vs (11.5 m/s) on the elevator down the glide; at 1.2 m the round
   * out and the hold off, the nose raised as the sink is taken out, a
   * foot off the grass, no higher than the three point attitude, while
   * the speed bleeds away; on the wheels full up stick: it sits down and
   * stays down. */
  must(sim.reset(), 'sim_reset');
  wot4GroundPrelude(sim, { mu: GROUND_MU, e: GROUND_E });
  must(sim.e.sim_set_pose(0, 0, 12, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(12), 'sim_wing_launch');
  clockMs = 0;
  let touched = null;
  let hullLanding = 0;
  let bounced = false;
  let flareT = null;
  let iV = 0;
  let trimStick = 0;
  const vApp = 11.5;
  o = { s: sim.readState().state, loaded: false };
  for (let ms = 0; ms < 24000; ms += RC_STEP_MS) {
    const { pitch } = attitude(o.s);
    const roll = edgeRoll(o.s);
    const qAero = -o.s[12];
    const v = speed(o.s);
    let sticks;
    if (touched !== null) {
      sticks = [roll, 1, 0, 0];
    } else if (o.s[3] > 1.2 && flareT === null) {
      iV = Math.max(-0.2, Math.min(0.2, iV + 0.00008 * (v - vApp) * RC_STEP_MS));
      const pitchT = Math.max(-0.3, Math.min(0.2, 0.1 * (v - vApp) + iV));
      sticks = [roll, clamp(2.5 * (pitchT - pitch) - 0.25 * qAero), 0, 0];
      trimStick = 0.98 * trimStick + 0.02 * sticks[1];
    } else {
      if (flareT === null) flareT = pitch;
      /* The sink the height asks for: the wheels a hand's width up,
       * settling at 0.2 m/s; the glide's stick carried on under it. */
      const vzT = -Math.max(0.2, Math.min(2, 1.5 * (o.s[3] - 0.30)));
      flareT = Math.min(rest.pitch / DEG, flareT + 0.0012 * (vzT - o.s[6]) * RC_STEP_MS);
      sticks = [roll, clamp(trimStick + 2.5 * (flareT - pitch) - 0.25 * qAero), 0, 0];
    }
    o = step(sim, sticks);
    if (o.loaded && touched === null) touched = { v: speed(o.s), vz: o.s[6], x: o.s[1], ms };
    if (touched !== null) {
      hullLanding = Math.max(hullLanding, o.hull + (o.loads[3] > 0 ? 1 : 0));
      if (ms > touched.ms + 300 && ms < touched.ms + 3000 && !o.loaded) bounced = true;
    }
  }
  const land = { pitch: attitude(o.s).pitch * DEG, v: Math.hypot(o.s[4], o.s[5]), roll: touched ? o.s[1] - touched.x : 0 };
  const t16 = th.w16_landing;
  gate('W16', 'an easy landing on the wheels', touched !== null && touched.v <= t16.maxTouchV && land.v < 0.05 && !bounced && Math.abs(land.pitch - rest.pitch) <= t16.pitchTolDeg && hullLanding === 0,
    touched === null ? 'never touched down' : `touched at ${touched.v.toFixed(1)} m/s sinking ${(-touched.vz).toFixed(2)}, ${bounced ? 'BOUNCED' : 'no bounce'}, rolled ${land.roll.toFixed(1)} m, at rest at ${land.pitch.toFixed(2)} deg, hull or prop ${hullLanding}`,
    `touched at ${t16.maxTouchV} m/s or less, no bounce, at rest within ${t16.pitchTolDeg} deg of W13, no hull or prop`);
}

const quadTh = JSON.parse(await readFile(join(root, 'tests/thresholds.json'), 'utf8'));
const replayBase = { configText, renderHz: quadTh.replay.canonical_render_hz.value, traceStrideMs: quadTh.replay.trace_stride_ms.value };
const recOf = async (f) => decodeRec(new Uint8Array(await readFile(join(root, f))));
const hashOf = async (f, prelude) => (await replayTrace(await loadSim(wasmBytes), await recOf(f), { ...replayBase, prelude })).slice(0, 16);
const u = th.w17_unmoved;
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
  kadet: await hashOf('tests/inputs/kadet-baseline.rec', (s) => kadetGroundPrelude(s)),
  timber: await hashOf('tests/inputs/timber-baseline.rec', timberRecPrelude),
  timberf: await hashOf('tests/inputs/timberf-baseline.rec', timberFloatRecPrelude),
  p51: await hashOf('tests/inputs/p51-baseline.rec', p51RecPrelude),
  p51Air: await hashOf('tests/inputs/p51-air.rec', p51AirPrelude),
  edge: await hashOf('tests/inputs/edge-baseline.rec', (s) => edgeGroundPrelude(s)),
  extra: await hashOf('tests/inputs/extra-baseline.rec', (s) => extraGroundPrelude(s)),
  f16: await hashOf('tests/inputs/f16-baseline.rec', (s) => f16GroundPrelude(s)),
};
const names = Object.keys(got);
gate('W17', 'every other aircraft unmoved', names.every((k) => got[k] === u[k]),
  names.filter((k) => got[k] !== u[k]).map((k) => `${k} ${got[k]} against ${u[k]}`).join(', ') || `${names.length} recordings identical`, 'identical');

const rec = await recOf('tests/inputs/wot4-baseline.rec');
const opts = { ...replayBase, prelude: (s) => wot4GroundPrelude(s) };
const nodeHash = (await replayTrace(await loadSim(wasmBytes), rec, opts)).slice(0, 16);
const nodeAgain = (await replayTrace(await loadSim(wasmBytes), rec, opts)).slice(0, 16);
if (!findChrome()) {
  gate('W18', 'Node and Chrome agree', null, `node ${nodeHash} twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}, no Chrome here`, 'identical');
} else {
  const server = await startServer(root);
  try {
    const out = await runBrowserHarness(`${server.origin}/tests/browser/wing-harness.html?plane=wot4`);
    const result = out.result || {};
    const chromeHash = result.ok ? String(result.hash).slice(0, 16) : `error: ${result.message || result.errorName || JSON.stringify(out).slice(0, 80)}`;
    gate('W18', 'Node and Chrome agree', nodeAgain === nodeHash && result.ok && chromeHash === nodeHash, `node ${nodeHash} (twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}), chrome ${chromeHash}`, 'identical');
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
