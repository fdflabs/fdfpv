/*
 * combat.js: a combat quad's payload and accessories, docs/COMBAT-DRONES.md.
 * What the pilot chose, made valid; what it hands the plant; and which
 * payload a war flies. Data and plain arithmetic only, the same in Node and
 * every browser: the plant gets numbers between runs and does the physics
 * itself, so nothing here is on the 1 kHz path.
 *
 * THE CONTRACT (the doc's section 2)
 *
 *   airframe.combat = { frame, payloads, accessories }, configs/airframes.js
 *   settings.combat[airframeId] = { payload, accessories }
 *     payload      a payload id of that airframe's, or 'none'
 *     accessories  ids of that airframe's, in its own order
 *   A pilot who never chose has no entry and flies DEFAULT_CHOICE.
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

import { SIM_ADDON, SIM_ADDON_DOUBLES } from './hangar-parts.js';

export const NO_PAYLOAD = 'none';
export const DEFAULT_CHOICE = Object.freeze({ payload: 'standard', accessories: Object.freeze([]) });

/* The war's warheads, edge/rooms/war.js WARHEADS, in its order. */
const WARHEADS = ['standard', 'wide', 'penetrator', 'emp'];

/* The stored choice for this airframe, made valid: an unknown payload is
 * the default, an unknown accessory is dropped, and the order is the
 * airframe's. Null for an aircraft without a combat block. */
export function combatChoice(af, stored) {
  const c = af && af.combat;
  if (!c) {
    return null;
  }
  const s = stored && typeof stored === 'object' ? stored : {};
  const payload = s.payload === NO_PAYLOAD || c.payloads.some((p) => p.id === s.payload)
    ? s.payload
    : DEFAULT_CHOICE.payload;
  const want = Array.isArray(s.accessories) ? s.accessories : [];
  const accessories = c.accessories.filter((a) => want.includes(a.id)).map((a) => a.id);
  return { payload, accessories };
}

/* settings.combat with every entry made valid and the empty ones dropped
 * (an entry equal to the default is kept: it is a choice the pilot made). */
export function normaliseCombat(stored, airframeById) {
  const out = {};
  if (!stored || typeof stored !== 'object') {
    return out;
  }
  for (const [id, entry] of Object.entries(stored)) {
    const af = airframeById(id);
    if (af && af.id === id && af.combat) {
      out[id] = combatChoice(af, entry);
    }
  }
  return out;
}

/*
 * WHAT THE OWN CRAFT CARRIES, for the drawing: src/main.js registers the
 * source (its combatSeated: the pilot's choice, or in a war the payload of
 * the room's warhead for this seat) and src/render/craft.js hands
 * combatFor(id) to a combat quad's builder as `opts.combat`, the way the
 * livery and the hangar parts reach a plane's (setLiverySource,
 * setPartsSource). Null with no source and for every other aircraft.
 */
let source = null;

export function setCombatSource(fn) {
  source = typeof fn === 'function' ? fn : null;
}

export function combatFor(airframeId) {
  return source ? source(airframeId) : null;
}

export function payloadOf(af, choice) {
  return (af.combat && choice && af.combat.payloads.find((p) => p.id === choice.payload)) ?? null;
}

/*
 * Every mass the choice adds, as { m, at, own } with `own` the thing's own
 * inertia about its own centre (a payload is a solid cylinder along body x;
 * an accessory is a point).
 */
function masses(af, choice) {
  const out = [];
  const p = payloadOf(af, choice);
  if (p) {
    const r = p.dims.d / 2;
    const L = p.dims.len;
    const across = p.massKg * (3 * r * r + L * L) / 12;
    out.push({ m: p.massKg, at: p.cgOffset_m, own: [p.massKg * r * r / 2, across, across] });
  }
  for (const id of choice ? choice.accessories : []) {
    const a = af.combat.accessories.find((x) => x.id === id);
    out.push({ m: a.massKg, at: a.cgOffset_m, own: [0, 0, 0] });
  }
  return out;
}

