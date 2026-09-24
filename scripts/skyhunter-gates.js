/*
 * skyhunter-gates.js: the Skyhunter plant against the bands in
 * tests/skyhunter-thresholds.json.
 *
 * Sixteen checks, S1 to S16, from docs/SKYHUNTER-STAGE1.md, on the
 * pattern of wing-gates.js. S1 to S9 are the wing's nine flown with the
 * Skyhunter's numbers; S10 to S13 are what a tail and a rudder add, the
 * phugoid, the sideslip and yaw rate full rudder gives, and the roll the
 * rudder makes through dihedral; S14 is the prop's reaction at a
 * standstill. S15 holds the five inch's and the wing's recorded hashes
 * where they were before the Skyhunter existed, because one plant now
 * flies both fixed wings. S16 flies the Skyhunter's recording in Node and
 * in headless Chrome and holds the two trace hashes equal. Bands are never
 * widened here: a plant outside one is a finding for the derivation. Run
 * with npm run skyhunter:gates.
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
  SKY_AIRFRAME, levelSpeed, glide, rollRate, turn, bestClimb, stallSpeed, throwTest, chop, phugoid, rudderStep,
  propTorque, skyPrelude, wingPrelude,
} from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const th = JSON.parse(await readFile(join(root, 'tests/skyhunter-thresholds.json'), 'utf8'));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');

async function skySim() {
  const sim = await loadSim(wasmBytes);
  if (sim.init(configText) !== SIM_OK) throw new Error('sim_init failed');
  if (sim.e.sim_set_airframe(SKY_AIRFRAME) !== SIM_OK) throw new Error('sim_set_airframe failed');
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

console.log('skyhunter gates: the plant against docs/SKYHUNTER-STAGE1.md');
const sim = await skySim();
check: {
  if (sim.e.sim_airframe() !== SKY_AIRFRAME) {
    gate('S0', 'the Skyhunter is selected', false, `airframe ${sim.e.sim_airframe()}`, `${SKY_AIRFRAME}`);
    break check;
  }

  const s1 = levelSpeed(sim, th.s1_level_65.duty);
  gate('S1', 'level speed at 65 percent', within(s1.v, th.s1_level_65), `${s1.v.toFixed(2)} m/s, sink ${(-s1.vz).toFixed(2)}`, band(th.s1_level_65));

  const s2 = stallSpeed(sim, th.s2_stall.alphaStall);
  gate('S2', 'stall speed, power off', s2 != null && within(s2, th.s2_stall), s2 == null ? 'no stall reached' : `${s2.toFixed(2)} m/s`, band(th.s2_stall));

  const s3 = glide(sim, th.s3_glide.speed);
  gate('S3', 'glide ratio, power off', within(s3.ratio, th.s3_glide), `${s3.ratio.toFixed(2)} at ${s3.v.toFixed(1)} m/s, sink ${s3.sink.toFixed(2)}`, band(th.s3_glide));

  const s4 = levelSpeed(sim, th.s4_top.duty);
  gate('S4', 'top speed, level', within(s4.v, th.s4_top), `${s4.v.toFixed(2)} m/s`, band(th.s4_top));

  const s5 = rollRate(sim, th.s5_roll.duty);
  gate('S5', 'roll rate, full aileron', within(Math.abs(s5.rateDegS), th.s5_roll), `${Math.abs(s5.rateDegS).toFixed(0)} deg/s at ${s5.v.toFixed(1)} m/s`, band(th.s5_roll));

  const s6 = turn(sim, th.s6_turn.duty, th.s6_turn.bankDeg * Math.PI / 180);
  gate('S6', 'turn radius at a held bank', Math.abs(s6.offPercent) <= th.s6_turn.maxOffPercent, `${s6.radius.toFixed(1)} m at ${s6.bankDeg.toFixed(0)} deg, formula ${s6.formula.toFixed(1)} m, off ${s6.offPercent.toFixed(0)} percent`, `within ${th.s6_turn.maxOffPercent} percent`);

  const s7 = bestClimb(sim);
  gate('S7', 'best climb, full throttle', within(s7.vz, th.s7_climb), `${s7.vz.toFixed(2)} m/s at ${s7.v.toFixed(1)} m/s, pitch ${s7.pitchDeg.toFixed(0)} deg`, band(th.s7_climb));

  const s8 = throwTest(sim, { speed: th.s8_throw.speed, duty: th.s8_throw.duty, up: th.s8_throw.up });
  gate('S8', 'a hand throw flies away', s8.z >= th.s8_throw.minAltitude && s8.v >= th.s8_throw.minSpeed, `${s8.z.toFixed(1)} m and ${s8.v.toFixed(1)} m/s after 3 s`, `above ${th.s8_throw.minAltitude} m, faster than ${th.s8_throw.minSpeed} m/s`);

  const s9 = chop(sim);
  gate('S9', 'a throttle chop glides', s9.worstPitchDeg <= th.s9_chop.maxPitchDeg, `worst pitch ${s9.worstPitchDeg.toFixed(1)} deg`, `within ${th.s9_chop.maxPitchDeg} deg`);

  const s10 = phugoid(sim);
  gate('S10', 'phugoid period', s10.period != null && within(s10.period, th.s10_phugoid), s10.period == null ? `no oscillation, swing ${s10.swing.toFixed(2)} m/s` : `${s10.period.toFixed(2)} s over ${s10.cycles} cycles, swing ${s10.swing.toFixed(1)} m/s about ${s10.mean.toFixed(1)}`, band(th.s10_phugoid));

  /* Full right rudder yaws the nose right, which puts the wind on the
   * left: a negative sideslip in the aero sign. */
  const s11 = rudderStep(sim, { wingsLevel: true });
  gate('S11', 'full rudder, wings level: sideslip', s11.betaDeg < 0 && within(-s11.betaDeg, th.s11_sideslip), `${(-s11.betaDeg).toFixed(1)} deg, ${s11.betaDeg < 0 ? 'wind from the left' : 'WRONG SIDE'}`, `${band(th.s11_sideslip)} deg, wind from the left`);

  const s12 = rudderStep(sim, { wingsLevel: false });
  gate('S12', 'full rudder: peak yaw rate', within(s12.peakRDegS, th.s12_yaw_rate), `${s12.peakRDegS.toFixed(0)} deg/s nose right at ${s12.v.toFixed(1)} m/s`, `${band(th.s12_yaw_rate)} deg/s`);
  gate('S13', 'full rudder: roll from dihedral', within(s12.bankDeg, th.s13_rudder_roll), `${s12.bankDeg.toFixed(1)} deg after 2 s, ${s12.bankDeg > 0 ? 'right wing down' : 'WRONG WAY'}`, `${band(th.s13_rudder_roll)} deg, right wing down`);

  const s14 = propTorque(sim);
  gate('S14', 'prop torque, static full throttle', s14.rollMoment < 0 && within(-s14.rollMoment, th.s14_prop_torque), `${(-s14.rollMoment).toFixed(3)} N m ${s14.rollMoment < 0 ? 'rolling left' : 'WRONG WAY'} at ${s14.thrust.toFixed(1)} N`, `${band(th.s14_prop_torque)} N m, rolling left`);
}

