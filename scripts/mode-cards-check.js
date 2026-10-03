/*
 * mode-cards-check.js: the home's three hubs and Flight Club's four
 * cards, and the two room game cards driven through the real shell the way
 * a pilot drives them, against a running rooms server (never the live
 * one):
 *
 *   ROOMS_DB=/tmp/rooms.db PORT=8797 node edge/rooms/node.js
 *   SIM_GPU=1 node scripts/mode-cards-check.js http://127.0.0.1:8797 [outdir]
 *
 * Page A, 1280 by 720: home is three hubs, Operations, Flight Club and
 * the Hangar (docs/redesign/PLAN.md 2.2), each with a picture, a plan and
 * its activities as links, inside the window at 1280x720, 1920x1080,
 * 2560x1080, 390x844, 360x640 and 844x390. Enter on Flight Club opens
 * its four cards, laid out the same way with the rooms panel, the
 * breadcrumb naming the hub; Fly with friends is not one of them (the
 * owner, 2026-10-02). The arrows walk the row. Enter on Streamer Combat
 * is the one press into a combat lobby, a public room made for combat:
 * Ready under the cursor, no Fly, no other games. Page B clicks Streamer
 * Combat's link on home, one click, and is in A's lobby. Both ready: the
 * round counts down on both pages and A is in the air.
 *
 * Page C clicks Catch the Ace's link on home, one click, into its lobby;
 * page D, a phone held upright, opens Flight Club, walks the stacked cards
 * with ArrowDown and taps Catch the Ace into C's. Both ready, and both
 * pages count down to the go.
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
 * any value in the room list on the phone. Then two more rooms of 32
 * letter names, newest: at the same four sizes every name in the panel is
 * whole and the panel and cards still fit, an upright phone's panel
 * listing two.
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
import { seatPilot } from '../tests/lib/roompilot.js';

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

const HUBS = 'Flight Club,Operations,Hangar';
const NAMES = 'Track Day,Free Flight,Streamer Combat,Catch the Ace!';
/* Each hub's links, in order, as home draws them. */
const LINKS = 'Track Day,Free Flight,Streamer Combat,Catch the Ace!|Defend the Paraná|Aircraft,Customise,Calibrate sticks,How to fly';

