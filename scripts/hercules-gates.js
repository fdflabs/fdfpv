/*
 * hercules-gates.js: the AeroTetris C-130 Hercules 3077 (airframe 31)
 * against docs/HERCULES-STAGE1.md, every band in
 * tests/hercules-thresholds.json, each derived in scripts/hercules-derive.js
 * from the kit's published figures and the full size scaled to it. The
 * gates the other planes carry, on this one's numbers: the stall, the
 * cruise, the glide's sink, the top speed, the take off run, the rest on
 * its gear, every other aircraft unmoved by its table, and Node and Chrome
 * flying its recording identically. Run with npm run hercules:gates.
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
import { GROUND_MU, GROUND_E } from '../src/game/collide.js';
import {
  HERCULES_AIRFRAME, herculesGroundPrelude, herculesTakeoffSticks, fly, wingDebug, wheelLoads, attitude, must,
  bombshellGroundPrelude, slowstickGroundPrelude, skyPrelude, wingPrelude, cubGroundPrelude, gliderRecPrelude,
  bramorPrelude, bramorChutePrelude, timberRecPrelude, timberFloatRecPrelude, kadetGroundPrelude, p51RecPrelude,
  p51AirPrelude, f16GroundPrelude, zagiPrelude, uglystikGroundPrelude, dlgRecPrelude, tigermothGroundPrelude,
  extraGroundPrelude, RC_STEP_MS,
} from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const th = JSON.parse(await readFile(join(root, 'tests/hercules-thresholds.json'), 'utf8'));
const extraTh = JSON.parse(await readFile(join(root, 'tests/extra-thresholds.json'), 'utf8'));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const DEG = 180 / Math.PI;

async function herculesSim() {
  const sim = await loadSim(wasmBytes);
  if (sim.init(configText) !== SIM_OK) throw new Error('sim_init failed');
  if (sim.e.sim_set_airframe(HERCULES_AIRFRAME) !== SIM_OK) throw new Error('sim_set_airframe failed');
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

/* fly()'s level pilot with its stall guard off (its 9.5 m/s is under
 * this aircraft's stall), thrown at its cruise, 600 m to the side of the
 * field's thermals as the Kadet's flights are. */
const STILL_AIR = [0, 600, 0, 1, 0, 0, 0];
const slow = { guard: false, speed0: 16, start: STILL_AIR };

let clockMs = 0;
function step(sim, sticks) {
  must(sim.input(clockMs / 1000, ...sticks), 'sim_input');
  must(sim.step(RC_STEP_MS), 'sim_step');
  clockMs += RC_STEP_MS;
  const s = sim.readState().state;
  const loads = wheelLoads(sim);
  return { s, loads, loaded: loads.slice(0, 3).some((f) => f > 0), hull: sim.e.sim_ground_contacts() };
}

