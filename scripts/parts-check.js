/*
 * parts-check.js: the hangar's Parts tab against the plant, in Node.
 * configs/hangar-parts.js is the data; this flies it.
 *
 *   A1  sim_set_addons refuses what sim_abi.h says it refuses, and a block
 *       that adds nothing flies bit identical to none
 *   A2  nothing fitted is no block: every plane's default is the plant's
 *       own table, and the stock prop leaves the power block as it was
 *   A3  every combination the config allows moves the CG under 2 cm: the
 *       plant moves every point it samples with the CG, and only the
 *       crash part table's boxes, which name the part a contact struck,
 *       stay where the table has them (sim_abi.h, sim_set_addons)
 *   A6  the camera pod, every plane: heavier, the CG lower, a slower top
 *       speed
 *   A7  the lights, every plane: heavier, the CG on the centreline, the
 *       top speed within a tenth of a metre a second
 *   A8  the smoke system, every plane: heavier, the CG aft, a slower top
 *       speed
 *   A9  tape on a wing: heavier on that side, the CG toward it, a slower
 *       top speed, and a plane that needs roll trim toward the other wing
 *   A10 a crash reset keeps the power option, the tuning and the add-ons,
 *       seated in the shell's order: after a part breaks off and the
 *       reset, the flight is the one a fresh seat flies
 *
 * The shell offers no tyres and no prop other than the stock one since the
 * recreational planes left (2026-10-21). A1 seats raw blocks on the
 * Bramor; the tyre and rolling slots, which only the Cub's tundra tyres
 * used, left with the wheels (2026-10-20: no aircraft in the module has
 * any), and sim_set_addons still range checks them.
 *
 *   node scripts/parts-check.js           the checks
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
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK, SIM_ERR_BAD_ARG } from '../tests/lib/simmod.js';
import { attitude, must, RC_STEP_MS } from '../tests/lib/wingpilot.js';
import { POWER, SIM_POWER, TABLE, powerBlock } from '../configs/power.js';
import {
  PROPS, PARTS_PLANES, SIM_ADDON, SIM_ADDON_DOUBLES, addonParams, addonsFor, normaliseParts,
  partsPowerBlock, tapeable,
} from '../configs/hangar-parts.js';
import { normalizeEntry, setupFor, tuneBlock } from '../configs/tuning.js';
import { PART_KINDS } from '../configs/parts.js';
import { readPartTable } from './lib/crash.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
const f2 = (x) => x.toFixed(2);
const f1 = (x) => x.toFixed(1);

const sim = await loadSim(new Uint8Array(await readFile(join(root, 'dist/sim.wasm'))));
must(sim.init(await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8')), 'init');

const stockOption = (id) => POWER[id][0];
const stockBlock = (id) => powerBlock(id, stockOption(id).id, stockOption(id).pack);
const baseMass = (id) => stockBlock(id)[SIM_POWER.MASS];
const entry = (over = {}) => ({ prop: 'stock', addons: [], damage: null, ...over });

/* A1's raw blocks on the Bramor: an add-on block of 50 g and 5 cm^2 of
 * drag 5 cm under the CG, and the stock power block with its static thrust
 * at nine tenths. Inputs to the ABI's read back, not physics. */
const RAW_ID = 'bramor2300';
const RAW_ADDON = Float64Array.from([0.05, 0, 0, -0.05, 0.0005, 0, 0, -0.05, 0, 1]);
function rawPowerBlock() {
  const b = Float64Array.from(stockBlock(RAW_ID));
  b[SIM_POWER.THRUST] *= 0.9;
  return b;
}
/* Seat raw blocks on a full pack: a power block or the table's, an add-on
 * block or none. */
function seatRaw(id, power, addons) {
  must(sim.e.sim_set_airframe(TABLE[id].simId), 'sim_set_airframe');
  must(sim.setCellVoltage(4.2), 'sim_set_cell_voltage');
  must(sim.clearAddons(), 'sim_addons_clear');
  if (power) {
    must(sim.setPower(power), 'sim_set_power');
  } else {
    must(sim.clearPower(), 'sim_power_clear');
  }
  if (addons) {
    must(sim.setAddons(addons), 'sim_set_addons');
  }
}

/* Seat a plane on a full pack: the stock option with a prop, and an
 * entry's add-ons, or nothing for the table's own. */
