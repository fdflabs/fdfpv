/*
 * bots-two-page.js: npm run bots:twopage, the room's AI pilots
 * (docs/AI-PILOTS-CONTRACT.md) in two headless pages of the real shell,
 * against edge/rooms/node.js started here:
 *
 *   SIM_GPU=1 node scripts/bots-two-page.js [outdir]
 *
 * A makes a public room made for Catch the Ace on the Swiss valley, alone: three AI
 * pilots join it, every one named as one, drawn in the air, inside the
 * valley. A flies and starts a match: the crown moves on A's screen to and
 * between AI pilots, and A's scoreboard names them as AI. B joins: an AI
 * pilot leaves for it, and B sees the rest named as AI too. B leaves: an
 * AI pilot comes back. Before the match: the room's ground is the page's
 * over the corridor, and an AI pilot the room crashes is seen crashed,
 * lying on the ground, then flying again. A makes a private room: no AI
 * pilots until A, its host, clicks Normal on the AI pilots row; B joins it
 * and reads the host's choice; A clicks Off and they leave. Pictures in
 * outdir, which is not in the repository.
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
import { mkdir, writeFile } from 'node:fs/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { FILL_TO } from '../edge/rooms/roombots.js';
import { CORRIDOR, DOWN_MS, valleyAxis } from '../edge/rooms/bots.js';
import { groundOf } from '../edge/rooms/grounds.js';
import { FLAG_AIRBORNE, FLAG_CRASHED, FLAG_SPAWNING, decodePose } from '../src/share/roomwire.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = process.argv[2] || join(root, 'build', 'bots-two-page');
const AIRFRAME = 'cub1400';

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

function seedFor(colour) {
  const s = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, AIRFRAME);
  s.map = 'swiss2';
  s.freestyleMap = 'swiss2';
  s.graphics = 'low';
  s.flightMode = 'angle';
  s.fpsCap = 0;
  s.airframeAsked = true;
  s.livery = { [AIRFRAME]: { regions: { wing: colour, fuselage: colour, tail: colour } } };
  s.parts = {};
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

const bots = (r) => r.peers.filter((p) => /^AI /.test(p.name));

/* The room screen's rows as the page has them: the "Pilots here" row's
 * value, and every row naming an AI pilot, with what it offers. */
const ROWS = `(() => {
  const rows = window.__ui.friendsRows();
  const here = rows.find((r) => r.label === ${JSON.stringify('Pilots here')});
  /* AI pilots' names, never the host's AI pilots row (#866). */
  const ai = rows.filter((r) => /^AI .* \\d+$/.test(String(r.label)));
  return { lobby: rows.some((r) => r.action === 'friends-lobby-ready'), here: here ? here.value : null, top: window.__ui.friendsRow().value, ai: ai.map((r) => ({ label: r.label, info: Boolean(r.info), options: (r.options || []).length, pick: Boolean(r.pick) })) };
})()`;
function rowsSay(rows, people, ai) {
  /* A game's lobby has no "Pilots here" row: its panel lists them. */
  return (rows.here === null || new RegExp(`^${people} of \\d+, \\+${ai} AI pilots?$`).test(rows.here))
    && (rows.here !== null || rows.lobby)
    && rows.top.endsWith(`, ${people} here, +${ai} AI pilot${ai === 1 ? '' : 's'}`)
    && rows.ai.length === ai && rows.ai.every((r) => r.info && !r.options && !r.pick);
}

/* The AI pilots row on the page's room screen: its value, whether it is
 * the host's (it has choices) or an info row. */
const AI_ROW = `(() => {
  const r = window.__ui.friendsRows().find((x) => x.label === 'AI pilots');
  return r ? { value: r.value, info: Boolean(r.info), choices: (r.options || []).length } : null;
})()`;

/* Puts the room screen up and clicks the AI pilots row's `choice` with a
 * real pointer. */
