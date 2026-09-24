/*
 * glider-gates.js: the Radian plant against the bands in
 * tests/glider-thresholds.json.
 *
 * Twenty one checks, G1 to G21, from docs/GLIDER-STAGE1.md, on the pattern
 * of cub-gates.js. G1 to G4 are what a glider is for: the glide ratio, the
 * least sink, the stall and the climb under power. G5 to G10 are the
 * Skyhunter's and the Cub's level speed, roll, turn and rudder checks with
 * the Radian's numbers. G11 and G12 are the folding prop: folded it does
 * nothing, open it drags, and the glide ratio shows it. G13 is the prop's
 * reaction. G14 to G16 are the rising air: circling in a thermal climbs,
 * the same circle in still air sinks, and over the thermal's top the air
 * is still again. G17 to G19 are the throw, the chop and the phugoid. G20
 * holds the five inch's, the wing's, the Skyhunter's and the Cub's
 * recorded hashes where they were before the Radian existed, since one
 * plant flies them all and the thermals are new to it. G21 flies the
 * Radian's recorded climb, glide and thermal in Node and in headless
 * Chrome and holds the two trace hashes equal. Bands are never widened
 * here: a plant outside one is a finding for the derivation. Run with
 * npm run glider:gates.
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
  GLIDER_AIRFRAME, fly, rollRate, turn, stallSpeed, throwTest, propTorque, attitude,
  wingDebug, must, gliderRecPrelude, cubGroundPrelude, skyPrelude, wingPrelude, RC_STEP_MS,
} from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const th = JSON.parse(await readFile(join(root, 'tests/glider-thresholds.json'), 'utf8'));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const DEG = 180 / Math.PI;
const SPAN = 2.0;

async function gliderSim() {
  const sim = await loadSim(wasmBytes);
  if (sim.init(configText) !== SIM_OK) throw new Error('sim_init failed');
  if (sim.e.sim_set_airframe(GLIDER_AIRFRAME) !== SIM_OK) throw new Error('sim_set_airframe failed');
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

/*
 * A glide at an airspeed, held on the pitch attitude, the wings level. The
 * harness pilot's own airspeed hold with a glider's reach: the best glide
 * is flown a degree or so nose down and a glider wants more trim range
 * than the wing it was written for. Thirty seconds, so the phugoid a
 * glider barely damps has settled; the mean of the last five.
 */
function glideAt(sim, speed, duty = 0) {
  const r = fly(sim, { duty, speed0: speed, vTarget: speed, seconds: 30, pitchMin: -0.3, pitchMax: 0.2, trimMax: 0.3 });
  const sink = -r.vz;
  return { v: r.v, sink, ratio: Math.sqrt(Math.max(0, r.v * r.v - r.vz * r.vz)) / sink };
}

/*
 * A circle at a bank and an airspeed, power off, begun already banked at
 * the point of the circle that puts its centre where it is asked for:
 * facing +x, the turn's radius to the left of the centre, so a right hand
 * circle goes round it. The mean climb rate over the last twenty seconds,
 * and how far the circle's centre wandered from where it was asked for.
 */
