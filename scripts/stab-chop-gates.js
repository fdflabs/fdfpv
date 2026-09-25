/*
 * stab-chop-gates.js: every fixed wing in Stabilised, the throttle closed
 * from cruise with the sticks centred, against its own derived glide.
 *
 * Each aircraft is thrown at its derived cruise speed 600 m to the side of
 * the airfield, clear of every thermal, flies 10 s at its cruise throttle
 * (stab_trim_throttle) in Stabilised with every stick centred, and then
 * has its throttle closed for 15 s. Stabilised lowers its pitch target by
 * stab_pitch_down to the airframe's power off glide (ArduPilot's
 * STAB_PITCH_DOWN, scripts/stab-glide-derive.js), so the aircraft should
 * settle on the glide it trims at by itself: never at the stall's alpha,
 * and the mean sink of the last 10 s within the band about the derived
 * sink. The band is the Bombshell's S21, its S3 glide band in proportion
 * (tests/bombshell-thresholds.json): the derived sink over 1.12 to over
 * 0.89. Bands are never widened here: a plant outside one is a finding
 * for the derivation. Run with npm run stab:chop.
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
import {
  must, wingDebug, RC_STEP_MS, WING_AIRFRAME, SKY_AIRFRAME, CUB_AIRFRAME, GLIDER_AIRFRAME, BRAMOR_AIRFRAME,
  SLOWSTICK_AIRFRAME, TIMBER_AIRFRAME, TIMBERF_AIRFRAME, CUBF_AIRFRAME, BOMBSHELL_AIRFRAME,
} from '../tests/lib/wingpilot.js';
import { deriveAll } from './stab-glide-derive.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DEG = 180 / Math.PI;
const AIRFRAME = {
  FW_WING1000: WING_AIRFRAME, FW_SKY1800: SKY_AIRFRAME, FW_CUB1400: CUB_AIRFRAME, FW_RADIAN2000: GLIDER_AIRFRAME,
  FW_BRAMOR2300: BRAMOR_AIRFRAME, FW_SLOWSTICK1180: SLOWSTICK_AIRFRAME, FW_TIMBER1500: TIMBER_AIRFRAME,
  FW_TIMBER1500F: TIMBERF_AIRFRAME, FW_CUB1400F: CUBF_AIRFRAME, FW_BOMBSHELL1118: BOMBSHELL_AIRFRAME,
};
/* The Bombshell's S3 band about its derived 8.62: 7.67 to 9.65. */
const BAND_LO = 8.62 / 9.65, BAND_HI = 8.62 / 7.67;
const CRUISE_S = 10, CHOP_S = 15, FROM_S = 5;
const STILL_AIR = [0, 600, 200, 1, 0, 0, 0];

const sim = await loadSim(new Uint8Array(await readFile(join(root, 'dist/sim.wasm'))));
if (sim.init(await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8')) !== SIM_OK) {
  throw new Error('sim_init failed');
}

console.log('stab chop gates: the throttle closed in Stabilised, sticks centred, against each derived glide');
let failed = 0;
for (const d of await deriveAll()) {
  const id = AIRFRAME[d.name];
  if (id === undefined || !d.glide || !d.cruise) {
    failed += 1;
    console.log(`  FAIL  ${d.name}: ${id === undefined ? 'no airframe id for it here' : 'no derived glide or cruise'}`);
    continue;
  }
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_set_airframe(id), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_set_pose(...STILL_AIR), 'sim_set_pose');
  must(sim.e.sim_wing_launch(d.cruise.V), 'sim_wing_launch');
  must(sim.e.sim_wing_set_stab(1), 'sim_wing_set_stab');
  let ms = 0;
  for (; ms < CRUISE_S * 1000; ms += RC_STEP_MS) {
    must(sim.input(ms / 1000, 0, 0, 0, d.fw.stab_trim_throttle), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
  }
  let alphaMax = -Infinity, sink = 0, v = 0, n = 0;
  for (let t = 0; t < CHOP_S * 1000; t += RC_STEP_MS, ms += RC_STEP_MS) {
    must(sim.input(ms / 1000, 0, 0, 0, 0), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    alphaMax = Math.max(alphaMax, wingDebug(sim)[0]);
    if (t >= FROM_S * 1000) {
      const s = sim.readState().state;
      sink += -s[6];
      v += Math.hypot(s[4], s[5], s[6]);
      n += 1;
    }
  }
  sink /= n;
  v /= n;
  const lo = d.glide.sink * BAND_LO, hi = d.glide.sink * BAND_HI;
  const ok = sink >= lo && sink <= hi && alphaMax < d.alphaStall;
  if (!ok) failed += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${d.name.padEnd(17)} sink ${sink.toFixed(3)} m/s at ${v.toFixed(2)} m/s, alpha at most ${(alphaMax * DEG).toFixed(1)} deg`
    + `   derived ${d.glide.sink.toFixed(3)} at ${d.glide.V.toFixed(2)}: sink ${lo.toFixed(3)} to ${hi.toFixed(3)}, alpha under ${(d.alphaStall * DEG).toFixed(1)}`);
}
console.log(failed ? `\n${failed} gate(s) FAIL` : '\nevery fixed wing glides with the throttle closed in Stabilised');
process.exit(failed ? 1 : 0);
