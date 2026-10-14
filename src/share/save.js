/*
 * save.js: the pilot's save as one versioned envelope over the keys the
 * game already writes, an ordered list of migrations between its
 * versions, a backup of each blob that last read well, and a quarantine
 * for one that does not.
 *
 * THE ENVELOPE is a view, not a new blob: { saveVersion, settings,
 * controllers, aircraft, player, records }, each section holding the
 * stored keys it is made of (SECTIONS). The keys stay where they are on
 * disk, under the names their own modules use, until a migration moves
 * one; nothing is rewritten for its own sake. The settings blob holds
 * more than settings: progression (`progress`, src/game/progress.js), the
 * campaign (`campaign`, src/game/campaign.js), liveries, parts and tuning
 * are fields of it, and stay so.
 *
 * THE VERSION lives under its own key, VERSION_KEY. A store without one
 * is from before the envelope, version 3 (the settings key's own v3).
 * MIGRATIONS is ordered, each step a pure function from one version's
 * envelope to the next one's; openSave runs the steps from the stored
 * version and writes back only the keys whose value changed. A stored
 * version newer than this build's (a newer tab, then an old cached build)
 * is left alone entirely: an old build cannot know what a new one meant.
 *
 * WHAT IS NOT A MIGRATION HERE, on purpose. Retired aircraft and worlds
 * are repaired on every read (configs/airframes.js retiredAirframe,
 * src/maps/retired.js), because the same ids arrive from rooms, the
 * account and replays, where no local step can reach; a step here would
 * be a second copy of that rule. The settings blob's in place repairs
 * (wingDefaults, scoringReset, legacy rates) and the stick map's rename
 * and version 2 (src/input/stickstore.js) stay with their readers for the
 * same reason, and because a profile can come back from the account in
 * any of those shapes. The whoop's generations went with the whoop
 * (2026-10-03).
 *
 * BACKUP AND QUARANTINE, for the JSON blobs (SECTIONS entries with a
 * shape). At boot, before any reader runs: a blob that does not parse to
 * its shape is copied to `<key>.corrupt` and, when `<key>.prev` holds
 * one that did, replaced by it. Without a backup the blob is left as it
 * is, so its reader falls back exactly as it always has. After the
 * migrations, each blob that reads well is copied to `<key>.prev`, and a
 * key that is gone takes its backup with it (a deliberate removal, such
 * as a pad choice cleared, must not come back). INVARIANT: a `.prev` is
 * always at the stored saveVersion, so a restored blob never needs the
 * migrations again. A backup doubles its blob; the largest, the settings
 * blob, is held under the account's 512 kB (tracks-api/limits.js
 * PROGRESS_MAX_CHARS), well inside an origin's storage.
 *
 * SAVE POINTS. Writes happen on change, never on exit, and there is no
 * beforeunload save and none is needed:
 *
 *   settings blob   saveSettings (src/ui/settings.js), through
 *                   Ui.persistSettings, on every settings change, and so:
 *   progression     a lap, a challenge, Unlock all, a first sight, a
 *                   landing or a crash counted (src/ui/progress-ui.js)
 *   campaign        a commit of the campaign store (createCampaignStore,
 *                   src/game/campaign.js), a film seen, a result applied
 *   controllers     a calibration accepted, a pad chosen
 *                   (src/input/stickstore.js)
 *   aircraft        a build saved, renamed or deleted (src/ui/builds.js)
 *   records         a new best lap (src/game/race.js)
 *   player          the name set (src/share/pilot.js), the language
 *                   chosen (src/share/sharedkeys.js)
 *   this module     the version, the backups and the quarantine, once per
 *                   boot (openSave, called from src/boot.js)
 *
 * A WAR'S RESULT is a campaign save point whoever's page sees it first:
 * the room sends it to every seat that flew the war, with the war's uid
 * (edge/rooms/war.js flew, warUid), and the page pays it once per uid,
 * kept in the campaign's `wars` (src/game/campaign.js payResult), so a
 * reload, a reconnect or a late join into the result card is paid and
 * paid once (COMPLETENESS.md item 2). AN OPS MATCH'S RESULT (The
 * Interior's) is the same: sent to every seat whose pilot took part
 * (edge/rooms/ops.js took, the view's uid), paid once per uid in the
 * same list (src/ui/opscampaign.js record).
 *
 * Boot imports this before anything heavy, so it imports only modules
 * that import nothing. The key names are written out as boot.js writes
 * the settings key; scripts/save-selftest.js holds them to their modules.
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

import { LANG_KEY } from './sharedkeys.js';
import { RECORD_PREFIX } from './records.js';

export const VERSION_KEY = 'fdfpv.save.version';
/* Before the envelope: the settings key's v3. */
export const PRE_ENVELOPE = 3;

