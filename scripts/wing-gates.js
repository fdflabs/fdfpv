/*
 * wing-gates.js: the wing plant against the bands in tests/wing-thresholds.json.
 *
 * Eleven checks, W1 to W11, from docs/WING-STAGE1.md. The first nine fly
 * the plant headless with the pilot in tests/lib/wingpilot.js and read a
 * number; W10 replays the five inch's baseline and holds its hash where
 * it was before the wing existed; W11 flies the scripted flight in Node
 * and in headless Chrome and holds the two trace hashes equal. Bands are
 * never widened here: a plant outside one is a finding for the
 * derivation. Run with npm run wing:gates.
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
import {
  WING_AIRFRAME, levelSpeed, glide, rollRate, turn, bestClimb, stallSpeed, throwTest, chop, wingPrelude,
} from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const th = JSON.parse(await readFile(join(root, 'tests/wing-thresholds.json'), 'utf8'));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');

async function wingSim() {
  const sim = await loadSim(wasmBytes);
  if (sim.init(configText) !== SIM_OK) throw new Error('sim_init failed');
  if (sim.e.sim_set_airframe(WING_AIRFRAME) !== SIM_OK) throw new Error('sim_set_airframe failed');
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

console.log('wing gates: the plant against docs/WING-STAGE1.md');
const sim = await wingSim();

const w1 = levelSpeed(sim, th.w1_level_65.duty);
gate('W1', 'level speed at 65 percent', within(w1.v, th.w1_level_65), `${w1.v.toFixed(2)} m/s, sink ${(-w1.vz).toFixed(2)}`, `${th.w1_level_65.min} to ${th.w1_level_65.max}`);

const alphaStall = 0.90 / 4.36;
const w2 = stallSpeed(sim, alphaStall);
gate('W2', 'stall speed, power off', w2 != null && within(w2, th.w2_stall), w2 == null ? 'no stall reached' : `${w2.toFixed(2)} m/s`, `${th.w2_stall.min} to ${th.w2_stall.max}`);

const w3 = glide(sim, th.w3_glide.speed);
gate('W3', 'glide ratio, power off', within(w3.ratio, th.w3_glide), `${w3.ratio.toFixed(2)} at ${w3.v.toFixed(1)} m/s, sink ${w3.sink.toFixed(2)}`, `${th.w3_glide.min} to ${th.w3_glide.max}`);

const w4 = levelSpeed(sim, th.w4_top.duty);
gate('W4', 'top speed, level', within(w4.v, th.w4_top), `${w4.v.toFixed(2)} m/s`, `${th.w4_top.min} to ${th.w4_top.max}`);

const w5 = rollRate(sim, th.w5_roll.duty);
gate('W5', 'roll rate, full elevon', within(Math.abs(w5.rateDegS), th.w5_roll), `${Math.abs(w5.rateDegS).toFixed(0)} deg/s at ${w5.v.toFixed(1)} m/s`, `${th.w5_roll.min} to ${th.w5_roll.max}`);

const w6 = turn(sim, th.w6_turn.duty, th.w6_turn.bankDeg * Math.PI / 180);
gate('W6', 'turn radius at a held bank', Math.abs(w6.offPercent) <= th.w6_turn.maxOffPercent, `${w6.radius.toFixed(1)} m at ${w6.bankDeg.toFixed(0)} deg, formula ${w6.formula.toFixed(1)} m, off ${w6.offPercent.toFixed(0)} percent`, `within ${th.w6_turn.maxOffPercent} percent`);

const w7 = bestClimb(sim);
gate('W7', 'best climb, full throttle', within(w7.vz, th.w7_climb), `${w7.vz.toFixed(2)} m/s at ${w7.v.toFixed(1)} m/s, pitch ${w7.pitchDeg.toFixed(0)} deg`, `${th.w7_climb.min} to ${th.w7_climb.max}`);

const w8 = throwTest(sim);
gate('W8', 'a hand throw flies away', w8.z >= th.w8_throw.minAltitude && w8.v >= th.w8_throw.minSpeed, `${w8.z.toFixed(1)} m and ${w8.v.toFixed(1)} m/s after 3 s`, `above ${th.w8_throw.minAltitude} m, faster than ${th.w8_throw.minSpeed} m/s`);

const w9 = chop(sim);
gate('W9', 'a throttle chop glides', w9.worstPitchDeg <= th.w9_chop.maxPitchDeg, `worst pitch ${w9.worstPitchDeg.toFixed(1)} deg`, `within ${th.w9_chop.maxPitchDeg} deg`);

const quad = await loadSim(wasmBytes);
const rec = decodeRec(new Uint8Array(await readFile(join(root, 'tests/inputs/baseline.rec'))));
const quadTh = JSON.parse(await readFile(join(root, 'tests/thresholds.json'), 'utf8'));
const quadHash = (await replayTrace(quad, rec, { configText, renderHz: quadTh.replay.canonical_render_hz.value, traceStrideMs: quadTh.replay.trace_stride_ms.value })).slice(0, 16);
gate('W10', 'the five inch unmoved', quadHash === th.w10_quad_hash.expected, quadHash, th.w10_quad_hash.expected);

const wingRec = decodeRec(new Uint8Array(await readFile(join(root, 'tests/inputs/wing-baseline.rec'))));
const replayOpts = { configText, renderHz: quadTh.replay.canonical_render_hz.value, traceStrideMs: quadTh.replay.trace_stride_ms.value, prelude: wingPrelude };
const nodeHash = (await replayTrace(await loadSim(wasmBytes), wingRec, replayOpts)).slice(0, 16);
const nodeAgain = (await replayTrace(await loadSim(wasmBytes), wingRec, replayOpts)).slice(0, 16);
if (!findChrome()) {
  gate('W11', 'Node and Chrome agree', null, `node ${nodeHash} twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}, no Chrome here`, 'identical');
} else {
  const server = await startServer(root);
  try {
    const out = await runBrowserHarness(`${server.origin}/tests/browser/wing-harness.html`);
    const result = out.result || {};
    const chromeHash = result.ok ? String(result.hash).slice(0, 16) : `error: ${result.message || result.errorName || JSON.stringify(out).slice(0, 80)}`;
    gate('W11', 'Node and Chrome agree', nodeAgain === nodeHash && result.ok && chromeHash === nodeHash, `node ${nodeHash} (twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}), chrome ${chromeHash}`, 'identical');
  } finally {
    await server.close();
  }
}

console.log('');
for (const [id, name, measured, band, status] of rows) {
  console.log(`  ${status.padEnd(4)}  ${id.padEnd(4)} ${name.padEnd(32)} ${String(measured).padEnd(52)} ${band}`);
}
console.log(`\n${failed ? `${failed} FAILED, ` : ''}${rows.length - failed - skipped} of ${rows.length} gates hold${skipped ? `, ${skipped} SKIPPED (a skip is not a pass)` : ''}`);
process.exit(failed ? 1 : 0);
