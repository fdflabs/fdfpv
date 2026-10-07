/*
 * game-lobby-check.js: a game's title card, one click into its lobby, for
 * three pages against a rooms server of its own, in this process on a free
 * port (the owner, 2026-10-02: "when i click on them directly, it should
 * take me to the lobby of the room ... one two clicks max", and "every
 * click will take you to the lobby for it, ready to go either single or
 * multi"):
 *
 *   SIM_GPU=1 node scripts/game-lobby-check.js --game=combat [outdir]
 *   (--game= combat, tag, war, free or race; npm run game:lobby -- --game=tag)
 *
 *   A clicks the card, one click, and is in the lobby of a public room
 *   made for the game, named for A. Escape from it is the title's cards,
 *   out of the room, that card under the cursor (the owner, 2026-10-02:
 *   it went to the free flight menu); a click on it again is a lobby
 *   again. A alone presses R: the five seconds,
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
 * The race (--game=race): A's lobby has no track yet, and its Track row
 * opens My tracks; A plays its own track there and is back in the lobby,
 * the room's track that one. R: the race goes, A on the grid. B's one
 * click lands in A's lobby with the track; both ready, both race. A race
 * on is the one round a newcomer cannot join (it went off a grid): C's
 * click on the panel lands C in the lobby, not racing.
 *
 * The war (--game=war) has a page between its link and its lobby (the
 * owner, 2026-10-03): the link opens the campaign's page, its four
 * missions with their stars, no room yet, and mission 1's Play makes the
 * room for it, onto its briefing: two clicks from home, three through
 * Operations. Escape from that briefing is out of the room and on the
 * page again, and Escape on the page is the cards. B comes into A's war
 * by the rooms panel, Flight Club then the room, two clicks, onto the
 * same briefing, since Play makes a room of its own.
 *
 * Every click a page makes is counted (tests/lib/page.js click), and the
 * rows say how many it took.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { openPage } from '../tests/lib/page.js';
import { mapTrackDocument } from '../tests/lib/maptrack.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const GAME = (process.argv.find((a) => a.startsWith('--game=')) || '--game=combat').slice('--game='.length);
const outDir = process.argv.slice(2).find((a) => !a.startsWith('--')) || join(root, 'build', `game-lobby-${GAME}`);

/* Each game: its title card, its world, the panel's word for it, what a
 * round on looks like on a page, how the room ends one, and how long its
 * start takes to put a pilot in the air (the war's briefing is its 70 s
 * intro, src/share/war/intro.js, then its countdown). */
const GAMES = {
  combat: {
    card: 'combat', world: 'swiss2', chip: 'Combat', upMs: 60000,
    on: "['countdown', 'on'].includes(window.__combat ? window.__combat().round.state : '')",
    /* Run out, from its countdown as well: on, then over. */
    end: (core, now) => {
      const t = Math.ceil(core.roomMs(now));
      core.combat.round.startsAt = Math.min(core.combat.round.startsAt, t);
      core.combat.round.endsAt = t;
      return [...core.combat.tick(core, now + 1), ...core.combat.tick(core, now + 2)];
    },
  },
  tag: {
    card: 'ace', world: 'swiss2', chip: 'Catch the Ace', upMs: 60000,
    on: "['countdown', 'live'].includes(window.__roomTag().view.state)",
    end: (core, now) => core.tag.abandon(core, now),
  },
  war: {
    card: 'campaign', world: 'itaipu', chip: 'War 1', upMs: 150000,
    on: "['briefing', 'countdown', 'live'].includes(window.__war().view.state)",
    end: (core) => {
      core.war.match.output = 0;
      core.war.settle(core.war.match.f);
      return core.war.changed(core);
    },
  },
  free: {
    card: 'freestyle-wing1000', world: 'swiss2', chip: 'Free flight', upMs: 60000,
    on: 'Boolean(window.__rooms().lobby && window.__rooms().lobby.live)',
    end: null,
  },
  race: {
    card: 'race-5inch', world: 'swiss2', chip: 'Race', upMs: 120000,
    on: "window.__roomRace().race.state === 'on'",
    end: (core) => core.race.end(core),
  },
};
/* A's own track for the race: three gates on a ring hung over the Swiss
 * valley's field, in A's My tracks (src/trackbuilder/storage.js). */
