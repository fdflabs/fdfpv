/*
 * summary-selftest.js: the seated course's summary for the title menu and
 * the launch card (src/share/summary.js).
 *
 *     node scripts/summary-selftest.js      (npm run summary:selftest)
 *
 * Nothing seated, a seat that is junk, and a storage that refuses access
 * all read as no summary; a seated course reads as the listing
 * inspectCourse gives for it, the same object.
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

const map = new Map();
let locked = false;
globalThis.localStorage = {
  getItem: (k) => {
    if (locked) {
      throw new Error('SecurityError');
    }
    return map.has(k) ? map.get(k) : null;
  },
  setItem: (k, v) => map.set(k, String(v)),
  removeItem: (k) => map.delete(k),
};

const { activeCourseSummary } = await import('../src/share/summary.js');
const { inspectCourse } = await import('../src/share/listing.js');
const { writeShareImport } = await import('../src/share/session.js');

check('nothing seated: no summary', activeCourseSummary() === null);
map.set('webfpv.share.import.v1', '{junk');
check('a junk seat: no summary', activeCourseSummary() === null);
const doc = { schemaVersion: 4, id: 'trk-1', name: 'Ring', map: 'alps', elements: [{ id: 'e1', type: 'gate' }], sequence: [{ elementId: 'e1' }] };
writeShareImport({ id: 'trk-1', name: 'Ring', author: 'Ada', document: doc });
const got = activeCourseSummary();
check('a seated course: its listing', got && got.kind === 'community' && got.name === 'Ring' && got.gates === 1 && got.doc && got.doc.id === 'trk-1');
check('the same fields inspectCourse gives', JSON.stringify(got) === JSON.stringify(inspectCourse()));
writeShareImport({ id: 'mine', name: 'Mine', document: { ...doc, id: 'mine' }, local: true });
check('a course of the pilot\'s own: its listing too', activeCourseSummary()?.kind === 'local');
locked = true;
check('storage refused: no summary, no throw', activeCourseSummary() === null);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
