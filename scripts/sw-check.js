/*
 * sw-check.js: the offline cache (sw.js) on a staged, stamped site, as
 * GitHub Pages would serve it. Headless Chromium through tests/lib/page.js.
 * Run with npm run sw:check.
 *
 * The site is staged the way .github/workflows/pages.yml stages it and
 * stamped by scripts/stamp-version.js, twice: deploy A, and deploy B, which
 * differs from A in its version and in the bytes of one asset the boot
 * fetches. A local server stands in for Pages, but with max-age=0, the state
 * of every file once Pages' ten minutes are up, which is the state a pilot
 * coming back tomorrow meets. Each answer waits DELAY_MS first, a round trip
 * to a far server, so a request saved is time saved and shows as such.
 *
 * 1. LOAD TIMES. Three visits to A with the worker, three to A with sw.js
 *    missing (the site before this change), each in its own origin. For
 *    every visit: milliseconds to a ready shell, requests the server saw,
 *    and the bytes it sent.
 * 2. AN UPDATE REACHES A RETURNING PILOT. The worker's origin switches to B
 *    under the open tab. The reload bar shows; its Reload, pressed with the
 *    pointer, must load every module from B, and the changed asset must be
 *    B's bytes while the unchanged ones stay cached. A's modules leave the
 *    cache.
 * 3. OFFLINE. The server stops. A visit still reaches a ready shell.
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
import { cpSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { stampSite } from './stamp-version.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DELAY_MS = 40;
const A = 'aaaaaaaaaaaa';
const B = 'bbbbbbbbbbbb';

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
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2'],
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

/* The Pages workflow's rsync, as a copy filter: what it leaves out is left
 * out here, so the worker's asset list is the one a deploy would carry. */
const LEFT_OUT_DIRS = ['.git', '.github', 'vendor', 'node_modules', 'build', 'patches', 'tracks', 'edge', 'scripts',
  'tests/browser', 'tests/fixtures', 'tests/gen', 'tests/inputs', '.claude', 'tmp'];
function staged(rel) {
  const p = rel.split(sep).join('/');
  if (LEFT_OUT_DIRS.some((d) => p === d || p.startsWith(`${d}/`))) {
    return false;
  }
  return !(p.endsWith('.md') || ['package.json', 'package-lock.json', 'render.yaml', 'gates.config.json',
    'tests/verify.js'].includes(p) || /^tests\/[^/]+\.json$/.test(p));
}

function stage(dir, version, change = null) {
  cpSync(root, dir, { recursive: true, filter: (src) => staged(relative(root, src)) });
  if (change) {
    const path = join(dir, change.path);
    unlinkSync(path);
    writeFileSync(path, change.bytes);
  }
  return stampSite(dir, version);
}

/* Pages after its max-age: every file revalidates, 304 on a match, the
 * query ignored. Each JavaScript file says which deploy sent it, as in
 * scripts/version-reload-check.js. `site.dir` is switched by the check. */
