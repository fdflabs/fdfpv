/*
 * f16-gates.js: the Freewing F-16 V3 70 mm EDF plant against the bands in
 * tests/f16-thresholds.json.
 *
 * Checks S1 to S22 from docs/F16-STAGE1.md, on the pattern of
 * kadet-gates.js, the other tricycle. S1 to S5 are its performance: the
 * pattern speed at half stick, its stall, the glide at the approach speed,
 * Freewing's 165 km/h at full throttle and a climb a thrust to weight of
 * 1.13 gives. S6 to S10 its handling, flown in Manual so it is the
 * airframe doing it: the spiral through the wing's sweep, the roll rate
 * of a fighter's ailerons, a held bank, full up held at Freewing's 30 deg
 * of alpha, and the phugoid. S11 to S13 are the ducted fan: its speed
 * lagging the stick up from stopped and from turning and down again, its
 * thrust falling with airspeed as NASA measured a fan's does, and the
 * energy a clean jet keeps with the throttle closed. S14 to S16 the
 * tricycle gear: standing level on its three wheels, a take off at full
 * throttle and one at Model Aviation's scale throttle, and a landing from
 * the approach speed. S17 holds every other aircraft's recorded hash where
 * it was before this one existed, and S18 flies the F-16's recording in
 * Node and in headless Chrome and holds the two hashes equal. S20 is the
 * ESC with the stick closed: nothing turns. S21 closes the throttle at
 * cruise and lets every stick go; S22 is a chop with the pitch stick
 * neutral. There is no S19. Bands are never widened here: a plant outside
 * one is a finding for the derivation. Run with npm run f16:gates.
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
  F16_AIRFRAME, f16GroundPrelude, f16TakeoffSticks, fly, wingDebug, wheelLoads, attitude, must, bombshellGroundPrelude,
  slowstickGroundPrelude, skyPrelude, kadetGroundPrelude,
  wingPrelude, cubGroundPrelude, gliderRecPrelude, bramorPrelude, bramorChutePrelude, timberRecPrelude,
  timberFloatRecPrelude, RC_STEP_MS,
} from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const th = JSON.parse(await readFile(join(root, 'tests/f16-thresholds.json'), 'utf8'));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const DEG = 180 / Math.PI;
/* The fan's full speed and static thrust, the plant's table (FW_F16878):
 * 0.85 of 2210 kV on 6S's 22.2 V, and Freewing's 2,400 g. */
const FAN_RPM = 0.85 * 49062;
const T0 = 23.536;

