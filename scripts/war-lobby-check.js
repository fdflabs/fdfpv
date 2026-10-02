/*
 * war-lobby-check.js: the war's lobby, two pilots, through the real shell
 * and a rooms server of its own, in this process on a free port:
 *
 *   npm run war:lobby [-- outdir]
 *
 * The owner, 2026-10-01: "its not hard to make people join a lobby and
 * then start a mission, its on every single game". Page A has the consent
 * and mission 1 won; page B is a fresh profile.
 *
 *   A makes the room: Make a room, Everybody, Itaipu, Defend Itaipu,
 *     Mission 1. A is on its LOBBY: the mission, the status, A in the
 *     pilots, the cursor on Ready, no Fly and no world row.
 *   B finds it in Rooms, joins, says Continue to the consent: in the same
 *     lobby, each in the other's pilots.
 *   A presses R, B Enter on Ready: both are told the five seconds, and
 *     both are in mission 1's briefing.
 *   The host ends it: both are back in the lobby, nobody ready, the last
 *     mission said.
 *   Only A ready: the 45 seconds shown, and the mission starts on its own.
 *   Start now: the host's, at once.
 *   Hot join: B leaves; A's room goes to battle; B finds it in Rooms as in
 *     battle with its wave and joins: straight into the battle, flying,
 *     never the lobby.
 *   Campaign Play makes a lobby too.
 *
 * Pictures of the lobby at 1920 by 1080 and 390 by 844 in outdir (not in
 * the repository). No page error.
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
import { LOBBY_DEADLINE_MS } from '../edge/rooms/warlobby.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = process.argv[2] || join(root, 'build', 'war-lobby');

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
  await page.cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, page.sessionId);
  await page.until(`window.innerWidth === ${width} && window.innerHeight === ${height}`, 10000);
  await page.sleep(600);
}

const DIALOG = "(() => { const d = document.querySelector('.name-dialog'); return d && !d.hidden ? (d.querySelector('h2') || {}).textContent || '' : null; })()";
async function answer(page, yes) {
  await page.sleep(700);
  await page.tap(yes ? 'Enter' : 'Escape');
}

/* The lobby as drawn: its panel, the rows under it. */
const LOBBY = `(() => {
  const box = document.querySelector('.war-lobby');
  const ui = window.__ui;
  const items = ui.items();
  const here = items[ui.cursor] || {};
  return {
    screen: ui.screen,
    shown: Boolean(box && !box.hidden && box.getClientRects().length),
    title: box ? (box.querySelector('.war-lobby-title') || {}).textContent || '' : '',
    mission: box ? (box.querySelector('.war-lobby-mission') || {}).textContent || '' : '',
    status: box ? (box.querySelector('.war-lobby-status') || {}).textContent || '' : '',
    last: box ? (box.querySelector('.war-lobby-last') || {}).textContent || '' : '',
    pilots: box ? [...box.querySelectorAll('.war-lobby-pilot')].map((p) => ({
      name: p.querySelector('.war-lobby-name').textContent, ready: p.classList.contains('ready'), host: Boolean(p.querySelector('.war-lobby-host')),
    })) : [],
    rows: items.map((it) => it.action || it.label),
    here: here.action || here.label || null,
    flying: window.__craftState().mode,
    war: window.__war().view.state,
  };
})()`;

const SEED_A = `(() => {
  const s = JSON.parse(localStorage.getItem('webfpv.settings.v3') || '{}');
  localStorage.setItem('webfpv.settings.v3', JSON.stringify({
    ...s, warConsent: true, campaign: { v: 1, earned: 0, missions: { 'itaipu-1': { stars: 1, won: true, credits: 100 } } },
  }));
})();`;

const dir = mkdtempSync(join(tmpdir(), 'war-lobby-'));
const { startRooms } = await import('../edge/rooms/node.js');
const server = await startRooms({ db: join(dir, 'rooms.db'), port: 0 });
const rooms = `http://127.0.0.1:${server.port}`;
console.log(`the war's lobby, rooms at ${rooms}`);
const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;

/* A REAL LOSS, decided by the room's own rule (edge/rooms/war.js settle:
 * lost the instant the output is under the mission's floor), in this
 * process's room server: the output taken to nothing, settled, and sent
 * the way the room sends any change. Flying it to a loss takes minutes. */
