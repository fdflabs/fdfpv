/*
 * uglystik-gates.js: the Das Ugly Stik plant against the bands in
 * tests/uglystik-thresholds.json.
 *
 * Checks U1 to U21 from docs/UGLYSTIK-STAGE1.md, on the pattern of
 * edge-gates.js for the aerobatics and kadet-gates.js for the glow engine
 * and the tricycle gear. U1 to U5 are its performance: a cruise at three
 * quarter throttle, its stall, a glide, its top speed and a .61's climb.
 * U6 to U11 are what a Stik is known for, flown in Manual so it is the
 * airframe doing it: a roll on its strip ailerons, and about its own axis;
 * flying on its back with a push; a loop at full throttle that comes out
 * where it went in; a bank it holds with the sticks let go, neither
 * levelling itself like a trainer nor tucking in; and full up elevator
 * met with a nose drop and no wing drop. U12 and U13 are the engine's
 * torque and the phugoid; U14 to U16 and U21 the tricycle gear: standing
 * nose down on its three wheels as the plan draws it, a take off, a
 * landing and a taxi turn on the nose wheel. U17 holds every other
 * aircraft's recorded hash where it was before this one existed, and U18
 * flies the Stik's recording in Node and in headless Chrome and holds the
 * two hashes equal. U19 is the glow engine: at idle it keeps turning and
 * the aircraft stands on the strip. There is no U20. Bands are never
 * widened here: a plant outside one is a finding for the derivation. Run
 * with npm run uglystik:gates.
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
  UGLYSTIK_AIRFRAME, uglystikGroundPrelude, uglystikTakeoffSticks, edgeLevel, edgeRoll, edgeHeading, fullBank,
  fly, glide, stallSpeed, propTorque, wingDebug, wheelLoads, attitude, must, RC_STEP_MS,
  wingPrelude, skyPrelude, cubGroundPrelude, gliderRecPrelude, bramorPrelude, bramorChutePrelude,
  slowstickGroundPrelude, bombshellGroundPrelude, timberRecPrelude, timberFloatRecPrelude, kadetGroundPrelude,
  p51RecPrelude, p51AirPrelude, edgeGroundPrelude, f16GroundPrelude, extraGroundPrelude,
} from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const th = JSON.parse(await readFile(join(root, 'tests/uglystik-thresholds.json'), 'utf8'));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const DEG = 180 / Math.PI;
/* The plant's span, FW_UGLYSTIK1567, for the helix angle. */
const SPAN = 1.5682;

async function stikSim() {
  const sim = await loadSim(wasmBytes);
  if (sim.init(configText) !== SIM_OK) throw new Error('sim_init failed');
  if (sim.e.sim_set_airframe(UGLYSTIK_AIRFRAME) !== SIM_OK) throw new Error('sim_set_airframe failed');
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
/* The nose's heading on the ground plane, from the body's x axis in the
 * world; through a roll it reads the way the nose points, not the flight
 * path. */
const noseHeading = (s) => Math.atan2(2 * (s[8] * s[9] + s[7] * s[10]), 1 - 2 * (s[9] * s[9] + s[10] * s[10]));

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

/* edgeLevel's hands with an integral on the elevator: on its back the
 * Stik's push is near half the stick, more than a proportional hand
 * holds without a standing error, and on the edge's hands alone it sank a
 * metre a second there. `trim` carries both slow parts between steps. */
function stikLevel(s, { b = 0, trim }) {
  const [roll, stick] = edgeLevel(s, { b, trim });
  const { pitch } = attitude(s);
  const sgn = Math.cos(fullBank(s)) < 0 ? -1 : 1;
  const pitchT = Math.max(-0.2, Math.min(0.2, trim.v - 0.05 * s[6]));
  trim.i = Math.max(-0.8, Math.min(0.8, (trim.i ?? 0) + 0.004 * sgn * (pitchT - pitch)));
  return [roll, Math.max(-1, Math.min(1, stick + trim.i))];
}

/* Level flight at `speed0` along world +x, 300 m up, upright or on its
 * back, stikLevel's hands for `settleMs` at `duty`: the state after and
 * the means over its last two seconds. */
function settle(sim, { inverted = false, speed0 = 17.3, duty = 0.75, settleMs = 6000 } = {}) {
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
    const [roll, pitch] = stikLevel(o.s, { b, trim });
    o = step(sim, [roll, pitch, 0, duty]);
    if (ms >= settleMs - 2000) tail.push({ v: speed(o.s), vz: o.s[6], stick: pitch, alpha: wingDebug(sim)[0] });
  }
  const mean = (k) => tail.reduce((a, x) => a + x[k], 0) / tail.length;
  return { s: o.s, v: mean('v'), vz: mean('vz'), stick: mean('stick'), alpha: mean('alpha'), trim };
}

