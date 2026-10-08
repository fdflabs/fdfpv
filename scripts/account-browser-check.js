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
 *   B, not signed in, is asked into A's room: it is not seated, and the
 *     sign in panel says to sign in (nobody plays without an account,
 *     the owner, 2026-10-03). B signs in through the panel's button, and
 *     the room it was asked into follows: each sees the other's callsign.
 *   A, before C exists, makes two My Hangar builds (a Timber in the
 *     Timber X scheme, a 7 inch carrying the wide payload and the second
 *     pack), wears the 7 inch one, and puts the Striker on its turbojet;
 *     a sync takes all three up.
 *   C, a second computer, signs in to the same account and gets A's pilot
 *     key and A's progress, and both builds and the Striker's turbojet:
 *     each build chosen in the picker's My Hangar tab and flown wears and
 *     carries what A built, and the Striker flies on the turbojet's
 *     plant. C deletes the 7 inch build; after A's next sync it is gone
 *     from A too, and A's 7 inch, which was wearing it, flies the pilot's
 *     own again. Signing out gives C its own key back.
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
import { SETTINGS_KEY } from '../src/ui/ui.js';
import { BUILDS_KEY } from '../src/ui/builds.js';
import { airframeById } from '../configs/airframes.js';
import { coloursFor } from '../configs/liveries.js';
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
/* The sign in panel in the chip's place until there is a pilot
 * (src/ui/accountui.js), and what it says under itself. */
