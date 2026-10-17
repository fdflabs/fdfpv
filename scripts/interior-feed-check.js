#!/usr/bin/env node
/*
 * interior-feed-check.js: `SIM_GPU=1 npm run interior:feed -- <outdir>`,
 * Mission 3's forward feed breaking up on the screen (src/share/ops/
 * feed.js, MISSIONS.md M3 stage 4). One headless page in the Bramor over
 * the command site, handed the room's views of Mission 3's relay stage
 * as interior:hud hands Mission 1's (rooms off):
 *
 *   - the recon role's pilot inside the command site's ring before the
 *     relay holds: the feed's snow is up over the picture
 *   - the relay held (the room's `relay: held` choice): the picture clears
 *   - another role flown there, or the next stage: no snow
 *   - the strike (MISSIONS.md 1.6): flying the strike role, a STRIKE
 *     button with its key; one press arms it (CONFIRM), the second sends
 *     the room's `strike`; flying another role, no button and no strike
 *   - no page errors; pictures outside the repository
 *
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

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { MISSIONS } from '../src/share/ops/missions.js';
import { docPosToThree } from '../src/render/frame.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outArg = process.argv[2];
if (!outArg) {
  throw new Error('interior-feed-check: name a folder for the pictures, outside the repository');
}
const outDir = resolve(outArg);
if (outDir === root || outDir.startsWith(`${root}/`)) {
  throw new Error(`interior-feed-check: ${outDir} is inside the repository; pictures go outside it`);
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

const M = MISSIONS['interior-3'];
const CMD = M.points.command.at;
const seated = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'bramor2300');
Object.assign(seated, {
  map: 'interior', graphics: 'low', graphicsAuto: false, fpsCap: 0, airframeAsked: true, wingView: 'ball', interiorConsent: true,
});
const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, ${JSON.stringify(seated)});
  localStorage.setItem(k, JSON.stringify(s));
  localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
} catch (e) { /* storage refused */ }`];

const page = await openPage({
  root, width: 1280, height: 720, url: '/index.html?rooms=off', seed,
});
async function shot(name) {
  const r = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(outDir, name), Buffer.from(r.data, 'base64'));
}
/* The room's view of Mission 3 in its relay stage, this page seat 1. */
const view = (over = {}) => ({
  state: 'live',
  id: 3,
  mission: 'interior-3',
  campaign: 'interior',
  goAt: 0,
  briefAt: null,
  f: 0,
  endAt: null,
  why: null,
  stage: {
    id: 'M3_CP_RELAY', n: 4, at: 1000, title: 'ops.interior.m3.s4', text: null, music: null, lockRoles: false,
  },
  cards: [],
  contacts: [],
  sites: {},
  captures: [],
  flags: {},
  choices: {},
  search: [],
  dials: {},
  roles: {
    defs: M.roles.map((r) => ({ id: r.id, core: r.core, guide: r.guide, platforms: r.platforms })),
    held: { 1: ['isr', 'recon', 'strike', 'relay'] },
    active: { 1: 'recon' },
    locked: false,
    beat: null,
    swaps: [],
  },
  ...over,
});
/* Whether the snow's canvas is over the picture, and the feed's level. */
const snow = () => page.evaluate(`(() => {
  const c = [...document.querySelectorAll('canvas[aria-hidden="true"]')].find((x) => x.width === 240 && x.height === 135);
  return { level: window.__ops.feed(), shown: Boolean(c) && c.style.display === 'block' };
})()`);

try {
  await page.until('!!window.__shellReady', 300000);
  await page.until('window.__map && window.__map().ready', 400000);
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight' && window.__map().ready", 400000);
  const at = { set(x, y, z) { this.v = [x, y, z]; return this; } };
  docPosToThree(CMD[0], CMD[1], 0, at);
  const ground = await page.evaluate(`window.__heightAt ? window.__heightAt(${at.v[0]}, ${at.v[2]}) : 330`);
  await page.evaluate(`(window.__placeCraft(${at.v[0]}, ${ground + 250}, ${at.v[2]}), true)`);
  await page.evaluate(`(window.__ops.welcome({ seat: 1, code: 'FEED00', ops: ${JSON.stringify(view())} }), true)`);
  await page.sleep(1200);
  const on = await snow();
  check('the recon over the command site before the relay holds: snow over the picture', on.level === M.feed.snow && on.shown, JSON.stringify(on));
  await shot('feed-lost-1280x720.png');
  await page.evaluate(`(window.__ops.inject({ type: 'ops', ops: ${JSON.stringify(view({ choices: { relay: 'held' } }))} }), true)`);
  await page.sleep(800);
  const held = await snow();
  check('the relay held: the picture clears', held.level === 0 && !held.shown, JSON.stringify(held));
  await shot('feed-stable-1280x720.png');
  const isr = view();
  isr.roles.active = { 1: 'isr' };
  await page.evaluate(`(window.__ops.inject({ type: 'ops', ops: ${JSON.stringify(isr)} }), true)`);
  await page.sleep(800);
  const other = await snow();
  check('the ISR there: no snow (the loss is the forward recon\'s)', other.level === 0 && !other.shown, JSON.stringify(other));
  await page.evaluate(`(window.__ops.inject({ type: 'ops', ops: ${JSON.stringify(view({ stage: { id: 'M3_CP_AIR_CONTACT', n: 5, at: 2000, title: 'ops.interior.m3.s5', text: null, music: null, lockRoles: false } }))} }), true)`);
  await page.sleep(800);
  const next = await snow();
  check('the next stage: no snow', next.level === 0 && !next.shown, JSON.stringify(next));

  /* The strike, on the strike role's screen in stage 2. */
  const s2 = { id: 'M3_CP_CONFIRMED_CONTACT', n: 1, at: 1000, title: 'ops.interior.m3.s2', text: null, music: null, lockRoles: false };
  const strikeCard = {
    id: 'strike', text: 'ops.interior.m3.obj.strike', tier: 'primary', state: 'active', roles: ['strike'], star: false,
  };
  const flying = (role) => {
    const v = view({ stage: s2, cards: [strikeCard] });
    v.roles.active = { 1: role };
    return v;
  };
  const hudNow = () => page.evaluate("(() => { const h = window.__opsHud(); return { strike: h.strike, say: h.say, rect: h.rects.strike, rects: h.rects }; })()");
  const strikes = () => page.evaluate("window.__ops.sent().filter((x) => x.op === 'strike').length");
  await page.evaluate(`(window.__ops.inject({ type: 'ops', ops: ${JSON.stringify(flying('isr'))} }), true)`);
  await page.sleep(1500);
  const offStrike = await hudNow();
  await shot('strike-isr-1280x720.png');
  check('flying the ISR: no STRIKE button', offStrike.strike === null, JSON.stringify(offStrike.strike));
  await page.evaluate('(window.__ops.strike(), window.__ops.strike(), true)');
  await page.sleep(300);
  check('and the key there sends nothing: only the strike aircraft can engage', (await strikes()) === 0 && /STRIKE AIRCRAFT/.test((await hudNow()).say || ''), (await hudNow()).say);
  await page.evaluate(`(window.__ops.inject({ type: 'ops', ops: ${JSON.stringify(flying('strike'))} }), true)`);
  await page.sleep(1500);
  const btn = await hudNow();
  await shot('strike-button-1280x720.png');
  const clashes = Object.entries(btn.rects).filter(([k, r]) => k !== 'strike' && r && btn.rect && r.x < btn.rect.x + btn.rect.w && btn.rect.x < r.x + r.w && r.y < btn.rect.y + btn.rect.h && btn.rect.y < r.y + r.h).map(([k]) => k);
  check('flying the strike role: STRIKE [2], on screen, clear of the other panels', btn.strike === 'STRIKE [2]' && btn.rect && btn.rect.x >= 0 && btn.rect.x + btn.rect.w <= 1281 && !clashes.length,
    JSON.stringify({ strike: btn.strike, rect: btn.rect, clashes }));
  await page.evaluate('(window.__ops.strike(), true)');
  await page.sleep(1200);
  const armed = await hudNow();
  await shot('strike-armed-1280x720.png');
  check('one press arms it: CONFIRM, nothing sent, the wider button still inside the window', /^CONFIRM STRIKE/.test(armed.strike || '') && (await strikes()) === 0
    && armed.rect && armed.rect.x >= 0 && armed.rect.x + armed.rect.w <= 1281, JSON.stringify({ strike: armed.strike, rect: armed.rect }));
  /* The arming lasts 4 s, longer than a loaded box may take for the
   * picture above: the sending pair is pressed back to back. */
  await page.sleep(4200);
  check('left alone, the arming lapses back to STRIKE', (await hudNow()).strike === 'STRIKE [2]' && (await strikes()) === 0);
  await page.evaluate('(window.__ops.strike(), window.__ops.strike(), true)');
  await page.sleep(400);
  const sent = await hudNow();
  check('two presses send the room one strike, and the button is back to STRIKE', (await strikes()) === 1 && sent.strike === 'STRIKE [2]' && sent.say === 'STRIKE SENT', JSON.stringify(sent));
  await shot('strike-sent-1280x720.png');
  check('no page errors', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
} finally {
  await page.close();
}
console.log(`\n${passed} passed, ${failed} failed (pictures in ${outDir})`);
process.exit(failed ? 1 : 0);