async function chooseAi(page, choice) {
  await page.evaluate(`(() => {
    const ui = window.__ui;
    if (ui.screen !== 'friends') { ui.show('friends'); }
    return true;
  })()`);
  await page.sleep(300);
  const marked = await page.evaluate(`(() => {
    const ui = window.__ui;
    const i = ui.items().findIndex((it) => it.label === 'AI pilots');
    const row = i >= 0 ? ui.menuRows[i - ui.rowOffset] : null;
    const b = row ? [...row.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(choice)}) : null;
    document.querySelectorAll('[data-check="ai"]').forEach((x) => delete x.dataset.check);
    if (b) { b.dataset.check = 'ai'; }
    return Boolean(b);
  })()`);
  return marked && page.click('[data-check="ai"]');
}

const { startRooms } = await import('../edge/rooms/node.js');
const scratch = mkdtempSync(join(tmpdir(), 'bots-two-page-'));
const local = await startRooms({ db: join(scratch, 'rooms.db'), port: 0 });
const rooms = `http://127.0.0.1:${local.port}`;
const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;
console.log(`AI pilots in a room made for Catch the Ace, rooms at ${rooms}`);
const a = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('#d8432f') });
let b = null;
try {
  await a.until('window.__shellReady === true', 300000);
  await a.until('window.__map && window.__map().ready', 400000);
  const code = await a.evaluate("window.__roomCreate({ map: 'swiss2', mode: 'tag', public: true })");
  check('A makes a room made for Catch the Ace', /^[A-Z0-9]{6}$/.test(code), code);
  await a.until(`window.__rooms().phase === 'open' && window.__rooms().peers.length === ${FILL_TO - 1}`, 30000);
  let ra = await a.evaluate('window.__rooms()');
  check(`alone, A is joined by ${FILL_TO - 1} AI pilots, every one named as one`, bots(ra).length === FILL_TO - 1 && ra.peers.length === FILL_TO - 1,
    ra.peers.map((p) => p.name).join(', '));
  check('A hosts its room', ra.host === ra.seat, `host ${ra.host}, seat ${ra.seat}`);
  let screen = await a.evaluate(ROWS);
  check(`A's room screen counts 1 person here, +${FILL_TO - 1} AI pilots apart, and the AI rows offer no mute, report, kick or host`,
    rowsSay(screen, 1, FILL_TO - 1), JSON.stringify(screen));

  await a.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await a.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  await a.until(`window.__rooms().peers.filter((p) => p.drawn).length === ${FILL_TO - 1}`, 30000);
  ra = await a.evaluate('window.__rooms()');
  check('every AI pilot is drawn, its tag naming it as AI', ra.peers.every((p) => p.drawn && /^AI /.test(p.label || '')), ra.peers.map((p) => p.label).join(', '));
  const inside = ra.peers.every((p) => p.at && Math.abs(p.at[0] - valleyAxis(p.at[2])) <= CORRIDOR.half + 5 && p.at[1] >= CORRIDOR.yMin - 5 && p.at[1] <= CORRIDOR.yMax + 5);
  check('drawn in the air over the valley floor, where the room flies them', inside, ra.peers.map((p) => p.at.map((x) => x.toFixed(0)).join('/')).join('  '));
  /* The nearest AI pilot from 12 m, the camera following it a few frames
   * so it is framed where it is drawn now. */
  await a.evaluate("document.querySelector('.osd-air-hint-btn')?.click(); true");
  for (let k = 0; k < 6; k += 1) {
    await a.evaluate(`(() => {
      const ps = window.__rooms().peers.filter((p) => p.at);
      const me = window.__craftState();
      ps.sort((x, y) => Math.hypot(x.at[0] - me.worldX, x.at[2] - me.worldZ) - Math.hypot(y.at[0] - me.worldX, y.at[2] - me.worldZ));
      const p = ps[0].at;
      window.__setCam(p[0] + 7, p[1] + 2.5, p[2] + 9, p[0], p[1], p[2], 45);
      return true;
    })()`);
    await a.sleep(120);
  }
  await shot(a, 'a-an-ai-pilot-close');

  /* THE GROUND. The room's (edge/rooms/grounds.js) against what this
   * page's pilot hits (view.height), over the corridor. */
  const samples = [];
  for (let z = CORRIDOR.zMin; z <= CORRIDOR.zMax; z += 97) {
    for (let dx = -CORRIDOR.half; dx <= CORRIDOR.half; dx += 31) {
      samples.push([valleyAxis(z) + dx, z]);
    }
  }
  const pageGround = await a.evaluate(`${JSON.stringify(samples)}.map(([x, z]) => window.__heightAt(x, z))`);
  const roomGround = groundOf('swiss2');
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'ground-diff.json'), JSON.stringify(samples.map(([x, z], i) => [Math.round(x), Math.round(z), pageGround[i], roomGround(x, z)])
    .filter(([, , pg, rg]) => Math.abs(pg - rg) >= 1e-3)));
  /* Where they differ the page stands higher: a roof, a deck or a road
   * on the ground (alps/roofs.js), which the room does not have. */
  const higher = samples.map(([x, z], i) => pageGround[i] - roomGround(x, z)).filter((d) => Math.abs(d) >= 1e-3);
  check(`the room's ground is the page's at ${samples.length} points over the corridor, but what is built on it`,
    higher.length <= samples.length / 50 && higher.every((d) => d > 0), `${higher.length} differ, all higher on the page: ${higher.map((d) => d.toFixed(2)).join(', ')} m`);

  /* A CRASH. The room crashes an AI pilot as the referee would (the hit
   * itself is rooms:selftest's): A sees it fall, lie on the ground, and
   * come back in the air, untouchable at first. */
  const core = [...local.env.ROOMS.objects.values()].map((r) => r.host.core).find((c) => c && c.meta.code === code);
  const victim = [...core.seats.values()].find((s) => s.bot).seat;
  core.bots.bots.list.get(victim).spawnAt = null;
  const crashedOk = core.bots.bots.crash(victim, Math.floor(core.roomMs(Date.now())));
  const peerOf = `window.__rooms().peers.find((p) => p.seat === ${victim})`;
  await a.until(`(${peerOf}).flags !== null && ((${peerOf}).flags & ${FLAG_CRASHED}) !== 0`, 10000).catch(() => {});
  const falling = await a.evaluate(peerOf);
  /* What the room has and what A draws, every quarter second until A
   * draws it on the ground, for the record (crash-trace.json in outdir). */
  const traced = [];
  for (let k = 0; k < 60; k += 1) {
    const roomB = core.bots.bots.list.get(victim);
    const drawnB = await a.evaluate(peerOf);
    traced.push({ room: roomB.p.map((x) => +x.toFixed(2)), roomGround: +roomGround(roomB.p[0], roomB.p[2]).toFixed(2), rest: roomB.down ? roomB.down.restAt : null, flags: drawnB.flags, drawn: drawnB.at && drawnB.at.map((x) => +x.toFixed(2)) });
    if (roomB.down && roomB.down.restAt != null && drawnB.at && Math.abs(drawnB.at[1] - roomB.p[1]) < 0.05) {
      break;
    }
    await a.sleep(250);
  }
  await writeFile(join(outDir, 'crash-trace.json'), JSON.stringify(traced, null, 1));
  const lying = await a.evaluate(peerOf);
  const under = lying.at ? await a.evaluate(`window.__heightAt(${lying.at[0]}, ${lying.at[2]})`) : NaN;
  check('an AI pilot crashes: A sees it crashed, fallen, lying on the ground where it came down', crashedOk && (falling.flags & FLAG_CRASHED) !== 0
    && (lying.flags & FLAG_CRASHED) !== 0 && lying.at && Math.abs(lying.at[1] - under) < 1,
    `flags ${falling.flags}, lying at ${lying.at && lying.at[1].toFixed(2)} m over ground ${Number(under).toFixed(2)} m`);
  await a.evaluate(`(() => {
    const p = ${peerOf}.at;
    window.__setCam(p[0] + 8, p[1] + 3, p[2] + 8, p[0], p[1], p[2], 45);
    return true;
  })()`);
  await a.sleep(200);
  await shot(a, 'a-ai-pilot-crashed');
  await a.until(`((${peerOf}).flags & ${FLAG_AIRBORNE}) !== 0`, DOWN_MS + 5000).catch(() => {});
  /* Its drawing catches up with the new flight. */
  await a.sleep(1000);
  const back = await a.evaluate(peerOf);
  check('DOWN_MS after it came to rest it flies again, untouchable at first, inside the corridor', (back.flags & FLAG_AIRBORNE) !== 0 && (back.flags & FLAG_SPAWNING) !== 0
    && back.drawn && back.at[1] >= CORRIDOR.yMin - 5, `flags ${back.flags}, ${back.at && back.at[1].toFixed(1)} m`);

  /* A has sat on the strip since its flight began, far longer than five
   * seconds: no longer untouchable (lead, 2026-10-09), so if the draw makes
   * it the Ace the AI pilots can catch it. */
  const aSeat = (await a.evaluate('window.__rooms()')).seat;
  const aPose = decodePose([...core.seats.values()].find((t) => t.seat === aSeat).pose);
  check('A, parked on the strip past its five seconds, is touchable in the room', (aPose.flags & FLAG_SPAWNING) === 0 && (aPose.flags & FLAG_AIRBORNE) === 0,
    `flags ${aPose.flags}`);
  await a.evaluate("window.__roomTagDo('tag-start', 120)");
  await a.until("window.__roomTag().view && window.__roomTag().view.state === 'live'", 30000);
  const seats = new Set(bots(await a.evaluate('window.__rooms()')).map((p) => p.seat));
  await a.until(`(() => { const v = window.__roomTag().view; return v.crowns && v.crowns.filter((c) => ${JSON.stringify([...seats])}.includes(c.seat)).length >= 2; })()`, 120000).catch(() => {});
  const tag = await a.evaluate('window.__roomTag()');
  const toBots = (tag.view.crowns || []).filter((c) => seats.has(c.seat));
  check('the crown moves to and between AI pilots on A\'s screen', toBots.length >= 2, (tag.view.crowns || []).map((c) => `${c.seat}:${c.why}`).join(' '));
  const rows = tag.hud ? JSON.stringify(tag.hud) : '';
  check("A's scoreboard names the AI pilots as AI", (rows.match(/AI /g) || []).length >= FILL_TO - 1, rows.slice(0, 240));
  await a.evaluate("document.querySelector('.osd-air-hint-btn')?.click(); true");
  await shot(a, 'a-match-with-ai-pilots');

  b = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('#2f6fd6') });
  await b.until('window.__shellReady === true', 300000);
  await b.until('window.__map && window.__map().ready', 400000);
  await b.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  await b.until(`window.__rooms().phase === 'open' && window.__rooms().peers.length === ${FILL_TO - 1}`, 30000);
  await a.until(`window.__rooms().peers.length === ${FILL_TO - 1} && window.__rooms().peers.filter((p) => /^AI /.test(p.name)).length === ${FILL_TO - 2}`, 30000).catch(() => {});
  ra = await a.evaluate('window.__rooms()');
  const rb = await b.evaluate('window.__rooms()');
  check('B joins: an AI pilot leaves for it, on A\'s screen', bots(ra).length === FILL_TO - 2 && ra.peers.length === FILL_TO - 1, ra.peers.map((p) => p.name).join(', '));
  check('and B sees the rest named as AI, and A as a person', bots(rb).length === FILL_TO - 2 && rb.peers.filter((p) => !/^AI /.test(p.name)).length === 1,
    rb.peers.map((p) => p.name).join(', '));
  screen = await a.evaluate(ROWS);
  const rowsB = await b.evaluate(ROWS);
  await b.evaluate(`(() => {
    window.__ui.show('friends');
    const row = [...document.querySelectorAll('.menu-row, [class*=row]')].find((e) => e.textContent.includes('Pilots here'));
    row?.scrollIntoView({ block: 'start' });
    return true;
  })()`);
  await b.sleep(400);
  await shot(b, 'b-room-screen-people-and-ai');
  check(`A and B count 2 people here, +${FILL_TO - 2} AI pilots, no options on the AI rows`, rowsSay(screen, 2, FILL_TO - 2) && rowsSay(rowsB, 2, FILL_TO - 2),
    `${JSON.stringify(screen)} ${JSON.stringify(rowsB)}`);
  const human = await a.evaluate(`window.__ui.friendsRows().some((r) => !/^AI /.test(String(r.label)) && (r.options || []).some((o) => o.value === 'mute'))`);
  check("B's row on A's screen still offers mute and report", human);
  await b.close();
  b = null;
  await a.until(`window.__rooms().peers.length === ${FILL_TO - 1} && window.__rooms().peers.filter((p) => /^AI /.test(p.name)).length === ${FILL_TO - 1}`, 30000).catch(() => {});
  ra = await a.evaluate('window.__rooms()');
  check('B leaves: an AI pilot comes back', bots(ra).length === FILL_TO - 1, ra.peers.map((p) => p.name).join(', '));

  /* A PRIVATE ROOM: no AI pilots until its host switches them on, from
   * the room screen's AI pilots row, with a real pointer. */
  const priv = await a.evaluate("window.__roomCreate({ map: 'swiss2', mode: 'tag', public: false })");
  await a.until(`window.__rooms().phase === 'open' && window.__rooms().code === ${JSON.stringify(priv)}`, 30000);
  await a.sleep(1500);
  let ai = await a.evaluate(AI_ROW);
  check('A makes a private Catch the Ace room: no AI pilots, its row says Off, with the host\'s choices',
    (await a.evaluate('window.__rooms().peers.length')) === 0 && ai && ai.value === 'Off' && ai.choices === 4, JSON.stringify(ai));
  const clicked = await chooseAi(a, 'Normal');
  await a.until(`window.__rooms().peers.filter((p) => /^AI /.test(p.name)).length === ${FILL_TO - 1}`, 30000).catch(() => {});
  ai = await a.evaluate(AI_ROW);
  check(`A clicks Normal: ${FILL_TO - 1} AI pilots join the private room`, clicked
    && bots(await a.evaluate('window.__rooms()')).length === FILL_TO - 1 && ai.value === 'Normal', JSON.stringify(ai));
  await shot(a, 'a-private-room-ai-on');
  const flagsShown = await a.evaluate("[...document.querySelectorAll('.war-lobby-flag')].map((e) => e.textContent)");
  check(`the lobby's pilot list marks the ${FILL_TO - 1} AI pilots as AI, never NOT READY`,
    flagsShown.filter((f) => f === 'AI PILOT').length === FILL_TO - 1 && flagsShown.filter((f) => f === 'NOT READY').length === 1, flagsShown.join(', '));
  b = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('#2f6fd6') });
  await b.until('window.__shellReady === true', 300000);
  await b.evaluate(`window.__roomJoin(${JSON.stringify(priv)}); true`);
  await b.until(`window.__rooms().phase === 'open' && window.__rooms().peers.length === ${FILL_TO - 1}`, 30000).catch(() => {});
  const bAi = await b.evaluate(AI_ROW);
  check('B joins by code: an AI pilot leaves for it, and B reads the host\'s choice, no choices of its own',
    bots(await b.evaluate('window.__rooms()')).length === FILL_TO - 2 && bAi && bAi.value === 'Normal' && bAi.info && bAi.choices === 0, JSON.stringify(bAi));
  const off = await chooseAi(a, 'Off');
  await b.until("window.__rooms().peers.length === 1", 30000).catch(() => {});
  const bOff = await b.evaluate(AI_ROW);
  check('A clicks Off: every AI pilot leaves, on B\'s screen too, and B\'s row says Off',
    off && (await b.evaluate('window.__rooms().peers.length')) === 1 && bOff && bOff.value === 'Off', JSON.stringify(bOff));
  await b.close();
  b = null;

  const errs = a.errors.filter((e) => !e.startsWith('network:'));
  check('no page error', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await a.close();
  if (b) {
    await b.close();
  }
  await local.stop();
  rmSync(scratch, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
