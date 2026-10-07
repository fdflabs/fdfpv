/*
 * shop-check.js: the hangar's Shop tab in a real page against a real
 * tracks server (docs/ECONOMY.md section 9). A signed in account whose
 * held record shows a three star war win, an hour on the Cub and all seven
 * challenges opens the Shop on the Cub with a real pointer, sees its
 * tokens, tries the pearl finish on the plane by pointing at it, buys it,
 * wears it and saves; the earned gold shows as owned and wearable, the
 * candy as too dear; the Colours tab offers the pearl and not the candy.
 *
 *   node scripts/shop-check.js [outdir]
 *
 *  * This file is part of the Paraguayan Drone Combat Simulator.
 *  *
 *  * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 *  * it under the terms of the GNU General Public License as published by
 *  * the Free Software Foundation, either version 3 of the License, or (at
 *  * your option) any later version.
 *  *
 *  * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 *  * WITHOUT ANY WARRANTY, without even the implied warranty of
 *  * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 *  * General Public License for more details.
 *  *
 *  * You should have received a copy of the GNU General Public License
 *  * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { seedSignedIn, startAccounts } from '../tests/lib/account.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';
import { CHALLENGES } from '../src/game/progress.js';
import { addFlight } from '../src/share/flighttime.js';
import { grantsFrom, itemById } from '../src/game/economy.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = resolve(process.argv[2] || join(root, 'tmp', 'shop-check'));
mkdirSync(outDir, { recursive: true });

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

const accounts = await startAccounts();
const acc = await accounts.signUp(`shopper-${process.pid}`, 'Shopper');
const blob = {
  v: 1,
  data: {
    progress: { v: 2, xp: 2000, courses: {}, challenges: Object.fromEntries(CHALLENGES.map((c) => [c.id, true])), seen: {}, casual: {}, firsts: {}, unlockAll: true },
    campaign: { v: 1, missions: { 'itaipu-1': { stars: 3, won: true, credits: 400 } }, earned: 400, owned: {}, equipped: { warhead: 'standard', speed: false }, films: {}, flags: {} },
    flightTime: addFlight({}, 'shopdevice01', 'cub1400', 'free', 3700, '2026-10-01'),
  },
  stamps: {},
};
await accounts.api('PUT', '/api/account/progress', { progress: blob }, acc.session);
const paid = grantsFrom(blob).reduce((n, g) => n + g.amount, 0);
const PEARL = itemById('finish:pearl').price;

const seed = [seedSignedIn(accounts.origin, acc), `try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  if (!localStorage.getItem('shop-check-seeded')) {
    Object.assign(s, { airframe: 'cub1400', airframeAsked: true, fpsCap: 0, graphics: 'low', flightMode: 'angle' });
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('shop-check-seeded', '1');
  }
} catch (e) { /* storage refused; the checks below will say so */ }`];

async function shot(page, name) {
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  const path = join(outDir, `${name}.png`);
  writeFileSync(path, Buffer.from(data, 'base64'));
  console.log(`  shot ${path}`);
}

const key = (k) => `.hangar [data-key="${k}"]`;
const text = (k) => `(document.querySelector('${key(k)}') || {}).textContent || ''`;
const look = "JSON.stringify((window.__pickLook('cub1400') || {}).finishes || {})";

async function openHangar(page, id) {
  await page.evaluate('window.__ui.openCraftRow(false); true');
  await page.until('window.__ui.carousel.isOpen', 10000);
  await page.evaluate(`window.__ui.carousel.setFilter('all'); window.__ui.carousel.goTo(window.__ui.carousel.ids.indexOf(${JSON.stringify(id)})); true`);
  await page.tap('KeyC');
  await page.until('window.__ui.hangar.isOpen', 10000);
}

const page = await openPage({ root, width: 1600, height: 900, seed, url: `/index.html?tracks=${encodeURIComponent(accounts.origin)}` });
try {
  await page.until('!!window.__shellReady', 300000);
  await page.until('window.__map && window.__map().ready', 400000);
  await openHangar(page, 'cub1400');
  await page.until(`document.querySelector('${key('tab-shop')}')`, 10000);
  say(await page.click(key('tab-shop')), 'the Shop tab is reached with a real pointer');
  await page.until("window.__ui.hangar.tab === 'shop'", 5000);
  await page.until(`/tokens/.test(${text('shop-balance')})`, 20000);
  const bal = await page.evaluate(text('shop-balance'));
  say(bal.replace(/\D/g, '') === String(paid), `the balance is what the server paid for the record: "${bal}" (${paid})`);
  const tags = await page.evaluate("[...document.querySelectorAll('.shop-item')].map((b) => [b.dataset.key, b.className, b.querySelector('.shop-item-tag').textContent])");
  const tagOf = (id) => (tags.find((t) => t[0] === `shop-${id}`) || [])[2];
  say(tagOf('finish:gold') === 'Owned' && tagOf('decal:ribbon') === 'Owned' && /tokens/.test(tagOf('finish:pearl')),
    `the earned gold and ribbon are owned, the pearl has a price: ${JSON.stringify(tags.map((t) => t[2]))}`);
  const before = await page.evaluate(look);
  await page.click(key('shop-finish:pearl'));
  await page.until(`/pearl/.test(${look})`, 10000).catch(() => {});
  const tried = JSON.parse(await page.evaluate(look));
  say(Object.values(tried).some((f) => f === 'pearl') && JSON.stringify(tried) !== before, `choosing the pearl puts it on the Cub before buying: ${JSON.stringify(tried)}`);
  await shot(page, '1-pearl-tried');
  await page.click(key('shop-buy'));
  await page.until(`/yours/.test(${text('shop-msg')})`, 15000);
  const after = await page.evaluate(text('shop-balance'));
  say(after.replace(/\D/g, '') === String(paid - PEARL), `bought: the balance drops by its price, "${after}"`);
  const server = await accounts.api('GET', '/api/account/wallet', undefined, acc.session);
  say(server.wallet.owned['finish:pearl'] === 'bought' && server.wallet.balance === paid - PEARL, `the server holds it: ${JSON.stringify(server.wallet)}`);
  await page.click(key('shop-finish:candy'));
  const candy = await page.evaluate(`({ disabled: document.querySelector('${key('shop-buy')}').disabled, note: document.querySelector('.shop-detail').textContent })`);
  say(candy.disabled && /more tokens needed/.test(candy.note), `the candy is too dear, and says by how much: ${candy.note}`);
  await page.click(key('shop-finish:pearl'));
  await page.click(key('shop-wear'));
  await page.until(`/every panel/.test(${text('shop-msg')})`, 5000);
  await shot(page, '2-pearl-worn');
  await page.evaluate('window.__ui.hangar.save(); true');
  await page.until('!window.__ui.hangar.isOpen', 10000);
  const saved = await page.evaluate(`JSON.stringify(JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})).livery)`);
  say(/pearl/.test(saved), `Wear it and Save keep the pearl on the Cub: ${saved.slice(0, 160)}`);
  await page.evaluate('window.__ui.carousel.close(); true');
  await openHangar(page, 'cub1400');
  await page.click(key('tab-colours'));
  await page.until("window.__ui.hangar.tab === 'colours'", 5000);
  const chips = await page.evaluate("[...document.querySelectorAll('.paint-finish .paint-chip')].map((b) => [b.dataset.key, b.disabled, (b.querySelector('.pg-lock') || {}).textContent || ''])");
  const chip = (f) => chips.find((c) => c[0] === `finish-${f}`) || [];
  say(chip('pearl')[1] === false && chip('gold')[1] === false && chip('candy')[1] === true && chip('candy')[2] === 'In the shop',
    `Colours offers the owned pearl and gold, the candy says In the shop (Unlock all is on, and does not open it): ${JSON.stringify(chips.slice(-4))}`);
  await shot(page, '3-colours-locks');
  const f = page.errors.filter((e) => !e.startsWith('network:'));
  say(f.length === 0, `no console error or uncaught exception${f.length ? `: ${f.slice(0, 3).join(' | ')}` : ''}`);
} catch (e) {
  say(false, `the check stopped: ${e.message}`);
  await shot(page, 'stopped').catch(() => {});
} finally {
  await page.close();
  await accounts.stop();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
