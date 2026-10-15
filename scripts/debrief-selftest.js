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

import { CONDITIONS, createRoute, fromFree, fromOps, fromRace, fromRoom, nextActions, replayState, ROUTE_MAX, withBests, withPosted } from '../src/game/debrief.js';
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

/* A race that beats the record, a voided lap in between. */
{
  const log = [{ n: 1, ms: 41000 }, { n: 2, ms: null, reason: 'missed gate 3' }, { n: 3, ms: 39500 }];
  const d = fromRace({ aircraft: 'whoop65', log, recordAtStart: 40000, flightMs: 125000, totalS: 3600, replay: ok, gates: 24, passed: 20 });
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
  const base = { aircraft: 'whoop65', log: [{ n: 1, ms: 40000 }], recordAtStart: null, flightMs: 1, totalS: 1, replay: ok };
  check('condition: the three words', JSON.stringify(CONDITIONS) === '["operational","impaired","destroyed"]');
  check('condition: race carries each word', CONDITIONS.every((c) => fromRace({ ...base, condition: c }).condition === c));
  const free = { aircraft: '5inch', summary: { total: 0, tricks: 0, unique: 0, crashes: 0, timed: false, durationMs: 0 }, flightMs: 1, totalS: 1, replay: ok };
  check('condition: freestyle carries each word', CONDITIONS.every((c) => fromFree({ ...free, condition: c }).condition === c));
  check('condition: freestyle without one has none', fromFree(free).condition === null);
  const room = { activity: 'tag', aircraft: 'whoop65', place: 2, of: 3, final: true, flightMs: 1, totalS: 1, replay: ok };
  check('condition: a room carries each word', CONDITIONS.every((c) => fromRoom({ ...room, condition: c }).condition === c));
  check('condition: a room pilot who did not fly has none', fromRoom(room).condition === null);
  const flight = { aircraft: 'bramor2300', fixedWing: true, flightMs: 1, totalS: 1, replay: ok };
  const mission = { won: true, ended: false, items: [], stars: null };
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
  const d = fromRace({ aircraft: 'cub1400', fixedWing: true, log: [{ n: 1, ms: 50000 }], recordAtStart: 49000, flightMs: 60000, totalS: NaN, replay: ok, landed: true });
  check('race: off the record is complete', d.result.kind === 'complete' && d.records[0].improved === false);
  check('race: a plane reports its landing', d.result.landed === true);
  check('race: no flight time total, no line', d.records.length === 1);
  check('race: unknown gates, no gate line', d.accuracy.length === 1);
}
{
  const d = fromRace({ aircraft: 'whoop65', log: [{ n: 1, ms: 40000 }], recordAtStart: 40000, flightMs: 1, totalS: 1, replay: ok });
  check('race: equal is matched', d.result.kind === 'matched');
  const e = fromRace({ aircraft: 'whoop65', log: [], recordAtStart: null, flightMs: 1, totalS: 1, replay: ok });
  check('race: no lap is ended, no record line', e.result.kind === 'ended' && e.records.length === 1 && e.accuracy.length === 0);
  const f = fromRace({ aircraft: 'whoop65', log: [{ n: 1, ms: 40000 }], recordAtStart: null, flightMs: 1, totalS: 1, replay: ok });
  check('race: first lap on a track is a record', f.result.kind === 'record' && f.records[0].improved === true && f.records[0].before === null);
}

/* Freestyle. */
{
  const summary = { total: 1840, tricks: 12, unique: 5, crashes: 1, timed: true, durationMs: 120000 };
  const d = fromFree({ aircraft: '5inch', summary, flightMs: 118000, totalS: 900, replay: ok, posted: { score: 2000, improved: false } });
  check('free: complete', d.result.kind === 'complete');
  check('free: kinds of tricks', d.accuracy[0].n === 5 && d.accuracy[0].of === 12);
  check('free: crash count', d.accuracy[1].what === 'debrief.crashes' && d.accuracy[1].n === 1);
  check('free: board best still stands', d.records[0].improved === false && d.records[0].before === 2000);
  check('free: run time is the clock', d.time.runMs === 120000);
  const e = fromFree({ aircraft: '5inch', summary: { total: 0, tricks: 0, unique: 0, crashes: 0, timed: false, durationMs: 0 }, flightMs: 5000, totalS: 5, replay: ok });
  check('free: free flight has no run clock, no tricks', e.result.kind === 'ended' && e.time.runMs === null && e.accuracy.length === 1);
  check('free: not posted, no board line', e.records.length === 1);
  const p = withPosted(e, { score: 900, improved: true });
  check('free: the board answer adds its line first', p.records.length === 2 && p.records[0].what === 'debrief.run_best' && p.records[0].before === 900 && p.records[0].improved === true);
  check('free: and leaves the record it was given alone', e.records.length === 1);
  check('free: a second answer replaces the line', withPosted(p, { score: 950, improved: false }).records.filter((r) => r.what === 'debrief.run_best').length === 1);
  check('free: no score in the answer, no change', withPosted(e, { ok: true }) === e);
  const w = fromFree({ aircraft: 'cub1400', fixedWing: true, summary: { total: 0, tricks: 0, unique: 0, crashes: 0, timed: false, durationMs: 0 }, flightMs: 1, totalS: 1, replay: ok, landed: true });
  check('free: a plane reports its landing', w.result.landed === true);
}

