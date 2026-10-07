/*
 * wear-selftest.js: configs/wear.js, the contract in docs/PARTS-WEAR.md.
 *
 *   W1  nothing worn: every plane option and pack, every quad choice,
 *       seats the very block it was handed (null stays null), so a casual
 *       seat is byte identical to before.
 *   W2  a worn block is the scales of the contract, exactly, and the same
 *       doubles on every call.
 *   W3  on the plant: a worn plane makes less thrust and runs down sooner
 *       on the bench; the same worn block flown twice in two fresh modules
 *       gives the same state trace, bit for bit, and the fresh one another.
 *   W4  the same for a quad's two blocks, flown through Betaflight.
 *   W5  accrue: integers, pure (the input untouched), the same answer
 *       twice, the delta's shape, retirement, the idle full pack rule.
 *   W6  the stored data: an old settings blob with neither section loads
 *       as empty sections; garbage is dropped; starter packs are granted
 *       once with ids two computers agree on; the charger turns two packs
 *       around a sortie; repair; the room's hooks.
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

import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { TestStand } from '../src/game/teststand.js';
import { POWER, TABLE, powerBlock, powerParams, SIM_POWER } from '../configs/power.js';
import { MOTORS, SIM_MOTORS, SIM_PROP_PACK, motorsBlock, propPackBlock, quadChoices } from '../configs/motors.js';
import { airframeById } from '../configs/airframes.js';
import {
  NEW, RETIRED_BELOW, accrue, benchState, chargerState, normalisePacks, normaliseWear, packShelf, packSpec,
  pickPack, repair, seedPacks, turnaround, wearOf, wornPowerBlock, wornQuadBlocks,
} from '../configs/wear.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) {
    failed += 1;
  }
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
function must(code, where) {
  if (code !== SIM_OK) {
    throw new Error(`${where}: the module returned ${code}`);
  }
}
const same = (a, b) => a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
const freshWear = { motor: NEW, prop: NEW, frame: NEW, flights: 0 };
const freshPack = { spec: 'x', cycles: 0, health: NEW, charge: 'full' };

console.log('W1 nothing worn seats the block it was handed');
{
  let n = 0;
  let bad = 0;
  for (const id of Object.keys(POWER)) {
    for (const o of POWER[id]) {
      for (const p of o.packs) {
        const block = powerParams(id, o.id, p.id);
        for (const pack of [null, freshPack]) {
          n += 1;
          if (wornPowerBlock(id, { option: o.id, pack: p.id }, block, freshWear, pack) !== block) {
            bad += 1;
          }
        }
      }
    }
  }
  for (const id of Object.keys(MOTORS)) {
    for (const c of quadChoices(id)) {
      const m = motorsBlock(id, c);
      const pp = propPackBlock(id, c);
      const got = wornQuadBlocks(id, c, m, pp, freshWear, freshPack);
      n += 1;
      if (got.motors !== m || got.propPack !== pp) {
        bad += 1;
      }
    }
  }
  check('every plane and quad choice, fresh', bad === 0, `${n} seats, ${bad} differ`);
}

console.log('W2 the scales');
{
  const id = 'sky1800';
  const choice = { option: 'stock', pack: '4s5000' };
  const base = powerBlock(id, choice.option, choice.pack);
  const wear = { motor: 500, prop: 800, frame: 300, flights: 9 };
  const pack = { spec: '4s5000', cycles: 120, health: 400, charge: 'storage' };
  const a = wornPowerBlock(id, choice, null, wear, pack);
  const b = wornPowerBlock(id, choice, null, wear, pack);
  check('the same doubles twice', same(a, b));
  check('thrust x motor (0.9 + 0.1 h) x prop (0.85 + 0.15 h)', a[SIM_POWER.THRUST] === base[SIM_POWER.THRUST] * ((0.9 * NEW + 0.1 * 500) / NEW) * ((0.85 * NEW + 0.15 * 800) / NEW));
  check('R_CELL x (2 - h)', a[SIM_POWER.R_CELL] === base[SIM_POWER.R_CELL] * ((2 * NEW - 400) / NEW));
  check('PACK_C x (0.8 + 0.2 h) x storage 0.6', a[SIM_POWER.PACK_C] === base[SIM_POWER.PACK_C] * ((0.8 * NEW + 0.2 * 400) / NEW) * 0.6);
  const rest = [SIM_POWER.MASS, SIM_POWER.CG_SHIFT, SIM_POWER.CELLS, SIM_POWER.PITCH_SPEED, SIM_POWER.RPM, SIM_POWER.CURRENT, SIM_POWER.LVC];
  check('nothing else moves', rest.every((k) => Object.is(a[k], base[k])));
  check('the block handed in is not written', same(powerBlock(id, choice.option, choice.pack), base));
  const glow = wornPowerBlock('kadet1981', { option: 'stock', pack: POWER.kadet1981[0].pack }, null, freshWear, { ...pack });
  check('a glow engine\'s pack wear changes nothing', same(glow, powerBlock('kadet1981', 'stock', POWER.kadet1981[0].pack)));
}

console.log('W3 a worn plane on the plant');
const wasm = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const baseline = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
{
  const id = 'sky1800';
  const choice = { option: 'stock', pack: '4s5000' };
  const worn = wornPowerBlock(id, choice, null, { motor: 300, prop: 600, frame: NEW, flights: 0 }, { spec: '4s5000', cycles: 200, health: 300, charge: 'full' });
  async function bench(block) {
    const sim = await loadSim(wasm);
    must(sim.init(baseline), 'sim_init');
    const stand = new TestStand(sim);
    stand.seat(TABLE[id].simId, block, null);
    stand.setThrottle(1);
    stand.steps(1500);
    const r = stand.reading();
    const h = createHash('sha256');
    stand.restart();
    stand.setThrottle(0.8);
    for (let i = 0; i < 3000; i += 1) {
      stand.steps(1);
      h.update(new Uint8Array(stand.sim.readState().state.buffer.slice(0)));
    }
    let end = null;
    while (!end) {
      end = stand.endurance(1, 4, 200000);
    }
    return { thrust: r.thrustN, hash: h.digest('hex').slice(0, 16), seconds: end.seconds };
  }
  const f = await bench(powerBlock(id, choice.option, choice.pack));
  const w1 = await bench(worn);
  const w2 = await bench(worn);
  check('less thrust worn', w1.thrust < f.thrust, `${f.thrust.toFixed(2)} -> ${w1.thrust.toFixed(2)} N`);
  check('runs down sooner worn', w1.seconds < f.seconds, `${f.seconds.toFixed(1)} -> ${w1.seconds.toFixed(1)} s at full`);
  check('the worn trace twice is bit identical', w1.hash === w2.hash && w1.seconds === w2.seconds, w1.hash);
  check('the fresh trace differs', f.hash !== w1.hash, f.hash);
}

console.log('W4 a worn quad through Betaflight');
{
  const af = airframeById('7inch');
  const diff = await readFile(join(root, `configs/${af.defaultTune}.diff`), 'utf8');
  const choice = { option: 'stock', prop: 'stock', pack: 'stock' };
  async function trace(seat) {
    const sim = await loadSim(wasm);
    must(sim.e.sim_set_airframe(af.simId), 'sim_set_airframe');
    must(sim.init(diff), 'sim_init');
    if (seat.motors) {
      must(sim.setMotors(seat.motors), 'sim_set_motors');
    }
    if (seat.propPack) {
      must(sim.setPropPack(seat.propPack), 'sim_set_prop_pack');
    }
    sim.reset();
    must(sim.setCellVoltage(4.2), 'sim_set_cell_voltage');
    const h = createHash('sha256');
    for (let t = 0; t < 2000; t += 1) {
      if (t % 4 === 0) {
        sim.input(t / 1000, t > 1000 ? 0.3 : 0, 0, 0, 0.7);
      }
      sim.step(1);
      const s = sim.readState().state;
      h.update(new Uint8Array(Float64Array.from(s).buffer));
    }
    /* Then every motor at full duty, held still: the standing rotor
     * speed, rpm, which more phase resistance and a sagging pack lower. */
    must(sim.e.sim_motor_override(-1, 1.0), 'sim_motor_override');
    let rpm = 0;
    for (let t = 0; t < 600; t += 1) {
      sim.e.sim_rest();
      sim.step(1);
      rpm = sim.readState().state[14];
    }
    return { hash: h.digest('hex').slice(0, 16), rpm };
  }
  const worn = wornQuadBlocks('7inch', choice, null, null, { motor: 200, prop: 500, frame: NEW, flights: 0 }, { spec: '6s4200li', cycles: 0, health: 200, charge: 'full' });
  check('the blocks scale R, KT, R_CELL', worn.motors[SIM_MOTORS.R] === MOTORS['7inch'].table.rMotor * ((1.2 * NEW - 0.2 * 200) / NEW)
    && worn.propPack[SIM_PROP_PACK.KT] === MOTORS['7inch'].table.kt * ((0.85 * NEW + 0.15 * 500) / NEW), `R ${worn.motors[SIM_MOTORS.R].toFixed(4)}, KT x ${(worn.propPack[SIM_PROP_PACK.KT] / MOTORS['7inch'].table.kt).toFixed(3)}`);
  const f = await trace({ motors: null, propPack: null });
  const w1 = await trace(worn);
  const w2 = await trace(worn);
  check('the worn trace twice is bit identical', w1.hash === w2.hash, w1.hash);
  check('the fresh trace differs', f.hash !== w1.hash, f.hash);
  check('a worn quad turns slower at full', w1.rpm < f.rpm, `${f.rpm.toFixed(0)} -> ${w1.rpm.toFixed(0)} rpm`);
}

