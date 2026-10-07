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

import worker from './worker.js';
import { openD1 } from './d1sqlite.js';
import { googleKeys, verifyGoogleIdToken } from './google.js';
import { inspectCallsign, looksLikePickerName, parseClientIds } from './accounts.js';
import { ACCOUNT_WRITE_LIMIT, SIGNIN_LIMIT } from './limits.js';
import {
  createIdentity, keyLinkMessage, memoryStorage, trackMessage,
} from '../src/share/identity.js';
import { mapTrackDocument } from '../tests/lib/maptrack.js';
import {
  blobRefusal, cleanBlob, mergeBlobs, pickSynced, stampChanges,
} from '../src/share/progressmerge.js';
import { BUILD_MAX_CHARS, COMBAT_MAX_ENTRIES, MAX_BUILDS } from './limits.js';
import { buildsBlob, buildsFromBlob, normaliseFit } from '../src/ui/builds.js';
import { newDecal, MAX_DECALS } from '../configs/paint.js';
import {
  FLIGHT_DEVICES_MAX, addFlight, flightTotals, mergeFlightTime,
} from '../src/share/flighttime.js';

const CLIENT_ID = 'selftest-client.apps.googleusercontent.com';
const OLD_CLIENT_ID = 'selftest-client-old.apps.googleusercontent.com';
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
  const opts = { clientIds: [CLIENT_ID, OLD_CLIENT_ID], key, nowS };
  let v = await verifyGoogleIdToken(await idToken({ sub: '42' }), opts);
  check('a good token names its subject', v.sub === '42', JSON.stringify(v));
  v = await verifyGoogleIdToken(await idToken({ sub: '42', aud: CLIENT_ID }), opts);
  check('a token for the new client id verifies', v.sub === '42', JSON.stringify(v));
  v = await verifyGoogleIdToken(await idToken({ sub: '42', aud: OLD_CLIENT_ID }), opts);
  check('and so does one for the old client id, during the transition', v.sub === '42', JSON.stringify(v));
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
  v = await verifyGoogleIdToken(good, { ...opts, clientIds: [] });
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

console.log('GOOGLE_CLIENT_ID, a comma separated list');
check('one id, no commas', JSON.stringify(parseClientIds(CLIENT_ID)) === JSON.stringify([CLIENT_ID]));
check(
  'the new id first, then the old one, during a transition',
  JSON.stringify(parseClientIds(`${CLIENT_ID},${OLD_CLIENT_ID}`)) === JSON.stringify([CLIENT_ID, OLD_CLIENT_ID]),
);
check(
  'blanks from stray commas and surrounding space are dropped',
  JSON.stringify(parseClientIds(` ${CLIENT_ID} ,, ${OLD_CLIENT_ID},`)) === JSON.stringify([CLIENT_ID, OLD_CLIENT_ID]),
);
check('unset is an empty list, sign-in off', parseClientIds(undefined).length === 0);
check('a list of nothing but commas is also an empty list, sign-in off', parseClientIds(' , , ').length === 0);

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
  /* Progress v2 (src/game/progress.js PROGRESS_VERSION) meeting a v1
   * computer: the firsts already paid survive, and the merge stays v2, so
   * no load migrates it again and pays them twice. */
  const v2 = mergeBlobs(
    { v: 1, data: { progress: { v: 1, xp: 50, courses: {}, challenges: {}, seen: {}, casual: {}, unlockAll: false } }, stamps: {} },
    { v: 1, data: { progress: { v: 2, xp: 40, courses: {}, challenges: {}, seen: {}, casual: {}, firsts: { 'mission:itaipu-1:win': true }, unlockAll: false } }, stamps: {} },
  );
  check('firsts paid are the union, and an older computer cannot lower the version', v2.data.progress.v === 2 && v2.data.progress.firsts['mission:itaipu-1:win'] === true, JSON.stringify(v2.data.progress));
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
  const firstSync = mergeBlobs(
    { v: 1, data: { rates: { v: 'defaults' }, tuning: { cub1400: { cg: 0 }, zagi1219: { cg: 5 } } }, stamps: {} },
    { v: 1, data: { rates: { v: 'tuned' }, tuning: { cub1400: { cg: 3 } } }, stamps: {} },
  );
  check('a computer\'s first sync, stamping nothing, takes the account\'s tunes over its own',
    firstSync.data.rates.v === 'tuned' && firstSync.data.tuning.cub1400.cg === 3);
  check('and keeps its own where the account has none', firstSync.data.tuning.zagi1219.cg === 5);
  const stamps = stampChanges({ tuning: { a: 1, b: 2 }, rates: { x: 1 } }, { tuning: { a: 1 }, rates: { x: 0 } }, 77);
  check('a computer stamps exactly the parts it changed', stamps['tuning/b'] === 77 && stamps.rates === 77 && !('tuning/a' in stamps));
}

