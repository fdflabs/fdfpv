/*
 * keybinds-check.js: Settings > Controls in the real shell, headless
 * Chromium through tests/lib/page.js, every press with the pointer or a
 * key the way a keyboard sends it. Run with npm run keybinds:check
 * (local; SIM_GPU=1 for the GPU).
 *
 *  1. Settings, Controls, the Reset row: N binds it. In flight N resets
 *     the run (the lap clock goes back) and R no longer does.
 *  2. The Unstick row pressed with N is refused, naming Reset.
 *  3. Keys for: this aircraft (the Timber); Reset on 3 for it alone. On
 *     the Timber 3 resets; swapped to the Cub, 3 does nothing and N resets.
 *  4. Reset all: R resets again and the profile holds no bindings.
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

/* The seat: the Timber, so a per aircraft binding has an aircraft to
 * belong to and the Cub to be absent on. */
const SEED = `try {
  const k = 'webfpv.settings.v3';
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  if (!s.airframeAsked) {
    Object.assign(s, { airframe: 'timber1500', airframeAsked: true });
    localStorage.setItem(k, JSON.stringify(s));
  }
} catch (e) { /* storage refused */ }`;

const page = await openPage({ root, width: 1280, height: 720, url: '/index.html', seed: [SEED], account: null });

async function rowId(match) {
  return page.evaluate(`(window.__ui.items().find((it) => ${match}) || {}).id || null`);
}

async function clickRow(match, inner = '') {
  const id = await rowId(match);
  if (!id) {
    return false;
  }
  return page.click(`[data-row-id="${id}"]${inner}`);
}

async function openControls() {
  await page.evaluate("window.__ui.show('pilot'); true");
  await page.until("window.__ui.screen === 'pilot'", 10000);
  check('Settings has a Controls row, pressed with the pointer', await clickRow("it.action === 'controls'"));
  await page.until("window.__ui.screen === 'controls'", 10000);
}

/* Binds the row of action `id` to the key `code`; returns the refusal
 * the screen shows, or null. */
async function bindRow(id, code) {
  await clickRow(`it.action === 'keybind:${id}'`);
  await page.until(`window.__ui.binding === '${id}'`, 5000);
  await page.tap(code);
  await page.until('!window.__ui.binding', 5000);
  return page.evaluate('window.__ui.keybindMsg || null');
}

async function fly() {
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight' && window.__map().ready && window.__ui.screen === 'flight'", 400000);
}

/* Whether pressing `code` in flight resets the run: the lap clock is let
 * run past two seconds, then must be back under one. */
async function resets(code) {
  await page.until('window.__traffic().lap > 2500', 60000);
  await page.tap(code);
  await page.sleep(400);
  const lap = await page.evaluate('window.__traffic().lap');
  return { yes: lap < 1500, lap };
}

async function leaveFlight() {
  await page.tap('Escape');
  await page.until("window.__ui.screen === 'paused'", 10000);
}

try {
  await page.until('!!window.__shellReady', 300000);
  await page.until('window.__map && window.__map().ready', 400000);
  await page.loaded(60000);

  console.log('1. Reset on N, for every aircraft');
  await openControls();
  check('binding Reset to N is taken', (await bindRow('reset', 'KeyN')) === null);
  check('the row says N', await page.evaluate("window.__ui.items().find((it) => it.action === 'keybind:reset').value === 'N'"));
  check('the profile holds it', await page.evaluate("JSON.parse(localStorage.getItem('webfpv.settings.v3')).keybinds.all.reset === 'KeyN'"));
  await fly();
  let r = await resets('KeyN');
  check('in flight N resets the run', r.yes, `lap ${r.lap} ms after`);
  r = await resets('KeyR');
  check('and R no longer does', !r.yes, `lap ${r.lap} ms after`);
  await leaveFlight();

  console.log('2. a clash is refused');
  await openControls();
  const msg = await bindRow('unstick', 'KeyN');
  check('Unstick on N is refused, naming Reset', Boolean(msg) && /Reset/.test(msg), msg);
  check('Unstick keeps X', await page.evaluate("window.__ui.items().find((it) => it.action === 'keybind:unstick').value === 'X'"));

  console.log('3. a binding for this aircraft only');
  check('Keys for opens with the pointer', await clickRow("it.label === 'Keys for'", ' .drop-btn'));
  await page.until('!!window.__ui.dropEl', 5000);
  check('and this aircraft is chosen', await page.click('.drop-list .drop-opt:nth-child(2)'));
  await page.until("window.__ui.keysScope === 'aircraft'", 5000);
  check('Reset on 3 for the Timber is taken', (await bindRow('reset', 'Digit3')) === null);
  check('the profile holds it under the Timber', await page.evaluate("JSON.parse(localStorage.getItem('webfpv.settings.v3')).keybinds.by.timber1500.reset === 'Digit3'"));
  await fly();
  r = await resets('Digit3');
  check('on the Timber 3 resets', r.yes, `lap ${r.lap} ms after`);
  await page.evaluate("window.__ui.swapTo('cub1400'); true");
  await page.until("window.__craft().run === 'cub1400' && window.__craftState().mode === 'flight'", 60000);
  r = await resets('Digit3');
  check('on the Cub 3 does nothing', !r.yes, `lap ${r.lap} ms after`);
  r = await resets('KeyN');
  check('and N resets, the every-aircraft key', r.yes, `lap ${r.lap} ms after`);
  await leaveFlight();

  console.log('4. reset all');
  await openControls();
  check('Reset all is pressed with the pointer', await clickRow("it.action === 'keybind:*'"));
  await page.sleep(300);
  check('the profile holds no bindings', await page.evaluate("JSON.parse(localStorage.getItem('webfpv.settings.v3')).keybinds === undefined"));
  await fly();
  r = await resets('KeyR');
  check('R resets again', r.yes, `lap ${r.lap} ms after`);
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
