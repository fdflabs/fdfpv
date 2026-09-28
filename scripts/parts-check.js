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
 *   A4  the prop: each one seats the thrust, pitch speed and current or
 *       rpm prop-estimates.js derives, and flies at the top speed that
 *       follows from them, reported
 *   A5  tundra tyres (the Cub): heavier, more drag, a slower top speed; on
 *       grass they roll further from the same speed; the Cub stands on
 *       them at the pose configs/hangar-parts.js gives
 *   A6  the camera pod, every plane: heavier, the CG lower, a slower top
 *       speed
 *   A7  the lights, every plane: heavier, the CG on the centreline, the
 *       top speed within a tenth of a metre a second
 *   A8  the smoke system, every plane: heavier, the CG aft, a slower top
 *       speed
 *   A9  tape on a wing: heavier on that side, the CG toward it, a slower
 *       top speed, and a plane that needs roll trim toward the other wing
 *   A10 a crash reset keeps the add-ons and the power option: after a part
 *       breaks off and the reset, the flight is the one a fresh seat flies
 *
 *   node scripts/parts-check.js           the checks
 *   node scripts/parts-check.js --derive  also print the Cub's pose on
 *                                         tundra tyres, for the config
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

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK, SIM_ERR_BAD_ARG } from '../tests/lib/simmod.js';
import { attitude, must, RC_STEP_MS, wheelLoads } from '../tests/lib/wingpilot.js';
import { POWER, SIM_POWER, TABLE, powerBlock } from '../configs/power.js';
import {
  ADDONS, PROPS, PARTS_PLANES, SIM_ADDON, SIM_ADDON_DOUBLES, addonParams, addonsFor, normaliseParts,
  partsPowerBlock, tapeable,
} from '../configs/hangar-parts.js';
import { PROP_ESTIMATES } from '../configs/prop-estimates.js';
import { PART_KINDS } from '../configs/parts.js';
import { readPartTable } from './lib/crash.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const derive = process.argv.includes('--derive');

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
  const block = addonParams(id, e, o, baseMass(id));
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
  check('sim_set_addons refuses a quad', sim.setAddons(b) === SIM_ERR_BAD_ARG);
  must(sim.e.sim_set_airframe(TABLE.cub1400.simId), 'sim_set_airframe');
  const bad = (k, v) => {
    const x = Float64Array.from(b);
    x[k] = v;
    return sim.setAddons(x) === SIM_ERR_BAD_ARG;
  };
  check('and a mass under -1 or over 5 kg, a NaN, a drag area over 0.5, a wheel under 5 mm, a roll factor of 0',
    bad(SIM_ADDON.MASS, -1.5) && bad(SIM_ADDON.MASS, 6) && bad(SIM_ADDON.MASS, NaN) && bad(SIM_ADDON.CDA, 0.6)
    && bad(SIM_ADDON.WHEEL_R, 0.001) && bad(SIM_ADDON.ROLL_K, 0) && bad(SIM_ADDON.CG, 4));
  check('and a mass that leaves the aircraft under 50 g', bad(SIM_ADDON.MASS, -1.3));
  seat('cub1400');
  const none = traceHash();
  seat('cub1400');
  must(sim.setAddons(b), 'sim_set_addons');
  const empty = traceHash();
  check('an empty block flies bit identical to none', none === empty, `${none} ${empty}`);
  must(sim.clearAddons(), 'sim_addons_clear');
  check('and sim_addons_clear puts the table back', traceHash() === none);
}

