/*
 * medals-check.js: medals on a built course, from the builder's test lap
 * to a pilot's medal, through the real page (docs/FLIGHTCLUB-PROGRESSION.md
 * section 2).
 *
 *   node scripts/medals-check.js [OUT_DIR] [/path/to/fdfpv-leaderboard]
 *
 * Starts a throwaway board from a checkout of fdfpv-leaderboard (its file
 * store, in a scratch directory), then, as a pilot would:
 *
 *   1. Builds a ring of three gates in the air on swiss2 with the
 *      builder's own controls, and test flies it (B): one lap, with a
 *      pause in it, so the builder's gold is a slow one.
 *   2. Publishes it (P, the shell's dialog): the board's document carries
 *      medals.goldMs, the builder's lap rounded.
 *   3. Seats it from the board as any pilot would, and flies a lap
 *      without the pause: the lap reaches the medal medalFor says, the
 *      progress keeps it, a medal toast is raised, and XP is paid for each
 *      step.
 *   4. A second, slower-than-bronze lap pays nothing more.
 *   5. My tracks' card for the course says the pilot's medal.
 *
 * The craft is moved through each gate on its own line (window.__placeCraft),
 * as build-check.js does: what is tested is the race, the publish and the
 * award, not anybody's flying.
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

import http from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import {
  B, frames, hold, key, leave, lookAlong, placeHere, takeMouse,
} from '../tests/lib/buildkeys.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { medalFor } from '../src/game/medals.js';
import { MEDAL_XP } from '../src/game/progress.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = resolve(process.argv[2] || join(root, 'tmp', 'medals-check'));
const boardDir = resolve(process.argv[3] || join(root, '..', 'fdfpv-leaderboard'));
await mkdir(outDir, { recursive: true });
const MAP = 'swiss2';
const PILOT = `Medal ${Date.now().toString(36)}`;

let failed = 0;
function say(ok, what) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) {
    failed += 1;
  }
}

if (!existsSync(join(boardDir, 'src', 'server.js'))) {
  console.error(`medals-check: no board checkout at ${boardDir}`);
  process.exit(2);
}
const scratch = mkdtempSync(join(tmpdir(), 'fdfpv-medals-'));
const boardPort = await new Promise((r) => {
  const probe = http.createServer().listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => r(port));
  });
});
const board = spawn(process.execPath, [join(boardDir, 'src', 'server.js')], {
  cwd: boardDir,
  env: { ...process.env, PORT: String(boardPort), BOARD_HOST: '127.0.0.1', BOARD_FILE: join(scratch, 'board.json'), DATABASE_URL: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const BOARD = `http://127.0.0.1:${boardPort}`;
for (let i = 0; i < 100; i += 1) {
  /* eslint-disable-next-line no-await-in-loop */
  if (await fetch(`${BOARD}/api/health`).then((r) => r.ok).catch(() => false)) {
    break;
  }
  /* eslint-disable-next-line no-await-in-loop */
  await new Promise((r) => setTimeout(r, 100));
}

async function boardJson(path) {
  const res = await fetch(`${BOARD}${path}`);
  if (!res.ok) {
    throw new Error(`${path}: ${res.status}`);
  }
  return res.json();
}

