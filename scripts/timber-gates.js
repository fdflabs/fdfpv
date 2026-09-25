/*
 * timber-gates.js: the Timber plant against the bands in
 * tests/timber-thresholds.json.
 *
 * Fifteen checks, T1 to T15, from docs/TIMBER-STAGE1.md, on the pattern of
 * cub-gates.js. T1 is the cruise; T2 to T4 the stall with and without the
 * slats and with full flaps, and their order; T5 the slowest level flight
 * the flaps and the throttle hold; T6 the roll; T7 the flaps' own lift and
 * pitching moment, and T8 the radio's mix that takes the moment out. T9
 * to T13 are the gear: standing on it, the take off roll with the flaps
 * full and up, a full flap landing's roll out, and the rudder steering on
 * the ground. T14 holds every other aircraft's recorded hash where it was
 * before the Timber existed; T15 flies the Timber's recorded take off in
 * Node and in headless Chrome and holds the two trace hashes equal. Bands
 * are never widened here: a plant outside one is a finding for the
 * derivation. Run with npm run timber:gates.
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
  TIMBER_AIRFRAME, fly, stallSpeed, wingDebug, wheelLoads, attitude, must, timberGroundPrelude, timberRecPrelude,
  timberTakeoffSticks, skyPrelude, wingPrelude, cubGroundPrelude, gliderRecPrelude, bramorPrelude,
  bramorChutePrelude, slowstickGroundPrelude, RC_STEP_MS,
} from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const th = JSON.parse(await readFile(join(root, 'tests/timber-thresholds.json'), 'utf8'));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const DEG = 180 / Math.PI;
const SPAN = 1.555;
const AREA = 0.361;
const CHORD = 0.2322;

async function timberSim() {
  const sim = await loadSim(wasmBytes);
  if (sim.init(configText) !== SIM_OK) throw new Error('sim_init failed');
  if (sim.e.sim_set_airframe(TIMBER_AIRFRAME) !== SIM_OK) throw new Error('sim_set_airframe failed');
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
const clamp1 = (x) => Math.max(-1, Math.min(1, x));
const levelRoll = (s) => clamp1(-1.2 * attitude(s).bank - 0.12 * s[11]);

/* The flaps' notch and the slats, each a mode the next reset keeps. */
function config(sim, { flaps = 0, slats = 1 } = {}) {
  must(sim.e.sim_wing_set_flaps(flaps), 'sim_wing_set_flaps');
  must(sim.e.sim_wing_set_slats(slats), 'sim_wing_set_slats');
}

/* A clock that keeps rising across the steps of one flight, and a step
 * that says whether the wheels carry the aircraft and whether the hull
 * touched. */
let clockMs = 0;
function step(sim, sticks) {
  must(sim.input(clockMs / 1000, ...sticks), 'sim_input');
  must(sim.step(RC_STEP_MS), 'sim_step');
  clockMs += RC_STEP_MS;
  const s = sim.readState().state;
  const loads = wheelLoads(sim);
  return { s, loads, loaded: loads.slice(0, 3).some((f) => f > 0), hull: sim.e.sim_ground_contacts() };
}
function onStrip(sim, flaps = 0) {
  must(sim.reset(), 'sim_reset');
  timberGroundPrelude(sim, { mu: GROUND_MU, e: GROUND_E, flaps });
  must(sim.reset(), 'sim_reset');
  timberGroundPrelude(sim, { mu: GROUND_MU, e: GROUND_E, flaps });
  clockMs = 0;
}

/* The inverse of the plant's stick shaping, 0.3 x^3 + 0.7 x, for a surface
 * angle as a fraction of its travel. */
function stickFor(frac) {
  const want = Math.abs(frac);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (0.3 * mid * mid * mid + 0.7 * mid < want) lo = mid;
    else hi = mid;
  }
  return Math.sign(frac) * lo;
}
const shape = (x) => 0.3 * x * x * x + 0.7 * x;

