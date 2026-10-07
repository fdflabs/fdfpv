/*
 * stats-selftest.js: src/share/stats.js pinned as a transcript.
 *
 *     node scripts/stats-selftest.js [--dump=<file>]   (npm run stats:selftest)
 *
 * Every export of the counting module runs over a fixed set of cases in
 * Node, with stand ins for what it reads from the browser: localStorage,
 * navigator (Global Privacy Control, sendBeacon), fetch, the address bar
 * and history, the clock and crypto.randomUUID. Each answer is recorded,
 * along with every beacon and fetch it sends (address and exact body), the
 * address it rewrites and what it leaves in storage. The digest below was
 * taken on the module before its rewrite (scripts/lib/transcript.js).
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

import { seeded, transcript } from './lib/transcript.js';

const PINNED = '545b0c475ba03089a1c86c9370b07c543aaefe6a7f72b0188a9db69b87033757';

class Storage {
  constructor() {
    this.map = new Map();
  }

  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }

  setItem(k, v) {
    if (this.refuse) {
      throw new Error('QuotaExceededError');
    }
    this.map.set(k, String(v));
  }

  removeItem(k) {
    this.map.delete(k);
  }

  clear() {
    this.map.clear();
    this.refuse = false;
  }

  dump() {
    return [...this.map.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  }
}

const store = new Storage();
globalThis.localStorage = store;

/* The clock: every Date the module makes reads `clock.now`. */
const clock = { now: Date.parse('2026-10-06T12:00:00Z') };
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : [clock.now]));
  }

  static now() {
    return clock.now;
  }
};
const DAY = 86_400_000;

Math.random = seeded(7);

/* What leaves the page. */
const sent = [];
const nav = {
  gpc: false,
  beacon: 'ok',
};
const navigatorStandIn = {
  get globalPrivacyControl() {
    if (nav.gpc === 'throw') {
      throw new Error('no');
    }
    return nav.gpc;
  },
  get sendBeacon() {
    if (nav.beacon === 'none') {
      return undefined;
    }
    return (url, blob) => {
      if (nav.beacon === 'throw') {
        throw new Error('beacon refused');
      }
      sent.push({ via: 'beacon', url, type: blob.type, blob });
      return nav.beacon === 'ok';
    };
  },
};
Object.defineProperty(globalThis, 'navigator', { value: navigatorStandIn, configurable: true, writable: true });

const net = { mode: 'ok', reply: null };
globalThis.fetch = (url, init = {}) => {
  if (net.mode === 'sync-throw') {
    throw new Error('fetch gone');
  }
  sent.push({
    via: 'fetch', url, method: init.method || 'GET', body: init.body, keepalive: init.keepalive, headers: init.headers, signal: Boolean(init.signal),
  });
  if (net.mode === 'reject') {
    return Promise.reject(new TypeError('network'));
  }
  const [status, body] = net.reply || [200, {}];
  return Promise.resolve(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));
};

let uuid = 0;
const cryptoStandIn = { randomUUID: () => `uuid-${(uuid += 1)}` };
Object.defineProperty(globalThis, 'crypto', { value: cryptoStandIn, configurable: true, writable: true });

/* A location and history pair; replaceState is logged. */
function addressBar(href, { history = 'ok' } = {}) {
  const log = [];
  const loc = { href };
  let hist;
  if (history === 'ok') {
    hist = { replaceState: (s, t, to) => log.push(to) };
  } else if (history === 'throw') {
    hist = {
      replaceState: () => {
        throw new Error('sandboxed');
      },
    };
  } else if (history === 'none') {
    hist = null;
  } else {
    hist = { replaceState: 'not a function' };
  }
  return { loc, hist, log };
}
globalThis.window = { location: { href: 'https://paraguayandronecombatsimulator.com/?utm_source=window-default&map=alps', search: '' }, history: { replaceState: () => {} } };

const stats = await import('../src/share/stats.js');
const t = transcript();