console.log('hercules gates: the plant against docs/HERCULES-STAGE1.md');
const sim = await herculesSim();
must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
check: {
  if (sim.e.sim_airframe() !== HERCULES_AIRFRAME) {
    gate('H0', 'the Hercules is selected', false, `airframe ${sim.e.sim_airframe()}`, `${HERCULES_AIRFRAME}`);
    break check;
  }

  let stallV = null;
  fly(sim, {
    duty: 0, speed0: 15, seconds: 16, pitchMax: 0.7, pitchMin: -0.3, guard: false, start: STILL_AIR,
    pitchTargetFn: (ms) => Math.min(0.6, 0.05 * ms / 1000),
    onStep: (o) => { if (stallV == null && o.ms > 1000 && wingDebug(sim)[0] > th.h1_stall.alphaStall) stallV = o.v; },
  });
  gate('H1', 'stall speed, power off', stallV != null && within(stallV, th.h1_stall), stallV == null ? 'no stall reached' : `${stallV.toFixed(2)} m/s`, band(th.h1_stall));

  const h2 = fly(sim, { duty: th.h2_cruise.duty, vzTarget: 0, seconds: 40, ...slow });
  gate('H2', 'cruise: level speed at 75 percent stick', within(h2.v, th.h2_cruise), `${h2.v.toFixed(2)} m/s, sink ${(-h2.vz).toFixed(2)}`, band(th.h2_cruise));

  const t3 = th.h3_glide;
  const g3 = fly(sim, { duty: 0, vTarget: t3.speed, seconds: 40, ...slow, speed0: t3.speed });
  const ratio = Math.sqrt(Math.max(0, g3.v * g3.v - g3.vz * g3.vz)) / -g3.vz;
  gate('H3', 'glide, power off: L/D and the sink', within(ratio, t3) && -g3.vz >= t3.sinkMin && -g3.vz <= t3.sinkMax,
    `${ratio.toFixed(2)} at ${g3.v.toFixed(2)} m/s, sink ${(-g3.vz).toFixed(2)}`, `${band(t3)}, sink ${t3.sinkMin} to ${t3.sinkMax}`);

  const h4 = fly(sim, { duty: th.h4_top.duty, vzTarget: 0, seconds: 90, ...slow, speed0: 21 });
  gate('H4', 'top speed, level', within(h4.v, th.h4_top) && Math.abs(h4.vz) < 0.2, `${h4.v.toFixed(2)} m/s, climb ${h4.vz.toFixed(2)}`, band(th.h4_top));

  /* H9: the cargo doors in level cruise. */
  {
    const t9 = th.h9_doors;
    const closed = fly(sim, { duty: t9.duty, vzTarget: 0, seconds: 40, ...slow });
    let openAt = null;
    const open = fly(sim, {
      duty: t9.duty, vzTarget: 0, seconds: 60, ...slow,
      onStep: (o) => {
        if (o.ms === 0) must(sim.e.sim_wing_set_door(1), 'sim_wing_set_door');
        if (openAt === null && sim.e.sim_wing_door() >= 1) openAt = o.ms / 1000;
      },
    });
    must(sim.e.sim_wing_set_door(0), 'sim_wing_set_door');
    const drop = closed.v - open.v;
    const probe = await herculesSim();
    must(probe.e.sim_set_airframe(15), 'sim_set_airframe');
    const refused = probe.e.sim_wing_set_door(1) !== SIM_OK;
    gate('H9', 'O opens the ramp: its drag slows the cruise', openAt !== null && Math.abs(openAt - t9.travelS) <= 0.01 && within(open.v, t9) && drop >= t9.dropMin && drop <= t9.dropMax && refused,
      `open in ${openAt === null ? 'never' : openAt.toFixed(3)} s, level ${open.v.toFixed(2)} m/s against ${closed.v.toFixed(2)} shut, ${drop.toFixed(2)} slower, the P-51 ${refused ? 'refuses' : 'ACCEPTS'} doors`,
      `${t9.travelS} s, ${band(t9)}, ${t9.dropMin} to ${t9.dropMax} slower`);
  }

  const onStrip = () => {
    must(sim.reset(), 'sim_reset');
    herculesGroundPrelude(sim, { mu: GROUND_MU, e: GROUND_E });
    clockMs = 0;
  };

  /* H6 first: the take off starts from this rest. */
  {
    const r6 = th.h6_rest;
    onStrip();
    let hull = 0;
    let o = null;
    for (let ms = 0; ms < 3000; ms += RC_STEP_MS) {
      o = step(sim, [0, 0, 0, 0]);
      hull = Math.max(hull, o.hull);
    }
    const rest = { pitch: attitude(o.s).pitch * DEG, z: o.s[3], nose: o.loads[2] / (o.loads[0] + o.loads[1] + o.loads[2]) };
    gate('H6', 'standing level on its three wheels', rest.pitch >= r6.pitchMin && rest.pitch <= r6.pitchMax && rest.z >= r6.zMin && rest.z <= r6.zMax && rest.nose >= r6.noseMin && rest.nose <= r6.noseMax && hull === 0 && o.loads[3] === 0 && Math.hypot(o.s[4], o.s[5]) < 0.01,
      `${rest.pitch.toFixed(2)} deg, CG ${rest.z.toFixed(4)} m, nose ${(rest.nose * 100).toFixed(1)} percent, loads ${o.loads.map((f) => f.toFixed(2)).join(' ')} N, hull ${hull}`,
      `${r6.pitchMin} to ${r6.pitchMax} deg, ${r6.zMin} to ${r6.zMax} m, ${r6.noseMin * 100} to ${r6.noseMax * 100} percent, no hull or tail`);
  }

  /* H5: full throttle from standing; liftoff is the last step on the
   * wheels before 200 ms clear of them. */
  {
    const t5 = th.h5_takeoff;
    onStrip();
    for (let ms = 0; ms < 1000; ms += RC_STEP_MS) step(sim, [0, 0, 0, 0]);
    const x0 = sim.readState().state[1];
    let last = null;
    let off = 0;
    let lof = null;
    let worstBank = 0;
    let tail = 0;
    for (let ms = 0; ms < 10000 && !lof; ms += RC_STEP_MS) {
      const o = step(sim, herculesTakeoffSticks(sim.readState().state));
      worstBank = Math.max(worstBank, Math.abs(fullBank(o.s) * DEG));
      tail = Math.max(tail, o.loads[3]);
      if (o.loaded) {
        last = { dist: o.s[1] - x0, v: speed(o.s), t: ms / 1000, heading: heading(o.s) * DEG };
        off = 0;
      } else {
        off += RC_STEP_MS;
        if (off >= 200) lof = last;
      }
    }
    gate('H5', 'takes off, the elevator eased up at 1.1 Vs', lof != null && lof.dist >= t5.distMin && lof.dist <= t5.distMax && lof.v >= t5.vMin && lof.v <= t5.vMax && tail === 0,
      lof == null ? 'never left the ground' : `${lof.dist.toFixed(2)} m to liftoff at ${lof.v.toFixed(2)} m/s, ${lof.t.toFixed(2)} s, heading ${lof.heading.toFixed(1)} deg, bank under ${worstBank.toFixed(1)}, tail ${tail > 0 ? 'STRUCK' : 'clear'}`,
      `${t5.distMin} to ${t5.distMax} m, ${t5.vMin} to ${t5.vMax} m/s, no tail strike`);
  }
}

