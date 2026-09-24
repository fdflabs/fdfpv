/*
 * slowstick-gates.js: the Slow Stick plant against the bands in
 * tests/slowstick-thresholds.json.
 *
 * Eighteen checks, S1 to S18, from docs/SLOWSTICK-STAGE1.md, on the pattern
 * of cub-gates.js. S1 to S5 are its performance: a slow cruise, a stall at
 * a run, a glide, a low top speed and a gentle climb. S6 to S9 are what the
 * owner asked this aircraft to do, flown in Manual so it is the airframe
 * doing it and not a stabiliser: level its wings by itself from a bank
 * with every stick centred, bank lazily on the rudder the roll stick
 * drives, turn tight on a held bank, and meet full up elevator with a
 * mush rather than a wing drop, with and without power. S10 to S13 are
 * the phugoid, the prop's torque, a throttle chop and a hand throw; S14 to
 * S16 the gear: standing on it, a take off from it with the sticks
 * centred, and a landing on it at a jog. S17 holds the other aircraft's
 * recorded hashes, the Radian's and the Bramor's included, where they were
 * before this one existed, and S18 flies the Slow Stick's recording in Node
 * and in headless Chrome and holds the two hashes equal. There is no wind
 * in the simulator's world, so drifting on it is not gated; the document
 * says so.
 * Bands are never widened here: a plant outside one is a finding for the
 * derivation. Run with npm run slowstick:gates.
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
  SLOWSTICK_AIRFRAME, fly, wingDebug, wheelLoads, attitude, must, slowstickGroundPrelude, skyPrelude,
  wingPrelude, cubGroundPrelude, gliderRecPrelude, bramorPrelude, bramorChutePrelude, RC_STEP_MS,
} from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const th = JSON.parse(await readFile(join(root, 'tests/slowstick-thresholds.json'), 'utf8'));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const DEG = 180 / Math.PI;

async function stickSim() {
  const sim = await loadSim(wasmBytes);
  if (sim.init(configText) !== SIM_OK) throw new Error('sim_init failed');
  if (sim.e.sim_set_airframe(SLOWSTICK_AIRFRAME) !== SIM_OK) throw new Error('sim_set_airframe failed');
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
const heading = (s) => Math.atan2(2 * (s[7] * s[10] + s[8] * s[9]), 1 - 2 * (s[9] * s[9] + s[10] * s[10]));
const fullBank = (s) => Math.atan2(2 * (s[9] * s[10] + s[7] * s[8]), 1 - 2 * (s[8] * s[8] + s[9] * s[9]));
const speed = (s) => Math.hypot(s[4], s[5], s[6]);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/* The level flight pilot for this aircraft: fly()'s own loops, with the
 * stall guard off, since the guard's 9.5 m/s is faster than a Slow Stick
 * goes, and thrown at its cruise. */
const slow = { guard: false, speed0: 6 };

/* A clock that keeps rising across the steps of one flight. */
let clockMs = 0;
function step(sim, sticks) {
  must(sim.input(clockMs / 1000, ...sticks), 'sim_input');
  must(sim.step(RC_STEP_MS), 'sim_step');
  clockMs += RC_STEP_MS;
  const s = sim.readState().state;
  const loads = wheelLoads(sim);
  return { s, loads, loaded: loads.some((f) => f > 0), hull: sim.e.sim_ground_contacts() };
}
/* Level at a throttle for a while with fly()'s pilot, then carry on from
 * where it left the aircraft. */
function levelThen(sim, duty, seconds = 15) {
  const r = fly(sim, { duty, vzTarget: 0, seconds, ...slow });
  clockMs = r.endMs;
  return r;
}

