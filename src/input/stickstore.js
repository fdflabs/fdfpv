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
 * Stick maps are kept per device (version 2): { v: 2, maps: { [deviceKey]:
 * map }, orphan }. Version 1 held one map for every device. It is filed
 * under the device the pilot had chosen, which is the one it was made on
 * as far as anything recorded says; with no choice recorded it becomes the
 * orphan, which the first device to connect adopts, once. The same rules
 * as the rename hold: version 1 is removed only after version 2 is
 * written, until then loads fold it in, and a device's own version 2 map
 * wins over it.
 *
 * Each device's feel (padmap.js normaliseFeel: dead zone, expo) sits beside
 * its map under `feel`, written only once one is set, so a store nobody
 * set a feel in is byte for byte what it was. It is apart from the map on
 * purpose: setting a dead zone on a gamepad flying its built-in layout
 * must not save that layout as a calibration, which would stop it
 * following the stick mode (input.js followDefaultMap).
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

import { AETR_MAP, NO_FEEL, normaliseFeel, normaliseMap } from './padmap.js';
import { deviceKey } from './padprofiles.js';

const STICK_MAP_KEY = 'fdfpv.stick_map.v1';
const PAD_CHOICE_KEY = 'fdfpv.pad.v1';
const STICK_MAPS_KEY = 'fdfpv.stick_maps.v2';

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
  try {
    if (oldMap(readRenamed(STICK_MAP_KEY)) !== null) {
      writeMaps(readMaps());
    }
  } catch (e) {
    /* Refused: version 1 stays, and loads keep folding it in. */
  }
}

const isRecord = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/* A saved map over AETR, so a map saved before a field existed loads with
 * that field filled in. */
function savedMap(value) {
  return { ...AETR_MAP, ...value, stored: true };
}

/*
 * The version 1 map as it was written, or null for none. Anything JSON at
 * all counts as a saved map, even null, as it always has: a value that is
 * not an object is an empty map, which loads as AETR saved. Text that is
 * not JSON is no map, and is left where it is rather than moved.
 */
function oldMap(text) {
  if (!text) {
    return null;
  }
  try {
    const value = JSON.parse(text);
    return isRecord(value) ? value : {};
  } catch (e) {
    return null;
  }
}

/* Version 2 as stored; anything malformed is an empty store, because a
 * value nothing can read holds no map a pilot ever flew. */
function storedMaps() {
  let parsed = null;
  try {
    parsed = JSON.parse(localStorage.getItem(STICK_MAPS_KEY) || 'null');
  } catch (e) {
    parsed = null;
  }
  const ok = isRecord(parsed) && parsed.v === 2 && isRecord(parsed.maps);
  const maps = {};
  for (const [key, map] of Object.entries(ok ? parsed.maps : {})) {
    if (isRecord(map)) {
      maps[key] = map;
    }
  }
  const store = { v: 2, maps, orphan: ok && isRecord(parsed.orphan) ? parsed.orphan : null };
  const feel = {};
  for (const [key, f] of Object.entries(ok && isRecord(parsed.feel) ? parsed.feel : {})) {
    if (isRecord(f)) {
      feel[key] = normaliseFeel(f);
    }
  }
  if (Object.keys(feel).length) {
    store.feel = feel;
  }
  return store;
}

/* Version 2 with any version 1 map still in storage folded in. */
function readMaps() {
  const store = storedMaps();
  let old = null;
  try {
    old = oldMap(readRenamed(STICK_MAP_KEY));
  } catch (e) {
    old = null;
  }
  if (!old) {
    return store;
  }
  const choice = loadPadChoice();
  if (choice.kind === 'pad') {
    const key = deviceKey(choice.id);
    store.maps[key] = store.maps[key] || old;
  } else {
    store.orphan = store.orphan || old;
  }
  return store;
}

/* Throws when storage refuses. Version 1 goes only once version 2 holds
 * it, under either spelling. */
function writeMaps(store) {
  localStorage.setItem(STICK_MAPS_KEY, JSON.stringify(store));
  localStorage.removeItem(STICK_MAP_KEY);
  localStorage.removeItem(oldSpelling(STICK_MAP_KEY));
}

/*
 * The map saved for the device `key` names (padprofiles.js deviceKey), or
 * AETR unsaved. A device with none adopts the orphan; if storage refuses
 * that write it still flies it this visit, and the orphan waits.
 */
export function loadStickMap(key) {
  const none = normaliseMap({ ...AETR_MAP, stored: false });
  if (typeof key !== 'string') {
    return none;
  }
  let store = null;
  try {
    store = readMaps();
  } catch (e) {
    return none;
  }
  if (!store.maps[key] && store.orphan) {
    store.maps[key] = store.orphan;
    store.orphan = null;
    try {
      writeMaps(store);
    } catch (e) {
      /* Adopted for this visit only. */
    }
  }
  return store.maps[key] ? normaliseMap(savedMap(store.maps[key])) : none;
}

/* True when the map reached storage under the device's key. */
export function saveStickMap(key, map) {
  if (typeof key !== 'string') {
    return false;
  }
  try {
    const store = readMaps();
    store.maps[key] = map;
    writeMaps(store);
    return true;
  } catch (e) {
    return false;
  }
}

/* The device's calibration gone, so it flies its built-in layout again.
 * True when storage no longer holds one for it. */
export function forgetStickMap(key) {
  if (typeof key !== 'string') {
    return false;
  }
  try {
    const store = readMaps();
    delete store.maps[key];
    writeMaps(store);
    return true;
  } catch (e) {
    return false;
  }
}

/* The feel saved for the device `key` names, or none (both off). */
export function loadStickFeel(key) {
  if (typeof key !== 'string') {
    return { ...NO_FEEL };
  }
  try {
    const { feel } = storedMaps();
    return normaliseFeel(feel && feel[key]);
  } catch (e) {
    return { ...NO_FEEL };
  }
}

/* True when the feel reached storage under the device's key. */
export function saveStickFeel(key, feel) {
  if (typeof key !== 'string') {
    return false;
  }
  try {
    const store = readMaps();
    store.feel = { ...store.feel, [key]: normaliseFeel(feel) };
    writeMaps(store);
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
