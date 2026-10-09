/*
 * tuning-check.js: the hangar's Tuning tab and test stand against the
 * plant, every plane. configs/tuning.js, sim_wing_set_tune in
 * src/native/sim_abi.h, src/game/teststand.js.
 *
 *   U1 the stock setup is the table, bit for bit: a flight with the stock
 *      block seated through sim_wing_set_tune hashes the same as one with
 *      nothing seated, on the stock power and on an alternative, and the
 *      block's throws, expo and flap mix are the table's own doubles.
 *   U2 the CG moves the static margin, measured off the plant's pitching
 *      moment at two angles of attack: at the maker's CG it is the one
 *      configs/tuning.js `margin` shows the pilot, and moved forward
 *      by d it grows by d over the chord, back by d it shrinks by as much.
 *   U3 the stall, the documented direction (FAA, Pilot's Handbook of
 *      Aeronautical Knowledge, Weight and Balance, "Effects of Adverse
 *      Balance": a forward CG is more stable and harder to raise the nose,
 *      an aft CG less stable, quicker to stall and harder to recover): full
 *      up elevator from level flight at cruise, power off, reaches a
 *      higher angle of attack in its first second and pitches up faster
 *      tail heavy than stock, and stock than nose heavy. The first second,
 *      because after it the speed a power off pull up has bled away sets
 *      the angle more than the balance does.
 *   U4 the rates: full aileron (the rudder on a plane without ailerons)
 *      rolls faster, and full elevator pitches faster, on high than mid
 *      than low.
 *   U5 the expo softens the centre and leaves the ends: at a quarter stick
 *      the surface is smaller and the roll rate lower the more expo there
 *      is, and at full stick the surface is the throw whatever the expo.
 *   U6 the trim adds to the elevator at centred sticks, the flap mix is
 *      the manual's or none (the Timber), and the ballast is mass: the
 *      same CG with lead on it pitches up slower than without.
 *   U7 the test stand: at full throttle on a fresh pack it reads the
 *      plant's own static thrust, rpm and current (configs/power.js, which
 *      power:check P1 proves are the table's), the lead does not change
 *      them, and it runs longer at half throttle than at full.
 *
 *   node scripts/tuning-check.js [airframe ...]    every plane by default
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

import { loadSim } from '../tests/lib/simmod.js';
import { must, wingDebug } from '../tests/lib/wingpilot.js';
import { POWER, TABLE, powerBlock, powerOption } from '../configs/power.js';
import { SIM_TUNE, TUNING, balance, normalizeEntry, setupFor, stockEntry, tuneBlock } from '../configs/tuning.js';
import { TestStand } from '../src/game/teststand.js';

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
const f3 = (x) => x.toFixed(3);
const deg = (r) => (r * 180) / Math.PI;

const bytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const diff = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const sim = await loadSim(bytes);
must(sim.init(diff), 'init');
const standSim = await loadSim(bytes);
must(standSim.init(diff), 'stand init');
const stand = new TestStand(standSim);

const HIGH = 400;


function seat(id, tune = null, power = null) {
  must(sim.e.sim_set_airframe(TABLE[id].simId), 'sim_set_airframe');
  must(sim.setCellVoltage(4.2), 'sim_set_cell_voltage');
  must(power ? sim.setPower(power) : sim.clearPower(), 'power');
  must(tune ? sim.setTune(tune) : sim.clearTune(), 'tune');
  must(sim.e.sim_wing_set_stab(0), 'manual');
}

/* Level at `speed`, body along the path at angle of attack `alpha`, high
 * over the field. */
function place(speed, alpha = 0) {
  must(sim.reset(), 'reset');
  must(sim.e.sim_set_pose(0, 0, HIGH, 1, 0, 0, 0), 'pose');
  must(sim.e.sim_set_velocity(speed * Math.cos(alpha), 0, -speed * Math.sin(alpha), 0, 0, 0), 'velocity');
}

