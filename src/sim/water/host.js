/*
 * host.js: a flood stepped on the war room's clock from the openings the
 * room sends, so that every client holds the same water to the bit
 * whenever it heard of each opening (docs/FLOOD.md, THE CLOCK).
 *
 *   ORIGIN. Until the first opening the flood is its starting state and
 *   is not stepped: the water every client loaded. The origin is the
 *   earliest opening's room time; step s covers origin + s DT_MS.
 *
 *   AN OPENING whose room time is `at` is applied before step
 *   ceil((at - origin) / DT_MS), in the order (step, at, id) when more
 *   than one falls on a step. That index depends only on the openings,
 *   never on when a client heard of them.
 *
 *   THE DELAY. The flood runs DELAY_MS behind the room's clock, so an
 *   opening heard less than that after its `at` is applied where it
 *   belongs with nothing redone. One heard later than that (a stalled
 *   tab, a lost packet) rewinds the flood to the last snapshot at or
 *   before its step, kept every SNAP_STEPS, and steps again; one older
 *   than every snapshot, or earlier than the origin, starts the flood
 *   again from its starting state. A late joiner is the same case: it
 *   is handed every opening at once (the war's list) and steps from the
 *   origin to the room's clock.
 *
 *   A CLOCK THAT GOES BACK (a replay's playhead) rewinds the water to
 *   that time the same way, and forward again steps it on: the water at
 *   a room time is the same however the clock got there.
 *
 *   THE BUDGET. advance steps at most until a budget of wall clock is
 *   spent; what it does not reach this call it reaches on a later one.
 *   Wall clock decides only how soon a client sees the water, never what
 *   the water is.
 *
 * The flood is any host's: `flood` gives the solver (`f`, flood.js's)
 * and `apply(opening)`, which turns a contract opening into changes to
 * the solver's bed and links, and `reset()`, which puts them back as
 * they started. Applying the same openings in the same order after a
 * reset must make the same changes; the host relies on it to rewind.
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

/* How far the flood runs behind the room's clock, ms: past the time a
 * damage event takes to reach every seat on a sound link. */
export const DELAY_MS = 1000;
/* A snapshot every so many steps, and how many are kept. */
export const SNAP_STEPS = 100;
export const SNAPS = 4;

/* The order openings on one step are applied in. */
function before(a, b) {
  if (a.step !== b.step) return a.step - b.step;
  if (a.o.at !== b.o.at) return a.o.at - b.o.at;
  return a.o.id < b.o.id ? -1 : a.o.id > b.o.id ? 1 : 0;
}

export function createFloodHost(flood, { dtMs, delayMs = DELAY_MS, snapSteps = SNAP_STEPS, snaps = SNAPS } = {}) {
  if (!(dtMs > 0)) {
    throw new Error('flood host: dtMs must be positive');
  }
  const { f } = flood;
  const start = [f.h().slice(), f.hu().slice(), f.hv().slice()];
  let origin = null;
  let step = 0;
  /* Every opening heard, each { o, step }, in the order applied. */
  let heard = [];
  /* How many of `heard` the water has had applied. */
  let applied = 0;
  let ring = [];
  const stats = {
    rewinds: 0, restarts: 0, steps: 0,
  };
  /* The state's hash at every snapshot step, the last HASHES of them:
   * two clients that stepped to the same step can be held to the same
   * water there (scripts/water-war.js). */
  const hashes = new Map();
  const HASHES = 64;

  const save = () => {
    hashes.set(step, f.hash());
    if (hashes.size > HASHES) hashes.delete(hashes.keys().next().value);
    ring = ring.filter((r) => r.step !== step);
    ring.push({ step, applied, state: [f.h().slice(), f.hu().slice(), f.hv().slice()] });
    if (ring.length > snaps) ring.shift();
  };
  const load = (state) => {
    f.h().set(state[0]);
    f.hu().set(state[1]);
    f.hv().set(state[2]);
  };
  /* Back to the starting water, nothing applied. */
  const restart = () => {
    load(start);
    flood.reset();
    step = 0;
    applied = 0;
    ring = [];
    /* Steps from a new origin are other times: their hashes too. */
    hashes.clear();
    stats.restarts += 1;
  };
  /* Back to the last snapshot at or before step s (taken before that
   * step's openings, so the first snap.applied heard are its). */
  const rewind = (s) => {
    let snap = null;
    for (const r of ring) {
      if (r.step <= s && (!snap || r.step > snap.step)) snap = r;
    }
    if (!snap) {
      restart();
      return;
    }
    load(snap.state);
    flood.reset();
    for (let k = 0; k < snap.applied; k += 1) {
      flood.apply(heard[k].o);
    }
    step = snap.step;
    applied = snap.applied;
    ring = ring.filter((r) => r.step <= snap.step);
    stats.rewinds += 1;
  };

  return {
    stats,
    /* The step the water is at, and the room time it stands for. */
    step: () => step,
    /* { step: hash } at the snapshot steps kept. */
    hashes: () => Object.fromEntries(hashes),
    origin: () => origin,
    roomMs: () => (origin === null ? null : origin + step * dtMs),
    /* A contract opening, heard. The same id heard again is its new size,
     * applied after the old one. */
    open(o) {
      if (!o || typeof o.at !== 'number' || !Number.isFinite(o.at) || typeof o.id !== 'string') {
        throw new Error('flood host: an opening needs a finite room time `at` and an `id`');
      }
      if (heard.some((h) => h.o.id === o.id && h.o.at === o.at)) {
        return;
      }
      if (origin === null || o.at < origin) {
        /* A new origin moves every step: start again from the water
         * everyone loaded. */
        if (origin !== null) restart();
        origin = o.at;
        heard = heard.map((h) => ({ o: h.o, step: Math.ceil((h.o.at - origin) / dtMs) }));
      }
      const entry = { o, step: Math.ceil((o.at - origin) / dtMs) };
      heard.push(entry);
      heard.sort(before);
      if (heard.indexOf(entry) < applied || entry.step < step) {
        /* It belongs before water already stepped: redo from there. */
        rewind(entry.step);
      }
    },
    /*
     * Step toward the room's clock `nowMs` less the delay, for at most
     * `budgetMs` of `clock()` wall time (and at most `maxSteps`). Returns
     * the steps taken.
     */
    advance(nowMs, { budgetMs = Infinity, clock = () => 0, maxSteps = Infinity } = {}) {
      if (origin === null) return 0;
      const target = Math.floor((nowMs - delayMs - origin) / dtMs);
      if (target < step) {
        /* The clock went back (a replay's playhead): the water it shows
         * is the water then, from the last snapshot before it or from
         * the start. */
        rewind(Math.max(0, target));
      }
      const t0 = clock();
      let taken = 0;
      while (step < target && taken < maxSteps) {
        if (taken > 0 && clock() - t0 >= budgetMs) break;
        /* The snapshot before the step's openings: everything it has
         * applied falls on an earlier step, so an opening heard later for
         * this step or after sorts after all of it. */
        if (step % snapSteps === 0) save();
        while (applied < heard.length && heard[applied].step <= step) {
          flood.apply(heard[applied].o);
          applied += 1;
        }
        f.step(1);
        step += 1;
        taken += 1;
      }
      stats.steps += taken;
      return taken;
    },
    /* How far behind the room's clock less the delay the water is. */
    behind(nowMs) {
      return origin === null ? 0 : Math.max(0, Math.floor((nowMs - delayMs - origin) / dtMs) - step);
    },
  };
}
