/*
 * account.js: accounts for the browser checks, with Google stood in for.
 *
 * Nobody plays the deployed game without signing in with Google (src/share/
 * account.js), and a check cannot sign in to Google. So a check runs its
 * own tracks server (tracks-api/node.js) with sign in on, and its own
 * Google: an RS256 key made here, served as a key set on loopback, which
 * that server is told to trust with its googleJwksUrl option. That is the
 * whole of the test path, and none of it is in the page:
 *
 *   the trust      startTracks({ googleJwksUrl }), a parameter only. The
 *                  server's own main never reads one from the environment,
 *                  and tracks-api/accounts.js jwksUrlFor honours one only at
 *                  a loopback http address. scripts/signin-bypass-check.js
 *                  holds both, and the production config, to that.
 *   the button     MOCK_GIS, a script a check seeds into its page in place
 *                  of Google's (whose button cannot be pressed headless),
 *                  handing the page window.__credential the way Google's
 *                  calls back with one.
 *   a signed in    signUp() makes an account and a session from Node, the
 *   page           requests the page itself would make, and seedSignedIn()
 *                  puts them in the page's storage before it runs, so a
 *                  check that is not about signing in boots as a pilot who
 *                  signed in yesterday (tests/lib/page.js `account`).
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
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startTracks } from '../../tracks-api/node.js';
import { GOOGLE_CLIENT_ID } from '../../src/share/account.js';
import { ACCOUNT_KEY } from '../../src/share/pilot.js';
import { KEY_STORAGE, createIdentity, memoryStorage } from '../../src/share/identity.js';

const RS256 = {
  name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256',
};
/* src/share/cloud.js's override of where the tracks server is. */
const TRACKS_ORIGIN_KEY = 'fdfpv.tracks.origin';
/* A seeded page's own mark, outside the game's keys (src/share/move.js
 * KEY), so a sign out in the check is not undone by the next load. */
const SEEDED_KEY = 'sim.account.seeded';

/* Google's button, replaced: renderButton draws a button that hands the
 * page window.__credential, the way Google's calls back with one. */
export const MOCK_GIS = `window.google = { accounts: { id: {
  initialize(o) { window.__gis = o; },
  renderButton(el) {
    const b = document.createElement('button');
    b.id = 'gis-mock';
    b.textContent = 'Google (mock)';
    b.onclick = () => window.__gis.callback({ credential: window.__credential });
    el.append(b);
  },
} } };`;

/*
 * The tracks server with sign in on, and the Google it trusts. Resolves to
 * { origin, idToken(sub), signUp(sub, callsign), api(method, path, body,
 * session), stop() }.
 */
