/*
 * paint-workshop-check.js: the hangar's workshop (docs/redesign/
 * WORKSHOP-PAINT.md), in the real shell, headless.
 *
 *   1. One aircraft of every paint family: the Top and Bottom views
 *      pressed with a real pointer, Bottom rolling the model over on its
 *      stand (Flip), a picture kept of each; V rolls it back upright.
 *   2. The Flip button; the views by keys 3 to 6 keep the plane flipped,
 *      1 (Top) stands it up, a view pressed again lets go; a pad's R3
 *      flips it.
 *   3. Flipped and closed, the hangar opens again upright, and the picker
 *      behind it draws the model upright.
 *
 * The pictures go to the directory given as the first argument.
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
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';
import { AIRFRAMES } from '../configs/airframes.js';
import { liveryKey, paintable } from '../configs/liveries.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = resolve(process.argv[2] || join(root, 'tmp', 'paint-workshop-check'));
await mkdir(outDir, { recursive: true });

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

/* One aircraft per paint family: a float version wears its land plane's
 * livery, so it is the same paint. */
const FAMILIES = AIRFRAMES.map((a) => a.id).filter((id, i, all) => paintable(id) && all.findIndex((o) => liveryKey(o) === liveryKey(id)) === i);

const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, {
    airframeAsked: true, fpsCap: 0, graphics: 'low',
    progress: { v: 1, xp: 0, courses: {}, challenges: {}, seen: {}, unlockAll: true },
  });
  localStorage.setItem(k, JSON.stringify(s));
} catch (e) { /* storage refused; the checks below will say so */ }`];

async function shot(page, name) {
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
}

const cam = (page) => page.evaluate('window.__carouselStats().camera');
/* The roll landed on `to` and the springs still. A headless page draws few
 * frames a second, so this waits on the rig's own numbers. */
const ROLLED = (to) => `(() => { const c = window.__carouselStats().camera; return Boolean(c) && Math.abs(c.roll - ${to}) < 0.01; })()`;

async function openHangar(page, id) {
  await page.evaluate('window.__ui.openCraftRow(false); true');
  await page.until('window.__ui.carousel.isOpen', 10000);
  await page.evaluate(`window.__ui.carousel.setFilter('all'); window.__ui.carousel.goTo(window.__ui.carousel.ids.indexOf(${JSON.stringify(id)})); true`);
  await page.tap('KeyC');
  await page.until('window.__ui.hangar.isOpen', 10000);
  await page.until(`window.__ui.hangar.id === ${JSON.stringify(id)}`, 10000);
}

async function closeHangar(page) {
  await page.tap('Escape');
  await page.until('!window.__ui.hangar.isOpen', 5000);
}

const LANDED = (focus) => `(() => { const c = window.__carouselStats().camera; return Boolean(c) && c.focus === '${focus}' && ['zoom', 'up', 'along', 'elev'].every((k) => Math.abs(c[k] - c.target[k]) < 0.01); })()`;

async function viewsEach(page) {
  console.log(`1. Top and Bottom on every paint family (${FAMILIES.join(', ')})`);
  for (const id of FAMILIES) {
    await openHangar(page, id);
    await page.click('.hangar [data-key="view-top"]');
    await page.until(LANDED('top'), 60000).catch(() => {});
    await page.until(ROLLED(0), 30000).catch(() => {});
    await shot(page, `${id}-top`);
    await page.click('.hangar [data-key="view-bottom"]');
    await page.until(ROLLED(Math.PI), 60000).catch(() => {});
    await page.until(LANDED('top'), 60000).catch(() => {});
    await page.sleep(500);
    const c = await cam(page);
    const flip = await page.evaluate("document.querySelector('.hangar [data-key=\"flip\"]').getAttribute('aria-pressed')");
    await shot(page, `${id}-bottom`);
    say(c.focus === 'top' && Math.abs(c.roll - Math.PI) < 0.01 && flip === 'true',
      `${id}: Bottom looks down on the plane rolled over: focus ${c.focus}, roll ${c.roll.toFixed(3)}, Flip pressed ${flip}`);
    await page.tap('KeyV');
    await page.until(ROLLED(0), 60000).catch(() => {});
    const back = await cam(page);
    say(Math.abs(back.roll) < 0.01, `${id}: V rolls it back upright, roll ${back.roll.toFixed(3)}`);
    await closeHangar(page);
    await page.evaluate('window.__ui.carousel.close(); true');
  }
}

async function flipAndViews(page) {
  console.log('2. the Flip button, the views by key and button, R3');
  await openHangar(page, 'timber1500');
  const clicked = await page.click('.hangar [data-key="flip"]');
  await page.until(ROLLED(Math.PI), 60000).catch(() => {});
  say(clicked && Math.abs((await cam(page)).roll - Math.PI) < 0.01, 'the Flip button rolls it over');
  for (const [code, focus] of [['Digit3', 'side_left'], ['Digit4', 'side_right'], ['Digit5', 'front'], ['Digit6', 'rear']]) {
    await page.tap(code);
    await page.until(LANDED(focus), 60000).catch(() => {});
    const c = await cam(page);
    say(c.focus === focus && Math.abs(c.roll - Math.PI) < 0.01, `${code} goes to ${focus} and keeps it flipped: ${c.focus}, roll ${c.roll.toFixed(3)}`);
  }
  await page.tap('Digit1');
  await page.until(ROLLED(0), 60000).catch(() => {});
  say(Math.abs((await cam(page)).roll) < 0.01, 'Top (1) stands it upright');
  await page.click('.hangar [data-key="view-top"]');
  await page.sleep(400);
  const off = await page.evaluate("document.querySelector('.hangar [data-key=\"view-top\"]').getAttribute('aria-pressed')");
  say(off === 'false', `Top pressed again lets the view go (${off})`);
  /* A standard pad whose right stick is pressed in, then let go. */
  await page.evaluate(`(() => {
    window.__r3 = false;
    const pad = () => ({ id: 'check pad', index: 0, connected: true, mapping: 'standard', timestamp: performance.now(),
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === 11 && window.__r3, touched: false, value: 0 })) });
    navigator.getGamepads = () => [pad()];
    return true;
  })()`);
  await page.sleep(400);
  await page.evaluate('window.__r3 = true');
  await page.sleep(400);
  await page.evaluate('window.__r3 = false');
  await page.until(ROLLED(Math.PI), 60000).catch(() => {});
  say(Math.abs((await cam(page)).roll - Math.PI) < 0.01, `R3 on a pad flips it: roll ${(await cam(page)).roll.toFixed(3)}`);
  await page.evaluate('navigator.getGamepads = () => []; true');
  await closeHangar(page);
  await page.evaluate('window.__ui.carousel.close(); true');
}

async function closedFlipped(page) {
  console.log('3. flipped and closed, it opens again upright');
  const id = FAMILIES.includes('timber1500') ? 'timber1500' : FAMILIES[0];
  await openHangar(page, id);
  await page.tap('KeyV');
  await page.until(ROLLED(Math.PI), 60000).catch(() => {});
  await closeHangar(page);
  await page.sleep(600);
  const picker = await page.evaluate('window.__ui.carousel.isOpen');
  if (picker) {
    await shot(page, '2-picker-after-flip');
  }
  await page.tap('KeyC');
  await page.until('window.__ui.hangar.isOpen', 10000);
  await page.sleep(300);
  const c = await cam(page);
  const pressed = await page.evaluate("document.querySelector('.hangar [data-key=\"flip\"]').getAttribute('aria-pressed')");
  say(Math.abs(c.roll) < 0.01 && pressed === 'false', `opened again it stands upright: roll ${c.roll.toFixed(3)}, pressed ${pressed}`);
  await closeHangar(page);
  await page.evaluate('window.__ui.carousel.close(); true');
}

async function main() {
  const page = await openPage({ root, width: 1600, height: 900, seed });
  try {
    await page.until('!!window.__shellReady', 300000);
    await page.until('window.__map && window.__map().ready', 400000);
    await viewsEach(page);
    await flipAndViews(page);
    await closedFlipped(page);
    const f = page.errors.filter((e) => !e.startsWith('network:'));
    say(f.length === 0, `no console error or uncaught exception${f.length ? `: ${f.slice(0, 3).join(' | ')}` : ''}`);
  } catch (e) {
    say(false, `the check stopped: ${e.message}`);
  } finally {
    await page.close();
  }
  console.log(`\n${passed} passed, ${failed} failed; pictures in ${outDir}`);
  process.exit(failed ? 1 : 0);
}

await main();
