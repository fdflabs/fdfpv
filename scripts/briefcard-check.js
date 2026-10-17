#!/usr/bin/env node
/*
 * briefcard-check.js: `SIM_GPU=1 npm run briefcard:check -- <outdir> [--lang es] [--only id,id]`,
 * the mission brief card (src/ui/briefcard.js) through src/main.js on a
 * rooms server this check runs itself (edge/rooms/node.js, missions in
 * development allowed). For every playable mission, Itaipu 1 to 6 in a
 * room on Itaipu and Interior 1 to 3 in a room on the Interior, in turn:
 *
 *   - the host starts it with its film (the room's briefing), the film
 *     plays, and a 2 s hold skips it (the pilot has seen every cut: a
 *     first viewing is never cut) straight to the card, the room still in
 *     its briefing
 *   - the card has the mission's title and non empty situation,
 *     objectives, stars, threats and role, and a picture is kept
 *   - Space, the card's Deploy for the host, ends the briefing: the
 *     countdown, the card gone
 *
 * Then, on Itaipu 1, a guest page in the room: its Deploy shows READY on
 * the host's card beside the host's READING, and the host's Deploy starts
 * both. --lang es draws the cards in Spanish. The card's words for every
 * mission in both languages are scripts/briefcard-selftest.js's.
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
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { secondPage } from './lib/secondpage.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { FILMS as WAR_FILMS } from '../src/share/war/films/index.js';
import { FILMS as OPS_FILMS } from '../src/share/interior/films/index.js';
import { CARD_MISSIONS } from '../src/ui/briefcard.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i < 0 ? null : argv[i + 1];
};
const outArg = argv.find((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
if (!outArg) {
  throw new Error('briefcard-check: name a folder for the pictures, outside the repository');
}
const outDir = resolve(outArg);
if (outDir === root || outDir.startsWith(`${root}/`)) {
  throw new Error(`briefcard-check: ${outDir} is inside the repository; pictures go outside it`);
}
await mkdir(outDir, { recursive: true });
const LANG = flag('--lang') ?? 'en';
const ONLY = flag('--only') ? flag('--only').split(',') : CARD_MISSIONS;

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

/* Every film seen, so a hold skips it, and both campaigns consented. */
const films = Object.fromEntries([...Object.values(WAR_FILMS), ...Object.values(OPS_FILMS)].map((f) => [f.id, f.version]));
const seated = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'interceptor');
Object.assign(seated, {
  map: 'swiss2', graphics: 'low', graphicsAuto: false, fpsCap: 0, airframeAsked: true, warConsent: true, interiorConsent: true,
  campaign: {
    v: 1, missions: {}, earned: 0, owned: {}, equipped: { warhead: 'standard', speed: false }, films, flags: {}, wars: [],
  },
});
const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, ${JSON.stringify(seated)});
  localStorage.setItem(k, JSON.stringify(s));
  localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
} catch (e) { /* storage refused */ }`];

const scratch = mkdtempSync(join(tmpdir(), 'fdfpv-briefcard-'));
const { startRooms } = await import('../edge/rooms/node.js');
const server = await startRooms({ db: join(scratch, 'rooms.db'), port: 0, devMissions: true });
const rooms = `http://127.0.0.1:${server.port}`;
const query = `rooms=${encodeURIComponent(rooms)}&missions=dev&lang=${LANG}`;
console.log(`the mission brief card, ${LANG}, rooms at ${rooms}`);
const page = await openPage({
  root, width: 1280, height: 720, url: `/index.html?${query}`, seed,
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
/* The guest's window takes the focus: the host's page must not pause on
 * the blur it would hear (interior-coop-check does the same). */
await page.cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }, page.sessionId);
async function shot(p, name) {
  const r = await p.cdp.send('Page.captureScreenshot', { format: 'png' }, p.sessionId);
  await writeFile(join(outDir, name), Buffer.from(r.data, 'base64'));
}
/* The guest page has no DevTools input of its own (scripts/lib/
 * secondpage.js): its keys are dispatched in the page, which the film's
 * hold and the card both read from window. */
async function key(p, code, holdMs = 0) {
  if (!p.cdp) {
    const k = JSON.stringify({ code, key: code === 'Space' ? ' ' : 'q', bubbles: true });
    await p.evaluate(`(window.dispatchEvent(new KeyboardEvent('keydown', ${k})), true)`);
    await p.sleep(holdMs || 50);
    await p.evaluate(`(window.dispatchEvent(new KeyboardEvent('keyup', ${k})), true)`);
    return;
  }
  const k = code === 'Space' ? { code, key: ' ', windowsVirtualKeyCode: 32 } : { code, key: 'q', windowsVirtualKeyCode: 81 };
  await p.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...k }, p.sessionId);
  await p.sleep(holdMs || 50);
  await p.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...k }, p.sessionId);
}

