/*
 * zagi-gates.js: Zagi's 48 in Zagi HP plant against the bands in
 * tests/zagi-thresholds.json.
 *
 * Checks Z1 to Z13 from docs/ZAGI-STAGE1.md, on the pattern of
 * p51-gates.js and edge-gates.js. Z1 to Z5 are its performance: the
 * cruise, the trimmed stall, the glide, the top speed and the climb. Z6
 * to Z8 are what a Zagi pilot feels first: a brisk roll on the elevons,
 * against its derivation and against every other fixed wing's, the pitch
 * sensitivity of a tailless wing with a small margin, and no rudder. Z9
 * and Z10 are its stall, straight and in a turn; Z11 and Z12 the hand
 * throw and the belly landing; Z13 its climb in a thermal. Flown in
 * Manual, so it is the airframe doing it. Z17 holds every other
 * aircraft's recorded hash where it was before this one existed, and Z18
 * flies the Zagi's recording in Node and in headless Chrome and holds the
 * two hashes equal. Bands are never widened here: a plant outside one is
 * a finding for the derivation. Run with npm run zagi:gates.
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
import { replayTrace, sha256Hex } from '../tests/lib/replay.js';
import { decodeRec } from '../tests/lib/recfile.js';
import { findChrome, runBrowserHarness } from '../tests/lib/browser.js';
import { startServer } from '../tests/lib/server.js';
import { GROUND_MU, GROUND_E } from '../src/game/collide.js';
import {
  ZAGI_AIRFRAME, ZAGI_THROW, zagiPrelude, zagiHold, levelSpeed, glide, bestClimb, stallSpeed, fly,
  wingDebug, attitude, must, fullBank, RC_STEP_MS,
  wingPrelude, skyPrelude, cubGroundPrelude, gliderRecPrelude, bramorPrelude, bramorChutePrelude,
  slowstickGroundPrelude, bombshellGroundPrelude, kadetGroundPrelude, timberRecPrelude, timberFloatRecPrelude,
  p51RecPrelude, p51AirPrelude, edgeGroundPrelude, f16GroundPrelude,
} from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const th = JSON.parse(await readFile(join(root, 'tests/zagi-thresholds.json'), 'utf8'));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const DEG = 180 / Math.PI;
const SPAN = 1.2192;
const MASS = 0.7229;
const G = 9.81;

async function zagiSim() {
  const sim = await loadSim(wasmBytes);
  if (sim.init(configText) !== SIM_OK) throw new Error('sim_init failed');
  if (sim.e.sim_set_airframe(ZAGI_AIRFRAME) !== SIM_OK) throw new Error('sim_set_airframe failed');
  if (sim.setCellVoltage(4.1) !== SIM_OK) throw new Error('sim_set_cell_voltage failed');
  must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
  return sim;
}

const rows = [];
let failed = 0;
let skipped = 0;
function gate(id, name, ok, measured, b) {
  rows.push([id, name, measured, b, ok === null ? 'SKIP' : (ok ? 'ok' : 'FAIL')]);
  if (ok === null) skipped += 1;
  else if (!ok) failed += 1;
}
const within = (v, b) => v >= b.min && v <= b.max;
const band = (b) => `${b.min} to ${b.max}`;
const speed = (s) => Math.hypot(s[4], s[5], s[6]);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/* Flights start 600 m to the side of the field's thermals, in still air,
 * the stall guard off: a Zagi cruises under the guard's 9.5 m/s. */
const STILL_AIR = [0, 600, 100, 1, 0, 0, 0];

console.log('zagi gates: the plant against docs/ZAGI-STAGE1.md');
const sim = await zagiSim();