/* Full right aileron from level flight at `speed0`: the peak body roll
 * rate over `ms`, and the speed then. */
function rollFrom(sim, { inverted = false, speed0 = th.u6_roll.speed, ms = 2500 } = {}) {
  settle(sim, { inverted, speed0, settleMs: 3000 });
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

console.log('uglystik gates: the plant against docs/UGLYSTIK-STAGE1.md');
const sim = await stikSim();
check: {
  if (sim.e.sim_airframe() !== UGLYSTIK_AIRFRAME) {
    gate('U0', 'the Ugly Stik is selected', false, `airframe ${sim.e.sim_airframe()}`, `${UGLYSTIK_AIRFRAME}`);
    break check;
  }

  const up = settle(sim, { settleMs: 20000 });
  gate('U1', 'level at three quarter throttle', within(up.v, th.u1_level_75) && Math.abs(up.vz) < 0.2,
    `${up.v.toFixed(2)} m/s, sink ${(-up.vz).toFixed(2)}, elevator stick ${up.stick.toFixed(3)}`, band(th.u1_level_75));

  const u2 = stallSpeed(sim, th.u2_stall.alphaStall);
  gate('U2', 'stall speed, power off', u2 != null && within(u2, th.u2_stall), u2 == null ? 'no stall reached' : `${u2.toFixed(2)} m/s`, band(th.u2_stall));

  const u3 = glide(sim, th.u3_glide.speed);
  gate('U3', 'glide ratio at 1.4 Vs, power off', within(u3.ratio, th.u3_glide), `${u3.ratio.toFixed(2)} at ${u3.v.toFixed(1)} m/s, sink ${u3.sink.toFixed(2)}`, band(th.u3_glide));

  const top = settle(sim, { duty: th.u4_top.duty, speed0: 22, settleMs: 20000 });
  gate('U4', 'top speed, level', within(top.v, th.u4_top) && Math.abs(top.vz) < 0.2, `${top.v.toFixed(2)} m/s, sink ${(-top.vz).toFixed(2)}`, band(th.u4_top));

  let best = null;
  for (const vT of th.u5_climb.speeds) {
    const r = fly(sim, { duty: 1, speed0: vT, vTarget: vT, seconds: 25, pitchMax: 1.2, pitchMin: -0.5, trimMax: 1.0, guard: false, start: [0, 0, 300, 1, 0, 0, 0] });
    if (!best || r.vz > best.vz) best = { v: r.v, vz: r.vz, pitchDeg: r.pitch * DEG };
  }
  gate('U5', 'best climb, full throttle', within(best.vz, th.u5_climb), `${best.vz.toFixed(2)} m/s at ${best.v.toFixed(1)} m/s, pitch ${best.pitchDeg.toFixed(0)} deg`, band(th.u5_climb));

  const u6 = rollFrom(sim);
  const pb = Math.abs(u6.rateDegS / DEG) * SPAN / (2 * u6.v);
  gate('U6', 'full aileron: pb/2V', within(pb, th.u6_roll),
    `${pb.toFixed(4)}: ${Math.abs(u6.rateDegS).toFixed(0)} deg/s at ${u6.v.toFixed(1)} m/s, ${u6.rateDegS > 0 ? 'right' : 'LEFT'}`, band(th.u6_roll));

  /* U7: a whole roll, full right aileron held from level at the trim until
   * the bank has gone once round, every other stick centred. */
  {
    const t7 = th.u7_axial;
    const s0 = settle(sim, { speed0: th.u6_roll.speed, settleMs: 4000 }).s;
    const psi0 = noseHeading(s0);
    let turned = 0;
    let worstHead = 0;
    let worstBeta = 0;
    let o = { s: s0 };
    let t = 0;
    const z0 = s0[3];
    for (; t < 10000 && turned < 2 * Math.PI; t += RC_STEP_MS) {
      o = step(sim, [1, 0, 0, 0.75]);
      turned += o.s[11] * RC_STEP_MS / 1000;
      worstHead = Math.max(worstHead, Math.abs(wrap(noseHeading(o.s) - psi0)) * DEG);
      worstBeta = Math.max(worstBeta, Math.abs(wingDebug(sim)[1]) * DEG);
    }
    const endHead = wrap(noseHeading(o.s) - psi0) * DEG;
    gate('U7', 'a whole roll about its own axis', turned >= 2 * Math.PI && worstBeta <= t7.maxBetaDeg,
      `${(t / 1000).toFixed(2)} s round, sideslip under ${worstBeta.toFixed(1)} deg; recorded: the nose's ground heading within ${worstHead.toFixed(1)} deg (${endHead.toFixed(1)} at the end), ${(z0 - o.s[3]).toFixed(1)} m lost`,
      `sideslip under ${t7.maxBetaDeg} deg`);
  }

  /* U8: upright and inverted alike. */
  {
    const inv = settle(sim, { inverted: true, settleMs: 20000 });
    const u8 = th.u8_inverted;
    gate('U8a', 'on its back: level speed as upright', pct(inv.v, up.v) <= u8.levelPct && Math.abs(inv.vz) < 0.2,
      `${inv.v.toFixed(2)} against ${up.v.toFixed(2)} m/s, ${pct(inv.v, up.v).toFixed(1)} percent, sink ${(-inv.vz).toFixed(2)}`, `within ${u8.levelPct} percent`);
    gate('U8b', 'on its back: a push holds it', inv.stick < 0 && -inv.stick >= u8.pushMin && -inv.stick <= u8.pushMax,
      `stick ${inv.stick.toFixed(3)}, alpha ${(inv.alpha * DEG).toFixed(2)} deg (upright ${up.stick.toFixed(3)}, ${(up.alpha * DEG).toFixed(2)})`, `a push of ${u8.pushMin} to ${u8.pushMax}`);
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
      if (ms > 1000 && wingDebug(sim)[0] < -th.u2_stall.alphaStall) invStall = speed(o.s);
    }
    gate('U8c', 'on its back: stall speed as upright', invStall !== null && u2 != null && pct(invStall, u2) <= u8.stallPct,
      invStall === null ? 'no stall reached' : `${invStall.toFixed(2)} against ${u2 == null ? '?' : u2.toFixed(2)} m/s, ${u2 == null ? '?' : pct(invStall, u2).toFixed(1)} percent`, `within ${u8.stallPct} percent`);
    const invRoll = rollFrom(sim, { inverted: true });
    gate('U8d', 'on its back: roll rate as upright', pct(Math.abs(invRoll.rateDegS), Math.abs(u6.rateDegS)) <= u8.rollPct,
      `${Math.abs(invRoll.rateDegS).toFixed(0)} against ${Math.abs(u6.rateDegS).toFixed(0)} deg/s`, `within ${u8.rollPct} percent`);
  }

  /* U9: a loop. Level at full throttle, then half up stick held with the
   * ailerons and rudder centred until the flight path has gone once round
   * in the vertical plane it started in, the derivation's point mass's
   * own end: the path's angle, unwrapped, from the velocity. */
  {
    const t9 = th.u9_loop;
    const s0 = settle(sim, { duty: 1, speed0: 22, settleMs: 8000 }).s;
    const x0 = s0[1], z0 = s0[3], psi0 = noseHeading(s0);
    let turned = 0;
    let zMax = z0, xMin = x0, xMax = x0, vTop = null, worstBankTop = 0, worstHead = 0;
    let o = { s: s0 };
    let t = 0;
    let path = Math.atan2(s0[6], s0[4]);
    for (; t < 20000 && turned < 2 * Math.PI; t += RC_STEP_MS) {
      o = step(sim, [0, t9.stick, 0, 1]);
      const now = Math.atan2(o.s[6], o.s[4]);
      turned += wrap(now - path);
      path = now;
      zMax = Math.max(zMax, o.s[3]);
      xMin = Math.min(xMin, o.s[1]);
      xMax = Math.max(xMax, o.s[1]);
      if (vTop === null && turned >= Math.PI) {
        vTop = speed(o.s);
      }
      if (turned >= Math.PI / 2) {
        /* Over the top and out, the wings against the loop's plane: the
         * body's y axis should stay across it, world y. */
        const leftY = 1 - 2 * (o.s[8] * o.s[8] + o.s[10] * o.s[10]);
        worstBankTop = Math.max(worstBankTop, Math.acos(Math.max(-1, Math.min(1, Math.abs(leftY)))) * DEG);
      }
      /* The nose's heading only means something off the vertical. */
      if (Math.abs(Math.sin(turned)) < 0.7) worstHead = Math.max(worstHead, Math.abs(wrap(noseHeading(o.s) - psi0 + (Math.cos(turned) < 0 ? Math.PI : 0))) * DEG);
    }
    const height = zMax - z0, length = xMax - xMin, exit = o.s[3] - z0;
    const ok = turned >= 2 * Math.PI && height >= t9.heightMin && height <= t9.heightMax && length >= t9.lengthMin && length <= t9.lengthMax
      && vTop !== null && vTop >= t9.vTopMin && vTop <= t9.vTopMax && exit >= t9.exitMin && exit <= t9.exitMax
      && worstHead <= t9.maxHeadingDeg && worstBankTop <= t9.maxBankDeg;
    gate('U9', 'a loop at full throttle, half up stick', ok,
      `${height.toFixed(1)} m up, ${length.toFixed(1)} m along, ${vTop === null ? 'never over the top' : `${vTop.toFixed(1)} m/s over the top`}, out ${exit.toFixed(1)} m, heading within ${worstHead.toFixed(1)}, wings within ${worstBankTop.toFixed(1)} deg, ${(t / 1000).toFixed(2)} s`,
      `${t9.heightMin} to ${t9.heightMax} m up, ${t9.lengthMin} to ${t9.lengthMax} along, ${t9.vTopMin} to ${t9.vTopMax} m/s, out ${t9.exitMin} to ${t9.exitMax} m, ${t9.maxHeadingDeg} and ${t9.maxBankDeg} deg`);
  }

  /* U10: level at the trim, rolled to 30 deg at once, every stick let go
   * with the throttle left where it was. */
  {
    const t10 = th.u10_neutral;
    const s = settle(sim, { duty: t10.duty, settleMs: 6000 }).s;
    const psi = edgeHeading(s);
    const h = t10.bankDeg / DEG / 2;
    const c = Math.cos(psi / 2);
    const z = Math.sin(psi / 2);
    must(sim.e.sim_set_pose(s[1], s[2], s[3], c * Math.cos(h), c * Math.sin(h), z * Math.sin(h), z * Math.cos(h)), 'sim_set_pose');
    const b0 = fullBank(sim.readState().state) * DEG;
    let worst = Math.abs(b0);
    let at = null;
    let o = null;
    for (let ms = 0; ms < t10.atS * 1000; ms += RC_STEP_MS) {
      o = step(sim, [0, 0, 0, t10.duty]);
      const b = fullBank(o.s) * DEG;
      worst = Math.max(worst, Math.abs(b));
      if (ms + RC_STEP_MS === 2000) at = b;
    }
    const b10 = fullBank(o.s) * DEG;
    gate('U10', 'hands off from a 30 deg bank: it holds it', Math.sign(b10) === Math.sign(b0) && within(Math.abs(b10), t10) && worst <= t10.maxBankDeg,
      `${b0.toFixed(1)} deg, ${at.toFixed(1)} at 2 s, ${b10.toFixed(1)} at ${t10.atS} s, never past ${worst.toFixed(1)}, ${speed(o.s).toFixed(2)} m/s`,
      `${band(t10)} deg at ${t10.atS} s, never past ${t10.maxBankDeg}`);
  }

  /* U11: full up held from level at 1.2 Vs, power off with every other
   * stick centred; at half throttle with the wings held on the ailerons,
   * since hands off the prop's torque rolls a stalled Stik left at 2 deg/s
   * and a band on the bank would read the torque, not the stall
   * (docs/UGLYSTIK-STAGE1.md): there the peak roll rate is what a wing
   * drop would show, and the ailerons it takes. */
  for (const [id, t11, duty] of [['U11a', th.u11_stall_power_off, 0], ['U11b', th.u11_stall_power_on, th.u11_stall_power_on.duty]]) {
    clockMs = fly(sim, { duty: 0, vTarget: t11.entry, seconds: 25, guard: false, speed0: t11.entry, start: [0, 0, 300, 1, 0, 0, 0] }).endMs;
    const psi0 = edgeHeading(sim.readState().state);
    let worstBank = 0;
    let minPitch = 90;
    let maxPitch = -90;
    let worstHead = 0;
    let worstR = 0;
    let alphaMax = 0;
    let worstP = 0;
    let ailSum = 0;
    let o = { s: sim.readState().state };
    for (let ms = 0; ms < t11.seconds * 1000; ms += RC_STEP_MS) {
      const roll = duty ? edgeRoll(o.s) : 0;
      ailSum += Math.abs(roll);
      o = step(sim, [roll, 1, 0, duty]);
      worstP = Math.max(worstP, Math.abs(o.s[11]) * DEG);
      const { pitch } = attitude(o.s);
      worstBank = Math.max(worstBank, Math.abs(fullBank(o.s) * DEG));
      minPitch = Math.min(minPitch, pitch * DEG);
      maxPitch = Math.max(maxPitch, pitch * DEG);
      worstHead = Math.max(worstHead, Math.abs(wrap(edgeHeading(o.s) - psi0)) * DEG);
      worstR = Math.max(worstR, Math.abs(o.s[13]) * DEG);
      alphaMax = Math.max(alphaMax, wingDebug(sim)[0]);
    }
    const ailMean = ailSum / (t11.seconds * 1000 / RC_STEP_MS);
    const held = duty ? worstP <= t11.maxRollRateDegS && ailMean <= t11.maxAileron : true;
    gate(id, `full up held, ${duty ? 'half throttle, wings held' : 'power off'}: nose drops, no wing drop`,
      worstBank <= t11.maxBankDeg && minPitch >= t11.minPitchDeg && worstR <= t11.maxYawRateDegS && alphaMax > th.u2_stall.alphaStall && held,
      `bank ${worstBank.toFixed(1)}, pitch ${minPitch.toFixed(0)} to ${maxPitch.toFixed(0)}, yaw ${worstR.toFixed(1)} deg/s, roll ${worstP.toFixed(1)} deg/s, heading ${worstHead.toFixed(0)} deg, alpha up to ${(alphaMax * DEG).toFixed(1)}${duty ? `, ailerons ${ailMean.toFixed(2)} of the stick` : ''}, ${speed(o.s).toFixed(2)} m/s at the end`,
      `stalled, bank ${t11.maxBankDeg}, pitch over ${t11.minPitchDeg}, yaw ${t11.maxYawRateDegS} deg/s${duty ? `, roll under ${t11.maxRollRateDegS} deg/s, ailerons under ${t11.maxAileron}` : ''}`);
  }

  const u12 = propTorque(sim);
  gate('U12', 'prop torque, static full throttle', u12.rollMoment < 0 && within(-u12.rollMoment, th.u12_prop_torque),
    `${(-u12.rollMoment).toFixed(3)} N m ${u12.rollMoment < 0 ? 'rolling left' : 'WRONG WAY'} at ${u12.thrust.toFixed(1)} N`, `${band(th.u12_prop_torque)} N m, rolling left`);

  /* U13: the phugoid: level at the trim, a second of a little up stick,
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
    const swing = Math.max(...vs.map((p) => p.v)) - Math.min(...vs.map((p) => p.v));
    gate('U13', 'phugoid period', period != null && within(period, th.u13_phugoid), period == null ? `no oscillation, swing ${swing.toFixed(2)} m/s` : `${period.toFixed(2)} s over ${ups.length - 1} cycles, swing ${swing.toFixed(2)} m/s about ${mean.toFixed(2)}`, band(th.u13_phugoid));
  }

  /* The gear. */
  const onStrip = () => {
    must(sim.reset(), 'sim_reset');
    must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
    uglystikGroundPrelude(sim, { mu: GROUND_MU, e: GROUND_E });
    clockMs = 0;
  };
  let rest = null;
  {
    const r14 = th.u14_rest;
    onStrip();
    let hull = 0;
    let o = null;
    for (let ms = 0; ms < 3000; ms += RC_STEP_MS) {
      o = step(sim, [0, 0, 0, 0]);
      hull = Math.max(hull, o.hull);
    }
    rest = { pitch: attitude(o.s).pitch * DEG, z: o.s[3], nose: o.loads[2] / (o.loads[0] + o.loads[1] + o.loads[2]) };
    gate('U14', 'standing nose down on its three wheels', rest.pitch >= r14.pitchMin && rest.pitch <= r14.pitchMax && rest.z >= r14.zMin && rest.z <= r14.zMax && rest.nose >= r14.noseMin && rest.nose <= r14.noseMax && hull === 0 && o.loads[3] === 0 && Math.hypot(o.s[4], o.s[5]) < 0.01,
      `${rest.pitch.toFixed(2)} deg, CG ${rest.z.toFixed(4)} m, nose ${(rest.nose * 100).toFixed(1)} percent, loads ${o.loads.map((f) => f.toFixed(2)).join(' ')} N, hull ${hull}`,
      `${r14.pitchMin} to ${r14.pitchMax} deg, ${r14.zMin} to ${r14.zMax} m, ${r14.noseMin * 100} to ${r14.noseMax * 100} percent, no hull or prop`);
  }

  /* U15: full throttle from standing, the heading held on the rudder and
   * the nose wheel, rotated at 1.2 Vs; liftoff is the last step on the
   * wheels before 200 ms clear of them. */
  {
    const t15 = th.u15_takeoff;
    onStrip();
    for (let ms = 0; ms < 1000; ms += RC_STEP_MS) step(sim, [0, 0, 0, 0]);
    const x0 = sim.readState().state[1];
    let last = null;
    let off = 0;
    let lof = null;
    let worstHeading = 0;
    for (let ms = 0; ms < 8000 && !lof; ms += RC_STEP_MS) {
      const o = step(sim, [...uglystikTakeoffSticks(sim.readState().state, { vRotate: t15.vRotate }), 1]);
      if (o.loaded) {
        last = { dist: o.s[1] - x0, v: speed(o.s), t: ms / 1000, prop: o.loads[3] };
        worstHeading = Math.max(worstHeading, Math.abs(edgeHeading(o.s)) * DEG);
        off = 0;
      } else {
        off += RC_STEP_MS;
        if (off >= 200) lof = last;
      }
    }
    gate('U15', 'takes off, rotated at 1.2 Vs', lof != null && lof.dist >= t15.distMin && lof.dist <= t15.distMax && lof.v >= t15.vMin && lof.v <= t15.vMax,
      lof == null ? 'never left the ground' : `${lof.dist.toFixed(2)} m to liftoff at ${lof.v.toFixed(2)} m/s, ${lof.t.toFixed(2)} s, heading within ${worstHeading.toFixed(1)} deg`,
      `${t15.distMin} to ${t15.distMax} m, ${t15.vMin} to ${t15.vMax} m/s`);
  }

  /* U16: a glide at idle from 6 m at 14 m/s, the nose held a little down
   * on the approach, a flare from 1 m to 6 deg, and on the wheels the
   * elevator let go so the nose wheel comes down. */
  {
    const t16 = th.u16_landing;
    must(sim.reset(), 'sim_reset');
    uglystikGroundPrelude(sim, { mu: GROUND_MU, e: GROUND_E });
    must(sim.e.sim_set_pose(0, 0, 6, 1, 0, 0, 0), 'sim_set_pose');
    must(sim.e.sim_wing_launch(14), 'sim_wing_launch');
    clockMs = 0;
    let touched = null;
    let hull = 0;
    let o = { s: sim.readState().state, loaded: false, loads: [0, 0, 0, 0] };
    for (let ms = 0; ms < 25000; ms += RC_STEP_MS) {
      const { pitch } = attitude(o.s);
      const qAero = -o.s[12];
      const target = o.s[3] > 1.0 ? -2 / DEG : 6 / DEG;
      const pitchStick = touched !== null ? 0 : Math.max(-1, Math.min(1, 2.5 * (target - pitch) - 0.25 * qAero));
      o = step(sim, [edgeRoll(o.s), pitchStick, 0, 0]);
      if (o.loaded && touched === null) touched = { v: speed(o.s), vz: o.s[6], x: o.s[1] };
      if (touched !== null) hull = Math.max(hull, o.hull + (o.loads[3] > 0 ? 1 : 0));
    }
    const land = { pitch: attitude(o.s).pitch * DEG, v: Math.hypot(o.s[4], o.s[5]), roll: touched ? o.s[1] - touched.x : 0 };
    gate('U16', 'lands on its wheels', touched !== null && land.v < 0.05 && Math.abs(land.pitch - rest.pitch) <= t16.pitchTolDeg && hull === 0 && o.loads.slice(0, 3).every((f) => f > 0),
      touched === null ? 'never touched down' : `touched at ${touched.v.toFixed(2)} m/s sinking ${(-touched.vz).toFixed(2)}, rolled ${land.roll.toFixed(1)} m, at rest at ${land.pitch.toFixed(2)} deg, hull or prop ${hull}`,
      `at rest within ${t16.pitchTolDeg} deg of U14, no hull or prop`);
  }

  /* U19: the glow engine at idle on the strip. */
  {
    const t19 = th.u19_idle;
    onStrip();
    let o = null;
    for (let ms = 0; ms < t19.seconds * 1000; ms += RC_STEP_MS) o = step(sim, [0, 0, 0, 0]);
    const d = wingDebug(sim);
    const rpm = o.s[14];
    const vg = Math.hypot(o.s[4], o.s[5]);
    const moved = Math.hypot(o.s[1], o.s[2]);
    gate('U19', 'at idle the engine turns and it stands', rpm >= t19.rpmMin && rpm <= t19.rpmMax && vg <= t19.maxSpeed && d[8] > 0,
      `${rpm.toFixed(0)} rpm, ${d[8].toFixed(3)} N of thrust, ground speed ${(vg * 1000).toFixed(3)} mm/s, crept ${(moved * 1000).toFixed(1)} mm in ${t19.seconds} s`,
      `${t19.rpmMin} to ${t19.rpmMax} rpm, ground speed under ${t19.maxSpeed * 1000} mm/s`);
  }

  /* U21: full right rudder at a walk; the radius from the speed and the
   * heading rate over the last two of five seconds. */
  {
    const t21 = th.u21_taxi;
    onStrip();
    for (let ms = 0; ms < 2000; ms += RC_STEP_MS) step(sim, [0, 0, 0, t21.duty]);
    let h0 = null;
    let vSum = 0;
    let n = 0;
    let allLoaded = true;
    let o = null;
    for (let ms = 0; ms < 5000; ms += RC_STEP_MS) {
      o = step(sim, [0, 0, 1, t21.duty]);
      allLoaded = allLoaded && o.loads.slice(0, 3).every((f) => f > 0);
      if (ms === 3000) h0 = edgeHeading(o.s);
      if (ms > 3000) { vSum += speed(o.s); n += 1; }
    }
    const dh = wrap(edgeHeading(o.s) - h0);
    const r21 = (vSum / n) / Math.abs(dh / 1.996);
    gate('U21', 'taxi turn on the nose wheel', dh < 0 && within(r21, t21) && allLoaded, `${r21.toFixed(2)} m at ${(vSum / n).toFixed(2)} m/s, ${dh < 0 ? 'turning right' : 'WRONG WAY'}${allLoaded ? '' : ', a wheel lifted'}`, `${band(t21)} m, turning right`);
  }
}

