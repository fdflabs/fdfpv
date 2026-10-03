/*
 * flow-check.js: where a pilot ends up across a reload, driven through the
 * real shell against a local rooms server (never the live one), one page:
 *
 *   npm run flow:check                      starts its own on a free port
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
 *   the title is never in a    in that room, made by hand and not by a
 *   room (rule 3 to 5, D5)     card, Back and Escape on its lobby stay
 *                              in it (rule 4; only a card's lobby is
 *                              left by Escape, scripts/game-lobby-check.js);
 *                              on Rooms and Make a room they stay in it,
 *                              one screen back each; the pause menu offers Leave the room
 *                              and no Back to title; Leave is out, on
 *                              the title.
 *   every card is a lobby      each of the five cards, from the title, is
 *   (rules 11, 12)             one press into the lobby of a room made for
 *                              its game; Leave is out of it again.
 *   the card's world wins      Itaipu seated (as a war leaves it): the
 *   (rule 2, D4)               Free Flight card's lobby is in the Swiss
 *                              valley. With no rooms server (?rooms=off)
 *                              the cards fly alone as before: Free
 *                              Flight's picker, a quad chosen and then a
 *                              plane, each on Free Flight's menu, never My
 *                              tracks, and Fly is the Swiss valley.
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
import { openPage } from '../tests/lib/page.js';
import { roomsServer } from '../tests/lib/roomsserver.js';

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

const server = await roomsServer(process.argv[2], 'flow');
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
  /* A room this pilot did not open from a card (made by hand here, as
   * one joined by a code, a link or the rooms panel is): Back and Escape
   * on its lobby keep the pilot in it, its room screen being home inside
   * a room (docs/FLOW-AUDIT.md rule 4); Leave is the way out. A card's
   * own lobby is left by Escape, back to its hub's cards (the owner,
   * 2026-10-02), which scripts/game-lobby-check.js asserts for every
   * card. Which one a lobby is is the room's code, not whether its panel
   * has been drawn yet: that race once decided it. */
  await page.until('window.__ui.inLobby && window.__ui.inLobby()', 10000).catch(() => {});
  await page.evaluate("(() => { window.__ui.act('back'); return true; })()");
  const afterBack = await here('Back on the lobby');
  await page.tap('Escape');
  const afterEsc = await here('Escape on the lobby');
  check('Back and Escape on the lobby of a room not opened by a card stay in it, on its screen',
    [afterBack, afterEsc].every((r) => r.phase === 'open' && r.code === made && r.screen === 'friends'), stays.join(' | '));
  stays.length = 0;
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
  check('Escape from Rooms and Make a room stays in the room, one screen back each',
    [fromLobby, fromNew2].every((r) => r.phase === 'open' && r.code === made && r.screen === 'friends')
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

  /* EVERY CARD IS ONE PRESS INTO ITS LOBBY (the owner, 2026-10-02). The
   * rooms server makes six rooms a minute for an address. */
  await page.sleep(61000);
  /* The war's consent is the war card's own question (war-card-check). */
  await page.evaluate("(() => { window.__ui.settings.warConsent = true; window.__ui.persistSettings(); return true; })()");
  const LOBBY_UP = "window.__rooms().phase === 'open' && window.__ui.screen === 'friends' && document.querySelector('.war-lobby') && !document.querySelector('.war-lobby').hidden";
  const cards = [];
  for (const [way, game] of [['race-5inch', 'race'], ['freestyle-wing1000', null], ['combat', 'combat'], ['ace', 'tag'], ['campaign', 'war']]) {
    await page.evaluate(`(() => { window.__ui.act('mode-gate'); window.__ui.pickForWay('way-${way}'); return true; })()`);
    await page.until(LOBBY_UP, 60000).catch(() => {});
    await page.sleep(400);
    const r = await page.evaluate(`({ ...${ROOM}, mode: window.__rooms().mode, world: window.__rooms().world })`);
    cards.push({ way, game, ok: r.phase === 'open' && r.screen === 'friends' && r.mode === game, world: r.world });
    await page.evaluate("(() => { window.__ui.act('friends-leave'); return true; })()");
    await page.until("window.__rooms().phase === 'idle' && window.__ui.screen === 'title'", 10000).catch(() => {});
  }
  check('each of the five cards is one press into the lobby of a room made for its game, and Leave is out again', cards.every((c) => c.ok),
    JSON.stringify(cards));

  /* THE CARD'S WORLD WINS. */
  await page.evaluate("(() => { window.__ui.act('mode-gate'); window.__ui.seatMap('itaipu', { stay: true }); window.__ui.pickForWay('way-freestyle-wing1000'); return true; })()");
  await page.until(LOBBY_UP, 60000).catch(() => {});
  await page.sleep(600);
  const free = await page.evaluate("({ map: window.__ui.settings.map, world: window.__rooms().world, screen: window.__ui.screen })");
  check('Itaipu seated, the Free Flight card\'s lobby is in the Swiss valley', free.map === 'swiss2' && free.world === 'swiss2' && free.screen === 'friends',
    JSON.stringify(free));
  await page.evaluate("(() => { window.__ui.act('friends-leave'); return true; })()");
  await page.until("window.__rooms().phase === 'idle'", 10000).catch(() => {});
  const errs = page.errors.filter((e) => !e.startsWith('network:'));
  check('no page error', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) {
  await server.stop();
  throw e;
} finally {
  await page.close();
}

/* WITH NO ROOMS SERVER the cards fly alone, as they did. */
const solo = await openPage({ root, url: '/index.html?rooms=off', width: 1280, height: 720 });
try {
  await solo.until('window.__shellReady === true', 300000);
  await solo.until('window.__ui.onGate()', 60000).catch(() => {});
  const page = solo;

  const picked = [];
  for (const [kind, id] of [['quad', 'interceptor'], ['plane', 'cub1400']]) {
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

  const soloErrs = page.errors.filter((e) => !e.startsWith('network:'));
  check('no page error with no rooms server', soloErrs.length === 0, soloErrs.slice(0, 3).join(' | '));
} finally {
  await solo.close();
  await server.stop();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