/* Flight Club rooms. */
{
  const won = fromRoom({ activity: 'roomrace', aircraft: 'whoop65', place: 1, of: 4, final: true, flightMs: 90000, totalS: 100, replay: ok });
  check('room: first when called is won', won.result.kind === 'won' && won.accuracy[0].what === 'debrief.place' && won.accuracy[0].n === 1 && won.accuracy[0].of === 4);
  const wait = fromRoom({ activity: 'roomrace', aircraft: 'whoop65', place: 1, of: 4, final: false, flightMs: 90000, totalS: 100, replay: ok });
  check('room: first while others finish is not yet won', wait.result.kind === 'complete');
  const lost = fromRoom({ activity: 'tag', aircraft: 'cub1400', fixedWing: true, place: 3, of: 3, final: true, points: 7, flightMs: 1, totalS: 1, replay: ok });
  check('room: a later place when called is lost, points counted', lost.result.kind === 'lost' && lost.accuracy[1].what === 'debrief.points' && lost.accuracy[1].n === 7 && lost.accuracy[1].of === null);
  const none = fromRoom({ activity: 'combat', aircraft: 'x', place: null, of: 0, final: true, flightMs: 1, totalS: NaN, replay: ok });
  check('room: no standing, no place line, no time line', none.accuracy.length === 0 && none.records.length === 0 && none.result.kind === 'complete');
  check('room: the room rows lead', JSON.stringify(won.next) === '["room","replay","title"]');
}

/* An ops mission. */
{
  const items = [{ required: true, kind: 'mine' }, { required: true, kind: 'rec' }, { required: true, kind: 'squad' }, { required: false, kind: 'missing' }];
  const flight = { aircraft: 'bramor2300', fixedWing: true, flightMs: 300000, totalS: 4000, replay: ok };
  const w = fromOps({ won: true, ended: false, items, stars: { got: 2, of: 3 }, flight });
  check('ops: won, required captured 2 of 3 (the optional one not counted)', w.result.kind === 'won' && w.accuracy[0].n === 2 && w.accuracy[0].of === 3);
  check('ops: stars 2 of 3', w.accuracy[1].what === 'debrief.stars' && w.accuracy[1].n === 2 && w.accuracy[1].of === 3);
  check('ops: its own buttons in order', JSON.stringify(w.next) === '["again","replay","continue"]');
  const l = fromOps({ won: false, ended: false, items: [], stars: { got: 0, of: 0 }, flight });
  check('ops: lost, no items or stars, no lines', l.result.kind === 'lost' && l.accuracy.length === 0);
  check('ops: ended', fromOps({ won: false, ended: true, items: [], stars: null, flight }).result.kind === 'ended');
}

/* The bests a run set (src/game/progress.js awardBest, PROGRESSION.md
 * section 3): a "New best" line each, the old value and the new. */
{
  const race = fromRace({ aircraft: 'timber1500', log: [{ n: 1, ms: 41000 }], recordAtStart: 42000, flightMs: 60000, totalS: 100, replay: ok });
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
  const tag = withBests(fromRoom({ activity: 'tag', aircraft: 'cub1400', place: 1, of: 2, final: true, points: 5, flightMs: 1, totalS: 1, replay: ok }), bests);
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
  const free = withBests(fromFree({ aircraft: 'cub1400', fixedWing: true, summary: { total: 0, tricks: 0, unique: 0, crashes: 0, durationMs: 1 }, flightMs: 1, totalS: 1, replay: ok }), did);
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

console.log(failed ? `${failed} failed` : 'all passed');
process.exitCode = failed;
