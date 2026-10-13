/*
 * save-selftest.js: the save envelope (src/share/save.js) over every
 * historic store, a broken blob, storage that refuses, and a round trip.
 *
 *     node scripts/save-selftest.js      (npm run save:selftest)
 *
 * The promise phase 19 makes is that opening the save changes nothing a
 * reader sees. So each store in tests/fixtures/save-pre-envelope.json is
 * read by the real readers (settings, stick map, pad, builds, pilot name,
 * language, best laps) once as it is and once after openSave, and the two
 * answers must be the same, as must every key a reader owns. Then a
 * second open must change nothing; a blob that does not parse is kept as
 * .corrupt and its .prev put back; a newer version is not touched; and
 * the envelope written into an empty store reads back as itself.
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

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const FIXTURE = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'save-pre-envelope.json'), 'utf8'));

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

/* A Map behind the Storage interface; `refuse` makes setItem throw, as a
 * full quota does. */
class Storage {
  constructor(entries = {}) {
    this.map = new Map(Object.entries(entries));
    this.refuse = false;
  }

  get length() { return this.map.size; }

  key(i) { return [...this.map.keys()][i] ?? null; }

  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }

  setItem(k, v) {
    if (this.refuse) throw new Error('QuotaExceededError');
    this.map.set(String(k), String(v));
  }

  removeItem(k) { this.map.delete(k); }

  clear() { this.map.clear(); }

  dump() { return Object.fromEntries([...this.map].sort(([a], [b]) => (a < b ? -1 : 1))); }
}

/* The readers read globalThis.localStorage; each case points it at its
 * own store. Node has no navigator that is a browser's. */
let current = new Storage();
Object.defineProperty(globalThis, 'localStorage', { get: () => current, configurable: true });
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', maxTouchPoints: 0 }, configurable: true, writable: true,
});

const save = await import('../src/share/save.js');
const { SETTINGS_KEY, loadSettings } = await import('../src/ui/settings.js');
const { BUILDS_KEY, loadBuilds } = await import('../src/ui/builds.js');
const { loadPadChoice, loadStickMap, migrateStickStorage } = await import('../src/input/stickstore.js');
const { readPilotName } = await import('../src/share/pilot.js');
const { readSharedKey, LANG_KEY } = await import('../src/share/sharedkeys.js');
const { readRecords } = await import('../src/share/records.js');
const { deviceKey } = await import('../src/input/padprofiles.js');

const show = (v) => JSON.stringify(v);

/* Everything a reader answers for the store, in boot's order: the stick
 * storage moves its old spellings first, as InputManager does. */
function readAll(store) {
  current = store;
  migrateStickStorage();
  const pad = loadPadChoice();
  return {
    settings: loadSettings(),
    pad,
    stickMap: loadStickMap(pad && pad.id ? deviceKey(pad.id) : 'none'),
    builds: loadBuilds(),
    pilot: readPilotName(),
    lang: readSharedKey(LANG_KEY, store),
    records: readRecords(store),
  };
}

/* The store with the save's own keys left out: what readers own. */
function readersOwn(store) {
  const own = (k) => k === save.VERSION_KEY || k.endsWith('.prev') || k.endsWith('.corrupt');
  return Object.fromEntries(Object.entries(store.dump()).filter(([k]) => !own(k)));
}

console.log('the key names are the readers\' own');
{
  const keys = Object.values(save.SECTIONS).flat().map((e) => e.key);
  for (const [name, key] of [['settings', SETTINGS_KEY], ['builds', BUILDS_KEY], ['language', LANG_KEY]]) {
    check(`${name}: ${key}`, keys.includes(key));
  }
  const src = (rel) => readFileSync(join(root, rel), 'utf8');
  for (const [rel, key] of [
    ['src/input/stickstore.js', 'fdfpv.stick_maps.v2'],
    ['src/input/stickstore.js', 'fdfpv.pad.v1'],
    ['src/share/pilot.js', 'webfpv.pilot.name'],
    ['src/ui/voiceui.js', 'fdfpv.voice'],
  ]) {
    check(`${rel} writes ${key}`, keys.includes(key) && src(rel).includes(`'${key}'`));
  }
}

