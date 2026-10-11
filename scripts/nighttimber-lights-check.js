/*
 * nighttimber-lights-check.js: the Night Timber X's factory lights come on
 * when the map is at night, in the real shell (docs/NIGHTTIMBER-STAGE1.md
 * section 5). No map is at night in normal play, so the night is forced
 * the way the game already allows it, the address's `?time=night` on
 * Itaipu, whose look writes scene.userData.timeOfDay. Four boots of the
 * shell with the Night Timber seated: day on auto (dark), night on auto
 * (lit), night switched off (dark), day switched on (lit). Each reads
 * window.__craft().factoryLights after the flight loop has run, and
 * leaves a picture of the aircraft parked in front of the camera.
 *
 *   node scripts/nighttimber-lights-check.js [outDir]
 *
 * Pictures are not committed (CLAUDE.md).
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
import { tmpdir } from 'node:os';
import { openPage } from '../tests/lib/page.js';
import { airframeById } from '../configs/airframes.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = process.argv[2] ?? join(tmpdir(), 'nighttimber-lights');
await mkdir(outDir, { recursive: true });
const AF = 'nighttimber1200';
const W = 1280;
const H = 720;

const CASES = [
  { name: 'day-auto', time: 'day', factory: null, lit: false },
  { name: 'night-auto', time: 'night', factory: null, lit: true },
  { name: 'night-off', time: 'night', factory: 'off', lit: false },
  { name: 'day-on', time: 'day', factory: 'on', lit: true },
];

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}  (${detail})`);
  if (!ok) failed += 1;
};

for (const c of CASES) {
  const seated = seatAirframe({ airframe: AF, rates: airframeById(AF).rates }, AF);
  const livery = c.factory ? { [AF]: { lights: { v: 2, factory: c.factory } } } : {};
  const seed = [`try {
      const k = ${JSON.stringify(SETTINGS_KEY)};
      const s = JSON.parse(localStorage.getItem(k) || '{}');
      Object.assign(s, ${JSON.stringify(seated)});
      s.airframeAsked = true;
      s.wingView = 'chase';
      s.livery = ${JSON.stringify(livery)};
      s.progress = { v: 1, xp: 0, courses: {}, challenges: {}, seen: {}, unlockAll: true };
      localStorage.setItem(k, JSON.stringify(s));
      localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
    } catch (e) { /* storage refused: the airframe check below says so */ }`];
  const page = await openPage({ root, width: W, height: H, url: `/index.html?map=itaipu${c.time === 'night' ? '&time=night' : ''}`, seed });
  try {
    await page.until('window.__map && window.__map().id === "itaipu" && window.__map().ready', 300000);
    await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
    await page.until("window.__craftState && window.__craftState().mode === 'flight' && window.__map().ready", 400000);
    try {
      await page.until('window.__craft && window.__craft().run === "nighttimber1200" && window.__craft().factoryLights !== null', 60000);
    } catch (e) {
      const c = await page.evaluate('JSON.stringify(window.__craft ? (({ setting, run, drawn, shown, factoryLights }) => ({ setting, run, drawn, shown, factoryLights }))(window.__craft()) : null)');
      throw new Error(`the Night Timber is not seated with its lights: ${c}`);
    }
    await page.sleep(1500);
    const f = await page.evaluate('JSON.stringify(window.__craft().factoryLights)');
    const lights = JSON.parse(f);
    check(`${c.name}: the world reads ${c.time}`, lights.night === (c.time === 'night'), f);
    check(`${c.name}: the factory lights are ${c.lit ? 'on' : 'off'}`, lights.visible === c.lit, f);
    /* The picture from where the flight's own camera puts it, the
     * interface hidden, the chase view so the aircraft is in it. */
    await page.evaluate('(document.getElementById("ui").style.display = "none", "")');
    await page.sleep(500);
    const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
    await writeFile(join(outDir, `nighttimber-${c.name}.png`), Buffer.from(data, 'base64'));
  } finally {
    await page.close();
  }
}
console.log(`\n${failed ? `${failed} FAILED` : 'all pass'}; pictures in ${outDir}`);
process.exit(failed ? 1 : 0);
