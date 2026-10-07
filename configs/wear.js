/*
 * wear.js: owned packs and worn parts, career and war only
 * (docs/PARTS-WEAR.md is the contract; this file is its data and rules).
 *
 * Two synced sections, both keyed (src/share/progressmerge.js):
 *
 *   settings.packs[packId] = { v, spec, cycles, health, charge, from }
 *   settings.wear[airframeId] = { v, motor, prop, parts, flights }
 *
 * `parts` is the structure, by the crash part table's index (the one
 * settings.parts' damage uses): { [i]: health }, a part missing is new.
 *
 * Health is an integer per mille, 1000 new. Wear reaches the flight only
 * through the blocks the shell already seats, configs/power.js powerBlock
 * for a plane and configs/motors.js's two for a quad, scaled here once at
 * the seat and never during a flight. The replay journal copies those
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
export const PARTS = ['motor', 'prop'];
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
const health = (n) => (isInt(n, 0, NEW) ? n : NEW);

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
    health: health(e.health),
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

function normaliseStructure(parts) {
  const out = {};
  if (!parts || typeof parts !== 'object' || Array.isArray(parts)) {
    return out;
  }
  for (const [k, n] of Object.entries(parts)) {
    const i = Number(k);
    if (String(i) === k && isInt(i, 0, PART_INDEX_MAX - 1) && isInt(n, 0, NEW - 1)) {
      out[k] = n;
    }
  }
  return out;
}

function normaliseEntry(e) {
  const ok = e && typeof e === 'object' && !Array.isArray(e);
  return {
    v: WEAR_VERSION,
    motor: health(ok ? e.motor : NEW),
    prop: health(ok ? e.prop : NEW),
    parts: normaliseStructure(ok ? e.parts : null),
    flights: ok && isInt(e.flights, 0, 1000000) ? e.flights : 0,
  };
}

/* How worn, 0 new to 1 spent: the training lane's bands read this. */
export function wearLevel(n) {
  return (NEW - n) / NEW;
}

export function normaliseWear(stored) {
  const out = {};
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return out;
  }
  for (const [id, e] of Object.entries(stored)) {
    if (POWER[id] || hasMotors(id)) {
      out[id] = normaliseEntry(e);
    }
  }
  return out;
}

/* One airframe's parts, new where nothing is stored. */
export function wearOf(settings, airframeId) {
  return normaliseEntry(settings && settings.wear ? settings.wear[airframeId] : null);
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

/* The starter packs for a realism airframe, once: ids from the airframe
 * so two computers granting them grant the same keys. */
export function seedPacks(packs, airframeId, packId) {
  const spec = packSpec(airframeId, packId);
  const out = { ...packs };
  if (!spec || Object.values(packs).some((p) => p.from === airframeId)) {
    return out;
  }
  for (let i = 1; i <= STARTER_PACKS; i += 1) {
    out[`${airframeId}-${i}`] = { v: WEAR_VERSION, spec, cycles: 0, health: NEW, charge: 'full', from: airframeId };
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
 * flight = { airframe, packId, drawnC, capacityC, minCellV, lvcV,
 *            fullThrottleS, impacts: [{ kind: 'prop'|'motor'|'structure', i, energyJ }] }
 *
 * `i` is the crash part table's index, for a structure hit.
 *
 * Returns { packs, wear, delta }, delta as docs/PARTS-WEAR.md's shared
 * shape, the debrief's only input. */

const down = (n, loss) => Math.max(0, n - Math.max(0, Math.round(loss)));

export function accrue(packs, wear, flight) {
  const id = flight.airframe;
  const was = normaliseEntry(wear[id]);
  const now = { ...was, flights: was.flights + 1 };
  const parts = [];
  const note = (part, before, after, cause, i = null) => {
    if (after !== before) {
      parts.push(i === null ? { part, before, after, cause } : { part, i, before, after, cause });
    }
  };
  let motor = down(now.motor, (flight.fullThrottleS || 0) / 60 * MOTOR_PER_FULL_MIN);
  note('motor', now.motor, motor, 'heat');
  let prop = now.prop;
  const structure = { ...now.parts };
  for (const hit of flight.impacts || []) {
    if (hit.kind === 'prop') {
      const after = down(prop, IMPACT.prop);
      note('prop', prop, after, 'impact');
      prop = after;
    } else if (hit.kind === 'motor') {
      const after = down(motor, IMPACT.motor);
      note('motor', motor, after, 'impact');
      motor = after;
    } else if (hit.kind === 'structure' && isInt(hit.i, 0, PART_INDEX_MAX - 1)) {
      const before = structure[hit.i] ?? NEW;
      const after = down(before, Math.min(STRUCTURE_IMPACT_MAX, (hit.energyJ || 0) * STRUCTURE_PER_J));
      note('structure', before, after, 'impact', hit.i);
      if (after < NEW) {
        structure[hit.i] = after;
      }
    }
  }
  Object.assign(now, { motor, prop, parts: structure });

  const outPacks = {};
  for (const [k, p] of Object.entries(packs)) {
    outPacks[k] = k !== flight.packId && p.charge === 'full' ? { ...p, health: down(p.health, PACK_IDLE_FULL) } : p;
  }
  let pack = null;
  const retired = [];
  const flown = flight.packId ? packs[flight.packId] : null;
  if (flown) {
    const dod = flight.capacityC > 0 ? Math.min(1.5, flight.drawnC / flight.capacityC) : 0;
    const floor = flight.lvcV > 0 ? flight.lvcV : FLOOR_CELL_V;
    const over = flight.minCellV > 0 && flight.minCellV < floor;
    const after = down(flown.health, dod * PACK_PER_CYCLE + (over ? PACK_OVERDISCHARGE : 0));
    const next = { ...flown, health: after, cycles: flown.cycles + 1, charge: 'flat' };
    outPacks[flight.packId] = next;
    pack = { id: flight.packId, spec: flown.spec, before: flown.health, after, cycles: next.cycles, charge: 'flat' };
    if (over) {
      parts.push({ part: 'pack', before: flown.health, after, cause: 'overdischarge' });
    }
    if (flown.health >= RETIRED_BELOW && after < RETIRED_BELOW) {
      retired.push(flight.packId);
    }
  }
  return { packs: outPacks, wear: { ...wear, [id]: now }, delta: { airframe: id, pack, parts, retired } };
}

/* ------------------------------------------------------------------ */
/* Repair, and what the hangar room's furniture reads. */

/* An airframe's worn parts back to new (free until the economy prices
 * it): `part` 'motor', 'prop' or 'structure' (every structural part), or
 * null for all of them. */
export function repair(wear, airframeId, part = null) {
  const now = { ...normaliseEntry(wear[airframeId]) };
  for (const k of PARTS) {
    if (!part || part === k) {
      now[k] = NEW;
    }
  }
  if (!part || part === 'structure') {
    now.parts = {};
  }
  return { ...wear, [airframeId]: now };
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

export function benchState(settings, airframeId) {
  const w = wearOf(settings, airframeId);
  const parts = PARTS.map((part) => ({ part, health: w[part], worn: w[part] < NEW }));
  for (const i of Object.keys(w.parts).map(Number).sort((a, b) => a - b)) {
    parts.push({ part: 'structure', i, health: w.parts[i], worn: true });
  }
  return { flights: w.flights, parts };
}