function seat(id, e = null) {
  must(sim.e.sim_set_airframe(TABLE[id].simId), 'sim_set_airframe');
  must(sim.setCellVoltage(4.2), 'sim_set_cell_voltage');
  must(sim.clearAddons(), 'sim_addons_clear');
  if (!e) {
    must(sim.clearPower(), 'sim_power_clear');
    return;
  }
  const o = stockOption(id);
  if (e.prop === 'stock') {
    must(sim.clearPower(), 'sim_power_clear');
  } else {
    must(sim.setPower(partsPowerBlock(id, o.id, e.prop, stockBlock(id))), `sim_set_power ${id} ${e.prop}`);
  }
  const block = addonParams(id, e, baseMass(id));
  if (block) {
    must(sim.setAddons(block), `sim_set_addons ${id}`);
  }
}

/* Full throttle, level, from a throw: the speed it settles at, and the
 * roll stick it held there (the trim a lopsided plane needs). */
function topSpeed(id) {
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_set_pose(0, 0, 300, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(TABLE[id].cruiseMs), 'sim_wing_launch');
  let trim = 0;
  let v = 0;
  let roll = 0;
  let rollSum = 0;
  let n = 0;
  for (let ms = 0; ms < 40000; ms += RC_STEP_MS) {
    const s = sim.readState().state;
    const { pitch, bank } = attitude(s);
    v = Math.hypot(s[4], s[5], s[6]);
    trim = Math.max(-0.3, Math.min(0.3, trim + 0.00002 * -s[6]));
    const pt = Math.max(-0.3, Math.min(0.3, 0.05 * -s[6] + trim));
    const pitchStick = Math.max(-1, Math.min(1, 2.5 * (pt - pitch) + 0.25 * s[12]));
    roll = Math.max(-1, Math.min(1, -1.2 * bank - 0.12 * s[11]));
    must(sim.input(ms / 1000, roll, pitchStick, 0, 1), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    if (ms >= 30000) {
      rollSum += roll;
      n += 1;
    }
  }
  return { v, roll: rollSum / n };
}

/* A scripted flight's state trace, hashed. */
function traceHash(steps = 5000) {
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_set_pose(0, 0, 100, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(12), 'sim_wing_launch');
  const h = createHash('sha256');
  for (let ms = 0; ms < steps * RC_STEP_MS; ms += RC_STEP_MS) {
    const thr = ms < 8000 ? 1 : 0.5;
    const roll = ms > 9000 && ms < 10000 ? 0.4 : 0;
    must(sim.input(ms / 1000, roll, 0.1, 0, thr), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    h.update(sim.readStateBytes().bytes);
  }
  return h.digest('hex').slice(0, 16);
}

/* How far the CG moves for a block on a base mass, m. */
function shiftOf(block, M) {
  const m = block[SIM_ADDON.MASS];
  return [0, 1, 2].map((a) => (m * block[SIM_ADDON.CG + a]) / (M + m));
}

/* ------------------------------------------------------------------ */
console.log('A1 the ABI');
{
  must(sim.e.sim_set_airframe(0), 'sim_set_airframe');
  const b = new Float64Array(SIM_ADDON_DOUBLES);
  b[SIM_ADDON.ROLL_K] = 1;
  /* It refused a quad until the combat quads carried their payloads on it
   * (docs/COMBAT-DRONES.md); scripts/combat-gates.js holds the quad side. */
  check('sim_set_addons takes a quad', sim.setAddons(b) === SIM_OK);
  must(sim.clearAddons(), 'sim_addons_clear');
  must(sim.e.sim_set_airframe(TABLE[RAW_ID].simId), 'sim_set_airframe');
  const bad = (k, v) => {
    const x = Float64Array.from(b);
    x[k] = v;
    return sim.setAddons(x) === SIM_ERR_BAD_ARG;
  };
  check('and a mass under -1 or over 5 kg, a NaN, a drag area over 0.5, a wheel under 5 mm, a roll factor of 0',
    bad(SIM_ADDON.MASS, -1.5) && bad(SIM_ADDON.MASS, 6) && bad(SIM_ADDON.MASS, NaN) && bad(SIM_ADDON.CDA, 0.6)
    && bad(SIM_ADDON.WHEEL_R, 0.001) && bad(SIM_ADDON.ROLL_K, 0) && bad(SIM_ADDON.CG, 4));
  check('and a mass that leaves the aircraft under 50 g', bad(SIM_ADDON.MASS, -1.3));
  seat(RAW_ID);
  const none = traceHash();
  seat(RAW_ID);
  must(sim.setAddons(b), 'sim_set_addons');
  const empty = traceHash();
  check('an empty block flies bit identical to none', none === empty, `${none} ${empty}`);
  must(sim.clearAddons(), 'sim_addons_clear');
  check('and sim_addons_clear puts the table back', traceHash() === none);
  const pw = rawPowerBlock();
  seatRaw(RAW_ID, pw, RAW_ADDON);
  const blk = RAW_ADDON;
  const st = sim.addonsState();
  check('sim_addons_state reads back the mass, drag area, CG move and prop the plant flies',
    st.on && Math.abs(st.massKg - (baseMass(RAW_ID) + blk[SIM_ADDON.MASS])) < 1e-12 && st.cda === blk[SIM_ADDON.CDA]
      && st.thrustN === pw[SIM_POWER.THRUST] && Math.abs(st.shift[2] - shiftOf(blk, baseMass(RAW_ID))[2]) < 1e-12,
    `${(st.massKg * 1000).toFixed(1)} g, ${(st.cda * 1e4).toFixed(2)} cm^2, CG z ${(st.shift[2] * 1000).toFixed(2)} mm, ${st.thrustN} N`);
  seat(RAW_ID);
  const clean = sim.addonsState();
  check('and nothing seated reads the table', !clean.on && clean.cda === 0 && clean.massKg === TABLE[RAW_ID].massKg);
}

console.log('A2 the defaults');
{
  check('an empty settings map normalises to nothing stored', JSON.stringify(normaliseParts({})) === '{}' && JSON.stringify(normaliseParts(null)) === '{}');
  const junk = normaliseParts({ bramor2300: { prop: 'nope', addons: ['wings', 'smoke', 'smoke'] }, notaplane: { prop: 'stock', addons: ['pod'] }, '5inch': { prop: 'x' } });
  check('an unknown prop, add-on or plane is dropped', JSON.stringify(junk) === JSON.stringify({ bramor2300: { prop: 'stock', addons: ['smoke'], damage: null } }), JSON.stringify(junk));
  let allNull = true;
  let sameBlock = true;
  for (const id of PARTS_PLANES) {
    allNull = allNull && addonParams(id, entry(), baseMass(id)) === null;
    for (const o of POWER[id]) {
      const blk = powerBlock(id, o.id, o.pack);
      sameBlock = sameBlock && partsPowerBlock(id, o.id, 'stock', blk) === blk;
    }
  }
  check('every plane with nothing fitted has no add-on block', allNull, `${PARTS_PLANES.length} planes`);
  check('and the stock prop leaves every power block as it is', sameBlock);
}

/* Every plane's part table, for the tape. */
const tables = {};
for (const id of PARTS_PLANES) {
  must(sim.e.sim_set_airframe(TABLE[id].simId), 'sim_set_airframe');
  must(sim.e.sim_set_damage(1), 'sim_set_damage');
  tables[id] = readPartTable(sim);
  must(sim.e.sim_set_damage(0), 'sim_set_damage');
}
const taped = (id, pred) => {
  const t = tables[id];
  return {
    boxes: t.map((p) => [p.boxMin, p.boxMax]),
    parts: t.filter((p, i) => i > 0 && tapeable(p.kind) && pred(p)).map((p) => ({
      i: p.index, kind: p.kind, cg: p.cg, mass: p.mass, joint: p.joint, lo: p.boxMin, hi: p.boxMax, state: 'taped',
    })),
  };
};

console.log('A3 the CG, every combination');
{
  let worst = { d: 0 };
  for (const id of PARTS_PLANES) {
    const fit = addonsFor(id);
    for (let mask = 0; mask < (1 << fit.length); mask += 1) {
      const addons = fit.filter((_, k) => mask & (1 << k));
      for (const prop of PROPS[id]) {
        for (const tape of [null, taped(id, () => true)]) {
          const e = entry({ prop: prop.id, addons, damage: tape && tape.parts.length ? tape : null });
          const b = addonParams(id, e, baseMass(id));
          if (!b) {
            continue;
          }
          const s = shiftOf(b, baseMass(id));
          const d = Math.hypot(...s);
          if (d > worst.d) {
            worst = { d, id, addons, prop: prop.id, tape: Boolean(tape), s };
          }
        }
      }
    }
  }
  check('the CG moves under 2 cm', worst.d < 0.02,
    `worst ${(worst.d * 1000).toFixed(1)} mm (${worst.s.map((x) => (x * 1000).toFixed(1)).join(", ")}), ${worst.id} ${worst.prop} ${worst.addons.join('+')}${worst.tape ? ' every part taped' : ''}`);
}

const tops = {};
function topWith(id, addons) {
  seat(id, entry({ addons }));
  return topSpeed(id);
}

for (const [tag, add, test] of [
  ['A6 the camera pod', 'pod', (s, top, top0) => s[2] < 0 && top < top0],
  ['A7 the lights', 'lights', (s, top, top0) => Math.abs(s[1]) < 1e-12 && Math.abs(top - top0) < 0.1],
  ['A8 the smoke system', 'smoke', (s, top, top0) => s[0] < 0 && top < top0],
]) {
  console.log(tag);
  for (const id of PARTS_PLANES) {
    const b = addonParams(id, entry({ addons: [add] }), baseMass(id));
    const s = shiftOf(b, baseMass(id));
    tops[id] ??= topWith(id, []).v;
    const top = topWith(id, [add]).v;
    check(`${id}: ${add}`, b[SIM_ADDON.MASS] > 0 && test(s, top, tops[id]),
      `+${f1(b[SIM_ADDON.MASS] * 1000)} g, CG ${s.map((x) => (x * 1000).toFixed(1)).join(', ')} mm, +${f2(b[SIM_ADDON.CDA] * 1e4)} cm^2, top ${f2(top)} against ${f2(tops[id])} m/s`);
  }
}

console.log('A9 tape on a wing');
for (const id of PARTS_PLANES) {
  const tape = taped(id, (p) => PART_KINDS[p.kind] === 'wing' && p.cg[1] > 0);
  const e = entry({ damage: tape });
  const b = addonParams(id, e, baseMass(id));
  const s = shiftOf(b, baseMass(id));
  seat(id, entry());
  const clean = topSpeed(id);
  seat(id, e);
  const t = topSpeed(id);
  /* Heavier and draggier on the left: it rolls left, held with right
   * stick, which is positive. */
  check(`${id}: the left wing taped`, tape.parts.length === 1 && s[1] > 0 && t.v < clean.v && t.roll > clean.roll,
    `+${f1(b[SIM_ADDON.MASS] * 1000)} g, +${f2(b[SIM_ADDON.CDA] * 1e4)} cm^2, CG ${(s[1] * 1000).toFixed(2)} mm left, top ${f2(t.v)} against ${f2(clean.v)} m/s, roll trim ${t.roll.toFixed(4)} against ${clean.roll.toFixed(4)}`);
}

console.log('A10 a crash reset keeps what was seated');
{
  const id = 'bramor2300';
  const e = entry({ addons: ['pod', 'smoke'] });
  seat(id, e);
  must(sim.setPower(powerBlock(id, 'stock', '6s10000')), 'sim_set_power');
  /* The seat order the shell keeps: power, then the tuning, then these. */
  const set = setupFor(id, { option: 'stock', pack: '6s10000' });
  const tune = tuneBlock(id, normalizeEntry(id, { packMm: 10, ballastG: 20, rate: 'low', trimDeg: 1 }, set.limits), set.massKg, set.packKg);
  must(sim.setTune(tune), 'sim_wing_set_tune');
  must(sim.setAddons(addonParams(id, e, powerBlock(id, 'stock', '6s10000')[SIM_POWER.MASS])), 'sim_set_addons');
  const seated = sim.addonsState();
  const fresh = traceHash();
  must(sim.e.sim_set_damage(1), 'sim_set_damage');
  must(sim.reset(), 'sim_reset');
  const wing = tables[id].findIndex((p) => PART_KINDS[p.kind] === 'wing');
  must(sim.e.sim_part_break(wing), 'sim_part_break');
  must(sim.step(RC_STEP_MS), 'sim_step');
  must(sim.e.sim_set_damage(0), 'sim_set_damage');
  const after = traceHash();
  const back = sim.addonsState();
  check('the power option, the tuning and the add-ons all come back: the flight after the reset is the fresh seat\'s',
    after === fresh && back.massKg === seated.massKg && back.on, `${fresh} ${after}, ${(back.massKg * 1000).toFixed(1)} g`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
