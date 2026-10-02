/*
 * game-lobby-check.js: a game's title card, one click into its lobby, for
 * three pages against a rooms server of its own, in this process on a free
 * port (the owner, 2026-10-02: "when i click on them directly, it should
 * take me to the lobby of the room ... one two clicks max", and "every
 * click will take you to the lobby for it, ready to go either single or
 * multi"):
 *
 *   SIM_GPU=1 node scripts/game-lobby-check.js --game=combat [outdir]
 *   (--game= combat, tag, war or free; npm run game:lobby -- --game=tag)
 *
 *   A clicks the card, one click, and is in the lobby of a public room
 *   made for the game, named for A. A alone presses R: the five seconds,
 *   then the round, A in it. Its end (the room's own: a combat round run
 *   out, a tag match ended, a war lost) puts A back in the lobby. Free
 *   flight's round never ends; A leaves it for the title instead and
 *   clicks the card again into a room of its own.
 *
 *   B clicks the same card, one click, and lands in A's lobby, each in the
 *   other's pilots. Both ready: the round on both. Its end: both back in
 *   the lobby, nobody ready.
 *
 *   The round again (the host's Start now; free flight's both ready). C,
 *   on the title, clicks the room on the title's rooms panel, one click,
 *   and is in the round, flying; the panel said it was flying, not in a
 *   lobby, before C clicked.
 *
 * Race is not here: its round goes off a track the host chooses, which
 * the race checks drive (scripts/rooms-race-two-page.js), and its lobby is
 * in rooms:selftest. Every click a page makes is counted (tests/lib/page.js
 * click), and the rows say how many it took.
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
import { mkdtempSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { openPage } from '../tests/lib/page.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const GAME = (process.argv.find((a) => a.startsWith('--game=')) || '--game=combat').slice('--game='.length);
const outDir = process.argv.slice(2).find((a) => !a.startsWith('--')) || join(root, 'build', `game-lobby-${GAME}`);

/* Each game: its title card, its world, the panel's word for it, what a
 * round on looks like on a page, and how the room ends one. */
const GAMES = {
  combat: {
    card: 'combat', world: 'swiss2', chip: 'Combat',
    on: "['countdown', 'on'].includes(window.__combat ? window.__combat().round.state : '')",
    end: (core, now) => {
      core.combat.round.endsAt = Math.ceil(core.roomMs(now));
      return core.combat.tick(core, now + 1);
    },
  },
  tag: {
    card: 'ace', world: 'swiss2', chip: 'Catch the Ace',
    on: "['countdown', 'live'].includes(window.__roomTag().view.state)",
    end: (core, now) => core.tag.abandon(core, now),
  },
  war: {
    card: 'campaign', world: 'itaipu', chip: 'War 1',
    on: "['briefing', 'countdown', 'live'].includes(window.__war().view.state)",
    end: (core) => {
      core.war.match.output = 0;
      core.war.settle(core.war.match.f);
      return core.war.changed(core);
    },
  },
  free: {
    card: 'freestyle-wing1000', world: 'swiss2', chip: 'Free flight',
    on: '(() => { const w = window.__rooms().welcome; return Boolean(w && w.lobby && w.lobby.live); })()',
    end: null,
  },
};
const G = GAMES[GAME];
if (!G) {
  throw new Error(`--game= one of ${Object.keys(GAMES).join(', ')}`);
}

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

/* The lobby as drawn: its panel, the rows under it, the room. */
const LOBBY = `(() => {
  const box = document.querySelector('.war-lobby');
  const ui = window.__ui;
  const here = ui.items()[ui.cursor] || {};
  const r = window.__rooms();
  return {
    screen: ui.screen,
    shown: Boolean(box && !box.hidden && box.getClientRects().length),
    title: box ? (box.querySelector('.war-lobby-title') || {}).textContent || '' : '',
    line: box ? (box.querySelector('.war-lobby-mission') || {}).textContent || '' : '',
    status: box ? (box.querySelector('.war-lobby-status') || {}).textContent || '' : '',
    pilots: box ? [...box.querySelectorAll('.war-lobby-pilot')].map((p) => ({
      name: p.querySelector('.war-lobby-name').textContent, ready: p.classList.contains('ready'),
    })) : [],
    rows: ui.items().map((it) => it.action || it.label),
    here: here.action || here.label || null,
    flying: window.__craftState().mode,
    phase: r.phase, code: r.code, public: r.public, name: r.name, mode: r.welcome ? r.welcome.mode : null,
  };
})()`;
const IN_LOBBY = "window.__ui.screen === 'friends' && document.querySelector('.war-lobby') && !document.querySelector('.war-lobby').hidden";
const FLYING = "window.__craftState().mode === 'flight' && window.__ui.screen === 'flight'";

