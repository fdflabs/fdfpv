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
    /* The craft was put somewhere rather than flown there (a respawn, a
     * reset to a spawn, a harness placing it): the next position starts a
     * new leg, so the jump is never counted as distance flown. */
    cut() {
      last = null;
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

/*
 * THE AIRCRAFT'S CONDITION in three words (PILLARS 14): the word the HUD
 * showed when the flight ended, src/game/damage.js conditionOf over the
 * plant's damage flags, handed in by the shell and never re-derived here.
 * null where the screen has no flight of this pilot's to speak for.
 */
export const CONDITIONS = ['operational', 'impaired', 'destroyed'];

function conditionWord(c) {
  if (c == null) {
    return null;
  }
  if (!CONDITIONS.includes(c)) {
    throw new Error(`debrief: unknown condition ${c}`);
  }
  return c;
}

/* The rows under the cursor, best first. Fly again leads everywhere: it is
 * the one a pilot most often wants after a flight. */
const NEXT = {
  race: ['again', 'replay', 'aircraft', 'title'],
  free: ['again', 'replay', 'aircraft', 'title'],
  /* A room's own rows (the host's Again, Fly on, the room's) lead; the
   * replay and another aircraft for the next round follow them. */
  roomrace: ['room', 'replay', 'aircraft', 'title'],
  tag: ['room', 'replay', 'aircraft', 'title'],
  combat: ['room', 'replay', 'aircraft', 'title'],
  /* The ops debrief's own buttons: Again from the checkpoint (the host,
   * after a loss), the replay, Continue. */
  ops: ['again', 'replay', 'continue'],
};

export function nextActions(activity) {
  return (NEXT[activity] ?? ['again', 'title']).slice();
}

/*
 * The host's one press after a mission's end (the war's end banner, the
 * ops debrief; COMPLETENESS 76), in order, the first under the cursor:
 * after a win the next mission when there is one this host may start
 * (`next`, its id, or null), then the same mission again, from the stage
 * it was lost in after a loss that kept one (`checkpoint`). Empty for
 * every other pilot: the room's start brings them along. Each is
 * { act: 'next', mission } or { act: 'again', from: 'checkpoint' | null }.
 */
export function missionEndActions({ host, state, checkpoint = false, next = null }) {
  if (!host || !['won', 'lost', 'ended'].includes(state)) {
    return [];
  }
  const again = { act: 'again', from: state === 'lost' && checkpoint ? 'checkpoint' : null };
  return state === 'won' && next ? [{ act: 'next', mission: next }, again] : [again];
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
 * EVENT LOG (src/game/events.js, COMPLETENESS.md item 26): every fact
 * that is an event is read from the log, so a debrief rebuilt from a
 * saved log says what the one shown said: a race's laps (`lap` and
 * `lap_void`), freestyle's tricks and bails (`trick`, `bail`), an ops
 * mission's result (its `mission_end`) and a room game's points (its
 * `round`). `events` is the run's (src/ui/progress-ui.js runEvents), a
 * room's the flight's. Handed in: what is measured, not an event (the
 * time in the air, the route, the replay, the condition, a freestyle
 * run's clock), what the scorer and the room work out from it (the
 * score, the places), and what the course and the mission are (the
 * record chased, the stars there are).
 */

/*
 * A solo race. events: its run's log, whose `lap` and `lap_void` rows
 * are race.js's laps in order (a voided one with ms null); recordAtStart
 * the record this run chased; gates the course's gate count and passed
 * the gates passed this flight (null when unknown).
 */
export function fromRace({ aircraft, fixedWing = false, events, recordAtStart, flightMs, totalS, route = null, replay, landed = null, gates = null, passed = null, condition = null }) {
  const log = events.filter((e) => e.type === 'lap' || e.type === 'lap_void');
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
    condition: conditionWord(condition),
    route,
    time: { flightMs, runMs: fastest },
    accuracy,
    records: records.concat(timeRecord(totalS, flightMs)),
    replay,
    next: nextActions('race'),
  };
}

/*
 * A Flight Club room's match: a room race, Catch the Ace or Streamer
 * Combat. place and of are this pilot's standing in the room's order
 * (place null when the room has none for this pilot yet); final whether
 * the room has called the result, so a race still being finished by the
 * others says neither won nor lost. events: this pilot's flight's log;
 * the points are its last `round` of this game's (Progress.roundFinished,
 * logged as the room ends it), none where the game counts none (a room
 * race's round carries its grid, not points).
 */
const ROUND_GAME = { roomrace: 'race', tag: 'tag', combat: 'combat' };

export function fromRoom({ activity, aircraft, fixedWing = false, place, of, final, events = [], flightMs, totalS, route = null, replay, condition = null }) {
  const round = events.filter((e) => e.type === 'round' && e.game === ROUND_GAME[activity]).pop();
  const points = round && Number.isFinite(round.points) ? round.points : null;
  let kind = 'complete';
  if (final && place != null) {
    kind = place === 1 ? 'won' : 'lost';
  }
  const accuracy = [];
  if (place != null && of > 0) {
    accuracy.push({ what: 'debrief.place', n: place, of });
  }
  if (Number.isFinite(points)) {
    accuracy.push({ what: 'debrief.points', n: points, of: null });
  }
  return {
    activity,
    aircraft,
    fixedWing,
    result: { kind, landed: null },
    condition: conditionWord(condition),
    route,
    time: { flightMs, runMs: null },
    accuracy,
    records: timeRecord(totalS, flightMs),
    replay,
    next: nextActions(activity),
  };
}

