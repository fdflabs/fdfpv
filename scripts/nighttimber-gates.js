/*
 * nighttimber-gates.js: the E-flite Night Timber X 1.2m plant against the
 * bands in tests/nighttimber-thresholds.json, extra-gates.js's checks on
 * docs/NIGHTTIMBER-STAGE1.md's derivation.
 *
 * N1 to N5 are its performance as an aeroplane: a level cruise, the stall
 * flaps up and with full flaps, a glide, its top speed and a roll rate at
 * full aileron. N6 to N11 are the 3D regime its thrust over its weight
 * opens: hanging on the prop at the hover throttle, the vertical climb,
 * the torque roll and the full span ailerons in the slipstream against
 * it, full elevator and rudder answering at zero airspeed (and not with
 * the prop stopped). No harrier gate: the video's pilot says it cannot be
 * flown at that angle without the elevator to flap mix, which the plant
 * does not have yet, and the plant agrees (docs/NIGHTTIMBER-STAGE1.md).
 * N13 and N14 are its taildragger gear: standing at the photographed pose
 * and a half flap take off roll. N15 holds every other aircraft's recorded
 * hash where main's module has it, N16 flies its recording in Node and in
 * headless Chrome and holds the two equal, and N17 asks whether a person
 * paced pilot can hover it the way the video's pilot does. No knife edge
 * gate: the derivation finds none at the estimated thrust, against the
 * video, which is a finding for the derivation, not a band
 * (docs/NIGHTTIMBER-STAGE1.md). Bands are never widened here. Run with npm
 * run nighttimber:gates.
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
import {
  NIGHTTIMBER_AIRFRAME, nighttimberGroundPrelude, extraGroundPrelude, extraTakeoffSticks, hangSticks, fly, wingDebug, wheelLoads, attitude, must,
  bombshellGroundPrelude, kadetGroundPrelude, slowstickGroundPrelude, skyPrelude, wingPrelude, cubGroundPrelude, p51RecPrelude, p51AirPrelude, f16GroundPrelude,
  zagiPrelude, uglystikGroundPrelude, dlgRecPrelude, tigermothGroundPrelude,
  gliderRecPrelude, bramorPrelude, bramorChutePrelude, timberRecPrelude, timberFloatRecPrelude, RC_STEP_MS,
} from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const th = JSON.parse(await readFile(join(root, 'tests/nighttimber-thresholds.json'), 'utf8'));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const DEG = 180 / Math.PI;

async function nighttimberSim() {
  const sim = await loadSim(wasmBytes);
  if (sim.init(configText) !== SIM_OK) throw new Error('sim_init failed');
  if (sim.e.sim_set_airframe(NIGHTTIMBER_AIRFRAME) !== SIM_OK) throw new Error('sim_set_airframe failed');
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
const fullBank = (s) => Math.atan2(2 * (s[9] * s[10] + s[7] * s[8]), 1 - 2 * (s[8] * s[8] + s[9] * s[9]));
const speed = (s) => Math.hypot(s[4], s[5], s[6]);
const clamp = (v) => Math.max(-1, Math.min(1, v));

/* The flights start 600 m to the side of the field and 60 m up. */
const AIR = [0, 600, 60, 1, 0, 0, 0];
const slow = { guard: false, start: AIR };

let clockMs = 0;
function step(sim, sticks) {
  must(sim.input(clockMs / 1000, ...sticks), 'sim_input');
  must(sim.step(RC_STEP_MS), 'sim_step');
  clockMs += RC_STEP_MS;
  return sim.readState().state;
}
/* Nose straight up, still, at 60 m. cos and sin of 45 deg. */
const H = Math.SQRT1_2;
function hanging(sim) {
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_set_pose(0, 600, 60, H, 0, -H, 0), 'sim_set_pose');
  clockMs = 0;
}
/* The throttle that holds the height, a rate loop with an integral,
 * starting from the stick given. */
function heightHold(start) {
  let i = start;
  return (s, vzTarget = 0) => {
    i = Math.max(0, Math.min(1, i + 0.0008 * (vzTarget - s[6])));
    return clamp(i + 0.08 * (vzTarget - s[6]));
  };
}