console.log('A2 the defaults');
{
  check('an empty settings map normalises to nothing stored', JSON.stringify(normaliseParts({})) === '{}' && JSON.stringify(normaliseParts(null)) === '{}');
  const junk = normaliseParts({ cub1400: { prop: 'nope', addons: ['wings', 'tundra', 'tundra'] }, timber1500: { prop: 'stock', addons: ['tundra'] }, '5inch': { prop: 'x' } });
  check('an unknown prop, add-on or plane is dropped, and an add-on that does not fit', JSON.stringify(junk) === JSON.stringify({ cub1400: { prop: 'stock', addons: ['tundra'], damage: null } }), JSON.stringify(junk));
  let allNull = true;
  let sameBlock = true;
  for (const id of PARTS_PLANES) {
    allNull = allNull && addonParams(id, entry(), stockOption(id), baseMass(id)) === null;
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
          const b = addonParams(id, e, stockOption(id), baseMass(id));
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

console.log('A4 the props');
for (const id of ['timber1500', 'cub1400', 'sky1800', 'slowstick1180', 'bombshell1118', 'kadet1981']) {
  seat(id, entry());
  const top0 = topSpeed(id).v;
  for (const prop of PROPS[id].slice(1)) {
    const o = stockOption(id);
    const blk = partsPowerBlock(id, o.id, prop.id, stockBlock(id));
    const est = PROP_ESTIMATES[id][o.id][prop.id];
    const seated = blk[SIM_POWER.THRUST] === est.thrustN && blk[SIM_POWER.PITCH_SPEED] === est.pitchSpeedMs
      && (est.currentA == null || blk[SIM_POWER.CURRENT] === est.currentA) && (est.rpmNoLoad == null || blk[SIM_POWER.RPM] === est.rpmNoLoad);
    seat(id, entry({ prop: prop.id }));
    const top = topSpeed(id).v;
    /* The level top speed sits between the two props' pitch speeds'
     * order: a prop with the higher pitch speed flies faster flat out. */
    const faster = est.pitchSpeedMs > o.pitchSpeedMs;
    check(`${id}: ${prop.apc} (${prop.blades} blades) seats ${est.thrustN} N and ${est.pitchSpeedMs} m/s, and flies ${faster ? 'faster' : 'slower'}`,
      seated && (faster ? top > top0 : top < top0),
      `top ${f2(top)} against ${f2(top0)} m/s on the ${o.propIn} x ${o.pitchIn}; ${o.thrustN.toFixed(2)} N ${o.pitchSpeedMs.toFixed(1)} m/s stock`);
  }
}

const tops = {};
function topWith(id, addons) {
  seat(id, entry({ addons }));
  return topSpeed(id);
}

console.log('A5 tundra tyres, the Cub');
{
  const id = 'cub1400';
  const b = addonParams(id, entry({ addons: ['tundra'] }), stockOption(id), baseMass(id));
  const top0 = topWith(id, []).v;
  const top1 = topWith(id, ['tundra']).v;
  check('heavier and more drag, and the top speed falls', b[SIM_ADDON.MASS] > 0 && b[SIM_ADDON.CDA] > 0 && top1 < top0,
    `+${f1(b[SIM_ADDON.MASS] * 1000)} g, +${f2(b[SIM_ADDON.CDA] * 1e4)} cm^2, top ${f2(top1)} against ${f2(top0)} m/s, ${f2(top0 - top1)} slower`);
  /* On the strip: let it stand, then roll it at 6 m/s with the throttle
   * shut and see how far it goes. */
  const stand = (addons) => {
    seat(id, addons.length ? entry({ addons }) : null);
    must(sim.reset(), 'sim_reset');
    must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, 1.4, 0), 'sim_set_ground');
    const h = 11 * Math.PI / 360;
    must(sim.e.sim_set_pose(0, 0, 0.18, Math.cos(h), 0, -Math.sin(h), 0), 'sim_set_pose');
    let t = 0;
    for (; t < 4000; t += RC_STEP_MS) {
      must(sim.input(t / 1000, 0, 0, 0, 0), 'sim_input');
      must(sim.step(RC_STEP_MS), 'sim_step');
    }
    const s = sim.readState().state;
    return { s, t, pitch: attitude(s).pitch * 180 / Math.PI, z: s[3], loads: wheelLoads(sim) };
  };
  const roll = (addons) => {
    const r = stand(addons);
    const x0 = r.s[1];
    must(sim.e.sim_set_velocity(6, 0, 0, 0, 0, 0), 'sim_set_velocity');
    let t = r.t;
    let s = r.s;
    for (; t < r.t + 30000; t += RC_STEP_MS) {
      must(sim.input(t / 1000, 0, 0, 0, 0), 'sim_input');
      must(sim.step(RC_STEP_MS), 'sim_step');
      s = sim.readState().state;
      if (Math.hypot(s[4], s[5]) < 0.05) {
        break;
      }
    }
    return { dist: s[1] - x0, rest: r };
  };
  const kit = roll([]);
  const tun = roll(['tundra']);
  check('on grass they roll further from 6 m/s with the throttle shut', tun.dist > kit.dist, `${f2(tun.dist)} m against ${f2(kit.dist)} m`);
  const g = ADDONS.tundra.gear;
  check('the Cub stands higher on them', tun.rest.z > kit.rest.z + 0.01, `CG ${tun.rest.z.toFixed(4)} m, ${f2(tun.rest.pitch)} deg against ${kit.rest.z.toFixed(4)} m, ${f2(kit.rest.pitch)} deg`);
  if (derive) {
    console.log(`  derive: gear: { restHeight: ${tun.rest.z.toFixed(4)}, restPitch: ${tun.rest.pitch.toFixed(2)} * Math.PI / 180 }`);
  }
  check('at the pose the config gives the shell', g != null && Math.abs(g.restHeight - tun.rest.z) < 0.002 && Math.abs(g.restPitch * 180 / Math.PI - tun.rest.pitch) < 0.2,
    g ? `config ${g.restHeight} m, ${f2(g.restPitch * 180 / Math.PI)} deg` : 'no pose in the config');
}

