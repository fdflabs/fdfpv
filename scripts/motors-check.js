/*
 * motors-check.js: every quad's motors against their data and the plant,
 * docs/MOTORS-STAGE1.md. For each quad in configs/motors.js:
 *
 *   M1 the table configs/motors.js restates is the module's own entry,
 *      its prop's pitch and figure of merit with it;
 *   M2 the stock motor seated through sim_set_motors flies a trace bit
 *      identical to the table's, and sim_power_clear puts the table back
 *      bit for bit, so the stock aircraft is untouched;
 *   M3 each upgrade reaches the plant: the module reports the block's
 *      mass, inertia, ke, resistance and rotor inertia, and the rotor's
 *      full throttle speed standing is the static solve's;
 *   M4 each upgrade's thrust over the stock motor's, flown on the plant,
 *      is the maker's bench ratio within the band the doc argues;
 *   M5 each upgrade hovers where the static solve puts it, lower up the
 *      stick than stock, and its thrust to weight is higher;
 *   M6 each upgrade's top speed, flown level at full throttle, is the
 *      hangar's estimate (configs/motor-estimates.js) and above stock's;
 *   M7 the pack pays: an upgrade's full throttle current is higher and its
 *      loaded cell voltage lower than stock's, flown, and where it passes
 *      the pack's or the ESC's published limit it says so;
 *   M8 its rotor's time constant stays in the 10 to 60 ms of a real motor
 *      on that prop, measured as check 8 measures it;
 *   M9 the contract: refused on a fixed wing and out of range, a MODE
 *      kept across sim_reset, cleared by another airframe, deterministic.
 *
 * and for each prop and pack the hangar offers, on the stock motor:
 *
 *   P1 the stock prop and pack through sim_set_prop_pack fly a trace bit
 *      identical to the table's, curves and all, and each offered one
 *      reaches the plant: mass, inertia, kt, kq, pitch, figure of merit,
 *      cells, a cell's resistance and the rotor's inertia;
 *   P2 it hovers where the static solve puts it;
 *   P3 a prop's thrust over the stock prop's, flown on the plant's motor
 *      model on the maker's stand, is the maker's within the band;
 *   P4 a pack's full throttle current against its maker's rating, the sag
 *      it is paid in said;
 *   P5 the contract: the block refused on a wing, out of range and with a
 *      curve not starting at 1, and a clear takes it off;
 *
 * and E, every motor, prop and pack together, flown level at full
 * throttle, is the hangar's top speed (configs/motor-estimates.js).
 *
 * Run with npm run motors:check. With --estimates it flies every choice's
 * top speed instead and writes configs/motor-estimates.js.
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
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSim, SIM_OK, SIM_ERR_BAD_ARG } from '../tests/lib/simmod.js';
import { ST } from '../tests/lib/replay.js';
import { airframeById } from '../configs/airframes.js';
import {
  MOTORS, SIM_MOTORS, SIM_MOTORS_DOUBLES, SIM_PROP_PACK, choiceKey, motorBench, motorStats, motorsBlock, propPackBlock, propPackDoubles,
  propRatios, quadChoices, quadPlant,
} from '../configs/motors.js';
import { MOTOR_ESTIMATES } from '../configs/motor-estimates.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const ESTIMATE = process.argv.includes('--estimates');

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
function note(name, detail) {
  console.log(`  note  ${name}  (${detail})`);
}
const RAD_PER_RPM = (2 * Math.PI) / 60;
const near = (a, b, rel) => Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b));

const wasm = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const tunes = {};
async function tune(af) {
  tunes[af.id] ??= await readFile(join(root, `configs/${af.defaultTune}.diff`), 'utf8');
  return tunes[af.id];
}

function must(code, where) {
  if (code !== SIM_OK) {
    throw new Error(`${where}: the module returned ${code}`);
  }
}

/* What a choice seats: its two blocks, either null where it is stock. */
const seatOf = (id, choice) => ({ motors: motorsBlock(id, choice), propPack: propPackBlock(id, choice) });

/* The shell's order: airframe, init, the motors, the prop and pack,
 * reset, a fresh pack. `seat` is null or { motors, propPack }. At 1 g,
 * the machine's real weight, where the makers' figures are, unless `g`
 * says otherwise. */