/* Up in the room's world from its screen (its Fly), where a briefing
 * finds a pilot who flew before the host started: the film's hold reads
 * the flight screen's frames, a menu's being throttled. */
async function fly(p) {
  await p.evaluate("(() => { window.__ui.act('fly'); return true; })()");
  await p.until("window.__craftState().mode === 'flight'", 120000).catch(() => {});
}

const isOps = (id) => id.startsWith('interior-');
const VIEW = (id) => (isOps(id) ? 'window.__ops.view()' : 'window.__war().view');
let guest = null;
try {
  await page.until('!!window.__shellReady', 300000);
  await page.until('window.__map && window.__map().ready', 400000);
  let roomMap = null;
  for (const id of ONLY) {
    const map = isOps(id) ? 'interior' : 'itaipu';
    if (map !== roomMap) {
      roomMap = map;
      await page.evaluate(`window.__roomCreate({ map: ${JSON.stringify(map)} })`);
      await page.until(`window.__rooms().phase === 'open' && window.__rooms().roomNow != null && window.__map().id === ${JSON.stringify(map)} && window.__map().ready`, 400000).catch(() => {});
    }
    console.log(id);
    if ((await page.evaluate('window.__craftState().mode')) !== 'flight') {
      await fly(page);
    }
    await page.evaluate(isOps(id) ? `(window.__ops.start(${JSON.stringify(id)}), true)` : `(window.__warDo('brief', ${JSON.stringify(id)}), true)`);
    await page.until(`${VIEW(id)}.state === 'briefing' && ${VIEW(id)}.mission === ${JSON.stringify(id)}`, 30000).catch(() => {});
    await page.until('window.__warIntro() && window.__warIntro().t > 3000 && window.__warIntro().skippable', 240000).catch(() => {});
    /* Held with time left in the film, so the card comes from the skip
     * and not from the film's end: a film the room started late (its
     * world slow to build) leaves too little to tell them apart. */
    const film = await page.evaluate('(() => { const f = window.__warIntro(); return f ? { t: Math.round(f.t), ms: f.ms, skippable: f.skippable } : null; })()');
    check(`${id}: its film plays in the briefing, skippable (seen), at least 15 s of it left to skip`, Boolean(film && film.skippable && film.ms - film.t > 15000), JSON.stringify(film));
    await key(page, 'KeyQ', 2400);
    await page.until('window.__briefCard().shown', 15000).catch(() => {});
    await page.sleep(800);
    const card = await page.evaluate('window.__briefCard()');
    const at = await page.evaluate(`({ state: ${VIEW(id)}.state, filmLeft: ${VIEW(id)}.briefAt + ${film ? film.ms : 0} - window.__rooms().roomNow, orbit: Boolean(window.__warIntro() && window.__warIntro().orbit) })`);
    check(`${id}: the skipped film goes straight to the card, shown over the film's orbit before the film's end, the room still in its briefing`,
      card.shown && at.state === 'briefing' && at.filmLeft > 0 && at.orbit, JSON.stringify(at));
    const s = card.sections || {};
    check(`${id}: the card has its title and situation, objectives, stars, threats and role, none empty`, Boolean(card.title)
      && ['situation', 'objectives', 'stars', 'threats', 'role'].every((k) => s[k] > 0) && s.situation === 2, JSON.stringify({ title: card.title, s }));
    await shot(page, `card-${id}-${LANG}.png`);
    /* Replay film: the film again on this screen, the card hidden under
     * it, and back when it is over (here a hold skips it). */
    await page.evaluate("(document.querySelector('.briefcard button[data-act=\"replay\"]').click(), true)");
    await page.until("window.__warIntro() && !window.__warIntro().orbit && !window.__briefCard().shown", 15000).catch(() => {});
    const replay = await page.evaluate("({ for: window.__warIntro() && window.__warIntro().for, card: window.__briefCard().shown })");
    check(`${id}: Replay film plays the film again over the card's place`, Boolean(replay.for) && !replay.card, JSON.stringify(replay));
    await page.until('window.__warIntro() && window.__warIntro().t > 1500', 30000).catch(() => {});
    await key(page, 'KeyQ', 2400);
    await page.until('window.__briefCard().shown', 15000).catch(() => {});
    check(`${id}: and the card is back when it is over`, await page.evaluate(`window.__briefCard().shown && ${VIEW(id)}.state === 'briefing'`));
    await key(page, 'Space');
    await page.until(`${VIEW(id)}.state !== 'briefing' && !window.__briefCard().open`, 15000).catch(() => {});
    const after = await page.evaluate(`({ state: ${VIEW(id)}.state, card: window.__briefCard().open, status: window.__briefCard().status, seen: ${VIEW(id)}.seen, refusal: window.__war().error ?? null })`);
    check(`${id}: Space is the host's Deploy: the countdown, the card gone`, ['countdown', 'live'].includes(after.state) && !after.card, JSON.stringify(after));
    await page.evaluate(isOps(id) ? '(window.__ops.end(), true)' : "(window.__warDo('end'), true)");
    /* An ended match's debrief stays: the next start closes it, and its
     * Continue would leave the room for the title. */
    await page.until(`['ended', 'lobby'].includes(${VIEW(id)}.state)`, 15000).catch(() => {});
    await page.sleep(1500);
  }

  /* THE ROOM: a guest's Deploy on the host's card. */
  if (ONLY.includes('itaipu-1')) {
    if (roomMap !== 'itaipu') {
      await page.evaluate("window.__roomCreate({ map: 'itaipu' })");
      await page.until("window.__rooms().phase === 'open' && window.__map().id === 'itaipu' && window.__map().ready", 400000).catch(() => {});
    }
    if ((await page.evaluate('window.__craftState().mode')) !== 'flight') {
      await fly(page);
    }
    const code = await page.evaluate('window.__rooms().code');
    guest = await secondPage(page, outDir, { url: `/index.html?${query}&room=${code}`, seed });
    await guest.until('!!window.__shellReady', 300000);
    await guest.until("window.__rooms().phase === 'open' && window.__map().id === 'itaipu' && window.__map().ready", 400000).catch(() => {});
    await fly(guest);
    await page.evaluate("(window.__warDo('brief', 'itaipu-1'), true)");
    for (const p of [page, guest]) {
      await p.until('window.__warIntro() && window.__warIntro().t > 3000 && window.__warIntro().skippable', 240000).catch(() => {});
      await key(p, 'KeyQ', 2400);
      await p.until('window.__briefCard().shown', 15000).catch(() => {});
    }
    await guest.evaluate("(document.querySelector('.briefcard button[data-act=\"deploy\"]').click(), true)");
    await page.until("(window.__war().view.deployed || []).length === 1", 15000).catch(() => {});
    await page.sleep(800);
    const pilots = await page.evaluate('window.__briefCard().pilots');
    if (!pilots) {
      console.log(`  info  the host's card is shut: ${JSON.stringify(await page.evaluate("({ screen: window.__ui.screen, mode: window.__craftState().mode, war: window.__war().view.state, deployed: window.__war().view.deployed, intro: window.__warIntro() && window.__warIntro().orbit })"))}`);
    }
    const word = LANG === 'es' ? ['LISTO', 'LEYENDO'] : ['READY', 'READING'];
    check('a room: the guest\'s Deploy shows on the host\'s card, the guest READY and the host READING, the briefing on',
      Array.isArray(pilots) && pilots.length === 2 && pilots.some((x) => x.endsWith(word[0])) && pilots.some((x) => x.endsWith(word[1]))
      && (await page.evaluate("window.__war().view.state")) === 'briefing', JSON.stringify(pilots));
    await shot(page, `card-room-ready-${LANG}.png`);
    await key(page, 'Space');
    await guest.until("window.__war().view.state !== 'briefing' && !window.__briefCard().open", 15000).catch(() => {});
    const both = [await page.evaluate("window.__war().view.state"), await guest.evaluate("window.__war().view.state"), await guest.evaluate('window.__briefCard().open')];
    check('the host\'s Deploy starts everyone: the countdown on both, the guest\'s card gone', ['countdown', 'live'].includes(both[0]) && ['countdown', 'live'].includes(both[1]) && !both[2], JSON.stringify(both));
    const gErrs = guest.errors.filter((e) => !e.startsWith('network:'));
    check('no page errors on the guest', gErrs.length === 0, gErrs.slice(0, 3).join(' | '));
  }
  const errs = page.errors.filter((e) => !e.startsWith('network:'));
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await page.close();
  await server.stop();
  await rm(scratch, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed (pictures in ${outDir})`);
process.exit(failed ? 1 : 0);
