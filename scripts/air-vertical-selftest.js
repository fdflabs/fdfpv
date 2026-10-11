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
 * 3. A Radian gliding power off sinks by the air's rise less: a still air
 *    glide against one in 0.5 m/s of rise, the same to 2 percent of it.
 * 4. A quad dropped with its motors off falls slower in rising air.
 * 5. It outlives sim_reset and sim_set_wind(0, 0, 0), as the wind does,
 *    and 0 takes it away.
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
import { must, cubGroundPrelude } from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const quadTh = JSON.parse(await readFile(join(root, 'tests/thresholds.json'), 'utf8'));
const tigerTh = JSON.parse(await readFile(join(root, 'tests/tigermoth-thresholds.json'), 'utf8'));

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
  const sim = await fresh(6);
  for (const w of [NaN, Infinity, 10.01, -10.01]) {
    check(`refuses ${w}`, sim.e.sim_set_air_vertical(w) !== SIM_OK);
  }
  check('takes 10, -10 and 0', [10, -10, 0].every((w) => sim.e.sim_set_air_vertical(w) === SIM_OK));
}

console.log('2. still air is the arithmetic of before');
{
  const replayBase = { configText, renderHz: quadTh.replay.canonical_render_hz.value, traceStrideMs: quadTh.replay.trace_stride_ms.value };
  const rec = decodeRec(new Uint8Array(await readFile(join(root, 'tests/inputs/cub-baseline.rec'))));
  const want = tigerTh.t16_unmoved.cub;
  const never = (await replayTrace(await loadSim(wasmBytes), rec, { ...replayBase, prelude: (s) => cubGroundPrelude(s) })).slice(0, 16);
  const zero = (await replayTrace(await loadSim(wasmBytes), rec, {
    ...replayBase,
    prelude: (s) => { must(s.e.sim_set_air_vertical(0), 'air'); cubGroundPrelude(s); },
  })).slice(0, 16);
  check('the Cub\'s recording, never set, is its pinned hash', never === want, `${never} against ${want}`);
  check('and with 0 set before it', zero === want, zero);
}

/* A power off glide in Manual from the pose, the sticks centred: the mean
 * vertical speed over its last 5 s. */
function glide(sim, w) {
  must(sim.reset(), 'reset');
  must(sim.e.sim_wing_set_stab(0), 'stab');
  must(sim.e.sim_set_air_vertical(w), 'air');
  must(sim.e.sim_set_pose(0, 600, 300, 1, 0, 0, 0), 'pose');
  must(sim.e.sim_wing_launch(8), 'launch');
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

console.log('3. a glider in rising air');
{
  const sim = await fresh(6);
  const still = glide(sim, 0);
  const rise = glide(sim, 0.5);
  check('a Radian\'s glide sinks 0.5 m/s less in 0.5 m/s of rise', Math.abs(rise - still - 0.5) <= 0.01, `${still.toFixed(3)} m/s still, ${rise.toFixed(3)} in the rise`);
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
  const sim = await fresh(6);
  const still = glide(sim, 0);
  must(sim.e.sim_set_air_vertical(0.5), 'air');
  must(sim.reset(), 'reset');
  must(sim.e.sim_set_wind(0, 0, 0), 'wind');
  must(sim.e.sim_wing_set_stab(0), 'stab');
  must(sim.e.sim_set_pose(0, 600, 300, 1, 0, 0, 0), 'pose');
  must(sim.e.sim_wing_launch(8), 'launch');
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
  const back = glide(sim, 0);
  check('and 0 takes it away, to the bit', back === still, `${back} against ${still}`);
}

console.log(failed ? `${failed} FAILED` : 'all ok');
process.exit(failed ? 1 : 0);
