/*
 * edge-gates.js: the Edge 540 plant against the bands in
 * tests/edge-thresholds.json.
 *
 * The gates of docs/EDGE-STAGE1.md, on the pattern of cub-gates.js and
 * kadet-gates.js, and the ones this aircraft is here for. E1 to E4 are the
 * speeds: level at the trim, the stall, the glide, the top. E5 is the roll,
 * the unlimited class's, at high and low rate. E6 is the crisp pitch, the
 * short period's step. E7 is the vertical. E8 is the symmetric section:
 * upright and inverted alike. E9 is the snap: a yank at the edge of the
 * envelope departs, half of it does not, and letting go stops it. E11 the
 * prop's torque. E12 to E16 the taildragger gear: standing on it, the take
 * off, tracking, the taxi turn on the tailwheel, a landing. E17 holds
 * every other aircraft's recorded hash where it was before the Edge
 * existed, and E18 flies the Edge's recording in Node and in headless
 * Chrome and holds the two trace hashes equal. Bands are never widened
 * here: a plant outside one is a finding for the derivation. Run with
 * npm run edge:gates.
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
  EDGE_AIRFRAME, levelSpeed, glide, stallSpeed, propTorque, wingDebug, wheelLoads, attitude, must,
  edgeGroundPrelude, edgeTakeoffSticks, edgeLevel, edgeRoll, fullBank, edgeHeading, RC_STEP_MS,
  wingPrelude, skyPrelude, cubGroundPrelude, gliderRecPrelude, bramorPrelude, bramorChutePrelude,
  slowstickGroundPrelude, bombshellGroundPrelude, kadetGroundPrelude, timberRecPrelude, timberFloatRecPrelude,
} from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const th = JSON.parse(await readFile(join(root, 'tests/edge-thresholds.json'), 'utf8'));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const DEG = 180 / Math.PI;
const SPAN = 1.524;

async function edgeSim() {
  const sim = await loadSim(wasmBytes);
  if (sim.init(configText) !== SIM_OK) throw new Error('sim_init failed');
  if (sim.e.sim_set_airframe(EDGE_AIRFRAME) !== SIM_OK) throw new Error('sim_set_airframe failed');
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

/* The clock and one step of the sticks, in the air or on the strip. */
let clockMs = 0;
function step(sim, sticks) {
  must(sim.input(clockMs / 1000, ...sticks), 'sim_input');
  must(sim.step(RC_STEP_MS), 'sim_step');
  clockMs += RC_STEP_MS;
  const s = sim.readState().state;
  const loads = wheelLoads(sim);
  return { s, loads, loaded: loads.slice(0, 3).some((f) => f > 0), hull: sim.e.sim_ground_contacts() };
}

/* Level flight at `speed0` along world +x, 300 m up, upright or on its
 * back, the hands of edgeLevel for `settleMs` at `duty`: the state after. */
function settle(sim, { inverted = false, speed0 = 22, duty = 0.75, settleMs = 6000 } = {}) {
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
  if (inverted) {
    must(sim.e.sim_set_pose(0, 0, 300, 0, 1, 0, 0), 'sim_set_pose');
  } else {
    must(sim.e.sim_set_pose(0, 0, 300, 1, 0, 0, 0), 'sim_set_pose');
  }
  must(sim.e.sim_wing_launch(speed0), 'sim_wing_launch');
  clockMs = 0;
  const trim = { v: 0 };
  const b = inverted ? Math.PI : 0;
  let o = { s: sim.readState().state };
  const tail = [];
  for (let ms = 0; ms < settleMs; ms += RC_STEP_MS) {
    const [roll, pitch] = edgeLevel(o.s, { b, trim });
    o = step(sim, [roll, pitch, 0, duty]);
    if (ms >= settleMs - 2000) tail.push({ v: speed(o.s), vz: o.s[6], stick: pitch, alpha: wingDebug(sim)[0] });
  }
  const mean = (k) => tail.reduce((a, x) => a + x[k], 0) / tail.length;
  return { s: o.s, v: mean('v'), vz: mean('vz'), stick: mean('stick'), alpha: mean('alpha'), trim };
}

