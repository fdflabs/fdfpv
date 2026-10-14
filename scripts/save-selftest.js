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
 * .corrupt and its .prev put back; a newer version is not touched; the
 * envelope written into an empty store reads back as itself; and each save
 * point in save.js's table writes its key, and only when it should.
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
    this.writes = 0;
  }

  get length() { return this.map.size; }

  key(i) { return [...this.map.keys()][i] ?? null; }

  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }

  setItem(k, v) {
    if (this.refuse) throw new Error('QuotaExceededError');
    this.writes += 1;
    this.map.set(String(k), String(v));
  }

  removeItem(k) {
    this.writes += 1;
    this.map.delete(k);
  }

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

console.log('reset settings and reset progress each keep the other half');
{
  const { freshProgress } = await import('../src/game/progress.js');
  const good = FIXTURE['v3-profile'];
  const blob = JSON.parse(good[SETTINGS_KEY]);
  const was = readAll(new Storage(good));
  const defaults = readAll(new Storage({})).settings;

  const s1 = new Storage(good);
  save.resetSettings(s1);
  const a = readAll(s1);
  check('settings reset: the progress reads as before', show(a.settings.progress) === show(was.settings.progress));
  check('and the campaign', show(a.settings.campaign) === show(was.settings.campaign) && a.settings.campaign.earned === 160);
  check('and the paint', show(a.settings.livery) === show(was.settings.livery));
  check('and the best laps', show(a.records) === show(was.records) && s1.getItem('webfpv.bestLapMs') === '52000');
  check('and the stick calibration and builds', s1.getItem('fdfpv.stick_maps.v2') === good['fdfpv.stick_maps.v2']
    && show(a.builds) === show(was.builds));
  check('the settings go back to their defaults', a.settings.musicLevel === defaults.musicLevel && a.settings.map === defaults.map
    && was.settings.musicLevel !== defaults.musicLevel && was.settings.map !== defaults.map,
  show([a.settings.musicLevel, a.settings.map, was.settings.musicLevel, was.settings.map, defaults.musicLevel, defaults.map]));
  check('the seat stays, and the first run question is not asked again', a.settings.airframe === was.settings.airframe && a.settings.airframeAsked === true);
  check('every kept field is a progress or an owned one', Object.keys(JSON.parse(s1.getItem(SETTINGS_KEY)))
    .every((k) => save.PROGRESS_FIELDS.includes(k) || save.OWNED_FIELDS.includes(k)));

  const s2 = new Storage(good);
  save.resetProgress({ progress: freshProgress(false) }, s2);
  const b = readAll(s2);
  const fresh = readAll(new Storage({})).settings;
  check('progress reset: XP, challenges and seen are a new pilot\'s', show(b.settings.progress) === show(fresh.progress), show(b.settings.progress));
  check('and nothing is unlocked as for a pilot from before progression', b.settings.progress.unlockAll === false);
  check('the campaign, flight time and counts are empty', show(b.settings.campaign) === show(fresh.campaign)
    && show(b.settings.flightTime) === '{}' && show(b.settings.pilotCounts) === '{}');
  check('the best laps are gone', show(b.records) === '{}' && s2.getItem('webfpv.bestLapMs') === null);
  const keep = (x) => { const { progress, campaign, flightTime, pilotCounts, ...rest } = x; return rest; };
  check('the settings read exactly as before', show(keep(b.settings)) === show(keep(was.settings)));
  check('the name, language and builds are untouched', b.pilot === was.pilot && b.lang === was.lang && show(b.builds) === show(was.builds));
  check('a profile with nothing stored resets to defaults', (() => {
    const e = new Storage({});
    save.resetSettings(e);
    save.resetProgress({ progress: freshProgress(false) }, e);
    return readAll(e).settings.progress.unlockAll === false;
  })());
  check('the fixture really had progress to lose', blob.progress.xp === 740);
}