/* Z1 to Z5, the Kadet's and the P-51's measurements, flown longer: the
 * Zagi's speed settles slowly on so clean a wing. */
{
  const r = fly(sim, { duty: th.z1_level_75.duty, speed0: 16, vzTarget: 0, seconds: 45, guard: false, start: STILL_AIR });
  gate('Z1', 'level speed at 75 percent', within(r.v, th.z1_level_75), `${r.v.toFixed(2)} m/s, climb ${r.vz.toFixed(2)}`, band(th.z1_level_75));
}
{
  const v = stallSpeed(sim, th.z2_stall.alphaStall, { speed0: 11 });
  gate('Z2', 'the trimmed stall, power off', v != null && within(v, th.z2_stall), v == null ? 'no stall reached' : `${v.toFixed(2)} m/s`, band(th.z2_stall));
}
{
  const r = fly(sim, { duty: 0, speed0: th.z3_glide.speed, vTarget: th.z3_glide.speed, seconds: 30, guard: false, start: STILL_AIR });
  const sink = -r.vz;
  const ratio = Math.sqrt(Math.max(0, r.v * r.v - r.vz * r.vz)) / sink;
  gate('Z3', 'best glide, power off', within(ratio, th.z3_glide), `${ratio.toFixed(2)} at ${r.v.toFixed(2)} m/s, sink ${sink.toFixed(3)}`, band(th.z3_glide));
}
{
  const r = fly(sim, { duty: th.z4_top.duty, speed0: 26, vzTarget: 0, seconds: 45, guard: false, start: STILL_AIR });
  gate('Z4', 'top speed, level', within(r.v, th.z4_top), `${r.v.toFixed(2)} m/s, climb ${r.vz.toFixed(2)}`, band(th.z4_top));
}
{
  const c = bestClimb(sim, th.z5_climb.speeds);
  gate('Z5', 'best climb, full throttle', within(c.vz, th.z5_climb), `${c.vz.toFixed(2)} m/s at ${c.v.toFixed(1)} m/s, pitch ${c.pitchDeg.toFixed(0)} deg`, band(th.z5_climb));
}

