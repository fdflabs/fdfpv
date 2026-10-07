/*
 * boot-entry-check.js: what the entry module (src/boot.js) hands the shell.
 *
 * The entry module decides, before main.js exists, which world the page
 * opens on and how the loading bar is weighted, and it is the one place a
 * link's ?map= and ?share= are read. Nothing else watched those choices as
 * a whole: the shell checks boot on a named map and see the result, never
 * the fallback for a stale id, a retired one, or a bare share link. So this
 * boots the real page once per kind of link and reads the outcome off the
 * page's own objects:
 *
 *   1. no query: the title opens on its own valley (swiss2) and the stored
 *      map is left alone.
 *   2. ?map=alps: that world, and the setting follows the link.
 *   3. ?map=<an id no map has>: the Track seat.
 *   4. ?share=<id> (with a map named too): the Track seat wins.
 *   5. ?map=city, retired, in Spanish: lands on the replacement world, and
 *      the question about it is asked in the stored language, which proves
 *      the string table was chosen before main.js ran.
 *
 * On every boot it also checks the loading plan (stage ids, their order and
 * the world stage's weight for the world chosen), the renderer stage's detail
 * line (the three.js release read from the import map), the controller being
 * one object under both its names, and the tab claiming the simulator's
 * window name.
 *
 * Run with npm run boot:entry (browser; use ~/.cache/run-check.sh).
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

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';
import { planStages } from '../src/ui/loading.js';
import { MAP_BUILD_MS } from '../src/maps/build-cost.js';
import { SIM_WINDOW } from '../src/share/windows.js';
import { LANG_KEY } from '../src/strings/index.js';
import es from '../src/strings/es.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const STAGES = ['three', 'board', 'sim', 'module', 'world', 'frame'];
const WAIT = 300000;

const html = readFileSync(join(root, 'index.html'), 'utf8');
const threeRelease = html.match(/three@0\.(\d+)\.0/)[1];

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) {
    failed += 1;
  }
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

/* The stored map is alps, so a boot that ignored the link would be told
 * apart from one that followed it. */
function seed(lang) {
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, { map: 'alps', graphics: 'low', graphicsAuto: false, airframeAsked: true });
    localStorage.setItem(k, JSON.stringify(s));
    ${lang ? `localStorage.setItem(${JSON.stringify(LANG_KEY)}, ${JSON.stringify(lang)});` : ''}
  } catch (e) { /* Storage refused; the boot runs on defaults and the rows say so. */ }`,
  /* Every value written to the controller's detail line, kept in order,
   * caught as the entry module publishes the controller. */
  `(() => {
    let held;
    window.__detailLog = [];
    Object.defineProperty(window, '__loading', {
      configurable: true,
      get() { return held; },
      set(o) {
        held = o;
        let d = o.detail;
        Object.defineProperty(o, 'detail', {
          configurable: true,
          get() { return d; },
          set(x) { d = x; window.__detailLog.push(x); },
        });
      },
    });
  })();`];
}

const CASES = [
  { name: 'no query', q: '', world: 'swiss2', setting: 'alps', plan: 'swiss2' },
  { name: '?map=alps', q: '?map=alps', world: 'alps', setting: 'alps', plan: 'alps' },
  { name: '?map=<unknown id>', q: '?map=nosuchworld', setting: 'track', plan: 'track' },
  { name: '?share=<id>', q: '?map=alps&share=boot-entry-check', setting: 'track', plan: 'track' },
  { name: '?map=city (retired), Spanish', q: '?map=city', lang: 'es', world: 'swiss2', setting: 'swiss2', plan: 'swiss2', retired: true },
];

/* BOOT_CASE=<index> boots one case alone, for diagnosing a single row. */
const only = process.env.BOOT_CASE;
for (const c of CASES.filter((_, i) => only == null || String(i) === only)) {
  console.log(`boot with ${c.name}`);
  const page = await openPage({ root, width: 1280, height: 720, url: `/index.html${c.q}`, seed: seed(c.lang) });
  try {
    await page.until('!!window.__shellReady', WAIT);
    const got = await page.evaluate(`({
      setting: window.__ui.settings.map,
      stages: window.__loading.stages.map((s) => ({ id: s.id, ms: s.ms, weight: s.weight })),
      details: window.__detailLog,
      sameObject: window.loader === window.__loading,
      windowName: window.name,
    })`);
    check('the setting follows the link', got.setting === c.setting, `got ${got.setting}, want ${c.setting}`);
    const want = planStages(STAGES, MAP_BUILD_MS[c.plan] ?? MAP_BUILD_MS.swiss2)
      .map((s) => ({ id: s.id, ms: s.ms, weight: s.weight }));
    check('the loading plan is the six stages weighted for the world chosen',
      JSON.stringify(got.stages) === JSON.stringify(want), JSON.stringify(got.stages.map((s) => `${s.id}:${s.ms}`)));
    const named = got.details.indexOf(`three.js r${threeRelease}`);
    check('the renderer stage names the three.js release, then clears',
      named >= 0 && got.details[named + 1] === '', JSON.stringify(got.details.slice(0, 3)));
    check('window.loader and window.__loading are one object', got.sameObject === true);
    check('the tab claims the simulator window name', got.windowName === SIM_WINDOW, got.windowName);
    if (c.world) {
      await page.until('window.__map && window.__map().ready', WAIT);
      const world = await page.evaluate('window.__map().id');
      check('the world built is the one the link resolves to', world === c.world, `got ${world}, want ${c.world}`);
    }
    if (c.retired) {
      /* textContent, not innerText: CSS uppercases the dialog's title. */
      const title = es['main.that_world_was_retired'];
      const shown = await page.until(`document.body.textContent.includes(${JSON.stringify(title)})`, 60000)
        .then(() => true, () => false);
      const box = await page.evaluate(`[...document.querySelectorAll('.name-dialog-box')].map((b) => b.innerText).join(' | ')
        + ' lang=' + document.documentElement.lang`);
      check('the retired world question is asked in the stored language', shown, shown ? title : box.slice(0, 200));
    }
  } catch (e) {
    check(`booted with ${c.name}`, false, e.message);
  } finally {
    await page.close();
  }
}

if (failed > 0) {
  console.log(`boot-entry-check: ${failed} FAILED`);
  process.exit(1);
}
console.log('boot-entry-check: ok');
