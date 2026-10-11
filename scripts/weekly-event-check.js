/*
 * weekly-event-check.js: Flight Club's weekly event card, in the real page
 * against a real board (docs/FLIGHTCLUB-PROGRESSION.md section 4).
 *
 *   node scripts/weekly-event-check.js [OUT_DIR] [/path/to/fdfpv-leaderboard]
 *
 * The board is a checkout with the events routes (fdfpv-leaderboard #37),
 * started on a file store seeded with one course carrying medals and two
 * laps in this week. With a real pointer: the Flight Club hub card opens
 * the hub, the week's card is first, says the track, its end, the gold,
 * the pilot's own place and what each tier pays, and clicking it seats
 * that track as a race.
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
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';
import { mapTrackDocument } from '../tests/lib/maptrack.js';

/* src/share/pilot.js keeps the name typed for the board here. */
const PILOT_KEY = 'webfpv.pilot.name';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = resolve(process.argv[2] || join(root, 'tmp', 'weekly-event-check'));
const boardDir = resolve(process.argv[3] || join(root, '..', 'fdfpv-leaderboard'));
await mkdir(outDir, { recursive: true });
let failed = 0;
function say(ok, what) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) {
    failed += 1;
  }
}
if (!existsSync(join(boardDir, 'src', 'events.js'))) {
  console.error(`weekly-event-check: no board with events at ${boardDir}`);
  process.exit(2);
}

/* The week, as the board counts it: Monday 00:00 UTC. */
const DAY = 86_400_000;
const index = Math.floor((Date.now() - 4 * DAY) / (7 * DAY));
const start = 4 * DAY + index * 7 * DAY;
const inWeek = new Date(start + 60_000).toISOString();
const ID = 'trk-0eeeeee1';
const scratch = mkdtempSync(join(tmpdir(), 'fdfpv-weekly-'));
const document = { ...mapTrackDocument({ map: 'swiss2', id: ID, name: 'Weekly ring', gates: 3 }), medals: { goldMs: 40000 } };
writeFileSync(join(scratch, 'board.json'), JSON.stringify({
  tracks: { [ID]: { id: ID, name: 'Weekly ring', author: 'Ada', document, plan: {}, gates: 3, elements: 3, hasLogo: false, publishedUtc: inWeek, updatedUtc: inWeek, tags: [] } },
  times: { [ID]: [
    { id: 'tm-00000001', name: 'Ada', key: null, lapMs: 39000, postedUtc: inWeek, craft: null },
    { id: 'tm-00000002', name: 'Weekly Pilot', key: null, lapMs: 45000, postedUtc: inWeek, craft: null },
  ] },
}));
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

const seed = [`try {
  localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, JSON.stringify({ graphics: 'low', airframeAsked: true, map: 'swiss2', freestyleMap: 'swiss2' }));
  localStorage.setItem(${JSON.stringify(PILOT_KEY)}, 'Weekly Pilot');
} catch (e) { /* storage refused */ }
navigator.getGamepads = () => [];`];

async function main() {
  const page = await openPage({ root, width: 1280, height: 800, url: `/index.html?board=${encodeURIComponent(BOARD)}`, seed });
  try {
    await page.until('!!window.__shellReady', 240000);
    await page.until("window.__ui.screen === 'title'", 60000).catch(() => {});
    say(await page.click('.gate-card-hub-club .gate-card-name'), 'the Flight Club card is clicked');
    await page.until("window.__ui.hub === 'club' && !!document.querySelector('.gate-card-weekly')", 20000).catch(() => {});
    const cards = await page.evaluate("[...document.querySelectorAll('.screen-title .gate-card')].map((c) => c.className)");
    say(cards.length > 0 && /gate-card-weekly/.test(cards[0]), `the week's card is first in Flight Club: ${JSON.stringify(cards.slice(0, 2))}`);
    const text = await page.evaluate("(document.querySelector('.gate-card-weekly') || {}).textContent || ''");
    say(text.includes('This week: Weekly ring'), `it names the track: ${JSON.stringify(text.slice(0, 60))}`);
    say(/Ends /.test(text) && text.includes('Gold 40.00'), 'it says when it ends and the gold to beat');
    say(text.includes('You: 45.00, silver, 2 of 2'), 'it finds the pilot by name: 45.00, silver (under 46.00), second of two');
    say(text.includes('Tokens: a lap 20, bronze 40, silver 60, gold 100'), 'and what each tier pays');
    await page.sleep(400);
    const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 }, page.sessionId);
    await writeFile(join(outDir, 'weekly-card.jpg'), Buffer.from(data, 'base64'));
    console.log(`  shot ${join(outDir, 'weekly-card.jpg')}`);
    say(await page.click('.gate-card-weekly .gate-card-name'), 'the week\'s card is clicked');
    await page.until(`window.__map && window.__map().ready && window.__map().mode === 'race' && window.__race().key.endsWith('.map.${ID}')`, 300000).catch(() => {});
    const seated = await page.evaluate('({ map: window.__map(), key: window.__race().key })');
    say(seated.map.id === 'swiss2' && seated.map.mode === 'race' && seated.key.endsWith(`.map.${ID}`), `it seats the week's track as a race: ${seated.map.id}, ${seated.key.split('.').slice(-2).join('.')}`);
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
