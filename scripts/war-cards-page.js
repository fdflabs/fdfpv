/*
 * war-cards-page.js: First Light flown by one idle pilot on the real
 * shell, against a local rooms server with the missions in development
 * (never the VM). npm run war:cardspage [-- outdir]. What must hold: the
 * stage 1 objective (the scout, the craft put on it) settles and the HUD shows its card in the
 * lower third, a picture of it is written; the idle pilot is nudged
 * (CREST's "Closest to the dam", src/share/war/nudge.js, as a subtitle
 * with the sound off); no page error.
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

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { openPage } from '../tests/lib/page.js';
import { startRooms } from '../edge/rooms/node.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import EN from '../src/strings/en.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) || join(tmpdir(), 'war-cards'));
await mkdir(outDir, { recursive: true });

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
}

const s = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, '7inch');
Object.assign(s, {
  map: 'itaipu', freestyleMap: 'itaipu', graphics: 'low', flightMode: 'angle', fpsCap: 0, airframeAsked: true, warConsent: true,
});
const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, ${JSON.stringify(s)});
  localStorage.setItem(k, JSON.stringify(s));
} catch (e) { /* storage refused */ }`];

const dir = await mkdtemp(join(tmpdir(), 'war-cards-'));
/* devMissions: First Light is held in development (src/game/campaign.js). */
const server = await startRooms({ db: join(dir, 'rooms.db'), port: 0, devMissions: true });
const rooms = `http://127.0.0.1:${server.port}`;
const page = await openPage({ root, url: `/index.html?rooms=${encodeURIComponent(rooms)}`, width: 1280, height: 720, seed });
const hud = () => page.evaluate('JSON.stringify(window.__war().hud)').then(JSON.parse);

try {
  await page.until('window.__shellReady === true', 300000);
  await page.until('window.__map && window.__map().ready', 600000);
  await page.evaluate("window.__roomCreate({ map: 'itaipu' })");
  await page.until("window.__rooms().phase === 'open' && window.__rooms().roomNow != null", 30000);
  await page.evaluate("window.__ui.act('friends'); true");
  await page.sleep(500);
  await page.evaluate("window.__warDo('start', 'itaipu-1')");
  await page.until("window.__war().view.state === 'live'", 240000);
  check('First Light goes live', true);
  /* First the scout, the stage's objective, before its stage's 80 s run
   * out: the craft put on it until its warhead goes off, so the objective
   * settles done. */
  let card = null;
  let until = Date.now() + 70000;
  while (Date.now() < until && !card) {
    const h = await hud();
    if (h.cards.length) {
      card = h.cards[0];
      /* The card waits out the kill's SPLASH (warhud.js SPLASH_MS). */
      await page.sleep(3200);
      const r = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
      await writeFile(join(outDir, 'card.png'), Buffer.from(r.data, 'base64'));
      console.log(`  picture: ${join(outDir, 'card.png')} (${card}, objectives ${JSON.stringify(h.objectives)})`);
      break;
    }
    await page.evaluate(`(() => {
      const sc = window.__warAt(window.__rooms().roomNow).find((x) => x.kind === 'scout');
      if (sc) {
        window.__placeCraft(sc.p[0], sc.p[1] - 4, sc.p[2] + 6);
      }
      return true;
    })()`);
    await page.sleep(150);
  }
  /* Then idle: the nudge is for a pilot making no progress. */
  const subs = new Set();
  until = Date.now() + 150000;
  while (Date.now() < until && ![...subs].some((t) => t.includes('Closest to the dam'))) {
    const h = await hud();
    if (h.subtitle) {
      subs.add(h.subtitle);
    }
    await page.sleep(300);
  }
  check('the scout\'s objective settles and its card is shown', card === 'card.objective_done' || card === 'card.objective_failed', String(card));
  check('the card is in the string table', Boolean(card && EN[card]));
  check('the idle pilot is nudged toward the nearest threat', [...subs].some((t) => t.includes('Closest to the dam')), [...subs].join(' | '));
  const errs = page.errors.filter((e) => !e.startsWith('network:'));
  check('no page error', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await page.close();
  await server.stop();
  await rm(dir, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