const panelVisible = "Boolean(document.querySelector('.signin-panel')) && !document.querySelector('.signin-panel').hidden";
const panelStatus = "(() => { const n = document.querySelector('.signin-panel-status'); return n && !n.hidden ? n.textContent : ''; })()";
const account = (p) => p.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(ACCOUNT_KEY)}) || 'null')`);
const pilotKey = (p) => p.evaluate(`(JSON.parse(localStorage.getItem(${JSON.stringify(KEY_STORAGE)}) || 'null') || {}).publicRaw || null`);

const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
const sorted = (o) => Object.fromEntries(Object.entries(o ?? {}).sort(([x], [y]) => x.localeCompare(y)));
const RECORD = 'webfpv.best.1a2b3c4d.16.80.timber1500';
const builds = (p) => p.evaluate(`(JSON.parse(localStorage.getItem(${JSON.stringify(BUILDS_KEY)}) || '{}').builds) || []`);
const JET = airframeById('striker2500').combat.propulsion.find((x) => x.id === 'jet');
const LOADOUT = { payload: 'wide', accessories: ['pack2'] };

/* A card in the picker, the way a pilot reaches it: the tabs with the
 * arrows until one lists it, then centred and chosen with Enter. */
async function choose(p, key) {
  await p.evaluate('window.__ui.openCraftRow(false); true');
  await p.until('window.__ui.carousel.isOpen', 10000);
  for (let i = 0; i < 6 && !(await p.evaluate(`window.__ui.carousel.ids.includes(${JSON.stringify(key)})`)); i += 1) {
    await p.tap('ArrowDown');
  }
  const at = await p.evaluate(`window.__ui.carousel.ids.indexOf(${JSON.stringify(key)})`);
  if (at < 0) {
    throw new Error(`no card ${key} in the picker`);
  }
  await p.evaluate(`window.__ui.carousel.goTo(${at}); true`);
  await p.tap('Enter');
  await p.until('!window.__ui.carousel.isOpen', 10000);
}

/* Flown, then Quit to title, which ends the run so the next Fly seats
 * what the picker chose: what the craft in the air was. */
async function fly(p) {
  await p.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await p.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  await p.until('window.__craftPaint().id === window.__craft().run', 60000).catch(() => {});
  await p.sleep(500);
  const got = await p.evaluate('({ paint: window.__craftPaint(), craft: window.__craft() })');
  await p.tap('Escape');
  await p.until("window.__ui.screen === 'paused'", 10000);
  await p.evaluate("window.__ui.onAction('title'); window.__ui.show('title'); true");
  await p.until("window.__craftState().mode === 'title'", 30000);
  return got;
}

async function signInThrough(p, sub, carry) {
  await p.evaluate(`window.__credential = ${JSON.stringify(await idToken(sub))}; window.__ui.onAction('accountsignin'); true`);
  await p.until("Boolean(document.querySelector('.signin-panel #gis-mock'))", 15000);
  await p.evaluate("document.querySelector('.signin-panel #gis-mock').click(); true");
  await p.until(`${dialogTitle}.length > 0`, 15000);
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

  console.log('A builds My Hangar and puts the Striker on its turbojet');
  /* What the hangar's Save to My Hangar and the Loadout tab call
   * (src/ui/ui.js addBuild, setStockLoadout); scripts/my-hangar-check.js
   * drives the hangar itself. */
  const made = await a.evaluate(`import('/src/ui/builds.js').then((m) => {
    const ui = window.__ui;
    const bush = ui.addBuild('Bush', 'timber1500', m.normaliseFit('timber1500', { livery: { scheme: 'timber_x' } }));
    const range = ui.addBuild('Long range', '7inch', m.normaliseFit('7inch', { combat: ${JSON.stringify(LOADOUT)} }));
    ui.wearBuild(range);
    ui.persistSettings();
    ui.setStockLoadout('striker2500', { payload: 'standard', accessories: [], propulsion: 'jet' });
    return { bush: bush.id, range: range.id };
  })`);
  /* A best lap as src/game/race.js writes it: a key from before records
   * synced, which the next sync must carry up (src/share/records.js). */
  await a.evaluate(`localStorage.setItem(${JSON.stringify(RECORD)}, '41234'); true`);
  await a.evaluate('window.__accountSync()');
  held = (await fetch(`${T}/api/account/progress`, { headers: { authorization: `Bearer ${acc.session}` } }).then((r) => r.json())).progress;
  check('A\'s best lap went up to the account', held.data.records && held.data.records[RECORD] === 41234, JSON.stringify(held.data.records));
  check('both builds and the Striker\'s turbojet went up to the account',
    held.data.builds && held.data.builds[made.bush] && held.data.builds[made.range] && held.data.combat && held.data.combat.striker2500.propulsion === 'jet'
    && Number.isFinite(held.stamps[`builds/${made.bush}`]),
    JSON.stringify({ builds: Object.keys(held.data.builds || {}), combat: held.data.combat }));
  check('which build A wears stays A\'s, and the stock 7 inch synced is the pilot\'s own',
    !('buildFits' in held.data) && !(held.data.combat && held.data.combat['7inch']), JSON.stringify(held.data.combat));

  console.log('a pilot not signed in, asked into A\'s room');
  const code = await a.evaluate('window.__roomCreate()');
  await a.until("window.__rooms().phase === 'open'", 30000);
  await b.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  await b.sleep(1500);
  check('is not seated, and the sign in panel says to sign in',
    (await b.evaluate("window.__rooms().phase")) === 'idle' && (await b.evaluate(panelStatus)) === 'Sign in with Google to fly.',
    JSON.stringify({ phase: await b.evaluate("window.__rooms().phase"), status: await b.evaluate(panelStatus) }));
  check('and is offered the sign in in Pilot too', !(await account(b)) && /Sign in with Google/.test(await b.evaluate(pilotRows)));
  await b.evaluate("window.__ui.show('title'); true");

  console.log('it signs in through the panel, and the room it was asked into follows');
  check('the title shows the panel and no pilot chip', (await b.evaluate(panelVisible)) && !(await b.evaluate(chipVisible)));
  await b.evaluate(`window.__credential = ${JSON.stringify(await idToken('google-sub-chip'))}; true`);
  await b.until("Boolean(document.querySelector('.signin-panel #gis-mock'))", 15000);
  await b.evaluate("document.querySelector('.signin-panel #gis-mock').click(); true");
  await b.until(`${dialogTitle}.length > 0`, 15000);
  /* A brand new Google sub has no account identity yet, so the first sign
   * in dialog (the same one A saw) comes first; a returning one would skip
   * straight to the callsign prompt. */
  if ((await b.evaluate(dialogTitle)) !== 'Choose your callsign') {
    await b.evaluate("(() => { document.querySelectorAll('.name-dialog .name-dialog-btn')[1].click(); return true; })()");
    await b.until(`${dialogTitle} === 'Choose your callsign'`, 15000);
  }
  await b.evaluate("(() => { const f = document.querySelector('.name-dialog-input'); f.value = 'Chiprunner'; document.querySelector('.name-dialog .name-dialog-btn.on').click(); return true; })()");
  await b.until(`(${chipText}) === 'Chiprunner'`, 15000);
  check('signing in leaves the callsign on the chip, in place of the panel', (await b.evaluate(chipText)) === 'Chiprunner' && !(await b.evaluate(panelVisible)));
  for (const p of [a, b]) {
    await p.until("window.__rooms().phase === 'open' && window.__rooms().peers.length === 1", 30000);
  }
  const rb = await b.evaluate('window.__rooms()');
  const ra = await a.evaluate('window.__rooms()');
  check('then it is in the room, and sees the other pilot by callsign', rb.code === code && rb.peers[0].name === 'Maverick', rb.peers[0].name);
  check('and the other pilot sees it by its callsign', ra.peers[0].name === 'Chiprunner', ra.peers[0].name);

  const bErrors = b.errors.filter((e) => !e.startsWith('network:'));
  check('and nothing on its page broke', bErrors.length === 0, bErrors.slice(0, 3).join(' | '));
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
  await c.evaluate("window.__ui.show('title'); true");

  console.log('C finds A\'s hangar, and flies it');
  await c.until(`((JSON.parse(localStorage.getItem(${JSON.stringify(BUILDS_KEY)}) || '{}').builds) || []).length === 2`, 20000).catch(() => {});
  const cBuilds = await builds(c);
  check('both builds arrived, named as A named them', same(cBuilds.map((x) => x.name).sort(), ['Bush', 'Long range']) && same(cBuilds.map((x) => x.id).sort(), [made.bush, made.range].sort()),
    JSON.stringify(cBuilds.map((x) => x.name)));
  await c.until(`localStorage.getItem(${JSON.stringify(RECORD)}) === '41234'`, 20000).catch(() => {});
  check('and A\'s best lap, where race.js reads it', (await c.evaluate(`localStorage.getItem(${JSON.stringify(RECORD)})`)) === '41234');
  let cs = await c.evaluate('window.__ui.settings');
  check('and the Striker\'s turbojet with them', cs.combat && cs.combat.striker2500 && cs.combat.striker2500.propulsion === 'jet', JSON.stringify(cs.combat));
  check('C wears no build until it chooses one', same(cs.buildFits, {}), JSON.stringify(cs.buildFits));
  await c.until('window.__map && window.__map().ready', 400000);
  await choose(c, `build:${made.bush}`);
  cs = await c.evaluate('window.__ui.settings');
  check('Bush is in the picker\'s My Hangar, and choosing it seats it', cs.airframe === 'timber1500' && cs.buildFits.timber1500 && cs.buildFits.timber1500.build === made.bush
    && same(cs.livery.timber1500, { scheme: 'timber_x' }), JSON.stringify(cs.livery.timber1500));
  let flown = await fly(c);
  check('flown, Bush wears the Timber X scheme', flown.craft.run === 'timber1500' && same(sorted(flown.paint.regions), sorted(coloursFor('timber1500', { scheme: 'timber_x' }))),
    JSON.stringify(flown.paint && flown.paint.regions));
  await choose(c, `build:${made.range}`);
  check('Long range is in My Hangar too, and choosing it seats the 7 inch', (await c.evaluate('window.__ui.settings.airframe')) === '7inch');
  flown = await fly(c);
  check('Long range flies on the 7 inch carrying the wide payload and the second pack', flown.craft.run === '7inch' && same(flown.craft.combat, LOADOUT),
    JSON.stringify({ run: flown.craft.run, combat: flown.craft.combat }));
  await choose(c, 'striker2500');
  flown = await fly(c);
  check(`the Striker flies on the turbojet's plant, ${JET.simId}`, flown.craft.run === 'striker2500' && flown.craft.module === JET.simId && flown.craft.combat && flown.craft.combat.propulsion === 'jet',
    JSON.stringify({ module: flown.craft.module, combat: flown.craft.combat }));

  console.log('C deletes a build; A loses it at its next sync');
  await c.evaluate(`window.__ui.removeBuild(${JSON.stringify(made.range)}); true`);
  await c.evaluate('window.__accountSync()');
  held = (await fetch(`${T}/api/account/progress`, { headers: { authorization: `Bearer ${acc.session}` } }).then((r) => r.json())).progress;
  check('the account holds the delete', !held.data.builds[made.range] && Number.isFinite(held.stamps[`builds/${made.range}`]) && Boolean(held.data.builds[made.bush]));
  const aBefore = await a.evaluate('window.__ui.settings.buildFits');
  check('A was wearing it', Boolean(aBefore['7inch']) && aBefore['7inch'].build === made.range, JSON.stringify(aBefore));
  await a.evaluate('window.__accountSync()');
  const aBuilds = await builds(a);
  const aNow = await a.evaluate('({ fits: window.__ui.settings.buildFits, combat: window.__ui.settings.combat, list: window.__ui.myBuilds.map((x) => x.id) })');
  check('after A syncs it is gone from A\'s My Hangar, and Bush is still there', same(aBuilds.map((x) => x.id), [made.bush]) && same(aNow.list, [made.bush]),
    JSON.stringify(aBuilds.map((x) => x.name)));
  check('and A\'s 7 inch wears the pilot\'s own again', !aNow.fits['7inch'] && !(aNow.combat && aNow.combat['7inch']), JSON.stringify(aNow));
  await a.evaluate('window.__accountSync()');
  await c.evaluate('window.__accountSync()');
  check('nor does a sync from either computer bring it back', !(await builds(c)).some((x) => x.id === made.range) && !(await builds(a)).some((x) => x.id === made.range));
  /* Signing out starts the page again (src/ui/accountui.js). */
  await c.evaluate("window.__beforeSignOut = true; window.__ui.show('pilot'); window.__ui.onAction('accountsignout'); true");
  await c.until(`!window.__beforeSignOut && window.__shellReady === true && !localStorage.getItem(${JSON.stringify(ACCOUNT_KEY)})`, 300000);
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
