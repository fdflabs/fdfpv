/*
 * water-host-check.js: the shell declares a map's water to the plant
 * loudly, and a float plane starts on the body chosen. In Node, against
 * dist/sim.wasm and src/game/water.js, the code the shell's declareWater
 * and mapSpawn run (src/main.js).
 *
 *   node scripts/water-host-check.js
 *
 * docs/ITAIPU-PLAN.md section 14, package C:
 *
 *   a refusal throws: an outline of 257 corners, one past the plant's 256
 *     (the host used to drop the error and the plant kept the first 256),
 *     a ninth body, a channel wider than the plant takes; 256 corners and
 *     eight bodies are declared (the shipped maps' water needs a browser,
 *     since the alps' terrain imports three.js: river:page declares
 *     swiss2's through the real shell);
 *   the spawn is the chosen body's: Itaipu's two bodies as the plan puts
 *     them (the reservoir at 219.0 over a bed at 216.0, the river at 103.5
 *     over one at 100.5, package A's report), declared in the shell's
 *     order, and the Timber on floats started from body 1's spawn floats
 *     on body 1 at 103.5 m, sim_float_state out[9] = 1, and from body 0's
 *     on body 0 at 219.0; a body without a spawn (a river channel) is not
 *     a start and choosing it throws.
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
import { TIMBERF_AIRFRAME, FLOAT_REST, RC_STEP_MS, floatState, must } from '../tests/lib/wingpilot.js';
import { declareBodies, floatSpawn } from '../src/game/water.js';
import { threePosToSim, threeDirToSim } from '../src/render/frame.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const sim = await loadSim(wasmBytes);
if (sim.init(configText) !== SIM_OK) {
  throw new Error('sim_init failed');
}
must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');

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
const W_TIMBER = 1.934 * 9.81;

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

/* Itaipu's two bodies, reservoir first, and a channel after them. The
 * outlines are circles round each spawn of 232 corners, as many as package
 * A's; package E brings the real ones. */
const RESERVOIR = { ...lake(60, -2500, 900, 219.0, 232, { x: 60, z: -2500, yaw: Math.PI }), bedY: 216.0 };
const RIVER = { ...lake(-925, 400, 300, 103.5, 232, { x: -925, z: 400, yaw: 0 }), bedY: 100.5 };
const CHANNEL = { kind: 'channel', halfWidth: 3, line: [{ x: 2000, y: 150, z: 0 }, { x: 2000, y: 149, z: -100 }] };
const ITAIPU = [RESERVOIR, RIVER, CHANNEL];

/* The Timber on floats started at body `chosen`'s spawn as the shell
 * starts it: the plant's frame at the spawn, the water declared in it,
 * the ground at the bed, the aircraft at its rest height over the still
 * water. Two seconds with the sticks centred and the throttle shut. */
function startOn(chosen) {
  const sp = floatSpawn(ITAIPU, chosen);
  const under = ITAIPU.find((w) => w.spawn === sp);
  const sy = under.surfaceY;
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_set_airframe(TIMBERF_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  declare(ITAIPU, frameAt(sp.x, sy, sp.z));
  must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, under.bedY - sy, 1.4, 0), 'sim_set_ground');
  const rest = FLOAT_REST[TIMBERF_AIRFRAME];
  const h = rest.pitchDeg * Math.PI / 360;
  must(sim.e.sim_set_pose(0, 0, rest.z, Math.cos(h), 0, -Math.sin(h), 0), 'sim_set_pose');
  let s = null;
  for (let ms = 0; ms < 2000; ms += RC_STEP_MS) {
    must(sim.input(ms / 1000, 0, 0, 0, 0), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    s = sim.readState().state;
  }
  const f = floatState(sim);
  return { body: f[9], buoyancy: f[0], y: sy + s[3], over: s[3], speed: Math.hypot(s[4], s[5], s[6]) };
}

{
  const river = startOn(1);
  check('the Timber started on body 1, the river, floats on body 1 at 103.5 m',
    river.body === 1 && Math.abs(river.buoyancy - W_TIMBER) < 0.1 * W_TIMBER && Math.abs(river.over - FLOAT_REST[TIMBERF_AIRFRAME].z) < 0.005 && river.speed < 0.2,
    `sim_float_state out[9] ${river.body}, buoyancy ${river.buoyancy.toFixed(1)} N of ${W_TIMBER.toFixed(1)}, CG at ${river.y.toFixed(3)} m, ${river.over.toFixed(4)} over the surface (rest ${FLOAT_REST[TIMBERF_AIRFRAME].z}), ${river.speed.toFixed(3)} m/s`);
  const reservoir = startOn(0);
  check('and started on body 0, the reservoir, floats on body 0 at 219.0 m',
    reservoir.body === 0 && Math.abs(reservoir.buoyancy - W_TIMBER) < 0.1 * W_TIMBER && Math.abs(reservoir.over - FLOAT_REST[TIMBERF_AIRFRAME].z) < 0.005,
    `sim_float_state out[9] ${reservoir.body}, buoyancy ${reservoir.buoyancy.toFixed(1)} N, CG at ${reservoir.y.toFixed(3)} m`);
  const channel = throws(() => floatSpawn(ITAIPU, 2));
  const none = throws(() => floatSpawn(ITAIPU, 3));
  check('a body with no spawn, or none at all, is not a start and throws',
    /no float spawn/.test(channel) && /no float spawn/.test(none),
    `${channel}; ${none}`);
}

must(sim.e.sim_water_clear(), 'sim_water_clear');
const failed = checks.filter((c) => !c.ok).length;
console.log(`${checks.length - failed} of ${checks.length} passed`);
process.exit(failed ? 1 : 0);
