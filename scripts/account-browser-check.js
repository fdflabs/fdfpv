/*
 * account-browser-check.js: the optional Google sign-in in the real shell,
 * with Google Identity Services mocked, against local servers.
 *
 *   node scripts/account-browser-check.js [/path/to/fdfpv-leaderboard]
 *
 * Starts, on this machine: a stand in for Google's keys (an RS256 key made
 * here, served as a JWKS), the tracks server with sign-in on
 * (tracks-api/node.js), the rooms server asking it for callsigns
 * (edge/rooms/node.js), and the board from a checkout of
 * fdfpv-leaderboard (its file store, in a scratch directory). Then headless
 * pages through tests/lib/page.js, each with GIS replaced by a button that
 * hands the page a token signed by that key:
 *
 *   A signs in, brings its pilot in, picks a callsign, and its progress
 *     goes up; the board refuses the callsign to any other key.
 *   B, a guest, joins A's room and sees A's callsign; A sees B's picker
 *     name; B's Pilot screen still offers sign in and B flies as before.
 *   C, a second computer, signs in to the same account and gets A's pilot
 *     key and A's progress; signing out gives C its own key back.
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
import { SETTINGS_KEY } from '../src/ui/ui.js';
import { GOOGLE_CLIENT_ID } from '../src/share/account.js';
import { ACCOUNT_KEY } from '../src/share/pilot.js';
import { KEY_STORAGE, createIdentity, memoryStorage, nameClaimMessage } from '../src/share/identity.js';
import { startTracks } from '../tracks-api/node.js';
import { startRooms } from '../edge/rooms/node.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const boardDir = resolve(process.argv[2] || join(root, '..', 'fdfpv-leaderboard'));
const RS256 = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };

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

if (!existsSync(join(boardDir, 'src', 'server.js')) || !existsSync(join(boardDir, 'vendor', 'fdfpv', 'src'))) {
  console.error(`account-browser-check: no board checkout with vendor/fdfpv at ${boardDir}`);
  process.exit(2);
}

const scratch = mkdtempSync(join(tmpdir(), 'fdfpv-account-browser-'));

/* Google, stood in for. */
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
  db: join(scratch, 'tracks.db'), port: 0, googleClientId: GOOGLE_CLIENT_ID, accountsSecret: 'browser-check-secret',
  googleJwksUrl: `http://127.0.0.1:${jwks.address().port}/certs`,
});
const T = `http://127.0.0.1:${tracks.port}`;
const rooms = await startRooms({ db: join(scratch, 'rooms.db'), port: 0, accountsOrigin: T });
const R = `http://127.0.0.1:${rooms.port}`;

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
console.log(`tracks ${T}, rooms ${R}, board ${B} (${boardDir})`);

/* GIS replaced: renderButton draws a button that hands the page
 * window.__credential, the way Google's calls back with a credential. */
const MOCK_GIS = `window.google = { accounts: { id: {
  initialize(o) { window.__gis = o; },
  renderButton(el) {
    const b = document.createElement('button');
    b.id = 'gis-mock';
    b.textContent = 'Google (mock)';
    b.onclick = () => window.__gis.callback({ credential: window.__credential });
    el.append(b);
  },
} } };`;

function seed(extra = {}) {
  const s = { graphics: 'low', airframeAsked: true, map: 'swiss2', freestyleMap: 'swiss2', ...extra };
  return [MOCK_GIS, `try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    if (!s.accountSeeded) {
      Object.assign(s, ${JSON.stringify(s)}, { accountSeeded: true });
      localStorage.setItem(k, JSON.stringify(s));
    }
  } catch (e) { /* storage refused */ }`];
}

const url = `/index.html?tracks=${encodeURIComponent(T)}&rooms=${encodeURIComponent(R)}&board=${encodeURIComponent(B)}`;
const dialogTitle = "(() => { const d = document.querySelector('.name-dialog'); return d && !d.hidden ? (d.querySelector('h2') || {}).textContent || '' : ''; })()";
const pilotRows = "(() => { window.__ui.show('pilot'); return window.__ui.items().map((r) => `${r.label} ${r.value ?? ''}`).join(' | '); })()";
/* The title's own chip (src/ui/ui.js signinChip): '' when the DOM has none,
 * so a stale selector fails the check rather than throwing. */
