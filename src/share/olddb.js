/*
 * olddb.js: moving an IndexedDB database from its old webfpv.* name to its
 * fdfpv.* name, records and all, so nobody loses stored clips to the
 * rename.
 *
 * moveDatabase(oldName, openNew) opens the new database the caller's own
 * way and, when a database still exists under the old name, first copies
 * every record of every object store the two share into it. A record the
 * new database already holds under the same key is kept as it is (the new
 * one is the live copy). Only after the copy has committed is the old
 * database deleted, so a copy that fails leaves it for the next load, and
 * once it is gone there is nothing to do. Two tabs moving at once both
 * copy, which changes nothing the second time, and both delete.
 *
 * Opening a database that does not exist creates it, so absence is read
 * from indexedDB.databases() where the browser has it, and otherwise by
 * opening the old name and abandoning the creation if it was new.
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

const settle = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

/* The old database open, or null when there is none. */
async function openIfThere(name) {
  if (typeof indexedDB.databases === 'function') {
    const all = await indexedDB.databases();
    if (!all.some((d) => d.name === name)) {
      return null;
    }
    return settle(indexedDB.open(name));
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name);
    let created = false;
    req.onupgradeneeded = (e) => {
      if (e.oldVersion === 0) {
        created = true;
        req.transaction.abort();
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => {
      if (created) {
        e.preventDefault();
        resolve(null);
      } else {
        reject(req.error);
      }
    };
  });
}

/* Every store's records as { name, keyPath, keys, values }. */
async function readAll(db) {
  const stores = [...db.objectStoreNames];
  if (stores.length === 0) {
    return [];
  }
  const tx = db.transaction(stores, 'readonly');
  return Promise.all(stores.map(async (name) => {
    const store = tx.objectStore(name);
    const [keys, values] = await Promise.all([settle(store.getAllKeys()), settle(store.getAll())]);
    return {
      name, keyPath: store.keyPath, keys, values,
    };
  }));
}

/* Add each record to `db` unless its key is taken, in one transaction
 * that resolves when it commits. */
function addAll(db, dumps) {
  const shared = dumps.filter((d) => db.objectStoreNames.contains(d.name));
  if (shared.length === 0) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(shared.map((d) => d.name), 'readwrite');
    for (const { name, keyPath, keys, values } of shared) {
      const store = tx.objectStore(name);
      values.forEach((value, i) => {
        const req = keyPath === null ? store.add(value, keys[i]) : store.add(value);
        /* A key already there: the new database's record stays, and the
         * transaction goes on. */
        req.onerror = (e) => {
          if (req.error && req.error.name === 'ConstraintError') {
            e.preventDefault();
            e.stopPropagation();
          }
        };
      });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/*
 * `openNew` resolves to the new database (or null where there is none);
 * moveDatabase resolves to the same thing, with the old database's records
 * in it. A move that fails for any reason still hands back the new
 * database: the old one stays where it is for the next load to try.
 */
export async function moveDatabase(oldName, openNew) {
  let old = null;
  try {
    old = typeof indexedDB === 'undefined' ? null : await openIfThere(oldName);
  } catch (e) {
    old = null;
  }
  if (!old) {
    return openNew();
  }
  let dumps = null;
  try {
    dumps = await readAll(old);
  } catch (e) {
    dumps = null;
  }
  old.close();
  const db = await openNew();
  if (!db || !dumps) {
    return db;
  }
  try {
    await addAll(db, dumps);
  } catch (e) {
    return db;
  }
  /* Not awaited: a tab still running the old code holds the old database
   * open and the delete waits for it, which must not hold this page. */
  try {
    indexedDB.deleteDatabase(oldName);
  } catch (e) {
    /* Tried again next load. */
  }
  return db;
}
