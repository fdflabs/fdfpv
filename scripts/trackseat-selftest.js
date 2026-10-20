/*
 * trackseat-selftest.js: the share seat, edit keys and binds kept in this
 * browser (src/share/trackseat.js), pinned as a transcript.
 *
 *     node scripts/trackseat-selftest.js [--dump=<file>]   (npm run trackseat:selftest)
 *
 * Every export runs against a stand in localStorage that can hold junk or
 * refuse writes. Recorded: each answer and the exact storage left behind,
 * including which seat (quads' or planes') each aircraft reads and writes,
 * what a seat refuses, and how binds are normalised. Pinned by digest
 * (scripts/lib/transcript.js) on the module before its rewrite; the clock
 * in a seat's importedUtc is taken out.
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

const PINNED = '948ce9fd3b4020687959a2fb256021ae304d12c10b6d23d305b447f5a12a9d6a';

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

const s = await import('../src/share/trackseat.js');
const t = transcript();
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
  store.map.set('webfpv.share.import.v1', raw);
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
store.map.set('webfpv.share.import.v1', '1');
store.map.set('webfpv.share.import.wing.v1', '2');
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
  store.map.set('webfpv.share.editkeys.v1', raw);
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
store.map.set('webfpv.share.bind.v1', '{"a":"str","b":7,"c":{"x":1},"d":null}');
for (const id of ['a', 'b', 'c', 'd']) {
  t.rec(`readBind of a stored ${id}`, () => s.readBind(id));
}
store.map.set('webfpv.share.bind.v1', '[1]');
t.rec('readBind over an array', () => s.readBind('0'));
t.rec('writeBind over an array', () => s.writeBind('0', { board: 'b' }));
look('binds over an array');

t.finish('trackseat.js', PINNED);
