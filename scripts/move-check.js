/*
 * move-check.js: a guest's move to the game's own domain, in Chromium,
 * between the two real origins.
 *
 *     node scripts/move-check.js      (npm run move:check)
 *
 * Chromium is told that paraguayandronecombatsimulator.com and
 * fdflabs.github.io are this machine (--host-resolver-rules, every other
 * name unresolvable so nothing reaches a live server), and one local HTTPS
 * server with a throwaway certificate answers for both: the domain serves
 * this checkout, as GitHub Pages will, with Pages' CORS header; the old
 * origin serves deploy/landing-move.html at /fdfpv-landing/move/, as
 * fdflabs/fdfpv-landing will. Then, in one browser profile:
 *
 *   1. storage is written on the old origin: a few of the game's keys,
 *      a server override that must not go, another page's key that must
 *      not go, and a 1.2 MB key that makes the pack three parts;
 *   2. the domain is opened at /?map=swiss2 with nothing stored: it goes to
 *      the sender, comes back a part at a time, and boots with the guest's
 *      storage, at the address it was opened at, with no fragment;
 *   3. opened again: no bounce;
 *   4. a link carrying a pack nobody asked for: ignored, fragment gone.
 *
 * Local, not in CI: it drives Chromium. src/share/move.js's logic is also
 * held in Node by npm run move:selftest, which CI runs.
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

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import https from 'node:https';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DOMAIN = 'paraguayandronecombatsimulator.com';
const OLD = 'fdflabs.github.io';
const LOAD_MS = 180000;

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.wasm', 'application/wasm'], ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'],
  ['.webp', 'image/webp'], ['.woff2', 'font/woff2'], ['.ico', 'image/x-icon'], ['.mp3', 'audio/mpeg'],
  ['.ogg', 'audio/ogg'], ['.opus', 'audio/ogg'], ['.webm', 'video/webm'], ['.glb', 'model/gltf-binary'], ['.bin', 'application/octet-stream'],
]);

const work = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'move-check-'));
const keyPath = join(work, 'key.pem');
const certPath = join(work, 'cert.pem');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', `/CN=${DOMAIN}`,
  '-addext', `subjectAltName=DNS:${DOMAIN},DNS:${OLD}`, '-keyout', keyPath, '-out', certPath], { stdio: 'ignore' });

const hits = { move: 0, missing: [] };
const server = https.createServer({ key: readFileSync(keyPath), cert: readFileSync(certPath) }, (req, res) => {
  const host = String(req.headers.host || '').replace(/:\d+$/, '');
  const url = new URL(req.url, `https://${host}`);
  if (host === OLD) {
    if (url.pathname === '/fdfpv-landing/move/') {
      if (req.method === 'GET') {
        hits.move += 1;
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'access-control-allow-origin': '*' });
      res.end(req.method === 'HEAD' ? undefined : readFileSync(join(root, 'deploy/landing-move.html')));
      return;
    }
    if (url.pathname === '/seed.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><link rel="icon" href="data:,"><title>old origin</title>');
      return;
    }
    hits.missing.push(`${OLD}${url.pathname}`);
    res.writeHead(404);
    res.end();
    return;
  }
  if (host !== DOMAIN) {
    res.writeHead(421);
    res.end();
    return;
  }
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^\/+/, '') || 'index.html';
  const path = join(root, rel.endsWith('/') ? `${rel}index.html` : rel);
  try {
    if (!path.startsWith(root) || !statSync(path).isFile()) {
      throw new Error('no');
    }
    res.writeHead(200, {
      'content-type': MIME.get(extname(path)) ?? 'application/octet-stream',
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : readFileSync(path));
  } catch (e) {
    hits.missing.push(url.pathname);
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { port } = server.address();

const page = await openPage({
  root,
  url: '/index.html?map=swiss2',
  args: [
    `--host-resolver-rules=MAP ${DOMAIN} 127.0.0.1:${port}, MAP ${OLD} 127.0.0.1:${port}, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`,
    '--ignore-certificate-errors',
  ],
  /* Headless Chromium says it is automated, and the receiver leaves
   * automation alone; this check is the one that wants the bounce. */
  seed: ["Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });"],
});

/* An address is not a name, so the resolver rules do not stop a request
 * to the VM's address (the old origin's stored rooms override below names
 * it). Blocked here, with the name: no request from this check reaches a
 * live server. */
await page.cdp.send('Network.enable', {}, page.sessionId);
await page.cdp.send('Network.setBlockedURLs', { urls: ['*129.151.39.48*', `*api.${DOMAIN}*`] }, page.sessionId);

