/*
 * accounts-selftest.js: the optional Google sign-in (accounts.js,
 * google.js) and the progress merge (src/share/progressmerge.js), in Node,
 * with no Google.
 *
 *   node tracks-api/accounts-selftest.js
 *
 * Google is stood in for by an RS256 key made here and served as a JWKS
 * from a local HTTP server, so the fetch, the cache and the checks are the
 * ones the VM runs. A second key signs the forgeries.
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

import worker from './worker.js';
import { openD1 } from './d1sqlite.js';
import { googleKeys, verifyGoogleIdToken } from './google.js';
import { inspectCallsign, looksLikePickerName } from './accounts.js';
import { ACCOUNT_WRITE_LIMIT, SIGNIN_LIMIT } from './limits.js';
import {
  createIdentity, keyLinkMessage, memoryStorage, trackMessage,
} from '../src/share/identity.js';
import { mapTrackDocument } from '../tests/lib/maptrack.js';
import { cleanBlob, mergeBlobs, stampChanges } from '../src/share/progressmerge.js';

const CLIENT_ID = 'selftest-client.apps.googleusercontent.com';
const RS256 = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };

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

function b64url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

const google = await crypto.subtle.generateKey(RS256, true, ['sign', 'verify']);
const forger = await crypto.subtle.generateKey(RS256, true, ['sign', 'verify']);
const jwk = await crypto.subtle.exportKey('jwk', google.publicKey);
const JWKS = { keys: [{ kty: 'RSA', kid: 'test-1', alg: 'RS256', use: 'sig', n: jwk.n, e: jwk.e }] };

let nowS = Math.floor(Date.now() / 1000);
let subN = 0;
async function idToken({
  sub = `1000${(subN += 1)}`, aud = CLIENT_ID, iss = 'https://accounts.google.com', exp = nowS + 3600, kid = 'test-1',
  key = google.privateKey, alg = 'RS256', extra = {},
} = {}) {
  const head = b64url(JSON.stringify({ alg, kid, typ: 'JWT' }));
  const body = b64url(JSON.stringify({
    iss, aud, sub, exp, iat: nowS, email: 'pilot@example.com', email_verified: true, ...extra,
  }));
  const sig = new Uint8Array(await crypto.subtle.sign(RS256, key, new TextEncoder().encode(`${head}.${body}`)));
  return `${head}.${body}.${b64url(sig)}`;
}

console.log('the ID token');
{
  let fetches = 0;
  let clock = 1_000_000;
  const key = googleKeys({
    fetchFn: async () => {
      fetches += 1;
      return new Response(JSON.stringify(JWKS), { headers: { 'cache-control': 'public, max-age=600' } });
    },
    now: () => clock,
  });
  const opts = { clientId: CLIENT_ID, key, nowS };
  let v = await verifyGoogleIdToken(await idToken({ sub: '42' }), opts);
  check('a good token names its subject', v.sub === '42', JSON.stringify(v));
  v = await verifyGoogleIdToken(await idToken({ aud: 'someone-else.apps.googleusercontent.com' }), opts);
  check('a token for another client id is refused', v.error === 'wrong audience', JSON.stringify(v));
  v = await verifyGoogleIdToken(await idToken({ aud: [CLIENT_ID, 'x'] }), opts);
  check('and so is one for several audiences', v.error === 'wrong audience', JSON.stringify(v));
  v = await verifyGoogleIdToken(await idToken({ exp: nowS - 3600 }), opts);
  check('an expired token is refused', v.error === 'expired', JSON.stringify(v));
  v = await verifyGoogleIdToken(await idToken({ key: forger.privateKey }), opts);
  check('a token signed by another key under Google\'s key id is refused', v.error === 'bad signature', JSON.stringify(v));
  const good = await idToken({ sub: '42' });
  const [h, b, s] = good.split('.');
  const swapped = b64url(JSON.stringify({ ...JSON.parse(Buffer.from(b, 'base64url')), sub: '43' }));
  v = await verifyGoogleIdToken(`${h}.${swapped}.${s}`, opts);
  check('a good signature over another subject is refused', v.error === 'bad signature', JSON.stringify(v));
  v = await verifyGoogleIdToken(await idToken({ iss: 'https://evil.example' }), opts);
  check('a token from another issuer is refused', v.error === 'wrong issuer', JSON.stringify(v));
  v = await verifyGoogleIdToken(`${b64url(JSON.stringify({ alg: 'none', kid: 'test-1' }))}.${b}.`, opts);
  check('an unsigned token is refused', Boolean(v.error), JSON.stringify(v));
  v = await verifyGoogleIdToken(await idToken({ alg: 'HS256' }), opts);
  check('a token that is not RS256 is refused', v.error === 'not an RS256 token', JSON.stringify(v));
  v = await verifyGoogleIdToken('junk', opts);
  check('junk is refused', v.error === 'not a token');
  v = await verifyGoogleIdToken(good, { ...opts, clientId: '' });
  check('with no client id configured nothing is accepted', Boolean(v.error));
  check('Google\'s keys were fetched once for all of that', fetches === 1, `${fetches}`);
  v = await verifyGoogleIdToken(await idToken({ kid: 'rotated' }), opts);
  check('an unknown key id is refused', v.error === 'unknown key');
  check('and does not refetch within a minute of the last fetch', fetches === 1, `${fetches}`);
  clock += 61_000;
  await verifyGoogleIdToken(await idToken({ kid: 'rotated' }), opts);
  check('but does after it, in case Google rotated', fetches === 2, `${fetches}`);
  clock += 700_000;
  await verifyGoogleIdToken(good, opts);
  check('and the keys are fetched again when max-age runs out', fetches === 3, `${fetches}`);
}

console.log('callsigns');
check('a plain callsign is taken', inspectCallsign('  Ace   Pilot ').callsign === 'Ace Pilot');
check('the word filter applies', Boolean(inspectCallsign('Fuck Face').error));
check('glued and swapped letters too', Boolean(inspectCallsign('sh1tpilot').error));
check('the board\'s name shape applies', Boolean(inspectCallsign('a').error) && Boolean(inspectCallsign('<script>').error));
check('a guest\'s picker name is refused, English', looksLikePickerName('Tough Fox 49') && Boolean(inspectCallsign('tough fox 49').error));
check('Spanish, either order, without accents', looksLikePickerName('Zorro Tenaz 12') && looksLikePickerName('Halcon Veloz 10'));
check('a callsign that only borrows the words is fine', !looksLikePickerName('Tough Fox') && !looksLikePickerName('Fox 49'));

console.log('the progress merge');
{
  const here = {
    v: 1,
    data: {
      progress: { v: 1, xp: 300, courses: { a: true }, challenges: { c1: true }, seen: {}, casual: {}, unlockAll: false },
      liverySaves: { cub1400: [{ name: 'Red', entry: { scheme: 1 } }, { name: 'Blue', entry: { scheme: 2 } }] },
      tuning: { cub1400: { cg: 1 }, kadet1981: { cg: 2 } },
      livery: { cub1400: { scheme: 'mine' } },
      rates: { type: 'actual', v: 'here' },
    },
    stamps: { 'tuning/cub1400': 2000, 'tuning/kadet1981': 1000, rates: 500, 'livery/cub1400': 100 },
  };
  const there = {
    v: 1,
    data: {
      progress: { v: 1, xp: 900, courses: { b: true }, challenges: {}, seen: { s: true }, casual: {}, unlockAll: true },
      liverySaves: { cub1400: [{ name: 'Blue', entry: { scheme: 9 } }, { name: 'Green', entry: {} }], zagi1219: [{ name: 'Z', entry: {} }] },
      tuning: { cub1400: { cg: 9 }, kadet1981: { cg: 8 } },
      rates: { type: 'actual', v: 'there' },
    },
    stamps: { 'tuning/cub1400': 1000, 'tuning/kadet1981': 3000, rates: 900, 'livery/cub1400': 200 },
  };
  const m = mergeBlobs(here, there);
  check('the higher XP wins', m.data.progress.xp === 900);
  check('courses, challenges and seen are the union', m.data.progress.courses.a && m.data.progress.courses.b && m.data.progress.challenges.c1 && m.data.progress.seen.s);
  check('Unlock all on either side is on', m.data.progress.unlockAll === true);
  check('saved liveries are the union, one per name, the incoming first',
    JSON.stringify(m.data.liverySaves.cub1400.map((x) => x.name)) === '["Red","Blue","Green"]' && m.data.liverySaves.cub1400[1].entry.scheme === 2
    && m.data.liverySaves.zagi1219.length === 1);
  check('each plane\'s tuning is the newer of the two', m.data.tuning.cub1400.cg === 1 && m.data.tuning.kadet1981.cg === 8);
  check('a whole section is the newer of the two', m.data.rates.v === 'there');
  check('a paint removed later than it was set elsewhere stays removed', !m.data.livery || !m.data.livery.cub1400);
  check('the stamps are the later of each', m.stamps['tuning/kadet1981'] === 3000 && m.stamps['tuning/cub1400'] === 2000);
  const again = mergeBlobs(m, there);
  check('merging the result with either side again changes nothing', JSON.stringify(again.data) === JSON.stringify(m.data));
  check('an empty side leaves the other as it was', JSON.stringify(mergeBlobs(here, null).data.tuning) === JSON.stringify(here.data.tuning));
  const junk = cleanBlob({ v: 1, data: { evil: { x: 1 }, tuning: 'nope', tune: 'betaflight-default' }, stamps: { 'evil/x': 5, tune: 7 } });
  check('unknown sections and wrong shapes are dropped', !('evil' in junk.data) && !('tuning' in junk.data) && junk.data.tune === 'betaflight-default' && !('evil/x' in junk.stamps));
  const stamps = stampChanges({ tuning: { a: 1, b: 2 }, rates: { x: 1 } }, { tuning: { a: 1 }, rates: { x: 0 } }, 77);
  check('a computer stamps exactly the parts it changed', stamps['tuning/b'] === 77 && stamps.rates === 77 && !('tuning/a' in stamps));
}

console.log('the account routes');
const jwksServer = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'max-age=3600' });
  res.end(JSON.stringify(JWKS));
});
await new Promise((resolve) => jwksServer.listen(0, '127.0.0.1', resolve));
const JWKS_URL = `http://127.0.0.1:${jwksServer.address().port}/certs`;

function freshEnv(extra = {}) {
  return {
    DB: openD1(':memory:').DB, ADMIN_SECRET: 'x', GOOGLE_CLIENT_ID: CLIENT_ID, ACCOUNTS_SECRET: 'selftest-accounts-secret', GOOGLE_JWKS_URL: JWKS_URL, ...extra,
  };
}
let env = freshEnv();
let ip = '203.0.113.9';

async function call(method, path, body, session) {
  const headers = { 'cf-connecting-ip': ip };
  if (session) {
    headers.authorization = `Bearer ${session}`;
  }
  const init = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    headers['content-type'] = 'application/json';
  }
  const res = await worker.fetch(new Request(`https://tracks.test${path}`, init), env);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}

let r = await call('POST', '/api/account/google', { credential: await idToken({ sub: 'alice' }) });
check('a Google sign in makes an account and a session', r.status === 200 && /^[0-9a-f]{64}$/.test(r.body.session), JSON.stringify(r.body));
check('with no callsign and no pilot key yet', r.body.callsign === null && r.body.identity === null);
const alice = r.body.session;
r = await call('OPTIONS', '/api/account');
check('the CORS answer lets the page send its session', /authorization/.test(r.headers.get('access-control-allow-headers')));
r = await call('POST', '/api/account/google', { credential: await idToken({ sub: 'x', aud: 'other' }) });
check('a token for another client id signs nobody in', r.status === 401 && r.body.reason === 'wrong audience');
r = await call('POST', '/api/account/google', { credential: await idToken({ sub: 'x', exp: nowS - 7200 }) });
check('nor does an expired one', r.status === 401 && r.body.reason === 'expired');
r = await call('POST', '/api/account/google', { credential: await idToken({ sub: 'x', key: forger.privateKey }) });
check('nor a forged one', r.status === 401 && r.body.reason === 'bad signature');
r = await call('GET', '/api/account');
check('an account route without a session is refused', r.status === 401 && r.body.signedOut === true);
r = await call('GET', '/api/account', undefined, 'f'.repeat(64));
check('and with a made up one', r.status === 401);

r = await call('PUT', '/api/account/callsign', { callsign: 'Ace', check: true }, alice);
check('a callsign can be checked without claiming it', r.status === 200 && r.body.available === true);
r = await call('GET', '/api/account', undefined, alice);
check('and the check claimed nothing', r.body.callsign === null);
r = await call('PUT', '/api/account/callsign', { callsign: 'Ace' }, alice);
check('a callsign is claimed', r.status === 200 && r.body.callsign === 'Ace');
r = await call('GET', '/api/account', undefined, alice);
check('and the account answers with it, for the rooms server', r.status === 200 && r.body.callsign === 'Ace');

r = await call('POST', '/api/account/google', { credential: await idToken({ sub: 'bob' }) });
const bob = r.body.session;
r = await call('PUT', '/api/account/callsign', { callsign: 'ace' }, bob);
check('another account cannot take it, whatever the case', r.status === 409 && r.body.taken === true, JSON.stringify(r.body));
r = await call('PUT', '/api/account/callsign', { callsign: 'ACE', check: true }, bob);
check('and a check says so', r.status === 409);
r = await call('PUT', '/api/account/callsign', { callsign: 'shitlord' }, bob);
check('the word filter refuses a callsign', r.status === 422 && r.body.field === 'callsign');
r = await call('PUT', '/api/account/callsign', { callsign: 'Brave Otter 33' }, bob);
check('and so does a guest\'s picker name', r.status === 422);
r = await call('PUT', '/api/account/callsign', { callsign: 'ACE' }, alice);
check('the holder may change its case', r.status === 200 && r.body.callsign === 'ACE');
r = await call('PUT', '/api/account/callsign', { callsign: 'Maverick' }, alice);
check('or change it', r.status === 200);
r = await call('PUT', '/api/account/callsign', { callsign: 'Ace' }, bob);
check('which frees the old one for anybody', r.status === 200 && r.body.callsign === 'Ace');
r = await call('POST', '/api/account/google', { credential: await idToken({ sub: 'alice' }) });
check('signing in again finds the same account', r.status === 200 && r.body.callsign === 'Maverick' && r.body.session !== alice);
const aliceLaptop = r.body.session;

console.log('the pilot key');
const desk = createIdentity(memoryStorage());
const deskKey = await desk.publicKey();
r = await call('PUT', '/api/account/identity', { identity: await desk.exportText() }, alice);
check('the first computer\'s pilot key goes to the account', r.status === 200 && r.body.publicKey === deskKey && JSON.parse(r.body.identity).publicRaw === deskKey);
const laptop = createIdentity(memoryStorage());
r = await call('PUT', '/api/account/identity', { identity: await laptop.exportText() }, aliceLaptop);
check('a later computer cannot replace it, and is given the account\'s', r.status === 200 && r.body.publicKey === deskKey);
r = await call('POST', '/api/account/google', { credential: await idToken({ sub: 'alice' }) });
check('a sign in hands the key back', JSON.parse(r.body.identity).publicRaw === deskKey && r.body.publicKey === deskKey);
const carried = createIdentity(memoryStorage());
await carried.importText(r.body.identity);
const signed = await carried.signBytes(new TextEncoder().encode('probe'));
check('and the key handed back signs as the first computer did', signed.key === deskKey);
const mismatched = JSON.parse(await laptop.exportText());
mismatched.publicRaw = deskKey;
r = await call('PUT', '/api/account/identity', { identity: JSON.stringify(mismatched) }, bob);
check('a key whose halves do not match is refused', r.status === 422);
r = await call('PUT', '/api/account/identity', { identity: 'not json' }, bob);
check('and junk is refused', r.status === 422);

console.log('a second computer\'s tracks');
const laptopKey = await laptop.publicKey();
const lapTrack = mapTrackDocument({ id: 'trk-0000c001', name: 'Laptop loop', gates: 3 });
const lapText = JSON.stringify(lapTrack);
const lapSigned = await laptop.signBytes(await trackMessage({ id: lapTrack.id, ts: 5, author: 'Maverick', documentText: lapText }));
r = await call('PUT', `/api/tracks/${lapTrack.id}`, { document: lapText, author: 'Maverick', ts: 5, ...lapSigned });
check('the laptop saved a track under its own key', r.status === 201 && r.body.owner === laptopKey);
const handOver = await laptop.signBytes(keyLinkMessage(laptopKey, deskKey));
r = await call('POST', '/api/account/adopt', { key: laptopKey, sig: (await desk.signBytes(keyLinkMessage(laptopKey, deskKey))).sig }, aliceLaptop);
check('an adopt the old key did not sign is refused', r.status === 401);
r = await call('POST', '/api/account/adopt', { key: laptopKey, sig: handOver.sig }, bob);
check('and one for an account the signature does not name', r.status === 409 || r.status === 401, `${r.status}`);
r = await call('POST', '/api/account/adopt', { key: laptopKey, sig: handOver.sig }, aliceLaptop);
check('the laptop hands its tracks to the account', r.status === 200 && r.body.tracks === 1, JSON.stringify(r.body));
r = await call('GET', `/api/tracks/${lapTrack.id}`);
check('which are then filed under the account\'s key', r.body.owner === deskKey);
const later = await carried.signBytes(await trackMessage({ id: lapTrack.id, ts: 6, author: 'Maverick', documentText: lapText }));
r = await call('PUT', `/api/tracks/${lapTrack.id}`, { document: lapText, author: 'Maverick', ts: 6, ...later });
check('so any computer of the account may save them', r.status === 200);
const row = env.DB;
const held = await row.prepare("SELECT identity FROM accounts WHERE sub = 'alice'").first();
const d = JSON.parse(await desk.exportText()).privateJwk.d;
check('the private key is sealed at rest', !held.identity.includes(d) && held.identity.startsWith('v1:'));
const wrongSecret = { ...env, ACCOUNTS_SECRET: 'another-secret' };
let unsealFailed = false;
try {
  const res = await worker.fetch(new Request('https://tracks.test/api/account/google', {
    method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify({ credential: await idToken({ sub: 'alice' }) }),
  }), wrongSecret);
  unsealFailed = res.status === 500;
} catch (e) {
  unsealFailed = true;
}
check('and a wrong ACCOUNTS_SECRET fails loudly rather than handing out junk', unsealFailed);

console.log('progress between computers');
r = await call('PUT', '/api/account/progress', {
  progress: { v: 1, data: { progress: { v: 1, xp: 120, courses: { a: true }, challenges: {}, seen: {}, casual: {}, unlockAll: false } }, stamps: {} },
}, alice);
check('the first sync is kept', r.status === 200 && r.body.progress.data.progress.xp === 120);
r = await call('PUT', '/api/account/progress', {
  progress: { v: 1, data: { progress: { v: 1, xp: 60, courses: { b: true }, challenges: {}, seen: {}, casual: {}, unlockAll: false } }, stamps: {} },
}, aliceLaptop);
check('a second computer\'s sync is merged, not written over', r.status === 200 && r.body.progress.data.progress.xp === 120
  && r.body.progress.data.progress.courses.a && r.body.progress.data.progress.courses.b);
r = await call('GET', '/api/account/progress', undefined, alice);
check('and the first computer reads the merge', r.status === 200 && r.body.progress.data.progress.courses.b === true);
r = await call('GET', '/api/account/progress', undefined, bob);
check('another account reads its own, not this one', r.status === 200 && !r.body.progress.data.progress);
r = await call('PUT', '/api/account/progress', { progress: { v: 1, data: { tune: 'x'.repeat(600 * 1024) }, stamps: {} } }, alice);
check('a blob past the cap is refused', r.status === 413);
r = await call('PUT', '/api/account/progress', { nope: true }, alice);
check('a sync with no blob is refused', r.status === 400);

console.log('signing out and deleting');
r = await call('DELETE', '/api/account/session', undefined, aliceLaptop);
check('signing out ends that session', r.status === 200);
r = await call('GET', '/api/account', undefined, aliceLaptop);
check('which then signs nobody in', r.status === 401);
r = await call('GET', '/api/account', undefined, alice);
check('and leaves the other computer signed in', r.status === 200 && r.body.callsign === 'Maverick');
r = await call('DELETE', '/api/account', undefined, alice);
check('an account can be deleted', r.status === 200 && r.body.deleted === true);
r = await call('GET', '/api/account', undefined, alice);
check('its sessions go with it', r.status === 401);
const gone = await env.DB.prepare("SELECT COUNT(*) AS n FROM accounts WHERE sub = 'alice'").first();
const left = await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions').first();
check('nothing of it is left in the database', gone.n === 0 && left.n === 1, `${gone.n} ${left.n}`);
r = await call('PUT', '/api/account/callsign', { callsign: 'Maverick' }, bob);
check('and its callsign is free', r.status === 200);
r = await call('POST', '/api/account/google', { credential: await idToken({ sub: 'alice' }) });
check('signing in again starts a new account from nothing', r.status === 200 && r.body.callsign === null && r.body.identity === null);

console.log('rate limits');
env = freshEnv();
ip = '198.51.100.7';
let codes = [];
for (let i = 0; i <= SIGNIN_LIMIT; i += 1) {
  /* eslint-disable-next-line no-await-in-loop */
  codes.push((await call('POST', '/api/account/google', { credential: await idToken({ sub: 'rate' }) })).status);
}
check(`${SIGNIN_LIMIT} sign ins from one address pass and the next is refused`, codes.slice(0, SIGNIN_LIMIT).every((c) => c === 200) && codes[SIGNIN_LIMIT] === 429, codes.join(','));
ip = '198.51.100.8';
r = await call('POST', '/api/account/google', { credential: await idToken({ sub: 'rate' }) });
check('another address is not held up by it', r.status === 200);
const s = r.body.session;
codes = [];
for (let i = 0; i <= ACCOUNT_WRITE_LIMIT; i += 1) {
  /* eslint-disable-next-line no-await-in-loop */
  codes.push((await call('PUT', '/api/account/callsign', { callsign: `Rate ${i}`, check: true }, s)).status);
}
check(`${ACCOUNT_WRITE_LIMIT} account writes pass and the next is refused`, codes.slice(0, ACCOUNT_WRITE_LIMIT).every((c) => c === 200) && codes[ACCOUNT_WRITE_LIMIT] === 429, codes.join(','));
r = await call('GET', '/api/account', undefined, s);
check('reads are not counted against it', r.status === 200);

console.log('switched off');
env = freshEnv({ GOOGLE_CLIENT_ID: '' });
r = await call('POST', '/api/account/google', { credential: await idToken() });
check('with no client id every account route answers 503', r.status === 503);
env = freshEnv({ ACCOUNTS_SECRET: '' });
r = await call('POST', '/api/account/google', { credential: await idToken() });
check('and with no accounts secret', r.status === 503);
r = await call('GET', '/api/health');
check('while the tracks server itself goes on', r.status === 200);

jwksServer.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
