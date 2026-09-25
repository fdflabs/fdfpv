/*
 * floats-gates.js: the Timber and the Cub on floats against the bands in
 * tests/floats-thresholds.json, which docs/FLOATS-STAGE1.md derives.
 *
 * For each aircraft: F1 floating at rest on still water, its trim, height
 * and draft; F2 a 0.3 m swell from ahead, the heave and the pitch at the
 * swell's period; F3 the same swell from the side, the roll; F4 the take
 * off, the step and the liftoff; F5 a landing back on the water and its
 * run; F6 the water rudders' taxi turn; F7 a nose low arrival at speed,
 * flagged for the crash physics and never failed; F8 on grass, the keels
 * as skids. Then F9 holds every other aircraft's recorded hash where it
 * was before the water existed, and F10 flies the Timber on floats'
 * recorded flight off a swell in Node and in headless Chrome and holds the
 * two trace hashes equal. Bands are never widened here: a plant outside
 * one is a finding for the derivation. Run with npm run floats:gates.
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
import {
  TIMBERF_AIRFRAME, CUBF_AIRFRAME, FLOAT_REST, floatsWaterPrelude, floatState, floatTakeoffSticks, attitude, must,
  timberFloatRecPrelude, skyPrelude, wingPrelude, cubGroundPrelude, gliderRecPrelude, bramorPrelude, bramorChutePrelude,
  slowstickGroundPrelude, timberRecPrelude, RC_STEP_MS,
} from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const th = JSON.parse(await readFile(join(root, 'tests/floats-thresholds.json'), 'utf8'));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const DEG = 180 / Math.PI;

const rows = [];
let failed = 0;
let skipped = 0;
let flagged = 0;
function gate(id, name, ok, measured, band) {
  const status = ok === 'flag' ? 'FLAG' : ok === null ? 'SKIP' : ok ? 'ok' : 'FAIL';
  rows.push([id, name, measured, band, status]);
  if (ok === 'flag') flagged += 1;
  else if (ok === null) skipped += 1;
  else if (!ok) failed += 1;
}
const clamp1 = (x) => Math.max(-1, Math.min(1, x));
const speed = (s) => Math.hypot(s[4], s[5], s[6]);
const heading = (s) => Math.atan2(2 * (s[7] * s[10] + s[8] * s[9]), 1 - 2 * (s[9] * s[9] + s[10] * s[10]));
const fullBank = (s) => Math.atan2(2 * (s[9] * s[10] + s[7] * s[8]), 1 - 2 * (s[8] * s[8] + s[9] * s[9]));
const levelRoll = (s) => clamp1(-1.2 * attitude(s).bank - 0.12 * s[11]);
const toPitch = (s, deg) => clamp1(3 * (deg / DEG - attitude(s).pitch) + 0.3 * s[12]);

let clockMs = 0;
function step(sim, sticks) {
  must(sim.input(clockMs / 1000, ...sticks), 'sim_input');
  must(sim.step(RC_STEP_MS), 'sim_step');
  clockMs += RC_STEP_MS;
  const s = sim.readState().state;
  const f = floatState(sim);
  return { s, f, wet: f[4] + f[5] > 0 };
}
function onWater(sim, airframe, opts) {
  must(sim.reset(), 'sim_reset');
  floatsWaterPrelude(sim, airframe, opts);
  clockMs = 0;
}
/* The mean level crossing period of a series. */
function period(ts, xs) {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const up = [];
  for (let i = 1; i < xs.length; i += 1) {
    if (xs[i - 1] < m && xs[i] >= m) {
      up.push(ts[i - 1] + (ts[i] - ts[i - 1]) * (m - xs[i - 1]) / (xs[i] - xs[i - 1]));
    }
  }
  return up.length > 1 ? (up[up.length - 1] - up[0]) / (up.length - 1) : null;
}
const range = (xs) => Math.max(...xs) - Math.min(...xs);

console.log('floats gates: the Timber and the Cub on floats against docs/FLOATS-STAGE1.md');
const sim = await loadSim(wasmBytes);
if (sim.init(configText) !== SIM_OK) throw new Error('sim_init failed');
must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');

const PLANES = [
  { key: 'timber', tag: 't', airframe: TIMBERF_AIRFRAME, name: 'Timber', mass: 1.98 },
  { key: 'cub', tag: 'c', airframe: CUBF_AIRFRAME, name: 'Cub', mass: 1.52 },
];

