/*
 * wear.js: owned packs and worn parts, career and war only
 * (docs/PARTS-WEAR.md is the contract; this file is its data and rules).
 *
 * The packs are a synced section of their own, keyed by pack id
 * (src/share/progressmerge.js):
 *
 *   settings.packs[packId] = { v, spec, cycles, health, charge, from }
 *
 * health an integer per mille, 1000 new. The parts' wear rides the
 * airframe's parts entry, beside its crash damage (lead decision
 * 2026-10-07, the training lane's shape, docs/PARTS-WEAR.md):
 *
 *   settings.parts[airframeId].wear = { v: 1, parts: { [i]: w } }
 *
 * i the crash part table's index (the one the saved damage uses) and w how
 * worn, above 0 (a new part is left out) to 1 spent, in steps of 0.001.
 * Accrual works in whole per mille and stores w = (1000 - health) / 1000,
 * so a record always reads back to the same integers.
 *
 * Wear reaches the flight only through the blocks the shell already seats,
 * configs/power.js powerBlock for a plane and configs/motors.js's two for
 * a quad, scaled here once at the seat and never during a flight, from the
 * worst worn motor and prop (which parts those are is the module's part
 * table, `kinds`, SIM_PART ids by index). The replay journal copies those
 * blocks, so a recorded flight replays identically on the wear it was
 * flown with. Every scale is + - * / of small integers: the block is the
 * same double in Node and every browser.
 *
 * Nothing worn and a full pack gives back exactly the block it was handed
 * (null stays null), so a casual seat is byte identical to before.
 *
 * The rates below are GAME RULES, ESTIMATED, not measurements: health 0 is
 * a LiPo's end of life by its makers' cycle life figures (80 percent of the
 * capacity left, the internal resistance about doubled), reached in 300
 * full cycles.
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

import { PART_KINDS, PART_STATE_DOUBLES, STATE } from './parts.js';
import { POWER, powerBlock, powerOption, SIM_POWER } from './power.js';
import {
  MOTORS, SIM_MOTORS, SIM_PROP_PACK, hasMotors, motorsDoubles, packOption, propPackDoubles,
} from './motors.js';

export const WEAR_VERSION = 1;
export const NEW = 1000;
/* Under this a pack is retired: the shelf says so, it still flies. */
export const RETIRED_BELOW = 600;
/* Packs a charger turns around per sortie, until the economy sells more. */
export const CHARGER_CHANNELS = 2;
/* Packs granted with a realism airframe, once, until the economy lands. */
export const STARTER_PACKS = 2;
/* sim_parts_count's ceiling, configs/parts.js PARTS_MAX. */
const PART_INDEX_MAX = 24;
const CHARGES = ['full', 'storage', 'flat'];

/* Accrual rules, per mille. */
const PACK_PER_CYCLE = 1000 / 300;
const PACK_OVERDISCHARGE = 20;
const PACK_IDLE_FULL = 1;
const MOTOR_PER_FULL_MIN = 1;
const IMPACT = { prop: 150, motor: 80 };
const STRUCTURE_PER_J = 1;
const STRUCTURE_IMPACT_MAX = 250;
/* A pack flown on storage charge holds this share of its charge. */
const STORAGE_SHARE = 0.6;
/* An electric plane with no LVC (the Bramor's autopilot cut) counts a
 * pack as overdischarged under this, loaded, volts a cell. */
const FLOOR_CELL_V = 3.3;

const PACK_ID_RE = /^[a-z0-9_-]{1,48}$/;
const isInt = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
const packHealth = (n) => (isInt(n, 0, NEW) ? n : NEW);

/* Whether a flight wears anything: a campaign mission or a war room. */
export function realismFlight({ mission = false, war = false } = {}) {
  return Boolean(mission || war);
}

/* ------------------------------------------------------------------ */
/* The pack a choice flies, as a spec shared by every airframe that takes
 * it: cells, capacity and, for a Li-ion pack, its chemistry. */

