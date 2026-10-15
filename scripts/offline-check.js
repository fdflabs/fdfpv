/*
 * offline-check.js: the page with its servers cut off keeps flying solo,
 * says so once, and takes the rooms back when they answer again
 * (src/share/offline.js, COMPLETENESS item 11).
 *
 *     node scripts/offline-check.js      (npm run offline:check)
 *
 * A rooms server of its own (edge/rooms/node.js startRooms) and one
 * headless page told to use it, as the deployed site uses its own:
 *
 *   online: the room games are on the hubs.
 *   the device offline (Chromium's own network emulation, so
 *     navigator.onLine is false and every fetch fails): the pilot is told
 *     once, the room games leave the hubs, and the Free Flight and Track
 *     Day cards each reach a flight.
 *     Signed in, the account's sync sends nothing and says no failure.
 *   back online: told so, the room games back, and what changed offline
 *     is sent at once.
 *   the rooms server stopped, the device online: the Free Flight card's
 *     room cannot be made, and the same press flies solo.
 *   the server back on its port: after offline.js RETRY_MS the card's
 *     press makes the room again, and the pilot is told.
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

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { startRooms } from '../edge/rooms/node.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';
import { RETRY_MS } from '../src/share/offline.js';
import en from '../src/strings/en.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const scratch = await mkdtemp(join(process.env.TMPDIR || tmpdir(), 'offline-'));
const db = join(scratch, 'rooms.db');
let server = await startRooms({ db, port: 0 });
const { port } = server;
const rooms = `http://127.0.0.1:${port}`;

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

/* The account's progress sends, counted as they go out. */
const COUNT_SYNCS = `{
  const sent = window.fetch;
  window.__w43Syncs = 0;
  window.fetch = (url, init) => {
    if (String(url).includes('/api/account/progress') && init && init.method === 'PUT') window.__w43Syncs += 1;
    return sent(url, init);
  };
}`;
const seed = [COUNT_SYNCS, `try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, { graphics: 'low', graphicsAuto: false, sound: false, airframeAsked: true });
  localStorage.setItem(k, JSON.stringify(s));
} catch (e) { /* storage refused */ }`];

/* Everything the shell said, in order: each toast (progress-ui.js keeps
 * every one in its log, so none can be missed) and each notice line as
 * the page saw it. */
const RECORD = `(() => {
  window.__w43Said = [];
  let last = '';
  let toasts = window.__ui.progress.log.length;
  setInterval(() => {
    const log = window.__ui.progress.log;
    for (; toasts < log.length; toasts += 1) window.__w43Said.push(log[toasts].title);
    const n = window.__craftState().notice;
    if (n && n !== last) window.__w43Said.push(n);
    last = n;
  }, 50);
  return true;
})()`;
const SAID = 'window.__w43Said';
const DOWN = en['offline.down'];
const BACK = en['offline.back'];
const count = (said, text) => said.filter((t) => t === text).length;
const SYNC_FAILED = en['account.sync_failed'].split('{')[0];

/* Whether the shell offers rooms, and whether a room game's card is on
 * Flight Club's hub. */
const OFFER = `(() => {
  const ui = window.__ui;
  ui.act('mode-gate');
  return { rooms: ui.friendsItems().length > 0, combat: document.querySelector('.screen-title').textContent.includes(${JSON.stringify(en['combat.card'])}) };
})()`;

async function network(page, offline) {
  await page.cdp.send('Network.emulateNetworkConditions', {
    offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
  }, page.sessionId);
}

/* A card pressed, its aircraft chosen in the picker if one opens (solo),
 * and Fly: what the page then is. */
async function press(page, way, craft) {
  await page.evaluate(`(() => { window.__ui.act('mode-gate'); window.__ui.pickForWay('${way}'); return true; })()`);
  await page.until("window.__ui.carousel.isOpen || window.__rooms().phase === 'open'", 30000).catch(() => {});
  const solo = await page.evaluate('window.__ui.carousel.isOpen');
  if (!solo) {
    return { solo, phase: await page.evaluate('window.__rooms().phase'), screen: await page.evaluate('window.__ui.screen') };
  }
  await page.evaluate(`(() => {
    const c = window.__ui.carousel;
    c.setFilter('all');
    c.goTo(c.ids.indexOf(${JSON.stringify(craft)}));
    c.choose();
    return true;
  })()`);
  await page.sleep(800);
  /* Track Day's way in is My tracks: the first track on it, then its Fly
   * and the launch's Go, as a pilot presses them. */
  if (await page.evaluate("window.__ui.screen === 'courses'")) {
    await page.evaluate(`(() => {
      const ui = window.__ui;
      ui.setCursor(ui.items().findIndex((it) => it.course));
      ui.select();
      return true;
    })()`);
    await page.until('Boolean(window.__ui.cardSubject)', 10000).catch(() => {});
    await page.evaluate("(() => { window.__ui.act('card-fly'); return true; })()");
    await page.until("window.__ui.screen === 'launch' && window.__map().ready", 400000).catch(() => {});
    await page.evaluate("(() => { window.__ui.act('launch-go'); return true; })()");
  } else {
    await page.evaluate("(() => { window.__ui.act('fly'); return true; })()");
  }
  await page.until("window.__ui.screen === 'flight' && window.__craftState().mode === 'flight'", 400000).catch(() => {});
  await page.sleep(1500);
  const flown = await page.evaluate("({ screen: window.__ui.screen, mode: window.__craftState().mode, airframe: window.__ui.settings.airframe, phase: window.__rooms().phase })");
  await page.tap('Escape');
  await page.until("window.__ui.screen === 'paused'", 10000).catch(() => {});
  await page.evaluate("(() => { window.__ui.act('title'); return true; })()");
  await page.until("window.__ui.screen === 'title' && window.__map().ready", 400000).catch(() => {});
  await page.sleep(1000);
  return { solo, ...flown };
}

