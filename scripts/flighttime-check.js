/*
 * flighttime-check.js: the pilot's flight time in the real shell. A guest
 * flies a quad up off the ground, hovers, pauses, lands, and Pilot's
 * Flight time row goes from nothing to the time flown; the pause adds
 * nothing; the Hangar names the time on that aircraft; and the board's
 * "All pilots" row shows the board's own all time sum, and is absent
 * with no board.
 *
 *   SIM_GPU=1 node scripts/flighttime-check.js [/path/to/fdfpv-leaderboard]
 *
 * The board is the real one, started here on a free port with a file
 * store in a scratch directory, so the row reads the board's real
 * GET /api/stats. The game's own statistics events go to it too, which
 * is a second check: a session from an aircraft the board does not name
 * must still be counted (src/share/stats.js wireCraft).
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

import http from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { flightTotals } from '../src/share/flighttime.js';
import { flightTimeText } from '../src/ui/carousel.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const boardDir = resolve(process.argv[2] || join(root, '..', 'fdfpv-leaderboard'));
/* A quad, for a takeoff that needs no runway; not the five inch, which
 * is leaving the roster. */
const CRAFT = '7inch';
const MAP = 'swiss2';
const HOVER_MS = 8000;
const PAUSE_MS = 3000;

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

if (!existsSync(join(boardDir, 'src', 'server.js'))) {
  console.error(`flighttime-check: no board checkout at ${boardDir}`);
  process.exit(2);
}
const scratch = mkdtempSync(join(tmpdir(), 'fdfpv-flighttime-'));

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
const B = `http://127.0.0.1:${boardPort}`;
for (let i = 0; i < 100; i += 1) {
  /* eslint-disable-next-line no-await-in-loop */
  const up = await fetch(`${B}/api/health`).then((r) => r.ok).catch(() => false);
  if (up) {
    break;
  }
  /* eslint-disable-next-line no-await-in-loop */
  await new Promise((r) => setTimeout(r, 100));
}
/* Two minutes of everybody's flying before this pilot's: two flushes, as
 * a browser sends them. */
for (const tab of ['seedtab-0001', 'seedtab-0002']) {
  /* eslint-disable-next-line no-await-in-loop */
  await fetch(`${B}/api/stats/events`, {
    method: 'POST', body: JSON.stringify({ v: 1, kind: 'flush', tab, craft: '5inch', map: 'city', laps: 0, flightS: 60, crashes: 0 }),
  });
}
const before = await fetch(`${B}/api/stats`).then((r) => r.json());
console.log(`board ${B} (${boardDir}), all time flight ${before.allTime.flightS} s`);

function seed() {
  const s = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, CRAFT);
  Object.assign(s, {
    map: MAP, graphics: 'low', flightMode: 'angle', fpsCap: 0, airframeAsked: true,
  });
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(s)});
    localStorage.setItem(k, JSON.stringify(s));
  } catch (e) { /* storage refused */ }`];
}

const recordOf = (page) => page.evaluate('JSON.parse(JSON.stringify(window.__ui.settings.flightTime))');
const storedOf = (page) => page.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}) || '{}').flightTime || {}`);
/* Pilot's row by id, as the pilot sees it: label and value text. */
async function pilotRow(page, id) {
  await page.evaluate("window.__ui.show('pilot'); true");
  await page.sleep(400);
  return page.evaluate(`(() => {
    const r = document.querySelector('[data-row-id=${JSON.stringify(id)}]');
    return r ? { label: r.querySelector('.row-label').textContent, value: (r.querySelector('.row-value') || {}).textContent || '' } : null;
  })()`);
}

