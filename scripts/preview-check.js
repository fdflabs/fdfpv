/*
 * preview-check.js: a pull request's preview, staged and stamped as
 * .github/workflows/preview.yml does it, opened from a host that is not the
 * game's (docs/PREVIEWS.md). Headless Chromium through tests/lib/page.js.
 * Run with npm run preview:check.
 *
 * The site is served from 127.0.0.2, which is neither one of SITE_HOSTS nor
 * a loopback name the page knows, exactly as pr-<n>.fdfpv-preview.pages.dev
 * is neither. The check proves the page boots there, asks nobody to sign in,
 * and sends not one request to the production API host.
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
import { execFileSync } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { API_ORIGIN } from '../src/share/api.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'], ['.json', 'application/json'], ['.css', 'text/css'],
  ['.wasm', 'application/wasm'], ['.glb', 'model/gltf-binary'], ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.webp', 'image/webp'], ['.mp3', 'audio/mpeg'],
]);

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

function serve(site) {
  const server = http.createServer(async (req, res) => {
    try {
      let rel = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '');
      if (rel === '' || rel.endsWith('/')) {
        rel += 'index.html';
      }
      const path = join(site, rel);
      if (!path.startsWith(site)) {
        throw new Error('outside the site');
      }
      const body = await readFile(path);
      res.writeHead(200, { 'content-type': MIME.get(extname(rel)) ?? 'application/octet-stream' });
      res.end(body);
    } catch (e) {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.2', () => resolve({ server, origin: `http://127.0.0.2:${server.address().port}` }));
  });
}

const site = await mkdtemp(join(tmpdir(), 'fdfpv-preview-'));
const empty = await mkdtemp(join(tmpdir(), 'fdfpv-preview-blank-'));
execFileSync(join(root, 'scripts/stage-site.sh'), [site], { cwd: root, stdio: 'ignore' });
execFileSync(process.execPath, [join(root, 'scripts/stamp-version.js'), site, 'feedfacecafe'], { cwd: root, stdio: 'ignore' });
const { server, origin } = await serve(site);
const page = await openPage({ root: empty, url: '/' });
const asked = [];
page.cdp.onEvent((msg) => {
  if (msg.method === 'Network.requestWillBeSent') {
    asked.push(msg.params.request.url);
  }
});
try {
  await page.cdp.send('Network.enable', {}, page.sessionId);
  await page.cdp.send('Page.navigate', { url: `${origin}/` }, page.sessionId);
  await page.until("!!window.__shellReady && document.querySelector('meta[name=\"fdfpv-version\"]')?.content === 'feedfacecafe'", 300000);
  check('the stamped preview boots on a host that is not the game\'s', true, origin);
  await page.until("window.__ui.screen === 'title'", 60000);
  const account = await page.evaluate(`import('${origin}/src/share/account.js?v=feedfacecafe').then((m) => ({ available: m.accountsAvailable(), mayPlay: m.mayPlay() }))`);
  check('no accounts there, and the pilot may fly without signing in', !account.available && account.mayPlay, JSON.stringify(account));
  await page.sleep(5000);
  const api = asked.filter((u) => u.startsWith(API_ORIGIN));
  check(`no request to ${API_ORIGIN}`, api.length === 0 && asked.length > 50, `${asked.length} requests, ${api.length} to the API: ${api.slice(0, 3).join(' ')}`);
  if (page.errors.length) {
    console.log(`  note  ${page.errors.length} page errors, first: ${page.errors.slice(0, 3).join(' | ')}`);
  }
} finally {
  await page.close();
  server.close();
  await rm(site, { recursive: true, force: true });
  await rm(empty, { recursive: true, force: true });
}

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
