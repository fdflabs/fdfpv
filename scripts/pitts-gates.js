/*
 * pitts-gates.js: the E-flite Pitts S-1S 850mm plant against the bands in
 * tests/pitts-thresholds.json.
 *
 * Checks from docs/PITTS-STAGE1.md. P1 to P6 are its performance as an
 * aeroplane: a level cruise, the stall, a glide, its top speed, the roll
 * rate of four ailerons on the high and the low rate against the full
 * size S-1S's, and a crisp pitch. P8 is the S-1S that "doesn't know right
 * side up from upside down". P9 is the edge of the envelope: a yank is a
 * comfortable stall, a yank and a boot of rudder a snap roll, inside and
 * out (the outside one recorded), and AOPA's recovery stops it. P10 is the prop's torque. P11 to P15
 * are its short taildragger gear: standing at the drawn pose, a take off
 * roll that tracks on the rudder, the swing with the feet off, the
 * tightest taxi turn here and a landing. B1 to B3 are why it is a biplane
 * and not a monoplane of its area: Prandtl's induced drag flown, the two
 * wings' lifts summing to the cell's, and the top wing stalling first
 * upright and on its back. B4 holds every other aircraft's recorded hash
 * where it was before this one and its second wing existed, and B5 flies
 * the Pitts's recording in Node and in headless Chrome and holds the two
 * hashes equal. Bands are never widened here: a plant outside one is a
 * finding for the derivation. Run with npm run pitts:gates.
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
  PITTS_AIRFRAME, glide, stallSpeed, propTorque, wingDebug, wingBiplane, wheelLoads, attitude, must,
  pittsGroundPrelude, pittsTakeoffSticks, pittsLevel, edgeRoll, edgeHeading, RC_STEP_MS,
  wingPrelude, skyPrelude, cubGroundPrelude, gliderRecPrelude, bramorPrelude, bramorChutePrelude,
  slowstickGroundPrelude, bombshellGroundPrelude, kadetGroundPrelude, timberRecPrelude, timberFloatRecPrelude,
  p51RecPrelude, p51AirPrelude, edgeGroundPrelude, f16GroundPrelude, extraGroundPrelude, zagiPrelude, uglystikGroundPrelude,
} from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const th = JSON.parse(await readFile(join(root, 'tests/pitts-thresholds.json'), 'utf8'));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const DEG = 180 / Math.PI;
const SPAN = 0.850;

async function pittsSim() {
  const sim = await loadSim(wasmBytes);
  if (sim.init(configText) !== SIM_OK) throw new Error('sim_init failed');
  if (sim.e.sim_set_airframe(PITTS_AIRFRAME) !== SIM_OK) throw new Error('sim_set_airframe failed');
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

let clockMs = 0;
function step(sim, sticks) {
  must(sim.input(clockMs / 1000, ...sticks), 'sim_input');
  must(sim.step(RC_STEP_MS), 'sim_step');
  clockMs += RC_STEP_MS;
  const s = sim.readState().state;
  const loads = wheelLoads(sim);
  return { s, loads, loaded: loads.slice(0, 3).some((f) => f > 0), hull: sim.e.sim_ground_contacts() };
}

/* Level flight along world +x, 300 m up, upright or on its back, the
 * Pitts's hands (pittsLevel) for `settleMs` at `duty`: the means of the
 * last two seconds, and the plant's CL and CD there. */