async function fresh(af, seat, g = 1) {
  const sim = await loadSim(wasm);
  must(sim.e.sim_set_airframe(af.simId), 'sim_set_airframe');
  must(sim.init(await tune(af)), 'sim_init');
  must(sim.e.sim_set_gravity(g), 'sim_set_gravity');
  if (seat && seat.motors) {
    must(sim.setMotors(seat.motors), 'sim_set_motors');
  }
  if (seat && seat.propPack) {
    must(sim.setPropPack(seat.propPack), 'sim_set_prop_pack');
  }
  sim.reset();
  must(sim.setCellVoltage(4.2), 'sim_set_cell_voltage');
  return sim;
}

function fly(sim, segs, onStep, startMs = 0) {
  let t = startMs;
  let nextRc = startMs;
  for (const seg of segs) {
    const end = t + seg.ms;
    while (t < end) {
      while (nextRc <= t) {
        sim.input(nextRc / 1000, seg.roll ?? 0, seg.pitch ?? 0, seg.yaw ?? 0, seg.thr ?? 0);
        nextRc += 4;
      }
      sim.step(1);
      t += 1;
      if (onStep) {
        onStep(t, sim.readState().state);
      }
    }
  }
  return t;
}

function traceHash(sim) {
  const h = createHash('sha256');
  fly(sim, [{ ms: 1500, thr: 0.4 }, { ms: 800, roll: 0.4, pitch: -0.3, thr: 0.6 }, { ms: 700, thr: 1.0 }], (t, s) => {
    h.update(new Uint8Array(Float64Array.from(s).buffer));
  });
  return h.digest('hex').slice(0, 16);
}

/* The throttle that holds a steady hover, tests/lib/checks.js's bisection. */
async function trimHover(af, seat) {
  let lo = 0;
  let hi = 1;
  let best = 0.5;
  for (let i = 0; i < 24; i += 1) {
    const mid = 0.5 * (lo + hi);
    const sim = await fresh(af, seat);
    let vz = 0;
    fly(sim, [{ ms: 2000, thr: mid }], (t, s) => { vz = s[ST.VZ]; });
    best = mid;
    if (vz > 0) {
      hi = mid;
    } else {
      lo = mid;
    }
    if (Math.abs(vz) < 0.02) {
      break;
    }
  }
  return best;
}

/* Every motor at full duty with the craft held still (sim_rest every
 * step, so no inflow): the standing operating point a bench measures.
 * The mean rotor speed, rad/s, the pack's current and its loaded volts a
 * cell over the last 100 ms. */
async function standing(af, seat) {
  const sim = await fresh(af, seat);
  must(sim.e.sim_motor_override(-1, 1.0), 'sim_motor_override');
  let w = 0;
  let amps = 0;
  let volts = 0;
  let n = 0;
  for (let t = 0; t < 600; t += 1) {
    sim.e.sim_rest();
    sim.step(1);
    if (t >= 500) {
      const s = sim.readState().state;
      /* The state carries rotor speed in rpm. */
      w += ((s[ST.RPM0] + s[ST.RPM1] + s[ST.RPM2] + s[ST.RPM3]) / 4) * RAD_PER_RPM;
      amps += s[ST.AMPS];
      volts += s[ST.VBAT];
      n += 1;
    }
  }
  return { w: w / n, amps: amps / n, cellV: volts / n / af.cells };
}

/*
 * The rotor's time constant, measured exactly as the stock motor's class
 * is measured, so the band means what it means there. 'check8' is
 * tests/lib/checks.js check 8 on the five inch: every motor held at zero
 * for 200 ms, motor 0 to full, the time to 63 percent of its speed a
 * second later. 'step' is scripts/combat-gates.js motor-tau on the combat
 * quads: every motor at the hover's duty for 600 ms, motor 0 up a tenth,
 * the time to 63 percent of the rise over 1.5 s.
 */