const quadTh = JSON.parse(await readFile(join(root, 'tests/thresholds.json'), 'utf8'));
const replayBase = { configText, renderHz: quadTh.replay.canonical_render_hz.value, traceStrideMs: quadTh.replay.trace_stride_ms.value };
const recOf = async (f) => decodeRec(new Uint8Array(await readFile(join(root, f))));
const hashOf = async (f, prelude) => (await replayTrace(await loadSim(wasmBytes), await recOf(f), { ...replayBase, prelude })).slice(0, 16);
const u = th.u17_unmoved;
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
};
const names = Object.keys(got);
gate('U17', 'every other aircraft unmoved', names.every((k) => got[k] === u[k]),
  names.map((k) => got[k]).join(', '), names.map((k) => u[k]).join(', '));

const stikRec = await recOf('tests/inputs/uglystik-baseline.rec');
const stikOpts = { ...replayBase, prelude: (s) => uglystikGroundPrelude(s) };
const nodeHash = (await replayTrace(await loadSim(wasmBytes), stikRec, stikOpts)).slice(0, 16);
const nodeAgain = (await replayTrace(await loadSim(wasmBytes), stikRec, stikOpts)).slice(0, 16);
if (!findChrome()) {
  gate('U18', 'Node and Chrome agree', null, `node ${nodeHash} twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}, no Chrome here`, 'identical');
} else {
  const server = await startServer(root);
  try {
    const out = await runBrowserHarness(`${server.origin}/tests/browser/wing-harness.html?plane=uglystik`);
    const result = out.result || {};
    const chromeHash = result.ok ? String(result.hash).slice(0, 16) : `error: ${result.message || result.errorName || JSON.stringify(out).slice(0, 80)}`;
    gate('U18', 'Node and Chrome agree', nodeAgain === nodeHash && result.ok && chromeHash === nodeHash, `node ${nodeHash} (twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}), chrome ${chromeHash}`, 'identical');
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
