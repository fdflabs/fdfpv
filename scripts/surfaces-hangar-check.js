/*
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

/*
 * The control surface tiers in the real shell, docs/SURFACES-STAGE1.md:
 * the hangar's Surfaces tab on the Cub with a real pointer and real
 * clicks, then what the shell flies.
 *
 *   H1  the tab is there, three rows of four tiers, the bars filled from
 *       configs/surfaces-stats.js.
 *   H2  pointing at Extreme ailerons draws them bigger on the model, by
 *       the tier's chord ratio, and fits nothing.
 *   H3  pressing tiers moves the bars (agility up, stability and speed
 *       kept down), and Save keeps them in settings.surfaces.
 *   H4  the shell seats them: sim_wing_tiers is the tier block, the
 *       tune's throws the tier's at the stock rate, the servos' grams in
 *       the add-ons.
 *   H5  the Tuning tab's rates show the tier's throws, as the plant
 *       flies them.
 *   H6  a pilot who has not earned them flies stock and sees the cards
 *       locked.
 *
 *   node scripts/surfaces-hangar-check.js [out-dir]
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';
import { SURFACE_TIERS } from '../configs/surfaces-tiers.js';
import { tierBlock, tierPoints, tierThrowsDeg } from '../configs/surfaces.js';
import { stockEntry, throwsFor } from '../configs/tuning.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = resolve(process.argv[2] || join(root, 'tmp', 'surfaces-hangar-check'));
await mkdir(outDir, { recursive: true });
const ID = 'cub1400';

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

const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, {
    airframeAsked: true, airframe: ${JSON.stringify(ID)}, fpsCap: 0, graphics: 'low',
    progress: { v: 1, xp: 0, courses: {}, challenges: {}, seen: {}, unlockAll: true },
  });
  localStorage.setItem(k, JSON.stringify(s));
} catch (e) { /* storage refused; the checks below will say so */ }`];

async function shot(page, name) {
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
}

async function steady(page, selector) {
  await page.evaluate(`(() => { const b = document.querySelector(${JSON.stringify(selector)}); if (b) b.scrollIntoView({ block: 'center', behavior: 'instant' }); return true; })()`);
  let last = '';
  let same = 0;
  for (let i = 0; i < 100; i++) {
    const r = await page.evaluate(`(() => { const b = document.querySelector(${JSON.stringify(selector)}); if (!b) return 'none'; const r = b.getBoundingClientRect(); return [r.left, r.top, r.width, getComputedStyle(b).opacity].join(); })()`);
    same = r === last && r !== 'none' ? same + 1 : 0;
    if (same >= 2) {
      return;
    }
    last = r;
    await page.sleep(120);
  }
  throw new Error(`${selector} never stood still`);
}

async function press(page, selector) {
  await steady(page, selector);
  return page.click(selector);
}

async function pointAt(page, selector) {
  await steady(page, selector);
  const c = await page.evaluate(`(() => { const b = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...c }, page.sessionId);
}

async function openHangar(page) {
  await page.evaluate('window.__ui.openCraftRow(false); true');
  await page.until('window.__ui.carousel.isOpen', 10000);
  await page.evaluate(`window.__ui.carousel.setFilter('all'); window.__ui.carousel.goTo(window.__ui.carousel.ids.indexOf(${JSON.stringify(ID)})); true`);
  await page.tap('KeyC');
  await page.until(`window.__ui.hangar.isOpen && window.__ui.hangar.id === ${JSON.stringify(ID)}`, 10000);
  await page.until('Boolean(window.__carouselStats().camera)', 120000);
}

async function openSurfaces(page) {
  await openHangar(page);
  await press(page, '.hangar [data-key="tab-surfaces"]');
  await page.until("window.__ui.hangar.tab === 'surfaces'", 5000);
  await page.sleep(1500);
}

const chords = (page) => page.evaluate(`window.__carouselChords(${JSON.stringify(ID)})`);
const statText = (page) => page.evaluate("Object.fromEntries([...document.querySelectorAll('.hangar [data-key^=\"surfaces-stat-\"]')].map((b) => [b.dataset.key.slice(14), parseFloat(b.querySelector('.hangar-stat-value').textContent)]))");
/* The shell's seat: re-apply the settings, as any change does. */
const reseat = (page) => page.evaluate('window.__setTune(window.__ui.settings.tune); true');
const craft = (page) => page.evaluate('(() => { const c = window.__craft(); return { tiers: c.tiers, tune: c.tune, massKg: c.addons ? c.addons.massKg : null, addonsOn: c.addons ? c.addons.on : null }; })()');

