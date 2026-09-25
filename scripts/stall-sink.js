/*
 * stall-sink.js: how fast each fixed wing comes down held full back,
 * power off, the question the owner's first flight asked of the post
 * stall model (docs/STALL-STAGE1.md). Launched at 1.15 V_s, 300 m up, wings
 * level, the stick brought back over 2 s and held 14 s, in Manual,
 * Stabilised and Acro; the steady state is the mean of the last 6 s: the
 * sink, the airspeed, the angle of attack and the pitch, and the largest
 * bank over the whole hold. --wasm=<path> flies another module, for a
 * before and after.
 *
 *   node scripts/stall-sink.js [--wasm=path] [--only key,...]
 *
 * Harness arithmetic in JS maths, which is allowed: nothing it prints is
 * hashed.
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
import { must, wingDebug } from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const arg = (name) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
};
const wasm = new Uint8Array(await readFile(arg('wasm') ?? join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const only = arg('only') ? new Set(arg('only').split(',')) : null;
const DEG = 180 / Math.PI;
const MS = 4;

/* sim index and the power off stall speed from each airframe's gates. */
const PLANES = {
  wing: [2, 7.25], sky: [3, 9.2], cub: [4, 8.1], slowstick: [5, 4.4], radian: [6, 6.5],
  timber: [7, 7.2], bramor: [8, 13.0], timberf: [9, 7.1], cubf: [10, 8.7], bombshell: [11, 6.49],
};
const MODES = [[0, 'Manual'], [1, 'Stabilised'], [2, 'Acro']];

for (const [key, [id, vs]] of Object.entries(PLANES)) {
  if (only && !only.has(key)) continue;
  const cells = [];
  for (const [mode, name] of MODES) {
    const sim = await loadSim(wasm);
    must(sim.init(configText), 'sim_init');
    if (sim.e.sim_set_airframe(id) !== 0) {
      cells.push(`${name}: no such airframe`);
      continue;
    }
    must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
    must(sim.reset(), 'sim_reset');
    must(sim.e.sim_wing_set_stab(mode), 'sim_wing_set_stab');
    must(sim.e.sim_set_pose(0, 0, 300, 1, 0, 0, 0), 'sim_set_pose');
    must(sim.e.sim_wing_launch(1.15 * vs), 'sim_wing_launch');
    let n = 0, sink = 0, v = 0, a = 0, pitch = 0, bank = 0;
    for (let ms = 0; ms < 16000; ms += MS) {
      const s = sim.readState().state;
      const b = Math.atan2(2 * (s[9] * s[10] + s[7] * s[8]), 1 - 2 * (s[8] * s[8] + s[9] * s[9]));
      bank = Math.max(bank, Math.abs(b));
      if (ms >= 10000) {
        sink += -s[6];
        v += Math.hypot(s[4], s[5], s[6]);
        a += wingDebug(sim)[0];
        pitch += Math.asin(Math.max(-1, Math.min(1, 2 * (s[8] * s[10] - s[7] * s[9]))));
        n += 1;
      }
      must(sim.input(ms / 1000, 0, Math.min(1, ms / 2000), 0, 0), 'sim_input');
      must(sim.step(MS), 'sim_step');
    }
    cells.push(`${name}: sink ${(sink / n).toFixed(2)} m/s at ${(v / n).toFixed(1)} m/s, alpha ${(a / n * DEG).toFixed(1)}, `
      + `pitch ${(pitch / n * DEG).toFixed(1)}, bank up to ${(bank * DEG).toFixed(0)}`);
  }
  console.log(`${key.padEnd(10)} ${cells.join(' | ')}`);
}
