/*
 * daytime-selftest.js: src/share/daytime.js agrees with what ships. Its
 * names are Itaipu's TIMES keys and main.js's ADDRESS_TIMES, its sun is
 * TIMES's, its night threshold is the Interior's over a whole day of
 * src/maps/interior/sun.js minute by minute, and its night verdict is
 * every war mission's. A negative control moves the threshold by 0.01 and
 * the sweep must catch it. Run with npm run daytime:selftest.
 *
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

import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TIME_NAMES, SUN_OF, NIGHT_SIN, isNightSun, nightOfTime } from '../src/share/daytime.js';
import { sunAt } from '../src/maps/interior/sun.js';
import { MISSIONS, missionTime } from '../src/share/war/missions/index.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `: ${detail}` : ''}`);
  }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* three is served from a CDN and is not in node_modules. light.js uses it
 * at load only for THREE.Color, so a stub Color lets the live TIMES load. */
const stub = 'data:text/javascript,export class Color { constructor(r, g, b) { Object.assign(this, { r, g, b }); } }';
register(`data:text/javascript,export async function resolve(s, c, next) {
  return s === 'three' ? { url: ${JSON.stringify(stub)}, shortCircuit: true } : next(s, c);
}`);
const { TIMES } = await import('../src/maps/itaipu/look/light.js');

const src = (p) => readFile(join(root, p), 'utf8');

// Names.
check('TIME_NAMES are itaipu TIMES keys', same(TIME_NAMES, Object.keys(TIMES)), `${TIME_NAMES} vs ${Object.keys(TIMES)}`);
const main = await src('src/main.js');
const addr = main.match(/const ADDRESS_TIMES = new Set\(\[([^\]]*)\]\)/);
check('main.js ADDRESS_TIMES found', addr != null);
const addressTimes = addr ? [...addr[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort() : [];
check('ADDRESS_TIMES are TIME_NAMES minus day', same(addressTimes, TIME_NAMES.filter((n) => n !== 'day').sort()), `${addressTimes}`);

// Sun per name.
for (const n of TIME_NAMES) {
  const t = TIMES[n];
  check(`SUN_OF.${n} is TIMES.${n}`, SUN_OF[n].azimuth === t.azimuth && SUN_OF[n].elevation === t.elevation,
    `${JSON.stringify(SUN_OF[n])} vs ${t.azimuth}/${t.elevation}`);
}

// The Interior's rule, read from its source so a change there fails here.
const look = await src('src/maps/interior/look.js');
const rule = look.match(/timeOfDay = sunDir\.y > (-?[0-9.]+) \? 'day' : 'night'/);
check('interior look night rule found', rule != null);
const interiorSin = rule ? Number(rule[1]) : NaN;
check('interior threshold is NIGHT_SIN', interiorSin === NIGHT_SIN, `${interiorSin} vs ${NIGHT_SIN}`);

/* Minutes over 0..24 h where a night rule disagrees with the Interior's. */
function sweep(night) {
  const bad = [];
  let flips = 0;
  let last = null;
  for (let m = 0; m <= 24 * 60; m += 1) {
    const y = sunAt(m / 60).dir[1];
    const want = !(y > interiorSin);
    if (night(y) !== want) bad.push(m);
    if (last != null && want !== last) flips += 1;
    last = want;
  }
  return { bad, flips };
}
const live = sweep(isNightSun);
check('interior sweep has a dusk and a dawn', live.flips === 2, `${live.flips} flips`);
check('isNightSun agrees with interior over 1441 minutes', live.bad.length === 0, `${live.bad.length} minutes, first ${live.bad[0]}`);

// Negative controls: a threshold 0.01 off either way must be caught.
for (const d of [0.01, -0.01]) {
  const wrong = sweep((y) => !(y > NIGHT_SIN + d));
  check(`negative control: NIGHT_SIN ${d > 0 ? '+' : ''}${d} is caught`, wrong.bad.length > 0, 'sweep saw no difference');
}

// Missions.
for (const m of Object.values(MISSIONS)) {
  const want = m.night === true || m.time === 'night';
  check(`mission ${m.id}: nightOfTime(missionTime) is ${want}`, nightOfTime(missionTime(m)) === want);
}
check('some mission is flown at night', Object.values(MISSIONS).some((m) => nightOfTime(missionTime(m))));

// The contract's edges.
check('nightOfTime(null) is day', nightOfTime(null) === false && nightOfTime(undefined) === false);
let threw = false;
try { nightOfTime('dusk'); } catch { threw = true; }
check('nightOfTime throws on an unknown name', threw);

console.log(`daytime: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
