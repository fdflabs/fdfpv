/*
 * livery-editor-check.js: the Layers controls of the paint shop
 * (docs/redesign/LIVERY-LAYERS.md section 2), pressed with a real pointer.
 *
 * On the Timber, seeded with a star and a stripe: the star chosen, leaned
 * twice, made more see through, given chrome, moved up the stack,
 * duplicated, the copy hidden and the star locked (Move and Remove then
 * refuse); the hangar's entry and the model read back after each, and a
 * picture kept. Saved, the layers survive a reload. Then on one aircraft of
 * every paint family a layer leaned, faded and chromed, pictured. Then the
 * shape library: each new shape added from the Add list with the pointer
 * and placed on the Timber's wing from the Top view.
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
import { DECAL_KINDS, DECAL_KIND_IDS, newDecal } from '../configs/paint.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = resolve(process.argv[2] || join(root, 'tmp', 'livery-editor-check'));
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

const FAMILIES = (process.env.EDITOR_ONLY ? AIRFRAMES.filter((a) => process.env.EDITOR_ONLY.split(',').includes(a.id)) : AIRFRAMES)
  .map((a) => a.id).filter((id, i, all) => paintable(id) && all.findIndex((o) => liveryKey(o) === liveryKey(id)) === i);

const star = { ...newDecal('star', [0.3, 0.06, 0.02], [0, 1, 0], { c: '#f2c500' }), s: 0.2 };
const stripe = newDecal('stripe', [0.1, 0.06, 0.02], [0, 1, 0], { c: '#d52b1e' });
const liveries = Object.fromEntries(FAMILIES.map((id) => [liveryKey(id), { decals: [star, stripe] }]));

const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  if (!s.livery || !s.livery.timber1500 || !s.livery.timber1500.decals || s.livery.timber1500.decals.length < 3) {
    Object.assign(s, {
      airframeAsked: true, fpsCap: 0, graphics: 'medium',
      progress: { v: 1, xp: 0, courses: {}, challenges: {}, seen: {}, unlockAll: true },
      livery: ${JSON.stringify(liveries)},
    });
    localStorage.setItem(k, JSON.stringify(s));
  }
} catch (e) { /* storage refused; the checks below will say so */ }`];

async function shot(page, name) {
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
}

async function steady(page, selector) {
  await page.until(`(() => { const b = document.querySelector(${JSON.stringify(selector)}); return Boolean(b) && !b.disabled && b.getBoundingClientRect().width > 0; })()`, 10000);
}

async function press(page, key) {
  const selector = `.hangar [data-key="${key}"]`;
  await steady(page, selector);
  /* The panel scrolls smoothly: brought into view and let settle first,
   * or the pointer lands where the button was. */
  await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: 'center' }); true`);
  await page.sleep(400);
  await page.click(selector);
  await page.sleep(250);
}

const entry = (page) => page.evaluate('window.__ui.hangar.entry');
const disabled = (page, key) => page.evaluate(`document.querySelector('.hangar [data-key="${key}"]').disabled`);

async function openHangar(page, id) {
  await page.evaluate('window.__ui.openCraftRow(false); true');
  await page.until('window.__ui.carousel.isOpen', 10000);
  await page.evaluate(`window.__ui.carousel.setFilter('all'); window.__ui.carousel.goTo(window.__ui.carousel.ids.indexOf(${JSON.stringify(id)})); true`);
  await page.tap('KeyC');
  await page.until('window.__ui.hangar.isOpen', 10000);
  await page.until(`window.__ui.hangar.id === ${JSON.stringify(id)}`, 10000);
  await page.until(`Boolean(window.__pickLook(${JSON.stringify(id)})) && Boolean(window.__carouselStats().camera)`, 120000);
  await press(page, 'tab-colours');
  await press(page, 'page-decals');
}

async function closeHangar(page, save) {
  if (save) {
    await press(page, 'save');
  } else {
    await page.tap('Escape');
  }
  await page.until('!window.__ui.hangar.isOpen', 10000);
  await page.evaluate('window.__ui.carousel && window.__ui.carousel.close(); true');
}

