/*
 * move-selftest.js: the guest's move to the game's own domain
 * (src/share/move.js), in Node.
 *
 *     node scripts/move-selftest.js      (npm run move:selftest)
 *
 * The pack: what goes and what does not, the guest key a signed in
 * browser sends, the round trip through deflate and base64url, the parts
 * and their digest. The receiver: it only bounces a domain with no game
 * state, takes only a pack it asked for, strips the fragment, keeps the
 * path and query across the bounce, and never sends a pack anywhere but
 * the domain. Then the whole round trip, sender and receiver against two
 * stand in windows, including a pack long enough to need three parts.
 * The real browsers and origins are scripts/move-check.js.
 *
 * Nothing here touches a network.
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

import { randomBytes } from 'node:crypto';
import {
  EXCLUDED, FRAGMENT, MARKER_KEY, MOVE_PAGE, MOVE_TARGET, PART_CHARS,
  askUrl, decodePack, encodePack, entriesOf, moveIn, moveOut, parsePart, partsOf, returnUrl, safeBack,
} from '../src/share/move.js';

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

class Storage {
  constructor(entries = {}) {
    this.map = new Map(Object.entries(entries));
  }

  get length() {
    return this.map.size;
  }

  key(i) {
    return [...this.map.keys()][i] ?? null;
  }

  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }

  setItem(k, v) {
    this.map.set(k, String(v));
  }

  removeItem(k) {
    this.map.delete(k);
  }

  plain() {
    return Object.fromEntries(this.map);
  }
}

/* A window at `url`, whose location.replace records where it went and
 * settles `left`. moveIn never settles once it has sent the page away (the
 * page is leaving), so a test waits on `left` for that, never on a timer:
 * under load a timer can fire before the async ask has gone. */
function windowAt(url, { local = new Storage(), session = new Storage(), userAgent = 'Mozilla/5.0 Chrome/140' } = {}) {
  let markLeft;
  const left = new Promise((r) => {
    markLeft = r;
  });
  const win = { localStorage: local, sessionStorage: session, navigator: { userAgent, webdriver: false }, went: null, left };
  const set = (href) => {
    const u = new URL(href);
    win.location = {
      href: u.href, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash,
      replace: (to) => {
        win.went = to;
        markLeft(to);
      },
    };
  };
  set(url);
  win.history = {
    state: null,
    replaceState: (state, title, to) => set(new URL(to, win.location.href).href),
  };
  return win;
}

/* A wait that never ends would hang CI instead of failing a row, so every
 * wait on a page leaving also gives up, loudly, after this long. */
const STUCK_MS = 10000;
function leftOrStuck(win) {
  let timer;
  const stuck = new Promise((r) => {
    timer = setTimeout(() => r('stuck'), STUCK_MS);
  });
  return Promise.race([win.left, stuck]).finally(() => clearTimeout(timer));
}

const pageThere = () => Promise.resolve(new Response('', { status: 200 }));
const pageGone = () => Promise.resolve(new Response('', { status: 404 }));

const GUEST = {
  'webfpv.settings.v3': JSON.stringify({ airframe: '5inch', stars: { m1: 3 }, credits: 120 }),
  'webfpv.builds.v1': JSON.stringify({ v: 1, builds: [{ name: 'Mine' }] }),
  'webfpv.pilot.key.v1': '{"v":1,"privateJwk":{"d":"guest-secret"},"publicRaw":"guestpub"}',
  'webfpv.pilot.name': 'Ada',
  'webfpv_stick_map_v1': '{"roll":0}',
  'webfpv.trackbuilder.library.v1': '[]',
  'fdfpv.voice': '{"on":true}',
  'fdfpv.rooms': 'https://129.151.39.48',
  'webfpv.tracks.origin': 'https://129.151.39.48',
  'webfpv.board.origin': 'https://129.151.39.48/board',
  'webfpv.probe': '1',
  'another.fdflabs.page': 'not the game',
};