console.log('slow stick gates: the plant against docs/SLOWSTICK-STAGE1.md');
const sim = await stickSim();
must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
check: {
  if (sim.e.sim_airframe() !== SLOWSTICK_AIRFRAME) {
    gate('S0', 'the Slow Stick is selected', false, `airframe ${sim.e.sim_airframe()}`, `${SLOWSTICK_AIRFRAME}`);
    break check;
  }

  const s1 = fly(sim, { duty: th.s1_level_75.duty, vzTarget: 0, seconds: 30, ...slow });
  gate('S1', 'cruise: level speed at 75 percent', within(s1.v, th.s1_level_75), `${s1.v.toFixed(2)} m/s, sink ${(-s1.vz).toFixed(2)}`, band(th.s1_level_75));

  let stallV = null;
  fly(sim, {
    duty: 0, speed0: 7, seconds: 12, pitchMax: 0.7, pitchMin: -0.3, guard: false,
    pitchTargetFn: (ms) => Math.min(0.6, 0.06 * ms / 1000),
    onStep: (o) => { if (stallV == null && o.ms > 1000 && wingDebug(sim)[0] > th.s2_stall.alphaStall) stallV = o.v; },
  });
  gate('S2', 'stall speed, power off', stallV != null && within(stallV, th.s2_stall), stallV == null ? 'no stall reached' : `${stallV.toFixed(2)} m/s`, band(th.s2_stall));

  const g3 = fly(sim, { duty: 0, vTarget: th.s3_glide.speed, seconds: 30, ...slow, speed0: th.s3_glide.speed });
  const ratio = Math.sqrt(Math.max(0, g3.v * g3.v - g3.vz * g3.vz)) / -g3.vz;
  gate('S3', 'glide ratio, power off', within(ratio, th.s3_glide), `${ratio.toFixed(2)} at ${g3.v.toFixed(2)} m/s, sink ${(-g3.vz).toFixed(2)}`, band(th.s3_glide));

  const s4 = fly(sim, { duty: th.s4_top.duty, vzTarget: 0, seconds: 90, ...slow, speed0: 8 });
  gate('S4', 'top speed, level', within(s4.v, th.s4_top) && Math.abs(s4.vz) < 0.2, `${s4.v.toFixed(2)} m/s, climb ${s4.vz.toFixed(2)}`, band(th.s4_top));

  let best = null;
  for (const vT of th.s5_climb.speeds) {
    const r = fly(sim, { duty: 1, speed0: vT, vTarget: vT, seconds: 25, pitchMax: 1.2, pitchMin: -0.5, trimMax: 1.0, guard: false });
    if (!best || r.vz > best.vz) best = { v: r.v, vz: r.vz, pitchDeg: r.pitch * DEG };
  }
  gate('S5', 'best climb, full throttle', within(best.vz, th.s5_climb), `${best.vz.toFixed(2)} m/s at ${best.v.toFixed(1)} m/s, pitch ${best.pitchDeg.toFixed(0)} deg`, band(th.s5_climb));

  /* S6: level at cruise, then rolled to 30 deg at once, every stick let go
   * with the throttle left where it was. */
  {
    const t6 = th.s6_self_level;
    levelThen(sim, t6.duty);
    const s = sim.readState().state;
    const psi = heading(s);
    const h = t6.bankDeg / DEG / 2;
    const c = Math.cos(psi / 2);
    const z = Math.sin(psi / 2);
    /* The heading about world z, then the bank about the body's forward
     * axis: right wing down is a positive turn about +x, since y is left. */
    must(sim.e.sim_set_pose(s[1], s[2], s[3], c * Math.cos(h), c * Math.sin(h), z * Math.sin(h), z * Math.cos(h)), 'sim_set_pose');
    const b0 = fullBank(sim.readState().state) * DEG;
    let worst = Math.abs(b0);
    let at = null;
    let o = null;
    for (let ms = 0; ms < t6.atS * 1000; ms += RC_STEP_MS) {
      o = step(sim, [0, 0, 0, t6.duty]);
      const b = fullBank(o.s) * DEG;
      worst = Math.max(worst, Math.abs(b));
      if (ms + RC_STEP_MS === 2000) at = b;
    }
    const b6 = fullBank(o.s) * DEG;
    gate('S6', 'hands off from a 30 deg bank: levels itself', Math.sign(b6) === Math.sign(b0) && within(Math.abs(b6), t6) && worst <= t6.maxBankDeg,
      `${b0.toFixed(1)} deg, ${at.toFixed(1)} at 2 s, ${b6.toFixed(1)} at ${t6.atS} s, never past ${worst.toFixed(1)}, ${speed(o.s).toFixed(2)} m/s`,
      `${band(t6)} deg at ${t6.atS} s, never past ${t6.maxBankDeg}`);
  }

  /* S7: full right roll stick from level cruise, which the mix makes full
   * right rudder: the bank after a second and which way. */
  {
    const t7 = th.s7_rudder_bank;
    levelThen(sim, t7.duty);
    let peakR = 0;
    let o = null;
    for (let ms = 0; ms < 1000; ms += RC_STEP_MS) {
      o = step(sim, [1, 0, 0, t7.duty]);
      peakR = Math.max(peakR, -o.s[13] * DEG);
    }
    const b = fullBank(o.s) * DEG;
    gate('S7', 'full roll stick banks it on the rudder', within(b, t7), `${b.toFixed(1)} deg after 1 s, ${b > 0 ? 'right wing down' : 'WRONG WAY'}, yaw ${peakR.toFixed(0)} deg/s nose right`, `${band(t7)} deg, right wing down`);
  }

  /* S8: a 45 deg bank held on the rudder, the roll stick flying it with a
   * proportional, integral and rate loop, since a banked Slow Stick levels
   * itself and a proportional loop alone answers that with a standing
   * error; the height held on the elevator by fly()'s pitch loop, but
   * damping only the pitch rate the turn does not ask for: its own steady
   * rate, g sin(bank) tan(bank) / V, is not a disturbance. The radius
   * from the ground track over the last ten seconds. */
  {
    const t8 = th.s8_turn;
    must(sim.reset(), 'sim_reset');
    must(sim.e.sim_wing_launch(6.5), 'sim_wing_launch');
    clockMs = 0;
    const want = t8.bankDeg / DEG;
    let iBank = 0;
    let trim = 0;
    const pts = [];
    let o = { s: sim.readState().state };
    for (let ms = 0; ms < 60000; ms += RC_STEP_MS) {
      const { pitch } = attitude(o.s);
      const bank = fullBank(o.s);
      iBank = Math.max(-0.5, Math.min(0.5, iBank + 0.6 * (want - bank) * RC_STEP_MS / 1000));
      const roll = Math.max(-1, Math.min(1, 1.5 * (want - bank) - 0.3 * o.s[11] + iBank));
      trim = Math.max(-0.2, Math.min(0.3, trim + 0.0001 * (0 - o.s[6])));
      const pitchT = Math.max(-0.2, Math.min(0.3, 0.05 * (0 - o.s[6]) + trim));
      const qTurn = 9.81 * Math.sin(bank) * Math.tan(bank) / Math.max(3, speed(o.s));
      const pitchStick = Math.max(-1, Math.min(1, 2.5 * (pitchT - pitch) - 0.25 * (-o.s[12] - qTurn)));
      o = step(sim, [roll, pitchStick, 0, t8.duty]);
      if (ms >= 50000) pts.push({ x: o.s[1], y: o.s[2], t: ms / 1000, v: speed(o.s), bank: fullBank(o.s), vz: o.s[6], alpha: wingDebug(sim)[0] });
    }
    let dpsi = 0;
    let prev = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
    for (let i = 1; i < pts.length - 1; i += 1) {
      const hh = Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x);
      dpsi += wrap(hh - prev);
      prev = hh;
    }
    const mean = (kk) => pts.reduce((a, p) => a + p[kk], 0) / pts.length;
    const v = mean('v');
    const bank = mean('bank');
    const dt = pts[pts.length - 1].t - pts[0].t;
    const radius = v / (Math.abs(dpsi) / dt);
    const formula = v * v / (9.81 * Math.tan(Math.abs(bank)));
    const off = (radius / formula - 1) * 100;
    gate('S8', 'a tight turn on a held bank', Math.abs(off) <= t8.maxOffPercent && within(radius, t8) && Math.abs(mean('vz')) < 0.2,
      `${radius.toFixed(2)} m at ${(bank * DEG).toFixed(1)} deg and ${v.toFixed(2)} m/s, climb ${mean('vz').toFixed(2)}, alpha ${(mean('alpha') * DEG).toFixed(1)} deg, formula ${formula.toFixed(2)}, off ${off.toFixed(0)} percent`,
      `within ${t8.maxOffPercent} percent, ${band(t8)} m, level`);
  }

  /* S9: full up held from level cruise, power off and power on. */
  for (const [id, t9, duty] of [['S9a', th.s9_stall_power_off, 0], ['S9b', th.s9_stall_power_on, th.s9_stall_power_on.duty]]) {
    levelThen(sim, 0.75);
    const psi0 = heading(sim.readState().state);
    let worstBank = 0;
    let minPitch = 90;
    let maxPitch = -90;
    let worstHead = 0;
    let worstR = 0;
    let sinkSum = 0;
    let n = 0;
    let o = null;
    for (let ms = 0; ms < t9.seconds * 1000; ms += RC_STEP_MS) {
      o = step(sim, [0, 1, 0, duty]);
      const { pitch } = attitude(o.s);
      worstBank = Math.max(worstBank, Math.abs(fullBank(o.s) * DEG));
      minPitch = Math.min(minPitch, pitch * DEG);
      maxPitch = Math.max(maxPitch, pitch * DEG);
      worstHead = Math.max(worstHead, Math.abs(wrap(heading(o.s) - psi0)) * DEG);
      worstR = Math.max(worstR, Math.abs(o.s[13]) * DEG);
      if (ms >= t9.seconds * 1000 - 2000) { sinkSum += -o.s[6]; n += 1; }
    }
    const sink = sinkSum / n;
    const alpha = wingDebug(sim)[0] * DEG;
    gate(id, `full up held, ${duty ? 'power on' : 'power off'}: a mush, no wing drop`,
      worstBank <= t9.maxBankDeg && minPitch >= t9.minPitchDeg && worstR <= t9.maxYawRateDegS && (t9.min === undefined || within(sink, t9)),
      `bank ${worstBank.toFixed(1)}, pitch ${minPitch.toFixed(0)} to ${maxPitch.toFixed(0)}, yaw ${worstR.toFixed(1)} deg/s, heading ${worstHead.toFixed(0)} deg, sink ${sink.toFixed(2)} m/s at ${speed(o.s).toFixed(2)} m/s, alpha ${alpha.toFixed(0)}`,
      `bank ${t9.maxBankDeg}, pitch over ${t9.minPitchDeg}, yaw ${t9.maxYawRateDegS} deg/s${t9.min === undefined ? '' : `, sink ${band(t9)}`}`);
  }

  /* S10: the phugoid, fly()'s level cruise, a second of a little up stick,
   * then hands off with the wings held level on the rudder. */
  {
    levelThen(sim, 0.75, 20);
    const vs = [];
    for (let ms = 0; ms < 40000; ms += RC_STEP_MS) {
      const s = sim.readState().state;
      const roll = Math.max(-1, Math.min(1, -1.2 * attitude(s).bank - 0.12 * s[11]));
      const o = step(sim, [roll, ms < 1000 ? 0.3 : 0, 0, 0.75]);
      if (ms >= 2000) vs.push({ t: ms / 1000, v: speed(o.s) });
    }
    const tail = vs.filter((p) => p.t >= vs[vs.length - 1].t - 8);
    const mean = tail.reduce((a, p) => a + p.v, 0) / tail.length;
    const ups = [];
    for (let i = 1; i < vs.length; i += 1) {
      const a = vs[i - 1].v - mean;
      const b = vs[i].v - mean;
      if (a < 0 && b >= 0) ups.push(vs[i - 1].t + (vs[i].t - vs[i - 1].t) * (-a / (b - a)));
    }
    const period = ups.length >= 2 ? (ups[ups.length - 1] - ups[0]) / (ups.length - 1) : null;
    const swing = Math.max(...vs.map((p) => p.v)) - Math.min(...vs.map((p) => p.v));
    gate('S10', 'phugoid period', period != null && within(period, th.s10_phugoid), period == null ? `no oscillation, swing ${swing.toFixed(2)} m/s` : `${period.toFixed(2)} s over ${ups.length - 1} cycles, swing ${swing.toFixed(2)} m/s about ${mean.toFixed(2)}`, band(th.s10_phugoid));
  }

  /* S11: one step from rest at full throttle; the roll moment is the
   * motor's alone. */
  {
    must(sim.reset(), 'sim_reset');
    must(sim.e.sim_set_pose(0, 0, 50, 1, 0, 0, 0), 'sim_set_pose');
    must(sim.input(0, 0, 0, 0, 1), 'sim_input');
    must(sim.step(1), 'sim_step');
    const d = wingDebug(sim);
    gate('S11', 'prop torque, static full throttle', d[12] < 0 && within(-d[12], th.s11_prop_torque), `${(-d[12]).toFixed(4)} N m ${d[12] < 0 ? 'rolling left' : 'WRONG WAY'} at ${d[8].toFixed(2)} N`, `${band(th.s11_prop_torque)} N m, rolling left`);
  }

  /* S12: cruise, then the throttle closed with the pitch stick neutral. */
  {
    levelThen(sim, 0.75);
    let worst = 0;
    for (let ms = 0; ms < 3000; ms += RC_STEP_MS) {
      const o = step(sim, [0, 0, 0, 0]);
      worst = Math.max(worst, Math.abs(attitude(o.s).pitch * DEG));
    }
    gate('S12', 'a throttle chop glides', worst <= th.s12_chop.maxPitchDeg, `worst pitch ${worst.toFixed(1)} deg`, `within ${th.s12_chop.maxPitchDeg} deg`);
  }

  /* S13: a hand throw with every stick centred. */
  {
    const t13 = th.s13_throw;
    must(sim.reset(), 'sim_reset');
    must(sim.e.sim_set_pose(0, 0, 1.8, 1, 0, 0, 0), 'sim_set_pose');
    must(sim.e.sim_wing_launch(t13.speed), 'sim_wing_launch');
    clockMs = 0;
    let o = null;
    for (let ms = 0; ms < 3000; ms += RC_STEP_MS) o = step(sim, [0, 0, 0, t13.duty]);
    const lost = 1.8 - o.s[3];
    gate('S13', 'a hand throw flies away, sticks centred', lost <= t13.maxLoss && speed(o.s) >= t13.minSpeed,
      `${lost > 0 ? `lost ${lost.toFixed(2)}` : `gained ${(-lost).toFixed(2)}`} m and ${speed(o.s).toFixed(2)} m/s after 3 s`, `lost under ${t13.maxLoss} m, faster than ${t13.minSpeed} m/s`);
  }

  /* S14: standing on its wheels on the strip. */
  const onStrip = () => {
    must(sim.reset(), 'sim_reset');
    slowstickGroundPrelude(sim, { mu: GROUND_MU, e: GROUND_E });
    clockMs = 0;
  };
  let rest = null;
  {
    const r14 = th.s14_rest;
    onStrip();
    let hull = 0;
    let o = null;
    for (let ms = 0; ms < 3000; ms += RC_STEP_MS) {
      o = step(sim, [0, 0, 0, 0]);
      hull = Math.max(hull, o.hull);
    }
    rest = { pitch: attitude(o.s).pitch * DEG, z: o.s[3], tail: o.loads[2] / (o.loads[0] + o.loads[1] + o.loads[2]) };
    gate('S14', 'standing on its wheels', rest.pitch >= r14.pitchMin && rest.pitch <= r14.pitchMax && rest.z >= r14.zMin && rest.z <= r14.zMax && rest.tail >= r14.tailMin && rest.tail <= r14.tailMax && hull === 0 && Math.hypot(o.s[4], o.s[5]) < 0.01,
      `${rest.pitch.toFixed(2)} deg, CG ${rest.z.toFixed(4)} m, tail ${(rest.tail * 100).toFixed(1)} percent, loads ${o.loads.map((f) => f.toFixed(2)).join(' ')} N, hull ${hull}`,
      `${r14.pitchMin} to ${r14.pitchMax} deg, ${r14.zMin} to ${r14.zMax} m, ${r14.tailMin * 100} to ${r14.tailMax * 100} percent, no hull`);
  }

  /* S15: full throttle from standing, every stick centred; liftoff is the
   * last step on the wheels before 200 ms clear of them. */
  {
    const t15 = th.s15_takeoff;
    onStrip();
    for (let ms = 0; ms < 1000; ms += RC_STEP_MS) step(sim, [0, 0, 0, 0]);
    const x0 = sim.readState().state[1];
    let last = null;
    let off = 0;
    let lof = null;
    let worstBank = 0;
    for (let ms = 0; ms < 8000 && !lof; ms += RC_STEP_MS) {
      const o = step(sim, [0, 0, 0, 1]);
      worstBank = Math.max(worstBank, Math.abs(fullBank(o.s) * DEG));
      if (o.loaded) {
        last = { dist: o.s[1] - x0, v: speed(o.s), t: ms / 1000, heading: heading(o.s) * DEG };
        off = 0;
      } else {
        off += RC_STEP_MS;
        if (off >= 200) lof = last;
      }
    }
    gate('S15', 'takes off from the strip, sticks centred', lof != null && lof.dist >= t15.distMin && lof.dist <= t15.distMax && lof.v >= t15.vMin && lof.v <= t15.vMax,
      lof == null ? 'never left the ground' : `${lof.dist.toFixed(2)} m to liftoff at ${lof.v.toFixed(2)} m/s, ${lof.t.toFixed(2)} s, heading ${lof.heading.toFixed(1)} deg, bank under ${worstBank.toFixed(1)}`,
      `${t15.distMin} to ${t15.distMax} m, ${t15.vMin} to ${t15.vMax} m/s`);
  }

  /* S16: a glide from 3 m at cruise, the nose held level on the elevator
   * and the wings on the rudder, a flare to 5 deg at half a metre, and on
   * the wheels full up to hold the tail down through the roll out. */
  {
    const t16 = th.s16_landing;
    must(sim.reset(), 'sim_reset');
    slowstickGroundPrelude(sim, { mu: GROUND_MU, e: GROUND_E });
    must(sim.e.sim_set_pose(0, 0, 3, 1, 0, 0, 0), 'sim_set_pose');
    must(sim.e.sim_wing_launch(5.5), 'sim_wing_launch');
    clockMs = 0;
    let touched = null;
    let hull = 0;
    let bounces = 0;
    let was = false;
    let o = { s: sim.readState().state, loaded: false, loads: [0, 0, 0, 0] };
    for (let ms = 0; ms < 16000; ms += RC_STEP_MS) {
      const { pitch, bank } = attitude(o.s);
      const roll = Math.max(-1, Math.min(1, -1.2 * bank - 0.12 * o.s[11]));
      const target = touched !== null ? null : (o.s[3] > 0.5 ? -2 / DEG : 5 / DEG);
      const pitchStick = target === null ? 1 : Math.max(-1, Math.min(1, 2.5 * (target - pitch) + 0.25 * o.s[12]));
      o = step(sim, [roll, pitchStick, 0, 0]);
      if (o.loaded && touched === null) touched = { v: speed(o.s), vg: Math.hypot(o.s[4], o.s[5]), vz: o.s[6], x: o.s[1] };
      if (o.loaded && !was && touched !== null && ms > 0) bounces += 1;
      was = o.loaded;
      if (touched !== null) hull = Math.max(hull, o.hull + (o.loads[3] > 0 ? 1 : 0));
    }
    const land = { pitch: attitude(o.s).pitch * DEG, v: Math.hypot(o.s[4], o.s[5]), roll: touched ? o.s[1] - touched.x : 0 };
    gate('S16', 'lands on its wheels at a jog', touched !== null && touched.vg <= t16.maxTouchSpeed && land.v < 0.05 && Math.abs(land.pitch - rest.pitch) <= t16.pitchTolDeg && hull === 0 && o.loads.slice(0, 3).every((f) => f > 0),
      touched === null ? 'never touched down' : `touched at ${touched.vg.toFixed(2)} m/s over the ground sinking ${(-touched.vz).toFixed(2)}, ${bounces} contact${bounces === 1 ? '' : 's'}, rolled ${land.roll.toFixed(1)} m, at rest at ${land.pitch.toFixed(2)} deg, hull or prop ${hull}`,
      `under ${t16.maxTouchSpeed} m/s, at rest within ${t16.pitchTolDeg} deg of S14, no hull or prop`);
  }
}

