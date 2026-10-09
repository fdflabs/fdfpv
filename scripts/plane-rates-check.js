/*
 * plane-rates-check.js: a plane's Rates row is the plane's own rates,
 * driven through the real shell with a real pointer and keys:
 *   npm run planerates:check -- [outdir]   (build/plane-rates-check)
 * The Timber flies on the Swiss valley; Escape pauses it. The pause
 * menu's Flight panel's Rates row reads the Timber's high rate throws (configs/tuning.js),
 * not the quad's Actual 670, and opens the plane's Rates screen. Two
 * presses left on its Rate row pick the manual's low rate, and the plant
 * flies those throws at once, in the paused run (sim_wing_tune). One press
 * left on the aileron expo takes 30 percent to 20, which the plant flies
 * too. Escape returns to the Flight panel. No page error. Pictures in outdir.
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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/settings.js';
import { throwsFor } from '../configs/tuning.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = process.argv[2] || join(root, 'build', 'plane-rates-check');
const AF = 'timber1500';
const DEG = 180 / Math.PI;

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

async function shot(page, name) {
  await mkdir(outDir, { recursive: true });
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
}

async function click(page, selector) {
  if (!(await page.click(selector))) {
    throw new Error(`nothing to click at ${selector}`);
  }
}

/* The plant's throws in force, degrees, aileron elevator rudder, and its
 * aileron expo (SIM_TUNE_* in src/native/sim_abi.h). */
const plant = (page) => page.evaluate(`(() => {
  const t = window.__craft().tune;
  return t && { throws: [t[3], t[4], t[5]].map((r) => Math.round(r * ${DEG} * 10) / 10), expoA: t[6], mode: window.__craftState().mode };
})()`);
const near = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 0.05);
const round = (a) => a.map((x) => Math.round(x * 10) / 10);

const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, { map: 'swiss2', graphics: 'low', graphicsAuto: false, airframeAsked: true, airframe: '${AF}', tune: 'timber-manual' });
  localStorage.setItem(k, JSON.stringify(s));
  localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
  localStorage.setItem('webfpv.airhint.v2', '1');
} catch (e) { /* storage refused */ }`];

const page = await openPage({ root, width: 1280, height: 720, url: '/index.html?dev=1', seed });
try {
  await page.until('!!window.__shellReady', 300000);
  await page.until("window.__map && window.__map().ready && window.__map().id === 'swiss2'", 400000);
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  await page.sleep(1000);
  await page.tap('Escape');
  await page.until("window.__ui.screen === 'paused'", 10000).catch(() => {});
  /* The pause menu's Flight panel carries the Rates row. */
  const flight = await page.evaluate("(() => { const it = window.__ui.items().find((i) => i.action === 'quick'); return it ? it.id : null; })()");
  await click(page, `[data-row-id="${flight}"] .row-label`);
  await page.until("window.__ui.screen === 'quick'", 10000).catch(() => {});
  const row = await page.evaluate("(() => { const it = window.__ui.items().find((i) => i.label === 'Rates'); return it ? { action: it.action, value: it.value, id: it.id } : null; })()");
  const high = round(throwsFor(AF, 'high'));
  check('the pause menu\'s Flight panel Rates row is the Timber\'s high rate, not the quad\'s Actual 670',
    row && row.action === 'planerates' && row.value === `High, ${high.map((d) => `${d}°`).join(' ')}` && !/670/.test(row.value), JSON.stringify(row));
  await shot(page, 'paused');
  const before = await plant(page);
  await click(page, `[data-row-id="${row.id}"] .row-label`);
  await page.until("window.__ui.screen === 'planerates'", 10000).catch(() => {});
  check('a click on it opens the plane\'s Rates screen', (await page.evaluate('window.__ui.screen')) === 'planerates');
  await shot(page, 'planerates');
  await click(page, '[data-row-id^="planerates:"] .row-label');
  await page.tap('ArrowLeft');
  await page.sleep(200);
  await page.tap('ArrowLeft');
  await page.sleep(500);
  const low = round(throwsFor(AF, 'low'));
  const after = await plant(page);
  const stored = await page.evaluate(`window.__ui.settings.tuning[${JSON.stringify(AF)}]`);
  check('two presses left pick the manual\'s low rate, stored as the hangar stores it', stored && stored.rate === 'low', JSON.stringify(stored));
  check('and the plant flies the low throws at once, still in the paused run', after && near(after.throws, low) && after.mode === before.mode && before && near(before.throws.length ? before.throws : high, high),
    `${JSON.stringify(before)} -> ${JSON.stringify(after)}, low ${low}`);
  const rows = await page.evaluate("window.__ui.items().map((i) => i.id)");
  const expoRow = rows.find((id) => /expo/.test(id) && /aileron/i.test(id));
  await click(page, `[data-row-id="${expoRow}"] .row-label`);
  await page.tap('ArrowLeft');
  await page.sleep(500);
  const expo = await plant(page);
  check('one press left on the aileron expo takes it from 30 to 20 percent in the plant', expo && Math.abs(expo.expoA - 0.2) < 1e-9, `${expoRow}: ${JSON.stringify(expo)}`);
  await shot(page, 'low');
  await page.tap('Escape');
  await page.until("window.__ui.screen === 'quick'", 10000).catch(() => {});
  check('Escape goes back to the Flight panel it came from', (await page.evaluate('window.__ui.screen')) === 'quick');
} catch (e) {
  check('the run finished', false, e.stack || String(e));
}
const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e));
check(`no page error (plus ${page.errors.length - errs.length} refused connections to an absent local board)`, errs.length === 0, errs.slice(0, 3).join(' | '));
await page.close();
console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
