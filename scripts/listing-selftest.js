/*
 * listing-selftest.js: src/share/listing.js against a recorded transcript.
 *
 *     node scripts/listing-selftest.js           (npm run listing:selftest)
 *     node scripts/listing-selftest.js --write   (record the transcript anew)
 *
 * Every export is driven through a fixed set of cases, in Node, against a
 * stand in localStorage and a stand in board that answers fetch. What each
 * call returns, every request it sends the board and what it leaves in
 * storage are written down, and the run passes only when all of it matches
 * tests/fixtures/listing-transcript.json row for row. The transcript was
 * recorded on the module as it stood before its rewrite, so it is the
 * contract the rewrite has to keep: the same answers, the same requests in
 * the same order, the same keys and values saved.
 *
 * Track ids and timestamps are minted at random and from the clock, so
 * Math.random is seeded and every ISO time reads as one fixed string.
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

import { readFileSync, writeFileSync } from 'node:fs';

const TRANSCRIPT = new URL('../tests/fixtures/listing-transcript.json', import.meta.url);
const WRITE = process.argv.includes('--write');

class Storage {
  constructor() {
    this.map = new Map();
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

  clear() {
    this.map.clear();
  }

  sorted() {
    return Object.fromEntries([...this.map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  }
}

globalThis.localStorage = new Storage();

let seed = 1;
Math.random = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

/* The stand in board. `docs` answers GET .../document, `list` answers GET
 * /api/tracks, `publish` decides a POST. Every request is logged. */
const board = { list: [], docs: {}, docFail: new Set(), publish: null, log: [] };

globalThis.fetch = async (url, init = {}) => {
  const method = init.method || 'GET';
  const body = init.body ? JSON.parse(init.body) : undefined;
  board.log.push(body === undefined ? { method, url } : { method, url, body });
  const reply = (status, payload) => new Response(JSON.stringify(payload), { status });
  const doc = /\/api\/tracks\/([^/]+)\/document$/.exec(url);
  if (method === 'GET' && doc) {
    const id = decodeURIComponent(doc[1]);
    if (board.docFail.has(id)) {
      throw new TypeError('fetch failed');
    }
    return id in board.docs ? reply(200, board.docs[id]) : reply(404, { error: 'That track is not on the board.' });
  }
  if (method === 'GET' && /\/api\/tracks$/.test(url)) {
    return reply(200, { tracks: board.list });
  }
  if (method === 'POST' && /\/api\/tracks$/.test(url)) {
    const [status, payload] = board.publish ? board.publish(body) : [201, { id: body.document.id, name: body.document.name, editKey: `ek-${body.document.id}` }];
    return reply(status, payload);
  }
  return reply(404, { error: 'no route' });
};

const listing = await import('../src/share/listing.js');
const { writeShareImport, writeEditKey, writeBind } = await import('../src/share/session.js');
const { createTrack, createMapTrack, createElement, createSequenceEntry, normalize } = await import('../src/trackbuilder/model.js');

const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g;

/* An error the module or the board raises on purpose is its message and
 * flags, which callers show and branch on. One the engine raises (a
 * TypeError from reading into null) is only its kind: its message quotes
 * the source expression, which is the implementation, not the contract.
 * Everything goes through JSON with the clock taken out. */
const ENGINE_ERRORS = [TypeError, RangeError, ReferenceError, SyntaxError];
function plain(value) {
  const seen = JSON.stringify(value, (k, v) => {
    if (ENGINE_ERRORS.some((E) => v instanceof E)) {
      return { engineError: v.name };
    }
    if (v instanceof Error) {
      return { error: v.message, status: v.status, conflict: v.conflict };
    }
    return v === undefined ? '<undefined>' : v;
  });
  return seen === undefined ? '<undefined>' : JSON.parse(seen.replace(ISO, '<time>'));
}

const rows = [];
async function row(name, run) {
  board.log = [];
  let out;
  try {
    out = { returned: plain(await run()) };
  } catch (e) {
    out = { threw: plain(e) };
  }
  rows.push({ name, ...out, requests: plain(board.log), storage: plain(localStorage.sorted()) });
}

