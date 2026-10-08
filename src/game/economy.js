/*
 * economy.js: tokens, the hangar's soft currency, and what they buy
 * (docs/ECONOMY.md). The catalog both sides read: the tracks server pays
 * and sells from it (tracks-api/wallet.js), the page draws the shop from
 * it, so the two can never disagree about a price or a grant.
 *
 * TOKENS ARE PAID FOR FIRSTS, ONCE, AND FOR FLIGHT CLUB EVENTS. A grant has
 * a key, and the server pays a key at most once per account. The keys
 * come from a FINITE list read off the synced record: the firsts that pay
 * XP (src/game/progress.js firstsOf: a known mission's win and stars, a
 * known aircraft's flight time milestones, a known lesson passed) and the
 * seven challenges. Laps
 * and built courses pay XP and never tokens, since anyone can make a new
 * course. So repetition pays nothing, and the most a record can ever be
 * paid is grantCeiling(), whatever is written in it.
 *
 * THREE CURRENCIES, NEVER EXCHANGED: XP opens level locks, the war's
 * credits buy its loadout (src/game/campaign.js), tokens buy cosmetics.
 * Nothing here reads or writes credits, and nothing here changes flight.
 *
 * ITEMS are bought (a price) or earned (`earn`, a feat the record shows,
 * never for sale). Unlock all opens neither: they are owned, not unlocked.
 *
 * Pure: no DOM, so the server and the selftests import it in Node.
 *
 *  * This file is part of the Paraguayan Drone Combat Simulator.
 *  *
 *  * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 *  * it under the terms of the GNU General Public License as published by
 *  * the Free Software Foundation, either version 3 of the License, or (at
 *  * your option) any later version.
 *  *
 *  * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 *  * WITHOUT ANY WARRANTY, without even the implied warranty of
 *  * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 *  * General Public License for more details.
 *  *
 *  * You should have received a copy of the GNU General Public License
 *  * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { CHALLENGES, everyFirst, firstsOf } from './progress.js';
import { MAX_STARS, cleanCampaign } from './campaign.js';
import { flightTotals } from '../share/flighttime.js';
import { KITS } from '../../configs/kits.js';

/* Tokens a first pays, by the kind of first (progress.js firstsOf keys). */
export const FIRST_TOKENS = { win: 60, star: 30, flight: 10, ten: 20, hour: 60, lesson: 20 };
export const CHALLENGE_TOKENS = 50;

/*
 * A Flight Club weekly event's payout (agreed with the flightclub lane,
 * IMPLEMENTATION-PLAN.md 2026-10-07): a placing pays its tier and every
 * tier under it, each once per event, so flying an event again pays
 * nothing new and a gold after a bronze pays only the difference.
 */
export const EVENT_TIERS = { finish: 20, bronze: 40, silver: 60, gold: 100 };
const TIER_ORDER = Object.keys(EVENT_TIERS);
export const EVENT_ID = /^[a-z0-9-]{1,40}$/;

/*
 * THE SHOP. Bought items carry a price; earned ones carry `earn`, the feat,
 * and no price. Prices are balanced so a pilot who flies everything once
 * has more than the shop costs: the shop is the reason to try something
 * new, not a wall. Every id is `<kind>:<paint id>`: a finish of
 * configs/paint.js FINISHES or a decal kind of DECAL_KINDS.
 */
/* A kit item's price (see kitItems below). */
export const KIT_PRICE = 70;

export const ITEMS = [
  { id: 'finish:satin', kind: 'finish', paint: 'satin', price: 300 },
  { id: 'finish:pearl', kind: 'finish', paint: 'pearl', price: 500 },
  { id: 'finish:candy', kind: 'finish', paint: 'candy', price: 600 },
  { id: 'finish:gold', kind: 'finish', paint: 'gold', earn: 'challenges' },
  { id: 'decal:ribbon', kind: 'decal', paint: 'ribbon', earn: 'three_stars' },
  ...kitItems(),
];

