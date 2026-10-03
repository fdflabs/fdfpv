/*
 * friends-card-check.js: flying with friends now the title has no Fly
 * with friends card (the owner, 2026-10-02: "delete the fly with
 * friends...every click will take you to the lobby for it"): a private
 * room, made from the title's rooms panel and joined by its code, driven
 * through the real shell the way a pilot drives it, against a running
 * rooms server:
 *
 *   ROOMS_DB=/tmp/rooms.db PORT=8797 node edge/rooms/node.js
 *   node scripts/friends-card-check.js http://127.0.0.1:8797 [outdir]
 *
 * Page A, 1280 by 720: five cards, no Fly with friends among them. The
 * panel's Make a room, one click, then private (Friends with the code) and
 * Make the room: A is in the room's lobby, free flight, its invite code
 * there to read out, Ready under the cursor. R: A flies, in the room.
 *
 * Page B, 390 by 844, a phone held upright: five cards stacked inside the
 * window, and at 360 by 640 and 844 by 390 too. The panel's All rooms, one
 * click, then Join with a code, a second, the code typed: B is in A's room
 * on seat 2, and in the air with A, the room's flight being on. Escape
 * keeps B in the room; its Leave is the title, out of it.
 *
 * No page error on either. Pictures in outdir, which is not in the
 * repository: a picture is evidence for one round.
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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { openPage } from '../tests/lib/page.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const rooms = process.argv[2] || 'http://127.0.0.1:8797';
const outDir = process.argv[3] || join(root, 'build', 'friends-card');

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

async function shot(page, name) {
  await mkdir(outDir, { recursive: true });
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  const path = join(outDir, `${name}.png`);
  await writeFile(path, Buffer.from(data, 'base64'));
  console.log(`  shot ${path}`);
}

/* The gate's cards as laid out: name, picture loaded, mark drawn, box. */
const CARDS = `(() => [...document.querySelectorAll('.screen-title .gate-card')].map((c) => {
  const r = c.getBoundingClientRect();
  const img = c.querySelector('.gate-card-shot');
  const facts = c.querySelector('.gate-card-facts').getBoundingClientRect();
  return {
    name: c.querySelector('.gate-card-name').textContent,
    on: c.classList.contains('on'),
    shot: img ? img.getAttribute('src') : null,
    loaded: Boolean(img && img.complete && img.naturalWidth > 0),
    mark: Boolean(c.querySelector('.gate-card-mark svg')),
    box: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
    factsBottom: Math.round(facts.bottom),
  };
}))()`;

/* The window, and the top of the command bar drawn over its foot. */
const VIEW = `({
  w: window.innerWidth, h: window.innerHeight, sw: document.documentElement.scrollWidth,
  bar: document.querySelector('.frame-bot').getBoundingClientRect().top,
})`;

/* Every card inside the window, and every card's tags, the last thing on
 * it, clear of the command bar. */
function inside(cards, view) {
  return cards.every((c) => c.box[0] >= 0 && c.box[1] >= 0 && c.box[2] <= view.w && c.box[3] <= view.h
    && c.factsBottom <= view.bar);
}

function apart(cards) {
  return cards.every((a, i) => cards.slice(i + 1).every((b) => a.box[2] <= b.box[0] || b.box[2] <= a.box[0]
    || a.box[3] <= b.box[1] || b.box[3] <= a.box[1]));
}

async function resize(page, width, height) {
  await page.cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: false,
  }, page.sessionId);
  await page.until(`window.innerWidth === ${width} && window.innerHeight === ${height}`, 10000);
  await page.sleep(500);
}

/* Put the cursor on the row with this action, or this label, the way the
 * arrows do, one press at a time, so a row the arrows cannot reach fails
 * here. */
async function arrowTo(page, want) {
  for (let i = 0; i < 16; i += 1) {
    const here = await page.evaluate('(() => { const it = window.__ui.items()[window.__ui.cursor]; return it ? [it.action, it.label] : []; })()');
    if (here.includes(want)) {
      return true;
    }
    await page.tap('ArrowDown');
    await page.sleep(120);
  }
  return false;
}

