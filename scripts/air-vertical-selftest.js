/*
 * air-vertical-selftest.js: sim_set_air_vertical, the host's vertical air
 * at the craft (sim_abi.h, docs/FLIGHTMODEL.md), for the weather lane's
 * thermals, ridge and dam lift and sink.
 *
 *     node scripts/air-vertical-selftest.js      (npm run air:vertical)
 *
 * 1. It refuses what is not finite or past 10 m/s either way.
 * 2. Never set, or set to 0, a recorded flight replays to its pinned hash:
 *    still air is the arithmetic of before.
 * 3. A fixed wing gliding power off sinks by the air's rise less: a still
 *    air glide against one in 0.5 m/s of rise, the same to 2 percent of
 *    it, for the fixed wings PDCS seats, the Bramor and both Strikers,
 *    each let go at its own speed in the air's frame (see KEPT). The
 *    Radian flew it first, until it left the module on 2026-10-20.
 * 4. A quad dropped with its motors off falls slower in rising air.
 * 5. It outlives sim_reset and sim_set_wind(0, 0, 0), as the wind does,
 *    and 0 takes it away: the Bramor's glide.
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
import { must, bramorPrelude, BRAMOR_AIRFRAME } from '../tests/lib/wingpilot.js';
import { seatStriker } from './lib/strikerpilot.js';
import { airframeById } from '../configs/airframes.js';
import { combatChoice } from '../configs/combat.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const quadTh = JSON.parse(await readFile(join(root, 'tests/thresholds.json'), 'utf8'));
const bramorTh = JSON.parse(await readFile(join(root, 'tests/bramor-thresholds.json'), 'utf8'));

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
  if (!ok) {
    failed += 1;
  }
}

async function fresh(airframe) {
  const sim = await loadSim(wasmBytes);
  must(sim.init(configText), 'sim_init');
  must(sim.e.sim_set_airframe(airframe), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  return sim;
}

console.log('1. refusals');
{
  const sim = await fresh(BRAMOR_AIRFRAME);
  for (const w of [NaN, Infinity, 10.01, -10.01]) {
    check(`refuses ${w}`, sim.e.sim_set_air_vertical(w) !== SIM_OK);
  }
  check('takes 10, -10 and 0', [10, -10, 0].every((w) => sim.e.sim_set_air_vertical(w) === SIM_OK));
}

console.log('2. still air is the arithmetic of before');
{
  const replayBase = { configText, renderHz: quadTh.replay.canonical_render_hz.value, traceStrideMs: quadTh.replay.trace_stride_ms.value };
  /* The Bramor's recorded catapult flight, pinned in its own gate
   * (tests/bramor-thresholds.json b15_recorded). The Cub's recording flew
   * here too until the Cub left the module on 2026-10-20. */
  const bramorRec = decodeRec(new Uint8Array(await readFile(join(root, 'tests/inputs/bramor-baseline.rec'))));
  const bramorWant = bramorTh.b15_recorded.bramor;
  const bramorNever = (await replayTrace(await loadSim(wasmBytes), bramorRec, { ...replayBase, prelude: bramorPrelude })).slice(0, 16);
  const bramorZero = (await replayTrace(await loadSim(wasmBytes), bramorRec, {
    ...replayBase,
    prelude: (s) => { must(s.e.sim_set_air_vertical(0), 'air'); bramorPrelude(s); },
  })).slice(0, 16);
  check('the Bramor\'s recording, never set, is its pinned hash', bramorNever === bramorWant, `${bramorNever} against ${bramorWant}`);
  check('and with 0 set before it', bramorZero === bramorWant, bramorZero);
}

/*
 * The kept fixed wings and the speed each glide is let go at: the
 * Bramor's 16 m/s, the speed its glide band is flown at
 * (tests/bramor-thresholds.json b3_glide); the Striker's 19 m/s, its
 * rail's release, 1.3 times the trimmed stall of its heaviest warhead
 * (configs/airframes.js STRIKER_RAIL), both over their stall (13 m/s,
 * 13.53 and 14.07 m/s, configs/airframes.js). The Striker is seated as
 * the shell seats it, its standard warhead and the bay's trim lead on
 * (scripts/lib/strikerpilot.js seatStriker): the bare plant flies at the
 * CG the lead moves.
 *
 * Each is let go in the air's frame, its launch velocity plus the air's
 * rise: then the two glides are the same flight in the air and their sink
 * differs by the rise at every step. Let go in the ground's frame, a rise
 * is a change of angle of attack at the release, and a 4.5 to 13.8 kg
 * airframe's phugoid is still swinging 20 s later (the Bramor's still air
 * speed spans 12.9 to 16.0 m/s in its first 30 s, 14.2 to 14.6 in its
 * second), where the 0.6 kg Radian's, let go in the ground's frame while
 * it flew this, had settled.
 */