const quadTh = JSON.parse(await readFile(join(root, 'tests/thresholds.json'), 'utf8'));
const replayBase = { configText, renderHz: quadTh.replay.canonical_render_hz.value, traceStrideMs: quadTh.replay.trace_stride_ms.value };
const recOf = async (f) => decodeRec(new Uint8Array(await readFile(join(root, f))));
const hashOf = async (f, prelude) => (await replayTrace(await loadSim(wasmBytes), await recOf(f), { ...replayBase, prelude })).slice(0, 16);
const u = th.s17_unmoved;
const got = {
  quad: await hashOf('tests/inputs/baseline.rec', undefined),
  wing: await hashOf('tests/inputs/wing-baseline.rec', wingPrelude),
  sky: await hashOf('tests/inputs/sky-baseline.rec', skyPrelude),
  cub: await hashOf('tests/inputs/cub-baseline.rec', (s) => cubGroundPrelude(s)),
  glider: await hashOf('tests/inputs/glider-baseline.rec', gliderRecPrelude),
  bramor: await hashOf('tests/inputs/bramor-baseline.rec', bramorPrelude),
  bramorChute: await hashOf('tests/inputs/bramor-chute.rec', bramorChutePrelude),
};
const names = ['quad', 'wing', 'sky', 'cub', 'glider', 'bramor', 'bramorChute'];
gate('S17', 'the other aircraft unmoved', names.every((k) => got[k] === u[k]),
  names.map((k) => got[k]).join(', '), names.map((k) => u[k]).join(', '));

const stickRec = await recOf('tests/inputs/slowstick-baseline.rec');
const stickOpts = { ...replayBase, prelude: (s) => slowstickGroundPrelude(s) };
const nodeHash = (await replayTrace(await loadSim(wasmBytes), stickRec, stickOpts)).slice(0, 16);
const nodeAgain = (await replayTrace(await loadSim(wasmBytes), stickRec, stickOpts)).slice(0, 16);
if (!findChrome()) {
  gate('S18', 'Node and Chrome agree', null, `node ${nodeHash} twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}, no Chrome here`, 'identical');
} else {
  const server = await startServer(root);
  try {
    const out = await runBrowserHarness(`${server.origin}/tests/browser/wing-harness.html?plane=slowstick`);
    const result = out.result || {};
    const chromeHash = result.ok ? String(result.hash).slice(0, 16) : `error: ${result.message || result.errorName || JSON.stringify(out).slice(0, 80)}`;
    gate('S18', 'Node and Chrome agree', nodeAgain === nodeHash && result.ok && chromeHash === nodeHash, `node ${nodeHash} (twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}), chrome ${chromeHash}`, 'identical');
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
