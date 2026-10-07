/*
 * oldkeys-check.js: a browser that kept everything under the old webfpv.*
 * names boots the real page and keeps it all, under the fdfpv.* names.
 *
 *     node scripts/oldkeys-check.js      (npm run oldkeys:check)
 *
 * Seeds, before the page runs, every share key under its old name (the
 * pilot's name, key and guest key, the account record and sync mark, the
 * seat with a course on the Alps, edit keys, binds, a pending lap, posted
 * bests, the tracks and board overrides, the flight device id). Then, in
 * headless Chromium: the page boots, every value is under its new name and
 * no old name is left; the page reads them (the pilot's name, the seated
 * course); a reload changes nothing. The Node half of the same rule is
 * npm run oldkeys:selftest.
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

const COURSE = {
  schemaVersion: 4, id: 'trk-oldkeys', name: 'Kept course', map: 'alps', elements: [], sequence: [], modifiedUtc: '2026-10-01T00:00:00Z',
};
/* Old name, new name, value. */
const KEPT = [
  ['webfpv.pilot.name', 'fdfpv.pilot.name', 'Kept Pilot'],
  ['webfpv.pilot.key.v1', 'fdfpv.pilot.key.v1', 'NOT-A-REAL-KEY-1'],
  ['webfpv.pilot.key.guest.v1', 'fdfpv.pilot.key.guest.v1', '"NOT-A-REAL-KEY-2"'],
  ['webfpv.account.synced.v1', 'fdfpv.account.synced.v1', '{"data":{},"stamps":{}}'],
  ['webfpv.share.import.v1', 'fdfpv.share.import.v1', JSON.stringify({
    id: COURSE.id, name: COURSE.name, author: 'Kept Pilot', board: '', document: COURSE, local: false, importedUtc: '2026-10-01T00:00:00.000Z',
  })],
  ['webfpv.share.editkeys.v1', 'fdfpv.share.editkeys.v1', '{"trk-oldkeys":"ek-kept"}'],
  ['webfpv.share.bind.v1', 'fdfpv.share.bind.v1', '{"trk-oldkeys":{"board":"","author":"Kept Pilot","nameOnBoard":"Kept course","layoutFingerprint":"","owned":true,"sourceId":"","sourceName":"","sourceAuthor":""}}'],
  ['webfpv.share.pending.v1', 'fdfpv.share.pending.v1', '{"trackId":"trk-oldkeys","lapMs":61234,"craft":""}'],
  ['webfpv.share.posted.v1', 'fdfpv.share.posted.v1', '{"trk-oldkeys":{"lapMs":60000}}'],
  ['webfpv.tracks.origin', 'fdfpv.tracks.origin', 'http://127.0.0.1:9'],
  ['webfpv.board.origin', 'fdfpv.board.origin', 'http://127.0.0.1:9'],
  ['webfpv.flight.device.v1', 'fdfpv.flight.device.v1', 'd0123456789abcdef0123'],
];
/* Seeded only on the first load: a reload must find nothing left to move. */
const seed = `if (!sessionStorage.getItem('oldkeys.seeded')) {
  sessionStorage.setItem('oldkeys.seeded', '1');
  ${KEPT.map(([old, , value]) => `localStorage.setItem(${JSON.stringify(old)}, ${JSON.stringify(value)});`).join('\n  ')}
}`;

const read = `JSON.stringify(Object.fromEntries(${JSON.stringify(KEPT.flatMap(([a, b]) => [a, b]))}.map((k) => [k, localStorage.getItem(k)])))`;

const page = await openPage({ root, url: '/index.html?map=alps', seed: [seed] });
try {
  await page.until('!!window.__shellReady', 300000);
  const after = JSON.parse(await page.evaluate(read));
  const missing = KEPT.filter(([, now, value]) => after[now] !== value).map(([, now]) => now);
  check('every value is under its new name', missing.length === 0, missing.join(' '));
  const left = KEPT.filter(([old]) => after[old] !== null).map(([old]) => old);
  check('and no old name is left', left.length === 0, left.join(' '));
  const seen = JSON.parse(await page.evaluate(`Promise.all([import('/src/share/pilot.js'), import('/src/share/session.js')]).then(([p, s]) => JSON.stringify({
    name: p.readPilotName(), seat: (s.readShareImport() || {}).id, editKey: s.readEditKey('trk-oldkeys'), posted: s.readPostedBest('trk-oldkeys'), pending: (s.readPendingTime() || {}).lapMs,
  }))`));
  check('the page reads them: name, seat, edit key, posted best, pending lap',
    seen.name === 'Kept Pilot' && seen.seat === 'trk-oldkeys' && seen.editKey === 'ek-kept' && seen.posted === 60000 && seen.pending === 61234, JSON.stringify(seen));
  await page.cdp.send('Page.reload', {}, page.sessionId);
  await page.sleep(500);
  await page.until('!!window.__shellReady', 300000);
  check('a reload changes nothing', await page.evaluate(read) === JSON.stringify(after));
  /* The overrides point at a port nothing answers, so failed loads there
   * are expected; anything else is a fault. */
  const faults = page.errors.filter((e) => !e.startsWith('network:'));
  check('no page errors beyond the unanswered overrides', faults.length === 0, faults.slice(0, 3).join(' | '));
} finally {
  await page.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
