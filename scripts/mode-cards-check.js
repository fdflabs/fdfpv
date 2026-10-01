/*
 * mode-cards-check.js: the title's six cards, and the two room game
 * cards driven through the real shell the way a pilot drives them, against
 * a running rooms server (never the live one):
 *
 *   ROOMS_DB=/tmp/rooms.db PORT=8797 node edge/rooms/node.js
 *   SIM_GPU=1 node scripts/mode-cards-check.js http://127.0.0.1:8797 [outdir]
 *
 * Page A, 1280 by 720: six cards inside the window at 1280x720,
 * 1920x1080, 390x844, 360x640 and 844x390, tags clear of the command bar,
 * no sideways scroll, a picture of each. The arrows walk the row. Enter on
 * Toilet paper combat opens the room screen with the cursor on Make a
 * room; Enter opens it set up for combat, Enter makes one; the room screen leads with
 * the Game heading, all three games' rows on the first page, the combat
 * start row under the cursor. Page B joins by the Fly with friends card
 * and a typed code and reads what the room is set up for. Enter on A's
 * start row: the round counts down on both pages and A is in the air.
 *
 * Page C clicks Catch the Ace and makes a room; page D, a phone held
 * upright, walks the stacked cards with ArrowDown, taps Catch the Ace and
 * joins C's room by code. C's cursor is on Start Catch the Ace!, Enter,
 * and both pages count down to the go.
 *
 * THE ROOMS PANEL (the owner, 2026-09-30: "prominent place to choose rooms
 * right at the main page") is laid out with the cards at every size: in
 * the window, above the cards and clear of them, clear of the sign in
 * chip and the music dock. With a public room made on the server, page E
 * (1280 by 720) reads the count, walks Right off the last card onto the
 * room and joins it with Enter; page F, an upright phone, steps the pad
 * onto All rooms and chooses it, and clicks Make a room. A second room
 * carries a name of the full 32 letters, and no name, load or count in the
 * panel is cut, at 1280 by 720, 390 by 844, 360 by 640 and 844 by 390, nor
 * any value in the room list on the phone.
 *
 * THE UPDATE BAR (page G): a new version waiting puts it in the command
 * bar, clear of every card and the rooms panel at every size above. Up
 * from the first card puts the cursor on its Reload and lights it, and
 * Enter reloads the page; the pad's up and select do the same. In a room,
 * where the room bar asks for the reload instead, its button is a stop the
 * same way and Enter on it reloads.
 *
 * No page error on any page. Pictures in outdir, not in the repository.
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
const outDir = process.argv[3] || join(root, 'build', 'mode-cards');

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

const NAMES = 'Track mode,Free Flight,Fly with friends,Toilet paper combat,Catch the Ace!,Defend the Paraná';

/* The gate's cards as laid out, and the window with its command bar. */
const LAYOUT = `(() => ({
  w: window.innerWidth, h: window.innerHeight, sw: document.documentElement.scrollWidth,
  bar: document.querySelector('.frame-bot').getBoundingClientRect().top,
  cards: [...document.querySelectorAll('.screen-title .gate-card')].map((c) => {
    const r = c.getBoundingClientRect();
    const img = c.querySelector('.gate-card-shot');
    return {
      name: c.querySelector('.gate-card-name').textContent,
      on: c.classList.contains('on'),
      loaded: Boolean(img && img.complete && img.naturalWidth > 0),
      mark: Boolean(c.querySelector('.gate-card-mark svg')),
      box: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
      facts: Math.round(c.querySelector('.gate-card-facts').getBoundingClientRect().bottom),
    };
  }),
  panel: (() => {
    const n = document.querySelector('.screen-title .gate-rooms');
    if (!n || n.hidden) {
      return null;
    }
    const r = n.getBoundingClientRect();
    return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)];
  })(),
  chips: [...document.querySelectorAll('.signin-chip, .music-dock')].filter((n) => !n.hidden && n.getBoundingClientRect().width > 0).map((n) => {
    const r = n.getBoundingClientRect();
    return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)];
  }),
}))()`;

