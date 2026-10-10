/*
 * debrief-race-check.js: a solo race's debrief (docs/DEBRIEF.md), in the
 * real page.
 *
 *     node scripts/debrief-race-check.js [--out=<dir>]
 *
 * Three laps of the ring in tests/fixtures/map-track-v4.json, flown by
 * placing the craft through each gate as scripts/ghost-shell-check.js does,
 * end on the results screen. The rows check that the facts block shows the
 * flight (time in the air, the route from above, distance, clean laps, the
 * track record line, this aircraft's total), that Watch the replay is on
 * screen where a real pointer reaches it, that clicking it opens the crash
 * cam on this flight, that Escape comes back to the results (not to a
 * flight that has ended) and that Fly again flies. In English and Spanish.
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
import en from '../src/strings/en.js';
import es from '../src/strings/es.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outArg = process.argv.slice(2).find((a) => a.startsWith('--out='));
const outDir = outArg ? outArg.slice('--out='.length) : null;
const LIBRARY_KEY = 'webfpv.trackbuilder.library.v1';
const TABLES = { en, es };

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

/* Where a real pointer lands on a row: on screen, and elementFromPoint at
 * its middle is the row or inside it. Tags the row so page.click finds it. */
const REACH = (action) => `(() => {
  const i = window.__ui.items().findIndex((it) => it.action === ${JSON.stringify(action)});
  const row = i < 0 ? null : window.__ui.menuRows[i - (window.__ui.rowOffset || 0)];
  if (!row) { return 'missing'; }
  row.dataset.probe = ${JSON.stringify(action)};
  row.scrollIntoView({ block: 'nearest' });
  const r = row.getBoundingClientRect();
  const on = r.width > 0 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return on && hit && (hit === row || row.contains(hit)) ? 'ok' : (on ? 'covered by ' + (hit ? hit.className || hit.tagName : 'nothing') : 'off screen');
})()`;

const FACTS = `(() => {
  const box = document.querySelector('.results-facts');
  if (!box) { return null; }
  const dts = [...box.querySelectorAll('dt')].map((n) => n.textContent);
  const dds = [...box.querySelectorAll('dd')].map((n) => n.textContent);
  const line = box.querySelector('.results-route-line');
  const r = box.getBoundingClientRect();
  const menu = document.querySelector('.screen-results .menu').getBoundingClientRect();
  const table = document.querySelector('.screen-results .results').getBoundingClientRect();
  const hero = document.querySelector('.screen-results .results-hero').getBoundingClientRect();
  return {
    dts, dds, points: line ? line.getAttribute('points').split(' ').length : 0, visible: r.height > 0 && r.bottom <= innerHeight,
    clear: [menu, table, hero].every((o) => r.left >= o.right || r.right <= o.left || r.top >= o.bottom || r.bottom <= o.top),
    box: [r.left, r.top, r.right, r.bottom].map(Math.round),
  };
})()`;

async function shot(page, name) {
  if (!outDir) {
    return;
  }
  await mkdir(outDir, { recursive: true });
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(outDir, name), Buffer.from(data, 'base64'));
}

async function run(lang, track) {
  const t = TABLES[lang];
  console.log(`\n${lang}: three laps of the ring, then the debrief`);
  const page = await openPage({ root, width: 1280, height: 720, url: '/index.html', seed: seeds(lang, track) });
  try {
    await playRing(page, track);
    const G = await gatesOf(page);
    await page.sleep(1500);
    for (let lap = 0; lap < 3; lap += 1) {
      for (let k = 0; k < G.length; k += 1) {
        await through(page, G[k]);
      }
    }
    await through(page, G[0]);
    await page.until("window.__craftState().mode === 'results' && window.__ui.screen === 'results'", 30000).catch(async (e) => {
      console.log(await page.evaluate("JSON.stringify({ laps: window.__race().laps, log: window.__race().log, mode: window.__craftState().mode, screen: window.__ui.screen, want: window.__ui.settings.laps })"));
      throw e;
    });
    await page.sleep(700);
    const f = await page.evaluate(FACTS);
    say(Boolean(f) && f.visible, `the facts block is on screen`);
    say(Boolean(f) && f.clear, `the facts cover none of the hero, the laps or the menu: ${f && f.box}`);
    const want = ['debrief.air_time', 'debrief.distance', 'debrief.top', 'debrief.clean_laps', 'debrief.track_record', 'debrief.aircraft_time'].map((k) => t[k]);
    say(f && JSON.stringify(f.dts) === JSON.stringify(want), `its lines in order: ${f && f.dts.join(' | ')}`);
    say(f && f.dds[0] !== '0:00' && /^\d+:\d\d$/.test(f.dds[0]), `time in the air counted: ${f && f.dds[0]}`);
    say(f && f.dds[3] === t['debrief.n_of'].replace('{n}', '3').replace('{of}', '3'), `clean laps: ${f && f.dds[3]}`);
    say(f && f.points > 5, `the route is drawn from above: ${f && f.points} points`);
    await shot(page, `debrief-race-${lang}.png`);
    const reach = await page.evaluate(REACH('watchreplay'));
    say(reach === 'ok', `a real pointer reaches Watch the replay: ${reach}`);
    await page.click('[data-probe="watchreplay"]');
    await page.until('window.__crashCam.live()', 10000).catch(() => {});
    const open = await page.evaluate("({ live: window.__crashCam.live(), mode: window.__craftState().mode })");
    say(open.live && open.mode === 'replay', `the crash cam opens on this flight: ${JSON.stringify(open)}`);
    await page.sleep(800);
    await shot(page, `debrief-race-replay-${lang}.png`);
    await page.tap('Escape');
    await page.until('!window.__crashCam.live()', 10000).catch(() => {});
    await page.sleep(300);
    const back = await page.evaluate("({ live: window.__crashCam.live(), mode: window.__craftState().mode, screen: window.__ui.screen, facts: document.querySelectorAll('.results-facts dt').length })");
    say(!back.live && back.mode === 'results' && back.screen === 'results' && back.facts === want.length,
      `Escape comes back to the results with the facts: ${JSON.stringify(back)}`);
    const again = await page.evaluate(REACH('restart'));
    say(again === 'ok', `a real pointer reaches Fly again: ${again}`);
    await page.click('[data-probe="restart"]');
    await page.until("window.__ui.screen !== 'results'", 20000).catch(() => {});
    const flew = await page.evaluate("({ mode: window.__craftState().mode, screen: window.__ui.screen })");
    say(flew.screen !== 'results', `Fly again leaves the results: ${JSON.stringify(flew)}`);
    const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED|Failed to load resource|network:/.test(e));
    say(errs.length === 0, `no page errors${errs.length ? `: ${errs.slice(0, 3).join(' | ')}` : ''}`);
  } finally {
    await page.close();
  }
}

const track = JSON.parse(await readFile(join(root, 'tests/fixtures/map-track-v4.json'), 'utf8'));
try {
  await run('en', track);
  await run('es', track);
} catch (e) {
  failed += 1;
  console.log(`  FAIL  ${e.stack || e}`);
}
console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
