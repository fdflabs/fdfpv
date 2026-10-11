/*
 * wing-ge-selftest.js: the fixed wings' ground effect (plant_wing.c GROUND
 * EFFECT) against what it promises.
 *
 * 1. Above its height, nothing: each table that takes the term flies the
 *    same 400 ms with the ground raised under it, its wing a span and a
 *    metre up and over 0.758 of its span all the way, and with no ground, and both traces hash to
 *    the one the plant flew before the term existed (PINS, recorded on
 *    w34-3d-batchlat 734368a90; --pin prints them from a given build).
 *    The Cub, which does not take the term, is flown too.
 * 2. Near the ground, the term the derivations predict: one 1 ms step
 *    from the same state, 3 deg nose up and flying level, where the lift
 *    curve is still straight, with the ground
 *    raised under the wing at a quarter of the span and with none; the change in the vertical speed is the
 *    lift scripts/lib/groundeffect.js gives, within 3 percent, and the
 *    change in the pitch rate its pitching moment, within 5.
 *
 * Usage: node scripts/wing-ge-selftest.js [--pin path/to/sim.wasm]
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

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { GROUND_MU, GROUND_E } from '../src/game/collide.js';
import { GE_HB_MAX, groundTerms } from './lib/groundeffect.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pinAt = process.argv.indexOf('--pin');
const wasmPath = pinAt > 0 ? process.argv[pinAt + 1] : join(root, 'dist/sim.wasm');
const wasmBytes = new Uint8Array(await readFile(wasmPath));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const wingC = readFileSync(join(root, 'src/native/plant_wing.c'), 'utf8');
const plantC = readFileSync(join(root, 'src/native/plant.c'), 'utf8');

/* The traces of part 1 on the build before the term. */
const PINS = {
  cub: '0d2dffec2104ba57',
  extra: '610a80702152ad27',
  nighttimber: 'a83c82dbd1cd527b',
  cap580: 'c33a8be21377a635',
  slick: 'eec760a4367467e5',
};
const PLANES = [
  { name: 'cub', id: 4, table: 'FW_CUB1400', frame: 'SIM_AIRFRAME_CUB1400', speed: 12 },
  { name: 'extra', id: 29, table: 'FW_EXTRA3D1308', frame: 'SIM_AIRFRAME_EXTRA3D1308', speed: 14, hb: 0.25 },
  { name: 'nighttimber', id: 30, table: 'FW_NIGHTTIMBER1200', frame: 'SIM_AIRFRAME_NIGHTTIMBER1200', speed: 12, hb: 0.35 },
  { name: 'cap580', id: 32, table: 'FW_CAP1702', frame: 'SIM_AIRFRAME_CAP1702', speed: 15, hb: 0.25 },
  { name: 'slick', id: 33, table: 'FW_SLICK2680', frame: 'SIM_AIRFRAME_SLICK2680', speed: 16, hb: 0.25 },
];

/* A table's field: a number or a sum of products of numbers and WING_PI. */
function field(body, name) {
  const m = new RegExp(`\\n\\s*\\.${name} = ([^,\\n]*),`).exec(body);
  if (!m) return 0;
  const ex = m[1].replace(/\/\*.*$/, '').trim();
  if (!/^[-+*/.\d\s()WING_PI]+$/.test(ex)) throw new Error(`${name}: ${ex}`);
  return Function('WING_PI', `return (${ex});`)(Math.PI);
}
const vec = (body, name) => {
  const m = new RegExp(`\\.${name} = \\{([^}]*)\\}`).exec(body);
  return m ? m[1].split(',').map(Number) : [0, 0, 0];
};
function tableOf(plane) {
  const body = new RegExp(`const FixedWingParams ${plane.table} = \\{([\\s\\S]*?)\\n\\};`).exec(wingC)[1];
  const pbody = new RegExp(`\\[${plane.frame}\\] = \\{([\\s\\S]*?)\\n\\},`).exec(plantC)[1];
  return {
    on: /\.ground_effect = 1/.test(body),
    b: field(body, 'span'), S: field(body, 'area'), c: field(body, 'chord'),
    cla: field(body, 'cl_alpha'), cma: field(body, 'cm_alpha'), slipCma: field(body, 'slip_cm_a'), hi: /\.hi_alpha = 1/.test(body), aw: field(body, 'cl_alpha_wing') || field(body, 'cl_alpha'),
    dd: field(body, 'tail_deda'), clmax: field(body, 'cl_max'), azl: field(body, 'alpha_zl'),
    wing: vec(body, 'ge_wing'), tail: vec(body, 'ge_tail'),
    m: Number(/\.mass_kg = ([\d.]+)/.exec(pbody)[1]), iyy: Number(/\.inertia = \{ [\d.]+, ([\d.]+)/.exec(pbody)[1]), rho: Number(/\.rho = ([\d.]+)/.exec(pbody)[1]),
  };
}

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) passed += 1; else failed += 1;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
const must = (c, w) => { if (c !== SIM_OK) throw new Error(`${w}: ${c}`); };

async function flight(plane, ground) {
  const sim = await loadSim(wasmBytes);
  must(sim.init(configText), 'init');
  must(sim.e.sim_set_airframe(plane.id), 'airframe');
  must(sim.setCellVoltage(4.1), 'volts');
  if (ground) must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, GROUND_MU, GROUND_E), 'ground');
  return sim;
}
/* The wing's quarter chord's height: the CG's plus its offset turned by
 * the attitude onto world z. */
