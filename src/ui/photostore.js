/*
 * photostore.js: the hangar's photos (docs/SHOW-IT-OFF.md part 1), kept in
 * IndexedDB on this computer: { id, created, airframe, blob } a JPEG each,
 * at most MAX_PHOTOS, the oldest going first. The photo wall shows the
 * newest. Not synced to the account (pictures are megabytes and the
 * account's blob is capped); a picture leaves this computer when the Take
 * that made it downloads it. Errors are raised, as My clips raises them.
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

import { newId } from '../replay/store.js';

const DB_NAME = 'fdfpv.photos.v1';
const STORE = 'photos';
export const MAX_PHOTOS = 24;

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not available'));
        return;
      }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
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

/* Every photo, newest first. */
export async function listPhotos() {
  const rows = await run('readonly', (s) => s.getAll());
  return (rows || []).sort((a, b) => b.created - a.created);
}

/* Keep a picture; returns how many old ones made room for it. */
export async function putPhoto(blob, airframe) {
  await run('readwrite', (s) => s.put({ id: newId(), created: Date.now(), airframe, blob }));
  const drop = (await listPhotos()).slice(MAX_PHOTOS);
  if (drop.length) {
    await run('readwrite', (s) => drop.forEach((r) => s.delete(r.id)));
  }
  return drop.length;
}
