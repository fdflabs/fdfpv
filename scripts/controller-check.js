/*
 * controller-check.js: the new pilot's controller question and the
 * Controller screen in the real shell, headless Chromium through
 * tests/lib/page.js, every answer pressed with the pointer or a key the
 * way a pilot sends it. Run with npm run controller:check (local).
 *
 *  1. A first visit with nothing plugged in opens on "What will you fly
 *     with?", not the title: radio, gamepad, keyboard and mouse, skip
 *     (touch only on a touch screen), the cursor on keyboard and mouse.
 *  2. A standard pad plugged in lights A gamepad, live. Choosing it opens
 *     How to fly on the radio or gamepad tab; Back is the title, and a
 *     reload is the title: never asked again.
 *  3. A first visit with an EdgeTX radio plugged in lights A radio;
 *     choosing it opens the calibration wizard, and Escape out of the
 *     wizard is the title.
 *  4. Escape on the question skips it, and the skip is kept.
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
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}${detail ? `  (${detail})` : ''}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

const buttons = (n) => Array.from({ length: n }, () => ({ pressed: false, touched: false, value: 0 }));
const PADS = {
  gamepad: {
    index: 0, id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
    connected: true, mapping: 'standard', timestamp: 1, axes: [0, 0, 0, 0], buttons: buttons(17),
  },
  /* EdgeTX in USB joystick mode (src/input/padprofiles.js): AETR with the
   * throttle parked low, as a radio rests. */
  radio: {
    index: 0, id: 'RadioMaster Pocket Joystick (Vendor: 1209 Product: 4f54)',
    connected: true, mapping: '', timestamp: 1, axes: [0, 0, -1, 0, 0, 0, 0, 0], buttons: buttons(24),
  },
};

/* The pads a document starts with come from sessionStorage, so a reload
 * can begin with a radio already plugged in, as a pilot's boot does. */
const SEED = `window.__pads = (() => {
  try { return JSON.parse(sessionStorage.getItem('cc.pads') || '[]'); } catch (e) { return []; }
})();
navigator.getGamepads = () => window.__pads;`;

const page = await openPage({ root, width: 1280, height: 720, url: '/index.html', seed: [SEED], account: null, askFlyWith: true });

/* A first visit again: every trace of this one gone, these pads plugged. */
async function firstVisit(pads) {
  await page.evaluate(`(() => {
    localStorage.clear();
    sessionStorage.setItem('cc.pads', ${JSON.stringify(JSON.stringify(pads))});
    window.__beforeReload = true;
    return true;
  })()`);
  await page.cdp.send('Page.navigate', { url: `${page.origin}/index.html` }, page.sessionId);
  await page.until('window.__beforeReload !== true && !!window.__shellReady', 300000);
}

async function reload() {
  await page.evaluate('(() => { window.__beforeReload = true; return true; })()');
  await page.cdp.send('Page.navigate', { url: `${page.origin}/index.html` }, page.sessionId);
  await page.until('window.__beforeReload !== true && !!window.__shellReady', 300000);
}

async function clickRow(match) {
  const id = await page.evaluate(`(window.__ui.items().find((it) => ${match}) || {}).id || null`);
  return id ? page.click(`[data-row-id="${id}"]`) : false;
}

/* A picker the roster queued on a plugged pad answers first; skipping it
 * hands the screen back to what it opened over. */
async function settle() {
  await page.sleep(500);
  if (await page.evaluate("window.__ui.screen === 'padpick'")) {
    await page.evaluate("window.__ui.act('padpick-skip'); true");
    await page.until("window.__ui.screen !== 'padpick'", 5000);
  }
}

const rowsNow = () => page.evaluate("JSON.stringify(window.__ui.items().map((it) => [it.action, it.value || '']))");
const cursorAction = () => page.evaluate('(window.__ui.items()[window.__ui.cursor] || {}).action || null');
const answer = () => page.evaluate("localStorage.getItem('fdfpv.flywith.v1')");