const chipText = "(document.querySelector('.signin-chip') || {}).textContent || ''";
const chipVisible = "Boolean(document.querySelector('.signin-chip')) && !document.querySelector('.signin-chip').hidden";
const account = (p) => p.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(ACCOUNT_KEY)}) || 'null')`);
const pilotKey = (p) => p.evaluate(`(JSON.parse(localStorage.getItem(${JSON.stringify(KEY_STORAGE)}) || 'null') || {}).publicRaw || null`);

async function signInThrough(p, sub, carry) {
  await p.evaluate(`window.__credential = ${JSON.stringify(await idToken(sub))}; window.__ui.onAction('accountsignin'); true`);
  await p.until("Boolean(document.querySelector('#gis-mock'))", 15000);
  await p.evaluate("document.querySelector('#gis-mock').click(); true");
  await p.until(`${dialogTitle}.length > 0 && !document.querySelector('#gis-mock')`, 15000);
  const asked = await p.evaluate(dialogTitle);
  await p.evaluate(`(() => { const bs = [...document.querySelectorAll('.name-dialog .name-dialog-btn')]; bs[${carry ? 0 : 1}].click(); return true; })()`);
  return asked;
}

const a = await openPage({ root, url, width: 1280, height: 720, seed: seed({ progress: { v: 1, xp: 420, courses: { 'track:trk-aaaa0001': true }, challenges: {}, seen: {}, casual: {}, unlockAll: false } }) });
const b = await openPage({ root, url, width: 1280, height: 720, seed: seed() });
let c = null;
try {
  for (const p of [a, b]) {
    await p.until('window.__shellReady === true', 300000);
  }
  console.log('page A signs in');
  check('a guest\'s Pilot screen offers Sign in with Google', /Sign in with Google/.test(await a.evaluate(pilotRows)));
  const aGuestKey = await pilotKey(a);
  const asked = await signInThrough(a, 'google-sub-ada', true);
  check('a first sign in asks before bringing this computer\'s pilot in', /Bring this computer/.test(asked), asked);
  await a.until(`${dialogTitle} === 'Choose your callsign'`, 15000);
  await a.evaluate("(() => { const f = document.querySelector('.name-dialog-input'); f.value = 'Maverick'; document.querySelector('.name-dialog .name-dialog-btn.on').click(); return true; })()");
  await a.until(`(JSON.parse(localStorage.getItem(${JSON.stringify(ACCOUNT_KEY)}) || '{}').callsign === 'Maverick')`, 15000);
  const acc = await account(a);
  check('the callsign is claimed and kept on this computer', acc && acc.callsign === 'Maverick');
  const aKey = await pilotKey(a);
  check('this computer\'s pilot key became the account\'s', Boolean(aKey) && acc.publicKey === aKey && (!aGuestKey || aGuestKey === aKey));
  let res = await fetch(`${T}/api/account`, { headers: { authorization: `Bearer ${acc.session}` } }).then((r) => r.json());
  check('the accounts server has it', res.callsign === 'Maverick' && res.publicKey === aKey, JSON.stringify(res));
  const squatter = createIdentity(memoryStorage());
  const sq = await squatter.signBytes(nameClaimMessage('maverick'));
  res = await fetch(`${B}/api/pilots`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'maverick', ...sq }) });
  check('and the board refuses the name to any other key', res.status === 403, `${res.status}`);
  check('Pilot now shows the callsign and Sign out', /Maverick/.test(await a.evaluate(pilotRows)) && /Sign out/.test(await a.evaluate(pilotRows)));
  check('and the name lap times and tracks are posted under is the callsign',
    (await a.evaluate("import('/src/share/pilot.js').then((m) => m.readPilotName())")) === 'Maverick');
  let held = null;
  for (let i = 0; i < 40 && !(held && held.data && held.data.progress); i += 1) {
    /* eslint-disable-next-line no-await-in-loop */
    held = (await fetch(`${T}/api/account/progress`, { headers: { authorization: `Bearer ${acc.session}` } }).then((r) => r.json())).progress;
    /* eslint-disable-next-line no-await-in-loop */
    await a.sleep(250);
  }
  check('its progress went up to the account', held && held.data.progress && held.data.progress.xp === 420, JSON.stringify(held && held.data.progress));

  console.log('a guest in A\'s room');
  const code = await a.evaluate('window.__roomCreate()');
  await a.until("window.__rooms().phase === 'open'", 30000);
  await b.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  for (const p of [a, b]) {
    await p.until("window.__rooms().phase === 'open' && window.__rooms().peers.length === 1", 30000);
  }
  const rb = await b.evaluate('window.__rooms()');
  const ra = await a.evaluate('window.__rooms()');
  check('the guest sees the signed in pilot by callsign', rb.peers[0].name === 'Maverick', rb.peers[0].name);
  check('the signed in pilot sees the guest by picker name', /^\S+ \S+ \d\d$/.test(ra.peers[0].name) && ra.peers[0].name !== 'Maverick', ra.peers[0].name);
  check('the guest is not signed in and still offered it', !(await account(b)) && /Sign in with Google/.test(await b.evaluate(pilotRows)));

  console.log('the title screen offers it too, and signs in through the chip');
  await b.evaluate("window.__ui.show('title'); true");
  check('the title shows a Sign in with Google chip', /Sign in with Google/.test(await b.evaluate(chipText)) && (await b.evaluate(chipVisible)));
  await b.evaluate(`window.__credential = ${JSON.stringify(await idToken('google-sub-chip'))}; document.querySelector('.signin-chip').click(); true`);
  await b.until("Boolean(document.querySelector('#gis-mock'))", 15000);
  await b.evaluate("document.querySelector('#gis-mock').click(); true");
  await b.until(`${dialogTitle}.length > 0 && !document.querySelector('#gis-mock')`, 15000);
  /* A brand new Google sub has no account identity yet, so the first sign
   * in dialog (the same one A saw) comes first; a returning one would skip
   * straight to the callsign prompt. */
  if ((await b.evaluate(dialogTitle)) !== 'Choose your callsign') {
    await b.evaluate("(() => { document.querySelectorAll('.name-dialog .name-dialog-btn')[1].click(); return true; })()");
    await b.until(`${dialogTitle} === 'Choose your callsign'`, 15000);
  }
  await b.evaluate("(() => { const f = document.querySelector('.name-dialog-input'); f.value = 'Chiprunner'; document.querySelector('.name-dialog .name-dialog-btn.on').click(); return true; })()");
  await b.until(`(${chipText}) === 'Chiprunner'`, 15000);
  check('clicking the title chip through sign in leaves the callsign on the chip', (await b.evaluate(chipText)) === 'Chiprunner');

  const bErrors = b.errors.filter((e) => !e.startsWith('network:'));
  check('and nothing on the guest\'s page broke', bErrors.length === 0, bErrors.slice(0, 3).join(' | '));
  await b.close();

  console.log('page C, a second computer');
  c = await openPage({ root, url, width: 1280, height: 720, seed: seed() });
  await c.until('window.__shellReady === true', 300000);
  const askedC = await signInThrough(c, 'google-sub-ada', true);
  check('a second computer is asked before its own pilot is added', /Add this computer/.test(askedC), askedC);
  await c.until(`(JSON.parse(localStorage.getItem(${JSON.stringify(ACCOUNT_KEY)}) || '{}').callsign === 'Maverick')`, 15000);
  check('it signs in as the same callsign with no picker', (await c.evaluate(dialogTitle)) !== 'Choose your callsign');
  check('and signs with the account\'s pilot key', (await pilotKey(c)) === aKey);
  const cGuest = await c.evaluate("(JSON.parse(JSON.parse(localStorage.getItem('webfpv.pilot.key.guest.v1') || 'null') || 'null') || {}).publicRaw || null");
  check('its own key set aside, not lost', Boolean(cGuest) && cGuest !== aKey);
  await c.until(`(JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}) || '{}').progress || {}).xp === 420`, 20000).catch(() => {});
  const cProgress = await c.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})).progress`);
  check('and has the account\'s progress', cProgress && cProgress.xp === 420 && cProgress.courses['track:trk-aaaa0001'] === true, JSON.stringify(cProgress));
  check('the room would show the callsign here too', (await c.evaluate("window.__ui.show('friends'); document.body.textContent.includes('Maverick')")) === true);
  await c.evaluate("window.__ui.show('pilot'); window.__ui.onAction('accountsignout'); true");
  await c.until(`!localStorage.getItem(${JSON.stringify(ACCOUNT_KEY)})`, 15000);
  await c.sleep(300);
  const cAfter = await pilotKey(c);
  check('signing out gives the computer its own pilot key back', Boolean(cGuest) && cAfter === cGuest, `${cGuest} ${cAfter}`);
  res = await fetch(`${T}/api/account`, { headers: { authorization: `Bearer ${acc.session}` } });
  check('and leaves A signed in', res.status === 200);

  const errs = [...a.errors, ...c.errors].filter((e) => !e.startsWith('network:'));
  check('no page error', errs.length === 0, errs.slice(0, 4).join(' | '));
} finally {
  await a.close();
  await b.close().catch(() => {});
  if (c) {
    await c.close();
  }
  board.kill('SIGTERM');
  await rooms.stop();
  await tracks.stop();
  jwks.close();
  rmSync(scratch, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