const page = await openPage({ root, width: 1600, height: 900, seed });
try {
  await page.until('!!window.__shellReady', 240000);
  const stock = await craft(page);
  await openSurfaces(page);

  /* H1 */
  const cards = await page.evaluate("[...document.querySelectorAll('.hangar .surfaces-tab [data-key^=\"surface-\"]')].map((b) => b.dataset.key)");
  const bars = await statText(page);
  say(cards.length === 12 && bars.agility === 100 && bars.stability === 100 && bars.speed === 100,
    `H1 three rows of four tiers (${cards.length} cards), the bars at stock: ${JSON.stringify(bars)}`);
  await shot(page, 'cub-1-stock');

  /* H2 */
  const before = await chords(page);
  await pointAt(page, '.hangar [data-key="surface-a-extreme"]');
  await page.sleep(1500);
  const tried = await chords(page);
  const ratio = tried['aileron-right'] / before['aileron-right'];
  const want = SURFACE_TIERS[ID].a[3].cf / SURFACE_TIERS[ID].a[0].cf;
  const unsaved = await page.evaluate(`JSON.stringify(window.__ui.settings.surfaces[${JSON.stringify(ID)}] || null)`);
  say(Math.abs(ratio / want - 1) < 0.02 && tried.elevator === before.elevator && unsaved === 'null',
    `H2 pointing at Extreme ailerons draws them ${ratio.toFixed(3)} times the chord (the tier's ${want.toFixed(3)}), the elevator as it was, nothing fitted`);
  await shot(page, 'cub-2-pointed-extreme');

  /* H3 */
  await press(page, '.hangar [data-key="surface-a-extreme"]');
  await press(page, '.hangar [data-key="surface-e-3d"]');
  await page.sleep(800);
  const moved = await statText(page);
  say(moved.agility > 100 && moved.stability < 100 && moved.speed < 100, `H3 the bars move: ${JSON.stringify(moved)}`);
  await shot(page, 'cub-3-chosen');
  await press(page, '.hangar [data-key="save"]');
  await page.until(`JSON.stringify(window.__ui.settings.surfaces[${JSON.stringify(ID)}] || null) === '{"a":"extreme","e":"3d","r":"stock"}'`, 10000).catch(() => {});
  const saved = await page.evaluate(`JSON.stringify(window.__ui.settings.surfaces[${JSON.stringify(ID)}] || null)`);
  say(saved === '{"a":"extreme","e":"3d","r":"stock"}', `H3 Save keeps them in settings.surfaces: ${saved}`);

  /* H4 */
  await page.until('!window.__ui.hangar.isOpen', 10000).catch(() => {});
  await page.evaluate('window.__ui.carousel.close(); true');
  await reseat(page);
  await page.sleep(500);
  const tiers = { a: 'extreme', e: '3d', r: 'stock' };
  const seated = await craft(page);
  const block = Array.from(tierBlock(ID, tiers));
  /* At the stock rate, the manual's first flight rate where it has one
   * (configs/tuning.js THE STOCK RATE), in the tier's proportion. */
  const th = throwsFor(ID, stockEntry(ID).rate, tierThrowsDeg(ID, tiers)).map((d) => d * Math.PI / 180);
  const grams = tierPoints(ID, tiers).reduce((a, p) => a + p.kg, 0);
  say(JSON.stringify(seated.tiers) === JSON.stringify(block), `H4 sim_wing_tiers is the tier block: ${JSON.stringify(seated.tiers)}`);
  say(seated.tune && [3, 4, 5].every((i, j) => Math.abs(seated.tune[i] - th[j]) < 1e-12), `H4 the tune's throws are the tier's: ${seated.tune && seated.tune.slice(3, 6).map((x) => (x * 180 / Math.PI).toFixed(2)).join(', ')} deg`);
  say(Math.abs(seated.massKg - stock.massKg - grams) < 1e-9 && seated.addonsOn,
    `H4 the servos ride as add-ons: ${stock.massKg} kg to ${seated.massKg} kg, ${(grams * 1000).toFixed(0)} g`);

  /* H5 */
  await openHangar(page);
  await press(page, '.hangar [data-key="tab-tuning"]');
  await page.until("window.__ui.hangar.tab === 'tuning'", 5000);
  await press(page, '.hangar [data-key="tuning-rates"]');
  await page.sleep(800);
  const shown = await page.evaluate("[...document.querySelectorAll('.hangar .tn-surface-throw')].map((e) => e.textContent)");
  const rate = await page.evaluate(`(window.__ui.settings.tuning[${JSON.stringify(ID)}] || {}).rate || ${JSON.stringify(stockEntry(ID).rate)}`);
  const wantDeg = throwsFor(ID, rate, tierThrowsDeg(ID, tiers));
  say(rate === stockEntry(ID).rate && shown.length === 3 && shown.every((t, i) => parseFloat(t) === Math.round(wantDeg[i] * 10) / 10),
    `H5 the Tuning tab's rates show the tier's throws: ${shown.join(', ')} (${rate} rate, the tier's ${wantDeg.map((d) => d.toFixed(1)).join(', ')})`);
  await shot(page, 'cub-4-rates');
  await page.tap('Escape');
  await page.until('!window.__ui.hangar.isOpen', 10000).catch(() => {});
  await page.evaluate('window.__ui.carousel.close(); true');

  /* H6 */
  await page.evaluate('window.__ui.settings.progress = { ...window.__ui.settings.progress, unlockAll: false, xp: 0 }; true');
  await reseat(page);
  await page.sleep(500);
  const fresh = await craft(page);
  say(JSON.stringify(fresh.tiers) === JSON.stringify([1, 1, 1, 0, 0, 0, 1, 1, 1]) && fresh.massKg === stock.massKg,
    `H6 not yet earned, it flies stock: ${JSON.stringify(fresh.tiers)}, ${fresh.massKg} kg`);
  await openSurfaces(page);
  const lock = await page.evaluate("(() => { const b = document.querySelector('.hangar [data-key=\"surface-a-sport\"]'); const s = document.querySelector('.hangar [data-key=\"surface-a-stock\"]'); return { sport: b.disabled || b.classList.contains('pg-locked'), stock: s.disabled || s.classList.contains('pg-locked') }; })()");
  say(lock.sport && !lock.stock, `H6 the Sport card is locked, Stock is not: ${JSON.stringify(lock)}`);
  await shot(page, 'cub-5-locked');
} finally {
  await page.close();
}

console.log(`\nsurfaces:hangar: ${passed}/${passed + failed} pass`);
process.exit(failed ? 1 : 0);
