/*
 * save-notice-check.js: a broken save tells the pilot once, on screen, in
 * their language, what was put back and what starts fresh
 * (src/share/save.js saveNotice, shown by src/main.js at boot).
 *
 *     node scripts/save-notice-check.js      (npm run save:notice)
 *
 * Two headless pages, the broken blobs seeded before the app runs, once
 * per tab (a reload must find them as the first boot left them):
 *
 *   en: the settings blob truncated with a good .prev beside it. The
 *     notice names the settings as put back, the settings read the backup's
 *     values, and a reload says nothing.
 *   es: My Hangar's blob broken with no backup. The notice names it, in
 *     Spanish, as starting fresh, and a reload, the blob still broken,
 *     says nothing.
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

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';
import { BUILDS_KEY } from '../src/ui/builds.js';
import { LANG_KEY } from '../src/share/sharedkeys.js';
import en from '../src/strings/en.js';
import es from '../src/strings/es.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

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

/* The stored entries, written before the first boot of the tab only. */
const seedOnce = (entries) => `try {
  if (!sessionStorage.getItem('w43.seeded')) {
    sessionStorage.setItem('w43.seeded', '1');
    const entries = ${JSON.stringify(entries)};
    for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
  }
} catch (e) { /* storage refused: the check fails on the missing notice */ }`;

/* The notice on screen, or null. */
const NOTICE = `(() => {
  const box = window.__ui && window.__ui.nameDialog;
  const n = box && !box.hidden && box.querySelector('.name-dialog-box.notice');
  return n ? [...n.children].map((c) => c.textContent).join(' | ') : null;
})()`;

const fill = (text, parts) => text.replace('{parts}', parts);

const CASES = [
  {
    lang: 'en',
    entries: {
      [SETTINGS_KEY]: '{"musicLevel":0.2,"airframeAsked":true,',
      [`${SETTINGS_KEY}.prev`]: JSON.stringify({ musicLevel: 0.2, airframeAsked: true, graphics: 'low' }),
      'fdfpv.save.version': '4',
    },
    said: [en['save.notice_title'], fill(en['save.notice_restored'], en['save.part_settings']), en['save.notice_kept']],
    unsaid: [en['save.notice_lost'].split('{')[0]],
    kept: `window.__ui.settings.musicLevel === 0.2 && window.__ui.settings.graphics === 'low'`,
  },
  {
    lang: 'es',
    entries: {
      [LANG_KEY]: 'es',
      [BUILDS_KEY]: '{"v":1,"builds":[',
      'fdfpv.save.version': '4',
    },
    said: [es['save.notice_title'], fill(es['save.notice_lost'], es['save.part_builds']), es['save.notice_kept']],
    unsaid: [es['save.notice_restored'].split('{')[0]],
    kept: 'Array.isArray(window.__ui.myBuilds) && window.__ui.myBuilds.length === 0',
  },
];

for (const c of CASES) {
  console.log(c.lang);
  const page = await openPage({ root, width: 1280, height: 720, seed: [seedOnce(c.entries)] });
  try {
    await page.until('window.__shellReady === true', 300000);
    await page.until(`${NOTICE} !== null`, 30000).catch(() => {});
    const text = await page.evaluate(NOTICE);
    check('the notice is on screen', text !== null);
    for (const line of c.said) {
      check(`it says "${line}"`, Boolean(text && text.includes(line)), text ?? '');
    }
    for (const line of c.unsaid) {
      check(`and not "${line}"`, Boolean(text && !text.includes(line)));
    }
    check('what was kept reads as kept', await page.evaluate(c.kept));
    await page.sleep(400);
    await page.evaluate(`(() => { const b = window.__ui.nameDialog.querySelector('.name-dialog-box.notice button'); b.click(); return true; })()`);
    await page.until(`${NOTICE} === null`, 5000).catch(() => {});
    check('one press closes it', await page.evaluate(NOTICE) === null);
    /* The old document's marker gone is the new one booting. */
    await page.evaluate('window.__w43Old = true; location.reload(); true');
    await page.until('!window.__w43Old && window.__shellReady === true', 300000);
    await page.sleep(2000);
    check('a reload says nothing', await page.evaluate(NOTICE) === null);
    const errs = page.errors.filter((e) => !e.startsWith('network:'));
    check('no page error', errs.length === 0, errs.slice(0, 2).join(' | '));
  } finally {
    await page.close();
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
