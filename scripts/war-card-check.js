/*
 * war-card-check.js: the title's Defend the Paraná card and Make a room's
 * Defend the Paraná game, driven through the real shell the way a pilot drives
 * them, in one page, against a local rooms server (never the live one):
 *
 *   npm run war:card                       starts its own on port 8819
 *   npm run war:card -- http://127.0.0.1:8797 [outdir]
 *
 * The gate draws five cards, no Defend Itaipu among them (the owner took
 * it off on 2026-09-30; Defend the Paraná is the way in now) and no Fly
 * with friends (taken off 2026-10-02: every card is a room now), inside the window at 1280x720, 1920x1080, 390x844, 360x640 and
 * 844x390, tags clear of the command bar, no sideways scroll; and again
 * with three public rooms of 32 letter names listed above them, no name
 * cut, an upright phone's panel listing two.
 *
 * The way in: Defend the Paraná on home opens its campaign page, four
 * missions; mission 1's Play with no consent stored is the consent
 * screen; Back leaves the pilot on that page with no room; Play again and
 * Continue:
 * a PUBLIC room named for its host (the owner opened the war to public
 * rooms on 2026-10-01 so a friend finds it), this pilot its host, Itaipu
 * seated, the room screen with the war's start row under the cursor,
 * listed as the war's with its mission. Reloaded (consent now stored),
 * the way in (the page, then Play) goes to a new Itaipu room with no
 * consent screen at all.
 *
 * Make a room, opened while the lobby still builds the mission's world,
 * stays up when that build ends. Its Game row offers Defend the Paraná on
 * Itaipu, public or private, with a Mission row, and only there; making it asks consent
 * first when it is not stored, then lands the same way. A pilot without
 * the consent who joins a room made for the war by its code is asked on
 * arrival: Back leaves it, Continue stays.
 *
 * A public room on Itaipu, joined by a pilot who came in by the card:
 * the heading never says Defend the Paraná; a joiner reads why not and to ask
 * the host; the host has Make a private war room, which asks consent and
 * lands in a new private Itaipu room, war ready, its invite code on top.
 *
 * Leave from a war on: the pause keeps the room, draws nothing of the war
 * and offers Leave the room where Back to title was; the title is out of
 * the room, and nothing of the war or the room (callouts, splash, hint,
 * HUD, banner, round card, the room's notice) is drawn over it. Its rooms
 * panel still lists a room and joins it; Escape on that room screen
 * stays in it, and its Leave is the title, out of it.
 *
 * The Toilet paper combat card after that: the pilot is on the room
 * screen with Make a room under combat's heading, and not flown into the
 * war.
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
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import WebSocket from 'ws';
import { openPage } from '../tests/lib/page.js';
import { seatPilot } from '../tests/lib/roompilot.js';
import { PROTO, ROOM_LEVEL, WAR_JOIN } from '../src/share/roomwire.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = process.argv[3] || join(root, 'build', 'war-card');

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

/* A rooms server of our own unless one is named, on a throwaway database. */
async function roomsServer() {
  if (process.argv[2]) {
    return { url: process.argv[2], stop: async () => {} };
  }
  const dir = await mkdtemp(join(tmpdir(), 'war-card-rooms-'));
  const port = 8819;
  const proc = spawn(process.execPath, [join(root, 'edge/rooms/node.js')], {
    env: { ...process.env, ROOMS_DB: join(dir, 'rooms.db'), PORT: String(port) },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const url = `http://127.0.0.1:${port}`;
  const stop = async () => {
    proc.kill('SIGTERM');
    await rm(dir, { recursive: true, force: true });
  };
  for (let i = 0; i < 100; i += 1) {
    try {
      await fetch(`${url}/v2/rooms`);
      return { url, stop };
    } catch (e) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  await stop();
  throw new Error(`rooms server did not come up on ${url}`);
}

const HUBS = 'Flight Club,Operations,Hangar';
const CLUB = 'Track Day,Free Flight,Streamer Combat,Catch the Ace!';

const LAYOUT = `(() => ({
  w: window.innerWidth, h: window.innerHeight, sw: document.documentElement.scrollWidth,
  bar: document.querySelector('.frame-bot').getBoundingClientRect().top,
  cards: [...document.querySelectorAll('.screen-title .gate-card')].map((c) => {
    const r = c.getBoundingClientRect();
    const img = c.querySelector('.gate-card-shot');
    return {
      name: c.querySelector('.gate-card-name').textContent,
      loaded: Boolean(img && img.complete && img.naturalWidth > 0),
      mark: Boolean(c.querySelector('.gate-card-mark svg')),
      links: [...c.querySelectorAll('.gate-link')].map((l) => l.textContent),
      box: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
      facts: Math.round(Math.max(...[...c.querySelectorAll('.gate-card-facts, .gate-link')].map((n) => n.getBoundingClientRect().bottom))),
    };
  }),
}))()`;

function laidOut(v, n) {
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

/* The consent screen, open: its title, or null. */
/* The open dialog's title, or null; the campaign's page, which shares
 * the dialog and the operation's name, is not a dialog here. */
const DIALOG = "(() => { const d = document.querySelector('.name-dialog'); return d && !d.hidden && !d.querySelector('.campaign-box') ? (d.querySelector('h2') || {}).textContent || '' : null; })()";
/* The campaign's page, its page and missions, or null when it is not up. */
const PAGE = "(() => { const d = document.querySelector('.name-dialog'); const box = d && !d.hidden ? d.querySelector('.campaign-box') : null; return box ? { page: box.dataset.page, missions: box.querySelectorAll('.campaign-mission').length } : null; })()";

/* The way in: Defend the Paraná on home, its campaign page, mission 1's Play. */
async function playMission1(page) {
  /* A reload puts the pilot back in the room it was in, once its
   * autojoin (main.js roomFrame) has had its frames: Leave first. */
  await page.evaluate(`new Promise((done) => {
    let n = 0;
    const step = () => (n += 1) >= 30 ? done(true) : requestAnimationFrame(step);
    requestAnimationFrame(step);
  })`);
  if (await page.evaluate("window.__rooms().phase !== 'idle'")) {
    await page.evaluate("(() => { window.__ui.act('friends-leave'); return true; })()");
    await page.until("window.__rooms().phase === 'idle'", 10000).catch(() => {});
  }
  await page.until('window.__ui.onGate()', 60000).catch(() => {});
  for (let i = 0; i < 2 && await page.evaluate('window.__ui.hub !== null'); i += 1) {
    await page.tap('Escape');
    await page.sleep(400);
  }
  await page.until('window.__ui.hub === null', 10000).catch(() => {});
  await click(page, '.gate-card-campaign');
  await page.until(`${PAGE} !== null`, 10000).catch(() => {});
  const v = await page.evaluate(PAGE);
  await click(page, '[data-mission="itaipu-1"] .campaign-play');
  return v;
}

/* Answer the open dialog from the keyboard, Enter for Continue and
 * Escape for Back, once its deaf period (askConfirm) has passed. */
async function answer(page, label) {
  await page.sleep(700);
  await page.tap(label === 'Back' ? 'Escape' : 'Enter');
}

/* Counts every time the consent screen opens, from now on. */
const WATCH_DIALOG = `(() => {
  window.__warCardDialogs = 0;
  let open = false;
  setInterval(() => {
    const d = document.querySelector('.name-dialog');
    const now = Boolean(d && !d.hidden && !d.querySelector('.campaign-box'));
    if (now && !open) { window.__warCardDialogs += 1; }
    open = now;
  }, 20);
  return true;
})()`;

/* Where a pilot who made a room for the war has landed. */
const LANDED = `(() => {
  const ui = window.__ui;
  const r = window.__rooms();
  const items = ui.items();
  const here = items[ui.cursor] || {};
  return {
    phase: r.phase, code: r.code, public: r.public, host: r.host !== null && r.host === r.seat,
    screen: ui.screen, map: ui.settings.map, game: ui.roomGame, consent: ui.settings.warConsent === true,
    here: here.action || here.label || null, primary: Boolean(here.primary),
    heading: (items.find((it) => it.section) || {}).label || null,
    war: items.some((it) => it.action === 'friends-war-start'),
    lobby: (document.querySelector('.war-lobby-title') || {}).textContent || null,
  };
})()`;

function landedWell(v, pub = false) {
  return v.phase === 'open' && /^[A-Z0-9]{6}$/.test(v.code || '') && v.public === pub && v.host && v.screen === 'friends'
    && v.map === 'itaipu' && v.game === 'war' && v.consent && v.war && v.here === 'friends-lobby-ready' && v.primary
    && v.lobby === 'BRIEFING';
}

async function landed(page) {
  /* The lobby's panel is drawn on the frame after its rows (src/main.js
   * warLobbyFrame). */
  await page.until("window.__rooms().phase === 'open' && window.__ui.items().some((it) => it.action === 'friends-war-start') && document.querySelector('.war-lobby-title')", 60000).catch(() => {});
  await page.sleep(500);
  return page.evaluate(LANDED);
}

async function toGate(page) {
  await page.evaluate("(() => { location.reload(); return true; })()");
  await page.sleep(500);
  await page.until('window.__shellReady === true', 300000);
  await page.until("window.__ui.onGate() && document.querySelectorAll('.screen-title .gate-card').length === 3", 60000);
}

/* Flight Club, by a click on its card on home: the rooms panel is there. */
async function toClub(p) {
  await p.until('window.__ui.onGate()', 60000).catch(() => {});
  /* From another hub (a war room's Leave lands in Operations), home first. */
  for (let i = 0; i < 2 && await p.evaluate("window.__ui.hub !== null && window.__ui.hub !== 'club'"); i += 1) {
    await p.tap('Escape');
    await p.sleep(400);
  }
  await p.until("window.__ui.hub === 'club' || document.querySelector('.gate-card-hub-club')", 10000).catch(() => {});
  if (await p.evaluate("window.__ui.hub !== 'club'")) {
    await click(p, '.gate-card-hub-club .gate-card-name');
    await p.until("window.__ui.hub === 'club'", 10000).catch(() => {});
  }
}

const server = await roomsServer();
console.log(`the Defend the Paraná card, rooms at ${server.url}`);
const page = await openPage({ root, url: `/index.html?rooms=${encodeURIComponent(server.url)}`, width: 1280, height: 720 });
try {
  await page.until('window.__shellReady === true', 300000);
  await page.until("window.__ui.onGate() && document.querySelectorAll('.screen-title .gate-card').length === 3", 60000).catch(() => {});
  await page.until(`${LAYOUT}.cards.every((c) => c.loaded)`, 30000).catch(() => {});

  /* HOME, THE THREE HUBS AT EVERY SIZE: the war is Operations', its one
   * link Defend the Paraná. */
  const first = await page.evaluate(LAYOUT);
  check('home is three hubs; Operations\' one link is Defend the Paraná: no Defend Itaipu card (the owner took it off, 2026-09-30), no Fly with friends (2026-10-02)',
    first.cards.map((x) => x.name).join() === HUBS && first.cards[1].links.join() === 'Defend the Paraná'
    && !first.cards.some((x) => x.links.includes('Defend Itaipu') || x.links.includes('Fly with friends')), JSON.stringify(first.cards.map((x) => [x.name, x.links])));
  check('each with its picture loaded and its mark drawn', first.cards.every((x) => x.loaded && x.mark));
  for (const [w, h, row] of [[1280, 720, true], [1920, 1080, true], [390, 844, false], [360, 640, false], [844, 390, true]]) {
    await resize(page, w, h);
    const v = await page.evaluate(LAYOUT);
    const tops = v.cards.map((x) => x.box[1]);
    const shape = row
      ? Math.max(...tops) - Math.min(...tops) <= 4
      : v.cards.every((x, i) => i === 0 || x.box[1] >= v.cards[i - 1].box[3]);
    check(`${w} by ${h}: three hubs ${row ? 'in a row' : 'stacked'}, inside the window, links clear of the bar, no sideways scroll`,
      laidOut(v, 3) && shape, `${JSON.stringify(v.cards.map((x) => [...x.box, x.facts]))} bar ${v.bar} scroll ${v.sw}`);
    await shot(page, `gate-${w}x${h}`);
  }

  /* THE SAME, THREE PUBLIC ROOMS LISTED with names as long as a room's may
   * be (32 letters), as campaign Play names its public war rooms: every
   * name whole, and the cards where they were. An upright phone's panel
   * lists two of them (src/ui/roombrowser.js TITLE_ROOMS_UPRIGHT). */
  const longNames = ['Brave Capybara 17, Defend Itaipu', 'Sunday Morning Freestyle Session', 'Happy Eagle 420, Defend Itaipu!!'];
  /* A pilot in each: an empty room is never listed. */
  const longPilots = [];
  for (const [i, name] of longNames.entries()) {
    const longMade = await fetch(`${server.url}/v2/create`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ map: 'itaipu', public: true, name }),
    });
    longPilots.push(await seatPilot(server.url, (await longMade.json()).code, [i, i + 1, 60 + i]));
  }
  /* The panel is Flight Club's. */
  await resize(page, 1280, 720);
  await toClub(page);
  check('Flight Club\'s four cards', (await page.evaluate(LAYOUT)).cards.map((x) => x.name).join() === CLUB, (await page.evaluate(LAYOUT)).cards.map((x) => x.name).join());
  await page.until("document.querySelectorAll('.gate-rooms-list .gate-room').length === 3", 30000).catch(() => {});
  const PANEL_CUT = `[...document.querySelectorAll('.gate-rooms-count, .gate-room-name, .gate-room-value')]
    .filter((n) => n.getClientRects().length && n.scrollWidth > n.clientWidth + 1).map((n) => n.textContent.trim())`;
  const LONG_LISTED = "[...document.querySelectorAll('.gate-rooms-list .gate-room-name')].map((n) => n.textContent)";
  /* How many rooms the panel lists (src/ui/roombrowser.js): one on a
   * short upright phone, two on an upright one, three otherwise. */
  for (const [w, h, row, n] of [[1280, 720, true, 3], [1920, 1080, true, 3], [390, 844, false, 2], [360, 640, false, 1], [844, 390, true, 3]]) {
    await resize(page, w, h);
    /* The panel follows the window on its media query's change event, a
     * frame or more after the resize. */
    await page.until(`${LONG_LISTED}.length === ${n}`, 15000).catch(() => {});
    await page.sleep(300);
    const v = await page.evaluate(LAYOUT);
    const tops = v.cards.map((x) => x.box[1]);
    const shape = row
      ? Math.max(...tops) - Math.min(...tops) <= 4
      : v.cards.every((x, i) => i === 0 || x.box[1] >= v.cards[i - 1].box[3]);
    const listed = await page.evaluate(LONG_LISTED);
    const cut = await page.evaluate(PANEL_CUT);
    check(`${w} by ${h}, three 32 letter names listed: Flight Club's four cards ${row ? 'in a row' : 'stacked'}, inside the window, tags clear of the bar, no sideways scroll`,
      laidOut(v, 4) && shape, `${JSON.stringify(v.cards.map((x) => [...x.box, x.facts]))} bar ${v.bar} scroll ${v.sw}`);
    check(`${w} by ${h}: the panel lists ${['none', 'one', 'two', 'three'][n]} of them, no name cut`, listed.length === n
      && listed.every((n) => longNames.includes(n)) && cut.length === 0, `${listed.join(' | ')} cut: ${cut.join(' | ')}`);
    await shot(page, `gate-listed-${w}x${h}`);
  }
  await resize(page, 1280, 720);
  for (const p of longPilots) {
    p.close();
  }
  /* The rooms server makes six rooms a minute for an address
   * (edge/rooms/front.js), and the steps below make three more at once. */
  await page.sleep(61000);

  /* FIRST PRESS, NO CONSENT STORED: Defend the Paraná on home, its
   * campaign page, mission 1's Play: the question, and Back is the page. */
  check('a fresh profile has not consented', await page.evaluate('window.__ui.settings.warConsent !== true'));
  const firstPage = await playMission1(page);
  await page.until(`${DIALOG} !== null`, 10000).catch(() => {});
  check('Defend the Paraná on home is its campaign page, four missions, and Play on mission 1 the consent screen',
    firstPage && firstPage.page === 'missions' && firstPage.missions === 4 && (await page.evaluate(DIALOG)) === 'Defend the Paraná',
    JSON.stringify({ firstPage, dialog: await page.evaluate(DIALOG) }));
  await shot(page, 'consent');
  await answer(page, 'Back');
  await page.until(`${DIALOG} === null && ${PAGE} !== null`, 5000).catch(() => {});
  await page.sleep(800);
  const back = await page.evaluate(`({ page: ${PAGE}, phase: window.__rooms().phase, consent: window.__ui.settings.warConsent === true })`);
  check('Back leaves the pilot on the campaign page, no room, nothing stored', back.page && back.page.page === 'missions' && back.phase === 'idle' && !back.consent,
    JSON.stringify(back));

  /* Continue: the public room. */
  await click(page, '[data-mission="itaipu-1"] .campaign-play');
  await page.until(`${DIALOG} !== null`, 10000).catch(() => {});
  await answer(page, 'Continue');
  const one = await landed(page);
  check('Continue: a public Itaipu room, this pilot its host, the war start row under the cursor', landedWell(one, true), JSON.stringify(one));
  const named = await page.evaluate('window.__rooms().name');
  const oneLine = (await (await fetch(`${server.url}/v2/rooms`)).json()).rooms.find((r) => r.code === one.code);
  check('named for its host, and listed as the war\'s, mission 1', /, Paraná$/.test(named || '') && oneLine && oneLine.game === 'war' && oneLine.mission === 'itaipu-1',
    JSON.stringify({ named, oneLine }));
  await shot(page, 'war-room-host');

  /* SECOND PRESS, CONSENT STORED: straight to a room. */
  await toGate(page);
  check('consent survives a reload', await page.evaluate('window.__ui.settings.warConsent === true'));
  await page.evaluate(WATCH_DIALOG);
  await playMission1(page);
  const two = await landed(page);
  check('the way in again: a new public Itaipu room, the start row under the cursor', landedWell(two, true) && two.code !== one.code, JSON.stringify(two));
  check('and no consent screen on the way', (await page.evaluate('window.__warCardDialogs')) === 0, String(await page.evaluate('window.__warCardDialogs')));

  /* MAKE A ROOM'S GAME ROW, opened while the lobby still builds the
   * mission's morning world (warTimeFrame, about 5 s): that build ending
   * must leave the pilot on the form, not throw them back to a room
   * screen with no room. */
  const building = await page.evaluate('!window.__loading.root.hidden');
  await page.evaluate("(() => { window.__ui.act('friends-leave'); window.__ui.roomGame = null; window.__ui.show('roomnew'); return true; })()");
  await page.until("window.__ui.screen === 'roomnew'", 10000).catch(() => {});
  /* Twice: out of the room, the map's own time comes back with a second
   * build once the first is done. */
  await page.until('window.__loading.root.hidden', 120000).catch(() => {});
  await page.sleep(1500);
  await page.until('window.__loading.root.hidden', 120000).catch(() => {});
  const stayed = await page.evaluate("({ screen: window.__ui.screen, built: window.__loading.root.hidden, rows: window.__ui.items().map((it) => it.label).join() })");
  check('a world build ending under Make a room leaves the pilot on it', stayed.screen === 'roomnew' && stayed.built && stayed.rows.includes('Game'),
    JSON.stringify({ building, ...stayed }));
  const row = (label) => `(window.__ui.items().find((it) => it.label === ${JSON.stringify(label)}) || null)`;
  const pick = (label, want) => page.evaluate(`(() => {
    const r = ${row(label)};
    const o = r.options.find((x) => x.label === ${JSON.stringify(want)});
    r.pick(o.value);
    return true;
  })()`);
  const games = () => page.evaluate(`${row('Game')}.options.map((o) => o.label)`);
  const worlds = await page.evaluate(`${row('The world')}.options.map((o) => o.label)`);
  const itaipu = worlds.find((x) => x.startsWith('Itaipu'));
  await pick('The world', itaipu);
  const kinds = await page.evaluate(`${row('Who can join')}.options.map((o) => o.label)`);
  const pub = kinds.find((k) => !/code/i.test(k));
  const priv = kinds.find((k) => /code/i.test(k));
  await pick('Who can join', pub);
  check('public on Itaipu: Defend the Paraná offered', (await games()).includes('Defend the Paraná'), (await games()).join());
  await pick('Game', 'Defend the Paraná');
  check('and with it a Mission row, mission 1', (await page.evaluate(`(${row('Mission')} || {}).value || null`)) === 'Mission 1',
    String(await page.evaluate(`(${row('Mission')} || {}).value || null`)));
  await pick('Game', 'Just fly');
  await pick('Who can join', priv);
  await pick('The world', worlds.find((x) => x !== itaipu));
  check('private on another world: none', !(await games()).includes('Defend the Paraná'), (await games()).join());
  await pick('The world', itaipu);
  check('private on Itaipu: Defend the Paraná offered', (await games()).includes('Defend the Paraná'), (await games()).join());
  await pick('Game', 'Defend the Paraná');
  await shot(page, 'roomnew-war');

  /* Consent cleared, so making it asks first. */
  await page.evaluate("(() => { window.__ui.settings.warConsent = false; window.__ui.persistSettings(); return true; })()");
  await page.evaluate("(() => { window.__ui.act('friends-make'); return true; })()");
  await page.until(`${DIALOG} !== null`, 10000).catch(() => {});
  check('Make the room with no consent stored: the consent screen first', (await page.evaluate(DIALOG)) === 'Defend the Paraná', String(await page.evaluate(DIALOG)));
  await answer(page, 'Continue');
  const three = await landed(page);
  check('Continue: a private Itaipu room, the start row under the cursor', landedWell(three) && three.code !== two.code, JSON.stringify(three));
  await shot(page, 'war-room-from-form');

  /* JOINING A ROOM MADE FOR THE WAR with no consent stored, by its code:
   * asked on arrival; Back leaves it for the title, Continue stays. A bare
   * socket holds it. A minute first: the rooms server makes six rooms a
   * minute for an address (edge/rooms/front.js). */
  await page.sleep(61000);
  const warMade = await fetch(`${server.url}/v2/create`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ map: 'itaipu', public: true, mode: 'war', mission: 'itaipu-1' }),
  });
  const warJoinCode = (await warMade.json()).code;
  const keeper = new WebSocket(`${server.url.replace(/^http/, 'ws')}/v2/room/${warJoinCode}`, { headers: { origin: 'https://fdflabs.github.io' } });
  const keeperGot = [];
  keeper.on('message', (data, binary) => {
    if (!binary && data.toString() !== 'pong') {
      keeperGot.push(JSON.parse(data.toString()));
    }
  });
  await new Promise((resolve, reject) => {
    keeper.on('open', resolve);
    keeper.on('error', reject);
  });
  keeper.send(JSON.stringify({
    type: 'hello', proto: PROTO, build: 'check', level: ROOM_LEVEL, war: WAR_JOIN, name: [3, 3, 33],
    profile: { airframe: '5inch', map: 'itaipu', figure: 0, livery: null, parts: null, game: null },
  }));
  for (let i = 0; i < 100 && !keeperGot.some((m) => m.type === 'welcome'); i += 1) {
    await page.sleep(50);
  }
  await page.evaluate(`(() => {
    window.__ui.act('friends-leave');
    window.__ui.settings.warConsent = false;
    window.__ui.persistSettings();
    window.__roomJoin(${JSON.stringify(warJoinCode)});
    return true;
  })()`);
  await page.until(`${DIALOG} !== null`, 15000).catch(() => {});
  check('joining a room made for the war with no consent stored: asked on arrival', (await page.evaluate(DIALOG)) === 'Defend the Paraná', String(await page.evaluate(DIALOG)));
  await answer(page, 'Back');
  await page.until("window.__rooms().phase === 'idle'", 10000).catch(() => {});
  await page.sleep(500);
  const refusedJoin = await page.evaluate("({ phase: window.__rooms().phase, screen: window.__ui.screen, consent: window.__ui.settings.warConsent === true })");
  check('Back leaves it, for the title, nothing stored', refusedJoin.phase === 'idle' && refusedJoin.screen === 'title' && !refusedJoin.consent, JSON.stringify(refusedJoin));
  await page.evaluate(`(() => { window.__roomJoin(${JSON.stringify(warJoinCode)}); return true; })()`);
  await page.until(`${DIALOG} !== null`, 15000).catch(() => {});
  await answer(page, 'Continue');
  await page.until('window.__ui.settings.warConsent === true', 10000).catch(() => {});
  await page.sleep(1000);
  const keptJoin = await page.evaluate("({ phase: window.__rooms().phase, code: window.__rooms().code, consent: window.__ui.settings.warConsent === true })");
  check('Continue stays in it', keptJoin.phase === 'open' && keptJoin.code === warJoinCode && keptJoin.consent, JSON.stringify(keptJoin));
  keeper.close();

  /* A PUBLIC ROOM ON ITAIPU made for no game, which a pilot who came for
   * the war (ui.roomGame 'war') joins. Another pilot, a bare socket, holds
   * it first and says 'war' in its profile too. */
  const made = await fetch(`${server.url}/v2/create`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ map: 'itaipu', public: true }),
  });
  const pubCode = (await made.json()).code;
  const other = new WebSocket(`${server.url.replace(/^http/, 'ws')}/v2/room/${pubCode}`, { headers: { origin: 'https://fdflabs.github.io' } });
  const otherGot = [];
  other.on('message', (data, binary) => {
    if (!binary && data.toString() !== 'pong') {
      otherGot.push(JSON.parse(data.toString()));
    }
  });
  let otherClosed = null;
  other.on('close', (c, why) => {
    otherClosed = `${c} ${why}`;
  });
  await new Promise((resolve, reject) => {
    other.on('open', resolve);
    other.on('error', reject);
  });
  other.send(JSON.stringify({
    type: 'hello', proto: PROTO, build: 'check', level: ROOM_LEVEL, name: [1, 1, 11],
    profile: { airframe: '5inch', map: 'itaipu', figure: 0, livery: null, parts: null, game: 'war' },
  }));
  for (let i = 0; i < 100 && !otherGot.some((m) => m.type === 'welcome'); i += 1) {
    await page.sleep(50);
  }
  await page.evaluate(`(() => { window.__ui.act('friends-leave'); window.__ui.roomGame = 'war'; window.__roomJoin(${JSON.stringify(pubCode)}); window.__ui.show('friends'); return true; })()`);
  await page.until(`window.__rooms().phase === 'open' && window.__rooms().code === ${JSON.stringify(pubCode)} && window.__rooms().peers.length === 1`, 30000).catch(() => {});
  await page.sleep(500);
  /* Every room has a lobby (the owner, 2026-10-02): this one, made for
   * no game, is free flight's, and the war is not started in it. Its way
   * is Defend the Paraná's own lobby, one click from the title. */
  const PUBLIC = `(() => {
    const items = window.__ui.items();
    const r = window.__rooms();
    return {
      code: r.code, public: r.public, host: r.host !== null && r.host === r.seat, mode: r.mode,
      line: (document.querySelector('.war-lobby-mission') || {}).textContent || '',
      start: items.some((it) => it.action === 'friends-war-start' || it.action === 'friends-war-private'),
    };
  })()`;
  await page.until(`(document.querySelector('.war-lobby-mission') || {}).textContent`, 10000).catch(() => {});
  const joiner = await page.evaluate(PUBLIC);
  check('a public room on Itaipu made for no game: free flight\'s lobby, no war started there',
    joiner.code === pubCode && joiner.public && joiner.mode === null && /^Free flight/.test(joiner.line) && !joiner.start,
    `${JSON.stringify(joiner)} other ${otherClosed || 'seated'}`);
  await shot(page, 'public-itaipu-free-lobby');
  other.close();

  /* BACK TO THE TITLE FROM A WAR, the owner's report (2026-09-30), on the
   * title of a private war room: "its showing like this, like its showing
   * the empty room thats playing while im here, that shouldnt happen".
   * The war is on and the pilot flying it, a callout up. The pause keeps
   * the room and draws nothing of the war; Back to title leaves it, and
   * for eight seconds nothing of the war or the room is drawn over the
   * title. The war room is mission 1's, by Defend the Paraná on home and
   * Play on its campaign page. */
  await page.evaluate("(() => { window.__ui.act('friends-leave'); window.__ui.act('mode-gate'); return true; })()");
  await page.until("window.__rooms().phase === 'idle' && window.__ui.onGate()", 10000).catch(() => {});
  await playMission1(page);
  await page.until("window.__rooms().phase === 'open' && window.__rooms().mode === 'war' && window.__ui.screen === 'friends'", 60000).catch(() => {});
  await page.sleep(500);
  await page.evaluate("window.__warDo('start')");
  await page.until("window.__war().view.state === 'live' && window.__ui.screen === 'flight'", 60000).catch(() => {});
  await page.until('window.__war().hud.calls.length > 0', 30000).catch(() => {});
  const warCode = await page.evaluate('window.__rooms().code');
  check('the war is on, the pilot flying it, a callout up', await page.evaluate(
    "window.__war().view.state === 'live' && window.__ui.screen === 'flight' && window.__war().hud.calls.length > 0",
  ), JSON.stringify(await page.evaluate('window.__war().hud.calls')));
  await page.tap('Escape');
  await page.until("window.__ui.screen === 'paused'", 5000).catch(() => {});
  /* The war's elements and the room's notice as drawn, sampled. */
  const DRAWN = `(() => {
    const up = (d) => {
      if (!d) { return false; }
      for (let n = d; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden' || n.hidden) { return false; }
      }
      return getComputedStyle(d).opacity !== '0' && d.getBoundingClientRect().width > 0;
    };
    const calls = document.querySelector('.war-calls');
    return {
      calls: calls && up(calls) ? [...calls.children].map((c) => c.textContent) : [],
      splash: up(document.querySelector('.war-splash')),
      hint: up(document.querySelector('.war-hint')),
      hud: up(document.querySelector('.war-hud')),
      banner: up(document.querySelector('.war-banner')),
      round: up(document.querySelector('.war-round')),
      notice: up(document.querySelector('.room-bar')) ? document.querySelector('.room-bar').textContent : '',
    };
  })()`;
  const nothing = (d) => !d.calls.length && !d.splash && !d.hint && !d.hud && !d.banner && !d.round && !d.notice;
  async function watchDrawn(ms) {
    const seen = [];
    for (let t = 0; t < ms; t += 250) {
      const d = await page.evaluate(DRAWN);
      if (!nothing(d)) {
        seen.push(d);
      }
      await page.sleep(250);
    }
    return seen;
  }
  const pausedFps = await page.evaluate(`new Promise((resolve) => {
    let n = 0;
    const t0 = performance.now();
    const f = () => { n += 1; if (performance.now() - t0 < 1000) { requestAnimationFrame(f); } else { resolve(n); } };
    requestAnimationFrame(f);
  })`);
  const pausedSeen = await watchDrawn(2000);
  const pausedRoom = await page.evaluate('window.__rooms()');
  check('paused: still in the war room, nothing of the war drawn over the menu',
    pausedRoom.phase === 'open' && pausedRoom.code === warCode && !pausedSeen.length, `${pausedRoom.phase} ${pausedRoom.code}, ${pausedFps} frames in the first second, ${JSON.stringify(pausedSeen.slice(0, 2))}`);
  /* The pause's way to the title is Leave the room, since the title is
   * never in a room (docs/FLOW-AUDIT.md rule 5). */
  const leaveRow = await page.evaluate("(window.__ui.items().find((it) => it.action === 'friends-leave') || {}).label || null");
  check('the pause in the war room offers Leave the room, no Back to title',
    leaveRow === 'Leave the room' && !(await page.evaluate("window.__ui.items().some((it) => it.action === 'title')")), String(leaveRow));
  await page.evaluate("(() => { window.__ui.act('friends-leave'); return true; })()");
  await page.until("window.__ui.screen === 'title'", 10000).catch(() => {});
  const titleSeen = await watchDrawn(8000);
  const titled = await page.evaluate("({ screen: window.__ui.screen, phase: window.__rooms().phase, code: window.__rooms().code, war: window.__war().view.state })");
  check('Leave from the war: out of the room, on the title', titled.screen === 'title' && titled.phase === 'idle' && titled.code !== warCode, JSON.stringify(titled));
  check('and for eight seconds no callout, splash, hint, war HUD, banner, round card or room notice on the title',
    !titleSeen.length, JSON.stringify(titleSeen.slice(0, 2)));
  await shot(page, 'title-from-war');

  /* The title's rooms panel still lists a room and joins it: a public
   * Itaipu room another pilot (a bare socket) holds. */
  const listed = await fetch(`${server.url}/v2/create`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ map: 'itaipu', public: true }),
  });
  const listedCode = (await listed.json()).code;
  const holder = new WebSocket(`${server.url.replace(/^http/, 'ws')}/v2/room/${listedCode}`, { headers: { origin: 'https://fdflabs.github.io' } });
  await new Promise((resolve, reject) => {
    holder.on('open', resolve);
    holder.on('error', reject);
  });
  holder.send(JSON.stringify({
    type: 'hello', proto: PROTO, build: 'check', level: ROOM_LEVEL, name: [2, 2, 12],
    profile: { airframe: '5inch', map: 'itaipu', figure: 0, livery: null, parts: null, game: null },
  }));
  for (let i = 0; i < 4 && !(await page.evaluate('window.__ui.onGate()')); i += 1) {
    await page.tap('Escape');
    await page.sleep(600);
  }
  await toClub(page);
  const LISTED = `(window.__ui.titleRoomEls || []).some((e) => e.node.isConnected
    && (window.__ui.items()[e.i].action || '').endsWith(${JSON.stringify(listedCode)}))`;
  await page.until(LISTED, 30000).catch(() => {});
  const panel = await page.evaluate("[...document.querySelectorAll('.gate-rooms .gate-room')].map((n) => n.className.replace('gate-room ', ''))");
  check('Flight Club\'s rooms panel lists that room, All rooms and Make a room',
    (await page.evaluate(LISTED)) && panel.includes('gate-room-all') && panel.includes('gate-room-make'), panel.join());
  await page.evaluate(`(() => {
    const ui = window.__ui;
    const row = ui.titleRoomEls.find((e) => (ui.items()[e.i].action || '').endsWith(${JSON.stringify(listedCode)}));
    row.node.dataset.check = 'listed';
    return true;
  })()`);
  await click(page, '.gate-rooms [data-check="listed"]');
  await page.until(`window.__rooms().phase === 'open' && window.__rooms().code === ${JSON.stringify(listedCode)}`, 30000).catch(() => {});
  const joinedPanel = await page.evaluate("({ phase: window.__rooms().phase, code: window.__rooms().code, screen: window.__ui.screen })");
  check('and its row joins it, onto the room screen', joinedPanel.phase === 'open' && joinedPanel.code === listedCode && joinedPanel.screen === 'friends', JSON.stringify(joinedPanel));

  /* Escape on the room screen stays in the room (docs/FLOW-AUDIT.md
   * rule 4); its Leave is the title, out of it (rule 5). */
  await page.tap('Escape');
  await page.sleep(600);
  const escaped = await page.evaluate("({ screen: window.__ui.screen, phase: window.__rooms().phase })");
  check('Escape on the room screen stays in the room', escaped.screen === 'friends' && escaped.phase === 'open', JSON.stringify(escaped));
  await page.evaluate("(() => { window.__ui.act('friends-leave'); return true; })()");
  await page.until("window.__ui.screen === 'title'", 10000).catch(() => {});
  await page.sleep(500);
  const left = await page.evaluate("({ screen: window.__ui.screen, phase: window.__rooms().phase })");
  check('its Leave is the title, out of the room', left.screen === 'title' && left.phase === 'idle', JSON.stringify(left));
  holder.close();

  /* THE TOILET PAPER COMBAT CARD after a war room, the owner's report
   * (2026-09-30): "when i enter the toilet paper mode, it then switches to
   * mission mode, in itaipu". The title is out of the room now; the combat
   * card from it is one click into a combat lobby (2026-10-02), in the
   * Swiss valley, and still there well past a countdown's length, never
   * flown into the war. */
  for (let i = 0; i < 4 && !(await page.evaluate('window.__ui.onGate()')); i += 1) {
    await page.tap('Escape');
    await page.sleep(600);
  }
  /* Home, wherever the Leave landed: Streamer Combat's link there is its
   * one click. */
  for (let i = 0; i < 2 && await page.evaluate('window.__ui.hub !== null'); i += 1) {
    await page.tap('Escape');
    await page.sleep(400);
  }
  await click(page, '.gate-card-combat');
  /* Through the world swap the card starts (Itaipu to the Swiss valley),
   * the craft's state is read as a capture reads it: the world being
   * left is disposed, and reading its ground threw (a TypeError in
   * Terrain.readNode, a tile no longer held). */
  const swapReads = await page.evaluate(`new Promise((resolve) => {
    const t0 = performance.now();
    const seen = { reads: 0, nulls: 0, thrown: null };
    const step = () => {
      try {
        const c = window.__craftState();
        seen.reads += 1;
        if (c.groundClearance === null) {
          seen.nulls += 1;
        }
      } catch (e) {
        seen.thrown = String(e && e.message || e);
      }
      if (performance.now() - t0 < 8000 && !seen.thrown) {
        setTimeout(step, 20);
      } else {
        resolve(seen);
      }
    };
    step();
  })`);
  check('the craft\'s state is read through the world swap without a throw, its ground null while the world is gone',
    !swapReads.thrown && swapReads.reads > 0, JSON.stringify(swapReads));
  await page.until("window.__rooms().phase === 'open' && window.__ui.screen === 'friends'", 30000).catch(() => {});
  const combat = await page.evaluate(LANDED);
  const combatRoom = await page.evaluate("({ mode: window.__rooms().mode, world: window.__rooms().world, flying: window.__craftState().mode })");
  check('the combat card after the war room: one click into a combat lobby in the Swiss valley, Ready under the cursor, never the war',
    combat.phase === 'open' && combat.code !== warCode && combat.screen === 'friends' && combat.lobby === 'LOBBY' && combat.here === 'friends-lobby-ready'
    && combatRoom.mode === 'combat' && combatRoom.world === 'swiss2' && combatRoom.flying !== 'flight', `${JSON.stringify({ ...combat, ...combatRoom })} war room ${warCode}`);
  await shot(page, 'combat-card-from-war');

  const errs = page.errors.filter((e) => !e.startsWith('network:'));
  check('no page error', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await page.close();
  await server.stop();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
