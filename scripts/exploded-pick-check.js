/*
 * exploded-pick-check.js: the clickable exploded view (Wave 4 item 24,
 * docs/PARTS-WEAR.md), in the real shell, headless, with a real pointer.
 *
 *   1. The Skyhunter's Parts tab pulls the power system apart, as the
 *      Power tab does.
 *   2. Swept over the stage, the pointer finds the prop out of the model
 *      and the idle turn waits so it stays there; its card lights, and a
 *      click focuses the chosen prop's card on the Parts tab.
 *   3. The pack found the same way: a click goes to the Power tab and
 *      focuses the chosen pack's card. Nothing is chosen by either.
 * And no console error or uncaught exception.
 *
 *   node scripts/exploded-pick-check.js [outdir]   pictures into outdir
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
  if (!s.pickSeeded) {
    Object.assign(s, ${JSON.stringify(s)}, { pickSeeded: true });
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

const mouse = (page, type, x, y) => page.cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }, page.sessionId);

/* The pointer swept over the stage, every 8 px across the middle where
 * the model stands (the parts are small at the overview's distance),
 * until it is on `kind`; the idle turn waits while it is on a part, so it
 * stays there. The spot, or null. */
async function find(page, kind) {
  const r = await page.evaluate("(() => { const b = document.querySelector('.hangar-stage').getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height }; })()");
  for (let pass = 0; pass < 3; pass += 1) {
    for (let y = Math.round(r.t + r.h * 0.35); y < r.t + r.h * 0.75; y += 8) {
      for (let x = Math.round(r.l + r.w * 0.15); x < r.l + r.w * 0.85; x += 8) {
        await mouse(page, 'mouseMoved', x, y);
        await page.sleep(25);
        if (await page.evaluate('window.__ui.hangar.partUnder') === kind) {
          await page.sleep(400);
          if (await page.evaluate('window.__ui.hangar.partUnder') === kind) {
            return { x, y };
          }
        }
      }
    }
  }
  return null;
}

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
    await openHangar(page, 'sky1800');
    await page.click('.hangar [data-key="tab-parts"]');
    await page.until("window.__ui.hangar.tab === 'parts'", 5000);

    console.log('1. the Parts tab pulls it apart');
    await page.until("(() => { const e = window.__carouselStats().exploded; return Boolean(e) && e.amount > 0.95; })()", 10000).catch(() => {});
    const ex = await page.evaluate('window.__carouselStats().exploded');
    say(ex && ex.amount > 0.95, `exploded on the Parts tab: ${JSON.stringify(ex)}`);

    console.log('2. the pointer finds the prop, its card lights, a click goes to it');
    const choice0 = await page.evaluate('JSON.stringify(window.__ui.hangar.choice)');
    const prop = await find(page, 'prop');
    say(Boolean(prop), `the prop found under the pointer, held still there: ${JSON.stringify(prop)}`);
    if (prop) {
      const lit = await page.evaluate("[...document.querySelectorAll('.hangar-card.picked')].map((b) => b.dataset.key)");
      say(lit.length === 1 && lit[0] === 'prop-stock', `over the prop, its card lights: ${JSON.stringify(lit)}`);
      await mouse(page, 'mousePressed', prop.x, prop.y);
      await mouse(page, 'mouseReleased', prop.x, prop.y);
      await page.sleep(300);
      const a = await page.evaluate("({ tab: window.__ui.hangar.tab, key: document.activeElement && document.activeElement.dataset.key })");
      await picture(page, 'prop-clicked');
      say(a.tab === 'parts' && a.key === 'prop-stock', `a click on the prop focuses its card on the Parts tab: ${JSON.stringify(a)}`);
    }

    console.log('3. the pack: a click goes to the Power tab\'s card');
    const pack = await find(page, 'pack');
    say(Boolean(pack), `the pack found under the pointer: ${JSON.stringify(pack)}`);
    if (pack) {
      await mouse(page, 'mousePressed', pack.x, pack.y);
      await mouse(page, 'mouseReleased', pack.x, pack.y);
      await page.until("window.__ui.hangar.tab === 'power'", 5000).catch(() => {});
      await page.sleep(300);
      const b = await page.evaluate("({ tab: window.__ui.hangar.tab, key: document.activeElement && document.activeElement.dataset.key })");
      await picture(page, 'pack-clicked');
      say(b.tab === 'power' && b.key === 'pack-4s5000', `a click on the pack goes to the Power tab's pack card: ${JSON.stringify(b)}`);
    }
    say(await page.evaluate('JSON.stringify(window.__ui.hangar.choice)') === choice0, `nothing chosen by pointing or clicking: ${choice0}`);
    const errs = page.errors.filter((x) => !x.startsWith('network:'));
    say(errs.length === 0, `no console error or exception${errs.length ? `: ${errs.join(' | ')}` : ''}`);
  } finally {
    await page.close();
  }
  if (failed) {
    console.log(`\nFAIL: ${failed}`);
    process.exit(1);
  }
  console.log('\nPASS: exploded pick');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
