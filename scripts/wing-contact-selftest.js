/*
 * wing-contact-selftest.js: the wing against the ground plane, in Node.
 *
 * The wing's hull is a flat box a metre wide and seven centimetres thick,
 * through the same contact path as the quad's. Four things a wing does
 * with the ground that a quad does not: a belly landing that skids and
 * stops, a wingtip touching first in a bank and the wing settling flat, a
 * nose-in that stops rather than tunnels, and a throw from the grass
 * that leaves it. The Skyhunter's hull, 1.8 m wide, gets the same four.
 * The Cub stands on wheels, so its four are the same arrivals ending on
 * its gear rather than its belly: a level arrival that lands on the wheels
 * and rolls to a stop at its three point attitude, a wingtip strike that
 * falls back onto the wheels, the nose-in, and the throw. The Radian
 * lands on its belly as the first two do, and gets their four, thrown
 * with the stick that trims its climb. The Slow Stick stands on wheels
 * and gets the Cub's four at its own slow speeds. Run with npm run
 * wing:contact.
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
import { GROUND_MU, GROUND_E } from '../src/game/collide.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
/* Each fixed wing's hull, as src/native/plant.c gives it, and the speeds
 * its cases are flown at: a landing a little above its stall, a nose-in,
 * and a throw from the grass with the stick a hand would hold. */
const PLANES = [
  { name: 'wing', id: 2, hx: 0.25, hy: 0.5, down: 0.035, up: 0.035, land: 8, nose: 10, toss: 10, tossSticks: [0, 0.15, 0, 0.7] },
  { name: 'skyhunter', id: 3, hx: 0.61, hy: 0.9, down: 0.12, up: 0.08, land: 11, nose: 13, toss: 12, tossSticks: [0, 0.3, 0, 0.8] },
  { name: 'cub', id: 4, hx: 0.30, hy: 0.70, down: 0.05, up: 0.12, land: 9, nose: 10, toss: 10, tossSticks: [0, 0.18, 0, 0.8], wheels: { restPitchDeg: 11.0, restZ: 0.1463 } },
  { name: 'radian', id: 6, hx: 0.45, hy: 0.55, down: 0.052, up: 0.08, land: 8, nose: 10, toss: 10, tossSticks: [0, -0.274, 0, 0.7] },
  { name: 'slowstick', id: 5, hx: 0.30, hy: 0.588, down: 0.03, up: 0.06, land: 5, nose: 6, toss: 6, tossSticks: [0, 0.1, 0, 0.8], wheels: { restPitchDeg: 6.91, restZ: 0.1349 } },
  { name: 'timber', id: 7, hx: 0.30, hy: 0.60, down: 0.05, up: 0.12, land: 9, nose: 10, toss: 10, tossSticks: [0, 0.1, 0, 0.8], wheels: { restPitchDeg: 11.81, restZ: 0.2117 } },
];

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}
const must = (c, w) => { if (c !== SIM_OK) throw new Error(`${w}: ${c}`); };

async function wing(plane) {
  const sim = await loadSim(wasmBytes);
  must(sim.init(configText), 'init');
  must(sim.e.sim_set_airframe(plane.id), 'airframe');
  must(sim.setCellVoltage(4.1), 'volts');
  must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, GROUND_MU, GROUND_E), 'ground');
  return sim;
}
const state = (sim) => sim.readState().state;
const finite = (s) => Array.from(s).every((v) => Number.isFinite(v));
const speed = (s) => Math.hypot(s[4], s[5], s[6]);
/* The lowest of the hull's eight corners in the world, given the pose. */
function lowestCorner(plane, s) {
  const w = s[7], x = s[8], y = s[9], z = s[10];
  const rot = (v) => [
    (1 - 2 * (y * y + z * z)) * v[0] + 2 * (x * y - w * z) * v[1] + 2 * (x * z + w * y) * v[2],
    2 * (x * y + w * z) * v[0] + (1 - 2 * (x * x + z * z)) * v[1] + 2 * (y * z - w * x) * v[2],
    2 * (x * z - w * y) * v[0] + 2 * (y * z + w * x) * v[1] + (1 - 2 * (x * x + y * y)) * v[2],
  ];
  let low = Infinity;
  for (const cx of [-plane.hx, plane.hx]) for (const cy of [-plane.hy, plane.hy]) for (const cz of [-plane.down, plane.up]) {
    low = Math.min(low, s[3] + rot([cx, cy, cz])[2]);
  }
  return low;
}
function run(sim, ms, sticks = [0, 0, 0, 0]) {
  const t0 = Number(state(sim)[0]);
  for (let i = 0; i < ms; i += 4) {
    must(sim.input(t0 + i / 1000 + 0.0001, ...sticks), 'input');
    must(sim.step(4), 'step');
  }
  return state(sim);
}
/* The load on each of the Cub's contact points: mains, tail, prop tip. */
function loads(sim) {
  const p = sim.e.malloc(4 * 8);
  must(sim.e.sim_wheel_loads(p), 'wheel loads');
  const out = Array.from(new Float64Array(sim.e.memory.buffer, p, 4));
  sim.e.free(p);
  return out;
}
const pitchOf = (s) => Math.asin(Math.max(-1, Math.min(1, 2 * (s[8] * s[10] - s[7] * s[9])))) * 180 / Math.PI;
const onWheels = (plane, sim, s) => {
  const l = loads(sim);
  return l[0] > 0 && l[1] > 0 && l[2] > 0 && l[3] === 0 && Math.abs(pitchOf(s) - plane.wheels.restPitchDeg) < 1 && Math.abs(s[3] - plane.wheels.restZ) < 0.01;
};
const pitchQuat = (deg) => { const h = deg * Math.PI / 360; return [Math.cos(h), 0, Math.sin(h), 0]; };
const rollQuat = (deg) => { const h = deg * Math.PI / 360; return [Math.cos(h), Math.sin(h), 0, 0]; };

