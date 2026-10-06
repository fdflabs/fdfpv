/*
 * score-golden.js: src/game/score.js held to the exact outputs it gave when
 * tests/fixtures/score-golden.json was written. npm run score:golden.
 *
 * scripts/score-selftest.js says what the scorer should do, case by case,
 * in words. This says that it still does precisely what it did: seeded runs
 * of every call a caller makes (land, tick, bank, crash, finish, reset, the
 * timed switch) in random order and with awkward arguments, every return
 * value and throw, and after every call everything a caller can read back:
 * view(), summary(), the drained events and the fields main.js, the
 * harnesses and score-selftest read directly (timed, nowMs, state, crashes,
 * streak, bonus, obstacleSwitches and the tricks list). It also re-reads
 * the view from the call before, because view().combo.names is the live
 * list and a screen holding last frame's view sees it grow.
 *
 * The record is written with --record; see scripts/lib/golden.js. Write it
 * again only on purpose, with the reason in the pull request.
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

import {
  COMBO_MULT_MAX, COMBO_WINDOW_MS, FreestyleScore, RUN_FLYING, RUN_MS, RUN_OVER, RUN_READY, formatScore,
} from '../src/game/score.js';
import { EXECUTION, trickNames } from '../src/game/tricks.js';
import { goldenMain, seeded } from './lib/golden.js';

const FIXTURE = new URL('../tests/fixtures/score-golden.json', import.meta.url);

/* Every name the catalogue prices, plus one it does not, which must throw. */
const NAMES = [...trickNames(), 'Not A Trick'];
const EXECUTIONS = [...Object.keys(EXECUTION), 'BOGUS', undefined];
const OBSTACLES = [undefined, null, 'rail-1', 'rail-2', 'pole-7', 0, 3];

const OPTION_SETS = [
  {},
  { comboEnabled: false },
  { timed: false },
  { comboWindowMs: 1500, multMax: 3, runMs: 20000 },
  { multMax: 1 },
  { comboEnabled: false, timed: false },
];

function makeTrick(rng, nowMs) {
  const t = { name: rng.chance(0.6) ? rng.pick(NAMES.slice(0, 12)) : rng.pick(NAMES) };
  const e = rng.pick(EXECUTIONS);
  if (e !== undefined) t.execution = e;
  if (rng.chance(0.8)) t.endMs = nowMs + rng.int(-200, 200);
  const ob = rng.pick(OBSTACLES);
  if (ob !== undefined) t.obstacle = ob;
  if (rng.chance(0.05)) t.assisted = true;
  if (rng.chance(0.7)) t.turns = rng.pick([0.5, 1, 2, -1, 0.25]);
  return t;
}

function readBack(s, sc) {
  s.say('view', sc.view());
  s.say('summary', sc.summary());
  s.say('events', sc.drainEvents());
  s.say('fields', {
    timed: sc.timed,
    nowMs: sc.nowMs,
    state: sc.state,
    crashes: sc.crashes,
    streak: sc.streak,
    bonus: sc.bonus,
    obstacleSwitches: sc.obstacleSwitches,
    tricks: sc.tricks,
  });
  s.say('queries', {
    over: sc.over(), remain: sc.remainMs(), total: sc.total(), mult: sc.comboMultiplier(),
  });
}

function runCase(seed, opts, steps) {
  return (s) => {
    const rng = seeded(seed);
    const sc = new FreestyleScore(opts);
    let now = 0;
    let prevView = null;
    readBack(s, sc);
    for (let i = 0; i < steps; i += 1) {
      const roll = rng.next();
      if (roll < 0.45) {
        const trick = makeTrick(rng, now);
        s.say('land.arg', trick);
        s.call('land', () => sc.land(trick));
      } else if (roll < 0.75) {
        now += rng.pick([0, 1, 16, 250, 900, 2999, 3000, 3001, 5000, 40000]);
        s.call('tick', () => sc.tick(now));
      } else if (roll < 0.82) {
        s.call('bank', () => sc.bank());
      } else if (roll < 0.89) {
        s.call('crash', () => sc.crash());
      } else if (roll < 0.93) {
        s.call('finish', () => sc.finish());
      } else if (roll < 0.96) {
        sc.timed = !sc.timed;
        s.say('timed', sc.timed);
      } else if (roll < 0.98) {
        s.call('reset', () => sc.reset());
      } else {
        now = rng.int(0, 200000);
        s.call('tick.jump', () => sc.tick(now));
      }
      if (prevView) s.say('prevView', prevView);
      readBack(s, sc);
      prevView = sc.view();
    }
  };
}

const cases = [];
cases.push({
  id: 'constants',
  run: (s) => s.say('constants', {
    COMBO_MULT_MAX, COMBO_WINDOW_MS, RUN_FLYING, RUN_MS, RUN_OVER, RUN_READY,
  }),
});
cases.push({
  id: 'formatScore',
  run: (s) => {
    const values = [0, -0, 1, -1, 0.4, 0.5, 1.5, 2.5, -0.5, -1.5, 999, 999.5, 1000, -1000, 12345,
      123456, 1234567, -1234567, 1e9, 1e21, 1e22, -1e21, 1596.75, 1597, NaN, Infinity, -Infinity, 4.999999999];
    for (const v of values) s.call(`formatScore(${String(v)})`, () => formatScore(v));
  },
});
for (let o = 0; o < OPTION_SETS.length; o += 1) {
  for (let k = 0; k < 40; k += 1) {
    const seed = 1000 * (o + 1) + k;
    cases.push({ id: `run-o${o}-s${seed}`, run: runCase(seed, OPTION_SETS[o], 80) });
  }
}

goldenMain('score:golden', FIXTURE, cases);
