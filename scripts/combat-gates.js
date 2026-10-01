/*
 * combat-gates.js: the combat quads, plants 24 and 25 (docs/COMBAT-DRONES.md),
 * flown on the real module against figures from outside this repository,
 * and their payloads held to what a payload has to do: make the machine
 * heavier, measurably, and nothing when there is none.
 *
 * Like scripts/whoop-gates.js and not in tests/, because every band in
 * tests/ was fitted to the five inch and tests/ is the harness's. A band
 * here names where it came from; a gate that fails is the plant being
 * wrong, not the band.
 *
 * Run it with `npm run combat:gates`. It costs a few seconds.
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
import { isDeepStrictEqual } from 'node:util';
import { loadSim, SIM_OK, SIM_ERR_BAD_ARG, SIM_ERR_BAD_STATE } from '../tests/lib/simmod.js';
import { ST } from '../tests/lib/replay.js';
import { AIRFRAMES, airframeById } from '../configs/airframes.js';
import { combatAddon, combatChoice, payloadForWarhead, warPayload } from '../configs/combat.js';
import { deriveCombat } from './combat-derive.js';
import { WARHEADS } from '../edge/rooms/war.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const G = 9.80665;
const DEG = 180 / Math.PI;
const RPM = 60 / (2 * Math.PI);

/*
 * The bands, per quad, and their sources. "Pilots report" figures are
 * build logs and reviews of 7 and 10 inch long range machines on 6S
 * Li-ion; the stand figures are the motor makers' published tables.
 */
const BANDS = {
  '7inch': {
    'figure-of-merit': { min: 0.50, max: 0.65, unit: '', why: 'A 7 inch three blade at chord Reynolds numbers near 6e4: above the 5 inch triblade\'s 0.52, below a clean two blade\'s 0.65 (Harris NASA/CR-20205001147).' },
    'hover-bare': { min: 0.25, max: 0.38, unit: 'of stick', why: 'Pilots report a 7 inch long range build on 6S1P Li-ion hovering at a quarter to a third of the stick.' },
    'thrust-to-weight': { min: 4.0, max: 6.5, unit: ': 1', why: 'Stand thrust of four 2806.5 on 7 inch tri blades, 7 to 8 kgf, over a 0.95 to 1.1 kg build, less the Li-ion sag.' },
    'motor-tau': { min: 0.020, max: 0.060, unit: 's', why: 'j R / ke^2 for a 2806.5 bell and a 9 g 7 inch prop is 30 to 45 ms: slower than a 5 inch\'s by the prop. Measured as the small step a flight controller asks for, from the hover up a tenth of the stick, since that is what the loop lives on.' },
    'punch-sag': { min: 2.6, max: 3.4, unit: 'V a cell', why: 'A 6S1P 21700 at 60 to 80 A: 16 mOhm a cell drops a fresh cell to about 3 V, which is why Li-ion is flown gently.' },
    'roll-step': { min: 0, max: 0.35, unit: 'overshoot', why: 'A half stick roll step on stock 4.5.1 settles: overshoot under a third, and back to rest after the stick centres.' },
  },
  '10inch': {
    'figure-of-merit': { min: 0.52, max: 0.68, unit: '', why: 'A 10 inch three blade runs at a higher Reynolds number still than the 7 inch.' },
    'hover-bare': { min: 0.22, max: 0.36, unit: 'of stick', why: 'Pilots report a 10 inch on 6S2P Li-ion hovering at a quarter to a third of the stick, unloaded.' },
    'thrust-to-weight': { min: 3.5, max: 6.0, unit: ': 1', why: 'Stand thrust of four 3115 on 10 inch tri blades, 13 to 15 kgf, over a 1.8 to 2.1 kg build, less the sag.' },
    'motor-tau': { min: 0.050, max: 0.110, unit: 's', why: 'A 10 inch prop is five times the 7 inch\'s inertia on a motor with twice the torque constant: j R / ke^2 is 70 to 90 ms. The same small step as the 7 inch.' },
    'punch-sag': { min: 2.5, max: 3.4, unit: 'V a cell', why: 'A 6S2P 21700 at 120 to 150 A is 60 to 75 A a cell pair, the 7 inch\'s load on each.' },
    'roll-step': { min: 0, max: 0.35, unit: 'overshoot', why: 'The same as the 7 inch: stock 4.5.1 overshoots a heavy slow quad more, and must still settle.' },
  },
};