console.log('each save point writes its key, and nothing else writes');
{
  /*
   * The table of SAVE POINTS in src/share/save.js's header, row by row:
   * each trigger is called as the game calls it, against a store of its
   * own, and must write the row's key; the readers and a change that is
   * not one must write nothing. Where a trigger lives in the shell
   * (src/main.js, too big to run here) the call chain is held by its
   * source, and the writer it ends in is run.
   */
  const { Ui } = await import('../src/ui/ui.js');
  const { Progress } = await import('../src/ui/progress-ui.js');
  const { EventLog } = await import('../src/game/events.js');
  const { freshProgress } = await import('../src/game/progress.js');
  const { createCampaignStore, emptyCampaign, cleanCampaign } = await import('../src/game/campaign.js');
  const { Race } = await import('../src/game/race.js');
  const { saveSettings } = await import('../src/ui/settings.js');
  const { saveBuilds } = await import('../src/ui/builds.js');
  const { saveStickMap, forgetStickMap, savePadChoice } = await import('../src/input/stickstore.js');
  const { writePilotName } = await import('../src/share/pilot.js');
  const { writeSharedKey } = await import('../src/share/sharedkeys.js');
  const { keepRecords } = await import('../src/share/records.js');
  const src = (rel) => readFileSync(join(root, rel), 'utf8');
  const good = FIXTURE['v3-profile'];
  /* The keys written between two dumps, as a sorted list. */
  const changed = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]).sort();
  /* Runs `fn` on a fresh opened copy of the profile; returns the keys it
   * wrote (changed or removed) and how many writes it made. */
  async function written(fn, entries = good) {
    const store = new Storage(entries);
    save.openSave(store);
    current = store;
    const before = store.dump();
    store.writes = 0;
    await fn(store);
    /* The best lap is written when the page is idle (race.js saveRecord),
     * a timer in Node. */
    await new Promise((r) => { setTimeout(r, 5); });
    return { keys: changed(before, store.dump()), writes: store.writes, store };
  }
  const covered = new Set();
  function point(name, got, keys) {
    keys.forEach((k) => covered.add(k));
    check(`${name}: writes ${keys.join(', ')}`, show(got.keys) === show([...keys].sort()), show(got.keys));
  }
  function none(name, got) {
    check(`${name}: writes nothing`, got.writes === 0, `${got.writes} writes: ${show(got.keys)}`);
  }

  /* settings blob: every settings change, through the Ui. */
  const ui = () => ({ settings: loadSettings() });
  point('a settings change (Ui.persistSettings)', await written(() => {
    const u = ui();
    u.settings.musicLevel = u.settings.musicLevel === 0 ? 1 : 0;
    Ui.prototype.persistSettings.call(u);
  }), [SETTINGS_KEY]);
  check('and the row (Ui.writeSettings) saves through saveSettings',
    /writeSettings\(\) \{\s*saveSettings\(this\.settings\)/.test(src('src/ui/menucontrols.js')));
  none('reading the settings', await written(() => { loadSettings(); }));

  /* progression: Progress.save is Ui.persistSettings. A Progress without
   * its toasts, the pilot's own progress under it. */
  const progress = () => {
    const u = ui();
    u.settings.progress = u.settings.progress ?? freshProgress(false);
    u.persistSettings = Ui.prototype.persistSettings;
    const p = Object.create(Progress.prototype);
    Object.assign(p, { ui: u, show: () => {}, toast: () => {}, flight: new EventLog(), folded: 0, bests: [] });
    return p;
  };
  const progressOf = (store) => JSON.parse(store.getItem(SETTINGS_KEY)).progress;
  {
    const got = await written((store) => {
      const p = progress();
      p.setUnlockAll(!p.state.unlockAll);
      check('Unlock all is what was stored', progressOf(store).unlockAll === p.state.unlockAll);
    });
    point('Unlock all', got, [SETTINGS_KEY]);
  }
  {
    const fresh = Object.keys(JSON.parse(good[SETTINGS_KEY]).progress.challenges ?? {});
    const id = ['first_course', 'hoops_10', 'deadstick'].find((c) => !fresh.includes(c));
    point(`a challenge done (${id})`, await written((store) => {
      progress().award([id]);
      check('and the challenge is stored', progressOf(store).challenges[id] === true);
    }), [SETTINGS_KEY]);
    const again = await written(() => {
      const p = progress();
      p.award([id]);
      p.award([id]);
    });
    check('the same challenge twice writes once', again.writes === 1, `${again.writes}`);
  }
  point('a landing counted', await written((store) => {
    const p = progress();
    p.flight.append('landing', 1000, { airframe: 'timber1500' });
    p.foldFlight();
    check('and the landing is stored', Object.values(progressOf(store).landings ?? {}).some((n) => n > 0));
  }), [SETTINGS_KEY]);
  none('a flight with nothing to count', await written(() => {
    const p = progress();
    p.foldFlight();
  }));
  none('asking for firsts with none due', await written(() => {
    const p = progress();
    p.checkFirsts();
    p.checkFirsts();
  }, (() => {
    /* The first ask pays what the profile already holds; a second store
     * opened after it has nothing due. */
    const s = new Storage(good);
    current = s;
    progress().checkFirsts();
    return s.dump();
  })()));

  /* campaign: a commit of the campaign store. */
  point('a campaign commit', await written((store) => {
    const u = ui();
    const camp = createCampaignStore(u.settings, () => saveSettings(u.settings));
    const state = camp.load();
    state.seen = { ...state.seen, w43: 1 };
    camp.save(state);
    check('and what is stored is the clean campaign', show(JSON.parse(store.getItem(SETTINGS_KEY)).campaign) === show(cleanCampaign(state)));
  }), [SETTINGS_KEY]);
  none('loading the campaign', await written(() => {
    const u = ui();
    createCampaignStore(u.settings, () => saveSettings(u.settings)).load();
  }));
  check('an empty campaign reads clean', show(cleanCampaign(emptyCampaign())) === show(emptyCampaign()));

  /* flight time: committed by the shell while flying, at a respawn, and
   * when the page is hidden or left, into the settings blob. */
  {
    const main = src('src/main.js');
    const commit = /function commitFlightTime\(\) \{[\s\S]*?\n  \}/.exec(main)?.[0] ?? '';
    check('flight time is committed into the settings (commitFlightTime)', commit.includes('ui.settings.flightTime = record') && commit.includes('ui.persistSettings()'));
    const leaving = /const pageLeaving = \(\) => \{[\s\S]*?\};/.exec(main)?.[0] ?? '';
    check('and when the page is hidden or left (pageLeaving)', leaving.includes('commitFlightTime()')
      && main.includes("window.addEventListener('pagehide', pageLeaving)") && /if \(document\.hidden\) \{\s*pageLeaving\(\);/.test(main));
  }

  /* controllers. */
  point('a calibration accepted', await written(() => { saveStickMap('w43-pad', { axes: [0, 1, 2, 3] }); }), ['fdfpv.stick_maps.v2']);
  point('a calibration forgotten', await written(() => {
    forgetStickMap(Object.keys(JSON.parse(good['fdfpv.stick_maps.v2']).maps ?? {})[0]);
  }), ['fdfpv.stick_maps.v2']);
  point('a pad chosen', await written(() => { savePadChoice({ kind: 'pad', id: 'w43 pad', index: 1 }); }), ['fdfpv.pad.v1']);
  {
    const got = await written(() => { savePadChoice({ kind: 'auto' }); });
    check('back to automatic: the pad key is removed', got.keys.includes('fdfpv.pad.v1') && got.store.getItem('fdfpv.pad.v1') === null, show(got.keys));
  }
  none('reading the pad and its calibration', await written(() => {
    const pad = loadPadChoice();
    loadStickMap(pad && pad.id ? deviceKey(pad.id) : 'none');
  }));

  /* aircraft: a build saved, renamed or deleted, through the Ui. */
  const shell = () => Object.assign(Object.create(Ui.prototype), { settings: loadSettings(), buildList: loadBuilds() });
  {
    point('a build saved', await written(() => {
      const id = shell().addBuild('W43', 'timber1500', {}).id;
      check('and it reads back', loadBuilds().some((b) => b.id === id && b.name === 'W43'));
    }), [BUILDS_KEY]);
    /* The profile's own build, b1. */
    point('a build renamed', await written(() => {
      shell().renameBuild('b1', 'Race night');
      check('and the new name reads back', loadBuilds().find((b) => b.id === 'b1')?.name === 'Race night');
    }), [BUILDS_KEY]);
    none('a rename the name rules refuse', await written(() => { shell().renameBuild('b1', ''); }));
    point('a build deleted', await written(() => {
      shell().removeBuild('b1');
      check('and it is gone', !loadBuilds().some((b) => b.id === 'b1'));
    }), [BUILDS_KEY]);
  }
  none('reading the builds', await written(() => { loadBuilds(); }));

  /* voice: a voice chat choice. */
  {
    const voice = src('src/ui/voiceui.js');
    check('a voice choice writes fdfpv.voice (voiceui.js writePrefs)', /function writePrefs\(p\) \{[\s\S]*?localStorage\.setItem\(PREFS_KEY/.test(voice) && voice.includes("PREFS_KEY = 'fdfpv.voice'"));
    covered.add('fdfpv.voice');
  }

  /* records: a new best lap, and only a new best. */
  const race = (bestMs) => {
    const r = Object.create(Race.prototype);
    Object.assign(r, { key: 'webfpv.best.w43', bestMs, lapPoints: 0, splits: [], log: [], laps: [], lap: 0 });
    return r;
  };
  point('a new best lap', await written(() => { race(50000).closeLap(41000, false, 0); }), ['webfpv.best.w43']);
  point('a first lap on a course', await written(() => { race(null).closeLap(52000, false, 0); }), ['webfpv.best.w43']);
  none('a slower lap', await written(() => { race(41000).closeLap(45000, false, 0); }));
  none('an equal lap', await written(() => { race(41000).closeLap(41000, false, 0); }));
  none('a record from the account no better than this one', await written(() => {
    keepRecords({ 'webfpv.best.a1b2c3.4.2.interceptor': '45000' });
  }));
  point('a better record from the account', await written(() => {
    keepRecords({ 'webfpv.best.a1b2c3.4.2.interceptor': '40000' });
  }), ['webfpv.best.a1b2c3.4.2.interceptor']);

  /* player. */
  point('the name set', await written(() => { writePilotName('W43 Pilot'); }), ['webfpv.pilot.name']);
  none('a name the board would refuse', await written(() => { writePilotName('x'); }));
  point('the language chosen', await written((store) => { writeSharedKey(LANG_KEY, store.getItem(LANG_KEY) === 'en' ? 'es' : 'en'); }), [LANG_KEY, 'webfpv.lang']);

  /* this module: once per boot, and a second boot writes nothing. */
  none('opening the save a second time', await written(() => { save.openSave(); }));

  for (const { key } of Object.values(save.SECTIONS).flat()) {
    check(`${key} has a save point here`, covered.has(key));
  }
  check('nothing saves on beforeunload', !src('src/main.js').includes('beforeunload'));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
