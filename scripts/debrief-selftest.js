/*
 * debrief-selftest.js: the debrief record (src/game/debrief.js) in Node.
 *
 * Each builder on recorded end states gives the record the end screen
 * reads; the route sampler stays bounded over a long flight and keeps its
 * start, its end and the true distance; next actions come in order.
 *
 * One line per check. The exit code is the number of failed checks.
 *
 * Run with npm run debrief:selftest.
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

import { EventLog } from '../src/game/events.js';
import { FreestyleScore } from '../src/game/score.js';
import { trickNames } from '../src/game/tricks.js';
import { INTERIOR } from '../src/game/campaign.js';
import { COUNTED, foldEvents, freshProgress } from '../src/game/progress.js';
import { createOpsCampaignScreen, matchOf } from '../src/ui/opscampaign.js';
import { CONDITIONS, createRoute, fromFree, fromOps, fromRace, fromRoom, missionEndActions, nextActions, replayState, ROUTE_MAX, withBests, withPosted } from '../src/game/debrief.js';
import { factLines } from '../src/ui/factlines.js';
import { useLocale } from '../src/strings/index.js';

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` (${detail})`}`);
  if (!ok) {
    failed += 1;
  }
}
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

/* The route: an hour at 120 Hz round a 50 m circle, climbing to 30 m. */
{
  const r = createRoute();
  check('route: empty flight has no route', r.snapshot() === null);
  const hz = 120;
  const n = 3600 * hz;
  for (let i = 0; i <= n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    r.add((i * 1000) / hz, 50 * Math.cos(a), 30 * (i / n), 50 * Math.sin(a));
  }
  const s = r.snapshot([[1, 2]]);
  check('route: bounded over an hour', s.points.length <= ROUTE_MAX, `${s.points.length}`);
  check('route: keeps enough points to draw', s.points.length >= ROUTE_MAX / 2, `${s.points.length}`);
  check('route: starts at the start', near(s.points[0][0], 50) && near(s.points[0][1], 0));
  const e = s.points[s.points.length - 1];
  check('route: ends at the end', near(e[0], 50, 1e-6) && near(e[1], 0, 1e-6), JSON.stringify(e));
  const truth = Math.hypot(2 * Math.PI * 50, 30);
  check('route: distance from every frame', near(s.distanceM, truth, 0.01), `${s.distanceM} vs ${truth}`);
  check('route: top over the start', near(s.topM, 30));
  check('route: marks copied', JSON.stringify(s.marks) === '[[1,2]]');
  check('route: JSON safe', JSON.stringify(JSON.parse(JSON.stringify(s))) === JSON.stringify(s));
  const gaps = [];
  for (let i = 1; i < s.points.length - 1; i += 1) {
    gaps.push(Math.hypot(s.points[i][0] - s.points[i - 1][0], s.points[i][1] - s.points[i - 1][1]));
  }
  check('route: even spacing after thinning', Math.max(...gaps) / Math.min(...gaps) < 1.05);
  r.add(NaN, 0, 0, 0);
  check('route: a NaN frame is ignored', near(r.snapshot().distanceM, truth, 0.01));
  r.reset();
  check('route: reset empties', r.snapshot() === null);
  /* Three frames inside one step: only the first is kept, so the end must
   * be added for the line to reach where the craft stopped. */
  r.add(0, 0, 101, 0);
  r.add(100, 3, 101, 4);
  r.add(200, 6, 101, 8);
  const short = r.snapshot();
  check('route: a short hop ends where it stopped', JSON.stringify(short.points) === '[[0,0],[6,8]]' && near(short.distanceM, 10), JSON.stringify(short));
  check('route: a level hop high in the world climbed nothing', short.topM === 0, String(short.topM));
  r.reset();
  check('route: reset empties again', r.snapshot() === null);
  /* A respawn 2 km away between two 5 m legs: 10 m flown, not 2 km. */
  r.add(0, 0, 0, 0);
  r.add(100, 3, 0, 4);
  r.cut();
  r.add(200, 2000, 0, 0);
  r.add(300, 2003, 0, 4);
  check('route: a cut leaves the jump out of the distance', near(r.snapshot().distanceM, 10), String(r.snapshot().distanceM));
  r.reset();
}

const ok = { ok: true, why: null };

/*
 * A run's log as the shell writes race.js's rows into it (src/main.js): a
 * counted lap through Progress.lap, a voided one through voidRaceLap, a
 * builder's test flight lap off a casual track through lapVoid 'test'.
 * Rows are race.js's ({ ms } or { ms: null, reason }), `test` for a test
 * flight's; `flights` splits the run over that many logs (a recovery or a
 * placement each starts one), joined as Progress.runEvents joins them.
 */