const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/*
 * Section to its keys. `shape` marks a JSON blob and says what a good one
 * is; such a key is backed up and quarantined. A key without one is plain
 * text and is carried as it is stored.
 */
export const SECTIONS = {
  settings: [
    { key: 'webfpv.settings.v3', shape: isObject },
    { key: 'fdfpv.voice', shape: isObject },
  ],
  controllers: [
    { key: 'fdfpv.stick_maps.v2', shape: isObject },
    { key: 'fdfpv.pad.v1', shape: isObject },
  ],
  aircraft: [
    { key: 'webfpv.builds.v1', shape: isObject },
  ],
  player: [
    { key: 'webfpv.pilot.name' },
    { key: LANG_KEY },
  ],
};
/* Best laps are keyed per course (src/share/records.js), so the records
 * section is every key under the prefix, as text. */
const RECORDS = 'records';

const BLOBS = Object.values(SECTIONS).flat().filter((k) => k.shape);

/*
 * The ordered migrations. Step i takes saveVersion `from` to `from + 1`
 * and returns a new envelope; it never touches storage. Add a step at the
 * end, with a comment saying what it moves and why, and never change one
 * that shipped.
 */
export const MIGRATIONS = [
  /* 3 to 4: the envelope adopts the keys as they are; nothing on disk
   * moves. */
  { from: 3, run: (save) => save },
];
export const SAVE_VERSION = MIGRATIONS[MIGRATIONS.length - 1].from + 1;

/* The parsed blob, or undefined when absent, or CORRUPT. */
const CORRUPT = Symbol('corrupt');
function readBlob(storage, { key, shape }) {
  const text = storage.getItem(key);
  if (text === null) return undefined;
  try {
    const value = JSON.parse(text);
    return shape(value) ? value : CORRUPT;
  } catch (e) {
    return CORRUPT;
  }
}

/* The stored version: an integer, or PRE_ENVELOPE for none or junk. */
export function storedVersion(storage) {
  const n = Number(storage.getItem(VERSION_KEY));
  return Number.isInteger(n) && n > PRE_ENVELOPE ? n : PRE_ENVELOPE;
}

/*
 * The envelope as `storage` holds it. A blob that is absent or does not
 * read well is left out of its section, so nothing written back from the
 * envelope can overwrite it.
 */
export function readSave(storage = globalThis.localStorage) {
  const save = { saveVersion: storedVersion(storage) };
  for (const [section, keys] of Object.entries(SECTIONS)) {
    save[section] = {};
    for (const entry of keys) {
      const value = entry.shape ? readBlob(storage, entry) : storage.getItem(entry.key);
      if (value !== undefined && value !== null && value !== CORRUPT) save[section][entry.key] = value;
    }
  }
  save[RECORDS] = {};
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key && key.startsWith(RECORD_PREFIX)) save[RECORDS][key] = storage.getItem(key);
  }
  return save;
}

/* The stored text of one envelope value. */
function textOf(entry, value) {
  return entry && entry.shape ? JSON.stringify(value) : String(value);
}

/*
 * Writes `save` into `storage`: each key whose stored text differs, and
 * the version. Keys the envelope leaves out are not touched. Throws as
 * localStorage does.
 */
export function writeSave(save, storage = globalThis.localStorage) {
  const entries = new Map(Object.values(SECTIONS).flat().map((e) => [e.key, e]));
  for (const section of [...Object.keys(SECTIONS), RECORDS]) {
    for (const [key, value] of Object.entries(save[section] ?? {})) {
      const text = textOf(entries.get(key), value);
      if (storage.getItem(key) !== text) storage.setItem(key, text);
    }
  }
  const version = String(save.saveVersion);
  if (storage.getItem(VERSION_KEY) !== version) storage.setItem(VERSION_KEY, version);
}

/* `save` run through every step from its version to SAVE_VERSION. */
export function migrate(save) {
  let out = save;
  for (const step of MIGRATIONS) {
    if (out.saveVersion !== step.from) continue;
    out = { ...step.run(out), saveVersion: step.from + 1 };
  }
  return out;
}

/* A blob that does not read well goes to .corrupt; its .prev, if good,
 * takes its place. Returns whether it was restored. */
function quarantine(storage, entry, report) {
  const { key } = entry;
  storage.setItem(`${key}.corrupt`, storage.getItem(key));
  report.quarantined.push(key);
  const prev = readBlob(storage, { key: `${key}.prev`, shape: entry.shape });
  if (prev === undefined || prev === CORRUPT) return;
  storage.setItem(key, storage.getItem(`${key}.prev`));
  report.restored.push(key);
}

/* The blob, as it now reads, becomes the backup; a gone blob takes its
 * backup with it. A blob that still does not read well keeps the old one. */
