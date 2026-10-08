/*
 * kits-hangar-check.js: the hangar's Kit tab with a real pointer
 * (docs/KITS.md section 8, PR 4). On each quad: the Kit tab pressed,
 * an option pointed at (the model tries it on, nothing saved), pressed
 * (fitted), saved, and read back from the settings; then the hangar
 * opened again shows it fitted. Pictures of the model before and after.
 *
 * usage: node scripts/kits-hangar-check.js [outdir]
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

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = resolve(process.argv[2] || join(root, 'tmp', 'kits-hangar-check'));
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

/* Per quad: the option pointed at, and the two pressed. */
const PLAN = {
  '7inch': { hover: ['arms', 'blade'], press: [['arms', 'tapered'], ['antenna', 'pagoda']] },
  '10inch': { hover: ['top', 'armoured'], press: [['arms', 'cutout'], ['mount', 'cage']] },
  interceptor: { hover: ['antenna', 'dualt'], press: [['top', 'armoured'], ['arms', 'blade']] },
};

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

async function pointAt(page, selector) {
  const c = await page.evaluate(`(() => { const b = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...c }, page.sessionId);
}

async function openHangar(page, id) {
  await page.evaluate('window.__ui.openCraftRow(false); true');
  await page.until('window.__ui.carousel.isOpen', 10000);
  await page.evaluate(`window.__ui.carousel.setFilter('all'); window.__ui.carousel.goTo(window.__ui.carousel.ids.indexOf(${JSON.stringify(id)})); true`);
  await page.tap('KeyC');
  await page.until(`window.__ui.hangar.isOpen && window.__ui.hangar.id === ${JSON.stringify(id)}`, 10000);
  await page.until('Boolean(window.__carouselStats().camera)', 120000);
}

async function closeAll(page) {
  await page.until('!window.__ui.hangar.isOpen', 10000).catch(() => {});
  await page.evaluate('window.__ui.carousel.close(); true');
}

const savedKit = (id) => `JSON.stringify(((window.__ui.settings.livery || {})[${JSON.stringify(id)}] || {}).kit || null)`;

async function quad(page, id) {
  const plan = PLAN[id];
  await openHangar(page, id);
  say(await page.click('.hangar [data-key="tab-kit"]'), `${id}: the Kit tab is there and pressed`);
  await page.until("window.__ui.hangar.tab === 'kit'", 5000);
  await page.click('.hangar [data-key="view-top"]');
  await page.sleep(2500);
  await shot(page, `${id}-1-stock`);

  const [hs, ho] = plan.hover;
  await pointAt(page, `.hangar [data-key="kit-${hs}-${ho}"]`);
  await page.sleep(1500);
  const tried = await page.evaluate(`JSON.stringify(window.__ui.hangar.shownEntry().kit || null)`);
  const entry = await page.evaluate(`JSON.stringify(window.__ui.hangar.entry.kit || null)`);
  say(tried === JSON.stringify({ v: 1, parts: { [hs]: ho } }) && entry === 'null', `${id}: pointing at ${hs} ${ho} tries it on (${tried}), nothing fitted (${entry})`);
  await shot(page, `${id}-2-tried-${hs}-${ho}`);

  for (const [s, o] of plan.press) {
    await page.click(`.hangar [data-key="kit-${s}-${o}"]`);
    await page.sleep(300);
  }
  /* In slot order, as configs/kits.js kitParts keeps it. */
  const order = ['arms', 'top', 'mount', 'antenna'];
  const want = JSON.stringify({ v: 1, parts: Object.fromEntries([...plan.press].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))) });
  const fitted = await page.evaluate(`JSON.stringify(window.__ui.hangar.entry.kit || null)`);
  say(fitted === want, `${id}: pressing fits ${fitted}`);
  await page.sleep(2000);
  await shot(page, `${id}-3-fitted`);
  await page.click('.hangar [data-key="save"]');
  await page.until(`${savedKit(id)} === ${JSON.stringify(want)}`, 10000).catch(() => {});
  say(await page.evaluate(savedKit(id)) === want, `${id}: Save keeps it in settings.livery`);
  await closeAll(page);

  await openHangar(page, id);
  await page.click('.hangar [data-key="tab-kit"]');
  await page.until("window.__ui.hangar.tab === 'kit'", 5000);
  const pressed = await page.evaluate(`[...document.querySelectorAll('.hangar .kit-tab [aria-pressed="true"]')].map((b) => b.dataset.key).sort().join(',')`);
  const wantPressed = [...plan.press.map(([s, o]) => `kit-${s}-${o}`)];
  say(wantPressed.every((k) => pressed.includes(k)), `${id}: opened again, the fitted options show pressed: ${pressed}`);
  await page.tap('Escape');
  await closeAll(page);
}

async function main() {
  const page = await openPage({ root, width: 1600, height: 900, seed });
  try {
    await page.until('!!window.__shellReady', 300000);
    await page.until('window.__map && window.__map().ready', 400000);
    for (const id of Object.keys(PLAN)) {
      await quad(page, id);
    }
    await openHangar(page, 'sky1800');
    await page.click('.hangar [data-key="tab-kit"]');
    await page.until("window.__ui.hangar.tab === 'kit'", 5000).catch(() => {});
    const note = await page.evaluate("Boolean(document.querySelector('.hangar .kit-tab')) && !document.querySelector('.hangar .kit-tab [data-key^=\"kit-\"]')");
    say(note, 'sky1800: a family not drawn yet shows the tab with no options');
    await page.tap('Escape');
    await closeAll(page);
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
