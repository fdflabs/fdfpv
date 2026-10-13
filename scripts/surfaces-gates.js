/*
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

/*
 * The control surface tiers' gates, docs/SURFACES-STAGE1.md, on the plant
 * in dist/sim.wasm:
 *
 *   T1  sim_wing_set_tiers refuses what it must (null, out of range, a
 *       flying wing, ailerons on an aircraft without), and its read back
 *       is what was seated.
 *   T2  seated at ones and zeros, a scripted flight is bit identical to
 *       one with nothing seated: a stock aircraft is the table.
 *   T3  per aircraft and surface, the tier ladder with the other two
 *       stock, flown in Manual as the hangar seats it (the block, the
 *       tier's throws through the tune, the servos' mass as add-ons): the
 *       peak rate at full stick from level flight rises with every tier.
 *   T5  the deflected surface's drag is the derivation's: a tier's full
 *       aileron with its drag against the same with the drag zeroed, the
 *       difference in deceleration over 0.3 s against q S cd shape / m.
 *   T4  each tier, and every surface at Extreme together, still flies:
 *       Stabilised holds it level hands off for 10 s with no divergence,
 *       and Manual level flight at the cruise throttle settles.
 *
 * The stat bars come from the same flights: agility is the three peak
 * rates, stability the rate a fifth of a stick asks for (how hard a small
 * thumb movement moves it), top speed the level speed at full throttle.
 *   node scripts/surfaces-gates.js [--json]
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { loadSim, SIM_OK, SIM_ERR_BAD_ARG, TUNE_DOUBLES } from '../tests/lib/simmod.js';
import { fly, rollRate, levelSpeed, must, attitude, RC_STEP_MS } from '../tests/lib/wingpilot.js';
import {
  TIERS, SURFACE_KEYS, SURFACES, SIM_TIER_DOUBLES, tierBlock, tierThrowsDeg, tierPoints, pointsInertia,
} from '../configs/surfaces.js';
import { SURFACE_TIERS } from '../configs/surfaces-tiers.js';
import { addonParams } from '../configs/hangar-parts.js';
import { fitSurfDrag } from './surfaces-derive.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const DEG = 180 / Math.PI;
const CRUISE = 0.6;
const WING1000 = 2;
const SLOWSTICK = 5;

let failed = 0;
const rows = [];
function gate(id, name, ok, measured) {
  rows.push([id, name, measured, ok ? 'ok' : 'FAIL']);
  if (!ok) failed += 1;
}

async function freshSim(airframe) {
  const sim = await loadSim(wasmBytes);
  if (sim.init(configText) !== SIM_OK) throw new Error('sim_init failed');
  must(sim.e.sim_set_airframe(airframe), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  return sim;
}

/* What the hangar seats for `tiers` on aircraft `id`: the block, the
 * tier's throws over the table's tune, and the servos as add-ons. */
function seatTiers(sim, id, tiers) {
  const block = tierBlock(id, tiers);
  if (!block) {
    must(sim.clearTiers(), 'sim_wing_tiers_clear');
    must(sim.clearTune(), 'sim_wing_tune_clear');
    must(sim.clearAddons(), 'sim_addons_clear');
    return;
  }
  must(sim.setTiers(block), 'sim_wing_set_tiers');
  must(sim.clearTune(), 'sim_wing_tune_clear');
  const tune = sim.tune();
  const th = tierThrowsDeg(id, tiers);
  tune[3] = th[0] / DEG;
  tune[4] = th[1] / DEG;
  tune[5] = th[2] / DEG;
  must(sim.setTune(tune), 'sim_wing_set_tune');
  const pts = tierPoints(id, tiers);
  if (!pts.length) {
    must(sim.clearAddons(), 'sim_addons_clear');
    return;
  }
  const add = addonParams(id, { prop: 'stock', addons: [] }, null, 0, pts);
  must(sim.setAddons(add), 'sim_set_addons');
  must(sim.setAddonInertia(Float64Array.from(pointsInertia(pts))), 'sim_set_addon_inertia');
}

/* Full stick on one axis from level flight at the cruise throttle: the
 * peak body rate in the first 1.5 s, deg/s, in the stick's sense. */
