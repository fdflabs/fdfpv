/*
 * records.js: a pilot's best laps, kept in step between this computer and
 * the account (docs/FLIGHTCLUB-PROGRESSION.md section 1).
 *
 * src/game/race.js keeps each best lap in localStorage under the key
 * main.js recordKey builds (webfpv.best.<course hash>.<volts>.<airframe>
 * ...), and reads it back there; that stays its working store, so a lap
 * never waits on the network. The account holds the same keys as the
 * synced section `records`: the sync sends every record found here and
 * writes back every one the account has that is better. Sending them all
 * every time is also the migration: records from before this file go up
 * with the first sync, and nothing needs a marker.
 *
 * A lower lap is a better one, so two sides merge key by key to the
 * lower. Past RECORDS_MAX keys a merge keeps the first RECORDS_MAX key
 * names in sorted order, so the server and every computer drop the same
 * ones; a dropped key stays in this computer's localStorage either way.
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

export const RECORD_PREFIX = 'webfpv.best.';
/* Keys are about 40 characters, so a thousand are about 55 kB of the
 * 512 kB progress blob (tracks-api/limits.js PROGRESS_MAX_CHARS). */
export const RECORDS_MAX = 1000;
/* An hour: no lap on any course is longer, and a bigger number is junk. */
const LAP_MAX_MS = 3_600_000;
const KEY_MAX = 120;

function isRecord(o) {
  return Boolean(o) && typeof o === 'object' && !Array.isArray(o);
}

function lapOf(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= LAP_MAX_MS ? Math.round(n) : null;
}

function usableKey(k) {
  return typeof k === 'string' && k.startsWith(RECORD_PREFIX) && k.length <= KEY_MAX;
}

/* The records with the right shape, capped. */
export function cleanRecords(raw) {
  if (!isRecord(raw)) {
    return {};
  }
  const out = {};
  for (const key of Object.keys(raw).filter(usableKey).sort()) {
    const ms = lapOf(raw[key]);
    if (ms === null) {
      continue;
    }
    out[key] = ms;
    if (Object.keys(out).length >= RECORDS_MAX) {
      break;
    }
  }
  return out;
}

export function mergeRecords(a, b) {
  const x = cleanRecords(a);
  const y = cleanRecords(b);
  const both = {};
  for (const key of new Set([...Object.keys(x), ...Object.keys(y)])) {
    both[key] = Math.min(x[key] ?? Infinity, y[key] ?? Infinity);
  }
  return cleanRecords(both);
}

/* Reading localStorage itself throws where storage is blocked, so it is
 * read inside the callers' try. */
const pageStorage = () => globalThis.localStorage;

/* Every record in `storage`, this page's localStorage unless a stand in
 * is given. */
export function readRecords(storage = null) {
  const out = {};
  try {
    storage = storage ?? pageStorage();
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (usableKey(key)) {
        out[key] = storage.getItem(key);
      }
    }
  } catch (e) {
    /* No storage (Node, a sandbox, private mode) holds no records. */
  }
  return cleanRecords(out);
}

/* Each record of `records` better than what `storage` holds, written. */
export function keepRecords(records, storage = null) {
  try {
    storage = storage ?? pageStorage();
  } catch (e) {
    return;
  }
  for (const [key, ms] of Object.entries(cleanRecords(records))) {
    try {
      const held = lapOf(storage.getItem(key));
      if (held === null || ms < held) {
        storage.setItem(key, String(ms));
      }
    } catch (e) {
      /* A refused write leaves this computer's own record; the account
       * still has the better one and offers it again next sync. */
    }
  }
}