console.log('night timber gates: the plant against docs/NIGHTTIMBER-STAGE1.md');
const sim = await nighttimberSim();
must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
check: {
  if (sim.e.sim_airframe() !== NIGHTTIMBER_AIRFRAME) {
    gate('N0', 'the Night Timber is selected', false, `airframe ${sim.e.sim_airframe()}`, `${NIGHTTIMBER_AIRFRAME}`);
    break check;
  }

  const e1 = fly(sim, { duty: th.n1_level_75.duty, vzTarget: 0, seconds: 30, speed0: 12, ...slow });
  gate('N1', 'cruise: level speed at 75 percent', within(e1.v, th.n1_level_75), `${e1.v.toFixed(2)} m/s, sink ${(-e1.vz).toFixed(2)}`, band(th.n1_level_75));

  let stallV = null;
  fly(sim, {
    duty: 0, speed0: 14, seconds: 14, pitchMax: 0.7, pitchMin: -0.3, ...slow,
    pitchTargetFn: (ms) => Math.min(0.6, 0.06 * ms / 1000),
    onStep: (o) => { if (stallV == null && o.ms > 1000 && wingDebug(sim)[0] > th.n2_stall.alphaStall) stallV = o.v; },
  });
  gate('N2', 'stall speed, power off, flaps up', stallV != null && within(stallV, th.n2_stall), stallV == null ? 'no stall reached' : `${stallV.toFixed(2)} m/s`, band(th.n2_stall));

  /* N2b: the same with the flaps down to the full notch first. */
  {
    must(sim.e.sim_wing_set_flaps(2), 'sim_wing_set_flaps');
    let stallF = null;
    fly(sim, {
      duty: 0, speed0: 12, seconds: 14, pitchMax: 0.7, pitchMin: -0.3, ...slow,
      pitchTargetFn: (ms) => Math.min(0.6, 0.06 * ms / 1000),
      onStep: (o) => { if (stallF == null && o.ms > 2500 && wingDebug(sim)[0] > th.n2b_stall_flaps.alphaStall) stallF = o.v; },
    });
    must(sim.e.sim_wing_set_flaps(0), 'sim_wing_set_flaps');
    gate('N2b', 'stall speed, power off, full flaps', stallF != null && within(stallF, th.n2b_stall_flaps), stallF == null ? 'no stall reached' : `${stallF.toFixed(2)} m/s`, band(th.n2b_stall_flaps));
  }

  const g3 = fly(sim, { duty: 0, vTarget: th.n3_glide.speed, seconds: 30, ...slow, speed0: th.n3_glide.speed });
  const ratio = Math.sqrt(Math.max(0, g3.v * g3.v - g3.vz * g3.vz)) / -g3.vz;
  gate('N3', 'glide ratio, power off', within(ratio, th.n3_glide), `${ratio.toFixed(2)} at ${g3.v.toFixed(2)} m/s, sink ${(-g3.vz).toFixed(2)}`, band(th.n3_glide));

  const e4 = fly(sim, { duty: th.n4_top.duty, vzTarget: 0, seconds: 40, speed0: 16, ...slow });
  gate('N4', 'top speed, level', within(e4.v, th.n4_top), `${e4.v.toFixed(2)} m/s, sink ${(-e4.vz).toFixed(2)}`, band(th.n4_top));

  /* E5: level at the roll speed, then full right aileron: the peak roll
   * rate in the first second over the speed then. */
  {
    const t5 = th.n5_roll;
    const r = fly(sim, { duty: t5.duty, vTarget: t5.speed, seconds: 15, speed0: t5.speed, ...slow });
    clockMs = r.endMs;
    let peak = 0;
    let vAt = t5.speed;
    for (let ms = 0; ms < 1000; ms += RC_STEP_MS) {
      const s = step(sim, [1, 0, 0, t5.duty]);
      if (s[11] > peak) { peak = s[11]; vAt = speed(s); }
    }
    const pb2v = peak * 1.200 / (2 * vAt);
    gate('N5', 'roll rate, full aileron, pb/2V', within(pb2v, t5), `${pb2v.toFixed(3)}: ${(peak * DEG).toFixed(0)} deg/s at ${vAt.toFixed(1)} m/s`, band(t5));
  }

  /* E6: hanging on the prop. From still, nose up, the nose held by the
   * elevator and rudder in the slipstream, the roll rate held at nothing
   * on the ailerons as a 3D pilot holds the torque, the height by the
   * throttle: the mean stick and the height's drift over 3 to 8 s. */
  {
    const t6 = th.n6_hover;
    hanging(sim);
    const thr = heightHold(0.8);
    let sum = 0;
    let n = 0;
    let z3 = null;
    let s = sim.readState().state;
    let zMin = Infinity, zMax = -Infinity;
    for (let ms = 0; ms < 8000; ms += RC_STEP_MS) {
      const t = thr(s);
      s = step(sim, [...hangSticks(s, { rollRate: 0 }), t]);
      if (ms >= 3000) {
        sum += t; n += 1;
        if (z3 === null) z3 = s[3];
        zMin = Math.min(zMin, s[3]); zMax = Math.max(zMax, s[3]);
      }
    }
    const mean = sum / n;
    const drift = zMax - zMin;
    gate('N6', 'hangs on the prop at the hover throttle', within(mean, t6) && drift <= t6.maxHeightDrift,
      `stick ${mean.toFixed(4)}, height within ${drift.toFixed(2)} m, nose ${(attitude(s).pitch * DEG).toFixed(1)} deg`, `${band(t6)}, within ${t6.maxHeightDrift} m`);
  }

  /* E7: straight up at full throttle from the hover: the climb speed after
   * 8 s, when it has settled. */
  {
    hanging(sim);
    let s = sim.readState().state;
    for (let ms = 0; ms < 8000; ms += RC_STEP_MS) {
      s = step(sim, [...hangSticks(s, { rollRate: 0 }), 1]);
    }
    gate('N7', 'climbs straight up at full throttle', within(s[6], th.n7_vertical), `${s[6].toFixed(2)} m/s up, nose ${(attitude(s).pitch * DEG).toFixed(1)} deg`, band(th.n7_vertical));
  }

  /* E8, E9: the torque roll, the ailerons let go, then full right
   * aileron: the mean roll rate over 3 to 6 s (right positive). */
  const rollHanging = (rollStick) => {
    hanging(sim);
    const thr = heightHold(0.8);
    let s = sim.readState().state;
    let sum = 0;
    let n = 0;
    for (let ms = 0; ms < 6000; ms += RC_STEP_MS) {
      s = step(sim, [...hangSticks(s, { rollStick }), thr(s)]);
      if (ms >= 3000) { sum += s[11]; n += 1; }
    }
    return { p: sum / n * DEG, pitch: attitude(s).pitch * DEG };
  };
  {
    const r8 = rollHanging(0);
    gate('N8', 'torque roll: the ailerons let go, it turns left', r8.p < 0 && within(-r8.p, th.n8_torque_roll), `${r8.p.toFixed(0)} deg/s ${r8.p < 0 ? 'left' : 'RIGHT'}, nose ${r8.pitch.toFixed(1)} deg`, `${th.n8_torque_roll.min} to ${th.n8_torque_roll.max} left`);
    const r9 = rollHanging(1);
    gate('N9', 'full right aileron in the wash beats the torque', r9.p > 0 && within(r9.p, th.n9_aileron_hover), `${r9.p.toFixed(0)} deg/s ${r9.p > 0 ? 'right' : 'LEFT'}, nose ${r9.pitch.toFixed(1)} deg`, `${th.n9_aileron_hover.min} to ${th.n9_aileron_hover.max} right`);
  }

  /* E10: hanging still, one full stick for 20 ms from rest at the hover
   * throttle, and again with the prop stopped: the first angular
   * acceleration, nose up positive and nose right positive. */
  {
    const t10 = th.n10_zero_speed;
    const kick = (sticks, throttle) => {
      hanging(sim);
      /* The prop spun up and the wash formed: the plant's thrust follows
       * the stick with no lag, so a step at the stick is the wash at once. */
      let s = sim.readState().state;
      for (let ms = 0; ms < 20; ms += RC_STEP_MS) s = step(sim, [...sticks, throttle]);
      return { q: -s[12] / 0.020, r: -s[13] / 0.020 };
    };
    const hoverDuty = Math.sqrt(1.698 * 9.81 / 25.93);
    const up = kick([0, 1, 0], hoverDuty);
    const upDead = kick([0, 1, 0], 0);
    const right = kick([0, 0, 1], hoverDuty);
    const rightDead = kick([0, 0, 1], 0);
    gate('N10', 'full elevator at zero airspeed, in the wash', up.q >= t10.pitchMin && up.q <= t10.pitchMax && Math.abs(upDead.q) <= t10.deadMax * up.q,
      `${up.q.toFixed(1)} rad/s^2 nose up; prop stopped ${upDead.q.toFixed(2)}`, `${t10.pitchMin} to ${t10.pitchMax}; stopped under ${t10.deadMax * 100} percent`);
    gate('N10b', 'full rudder at zero airspeed, in the wash', right.r >= t10.yawMin && right.r <= t10.yawMax && Math.abs(rightDead.r) <= t10.deadMax * right.r,
      `${right.r.toFixed(1)} rad/s^2 nose right; prop stopped ${rightDead.r.toFixed(2)}`, `${t10.yawMin} to ${t10.yawMax}; stopped under ${t10.deadMax * 100} percent`);
  }

  /* E13: on the strip at the drawn pose, 3 s with every stick centred. */
  const onStrip = (flaps = 0) => {
    must(sim.reset(), 'sim_reset');
    nighttimberGroundPrelude(sim, { flaps });
    must(sim.e.sim_wing_flaps_settle(), 'sim_wing_flaps_settle');
    clockMs = 0;
  };
  {
    const r13 = th.n13_rest;
    onStrip();
    let hull = 0;
    let s = null;
    for (let ms = 0; ms < 3000; ms += RC_STEP_MS) {
      s = step(sim, [0, 0, 0, 0]);
      hull = Math.max(hull, sim.e.sim_ground_contacts());
    }
    const loads = wheelLoads(sim);
    const rest = { pitch: attitude(s).pitch * DEG, z: s[3], tail: loads[2] / (loads[0] + loads[1] + loads[2]) };
    gate('N13', 'standing on its wheels', rest.pitch >= r13.pitchMin && rest.pitch <= r13.pitchMax && rest.z >= r13.zMin && rest.z <= r13.zMax && rest.tail >= r13.tailMin && rest.tail <= r13.tailMax && hull === 0 && loads[3] === 0,
      `${rest.pitch.toFixed(2)} deg, CG ${rest.z.toFixed(4)} m, tail ${(rest.tail * 100).toFixed(1)} percent, loads ${loads.map((f) => f.toFixed(2)).join(' ')} N, hull ${hull}`,
      `${r13.pitchMin} to ${r13.pitchMax} deg, ${r13.zMin} to ${r13.zMax} m, ${r13.tailMin * 100} to ${r13.tailMax * 100} percent, no hull or prop`);
  }

  /* E14: full throttle from standing, the take off sticks of
   * wingpilot.js; liftoff is the last step on the wheels before 200 ms
   * clear of them. */
  {
    const t14 = th.n14_takeoff;
    onStrip(1);
    for (let ms = 0; ms < 1000; ms += RC_STEP_MS) step(sim, [0, 0, 0, 0]);
    const x0 = sim.readState().state[1];
    let last = null;
    let off = 0;
    let lof = null;
    for (let ms = 0; ms < 6000 && !lof; ms += RC_STEP_MS) {
      const s = step(sim, [...extraTakeoffSticks(sim.readState().state, { vRotate: 8 }), 1]);
      const loaded = wheelLoads(sim).some((f) => f > 0);
      if (loaded) {
        last = { dist: s[1] - x0, v: speed(s), t: ms / 1000, y: s[2] };
        off = 0;
      } else {
        off += RC_STEP_MS;
        if (off >= 200) lof = last;
      }
    }
    gate('N14', 'takes off, half flaps, tail up, from standing', lof != null && lof.dist >= t14.distMin && lof.dist <= t14.distMax,
      lof == null ? 'never left the ground' : `${lof.dist.toFixed(2)} m to liftoff at ${lof.v.toFixed(2)} m/s, ${lof.t.toFixed(2)} s, ${lof.y.toFixed(2)} m off the line`,
      `${t14.distMin} to ${t14.distMax} m`);
  }
}

