/*
 * flow-check.js: where a pilot ends up across a reload, driven through the
 * real shell against a local rooms server (never the live one), one page:
 *
 *   npm run flow:check                      starts its own on port 8829
 *   npm run flow:check -- http://127.0.0.1:8797
 *
 * docs/FLOW-AUDIT.md is the map; each step here is one of its dead ends.
 *
 *   a link is used once (D3)   opened with ?room=CODE: in that room, and
 *                              the address no longer carries the code;
 *                              Leave, reload: out of the room, and it
 *                              stays out once the shell has run.
 *   a reload keeps the room,   in a room made by hand, reload: back in
 *   on its screen (D2)         the same room, on the room screen with
 *                              its code, the title not shown.
 *   the title is never in a    in that room, Back and Escape on the room
 *   room (rule 3 to 5, D5)     screen, the lobby and Make a room stay in
 *                              it; the pause menu offers Leave the room
 *                              and no Back to title; Leave is out, on
 *                              the title; then every card from the title
 *                              starts out of a room.
 *   the card's world wins      Itaipu seated (as a war leaves it): the
 *   (rule 2, D4)               Free Flight and Fly with friends cards
 *                              seat the Swiss valley. Free Flight's
 *                              picker, a quad chosen and then a plane:
 *                              each on Free Flight's menu, never My
 *                              tracks, and Fly is the Swiss valley.
 *   the host changes the game  a room made for combat, a friend in it (a
 *   in place (rule 8)          bare socket): the host's This room is for
 *                              row turns it to Catch the Ace; the code,
 *                              the friend and the room screen stay, the
 *                              heading says Catch the Ace, the friend is
 *                              told.
 *
 * No page error.
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
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import WebSocket from 'ws';
import { openPage } from '../tests/lib/page.js';
import { PROTO, ROOM_LEVEL } from '../src/share/roomwire.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

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

async function roomsServer() {
  if (process.argv[2]) {
    return { url: process.argv[2], stop: async () => {} };
  }
  const dir = await mkdtemp(join(tmpdir(), 'flow-rooms-'));
  const port = 8829;
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

/* The shell up, and enough frames run that its once-only autojoin
 * (main.js roomFrame) has had its turn. */
async function settled(page) {
  await page.until('window.__shellReady === true', 300000);
  await page.evaluate(`new Promise((done) => {
    let n = 0;
    const step = () => (n += 1) >= 30 ? done(true) : requestAnimationFrame(step);
    requestAnimationFrame(step);
  })`);
}

/* Page.reload answers before the new document is in, and the old one
 * still says __shellReady: wait for a document that never had the mark. */
async function reload(page) {
  await page.evaluate('(() => { window.__beforeReload = true; return true; })()');
  await page.cdp.send('Page.reload', {}, page.sessionId);
  await page.until('window.__beforeReload !== true', 60000);
  await settled(page);
}

const ROOM = `(() => {
  const r = window.__rooms();
  return { phase: r.phase, code: r.code, search: window.location.search, screen: window.__ui.screen };
})()`;