function circleAt(sim, { centre, z, speed, bankDeg, seconds }) {
  const bank = bankDeg / DEG;
  const R = speed * speed / (9.81 * Math.tan(bank));
  const h = bank / 2;
  let sumVz = 0;
  let n = 0;
  let sx = 0;
  let sy = 0;
  const r = fly(sim, {
    duty: 0, speed0: speed, vTarget: speed, holdBank: bank, seconds, pitchMin: -0.3, pitchMax: 0.2, trimMax: 0.3,
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
  return { climb: sumVz / n, v: r.v, bankDeg: r.bank * DEG, off: Math.hypot(sx / n - centre[0], sy / n - centre[1]), radius: R };
}

/*
 * Level flight at a throttle, for a glider. fly()'s level hold is a
 * proportional attitude loop over a slow trim, and a glider trimmed for its
 * best glide needs a third of its down elevator held at 65 percent: the
 * loop settles 8 degrees nose high of what it asks for and climbs. So the
 * stick's own trim integrates the climb rate here, as a pilot's thumb on
 * the trim lever does. Thirty seconds, the mean of the last five, and the
 * stick it was holding.
 */
let clockMs = 0;
function levelHold(sim, duty, { seconds = 30, speed0 = 12 } = {}) {
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_wing_launch(speed0), 'sim_wing_launch');
  clockMs = 0;
  let trimStick = 0;
  let sum = { v: 0, vz: 0, n: 0 };
  let stick = 0;
  for (let ms = 0; ms < seconds * 1000; ms += RC_STEP_MS) {
    const s = sim.readState().state;
    const { bank } = attitude(s);
    const vz = s[6];
    trimStick = Math.max(-1, Math.min(1, trimStick - 0.0005 * vz));
    const roll = Math.max(-1, Math.min(1, -1.2 * bank - 0.12 * s[11]));
    stick = Math.max(-1, Math.min(1, trimStick - 0.1 * vz - 0.25 * -s[12]));
    must(sim.input(ms / 1000, roll, stick, 0, duty), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    if (ms >= seconds * 1000 - 5000) {
      sum = { v: sum.v + Math.hypot(s[4], s[5], s[6]), vz: sum.vz + vz, n: sum.n + 1 };
    }
  }
  clockMs = seconds * 1000;
  return { v: sum.v / sum.n, vz: sum.vz / sum.n, stick };
}

/* After levelHold: the throttle closed with the pitch stick left where
 * level flight had it, wings held level. The worst pitch in three seconds. */
function chopHeld(sim, stick) {
  let worst = 0;
  for (let ms = 0; ms < 3000; ms += RC_STEP_MS) {
    const s = sim.readState().state;
    const { pitch, bank } = attitude(s);
    worst = Math.max(worst, Math.abs(pitch));
    const roll = Math.max(-1, Math.min(1, -1.2 * bank - 0.12 * s[11]));
    must(sim.input((clockMs + ms) / 1000, roll, stick, 0, 0), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
  }
  return { worstPitchDeg: worst * DEG };
}

/* After levelHold: a second of a little up stick on top of the level
 * stick, then the stick let go to neutral at the same throttle, the wings
 * held level. Hands off, a glider trimmed for its glide settles into a
 * slow climb, and the phugoid is about that. The period from the upward
 * crossings of where the speed settles, as phugoid() measures it. */
function phugoidHandsOff(sim, stick, duty) {
  const vs = [];
  for (let ms = 0; ms < 40000; ms += RC_STEP_MS) {
    const s = sim.readState().state;
    const { bank } = attitude(s);
    const roll = Math.max(-1, Math.min(1, -1.2 * bank - 0.12 * s[11]));
    must(sim.input((clockMs + ms) / 1000, roll, ms < 1000 ? stick + 0.3 : 0, 0, duty), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    if (ms >= 8000) {
      vs.push({ t: ms / 1000, v: Math.hypot(s[4], s[5], s[6]) });
    }
  }
  const tail = vs.filter((o) => o.t >= vs[vs.length - 1].t - 5);
  const mean = tail.reduce((a, o) => a + o.v, 0) / tail.length;
  const ups = [];
  for (let i = 1; i < vs.length; i += 1) {
    const a = vs[i - 1].v - mean;
    const b = vs[i].v - mean;
    if (a < 0 && b >= 0) ups.push(vs[i - 1].t + (vs[i].t - vs[i - 1].t) * (-a / (b - a)));
  }
  const period = ups.length >= 2 ? (ups[ups.length - 1] - ups[0]) / (ups.length - 1) : null;
  return { period, cycles: ups.length - 1, mean, swing: Math.max(...vs.map((o) => o.v)) - Math.min(...vs.map((o) => o.v)) };
}

/* After levelHold: full right rudder with the pitch stick where level
 * flight had it, as rudderStep() flies it from its own level flight.
 * wingsLevel: the ailerons hold the wings level and the result is the mean
 * sideslip over the last two of six seconds; otherwise the ailerons stay
 * centred, and the result is the peak nose right yaw rate in the first one
 * and a half seconds and the bank at two. */
function rudderHeld(sim, { wingsLevel }) {
  const lv = levelHold(sim, 0.65);
  const total = wingsLevel ? 6000 : 2000;
  let peakR = 0;
  let sumBeta = 0;
  let n = 0;
  let s = null;
  for (let ms = 0; ms < total; ms += RC_STEP_MS) {
    s = sim.readState().state;
    const { bank } = attitude(s);
    const roll = wingsLevel ? Math.max(-1, Math.min(1, -1.2 * bank - 0.12 * s[11])) : 0;
    must(sim.input((clockMs + ms) / 1000, roll, lv.stick, 1, 0.65), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    s = sim.readState().state;
    if (ms < 1500) peakR = Math.max(peakR, -s[13]);
    if (ms >= total - 2000) {
      sumBeta += wingDebug(sim)[1];
      n += 1;
    }
  }
  const w = s[7], x = s[8], y = s[9], z = s[10];
  const bank = Math.atan2(2 * (y * z + w * x), 1 - 2 * (x * x + y * y));
  return { betaDeg: (sumBeta / n) * DEG, peakRDegS: peakR * DEG, bankDeg: bank * DEG, v: lv.v };
}

console.log('glider gates: the plant against docs/GLIDER-STAGE1.md');
const sim = await gliderSim();
check: {
  if (sim.e.sim_airframe() !== GLIDER_AIRFRAME) {
    gate('G0', 'the Radian is selected', false, `airframe ${sim.e.sim_airframe()}`, `${GLIDER_AIRFRAME}`);
    break check;
  }

  const g1 = glideAt(sim, th.g1_glide.speed);
  gate('G1', 'glide ratio, power off, folded', within(g1.ratio, th.g1_glide), `${g1.ratio.toFixed(2)} at ${g1.v.toFixed(2)} m/s, sink ${g1.sink.toFixed(3)}`, band(th.g1_glide));

  let g2 = null;
  for (const V of th.g2_min_sink.speeds) {
    const o = glideAt(sim, V);
    if (!g2 || o.sink < g2.sink) g2 = o;
  }
  gate('G2', 'least sink, power off', within(g2.sink, th.g2_min_sink), `${g2.sink.toFixed(3)} m/s at ${g2.v.toFixed(2)} m/s`, `${band(th.g2_min_sink)} m/s`);

  const g3 = stallSpeed(sim, th.g3_stall.alphaStall);
  gate('G3', 'stall speed, power off', g3 != null && within(g3, th.g3_stall), g3 == null ? 'no stall reached' : `${g3.toFixed(2)} m/s`, band(th.g3_stall));

  let g4 = null;
  for (const vT of th.g4_climb.speeds) {
    const r = fly(sim, { duty: 1, speed0: vT, vTarget: vT, seconds: 20, pitchMax: 1.2, pitchMin: -0.5, trimMax: 1.0 });
    if (!g4 || r.vz > g4.vz) g4 = { v: r.v, vz: r.vz, pitchDeg: r.pitch * DEG };
  }
  gate('G4', 'best climb, full throttle', within(g4.vz, th.g4_climb), `${g4.vz.toFixed(2)} m/s at ${g4.v.toFixed(1)} m/s, pitch ${g4.pitchDeg.toFixed(0)} deg`, band(th.g4_climb));

  const g5 = levelHold(sim, th.g5_level.duty);
  gate('G5', 'level speed at 65 percent', within(g5.v, th.g5_level) && Math.abs(g5.vz) < 0.1, `${g5.v.toFixed(2)} m/s, climbing ${g5.vz.toFixed(3)}, stick ${g5.stick.toFixed(3)}`, `${band(th.g5_level)}, level within 0.1 m/s`);

  const g6 = rollRate(sim, th.g6_roll.duty);
  const pb2v = Math.abs(g6.rateDegS / DEG) * SPAN / (2 * g6.v);
  gate('G6', 'roll rate, full aileron, pb/2V', within(pb2v, th.g6_roll), `${pb2v.toFixed(3)}: ${Math.abs(g6.rateDegS).toFixed(0)} deg/s at ${g6.v.toFixed(1)} m/s`, band(th.g6_roll));

  const g7 = turn(sim, th.g7_turn.duty, th.g7_turn.bankDeg / DEG);
  gate('G7', 'turn radius at a held bank', Math.abs(g7.offPercent) <= th.g7_turn.maxOffPercent, `${g7.radius.toFixed(1)} m at ${g7.bankDeg.toFixed(0)} deg, formula ${g7.formula.toFixed(1)} m, off ${g7.offPercent.toFixed(0)} percent`, `within ${th.g7_turn.maxOffPercent} percent`);

  /* Full right rudder yaws the nose right, which puts the wind on the
   * left: a negative sideslip in the aero sign. */
  const g8 = rudderHeld(sim, { wingsLevel: true });
  gate('G8', 'full rudder, wings level: sideslip', g8.betaDeg < 0 && within(-g8.betaDeg, th.g8_sideslip), `${(-g8.betaDeg).toFixed(1)} deg, ${g8.betaDeg < 0 ? 'wind from the left' : 'WRONG SIDE'}`, `${band(th.g8_sideslip)} deg, wind from the left`);
  const g9 = rudderHeld(sim, { wingsLevel: false });
  gate('G9', 'full rudder: peak yaw rate', within(g9.peakRDegS, th.g9_yaw_rate), `${g9.peakRDegS.toFixed(0)} deg/s nose right at ${g9.v.toFixed(1)} m/s`, `${band(th.g9_yaw_rate)} deg/s`);
  gate('G10', 'full rudder: roll from polyhedral', within(g9.bankDeg, th.g10_rudder_roll), `${g9.bankDeg.toFixed(1)} deg after 2 s, ${g9.bankDeg > 0 ? 'right wing down' : 'WRONG WAY'}`, `${band(th.g10_rudder_roll)} deg, right wing down`);

  /* The fold: one step at 8 m/s level, throttle just under the fold and
   * just at it. debug 8 is the thrust; state 14 is the motor's rate. */
  const f11 = th.g11_fold;
  const oneStep = (throttle) => {
    must(sim.reset(), 'sim_reset');
    must(sim.e.sim_set_pose(0, 0, 50, 1, 0, 0, 0), 'sim_set_pose');
    must(sim.e.sim_wing_launch(f11.speed), 'sim_wing_launch');
    must(sim.input(0, 0, 0, 0, throttle), 'sim_input');
    must(sim.step(1), 'sim_step');
    return { thrust: wingDebug(sim)[8], omega: sim.readState().state[14] };
  };
  const folded = oneStep(f11.foldDuty - 0.001);
  const open = oneStep(f11.foldDuty);
  gate('G11', 'the prop folds, and open it drags', folded.thrust === 0 && folded.omega === 0 && open.omega > 0 && -open.thrust >= f11.dragMin && -open.thrust <= f11.dragMax,
    `folded: thrust ${folded.thrust}, turning ${folded.omega.toFixed(0)} rad/s; open: drag ${(-open.thrust).toFixed(3)} N, turning ${open.omega.toFixed(0)} rad/s`,
    `folded 0 and still, open ${f11.dragMin} to ${f11.dragMax} N`);
  const g12 = glideAt(sim, th.g12_glide_open.speed, th.g12_glide_open.duty);
  gate('G12', 'glide ratio, the prop open at 5 percent', within(g12.ratio, th.g12_glide_open), `${g12.ratio.toFixed(2)} at ${g12.v.toFixed(2)} m/s, sink ${g12.sink.toFixed(3)}, against ${g1.ratio.toFixed(2)} folded`, band(th.g12_glide_open));

  const g13 = propTorque(sim);
  gate('G13', 'prop torque, static full throttle', g13.rollMoment < 0 && within(-g13.rollMoment, th.g13_prop_torque), `${(-g13.rollMoment).toFixed(3)} N m ${g13.rollMoment < 0 ? 'rolling left' : 'WRONG WAY'} at ${g13.thrust.toFixed(2)} N`, `${band(th.g13_prop_torque)} N m, rolling left`);

  const t14 = th.g14_thermal;
  const circle = (centre, z) => circleAt(sim, { centre, z, speed: t14.speed, bankDeg: t14.bankDeg, seconds: t14.seconds });
  const g14 = circle(t14.core, t14.z);
  gate('G14', 'circling in a thermal climbs', within(g14.climb, t14), `${g14.climb.toFixed(2)} m/s at ${g14.v.toFixed(1)} m/s and ${g14.bankDeg.toFixed(0)} deg, circle ${g14.off.toFixed(1)} m off the core`, `${band(t14)} m/s up`);
  const g15 = circle(th.g15_still.at, t14.z);
  gate('G15', 'the same circle in still air sinks', within(-g15.climb, th.g15_still), `${(-g15.climb).toFixed(3)} m/s down`, `${band(th.g15_still)} m/s down`);
  const g16 = circle(t14.core, th.g16_topped.z);
  gate('G16', 'over the thermal\'s top, still air', Math.abs(g16.climb - g15.climb) <= th.g16_topped.tol, `${(-g16.climb).toFixed(3)} m/s down at ${th.g16_topped.z} m, still air ${(-g15.climb).toFixed(3)}`, `within ${th.g16_topped.tol} m/s of G15`);

  const g17 = throwTest(sim, { speed: th.g17_throw.speed, duty: th.g17_throw.duty, up: th.g17_throw.up });
  gate('G17', 'a hand throw flies away', g17.z >= th.g17_throw.minAltitude && g17.v >= th.g17_throw.minSpeed, `${g17.z.toFixed(1)} m and ${g17.v.toFixed(1)} m/s after 3 s`, `above ${th.g17_throw.minAltitude} m, faster than ${th.g17_throw.minSpeed} m/s`);

  const lv18 = levelHold(sim, 0.65);
  const g18 = chopHeld(sim, lv18.stick);
  gate('G18', 'a throttle chop glides', g18.worstPitchDeg <= th.g18_chop.maxPitchDeg, `worst pitch ${g18.worstPitchDeg.toFixed(1)} deg`, `within ${th.g18_chop.maxPitchDeg} deg`);

  const lv19 = levelHold(sim, 0.65);
  const g19 = phugoidHandsOff(sim, lv19.stick, 0.65);
  gate('G19', 'phugoid period', g19.period != null && within(g19.period, th.g19_phugoid), g19.period == null ? `no oscillation, swing ${g19.swing.toFixed(2)} m/s` : `${g19.period.toFixed(2)} s over ${g19.cycles} cycles, swing ${g19.swing.toFixed(1)} m/s about ${g19.mean.toFixed(1)}`, band(th.g19_phugoid));
}

const quadTh = JSON.parse(await readFile(join(root, 'tests/thresholds.json'), 'utf8'));
const replayBase = { configText, renderHz: quadTh.replay.canonical_render_hz.value, traceStrideMs: quadTh.replay.trace_stride_ms.value };
const recOf = async (f) => decodeRec(new Uint8Array(await readFile(join(root, f))));
const hashOf = async (f, prelude) => (await replayTrace(await loadSim(wasmBytes), await recOf(f), prelude ? { ...replayBase, prelude } : replayBase)).slice(0, 16);
const u = th.g20_unmoved;
const got = {
  quad: await hashOf('tests/inputs/baseline.rec'),
  wing: await hashOf('tests/inputs/wing-baseline.rec', wingPrelude),
  sky: await hashOf('tests/inputs/sky-baseline.rec', skyPrelude),
  cub: await hashOf('tests/inputs/cub-baseline.rec', (s) => cubGroundPrelude(s)),
};
gate('G20', 'the quad, wing, Skyhunter and Cub unmoved', ['quad', 'wing', 'sky', 'cub'].every((k) => got[k] === u[k]),
  `${got.quad}, ${got.wing}, ${got.sky}, ${got.cub}`, `${u.quad}, ${u.wing}, ${u.sky}, ${u.cub}`);

const nodeHash = await hashOf('tests/inputs/glider-baseline.rec', gliderRecPrelude);
const nodeAgain = await hashOf('tests/inputs/glider-baseline.rec', gliderRecPrelude);
if (!findChrome()) {
  gate('G21', 'Node and Chrome agree', null, `node ${nodeHash} twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}, no Chrome here`, 'identical');
} else {
  const server = await startServer(root);
  try {
    const out = await runBrowserHarness(`${server.origin}/tests/browser/wing-harness.html?plane=glider`);
    const result = out.result || {};
    const chromeHash = result.ok ? String(result.hash).slice(0, 16) : `error: ${result.message || result.errorName || JSON.stringify(out).slice(0, 80)}`;
    gate('G21', 'Node and Chrome agree', nodeAgain === nodeHash && result.ok && chromeHash === nodeHash, `node ${nodeHash} (twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}), chrome ${chromeHash}`, 'identical');
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