/* Beacons and fetches since the last look, with blob bodies read out. */
async function drain() {
  const out = [];
  for (const s of sent.splice(0)) {
    if (s.blob) {
      out.push({ via: s.via, url: s.url, type: s.type, body: await s.blob.text() });
    } else {
      out.push(s);
    }
  }
  return out;
}

async function look(label) {
  t.note(`${label} sent`, await drain());
  t.note(`${label} storage`, store.dump());
}

function reset() {
  store.clear();
  nav.gpc = false;
  nav.beacon = 'ok';
  net.mode = 'ok';
  net.reply = null;
  clock.now = Date.parse('2026-10-06T12:00:00Z');
  sent.length = 0;
}

t.note('FLUSH_MS', stats.FLUSH_MS);
t.note('exports', Object.keys(stats).sort());

/* Privacy and the switch. */
reset();
for (const gpc of [false, true, 'yes', 1, 'throw', undefined]) {
  nav.gpc = gpc;
  t.rec(`privacyRefused gpc=${String(gpc)}`, () => stats.privacyRefused());
  t.rec(`counting gpc=${String(gpc)}`, () => stats.counting());
}
nav.gpc = false;
for (const raw of [null, '', '{}', '{"optOut":true}', '{"optOut":"true"}', '[1]', 'null', '7', '{bad', '{"optOut":false,"firstDay":"2026-01-01"}']) {
  store.clear();
  if (raw !== null) {
    store.map.set('webfpv.stats.v1', raw);
  }
  t.rec(`optedOut stored=${raw}`, () => stats.optedOut());
  t.rec(`counting stored=${raw}`, () => stats.counting());
}
store.clear();
store.map.set('webfpv.stats.v1', '{"firstDay":"2026-01-01"}');
for (const on of [true, false, 1, 0, 'x', null]) {
  t.rec(`setOptedOut ${String(on)}`, () => stats.setOptedOut(on));
  t.note(`after setOptedOut ${String(on)}`, store.dump());
}
store.refuse = true;
t.rec('setOptedOut with storage refusing', () => stats.setOptedOut(true));
t.rec('optedOut after a refused write', () => stats.optedOut());

/* The sponsor slug and the address bar. */
const ADDRESSES = [
  'https://paraguayandronecombatsimulator.com/?utm_source=poster-one&map=alps#x',
  'https://paraguayandronecombatsimulator.com/?utm_source=%20Poster-TWO%20&utm_medium=print&UTM_Campaign=q4&share=trk-1',
  'https://paraguayandronecombatsimulator.com/?utm_source=a&map=alps',
  'https://paraguayandronecombatsimulator.com/?utm_source=has%20space',
  'https://paraguayandronecombatsimulator.com/?utm_source=' + 'x'.repeat(33),
  'https://paraguayandronecombatsimulator.com/?utm_source=',
  'https://paraguayandronecombatsimulator.com/?utm_medium=print',
  'https://paraguayandronecombatsimulator.com/?map=alps&utmsource=no',
  'https://paraguayandronecombatsimulator.com/',
  'not a url',
];
for (const history of ['ok', 'throw', 'none', 'odd']) {
  for (const href of ADDRESSES) {
    reset();
    const bar = addressBar(href, { history });
    t.rec(`captureSource ${history} ${href}`, () => stats.captureSource(bar.loc, bar.hist));
    t.note(`  replaced ${history} ${href}`, bar.log);
    t.note(`  stored ${history} ${href}`, store.dump());
  }
}
reset();
store.map.set('webfpv.stats.v1', '{"optOut":true,"firstDay":"2026-01-01"}');
{
  const bar = addressBar(ADDRESSES[0]);
  t.rec('captureSource while opted out still stores', () => stats.captureSource(bar.loc, bar.hist));
  t.note('  stored', store.dump());
}
reset();
t.rec('captureSource with the window defaults', () => stats.captureSource());
t.note('  stored', store.dump());

