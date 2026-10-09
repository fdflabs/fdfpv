/*
 * pause-menus-check.js: the Escape menu in the real shell, headless.
 *
 *     node scripts/pause-menus-check.js <outdir>
 *
 * For a quad and a plane, in English and Spanish, and on a phone with
 * touch, it flies, presses Escape as a key (the touch case presses the
 * on screen pause button with a real tap), and writes what the pilot sees:
 * a picture and the rows, to <outdir>/<case>.png and <outdir>/rows.json.
 * It fails when Escape does not open the menu, when Resume is not the
 * first row with the cursor on it, or on any console error.
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

const ROWS = `window.__ui.items().filter((it) => !it.bar).map((it) => ({
  label: it.label, value: it.value ?? null, section: Boolean(it.section), action: it.action ?? null,
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
    await shoot(page, c.id);
    const faults = page.errors.filter((e) => !e.startsWith('network:'));
    say(faults.length === 0, `no console error${faults.length ? `: ${faults[0]}` : ''}`);
  } finally {
    await page.close();
  }
}

await mkdir(outDir, { recursive: true });
const record = {};
for (const c of CASES) {
  await runCase(c, record);
}
await writeFile(join(outDir, 'rows.json'), `${JSON.stringify(record, null, 1)}\n`);
console.log(`pause-menus-check: ${passed} passed, ${failed} failed; pictures in ${outDir}`);
process.exit(failed ? 1 : 0);
