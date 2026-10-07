/*
 * ratepresets.js: the pilot's named rate profiles, stored here and nowhere
 * else.
 *
 * Rates are the setting a pilot changes per track, so a preset is a whole
 * rate profile under a name, throttle cap included: the cap sits outside
 * Betaflight's rate profile, but it is the pilot's choice and moves with
 * the track the same way.
 *
 * Presets exist only in this browser's storage, under one versioned key,
 * fdfpv.rates.library.v1, holding every preset by id (the same shape as
 * the track library in src/trackbuilder/storage.js). Reads and writes go
 * through src/share/session.js, which turns a private window or a full
 * quota into a fallback value or `false`; a refused save is reported back
 * so the shell can tell the pilot. Every entry read back goes through
 * normaliseRates, so a corrupt or old entry cannot fly a profile the menu
 * cannot show.
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

import { normaliseRates, ratesDiff, ratesSummary } from './rates.js';
import { readJson, writeJson } from '../src/share/session.js';

const STORAGE_KEY = 'fdfpv.rates.library.v1';

/*
 * The library was stored under webfpv.rates.library.v1 before the project
 * took its own name. moveRenamedPresetLibrary copies it to the new key
 * unless that already holds a library (then the old one is the stale
 * copy), and deletes the old key only after that, so a refused write
 * leaves it to try again next load. Running it again changes nothing.
 * src/share/move.js carries fdfpv.* keys between origins as it did
 * webfpv.* ones.
 */
const OLD_STORAGE_KEY = 'webfpv.rates.library.v1';

export function moveRenamedPresetLibrary(storage) {
  const value = storage.getItem(OLD_STORAGE_KEY);
  if (value === null) return;
  if (storage.getItem(STORAGE_KEY) === null) storage.setItem(STORAGE_KEY, value);
  storage.removeItem(OLD_STORAGE_KEY);
}

// On load, before any preset is read. A browser that refuses storage has
// no library to move, and every read here already treats it as empty.
if (typeof localStorage !== 'undefined') {
  try {
    moveRenamedPresetLibrary(localStorage);
  } catch {
    /* storage unavailable: nothing to move */
  }
}

// Shown on the Rates screen, the Preset row and the save dialog. One
// sentence in one place, so three screens state one fact one way.
export const RATES_STORAGE_WARNING = 'Presets are saved in this browser on this device only. '
  + 'Clearing site data, a private window, another browser or another device all start you from '
  + 'nothing, and there is no account and nothing is uploaded.';

// Longer than the row can show; the row truncates instead of the field
// rejecting a name someone meant.
export const PRESET_NAME_MAX = 32;

const isPlainRecord = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

function library() {
  const stored = readJson(STORAGE_KEY, {});
  return isPlainRecord(stored) ? stored : {};
}

/*
 * Ids are random rather than derived from the name or the numbers: a
 * rename keeps its preset, and two tracks may want identical rates under
 * different names.
 */
function freshId() {
  const bits = Math.floor(Math.random() * 0xffffffff);
  return `rp-${bits.toString(16).padStart(8, '0')}`;
}

// A stored entry as the shell may trust it, or null when it has no name.
// An entry without an id gets one for this read.
function fromStorage(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const name = typeof entry.name === 'string' ? entry.name.trim() : '';
  if (name === '') return null;
  return {
    id: typeof entry.id === 'string' && entry.id !== '' ? entry.id : freshId(),
    name: name.slice(0, PRESET_NAME_MAX),
    savedUtc: typeof entry.savedUtc === 'string' ? entry.savedUtc : '',
    rates: normaliseRates(entry.rates),
  };
}

const described = (preset) => ({ ...preset, summary: ratesSummary(preset.rates) });

/*
 * Every preset, most recently saved first, each with its full profile
 * (the Preset row compares the live rates against all of them) and its
 * one line summary.
 */
export function listRatePresets() {
  const presets = Object.values(library()).map(fromStorage).filter((p) => p !== null).map(described);
  return presets.sort((a, b) => String(b.savedUtc).localeCompare(String(a.savedUtc)));
}

export function ratePresetById(id) {
  if (!id) return null;
  const preset = fromStorage(library()[id]);
  return preset ? described(preset) : null;
}

/*
 * The preset that flies exactly the given profile, or null. Profiles are
 * compared as the CLI text they emit, the same test src/main.js uses to
 * see whether a rate change reached the module, so every field counts and
 * stored key order does not.
 */
export function presetMatching(rates) {
  const flying = ratesDiff(rates);
  return listRatePresets().find((preset) => ratesDiff(preset.rates) === flying) ?? null;
}

const nameKey = (name) => String(name || '').trim().toLowerCase();

export function presetNamed(name) {
  const wanted = nameKey(name);
  if (wanted === '') return null;
  return listRatePresets().find((preset) => preset.name.toLowerCase() === wanted) ?? null;
}

/*
 * Save under a name, replacing the preset that already has it (names are
 * compared without case): saving "Bando" twice means the second one. The
 * save dialog has already shown the pilot a Replace button. Answers
 * { ok: true, id, preset }, or { ok: false, reason } with reason 'no-name'
 * or 'storage'; telling the pilot is the caller's job.
 */
export function saveRatePreset(name, rates) {
  const label = String(name || '').trim().slice(0, PRESET_NAME_MAX);
  if (label === '') return { ok: false, reason: 'no-name' };
  const stored = library();
  const id = presetNamed(label)?.id ?? freshId();
  const preset = { id, name: label, savedUtc: new Date().toISOString(), rates: normaliseRates(rates) };
  stored[id] = preset;
  if (!writeJson(STORAGE_KEY, stored)) return { ok: false, reason: 'storage' };
  return { ok: true, id, preset: described(preset) };
}

export function deleteRatePreset(id) {
  const stored = library();
  if (!stored[id]) return { ok: false, reason: 'missing' };
  delete stored[id];
  return writeJson(STORAGE_KEY, stored) ? { ok: true } : { ok: false, reason: 'storage' };
}
