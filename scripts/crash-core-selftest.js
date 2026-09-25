/*
 * crash-core-selftest.js: the plant side of crash physics, src/native/crash.c,
 * checked in Node against dist/sim.wasm. docs/CRASH-STAGE1.md is what it
 * holds the module to.
 *
 * 1. The tables: every airframe's parts sum to its mass with its CG at the
 *    origin, every part has a hull and a parent before it, the root's
 *    residual lies inside the root's own box, and configs/parts.js names
 *    what the module numbers.
 * 2. Under the limits nothing moves: the same contacts with crash physics
 *    on and off give byte identical traces.
 * 3. Each damage mode, forced and from a load, and what it does to the
 *    flight: a chipped prop's thrust and gyro line, a lost prop, a bent
 *    arm's tilt, a lost wing panel's roll, a lost surface, a knocked camera,
 *    a lost antenna, an ejected pack, a crushed nose.
 * 4. The free bodies: a part that leaves falls, lands and comes to rest; at
 *    most twelve move at once; the same run twice is byte identical.
 * 5. Surfaces, water and trees.
 * 6. The gear: each ground's rolling resistance, and the wheel brake.
 *
 * Every trace digest it prints is the Node half of the Node and Chrome
 * comparison that tests/browser/crash-harness.js makes.
 *
 * Run with npm run crash:core.
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
import { PART_KINDS, PARTS_MAX, DAMAGE_FLAGS, SURFACE } from '../configs/parts.js';
import { readPartTable, readPartsState, readDamageEvents, readMotorDamage } from './lib/crash.js';
import { CRASH_SCENARIOS, runScenario } from './lib/crash-scenarios.js';
import { findChrome, runBrowserHarness } from '../tests/lib/browser.js';
import { startServer } from '../tests/lib/server.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');

const AIRFRAMES = [
  ['5in', 0], ['whoop65', 1], ['wing1000', 2], ['sky1800', 3], ['cub1400', 4], ['slowstick1180', 5],
  ['radian2000', 6], ['timber1500', 7], ['bramor2300', 8], ['timber1500f', 9], ['cub1400f', 10],
];
const MASS = { 0: 0.71, 1: 0.0234, 2: 0.65, 3: 2.10, 4: 1.32, 5: 0.42, 6: 0.98, 7: 1.70, 8: 4.5, 9: 1.934, 10: 1.532 };

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}${detail ? `  (${detail})` : ''}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}
const must = (c, w) => { if (c !== SIM_OK) throw new Error(`${w}: ${c}`); };

async function fresh(id) {
  const sim = await loadSim(wasmBytes);
  must(sim.init(configText), 'init');
  must(sim.e.sim_set_airframe(id), 'airframe');
  must(sim.reset(), 'reset');
  return sim;
}

console.log('1. the part tables');
for (const [name, id] of AIRFRAMES) {
  const sim = await fresh(id);
  const parts = readPartTable(sim);
  const m = parts.reduce((s, p) => s + p.mass, 0);
  const cg = [0, 1, 2].map((a) => parts.reduce((s, p) => s + p.mass * p.cg[a], 0) / m);
  /* The root is everything the table does not name, the wiring, the
   * boards, the servos, the shell, so its centre is a residual and can sit
   * outside its own drawn box; it must at least lie inside the airframe. */
  const root0 = parts[0];
  const lo = [0, 1, 2].map((a) => Math.min(...parts.map((p) => p.boxMin[a])));
  const hi = [0, 1, 2].map((a) => Math.max(...parts.map((p) => p.boxMax[a])));
  const inBox = [0, 1, 2].every((a) => root0.cg[a] >= lo[a] && root0.cg[a] <= hi[a]);
  const out = Math.max(...[0, 1, 2].map((a) => Math.max(root0.boxMin[a] - root0.cg[a], root0.cg[a] - root0.boxMax[a], 0)));
  const order = parts.every((p, i) => (i === 0 ? p.parent === -1 : p.parent >= 0 && p.parent < i));
  const kinds = parts.every((p) => PART_KINDS[p.kind] !== undefined);
  const hulls = parts.every((p) => p.points.length >= 2 && p.points.length <= 8);
  const joints = parts.every((p, i) => i === 0 || (p.momentLimit > 0 && p.forceLimit > 0));
  const masses = parts.every((p) => p.mass > 0);
  check(`${name}: ${parts.length} parts, masses sum to ${MASS[id]} kg`, Math.abs(m - MASS[id]) < 1e-12 && parts.length <= PARTS_MAX, `${m.toFixed(6)} kg`);
  check(`${name}: CG at the origin`, Math.hypot(...cg) < 1e-12, `(${cg.map((v) => v.toExponential(1)).join(', ')})`);
  check(`${name}: the root's residual mass is positive and its centre inside the airframe`, masses && inBox,
    `root ${root0.mass.toFixed(4)} kg at (${root0.cg.map((v) => v.toFixed(4)).join(', ')}), ${(out * 1000).toFixed(1)} mm outside its own box`);
  check(`${name}: parents precede children, every kind named, hulls and joints present`, order && kinds && hulls && joints);
}

