/*
 * stickstore.js: what the input remembers between visits, the pilot's
 * stick map and which joystick they chose.
 *
 * Every storage call is guarded. Private windows and full quotas throw,
 * and a pilot who cannot save a mapping must still be able to fly on it
 * for the session; the callers report a failed save, they never crash on
 * one.
 *
 * The keys were renamed from the upstream project's names to this
 * project's. migrateStickStorage moves a value from the old key to the new
 * one once, so nobody loses a calibration or a joystick choice: an old
 * value is copied only when the new key is empty (a new value always
 * wins), and the old key is removed only after the new one is safely
 * written. Running it again changes nothing. Until a move succeeds
 * (storage may refuse the write), loads read the old key, and the first
 * successful save under the new name retires it.
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

import { AETR_MAP, normaliseMap } from './padmap.js';

const STICK_MAP_KEY = 'fdfpv.stick_map.v1';
const PAD_CHOICE_KEY = 'fdfpv.pad.v1';

/* [current key, the key older builds wrote]. */
const RENAMED = [
  [STICK_MAP_KEY, 'webfpv_stick_map_v1'],
  [PAD_CHOICE_KEY, 'webfpv.pad.v1'],
];

const oldSpelling = (key) => RENAMED.find(([now]) => now === key)[1];

/* The value under a key, or under its old spelling if the move has not
 * happened yet, which is only ever because storage refused the write. */
function readRenamed(key) {
  const value = localStorage.getItem(key);
  return value !== null ? value : localStorage.getItem(oldSpelling(key));
}

export function migrateStickStorage() {
  for (const [now, before] of RENAMED) {
    try {
      const old = localStorage.getItem(before);
      if (old === null) {
        continue;
      }
      if (localStorage.getItem(now) === null) {
        localStorage.setItem(now, old);
      }
      localStorage.removeItem(before);
    } catch (e) {
      /* Storage refused. The old key stays where it is, intact, and is
       * still there to move on a visit where storage works. */
    }
  }
}

/*
 * The saved map over AETR, so a map saved before a field existed loads
 * with that field filled in. Anything at all under the key counts as a
 * saved map, even JSON null; anything unreadable is no map.
 */
export function loadStickMap() {
  let saved = null;
  try {
    saved = readRenamed(STICK_MAP_KEY);
    if (saved) {
      return normaliseMap({ ...AETR_MAP, ...JSON.parse(saved), stored: true });
    }
  } catch (e) {
    /* Unreadable or refused: the pilot flies the guess. */
  }
  return normaliseMap({ ...AETR_MAP, stored: false });
}

/* True when the map reached storage. */
export function saveStickMap(map) {
  try {
    localStorage.setItem(STICK_MAP_KEY, JSON.stringify(map));
    /* A write under the new name supersedes anything still under the old. */
    localStorage.removeItem(oldSpelling(STICK_MAP_KEY));
    return true;
  } catch (e) {
    return false;
  }
}

/*
 * The joystick choice: { kind: 'pad', id, index } for a device the pilot
 * picked, { kind: 'none' } for the keyboard on purpose, { kind: 'auto' }
 * for no choice yet, which is also what anything malformed reads as.
 */
export function loadPadChoice() {
  let saved = null;
  try {
    saved = JSON.parse(readRenamed(PAD_CHOICE_KEY) || 'null');
  } catch (e) {
    saved = null;
  }
  if (saved && saved.kind === 'none') {
    return { kind: 'none' };
  }
  const isPad = saved && saved.kind === 'pad' && typeof saved.id === 'string' && Number.isInteger(saved.index);
  return isPad ? { kind: 'pad', id: saved.id, index: saved.index } : { kind: 'auto' };
}

/* 'auto' is stored as no key at all. */
export function savePadChoice(choice) {
  try {
    if (!choice || choice.kind === 'auto') {
      localStorage.removeItem(PAD_CHOICE_KEY);
    } else if (choice.kind === 'none') {
      localStorage.setItem(PAD_CHOICE_KEY, JSON.stringify({ kind: 'none' }));
    } else {
      localStorage.setItem(PAD_CHOICE_KEY, JSON.stringify({ kind: 'pad', id: choice.id, index: choice.index }));
    }
    localStorage.removeItem(oldSpelling(PAD_CHOICE_KEY));
  } catch (e) {
    /* Not remembered past this visit; the choice still holds for it. */
  }
}
