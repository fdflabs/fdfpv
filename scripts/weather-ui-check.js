/*
 * weather-ui-check.js: the Weather row in the Freestyle screen, reached
 * with a real pointer, sets the air the next run flies
 * (docs/WEATHER-CONTRACT.md).
 *
 *     node scripts/weather-ui-check.js [outdir]      (npm run check:weather-ui)
 *
 * The row shows Calm lit on a new profile; a pointer click on Gusty lights
 * it and saves it; the run flies gusty, its plant reports wind; Calm again
 * flies still air. A picture of the row in outdir when one is given.
 * Exit 0 on a pass, 1 otherwise.
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
import { SETTINGS_KEY } from '../src/ui/ui.js';
import en from '../src/strings/en.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outdir = process.argv[2] || null;

const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, { graphics: 'low', graphicsAuto: false, sound: false, airframeAsked: true });
  localStorage.setItem(k, JSON.stringify(s));
  localStorage.setItem('webfpv.airhint.v2', '1');
} catch (e) { /* Storage refused; the run boots on its defaults. */ }`];

let failed = 0;
const check = (name, ok, detail) => {
  if (!ok) failed += 1;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

/* The Weather row's segment for a label: marked so a real pointer can
 * be sent at it, and whether it is lit. */
const mark = (label) => `(() => {
  for (const m of document.querySelectorAll('[data-wtest]')) m.removeAttribute('data-wtest');
  const group = document.querySelector('[role="group"][aria-label=' + JSON.stringify(${JSON.stringify(en['ui.weather'])}) + ']');
  if (!group) return null;
  const seg = [...group.querySelectorAll('.sw-seg')].find((b) => b.textContent.trim() === ${JSON.stringify(label)});
  if (!seg) return null;
  seg.setAttribute('data-wtest', '1');
  return seg.getAttribute('aria-pressed');
})()`;

const page = await openPage({ root, width: 1280, height: 720, url: '/index.html', seed });
try {
  await page.until('window.__shellReady && window.__map && window.__map().ready', 300000);
  const errors0 = page.errors.length;
  await page.evaluate("window.__ui.show('freestyle'); true");
  await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
  check('the Freestyle screen has a Weather row with Calm lit', (await page.evaluate(mark(en['weather.calm']))) === 'true');
  const found = await page.evaluate(mark(en['weather.gusty']));
  check('and a Gusty choice, not lit', found === 'false', String(found));
  check('Gusty is reached with a real pointer', await page.click('[data-wtest]'));
  await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
  check('Gusty is lit and saved', (await page.evaluate(mark(en['weather.gusty']))) === 'true'
    && (await page.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})).weather`)) === 'gusty');
  if (outdir) {
    await mkdir(outdir, { recursive: true });
    await page.evaluate(`document.querySelector('[data-wtest]').scrollIntoView({ block: 'center' }); true`);
    const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
    await writeFile(join(outdir, 'weather-row.png'), Buffer.from(data, 'base64'));
  }
  const fly = `(async () => {
    window.__crashThrow({ fresh: true, x: 0, y: 300, z: 0, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0 });
    for (let i = 0; i < 40; i += 1) await new Promise((r) => requestAnimationFrame(r));
    return JSON.stringify(window.__weatherFlown());
  })()`;
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  const flown = JSON.parse(await page.evaluate(fly));
  check('the run flies gusty', flown && flown.preset === 'gusty', JSON.stringify(flown));
  await page.evaluate("window.__ui.settings.weather = 'calm'; true");
  const calm = JSON.parse(await page.evaluate(fly));
  check('calm again flies still air', calm === null, JSON.stringify(calm));
  const other = page.errors.slice(errors0).filter((e) => !/^network: .*ERR_CONNECTION_REFUSED/.test(e));
  check('the page logged nothing', other.length === 0, other.slice(0, 3).join(' | ').slice(0, 600));
} finally {
  await page.close();
}

console.log(failed === 0 ? 'PASS' : 'FAIL');
if (failed > 0) {
  process.exitCode = 1;
}
