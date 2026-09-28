/*
 * p51-gates.js: FMS's 1450 mm P-51D Mustang plant against the bands in
 * tests/p51-thresholds.json.
 *
 * Checks P1 to P18 from docs/P51-STAGE1.md, on the pattern of
 * kadet-gates.js and timber-gates.js. P1 to P7 are its performance: the
 * cruise, the stall clean and with full flap, the glide, the top speed
 * with the gear up and what the gear costs, the climb, the roll, and the
 * energy it keeps with the throttle closed. P8 is the wing drop at the
 * stall, P9 the phugoid, P10 to P12 the prop's torque, P factor and
 * gyroscopic moment each against its formula, P13 to P15 the taildragger:
 * standing on three points, a take off with the heading held on the
 * rudder (which takes right rudder), and the swing to the left when the
 * rudder is left alone. P16 to P18 the retracts and the approach: the
 * gear's travel, a landing with the gear up on the belly, and a landing
 * with full flap at the approach speed. Flown in Manual, so it is the
 * airframe doing it. S17 holds every other aircraft's recorded hash where
 * it was before this one existed, and S18 flies the P-51's recording in
 * Node and in headless Chrome and holds the two hashes equal. Bands are
 * never widened here: a plant outside one is a finding for the
 * derivation. Run with npm run p51:gates.
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
  P51_AIRFRAME, p51GroundPrelude, p51RecPrelude, p51AirPrelude, p51TakeoffSticks, fly, wingDebug, wheelLoads, attitude, must, bombshellGroundPrelude,
  slowstickGroundPrelude, skyPrelude, kadetGroundPrelude,
  wingPrelude, cubGroundPrelude, gliderRecPrelude, bramorPrelude, bramorChutePrelude, timberRecPrelude,
  timberFloatRecPrelude, RC_STEP_MS,
} from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const th = JSON.parse(await readFile(join(root, 'tests/p51-thresholds.json'), 'utf8'));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const DEG = 180 / Math.PI;

async function p51Sim() {
  const sim = await loadSim(wasmBytes);
  if (sim.init(configText) !== SIM_OK) throw new Error('sim_init failed');
  if (sim.e.sim_set_airframe(P51_AIRFRAME) !== SIM_OK) throw new Error('sim_set_airframe failed');
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

/* Flights start 600 m to the side of the field, in still air, the stall
 * guard off: a P-51 cruises at one and a half times its stall, where the
 * guard's 9.5 m/s is no guard. Thrown at its cruise. */
const STILL_AIR = [0, 600, 0, 1, 0, 0, 0];
const slow = { guard: false, speed0: 15, start: STILL_AIR };

/* A clock that keeps rising across the steps of one flight. */
let clockMs = 0;
function step(sim, sticks) {
  must(sim.input(clockMs / 1000, ...sticks), 'sim_input');
  must(sim.step(RC_STEP_MS), 'sim_step');
  clockMs += RC_STEP_MS;
  const s = sim.readState().state;
  const loads = wheelLoads(sim);
  return { s, loads, loaded: loads.slice(0, 3).some((f) => f > 0), hull: sim.e.sim_ground_contacts() };
}
/* The gear up and settled, as a pilot has it once clear of the field. fly()
 * resets the aircraft, which lowers the gear, so this runs inside its first
 * step; the gear's own travel is P16's. */
const gearUp = (sim) => (o) => {
  if (o.ms === 0) {
    must(sim.e.sim_wing_set_gear(1), 'sim_wing_set_gear');
  }
};
function flyUp(sim, opts) {
  must(sim.e.sim_wing_set_gear(1), 'sim_wing_set_gear');
  const inner = opts.onStep;
  return fly(sim, { ...opts, onStep: (o) => { gearUp(sim)(o); if (inner) inner(o); } });
}

