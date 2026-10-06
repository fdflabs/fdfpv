#!/usr/bin/env node
/*
 * interior-coop-check.js: `SIM_GPU=1 npm run interior:coop -- <outdir>`,
 * two pilots flying The Interior's Mission 1 in one room on track WORLD's
 * map, against a real rooms server (edge/rooms/node.js in process,
 * missions in development allowed). ONE Chrome, two pages: the second is
 * a target in its own browser context (its own storage, so its own
 * settings and consent), so the check holds to one headless browser.
 *
 *   - A makes the room from the card (Play, private, the Bramor) and the
 *     mission starts
 *   - B joins by its link, seated in another aircraft and never having
 *     answered the Interior's consent: B is asked before being seated;
 *     on Continue B is in the room's match
 *   - roles: A holds the core role, B is dealt a tracker copy, and B is
 *     seated in its role's aircraft (the Bramor), not the one it flew
 *   - both pilots' camera reports reach the room (each seat's reports
 *     and poses held), and the room counts both
 *   - B, over the bridge with its ball locked on it, captures it: the
 *     room records it for B, and when the host ends the match A's debrief
 *     shows it as the squad's capture credited to B, with no picture (it
 *     stays on B's device)
 *   - C joins by the same link and says Back to the consent: out of the
 *     room to the title, nothing stored
 *   - no page errors on any page; pictures outside the repository
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

import { mkdtempSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { secondPage } from './lib/secondpage.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { MISSIONS, grounded, worldFor } from '../src/share/ops/missions.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outArg = process.argv[2];
if (!outArg) {
  throw new Error('interior-coop-check: name a folder for the pictures, outside the repository');
}
const outDir = resolve(outArg);
if (outDir === root || outDir.startsWith(`${root}/`)) {
  throw new Error(`interior-coop-check: ${outDir} is inside the repository; pictures go outside it`);
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

const seedOf = (over) => {
  const s = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'interceptor');
  Object.assign(s, {
    map: 'swiss2', graphics: 'low', graphicsAuto: false, fpsCap: 0, airframeAsked: true, ...over,
  });
  return `try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, ${JSON.stringify(s)});
  localStorage.setItem(k, JSON.stringify(s));
  localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
} catch (e) { /* storage refused */ }`;
};

const scratch = mkdtempSync(join(tmpdir(), 'fdfpv-interior-coop-'));
const { startRooms } = await import('../edge/rooms/node.js');
const server = await startRooms({ db: join(scratch, 'rooms.db'), port: 0, devMissions: true });
const rooms = `http://127.0.0.1:${server.port}`;
console.log(`two pilots on Mission 1, rooms at ${rooms}`);
const A = await openPage({
  root, width: 1280, height: 720, url: `/index.html?rooms=${encodeURIComponent(rooms)}&missions=dev`,
  seed: [seedOf({ interiorConsent: true })],
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
await A.cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }, A.sessionId);
const shotA = async (name) => {
  const r = await A.cdp.send('Page.captureScreenshot', { format: 'png' }, A.sessionId);
  await writeFile(join(outDir, name), Buffer.from(r.data, 'base64'));
};
/* The room's own record, read from the server in this process. */
const roomOf = () => [...server.env.ROOMS.objects.values()].map((r) => r.host.core).find((c) => c && c.ops && c.ops.match) ?? null;
const errsOf = (list) => list.filter((e) => !e.startsWith('network:'));

