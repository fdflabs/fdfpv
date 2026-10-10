/*
 * jam-two-page.js: Trick Battle in two headless pages of the real shell,
 * one room on the Swiss valley, against a rooms server of its own in this
 * process (docs/JAM-PLAN.md, checks):
 *
 *   SIM_GPU=1 node scripts/jam-two-page.js [outdir]     (npm run jam:twopage)
 *
 * A makes the room, B joins, both fly, A starts a match of 45 second runs.
 * Both pages are put on their slots. On each turn the runner is held to
 * its go, then thrown up and rolled on its sticks (window.__stick) so the
 * game's own trick detector lands tricks, which its own scorer counts; the
 * other page is held on its slot with the camera on the runner and sees
 * the runner's score live on its scoreboard. The room closes the run on
 * its clock with the runner's last numbers; the next runner's turn counts
 * down on both. The match ends by itself, with the same results on both
 * pages. Pictures of what each saw, in outdir, not in the repository.
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
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { SLACK_MS, TURN_MS } from '../src/share/roomjam.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = process.argv[2] || join(root, 'build', 'jam-two-page');
const SECONDS = 45;

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

/* A five inch in acro, so its sticks roll it over. */
function seed() {
  const s = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'interceptor');
  s.map = 'swiss2';
  s.freestyleMap = 'swiss2';
  s.graphics = 'low';
  s.flightMode = 'acro';
  s.fpsCap = 0;
  s.airframeAsked = true;
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

