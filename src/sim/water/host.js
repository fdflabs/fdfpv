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
 *   CHECKPOINTS. Every CHECK_STEPS (10 s) a copy of the water is kept as
 *   well, CHECKS of them, so the last 40 s or more are always held: the
 *   crash cam's 30 s window and the flood's second behind the room. A
 *   rewind goes to the latest snapshot or checkpoint before its step; a
 *   replay's flood (water/live.js fork) starts from one of another host's
 *   (checkpoint, resume) instead of from the origin.
 *
 * onSave(step), if given, is called at every snapshot step with the
 * water as it stands there, and onDrop(step) when the steps after `step`
 * are to be stepped again (a rewind, a start again): a host that keeps
 * something of each snapshot step (live.js's levels for the plant) keeps
 * it right through both.
 *
 * The flood is any host's: `flood` gives the solver (`f`, flood.js's)
 * and `apply(opening)`, which turns a contract opening into changes to
 * the solver's bed and links, and `reset()`, which puts them back as
 * they started. Applying the same openings in the same order after a
 * reset must make the same changes; the host relies on it to rewind.
 * A flood with changes that run over time (a gate's leaf moving) has
 * `tick(roomMs)` too, called before every step with the room time it
 * stands for, after that step's openings.
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

/* How far the flood runs behind the room's clock, ms: past the time a
 * damage event takes to reach every seat on a sound link. */
export const DELAY_MS = 1000;
/* A snapshot every so many steps, and how many are kept. */
export const SNAP_STEPS = 100;
export const SNAPS = 4;
/* A checkpoint every so many steps (a multiple of SNAP_STEPS), and how
 * many are kept: 5 x 10 s. Each is 3 doubles a cell, 1.44 MB on Itaipu's
 * 59 904 cells, 7.2 MB for the five. */
export const CHECK_STEPS = 500;
export const CHECKS = 5;

/* What an opening says beyond its id and time: the same id heard again
 * with another shape (a hole moved with its leaf, grown) is another
 * event, the same shape again is the same one. */
const shape = (o) => JSON.stringify([o.sill, o.width_m, o.height_m, o.open_m]);

/* An opening as one event: two hosts that heard the same are the same. */
const key = (o) => `${o.id}|${o.at}|${shape(o)}`;

/* The order openings on one step are applied in: by time, then id, then
 * shape, so two shapes of one id at one time fall the same on every
 * client however they were heard. */
function before(a, b) {
  if (a.step !== b.step) return a.step - b.step;
  if (a.o.at !== b.o.at) return a.o.at - b.o.at;
  if (a.o.id !== b.o.id) return a.o.id < b.o.id ? -1 : 1;
  const sa = shape(a.o); const sb = shape(b.o);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

export function createFloodHost(flood, {
  dtMs, delayMs = DELAY_MS, snapSteps = SNAP_STEPS, snaps = SNAPS, checkSteps = CHECK_STEPS, checks = CHECKS, onSave = null, onDrop = null,
} = {}) {
  if (!(dtMs > 0)) {
    throw new Error('flood host: dtMs must be positive');
  }
  if (!(checkSteps > 0 && checkSteps % snapSteps === 0)) {
    throw new Error('flood host: checkSteps must be a multiple of snapSteps');
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
  /* The checkpoints, as the ring's entries: { step, applied, state }.
   * Their arrays are never written once kept, so another host may hold
   * the same ones (resume). */
  let kept = [];
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
    if (onSave) onSave(step);
    if (hashes.size > HASHES) hashes.delete(hashes.keys().next().value);
    ring = ring.filter((r) => r.step !== step);
    const snap = { step, applied, state: [f.h().slice(), f.hu().slice(), f.hv().slice()] };
    ring.push(snap);
    if (ring.length > snaps) ring.shift();
    if (step % checkSteps === 0) {
      kept = kept.filter((r) => r.step !== step);
      kept.push(snap);
      if (kept.length > checks) kept.shift();
    }
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
    kept = [];
    /* Steps from a new origin are other times: their hashes too. */
    hashes.clear();
    if (onDrop) onDrop(-1);
    stats.restarts += 1;
  };
  /* Back to the last snapshot or checkpoint at or before step s (taken
   * before that step's openings, so the first snap.applied heard are
   * its). */
  const rewind = (s) => {
    let snap = null;
    for (const r of [...ring, ...kept]) {
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
    if (onDrop) onDrop(snap.step);
    ring = ring.filter((r) => r.step <= snap.step);
    kept = kept.filter((r) => r.step <= snap.step);
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
    /* A contract opening, heard. The same id heard again with a new
     * shape (a bigger hole, or the hole moved with its leaf) is applied
     * after the old one and replaces it (the flood's apply does). */
    open(o) {
      if (!o || typeof o.at !== 'number' || !Number.isFinite(o.at) || typeof o.id !== 'string') {
        throw new Error('flood host: an opening needs a finite room time `at` and an `id`');
      }
      if (heard.some((h) => h.o.id === o.id && h.o.at === o.at && shape(h.o) === shape(o))) {
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
        if (flood.tick) flood.tick(origin + step * dtMs);
        f.step(1);
        step += 1;
        taken += 1;
      }
      stats.steps += taken;
      return taken;
    },
    /* Step on, without a budget, until the water stands at `target`:
     * for a reader that needs a step the frames have not reached yet. */
    stepTo(target) {
      if (origin === null || target <= step) return 0;
      return this.advance(origin + delayMs + (target + 1) * dtMs - 1e-6);
    },
    /* The latest checkpoint at or before room time `ms` less the delay
     * (the water drawn then), or null: { origin, step, applied, keys,
     * state }, keys the openings applied by then. */
    checkpoint(ms) {
      if (origin === null) return null;
      const s = Math.floor((ms - delayMs - origin) / dtMs);
      let best = null;
      for (const r of kept) {
        if (r.step <= s && r.step <= step && (!best || r.step > best.step)) best = r;
      }
      if (!best) return null;
      return {
        origin, step: best.step, applied: best.applied, keys: heard.slice(0, best.applied).map((h) => key(h.o)), state: best.state,
      };
    },
    /*
     * Start from another host's checkpoint `cp` (checkpoint) instead of
     * the origin: the same water there, to the bit, when this host has
     * heard the same openings before it, which it checks. True when it
     * did, false (nothing changed) when this host's openings or origin
     * differ there. Call it after opening every event, before advancing.
     */
    resume(cp) {
      if (!cp || cp.origin !== origin || step !== 0 || applied !== 0) return false;
      const before = heard.filter((h) => h.step < cp.step);
      if (before.length !== cp.applied || before.some((h, k) => key(h.o) !== cp.keys[k])) return false;
      load(cp.state);
      flood.reset();
      for (let k = 0; k < cp.applied; k += 1) flood.apply(heard[k].o);
      step = cp.step;
      applied = cp.applied;
      const snap = { step: cp.step, applied: cp.applied, state: cp.state };
      ring = [snap];
      kept = [snap];
      return true;
    },
    /* How far behind the room's clock less the delay the water is. */
    behind(nowMs) {
      return origin === null ? 0 : Math.max(0, Math.floor((nowMs - delayMs - origin) / dtMs) - step);
    },
  };
}