export function packSpec(airframeId, packId) {
  if (hasMotors(airframeId)) {
    const p = packOption(airframeId, packId);
    return `${MOTORS[airframeId].table.cells}s${p.mAh}${p.parallel ? 'li' : ''}`;
  }
  const list = POWER[airframeId];
  if (!list) {
    return null;
  }
  for (const o of list) {
    const p = o.kind === 'electric' && o.packs.find((k) => k.id === packId);
    if (p) {
      return `${p.cells}s${p.mAh}`;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Validation, the boundary: what storage or the account hands back. */

function normalisePack(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e) || typeof e.spec !== 'string' || !/^\d{1,2}s\d{2,6}(li)?$/.test(e.spec)) {
    return null;
  }
  return {
    v: WEAR_VERSION,
    spec: e.spec,
    cycles: isInt(e.cycles, 0, 100000) ? e.cycles : 0,
    health: packHealth(e.health),
    charge: CHARGES.includes(e.charge) ? e.charge : 'full',
    from: typeof e.from === 'string' && e.from.length <= 40 ? e.from : null,
  };
}

export function normalisePacks(stored) {
  const out = {};
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return out;
  }
  for (const [id, e] of Object.entries(stored)) {
    const p = PACK_ID_RE.test(id) ? normalisePack(e) : null;
    if (p) {
      out[id] = p;
    }
  }
  return out;
}

const STEP = 1000;
const healthOf = (w) => NEW - Math.round(w * STEP);
const wornBy = (h) => (NEW - h) / STEP;

/* A stored wear record, valid, or null for nothing worn. */
export function normaliseWearRecord(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r) || !r.parts || typeof r.parts !== 'object' || Array.isArray(r.parts)) {
    return null;
  }
  const parts = {};
  for (const [k, w] of Object.entries(r.parts)) {
    const i = Number(k);
    if (String(i) === k && isInt(i, 0, PART_INDEX_MAX - 1) && typeof w === 'number' && w > 0 && w <= 1) {
      const h = healthOf(w);
      if (h < NEW) {
        parts[k] = wornBy(h);
      }
    }
  }
  return Object.keys(parts).length ? { v: WEAR_VERSION, parts } : null;
}

/* An airframe's wear record, empty where nothing is stored. */
export function wearRecordOf(settings, airframeId) {
  const e = settings && settings.parts ? settings.parts[airframeId] : null;
  return normaliseWearRecord(e && e.wear) ?? { v: WEAR_VERSION, parts: {} };
}

/* Which part an index is, for wear: 'motor', 'prop' or 'structure'. */
export function partClass(kindId) {
  const k = PART_KINDS[kindId];
  return k === 'motor' || k === 'prop' ? k : 'structure';
}

/* The worst motor's and prop's health, per mille, that the seat flies on.
 * `kinds` null (no part table) is new. */