function peakRate(sim, axis, stick) {
  if (axis === 0) {
    return Math.abs(rollRateAt(sim, stick));
  }
  const r = fly(sim, { duty: CRUISE, speed0: 18, vzTarget: 0, seconds: 8 });
  let peak = 0;
  for (let ms = 0; ms < 1500; ms += RC_STEP_MS) {
    const sticks = axis === 1 ? [0, stick, 0] : [0, 0, stick];
    must(sim.input((r.endMs + ms) / 1000, sticks[0], sticks[1], sticks[2], CRUISE), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    const s = sim.readState().state;
    const w = axis === 1 ? -s[12] : -s[13];
    if (!Number.isFinite(w)) return NaN;
    peak = Math.max(peak, w);
  }
  return peak * DEG;
}

/* Speed kept in a manoeuvre: from level flight at the cruise throttle,
 * full stick on one axis for 2 s (a roll, a pull, a flat turn on the
 * rudder), the speed the aircraft would have back at the height it
 * started, sqrt(v^2 + 2 g dz), over the speed before: its energy, so a
 * dive or a climb is not counted as speed lost or won, only what the
 * deflected surface's drag and the tighter manoeuvre cost. */
function speedKept(sim, axis) {
  const r = fly(sim, { duty: CRUISE, speed0: 18, vzTarget: 0, seconds: 8 });
  const s0 = sim.readState().state;
  const v0 = Math.hypot(s0[4], s0[5], s0[6]);
  const sticks = [0, 0, 0];
  sticks[axis] = 1;
  for (let ms = 0; ms < 2000; ms += RC_STEP_MS) {
    must(sim.input((r.endMs + ms) / 1000, sticks[0], sticks[1], sticks[2], CRUISE), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
  }
  const s = sim.readState().state;
  const v2 = s[4] * s[4] + s[5] * s[5] + s[6] * s[6] + 2 * 9.81 * (s[3] - s0[3]);
  return Math.sqrt(Math.max(0, v2)) / v0;
}

/* wingpilot.rollRate is full stick; a part stick flies the same way. */
function rollRateAt(sim, stick) {
  if (stick === 1) {
    return rollRate(sim, CRUISE).rateDegS;
  }
  const r = fly(sim, { duty: CRUISE, speed0: 20, vzTarget: 0, seconds: 8 });
  let peak = 0;
  for (let ms = 0; ms < 1500; ms += RC_STEP_MS) {
    must(sim.input((r.endMs + ms) / 1000, stick, 0, 0, CRUISE), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    const s = sim.readState().state;
    if (Math.abs(s[11]) > Math.abs(peak)) peak = s[11];
  }
  return peak * DEG;
}

/* Stabilised (mode 1) from level flight: full roll and up stick for a
 * second, then sticks centred: how far the bank swings past level, how
 * long until it stays within 3 deg, and the worst bank over the last 3 of
 * 10 s. A loop that the bigger surfaces push past its margin rings or
 * diverges here. Then Manual level flight at cruise held by the scripted
 * pilot for 25 s: the last 5 s's speed and climb. */
function stillFlies(sim) {
  const r = fly(sim, { duty: CRUISE, speed0: 18, vzTarget: 0, seconds: 8 });
  must(sim.e.sim_wing_set_stab(1), 'sim_wing_set_stab');
  let overshoot = 0;
  let settleMs = 0;
  let lateBank = 0;
  let finite = true;
  let sign = 0;
  for (let ms = 0; ms < 11000; ms += RC_STEP_MS) {
    const held = ms < 1000;
    must(sim.input((r.endMs + ms) / 1000, held ? 1 : 0, held ? 0.5 : 0, 0, CRUISE), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    const s = sim.readState().state;
    if (!s.every(Number.isFinite)) {
      finite = false;
      break;
    }
    const bank = attitude(s).bank * DEG;
    if (ms === 1000 - RC_STEP_MS) {
      sign = Math.sign(bank);
    }
    if (held) {
      continue;
    }
    overshoot = Math.max(overshoot, -sign * bank);
    if (Math.abs(bank) > 3) {
      settleMs = ms - 1000;
    }
    if (ms >= 8000) {
      lateBank = Math.max(lateBank, Math.abs(bank));
    }
  }
  must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
  /* Acro (2) and the AS3X rate damper with heading hold (3) hold the
   * attitude the stick left rather than level it: after half a second of
   * half roll stick, the roll rate must die away, the largest over the
   * last 3 of 10 s, where a loop the bigger surfaces push past its margin
   * keeps ringing. Not Stabilised's full roll and up stick: that snaps
   * the stock Cub into a spin in mode 3 (317 deg/s 8 s on), which a rate
   * damper does not recover and a real one would not either. */
  const lateRate = {};
  for (const mode of [2, 3]) {
    const f = fly(sim, { duty: CRUISE, speed0: 18, vzTarget: 0, seconds: 8 });
    must(sim.e.sim_wing_set_stab(mode), 'sim_wing_set_stab');
    let worst = 0;
    for (let ms = 0; ms < 11000; ms += RC_STEP_MS) {
      must(sim.input((f.endMs + ms) / 1000, ms < 500 ? 0.5 : 0, 0, 0, CRUISE), 'sim_input');
      must(sim.step(RC_STEP_MS), 'sim_step');
      const s = sim.readState().state;
      if (!s.every(Number.isFinite)) {
        finite = false;
        break;
      }
      /* The roll rate: a held bank turns steadily in yaw and pitch, which
       * is the turn, not a ringing loop. */
      if (ms >= 8000) {
        worst = Math.max(worst, Math.abs(s[11]) * DEG);
      }
    }
    must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
    lateRate[mode] = worst;
  }
  const level = fly(sim, { duty: CRUISE, speed0: 18, vzTarget: 0, seconds: 25 });
  return { finite, overshoot, settleMs, lateBank, lateRate, levelV: level.v, levelVz: level.vz };
}
const fliesOk = (r) => r.finite && r.overshoot < 10 && r.settleMs < 4000 && r.lateBank < 3 && r.lateRate[2] < 10 && r.lateRate[3] < 10 && Math.abs(r.levelVz) < 1;
const fliesText = (r) => `stab: past level ${r.overshoot.toFixed(1)} deg, settled ${(r.settleMs / 1000).toFixed(2)} s, last 3 s <= ${r.lateBank.toFixed(1)} deg; acro, as3x roll rate last 3 s <= ${r.lateRate[2].toFixed(1)}, ${r.lateRate[3].toFixed(1)} deg/s; manual level ${r.levelV.toFixed(1)} m/s, vz ${r.levelVz.toFixed(2)}`;

function hashFlight(sim) {
  const h = createHash('sha256');
  fly(sim, {
    duty: CRUISE, speed0: 16, vzTarget: 0, seconds: 6,
    onStep: ({ ms }) => {
      if (ms % 40 === 0) h.update(sim.readStateBytes().bytes);
    },
  });
  /* Then every surface hard over, so the control terms are read. */
  for (let ms = 0; ms < 2000; ms += RC_STEP_MS) {
    must(sim.input((6000 + ms) / 1000, 1, 0.6, -1, CRUISE), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    h.update(sim.readStateBytes().bytes);
  }
  return h.digest('hex').slice(0, 16);
}

/* T1: refusals and read back. */
{
  const sim = await freshSim(SURFACES.extra3d1308.sim);
  const ok = Float64Array.from([1.2, 1.1, 1.05, 0.01, 0.02, 0.003, 1.5, 2.0, 0.9]);
  const seated = sim.setTiers(ok) === SIM_OK;
  const back = sim.tiers();
  const same = back && ok.every((v, i) => back[i] === v);
  const bad = [
    [0.2, 1, 1, 0, 0, 0, 1, 1, 1], [1, 4.5, 1, 0, 0, 0, 1, 1, 1], [1, 1, 1, -0.01, 0, 0, 1, 1, 1], [1, 1, 1, 0, 0, 0.6, 1, 1, 1],
    [1, 1, 1, 0, 0, 0, 0.05, 1, 1], [1, 1, 1, 0, 0, 0, 1, 1, 101],
  ].map((b) => sim.setTiers(Float64Array.from(b)));
  const refusedAll = bad.every((c) => c === SIM_ERR_BAD_ARG);
  must(sim.clearTiers(), 'sim_wing_tiers_clear');
  const cleared = sim.tiers();
  const clearedOk = cleared && [1, 1, 1, 0, 0, 0, 1, 1, 1].every((v, i) => cleared[i] === v);
  const wing = await freshSim(WING1000);
  const elevon = wing.setTiers(Float64Array.from([1, 1, 1, 0, 0, 0, 1, 1, 1])) === SIM_ERR_BAD_ARG;
  const stick = await freshSim(SLOWSTICK);
  const noAil = stick.setTiers(Float64Array.from([1.2, 1, 1, 0, 0, 0, 1, 1, 1])) === SIM_ERR_BAD_ARG
    && stick.setTiers(Float64Array.from([1, 1, 1, 0, 0, 0, 1.5, 1, 1])) === SIM_ERR_BAD_ARG
    && stick.setTiers(Float64Array.from([1, 1.2, 1.1, 0, 0.01, 0.01, 1, 1.3, 1.2])) === SIM_OK;
  gate('T1', 'seats, reads back, clears, refuses', seated && same && refusedAll && clearedOk && elevon && noAil,
    `seat ${seated}, back ${same}, 6 out of range refused ${refusedAll}, clear ${clearedOk}, flying wing refused ${elevon}, rudder mix ailerons refused ${noAil}`);
  if (TUNE_DOUBLES !== 12 || SIM_TIER_DOUBLES !== 9) throw new Error('block sizes moved');
}

/* T2: ones and zeros are the table. */
for (const id of Object.keys(SURFACES)) {
  const a = await freshSim(SURFACES[id].sim);
  const plain = hashFlight(a);
  const b = await freshSim(SURFACES[id].sim);
  must(b.setTiers(Float64Array.from([1, 1, 1, 0, 0, 0, 1, 1, 1])), 'sim_wing_set_tiers');
  const seated = hashFlight(b);
  gate('T2', `${id}: ones and zeros fly the table`, plain === seated, `${plain} vs ${seated}`);
}

/* T5: the drag a tier adds, against plant_wing.c's form: from one state
 * in a full aileron roll, one 1 ms step with the tier's drag and one with
 * it zeroed; the difference in acceleration along the flight path is the
 * drag's, q S cd shape(delta) / m. */
{
  const id = 'cub1400';
  const tiers = { a: 'extreme' };
  const sim = await freshSim(SURFACES[id].sim);
  seatTiers(sim, id, tiers);
  const block = tierBlock(id, tiers);
  const r = fly(sim, { duty: CRUISE, speed0: 18, vzTarget: 0, seconds: 8 });
  for (let ms = 0; ms < 200; ms += RC_STEP_MS) {
    must(sim.input((r.endMs + ms) / 1000, 1, 0, 0, CRUISE), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
  }
  const s0 = sim.readState().state.slice();
  const stepWith = (cd) => {
    const b = Float64Array.from(block);
    b[3] = cd;
    must(sim.setTiers(b), 'sim_wing_set_tiers');
    must(sim.e.sim_set_pose(s0[1], s0[2], s0[3], s0[7], s0[8], s0[9], s0[10]), 'sim_set_pose');
    must(sim.e.sim_set_velocity(s0[4], s0[5], s0[6], s0[11], s0[12], s0[13]), 'sim_set_velocity');
    must(sim.input((r.endMs + 200) / 1000, 1, 0, 0, CRUISE), 'sim_input');
    must(sim.step(1), 'sim_step');
    const s = sim.readState().state;
    return [s[4] - s0[4], s[5] - s0[5], s[6] - s0[6]];
  };
  const on = stepWith(block[3]);
  const off = stepWith(0);
  const V = Math.hypot(s0[4], s0[5], s0[6]);
  const got = -((on[0] - off[0]) * s0[4] + (on[1] - off[1]) * s0[5] + (on[2] - off[2]) * s0[6]) / V / 0.001;
  const d = SURFACE_TIERS[id].a[3].throwDeg / DEG;
  const { A, B } = fitSurfDrag();
  const shape = A * d + B * d * d;
  const expect = 0.5 * 1.225 * V * V * 0.28 * block[3] * shape / sim.addonsState().massKg;
  gate('T5', `${id} aileron Extreme: deflection drag`, Math.abs(got / expect - 1) < 0.01,
    `${got.toFixed(4)} m/s^2 measured, ${expect.toFixed(4)} from q S cd shape / m at ${V.toFixed(2)} m/s`);
}

/* T3, T4 and the stat numbers. */
const stats = {};
for (const id of Object.keys(SURFACES)) {
  const sim = await freshSim(SURFACES[id].sim);
  stats[id] = {};
  for (const [axis, key] of SURFACE_KEYS.entries()) {
    const ladder = [];
    for (const tier of TIERS) {
      const tiers = { a: 'stock', e: 'stock', r: 'stock', [key]: tier };
      seatTiers(sim, id, tiers);
      const full = peakRate(sim, axis, 1);
      const fifth = peakRate(sim, axis, 0.2);
      const flies = stillFlies(sim);
      const top = levelSpeed(sim, 1.0, 18).v;
      const kept = speedKept(sim, axis);
      ladder.push({ tier, full, fifth, top, kept, ...flies });
      seatTiers(sim, id, null);
    }
    stats[id][key] = ladder;
    const ladderText = ladder.map((r) => `${r.tier} ${r.full.toFixed(0)}`).join(', ') + ' deg/s';
    if (SURFACE_TIERS[id].offered[key]) {
      const rising = ladder.every((r, i) => i === 0 || r.full > ladder[i - 1].full);
      gate('T3', `${id} ${key}: full stick rate rises with tier`, rising, ladderText);
    } else {
      /* Not offered: the game must seat stock whatever is stored. */
      const forced = tierBlock(id, { [key]: 'extreme' }) === null;
      gate('T3', `${id} ${key}: not offered, seats stock`, forced, `the game seats stock: ${ladderText}`);
    }
    for (const r of ladder) {
      gate('T4', `${id} ${key} ${r.tier}: still flies`, fliesOk(r), fliesText(r));
    }
  }
  /* Every surface at Extreme together. */
  const all = { a: 'extreme', e: 'extreme', r: 'extreme' };
  seatTiers(sim, id, all);
  const f = stillFlies(sim);
  const top = levelSpeed(sim, 1.0, 18).v;
  const rates = SURFACE_KEYS.map((_, axis) => peakRate(sim, axis, 1));
  stats[id].all = { ...f, top, rates };
  gate('T4', `${id} all Extreme: still flies`, fliesOk(f),
    `${fliesText(f)}; rates ${rates.map((x) => x.toFixed(0)).join('/')} deg/s; top ${top.toFixed(2)} m/s`);
  seatTiers(sim, id, null);
}

/*
 * The hangar's stat bars (src/ui/hangar-surfaces.js) read
 * configs/surfaces-stats.js, these flights' numbers: per aircraft, surface
 * and tier, the full stick rate (deg/s), a fifth of a stick's (deg/s) and
 * the speed kept (share). --write-stats writes it; every run holds it
 * within STATS_SLACK of what the plant flies now. Display numbers, not a
 * physics gate (T3 and T4 are those): the slack lets a small plant change
 * elsewhere pass until the next --write-stats.
 */
const STATS_SLACK = 0.03;
const STATS_FILE = join(root, 'configs/surfaces-stats.js');
const statTable = Object.fromEntries(Object.entries(stats).map(([id, s]) => [id, Object.fromEntries(SURFACE_KEYS.map((k) => [k,
  s[k].map((r) => ({ full: Math.round(r.full), fifth: Math.round(r.fifth * 10) / 10, kept: Math.round(r.kept * 1000) / 1000 }))]))]));
if (process.argv.includes('--write-stats')) {
  const head = (await readFile(join(root, 'configs/surfaces-tiers.js'), 'utf8')).split('\n').slice(0, 16).join('\n');
  await writeFile(STATS_FILE, `${head}\n\n/* WRITTEN BY scripts/surfaces-gates.js --write-stats; do not edit. Per aircraft,\n * surface (a e r) and tier (stock sport 3d extreme): the full stick rate,\n * deg/s; a fifth of a stick's, deg/s; the speed kept in 2 s of full stick. */\nexport const SURFACE_STATS = ${JSON.stringify(statTable, null, 2)};\n`);
  console.log(`wrote ${STATS_FILE}`);
} else {
  const { SURFACE_STATS } = await import('../configs/surfaces-stats.js');
  const off = [];
  for (const [id, s] of Object.entries(statTable)) {
    for (const k of SURFACE_KEYS) {
      s[k].forEach((r, i) => {
        const was = SURFACE_STATS[id] && SURFACE_STATS[id][k] && SURFACE_STATS[id][k][i];
        for (const f of ['full', 'fifth', 'kept']) {
          if (!was || Math.abs(was[f] / r[f] - 1) > STATS_SLACK) {
            off.push(`${id} ${k} ${TIERS[i]} ${f} ${was ? was[f] : 'none'} vs ${r[f]}`);
          }
        }
      });
    }
  }
  gate('T6', 'configs/surfaces-stats.js is what the plant flies', off.length === 0,
    off.length ? `${off.slice(0, 4).join('; ')}; run --write-stats` : `within ${STATS_SLACK * 100} percent`);
}

for (const [id, name, measured, status] of rows) {
  console.log(`${status.padEnd(4)} ${id.padEnd(3)} ${name}: ${measured}`);
}
for (const [id, s] of Object.entries(stats)) {
  console.log(`\n${id} stat numbers (full stick deg/s, a fifth of a stick deg/s, top speed m/s, speed kept):`);
  for (const key of SURFACE_KEYS) {
    console.log(`  ${key}: ${s[key].map((r) => `${r.tier} ${r.full.toFixed(0)} / ${r.fifth.toFixed(0)} / ${r.top.toFixed(2)} / ${r.kept.toFixed(3)}`).join(' | ')}`);
  }
}
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ stats, k: SURFACE_TIERS }, null, 1));
}
console.log(`\nsurfaces:gates: ${rows.length - failed}/${rows.length} pass`);
process.exit(failed ? 1 : 0);