function reset() {
  localStorage.clear();
  board.list = [];
  board.docs = {};
  board.docFail = new Set();
  board.publish = null;
}

/* A track in a world (only those can be seated) with three gates and a
 * waypoint in its flying order, and a painted logo that is not layout.
 * `map` null makes the older field track instead. */
function gatedTrack(name, cls, map = 'swiss2') {
  const doc = map ? createMapTrack(name, map) : createTrack(name, cls);
  if (cls) {
    doc.trackClass = cls;
  }
  for (const [i, type] of ['gate', 'gate', 'waypoint', 'gate'].entries()) {
    const el = createElement(doc, type === 'waypoint' ? 'waypoint' : 'gate', { x: i * 5, y: 0, z: 0 }, 0);
    doc.elements.push(el);
    doc.sequence.push(createSequenceEntry(doc, el.id, 0));
  }
  doc.elements.push(createElement(doc, 'groundLogo', { x: 1, y: 1, z: 0 }, 0));
  return doc;
}

console.log('layoutFingerprint');
{
  reset();
  const field = gatedTrack('Field', undefined, null);
  const onMap = gatedTrack('On swiss2');
  const repainted = structuredClone(field);
  repainted.elements = repainted.elements.filter((e) => e.type !== 'groundLogo');
  const map4 = createMapTrack('On alps', 'alps');
  const map3 = { ...createMapTrack('Old', 'alps'), schemaVersion: 3 };
  await row('fingerprint of nothing, a string, a number', () => [null, undefined, 'x', 7, false].map((d) => listing.layoutFingerprint(d)));
  await row('fingerprint of a bare object', () => listing.layoutFingerprint({}));
  await row('fingerprint of a field track', () => listing.layoutFingerprint(field));
  await row('a painted logo is not layout', () => listing.layoutFingerprint(field) === listing.layoutFingerprint(repainted));
  await row('the name and id are not layout', () => listing.layoutFingerprint(field) === listing.layoutFingerprint({ ...field, id: 'trk-other', name: 'Other' }));
  await row('fingerprint of a version 4 map track', () => listing.layoutFingerprint(map4));
  await row('fingerprint of a gated map track', () => listing.layoutFingerprint(onMap));
  await row('the same gates in another world are another layout', () => listing.layoutFingerprint(onMap) === listing.layoutFingerprint({ ...onMap, map: 'alps' }));
  await row('a version 3 document naming a map has no map key', () => listing.layoutFingerprint(map3));
  await row('a normalized document', () => listing.layoutFingerprint(normalize(field)));
  await row('a document toPlain refuses', () => listing.layoutFingerprint({ schemaVersion: 3, elements: 'not a list', field: { w: 1 } }));
  await row('raw parts without a version', () => listing.layoutFingerprint({ elements: [{ type: 'groundLogo' }, null, { type: 'gate' }], sequence: [{ elementId: 'a' }] }));
}

console.log('suggestRemixName');
await row('remix names', () => ['', null, undefined, '  Spiral  ', 'Spiral remix', 'Spiral REMIX', 'x'.repeat(100), 'remix'].map((n) => listing.suggestRemixName(n)));