console.log('the pack');
{
  const e = entriesOf(new Storage(GUEST));
  check('the game\'s keys go, settings, builds, key, name, stick map, library and voice',
    ['webfpv.settings.v3', 'webfpv.builds.v1', 'webfpv.pilot.key.v1', 'webfpv.pilot.name', 'webfpv_stick_map_v1', 'webfpv.trackbuilder.library.v1', 'fdfpv.voice']
      .every((k) => e[k] === GUEST[k]), Object.keys(e).join(' '));
  check('the server overrides do not, nor the storage probe', ['fdfpv.rooms', 'webfpv.tracks.origin', 'webfpv.board.origin', 'webfpv.probe'].every((k) => !(k in e)));
  check('nor the board override under its new name', !('fdfpv.board.origin' in entriesOf(new Storage({ ...GUEST, 'fdfpv.board.origin': 'https://x.example/board' }))));
  check('another page\'s keys on the same origin do not', !('another.fdflabs.page' in e));
  check('the account session is excluded by name', EXCLUDED.has('webfpv.account.v1') && EXCLUDED.has('webfpv.account.synced.v1'));
}
{
  const signedIn = new Storage({
    ...GUEST,
    'webfpv.pilot.key.v1': '{"v":1,"privateJwk":{"d":"ACCOUNT-secret"},"publicRaw":"acct"}',
    'webfpv.pilot.key.guest.v1': GUEST['webfpv.pilot.key.v1'],
    'webfpv.account.v1': JSON.stringify({ session: 'S3SS10N', callsign: 'ADA', publicKey: 'acct', keyIsAccounts: true }),
    'webfpv.account.synced.v1': '{"at":1}',
  });
  const e = entriesOf(signedIn);
  const text = JSON.stringify(e);
  check('a signed in browser sends the guest\'s key as the pilot key, as signing out would leave',
    e['webfpv.pilot.key.v1'] === GUEST['webfpv.pilot.key.v1'] && !('webfpv.pilot.key.guest.v1' in e));
  check('and nothing of the account: no session, no account key, no sync mark',
    !text.includes('S3SS10N') && !text.includes('ACCOUNT-secret') && !('webfpv.account.v1' in e) && !('webfpv.account.synced.v1' in e));
  const noGuest = new Storage({ ...signedIn.plain(), 'webfpv.pilot.key.guest.v1': undefined });
  noGuest.removeItem('webfpv.pilot.key.guest.v1');
  check('signed in with no guest key aside: no pilot key goes at all', !('webfpv.pilot.key.v1' in entriesOf(noGuest)));
}
{
  const entries = entriesOf(new Storage(GUEST));
  const text = await encodePack(entries);
  const back = await decodePack(text);
  check('deflated and back, every entry exact', JSON.stringify(back.entries) === JSON.stringify(entries));
  check('the same storage packs to the same text', await encodePack(entries) === text);
  check('in characters an address carries as they are', /^[zj][A-Za-z0-9_-]+$/.test(text), text.slice(0, 40));
  check('and smaller than the JSON', text.length < JSON.stringify(entries).length, `${text.length} vs ${JSON.stringify(entries).length}`);
  const forged = await encodePack({ 'webfpv.account.v1': '{}' });
  let refused = false;
  try {
    await decodePack(forged);
  } catch (e) {
    refused = true;
  }
  check('a pack carrying a key that never goes is refused whole', refused);
  let junk = false;
  try {
    await decodePack('qnot-a-pack');
  } catch (e) {
    junk = true;
  }
  check('so is a pack of another kind', junk);
}
{
  const empty = await partsOf('');
  check('nothing to send is one part, `empty`', empty.length === 1 && empty[0] === 'empty' && parsePart('empty').empty);
  const text = `z${'A'.repeat(PART_CHARS * 2 + 10)}`;
  const parts = await partsOf(text);
  const parsed = parts.map(parsePart);
  check(`a pack past ${PART_CHARS} characters goes in parts, each within it`,
    parts.length === 3 && parsed.every((p, i) => p.index === i && p.count === 3 && p.chars.length <= PART_CHARS));
  check('the parts join to the pack', parsed.map((p) => p.chars).join('') === text);
  check('a part out of range or malformed is no part', parsePart('3.3.0123456789abcdef.AA') === null && parsePart('0.1.short.AA') === null && parsePart('0.1.0123456789abcdef.a b') === null);
}

