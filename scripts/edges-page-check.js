/*
 * edges-page-check.js: the world's edge in the page (src/game/edges.js
 * through src/main.js edgeFrame). One world, the default plane, nothing
 * flown: the plane is put down inside the square, past it, past twice it
 * and back, and the banner and the start are read.
 *
 *   node scripts/edges-page-check.js [map]     alps by default
 *
 *   inside        no edge banner;
 *   past it       the turn back line, the bearing and distance to the
 *                 map's start;
 *   past twice    the notice, then back on the map's start within
 *                 RESET_NOTICE_MS and a margin, not before 4 s;
 *   called off    out past twice and back inside it before the notice
 *                 runs out: no reset.
 *
 * Exits 1 on any failure.
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

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, FIRST_AIRFRAME, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { RESET_NOTICE_MS, WORLD_EDGES } from '../src/game/edges.js';
import en from '../src/strings/en.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const map = process.argv[2] || 'alps';
const HALF = WORLD_EDGES[map];

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
const lead = (key) => en[key].split('{')[0];

const settings = {
  ...seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, FIRST_AIRFRAME),
  airframeAsked: true, map, freestyleMap: map, graphics: 'low', graphicsAuto: false, sound: false, fpsCap: 0, wingView: 'chase', language: 'en',
};
const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, ${JSON.stringify(settings)});
  localStorage.setItem(k, JSON.stringify(s));
  localStorage.setItem('webfpv.airhint.v2', '1');
  localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
} catch (e) { /* storage refused; the map check below says so */ }
navigator.getGamepads = () => [];`];

const page = await openPage({ root, width: 960, height: 540, seed });
try {
  await page.until('window.__shellReady === true', 300000);
  await page.until('window.__map && window.__map().ready', 400000);
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until(`window.__craftState && window.__craftState().mode === 'flight' && window.__map().ready && window.__map().id === ${JSON.stringify(map)}`, 400000);
  await page.until('(() => { const i = window.__intro(); return !i.orbiting && !i.approaching && !i.zooming; })()', 60000);
  const home = await page.evaluate('window.__map().spawn');
  const frames = async (n) => {
    await page.evaluate('window.__cf = window.__boot().frames');
    await page.until(`window.__boot().frames > window.__cf + ${n}`, 60000);
  };
  const banner = () => page.evaluate('window.__ui.bannerText || ""');
  const put = async (x, z) => {
    await page.evaluate(`window.__respawn(${x}, ${z}, ${home.yaw})`);
    await frames(3);
  };
  const where = () => page.evaluate('(() => { const s = window.__craftState(); return { x: s.worldX, z: s.worldZ }; })()');

  await put(home.x, home.z);
  let b = await banner();
  check('at the start: no edge banner', !b.startsWith(lead('edge.turn_back')) && !b.startsWith(lead('edge.leaving')), JSON.stringify(b));

  const outX = HALF * 1.5;
  await put(outX, home.z);
  b = await banner();
  const bearing = Math.round((Math.atan2(home.x - outX, 0) * 180) / Math.PI + 360) % 360;
  const km = (Math.abs(home.x - outX) / 1000).toFixed(1);
  check(`past the square at x ${outX}: turn back, ${km} km, bearing ${bearing}`, b.startsWith(lead('edge.turn_back')) && b.includes(`${km} km`) && b.includes(`${bearing}°`), JSON.stringify(b));

  const farX = HALF * 2.2;
  await put(farX, home.z);
  b = await banner();
  check(`past twice the square at x ${farX}: the notice`, b.startsWith(lead('edge.leaving')), JSON.stringify(b));
  const t0 = Date.now();
  await page.until(`(() => { const s = window.__craftState(); return Math.hypot(s.worldX - ${home.x}, s.worldZ - ${home.z}) < 5; })()`, RESET_NOTICE_MS + 10000);
  const took = Date.now() - t0;
  check(`and back on the start after the notice`, took > RESET_NOTICE_MS - 1000 && took < RESET_NOTICE_MS + 5000, `${took} ms`);

  await put(farX, home.z);
  await page.sleep(2000);
  await put(outX, home.z);
  await page.sleep(RESET_NOTICE_MS);
  const p = await where();
  b = await banner();
  check('out past twice and back inside it in 2 s: the notice is called off, no reset', Math.abs(p.x - outX) < 5 && b.startsWith(lead('edge.turn_back')), `craft at x ${p.x.toFixed(1)}, ${JSON.stringify(b)}`);

  const errs = page.errors.filter((e) => !e.startsWith('network:'));
  check('no page error', errs.length === 0, errs.slice(0, 2).join(' | '));
} finally {
  await page.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
