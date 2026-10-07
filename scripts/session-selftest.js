/*
 * session-selftest.js: the share seat, edit keys, binds and lap
 * bookkeeping kept in this browser (src/share/session.js), pinned as a
 * transcript.
 *
 *     node scripts/session-selftest.js [--dump=<file>]   (npm run session:selftest)
 *
 * Every export runs against a stand in localStorage that can hold junk or
 * refuse writes. Recorded: each answer and the exact storage left behind,
 * including which seat (quads' or planes') each aircraft reads and writes,
 * what a seat refuses, and how binds, pending times and posted bests are
 * normalised. Pinned by digest (scripts/lib/transcript.js) on the module
 * before its rewrite; the clock in a seat's importedUtc is taken out.
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

import { transcript } from './lib/transcript.js';

const PINNED = '79771bcc69b90eb29cac8cef658a7c7271358c12d1503108b8ac80de3fa725bc';

class Storage {
  constructor() {
    this.map = new Map();
    this.mode = 'ok';
  }

  getItem(k) {
    if (this.mode === 'locked') {
      throw new Error('SecurityError');
    }
    return this.map.has(k) ? this.map.get(k) : null;
  }

  setItem(k, v) {
    if (this.mode !== 'ok') {
      throw new Error('QuotaExceededError');
    }
    this.map.set(k, String(v));
  }

  removeItem(k) {
    if (this.mode === 'locked') {
      throw new Error('SecurityError');
    }
    this.map.delete(k);
  }

  dump() {
    return [...this.map.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => [k, v.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, '<time>')]);
  }
}
const store = new Storage();
globalThis.localStorage = store;

/* One fixed moment, so a seat's importedUtc is the same every run. */
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) {
    super(...(a.length ? a : [RealDate.parse('2026-10-06T12:00:00Z')]));
  }
};

/* A browser that kept everything under the old names, as the module
 * loads: each value moves to its fdfpv.* name, once. */
for (const [i, name] of ['import.v1', 'import.wing.v1', 'editkeys.v1', 'bind.v1', 'pending.v1', 'posted.v1', 'import.micro.v1'].entries()) {
  store.map.set(`webfpv.share.${name}`, `old-${i}`);
}
const s = await import('../src/share/session.js');
const t = transcript();
t.note('the old names, moved at load (the whoop seat is not)', store.dump());
store.map.clear();
const reset = () => {
  store.map.clear();
  store.mode = 'ok';
};
const look = (label) => t.note(`${label} storage`, store.dump());
const engineSafe = (fn) => () => {
  try {
    return fn();
  } catch (e) {
    if (e instanceof TypeError || e instanceof RangeError) {
      return `engine ${e.constructor.name}`;
    }
    throw e;
  }
};

t.note('exports', Object.keys(s).sort());

/* readJson and writeJson. */
reset();
for (const raw of [null, '', '0', 'false', 'null', '{"a":1}', '[1,2]', '"text"', '{bad']) {
  if (raw === null) {
    store.map.delete('k');
  } else {
    store.map.set('k', raw);
  }
  t.rec(`readJson ${raw}`, () => s.readJson('k', 'FALLBACK'));
}
store.mode = 'locked';
t.rec('readJson locked', () => s.readJson('k', 'FALLBACK'));
reset();
for (const v of [{ a: [1, { b: 2 }] }, null, 'x', 0, undefined]) {
  t.rec(`writeJson ${JSON.stringify(v)}`, () => s.writeJson('w', v));
}
look('writeJson');
const loop = {};
loop.self = loop;
t.rec('writeJson a cycle', () => s.writeJson('w2', loop));
store.mode = 'full';
t.rec('writeJson storage full', () => s.writeJson('w3', 1));
look('writeJson refused');

