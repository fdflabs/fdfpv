/*
 * rooms-slots-check.js: every room slot and pilot station on the live maps
 * is somewhere an aircraft can start and a person can stand. Headless, one
 * page per map, no rooms server needed (the slots are the map's own
 * spawn moved, src/game/slots.js).
 *
 *   node scripts/rooms-slots-check.js [map ...]     alps and swiss2 by default
 *
 * A slot passes when its ground is within SLOPE_M of the spawn's (so the
 * row is on the same field, not up a bank or down a ditch) and nothing
 * solid is within CLEAR_M of a point a metre over it. A station the same.
 * A map with water: every slot moved from the floats' start is still on
 * the water.
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

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const maps = process.argv.slice(2).length ? process.argv.slice(2) : ['alps', 'swiss2'];
const SLOPE_M = 2;
const CLEAR_M = 3;

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

for (const map of maps) {
  console.log(map);
  const seed = [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, { map: ${JSON.stringify(map)}, freestyleMap: ${JSON.stringify(map)}, graphics: 'low', fpsCap: 0, airframeAsked: true });
    localStorage.setItem(k, JSON.stringify(s));
  } catch (e) { /* storage refused */ }`];
  const page = await openPage({ root, width: 960, height: 540, seed });
  try {
    await page.until('window.__shellReady === true', 300000);
    await page.until('window.__map && window.__map().ready', 400000);
    /* The title shows a world of its own; flying seats the chosen one. */
    await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
    await page.until(`window.__craftState && window.__craftState().mode === 'flight' && window.__map().ready && window.__map().id === ${JSON.stringify(map)}`, 400000);
    const got = await page.evaluate('window.__roomSlots()');
    const h0 = got.spawn.y;
    /* Infinity (nothing within the probe's reach) arrives as null. */
    const gapOf = (s) => (s.gap == null ? Infinity : s.gap);
    for (const s of [...got.slots, ...got.stations]) {
      s.gap = gapOf(s);
    }
    got.slots.forEach((s, i) => {
      check(`slot ${i}: ground ${(s.y - h0).toFixed(2)} m from the spawn's, ${Number.isFinite(s.gap) ? s.gap.toFixed(1) : 'nothing'} m to anything solid`,
        Math.abs(s.y - h0) < SLOPE_M && s.gap > CLEAR_M);
    });
    got.stations.forEach((s, i) => {
      check(`station ${i}: ground ${(s.y - h0).toFixed(2)} m, ${Number.isFinite(s.gap) ? s.gap.toFixed(1) : 'nothing'} m clear`,
        Math.abs(s.y - h0) < SLOPE_M && s.gap > 1);
    });
    if (got.water) {
      check('every floats slot is on the water', got.water.every((w) => w.wet), got.water.map((w) => (w.wet ? 'wet' : 'DRY')).join(' '));
    }
    const errs = page.errors.filter((e) => !e.startsWith('network:'));
    check('no page error', errs.length === 0, errs.slice(0, 2).join(' | '));
  } finally {
    await page.close();
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