const go = (url) => page.cdp.send('Page.navigate', { url }, page.sessionId);
const BIG = randomBytes(900000).toString('base64');

try {
  await page.loaded(LOAD_MS);
  console.log('1. the old origin');
  await go(`https://${OLD}/seed.html`);
  await page.until(`location.hostname === '${OLD}' && document.readyState === 'complete'`, 20000);
  await page.evaluate(`(() => {
    localStorage.setItem('webfpv.pilot.name', 'Ada');
    localStorage.setItem('webfpv.builds.v1', JSON.stringify({ v: 1, builds: [] }));
    localStorage.setItem('fdfpv.voice', JSON.stringify({ on: false }));
    localStorage.setItem('fdfpv.rooms', 'https://129.151.39.48');
    localStorage.setItem('another.fdflabs.page', 'x');
    localStorage.setItem('webfpv.movecheck.blob', ${JSON.stringify(BIG)});
    return localStorage.length;
  })()`);
  check('guest storage written on the old origin', await page.evaluate('localStorage.length') === 6);

  console.log('2. the domain, first visit');
  await go(`https://${DOMAIN}/?map=swiss2`);
  await page.until(`location.hostname === '${DOMAIN}' && !location.hash && document.getElementById('pdcs-loader') && document.getElementById('pdcs-loader').hidden`, LOAD_MS);
  const got = JSON.parse(await page.evaluate(`JSON.stringify({
    href: location.href,
    name: localStorage.getItem('webfpv.pilot.name'),
    builds: localStorage.getItem('webfpv.builds.v1'),
    voice: localStorage.getItem('fdfpv.voice'),
    rooms: localStorage.getItem('fdfpv.rooms'),
    other: localStorage.getItem('another.fdflabs.page'),
    blob: localStorage.getItem('webfpv.movecheck.blob'),
    marker: JSON.parse(localStorage.getItem('pdcs.move.v1') || 'null'),
  })`));
  check('the sender was asked once a part, three parts', hits.move === 3, String(hits.move));
  check('imported', got.marker && got.marker.result === 'imported', JSON.stringify(got.marker));
  check('the game\'s keys came over', got.name === 'Ada' && got.builds === JSON.stringify({ v: 1, builds: [] }));
  check('the 1.2 MB key, every byte', got.blob === BIG, String(got.blob && got.blob.length));
  check('the server override and the other page\'s key stayed behind', got.rooms === null && got.other === null);
  check('the voice setting came over', got.voice === JSON.stringify({ on: false }));
  check('at the address it was opened at, no fragment', got.href === `https://${DOMAIN}/?map=swiss2`, got.href);
  check('the game booted on it', await page.evaluate("document.getElementById('pdcs-loader').hidden") === true);

  console.log('3. the domain again');
  const before = hits.move;
  await go(`https://${DOMAIN}/`);
  await page.until(`location.hostname === '${DOMAIN}' && document.getElementById('pdcs-loader') && document.getElementById('pdcs-loader').hidden`, LOAD_MS);
  check('no bounce the second time', hits.move === before, String(hits.move - before));

  console.log('4. a pack nobody asked for');
  await page.evaluate("localStorage.setItem('webfpv.pilot.name', 'Mine')");
  const forged = await page.evaluate(`import('/src/share/move.js').then(async (m) => (await m.partsOf(await m.encodePack({ 'webfpv.pilot.name': 'Attacker' })))[0])`);
  await go(`https://${DOMAIN}/?map=swiss2#pdcs-move=${forged}`);
  await page.until(`location.hostname === '${DOMAIN}' && document.getElementById('pdcs-loader') && document.getElementById('pdcs-loader').hidden`, LOAD_MS);
  check('ignored: the name is the pilot\'s', await page.evaluate("localStorage.getItem('webfpv.pilot.name')") === 'Mine');
  check('and the fragment is gone from the address', await page.evaluate('location.hash') === '' && await page.evaluate('location.search') === '?map=swiss2');

  const errors = page.errors.filter((e) => !/ERR_NAME_NOT_RESOLVED|ERR_BLOCKED_BY_CLIENT|Failed to fetch|ERR_CONNECTION_REFUSED|WebSocket/.test(String(e)));
  check('nothing thrown', errors.length === 0, `${errors.slice(0, 4).join(' | ')} missing: ${hits.missing.join(' ')}`);
} finally {
  await page.close();
  server.close();
  rmSync(work, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