function raceRun(rows, flights = 1) {
  const logs = [];
  const per = Math.max(1, Math.ceil(rows.length / flights));
  let log = null;
  rows.forEach((r, i) => {
    if (i % per === 0) {
      log = new EventLog();
      log.append('spawned', i * 1000);
      logs.push(log);
    }
    const t = i * 1000 + 500;
    if (r.test) {
      log.append('lap_void', t, { ms: r.ms, reason: 'test' });
    } else if (Number.isFinite(r.ms)) {
      log.append('lap', t, { ms: r.ms, airframe: 'whoop65', medal: null, kind: 'built', course: 'track:t', n: i + 1, of: rows.length });
    } else {
      log.append('touch', t, { kind: 'gate' });
      log.append('lap_void', t, { ms: null, reason: r.reason });
    }
  });
  return logs.flatMap((l) => l.events);
}
const rt = (events) => JSON.parse(JSON.stringify(events));

/* A race that beats the record, a voided lap in between. */
{
  const log = raceRun([{ ms: 41000 }, { ms: null, reason: 'wreck' }, { ms: 39500 }]);
  const d = fromRace({ aircraft: 'whoop65', events: log, recordAtStart: 40000, flightMs: 125000, totalS: 3600, replay: ok, gates: 24, passed: 20 });
  check('race: record', d.result.kind === 'record');
  check('race: run time is the fastest lap', d.time.runMs === 39500 && d.time.flightMs === 125000);
  check('race: clean laps 2 of 3', JSON.stringify(d.accuracy[0]) === JSON.stringify({ what: 'debrief.clean_laps', n: 2, of: 3 }));
  check('race: gates 20 of 24', d.accuracy[1].n === 20 && d.accuracy[1].of === 24);
  check('race: record line improved', d.records[0].improved === true && d.records[0].before === 40000);
  check('race: aircraft time line', d.records[1].now === 3600 && near(d.records[1].before, 3475) && d.records[1].improved === null);
  check('race: a quad has no landing', d.result.landed === null);
  check('race: next', JSON.stringify(d.next) === '["again","replay","aircraft","title"]');
  check('race: no condition handed in, none on the record', d.condition === null);
}
/* The aircraft's condition, the HUD's three words (PILLARS 14). */
{
  const base = { aircraft: 'whoop65', events: raceRun([{ ms: 40000 }]), recordAtStart: null, flightMs: 1, totalS: 1, replay: ok };
  check('condition: the three words', JSON.stringify(CONDITIONS) === '["operational","impaired","destroyed"]');
  check('condition: race carries each word', CONDITIONS.every((c) => fromRace({ ...base, condition: c }).condition === c));
  const free = { aircraft: '5inch', summary: { total: 0, timed: false, durationMs: 0 }, events: [], flightMs: 1, totalS: 1, replay: ok };
  check('condition: freestyle carries each word', CONDITIONS.every((c) => fromFree({ ...free, condition: c }).condition === c));
  check('condition: freestyle without one has none', fromFree(free).condition === null);
  const room = { activity: 'tag', aircraft: 'whoop65', place: 2, of: 3, final: true, flightMs: 1, totalS: 1, replay: ok };
  check('condition: a room carries each word', CONDITIONS.every((c) => fromRoom({ ...room, condition: c }).condition === c));
  check('condition: a room pilot who did not fly has none', fromRoom(room).condition === null);
  const flight = { aircraft: 'bramor2300', fixedWing: true, flightMs: 1, totalS: 1, replay: ok };
  const mission = { events: [{ seq: 0, type: 'mission_end', simMs: 1, roomMs: null, mission: 'm', match: 'u', won: true, state: 'won', stars: 0, earned: 0, paid: true, airframe: 'x' }], match: 'u', items: [], starsOf: 0 };
  check('condition: an ops flight carries each word', CONDITIONS.every((c) => fromOps({ ...mission, flight: { ...flight, condition: c } }).condition === c));
  check('condition: an ops flight without one has none', fromOps({ ...mission, flight }).condition === null);
  let threw = false;
  try {
    fromRace({ ...base, condition: 'worn' });
  } catch {
    threw = true;
  }
  check('condition: a fourth word fails loudly', threw);
}
{
  const d = fromRace({ aircraft: 'cub1400', fixedWing: true, events: raceRun([{ ms: 50000 }]), recordAtStart: 49000, flightMs: 60000, totalS: NaN, replay: ok, landed: true });
  check('race: off the record is complete', d.result.kind === 'complete' && d.records[0].improved === false);
  check('race: a plane reports its landing', d.result.landed === true);
  check('race: no flight time total, no line', d.records.length === 1);
  check('race: unknown gates, no gate line', d.accuracy.length === 1);
}
{
  const d = fromRace({ aircraft: 'whoop65', events: raceRun([{ ms: 40000 }]), recordAtStart: 40000, flightMs: 1, totalS: 1, replay: ok });
  check('race: equal is matched', d.result.kind === 'matched');
  const e = fromRace({ aircraft: 'whoop65', events: raceRun([]), recordAtStart: null, flightMs: 1, totalS: 1, replay: ok });
  check('race: no lap is ended, no record line', e.result.kind === 'ended' && e.records.length === 1 && e.accuracy.length === 0);
  const f = fromRace({ aircraft: 'whoop65', events: raceRun([{ ms: 40000 }]), recordAtStart: null, flightMs: 1, totalS: 1, replay: ok });
  check('race: first lap on a track is a record', f.result.kind === 'record' && f.records[0].improved === true && f.records[0].before === null);
}

