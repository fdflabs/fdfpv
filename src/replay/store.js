/*
 * store.js: "My clips", the pilot's saved replays, in IndexedDB.
 *
 * One row a replay: { id, name, created, thumb (a small PNG Blob), bytes
 * (the replay file, src/replay/file.js), airframe, map, duration }. The
 * list reads every row but the bytes are only read to play one. Errors
 * are raised, not swallowed: a pilot who pressed Save is told when it did
 * not save.
 *
 * Bounded: past MAX_CLIPS the oldest go, and a save says so.
 *
 * Also the one download helper the crash cam needs, for a Blob.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

const DB_NAME = 'webfpv.replays.v1';
const STORE = 'clips';
export const MAX_CLIPS = 40;

let dbPromise = null;

function openDb() {
  if (dbPromise) {
    return dbPromise;
  }
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function run(mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const out = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  }));
}

/* Every clip but its bytes, newest first. */
export async function listClips() {
  const rows = await run('readonly', (s) => s.getAll());
  return (rows || [])
    .map(({ bytes, ...rest }) => ({ ...rest, size: bytes ? bytes.byteLength : 0 }))
    .sort((a, b) => b.created - a.created);
}

export async function getClip(id) {
  return run('readonly', (s) => s.get(id));
}

/* Save a row; returns how many old clips made room for it. */
export async function putClip(row) {
  await run('readwrite', (s) => s.put(row));
  const all = await listClips();
  const drop = all.slice(MAX_CLIPS);
  if (drop.length) {
    await run('readwrite', (s) => {
      for (const r of drop) {
        s.delete(r.id);
      }
    });
  }
  return drop.length;
}

export async function renameClip(id, name) {
  const row = await getClip(id);
  if (!row) {
    throw new Error('that clip is gone');
  }
  row.name = name;
  await run('readwrite', (s) => s.put(row));
}

export async function deleteClip(id) {
  await run('readwrite', (s) => s.delete(id));
}

export function newId() {
  const r = new Uint32Array(2);
  crypto.getRandomValues(r);
  return `${Date.now().toString(36)}-${r[0].toString(36)}${r[1].toString(36)}`;
}

/* Hand a Blob to the pilot as a file. The URL is revoked on the next tick,
 * not at once, since Safari has cancelled a download revoked in the same
 * task (src/share/flightlog.js does the same for text). */
export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/* A file name that sorts and says what it is, for a map and an extension. */
export function stampedName(mapId, ext) {
  const t = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}`
    + `-${p(t.getHours())}${p(t.getMinutes())}${p(t.getSeconds())}`;
  return `py-drone-combat-${String(mapId || 'replay').replace(/[^a-z0-9_-]/gi, '')}-${stamp}${ext}`;
}