/*
 * What the plant gets, or null when the choice adds nothing (no payload, no
 * accessories: the bare table, add-ons cleared). `block` is the
 * sim_set_addons block, every mass lumped at its mass weighted point and the
 * payload's drag at the payload; `inertia` the sim_set_addon_inertia block,
 * the lump's own inertia about that point: each mass's own plus its m r^2
 * off the point, per body axis.
 */
export function combatAddon(af, choice) {
  const ms = masses(af, choice);
  if (ms.length === 0) {
    return null;
  }
  const M = ms.reduce((s, x) => s + x.m, 0);
  const c = [0, 1, 2].map((k) => ms.reduce((s, x) => s + x.m * x.at[k], 0) / M);
  const I = [0, 0, 0];
  for (const x of ms) {
    const d = [x.at[0] - c[0], x.at[1] - c[1], x.at[2] - c[2]];
    I[0] += x.own[0] + x.m * (d[1] * d[1] + d[2] * d[2]);
    I[1] += x.own[1] + x.m * (d[0] * d[0] + d[2] * d[2]);
    I[2] += x.own[2] + x.m * (d[0] * d[0] + d[1] * d[1]);
  }
  const p = payloadOf(af, choice);
  const block = new Float64Array(SIM_ADDON_DOUBLES);
  block[SIM_ADDON.MASS] = M;
  block[SIM_ADDON.CG] = c[0];
  block[SIM_ADDON.CG + 1] = c[1];
  block[SIM_ADDON.CG + 2] = c[2];
  block[SIM_ADDON.CDA] = p ? p.dragArea_m2 : 0;
  const at = p ? p.cgOffset_m : c;
  block[SIM_ADDON.DRAG] = at[0];
  block[SIM_ADDON.DRAG + 1] = at[1];
  block[SIM_ADDON.DRAG + 2] = at[2];
  block[SIM_ADDON.WHEEL_R] = 0;
  block[SIM_ADDON.ROLL_K] = 1;
  return { block, inertia: new Float64Array(I) };
}

/* All up mass with the choice, kg, for the picker's and the hangar's read
 * outs. */
export function combatMass(af, grams, choice) {
  return grams / 1000 + masses(af, choice).reduce((s, x) => s + x.m, 0);
}

/*
 * THE WAR'S PAYLOAD (the doc's section 3). The payload is the warhead, and
 * every defender carries one, so a combat quad in a war flies the payload
 * whose warhead it may carry:
 *
 *   `allowed`   the warheads this pilot may carry (the campaign's owned
 *               ones and 'standard'; all four outside the campaign)
 *   `fallback`  the one to carry when the choice is not allowed or is
 *               'none' (the campaign's equipped warhead, else 'standard')
 *
 * Returns { payload, warhead }: the payload id to seat and the warhead to
 * say in the loadout. An aircraft without a combat block returns null and
 * its loadout is what it always was.
 */
export function warPayload(af, choice, allowed = WARHEADS, fallback = 'standard') {
  if (!af || !af.combat) {
    return null;
  }
  const ok = (p) => p && p.warhead && allowed.includes(p.warhead);
  const chosen = payloadOf(af, choice);
  const p = ok(chosen) ? chosen
    : af.combat.payloads.find((x) => x.warhead === fallback && ok(x))
      ?? af.combat.payloads.find((x) => x.warhead === 'standard');
  return { payload: p.id, warhead: p.warhead };
}

/* The payload a seat's room loadout says, for drawing a peer's combat quad
 * and seating one's own in a war: the payload whose warhead it is, else the
 * standard one. */
export function payloadForWarhead(af, warhead) {
  if (!af || !af.combat) {
    return null;
  }
  return (af.combat.payloads.find((p) => p.warhead === warhead)
    ?? af.combat.payloads.find((p) => p.warhead === 'standard')).id;
}