/* What the held slug answers as the days pass. */
for (const [label, source] of [
  ['none', undefined],
  ['today', { slug: 'poster-one', day: '2026-10-06' }],
  ['30 days old', { slug: 'poster-one', day: '2026-09-06' }],
  ['31 days old', { slug: 'poster-one', day: '2026-09-05' }],
  ['tomorrow', { slug: 'poster-one', day: '2026-10-07' }],
  ['bad slug', { slug: 'Poster One', day: '2026-10-06' }],
  ['no day', { slug: 'poster-one' }],
  ['bad day', { slug: 'poster-one', day: 'yesterday' }],
  ['numeric slug', { slug: 12345, day: '2026-10-06' }],
  ['not an object', 'poster-one'],
]) {
  reset();
  store.map.set('webfpv.stats.v1', JSON.stringify(source === undefined ? {} : { source }));
  t.rec(`heldSource ${label}`, () => stats.heldSource());
}

/* Once a day per browser. */
reset();
t.rec('markVisit first ever', () => stats.markVisit());
t.rec('markVisit again today', () => stats.markVisit());
clock.now += DAY;
t.rec('markVisit tomorrow', () => stats.markVisit());
t.rec('markVisit tomorrow again', () => stats.markVisit());
t.note('markVisit storage', store.dump());
reset();
store.map.set('webfpv.stats.v1', '{"lastVisitDay":"2026-10-05"}');
t.rec('markVisit with a last day and no first day', () => stats.markVisit());
t.note('  storage', store.dump());
store.refuse = true;
clock.now += DAY;
t.rec('markVisit with storage refusing', () => stats.markVisit());

/* Where events go. */
for (const origin of ['https://api.example/board', 'https://api.example/board///', '', null, undefined, 0]) {
  t.rec(`eventsUrl ${String(origin)}`, () => stats.eventsUrl(origin));
}
t.rec('eventsUrl default', () => stats.eventsUrl());

/* Sending. */
const URL1 = 'https://api.example/board/api/stats/events';
reset();
t.rec('sendEvent by beacon', () => stats.sendEvent({ kind: 'visit', surface: 'sim', returning: false }, URL1));
await look('sendEvent by beacon');
store.map.set('webfpv.stats.v1', JSON.stringify({ source: { slug: 'poster-one', day: '2026-10-01' } }));
t.rec('sendEvent carries the held slug, after the payload', () => stats.sendEvent({ kind: 'x', source: 'mine', v: 9 }, URL1));
await look('sendEvent with slug');
nav.beacon = 'refused';
t.rec('sendEvent, beacon refused', () => stats.sendEvent({ kind: 'visit' }, URL1));
await look('sendEvent beacon refused');
nav.beacon = 'throw';
t.rec('sendEvent, beacon throws, fetch', () => stats.sendEvent({ kind: 'visit' }, URL1));
await look('sendEvent beacon throws');
nav.beacon = 'none';
t.rec('sendEvent, no beacon, fetch', () => stats.sendEvent({ kind: 'visit' }, URL1));
await look('sendEvent no beacon');
net.mode = 'reject';
t.rec('sendEvent, fetch rejects later', () => stats.sendEvent({ kind: 'visit' }, URL1));
await look('sendEvent fetch rejects');
net.mode = 'sync-throw';
t.rec('sendEvent, fetch throws at once', () => stats.sendEvent({ kind: 'visit' }, URL1));
await look('sendEvent fetch throws');
net.mode = 'ok';
nav.beacon = 'ok';
const loop = { kind: 'loop' };
loop.self = loop;
t.rec('sendEvent of a payload JSON refuses', () => stats.sendEvent(loop, URL1));
t.rec('sendEvent of a bigint', () => stats.sendEvent({ n: 1n }, URL1));
await look('sendEvent unserialisable');
nav.gpc = true;
t.rec('sendEvent under GPC', () => stats.sendEvent({ kind: 'visit' }, URL1));
nav.gpc = false;
store.map.set('webfpv.stats.v1', '{"optOut":true}');
t.rec('sendEvent opted out', () => stats.sendEvent({ kind: 'visit' }, URL1));
await look('sendEvent refused');
reset();
t.rec('sendEvent to the default address', () => stats.sendEvent({ kind: 'visit' }));
await look('sendEvent default');