console.log('the migrations are one ordered chain');
{
  const steps = save.MIGRATIONS;
  check('the first step starts before the envelope', steps[0].from === save.PRE_ENVELOPE);
  check('each step starts where the last one ended', steps.every((s, i) => i === 0 || s.from === steps[i - 1].from + 1));
  check('SAVE_VERSION is one past the last step', save.SAVE_VERSION === steps[steps.length - 1].from + 1);
  check('SAVE_VERSION is 4, one past the settings key\'s v3', save.SAVE_VERSION === 4);
}

console.log('every historic store reads the same after the save is opened');
for (const [name, entries] of Object.entries(FIXTURE)) {
  if (name.startsWith('_')) continue;
  const before = new Storage(entries);
  const want = readAll(before);
  const after = new Storage(entries);
  const report = save.openSave(after);
  check(`${name}: opened from ${save.PRE_ENVELOPE} to ${save.SAVE_VERSION}`,
    report.from === save.PRE_ENVELOPE && report.to === save.SAVE_VERSION && report.failed.length === 0, show(report));
  check(`${name}: nothing quarantined`, report.quarantined.length === 0, show(report.quarantined));
  check(`${name}: the version is stored`, after.getItem(save.VERSION_KEY) === String(save.SAVE_VERSION));
  const unmoved = show(readersOwn(after)) === show(new Storage(entries).dump());
  check(`${name}: no reader's key moved or changed`, unmoved);
  const got = readAll(after);
  for (const k of Object.keys(want)) {
    check(`${name}: ${k} reads the same`, show(got[k]) === show(want[k]), `${show(got[k]).slice(0, 120)} vs ${show(want[k]).slice(0, 120)}`);
  }
  check(`${name}: and the readers leave the same store`, show(readersOwn(after)) === show(readersOwn(before)));
  for (const { key, shape } of Object.values(save.SECTIONS).flat()) {
    if (!shape) continue;
    const text = new Storage(entries).getItem(key);
    check(`${name}: ${key}.prev backs it up`, after.getItem(`${key}.prev`) === text);
  }

  /* On a store of its own: the readers above write (the stick map's
   * old spellings move), and the next open backs that up, as it should. */
  const twice = new Storage(entries);
  save.openSave(twice);
  const once = twice.dump();
  const again = save.openSave(twice);
  check(`${name}: opening twice changes nothing`, show(twice.dump()) === show(once) && again.from === save.SAVE_VERSION);
  check(`${name}: migrating an opened envelope is a no op`,
    show(save.migrate(save.readSave(twice))) === show(save.readSave(twice)));
}

console.log('a broken blob is kept as .corrupt and its backup put back');
{
  const good = FIXTURE['v3-profile'];
  const settingsOf = (entries) => readAll(new Storage(entries)).settings;
  const want = settingsOf(good);
  const defaults = settingsOf({});
  for (const [label, broken] of [
    ['truncated JSON', good[SETTINGS_KEY].slice(0, 40)],
    ['an empty string', ''],
    ['null', 'null'],
    ['an array', '[1,2]'],
    ['a string', '"settings"'],
  ]) {
    const store = new Storage(good);
    save.openSave(store);
    store.setItem(SETTINGS_KEY, broken);
    const report = save.openSave(store);
    check(`${label}: quarantined`, report.quarantined.includes(SETTINGS_KEY) && store.getItem(`${SETTINGS_KEY}.corrupt`) === broken);
    check(`${label}: restored from .prev`, report.restored.includes(SETTINGS_KEY) && store.getItem(SETTINGS_KEY) === good[SETTINGS_KEY]);
    check(`${label}: the profile reads as it last read well`, show(readAll(store).settings) === show(want));
    check(`${label}: the backup is unchanged`, store.getItem(`${SETTINGS_KEY}.prev`) === good[SETTINGS_KEY]);
    check(`${label}: the other blobs are untouched`, store.getItem('webfpv.builds.v1') === good['webfpv.builds.v1']);
  }
  {
    const broken = '{"airframe":';
    const store = new Storage({ [SETTINGS_KEY]: broken });
    const report = save.openSave(store);
    check('no backup: quarantined, and the blob left where it is',
      report.quarantined.includes(SETTINGS_KEY) && report.restored.length === 0
      && store.getItem(SETTINGS_KEY) === broken && store.getItem(`${SETTINGS_KEY}.corrupt`) === broken);
    check('no backup: the reader falls back to the defaults, as it always has', show(readAll(store).settings) === show(defaults));
    check('no backup: and none is made of a broken blob', store.getItem(`${SETTINGS_KEY}.prev`) === null);
  }
  {
    const store = new Storage(good);
    save.openSave(store);
    store.setItem(`${SETTINGS_KEY}.prev`, '{nope');
    store.setItem(SETTINGS_KEY, '{nope too');
    const report = save.openSave(store);
    check('a broken backup is not put back', report.restored.length === 0 && store.getItem(SETTINGS_KEY) === '{nope too');
  }
  {
    const store = new Storage(good);
    save.openSave(store);
    store.removeItem('fdfpv.pad.v1');
    save.openSave(store);
    check('a key removed on purpose takes its backup with it', store.getItem('fdfpv.pad.v1.prev') === null && store.getItem('fdfpv.pad.v1') === null);
  }
}

