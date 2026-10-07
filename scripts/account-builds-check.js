/*
 * account-builds-check.js: My Hangar builds reaching the account from a
 * computer that already had them, in the real shell, two computers per
 * story, against local servers.
 *
 *   node scripts/account-builds-check.js [/path/to/fdfpv-leaderboard]
 *
 * scripts/account-browser-check.js makes its builds after signing in. The
 * owner's, 2026-10-02, were made otherwise, and never reached the account:
 * signed in at the office, his builds in My Hangar there, none at home.
 * Each story here is its own account. Computer A comes to its first sync
 * holding builds by one road; computer B then signs in fresh and must find
 * every one of them in its My Hangar:
 *
 *   old      the owner's own order. A signed in and synced before builds
 *            synced at all (its last sync's record carries no `builds` nor
 *            `combat`), and made its builds with the code of the day,
 *            wearing one. Then H, his home computer, signs in first on the
 *            code that syncs builds and writes the account's empty map.
 *            Then A loads the page again, and H, a tab left open and
 *            untouched, must have them within the minute, by a pull that
 *            sends nothing (src/ui/accountui.js), with no reload.
 *   guest    A made its builds as a guest, then signs in to an account a
 *            first computer already made.
 *   first    A made its builds as a guest, then signs in to a new account.
 *   stale    A's record says the builds already went up (the reply of a
 *            tracks server that dropped the section, settled as synced),
 *            and the account has none.
 *   signed   A signed in, synced, then made its builds (the happy path).
 *
 * Then, on the last story's account: a build deleted on B stays deleted
 * after A syncs (the tombstone), and a computer with no builds signing in
 * leaves the account's builds where they are.
 *
 * Google Identity Services is mocked as in account-browser-check.js.
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
import { GOOGLE_CLIENT_ID } from '../src/share/account.js';
import { ACCOUNT_KEY } from '../src/share/pilot.js';
import { startTracks } from '../tracks-api/node.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const boardDir = resolve(process.argv[2] || join(root, '..', 'fdfpv-leaderboard'));
const RS256 = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
const SYNCED_KEY = 'fdfpv.account.synced.v1';

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
  console.error(`account-builds-check: no board checkout with vendor/fdfpv at ${boardDir}`);
  process.exit(2);
}

const scratch = mkdtempSync(join(tmpdir(), 'fdfpv-account-builds-'));

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
  db: join(scratch, 'tracks.db'), port: 0, googleClientId: GOOGLE_CLIENT_ID, accountsSecret: 'builds-check-secret',
  googleJwksUrl: `http://127.0.0.1:${jwks.address().port}/certs`,
});
const T = `http://127.0.0.1:${tracks.port}`;

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
console.log(`tracks ${T}, board ${B} (${boardDir})`);

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

const SEED = [MOCK_GIS, `try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  if (!s.accountSeeded) {
    Object.assign(s, { graphics: 'low', airframeAsked: true, map: 'swiss2', freestyleMap: 'swiss2', accountSeeded: true });
    localStorage.setItem(k, JSON.stringify(s));
  }
} catch (e) { /* storage refused */ }`];

const url = `/index.html?tracks=${encodeURIComponent(T)}&board=${encodeURIComponent(B)}`;
const dialogTitle = "(() => { const d = document.querySelector('.name-dialog'); return d && !d.hidden ? (d.querySelector('h2') || {}).textContent || '' : ''; })()";
const readJson = (p, key) => p.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)}) || 'null')`);
const storedBuilds = async (p) => ((await readJson(p, BUILDS_KEY)) || {}).builds || [];
const ids = (list) => list.map((b) => b.id).sort();
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);

const pages = [];
async function computer() {
  const p = await openPage({ root, url, width: 960, height: 540, seed: SEED });
  pages.push(p);
  await p.until('window.__shellReady === true', 300000);
  return p;
}

async function heldProgress(p) {
  const acc = await readJson(p, ACCOUNT_KEY);
  return (await fetch(`${T}/api/account/progress`, { headers: { authorization: `Bearer ${acc.session}` } }).then((r) => r.json())).progress;
}

/* Signed in through the Pilot screen's button, saying yes to whatever is
 * asked, a callsign picked when there is none. Resolves once the sign in
 * and the sync it starts are both done. */