console.log('inspectCourse');
{
  reset();
  const doc = gatedTrack('Owned course');
  const fp = listing.layoutFingerprint(doc);
  const keys = { [doc.id]: 'ek' };
  const owned = (bind, extra = {}) => listing.inspectCourse({
    share: { id: doc.id, name: doc.name, author: 'Ada', document: doc, ...extra.share },
    editKeyFor: (id) => keys[id] || null,
    bindFor: () => bind,
    pilotName: extra.pilotName ?? 'Ada',
  });
  await row('no seat', () => listing.inspectCourse({ share: null }));
  await row('a seat with no document', () => listing.inspectCourse({ share: { id: 'x' } }));
  await row('a local track', () => listing.inspectCourse({ share: { local: true, name: 'Mine', document: doc } }));
  await row('a local track named by its document', () => listing.inspectCourse({ share: { local: true, document: doc } }));
  await row('a community track', () => listing.inspectCourse({
    share: { id: 'trk-board', name: 'Theirs', author: 'Bo', board: 'https://b.example', document: { ...doc, id: 'trk-board' } },
    editKeyFor: () => null,
    bindFor: () => null,
    pilotName: 'Ada',
  }));
  await row('a community track id from its document', () => listing.inspectCourse({
    share: { document: { ...doc, id: 'trk-doc' } }, editKeyFor: () => null, bindFor: () => null, pilotName: null,
  }));
  await row('owned, no bind', () => owned(null));
  await row('owned, bind current', () => owned({ board: 'https://bind.example', author: 'Ada', nameOnBoard: doc.name, layoutFingerprint: fp }));
  await row('owned, layout moved', () => owned({ author: 'Ada', nameOnBoard: doc.name, layoutFingerprint: 'other' }));
  await row('owned, renamed', () => owned({ author: 'Ada', nameOnBoard: 'Old name', layoutFingerprint: fp }));
  await row('owned, handle changed', () => owned({ author: 'Ada', nameOnBoard: doc.name, layoutFingerprint: fp }, { pilotName: 'Grace' }));
  await row('owned, bind with no fingerprint or name', () => owned({ author: '' }));
  await row('community with a stale bind fingerprint', () => listing.inspectCourse({
    share: { id: doc.id, document: doc }, editKeyFor: () => null, bindFor: () => ({ layoutFingerprint: 'other', nameOnBoard: 'X', author: 'Bo' }), pilotName: 'Ada',
  }));
  await row('a document with sequence pointing nowhere', () => listing.inspectCourse({
    share: { id: 'a', document: { id: 'a', name: 'Odd', elements: [{ id: 'e1', type: 'gate' }], sequence: [{ elementId: 'e1' }, { elementId: 'gone' }] } },
    editKeyFor: () => null, bindFor: () => null, pilotName: null,
  }));
  await row('a document with no sequence or elements', () => listing.inspectCourse({
    share: { id: 'a', document: { id: 'a' } }, editKeyFor: () => null, bindFor: () => null, pilotName: null,
  }));
}

console.log('the live seat');
{
  reset();
  await row('nothing seated', () => ({ key: listing.seatedCourseKey(), flyable: listing.hasFlyableTrack(), course: listing.inspectCourse() }));
  const doc = gatedTrack('Seated');
  writeShareImport({ id: doc.id, name: doc.name, author: 'Ada', board: 'https://b.example', document: doc });
  localStorage.setItem('webfpv.pilot.name', 'Ada');
  await row('a board track seated', () => ({ key: listing.seatedCourseKey(), flyable: listing.hasFlyableTrack(), course: listing.inspectCourse() }));
  writeEditKey(doc.id, 'ek-live');
  writeBind(doc.id, { board: 'https://b.example', author: 'Ada', nameOnBoard: 'Seated', layoutFingerprint: listing.layoutFingerprint(doc), owned: true });
  await row('owned and bound, from storage', () => ({ key: listing.seatedCourseKey(), course: listing.inspectCourse() }));
  localStorage.setItem('webfpv.account.v1', JSON.stringify({ session: 's', callsign: 'Grace' }));
  await row('an account callsign is the pilot name', () => listing.inspectCourse());
  reset();
  const empty = createTrack('Empty');
  writeShareImport({ id: empty.id, name: empty.name, document: empty });
  await row('a field track cannot be seated', () => listing.hasFlyableTrack());
  const bare = createMapTrack('Bare', 'alps');
  writeShareImport({ id: bare.id, name: bare.name, document: bare });
  await row('a seated track with no gates is not flyable', () => listing.hasFlyableTrack());
  const mine = gatedTrack('Mine');
  writeShareImport({ id: mine.id, name: 'Mine', document: mine, local: true });
  await row('a local track seated', () => ({ key: listing.seatedCourseKey(), flyable: listing.hasFlyableTrack(), course: listing.inspectCourse() }));
  localStorage.setItem('webfpv.settings.v3', JSON.stringify({ airframe: 'cub1400' }));
  await row('a plane reads the planes\' seat', () => ({ key: listing.seatedCourseKey(), flyable: listing.hasFlyableTrack() }));
  writeShareImport({ id: 'trk-wing', name: 'Wing', document: { ...gatedTrack('Wing', 'wing'), id: 'trk-wing' } });
  await row('a plane seat holding a wing track', () => ({ key: listing.seatedCourseKey(), flyable: listing.hasFlyableTrack() }));
  localStorage.setItem('webfpv.share.import.v1', '{not json');
  localStorage.removeItem('webfpv.settings.v3');
  await row('a corrupt seat', () => ({ key: listing.seatedCourseKey(), flyable: listing.hasFlyableTrack() }));
}