console.log('timber gates: the plant against docs/TIMBER-STAGE1.md');
const sim = await timberSim();
must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
check: {
  if (sim.e.sim_airframe() !== TIMBER_AIRFRAME) {
    gate('T0', 'the Timber is selected', false, `airframe ${sim.e.sim_airframe()}`, `${TIMBER_AIRFRAME}`);
    break check;
  }

  /* T1: level at 75 percent, flaps up, the slats on. */
  config(sim, { flaps: 0 });
  const t1 = fly(sim, { duty: th.t1_cruise.duty, vzTarget: 0, speed0: 16, seconds: 30 });
  gate('T1', 'cruise: level speed at 75 percent', within(t1.v, th.t1_cruise), `${t1.v.toFixed(2)} m/s, sink ${(-t1.vz).toFixed(2)}`, band(th.t1_cruise));

  /* T2 to T4: the stall, power off, the nose raised slowly. */
  config(sim, { flaps: 0, slats: 1 });
  const t2 = stallSpeed(sim, th.t2_stall_slats.alphaStall);
  config(sim, { flaps: 0, slats: 0 });
  const t3 = stallSpeed(sim, th.t3_stall_no_slats.alphaStall);
  config(sim, { flaps: 2, slats: 1 });
  const t4 = stallSpeed(sim, th.t4_stall_full_flap.alphaStall, { speed0: 11 });
  config(sim, { flaps: 0, slats: 1 });
  const f2 = (v) => (v == null ? 'no stall reached' : `${v.toFixed(2)} m/s`);
  gate('T2', 'stall, slats on, flaps up', t2 != null && within(t2, th.t2_stall_slats), f2(t2), band(th.t2_stall_slats));
  gate('T3', 'stall, slats off: faster than T2', t3 != null && t2 != null && within(t3, th.t3_stall_no_slats) && t3 > t2,
    `${f2(t3)}, ${t3 != null && t2 != null ? (t3 - t2).toFixed(2) : '?'} m/s over T2`, `${band(th.t3_stall_no_slats)}, over T2`);
  gate('T4', 'stall, full flaps: slower than T2', t4 != null && t2 != null && within(t4, th.t4_stall_full_flap) && t4 < t2,
    `${f2(t4)}, ${t4 != null && t2 != null ? (t2 - t4).toFixed(2) : '?'} m/s under T2`, `${band(th.t4_stall_full_flap)}, under T2`);

  /*
   * T5: the slowest level flight on full flaps. Speed held on the
   * elevator and height on the throttle, the wings level on the ailerons,
   * the speed asked for coming down 0.05 m/s every second from 9 m/s. The
   * slowest held is the speed flown over the last two seconds before the
   * height could no longer be held at full throttle, or the stall alpha
   * or 10 deg of bank was reached.
   */
  {
    config(sim, { flaps: 2 });
    must(sim.reset(), 'sim_reset');
    must(sim.e.sim_set_pose(0, 0, 60, 1, 0, 0, 0), 'sim_set_pose');
    must(sim.e.sim_wing_launch(9), 'sim_wing_launch');
    clockMs = 0;
    let trim = 0.05;
    let duty = 0.5;
    let iDuty = 0;
    let o = { s: sim.readState().state };
    const hist = [];
    let held = null;
    let why = 'held to the end';
    let worstBank = 0;
    for (let ms = 0; ms < 90000; ms += RC_STEP_MS) {
      const vT = Math.max(4.5, 9 - 0.05 * ms / 1000);
      const s = o.s;
      const v = speed(s);
      const { pitch } = attitude(s);
      trim = Math.max(-0.3, Math.min(0.6, trim + 0.00004 * (v - vT)));
      const pitchT = Math.max(-0.3, Math.min(0.6, 0.06 * (v - vT) + trim));
      const pitchStick = clamp1(3 * (pitchT - pitch) - 0.3 * -s[12]);
      iDuty = Math.max(-1, Math.min(1, iDuty + 0.4 * (0 - s[6]) * RC_STEP_MS / 1000));
      duty = Math.max(0, Math.min(1, 0.5 + 0.4 * (0 - s[6]) + iDuty));
      o = step(sim, [levelRoll(s), pitchStick, 0, duty]);
      const alpha = wingDebug(sim)[0];
      const b = Math.abs(fullBank(o.s)) * DEG;
      worstBank = Math.max(worstBank, b);
      hist.push({ ms, v: speed(o.s), vz: o.s[6], duty });
      if (ms > 10000) {
        const win = hist.filter((h) => h.ms > ms - 2000);
        const vz = win.reduce((a, h) => a + h.vz, 0) / win.length;
        const lost = vz < -0.3 && win.every((h) => h.duty >= 0.999);
        if (lost || alpha > th.t4_stall_full_flap.alphaStall || b > 10) {
          held = win.reduce((a, h) => a + h.v, 0) / win.length;
          why = lost ? `sinking ${(-vz).toFixed(2)} m/s at full throttle` : (b > 10 ? `bank ${b.toFixed(0)} deg` : `alpha ${(alpha * DEG).toFixed(1)} deg`);
          break;
        }
      }
    }
    if (held === null) held = hist[hist.length - 1].v;
    gate('T5', 'slowest level flight, full flaps', within(held, th.t5_slowest) && worstBank <= 10,
      `${held.toFixed(2)} m/s, then ${why}, bank under ${worstBank.toFixed(1)} deg`, `${band(th.t5_slowest)} m/s, wings within 10 deg`);
  }

  /* T6: full right aileron from level at full throttle: the peak roll
   * rate as pb/2V. */
  {
    config(sim, { flaps: 0 });
    const r = fly(sim, { duty: th.t6_roll.duty, speed0: 20, vzTarget: 0, seconds: 8 });
    let peak = 0;
    let vAt = r.v;
    for (let ms = 0; ms < 1500; ms += RC_STEP_MS) {
      must(sim.input((r.endMs + ms) / 1000, 1, 0, 0, th.t6_roll.duty), 'sim_input');
      must(sim.step(RC_STEP_MS), 'sim_step');
      const s = sim.readState().state;
      if (Math.abs(s[11]) > Math.abs(peak)) {
        peak = s[11];
        vAt = speed(s);
      }
    }
    const pb2v = Math.abs(peak) * SPAN / (2 * vAt);
    gate('T6', 'roll rate, full aileron, pb/2V', within(pb2v, th.t6_roll) && peak > 0, `${pb2v.toFixed(3)}: ${(Math.abs(peak) * DEG).toFixed(0)} deg/s at ${vAt.toFixed(1)} m/s${peak > 0 ? '' : ', WRONG WAY'}`, band(th.t6_roll));
  }

  /*
   * T7: one step at level flight, flaps up and then full at the same
   * state: the lift and the pitching moment they add, the elevator the
   * mix moves taken back out through the plant's own Cm_de and CL_de,
   * which are the table's.
   */
  {
    const t7 = th.t7_flap_pitch;
    const at = (flaps) => {
      config(sim, { flaps });
      must(sim.reset(), 'sim_reset');
      must(sim.e.sim_set_pose(0, 0, 50, 1, 0, 0, 0), 'sim_set_pose');
      must(sim.e.sim_wing_launch(t7.speed), 'sim_wing_launch');
      must(sim.input(0, 0, 0, 0, 0.5), 'sim_input');
      must(sim.step(1), 'sim_step');
      const d = wingDebug(sim);
      return { cm: d[6] / (d[2] * AREA * CHORD), cl: d[3], de: d[18], alpha: d[0], flap: sim.e.sim_wing_flaps() };
    };
    const up = at(0);
    const full = at(2);
    config(sim, { flaps: 0 });
    const dDe = full.de - up.de;
    const dCm = full.cm - up.cm - 1.175 * dDe;
    const dCl = full.cl - up.cl - -0.498 * dDe;
    gate('T7', 'the flaps\' lift and pitching moment', dCm >= t7.cmMin && dCm <= t7.cmMax && dCl >= t7.clMin && dCl <= t7.clMax && Math.abs(full.alpha - up.alpha) < 1e-9,
      `dCm ${dCm.toFixed(4)} ${dCm > 0 ? 'nose up' : 'NOSE DOWN'}, dCL ${dCl.toFixed(3)} at ${(full.flap * DEG).toFixed(1)} deg, the mix ${(dDe * DEG).toFixed(2)} deg of elevator`,
      `dCm ${t7.cmMin} to ${t7.cmMax} nose up, dCL ${t7.clMin} to ${t7.clMax}`);
  }

  /*
   * T8: level at 65 percent in Manual, then the sticks frozen and the
   * flaps lowered to full: the nose's rise over the next 4 s, with the
   * manual's mix, and with it taken back out on the pitch stick.
   */
  {
    const t8 = th.t8_flap_mix;
    const rise = (unmix) => {
      config(sim, { flaps: 0 });
      const r = fly(sim, { duty: t8.duty, vzTarget: 0, speed0: 15, seconds: 20 });
      clockMs = r.endMs;
      /* The pitch stick the loop last held. */
      const s0 = sim.readState().state;
      const stick0 = stickFor(wingDebug(sim)[18] / (20 / DEG));
      const pitch0 = attitude(s0).pitch;
      const z0 = s0[3];
      must(sim.e.sim_wing_set_flaps(2), 'sim_wing_set_flaps');
      let peak = 0;
      let o = null;
      for (let ms = 0; ms < 4000; ms += RC_STEP_MS) {
        const flap = sim.e.sim_wing_flaps();
        const mix = -0.183531 * flap / (20 / DEG);
        const stick = unmix ? stickFor(shape(stick0) - mix) : stick0;
        o = step(sim, [levelRoll(sim.readState().state), stick, 0, t8.duty]);
        peak = Math.max(peak, attitude(o.s).pitch - pitch0);
      }
      config(sim, { flaps: 0 });
      return { peak: peak * DEG, dz: o.s[3] - z0 };
    };
    const mixed = rise(false);
    const bare = rise(true);
    const ratio = mixed.peak / bare.peak;
    gate('T8', 'the radio\'s mix takes the flaps\' pitch out', bare.peak > 0 && ratio < t8.maxRatio,
      `nose up ${mixed.peak.toFixed(1)} deg with the mix, ${bare.peak.toFixed(1)} without, ratio ${ratio.toFixed(2)}; height ${mixed.dz.toFixed(1)} and ${bare.dz.toFixed(1)} m`,
      `ratio under ${t8.maxRatio}`);
  }

  /* T9: standing on its wheels on the strip. */
  let rest = null;
  {
    const r9 = th.t9_rest;
    onStrip(sim, 0);
    let hull = 0;
    let o = null;
    for (let ms = 0; ms < 3000; ms += RC_STEP_MS) {
      o = step(sim, [0, 0, 0, 0]);
      hull = Math.max(hull, o.hull);
    }
    rest = { pitch: attitude(o.s).pitch * DEG, z: o.s[3], tail: o.loads[2] / (o.loads[0] + o.loads[1] + o.loads[2]) };
    gate('T9', 'standing on its wheels', rest.pitch >= r9.pitchMin && rest.pitch <= r9.pitchMax && rest.z >= r9.zMin && rest.z <= r9.zMax && rest.tail >= r9.tailMin && rest.tail <= r9.tailMax && hull === 0 && Math.hypot(o.s[4], o.s[5]) < 0.01,
      `${rest.pitch.toFixed(2)} deg, CG ${rest.z.toFixed(4)} m, tail ${(rest.tail * 100).toFixed(1)} percent, loads ${o.loads.map((f) => f.toFixed(2)).join(' ')} N, hull ${hull}`,
      `${r9.pitchMin} to ${r9.pitchMax} deg, ${r9.zMin} to ${r9.zMax} m, ${r9.tailMin * 100} to ${r9.tailMax * 100} percent, no hull`);
  }

  /* T10, T11: the take off from rest, timberTakeoffSticks' pilot; liftoff
   * the last step on the wheels before 200 ms clear of them. */
  const takeoff = (flaps) => {
    onStrip(sim, flaps);
    for (let ms = 0; ms < 1000; ms += RC_STEP_MS) step(sim, [0, 0, 0, 0]);
    const x0 = sim.readState().state[1];
    let last = null;
    let off = 0;
    let o = { s: sim.readState().state };
    let tip = 0;
    for (let ms = 0; ms < 8000; ms += RC_STEP_MS) {
      o = step(sim, timberTakeoffSticks(o.s));
      tip = Math.max(tip, o.loads[3]);
      if (o.loaded) {
        last = { dist: o.s[1] - x0, v: speed(o.s), t: ms / 1000, pitch: attitude(o.s).pitch * DEG, heading: heading(o.s) * DEG, tip };
        off = 0;
      } else {
        off += RC_STEP_MS;
        if (off >= 200) return last;
      }
    }
    return null;
  };
  const t10 = takeoff(th.t10_takeoff_full.flaps);
  const t11 = takeoff(th.t11_takeoff_up.flaps);
  const roll = (r, b) => r != null && r.dist >= b.distMin && r.dist <= b.distMax && r.v >= b.vMin && r.v <= b.vMax && r.tip === 0;
  const says = (r) => (r == null ? 'never left the ground' : `${r.dist.toFixed(2)} m to liftoff at ${r.v.toFixed(2)} m/s, ${r.t.toFixed(2)} s, pitch ${r.pitch.toFixed(1)}, heading ${r.heading.toFixed(1)} deg${r.tip ? ', PROP STRUCK' : ''}`);
  const bands = (b) => `${b.distMin} to ${b.distMax} m, ${b.vMin} to ${b.vMax} m/s`;
  gate('T10', 'take off roll, full flaps', roll(t10, th.t10_takeoff_full), says(t10), bands(th.t10_takeoff_full));
  const ratio11 = t10 && t11 ? t10.dist / t11.dist : null;
  gate('T11', 'take off roll, flaps up: longer', roll(t11, th.t11_takeoff_up) && ratio11 != null && ratio11 < th.t11_takeoff_up.maxRatio,
    `${says(t11)}; full flaps ${ratio11 == null ? '?' : ratio11.toFixed(2)} of it`, `${bands(th.t11_takeoff_up)}, the full flap roll under ${th.t11_takeoff_up.maxRatio} of it`);

  /*
   * T12: a full flap landing. From 4 m at 8 m/s, a powered approach at a
   * held 2 deg of pitch at 30 percent, a flare to 11 deg at half a metre
   * with the throttle closed, and on the wheels full up stick to hold the
   * tail down through the roll out, the manual's grass landing. The roll
   * is from the first touch to rest.
   */
  {
    const t12 = th.t12_landing;
    must(sim.reset(), 'sim_reset');
    timberGroundPrelude(sim, { mu: GROUND_MU, e: GROUND_E, flaps: 2 });
    must(sim.reset(), 'sim_reset');
    timberGroundPrelude(sim, { mu: GROUND_MU, e: GROUND_E, flaps: 2 });
    must(sim.e.sim_set_pose(0, 0, 4, 1, 0, 0, 0), 'sim_set_pose');
    must(sim.e.sim_wing_launch(8), 'sim_wing_launch');
    clockMs = 0;
    let touched = null;
    let hull = 0;
    let bounces = 0;
    let was = false;
    let o = { s: sim.readState().state, loaded: false, loads: [0, 0, 0, 0] };
    for (let ms = 0; ms < 20000; ms += RC_STEP_MS) {
      const { pitch } = attitude(o.s);
      let sticks;
      if (touched !== null) {
        sticks = [levelRoll(o.s), 1, 0, 0];
      } else if (o.s[3] > 0.7) {
        sticks = [levelRoll(o.s), clamp1(3 * (2 / DEG - pitch) + 0.3 * o.s[12]), 0, 0.3];
      } else {
        sticks = [levelRoll(o.s), clamp1(3 * (11 / DEG - pitch) + 0.3 * o.s[12]), 0, 0];
      }
      o = step(sim, sticks);
      if (o.loaded && touched === null) touched = { v: speed(o.s), vg: Math.hypot(o.s[4], o.s[5]), vz: o.s[6], x: o.s[1] };
      if (o.loaded && !was && touched !== null && ms > 0) bounces += 1;
      was = o.loaded;
      if (touched !== null) hull = Math.max(hull, o.hull + (o.loads[3] > 0 ? 1 : 0));
    }
    const land = { pitch: attitude(o.s).pitch * DEG, v: Math.hypot(o.s[4], o.s[5]), roll: touched ? o.s[1] - touched.x : 0 };
    gate('T12', 'landing roll, full flaps, no brakes', touched !== null && land.v < 0.05 && land.roll >= t12.distMin && land.roll <= t12.distMax && Math.abs(land.pitch - rest.pitch) <= t12.pitchTolDeg && hull === 0 && o.loads.slice(0, 3).every((f) => f > 0),
      touched === null ? 'never touched down' : `touched at ${touched.vg.toFixed(2)} m/s over the ground sinking ${(-touched.vz).toFixed(2)}, ${bounces} contact${bounces === 1 ? '' : 's'}, rolled ${land.roll.toFixed(1)} m, at rest at ${land.pitch.toFixed(2)} deg, hull or prop ${hull}`,
      `${t12.distMin} to ${t12.distMax} m, at rest within ${t12.pitchTolDeg} deg of T9, no hull or prop`);
  }

  /* T13: full right rudder at walking pace: the radius from the speed and
   * the heading rate over the last two of five seconds. */
  {
    const t13 = th.t13_taxi;
    onStrip(sim, 0);
    for (let ms = 0; ms < 2000; ms += RC_STEP_MS) step(sim, [0, 0, 0, t13.duty]);
    let h0 = null;
    let vSum = 0;
    let n = 0;
    let all = true;
    let o = null;
    for (let ms = 0; ms < 5000; ms += RC_STEP_MS) {
      o = step(sim, [0, 0, 1, t13.duty]);
      all = all && o.loads.slice(0, 3).every((f) => f > 0);
      if (ms === 3000) h0 = heading(o.s);
      if (ms > 3000) { vSum += speed(o.s); n += 1; }
    }
    let dh = heading(o.s) - h0;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    const radius = (vSum / n) / Math.abs(dh / 1.996);
    gate('T13', 'the rudder steers on the ground', dh < 0 && within(radius, t13) && all,
      `${radius.toFixed(2)} m at ${(vSum / n).toFixed(2)} m/s, ${dh < 0 ? 'turning right' : 'WRONG WAY'}${all ? '' : ', a wheel lifted'}`, `${band(t13)} m, turning right`);
  }
}
config(sim, { flaps: 0, slats: 1 });

