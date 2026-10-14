/*
 * uiscale-check.js: the menus at 130 percent (Settings > Screen > Menu
 * size), in the real shell in headless Chromium at 1280 by 720.
 *
 *  1. Seeded at 130: every screen carries zoom 1.3 and a row stands 1.3
 *     times as tall as at 100.
 *  2. Settings, the aircraft page and Controls: nothing runs off the side
 *     (no horizontal overflow on the page or on the screen).
 *  3. The pointer still lands where it is drawn: Controls opened with a
 *     click, the Reset row armed with a click, a key binds it.
 *
 *   npm run uiscale:check      (local)
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

const root = dirname(dirname(fileURLToPath(import.meta.url)));

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

const SEED = `try {
  const k = 'webfpv.settings.v3';
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  if (!s.uiScaleSeeded) {
    Object.assign(s, { uiScale: 130, uiScaleSeeded: true, airframeAsked: true });
    localStorage.setItem(k, JSON.stringify(s));
  }
} catch (e) { /* storage refused */ }`;

const page = await openPage({ root, width: 1280, height: 720, url: '/index.html', seed: [SEED], account: null });

async function clickRow(match) {
  const id = await page.evaluate(`(window.__ui.items().find((it) => ${match}) || {}).id || null`);
  return id ? page.click(`[data-row-id="${id}"]`) : false;
}

/* The page and the open screen, widths in CSS px. */
const OVERFLOW = `(() => {
  const s = window.__ui.screens[window.__ui.screen];
  return JSON.stringify({ screen: window.__ui.screen, doc: document.documentElement.scrollWidth, win: window.innerWidth,
    sw: s ? s.scrollWidth : -1, cw: s ? s.clientWidth : -1 });
})()`;
async function fits(name) {
  const o = JSON.parse(await page.evaluate(OVERFLOW));
  check(`${name}: nothing runs off the side`, o.doc <= o.win && o.sw <= o.cw + 1, JSON.stringify(o));
}

try {
  await page.until('!!window.__shellReady', 300000);
  await page.loaded(60000);

  console.log('1. the scale');
  await page.evaluate("window.__ui.show('pilot'); true");
  await page.until("window.__ui.screen === 'pilot'", 10000);
  const z = await page.evaluate("JSON.stringify({ setting: window.__ui.settings.uiScale, zoom: getComputedStyle(window.__ui.screens.pilot).zoom })");
  check('the setting reads 130 and the screen carries zoom 1.3', z === JSON.stringify({ setting: 130, zoom: '1.3' }), z);
  const ROW = "document.querySelector('.screen-pilot [data-row-id]').getBoundingClientRect().height";
  const at130 = await page.evaluate(ROW);
  await page.evaluate("document.documentElement.style.setProperty('--ui-scale', '1'); true");
  const at100 = await page.evaluate(ROW);
  await page.evaluate("document.documentElement.style.setProperty('--ui-scale', '1.3'); true");
  check('a row stands 1.3 times as tall as at 100', Math.abs(at130 / at100 - 1.3) < 0.02, `${at100} px -> ${at130} px`);

  console.log('2. the pages fit');
  await fits('Settings');
  await page.evaluate("window.__ui.show('quad'); true");
  await page.until("window.__ui.screen === 'quad'", 10000);
  await fits('the aircraft page');

  console.log('3. the pointer');
  await page.evaluate("window.__ui.show('pilot'); true");
  await page.until("window.__ui.screen === 'pilot'", 10000);
  check('Controls is opened with a click', await clickRow("it.action === 'controls'"));
  check('and opens', await page.until("window.__ui.screen === 'controls'", 5000).then(() => true, () => false));
  await fits('Controls');
  check('the Reset row is armed with a click', await clickRow("it.action === 'keybind:reset'"));
  check('and armed', await page.until("window.__ui.binding === 'reset'", 5000).then(() => true, () => false));
  await page.tap('Digit7');
  const bound = await page.evaluate("window.__ui.items().find((it) => it.action === 'keybind:reset').value");
  check('7 binds it', bound === '7', bound);
  const errs = page.errors.filter((e) => !e.startsWith('network:'));
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) {
  failed += 1;
  console.log(`  FAIL  ${e.message}`);
} finally {
  await page.close();
}

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
