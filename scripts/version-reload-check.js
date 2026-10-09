/*
 * version-reload-check.js: a deploy that lands under an open tab. Headless
 * Chromium through tests/lib/page.js. Run with npm run version:reload.
 *
 * A local server stands in for GitHub Pages: max-age=600 and an ETag on
 * every file, the query string ignored. It serves version A, then switches
 * to version B under the open page. Every JavaScript file it sends ends with
 * a line that records which version sent it and the URL the browser loaded
 * it at, so the check can say which modules came from which deploy.
 *
 * 1. THE CONTROL: the checkout as it is, unstamped. Load A, switch to B,
 *    location.reload(). Modules still inside max-age are expected to come
 *    back as A. This is the fault as the pilots met it, and it proves the
 *    rig can see a mix; if it saw none, a clean pass below would mean
 *    nothing.
 * 2. THE STAMP: the same pages through scripts/stamp-version.js, a fresh
 *    origin. Load A, check every module arrived at ?v=A. Switch to B and
 *    focus the window: the bar holds while the screen is flight and shows
 *    on Paused and on the title. Press its Reload: every module, and the
 *    wasm, must be B's.
 *
 * Screenshots of the bar go to the scratch directory named by
 * FDFPV_SCRATCH, or are skipped when it is unset.
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
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { stampPage } from './stamp-version.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const SCRATCH = process.env.FDFPV_SCRATCH || null;

const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.webm', 'video/webm'],
  ['.mp3', 'audio/mpeg'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
]);

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}${detail ? `  (${detail})` : ''}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

/*
 * Pages, as far as a cache can tell: max-age=600, a strong ETag, 304 on a
 * match, the query ignored. `site.version` is switched by the check; with
 * `site.stamped` the shell pages are stamped with it and version.json names
 * it.
 */
function pagesServer(site) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      let rel = normalize(decodeURIComponent(url.pathname)).replace(/^\/+/, '');
      if (rel === '' || rel.endsWith('/')) {
        rel += 'index.html';
      }
      let body;
      if (rel === 'version.json' && site.stamped) {
        body = Buffer.from(`${JSON.stringify({ version: site.version })}\n`);
      } else if (rel.endsWith('.html') && site.stamped && ['index.html', 'src/share/orbit.html'].includes(rel)) {
        body = Buffer.from(stampPage(root, rel, site.version).html);
      } else {
        const path = join(root, rel);
        if (!path.startsWith(root)) {
          throw new Error('outside the root');
        }
        body = await readFile(path);
        if (extname(rel) === '.js') {
          body = Buffer.concat([body, Buffer.from(
            `\n;(globalThis.__served ??= {})[import.meta.url] = ${JSON.stringify(site.version)};\n`,
          )]);
        }
      }
      const etag = `"${createHash('sha1').update(body).digest('hex').slice(0, 16)}"`;
      const head = {
        'content-type': MIME.get(extname(rel)) ?? 'application/octet-stream',
        'cache-control': 'max-age=600',
        etag,
      };
      site.requests.push(req.url);
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, head);
        res.end();
        return;
      }
      res.writeHead(200, { ...head, 'content-length': body.length });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (e) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

const SERVED = `(() => {
  const s = globalThis.__served || {};
  const urls = Object.keys(s);
  const by = {};
  for (const u of urls) { by[s[u]] = (by[s[u]] || 0) + 1; }
  return { n: urls.length, by, unversioned: urls.filter((u) => !/[?]v=/.test(u)).length,
    versions: [...new Set(urls.map((u) => (u.match(/[?]v=([^&]+)/) || [])[1] || ''))] };
})()`;

/* The wasm URLs a site was asked for since request number `from`. Read off
 * the server and not the page's resource timing, whose buffer keeps 250
 * entries: the shell loads over 400 modules first, so sim.wasm fell off the
 * end and the wasm checks failed with an empty list. */
function wasmAsked(site, from) {
  return site.requests.slice(from).filter((u) => u.includes('sim.wasm'));
}

async function navigate(page, url) {
  await page.cdp.send('Page.navigate', { url }, page.sessionId);
  await page.sleep(500);
  await page.until('!!window.__shellReady', 300000);
}

async function reloadAndWait(page, how) {
  await page.evaluate('window.__beforeReload = true; true');
  await page.evaluate(how);
  await page.until('!window.__beforeReload && !!window.__shellReady', 300000);
}

async function shot(page, name) {
  if (!SCRATCH) {
    return;
  }
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(SCRATCH, name), Buffer.from(data, 'base64'));
  console.log(`  shot  ${join(SCRATCH, name)}`);
}

