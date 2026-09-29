/*
 * mode-cards-check.js: the title's five cards, and the two room game
 * cards driven through the real shell the way a pilot drives them, against
 * a running rooms server (never the live one):
 *
 *   ROOMS_DB=/tmp/rooms.db PORT=8797 node edge/rooms/node.js
 *   SIM_GPU=1 node scripts/mode-cards-check.js http://127.0.0.1:8797 [outdir]
 *
 * Page A, 1280 by 720: five cards inside the window at 1280x720,
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

const NAMES = 'Track mode,Free Flight,Fly with friends,Toilet paper combat,Catch the Ace!';

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
}))()`;

function laidOut(v) {
  const c = v.cards;
  const inside = c.every((x) => x.box[0] >= 0 && x.box[1] >= 0 && x.box[2] <= v.w && x.box[3] <= v.h && x.facts <= v.bar);
  const apart = c.every((a, i) => c.slice(i + 1).every((b) => a.box[2] <= b.box[0] || b.box[2] <= a.box[0]
    || a.box[3] <= b.box[1] || b.box[3] <= a.box[1]));
  return c.length === 5 && inside && apart && v.sw <= v.w;
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
    await p.until("window.__ui.onGate() && document.querySelectorAll('.screen-title .gate-card').length === 5", 60000);
    await p.until(`${LAYOUT}.cards.every((c) => c.loaded)`, 30000);
  }

  /* THE FIVE CARDS AT EVERY SIZE. */
  const first = await a.evaluate(LAYOUT);
  check('five cards, in order', first.cards.map((x) => x.name).join() === NAMES, first.cards.map((x) => x.name).join());
  check('each with its picture loaded and its mark drawn', first.cards.every((x) => x.loaded && x.mark));
  for (const [w, h, row] of [[1280, 720, true], [1920, 1080, true], [390, 844, false], [360, 640, false], [844, 390, true]]) {
    await resize(a, w, h);
    const v = await a.evaluate(LAYOUT);
    const tops = v.cards.map((x) => x.box[1]);
    const shape = row
      ? Math.max(...tops) - Math.min(...tops) <= 4
      : v.cards.every((x, i) => i === 0 || x.box[1] >= v.cards[i - 1].box[3]);
    check(`${w} by ${h}: five cards ${row ? 'in a row' : 'stacked'}, inside the window, tags clear of the bar, no sideways scroll`,
      laidOut(v) && shape, `${JSON.stringify(v.cards.map((x) => [...x.box, x.facts]))} bar ${v.bar} scroll ${v.sw}`);
    await shot(a, `gate-${w}x${h}`);
  }
  await resize(a, 1280, 720);

  /* THE KEYBOARD ALONG THE ROW. */
  await a.evaluate("(() => { window.__ui.setCursor(0); return true; })()");
  const walk = [await onCard(a)];
  for (let i = 0; i < 4; i += 1) {
    await a.tap('ArrowRight');
    await a.sleep(150);
    walk.push(await onCard(a));
  }
  await a.tap('ArrowLeft');
  await a.sleep(150);
  walk.push(await onCard(a));
  check('Right walks all five cards and Left steps back', walk.join('>') === `${NAMES.split(',').join('>')}>Toilet paper combat`, walk.join(' > '));

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
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
