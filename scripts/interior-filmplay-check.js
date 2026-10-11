#!/usr/bin/env node
/*
 * interior-filmplay-check.js: `SIM_GPU=1 npm run interior:filmplay -- <outdir>`,
 * The Interior's films as the screen plays them (docs/campaign/interior/
 * FILMS.md section 2, wired in src/main.js), against a real rooms server
 * (edge/rooms/node.js in process, missions in development allowed). One
 * headless page:
 *
 *   - PROLOGUE: the first press of The Interior's card stands the
 *     Interior's world up and plays `interior-prologue` over it, on the
 *     pilot's own screen, unskippable the first time; at its end the
 *     campaign's page opens, and a second press opens the page at once
 *   - INTRO: Mission 1's Play makes the room, whose briefing every screen
 *     plays as `int1-intro` over the Interior's map on the room's clock
 *     (from briefAt), held; it stops when the briefing ends and the pilot
 *     flies the match
 *   - OUTRO: on a win (the room's view turned won), `int1-outro` plays on
 *     the room's clock from endAt over the Interior, asking for the
 *     squad's stills (this pilot's own given, the rest null: the
 *     reconstruction), and the debrief opens when it is over
 *   - SEEN AND THE HOST'S SKIP: the intro watched to its end is told the
 *     room (`seen`); a second briefing with a pilot B who has not seen
 *     the cut: the host's line waits on B and the room refuses the skip
 *     ('unwatched'); once B has seen it the line offers the skip, and the
 *     host's hold ends the briefing for both (the countdown) (B is a
 *     second page in this one Chrome, scripts/lib/secondpage.js)
 *   - no page errors; pictures outside the repository
 *
 * The win is the room's view as a screen hears it, stood in for: a real
 * Mission 1 runs 20 to 30 minutes (ROOM's interior:stages flies it whole).
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

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outArg = process.argv[2];
if (!outArg) {
  throw new Error('interior-filmplay-check: name a folder for the pictures, outside the repository');
}
const outDir = resolve(outArg);
if (outDir === root || outDir.startsWith(`${root}/`)) {
  throw new Error(`interior-filmplay-check: ${outDir} is inside the repository; pictures go outside it`);
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

const scratch = mkdtempSync(join(tmpdir(), 'fdfpv-interior-filmplay-'));
const { startRooms } = await import('../edge/rooms/node.js');
const server = await startRooms({ db: join(scratch, 'rooms.db'), port: 0, devMissions: true });
const rooms = `http://127.0.0.1:${server.port}`;
console.log(`The Interior's films, rooms at ${rooms}`);
const page = await openPage({
  root, width: 1280, height: 720, url: `/index.html?rooms=${encodeURIComponent(rooms)}&missions=dev`, seed,
  /* A second pilot's page flies in this Chrome too: no tab of it may be
   * throttled as a background one. */
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
async function shot(name) {
  const r = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(outDir, name), Buffer.from(r.data, 'base64'));
}
const FILM = 'window.__warIntro()';
const CARD = "Boolean(document.querySelector('.ops-campaign-box')) && !document.querySelector('.name-dialog').hidden";
try {
  await page.until('!!window.__shellReady', 300000);
  await page.until('window.__map && window.__map().ready', 400000);

  /* PROLOGUE. */
  await page.evaluate('(window.__ops.openCampaign(), true)');
  await page.until(`${FILM} && ${FILM}.for === 'ops:interior-prologue'`, 600000).catch(() => {});
  await page.sleep(4000);
  const pro = await page.evaluate(`(() => { const f = ${FILM}; return f ? { for: f.for, map: window.__map().id, filmMap: f.map, skippable: f.skippable, shot: f.shot, card: ${CARD} } : null; })()`);
  check('the card\'s first press plays the prologue over the Interior\'s world, unskippable, before the page', pro && pro.for === 'ops:interior-prologue' && pro.map === 'interior' && pro.filmMap === 'interior' && pro.skippable === false && !pro.card, JSON.stringify(pro));
  await shot('films-prologue.png');
  await page.until(`!${FILM}`, 240000).catch(() => {});
  await page.until(CARD, 20000).catch(() => {});
  check('at its end the campaign\'s page opens', await page.evaluate(CARD));
  await page.evaluate("(document.querySelector('.ops-campaign-box .name-dialog-row button').click(), true)");
  await page.sleep(500);
  await page.evaluate('(window.__ops.openCampaign(), true)');
  await page.sleep(800);
  check('a second press opens the page at once (the prologue seen)', await page.evaluate(CARD) && !(await page.evaluate(FILM)));

  /* INTRO. */
  await page.evaluate("(document.querySelector('[data-mission=\"interior-1\"] .campaign-play').click(), true)");
  await page.until("window.__ops.view().state === 'briefing'", 60000).catch(() => {});
  await page.until(`${FILM} && ${FILM}.for === 'ops:int1-intro'`, 120000).catch(() => {});
  await page.sleep(3000);
  const intro = await page.evaluate(`(() => { const f = ${FILM}; const v = window.__ops.view(); return { state: v.state, briefAt: v.briefAt, now: window.__rooms().roomNow, film: f && f.for, map: window.__map().id, filmMap: f && f.map, title: f && f.title, ms: f && f.ms }; })()`);
  check('the room\'s briefing plays int1-intro over the Interior\'s map', intro.state === 'briefing' && intro.film === 'ops:int1-intro' && intro.map === 'interior' && intro.filmMap === 'interior', JSON.stringify(intro));
  check('on the room\'s clock: the briefing lasts the film', intro.ms > 30000 && intro.briefAt != null, `film ${intro.ms} ms`);
  await shot('films-intro.png');
  await page.until("window.__ops.view().state === 'live'", 150000).catch(() => {});
  await page.sleep(1500);
  const after = await page.evaluate(`({ state: window.__ops.view().state, film: ${FILM} ? ${FILM}.for : null, mode: window.__craftState().mode })`);
  check('when the briefing ends the film stops and the pilot flies the match', after.state === 'live' && after.film === null && after.mode === 'flight', JSON.stringify(after));

  /* SPOTTED (CONTRACT-SPOTTED.md): the room's spotted moment cuts the
   * screen to a wide orbit over the people, for the spotter's scene. */
  await page.evaluate(`(() => {
    const v = window.__ops.view();
    const now = window.__rooms().roomNow;
    const pair = ['a', 'b'].map((k) => ({ id: 'pair-' + k, kind: 'person', group: 'pair', route: 'conceal-west-' + k, t0: now - 120000, state: 'seen' }));
    window.__ops.inject({ type: 'ops', ops: { ...v, contacts: [...(v.contacts || []), ...pair], spot: { pair: { value: 1, level: 'spotted', at: { looking: now - 15000, spotted: now }, worst: { h: 120, off: 150, loud: false, seen: true }, advice: 'low' } } } });
    return true;
  })()`);
  await page.until(`${FILM} && ${FILM}.for === 'ops:spotted'`, 15000).catch(() => {});
  await page.sleep(2500);
  const cut = await page.evaluate(`(() => { const f = ${FILM}; return f ? { for: f.for, map: f.map, ms: f.ms } : null; })()`);
  check('spotted: the screen cuts to the end scene over the Interior', cut && cut.for === 'ops:spotted' && cut.map === 'interior', JSON.stringify(cut));
  const looks = (await page.evaluate('window.__ops.drawn()')).looks;
  check('the people are drawn in the world the cut looks at', looks.includes('pair-a:person') && looks.includes('pair-b:person'), JSON.stringify(looks));
  await shot('spotted-cut.png');
  await page.until(`!${FILM}`, 15000).catch(() => {});
  check('the end scene ends on its own after the scene\'s seconds', !(await page.evaluate(FILM)));

  /* OUTRO, on a win the screen hears. */
  await page.evaluate("window.__ops.addStill('bridge', 'clean', 1000)");
  await page.sleep(500);
  await page.evaluate(`(() => {
    const v = window.__ops.view();
    const now = window.__rooms().roomNow;
    window.__ops.inject({ type: 'ops', ops: { ...v, state: 'won', endAt: now, why: 'landed', captures: [{ item: 'bridge', seat: window.__ops.seat(), grade: 'clean', t: 1000, at: 1000 }], result: { won: true, stars: 0, starIds: [], flags: {}, restarted: null } } });
    return true;
  })()`);
  await page.until(`${FILM} && ${FILM}.for === 'ops:int1-outro'`, 30000).catch(() => {});
  const out = await page.evaluate(`(() => { const f = ${FILM}; return f ? { for: f.for, map: f.map, debrief: window.__debrief().open } : null; })()`);
  check('a win plays int1-outro over the Interior, the debrief waiting', out && out.for === 'ops:int1-outro' && out.map === 'interior' && !out.debrief, JSON.stringify(out));
  await page.until("Object.keys(window.__ops.filmAsked()).length > 0", 90000).catch(() => {});
  const asked = await page.evaluate('window.__ops.filmAsked()');
  check('it asks for the squad\'s stills: this pilot\'s own given, the others the reconstruction', asked.bridge === true && Object.entries(asked).filter(([k]) => k !== 'bridge').every(([, v]) => v === false), JSON.stringify(asked));
  await shot('films-outro.png');
  await page.until('window.__debrief().open', 150000).catch(() => {});
  check('the debrief opens when the outro is over', await page.evaluate('window.__debrief().open') && !(await page.evaluate(FILM)));
  await page.evaluate("(document.querySelector('.debrief button[data-act=\"continue\"]').click(), true)");

  /* SEEN AND THE HOST'S SKIP. The room heard this pilot's intro seen. */
  const filmV = await page.evaluate('window.__ops.view().film');
  const mine = await page.evaluate("window.__ui.settings.campaign && window.__ui.settings.campaign.films");
  const sent = await page.evaluate("window.__ops.sent().filter((m) => m.op === 'seen').slice(-1)[0] || null");
  check('the intro watched to its end is kept and told the room (seen)', filmV && mine && mine[filmV.id] >= filmV.version && sent && sent.films[filmV.id] >= filmV.version, JSON.stringify({ filmV, mine, sent }));
  /* A second briefing, with B, who has never seen the cut. The win above
   * was this screen's view stood in: the room's match runs on, so the
   * host ends it first (its debrief, closed). */
  const code = await page.evaluate('window.__rooms().code');
  await page.evaluate('(window.__ops.end(), true)');
  await page.until("window.__ops.view().state === 'ended'", 15000).catch(() => {});
  await page.sleep(800);
  await page.evaluate("(() => { const b = document.querySelector('.debrief button[data-act=\"continue\"]'); if (b) { b.click(); } return true; })()");
  await page.evaluate("(window.__ops.start('interior-1'), true)");
  await page.until("window.__ops.view().state === 'briefing'", 30000).catch(() => {});
  const B = await secondPage(page, outDir, {
    url: `/index.html?rooms=${encodeURIComponent(rooms)}&missions=dev&room=${code}`,
    seed: [seed[0].replace('interiorConsent":true', 'interiorConsent":true')],
  });
  await B.until('!!window.__shellReady', 300000);
  await page.until('Object.keys(window.__ops.view().roles.held).length === 2', 120000).catch(() => {});
  await page.sleep(1500);
  const wait = await page.evaluate("({ note: window.__opsHud().briefing, seen: window.__ops.view().seen, state: window.__ops.view().state })");
  check('the host\'s line waits on the pilot who has not seen the briefing', wait.state === 'briefing' && /Waiting: 1 pilot/.test(wait.note || ''), JSON.stringify(wait));
  await page.evaluate('(window.__ops.skipIntro(), true)');
  await page.sleep(800);
  const refused = await page.evaluate("({ note: window.__opsHud().briefing, state: window.__ops.view().state })");
  check('the host\'s skip is refused while a pilot has not seen it (unwatched): the briefing runs on', refused.state === 'briefing' && /Not everyone has seen/.test(refused.note || ''), JSON.stringify(refused));
  /* B has seen the cut (its store says so, as after a viewing). */
  await B.evaluate(`(() => {
    const c = window.__ui.settings.campaign || { v: 1 };
    window.__ui.settings.campaign = { ...c, films: { ...(c.films || {}), ${JSON.stringify(filmV.id)}: ${filmV.version} } };
    window.__ui.persistSettings();
    return true;
  })()`);
  await page.until(`window.__ops.view().seen.length === 2`, 30000).catch(() => {});
  await page.sleep(600);
  const ready = await page.evaluate("({ note: window.__opsHud().briefing, seen: window.__ops.view().seen })");
  const bSaid = await B.evaluate("({ films: window.__ui.settings.campaign && window.__ui.settings.campaign.films, sent: window.__ops.sent().filter((m) => m.op === 'seen'), seat: window.__ops.seat() })");
  check('once everyone has seen it, the host\'s line offers the skip', /hold to end it for everyone/.test(ready.note || ''), JSON.stringify({ ready, bSaid }));
  /* The host holds any key on the film (SKIP_HOLD_MS, 2 s). */
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyQ', key: 'q', windowsVirtualKeyCode: 81 }, page.sessionId);
  await page.sleep(2600);
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyQ', key: 'q', windowsVirtualKeyCode: 81 }, page.sessionId);
  await page.until("window.__ops.view().state !== 'briefing'", 15000).catch(() => {});
  const ended = await page.evaluate("window.__ops.view().state");
  const bState = await B.evaluate("window.__ops.view().state");
  check('the host\'s hold ends the briefing for both: the countdown', ['countdown', 'live'].includes(ended) && ['countdown', 'live'].includes(bState), `${ended} / ${bState}`);
  const bErrs = B.errors.filter((e) => !e.startsWith('network:'));
  check('no page errors on B', bErrs.length === 0, bErrs.slice(0, 3).join(' | '));
  const errs = page.errors.filter((e) => !e.startsWith('network:'));
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await page.close();
  await server.stop();
}
console.log(`\n${passed} passed, ${failed} failed (pictures in ${outDir})`);
process.exit(failed ? 1 : 0);