async function signIn(p, sub, callsign) {
  await p.evaluate(`window.__credential = ${JSON.stringify(await idToken(sub))}; window.__ui.onAction('accountsignin'); true`);
  await p.until("Boolean(document.querySelector('#gis-mock'))", 15000);
  await p.evaluate("document.querySelector('#gis-mock').click(); true");
  for (let i = 0; i < 3; i += 1) {
    /* eslint-disable-next-line no-await-in-loop */
    await p.until(`${dialogTitle}.length > 0 || (JSON.parse(localStorage.getItem(${JSON.stringify(ACCOUNT_KEY)}) || '{}').callsign)`, 15000);
    /* eslint-disable-next-line no-await-in-loop */
    const title = await p.evaluate(dialogTitle);
    if (!title) {
      break;
    }
    if (title === 'Choose your callsign') {
      /* eslint-disable-next-line no-await-in-loop */
      await p.evaluate(`(() => { const f = document.querySelector('.name-dialog-input'); f.value = ${JSON.stringify(callsign)}; document.querySelector('.name-dialog .name-dialog-btn.on').click(); return true; })()`);
    } else {
      /* eslint-disable-next-line no-await-in-loop */
      await p.evaluate("(() => { document.querySelectorAll('.name-dialog .name-dialog-btn')[0].click(); return true; })()");
    }
    /* eslint-disable-next-line no-await-in-loop */
    await p.until(`!(${dialogTitle}) || (${dialogTitle}) !== ${JSON.stringify(title)}`, 15000);
  }
  await p.until(`(JSON.parse(localStorage.getItem(${JSON.stringify(ACCOUNT_KEY)}) || '{}').callsign) === ${JSON.stringify(callsign)}`, 15000);
  await p.until(`Boolean(localStorage.getItem(${JSON.stringify(SYNCED_KEY)}))`, 15000);
  await p.evaluate('window.__accountSync()');
}

/* Two builds made the way the hangar's Save to My Hangar makes them, the
 * second worn. `then` runs in the same task, with builds.js as `m`, so the
 * page's one minute sync cannot come between the two. */
async function makeBuilds(p, tag, then = '') {
  return p.evaluate(`import('/src/ui/builds.js').then((m) => {
    const ui = window.__ui;
    const one = ui.addBuild(${JSON.stringify(`${tag} bush`)}, 'timber1500', m.normaliseFit('timber1500', { livery: { scheme: 'timber_x' } }));
    const two = ui.addBuild(${JSON.stringify(`${tag} trainer`)}, 'sky1800', m.normaliseFit('sky1800', { livery: { regions: { body: '#ff8800' } } }));
    ui.wearBuild(two);
    ui.persistSettings();
    ${then}
    return [one.id, two.id].sort();
  })`);
}

/* The page loaded again, as the pilot does the next morning. */
async function reload(p) {
  await p.evaluate('location.reload(); true');
  await p.sleep(500);
  await p.until('window.__shellReady === true', 300000);
}

/* B, a fresh computer, signs in; what its My Hangar holds after. */
async function homeSees(sub, callsign) {
  const b = await computer();
  await signIn(b, sub, callsign);
  const list = await storedBuilds(b);
  const shown = await b.evaluate('window.__ui.myBuilds.map((x) => x.id)');
  return { b, list, shown };
}

async function story(name, sub, callsign, arrange) {
  console.log(`story ${name}`);
  const a = await computer();
  const made = await arrange(a, sub, callsign);
  check(`${name}: A holds its builds`, same(ids(await storedBuilds(a)), made), JSON.stringify(ids(await storedBuilds(a))));
  await a.evaluate('window.__accountSync()');
  const held = await heldProgress(a);
  const up = Object.keys((held && held.data && held.data.builds) || {}).sort();
  check(`${name}: A's sync takes them to the account`, same(up, made), `account has ${JSON.stringify(up)}`);
  const { b, list, shown } = await homeSees(sub, callsign);
  check(`${name}: B signs in and finds them in My Hangar`, same(ids(list), made) && same([...shown].sort(), made), `B has ${JSON.stringify(ids(list))}`);
  return { a, b, made };
}

