/*
 * home-rooms-check.js: the public rooms out in the open on home (the
 * owner, 2026-10-03: "i dont see the public lobby anymore ? with all
 * current rooms ? that was a big feature that i liked", then "it needs to
 * be wide out in the open"), driven through the real shell against a
 * rooms server of its own (never the live one):
 *
 *   SIM_GPU=1 npm run home:rooms                    starts its own on a free port
 *   SIM_GPU=1 npm run home:rooms -- http://127.0.0.1:8797 [outdir]
 *
 * With no room open, home still shows the panel: it says there are none,
 * with All rooms and Make a room. With eight public rooms open, each named
 * to the 32 letters a name may have and each with a pilot in it, home at
 * 1920x1080, 2560x1080, 1280x720, 390x844, 360x640 and 844x390 shows the
 * panel on load, no scrolling and no hover: on a window wider than a phone
 * the page's whole width, the cards' width; in every size in the window,
 * clear of the sign in chip and the music dock, above the hub cards and
 * clear of them, the cards' links clear of the command bar, no scroll.
 * It lists as many rooms as fit there (src/ui/roombrowser.js HOME_ROOMS),
 * every name whole, each saying its game and how many pilots are in it.
 *
 * The arrows walk the three hubs first and then the rooms; a click on a
 * room joins it. Flight Club keeps its own panel.
 *
 * No page error. Pictures in outdir, not in the repository.
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
import { roomsServer } from '../tests/lib/roomsserver.js';
import { seatPilot } from '../tests/lib/roompilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = process.argv[3] || join(root, 'build', 'home-rooms');

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

async function resize(page, width, height) {
  await page.cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: false,
  }, page.sessionId);
  await page.until(`window.innerWidth === ${width} && window.innerHeight === ${height}`, 10000);
  await page.sleep(600);
}

/* Home as laid out: the window, the bar, the hub cards, the panel and its
 * rooms, the corner chips, and any text the panel cuts. */
const LAYOUT = `(() => {
  const box = (n) => { const r = n.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
  const panel = document.querySelector('.screen-title .gate-rooms');
  const shown = panel && !panel.hidden && panel.getClientRects().length > 0;
  return {
    w: innerWidth, h: innerHeight,
    sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight,
    bar: Math.round(document.querySelector('.frame-bot').getBoundingClientRect().top),
    hub: window.__ui.hub,
    cards: [...document.querySelectorAll('.screen-title .gate-card')].map((c) => ({
      box: box(c),
      links: Math.round(Math.max(...[...c.querySelectorAll('.gate-card-facts, .gate-link')].map((n) => n.getBoundingClientRect().bottom))),
    })),
    panel: shown ? box(panel) : null,
    count: shown ? (panel.querySelector('.gate-rooms-count') || {}).textContent || '' : '',
    rooms: shown ? [...panel.querySelectorAll('.gate-rooms-list .gate-room')].map((r) => ({
      name: r.querySelector('.gate-room-name').textContent,
      value: (r.querySelector('.gate-room-value') || {}).textContent || '',
      box: box(r),
    })) : [],
    buttons: shown ? [...panel.querySelectorAll('.gate-rooms-buttons .gate-room-name')].map((n) => n.textContent) : [],
    cut: shown ? [...panel.querySelectorAll('.gate-rooms-count, .gate-room-name, .gate-room-value')]
      .filter((n) => n.getClientRects().length && n.scrollWidth > n.clientWidth + 1).map((n) => n.textContent.trim()) : [],
    chips: [...document.querySelectorAll('.signin-chip, .music-dock')].filter((n) => !n.hidden && n.getBoundingClientRect().width > 0).map(box),
    order: window.__ui.items().map((it) => (it.hub ? 'hub' : it.lobby || it.action)),
  };
})()`;

const apart = (a, b) => a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1];
const inWindow = (v, b) => b[0] >= 0 && b[1] >= 0 && b[2] <= v.w && b[3] <= v.h;

/* The panel where it has to be: on load, in the window, above every hub
 * card and clear of it and of the corner chips, the cards' links clear of
 * the bar, nothing scrolling. */
function laidOut(v) {
  const p = v.panel;
  return Boolean(p) && inWindow(v, p) && v.cards.length === 3
    && v.cards.every((c) => p[3] <= c.box[1] && inWindow(v, c.box) && c.links <= v.bar)
    && v.chips.every((c) => apart(p, c)) && v.sw <= v.w && v.sh <= v.h;
}