function backUp(storage, entry) {
  const value = readBlob(storage, entry);
  const prevKey = `${entry.key}.prev`;
  if (value === undefined) {
    storage.removeItem(prevKey);
    return;
  }
  if (value === CORRUPT) return;
  const text = storage.getItem(entry.key);
  if (storage.getItem(prevKey) !== text) storage.setItem(prevKey, text);
}

/*
 * Once per boot, before any reader: quarantine, migrate, back up. Never
 * throws: storage that refuses (private mode, a full quota) leaves the
 * readers to fall back as they always have, and the refusal is in the
 * report. Returns { from, to, quarantined, restored, failed }.
 */
export function openSave(storage = null) {
  const report = { from: null, to: null, quarantined: [], restored: [], failed: [] };
  const step = (what, fn) => {
    try {
      fn();
    } catch (e) {
      report.failed.push(`${what}: ${e && e.message ? e.message : e}`);
    }
  };
  try {
    /* Reading localStorage itself throws where storage is blocked. */
    storage = storage ?? globalThis.localStorage;
    report.from = storedVersion(storage);
  } catch (e) {
    report.failed.push(`read: ${e && e.message ? e.message : e}`);
    return report;
  }
  if (report.from > SAVE_VERSION) {
    report.to = report.from;
    return report;
  }
  for (const entry of BLOBS) {
    step(`quarantine ${entry.key}`, () => {
      if (readBlob(storage, entry) === CORRUPT) quarantine(storage, entry, report);
    });
  }
  step('migrate', () => {
    const migrated = migrate(readSave(storage));
    writeSave(migrated, storage);
    report.to = migrated.saveVersion;
  });
  if (report.to === null) return report;
  for (const entry of BLOBS) {
    step(`back up ${entry.key}`, () => backUp(storage, entry));
  }
  return report;
}

/*
 * RESET, in two halves, each leaving the other alone (COMPLETENESS 3).
 * Both write storage and leave the page to reload, as the language row
 * does: modules hold the live settings object, so it is never swapped.
 *
 * Progress is the four progression fields of the settings blob and the
 * best laps. Settings are the rest of the blob, except what the pilot made
 * or bought, which neither reset touches.
 *
 * Reset progress is for a browser that is not signed in: the account
 * merges progress, the campaign, flight time, counts and best laps grow
 * only (src/share/progressmerge.js), so a signed in reset would come back
 * on the next sync. Settings sections are stamped by what changed since
 * the last sync, so a settings reset is sent as the newer value.
 */
const SETTINGS_KEY = SECTIONS.settings[0].key;
export const PROGRESS_FIELDS = ['progress', 'campaign', 'flightTime', 'pilotCounts'];
/* Kept by a settings reset: the paint, saved liveries and swatches, the
 * parts, packs, power and loadouts fitted, which build each plane wears,
 * the floats, the seat and the first run question already answered, and
 * the favourite aircraft (the hangar's list, an owned choice). */
export const OWNED_FIELDS = [
  'livery', 'liverySaves', 'swatches', 'parts', 'packs', 'power', 'combat', 'buildFits',
  'floats', 'airframe', 'airframeAsked', 'favourites',
];
const BEST_LAP_KEY = 'webfpv.bestLapMs';

function storedBlob(storage) {
  try {
    const value = JSON.parse(storage.getItem(SETTINGS_KEY) || '{}');
    return isObject(value) ? value : {};
  } catch (e) {
    return {};
  }
}

const pick = (blob, fields) => Object.fromEntries(fields.filter((k) => Object.hasOwn(blob, k)).map((k) => [k, blob[k]]));

/* Every setting back to its default; progress and what the pilot owns
 * kept. Throws as localStorage does. */
export function resetSettings(storage = globalThis.localStorage) {
  storage.setItem(SETTINGS_KEY, JSON.stringify(pick(storedBlob(storage), [...PROGRESS_FIELDS, ...OWNED_FIELDS])));
}

/*
 * Progress back to a new pilot's, settings kept. `fresh` is the stored
 * value each progression field restarts from where an absent one would
 * not read as new: the progress module's own fresh progress, because a
 * profile with settings and no progress reads as a pilot from before
 * progression, and they had everything unlocked. Throws as localStorage
 * does.
 */
export function resetProgress(fresh, storage = globalThis.localStorage) {
  const blob = storedBlob(storage);
  for (const k of PROGRESS_FIELDS) delete blob[k];
  storage.setItem(SETTINGS_KEY, JSON.stringify({ ...blob, ...pick(fresh, PROGRESS_FIELDS) }));
  const laps = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key && (key.startsWith(RECORD_PREFIX) || key === BEST_LAP_KEY)) laps.push(key);
  }
  for (const key of laps) storage.removeItem(key);
}

