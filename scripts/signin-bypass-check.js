/*
 * signin-bypass-check.js: the checks' way of signing in without Google
 * cannot sign anybody in on the deployed game.
 *
 *   npm run signin:bypass
 *
 * The browser checks sign pilots in with a key made on this machine
 * (tests/lib/account.js): the tracks server is started with googleJwksUrl,
 * a key set on loopback, and the page has a stand in for Google's button
 * seeded into it. This holds every door that could carry that onto the
 * live site shut, in plain Node:
 *
 *   the trust is a parameter   tracks-api/node.js's main reads no key set
 *                              address from its environment, and no
 *                              production config (the VM's units, the
 *                              Caddyfile, the Worker's wrangler.toml)
 *                              names one.
 *   it is loopback only        tracks-api/accounts.js jwksUrlFor takes
 *                              only http://127.0.0.1, localhost or [::1],
 *                              and Google's own keys for anything else.
 *   run as production runs     the tracks server started by its own main,
 *                              as fdfpv-tracks.service starts it, with
 *                              GOOGLE_JWKS_URL set in its environment to
 *                              the stand in anyway: a token the stand in
 *                              signed is refused, and no session is made.
 *   the same server, told      started through startTracks with the stand
 *                              in, the same token is taken: so the refusal
 *                              above is the trust missing, not a token the
 *                              server would refuse anyway.
 *   none of it in the page     src/ and the served pages name no stand in
 *                              (window.__credential, #gis-mock, the seed's
 *                              mark), and the page's tracks server on the
 *                              game's own domain is the production one.
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
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { jwksUrlFor } from '../tracks-api/accounts.js';
import { GOOGLE_JWKS_URL } from '../tracks-api/google.js';
import { startTracks } from '../tracks-api/node.js';
import { GOOGLE_CLIENT_ID } from '../src/share/account.js';
import { API_ORIGIN } from '../src/share/api.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const RS256 = {
  name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256',
};

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
const read = (rel) => readFileSync(join(root, rel), 'utf8');

console.log('the trust is a parameter, and no production config names it');
const nodeMain = read('tracks-api/node.js').split('if (import.meta.url === pathToFileURL(process.argv[1]).href)')[1] || '';
check('tracks-api/node.js has a main to read', nodeMain.includes('startTracks('));
check('its main passes no key set address from the environment', !/jwks/i.test(nodeMain), nodeMain.match(/.*jwks.*/i)?.[0]);
const configs = [
  ...readdirSync(join(root, 'deploy/vm')).map((f) => `deploy/vm/${f}`),
  'tracks-api/wrangler.toml', 'edge/wrangler.toml', 'edge/rooms/wrangler.toml', 'render.yaml',
];
const naming = configs.filter((f) => /JWKS/i.test(read(f)));
check(`no production config names a key set (${configs.length} files)`, naming.length === 0, naming.join(', '));

console.log('it is loopback only');
const honoured = (url) => jwksUrlFor({ GOOGLE_JWKS_URL: url }) === url;
check('unset, Google\'s keys', jwksUrlFor({}) === GOOGLE_JWKS_URL);
for (const url of ['http://127.0.0.1:9/certs', 'http://localhost:9/certs', 'http://[::1]:9/certs']) {
  check(`${url} is a check's stand in, and taken`, honoured(url));
}
for (const url of [
  'https://127.0.0.1:9/certs', 'http://10.0.0.5/certs', 'http://127.0.0.1.attacker.example/certs', 'https://attacker.example/certs',
  `${API_ORIGIN}/certs`, 'http://0.0.0.0:9/certs', 'not a url',
]) {
  check(`${url}: Google's keys instead`, jwksUrlFor({ GOOGLE_JWKS_URL: url }) === GOOGLE_JWKS_URL);
}