console.log('p51 gates: the plant against docs/P51-STAGE1.md');
const sim = await p51Sim();
must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
check: {
  if (sim.e.sim_airframe() !== P51_AIRFRAME) {
    gate('P0', 'the P-51 is selected', false, `airframe ${sim.e.sim_airframe()}`, `${P51_AIRFRAME}`);
    break check;
  }

  /* P1: level at three quarter throttle, the gear up, the cruise it is
   * trimmed for. */
  const p1 = flyUp(sim, { duty: th.p1_level_75.duty, vzTarget: 0, seconds: 40, ...slow });
  gate('P1', 'cruise: level at 75 percent, gear up', within(p1.v, th.p1_level_75), `${p1.v.toFixed(2)} m/s, sink ${(-p1.vz).toFixed(2)}`, band(th.p1_level_75));

  /* P2: the stall, power off, the nose raised slowly: the speed when alpha
   * reaches the stall's; clean and with full flap. */
  for (const [id, t2, flaps] of [['P2a', th.p2_stall, 0], ['P2b', th.p2_stall_flaps, 2]]) {
    must(sim.e.sim_wing_set_flaps(flaps), 'sim_wing_set_flaps');
    let stallV = null;
    fly(sim, {
      duty: 0, speed0: 14, seconds: 14, pitchMax: 0.7, pitchMin: -0.3, guard: false, start: STILL_AIR,
      pitchTargetFn: (ms) => Math.min(0.6, 0.06 * ms / 1000),
      onStep: (o) => { if (stallV == null && o.ms > 1000 && wingDebug(sim)[0] > t2.alphaStall) stallV = o.v; },
    });
    gate(id, `stall speed, power off, ${flaps ? 'full flap' : 'clean'}`, stallV != null && within(stallV, t2), stallV == null ? 'no stall reached' : `${stallV.toFixed(2)} m/s`, band(t2));
  }
  must(sim.e.sim_wing_set_flaps(0), 'sim_wing_set_flaps');

  /* P3: the glide at 13 m/s, gear up, power off. */
  const g3 = flyUp(sim, { duty: 0, vTarget: th.p3_glide.speed, seconds: 30, ...slow, speed0: th.p3_glide.speed });
  const ratio = Math.sqrt(Math.max(0, g3.v * g3.v - g3.vz * g3.vz)) / -g3.vz;
  gate('P3', 'glide ratio, power off, gear up', within(ratio, th.p3_glide), `${ratio.toFixed(2)} at ${g3.v.toFixed(2)} m/s, sink ${(-g3.vz).toFixed(2)}`, band(th.p3_glide));

  /* P4: top speed with the gear up, and what hanging it costs. */
  const s4 = flyUp(sim, { duty: 1, vzTarget: 0, seconds: 90, ...slow, speed0: 20 });
  const s4d = fly(sim, { duty: 1, vzTarget: 0, seconds: 90, ...slow, speed0: 20 });
  gate('P4', 'top speed, level, gear up', within(s4.v, th.p4_top) && Math.abs(s4.vz) < 0.2, `${s4.v.toFixed(2)} m/s, climb ${s4.vz.toFixed(2)}`, band(th.p4_top));
  const dv = s4.v - s4d.v;
  gate('P4b', 'the gear down costs speed', within(dv, th.p4_gear_delta), `${dv.toFixed(3)} m/s (down ${s4d.v.toFixed(2)})`, band(th.p4_gear_delta));

  /* P5: the best climb, full throttle, gear up. */
  let best = null;
  for (const vT of th.p5_climb.speeds) {
    const r = flyUp(sim, { duty: 1, speed0: vT, vTarget: vT, seconds: 25, pitchMax: 1.2, pitchMin: -0.5, trimMax: 1.0, guard: false, start: STILL_AIR });
    if (!best || r.vz > best.vz) best = { v: r.v, vz: r.vz, pitchDeg: r.pitch * DEG };
  }
  gate('P5', 'best climb, full throttle', within(best.vz, th.p5_climb), `${best.vz.toFixed(2)} m/s at ${best.v.toFixed(1)} m/s, pitch ${best.pitchDeg.toFixed(0)} deg`, band(th.p5_climb));

  /* P6: full aileron from level at 18 m/s, the steady roll as pb/2V, the
   * helix angle, over the second half second to the first full turn. */
  {
    const t6 = th.p6_roll;
    const r = flyUp(sim, { duty: 1, vzTarget: 0, seconds: 20, ...slow, speed0: t6.speed });
    clockMs = r.endMs;
    let peak = 0;
    let v = 0;
    for (let ms = 0; ms < 1500; ms += RC_STEP_MS) {
      const o = step(sim, [1, 0, 0, 1]);
      if (ms >= 500) {
        peak = Math.max(peak, o.s[11] * 1.450 / (2 * speed(o.s)));
        v = speed(o.s);
      }
    }
    gate('P6', 'full aileron roll, pb/2V', within(peak, t6), `${peak.toFixed(4)}, ${(peak * 2 * v / 1.45 * DEG).toFixed(0)} deg/s at ${v.toFixed(1)} m/s, right wing down`, band(t6));
  }

  /* P7: energy. Level at full throttle, gear up, then the throttle closed
   * and the height held: the speed after 3 s. The Kadet Senior in the
   * same coast from its top speed is down to its derived 12.7 m/s. */
  {
    const t7 = th.p7_coast;
    const r = flyUp(sim, { duty: 1, vzTarget: 0, seconds: 60, ...slow, speed0: 20 });
    clockMs = r.endMs;
    const v0 = speed(sim.readState().state);
    let trim = 0;
    let o = null;
    for (let ms = 0; ms < t7.seconds * 1000; ms += RC_STEP_MS) {
      const s = sim.readState().state;
      const { pitch, bank } = attitude(s);
      trim = Math.max(-0.2, Math.min(0.3, trim + 0.0004 * (0 - s[6])));
      const pitchT = Math.max(-0.2, Math.min(0.3, 0.05 * (0 - s[6]) + trim));
      const roll = Math.max(-1, Math.min(1, -1.2 * bank - 0.12 * s[11]));
      o = step(sim, [roll, Math.max(-1, Math.min(1, 2.5 * (pitchT - pitch) + 0.25 * s[12])), 0, 0]);
    }
    const v3 = speed(o.s);
    gate('P7', 'throttle closed from top speed: the speed kept', within(v3, t7), `${v3.toFixed(2)} m/s after ${t7.seconds} s from ${v0.toFixed(2)}, height ${(o.s[3] - sim.readState().state[3]).toFixed(1)}, Kadet ${t7.kadet}`, band(t7));
  }

  /* P8: the stall with full up held, power off, from level at 1.2 Vs:
   * the outer wing stalls first and a wing drops. */
  {
    const t8 = th.p8_stall_drop;
    clockMs = flyUp(sim, { duty: 0.4, vTarget: t8.entry, seconds: 25, guard: false, speed0: t8.entry, start: STILL_AIR }).endMs;
    let brk = null;
    let worst = 0;
    let side = 0;
    for (let ms = 0; ms < t8.seconds * 1000; ms += RC_STEP_MS) {
      const o = step(sim, [0, Math.min(1, ms / 2000), 0, 0]);
      if (brk === null && wingDebug(sim)[0] > th.p2_stall.alphaStall) brk = ms;
      const b = fullBank(o.s) * DEG;
      if (brk !== null && ms - brk <= t8.withinS * 1000 && Math.abs(b) > Math.abs(worst)) {
        worst = b;
        side = Math.sign(b);
      }
    }
    gate('P8', 'full up, power off: a wing drops at the stall', brk !== null && Math.abs(worst) >= t8.minBankDeg,
      brk === null ? 'never stalled' : `${Math.abs(worst).toFixed(1)} deg, ${side < 0 ? 'left' : 'right'} wing down, within ${t8.withinS} s of the break at ${(brk / 1000).toFixed(2)} s`,
      `at least ${t8.minBankDeg} deg within ${t8.withinS} s`);
  }

  /*
   * P19: the owner's stall, a slow pull. Level at 15.6 m/s with the gear
   * up, the throttle closed and the elevator run linearly to full over 8
   * s, ailerons and rudder centred. The roll off is timed from its onset,
   * the first moment the helix angle pb/2V passes 0.02, a quarter of the
   * reference's peak; in the second after it, the first roll's peak
   * pb/2V and the bank it takes. The reference is the XP-51's clean wing
   * gliding stall with the controls fixed (NACA, White, Hoover and Garris
   * 1943, fig. 42): 0.55 rad/s at 88 mph on its 37 ft span, 0.079, and 39
   * deg of bank in the time its first 1.76 s is at the kit's span and
   * speed (b/V), both read off the scan and banded by half again either
   * way. docs/P51-STAGE1.md.
   */
  {
    const t19 = th.p19_slow_pull;
    clockMs = flyUp(sim, { duty: 0.8, vTarget: t19.entry, seconds: 30, guard: false, speed0: t19.entry, start: STILL_AIR }).endMs;
    const rows = [];
    for (let ms = 0; ms < 11000; ms += RC_STEP_MS) {
      const o = step(sim, [0, Math.min(1, ms / (t19.rampS * 1000)), 0, 0]);
      rows.push({ ms, bank: fullBank(o.s) * DEG, p: o.s[11], v: speed(o.s) });
    }
    const helix = (x) => x.p * 1.450 / (2 * x.v);
    const on = rows.find((x) => Math.abs(helix(x)) > t19.onsetPb2v);
    let peak = 0;
    let bankMax = 0;
    if (on) {
      const sg = Math.sign(on.p);
      for (const x of rows.filter((r) => r.ms >= on.ms && r.ms <= on.ms + 1000)) {
        peak = Math.max(peak, sg * helix(x));
        bankMax = Math.max(bankMax, Math.abs(x.bank - on.bank));
      }
    }
    gate('P19', 'slow pull to full up over 8 s: the wing drops sharply', on !== undefined && peak >= t19.min && peak <= t19.max && bankMax >= t19.bankMin && bankMax <= t19.bankMax,
      on === undefined ? 'no roll off' : `onset ${(on.ms / 1000).toFixed(2)} s at ${on.v.toFixed(2)} m/s, ${on.p < 0 ? 'left' : 'right'} wing; first 1 s: peak pb/2V ${peak.toFixed(4)} (${(peak * 2 * on.v / 1.45 * DEG).toFixed(0)} deg/s), bank ${bankMax.toFixed(1)} deg`,
      `pb/2V ${band(t19)}, bank ${t19.bankMin} to ${t19.bankMax} deg (XP-51: ${t19.reference}, ${t19.bankRef})`);
  }

  /* P9: the phugoid, level cruise at 75 percent, gear up, a second of a
   * little up stick, then hands off with the wings held level. */
  {
    clockMs = flyUp(sim, { duty: 0.75, vzTarget: 0, seconds: 20, ...slow }).endMs;
    const vs = [];
    for (let ms = 0; ms < 50000; ms += RC_STEP_MS) {
      const s = sim.readState().state;
      const roll = Math.max(-1, Math.min(1, -1.2 * attitude(s).bank - 0.12 * s[11]));
      const o = step(sim, [roll, ms < 1000 ? 0.15 : 0, 0, 0.75]);
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
    gate('P9', 'phugoid period', period != null && within(period, th.p9_phugoid), period == null ? `no oscillation, swing ${swing.toFixed(2)} m/s` : `${period.toFixed(2)} s over ${ups.length - 1} cycles, swing ${swing.toFixed(2)} m/s about ${mean.toFixed(2)}`, band(th.p9_phugoid));
  }

  /* P10: one step from rest at full throttle; the roll moment is the
   * motor's alone. */
  {
    must(sim.reset(), 'sim_reset');
    must(sim.e.sim_set_pose(0, 0, 50, 1, 0, 0, 0), 'sim_set_pose');
    must(sim.input(0, 0, 0, 0, 1), 'sim_input');
    must(sim.step(1), 'sim_step');
    const d = wingDebug(sim);
    gate('P10', 'prop torque, static full throttle', d[12] < 0 && within(-d[12], th.p10_prop_torque), `${(-d[12]).toFixed(4)} N m ${d[12] < 0 ? 'rolling left' : 'WRONG WAY'} at ${d[8].toFixed(2)} N`, `${band(th.p10_prop_torque)} N m, rolling left`);
  }

  /* P11: P factor. Flying level at 8 m/s with the nose 10 deg up, one step
   * at full throttle: the yaw moment less the airframe's own aero is
   * kappa T (-w) / Omega, nose left. */
  {
    const t11 = th.p11_pfactor;
    must(sim.reset(), 'sim_reset');
    const h = t11.pitchDeg / DEG / 2;
    must(sim.e.sim_set_pose(0, 600, 50, Math.cos(h), 0, -Math.sin(h), 0), 'sim_set_pose');
    must(sim.e.sim_set_velocity(t11.speed, 0, 0, 0, 0, 0), 'sim_set_velocity');
    must(sim.input(0, 0, 0, 0, 1), 'sim_input');
    must(sim.step(1), 'sim_step');
    const d = wingDebug(sim);
    const s = sim.readState().state;
    const omega = s[14] * 2 * Math.PI / 60;
    const want = 1.6 * d[8] * -d[17] / omega;
    const got = d[14] + d[7];
    gate('P11', 'P factor, climbing at full throttle', got > 0 && Math.abs(got / want - 1) <= t11.tolerance,
      `${got.toFixed(5)} N m nose left, formula ${want.toFixed(5)} at ${d[8].toFixed(2)} N, -w ${(-d[17]).toFixed(3)} m/s`, `within ${t11.tolerance * 100} percent, nose left`);
  }

  /* P12: the prop as a gyroscope. Standing still in the air at full
   * throttle, the nose pitching down at q: the yaw moment is J Omega q,
   * nose left, as a tail coming up on the take off roll gives it. */
  {
    const t12 = th.p12_gyro;
    must(sim.reset(), 'sim_reset');
    must(sim.e.sim_set_pose(0, 600, 50, 1, 0, 0, 0), 'sim_set_pose');
    must(sim.e.sim_set_velocity(0, 0, 0, 0, t12.q, 0), 'sim_set_velocity');
    must(sim.input(0, 0, 0, 0, 1), 'sim_input');
    must(sim.step(1), 'sim_step');
    const d = wingDebug(sim);
    const s = sim.readState().state;
    const want = 0.001170 * (s[14] * 2 * Math.PI / 60) * t12.q;
    gate('P12', 'the prop\'s gyroscopic yaw, tail coming up', d[14] > 0 && Math.abs(d[14] / want - 1) <= t12.tolerance,
      `${d[14].toFixed(5)} N m nose left at q ${t12.q} rad/s, formula ${want.toFixed(5)}`, `within ${t12.tolerance * 100} percent, nose left`);
  }

  /* P13: standing on its three wheels on the strip. */
  const onStrip = (flaps = 0) => {
    must(sim.reset(), 'sim_reset');
    p51GroundPrelude(sim, { mu: GROUND_MU, e: GROUND_E, flaps });
    clockMs = 0;
  };
  let rest = null;
  {
    const r13 = th.p13_rest;
    onStrip();
    let hull = 0;
    let o = null;
    for (let ms = 0; ms < 3000; ms += RC_STEP_MS) {
      o = step(sim, [0, 0, 0, 0]);
      hull = Math.max(hull, o.hull);
    }
    rest = { pitch: attitude(o.s).pitch * DEG, z: o.s[3], tail: o.loads[2] / (o.loads[0] + o.loads[1] + o.loads[2]) };
    gate('P13', 'standing on three points', rest.pitch >= r13.pitchMin && rest.pitch <= r13.pitchMax && rest.z >= r13.zMin && rest.z <= r13.zMax && rest.tail >= r13.tailMin && rest.tail <= r13.tailMax && hull === 0 && o.loads[3] === 0 && Math.hypot(o.s[4], o.s[5]) < 0.01,
      `${rest.pitch.toFixed(2)} deg, CG ${rest.z.toFixed(4)} m, tail ${(rest.tail * 100).toFixed(1)} percent, loads ${o.loads.map((f) => f.toFixed(2)).join(' ')} N, hull ${hull}`,
      `${r13.pitchMin} to ${r13.pitchMax} deg, ${r13.zMin} to ${r13.zMax} m, ${r13.tailMin * 100} to ${r13.tailMax * 100} percent, no hull or prop`);
  }

  /*
   * The take off roll, flown as a warbird is: the throttle opened over a
   * second and a half, the stick forward to bring the tail up to 4 deg,
   * rotated to 8 deg at 1.1 Vs, the wings held on the ailerons. `rudder`
   * is a function of the state: a pilot's feet, or nothing. Returns the
   * liftoff, the last step on the wheels before 200 ms clear of them, the
   * worst heading off the runway and the mean yaw stick on the roll.
   */
  function takeoffRun(rudder) {
    onStrip();
    let last = null;
    let off = 0;
    let lof = null;
    let worst = 0;
    let rudSum = 0;
    let rudN = 0;
    const vRot = 1.1 * th.p2_stall.derived;
    for (let ms = 0; ms < 10000 && !lof; ms += RC_STEP_MS) {
      const s = sim.readState().state;
      const v = Math.hypot(s[4], s[5]);
      const { pitch, bank } = attitude(s);
      const pt = v < vRot ? 4 / DEG : 8 / DEG;
      const ps = Math.max(-1, Math.min(1, 3 * (pt - pitch) + 0.3 * s[12]));
      const roll = Math.max(-1, Math.min(1, -1.2 * bank - 0.12 * s[11]));
      const yaw = rudder(s);
      rudSum += yaw;
      rudN += 1;
      const o = step(sim, [roll, ps, yaw, Math.min(1, ms / 1500)]);
      worst = Math.max(worst, Math.abs(heading(o.s) * DEG));
      if (o.loaded) {
        last = { dist: o.s[1], v: speed(o.s), t: ms / 1000, heading: heading(o.s) * DEG };
        off = 0;
      } else {
        off += RC_STEP_MS;
        if (off >= 200) lof = last;
      }
    }
    return { lof, worst, rudder: rudSum / rudN };
  }

  /* P14: the heading held on the rudder, a pilot's feet on the heading
   * and its rate, and the right rudder fed in as the tail comes up, the
   * warbird pilot's anticipation: 1.3 of stick per rad/s of pitch rate,
   * the prop's J Omega over what full rudder holds at 10 m/s (0.83 N m s
   * over 0.64 N m). It tracks the runway, and it takes right rudder. */
  {
    const t14 = th.p14_takeoff;
    const r = takeoffRun((s) => p51TakeoffSticks(s, 0)[2]);
    const lof = r.lof;
    gate('P14', 'take off, the heading held on the rudder', lof != null && lof.dist >= t14.distMin && lof.dist <= t14.distMax && lof.v >= t14.vMin && lof.v <= t14.vMax && r.worst <= t14.maxHeadingDeg && r.rudder > 0,
      lof == null ? 'never left the ground' : `${lof.dist.toFixed(2)} m to liftoff at ${lof.v.toFixed(2)} m/s, ${lof.t.toFixed(2)} s, heading within ${r.worst.toFixed(1)} deg, mean yaw stick ${r.rudder.toFixed(3)} (${r.rudder > 0 ? 'right' : 'LEFT'} rudder)`,
      `${t14.distMin} to ${t14.distMax} m, ${t14.vMin} to ${t14.vMax} m/s, within ${t14.maxHeadingDeg} deg, right rudder`);
  }

  /* P15: the same roll with the rudder left alone: it swings left. */
  {
    const r = takeoffRun(() => 0);
    const h = r.lof ? r.lof.heading : null;
    gate('P15', 'take off, rudder left alone: it swings left', h !== null && h >= th.p15_swing.minLeftDeg,
      h === null ? 'never left the ground' : `${h.toFixed(1)} deg left of the runway at liftoff, ${r.lof.v.toFixed(2)} m/s`, `at least ${th.p15_swing.minLeftDeg} deg left`);
  }

  /* P16: the retracts, in the air: up in their time, and the wheels carry
   * nothing on the way; down again in the same. */
  {
    const t16 = th.p16_gear;
    must(sim.reset(), 'sim_reset');
    must(sim.e.sim_set_pose(...STILL_AIR), 'sim_set_pose');
    must(sim.e.sim_wing_launch(15), 'sim_wing_launch');
    clockMs = 0;
    must(sim.e.sim_wing_set_gear(1), 'sim_wing_set_gear');
    let upAt = null;
    for (let ms = 0; ms < 8000 && upAt === null; ms += 1) {
      must(sim.input(ms / 1000, 0, 0, 0, 0.75), 'sim_input');
      must(sim.step(1), 'sim_step');
      if (sim.e.sim_wing_gear() >= 1) upAt = (ms + 1) / 1000;
    }
    must(sim.e.sim_wing_set_gear(0), 'sim_wing_set_gear');
    let downAt = null;
    for (let ms = 0; ms < 8000 && downAt === null; ms += 1) {
      must(sim.input(8 + ms / 1000, 0, 0, 0, 0.75), 'sim_input');
      must(sim.step(1), 'sim_step');
      if (sim.e.sim_wing_gear() <= 0) downAt = (ms + 1) / 1000;
    }
    const refused = sim.e.sim_set_airframe(12) === SIM_OK && sim.e.sim_wing_set_gear(1) !== SIM_OK && sim.e.sim_set_airframe(P51_AIRFRAME) === SIM_OK;
    gate('P16', 'retracts: up and down in their time', upAt !== null && downAt !== null && Math.abs(upAt - t16.timeS) <= t16.tolS && Math.abs(downAt - t16.timeS) <= t16.tolS && refused,
      `up in ${upAt} s, down in ${downAt} s, refused on the Kadet ${refused}`, `${t16.timeS} s within ${t16.tolS}, and refused without retracts`);
  }

  /* P17: a landing with the gear up. Flown down level at approach speed
   * from 3 m with the throttle closed: it meets the grass on its belly and
   * its prop, and no wheel carries anything. */
  {
    const t17 = th.p17_belly;
    must(sim.reset(), 'sim_reset');
    p51GroundPrelude(sim, { mu: GROUND_MU, e: GROUND_E });
    must(sim.e.sim_set_pose(0, 0, t17.z0, 1, 0, 0, 0), 'sim_set_pose');
    must(sim.e.sim_wing_launch(t17.speed0), 'sim_wing_launch');
    must(sim.e.sim_wing_set_gear(1), 'sim_wing_set_gear');
    clockMs = 0;
    let hull = 0;
    let prop = 0;
    let wheels = 0;
    let o = { s: sim.readState().state };
    for (let ms = 0; ms < 15000; ms += RC_STEP_MS) {
      const { pitch, bank } = attitude(o.s);
      const roll = Math.max(-1, Math.min(1, -1.2 * bank - 0.12 * o.s[11]));
      const target = o.s[3] > 1 ? -2 / DEG : 3 / DEG;
      const ps = Math.max(-1, Math.min(1, 2.5 * (target - pitch) + 0.25 * o.s[12]));
      o = step(sim, [roll, ps, 0, 0]);
      hull = Math.max(hull, o.hull);
      prop = Math.max(prop, o.loads[3]);
      wheels = Math.max(wheels, ...o.loads.slice(0, 3));
    }
    const vg = Math.hypot(o.s[4], o.s[5]);
    gate('P17', 'gear up: it lands on its belly', hull > 0 && wheels === 0 && vg < 0.5 && sim.e.sim_wing_gear() >= 1,
      `hull contacts ${hull}, prop tip ${prop.toFixed(1)} N, wheels ${wheels.toFixed(1)} N, ${vg.toFixed(2)} m/s at the end`, 'on the hull, no wheel loaded, stopped');
  }

  /* P18: the approach, full flap and the gear down, flown at 1.3 Vs with
   * full flap on the elevator and the throttle, the wings on the
   * ailerons, a flare from 1.5 m and the throttle closed, the stick
   * brought back on the wheels into three points. */
  {
    const t18 = th.p18_landing;
    onStrip(2);
    must(sim.e.sim_set_pose(0, 0, t18.z0, 1, 0, 0, 0), 'sim_set_pose');
    must(sim.e.sim_wing_launch(t18.approach), 'sim_wing_launch');
    clockMs = 0;
    let touched = null;
    let hull = 0;
    let o = { s: sim.readState().state, loaded: false, loads: [0, 0, 0, 0] };
    let iPitch = 0;
    let iThr = 0;
    for (let ms = 0; ms < 25000; ms += RC_STEP_MS) {
      const { pitch, bank } = attitude(o.s);
      const roll = Math.max(-1, Math.min(1, -1.2 * bank - 0.12 * o.s[11]));
      const v = speed(o.s);
      let pitchStick = 0;
      let thr = 0;
      if (touched === null) {
        const flare = o.s[3] < 1.5;
        /* On the approach: speed on the elevator, a 4 deg glide path on
         * the throttle. In the flare: the nose raised, the power off. */
        const target = flare ? Math.min(12, 2 + 10 * (1.5 - o.s[3]) / 1.2) / DEG : Math.max(-6 / DEG, Math.min(10 / DEG, (1 + 5 * (v - t18.approach)) / DEG));
        iPitch = Math.max(-0.6, Math.min(0.6, iPitch + 2.0 * (target - pitch) * RC_STEP_MS / 1000));
        pitchStick = Math.max(-1, Math.min(1, 2.5 * (target - pitch) + 0.25 * o.s[12] + iPitch));
        iThr = Math.max(0, Math.min(0.8, iThr + 0.2 * (-0.76 - o.s[6]) * RC_STEP_MS / 1000));
        thr = flare ? 0 : Math.max(0, Math.min(1, iThr + 0.3 * (-0.76 - o.s[6])));
      } else {
        pitchStick = 1;
      }
      o = step(sim, [roll, pitchStick, 0, thr]);
      if (o.loaded && touched === null) touched = { v, vg: Math.hypot(o.s[4], o.s[5]), vz: o.s[6], x: o.s[1] };
      if (touched !== null) hull = Math.max(hull, o.hull + (o.loads[3] > 0 ? 1 : 0));
    }
    const land = { pitch: attitude(o.s).pitch * DEG, v: Math.hypot(o.s[4], o.s[5]), roll: touched ? o.s[1] - touched.x : 0 };
    gate('P18', 'full flap approach at 1.3 Vs, lands on its wheels', touched !== null && touched.vg <= t18.maxTouchSpeed && land.v < 0.05 && Math.abs(land.pitch - rest.pitch) <= t18.pitchTolDeg && hull === 0,
      touched === null ? 'never touched down' : `touched at ${touched.vg.toFixed(2)} m/s over the ground sinking ${(-touched.vz).toFixed(2)}, rolled ${land.roll.toFixed(1)} m, at rest at ${land.pitch.toFixed(2)} deg, hull or prop ${hull}`,
      `under ${t18.maxTouchSpeed} m/s, at rest within ${t18.pitchTolDeg} deg of P13, no hull or prop`);
  }
  must(sim.e.sim_wing_set_flaps(0), 'sim_wing_set_flaps');
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

/* S18: the P-51's take off and flight, and its retracts and stall in the
 * air, each flown twice in Node and once in headless Chrome. */
for (const [id, file, prelude, plane] of [
  ['S18', 'tests/inputs/p51-baseline.rec', (s) => p51RecPrelude(s), 'p51'],
  ['S18b', 'tests/inputs/p51-air.rec', (s) => p51AirPrelude(s), 'p51-air'],
]) {
  const stickRec = await recOf(file);
  const stickOpts = { ...replayBase, prelude };
  const nodeHash = (await replayTrace(await loadSim(wasmBytes), stickRec, stickOpts)).slice(0, 16);
  const nodeAgain = (await replayTrace(await loadSim(wasmBytes), stickRec, stickOpts)).slice(0, 16);
  if (!findChrome()) {
    gate(id, `Node and Chrome agree, ${plane}`, null, `node ${nodeHash} twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}, no Chrome here`, 'identical');
    continue;
  }
  const server = await startServer(root);
  try {
    const out = await runBrowserHarness(`${server.origin}/tests/browser/wing-harness.html?plane=${plane}`);
    const result = out.result || {};
    const chromeHash = result.ok ? String(result.hash).slice(0, 16) : `error: ${result.message || result.errorName || JSON.stringify(out).slice(0, 80)}`;
    gate(id, `Node and Chrome agree, ${plane}`, nodeAgain === nodeHash && result.ok && chromeHash === nodeHash, `node ${nodeHash} (twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}), chrome ${chromeHash}`, 'identical');
  } finally {
    await server.close();
  }
}

console.log('');
for (const [id, name, measured, b, status] of rows) {
  console.log(`  ${status.padEnd(4)}  ${id.padEnd(4)} ${name.padEnd(48)} ${String(measured).padEnd(70)} ${b}`);
}
console.log(`\n${failed ? `${failed} FAILED, ` : ''}${rows.length - failed - skipped} of ${rows.length} gates hold${skipped ? `, ${skipped} SKIPPED (a skip is not a pass)` : ''}`);
process.exit(failed ? 1 : 0);