/* Full stick on one axis from level flight at `speed0`: the peak body roll
 * rate over `ms`, and the roll turned through, from the body rates. */
function rollFrom(sim, { inverted = false, speed0 = 25, stick = 1, ms = 1500 } = {}) {
  settle(sim, { inverted, speed0, settleMs: 1500 });
  let peak = 0;
  let vAt = speed0;
  for (let t = 0; t < ms; t += RC_STEP_MS) {
    const o = step(sim, [stick, 0, 0, 0.75]);
    if (Math.abs(o.s[11]) > Math.abs(peak)) {
      peak = o.s[11];
      vAt = speed(o.s);
    }
  }
  return { rateDegS: peak * DEG, v: vAt };
}

/* The snap: from level at the trim, the elevator to `pitch` of full
 * travel at once (pushed on its back), the rudder at `yaw`, the ailerons
 * centred, for `holdMs`; then let go: every stick centred, or with
 * `recover` AOPA's recovery, the elevator released and the rudder full
 * the other way until the rotation stops. The roll turned through and the
 * peak roll rate while held, the largest angle of attack, and how long
 * after letting go until the roll rate is under 30 deg/s with the wing
 * unstalled. */
function snap(sim, { inverted = false, pitch = 1, yaw = 0, holdMs = 1200, recover = false } = {}) {
  settle(sim, { inverted, speed0: th.e9_snap.speed, settleMs: 3000 });
  const sgn = inverted ? -1 : 1;
  let turned = 0;
  let peak = 0;
  let alphaMax = 0;
  let last = 0;
  let lastN = 0;
  for (let t = 0; t < holdMs; t += RC_STEP_MS) {
    const o = step(sim, [0, sgn * pitch, yaw, 0.75]);
    turned += o.s[11] * RC_STEP_MS / 1000;
    peak = Math.max(peak, Math.abs(o.s[11]));
    alphaMax = Math.max(alphaMax, Math.abs(wingDebug(sim)[0]));
    if (t >= holdMs - 500) {
      last += o.s[11] * Math.sign(turned || 1);
      lastN += 1;
    }
  }
  let stopped = null;
  for (let t = 0; t < 2000 && stopped === null; t += RC_STEP_MS) {
    const o = step(sim, [0, 0, recover ? -yaw : 0, 0.75]);
    if (Math.abs(o.s[11]) < 30 / DEG && Math.abs(wingDebug(sim)[0]) < th.e2_stall.alphaStall) stopped = (t + RC_STEP_MS) / 1000;
  }
  return { turnedDeg: turned * DEG, peakDegS: peak * DEG, lastDegS: (lastN ? last / lastN : 0) * DEG, alphaMaxDeg: alphaMax * DEG, stopped };
}

