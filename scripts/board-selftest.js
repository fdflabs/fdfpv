/*
 * board-selftest.js: src/share/board.js pinned as a transcript.
 *
 *     node scripts/board-selftest.js [--dump=<file>]   (npm run board:selftest)
 *
 * The module that speaks to the public board, driven in Node with stand
 * ins for the page's address, localStorage and fetch. Recorded: which
 * board each kind of page picks (loopback, file://, deployed, a ?board=
 * query, a stored override, no window at all), every URL and request body
 * it sends, what it makes of every kind of answer (lists with missing and
 * odd fields, refusals, conflicts, a board that never answers), and what
 * a Fly link seats. Pinned by digest (scripts/lib/transcript.js), recorded
 * on the module before its rewrite. The featured strip's random fill is
 * recorded by what it must contain, not by its order.
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

const PINNED = 'ff8e7c5d2671e16464884b2c350c9074ed996d8016cc0b45f5531641843c8fd0';

class Storage {
  constructor() {
    this.map = new Map();
  }

  getItem(k) {
    if (this.refuse) {
      throw new Error('SecurityError');
    }
    return this.map.has(k) ? this.map.get(k) : null;
  }

  setItem(k, v) {
    if (this.refuse) {
      throw new Error('SecurityError');
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

  /* Seats carry the time they were written; the clock is taken out. */
  dump() {
    return [...this.map.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => [k, v.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, '<time>')]);
  }
}
const store = new Storage();
globalThis.localStorage = store;
Math.random = seeded(11);

function placeAt(href) {
  if (href === null) {
    delete globalThis.window;
    return;
  }
  const u = new URL(href);
  globalThis.window = {
    location: {
      href: u.href, hostname: u.hostname, search: u.search, origin: u.origin, pathname: u.pathname,
    },
  };
}

/* The stand in board: `routes` maps "METHOD url" to [status, body text]
 * or to a function of the request. Everything sent is logged. */
const log = [];
let routes = {};
globalThis.fetch = async (url, init = {}) => {
  log.push({
    url, method: init.method || 'GET', headers: init.headers, body: init.body, signal: init.signal ? init.signal.constructor.name : null,
  });
  const route = routes[`${init.method || 'GET'} ${url}`] ?? routes['*'];
  if (typeof route === 'function') {
    return route(url, init);
  }
  const [status, text] = route || [404, ''];
  return new Response(text, { status });
};

/* A browser that kept an override under the old name, as the module
 * loads: it is moved to the new name, once. */
store.map.set('webfpv.board.origin', 'https://kept.example/board');
const board = await import('../src/share/board.js');
const OVERRIDE = 'fdfpv.board.origin';
const { setLocale } = await import('../src/strings/index.js');
const t = transcript();
t.note('the old override, moved at load', store.dump());
store.clear();

async function call(label, fn) {
  log.length = 0;
  let out;
  try {
    out = { ok: await fn() };
  } catch (e) {
    /* An engine TypeError's message quotes source text, the
     * implementation; only its kind is the behaviour. */
    const engine = e instanceof TypeError || e instanceof RangeError || e instanceof ReferenceError;
    out = {
      threw: e.constructor.name, message: engine ? '(engine)' : e.message, status: e.status, conflict: e.conflict, timeout: e.timeout,
    };
  }
  t.note(label, out);
  t.note(`${label} requests`, log.slice());
  t.note(`${label} storage`, store.dump());
}

const json = (v) => JSON.stringify(v);

t.note('exports', Object.keys(board).sort());
t.note('constants', [board.DEFAULT_BOARD_ORIGIN, board.PRODUCTION_BOARD_ORIGIN, board.BOARD_READ_TIMEOUT_MS]);