console.log('a newer save and refusing storage are left alone');
{
  const store = new Storage({ ...FIXTURE['v3-profile'], [save.VERSION_KEY]: String(save.SAVE_VERSION + 1), [SETTINGS_KEY]: '{broken' });
  const before = show(store.dump());
  const report = save.openSave(store);
  check('a version from a newer build: nothing written', show(store.dump()) === before && report.to === save.SAVE_VERSION + 1);
  const junk = new Storage({ [save.VERSION_KEY]: 'banana' });
  check('a junk version reads as before the envelope', save.storedVersion(junk) === save.PRE_ENVELOPE);

  const full = new Storage(FIXTURE['v3-profile']);
  full.refuse = true;
  let threw = false;
  let refused;
  try {
    refused = save.openSave(full);
  } catch (e) {
    threw = true;
  }
  check('storage that refuses every write: openSave does not throw', !threw);
  check('and says what it could not do', refused && refused.failed.length > 0 && refused.to === null, show(refused));
  check('and the readers read as before', show(readAll(full)) === show(readAll(new Storage(FIXTURE['v3-profile']))));

  const blocked = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { get: () => { throw new Error('SecurityError'); }, configurable: true });
  let blockedReport;
  threw = false;
  try {
    blockedReport = save.openSave();
  } catch (e) {
    threw = true;
  }
  Object.defineProperty(globalThis, 'localStorage', blocked);
  check('storage that cannot even be reached: no throw, reported', !threw && blockedReport.failed.length === 1);
}

console.log('the envelope round trips');
{
  const opened = new Storage(FIXTURE['v3-profile']);
  save.openSave(opened);
  const envelope = save.readSave(opened);
  check('it carries saveVersion and every section',
    envelope.saveVersion === save.SAVE_VERSION
    && ['settings', 'controllers', 'aircraft', 'player', 'records'].every((s) => s in envelope), Object.keys(envelope).join());
  check('progression and the campaign ride in the settings blob',
    envelope.settings[SETTINGS_KEY].progress.xp === 740 && envelope.settings[SETTINGS_KEY].campaign.earned === 160);
  check('a best lap is in records', envelope.records['webfpv.best.a1b2c3.4.2.interceptor'] === '41234');
  const empty = new Storage();
  save.writeSave(envelope, empty);
  check('written into an empty store, it reads back as itself', show(save.readSave(empty)) === show(envelope));
  check('and every key it owns is stored as it was',
    Object.entries(empty.dump()).every(([k, v]) => opened.getItem(k) === v), show(empty.dump()).slice(0, 200));
  const back = readAll(empty);
  const there = readAll(new Storage(FIXTURE['v3-profile']));
  for (const k of ['settings', 'builds', 'pilot', 'lang', 'records']) {
    check(`and ${k} reads the same from it`, show(back[k]) === show(there[k]));
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