const TRACK_ID = 'trk-lobby0001';
const trackSeed = () => {
  const doc = mapTrackDocument({ id: TRACK_ID, name: 'Lobby ring', map: 'swiss2', types: ['gate', 'hoop30', 'gate'], radius: 50 });
  return `(() => { localStorage.setItem('webfpv.trackbuilder.library.v1', JSON.stringify({ ${JSON.stringify(TRACK_ID)}: ${JSON.stringify(doc)} })); })();`;
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
    phase: r.phase, code: r.code, public: r.public, name: r.name, mode: r.mode,
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
/* The war: devMissions, and the page's ?missions=dev, since its mission 1
 * is in development (held since 2026-10-07; src/game/campaign.js
 * released). Its room is then private, the one kind the server makes for
 * a mission in development, so its public and rooms panel rows fail
 * until a mission is released again: they say what the war's card no
 * longer does. */
const server = await startRooms({ db: join(dir, 'rooms.db'), port: 0, devMissions: GAME === 'war' });
const rooms = `http://127.0.0.1:${server.port}`;
console.log(`${GAME}: a card, one click into its lobby, rooms at ${rooms}`);
const url = `/index.html?rooms=${encodeURIComponent(rooms)}${GAME === 'war' ? '&missions=dev' : ''}`;

/* The room's own end of its round, in this process's server, sent the way
 * the room sends any change. */
function endRound(code) {
  const room = [...server.env.ROOMS.objects.values()].find((r) => r.host.core && r.host.core.meta.code === code);
  const now = Date.now();
  room.host.run(G.end(room.host.core, now));
}

const a = await openPage({ root, url, width: 1280, height: 720, seed: GAME === 'race' ? [SEED, trackSeed()] : [SEED] });
const b = await openPage({ root, url, width: 1280, height: 720, seed: [SEED] });
const c = await openPage({ root, url, width: 1280, height: 720, seed: [SEED] });
try {
  for (const p of [a, b, c]) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__ui.onGate()', 60000).catch(() => {});
  }
  const cardSel = `.gate-card-${G.card}`;
  /* The war's page between its link and its lobby: what it shows, or
   * null when it is not up. */
  const PAGE = `(() => {
    const box = document.querySelector('.campaign-box');
    if (!box || document.querySelector('.name-dialog').hidden) { return null; }
    return { page: box.dataset.page, phase: window.__rooms().phase, missions: [...box.querySelectorAll('.campaign-mission')].map((m) => ({
      id: m.dataset.mission, stars: m.querySelectorAll('.campaign-star').length, playable: !m.querySelector('.campaign-play').disabled })) };
  })()`;
  const pageOk = (v) => Boolean(v) && v.page === 'missions' && v.phase === 'idle' && v.missions.length === 4
    && v.missions.every((m) => m.stars === 3) && v.missions[0].id === 'itaipu-1' && v.missions[0].playable;
  /* Clicks from an activity's card to its lobby: the war's Play is one more. */
  const CLICKS = GAME === 'war' ? 2 : 1;
  /* The card's click, and for the war mission 1's Play on the page it
   * opens: what that page showed, or null for every other game. */
  async function intoLobby(p, sel) {
    await p.click(sel);
    if (GAME !== 'war') {
      return null;
    }
    await p.until(`${PAGE} !== null`, 10000).catch(() => {});
    const v = await p.evaluate(PAGE);
    await p.click('[data-mission="itaipu-1"] .campaign-play');
    return v;
  }

  /* A: ONE CLICK, A LOBBY OF ITS OWN: the activity's link on its hub's
   * card on home (src/ui/ui.js HUBS), which wears the card's class. */
  const aBefore = a.clicks;
  const pageA = await intoLobby(a, cardSel);
  await a.until(`window.__rooms().phase === 'open' && ${IN_LOBBY}`, 60000).catch(() => {});
  await a.sleep(800);
  const la = await a.evaluate(LOBBY);
  if (GAME === 'war') {
    check('the war\'s link opens the campaign\'s page first: four missions with their stars, mission 1 playable, no room yet', pageOk(pageA), JSON.stringify(pageA));
  }
  check(`A: ${CLICKS === 1 ? 'one click on its link on home' : 'its link on home, then Play'} (${a.clicks - aBefore}) and A is in the LOBBY of a public room made for ${GAME}, named for A, Ready under the cursor`,
    a.clicks - aBefore === CLICKS && la.shown && la.title === (GAME === 'war' ? 'BRIEFING' : 'LOBBY') && la.public === true && la.mode === (GAME === 'free' ? null : GAME)
    && /, /.test(la.name || '') && la.here === 'friends-lobby-ready' && la.flying !== 'flight', JSON.stringify(la));
  await shot(a, '1-a-lobby');

  /* THE WAR'S LOBBY IS OPERATIONS' BRIEFING (src/ui/briefing.js): the
   * mission's line, what to do first where the mission has stages, the
   * five facts, and Deploy for Ready. No difficulty. */
  if (GAME === 'war') {
    const brief = await a.evaluate(`(() => {
      const box = document.querySelector('.war-lobby');
      const ui = window.__ui;
      return {
        title: (box.querySelector('.war-lobby-title') || {}).textContent || '',
        line: (box.querySelector('.war-brief-line') || {}).textContent || '',
        first: [...box.querySelectorAll('.war-brief-objective')].map((n) => n.textContent),
        facts: [...box.querySelectorAll('.war-brief-facts dt')].map((n) => n.textContent),
        values: [...box.querySelectorAll('.war-brief-facts dd')].map((n) => n.textContent),
        ready: (ui.items().find((it) => it.action === 'friends-lobby-ready') || {}).label || '',
        difficulty: /difficult/i.test(box.textContent) || ui.items().some((it) => /difficult/i.test(it.label || '')),
      };
    })()`);
    check('the war\'s lobby is the briefing: the line, the first objective, where, aircraft, length, pilots and room, Deploy, no difficulty',
      brief.title === 'BRIEFING' && brief.line.length > 0 && brief.first.length > 0 && brief.facts.join() === 'Where,Aircraft,Length,Pilots,Room'
      && brief.values.every((x) => x.length > 0) && /Public/.test(brief.values[4]) && brief.ready === 'Deploy' && !brief.difficulty, JSON.stringify(brief));
  }

  /* ESCAPE: the cards, out of the room, this card under the cursor; for
   * the war, the campaign's page first, out of the room. */
  if (GAME === 'war') {
    await a.tap('Escape');
    await a.until(`${PAGE} !== null && window.__rooms().phase === 'idle'`, 15000).catch(() => {});
    const undone = await a.evaluate(PAGE);
    check('Escape from the briefing Play made: out of the room, the campaign\'s page again', pageOk(undone), JSON.stringify(undone));
    await a.sleep(700);
  }
  await a.tap('Escape');
  await a.until("window.__ui.onGate() && window.__rooms().phase === 'idle'", 15000).catch(() => {});
  await a.sleep(500);
  const esc = await a.evaluate(`({
    gate: window.__ui.onGate(), phase: window.__rooms().phase, screen: window.__ui.screen,
    here: (window.__ui.items()[window.__ui.cursor] || {}).action || null,
    on: [...document.querySelectorAll('.screen-title .gate-card.on')].map((n) => n.className),
  })`);
  check(`Escape from the lobby: its hub's cards, out of the room, ${G.card}'s card under the cursor`, esc.gate && esc.phase === 'idle'
    && esc.screen === 'title' && esc.here === `way-${G.card}` && esc.on.length === 1 && esc.on[0].includes(`gate-card-${G.card}`), JSON.stringify(esc));
  /* ESCAPE AT ONCE: the lobby a card opened is left by an Escape the
   * moment the room says it is a lobby, its panel drawn or not (the panel
   * is drawn on a later tick, and an Escape before it did nothing). */
  await intoLobby(a, `.gate-card${cardSel}`);
  await a.until("window.__rooms().phase === 'open' && window.__ui.inLobby && window.__ui.inLobby()", 60000).catch(() => {});
  const quick = await a.evaluate("({ lobby: Boolean(window.__ui.inLobby && window.__ui.inLobby()), panel: Boolean(window.__ui.warLobbyOn), phase: window.__rooms().phase, screen: window.__ui.screen, dialog: !document.querySelector('.name-dialog').hidden })");
  await a.tap('Escape');
  await a.until("window.__ui.onGate() && window.__rooms().phase === 'idle'", 15000).catch(() => {});
  check(`Escape the moment a card's lobby is up (panel drawn: ${quick.panel}): out of the room, its hub's cards again`,
    quick.lobby && await a.evaluate("window.__ui.onGate() && window.__rooms().phase === 'idle'"),
    `before ${JSON.stringify(quick)} after ${await a.evaluate("JSON.stringify({ gate: window.__ui.onGate(), phase: window.__rooms().phase, screen: window.__ui.screen })")}`);
  if (GAME === 'war') {
    check('and the war\'s is the campaign\'s page again', pageOk(await a.evaluate(PAGE)), JSON.stringify(await a.evaluate(PAGE)));
    await a.sleep(700);
    await a.tap('Escape');
    await a.until("document.querySelector('.name-dialog').hidden", 10000).catch(() => {});
  }

  /* THROUGH THE HUB: Escape again is home; its hub's card, then the
   * activity's card, is a lobby again in two clicks (the owner: "one two
   * clicks max"). */
  await a.tap('Escape');
  await a.until('window.__ui.onGate() && window.__ui.hub === null', 10000).catch(() => {});
  const hubOf = await a.evaluate(`(() => { const c = document.querySelector('.gate-card ${cardSel}'); return c ? c.closest('.gate-card').dataset.hub : null; })()`);
  check(`and Escape again is home, ${G.card}'s link on its hub's card`, await a.evaluate('window.__ui.onGate() && window.__ui.hub === null') && Boolean(hubOf), String(hubOf));
  const aHub = a.clicks;
  await a.click(`.gate-card-hub-${hubOf} .gate-card-name`);
  await a.until(`window.__ui.hub === ${JSON.stringify(hubOf)} && document.querySelector('.gate-card${cardSel}')`, 10000).catch(() => {});
  const pageHub = await intoLobby(a, `.gate-card${cardSel}`);
  await a.until(`window.__rooms().phase === 'open' && ${IN_LOBBY}`, 60000).catch(() => {});
  await a.sleep(800);
  const la2 = await a.evaluate(LOBBY);
  if (GAME === 'war') {
    check('through Operations its card opens the campaign\'s page too', pageOk(pageHub), JSON.stringify(pageHub));
  }
  check(`through the hub: its card, then ${G.card}'s card${CLICKS === 2 ? ', then Play' : ''}, ${a.clicks - aHub} clicks, a lobby again`, a.clicks - aHub === 1 + CLICKS
    && la2.shown && la2.phase === 'open' && la2.here === 'friends-lobby-ready', JSON.stringify(la2));
  const code = la2.code;

  /* The war lobby's Campaign row: its screen, and Escape is the lobby again. */
  if (GAME === 'war') {
    await a.evaluate("(() => { window.__ui.act('friends-lobby-campaign'); return true; })()");
    await a.until("document.querySelector('.campaign-box') && !document.querySelector('.name-dialog').hidden", 10000).catch(() => {});
    const opened = await a.evaluate("Boolean(document.querySelector('.campaign-box')) && !document.querySelector('.name-dialog').hidden");
    await a.sleep(700);
    await a.tap('Escape');
    await a.until(`document.querySelector('.name-dialog').hidden && ${IN_LOBBY}`, 10000).catch(() => {});
    check('the Campaign row opens the campaign, and Escape is the lobby again, still in the room', opened
      && await a.evaluate(`document.querySelector('.name-dialog').hidden && ${IN_LOBBY} && window.__rooms().code === ${JSON.stringify(code)}`),
    await a.evaluate("JSON.stringify({ screen: window.__ui.screen, phase: window.__rooms().phase, dialog: !document.querySelector('.name-dialog').hidden })"));
  }

  /* THE RACE'S TRACK: the host's Track row, My tracks, Play: back in the
   * lobby, the room's track A's. */
  if (GAME === 'race') {
    check('the race lobby has no track yet, and the host a Track row', /no track yet/.test(la.line) && la.rows.includes('friends-lobby-track'), JSON.stringify(la));
    await a.evaluate("(() => { window.__ui.act('friends-lobby-track'); return true; })()");
    const cardOf = `window.__ui.items().find((it) => it.course && it.course.track.id === ${JSON.stringify(TRACK_ID)})`;
    await a.until(`window.__ui.screen === 'courses' && Boolean(${cardOf})`, 30000).catch(() => {});
    check('Track opens My tracks, A\'s own track on it', await a.evaluate(`window.__ui.screen === 'courses' && Boolean(${cardOf})`), await a.evaluate('window.__ui.screen'));
    /* Escape from My tracks is one level back: the lobby, still in the room. */
    await a.tap('Escape');
    await a.until(IN_LOBBY, 10000).catch(() => {});
    check('Escape from My tracks is the lobby again, still in the room', await a.evaluate(`${IN_LOBBY} && window.__rooms().phase === 'open'`),
      await a.evaluate("JSON.stringify({ screen: window.__ui.screen, phase: window.__rooms().phase })"));
    await a.evaluate("(() => { window.__ui.act('friends-lobby-track'); return true; })()");
    await a.until(`window.__ui.screen === 'courses' && Boolean(${cardOf})`, 30000).catch(() => {});
    await a.evaluate(`(() => { window.__ui.actOnCard('card-fly', ${cardOf}); return true; })()`);
    await a.until(`${IN_LOBBY} && window.__roomRace().track && window.__roomRace().track.id === ${JSON.stringify(TRACK_ID)}`, 120000).catch(() => {});
    /* The panel is redrawn a frame or more after the room's word. */
    await a.until("/Lobby ring/.test((document.querySelector('.war-lobby-mission') || {}).textContent || '')", 10000).catch(() => {});
    const lt = await a.evaluate(LOBBY);
    check('Play on it: back in the lobby, the room\'s track A\'s', lt.shown && /Lobby ring/.test(lt.line)
      && (await a.evaluate('(window.__roomRace().track || {}).id')) === TRACK_ID, JSON.stringify({ line: lt.line, screen: lt.screen }));
    await a.until('window.__roomRace().ready', 120000).catch(() => {});
  }

  /* A ALONE: ready, the five seconds, the round. */
  await a.tap('KeyR');
  await a.until("/Starting in [1-5]/.test(document.querySelector('.war-lobby-status').textContent)", 10000).catch(() => {});
  check('A alone presses R: the five seconds start, nobody else needed', /Starting in [1-5]/.test((await a.evaluate(LOBBY)).status),
    (await a.evaluate(LOBBY)).status);
  await a.until(G.on, 20000).catch(() => {});
  await a.until(FLYING, G.upMs).catch(() => {});
  check('and the round is on, A flying it alone', await a.evaluate(G.on) && await a.evaluate(FLYING),
    JSON.stringify({ on: await a.evaluate(G.on), flying: await a.evaluate('window.__craftState().mode'), screen: await a.evaluate('window.__ui.screen') }));
  if (G.end) {
    endRound(code);
    await a.until(IN_LOBBY, 30000).catch(() => {});
    const back = await a.evaluate(LOBBY);
    check('its end puts A back in the lobby, not ready', back.shown && back.flying !== 'flight' && back.pilots.length === 1 && !back.pilots[0].ready,
      JSON.stringify({ screen: back.screen, shown: back.shown, flying: back.flying }));
  }

  /* B: ONE CLICK, INTO A'S LOBBY (or, free flight, into A's flight). The
   * war's card makes B a room of B's own, so B comes in by the rooms
   * panel: Flight Club, then A's room, onto A's briefing. */
  const bBefore = b.clicks;
  const B_CLICKS = GAME === 'war' ? 2 : 1;
  if (GAME === 'war') {
    const bChip = `lobby:friends-room-${code}`;
    await b.click('.gate-card-hub-club .gate-card-name');
    await b.until("window.__ui.hub === 'club'", 10000).catch(() => {});
    await b.until(`window.__ui.items().some((it) => it.action === ${JSON.stringify(bChip)})`, 30000).catch(() => {});
    await b.evaluate(`(() => {
      const ui = window.__ui;
      const row = ui.titleRoomEls.find((e) => ui.items()[e.i].action === ${JSON.stringify(bChip)});
      row.node.dataset.check = 'here';
      return true;
    })()`);
    await b.click('[data-check="here"]');
  } else {
    await b.click(cardSel);
  }
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
    check(`B: ${GAME === 'war' ? 'Flight Club, then A\'s room on its panel' : 'one click on the same card'} (${b.clicks - bBefore}) and B is in A's lobby, each in the other's pilots`,
      b.clicks - bBefore === B_CLICKS && b2.code === code && b2.title === (GAME === 'war' ? 'BRIEFING' : 'LOBBY') && b2.shown && a2.pilots.length === 2 && b2.pilots.length === 2 && b2.flying !== 'flight', JSON.stringify({ a: a2.pilots, b: b2.pilots, code: b2.code }));
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

  /* C: ONE CLICK FROM THE ROOMS PANEL, INTO THE ROUND (a race: into the
   * lobby, its race being one off a grid). The panel is Flight Club's
   * (src/ui/ui.js HUBS): C opens it from home first. */
  const chip = `lobby:friends-room-${code}`;
  await c.until("window.__ui.onGate() && window.__ui.hub === null", 10000).catch(() => {});
  const cBefore = c.clicks;
  await c.click('.gate-card-hub-club .gate-card-name');
  await c.until("window.__ui.hub === 'club'", 10000).catch(() => {});
  await c.until(`window.__ui.items().some((it) => it.action === ${JSON.stringify(chip)} && /flying/.test(it.value || ''))`, 30000).catch(() => {});
  const listed = await c.evaluate(`(window.__ui.items().find((it) => it.action === ${JSON.stringify(chip)}) || null)`);
  check(`C's title panel lists the room as ${G.chip}, its pilots flying (racing), not in a lobby`, listed && listed.value.startsWith(G.chip) && /\d+ flying/.test(listed.value)
    && !/lobby/.test(listed.value), JSON.stringify(listed && { value: listed.value, join: listed.join }));
  await c.evaluate(`(() => {
    const ui = window.__ui;
    const row = ui.titleRoomEls.find((e) => ui.items()[e.i].action === ${JSON.stringify(chip)});
    row.node.dataset.check = 'here';
    return true;
  })()`);
  await c.click('[data-check="here"]');
  if (GAME === 'race') {
    await c.until(`window.__rooms().code === ${JSON.stringify(code)} && window.__ui.screen === 'friends'`, 60000).catch(() => {});
    await c.sleep(2000);
    const cr = await c.evaluate("({ code: window.__rooms().code, screen: window.__ui.screen, role: window.__roomRace().role })");
    check(`C: Flight Club, then the room on its panel (${c.clicks - cBefore} clicks), and C is in the room, waiting out the race on its screen, no racer`, c.clicks - cBefore === 2
      && cr.code === code && cr.screen === 'friends' && cr.role !== 'racing', JSON.stringify(cr));
  } else {
    await c.until(FLYING, 400000).catch(() => {});
    check(`C: Flight Club, then the room on its panel (${c.clicks - cBefore} clicks), and C is in the room's round, flying`, c.clicks - cBefore === 2
      && (await c.evaluate('window.__rooms().code')) === code && await c.evaluate(FLYING) && await c.evaluate(G.on),
    JSON.stringify({ code: await c.evaluate('window.__rooms().code'), screen: await c.evaluate('window.__ui.screen'), on: await c.evaluate(G.on) }));
  }
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