/* Freestyle. */
{
  const summary = { total: 1840, timed: true, durationMs: 120000 };
  const names = ['Flip', 'Roll', 'Flip', 'Power Loop', 'Roll', 'Flip', 'Yaw Spin', 'Matty Flip', 'Flip', 'Roll', 'Flip', 'Roll'];
  const log = new EventLog();
  names.forEach((id, i) => log.append('trick', i * 1000, { id, score: 100 }));
  log.append('bail', 13000, { cause: 'bounce' });
  log.append('crash', 14000, { airframe: '5inch' });
  const d = fromFree({ aircraft: '5inch', summary, events: log.events, flightMs: 118000, totalS: 900, replay: ok, posted: { score: 2000, improved: false } });
  check('free: complete', d.result.kind === 'complete');
  check('free: kinds of tricks', d.accuracy[0].n === 5 && d.accuracy[0].of === 12);
  check('free: crash count, the bails, not the crash flag\'s edge', d.accuracy[1].what === 'debrief.crashes' && d.accuracy[1].n === 1);
  check('free: board best still stands', d.records[0].improved === false && d.records[0].before === 2000);
  check('free: run time is the clock', d.time.runMs === 120000);
  const e = fromFree({ aircraft: '5inch', summary: { total: 0, timed: false, durationMs: 0 }, events: [], flightMs: 5000, totalS: 5, replay: ok });
  check('free: free flight has no run clock, no tricks', e.result.kind === 'ended' && e.time.runMs === null && e.accuracy.length === 1);
  check('free: not posted, no board line', e.records.length === 1);
  const p = withPosted(e, { score: 900, improved: true });
  check('free: the board answer adds its line first', p.records.length === 2 && p.records[0].what === 'debrief.run_best' && p.records[0].before === 900 && p.records[0].improved === true);
  check('free: and leaves the record it was given alone', e.records.length === 1);
  check('free: a second answer replaces the line', withPosted(p, { score: 950, improved: false }).records.filter((r) => r.what === 'debrief.run_best').length === 1);
  check('free: no score in the answer, no change', withPosted(e, { ok: true }) === e);
  const w = fromFree({ aircraft: 'cub1400', fixedWing: true, summary: { total: 0, timed: false, durationMs: 0 }, events: [], flightMs: 1, totalS: 1, replay: ok, landed: true });
  check('free: a plane reports its landing', w.result.landed === true);
}

/* Flight Club rooms. */
{
  const won = fromRoom({ activity: 'roomrace', aircraft: 'whoop65', place: 1, of: 4, final: true, flightMs: 90000, totalS: 100, replay: ok });
  check('room: first when called is won', won.result.kind === 'won' && won.accuracy[0].what === 'debrief.place' && won.accuracy[0].n === 1 && won.accuracy[0].of === 4);
  const wait = fromRoom({ activity: 'roomrace', aircraft: 'whoop65', place: 1, of: 4, final: false, flightMs: 90000, totalS: 100, replay: ok });
  check('room: first while others finish is not yet won', wait.result.kind === 'complete');
  const tagLog = (points) => [{ seq: 0, type: 'spawned', simMs: 0, roomMs: null }, { seq: 1, type: 'round', simMs: 1, roomMs: null, game: 'tag', world: 'alps', points }];
  const lost = fromRoom({ activity: 'tag', aircraft: 'cub1400', fixedWing: true, place: 3, of: 3, final: true, events: tagLog(7), flightMs: 1, totalS: 1, replay: ok });
  check('room: a later place when called is lost, points counted', lost.result.kind === 'lost' && lost.accuracy[1].what === 'debrief.points' && lost.accuracy[1].n === 7 && lost.accuracy[1].of === null);
  const none = fromRoom({ activity: 'combat', aircraft: 'x', place: null, of: 0, final: true, flightMs: 1, totalS: NaN, replay: ok });
  check('room: no standing, no place line, no time line', none.accuracy.length === 0 && none.records.length === 0 && none.result.kind === 'complete');
  check('room: the room rows lead', JSON.stringify(won.next) === '["room","replay","title"]');
}

