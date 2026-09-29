/*
 * dlg-gates.js: the NRJ plant against the bands in tests/dlg-thresholds.json.
 *
 * Fourteen checks, D1 to D14, from docs/DLG-STAGE1.md. D1 to D4 are what a
 * discus launch glider is for in the air: the glide ratio, the least sink,
 * the stall and the roll. D5 to D8 are the discus launch and what it
 * rests on: the height of the zoom in every mode, the release where and
 * how the table says, the share of the throw's energy the drag leaves, and
 * the drag coefficient across the Reynolds numbers that decides it. D9 to
 * D11 are the rising air: circling in thermal A climbs, the same circle in
 * still air sinks, and over the thermal's top the air is still again. D12
 * is the motor it has not got, D13 the belly it lands on, and D14 flies
 * the NRJ's recorded throw, glide and thermal in Node and in headless
 * Chrome and holds the two trace hashes equal. That every other aircraft
 * is unmoved by the two capabilities this plane added to the plant (the
 * drag across the Reynolds numbers and the discus launch) is each one's
 * own gates' and npm run crash:identity's to say. Bands are never widened
 * here: a plant outside one is a finding for the derivation. Run with
 * npm run dlg:gates.
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
  DLG_AIRFRAME, DLG_REST_Z, fly, stallSpeed, attitude, wingDebug, must, dlgGroundPrelude, dlgRecPrelude, RC_STEP_MS,
} from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const th = JSON.parse(await readFile(join(root, 'tests/dlg-thresholds.json'), 'utf8'));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const DEG = 180 / Math.PI;
const SPAN = 1.49;
const G = 9.81;

const sim = await loadSim(wasmBytes);
if (sim.init(configText) !== SIM_OK) throw new Error('sim_init failed');
if (sim.e.sim_set_airframe(DLG_AIRFRAME) !== SIM_OK) throw new Error('sim_set_airframe failed');
if (sim.setCellVoltage(4.1) !== SIM_OK) throw new Error('sim_set_cell_voltage failed');

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
const HIGH = [0, -300, 200, 1, 0, 0, 0];

/* A glide at an airspeed on the harness pilot's airspeed hold, 30 s from
 * 200 m where no thermal is, the mean of the last five: glider-gates.js's. */
function glideAt(speed) {
  const r = fly(sim, { duty: 0, speed0: speed, vTarget: speed, seconds: 30, pitchMin: -0.4, pitchMax: 0.3, trimMax: 0.3, start: HIGH });
  const sink = -r.vz;
  return { v: r.v, sink, ratio: Math.sqrt(Math.max(0, r.v * r.v - r.vz * r.vz)) / sink };
}

/* glider-gates.js's circle: begun already banked where its centre is the
 * one asked for, the mean climb over the last twenty seconds. */
function circleAt({ centre, z, speed, bankDeg, seconds }) {
  const bank = bankDeg / DEG;
  const R = speed * speed / (G * Math.tan(bank));
  const h = bank / 2;
  let sumVz = 0;
  let n = 0;
  let sx = 0;
  let sy = 0;
  const r = fly(sim, {
    duty: 0, speed0: speed, vTarget: speed, holdBank: bank, seconds, pitchMin: -0.4, pitchMax: 0.3, trimMax: 0.3,
    start: [centre[0], centre[1] + R, z, Math.cos(h), Math.sin(h), 0, 0],
    onStep: (o) => {
      if (o.ms >= seconds * 1000 - 20000) {
        sumVz += o.vz;
        sx += o.s[1];
        sy += o.s[2];
        n += 1;
      }
    },
  });
  return { climb: sumVz / n, v: r.v, bankDeg: r.bank * DEG, off: Math.hypot(sx / n - centre[0], sy / n - centre[1]) };
}

/* The discus launch from the grass in a mode, the sticks centred: the
 * release as the first free step sees it, and the top of the zoom. */
function launchFrom(mode) {
  must(sim.reset(), 'sim_reset');
  dlgGroundPrelude(sim);
  must(sim.e.sim_wing_set_stab(mode), 'sim_wing_set_stab');
  const before = sim.readState().state;
  must(sim.e.sim_wing_discus(), 'sim_wing_discus');
  let release = null;
  let releaseMs = null;
  let reach = 0;
  let top = 0;
  for (let ms = 0; ms < 8000; ms += 1) {
    must(sim.input(ms / 1000, 0, 0, 0, 0), 'sim_input');
    must(sim.step(1), 'sim_step');
    const s = sim.readState().state;
    const phase = sim.e.sim_wing_discus_phase();
    if (phase === 1) {
      reach = Math.max(reach, Math.hypot(s[1] - before[1], s[2] - before[2]));
    }
    /* The step the hand opens on leaves the glider at the release, the
     * plant's own from the next. */
    if (release === null && phase === 2) {
      release = s;
      releaseMs = ms + 1;
    }
    top = Math.max(top, s[3]);
  }
  return { before, release, releaseMs, top, reach };
}

