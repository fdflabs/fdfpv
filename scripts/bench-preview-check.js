/*
 * bench-preview-check.js: the hangar's readouts before equipping (Wave 4
 * item 24, docs/PARTS-WEAR.md), in the real shell, headless, with a real
 * pointer.
 *
 *   1. The Skyhunter's Power tab: the pointer on a bigger pack's card
 *      shows, under each readout, what that pack would make it (heavier
 *      in amber, a longer flight time in mint, as the estimates say), and
 *      chooses nothing; off the card, the lines go back.
 *   2. The Cub's Parts tab: the pointer on the camera pod's card shows on
 *      the spec sheet the weight it adds and the wing loading it costs,
 *      in amber; on the three blade prop, the thrust to weight it adds;
 *      nothing is fitted until a card is pressed.
 *   3. The 7 inch's Power tab: the motor response reads, and a hotter
 *      motor's card previews it.
 * And no console error or uncaught exception.
 *
 *   node scripts/bench-preview-check.js [outdir]   pictures into outdir
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
import { ESTIMATES } from '../configs/power-estimates.js';
import { POWER, powerBlock } from '../configs/power.js';
import { tuningFor } from '../configs/tuning.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = process.argv[2] || null;

let failed = 0;
function say(ok, what) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) {
    failed += 1;
  }
}

const s = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'timber1500');
s.map = 'alps';
s.graphics = 'low';
s.flightMode = 'angle';
s.fpsCap = 0;
s.airframeAsked = true;
const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  if (!s.benchSeeded) {
    Object.assign(s, ${JSON.stringify(s)}, { benchSeeded: true });
    localStorage.setItem(k, JSON.stringify(s));
  }
} catch (e) { /* storage refused */ }`];

async function openHangar(page, id) {
  await page.evaluate("window.__ui.openCraftRow(false); true");
  await page.until('window.__ui.carousel.isOpen', 10000);
  await page.evaluate("window.__ui.carousel.setFilter('all'); true");
  const at = await page.evaluate(`window.__ui.carousel.ids.indexOf(${JSON.stringify(id)})`);
  await page.evaluate(`window.__ui.carousel.goTo(${at}); true`);
  await page.tap('KeyC');
  await page.until('window.__ui.hangar.isOpen', 10000);
}

async function closeHangar(page) {
  await page.tap('Escape');
  await page.until('!window.__ui.hangar.isOpen', 10000).catch(() => {});
  if (await page.evaluate('window.__ui.carousel.isOpen')) {
    await page.tap('Escape');
  }
}

/* The real pointer onto a card's centre, or off to the far corner. The
 * panel scrolls smoothly, so the card is measured once it has stopped. */
async function pointAt(page, key) {
  const where = `(() => {
    const b = document.querySelector('.hangar [data-key="${key}"]');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`;
  let at = { x: 2, y: 2 };
  if (key) {
    await page.evaluate(`(() => { const b = document.querySelector('.hangar [data-key="${key}"]'); if (b) b.scrollIntoView({ block: 'center' }); return true; })()`);
    let last = null;
    for (let i = 0; i < 40; i += 1) {
      await page.sleep(50);
      at = await page.evaluate(where);
      if (!at || (last && at.x === last.x && at.y === last.y)) {
        break;
      }
      last = at;
    }
  }
  if (!at) {
    throw new Error(`no card ${key}`);
  }
  await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y }, page.sessionId);
  await page.sleep(120);
}

/* Each readout's label, value and the line under it, with its class. */
const READ = (scope) => `[...document.querySelectorAll('${scope} .hangar-stat')].map((b) => ({
  label: b.querySelector('.hangar-stat-label').textContent,
  line: b.querySelector('.hangar-stat-delta').textContent,
  cls: b.querySelector('.hangar-stat-delta').className.replace('hangar-stat-delta', '').trim(),
  shown: getComputedStyle(b.querySelector('.hangar-stat-delta')).display !== 'none',
}))`;
const byLabel = (rows, label) => rows.find((r) => r.label === label) || {};

async function picture(page, name) {
  if (!out) {
    return;
  }
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(out, `${name}.png`), Buffer.from(data, 'base64'));
}

async function main() {
  if (out) {
    await mkdir(out, { recursive: true });
  }
  const page = await openPage({ root, width: 1600, height: 900, seed });
  try {
    await page.until('window.__shellReady === true', 300000);
    await page.until('window.__map && window.__map().ready', 400000);

    console.log('1. the Skyhunter\'s Power tab, a bigger pack under the pointer');
    await openHangar(page, 'sky1800');
    await page.until("window.__ui.hangar.tab === 'power'", 5000);
    const before = await page.evaluate(READ('.hangar-side'));
    const choice0 = await page.evaluate('JSON.stringify(window.__ui.hangar.choice)');
    await pointAt(page, 'pack-4s6000');
    const over = await page.evaluate(READ('.hangar-side'));
    await picture(page, 'power-pack-preview');
    const e = ESTIMATES.sky1800.stock['4s6000'];
    const grams = Math.round(powerBlock('sky1800', 'stock', '4s6000')[1] * 1000);
    const w = byLabel(over, 'Weight');
    const m = byLabel(over, 'Flight time at cruise');
    const t = byLabel(over, 'Top speed');
    say(w.line === `→ ${grams.toLocaleString('en')} g` && w.cls === 'worse', `weight previews ${grams} g, worse: ${JSON.stringify(w)}`);
    say(m.line === `→ ${Math.round(e.minutes)} min` && m.cls === 'better', `flight time previews ${e.minutes} min, better: ${JSON.stringify(m)}`);
    say(t.line === '' && t.cls === '', `a top speed that reads the same says nothing: ${JSON.stringify(t)}`);
    say(over.length === 4, `the Power tab keeps its four readouts: ${over.map((r) => r.label).join(', ')}`);
    say(await page.evaluate('JSON.stringify(window.__ui.hangar.choice)') === choice0, `pointing chose nothing: ${choice0}`);
    await pointAt(page, null);
    const after = await page.evaluate(READ('.hangar-side'));
    say(JSON.stringify(after) === JSON.stringify(before), 'off the card, every line goes back');
    await closeHangar(page);

    console.log('2. the Cub\'s Parts tab: the pod and a three blade prop under the pointer');
    await openHangar(page, 'cub1400');
    await page.click('.hangar [data-key="tab-parts"]');
    await page.until("window.__ui.hangar.tab === 'parts'", 5000);
    await page.sleep(400);
    const spec0 = await page.evaluate(READ('.hangar-spec'));
    say(spec0.every((r) => !r.shown), 'the spec sheet shows no lines at rest');
    await pointAt(page, 'addon-pod');
    const pod = await page.evaluate(READ('.hangar-spec'));
    await picture(page, 'parts-pod-preview');
    const pw = byLabel(pod, 'Weight');
    const pl = byLabel(pod, 'Wing loading');
    const cubG = Math.round(powerBlock('cub1400', 'stock', POWER.cub1400[0].pack)[1] * 1000);
    say(pw.shown && pw.cls === 'worse' && pl.shown && pl.cls === 'worse' && /^→ \d+ g\/dm²$/.test(pl.line),
      `the pod: heavier and a higher wing loading than ${Math.round(cubG / (tuningFor('cub1400').area * 100))} g/dm², shown: ${JSON.stringify([pw, pl])}`);
    await pointAt(page, 'prop-11x7e-3');
    const prop = await page.evaluate(READ('.hangar-spec'));
    const tt = byLabel(prop, 'Thrust');
    say(tt.shown && tt.cls === 'better', `the three blade prop: more thrust to weight: ${JSON.stringify(tt)}`);
    await pointAt(page, null);
    const dirty = await page.evaluate("document.querySelector('.hangar-save, .hangar [data-key=\"save\"]') ? document.querySelector('.hangar-save, .hangar [data-key=\"save\"]').classList.contains('dirty') : null");
    say(dirty !== true, `nothing fitted by pointing (save not dirty: ${dirty})`);
    say((await page.evaluate(READ('.hangar-spec'))).every((r) => !r.shown), 'off the card, the spec sheet lines hide again');
    await closeHangar(page);

    console.log('3. the 7 inch: motor response, previewed');
    await openHangar(page, '7inch');
    if (await page.evaluate("window.__ui.hangar.tab !== 'power'")) {
      await page.click('.hangar [data-key="tab-power"]');
      await page.until("window.__ui.hangar.tab === 'power'", 5000);
    }
    const q0 = byLabel(await page.evaluate(READ('.hangar-side')), 'Motor response');
    say(q0.label === 'Motor response', 'the motor response reads');
    await pointAt(page, 'option-v2808-1500');
    const q1 = byLabel(await page.evaluate(READ('.hangar-side')), 'Motor response');
    await picture(page, 'quad-motor-preview');
    say(/^→ \d+ ms$/.test(q1.line) && q1.cls !== '', `a hotter motor previews its response: ${JSON.stringify(q1)}`);
    await closeHangar(page);

    const errs = page.errors.filter((x) => !x.startsWith('network:'));
    say(errs.length === 0, `no console error or exception${errs.length ? `: ${errs.join(' | ')}` : ''}`);
  } finally {
    await page.close();
  }
  if (failed) {
    console.log(`\nFAIL: ${failed}`);
    process.exit(1);
  }
  console.log('\nPASS: bench preview');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