function seed() {
  const seated = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'interceptor');
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(seated)});
    s.airframeAsked = true;
    s.graphics = 'low';
    s.flightMode = 'angle';
    localStorage.setItem(k, JSON.stringify(s));
  } catch (e) { /* storage refused; the checks below will say so */ }
  navigator.getGamepads = () => [];`];
}

async function shot(page, name) {
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 }, page.sessionId);
  const path = join(outDir, `${name}.jpg`);
  await writeFile(path, Buffer.from(data, 'base64'));
  console.log(`  shot ${path}`);
}

/* Through each gate on its own line, round to the start: one lap. A pause
 * before the last gate makes a slow lap. */
async function chordLap(page, G, pauseMs = 0) {
  const lapsBefore = await page.evaluate('window.__race().laps.length');
  const chord = async (g, back, ahead) => {
    const a = g.centre.map((v, i) => v - g.travel[i] * back);
    const b = g.centre.map((v, i) => v + g.travel[i] * ahead);
    await page.evaluate(`window.__placeCraft(${b.join(',')}, ${a.join(',')})`);
    await frames(page, 3);
  };
  await chord(G[0], 1.2, 1.2);
  await page.until('window.__race().next === 1', 10000).catch(() => {});
  await chord(G[1], 1.5, 1.5);
  await page.until('window.__race().next === 2', 10000).catch(() => {});
  await chord(G[2], 1.5, 1.5);
  await page.until('window.__race().next === 0', 10000).catch(() => {});
  if (pauseMs) {
    await page.sleep(pauseMs);
  }
  await chord(G[0], 1.2, 1.2);
  await page.until(`window.__race().laps.length > ${lapsBefore}`, 10000).catch(() => {});
  return page.evaluate(`window.__race().laps.length > ${lapsBefore} ? window.__race().lastLapMs : null`);
}

const progress = (page) => page.evaluate('({ xp: window.__ui.settings.progress.xp, medals: window.__ui.settings.progress.medals })');

async function main() {
  const url = (q) => `/index.html?${q}&board=${encodeURIComponent(BOARD)}`;
  const page = await openPage({ root, width: 1280, height: 720, url: url(`map=${MAP}`), seed: seed() });
  try {
    console.log(`1. build a ring on ${MAP} and test fly it`);
    await page.until('!!window.__shellReady', 240000);
    await page.until(`window.__map && window.__map().ready && window.__map().id === ${JSON.stringify(MAP)}`, 300000);
    await page.until('!!window.__build', 60000);
    await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
    await page.until("window.__craftState().mode === 'flight'", 120000);
    await page.sleep(600);
    await key(page, 'KeyB');
    await page.until(`${B('.state')} === 'building'`, 20000);
    await takeMouse(page);
    const here = await page.evaluate('window.__craftState()');
    const R = 30;
    const cx = here.worldX;
    const cz = here.worldZ - 60;
    const cy = (await page.evaluate(`window.__heightAt(${cx}, ${cz})`)) + 60;
    await hold(page, 'gate');
    for (let i = 0; i < 3; i += 1) {
      const a = (i / 3) * Math.PI * 2;
      const P = [cx + R * Math.cos(a), cy, cz + R * Math.sin(a)];
      const T = [-Math.sin(a), 0, Math.cos(a)];
      /* eslint-disable-next-line no-await-in-loop */
      await lookAlong(page, P.map((v, j) => v - T[j] * 20), Math.atan2(-T[0], -T[2]), 0);
      /* eslint-disable-next-line no-await-in-loop */
      await placeHere(page, { air: true });
    }
    const G = await page.evaluate(B('.gates'));
    say(G.length === 3, `three gates hung (${G.length})`);
    await key(page, 'KeyB');
    await page.until(`${B('.state')} === 'testing' && window.__craftState().mode === 'flight'`, 30000);
    const goldLap = await chordLap(page, G, 4000);
    say(Number.isFinite(goldLap) && goldLap > 4000, `the builder's test lap closes: ${goldLap} ms`);
    if ((await page.evaluate('window.__mode')) === 'results') {
      await page.evaluate("window.__ui.onAction('restart'); true");
      await page.until("window.__craftState().mode === 'flight'", 20000);
    }
    const p0 = await progress(page);
    say(Object.keys(p0.medals || {}).length === 0, 'the builder\'s own test lap wins no medal');
    await key(page, 'KeyB');
    await page.until(`${B('.state')} === 'building'`, 10000);

    console.log('2. publish it');
    await key(page, 'KeyP');
    await page.until("(() => { const d = document.querySelector('.name-dialog-box'); return d && d.offsetParent !== null; })()", 10000);
    await page.evaluate(`(() => {
      const f = [...document.querySelectorAll('.name-dialog-input')];
      f[0].value = 'Medal ring';
      f[1].value = ${JSON.stringify(PILOT)};
      f[1].focus();
      return true;
    })()`);
    await page.tap('Enter');
    await page.until(`/Published|Could not publish/.test(${B('.message')})`, 60000).catch(() => {});
    const hud = await page.evaluate(B('.message'));
    say(/Published "/.test(hud), `published: ${JSON.stringify(hud)}`);
    const id = await page.evaluate(B('.doc.id'));
    const served = await boardJson(`/api/tracks/${id}/document`);
    const doc = served.document || served;
    const gold = doc.medals && doc.medals.goldMs;
    say(gold === Math.round(goldLap), `the board's document carries the builder's lap as gold: ${JSON.stringify(doc.medals)}`);
    say(((await page.evaluate(B('.doc.medals'))) || {}).goldMs === gold, 'and the builder carries on with it');
    await leave(page);
    await page.until(`${B('.state')} === 'off'`, 10000);

    console.log('3. seat it from the board and fly it');
    await page.evaluate("localStorage.removeItem('webfpv.share.import.v1'), true");
    await page.cdp.send('Page.reload', {}, page.sessionId);
    await page.sleep(1000);
    await page.until('!!window.__shellReady', 240000);
    await page.until('window.__map && window.__map().ready', 300000);
    await page.evaluate("window.__ui.act('courses'); true");
    await page.until(`(window.__ui.boardCourses || []).some((t) => t.id === ${JSON.stringify(id)})`, 60000).catch(() => {});
    await page.evaluate(`window.__ui.openBoardCourse(${JSON.stringify(id)}, () => window.__ui.play()); true`);
    await page.until(`window.__map().ready && window.__map().mode === 'race' && window.__race().gates.length === 3`, 300000).catch(() => {});
    await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
    await page.until("window.__craftState().mode === 'flight'", 60000);
    await page.sleep(1600);
    const xp0 = (await progress(page)).xp;
    await page.evaluate(`(() => {
      window.__toasts = [];
      window.__toastWatch = setInterval(() => {
        for (const t of document.querySelectorAll('.pg-toast')) {
          const s = t.className + ' | ' + t.textContent;
          if (!window.__toasts.includes(s)) { window.__toasts.push(s); }
        }
      }, 30);
      return true;
    })()`);
    const lap = await chordLap(page, await page.evaluate(B('.gates')));
    const want = medalFor(doc.medals, lap);
    say(Number.isFinite(lap) && want !== null, `a pilot's lap closes at ${lap} ms against gold ${gold}: ${want}`);
    await page.sleep(600);
    await shot(page, '3-medal-toast');
    const p1 = await progress(page);
    const key1 = `track:${id}`;
    say(p1.medals[key1] === want, `progress keeps the medal: ${JSON.stringify(p1.medals)}`);
    const steps = ['bronze', 'silver', 'gold'].indexOf(want) + 1;
    const toasts = await page.evaluate('window.__toasts');
    const medalToast = toasts.find((t) => /\bmedal\b/.test(t.split(' | ')[0])) || '';
    say(medalToast.includes('Medal reached'), `a medal toast is raised: ${JSON.stringify(medalToast || toasts)}`);
    const paid = Number((medalToast.match(/\+(\d+) XP/) || [])[1]);
    say(paid === steps * MEDAL_XP && p1.xp - xp0 >= paid, `it pays ${MEDAL_XP} XP for each of its ${steps} steps: +${paid} XP (all XP this lap ${p1.xp - xp0})`);

    console.log('4. a slow lap pays nothing more');
    if ((await page.evaluate('window.__mode')) === 'results') {
      await page.evaluate("window.__ui.onAction('restart'); true");
      await page.until("window.__craftState().mode === 'flight'", 20000);
      await page.sleep(1600);
    }
    const slow = await chordLap(page, await page.evaluate(B('.gates')), Math.ceil(gold * 1.4));
    const p2 = await progress(page);
    say(Number.isFinite(slow) && medalFor(doc.medals, slow) === null && p2.medals[key1] === want, `a lap of ${slow} ms reaches none, and the ${want} stays`);
    await page.evaluate('clearInterval(window.__toastWatch), true');

    console.log('5. My tracks says it');
    await page.evaluate("window.__ui.show('title'); window.__ui.act('courses'); true");
    await page.until(`[...document.querySelectorAll('.course-card')].some((c) => c.textContent.includes('Your medal'))`, 20000).catch(() => {});
    const cardText = await page.evaluate(`[...document.querySelectorAll('.course-card')].map((c) => c.textContent).find((t) => t.includes('Medal ring')) || ''`);
    const word = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' }[want];
    say(cardText.includes(`Your medal: ${word}`), `the course card says it: ${JSON.stringify(cardText.slice(0, 160))}`);
    await shot(page, '5-my-tracks');
    const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED|Failed to load resource/.test(e));
    say(errs.length === 0, `no page errors${errs.length ? `: ${errs.slice(0, 3).join(' | ')}` : ''}`);
  } finally {
    await page.close();
  }
}

try {
  await main();
} finally {
  board.kill();
  rmSync(scratch, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
