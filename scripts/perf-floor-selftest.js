/*
 * perf-floor-selftest.js: the frame rate floor's watch (src/render/floor.js):
 * silent while the owner's number is unset, said once under a set one by
 * the 95th percentile frame, never for a hitch, a pause or a pilot's own
 * cap, and the strings it says in both languages.
 *
 *   npm run perf:floor:selftest
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

import { FLOOR_FPS, FLOOR_WINDOW, createFloorWatch, lowerGraphics } from '../src/render/floor.js';
import EN from '../src/strings/en.js';
import ES from '../src/strings/es.js';

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
}

/* Feeds `count` frames `ms` apart (or as `ms(i)` says) and returns the
 * frame numbers on which the watch fired. */
function fly(watch, count, ms, capHz = 0, t0 = 1000) {
  const fired = [];
  let t = t0;
  for (let i = 0; i < count; i += 1) {
    t += typeof ms === 'function' ? ms(i) : ms;
    if (watch.frame(t, capHz)) {
      fired.push(i);
    }
  }
  return fired;
}

console.log('the owner\'s floor');
check('FLOOR_FPS is the owner\'s, unset until set', FLOOR_FPS === null, String(FLOOR_FPS));
check('unset, a crawl of 5 fps says nothing', fly(createFloorWatch(), 3000, 200).length === 0);

console.log('a floor of 30');
const slow = createFloorWatch(30);
const fired = fly(slow, 3000, 40);
check('25 fps throughout: said once, once the window is full', fired.length === 1 && fired[0] >= FLOOR_WINDOW - 1, JSON.stringify(fired));
check('and not again in that world', fly(slow, 3000, 40, 0, 1e6).length === 0);
slow.reset();
check('a new world says it again', fly(slow, 3000, 40).length === 1);
check('60 fps throughout: nothing', fly(createFloorWatch(30), 3000, 1000 / 60).length === 0);
check('60 fps with one 40 ms frame in 25: nothing (4 %, under the 5 % tail)',
  fly(createFloorWatch(30), 3000, (i) => (i % 25 === 0 ? 40 : 1000 / 60)).length === 0);
check('60 fps with one 40 ms frame in 10: said (10 %, over the 5 % tail)',
  fly(createFloorWatch(30), 3000, (i) => (i % 10 === 0 ? 40 : 1000 / 60)).length === 1);
check('a pilot capped at 30 is not told about 30', fly(createFloorWatch(30), 3000, 40, 30).length === 0);
check('a pilot capped at 60 is', fly(createFloorWatch(30), 3000, 40, 60).length === 1);
/* 25 fps in runs of 500 frames broken by a 3 s pause: no window fills. */
check('a pause starts the count again', fly(createFloorWatch(30), 3000, (i) => (i % 500 === 499 ? 3000 : 40)).length === 0);

console.log('what it says');
check('one preset down from high is medium, from low none', lowerGraphics('high') === 'medium' && lowerGraphics('medium') === 'low' && lowerGraphics('low') === null);
for (const key of ['perf.floor_lower', 'perf.floor_lowest']) {
  check(`${key} in English and Spanish, with {fps}`, typeof EN[key] === 'string' && typeof ES[key] === 'string' && EN[key].includes('{fps}') && ES[key].includes('{fps}'),
    `${EN[key]} | ${ES[key]}`);
}
check('perf.floor_lower names the preset in both', EN['perf.floor_lower'].includes('{tier}') && ES['perf.floor_lower'].includes('{tier}'));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
