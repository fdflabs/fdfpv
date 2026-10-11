/*
 * results-layout-check.js: the race results' lap table at 1280x720, in the
 * real page.
 *
 *     node scripts/results-layout-check.js
 *
 * Three laps of the ring in tests/fixtures/map-track-v4.json, flown by
 * placing the craft through each gate as scripts/ghost-shell-check.js does.
 * On the results screen the lap table must end above the menu, and its
 * last row must be reachable: the table scrolls to it and it ends above
 * the menu. (No pointer row: #ui is pointer-events none, so
 * elementFromPoint cannot see a results row.) Before the fix the table kept a
 * height the column did not have and its last row ran under the menu.
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

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { frames } from '../tests/lib/buildkeys.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { LANG_KEY } from '../src/strings/index.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outArg = process.argv.slice(2).find((a) => a.startsWith('--out='));
const outDir = outArg ? outArg.slice('--out='.length) : null;
const LIBRARY_KEY = 'webfpv.trackbuilder.library.v1';

let failed = 0;
let passed = 0;
const say = (ok, what) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
};

function seeds(lang, track) {
  const settings = {
    ...seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'interceptor'),
    airframeAsked: true,
    map: 'track',
    graphics: 'low',
    graphicsAuto: false,
    sound: false,
    fpsCap: 0,
    laps: 3,
    /* The flight feel question opens over a first race's results after a
     * delay; it is not what this check is about. */
    feelAsked: true,
  };
  return [`try {
    const s = JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}) || '{}');
    Object.assign(s, ${JSON.stringify(settings)});
    localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, JSON.stringify(s));
    localStorage.setItem('webfpv.airhint.v2', '1');
    localStorage.setItem(${JSON.stringify(LANG_KEY)}, ${JSON.stringify(lang)});
    localStorage.setItem(${JSON.stringify(LIBRARY_KEY)}, ${JSON.stringify(JSON.stringify({ [track.id]: track }))});
  } catch (e) { /* storage refused */ }`];
}

async function choose(page, action) {
  const home = await page.evaluate("window.__ui.items().some((it) => it.action === 'hub-club')");
  if (action.startsWith('way-') && home) {
    await choose(page, 'hub-club');
    await page.until("window.__ui.hub === 'club'", 5000);
  }
  const at = await page.evaluate(`window.__ui.items().findIndex((it) => it.action === ${JSON.stringify(action)})`);
  if (at < 0) {
    throw new Error(`no row ${action} on ${await page.evaluate('window.__ui.screen')}`);
  }
  await page.evaluate(`(() => { window.__ui.setCursor(${at}); window.__ui.select(); return true; })()`);
}

async function playRing(page, track) {
  const n = track.sequence.length;
  await page.until('!!window.__shellReady', 300000);
  await page.until('window.__map && window.__map().ready', 400000);
  await page.until('window.__ui.onGate()', 60000);
  await choose(page, 'way-race-5inch');
  await page.until('window.__ui.carousel.isOpen', 10000);
  await page.tap('Enter');
  await page.until("window.__ui.screen === 'courses'", 20000);
  const at = await page.evaluate(`window.__ui.items().findIndex((it) => it.course && it.course.track.id === ${JSON.stringify(track.id)})`);
  await page.evaluate(`(() => { window.__ui.setCursor(${at}); window.__ui.select(); return true; })()`);
  await page.until(`window.__ui.cardSubject && window.__ui.cardSubject.endsWith(${JSON.stringify(`:${track.id}`)})`, 5000);
  await choose(page, 'card-fly');
  await page.until(`window.__ui.screen === 'launch' && window.__map().ready && window.__race().gates.length === ${n}`, 600000);
  await choose(page, 'launch-go');
  await page.until("window.__craftState().mode === 'flight' && window.__ui.screen === 'flight'", 120000);
  await page.until("!/^[123]$/.test(window.__craftState().banner || '')", 30000);
  await frames(page, 10);
}

const gatesOf = (page) => page.evaluate(`window.__race().gates.map((g) => ({
  centre: [g.x, g.y + (g.apertures[0] ? g.apertures[0].centreY : 0), g.z],
  travel: [g.az.x, g.az.y, g.az.z],
}))`);

async function through(page, g) {
  const from = g.centre.map((v, i) => v - g.travel[i] * 1.2);
  const to = g.centre.map((v, i) => v + g.travel[i] * 1.2);
  await page.evaluate(`window.__placeCraft(${to.join(',')}, ${from.join(',')})`);
  await frames(page, 3);
  await page.sleep(250);
}

async function shot(page, name) {
  if (!outDir) {
    return;
  }
  await mkdir(outDir, { recursive: true });
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(outDir, name), Buffer.from(data, 'base64'));
}

async function run(track) {
  console.log('\n1280x720: three laps of the ring, then the results');
  const page = await openPage({ root, width: 1280, height: 720, url: '/index.html', seed: seeds('en', track) });
  try {
    await playRing(page, track);
    const G = await gatesOf(page);
    for (let lap = 0; lap < 3; lap += 1) {
      for (let k = 0; k < G.length; k += 1) {
        await through(page, G[k]);
      }
    }
    await through(page, G[0]);
    await page.until("window.__craftState().mode === 'results' && window.__ui.screen === 'results'", 30000);
    await page.sleep(900);
    const got = JSON.parse(await page.evaluate(`(() => {
      const menu = document.querySelector('.screen-results .results-foot').getBoundingClientRect();
      const table = document.querySelector('.screen-results .results');
      const t = table.getBoundingClientRect();
      const rows = [...table.querySelectorAll('.result-row')];
      const last = rows[rows.length - 1];
      last.scrollIntoView({ block: 'nearest' });
      const r = last.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return JSON.stringify({ rows: rows.length, tableBottom: Math.round(t.bottom), tableHeight: Math.round(t.height), menuTop: Math.round(menu.top),
        lastHit: Boolean(hit && last.contains(hit)), hit: hit ? hit.className : null, lastBottom: Math.round(r.bottom) });
    })()`));
    say(got.rows >= 3, `the table has the laps: ${got.rows} rows`);
    say(got.tableBottom <= got.menuTop, `the table ends above the menu: ${got.tableBottom} <= ${got.menuTop}`);
    say(got.tableHeight >= 40, `and keeps room for a row: ${got.tableHeight} px`);
    say(got.lastBottom <= got.menuTop, `the last row scrolls into view above the menu: ${JSON.stringify(got)}`);
    await shot(page, 'results-layout-1280x720.png');
  } finally {
    await page.close();
  }
}

const track = JSON.parse(await readFile(join(root, 'tests/fixtures/map-track-v4.json'), 'utf8'));
try {
  await run(track);
} catch (e) {
  failed += 1;
  console.log(`  FAIL  ${e.stack || e}`);
}
console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
