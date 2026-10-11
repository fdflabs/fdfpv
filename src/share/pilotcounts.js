/*
 * pilotcounts.js: how many flights this pilot has flown, and what the
 * pilot made of Catch the Ace! and Trick Battle, kept as the pilot's own
 * record and merged the way the time in the air is (docs/PILOT-STATS.md).
 *
 * THE RECORD is settings.pilotCounts, synced as its own section
 * (src/share/progressmerge.js, kind 'counts'):
 *
 *   { [device]: { flights: { [activity]: n },
 *                 tag: { played, won, best }, jam: { played, won, best } } }
 *
 * `device` is the browser's id from src/share/flighttime.js deviceId, the
 * same slot key as the time in the air. A FLIGHT is a run that logged at
 * least one whole second airborne (src/main.js commitFlightTime): the
 * clock that counts the hours says it flew, so a run abandoned on the
 * stand or crashed on the first hop is not one. `played` and `won` are
 * finished matches this pilot had a seat in, `best` the pilot's highest
 * score in one (Catch the Ace: points; Trick Battle: the best run's
 * total), all read from the room's final standings (src/main.js).
 *
 * THE MERGE is flighttime.js's: every browser adds only to its own slot,
 * a slot only grows, and two copies merge counter by counter to the
 * larger. Totals sum the slots (best: the highest of them). So two
 * computers each keep their counts, a slot sent twice is counted once,
 * and an old copy never takes a count away.
 *
 * It is its own section and not part of flightTime on purpose: a server
 * that does not know a section drops it from its answer and the page
 * then keeps its own, where a flightTime slot with new keys would come
 * back stripped and overwrite them.
 *
 * MIGRATION: a profile from before this file has no section and reads as
 * nought everywhere. That is the honest start: the hours cannot be
 * turned back into launches, and no round's score was ever kept.
 *
 * Pure and DOM free, so the tracks server merges with it and the
 * selftests run it in Node.
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

/* The room games whose results are kept. */
export const COUNTED_GAMES = ['tag', 'jam'];
const GAME_FIELDS = ['played', 'won', 'best'];

const DEVICE_RE = /^[a-z0-9]{8,32}$/;
const ACTIVITY_RE = /^[a-z0-9_-]{1,40}$/;
/* A ceiling no honest counter or score reaches, so a hand edited blob
 * cannot make a sum that is not a safe integer. */
const COUNT_MAX = 1e9;

function isRecord(o) {
  return Boolean(o) && typeof o === 'object' && !Array.isArray(o);
}

function count(v) {
  return Number.isInteger(v) && v > 0 && v <= COUNT_MAX;
}

/* In key order, so one record has one spelling (the sync compares
 * records as text, as flighttime.js says). */
function sorted(o) {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function cleanSlot(raw) {
  if (!isRecord(raw)) {
    return null;
  }
  const slot = {};
  const flights = {};
  for (const [act, n] of Object.entries(isRecord(raw.flights) ? raw.flights : {})) {
    if (ACTIVITY_RE.test(act) && count(n)) {
      flights[act] = n;
    }
  }
  if (Object.keys(flights).length) {
    slot.flights = sorted(flights);
  }
  for (const game of COUNTED_GAMES) {
    const g = isRecord(raw[game]) ? raw[game] : {};
    const kept = {};
    for (const f of GAME_FIELDS) {
      if (count(g[f])) {
        kept[f] = g[f];
      }
    }
    if (Object.keys(kept).length) {
      slot[game] = sorted(kept);
    }
  }
  return Object.keys(slot).length ? sorted(slot) : null;
}

/* The record with only what has the right shape. */
export function cleanPilotCounts(raw) {
  const out = {};
  if (!isRecord(raw)) {
    return out;
  }
  for (const [device, slot] of Object.entries(raw)) {
    const clean = DEVICE_RE.test(device) ? cleanSlot(slot) : null;
    if (clean) {
      out[device] = clean;
    }
  }
  return sorted(out);
}

function maxOf(a, b) {
  const out = {};
  for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    out[k] = Math.max((a && a[k]) || 0, (b && b[k]) || 0);
  }
  return out;
}

/* Two records, one: per device, per counter, the larger. Commutative,
 * associative and idempotent. */
export function mergePilotCounts(a, b) {
  const x = cleanPilotCounts(a);
  const y = cleanPilotCounts(b);
  const out = {};
  for (const device of new Set([...Object.keys(x), ...Object.keys(y)])) {
    const p = x[device] || {};
    const q = y[device] || {};
    const slot = { flights: maxOf(p.flights, q.flights) };
    for (const game of COUNTED_GAMES) {
      slot[game] = maxOf(p[game], q[game]);
    }
    out[device] = slot;
  }
  return cleanPilotCounts(out);
}

function withSlot(record, device, change) {
  if (!DEVICE_RE.test(device)) {
    throw new Error(`pilotcounts: bad device ${device}`);
  }
  const out = cleanPilotCounts(record);
  const slot = out[device] || {};
  out[device] = change({ flights: { ...(slot.flights || {}) }, tag: { ...(slot.tag || {}) }, jam: { ...(slot.jam || {}) } });
  return cleanPilotCounts(out);
}

/* The record with one more flight on this device's slot. */
export function addFlightCount(record, device, activity) {
  if (!ACTIVITY_RE.test(String(activity))) {
    throw new Error(`addFlightCount: bad activity ${activity}`);
  }
  return withSlot(record, device, (s) => {
    s.flights[activity] = Math.min(COUNT_MAX, (s.flights[activity] || 0) + 1);
    return s;
  });
}

/* The record with one finished match of `game` on this device's slot:
 * won or not, and the pilot's score in it. */
export function addGameResult(record, device, game, { won, score }) {
  if (!COUNTED_GAMES.includes(game)) {
    throw new Error(`addGameResult: bad game ${game}`);
  }
  return withSlot(record, device, (s) => {
    const g = s[game];
    g.played = Math.min(COUNT_MAX, (g.played || 0) + 1);
    if (won) {
      g.won = Math.min(COUNT_MAX, (g.won || 0) + 1);
    }
    const pts = Math.min(COUNT_MAX, Math.max(0, Math.round(Number(score) || 0)));
    g.best = Math.max(g.best || 0, pts);
    return s;
  });
}

/* What the page shows, over every device: flights in all, and per game
 * matches played, won and the best score. */
export function countTotals(record) {
  const out = { flights: 0, tag: { played: 0, won: 0, best: 0 }, jam: { played: 0, won: 0, best: 0 } };
  for (const slot of Object.values(cleanPilotCounts(record))) {
    for (const n of Object.values(slot.flights || {})) {
      out.flights += n;
    }
    for (const game of COUNTED_GAMES) {
      const g = slot[game] || {};
      out[game].played += g.played || 0;
      out[game].won += g.won || 0;
      out[game].best = Math.max(out[game].best, g.best || 0);
    }
  }
  return out;
}