/* Hubs first, then the panel's head, its rooms, All rooms, Make a room. */
function ordered(v, n) {
  return v.order.join() === ['hub', 'hub', 'hub', 'head', ...Array(n).fill('room'), 'all', 'make'].join();
}

/* Each size, whether it is wider than a phone (the panel the cards' whole
 * width), and how many rooms it lists (src/ui/roombrowser.js HOME_ROOMS). */
const SIZES = [[1920, 1080, true, 8], [2560, 1080, true, 8], [1280, 720, true, 4], [390, 844, false, 5], [360, 640, false, 2], [844, 390, false, 3]];
/* 32 letters each, the most a room's name may have, and a mix of games. */
const ROOMS = [
  { map: 'swiss2', mode: 'combat' }, { map: 'swiss2', mode: 'tag' }, { map: 'swiss2', mode: 'race' }, { map: 'alps', mode: null },
  { map: 'swiss2', mode: null }, { map: 'swiss2', mode: 'combat' }, { map: 'alps', mode: null }, { map: 'swiss2', mode: 'tag' },
].map((r, i) => ({ ...r, name: `Long Afternoon Valley Session ${i + 1}!` }));
/* The words a room's line names its game by (roombrowser.chip_*). */
const GAMES = /^Join[^·]*· (Combat|Catch the Ace|Race|Free flight) · \d+ (in lobby|flying)/;