async function stepTau(af, seat, hover, measure) {
  const [from, to, holdMs, settleMs] = measure === 'check8' ? [0, 1, 200, 1000] : [hover, hover + 0.1, 600, 1500];
  const sim = await fresh(af, seat);
  must(sim.e.sim_motor_override(-1, from), 'sim_motor_override');
  const t = fly(sim, [{ ms: holdMs, thr: 0 }]);
  const w0 = sim.readState().state[ST.RPM0];
  must(sim.e.sim_motor_override(0, to), 'sim_motor_override');
  const ws = [];
  fly(sim, [{ ms: settleMs, thr: 0 }], (tt, s) => { ws.push(s[ST.RPM0]); }, t);
  const w1 = ws[ws.length - 1];
  return (ws.findIndex((w) => w - w0 >= 0.63 * (w1 - w0)) + 1) / 1000;
}

/*
 * Level speed at full throttle: from a hover, full throttle with the nose
 * held down by a harness pilot that trims the pitch angle until the craft
 * neither climbs nor sinks, then the speed it settles at. scripts/
 * combat-gates.js levelTop, the figure configs/airframes.js topSpeed is.
 * Flown at the weight the shell flies the machine at (gravityBase: 1.62 g
 * on the five inch, 1 g on the combat quads), since it is the speed the
 * pilot will see. 45 s, the last 3 averaged, as combat-gates flies it.
 */
async function levelTop(af, seat) {
  const sim = await fresh(af, seat, af.gravityBase);
  let theta = 1.1;
  let nextRc = 0;
  let sum = 0;
  let n = 0;
  for (let t = 0; t < 45000; t += 1) {
    const s = sim.readState().state;
    const [w, x, y, z] = [s[ST.QW], s[ST.QX], s[ST.QY], s[ST.QZ]];
    const nose = -Math.asin(Math.max(-1, Math.min(1, 2 * (x * z - w * y))));
    const bank = Math.asin(Math.max(-1, Math.min(1, 2 * (y * z + w * x))));
    if (t > 1000) {
      theta = Math.max(0, Math.min(1.45, theta + 0.00004 * s[ST.VZ]));
    }
    if (nextRc <= t) {
      const want = t < 1000 ? 0 : theta;
      const pitch = Math.max(-1, Math.min(1, -(2.5 * (want - nose) - 0.05 * s[ST.Q])));
      const roll = Math.max(-1, Math.min(1, -2.5 * bank));
      sim.input(nextRc / 1000, roll, pitch, 0, t < 1000 ? 0.4 : 1.0);
      nextRc += 4;
    }
    sim.step(1);
    if (t >= 42000) {
      const st = sim.readState().state;
      sum += Math.hypot(st[ST.VX], st[ST.VY]);
      n += 1;
    }
  }
  return sum / n;
}

/* The stock motor as a block, the table's own values: what M2 seats. */
function stockBlock(id) {
  const p = quadPlant(id, MOTORS[id].options[0].id);
  const out = new Float64Array(SIM_MOTORS_DOUBLES);
  out[SIM_MOTORS.MASS] = p.massKg;
  out[SIM_MOTORS.IXX] = p.inertia[0];
  out[SIM_MOTORS.IYY] = p.inertia[1];
  out[SIM_MOTORS.IZZ] = p.inertia[2];
  out[SIM_MOTORS.KE] = p.ke;
  out[SIM_MOTORS.R] = p.rMotor;
  out[SIM_MOTORS.J_ROTOR] = p.jRotor;
  return out;
}

const r2 = (v) => Math.round(v * 100) / 100;

if (ESTIMATE) {
  const out = {};
  for (const id of Object.keys(MOTORS)) {
    const af = airframeById(id);
    out[id] = {};
    for (const c of quadChoices(id)) {
      const key = choiceKey(c);
      out[id][key] = r2(await levelTop(af, seatOf(id, c)));
      console.log(`  ${id} ${key}: ${out[id][key]} m/s`);
    }
  }
  const text = `/*
 * motor-estimates.js: GENERATED by node scripts/motors-check.js
 * --estimates; do not edit. Each quad choice's top speed, m/s, keyed by
 * its motor, prop and pack (configs/motors.js choiceKey), level at full
 * throttle on a fresh pack at the weight the shell flies the quad at
 * (configs/airframes.js gravityBase), flown on the plant
 * (docs/MOTORS-STAGE1.md). npm run motors:check M6 and E hold every
 * choice to it.
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

export const MOTOR_ESTIMATES = ${JSON.stringify(out, null, 2).replace(/"([a-z0-9_.-]+)":/gi, (m, k) => (/^[a-z_][a-z0-9_]*$/i.test(k) ? `${k}:` : `'${k}':`))};
`;
  await writeFile(join(root, 'configs/motor-estimates.js'), text);
  console.log('wrote configs/motor-estimates.js');
  process.exit(0);
}