/* Which board, from where. */
const PLACES = [
  null,
  'http://127.0.0.1:8000/',
  'http://localhost:8000/?map=alps',
  'http://[::1]:8000/',
  'http://0.0.0.0:8000/',
  'file:///home/x/index.html',
  'https://paraguayandronecombatsimulator.com/',
  'https://fdflabs.github.io/fdfpv/',
  'https://paraguayandronecombatsimulator.com/?board=https://mine.example/b///',
  'https://paraguayandronecombatsimulator.com/?board=%20%20',
  'https://paraguayandronecombatsimulator.com/?board=',
  'http://127.0.0.1:3180/?map=alps',
];
for (const place of PLACES) {
  for (const stored of [null, 'https://stored.example/board/', '   ', 'https://fdfpv.example/board']) {
    store.clear();
    placeAt(place);
    if (stored !== null) {
      store.map.set(OVERRIDE, stored);
    }
    const label = `${place} stored=${stored}`;
    t.rec(`defaultBoardOrigin ${label}`, () => board.defaultBoardOrigin());
    t.rec(`boardOrigin ${label}`, () => board.boardOrigin());
    t.rec(`boardConfigured ${label}`, () => board.boardConfigured());
    for (const [o, craft] of [[undefined, undefined], [null, 'wing'], ['https://other.example/b/', '5inch'], ['  ', ''],
      ['http://127.0.0.1:8000', 'whoop 65'], ['https://paraguayandronecombatsimulator.com/', undefined]]) {
      t.rec(`boardPageUrl ${label} ${o} ${craft}`, () => board.boardPageUrl(o, craft));
    }
  }
}
store.clear();
store.refuse = true;
placeAt('https://paraguayandronecombatsimulator.com/');
t.rec('boardOrigin with storage refused', () => board.boardOrigin());
store.clear();
placeAt('https://paraguayandronecombatsimulator.com/');
setLocale('es');
t.rec('boardPageUrl in Spanish', () => board.boardPageUrl());
t.rec('boardPageUrl in Spanish with a craft', () => board.boardPageUrl('https://b.example', 'wing'));
setLocale('zz');
t.rec('boardPageUrl in an unknown locale', () => board.boardPageUrl('https://b.example'));
setLocale('en');

/* Reads. */
const B = 'https://board.example/b';
placeAt('https://paraguayandronecombatsimulator.com/');
const LIST = {
  tracks: [
    {
      id: 'trk-1', name: 'One', author: 'Ada', designer: 'Des', series: 'S1', gates: '7', best: { lapMs: '61234', name: 'Bo' }, times: 4,
      publishedUtc: '2026-01-01T00:00:00Z', plan: { p: 1 }, tags: ['race', 3], trackClass: 'wing', map: 'alps', planes: ['cub1400', 7],
      wing: { best: { lapMs: 70000, name: 'Cy' }, times: '2' },
    },
    { id: 'trk-2' },
    { id: '', name: 'No id' },
    { name: 'Missing id' },
    { id: 9, name: 0, gates: 'x', best: { lapMs: 'fast' }, times: null, tags: 'race', map: 5, planes: 'cub', trackClass: 'micro' },
    { id: 'trk-4', trackClass: 'full', best: { lapMs: 0 }, wing: { best: {} } },
    { id: 'trk-5', trackClass: 'micro', schemaVersion: 2 },
    { id: 'trk-6', trackClass: 'nonsense' },
  ],
};
routes = { [`GET ${B}/api/tracks`]: [200, json(LIST)] };
await call('fetchTrackList', () => board.fetchTrackList(`${B}//`));
routes = { [`GET ${board.PRODUCTION_BOARD_ORIGIN}/api/tracks`]: [200, json({ tracks: 'no' })] };
await call('fetchTrackList default, tracks not a list', () => board.fetchTrackList());
for (const [label, reply] of [
  ['empty body', [200, '']],
  ['not JSON', [200, '<html>']],
  ['null', [200, 'null']],
  ['a 500 with an error', [500, json({ error: 'Board broke.' })]],
  ['a 503 with text', [503, 'Service Unavailable']],
  ['a 502 empty', [502, '']],
  ['a 409', [409, '']],
  ['a 400 conflict', [400, json({ error: 'Taken.', conflict: true })]],
  ['a 404 with a JSON error that is not a string', [404, json({ error: 0 })]],
]) {
  routes = { '*': reply };
  await call(`fetchTrackList ${label}`, () => board.fetchTrackList(B));
}
for (const name of ['TimeoutError', 'AbortError', 'TypeError']) {
  routes = {
    '*': () => {
      const e = new Error(`raw ${name}`);
      e.name = name;
      throw e;
    },
  };
  await call(`fetchTrackList fails with ${name}`, () => board.fetchTrackList(B));
}