console.log('findBoardTwin');
{
  reset();
  const flown = gatedTrack('Spiral');
  const moved = structuredClone(flown);
  moved.elements[0].position.x += 3;
  const ORIGIN = 'https://board.example';
  const listed = (id, name, extra = {}) => ({ id, name, author: 'Bo', trackClass: 'full', ...extra });
  await row('no document', () => listing.findBoardTwin({ name: 'Spiral', origin: ORIGIN }));
  await row('no arguments at all', () => listing.findBoardTwin());
  board.list = [listed('t1', 'Other'), listed('t2', 'spiral '), listed('t3', 'Spiral', { trackClass: 'wing' })];
  board.docs = { t1: { id: 't1', name: 'Other', document: moved }, t2: { id: 't2b', name: 'Spiral', author: 'Cy', document: { ...flown, id: 't2' } } };
  await row('the same-name listing is looked at first and matches', () => listing.findBoardTwin({ doc: flown, name: 'Spiral', origin: ORIGIN }));
  board.docs.t2 = { document: moved };
  board.docs.t1 = flown;
  await row('a same-name listing with another layout, then a bare document that matches', () => listing.findBoardTwin({ doc: flown, name: ' SPIRAL', origin: ORIGIN }));
  board.docs.t1 = { document: moved };
  await row('a same-name listing with another layout and no match', () => listing.findBoardTwin({ doc: flown, name: 'Spiral', origin: ORIGIN }));
  board.list = [listed('w1', 'Spiral', { trackClass: 'wing', board: 'https://other.example' })];
  board.docs = { w1: { document: { ...flown, trackClass: 'wing' } } };
  await row('a wing track only matches a wing listing, on its own board', () => listing.findBoardTwin({ doc: { ...flown, trackClass: 'wing' }, name: 'Spiral', trackClass: 'wing', origin: ORIGIN }));
  board.list = [listed('f1', 'Spiral'), listed('', 'No id'), listed('f2', 'Spiral')];
  board.docs = { f2: { name: '', document: flown } };
  board.docFail = new Set(['f1']);
  await row('a candidate that will not load is skipped', () => listing.findBoardTwin({ doc: flown, name: 'Spiral', origin: ORIGIN }));
  board.list = Array.from({ length: 8 }, (_, i) => listed(`c${i}`, `Course ${i}`));
  board.docs = Object.fromEntries(board.list.map((t) => [t.id, { document: moved }]));
  board.docs.c7 = { document: flown };
  board.docFail = new Set();
  await row('only six candidates are looked at', () => listing.findBoardTwin({ doc: flown, name: 'Spiral', origin: ORIGIN }));
  board.list = [listed('m1', 'Spiral', { trackClass: 'micro' })];
  await row('a room listing is not the field', () => listing.findBoardTwin({ doc: flown, name: 'Spiral', origin: ORIGIN }));
  board.list = [listed('d1', 'Spiral')];
  board.docs = { d1: { document: flown } };
  await row('with no origin, the default board', () => listing.findBoardTwin({ doc: flown, name: 'Spiral' }));
}

