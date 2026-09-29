/*
 * friends-card-check.js: the title's third card, Fly with friends, driven
 * through the real shell the way a pilot drives it, against a running
 * rooms Worker:
 *
 *   npx wrangler dev --config edge/rooms/wrangler.toml --port 8797
 *   node scripts/friends-card-check.js http://127.0.0.1:8797 [outdir]
 *
 * Page A, 1280 by 720: the gate draws its five cards side by side, inside the
 * window, the third wearing its picture and its mark. The arrows walk the
 * cursor onto it and back; Enter opens the room screen in free flight with
 * the Swiss valley seated; Escape twice is the gate again; a click on the
 * card opens the room screen too, on Rooms (the room browser). Make a
 * room, private this time, and Fly is on top of the room's rows with the
 * aircraft and the world under them; Enter on it is flight, in the room,
 * in the valley.
 *
 * Page B, 390 by 844, a phone held upright: the five cards stack inside
 * the window with no sideways scroll; a click on the third, Join with a
 * code, the code typed into the form, and B is in A's room on seat 2.
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

async function onCard(page) {
  return (await page.evaluate(CARDS)).filter((c) => c.on).map((c) => c.name)[0] ?? null;
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
console.log(`the Fly with friends card, rooms at ${rooms}`);
const a = await openPage({ root, url, width: 1280, height: 720 });
const b = await openPage({ root, url, width: 390, height: 844 });
try {
  for (const p of [a, b]) {
    await p.until('window.__shellReady === true', 300000);
    await p.until("window.__ui.onGate() && document.querySelectorAll('.screen-title .gate-card').length === 5", 60000);
    await p.until(`${CARDS}.every((c) => c.loaded)`, 30000);
  }

  /* THE GATE AT 1280 BY 720. */
  const cards = await a.evaluate(CARDS);
  const view = await a.evaluate(VIEW);
  check('five cards on the gate, the third Fly with friends',
    cards.map((c) => c.name).join() === 'Track mode,Free Flight,Fly with friends,Toilet paper combat,Catch the Ace!', cards.map((c) => c.name).join());
  check('each with its picture loaded and its mark drawn', cards.every((c) => c.loaded && c.mark),
    cards.map((c) => `${c.shot}:${c.loaded}:${c.mark}`).join(' '));
  /* One row: the tops agree but for the 4 px the chosen card is lifted. */
  const tops = cards.map((c) => c.box[1]);
  check('side by side in one row, inside the window, tags clear of the bar, none overlapping',
    inside(cards, view) && apart(cards) && Math.max(...tops) - Math.min(...tops) <= 4,
    `${JSON.stringify(cards.map((c) => [...c.box, c.factsBottom]))} bar at ${view.bar}`);
  const widths = cards.map((c) => c.box[2] - c.box[0]);
  check('at one width', Math.max(...widths) - Math.min(...widths) <= 1, widths.join());
  check('and no sideways scroll', view.sw <= view.w, `${view.sw} > ${view.w}`);
  await shot(a, 'a-1-gate-three-cards');

  /* THE KEYBOARD: the arrows walk onto the card and back, Enter opens it. */
  const walk = [await onCard(a)];
  for (let i = 0; i < 3 && walk[walk.length - 1] !== 'Fly with friends'; i += 1) {
    await a.tap('ArrowRight');
    await a.sleep(150);
    walk.push(await onCard(a));
  }
  await a.tap('ArrowLeft');
  await a.sleep(150);
  walk.push(await onCard(a));
  await a.tap('ArrowRight');
  await a.sleep(150);
  walk.push(await onCard(a));
  check('Right reaches the third card, Left leaves it, Right comes back',
    walk[walk.length - 3] === 'Fly with friends' && walk[walk.length - 2] === 'Free Flight' && walk[walk.length - 1] === 'Fly with friends',
    walk.join(' > '));
  await shot(a, 'a-2-cursor-on-friends');
  await a.tap('Enter');
  await a.until("window.__ui.screen === 'friends'", 10000).catch(() => {});
  const opened = await a.evaluate(`({
    screen: window.__ui.screen, mode: window.__ui.mode, gate: window.__ui.onGate(),
    map: window.__ui.settings.map, carousel: window.__ui.carousel.isOpen,
    rows: window.__ui.items().map((it) => it.action || it.label),
  })`);
  check('Enter opens the room screen, not the aircraft picker', opened.screen === 'friends' && !opened.carousel, JSON.stringify(opened));
  check('in free flight, off the gate, the Swiss valley seated', opened.mode === 'freestyle' && !opened.gate && opened.map === 'swiss2');
  check('on Make a room and Join with a code', opened.rows.includes('roomnew') && opened.rows.includes('friends-join'), opened.rows.join());
  check('and Rooms first, under the cursor', opened.rows[0] === 'rooms'
    && await a.evaluate("window.__ui.items()[window.__ui.cursor].action === 'rooms'"), opened.rows.join());

  await a.tap('Escape');
  await a.until("window.__ui.screen === 'title' && !window.__ui.onGate()", 10000).catch(() => {});
  const back1 = await a.evaluate('({ screen: window.__ui.screen, gate: window.__ui.onGate(), rows: window.__ui.items().map((it) => it.action) })');
  check('Escape is the Free Flight menu, which still has the Fly with friends row', back1.screen === 'title' && !back1.gate && back1.rows.includes('friends'), JSON.stringify(back1));
  await a.tap('Escape');
  await a.until('window.__ui.onGate()', 10000).catch(() => {});
  check('Escape again is the gate', await a.evaluate('window.__ui.onGate()'));

  /* THE MOUSE: a click on the card opens the same screen. */
  await click(a, '.gate-card-friends');
  await a.until("window.__ui.screen === 'friends'", 10000).catch(() => {});
  check('a click on the card opens the room screen', await a.evaluate("window.__ui.screen === 'friends' && !window.__ui.carousel.isOpen"));

  /* MAKE A ROOM, PRIVATE, THEN FLY. */
  check('the cursor is on Make a room', await arrowTo(a, 'roomnew'));
  await a.tap('Enter');
  await a.until("window.__ui.screen === 'roomnew'", 10000).catch(() => {});
  check('Enter opens Make a room', await arrowTo(a, 'Who can join'));
  await a.tap('ArrowRight');
  await a.sleep(150);
  check('Right on Who can join makes it private', await a.evaluate("window.__ui.items()[window.__ui.cursor].value === 'Friends with the code'"));
  check('the cursor reaches Make the room', await arrowTo(a, 'friends-make'));
  await a.tap('Enter');
  await a.until("window.__rooms().phase === 'open'", 30000).catch(() => {});
  const room = await a.evaluate('window.__rooms()');
  check('Enter makes a room', room.phase === 'open' && /^[A-Z0-9]{6}$/.test(room.code || ''), `${room.phase} ${room.code}`);
  await a.until("window.__ui.items()[0].action === 'fly'", 10000).catch(() => {});
  const inRoom = await a.evaluate(`window.__ui.items().map((it) => ({
    action: it.action || null, label: it.label, value: it.value || '', info: Boolean(it.info), primary: Boolean(it.primary),
  }))`);
  check('Fly is on top of the room, the primary', inRoom[0].action === 'fly' && inRoom[0].primary, JSON.stringify(inRoom[0]));
  check('the aircraft and the world are on the screen, the world as the room\'s fact',
    inRoom.some((it) => it.label === 'Aircraft') && inRoom.some((it) => it.label === 'The world' && it.info && it.value),
    inRoom.map((it) => `${it.label}${it.value ? `=${it.value}` : ''}`).join(', '));
  await shot(a, 'a-3-in-the-room');
  check('the room opened with the cursor on Fly, no arrow pressed',
    await a.evaluate("window.__ui.items()[window.__ui.cursor].action === 'fly'"));
  await a.tap('Enter');
  await a.until("window.__craftState && window.__craftState().mode === 'flight'", 400000).catch(() => {});
  const flying = await a.evaluate("({ mode: window.__craftState().mode, map: window.__map().id, phase: window.__rooms().phase, screen: window.__ui.screen })");
  check('Enter is flight, in the Swiss valley, still in the room',
    flying.mode === 'flight' && flying.map === 'swiss2' && flying.phase === 'open', JSON.stringify(flying));

  /* THE PHONE, AND THE OTHER WAY INTO A ROOM. */
  const pc = await b.evaluate(CARDS);
  const pv = await b.evaluate(VIEW);
  check('upright phone: five cards stacked inside the window, tags clear of the bar',
    pc.length === 5 && inside(pc, pv) && apart(pc) && pc.every((c, i) => i === 0 || c.box[1] >= pc[i - 1].box[3]),
    `${JSON.stringify(pc.map((c) => [...c.box, c.factsBottom]))} bar at ${pv.bar}`);
  check('and no sideways scroll', pv.sw <= pv.w, `${pv.sw} > ${pv.w}`);
  await shot(b, 'b-1-phone-gate');
  /* A smaller upright phone, and one on its side, where the cards go back
   * to a row (the max-height 520 rule). Then back to the first size. */
  for (const [w, h, row] of [[360, 640, false], [844, 390, true]]) {
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
  await click(b, '.gate-card-friends');
  await b.until("window.__ui.screen === 'friends'", 10000).catch(() => {});
  check('a tap on the card opens the room screen on the phone', await b.evaluate("window.__ui.screen === 'friends'"));
  /*
   * B picks another world before joining, on the room screen's World row,
   * so the room's welcome has to seat A's world back: on the screen B is
   * on, not by throwing B out to the title, which a welcome did before.
   */
  check('the cursor reaches The world', await arrowTo(b, 'The world'));
  await b.tap('ArrowRight');
  await b.until("window.__ui.settings.map !== 'swiss2'", 5000).catch(() => {});
  const other = await b.evaluate('window.__ui.settings.map');
  check('Right on it seats another world, on this screen', other !== 'swiss2' && await b.evaluate("window.__ui.screen === 'friends'"), other);
  await b.until(`window.__map().id === ${JSON.stringify(other)} && window.__map().ready`, 400000).catch(() => {});
  check('the cursor reaches Join with a code', await arrowTo(b, 'friends-join'));
  await b.tap('Enter');
  await b.until("document.querySelector('.name-dialog-input') && !document.querySelector('.name-dialog').hidden", 10000).catch(() => {});
  await b.cdp.send('Input.insertText', { text: room.code.toLowerCase() }, b.sessionId);
  await b.tap('Enter');
  await b.until("window.__rooms().phase === 'open' && window.__rooms().peers.length === 1", 30000).catch(() => {});
  const joined = await b.evaluate('window.__rooms()');
  check('the code typed on the phone joins A\'s room on seat 2', joined.phase === 'open' && joined.code === room.code && joined.seat === 2,
    `${joined.phase} ${joined.code} seat ${joined.seat}`);
  check('and B stays on the room screen, the cursor on Fly', await b.evaluate("window.__ui.screen === 'friends' && window.__ui.items()[window.__ui.cursor].action === 'fly'"));
  const seated = await b.evaluate(`({
    map: window.__ui.settings.map,
    world: (window.__ui.items().find((it) => it.label === 'The world') || {}).value,
  })`);
  check('seated back in the room\'s world, which the World row now states', seated.map === 'swiss2' && /Swiss/.test(seated.world || ''), JSON.stringify(seated));

  /*
   * THE OWNER'S REPORT: in a room reached from Track mode's menu row
   * there was no way to start flying. B, still in the room, goes back to
   * the gate, answers Track mode, and comes back to the room by the
   * menu's Fly with friends row: Fly is on top, under the cursor.
   */
  await b.tap('Escape');
  await b.until("window.__ui.screen === 'title'", 10000).catch(() => {});
  await b.tap('Escape');
  await b.until('window.__ui.onGate()', 10000).catch(() => {});
  await b.evaluate("(() => { const i = window.__ui.items().findIndex((it) => it.action === 'way-race-5inch'); window.__ui.setCursor(i); return true; })()");
  await b.tap('Enter');
  await b.until('window.__ui.carousel.isOpen', 10000).catch(() => {});
  await b.tap('Enter');
  await b.until("window.__ui.mode === 'race' && window.__ui.screen === 'courses'", 30000).catch(() => {});
  await b.tap('Escape');
  await b.until("window.__ui.screen === 'title' && !window.__ui.onGate()", 10000).catch(() => {});
  check('Track mode\'s menu has the Fly with friends row', await arrowTo(b, 'friends'));
  await b.tap('Enter');
  await b.until("window.__ui.screen === 'friends'", 10000).catch(() => {});
  const race = await b.evaluate(`({
    mode: window.__ui.mode, phase: window.__rooms().phase,
    top: window.__ui.items()[0].action, on: window.__ui.items()[window.__ui.cursor].action,
  })`);
  check('in Track mode, in the room: Fly on top and under the cursor', race.mode === 'race' && race.phase === 'open'
    && race.top === 'fly' && race.on === 'fly', JSON.stringify(race));
  await shot(b, 'b-3-phone-track-mode-room');
  await shot(b, 'b-2-phone-in-the-room');

  const errs = [...a.errors, ...b.errors];
  check('no page error on either page', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await a.close();
  await b.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