/* Signed in, so the account's sync is live (tests/lib/account.js). */
const page = await openPage({ root, url: `/index.html?rooms=${encodeURIComponent(rooms)}`, width: 1280, height: 720, seed, account: 'W43Offline' });
try {
  await page.until('window.__shellReady === true', 300000);
  await page.until('window.__ui.onGate()', 60000).catch(() => {});
  await page.evaluate(RECORD);
  await page.cdp.send('Network.enable', {}, page.sessionId);

  console.log('online');
  const on = await page.evaluate(OFFER);
  check('rooms are offered and the room games are on the hub', on.rooms && on.combat, JSON.stringify(on));

  console.log('the device offline');
  const errorsBefore = page.errors.length;
  await network(page, true);
  await page.until(`${SAID}.includes(${JSON.stringify(DOWN)})`, 10000).catch(() => {});
  check('the pilot is told', count(await page.evaluate(SAID), DOWN) === 1, JSON.stringify(await page.evaluate(SAID)));
  const off = await page.evaluate(OFFER);
  check('no rooms offered, the room games off the hub', !off.rooms && !off.combat, JSON.stringify(off));
  const free = await press(page, 'way-freestyle-wing1000', 'bramor2300');
  check('Free Flight flies solo', free.solo && free.screen === 'flight' && free.mode === 'flight' && free.phase === 'idle', JSON.stringify(free));
  const track = await press(page, 'way-race-5inch', 'bramor2300');
  const syncsOff = await page.evaluate('window.__w43Syncs');
  await page.evaluate("(() => { window.__ui.progress.setUnlockAll(!window.__ui.progress.state.unlockAll); return true; })()");
  const offSync = await page.evaluate('window.__accountSync()');
  await page.sleep(1500);
  check('the account\'s sync sends nothing and fails nothing', offSync === false && await page.evaluate('window.__w43Syncs') === syncsOff
    && !(await page.evaluate(SAID)).some((t) => t.startsWith(SYNC_FAILED)), JSON.stringify(await page.evaluate(SAID)));
  check('Track Day flies solo', track.solo && track.screen === 'flight' && track.mode === 'flight' && track.phase === 'idle', JSON.stringify(track));
  check('and the pilot was told once', count(await page.evaluate(SAID), DOWN) === 1, JSON.stringify(await page.evaluate(SAID)));

  console.log('back online');
  /* Offline, a file the page has not fetched yet cannot be (no service
   * worker, item 11's own scope): the Track Day tune's is one, said on
   * screen and left loud in the console by its reader (src/main.js
   * readTuneText). Those are listed, and nothing else may be. */
  const offlineErrors = page.errors.slice(errorsBefore);
  for (const e of offlineErrors) console.log(`  offline: ${e.split('\n')[0]}`);
  check('offline, the only page errors are fetches that could not go out',
    offlineErrors.every((e) => e.includes('TypeError: Failed to fetch') || e.includes('net::ERR_INTERNET_DISCONNECTED')), offlineErrors.slice(0, 2).join(' | '));
  page.errors.splice(errorsBefore);
  const syncsBack = await page.evaluate('window.__w43Syncs');
  await network(page, false);
  await page.until(`${SAID}.includes(${JSON.stringify(BACK)})`, 10000).catch(() => {});
  await page.until(`window.__w43Syncs > ${syncsBack}`, 10000).catch(() => {});
  check('what changed offline is sent at once, not on the minute', await page.evaluate('window.__w43Syncs') > syncsBack);
  check('the pilot is told', count(await page.evaluate(SAID), BACK) === 1, JSON.stringify(await page.evaluate(SAID)));
  const back = await page.evaluate(OFFER);
  check('rooms offered again, the room games back', back.rooms && back.combat, JSON.stringify(back));

  console.log('the rooms server stopped');
  await server.stop();
  const down = await press(page, 'way-freestyle-wing1000', 'bramor2300');
  check('the Free Flight card\'s press flies solo', down.solo && down.screen === 'flight' && down.phase === 'idle', JSON.stringify(down));
  check('the pilot is told', count(await page.evaluate(SAID), DOWN) === 2, JSON.stringify(await page.evaluate(SAID)));
  const gone = await page.evaluate(OFFER);
  check('the room games off the hub', !gone.rooms && !gone.combat, JSON.stringify(gone));

  console.log('the rooms server back');
  server = await startRooms({ db, port });
  await page.sleep(RETRY_MS + 1000);
  const again = await press(page, 'way-freestyle-wing1000', 'bramor2300');
  check('the card\'s press makes its room again', !again.solo && again.phase === 'open', JSON.stringify(again));
  check('the pilot is told', count(await page.evaluate(SAID), BACK) === 2, JSON.stringify(await page.evaluate(SAID)));

  const errs = page.errors.filter((e) => !e.startsWith('network:'));
  check('no page error', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await page.close();
  await server.stop();
  await rm(scratch, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
