/*
 * retired-aircraft-selftest.js: the five inch and the 65 mm whoop, removed
 * from the whole game on 2026-10-03, named by something that outlived them,
 * land on the interceptor and do not throw.
 *
 * What still names them, and where each is moved:
 *
 *   1. A pilot's stored settings, through the real loadSettings over a
 *      stand in for localStorage: the seated aircraft is the interceptor
 *      on its own tune, the old aircraft's motors, parts, bench setup and
 *      loadout are dropped, and a Flight controller dump stamped with it
 *      is restamped. The interceptor flies bare outside a war.
 *   2. My Hangar, on this computer (src/ui/builds.js normaliseBuilds): a
 *      build on either is the same build on the interceptor, its name, id
 *      and dates kept and its fit at stock.
 *   3. A signed in pilot's synced data, as the accounts server merges it
 *      (src/share/progressmerge.js, tracks-api/accounts.js): the same move
 *      for a build, and every section keyed by airframe drops the old
 *      aircraft's entry, on a merge and on a plain read.
 *   4. An id this build never had falls back to DEFAULT_AIRFRAME, which is
 *      the interceptor, on purpose rather than as the table's first row.
 *   5. A track drawn for the RaceGOW room the whoop flew: no aircraft flies
 *      it, so it keeps its class through a read and a write, a lap on it is
 *      refused by the board's own check, and the refusal is said in English
 *      and Spanish.
 *
 * A room seat on either is scripts/rooms-selftest.js's, and a replay or a
 * crash cam clip naming either is scripts/crashcam-selftest.js's.
 *
 * Run with npm run retired:aircraft.
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

/* ui.js reads localStorage when loadSettings runs, not at import. */
const stored = new Map();
globalThis.localStorage = {
  getItem: (k) => (stored.has(k) ? stored.get(k) : null),
  setItem: (k, v) => stored.set(k, String(v)),
  removeItem: (k) => stored.delete(k),
  key: (i) => [...stored.keys()][i] ?? null,
  get length() {
    return stored.size;
  },
};

const { loadSettings, SETTINGS_KEY } = await import('../src/ui/ui.js');
const { AIRFRAME_IDS, DEFAULT_AIRFRAME, airframeById, currentAirframeId, retiredAirframe } = await import('../configs/airframes.js');
const { combatChoice } = await import('../configs/combat.js');
const { FC_DUMP_AIRFRAME_KEY } = await import('../src/fc/dump.js');
const { normaliseBuilds, buildsBlob } = await import('../src/ui/builds.js');
const { cleanBlob, mergeBlobs } = await import('../src/share/progressmerge.js');
const { normalize, toPlain } = await import('../src/trackbuilder/model.js');
const { noAircraftFlies } = await import('../src/trackbuilder/elements.js');
const { checkLap } = await import('../src/game/verify.js');
const en = (await import('../src/strings/en.js')).default;
const es = (await import('../src/strings/es.js')).default;

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

const GONE = ['5inch', 'whoop65'];

console.log('0. the table');
check('the default racer is the interceptor', DEFAULT_AIRFRAME === 'interceptor' && AIRFRAME_IDS.includes(DEFAULT_AIRFRAME));
for (const id of GONE) {
  check(`${id} is no aircraft and is retired to the interceptor`,
    !AIRFRAME_IDS.includes(id) && retiredAirframe(id) && retiredAirframe(id).to === 'interceptor' && currentAirframeId(id) === 'interceptor');
}

console.log('1. stored settings');
for (const id of GONE) {
  stored.clear();
  /* A profile that chose the aircraft, on its stock tune, with a hangar of
   * motors, a broken prop, a bench setup and a loadout all filed under it. */
  stored.set(SETTINGS_KEY, JSON.stringify({
    airframe: id,
    airframeAsked: true,
    tune: 'betaflight-default',
    tuneFor: { [id]: 'betaflight-default' },
    power: { [id]: { option: 'f40pro-2150', prop: 't5143s', pack: 'cnhl-1500-130' } },
    parts: { [id]: { prop: 'stock', addons: [], damage: null } },
    tuning: { [id]: { rate: 'low' } },
    combat: { [id]: { payload: 'standard', accessories: [] } },
  }));
  stored.set(FC_DUMP_AIRFRAME_KEY, id);
  let s = null;
  let error = null;
  try {
    s = loadSettings();
  } catch (e) {
    error = e;
  }
  check(`a profile seated on the ${id} loads on the interceptor, on its own tune`,
    !error && s.airframe === 'interceptor' && s.tune === airframeById('interceptor').defaultTune,
    error ? error.message : `${s.airframe}, ${s.tune}`);
  check(`and nothing filed under the ${id} survives it`,
    !error && !(id in (s.power || {})) && !(id in (s.parts || {})) && !(id in (s.tuning || {})) && !(id in (s.combat || {})),
    error ? '' : JSON.stringify({ power: s.power, parts: s.parts, tuning: s.tuning, combat: s.combat }));
  check(`a Flight controller dump stamped ${id} is the interceptor's`, stored.get(FC_DUMP_AIRFRAME_KEY) === 'interceptor', stored.get(FC_DUMP_AIRFRAME_KEY));
  check('the interceptor it lands on flies bare: no loadout chosen is no payload',
    !error && combatChoice(airframeById(s.airframe), s.combat ? s.combat[s.airframe] : null).payload === 'none');
}
stored.clear();
stored.set(SETTINGS_KEY, JSON.stringify({ airframe: 'no-such-quad', airframeAsked: true }));
check('an id this build never had falls back to the interceptor, not to the first row',
  loadSettings().airframe === 'interceptor' && airframeById('no-such-quad').id === 'interceptor' && AIRFRAME_IDS[0] !== 'interceptor');

