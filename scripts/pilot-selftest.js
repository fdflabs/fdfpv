/*
 * pilot-selftest.js: the name a pilot flies and posts under
 * (src/share/pilot.js), pinned as a transcript.
 *
 *     node scripts/pilot-selftest.js [--dump=<file>]   (npm run pilot:selftest)
 *
 * Which names are accepted and how they are tidied, the account record a
 * signed in browser keeps and how its callsign wins over the stored name,
 * and what each call leaves in a stand in storage that can refuse access
 * or writes. Pinned by digest (scripts/lib/transcript.js) on the module
 * before its rewrite.
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

const PINNED = 'cfb21b31fad524bc9c31be5c48a1e0b7abdaaa70ce4202f13b62d059a12b2605';
const map = new Map();
let mode = 'ok';
globalThis.localStorage = {
  getItem(k) {
    if (mode === 'locked') {
      throw new Error('SecurityError');
    }
    return map.has(k) ? map.get(k) : null;
  },
  setItem(k, v) {
    if (mode !== 'ok') {
      throw new Error('QuotaExceededError');
    }
    map.set(k, String(v));
  },
  removeItem(k) {
    map.delete(k);
  },
};
const pilot = await import('../src/share/pilot.js');
const t = transcript();
const dump = () => [...map.entries()].sort();

t.note('exports', Object.keys(pilot).sort());
t.note('ACCOUNT_KEY', pilot.ACCOUNT_KEY);
t.rec('nameRules', () => pilot.nameRules());
const NAMES = [undefined, null, '', ' ', 'a', 'ab', '  Ada  ', 'Ada   Lovelace', 'Ada\tLovelace', 'x'.repeat(24), 'x'.repeat(25), '  ' + 'x'.repeat(24) + '  ',
  'Ada_Lovelace-1.0', 'Ada!', 'Ádá', 'Ada\nB', 42, 3.5, true, {}, ['Ada'], '..', '-_'];
for (const n of NAMES) {
  t.rec(`normaliseName ${JSON.stringify(n)}`, () => pilot.normaliseName(n));
}
for (const n of NAMES) {
  map.clear();
  t.rec(`writePilotName ${JSON.stringify(n)}`, () => pilot.writePilotName(n));
  t.note(`  stored`, dump());
  t.rec('  readPilotName', () => pilot.readPilotName());
}
map.clear();
mode = 'full';
t.rec('writePilotName with storage full', () => pilot.writePilotName('Ada'));
t.note('  stored', dump());
mode = 'locked';
t.rec('readPilotName locked', () => pilot.readPilotName());
t.rec('readAccount locked', () => pilot.readAccount());
mode = 'ok';
for (const raw of [null, '', 'null', '{bad', '[]', '{"session":5}', '{"session":"s"}', '{"session":"","callsign":"Bo"}', '{"session":"s","callsign":"Bo"}',
  '{"session":"s","callsign":"  Grace  Hopper "}', '{"session":"s","callsign":"!"}', '{"session":"s","callsign":""}']) {
  map.clear();
  map.set('webfpv.pilot.name', 'Ada');
  if (raw !== null) {
    map.set(pilot.ACCOUNT_KEY, raw);
  }
  t.rec(`readAccount ${raw}`, () => pilot.readAccount());
  t.rec(`readPilotName with account ${raw}`, () => pilot.readPilotName());
}
map.clear();
map.set('webfpv.pilot.name', '  Ada  ');
t.rec('readPilotName tidies a stored name', () => pilot.readPilotName());
map.set('webfpv.pilot.name', 'A');
t.rec('readPilotName of a stored name too short', () => pilot.readPilotName());

t.finish('pilot.js', PINNED);
