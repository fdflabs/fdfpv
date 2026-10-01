/*
 * combat-gates.js: the combat quads, plants 24 to 26 (docs/COMBAT-DRONES.md),
 * flown on the real module against figures from outside this repository,
 * and their payloads held to what a payload has to do: make the machine
 * heavier, measurably, and nothing when there is none. The interceptor is
 * held to what it is for: faster flat out and off the floor than every
 * other quad, for less pack and a quicker roll.
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
  interceptor: {
    'figure-of-merit': { min: 0.38, max: 0.52, unit: '', why: 'A high pitch 7 inch two blade is part stalled in a static hover: 0.798 C_T^1.5 / C_P on a thin electric 7x6\'s static table (C_T 0.11, C_P 0.06 to 0.075) is 0.39 to 0.48, and it is no better than the five inch triblade\'s 0.52.' },
    'hover-bare': { min: 0.18, max: 0.30, unit: 'of stick', why: 'A 7 inch speed build of 0.75 to 0.9 kg on a 6S LiPo hovers at a fifth to a quarter of the stick, as a five inch race quad does at 1 g.' },
    'thrust-to-weight': { min: 8.0, max: 12.0, unit: ': 1', why: 'Stand thrust of four 2807 1500 kV on 7 inch two blades on 6S, 8 to 9.5 kgf, over a 0.75 to 0.9 kg build, less the LiPo\'s small sag.' },
    'motor-tau': { min: 0.015, max: 0.040, unit: 's', why: 'j R / ke^2 for a 2807 bell and an 8 g two blade on a hot wind is 25 to 30 ms: quicker than the 7 inch\'s by the lighter prop and the lower winding resistance. The same small step.' },
    'punch-sag': { min: 3.2, max: 3.8, unit: 'V a cell', why: 'A 6S 1800 120C LiPo at 150 to 200 A: 4 to 5 mOhm a cell with its leads drops a fresh cell to about 3.4 V.' },
    'roll-step': { min: 0, max: 0.35, unit: 'overshoot', why: 'Stock 4.5.1 on a light quad with twice the five inch\'s roll authority: a half stick step must still settle.' },
  },
};

/*
 * THE INTERCEPTOR AGAINST THE OTHER QUADS (docs/COMBAT-DRONES.md section 5a).
 * Each flies bare, on a fresh pack, at the weight the shell flies it at with
 * the Weight slider at 100 (`gravityBase`: 1.62 g on the five inch, 1 g on
 * the combat quads), so the comparison is the one a pilot feels. The order
 * is the request's (the owner, 2026-10-01: "ultra fast interceptor drones"):
 * the interceptor first on both, then the five inch, the 7 inch and the 10
 * inch.
 */
const RACE = ['interceptor', '5inch', '7inch', '10inch'];
/* The combat quads built to carry: every warhead, a second pack. */
const LOAD_CARRIERS = ['7inch', '10inch'];

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

/* The shell's order: airframe, init, the add-ons and their spread, reset.
 * `g` is the weight as a multiple of 1 g, the shell's gravityBase; the
 * module's own default is 1. */
