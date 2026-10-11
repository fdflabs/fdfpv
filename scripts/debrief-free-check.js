/*
 * debrief-free-check.js: a freestyle run's debrief (docs/DEBRIEF.md), in
 * the real page, on the Free Flight card's plane.
 *
 *     node scripts/debrief-free-check.js [--out=<dir>]
 *
 * Free Flight, scored, on the card's own plane: the run is flown for a few
 * seconds and ended with the horn (window.__scoreFinish). The rows check
 * the facts (time in the air, crashes, the landing line a plane adds, this
 * aircraft's total), that Watch the replay is reached by a real pointer,
 * opens the crash cam and comes back, and that the board's answer to a
 * posted run becomes the record line. In English and Spanish.
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

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { frames } from '../tests/lib/buildkeys.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';
import { LANG_KEY } from '../src/strings/index.js';
import en from '../src/strings/en.js';
import es from '../src/strings/es.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outArg = process.argv.slice(2).find((a) => a.startsWith('--out='));
const outDir = outArg ? outArg.slice('--out='.length) : null;
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

function seeds(lang) {
  const settings = {
    airframeAsked: true,
    freestyleScoring: 'scored',
    graphics: 'low',
    graphicsAuto: false,
    sound: false,
    fpsCap: 0,
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

async function playFree(page) {
  await page.until('!!window.__shellReady', 300000);
  await page.until('window.__map && window.__map().ready', 400000);
  await page.until('window.__ui.onGate()', 60000);
  await choose(page, 'way-freestyle-wing1000');
  await page.until('window.__ui.carousel.isOpen', 10000);
  await page.tap('Enter');
  /* The card's plane seated, the title offers Fly. */
  await page.until("window.__ui.screen === 'title' && window.__ui.items().some((it) => it.action === 'fly')", 20000);
  await choose(page, 'fly');
  await page.until("['launch', 'flight'].includes(window.__ui.screen) && window.__map().ready", 120000).catch(async (e) => {
    console.log(await page.evaluate("JSON.stringify({ screen: window.__ui.screen, hub: window.__ui.hub, items: window.__ui.items().map((it) => it.action || it.label).slice(0, 12) })"));
    throw e;
  });
  if (await page.evaluate("window.__ui.screen === 'launch'")) {
    await choose(page, 'launch-go');
  }
  await page.until("window.__craftState().mode === 'flight' && window.__ui.screen === 'flight'", 120000);
  await frames(page, 10);
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

async function run(lang) {
  const t = TABLES[lang];
  console.log(`\n${lang}: Free Flight, scored, on the card's plane, then the debrief`);
  const page = await openPage({ root, width: 1280, height: 720, url: '/index.html', seed: seeds(lang) });
  try {
    await playFree(page);
    await page.sleep(4000);
    const plane = await page.evaluate('window.__ui.settings.airframe');
    await page.evaluate('window.__scoreFinish()');
    await page.until("window.__craftState().mode === 'results' && window.__ui.screen === 'results'", 30000);
    await page.sleep(700);
    const f = await page.evaluate(FACTS);
    say(Boolean(f) && f.visible, `the facts block is on screen (${plane})`);
    say(Boolean(f) && f.clear, `the facts cover none of the hero, the table or the menu: ${f && f.box}`);
    const has = (k) => f && f.dts.includes(t[k]);
    say(has('debrief.air_time') && has('debrief.crashes') && has('debrief.landing') && has('debrief.aircraft_time'),
      `its lines: ${f && f.dts.join(' | ')}`);
    const landing = f && f.dds[f.dts.indexOf(t['debrief.landing'])];
    say([t['debrief.landed'], t['debrief.not_landed']].includes(landing), `a plane says whether it landed: ${landing}`);
    await shot(page, `debrief-free-${lang}.png`);
    const replayRow = await page.evaluate("JSON.stringify(window.__ui.items().find((it) => it.action === 'watchreplay') || null)");
    const row = JSON.parse(replayRow);
    say(Boolean(row), `the menu has Watch the replay: ${replayRow}`);
    if (row && !row.disabled) {
      const reach = await page.evaluate(REACH('watchreplay'));
      say(reach === 'ok', `a real pointer reaches it: ${reach}`);
      await page.click('[data-probe="watchreplay"]');
      await page.until('window.__crashCam.live()', 10000).catch(() => {});
      say(await page.evaluate('window.__crashCam.live()'), 'the crash cam opens');
      await page.tap('Escape');
      await page.until('!window.__crashCam.live()', 10000).catch(() => {});
      await page.sleep(300);
      const back = await page.evaluate("({ mode: window.__craftState().mode, screen: window.__ui.screen })");
      say(back.mode === 'results' && back.screen === 'results', `Escape comes back to the results: ${JSON.stringify(back)}`);
    } else {
      say(row && row.note === t['debrief.replay_short'], `greyed with its reason: ${row && row.note}`);
    }
    /* The board's answer, as submitFreestyleRun hands it on. */
    await page.evaluate('(window.__ui.markRunPosted({ ok: true, score: 120, improved: false }), true)');
    const g = await page.evaluate(FACTS);
    const at = g.dts.indexOf(t['debrief.run_best']);
    say(at >= 0 && g.dds[at] === t['debrief.record_stands'].replace('{before}', '120'), `the board's answer is the record line: ${g.dds[at]}`);
    const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED|Failed to load resource|network:/.test(e));
    say(errs.length === 0, `no page errors${errs.length ? `: ${errs.slice(0, 3).join(' | ')}` : ''}`);
  } finally {
    await page.close();
  }
}

try {
  await run('en');
  await run('es');
} catch (e) {
  failed += 1;
  console.log(`  FAIL  ${e.stack || e}`);
}
console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