const server = await roomsServer();
console.log(`Flow, rooms at ${server.url}`);
const res = await fetch(`${server.url}/v2/create`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ map: 'swiss2', friendly: false, public: false, name: null, mode: null }),
});
const { code } = await res.json();
const page = await openPage({
  root, url: `/index.html?rooms=${encodeURIComponent(server.url)}&room=${code}`, width: 1280, height: 720,
});
try {
  /* A LINK IS USED ONCE. */
  await settled(page);
  await page.until(`window.__rooms().phase === 'open' && window.__rooms().code === ${JSON.stringify(code)}`, 60000).catch(() => {});
  const linked = await page.evaluate(ROOM);
  check('a ?room= link joins its room', linked.phase === 'open' && linked.code === code, JSON.stringify(linked));
  check('and the address no longer carries the code', !/[?&]room=/.test(linked.search), linked.search);
  await page.evaluate("(() => { window.__ui.act('friends-leave'); return true; })()");
  await page.until("window.__rooms().phase === 'idle'", 10000).catch(() => {});
  const left = await page.evaluate(ROOM);
  check('Leave is out of it', left.phase === 'idle', JSON.stringify(left));
  await reload(page);
  await page.sleep(2000);
  const after = await page.evaluate(ROOM);
  check('a reload after Leave stays out of the room', after.phase === 'idle' && after.code === null, JSON.stringify(after));

  /* A RELOAD KEEPS THE ROOM, ON ITS SCREEN. */
  const made = await page.evaluate("(async () => { const c = await window.__roomCreate({ map: 'swiss2' }); window.__ui.act('friends'); return c; })()");
  await page.until(`window.__rooms().phase === 'open' && window.__rooms().code === ${JSON.stringify(made)}`, 60000).catch(() => {});
  const inRoom = await page.evaluate(ROOM);
  check('a room made by hand, on its screen', inRoom.phase === 'open' && inRoom.code === made && inRoom.screen === 'friends', JSON.stringify(inRoom));
  await reload(page);
  await page.until("window.__rooms().phase === 'open' && window.__ui.screen === 'friends'", 60000).catch(() => {});
  const back = await page.evaluate(`(() => {
    const friends = document.querySelector('.screen-friends');
    return {
      ...${ROOM},
      title: document.querySelector('.screen-title').style.display !== 'none',
      shown: Boolean(friends) && friends.style.display !== 'none' && friends.textContent.includes(window.__rooms().code),
    };
  })()`);
  check('a reload is back in the same room', back.phase === 'open' && back.code === made, JSON.stringify(back));
  check('on the room screen, its code on it, the title not shown', back.screen === 'friends' && back.shown && !back.title, JSON.stringify(back));

  /* THE TITLE IS NEVER IN A ROOM. */
  const stays = [];
  const here = async (what) => {
    await page.sleep(400);
    const r = await page.evaluate(ROOM);
    stays.push(`${what}: ${r.screen} ${r.phase}`);
    return r;
  };
  await page.evaluate("(() => { window.__ui.act('back'); return true; })()");
  const afterBack = await here('Back on the room screen');
  await page.tap('Escape');
  const afterEsc = await here('Escape on the room screen');
  await page.evaluate("(() => { window.__ui.act('rooms'); return true; })()");
  await page.until("window.__ui.screen === 'rooms'", 10000).catch(() => {});
  await page.tap('Escape');
  const fromLobby = await here('Escape on Rooms');
  await page.evaluate("(() => { window.__ui.act('rooms'); window.__ui.act('roomnew'); return true; })()");
  await page.until("window.__ui.screen === 'roomnew'", 10000).catch(() => {});
  await page.tap('Escape');
  const fromNew = await here('Escape on Make a room');
  await page.tap('Escape');
  const fromNew2 = await here('and again');
  check('Back and Escape stay in the room, on its screen, from the room screen, Rooms and Make a room',
    [afterBack, afterEsc, fromLobby, fromNew2].every((r) => r.phase === 'open' && r.code === made && r.screen === 'friends')
    && fromNew.screen === 'rooms' && fromNew.phase === 'open', stays.join(' | '));

  await page.evaluate("(() => { window.__ui.act('fly'); return true; })()");
  await page.until("window.__ui.screen === 'flight'", 400000).catch(() => {});
  await page.sleep(1500);
  await page.tap('Escape');
  await page.until("window.__ui.screen === 'paused'", 10000).catch(() => {});
  const pause = await page.evaluate(`({
    screen: window.__ui.screen,
    rows: window.__ui.items().map((it) => it.action + ':' + it.label),
  })`);
  check('the pause menu in a room: Leave the room, no row to the title',
    pause.screen === 'paused' && pause.rows.includes('friends-leave:Leave the room') && !pause.rows.some((r) => r.startsWith('title:')), JSON.stringify(pause));
  await page.evaluate("(() => { window.__ui.act('friends'); return true; })()");
  await page.until("window.__ui.screen === 'friends'", 10000).catch(() => {});
  await page.tap('Escape');
  await page.sleep(400);
  const fromPause = await page.evaluate(ROOM);
  check('the room screen opened from the pause: Escape is the pause again, still in the room',
    fromPause.screen === 'paused' && fromPause.phase === 'open', JSON.stringify(fromPause));
  await page.evaluate("(() => { window.__ui.act('friends-leave'); return true; })()");
  await page.until("window.__ui.screen === 'title'", 10000).catch(() => {});
  await page.sleep(400);
  const out = await page.evaluate(ROOM);
  check('Leave from the pause: out of the room, on the title', out.phase === 'idle' && out.screen === 'title', JSON.stringify(out));

  const cards = [];
  for (const way of ['race-5inch', 'freestyle-wing1000', 'friends', 'combat', 'ace']) {
    await page.evaluate(`(() => { window.__ui.act('mode-gate'); window.__ui.act('way-${way}'); return true; })()`);
    await page.sleep(600);
    const r = await page.evaluate(ROOM);
    cards.push(`${way}: ${r.screen} ${r.phase}`);
  }
  check('every card from the title starts out of a room', cards.every((c) => c.endsWith(' idle')), cards.join(' | '));

  /* THE CARD'S WORLD WINS. */
  const worldOf = async (way) => {
    await page.evaluate(`(() => {
      window.__ui.act('mode-gate');
      window.__ui.seatMap('itaipu', { stay: true });
      window.__ui.act('way-${way}');
      return true;
    })()`);
    await page.sleep(600);
    return page.evaluate('({ map: window.__ui.settings.map, screen: window.__ui.screen, phase: window.__rooms().phase })');
  };
  const free = await worldOf('freestyle-wing1000');
  const friends = await worldOf('friends');
  check('Itaipu seated, the Free Flight and Fly with friends cards seat the Swiss valley',
    free.map === 'swiss2' && friends.map === 'swiss2' && friends.screen === 'friends', JSON.stringify({ free, friends }));

  const picked = [];
  for (const [kind, id] of [['quad', '5inch'], ['plane', 'bramor2300']]) {
    await page.evaluate("(() => { window.__ui.act('mode-gate'); window.__ui.pickForWay('way-freestyle-wing1000'); return true; })()");
    await page.until('window.__ui.carousel.isOpen', 10000).catch(() => {});
    await page.evaluate(`(() => {
      const c = window.__ui.carousel;
      c.setFilter('all');
      c.goTo(c.ids.indexOf(${JSON.stringify(id)}));
      c.choose();
      return true;
    })()`);
    await page.sleep(800);
    const menu = await page.evaluate("({ screen: window.__ui.screen, mode: window.__ui.mode, gate: window.__ui.onGate(), airframe: window.__ui.settings.airframe, map: window.__ui.settings.map })");
    await page.evaluate("(() => { window.__ui.act('fly'); return true; })()");
    await page.until("window.__ui.screen === 'flight'", 400000).catch(() => {});
    await page.sleep(500);
    const flown = await page.evaluate("({ screen: window.__ui.screen, world: window.__map().id })");
    picked.push({ kind, id, menu, flown });
    await page.tap('Escape');
    await page.until("window.__ui.screen === 'paused'", 10000).catch(() => {});
    await page.evaluate("(() => { window.__ui.act('title'); return true; })()");
    /* The run's end can swap the world back; the next picker opens on a
     * settled title, not under a swap that ends on it. */
    await page.until("window.__ui.screen === 'title' && window.__map().ready", 400000).catch(() => {});
    await page.sleep(1000);
  }
  check('Free Flight\'s picker, a quad and a plane: each on Free Flight\'s menu, never My tracks, flown in the Swiss valley',
    picked.every((p) => p.menu.screen === 'title' && !p.menu.gate && p.menu.mode === 'freestyle' && p.menu.airframe === p.id
      && p.menu.map === 'swiss2' && p.flown.screen === 'flight' && p.flown.world === 'swiss2'), JSON.stringify(picked));

  /* THE HOST CHANGES THE GAME IN PLACE. */
  await page.evaluate("(() => { window.__ui.act('mode-gate'); window.__ui.act('way-friends'); return true; })()");
  const combatCode = await page.evaluate("(async () => { const c = await window.__roomCreate({ map: 'swiss2', mode: 'combat' }); window.__ui.show('friends'); return c; })()");
  await page.until(`window.__rooms().phase === 'open' && window.__rooms().code === ${JSON.stringify(combatCode)}`, 60000).catch(() => {});
  const friend = new WebSocket(`${server.url.replace(/^http/, 'ws')}/v2/room/${combatCode}`, { headers: { origin: 'https://fdflabs.github.io' } });
  const heard = [];
  let friendClosed = null;
  friend.on('message', (d) => {
    try {
      heard.push(JSON.parse(d.toString()));
    } catch (e) {
      /* A binary pose batch: not what this listens for. */
    }
  });
  friend.on('close', (c) => {
    friendClosed = c;
  });
  await new Promise((resolve, reject) => {
    friend.on('open', resolve);
    friend.on('error', reject);
  });
  friend.send(JSON.stringify({
    type: 'hello', proto: PROTO, build: 'check', level: ROOM_LEVEL, name: [2, 3, 21],
    profile: { airframe: '5inch', map: 'swiss2', figure: 0, livery: null, parts: null, game: null },
  }));
  await page.until('window.__rooms().peers.length === 1', 20000).catch(() => {});
  const heading = "(window.__ui.items().find((it) => it.section && /^Game/.test(it.label)) || {}).label || null";
  const setUp = await page.evaluate(`({ mode: window.__rooms().mode, heading: ${heading} })`);
  await page.evaluate(`(() => {
    const i = window.__ui.items().findIndex((it) => it.label === 'This room is for');
    window.__ui.setCursor(i);
    return i;
  })()`);
  await page.tap('ArrowLeft');
  await page.until("window.__rooms().mode === 'tag'", 10000).catch(() => {});
  await page.sleep(600);
  const switched = await page.evaluate(`({
    mode: window.__rooms().mode, code: window.__rooms().code, peers: window.__rooms().peers.length, screen: window.__ui.screen,
    heading: ${heading},
    row: (window.__ui.items().find((it) => it.label === 'This room is for') || {}).value || null,
  })`);
  check('a room made for combat, a friend in it, its heading says so', setUp.mode === 'combat' && setUp.heading === 'Game: this room is set up for Toilet paper combat', JSON.stringify(setUp));
  check('the host turns it to Catch the Ace in place: the same code and friend, the room screen, the heading, the friend told',
    switched.mode === 'tag' && switched.code === combatCode && switched.peers === 1 && switched.screen === 'friends'
    && switched.heading === 'Game: this room is set up for Catch the Ace!' && switched.row === 'Catch the Ace!'
    && friendClosed === null && heard.some((m) => m.type === 'setup' && m.mode === 'tag'), JSON.stringify({ switched, friendClosed }));
  friend.close();

  const errs = page.errors.filter((e) => !e.startsWith('network:'));
  check('no page error', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await page.close();
  await server.stop();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
