/*
 * retired-maps-selftest.js: a world this build no longer has, named by
 * something that outlived it, lands somewhere and does not throw.
 *
 * The town and the airfield were retired on 2026-09-28 and Yellowstone on
 * 2026-10-01 (src/maps/retired.js). What still names them:
 *
 *   1. A pilot's stored settings: the seated map and the remembered
 *      freestyle world each load as the Swiss valley, silently, through
 *      the real loadSettings over a stand in for localStorage.
 *   2. The registry: none of them is a world, and mapById answers each
 *      with the Track seat, so a track or a room on one is never read as
 *      a world that loads.
 *   3. A signed in pilot's synced data: no synced section carries a map
 *      id, so a blob from a computer that last flew Yellowstone, with the
 *      id wherever a stale build could have put one, is cleaned and
 *      merged without error and carries no map out.
 *
 * The rooms server's half (a room on a retired world is refused, and one
 * restored from storage is moved) is in scripts/rooms-selftest.js.
 *
 * Run with npm run retired:selftest.
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

/* ui.js reads localStorage when loadSettings runs, not at import. */
const stored = new Map();
globalThis.localStorage = {
  getItem: (k) => (stored.has(k) ? stored.get(k) : null),
  setItem: (k, v) => stored.set(k, String(v)),
  removeItem: (k) => stored.delete(k),
};

const { loadSettings, SETTINGS_KEY } = await import('../src/ui/ui.js');
const { MAPS, mapById } = await import('../src/maps/registry.js');
const { retiredMap } = await import('../src/maps/retired.js');
const { SYNCED_SECTIONS, cleanBlob, mergeBlobs } = await import('../src/share/progressmerge.js');

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}${detail ? `  (${detail})` : ''}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

const RETIRED = ['city', 'airfield', 'yellowstone'];

console.log('1. stored settings');
for (const id of RETIRED) {
  stored.set(SETTINGS_KEY, JSON.stringify({ map: id, freestyleMap: id }));
  let s = null;
  let error = null;
  try {
    s = loadSettings();
  } catch (e) {
    error = e;
  }
  check(`a stored ${id} loads as the Swiss valley, in both slots`,
    !error && s.map === 'swiss2' && s.freestyleMap === 'swiss2',
    error ? error.message : `map ${s.map}, freestyleMap ${s.freestyleMap}`);
}
stored.set(SETTINGS_KEY, JSON.stringify({ map: 'itaipu', freestyleMap: 'alps' }));
const kept = loadSettings();
check('a world this build has is kept as it was', kept.map === 'itaipu' && kept.freestyleMap === 'alps',
  `map ${kept.map}, freestyleMap ${kept.freestyleMap}`);

console.log('2. the registry');
for (const id of RETIRED) {
  check(`${id} is retired to the Swiss valley`, retiredMap(id) && retiredMap(id).to === 'swiss2');
  check(`${id} is not a world, and mapById answers it with the Track seat`,
    !MAPS.some((m) => m.id === id) && mapById(id).id === 'track');
}
check('the worlds are the Alps, the Swiss valley, Itaipu and the Interior',
  MAPS.filter((m) => m.load).map((m) => m.id).join() === 'alps,swiss2,itaipu,interior',
  MAPS.filter((m) => m.load).map((m) => m.id).join());
check('every retired id lands on a world this build has',
  RETIRED.every((id) => retiredMap(id) && MAPS.some((m) => m.id === retiredMap(id).to && m.load)));

console.log('3. synced account data');
check('no synced section is a map id', !('map' in SYNCED_SECTIONS) && !('freestyleMap' in SYNCED_SECTIONS),
  Object.keys(SYNCED_SECTIONS).join());
const old = {
  v: 1,
  data: {
    map: 'yellowstone',
    freestyleMap: 'yellowstone',
    progress: { xp: 120, courses: { yellowstone: true }, seen: { 'map:yellowstone': true }, challenges: {}, casual: {} },
    campaign: { yellowstone: { done: true } },
  },
  stamps: { progress: 1, campaign: 1, map: 1 },
};
let merged = null;
let error = null;
try {
  merged = mergeBlobs(cleanBlob(old), cleanBlob({ v: 1, data: {}, stamps: {} }));
} catch (e) {
  error = e;
}
check('a blob from a computer that last flew Yellowstone cleans and merges without error', !error && Boolean(merged),
  error ? error.message : '');
check('and carries no map id out', merged && !('map' in merged.data) && !('freestyleMap' in merged.data),
  merged ? Object.keys(merged.data).join() : '');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
