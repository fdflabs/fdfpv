/*
 * callouts-check.js: the trick callouts on the real shell, in English and
 * Spanish, at desktop and phone width (docs/TRICKS-CATALOG.md, PR 2).
 *
 *   node scripts/callouts-check.js [--out=DIR]
 *
 * Per language and width, with the Extra 330 seated in Free Flight and the
 * score off (the default):
 *   1. The Freestyle menu has the Trick callouts row, on.
 *   2. A judged loop, landed as the figure detector lands it, is called out
 *      in the overlay: the figure's name in the page's language, its grade
 *      word and number, its points; the score's total stays off.
 *   3. A chain of three figures shows the combo with its multiplier.
 *   4. The callouts stay in the left column: no row reaches the middle
 *      fifth of the screen, where the attitude cues are.
 *   5. With the setting off, nothing is called out.
 * Pictures go to the out directory (default ~/.cache/fdfpv-tricks).
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
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { LANG_KEY } from '../src/strings/index.js';
import { airframeById } from '../configs/airframes.js';
import en from '../src/strings/en.js';
import es from '../src/strings/es.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outArg = process.argv.find((a) => a.startsWith('--out='));
const out = outArg ? outArg.slice(6) : join(homedir(), '.cache/fdfpv-tricks');
await mkdir(out, { recursive: true });

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
}

const STRINGS = { en, es };
const SIZES = [['desktop', 1600, 900], ['phone', 390, 844]];
const FLYING = "window.__screen === 'flight' && window.__mode === 'flight'";

function seeds(lang) {
  const start = { airframe: 'interceptor', rates: airframeById('interceptor').rates };
  const seat = seatAirframe(start, 'extra3d1308');
  return [
    `try { localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
      localStorage.setItem(${JSON.stringify(LANG_KEY)}, ${JSON.stringify(lang)});
      const k = ${JSON.stringify(SETTINGS_KEY)};
      const s = JSON.parse(localStorage.getItem(k) || '{}');
      Object.assign(s, ${JSON.stringify(seat)});
      s.airframeAsked = true; s.map = 'swiss2'; s.graphics = 'low'; s.graphicsAuto = false;
      localStorage.setItem(k, JSON.stringify(s));
    } catch (e) { /* Storage refused: the app boots on its defaults. */ }`,
  ];
}

async function until(page, expr, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await page.evaluate(`Boolean(${expr})`).catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`timed out waiting for ${expr}`);
}

async function shot(page, name) {
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(out, `${name}.png`), Buffer.from(data, 'base64'));
}

/* What the overlay shows: its class, every row's text and box, the combo. */
const HUD = `(() => {
  const hud = document.querySelector('.score-hud');
  /* The layout box, not the painted one: the slam animation starts a row
   * 42 px left and scaled, and on a slow machine a snapshot lands
   * mid flight. Where the row rests is what can cover the cues. */
  const rows = [...document.querySelectorAll('.score-name')].map((r) => {
    const host = r.offsetParent ? r.offsetParent.getBoundingClientRect() : { left: 0 };
    const left = host.left + r.offsetLeft;
    return { text: r.textContent, cls: r.className, left, right: left + r.offsetWidth };
  });
  const total = document.querySelector('.score-total');
  const combo = document.querySelector('.score-combo');
  return {
    cls: hud ? hud.className : null,
    shown: Boolean(hud) && getComputedStyle(hud).display !== 'none',
    totalShown: Boolean(total) && getComputedStyle(total).display !== 'none',
    combo: combo && getComputedStyle(combo).display !== 'none' ? combo.textContent : null,
    rows, w: innerWidth, h: innerHeight,
  };
})()`;

const land = (id, grade) => `window.__trickLand({ name: 'fig:${id}', figure: '${id}', grade: ${grade}, execution: '${grade >= 6 ? 'CLEAN' : 'SLOPPY'}', turns: 0 })`;

for (const lang of ['en', 'es']) {
  const S = STRINGS[lang];
  for (const [size, width, height] of SIZES) {
    const tag = `${lang}-${size}`;
    const page = await openPage({ root, width, height, seed: seeds(lang) });
    try {
      await until(page, 'window.__shellReady && window.__ui');
      await page.evaluate("(() => { const ui = window.__ui; ui.firstRun = false; ui.craftGate = false; ui.mode = 'freestyle'; ui.show('title'); ui.renderMenu(); return true; })()");
      const row = await page.evaluate(`window.__ui.settings.trickCallouts === true && window.__ui.settings.freestyleScoring === 'off'`);
      check(`${tag}: callouts on and the score off by default`, row);
      await page.evaluate("window.__ui.onAction('fly')");
      await until(page, FLYING);
      await new Promise((r) => setTimeout(r, 1500));

      await page.evaluate(land('loop', 8.5));
      await new Promise((r) => setTimeout(r, 350));
      const one = await page.evaluate(HUD);
      await shot(page, `callout-${tag}-loop`);
      const want = S['aerobatic.loop'].toUpperCase();
      const word = S['aerobatic.grade_sharp'];
      const grade = lang === 'es' ? '8,5' : '8.5';
      const r0 = one.rows.at(-1);
      check(`${tag}: a judged loop is called out by name, grade word and points`, one.shown && r0
        && r0.text.toUpperCase().includes(want) && r0.text.includes(`${word} ${grade}`) && r0.text.includes('170'),
        r0 ? r0.text : JSON.stringify(one));
      check(`${tag}: the score's total stays off with the score off`, one.shown && !one.totalShown && /is-callouts/.test(one.cls), one.cls);

      /* One call, so the chain cannot bank between them however slowly
       * the machine runs the page. */
      /* The loop's combo banks first, so the chain below is exactly three. */
      await until(page, "getComputedStyle(document.querySelector('.score-combo')).display === 'none'", 20000);
      await page.evaluate(`${land('half_roll', 9)}; ${land('aileron_roll', 10)}; ${land('hammerhead', 5.5)}; true`);
      await new Promise((r) => setTimeout(r, 400));
      const three = await page.evaluate(HUD);
      await shot(page, `callout-${tag}-chain`);
      check(`${tag}: a chain of three shows the combo with its multiplier`, three.combo && /x\s*3/.test(three.combo), three.combo);
      const middle = [three.w * 0.4, three.w * 0.6];
      check(`${tag}: every callout stays left of the middle fifth (attitude cues)`, three.rows.length >= 3
        && three.rows.every((b) => b.right <= middle[0] && b.left >= 0),
        three.rows.map((b) => `${Math.round(b.left)}-${Math.round(b.right)}`).join(' ') + ` of ${three.w}`);
      const sloppy = three.rows.find((b) => /is-sloppy/.test(b.cls));
      check(`${tag}: a 5.5 hammerhead reads sloppy`, sloppy && sloppy.text.includes(S['aerobatic.grade_sloppy']), sloppy ? sloppy.text : 'none');

      await page.evaluate("(() => { window.__ui.settings.trickCallouts = false; window.__ui.syncScoreVisible(); return true; })()");
      await page.evaluate(land('loop', 9));
      await new Promise((r) => setTimeout(r, 300));
      const off = await page.evaluate(HUD);
      check(`${tag}: with the setting off nothing is called out`, !off.shown, off.cls);
      check(`${tag}: no console errors`, page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
    } catch (e) {
      check(`${tag}: ran`, false, e.message);
    } finally {
      await page.close();
    }
  }
}
console.log(`\ncallouts check: ${pass} passed, ${fail} failed; pictures in ${out}`);
process.exit(fail ? 1 : 0);