console.log('syncOwnedName');
{
  const ORIGIN = 'https://board.example';
  reset();
  const doc = gatedTrack('Named');
  await row('no document', () => listing.syncOwnedName(null, ORIGIN));
  await row('a document with no id', () => listing.syncOwnedName({ name: 'x' }, ORIGIN));
  await row('not owned', () => listing.syncOwnedName(doc, ORIGIN));
  writeEditKey(doc.id, 'ek-named');
  await row('owned, no pilot name', () => listing.syncOwnedName(doc, ORIGIN));
  localStorage.setItem('webfpv.pilot.name', 'Ada');
  writeBind(doc.id, { board: 'https://bind.example', author: 'Ada', nameOnBoard: 'Named', layoutFingerprint: listing.layoutFingerprint(doc), owned: true });
  await row('owned, current', () => listing.syncOwnedName(doc, ORIGIN));
  await row('owned, renamed, publishes to the bind board', () => listing.syncOwnedName({ ...doc, name: 'Renamed' }));
  writeBind(doc.id, { board: '', author: 'Ada', nameOnBoard: 'Renamed', layoutFingerprint: 'stale' });
  await row('owned, layout changed since publish', () => listing.syncOwnedName({ ...doc, name: 'Again' }, ORIGIN));
  writeBind(doc.id, { author: 'Bo', nameOnBoard: 'Renamed', layoutFingerprint: listing.layoutFingerprint(doc), sourceId: 'src' });
  await row('owned, handle changed, same name', () => listing.syncOwnedName({ ...doc, name: 'Renamed' }, ORIGIN));
  writeBind(doc.id, { nameOnBoard: '' });
  board.docs = { [doc.id]: { name: 'Board name', author: 'Ada', document: doc } };
  await row('no fingerprint: the board copy names it the same', () => listing.syncOwnedName({ ...doc, name: 'Board name' }, ORIGIN));
  writeBind(doc.id, {});
  board.docs = { [doc.id]: { ...doc, name: 'Board name' } };
  await row('no fingerprint: a bare board document with no author', () => listing.syncOwnedName({ ...doc, name: 'Board name' }, ORIGIN));
  writeBind(doc.id, {});
  board.docs = { [doc.id]: { name: 'Board name', author: 'Ada', document: doc } };
  await row('no fingerprint: the board copy has the old name', () => listing.syncOwnedName({ ...doc, name: 'New name' }, ORIGIN));
  writeBind(doc.id, {});
  board.docs = {};
  await row('no fingerprint and the board says no', () => listing.syncOwnedName({ ...doc, name: 'New name' }, ORIGIN));
  writeBind(doc.id, {});
  board.docs = { [doc.id]: { name: 'Board name', document: { ...doc, sequence: [] } } };
  await row('no fingerprint and the board layout differs', () => listing.syncOwnedName({ ...doc, name: 'New name' }, ORIGIN));
  writeBind(doc.id, { nameOnBoard: 'Old', layoutFingerprint: listing.layoutFingerprint(doc) });
  board.publish = () => [400, { error: 'Bad name.' }];
  await row('the board refuses the publish', () => listing.syncOwnedName({ ...doc, name: 'New name' }, ORIGIN));
  board.publish = () => [201, { id: 'trk-moved', name: 'Board kept', editKey: 'ek-new' }];
  await row('the board answers under another id', () => listing.syncOwnedName({ ...doc, name: 'New name' }, ORIGIN));
  board.publish = () => [201, {}];
  writeBind(doc.id, { nameOnBoard: 'Old', layoutFingerprint: listing.layoutFingerprint(doc) });
  await row('the board answers with nothing', () => listing.syncOwnedName(normalize({ ...doc, name: 'Normalized' }), ORIGIN));
}

