/*
 * caddy-headers-check.js: deploy/vm/Caddyfile's security headers on a local
 * stack, before the lead deploys them to the VM. Local only: it needs a
 * Caddy binary and a checkout of fdflabs/fdfpv-leaderboard.
 *
 *   CADDY=/path/to/caddy FDFPV_BOARD=/path/to/fdfpv-leaderboard \
 *     node scripts/caddy-headers-check.js [report|enforce]   (default enforce)
 *
 * The VM's Caddyfile, with its two sites swapped for one plain HTTP site on
 * a loopback port and its upstream ports for free ones, fronts the real
 * tracks server, rooms server and board, started here on scratch files.
 * `report` sends every Content-Security-Policy as Report-Only instead, to
 * collect what it would block. Then:
 *   1. every answer (/api, /v2, /board, /board/api, /vids) carries nosniff,
 *      the referrer policy, the permissions policy and a CSP; the APIs'
 *      forbids everything and framing, the board's pages get the board's,
 *   2. the APIs still answer, CORS included, and a WebSocket upgrades
 *      through Caddy,
 *   3. the board's two pages, in headless Chromium through Caddy, load with
 *      no CSP violation, and its admin sign in opens and sends a (wrong)
 *      password that the board refuses; an injected inline script is the
 *      control that violations are seen at all,
 *   4. two pages of the game make and join a room through Caddy and fly
 *      (scripts/rooms-two-page.js with Caddy as the rooms origin), with the
 *      game's own policy on too (SIM_CSP, scripts/csp.js).
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

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { startRooms } from '../edge/rooms/node.js';
import { startTracks } from '../tracks-api/node.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const MODE = process.argv[2] || 'enforce';
if (!['report', 'enforce'].includes(MODE)) {
  throw new Error(`${MODE}: report or enforce`);
}
/* tests/lib/page.js reports every violation a page meets under SIM_CSP;
 * the board's pages here get their policy from Caddy, not the test server. */
process.env.SIM_CSP = MODE;
const CADDY = process.env.CADDY || 'caddy';
const BOARD = process.env.FDFPV_BOARD || join(root, '..', 'fdfpv-leaderboard');
const SITE = 'https://paraguayandronecombatsimulator.com';

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

const freePort = () => new Promise((resolve) => {
  const s = createServer().listen(0, '127.0.0.1', () => {
    const { port } = s.address();
    s.close(() => resolve(port));
  });
});

async function waitFor(url, ms) {
  const end = Date.now() + ms;
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.status < 500) {
        return;
      }
    } catch (e) {
      /* not up yet */
    }
    if (Date.now() > end) {
      throw new Error(`${url} did not come up`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}

/* A child process whose output is kept for when it fails. */
function child(cmd, args, opts) {
  const p = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
  p.log = '';
  p.stdout.on('data', (d) => { p.log += d; });
  p.stderr.on('data', (d) => { p.log += d; });
  return p;
}

function runScript(script, args, env) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [join(root, 'scripts', script), ...args], { env: { ...process.env, ...env } });
    let out = '';
    p.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
    p.stderr.on('data', (d) => process.stderr.write(d));
    p.on('exit', (code) => resolve({ code, out }));
  });
}

