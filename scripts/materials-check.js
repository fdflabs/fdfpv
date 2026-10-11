/*
 * materials-check.js: the flake and brushed finishes (docs/redesign/
 * MATERIALS.md), in the real shell, headless.
 *
 * Both are bought first in the Shop with a real pointer, from a local
 * accounts server paid for a record that flew everything once, so the
 * price, the server's wallet and the lock are the ones a pilot meets.
 * Then, on one aircraft of every paint family: the Colours tab, its first
 * region that is not film, then Metal flake and Brushed metal pressed
 * with a real pointer. Each must reach the region's material as its own
 * uniform (flake 1, brush 1) and leave the other off, and a picture is
 * kept of each, whole and zoomed in, so the flakes and the streak can be
 * judged by eye.
 *
 * Run with npm run materials:check [-- <outdir>].
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
import { seedSignedIn, startAccounts } from '../tests/lib/account.js';
import { CHALLENGES, everyFirst } from '../src/game/progress.js';
import { addFlight } from '../src/share/flighttime.js';
import { grantsFrom, itemById } from '../src/game/economy.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = resolve(process.argv[2] || join(root, 'tmp', 'materials-check'));
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
const FAMILIES = (process.env.MATERIALS_ONLY ? AIRFRAMES.filter((a) => process.env.MATERIALS_ONLY.split(',').includes(a.id)) : AIRFRAMES).map((a) => a.id).filter((id, i, all) => paintable(id) && all.findIndex((o) => liveryKey(o) === liveryKey(id)) === i);

const accounts = await startAccounts();
const acc = await accounts.signUp(`materials-${process.pid}`, 'Materials');
let flight = {};
for (const af of AIRFRAMES) {
  flight = addFlight(flight, 'materials01', af.id, 'free', 3700, '2026-10-01');
}
const blob = {
  v: 1,
  data: {
    progress: { v: 2, xp: 0, courses: {}, challenges: Object.fromEntries(CHALLENGES.map((c) => [c.id, true])), seen: {}, casual: {}, firsts: {}, unlockAll: true },
    campaign: { v: 1, missions: Object.fromEntries(everyFirst().filter((f) => f.key.startsWith('mission:')).map((f) => [f.key.split(':')[1], { stars: 3, won: true, credits: 0 }])), earned: 0, owned: {}, equipped: { warhead: 'standard', speed: false }, films: {}, flags: {} },
    flightTime: flight,
  },
  stamps: {},
};
await accounts.api('PUT', '/api/account/progress', { progress: blob }, acc.session);
const paid = grantsFrom(blob).reduce((n, g) => n + g.amount, 0);

const seed = [seedSignedIn(accounts.origin, acc), `try {
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

async function openHangar(page, id) {
  await page.evaluate('window.__ui.openCraftRow(false); true');
  await page.until('window.__ui.carousel.isOpen', 10000);
  await page.evaluate(`window.__ui.carousel.setFilter('all'); window.__ui.carousel.goTo(window.__ui.carousel.ids.indexOf(${JSON.stringify(id)})); true`);
  await page.tap('KeyC');
  await page.until('window.__ui.hangar.isOpen', 10000);
  await page.until(`window.__ui.hangar.id === ${JSON.stringify(id)}`, 10000);
  /* Its model built and drawn once, which a software renderer takes a
   * while over: what the checks read of it is null until then. */
  await page.until(`Boolean(window.__pickPaint(${JSON.stringify(id)})) && Boolean(window.__carouselStats().camera)`, 120000);
}

async function closeHangar(page) {
  await page.tap('Escape');
  await page.until('!window.__ui.hangar.isOpen', 5000);
}

/* A button that has stopped moving: the side panel scrolls smoothly and
 * slides its controls in when it is drawn again, and a click on a moving
 * one lands on its neighbour. Scrolled into view at once, then the same
 * place on three reads in a row; a slow software renderer can sit still
 * for one read mid animation. */
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

/* A real pointer click on a button once it stands still. */
async function press(page, selector) {
  await steady(page, selector);
  return page.click(selector);
}

const BUY = ['finish:flake', 'finish:brushed'];