export function propulsionHealth(record, kinds) {
  const out = { motor: NEW, prop: NEW };
  if (!kinds) {
    return out;
  }
  for (const [k, w] of Object.entries(record.parts)) {
    const c = partClass(kinds[Number(k)]);
    if (c !== 'structure') {
      out[c] = Math.min(out[c], healthOf(w));
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Seating: the blocks, scaled. `pack` is the flown pack's record or null
 * for a fresh one. h is health over 1000. */

const fresh = (w, pack) => w.motor === NEW && w.prop === NEW && (!pack || (pack.health === NEW && pack.charge === 'full'));
const rScale = (n) => (2 * NEW - n) / NEW;
const capScale = (n) => (0.8 * NEW + 0.2 * n) / NEW;
const motorThrust = (n) => (0.9 * NEW + 0.1 * n) / NEW;
const motorR = (n) => (1.2 * NEW - 0.2 * n) / NEW;
const propThrust = (n) => (0.85 * NEW + 0.15 * n) / NEW;

/*
 * A plane's sim_set_power block on its wear: `block` is what the shell
 * seats today (null for the table's own system), `choice` its { option,
 * pack }. Returns `block` itself when nothing is worn.
 */
export function wornPowerBlock(airframeId, choice, block, wear, pack = null) {
  if (fresh(wear, pack)) {
    return block;
  }
  const out = Float64Array.from(block ?? powerBlock(airframeId, choice.option, choice.pack));
  const option = powerOption(airframeId, choice.option);
  out[SIM_POWER.THRUST] *= motorThrust(wear.motor) * propThrust(wear.prop);
  if (option.kind === 'electric' && pack) {
    out[SIM_POWER.R_CELL] *= rScale(pack.health);
    out[SIM_POWER.PACK_C] *= capScale(pack.health) * (pack.charge === 'storage' ? STORAGE_SHARE : 1);
  }
  return out;
}

/*
 * A quad's two blocks on its wear: `motors` and `propPack` as the shell
 * seats them today (either null for the table's). A quad's pack does not
 * drain in the plant, so its wear is the sag alone.
 */
export function wornQuadBlocks(airframeId, choice, motors, propPack, wear, pack = null) {
  if (fresh(wear, pack)) {
    return { motors, propPack };
  }
  const m = Float64Array.from(motors ?? motorsDoubles(airframeId, choice));
  const p = Float64Array.from(propPack ?? propPackDoubles(airframeId, choice));
  m[SIM_MOTORS.R] *= motorR(wear.motor);
  p[SIM_PROP_PACK.KT] *= propThrust(wear.prop);
  if (pack) {
    p[SIM_PROP_PACK.R_CELL] *= rScale(pack.health);
  }
  return { motors: m, propPack: p };
}

/* ------------------------------------------------------------------ */
/* Packs on the shelf. */

/* The starter packs, until the economy sells them: two of each spec an
 * airframe is flown on in career or war, once. Their ids come from the
 * airframe and the spec, so two computers granting them grant the same
 * keys, and a pack retired or sold is never granted again. */
export function seedPacks(packs, airframeId, packId) {
  const spec = packSpec(airframeId, packId);
  const out = { ...packs };
  if (!spec || out[`${airframeId}-${spec}-1`]) {
    return out;
  }
  for (let i = 1; i <= STARTER_PACKS; i += 1) {
    out[`${airframeId}-${spec}-${i}`] = { v: WEAR_VERSION, spec, cycles: 0, health: NEW, charge: 'full', from: airframeId };
  }
  return out;
}

/*
 * A realism sortie's start: the starter packs granted, one charger
 * turnaround, and the pack to fly. Returns the packs to store, the id
 * flown (null when none of the spec is charged, which with as many
 * channels as starter packs cannot happen) and the airframe's wear record.
 */
export function startSortie(settings, airframeId, choice) {
  let packs = seedPacks(normalisePacks(settings.packs), airframeId, choice.pack);
  packs = turnaround(packs);
  const packId = pickPack(packs, packSpec(airframeId, choice.pack));
  return { packs, packId, record: wearRecordOf(settings, airframeId) };
}

/*
 * What a flight's crash parts say was hit, for accrue: from the plant's
 * parts state (sim_parts_state, PART_STATE_DOUBLES a part), every part
 * past the root with damage on it, once, by index, with the energy it
 * took.
 */
export function impactsFrom(parts, count) {
  const out = [];
  if (!parts) {
    return out;
  }
  for (let i = 1; i < count; i += 1) {
    const o = i * PART_STATE_DOUBLES;
    if (parts[o + STATE.damage] > 0) {
      out.push({ i, energyJ: parts[o + STATE.energy] });
    }
  }
  return out;
}

const chargeRank = { full: 0, storage: 1, flat: 2 };

/* The pack to fly for a spec: charged first, then the healthiest, then
 * by id; null when none of that spec is charged. */
export function pickPack(packs, spec) {
  const ids = Object.keys(packs).filter((id) => packs[id].spec === spec && packs[id].charge !== 'flat');
  ids.sort((a, b) => chargeRank[packs[a].charge] - chargeRank[packs[b].charge]
    || packs[b].health - packs[a].health || (a < b ? -1 : 1));
  return ids.length ? ids[0] : null;
}

/* One sortie's charger turnaround: up to CHARGER_CHANNELS flat packs, by
 * id, to `to` ('full' or 'storage'). Counted in sorties, never by the
 * clock (no timers, owner 2026-10-07). */
export function turnaround(packs, to = 'full') {
  const out = { ...packs };
  const flat = Object.keys(out).filter((id) => out[id].charge === 'flat').sort().slice(0, CHARGER_CHANNELS);
  for (const id of flat) {
    out[id] = { ...out[id], charge: to };
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Accrual, after a realism flight. Pure: the same state and flight give
 * the same answer on any machine.
 *
 * flight = { airframe, kinds, packId, drawnC, capacityC, minCellV, lvcV,
 *            fullThrottleS, impacts: [{ i, energyJ }] }
 *
 * `kinds` is the part table's SIM_PART ids by index: every motor heats by
 * the time at full throttle, and a hit part wears by what it is.
 *
 * Returns { packs, record, delta }, delta as docs/PARTS-WEAR.md's shared
 * shape, the debrief's only input: parts as { i, part, before, after,
 * cause }, before and after as w. */

const down = (n, loss) => Math.max(0, n - Math.max(0, Math.round(loss)));

export function accrue(packs, record, flight) {
  const kinds = flight.kinds || [];
  const health = {};
  for (const [k, w] of Object.entries(record.parts)) {
    health[k] = healthOf(w);
  }
  const parts = [];
  const wear = (i, loss, cause) => {
    const before = health[i] ?? NEW;
    const after = down(before, loss);
    if (after !== before) {
      parts.push({ i, part: partClass(kinds[i]), before: wornBy(before), after: wornBy(after), cause });
      health[i] = after;
    }
  };
  const heat = (flight.fullThrottleS || 0) / 60 * MOTOR_PER_FULL_MIN;
  kinds.forEach((kind, i) => {
    if (i > 0 && partClass(kind) === 'motor') {
      wear(i, heat, 'heat');
    }
  });
  for (const hit of flight.impacts || []) {
    if (!isInt(hit.i, 1, PART_INDEX_MAX - 1)) {
      continue;
    }
    const c = partClass(kinds[hit.i]);
    wear(hit.i, c === 'structure' ? Math.min(STRUCTURE_IMPACT_MAX, (hit.energyJ || 0) * STRUCTURE_PER_J) : IMPACT[c], 'impact');
  }
  const stored = {};
  for (const k of Object.keys(health).map(Number).sort((a, b) => a - b)) {
    if (health[k] < NEW) {
      stored[k] = wornBy(health[k]);
    }
  }

  const outPacks = {};
  for (const [k, p] of Object.entries(packs)) {
    outPacks[k] = k !== flight.packId && p.charge === 'full' ? { ...p, health: down(p.health, PACK_IDLE_FULL) } : p;
  }
  let pack = null;
  const retired = [];
  const flown = flight.packId ? packs[flight.packId] : null;
  if (flown) {
    /* A plant that does not drain its pack (a quad's) is taken to fly
     * it down, one full cycle. */
    const dod = flight.capacityC > 0 ? Math.min(1.5, flight.drawnC / flight.capacityC) : 1;
    const floor = flight.lvcV > 0 ? flight.lvcV : FLOOR_CELL_V;
    const over = flight.minCellV > 0 && flight.minCellV < floor;
    const after = down(flown.health, dod * PACK_PER_CYCLE + (over ? PACK_OVERDISCHARGE : 0));
    const next = { ...flown, health: after, cycles: flown.cycles + 1, charge: 'flat' };
    outPacks[flight.packId] = next;
    pack = { id: flight.packId, spec: flown.spec, before: flown.health, after, cycles: next.cycles, charge: 'flat', overdischarged: over };
    if (flown.health >= RETIRED_BELOW && after < RETIRED_BELOW) {
      retired.push(flight.packId);
    }
  }
  return {
    packs: outPacks,
    record: { v: WEAR_VERSION, parts: stored },
    delta: { airframe: flight.airframe, pack, parts, retired },
  };
}

/* ------------------------------------------------------------------ */
/* Repair, and what the hangar room's furniture reads. */

/* A worn part back to new, by index, or every part for null (free until
 * the economy prices it). */
export function repair(record, i = null) {
  const parts = {};
  if (i !== null) {
    for (const [k, w] of Object.entries(record.parts)) {
      if (Number(k) !== i) {
        parts[k] = w;
      }
    }
  }
  return { v: WEAR_VERSION, parts };
}

export function packShelf(settings) {
  const packs = normalisePacks(settings && settings.packs);
  return Object.keys(packs).sort().map((id) => ({ id, ...packs[id], retired: packs[id].health < RETIRED_BELOW }));
}

export function chargerState(settings) {
  const packs = normalisePacks(settings && settings.packs);
  const flat = Object.keys(packs).filter((id) => packs[id].charge === 'flat').sort();
  return { channels: CHARGER_CHANNELS, next: flat.slice(0, CHARGER_CHANNELS), waiting: flat.slice(CHARGER_CHANNELS) };
}

/* The bench: each worn part by index, its w, and what it is where the
 * part table is known. */
export function benchState(settings, airframeId, kinds = null) {
  const r = wearRecordOf(settings, airframeId);
  return Object.keys(r.parts).map(Number).sort((a, b) => a - b)
    .map((i) => ({ i, w: r.parts[i], part: kinds ? partClass(kinds[i]) : null }));
}
