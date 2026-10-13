/*
 * knife-budget.js: the plant's yaw moment term by term in the held knife
 * edge each gate flies (extra-gates.js E12, cap580-gates.js C12,
 * slick-gates.js S12), against the knife edge derivation's terms
 * (scripts/lib/knifefin.js, wash.js) on the plant's own table at the same
 * state: the speed, sideslip, thrust and rudder the plant settled at. The
 * derivation asks the Slick 105 percent of its rudder where the plant
 * holds a level knife edge on 100: this names the term.
 *
 * Checks: the exported terms sum to the plant's M[2] (the budget is
 * whole), and prints each term's plant and derivation values, N m in the
 * body's yaw (nose right positive), their difference, and the rudder the
 * derivation needs at the plant's state against the plant's.
 *
 *   node scripts/knife-budget.js            every knife edge
 *   node scripts/knife-budget.js extra      one of extra, cap, slick
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
import {
  must, fly, wingDebug, fullBank, stickForThrow, knifeThrottle, RC_STEP_MS, EXTRA_AIRFRAME, CAP_AIRFRAME, SLICK_AIRFRAME,
} from '../tests/lib/wingpilot.js';
import { knifeFin, knifeRudder } from './lib/knifefin.js';
import { planeTable, wash, finSwirl } from './lib/wash.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const json = async (f) => JSON.parse(await readFile(join(root, f), 'utf8'));
const RHO = 1.225;
const DEG = 180 / Math.PI;
const clamp = (v) => Math.max(-1, Math.min(1, v));
const speed = (s) => Math.hypot(s[4], s[5], s[6]);
const yawOf = (s) => Math.atan2(2 * (s[7] * s[10] + s[8] * s[9]), 1 - 2 * (s[9] * s[9] + s[10] * s[10]));
const AIR = [0, 600, 60, 1, 0, 0, 0];

const PLANES = {
  extra: { airframe: EXTRA_AIRFRAME, table: 'FW_EXTRA3D1308', knife: (await json('tests/extra-thresholds.json')).e12_knife_edge },
  cap: { airframe: CAP_AIRFRAME, table: 'FW_CAP1702', knife: (await json('tests/cap580-thresholds.json')).c12_knife_edge },
  slick: { airframe: SLICK_AIRFRAME, table: 'FW_SLICK2680', knife: (await json('tests/slick-thresholds.json')).s12_knife_edge },
};
const SLOTS = ['fin, free stream', 'rudder, free stream', 'rest of cn_beta', 'Munk', 'yaw damping cn_r', 'cn_p', 'adverse aileron',
  'roll terms by sin beta', 'flow from behind', 'thrust line', 'fin, wash', 'rudder, wash', 'wash damping', 'jet normal force',
  'crossflow at side_x', 'P factor', 'rot_k', 'gyroscope'];

let fail = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}  (${detail})`);
  if (!ok) fail += 1;
}

/* The gate's knife edge, flown to its last step: the plant's budget and
 * state there. */