function settle(sim, { inverted = false, speed0 = 13.3, duty = 0.75, settleMs = 6000 } = {}) {
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
  must(sim.e.sim_set_pose(0, 0, 300, inverted ? 0 : 1, inverted ? 1 : 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(speed0), 'sim_wing_launch');
  clockMs = 0;
  const trim = { v: 0, e: 0 };
  const b = inverted ? Math.PI : 0;
  let o = { s: sim.readState().state };
  const tail = [];
  for (let ms = 0; ms < settleMs; ms += RC_STEP_MS) {
    const [roll, pitch] = pittsLevel(o.s, { b, trim });
    o = step(sim, [roll, pitch, 0, duty]);
    if (ms >= settleMs - 2000) {
      const d = wingDebug(sim);
      tail.push({ v: speed(o.s), vz: o.s[6], stick: pitch, alpha: d[0], cl: d[3], cd: d[4] });
    }
  }
  const mean = (k) => tail.reduce((a, x) => a + x[k], 0) / tail.length;
  return { s: o.s, v: mean('v'), vz: mean('vz'), stick: mean('stick'), alpha: mean('alpha'), cl: mean('cl'), cd: mean('cd') };
}

/* Full aileron from level flight: the peak body roll rate over `ms`. */
function rollFrom(sim, { inverted = false, speed0 = 15, ms = 1500 } = {}) {
  settle(sim, { inverted, speed0, settleMs: 1500 });
  let peak = 0;
  let vAt = speed0;
  for (let t = 0; t < ms; t += RC_STEP_MS) {
    const o = step(sim, [1, 0, 0, 0.75]);
    if (Math.abs(o.s[11]) > Math.abs(peak)) {
      peak = o.s[11];
      vAt = speed(o.s);
    }
  }
  return { rateDegS: peak * DEG, v: vAt };
}

/* The snap: from level at the trim, the elevator to `pitch` of full
 * travel at once (pushed, for an outside snap or on its back), the rudder
 * at `yaw`, the ailerons centred, for `holdMs`; then let go, or with
 * `recover` AOPA's recovery, the elevator released and the rudder full
 * the other way, until the roll rate is under 30 deg/s with the wing
 * unstalled. */
function snap(sim, { inverted = false, pitch = 1, yaw = 0, holdMs = 1200, recover = false } = {}) {
  settle(sim, { inverted, speed0: th.p9_snap.speed, settleMs: inverted ? 12000 : 3000 });
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
    if (Math.abs(o.s[11]) < 30 / DEG && Math.abs(wingDebug(sim)[0]) < th.p2_stall.alphaStall) stopped = (t + RC_STEP_MS) / 1000;
  }
  return { turnedDeg: turned * DEG, peakDegS: peak * DEG, lastDegS: (lastN ? last / lastN : 0) * DEG, alphaMaxDeg: alphaMax * DEG, stopped };
}