for (const plane of PLANES) {
  console.log(`${plane.name} and the ground`);
  {
    const sim = await wing(plane);
    must(sim.e.sim_set_pose(0, 0, 0.30, 1, 0, 0, 0), 'pose');
    must(sim.e.sim_wing_launch(plane.land), 'launch');
    if (plane.wheels) {
      const s = run(sim, 12000);
      check(`a level arrival at ${plane.land} m/s lands on the wheels and rolls to a stop`, finite(s) && Math.hypot(s[4], s[5]) < 0.05, `speed ${speed(s).toFixed(2)}`);
      check('standing on its three wheels at its three point attitude, the hull clear', onWheels(plane, sim, s) && lowestCorner(plane, s) > 0.02, `pitch ${pitchOf(s).toFixed(2)} deg, z ${s[3].toFixed(4)}, loads ${loads(sim).map((f) => f.toFixed(2)).join(' ')}, lowest corner ${lowestCorner(plane, s).toFixed(3)}`);
      check('and it rolled, it did not stick', s[1] > 5.0, `${s[1].toFixed(1)} m along`);
    } else {
      const s = run(sim, 4000);
      check(`a belly landing at ${plane.land} m/s comes to rest`, finite(s) && speed(s) < 0.3, `speed ${speed(s).toFixed(2)}`);
      check('resting on the plane, not in it', Math.abs(lowestCorner(plane, s)) < 0.02 && s[3] > 0, `lowest corner ${lowestCorner(plane, s).toFixed(3)} m, z ${s[3].toFixed(3)}`);
      check('and it slid, it did not stick', s[1] > 1.0, `${s[1].toFixed(1)} m along`);
    }
  }
  {
    const sim = await wing(plane);
    const q = rollQuat(60);
    must(sim.e.sim_set_pose(0, 0, 0.6, q[0], q[1], q[2], q[3]), 'pose');
    must(sim.e.sim_rest(), 'rest');
    const s = run(sim, 3000);
    const up = 1 - 2 * (s[8] * s[8] + s[9] * s[9]);
    check('a wingtip touching first ends with the wing flat', finite(s) && up > 0.95, `up ${up.toFixed(3)}`);
    if (plane.wheels) {
      check('and back on its wheels', onWheels(plane, sim, s), `pitch ${pitchOf(s).toFixed(2)} deg, z ${s[3].toFixed(4)}, loads ${loads(sim).map((f) => f.toFixed(2)).join(' ')}`);
    }
    check('no corner below the plane after the tip strike', lowestCorner(plane, s) > -0.02, `${lowestCorner(plane, s).toFixed(3)}`);
  }
  {
    const sim = await wing(plane);
    const q = pitchQuat(45); /* nose down 45 */
    must(sim.e.sim_set_pose(0, 0, 1.0, q[0], q[1], q[2], q[3]), 'pose');
    must(sim.e.sim_wing_launch(plane.nose), 'launch');
    const s = run(sim, 3000);
    check('a nose-in stops rather than tunnels', finite(s) && speed(s) < 0.5 && lowestCorner(plane, s) > -0.05, `speed ${speed(s).toFixed(2)}, lowest ${lowestCorner(plane, s).toFixed(3)}`);
  }
  {
    const sim = await wing(plane);
    /* An aircraft on wheels sits on them, at the pose its gear holds it
     * in; seated on its hull instead, its struts would start the case
     * compressed by the gear's whole height and throw it into the air. */
    const q0 = plane.wheels ? pitchQuat(-plane.wheels.restPitchDeg) : [1, 0, 0, 0];
    must(sim.e.sim_set_pose(0, 0, plane.wheels ? plane.wheels.restZ : plane.down + 0.005, q0[0], q0[1], q0[2], q0[3]), 'pose');
    must(sim.e.sim_rest(), 'rest');
    run(sim, 500);
    /* Into the hand first, as the shell does: a hull on the grass is held
     * by friction the moment it moves. */
    const rest = state(sim);
    must(sim.e.sim_set_pose(rest[1], rest[2], rest[3] + 1.2, rest[7], rest[8], rest[9], rest[10]), 'lift');
    must(sim.e.sim_wing_launch(plane.toss), 'launch');
    const s = run(sim, 2500, plane.tossSticks);
    check('a throw from the grass leaves it', finite(s) && s[3] > 1.0 && speed(s) > plane.toss - 1, `z ${s[3].toFixed(2)} m, ${speed(s).toFixed(1)} m/s`);
  }
}
console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