/*
 * FROM THE LOG (COMPLETENESS.md item 26): a fact the flight's log holds is
 * read from it, so the debrief rebuilt from the saved log (JSON, as a
 * log is) is the one shown. Recorded as src/ui/progress-ui.js logs it.
 */
{
  const log = new EventLog();
  log.append('spawned', 0);
  log.append('seated', 0, { airframe: 'cub1400', fixedWing: true, power: 'electric', smallestPack: false, crashed: false });
  log.append('round', 61000, { game: 'tag', world: 'alps', points: 3 });
  log.append('crash', 70000, { airframe: 'cub1400' });
  log.append('round', 181000, { game: 'tag', world: 'alps', points: 9 });
  log.append('round', 190000, { game: 'race', world: 'alps', pilots: 4 });
  const side = { aircraft: 'cub1400', fixedWing: true, place: 1, of: 3, final: true, flightMs: 175000, totalS: 900, route: null, replay: ok, condition: 'operational' };
  const shown = fromRoom({ activity: 'tag', ...side, events: log.events });
  const saved = JSON.parse(JSON.stringify(log.events));
  check('log: a tag debrief rebuilt from the saved log is the one shown', JSON.stringify(fromRoom({ activity: 'tag', ...side, events: saved })) === JSON.stringify(shown));
  check('log: its points are the last tag round\'s, not an earlier one\'s or another game\'s', shown.accuracy[1].what === 'debrief.points' && shown.accuracy[1].n === 9);
  const race = fromRoom({ activity: 'roomrace', ...side, events: saved });
  check('log: a room race\'s round carries its grid, not points: no points line', race.accuracy.length === 1 && race.accuracy[0].what === 'debrief.place');
  check('log: no round of the game in the log, no points line', fromRoom({ activity: 'combat', ...side, events: saved }).accuracy.length === 1
    && fromRoom({ activity: 'tag', ...side }).accuracy.length === 1);
}

/*
 * EVERY ACTIVITY FROM ITS LOG (COMPLETENESS.md item 26). Each is driven
 * as the shell drives it, the log written beside the thing the screen
 * used to read (race.js's rows, score.js's summary, the room's view), and
 * the debrief built from the log, and from a JSON round trip of it, is
 * the one the old reader built from that thing. The old readers are kept
 * here as the oracles.
 */
