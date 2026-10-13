/*
 * smoke.js: one run through the whole game, boot to a finished war and a
 * reload, against a local rooms server this check starts and stops itself
 * (never the VM). COMPLETENESS 68.
 *
 *   npm run smoke            (local, not CI: it drives Chromium for minutes)
 *
 * 1. Boot on a fresh profile: the shell and the world come up, the save
 *    is opened at its version (src/share/save.js), and the flight's event
 *    log has begun (src/game/events.js).
 * 2. A private room on Itaipu, the drill started from the room screen
 *    (src/share/war/missions/itaipu-drill.js, the war the checks fly): the
 *    countdown, the pilot put in the air, the war live.
 * 3. A few seconds up on the throttle, then left alone, the drill plays to
 *    its end, won or lost, with the room's result for it, and the time
 *    flown is in the stored profile.
 * 4. A reload: the shell comes up again, the save opened clean, and the
 *    time flown in the drill is still in the profile. The room is not
 *    there to rejoin, by design: a room whose game is over is closed out
 *    the moment its last pilot leaves (edge/rooms/core.js emptied, the
 *    owner 2026-10-02), and a reload is a leave.
 * 5. No page error in either page load.
 *
 * The drill pays no stars (it is not one of Act 1's missions); the stars
 * of a real mission are campaign:check's.
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
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { openPage } from '../tests/lib/page.js';
import { startRooms } from '../edge/rooms/node.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { SAVE_VERSION, VERSION_KEY } from '../src/share/save.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
/* The drill's five rounds, alone and idle, with a margin; measured below
 * and printed, so a slower run shows before it times out. */
const WAR_END_MS = 15 * 60 * 1000;

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

/* A pilot who has answered the first questions, on the war's craft. */
const s = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, '7inch');
Object.assign(s, {
  map: 'itaipu', freestyleMap: 'itaipu', graphics: 'low', flightMode: 'angle', fpsCap: 0, airframeAsked: true, warConsent: true,
});
const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  if (!s.smokeSeeded) {
    Object.assign(s, ${JSON.stringify(s)}, { smokeSeeded: true });
    localStorage.setItem(k, JSON.stringify(s));
  }
} catch (e) { /* storage refused */ }`];

const dir = await mkdtemp(join(tmpdir(), 'smoke-'));
const server = await startRooms({ db: join(dir, 'rooms.db'), port: 0 });
const rooms = `http://127.0.0.1:${server.port}`;
console.log(`smoke: boot to a finished drill and a reload, rooms at ${rooms}`);
const page = await openPage({ root, url: `/index.html?rooms=${encodeURIComponent(rooms)}`, width: 1280, height: 720, seed });
const war = () => page.evaluate(`(() => {
  const w = window.__war();
  return { state: w.view.state, result: w.view.result ?? null, mission: w.view.mission ?? null };
})()`);

try {
  const t0 = Date.now();
  console.log('1. boot');
  await page.until('window.__shellReady === true', 300000);
  await page.until('window.__map && window.__map().ready', 600000);
  const booted = await page.evaluate(`({
    version: localStorage.getItem(${JSON.stringify(VERSION_KEY)}),
    events: window.__ui.progress.flight.events.map((e) => e.type),
  })`);
  check(`the save is opened at version ${SAVE_VERSION}`, booted.version === String(SAVE_VERSION), String(booted.version));
  check('the flight\'s event log has begun', booted.events[0] === 'spawned', booted.events.join());

  console.log('2. a private room, the drill started');
  const code = await page.evaluate("window.__roomCreate({ map: 'itaipu' })");
  await page.until("window.__rooms().phase === 'open' && window.__rooms().roomNow != null", 30000);
  check('a private room on Itaipu', /^[A-Z0-9]{6}$/.test(code), code);
  await page.evaluate("window.__ui.act('friends'); true");
  await page.sleep(500);
  await page.evaluate("window.__warDo('start', 'itaipu-drill')");
  await page.until("['countdown', 'live'].includes(window.__war().view.state)", 15000).catch(() => {});
  check('the drill counts down', ['countdown', 'live'].includes((await war()).state));
  await page.until("window.__craftState().mode === 'flight' && window.__ui.screen === 'flight'", 120000).catch(() => {});
  check('the pilot is put in the air', await page.evaluate("window.__craftState().mode === 'flight'"));
  await page.until("window.__war().view.state === 'live'", 120000).catch(() => {});
  check('the war goes live', (await war()).state === 'live');
  /* Up on the throttle for a few seconds and let go: a real flight, so
   * the profile has time in the air to keep across the reload. */
  await page.evaluate('window.__stick(0, 0, 0, 0.7); true');
  await page.sleep(6000);
  await page.evaluate('window.__stick(0, 0, 0, 0); true');
  await page.sleep(4000);
  await page.evaluate('window.__stick(); true');

  console.log('3. the drill to its end');
  const tLive = Date.now();
  await page.until("['won', 'lost'].includes(window.__war().view.state) && window.__war().view.result", WAR_END_MS).catch(() => {});
  const ended = await war();
  console.log(`   the drill took ${Math.round((Date.now() - tLive) / 1000)} s from live`);
  check('it ends, won or lost, with the room\'s result', ['won', 'lost'].includes(ended.state) && ended.result !== null,
    JSON.stringify(ended).slice(0, 200));
  const flown = () => page.evaluate(`(async () => {
    const { flightTotals } = await import('/src/share/flighttime.js');
    const s = JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}) || '{}');
    return flightTotals(s.flightTime).seconds;
  })()`);
  const flownBefore = await flown();
  check('the drill\'s flying time is in the profile', flownBefore > 0, `${flownBefore} s`);
  const errorsBefore = page.errors.filter((e) => !e.startsWith('network:'));

  console.log('4. a reload');
  await page.evaluate('window.__beforeReload = true; location.reload(); true');
  await page.until('window.__beforeReload !== true && window.__shellReady === true', 300000);
  /* The rejoin from this tab's session is tried and refused: give it the
   * time to settle before reading the phase. */
  await page.until("window.__rooms().phase !== 'connecting'", 30000).catch(() => {});
  const after = await page.evaluate(`({
    version: localStorage.getItem(${JSON.stringify(VERSION_KEY)}),
    same: localStorage.getItem(${JSON.stringify(`${SETTINGS_KEY}.prev`)}) === localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}),
    corrupt: localStorage.getItem(${JSON.stringify(`${SETTINGS_KEY}.corrupt`)}),
    room: window.__rooms().phase,
    reason: window.__rooms().reason,
  })`);
  check('the save opens clean: its version, backed up, nothing quarantined',
    after.version === String(SAVE_VERSION) && after.same && after.corrupt === null, JSON.stringify(after));
  const flownAfter = await flown();
  check('and the time flown before the reload is still there', flownAfter >= flownBefore, `${flownAfter} s vs ${flownBefore} s`);
  check('the finished war\'s room is closed, not rejoined', after.room === 'failed' && after.reason === 'nosuch', `${after.room} ${after.reason}`);

  console.log('5. no page error');
  const errs = page.errors.filter((e) => !e.startsWith('network:'));
  check('no page error before the reload', errorsBefore.length === 0, errorsBefore.slice(0, 3).join(' | '));
  check('nor after it', errs.length === errorsBefore.length, errs.slice(0, 3).join(' | '));
  console.log(`   ${Math.round((Date.now() - t0) / 1000)} s in all`);
} finally {
  await page.close();
  await server.stop();
  await rm(dir, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