/* Fly a stick program, 1 ms steps: sticks(ms) -> [roll, pitch, yaw,
 * throttle]; every(ms) sees the state and the debug block. */
function flyFor(ms, sticks, every = null) {
  for (let t = 0; t < ms; t += 1) {
    const [r, p, y, th] = sticks(t);
    must(sim.input(t / 1000, r, p, y, th), 'input');
    must(sim.step(1), 'step');
    if (every) {
      every(t, sim.readState().state);
    }
  }
}

function traceHash(id, tune, power) {
  seat(id, tune, power);
  place(TABLE[id].cruiseMs * 1.2);
  const h = createHash('sha256');
  flyFor(6000, (t) => [
    t < 1000 ? 0 : t < 2000 ? 0.6 : t < 2500 ? -0.3 : 0.1,
    t < 1500 ? 0.1 : t < 3000 ? 0.4 : -0.2,
    t > 3000 && t < 3600 ? -0.5 : 0,
    0.6,
  ], () => h.update(sim.readStateBytes().bytes));
  return h.digest('hex').slice(0, 16);
}

/* The static margin off the plant: -dCm/dCL between two angles of
 * attack below the stall, sticks centred. */
function margin(id, tune) {
  const t = TUNING[id];
  seat(id, tune);
  const at = (a) => {
    place(TABLE[id].cruiseMs, a);
    must(sim.input(0, 0, 0, 0, 0), 'input');
    must(sim.step(1), 'step');
    const d = wingDebug(sim);
    return { cm: d[6] / (d[2] * t.area * t.chord), cl: d[3] };
  };
  /* Both points on the linear lift: the curve rounds onto CL max from a
   * stall_blend short of the stall angle (docs/FLIGHTMODEL.md), which on
   * the Radian, 5 deg of zero lift under its body axis, starts at 2.5 deg
   * of body angle. */
  const a = at(0.0);
  const b = at(0.03);
  return -(b.cm - a.cm) / (b.cl - a.cl);
}

/* Full up elevator from level at cruise, power off: the peak angle of
 * attack and pitch rate in the first second. */
function stall(id, tune) {
  seat(id, tune);
  place(TABLE[id].cruiseMs);
  let alpha = -Infinity;
  let q = 0;
  flyFor(1000, () => [0, 1, 0, 0], () => {
    const d = wingDebug(sim);
    alpha = Math.max(alpha, d[0]);
    q = Math.max(q, -sim.readState().state[12]);
  });
  return { alpha, q };
}

/* Peak body rate from a stick step at cruise, 1 s: axis 11 roll, 12
 * pitch. */
function rateStep(id, tune, sticks, axis) {
  seat(id, tune);
  place(TABLE[id].cruiseMs);
  let peak = 0;
  flyFor(axis === 11 ? 1000 : 300, () => sticks, (t, s) => {
    peak = Math.max(peak, Math.abs(s[axis]));
  });
  return peak;
}

