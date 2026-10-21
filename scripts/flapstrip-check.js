/*
 * flapstrip-check.js: a part span flap lifts and stalls the strips it
 * spans and leaves the rest of the wing as it was (docs/FLIGHTMODEL.md,
 * flaps over their strips). For each aircraft with flaps, held at 12 m/s
 * with the wings level and the nose raised a quarter degree at a time, the
 * angle of attack (the zero lift line's) at which each strip of the left
 * half first separates (sim_wing_strips), flaps up and at full:
 *   F1 a strip outside the flaps separates at the same angle with them
 *      down as up, within the step: the flaps are not on it;
 *   F2 a strip wholly inside the flaps separates earlier with them down
 *      (the flap's lift on that strip, more than the CLmax it adds there,
 *      takes it to its stall sooner: DATCOM's plain flap lowers the stall
 *      angle, Raymer sec. 12.6), and earlier than the strips outside them:
 *      the root stalls first, the tips and their ailerons keep flying.
 *
 *   node scripts/flapstrip-check.js
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

import { loadSim } from '../tests/lib/simmod.js';
import { must, wingDebug } from '../tests/lib/wingpilot.js';
import { precutRow } from './lib/precut.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = await readFile(join(root, 'src/native/plant_wing.c'), 'utf8');
const sim = await loadSim(new Uint8Array(await readFile(join(root, 'dist/sim.wasm'))));
must(sim.init(await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8')), 'init');
const stripPtr = sim.e.malloc(8 * 8);

/* The aircraft with flaps and their table's name in plant_wing.c. They
 * left the shell before their plants leave the module (2026-10-21), so
 * their rows are the pre-cut ones (scripts/lib/precut.js). */
const FLAPPED = {
  timber1500: 'FW_TIMBER1500',
  p51d1450: 'FW_P51D1450',
  nighttimber1200: 'FW_NIGHTTIMBER1200',
};
const STEP = 0.25;
const SEP = 1e-3;
const deg = (r) => (r * 180) / Math.PI;

let failed = 0;
let passed = 0;
function check(name, ok, detail) {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}  (${detail})`);
}

/* Each left strip's first separating angle of attack, deg, body raised
 * from 0 to 30 deg, each angle held 300 ms so the strips' lag settles. */
function onsets(id, notch) {
  must(sim.e.sim_set_airframe(precutRow(id).simId), 'sim_set_airframe');
  sim.clearPower();
  sim.clearTune();
  must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_wing_set_flaps(notch), 'sim_wing_set_flaps');
  sim.e.sim_wing_flaps_settle();
  const at = [null, null, null, null];
  let t = 0;
  for (let body = 0; body <= 30; body += STEP) {
    const a = (body * Math.PI) / 180;
    for (let ms = 0; ms < 300; ms += 1) {
      must(sim.e.sim_set_pose(0, 0, 300, Math.cos(a / 2), 0, -Math.sin(a / 2), 0), 'sim_set_pose');
      must(sim.e.sim_set_velocity(12, 0, 0, 0, 0, 0), 'sim_set_velocity');
      must(sim.input(t / 1000, 0, 0, 0, 0), 'sim_input');
      must(sim.step(1), 'sim_step');
      t += 1;
    }
    must(sim.e.sim_wing_strips(stripPtr), 'sim_wing_strips');
    const sep = new Float64Array(sim.e.memory.buffer, stripPtr, 8);
    const alpha = deg(wingDebug(sim)[0]);
    for (let i = 0; i < 4; i += 1) {
      if (at[i] === null && Math.abs(sep[i]) > SEP) at[i] = alpha;
    }
  }
  return at;
}

for (const [id, table] of Object.entries(FLAPPED)) {
  const body = src.slice(src.indexOf(`const FixedWingParams ${table} = {`)).split('\n};')[0];
  const m = body.match(/\.flap_eta = \{ ([0-9.]+), ([0-9.]+) \}/);
  if (!m) {
    check(`${id} has its flaps' span (flap_eta)`, false, 'none in its table');
    continue;
  }
  const [lo, hi] = [Number(m[1]), Number(m[2])];
  const up = onsets(id, 0);
  const full = onsets(id, 2);
  const f = (x) => (x === null ? 'none' : x.toFixed(2));
  console.log(`${id}: flaps over ${lo} to ${hi} of the semispan; strips root to tip separate at ${up.map(f).join(', ')} deg up, ${full.map(f).join(', ')} full`);
  const inside = [], outside = [];
  for (let i = 0; i < 4; i += 1) {
    if (lo <= 0.25 * i && 0.25 * (i + 1) <= hi) inside.push(i);
    if (0.25 * i >= hi || 0.25 * (i + 1) <= lo) outside.push(i);
  }
  for (const i of outside) {
    check(`F1 ${id} strip ${i + 1}, outside the flaps, stalls at the same angle with them down`,
      up[i] !== null && full[i] !== null && Math.abs(full[i] - up[i]) <= STEP + 1e-9, `${f(up[i])} up, ${f(full[i])} full`);
  }
  for (const i of inside) {
    const firstOut = Math.min(...outside.map((j) => full[j] ?? Infinity));
    check(`F2 ${id} strip ${i + 1}, inside the flaps, stalls sooner with them down and before the strips outside`,
      up[i] !== null && full[i] !== null && full[i] < up[i] && full[i] < firstOut,
      `${f(up[i])} up, ${f(full[i])} full, first outside ${f(firstOut === Infinity ? null : firstOut)}`);
  }
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
