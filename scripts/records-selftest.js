/*
 * records-selftest.js: src/share/records.js and the records section of
 * the progress sync, in plain Node. Best laps from before the sync (old
 * localStorage keys) reach the account, two computers merge to the lower
 * lap per key, and the merge writes back only what is better.
 *
 *   node scripts/records-selftest.js
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

import {
  RECORDS_MAX, RECORD_PREFIX, cleanRecords, keepRecords, mergeRecords, readRecords,
} from '../src/share/records.js';
import { SYNCED_SECTIONS, cleanBlob, mergeBlobs, pickSynced } from '../src/share/progressmerge.js';

let failed = 0;
function check(name, ok) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) {
    failed += 1;
  }
}

/* A localStorage stand in with the same key(i) walk. */
function storage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    dump: () => Object.fromEntries(m),
  };
}

const A = `${RECORD_PREFIX}1a2b3c4d.16.80.timber1500`;
const B = `${RECORD_PREFIX}99ffee00.25.20.arcade.cub1400`;
const C = `${RECORD_PREFIX}5e5e5e5e.16.80.timber1500.g50`;

/* A computer that raced before this change: its records as race.js wrote
 * them (a rounded ms as text), beside other settings. */
const old = storage({
  [A]: '41234', [B]: '38000.4', 'fdfpv.settings': '{"x":1}', 'webfpv.bestLapMs': '9000', [`${RECORD_PREFIX}junk`]: 'abc',
});
const sent = readRecords(old);
check('old records are all read, rounded', sent[A] === 41234 && sent[B] === 38000);
check('nothing but best lap keys is read', Object.keys(sent).length === 2);
check('the section is synced as best', SYNCED_SECTIONS.records === 'best');
check('pickSynced carries the records', pickSynced({ records: sent }).records[A] === 41234);

const account = mergeBlobs({ v: 1, data: { records: sent }, stamps: {} }, null);
check('a first sync puts the old records on the account', account.data.records[A] === 41234 && account.data.records[B] === 38000);

const other = mergeBlobs({ v: 1, data: { records: { [A]: 40000, [C]: 50000 } }, stamps: {} }, account);
check('the lower lap wins per key', other.data.records[A] === 40000);
check('the higher lap does not win', mergeRecords({ [B]: 39000 }, other.data.records)[B] === 38000);
check('a key on one side only is kept', other.data.records[B] === 38000 && other.data.records[C] === 50000);
check('a merge is the same either way round', JSON.stringify(mergeRecords({ [A]: 1, [B]: 9 }, { [A]: 5, [C]: 3 })) === JSON.stringify(mergeRecords({ [A]: 5, [C]: 3 }, { [A]: 1, [B]: 9 })));
check('stamps play no part', mergeBlobs({ v: 1, data: { records: { [A]: 45000 } }, stamps: { records: 9e12 } }, other).data.records[A] === 40000);

check('a malformed value or key is dropped', JSON.stringify(cleanRecords({ [A]: -1, [B]: 'x', [C]: 4e6, other: 100, [`${RECORD_PREFIX}ok`]: 500 })) === JSON.stringify({ [`${RECORD_PREFIX}ok`]: 500 }));
check('a section that is not a map is dropped', cleanBlob({ v: 1, data: { records: [1, 2] } }).data.records === undefined);

const many = {};
for (let i = 0; i < RECORDS_MAX + 50; i += 1) {
  many[`${RECORD_PREFIX}${String(i).padStart(5, '0')}`] = 1000 + i;
}
const capped = mergeRecords(many, {});
const names = Object.keys(capped);
check('the cap holds', names.length === RECORDS_MAX);
check('the cap keeps the first key names in sorted order', names[0] === `${RECORD_PREFIX}00000` && names[RECORDS_MAX - 1] === `${RECORD_PREFIX}${String(RECORDS_MAX - 1).padStart(5, '0')}`);

/* Back on the old computer: only the better laps are written. */
old.setItem(B, '37000');
keepRecords(other.data.records, old);
check('a better lap from the account is written here', old.getItem(A) === '40000');
check('a new key from the account is written here', old.getItem(C) === '50000');
check('a better lap held here is not overwritten', old.getItem(B) === '37000');
check('nothing else is touched', old.getItem('webfpv.bestLapMs') === '9000' && old.getItem('fdfpv.settings') === '{"x":1}');
const again = mergeBlobs({ v: 1, data: { records: readRecords(old) }, stamps: {} }, other);
check('the next sync carries the better lap up', again.data.records[B] === 37000);
check('syncing the same records twice changes nothing', JSON.stringify(mergeBlobs({ v: 1, data: { records: readRecords(old) }, stamps: {} }, again).data.records) === JSON.stringify(again.data.records));

check('no storage reads as no records', JSON.stringify(readRecords({ get length() { throw new Error('blocked'); } })) === '{}');

console.log(failed ? `${failed} FAILED` : 'records selftest PASS');
process.exit(failed ? 1 : 0);
