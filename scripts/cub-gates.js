/*
 * cub-gates.js: the Cub plant against the bands in tests/cub-thresholds.json.
 *
 * Twenty three checks, C1 to C23, from docs/CUB-STAGE1.md, on the pattern
 * of skyhunter-gates.js. C1 to C14 are the Skyhunter's fourteen flown with
 * the Cub's numbers, C5 as a helix angle since the Cub is slower than the
 * speed the Skyhunter's roll is measured at. C15 is the tractor's P factor.
 * C16 to C21 are the landing gear: standing on it, a take off roll from
 * rest with its distance and liftoff speed, the roll tracking straight, a
 * taxi turn on the tailwheel, a landing on the wheels, and a prop strike.
 * C22 holds the five inch's, the wing's and the Skyhunter's recorded hashes
 * where they were before the Cub existed. C23 flies the Cub's recorded take
 * off in Node and in headless Chrome and holds the two trace hashes equal.
 * Bands are never widened here: a plant outside one is a finding for the
 * derivation. Run with npm run cub:gates.
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
  CUB_AIRFRAME, levelSpeed, glide, rollRate, turn, bestClimb, stallSpeed, throwTest, chop, phugoid, rudderStep,
  propTorque, fly, wingDebug, wheelLoads, attitude, must, takeoffSticks, cubGroundPrelude, skyPrelude, wingPrelude,
  RC_STEP_MS,
} from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const th = JSON.parse(await readFile(join(root, 'tests/cub-thresholds.json'), 'utf8'));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const DEG = 180 / Math.PI;
const SPAN = 1.4;

async function cubSim() {
  const sim = await loadSim(wasmBytes);
  if (sim.init(configText) !== SIM_OK) throw new Error('sim_init failed');
  if (sim.e.sim_set_airframe(CUB_AIRFRAME) !== SIM_OK) throw new Error('sim_set_airframe failed');
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
const speed = (s) => Math.hypot(s[4], s[5], s[6]);

/* On the strip, a clock, and a step that says whether the wheels carry the
 * aircraft and whether the hull touched. */
let clockMs = 0;
function onStrip(sim) {
  must(sim.reset(), 'sim_reset');
  cubGroundPrelude(sim, { mu: GROUND_MU, e: GROUND_E });
  clockMs = 0;
}
function step(sim, sticks) {
  must(sim.input(clockMs / 1000, ...sticks), 'sim_input');
  must(sim.step(RC_STEP_MS), 'sim_step');
  clockMs += RC_STEP_MS;
  const s = sim.readState().state;
  const loads = wheelLoads(sim);
  return { s, loads, loaded: loads.some((f) => f > 0), hull: sim.e.sim_ground_contacts() };
}

/* The take off from rest: the pilot of takeoffSticks, and liftoff as the
 * last step on the wheels before 200 ms clear of them. */
function takeoff(sim, { mode = 0 } = {}) {
  must(sim.e.sim_wing_set_stab(mode), 'sim_wing_set_stab');
  onStrip(sim);
  for (let ms = 0; ms < 1000; ms += RC_STEP_MS) step(sim, [0, 0, 0, 0]);
  const x0 = sim.readState().state[1];
  let last = null;
  let off = 0;
  let worstHeading = 0;
  let worstY = 0;
  let o = { s: sim.readState().state, loaded: true };
  for (let ms = 0; ms < 8000; ms += RC_STEP_MS) {
    o = step(sim, takeoffSticks(o.s, { vRotate: th.c17_takeoff.vRotate }));
    if (o.loaded) {
      last = { dist: o.s[1] - x0, v: speed(o.s), t: ms / 1000, heading: heading(o.s), y: o.s[2] };
      worstHeading = Math.max(worstHeading, Math.abs(heading(o.s)));
      worstY = Math.max(worstY, Math.abs(o.s[2]));
      off = 0;
    } else {
      off += RC_STEP_MS;
      if (off >= 200) {
        return { ...last, worstHeading, worstY };
      }
    }
  }
  return null;
}

