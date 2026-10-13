/*
 * clientreport-check.js: the anonymous error and frame-time reports in the
 * real shell send exactly what privacy.html says, and nothing once the
 * pilot has opted out or the browser sends Global Privacy Control.
 *
 *   node scripts/clientreport-check.js [/path/to/fdfpv-leaderboard]
 *   (npm run clientreport:check; browser, use ~/.cache/run-check.sh)
 *
 * Every beacon to /api/stats/events is copied in the page before it goes.
 * Three boots of index.html:
 *
 *   1. counting on: a thrown error carrying an email, a share link, a
 *      home folder and a callsign goes once, reduced; thrown again it is
 *      held and goes with its count when the page is left; an error inside
 *      the game's code carries that file and line and nothing else; a
 *      minute of frames (the part window, sent on leaving) is ten buckets,
 *      a GPU class and no renderer name; a window with the CPU slowed
 *      twenty times lands in slower buckets than a calm one before it.
 *   2. opted out with privacy.html's switch, then the same: nothing sent.
 *   3. Global Privacy Control: the switch is off and disabled, the note
 *      shows, and nothing is sent.
 *
 * With a board checkout given, the page sends to that board, started here
 * with a file store, and the admin read must hold the reports: proof the
 * two halves agree. Without one the beacons go to a closed port.
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
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { scrubMessage } from '../src/share/clientreport.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const boardDir = process.argv[2] ? resolve(process.argv[2]) : null;
const ADMIN = 'clientreport-check-admin-token';
const BOOT_MS = 300000;
/* A beacon is copied when its body has been read, a tick after it goes. */
const SETTLE_MS = 1500;

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

async function freePort() {
  return new Promise((r) => {
    const probe = http.createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => r(port));
    });
  });
}