const apartBox = (a, b) => a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1];

/* The rooms panel: in the window, above every card and clear of it, and
 * clear of the chips that float over the page's corner. */
function panelLaidOut(v) {
  const p = v.panel;
  return Boolean(p) && p[0] >= 0 && p[1] >= 0 && p[2] <= v.w && p[3] <= v.h
    && v.cards.every((c) => p[3] <= c.box[1] && apartBox(p, c.box)) && v.chips.every((c) => apartBox(p, c));
}

function laidOut(v) {
  const c = v.cards;
  const inside = c.every((x) => x.box[0] >= 0 && x.box[1] >= 0 && x.box[2] <= v.w && x.box[3] <= v.h && x.facts <= v.bar);
  const apart = c.every((a, i) => c.slice(i + 1).every((b) => a.box[2] <= b.box[0] || b.box[2] <= a.box[0]
    || a.box[3] <= b.box[1] || b.box[3] <= a.box[1]));
  return c.length === 6 && inside && apart && v.sw <= v.w;
}

async function resize(page, width, height) {
  await page.cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: false,
  }, page.sessionId);
  await page.until(`window.innerWidth === ${width} && window.innerHeight === ${height}`, 10000);
  await page.sleep(600);
}

async function onCard(page) {
  return (await page.evaluate(LAYOUT)).cards.filter((c) => c.on).map((c) => c.name)[0] ?? null;
}

async function click(page, selector) {
  await page.loaded();
  const at = await page.evaluate(`(() => {
    const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  })()`);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await page.cdp.send('Input.dispatchMouseEvent', {
      type, x: at[0], y: at[1], button: 'left', clickCount: 1,
    }, page.sessionId);
  }
}

const HERE = '(() => { const it = window.__ui.items()[window.__ui.cursor]; return it ? [it.action, it.label] : []; })()';

/* The cursor onto the row with this action or label the way the arrows
 * move it, so a row the arrows cannot reach fails here. */
async function arrowTo(page, want) {
  for (let i = 0; i < 24; i += 1) {
    if ((await page.evaluate(HERE)).includes(want)) {
      return true;
    }
    await page.tap('ArrowDown');
    await page.sleep(120);
  }
  return false;
}

/* Whether the rows with these actions or labels are all drawn inside the
 * room screen's menu box, as it opened, without scrolling it. */
const ON_FIRST_PAGE = (wants) => `(() => {
  const ui = window.__ui;
  const box = ui.menuScrollNode().getBoundingClientRect();
  const items = ui.items();
  return ${JSON.stringify(wants)}.map((w) => {
    const i = items.findIndex((it) => it.action === w || it.label === w);
    const row = i >= 0 ? ui.menuRows[i - ui.rowOffset] : null;
    const r = row ? row.getBoundingClientRect() : null;
    return { w, seen: Boolean(r && r.top >= box.top - 1 && r.bottom <= box.bottom + 1) };
  });
})()`;

/* The cards, the room screen, the code: the part A and C share. */
async function makeRoom(page, name) {
  await page.until("window.__ui.screen === 'friends'", 10000).catch(() => {});
  const pre = await page.evaluate("({ screen: window.__ui.screen, game: window.__ui.roomGame, rows: window.__ui.items().map((it) => it.action || it.label), here: window.__ui.items()[window.__ui.cursor].action })");
  check(`${name}: the room screen, set up for its game, the cursor on Make a room`,
    pre.screen === 'friends' && pre.game && pre.here === 'roomnew', JSON.stringify(pre));
  await page.tap('Enter');
  /* Make a room (src/ui/roombrowser.js), its game already the card's,
   * the cursor on Make the room. */
  await page.until("window.__ui.screen === 'roomnew'", 10000).catch(() => {});
  const draft = await page.evaluate("({ here: window.__ui.items()[window.__ui.cursor].action, game: (window.__ui.items().find((it) => it.label === 'Game') || {}).value })");
  check(`${name}: Make a room, set up for the card's game, the cursor on Make the room`,
    draft.here === 'friends-make' && draft.game === (pre.game === 'tag' ? 'Catch the Ace' : 'Combat'), JSON.stringify(draft));
  await page.tap('Enter');
  await page.until("window.__rooms().phase === 'open' && window.__ui.items()[window.__ui.cursor].primary", 30000).catch(() => {});
  return (await page.evaluate('window.__rooms()')).code;
}

