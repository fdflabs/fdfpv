/*
 * oldkeys-selftest.js: the move from the old webfpv.* storage names to the
 * fdfpv.* ones (src/share/oldkeys.js).
 *
 *     node scripts/oldkeys-selftest.js      (npm run oldkeys:selftest)
 *
 * Seeds old keys and proves the move: the value arrives under the new
 * name and the old name is gone; a value already under the new name wins;
 * running it twice changes nothing; a refused write keeps the old value
 * for the next load and still moves the other pairs; no storage at all is
 * not an error.
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

import { carryRenamedKeys } from '../src/share/oldkeys.js';

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
  constructor(entries = {}, refuse = new Set()) {
    this.map = new Map(Object.entries(entries));
    this.refuse = refuse;
  }

  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }

  setItem(k, v) {
    if (this.refuse.has(k)) {
      throw new Error('QuotaExceededError');
    }
    this.map.set(k, String(v));
  }

  removeItem(k) {
    this.map.delete(k);
  }

  plain() {
    return JSON.stringify(Object.fromEntries([...this.map].sort()));
  }
}

const PAIRS = [['webfpv.a.v1', 'fdfpv.a.v1'], ['webfpv.b', 'fdfpv.b'], ['webfpv.c', 'fdfpv.c']];

{
  const s = new Storage({ 'webfpv.a.v1': '{"x":1}', 'webfpv.b': '', 'other.key': 'kept' });
  carryRenamedKeys(PAIRS, s);
  check('an old value arrives under the new name', s.getItem('fdfpv.a.v1') === '{"x":1}');
  check('an empty string is a value too', s.getItem('fdfpv.b') === '');
  check('the old names are gone', s.getItem('webfpv.a.v1') === null && s.getItem('webfpv.b') === null);
  check('a pair with nothing stored writes nothing', s.getItem('fdfpv.c') === null);
  check('keys outside the pairs are untouched', s.getItem('other.key') === 'kept');
  const once = s.plain();
  carryRenamedKeys(PAIRS, s);
  check('running it twice changes nothing', s.plain() === once, s.plain());
}
{
  const s = new Storage({ 'webfpv.a.v1': 'stale', 'fdfpv.a.v1': 'live' });
  carryRenamedKeys(PAIRS, s);
  check('a value already under the new name wins, and the stale one goes', s.getItem('fdfpv.a.v1') === 'live' && s.getItem('webfpv.a.v1') === null);
}
{
  const s = new Storage({ 'webfpv.a.v1': 'A', 'webfpv.b': 'B' }, new Set(['fdfpv.a.v1']));
  carryRenamedKeys(PAIRS, s);
  check('a refused write keeps the old value for next time', s.getItem('webfpv.a.v1') === 'A' && s.getItem('fdfpv.a.v1') === null);
  check('and the other pairs still move', s.getItem('fdfpv.b') === 'B' && s.getItem('webfpv.b') === null);
  s.refuse = new Set();
  carryRenamedKeys(PAIRS, s);
  check('the next load finishes the move', s.getItem('fdfpv.a.v1') === 'A' && s.getItem('webfpv.a.v1') === null);
}
{
  let threw = false;
  try {
    carryRenamedKeys(PAIRS, null);
    carryRenamedKeys(PAIRS);
  } catch (e) {
    threw = true;
  }
  check('no storage at all is nothing to do', !threw);
  globalThis.localStorage = new Storage({ 'webfpv.c': 'C' });
  carryRenamedKeys(PAIRS);
  check('by default it is the page\'s localStorage', globalThis.localStorage.getItem('fdfpv.c') === 'C');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
