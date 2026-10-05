/*
 * roles.js: who flies which job in an ops mission (docs/campaign/interior/
 * TECH-NEEDS.md N16, MISSIONS.md 1.5, CONTRACT-P0.md section 5). Campaign
 * agnostic: a mission's data lists its roles, `[{ id, core, guide,
 * platforms }]`, and nothing here knows any campaign's names.
 *
 * THE STATE, plain data kept in the room's match:
 *
 *   held    { seat: [key] }: a core role's key is its id ('isr'); a
 *           scaling role's copies are its id and a number ('tracker:2'),
 *           numbered from 1 in the order they were made, never reused
 *   active  { seat: key | null }: the one of its roles each seat flies now
 *   locked  the host's lock
 *   swaps   [{ id, from, to, give, take, until }]: requests waiting for
 *           the asked seat (to) to accept, until room ms `until`
 *   copies  { roleId: the last copy number made }
 *   nextSwap
 *
 * THE INVARIANTS, restored by settle() after every change: while any seat
 * is here, every core role is held by exactly one seat, and every seat
 * holds at least one role when the mission has a scaling role. So nothing
 * a pilot does can leave the mission without its core, and nobody is left
 * with nothing to do (MISSIONS.md 1.5: "never an idle seat"). No upper
 * bound on seats or copies anywhere.
 *
 * Pure: the room's clock and the match's seed are handed in.
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

import { draw } from '../war/stages.js';

/* A swap request waits this long for the asked pilot. */
export const SWAP_MS = 20000;

const SALT_DEAL = 0x524f4c45;

/* The role id of a key: 'tracker:2' is a 'tracker'. */
export function roleOf(key) {
  const i = key.indexOf(':');
  return i < 0 ? key : key.slice(0, i);
}

const seatsOf = (state) => Object.keys(state.held).map(Number).sort((a, b) => a - b);

function holderOf(state, key) {
  const seat = seatsOf(state).find((s) => state.held[s].includes(key));
  return seat ?? null;
}

/* A new copy of the scaling role with the fewest copies held now, the
 * mission's order on a tie; null for a mission with none. */
function newCopy(state, defs) {
  const scaling = defs.filter((d) => !d.core);
  if (!scaling.length) {
    return null;
  }
  const count = (id) => seatsOf(state).reduce((n, s) => n + state.held[s].filter((k) => roleOf(k) === id && k !== id).length, 0);
  let best = scaling[0];
  for (const d of scaling) {
    if (count(d.id) < count(best.id)) {
      best = d;
    }
  }
  state.copies[best.id] = (state.copies[best.id] ?? 0) + 1;
  return `${best.id}:${state.copies[best.id]}`;
}

/* The seat holding fewest roles, the lower seat on a tie. */
function fewest(state) {
  let best = null;
  for (const s of seatsOf(state)) {
    if (best == null || state.held[s].length < state.held[best].length) {
      best = s;
    }
  }
  return best;
}

/*
 * The invariants back (above): requests dropped once lapsed or once a key
 * of theirs changed hands; each unheld core role to the seat holding
 * fewest; each seat with nothing given a new scaling copy, in `order`
 * (ascending seats without one); and each seat's active role one it holds.
 */
function settle(state, defs, now, order = null) {
  state.swaps = state.swaps.filter((w) => w.until >= now && state.held[w.from] && state.held[w.to]
    && (w.give == null || state.held[w.from].includes(w.give)) && (w.take == null || state.held[w.to].includes(w.take)));
  if (!seatsOf(state).length) {
    return state;
  }
  for (const d of defs.filter((x) => x.core)) {
    if (holderOf(state, d.id) == null) {
      state.held[fewest(state)].push(d.id);
    }
  }
  for (const s of order ?? seatsOf(state)) {
    if (!state.held[s].length) {
      const key = newCopy(state, defs);
      if (key) {
        state.held[s].push(key);
      }
    }
  }
  for (const s of seatsOf(state)) {
    if (!state.held[s].includes(state.active[s])) {
      state.active[s] = state.held[s][0] ?? null;
    }
  }
  for (const s of Object.keys(state.active).map(Number)) {
    if (!state.held[s]) {
      delete state.active[s];
    }
  }
  return state;
}

/*
 * The deal at the go: the seats in an order the seed shuffles, the core
 * roles dealt round them (one seat holds them all, two split them, and so
 * on), then a scaling copy for each seat still without a role, in the
 * shuffled order. The same seed and seats give the same deal.
 */
