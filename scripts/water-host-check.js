/*
 * water-host-check.js: the shell declares a map's water to the plant
 * loudly. In Node, against dist/sim.wasm and src/game/water.js's
 * declareBodies, the code the shell's declareWater runs (src/main.js).
 *
 *   node scripts/water-host-check.js
 *
 * docs/ITAIPU-PLAN.md section 14, package C: a refusal throws. An outline
 * of 257 corners, one past the plant's 256 (the host used to drop the
 * error and the plant kept the first 256), a ninth body, a channel wider
 * than the plant takes; 256 corners and eight bodies are declared.
 *
 * Exits 1 on any failure.
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
import { must } from '../tests/lib/wingpilot.js';
import { declareBodies } from '../src/game/water.js';
import { threePosToSim, threeDirToSim } from '../src/render/frame.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const sim = await loadSim(wasmBytes);
if (sim.init(configText) !== SIM_OK) {
  throw new Error('sim_init failed');
}

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};
const throws = (fn) => {
  try {
    fn();
    return '';
  } catch (e) {
    return e.message;
  }
};

/* The shell's frame with the spawn at (sx, sy, sz) facing -z: main.js
 * worldPosToSim at a spawn yaw of 0, without the craft's SPAWN_ALT, which
 * this check does not fly from. */
const frameAt = (sx, sy, sz) => ({
  pos: (x, y, z, out) => threePosToSim(x - sx, y - sy, z - sz, out),
  dir: (x, y, z, out) => threeDirToSim(x, y, z, out),
  perMetre: 1,
});
const origin = frameAt(0, 0, 0);
const still = { speed: 0, toX: 1, toZ: 0, fetch: 0 };
/* A lake whose outline is a circle of `corners` corners. */
const lake = (x, z, r, y, corners, spawn = null) => ({
  kind: 'lake',
  surfaceY: y,
  outline: Array.from({ length: corners }, (_, k) => ({ x: x + r * Math.cos((k / corners) * 2 * Math.PI), z: z + r * Math.sin((k / corners) * 2 * Math.PI) })),
  centre: { x, z },
  spawn,
  wind: still,
});
const declare = (bodies, frame = origin) => {
  must(sim.e.sim_water_clear(), 'sim_water_clear');
  return declareBodies(sim.e, bodies, frame);
};

/* The refusals. */
{
  const ok256 = throws(() => declare([lake(0, 0, 100, 0, 256)]));
  const too257 = throws(() => declare([lake(0, 0, 100, 0, 257)]));
  const eight = throws(() => declare(Array.from({ length: 8 }, (_, k) => lake(k * 300, 0, 100, 0, 16))));
  const nine = throws(() => declare(Array.from({ length: 9 }, (_, k) => lake(k * 300, 0, 100, 0, 16))));
  const wide = throws(() => declare([{ kind: 'channel', halfWidth: 1500, line: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -10 }] }]));
  check('an outline of 257 corners throws, where the host used to keep 256 without a word; 256 are declared',
    ok256 === '' && /sim_water_vertex \(corner 257 of 257\)/.test(too257),
    `256: ${ok256 || 'declared'}; 257: ${too257}`);
  check('a ninth body throws, eight are declared, and so does a channel the plant refuses',
    eight === '' && /sim_water_add.*body 8 of 9/.test(nine) && /sim_water_channel/.test(wide),
    `eight: ${eight || 'declared'}; nine: ${nine}; 1.5 km half width: ${wide}`);
}

must(sim.e.sim_water_clear(), 'sim_water_clear');
const failed = checks.filter((c) => !c.ok).length;
console.log(`${checks.length - failed} of ${checks.length} passed`);
process.exit(failed ? 1 : 0);