const server = await roomsServer(process.argv[2], 'home-rooms');
console.log(`home's rooms, rooms at ${server.url}`);
const pilots = [];
const page = await openPage({ root, url: `/index.html?rooms=${encodeURIComponent(server.url)}`, width: 1920, height: 1080 });
try {
  await page.until('window.__shellReady === true', 300000);
  await page.until("window.__ui.onGate() && window.__ui.hub === null && document.querySelectorAll('.screen-title .gate-card').length === 3", 60000).catch(() => {});
  await page.until("document.querySelector('.screen-title .gate-rooms-count') && document.querySelector('.screen-title .gate-rooms-count').textContent.length > 0", 30000).catch(() => {});
  await page.sleep(800);

  /* NO ROOM OPEN: the panel still there, saying so. */
  const none = await page.evaluate(LAYOUT);
  check('no room open: home shows the panel, saying there are none, with All rooms and Make a room', laidOut(none) && none.rooms.length === 0
    && /^No open rooms/.test(none.count) && none.buttons.join() === 'All rooms,Make a room' && ordered(none, 0), JSON.stringify(none));
  await shot(page, 'home-none-1920x1080');

  /* EIGHT ROOMS OPEN, a pilot in each: an empty room is never listed. Each
   * made from an address of its own, as eight households would: the
   * server makes six a minute for one (edge/rooms/front.js). */
  for (const [i, r] of ROOMS.entries()) {
    const res = await fetch(`${server.url}/v2/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://fdflabs.github.io', 'cf-connecting-ip': `10.77.0.${i + 1}` },
      body: JSON.stringify({ ...r, public: true }),
    });
    const made = await res.json();
    check(`room ${i + 1} made, ${r.mode || 'free flight'}`, Boolean(made.code), JSON.stringify(made));
    if (made.code) {
      pilots.push(await seatPilot(server.url, made.code, [i, i + 1, 20 + i]));
    }
  }
  await page.until("document.querySelectorAll('.screen-title .gate-rooms-list .gate-room').length > 0", 30000).catch(() => {});

  for (const [w, h, wide, n] of SIZES) {
    await resize(page, w, h);
    /* The panel follows the window on its media queries' change events, a
     * frame or more after the resize. */
    await page.until(`document.querySelectorAll('.screen-title .gate-rooms-list .gate-room').length === ${n}`, 15000).catch(() => {});
    await page.sleep(400);
    const v = await page.evaluate(LAYOUT);
    const span = v.cards.length ? [Math.min(...v.cards.map((c) => c.box[0])), Math.max(...v.cards.map((c) => c.box[2]))] : [0, 0];
    check(`${w} by ${h}: the panel on load, in the window, above the hub cards and clear of them and of the corner chips, links clear of the bar, no scroll`,
      laidOut(v), JSON.stringify({ panel: v.panel, cards: v.cards, chips: v.chips, bar: v.bar, sw: v.sw, sh: v.sh }));
    check(`${w} by ${h}: ${wide ? 'the page\'s whole width, the cards\' span' : 'the column\'s width'}`,
      Boolean(v.panel) && (wide ? Math.abs(v.panel[0] - span[0]) <= 1 && Math.abs(v.panel[2] - span[1]) <= 1 : v.panel[2] - v.panel[0] >= (v.w - 2 * 36) * 0.7),
      JSON.stringify({ panel: v.panel, span }));
    check(`${w} by ${h}: ${n} of the 8 rooms listed, every name whole, each with its game and how many pilots are in it, the count saying 8`,
      v.rooms.length === n && v.rooms.every((r) => /^Long Afternoon Valley Session \d!$/.test(r.name) && GAMES.test(r.value)) && v.cut.length === 0
      && /^8 rooms/.test(v.count) && ordered(v, n), JSON.stringify({ count: v.count, rooms: v.rooms.map((r) => [r.name, r.value]), cut: v.cut, order: v.order }));
    await shot(page, `home-${w}x${h}`);
  }

  /* THE ARROWS: the hubs first, then the rooms. */
  await resize(page, 1920, 1080);
  await page.until("document.querySelectorAll('.screen-title .gate-rooms-list .gate-room').length === 8", 15000).catch(() => {});
  await page.evaluate("(() => { window.__ui.setCursor(0); return true; })()");
  const walk = [];
  for (let i = 0; i < 4; i += 1) {
    walk.push(await page.evaluate("(() => { const it = window.__ui.items()[window.__ui.cursor] || {}; return it.hub || it.lobby || it.action || null; })()"));
    await page.tap('ArrowRight');
    await page.sleep(150);
  }
  walk.push(await page.evaluate("(() => { const it = window.__ui.items()[window.__ui.cursor] || {}; return it.hub || it.lobby || it.action || null; })()"));
  check('the arrows walk Flight Club, Operations, the Hangar, then the first room', walk.join() === 'club,ops,hangar,room,room', walk.join());
  const lit = await page.evaluate("(() => { const n = document.querySelector('.screen-title .gate-rooms-list .gate-room.on'); return n ? n.querySelector('.gate-room-name').textContent : null; })()");
  check('and the room under the cursor is lit', /^Long Afternoon Valley Session \d!$/.test(lit || ''), String(lit));

  /* THE MOUSE: a click on a room joins it. */
  const target = await page.evaluate(`(() => {
    const ui = window.__ui;
    const el = ui.titleRoomEls.find((e) => ui.items()[e.i].lobby === 'room');
    el.node.dataset.check = 'here';
    return ui.items()[el.i].action.split('-').pop();
  })()`);
  const at = await page.evaluate("(() => { const r = document.querySelector('[data-check=\"here\"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()");
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await page.cdp.send('Input.dispatchMouseEvent', { type, x: at[0], y: at[1], button: 'left', clickCount: 1 }, page.sessionId);
  }
  await page.until(`window.__rooms().phase === 'open' && window.__rooms().code === ${JSON.stringify(target)}`, 30000).catch(() => {});
  const joined = await page.evaluate("({ phase: window.__rooms().phase, code: window.__rooms().code, screen: window.__ui.screen })");
  check('a click on a room on home joins it', joined.phase === 'open' && joined.code === target, JSON.stringify({ target, joined }));
  await page.evaluate("(() => { window.__ui.act('friends-leave'); return true; })()");
  await page.until("window.__rooms().phase === 'idle' && window.__ui.onGate()", 15000).catch(() => {});

  /* FLIGHT CLUB KEEPS ITS PANEL. */
  for (let i = 0; i < 2 && await page.evaluate('window.__ui.hub !== null'); i += 1) {
    await page.tap('Escape');
    await page.sleep(400);
  }
  await page.evaluate("(() => { window.__ui.openHub('club'); return true; })()");
  await page.until("window.__ui.hub === 'club' && document.querySelectorAll('.screen-title .gate-rooms-list .gate-room').length > 0", 15000).catch(() => {});
  const club = await page.evaluate(LAYOUT);
  check('Flight Club keeps its rooms panel', club.hub === 'club' && Boolean(club.panel) && club.rooms.length > 0, JSON.stringify({ hub: club.hub, panel: club.panel, rooms: club.rooms.length }));

  const errs = page.errors.filter((e) => !e.startsWith('network:'));
  check('no page error', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  for (const p of pilots) {
    p.close();
  }
  await page.close();
  await server.stop();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