console.log('W5 accrue');
{
  const packs = { a: { v: 1, spec: '4s5000', cycles: 3, health: 610, charge: 'full', from: null }, b: { v: 1, spec: '4s5000', cycles: 0, health: NEW, charge: 'full', from: null }, c: { v: 1, spec: '4s5000', cycles: 0, health: 900, charge: 'storage', from: null } };
  const wear = { sky1800: { v: 1, motor: NEW, prop: 900, frame: NEW, flights: 4 } };
  const flight = { airframe: 'sky1800', packId: 'a', drawnC: 18000, capacityC: 18000, minCellV: 3.1, lvcV: 3.3, fullThrottleS: 150, impacts: [{ kind: 'prop', energyJ: 4 }, { kind: 'frame', energyJ: 37.6 }] };
  const before = JSON.stringify({ packs, wear, flight });
  const r1 = accrue(packs, wear, flight);
  const r2 = accrue(packs, wear, flight);
  check('pure: the input untouched', JSON.stringify({ packs, wear, flight }) === before);
  check('the same answer twice', JSON.stringify(r1) === JSON.stringify(r2));
  const ints = [...Object.values(r1.packs).flatMap((p) => [p.health, p.cycles]), ...['motor', 'prop', 'frame', 'flights'].map((k) => r1.wear.sky1800[k])];
  check('every health and count an integer', ints.every(Number.isInteger), ints.join(' '));
  const d = r1.delta;
  check('the flown pack: a cycle, flat, overdischarged', d.pack && d.pack.id === 'a' && d.pack.after === 610 - Math.round(1000 / 300 + 20) && d.pack.cycles === 4 && d.pack.charge === 'flat' && r1.packs.a.charge === 'flat', JSON.stringify(d.pack));
  check('crossing 600 retires it', d.retired.length === 1 && d.retired[0] === 'a');
  check('a full pack left on the shelf loses 1, a storage one nothing', r1.packs.b.health === NEW - 1 && r1.packs.c.health === 900);
  const causes = d.parts.map((p) => `${p.part}:${p.cause}:${p.before}->${p.after}`).join(' ');
  check('the parts delta', causes === 'motor:heat:1000->997 prop:impact:900->750 frame:impact:1000->962 pack:overdischarge:610->587', causes);
  check('flights counted', r1.wear.sky1800.flights === 5);
}