const quadTh = JSON.parse(await readFile(join(root, 'tests/thresholds.json'), 'utf8'));
const replayBase = { configText, renderHz: quadTh.replay.canonical_render_hz.value, traceStrideMs: quadTh.replay.trace_stride_ms.value };
const recOf = async (f) => decodeRec(new Uint8Array(await readFile(join(root, f))));
const hashOf = async (f, prelude) => (await replayTrace(await loadSim(wasmBytes), await recOf(f), { ...replayBase, prelude })).slice(0, 16);
const u = th.n15_unmoved;
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
  tigermoth: await hashOf('tests/inputs/tigermoth-baseline.rec', (s) => tigermothGroundPrelude(s)),
  extra: await hashOf('tests/inputs/extra-baseline.rec', (s) => extraGroundPrelude(s)),
};
const names = Object.keys(got);
gate('N15', 'every other aircraft unmoved', names.every((k) => got[k] === u[k]),
  names.map((k) => got[k]).join(', '), names.map((k) => u[k]).join(', '));

const stickRec = await recOf('tests/inputs/nighttimber-baseline.rec');
const stickOpts = { ...replayBase, prelude: (s) => nighttimberGroundPrelude(s, { flaps: 1 }) };
const nodeHash = (await replayTrace(await loadSim(wasmBytes), stickRec, stickOpts)).slice(0, 16);
const nodeAgain = (await replayTrace(await loadSim(wasmBytes), stickRec, stickOpts)).slice(0, 16);
if (!findChrome()) {
  gate('N16', 'Node and Chrome agree', null, `node ${nodeHash} twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}, no Chrome here`, 'identical');
} else {
  const server = await startServer(root);
  try {
    const out = await runBrowserHarness(`${server.origin}/tests/browser/wing-harness.html?plane=nighttimber`);
    const result = out.result || {};
    const chromeHash = result.ok ? String(result.hash).slice(0, 16) : `error: ${result.message || result.errorName || JSON.stringify(out).slice(0, 80)}`;
    gate('N16', 'Node and Chrome agree', nodeAgain === nodeHash && result.ok && chromeHash === nodeHash, `node ${nodeHash} (twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}), chrome ${chromeHash}`, 'identical');
  } finally {
    await server.close();
  }
}