/* A visit. */
reset();
globalThis.window.location.href = 'https://paraguayandronecombatsimulator.com/?utm_source=from-window&map=alps';
t.rec('pingVisit first', () => stats.pingVisit('sim', URL1));
await look('pingVisit first');
t.rec('pingVisit second today', () => stats.pingVisit('builder', URL1));
await look('pingVisit second');
clock.now += DAY;
t.rec('pingVisit next day', () => stats.pingVisit('board', URL1));
await look('pingVisit next day');
clock.now += DAY;
nav.gpc = true;
t.rec('pingVisit under GPC still captures', () => stats.pingVisit('sim', URL1));
await look('pingVisit gpc');
nav.gpc = false;
t.rec('pingVisit default address', () => stats.pingVisit('sim'));
await look('pingVisit default');

/* The flight counter. */
async function flight(label, opts, frames, after = () => {}) {
  reset();
  const fs = stats.createFlightStats(opts);
  t.note(`${label} keys`, Object.keys(fs));
  t.note(`${label} tab`, fs.tab);
  for (const [i, f] of frames.entries()) {
    if (f === 'crash') {
      fs.noteCrash();
    } else if (f === 'leave') {
      t.note(`${label} leaving ${i}`, fs.leaving());
    } else if (f === 'stop') {
      t.note(`${label} stop ${i}`, fs.stop());
    } else {
      t.note(`${label} tick ${i}`, fs.tick(f[0], f[1]));
    }
  }
  after(fs);
  await look(label);
}

const DESCRIBE = () => ({ craft: '5inch', map: 'alps', input: 'radio' });
const fly = (laps) => ({ started: true, flying: true, laps });
const sit = (laps) => ({ started: true, flying: false, laps });

