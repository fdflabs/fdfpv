/*
 * rooms-browser-three-page.js: the room browser through the real shell,
 * three headless pages, the way three children would use it (the owner's
 * request of 2026-09-28: public rooms listed by name, joined with no code,
 * named when made).
 *
 *   SIM_GPU=1 node scripts/rooms-browser-three-page.js [rooms origin] [outdir]
 *
 * With no origin it starts edge/rooms/node.js itself on a scratch SQLite
 * file, which is the production server; given one, it uses that (never
 * the live VM: this makes rooms).
 *
 * C makes a PRIVATE room called Secret Base. A opens Fly with friends,
 * then Make a room, types a name the word filter refuses and is told so
 * with nothing made, then types "Sky  Club", keeps it public on the Swiss
 * valley and makes it. B opens Rooms from Fly with friends and finds Sky
 * Club listed with its pilot count, and no Secret Base; one mouse click
 * on the row and B is in. C leaves its private room, opens Rooms, and
 * Enter joins Sky Club. All three are in one room, each seeing the other
 * two, and the list counts three. In the room B sees its name and no
 * invite code, and reports the name from the room's own row.
 *
 * Pictures in outdir, not in the repository: a picture is evidence for
 * one round.
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
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import en from '../src/strings/en.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let rooms = process.argv[2] || '';
const outDir = process.argv[3] || join(root, 'build', 'rooms-browser');

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

function seedFor(id) {
  const s = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, id);
  s.map = 'swiss2';
  s.freestyleMap = 'swiss2';
  s.graphics = 'low';
  s.fpsCap = 0;
  s.airframeAsked = true;
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    if (!s.roomsSeeded) {
      Object.assign(s, ${JSON.stringify(s)}, { roomsSeeded: true });
      localStorage.setItem(k, JSON.stringify(s));
    }
  } catch (e) { /* storage refused */ }`];
}

async function shot(page, name) {
  await mkdir(outDir, { recursive: true });
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  const path = join(outDir, `${name}.png`);
  await writeFile(path, Buffer.from(data, 'base64'));
  console.log(`  shot ${path}`);
}

/* The rows on screen, as the pilot reads them. */
const ROWS = `window.__ui.items().map((it) => ({
  action: it.action || null, label: it.label, value: it.value || '', note: it.note || '', primary: Boolean(it.primary),
}))`;

/* The cursor onto the row with this action or label, by the arrows. */
async function arrowTo(page, want) {
  for (let i = 0; i < 24; i += 1) {
    const here = await page.evaluate('(() => { const it = window.__ui.items()[window.__ui.cursor]; return it ? [it.action, it.label] : []; })()');
    if (here.includes(want)) {
      return true;
    }
    await page.tap('ArrowDown');
    await page.sleep(120);
  }
  return false;
}

/* A mouse click on the menu row with this action, as a pilot's. */
async function clickRow(page, action) {
  const at = await page.evaluate(`(() => {
    const i = window.__ui.items().findIndex((it) => it.action === ${JSON.stringify(action)});
    const row = window.__ui.menuRows[i - window.__ui.rowOffset];
    if (!row) {
      return null;
    }
    row.scrollIntoView({ block: 'center' });
    const r = row.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  })()`);
  if (!at) {
    return false;
  }
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await page.cdp.send('Input.dispatchMouseEvent', { type, x: at[0], y: at[1], button: 'left', clickCount: 1 }, page.sessionId);
  }
  return true;
}

/* Type into the name form and confirm it. */
async function typeName(page, text) {
  await page.until("document.querySelector('.name-dialog-input') && !document.querySelector('.name-dialog').hidden", 10000);
  await page.evaluate("document.querySelector('.name-dialog-input').select(); true");
  await page.cdp.send('Input.insertText', { text }, page.sessionId);
  await page.tap('Enter');
  await page.until("document.querySelector('.name-dialog').hidden", 10000);
}

let local = null;
let scratch = null;
if (!rooms) {
  scratch = await mkdtemp(join(tmpdir(), 'fdfpv-browser-'));
  const { startRooms } = await import('../edge/rooms/node.js');
  local = await startRooms({ db: join(scratch, 'rooms.db'), port: 0 });
  rooms = `http://127.0.0.1:${local.port}`;
}