const scratch = await mkdtemp(join(process.env.TMPDIR || tmpdir(), 'fdfpv-caddy-'));
const procs = [];
const stops = [];
try {
  const [tracksPort, roomsPort, boardPort, front] = await Promise.all([freePort(), freePort(), freePort(), freePort()]);
  const tracks = await startTracks({ db: join(scratch, 'tracks.db'), port: tracksPort, adminSecret: 'caddy-check' });
  stops.push(() => tracks.stop());
  const rooms = await startRooms({ db: join(scratch, 'rooms.db'), port: roomsPort });
  stops.push(() => rooms.stop());
  const board = child(process.execPath, ['src/server.js'], {
    cwd: BOARD,
    env: { ...process.env, PORT: String(boardPort), BOARD_HOST: '127.0.0.1', BOARD_FILE: join(scratch, 'board.json'), BOARD_TRUST_PROXY: '1', SIM_ORIGIN: SITE,
      BOARD_ADMINS: 'keeper@example.com:plain:caddy-check-password' },
  });
  procs.push(board);

  /* The VM's file, its snippet and directives as they are; only the sites
   * and the upstream ports change. */
  let conf = await readFile(join(root, 'deploy/vm/Caddyfile'), 'utf8');
  conf = conf.slice(0, conf.indexOf('\n129.151.39.48 {'))
    .replace(/^\{[\s\S]*?\n\}\n/m, '{\n\tadmin off\n\tauto_https off\n}\n')
    .replace('127.0.0.1:3180', `127.0.0.1:${boardPort}`)
    .replace('127.0.0.1:8787', `127.0.0.1:${tracksPort}`)
    .replace('127.0.0.1:8797', `127.0.0.1:${roomsPort}`)
    .replace('root * /var/lib/fdfpv-vids', `root * ${scratch}`);
  if (MODE === 'report') {
    conf = conf.replace(/Content-Security-Policy "/g, 'Content-Security-Policy-Report-Only "');
    if (!conf.includes('?Content-Security-Policy-Report-Only "')) {
      throw new Error('the report swap missed the default policy');
    }
  }
  conf += `\nhttp://127.0.0.1:${front} {\n\timport servers\n}\n`;
  await writeFile(join(scratch, 'Caddyfile'), conf);
  await writeFile(join(scratch, 'film.mp4'), Buffer.alloc(64));
  const caddy = child(CADDY, ['run', '--config', join(scratch, 'Caddyfile'), '--adapter', 'caddyfile']);
  procs.push(caddy);
  const origin = `http://127.0.0.1:${front}`;
  await waitFor(`${origin}/api/version`, 20000);
  await waitFor(`${origin}/board/api/health`, 20000);
  console.log(`a local stack behind Caddy at ${origin} (${MODE})`);

  console.log('1. the headers');
  const cspName = MODE === 'report' ? 'content-security-policy-report-only' : 'content-security-policy';
  for (const path of ['/api/version', '/v2/version', '/vids/film.mp4', '/board/', '/board/bugs.html', '/board/api/health', '/board/app.js']) {
    const res = await fetch(`${origin}${path}`, { headers: { origin: SITE } });
    const h = res.headers;
    const csp = h.get(cspName) || '';
    const isBoard = path.startsWith('/board/');
    check(`${path}: ${res.status}, nosniff, referrer and permissions policies`,
      res.status === 200 && h.get('x-content-type-options') === 'nosniff' && h.get('referrer-policy') === 'strict-origin-when-cross-origin'
        && /camera=\(\)/.test(h.get('permissions-policy') || '') && !h.get('server'));
    check(`${path}: ${isBoard ? "the board's policy" : 'nothing allowed, no framing'}`,
      isBoard ? csp.startsWith("default-src 'self'") && csp.includes("frame-ancestors 'none'") : csp.startsWith("default-src 'none'; frame-ancestors 'none'"),
      csp.slice(0, 60));
  }

  console.log('2. the servers through it');
  const cors = await fetch(`${origin}/api/version`, { headers: { origin: SITE } });
  check('the tracks server answers the game origin with CORS', cors.ok && Boolean(cors.headers.get('access-control-allow-origin')));
  const { WebSocket } = await import('ws');
  const upgraded = await new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${front}/v2/public/swiss2`, { headers: { origin: SITE } });
    ws.on('open', () => { ws.close(); resolve('open'); });
    ws.on('unexpected-response', (req, res) => resolve(`http ${res.statusCode}`));
    ws.on('error', (e) => resolve(`error ${e.message}`));
  });
  check('a WebSocket upgrades through Caddy', upgraded === 'open', upgraded);

  console.log("3. the board's pages in Chromium");
  const empty = await mkdtemp(join(scratch, 'page-'));
  for (const path of ['/board/', '/board/bugs.html']) {
    const page = await openPage({ root: empty, url: '/' });
    try {
      await page.cdp.send('Page.navigate', { url: `${origin}${path}` }, page.sessionId);
      await page.until("document.readyState === 'complete'", 30000);
      await page.sleep(3000);
      const seen = await page.evaluate("document.body ? document.body.innerText.length : 0");
      if (path === '/board/') {
        /* The admin sign in, with the pointer: open it and sign in as the
         * keeper this board was started with, through the policy. */
        const at = await page.evaluate("(() => { const b = document.getElementById('admin-open').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()");
        for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
          await page.cdp.send('Input.dispatchMouseEvent', { type, ...at, button: 'left', clickCount: 1 }, page.sessionId);
        }
        await page.until("!document.getElementById('admin-sheet').hidden", 10000);
        await page.evaluate("document.getElementById('admin-email').focus(); true");
        await page.cdp.send('Input.insertText', { text: 'keeper@example.com' }, page.sessionId);
        await page.evaluate("document.getElementById('admin-password').focus(); true");
        await page.cdp.send('Input.insertText', { text: 'caddy-check-password' }, page.sessionId);
        const asked = await page.evaluate("new Promise((r) => { const f = window.fetch; window.fetch = (...a) => { const p = f(...a); if (String(a[0]).includes('admin/login')) { p.then((x) => r(x.status), () => r('blocked')); } return p; }; document.getElementById('admin-signin').requestSubmit(); setTimeout(() => r('no request'), 8000); })");
        check('/board/: the admin opens and signs in', asked === 200, String(asked));
      }
      const csp = page.errors.filter((e) => e.includes('CSP violation'));
      check(`${path} loads and draws, no CSP violation`, seen > 50 && csp.length === 0,
        csp.length ? csp.slice(0, 3).join(' | ') : `${seen} characters of text`);
      /* The control: an inline script the board's policy does not allow
       * must be reported, or the zero above means nothing. */
      await page.evaluate("document.head.append(Object.assign(document.createElement('script'), { textContent: '1' })); true");
      await page.sleep(500);
      const control = page.errors.filter((e) => e.includes('CSP violation') && e.includes('script-src')).length;
      check(`${path}: an injected inline script is reported`, control > 0, `${control}`);
    } finally {
      await page.close();
    }
  }

  console.log('4. the game through it, with its own policy on');
  const env = { SIM_CSP: MODE };
  const roomsRun = await runScript('rooms-two-page.js', [origin, join(scratch, 'rooms-shots')], env);
  check('rooms-two-page.js through Caddy', roomsRun.code === 0, `exit ${roomsRun.code}`);
  const violations = [...new Set(roomsRun.out.split('\n').filter((l) => l.startsWith('csp-violation:')))];
  check('and no CSP violation in the game', violations.length === 0, violations.slice(0, 5).join(' | '));
} catch (e) {
  check('the stack ran', false, e.message);
  for (const p of procs) {
    console.log(p.log.split('\n').slice(-15).join('\n'));
  }
} finally {
  for (const p of procs) {
    p.kill();
  }
  for (const stop of stops) {
    await stop();
  }
  await rm(scratch, { recursive: true, force: true });
}

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