async function buy(page) {
  console.log(`0. buy ${BUY.join(' and ')} in the Shop (paid ${paid} tokens)`);
  await openHangar(page, FAMILIES[0]);
  await press(page, '.hangar [data-key="tab-shop"]');
  await page.until("window.__ui.hangar.tab === 'shop'", 5000);
  await page.until("/tokens/.test((document.querySelector('.hangar [data-key=\"shop-balance\"]') || {}).textContent || '')", 20000);
  let left = paid;
  for (const id of BUY) {
    await press(page, `.hangar [data-key="shop-${id}"]`);
    await press(page, '.hangar [data-key="shop-buy"]');
    await page.until("/yours/.test((document.querySelector('.hangar [data-key=\"shop-msg\"]') || {}).textContent || '')", 15000).catch(() => {});
    left -= itemById(id).price;
    await shot(page, `0-bought-${id.split(':')[1]}`);
  }
  const server = await accounts.api('GET', '/api/account/wallet', undefined, acc.session);
  say(BUY.every((id) => server.wallet.owned[id] === 'bought') && server.wallet.balance === left,
    `the server holds both at their prices (${BUY.map((id) => itemById(id).price).join(', ')}): ${JSON.stringify(server.wallet)}`);
  await closeHangar(page);
  await page.evaluate('window.__ui.carousel.close(); true');
}

const MATERIALS = [['flake', 'flake'], ['brushed', 'brush']];

async function eachFamily(page) {
  console.log(`1. flake and brushed on every paint family (${FAMILIES.join(', ')})`);
  for (const id of FAMILIES) {
    await openHangar(page, id);
    await press(page, '.hangar [data-key="tab-colours"]');
    await page.until("window.__ui.hangar.tab === 'colours'", 5000);
    const region = await page.evaluate("(window.__ui.hangar.regions.find((r) => !r.film && r.finish !== false) || {}).id || null");
    if (!region) {
      say(true, `${id}: no region takes a finish of its own`);
      await closeHangar(page);
      await page.evaluate('window.__ui.carousel.close(); true');
      continue;
    }
    await press(page, `.hangar [data-key="region-${region}"]`);
    /* A mid blue, so the flakes and the streak show over the paint; a
     * white or a black one hides both. */
    const swatch = await page.evaluate("[...document.querySelectorAll('.hangar .hangar-palette .paint-swatch, .hangar .hangar-palette button')].map((b) => b.dataset.key).filter((k) => k && k.startsWith('colour-'))[15]");
    await press(page, `.hangar [data-key="${swatch}"]`);
    for (const [finish, flag] of MATERIALS) {
      await press(page, `.hangar [data-key="finish-${finish}"]`);
      await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 400, y: 450 }, page.sessionId);
      const want = `(() => { const l = window.__pickLook(${JSON.stringify(id)}); const u = l && l.uniforms[${JSON.stringify(region)}]; return Boolean(u) && u.compiled && u.${flag} === 1; })()`;
      await page.until(want, 30000).catch(() => {});
      const l = await page.evaluate(`window.__pickLook(${JSON.stringify(id)})`);
      const u = l && l.uniforms[region];
      const other = flag === 'flake' ? 'brush' : 'flake';
      const entry = await page.evaluate('window.__ui.hangar.entry');
      say(Boolean(u) && u.compiled && u[flag] === 1 && u[other] === 0 && (entry.finishes || {})[region] === finish,
        `${id}: ${finish} on the ${region}: ${JSON.stringify(u)}, entry ${JSON.stringify(entry.finishes)}`);
      await page.sleep(400);
      await shot(page, `${id}-${finish}`);
      /* As close as the orbit goes; the camera is not what is checked. */
      const zoom = await page.evaluate('window.__ui.hangar.zoomBy(0.1); window.__ui.hangar.orbit.zoom');
      await page.until('(() => { const c = window.__carouselStats().camera; return Boolean(c) && Math.abs(c.zoom - c.target.zoom) < 0.01; })()', 30000).catch(() => {});
      await page.sleep(300);
      await shot(page, `${id}-${finish}-close`);
      say(zoom === 0.5, `${id}: zoomed to the orbit's closest, ${zoom}`);
      await page.evaluate('window.__ui.hangar.zoomBy(2); true');
      await page.sleep(600);
    }
    await closeHangar(page);
    await page.evaluate('window.__ui.carousel.close(); true');
  }
}

async function main() {
  const page = await openPage({ root, width: 1600, height: 900, seed, url: `/index.html?tracks=${encodeURIComponent(accounts.origin)}` });
  try {
    await page.until('!!window.__shellReady', 300000);
    await page.until('window.__map && window.__map().ready', 400000);
    await buy(page);
    await eachFamily(page);
    const f = page.errors.filter((e) => !e.startsWith('network:'));
    say(f.length === 0, `no console error or uncaught exception${f.length ? `: ${f.slice(0, 3).join(' | ')}` : ''}`);
  } catch (e) {
    say(false, `the check stopped: ${e.message}; the page said: ${page.errors.slice(0, 3).join(' | ')}`);
  } finally {
    await page.close();
    await accounts.stop();
  }
  console.log(`\n${passed} passed, ${failed} failed; pictures in ${outDir}`);
  process.exit(failed ? 1 : 0);
}

await main();