for (const P of PLANES) {
  const W = P.mass * 9.81;
  const tag = (n) => `F${n}${P.tag}`;
  if (sim.e.sim_set_airframe(P.airframe) !== SIM_OK) {
    gate(tag(0), `the ${P.name} on floats exists`, false, `airframe ${P.airframe} refused`, 'selectable');
    continue;
  }

  /* F1: floating at rest. */
  let rest;
  {
    const b = th.f1_rest;
    const want = b[P.key];
    onWater(sim, P.airframe);
    let o = null;
    for (let ms = 0; ms < 8000; ms += RC_STEP_MS) o = step(sim, [0, 0, 0, 0]);
    const { pitch } = attitude(o.s);
    const rest0 = FLOAT_REST[P.airframe];
    /* The keel's depth under the water at the step, from the pose: the
     * floats' own geometry is the plant's, read back through the state. */
    const stepX = P.key === 'timber' ? -0.05 : -0.04;
    const keelZ = P.key === 'timber' ? -0.2523 : -0.2189;
    const draft = -(o.s[3] + stepX * Math.sin(pitch) + keelZ * Math.cos(pitch));
    rest = { pitch: pitch * DEG, z: o.s[3], draft, v: Math.hypot(o.s[4], o.s[5]) };
    gate(tag(1), `${P.name}: floating at rest on still water`,
      Math.abs(rest.pitch - want.pitch) <= b.pitchTolDeg && Math.abs(rest.z - want.z) <= b.zTol && Math.abs(rest.draft / want.draft - 1) <= b.draftTol && rest0 != null,
      `trim ${rest.pitch.toFixed(2)} deg, CG ${rest.z.toFixed(4)} m over the water, the step ${(rest.draft * 1000).toFixed(1)} mm deep; creeping ${rest.v.toFixed(3)} m/s on the idling prop`,
      `${want.pitch} +-${b.pitchTolDeg} deg, ${want.z} +-${b.zTol} m, ${(want.draft * 1000).toFixed(1)} mm +-${b.draftTol * 100} percent`);
  }

  /* F2 and F3: the swell from ahead and from the side, 30 s after 10 s to settle. */
  const swellRun = (dx, dy) => {
    const b = th.f2_swell_head;
    onWater(sim, P.airframe, { swell: { height: b.height, period: b.period, dx, dy } });
    const t = [];
    const z = [];
    const p = [];
    const r = [];
    let worst = 0;
    for (let ms = 0; ms < 40000; ms += RC_STEP_MS) {
      const o = step(sim, [0, 0, 0, 0]);
      const a = attitude(o.s);
      worst = Math.max(worst, Math.abs(a.pitch), Math.abs(fullBank(o.s)));
      if (ms >= 10000) {
        t.push(ms / 1000);
        z.push(o.s[3]);
        p.push(a.pitch);
        r.push(fullBank(o.s));
      }
    }
    return { heave: range(z), tz: period(t, z), pitch: range(p) / 2 * DEG, tp: period(t, p), roll: range(r) / 2 * DEG, tr: period(t, r), worst: worst * DEG };
  };
  {
    const b = th.f2_swell_head;
    const want = b[P.key];
    const h = swellRun(1, 0);
    const pr = h.pitch / want.pitch;
    gate(tag(2), `${P.name}: a 0.3 m swell from ahead`,
      Math.abs(h.heave / want.heave - 1) <= b.heaveTol && h.tz != null && Math.abs(h.tz / b.period - 1) <= b.periodTol
        && pr >= b.pitchMin && pr <= b.pitchMax && h.tp != null && Math.abs(h.tp / b.period - 1) <= b.periodTol && h.roll <= b.rollMaxDeg,
      `heave ${h.heave.toFixed(3)} m at ${h.tz ? h.tz.toFixed(3) : '?'} s, pitch +-${h.pitch.toFixed(2)} deg (${pr.toFixed(2)} of it) at ${h.tp ? h.tp.toFixed(3) : '?'} s, roll +-${h.roll.toFixed(2)}`,
      `${want.heave} m +-${b.heaveTol * 100} percent, +-${want.pitch} deg x ${b.pitchMin} to ${b.pitchMax}, at ${b.period} s +-${b.periodTol * 100} percent, roll under ${b.rollMaxDeg}`);
    const bb = th.f3_swell_beam;
    const s3 = swellRun(0, 1);
    const rr = s3.roll / bb.slopeDeg;
    gate(tag(3), `${P.name}: the swell from the side`,
      rr >= bb.rollMin && rr <= bb.rollMax && s3.tr != null && Math.abs(s3.tr / bb.period - 1) <= bb.periodTol,
      `roll +-${s3.roll.toFixed(2)} deg (${rr.toFixed(2)} of the slope) at ${s3.tr ? s3.tr.toFixed(3) : '?'} s, heave ${s3.heave.toFixed(3)} m`,
      `${bb.rollMin} to ${bb.rollMax} of ${bb.slopeDeg} deg, at ${bb.period} s`);
  }

  /* F4: the take off. */
  {
    const b = th.f4_takeoff;
    const want = b[P.key];
    onWater(sim, P.airframe, { flaps: want.flaps });
    let o = { s: sim.readState().state, f: floatState(sim), wet: true };
    for (let ms = 0; ms < 1000; ms += RC_STEP_MS) o = step(sim, [0, 0, 0, 0]);
    const x0 = o.s[1];
    let onStep = false;
    let stepAt = null;
    let last = null;
    let off = 0;
    let worstBank = 0;
    for (let ms = 0; ms < 15000; ms += RC_STEP_MS) {
      if (!onStep && o.f[0] < 0.25 * W && ms > 200) {
        onStep = true;
        stepAt = { v: speed(o.s), dist: o.s[1] - x0 };
      }
      o = step(sim, floatTakeoffSticks(o.s, { onStep, vRotate: want.vRotate }));
      worstBank = Math.max(worstBank, Math.abs(fullBank(o.s)) * DEG);
      if (o.wet) {
        last = { dist: o.s[1] - x0, v: speed(o.s), t: ms / 1000, pitch: attitude(o.s).pitch * DEG };
        off = 0;
      } else if (last) {
        off += RC_STEP_MS;
        if (off >= 200) break;
      }
    }
    const ok = last && off >= 200 && stepAt;
    const vr = ok ? last.v / want.vLof : 0;
    const rr = ok ? last.dist / want.run : 0;
    gate(tag(4), `${P.name}: the take off off the water`,
      ok && vr >= b.vMin && vr <= b.vMax && rr >= b.runMin && rr <= b.runMax && stepAt.v >= want.humpLo && stepAt.v <= b.stepMaxOfLof * want.vLof,
      ok ? `on the step at ${stepAt.v.toFixed(2)} m/s, ${last.dist.toFixed(2)} m to liftoff at ${last.v.toFixed(2)} m/s (${vr.toFixed(2)}), ${last.t.toFixed(2)} s, pitch ${last.pitch.toFixed(1)}, bank under ${worstBank.toFixed(1)}` : 'never left the water',
      `step ${want.humpLo} to ${(b.stepMaxOfLof * want.vLof).toFixed(2)} m/s; liftoff ${(b.vMin * want.vLof).toFixed(2)} to ${(b.vMax * want.vLof).toFixed(2)} m/s, ${(b.runMin * want.run).toFixed(1)} to ${(b.runMax * want.run).toFixed(1)} m`);
  }

  /* F5: a landing on the water from a powered approach. */
  {
    const b = th.f5_landing;
    const want = b[P.key];
    onWater(sim, P.airframe, { flaps: want.flaps });
    must(sim.e.sim_set_pose(0, 0, 4, 1, 0, 0, 0), 'sim_set_pose');
    must(sim.e.sim_wing_launch(want.speed), 'sim_wing_launch');
    let o = { s: sim.readState().state, f: floatState(sim), wet: false };
    let touched = null;
    let walk = null;
    let worst = 0;
    let hull = 0;
    for (let ms = 0; ms < 25000; ms += RC_STEP_MS) {
      let sticks;
      if (touched) sticks = [levelRoll(o.s), 1, 0, 0];
      else if (o.s[3] > 0.8) sticks = [levelRoll(o.s), toPitch(o.s, 2), 0, 0.3];
      else sticks = [levelRoll(o.s), toPitch(o.s, 8), 0, 0];
      o = step(sim, sticks);
      hull = Math.max(hull, sim.e.sim_ground_contacts());
      if (o.wet && !touched) touched = { v: speed(o.s), vz: o.s[6], x: o.s[1], y: o.s[2] };
      if (touched) {
        worst = Math.max(worst, Math.abs(attitude(o.s).pitch), Math.abs(fullBank(o.s)));
        if (!walk && Math.hypot(o.s[4], o.s[5]) < 1.0) walk = Math.hypot(o.s[1] - touched.x, o.s[2] - touched.y);
      }
    }
    const endPitch = attitude(o.s).pitch * DEG;
    const rr = walk ? walk / want.run : 0;
    gate(tag(5), `${P.name}: landing on the water`,
      touched && walk && rr >= b.runMin && rr <= b.runMax && Math.abs(endPitch - rest.pitch) <= b.pitchTolDeg && worst * DEG <= b.attitudeMaxDeg && hull === 0,
      touched ? `touched at ${touched.v.toFixed(2)} m/s sinking ${(-touched.vz).toFixed(2)}, ${walk ? walk.toFixed(1) : '?'} m to 1 m/s (${rr.toFixed(2)}), at rest at ${endPitch.toFixed(2)} deg, worst attitude ${(worst * DEG).toFixed(1)} deg, hull ${hull}` : 'never touched',
      `${(b.runMin * want.run).toFixed(1)} to ${(b.runMax * want.run).toFixed(1)} m, at rest within ${b.pitchTolDeg} deg of F1, under ${b.attitudeMaxDeg} deg`);
  }

  /* F6: the water rudders. */
  {
    const b = th.f6_taxi;
    const want = b[P.key];
    onWater(sim, P.airframe);
    let o = null;
    for (let ms = 0; ms < 4000; ms += RC_STEP_MS) o = step(sim, [0, b.pitchStick, 0, b.duty]);
    let h0 = null;
    let vSum = 0;
    let n = 0;
    for (let ms = 0; ms < 10000; ms += RC_STEP_MS) {
      o = step(sim, [0, b.pitchStick, 1, b.duty]);
      if (ms === 6000) h0 = heading(o.s);
      if (ms > 6000) {
        vSum += Math.hypot(o.s[4], o.s[5]);
        n += 1;
      }
    }
    let dh = heading(o.s) - h0;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    const radius = (vSum / n) / Math.abs(dh / (4 - RC_STEP_MS / 1000));
    const rr = radius / want.radius;
    gate(tag(6), `${P.name}: the water rudders turn it`, dh < 0 && rr >= b.min && rr <= b.max,
      `${radius.toFixed(2)} m at ${(vSum / n).toFixed(2)} m/s (${rr.toFixed(2)}), ${dh < 0 ? 'turning right' : 'WRONG WAY'}, rudder side force ${o.f[7].toFixed(2)} N`,
      `${(b.min * want.radius).toFixed(2)} to ${(b.max * want.radius).toFixed(2)} m, turning right`);
  }

  /* F7: nose low at speed, flagged. */
  {
    const b = th.f7_nose_dig;
    onWater(sim, P.airframe, { flaps: 0 });
    const h = b.pitchDeg / DEG / 2;
    must(sim.e.sim_set_pose(0, 0, 0.6, Math.cos(h), 0, -Math.sin(h), 0), 'sim_set_pose');
    must(sim.e.sim_wing_launch(b.speed), 'sim_wing_launch');
    let o = { s: sim.readState().state, f: floatState(sim), wet: false };
    let touched = false;
    let prev = speed(o.s);
    let decel = 0;
    let minPitch = 0;
    let over = false;
    for (let ms = 0; ms < 6000; ms += RC_STEP_MS) {
      o = step(sim, touched ? [0, 0, 0, 0] : [levelRoll(o.s), toPitch(o.s, b.pitchDeg), 0, 0]);
      if (o.wet) touched = true;
      const v = speed(o.s);
      if (touched) {
        decel = Math.max(decel, (prev - v) / (RC_STEP_MS / 1000) / 9.81);
        minPitch = Math.min(minPitch, attitude(o.s).pitch * DEG);
        over = over || Math.abs(attitude(o.s).pitch) > 60 / DEG || Math.abs(fullBank(o.s)) > 60 / DEG;
      }
      prev = v;
    }
    gate(tag(7), `${P.name}: nose low at speed onto the water`, 'flag',
      `${touched ? `peak deceleration ${decel.toFixed(1)} g, pitch down to ${minPitch.toFixed(1)} deg, ${over ? 'WENT OVER' : 'did not go over'}` : 'never touched'}`,
      'for the crash physics plan');
  }

  /* F8: on grass, no water, the keels as skids. */
  {
    const b = th.f8_grass;
    const want = b[P.key];
    const slide = (duty) => {
      must(sim.reset(), 'sim_reset');
      floatsWaterPrelude(sim, P.airframe);
      must(sim.e.sim_water_clear(), 'sim_water_clear');
      const keelZ = P.key === 'timber' ? -0.2523 : -0.2189;
      must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, keelZ - 0.005, 1.4, 0), 'sim_set_ground');
      must(sim.e.sim_set_pose(0, 0, 0, 1, 0, 0, 0), 'sim_set_pose');
      clockMs = 0;
      let o = null;
      for (let ms = 0; ms < 1000; ms += RC_STEP_MS) o = step(sim, [0, 0, 0, 0]);
      const x0 = o.s[1];
      for (let ms = 0; ms < 3000; ms += RC_STEP_MS) o = step(sim, [0, 0, 0, duty]);
      return { dx: o.s[1] - x0, load: o.f[6], hull: sim.e.sim_ground_contacts() };
    };
    const under = slide(want.breakaway - b.margin);
    const over = slide(want.breakaway + b.margin);
    gate(tag(8), `${P.name}: on grass the floats slide, they do not roll`, Math.abs(under.dx) < 0.02 && over.dx > 0.3 && under.hull === 0,
      `at ${((want.breakaway - b.margin) * 100).toFixed(0)} percent ${under.dx.toFixed(3)} m in 3 s on ${under.load.toFixed(1)} N, at ${((want.breakaway + b.margin) * 100).toFixed(0)} percent ${over.dx.toFixed(2)} m`,
      `still under ${((want.breakaway - b.margin) * 100).toFixed(0)} percent, sliding over ${((want.breakaway + b.margin) * 100).toFixed(0)}`);
  }
}
must(sim.e.sim_water_clear(), 'sim_water_clear');