console.log('2. configs/parts.js against the module');
{
  const sim = await fresh(0);
  const buf = sim.e.malloc(8 * 4);
  must(sim.e.sim_material_info(SURFACE.grass, buf), 'material');
  const grass = Array.from(new Float64Array(sim.e.memory.buffer, buf, 4));
  sim.e.free(buf);
  check('grass is the shell\'s ground, mu 1.40 and e 0', grass[0] === 1.4 && grass[1] === 0);
  check('sim_material_info refuses the id past the last surface', sim.e.sim_material_info(Object.keys(SURFACE).length, 0) !== SIM_OK);
  check('the flags are distinct bits', new Set(Object.values(DAMAGE_FLAGS)).size === Object.keys(DAMAGE_FLAGS).length);
}

console.log('3. the scenarios');
const nodeDigests = [];
for (const sc of CRASH_SCENARIOS) {
  const r = await runScenario(loadSim, wasmBytes, configText, sc);
  for (const c of r.checks) {
    check(`${sc.name}: ${c.name}`, c.ok, c.detail);
  }
  nodeDigests.push(`${sc.name}: ${r.digests.join(' ')}`);
}

console.log('4. Node and Chrome');
if (!findChrome()) {
  console.log('  SKIP  no Chrome here; a skip is not a pass');
} else {
  const server = await startServer(root);
  try {
    const out = await runBrowserHarness(`${server.origin}/tests/browser/crash-harness.html`, { timeoutMs: 600000 });
    const res = out.result || {};
    if (!res.ok) {
      check('the Chrome run completes', false, res.message || res.errorName || JSON.stringify(out).slice(0, 200));
    } else {
      for (let i = 0; i < nodeDigests.length; i += 1) {
        const same = res.digests[i] === nodeDigests[i];
        check(`every trace digest identical: ${nodeDigests[i].split(':')[0]}`, same,
          same ? nodeDigests[i].split(': ')[1] : `node ${nodeDigests[i]} / chrome ${res.digests[i]}`);
      }
    }
  } finally {
    await server.close();
  }
}

console.log('6. the gear: rolling resistance by surface, and the brake');
{
  /* The Cub on its wheels at the drawn rest pose, taxiing at half throttle
   * for 3 s: how far it gets says what holds it back. */
  const taxi = async (mat, brake, thr = 0.5) => {
    const sim = await fresh(4);
    must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, 1.4, 0), 'ground');
    if (mat !== null) {
      must(sim.e.sim_set_ground_material(mat), 'material');
    }
    if (brake !== null) {
      must(sim.e.sim_set_brake(brake), 'brake');
    }
    must(sim.e.sim_wing_set_stab(0), 'stab');
    const half = -11.0 * Math.PI / 360;
    must(sim.e.sim_set_pose(0, 0, 0.1463, Math.cos(half), 0, Math.sin(half), 0), 'pose');
    must(sim.rest(), 'rest');
    for (let ms = 0; ms < 3000; ms += 4) {
      must(sim.input(ms / 1000, 0, 0, 0, thr), 'input');
      must(sim.step(4), 'step');
    }
    return Array.from(sim.readState().state);
  };
  const same = (a, b) => a.every((v, i) => Object.is(v, b[i]));
  const plain = await taxi(null, null);
  const grass = await taxi(SURFACE.grass, null);
  check('grass and the default ground roll the same, to the bit', same(plain, grass));
  check('a brake at 0 is no brake, to the bit', same(plain, await taxi(null, 0)));
  const asphalt = await taxi(SURFACE.asphalt, null);
  const sand = await taxi(SURFACE.sand, null);
  check('asphalt rolls further than grass, and sand much less far', asphalt[1] > grass[1] && sand[1] < 0.5 * grass[1],
    `${asphalt[1].toFixed(2)} m, ${grass[1].toFixed(2)} m, ${sand[1].toFixed(2)} m`);
  const braked = await taxi(null, 1);
  check('the full brake holds it at half throttle', Math.abs(braked[1]) < 0.05 && braked[4] * braked[4] + braked[5] * braked[5] < 1e-4,
    `${braked[1].toFixed(3)} m`);
  const sim = await fresh(4);
  check('sim_set_brake refuses a value past 0 to 1, and NaN',
    sim.e.sim_set_brake(1.01) !== SIM_OK && sim.e.sim_set_brake(-0.01) !== SIM_OK && sim.e.sim_set_brake(NaN) !== SIM_OK);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
export { readPartsState, readDamageEvents, readMotorDamage };
