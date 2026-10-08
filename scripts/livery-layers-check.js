/*
 * livery-layers-check.js: the layer keys drawn, and what 32 layers cost
 * (docs/redesign/LIVERY-LAYERS.md section 5), in the real shell, headless.
 *
 * Every paint family wears a 32 layer livery: stars, stripes, words and
 * numbers over the top, the sides and the underside, in all four finishes,
 * some skewed, some see through, two hidden. On each the hangar's model is
 * read back (layers drawn, meshes, triangles, the atlas side, the finishes
 * in use and the milliseconds the dress took) and pictured from the top,
 * the left and the bottom. Then the hidden layers drawn nowhere, and a
 * check that 32 layers on every family dress within DRESS_BUDGET_MS.
 *
 * Usage: node scripts/livery-layers-check.js [outdir]; GRAPHICS=low|medium|high.
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
import { liveryKey, normaliseEntry, paintable } from '../configs/liveries.js';
import { LAYER_FINISHES, MAX_DECALS, newDecal } from '../configs/paint.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = resolve(process.argv[2] || join(root, 'tmp', 'livery-layers-check'));
await mkdir(outDir, { recursive: true });
const GRAPHICS = process.env.GRAPHICS || 'high';
/* A dress happens when the paint changes, never per frame; a quarter of a
 * second is what a pilot joining a room may wait for a peer's paint on a
 * software renderer. Measured numbers are printed beside it. */
const DRESS_BUDGET_MS = 250;

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

const FAMILIES = (process.env.LAYERS_ONLY ? AIRFRAMES.filter((a) => process.env.LAYERS_ONLY.split(',').includes(a.id)) : AIRFRAMES)
  .map((a) => a.id).filter((id, i, all) => paintable(id) && all.findIndex((o) => liveryKey(o) === liveryKey(id)) === i);

/* 32 layers spread over a box a metre and a half across, so every family,
 * from the Kadet to the F-16, has layers landing on it. */
function layers() {
  const kinds = ['star', 'stripe', 'text', 'num', 'chevron', 'flame', 'roundel', 'bolt'];
  const colours = ['#d52b1e', '#f2c500', '#0038a8', '#f2f2f2'];
  return Array.from({ length: MAX_DECALS }, (_, i) => {
    const face = i % 4;
    const along = ((i >> 2) - 3.5) * 0.09;
    const p = face === 0 ? [along, 0.08, -0.05] : face === 1 ? [0.3 + along * 0.4, -0.04, along] : face === 2 ? [0.04, 0.02, along] : [-0.25 - along * 0.4, 0.06, along];
    const n = face === 1 ? [0, -1, 0] : face === 2 ? [1, 0, 0] : [0, 1, 0];
    const d = newDecal(kinds[i % kinds.length], p, n, { c: colours[i % 4], c2: '#0e1213' });
    return {
      ...d, s: d.s * 1.6, x: i % 3 === 0 ? 25 : 0, o: i % 5 === 0 ? 50 : 100,
      fi: LAYER_FINISHES[i % LAYER_FINISHES.length], ...(i === 7 || i === 19 ? { h: true } : {}),
    };
  });
}

const liveries = {};
for (const id of FAMILIES) {
  liveries[liveryKey(id)] = normaliseEntry(liveryKey(id), { decals: layers() });
}