const quadTh = JSON.parse(await readFile(join(root, 'tests/thresholds.json'), 'utf8'));
const replayBase = { configText, renderHz: quadTh.replay.canonical_render_hz.value, traceStrideMs: quadTh.replay.trace_stride_ms.value };
const recOf = async (f) => decodeRec(new Uint8Array(await readFile(join(root, f))));
const hashOf = async (f, prelude) => (await replayTrace(await loadSim(wasmBytes), await recOf(f), { ...replayBase, prelude })).slice(0, 16);
const u = th.f9_unmoved;
const got = {
  quad: await hashOf('tests/inputs/baseline.rec', undefined),
  wing: await hashOf('tests/inputs/wing-baseline.rec', wingPrelude),
  sky: await hashOf('tests/inputs/sky-baseline.rec', skyPrelude),
  cub: await hashOf('tests/inputs/cub-baseline.rec', (s) => cubGroundPrelude(s)),
  glider: await hashOf('tests/inputs/glider-baseline.rec', gliderRecPrelude),
  bramor: await hashOf('tests/inputs/bramor-baseline.rec', bramorPrelude),
  bramorChute: await hashOf('tests/inputs/bramor-chute.rec', bramorChutePrelude),
  slowstick: await hashOf('tests/inputs/slowstick-baseline.rec', (s) => slowstickGroundPrelude(s)),
  timber: await hashOf('tests/inputs/timber-baseline.rec', timberRecPrelude),
};
const names = Object.keys(got);
gate('F9', 'every other aircraft unmoved', names.every((k) => got[k] === u[k]),
  names.map((k) => got[k]).join(', '), names.map((k) => u[k]).join(', '));