const quadTh = JSON.parse(await readFile(join(root, 'tests/thresholds.json'), 'utf8'));
const replayBase = { configText, renderHz: quadTh.replay.canonical_render_hz.value, traceStrideMs: quadTh.replay.trace_stride_ms.value };
const recOf = async (f) => decodeRec(new Uint8Array(await readFile(join(root, f))));
const hashOf = async (f, prelude) => (await replayTrace(await loadSim(wasmBytes), await recOf(f), { ...replayBase, prelude })).slice(0, 16);
const u = th.t14_unmoved;
const got = {
  quad: await hashOf('tests/inputs/baseline.rec', undefined),
  wing: await hashOf('tests/inputs/wing-baseline.rec', wingPrelude),
  sky: await hashOf('tests/inputs/sky-baseline.rec', skyPrelude),
  cub: await hashOf('tests/inputs/cub-baseline.rec', (s) => cubGroundPrelude(s)),
  glider: await hashOf('tests/inputs/glider-baseline.rec', gliderRecPrelude),
  bramor: await hashOf('tests/inputs/bramor-baseline.rec', bramorPrelude),
  bramorChute: await hashOf('tests/inputs/bramor-chute.rec', bramorChutePrelude),
  slowstick: await hashOf('tests/inputs/slowstick-baseline.rec', (s) => slowstickGroundPrelude(s)),
};
const names = Object.keys(got);
gate('T14', 'every other aircraft unmoved', names.every((kk) => got[kk] === u[kk]),
  names.map((kk) => got[kk]).join(', '), names.map((kk) => u[kk]).join(', '));