export function deal(defs, seats, seed, now = 0) {
  const order = [...seats].sort((a, b) => a - b);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(draw((seed ^ SALT_DEAL) >>> 0, i) * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const state = {
    held: Object.fromEntries(order.map((s) => [s, []])), active: {}, locked: false, swaps: [], copies: {}, nextSwap: 1,
  };
  defs.filter((d) => d.core).forEach((d, i) => {
    if (order.length) {
      state.held[order[i % order.length]].push(d.id);
    }
  });
  return settle(state, defs, now, order);
}

/* A seat arriving after the deal: the first unheld core role, else a new
 * scaling copy (settle does both). A seat already dealt keeps its roles. */
export function join(state, defs, seat, now) {
  if (!state.held[seat]) {
    state.held[seat] = [];
  }
  return settle(state, defs, now);
}

/* A seat gone: its core roles pass to the seat holding fewest, its copies
 * end. */
export function leave(state, defs, seat, now) {
  delete state.held[seat];
  delete state.active[seat];
  return settle(state, defs, now);
}

/*
 * Seat `seat` takes role `id`: an unheld core role, or a new copy of a
 * scaling role. It drops its scaling copies, one job of that kind each;
 * the core roles it holds stay held. Returns null, or why not: 'role'
 * (no such role, or a core role somebody holds), 'seat'.
 */
export function take(state, defs, seat, id, now) {
  const def = defs.find((d) => d.id === id);
  if (!state.held[seat]) {
    return 'seat';
  }
  if (!def || (def.core && holderOf(state, id) != null)) {
    return 'role';
  }
  const key = def.core ? id : newCopy(state, [def]);
  state.held[seat] = [...state.held[seat].filter((k) => defs.find((d) => d.id === roleOf(k))?.core), key];
  state.active[seat] = key;
  settle(state, defs, now);
  return null;
}

/* The role a seat flies now, one it holds. Never locked: it changes no
 * job, only which of its own it is on. */
export function setActive(state, seat, key) {
  if (!state.held[seat]?.includes(key)) {
    return 'role';
  }
  state.active[seat] = key;
  return null;
}

/*
 * Seat `from` asks seat `to` to swap: `give` a key it holds, `take` a key
 * the other holds, either null but not both. A later request between the
 * same two replaces the earlier. Returns the request, or why not.
 */
export function ask(state, from, to, give, take, now) {
  if (from === to || !state.held[from] || !state.held[to]) {
    return { error: 'seat' };
  }
  if ((give == null && take == null) || (give != null && !state.held[from].includes(give)) || (take != null && !state.held[to].includes(take))) {
    return { error: 'swap' };
  }
  state.swaps = state.swaps.filter((w) => !(w.from === from && w.to === to));
  const w = {
    id: state.nextSwap, from, to, give: give ?? null, take: take ?? null, until: now + SWAP_MS,
  };
  state.nextSwap += 1;
  state.swaps.push(w);
  return { swap: w };
}

/* The asked seat accepts request `id`: the keys change hands at once.
 * Returns null, or why not ('swap': none such for this seat, lapsed, or
 * a key that has moved since). */
export function accept(state, defs, seat, id, now) {
  settle(state, defs, now);
  const w = state.swaps.find((x) => x.id === id && x.to === seat);
  if (!w) {
    return 'swap';
  }
  state.swaps = state.swaps.filter((x) => x !== w);
  if (w.give != null) {
    state.held[w.from] = state.held[w.from].filter((k) => k !== w.give);
    state.held[w.to].push(w.give);
  }
  if (w.take != null) {
    state.held[w.to] = state.held[w.to].filter((k) => k !== w.take);
    state.held[w.from].push(w.take);
  }
  settle(state, defs, now);
  return null;
}

export function decline(state, seat, id) {
  const had = state.swaps.length;
  state.swaps = state.swaps.filter((x) => !(x.id === id && x.to === seat));
  return state.swaps.length < had ? null : 'swap';
}

/* Whether seat `seat` hears a cue tagged `heard`: 'all', { role: [ids] }
 * (a seat holding one of them) or { seat: n }. */
export function hears(state, seat, heard) {
  if (heard == null || heard === 'all') {
    return true;
  }
  if (heard.seat != null) {
    return heard.seat === seat;
  }
  const want = [heard.role].flat();
  return (state?.held[seat] ?? []).some((k) => want.includes(roleOf(k)));
}

/* Whether a seat holds a role (any copy of it). */
export function holds(state, seat, roleIds) {
  const want = [roleIds].flat();
  return (state?.held[seat] ?? []).some((k) => want.includes(roleOf(k)));
}

/* The state with a seat's lapsed requests dropped, for the view. */
export function tidy(state, defs, now) {
  return settle(state, defs, now);
}
