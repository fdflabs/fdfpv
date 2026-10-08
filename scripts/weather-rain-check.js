/*
 * weather-rain-check.js: a gust front rains as it passes, and the rain is
 * gone where it is dry (src/render/rain.js, docs/WEATHER-CONTRACT.md).
 *
 *     node scripts/weather-rain-check.js [outdir]      (npm run check:weather-rain)
 *
 * The Fronts air with a known seed: the field, evaluated here in Node,
 * names a place inside a front and one outside every front; a fresh run
 * thrown at each shows the rain and does not. Calm never shows it. Pictures of both in
 * outdir when one is given. Exit 0 on a pass, 1 otherwise.
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
import { makeWeather } from '../src/game/weather.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outdir = process.argv[2] || null;
const SEED = 7;

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

const page = await openPage({ root, width: 960, height: 540, url: '/index.html', seed });
/* A fresh run thrown level at (x, y, 0), 60 frames on: the rain. */
const throwAt = async (x, y) => JSON.parse(await page.evaluate(`(async () => {
  window.__crashThrow({ fresh: true, x: ${x}, y: ${y}, z: 0, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0 });
  for (let i = 0; i < 60; i += 1) await new Promise((r) => requestAnimationFrame(r));
  return JSON.stringify(window.__rain());
})()`));
const shot = async (name) => {
  if (!outdir) {
    return;
  }
  await mkdir(outdir, { recursive: true });
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(outdir, name), Buffer.from(data, 'base64'));
};
try {
  await page.until('window.__shellReady && window.__map && window.__map().ready', 300000);
  const map = await page.evaluate('window.__map().id');
  const y = (await page.evaluate('window.__map().spawn.y')) + 150;
  const w = makeWeather(map, 'front', SEED);
  const o = {};
  let wet = null;
  let dry = null;
  for (let x = -2000; x <= 2000 && (wet === null || dry === null); x += 10) {
    w.at(x, y, 0, 1, o);
    if (wet === null && o.wet > 0.95) wet = x;
    if (dry === null && o.wet === 0) dry = x;
  }
  check('the field names a wet place and a dry one', wet !== null && dry !== null, `x ${wet} and ${dry} on ${map}`);
  const errors0 = page.errors.length;
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  const calm = await throwAt(dry, y);
  check('calm: no rain', calm.shown === false && calm.parent === true, JSON.stringify(calm));
  await page.evaluate(`window.__weather('front', ${SEED})`);
  const inFront = await throwAt(wet, y);
  await shot('rain-front.png');
  check('inside a front it rains', inFront.shown === true, JSON.stringify(inFront));
  check('and the rain says what it is in the thermal picture (sensor:check coverage)', inFront.thermal === true);
  const outside = await throwAt(dry, y);
  await shot('rain-dry.png');
  check('outside every front it does not', outside.shown === false, JSON.stringify(outside));
  const other = page.errors.slice(errors0).filter((e) => !/^network: .*ERR_CONNECTION_REFUSED/.test(e));
  check('the page logged nothing', other.length === 0, other.slice(0, 3).join(' | ').slice(0, 600));
} finally {
  await page.close();
}

console.log(failed === 0 ? 'PASS' : 'FAIL');
if (failed > 0) {
  process.exitCode = 1;
}