try {
  await page.until('!!window.__shellReady', 300000);

  console.log('1. the question, nothing plugged in');
  check('a first visit opens on the question', await page.evaluate("window.__ui.screen === 'flywith'"), await page.evaluate('window.__ui.screen'));
  const rows = JSON.parse(await rowsNow());
  check('four answers, no touch on a desktop', JSON.stringify(rows.map((r) => r[0])) === JSON.stringify(['flywith:radio', 'flywith:gamepad', 'flywith:keys', 'flywith:skip']), JSON.stringify(rows));
  check('the cursor is on keyboard and mouse', (await cursorAction()) === 'flywith:keys');
  check('nothing says plugged in', rows.every((r) => r[1] === ''));

  console.log('2. a gamepad');
  await page.evaluate(`window.__pads.push(${JSON.stringify(PADS.gamepad)}); true`);
  await page.until("window.__ui.padInfo.device === 'gamepad'", 10000);
  await settle();
  check('back on the question after the picker', await page.evaluate("window.__ui.screen === 'flywith'"), await page.evaluate('window.__ui.screen'));
  const lit = JSON.parse(await rowsNow()).find((r) => r[0] === 'flywith:gamepad');
  check('A gamepad says plugged in', lit && lit[1] === 'Plugged in', JSON.stringify(lit));
  check('A gamepad is clicked', await clickRow("it.action === 'flywith:gamepad'"));
  await page.until("window.__ui.screen === 'howto'", 5000);
  check('How to fly opens on the radio or gamepad tab', await page.evaluate("window.__ui.howtoSource === 'radio'"));
  check('the answer is kept', (await answer()) === 'gamepad');
  await page.tap('Escape');
  await page.until("window.__ui.screen !== 'howto'", 5000);
  check('Back is the title', await page.evaluate("window.__ui.screen === 'title'"), await page.evaluate('window.__ui.screen'));
  await reload();
  await settle();
  check('a reload is the title: never asked again', await page.evaluate("window.__ui.screen === 'title'"), await page.evaluate('window.__ui.screen'));

  console.log('3. a radio');
  await firstVisit([PADS.radio]);
  await settle();
  check('the question again on a first visit', await page.evaluate("window.__ui.screen === 'flywith'"), await page.evaluate('window.__ui.screen'));
  const radio = JSON.parse(await rowsNow()).find((r) => r[0] === 'flywith:radio');
  check('A radio says plugged in', radio && radio[1] === 'Plugged in', JSON.stringify(radio));
  const onRadio = await cursorAction();
  check('and the cursor is on it', onRadio === 'flywith:radio', `${onRadio}, cursor ${await page.evaluate('window.__ui.cursor')}`);
  await page.tap('Enter');
  await page.until("window.__ui.screen === 'calibrate'", 5000);
  check('Enter opens the calibration wizard', true);
  check('the answer is kept', (await answer()) === 'radio');
  await page.tap('Escape');
  await page.until("window.__ui.screen !== 'calibrate'", 5000);
  check('Escape out of the wizard is the title', await page.evaluate("window.__ui.screen === 'title'"), await page.evaluate('window.__ui.screen'));

  console.log('4. skipped');
  await firstVisit([]);
  check('the question again', await page.evaluate("window.__ui.screen === 'flywith'"));
  await page.tap('Escape');
  await page.until("window.__ui.screen !== 'flywith'", 5000);
  check('Escape skips to the title', await page.evaluate("window.__ui.screen === 'title'"), await page.evaluate('window.__ui.screen'));
  check('the skip is kept', (await answer()) === 'skip');

  const errs = page.errors.filter((e) => !e.startsWith('network:'));
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) {
  failed += 1;
  console.log(`  FAIL  ${e.message}`);
  console.log(`  note  page errors: ${page.errors.slice(0, 5).join(' | ')}`);
} finally {
  await page.close();
}

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