/*
 * N17: a person's hands. hover-probe.js's pilot (0.2 s late, ten moves a
 * second in fiftieths of the stick, the nose and drift by eye, the height
 * on a slow throttle hand) over its 648 pilot grid, the ailerons flying
 * the video's technique: toward a slow 75 deg/s torque roll, not against
 * all of it (analysis/3D-VIDEO-LESSONS.md 5b). Manual and both techniques
 * are flown and reported; the gate is AS3X with the video's.
 */
{
  const t17 = th.n17_person_hover;
  const MS = 4, LAG = 50, EVERY = 100;
  const quant = (x) => clamp(Math.round(x * 50) / 50);
  const NOSE_UP = [Math.SQRT1_2, 0, -Math.SQRT1_2, 0];
  const see = (s) => {
    const [w, x, y, z] = [s[7], s[8], s[9], s[10]];
    return { s, upB: [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)], belly: [2 * (x * z + w * y), 2 * (y * z - w * x)], right: [2 * (x * y - w * z), 1 - 2 * (x * x + z * z)], p: s[11], vz: s[6], z: s[3] };
  };
  const person = (mode, g, rateDeg) => {
    must(sim.reset(), 'sim_reset');
    must(sim.e.sim_wing_set_stab(mode), 'sim_wing_set_stab');
    must(sim.e.sim_set_pose(0, 0, 50, ...NOSE_UP), 'sim_set_pose');
    const seen = [];
    let st = [0, 0, 0, 0.6], base = 0.6, trim = 0, held = 0, roll = 0;
    for (let ms = 0; ms < 10000; ms += MS) {
      const o = see(sim.readState().state);
      seen.push(o);
      const off = Math.acos(clamp(o.upB[0])) * DEG;
      if (held === ms && off < 20 && Math.abs(o.z - 50) < 10) held = ms + MS;
      roll += o.p * MS / 1000;
      if (ms % EVERY === 0 && seen.length > LAG + 25) {
        const d = seen[seen.length - 1 - LAG];
        const was = seen[seen.length - 26 - LAG];
        const h = EVERY / 1000;
        base = Math.max(0, clamp(base - h * (0.05 * (d.z - 50) + 0.1 * d.vz)));
        const err = d.p - rateDeg * Math.sign(d.p || 1) / DEG;
        trim = clamp(trim - 0.3 * h * err);
        const lean = (a) => clamp(g.kv * (a[0] * d.s[4] + a[1] * d.s[5]), 0.3);
        st = [
          quant(trim - g.kr * err),
          quant(g.kp * (d.upB[2] - lean(d.belly)) + g.kd * (d.upB[2] - was.upB[2]) / 0.1),
          quant(-g.kp * (d.upB[1] - lean(d.right)) - g.kd * (d.upB[1] - was.upB[1]) / 0.1),
          Math.max(0, quant(base - g.kt * d.vz)),
        ];
      }
      must(sim.input(ms / 1000, ...st), 'sim_input');
      must(sim.step(MS), 'sim_step');
    }
    return { held: held / 1000, rate: roll / 10 * DEG, thr: st[3] };
  };
  const pilots = [];
  for (const kp of [0.2, 0.4, 0.7, 1, 1.5, 2.5]) for (const kd of [0, 0.1, 0.2, 0.4, 0.7, 1]) for (const kr of [0.1, 0.3]) for (const kv of [0.1, 0.2, 0.3]) for (const kt of [0.02, 0.05, 0.1]) {
    pilots.push({ kp, kd, kr, kv, kt });
  }
  const cells = {};
  for (const [mode, mname] of [[0, 'Manual'], [3, 'AS3X']]) {
    for (const [tech, rateDeg] of [['stop it', 0], ['video', 75]]) {
      const held = pilots.map((g) => person(mode, g, rateDeg)).filter((r) => r.held >= 10);
      const mean = (k) => (held.length ? held.reduce((a, r) => a + r[k], 0) / held.length : NaN);
      cells[`${mname} ${tech}`] = { n: held.length, rate: mean('rate'), thr: mean('thr') };
    }
  }
  const g17 = cells['AS3X video'];
  gate('N17', 'a person paced pilot hovers it, the video\'s way, AS3X', pilots.length === t17.pilots && g17.n >= t17.minHolders,
    Object.entries(cells).map(([k, v]) => `${k} ${v.n}/${pilots.length}${v.n ? ` (${v.rate.toFixed(0)} deg/s, throttle ${v.thr.toFixed(2)})` : ''}`).join('; '),
    `AS3X video at least ${t17.minHolders} of ${t17.pilots}`);
}

console.log('');
for (const [id, name, measured, b, status] of rows) {
  console.log(`  ${status.padEnd(4)}  ${id.padEnd(4)} ${name.padEnd(52)} ${String(measured).padEnd(70)} ${b}`);
}
console.log(`\n${failed ? `${failed} FAILED, ` : ''}${rows.length - failed - skipped} of ${rows.length} gates hold${skipped ? `, ${skipped} SKIPPED (a skip is not a pass)` : ''}`);
process.exit(failed ? 1 : 0);