function oldRaceFacts({ log }) {
  const laps = log.filter((l) => Number.isFinite(l.ms)).map((l) => l.ms);
  const fastest = laps.length ? Math.min(...laps) : null;
  return { runMs: fastest, clean: log.length ? { n: laps.length, of: log.length } : null };
}
function oldFreeFacts(summary) {
  return { kind: summary.tricks > 0 ? 'complete' : 'ended', kinds: summary.tricks > 0 ? { n: summary.unique, of: summary.tricks } : null, crashes: summary.crashes };
}
let seed = 20261014;
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const pick = (list) => list[Math.floor(rand() * list.length)];
{
  let same = 0;
  let trips = 0;
  let voids = 0;
  let tests = 0;
  let bad = '';
  for (let k = 0; k < 500; k += 1) {
    const rows = [];
    const n = Math.floor(rand() * 8);
    for (let i = 0; i < n; i += 1) {
      const r = rand();
      if (r < 0.2) {
        rows.push({ n: rows.length + 1, ms: null, reason: pick(['wreck', 'swap', 'weight', 'replay']) });
        voids += 1;
      } else if (r < 0.3) {
        rows.push({ n: rows.length + 1, ms: 30000 + Math.floor(rand() * 20000), test: true });
        tests += 1;
      } else {
        rows.push({ n: rows.length + 1, ms: 30000 + Math.floor(rand() * 20000) });
      }
    }
    const events = raceRun(rows, 1 + Math.floor(rand() * 3));
    const side = { aircraft: 'whoop65', recordAtStart: pick([null, 35000, 40000]), flightMs: 90000, totalS: 500, route: null, replay: ok, condition: 'operational' };
    const shown = fromRace({ ...side, events });
    const old = oldRaceFacts({ log: rows });
    const clean = shown.accuracy.find((a) => a.what === 'debrief.clean_laps') || null;
    if (shown.time.runMs === old.runMs && JSON.stringify(clean && { n: clean.n, of: clean.of }) === JSON.stringify(old.clean)) same += 1;
    else if (!bad) bad = JSON.stringify({ rows, shown: [shown.time.runMs, clean], old });
    if (JSON.stringify(fromRace({ ...side, events: rt(events) })) === JSON.stringify(shown)) trips += 1;
  }
  check(`race from the log: five hundred runs over one to three flights, voids and test flight laps among them, say what race.js's rows said (${same} of 500, ${voids} voided, ${tests} test)`, same === 500 && voids > 100 && tests > 50, bad);
  check(`race from the log: rebuilt from a JSON round trip of the log, the debrief shown (${trips} of 500)`, trips === 500);
}
{
  const names = trickNames();
  let same = 0;
  let trips = 0;
  let bails = 0;
  let edges = 0;
  let refused = 0;
  let bad = '';
  for (let k = 0; k < 300; k += 1) {
    /* The shell's freestyle: a scorer and the run's log, a trick logged
     * when the scorer took it (src/main.js, the trick judge's callback),
     * a bail at every scoreCrash, the crash flag's edge only for some. */
    const score = new FreestyleScore({ timed: rand() < 0.5, runMs: 20000 });
    const log = new EventLog();
    log.append('spawned', 0);
    let t = 0;
    for (let i = 0; i < 40; i += 1) {
      t += 200 + Math.floor(rand() * 1500);
      score.tick(t);
      const r = rand();
      if (r < 0.6) {
        const took = score.land({ name: pick(names), execution: pick(['CLEAN', 'SLOPPY', 'BUMP']), endMs: t });
        if (took) {
          log.append('trick', t, { id: took.name, score: took.net });
        } else {
          refused += 1;
        }
      } else if (r < 0.75) {
        score.crash();
        log.append('bail', t, { cause: pick(['crash', 'wreck', 'bounce']) });
        bails += 1;
        if (rand() < 0.5) {
          log.append('crash', t, { airframe: '5inch' });
          edges += 1;
        }
      }
    }
    const summary = score.summary();
    const side = { aircraft: '5inch', summary, flightMs: t, totalS: 100, route: null, replay: ok, condition: 'operational' };
    const shown = fromFree({ ...side, events: log.events });
    const old = oldFreeFacts(summary);
    const kinds = shown.accuracy.find((a) => a.what === 'debrief.tricks_kinds') || null;
    const crashes = shown.accuracy.find((a) => a.what === 'debrief.crashes');
    if (shown.result.kind === old.kind && JSON.stringify(kinds && { n: kinds.n, of: kinds.of }) === JSON.stringify(old.kinds) && crashes.n === old.crashes && shown.score === summary.total) same += 1;
    else if (!bad) bad = JSON.stringify({ shown: shown.accuracy, old });
    if (JSON.stringify(fromFree({ ...side, events: rt(log.events) })) === JSON.stringify(shown)) trips += 1;
  }
  check(`free from the log: three hundred scored runs say what score.js's summary said, every bail a crash, the flag's edges not (${same} of 300, ${bails} bails, ${edges} edges, ${refused} refused after the horn)`, same === 300 && bails > edges && edges > 0 && refused > 0, bad);
  check(`free from the log: rebuilt from a JSON round trip of the log, the debrief shown (${trips} of 300)`, trips === 300);
}
{
  /* The Interior's result through its logging point
   * (src/ui/opscampaign.js record), as src/main.js opsDebrief and opsPaid
   * call it, into a run's log as Progress keeps one. */
  const fakeProgress = () => {
    const log = new EventLog();
    const run = [];
    return {
      airframe: 'bramor2300',
      event(type, data) {
        const e = log.append(type, 1000, data);
        run.push(e);
        return e;
      },
      runEvents: () => run.slice(),
      foldFlight: () => [],
      checkFirsts: () => [],
    };
  };
  const settings = {};
  const screen = (progress) => createOpsCampaignScreen({
    ui: { settings, persistSettings() {}, progress }, campaign: { id: 'interior' }, missions: INTERIOR, consented: async () => true, play() {},
  });
  const m1 = INTERIOR[0].id;
  const items = [{ required: true, kind: 'mine' }, { required: true, kind: 'rec' }];
  const flight = { aircraft: 'bramor2300', fixedWing: true, flightMs: 200000, totalS: 900, replay: ok, condition: 'operational' };
  /* The old reader: won and ended from the view, the stars got its star
   * ids (src/ui/debrief.js show). */
  const oldOps = (view) => {
    const won = view.result ? view.result.won : view.state === 'won';
    const kind = won ? 'won' : !won && view.state === 'ended' ? 'ended' : 'lost';
    return { kind, got: new Set((view.result && view.result.starIds) || []).size };
  };
  const debriefOf = (progress, key, view) => {
    const args = { match: matchOf(key, view), items, starsOf: 3, flight };
    const shown = fromOps({ ...args, events: progress.runEvents() });
    const again = fromOps({ ...args, events: rt(progress.runEvents()) });
    const old = oldOps(view);
    const stars = shown.accuracy.find((a) => a.what === 'debrief.stars');
    return { shown, same: shown.result.kind === old.kind && stars.n === old.got, trip: JSON.stringify(again) === JSON.stringify(shown) };
  };
  const ends = (p) => p.runEvents().filter((e) => e.type === 'mission_end');
  const views = [
    ['won, restarted: three stars earned, one paid', 'K1', { uid: 'u1', mission: m1, state: 'won', result: { won: true, stars: 1, starIds: ['a', 'b', 'c'], flags: {}, restarted: 2 } }],
    ['lost', 'K2', { uid: 'u2', mission: m1, state: 'lost', result: { won: false, stars: 0, starIds: [], flags: {}, restarted: null } }],
    ['ended by the host', 'K3', { uid: 'u3', mission: m1, state: 'ended', result: { won: false, stars: 0, starIds: [], flags: {}, restarted: null } }],
    ['a room from before uid', 'K4', { mission: m1, state: 'won', result: { won: true, stars: 2, starIds: ['a', 'b'], flags: {}, restarted: null } }],
  ];
  const all = [];
  for (const [what, key, view] of views) {
    const p = fakeProgress();
    const s1 = screen(p);
    s1.record(key, view);
    s1.record(key, view);
    const d = debriefOf(p, key, view);
    const e = ends(p);
    check(`ops from the log, ${what}: logged once before the debrief, paid, and the debrief it gives is the old reader's and survives a JSON round trip`,
      e.length === 1 && e[0].paid === true && e[0].match === matchOf(key, view) && d.same && d.trip, JSON.stringify([e, d.shown.result, d.shown.accuracy]));
    all.push(...p.runEvents());
    /* A reload at the debrief: a new page (its screen, a new run's log)
     * on the same save, the match paid already. */
    const q = fakeProgress();
    screen(q).record(key, view);
    const r = debriefOf(q, key, view);
    const f = ends(q);
    check(`ops from the log, ${what}, after a reload: logged seen, not paid, and the same debrief`,
      f.length === 1 && (view.uid ? f[0].paid === false : f[0].paid === true) && r.same && r.trip && JSON.stringify(r.shown) === JSON.stringify(d.shown), JSON.stringify(f));
    all.push(...q.runEvents());
  }
  const paidOnce = settings.campaign && settings.campaign.missions && settings.campaign.missions[m1];
  check('the save paid each uid once across the reloads', Boolean(paidOnce) && paidOnce.won === true, JSON.stringify(paidOnce));
  const counts = freshProgress();
  foldEvents(counts, all);
  check('and the counts complete each match with a uid once: the reloads\' unpaid rows count nowhere',
    counts[COUNTED.mission_end].bramor2300 === 5, JSON.stringify(counts[COUNTED.mission_end]));
  /* No result for this seat (first seated after the end) and a mission
   * not the campaign's: logged so the debrief reads them, paid nothing. */
  const p = fakeProgress();
  const s2 = screen(p);
  const seen = { uid: 'u9', mission: m1, state: 'ended', result: null };
  s2.record('K9', seen);
  const other = { uid: 'u8', mission: 'not-a-mission', state: 'won', result: { won: true, stars: 1, starIds: ['a'], flags: {}, restarted: null } };
  s2.record('K8', other);
  const e = ends(p);
  check('ops from the log: a seat with no result and a mission not the campaign\'s are logged unpaid, and each debrief is the old reader\'s',
    e.length === 2 && e.every((x) => x.paid === false) && debriefOf(p, 'K9', seen).same && debriefOf(p, 'K8', other).same, JSON.stringify(e));
  check('ops from the log: a match not over logs nothing', (() => {
    const z = fakeProgress();
    screen(z).record('K7', { uid: 'u7', mission: m1, state: 'live', result: null });
    return ends(z).length === 0;
  })());
}