/* The featured strip. */
const flownList = (n) => Array.from({ length: n }, (_, i) => ({
  id: `f${i}`, times: (i * 7) % 5, gates: i % 3, publishedUtc: `2026-0${(i % 9) + 1}-01`,
}));
t.rec('pickFeaturedTracks, flown enough to rank', () => board.pickFeaturedTracks(flownList(12)).map((x) => x.id));
t.rec('pickFeaturedTracks, ranked, limit 3', () => board.pickFeaturedTracks(flownList(12), 3).map((x) => x.id));
t.rec('pickFeaturedTracks, ties broken by gates, date, id', () => board.pickFeaturedTracks([
  { id: 'b', times: 2, gates: 1, publishedUtc: '2026-01-01' }, { id: 'a', times: 2, gates: 1, publishedUtc: '2026-01-01' },
  { id: 'c', times: 2, gates: 1, publishedUtc: '2026-02-01' }, { id: 'd', times: 2, gates: 3 }, { id: 'e', times: 3 },
  { id: 'f', times: 0 }, null, { times: 9 },
], 10).map((x) => x.id));
for (const [label, list, limit] of [
  ['two flown, the rest drawn', [{ id: 'x', times: 1 }, { id: 'y', times: 5 }, ...Array.from({ length: 8 }, (_, i) => ({ id: `u${i}` }))], 5],
  ['nothing flown', Array.from({ length: 9 }, (_, i) => ({ id: `u${i}`, times: 0 })), 5],
  ['fewer than the limit', [{ id: 'x', times: 1 }, { id: 'u0' }], 5],
  ['limit below the flown', [{ id: 'x', times: 1 }, { id: 'y', times: 2 }, { id: 'u0' }], 1],
]) {
  t.rec(`pickFeaturedTracks ${label}`, () => {
    const got = board.pickFeaturedTracks(list, limit).map((x) => x.id);
    const flown = list.filter((x) => x.times > 0).sort((a, b) => b.times - a.times).map((x) => x.id);
    const head = got.slice(0, flown.length);
    return {
      length: got.length,
      flownFirstInOrder: head.join() === flown.slice(0, got.length).join(),
      restUnflown: got.slice(flown.length).every((id) => !flown.includes(id)),
      distinct: new Set(got).size === got.length,
      fromList: got.every((id) => list.some((x) => x.id === id)),
    };
  });
}
t.rec('pickFeaturedTracks of nothing', () => board.pickFeaturedTracks());
t.rec('pickFeaturedTracks of null', () => board.pickFeaturedTracks(null));
{
  const input = flownList(4);
  const before = json(input);
  board.pickFeaturedTracks(input);
  t.note('pickFeaturedTracks leaves its input alone', json(input) === before);
}

routes = { [`GET ${B}/api/tracks/trk%2F1%20x/document`]: [200, json({ id: 'trk/1 x', document: { a: 1 } })] };
await call('fetchTrackDocument with an id needing escapes', () => board.fetchTrackDocument('trk/1 x', `${B}/`));
routes = { '*': [404, json({ error: 'That track is not on the board.' })] };
await call('fetchTrackDocument missing', () => board.fetchTrackDocument('trk-9'));

routes = {
  [`GET ${B}/api/runs?map=alps%20two`]: [200, json({
    runs: [{ name: 'Ada', score: '12.5', style: 'flow', tricks: 3, signature: 'sig' }, { name: '', score: 9 }, { name: 'Zero', score: 0 },
      { name: 'Neg', score: -1 }, { name: 7, score: 'x' }, { name: 'Bo', score: 3 }],
  })],
  [`GET ${B}/api/runs`]: [200, json({ runs: null })],
};
await call('fetchFreestyleRuns on a map', () => board.fetchFreestyleRuns('alps two', B));
await call('fetchFreestyleRuns no map', () => board.fetchFreestyleRuns('', B));

routes = {
  [`GET ${B}/api/tracks/trk-1`]: [200, json({
    times: [{ id: 'tm-1', name: 'Ada', lapMs: '61000', hasGhost: 1, craft: 'cub1400' }, { name: 'NoId', lapMs: 70000, craft: 5 },
      { id: 'tm-3', name: 'Bad', lapMs: 'fast' }, { id: 4, lapMs: null }, { id: 'tm-5', lapMs: 0, hasGhost: 0 }],
  })],
};
await call('fetchTrackTimes', () => board.fetchTrackTimes('trk-1', B));
routes = { '*': [200, json({})] };
await call('fetchTrackTimes with no times', () => board.fetchTrackTimes('trk-1', B));

routes = { [`GET ${B}/api/tracks/trk%201/times/tm%2F2/ghost`]: [200, json({ id: 'tm/2', name: 'Ada', lapMs: 1, ghost: 'RlBW' })] };
await call('fetchGhost', () => board.fetchGhost('trk 1', 'tm/2', B));
routes = { '*': [200, json({ ghost: 'x' })] };
await call('fetchGhost with a null origin', () => board.fetchGhost('t', 'm', null));