console.log('run as production runs it, the stand in signs nobody in');
const google = await crypto.subtle.generateKey(RS256, true, ['sign', 'verify']);
const jwk = await crypto.subtle.exportKey('jwk', google.publicKey);
const jwks = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ keys: [{ kty: 'RSA', kid: 'stand-in', alg: 'RS256', n: jwk.n, e: jwk.e }] }));
});
await new Promise((resolve) => jwks.listen(0, '127.0.0.1', resolve));
const standIn = `http://127.0.0.1:${jwks.address().port}/certs`;
async function idToken(sub) {
  const b64 = (x) => Buffer.from(x).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'RS256', kid: 'stand-in', typ: 'JWT' }));
  const body = b64(JSON.stringify({
    iss: 'https://accounts.google.com', aud: GOOGLE_CLIENT_ID, sub, iat: now, exp: now + 600,
  }));
  const sig = new Uint8Array(await crypto.subtle.sign(RS256, google.privateKey, new TextEncoder().encode(`${head}.${body}`)));
  return `${head}.${body}.${b64(sig)}`;
}
async function signInAt(origin) {
  const res = await fetch(`${origin}/api/account/google`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ credential: await idToken('bypass-check') }),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, session: body && body.session, reason: body && body.reason };
}

const scratch = mkdtempSync(join(tmpdir(), 'fdfpv-bypass-'));
const port = await new Promise((resolve) => {
  const probe = http.createServer().listen(0, '127.0.0.1', () => {
    const got = probe.address().port;
    probe.close(() => resolve(got));
  });
});
const prod = spawn(process.execPath, [join(root, 'tracks-api/node.js')], {
  env: {
    ...process.env,
    TRACKS_DB: join(scratch, 'prod.db'),
    PORT: String(port),
    GOOGLE_CLIENT_ID,
    ACCOUNTS_SECRET: 'bypass-check-secret',
    /* What somebody would set to open the door: it must do nothing. */
    GOOGLE_JWKS_URL: standIn,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let said = '';
prod.stdout.on('data', (d) => {
  said += d;
});
prod.stderr.on('data', (d) => {
  said += d;
});
const prodOrigin = `http://127.0.0.1:${port}`;
let up = false;
for (let i = 0; i < 100 && !up; i += 1) {
  /* eslint-disable-next-line no-await-in-loop */
  up = await fetch(`${prodOrigin}/api/health`).then((r) => r.ok).catch(() => false);
  if (!up) {
    /* eslint-disable-next-line no-await-in-loop */
    await new Promise((r) => setTimeout(r, 100));
  }
}
check('the tracks server came up from its own main, sign in on', up && /sign-in on/.test(said), said.trim());
const refused = await signInAt(prodOrigin);
/* Checked against Google's keys, which do not hold the stand in's: 401
 * for a key Google never issued, or 503 where this machine cannot reach
 * Google at all. Either way no session. */
check('a token the stand in signed is refused there, checked against Google\'s keys',
  !refused.session && ((refused.status === 401 && refused.reason === 'unknown key') || refused.status === 503), JSON.stringify(refused));
console.log(`    (${refused.status === 401 ? 'Google answered: not its key' : 'Google unreachable from here'})`);
prod.kill('SIGTERM');
await new Promise((resolve) => prod.once('exit', resolve));

const told = await startTracks({
  db: join(scratch, 'check.db'), port: 0, googleClientId: GOOGLE_CLIENT_ID, accountsSecret: 'bypass-check-secret', googleJwksUrl: standIn,
});
const taken = await signInAt(`http://127.0.0.1:${told.port}`);
check('the same token is taken by a server a check started with the stand in', taken.status === 200 && Boolean(taken.session),
  JSON.stringify(taken));
await told.stop();
jwks.close();
rmSync(scratch, { recursive: true, force: true });

console.log('none of it in the page');
function files(dir) {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((d) => {
    const rel = `${dir}/${d.name}`;
    return d.isDirectory() ? files(rel) : [rel];
  });
}
const served = [...files('src').filter((f) => /\.(js|html)$/.test(f)), 'index.html', 'privacy.html', 'terms.html'];
const marks = ['__credential', 'gis-mock', 'sim.account.seeded', 'GOOGLE_JWKS', 'googleJwksUrl'];
const carrying = served.filter((f) => marks.some((m) => read(f).includes(m)));
check(`no served file names the stand in (${served.length} files)`, carrying.length === 0, carrying.join(', '));
const cloud = read('src/share/cloud.js');
check('the page off the game\'s domain asks the production tracks server', /PRODUCTION_TRACKS_ORIGIN = API_ORIGIN;/.test(cloud)
  && /return PRODUCTION_TRACKS_ORIGIN === PLACEHOLDER_ORIGIN \? '' : apiOrigin\(\);/.test(cloud));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