function loseNow(code) {
  const room = [...server.env.ROOMS.objects.values()].find((r) => r.host.core && r.host.core.meta.code === code);
  const { core } = room.host;
  core.war.match.output = 0;
  core.war.settle(core.war.match.f);
  room.host.run(core.war.changed(core));
  return core.war.match.state;
}
const a = await openPage({ root, url, width: 1920, height: 1080, seed: [SEED_A] });
const b = await openPage({ root, url, width: 390, height: 844 });
try {
  for (const p of [a, b]) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__ui.onGate()', 60000).catch(() => {});
  }

  /* A MAKES THE ROOM. */
  const formRow = (label) => `(window.__ui.items().find((it) => it.label === ${JSON.stringify(label)}) || null)`;
  const pick = (label, want) => a.evaluate(`(() => {
    const r = ${formRow(label)};
    const o = r && r.options.find((x) => x.label === ${JSON.stringify(want)} || x.label.startsWith(${JSON.stringify(want)}));
    if (!o) { return false; }
    r.pick(o.value);
    return true;
  })()`);
  await a.evaluate("(() => { window.__ui.act('way-friends'); window.__ui.act('rooms'); window.__ui.act('roomnew'); return true; })()");
  await a.until("window.__ui.screen === 'roomnew'", 10000).catch(() => {});
  const picked = [await pick('Who can join', 'Everybody'), await pick('The world', 'Itaipu'), await pick('Game', 'Defend Itaipu'), await pick('Mission', 'Mission 1')];
  check('Make a room: Everybody, Itaipu, Defend Itaipu, Mission 1', picked.every(Boolean), JSON.stringify(picked));
  await a.evaluate("(() => { window.__ui.setCursor(window.__ui.items().findIndex((it) => it.action === 'friends-make')); return true; })()");
  await a.tap('Enter');
  await a.until("window.__rooms().phase === 'open' && document.querySelector('.war-lobby') && !document.querySelector('.war-lobby').hidden", 60000).catch(() => {});
  await a.sleep(1500);
  const code = await a.evaluate('window.__rooms().code');
  const la = await a.evaluate(LOBBY);
  check('A is on the room\'s LOBBY: mission 1, waiting, A its host, the cursor on Ready', la.screen === 'friends' && la.shown && la.title === 'LOBBY'
    && /Mission 1: /.test(la.mission) && /Waiting for pilots/.test(la.status) && la.pilots.length === 1 && la.pilots[0].host && !la.pilots[0].ready
    && la.here === 'friends-lobby-ready', JSON.stringify(la));
  check('and nothing of free flight: no Fly, no world row, no other games, never in the air', !la.rows.includes('fly') && !la.rows.includes('The world')
    && !la.rows.some((r) => /^friends-(combat|tag|race)/.test(r)) && la.flying !== 'flight', la.rows.join());

  /* B FINDS IT AND JOINS. */
  const rowAction = `friends-room-${code}`;
  const openRooms = async () => {
    await b.evaluate("(() => { window.__ui.act('way-friends'); window.__ui.act('rooms'); return true; })()");
    await b.until(`window.__ui.screen === 'rooms' && window.__ui.items().some((it) => it.action === ${JSON.stringify(rowAction)})`, 30000).catch(() => {});
  };
  await openRooms();
  await b.evaluate(`(() => { window.__ui.act(${JSON.stringify(rowAction)}); return true; })()`);
  await b.until(`${DIALOG} !== null`, 30000).catch(() => {});
  await answer(b, true);
  await b.until("document.querySelector('.war-lobby') && !document.querySelector('.war-lobby').hidden && document.querySelectorAll('.war-lobby-pilot').length === 2", 30000).catch(() => {});
  await a.until("document.querySelectorAll('.war-lobby-pilot').length === 2", 30000).catch(() => {});
  const [a2, b2] = await Promise.all([a, b].map((p) => p.evaluate(LOBBY)));
  check('B joins from Rooms, says Continue: both in the lobby, each in the other\'s pilots', a2.pilots.length === 2 && b2.pilots.length === 2 && b2.shown
    && b2.screen === 'friends' && b2.here === 'friends-lobby-ready' && b2.flying !== 'flight', JSON.stringify({ a: a2.pilots, b: b2.pilots }));
  await shot(a, 'lobby-1920x1080');
  await shot(b, 'lobby-390x844');

  /* BOTH READY. */
  await a.tap('KeyR');
  await b.tap('Enter');
  /* Each page draws its panel on its own frames. */
  const starting = "/Starting in/.test(document.querySelector('.war-lobby-status').textContent)";
  await a.until(starting, 10000).catch(() => {});
  await b.until(starting, 10000).catch(() => {});
  const counting = await Promise.all([a, b].map((p) => p.evaluate(LOBBY)));
  check('A presses R, B Enter on Ready: both see both ready and the five seconds', counting.every((v) => /Starting in [1-5]/.test(v.status)
    && v.pilots.every((p) => p.ready)), JSON.stringify(counting.map((v) => v.status)));
  await shot(a, 'lobby-starting-1920x1080');
  const briefing = "window.__war().view.state === 'briefing' && window.__war().view.mission === 'itaipu-1'";
  await a.until(briefing, 15000).catch(() => {});
  await b.until(briefing, 5000).catch(() => {});
  const ids = await Promise.all([a, b].map((p) => p.evaluate("(() => { const v = window.__war().view; return v.state + ':' + v.mission + ':' + v.id; })()")));
  check('and both are in mission 1\'s briefing, the same war', ids[0] === ids[1] && ids[0].startsWith('briefing:itaipu-1'), ids.join(' / '));

  /* THE END: back in the lobby. */
  const backInLobby = async (what) => {
    await a.evaluate("(() => { window.__warDo('end'); return true; })()");
    const lobbyBack = "window.__ui.screen === 'friends' && document.querySelector('.war-lobby') && !document.querySelector('.war-lobby').hidden && window.__war().view.state === 'ended'";
    await a.until(lobbyBack, 30000).catch(() => {});
    await b.until(lobbyBack, 30000).catch(() => {});
    await a.sleep(500);
    const back = await Promise.all([a, b].map((p) => p.evaluate(LOBBY)));
    check(`${what}: both back in the lobby, nobody ready, the last mission said`, back.every((v) => v.shown && v.screen === 'friends'
      && v.pilots.every((p) => !p.ready) && /Last mission/.test(v.last) && v.flying !== 'flight'), JSON.stringify(back.map((v) => ({ s: v.screen, last: v.last, f: v.flying }))));
  };
  await backInLobby('the host ends it');

  /* ONLY A READY: the 45 seconds. */
  await a.tap('KeyR');
  /* B's panel is redrawn on its own frames, after A's. */
  const told45 = "/Starts in 0:4/.test(document.querySelector('.war-lobby-status').textContent)";
  await a.until(told45, 10000).catch(() => {});
  await b.until(told45, 10000).catch(() => {});
  const deadline = await b.evaluate(LOBBY);
  check('only A ready: B is told the 45 s', /Starts in 0:4\d with whoever is ready/.test(deadline.status) && deadline.pilots.filter((p) => p.ready).length === 1,
    JSON.stringify({ b: deadline.status, a: (await a.evaluate(LOBBY)).status }));
  await a.until(briefing, LOBBY_DEADLINE_MS + 15000).catch(() => {});
  check('and at its end the mission starts on its own', await b.evaluate(briefing), await b.evaluate('window.__war().view.state'));
  await backInLobby('ended again');

  /* START NOW. */
  await a.evaluate("(() => { window.__ui.setCursor(window.__ui.items().findIndex((it) => it.action === 'friends-war-start')); return true; })()");
  const startRow = await a.evaluate("(window.__ui.items()[window.__ui.cursor] || {}).label");
  await a.tap('Enter');
  await a.until(briefing, 10000).catch(() => {});
  check('the host\'s Start now: at once, nobody ready', startRow === 'Start now' && await b.evaluate(briefing), String(startRow));
  await a.evaluate("(() => { window.__warDo('end'); return true; })()");
  await a.until("window.__war().view.state === 'ended'", 15000).catch(() => {});

  /* HOT JOIN: B out, the room to battle, B in from Rooms straight into it. */
  await b.evaluate("(() => { window.__ui.act('friends-leave'); window.__ui.act('mode-gate'); return true; })()");
  await b.until("window.__rooms().phase === 'idle' && window.__ui.onGate()", 10000).catch(() => {});
  await a.evaluate("(() => { window.__warDo('start', 'itaipu-1'); return true; })()");
  await a.until("window.__war().view.state === 'live'", 60000).catch(() => {});
  await b.until(`(window.__ui.items().find((it) => it.action === ${JSON.stringify(`lobby:${rowAction}`)}) || {}).join === 'Join battle'`, 30000).catch(() => {});
  const chip = await b.evaluate(`(window.__ui.items().find((it) => it.action === ${JSON.stringify(`lobby:${rowAction}`)}) || null)`);
  check('B\'s title panel shows the room in battle, its wave, Join battle', chip && /^In battle 1 · wave \d+\/\d+$/.test(chip.value) && chip.join === 'Join battle',
    JSON.stringify(chip && { value: chip.value, join: chip.join }));
  await openRooms();
  /* Rooms reads its own listing, which can be a poll behind the panel's. */
  await b.until(`/wave \\d+ of/.test((window.__ui.items().find((it) => it.action === ${JSON.stringify(rowAction)}) || {}).note || '')`, 15000).catch(() => {});
  const battleRow = await b.evaluate(`(window.__ui.items().find((it) => it.action === ${JSON.stringify(rowAction)}) || null)`);
  check('and Rooms says in battle, Defend Itaipu, mission 1, wave x of y', battleRow && /in battle, Defend Itaipu, mission 1, wave \d+ of \d+\. Enter to join the battle\./.test(battleRow.note),
    JSON.stringify(battleRow && battleRow.note));
  await b.evaluate(`(() => { window.__ui.act(${JSON.stringify(rowAction)}); return true; })()`);
  await b.until("window.__craftState().mode === 'flight' && window.__ui.screen === 'flight'", 400000).catch(() => {});
  const hot = await b.evaluate(LOBBY);
  check('B joins mid battle: straight into it, flying, not the lobby', hot.flying === 'flight' && hot.screen === 'flight' && hot.war === 'live' && !hot.shown,
    JSON.stringify({ screen: hot.screen, flying: hot.flying, war: hot.war, lobby: hot.shown }));

  /* A LOSS IN THE AIR, the owner's report (2026-10-01): a pilot who is
   * not the host, on a lost mission's banner, read "WAITING FOR THE HOST
   * TO RESTART" and had no way forward. */
  const lost = loseNow(code);
  await b.until("window.__war().view.state === 'lost' && /^BACK TO THE LOBBY IN [1-8]$/.test(window.__war().hud.restart || '')", 10000).catch(() => {});
  const said = await b.evaluate("({ state: window.__war().view.state, restart: window.__war().hud.restart || null })");
  check('the mission lost, B flying and not the host: the banner reads BACK TO THE LOBBY IN n', lost === 'lost' && said.state === 'lost'
    && /^BACK TO THE LOBBY IN [1-8]$/.test(said.restart || ''), JSON.stringify({ server: lost, ...said }));
  await b.until("window.__ui.screen === 'friends' && document.querySelector('.war-lobby') && !document.querySelector('.war-lobby').hidden", 15000).catch(() => {});
  const after = await b.evaluate(LOBBY);
  check('and B is put in the lobby with nothing pressed, its Ready under the cursor', after.shown && after.screen === 'friends' && after.here === 'friends-lobby-ready'
    && after.flying !== 'flight', JSON.stringify({ shown: after.shown, screen: after.screen, here: after.here, flying: after.flying }));

  /* CAMPAIGN PLAY makes a lobby too. */
  await a.evaluate("(() => { window.__ui.act('friends-leave'); window.__ui.act('title'); window.__campaign.open(); return true; })()");
  await a.until("document.querySelector('[data-mission=\"itaipu-1\"] .campaign-play')", 10000).catch(() => {});
  await a.evaluate("(() => { document.querySelector('[data-mission=\"itaipu-1\"] .campaign-play').click(); return true; })()");
  await a.until("window.__rooms().phase === 'open' && document.querySelector('.war-lobby') && !document.querySelector('.war-lobby').hidden", 60000).catch(() => {});
  await a.sleep(1000);
  const lc = await a.evaluate(LOBBY);
  check('campaign Play lands on a lobby too, the cursor on Ready', lc.shown && lc.title === 'LOBBY' && lc.here === 'friends-lobby-ready' && lc.flying !== 'flight',
    JSON.stringify({ shown: lc.shown, here: lc.here, flying: lc.flying }));

  const errs = [a, b].flatMap((p) => p.errors).filter((e) => !e.startsWith('network:'));
  check('no page error on either page', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await a.close();
  await b.close();
  await server.stop();
  await rm(dir, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
