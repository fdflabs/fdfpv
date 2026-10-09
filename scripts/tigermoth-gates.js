/*
 * tigermoth-gates.js: the Tiger Moth plant against the bands in
 * tests/tigermoth-thresholds.json.
 *
 * Checks T1 to T18 and B1 to B3 from docs/TIGERMOTH-STAGE1.md, on the
 * pattern of uglystik-gates.js for the glow engine and pitts-gates.js for
 * the second wing and the taildragger. T1 to T5 are its performance: a
 * scale cruise at three quarter throttle, its stall, a glide, its top
 * speed and a .61's climb on 10 lb. T6 to T9 are what a Tiger Moth is
 * known for, flown in Manual so it is the airframe doing it: ailerons
 * that roll it slowly; a turn entered on the ailerons alone, whose nose
 * first swings the wrong way (the adverse yaw of ailerons on one wing and
 * no differential), and the same turn with the rudder, which it needs; a
 * gentle stall that drops the nose and no wing, power off and with half
 * throttle; and the phugoid. T10 is the engine's torque, T11 to T15 the
 * taildragger: standing on its three points, a take off on the rudder and
 * the tail wheel it turns, the swing with the pilot's feet off, a taxi
 * turn and a landing; T18 the glow idle. B1 to B3 are why it is a biplane:
 * the induced drag it flies is the pair's, the two wings sum to the cell,
 * and the top wing, ahead, stalls first. T16 holds every other aircraft's
 * recorded hash where it was before this one existed, and T17 flies the
 * Tiger Moth's recording in Node and in headless Chrome and holds the two
 * hashes equal. Bands are never widened here: a plant outside one is a
 * finding for the derivation. Run with npm run tigermoth:gates.
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
import { GROUND_MU, GROUND_E } from '../src/game/collide.js';
import {
  TIGERMOTH_AIRFRAME, tigermothGroundPrelude, tigermothTakeoffSticks, tigermothLevel, edgeRoll, edgeHeading, fullBank,
  fly, glide, stallSpeed, propTorque, wingDebug, wingBiplane, wheelLoads, attitude, must, RC_STEP_MS,
  wingPrelude, skyPrelude, cubGroundPrelude, gliderRecPrelude, bramorPrelude, bramorChutePrelude,
  slowstickGroundPrelude, bombshellGroundPrelude, timberRecPrelude, timberFloatRecPrelude, kadetGroundPrelude,
  p51RecPrelude, p51AirPrelude, f16GroundPrelude, zagiPrelude, uglystikGroundPrelude, dlgRecPrelude,
} from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const th = JSON.parse(await readFile(join(root, 'tests/tigermoth-thresholds.json'), 'utf8'));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const DEG = 180 / Math.PI;
/* The plant's span, FW_TIGERMOTH1803, for the helix angle. */
const SPAN = 1.8034;
/* The cell's linear lift, FW_TIGERMOTH1803's cl_alpha and cl_de. */
const CL_ALPHA = 4.6328, CL_DE = -0.3359;

