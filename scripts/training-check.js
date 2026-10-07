/*
 * training-check.js: Learn to fly driven through the real shell with a
 * real pointer (docs/TRAINING-DAMAGE-CONTRACT.md, item 18):
 *
 *   SIM_GPU=1 npm run training:check -- [outdir]   (build/training-check)
 *
 * Seated in the interceptor on the Swiss valley, the page clicks Flight
 * Club, then its Learn to fly card: the lessons page lists every lesson
 * under its track, none locked. Fly on Turns seats the Timber in
 * Stabilised on the valley, says the lesson in a toast and holds its
 * judge. In flight, put in the air by the dev hook, the judge reads the
 * craft's heading every frame (the turn steps count it). Pressing another
 * card ends the lesson. No page error. Pictures in outdir.
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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/settings.js';
import { LESSONS } from '../src/game/training.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = process.argv[2] || join(root, 'build', 'training-check');

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
}

async function shot(page, name) {
  await mkdir(outDir, { recursive: true });
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
}

/* A real pointer's click (tests/lib/page.js waits out the loader). */
async function click(page, selector) {
  if (!(await page.click(selector))) {
    throw new Error(`nothing to click at ${selector}`);
  }
}

const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, { map: 'swiss2', graphics: 'low', graphicsAuto: false, airframeAsked: true });
  localStorage.setItem(k, JSON.stringify(s));
  localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
  localStorage.setItem('webfpv.airhint.v2', '1');
} catch (e) { /* storage refused */ }`];

const page = await openPage({ root, width: 1280, height: 720, url: '/index.html?dev=1', seed });
try {
  await page.until('!!window.__shellReady', 300000);
  await page.until('window.__map && window.__map().ready', 400000);
  await page.until("window.__ui.onGate() && document.querySelector('.gate-card-hub-club')", 60000);
  await click(page, '.gate-card-hub-club .gate-card-name');
  await page.until("window.__ui.hub === 'club' && !!document.querySelector('.gate-card-training')", 15000).catch(() => {});
  const club = await page.evaluate("({ hub: window.__ui.hub, screen: window.__ui.screen, cards: [...document.querySelectorAll('.screen-title .gate-card')].map((c) => c.className) })");
  check('Flight Club opens on a click, Learn to fly among its cards', club.hub === 'club' && club.cards.some((c) => /gate-card-training\b/.test(c)), JSON.stringify(club));
  await page.sleep(400);
  await shot(page, 'club');
  await click(page, '.gate-card-training .gate-card-name');
  await page.until("!!document.querySelector('.training-box')", 15000).catch(() => {});
  const listed = await page.evaluate(`(() => {
    const box = document.querySelector('.training-box');
    if (!box) return null;
    return {
      tracks: [...box.querySelectorAll('h3')].map((n) => n.textContent),
      lessons: [...box.querySelectorAll('[data-lesson]')].map((n) => n.dataset.lesson),
      plays: [...box.querySelectorAll('[data-lesson] .campaign-play')].filter((b) => !b.disabled).length,
    };
  })()`);
  check('the Learn to fly card opens the lessons page, every lesson under its track', listed
    && listed.lessons.join() === LESSONS.map((l) => l.id).join() && listed.tracks.join() === 'First flight,Racing', JSON.stringify(listed));
  check('nothing on it is locked: every lesson has Fly', listed && listed.plays === LESSONS.length, JSON.stringify(listed));
  await shot(page, 'lessons');

  await click(page, '[data-lesson="first_turns"] .campaign-play');
  await page.until("window.__ui.settings.airframe === 'timber1500' && document.querySelector('.training-box') === null", 30000).catch(() => {});
  await page.until("window.__map && window.__map().ready && window.__map().id === 'swiss2'", 300000).catch(() => {});
  const seated = await page.evaluate(`(() => {
    const p = window.__ui.progress;
    return {
      airframe: window.__ui.settings.airframe, tune: window.__ui.settings.tune, map: window.__ui.settings.map,
      lesson: p.lesson ? p.lesson.lesson.id : null, toasts: p.log.map((t) => t.kicker + ': ' + t.title),
    };
  })()`);
  check('Fly on Turns seats the Timber in Stabilised on the valley and holds the lesson',
    seated.airframe === 'timber1500' && seated.tune === 'timber-stab' && seated.map === 'swiss2' && seated.lesson === 'first_turns', JSON.stringify(seated));
  check('and says the lesson in a toast', seated.toasts.includes('Lesson: Turns'), seated.toasts.join(' | '));
  await shot(page, 'seated');

  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  await page.sleep(1500);
  await page.evaluate('(() => { const s = window.__craftState(); window.__placeCraft(s.worldX, s.worldY + 40, s.worldZ); return true; })()');
  await page.sleep(2500);
  const judged = await page.evaluate(`(() => {
    const w = window.__ui.progress.lesson;
    return w ? { id: w.lesson.id, step: w.step, heading: w.heading, flew: w.flew } : null;
  })()`);
  check('in the air the judge reads the heading every frame', judged && judged.id === 'first_turns' && Number.isFinite(judged.heading), JSON.stringify(judged));
  await shot(page, 'flying');

  await page.evaluate("window.__ui.show('title'); true");
  await page.sleep(500);
  await page.evaluate("window.__ui.pickForWay('way-race-5inch'); true");
  await page.sleep(500);
  check('another card ends the lesson', await page.evaluate('window.__ui.progress.lesson === null'));
} catch (e) {
  check(`the run finished`, false, e.stack || String(e));
}
check('no page error', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
await page.close();
console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