/* Writes. */
routes = { [`POST ${B}/api/tracks`]: [201, json({ id: 'trk-1', editKey: 'ek' })] };
await call('publishTrack bare', () => board.publishTrack({ author: 'Ada', document: { id: 'trk-1' }, origin: `${B}/` }));
await call('publishTrack with key and tags', () => board.publishTrack({
  author: 'Ada', document: { id: 'trk-1', n: [1] }, editKey: 'ek', origin: B, tags: ['race', 'skills'],
}));
await call('publishTrack with empty key and tags', () => board.publishTrack({ author: '', document: null, editKey: '', origin: B, tags: [] }));
routes = { '*': [409, json({ error: 'Not yours.' })] };
await call('publishTrack conflict', () => board.publishTrack({ author: 'Ada', document: {}, origin: B }));
routes = { '*': [201, ''] };
await call('publishTrack to the default board', () => board.publishTrack({ author: 'Ada', document: {} }));

const SUMMARY = {
  total: 812, durationMs: 60000, tricks: 14, unique: 6, bestCombo: 3, bestTrick: 'flip', crashes: 1, signature: 'abc', extra: 'not sent',
};
routes = { [`POST ${B}/api/runs`]: [201, json({ improved: true })] };
await call('postFreestyleRun', () => board.postFreestyleRun({ name: 'Ada', map: 'alps', style: 'flow', summary: SUMMARY, origin: `${B}/` }));
routes = { '*': [200, json({ improved: false })] };
await call('postFreestyleRun to the default board', () => board.postFreestyleRun({ name: 'Ada', map: 'alps', style: 'flow', summary: {} }));
await call('postFreestyleRun with no summary', () => board.postFreestyleRun({ name: 'Ada', map: 'alps', style: 'flow' }));

routes = { [`POST ${B}/api/tracks/trk%2F1/times`]: [201, json({ id: 'tm-1' })] };
await call('postTime bare', () => board.postTime({ trackId: 'trk/1', name: 'Ada', lapMs: 61000, origin: B }));
await call('postTime with everything', () => board.postTime({
  trackId: 'trk/1', name: 'Ada', lapMs: 61000, ghost: 'RlBW', key: 'k', sig: 's', craft: 'cub1400', origin: B,
}));
await call('postTime with a key but no signature', () => board.postTime({ trackId: 'trk/1', name: 'Ada', lapMs: 1, key: 'k', ghost: '', craft: '', origin: B }));
await call('postTime with a signature but no key', () => board.postTime({ trackId: 'trk/1', name: 'Ada', lapMs: 1, sig: 's', origin: B }));
routes = { '*': [400, json({ error: 'Too fast.' })] };
await call('postTime refused', () => board.postTime({ trackId: 'trk/1', name: 'Ada', lapMs: 1 }));

/* A Fly link. */
const MAP_DOC = { schemaVersion: 4, id: 'trk-m', name: 'On alps', map: 'alps', elements: [], sequence: [] };
const FIELD_DOC = { schemaVersion: 3, id: 'trk-f', name: 'Field', elements: [], sequence: [] };
const ROOM_DOC = { schemaVersion: 4, id: 'trk-r', name: 'Room', map: 'alps', trackClass: 'micro', elements: [], sequence: [] };
for (const [label, place, reply, refuse] of [
  ['no share', 'https://paraguayandronecombatsimulator.com/?map=alps', null],
  ['empty share', 'https://paraguayandronecombatsimulator.com/?share=', null],
  ['a map track', `https://paraguayandronecombatsimulator.com/?share=trk-m&board=${B}`, [200, json({ id: 'trk-m2', name: 'Listed', author: 'Ada', document: MAP_DOC })]],
  ['a bare map document', `https://paraguayandronecombatsimulator.com/?share=trk-m&board=${B}`, [200, json(MAP_DOC)]],
  ['a field track', `https://paraguayandronecombatsimulator.com/?share=trk-f&board=${B}`, [200, json({ document: FIELD_DOC })]],
  ['a room track', `https://paraguayandronecombatsimulator.com/?share=trk-r&board=${B}`, [200, json({ document: ROOM_DOC })]],
  ['missing on the board', `https://paraguayandronecombatsimulator.com/?share=trk-x&board=${B}`, [404, json({ error: 'That track is not on the board.' })]],
  ['storage refusing the seat', `https://paraguayandronecombatsimulator.com/?share=trk-m&board=${B}`, [200, json({ document: MAP_DOC })], true],
  ['no window', null, null],
]) {
  store.clear();
  placeAt(place);
  routes = { '*': reply || [500, ''] };
  if (refuse) {
    store.setItem = () => {
      throw new Error('QuotaExceededError');
    };
  }
  await call(`adoptShareFromLocation ${label}`, async () => {
    const seat = await board.adoptShareFromLocation();
    return seat && { ...seat, document: seat.document && seat.document.id };
  });
  delete store.setItem;
}

t.finish('board.js', PINNED);
