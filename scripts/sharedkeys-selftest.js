/*
 * sharedkeys-selftest.js: the keys the simulator shares with the board on
 * one origin, through their move to fdfpv.* names (src/share/sharedkeys.js).
 *
 *     node scripts/sharedkeys-selftest.js      (npm run sharedkeys:selftest)
 *
 * Plays both sites' builds against one storage: a build that knows only
 * the old names, and one that knows both. Whatever order they read and
 * write in, each reads the value written last; a refused write never
 * leaves the newer value hidden; the language choice and the statistics
 * memory go through it (src/strings/index.js, src/share/stats.js).
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

class Storage {
  constructor() {
    this.map = new Map();
    this.refuse = new Set();
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
}
const store = new Storage();
globalThis.localStorage = store;
Object.defineProperty(globalThis, 'navigator', { value: { language: 'en-US' }, configurable: true, writable: true });

const { LANG_KEY, STATS_KEY, readSharedKey, writeSharedKey } = await import('../src/share/sharedkeys.js');
const strings = await import('../src/strings/index.js');
const stats = await import('../src/share/stats.js');

const OLD = { [LANG_KEY]: 'webfpv.lang', [STATS_KEY]: 'webfpv.stats.v1' };
check('the new names', LANG_KEY === 'fdfpv.lang' && STATS_KEY === 'fdfpv.stats.v1' && strings.LANG_KEY === LANG_KEY);

for (const key of [LANG_KEY, STATS_KEY]) {
  const old = OLD[key];
  /* An old build reads and writes only the old name. */
  const oldWrite = (v) => store.setItem(old, v);
  const oldRead = () => store.getItem(old);
  store.map.clear();
  check(`${key}: nothing stored reads null`, readSharedKey(key) === null);
  oldWrite('A');
  check(`${key}: a value only under the old name is read`, readSharedKey(key) === 'A');
  writeSharedKey(key, 'B');
  check(`${key}: a write goes under both names`, store.getItem(key) === 'B' && store.getItem(old) === 'B');
  check(`${key}: and both builds read it`, readSharedKey(key) === 'B' && oldRead() === 'B');
  oldWrite('C');
  check(`${key}: an old build writing later wins`, readSharedKey(key) === 'C');
  writeSharedKey(key, 'D');
  check(`${key}: and a new build writing after that wins again`, readSharedKey(key) === 'D' && oldRead() === 'D');
  store.map.clear();
  store.setItem(key, 'N');
  check(`${key}: a value only under the new name is read`, readSharedKey(key) === 'N');
  store.refuse.add(key);
  try {
    writeSharedKey(key, 'E');
  } catch (e) {
    /* Refused, as storage does. */
  }
  check(`${key}: a refused second write still reads the newer value`, readSharedKey(key) === 'E');
  store.refuse = new Set([old]);
  let threw = false;
  try {
    writeSharedKey(key, 'F');
  } catch (e) {
    threw = true;
  }
  check(`${key}: a refused first write throws and changes nothing`, threw && readSharedKey(key) === 'E');
  store.refuse = new Set();
}

/* The language choice. */
store.map.clear();
globalThis.window = { location: { search: '' } };
check('language: no choice reads the browser\'s', strings.preferredLocale() === 'en-US');
store.setItem('webfpv.lang', 'es');
check('language: a choice the old build kept is honoured', strings.preferredLocale() === 'es');
strings.rememberLocale('en');
check('language: a new choice is kept under both names', store.getItem('fdfpv.lang') === 'en' && store.getItem('webfpv.lang') === 'en' && strings.preferredLocale() === 'en');
globalThis.window = { location: { search: '?lang=es' } };
check('language: the address still wins', strings.preferredLocale() === 'es');

/* The statistics memory. */
store.map.clear();
store.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
check('stats: an opt out the old board kept is honoured', stats.optedOut() === true && stats.counting() === false);
stats.setOptedOut(false);
check('stats: switching back on is kept under both names', JSON.parse(store.getItem('fdfpv.stats.v1')).optOut === false
  && JSON.parse(store.getItem('webfpv.stats.v1')).optOut === false);
store.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
check('stats: the old board opting out again is honoured', stats.optedOut() === true);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