console.log('2. My Hangar on this computer');
const oldBuilds = {
  v: 1,
  builds: [
    { id: 'hotfive1', name: 'Hot Five', airframe: '5inch', fit: { power: { option: 'f40pro-2150', prop: 't5143s', pack: 'cnhl-1500-130' } }, created: 1700000000000, updated: 1700000001000 },
    { id: 'tinywhoop', name: 'Living room', airframe: 'whoop65', fit: {}, created: 1700000002000, updated: 1700000003000 },
    { id: 'cubkeep', name: 'Cub', airframe: 'cub1400', fit: {}, created: 1700000004000, updated: 1700000005000 },
  ],
};
const builds = normaliseBuilds(oldBuilds);
const five = builds.find((b) => b.id === 'hotfive1');
const whoop = builds.find((b) => b.id === 'tinywhoop');
check('every build survives a load, none dropped', builds.length === 3, builds.map((b) => `${b.id}:${b.airframe}`).join(' '));
check('the five inch build is the same build on the interceptor, name and dates kept',
  five && five.airframe === 'interceptor' && five.name === 'Hot Five' && five.created === 1700000000000 && five.updated === 1700000001000,
  JSON.stringify(five));
/* A fit with nothing chosen is a null slot: the stock machine. */
check('and its motors, prop and pack, which were the five inch\'s, are dropped to stock',
  five && Object.values(five.fit).every((v) => v === null), JSON.stringify(five && five.fit));
check('the whoop build is on the interceptor too', whoop && whoop.airframe === 'interceptor', JSON.stringify(whoop));
check('a build on an aircraft that stayed is untouched', builds.find((b) => b.id === 'cubkeep').airframe === 'cub1400');

console.log('3. the account, as the server merges it');
const sent = {
  v: 1,
  data: {
    builds: { hotfive1: oldBuilds.builds[0], cubkeep: oldBuilds.builds[2] },
    power: { '5inch': { option: 'f40pro-2150', prop: 't5143s', pack: 'cnhl-1500-130' }, '7inch': { option: 'stock', prop: 'stock', pack: 'stock' } },
    tuneFor: { whoop65: 'betaflight-default', interceptor: 'betaflight-interceptor' },
    combat: { '5inch': { payload: 'standard', accessories: [] } },
    tune: 'betaflight-default',
  },
  stamps: { 'builds/hotfive1': 10, 'power/5inch': 10, 'tuneFor/whoop65': 10 },
};
let merged = null;
let error = null;
try {
  merged = mergeBlobs(sent, { v: 1, data: { builds: { tinywhoop: oldBuilds.builds[1] } }, stamps: {} });
} catch (e) {
  error = e;
}
check('a blob naming both cleans and merges without error', !error && Boolean(merged), error ? error.message : '');
const mb = merged ? merged.data.builds : {};
check('the server moves a five inch build onto the interceptor at stock, keeping its name and dates',
  mb.hotfive1 && mb.hotfive1.airframe === 'interceptor' && JSON.stringify(mb.hotfive1.fit) === '{}' && mb.hotfive1.name === 'Hot Five' && mb.hotfive1.updated === 1700000001000,
  JSON.stringify(mb.hotfive1));
check('and a whoop build it already held', mb.tinywhoop && mb.tinywhoop.airframe === 'interceptor', JSON.stringify(mb.tinywhoop));
check('every section keyed by airframe drops the retired entries and keeps the rest',
  merged && !('5inch' in merged.data.power) && '7inch' in merged.data.power && !('whoop65' in merged.data.tuneFor)
    && merged.data.tuneFor.interceptor === 'betaflight-interceptor' && !('5inch' in (merged.data.combat || {})),
  merged ? JSON.stringify({ power: merged.data.power, tuneFor: merged.data.tuneFor, combat: merged.data.combat }) : '');
const read = cleanBlob({ v: 1, data: { builds: { hotfive1: oldBuilds.builds[0] } }, stamps: {} });
check('a plain read of what the account held moves it the same way', read.data.builds.hotfive1.airframe === 'interceptor');
check('what the server sends back loads on this computer as the same build',
  normaliseBuilds({ v: 1, builds: Object.values(mb) }).some((b) => b.id === 'hotfive1' && b.airframe === 'interceptor'));
check('and the merge is stable: merged again it is the same', JSON.stringify(mergeBlobs(merged, merged).data.builds) === JSON.stringify(mb));
check('a build blob written now names no retired aircraft',
  Object.values(buildsBlob(builds)).every((b) => !retiredAirframe(b.airframe)));

console.log('4. a RaceGOW room');
const room = { schemaVersion: 3, id: 'trk-0ld0r00m', name: 'Old room', trackClass: 'micro', field: { width: 10, depth: 12, gridSize: 0.0254 }, elements: [], sequence: [] };
check('no aircraft flies it', noAircraftFlies(room) && !noAircraftFlies({ trackClass: 'full' }) && !noAircraftFlies({}));
const back = toPlain(normalize(room).doc);
check('read and written it is still a RaceGOW room, never a field track', back.trackClass === 'micro' && noAircraftFlies(back), back.trackClass);
const lap = checkLap(room, new Uint8Array(0), 2000);
check('a lap on it is refused, by the board\'s own check', lap && lap.ok === false && /no aircraft flies this track/.test(lap.reason), lap && lap.reason);
check('the refusal is said in English and Spanish', Boolean(en['track.no_aircraft']) && Boolean(es['track.no_aircraft']) && en['track.no_aircraft'] !== es['track.no_aircraft']);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