const empty = await mkdtemp(join(tmpdir(), 'fdfpv-version-'));
const page = await openPage({ root: empty, url: '/' });
const control = { version: 'A', stamped: false, requests: [] };
const stamped = { version: 'aaaaaaaaaaaa', stamped: true, requests: [] };
const servers = [];
try {
  console.log('1. the control: unstamped, a deploy, a plain reload');
  const c = await pagesServer(control);
  servers.push(c.server);
  await navigate(page, `${c.origin}/`);
  const a = await page.evaluate(SERVED);
  check('version A loads', a.n > 50 && a.by.A === a.n, JSON.stringify(a.by));
  control.version = 'B';
  await reloadAndWait(page, 'location.reload(); true');
  const mixed = await page.evaluate(SERVED);
  check('a plain reload inside max-age runs modules from the old deploy', (mixed.by.A || 0) > 0,
    `${mixed.by.A || 0} of ${mixed.n} modules still A`);

  console.log('2. the stamp: a deploy under an open tab, the bar, its Reload');
  const s = await pagesServer(stamped);
  servers.push(s.server);
  await navigate(page, `${s.origin}/`);
  const before = await page.evaluate(SERVED);
  before.wasm = wasmAsked(stamped, 0);
  check('every module loads through the map at ?v=A', before.n > 50 && before.unversioned === 0
    && before.versions.length === 1 && before.versions[0] === 'aaaaaaaaaaaa' && before.by.aaaaaaaaaaaa === before.n,
  `${before.n} modules, ${before.unversioned} unversioned`);
  check('the wasm carries the version', before.wasm.length > 0 && before.wasm.every((u) => u.endsWith('?v=aaaaaaaaaaaa')), before.wasm.join(' '));
  await page.evaluate('window.dispatchEvent(new Event("focus")); true');
  await page.sleep(1500);
  check('no bar while the deployed version is this page\'s', await page.evaluate('window.__ui.updateBar.hidden'));

  stamped.version = 'bbbbbbbbbbbb';
  await page.evaluate("window.__ui.show('flight'); window.dispatchEvent(new Event('focus')); true");
  await page.until('window.__ui.updateReady', 20000);
  check('a new deploy is seen on focus, and the bar holds on the flight screen',
    await page.evaluate("window.__ui.screen === 'flight' && window.__ui.updateBar.hidden"));
  await page.evaluate("window.__ui.show('paused'); true");
  check('the bar shows on Paused', await page.evaluate('!window.__ui.updateBar.hidden && window.__ui.updateBar.getBoundingClientRect().width > 0'));
  await page.evaluate("window.__ui.show('title'); true");
  const bar = await page.evaluate('({ hidden: window.__ui.updateBar.hidden, text: window.__ui.updateBar.textContent })');
  check('the bar shows on the title', !bar.hidden, bar.text);
  await page.sleep(500);
  await shot(page, 'update-bar-1600.png');
  await page.cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, page.sessionId);
  await page.sleep(800);
  await shot(page, 'update-bar-390.png');
  await page.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false }, page.sessionId);

  await page.evaluate("sessionStorage.setItem('fdfpv.room', 'K7PZ2M'); true");
  const reloadFrom = stamped.requests.length;
  await reloadAndWait(page, "document.querySelector('.update-bar:not(.room-bar) .update-reload').click(); true");
  const after = await page.evaluate(SERVED);
  after.wasm = wasmAsked(stamped, reloadFrom);
  check('after Reload every module is the new deploy\'s', after.n > 50 && after.unversioned === 0
    && after.by.bbbbbbbbbbbb === after.n && after.versions.join() === 'bbbbbbbbbbbb',
  `${after.n} modules, ${JSON.stringify(after.by)}`);
  check('and the wasm', after.wasm.length > 0 && after.wasm.every((u) => u.endsWith('?v=bbbbbbbbbbbb')), after.wasm.join(' '));
  check('the page knows it is the new version, and shows no bar',
    await page.evaluate("document.querySelector('meta[name=\"fdfpv-version\"]').content === 'bbbbbbbbbbbb' && window.__ui.updateBar.hidden"));
  check('the room code survives the reload for rooms.js to rejoin',
    await page.evaluate("sessionStorage.getItem('fdfpv.room') === 'K7PZ2M'"));
  const polls = stamped.requests.filter((u) => u.startsWith('/version.json')).length;
  check('version.json was asked for', polls >= 2, `${polls} requests`);
  if (page.errors.length) {
    console.log(`  note  ${page.errors.length} page errors, first: ${page.errors.slice(0, 3).join(' | ')}`);
  }
} finally {
  await page.close();
  for (const srv of servers) {
    srv.close();
  }
  await rm(empty, { recursive: true, force: true });
}

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
