/*
 * gallery-admin-check.js: the admin page's Livery gallery section
 * (docs/LIVERY-GALLERY.md) against a local tracks server, pressed with a
 * real pointer.
 *
 *   node scripts/gallery-admin-check.js [outdir]
 *
 * One livery is reported three times, so it hides itself. The admin page,
 * signed in with ADMIN_SECRET as the bearer (Google's button mocked, the
 * production API origin pointed at the local server), lists it Hidden;
 * Show puts it back in the public list and clears its reports; Hide takes
 * it out again.
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
import { mkdtempSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { API_ORIGIN } from '../src/share/api.js';
import { GOOGLE_CLIENT_ID } from '../src/share/account.js';
import { encodeLivery } from '../configs/paint.js';
import { startTracks } from '../tracks-api/node.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = resolve(process.argv[2] || join(root, 'tmp', 'gallery-admin-check'));
await mkdir(outDir, { recursive: true });
const RS256 = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
const ADMIN = 'gallery-admin-check-secret';

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${!ok && detail ? `  (${detail})` : ''}`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
}

const google = await crypto.subtle.generateKey(RS256, true, ['sign', 'verify']);
const jwk = await crypto.subtle.exportKey('jwk', google.publicKey);
const jwks = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ keys: [{ kty: 'RSA', kid: 'k1', alg: 'RS256', n: jwk.n, e: jwk.e }] }));
});
await new Promise((r) => jwks.listen(0, '127.0.0.1', r));
async function idToken(sub) {
  const b64 = (x) => Buffer.from(x).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' }));
  const body = b64(JSON.stringify({ iss: 'https://accounts.google.com', aud: GOOGLE_CLIENT_ID, sub, iat: now, exp: now + 3600, email: 'pilot@example.com' }));
  const sig = new Uint8Array(await crypto.subtle.sign(RS256, google.privateKey, new TextEncoder().encode(`${head}.${body}`)));
  return `${head}.${body}.${b64(sig)}`;
}

const tracks = await startTracks({
  db: join(mkdtempSync(join(tmpdir(), 'fdfpv-gallery-admin-')), 'tracks.db'), port: 0, adminSecret: ADMIN,
  googleClientId: GOOGLE_CLIENT_ID, accountsSecret: 'gallery-admin-check', googleJwksUrl: `http://127.0.0.1:${jwks.address().port}/certs`,
});
const T = `http://127.0.0.1:${tracks.port}`;

async function api(method, path, body, session) {
  const res = await fetch(`${T}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(session ? { authorization: `Bearer ${session}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.json();
}
async function account(sub, callsign) {
  const { session } = await api('POST', '/api/account/google', { credential: await idToken(sub) });
  await api('PUT', '/api/account/callsign', { callsign }, session);
  return session;
}

const painter = await account('painter', 'Painter');
const entry = (await api('POST', '/api/account/gallery', { code: encodeLivery('timber1500', 'Reported Timber', {}) }, painter)).entry;
for (const who of ['r1', 'r2', 'r3']) {
  /* eslint-disable-next-line no-await-in-loop */
  await api('POST', `/api/account/gallery/${entry.id}/report`, undefined, await account(who, who.toUpperCase()));
}
const listed = async () => (await api('GET', '/api/gallery?family=timber1500')).items.some((x) => x.id === entry.id);
check('three reports hid it before the page opens', !(await listed()));

/* The page's API origin is production's: its requests are sent to the
 * local server instead, and Google's script is never fetched, its button
 * handing over ADMIN_SECRET, which the admin routes take as a bearer. */
const seed = [`(() => {
  const real = window.fetch.bind(window);
  window.fetch = (url, init) => real(String(url).replace(${JSON.stringify(API_ORIGIN)}, ${JSON.stringify(T)}), init);
  const append = HTMLHeadElement.prototype.append;
  HTMLHeadElement.prototype.append = function (...nodes) {
    const gis = nodes.find((n) => n.tagName === 'SCRIPT' && /accounts\\.google\\.com/.test(n.src));
    if (!gis) {
      return append.apply(this, nodes);
    }
    window.google = { accounts: { id: {
      initialize(o) { window.__gis = o; },
      renderButton(el) {
        const b = document.createElement('button');
        b.id = 'gis-mock';
        b.textContent = 'Google (mock)';
        b.onclick = () => window.__gis.callback({ credential: ${JSON.stringify(ADMIN)} });
        el.append(b);
      },
      disableAutoSelect() {},
    } } };
    setTimeout(() => gis.onload(), 0);
    return undefined;
  };
})();`];

async function shot(page, name) {
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 80, captureBeyondViewport: false }, page.sessionId);
  await writeFile(join(outDir, `${name}.jpg`), Buffer.from(data, 'base64'));
}

/* A real pointer press. page.click waits for the game's loading screen,
 * which the admin page does not have. */
async function press(page, selector) {
  const at = await page.evaluate(`(() => {
    const b = document.querySelector(${JSON.stringify(selector)});
    if (!b) { return null; }
    b.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!at) {
    return false;
  }
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    /* eslint-disable-next-line no-await-in-loop */
    await page.cdp.send('Input.dispatchMouseEvent', { type, ...at, button: 'left', clickCount: 1 }, page.sessionId);
  }
  return true;
}

const galleryText = "(document.getElementById('gallery') || {}).textContent || ''";

async function main() {
  const page = await openPage({ root, url: '/admin.html', width: 1400, height: 900, seed });
  try {
    await page.until("Boolean(document.querySelector('#gis-mock'))", 30000);
    check('pressed Google (mock)', await press(page, '#gis-mock'));
    await page.until(`(${galleryText}).includes('Reported Timber')`, 20000);
    const text = await page.evaluate(galleryText);
    check('the hidden livery is listed with its publisher, reports and state', /Reported Timber.*timber1500.*Painter.*3.*Hidden/.test(text), text);
    await page.evaluate("document.getElementById('gallery').scrollIntoView({ block: 'center' }); true");
    await shot(page, 'admin-gallery-hidden');
    check('pressed Show', await press(page, '#gallery td.acts button'));
    await page.until(`(${galleryText}).includes('Nothing reported.')`, 10000);
    check('Show puts it back in the public list', await listed());
    await api('POST', `/api/account/gallery/${entry.id}/report`, undefined, await account('r4', 'R4'));
    await press(page, '#refresh');
    await page.until(`(${galleryText}).includes('Shown')`, 10000);
    check('its reports were cleared: one more lists it Shown with 1 report', /Reported Timber.*1.*Shown/.test(await page.evaluate(galleryText)), await page.evaluate(galleryText));
    check('pressed Hide', await press(page, '#gallery td.acts button'));
    await page.until(`(${galleryText}).includes('Hidden')`, 10000);
    check('Hide takes it out of the public list', !(await listed()));
    await shot(page, 'admin-gallery-hidden-again');
    const f = page.errors.filter((e) => !e.startsWith('network:'));
    check('no console error or uncaught exception', f.length === 0, f.slice(0, 3).join(' | '));
  } catch (e) {
    check(`the check ran to the end: ${e.message}`, false, page.errors.slice(0, 3).join(' | '));
  } finally {
    await page.close();
    jwks.close();
    await tracks.stop();
  }
  console.log(`\n${passed} passed, ${failed} failed; pictures in ${outDir}`);
  process.exit(failed ? 1 : 0);
}

await main();
