#!/usr/bin/env node
/*
 * interior-fly-check.js: `SIM_GPU=1 npm run interior:fly -- <outdir>`,
 * Mission 1 started from its card and flown on track WORLD's map against
 * a real rooms server (edge/rooms/node.js in process, missions in
 * development allowed, as a developer's server is). One headless page:
 *
 *   - The Interior's card, Mission 1's Play (a developer's page): a
 *     private room is made on the mission's map, the page is seated on it
 *     in the Bramor, and its start reaches the room
 *   - the room's match goes live at the first checkpoint and the pilot is
 *     in the air for it, on the Interior's map
 *   - the quiet HUD is up with the stage's launch card, the mission rule
 *     and a tutorial prompt
 *   - the map draws the room's contacts: the camp's people on their
 *     loops, from the room's view (not a demo)
 *   - a capture proposed on the rail is refused `frame`, not `pose` or
 *     `cam`: the room took this page's real pose and camera report
 *   - no page errors; pictures outside the repository
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { mkdtempSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outArg = process.argv[2];
if (!outArg) {
  throw new Error('interior-fly-check: name a folder for the pictures, outside the repository');
}
const outDir = resolve(outArg);
if (outDir === root || outDir.startsWith(`${root}/`)) {
  throw new Error(`interior-fly-check: ${outDir} is inside the repository; pictures go outside it`);
}
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

/* Seated elsewhere in another aircraft, so the card's seat is what puts
 * the page on the mission's map in the Bramor. The consent is given: its
 * own check is interior:debrief's. */
const seated = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'interceptor');
Object.assign(seated, {
  map: 'swiss2', graphics: 'low', graphicsAuto: false, fpsCap: 0, airframeAsked: true, interiorConsent: true,
});
const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, ${JSON.stringify(seated)});
  localStorage.setItem(k, JSON.stringify(s));
  localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
} catch (e) { /* storage refused */ }`];

const scratch = mkdtempSync(join(tmpdir(), 'fdfpv-interior-fly-'));
const { startRooms } = await import('../edge/rooms/node.js');
const server = await startRooms({ db: join(scratch, 'rooms.db'), port: 0, devMissions: true });
const rooms = `http://127.0.0.1:${server.port}`;
console.log(`Mission 1 on the Interior, rooms at ${rooms}`);
const page = await openPage({
  root, width: 1280, height: 720, url: `/index.html?rooms=${encodeURIComponent(rooms)}&missions=dev`, seed,
});
async function shot(name) {
  const r = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(outDir, name), Buffer.from(r.data, 'base64'));
}
try {
  await page.until('!!window.__shellReady', 300000);
  await page.until('window.__map && window.__map().ready', 400000);
  await page.evaluate('(window.__opsCampaign.open(), true)');
  await page.until("!!document.querySelector('.ops-campaign-box [data-mission=\"interior-1\"] .campaign-play:not(:disabled)')", 15000);
  await page.evaluate("(document.querySelector('[data-mission=\"interior-1\"] .campaign-play').click(), true)");
  await page.until("window.__rooms().phase === 'open' && window.__rooms().code != null", 60000).catch(() => {});
  const room = await page.evaluate("(() => { const r = window.__rooms(); return { code: r.code, public: r.public, map: window.__ui.settings.map, airframe: window.__ui.settings.airframe }; })()");
  check('Play makes a private room on the mission\'s map and seats the Bramor', room.code && room.public === false && room.map === 'interior' && room.airframe === 'bramor2300', JSON.stringify(room));
  await page.until("window.__ops.view().mission === 'interior-1' && window.__ops.view().state !== 'lobby'", 60000).catch(() => {});
  const started = await page.evaluate('(() => { const v = window.__ops.view(); return { state: v.state, mission: v.mission }; })()');
  check('the host\'s start reaches the room', started.mission === 'interior-1' && started.state !== 'lobby', JSON.stringify(started));
  await page.until("window.__ops.view().state === 'live'", 120000).catch(() => {});
  await page.until("window.__map().id === 'interior' && window.__map().ready && window.__craftState && window.__craftState().mode === 'flight'", 600000).catch(() => {});
  await page.sleep(3000);
  const live = await page.evaluate(`(() => {
    const v = window.__ops.view();
    return { state: v.state, stage: v.stage && v.stage.id, map: window.__map().id, mode: window.__craftState().mode, airframe: window.__ui.settings.airframe };
  })()`);
  check('the match is live at the first checkpoint and the pilot is in it on the Interior\'s map', live.state === 'live' && live.stage === 'M1_CP_START' && live.map === 'interior' && live.mode === 'flight', JSON.stringify(live));
  const hud = await page.evaluate('window.__opsHud()');
  check('the quiet HUD: the launch card, the mission rule, a tutorial prompt', hud.on && hud.cards.some((c) => c.text === 'ops.interior.m1.obj.launch') && /ENGAGEMENT NOT AVAILABLE/.test(hud.rule || '') && Boolean(hud.tutorial),
    JSON.stringify({ on: hud.on, cards: hud.cards, rule: hud.rule, tutorial: hud.tutorial }));
  const life = await page.evaluate("(() => { const i = window.__mapScene().userData.interior; return i && i.life ? i.life.stats() : null; })()");
  const contacts = await page.evaluate('window.__ops.view().contacts.length');
  check('the map draws the room\'s contacts (the camp\'s loops)', life && life.people > 0 && contacts > 0, JSON.stringify({ life, contacts }));
  await shot('interior-live-rail.png');
  /* The camera report goes two a second; give it one, then propose. */
  await page.sleep(1500);
  await page.evaluate("(window.__ops.proposeCapture('bridge'), true)");
  await page.until("/CAPTURE|POSITION|CAMERA/.test(window.__opsHud().say || '')", 10000).catch(() => {});
  const said = await page.evaluate('window.__opsHud().say');
  /* What the room holds of this seat, for the detail of a refusal. */
  const held = [...server.env.ROOMS.objects.values()].map((r) => r.host.core).filter((c) => c && c.ops && c.ops.match).map((c) => ({
    map: c.meta.map,
    seats: [...c.seats.values()].map((x) => ({ seat: x.seat, map: x.profile && x.profile.map })),
    tracks: [...c.ops.seats.entries()].map(([seat, rec]) => ({ seat, n: rec.track.s.length, ts: rec.track.s.slice(-12).map((x) => x.t), cams: rec.cams.map((x) => x.t).slice(-4) })),
    now: c.roomMs(Date.now()),
  }));
  const ok = /NOTHING TO CAPTURE IN FRAME/.test(said || '');
  const still = await page.evaluate('window.__ops.sent().filter((m) => m.op === "capture").slice(-1)[0]');
  check('a capture proposed on the rail is refused frame, not pose or cam: the room has this page\'s pose and camera', ok, ok ? said : `${said}; still ${JSON.stringify(still)}; room ${JSON.stringify(held)}`);
  const errs = page.errors.filter((e) => !e.startsWith('network:'));
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await page.close();
  await server.stop();
}
console.log(`\n${passed} passed, ${failed} failed (pictures in ${outDir})`);
process.exit(failed ? 1 : 0);