const dir = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'jam-two-page-'));
const { startRooms } = await import('../edge/rooms/node.js');
const server = await startRooms({ db: join(dir, 'rooms.db'), port: 0 });
const rooms = `http://127.0.0.1:${server.port}`;
const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;
console.log(`Trick Battle in two pages, rooms at ${rooms}`);
const jamOf = (p) => p.evaluate('window.__roomJam()');
const a = await openPage({ root, url, width: 1280, height: 720, seed: seed() });
const b = await openPage({ root, url, width: 1280, height: 720, seed: seed() });
const pages = [a, b];
const names = ['A', 'B'];
try {
  for (const p of pages) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__map && window.__map().ready', 400000);
  }
  const code = await a.evaluate('window.__roomCreate()');
  check('page A makes a room', /^[A-Z0-9]{6}$/.test(code), code);
  await a.until("window.__rooms().phase === 'open'", 30000);
  await b.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  for (const p of pages) {
    await p.until("window.__rooms().phase === 'open' && window.__rooms().peers.length === 1 && window.__rooms().roomNow != null", 30000);
  }
  const seats = [await a.evaluate('window.__rooms().seat'), await b.evaluate('window.__rooms().seat')];
  const pageOf = (seat) => pages[seats.indexOf(seat)];
  const nameOf = (seat) => names[seats.indexOf(seat)];
  for (const p of pages) {
    await p.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  }
  for (const p of pages) {
    await p.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  }

  await a.evaluate(`window.__roomJamStart(${SECONDS}); true`);
  for (const p of pages) {
    await p.until("window.__roomJam().view.state === 'turn'", 20000);
  }
  const t0 = await Promise.all(pages.map(jamOf));
  const first = t0[0].view.runner;
  check('the host starts a match: both pages count down the same first run, the lower seat first', t0.every((t) => t.view.goAt === t0[0].view.goAt && t.view.runner === first)
    && first === Math.min(...seats), `runner ${nameOf(first)}`);
  check('the runner is held to its go, the other pilot all the turn', t0.every((t) => t.hold > 0) && t0[seats.indexOf(first)].mine, t0.map((t) => Math.round(t.hold)).join(' '));

  const runs = [];
  for (let turn = 0; turn < 6; turn += 1) {
    const v = (await jamOf(a)).view;
    if (v.state === 'results') {
      break;
    }
    const runner = pageOf(v.runner);
    const watcher = pages.find((p) => p !== runner);
    await runner.until("window.__roomJam().view.state === 'run' && window.__roomJam().hold === 0", (TURN_MS + 10000) * 2);
    const flips = turn < 2;
    if (flips) {
      /* Up 60 m, then the sticks: a roll each way and a flip, with a pause
       * between so each lands on its own. */
      const st = await runner.evaluate('window.__craftState()');
      await runner.evaluate(`window.__crashThrow({ x: ${st.worldX}, y: ${st.worldY + 60}, z: ${st.worldZ}, yaw: 0, pitch: 0, roll: 0, vx: 0, vy: 0, vz: 0 }); true`);
      for (const [r, pi] of [[1, 0], [-1, 0], [0, 1]]) {
        await runner.evaluate(`window.__stick(${r}, ${pi}, 0, 0.55); true`);
        await runner.sleep(700);
        await runner.evaluate('window.__stick(0, 0, 0, 0.6); true');
        await runner.sleep(1500);
      }
      await runner.evaluate('window.__stick(null); true');
      await runner.until('window.__roomJam().own && window.__roomJam().own.tricks > 0', 15000).catch(() => {});
      await runner.sleep(3500);
      const mine = await jamOf(runner);
      await watcher.sleep(1200);
      const seen = await jamOf(watcher);
      check(`turn ${turn + 1}: ${nameOf(v.runner)}'s own detector and scorer landed tricks`, mine.own && mine.own.tricks > 0, JSON.stringify(mine.own));
      check(`and ${names[pages.indexOf(watcher)]} watches: held, the camera on the runner, the runner's score live on its board`, seen.watching && seen.watched === v.runner
        && seen.hold > 0 && seen.view.live.total === Math.round(mine.own.total) && seen.view.live.tricks > 0 && seen.hud && seen.hud.rows[0].value !== '0',
      JSON.stringify({ watching: seen.watching, watched: seen.watched, live: seen.view.live, own: mine.own, hud: seen.hud && seen.hud.rows[0] }));
      check(`and ${names[pages.indexOf(watcher)]} had the runner's tricks called out, the last one by name`, seen.watchCallouts.n > 0
        && seen.watchCallouts.name === seen.view.live.last.name, JSON.stringify({ callouts: seen.watchCallouts, last: seen.view.live.last }));
      await shot(runner, `turn${turn + 1}-runner`);
      await shot(watcher, `turn${turn + 1}-watcher`);
    }
    const closed = v.runs.length;
    await a.until(`window.__roomJam().view.runs.length > ${closed}`, (SECONDS * 1000) + SLACK_MS + 20000);
    const after = (await jamOf(a)).view;
    runs.push(after.runs.at(-1));
    check(`turn ${turn + 1}: the room closed ${nameOf(v.runner)}'s run on its clock`, after.runs.at(-1).seat === v.runner && ['time', 'done'].includes(after.runs.at(-1).why)
      && (!flips || after.runs.at(-1).total > 0), JSON.stringify(after.runs.at(-1)));
  }
  for (const p of pages) {
    await p.until('window.__roomJam().results === true', 60000);
  }
  const end = await Promise.all(pages.map(jamOf));
  const ev = end[0].view;
  check('the match ends by itself, results on both pages, the same', ev.state === 'results' && ev.winners.length > 0
    && end.every((t) => JSON.stringify(t.view.runs) === JSON.stringify(ev.runs) && JSON.stringify(t.view.winners) === JSON.stringify(ev.winners)),
  `${ev.runs.map((r) => `${nameOf(r.seat)} r${r.round} ${r.total}`).join(', ')}; winners ${ev.winners.map(nameOf).join(',')}`);
  await shot(a, 'a-results');
  await shot(b, 'b-results');
  const errs = pages.flatMap((p) => p.errors).filter((e) => !e.startsWith('network:'));
  check('no page error on either page', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) {
  for (const [i, p] of pages.entries()) {
    const st = await p.evaluate('JSON.stringify({ jam: window.__roomJam(), mode: window.__craftState && window.__craftState().mode, screen: window.__ui.screen })').catch((x) => String(x));
    console.log(`  page ${names[i]}: ${st}`);
  }
  failed += 1;
  console.log(`  FAIL  ${e.message}`);
} finally {
  for (const p of pages) {
    await p.close();
  }
  await server.stop();
  await rm(dir, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