const page = await openPage({ root, width: 1280, height: 720, url: `/index.html?board=${encodeURIComponent(B)}`, seed: seed() });
try {
  await page.until('!!window.__shellReady', 300000);
  await page.until('window.__map && window.__map().ready', 400000);

  console.log('before flying');
  check('a fresh pilot has no flight time', flightTotals(await recordOf(page)).seconds === 0);
  let row = await pilotRow(page, 'pilot:flight-time');
  check('Pilot says so', row && row.label === 'Flight time' && row.value === 'Not flown yet', JSON.stringify(row));
  await page.until("!!document.querySelector('[data-row-id=\"pilot:flight-everyone\"]')", 20000).catch(() => {});
  row = await pilotRow(page, 'pilot:flight-everyone');
  check('All pilots reads the board\'s sum', row && row.value === '0 hours flown', JSON.stringify(row));

  console.log('flying');
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight' && window.__map().ready", 400000);
  await page.sleep(500);
  const home = await page.evaluate('(() => { const c = window.__craftState(); return [c.worldX, c.worldY + 4, c.worldZ]; })()');
  /* Hold a point four metres over the start, the hotswap check's own
   * feedback loop on the published state. */
  await page.evaluate(`(() => {
    const goal = ${JSON.stringify(home)};
    const cl = (v, a, b) => Math.max(a, Math.min(b, v));
    window.__pilot = true;
    const step = () => {
      if (!window.__pilot) { return; }
      const c = window.__craftState();
      const v = c.vel || { x: 0, y: 0, z: 0 };
      const rel = [goal[0] - c.worldX, goal[2] - c.worldZ];
      const flat = Math.hypot(rel[0], rel[1]);
      const want = flat > 1e-6 ? [rel[0] / flat * Math.min(3, 0.8 * flat), rel[1] / flat * Math.min(3, 0.8 * flat)] : [0, 0];
      const dv = [want[0] - v.x, want[1] - v.z];
      const f = c.fwd ? [c.fwd.x, c.fwd.z] : [0, -1];
      const fn = Math.hypot(f[0], f[1]) || 1;
      const along = dv[0] * f[0] / fn + dv[1] * f[1] / fn;
      const right = dv[0] * -f[1] / fn + dv[1] * f[0] / fn;
      const dy = goal[1] - c.worldY;
      window.__stick(cl(0.09 * right, -0.45, 0.45), cl(-0.09 * along, -0.45, 0.45), 0, cl(0.45 + 0.12 * dy - 0.1 * v.y, 0.1, 0.9));
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    return true;
  })()`);
  await page.until('!window.__craftState().landed', 30000).catch(() => {});
  const upAt = Date.now();
  await page.sleep(HOVER_MS);
  const midair = await page.evaluate('(() => { const c = window.__craftState(); return { landed: c.landed, crashed: c.crashed }; })()');
  check('the quad is in the air and in one piece', !midair.landed && !midair.crashed, JSON.stringify(midair));

  console.log('paused');
  await page.evaluate("window.__pilot = false; window.__ui.act('pause'); true");
  const pausedAt = Date.now();
  await page.until("window.__craftState().mode === 'paused'", 10000).catch(() => {});
  const flownWall = (pausedAt - upAt) / 1000;
  await page.sleep(500);
  const atPause = flightTotals(await recordOf(page)).seconds;
  check('the time flown is written when the flying stops', atPause >= HOVER_MS / 1000 - 1 && atPause <= flownWall + 1, `${atPause} s counted, ${flownWall.toFixed(1)} s on the wall`);
  await page.sleep(PAUSE_MS);
  const afterPause = flightTotals(await recordOf(page)).seconds;
  check('a pause adds nothing', afterPause === atPause, `${atPause} then ${afterPause}`);
  check('and it is in local storage, not only in the page', flightTotals(await storedOf(page)).seconds === atPause);

  console.log('landing');
  await page.evaluate("window.__ui.act('resume'); true");
  await page.until("window.__craftState().mode === 'flight'", 10000).catch(() => {});
  /* Down at a walk, then the throttle off near the ground: a perch wants
   * the stick low (src/main.js TAKEOFF_RELEASE). */
  await page.evaluate('window.__stick(0, 0, 0, 0.3); true');
  await page.until('window.__craftState().groundClearance < 0.6', 60000).catch(() => {});
  await page.evaluate('window.__stick(0, 0, 0, 0); true');
  await page.until('window.__craftState().landed', 30000).catch(() => {});
  const down = await page.evaluate('(() => { const c = window.__craftState(); return { landed: c.landed, crashed: c.crashed }; })()');
  check('the quad comes down and lands', down.landed, JSON.stringify(down));
  await page.sleep(1500);
  const landedRecord = await recordOf(page);
  const t = flightTotals(landedRecord);
  check('the landing is written, and adds to the hover', t.seconds > atPause, `${t.seconds} s`);
  check('all of it on this aircraft, in free flight', t.byAirframe[CRAFT] === t.seconds && t.byActivity.free === t.seconds, JSON.stringify(t));
  check('the first flight is today', t.first === new Date().toISOString().slice(0, 10), t.first);
  check('one slot, this browser\'s', Object.keys(landedRecord).length === 1);
  await page.sleep(PAUSE_MS);
  const sat = flightTotals(await recordOf(page)).seconds;
  check('sitting on the ground adds nothing', sat === t.seconds, `${t.seconds} then ${sat}`);

  console.log('what the pilot sees');
  await page.evaluate("window.__ui.act('pause'); true");
  await page.until("window.__craftState().mode === 'paused'", 10000).catch(() => {});
  row = await pilotRow(page, 'pilot:flight-time');
  check('Pilot\'s Flight time row went up from nothing to the time flown', row && row.value === flightTimeText(t.seconds), JSON.stringify(row));
  const note = await page.evaluate("(window.__ui.items().find((it) => it.id === 'pilot:flight-time') || {}).note || ''");
  check('its note gives the day and the activity', note.startsWith('Since ') && note.endsWith(`. Free Flight ${flightTimeText(t.seconds)}`), note);
  await page.evaluate(`window.__ui.openHangar(${JSON.stringify(CRAFT)}); true`);
  await page.until('window.__ui.hangar.isOpen', 10000).catch(() => {});
  const facts = await page.evaluate("[...document.querySelectorAll('.hangar-facts .carousel-fact')].map((e) => e.textContent)");
  check('the Hangar names the time on this aircraft', facts.includes(`${flightTimeText(t.seconds)} on the ${airframeById(CRAFT).name}`), JSON.stringify(facts));
  await page.evaluate('window.__ui.hangar.cancel(); true');
  const sessions = await fetch(`${B}/api/stats`).then((r) => r.json()).then((s) => s.allTime.sessions);
  check('the board counted this session of an aircraft it does not name', sessions >= 1, `${sessions}`);
} finally {
  await page.close();
}

console.log('no board');
{
  const off = await openPage({ root, width: 1280, height: 720, url: '/index.html?board=http%3A%2F%2F127.0.0.1%3A9', seed: seed() });
  try {
    await off.until('!!window.__shellReady', 300000);
    await off.evaluate("window.__ui.show('pilot'); true");
    await off.sleep(3000);
    await off.evaluate("window.__ui.renderMenu(); true");
    const everyone = await off.evaluate("!!document.querySelector('[data-row-id=\"pilot:flight-everyone\"]')");
    const own = await off.evaluate("!!document.querySelector('[data-row-id=\"pilot:flight-time\"]')");
    check('with no board answering, All pilots is not shown, and the pilot\'s own row is', !everyone && own);
  } finally {
    await off.close();
  }
}

board.kill();
rmSync(scratch, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