console.log('cub gates: the plant against docs/CUB-STAGE1.md');
const sim = await cubSim();
check: {
  if (sim.e.sim_airframe() !== CUB_AIRFRAME) {
    gate('C0', 'the Cub is selected', false, `airframe ${sim.e.sim_airframe()}`, `${CUB_AIRFRAME}`);
    break check;
  }

  const c1 = levelSpeed(sim, th.c1_level_75.duty);
  gate('C1', 'level speed at 75 percent', within(c1.v, th.c1_level_75), `${c1.v.toFixed(2)} m/s, sink ${(-c1.vz).toFixed(2)}`, band(th.c1_level_75));

  const c2 = stallSpeed(sim, th.c2_stall.alphaStall);
  gate('C2', 'stall speed, power off', c2 != null && within(c2, th.c2_stall), c2 == null ? 'no stall reached' : `${c2.toFixed(2)} m/s`, band(th.c2_stall));

  const c3 = glide(sim, th.c3_glide.speed);
  gate('C3', 'glide ratio, power off', within(c3.ratio, th.c3_glide), `${c3.ratio.toFixed(2)} at ${c3.v.toFixed(1)} m/s, sink ${c3.sink.toFixed(2)}`, band(th.c3_glide));

  const c4 = levelSpeed(sim, th.c4_top.duty);
  gate('C4', 'top speed, level', within(c4.v, th.c4_top), `${c4.v.toFixed(2)} m/s`, band(th.c4_top));

  const c5 = rollRate(sim, th.c5_roll.duty);
  const pb2v = Math.abs(c5.rateDegS / DEG) * SPAN / (2 * c5.v);
  gate('C5', 'roll rate, full aileron, pb/2V', within(pb2v, th.c5_roll), `${pb2v.toFixed(3)}: ${Math.abs(c5.rateDegS).toFixed(0)} deg/s at ${c5.v.toFixed(1)} m/s`, band(th.c5_roll));

  const c6 = turn(sim, th.c6_turn.duty, th.c6_turn.bankDeg / DEG);
  gate('C6', 'turn radius at a held bank', Math.abs(c6.offPercent) <= th.c6_turn.maxOffPercent, `${c6.radius.toFixed(1)} m at ${c6.bankDeg.toFixed(0)} deg, formula ${c6.formula.toFixed(1)} m, off ${c6.offPercent.toFixed(0)} percent`, `within ${th.c6_turn.maxOffPercent} percent`);

  const c7 = bestClimb(sim, th.c7_climb.speeds);
  gate('C7', 'best climb, full throttle', within(c7.vz, th.c7_climb), `${c7.vz.toFixed(2)} m/s at ${c7.v.toFixed(1)} m/s, pitch ${c7.pitchDeg.toFixed(0)} deg`, band(th.c7_climb));

  const c8 = throwTest(sim, { speed: th.c8_throw.speed, duty: th.c8_throw.duty, up: th.c8_throw.up });
  gate('C8', 'a hand throw flies away', c8.z >= th.c8_throw.minAltitude && c8.v >= th.c8_throw.minSpeed, `${c8.z.toFixed(1)} m and ${c8.v.toFixed(1)} m/s after 3 s`, `above ${th.c8_throw.minAltitude} m, faster than ${th.c8_throw.minSpeed} m/s`);

  const c9 = chop(sim);
  gate('C9', 'a throttle chop glides', c9.worstPitchDeg <= th.c9_chop.maxPitchDeg, `worst pitch ${c9.worstPitchDeg.toFixed(1)} deg`, `within ${th.c9_chop.maxPitchDeg} deg`);

  const c10 = phugoid(sim);
  gate('C10', 'phugoid period', c10.period != null && within(c10.period, th.c10_phugoid), c10.period == null ? `no oscillation, swing ${c10.swing.toFixed(2)} m/s` : `${c10.period.toFixed(2)} s over ${c10.cycles} cycles, swing ${c10.swing.toFixed(1)} m/s about ${c10.mean.toFixed(1)}`, band(th.c10_phugoid));

  const c11 = rudderStep(sim, { wingsLevel: true });
  gate('C11', 'full rudder, wings level: sideslip', c11.betaDeg < 0 && within(-c11.betaDeg, th.c11_sideslip), `${(-c11.betaDeg).toFixed(1)} deg, ${c11.betaDeg < 0 ? 'wind from the left' : 'WRONG SIDE'}`, `${band(th.c11_sideslip)} deg, wind from the left`);

  const c12 = rudderStep(sim, { wingsLevel: false });
  gate('C12', 'full rudder: peak yaw rate', within(c12.peakRDegS, th.c12_yaw_rate), `${c12.peakRDegS.toFixed(0)} deg/s nose right at ${c12.v.toFixed(1)} m/s`, `${band(th.c12_yaw_rate)} deg/s`);
  gate('C13', 'full rudder: roll from dihedral', within(c12.bankDeg, th.c13_rudder_roll), `${c12.bankDeg.toFixed(1)} deg after 2 s, ${c12.bankDeg > 0 ? 'right wing down' : 'WRONG WAY'}`, `${band(th.c13_rudder_roll)} deg, right wing down`);

  const c14 = propTorque(sim);
  gate('C14', 'prop torque, static full throttle', c14.rollMoment < 0 && within(-c14.rollMoment, th.c14_prop_torque), `${(-c14.rollMoment).toFixed(3)} N m ${c14.rollMoment < 0 ? 'rolling left' : 'WRONG WAY'} at ${c14.thrust.toFixed(1)} N`, `${band(th.c14_prop_torque)} N m, rolling left`);

  /* The P factor, as S14 measures the torque: one step at a set state,
   * here level flight at 1.1 V_s, where the Cub flies 5.46 deg nose up,
   * at full throttle. The moment is the body yaw moment less the
   * aero's: debug 14 is M z and debug 7 the aero yaw moment in the aero
   * sign, so their sum. */
  const pf15 = th.c15_pfactor;
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_set_pose(0, 0, 50, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(pf15.speed), 'sim_wing_launch');
  const hp = pf15.alphaDeg / DEG / 2;
  must(sim.e.sim_set_pose(0, 0, 50, Math.cos(hp), 0, -Math.sin(hp), 0), 'sim_set_pose');
  must(sim.input(0, 0, 0, 0, 1), 'sim_input');
  must(sim.step(1), 'sim_step');
  const d15 = wingDebug(sim);
  const pf = d15[14] + d15[7];
  gate('C15', 'P factor, full throttle at 1.1 V_s', pf > 0 && within(pf, pf15), `${pf.toFixed(4)} N m ${pf > 0 ? 'nose left' : 'WRONG WAY'} at ${pf15.speed} m/s and ${pf15.alphaDeg} deg, thrust ${d15[8].toFixed(2)} N`, `${band(pf15)} N m, nose left`);

  /* The gear. */
  must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
  onStrip(sim);
  let hull = 0;
  let o = null;
  for (let ms = 0; ms < 3000; ms += RC_STEP_MS) {
    o = step(sim, [0, 0, 0, 0]);
    hull = Math.max(hull, o.hull);
  }
  const rest = { pitch: attitude(o.s).pitch * DEG, z: o.s[3], tail: o.loads[2] / (o.loads[0] + o.loads[1] + o.loads[2]) };
  const r16 = th.c16_rest;
  gate('C16', 'standing on its wheels', rest.pitch >= r16.pitchMin && rest.pitch <= r16.pitchMax && rest.z >= r16.zMin && rest.z <= r16.zMax && rest.tail >= r16.tailMin && rest.tail <= r16.tailMax && hull === 0 && Math.hypot(o.s[4], o.s[5]) < 0.01,
    `${rest.pitch.toFixed(2)} deg, CG ${rest.z.toFixed(4)} m, tail ${(rest.tail * 100).toFixed(1)} percent, loads ${o.loads.map((f) => f.toFixed(2)).join(' ')} N, hull ${hull}`,
    `${r16.pitchMin} to ${r16.pitchMax} deg, ${r16.zMin} to ${r16.zMax} m, ${r16.tailMin * 100} to ${r16.tailMax * 100} percent, no hull`);

  const c17 = takeoff(sim);
  const t17 = th.c17_takeoff;
  gate('C17', 'take off roll from rest', c17 != null && c17.dist >= t17.distMin && c17.dist <= t17.distMax && c17.v >= t17.vMin && c17.v <= t17.vMax,
    c17 == null ? 'never left the ground' : `${c17.dist.toFixed(2)} m to liftoff at ${c17.v.toFixed(2)} m/s, ${c17.t.toFixed(2)} s`,
    `${t17.distMin} to ${t17.distMax} m, ${t17.vMin} to ${t17.vMax} m/s`);
  const t18 = th.c18_straight;
  gate('C18', 'the roll tracks straight', c17 != null && c17.worstHeading * DEG < t18.maxHeadingDeg && c17.worstY < t18.maxOffLine,
    c17 == null ? 'never left the ground' : `heading within ${(c17.worstHeading * DEG).toFixed(1)} deg, ${c17.worstY.toFixed(2)} m off the line`,
    `under ${t18.maxHeadingDeg} deg, under ${t18.maxOffLine} m`);

  /* Taxi: full right rudder at walking pace; the radius from the speed and
   * the heading rate over the last two of five seconds. */
  onStrip(sim);
  for (let ms = 0; ms < 2000; ms += RC_STEP_MS) step(sim, [0, 0, 0, th.c19_taxi.duty]);
  let h0 = null;
  let vSum = 0;
  let n19 = 0;
  let allLoaded = true;
  for (let ms = 0; ms < 5000; ms += RC_STEP_MS) {
    o = step(sim, [0, 0, 1, th.c19_taxi.duty]);
    allLoaded = allLoaded && o.loads.slice(0, 3).every((f) => f > 0);
    if (ms === 3000) h0 = heading(o.s);
    if (ms > 3000) { vSum += speed(o.s); n19 += 1; }
  }
  let dh = heading(o.s) - h0;
  dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  const r19 = (vSum / n19) / Math.abs(dh / 1.996);
  gate('C19', 'taxi turn on the tailwheel', dh < 0 && within(r19, th.c19_taxi) && allLoaded, `${r19.toFixed(2)} m at ${(vSum / n19).toFixed(2)} m/s, ${dh < 0 ? 'turning right' : 'WRONG WAY'}${allLoaded ? '' : ', a wheel lifted'}`, `${band(th.c19_taxi)} m, turning right`);

  /* A landing: from 4 m at 11 m/s, a powered descent holding the nose level,
   * a flare to 6 deg at a metre, throttle closed, and on the wheels full up
   * stick to hold the tail down through the roll out. */
  must(sim.reset(), 'sim_reset');
  cubGroundPrelude(sim, { mu: GROUND_MU, e: GROUND_E });
  must(sim.e.sim_set_pose(0, 0, 4, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(11), 'sim_wing_launch');
  clockMs = 0;
  let touched = null;
  let hullLanding = 0;
  let bounces = 0;
  let wasLoaded = false;
  o = { s: sim.readState().state, loaded: false };
  for (let ms = 0; ms < 16000; ms += RC_STEP_MS) {
    const { pitch, bank } = attitude(o.s);
    const roll = Math.max(-1, Math.min(1, -1.2 * bank - 0.12 * o.s[11]));
    let sticks;
    if (touched !== null) {
      sticks = [roll, 1, 0, 0];
    } else if (o.s[3] > 1.0) {
      sticks = [roll, Math.max(-1, Math.min(1, 2.5 * (0 - pitch) + 0.25 * o.s[12])), 0, 0.3];
    } else {
      sticks = [roll, Math.max(-1, Math.min(1, 2.5 * (6 / DEG - pitch) + 0.25 * o.s[12])), 0, 0];
    }
    o = step(sim, sticks);
    if (o.loaded && touched === null) touched = { v: speed(o.s), vz: o.s[6], x: o.s[1] };
    if (o.loaded && !wasLoaded && touched !== null && ms > 0) bounces += 1;
    wasLoaded = o.loaded;
    if (touched !== null) hullLanding = Math.max(hullLanding, o.hull + (o.loads[3] > 0 ? 1 : 0));
  }
  const land = { pitch: attitude(o.s).pitch * DEG, v: Math.hypot(o.s[4], o.s[5]), roll: touched ? o.s[1] - touched.x : 0 };
  gate('C20', 'a landing on the wheels', touched !== null && land.v < 0.05 && Math.abs(land.pitch - rest.pitch) <= th.c20_landing.pitchTolDeg && hullLanding === 0 && o.loads.slice(0, 3).every((f) => f > 0),
    touched === null ? 'never touched down' : `touched at ${touched.v.toFixed(1)} m/s sinking ${(-touched.vz).toFixed(2)}, ${bounces} contact${bounces === 1 ? '' : 's'}, rolled ${land.roll.toFixed(1)} m, at rest at ${land.pitch.toFixed(2)} deg, hull or prop ${hullLanding}`,
    `at rest within ${th.c20_landing.pitchTolDeg} deg of C16, no hull or prop`);

  /* Full down elevator on the take off roll, from 8 m/s: over the mains
   * until the prop's tip, the fourth contact point, strikes. */
  onStrip(sim);
  o = { s: sim.readState().state, loaded: true };
  let worstPitch = 90;
  let pushed = false;
  let strike = 0;
  for (let ms = 0; ms < 4000; ms += RC_STEP_MS) {
    pushed = pushed || speed(o.s) >= 8;
    o = step(sim, pushed ? [0, -1, 0, 1] : [0, 0, 0, 1]);
    if (pushed) worstPitch = Math.min(worstPitch, attitude(o.s).pitch * DEG);
    strike = Math.max(strike, o.loads[3]);
  }
  gate('C21', 'full down on the roll strikes the prop', pushed && worstPitch <= th.c21_prop_strike.maxPitchDeg && strike > 0, `pitch down to ${worstPitch.toFixed(1)} deg, prop tip load ${strike.toFixed(1)} N`, `below ${th.c21_prop_strike.maxPitchDeg} deg, the prop touching`);
}

const quadTh = JSON.parse(await readFile(join(root, 'tests/thresholds.json'), 'utf8'));
const replayBase = { configText, renderHz: quadTh.replay.canonical_render_hz.value, traceStrideMs: quadTh.replay.trace_stride_ms.value };
const recOf = async (f) => decodeRec(new Uint8Array(await readFile(join(root, f))));
const quadHash = (await replayTrace(await loadSim(wasmBytes), await recOf('tests/inputs/baseline.rec'), replayBase)).slice(0, 16);
const wingHash = (await replayTrace(await loadSim(wasmBytes), await recOf('tests/inputs/wing-baseline.rec'), { ...replayBase, prelude: wingPrelude })).slice(0, 16);
const skyHash = (await replayTrace(await loadSim(wasmBytes), await recOf('tests/inputs/sky-baseline.rec'), { ...replayBase, prelude: skyPrelude })).slice(0, 16);
const u = th.c22_unmoved;
gate('C22', 'the five inch, wing and Skyhunter unmoved', quadHash === u.quad && wingHash === u.wing && skyHash === u.sky, `${quadHash}, ${wingHash}, ${skyHash}`, `${u.quad}, ${u.wing}, ${u.sky}`);

const cubRec = await recOf('tests/inputs/cub-baseline.rec');
const cubOpts = { ...replayBase, prelude: (s) => cubGroundPrelude(s) };
const nodeHash = (await replayTrace(await loadSim(wasmBytes), cubRec, cubOpts)).slice(0, 16);
const nodeAgain = (await replayTrace(await loadSim(wasmBytes), cubRec, cubOpts)).slice(0, 16);
if (!findChrome()) {
  gate('C23', 'Node and Chrome agree', null, `node ${nodeHash} twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}, no Chrome here`, 'identical');
} else {
  const server = await startServer(root);
  try {
    const out = await runBrowserHarness(`${server.origin}/tests/browser/wing-harness.html?plane=cub`);
    const result = out.result || {};
    const chromeHash = result.ok ? String(result.hash).slice(0, 16) : `error: ${result.message || result.errorName || JSON.stringify(out).slice(0, 80)}`;
    gate('C23', 'Node and Chrome agree', nodeAgain === nodeHash && result.ok && chromeHash === nodeHash, `node ${nodeHash} (twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}), chrome ${chromeHash}`, 'identical');
  } finally {
    await server.close();
  }
}

console.log('');
for (const [id, name, measured, b, status] of rows) {
  console.log(`  ${status.padEnd(4)}  ${id.padEnd(4)} ${name.padEnd(40)} ${String(measured).padEnd(60)} ${b}`);
}
console.log(`\n${failed ? `${failed} FAILED, ` : ''}${rows.length - failed - skipped} of ${rows.length} gates hold${skipped ? `, ${skipped} SKIPPED (a skip is not a pass)` : ''}`);
process.exit(failed ? 1 : 0);