/* An ops mission. */
{
  const items = [{ required: true, kind: 'mine' }, { required: true, kind: 'rec' }, { required: true, kind: 'squad' }, { required: false, kind: 'missing' }];
  const flight = { aircraft: 'bramor2300', fixedWing: true, flightMs: 300000, totalS: 4000, replay: ok };
  const ended = (state, earned) => ({ seq: 0, type: 'mission_end', simMs: 1, roomMs: null, mission: 'interior-1', match: 'u', won: state === 'won', state, stars: earned, earned, paid: true, airframe: 'bramor2300' });
  const w = fromOps({ events: [ended('won', 2)], match: 'u', items, starsOf: 3, flight });
  check('ops: won, required captured 2 of 3 (the optional one not counted)', w.result.kind === 'won' && w.accuracy[0].n === 2 && w.accuracy[0].of === 3);
  check('ops: stars 2 of 3', w.accuracy[1].what === 'debrief.stars' && w.accuracy[1].n === 2 && w.accuracy[1].of === 3);
  check('ops: its own buttons in order', JSON.stringify(w.next) === '["again","replay","continue"]');
  const l = fromOps({ events: [ended('lost', 0)], match: 'u', items: [], starsOf: 0, flight });
  check('ops: lost, no items or stars, no lines', l.result.kind === 'lost' && l.accuracy.length === 0);
  check('ops: ended', fromOps({ events: [ended('ended', 0)], match: 'u', items: [], starsOf: 0, flight }).result.kind === 'ended');
  let threw = false;
  try {
    fromOps({ events: [ended('won', 2)], match: 'another', items, starsOf: 3, flight });
  } catch {
    threw = true;
  }
  check('ops: no result logged for the match fails loudly, never a guess', threw);
}