const strikerAf = airframeById('striker2500');
const strikerTune = await readFile(join(root, `configs/${strikerAf.defaultTune}.diff`), 'utf8');
const KEPT = [
  { name: 'Bramor', v0: 16, seat: () => fresh(BRAMOR_AIRFRAME) },
  ...['prop', 'jet'].map((propulsion) => ({
    name: `Striker ${propulsion}`,
    v0: 19,
    seat: async () => {
      const sim = await seatStriker(loadSim, wasmBytes, strikerTune, strikerAf, combatChoice(strikerAf, { propulsion }));
      must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
      return sim;
    },
  })),
];

/* A power off glide in Manual from the pose, the sticks centred, let go at
 * v0 in the air's frame: the mean vertical speed over its last 5 s. */
function glide(sim, w, v0) {
  must(sim.reset(), 'reset');
  must(sim.e.sim_wing_set_stab(0), 'stab');
  must(sim.e.sim_set_air_vertical(w), 'air');
  must(sim.e.sim_set_pose(0, 600, 300, 1, 0, 0, 0), 'pose');
  must(sim.e.sim_wing_launch(v0), 'launch');
  const s = sim.readState().state;
  must(sim.e.sim_set_velocity(s[4], s[5], s[6] + w, s[11], s[12], s[13]), 'velocity');
  let sum = 0;
  let n = 0;
  for (let ms = 0; ms < 25000; ms += 4) {
    must(sim.input(ms / 1000, 0, 0, 0, 0), 'input');
    must(sim.step(4), 'step');
    if (ms >= 20000) {
      sum += sim.readState().state[6];
      n += 1;
    }
  }
  must(sim.e.sim_set_air_vertical(0), 'air');
  return sum / n;
}

console.log('3. a fixed wing in rising air');
{
  for (const { name, v0, seat } of KEPT) {
    const k = await seat();
    const kStill = glide(k, 0, v0);
    const kRise = glide(k, 0.5, v0);
    check(`a ${name}'s glide sinks 0.5 m/s less in 0.5 m/s of rise`, Math.abs(kRise - kStill - 0.5) <= 0.01, `${kStill.toFixed(3)} m/s still, ${kRise.toFixed(3)} in the rise`);
  }
}

console.log('4. a quad falling');
{
  const drop = async (w) => {
    const sim = await fresh(24);
    must(sim.e.sim_set_air_vertical(w), 'air');
    must(sim.e.sim_set_pose(0, 0, 200, 1, 0, 0, 0), 'pose');
    for (let ms = 0; ms < 3000; ms += 4) {
      must(sim.input(ms / 1000, 0, 0, 0, 0), 'input');
      must(sim.step(4), 'step');
    }
    return sim.readState().state[3];
  };
  const still = await drop(0);
  const rise = await drop(5);
  check('a seven inch dropped with its motors off falls less far in 5 m/s of rise', rise > still, `${(200 - still).toFixed(2)} m still, ${(200 - rise).toFixed(2)} in the rise`);
}

console.log('5. a world property');
{
  const sim = await fresh(BRAMOR_AIRFRAME);
  const v0 = KEPT[0].v0;
  const still = glide(sim, 0, v0);
  must(sim.e.sim_set_air_vertical(0.5), 'air');
  must(sim.reset(), 'reset');
  must(sim.e.sim_set_wind(0, 0, 0), 'wind');
  must(sim.e.sim_wing_set_stab(0), 'stab');
  must(sim.e.sim_set_pose(0, 600, 300, 1, 0, 0, 0), 'pose');
  must(sim.e.sim_wing_launch(v0), 'launch');
  const s0 = sim.readState().state;
  must(sim.e.sim_set_velocity(s0[4], s0[5], s0[6] + 0.5, s0[11], s0[12], s0[13]), 'velocity');
  let sum = 0;
  let n = 0;
  for (let ms = 0; ms < 25000; ms += 4) {
    must(sim.input(ms / 1000, 0, 0, 0, 0), 'input');
    must(sim.step(4), 'step');
    if (ms >= 20000) {
      sum += sim.readState().state[6];
      n += 1;
    }
  }
  check('it outlives sim_reset and a still sim_set_wind', Math.abs(sum / n - still - 0.5) <= 0.01, `${(sum / n).toFixed(3)} against ${still.toFixed(3)}`);
  const back = glide(sim, 0, v0);
  check('and 0 takes it away, to the bit', back === still, `${back} against ${still}`);
}

console.log(failed ? `${failed} FAILED` : 'all ok');
process.exit(failed ? 1 : 0);