/* The seat. */
const MAP_DOC = (id, extra = {}) => ({
  schemaVersion: 4, id, name: `Doc ${id}`, map: 'alps', elements: [], sequence: [], modifiedUtc: '2026-10-01T00:00:00Z', ...extra,
});
const AIRFRAMES = [null, '5inch', 'cub1400', 'striker2500', 'wot41334', 'whoop65', 'nonsense'];
for (const airframe of AIRFRAMES) {
  reset();
  if (airframe) {
    store.map.set('webfpv.settings.v3', JSON.stringify({ airframe }));
  }
  t.rec(`writeShareImport seated ${airframe}`, () => s.writeShareImport({ id: 'trk-1', name: 'One', author: 'Ada', board: 'https://b', document: MAP_DOC('trk-1') }));
  t.rec(`readShareImport seated ${airframe}`, () => s.readShareImport());
  t.rec(`readShareImport full seat, seated ${airframe}`, () => s.readShareImport('full'));
  t.rec(`readShareImport wing seat, seated ${airframe}`, () => s.readShareImport('wing'));
  t.rec(`readShareImport unknown seat, seated ${airframe}`, () => s.readShareImport('micro'));
  look(`seated ${airframe}`);
}
reset();
store.map.set('webfpv.settings.v3', '{not json');
t.rec('seat with settings that are not JSON', () => s.writeShareImport({ id: 'trk-2', document: MAP_DOC('trk-2') }));
look('settings not JSON');
reset();
for (const [label, payload] of [
  ['nothing', undefined],
  ['no document', { id: 'a' }],
  ['no id', { document: MAP_DOC('a') }],
  ['a field track', { id: 'a', document: { schemaVersion: 3, id: 'a' } }],
  ['a v4 doc with no map', { id: 'a', document: { schemaVersion: 4, id: 'a', map: '' } }],
  ['a v4 doc with a numeric map', { id: 'a', document: { schemaVersion: 4, id: 'a', map: 7 } }],
  ['a v5 doc', { id: 9, name: '', author: null, board: undefined, local: 'yes', extra: 'dropped', document: MAP_DOC('a', { schemaVersion: 5, name: '' }) }],
  ['a local track', { id: 'mine', local: true, document: MAP_DOC('mine') }],
  ['named by its document', { id: 'n', document: MAP_DOC('n') }],
]) {
  t.rec(`writeShareImport ${label}`, () => s.writeShareImport(payload));
}
look('seat writes');
for (const raw of ['{"id":"a"}', '{"document":{}}', '[]', '"str"', '{"id":"a","document":{"x":1},"extra":true}', '{bad']) {
  store.map.set('fdfpv.share.import.v1', raw);
  t.rec(`readShareImport of ${raw}`, () => s.readShareImport('full'));
}
store.mode = 'full';
t.rec('writeShareImport refused', () => s.writeShareImport({ id: 'z', document: MAP_DOC('z') }));
store.mode = 'ok';
for (const share of [null, {}, { id: '' }, { id: 'a' }, { id: 'a', local: true, document: { modifiedUtc: 'T1' } }, { id: 'a', local: true, document: {} }, { id: 'a', local: false, document: {} }]) {
  t.rec(`courseSeatKey ${JSON.stringify(share)}`, engineSafe(() => s.courseSeatKey(share)));
}
t.rec('courseSeatKey of a local seat with no document', engineSafe(() => s.courseSeatKey({ id: 'a', local: true })));
reset();
store.map.set('fdfpv.share.import.v1', '1');
store.map.set('fdfpv.share.import.wing.v1', '2');
s.clearShareImport('wing');
look('clearShareImport wing');
s.clearShareImport();
look('clearShareImport seated');
store.mode = 'locked';
t.rec('clearShareImport locked', () => s.clearShareImport());

/* Edit keys. */
reset();
t.rec('readEditKey none', () => s.readEditKey('a'));
for (const [id, key] of [['a', 'k1'], ['b', 12345], ['c', ''], ['', 'x'], [undefined, 'y'], ['a', 'k2']]) {
  t.rec(`writeEditKey ${id} ${key}`, () => s.writeEditKey(id, key));
}
look('edit keys');
for (const id of ['a', 'b', 'c', '', 'undefined', 'nope']) {
  t.rec(`readEditKey ${id}`, () => s.readEditKey(id));
}
t.rec('readAllEditKeys', () => s.readAllEditKeys());
for (const raw of ['[]', '"x"', 'null', '{"a":5,"b":"ok","c":null}', '{bad']) {
  store.map.set('fdfpv.share.editkeys.v1', raw);
  t.rec(`readEditKey a, stored ${raw}`, () => s.readEditKey('a'));
  t.rec(`readEditKey b, stored ${raw}`, () => s.readEditKey('b'));
  t.rec(`readAllEditKeys, stored ${raw}`, () => s.readAllEditKeys());
  t.rec(`writeEditKey, stored ${raw}`, () => s.writeEditKey('d', 'kd'));
  look(`edit keys over ${raw}`);
}