/* The consent asked and the campaign's first mission won, so the war
 * card's lobby is for this pilot from the start. */
const SEED = `(() => {
  const s = JSON.parse(localStorage.getItem('webfpv.settings.v3') || '{}');
  localStorage.setItem('webfpv.settings.v3', JSON.stringify({ ...s, warConsent: true }));
})();`;

const dir = mkdtempSync(join(tmpdir(), 'game-lobby-'));
const { startRooms } = await import('../edge/rooms/node.js');
const server = await startRooms({ db: join(dir, 'rooms.db'), port: 0 });
const rooms = `http://127.0.0.1:${server.port}`;
console.log(`${GAME}: a card, one click into its lobby, rooms at ${rooms}`);
const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;

/* The room's own end of its round, in this process's server, sent the way
 * the room sends any change. */
function endRound(code) {
  const room = [...server.env.ROOMS.objects.values()].find((r) => r.host.core && r.host.core.meta.code === code);
  const now = Date.now();
  room.host.run(G.end(room.host.core, now));
}

const a = await openPage({ root, url, width: 1280, height: 720, seed: [SEED] });
const b = await openPage({ root, url, width: 1280, height: 720, seed: [SEED] });
const c = await openPage({ root, url, width: 1280, height: 720, seed: [SEED] });
try {
  for (const p of [a, b, c]) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__ui.onGate()', 60000).catch(() => {});
  }
  const cardSel = `.gate-card-${G.card}`;

  /* A: ONE CLICK, A LOBBY OF ITS OWN. */
  const aBefore = a.clicks;
  await a.click(cardSel);
  await a.until(`window.__rooms().phase === 'open' && ${IN_LOBBY}`, 60000).catch(() => {});
  await a.sleep(800);
  const la = await a.evaluate(LOBBY);
  check(`A: one click on the card (${a.clicks - aBefore}) and A is in the LOBBY of a public room made for ${GAME}, named for A, Ready under the cursor`,
    a.clicks - aBefore === 1 && la.shown && la.title === 'LOBBY' && la.public === true && la.mode === (GAME === 'free' ? null : GAME)
    && /, /.test(la.name || '') && la.here === 'friends-lobby-ready' && la.flying !== 'flight', JSON.stringify(la));
  const code = la.code;
  await shot(a, '1-a-lobby');

  /* A ALONE: ready, the five seconds, the round. */
  await a.tap('KeyR');
  await a.until("/Starting in [1-5]/.test(document.querySelector('.war-lobby-status').textContent)", 10000).catch(() => {});
  check('A alone presses R: the five seconds start, nobody else needed', /Starting in [1-5]/.test((await a.evaluate(LOBBY)).status),
    (await a.evaluate(LOBBY)).status);
  await a.until(G.on, 20000).catch(() => {});
  await a.until(FLYING, 60000).catch(() => {});
  check('and the round is on, A flying it alone', await a.evaluate(G.on) && await a.evaluate(FLYING),
    JSON.stringify({ on: await a.evaluate(G.on), flying: await a.evaluate('window.__craftState().mode'), screen: await a.evaluate('window.__ui.screen') }));
  if (G.end) {
    endRound(code);
    await a.until(IN_LOBBY, 30000).catch(() => {});
    const back = await a.evaluate(LOBBY);
    check('its end puts A back in the lobby, not ready', back.shown && back.flying !== 'flight' && back.pilots.length === 1 && !back.pilots[0].ready,
      JSON.stringify({ screen: back.screen, shown: back.shown, flying: back.flying }));
  }

  /* B: ONE CLICK, INTO A'S LOBBY (or, free flight, into A's flight). */
  const bBefore = b.clicks;
  await b.click(cardSel);
  await b.until(`window.__rooms().phase === 'open' && window.__rooms().code === ${JSON.stringify(code)}`, 60000).catch(() => {});
  if (GAME === 'free') {
    await b.until(FLYING, 60000).catch(() => {});
    check(`B: one click on the same card (${b.clicks - bBefore}) and B is in A's room, flying with A`, b.clicks - bBefore === 1
      && (await b.evaluate('window.__rooms().code')) === code && await b.evaluate(FLYING), await b.evaluate('window.__ui.screen'));
  } else {
    await b.until(IN_LOBBY, 30000).catch(() => {});
    await a.until('window.__rooms().peers.length === 1', 15000).catch(() => {});
    await b.sleep(800);
    const [a2, b2] = await Promise.all([a, b].map((p) => p.evaluate(LOBBY)));
    check(`B: one click on the same card (${b.clicks - bBefore}) and B is in A's lobby, each in the other's pilots`, b.clicks - bBefore === 1
      && b2.code === code && b2.shown && a2.pilots.length === 2 && b2.pilots.length === 2 && b2.flying !== 'flight', JSON.stringify({ a: a2.pilots, b: b2.pilots, code: b2.code }));
    await shot(b, '2-b-lobby');

    /* BOTH READY: the round on both; its end, both back. */
    await a.tap('KeyR');
    await b.tap('KeyR');
    for (const p of [a, b]) {
      await p.until(G.on, 20000).catch(() => {});
    }
    check('both press R: the round on both pages', await a.evaluate(G.on) && await b.evaluate(G.on));
    endRound(code);
    for (const p of [a, b]) {
      await p.until(IN_LOBBY, 30000).catch(() => {});
    }
    await a.sleep(800);
    const ends = await Promise.all([a, b].map((p) => p.evaluate(LOBBY)));
    check('its end: both back in the lobby, nobody ready', ends.every((v) => v.shown && v.flying !== 'flight' && v.pilots.every((x) => !x.ready)),
      JSON.stringify(ends.map((v) => ({ s: v.screen, f: v.flying, p: v.pilots }))));

    /* THE ROUND AGAIN, by the host's Start now. */
    await a.evaluate("(() => { window.__ui.setCursor(window.__ui.items().findIndex((it) => /^friends-(war|lobby)-start$/.test(it.action || ''))); return true; })()");
    check('the host has Start now', /^friends-(war|lobby)-start$/.test((await a.evaluate(LOBBY)).here || ''), (await a.evaluate(LOBBY)).here);
    await a.tap('Enter');
    await a.until(G.on, 20000).catch(() => {});
  }
  check('the round is on', await a.evaluate(G.on));

  /* C: ONE CLICK FROM THE TITLE'S PANEL, INTO THE ROUND. */
  const chip = `lobby:friends-room-${code}`;
  await c.until(`window.__ui.items().some((it) => it.action === ${JSON.stringify(chip)} && /flying/.test(it.value || ''))`, 30000).catch(() => {});
  const listed = await c.evaluate(`(window.__ui.items().find((it) => it.action === ${JSON.stringify(chip)}) || null)`);
  check(`C's title panel lists the room as ${G.chip}, its pilots flying, not in a lobby`, listed && listed.value.startsWith(G.chip) && /\d+ flying/.test(listed.value)
    && !/lobby/.test(listed.value), JSON.stringify(listed && { value: listed.value, join: listed.join }));
  await c.evaluate(`(() => {
    const ui = window.__ui;
    const row = ui.titleRoomEls.find((e) => ui.items()[e.i].action === ${JSON.stringify(chip)});
    row.node.dataset.check = 'here';
    return true;
  })()`);
  const cBefore = c.clicks;
  await c.click('[data-check="here"]');
  await c.until(FLYING, 400000).catch(() => {});
  check(`C: one click on the panel (${c.clicks - cBefore}) and C is in the room's round, flying`, c.clicks - cBefore === 1
    && (await c.evaluate('window.__rooms().code')) === code && await c.evaluate(FLYING) && await c.evaluate(G.on),
  JSON.stringify({ code: await c.evaluate('window.__rooms().code'), screen: await c.evaluate('window.__ui.screen'), on: await c.evaluate(G.on) }));
  await shot(c, '3-c-hot-join');

  const errs = [a, b, c].flatMap((p) => p.errors).filter((e) => !e.startsWith('network:'));
  check('no page error on any page', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await a.close();
  await b.close();
  await c.close();
  await server.stop();
  await rm(dir, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