async function tigerSim() {
  const sim = await loadSim(wasmBytes);
  if (sim.init(configText) !== SIM_OK) throw new Error('sim_init failed');
  if (sim.e.sim_set_airframe(TIGERMOTH_AIRFRAME) !== SIM_OK) throw new Error('sim_set_airframe failed');
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

/* Level flight at `speed0` along world +x, 300 m up, tigermothLevel's
 * hands for `settleMs` at `duty`: the state after and the means over its
 * last two seconds, the plant's CL and CD among them. */
function settle(sim, { speed0 = 14.4, duty = 0.75, settleMs = 6000 } = {}) {
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
  must(sim.e.sim_set_pose(0, 0, 300, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(speed0), 'sim_wing_launch');
  clockMs = 0;
  const trim = { v: 0, e: 0 };
  let o = { s: sim.readState().state };
  const tail = [];
  for (let ms = 0; ms < settleMs; ms += RC_STEP_MS) {
    const [roll, pitch] = tigermothLevel(o.s, { trim });
    o = step(sim, [roll, pitch, 0, duty]);
    if (ms >= settleMs - 2000) {
      const d = wingDebug(sim);
      tail.push({ v: speed(o.s), vz: o.s[6], stick: pitch, alpha: d[0], cl: d[3], cd: d[4] });
    }
  }
  const mean = (k) => tail.reduce((a, x) => a + x[k], 0) / tail.length;
  return { s: o.s, v: mean('v'), vz: mean('vz'), stick: mean('stick'), alpha: mean('alpha'), cl: mean('cl'), cd: mean('cd') };
}

/*
 * A turn entered from level at `speed0` with full right aileron and the
 * rudder stick at `rud` of full right, the elevator where the level hands
 * left it, held until the bank reaches 30 deg or 3 s: how far the nose
 * swings the wrong way (left, against the roll) on the ground plane, the
 * peak sideslip, and the time to 30 deg. The derivation's turnEntry, on
 * the plant.
 */
function turnEntry(sim, { speed0, rud, duty }) {
  const lv = settle(sim, { speed0, duty, settleMs: 8000 });
  const psi0 = edgeHeading(lv.s);
  const stick = lv.stick;
  let wrong = 0, betaPk = 0, t30 = null, o = { s: lv.s };
  /* The heading is the body's yaw about world z, left positive: a right
   * roll's adverse yaw swings it up. */
  for (let t = 0; t < 3000; t += RC_STEP_MS) {
    o = step(sim, [1, stick, rud, duty]);
    wrong = Math.max(wrong, wrap(edgeHeading(o.s) - psi0));
    betaPk = Math.max(betaPk, Math.abs(wingDebug(sim)[1]));
    if (fullBank(o.s) >= 30 / DEG) { t30 = (t + RC_STEP_MS) / 1000; break; }
  }
  return { wrongDeg: wrong * DEG, betaDeg: betaPk * DEG, t30, v: lv.v };
}

console.log('tiger moth gates: the plant against docs/TIGERMOTH-STAGE1.md');
const sim = await tigerSim();
check: {
  if (sim.e.sim_airframe() !== TIGERMOTH_AIRFRAME) {
    gate('T0', 'the Tiger Moth is selected', false, `airframe ${sim.e.sim_airframe()}`, `${TIGERMOTH_AIRFRAME}`);
    break check;
  }

  const up = settle(sim, { settleMs: 20000 });
  gate('T1', 'level at three quarter throttle', within(up.v, th.t1_level_75) && Math.abs(up.vz) < 0.2,
    `${up.v.toFixed(2)} m/s, sink ${(-up.vz).toFixed(2)}, elevator stick ${up.stick.toFixed(3)}`, band(th.t1_level_75));

  const t2 = stallSpeed(sim, th.t2_stall.alphaStall, { speed0: 12 });
  gate('T2', 'stall speed, power off', t2 != null && within(t2, th.t2_stall), t2 == null ? 'no stall reached' : `${t2.toFixed(2)} m/s`, band(th.t2_stall));

  const t3 = glide(sim, th.t3_glide.speed);
  gate('T3', 'glide ratio at 1.4 Vs, power off', within(t3.ratio, th.t3_glide), `${t3.ratio.toFixed(2)} at ${t3.v.toFixed(1)} m/s, sink ${t3.sink.toFixed(2)}`, band(th.t3_glide));

  const top = settle(sim, { duty: th.t4_top.duty, speed0: 18.5, settleMs: 25000 });
  gate('T4', 'top speed, level', within(top.v, th.t4_top) && Math.abs(top.vz) < 0.2, `${top.v.toFixed(2)} m/s, sink ${(-top.vz).toFixed(2)}`, band(th.t4_top));

  let best = null;
  for (const vT of th.t5_climb.speeds) {
    const r = fly(sim, { duty: 1, speed0: vT, vTarget: vT, seconds: 25, pitchMax: 1.0, pitchMin: -0.5, trimMax: 1.0, guard: false, start: [0, 0, 300, 1, 0, 0, 0] });
    if (!best || r.vz > best.vz) best = { v: r.v, vz: r.vz, pitchDeg: r.pitch * DEG };
  }
  gate('T5', 'best climb, full throttle', within(best.vz, th.t5_climb), `${best.vz.toFixed(2)} m/s at ${best.v.toFixed(1)} m/s, pitch ${best.pitchDeg.toFixed(0)} deg`, band(th.t5_climb));

  /* T6: full right aileron from level at the trim: the peak roll rate. */
  {
    settle(sim, { speed0: th.t6_roll.speed, settleMs: 4000 });
    let peak = 0, vAt = th.t6_roll.speed;
    for (let t = 0; t < 2500; t += RC_STEP_MS) {
      const o = step(sim, [1, 0, 0, 0.75]);
      if (Math.abs(o.s[11]) > Math.abs(peak)) { peak = o.s[11]; vAt = speed(o.s); }
    }
    const pb = Math.abs(peak) * SPAN / (2 * vAt);
    gate('T6', 'full aileron: pb/2V', within(pb, th.t6_roll),
      `${pb.toFixed(4)}: ${Math.abs(peak * DEG).toFixed(0)} deg/s at ${vAt.toFixed(1)} m/s, ${peak > 0 ? 'right' : 'LEFT'}`, band(th.t6_roll));
  }

  /* T7: the adverse yaw, at 1.3 Vs: feet off, and with the rudder. */
  {
    const t7 = th.t7_adverse;
    const off = turnEntry(sim, { speed0: t7.speed, rud: 0, duty: t7.duty });
    gate('T7a', 'aileron alone: the nose swings the wrong way', within(off.wrongDeg, t7.wrong) && within(off.betaDeg, t7.beta) && off.t30 !== null,
      `the nose ${off.wrongDeg.toFixed(2)} deg left of a right roll, sideslip up to ${off.betaDeg.toFixed(2)} deg, 30 deg of bank in ${off.t30 === null ? 'never' : `${off.t30.toFixed(2)} s`} at ${off.v.toFixed(2)} m/s`,
      `${band(t7.wrong)} deg the wrong way, sideslip ${band(t7.beta)} deg`);
    const on = turnEntry(sim, { speed0: t7.speed, rud: t7.rudder, duty: t7.duty });
    gate('T7b', 'with the rudder: a balanced turn', on.betaDeg <= t7.coordBetaMax && on.wrongDeg <= t7.coordWrongMax && on.t30 !== null,
      `rudder ${t7.rudder} of the aileron: the nose ${on.wrongDeg.toFixed(2)} deg the wrong way, sideslip up to ${on.betaDeg.toFixed(2)} deg, 30 deg in ${on.t30 === null ? 'never' : `${on.t30.toFixed(2)} s`}`,
      `sideslip under ${t7.coordBetaMax} deg, the wrong way under ${t7.coordWrongMax} deg`);
  }

  /* T8: full up held from level at 1.2 Vs, the wings held on the
   * ailerons as a pilot does, the rudder centred: power off, and at half
   * throttle. T8c the same power off with the ailerons let go too,
   * recorded: held there, both wings deep in their stall, it rolls off
   * slowly (docs/TIGERMOTH-STAGE1.md). */
  for (const [id, t8, duty, hold] of [['T8a', th.t8_stall_power_off, 0, true], ['T8b', th.t8_stall_power_on, th.t8_stall_power_on.duty, true], ['T8c', th.t8_stall_power_off, 0, false]]) {
    clockMs = fly(sim, { duty: 0, vTarget: t8.entry, seconds: 25, guard: false, speed0: t8.entry, start: [0, 0, 300, 1, 0, 0, 0] }).endMs;
    const z0 = sim.readState().state[3];
    let worstBank = 0, minPitch = 90, maxPitch = -90, worstR = 0, alphaMax = 0, worstP = 0, ailSum = 0;
    let o = { s: sim.readState().state };
    /* With power the hold has an integral, as U11b's (uglystik-gates.js). */
    let iBank = 0;
    for (let ms = 0; ms < t8.seconds * 1000; ms += RC_STEP_MS) {
      iBank = duty ? Math.max(-0.5, Math.min(0.5, iBank - 0.2 * fullBank(o.s) * RC_STEP_MS / 1000)) : 0;
      const roll = hold ? Math.max(-1, Math.min(1, edgeRoll(o.s) + iBank)) : 0;
      ailSum += Math.abs(roll);
      /* Power on, the rudder against the engine's yaw, as Great Planes'
       * manual tells the pilot ("always be ready to apply right rudder to
       * counteract engine torque", p. 25): the yaw rate taken out on the
       * rudder, no heading held. */
      o = step(sim, [roll, 1, duty ? Math.max(-1, Math.min(1, 0.6 * o.s[13])) : 0, duty]);
      worstP = Math.max(worstP, Math.abs(o.s[11]) * DEG);
      const { pitch } = attitude(o.s);
      worstBank = Math.max(worstBank, Math.abs(fullBank(o.s) * DEG));
      minPitch = Math.min(minPitch, pitch * DEG);
      maxPitch = Math.max(maxPitch, pitch * DEG);
      worstR = Math.max(worstR, Math.abs(o.s[13]) * DEG);
      alphaMax = Math.max(alphaMax, wingDebug(sim)[0]);
    }
    const ailMean = ailSum / (t8.seconds * 1000 / RC_STEP_MS);
    const said = `bank ${worstBank.toFixed(1)}, pitch ${minPitch.toFixed(0)} to ${maxPitch.toFixed(0)}, yaw ${worstR.toFixed(1)} deg/s, roll ${worstP.toFixed(1)} deg/s, alpha up to ${(alphaMax * DEG).toFixed(1)}${hold ? `, ailerons ${ailMean.toFixed(2)} of the stick` : ''}, ${(z0 - o.s[3]).toFixed(1)} m lost, ${speed(o.s).toFixed(2)} m/s at the end`;
    if (!hold) {
      gate(id, 'full up held, power off, hands off: recorded', alphaMax > th.t2_stall.alphaStall, said, 'recorded');
      continue;
    }
    gate(id, `full up held, ${duty ? 'half throttle' : 'power off'}, wings held: nose drops, no wing drop`,
      worstBank <= t8.maxBankDeg && minPitch >= t8.minPitchDeg && worstR <= t8.maxYawRateDegS && alphaMax > th.t2_stall.alphaStall
        && worstP <= t8.maxRollRateDegS && ailMean <= t8.maxAileron,
      said,
      `stalled, bank ${t8.maxBankDeg}, pitch over ${t8.minPitchDeg}, yaw ${t8.maxYawRateDegS} deg/s, roll under ${t8.maxRollRateDegS} deg/s, ailerons under ${t8.maxAileron}`);
  }

  /* T9: the phugoid: level at the trim, a second of a little up stick,
   * then hands off with the wings held level on the ailerons. */
  {
    settle(sim, { settleMs: 15000 });
    const vs = [];
    for (let ms = 0; ms < 50000; ms += RC_STEP_MS) {
      const s = sim.readState().state;
      const o = step(sim, [edgeRoll(s), ms < 1000 ? 0.3 : 0, 0, 0.75]);
      if (ms >= 2000) vs.push({ t: ms / 1000, v: speed(o.s) });
    }
    const tail = vs.filter((p) => p.t >= vs[vs.length - 1].t - 10);
    const mean = tail.reduce((a, p) => a + p.v, 0) / tail.length;
    const ups = [];
    for (let i = 1; i < vs.length; i += 1) {
      const a = vs[i - 1].v - mean;
      const b = vs[i].v - mean;
      if (a < 0 && b >= 0) ups.push(vs[i - 1].t + (vs[i].t - vs[i - 1].t) * (-a / (b - a)));
    }
    const period = ups.length >= 2 ? (ups[ups.length - 1] - ups[0]) / (ups.length - 1) : null;
    gate('T9', 'phugoid period', period != null && within(period, th.t9_phugoid), period == null ? 'no oscillation' : `${period.toFixed(2)} s over ${ups.length - 1} cycles about ${mean.toFixed(2)} m/s`, band(th.t9_phugoid));
  }

  const t10 = propTorque(sim);
  gate('T10', 'prop torque, static full throttle', t10.rollMoment < 0 && within(-t10.rollMoment, th.t10_prop_torque),
    `${(-t10.rollMoment).toFixed(3)} N m ${t10.rollMoment < 0 ? 'rolling left' : 'WRONG WAY'} at ${t10.thrust.toFixed(1)} N`, `${band(th.t10_prop_torque)} N m, rolling left`);

  /* The gear. */
  const onStrip = () => {
    must(sim.reset(), 'sim_reset');
    must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
    tigermothGroundPrelude(sim, { mu: GROUND_MU, e: GROUND_E });
    clockMs = 0;
  };
  let rest = null;
  {
    const r11 = th.t11_rest;
    onStrip();
    let hull = 0;
    let o = null;
    for (let ms = 0; ms < 3000; ms += RC_STEP_MS) {
      o = step(sim, [0, 0, 0, 0]);
      hull = Math.max(hull, o.hull);
    }
    rest = { pitch: attitude(o.s).pitch * DEG, z: o.s[3], tail: o.loads[2] / (o.loads[0] + o.loads[1] + o.loads[2]) };
    gate('T11', 'standing on its three points', rest.pitch >= r11.pitchMin && rest.pitch <= r11.pitchMax && rest.z >= r11.zMin && rest.z <= r11.zMax && rest.tail >= r11.tailMin && rest.tail <= r11.tailMax && hull === 0 && o.loads[3] === 0,
      `${rest.pitch.toFixed(2)} deg, CG ${rest.z.toFixed(4)} m, tail ${(rest.tail * 100).toFixed(1)} percent, loads ${o.loads.map((f) => f.toFixed(2)).join(' ')} N, hull ${hull}`,
      `${r11.pitchMin} to ${r11.pitchMax} deg, ${r11.zMin} to ${r11.zMax} m, ${r11.tailMin * 100} to ${r11.tailMax * 100} percent, no hull or prop`);
  }

  /* T12, T13: the take off, the manual's, rotated at 1.2 Vs; liftoff is
   * the last step on the wheels before 200 ms clear of them. With the
   * pilot's feet on the rudder, and with them off. */
  const takeoff = (yawHold) => {
    onStrip();
    for (let ms = 0; ms < 1000; ms += RC_STEP_MS) step(sim, [0, 0, 0, 0]);
    let last = null, off = 0, lof = null, worstHeading = 0, worstY = 0;
    for (let ms = 0; ms < 10000 && !lof; ms += RC_STEP_MS) {
      const o = step(sim, tigermothTakeoffSticks(sim.readState().state, ms, { vRotate: th.t12_takeoff.vRotate, yawHold }));
      if (o.loaded) {
        last = { dist: Math.hypot(o.s[1], o.s[2]), v: speed(o.s), t: ms / 1000 };
        worstHeading = Math.max(worstHeading, Math.abs(edgeHeading(o.s)) * DEG);
        worstY = Math.max(worstY, Math.abs(o.s[2]));
        off = 0;
      } else {
        off += RC_STEP_MS;
        if (off >= 200) lof = last;
      }
    }
    return { lof, worstHeading, worstY };
  };
  {
    const t12 = th.t12_takeoff;
    const r = takeoff(1);
    gate('T12', 'takes off, rotated at 1.2 Vs', r.lof != null && within(r.lof.dist, { min: t12.distMin, max: t12.distMax }) && within(r.lof.v, { min: t12.vMin, max: t12.vMax }),
      r.lof == null ? 'never left the ground' : `${r.lof.dist.toFixed(2)} m to liftoff at ${r.lof.v.toFixed(2)} m/s, ${r.lof.t.toFixed(2)} s`,
      `${t12.distMin} to ${t12.distMax} m, ${t12.vMin} to ${t12.vMax} m/s`);
    gate('T13', 'the roll tracks on the rudder', r.lof != null && r.worstHeading <= th.t13_straight.maxHeadingDeg && r.worstY <= th.t13_straight.maxOffLine,
      `heading within ${r.worstHeading.toFixed(1)} deg, ${r.worstY.toFixed(2)} m off the line`, `under ${th.t13_straight.maxHeadingDeg} deg and ${th.t13_straight.maxOffLine} m`);
    const f = takeoff(0);
    gate('T13b', 'feet off the rudder: the swing, recorded', f.lof != null,
      f.lof == null ? 'never left the ground' : `heading swung ${f.worstHeading.toFixed(1)} deg, ${f.worstY.toFixed(2)} m off the line, off at ${f.lof.v.toFixed(2)} m/s`, 'recorded');
  }

  /* T14: full right rudder at a walk; the radius from the speed and the
   * heading rate over the last two of five seconds. */
  {
    const t14 = th.t14_taxi;
    onStrip();
    for (let ms = 0; ms < 2000; ms += RC_STEP_MS) step(sim, [0, 0.3, 0, t14.duty]);
    let h0 = null, vSum = 0, n = 0, allLoaded = true, o = null;
    for (let ms = 0; ms < 5000; ms += RC_STEP_MS) {
      o = step(sim, [0, 0.3, 1, t14.duty]);
      allLoaded = allLoaded && o.loads.slice(0, 3).every((f) => f > 0);
      if (ms === 3000) h0 = edgeHeading(o.s);
      if (ms > 3000) { vSum += speed(o.s); n += 1; }
    }
    const dh = wrap(edgeHeading(o.s) - h0);
    const r14 = (vSum / n) / Math.abs(dh / 1.996);
    gate('T14', 'taxi turn on the tail wheel', dh < 0 && within(r14, t14) && allLoaded, `${r14.toFixed(2)} m at ${(vSum / n).toFixed(2)} m/s, ${dh < 0 ? 'turning right' : 'WRONG WAY'}${allLoaded ? '' : ', a wheel lifted'}`, `${band(t14)} m, turning right`);
  }

  /* T15: a glide at idle from 6 m at 13 m/s, the nose held a little down
   * on the approach, a flare from 1 m to the three point attitude, and on
   * the wheels full up held, the manual's "hold up elevator to place the
   * tail on the ground". */
  {
    const t15 = th.t15_landing;
    must(sim.reset(), 'sim_reset');
    tigermothGroundPrelude(sim, { mu: GROUND_MU, e: GROUND_E });
    must(sim.e.sim_set_pose(0, 0, 6, 1, 0, 0, 0), 'sim_set_pose');
    must(sim.e.sim_wing_launch(13), 'sim_wing_launch');
    clockMs = 0;
    let touched = null, hull = 0;
    let o = { s: sim.readState().state, loaded: false, loads: [0, 0, 0, 0] };
    for (let ms = 0; ms < 25000; ms += RC_STEP_MS) {
      const { pitch } = attitude(o.s);
      const qAero = -o.s[12];
      const target = o.s[3] > 1.0 ? -2 / DEG : 8 / DEG;
      const pitchStick = touched !== null ? 1 : Math.max(-1, Math.min(1, 2.5 * (target - pitch) - 0.25 * qAero));
      o = step(sim, [edgeRoll(o.s), pitchStick, 0, 0]);
      if (o.loaded && touched === null) touched = { v: speed(o.s), vz: o.s[6], x: o.s[1] };
      if (touched !== null) hull = Math.max(hull, o.hull + (o.loads[3] > 0 ? 1 : 0));
    }
    const land = { pitch: attitude(o.s).pitch * DEG, v: Math.hypot(o.s[4], o.s[5]), roll: touched ? o.s[1] - touched.x : 0 };
    gate('T15', 'lands and stands on its three points', touched !== null && land.v < 0.05 && Math.abs(land.pitch - rest.pitch) <= t15.pitchTolDeg && hull === 0 && o.loads.slice(0, 3).every((f) => f > 0),
      touched === null ? 'never touched down' : `touched at ${touched.v.toFixed(2)} m/s sinking ${(-touched.vz).toFixed(2)}, rolled ${land.roll.toFixed(1)} m, at rest at ${land.pitch.toFixed(2)} deg, hull or prop ${hull}`,
      `at rest within ${t15.pitchTolDeg} deg of T11, no hull or prop`);
  }

  /* T18: the glow engine at idle on the strip. */
  {
    const t18 = th.t18_idle;
    onStrip();
    let o = null;
    for (let ms = 0; ms < t18.seconds * 1000; ms += RC_STEP_MS) o = step(sim, [0, 0, 0, 0]);
    const d = wingDebug(sim);
    const rpm = o.s[14];
    const vg = Math.hypot(o.s[4], o.s[5]);
    gate('T18', 'at idle the engine turns and it stands', rpm >= t18.rpmMin && rpm <= t18.rpmMax && vg <= t18.maxSpeed && d[8] > 0,
      `${rpm.toFixed(0)} rpm, ${d[8].toFixed(3)} N of thrust, ground speed ${(vg * 1000).toFixed(3)} mm/s`,
      `${t18.rpmMin} to ${t18.rpmMax} rpm, ground speed under ${t18.maxSpeed * 1000} mm/s`);
  }

  /* B1: the induced drag flown, between level at the trim and at full
   * throttle: dCD / d(CL^2). */
  {
    const k = (up.cd - top.cd) / (up.cl * up.cl - top.cl * top.cl);
    gate('B1', 'Prandtl\'s biplane induced drag, flown', within(k, th.b1_induced) && !within(th.b1_induced.mono, th.b1_induced),
      `${k.toFixed(5)} (CL ${up.cl.toFixed(3)} and ${top.cl.toFixed(3)}); a monoplane of its span and area ${th.b1_induced.mono}`, band(th.b1_induced));
  }

  /* B2 and B3: a slow pull into the stall, power off: the cell's lift
   * against the table's short of it, and which wing falls short of its
   * own linear lift first. */
  {
    must(sim.reset(), 'sim_reset');
    must(sim.e.sim_set_pose(0, 0, 300, 1, 0, 0, 0), 'sim_set_pose');
    must(sim.e.sim_wing_launch(14), 'sim_wing_launch');
    clockMs = 0;
    let s = sim.readState().state;
    let lin = null, first = null, gain = 0;
    for (let ms = 0; ms < 15000 && first === null; ms += RC_STEP_MS) {
      const { pitch } = attitude(s);
      const want = Math.min(0.7, 0.04 * ms / 1000);
      const stick = Math.max(-1, Math.min(1, 2.5 * (want - pitch) + 0.25 * s[12]));
      s = step(sim, [edgeRoll(s), stick, 0, 0]).s;
      const a = wingDebug(sim)[0];
      const b = wingBiplane(sim);
      if (lin === null && a * DEG >= th.b2_linear.alphaDeg) {
        const d = wingDebug(sim);
        lin = { a, cl: d[3], de: d[18], top: b[0], bottom: b[1] };
      }
      const shortTop = Math.abs(b[0]) < 0.99 * Math.abs(b[2]);
      const shortBottom = Math.abs(b[1]) < 0.99 * Math.abs(b[3]);
      if (shortTop || shortBottom) {
        first = { top: shortTop, bottom: shortBottom, alpha: a * DEG, v: speed(s) };
        gain = Math.abs(b[1]) - Math.abs(b[3]);
      }
    }
    const clTable = lin ? CL_ALPHA * lin.a + CL_DE * lin.de : 0;
    gate('B2', 'the two wings\' lift is the cell\'s, short of the stall', lin !== null && 100 * Math.abs(lin.cl - clTable) / clTable <= th.b2_linear.tolPct,
      lin === null ? `never at ${th.b2_linear.alphaDeg} deg` : `CL ${lin.cl.toFixed(4)} against the table's ${clTable.toFixed(4)} at ${(lin.a * DEG).toFixed(2)} deg; the top wing's own ${lin.top.toFixed(4)}, the bottom's ${lin.bottom.toFixed(4)}`,
      `within ${th.b2_linear.tolPct} percent`);
    gate('B3', 'the top wing stalls first', first !== null && first.top && !first.bottom && gain > 0 && within(first.alpha, th.b3_top_first),
      first === null ? 'neither stalled' : `${first.top ? 'the top wing' : 'the bottom wing'}${first.top && first.bottom ? ' and the bottom' : ''} first, at ${first.alpha.toFixed(2)} deg and ${first.v.toFixed(2)} m/s, the bottom wing ${gain >= 0 ? 'over' : 'UNDER'} its own linear lift by ${Math.abs(gain).toFixed(4)}`,
      `the top wing alone, at ${band(th.b3_top_first)} deg, the bottom one gaining`);
  }
}

const quadTh = JSON.parse(await readFile(join(root, 'tests/thresholds.json'), 'utf8'));
const replayBase = { configText, renderHz: quadTh.replay.canonical_render_hz.value, traceStrideMs: quadTh.replay.trace_stride_ms.value };
const recOf = async (f) => decodeRec(new Uint8Array(await readFile(join(root, f))));
const hashOf = async (f, prelude) => (await replayTrace(await loadSim(wasmBytes), await recOf(f), { ...replayBase, prelude })).slice(0, 16);
const u = th.t16_unmoved;
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
};
const names = Object.keys(got);
gate('T16', 'every other aircraft unmoved', names.every((k) => got[k] === u[k]),
  names.map((k) => got[k]).join(', '), names.map((k) => u[k]).join(', '));

const tigerRec = await recOf('tests/inputs/tigermoth-baseline.rec');
const tigerOpts = { ...replayBase, prelude: (s) => tigermothGroundPrelude(s) };
const nodeHash = (await replayTrace(await loadSim(wasmBytes), tigerRec, tigerOpts)).slice(0, 16);
const nodeAgain = (await replayTrace(await loadSim(wasmBytes), tigerRec, tigerOpts)).slice(0, 16);
if (!findChrome()) {
  gate('T17', 'Node and Chrome agree', null, `node ${nodeHash} twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}, no Chrome here`, 'identical');
} else {
  const server = await startServer(root);
  try {
    const out = await runBrowserHarness(`${server.origin}/tests/browser/wing-harness.html?plane=tigermoth`);
    const result = out.result || {};
    const chromeHash = result.ok ? String(result.hash).slice(0, 16) : `error: ${result.message || result.errorName || JSON.stringify(out).slice(0, 80)}`;
    gate('T17', 'Node and Chrome agree', nodeAgain === nodeHash && result.ok && chromeHash === nodeHash, `node ${nodeHash} (twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}), chrome ${chromeHash}`, 'identical');
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