const quadTh = JSON.parse(await readFile(join(root, 'tests/thresholds.json'), 'utf8'));
const replayBase = { configText, renderHz: quadTh.replay.canonical_render_hz.value, traceStrideMs: quadTh.replay.trace_stride_ms.value };
const recOf = async (f) => decodeRec(new Uint8Array(await readFile(join(root, f))));
const hashOf = async (f, prelude) => (await replayTrace(await loadSim(wasmBytes), await recOf(f), { ...replayBase, prelude })).slice(0, 16);
const u = { ...extraTh.e15_unmoved, extra: th.h7_unmoved.extra };
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
gate('H7', 'every other aircraft unmoved', names.every((k) => got[k] === u[k]),
  names.filter((k) => got[k] !== u[k]).map((k) => `${k} ${got[k]}`).join(', ') || `all ${names.length} as pinned`,
  'tests/extra-thresholds.json e15 and the Extra\'s own');

const stickRec = await recOf('tests/inputs/hercules-baseline.rec');
const stickOpts = { ...replayBase, prelude: (s) => herculesGroundPrelude(s) };
const nodeHash = (await replayTrace(await loadSim(wasmBytes), stickRec, stickOpts)).slice(0, 16);
const nodeAgain = (await replayTrace(await loadSim(wasmBytes), stickRec, stickOpts)).slice(0, 16);
if (!findChrome()) {
  gate('H8', 'Node and Chrome agree', null, `node ${nodeHash} twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}, no Chrome here`, 'identical');
} else {
  const server = await startServer(root);
  try {
    const out = await runBrowserHarness(`${server.origin}/tests/browser/wing-harness.html?plane=hercules`);
    const result = out.result || {};
    const chromeHash = result.ok ? String(result.hash).slice(0, 16) : `error: ${result.message || result.errorName || JSON.stringify(out).slice(0, 80)}`;
    gate('H8', 'Node and Chrome agree', nodeAgain === nodeHash && result.ok && chromeHash === nodeHash, `node ${nodeHash} (twice ${nodeAgain === nodeHash ? 'the same' : 'DIFFERENT'}), chrome ${chromeHash}`, 'identical');
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