/*
 * An ops mission's end (src/ui/debrief.js). events: the run's log, which
 * holds the match's `mission_end` (src/ui/opscampaign.js record logs it
 * before the debrief shows), match its id there (opscampaign.js
 * matchOf): its state and the stars earned; items the debrief's frames
 * ({ required, kind }: 'mine' and 'squad' are captured); starsOf the
 * mission's stars; flight this pilot's own { aircraft, fixedWing,
 * flightMs, totalS, route, replay, condition }.
 */
export function fromOps({ events, match, items, starsOf, flight }) {
  const end = events.filter((e) => e.type === 'mission_end' && e.match === match).pop();
  if (!end) {
    throw new Error(`debrief: no mission_end logged for match ${match}`);
  }
  const required = items.filter((f) => f.required);
  const captured = (list) => list.filter((f) => f.kind === 'mine' || f.kind === 'squad').length;
  const accuracy = [];
  if (required.length) {
    accuracy.push({ what: 'debrief.items_required', n: captured(required), of: required.length });
  }
  if (starsOf > 0) {
    accuracy.push({ what: 'debrief.stars', n: end.earned, of: starsOf });
  }
  return {
    activity: 'ops',
    aircraft: flight.aircraft,
    fixedWing: Boolean(flight.fixedWing),
    result: { kind: end.state, landed: null },
    condition: conditionWord(flight.condition ?? null),
    route: flight.route ?? null,
    time: { flightMs: flight.flightMs, runMs: null },
    accuracy,
    records: timeRecord(flight.totalS, flight.flightMs),
    replay: flight.replay ?? null,
    next: nextActions('ops'),
  };
}

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

/*
 * The bests a run set (src/game/progress.js awardBest's `best` events,
 * src/ui/progress-ui.js runBests) as record lines, first on the list: a
 * lap's and a run's on a race's debrief, a round's points on its game's.
 * A best of another activity's kind is not this screen's to say. Each
 * line is { what, kind, now, before, improved: true }, `before` null for
 * the first on its key. An aircraft challenge the run did (runBests'
 * `challenge:<family>:<id>` entries, progress.js awardAircraftChallenge)
 * is said on whichever debrief follows it, as { what, kind: 'challenge',
 * airframe, id, improved: true }, after the bests. Pure: a new record.
 */
const BEST_LINES = { lap: 'debrief.best_lap', run: 'debrief.best_run', combat: 'debrief.best_score', tag: 'debrief.best_score' };
const BESTS_FOR = { race: ['lap', 'run'], roomrace: ['lap'], combat: ['combat'], tag: ['tag'] };

export function withBests(d, bests) {
  const kinds = BESTS_FOR[d.activity] ?? [];
  const done = new Map();
  for (const b of bests || []) {
    if (typeof b.key === 'string' && b.key.startsWith('challenge:') && typeof b.airframe === 'string' && typeof b.id === 'string') {
      done.set(b.key, { what: 'debrief.challenge_done', kind: 'challenge', airframe: b.airframe, id: b.id, improved: true });
    }
  }
  /* A key bettered twice in one run (a lap, then a faster one) is one
   * line: the best held before the run and the last one set. */
  const byKey = new Map();
  for (const b of bests || []) {
    const kind = typeof b.key === 'string' ? b.key.split(':')[0] : null;
    if (!kinds.includes(kind) || !Number.isFinite(b.now)) {
      continue;
    }
    const held = byKey.get(b.key);
    const before = held ? held.before : Number.isFinite(b.before) ? b.before : null;
    byKey.set(b.key, { what: BEST_LINES[kind], kind, now: b.now, before, improved: true });
  }
  const lines = [...byKey.values(), ...done.values()];
  return lines.length ? { ...d, records: [...lines, ...d.records] } : d;
}

/*
 * A freestyle run. events: its run's log, whose `trick` rows are the
 * tricks the scorer took and `bail` rows the bails it counted; summary
 * score.js's summary(), for the score and the run's clock. posted is the
 * board's answer when the run was sent ({ score, improved }), else null:
 * the board holds the pilot's best, so the record line is its answer, not
 * a local copy.
 */
export function fromFree({ aircraft, fixedWing = false, summary, events, flightMs, totalS, route = null, replay, landed = null, posted = null, condition = null }) {
  const scored = summary.timed !== false;
  const tricks = events.filter((e) => e.type === 'trick');
  const kind = tricks.length > 0 ? 'complete' : 'ended';
  const accuracy = [];
  if (tricks.length > 0) {
    accuracy.push({ what: 'debrief.tricks_kinds', n: new Set(tricks.map((e) => e.id)).size, of: tricks.length });
  }
  accuracy.push({ what: 'debrief.crashes', n: events.filter((e) => e.type === 'bail').length, of: null });
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
    condition: conditionWord(condition),
    route,
    time: { flightMs, runMs: scored ? summary.durationMs : null },
    accuracy,
    records: records.concat(timeRecord(totalS, flightMs)),
    replay,
    next: nextActions('free'),
  };
}