let B = null;
try {
  await A.until('!!window.__shellReady', 300000);
  await A.until('window.__map && window.__map().ready', 400000);
  await A.evaluate('(window.__opsCampaign.open(), true)');
  await A.until("!!document.querySelector('.ops-campaign-box [data-mission=\"interior-1\"] .campaign-play:not(:disabled)')", 15000);
  await A.evaluate("(document.querySelector('[data-mission=\"interior-1\"] .campaign-play').click(), true)");
  await A.until("window.__rooms().phase === 'open' && window.__rooms().code != null", 60000);
  const code = await A.evaluate('window.__rooms().code');
  await A.until("window.__ops.view().state === 'live'", 120000).catch(() => {});
  check('A makes the room from the card and the mission goes live', Boolean(code) && (await A.evaluate("window.__ops.view().state")) === 'live', code);

  /* B: its own context, in the interceptor, the consent never answered. */
  B = await secondPage(A, outDir, {
    url: `/index.html?rooms=${encodeURIComponent(rooms)}&missions=dev&room=${code}`,
    seed: [seedOf({ interiorConsent: false })],
  });
  await B.until('!!window.__shellReady', 300000);
  const CONSENT = "(() => { const d = document.querySelector('.name-dialog'); return d && !d.hidden && /invented region/.test(d.textContent); })()";
  await B.until(CONSENT, 180000).catch(() => {});
  const asked = await B.evaluate(`({ asked: ${CONSENT}, airframe: window.__ui.settings.airframe, flying: window.__craftState ? window.__craftState().mode : null, seat: window.__ops.seat() })`);
  check('B, joining by the link, is asked the Interior\'s consent before being seated', asked.asked && asked.airframe === 'interceptor' && asked.seat != null, JSON.stringify(asked));
  await B.sleep(700);
  await B.evaluate("(document.querySelector('.name-dialog .name-dialog-row button.on').click(), true)");
  await B.until("window.__ui.settings.interiorConsent === true && window.__ui.settings.airframe === 'bramor2300'", 30000).catch(() => {});
  await B.until("window.__map && window.__map().id === 'interior' && window.__map().ready && window.__craftState && window.__craftState().mode === 'flight'", 600000).catch(() => {});
  await B.sleep(3000);
  const seats = {
    a: await A.evaluate('window.__ops.seat()'),
    b: await B.evaluate('window.__ops.seat()'),
  };
  const rolesB = await B.evaluate('window.__ops.view().roles');
  const heldA = rolesB.held[seats.a] || [];
  const heldB = rolesB.held[seats.b] || [];
  check('roles: A holds the core role, B a tracker copy', heldA.includes('isr') && heldB.some((k) => String(k).startsWith('tracker')), JSON.stringify(rolesB.held));
  const bState = await B.evaluate("({ airframe: window.__ui.settings.airframe, flown: window.__ops.flown(), map: window.__map().id, mode: window.__craftState().mode, consent: window.__ui.settings.interiorConsent })");
  check('B is seated in its role\'s aircraft (the Bramor, not the interceptor it flew), on the Interior, in the air', bState.airframe === 'bramor2300' && bState.flown === 'bramor2300' && bState.map === 'interior' && bState.mode === 'flight' && bState.consent === true, JSON.stringify(bState));

  /* Both cameras at the room. */
  await B.sleep(2000);
  const core = roomOf();
  const held = core ? [...core.ops.seats.entries()].map(([seat, rec]) => ({ seat, poses: rec.track.s.length, cams: rec.cams.length })) : [];
  const has = (seat) => held.find((h) => h.seat === seat);
  check('both pilots\' poses and camera reports are held by the room', Boolean(core) && [seats.a, seats.b].every((s) => has(s) && has(s).poses > 0 && has(s).cams > 0), JSON.stringify(held));

  /* B over the bridge, its ball locked on it, captures it. */
  const W = worldFor('interior');
  const bridge = grounded(MISSIONS['interior-1'], W).items.find((x) => x.id === 'bridge').at;
  await B.evaluate(`(() => {
    const at = ${JSON.stringify(bridge)};
    window.__ui.settings.wingView = 'ball';
    window.__placeCraft(at[0] - 120, at[2] + 220, -(at[1] - 120));
    return true;
  })()`);
  await B.until('window.__ops.ball() && window.__ops.ball().on', 20000).catch(() => {});
  await B.evaluate(`(window.__ops.lockOn(${JSON.stringify(bridge)}), true)`);
  /* A camera report on the lock, and the hold. */
  await B.sleep(1300);
  await B.evaluate('(window.__ops.capture(), true)');
  await B.until("window.__ops.view().captures.some((c) => c.item === 'bridge')", 10000).catch(() => {});
  const capB = await B.evaluate("window.__ops.view().captures.find((c) => c.item === 'bridge') || null");
  const sayB = await B.evaluate('window.__opsHud().say');
  check('B\'s capture of the bridge is recorded by the room for B', capB && capB.seat === seats.b, JSON.stringify({ capB, sayB }));
  await B.shot('coop-b-ball-bridge.png');
  const capA = await A.evaluate("window.__ops.view().captures.find((c) => c.item === 'bridge') || null");
  check('and A\'s view has it, credited to B', capA && capA.seat === seats.b, JSON.stringify(capA));

  /* C joins by the same link and says Back to the consent: out of the
   * room to the title, never half in it. */
  const C = await secondPage(A, outDir, {
    url: `/index.html?rooms=${encodeURIComponent(rooms)}&missions=dev&room=${code}`,
    seed: [seedOf({ interiorConsent: false })],
  });
  await C.until('!!window.__shellReady', 300000);
  await C.until(CONSENT, 180000).catch(() => {});
  const cAsked = await C.evaluate(CONSENT);
  await C.sleep(700);
  await C.evaluate("(document.querySelector('.name-dialog .name-dialog-row button:not(.on)').click(), true)");
  await C.until("window.__rooms().phase === 'idle'", 20000).catch(() => {});
  await C.sleep(1500);
  const cOut = await C.evaluate("({ phase: window.__rooms().phase, screen: window.__ui.screen, consent: window.__ui.settings.interiorConsent === true })");
  const seatsNow = roomOf() ? roomOf().seats.size : null;
  check('C, asked and saying Back, leaves the room for the title, nothing stored, the room back to two pilots', cAsked && cOut.phase === 'idle' && cOut.screen === 'title' && !cOut.consent && seatsNow === 2,
    JSON.stringify({ cAsked, cOut, seatsNow }));
  const cErrs = errsOf(C.errors);

  /* The host ends the match: A's debrief. */
  await A.evaluate("(window.__ops.end ? window.__ops.end() : null, true)");
  await A.until('window.__debrief && window.__debrief().open', 20000).catch(() => {});
  const d = await A.evaluate('window.__debrief()');
  const f = d.frames.find((x) => x.id === 'bridge');
  check('A\'s debrief shows the bridge as the squad\'s capture, credited to B, no picture', d.open && f && f.kind === 'squad' && f.seat === seats.b && !f.image, JSON.stringify(f));
  await shotA('coop-a-debrief.png');
  const errs = [...errsOf(A.errors).map((e) => `A ${e}`), ...errsOf(B.errors).map((e) => `B ${e}`), ...cErrs.map((e) => `C ${e}`)];
  check('no page errors on any page', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await A.close();
  await server.stop();
}
console.log(`\n${passed} passed, ${failed} failed (pictures in ${outDir})`);
process.exit(failed ? 1 : 0);