async function flown(p) {
  const sim = await loadSim(wasmBytes);
  if (sim.init(configText) !== SIM_OK) throw new Error('sim_init failed');
  must(sim.e.sim_set_airframe(p.airframe), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  const V0 = p.knife.speed;
  let clock = fly(sim, { duty: 0.6, vTarget: V0, seconds: 10, speed0: V0, guard: false, start: AIR }).endMs;
  let s = sim.readState().state;
  const psi0 = yawOf(s);
  const thr = knifeThrottle(p.airframe, p.knife.dutyDerived);
  const rudder = -stickForThrow(p.knife.rudderDerived);
  const dt = RC_STEP_MS / 1000;
  let iA = 0, t = 0;
  for (let ms = 0; ms < 15000; ms += RC_STEP_MS) {
    const bank = fullBank(s);
    const bankT = Math.min(Math.PI / 2, ms / 1000 * 3);
    iA = Math.max(-0.5, Math.min(0.5, iA - 1.0 * (bank - bankT) * dt));
    const roll = clamp(-0.8 * (bank - bankT) - 0.05 * s[11] + iA);
    const yaw = ms < 300 ? 0 : rudder * Math.min(1, (ms - 300) / 500);
    let dpsi = yawOf(s) - psi0;
    while (dpsi > Math.PI) dpsi -= 2 * Math.PI;
    while (dpsi < -Math.PI) dpsi += 2 * Math.PI;
    const pitch = clamp(0.8 * dpsi + 0.15 * s[12]);
    t = thr.step(s[6], dt);
    must(sim.input(clock / 1000, roll, pitch, yaw, t), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    clock += RC_STEP_MS;
    s = sim.readState().state;
  }
  const ptr = sim.e.malloc(26 * 8);
  must(sim.e.sim_wing_yaw_budget(ptr), 'sim_wing_yaw_budget');
  const budget = Array.from(new Float64Array(sim.e.memory.buffer, ptr, 26));
  const d = wingDebug(sim);
  return { budget, beta: d[1], thrust: d[8], u: d[15], v: d[16], w: d[17], V: speed(s), vz: s[6], throttle: t, yawStick: rudder };
}

/* The derivation's terms on the plant's table at the flown state, each
 * in the body's yaw as the plant adds it (the aero n negated). */
function derived(p, f) {
  const { fw, keep } = planeTable(p.table);
  const V = f.V, sb = -f.v / V, cb = Math.sqrt(Math.max(0, 1 - sb * sb)), u = f.u;
  const qb = 0.5 * RHO * V * V, S = fw.area, b = fw.span;
  const fin = { av: fw.tail_av, cn: fw.tail_cn, cnb: fw.slip_cn_b, cyb: fw.slip_cy_b, cndr: fw.cn_dr, cydr: fw.cy_dr };
  const w = wash(fw, f.thrust, u);
  const jet = fw.jet_kj > 0 ? { kj: fw.jet_kj, R: fw.slip_r, x: fw.prop_x, T: f.thrust } : null;
  /* The swirl at the fin on the plant's own torque and root share
   * (exported with the budget), so the comparison is of the formulas;
   * the derive scripts take the torque as torque_arm times the thrust,
   * printed beside it. */
  const swirl = fw.slip_r > 0 ? finSwirl(fw, w, f.budget[24], f.budget[25], u) : { xs: 0 };
  const fp = { rho: RHO, V, u, sb, w, S, b, jet, xs: swirl.xs };
  const dr = f.budget[23];
  const parts = knifeFin(fin, fp, dr);
  /* knifeFin's lines, taken apart as it sums them. */
  const vv = fin.cnb / fin.av, ar = fin.cndr * dr / vv;
  let k = 0, turned = 0;
  if (jet) {
    const A = Math.PI * jet.R * jet.R, w0 = Math.sqrt(jet.T / (2 * RHO * A));
    k = jet.kj * RHO * A * w0 * w.vi / (u + w.vi);
    turned = jet.kj * w0 * w.vi / ((u + w.vi) * (u + w.vi));
  }
  const vw = V * sb * (1 - turned) - swirl.xs * (u + 2 * w.vi) / (2 * w.vi);
  const n = {};
  n[0] = -(qb * S * b * fin.cnb * sb * parts.rv);
  n[1] = -(qb * S * b * fin.cndr * dr * parts.rv);
  n[2] = -(qb * S * b * (fw.cn_beta - fw.slip_cn_b - fw.cn_beta_fus) * sb);
  n[3] = -(qb * S * b * fw.cn_beta_fus * sb * cb);
  n[9] = fw.thrust_yaw !== 0 ? -(fw.prop_x * f.thrust * Math.sin(fw.thrust_yaw)) : 0;
  n[10] = -(S * b * RHO * w.vi * w.fv * fin.cnb * vw * parts.rw);
  n[11] = -(S * b * w.dp * w.keepV * w.fv * fin.cndr * dr * parts.rw);
  n[13] = -(-(jet ? jet.x : 0) * k * V * sb);
  n[14] = -(-fw.side_x * 0.5 * RHO * fw.side_cda * (V * sb) ** 2);
  /* The rudder the derivation needs at this state: rest as the derive
   * scripts build it, less the fin's. */
  const rest = -(n[2] + n[3] + n[14] + n[9]);
  const need = knifeRudder(fin, fp, rest, fw.throw_r);
  return { n, rv: parts.rv, rw: parts.rw, ar, swirlXs: swirl.xs, qArm: fw.torque_arm * f.thrust, keepTable: keep, need, throwR: fw.throw_r };
}

const names = process.argv[2] ? [process.argv[2]] : Object.keys(PLANES);
for (const name of names) {
  const p = PLANES[name];
  if (!p) throw new Error(`no plane ${name}`);
  const f = await flown(p);
  const d = derived(p, f);
  const B = f.budget;
  console.log(`\n${name}: held at ${f.V.toFixed(1)} m/s, sideslip ${(f.beta * DEG).toFixed(1)} deg, thrust ${f.thrust.toFixed(2)} N, throttle ${f.throttle.toFixed(3)}, yaw stick ${f.yawStick.toFixed(2)}, rudder ${(B[23] * DEG).toFixed(1)} deg (${(Math.abs(B[23]) / d.throwR * 100).toFixed(0)} percent of throw), sink ${(-f.vz).toFixed(3)} m/s`);
  console.log(`  plant fin plate ratio ${B[20].toFixed(3)} free, ${B[21].toFixed(3)} wash, its crossflow in the wash ${B[22].toFixed(2)} m/s; derivation ${d.rv.toFixed(3)}, ${d.rw.toFixed(3)}; swirl at the fin ${d.swirlXs.toFixed(3)} m/s on the plant's torque ${B[24].toFixed(3)} N m (torque_arm times thrust ${d.qArm.toFixed(3)}) and root share ${B[25].toFixed(3)} (SWIRL_KEEP ${d.keepTable})`);
  console.log(`  ${'term'.padEnd(26)} ${'plant'.padStart(9)} ${'derived'.padStart(9)} ${'gap'.padStart(9)}  N m, body yaw`);
  let gap = 0;
  for (let i = 0; i < 18; i += 1) {
    const dv = d.n[i];
    const g = dv === undefined ? 0 : B[i] - dv;
    gap += dv === undefined ? B[i] : g;
    console.log(`  ${SLOTS[i].padEnd(26)} ${B[i].toFixed(3).padStart(9)} ${(dv === undefined ? '-' : dv.toFixed(3)).padStart(9)} ${(dv === undefined ? B[i] : g).toFixed(3).padStart(9)}`);
  }
  const rudPerThrow = (B[1] + B[11]) / (Math.abs(B[23]) / d.throwR);
  console.log(`  ${'sum'.padEnd(26)} ${B[18].toFixed(3).padStart(9)} ${''.padStart(9)} ${gap.toFixed(3).padStart(9)}  the gap is ${(gap / rudPerThrow * 100).toFixed(1)} percent of the rudder's throw at the plant's rudder moment`);
  console.log(`  the derivation at this state needs ${d.need === null ? 'more than three throws' : `${(Math.abs(d.need) / d.throwR * 100).toFixed(0)} percent`} of the rudder; the plant holds on ${(Math.abs(B[23]) / d.throwR * 100).toFixed(0)}`);
  check(`${name}: the exported terms sum to the plant's yaw moment`, Math.abs(B[18] - B[19]) < 1e-6 * Math.max(1, Math.abs(B[19])), `${B[18].toFixed(6)} against ${B[19].toFixed(6)} N m`);
  check(`${name}: the held knife edge is level`, Math.abs(f.vz) < 0.05, `sink ${(-f.vz).toFixed(3)} m/s`);
}
console.log(fail ? `\nknife-budget: ${fail} failed` : '\nknife-budget: the budgets are whole');
process.exit(fail ? 1 : 0);