console.log('edge gates: the plant against docs/EDGE-STAGE1.md');
const sim = await edgeSim();
check: {
  if (sim.e.sim_airframe() !== EDGE_AIRFRAME) {
    gate('E0', 'the Edge is selected', false, `airframe ${sim.e.sim_airframe()}`, `${EDGE_AIRFRAME}`);
    break check;
  }

  const up = settle(sim, { settleMs: 20000 });
  gate('E1', 'level at three quarter throttle', within(up.v, th.e1_level_75) && Math.abs(up.vz) < 0.2,
    `${up.v.toFixed(2)} m/s, sink ${(-up.vz).toFixed(2)}, elevator stick ${up.stick.toFixed(3)}`, band(th.e1_level_75));

  const e2 = stallSpeed(sim, th.e2_stall.alphaStall);
  gate('E2', 'stall speed, power off', e2 != null && within(e2, th.e2_stall), e2 == null ? 'no stall reached' : `${e2.toFixed(2)} m/s`, band(th.e2_stall));

  const e3 = glide(sim, th.e3_glide.speed);
  gate('E3', 'glide ratio at 1.4 Vs, power off', within(e3.ratio, th.e3_glide), `${e3.ratio.toFixed(2)} at ${e3.v.toFixed(1)} m/s, sink ${e3.sink.toFixed(2)}`, band(th.e3_glide));

  const top = settle(sim, { duty: th.e4_top.duty, speed0: 28, settleMs: 20000 });
  gate('E4', 'top speed, level', within(top.v, th.e4_top) && Math.abs(top.vz) < 0.2, `${top.v.toFixed(2)} m/s, sink ${(-top.vz).toFixed(2)}`, band(th.e4_top));

  const e5 = rollFrom(sim, { speed0: th.e5_roll.speed });
  const pb = Math.abs(e5.rateDegS / DEG) * SPAN / (2 * e5.v);
  gate('E5', 'full aileron, high rate: pb/2V and deg/s', within(pb, th.e5_roll) && Math.abs(e5.rateDegS) >= th.e5_roll.minDegS,
    `${pb.toFixed(3)}: ${Math.abs(e5.rateDegS).toFixed(0)} deg/s at ${e5.v.toFixed(1)} m/s, ${e5.rateDegS > 0 ? 'right' : 'LEFT'}`,
    `${band(th.e5_roll)}, at least ${th.e5_roll.minDegS} deg/s`);
  /* The low rate as the hangar seats it: sim_wing_set_tune with EF's low
   * throws and the table's expo, the rest stock. */
  {
    const tune = new Float64Array(11);
    const rad = (d) => d * 3.14159265358979323846 / 180;
    tune[3] = rad(17.5); tune[4] = rad(9); tune[5] = rad(20);
    tune[6] = 0.70; tune[7] = 0.70; tune[8] = 0.70;
    const ptr = sim.e.malloc(11 * 8);
    new Float64Array(sim.e.memory.buffer, ptr, 11).set(tune);
    must(sim.e.sim_wing_set_tune(ptr), 'sim_wing_set_tune');
    const lo = rollFrom(sim, { speed0: th.e5_roll.speed });
    must(sim.e.sim_wing_tune_clear(), 'sim_wing_tune_clear');
    const pbLo = Math.abs(lo.rateDegS / DEG) * SPAN / (2 * lo.v);
    gate('E5b', 'full aileron, low rate: pb/2V', within(pbLo, th.e5_low), `${pbLo.toFixed(3)}: ${Math.abs(lo.rateDegS).toFixed(0)} deg/s at ${lo.v.toFixed(1)} m/s`, band(th.e5_low));
  }

  /* E6: half up stick at once from level at the trim; the time to the
   * pitch rate's first peak. */
  {
    settle(sim, { speed0: th.e6_pitch.speed, settleMs: 3000 });
    let peak = 0;
    let at = null;
    for (let t = 0; t < 1000; t += RC_STEP_MS) {
      const o = step(sim, [0, th.e6_pitch.stick, 0, 0.75]);
      const q = -o.s[12];
      if (q > peak) {
        peak = q;
        at = (t + RC_STEP_MS) / 1000;
      }
    }
    gate('E6', 'crisp pitch: half stick, time to the peak rate', at !== null && within(at, th.e6_pitch), `${at === null ? 'none' : at.toFixed(3)} s to ${(peak * DEG).toFixed(0)} deg/s`, `${band(th.e6_pitch)} s`);
  }

  /* E7: pulled to the vertical at full throttle and held straight up; the
   * climb rate it settles at. */
  {
    settle(sim, { speed0: 22, settleMs: 1500 });
    let o = null;
    const tail = [];
    /* The nose's angle in the vertical plane it was launched along, world
     * +x: past 90 deg it reads past 90, where asin would read back down. */
    const climbAngle = (s) => Math.atan2(2 * (s[8] * s[10] - s[7] * s[9]), 1 - 2 * (s[9] * s[9] + s[10] * s[10]));
    for (let t = 0; t < 12000; t += RC_STEP_MS) {
      const s = o ? o.s : sim.readState().state;
      /* Pulled up at 60 deg/s: a yank to the vertical is the snap of E9. */
      const want = Math.min(Math.PI / 2, (t / 1000) * (60 / DEG));
      const stick = Math.max(-1, Math.min(1, 2.5 * (want - climbAngle(s)) - 0.25 * -s[12]));
      /* The torque rolls it on the way up: the ailerons hold the left wing
       * on world +y, the rudder the nose in the plane it was pulled in. */
      const leftX = 2 * (s[8] * s[9] - s[7] * s[10]);
      const fwdY = 2 * (s[8] * s[9] + s[7] * s[10]);
      const roll = Math.max(-1, Math.min(1, 1.5 * leftX - 0.05 * s[11]));
      const yaw = Math.max(-1, Math.min(1, 2.0 * fwdY + 0.2 * s[13]));
      o = step(sim, [roll, stick, yaw, 1]);
      if (t >= 9000) tail.push({ vz: o.s[6], pitch: climbAngle(o.s) });
    }
    const vz = tail.reduce((a, x) => a + x.vz, 0) / tail.length;
    const p = tail.reduce((a, x) => a + x.pitch, 0) / tail.length;
    gate('E7', 'straight up at full throttle', within(vz, th.e7_vertical), `${vz.toFixed(2)} m/s climbing at ${(p * DEG).toFixed(1)} deg`, `${band(th.e7_vertical)} m/s`);
  }

  /* E8: upright and inverted alike. */
  {
    const inv = settle(sim, { inverted: true, settleMs: 20000 });
    const e8 = th.e8_inverted;
    gate('E8a', 'on its back: level speed as upright', pct(inv.v, up.v) <= e8.levelPct && Math.abs(inv.vz) < 0.2,
      `${inv.v.toFixed(2)} against ${up.v.toFixed(2)} m/s, ${pct(inv.v, up.v).toFixed(1)} percent, sink ${(-inv.vz).toFixed(2)}`, `within ${e8.levelPct} percent`);
    gate('E8b', 'on its back: a little down elevator holds it', inv.stick < 0 && -inv.stick <= e8.maxPush,
      `stick ${inv.stick.toFixed(3)}, alpha ${(inv.alpha * DEG).toFixed(2)} deg (upright ${up.stick.toFixed(3)}, ${(up.alpha * DEG).toFixed(2)})`, `a push under ${e8.maxPush}`);
    /* The stall on its back: power off, the nose raised over the horizon
     * steadily, pushed, from the same throw; where the angle of attack
     * reaches the stall's on the negative side. */
    let invStall = null;
    must(sim.reset(), 'sim_reset');
    must(sim.e.sim_set_pose(0, 0, 300, 0, 1, 0, 0), 'sim_set_pose');
    must(sim.e.sim_wing_launch(13), 'sim_wing_launch');
    clockMs = 0;
    let o = { s: sim.readState().state };
    for (let ms = 0; ms < 12000 && invStall === null; ms += RC_STEP_MS) {
      const { pitch } = attitude(o.s);
      const pitchT = Math.min(0.6, 0.06 * ms / 1000);
      const stick = Math.max(-1, Math.min(1, -(2.5 * (pitchT - pitch)) - 0.25 * -o.s[12]));
      o = step(sim, [edgeRoll(o.s, Math.PI), stick, 0, 0]);
      if (ms > 1000 && wingDebug(sim)[0] < -th.e2_stall.alphaStall) invStall = speed(o.s);
    }
    gate('E8c', 'on its back: stall speed as upright', invStall !== null && e2 != null && pct(invStall, e2) <= e8.stallPct,
      invStall === null ? 'no stall reached' : `${invStall.toFixed(2)} against ${e2 == null ? '?' : e2.toFixed(2)} m/s, ${e2 == null ? '?' : pct(invStall, e2).toFixed(1)} percent`, `within ${e8.stallPct} percent`);
    const invRoll = rollFrom(sim, { inverted: true, speed0: th.e5_roll.speed });
    gate('E8d', 'on its back: roll rate as upright', pct(Math.abs(invRoll.rateDegS), Math.abs(e5.rateDegS)) <= e8.rollPct,
      `${Math.abs(invRoll.rateDegS).toFixed(0)} against ${Math.abs(e5.rateDegS).toFixed(0)} deg/s`, `within ${e8.rollPct} percent`);
  }

  /* E9: the edge of the envelope. A yank alone departs; the snap roll is
   * AOPA's, the yank and a boot of rudder. */
  {
    const e9 = th.e9_snap;
    const said = (r) => `rolled ${r.turnedDeg.toFixed(0)} deg, peak ${r.peakDegS.toFixed(0)} deg/s, last half second ${r.lastDegS.toFixed(0)}, alpha ${r.alphaMaxDeg.toFixed(1)}, stopped ${r.stopped === null ? 'never' : `${r.stopped.toFixed(2)} s`} after`;
    const departed = (r) => Math.abs(r.turnedDeg) >= e9.departDeg && r.stopped !== null && r.stopped <= e9.stopS;
    const u9 = snap(sim);
    gate('E9a', 'a yank at the trim departs, let go it stops', departed(u9), said(u9), `${e9.departDeg} deg of roll in ${e9.holdS} s, stopped in ${e9.stopS} s`);
    const i9 = snap(sim, { inverted: true });
    gate('E9b', 'and pushed on its back', departed(i9), said(i9), `${e9.departDeg} deg of roll in ${e9.holdS} s, stopped in ${e9.stopS} s`);
    const h9 = snap(sim, { pitch: e9.calmStick });
    gate('E9c', 'half stick is short of the edge', Math.abs(h9.turnedDeg) < e9.calmRollDeg, said(h9), `under ${e9.calmRollDeg} deg of roll`);
    const roll = (yaw, inverted = false) => snap(sim, { yaw, inverted, holdMs: e9.snapHoldS * 1000, recover: true });
    const sr = roll(1);
    const sl = roll(-1);
    const snapped = (r) => r.lastDegS >= e9.keepShare * r.peakDegS && Math.abs(r.turnedDeg) >= e9.snapDeg && r.stopped !== null && r.stopped <= e9.recoverS;
    gate('E9d', 'yank and rudder: a snap roll the rudder way', snapped(sr) && snapped(sl) && sr.turnedDeg > 0 && sl.turnedDeg < 0,
      `right: ${said(sr)}; left: ${said(sl)}`, `still turning the rudder's way at the end of ${e9.snapHoldS} s, at ${e9.keepShare} of its peak rate or more, ${e9.snapDeg} deg at least; recovered in ${e9.recoverS} s`);
    const si = roll(1, true);
    gate('E9e', 'and on its back', snapped(si), said(si), `still turning at ${e9.keepShare} of its peak rate, ${e9.snapDeg} deg at least in ${e9.snapHoldS} s; recovered in ${e9.recoverS} s`);
  }

  const e11 = propTorque(sim);
  gate('E11', 'prop torque, static full throttle', e11.rollMoment < 0 && within(-e11.rollMoment, th.e11_prop_torque),
    `${(-e11.rollMoment).toFixed(3)} N m ${e11.rollMoment < 0 ? 'rolling left' : 'WRONG WAY'} at ${e11.thrust.toFixed(1)} N`, `${band(th.e11_prop_torque)} N m, rolling left`);

  /* The gear. */
  const onStrip = () => {
    must(sim.reset(), 'sim_reset');
    must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
    edgeGroundPrelude(sim, { mu: GROUND_MU, e: GROUND_E });
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
  const r12 = th.e12_rest;
  gate('E12', 'standing on its wheels', rest.pitch >= r12.pitchMin && rest.pitch <= r12.pitchMax && rest.z >= r12.zMin && rest.z <= r12.zMax && rest.tail >= r12.tailMin && rest.tail <= r12.tailMax && hull === 0 && Math.hypot(o.s[4], o.s[5]) < 0.01,
    `${rest.pitch.toFixed(2)} deg, CG ${rest.z.toFixed(4)} m, tail ${(rest.tail * 100).toFixed(1)} percent, loads ${o.loads.map((f) => f.toFixed(2)).join(' ')} N, hull ${hull}`,
    `${r12.pitchMin} to ${r12.pitchMax} deg, ${r12.zMin} to ${r12.zMax} m, ${r12.tailMin * 100} to ${r12.tailMax * 100} percent, no hull`);

  /* The take off: the pilot of edgeTakeoffSticks from rest, liftoff the
   * last step on the wheels before 200 ms clear of them. */
  const takeoff = (yawHold) => {
    onStrip();
    let last = null;
    let off = 0;
    let worstHeading = 0;
    let worstY = 0;
    let p = { s: sim.readState().state };
    for (let ms = 0; ms < 8000; ms += RC_STEP_MS) {
      p = step(sim, edgeTakeoffSticks(p.s, ms, { vRotate: th.e13_takeoff.vRotate, yawHold }));
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
  const e13 = takeoff(1);
  const t13 = th.e13_takeoff;
  gate('E13', 'take off roll from rest', e13 != null && e13.dist >= t13.distMin && e13.dist <= t13.distMax && e13.v >= t13.vMin && e13.v <= t13.vMax,
    e13 == null ? 'never left the ground' : `${e13.dist.toFixed(2)} m to liftoff at ${e13.v.toFixed(2)} m/s, ${e13.t.toFixed(2)} s`,
    `${t13.distMin} to ${t13.distMax} m, ${t13.vMin} to ${t13.vMax} m/s`);
  const t14 = th.e14_straight;
  gate('E14', 'the roll tracks straight on the rudder', e13 != null && e13.worstHeading * DEG < t14.maxHeadingDeg && e13.worstY < t14.maxOffLine,
    e13 == null ? 'never left the ground' : `heading within ${(e13.worstHeading * DEG).toFixed(1)} deg, ${e13.worstY.toFixed(2)} m off the line`,
    `under ${t14.maxHeadingDeg} deg, under ${t14.maxOffLine} m`);
  const loose = takeoff(0);
  gate('E14b', 'feet off the rudder: the swing, recorded', loose != null,
    loose == null ? 'never left the ground' : `heading ${(loose.worstHeading * DEG).toFixed(1)} deg at worst, ${loose.worstY.toFixed(2)} m off the line`, 'a record, not a band');

  /* Taxi: full right rudder at walking pace; the radius from the speed and
   * the heading rate over the last two of five seconds. */
  onStrip();
  for (let ms = 0; ms < 2000; ms += RC_STEP_MS) step(sim, [0, 0, 0, th.e15_taxi.duty]);
  let h0 = null;
  let vSum = 0;
  let n15 = 0;
  let allLoaded = true;
  for (let ms = 0; ms < 5000; ms += RC_STEP_MS) {
    o = step(sim, [0, 0, 1, th.e15_taxi.duty]);
    allLoaded = allLoaded && o.loads.slice(0, 3).every((f) => f > 0);
    if (ms === 3000) h0 = edgeHeading(o.s);
    if (ms > 3000) { vSum += speed(o.s); n15 += 1; }
  }
  let dh = edgeHeading(o.s) - h0;
  dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  const r15 = (vSum / n15) / Math.abs(dh / 1.996);
  gate('E15', 'taxi turn on the tailwheel', dh < 0 && within(r15, th.e15_taxi) && allLoaded, `${r15.toFixed(2)} m at ${(vSum / n15).toFixed(2)} m/s, ${dh < 0 ? 'turning right' : 'WRONG WAY'}${allLoaded ? '' : ', a wheel lifted'}`, `${band(th.e15_taxi)} m, turning right`);

  /* A landing: from 4 m at 13 m/s, the throttle closed and the nose held
   * 5 deg up on the glide, a flare to 10 deg, the three point attitude, at
   * 0.8 m, and on the wheels full up stick to hold the tail down through
   * the roll out. */
  must(sim.reset(), 'sim_reset');
  edgeGroundPrelude(sim, { mu: GROUND_MU, e: GROUND_E });
  must(sim.e.sim_set_pose(0, 0, 4, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(13), 'sim_wing_launch');
  clockMs = 0;
  let touched = null;
  let hullLanding = 0;
  o = { s: sim.readState().state, loaded: false };
  for (let ms = 0; ms < 16000; ms += RC_STEP_MS) {
    const { pitch } = attitude(o.s);
    const roll = edgeRoll(o.s);
    const qAero = -o.s[12];
    let sticks;
    if (touched !== null) {
      sticks = [roll, 1, 0, 0];
    } else if (o.s[3] > 0.8) {
      sticks = [roll, Math.max(-1, Math.min(1, 2.5 * (5 / DEG - pitch) - 0.25 * qAero)), 0, 0];
    } else {
      sticks = [roll, Math.max(-1, Math.min(1, 2.5 * (10 / DEG - pitch) - 0.25 * qAero)), 0, 0];
    }
    o = step(sim, sticks);
    if (o.loaded && touched === null) touched = { v: speed(o.s), vz: o.s[6], x: o.s[1] };
    if (touched !== null) hullLanding = Math.max(hullLanding, o.hull + (o.loads[3] > 0 ? 1 : 0));
  }
  const land = { pitch: attitude(o.s).pitch * DEG, v: Math.hypot(o.s[4], o.s[5]), roll: touched ? o.s[1] - touched.x : 0 };
  gate('E16', 'a landing on the wheels', touched !== null && land.v < 0.05 && Math.abs(land.pitch - rest.pitch) <= th.e16_landing.pitchTolDeg && hullLanding === 0 && o.loads.slice(0, 3).every((f) => f > 0),
    touched === null ? 'never touched down' : `touched at ${touched.v.toFixed(1)} m/s sinking ${(-touched.vz).toFixed(2)}, rolled ${land.roll.toFixed(1)} m, at rest at ${land.pitch.toFixed(2)} deg, hull or prop ${hullLanding}`,
    `at rest within ${th.e16_landing.pitchTolDeg} deg of E12, no hull or prop`);
}

const quadTh = JSON.parse(await readFile(join(root, 'tests/thresholds.json'), 'utf8'));
const replayBase = { configText, renderHz: quadTh.replay.canonical_render_hz.value, traceStrideMs: quadTh.replay.trace_stride_ms.value };
const recOf = async (f) => decodeRec(new Uint8Array(await readFile(join(root, f))));
const hashOf = async (f, prelude) => (await replayTrace(await loadSim(wasmBytes), await recOf(f), { ...replayBase, prelude })).slice(0, 16);
const u = th.e17_unmoved;
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
};
const names = Object.keys(got);
gate('E17', 'every other aircraft unmoved', names.every((k) => got[k] === u[k]),
  names.map((k) => got[k]).join(', '), names.map((k) => u[k]).join(', '));

const edgeRec = await recOf('tests/inputs/edge-baseline.rec');
const edgeOpts = { ...replayBase, prelude: (s) => edgeGroundPrelude(s) };
const nodeHash = (await replayTrace(await loadSim(wasmBytes), edgeRec, edgeOpts)).slice(0, 16);
const nodeAgain = (await replayTrace(await loadSim(wasmBytes), edgeRec, edgeOpts)).slice(0, 16);
if (!findChrome()) {
  gate('E18', 'Node and Chrome agree', null, `node ${nodeHash} twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}, no Chrome here`, 'identical');
} else {
  const server = await startServer(root);
  try {
    const out = await runBrowserHarness(`${server.origin}/tests/browser/wing-harness.html?plane=edge`);
    const result = out.result || {};
    const chromeHash = result.ok ? String(result.hash).slice(0, 16) : `error: ${result.message || result.errorName || JSON.stringify(out).slice(0, 80)}`;
    gate('E18', 'Node and Chrome agree', nodeAgain === nodeHash && result.ok && chromeHash === nodeHash, `node ${nodeHash} (twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}), chrome ${chromeHash}`, 'identical');
  } finally {
    await server.close();
  }
}

console.log('');
for (const [id, name, measured, b, status] of rows) {
  console.log(`  ${status.padEnd(4)}  ${id.padEnd(4)} ${name.padEnd(46)} ${String(measured).padEnd(70)} ${b}`);
}
console.log(`\n${failed ? `${failed} FAILED, ` : ''}${rows.length - failed - skipped} of ${rows.length} gates hold${skipped ? `, ${skipped} SKIPPED (a skip is not a pass)` : ''}`);
process.exit(failed ? 1 : 0);