async function f16Sim() {
  const sim = await loadSim(wasmBytes);
  if (sim.init(configText) !== SIM_OK) throw new Error('sim_init failed');
  if (sim.e.sim_set_airframe(F16_AIRFRAME) !== SIM_OK) throw new Error('sim_set_airframe failed');
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

/* fly()'s pilot, the stall guard off (its 9.5 m/s is under this jet's
 * stall), started 600 m to the side of the field, where no thermal is. */
const STILL_AIR = [0, 600, 0, 1, 0, 0, 0];
const pattern = { guard: false, speed0: 20, start: STILL_AIR, pitchMin: -0.3, pitchMax: 0.4, trimMax: 0.4 };

let clockMs = 0;
function step(sim, sticks) {
  must(sim.input(clockMs / 1000, ...sticks), 'sim_input');
  must(sim.step(RC_STEP_MS), 'sim_step');
  clockMs += RC_STEP_MS;
  const s = sim.readState().state;
  const loads = wheelLoads(sim);
  return { s, loads, loaded: loads.some((f) => f > 0), hull: sim.e.sim_ground_contacts() };
}
function levelThen(sim, duty, seconds = 25, speed0 = 20) {
  const r = fly(sim, { duty, vzTarget: 0, seconds, ...pattern, speed0 });
  clockMs = r.endMs;
  return r;
}

console.log('f16 gates: the plant against docs/F16-STAGE1.md');
const sim = await f16Sim();
must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
check: {
  if (sim.e.sim_airframe() !== F16_AIRFRAME) {
    gate('S0', 'the F-16 is selected', false, `airframe ${sim.e.sim_airframe()}`, `${F16_AIRFRAME}`);
    break check;
  }

  const s1 = fly(sim, { duty: th.s1_level_50.duty, vzTarget: 0, seconds: 40, ...pattern });
  gate('S1', 'pattern speed: level at half stick', within(s1.v, th.s1_level_50), `${s1.v.toFixed(2)} m/s, sink ${(-s1.vz).toFixed(2)}`, band(th.s1_level_50));

  let stallV = null;
  fly(sim, {
    duty: 0, speed0: 18, seconds: 14, pitchMax: 0.8, pitchMin: -0.3, guard: false, start: STILL_AIR,
    pitchTargetFn: (ms) => Math.min(0.7, 0.07 * ms / 1000),
    onStep: (o) => { if (stallV == null && o.ms > 1000 && wingDebug(sim)[0] > th.s2_stall.alphaStall) stallV = o.v; },
  });
  gate('S2', 'stall speed, power off', stallV != null && within(stallV, th.s2_stall), stallV == null ? 'no stall reached' : `${stallV.toFixed(2)} m/s`, band(th.s2_stall));

  const g3 = fly(sim, { duty: 0, vTarget: th.s3_glide.speed, seconds: 30, ...pattern, speed0: th.s3_glide.speed });
  const ratio = Math.sqrt(Math.max(0, g3.v * g3.v - g3.vz * g3.vz)) / -g3.vz;
  gate('S3', 'glide ratio at the approach speed', within(ratio, th.s3_glide), `${ratio.toFixed(2)} at ${g3.v.toFixed(2)} m/s, sink ${(-g3.vz).toFixed(2)}`, band(th.s3_glide));

  const s4 = fly(sim, { duty: th.s4_top.duty, vzTarget: 0, seconds: 60, ...pattern, speed0: 40 });
  gate('S4', 'top speed, level: Freewing\'s 165 km/h', within(s4.v, th.s4_top) && Math.abs(s4.vz) < 0.2, `${s4.v.toFixed(2)} m/s (${(s4.v * 3.6).toFixed(0)} km/h), climb ${s4.vz.toFixed(2)}`, band(th.s4_top));

  let best = null;
  for (const vT of th.s5_climb.speeds) {
    const r = fly(sim, { duty: 1, speed0: vT, vTarget: vT, seconds: 25, pitchMax: 1.5, pitchMin: -0.5, trimMax: 1.5, guard: false, start: STILL_AIR });
    if (!best || r.vz > best.vz) best = { v: r.v, vz: r.vz, pitchDeg: r.pitch * DEG };
  }
  gate('S5', 'best climb, full throttle', within(best.vz, th.s5_climb), `${best.vz.toFixed(2)} m/s at ${best.v.toFixed(1)} m/s, pitch ${best.pitchDeg.toFixed(0)} deg`, band(th.s5_climb));

  /* S6: level at the pattern speed, then rolled to 30 deg at once, every
   * stick let go with the throttle left where it was. */
  {
    const t6 = th.s6_self_level;
    levelThen(sim, t6.duty);
    const s = sim.readState().state;
    const psi = heading(s);
    const h = t6.bankDeg / DEG / 2;
    const c = Math.cos(psi / 2);
    const z = Math.sin(psi / 2);
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
    gate('S6', 'hands off from a 30 deg bank: the spiral', Math.sign(b6) === Math.sign(b0) && within(Math.abs(b6), t6) && worst <= t6.maxBankDeg,
      `${b0.toFixed(1)} deg, ${at.toFixed(1)} at 2 s, ${b6.toFixed(1)} at ${t6.atS} s, never past ${worst.toFixed(1)}, ${speed(o.s).toFixed(2)} m/s`,
      `${band(t6)} deg at ${t6.atS} s, never past ${t6.maxBankDeg}`);
  }

  /* S7: full right roll stick from level flight at a held 30 m/s: the
   * peak roll rate in the first second, and p b / 2V at it. */
  {
    const t7 = th.s7_roll;
    const r = fly(sim, { duty: t7.duty, vTarget: t7.speed, seconds: 20, ...pattern, speed0: t7.speed });
    clockMs = r.endMs;
    let peak = 0;
    let vAt = 0;
    for (let ms = 0; ms < 1000; ms += RC_STEP_MS) {
      const o = step(sim, [1, 0, 0, t7.duty]);
      if (o.s[11] > peak) { peak = o.s[11]; vAt = speed(o.s); }
    }
    gate('S7', 'full roll stick: a fighter\'s roll rate', within(peak * DEG, t7), `${(peak * DEG).toFixed(0)} deg/s right at ${vAt.toFixed(1)} m/s, p b / 2V ${(peak * 0.878 / (2 * vAt)).toFixed(4)}`, `${band(t7)} deg/s`);
  }

  /* S8: a 45 deg bank held on the ailerons, the height on the elevator,
   * the turn's own pitch rate not damped as a disturbance; the radius from
   * the ground track over the last ten seconds. */
  {
    const t8 = th.s8_turn;
    must(sim.reset(), 'sim_reset');
    must(sim.e.sim_set_pose(...STILL_AIR), 'sim_set_pose');
    must(sim.e.sim_wing_launch(t8.speed0), 'sim_wing_launch');
    clockMs = 0;
    const want = t8.bankDeg / DEG;
    let iBank = 0;
    let trim = 0;
    const pts = [];
    let o = { s: sim.readState().state };
    for (let ms = 0; ms < 40000; ms += RC_STEP_MS) {
      const { pitch } = attitude(o.s);
      const bank = fullBank(o.s);
      iBank = Math.max(-0.3, Math.min(0.3, iBank + 0.3 * (want - bank) * RC_STEP_MS / 1000));
      const roll = Math.max(-1, Math.min(1, 0.6 * (want - bank) - 0.04 * o.s[11] + iBank));
      trim = Math.max(-0.2, Math.min(0.4, trim + 0.0001 * (0 - o.s[6])));
      const pitchT = Math.max(-0.2, Math.min(0.4, 0.05 * (0 - o.s[6]) + trim));
      const qTurn = 9.81 * Math.sin(bank) * Math.tan(bank) / Math.max(5, speed(o.s));
      const pitchStick = Math.max(-1, Math.min(1, 2.5 * (pitchT - pitch) - 0.25 * (-o.s[12] - qTurn)));
      o = step(sim, [roll, pitchStick, 0, t8.duty]);
      if (ms >= 30000) pts.push({ x: o.s[1], y: o.s[2], t: ms / 1000, v: speed(o.s), bank: fullBank(o.s), vz: o.s[6], alpha: wingDebug(sim)[0] });
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
    gate('S8', 'a turn on a held bank', Math.abs(off) <= t8.maxOffPercent && Math.abs(mean('vz')) < 0.3,
      `${radius.toFixed(1)} m at ${(bank * DEG).toFixed(1)} deg and ${v.toFixed(2)} m/s, climb ${mean('vz').toFixed(2)}, alpha ${(mean('alpha') * DEG).toFixed(1)} deg, formula ${formula.toFixed(1)}, off ${off.toFixed(0)} percent`,
      `within ${t8.maxOffPercent} percent, level`);
  }

  /* S9: full up held from 20 m/s at 60 percent: the high alpha Freewing
   * advertises, with no wing drop and no spin. */
  {
    const t9 = th.s9_high_alpha;
    clockMs = fly(sim, { duty: t9.duty, vzTarget: 0, seconds: 20, ...pattern, speed0: t9.entry }).endMs;
    const psi0 = heading(sim.readState().state);
    let worstBank = 0;
    let worstR = 0;
    let worstHead = 0;
    let alphaSum = 0;
    let n = 0;
    let o = { s: sim.readState().state };
    for (let ms = 0; ms < t9.seconds * 1000; ms += RC_STEP_MS) {
      const roll = Math.max(-1, Math.min(1, -0.8 * fullBank(o.s) - 0.05 * o.s[11]));
      o = step(sim, [roll, 1, 0, t9.duty]);
      worstBank = Math.max(worstBank, Math.abs(fullBank(o.s) * DEG));
      worstR = Math.max(worstR, Math.abs(o.s[13]) * DEG);
      worstHead = Math.max(worstHead, Math.abs(wrap(heading(o.s) - psi0)) * DEG);
      if (ms >= t9.seconds * 1000 - 2000) { alphaSum += wingDebug(sim)[0] * DEG; n += 1; }
    }
    const alpha = alphaSum / n;
    /* The same hands off, for the record: the slow spiral it is. */
    clockMs = fly(sim, { duty: t9.duty, vzTarget: 0, seconds: 20, ...pattern, speed0: t9.entry }).endMs;
    let free = null;
    for (let ms = 0; ms < t9.seconds * 1000; ms += RC_STEP_MS) free = step(sim, [0, 1, 0, t9.duty]);
    gate('S9', 'full up held: 30 deg of alpha, the wings held', alpha >= t9.alphaMinDeg && alpha <= t9.alphaMaxDeg && worstBank <= t9.maxBankDeg && worstR <= t9.maxYawRateDegS,
      `alpha ${alpha.toFixed(1)} deg, bank ${worstBank.toFixed(1)}, yaw ${worstR.toFixed(1)} deg/s, heading ${worstHead.toFixed(0)} deg, ${speed(o.s).toFixed(2)} m/s, sink ${(-o.s[6]).toFixed(2)}; hands off ${(fullBank(free.s) * DEG).toFixed(0)} deg of bank after ${t9.seconds} s`,
      `alpha ${t9.alphaMinDeg} to ${t9.alphaMaxDeg}, bank ${t9.maxBankDeg}, yaw ${t9.maxYawRateDegS} deg/s`);
  }

  /* S10: the phugoid, level at the pattern speed, a second of a little up
   * stick, then hands off with the wings held on the ailerons. */
  {
    const t10 = th.s10_phugoid;
    levelThen(sim, t10.duty, 25);
    const vs = [];
    for (let ms = 0; ms < 45000; ms += RC_STEP_MS) {
      const s = sim.readState().state;
      const roll = Math.max(-1, Math.min(1, -0.8 * attitude(s).bank - 0.05 * s[11]));
      const o = step(sim, [roll, ms < 1000 ? 0.2 : 0, 0, t10.duty]);
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
    gate('S10', 'phugoid period', period != null && within(period, t10), period == null ? `no oscillation, swing ${swing.toFixed(2)} m/s` : `${period.toFixed(2)} s over ${ups.length - 1} cycles, swing ${swing.toFixed(2)} m/s about ${mean.toFixed(2)}`, band(t10));
  }

  /* S11: the fan's speed against the stick, from rest high in the air (the
   * fan's speed does not depend on the airspeed, so the flight it makes
   * meanwhile does not matter): the time to the speed that makes 90
   * percent of the static thrust, from a stopped fan and from one turning
   * at 30 percent, and down again to under 10 percent. 1 ms steps, so the
   * time is read to the plant's own step. */
  {
    const t11 = th.s11_spool;
    const hold = () => {
      must(sim.reset(), 'sim_reset');
      must(sim.e.sim_set_pose(0, 0, 500, 1, 0, 0, 0), 'sim_set_pose');
      clockMs = 0;
    };
    const run = (duty, ms, until) => {
      for (let t = 0; t < ms; t += 1) {
        must(sim.input(clockMs / 1000, 0, 0, 0, duty), 'sim_input');
        must(sim.step(1), 'sim_step');
        clockMs += 1;
        if (until && until(sim.readState().state[14] / FAN_RPM)) return (t + 1) / 1000;
      }
      return null;
    };
    const n90 = Math.sqrt(0.9);
    const n10 = Math.sqrt(0.1);
    hold();
    const fromStop = run(1, 3000, (n) => n >= n90);
    hold();
    run(t11.fromSpin.from, 3000, null);
    const fromSpin = run(1, 3000, (n) => n >= n90);
    run(1, 2000, null);
    const down = run(0, 3000, (n) => n < n10);
    gate('S11a', 'the fan spools up from stopped: a lag a prop has not', fromStop !== null && within(fromStop, t11.fromStop), `${fromStop} s to 90 percent of the static thrust`, `${band(t11.fromStop)} s`);
    gate('S11b', 'from a turning fan to full', fromSpin !== null && within(fromSpin, t11.fromSpin), `${fromSpin} s to 90 percent`, `${band(t11.fromSpin)} s`);
    gate('S11c', 'and down: the thrust dies as the fan runs down', down !== null && within(down, t11.down), `${down} s to under 10 percent`, `${band(t11.down)} s`);
  }

  /* S12: full throttle at a held airspeed: the fan's thrust against its
   * static, and the straight line NASA's fan follows. */
  {
    const t12 = th.s12_thrust_vs_speed;
    const out = [];
    let ok = true;
    for (const vT of t12.speeds) {
      let sum = 0;
      let uSum = 0;
      let nSum = 0;
      let n = 0;
      fly(sim, {
        duty: 1, speed0: vT, vTarget: vT, seconds: 20, pitchMax: 1.5, pitchMin: -0.5, trimMax: 1.5, guard: false, start: STILL_AIR,
        onStep: (o) => { if (o.ms >= 15000) { const d = wingDebug(sim); sum += d[8]; uSum += d[15]; nSum += sim.readState().state[14] / FAN_RPM; n += 1; } },
      });
      const r = sum / n / T0;
      const u = uSum / n;
      const fan = nSum / n;
      const want = fan * fan * (1 - u / (t12.zeroThrust * fan));
      ok = ok && Math.abs(r - want) <= t12.tolerance;
      out.push(`${r.toFixed(3)} at u ${u.toFixed(1)} m/s, fan ${fan.toFixed(3)} (line ${want.toFixed(3)}, at full speed ${(1 - u / t12.zeroThrust).toFixed(3)})`);
    }
    gate('S12', 'the fan\'s thrust falls with airspeed', ok, out.join(', '), `n^2 (1 - u / (${t12.zeroThrust} n)) within ${t12.tolerance}`);
  }

  /* S13: level at 75 percent, then the throttle closed and the height
   * held on the elevator: how long and how far to the approach speed. */
  {
    const t13 = th.s13_energy;
    const lv = levelThen(sim, t13.duty, 30, 33);
    const s0 = sim.readState().state;
    let trim = 0;
    let t = null;
    let d = null;
    let o = { s: s0 };
    /* The pilot holds the height: the pitch level flight needs at the
     * speed flown, W / (q S CLalpha) over the zero lift line, and a
     * correction on the height and the climb rate. */
    for (let ms = 0; ms < 40000; ms += RC_STEP_MS) {
      const { pitch, bank } = attitude(o.s);
      const v = speed(o.s);
      const roll = Math.max(-1, Math.min(1, -0.8 * bank - 0.05 * o.s[11]));
      trim = Math.max(-0.1, Math.min(0.1, trim + 0.0001 * (s0[3] - o.s[3])));
      const need = 2.116 * 9.81 / (0.5 * 1.225 * v * v * 0.21484 * 3.310) - 1.03 / DEG;
      const pitchT = Math.max(-0.2, Math.min(0.5, need + 0.02 * (s0[3] - o.s[3]) + 0.05 * (0 - o.s[6]) + trim));
      o = step(sim, [roll, Math.max(-1, Math.min(1, 2.5 * (pitchT - pitch) - 0.25 * -o.s[12])), 0, 0]);
      if (speed(o.s) <= th.s3_glide.speed) {
        t = (ms + RC_STEP_MS) / 1000;
        d = Math.hypot(o.s[1] - s0[1], o.s[2] - s0[2]);
        break;
      }
    }
    gate('S13', 'energy: throttle closed, it keeps its speed', t !== null && t >= t13.tMin && t <= t13.tMax && d >= t13.dMin && d <= t13.dMax,
      t === null ? 'never slowed' : `${lv.v.toFixed(2)} to ${th.s3_glide.speed} m/s in ${t.toFixed(1)} s over ${d.toFixed(0)} m, height ${(o.s[3] - s0[3]).toFixed(1)} m`,
      `${t13.tMin} to ${t13.tMax} s, ${t13.dMin} to ${t13.dMax} m`);
  }

  /* S14: standing on its wheels on the strip. */
  const onStrip = () => {
    must(sim.reset(), 'sim_reset');
    f16GroundPrelude(sim, { mu: GROUND_MU, e: GROUND_E });
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
    rest = { pitch: attitude(o.s).pitch * DEG, z: o.s[3], nose: o.loads[2] / (o.loads[0] + o.loads[1] + o.loads[2]) };
    gate('S14', 'standing level on its three wheels', rest.pitch >= r14.pitchMin && rest.pitch <= r14.pitchMax && rest.z >= r14.zMin && rest.z <= r14.zMax && rest.nose >= r14.noseMin && rest.nose <= r14.noseMax && hull === 0 && o.loads[3] === 0 && Math.hypot(o.s[4], o.s[5]) < 0.01,
      `${rest.pitch.toFixed(2)} deg, CG ${rest.z.toFixed(4)} m, nose ${(rest.nose * 100).toFixed(1)} percent, loads ${o.loads.map((f) => f.toFixed(2)).join(' ')} N, hull ${hull}`,
      `${r14.pitchMin} to ${r14.pitchMax} deg, ${r14.zMin} to ${r14.zMax} m, ${r14.noseMin * 100} to ${r14.noseMax * 100} percent, no hull or skid`);
  }

  /* S15: the throttle held from a stopped fan, the sticks centred and the
   * elevator eased up past 1.2 Vs; liftoff is the last step on the wheels
   * before 200 ms clear of them. At full throttle and at Model Aviation's
   * scale throttle. */
  for (const [id, t15, name] of [['S15', th.s15_takeoff, 'takes off at full throttle'], ['S15b', th.s15b_scale_takeoff, 'and at a scale throttle: a long roll']]) {
    onStrip();
    for (let ms = 0; ms < 1000; ms += RC_STEP_MS) step(sim, [0, 0, 0, 0]);
    const x0 = sim.readState().state[1];
    let last = null;
    let off = 0;
    let lof = null;
    let worstBank = 0;
    let skid = 0;
    for (let ms = 0; ms < 20000 && !lof; ms += RC_STEP_MS) {
      const o = step(sim, f16TakeoffSticks(sim.readState().state, { duty: t15.duty }));
      worstBank = Math.max(worstBank, Math.abs(fullBank(o.s) * DEG));
      skid = Math.max(skid, o.loads[3]);
      if (o.loaded) {
        last = { dist: o.s[1] - x0, v: speed(o.s), t: ms / 1000, heading: heading(o.s) * DEG };
        off = 0;
      } else {
        off += RC_STEP_MS;
        if (off >= 200) lof = last;
      }
    }
    gate(id, name, lof != null && lof.dist >= t15.distMin && lof.dist <= t15.distMax && lof.v >= t15.vMin && lof.v <= t15.vMax && skid === 0,
      lof == null ? 'never left the ground' : `${lof.dist.toFixed(2)} m to liftoff at ${lof.v.toFixed(2)} m/s, ${lof.t.toFixed(2)} s, heading ${lof.heading.toFixed(1)} deg, bank under ${worstBank.toFixed(1)}, tail skid ${skid.toFixed(1)} N`,
      `${t15.distMin} to ${t15.distMax} m, ${t15.vMin} to ${t15.vMax} m/s, no tail strike`);
  }

  /* S16: an approach from 12 m flown as Model Aviation flies it, the
   * speed held at 1.3 Vs on the elevator and a 3.5 deg glide path on the
   * throttle, since at idle this jet's glide is 8 deg steep; "after the
   * F-16 is over the runway threshold, the power can be relaxed to idle":
   * at 1.2 m the throttle closes and the nose comes up to 9 deg by 0.3 m,
   * short of the 11.4 deg that puts the nozzle on the runway, and on the
   * wheels the elevator is let go; 40 s, for the long roll out a jet's
   * energy makes. */
  {
    const t16 = th.s16_landing;
    must(sim.reset(), 'sim_reset');
    f16GroundPrelude(sim, { mu: GROUND_MU, e: GROUND_E });
    must(sim.e.sim_set_pose(0, 0, t16.z0, 1, 0, 0, 0), 'sim_set_pose');
    must(sim.e.sim_wing_launch(t16.speed0), 'sim_wing_launch');
    clockMs = 0;
    let touched = null;
    let hull = 0;
    let bounces = 0;
    let was = false;
    let o = { s: sim.readState().state, loaded: false, loads: [0, 0, 0, 0] };
    let iPitch = 0;
    let iThrottle = 0.3;
    for (let ms = 0; ms < 40000; ms += RC_STEP_MS) {
      const { pitch, bank } = attitude(o.s);
      const roll = Math.max(-1, Math.min(1, -0.8 * bank - 0.05 * o.s[11]));
      const v = speed(o.s);
      const vErr = v - t16.approach;
      const approach = Math.max(-10 / DEG, Math.min(12 / DEG, (2 + 3 * vErr) / DEG));
      const flare = Math.min(9, 2 + 7 * (1.2 - o.s[3]) / 0.9) / DEG;
      const high = o.s[3] > 1.2;
      const target = touched !== null ? null : (high ? approach : flare);
      let pitchStick = 0;
      if (target !== null) {
        iPitch = Math.max(-0.6, Math.min(0.6, iPitch + 2.0 * (target - pitch) * RC_STEP_MS / 1000));
        pitchStick = Math.max(-1, Math.min(1, 2.5 * (target - pitch) + 0.25 * o.s[12] + iPitch));
      }
      const vzErr = -v * Math.tan(3.5 / DEG) - o.s[6];
      iThrottle = Math.max(0, Math.min(1, iThrottle + 0.3 * vzErr * RC_STEP_MS / 1000));
      const throttle = high && touched === null ? Math.max(0, Math.min(1, iThrottle + 0.2 * vzErr)) : 0;
      o = step(sim, [roll, pitchStick, 0, throttle]);
      if (o.loaded && touched === null) touched = { v: speed(o.s), vg: Math.hypot(o.s[4], o.s[5]), vz: o.s[6], x: o.s[1] };
      if (o.loaded && !was && touched !== null && ms > 0) bounces += 1;
      was = o.loaded;
      if (touched !== null) hull = Math.max(hull, o.hull + (o.loads[3] > 0 ? 1 : 0));
    }
    const land = { pitch: attitude(o.s).pitch * DEG, v: Math.hypot(o.s[4], o.s[5]), roll: touched ? o.s[1] - touched.x : 0 };
    gate('S16', 'lands on its wheels from the approach speed', touched !== null && touched.vg <= t16.maxTouchSpeed && land.v < 0.05 && Math.abs(land.pitch - rest.pitch) <= t16.pitchTolDeg && hull === 0 && o.loads.slice(0, 3).every((f) => f > 0),
      touched === null ? 'never touched down' : `touched at ${touched.vg.toFixed(2)} m/s over the ground sinking ${(-touched.vz).toFixed(2)}, ${bounces} contact${bounces === 1 ? '' : 's'}, rolled ${land.roll.toFixed(1)} m, at rest at ${land.pitch.toFixed(2)} deg, hull or skid ${hull}`,
      `under ${t16.maxTouchSpeed} m/s, at rest within ${t16.pitchTolDeg} deg of S14, no hull or skid`);
  }

  /* S20: the stick closed on the strip. */
  {
    const t20 = th.s20_stopped;
    onStrip();
    let o = null;
    for (let ms = 0; ms < t20.seconds * 1000; ms += RC_STEP_MS) o = step(sim, [0, 0, 0, 0]);
    const d = wingDebug(sim);
    const vg = Math.hypot(o.s[4], o.s[5]);
    const moved = Math.hypot(o.s[1], o.s[2]);
    gate('S20', 'the stick closed: the fan stopped, it stands', o.s[14] === 0 && d[8] === 0 && vg <= t20.maxSpeed,
      `${o.s[14].toFixed(0)} rpm, ${d[8].toFixed(3)} N, ground speed ${(vg * 1000).toFixed(3)} mm/s, moved ${(moved * 1000).toFixed(1)} mm`,
      `0 rpm, no thrust, under ${t20.maxSpeed * 1000} mm/s`);
  }

  /* S21: the chop with every stick let go: the glide the airframe trims
   * itself onto once the fan has run down. */
  {
    const t21 = th.s21_hands_off_glide;
    levelThen(sim, t21.duty, 30, 33);
    let sink = 0, v = 0, n = 0, alphaMax = -Infinity;
    for (let ms = 0; ms < t21.seconds * 1000; ms += RC_STEP_MS) {
      const o = step(sim, [0, 0, 0, 0]);
      alphaMax = Math.max(alphaMax, wingDebug(sim)[0]);
      if (ms >= t21.fromS * 1000) {
        sink += -o.s[6];
        v += speed(o.s);
        n += 1;
      }
    }
    sink /= n;
    v /= n;
    const ok = within(sink, t21) && v >= t21.vMin && v <= t21.vMax && alphaMax < th.s2_stall.alphaStall;
    gate('S21', 'throttle closed, sticks let go: its glide', ok,
      `sink ${sink.toFixed(2)} m/s at ${v.toFixed(2)} m/s, alpha at most ${(alphaMax * DEG).toFixed(1)} deg`,
      `sink ${band(t21)}, ${t21.vMin} to ${t21.vMax} m/s, alpha under ${(th.s2_stall.alphaStall * DEG).toFixed(1)}`);
  }

  /* S22: a chop from the pattern speed with the pitch stick neutral. */
  {
    levelThen(sim, th.s22_chop.duty, 25, 20);
    let worst = 0;
    for (let ms = 0; ms < 3000; ms += RC_STEP_MS) {
      const o = step(sim, [0, 0, 0, 0]);
      worst = Math.max(worst, Math.abs(attitude(o.s).pitch * DEG));
    }
    gate('S22', 'a throttle chop glides', worst <= th.s22_chop.maxPitchDeg, `worst pitch ${worst.toFixed(1)} deg`, `within ${th.s22_chop.maxPitchDeg} deg`);
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
  slowstick: await hashOf('tests/inputs/slowstick-baseline.rec', (s) => slowstickGroundPrelude(s)),
  bombshell: await hashOf('tests/inputs/bombshell-baseline.rec', (s) => bombshellGroundPrelude(s)),
  timber: await hashOf('tests/inputs/timber-baseline.rec', timberRecPrelude),
  timberf: await hashOf('tests/inputs/timberf-baseline.rec', timberFloatRecPrelude),
  kadet: await hashOf('tests/inputs/kadet-baseline.rec', (s) => kadetGroundPrelude(s)),
};
const names = Object.keys(got);
gate('S17', 'every other aircraft unmoved', names.every((k) => got[k] === u[k]),
  names.map((k) => got[k]).join(', '), names.map((k) => u[k]).join(', '));

const stickRec = await recOf('tests/inputs/f16-baseline.rec');
const stickOpts = { ...replayBase, prelude: (s) => f16GroundPrelude(s) };
const nodeHash = (await replayTrace(await loadSim(wasmBytes), stickRec, stickOpts)).slice(0, 16);
const nodeAgain = (await replayTrace(await loadSim(wasmBytes), stickRec, stickOpts)).slice(0, 16);
if (!findChrome()) {
  gate('S18', 'Node and Chrome agree', null, `node ${nodeHash} twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}, no Chrome here`, 'identical');
} else {
  const server = await startServer(root);
  try {
    const out = await runBrowserHarness(`${server.origin}/tests/browser/wing-harness.html?plane=f16`);
    const result = out.result || {};
    const chromeHash = result.ok ? String(result.hash).slice(0, 16) : `error: ${result.message || result.errorName || JSON.stringify(out).slice(0, 80)}`;
    gate('S18', 'Node and Chrome agree', nodeAgain === nodeHash && result.ok && chromeHash === nodeHash, `node ${nodeHash} (twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}), chrome ${chromeHash}`, 'identical');
  } finally {
    await server.close();
  }
}

console.log('');
for (const [id, name, measured, b, status] of rows) {
  console.log(`  ${status.padEnd(4)}  ${id.padEnd(4)} ${name.padEnd(50)} ${String(measured).padEnd(70)} ${b}`);
}
console.log(`\n${failed ? `${failed} FAILED, ` : ''}${rows.length - failed - skipped} of ${rows.length} gates hold${skipped ? `, ${skipped} SKIPPED (a skip is not a pass)` : ''}`);
process.exit(failed ? 1 : 0);
