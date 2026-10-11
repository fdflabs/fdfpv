/*
 * gallery-check.js: the livery gallery (docs/LIVERY-GALLERY.md) in the real
 * shell against a local tracks server, every button pressed with a real
 * pointer.
 *
 *   node scripts/gallery-check.js [outdir]
 *
 * Another pilot (Painter) has published two Timber liveries through the
 * API. The page is signed in as Pilot. The hangar's Colours tab, Gallery
 * page: both entries listed newest first with the publisher's callsign;
 * Like counts on the server and turns to Liked; Most liked puts the liked
 * one first; Report reaches the server; Wear puts the livery on the plane
 * and into My liveries; Publish then puts Pilot's own entry up, with
 * Remove and no Like on it; Remove takes it down. Pictures of the page go
 * to the out directory.
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
import { SETTINGS_KEY } from '../src/ui/ui.js';
import { GOOGLE_CLIENT_ID } from '../src/share/account.js';
import { ACCOUNT_KEY } from '../src/share/pilot.js';
import { encodeLivery } from '../configs/paint.js';
import { startTracks } from '../tracks-api/node.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = resolve(process.argv[2] || join(root, 'tmp', 'gallery-check'));
await mkdir(outDir, { recursive: true });
const RS256 = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
const ADMIN = 'gallery-check-admin';

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
  db: join(mkdtempSync(join(tmpdir(), 'fdfpv-gallery-')), 'tracks.db'), port: 0, adminSecret: ADMIN,
  googleClientId: GOOGLE_CLIENT_ID, accountsSecret: 'gallery-check-secret', googleJwksUrl: `http://127.0.0.1:${jwks.address().port}/certs`,
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
const lime = (await api('POST', '/api/account/gallery', { code: encodeLivery('timber1500', 'Lime Timber', { scheme: 'timber_x' }) }, painter)).entry;
const plain = (await api('POST', '/api/account/gallery', { code: encodeLivery('timber1500', 'Plain Timber', {}) }, painter)).entry;
const pilot = await account('pilot', 'Pilot');
const me = await api('GET', '/api/account', undefined, pilot);

const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, {
    airframeAsked: true, fpsCap: 0, graphics: 'low', map: 'swiss2', freestyleMap: 'swiss2',
    progress: { v: 1, xp: 0, courses: {}, challenges: {}, seen: {}, unlockAll: true },
  });
  localStorage.setItem(k, JSON.stringify(s));
  if (!localStorage.getItem(${JSON.stringify(ACCOUNT_KEY)})) {
    localStorage.setItem(${JSON.stringify(ACCOUNT_KEY)}, ${JSON.stringify(JSON.stringify({ session: pilot, callsign: 'Pilot', id: me.id }))});
  }
} catch (e) { /* storage refused; the checks below will say so */ }`];

async function shot(page, name) {
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 }, page.sessionId);
  await writeFile(join(outDir, `${name}.jpg`), Buffer.from(data, 'base64'));
}

/* A button that is drawn again after each answer slides in, and a click
 * on a moving one lands on its neighbour: pressed once it stood still for
 * three reads in a row. */
async function press(page, selector) {
  await page.until(`Boolean(document.querySelector(${JSON.stringify(selector)}))`, 20000);
  let last = '';
  let same = 0;
  for (let i = 0; i < 100 && same < 2; i += 1) {
    /* eslint-disable-next-line no-await-in-loop */
    const r = await page.evaluate(`(() => { const b = document.querySelector(${JSON.stringify(selector)}); if (!b) return 'none'; b.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = b.getBoundingClientRect(); return [r.left, r.top, r.width, getComputedStyle(b).opacity].join(); })()`);
    same = r === last && r !== 'none' ? same + 1 : 0;
    last = r;
    /* eslint-disable-next-line no-await-in-loop */
    await page.sleep(120);
  }
  check(`pressed ${selector}`, await page.click(selector));
}

const key = (k) => `.hangar [data-key="${k}"]`;
const rowText = (id) => `(document.querySelector('.hangar [data-gallery="${id}"]') || {}).textContent || ''`;

async function main() {
  const url = `/index.html?tracks=${encodeURIComponent(T)}`;
  const page = await openPage({ root, url, width: 1600, height: 900, seed });
  try {
    await page.until('!!window.__shellReady', 300000);
    await page.evaluate('window.__ui.openCraftRow(false); true');
    await page.until('window.__ui.carousel.isOpen', 10000);
    await page.evaluate("window.__ui.carousel.setFilter('all'); window.__ui.carousel.goTo(window.__ui.carousel.ids.indexOf('timber1500')); true");
    await page.tap('KeyC');
    await page.until("window.__ui.hangar.isOpen && window.__ui.hangar.id === 'timber1500'", 20000);
    await press(page, key('tab-colours'));
    await press(page, key('page-gallery'));
    await page.until(`(${rowText(lime.id)}).includes('Painter') && (${rowText(plain.id)}).length > 0`, 20000);
    const order = await page.evaluate("[...document.querySelectorAll('.hangar [data-gallery]')].map((r) => r.dataset.gallery)");
    check('both entries listed, newest first', JSON.stringify(order) === JSON.stringify([plain.id, lime.id]), JSON.stringify(order));
    check('each names its publisher and its likes', (await page.evaluate(rowText(lime.id))).includes('by Painter, 0 likes'), await page.evaluate(rowText(lime.id)));
    await shot(page, 'gallery-list');

    await press(page, key(`glike-${lime.id}`));
    await page.until(`(${rowText(lime.id)}).includes('1 like') && (${rowText(lime.id)}).includes('Liked')`, 10000);
    const listed = await api('GET', '/api/gallery?family=timber1500&sort=liked');
    check('the like reached the server and Most liked has it first', listed.items[0].id === lime.id && listed.items[0].likes === 1, JSON.stringify(listed.items.map((x) => [x.name, x.likes])));
    await press(page, key('sort-liked'));
    await page.until(`document.querySelector('.hangar [data-gallery]') && document.querySelector('.hangar [data-gallery]').dataset.gallery === ${JSON.stringify(lime.id)}`, 10000);
    check('Most liked puts it first on the page', true);

    await press(page, key(`greport-${plain.id}`));
    await page.until(`!document.querySelector('.hangar [data-key="greport-${plain.id}"]')`, 10000);
    const reported = await api('GET', '/api/admin/gallery', undefined, ADMIN);
    check('the report reached the admin list', reported.items.some((x) => x.id === plain.id && x.reports === 1), JSON.stringify(reported));

    await press(page, key(`gwear-${lime.id}`));
    await page.until("window.__ui.hangar.entry && window.__ui.hangar.entry.scheme === 'timber_x'", 10000);
    const lib = await page.evaluate("window.__ui.hangar.shop.library.map((x) => x.name)");
    check('Wear puts it on the plane and into My liveries', lib.includes('Lime Timber'), JSON.stringify(lib));
    await page.until("(document.querySelector('.hangar .gallery-note') || {}).textContent === 'Wearing \"Lime Timber\". It is in your liveries now.'", 10000);
    await shot(page, 'gallery-worn');

    await press(page, key('gallery-publish'));
    await page.until("[...document.querySelectorAll('.hangar [data-gallery]')].some((r) => r.textContent.includes('Pilot'))", 10000);
    const mine = await page.evaluate("[...document.querySelectorAll('.hangar [data-gallery]')].find((r) => r.textContent.includes('Pilot')).dataset.gallery");
    const own = await page.evaluate(`[...document.querySelectorAll('.hangar [data-gallery="${mine}"] [data-key]')].map((b) => b.dataset.key.replace(/-.*/, ''))`);
    check('Publish puts the pilot\'s own entry up, with Remove and no Like or Report', JSON.stringify(own) === JSON.stringify(['gwear', 'gremove']), JSON.stringify(own));
    await shot(page, 'gallery-published');
    await press(page, key(`gremove-${mine}`));
    await page.until(`!document.querySelector('.hangar [data-gallery="${mine}"]')`, 10000);
    const after = await api('GET', '/api/gallery?family=timber1500');
    check('Remove takes it off the server', !after.items.some((x) => x.id === mine) && after.items.length === 2);

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
