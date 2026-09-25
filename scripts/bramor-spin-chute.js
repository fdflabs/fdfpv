/*
 * bramor-spin-chute.js: the Bramor recovers from its flat spin under its
 * parachute (docs/STALL-STAGE1.md). The flat spin is entered the way
 * stall-probe.js enters it, full back and full right roll from 1.15 V_s,
 * and held 5 s; then the chute is pulled, which cuts the motor and centres
 * the surfaces as the aircraft's autopilot does. From each release height
 * it measures the descent rate over the last 10 m before the grass, the
 * yaw rate there and how it hangs at the grass, against the
 * rated sink of the canopy it was sized for, 5.0 m/s (tests/bramor-
 * thresholds.json b10_chute_sink, 4 to 6 m/s). The release heights are the
 * spin's loss plus 20 to 200 m: the manual's minimum deployment height
 * was not found, so the lowest is where the canopy has just had time to
 * open and swing, and the gate is that every one above it recovers.
 *
 *   node scripts/bramor-spin-chute.js
 *
 * Exit code 1 if any release fails. Harness arithmetic in JS maths, which
 * is allowed: nothing it prints is hashed.
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

import { loadSim } from '../tests/lib/simmod.js';
import { must, wingDebug, BRAMOR_AIRFRAME } from '../tests/lib/wingpilot.js';
import { GROUND_MU, GROUND_E } from '../src/game/collide.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasm = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const th = JSON.parse(await readFile(join(root, 'tests/bramor-thresholds.json'), 'utf8'));
const DEG = 180 / Math.PI;
const MS = 4;
const VS = 13.0;
const band = th.b10_chute_sink;

let bad = 0;
for (const above of [20, 40, 80, 200]) {
  const sim = await loadSim(wasm);
  must(sim.init(configText), 'sim_init');
  must(sim.e.sim_set_airframe(BRAMOR_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, GROUND_MU, GROUND_E), 'sim_set_ground');
  must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
  /* Launched `above` metres over the grass plus the 3 s the stall and the
   * 5 s of spin take; the pull height printed is where it happened. */
  const z0 = above + 30;
  must(sim.e.sim_set_pose(0, 0, z0, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(1.15 * VS), 'sim_wing_launch');
  let t = 0;
  let spinYaw = 0;
  let pull = null;
  const trace = [];
  let touch = null;
  for (let ms = 0; ms < 60000; ms += MS) {
    const s = sim.readState().state;
    const up = [2 * (s[8] * s[10] - s[7] * s[9]), 2 * (s[9] * s[10] + s[7] * s[8]), 1 - 2 * (s[8] * s[8] + s[9] * s[9])];
    const yawRate = s[11] * up[0] + s[12] * up[1] + s[13] * up[2];
    if (pull === null && ms >= 5000) {
      spinYaw = yawRate;
      pull = { z: s[3], alpha: wingDebug(sim)[0], yawRate };
      must(sim.e.sim_wing_chute(1), 'sim_wing_chute');
    }
    if (pull !== null) {
      trace.push({ z: s[3], vz: s[6], yaw: yawRate, upz: up[2] });
      if (touch === null && sim.e.sim_ground_contacts() > 0) {
        touch = { vz: s[6], v: Math.hypot(s[4], s[5], s[6]), upz: up[2] };
        break;
      }
    }
    const sticks = pull === null ? [1, Math.min(1, ms / 2000), 0, 0] : [0, 0, 0, 0];
    must(sim.input(t / 1000, ...sticks), 'sim_input');
    must(sim.step(MS), 'sim_step');
    t += MS;
  }
  const last = trace.filter((o) => o.z <= 10 && o.z > 0.5);
  const sink = last.length ? -last.reduce((a, o) => a + o.vz, 0) / last.length : NaN;
  const yaw = last.length ? Math.max(...last.map((o) => Math.abs(o.yaw))) : NaN;
  const ok = pull && Math.abs(pull.alpha) > 0.6 && Math.abs(spinYaw) > 60 / DEG && touch !== null
    && sink >= band.min && sink <= band.max;
  if (!ok) bad += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} pulled at ${pull.z.toFixed(1)} m in the flat spin (alpha ${(pull.alpha * DEG).toFixed(0)} deg, `
    + `turning ${(Math.abs(spinYaw) * DEG).toFixed(0)} deg/s): over the last 10 m sinking ${sink.toFixed(2)} m/s `
    + `(rated ${band.min} to ${band.max}), turning at most ${(yaw * DEG).toFixed(0)} deg/s, `
    + `${touch ? `at the grass hanging with its body up axis at z ${touch.upz.toFixed(2)} (-1 is flat on its back)` : 'never reached the grass'}`);
}
if (bad > 0) {
  process.exitCode = 1;
}