const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;
console.log(`a private room by its code, rooms at ${rooms}`);
const NAMES = 'Track mode,Free Flight,Toilet paper combat,Catch the Ace!,Defend the Paraná';
const IN_LOBBY = "window.__ui.screen === 'friends' && document.querySelector('.war-lobby') && !document.querySelector('.war-lobby').hidden";
const FLYING = "window.__craftState().mode === 'flight' && window.__ui.screen === 'flight'";
const a = await openPage({ root, url, width: 1280, height: 720 });
const b = await openPage({ root, url, width: 390, height: 844 });
try {
  for (const p of [a, b]) {
    await p.until('window.__shellReady === true', 300000);
    await p.until("window.__ui.onGate() && document.querySelectorAll('.screen-title .gate-card').length === 5", 60000);
    await p.until(`${CARDS}.every((c) => c.loaded)`, 30000);
  }

  /* THE GATE AT 1280 BY 720: five cards, no Fly with friends. */
  const cards = await a.evaluate(CARDS);
  const view = await a.evaluate(VIEW);
  check('five cards on the gate, no Fly with friends (the owner, 2026-10-02)', cards.map((c) => c.name).join() === NAMES, cards.map((c) => c.name).join());
  const tops = cards.map((c) => c.box[1]);
  check('side by side in one row, inside the window, tags clear of the bar, none overlapping, no sideways scroll',
    inside(cards, view) && apart(cards) && Math.max(...tops) - Math.min(...tops) <= 4 && view.sw <= view.w,
    `${JSON.stringify(cards.map((c) => [...c.box, c.factsBottom]))} bar at ${view.bar}`);
  await shot(a, 'a-1-gate');

  /* A: MAKE A ROOM, PRIVATE, FROM THE PANEL. */
  const aClicks = a.clicks;
  await a.click('.gate-room-make');
  await a.until("window.__ui.screen === 'roomnew'", 10000).catch(() => {});
  check(`one click on the panel's Make a room (${a.clicks - aClicks}) opens Make a room`, a.clicks - aClicks === 1 && await a.evaluate("window.__ui.screen === 'roomnew'"));
  check('the cursor reaches Who can join', await arrowTo(a, 'Who can join'));
  await a.tap('ArrowRight');
  await a.sleep(150);
  check('Right on it makes the room private', await a.evaluate("window.__ui.items()[window.__ui.cursor].value === 'Friends with the code'"));
  check('the cursor reaches Make the room', await arrowTo(a, 'friends-make'));
  await a.tap('Enter');
  await a.until(`window.__rooms().phase === 'open' && ${IN_LOBBY}`, 30000).catch(() => {});
  await a.sleep(800);
  const room = await a.evaluate('window.__rooms()');
  const rows = await a.evaluate("window.__ui.items().map((it) => ({ action: it.action || null, label: it.label }))");
  check('A is in the private room\'s lobby, free flight', room.phase === 'open' && room.public === false && room.mode === null
    && /Free flight/.test(await a.evaluate("(document.querySelector('.war-lobby-mission') || {}).textContent || ''")), JSON.stringify({ code: room.code, public: room.public, mode: room.mode }));
  check('its invite code there to read out, Ready under the cursor', rows.some((r) => r.action === 'friends-copy' && r.label === `Invite code: ${room.code}`)
    && await a.evaluate("window.__ui.items()[window.__ui.cursor].action === 'friends-lobby-ready'"), JSON.stringify(rows));
  await shot(a, 'a-2-private-lobby');
  await a.tap('KeyR');
  await a.until(FLYING, 400000).catch(() => {});
  const flying = await a.evaluate("({ mode: window.__craftState().mode, map: window.__map().id, phase: window.__rooms().phase })");
  check('R: five seconds, and A flies, in the Swiss valley, in the room', flying.mode === 'flight' && flying.map === 'swiss2' && flying.phase === 'open', JSON.stringify(flying));

  /* THE PHONE: five cards stacked, at three sizes. */
  for (const [w, h, row] of [[390, 844, false], [360, 640, false], [844, 390, true]]) {
    await resize(b, w, h);
    const c = await b.evaluate(CARDS);
    const v = await b.evaluate(VIEW);
    const laid = row
      ? Math.max(...c.map((x) => x.box[1])) - Math.min(...c.map((x) => x.box[1])) <= 4
      : c.every((x, i) => i === 0 || x.box[1] >= c[i - 1].box[3]);
    check(`${w} by ${h}: five cards ${row ? 'in a row' : 'stacked'} inside the window, tags clear of the bar, no sideways scroll`,
      c.length === 5 && laid && inside(c, v) && apart(c) && v.sw <= v.w,
      `${JSON.stringify(c.map((x) => [...x.box, x.factsBottom]))} bar at ${v.bar}, scroll ${v.sw}`);
    await shot(b, `b-0-gate-${w}x${h}`);
  }
  await resize(b, 390, 844);

  /* B: ALL ROOMS, JOIN WITH A CODE: two clicks, then the code. */
  const bClicks = b.clicks;
  await b.click('.gate-room-all');
  await b.until("window.__ui.screen === 'rooms'", 10000).catch(() => {});
  await b.evaluate(`(() => {
    const ui = window.__ui;
    const i = ui.items().findIndex((it) => it.action === 'friends-join');
    ui.menuRows[i - ui.rowOffset].dataset.check = 'join';
    return true;
  })()`);
  await b.click('[data-check="join"]');
  await b.until("document.querySelector('.name-dialog-input') && !document.querySelector('.name-dialog').hidden", 10000).catch(() => {});
  check(`All rooms, then Join with a code: ${b.clicks - bClicks} clicks to the code's form`, b.clicks - bClicks === 2
    && await b.evaluate("!document.querySelector('.name-dialog').hidden"));
  await b.cdp.send('Input.insertText', { text: room.code.toLowerCase() }, b.sessionId);
  await b.tap('Enter');
  await b.until("window.__rooms().phase === 'open' && window.__rooms().peers.length === 1", 30000).catch(() => {});
  const joined = await b.evaluate('window.__rooms()');
  check('the code typed on the phone joins A\'s room on seat 2', joined.phase === 'open' && joined.code === room.code && joined.seat === 2,
    `${joined.phase} ${joined.code} seat ${joined.seat}`);
  await b.until(FLYING, 400000).catch(() => {});
  check('and B flies, the room\'s flight being on', await b.evaluate(FLYING), await b.evaluate('window.__ui.screen'));
  await shot(b, 'b-1-phone-flying');

  /* ESCAPE KEEPS THE ROOM, LEAVE IS THE TITLE. */
  await b.tap('Escape');
  await b.sleep(600);
  await b.tap('Escape');
  await b.sleep(600);
  const kept = await b.evaluate("({ screen: window.__ui.screen, phase: window.__rooms().phase })");
  check('Escape keeps B in the room', kept.phase === 'open', JSON.stringify(kept));
  await b.evaluate("(() => { window.__ui.act('friends-leave'); return true; })()");
  await b.until("window.__ui.screen === 'title' && window.__rooms().phase === 'idle'", 10000).catch(() => {});
  const titled = await b.evaluate("({ screen: window.__ui.screen, phase: window.__rooms().phase })");
  check('Leave is the title, out of the room', titled.screen === 'title' && titled.phase === 'idle', JSON.stringify(titled));

  const errs = [...a.errors, ...b.errors];
  check('no page error on either page', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await a.close();
  await b.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