/* The bests a run set (src/game/progress.js awardBest, PROGRESSION.md
 * section 3): a "New best" line each, the old value and the new. */
{
  const race = fromRace({ aircraft: 'timber1500', events: raceRun([{ ms: 41000 }]), recordAtStart: 42000, flightMs: 60000, totalS: 100, replay: ok });
  const bests = [
    { type: 'best', key: 'lap:plane:track:t1', now: 41500, before: 42000, xp: 20 },
    { type: 'best', key: 'lap:plane:track:t1', now: 41000, before: 41500, xp: 0 },
    { type: 'best', key: 'run:1:plane:track:t1', now: 41000, before: null, xp: 40 },
    { type: 'best', key: 'tag:alps', now: 5, before: null, xp: 40 },
  ];
  const d = withBests(race, bests);
  check('bests: a race shows its lap and run bests first, a tag best is not its', d.records.length === race.records.length + 2
    && d.records[0].what === 'debrief.best_lap' && d.records[1].what === 'debrief.best_run' && d.records[2].what === 'debrief.track_record', JSON.stringify(d.records.map((r) => r.what)));
  check('bests: a key bettered twice in a run is one line, from the best held before it to the last', d.records[0].before === 42000 && d.records[0].now === 41000 && d.records[0].improved === true);
  check('bests: a first best has no old value', d.records[1].before === null && d.records[1].now === 41000);
  check('bests: none set leaves the record as it was', withBests(race, []) === race && withBests(race, null) === race);
  check('bests: pure, the record it was given is unchanged', race.records[0].what === 'debrief.track_record');
  const tag = withBests(fromRoom({ activity: 'tag', aircraft: 'cub1400', place: 1, of: 2, final: true, events: [{ seq: 0, type: 'round', simMs: 1, roomMs: null, game: 'tag', world: 'alps', points: 5 }], flightMs: 1, totalS: 1, replay: ok }), bests);
  check('bests: a tag match shows its points best only', tag.records.length === 2 && tag.records[0].what === 'debrief.best_score' && tag.records[0].kind === 'tag' && tag.records[0].now === 5);
  check('bests: a room race shows its lap best, never a run (a room has no solo run)', withBests({ ...race, activity: 'roomrace' }, bests).records.filter((r) => r.kind).map((r) => r.kind).join() === 'lap');
  check('bests: JSON safe', JSON.stringify(JSON.parse(JSON.stringify(d))) === JSON.stringify(d));
  for (const [lang, label, scoreLabel, first, beat] of [['en', 'New best lap', 'New best score', '41.00, your first', '41.00, was 42.00'], ['es', 'Nueva mejor vuelta', 'Nueva mejor puntuación', '41.00, tu primera marca', '41.00, antes 42.00']]) {
    await useLocale(lang);
    const lines = factLines(d);
    const row = lines.find((l) => l[0] === label);
    check(`bests: the "New best" row in ${lang}, old and new, a gain`, Boolean(row) && row[1] === beat && row[2] === 'gain', JSON.stringify(row));
    const fresh = factLines(withBests(race, [{ key: 'lap:plane:track:t9', now: 41000, before: null }])).find((l) => l[0] === label);
    check(`bests: a first best in ${lang}`, Boolean(fresh) && fresh[1] === first, JSON.stringify(fresh));
    const score = factLines(tag).find((l) => l[0] === scoreLabel);
    const was = factLines(withBests(tag, [{ key: 'tag:alps', now: 7, before: 5 }])).find((l) => l[0] === scoreLabel);
    check(`bests: a score best in ${lang} is points, not a time`, Boolean(score) && score[1] === first.replace('41.00', '5') && score[2] === 'gain'
      && Boolean(was) && was[1] === beat.replace('41.00', '7').replace('42.00', '5'), JSON.stringify([score, was]));
  }
  await useLocale('en');

  /* An aircraft challenge the run did (progress-ui.js runBests'
   * challenge entries): its line on whichever debrief follows, after the
   * bests, saying which one in the pilot's language. */
  const did = [...bests, { key: 'challenge:cub1400:landings', airframe: 'cub1400', id: 'landings' }];
  const withDid = withBests(race, did);
  check('challenge: a race says it after its bests', withDid.records.map((r) => r.what).slice(0, 4).join() === 'debrief.best_lap,debrief.best_run,debrief.challenge_done,debrief.track_record');
  const free = withBests(fromFree({ aircraft: 'cub1400', fixedWing: true, summary: { total: 0, durationMs: 1 }, events: [], flightMs: 1, totalS: 1, replay: ok }), did);
  check('challenge: a free flight says it, and no race best', free.records[0].what === 'debrief.challenge_done' && !free.records.some((r) => r.kind === 'lap'));
  check('challenge: an entry without its aircraft or id is no line', withBests(race, [{ key: 'challenge:cub1400:lap' }]) === race);
  for (const [lang, label, value] of [['en', 'Challenge complete', '3 landings in one flight'], ['es', 'Desafío completado', '3 aterrizajes en un vuelo']]) {
    await useLocale(lang);
    const row = factLines(free).find((l) => l[0] === label);
    check(`challenge: the row in ${lang}, a gain`, Boolean(row) && row[1] === value && row[2] === 'gain', JSON.stringify(row));
  }
  await useLocale('en');
}