console.log('dlg gates: the plant against docs/DLG-STAGE1.md');
check: {
  if (sim.e.sim_airframe() !== DLG_AIRFRAME) {
    gate('D0', 'the NRJ is selected', false, `airframe ${sim.e.sim_airframe()}`, `${DLG_AIRFRAME}`);
    break check;
  }
  must(sim.e.sim_wing_set_stab(0), 'manual');

  const d1 = glideAt(th.d1_glide.speed);
  gate('D1', 'glide ratio', within(d1.ratio, th.d1_glide), `${d1.ratio.toFixed(2)} at ${d1.v.toFixed(2)} m/s, sink ${d1.sink.toFixed(3)}`, band(th.d1_glide));

  let d2 = null;
  for (const V of th.d2_min_sink.speeds) {
    const o = glideAt(V);
    if (!d2 || o.sink < d2.sink) d2 = o;
  }
  gate('D2', 'least sink', within(d2.sink, th.d2_min_sink), `${d2.sink.toFixed(3)} m/s at ${d2.v.toFixed(2)} m/s`, `${band(th.d2_min_sink)} m/s`);

  const d3 = stallSpeed(sim, th.d3_stall.alphaStall, { speed0: th.d3_stall.speed0 });
  gate('D3', 'stall speed', d3 != null && within(d3, th.d3_stall), d3 == null ? 'no stall reached' : `${d3.toFixed(2)} m/s`, band(th.d3_stall));

  const g4 = fly(sim, { duty: 0, speed0: th.d4_roll.speed, vTarget: th.d4_roll.speed, seconds: 15, pitchMin: -0.4, pitchMax: 0.3, trimMax: 0.3, start: HIGH });
  let peak = 0;
  let vAt = g4.v;
  /* The first 0.4 s: the roll's time constant is 0.023 s (dlg-derive.js),
   * so the rate is built long before; after it, the spiral the dihedral
   * and the adverse yaw start puts the nose down and the speed up. */
  for (let ms = 0; ms < 400; ms += RC_STEP_MS) {
    must(sim.input((g4.endMs + ms) / 1000, 1, 0, 0, 0), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    const s = sim.readState().state;
    if (Math.abs(s[11]) > Math.abs(peak)) {
      peak = s[11];
      vAt = Math.hypot(s[4], s[5], s[6]);
    }
  }
  const pb2v = Math.abs(peak) * SPAN / (2 * vAt);
  gate('D4', 'roll, full aileron, pb/2V', within(pb2v, th.d4_roll), `${pb2v.toFixed(3)}: ${Math.abs(peak * DEG).toFixed(0)} deg/s at ${vAt.toFixed(1)} m/s`, band(th.d4_roll));

  const modes = [[0, 'Manual'], [1, 'Stabilised'], [2, 'Acro']].map(([m, name]) => ({ name, ...launchFrom(m) }));
  const tops = modes.map((o) => o.top - DLG_REST_Z);
  gate('D5', 'the discus launch\'s top, every mode', tops.every((t) => within(t, th.d5_launch)), modes.map((o, i) => `${o.name} ${tops[i].toFixed(1)} m`).join(', '), `${band(th.d5_launch)} m over the grass`);

  const r6 = th.d6_release;
  const a = modes[0];
  const rs = a.release;
  const heading = (s) => Math.atan2(2 * (s[7] * s[10] + s[8] * s[9]), 1 - 2 * (s[9] * s[9] + s[10] * s[10]));
  const vRel = Math.hypot(rs[4], rs[5], rs[6]);
  const off = Math.hypot(rs[1] - a.before[1], rs[2] - a.before[2]);
  const dHead = Math.abs(Math.atan2(Math.sin(heading(rs) - heading(a.before)), Math.cos(heading(rs) - heading(a.before)))) * DEG;
  const pitchRel = attitude(rs).pitch * DEG;
  const velPitch = Math.atan2(rs[6], Math.hypot(rs[4], rs[5])) * DEG;
  const ok6 = Math.abs(vRel - r6.speed) < 1e-9 && off < r6.posTol && dHead < r6.angTolDeg && Math.abs(pitchRel - r6.pitchDeg) < r6.angTolDeg
    && Math.abs(velPitch - r6.pitchDeg) < r6.angTolDeg && Math.abs(rs[3] - r6.height) < 1e-9 && Math.abs(a.releaseMs / 1000 - r6.turnS) <= 0.002
    && Math.abs(a.reach - 2 * r6.radius) < r6.posTol;
  gate('D6', 'the release: where, which way, how fast', ok6,
    `${vRel.toFixed(3)} m/s at ${pitchRel.toFixed(2)} deg (path ${velPitch.toFixed(2)}), ${off.toFixed(3)} m from where it lay, heading off ${dHead.toFixed(3)} deg, CG ${rs[3].toFixed(3)} m up, after ${(a.releaseMs / 1000).toFixed(3)} s, the turn ${a.reach.toFixed(3)} m across`,
    `${r6.speed} m/s at ${r6.pitchDeg} deg, ${r6.height} m up, within ${r6.posTol} m and ${r6.angTolDeg} deg, ${r6.turnS} s, ${2 * r6.radius} m across`);

  const drift = (a.top - r6.height) / (r6.speed * r6.speed / (2 * G));
  gate('D7', 'the zoom\'s share of the throw\'s energy', within(drift, th.d7_zoom_drag), `${drift.toFixed(3)}: ${(a.top - r6.height).toFixed(1)} of ${(r6.speed * r6.speed / (2 * G)).toFixed(1)} m`, band(th.d7_zoom_drag));

  /* One step at the zero lift line: the body 3 deg nose down in level air,
   * the elevator neutral, so the lift and the induced drag are nothing and
   * CD is the profile drag alone. */
  const cdAt = (V) => {
    must(sim.reset(), 'sim_reset');
    const h = (-3 / DEG) / 2;
    must(sim.e.sim_set_pose(0, -300, 200, Math.cos(h), 0, -Math.sin(h), 0), 'sim_set_pose');
    must(sim.e.sim_set_velocity(V, 0, 0, 0, 0, 0), 'sim_set_velocity');
    must(sim.input(0, 0, 0, 0, 0), 'sim_input');
    must(sim.step(1), 'sim_step');
    return wingDebug(sim)[4];
  };
  const cd2 = cdAt(2), cd5 = cdAt(5), cd10 = cdAt(10), cd40 = cdAt(40);
  const tol8 = th.d8_drag_re.tol;
  gate('D8', 'the drag across the Reynolds numbers', Math.abs(cd40 / cd10 - 0.5) < 1e-3 && Math.abs(cd2 / cd5 - Math.SQRT2) < 1e-3 && Math.abs(cd5 - 0.024 * Math.sqrt(47180 / (1.225 * 5 * 0.1378 / 1.789e-5))) < 1e-4 + tol8,
    `CD ${cd2.toFixed(5)}, ${cd5.toFixed(5)}, ${cd10.toFixed(5)}, ${cd40.toFixed(5)} at 2, 5, 10, 40 m/s; 40 over 10 ${(cd40 / cd10).toFixed(4)}, 2 over 5 ${(cd2 / cd5).toFixed(4)}`,
    '40 over 10: 0.5, 2 over 5: 1.414, 0.024 at the reference');

  const t9 = th.d9_thermal;
  const circle = (centre, z) => circleAt({ centre, z, speed: t9.speed, bankDeg: t9.bankDeg, seconds: t9.seconds });
  const d9 = circle(t9.core, t9.z);
  gate('D9', 'circling in a thermal climbs', within(d9.climb, t9), `${d9.climb.toFixed(2)} m/s at ${d9.v.toFixed(1)} m/s and ${d9.bankDeg.toFixed(0)} deg, circle ${d9.off.toFixed(1)} m off the core`, `${band(t9)} m/s up`);
  const d10 = circle(th.d10_still.at, t9.z);
  gate('D10', 'the same circle in still air sinks', within(-d10.climb, th.d10_still), `${(-d10.climb).toFixed(3)} m/s down`, `${band(th.d10_still)} m/s down`);
  const d11 = circle(t9.core, th.d11_topped.z);
  gate('D11', 'over the thermal\'s top, still air', Math.abs(d11.climb - d10.climb) <= th.d11_topped.tol, `${(-d11.climb).toFixed(3)} m/s down at ${th.d11_topped.z} m, still air ${(-d10.climb).toFixed(3)}`, `within ${th.d11_topped.tol} m/s of D10`);

  const t12 = th.d12_no_motor;
  const glideTrace = (duty) => {
    must(sim.reset(), 'sim_reset');
    must(sim.e.sim_set_pose(...HIGH), 'sim_set_pose');
    must(sim.e.sim_wing_launch(t12.speed), 'sim_wing_launch');
    let thrust = 0;
    let omega = 0;
    for (let ms = 0; ms < t12.seconds * 1000; ms += RC_STEP_MS) {
      must(sim.input(ms / 1000, 0, 0, 0, duty), 'sim_input');
      must(sim.step(RC_STEP_MS), 'sim_step');
      thrust = Math.max(thrust, Math.abs(wingDebug(sim)[8]));
      const s = sim.readState().state;
      omega = Math.max(omega, Math.abs(s[14]));
    }
    return { s: Array.from(sim.readState().state), thrust, omega };
  };
  const shut = glideTrace(0);
  const open = glideTrace(1);
  const same = shut.s.every((x, i) => Object.is(x, open.s[i]));
  gate('D12', 'no motor: the throttle moves nothing', same && open.thrust === 0 && open.omega === 0,
    `${same ? 'the same state bit for bit' : 'DIFFERENT states'} after ${t12.seconds} s; at full throttle ${open.thrust} N, ${open.omega} rad/s`, 'identical, and nothing pushing or turning');

  /* A glide onto the grass from 3 m, Stabilised holding it level, until it
   * has been still for a second. */
  must(sim.reset(), 'sim_reset');
  dlgGroundPrelude(sim);
  must(sim.e.sim_wing_set_stab(1), 'stab');
  must(sim.e.sim_set_pose(0, 0, 3, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(6), 'sim_wing_launch');
  let still = 0;
  let s13 = null;
  for (let ms = 0; ms < 30000 && still < 1000; ms += RC_STEP_MS) {
    must(sim.input(ms / 1000, 0, 0, 0, 0), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    s13 = sim.readState().state;
    still = Math.hypot(s13[4], s13[5], s13[6]) < 0.02 ? still + RC_STEP_MS : 0;
  }
  const at13 = attitude(s13);
  gate('D13', 'a glide onto the grass rests on the belly', still >= 1000 && Math.abs(s13[3] - th.d13_belly.restZ) <= th.d13_belly.tol && Math.abs(at13.bank * DEG) < 3,
    `${still >= 1000 ? 'at rest' : 'still moving'}, CG ${s13[3].toFixed(4)} m up, pitch ${(at13.pitch * DEG).toFixed(1)} deg, bank ${(at13.bank * DEG).toFixed(1)} deg`,
    `${th.d13_belly.restZ} m within ${th.d13_belly.tol}, wings level`);
  must(sim.e.sim_wing_set_stab(0), 'manual');
}

const quadTh = JSON.parse(await readFile(join(root, 'tests/thresholds.json'), 'utf8'));
const replayBase = { configText, renderHz: quadTh.replay.canonical_render_hz.value, traceStrideMs: quadTh.replay.trace_stride_ms.value };
const rec = decodeRec(new Uint8Array(await readFile(join(root, 'tests/inputs/dlg-baseline.rec'))));
const hashOf = async () => (await replayTrace(await loadSim(wasmBytes), rec, { ...replayBase, prelude: dlgRecPrelude })).slice(0, 16);
const nodeHash = await hashOf();
const nodeAgain = await hashOf();
if (!findChrome()) {
  gate('D14', 'Node and Chrome agree', null, `node ${nodeHash} twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}, no Chrome here`, 'identical');
} else {
  const server = await startServer(root);
  try {
    const out = await runBrowserHarness(`${server.origin}/tests/browser/wing-harness.html?plane=dlg`);
    const result = out.result || {};
    const chromeHash = result.ok ? String(result.hash).slice(0, 16) : `error: ${result.message || result.errorName || JSON.stringify(out).slice(0, 80)}`;
    gate('D14', 'Node and Chrome agree', nodeAgain === nodeHash && result.ok && chromeHash === nodeHash, `node ${nodeHash} (twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}), chrome ${chromeHash}`, 'identical');
  } finally {
    await server.close();
  }
}

console.log('');
for (const [id, name, measured, b, status] of rows) {
  console.log(`  ${status.padEnd(4)}  ${id.padEnd(4)} ${name.padEnd(40)} ${String(measured).padEnd(64)} ${b}`);
}
console.log(`\n${failed ? `${failed} FAILED, ` : ''}${rows.length - failed - skipped} of ${rows.length} gates hold${skipped ? `, ${skipped} SKIPPED (a skip is not a pass)` : ''}`);
process.exit(failed ? 1 : 0);