for (const [id, m] of Object.entries(MOTORS)) {
  const af = airframeById(id);
  const t = m.table;
  const stock = m.options[0];
  console.log(`\n${id}: ${stock.detail} stock, ${m.options.length - 1} upgrades`);

  /* M1 */
  {
    const sim = await fresh(af, null);
    const d = (k) => sim.e.sim_bf_debug(k);
    const got = [d(51), d(55), d(56), d(57), d(10), d(11), d(62), d(61), d(60), d(63), d(54), d(77), d(76)];
    const want = [t.massKg, ...t.inertia, t.kt, t.kq, t.ke, t.rMotor, t.jRotor, t.rCell, t.cells, t.kInflow, t.fm];
    check(`M1 ${id} the table restated is the module's`, got.every((g, k) => g === want[k]), got.map((v) => v.toPrecision(5)).join(' '));
    check(`M1 ${id} the restated mass is the picker's grams`, Math.abs(af.grams / 1000 - t.massKg) < 5e-4, `${af.grams} g`);
  }

  /* M2 */
  {
    const table = traceHash(await fresh(af, null));
    const seated = await fresh(af, { motors: stockBlock(id), propPack: null });
    const on = seated.powerState().custom;
    const viaBlock = traceHash(seated);
    const cleared = await fresh(af, seatOf(id, m.options[m.options.length - 1].id));
    must(cleared.clearPower(), 'sim_power_clear');
    cleared.reset();
    must(cleared.setCellVoltage(4.2), 'sim_set_cell_voltage');
    const back = traceHash(cleared);
    check(`M2 ${id} the stock motor through sim_set_motors is the table, bit for bit`, viaBlock === table && on, `${viaBlock} ${table}`);
    check(`M2 ${id} sim_power_clear puts the table back, bit for bit`, back === table, back);
    check(`M2 ${id} the stock choice is no block`, motorsBlock(id, stock.id) === null);
  }

  const st0 = motorStats(id, stock.id);
  const hover0 = await trimHover(af, null);
  const bench0 = await standing(af, null);
  const top0 = await levelTop(af, null);
  const tau0 = await stepTau(af, null, hover0, m.tau.measure);
  check(`M5 ${id} stock hovers where the static solve puts it`, Math.abs(hover0 - st0.hover.duty) < 0.01, `${hover0.toFixed(3)} flown, ${st0.hover.duty.toFixed(3)} solved`);
  const estimate = (o) => MOTOR_ESTIMATES[id][choiceKey({ option: o, prop: m.props[0].id, pack: m.packs[0].id })];
  check(`M6 ${id} stock top speed is the estimate`, Math.abs(top0 - estimate(stock.id)) < 0.05, `${top0.toFixed(2)} m/s`);
  note(`${id} stock`, `T/W ${st0.tw.toFixed(2)}, ${(bench0.amps).toFixed(0)} A full, ${bench0.cellV.toFixed(2)} V a cell, hover ${st0.hoverMin.toFixed(1)} min, full ${st0.fullMin.toFixed(2)} min`);

  for (const o of m.options.slice(1)) {
    const seat = seatOf(id, o.id);
    const block = seat.motors;
    const st = motorStats(id, o.id);
    const name = `${id} ${o.id}`;

    /* M3 */
    {
      const sim = await fresh(af, seat);
      const d = (k) => sim.e.sim_bf_debug(k);
      const got = [d(51), d(55), d(56), d(57), d(62), d(61), d(60), d(10), d(11)];
      const want = [...block.slice(0, 4), block[SIM_MOTORS.KE], block[SIM_MOTORS.R], block[SIM_MOTORS.J_ROTOR], t.kt, t.kq];
      check(`M3 ${name} reaches the plant`, got.every((g, k) => g === want[k]), `${(got[0] * 1000).toFixed(0)} g, ke ${got[4].toPrecision(4)}, R ${got[5].toPrecision(4)}, J ${got[6].toPrecision(3)}`);
    }
    const bench = await standing(af, seat);
    /* Over stock's, flown and solved: the static solve leaves out what
     * the plant adds standing near the floor (the combat quads' ground
     * effect and inflow), which is the same on both motors and is
     * reported here, while the upgrade's own move must be the solve's. */
    check(`M3 ${name} its rotor's full throttle speed over stock's is the static solve's`, near(bench.w / bench0.w, st.full.w / st0.full.w, 0.005),
      `${(bench.w / bench0.w).toFixed(4)} flown, ${(st.full.w / st0.full.w).toFixed(4)} solved; ${bench.w.toFixed(0)} rad/s flown, ${st.full.w.toFixed(0)} solved, stock ${bench0.w.toFixed(0)} and ${st0.full.w.toFixed(0)}`);
    if (m.propMaxRpm) {
      const rpm = (bench.w * 60) / (2 * Math.PI);
      check(`M3 ${name} turns its prop under the prop maker's limit`, rpm <= m.propMaxRpm,
        `${rpm.toFixed(0)} rpm at full throttle standing, limit ${m.propMaxRpm.toFixed(0)}`);
    }

    /* M4: on the maker's stand, a stiff supply at the maker's volts,
     * through the derivation M3 holds the plant to. */
    if (o.pair) {
      const ratio = motorBench(id, o, o.bench.volts).thrustN / motorBench(id, o.pair, o.pair.bench.volts).thrustN;
      const maker = o.bench.grams / o.pair.bench.grams;
      check(`M4 ${name} its thrust over the maker's stock class motor is the maker's`, ratio > 1 && Math.abs(ratio / maker - 1) <= m.benchBand,
        `${ratio.toFixed(3)} derived, ${maker.toFixed(3)} on ${o.bench.prop} (${o.bench.grams} g over ${o.pair.bench.grams} g, ${o.pair.detail}), band ${(100 * m.benchBand).toFixed(0)} percent`);
    } else {
      note(`M4 ${name}`, `no stock class motor on the same stand and a prop of the plant's class is published; ${o.detail} on ${o.bench.prop}: ${o.bench.grams} g at ${o.bench.amps} A, ${o.bench.volts} V`);
    }

    /* M5 */
    {
      const hover = await trimHover(af, seat);
      check(`M5 ${name} hovers where the static solve puts it`, Math.abs(hover - st.hover.duty) < 0.01, `${hover.toFixed(3)} flown, ${st.hover.duty.toFixed(3)} solved`);
      check(`M5 ${name} hovers lower up the stick than stock and out climbs it`, hover < hover0 && st.tw > st0.tw,
        `hover ${hover.toFixed(3)} against ${hover0.toFixed(3)}, T/W ${st.tw.toFixed(2)} against ${st0.tw.toFixed(2)}`);
      const tau = await stepTau(af, seat, hover, m.tau.measure);
      check(`M8 ${name} rotor time constant is in its class's band`, tau >= m.tau.band[0] && tau <= m.tau.band[1],
        `${(tau * 1000).toFixed(1)} ms flown against stock's ${(tau0 * 1000).toFixed(1)}, band ${m.tau.band[0] * 1000} to ${m.tau.band[1] * 1000} ms, ${m.tau.measure}`);
    }

    /* M6 */
    {
      const top = await levelTop(af, seat);
      check(`M6 ${name} top speed is the estimate and above stock's`, Math.abs(top - estimate(o.id)) < 0.05 && top > top0,
        `${top.toFixed(2)} m/s against ${top0.toFixed(2)}`);
    }

    /* M7 */
    {
      check(`M7 ${name} draws more and sags harder than stock at full throttle`, bench.amps > bench0.amps && bench.cellV < bench0.cellV,
        `${bench.amps.toFixed(0)} A, ${bench.cellV.toFixed(2)} V a cell against ${bench0.amps.toFixed(0)} A, ${bench0.cellV.toFixed(2)} V`);
      const perMotor = bench.amps / 4;
      const packLimit = m.packs[0].maxA;
      const over = [];
      if (perMotor > o.maxA) {
        over.push(`the motor's ${o.maxA} A peak`);
      }
      if (perMotor > m.esc.amps) {
        over.push(`the ESC's ${m.esc.amps} A`);
      }
      if (bench.amps > packLimit) {
        over.push(`the pack's ${packLimit} A`);
      }
      note(`M7 ${name}`, `${perMotor.toFixed(0)} A a motor standing, ${bench.amps.toFixed(0)} A from the pack; ${over.length ? `past ${over.join(', ')}, paid in sag` : 'inside every published limit'}; hover ${st.hoverMin.toFixed(1)} min, full ${st.fullMin.toFixed(2)} min`);
    }
  }

  /* P1 to P5: the props and the packs, each on the stock motor. */
  {
    const base = { option: stock.id, prop: m.props[0].id, pack: m.packs[0].id };
    const viaBlock = traceHash(await fresh(af, { motors: stockBlock(id), propPack: propPackDoubles(id, base) }));
    const table = traceHash(await fresh(af, null));
    check(`P1 ${id} the stock prop and pack through sim_set_prop_pack are the table, curves and all, bit for bit`, viaBlock === table, `${viaBlock} ${table}`);
    check(`P1 ${id} the stock prop and pack are no block`, propPackBlock(id, base) === null);
    const fmTable = (await fresh(af, null)).e.sim_bf_debug(12);
    note(`${id} figure of merit`, `${t.fm} in the table, ${fmTable.toFixed(4)} from its kt and kq on the plant's disc`);
  }
  const parts = [
    ...m.props.slice(1).map((p) => ({ kind: 'prop', item: p, choice: { option: stock.id, prop: p.id, pack: m.packs[0].id } })),
    ...m.packs.slice(1).map((k) => ({ kind: 'pack', item: k, choice: { option: stock.id, prop: m.props[0].id, pack: k.id } })),
  ];
  for (const { kind, item, choice } of parts) {
    const name = `${id} ${kind} ${item.id}`;
    const seat = seatOf(id, choice);
    const p = quadPlant(id, choice);
    const st = motorStats(id, choice);
    {
      const sim = await fresh(af, seat);
      const d = (k) => sim.e.sim_bf_debug(k);
      const got = [d(51), d(55), d(56), d(57), d(10), d(11), d(77), d(76), d(54), d(63), d(60)];
      const want = [p.massKg, ...p.inertia, p.kt, p.kq, p.kInflow, p.fm, p.cells, p.rCell, p.jRotor];
      check(`P1 ${name} reaches the plant`, got.every((g, k) => g === want[k]),
        `${(got[0] * 1000).toFixed(1)} g, kt ${got[4].toPrecision(4)}, kq ${got[5].toPrecision(4)}, pitch ${got[6].toPrecision(4)} m/rad, FM ${got[7].toFixed(4)}, ${(got[9] * 1000).toFixed(2)} mOhm a cell`);
    }
    const hover = await trimHover(af, seat);
    check(`P2 ${name} hovers where the static solve puts it`, Math.abs(hover - st.hover.duty) < 0.01, `${hover.toFixed(3)} flown, ${st.hover.duty.toFixed(3)} solved`);
    const bench = await standing(af, seat);
    if (kind === 'prop') {
      const s = item.stand;
      const ratio = motorBench(id, { option: s.option, prop: item.id }, s.prop.volts).thrustN
        / motorBench(id, { option: s.option, prop: m.props[0].id }, s.stock.volts).thrustN;
      const maker = s.prop.grams / s.stock.grams;
      const r = propRatios(item);
      check(`P3 ${name} its thrust over the stock prop's on the maker's stand is the maker's`, Math.abs(ratio / maker - 1) <= m.benchBand,
        `${ratio.toFixed(3)} derived, ${maker.toFixed(3)} measured (${s.prop.grams} g over ${s.stock.grams} g on ${s.option}), kt x${r.kt.toFixed(4)}, kq x${r.kq.toFixed(4)}, band ${(100 * m.benchBand).toFixed(0)} percent`);
    } else {
      const over = bench.amps > item.maxA;
      note(`P4 ${name}`, `${bench.amps.toFixed(0)} A standing against its maker's ${item.maxA} A, ${bench.cellV.toFixed(2)} V a cell (stock pack ${m.packs[0].maxA} A); ${over ? 'past its rating, paid in sag' : 'inside its rating'}`);
    }
    note(`${name}`, `${(st.massKg * 1000).toFixed(0)} g, T/W ${st.tw.toFixed(2)}, hover ${st.hover.duty.toFixed(3)}, ${bench.amps.toFixed(0)} A full, hover ${st.hoverMin.toFixed(1)} min, full ${st.fullMin.toFixed(2)} min, top ${MOTOR_ESTIMATES[id][choiceKey(choice)]} m/s`);
  }

  /* P5 */
  if (parts.length) {
    const block = propPackDoubles(id, parts[0].choice);
    const sim = await fresh(af, { motors: motorsBlock(id, parts[0].choice), propPack: block });
    sim.reset();
    const kept = sim.e.sim_bf_debug(10) === block[SIM_PROP_PACK.KT] && sim.e.sim_bf_debug(63) === block[SIM_PROP_PACK.R_CELL];
    const bad = (k, v) => {
      const b = Float64Array.from(block);
      b[k] = v;
      return sim.setPropPack(b) === SIM_ERR_BAD_ARG;
    };
    const refused = bad(SIM_PROP_PACK.KT, 0) && bad(SIM_PROP_PACK.FM, 1.2) && bad(SIM_PROP_PACK.AXIAL, 0.99) && bad(SIM_PROP_PACK.TORQUE + 3, 2.5);
    must(sim.clearPower(), 'sim_power_clear');
    const cleared = sim.e.sim_bf_debug(10) === t.kt && sim.e.sim_bf_debug(63) === t.rCell && sim.e.sim_bf_debug(76) === t.fm;
    must(sim.e.sim_set_airframe(airframeById('timber1500').simId), 'sim_set_airframe');
    const wingRefused = sim.setPropPack(block) === SIM_ERR_BAD_ARG;
    check(`P5 ${id} the prop and pack are kept across sim_reset, refused out of range, off a curve's 1 and on a wing, and cleared`,
      kept && refused && cleared && wingRefused, `${kept} ${refused} ${cleared} ${wingRefused}`);
  }

  /* E: every motor, prop and pack together. */
  {
    const off = [];
    let worst = 0;
    const rows = [];
    for (const c of quadChoices(id)) {
      const key = choiceKey(c);
      const top = await levelTop(af, seatOf(id, c));
      const d = Math.abs(top - MOTOR_ESTIMATES[id][key]);
      worst = Math.max(worst, d);
      if (!(d < 0.05)) {
        off.push(`${key} ${top.toFixed(2)} against ${MOTOR_ESTIMATES[id][key]}`);
      }
      rows.push(`${key} ${top.toFixed(2)}`);
    }
    check(`E ${id} every one of its ${rows.length} choices flies its estimated top speed`, off.length === 0,
      off.length ? off.join('; ') : `worst ${worst.toFixed(3)} m/s off`);
  }

  /* M9 */
  {
    const up = motorsBlock(id, m.options[1].id);
    const a = traceHash(await fresh(af, { motors: up }));
    const b = traceHash(await fresh(af, { motors: up }));
    const table = traceHash(await fresh(af, null));
    check(`M9 ${id} an upgrade flies deterministically and not as the table`, a === b && a !== table, `${a} ${b}`);
    const sim = await fresh(af, { motors: up });
    sim.reset();
    const kept = sim.e.sim_bf_debug(62) === up[SIM_MOTORS.KE];
    must(sim.e.sim_set_airframe(airframeById('timber1500').simId), 'sim_set_airframe');
    const wingRefused = sim.setMotors(up) === SIM_ERR_BAD_ARG;
    must(sim.e.sim_set_airframe(af.simId), 'sim_set_airframe');
    const dropped = sim.e.sim_bf_debug(62) === t.ke;
    const bad = Float64Array.from(up);
    bad[SIM_MOTORS.KE] = 0;
    const rangeRefused = sim.setMotors(bad) === SIM_ERR_BAD_ARG;
    check(`M9 ${id} kept across sim_reset, refused on a wing and out of range, dropped by another airframe`,
      kept && wingRefused && dropped && rangeRefused, `${kept} ${wingRefused} ${dropped} ${rangeRefused}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