const rec = await recOf('tests/inputs/timber-baseline.rec');
const opts = { ...replayBase, prelude: timberRecPrelude };
const nodeHash = (await replayTrace(await loadSim(wasmBytes), rec, opts)).slice(0, 16);
const nodeAgain = (await replayTrace(await loadSim(wasmBytes), rec, opts)).slice(0, 16);
if (!findChrome()) {
  gate('T15', 'Node and Chrome agree', null, `node ${nodeHash} twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}, no Chrome here`, 'identical');
} else {
  const server = await startServer(root);
  try {
    const out = await runBrowserHarness(`${server.origin}/tests/browser/wing-harness.html?plane=timber`);
    const result = out.result || {};
    const chromeHash = result.ok ? String(result.hash).slice(0, 16) : `error: ${result.message || result.errorName || JSON.stringify(out).slice(0, 80)}`;
    gate('T15', 'Node and Chrome agree', nodeAgain === nodeHash && result.ok && chromeHash === nodeHash, `node ${nodeHash} (twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}), chrome ${chromeHash}`, 'identical');
  } finally {
    await server.close();
  }
}

console.log('');
for (const [id, name, measured, b, status] of rows) {
  console.log(`  ${status.padEnd(4)}  ${id.padEnd(4)} ${name.padEnd(42)} ${String(measured).padEnd(74)} ${b}`);
}
console.log(`\n${failed ? `${failed} FAILED, ` : ''}${rows.length - failed - skipped} of ${rows.length} gates hold${skipped ? `, ${skipped} SKIPPED (a skip is not a pass)` : ''}`);
process.exit(failed ? 1 : 0);