await flight('not started, nothing sent', { describe: DESCRIBE, url: URL1 }, [
  [1000, { started: false, flying: true, laps: 0 }], [70000, null], 'crash', 'leave',
]);
await flight('a minute of flying with two laps and a crash', { describe: DESCRIBE, url: URL1 }, [
  [1000, fly(0)], [1016, fly(0)], [2000, fly(0)], [3000, sit(1)], 'crash', [30000, fly(1)], [30500, fly(2)],
  [61000, fly(2)], [61010, fly(3)], 'crash', 'leave', 'leave',
]);
await flight('caps on a flush', { describe: DESCRIBE, url: URL1 }, [
  [1, fly(0)], [2, fly(40)], ...Array.from({ length: 95 }, (_, i) => [1002 + i * 900, fly(40)]),
  ...Array.from({ length: 70 }, () => 'crash'), [200000, fly(40)],
]);
await flight('lap count going back resets, not negative', { describe: DESCRIBE, url: URL1 }, [
  [10, fly(5)], [20, fly(7)], [30, fly(2)], [40, fly(3)], [50, { started: true, flying: true, laps: NaN }], [60, { started: true, flying: true }], 'leave',
]);
await flight('a hidden tab comes back with one huge gap', { describe: DESCRIBE, url: URL1 }, [
  [500, fly(0)], [600, fly(0)], [3_600_600, fly(0)], [3_600_700, fly(0)], 'leave',
]);
await flight('wall time zero and garbage', { describe: DESCRIBE, url: URL1 }, [
  [0, fly(0)], ['abc', fly(0)], [-5, fly(0)], [100, fly(0)], [50, fly(0)], [1600, fly(0)], 'leave',
]);
await flight('carry of part seconds across flushes', { describe: DESCRIBE, url: URL1 }, [
  [100, fly(0)], ...Array.from({ length: 70 }, (_, i) => [600 + i * 999, fly(0)]), [60100, fly(0)], [60700, fly(0)], 'leave', [61300, fly(0)], 'leave',
]);
await flight('stopped counts nothing', { describe: DESCRIBE, url: URL1 }, [
  [100, fly(0)], [200, fly(1)], 'stop', [300, fly(2)], 'crash', 'leave', [70000, fly(3)],
]);
await flight('describe throws', { describe: () => { throw new Error('shell'); }, url: URL1 }, [[100, fly(0)], 'leave']);
await flight('describe returns nothing', { describe: () => null, url: URL1 }, [[100, fly(0)], 'leave']);
await flight('describe is not a function', { describe: 'alps', url: URL1 }, [[100, fly(0)], 'leave']);
await flight('describe gives odd values', { describe: () => ({ craft: 7, map: '', input: null }), url: URL1 }, [[100, fly(0)], 'leave']);
await flight('no options at all', undefined, [[100, fly(0)], 'leave']);
{
  reset();
  store.map.set('webfpv.stats.v1', '{"optOut":true}');
  const fs = stats.createFlightStats({ describe: DESCRIBE, url: URL1 });
  fs.tick(100, fly(0));
  fs.tick(200, fly(1));
  t.note('opted out leaving', fs.leaving());
  store.map.set('webfpv.stats.v1', '{}');
  fs.tick(300, fly(2));
  t.note('opted back in leaving', fs.leaving());
  await look('opted out mid flight');
}
{
  reset();
  const keep = globalThis.crypto;
  Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true, writable: true });
  /* The stand in handle's spelling is the module's own business; the
   * board only takes one that fits its TAB_HANDLE (src/validate.js), and
   * two tabs must not share one. */
  const TAB_HANDLE = /^[A-Za-z0-9-]{8,36}$/;
  const a = stats.createFlightStats({ url: URL1 }).tab;
  const b = stats.createFlightStats({ url: URL1 }).tab;
  t.note('tab with no randomUUID fits the board, and differs per tab', [TAB_HANDLE.test(a), TAB_HANDLE.test(b), a !== b]);
  Object.defineProperty(globalThis, 'crypto', {
    value: { randomUUID: () => { throw new Error('insecure'); } }, configurable: true, writable: true,
  });
  const c = stats.createFlightStats({ url: URL1 }).tab;
  t.note('tab with randomUUID throwing fits the board', [TAB_HANDLE.test(c), c !== a]);
  Object.defineProperty(globalThis, 'crypto', { value: keep, configurable: true, writable: true });
}

/* The board's all time sum. */
for (const [label, reply, mode] of [
  ['a number', [200, { allTime: { flightS: 12345 } }]],
  ['zero', [200, { allTime: { flightS: 0 } }]],
  ['a fraction', [200, { allTime: { flightS: 1.5 } }]],
  ['negative', [200, { allTime: { flightS: -1 } }]],
  ['a string', [200, { allTime: { flightS: '12' } }]],
  ['no allTime', [200, { days: [] }]],
  ['null body', [200, 'null']],
  ['not JSON', [200, 'nope']],
  ['a 500', [500, { allTime: { flightS: 9 } }]],
  ['a rejection', null, 'reject'],
  ['a throw', null, 'sync-throw'],
]) {
  reset();
  net.reply = reply;
  net.mode = mode || 'ok';
  t.note(`boardFlightSeconds ${label}`, await stats.boardFlightSeconds('https://api.example/board//'));
  await look(`boardFlightSeconds ${label}`);
}
reset();
net.reply = [200, { allTime: { flightS: 3 } }];
t.note('boardFlightSeconds default origin', await stats.boardFlightSeconds());
t.note('boardFlightSeconds null origin', await stats.boardFlightSeconds(null));
await look('boardFlightSeconds origins');

t.finish('stats.js', PINNED);