/*
 * THE KIT ITEMS (docs/KITS.md section 7; lead decision 2026-10-08: two
 * sold per family, one earned, the rest free). Per family, from its
 * catalogue: the last option of the third slot (with fewer slots, of the
 * last one) is earned by an hour flown on that aircraft, and the last
 * option of each of the first two slots not earned is sold. Read off the
 * catalogue so a family's items follow it when its options change.
 * KIT_PRICE (above ITEMS, which needs it first) keeps "flying everything once buys the whole shop" true with
 * every family's two (economy-selftest holds it).
 */
function kitItems() {
  const out = [];
  for (const [family, slots] of Object.entries(KITS)) {
    const last = (s) => s.options[s.options.length - 1];
    /* A family with fewer than three slots earns before it sells, so
     * every family has its earned option. */
    const earned = slots[2] ?? slots[1] ?? slots[0];
    for (const s of slots.slice(0, 2).filter((x) => x !== earned)) {
      out.push({ id: `kit:${family}:${s.id}:${last(s)}`, kind: 'kit', family, slot: s.id, option: last(s), price: KIT_PRICE });
    }
    if (earned) {
      out.push({ id: `kit:${family}:${earned.id}:${last(earned)}`, kind: 'kit', family, slot: earned.id, option: last(earned), earn: `hour:${family}` });
    }
  }
  return out;
}

/* The kit item for a family's slot option, or null when it is free. */
export function kitItem(family, slot, option) {
  return itemById(`kit:${family}:${slot}:${option}`);
}

export function itemById(id) {
  return ITEMS.find((it) => it.id === id) ?? null;
}

function isRecord(o) {
  return Boolean(o) && typeof o === 'object' && !Array.isArray(o);
}

/* The facts the grants are read from, out of a synced blob ({ v, data },
 * src/share/progressmerge.js), each made safe the way its own module
 * reads it. */
function factsOf(blob) {
  const data = isRecord(blob) && isRecord(blob.data) ? blob.data : {};
  const progress = isRecord(data.progress) ? data.progress : {};
  const done = isRecord(progress.challenges) ? progress.challenges : {};
  return {
    campaign: cleanCampaign(data.campaign),
    seconds: flightTotals(data.flightTime).byAirframe,
    lessons: isRecord(progress.lessons) ? progress.lessons : {},
    flown: isRecord(progress.lessonsFlown) ? progress.lessonsFlown : {},
    challenges: CHALLENGES.filter((c) => done[c.id] === true).map((c) => c.id),
  };
}

function tokensForFirst(key) {
  const [what, , part] = key.split(':');
  if (what === 'lesson') {
    return FIRST_TOKENS.lesson;
  }
  return FIRST_TOKENS[part.startsWith('star') ? 'star' : part];
}

/* Every grant the record shows: [{ key, amount }]. Keys are stable, so
 * the server pays each once however often it is asked. */
export function grantsFrom(blob) {
  const f = factsOf(blob);
  return [
    ...firstsOf(f).map((x) => ({ key: `first:${x.key}`, amount: tokensForFirst(x.key) })),
    ...f.challenges.map((id) => ({ key: `challenge:${id}`, amount: CHALLENGE_TOKENS })),
  ];
}

/* The earned items the record shows: their ids. */
export function earnedFrom(blob) {
  const f = factsOf(blob);
  const feats = {
    challenges: f.challenges.length === CHALLENGES.length,
    three_stars: Object.values(f.campaign.missions).some((m) => m.stars >= MAX_STARS),
  };
  for (const [id, secs] of Object.entries(f.seconds)) {
    if (secs >= 3600) {
      feats[`hour:${id}`] = true;
    }
  }
  return ITEMS.filter((it) => it.earn && feats[it.earn]).map((it) => it.id);
}

/* The grants an event placing pays: its tier and those under it. */
export function eventGrants(eventId, tier) {
  if (!EVENT_ID.test(String(eventId)) || !Object.hasOwn(EVENT_TIERS, tier)) {
    return [];
  }
  return TIER_ORDER.slice(0, TIER_ORDER.indexOf(tier) + 1).map((t) => ({ key: `event:${eventId}:${t}`, amount: EVENT_TIERS[t] }));
}

/* The most any record can be paid, events aside: every first and every
 * challenge, once. */
export function grantCeiling() {
  return everyFirst().reduce((n, x) => n + tokensForFirst(x.key), 0) + CHALLENGES.length * CHALLENGE_TOKENS;
}