/* Binds. */
reset();
t.rec('readBind none', () => s.readBind('a'));
t.rec('writeBind full', () => s.writeBind('a', {
  board: 'https://b', author: 'Ada', nameOnBoard: 'N', layoutFingerprint: 'fp', owned: 1, sourceId: 0, sourceName: null, sourceAuthor: 7, extra: 'gone',
}));
t.rec('writeBind sparse', () => s.writeBind('b', { sourceId: 'src' }));
t.rec('writeBind no id', () => s.writeBind('', { board: 'x' }));
t.rec('writeBind null removes', () => s.writeBind('b', null));
t.rec('writeBind a string removes', () => s.writeBind('c', 'str'));
look('binds');
t.rec('readBind a', () => s.readBind('a'));
t.rec('readBind no id', () => s.readBind(''));
store.map.set('fdfpv.share.bind.v1', '{"a":"str","b":7,"c":{"x":1},"d":null}');
for (const id of ['a', 'b', 'c', 'd']) {
  t.rec(`readBind of a stored ${id}`, () => s.readBind(id));
}
store.map.set('fdfpv.share.bind.v1', '[1]');
t.rec('readBind over an array', () => s.readBind('0'));
t.rec('writeBind over an array', () => s.writeBind('0', { board: 'b' }));
look('binds over an array');

/* Laps. */
t.rec('lapSlot', () => [s.lapSlot('trk', ''), s.lapSlot('trk', 'cub1400'), s.lapSlot('trk'), s.lapSlot('', 'x'), s.lapSlot(undefined, null)]);
reset();
t.rec('readPendingTime none', () => s.readPendingTime());
for (const [label, p] of [
  ['nothing', null], ['no track', { lapMs: 1 }], ['no lap', { trackId: 'a' }], ['a string lap', { trackId: 'a', lapMs: '61000' }],
  ['NaN', { trackId: 'a', lapMs: NaN }], ['a plane lap', { trackId: 7, lapMs: 61234.5, craft: 'cub1400', name: 'dropped' }], ['a quad lap', { trackId: 'b', lapMs: 59999.4 }],
]) {
  t.rec(`writePendingTime ${label}`, () => s.writePendingTime(p));
  look(`pending after ${label}`);
}
t.rec('readPendingTime', () => s.readPendingTime());
for (const raw of ['{"trackId":"a"}', '{"trackId":"","lapMs":1}', '{"trackId":"a","lapMs":"1"}', '{"trackId":"a","lapMs":1,"x":2}', '[]']) {
  store.map.set('fdfpv.share.pending.v1', raw);
  t.rec(`readPendingTime of ${raw}`, () => s.readPendingTime());
}
store.map.set('fdfpv.share.pending.v1', '{"trackId":"a","lapMs":1}');
s.clearPendingTime('b');
look('clearPendingTime another track');
s.clearPendingTime('a');
look('clearPendingTime its track');
store.map.set('fdfpv.share.pending.v1', '{"trackId":"a","lapMs":1}');
s.clearPendingTime();
look('clearPendingTime any');
store.map.set('fdfpv.share.pending.v1', 'junk');
s.clearPendingTime('b');
look('clearPendingTime of junk');
store.mode = 'locked';
t.rec('clearPendingTime locked', engineSafe(() => s.clearPendingTime()));
reset();
t.rec('readPostedBest none', () => s.readPostedBest('a'));
for (const [id, ms] of [['a', 61000.4], ['a', 62000], ['a', 61000], ['a', 60000.6], ['b', 'x'], ['b', '59000'], ['', 1], ['c', Infinity], ['c', null]]) {
  t.rec(`writePostedBest ${id} ${ms}`, () => s.writePostedBest(id, ms));
}
look('posted bests');
for (const id of ['a', 'b', 'c', '']) {
  t.rec(`readPostedBest ${id}`, () => s.readPostedBest(id));
}
store.map.set('fdfpv.share.posted.v1', '{"a":{"lapMs":"oops"},"b":{"lapMs":"12"},"c":5}');
t.rec('readPostedBest junk', () => [s.readPostedBest('a'), s.readPostedBest('b'), s.readPostedBest('c')]);
t.rec('writePostedBest over junk', () => s.writePostedBest('a', 9));
look('posted over junk');

t.finish('session.js', PINNED);