async function timber(page) {
  console.log('1. the Layers controls on the Timber');
  await openHangar(page, 'timber1500');
  await press(page, 'decal-0');
  await press(page, 'skew-up');
  await press(page, 'skew-up');
  await press(page, 'opacity-down');
  await press(page, 'lfinish-chrome');
  let e = await entry(page);
  say(e.decals[0].x === 10 && e.decals[0].o === 90 && e.decals[0].fi === 'chrome', `lean twice, fade once, chrome: ${JSON.stringify(e.decals[0])}`);
  const look = await page.evaluate("window.__pickLook('timber1500').decals");
  say(look.finishes === 2 && look.decals === 2, `the model draws them in two finishes: ${JSON.stringify(look)}`);
  await shot(page, 'timber-star-chrome');
  await press(page, 'layer-up');
  e = await entry(page);
  say(e.decals[1].k === 'star' && e.decals[0].k === 'stripe', `Up moves the star over the stripe: ${e.decals.map((d) => d.k)}`);
  await press(page, 'layer-dup');
  e = await entry(page);
  say(e.decals.length === 3 && e.decals[2].k === 'star' && e.decals[2].fi === 'chrome', `Duplicate puts a copy on top: ${e.decals.map((d) => d.k)}`);
  await press(page, 'layer-hide');
  e = await entry(page);
  const hid = await page.evaluate("window.__pickLook('timber1500').decals");
  say(e.decals[2].h === true && hid.decals === 2, `Hide keeps the copy and draws it nowhere: ${hid.decals} drawn of ${e.decals.length}`);
  await press(page, 'decal-1');
  await press(page, 'layer-lock');
  e = await entry(page);
  const locked = await disabled(page, 'move') && await disabled(page, 'decal-delete') && await disabled(page, 'size-up');
  say(e.decals[1].l === true && locked, `Lock: Move, Remove and Size refuse (${locked})`);
  await shot(page, 'timber-layers-panel');
  await closeHangar(page, true);
  await page.cdp.send('Page.reload', {}, page.sessionId);
  await page.until('!!window.__shellReady', 300000);
  await page.until('window.__map && window.__map().ready', 400000);
  const kept = await page.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})).livery.timber1500.decals`);
  say(kept.length === 3 && kept[1].l === true && kept[2].h === true && kept[1].x === 10, `saved, the layers are kept over a reload: ${JSON.stringify(kept.map((d) => [d.k, d.x ?? 0, d.o ?? 100, d.fi ?? 'gloss', !!d.h, !!d.l]))}`);
}

async function everyFamily(page) {
  console.log(`2. a layer leaned, faded and chromed on every paint family (${FAMILIES.join(', ')})`);
  for (const id of FAMILIES.filter((f) => f !== 'timber1500')) {
    await openHangar(page, id);
    await press(page, 'decal-0');
    await press(page, 'skew-up');
    await press(page, 'skew-up');
    await press(page, 'skew-up');
    await press(page, 'opacity-down');
    await press(page, 'opacity-down');
    await press(page, 'lfinish-chrome');
    const e = await entry(page);
    const d = e.decals[0];
    say(d.x === 15 && d.o === 80 && d.fi === 'chrome', `${id}: ${JSON.stringify({ x: d.x, o: d.o, fi: d.fi })}`);
    await press(page, 'view-top');
    await page.sleep(1200);
    await shot(page, `${id}-layer`);
    await closeHangar(page, false);
  }
}

async function shapes(page) {
  const free = DECAL_KIND_IDS.filter((k) => DECAL_KINDS[k].free);
  console.log(`3. the shape library on the Timber (${free.join(', ')})`);
  await openHangar(page, 'timber1500');
  await press(page, 'view-top');
  await page.sleep(1500);
  for (const k of free) {
    const before = await page.evaluate('(window.__ui.hangar.entry.decals || []).length');
    await press(page, 'decal-add');
    await press(page, `kind-${k}`);
    await page.until('Boolean(window.__ui.hangar.shop.placing)', 5000);
    await page.until('(() => { const p = window.__ui.hangar.shop.placing; return Boolean(p && p.hit && p.hit.n); })()', 60000).catch(() => {});
    await page.tap('Enter');
    await page.until(`(window.__ui.hangar.entry.decals || []).length === ${before + 1}`, 20000).catch(() => {});
    const e = await entry(page);
    const got = e.decals[before];
    say(Boolean(got) && got.k === k, `${k} added and placed: ${got ? JSON.stringify(got.p) : 'nothing'}`);
    if (await page.evaluate('window.__ui.hangar.shop.sel') >= 0) {
      await press(page, `decal-${before}`);
    }
  }
  const look = await page.evaluate("window.__pickLook('timber1500').decals");
  await shot(page, 'timber-shapes');
  say(look.decals >= free.length, `the model draws them: ${JSON.stringify(look)}`);
  await closeHangar(page, false);
}

async function groups(page) {
  console.log('4. a group: a circle grouped with the copy under it grows with it');
  await openHangar(page, 'timber1500');
  await press(page, 'view-top');
  await page.sleep(1200);
  await press(page, 'decal-add');
  await press(page, 'kind-circle');
  await page.until('(() => { const p = window.__ui.hangar.shop.placing; return Boolean(p && p.hit && p.hit.n); })()', 60000).catch(() => {});
  await page.tap('Enter');
  await page.until('(window.__ui.hangar.entry.decals || []).length === 4', 20000).catch(() => {});
  await press(page, 'layer-group');
  let e = await entry(page);
  say(e.decals[3].g && e.decals[3].g === e.decals[2].g, `Group joins the circle to the layer under it: ${e.decals.map((d) => d.g ?? '-')}`);
  const before = e.decals[2].s;
  await press(page, 'size-up');
  e = await entry(page);
  say(Math.abs(e.decals[2].s - before * 1.12) < 0.002 && e.decals[1].s === 0.2, `Size on the circle scales its group (${before} to ${e.decals[2].s}) and not the locked star outside it (${e.decals[1].s})`);
  await press(page, 'layer-group');
  e = await entry(page);
  say(!e.decals[3].g && !e.decals[2].g, 'Ungroup ends a group of two');
  await shot(page, 'timber-group');
  await closeHangar(page, false);
}

async function main() {
  const page = await openPage({ root, width: 1600, height: 900, seed });
  try {
    await page.until('!!window.__shellReady', 300000);
    await page.until('window.__map && window.__map().ready', 400000);
    await timber(page);
    await everyFamily(page);
    await shapes(page);
    await groups(page);
    const f = page.errors.filter((e) => !e.startsWith('network:'));
    say(f.length === 0, `no console error or uncaught exception${f.length ? `: ${f.slice(0, 3).join(' | ')}` : ''}`);
  } catch (e) {
    say(false, `the check stopped: ${e.message}; the page said: ${page.errors.slice(0, 3).join(' | ')}`);
  } finally {
    await page.close();
  }
  console.log(`\n${passed} passed, ${failed} failed; pictures in ${outDir}`);
  process.exit(failed ? 1 : 0);
}

await main();