console.log('flight time follows the account, and is never counted twice or lost');
{
  /*
   * src/share/flighttime.js: one grow only slot per browser, merged
   * counter by counter to the larger. The cases the rule exists for: two
   * computers flying offline, a sync sent twice, merges in any order, an
   * old copy of a slot meeting a newer one, and the seconds flown while a
   * sync was out (src/ui/accountui.js apply).
   */
  const DESK = 'deskdevice01';
  const LAPTOP = 'laptopdev002';
  const flown = (rec, dev, af, act, n, day = '2026-10-01') => addFlight(rec, dev, af, act, n, day);
  const blob = (flightTime) => ({ v: 1, data: { flightTime }, stamps: {} });
  const total = (rec) => flightTotals(rec).seconds;

  /* Both start from the account as it was: 100 s on the desk. */
  const account = flown({}, DESK, 'cub1400', 'free', 100, '2026-09-20');
  /* Offline, the desk flies 60 s more and the laptop 45 s, of its own. */
  const desk = flown(account, DESK, 'cub1400', 'race', 60);
  const laptop = flown(account, LAPTOP, 'striker2500', 'war', 45, '2026-10-02');
  let m = mergeBlobs(blob(desk), blob(account));
  m = mergeBlobs(blob(laptop), m);
  check('two computers flying offline: both keep their time, summed', total(m.data.flightTime) === 205, `${total(m.data.flightTime)}`);
  check('the same two merged the other way round give the same record',
    JSON.stringify(mergeBlobs(blob(desk), mergeBlobs(blob(laptop), blob(account))).data.flightTime) === JSON.stringify(m.data.flightTime));
  const twice = mergeBlobs(blob(laptop), mergeBlobs(blob(desk), m));
  check('a slot sent again is not counted again', total(twice.data.flightTime) === 205 && JSON.stringify(twice.data.flightTime) === JSON.stringify(m.data.flightTime));
  check('an old copy of a slot does not take time away', total(mergeBlobs(blob(account), m).data.flightTime) === 205);
  const t = flightTotals(m.data.flightTime);
  check('split by aircraft', t.byAirframe.cub1400 === 160 && t.byAirframe.striker2500 === 45);
  check('split by activity', t.byActivity.free === 100 && t.byActivity.race === 60 && t.byActivity.war === 45);
  check('the first flight is the earliest day on any computer', t.first === '2026-09-20');

  /* The round trip: the desk sent 160 s, flew 7 s more while the answer
   * was out, and merges the answer with what it holds now. */
  const answer = mergeBlobs(blob(desk), m).data.flightTime;
  const deskNow = flown(desk, DESK, 'cub1400', 'race', 7);
  const applied = mergeFlightTime(deskNow, answer);
  check('the seconds flown during a sync survive its answer', total(applied) === 212, `${total(applied)}`);
  check('put over it, they would not (the trap the merge on apply closes)', total(answer) === 205);
  check('the merge is idempotent', JSON.stringify(mergeFlightTime(applied, applied)) === JSON.stringify(applied));
  check('one record has one spelling whatever order it was built in',
    JSON.stringify(mergeFlightTime(laptop, desk)) === JSON.stringify(mergeFlightTime(desk, laptop)));

  const junk = cleanBlob(blob({
    'BAD ID': { by: { cub1400: { free: 5 } } },
    okdevice01: { by: { cub1400: { free: -3, race: 1.5, war: 9 }, 'no way': { free: 1 } }, first: 'yesterday' },
  }));
  check('wrong shapes are dropped: a bad device, a negative, a fraction, a bad aircraft and a bad day',
    JSON.stringify(junk.data.flightTime) === JSON.stringify({ okdevice01: { by: { cub1400: { war: 9 } } } }), JSON.stringify(junk.data.flightTime));
  check('a section that is not a map is refused', blobRefusal(blob([1, 2]))?.why === 'map');
  const many = Object.fromEntries(Array.from({ length: FLIGHT_DEVICES_MAX + 1 }, (_, i) => [`dev${String(i).padStart(6, '0')}`, { by: { cub1400: { free: 1 } } }]));
  check(`more than ${FLIGHT_DEVICES_MAX} device slots is refused, not trimmed`, blobRefusal(blob(many))?.status === 413);
  check('flight time is a synced section, read from the settings', pickSynced({ flightTime: account, graphics: 'low' }).flightTime[DESK].by.cub1400.free === 100);
  check('an account that never flew gets no section', !('flightTime' in mergeBlobs({ v: 1, data: {}, stamps: {} }, null).data));
}

