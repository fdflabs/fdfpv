/*
 * hoist-check.js: src/share/war/hoist.js, the one law for how far a
 * spillway gate stands open (the room, the water and the drawing all use
 * it). Node only.
 *
 *   default    no entries, null, or none for this gate: FREE_OPEN_M
 *   ramp       from FREE_OPEN_M at its `at` toward open_m at HOIST_M_S,
 *              not before `at`, stopping at open_m, down as well as up
 *   retarget   a later entry mid ramp starts from where the ramp is at
 *              its own `at`
 *   others     entries for other gates change nothing
 *   same at    two entries at one `at`: the later in the list wins
 *   order      the list's order otherwise does not matter
 *
 *   node scripts/hoist-check.js
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

import { FREE_OPEN_M, HOIST_M_S, openAt } from '../src/share/war/hoist.js';

let failed = 0;
let passed = 0;
function check(ok, what, detail) {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${what}  (${detail})`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
}
const near = (a, b) => Math.abs(a - b) < 1e-9;
/* Metres the hoist travels in s seconds. */
const run = (s) => HOIST_M_S * s;

check(FREE_OPEN_M === 2 && openAt(null, 'gate-1', 5) === 2 && openAt([], 'gate-1', 5) === 2,
  'no entries: every gate at FREE_OPEN_M, 2 m', `${openAt(null, 'gate-1', 5)}, ${openAt([], 'gate-1', 5)}`);

const up = [{ gate: 'gate-5', at: 1000, open_m: 3 }];
const rows = [0, 1000, 61000, 1e7].map((t) => openAt(up, 'gate-5', t));
check(near(rows[0], 2) && near(rows[1], 2) && near(rows[2], 2 + run(60)) && near(rows[3], 3),
  'a ramp: still before its at, at HOIST_M_S from it, stopped at open_m', rows.join(', '));
const down = [{ gate: 'gate-5', at: 0, open_m: 1 }];
check(near(openAt(down, 'gate-5', 60000), 2 - run(60)) && near(openAt(down, 'gate-5', 1e7), 1),
  'and down as well', `${openAt(down, 'gate-5', 60000)}, ${openAt(down, 'gate-5', 1e7)}`);

const re = [{ gate: 'gate-5', at: 1000, open_m: 3 }, { gate: 'gate-5', at: 61000, open_m: 1 }];
const mid = 2 + run(60);
const back = [61000, 121000, 1e7].map((t) => openAt(re, 'gate-5', t));
check(near(back[0], mid) && near(back[1], mid - run(60)) && near(back[2], 1),
  'a retarget mid ramp starts from where the ramp is at its own at', back.join(', '));

const others = [...re, { gate: 'gate-2', at: 0, open_m: 9 }, { gate: 'gate-50', at: 0, open_m: 0 }];
const same = [0, 61000, 121000, 1e7].every((t) => openAt(others, 'gate-5', t) === openAt(re, 'gate-5', t));
check(same && openAt(others, 'gate-7', 1e7) === FREE_OPEN_M, 'entries for other gates change nothing', `gate-7 ${openAt(others, 'gate-7', 1e7)}`);

const tie = [{ gate: 'gate-3', at: 5000, open_m: 8 }, { gate: 'gate-3', at: 5000, open_m: 0 }];
const tieRev = [tie[1], tie[0]];
check(near(openAt(tie, 'gate-3', 1e7), 0) && near(openAt(tieRev, 'gate-3', 1e7), 8),
  'two at one at: the later in the list wins', `${openAt(tie, 'gate-3', 1e7)}, ${openAt(tieRev, 'gate-3', 1e7)}`);

const shuffled = [re[1], { gate: 'gate-2', at: 0, open_m: 9 }, re[0]];
check([0, 61000, 121000, 1e7].every((t) => openAt(shuffled, 'gate-5', t) === openAt(re, 'gate-5', t)),
  'otherwise the list\'s order does not matter', 'same at every time');

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
