/*
 * bramor-gates.js: the Bramor C4EYE's plant against the bands in
 * tests/bramor-thresholds.json.
 *
 * Fourteen checks, B1 to B14, from docs/BRAMOR-STAGE1.md. The first nine
 * fly the plant headless with the pilot in tests/lib/wingpilot.js, as the
 * other fixed wings' gates do, with the catapult in place of the throw:
 * cruise, stall, glide, top speed, roll, turn, climb, the release off the
 * rail and the climb out, and a throttle chop. B10 to B12 pull the
 * parachute from cruise over a ground plane: the descent rate, the
 * attitude under the canopy, and how it comes to rest. B13 replays the
 * five inch and the four other fixed wings and holds their hashes where
 * they were before the Bramor existed; B14 replays the Bramor's two
 * recordings, the catapult flight and the descent, in Node and in headless
 * Chrome and holds the hashes equal. Bands are never widened here: a plant
 * outside one is a finding for the derivation. Run with npm run bramor:gates.
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
import { GROUND_MU } from '../src/game/collide.js';
import {
  BRAMOR_AIRFRAME, levelSpeed, glide, rollRate, turn, bestClimb, stallSpeed, chop, catapultTest, chuteTest,
  bramorPrelude, bramorChutePrelude, wingPrelude, skyPrelude, cubGroundPrelude, gliderRecPrelude,
} from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const th = JSON.parse(await readFile(join(root, 'tests/bramor-thresholds.json'), 'utf8'));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const DEG = 180 / Math.PI;
const SPAN = 2.3;

async function bramorSim() {
  const sim = await loadSim(wasmBytes);
  if (sim.init(configText) !== SIM_OK) throw new Error('sim_init failed');
  if (sim.e.sim_set_airframe(BRAMOR_AIRFRAME) !== SIM_OK) throw new Error('sim_set_airframe failed');
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

console.log('bramor gates: the plant against docs/BRAMOR-STAGE1.md');
const sim = await bramorSim();
check: {
  if (sim.e.sim_airframe() !== BRAMOR_AIRFRAME) {
    gate('B0', 'the Bramor is selected', false, `airframe ${sim.e.sim_airframe()}`, `${BRAMOR_AIRFRAME}`);
    break check;
  }

  const b1 = levelSpeed(sim, th.b1_cruise.duty);
  gate('B1', 'cruise, level at the cruise throttle', within(b1.v, th.b1_cruise), `${b1.v.toFixed(2)} m/s, sink ${(-b1.vz).toFixed(2)}`, band(th.b1_cruise));

  const b2 = stallSpeed(sim, th.b2_stall.alphaStall, { speed0: th.b2_stall.speed0 });
  gate('B2', 'stall speed, power off', b2 != null && within(b2, th.b2_stall), b2 == null ? 'no stall reached' : `${b2.toFixed(2)} m/s`, band(th.b2_stall));

  const b3 = glide(sim, th.b3_glide.speed);
  gate('B3', 'glide ratio at cruise, power off', within(b3.ratio, th.b3_glide), `${b3.ratio.toFixed(2)} at ${b3.v.toFixed(1)} m/s, sink ${b3.sink.toFixed(2)}`, band(th.b3_glide));

  const b4 = levelSpeed(sim, th.b4_top.duty);
  gate('B4', 'top speed, level', within(b4.v, th.b4_top), `${b4.v.toFixed(2)} m/s`, band(th.b4_top));

  const b5 = rollRate(sim, th.b5_roll.duty);
  const pb2v = Math.abs(b5.rateDegS / DEG) * SPAN / (2 * b5.v);
  gate('B5', 'roll rate, full elevon, pb/2V', within(pb2v, th.b5_roll), `${pb2v.toFixed(3)}: ${Math.abs(b5.rateDegS).toFixed(0)} deg/s at ${b5.v.toFixed(1)} m/s`, band(th.b5_roll));

  const b6 = turn(sim, th.b6_turn.duty, th.b6_turn.bankDeg / DEG);
  gate('B6', 'turn radius at a held bank', Math.abs(b6.offPercent) <= th.b6_turn.maxOffPercent, `${b6.radius.toFixed(1)} m at ${b6.bankDeg.toFixed(0)} deg, formula ${b6.formula.toFixed(1)} m, off ${b6.offPercent.toFixed(0)} percent`, `within ${th.b6_turn.maxOffPercent} percent`);

  const b7 = bestClimb(sim, th.b7_climb.speeds);
  gate('B7', 'best climb, full throttle', within(b7.vz, th.b7_climb), `${b7.vz.toFixed(2)} m/s at ${b7.v.toFixed(1)} m/s, pitch ${b7.pitchDeg.toFixed(0)} deg`, band(th.b7_climb));

  const t8 = th.b8_catapult;
  const b8 = catapultTest(sim, { seconds: t8.seconds });
  gate('B8', 'off the catapult and climbing out', b8.vMin >= t8.minSpeed && b8.dzMin >= 0 && b8.dz >= t8.minClimb,
    `slowest ${b8.vMin.toFixed(1)} m/s, lowest ${b8.dzMin.toFixed(2)} m, ${b8.dz.toFixed(1)} m up at ${b8.v.toFixed(1)} m/s after ${t8.seconds} s`,
    `never under ${t8.minSpeed} m/s or the rail, ${t8.minClimb} m up`);

  const b9 = chop(sim);
  gate('B9', 'a throttle chop glides', b9.worstPitchDeg <= th.b9_chop.maxPitchDeg, `worst pitch ${b9.worstPitchDeg.toFixed(1)} deg`, `within ${th.b9_chop.maxPitchDeg} deg`);

  const c = chuteTest(sim, { mu: GROUND_MU });
  const down = c.touchdown !== null;
  gate('B10', 'under the chute: descent rate', down && within(c.sink, th.b10_chute_sink),
    down ? `${c.sink.toFixed(2)} m/s, touchdown ${c.touchdown.t.toFixed(1)} s after the pull, opening load ${c.peakG.toFixed(1)} g` : 'never came down', band(th.b10_chute_sink));
  gate('B11', 'under the chute: on its back', down && c.upzWorst <= th.b11_chute_attitude.maxUpZ,
    down ? `body up axis at ${(Math.acos(-c.upzWorst) * DEG).toFixed(1)} deg from straight down at worst` : 'never came down', `within ${(Math.acos(-th.b11_chute_attitude.maxUpZ) * DEG).toFixed(0)} deg`);
  const r12 = th.b12_chute_rest;
  gate('B12', 'at rest on its back', down && c.rest.upz <= r12.maxUpZ && Math.abs(c.rest.z - r12.restHeight) <= r12.tolerance && c.rest.v === 0 && c.rest.w === 0 && c.rpmAfter === 0,
    `${(Math.acos(-c.rest.upz) * DEG).toFixed(1)} deg from flat, CG ${c.rest.z.toFixed(3)} m up, ${c.rest.v.toFixed(2)} m/s, motor ${c.rpmAfter} rpm`,
    `within ${(Math.acos(-r12.maxUpZ) * DEG).toFixed(0)} deg, ${r12.restHeight} m, stopped`);
}

const quadTh = JSON.parse(await readFile(join(root, 'tests/thresholds.json'), 'utf8'));
const replayBase = { configText, renderHz: quadTh.replay.canonical_render_hz.value, traceStrideMs: quadTh.replay.trace_stride_ms.value };
const recOf = async (p) => decodeRec(new Uint8Array(await readFile(join(root, p))));
const hashOf = async (p, prelude) => (await replayTrace(await loadSim(wasmBytes), await recOf(p), prelude ? { ...replayBase, prelude } : replayBase)).slice(0, 16);
const u = th.b13_unmoved;
const got = {
  quad: await hashOf('tests/inputs/baseline.rec'),
  wing: await hashOf('tests/inputs/wing-baseline.rec', wingPrelude),
  sky: await hashOf('tests/inputs/sky-baseline.rec', skyPrelude),
  cub: await hashOf('tests/inputs/cub-baseline.rec', (s) => cubGroundPrelude(s)),
  radian: await hashOf('tests/inputs/glider-baseline.rec', gliderRecPrelude),
};
gate('B13', 'the five inch and the other wings unmoved', Object.keys(got).every((k) => got[k] === u[k]), Object.values(got).join(', '), Object.keys(got).map((k) => u[k]).join(', '));

const planes = [['bramor', 'tests/inputs/bramor-baseline.rec', bramorPrelude], ['bramor-chute', 'tests/inputs/bramor-chute.rec', bramorChutePrelude]];
const node = [];
for (const [, rec, prelude] of planes) {
  const a = await hashOf(rec, prelude);
  const b = await hashOf(rec, prelude);
  node.push({ hash: a, twice: a === b });
}
if (!findChrome()) {
  gate('B14', 'Node and Chrome agree', null, `node ${node.map((n) => `${n.hash}${n.twice ? '' : ' (DIFFERENT twice)'}`).join(', ')}, no Chrome here`, 'identical');
} else {
  const server = await startServer(root);
  try {
    const chrome = [];
    for (const [plane] of planes) {
      const out = await runBrowserHarness(`${server.origin}/tests/browser/wing-harness.html?plane=${plane}`);
      const result = out.result || {};
      chrome.push(result.ok ? String(result.hash).slice(0, 16) : `error: ${result.message || result.errorName || JSON.stringify(out).slice(0, 80)}`);
    }
    const ok = node.every((n, i) => n.twice && n.hash === chrome[i]);
    gate('B14', 'Node and Chrome agree', ok,
      planes.map(([plane], i) => `${plane}: node ${node[i].hash}${node[i].twice ? '' : ' (DIFFERENT twice)'}, chrome ${chrome[i]}`).join('; '), 'identical');
  } finally {
    await server.close();
  }
}

console.log('');
for (const [id, name, measured, b, status] of rows) {
  console.log(`  ${status.padEnd(4)}  ${id.padEnd(4)} ${name.padEnd(38)} ${String(measured).padEnd(60)} ${b}`);
}
console.log(`\n${failed ? `${failed} FAILED, ` : ''}${rows.length - failed - skipped} of ${rows.length} gates hold${skipped ? `, ${skipped} SKIPPED (a skip is not a pass)` : ''}`);
process.exit(failed ? 1 : 0);