let board = null;
let scratch = null;
let B = 'http://127.0.0.1:9';
if (boardDir) {
  if (!existsSync(join(boardDir, 'src', 'server.js'))) {
    console.error(`clientreport-check: no board checkout at ${boardDir}`);
    process.exit(2);
  }
  scratch = mkdtempSync(join(tmpdir(), 'fdfpv-clientreport-'));
  const port = await freePort();
  board = spawn(process.execPath, [join(boardDir, 'src', 'server.js')], {
    cwd: boardDir,
    env: {
      ...process.env, PORT: String(port), BOARD_HOST: '127.0.0.1', BOARD_FILE: join(scratch, 'board.json'), DATABASE_URL: '', BOARD_ADMIN_TOKEN: ADMIN,
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  B = `http://127.0.0.1:${port}`;
  let up = false;
  for (let i = 0; i < 100 && !up; i += 1) {
    up = await fetch(`${B}/api/health`).then((r) => r.ok).catch(() => false);
    if (!up) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  check('the board is up', up, B);
}

const CAPTURE = `(() => {
  const sent = [];
  window.__statsBeacons = sent;
  const real = navigator.sendBeacon.bind(navigator);
  navigator.sendBeacon = (url, data) => {
    if (String(url).includes('/api/stats/events')) {
      (data && data.text ? data.text() : Promise.resolve(String(data))).then((body) => sent.push(JSON.parse(body)));
    }
    return real(url, data);
  };
})();`;
const GPC = "Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true, configurable: true });";

const RAW = 'probe for ada@example.com at https://x.test/t?share=trk-9f3k in /home/ada/notes by Ace42';
const PRIVATE = ['ada@example.com', 'x.test', 'trk-9f3k', '/home/ada', 'Ace42'];
const GPU_CLASSES = ['software', 'integrated', 'discrete', 'hidden'];
/* The CPU slowed this many times: frames on a GPU and on the software
 * rasteriser both move several buckets. */
const SLOWED = 20;

const shellUrl = `/index.html?board=${encodeURIComponent(B)}`;
const reports = async (page) => {
  await page.sleep(SETTLE_MS);
  return (await page.evaluate('window.__statsBeacons')).filter((e) => e.kind === 'error' || e.kind === 'frames');
};
const leave = (page) => page.evaluate("window.dispatchEvent(new Event('pagehide')), true");
const throwIt = (page) => page.evaluate(`setTimeout(() => { throw new Error(${JSON.stringify(RAW)}); }), true`);
/* A TypeError inside the game's own code: a frame for a PerfOverlay that
 * is not there. */
const throwInCode = (page) => page.evaluate("import('/src/ui/perfoverlay.js').then((m) => { setTimeout(() => m.PerfOverlay.prototype.frame.call(null, 0)); return true; })");
const throttle = (page, rate) => page.cdp.send('Emulation.setCPUThrottlingRate', { rate }, page.sessionId);
/* Frames drawn while slowed, counted rather than waited for: a software
 * rasteriser on a loaded machine draws three in six seconds. */
const SLOW_FRAMES = `new Promise((done) => {
  let n = 0;
  const tick = () => (++n >= 6 ? done(n) : requestAnimationFrame(tick));
  requestAnimationFrame(tick);
})`;
/* The mean bucket a window's frames fall in. */
const meanBucket = (f) => f.b.reduce((a, n, i) => a + n * i, 0) / Math.max(1, f.b.reduce((a, n) => a + n, 0));

/* What a run that sends nothing does: everything run 1 does to a page. */
async function provoke(page) {
  await throwIt(page);
  await throwInCode(page);
  await page.sleep(500);
  await throwIt(page);
  await throttle(page, SLOWED);
  await page.sleep(2000);
  await throttle(page, 1);
  await leave(page);
}

async function counting() {
  console.log('counting on');
  const page = await openPage({ root, width: 960, height: 540, url: shellUrl, seed: [CAPTURE] });
  try {
    await page.until('!!window.__shellReady', BOOT_MS);
    const gpuRaw = await page.evaluate('window.__gpu && (window.__gpu.raw || window.__gpu.name) || ""');

    await throwIt(page);
    let got = await reports(page);
    const errors = got.filter((e) => e.kind === 'error');
    check('a thrown error goes once, at once', errors.length === 1, JSON.stringify(errors));
    const e = errors[0] || {};
    check('with exactly the documented keys', JSON.stringify(Object.keys(e)) === '["v","kind","sig","msg","where","count"]', Object.keys(e).join());
    check('its message reduced the way clientreport.js reduces', e.msg === scrubMessage(`Uncaught Error: ${RAW}`), e.msg);
    check('and nothing private left in the event', PRIVATE.every((p) => !JSON.stringify(e).includes(p)));
    check('no frame from outside the game\'s code, a count of one', Array.isArray(e.where) && e.where.length === 0 && e.count === 1);

    await throwIt(page);
    await throwInCode(page);
    got = await reports(page);
    const inCode = got.filter((x) => x.kind === 'error' && x.sig !== e.sig);
    check('the same error again is held, not sent', got.filter((x) => x.sig === e.sig).length === 1);
    check('an error in the game\'s code goes with its file and line', inCode.length === 1
      && inCode[0].msg === 'Uncaught TypeError: Cannot read properties of null (reading <q>)'
      && inCode[0].where.length === 1 && /^src\/ui\/perfoverlay\.js:\d+:\d+$/.test(inCode[0].where[0]), JSON.stringify(inCode));

    await leave(page);
    got = await reports(page);
    const repeat = got.filter((x) => x.sig === e.sig);
    check('leaving sends the held repeat with its count', repeat.length === 2 && repeat[1].count === 1, JSON.stringify(repeat));
    const base = got.filter((x) => x.kind === 'frames');
    check('leaving sends the part minute of frames', base.length === 1, JSON.stringify(base));
    const f = base[0] || { b: [] };
    check('with exactly the documented keys', JSON.stringify(Object.keys(f)) === '["v","kind","b","gpu","cap","scale"]', Object.keys(f).join());
    check('ten bucket counts', f.b.length === 10 && f.b.every((n) => Number.isInteger(n) && n >= 0) && f.b.some((n) => n > 0), JSON.stringify(f.b));
    check('a GPU class, never the renderer name', GPU_CLASSES.includes(f.gpu) && (!gpuRaw || !JSON.stringify(f).includes(gpuRaw)), `${f.gpu} vs ${gpuRaw}`);
    check('a cap and a scale off the lists', [0, 30, 60, 90, 120, 144, 240].includes(f.cap) && [0.25, 0.5, 0.75, 1].includes(f.scale));
    check('no poster slug, no other field', !('source' in f) && !('source' in e));

    /* The first window held the boot's frames; a calm one to compare. */
    await page.evaluate(SLOW_FRAMES);
    await leave(page);
    const calm = (await reports(page)).filter((x) => x.kind === 'frames').pop();
    /* Leaving again starts the slowed window empty, without the frames
     * drawn while the calm one was read. */
    await leave(page);
    await throttle(page, SLOWED);
    await page.evaluate(SLOW_FRAMES);
    await throttle(page, 1);
    await leave(page);
    const slow = (await reports(page)).filter((x) => x.kind === 'frames').pop();
    check('a window with the CPU slowed lands in slower buckets', slow !== calm && meanBucket(slow) >= meanBucket(calm) + 1,
      `mean bucket ${meanBucket(slow).toFixed(1)} vs ${meanBucket(calm).toFixed(1)} calm; ${JSON.stringify(slow.b)} vs ${JSON.stringify(calm.b)}`);
    const minutes = (await reports(page)).filter((x) => x.kind === 'frames').length;
    return { error: e, inCode: inCode[0], minutes };
  } finally {
    await page.close();
  }
}

async function silenced(name, seed, before) {
  console.log(name);
  const page = await openPage({ root, width: 960, height: 540, url: '/privacy.html', seed: [CAPTURE, ...seed] });
  try {
    await page.until("document.readyState === 'complete' && !!document.querySelector('[data-stats-switch]')", 30000);
    await before(page);
    await page.cdp.send('Page.navigate', { url: `${page.origin}${shellUrl}` }, page.sessionId);
    await page.until('!!window.__shellReady', BOOT_MS);
    await provoke(page);
    await page.sleep(SETTLE_MS);
    const all = await page.evaluate('window.__statsBeacons');
    check('nothing at all is sent', all.length === 0, JSON.stringify(all));
  } finally {
    await page.close();
  }
}

let sent = null;
try {
  sent = await counting();
  await silenced('opted out on privacy.html', [], async (page) => {
    const on = await page.evaluate("document.querySelector('[data-stats-switch]').checked");
    check('the switch starts on', on === true);
    await page.evaluate("[...document.querySelectorAll('[data-stats-switch]')][1].click(), true");
    const state = await page.evaluate(`({
      boxes: [...document.querySelectorAll('[data-stats-switch]')].map((b) => b.checked),
      memory: JSON.parse(localStorage.getItem('fdfpv.stats.v1') || 'null'),
    })`);
    check('turning either off turns both off and keeps the opt out', state.boxes.every((c) => c === false) && state.memory && state.memory.optOut === true, JSON.stringify(state));
  });
  await silenced('Global Privacy Control', [GPC], async (page) => {
    const state = await page.evaluate(`({
      boxes: [...document.querySelectorAll('[data-stats-switch]')].map((b) => [b.checked, b.disabled]),
      note: [...document.querySelectorAll('[data-stats-gpc]')].every((n) => !n.hidden),
    })`);
    check('the switch shows off and cannot be turned on, and the note shows', state.note && state.boxes.every(([c, d]) => !c && d), JSON.stringify(state));
  });
  if (board && sent) {
    console.log('the board');
    const read = await fetch(`${B}/api/stats/client`, { headers: { authorization: `Bearer ${ADMIN}` } }).then((r) => r.json());
    const row = (sig) => read.errors.find((r) => r.sig === sig) || {};
    check('the board took the error, both times', row(sent.error.sig).count === 2, JSON.stringify(row(sent.error.sig)));
    check('and the error in the code, with its frame', row(sent.inCode && sent.inCode.sig).where?.[0] === sent.inCode?.where[0]);
    check('and every window of frames', read.frames.reduce((n, r) => n + r.minutes, 0) === sent.minutes, `${sent.minutes} sent; ${JSON.stringify(read.frames)}`);
  }
} finally {
  if (board) {
    board.kill();
    rmSync(scratch, { recursive: true, force: true });
  }
}
console.log(`clientreport:check ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