/* Z6: full right elevon from level at 15 m/s, held until it has rolled
 * once round: the helix angle that time gives, the roll's own lag taken
 * off. */
{
  const r = fly(sim, { duty: 0.5, speed0: th.z6_roll.speed, vTarget: th.z6_roll.speed, seconds: 12, guard: false, start: STILL_AIR });
  let prev = fullBank(sim.readState().state);
  let turned = 0;
  let t = null;
  const v0 = speed(sim.readState().state);
  for (let ms = 0; ms < 4000 && t === null; ms += RC_STEP_MS) {
    must(sim.input((r.endMs + ms) / 1000, 1, 0, 0, 0.5), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    const b = fullBank(sim.readState().state);
    turned += wrap(b - prev);
    prev = b;
    if (turned >= 2 * Math.PI) t = (ms + RC_STEP_MS) / 1000;
  }
  const pb2v = t === null ? 0 : (2 * Math.PI / (t - th.z6_roll.tau)) * SPAN / (2 * v0);
  gate('Z6', 'a full elevon roll, as its helix angle', t !== null && within(pb2v, th.z6_roll), t === null ? 'never went round' : `${pb2v.toFixed(4)}: once round in ${t.toFixed(3)} s from ${v0.toFixed(2)} m/s`, band(th.z6_roll));
}

/* Z7: the hands off glide, power off, then a tenth of up stick held:
 * the time to the pitch rate's first peak, and the angle of attack the
 * glide settles to, 12 to 18 s on, per degree of elevon. */
{
  const t = th.z7_pitch;
  const surf = sim.e.malloc(4 * 8);
  const elevon = () => {
    must(sim.e.sim_plane_surfaces(surf), 'sim_plane_surfaces');
    const a = new Float64Array(sim.e.memory.buffer, surf, 4);
    return 0.5 * (a[0] + a[1]);
  };
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_set_pose(...STILL_AIR), 'sim_set_pose');
  must(sim.e.sim_wing_launch(t.speed), 'sim_wing_launch');
  let ms = 0;
  const glideAt = (stick) => {
    const s = sim.readState().state;
    const roll = Math.max(-1, Math.min(1, -1.0 * attitude(s).bank - 0.08 * s[11]));
    must(sim.input(ms / 1000, roll, stick, 0, 0), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    ms += RC_STEP_MS;
  };
  let a0 = 0, n0 = 0;
  for (let k = 0; k < 20000; k += RC_STEP_MS) {
    glideAt(0);
    if (k >= 17000) {
      a0 += wingDebug(sim)[0];
      n0 += 1;
    }
  }
  a0 /= n0;
  let peak = 0, tPeak = 0, a1 = 0, de1 = 0, n1 = 0;
  for (let k = 0; k < 18000; k += RC_STEP_MS) {
    glideAt(t.stick);
    const q = -sim.readState().state[12];
    if (k < 1000 && q > peak) {
      peak = q;
      tPeak = (k + RC_STEP_MS) / 1000;
    }
    if (k >= 12000) {
      a1 += wingDebug(sim)[0];
      de1 += elevon();
      n1 += 1;
    }
  }
  const gain = (a1 / n1 - a0) / (de1 / n1);
  const ok = tPeak >= t.peakMin && tPeak <= t.peakMax && gain >= t.alphaMin && gain <= t.alphaMax;
  gate('Z7', 'pitch sensitivity: the nose answers, the glide moves', ok,
    `pitch rate's peak ${(peak * DEG).toFixed(1)} deg/s at ${tPeak.toFixed(3)} s; ${gain.toFixed(3)} deg of alpha per deg of elevon`,
    `${t.peakMin} to ${t.peakMax} s; ${t.alphaMin} to ${t.alphaMax}`);
}

/* Z8: the same flight with and without full yaw stick. */
{
  const trace = async (yaw) => {
    must(sim.reset(), 'sim_reset');
    zagiPrelude(sim);
    const parts = [];
    for (let ms = 0; ms < 8000; ms += RC_STEP_MS) {
      const s = sim.readState().state;
      const roll = ms > 3000 && ms < 3600 ? 1 : zagiHold(s)[0];
      must(sim.input(ms / 1000, roll, zagiHold(s, { pitch: 0.2 })[1], yaw, 0.8), 'sim_input');
      must(sim.step(RC_STEP_MS), 'sim_step');
      parts.push(new Uint8Array(new Float64Array(s).buffer));
    }
    return (await sha256Hex(parts)).slice(0, 16);
  };
  const a = await trace(0), b = await trace(1), c = await trace(-1);
  gate('Z8', 'no rudder: full yaw stick changes nothing', a === b && a === c, `${a}, ${b}, ${c}`, 'identical');
}

/* Z9: the straight stall. */
{
  const t = th.z9_stall;
  const r = fly(sim, { duty: 0.3, speed0: 10.3, vTarget: 10.3, seconds: 10, guard: false, start: STILL_AIR });
  const entry = attitude(sim.readState().state).pitch;
  let maxBank = 0, maxPitch = 0, rose = false, broke = null, mushA = [], mushSink = [];
  const total = (t.breakWithinS + 1 + t.mushS + 1) * 1000;
  for (let ms = 0; ms < total; ms += RC_STEP_MS) {
    must(sim.input((r.endMs + ms) / 1000, 0, 1, 0, 0), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    const s = sim.readState().state;
    const a = attitude(s);
    maxBank = Math.max(maxBank, Math.abs(fullBank(s)));
    maxPitch = Math.max(maxPitch, Math.abs(a.pitch));
    if (a.pitch > entry + 5 / DEG) rose = true;
    if (rose && broke === null && a.pitch < 0) broke = ms / 1000;
    if (ms >= total - t.mushS * 1000) {
      mushA.push(wingDebug(sim)[0]);
      mushSink.push(-s[6]);
    }
  }
  const aMin = Math.min(...mushA), sink = mushSink.reduce((x, y) => x + y) / mushSink.length;
  const ok = maxBank * DEG <= t.maxBankDeg && broke !== null && broke <= t.breakWithinS && aMin > th.z2_stall.alphaStall
    && sink >= t.sinkMin && sink <= t.sinkMax && maxPitch * DEG < t.maxPitchDeg;
  gate('Z9', 'the straight stall: balloons, breaks, mushes', ok,
    `bank ${(maxBank * DEG).toFixed(1)} deg, broke ${broke === null ? 'never' : `at ${broke.toFixed(2)} s`}, mush alpha from ${(aMin * DEG).toFixed(1)} deg sinking ${sink.toFixed(2)}, pitch within ${(maxPitch * DEG).toFixed(0)}`,
    `bank under ${t.maxBankDeg}, break by ${t.breakWithinS} s, past the stall sinking ${t.sinkMin} to ${t.sinkMax}`);
}

/* Z10: the stall in a turn, with too much control and without. */
{
  const t = th.z10_turn_stall;
  const pull = (roll) => {
    const r = fly(sim, { duty: 0.3, speed0: 10.3, vTarget: 10.3, holdBank: t.bankDeg / DEG, seconds: 10, guard: false, start: STILL_AIR });
    let prev = fullBank(sim.readState().state);
    let turned = 0, most = 0;
    for (let ms = 0; ms < t.withinS * 1000; ms += RC_STEP_MS) {
      const s = sim.readState().state;
      const hold = Math.max(-1, Math.min(1, -1.0 * (fullBank(s) - t.bankDeg / DEG) - 0.08 * s[11]));
      must(sim.input((r.endMs + ms) / 1000, roll === null ? hold : roll, Math.min(1, ms / (t.pullS * 1000)), 0, 0), 'sim_input');
      must(sim.step(RC_STEP_MS), 'sim_step');
      const b = fullBank(sim.readState().state);
      turned += wrap(b - prev);
      prev = b;
      most = Math.max(most, Math.abs(turned));
    }
    return most * DEG;
  };
  const spun = pull(1), calm = pull(null);
  gate('Z10', 'a stall in a turn: too much control spins it', spun >= t.spinDeg && calm <= t.calmDeg,
    `full roll held: ${spun.toFixed(0)} deg round; the bank held: within ${calm.toFixed(0)} deg`, `${t.spinDeg} deg or more; within ${t.calmDeg}`);
}

/* Z11: the hand throw. */
{
  const t = th.z11_throw;
  must(sim.reset(), 'sim_reset');
  zagiPrelude(sim, { mu: GROUND_MU, e: GROUND_E });
  let low = ZAGI_THROW.height, touched = false;
  for (let ms = 0; ms < t.afterS * 1000; ms += RC_STEP_MS) {
    const s = sim.readState().state;
    const motor = ms >= t.motorOffS * 1000;
    const [roll, pitch] = zagiHold(s, { pitch: motor ? 0.35 : 0.03 });
    must(sim.input(ms / 1000, roll, pitch, 0, motor ? 1 : 0), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    low = Math.min(low, sim.readState().state[3]);
    if (sim.e.sim_ground_contacts() > 0) touched = true;
  }
  const z = sim.readState().state[3];
  gate('Z11', 'a hand throw, the motor off, flies away', !touched && z > t.minHeight, `lowest ${low.toFixed(2)} m, ${z.toFixed(1)} m after ${t.afterS} s${touched ? ', TOUCHED' : ''}`, `no contact, above ${t.minHeight} m`);
}

/* Z12: the belly landing. */
{
  const t = th.z12_belly;
  must(sim.reset(), 'sim_reset');
  zagiPrelude(sim, { mu: GROUND_MU, e: GROUND_E });
  must(sim.e.sim_set_pose(0, 600, t.z0, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(1.3 * th.z2_stall.derived), 'sim_wing_launch');
  let touchX = null;
  let s = sim.readState().state;
  for (let ms = 0; ms < 15000; ms += RC_STEP_MS) {
    const flare = s[3] < 0.6;
    const [roll, pitch] = zagiHold(s, { pitch: flare ? 0.10 : -0.03 });
    must(sim.input(ms / 1000, roll, touchX === null ? pitch : 0, 0, 0), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    s = sim.readState().state;
    if (touchX === null && sim.e.sim_ground_contacts() > 0) touchX = s[1];
  }
  const a = attitude(s);
  const slide = touchX === null ? null : s[1] - touchX;
  const ok = touchX !== null && Math.hypot(s[4], s[5]) < 0.05 && Math.abs(fullBank(s)) * DEG <= t.maxBankDeg
    && Math.abs(a.pitch) * DEG <= t.maxPitchDeg && Math.abs(s[3] - t.restZ) <= t.restTol && slide <= t.maxSlide;
  gate('Z12', 'a belly landing slides to rest upright', ok,
    touchX === null ? 'never touched down' : `slid ${slide.toFixed(1)} m, at rest ${s[3].toFixed(4)} m up, bank ${(fullBank(s) * DEG).toFixed(1)}, pitch ${(a.pitch * DEG).toFixed(1)} deg`,
    `rest at ${t.restZ} +- ${t.restTol} m, level within ${t.maxBankDeg} and ${t.maxPitchDeg} deg, under ${t.maxSlide} m`);
}

/* Z13: circling in the first thermal's core, power off, and the same
 * circle in still air. Started on the circle, heading +x with the core
 * to the right. */
{
  const t = th.z13_thermal;
  const circle = (x, y) => {
    fly(sim, {
      duty: 0, speed0: t.speed, vTarget: t.speed, holdBank: t.bankDeg / DEG, seconds: t.seconds, guard: false,
      start: [x, y, 120, 1, 0, 0, 0], pitchMin: -0.4, pitchMax: 0.4,
    });
    return (sim.readState().state[3] - 120) / t.seconds;
  };
  const inCore = circle(t.core[0], t.core[1] + t.radius);
  const still = circle(0, 600);
  gate('Z13', 'it climbs circling in a thermal', inCore >= t.minClimb && still < 0,
    `${inCore.toFixed(2)} m/s over ${t.seconds} s round the core, ${still.toFixed(2)} m/s in still air`, `at least ${t.minClimb} m/s up, sinking without`);
}

const quadTh = JSON.parse(await readFile(join(root, 'tests/thresholds.json'), 'utf8'));
const replayBase = { configText, renderHz: quadTh.replay.canonical_render_hz.value, traceStrideMs: quadTh.replay.trace_stride_ms.value };
const recOf = async (f) => decodeRec(new Uint8Array(await readFile(join(root, f))));
const hashOf = async (f, prelude) => (await replayTrace(await loadSim(wasmBytes), await recOf(f), { ...replayBase, prelude })).slice(0, 16);
const u = th.z17_unmoved;
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
  kadet: await hashOf('tests/inputs/kadet-baseline.rec', (s) => kadetGroundPrelude(s)),
  timber: await hashOf('tests/inputs/timber-baseline.rec', timberRecPrelude),
  timberf: await hashOf('tests/inputs/timberf-baseline.rec', timberFloatRecPrelude),
  p51: await hashOf('tests/inputs/p51-baseline.rec', p51RecPrelude),
  p51Air: await hashOf('tests/inputs/p51-air.rec', p51AirPrelude),
  edge: await hashOf('tests/inputs/edge-baseline.rec', (s) => edgeGroundPrelude(s)),
  f16: await hashOf('tests/inputs/f16-baseline.rec', (s) => f16GroundPrelude(s)),
};
const names = Object.keys(got);
gate('Z17', 'every other aircraft unmoved', names.every((k) => got[k] === u[k]),
  names.filter((k) => got[k] !== u[k]).map((k) => `${k} ${got[k]}`).join(', ') || `all ${names.length} the same`, `${names.length} stored hashes`);

const zagiRec = await recOf('tests/inputs/zagi-baseline.rec');
const zagiOpts = { ...replayBase, prelude: (s) => zagiPrelude(s) };
const nodeHash = (await replayTrace(await loadSim(wasmBytes), zagiRec, zagiOpts)).slice(0, 16);
const nodeAgain = (await replayTrace(await loadSim(wasmBytes), zagiRec, zagiOpts)).slice(0, 16);
if (!findChrome()) {
  gate('Z18', 'Node and Chrome agree', null, `node ${nodeHash} twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}, no Chrome here`, 'identical');
} else {
  const server = await startServer(root);
  try {
    const out = await runBrowserHarness(`${server.origin}/tests/browser/wing-harness.html?plane=zagi`);
    const result = out.result || {};
    const chromeHash = result.ok ? String(result.hash).slice(0, 16) : `error: ${result.message || result.errorName || JSON.stringify(out).slice(0, 80)}`;
    gate('Z18', 'Node and Chrome agree', nodeAgain === nodeHash && result.ok && chromeHash === nodeHash, `node ${nodeHash} (twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}), chrome ${chromeHash}`, 'identical');
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