for (const [tag, add, test] of [
  ['A6 the camera pod', 'pod', (s, top, top0) => s[2] < 0 && top < top0],
  ['A7 the lights', 'lights', (s, top, top0) => Math.abs(s[1]) < 1e-12 && Math.abs(top - top0) < 0.1],
  ['A8 the smoke system', 'smoke', (s, top, top0) => s[0] < 0 && top < top0],
]) {
  console.log(tag);
  for (const id of PARTS_PLANES) {
    const b = addonParams(id, entry({ addons: [add] }), stockOption(id), baseMass(id));
    const s = shiftOf(b, baseMass(id));
    tops[id] ??= topWith(id, []).v;
    const top = topWith(id, [add]).v;
    check(`${id}: ${add}`, b[SIM_ADDON.MASS] > 0 && test(s, top, tops[id]),
      `+${f1(b[SIM_ADDON.MASS] * 1000)} g, CG ${s.map((x) => (x * 1000).toFixed(1)).join(', ')} mm, +${f2(b[SIM_ADDON.CDA] * 1e4)} cm^2, top ${f2(top)} against ${f2(tops[id])} m/s`);
  }
}

console.log('A9 tape on a wing');
for (const id of ['cub1400', 'timber1500', 'kadet1981']) {
  const tape = taped(id, (p) => PART_KINDS[p.kind] === 'wing' && p.cg[1] > 0);
  const e = entry({ damage: tape });
  const b = addonParams(id, e, stockOption(id), baseMass(id));
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
  const id = 'timber1500';
  const e = entry({ prop: '11x7e', addons: ['pod', 'smoke'] });
  seat(id, e);
  must(sim.setPower(partsPowerBlock(id, '3s', '11x7e', powerBlock(id, '3s', '3s2200'))), 'sim_set_power');
  must(sim.setAddons(addonParams(id, e, POWER[id][1], powerBlock(id, '3s', '3s2200')[SIM_POWER.MASS])), 'sim_set_addons');
  const fresh = traceHash();
  must(sim.e.sim_set_damage(1), 'sim_set_damage');
  must(sim.reset(), 'sim_reset');
  const wing = tables[id].findIndex((p) => PART_KINDS[p.kind] === 'wing');
  must(sim.e.sim_part_break(wing), 'sim_part_break');
  must(sim.step(RC_STEP_MS), 'sim_step');
  must(sim.e.sim_set_damage(0), 'sim_set_damage');
  const after = traceHash();
  check('the flight after the reset is the fresh seat\'s', after === fresh, `${fresh} ${after}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