async function joinByCode(page, code) {
  check('the cursor reaches Join with a code', await arrowTo(page, 'friends-join'));
  await page.tap('Enter');
  await page.until("document.querySelector('.name-dialog-input') && !document.querySelector('.name-dialog').hidden", 10000).catch(() => {});
  await page.cdp.send('Input.insertText', { text: code.toLowerCase() }, page.sessionId);
  await page.tap('Enter');
  await page.until(`window.__rooms().phase === 'open' && window.__rooms().code === ${JSON.stringify(code)} && window.__rooms().peers.length >= 1`, 30000).catch(() => {});
}

const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;
console.log(`the room game cards, rooms at ${rooms}`);
const a = await openPage({ root, url, width: 1280, height: 720 });
const b = await openPage({ root, url, width: 1280, height: 720 });
const c = await openPage({ root, url, width: 1280, height: 720 });
const d = await openPage({ root, url, width: 390, height: 844 });
const pages = [a, b, c, d];
try {
  for (const p of pages) {
    await p.until('window.__shellReady === true', 300000);
    await p.until("window.__ui.onGate() && document.querySelectorAll('.screen-title .gate-card').length === 6", 60000);
    await p.until(`${LAYOUT}.cards.every((c) => c.loaded)`, 30000);
  }

  /* THE FIVE CARDS AT EVERY SIZE. */
  const first = await a.evaluate(LAYOUT);
  check('six cards, in order', first.cards.map((x) => x.name).join() === NAMES, first.cards.map((x) => x.name).join());
  check('each with its picture loaded and its mark drawn', first.cards.every((x) => x.loaded && x.mark));
  for (const [w, h, row] of [[1280, 720, true], [1920, 1080, true], [390, 844, false], [360, 640, false], [844, 390, true]]) {
    await resize(a, w, h);
    const v = await a.evaluate(LAYOUT);
    const tops = v.cards.map((x) => x.box[1]);
    const shape = row
      ? Math.max(...tops) - Math.min(...tops) <= 4
      : v.cards.every((x, i) => i === 0 || x.box[1] >= v.cards[i - 1].box[3]);
    check(`${w} by ${h}: six cards ${row ? 'in a row' : 'stacked'}, inside the window, tags clear of the bar, no sideways scroll`,
      laidOut(v) && shape, `${JSON.stringify(v.cards.map((x) => [...x.box, x.facts]))} bar ${v.bar} scroll ${v.sw}`);
    check(`${w} by ${h}: the rooms panel in the window without scrolling, above the cards, clear of them and of the corner chips`,
      panelLaidOut(v), `panel ${JSON.stringify(v.panel)} chips ${JSON.stringify(v.chips)} first card ${JSON.stringify(v.cards[0].box)}`);
    await shot(a, `gate-${w}x${h}`);
  }
  await resize(a, 1280, 720);

  /* THE KEYBOARD ALONG THE ROW. */
  await a.evaluate("(() => { window.__ui.setCursor(0); return true; })()");
  const walk = [await onCard(a)];
  for (let i = 0; i < 5; i += 1) {
    await a.tap('ArrowRight');
    await a.sleep(150);
    walk.push(await onCard(a));
  }
  for (let i = 0; i < 2; i += 1) {
    await a.tap('ArrowLeft');
    await a.sleep(150);
    walk.push(await onCard(a));
  }
  check('Right walks all six cards and Left steps back to combat', walk.join('>') === `${NAMES.split(',').join('>')}>Catch the Ace!>Toilet paper combat`, walk.join(' > '));

  /* TOILET PAPER COMBAT: A hosts by the keyboard. */
  await a.tap('Enter');
  const code = await makeRoom(a, 'Combat, by Enter');
  check('A makes a room', /^[A-Z0-9]{6}$/.test(code || ''), code);
  const hostRows = await a.evaluate(`window.__ui.items().map((it) => ({ a: it.action || null, l: it.label, s: Boolean(it.section), p: Boolean(it.primary) }))`);
  check('the room screen leads: Fly, then the Game heading set up for combat, combat first',
    hostRows[0].a === 'fly' && hostRows[1].s && /Toilet paper combat/.test(hostRows[1].l) && hostRows[2].l === 'Toilet paper combat',
    hostRows.slice(0, 4).map((r) => r.l).join(' | '));
  check('the combat start row is the primary, under the cursor',
    (await a.evaluate(HERE))[0] === 'friends-combat-5', (await a.evaluate(HERE)).join());
  const firstPage = await a.evaluate(ON_FIRST_PAGE(['friends-combat-5', 'Start Catch the Ace!', 'Race track']));
  check('all three games on the first page at 1280 by 720, no scrolling: combat start, Start Catch the Ace!, the race track',
    firstPage.every((x) => x.seen), JSON.stringify(firstPage));
  await shot(a, 'combat-host-room');

  /* B by the general card, and the code. */
  await click(b, '.gate-card-friends');
  await b.until("window.__ui.screen === 'friends'", 10000).catch(() => {});
  await joinByCode(b, code);
  await b.until(`window.__ui.items().some((it) => it.section && /Toilet paper combat/.test(it.label))`, 15000).catch(() => {});
  const joiner = await b.evaluate(`window.__ui.items().map((it) => ({ a: it.action || null, l: it.label, v: it.value || '', s: Boolean(it.section) }))`);
  check('B, joining, reads what the room is set up for, and combat waiting for the host',
    joiner.some((it) => it.s && /set up for Toilet paper combat/.test(it.l)) && joiner.some((it) => it.l === 'Combat' && /Not playing/.test(it.v)),
    joiner.slice(0, 5).map((r) => `${r.l}${r.v ? `=${r.v}` : ''}`).join(' | '));
  check('B\'s cursor is on Fly', (await b.evaluate(HERE))[0] === 'fly');
  await shot(b, 'combat-joiner-room');

  await a.tap('Enter');
  for (const p of [a, b]) {
    await p.until("['countdown', 'on'].includes(window.__combat().round.state)", 20000).catch(() => {});
  }
  const rounds = await Promise.all([a, b].map((p) => p.evaluate('window.__combat().round.state')));
  check('Enter on it starts the round: counting down on both pages', rounds.every((s) => s === 'countdown' || s === 'on'), rounds.join(' '));
  await a.until("window.__craftState().mode === 'flight'", 400000).catch(() => {});
  check('and A goes up with the countdown, one press from the room screen', await a.evaluate("window.__craftState().mode === 'flight'"));
  await a.sleep(1500);
  await shot(a, 'combat-countdown');

  /* CATCH THE ACE: C hosts by a click; D, a phone, joins. */
  await click(c, '.gate-card-ace');
  const aceCode = await makeRoom(c, 'Catch the Ace, by a click');
  check('C makes a room', /^[A-Z0-9]{6}$/.test(aceCode || ''), aceCode);
  check('Start Catch the Ace! is the primary, under the cursor', (await c.evaluate(HERE))[1] === 'Start Catch the Ace!', (await c.evaluate(HERE)).join());
  const acePage = await c.evaluate(ON_FIRST_PAGE(['Start Catch the Ace!', 'friends-combat-5', 'Race track']));
  check('and all three games on its first page too', acePage.every((x) => x.seen), JSON.stringify(acePage));
  await shot(c, 'ace-host-room');

  await d.evaluate("(() => { window.__ui.setCursor(0); return true; })()");
  const phone = [await onCard(d)];
  for (let i = 0; i < 4; i += 1) {
    await d.tap('ArrowDown');
    await d.sleep(150);
    phone.push(await onCard(d));
  }
  check('on the upright phone ArrowDown walks down the stack to Catch the Ace!', phone[phone.length - 1] === 'Catch the Ace!', phone.join(' > '));
  await click(d, '.gate-card-ace');
  await d.until("window.__ui.screen === 'friends'", 10000).catch(() => {});
  await joinByCode(d, aceCode);
  const dRoom = await d.evaluate('window.__rooms()');
  check('D joins C\'s room from the Catch the Ace card', dRoom.phase === 'open' && dRoom.code === aceCode && dRoom.seat === 2, `${dRoom.phase} ${dRoom.code} ${dRoom.seat}`);
  await d.until(`window.__ui.items().some((it) => it.section && /set up for Catch the Ace/.test(it.label))`, 15000).catch(() => {});
  check('and reads that it is set up for Catch the Ace!', await d.evaluate("window.__ui.items().some((it) => it.section && /set up for Catch the Ace/.test(it.label))"));
  await shot(d, 'ace-joiner-phone');

  await c.until("window.__ui.items()[window.__ui.cursor].label === 'Start Catch the Ace!'", 5000).catch(() => {});
  await c.tap('Enter');
  for (const p of [c, d]) {
    await p.until("['countdown', 'ace', 'hunter'].includes(window.__roomTag().role)", 60000).catch(() => {});
  }
  const roles = await Promise.all([c, d].map((p) => p.evaluate('window.__roomTag().role')));
  check('Enter on it starts the match: both pages count down to the go', roles.every((r) => ['countdown', 'ace', 'hunter'].includes(r)), roles.join(' '));
  await c.sleep(1500);
  await shot(c, 'ace-countdown');

  const errs = pages.flatMap((p) => p.errors).filter((e) => !e.startsWith('network:'));
  check('no page error on any page', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  for (const p of pages) {
    await p.close();
  }
}

/* THE ROOMS PANEL, driven. A public room with a name to find. */
const OPEN = `Open Club ${100 + Math.floor(Math.random() * 900)}`;
const made = await (await fetch(`${rooms}/v2/create`, {
  method: 'POST', headers: { origin: 'http://127.0.0.1', 'content-type': 'application/json' }, body: JSON.stringify({ map: 'swiss2', public: true, name: OPEN }),
})).json();
check('a public room is made for the panel to show', /^[A-Z0-9]{6}$/.test(made.code || ''), JSON.stringify(made));
/* The longest name a room can have (src/share/roomwire.js ROOM_NAME_MAX). */
const LONG = 'Sunday Morning Freestyle Session';
const madeLong = await (await fetch(`${rooms}/v2/create`, {
  method: 'POST', headers: { origin: 'http://127.0.0.1', 'content-type': 'application/json' }, body: JSON.stringify({ map: 'swiss2', public: true, name: LONG }),
})).json();
check('and one with a name of the full 32 letters', LONG.length === 32 && /^[A-Z0-9]{6}$/.test(madeLong.code || ''), JSON.stringify(madeLong));
/* The text in these nodes that the layout cuts: wider than its box. */
const CUT = (selector) => `[...document.querySelectorAll(${JSON.stringify(selector)})].filter((n) => n.getClientRects().length && n.scrollWidth > n.clientWidth + 1).map((n) => n.textContent.trim())`;
const PANEL_TEXT = '.gate-rooms-count, .gate-room-name, .gate-room-value';
const e = await openPage({ root, url, width: 1280, height: 720 });
const f = await openPage({ root, url, width: 390, height: 844 });
const PANEL = `(() => ({
  count: (document.querySelector('.gate-rooms-count') || {}).textContent || '',
  items: window.__ui.items().map((it, i) => ({ i, lobby: it.lobby || null, label: it.label, action: it.action || null })).filter((it) => it.lobby),
  on: [...document.querySelectorAll('.gate-room.on .gate-room-name')].map((n) => n.textContent),
}))()`;
const roomAction = `lobby:friends-room-${made.code}`;
try {
  for (const p of [e, f]) {
    await p.until('window.__shellReady === true', 300000);
    await p.until(`window.__ui.onGate() && window.__ui.items().some((it) => it.action === ${JSON.stringify(roomAction)}) && window.__ui.items().some((it) => it.label === ${JSON.stringify(LONG)})`, 60000).catch(() => {});
  }
  const panel = await e.evaluate(PANEL);
  check('the panel says how many rooms and pilots are flying', /\d+ rooms?, (\d+ pilots? flying|nobody flying yet)|open, nobody/.test(panel.count), panel.count);
  check('and lists the room, with All rooms and Make a room', panel.items.some((it) => it.action === roomAction && it.label === OPEN)
    && panel.items.some((it) => it.action === 'lobby:rooms') && panel.items.some((it) => it.action === 'lobby:roomnew'), JSON.stringify(panel.items));
  await shot(e, 'panel-1280x720');
  for (const [w, h] of [[1280, 720], [844, 390], [360, 640]]) {
    await resize(e, w, h);
    const cut = await e.evaluate(CUT(PANEL_TEXT));
    const v = await e.evaluate(LAYOUT);
    check(`${w} by ${h}: no room name, load or count in the panel is cut, the 32 letter name too`, cut.length === 0, cut.join(' | '));
    check(`${w} by ${h}: and with three rooms in it the panel and the cards still fit`, panelLaidOut(v) && laidOut(v),
      `panel ${JSON.stringify(v.panel)} cards ${JSON.stringify(v.cards.map((x) => [...x.box, x.facts]))} bar ${v.bar}`);
    await shot(e, `panel-rooms-${w}x${h}`);
  }
  await resize(e, 1280, 720);

  /* E, the keyboard: Right off the last card lands on the panel's first room. */
  const lastCard = await e.evaluate("window.__ui.items().findIndex((it) => it.card === 'campaign')");
  await e.evaluate(`(() => { window.__ui.setCursor(${lastCard}); return true; })()`);
  const walked = [];
  for (let i = 0; i < 6 && (await e.evaluate(HERE))[0] !== roomAction; i += 1) {
    await e.tap('ArrowRight');
    await e.sleep(150);
    walked.push((await e.evaluate(PANEL)).on.join());
  }
  check('Right from the last card walks onto the panel, lit as the cursor moves', (await e.evaluate(HERE))[0] === roomAction && walked.includes(OPEN),
    walked.join(' > '));
  await e.tap('Enter');
  await e.until(`window.__rooms().phase === 'open' && window.__rooms().code === ${JSON.stringify(made.code)}`, 30000).catch(() => {});
  check('Enter on it joins that room, on the room screen', await e.evaluate(`window.__rooms().code === ${JSON.stringify(made.code)} && window.__ui.screen === 'friends'`),
    await e.evaluate("JSON.stringify([window.__rooms().phase, window.__rooms().code, window.__ui.screen])"));

  /* F, an upright phone: the pad, then the mouse. */
  await shot(f, 'panel-390x844');
  const fCut = await f.evaluate(CUT(PANEL_TEXT));
  check('390 by 844: no room name, load or count in the panel is cut', fCut.length === 0, fCut.join(' | '));
  const fLast = await f.evaluate("window.__ui.items().findIndex((it) => it.card === 'campaign')");
  await f.evaluate(`(() => { window.__ui.setCursor(${fLast}); return true; })()`);
  const pad = (nav) => f.evaluate(`(() => { window.__ui.pollPad(${JSON.stringify(nav)}); window.__ui.pollPad({}); return true; })()`);
  for (let i = 0; i < 8 && (await f.evaluate(HERE))[0] !== 'lobby:rooms'; i += 1) {
    await pad({ down: true });
    await f.sleep(120);
  }
  check('the pad steps down off the last card onto All rooms', (await f.evaluate(HERE))[0] === 'lobby:rooms', (await f.evaluate(HERE)).join());
  /* Roll right chooses on the gate. The first poll after a screen change
   * only learns where the sticks are (pollPad), hence the retry. */
  for (let i = 0; i < 3 && !(await f.evaluate("window.__ui.screen === 'rooms'")); i += 1) {
    await pad({ right: true });
    await f.sleep(300);
  }
  check('and choosing it opens the lobby', await f.evaluate("window.__ui.screen === 'rooms'"), await f.evaluate('window.__ui.screen'));
  await f.until(`window.__ui.items().some((it) => it.action === ${JSON.stringify(roomAction.slice('lobby:'.length))})`, 15000).catch(() => {});
  check('which lists the room', await f.evaluate(`window.__ui.items().some((it) => it.action === ${JSON.stringify(roomAction.slice('lobby:'.length))})`));
  const lobbyCut = await f.evaluate(CUT('.screen-rooms .row-label, .screen-rooms .row-value'));
  check('and no room name or value in the list is cut on the phone ("Empty, closes in 4 min")', lobbyCut.length === 0, lobbyCut.join(' | '));
  await shot(f, 'panel-lobby-390x844');
  await f.tap('Escape');
  await f.tap('Escape');
  await f.tap('Escape');
  await f.until('window.__ui.onGate()', 10000).catch(() => {});
  await click(f, '.gate-room-make');
  await f.until("window.__ui.screen === 'roomnew'", 10000).catch(() => {});
  check('a click on Make a room opens Make a room', await f.evaluate("window.__ui.screen === 'roomnew'"), await f.evaluate('window.__ui.screen'));
  const errs = [e, f].flatMap((p) => p.errors).filter((x) => !x.startsWith('network:'));
  check('no page error on the panel\'s pages', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await e.close();
  await f.close();
}

/*
 * THE UPDATE BAR. A checkout has no version stamp, so nothing here can
 * see a deploy; the page is told one is out the way update.js tells it
 * (updateReady, then syncChips). Reload has to be a stop the keys and the
 * pad reach, and the bar has to sit in the command bar, not on a card.
 */
const g = await openPage({ root, url, width: 1280, height: 720 });
const BAR = `(() => {
  const r = (n) => { const b = n.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; };
  const bar = document.querySelector('.update-bar:not(.room-bar)');
  return { up: !bar.hidden, box: bar.hidden ? null : r(bar), frame: r(document.querySelector('.frame-bot')),
    lit: document.querySelector('.update-bar:not(.room-bar) .update-reload').classList.contains('on') };
})()`;
const updateUp = '(() => { window.__ui.updateReady = true; window.__ui.syncChips(); return true; })()';
const gPad = (nav) => g.evaluate(`(() => { window.__ui.pollPad(${JSON.stringify(nav)}); window.__ui.pollPad({}); return true; })()`);
try {
  await g.until('window.__shellReady === true', 300000);
  await g.until(`window.__ui.onGate() && window.__ui.items().some((it) => it.lobby === 'room')`, 60000).catch(() => {});
  await g.evaluate(updateUp);
  for (const [w, h] of [[1280, 720], [1920, 1080], [390, 844], [360, 640], [844, 390]]) {
    await resize(g, w, h);
    const v = await g.evaluate(LAYOUT);
    const bar = await g.evaluate(BAR);
    const b = bar.box;
    const inFrame = Boolean(b) && b[0] >= 0 && b[2] <= v.w && b[1] >= bar.frame[1] && b[3] <= bar.frame[3];
    const clear = Boolean(b) && v.cards.every((c) => apartBox(b, c.box)) && (!v.panel || apartBox(b, v.panel));
    check(`${w} by ${h}: the update bar is up in the command bar, clear of every card and the rooms panel`, inFrame && clear,
      `bar ${JSON.stringify(b)} frame ${JSON.stringify(bar.frame)} panel ${JSON.stringify(v.panel)}`);
    await shot(g, `update-bar-${w}x${h}`);
  }
  await resize(g, 1280, 720);

  /* The keyboard: Up from the first card wraps onto Reload, lit. */
  await g.evaluate('(() => { window.__ui.setCursor(0); return true; })()');
  await g.tap('ArrowUp');
  await g.sleep(150);
  check('Up from the first card puts the cursor on Reload, and lights it',
    (await g.evaluate(HERE))[0] === 'update-reload' && (await g.evaluate(BAR)).lit, (await g.evaluate(HERE)).join());
  await g.tap('ArrowDown');
  await g.sleep(150);
  check('and Down goes back to the first card, unlit', (await onCard(g)) === 'Track mode' && !(await g.evaluate(BAR)).lit);
  await g.tap('ArrowUp');
  await g.sleep(150);
  await g.evaluate('(() => { window.__beforeReload = true; return true; })()');
  await g.tap('Enter');
  await g.until('!window.__beforeReload && window.__shellReady === true', 300000).catch(() => {});
  check('Enter on it reloads the page', await g.evaluate('!window.__beforeReload && window.__shellReady === true'));

  /* The pad: up onto Reload, select reloads. */
  await g.until(`window.__ui.onGate()`, 60000).catch(() => {});
  await g.evaluate(updateUp);
  await g.evaluate('(() => { window.__ui.setCursor(0); return true; })()');
  await gPad({});
  await gPad({ up: true });
  await g.sleep(150);
  check('the pad\'s up from the first card lands on Reload too', (await g.evaluate(HERE))[0] === 'update-reload', (await g.evaluate(HERE)).join());
  await g.evaluate('(() => { window.__beforeReload = true; return true; })()');
  await gPad({ select: true });
  await g.until('!window.__beforeReload && window.__shellReady === true', 300000).catch(() => {});
  check('and select reloads', await g.evaluate('!window.__beforeReload && window.__shellReady === true'));

  /* In a room the room bar asks for the reload instead (src/main.js
   * roomBarView), and its button is a stop the same way. */
  await g.until(`window.__ui.onGate()`, 60000).catch(() => {});
  await g.evaluate(`(() => { window.__ui.act(${JSON.stringify(roomAction)}); return true; })()`);
  await g.until(`window.__rooms().phase === 'open' && window.__ui.screen === 'friends'`, 30000).catch(() => {});
  await g.evaluate(updateUp);
  await g.until("!document.querySelector('.room-bar').hidden && document.querySelector('.update-bar:not(.room-bar)').hidden", 5000).catch(() => {});
  await g.evaluate('(() => { window.__ui.setCursor(window.__ui.firstStop(window.__ui.items())); return true; })()');
  await g.tap('ArrowUp');
  await g.sleep(150);
  check('in a room, Up from the first row puts the cursor on the room bar\'s Reload, lit', (await g.evaluate(HERE))[0] === 'room-bar'
    && await g.evaluate("document.querySelector('.room-bar .update-reload').classList.contains('on')"), (await g.evaluate(HERE)).join());
  await g.evaluate('(() => { window.__beforeReload = true; return true; })()');
  await g.tap('Enter');
  await g.until('!window.__beforeReload && window.__shellReady === true', 300000).catch(() => {});
  check('and Enter on it reloads the page', await g.evaluate('!window.__beforeReload && window.__shellReady === true'));
  const gErrs = g.errors.filter((x) => !x.startsWith('network:'));
  check('no page error on the update bar\'s page', gErrs.length === 0, gErrs.slice(0, 3).join(' | '));
} finally {
  await g.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