async function fresh(af, choice, cellV = 4.2, g = 1) {
  const sim = await loadSim(wasm);
  if (sim.e.sim_set_airframe(af.simId) !== SIM_OK) {
    throw new Error(`sim_set_airframe(${af.simId}) refused`);
  }
  if (sim.init(await tune(af.defaultTune)) !== SIM_OK) {
    throw new Error('sim_init failed');
  }
  if (sim.e.sim_set_gravity(g) !== SIM_OK) {
    throw new Error(`sim_set_gravity(${g}) refused`);
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
async function trimHover(af, choice, g = 1) {
  let lo = 0;
  let hi = 1;
  let best = 0.5;
  for (let i = 0; i < 24; i += 1) {
    const mid = 0.5 * (lo + hi);
    const sim = await fresh(af, choice, 4.2, g);
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
async function climb(af, choice, hover, g = 1) {
  const sim = await fresh(af, choice, 4.2, g);
  let z0 = 0;
  let z1 = 0;
  const t = fly(sim, [{ ms: 2000, thr: hover }], (tt, s) => { z0 = s[ST.PZ]; });
  fly(sim, [{ ms: 2000, thr: 1.0 }], (tt, s) => { z1 = s[ST.PZ]; }, t);
  return z1 - z0;
}

/*
 * Level speed at full throttle: from a hover, full throttle with the nose
 * held down by a harness pilot that trims the pitch angle until the craft
 * neither climbs nor sinks, then the speed it settles at. Flown in acro, as
 * Betaflight's rate loop holds the angle the stick leaves it at; the pilot
 * reads the attitude off the state and flies the stick, nothing more. The
 * module's pitch stick is positive nose up.
 */
async function levelTop(af, g) {
  const sim = await fresh(af, null, 4.2, g);
  let theta = 1.1;
  let nextRc = 0;
  let sum = 0;
  let n = 0;
  let vzMax = 0;
  for (let t = 0; t < 30000; t += 1) {
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
    if (t >= 27000) {
      const st = sim.readState().state;
      sum += Math.hypot(st[ST.VX], st[ST.VY]);
      n += 1;
      vzMax = Math.max(vzMax, Math.abs(st[ST.VZ]));
    }
  }
  return { v: sum / n, vz: vzMax, pitch: theta };
}

/* Mean pack current over the last half of two seconds held at a duty, A. */
async function packAmps(af, thr, hover) {
  const sim = await fresh(af, null);
  const t = fly(sim, [{ ms: 2000, thr: hover }]);
  let sum = 0;
  let n = 0;
  fly(sim, [{ ms: 2000, thr }], (tt, s) => {
    if (tt - t > 1000) {
      sum += s[ST.AMPS];
      n += 1;
    }
  }, t);
  return sum / n;
}

/*
 * Roll response: half stick of roll from a hover, the time to 63 percent
 * of the rate the craft holds at the end of 300 ms. Shorter is a quicker,
 * twitchier machine on the same Betaflight gains and rates.
 */
async function rollRise(af, g) {
  const sim = await fresh(af, null, 4.2, g);
  const hover = await trimHover(af, null, g);
  const t = fly(sim, [{ ms: 2000, thr: hover }]);
  const p = [];
  fly(sim, [{ ms: 300, roll: 0.5, thr: hover }], (tt, s) => { p.push(s[ST.P]); }, t);
  const held = p[p.length - 1];
  return (p.findIndex((v) => v >= 0.63 * held) + 1) / 1000;
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
  const heaviest = byMass[byMass.length - 1].id;
  const standard = combatChoice(af, null).payload;
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
    const a = traceHash(await fresh(af, { payload: heaviest, accessories: [] }), hover);
    const b = traceHash(await fresh(af, { payload: heaviest, accessories: [] }), hover);
    report(`${id} a payload's flight is deterministic`, a === b && a !== bare, `${a} ${b}`);
  }
  {
    /* The plant's inertia with a pack on top and the heaviest payload under
     * it is the table's, plus the lump's parallel axes, plus its own
     * spread: what configs/combat.js computes and hands over. */
    const all = af.combat.accessories.map((x) => x.id);
    const choice = { payload: heaviest, accessories: all };
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
    /* Gated on the load carriers, whose heaviest build stacks a pack on
     * top over a payload as heavy as the machine, which is what the doc's
     * case for the spread entry is about. The interceptor's whole set is
     * 260 g over 15 cm: reported, and the equality above holds it. */
    if (LOAD_CARRIERS.includes(id)) {
      report(`${id} the spread is real, not rounding`, spread > 0.1 * d.I[0], `Ixx +${spread.toPrecision(3)} over the lump alone`);
    } else {
      report(`    ${id} the spread over the lump alone`, true, `Ixx +${spread.toPrecision(3)}`, `${(100 * spread / d.I[0]).toFixed(1)} percent of the bare Ixx; not gated`);
    }
  }
  {
    /* sim_set_addon_inertia's contract. */
    const sim = await fresh(af, null);
    const before = setBlock(sim, 'sim_set_addon_inertia', [0.001, 0.001, 0.001]);
    sim.setAddons(combatAddon(af, { payload: standard, accessories: [] }).block);
    const bad = setBlock(sim, 'sim_set_addon_inertia', [0.001, -0.001, 0.001]);
    const ok = setBlock(sim, 'sim_set_addon_inertia', [0.001, 0.001, 0.001]);
    const i1 = sim.e.sim_bf_debug(55);
    sim.setAddons(combatAddon(af, { payload: standard, accessories: [] }).block);
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
  /* The 7 and the 10 inch carry every warhead; the interceptor carries one
   * light payload, the standard warhead's, which is the one every pilot
   * owns and every fallback ends at, so every combat quad has it. */
  const loaded = LOAD_CARRIERS.map(airframeById);
  report('war: the 7 and the 10 inch carry every warhead', loaded.every((q) => WARHEADS.every((w) => q.combat.payloads.some((p) => p.warhead === w))), WARHEADS.join(', '));
  report('war: every combat quad carries the standard warhead', quads.every((q) => q.combat.payloads.some((p) => p.warhead === 'standard')), quads.map((q) => q.id).join(', '));
  report('war: a stored choice is made valid', isDeepStrictEqual(combatChoice(af, { payload: 'bogus', accessories: ['gps', 'nope', 'pack2'] }), { payload: 'standard', accessories: ['pack2', 'gps'] }));
  const fast = airframeById('interceptor');
  const fastCases = [
    ['the interceptor flies its proximity payload by default', combatChoice(fast, null), { payload: 'proximity', accessories: [] }],
    ['the interceptor\'s proximity payload is the standard warhead', warPayload(fast, { payload: 'proximity', accessories: [] }, all), { payload: 'proximity', warhead: 'standard' }],
    ['the interceptor with none and the wide equipped flies the standard', warPayload(fast, { payload: 'none', accessories: [] }, all, 'wide'), { payload: 'proximity', warhead: 'standard' }],
    ['a peer\'s interceptor with a wide loadout draws its proximity payload', payloadForWarhead(fast, 'wide'), 'proximity'],
  ];
  for (const [what, got, want] of fastCases) {
    report(`war: ${what}`, isDeepStrictEqual(got, want), JSON.stringify(got));
  }
}

/* ---- the interceptor against every other quad (section 5a) ---- */
{
  const race = [];
  for (const id of RACE) {
    const af = airframeById(id);
    const g = af.gravityBase ?? 1;
    const level = await levelTop(af, g);
    const hover = await trimHover(af, null, g);
    const punch = await climb(af, null, hover, g);
    const rise = await rollRise(af, g);
    race.push({ id, af, g, top: level.v, hover, punch, rise });
    report(`    ${id} at ${g} g`, true, `${level.v.toFixed(1)} m/s level`,
      `${(level.v * 3.6).toFixed(0)} km/h at ${(level.pitch * DEG).toFixed(0)} deg nose down; hover ${hover.toFixed(3)}; ${punch.toFixed(1)} m in 2 s of full throttle; roll to 63 percent in ${(rise * 1000).toFixed(0)} ms`);
    report(`${id} level flight is level`, level.vz < 0.1, `|vz| ${level.vz.toFixed(3)} m/s`, 'the harness pilot held the height within 0.1 m/s over the last 3 s');
  }
  const ordered = (key) => race.every((r, k) => k === 0 || r[key] < race[k - 1][key]);
  report('top speed: interceptor > 5 inch > 7 inch > 10 inch', ordered('top'), race.map((r) => `${r.id} ${r.top.toFixed(1)} m/s`).join(', '));
  report('punch-out: interceptor > 5 inch > 7 inch > 10 inch', ordered('punch'), race.map((r) => `${r.id} ${r.punch.toFixed(1)} m`).join(', '));
  const [fast, five, seven] = race;
  report('the interceptor rolls quicker than the 5 and the 7 inch', fast.rise < five.rise && fast.rise < seven.rise,
    race.map((r) => `${r.id} ${(r.rise * 1000).toFixed(0)} ms`).join(', '), 'the same Betaflight gains and rates on each');
  for (const r of race.filter((x) => x.af.combat)) {
    report(`${r.id} topSpeed is the flown level speed`, Math.abs(r.af.topSpeed - r.top) < 0.5, `${r.af.topSpeed} against ${r.top.toFixed(2)} m/s`, 'configs/airframes.js against the module, within 0.5 m/s');
  }

  /* Endurance: four fifths of the pack's charge over the pack current the
   * module draws, at a hover and at full throttle on the bench. The
   * interceptor's LiPo is a speed pack; the 7 inch's Li-ion is a range one. */
  const endurance = {};
  for (const id of ['interceptor', '7inch']) {
    const af = airframeById(id);
    const hover = race.find((r) => r.id === id).hover;
    const ah = derived[id].q.packAh;
    const aHover = await packAmps(af, hover, hover);
    const aFull = await packAmps(af, 1.0, hover);
    endurance[id] = { hoverMin: 0.8 * ah * 60 / aHover, fullS: 0.8 * ah * 3600 / aFull };
    report(`    ${id} endurance`, true, `${endurance[id].hoverMin.toFixed(1)} min hover`,
      `${aHover.toFixed(1)} A at a hover, ${aFull.toFixed(0)} A flat out: ${endurance[id].fullS.toFixed(0)} s of full throttle in a ${ah} Ah pack`);
  }
  report('endurance: the interceptor\'s is shorter than the 7 inch\'s', endurance.interceptor.hoverMin < endurance['7inch'].hoverMin && endurance.interceptor.fullS < endurance['7inch'].fullS,
    `${endurance.interceptor.hoverMin.toFixed(1)} against ${endurance['7inch'].hoverMin.toFixed(1)} min`, `${endurance.interceptor.fullS.toFixed(0)} against ${endurance['7inch'].fullS.toFixed(0)} s flat out`);
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
console.log('\ncombat-gates: the 7 inch, the 10 inch and the interceptor, and what a payload does\n');
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