function pagesServer(site) {
  const server = http.createServer(async (req, res) => {
    await new Promise((r) => setTimeout(r, DELAY_MS));
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      let rel = normalize(decodeURIComponent(url.pathname)).replace(/^\/+/, '');
      if (rel === '' || rel.endsWith('/')) {
        rel += 'index.html';
      }
      if (rel === 'sw.js' && !site.worker) {
        throw new Error('no worker on this site');
      }
      const path = join(site.dir, rel);
      if (!path.startsWith(site.dir)) {
        throw new Error('outside the root');
      }
      let body = await readFile(path);
      if (extname(rel) === '.js' && rel !== 'sw.js') {
        body = Buffer.concat([body, Buffer.from(
          `\n;(globalThis.__served ??= {})[import.meta.url] = ${JSON.stringify(site.version)};\n`,
        )]);
      }
      const etag = `"${createHash('sha1').update(body).digest('hex').slice(0, 16)}"`;
      const head = {
        'content-type': MIME.get(extname(rel)) ?? 'application/octet-stream',
        'cache-control': 'max-age=0',
        etag,
      };
      if (req.headers['if-none-match'] === etag) {
        site.log.push({ url: req.url, status: 304, bytes: 0, dest: req.headers['sec-fetch-dest'] });
        res.writeHead(304, head);
        res.end();
        return;
      }
      site.log.push({ url: req.url, status: 200, bytes: body.length, dest: req.headers['sec-fetch-dest'] });
      res.writeHead(200, { ...head, 'content-length': body.length });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (e) {
      site.log.push({ url: req.url, status: 404, bytes: 0 });
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
  return { n: urls.length, by };
})()`;

async function visit(page, site, origin) {
  const from = site.log.length;
  await page.evaluate('window.__leaving = true; true').catch(() => {});
  const t0 = Date.now();
  await page.cdp.send('Page.navigate', { url: `${origin}/` }, page.sessionId);
  await page.until('!window.__leaving && !!window.__shellReady', 300000);
  const ms = Date.now() - t0;
  /* Let the boot's late fetches land before the next visit counts. */
  await page.sleep(3000);
  const log = site.log.slice(from);
  return {
    ms,
    requests: log.length,
    full: log.filter((r) => r.status === 200).length,
    kb: Math.round(log.reduce((n, r) => n + r.bytes, 0) / 1024),
    log,
  };
}

const row = (name, v) => `${name}: ${v.ms} ms to ready, ${v.requests} requests (${v.full} full), ${v.kb} KiB sent`;

const scratch = await mkdtemp(join(process.env.TMPDIR || tmpdir(), 'fdfpv-sw-'));
const dirA = join(scratch, 'a');
const dirB = join(scratch, 'b');
const servers = [];
const page = await openPage({ root: scratch, url: '/' });
try {
  const counts = stage(dirA, A);
  const assets = JSON.parse(/const ASSETS = (\{.*\});/.exec(readFileSync(join(dirA, 'sw.js'), 'utf8'))[1]);
  console.log(`staged: ${counts['index.html']} modules in index.html, ${counts['sw.js']} assets in sw.js`);

  console.log('1. load times, max-age=0 and', DELAY_MS, 'ms a request');
  const without = { dir: dirA, version: A, worker: false, log: [] };
  const w = await pagesServer(without);
  servers.push(w.server);
  const plain = [];
  for (let i = 1; i <= 3; i += 1) {
    plain.push(await visit(page, without, w.origin));
    console.log(`  ${row(`no worker, visit ${i}`, plain[i - 1])}`);
  }
  check('without the worker the site boots and registers nothing',
    await page.evaluate('navigator.serviceWorker.getRegistrations().then((r) => r.length === 0)'));

  const site = { dir: dirA, version: A, worker: true, log: [] };
  const s = await pagesServer(site);
  servers.push(s.server);
  const cached = [];
  for (let i = 1; i <= 3; i += 1) {
    cached.push(await visit(page, site, s.origin));
    console.log(`  ${row(`worker, visit ${i}`, cached[i - 1])}`);
    if (i === 1) {
      await page.until('!!navigator.serviceWorker.controller', 30000);
    }
  }
  check('the worker controls the page', await page.evaluate('!!navigator.serviceWorker.controller'));
  const third = cached[2];
  const strayRows = third.log.filter((r) => !/^\/(\?|$|index\.html|sw\.js|version\.json)/.test(r.url));
  const strays = strayRows.map((r) => r.url);
  if (strayRows.length) {
    /* The worker's own fill asks with sec-fetch-dest empty; a page's
     * request that never reached the worker carries its destination. */
    console.log(`  note  stray destinations: ${strayRows.map((r) => `${r.url}=${r.dest}`).join(' ')}`);
  }
  if (strays.length) {
    const why = await page.evaluate(`(async () => {
      const keys = (await (await caches.open('fdfpv-assets')).keys()).map((r) => new URL(r.url).pathname);
      return ${JSON.stringify(strays)}.map((u) => {
        const t = performance.getEntriesByName(new URL(u, location.href).href)[0];
        return u + ' cached=' + keys.includes(u) + ' viaWorker=' + (t ? t.workerStart > 0 : 'no entry') + ' initiator=' + (t ? t.initiatorType : '');
      });
    })()`);
    console.log(`  note  ${why.join(' | ')}`);
  }
  const leftover = third.log.filter((r) => !/^\/(\?|$|index\.html|sw\.js|version\.json)/.test(r.url));
  check('a returning visit asks the server for nothing but the page, sw.js and version.json',
    leftover.length === 0, leftover.slice(0, 5).map((r) => r.url).join(' '));
  check('a returning visit makes fewer requests than without the worker',
    third.requests * 10 < plain[2].requests, `${third.requests} against ${plain[2].requests}`);
  check('and is faster', third.ms < plain[2].ms, `${third.ms} ms against ${plain[2].ms} ms`);

  console.log('2. a new deploy reaches the returning pilot');
  const fetched = new Set(cached[0].log.map((r) => r.url.split('?')[0].slice(1)));
  /* What the worker held before the deploy: only these can be fetched
   * again. A file the boot first asks for after the Reload (the audio
   * worklets start on the click's activation) is a first fetch. */
  const held = new Set(await page.evaluate(`caches.open('fdfpv-assets').then((c) => c.keys())
    .then((k) => k.map((r) => new URL(r.url).pathname.slice(1)))`));
  const changed = Object.keys(assets).filter((p) => fetched.has(p) && p.endsWith('.json')).sort()[0]
    || Object.keys(assets).filter((p) => fetched.has(p)).sort()[0];
  check('the boot fetches an asset the worker caches by hash', Boolean(changed), changed);
  const original = readFileSync(join(dirA, changed));
  const bytesB = changed.endsWith('.json') ? Buffer.concat([original, Buffer.from('\n')]) : Buffer.concat([original, Buffer.from([0])]);
  stage(dirB, B, { path: changed, bytes: bytesB });
  const fromSwitch = site.log.length;
  site.dir = dirB;
  site.version = B;
  await page.evaluate("window.__ui.show('title'); window.dispatchEvent(new Event('focus')); true");
  await page.until('window.__ui.updateReady && !window.__ui.updateBar.hidden', 30000);
  check('the reload bar shows on the title', true);
  await page.until(`navigator.serviceWorker.getRegistration().then((r) => !!r && !!r.active
    && !r.installing && !r.waiting && r.active === navigator.serviceWorker.controller)
    .then((ok) => ok && fetch('sw.js', { cache: 'no-store' }).then((x) => x.text()))
    .then((t) => !!t && t.includes('${B}'))`, 30000);
  await page.evaluate('window.__beforeReload = true; true');
  check('Reload is pressed with the pointer', await page.click('.update-bar:not(.room-bar) .update-reload'));
  await page.until('!window.__beforeReload && !!window.__shellReady', 300000);
  await page.sleep(3000);
  const after = await page.evaluate(SERVED);
  check('every module after Reload is the new deploy\'s', after.n > 50 && after.by[B] === after.n, JSON.stringify(after.by));
  check('the page is the new version and shows no bar',
    await page.evaluate(`document.querySelector('meta[name="fdfpv-version"]').content === '${B}' && window.__ui.updateBar.hidden`));
  const got = await page.evaluate(`fetch(${JSON.stringify(changed)}).then((r) => r.arrayBuffer()).then((b) => b.byteLength)`);
  check('the changed asset is the new deploy\'s bytes', got === bytesB.length, `${got} bytes, B has ${bytesB.length}, A had ${original.length}`);
  const assetHits = site.log.slice(fromSwitch).map((r) => r.url.split('?')[0].slice(1)).filter((p) => held.has(p));
  check(`of the ${held.size} cached assets only the changed one was fetched again`,
    assetHits.length === 1 && assetHits[0] === changed, assetHits.slice(0, 5).join(' '));
  const keys = await page.evaluate("caches.open('fdfpv-modules').then((c) => c.keys()).then((k) => k.map((r) => r.url))");
  check('the old deploy\'s modules left the cache', keys.length > 50 && keys.every((u) => u.endsWith(`?v=${B}`)),
    `${keys.length} cached, ${keys.filter((u) => !u.endsWith(`?v=${B}`)).length} not B`);

  console.log('3. offline');
  s.server.close();
  s.server.closeAllConnections();
  await page.evaluate('window.__leaving = true; true');
  const off = Date.now();
  await page.cdp.send('Page.navigate', { url: `${s.origin}/` }, page.sessionId);
  await page.until('!window.__leaving && !!window.__shellReady', 120000);
  check('with the server gone the shell still boots', await page.evaluate(`document.querySelector('meta[name="fdfpv-version"]').content === '${B}'`),
    `${Date.now() - off} ms`);
  if (page.errors.length) {
    console.log(`  note  ${page.errors.length} page errors, first: ${page.errors.slice(0, 3).join(' | ')}`);
  }
} finally {
  await page.close();
  for (const srv of servers) {
    srv.close();
  }
  await rm(scratch, { recursive: true, force: true });
}

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