console.log('where a pack may go');
{
  check('the target is the domain, written in the module', MOVE_TARGET === 'https://paraguayandronecombatsimulator.com');
  check('the sender is on the old origin, outside /fdfpv/', new URL(MOVE_PAGE).origin === 'https://fdflabs.github.io' && !new URL(MOVE_PAGE).pathname.startsWith('/fdfpv/'));
  check('a path and query are kept', safeBack('/?room=K7PZ2M&map=swiss2') === '/?room=K7PZ2M&map=swiss2');
  for (const evil of ['//evil.example/x', 'https://evil.example/', '/\\evil.example', 'javascript:alert(1)', '', null, '/%2F%2Fevil.example']) {
    const to = returnUrl(evil, 'empty');
    check(`back=${JSON.stringify(evil)} still lands on the domain`, new URL(to).origin === MOVE_TARGET, to);
  }
  const sent = windowAt('https://fdflabs.github.io/fdfpv-landing/move/?back=https://evil.example/', { local: new Storage(GUEST) });
  await moveOut(sent);
  check('the sender, told to go elsewhere, goes to the domain', new URL(sent.went).origin === MOVE_TARGET, sent.went.slice(0, 80));
}

console.log('the receiver');
{
  const win = windowAt('https://fdflabs.github.io/fdfpv/');
  check('not on the domain: off', await moveIn({ win, fetchImpl: pageThere }) === 'off' && win.went === null);
}
{
  const win = windowAt('https://paraguayandronecombatsimulator.com/');
  Object.defineProperty(win, 'localStorage', { get() { throw new Error('SecurityError'); } });
  check('storage refused: off, and the boot goes on', await moveIn({ win, fetchImpl: pageThere }) === 'off' && win.went === null);
}
{
  const local = new Storage({ 'webfpv.settings.v3': '{}' });
  const win = windowAt('https://paraguayandronecombatsimulator.com/', { local });
  check('a domain with game state already: kept, no bounce', await moveIn({ win, fetchImpl: pageThere }) === 'kept' && win.went === null);
  check('and marked, so it never asks', JSON.parse(local.getItem(MARKER_KEY)).state === 'done');
}
{
  const win = windowAt('https://paraguayandronecombatsimulator.com/', { userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1)' });
  check('a crawler is never bounced', await moveIn({ win, fetchImpl: pageThere }) === 'skipped' && win.went === null);
}
{
  const win = windowAt('https://paraguayandronecombatsimulator.com/');
  check('no sender page yet (404): skipped, nobody stranded', await moveIn({ win, fetchImpl: pageGone }) === 'skipped' && win.went === null);
  check('and nothing marked, so a later visit may still ask', win.localStorage.getItem(MARKER_KEY) === null);
}
{
  const win = windowAt('https://paraguayandronecombatsimulator.com/?room=K7PZ2M');
  let settled = false;
  moveIn({ win, fetchImpl: pageThere }).then(() => {
    settled = true;
  });
  await leftOrStuck(win);
  const ask = new URL(win.went || 'about:blank');
  check('a fresh domain asks the sender, with its path and query', ask.href.startsWith(MOVE_PAGE) && ask.searchParams.get('back') === '/?room=K7PZ2M', win.went);
  check('marked asked first, so a broken return cannot loop', JSON.parse(win.localStorage.getItem(MARKER_KEY)).state === 'asked');
  check('and the boot behind it never runs on the page that is leaving', settled === false);
}
{
  const pack = (await partsOf(await encodePack({ 'webfpv.pilot.key.v1': 'ATTACKER' })))[0];
  const local = new Storage({ 'webfpv.pilot.key.v1': 'MINE', [MARKER_KEY]: JSON.stringify({ state: 'done', at: 1 }) });
  const win = windowAt(`https://paraguayandronecombatsimulator.com/?map=alps#${FRAGMENT}=${pack}`, { local });
  check('a pack nobody asked for (a crafted link): ignored', await moveIn({ win, fetchImpl: pageThere }) === 'ignored');
  check('the pilot\'s key untouched', local.getItem('webfpv.pilot.key.v1') === 'MINE');
  check('and the fragment stripped, the query kept', win.location.hash === '' && win.location.search === '?map=alps', win.location.href);
}
{
  const pack = (await partsOf(await encodePack({ 'webfpv.pilot.name': 'Late' })))[0];
  const local = new Storage({ [MARKER_KEY]: JSON.stringify({ state: 'asked', at: 0 }) });
  const win = windowAt(`https://paraguayandronecombatsimulator.com/#${FRAGMENT}=${pack}`, { local });
  check('an answer long after the ask: ignored', await moveIn({ win, fetchImpl: pageThere, now: 60 * 60 * 1000 }) === 'ignored' && local.getItem('webfpv.pilot.name') === null);
}
{
  const local = new Storage({ [MARKER_KEY]: JSON.stringify({ state: 'asked', at: Date.now() }) });
  const win = windowAt('https://paraguayandronecombatsimulator.com/', { local });
  check('asked, and back with no answer: done, never asked again', await moveIn({ win, fetchImpl: pageThere }) === 'done'
    && JSON.parse(local.getItem(MARKER_KEY)).result === 'unanswered' && win.went === null);
}

/* The sender and the receiver handing the guest over through stand in
 * windows, one bounce a part, as the browser would. */
async function roundTrip(oldStore, startUrl) {
  const local = new Storage();
  const session = new Storage();
  let win = windowAt(startUrl, { local, session });
  for (let hop = 0; hop < 10; hop += 1) {
    const result = await Promise.race([moveIn({ win, fetchImpl: pageThere }), leftOrStuck(win).then((to) => (to === 'stuck' ? 'stuck' : null))]);
    if (result !== null) {
      return { result, local, win, hops: hop };
    }
    const sender = windowAt(win.went, { local: oldStore });
    await moveOut(sender);
    win = windowAt(sender.went, { local, session });
  }
  return { result: 'too many hops', local, win, hops: 10 };
}

console.log('the round trip');
{
  const old = new Storage(GUEST);
  const before = JSON.stringify(old.plain());
  const { result, local, win, hops } = await roundTrip(old, 'https://paraguayandronecombatsimulator.com/?room=K7PZ2M');
  check('one bounce, imported', result === 'imported' && hops === 1, `${result} after ${hops}`);
  const want = entriesOf(new Storage(GUEST));
  check('the domain holds exactly what went', Object.entries(want).every(([k, v]) => local.getItem(k) === v)
    && Object.keys(local.plain()).filter((k) => k !== MARKER_KEY).length === Object.keys(want).length);
  check('the page is where the guest opened it, with no fragment', win.location.href === 'https://paraguayandronecombatsimulator.com/?room=K7PZ2M', win.location.href);
  check('the old storage is left as it was', JSON.stringify(old.plain()) === before);
  check('marked done', JSON.parse(local.getItem(MARKER_KEY)).result === 'imported');
}
{
  const { result, local } = await roundTrip(new Storage({ 'another.fdflabs.page': 'x' }), 'https://paraguayandronecombatsimulator.com/');
  check('a guest with nothing: empty, nothing written but the mark', result === 'empty' && Object.keys(local.plain()).join() === MARKER_KEY);
}
{
  /* Random bytes do not deflate: about 1.6 MB of pack, three parts. */
  const big = randomBytes(900000).toString('base64');
  const old = new Storage({ ...GUEST, 'webfpv.trackbuilder.library.v1': big });
  const { result, local, hops } = await roundTrip(old, 'https://paraguayandronecombatsimulator.com/');
  check('a pack of three parts comes over, a bounce each', result === 'imported' && hops === 3, `${result} after ${hops}: ${local.getItem(MARKER_KEY)}`);
  check('every byte of it', local.getItem('webfpv.trackbuilder.library.v1') === big);
}
{
  /* A part from another pack in the middle: refused, nothing written. */
  const old = new Storage({ ...GUEST, 'webfpv.trackbuilder.library.v1': randomBytes(900000).toString('base64') });
  const local = new Storage();
  const session = new Storage();
  let win = windowAt('https://paraguayandronecombatsimulator.com/', { local, session });
  moveIn({ win, fetchImpl: pageThere });
  await leftOrStuck(win);
  let sender = windowAt(win.went, { local: old });
  await moveOut(sender);
  win = windowAt(sender.went, { local, session });
  moveIn({ win, fetchImpl: pageThere });
  await leftOrStuck(win);
  old.setItem('webfpv.pilot.name', 'Changed');
  sender = windowAt(win.went, { local: old });
  await moveOut(sender);
  win = windowAt(sender.went, { local, session });
  const result = await moveIn({ win, fetchImpl: pageThere });
  check('parts of two different packs are not joined', result === 'failed' && local.getItem('webfpv.pilot.name') === null, result);
}
{
  check('the ask for part 2 names it', new URL(askUrl('/', 2)).searchParams.get('part') === '2');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
