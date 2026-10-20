/*
 * medals-selftest.js: the medals a pilot's progress holds, in plain Node
 * (src/game/medals.js, docs/FLIGHTCLUB-PROGRESSION.md section 2). The
 * better of two medals, the steps a new one reaches, a medal paying once
 * per step, and two computers merging to the better medal. The times from
 * one gold, the lap that reached one and the publish that set one left
 * with the race and the track builder (the combat-only cut, 2026-10-20).
 *
 *   node scripts/medals-selftest.js
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

import { betterMedal, newSteps } from '../src/game/medals.js';
import { MEDAL_XP, awardMedal, freshProgress, normaliseProgress } from '../src/game/progress.js';
import { mergeBlobs } from '../src/share/progressmerge.js';

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` (${detail})`}`);
  if (!ok) {
    failed += 1;
  }
}

check('the better medal', betterMedal('silver', 'gold') === 'gold' && betterMedal('gold', undefined) === 'gold' && betterMedal(null, undefined) === null && betterMedal('bronze', 'x') === 'bronze');
check('new steps', JSON.stringify(newSteps(null, 'gold')) === '["bronze","silver","gold"]' && newSteps('gold', 'silver').length === 0 && JSON.stringify(newSteps('bronze', 'silver')) === '["silver"]');

/* Progress: once per step. */
const p = freshProgress();
const K = 'track:trk-1a2b3c4d';
const first = awardMedal(p, K, 'silver');
const xpOf = (ev) => (ev.find((e) => e.type === 'xp') || {}).xp || 0;
check('a first silver pays bronze and silver', xpOf(first) === 2 * MEDAL_XP && p.medals[K] === 'silver' && first[0].type === 'medal');
check('the same medal again pays nothing', awardMedal(p, K, 'silver').length === 0 && p.xp === 2 * MEDAL_XP);
check('a lower medal pays nothing and is not kept', awardMedal(p, K, 'bronze').length === 0 && p.medals[K] === 'silver');
check('gold then pays one step', xpOf(awardMedal(p, K, 'gold')) === MEDAL_XP && p.medals[K] === 'gold' && p.xp === 3 * MEDAL_XP);
check('no course key pays nothing', awardMedal(p, '', 'gold').length === 0);
check('normaliseProgress keeps medals, drops unknown ones', JSON.stringify(normaliseProgress({ xp: 1, medals: { a: 'gold', b: 'platinum', c: 3 } }).medals) === '{"a":"gold"}');
check('an old profile reads as no medals', JSON.stringify(normaliseProgress({ xp: 5 }).medals) === '{}');

/* Two computers. */
const one = { v: 1, data: { progress: { ...freshProgress(), xp: 100, medals: { a: 'gold', b: 'bronze' } } }, stamps: {} };
const two = { v: 1, data: { progress: { ...freshProgress(), xp: 50, medals: { b: 'silver', c: 'bronze' } } }, stamps: {} };
const m1 = mergeBlobs(one, two).data.progress.medals;
const m2 = mergeBlobs(two, one).data.progress.medals;
check('a merge keeps the better medal per course', m1.a === 'gold' && m1.b === 'silver' && m1.c === 'bronze', JSON.stringify(m1));
check('either way round', JSON.stringify(Object.entries(m1).sort()) === JSON.stringify(Object.entries(m2).sort()));
check('a merge never invents a medal', Object.keys(m1).length === 3);

console.log(failed ? `${failed} FAILED` : 'medals selftest PASS');
process.exit(failed ? 1 : 0);
