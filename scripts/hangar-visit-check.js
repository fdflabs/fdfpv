/*
 * hangar-visit-check.js: read only hangar visits (docs/HANGAR-VISITS.md)
 * through the real shell and the real tracks server with sign in on. A
 * second account, Bravo, opens its hangar from Node with the requests its
 * own page would send; this page, Tester, walks in with a real pointer,
 * presses Visit, types the callsign, and walks round Bravo's hangar:
 * Bravo's room size, aircraft and trophies, no station but the door, which
 * goes home. Then Tester opens its own hangar with the command bar's
 * switch and the server answers for it, and closes it again.
 *
 *     SIM_GPU=1 node scripts/hangar-visit-check.js [OUT_DIR]
 *
 * Run with npm run hangar:visit, through ~/.cache/run-check-slot.sh here.
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

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openPage, keyInfo } from '../tests/lib/page.js';
import { LEVEL_XP } from '../src/game/progress.js';
import { TIER_LEVELS } from '../src/game/hangarroom.js';
import en from '../src/strings/en.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = process.argv[2] || join(tmpdir(), 'hangar-visit-check');
mkdirSync(out, { recursive: true });

let failed = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`);
  if (!ok) {
    failed += 1;
  }
}

const page = await openPage({ root, width: 1600, height: 900, url: '/index.html', account: 'Tester' });
const key = (type, code) => page.cdp.send('Input.dispatchKeyEvent', { type, ...keyInfo(code) }, page.sessionId);
const stats = () => page.evaluate('window.__walkStats()');
async function shot(name) {
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  writeFileSync(join(out, `${name}.png`), Buffer.from(data, 'base64'));
}
const visitStatus = async (callsign) => (await fetch(`${page.accounts.origin}/api/hangar/${encodeURIComponent(callsign)}`)).status;

try {
  /* Bravo: the airfield hangar's level, a red Cub, three firsts, open. */
  const bravo = await page.accounts.signUp(`visit-${process.pid}-${Date.now()}`, 'Bravo');
  const now = Date.now();
  await page.accounts.api('PUT', '/api/account/progress', {
    progress: {
      v: 1,
      data: {
        progress: { v: 2, xp: LEVEL_XP[TIER_LEVELS.airfield - 1], courses: {}, challenges: {}, seen: {}, casual: {}, firsts: { 'mission:m1:win': true, 'mission:m1:star1': true, 'lesson:hover': true }, lessons: {}, unlockAll: false },
        hangarVisit: { on: true, airframe: 'cub1400' },
        livery: { cub1400: { colours: { wing: '#c81e1e' } } },
      },
      stamps: { progress: now, hangarVisit: now, livery: now },
    },
  }, bravo.session);
  check('Bravo\'s hangar is open on the server', (await visitStatus('Bravo')) === 200, 'GET 200');

  await page.until('window.__shellReady === true', 300000);
  await page.loaded(60000);
  await page.evaluate('window.__ui.hub = null; window.__ui.show("title"); window.__ui.renderMenu(); true');
  await page.sleep(300);
  check('the Hangar hub card clicked', await page.click('.gate-card.gate-card-hub-hangar'), 'clicked');
  await page.until("window.__ui.hub === 'hangar'", 10000);
  check('Walk in clicked', await page.click('.gate-card.gate-card-hangar-walk'), 'clicked');
  await page.until("window.__ui.screen === 'walk' && window.__walkStats() && window.__walkStats().view", 20000);
  const own = await stats();

  /* A callsign nobody holds: the room stays home and says so. */
  check('Visit a hangar, clicked in the command bar', await page.click('.frame-legend .legend-act[data-action="walk-visit"]'), 'clicked');
  await page.until("Boolean(document.querySelector('.name-dialog:not([hidden]) .name-dialog-input'))", 10000);
  await page.cdp.send('Input.insertText', { text: 'Nobody Here' }, page.sessionId);
  await page.tap('Enter');
  await page.until("document.querySelector('.walk-prompt') && !document.querySelector('.walk-prompt').hidden && document.querySelector('.walk-prompt').dataset.station === 'flash'", 10000).then(() => true, () => false);
  const none = await page.evaluate("document.querySelector('.walk-prompt').textContent");
  check('nobody by that name: told so, still home', none.includes('Nobody Here') && !(await stats()).visit, JSON.stringify(none));

  check('Visit a hangar again', await page.click('.frame-legend .legend-act[data-action="walk-visit"]'), 'clicked');
  await page.until("Boolean(document.querySelector('.name-dialog:not([hidden]) .name-dialog-input'))", 10000);
  await page.cdp.send('Input.insertText', { text: 'bravo' }, page.sessionId);
  await page.tap('Enter');
  await page.until("window.__walkStats() && window.__walkStats().visit === 'Bravo' && window.__walkStats().view", 20000).then(() => true, () => false);
  await page.sleep(1000);
  const v = await stats();
  check('in Bravo\'s hangar: the airfield hangar, their level\'s size', v.visit === 'Bravo' && v.tier === 'airfield', `${v.visit} ${v.tier} (own was ${own.tier})`);
  check('with Bravo\'s three trophies', v.view.trophies === 3, `${v.view.trophies}`);
  check('and Bravo\'s aircraft on the stand', v.craft === 'cub1400', String(v.craft));
  const legend = await page.evaluate("document.querySelector('.frame-legend')?.textContent || ''");
  check('the command bar says whose hangar, and Home', legend.includes('Bravo') && legend.includes(en['walk.home']) && !legend.includes(en['walk.photo']), JSON.stringify(legend));
  await shot('01-visit');
  await page.tap('KeyP');
  await page.sleep(300);
  check('no photo mode in somebody else\'s hangar', !(await page.evaluate('Boolean(window.__ui.walk.photo)')), 'P ignored');
  /* Standing at the stand gives nothing: look, not touch. */
  const stand = v.stations.find((s) => s.id === 'stand');
  await page.evaluate(`(() => { const w = window.__ui.walk; w.pose = { ...w.pose, x: ${stand.x}, z: ${stand.z} }; return true; })()`);
  await page.sleep(300);
  check('at their stand, no prompt', await page.evaluate("document.querySelector('.walk-prompt').hidden"), 'hidden');
  await page.tap('Escape');
  await page.until("window.__walkStats() && !window.__walkStats().visit && window.__walkStats().view", 20000).then(() => true, () => false);
  const home = await stats();
  check('Escape goes home: own hangar, no visit', !home.visit && home.tier === own.tier, `${home.tier}`);

  /* Tester's own switch: open, the server answers for Tester; closed, 404. */
  check('Tester\'s hangar starts closed', (await visitStatus('Tester')) === 404, '404');
  check('the visits switch, clicked', await page.click('.frame-legend .legend-act[data-action="walk-visits"]'), 'clicked');
  let open = false;
  for (let k = 0; k < 40 && !open; k += 1) {
    await page.sleep(500);
    open = (await visitStatus('Tester')) === 200;
  }
  check('opened: the server lets others in, within seconds', open, String(open));
  const theirs = await (await fetch(`${page.accounts.origin}/api/hangar/Tester`)).json();
  check('showing Tester\'s seated aircraft', theirs.visit && theirs.visit.airframe === (await page.evaluate('window.__ui.settings.airframe')), JSON.stringify(theirs.visit && theirs.visit.airframe));
  check('the switch again', await page.click('.frame-legend .legend-act[data-action="walk-visits"]'), 'clicked');
  let closed = false;
  for (let k = 0; k < 40 && !closed; k += 1) {
    await page.sleep(500);
    closed = (await visitStatus('Tester')) === 404;
  }
  check('closed: 404 again', closed, String(closed));
  const errors = page.errors.filter((e) => !e.startsWith('network:'));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');
} finally {
  await page.close();
}
console.log(`pictures in ${out}`);
console.log(failed ? `${failed} failed` : 'all passed');
process.exitCode = failed ? 1 : 0;