console.log('W6 stored data, packs, repair, hooks');
{
  const old = { livery: {}, parts: {} };
  check('an old blob loads as empty sections', JSON.stringify(normalisePacks(old.packs)) === '{}' && JSON.stringify(normaliseWear(old.wear)) === '{}');
  check('an old blob reads new parts', JSON.stringify(wearOf(old, 'sky1800')) === JSON.stringify({ v: 1, motor: NEW, prop: NEW, frame: NEW, flights: 0 }));
  const junk = normalisePacks({ 'BAD ID': { spec: '4s5000' }, ok: { spec: '4s5000', health: 1200, cycles: -1, charge: 'warm' }, nospec: { health: 5 } });
  check('garbage dropped or clamped', Object.keys(junk).join() === 'ok' && junk.ok.health === NEW && junk.ok.cycles === 0 && junk.ok.charge === 'full');
  check('unknown airframes dropped from wear', Object.keys(normaliseWear({ nope: {}, sky1800: { motor: 5 } })).join() === 'sky1800');
  check('pack specs', packSpec('sky1800', '4s5000') === '4s5000' && packSpec('7inch', 'stock') === '6s4200li' && packSpec('kadet1981', 'x') === null, `${packSpec('7inch', 'stock')}`);
  const s1 = seedPacks({}, 'sky1800', '4s5000');
  const s2 = seedPacks(s1, 'sky1800', '4s5000');
  check('two starter packs, once, ids from the airframe', Object.keys(s1).join() === 'sky1800-1,sky1800-2' && Object.keys(s2).length === 2);
  const flat = { ...s1, x: { ...s1['sky1800-1'], charge: 'flat' }, y: { ...s1['sky1800-1'], charge: 'flat' }, z: { ...s1['sky1800-1'], charge: 'flat' } };
  const t = turnaround(flat, 'storage');
  check('a turnaround charges two flat packs by id', t.x.charge === 'storage' && t.y.charge === 'storage' && t.z.charge === 'flat');
  check('pickPack: charged first, healthiest', pickPack({ p: { spec: 'a', health: 900, charge: 'full' }, q: { spec: 'a', health: 990, charge: 'full' }, r: { spec: 'a', health: NEW, charge: 'flat' } }, 'a') === 'q' && pickPack({ r: { spec: 'a', health: NEW, charge: 'flat' } }, 'a') === null);
  const worn = { sky1800: { v: 1, motor: 500, prop: 400, frame: 300, flights: 7 } };
  const one = repair(worn, 'sky1800', 'prop');
  const all = repair(worn, 'sky1800');
  check('repair one part, or all', one.sky1800.prop === NEW && one.sky1800.motor === 500 && all.sky1800.motor === NEW && all.sky1800.frame === NEW && all.sky1800.flights === 7 && worn.sky1800.prop === 400);
  const settings = { packs: { ...t, w: { spec: '4s5000', cycles: 300, health: RETIRED_BELOW - 1, charge: 'full' } }, wear: worn };
  const shelf = packShelf(settings);
  check('the shelf hook', shelf.length === 6 && shelf.find((p) => p.id === 'w').retired === true);
  check('the charger hook', JSON.stringify(chargerState(settings)) === JSON.stringify({ channels: 2, next: ['z'], waiting: [] }));
  const bench = benchState(settings, 'sky1800');
  check('the bench hook', bench.flights === 7 && bench.parts.every((p) => p.worn));
}

if (failed) {
  console.log(`\nFAIL: ${failed} check(s)`);
  process.exit(1);
}
console.log('\nPASS: wear');