const results = [];
function report(id, pass, measured = '', extra = '') {
  results.push({ id, pass, measured, extra });
}
function band(quad, key, value, fmt = (v) => v.toFixed(3)) {
  const b = BANDS[quad][key];
  const ok = value >= b.min && value <= b.max;
  report(`${quad} ${key}`, ok, `${fmt(value)} ${b.unit}`.trim(), `band ${b.min} to ${b.max}`);
  return ok;
}

const wasm = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const tuneText = {};
async function tune(id) {
  tuneText[id] ??= await readFile(join(root, `configs/${id}.diff`), 'utf8');
  return tuneText[id];
}

function setBlock(sim, fn, values) {
  const ptr = sim.e.malloc(values.length * 8);
  new Float64Array(sim.e.memory.buffer, ptr, values.length).set(values);
  const rc = sim.e[fn](ptr);
  sim.e.free(ptr);
  return rc;
}

/* The shell's order: airframe, init, the add-ons and their spread, reset. */
async function fresh(af, choice, cellV = 4.2) {
  const sim = await loadSim(wasm);
  if (sim.e.sim_set_airframe(af.simId) !== SIM_OK) {
    throw new Error(`sim_set_airframe(${af.simId}) refused`);
  }
  if (sim.init(await tune(af.defaultTune)) !== SIM_OK) {
    throw new Error('sim_init failed');
  }
  const add = choice ? combatAddon(af, choice) : null;
  if (add) {
    if (sim.setAddons(add.block) !== SIM_OK || setBlock(sim, 'sim_set_addon_inertia', add.inertia) !== SIM_OK) {
      throw new Error(`the add-ons for ${JSON.stringify(choice)} were refused`);
    }
  }
  sim.reset();
  sim.setCellVoltage(cellV);
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

/* The throttle that holds a steady hover, tests/lib/checks.js's bisection. */
async function trimHover(af, choice) {
  let lo = 0;
  let hi = 1;
  let best = 0.5;
  for (let i = 0; i < 24; i += 1) {
    const mid = 0.5 * (lo + hi);
    const sim = await fresh(af, choice);
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

/* Height gained in two seconds of full throttle from a hover. */
async function climb(af, choice, hover) {
  const sim = await fresh(af, choice);
  let z0 = 0;
  let z1 = 0;
  const t = fly(sim, [{ ms: 2000, thr: hover }], (tt, s) => { z0 = s[ST.PZ]; });
  fly(sim, [{ ms: 2000, thr: 1.0 }], (tt, s) => { z1 = s[ST.PZ]; }, t);
  return z1 - z0;
}

function traceHash(sim, hover) {
  const h = createHash('sha256');
  fly(sim, [{ ms: 1500, thr: hover }, { ms: 800, roll: 0.4, pitch: -0.3, thr: hover + 0.1 }, { ms: 700, thr: hover }], (t, s) => {
    h.update(new Uint8Array(Float64Array.from(s).buffer));
  });
  return h.digest('hex').slice(0, 16);
}

const derived = deriveCombat();
const quads = AIRFRAMES.filter((a) => a.combat);
report('the combat quads are the derive script\'s', isDeepStrictEqual(quads.map((a) => a.id), Object.keys(derived)), quads.map((a) => a.id).join(', '));

for (const af of quads) {
  const id = af.id;
  const d = derived[id];

  /* ---- the descriptor and the table are the derivation's ---- */
  report(`${id} combat block is combat-derive's`, isDeepStrictEqual(JSON.parse(JSON.stringify(af.combat)), JSON.parse(JSON.stringify(d.combat))));
  {
    const sim = await fresh(af, null);
    const got = [sim.e.sim_bf_debug(51), sim.e.sim_bf_debug(55), sim.e.sim_bf_debug(56), sim.e.sim_bf_debug(57), sim.e.sim_bf_debug(53), sim.e.sim_bf_debug(52)];
    const want = [d.M, ...d.I, d.arm, d.motor.propR];
    const ok = got.every((g, k) => Math.abs(g - want[k]) <= 1e-4 * Math.max(1, Math.abs(want[k])) + 1e-6);
    report(`${id} plant table is combat-derive's`, ok, got.map((v) => v.toPrecision(4)).join(' '), `mass, Ixx, Iyy, Izz, arm, prop radius`);
    report(`${id} grams is the plant's mass`, Math.abs(af.grams / 1000 - got[0]) < 5e-4, `${af.grams} g`);
    band(id, 'figure-of-merit', sim.e.sim_bf_debug(12));
  }

  /* ---- the bare machine ---- */
  const hover = await trimHover(af, null);
  band(id, 'hover-bare', hover);
  report(`${id} hover is where the derivation put it`, Math.abs(hover - d.motor.hover.duty) < 0.01,
    `${hover.toFixed(3)} against ${d.motor.hover.duty.toFixed(3)}`, 'the plant and the static solve agree within 0.01');

  let fullRpm = 0;
  let sagSum = 0;
  let sagN = 0;
  {
    const sim = await fresh(af, null);
    const t = fly(sim, [{ ms: 2000, thr: hover }]);
    fly(sim, [{ ms: 2000, thr: 1.0 }], (tt, s) => {
      fullRpm = Math.max(fullRpm, 0.25 * (s[ST.RPM0] + s[ST.RPM1] + s[ST.RPM2] + s[ST.RPM3]));
      if (tt - t > 1500) {
        sagSum += s[ST.VBAT];
        sagN += 1;
      }
    }, t);
    const w = fullRpm / RPM;
    band(id, 'thrust-to-weight', (4 * d.motor.kt * w * w) / (d.M * G), (v) => v.toFixed(2));
    /* ST.VBAT is the pack's volts under load; the band is a cell's. */
    band(id, 'punch-sag', sagSum / sagN / af.cells, (v) => v.toFixed(2));
  }
  {
    /* One motor held at the hover's duty, then stepped up a tenth: the
     * time to 63 percent of the new speed. From a standstill to full is
     * reported beside it and not gated: a Li-ion pack's resistance is
     * larger than the motor's, so a cold start is the pack's sag and not
     * the motor (scripts/whoop-gates.js W7 times that one on a LiPo). */
    const step = async (from, to) => {
      const sim = await fresh(af, null);
      sim.motorOverride(-1, from);
      fly(sim, [{ ms: 600, thr: 0 }]);
      const start = sim.readState().state[ST.RPM0];
      sim.motorOverride(0, to);
      const trace = [];
      let final = 0;
      fly(sim, [{ ms: 1500, thr: 0 }], (t, s) => {
        trace.push([t - 600, s[ST.RPM0]]);
        final = s[ST.RPM0];
      }, 600);
      const hit = trace.find(([, rpm]) => rpm - start >= 0.63 * (final - start));
      return hit ? hit[0] / 1000 : NaN;
    };
    band(id, 'motor-tau', await step(hover, hover + 0.1), (v) => v.toFixed(4));
    const cold = await step(0, 1);
    report(`    ${id} from a standstill to full`, true, `${cold.toFixed(4)} s`, 'the pack sags under a cold start; not gated');
  }
  {
    /* Half stick of roll for 300 ms from a hover, then centred. */
    const sim = await fresh(af, null);
    const t = fly(sim, [{ ms: 2000, thr: hover }]);
    const p = [];
    fly(sim, [{ ms: 300, roll: 0.5, thr: hover }, { ms: 700, thr: hover }], (tt, s) => { p.push(s[ST.P] * DEG); }, t);
    const held = p[299];
    const peak = Math.max(...p.slice(0, 300));
    const after = p.slice(700).map(Math.abs);
    const overshoot = (peak - held) / held;
    band(id, 'roll-step', overshoot, (v) => v.toFixed(3));
    report(`${id} roll at rest 400 ms after the stick centres`, Math.max(...after) < 5, `${Math.max(...after).toFixed(2)} deg/s`, `held ${held.toFixed(0)} deg/s, under 5 deg/s`);
  }

  /* ---- the payloads: heavier, measurably, and nothing when none ---- */
  const byMass = [...af.combat.payloads].sort((a, b) => a.massKg - b.massKg);
  const rows = [{ id: 'none', m: 0, hover, climb: await climb(af, null, hover) }];
  for (const p of byMass) {
    const choice = { payload: p.id, accessories: [] };
    const h = await trimHover(af, choice);
    rows.push({ id: p.id, m: p.massKg, hover: h, climb: await climb(af, choice, h) });
  }
  for (const r of rows) {
    report(`    ${id} ${r.id}`, true, `hover ${r.hover.toFixed(3)}`, `${(r.m * 1000).toFixed(0)} g payload, ${r.climb.toFixed(1)} m in 2 s of full throttle`);
  }
  const rising = rows.every((r, k) => k === 0 || (r.hover > rows[k - 1].hover && r.climb < rows[k - 1].climb));
  report(`${id} a heavier payload hovers higher up the stick and climbs less`, rising,
    `${rows[0].hover.toFixed(3)} to ${rows[rows.length - 1].hover.toFixed(3)} of stick, ${rows[0].climb.toFixed(1)} to ${rows[rows.length - 1].climb.toFixed(1)} m`);
  {
    /* Thrust goes as the square of rotor speed and the bare hover's rotor
     * speed as the root of the weight, so with the same motor law a load
     * of m must lift the hover by about the bare duty times
     * sqrt((M + m) / M); the plant's own sag and inflow keep it from being
     * exact, so the check is the direction and the size within a fifth. */
    const heavy = rows[rows.length - 1];
    const predicted = hover * Math.sqrt((d.M + heavy.m) / d.M);
    report(`${id} the heaviest payload's hover is its weight's`, Math.abs(heavy.hover - predicted) / predicted < 0.2,
      `${heavy.hover.toFixed(3)} against ${predicted.toFixed(3)}`, 'within a fifth of the square root law');
  }
  {
    /* No payload and no accessories is the bare table, bit for bit; the
     * same payload twice is the same flight. */
    const bare = traceHash(await fresh(af, null), hover);
    const none = traceHash(await fresh(af, { payload: 'none', accessories: [] }), hover);
    report(`${id} no payload flies bit identical to the bare plant`, bare === none, `${bare} ${none}`);
    const a = traceHash(await fresh(af, { payload: 'wide', accessories: [] }), hover);
    const b = traceHash(await fresh(af, { payload: 'wide', accessories: [] }), hover);
    report(`${id} a payload's flight is deterministic`, a === b && a !== bare, `${a} ${b}`);
  }
  {
    /* The plant's inertia with a pack on top and the heaviest payload under
     * it is the table's, plus the lump's parallel axes, plus its own
     * spread: what configs/combat.js computes and hands over. */
    const all = af.combat.accessories.map((x) => x.id);
    const choice = { payload: 'wide', accessories: all };
    const sim = await fresh(af, choice);
    const add = combatAddon(af, choice);
    const m = add.block[0];
    const r = [add.block[1], add.block[2], add.block[3]];
    const M = af.grams / 1000 + m;
    const sh = r.map((v) => (m * v) / M);
    const bareSim = await fresh(af, null);
    const I0 = [55, 56, 57].map((k) => bareSim.e.sim_bf_debug(k));
    const want = [
      I0[0] + m * (r[1] ** 2 + r[2] ** 2) - M * (sh[1] ** 2 + sh[2] ** 2) + add.inertia[0],
      I0[1] + m * (r[0] ** 2 + r[2] ** 2) - M * (sh[0] ** 2 + sh[2] ** 2) + add.inertia[1],
      I0[2] + m * (r[0] ** 2 + r[1] ** 2) - M * (sh[0] ** 2 + sh[1] ** 2) + add.inertia[2],
    ];
    const got = [55, 56, 57].map((k) => sim.e.sim_bf_debug(k));
    const ok = got.every((g, k) => Math.abs(g - want[k]) < 1e-9) && Math.abs(sim.e.sim_bf_debug(51) - M) < 1e-12;
    report(`${id} the plant carries the payload's and the accessories' inertia`, ok,
      got.map((v) => v.toPrecision(4)).join(' '), `bare ${d.I.map((v) => v.toPrecision(4)).join(' ')}, spread ${Array.from(add.inertia).map((v) => v.toPrecision(3)).join(' ')}`);
    const lumpOnly = await fresh(af, null);
    lumpOnly.setAddons(add.block);
    const spread = got[0] - lumpOnly.e.sim_bf_debug(55);
    report(`${id} the spread is real, not rounding`, spread > 0.1 * d.I[0], `Ixx +${spread.toPrecision(3)} over the lump alone`);
  }
  {
    /* sim_set_addon_inertia's contract. */
    const sim = await fresh(af, null);
    const before = setBlock(sim, 'sim_set_addon_inertia', [0.001, 0.001, 0.001]);
    sim.setAddons(combatAddon(af, { payload: 'standard', accessories: [] }).block);
    const bad = setBlock(sim, 'sim_set_addon_inertia', [0.001, -0.001, 0.001]);
    const ok = setBlock(sim, 'sim_set_addon_inertia', [0.001, 0.001, 0.001]);
    const i1 = sim.e.sim_bf_debug(55);
    sim.setAddons(combatAddon(af, { payload: 'standard', accessories: [] }).block);
    const zeroed = sim.e.sim_bf_debug(55);
    report(`${id} sim_set_addon_inertia: refused before add-ons, out of range, zeroed by sim_set_addons`,
      before === SIM_ERR_BAD_STATE && bad === SIM_ERR_BAD_ARG && ok === SIM_OK && Math.abs(i1 - zeroed - 0.001) < 1e-12);
  }
}

/* ---- the war's payloads (the doc's section 3) ---- */
{
  const af = airframeById('7inch');
  const all = WARHEADS;
  const cases = [
    ['the chosen payload is the warhead', warPayload(af, { payload: 'wide', accessories: [] }, all), { payload: 'wide', warhead: 'wide' }],
    ['none goes to war with the fallback', warPayload(af, { payload: 'none', accessories: [] }, all, 'emp'), { payload: 'emp', warhead: 'emp' }],
    ['none with nothing else is standard', warPayload(af, { payload: 'none', accessories: [] }), { payload: 'standard', warhead: 'standard' }],
    ['an unowned warhead flies the equipped one', warPayload(af, { payload: 'emp', accessories: [] }, ['standard', 'penetrator'], 'penetrator'), { payload: 'penetrator', warhead: 'penetrator' }],
    ['an unowned warhead and an unowned fallback fly standard', warPayload(af, { payload: 'emp', accessories: [] }, ['standard'], 'wide'), { payload: 'standard', warhead: 'standard' }],
    ['a plane has no payload', warPayload(airframeById('cub1400'), { payload: 'wide', accessories: [] }), null],
    ['a peer\'s loadout draws its payload', payloadForWarhead(airframeById('10inch'), 'penetrator'), 'penetrator'],
    ['a warhead it has no payload for draws standard', payloadForWarhead(af, 'nonsense'), 'standard'],
  ];
  for (const [what, got, want] of cases) {
    report(`war: ${what}`, isDeepStrictEqual(got, want), JSON.stringify(got));
  }
  const everyWarhead = quads.every((q) => WARHEADS.every((w) => q.combat.payloads.some((p) => p.warhead === w)));
  report('war: every combat quad carries every warhead', everyWarhead, WARHEADS.join(', '));
  report('war: a stored choice is made valid', isDeepStrictEqual(combatChoice(af, { payload: 'bogus', accessories: ['gps', 'nope', 'pack2'] }), { payload: 'standard', accessories: ['pack2', 'gps'] }));
}

/* ---- the five inch did not move ---- */
{
  const five = airframeById('5inch');
  const cfg = await tune(five.defaultTune);
  const sim = await loadSim(wasm);
  sim.init(cfg);
  sim.reset();
  sim.setCellVoltage(4.0);
  /* scripts/whoop-gates.js W14's hover, measured on the module before any
   * airframe table existed. */
  let lo = 0;
  let hi = 1;
  let h5 = 0.5;
  for (let i = 0; i < 24; i += 1) {
    const mid = 0.5 * (lo + hi);
    const s = await loadSim(wasm);
    s.init(cfg);
    s.reset();
    s.setCellVoltage(4.0);
    let vz = 0;
    fly(s, [{ ms: 2000, thr: mid }], (t, st) => { vz = st[ST.VZ]; });
    h5 = mid;
    if (vz > 0) {
      hi = mid;
    } else {
      lo = mid;
    }
    if (Math.abs(vz) < 0.02) {
      break;
    }
  }
  report('five inch unmoved', Math.abs(h5 - 0.2789999842643738) < 1e-6, `hover ${h5.toFixed(6)}`, 'whoop-gates W14\'s fingerprint');
  void sim;
}

let fails = 0;
const w = Math.max(...results.map((r) => r.id.length));
console.log('\ncombat-gates: the 7 inch and the 10 inch, and what a payload does\n');
for (const r of results) {
  if (!r.pass) {
    fails += 1;
  }
  console.log(`${r.pass ? ' ok  ' : 'FAIL '} ${r.id.padEnd(w)}  ${String(r.measured).padEnd(24)} ${r.extra}`);
}
for (const [quad, bands] of Object.entries(BANDS)) {
  for (const [key, b] of Object.entries(bands)) {
    const r = results.find((x) => x.id === `${quad} ${key}`);
    if (r && !r.pass) {
      console.log(`  ${quad} ${key}: ${b.why}`);
    }
  }
}
console.log(`\n${results.length - fails} of ${results.length} gates pass\n`);
process.exit(fails === 0 ? 0 : 1);