let home = null;
try {
  const oldMade = await story('old', 'sub-old', 'Oldie', async (a, sub, callsign) => {
    await signIn(a, sub, callsign);
    /* What the code before builds synced left behind: its record of the
     * last sync, with neither section in it. And that page's timers
     * stopped, since its code never sent builds: they go up only when
     * the page is loaded again, after H signed in. */
    const made = await makeBuilds(a, 'old', `
      const k = ${JSON.stringify(SYNCED_KEY)};
      const kept = JSON.parse(localStorage.getItem(k));
      delete kept.data.builds;
      delete kept.data.combat;
      localStorage.setItem(k, JSON.stringify(kept));
      for (let i = 1; i < 100000; i += 1) {
        clearInterval(i);
      }`);
    home = await computer();
    await signIn(home, sub, callsign);
    const held = await heldProgress(home);
    check('old: H signing in first leaves the account an empty My Hangar', same(held.data.builds, {}) && !Object.keys(held.stamps).some((k) => k.startsWith('builds/')),
      JSON.stringify(held.data.builds));
    await home.evaluate(`(() => {
      const f = window.fetch;
      window.__progressCalls = [];
      window.fetch = (u, o) => {
        if (String(u).includes('/api/account/progress')) {
          window.__progressCalls.push((o && o.method) || 'GET');
        }
        return f(u, o);
      };
      return true;
    })()`);
    await reload(a);
    return made;
  });
  await home.until(`((JSON.parse(localStorage.getItem(${JSON.stringify(BUILDS_KEY)}) || '{}').builds) || []).length === 2`, 150000).catch(() => {});
  const calls = await home.evaluate('window.__progressCalls');
  check('old: H, an open tab left alone, has them within the minute, by a pull that sent nothing',
    same(ids(await storedBuilds(home)), oldMade.made) && calls.length > 0 && calls.every((m) => m === 'GET'),
    JSON.stringify({ builds: ids(await storedBuilds(home)), calls }));
  check('old: and shows them in its My Hangar', same((await home.evaluate('window.__ui.myBuilds.map((x) => x.id)')).sort(), oldMade.made));

  await story('first', 'sub-first', 'Firstie', async (a, sub, callsign) => {
    const made = await makeBuilds(a, 'first');
    await signIn(a, sub, callsign);
    return made;
  });

  console.log('story guest (the account made first on another computer)');
  const maker = await computer();
  await signIn(maker, 'sub-guest', 'Guestie');
  await story('guest', 'sub-guest', 'Guestie', async (a, sub, callsign) => {
    const made = await makeBuilds(a, 'guest');
    await signIn(a, sub, callsign);
    return made;
  });

  await story('stale', 'sub-stale', 'Stalie', async (a, sub, callsign) => {
    await signIn(a, sub, callsign);
    /* settled() after a reply that carried no builds: the record holds
     * this computer's builds as if they had gone up. */
    const made = await makeBuilds(a, 'stale', `
      const k = ${JSON.stringify(SYNCED_KEY)};
      const kept = JSON.parse(localStorage.getItem(k));
      kept.data.builds = m.buildsBlob(ui.myBuilds);
      localStorage.setItem(k, JSON.stringify(kept));`);
    /* Nothing changed here since that record, so the open tab pulls the
     * account, which has none of them: a pull must not take them away. */
    await a.evaluate(`window.__pulled = 0; (() => {
      const f = window.fetch;
      window.fetch = (u, o) => {
        if (String(u).includes('/api/account/progress') && (o && o.method) === 'GET') {
          window.__pulled += 1;
        }
        return f(u, o);
      };
      return true;
    })()`);
    await a.until('window.__pulled > 0', 90000).catch(() => {});
    await a.sleep(1000);
    check('stale: a pull into the open tab keeps the builds the account has not got', (await a.evaluate('window.__pulled')) > 0
      && same(ids(await storedBuilds(a)), made), JSON.stringify(ids(await storedBuilds(a))));
    await reload(a);
    return made;
  });

  const last = await story('signed', 'sub-signed', 'Signie', async (a, sub, callsign) => {
    await signIn(a, sub, callsign);
    return makeBuilds(a, 'signed');
  });

  console.log('the account\'s builds are not lost to an empty computer, and a delete holds');
  const empty = await computer();
  await signIn(empty, 'sub-signed', 'Signie');
  let held = await heldProgress(empty);
  check('a computer with no builds signing in leaves the account\'s', same(Object.keys(held.data.builds).sort(), last.made));
  await last.b.evaluate(`window.__ui.removeBuild(${JSON.stringify(last.made[0])}); true`);
  await last.b.evaluate('window.__accountSync()');
  await last.a.evaluate('window.__accountSync()');
  await last.a.evaluate('window.__accountSync()');
  held = await heldProgress(last.a);
  check('a build deleted on B is not brought back by A', !held.data.builds[last.made[0]] && Number.isFinite(held.stamps[`builds/${last.made[0]}`])
    && same(ids(await storedBuilds(last.a)), [last.made[1]]), JSON.stringify(Object.keys(held.data.builds)));

  const errs = pages.flatMap((p) => p.errors).filter((e) => !e.startsWith('network:'));
  check('no page error', errs.length === 0, errs.slice(0, 4).join(' | '));
} finally {
  for (const p of pages) {
    /* eslint-disable-next-line no-await-in-loop */
    await p.close().catch(() => {});
  }
  board.kill('SIGTERM');
  await tracks.stop();
  jwks.close();
  rmSync(scratch, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