const rec = await recOf('tests/inputs/timberf-baseline.rec');
const opts = { ...replayBase, prelude: timberFloatRecPrelude };
const nodeHash = (await replayTrace(await loadSim(wasmBytes), rec, opts)).slice(0, 16);
const nodeAgain = (await replayTrace(await loadSim(wasmBytes), rec, opts)).slice(0, 16);
if (!findChrome()) {
  gate('F10', 'Node and Chrome agree on a float take off', null, `node ${nodeHash} twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}, no Chrome here`, 'identical');
} else {
  const server = await startServer(root);
  try {
    const out = await runBrowserHarness(`${server.origin}/tests/browser/wing-harness.html?plane=timberf`);
    const result = out.result || {};
    const chromeHash = result.ok ? String(result.hash).slice(0, 16) : `error: ${result.message || result.errorName || JSON.stringify(out).slice(0, 80)}`;
    gate('F10', 'Node and Chrome agree on a float take off', nodeAgain === nodeHash && result.ok && chromeHash === nodeHash, `node ${nodeHash} (twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}), chrome ${chromeHash}`, 'identical');
  } finally {
    await server.close();
  }
}

console.log('');
for (const [id, name, measured, b, status] of rows) {
  console.log(`  ${status.padEnd(4)}  ${id.padEnd(4)} ${name.padEnd(44)} ${String(measured).padEnd(96)} ${b}`);
}
const held = rows.length - failed - skipped - flagged;
console.log(`\n${failed ? `${failed} FAILED, ` : ''}${held} of ${rows.length - flagged} gates hold${flagged ? `, ${flagged} flagged for the crash physics (not gated)` : ''}${skipped ? `, ${skipped} SKIPPED (a skip is not a pass)` : ''}`);
process.exit(failed ? 1 : 0);