console.log('syncOwnedIdentity and pushOwnedListing');
{
  const ORIGIN = 'https://board.example';
  reset();
  await row('no pilot name', () => listing.syncOwnedIdentity(ORIGIN));
  localStorage.setItem('webfpv.pilot.name', 'Ada');
  await row('nothing owned', () => listing.syncOwnedIdentity(ORIGIN));
  const a = gatedTrack('A');
  const b = gatedTrack('B');
  const c = gatedTrack('C');
  const d = gatedTrack('D');
  writeEditKey(a.id, 'ek-a');
  writeEditKey(b.id, 'ek-b');
  writeEditKey(c.id, 'ek-c');
  writeEditKey(d.id, 'ek-d');
  writeEditKey('trk-blank', '');
  writeBind(a.id, { author: 'Ada' });
  writeBind(b.id, { author: 'Old', board: 'https://bind.example', nameOnBoard: 'B' });
  writeBind(c.id, { author: 'Old' });
  board.docs = {
    [b.id]: { name: 'B', author: 'Old', document: b },
    [c.id]: { author: 'Ada', document: { ...c, name: 'C on board' } },
  };
  writeShareImport({ id: b.id, name: 'B', document: b });
  await row('current, republished, already right, and gone', () => listing.syncOwnedIdentity(ORIGIN));
  writeBind(b.id, { author: 'Old' });
  writeShareImport({ id: 'trk-else', name: 'Else', document: { ...a, id: 'trk-else' } });
  await row('a republish of a track not seated leaves the seat', () => listing.syncOwnedIdentity());
  await row('push with no document', () => listing.pushOwnedListing(null, ORIGIN));
  writeBind(a.id, { author: 'Ada', nameOnBoard: 'A old', layoutFingerprint: listing.layoutFingerprint(a) });
  await row('push with a renamed document', () => listing.pushOwnedListing({ ...a, name: 'A new' }, ORIGIN));
}

console.log('publishCurrentCourse');
{
  const ORIGIN = 'https://board.example';
  reset();
  const doc = gatedTrack('Fresh');
  await row('a first publish', () => listing.publishCurrentCourse({ doc, author: 'Ada', origin: ORIGIN }));
  const field = gatedTrack('Field course', undefined, null);
  await row('a field track publishes but is not seated', () => listing.publishCurrentCourse({ doc: field, author: 'Ada', origin: ORIGIN }));
  await row('a rename while publishing, to the bind board', () => listing.publishCurrentCourse({ doc, author: 'Ada', courseName: 'Fresher' }));
  await row('the same name is not a rename', () => listing.publishCurrentCourse({ doc, author: 'Ada', courseName: 'Fresh', origin: ORIGIN }));
  const map = createMapTrack('Map course', 'swiss2');
  await row('a map track saves to its own autosave', () => listing.publishCurrentCourse({ doc: map, author: 'Ada', origin: ORIGIN }));
  reset();
  const taken = gatedTrack('Taken');
  let tries = 0;
  board.publish = (body) => {
    tries += 1;
    return tries === 1 ? [409, { error: 'Not yours.' }] : [201, { id: body.document.id, name: body.document.name, editKey: 'ek-fork' }];
  };
  await row('someone else holds the id: a fork', () => listing.publishCurrentCourse({ doc: taken, author: 'Ada', origin: ORIGIN }));
  board.publish = () => [409, { conflict: true, error: 'Still not yours.' }];
  await row('the fork is refused too', () => listing.publishCurrentCourse({ doc: taken, author: 'Ada', origin: ORIGIN }));
  board.publish = () => [500, { error: 'Down.' }];
  await row('any other refusal is thrown', () => listing.publishCurrentCourse({ doc: taken, author: 'Ada', origin: ORIGIN }));
  board.publish = null;
  await row('a document that is not a track is thrown', () => listing.publishCurrentCourse({ doc: null, author: 'Ada', origin: ORIGIN }));
}

if (WRITE) {
  writeFileSync(TRANSCRIPT, `${JSON.stringify(rows, null, 1)}\n`);
  console.log(`wrote ${rows.length} rows to ${TRANSCRIPT.pathname}`);
  process.exit(0);
}

const want = JSON.parse(readFileSync(TRANSCRIPT, 'utf8'));
let failed = 0;
for (let i = 0; i < Math.max(want.length, rows.length); i += 1) {
  const got = rows[i];
  const exp = want[i];
  const same = JSON.stringify(got) === JSON.stringify(exp);
  if (!same) {
    failed += 1;
  }
  const label = (got || exp).name;
  console.log(`  ${same ? 'pass' : 'FAIL'}  ${label}`);
  if (!same) {
    for (const part of ['returned', 'threw', 'requests', 'storage']) {
      const g = JSON.stringify(got?.[part]);
      const e = JSON.stringify(exp?.[part]);
      if (g !== e) {
        console.log(`        ${part} differs\n          want ${String(e).slice(0, 400)}\n          got  ${String(g).slice(0, 400)}`);
      }
    }
  }
}
console.log(`\n${rows.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