console.log('the voice notice follows the account');
{
  /* src/ui/voiceui.js: a pilot told that voice is kept in replays, who
   * said yes on one computer, is not asked again on another, and a
   * computer that never answered does not take it back. */
  const said = { v: 1, data: { voiceReplayAck: true }, stamps: {} };
  const never = { v: 1, data: { voiceReplayAck: false }, stamps: { voiceReplayAck: 9e12 } };
  check('the answer is a synced section, read from the settings', pickSynced({ voiceReplayAck: true, graphics: 'low' }).voiceReplayAck === true);
  check('yes on either side is yes, whichever was sent and however stamped', mergeBlobs(said, never).data.voiceReplayAck === true && mergeBlobs(never, said).data.voiceReplayAck === true);
  check('no on both stays no, and an account that never had it gets none', mergeBlobs(never, never).data.voiceReplayAck === false
    && !('voiceReplayAck' in mergeBlobs({ v: 1, data: {}, stamps: {} }, null).data));
  check('anything but true or false is dropped', !('voiceReplayAck' in cleanBlob({ v: 1, data: { voiceReplayAck: 'yes' } }).data)
    && mergeBlobs({ v: 1, data: { voiceReplayAck: 1 } }, null).data.voiceReplayAck === undefined);
}

console.log('My Hangar and the loadouts in the merge');
const build = (id, name, extra = {}) => ({
  id, name, airframe: 'timber1500', fit: { livery: null, power: null, parts: null, tuning: null, combat: null }, created: 1000, updated: 1000, ...extra,
});
{
  const desk = {
    v: 1,
    data: {
      builds: { b1: build('b1', 'Bush'), b2: build('b2', 'Survey') },
      combat: { striker2500: { payload: 'standard', accessories: [], propulsion: 'jet' } },
    },
    stamps: { 'builds/b1': 1000, 'builds/b2': 2000, 'combat/striker2500': 2000 },
  };
  const laptop = {
    v: 1,
    data: {
      builds: { b1: build('b1', 'Bush renamed', { updated: 3000 }), b3: build('b3', 'Floats') },
      combat: { striker2500: { payload: 'wide', accessories: [], propulsion: 'prop' }, '7inch': { payload: 'wide', accessories: ['pack2'] } },
    },
    stamps: { 'builds/b1': 3000, 'builds/b3': 500, 'combat/striker2500': 1000, 'combat/7inch': 1500 },
  };
  let m = mergeBlobs(desk, laptop);
  check('builds from both computers are all kept, one per id', Object.keys(m.data.builds).sort().join() === 'b1,b2,b3');
  check('a build changed on both, the newer stamp wins', m.data.builds.b1.name === 'Bush renamed' && m.stamps['builds/b1'] === 3000);
  check('loadouts merge by airframe, the newer stamp wins each', m.data.combat.striker2500.propulsion === 'jet' && m.data.combat['7inch'].payload === 'wide');
  /* The desk deletes Survey after the laptop last changed it: the id
   * stamped and absent is the tombstone. */
  const deleted = { v: 1, data: { ...m.data, builds: { b1: m.data.builds.b1, b3: m.data.builds.b3 } }, stamps: { ...m.stamps, 'builds/b2': 4000 } };
  m = mergeBlobs(deleted, m);
  check('a build deleted on one computer is gone from the merge', !('b2' in m.data.builds) && m.stamps['builds/b2'] === 4000);
  m = mergeBlobs(laptop, m);
  check('and the other computer, still holding it, does not bring it back', !('b2' in m.data.builds), Object.keys(m.data.builds).join());
  m = mergeBlobs({ v: 1, data: { builds: { b2: build('b2', 'Survey', { updated: 5000 }) } }, stamps: { 'builds/b2': 5000 } }, m);
  check('but one changed there after the delete is kept, the later edit winning', m.data.builds.b2 && m.data.builds.b2.updated === 5000);
  m = mergeBlobs({ v: 1, data: { progress: { v: 1, xp: 1 } }, stamps: {} }, m);
  check('a sync from a version before the builds synced deletes none of them', Object.keys(m.data.builds).sort().join() === 'b1,b2,b3' && m.data.combat.striker2500.propulsion === 'jet');
  const junk = cleanBlob({
    v: 1,
    data: {
      builds: { ok1: build('ok1', 'Fine'), 'Bad Id': build('Bad Id', 'x'), noname: { ...build('noname', ''), name: '' }, lie: build('other', 'Lie') },
      combat: { striker2500: { payload: 'standard', accessories: ['whip'] }, '7inch': { payload: 3, accessories: [] }, '10inch': 'wide' },
    },
    stamps: {},
  });
  check('a held build or loadout of the wrong shape is dropped, the rest kept',
    Object.keys(junk.data.builds).join() === 'ok1' && Object.keys(junk.data.combat).join() === 'striker2500', JSON.stringify(Object.keys(junk.data.builds)));
  const back = buildsFromBlob(buildsBlob([build('zz', 'Late', { created: 9000 }), build('aa', 'Early', { created: 10 })]));
  check('builds round trip through the blob, oldest first', back.map((b) => b.id).join() === 'aa,zz' && back[0].name === 'Early');
}
{
  const many = Object.fromEntries(Array.from({ length: MAX_BUILDS + 1 }, (_, i) => [`b${i}`, build(`b${i}`, `B ${i}`)]));
  const full = Object.fromEntries(Object.entries(many).slice(0, MAX_BUILDS));
  check(`${MAX_BUILDS} builds sent are taken`, blobRefusal({ v: 1, data: { builds: full } }) === null);
  check('one more is refused, too big', blobRefusal({ v: 1, data: { builds: many } })?.status === 413);
  const fat = build('fat', 'Fat', { fit: { livery: { pad: 'x'.repeat(BUILD_MAX_CHARS) } } });
  check('a build past its cap is refused, too big', blobRefusal({ v: 1, data: { builds: { fat } } })?.status === 413);
  check('a build of the wrong shape is refused', blobRefusal({ v: 1, data: { builds: { b1: { name: 'x' } } } })?.status === 422);
  check('and so is a builds section that is not a map', blobRefusal({ v: 1, data: { builds: [] } })?.status === 422);
  const loadouts = Object.fromEntries(Array.from({ length: COMBAT_MAX_ENTRIES + 1 }, (_, i) => [`q${i}`, { payload: 'standard', accessories: [] }]));
  check('more loadouts than the cap are refused, too big', blobRefusal({ v: 1, data: { combat: loadouts } })?.status === 413);
  check('a loadout of the wrong shape is refused', blobRefusal({ v: 1, data: { combat: { striker2500: { payload: 'x', accessories: 'whip' } } } })?.status === 422);
  /* The biggest build a pilot can paint, held to the same judge as the
   * hangar's (normaliseFit): every decal the paint shop allows. */
  const decals = Array.from({ length: MAX_DECALS }, () => newDecal('text', [0.123456, -0.654321, 0.234567], [0.577, 0.577, 0.577]));
  const painted = normaliseFit('timber1500', { livery: { scheme: 'timber_x', decals, wear: 100 } });
  const big = JSON.stringify(build('big', 'W'.repeat(32), { fit: painted })).length;
  check('a build with every decal the paint shop allows fits its cap', painted.livery.decals.length === MAX_DECALS && big < BUILD_MAX_CHARS, `${big}`);
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
    DB: openD1(':memory:').DB, ADMIN_SECRET: 'x', GOOGLE_CLIENT_ID: `${CLIENT_ID},${OLD_CLIENT_ID}`, ACCOUNTS_SECRET: 'selftest-accounts-secret', GOOGLE_JWKS_URL: JWKS_URL, ...extra,
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
check('and its own id, for the rooms server\'s DEV_ACCOUNTS', Number.isInteger(r.body.id) && r.body.id > 0, JSON.stringify(r.body));

r = await call('POST', '/api/account/google', { credential: await idToken({ sub: 'alice', aud: OLD_CLIENT_ID }) });
check('the same sub through the old client id signs in too', r.status === 200, JSON.stringify(r.body));
const aliceAgain = r.body.session;
check('and it is a session of its own, not alice\'s first one', aliceAgain !== alice);
r = await call('GET', '/api/account', undefined, aliceAgain);
check('reaching the very same account: her callsign, set under the new client id', r.status === 200 && r.body.callsign === 'Ace', JSON.stringify(r.body));

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
r = await call('PUT', '/api/account/progress', {
  progress: { v: 1, data: { builds: { b1: build('b1', 'Bush'), b2: build('b2', 'Survey') }, combat: { striker2500: { payload: 'wide', accessories: [], propulsion: 'jet' } } }, stamps: {} },
}, alice);
check('the builds and a loadout go up with the progress', r.status === 200 && Object.keys(r.body.progress.data.builds).sort().join() === 'b1,b2'
  && r.body.progress.data.combat.striker2500.propulsion === 'jet', JSON.stringify(r.body));
r = await call('GET', '/api/account/progress', undefined, aliceLaptop);
check('and the other computer reads them', r.status === 200 && r.body.progress.data.builds.b2.name === 'Survey');
r = await call('PUT', '/api/account/progress', {
  progress: { v: 1, data: { builds: { b1: build('b1', 'Bush') }, combat: {} }, stamps: { 'builds/b2': Date.now() } },
}, aliceLaptop);
check('a delete there is kept as one', r.status === 200 && !r.body.progress.data.builds.b2 && r.body.progress.data.combat.striker2500);
r = await call('PUT', '/api/account/progress', {
  progress: { v: 1, data: { builds: { b1: build('b1', 'Bush'), b2: build('b2', 'Survey') } }, stamps: {} },
}, alice);
check('and the first computer, sending it again unchanged, does not bring it back', r.status === 200 && !r.body.progress.data.builds.b2);
r = await call('PUT', '/api/account/progress', {
  progress: { v: 1, data: { builds: Object.fromEntries(Array.from({ length: MAX_BUILDS + 1 }, (_, i) => [`x${i}`, build(`x${i}`, `X ${i}`)])) }, stamps: {} },
}, alice);
check('a sync with more builds than a computer holds is refused, and says why', r.status === 413 && /builds/.test(r.body.error), JSON.stringify(r.body));
{
  /* Two computers' flight time through the server, each sent while the
   * other's was not yet seen, then each sent again. */
  const deskFlight = addFlight({}, 'deskdevice01', 'cub1400', 'free', 300, '2026-10-01');
  const laptopFlight = addFlight({}, 'laptopdev002', 'zagi1219', 'race', 120, '2026-10-02');
  r = await call('PUT', '/api/account/progress', { progress: { v: 1, data: { flightTime: deskFlight }, stamps: {} } }, alice);
  check('flight time goes up with the progress', r.status === 200 && flightTotals(r.body.progress.data.flightTime).seconds === 300, JSON.stringify(r.body));
  r = await call('PUT', '/api/account/progress', { progress: { v: 1, data: { flightTime: laptopFlight }, stamps: {} } }, aliceLaptop);
  check('a second computer\'s flight time is added to it, not written over it', r.status === 200 && flightTotals(r.body.progress.data.flightTime).seconds === 420);
  r = await call('PUT', '/api/account/progress', { progress: { v: 1, data: { flightTime: deskFlight }, stamps: {} } }, alice);
  check('and the first computer sending the same again counts nothing twice', r.status === 200 && flightTotals(r.body.progress.data.flightTime).seconds === 420);
  r = await call('GET', '/api/account/progress', undefined, aliceLaptop);
  check('both computers read the sum', r.status === 200 && flightTotals(r.body.progress.data.flightTime).seconds === 420
    && flightTotals(r.body.progress.data.flightTime).first === '2026-10-01');
}
r = await call('PUT', '/api/account/progress', { progress: { v: 1, data: { builds: { b1: { name: 'no airframe' } } }, stamps: {} } }, alice);
check('and one with a build of the wrong shape', r.status === 422);
r = await call('GET', '/api/account/progress', undefined, alice);
check('neither changed what the account holds', Object.keys(r.body.progress.data.builds).join() === 'b1');

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

console.log('the beta waitlist');
env = freshEnv({ INVITE_ONLY: '1' });
ip = '198.51.100.20';
{
  const mail = (email, sub) => idToken({ sub, extra: { email } });
  const admin = (method, body, secret = 'x') => call(method, '/api/admin/waitlist', body, secret);
  r = await call('POST', '/api/account/google', { credential: await mail('new@example.com', 'w1') });
  check('by invite only, a Google account nobody invited is refused', r.status === 403 && r.body.notInvited === true, JSON.stringify(r.body));
  r = await call('GET', '/api/account', undefined, 'a'.repeat(64));
  check('and holds no session', r.status === 401);
  r = await call('POST', '/api/waitlist', { credential: await mail('New@Example.com', 'w1') });
  check('it can ask for a place', r.status === 200 && r.body.approved === false, JSON.stringify(r.body));
  r = await call('POST', '/api/waitlist', { credential: await mail('new@example.com', 'w1') });
  check('asking twice is one place', r.status === 200 && r.body.approved === false);
  r = await call('POST', '/api/account/google', { credential: await mail('new@example.com', 'w1') });
  check('waiting is still not invited', r.status === 403);
  r = await call('POST', '/api/waitlist', { credential: await idToken({ extra: { email: 'loose@example.com', email_verified: false } }) });
  check('an address Google did not verify gets no place', r.status === 422);
  r = await call('POST', '/api/waitlist', { credential: await idToken({ key: forger.privateKey }) });
  check('nor does a forged token', r.status === 401);
  r = await admin('GET', undefined, 'wrong');
  check('the list is the admin\'s alone', r.status === 401);
  r = await admin('GET');
  check('the admin sees who waits, lowercased, once',
    r.status === 200 && r.body.waitlist.length === 1 && r.body.waitlist[0].email === 'new@example.com'
    && r.body.waitlist[0].requestedUtc && r.body.waitlist[0].approvedUtc === null, JSON.stringify(r.body));
  r = await admin('POST', { email: 'new@example.com', approved: true }, 'wrong');
  check('and nobody else approves', r.status === 401);
  r = await admin('POST', { email: 'not an address', approved: true });
  check('a typo is not an address', r.status === 400);
  r = await admin('POST', { email: ' NEW@example.com ', approved: true });
  check('the admin approves an address', r.status === 200 && r.body.approved === true);
  r = await call('POST', '/api/account/google', { credential: await mail('other@example.com', 'w2') });
  check('which lets nobody else in', r.status === 403);
  r = await call('POST', '/api/account/google', { credential: await mail('new@example.com', 'w1') });
  check('the invited account signs in', r.status === 200 && typeof r.body.session === 'string', JSON.stringify(r.body));
  r = await call('POST', '/api/waitlist', { credential: await mail('new@example.com', 'w1') });
  check('asking again keeps the invite', r.status === 200 && r.body.approved === true);
  r = await call('POST', '/api/account/google', { credential: await idToken({ sub: 'w1', extra: { email: 'new@example.com', email_verified: false } }) });
  check('an account that exists signs in whatever its token says of the email', r.status === 200);
  r = await admin('POST', { email: 'new@example.com', approved: false });
  r = await call('POST', '/api/account/google', { credential: await mail('new@example.com', 'w1') });
  check('and after its invite is taken back', r.status === 200);
  r = await admin('POST', { email: 'early@example.com', approved: true });
  r = await call('POST', '/api/account/google', { credential: await mail('early@example.com', 'w3') });
  check('an address invited before it asked signs in', r.status === 200);
  r = await call('POST', '/api/account/google', { credential: await idToken({ sub: 'w4', extra: { email: 'early@example.com', email_verified: false } }) });
  check('but not on an email Google did not verify', r.status === 403);
  r = await admin('DELETE', { email: 'early@example.com' });
  const gone = await admin('GET');
  check('the admin removes an address', r.status === 200 && !gone.body.waitlist.some((w) => w.email === 'early@example.com'));
  r = await admin('DELETE', { email: 'early@example.com' });
  check('once', r.status === 404);
  console.log('the invite email');
  {
    const sent = [];
    let broken = false;
    env.SEND_MAIL = async (m) => {
      if (broken) {
        throw new Error('smtp said no');
      }
      sent.push(m);
    };
    r = await admin('POST', { email: 'mail1@example.com', approved: true });
    check('inviting an address emails it', r.status === 200 && r.body.mailed === true && sent.length === 1 && sent[0].to === 'mail1@example.com', JSON.stringify(r.body));
    check('in English and Spanish, with the way in and the address to sign in with',
      /beta invite/.test(sent[0].subject) && /invitación/.test(sent[0].subject) && sent[0].text.includes('https://paraguayandronecombatsimulator.com')
      && sent[0].text.includes('mail1@example.com') && /Entrar al simulador/.test(sent[0].text) && sent[0].html.includes('<a href="https://paraguayandronecombatsimulator.com">'),
      JSON.stringify(sent[0]));
    r = await admin('POST', { email: 'mail1@example.com', approved: true });
    check('inviting it again does not email it twice', r.body.mailed === true && sent.length === 1);
    r = await admin('GET');
    check('the list says when it was emailed', Boolean(r.body.waitlist.find((w) => w.email === 'mail1@example.com').mailedUtc));
    await call('POST', '/api/waitlist', { credential: await mail('asked@example.com', 'm2') });
    r = await admin('POST', { email: 'asked@example.com', approved: true });
    check('approving an address that asked emails it too', r.body.mailed === true && sent.length === 2 && sent[1].to === 'asked@example.com');
    broken = true;
    r = await admin('POST', { email: 'mail3@example.com', approved: true });
    check('a mail server that refuses leaves the invite standing and says why',
      r.status === 200 && r.body.approved === true && r.body.mailed === false && r.body.mailError === 'smtp said no', JSON.stringify(r.body));
    broken = false;
    const first = (await admin('GET')).body.waitlist.find((w) => w.email === 'mail3@example.com');
    r = await admin('POST', { email: 'mail3@example.com', approved: true });
    const second = (await admin('GET')).body.waitlist.find((w) => w.email === 'mail3@example.com');
    check('asking again sends the email that did not go, and keeps the invite\'s date',
      r.body.mailed === true && sent.length === 3 && !first.mailedUtc && Boolean(second.mailedUtc) && second.approvedUtc === first.approvedUtc);
    await admin('POST', { email: 'mail1@example.com', approved: false });
    r = await admin('POST', { email: 'mail1@example.com', approved: true });
    check('an invite taken back and given again is emailed again', r.body.mailed === true && sent.length === 4);
    delete env.SEND_MAIL;
    r = await admin('POST', { email: 'mail5@example.com', approved: true });
    check('with no mail set up the invite stands and the answer says so', r.body.approved === true && r.body.mailed === false && /not set up/.test(r.body.mailError));
    for (const e of ['mail1@example.com', 'asked@example.com', 'mail3@example.com', 'mail5@example.com']) {
      /* eslint-disable-next-line no-await-in-loop */
      await admin('DELETE', { email: e });
    }
  }

  console.log('the admin page');
  env.ADMIN_EMAILS = ' Owner@Example.com ,second@example.com';
  r = await call('GET', '/api/admin/overview', undefined, await mail('owner@example.com', 'adm1'));
  check('an admin\'s Google token opens the admin routes', r.status === 200, JSON.stringify(r.body));
  r = await call('GET', '/api/admin/overview', undefined, await mail('new@example.com', 'w1'));
  check('a member\'s does not', r.status === 401);
  r = await call('GET', '/api/admin/overview', undefined, await idToken({ extra: { email: 'owner@example.com', email_verified: false } }));
  check('nor the admin\'s address unverified', r.status === 401);
  r = await call('GET', '/api/admin/overview', undefined, await idToken({ key: forger.privateKey, extra: { email: 'owner@example.com' } }));
  check('nor forged', r.status === 401);
  r = await call('GET', '/api/admin/overview', undefined, await idToken({ exp: nowS - 3600, extra: { email: 'owner@example.com' } }));
  check('nor expired', r.status === 401);
  r = await call('GET', '/api/admin/overview', undefined, await idToken({ aud: 'someone-else.apps.googleusercontent.com', extra: { email: 'owner@example.com' } }));
  check('nor made for another site', r.status === 401);
  env.ADMIN_EMAILS = '';
  r = await call('GET', '/api/admin/overview', undefined, await mail('owner@example.com', 'adm1'));
  check('and with no admins named, no token does', r.status === 401);
  r = await call('GET', '/api/admin/overview');
  check('the overview is the admin\'s alone', r.status === 401);
  r = await call('GET', '/api/admin/accounts', undefined, 'wrong');
  check('and so are the members', r.status === 401);
  r = await call('GET', '/api/admin/overview', undefined, 'x');
  check('the overview counts the accounts, the live sessions and the list',
    r.status === 200 && r.body.accounts === 2 && r.body.sessions === 4 && r.body.waiting === 1 && r.body.invited === 0
    && r.body.inviteOnly === true && r.body.callsigns === 0 && r.body.upS >= 0, JSON.stringify(r.body));
  const w1 = (await call('POST', '/api/account/google', { credential: await mail('new@example.com', 'w1') })).body.session;
  await call('PUT', '/api/account/callsign', { callsign: 'Listed' }, w1);
  r = await call('GET', '/api/admin/accounts', undefined, 'x');
  check('the members are callsigns and dates, newest first, and no email',
    r.status === 200 && r.body.accounts.length === 2 && r.body.accounts.some((a) => a.callsign === 'Listed')
    && r.body.accounts.every((a) => a.createdUtc && !('email' in a) && !('sub' in a)), JSON.stringify(r.body));
}
env = freshEnv();
r = await call('POST', '/api/account/google', { credential: await idToken({ sub: 'open-1' }) });
check('without INVITE_ONLY anybody signs in, as before', r.status === 200);
{
  const before = freshEnv({ INVITE_ONLY: '1' });
  env = { ...before, INVITE_ONLY: '' };
  await call('POST', '/api/account/google', { credential: await idToken({ sub: 'veteran' }) });
  env = before;
  r = await call('POST', '/api/account/google', { credential: await idToken({ sub: 'veteran' }) });
  check('a pilot from before the waitlist keeps signing in once it is on', r.status === 200);
}

console.log('switched off');
env = freshEnv({ GOOGLE_CLIENT_ID: '' });
r = await call('POST', '/api/account/google', { credential: await idToken() });
check('with no client id every account route answers 503', r.status === 503);
env = freshEnv({ GOOGLE_CLIENT_ID: ' , ,' });
r = await call('POST', '/api/account/google', { credential: await idToken() });
check('and so does a list that parses to no ids at all', r.status === 503);
env = freshEnv({ ACCOUNTS_SECRET: '' });
r = await call('POST', '/api/account/google', { credential: await idToken() });
check('and with no accounts secret', r.status === 503);
r = await call('GET', '/api/health');
check('while the tracks server itself goes on', r.status === 200);

jwksServer.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