/* The gate's cards as laid out, and the window with its command bar. */
const LAYOUT = `(() => ({
  w: window.innerWidth, h: window.innerHeight, sw: document.documentElement.scrollWidth,
  bar: document.querySelector('.frame-bot').getBoundingClientRect().top,
  crumb: (document.querySelector('.crumb') || {}).textContent || '',
  cards: [...document.querySelectorAll('.screen-title .gate-card')].map((c) => {
    const r = c.getBoundingClientRect();
    const img = c.querySelector('.gate-card-shot');
    return {
      name: c.querySelector('.gate-card-name').textContent,
      on: c.classList.contains('on'),
      loaded: Boolean(img && img.complete && img.naturalWidth > 0),
      mark: Boolean(c.querySelector('.gate-card-mark svg')),
      links: [...c.querySelectorAll('.gate-link')].map((l) => l.textContent),
      box: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
      facts: Math.round(Math.max(...[...c.querySelectorAll('.gate-card-facts, .gate-link')].map((n) => n.getBoundingClientRect().bottom))),
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

function laidOut(v, n = 4) {
  const c = v.cards;
  const inside = c.every((x) => x.box[0] >= 0 && x.box[1] >= 0 && x.box[2] <= v.w && x.box[3] <= v.h && x.facts <= v.bar);
  const apart = c.every((a, i) => c.slice(i + 1).every((b) => a.box[2] <= b.box[0] || b.box[2] <= a.box[0]
    || a.box[3] <= b.box[1] || b.box[3] <= a.box[1]));
  return c.length === n && inside && apart && v.sw <= v.w;
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

/* Flight Club, by a click on its card on home: the rooms panel is there. */
async function toClub(page) {
  await page.until("window.__ui.onGate() && document.querySelector('.gate-card-hub-club')", 60000).catch(() => {});
  if (await page.evaluate("window.__ui.hub !== 'club'")) {
    await click(page, '.gate-card-hub-club .gate-card-name');
    await page.until("window.__ui.hub === 'club'", 10000).catch(() => {});
  }
}

const HERE = '(() => { const it = window.__ui.items()[window.__ui.cursor]; return it ? [it.action, it.label] : []; })()';

/* A game room's lobby as drawn: its panel, the rows under it, the room. */
const IN_LOBBY = "window.__ui.screen === 'friends' && document.querySelector('.war-lobby') && !document.querySelector('.war-lobby').hidden";
const LOBBY_OF = `(() => {
  const box = document.querySelector('.war-lobby');
  const ui = window.__ui;
  const here = ui.items()[ui.cursor] || {};
  const r = window.__rooms();
  return {
    title: box ? (box.querySelector('.war-lobby-title') || {}).textContent || '' : '',
    line: box ? (box.querySelector('.war-lobby-mission') || {}).textContent || '' : '',
    rows: ui.items().map((it) => it.action || it.label),
    here: here.action || here.label || null,
    code: r.code, public: r.public, mode: r.mode,
  };
})()`;

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
    await p.until("window.__ui.onGate() && document.querySelectorAll('.screen-title .gate-card').length === 3", 60000);
    await p.until(`${LAYOUT}.cards.every((c) => c.loaded)`, 30000);
  }

  /* HOME: THE THREE HUBS AT EVERY SIZE. */
  const SIZES = [[1280, 720, true], [1920, 1080, true], [2560, 1080, true], [390, 844, false], [360, 640, false], [844, 390, true]];
  const shapeOf = (v, row) => {
    const tops = v.cards.map((x) => x.box[1]);
    return row
      ? Math.max(...tops) - Math.min(...tops) <= 4
      : v.cards.every((x, i) => i === 0 || x.box[1] >= v.cards[i - 1].box[3]);
  };
  const home = await a.evaluate(LAYOUT);
  check('home is three hubs, Flight Club, Operations, Hangar, in that order (the owner, 2026-10-03)', home.cards.map((x) => x.name).join() === HUBS, home.cards.map((x) => x.name).join());
  /* The cards' numbers are a CSS counter in their order (index.html,
   * .gate-card-art::before), so the first card is [ 01 ]. */
  check('and opens on Flight Club, the cursor\'s card, first in the row, so numbered 01', home.cards.filter((x) => x.on).map((x) => x.name).join() === 'Flight Club'
    && await a.evaluate("document.querySelector('.screen-title .gate-cards').firstElementChild.classList.contains('gate-card-hub-club')"),
  home.cards.filter((x) => x.on).map((x) => x.name).join());
  check('each hub with its picture loaded and its mark drawn', home.cards.every((x) => x.loaded && x.mark));
  check('each hub lists its activities as links: Track Day, Free Flight, Streamer Combat, Catch the Ace; the war; the Hangar\'s four',
    home.cards.map((x) => x.links.join()).join('|') === LINKS, home.cards.map((x) => x.links.join()).join('|'));
  check('no rooms panel on home: it is Flight Club\'s', home.panel === null, JSON.stringify(home.panel));
  for (const [w, h, row] of SIZES) {
    await resize(a, w, h);
    const v = await a.evaluate(LAYOUT);
    check(`${w} by ${h}: home's three hubs ${row ? 'in a row' : 'stacked'}, inside the window, links clear of the bar, no sideways scroll`,
      laidOut(v, 3) && shapeOf(v, row), `${JSON.stringify(v.cards.map((x) => [...x.box, x.facts]))} bar ${v.bar} scroll ${v.sw}`);
    await shot(a, `home-${w}x${h}`);
  }
  await resize(a, 1280, 720);

  /* INTO FLIGHT CLUB, by the keyboard: its four cards at every size. */
  await a.evaluate("(() => { window.__ui.setCursor(window.__ui.items().findIndex((it) => it.hub === 'club')); return true; })()");
  await a.tap('Enter');
  await a.until(`window.__ui.hub === 'club' && ${LAYOUT}.cards.length === 4 && ${LAYOUT}.cards.every((c) => c.loaded)`, 30000).catch(() => {});
  const first = await a.evaluate(LAYOUT);
  check('Enter on Flight Club opens its four cards, in order, no Fly with friends (the owner, 2026-10-02)', first.cards.map((x) => x.name).join() === NAMES, first.cards.map((x) => x.name).join());
  check('each with its picture loaded and its mark drawn', first.cards.every((x) => x.loaded && x.mark));
  check('and the breadcrumb names the hub', /Flight Club$/.test(first.crumb), first.crumb);
  for (const [w, h, row] of SIZES) {
    await resize(a, w, h);
    const v = await a.evaluate(LAYOUT);
    check(`${w} by ${h}: four cards ${row ? 'in a row' : 'stacked'}, inside the window, tags clear of the bar, no sideways scroll`,
      laidOut(v) && shapeOf(v, row), `${JSON.stringify(v.cards.map((x) => [...x.box, x.facts]))} bar ${v.bar} scroll ${v.sw}`);
    check(`${w} by ${h}: the rooms panel in the window without scrolling, above the cards, clear of them and of the corner chips`,
      panelLaidOut(v), `panel ${JSON.stringify(v.panel)} chips ${JSON.stringify(v.chips)} first card ${JSON.stringify(v.cards[0].box)}`);
    await shot(a, `gate-${w}x${h}`);
  }
  await resize(a, 1280, 720);

  /* THE KEYBOARD ALONG THE ROW. */
  await a.evaluate("(() => { window.__ui.setCursor(0); return true; })()");
  const walk = [await onCard(a)];
  for (let i = 0; i < 3; i += 1) {
    await a.tap('ArrowRight');
    await a.sleep(150);
    walk.push(await onCard(a));
  }
  for (let i = 0; i < 2; i += 1) {
    await a.tap('ArrowLeft');
    await a.sleep(150);
    walk.push(await onCard(a));
  }
  check('Right walks all four cards and Left steps back to Free Flight', walk.join('>') === `${NAMES.split(',').join('>')}>Streamer Combat>Free Flight`, walk.join(' > '));
  await a.tap('ArrowRight');
  await a.sleep(150);

  /* STREAMER COMBAT: A's one press, the keyboard's. */
  await a.tap('Enter');
  await a.until(`window.__rooms().phase === 'open' && ${IN_LOBBY}`, 60000).catch(() => {});
  await a.sleep(800);
  const la = await a.evaluate(LOBBY_OF);
  const code = la.code;
  check('Enter on it, one press: A is in the LOBBY of a public room made for combat, Ready under the cursor',
    la.title === 'LOBBY' && la.public && la.mode === 'combat' && /Streamer Combat/.test(la.line) && la.here === 'friends-lobby-ready', JSON.stringify(la));
  check('and no free flight, no other game: no Fly, no world, no race, tag or war rows',
    !la.rows.some((r) => r === 'fly' || /^friends-(tag|race|war|combat)-/.test(r || '')), la.rows.join());
  await shot(a, 'combat-lobby');

  /* B: Streamer Combat's link on home, one click, into A's lobby. */
  const bClicks = b.clicks;
  await b.click('.gate-card-combat');
  await b.until(`window.__rooms().code === ${JSON.stringify(code)} && ${IN_LOBBY}`, 60000).catch(() => {});
  check(`B clicks its link on home (${b.clicks - bClicks} click) and is in A's lobby`, b.clicks - bClicks === 1 && (await b.evaluate('window.__rooms().code')) === code,
    String(await b.evaluate('window.__rooms().code')));
  await shot(b, 'combat-lobby-b');

  await a.tap('KeyR');
  await b.tap('KeyR');
  for (const p of [a, b]) {
    await p.until("['countdown', 'on'].includes(window.__combat().round.state)", 20000).catch(() => {});
  }
  const rounds = await Promise.all([a, b].map((p) => p.evaluate('window.__combat().round.state')));
  check('both ready: the round counts down on both pages', rounds.every((st) => st === 'countdown' || st === 'on'), rounds.join(' '));
  await a.until("window.__craftState().mode === 'flight'", 400000).catch(() => {});
  check('and A goes up with it', await a.evaluate("window.__craftState().mode === 'flight'"));
  await a.sleep(1500);
  await shot(a, 'combat-countdown');

  /* CATCH THE ACE: C's click; D, a phone, the same card. */
  await c.click('.gate-card-ace');
  await c.until(`window.__rooms().phase === 'open' && ${IN_LOBBY}`, 60000).catch(() => {});
  await c.sleep(800);
  const lc = await c.evaluate(LOBBY_OF);
  check('C clicks Catch the Ace\'s link on home, one click, into the LOBBY of a public room made for it', lc.title === 'LOBBY' && lc.public && lc.mode === 'tag'
    && /Catch the Ace/.test(lc.line) && lc.here === 'friends-lobby-ready', JSON.stringify(lc));
  await shot(c, 'ace-lobby');

  /* D, upright: down the stacked hubs to Flight Club, Enter, then down
   * its stacked cards. */
  await d.evaluate("(() => { window.__ui.setCursor(0); return true; })()");
  for (let i = 0; i < 3 && (await onCard(d)) !== 'Flight Club'; i += 1) {
    await d.tap('ArrowDown');
    await d.sleep(150);
  }
  await d.tap('Enter');
  await d.until("window.__ui.hub === 'club'", 10000).catch(() => {});
  await d.evaluate("(() => { window.__ui.setCursor(0); return true; })()");
  const phone = [await onCard(d)];
  for (let i = 0; i < 3; i += 1) {
    await d.tap('ArrowDown');
    await d.sleep(150);
    phone.push(await onCard(d));
  }
  check('on the upright phone ArrowDown walks down the stack to Catch the Ace!', phone[phone.length - 1] === 'Catch the Ace!', phone.join(' > '));
  await d.click('.gate-card-ace');
  await d.until(`window.__rooms().code === ${JSON.stringify(lc.code)} && ${IN_LOBBY}`, 60000).catch(() => {});
  const dRoom = await d.evaluate('window.__rooms()');
  check('D taps the card into C\'s lobby', dRoom.phase === 'open' && dRoom.code === lc.code && dRoom.seat === 2, `${dRoom.phase} ${dRoom.code} ${dRoom.seat}`);
  await shot(d, 'ace-lobby-phone');

  await c.tap('KeyR');
  await d.tap('KeyR');
  for (const p of [c, d]) {
    await p.until("['countdown', 'ace', 'hunter'].includes(window.__roomTag().role)", 60000).catch(() => {});
  }
  const roles = await Promise.all([c, d].map((p) => p.evaluate('window.__roomTag().role')));
  check('both ready: both pages count down to the go', roles.every((r) => ['countdown', 'ace', 'hunter'].includes(r)), roles.join(' '));
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
/* A pilot in each: an empty room is never listed (the owner, 2026-10-02). */
const panelPilots = [await seatPilot(rooms, made.code, [4, 4, 44]), await seatPilot(rooms, madeLong.code, [5, 5, 55])];
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
    await toClub(p);
    await p.until(`window.__ui.onGate() && window.__ui.items().some((it) => it.action === ${JSON.stringify(roomAction)}) && window.__ui.items().some((it) => it.label === ${JSON.stringify(LONG)})`, 60000).catch(() => {});
  }
  const panel = await e.evaluate(PANEL);
  /* The owner, 2026-10-02: the panel called a lobby's idle pilot
   * flying. These rooms' pilots sit in their lobbies. */
  check('the panel says what is true: 2 rooms, 2 pilots in a lobby, none flying', panel.count === '2 rooms, 2 pilots in a lobby', panel.count);
  const openChip = await e.evaluate(`(window.__ui.items().find((it) => it.action === ${JSON.stringify(roomAction)}) || {}).value || ''`);
  check('and the room\'s chip: free flight, 1 in lobby', openChip === 'Free flight · 1 in lobby', openChip);
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
  const lastCard = await e.evaluate("window.__ui.items().findIndex((it) => it.card === 'ace')");
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
  const fLast = await f.evaluate("window.__ui.items().findIndex((it) => it.card === 'ace')");
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
  await f.until("window.__ui.onGate() && window.__ui.hub === 'club'", 10000).catch(() => {});
  await click(f, '.gate-room-make');
  await f.until("window.__ui.screen === 'roomnew'", 10000).catch(() => {});
  check('a click on Make a room opens Make a room', await f.evaluate("window.__ui.screen === 'roomnew'"), await f.evaluate('window.__ui.screen'));

  /* THREE 32 LETTER NAMES at the top of the panel, as campaign Play names
   * its public war rooms ("<picker name>, Defend Itaipu"): two more such
   * rooms, newest, beside the one above. Every name whole at every size,
   * the panel and the cards still fit; an upright phone's panel lists two
   * of them (src/ui/roombrowser.js TITLE_ROOMS_UPRIGHT). A minute first:
   * the rooms server makes six rooms a minute for an address. */
  await f.sleep(61000);
  /* E leaves Open Club, which its pilot made the busiest room and so the
   * panel's first. */
  await e.evaluate("(() => { window.__ui.act('friends-leave'); return true; })()");
  await e.until("window.__rooms().phase === 'idle'", 10000).catch(() => {});
  const longNames = [LONG, 'Brave Capybara 17, Defend Itaipu', 'Happy Eagle 420, Defend Itaipu!!'];
  /* Open Club's pilot goes too, so the three long names are the panel's. */
  panelPilots[0].close();
  for (const [i, name] of longNames.slice(1).entries()) {
    const longMade = await (await fetch(`${rooms}/v2/create`, {
      method: 'POST', headers: { origin: 'http://127.0.0.1', 'content-type': 'application/json' }, body: JSON.stringify({ map: 'swiss2', public: true, name }),
    })).json();
    panelPilots.push(await seatPilot(rooms, longMade.code, [6 + i, 6 + i, 66 + i]));
  }
  /* Back to the gate a screen at a time (Make a room, Fly with friends,
   * the title): two taps sent together lost the second to the first's
   * screen change. */
  for (let i = 0; i < 4 && !(await f.evaluate('window.__ui.onGate()')); i += 1) {
    const from = await f.evaluate('window.__ui.screen');
    await f.tap('Escape');
    await f.until(`window.__ui.screen !== ${JSON.stringify(from)}`, 5000).catch(() => {});
    await f.sleep(300);
  }
  await f.until('window.__ui.onGate()', 10000).catch(() => {});
  await toClub(f);
  const LISTED_NAMES = "[...document.querySelectorAll('.gate-rooms-list .gate-room-name')].map((n) => n.textContent)";
  /* How many rooms the panel lists (src/ui/roombrowser.js): one on a
   * short upright phone, two on an upright one, three otherwise. */
  for (const [w, h, n] of [[390, 844, 2], [360, 640, 1], [844, 390, 3], [1280, 720, 3]]) {
    await resize(f, w, h);
    await f.until(`${LISTED_NAMES}.length === ${n}`, 15000).catch(() => {});
    const listed = await f.evaluate(LISTED_NAMES);
    const cut = await f.evaluate(CUT(PANEL_TEXT));
    const v = await f.evaluate(LAYOUT);
    check(`${w} by ${h}, three 32 letter names: the panel lists ${['none', 'one', 'two', 'three'][n]}, every name whole`,
      listed.length === n && listed.every((n) => longNames.includes(n)) && cut.length === 0, `${listed.join(' | ')} cut: ${cut.join(' | ')}`);
    check(`${w} by ${h}, three 32 letter names: the panel and the cards still fit`, panelLaidOut(v) && laidOut(v),
      `panel ${JSON.stringify(v.panel)} cards ${JSON.stringify(v.cards.map((x) => [...x.box, x.facts]))} bar ${v.bar}`);
    await shot(f, `panel-long-${w}x${h}`);
  }
  const errs = [e, f].flatMap((p) => p.errors).filter((x) => !x.startsWith('network:'));
  check('no page error on the panel\'s pages', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await e.close();
  await f.close();
  for (const p of panelPilots) {
    p.close();
  }
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
  await toClub(g);
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
  check('and Down goes back to the first card, unlit', (await onCard(g)) === 'Track Day' && !(await g.evaluate(BAR)).lit);
  await g.tap('ArrowUp');
  await g.sleep(150);
  await g.evaluate('(() => { window.__beforeReload = true; return true; })()');
  await g.tap('Enter');
  await g.until('!window.__beforeReload && window.__shellReady === true', 300000).catch(() => {});
  check('Enter on it reloads the page', await g.evaluate('!window.__beforeReload && window.__shellReady === true'));

  /* The pad: up onto Reload, select reloads. */
  await g.until(`window.__ui.onGate()`, 60000).catch(() => {});
  await toClub(g);
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
  await toClub(g);
  await g.until(`window.__ui.items().some((it) => it.action === ${JSON.stringify(roomAction)})`, 30000).catch(() => {});
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
