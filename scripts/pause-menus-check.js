/*
 * pause-menus-check.js: the Escape menu in the real shell, headless.
 *
 *     node scripts/pause-menus-check.js <outdir> [case ...]
 *
 * For a quad and a plane, in English and Spanish, and on a phone with
 * touch, it flies, presses Escape as a key (the touch case presses the
 * on screen pause button with a real tap), and writes what the pilot sees:
 * a picture and the rows, to <outdir>/<case>.png and <outdir>/rows.json.
 * Then it opens the Flight panel the way the pilot would (arrows and Enter,
 * or a tap on the row on the phone), pictures it, and backs out with
 * Escape twice: once to the pause menu, once into flight.
 *
 * It fails when Escape does not open the menu, when Resume is not the
 * first row with the cursor on it, when the first screen is longer than
 * docs/redesign/PAUSE-MENUS.md allows or has a group header, when a plane's
 * panel offers Betaflight rates, when Escape does not walk back, or on any
 * console error.
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
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = process.argv[2];
if (!outDir) {
  console.error('pause-menus-check: give an output folder');
  process.exit(1);
}

const CASES = [
  { id: 'quad-en', airframe: 'interceptor', lang: 'en' },
  { id: 'quad-es', airframe: 'interceptor', lang: 'es' },
  { id: 'plane-en', airframe: 'extra3d1308', lang: 'en' },
  { id: 'plane-es', airframe: 'extra3d1308', lang: 'es' },
  { id: 'phone-es', airframe: 'extra3d1308', lang: 'es', touch: true, width: 390, height: 844 },
];

let failed = 0;
let passed = 0;
function say(ok, what) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
}

function seed(c) {
  const s = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, c.airframe);
  s.map = 'alps';
  s.graphics = 'low';
  s.fpsCap = 0;
  s.airframeAsked = true;
  return [`try {
    const s = JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}) || '{}');
    Object.assign(s, ${JSON.stringify(s)});
    localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, JSON.stringify(s));
    localStorage.setItem('fdfpv.lang', ${JSON.stringify(c.lang)});
  } catch (e) { /* storage refused */ }`];
}

/* The rows the page shows for a screen, by their ids: a list nobody draws
 * is an empty box to the pilot whatever items() says. */
const drawn = (page, screen) => page.evaluate(`document.querySelectorAll('[data-row-id^="${screen}:"]').length`);

/* Resume, Restart, Flight, Change aircraft, Room, Settings, My tracks, Quit. */
const FIRST_SCREEN_MAX = 8;

/* A finger, not a mouse: touchStart and touchEnd, and the page makes the
 * click from them as a phone does. tests/lib/page.js click() is a mouse,
 * whose move repaints the menu's hover between press and release. */
async function fingerTap(page, selector) {
  const at = await page.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) { return null; }
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  })()`);
  if (!at) {
    return false;
  }
  await page.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] }, page.sessionId);
  await page.sleep(80);
  await page.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, page.sessionId);
  return true;
}

/* Down to the Flight row and Enter, as keys; on the phone, a tap on it. */
async function openPanel(page, c, rows) {
  const at = rows.findIndex((r) => r.action === 'quick');
  if (c.touch) {
    say(await fingerTap(page, `[data-row-id="${rows[at].id}"]`), 'tapped the Flight row with a finger');
    return;
  }
  for (let i = 0; i < at; i += 1) {
    await page.tap('ArrowDown');
    await page.sleep(60);
  }
  await page.tap('Enter');
}

const ROWS = `window.__ui.items().filter((it) => !it.bar).map((it) => ({
  id: it.id, label: it.label, value: it.value ?? null, section: Boolean(it.section), action: it.action ?? null,
}))`;

async function shoot(page, name) {
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
}

async function runCase(c, record) {
  console.log(`${c.id}:`);
  const page = await openPage({
    root, width: c.width || 1280, height: c.height || 720, touch: Boolean(c.touch), url: '/index.html', seed: seed(c),
  });
  try {
    await page.until('!!window.__shellReady', 300000);
    await page.until('window.__map && window.__map().ready', 400000);
    await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
    await page.until("window.__craftState && window.__craftState().mode === 'flight' && window.__map().ready", 400000);
    await page.sleep(800);
    if (c.touch) {
      await page.click('.touch-pause');
    } else {
      await page.tap('Escape');
    }
    const open = await page.until("window.__ui.screen === 'paused'", 5000).then(() => true, () => false);
    say(open, `${c.touch ? 'the pause button' : 'Escape'} opens the pause menu`);
    if (!open) {
      return;
    }
    await page.sleep(400);
    const rows = await page.evaluate(ROWS);
    const cursor = await page.evaluate('window.__ui.cursor');
    record[c.id] = { lang: c.lang, airframe: c.airframe, rows };
    say(rows[0] && rows[0].action === 'resume' && cursor === 0, `Resume is first and has the cursor (cursor ${cursor})`);
    say(await drawn(page, 'paused') === rows.length, 'every pause row is drawn on the page');
    say(rows.length <= FIRST_SCREEN_MAX && !rows.some((r) => r.section), `${rows.length} rows, no group header`);
    await shoot(page, c.id);
    await page.sleep(300);
    await openPanel(page, c, rows);
    const panel = await page.until("window.__ui.screen === 'quick'", 5000).then(() => true, () => false);
    say(panel, 'the Flight row opens the Flight panel');
    if (!panel) {
      return;
    }
    await page.sleep(300);
    const quick = await page.evaluate(ROWS);
    record[`${c.id}-flight`] = { lang: c.lang, airframe: c.airframe, rows: quick };
    const plane = c.airframe !== 'interceptor';
    say(await drawn(page, 'quick') === quick.filter((r) => !r.section).length, `every panel row is drawn on the page`);
    say(quick.some((r) => r.action === 'rates') === !plane, plane ? 'a plane has no Rates row' : 'a quad has its Rates row');
    await shoot(page, `${c.id}-flight`);
    await page.tap('Escape');
    say(await page.until("window.__ui.screen === 'paused'", 5000).then(() => true, () => false), 'Escape on the panel is the pause menu again');
    await page.tap('Escape');
    say(await page.until("window.__ui.screen === 'flight'", 5000).then(() => true, () => false), 'Escape on the pause menu resumes');
    const faults = page.errors.filter((e) => !e.startsWith('network:'));
    say(faults.length === 0, `no console error${faults.length ? `: ${faults[0]}` : ''}`);
  } finally {
    await page.close();
  }
}

await mkdir(outDir, { recursive: true });
const record = {};
const only = process.argv.slice(3);
for (const c of CASES.filter((k) => !only.length || only.includes(k.id))) {
  await runCase(c, record);
}
await writeFile(join(outDir, 'rows.json'), `${JSON.stringify(record, null, 1)}\n`);
console.log(`pause-menus-check: ${passed} passed, ${failed} failed; pictures in ${outDir}`);
process.exit(failed ? 1 : 0);
