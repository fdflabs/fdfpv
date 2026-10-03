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
 * Then the lobby (the owner, 2026-09-30): B opens Rooms from inside the
 * room and finds it on top, with its pilots and Leave, and not again in
 * the list; a public room nobody has joined is listed as empty with the
 * minutes before it closes. B leaves with the arrows and Enter: Leave is
 * the one way out of a room and goes to the title (docs/FLOW-AUDIT.md
 * rule 5), whose rooms panel and then Rooms list the room again with two.
 *
 * A server that is already in use (the live VM) has other rooms, left by
 * earlier runs or flown by pilots, so the room's name carries this run's
 * number and every check reads this run's rooms by code, never a count
 * or an order of the whole list. Runs against one server go a minute
 * apart: each makes three rooms from this machine's one address, and the
 * create limit (edge/rooms/front.js CREATES_PER_MIN) is six a minute.
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
import { seatPilot } from '../tests/lib/roompilot.js';
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
  await page.loaded();
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
const NAME = `Sky Club ${100 + Math.floor(Math.random() * 900)}`;
/* The busiest listed room with a seat, which the list puts first and
 * under the cursor: this run's, unless somebody else's has more pilots. */
const BUSIEST = `(() => {
  const it = window.__ui.items().find((x) => x.action && x.action.startsWith('friends-room-'));
  return it ? it.action : null;
})()`;
const HERE = '(() => { const it = window.__ui.items()[window.__ui.cursor]; return it ? it.action || it.label : null; })()';
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
  await typeName(a, `  ${NAME.replace(' ', '   ')} `);
  const draft = await a.evaluate(ROWS);
  const pick = (label) => (draft.find((r) => r.label === label) || {}).value;
  check('the draft reads Sky Club, public, the Swiss valley, just fly', pick(en['roombrowser.name']) === NAME
    && pick(en['roombrowser.kind']) === en['roombrowser.public'] && /Swiss/.test(pick(en['ui.the_world']) || '')
    && pick(en['roombrowser.game']) === en['roombrowser.mode_none'], JSON.stringify(draft.map((r) => `${r.label}=${r.value}`)));
  await arrowTo(a, 'friends-make');
  await shot(a, '1-make-a-room');
  await a.tap('Enter');
  await a.until("window.__rooms().phase === 'open' && window.__ui.screen === 'friends'", 30000);
  const ra = await a.evaluate('window.__rooms()');
  check('A is in its public room, named Sky Club, as its host', ra.public && ra.name === NAME && ra.seat === 1 && ra.host === ra.seat,
    JSON.stringify({ code: ra.code, name: ra.name, seat: ra.seat, host: ra.host }));

  console.log('B finds it in Rooms and clicks it');
  await b.evaluate("window.__ui.act('friends'); true");
  await b.until("window.__ui.screen === 'friends'", 10000);
  await b.until("window.__ui.items()[0].action === 'rooms' && window.__ui.items()[0].value !== ''", 20000).catch(() => {});
  const open = (await (await fetch(`${rooms}/v2/rooms`)).json()).rooms;
  const entry = await b.evaluate('window.__ui.items()[0].value');
  check('Fly with friends counts the open rooms, this one in and the private one out',
    open.some((r) => r.code === ra.code) && !open.some((r) => r.code === secret)
    && entry === en['roombrowser.entry_value'].replace('{n}', String(open.length)), `${entry}, ${open.length} listed`);
  await b.tap('Enter');
  await b.until("window.__ui.screen === 'rooms'", 10000);
  const action = `friends-room-${ra.code}`;
  await b.until(`window.__ui.items().some((it) => it.action === ${JSON.stringify(action)})`, 20000).catch(() => {});
  const listed = await b.evaluate(ROWS);
  const row = listed.find((r) => r.action === action);
  check('Rooms lists this room with its name, its pilots and cap', row && row.label === NAME && row.value === '1 of 16', JSON.stringify(row));
  const bFirst = await b.evaluate(BUSIEST);
  check('and the cursor is on the busiest room, first in the list', bFirst && await b.evaluate(HERE) === bFirst, `${await b.evaluate(HERE)} ${bFirst}`);
  check('with its world and what it is doing', row && /Swiss/.test(row.note) && row.note.includes(en['roombrowser.free']), row && row.note);
  check('and never the private room, by name or by code', !listed.some((r) => r.label === 'Secret Base' || (r.action || '').endsWith(secret)),
    listed.map((r) => r.label).join(' | '));
  await shot(b, '2-rooms-list');
  check('one click on the row', await clickRow(b, action));
  await b.until(`window.__rooms().phase === 'open' && window.__rooms().code === ${JSON.stringify(ra.code)}`, 30000).catch(() => {});
  check('and B is in the room, no code typed', await b.evaluate(`window.__rooms().code === ${JSON.stringify(ra.code)} && window.__rooms().name === ${JSON.stringify(NAME)}`));

  console.log('C leaves its private room and joins from Rooms with Enter');
  await c.evaluate("window.__ui.act('friends'); true");
  await c.evaluate("window.__ui.onFriends('friends-leave'); true");
  await c.until("window.__rooms().phase === 'idle'", 10000);
  await c.evaluate("window.__ui.act('rooms'); true");
  /* C opens Rooms before its list has ever arrived: the cursor must move
   * to the busiest room when it does, not stay on Make a room. */
  await c.until(`window.__ui.screen === 'rooms' && window.__ui.items().some((it) => it.action === ${JSON.stringify(action)})`, 20000).catch(() => {});
  await c.sleep(300);
  const cRow = (await c.evaluate(ROWS)).find((r) => r.action === action);
  check('C sees the room with two pilots now', cRow && cRow.value === '2 of 16', JSON.stringify(cRow));
  const cFirst = await c.evaluate(BUSIEST);
  check('and the cursor went to the busiest room as the list arrived', cFirst && await c.evaluate(HERE) === cFirst, `${await c.evaluate(HERE)} ${cFirst}`);
  check('the cursor reaches this run\'s room', await arrowTo(c, action));
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
  await b.until(`window.__ui.items().some((it) => it.label === ${JSON.stringify(en['roombrowser.room'])} && it.value === ${JSON.stringify(NAME)})`, 10000).catch(() => {});
  const inRoom = await b.evaluate(ROWS);
  check('the room screen names the room', inRoom.some((r) => r.label === en['roombrowser.room'] && r.value === NAME));
  check('and shows no invite code: a public room has none to give', !inRoom.some((r) => r.action === 'friends-copy' || r.value === ra.code),
    inRoom.map((r) => `${r.label}=${r.value}`).join(' | '));
  check('the Fly with friends row names it too', (await b.evaluate("window.__ui.friendsRow().value")).startsWith(NAME));
  check('the cursor reaches the report for a bad room name', await arrowTo(b, 'friends-reportname'));
  await b.tap('Enter');
  await b.until(`window.__ui.items().some((it) => it.label === ${JSON.stringify(en['friends.say'])} && it.value === ${JSON.stringify(en['friends.reported_room'])})`, 10000).catch(() => {});
  check('and Enter reports it, which the room acknowledges',
    await b.evaluate(`window.__ui.items().some((it) => it.label === ${JSON.stringify(en['friends.say'])} && it.value === ${JSON.stringify(en['friends.reported_room'])})`));
  await shot(b, '3-in-sky-club');
  const list = await (await fetch(`${rooms}/v2/rooms`)).json();
  const line = list.rooms.find((r) => r.code === ra.code);
  check('the server lists the room with three pilots, and nothing private', line && line.n === 3 && !list.rooms.some((r) => r.code === secret), JSON.stringify(list));

  console.log('the lobby, from inside the room');
  const OWLS = `Night Owls ${100 + Math.floor(Math.random() * 900)}`;
  const owls = await (await fetch(`${rooms}/v2/create`, {
    method: 'POST', headers: { origin: 'http://127.0.0.1', 'content-type': 'application/json' }, body: JSON.stringify({ map: 'alps', public: true, name: OWLS }),
  })).json();
  check('a public room nobody joins is made', /^[A-Z0-9]{6}$/.test(owls.code || ''), JSON.stringify(owls));
  const owlsAction = `friends-room-${owls.code}`;
  await b.evaluate("window.__ui.act('rooms'); true");
  await b.until(`window.__ui.screen === 'rooms' && window.__ui.items().some((it) => it.label === ${JSON.stringify(en['roombrowser.here_section'])})`, 20000).catch(() => {});
  await b.sleep(2000);
  check('a public room nobody is in is not listed (the owner, 2026-10-02)', !(await b.evaluate(ROWS)).some((r) => r.action === owlsAction));
  const owlPilot = await seatPilot(rooms, owls.code, [9, 9, 99]);
  await b.until(`window.__ui.items().some((it) => it.action === ${JSON.stringify(owlsAction)})`, 20000).catch(() => {});
  const lobby = await b.evaluate(ROWS);
  check('Rooms opens with the room B is in on top: its name, its pilots, and Leave',
    lobby[0].label === en['roombrowser.here_section'] && lobby[1].label === NAME && lobby[1].value === '3 pilots' && lobby[2].action === 'friends-leave',
    lobby.slice(0, 3).map((r) => `${r.label}=${r.value}`).join(' | '));
  check('and does not list it again below', !lobby.some((r) => r.action === action));
  const owlRow = lobby.find((r) => r.action === owlsAction);
  check('and is, with its pilot in it', owlRow && owlRow.label === OWLS && owlRow.value === '1 of 16', JSON.stringify(owlRow));
  owlPilot.close();
  check('Make a room and Join with a code are on the same screen', lobby.some((r) => r.action === 'roomnew') && lobby.some((r) => r.action === 'friends-join'));
  await shot(b, '4-lobby-in-room');
  check('the cursor reaches Leave', await arrowTo(b, 'friends-leave'));
  await b.tap('Enter');
  await b.until("window.__rooms().phase === 'idle' && window.__ui.onGate()", 10000).catch(() => {});
  await b.until(`window.__ui.items().some((it) => it.action === ${JSON.stringify(`lobby:${action}`)} && it.value === 'Free flight · 2 in lobby')`, 20000).catch(() => {});
  const gate = await b.evaluate(ROWS);
  check('Enter on it leaves for the title (Leave goes to the title, FLOW-AUDIT rule 5), whose rooms panel lists the room again, its two pilots in its lobby',
    await b.evaluate("window.__rooms().phase === 'idle' && window.__ui.onGate()") && gate.some((r) => r.action === `lobby:${action}` && r.value === 'Free flight · 2 in lobby'),
    gate.map((r) => `${r.label}=${r.value}`).join(' | '));
  await shot(b, '5-title-after-leave');
  await b.evaluate("(() => { window.__ui.act('way-friends'); window.__ui.act('rooms'); return true; })()");
  await b.until(`window.__ui.screen === 'rooms' && window.__ui.items().some((it) => it.action === ${JSON.stringify(action)} && it.value === '2 of 16')`, 20000).catch(() => {});
  const after = await b.evaluate(ROWS);
  check('and Rooms lists it with two, and no room of B\'s on top',
    await b.evaluate("window.__ui.screen === 'rooms'") && after.some((r) => r.action === action && r.value === '2 of 16')
    && !after.some((r) => r.label === en['roombrowser.here_section']), after.map((r) => `${r.label}=${r.value}`).join(' | '));
  await shot(b, '6-lobby-after-leave');

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