const quadTh = JSON.parse(await readFile(join(root, 'tests/thresholds.json'), 'utf8'));
const replayBase = { configText, renderHz: quadTh.replay.canonical_render_hz.value, traceStrideMs: quadTh.replay.trace_stride_ms.value };
const quadRec = decodeRec(new Uint8Array(await readFile(join(root, 'tests/inputs/baseline.rec'))));
const quadHash = (await replayTrace(await loadSim(wasmBytes), quadRec, replayBase)).slice(0, 16);
const wingRec = decodeRec(new Uint8Array(await readFile(join(root, 'tests/inputs/wing-baseline.rec'))));
const wingHash = (await replayTrace(await loadSim(wasmBytes), wingRec, { ...replayBase, prelude: wingPrelude })).slice(0, 16);
gate('S15', 'the five inch and the wing unmoved', quadHash === th.s15_unmoved.quad && wingHash === th.s15_unmoved.wing, `quad ${quadHash}, wing ${wingHash}`, `${th.s15_unmoved.quad}, ${th.s15_unmoved.wing}`);

const skyRec = decodeRec(new Uint8Array(await readFile(join(root, 'tests/inputs/sky-baseline.rec'))));
const skyOpts = { ...replayBase, prelude: skyPrelude };
const nodeHash = (await replayTrace(await loadSim(wasmBytes), skyRec, skyOpts)).slice(0, 16);
const nodeAgain = (await replayTrace(await loadSim(wasmBytes), skyRec, skyOpts)).slice(0, 16);
if (!findChrome()) {
  gate('S16', 'Node and Chrome agree', null, `node ${nodeHash} twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}, no Chrome here`, 'identical');
} else {
  const server = await startServer(root);
  try {
    const out = await runBrowserHarness(`${server.origin}/tests/browser/wing-harness.html?plane=sky`);
    const result = out.result || {};
    const chromeHash = result.ok ? String(result.hash).slice(0, 16) : `error: ${result.message || result.errorName || JSON.stringify(out).slice(0, 80)}`;
    gate('S16', 'Node and Chrome agree', nodeAgain === nodeHash && result.ok && chromeHash === nodeHash, `node ${nodeHash} (twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}), chrome ${chromeHash}`, 'identical');
  } finally {
    await server.close();
  }
}

console.log('');
for (const [id, name, measured, b, status] of rows) {
  console.log(`  ${status.padEnd(4)}  ${id.padEnd(4)} ${name.padEnd(36)} ${String(measured).padEnd(56)} ${b}`);
}
console.log(`\n${failed ? `${failed} FAILED, ` : ''}${rows.length - failed - skipped} of ${rows.length} gates hold${skipped ? `, ${skipped} SKIPPED (a skip is not a pass)` : ''}`);
process.exit(failed ? 1 : 0);