const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, {
    airframeAsked: true, fpsCap: 0, graphics: ${JSON.stringify(GRAPHICS)},
    progress: { v: 1, xp: 0, courses: {}, challenges: {}, seen: {}, unlockAll: true },
    livery: ${JSON.stringify(liveries)},
  });
  localStorage.setItem(k, JSON.stringify(s));
} catch (e) { /* storage refused; the checks below will say so */ }`];

async function shot(page, name) {
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
}

async function steady(page, selector) {
  await page.until(`(() => { const b = document.querySelector(${JSON.stringify(selector)}); return Boolean(b) && !b.disabled && b.getBoundingClientRect().width > 0; })()`, 10000);
}

async function press(page, selector) {
  await steady(page, selector);
  return page.click(selector);
}

const LANDED = (focus) => `(() => { const c = window.__carouselStats().camera; return Boolean(c) && c.focus === '${focus}' && ['zoom', 'up', 'along', 'elev'].every((k) => Math.abs(c[k] - c.target[k]) < 0.01); })()`;

async function openHangar(page, id) {
  await page.evaluate('window.__ui.openCraftRow(false); true');
  await page.until('window.__ui.carousel.isOpen', 10000);
  await page.evaluate(`window.__ui.carousel.setFilter('all'); window.__ui.carousel.goTo(window.__ui.carousel.ids.indexOf(${JSON.stringify(id)})); true`);
  await page.tap('KeyC');
  await page.until('window.__ui.hangar.isOpen', 10000);
  await page.until(`window.__ui.hangar.id === ${JSON.stringify(id)}`, 10000);
  await page.until(`Boolean(window.__pickLook(${JSON.stringify(id)})) && Boolean(window.__carouselStats().camera)`, 120000);
}

async function main() {
  const page = await openPage({ root, width: 1600, height: 900, seed });
  const rows = [];
  try {
    await page.until('!!window.__shellReady', 300000);
    await page.until('window.__map && window.__map().ready', 400000);
    console.log(`1. 32 layers on every paint family, graphics ${GRAPHICS} (${FAMILIES.join(', ')})`);
    for (const id of FAMILIES) {
      await openHangar(page, id);
      await page.until(`(window.__pickLook(${JSON.stringify(id)}).decals || {}).decals > 0`, 60000).catch(() => {});
      const got = (await page.evaluate(`window.__pickLook(${JSON.stringify(id)})`)).decals;
      rows.push({ id, ...got });
      say(got.decals === MAX_DECALS - 2 && got.meshes > 0 && got.triangles > 0 && got.finishes >= 2,
        `${id}: ${got.decals} drawn (2 hidden), ${got.meshes} meshes, ${got.triangles} triangles, ${got.finishes} finishes, atlas ${got.atlas} px, dressed in ${got.ms.toFixed(1)} ms`);
      for (const [key, focus] of [['view-top', 'top'], ['view-left', 'side_left'], ['view-bottom', 'top']]) {
        await press(page, `.hangar [data-key="${key}"]`);
        await page.until(LANDED(focus), 60000).catch(() => {});
        await page.sleep(700);
        await shot(page, `${id}-${key.slice(5)}`);
      }
      await page.tap('Escape');
      await page.until('!window.__ui.hangar.isOpen', 5000);
      await page.evaluate('window.__ui.carousel.close(); true');
    }
    const worst = rows.reduce((a, b) => (b.ms > a.ms ? b : a), rows[0]);
    say(worst.ms <= DRESS_BUDGET_MS, `the slowest dress, ${worst.id}, ${worst.ms.toFixed(1)} ms of ${DRESS_BUDGET_MS}`);
    const want = { low: 512, medium: 1024, high: 2048 }[GRAPHICS];
    say(rows.every((r) => r.atlas === want), `every atlas is the ${GRAPHICS} preset's ${want} px`);
    const f = page.errors.filter((e) => !e.startsWith('network:'));
    say(f.length === 0, `no console error or uncaught exception${f.length ? `: ${f.slice(0, 3).join(' | ')}` : ''}`);
  } catch (e) {
    say(false, `the check stopped: ${e.message}; the page said: ${page.errors.slice(0, 3).join(' | ')}`);
  } finally {
    await page.close();
  }
  await writeFile(join(outDir, 'cost.json'), JSON.stringify(rows, null, 1));
  console.log(`\n${passed} passed, ${failed} failed; pictures and cost.json in ${outDir}`);
  process.exit(failed ? 1 : 0);
}

await main();