function wingH(s, w) {
  const qw = s[7], x = s[8], y = s[9], z = s[10];
  return s[3] + 2 * (x * z - qw * y) * w[0] + 2 * (y * z + qw * x) * w[1] + (1 - 2 * (x * x + y * y)) * w[2];
}

const pins = {};
for (const plane of PLANES) {
  const t = tableOf(plane);
  console.log(`${plane.name}${t.on ? '' : ', which does not take the term'}`);
  /* 1. Above its height. */
  const hashes = [];
  let low = Infinity;
  for (const ground of [true, false]) {
    const sim = await flight(plane, ground);
    must(sim.e.sim_set_pose(0, 0, t.b + 1 - t.wing[2], 1, 0, 0, 0), 'pose');
    must(sim.e.sim_wing_launch(plane.speed), 'launch');
    const h = createHash('sha256');
    for (let i = 0; i < 400; i += 1) {
      must(sim.input((i + 1) / 1000, 0, 0, 0, 0.5), 'input');
      must(sim.step(1), 'step');
      h.update(sim.readStateBytes().bytes);
      low = Math.min(low, wingH(sim.readState().state, t.wing) / t.b);
    }
    hashes.push(h.digest('hex').slice(0, 16));
  }
  pins[plane.name] = hashes[1];
  if (pinAt > 0) continue;
  check(`over ${GE_HB_MAX.toFixed(3)} of the span (lowest ${low.toFixed(3)}) the ground changes nothing`, low > GE_HB_MAX && hashes[0] === hashes[1], `${hashes[0]} ${hashes[1]}`);
  check('and the trace is the one flown before the term', hashes[1] === PINS[plane.name], `${hashes[1]} pinned ${PINS[plane.name]}`);
  if (!t.on) continue;
  /* 2. Near the ground: one step, the ground at plane.hb of the span
   * under the wing against none, the wheels clear of it. */
  const dvz = [], dq = [];
  let alphaBody = 0, contacts = 0;
  const th = -1.5 * Math.PI / 180;
  for (const ground of [true, false]) {
    const sim = await flight(plane, ground);
    const hw = plane.hb * t.b - (-Math.sin(2 * th) * t.wing[0] + Math.cos(2 * th) * t.wing[2]);
    must(sim.e.sim_set_pose(0, 0, hw, Math.cos(th), 0, Math.sin(th), 0), 'pose');
    must(sim.e.sim_wing_launch(plane.speed), 'launch');
    must(sim.e.sim_set_velocity(plane.speed, 0, 0, 0, 0, 0), 'velocity');
    const s0 = sim.readState().state;
    alphaBody = Math.asin(2 * (s0[7] * s0[9] - s0[8] * s0[10])) * -1;
    const v0 = s0[6], q0 = s0[12];
    must(sim.input(0.001, 0, 0, 0, 0), 'input');
    must(sim.step(1), 'step');
    contacts += sim.e.sim_ground_contacts();
    const p = sim.e.malloc(4 * 8);
    must(sim.e.sim_wheel_loads(p), 'wheel loads');
    contacts += Array.from(new Float64Array(sim.e.memory.buffer, p, 4)).filter((f) => f !== 0).length;
    sim.e.free(p);
    const s1 = sim.readState().state;
    dvz.push(s1[6] - v0);
    dq.push(s1[12] - q0);
  }
  const g = groundTerms({ b: t.b, S: t.S, aw: t.aw, dd: t.dd, clmax: t.clmax, wing: [t.wing[0], t.wing[2]], tail: t.tail[0] < 0 ? [t.tail[0], t.tail[2]] : null },
    plane.hb * t.b, alphaBody, alphaBody - t.azl);
  const tailCl = (t.cla - t.aw) / (1 - t.dd);
  const dCl = t.cla * g.dAlpha + tailCl * g.dTail;
  const predicted = 0.5 * t.rho * plane.speed * plane.speed * t.S * dCl / t.m * 0.001;
  const flown = dvz[0] - dvz[1];
  /* The tail's moment per rad of its own angle: its lift share at its arm,
   * or a hi_alpha table's slip_cm_a over (1 - d eps / d alpha). */
  const tailCm = t.hi ? t.slipCma / (1 - t.dd) : tailCl * t.tail[0] / t.c;
  const dCm = t.cma * g.dAlpha + tailCm * g.dTail;
  const qPred = -0.5 * t.rho * plane.speed * plane.speed * t.S * t.c * dCm / t.iyy * 0.001;
  const qFlown = dq[0] - dq[1];
  check(`at ${plane.hb} of the span the lift rises as groundeffect.js has it`, contacts === 0 && Math.abs(flown / predicted - 1) < 0.03,
    `contacts ${contacts}, alpha ${(alphaBody * 180 / Math.PI).toFixed(2)} deg, sigma ${g.sigma.toFixed(3)}, R ${g.R.toFixed(3)}, dCL ${dCl.toFixed(4)} (wing ${(t.cla * g.dAlpha).toFixed(4)}, tail ${(tailCl * g.dTail).toFixed(4)}), dvz ${flown.toExponential(3)} against ${predicted.toExponential(3)}`);
  check('and its pitching moment as groundeffect.js has it', Math.abs(qFlown / qPred - 1) < 0.05,
    `dCm ${dCm.toFixed(4)} (wing ${(t.cma * g.dAlpha).toFixed(4)}, tail ${(tailCm * g.dTail).toFixed(4)}), dq ${qFlown.toExponential(3)} against ${qPred.toExponential(3)}`);
}
if (pinAt > 0) {
  console.log(JSON.stringify(pins, null, 2));
} else {
  console.log(`${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}
