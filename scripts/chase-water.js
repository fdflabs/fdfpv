/*
 * chase-water.js: the chase camera behind an aircraft on floats, afloat
 * on the Alps' lake in its waves, held steady rather than riding every
 * wave with the plane.
 *
 *   node scripts/chase-water.js [cub1400f|timber1500f]
 *
 * Samples the camera's height and pitch and the plane's height once a
 * frame while it sits afloat, then while it taxis, and fails if the
 * camera moves more than a third as much as the plane does: the waves
 * should pass under a steady picture, not heave the picture.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const airframe = process.argv[2] ?? 'cub1400f';

const seated = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, airframe);
seated.map = 'alps';
seated.graphics = 'low';
seated.wingView = 'chase';

/* Once a frame: the camera's height and pitch, the plane's height. */
const SAMPLE = `
window.__chaseLog = [];
(() => {
  const tick = () => {
    const c = window.__camGround();
    const [x, y, z, w] = c.quat;
    const pitch = Math.asin(Math.max(-1, Math.min(1, 2 * (w * x - y * z)))) * 180 / Math.PI;
    window.__chaseLog.push([c.y, pitch, window.__craftState().worldY]);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();
`;

const page = await openPage({
  root,
  width: 480,
  height: 300,
  url: '/index.html',
  seed: [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(seated)});
    s.airframeAsked = true;
    localStorage.setItem(k, JSON.stringify(s));
  } catch (e) { /* storage refused */ }`],
});
let failed = 0;
const spread = (a) => Math.max(...a) - Math.min(...a);
async function phase(name, seconds) {
  await page.evaluate('window.__chaseLog.length = 0; true');
  await page.sleep(seconds * 1000);
  const log = await page.evaluate('window.__chaseLog.slice(10)');
  const cam = spread(log.map((s) => s[0]));
  const pitch = spread(log.map((s) => s[1]));
  const craft = spread(log.map((s) => s[2]));
  const ok = log.length > 20 && cam < craft / 3 && pitch < 1.5;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}: plane heaves ${craft.toFixed(3)} m, camera ${cam.toFixed(3)} m and pitches ${pitch.toFixed(2)} deg, ${log.length} frames`);
  if (!ok) {
    failed += 1;
  }
}
try {
  await page.until('!!window.__shellReady', 240000);
  await page.until('window.__map && window.__map().ready', 240000);
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight'", 120000);
  await page.sleep(3000);
  await page.evaluate(SAMPLE);
  await phase('afloat', 12);
  await page.evaluate('window.__stick(0, 0, 0, 0.35); true');
  await phase('taxiing', 12);
} finally {
  await page.close();
}
console.log(failed ? `${failed} failed` : 'all hold');
process.exit(failed ? 1 : 0);
