/*
 * combat.js: a combat quad's payload and accessories, docs/COMBAT-DRONES.md.
 * What the pilot chose, made valid; what it hands the plant; and which
 * payload a war flies. Data and plain arithmetic only, the same in Node and
 * every browser: the plant gets numbers between runs and does the physics
 * itself, so nothing here is on the 1 kHz path.
 *
 * THE CONTRACT (the doc's sections 2 and 7)
 *
 *   airframe.combat = { frame, payloads, accessories, propulsion?, ballast? },
 *     configs/airframes.js; `propulsion` only on an aircraft with more
 *     than one way to be pushed (the Striker), each { id, simId, ... };
 *     `ballast` ({ at_m }) only on one trimmed for its payloads with nose
 *     lead (the Striker, trimBallastKg below)
 *   settings.combat[airframeId] = { payload, accessories, propulsion? }
 *     payload      a payload id of that airframe's, or 'none'
 *     accessories  ids of that airframe's, in its own order
 *     propulsion   a propulsion id of that airframe's, only where it has
 *                  them; its first is the default
 *   A pilot who never chose has no entry and flies the default: the
 *   payload carrying the standard warhead, which every combat airframe has
 *   (its id is 'standard' on the 7 and 10 inch and the Striker), no
 *   accessories, and the first propulsion where there is one, except where
 *   UNCHOSEN below says otherwise.
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

/* The war's warheads, edge/rooms/war.js WARHEADS, in its order. */
const WARHEADS = ['standard', 'wide', 'penetrator', 'emp'];

/*
 * THE PAYLOAD AN AIRCRAFT FLIES WHEN ITS PILOT NEVER CHOSE ONE, where it is
 * not the standard warhead's. The interceptor is the racer since the five
 * inch went (the owner, 2026-10-03: payload 'none' outside wars), so it
 * flies bare. A war seats a warhead on 'none' anyway (warPayload below), so
 * the bare default reaches only Track Day and free flight. Here and not in
 * the airframe's combat block, which is scripts/combat-derive.js's parts
 * list; this is a choice about the game.
 */
const UNCHOSEN = { interceptor: NO_PAYLOAD };

/* The payload a combat quad flies when nothing else says which: the one
 * with the standard warhead, the warhead every pilot owns. */
function standardPayload(c) {
  return c.payloads.find((p) => p.warhead === 'standard');
}

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
    : UNCHOSEN[af.id] ?? standardPayload(c).id;
  const want = Array.isArray(s.accessories) ? s.accessories : [];
  const accessories = c.accessories.filter((a) => want.includes(a.id)).map((a) => a.id);
  if (!c.propulsion) {
    return { payload, accessories };
  }
  const propulsion = c.propulsion.some((x) => x.id === s.propulsion) ? s.propulsion : c.propulsion[0].id;
  return { payload, accessories, propulsion };
}

/* The propulsion entry the choice flies, or null for an aircraft with
 * one way to be pushed. */
export function propulsionOf(af, choice) {
  const list = af && af.combat && af.combat.propulsion;
  if (!list) {
    return null;
  }
  return list.find((x) => x.id === (choice && choice.propulsion)) ?? list[0];
}

/* The plant a choice seats, sim_set_airframe's argument: the propulsion's
 * own where the aircraft has them (each is its own plant: the engine is
 * its mass, its CG and its thrust law), else the airframe's. */
export function combatSimId(af, choice) {
  const p = propulsionOf(af, choice);
  return p ? p.simId : af.simId;
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
 * an accessory is a point). The descriptor's points are about the first
 * propulsion's CG; another's sits cgDz_m higher (the Striker's turbojet
 * rides over its tail), so its points are that much lower about it.
 */
function masses(af, choice) {
  const out = [];
  const pr = propulsionOf(af, choice);
  const dz = pr ? pr.cgDz_m : 0;
  const about = (at) => (dz ? [at[0], at[1], at[2] - dz] : at);
  const p = payloadOf(af, choice);
  if (p) {
    const r = p.dims.d / 2;
    const L = p.dims.len;
    const across = p.massKg * (3 * r * r + L * L) / 12;
    out.push({ m: p.massKg, at: about(p.cgOffset_m), own: [p.massKg * r * r / 2, across, across] });
  }
  for (const id of choice ? choice.accessories : []) {
    const a = af.combat.accessories.find((x) => x.id === id);
    out.push({ m: a.massKg, at: about(a.cgOffset_m), own: [0, 0, 0] });
  }
  const bay = af.combat.ballast;
  if (bay) {
    const kg = trimBallastKg((pr ? pr.grams : af.grams) / 1000, af.combat.payloads, p, bay.at_m[0]);
    if (kg > 0) {
      out.push({ m: kg, at: about(bay.at_m), own: [0, 0, 0] });
    }
  }
  return out;
}

/*
 * THE TRIM BALLAST, docs/COMBAT-DRONES.md section 7.5: on an airframe whose
 * combat block names a `ballast` point, the nose bay takes the lead that
 * brings the CG, fore and aft, to where the most nose heavy payload puts it,
 * whatever is carried (`payload` null for none). The airframe's mass is
 * `bareKg`, every x about its CG, the ballast at `atX` ahead of all of them.
 * Kilograms, zero for that heaviest payload itself.
 */
export function trimBallastKg(bareKg, payloads, payload, atX) {
  const xOf = (p) => p.massKg * p.cgOffset_m[0] / (bareKg + p.massKg);
  const xTrim = Math.max(...payloads.map(xOf));
  if (!(atX > xTrim)) {
    throw new Error(`combat: the ballast point ${atX} m is not ahead of the trim point ${xTrim} m`);
  }
  const m = payload ? payload.massKg : 0;
  const mx = payload ? payload.massKg * payload.cgOffset_m[0] : 0;
  return Math.max(0, (xTrim * (bareKg + m) - mx) / (atX - xTrim));
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
  /* The payload's drag at the payload, which masses() put first. */
  const at = p ? ms[0].at : c;
  block[SIM_ADDON.DRAG] = at[0];
  block[SIM_ADDON.DRAG + 1] = at[1];
  block[SIM_ADDON.DRAG + 2] = at[2];
  block[SIM_ADDON.WHEEL_R] = 0;
  block[SIM_ADDON.ROLL_K] = 1;
  return { block, inertia: new Float64Array(I) };
}

/* All up mass with the choice, kg, for the picker's and the hangar's read
 * outs: on the propulsion's own bare mass where the aircraft has them. */
export function combatMass(af, grams, choice) {
  const pr = propulsionOf(af, choice);
  return (pr ? pr.grams : grams) / 1000 + masses(af, choice).reduce((s, x) => s + x.m, 0);
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
 * A quad with no payload for the fallback's warhead (the interceptor
 * carries only the standard) carries its standard one.
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
      ?? standardPayload(af.combat);
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
    ?? standardPayload(af.combat)).id;
}
