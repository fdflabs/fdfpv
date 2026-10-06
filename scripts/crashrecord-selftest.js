/*
 * crashrecord-selftest.js: the bug report's crash record, in Node.
 *
 * src/share/crashrecord.js keeps the last aircraft crash and the last
 * uncaught page errors for the next F8 (bug-484f7119). What is checked here
 * is what the board would see: nothing when nothing happened, the crash
 * with its age while it is recent and nothing once it is not, a repeating
 * error counted rather than copied, and a worst case record, every field at
 * its longest, well inside the board's context cap of 8000 characters.
 * The page itself, a real wreck and a real F8, is npm run bug:crash.
 *
 * Run: npm run crashrecord:selftest
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { createCrashRecord, watchPageErrors, CRASH_RECENT_MS, MAX_ERRORS } from '../src/share/crashrecord.js';

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

let t = 1000;
const clock = () => t;

{
  const r = createCrashRecord(clock);
  check('nothing happened, nothing is reported', r.report() === null);

  r.noteCraft({
    kind: 'wreck', airframe: '5inch', map: 'swiss2', flags: ['armLost', 'motorLost'],
    hits: [{ part: 'arm front left', type: 'break', surface: 'grass', closing: 17.456, force: 900 }],
    speed: 3.21, agl: 0.04, at: [1.234, 2.345, 3.456],
  });
  t += 14000;
  const a = r.report();
  check('a crash 14 s ago is reported with its age', a && a.craft && a.craft.ageS === 14, JSON.stringify(a));
  check('with what broke and what it hit, rounded',
    a && a.craft.flags.join() === 'armLost,motorLost' && a.craft.hits[0].surface === 'grass'
      && a.craft.hits[0].closing === 17.5 && a.craft.at.join() === '1.2,2.3,3.5',
    JSON.stringify(a && a.craft));
  check('and none of the fields it was not asked to keep', a && !('force' in a.craft.hits[0]) && !('atMs' in a.craft));

  r.noteCraft({ kind: 'ground', hits: new Array(20).fill({ part: 'body', type: 'hit', surface: 'dirt', closing: 9 }) });
  const b = r.report();
  check('the latest crash replaces the one before', b.craft.kind === 'ground' && b.craft.ageS === 0, b.craft.kind);
  check('and keeps its last four hits only', b.craft.hits.length === 4, String(b.craft.hits.length));

  t += CRASH_RECENT_MS + 1;
  check(`a crash older than ${CRASH_RECENT_MS / 1000} s is not reported`, r.report() === null);
}

{
  const r = createCrashRecord(clock);
  for (let i = 0; i < 50; i += 1) {
    r.noteError('sim_state: SIM_ERR_STATE', 'frameBody (src/main.js:11200:9)');
  }
  const a = r.report();
  check('an error thrown every frame is one entry with a count',
    a && a.errors.length === 1 && a.errors[0].count === 50, JSON.stringify(a));
  for (let i = 0; i < 6; i += 1) {
    r.noteError(`error ${i}`, `at f${i}`);
  }
  const b = r.report();
  check(`only the last ${MAX_ERRORS} errors are kept`,
    b.errors.length === MAX_ERRORS && b.errors[MAX_ERRORS - 1].message === 'error 5', b.errors.map((e) => e.message).join());
}

{
  /* Every field at its longest. The fields are the shell's own names and
   * numbers and an error's text, so plain characters are the real case. */
  const r = createCrashRecord(clock);
  const long = 'x'.repeat(5000);
  r.noteCraft({
    kind: long, airframe: long, map: long, flags: new Array(50).fill(long),
    hits: new Array(50).fill({ part: long, type: long, surface: long, closing: 1e308 }),
    speed: 1e308, agl: -1e308, at: [1e308, 1e308, 1e308, 1e308],
  });
  for (let i = 0; i < 10; i += 1) {
    r.noteError(long + i, long);
  }
  const chars = JSON.stringify(r.report()).length;
  check(`a worst case record is ${chars} chars, under a quarter of the board's 8000`, chars < 2000,
    String(chars));
}

{
  /* The page's listeners, on a stand in window. */
  const handlers = {};
  const win = { addEventListener: (type, fn) => { handlers[type] = fn; } };
  const r = createCrashRecord(clock);
  watchPageErrors(win, r);
  const err = new Error('peer is undefined');
  err.stack = 'Error: peer is undefined\n    at roomFrame (https://fdflabs.github.io/fdfpv/src/main.js:2349:12)\n    at frameBody (https://fdflabs.github.io/fdfpv/src/main.js:11300:5)\n    at frame (x)';
  handlers.error({ message: 'Uncaught Error: peer is undefined', error: err, filename: '', lineno: 0, colno: 0 });
  handlers.unhandledrejection({ reason: new Error('board 500') });
  handlers.unhandledrejection({ reason: 'plain' });
  const a = r.report();
  check('an uncaught error is recorded, where it threw with the origin stripped',
    a && a.errors[0].where === 'at roomFrame (fdfpv/src/main.js:2349:12) | at frameBody (fdfpv/src/main.js:11300:5)', a && a.errors[0].where);
  check('and a rejection, named as one', a && a.errors[1].message === 'unhandledrejection: board 500', a && a.errors[1].message);
  check('a rejection with no Error behind it still says what it was', a && a.errors[2].message === 'unhandledrejection: plain');
}

console.log(`\n${passed} passed${failed ? `, ${failed} FAILED` : ''}`);
process.exit(failed ? 1 : 0);