/* The replay row and the fallback next list. */
check('replay: a 30 s clip opens', replayState([0, 900, 10, 40]).ok);
check('replay: under a second does not', replayState([0, 10, 10, 10.5]).why === 'debrief.replay_short');
check('replay: no span does not', replayState(null).why === 'debrief.replay_short');
check('replay: already open does not', replayState([0, 900, 10, 40], true).why === 'debrief.replay_open');
check('next: unknown activity is again then title', JSON.stringify(nextActions('nope')) === '["again","title"]');
check('next: a copy', nextActions('race') !== nextActions('race'));

/* A mission's end, the host's one press (COMPLETENESS 76). */
const ends = (o) => JSON.stringify(missionEndActions(o));
check('mission end: a win with a next mission leads with it, then the same again', ends({ host: true, state: 'won', next: 'itaipu-2' })
  === '[{"act":"next","mission":"itaipu-2"},{"act":"again","from":null}]');
check('mission end: a win with none to start next is again alone', ends({ host: true, state: 'won', next: null }) === '[{"act":"again","from":null}]');
check('mission end: a loss that kept its stage is again from it, never next', ends({ host: true, state: 'lost', checkpoint: true, next: 'itaipu-2' })
  === '[{"act":"again","from":"checkpoint"}]');
check('mission end: a loss with no stage kept, and an end, are again from the start', ends({ host: true, state: 'lost' }) === '[{"act":"again","from":null}]'
  && ends({ host: true, state: 'ended', checkpoint: true }) === '[{"act":"again","from":null}]');
check('mission end: nothing for a pilot who is not the host, nor before the end', ends({ host: false, state: 'won', next: 'itaipu-2' }) === '[]'
  && ends({ host: true, state: 'live' }) === '[]');

console.log(failed ? `${failed} failed` : 'all passed');
process.exitCode = failed;