const url = `/index.html?lang=en&rooms=${encodeURIComponent(rooms)}`;
console.log(`the room browser, three pages, rooms at ${rooms}${local ? ' (edge/rooms/node.js, started here)' : ''}`);
const a = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('cub1400') });
const b = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('p51d1450') });
const c = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('5inch') });
try {
  for (const p of [a, b, c]) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__map && window.__map().ready', 400000);
  }

  console.log('C makes a private room');
  const secret = await c.evaluate("window.__roomCreate({ public: false, name: 'Secret Base' })");
  await c.until("window.__rooms().phase === 'open'", 30000);
  check('C is in its private room', /^[A-Z0-9]{6}$/.test(secret) && !(await c.evaluate('window.__rooms().public')), secret);

  console.log('A makes a public room and names it');
  await a.evaluate("window.__ui.act('friends'); true");
  await a.until("window.__ui.screen === 'friends' && window.__ui.items().some((it) => it.action === 'rooms')", 15000);
  const friendsRows = await a.evaluate(ROWS);
  check('Fly with friends opens on Rooms, under the cursor', friendsRows[0].action === 'rooms' && friendsRows[0].primary
    && await a.evaluate("window.__ui.items()[window.__ui.cursor].action === 'rooms'"), JSON.stringify(friendsRows[0]));
  check('the cursor reaches Make a room', await arrowTo(a, 'roomnew'));
  await a.tap('Enter');
  await a.until("window.__ui.screen === 'roomnew'", 10000);
  check('Make a room opens on its Make the room row', await a.evaluate("window.__ui.items()[window.__ui.cursor].action === 'friends-make'"));
  check('the cursor reaches the name', await arrowTo(a, 'friends-roomname'));
  await a.tap('Enter');
  await typeName(a, 'Fuck Club');
  check('the cursor reaches Make the room', await arrowTo(a, 'friends-make'));
  await a.tap('Enter');
  await a.until(`window.__ui.items().some((it) => it.action === 'friends-make' && it.note === ${JSON.stringify(en['roombrowser.bad_name'])})`, 15000).catch(() => {});
  check('a name the server\'s word filter refuses is refused on screen, and nothing is made',
    await a.evaluate(`window.__ui.items().some((it) => it.action === 'friends-make' && it.note === ${JSON.stringify(en['roombrowser.bad_name'])})`)
    && await a.evaluate("window.__rooms().phase === 'idle' && window.__ui.screen === 'roomnew'"));
  await arrowTo(a, 'friends-roomname');
  await a.tap('Enter');
  await typeName(a, '  Sky   Club ');
  const draft = await a.evaluate(ROWS);
  const pick = (label) => (draft.find((r) => r.label === label) || {}).value;
  check('the draft reads Sky Club, public, the Swiss valley, just fly', pick(en['roombrowser.name']) === 'Sky Club'
    && pick(en['roombrowser.kind']) === en['roombrowser.public'] && /Swiss/.test(pick(en['ui.the_world']) || '')
    && pick(en['roombrowser.game']) === en['roombrowser.mode_none'], JSON.stringify(draft.map((r) => `${r.label}=${r.value}`)));
  await arrowTo(a, 'friends-make');
  await shot(a, '1-make-a-room');
  await a.tap('Enter');
  await a.until("window.__rooms().phase === 'open' && window.__ui.screen === 'friends'", 30000);
  const ra = await a.evaluate('window.__rooms()');
  check('A is in its public room, named Sky Club, as its host', ra.public && ra.name === 'Sky Club' && ra.seat === 1 && ra.host === ra.seat,
    JSON.stringify({ code: ra.code, name: ra.name, seat: ra.seat, host: ra.host }));

  console.log('B finds it in Rooms and clicks it');
  await b.evaluate("window.__ui.act('friends'); true");
  await b.until("window.__ui.screen === 'friends'", 10000);
  await b.until(`window.__ui.items()[0].action === 'rooms' && window.__ui.items()[0].value === ${JSON.stringify(en['roombrowser.entry_value'].replace('{n}', '1'))}`, 20000).catch(() => {});
  check('Fly with friends says one room is open: the private one is not counted',
    await b.evaluate(`window.__ui.items()[0].value === ${JSON.stringify(en['roombrowser.entry_value'].replace('{n}', '1'))}`),
    await b.evaluate('window.__ui.items()[0].value'));
  await b.tap('Enter');
  await b.until("window.__ui.screen === 'rooms'", 10000);
  const action = `friends-room-${ra.code}`;
  await b.until(`window.__ui.items().some((it) => it.action === ${JSON.stringify(action)})`, 20000).catch(() => {});
  const listed = await b.evaluate(ROWS);
  const row = listed.find((r) => r.action === action);
  check('Rooms lists Sky Club with its pilots and cap, first, under the cursor', row && row.label === 'Sky Club' && row.value === '1 of 16'
    && row.primary && await b.evaluate(`window.__ui.items()[window.__ui.cursor].action === ${JSON.stringify(action)}`), JSON.stringify(row));
  check('with its world and what it is doing', row && /Swiss/.test(row.note) && row.note.includes(en['roombrowser.free']), row && row.note);
  check('and never the private room, by name or by code', !listed.some((r) => r.label === 'Secret Base' || (r.action || '').endsWith(secret)),
    listed.map((r) => r.label).join(' | '));
  await shot(b, '2-rooms-list');
  check('one click on the row', await clickRow(b, action));
  await b.until(`window.__rooms().phase === 'open' && window.__rooms().code === ${JSON.stringify(ra.code)}`, 30000).catch(() => {});
  check('and B is in Sky Club, no code typed', await b.evaluate(`window.__rooms().code === ${JSON.stringify(ra.code)} && window.__rooms().name === 'Sky Club'`));

  console.log('C leaves its private room and joins from Rooms with Enter');
  await c.evaluate("window.__ui.act('friends'); true");
  await c.evaluate("window.__ui.onFriends('friends-leave'); true");
  await c.until("window.__rooms().phase === 'idle'", 10000);
  await c.evaluate("window.__ui.act('rooms'); true");
  await c.until(`window.__ui.screen === 'rooms' && window.__ui.items()[window.__ui.cursor].action === ${JSON.stringify(action)}`, 20000).catch(() => {});
  const cRow = (await c.evaluate(ROWS)).find((r) => r.action === action);
  check('C sees Sky Club with two pilots now', cRow && cRow.value === '2 of 16', JSON.stringify(cRow));
  await c.tap('Enter');
  await c.until(`window.__rooms().phase === 'open' && window.__rooms().code === ${JSON.stringify(ra.code)}`, 30000).catch(() => {});

  console.log('all three in one room');
  for (const [name, p] of [['A', a], ['B', b], ['C', c]]) {
    await p.until('window.__rooms().peers.length === 2', 20000).catch(() => {});
    const r = await p.evaluate('window.__rooms()');
    check(`${name} sees the other two`, r.code === ra.code && r.peers.length === 2, `${r.code} ${r.peers.length}`);
  }
  const seats = await Promise.all([a, b, c].map((p) => p.evaluate('window.__rooms().seat')));
  check('on three seats', new Set(seats).size === 3, seats.join());
  await b.until(`window.__ui.items().some((it) => it.label === ${JSON.stringify(en['roombrowser.room'])} && it.value === 'Sky Club')`, 10000).catch(() => {});
  const inRoom = await b.evaluate(ROWS);
  check('the room screen names the room', inRoom.some((r) => r.label === en['roombrowser.room'] && r.value === 'Sky Club'));
  check('and shows no invite code: a public room has none to give', !inRoom.some((r) => r.action === 'friends-copy' || r.value === ra.code),
    inRoom.map((r) => `${r.label}=${r.value}`).join(' | '));
  check('the Fly with friends row names it too', (await b.evaluate("window.__ui.friendsRow().value")).startsWith('Sky Club'));
  check('the cursor reaches the report for a bad room name', await arrowTo(b, 'friends-reportname'));
  await b.tap('Enter');
  await b.until(`window.__ui.items().some((it) => it.label === ${JSON.stringify(en['friends.say'])} && it.value === ${JSON.stringify(en['friends.reported_room'])})`, 10000).catch(() => {});
  check('and Enter reports it, which the room acknowledges',
    await b.evaluate(`window.__ui.items().some((it) => it.label === ${JSON.stringify(en['friends.say'])} && it.value === ${JSON.stringify(en['friends.reported_room'])})`));
  await shot(b, '3-in-sky-club');
  const list = await (await fetch(`${rooms}/v2/rooms`)).json();
  const line = list.rooms.find((r) => r.code === ra.code);
  check('the server lists Sky Club with three pilots, and nothing private', line && line.n === 3 && !list.rooms.some((r) => r.code === secret), JSON.stringify(list));

  const errs = [...a.errors, ...b.errors, ...c.errors].filter((e) => !e.startsWith('network:'));
  check('no page error on any page', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await a.close();
  await b.close();
  await c.close();
  if (local) {
    await local.stop();
    await rm(scratch, { recursive: true, force: true });
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
