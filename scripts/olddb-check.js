/*
 * olddb-check.js: IndexedDB databases moved from their old webfpv.* names
 * (src/share/olddb.js), in Chromium, with seeded old databases.
 *
 *     node scripts/olddb-check.js      (npm run olddb:check)
 *
 * Seeds databases the way an older build left them and proves the move:
 *
 *   - the world thumbnails (src/share/orbitcache.js): clips stored under
 *     webfpv.orbitclips.v1 are read back through the module from
 *     fdfpv.orbitclips.v1, and the old database is gone;
 *   - a clip already in the new database wins over the old copy, and the
 *     old-only ones still arrive;
 *   - stores with out-of-line keys keep their keys; a store the new
 *     database lacks is skipped;
 *   - running the move twice changes nothing;
 *   - with no old database, none is created under the old name, with or
 *     without indexedDB.databases().
 *
 * Local, not in CI: it drives Chromium.
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

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

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

/* Runs in the page, one phase per page load (a module copy keeps its
 * database open until the page goes, and an open database cannot be
 * deleted); returns [name, ok, detail] rows. */
const IN_PAGE = async (phase) => {
  const rows = [];
  const expect = (name, ok, detail = '') => rows.push([name, Boolean(ok), String(detail)]);
  const settle = (req) => new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const names = async () => (await indexedDB.databases()).map((d) => d.name).sort();
  const dropAll = async () => {
    for (const name of await names()) {
      await settle(indexedDB.deleteDatabase(name));
    }
  };
  /* A database built as `stores` says: { store: { keyPath, rows: [[key, value]] } }. */
  const seed = (name, stores) => new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      for (const [store, spec] of Object.entries(stores)) {
        req.result.createObjectStore(store, spec.keyPath ? { keyPath: spec.keyPath } : {});
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(Object.keys(stores), 'readwrite');
      for (const [store, spec] of Object.entries(stores)) {
        for (const [key, value] of spec.rows) {
          if (spec.keyPath) {
            tx.objectStore(store).put(value);
          } else {
            tx.objectStore(store).put(value, key);
          }
        }
      }
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
  const dump = async (name) => {
    const db = await settle(indexedDB.open(name));
    const out = {};
    for (const store of db.objectStoreNames) {
      const tx = db.transaction(store, 'readonly');
      const keys = await settle(tx.objectStore(store).getAllKeys());
      const values = await settle(tx.objectStore(store).getAll());
      out[store] = await Promise.all(keys.map(async (k, i) => [k, values[i] && values[i].blob ? await values[i].blob.text() : values[i]]));
    }
    db.close();
    return out;
  };
  const waitGone = async (name) => {
    for (let i = 0; i < 50; i += 1) {
      if (!(await names()).includes(name)) {
        return true;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    return false;
  };
  const clip = (key, text, t) => ({ key, blob: new Blob([text], { type: 'video/webm' }), t });
  const { moveDatabase } = await import('/src/share/olddb.js');
  let copy = 0;
  const freshClips = () => import(`/src/share/orbitcache.js?copy=${(copy += 1)}`);

  await dropAll();
  const K = (await freshClips()).clipKeyForMap;
  if (phase === 1) {
    /* The thumbnails, through the module. */
    await seed('webfpv.orbitclips.v1', {
      clips: { keyPath: 'key', rows: [[K('alps'), clip(K('alps'), 'old alps', 1)], [K('town'), clip(K('town'), 'old town', 2)], ['v4:old', clip('v4:old', 'stale', 0)]] },
    });
    const oc = await freshClips();
    const alps = await oc.getClip(K('alps'));
    expect('an old clip reads back through the module', alps && (await alps.text()) === 'old alps');
    expect('the old database is gone', await waitGone('webfpv.orbitclips.v1'), (await names()).join());
    const held = (await dump('fdfpv.orbitclips.v1')).clips || [];
    expect('the new one holds every record', held.map((r) => r[0]).sort().join() === [K('alps'), K('town'), 'v4:old'].sort().join());
    const again = await freshClips();
    const town = await again.getClip(K('town'));
    expect('a later load finds them with nothing left to move', town && (await town.text()) === 'old town' && !(await names()).includes('webfpv.orbitclips.v1'));
    expect('and a new clip still goes in beside them', (await again.putClip(K('swiss2'), new Blob(['new'], { type: 'video/webm' })))
      && ((await dump('fdfpv.orbitclips.v1')).clips || []).length === 4);

  }
  if (phase === 2) {
    /* The new copy wins. */
    await seed('fdfpv.orbitclips.v1', { clips: { keyPath: 'key', rows: [[K('alps'), clip(K('alps'), 'new alps', 9)]] } });
    await seed('webfpv.orbitclips.v1', { clips: { keyPath: 'key', rows: [[K('alps'), clip(K('alps'), 'old alps', 1)], [K('town'), clip(K('town'), 'old town', 2)]] } });
    const oc2 = await freshClips();
    const won = await oc2.getClip(K('alps'));
    const moved = await oc2.getClip(K('town'));
    expect('a clip already under the new name wins', won && (await won.text()) === 'new alps');
    expect('and the old-only one arrives', moved && (await moved.text()) === 'old town');
    expect('and the old database goes', await waitGone('webfpv.orbitclips.v1'));

  }
  if (phase === 3) {
    /* The helper on its own. */
    await seed('webfpv.test.v1', {
      things: { keyPath: null, rows: [['k1', { n: 1 }], [2, 'two'], [[3, 'x'], null]] },
      gone: { keyPath: 'id', rows: [['a', { id: 'a' }]] },
    });
    const openTest = () => new Promise((resolve) => {
      const req = indexedDB.open('fdfpv.test.v1', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('things');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    const db1 = await moveDatabase('webfpv.test.v1', openTest);
    db1.close();
    const after = await dump('fdfpv.test.v1');
    expect('out-of-line keys keep their keys and values', JSON.stringify(after.things) === JSON.stringify([[2, 'two'], ['k1', { n: 1 }], [[3, 'x'], null]]), JSON.stringify(after));
    expect('a store the new database lacks is skipped', !('gone' in after));
    expect('the old test database goes', await waitGone('webfpv.test.v1'));
    const db2 = await moveDatabase('webfpv.test.v1', openTest);
    db2.close();
    expect('running it twice changes nothing', JSON.stringify(await dump('fdfpv.test.v1')) === JSON.stringify(after));

    /* Nothing old: nothing made under the old name. */
    await dropAll();
    const db3 = await moveDatabase('webfpv.never.v1', openTest);
    db3.close();
    expect('no old database: none is created', !(await names()).includes('webfpv.never.v1'), (await names()).join());
    const keepList = indexedDB.databases;
    indexedDB.databases = undefined;
    const db4 = await moveDatabase('webfpv.never.v1', openTest);
    db4.close();
    indexedDB.databases = keepList;
    expect('nor without indexedDB.databases()', !(await names()).includes('webfpv.never.v1'), (await names()).join());
    await seed('webfpv.test.v1', { things: { keyPath: null, rows: [['late', 'arrival']] } });
    indexedDB.databases = undefined;
    const db5 = await moveDatabase('webfpv.test.v1', openTest);
    db5.close();
    indexedDB.databases = keepList;
    expect('without indexedDB.databases() an old one still moves', ((await dump('fdfpv.test.v1')).things || []).some((r) => r[0] === 'late')
      && await waitGone('webfpv.test.v1'));
    const db6 = await moveDatabase('webfpv.test.v1', async () => null);
    expect('a page with no new database gets null back', db6 === null);
    await dropAll();
  }
  return rows;
};

const page = await openPage({ root, url: '/privacy.html', width: 640, height: 360 });
try {
  for (const phase of [1, 2, 3]) {
    if (phase > 1) {
      await page.cdp.send('Page.navigate', { url: `${page.origin}/privacy.html?phase=${phase}` }, page.sessionId);
      await page.sleep(200);
    }
    await page.until(`document.readyState === "complete" && location.search === "${phase > 1 ? `?phase=${phase}` : ''}"`, 30000);
    for (const [name, ok, detail] of await page.evaluate(`(${IN_PAGE.toString()})(${phase})`)) {
      check(name, ok, detail);
    }
  }
} finally {
  await page.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
