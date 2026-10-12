/*
 * wing-ge-selftest.js: the fixed wings' ground effect (plant_wing.c GROUND
 * EFFECT) against what it promises.
 *
 * 1. Above its height, nothing: every fixed wing flies the same 400 ms,
 *    level at a CL of 0.5, its wing a span and a metre up and over 0.758
 *    of its span all the way, with the ground raised under it and with no
 *    ground, and both traces hash to the one the plant flew before the
 *    term existed (PINS, recorded on w34-3d-batchlat 734368a90; --pin
 *    prints them from a given build). The tables that do not take the
 *    term are flown too.
 * 2. Near the ground, the term the derivations predict: one 1 ms step
 *    from the same state, 3 deg nose up and flying level, where the lift
 *    curve is still straight, with the ground raised under the wing at a
 *    quarter of the span (or the next of 0.35, 0.45, 0.55 that clears the
 *    wheels) and with none; the change in the vertical speed is the lift
 *    scripts/lib/groundeffect.js gives, within 3 percent, and the change
 *    in the pitch rate its pitching moment, within 5.
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

/* Every fixed wing: [name, airframe id, the suffix of its FW_ table and
 * its SIM_AIRFRAME_ entry]. */
const PLANES = [
  ['wing', 2, 'WING1000'], ['sky', 3, 'SKY1800'], ['cub', 4, 'CUB1400'], ['slowstick', 5, 'SLOWSTICK1180'],
  ['radian', 6, 'RADIAN2000'], ['timber', 7, 'TIMBER1500'], ['bramor', 8, 'BRAMOR2300'], ['timberf', 9, 'TIMBER1500F'],
  ['cubf', 10, 'CUB1400F'], ['bombshell', 11, 'BOMBSHELL1118'], ['kadet', 12, 'KADET1981'], ['p51', 15, 'P51D1450'],
  ['f16', 16, 'F16878'], ['zagi', 17, 'ZAGI1219'], ['uglystik', 19, 'UGLYSTIK1567'], ['nrj', 21, 'NRJ1490'],
  ['tigermoth', 23, 'TIGERMOTH1803'], ['strikerprop', 27, 'STRIKER_PROP'], ['strikerjet', 28, 'STRIKER_JET'],
  ['extra', 29, 'EXTRA3D1308'], ['nighttimber', 30, 'NIGHTTIMBER1200'], ['hercules', 31, 'HERCULES3077'],
  ['cap580', 32, 'CAP1702'], ['slick', 33, 'SLICK2680'],
].map(([name, id, suffix]) => ({ name, id, table: `FW_${suffix}`, frame: `SIM_AIRFRAME_${suffix}` }));
/* The traces of part 1 on the build before the term. */
const PINS = {
  wing: 'd113bc284e487a8e',
  sky: '8a6fa77e69a7567a',
  cub: '447631b3c704ba8a',
  slowstick: 'a896c98ada88637b',
  radian: '31d875fb7a13d850',
  timber: '7aa3cc225b9a63fd',
  bramor: 'b36022a49633899c',
  timberf: '83212b730ba98465',
  cubf: 'a15c0bd20d1447ac',
  bombshell: 'ff71b23a2e794b1f',
  kadet: 'b714f21b5921bf43',
  p51: '0f69bafe8dd0fe26',
  f16: 'e31ccb8e492d3f50',
  zagi: '87d02284937a6fe9',
  uglystik: 'cdcfaeaef321c312',
  nrj: '31151485dea980a5',
  tigermoth: '4ab14916f3d11e9d',
  strikerprop: 'ac1ebe1d9baba2ed',
  strikerjet: '2c30dccda291887d',
  extra: 'b293b09e73f99993',
  nighttimber: '199b12e1bb145922',
  hercules: 'ebba6d702410187f',
  cap580: '2e4df1c22374a4e2',
  slick: '1eec01c5f11adf28',
};

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
  const t = {
    on: /\.ground_effect = 1/.test(body),
    b: field(body, 'span'), S: field(body, 'area'), c: field(body, 'chord'),
    cla: field(body, 'cl_alpha'), cma: field(body, 'cm_alpha'), slipCma: field(body, 'slip_cm_a'), hi: /\.hi_alpha = 1/.test(body), aw: field(body, 'cl_alpha_wing') || field(body, 'cl_alpha'),
    dd: field(body, 'tail_deda'), clmax: field(body, 'cl_max'), azl: field(body, 'alpha_zl'),
    wing: vec(body, 'ge_wing'), tail: vec(body, 'ge_tail'),
    m: Number(/\.mass_kg = ([\d.]+)/.exec(pbody)[1]), iyy: Number(/\.inertia = \{ [\d.]+, ([\d.]+)/.exec(pbody)[1]), rho: Number(/\.rho = ([\d.]+)/.exec(pbody)[1]),
  };
  /* Level at a CL of 0.5. */
  t.v = Math.sqrt(2 * t.m * 9.80665 / (t.rho * t.S * 0.5));
  return t;
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
    must(sim.e.sim_wing_launch(t.v), 'launch');
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
  /* 2. Near the ground: one step, the ground at hb of the span under the
   * wing against none, the lowest of a quarter, 0.35, 0.45 and 0.55 that
   * keeps the wheels, the floats and the hull clear of it. */
  const th = -1.5 * Math.PI / 180;
  const once = async (hb) => {
    const out = { dvz: [], dq: [], alphaBody: 0, contacts: 0 };
    for (const ground of [true, false]) {
      const sim = await flight(plane, ground);
      const hw = hb * t.b - (-Math.sin(2 * th) * t.wing[0] + Math.cos(2 * th) * t.wing[2]);
      must(sim.e.sim_set_pose(0, 0, hw, Math.cos(th), 0, Math.sin(th), 0), 'pose');
      must(sim.e.sim_wing_launch(t.v), 'launch');
      must(sim.e.sim_set_velocity(t.v, 0, 0, 0, 0, 0), 'velocity');
      const s0 = sim.readState().state;
      out.alphaBody = -Math.asin(2 * (s0[7] * s0[9] - s0[8] * s0[10]));
      must(sim.input(0.001, 0, 0, 0, 0), 'input');
      must(sim.step(1), 'step');
      out.contacts += sim.e.sim_ground_contacts();
      const p = sim.e.malloc(4 * 8);
      must(sim.e.sim_wheel_loads(p), 'wheel loads');
      out.contacts += Array.from(new Float64Array(sim.e.memory.buffer, p, 4)).filter((f) => f !== 0).length;
      sim.e.free(p);
      const fl = sim.e.malloc(10 * 8);
      must(sim.e.sim_float_state(fl), 'floats');
      const fs = new Float64Array(sim.e.memory.buffer, fl, 10);
      out.contacts += fs[0] !== 0 || fs[1] !== 0 || fs[6] !== 0 ? 1 : 0;
      sim.e.free(fl);
      const s1 = sim.readState().state;
      out.dvz.push(s1[6] - s0[6]);
      out.dq.push(s1[12] - s0[12]);
    }
    return out;
  };
  let hb = 0, run = null;
  for (const h of [0.25, 0.35, 0.45, 0.55]) {
    hb = h;
    run = await once(h);
    if (run.contacts === 0) break;
  }
  const { dvz, dq, alphaBody, contacts } = run;
  const g = groundTerms({ b: t.b, S: t.S, aw: t.aw, dd: t.dd, clmax: t.clmax, wing: [t.wing[0], t.wing[2]], tail: t.tail[0] < 0 ? [t.tail[0], t.tail[2]] : null },
    hb * t.b, alphaBody, alphaBody - t.azl);
  const tailCl = (t.cla - t.aw) / (1 - t.dd);
  const dCl = t.cla * g.dAlpha + tailCl * g.dTail;
  const predicted = 0.5 * t.rho * t.v * t.v * t.S * dCl / t.m * 0.001;
  const flown = dvz[0] - dvz[1];
  /* The tail's moment per rad of its own angle: its lift share at its arm,
   * or a hi_alpha table's slip_cm_a over (1 - d eps / d alpha). */
  const tailCm = t.hi ? t.slipCma / (1 - t.dd) : tailCl * t.tail[0] / t.c;
  const dCm = t.cma * g.dAlpha + tailCm * g.dTail;
  const qPred = -0.5 * t.rho * t.v * t.v * t.S * t.c * dCm / t.iyy * 0.001;
  const qFlown = dq[0] - dq[1];
  check(`at ${hb} of the span the lift rises as groundeffect.js has it`, contacts === 0 && Math.abs(flown / predicted - 1) < 0.03,
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
