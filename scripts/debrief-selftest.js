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

import { createRoute, fromFree, fromRace, nextActions, replayState, ROUTE_MAX } from '../src/game/debrief.js';

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
  check('route: top', near(s.topM, 30));
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
  r.add(0, 0, 1, 0);
  r.add(100, 3, 1, 4);
  r.add(200, 6, 1, 8);
  const short = r.snapshot();
  check('route: a short hop ends where it stopped', JSON.stringify(short.points) === '[[0,0],[6,8]]' && near(short.distanceM, 10), JSON.stringify(short));
  r.reset();
  check('route: reset empties again', r.snapshot() === null);
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
