/*
 * debrief.js: the record a flight's end screen reads (docs/DEBRIEF.md).
 *
 * One plain, JSON safe shape for every activity: result, route, time,
 * accuracy, records, the replay's state and the next actions in order.
 * Each activity has a builder that reads what it already holds at its end
 * (race.js's lap log and record, score.js's summary); the screen reads only
 * the record, so a new activity is a builder and nothing else.
 *
 * Pure: no DOM, no strings. Words are string keys the screen looks up.
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

/* A flight of any length keeps its shape in at most this many points:
 * enough for a top down line a few hundred pixels across. */
export const ROUTE_MAX = 240;
/* One point per this many sim milliseconds until the array is full; each
 * halving doubles it, so the spacing stays even over the whole flight. */
const ROUTE_STEP_MS = 500;

/*
 * The route sampler: the shell hands it the craft's position on the sim
 * clock every frame; it keeps a point per step and, when full, drops every
 * other one and doubles the step. Distance and the highest point are
 * counted on every frame, not on the kept points, so thinning never
 * shortens the flight. The highest point is over the first position, so it
 * reads the same on every map whatever the world's own zero.
 */
export function createRoute() {
  let points = [];
  let step = ROUTE_STEP_MS;
  let nextMs = 0;
  let last = null;
  let distanceM = 0;
  let y0 = null;
  let topM = 0;
  let end = null;
  return {
    reset() {
      points = [];
      step = ROUTE_STEP_MS;
      nextMs = 0;
      last = null;
      distanceM = 0;
      y0 = null;
      topM = 0;
      end = null;
    },
    /* x, y (up), z in metres; simMs the sim clock. */
    add(simMs, x, y, z) {
      if (![simMs, x, y, z].every(Number.isFinite)) {
        return;
      }
      if (last) {
        distanceM += Math.hypot(x - last[0], y - last[1], z - last[2]);
      }
      last = [x, y, z];
      y0 ??= y;
      topM = Math.max(topM, y - y0);
      end = [x, z];
      if (points.length && simMs < nextMs) {
        return;
      }
      points.push([x, z]);
      nextMs = simMs + step;
      if (points.length >= ROUTE_MAX - 1) {
        /* Even indexes, so the first point (the start) always stays. */
        points = points.filter((_, i) => i % 2 === 0);
        step *= 2;
        nextMs = simMs + step;
      }
    },
    /* The record's route, or null for a flight that never moved. The
     * last position is appended so the line ends where the craft did;
     * the sampler keeps one slot free for it, so the total is ROUTE_MAX. */
    snapshot(marks = []) {
      if (!points.length) {
        return null;
      }
      const out = points.map((p) => p.slice());
      const tail = out[out.length - 1];
      if (end && (tail[0] !== end[0] || tail[1] !== end[1])) {
        out.push(end.slice());
      }
      return { points: out, distanceM, topM, marks: marks.map((m) => [m[0], m[1]]) };
    },
  };
}

/* The rows under the cursor, best first. Fly again leads everywhere: it is
 * the one a pilot most often wants after a flight. */
const NEXT = {
  race: ['again', 'replay', 'aircraft', 'title'],
  free: ['again', 'replay', 'aircraft', 'title'],
};

export function nextActions(activity) {
  return (NEXT[activity] ?? ['again', 'title']).slice();
}

/* The replay row's state from the recorder's span ([first, n, t0, t1]):
 * a clip under a second is not worth opening. */
export function replayState(span, replaying = false) {
  if (replaying) {
    return { ok: false, why: 'debrief.replay_open' };
  }
  const t = span ? span[3] - span[2] : 0;
  return t >= 1 ? { ok: true, why: null } : { ok: false, why: 'debrief.replay_short' };
}

/* The aircraft's flight time after this flight, as a record line: never
 * "improved" (it only grows), so improved is null. */
function timeRecord(totalS, flightMs) {
  if (!Number.isFinite(totalS)) {
    return [];
  }
  return [{ what: 'debrief.aircraft_time', now: totalS, before: Math.max(0, totalS - flightMs / 1000), improved: null }];
}

/*
 * A solo race. log: race.js's laps in order ({ n, ms } or { n, ms: null,
 * reason }); recordAtStart the record this run chased; gates the course's
 * gate count and passed the gates passed this flight (null when unknown).
 */
export function fromRace({ aircraft, fixedWing = false, log, recordAtStart, flightMs, totalS, route = null, replay, landed = null, gates = null, passed = null }) {
  const laps = log.filter((l) => Number.isFinite(l.ms)).map((l) => l.ms);
  const fastest = laps.length ? Math.min(...laps) : null;
  const prior = Number.isFinite(recordAtStart) ? recordAtStart : null;
  let kind = 'ended';
  if (fastest != null) {
    kind = prior == null || fastest < prior ? 'record' : fastest === prior ? 'matched' : 'complete';
  }
  const accuracy = [];
  if (log.length) {
    accuracy.push({ what: 'debrief.clean_laps', n: laps.length, of: log.length });
  }
  if (Number.isFinite(gates) && Number.isFinite(passed) && gates > 0) {
    accuracy.push({ what: 'debrief.gates', n: passed, of: gates });
  }
  const records = [];
  if (fastest != null) {
    records.push({ what: 'debrief.track_record', now: fastest, before: prior, improved: prior == null ? true : fastest < prior });
  }
  return {
    activity: 'race',
    aircraft,
    fixedWing,
    result: { kind, landed: fixedWing ? landed : null },
    route,
    time: { flightMs, runMs: fastest },
    accuracy,
    records: records.concat(timeRecord(totalS, flightMs)),
    replay,
    next: nextActions('race'),
  };
}

/*
 * A freestyle run from score.js's summary(). posted is the board's answer
 * when the run was sent ({ score, improved }), else null: the board holds
 * the pilot's best, so the record line is its answer, not a local copy.
 */
/* The record with the board's answer to a posted run as its record line,
 * which arrives after the screen is up. The board answers with its kept
 * score: this run's when it improved (the old best is not sent back), the
 * standing best when it did not. Pure: a new record. */
export function withPosted(d, posted) {
  if (!posted || !Number.isFinite(posted.score)) {
    return d;
  }
  const line = { what: 'debrief.run_best', now: d.score, before: posted.score, improved: posted.improved !== false };
  return { ...d, records: [line, ...d.records.filter((r) => r.what !== 'debrief.run_best')] };
}

export function fromFree({ aircraft, fixedWing = false, summary, flightMs, totalS, route = null, replay, landed = null, posted = null }) {
  const scored = summary.timed !== false;
  const kind = summary.tricks > 0 ? 'complete' : 'ended';
  const accuracy = [];
  if (summary.tricks > 0) {
    accuracy.push({ what: 'debrief.tricks_kinds', n: summary.unique, of: summary.tricks });
  }
  accuracy.push({ what: 'debrief.crashes', n: summary.crashes, of: null });
  const records = [];
  if (posted && Number.isFinite(posted.score)) {
    records.push({ what: 'debrief.run_best', now: summary.total, before: posted.score, improved: posted.improved !== false });
  }
  return {
    activity: 'free',
    score: summary.total,
    aircraft,
    fixedWing,
    result: { kind, landed: fixedWing ? landed : null },
    route,
    time: { flightMs, runMs: scored ? summary.durationMs : null },
    accuracy,
    records: records.concat(timeRecord(totalS, flightMs)),
    replay,
    next: nextActions('free'),
  };
}