console.log('pitts gates: the plant against docs/PITTS-STAGE1.md');
const sim = await pittsSim();
check: {
  if (sim.e.sim_airframe() !== PITTS_AIRFRAME) {
    gate('P0', 'the Pitts is selected', false, `airframe ${sim.e.sim_airframe()}`, `${PITTS_AIRFRAME}`);
    break check;
  }

  const up = settle(sim, { settleMs: 20000 });
  gate('P1', 'level at three quarter throttle', within(up.v, th.p1_level_75) && Math.abs(up.vz) < 0.2,
    `${up.v.toFixed(2)} m/s, sink ${(-up.vz).toFixed(2)}, elevator stick ${up.stick.toFixed(3)}`, band(th.p1_level_75));

  const p2 = stallSpeed(sim, th.p2_stall.alphaStall);
  gate('P2', 'stall speed, power off', p2 != null && within(p2, th.p2_stall), p2 == null ? 'no stall reached' : `${p2.toFixed(2)} m/s`, band(th.p2_stall));

  const p3 = glide(sim, th.p3_glide.speed);
  gate('P3', 'glide ratio at 1.4 Vs, power off', within(p3.ratio, th.p3_glide), `${p3.ratio.toFixed(2)} at ${p3.v.toFixed(1)} m/s, sink ${p3.sink.toFixed(2)}`, band(th.p3_glide));

  const top = settle(sim, { duty: th.p4_top.duty, speed0: 18, settleMs: 20000 });
  gate('P4', 'top speed, level', within(top.v, th.p4_top) && Math.abs(top.vz) < 0.2, `${top.v.toFixed(2)} m/s, sink ${(-top.vz).toFixed(2)}`, band(th.p4_top));

  const p5 = rollFrom(sim, { speed0: th.p5_roll.speed });
  const pb = Math.abs(p5.rateDegS / DEG) * SPAN / (2 * p5.v);
  gate('P5', 'four ailerons, high rate: pb/2V and deg/s', within(pb, th.p5_roll) && Math.abs(p5.rateDegS) >= th.p5_roll.minDegS,
    `${pb.toFixed(3)}: ${Math.abs(p5.rateDegS).toFixed(0)} deg/s at ${p5.v.toFixed(1)} m/s, ${p5.rateDegS > 0 ? 'right' : 'LEFT'}`,
    `${band(th.p5_roll)}, at least ${th.p5_roll.minDegS} deg/s`);
  /* The low rate as the hangar seats it: sim_wing_set_tune with E-flite's
   * low throws and the table's expo. */
  {
    const tune = new Float64Array(11);
    const rad = (d) => d * 3.14159265358979323846 / 180;
    tune[3] = rad(14.48); tune[4] = rad(20.05); tune[5] = rad(17.64);
    tune[6] = 0.30; tune[7] = 0.30; tune[8] = 0.30;
    const ptr = sim.e.malloc(11 * 8);
    new Float64Array(sim.e.memory.buffer, ptr, 11).set(tune);
    must(sim.e.sim_wing_set_tune(ptr), 'sim_wing_set_tune');
    const lo = rollFrom(sim, { speed0: th.p5_roll.speed });
    must(sim.e.sim_wing_tune_clear(), 'sim_wing_tune_clear');
    const pbLo = Math.abs(lo.rateDegS / DEG) * SPAN / (2 * lo.v);
    gate('P5b', 'four ailerons, low rate: pb/2V', within(pbLo, th.p5_low), `${pbLo.toFixed(3)}: ${Math.abs(lo.rateDegS).toFixed(0)} deg/s at ${lo.v.toFixed(1)} m/s`, band(th.p5_low));
  }

  /* P6: a small step of up stick at once from level at the trim, short of
   * the stall; the time to the pitch rate's first peak. */
  {
    settle(sim, { speed0: th.p6_pitch.speed, settleMs: 3000 });
    let peak = 0;
    let at = null;
    for (let t = 0; t < 1000; t += RC_STEP_MS) {
      const o = step(sim, [0, th.p6_pitch.stick, 0, 0.75]);
      const q = -o.s[12];
      if (q > peak) {
        peak = q;
        at = (t + RC_STEP_MS) / 1000;
      }
    }
    gate('P6', 'crisp pitch: time to the peak rate', at !== null && within(at, th.p6_pitch), `${at === null ? 'none' : at.toFixed(3)} s to ${(peak * DEG).toFixed(0)} deg/s`, `${band(th.p6_pitch)} s`);
  }

  /* P8: upright and inverted alike. */
  {
    const inv = settle(sim, { inverted: true, settleMs: 30000 });
    const e8 = th.p8_inverted;
    gate('P8a', 'on its back: level speed as upright', pct(inv.v, up.v) <= e8.levelPct && Math.abs(inv.vz) < 0.2,
      `${inv.v.toFixed(2)} against ${up.v.toFixed(2)} m/s, ${pct(inv.v, up.v).toFixed(1)} percent, sink ${(-inv.vz).toFixed(2)}, push ${inv.stick.toFixed(3)} (upright ${up.stick.toFixed(3)})`, `within ${e8.levelPct} percent`);
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
      if (ms > 1000 && wingDebug(sim)[0] < -th.p2_stall.alphaStall) invStall = speed(o.s);
    }
    gate('P8b', 'on its back: stall speed as upright', invStall !== null && p2 != null && pct(invStall, p2) <= e8.stallPct,
      invStall === null ? 'no stall reached' : `${invStall.toFixed(2)} against ${p2 == null ? '?' : p2.toFixed(2)} m/s, ${p2 == null ? '?' : pct(invStall, p2).toFixed(1)} percent`, `within ${e8.stallPct} percent`);
    /* The roll as the helix angle, pb/2V, which the speed each was at
     * when it rolled does not move. */
    const invRoll = rollFrom(sim, { inverted: true, speed0: th.p5_roll.speed });
    const pbInv = Math.abs(invRoll.rateDegS / DEG) * SPAN / (2 * invRoll.v);
    gate('P8c', 'on its back: roll rate as upright', pct(pbInv, pb) <= e8.rollPct,
      `pb/2V ${pbInv.toFixed(3)} against ${pb.toFixed(3)}: ${Math.abs(invRoll.rateDegS).toFixed(0)} deg/s at ${invRoll.v.toFixed(1)} m/s against ${Math.abs(p5.rateDegS).toFixed(0)} at ${p5.v.toFixed(1)}`, `within ${e8.rollPct} percent`);
  }

  /* P9: the edge of the envelope. */
  {
    const e9 = th.p9_snap;
    const said = (r) => `rolled ${r.turnedDeg.toFixed(0)} deg, peak ${r.peakDegS.toFixed(0)} deg/s, last half second ${r.lastDegS.toFixed(0)}, alpha ${r.alphaMaxDeg.toFixed(1)}, stopped ${r.stopped === null ? 'never' : `${r.stopped.toFixed(2)} s`} after`;
    const y9 = snap(sim);
    gate('P9a', 'a yank at the trim: a comfortable stall', y9.alphaMaxDeg > th.p2_stall.alphaStall * DEG && Math.abs(y9.turnedDeg) < e9.comfortDeg && y9.stopped !== null && y9.stopped <= e9.stopS,
      said(y9), `past the stall, under ${e9.comfortDeg} deg of roll in ${e9.holdS} s, stopped in ${e9.stopS} s`);
    const snapped = (r, sgn) => r.lastDegS >= e9.keepShare * r.peakDegS && sgn * r.turnedDeg >= e9.turnDeg && r.stopped !== null && r.stopped <= e9.recoverS;
    const roll = (yaw, pitch = 1) => snap(sim, { yaw, pitch, holdMs: e9.snapHoldS * 1000, recover: true });
    const sr = roll(1);
    const sl = roll(-1);
    gate('P9b', 'inside snap, the rudder way, both ways', snapped(sr, 1) && snapped(sl, -1),
      `right: ${said(sr)}; left: ${said(sl)}`, `still turning at ${e9.keepShare} of its peak rate at the end of ${e9.snapHoldS} s, ${e9.turnDeg} deg at least; recovered in ${e9.recoverS} s`);
    /* The outside snap: pushed, full down and full rudder; the rotation
     * reads the other way round about the body's roll axis. */
    const or = roll(1, -1);
    const ol = roll(-1, -1);
    gate('P9c', 'outside snap, pushed, recorded', true,
      `right rudder: ${said(or)}; left: ${said(ol)}`, 'a record, not a band: docs/PITTS-STAGE1.md, the outside snap');
  }

  const p10 = propTorque(sim);
  gate('P10', 'prop torque, static full throttle', p10.rollMoment < 0 && within(-p10.rollMoment, th.p10_prop_torque),
    `${(-p10.rollMoment).toFixed(3)} N m ${p10.rollMoment < 0 ? 'rolling left' : 'WRONG WAY'} at ${p10.thrust.toFixed(1)} N`, `${band(th.p10_prop_torque)} N m, rolling left`);

  /* The gear. */
  const onStrip = () => {
    must(sim.reset(), 'sim_reset');
    must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
    pittsGroundPrelude(sim, { mu: GROUND_MU, e: GROUND_E });
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
  const r11 = th.p11_rest;
  gate('P11', 'standing on its wheels', rest.pitch >= r11.pitchMin && rest.pitch <= r11.pitchMax && rest.z >= r11.zMin && rest.z <= r11.zMax && rest.tail >= r11.tailMin && rest.tail <= r11.tailMax && hull === 0 && Math.hypot(o.s[4], o.s[5]) < 0.01,
    `${rest.pitch.toFixed(2)} deg, CG ${rest.z.toFixed(4)} m, tail ${(rest.tail * 100).toFixed(1)} percent, loads ${o.loads.map((f) => f.toFixed(2)).join(' ')} N, hull ${hull}`,
    `${r11.pitchMin} to ${r11.pitchMax} deg, ${r11.zMin} to ${r11.zMax} m, ${r11.tailMin * 100} to ${r11.tailMax * 100} percent, no hull`);

  const takeoff = (yawHold) => {
    onStrip();
    let last = null;
    let off = 0;
    let worstHeading = 0;
    let worstY = 0;
    let p = { s: sim.readState().state };
    for (let ms = 0; ms < 10000; ms += RC_STEP_MS) {
      p = step(sim, pittsTakeoffSticks(p.s, ms, { vRotate: th.p12_takeoff.vRotate, yawHold }));
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
  const p12 = takeoff(1);
  const t12 = th.p12_takeoff;
  gate('P12', 'take off roll from rest', p12 != null && p12.dist >= t12.distMin && p12.dist <= t12.distMax && p12.v >= t12.vMin && p12.v <= t12.vMax,
    p12 == null ? 'never left the ground' : `${p12.dist.toFixed(2)} m to liftoff at ${p12.v.toFixed(2)} m/s, ${p12.t.toFixed(2)} s`,
    `${t12.distMin} to ${t12.distMax} m, ${t12.vMin} to ${t12.vMax} m/s`);
  const t13 = th.p13_straight;
  gate('P13', 'the roll tracks straight on the rudder', p12 != null && p12.worstHeading * DEG < t13.maxHeadingDeg && p12.worstY < t13.maxOffLine,
    p12 == null ? 'never left the ground' : `heading within ${(p12.worstHeading * DEG).toFixed(1)} deg, ${p12.worstY.toFixed(2)} m off the line`,
    `under ${t13.maxHeadingDeg} deg, under ${t13.maxOffLine} m`);
  const loose = takeoff(0);
  gate('P13b', 'feet off the rudder: the swing, recorded', loose != null,
    loose == null ? 'never left the ground' : `heading ${(loose.worstHeading * DEG).toFixed(1)} deg at worst, ${loose.worstY.toFixed(2)} m off the line`, 'a record, not a band');

  /* Taxi: full right rudder at walking pace; the radius from the speed and
   * the heading rate over the last two of five seconds. */
  onStrip();
  for (let ms = 0; ms < 2000; ms += RC_STEP_MS) step(sim, [0, 0, 0, th.p14_taxi.duty]);
  let h0 = null;
  let vSum = 0;
  let n14 = 0;
  let allLoaded = true;
  for (let ms = 0; ms < 5000; ms += RC_STEP_MS) {
    o = step(sim, [0, 0, 1, th.p14_taxi.duty]);
    allLoaded = allLoaded && o.loads.slice(0, 3).every((f) => f > 0);
    if (ms === 3000) h0 = edgeHeading(o.s);
    if (ms > 3000) { vSum += speed(o.s); n14 += 1; }
  }
  let dh = edgeHeading(o.s) - h0;
  dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  const r14 = (vSum / n14) / Math.abs(dh / 1.996);
  gate('P14', 'taxi turn on the tailwheel', dh < 0 && within(r14, th.p14_taxi) && allLoaded, `${r14.toFixed(2)} m at ${(vSum / n14).toFixed(2)} m/s, ${dh < 0 ? 'turning right' : 'WRONG WAY'}${allLoaded ? '' : ', a wheel lifted'}`, `${band(th.p14_taxi)} m, turning right`);

  /* A landing: from 4 m at 12 m/s, a little throttle held down the glide
   * as E-flite's manual says ("approximately 25%"), the nose 3 deg up, a
   * flare to the three point attitude at 0.6 m with the throttle closed,
   * and on the wheels full up stick through the roll out. */
  must(sim.reset(), 'sim_reset');
  pittsGroundPrelude(sim, { mu: GROUND_MU, e: GROUND_E });
  must(sim.e.sim_set_pose(0, 0, 4, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(12), 'sim_wing_launch');
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
    } else if (o.s[3] > 0.6) {
      sticks = [roll, Math.max(-1, Math.min(1, 2.5 * (3 / DEG - pitch) - 0.25 * qAero)), 0, 0.25];
    } else {
      sticks = [roll, Math.max(-1, Math.min(1, 2.5 * (12 / DEG - pitch) - 0.25 * qAero)), 0, 0];
    }
    o = step(sim, sticks);
    if (o.loaded && touched === null) touched = { v: speed(o.s), vz: o.s[6], x: o.s[1] };
    if (touched !== null) hullLanding = Math.max(hullLanding, o.hull + (o.loads[3] > 0 ? 1 : 0));
  }
  const land = { pitch: attitude(o.s).pitch * DEG, v: Math.hypot(o.s[4], o.s[5]), roll: touched ? o.s[1] - touched.x : 0 };
  gate('P15', 'a landing on the wheels', touched !== null && land.v < 0.05 && Math.abs(land.pitch - rest.pitch) <= th.p15_landing.pitchTolDeg && hullLanding === 0 && o.loads.slice(0, 3).every((f) => f > 0),
    touched === null ? 'never touched down' : `touched at ${touched.v.toFixed(1)} m/s sinking ${(-touched.vz).toFixed(2)}, rolled ${land.roll.toFixed(1)} m, at rest at ${land.pitch.toFixed(2)} deg, hull or prop ${hullLanding}`,
    `at rest within ${th.p15_landing.pitchTolDeg} deg of P11, no hull or prop`);

  /* B1: the induced drag flown, between level at the trim and at full
   * throttle: dCD / d(CL^2). */
  {
    const k = (up.cd - top.cd) / (up.cl * up.cl - top.cl * top.cl);
    gate('B1', 'Prandtl\'s biplane induced drag, flown', within(k, th.b1_induced) && !(th.b1_induced.mono >= th.b1_induced.min && th.b1_induced.mono <= th.b1_induced.max),
      `${k.toFixed(5)} (CL ${up.cl.toFixed(3)} and ${top.cl.toFixed(3)}); a monoplane of its span and area ${th.b1_induced.mono}`, `${band(th.b1_induced)}`);
  }

  /* B2 and B3: gliding at a held angle, and a slow pull into the stall. */
  {
    must(sim.reset(), 'sim_reset');
    must(sim.e.sim_set_pose(0, 0, 300, 1, 0, 0, 0), 'sim_set_pose');
    must(sim.e.sim_wing_launch(14), 'sim_wing_launch');
    clockMs = 0;
    let s = sim.readState().state;
    let lin = null;
    const stallOrder = (inverted) => {
      must(sim.reset(), 'sim_reset');
      must(sim.e.sim_set_pose(0, 0, 300, inverted ? 0 : 1, inverted ? 1 : 0, 0, 0), 'sim_set_pose');
      must(sim.e.sim_wing_launch(14), 'sim_wing_launch');
      clockMs = 0;
      s = sim.readState().state;
      const sgn = inverted ? -1 : 1;
      let first = null;
      let gain = 0;
      for (let ms = 0; ms < 12000 && first === null; ms += RC_STEP_MS) {
        const { pitch } = attitude(s);
        const want = Math.min(0.7, 0.05 * ms / 1000);
        const stick = Math.max(-1, Math.min(1, sgn * 2.5 * (want - pitch) + 0.25 * s[12]));
        s = step(sim, [edgeRoll(s, inverted ? Math.PI : 0), stick, 0, 0]).s;
        const a = wingDebug(sim)[0];
        const b = wingBiplane(sim);
        if (lin === null && !inverted && a * DEG >= th.b2_linear.alphaDeg) {
          const d = wingDebug(sim);
          lin = { a, cl: d[3], de: d[18], top: b[0], bottom: b[1] };
        }
        /* Short of its linear lift by 1 percent: that wing has begun to stall. */
        const shortTop = Math.abs(b[0]) < 0.99 * Math.abs(b[2]);
        const shortBottom = Math.abs(b[1]) < 0.99 * Math.abs(b[3]);
        if (shortTop || shortBottom) {
          first = { top: shortTop, bottom: shortBottom, alpha: a * DEG, v: speed(s) };
          gain = Math.abs(b[1]) - Math.abs(b[3]);
        }
      }
      return { first, gain };
    };
    const upright = stallOrder(false);
    const onBack = stallOrder(true);
    /* The table's linear lift, the wing's and the elevator's. */
    const clTable = lin ? 4.1895 * lin.a - 0.3457 * lin.de : 0;
    gate('B2', 'the two wings\' lift is the cell\'s, short of the stall', lin !== null && pct(lin.cl, clTable) <= th.b2_linear.tolPct,
      lin === null ? `never at ${th.b2_linear.alphaDeg} deg` : `CL ${lin.cl.toFixed(4)} against the table's ${clTable.toFixed(4)} at ${(lin.a * DEG).toFixed(2)} deg; the top wing's own ${lin.top.toFixed(4)}, the bottom's ${lin.bottom.toFixed(4)}`,
      `within ${th.b2_linear.tolPct} percent`);
    const said = (r) => (r.first === null ? 'neither stalled' : `${r.first.top ? 'the top wing' : 'the bottom wing'}${r.first.top && r.first.bottom ? ' and the bottom' : ''} first, at ${r.first.alpha.toFixed(2)} deg and ${r.first.v.toFixed(2)} m/s, the bottom wing ${r.gain >= 0 ? 'over' : 'UNDER'} its own linear lift by ${Math.abs(r.gain).toFixed(4)}`);
    const topFirst = (r) => r.first !== null && r.first.top && !r.first.bottom && r.gain > 0;
    gate('B3', 'the top wing stalls first, upright and on its back', topFirst(upright) && topFirst(onBack),
      `upright: ${said(upright)}; on its back: ${said(onBack)}`, 'the top wing alone, the bottom one gaining');
  }
}

const quadTh = JSON.parse(await readFile(join(root, 'tests/thresholds.json'), 'utf8'));
const replayBase = { configText, renderHz: quadTh.replay.canonical_render_hz.value, traceStrideMs: quadTh.replay.trace_stride_ms.value };
const recOf = async (f) => decodeRec(new Uint8Array(await readFile(join(root, f))));
const hashOf = async (f, prelude) => (await replayTrace(await loadSim(wasmBytes), await recOf(f), { ...replayBase, prelude })).slice(0, 16);
const u = th.b4_unmoved;
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
  zagi: await hashOf('tests/inputs/zagi-baseline.rec', zagiPrelude),
  uglystik: await hashOf('tests/inputs/uglystik-baseline.rec', (s) => uglystikGroundPrelude(s)),
};
const names = Object.keys(got);
gate('B4', 'every other aircraft unmoved', names.every((k) => got[k] === u[k]),
  names.map((k) => got[k]).join(', '), names.map((k) => u[k]).join(', '));

const pittsRec = await recOf('tests/inputs/pitts-baseline.rec');
const pittsOpts = { ...replayBase, prelude: (s) => pittsGroundPrelude(s) };
const nodeHash = (await replayTrace(await loadSim(wasmBytes), pittsRec, pittsOpts)).slice(0, 16);
const nodeAgain = (await replayTrace(await loadSim(wasmBytes), pittsRec, pittsOpts)).slice(0, 16);
if (!findChrome()) {
  gate('B5', 'Node and Chrome agree', null, `node ${nodeHash} twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}, no Chrome here`, 'identical');
} else {
  const server = await startServer(root);
  try {
    const out = await runBrowserHarness(`${server.origin}/tests/browser/wing-harness.html?plane=pitts`);
    const result = out.result || {};
    const chromeHash = result.ok ? String(result.hash).slice(0, 16) : `error: ${result.message || result.errorName || JSON.stringify(out).slice(0, 80)}`;
    gate('B5', 'Node and Chrome agree', nodeAgain === nodeHash && result.ok && chromeHash === nodeHash, `node ${nodeHash} (twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}), chrome ${chromeHash}`, 'identical');
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