/* The surfaces after one step at these sticks, radians [la, ra, e, r]. */
function surfaces(id, tune, roll, pitch, flapNotch = 0) {
  seat(id, tune);
  if (flapNotch) {
    must(sim.e.sim_wing_set_flaps(flapNotch), 'flaps');
  }
  place(TABLE[id].cruiseMs);
  if (flapNotch) {
    must(sim.e.sim_wing_flaps_settle(), 'settle');
  }
  must(sim.input(0, roll, pitch, 0, 0), 'input');
  must(sim.step(1), 'step');
  const ptr = sim.e.malloc(32);
  must(sim.e.sim_plane_surfaces(ptr), 'surfaces');
  const out = Array.from(new Float64Array(sim.e.memory.buffer, ptr, 4));
  sim.e.free(ptr);
  if (flapNotch) {
    must(sim.e.sim_wing_set_flaps(0), 'flaps up');
  }
  return out;
}

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(TUNING);
for (const id of ids) {
  const t = TUNING[id];
  if (!t || !TABLE[id]) {
    throw new Error(`tuning-check: no tuning or power data for ${id}`);
  }
  const { massKg, packKg, electric, limits: lim } = setupFor(id, null);
  const block = (entry) => tuneBlock(id, normalizeEntry(id, entry, lim), massKg, packKg);
  const rudderOnly = t.throws.high[0] === 0;
  console.log(`\n${id}  (${electric ? `pack ${packKg} kg over ${lim.packMm} mm` : POWER[id] ? 'glow' : 'no motor'}, lead ${lim.ballastG} g, ${massKg} kg)`);

  /* U1 */
  const stockBlock = block({ ...stockEntry(id) });
  const expoOnly = block({ expo: { a: 35 } });
  seat(id);
  const table = sim.tune();
  const sameDoubles = [SIM_TUNE.THROW_A, SIM_TUNE.THROW_E, SIM_TUNE.THROW_R, SIM_TUNE.FLAP_MIX]
    .every((k) => Object.is(expoOnly[k], table[k]));
  check(`U1 ${id} the high rate and the flap mix are the table's own doubles`, sameDoubles,
    `throws ${[3, 4, 5].map((k) => f2(deg(table[k]))).join(', ')} deg, mix ${table[SIM_TUNE.FLAP_MIX]}`);
  check(`U1 ${id} the stock setup, every field given, is no block at all`, stockBlock === null);
  const stockSeated = Float64Array.from(table);
  const bare = traceHash(id, null, null);
  const seated = traceHash(id, stockSeated, null);
  check(`U1 ${id} the stock block flies the table bit for bit`, bare === seated, `${bare} ${seated}`);
  if (POWER[id] && POWER[id].length > 1) {
    const o = POWER[id][1];
    const pb = powerBlock(id, o.id, o.pack);
    const a = traceHash(id, null, pb);
    const b = traceHash(id, stockSeated, pb);
    check(`U1 ${id} and on ${o.id}`, a === b, `${a} ${b}`);
  }

  /* U2 */
  const fwdEntry = { packMm: lim.packMm, ballastG: lim.ballastG };
  const aftEntry = { packMm: -lim.packMm, ballastG: -lim.ballastG };
  const fwd = balance(id, fwdEntry, massKg, packKg);
  const aft = balance(id, aftEntry, massKg, packKg);
  const sm0 = margin(id, null);
  const smF = margin(id, block(fwdEntry));
  const smA = margin(id, block(aftEntry));
  check(`U2 ${id} the plant's static margin at the maker's CG is the doc's`, Math.abs(sm0 - t.margin) < 0.001,
    `${f3(sm0)} against ${t.margin}`);
  check(`U2 ${id} forward ${f2(fwd.shift * 1000)} mm raises it by the shift over the chord`,
    Math.abs(smF - sm0 - fwd.shift / t.chord) < 1e-6, `${f3(sm0)} to ${f3(smF)}, ${f3(fwd.shift / t.chord)} expected`);
  check(`U2 ${id} aft ${f2(-aft.shift * 1000)} mm lowers it by as much`,
    Math.abs(smA - sm0 - aft.shift / t.chord) < 1e-6, `${f3(sm0)} to ${f3(smA)}, ${f3(aft.shift / t.chord)} expected`);

  /* U3: the CG moved without lead, so only the balance differs. */
  const cgOnly = (shift) => {
    const b = Float64Array.from(table);
    b[SIM_TUNE.CG_SHIFT] = shift;
    return b;
  };
  const d = 0.15 * t.chord;
  const sF = stall(id, cgOnly(d));
  const s0 = stall(id, null);
  const sA = stall(id, cgOnly(-d));
  check(`U3 ${id} full up elevator: tail heavy reaches a higher angle of attack than stock, stock than nose heavy`,
    sA.alpha > s0.alpha && s0.alpha > sF.alpha,
    `CG ${f2(d * 1000)} mm each way: ${f2(deg(sA.alpha))}, ${f2(deg(s0.alpha))}, ${f2(deg(sF.alpha))} deg`);
  check(`U3 ${id} and pitches up faster`, sA.q > s0.q && s0.q > sF.q,
    `${f2(deg(sA.q))}, ${f2(deg(s0.q))}, ${f2(deg(sF.q))} deg/s`);

  /* U4 */
  const rateBlock = (rate) => block({ rate }) ?? Float64Array.from(table);
  const roll = ['low', 'mid', 'high'].map((r) => rateStep(id, rateBlock(r), [1, 0, 0, 0.5], 11));
  const pitch = ['low', 'mid', 'high'].map((r) => rateStep(id, rateBlock(r), [0, 1, 0, 0.5], 12));
  check(`U4 ${id} ${rudderOnly ? 'full roll stick (the rudder)' : 'full aileron'} rolls faster on high than mid than low`,
    roll[2] > roll[1] && roll[1] > roll[0], `${roll.map((x) => f2(deg(x))).join(', ')} deg/s`);
  check(`U4 ${id} full elevator pitches faster on high than mid than low`,
    pitch[2] > pitch[1] && pitch[1] > pitch[0], `${pitch.map((x) => f2(deg(x))).join(', ')} deg/s`);

  /* U5 */
  const expoBlock = (e) => block({ expo: { a: e, e, r: e } }) ?? Float64Array.from(table);
  const elevator = (sf) => (t.elevons ? 0.5 * (sf[0] + sf[1]) : sf[2]);
  const quarter = [0, 30, 60].map((e) => Math.abs(elevator(surfaces(id, expoBlock(e), 0, 0.25))));
  const full = [0, 30, 60].map((e) => Math.abs(elevator(surfaces(id, expoBlock(e), 0, 1))));
  const rollQ = [0, 30, 60].map((e) => rateStep(id, expoBlock(e), [0.25, 0, 0, 0.5], 11));
  check(`U5 ${id} a quarter stick moves the elevator less the more expo`, quarter[0] > quarter[1] && quarter[1] > quarter[2],
    `${quarter.map((x) => f2(deg(x))).join(', ')} deg at 0, 30, 60 percent`);
  check(`U5 ${id} and rolls slower`, rollQ[0] > rollQ[1] && rollQ[1] > rollQ[2],
    `${rollQ.map((x) => f2(deg(x))).join(', ')} deg/s`);
  check(`U5 ${id} full stick is the throw whatever the expo`, full.every((x) => Math.abs(x - full[0]) < 1e-12),
    `${f2(deg(full[0]))} deg`);

  /* U6 */
  const trimmed = surfaces(id, block({ trimDeg: 2 }), 0, 0);
  const elevatorAt = elevator(trimmed);
  check(`U6 ${id} 2 deg of up trim puts 2 deg on the elevator at centred sticks`, Math.abs(deg(elevatorAt) - 2) < 1e-9,
    `${f3(deg(elevatorAt))} deg`);
  if (t.flaps && t.flaps.mix !== 0) {
    const withMix = surfaces(id, null, 0, 0, 2)[2];
    const noMix = surfaces(id, block({ flapMix: false }), 0, 0, 2)[2];
    check(`U6 ${id} full flaps: the manual's mix puts down elevator on, none leaves it centred`,
      withMix < -0.05 && noMix === 0, `${f2(deg(withMix))} and ${f2(deg(noMix))} deg`);
  } else if (t.flaps) {
    /* A manual that gives no mix: full flaps leave the elevator centred
     * either way. */
    const withMix = surfaces(id, null, 0, 0, 2)[2];
    const noMix = surfaces(id, block({ flapMix: false }), 0, 0, 2)[2];
    check(`U6 ${id} full flaps and no mix in the manual: the elevator stays centred`,
      withMix === 0 && noMix === 0, `${f2(deg(withMix))} and ${f2(deg(noMix))} deg`);
  }
  const lead = lim.ballastG;
  const same = balance(id, { ballastG: lead }, massKg, packKg).shift;
  const withLead = block({ ballastG: lead });
  const noLead = cgOnly(same);
  const qLead = rateStep(id, withLead, [0, 1, 0, 0.5], 12);
  const qNone = rateStep(id, noLead, [0, 1, 0, 0.5], 12);
  check(`U6 ${id} ${lead} g of nose lead pitches up slower than the same CG without it`, qLead < qNone,
    `${f2(deg(qLead))} and ${f2(deg(qNone))} deg/s`);

  /* U7. A glider with no motor (no POWER entry, the DLG): the stand
   * reads nothing at any throttle, and that is all there is to check. */
  if (!POWER[id]) {
    stand.seat(TABLE[id].simId);
    stand.setThrottle(1);
    stand.steps(1);
    const r0 = stand.reading();
    check(`U7 ${id} no motor: full throttle on the stand makes no thrust, turns nothing and draws nothing`,
      r0.thrustN === 0 && r0.rpm === 0 && r0.currentA === 0, `${r0.thrustN} N, ${r0.rpm} rpm, ${r0.currentA} A`);
    continue;
  }
  const o = POWER[id][0];
  const opt = powerOption(id, o.id);
  /* The first step, on the pack as it was seated: the table's figures
   * exactly. The pack sags from there, which the stand shows. A ducted
   * fan (the option's `fan`) makes nothing on its first step: its speed
   * lags the stick, so it is read once it has spooled, three seconds on,
   * where its thrust and current are its speed's square and cube of the
   * table's, off a pack sagged a little under them. */
  const spoolSteps = opt.fan ? 3000 : 1;
  stand.seat(TABLE[id].simId);
  stand.setThrottle(1);
  stand.steps(spoolSteps);
  const r = stand.reading();
  /* 0.85 of the no load rpm at full throttle, the plant's rule for both
   * kinds (a glow option's rpmNoLoad is its full rpm over 0.85). */
  const rpmFull = 0.85 * opt.rpmNoLoad;
  if (opt.fan) {
    const n = r.rpm / rpmFull;
    check(`U7 ${id} the stand reads the fan's static thrust, rpm and current at full throttle once it has spooled`,
      n > 0.95 && n <= 1 && Math.abs(r.thrustN / (opt.thrustN * n * n) - 1) < 1e-9 && Math.abs(r.currentA / (opt.currentA * n * n * n) - 1) < 0.05,
      `${f2(r.thrustN)} N, ${r.rpm.toFixed(0)} rpm (${n.toFixed(4)} of full), ${f2(r.currentA)} A`);
  } else {
    check(`U7 ${id} the stand reads the plant's static thrust, rpm and current at full throttle`,
      Math.abs(r.thrustN / opt.thrustN - 1) < 1e-9 && Math.abs(r.rpm / rpmFull - 1) < 1e-9
        && (electric ? Math.abs(r.currentA / opt.currentA - 1) < 1e-9 : r.currentA === 0),
      `${f2(r.thrustN)} N, ${r.rpm.toFixed(0)} rpm, ${f2(r.currentA)} A`);
  }
  stand.seat(TABLE[id].simId, null, block({ ballastG: lead }));
  stand.setThrottle(1);
  stand.steps(spoolSteps);
  const rl = stand.reading();
  check(`U7 ${id} lead on it changes none of them`, rl.thrustN === r.thrustN && rl.rpm === r.rpm && rl.currentA === r.currentA);
  const cells = electric ? powerBlock(id, o.id, o.pack)[3] : 0;
  const run = (th) => {
    let e = null;
    while (!(e = stand.endurance(th, cells, 200000))) { /* run on */ }
    return e;
  };
  stand.seat(TABLE[id].simId);
  const eFull = run(1);
  const eHalf = run(0.5);
  check(`U7 ${id} it runs longer at half throttle than at full`, eHalf.seconds > eFull.seconds,
    `${f2(eFull.seconds / 60)} min (${eFull.why}) and ${f2(eHalf.seconds / 60)} min (${eHalf.why})`);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  process.exitCode = 1;
}