export async function startAccounts() {
  const scratch = await mkdtemp(join(tmpdir(), 'sim-accounts-'));
  const google = await crypto.subtle.generateKey(RS256, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', google.publicKey);
  const jwks = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ keys: [{ kty: 'RSA', kid: 'sim', alg: 'RS256', n: jwk.n, e: jwk.e }] }));
  });
  await new Promise((resolve) => jwks.listen(0, '127.0.0.1', resolve));
  const tracks = await startTracks({
    db: join(scratch, 'tracks.db'),
    port: 0,
    googleClientId: GOOGLE_CLIENT_ID,
    accountsSecret: 'sim-accounts-secret',
    googleJwksUrl: `http://127.0.0.1:${jwks.address().port}/certs`,
  });
  const origin = `http://127.0.0.1:${tracks.port}`;

  async function idToken(sub) {
    const b64 = (x) => Buffer.from(x).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const head = b64(JSON.stringify({ alg: 'RS256', kid: 'sim', typ: 'JWT' }));
    const body = b64(JSON.stringify({
      iss: 'https://accounts.google.com', aud: GOOGLE_CLIENT_ID, sub, iat: now, exp: now + 3600,
    }));
    const sig = new Uint8Array(await crypto.subtle.sign(RS256, google.privateKey, new TextEncoder().encode(`${head}.${body}`)));
    return `${head}.${body}.${b64(sig)}`;
  }

  async function api(method, path, body, session) {
    const res = await fetch(`${origin}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(session ? { authorization: `Bearer ${session}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const got = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(got)}`);
    }
    return got;
  }

  /* An account with a pilot key and a callsign, as a first sign in on a
   * page makes one: what seedSignedIn puts in a page. */
  async function signUp(sub, callsign) {
    const { session } = await api('POST', '/api/account/google', { credential: await idToken(sub) });
    const offered = await createIdentity(memoryStorage()).exportText();
    const identity = (await api('PUT', '/api/account/identity', { identity: offered }, session)).identity;
    const named = await api('PUT', '/api/account/callsign', { callsign }, session);
    return {
      sub, session, callsign: named.callsign, identity, publicKey: JSON.parse(identity).publicRaw,
    };
  }

  /* Once: a check may stop it early to see the page without it. */
  let stopped = false;
  async function stop() {
    if (stopped) {
      return;
    }
    stopped = true;
    await tracks.stop();
    await new Promise((resolve) => jwks.close(resolve));
    await rm(scratch, { recursive: true, force: true });
  }

  return {
    origin, idToken, signUp, api, stop,
  };
}

/* A page seed: this tracks server, and on the profile's first load the
 * account signUp made, signed in. Later loads leave storage as the page
 * left it, so a check may sign out. */
export function seedSignedIn(origin, account) {
  const record = {
    session: account.session, callsign: account.callsign, publicKey: account.publicKey, keyIsAccounts: true,
  };
  return `try {
    localStorage.setItem(${JSON.stringify(TRACKS_ORIGIN_KEY)}, ${JSON.stringify(origin)});
    if (!localStorage.getItem(${JSON.stringify(SEEDED_KEY)})) {
      localStorage.setItem(${JSON.stringify(SEEDED_KEY)}, '1');
      localStorage.setItem(${JSON.stringify(ACCOUNT_KEY)}, ${JSON.stringify(JSON.stringify(record))});
      localStorage.setItem(${JSON.stringify(KEY_STORAGE)}, ${JSON.stringify(account.identity)});
    }
  } catch (e) { /* storage refused: the page boots signed out */ }`;
}

/*
 * The board from a checkout of fdflabs/fdfpv-leaderboard (its file store,
 * in a scratch directory), on a free port: a page's sign in claims the
 * callsign there (src/share/account.js chooseCallsign), so a check that
 * signs in through the page needs one, and never the one a developer may
 * have running on 3180. Resolves to { origin, stop() }; throws when there
 * is no checkout at `dir`.
 */
export async function startBoard(dir) {
  if (!existsSync(join(dir, 'src', 'server.js'))) {
    throw new Error(`no board checkout at ${dir} (pass FDFPV_BOARD=/path/to/fdfpv-leaderboard)`);
  }
  const scratch = await mkdtemp(join(tmpdir(), 'sim-board-'));
  const port = await new Promise((resolve) => {
    const probe = http.createServer().listen(0, '127.0.0.1', () => {
      const got = probe.address().port;
      probe.close(() => resolve(got));
    });
  });
  const board = spawn(process.execPath, [join(dir, 'src', 'server.js')], {
    cwd: dir,
    env: {
      ...process.env, PORT: String(port), BOARD_HOST: '127.0.0.1', BOARD_FILE: join(scratch, 'board.json'), DATABASE_URL: '',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const origin = `http://127.0.0.1:${port}`;
  let up = false;
  for (let i = 0; i < 100 && !up; i += 1) {
    /* eslint-disable-next-line no-await-in-loop */
    up = await fetch(`${origin}/api/health`).then((r) => r.ok).catch(() => false);
    if (!up) {
      /* eslint-disable-next-line no-await-in-loop */
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  if (!up) {
    board.kill();
    throw new Error(`the board at ${dir} did not come up`);
  }
  return {
    origin,
    async stop() {
      const exited = board.exitCode !== null ? Promise.resolve() : new Promise((resolve) => board.once('exit', resolve));
      board.kill();
      await exited;
      await rm(scratch, { recursive: true, force: true });
    },
  };
}

/* A page seed: this tracks server and nobody signed in, for the checks of
 * the sign in itself. */
export function seedTracks(origin) {
  return `try { localStorage.setItem(${JSON.stringify(TRACKS_ORIGIN_KEY)}, ${JSON.stringify(origin)}); } catch (e) { /* storage refused */ }`;
}
