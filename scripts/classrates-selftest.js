/*
 * classrates-selftest.js: rates per aircraft class (src/ui/settings.js
 * swapClassRates, redesign phase 7), in plain Node. Run with
 * npm run classrates:selftest.
 *
 * A pilot's own rates stay with the class they were set on: a quad's go
 * to ratesFor when a plane is seated and come back with the next quad; the
 * plane starts on its stock, and its own rates are kept the same way.
 * Within a class nothing changed. Rates that are nobody's own (an
 * aircraft's stock, the touch screen's defaults) travel as before and keep
 * nothing. The profile loads them back, drops what is not a class, and
 * the account syncs them per class.
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

const store = new Map();
globalThis.localStorage = {
  get length() { return store.size; },
  key: (i) => [...store.keys()][i] ?? null,
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(String(k), String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => store.clear(),
};
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node', maxTouchPoints: 0 }, configurable: true, writable: true });

const { loadSettings, seatAirframe, SETTINGS_KEY } = await import('../src/ui/ui.js');
const { normaliseRates, RATE_DEFAULTS, TOUCH_RATE_DEFAULTS } = await import('../configs/rates.js');
const {
  SYNCED_SECTIONS, blobRefusal, mergeBlobs, pickSynced,
} = await import('../src/share/progressmerge.js');

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
const show = (v) => JSON.stringify(v);
const same = (a, b) => show(normaliseRates(a)) === show(normaliseRates(b));

/* A profile seated on the aircraft, through the pilot's own door. */
function profile(airframe, extra = {}) {
  store.clear();
  store.set(SETTINGS_KEY, JSON.stringify({ airframe, airframeAsked: true, ...extra }));
  return loadSettings();
}

const QUAD_OWN = normaliseRates({ type: 'ACTUAL', roll: { rcRate: 8, srate: 80, expo: 20 }, pitch: { rcRate: 8, srate: 80, expo: 20 }, yaw: { rcRate: 6, srate: 50, expo: 10 }, throttleCap: 90 });
const PLANE_OWN = normaliseRates({ type: 'ACTUAL', roll: { rcRate: 4, srate: 30, expo: 30 }, pitch: { rcRate: 4, srate: 30, expo: 30 }, yaw: { rcRate: 4, srate: 25, expo: 0 }, thrMid: 40 });

console.log('a quad pilot\'s own rates stay with the multirotors');
{
  const s = profile('7inch', { rates: QUAD_OWN });
  check('the quad flies its own rates', same(s.rates, QUAD_OWN));
  check('and nothing is kept yet', s.ratesFor === undefined, show(s.ratesFor));
  seatAirframe(s, 'striker2500');
  check('the Striker starts on its stock rates, not the quad\'s', same(s.rates, RATE_DEFAULTS), show(s.rates));
  check('the quad\'s are kept under multirotor', same(s.ratesFor?.multirotor, QUAD_OWN), show(s.ratesFor));
  s.rates = PLANE_OWN;
  seatAirframe(s, 'bramor2300');
  check('another wing keeps the wing\'s own rates, as a seat in one class always has', same(s.rates, PLANE_OWN));
  seatAirframe(s, 'interceptor');
  check('a quad again: the quad\'s own rates are back', same(s.rates, QUAD_OWN), show(s.rates));
  check('and the wing\'s are kept under wing', same(s.ratesFor?.wing, PLANE_OWN), show(s.ratesFor));
}

console.log('\nrates that are nobody\'s own travel as before');
{
  const s = profile('7inch');
  seatAirframe(s, 'striker2500');
  check('stock to stock: the Striker\'s stock, nothing kept', same(s.rates, RATE_DEFAULTS) && s.ratesFor === undefined, show(s.ratesFor));
  const t = profile('7inch', { rates: TOUCH_RATE_DEFAULTS });
  seatAirframe(t, 'bramor2300');
  check('the touch screen\'s gentler rates go with the pilot to a plane', same(t.rates, TOUCH_RATE_DEFAULTS) && t.ratesFor === undefined, show(t.rates));
}

console.log('\non a touch screen, and in the air');
{
  navigator.maxTouchPoints = 5;
  const s = profile('7inch', { rates: QUAD_OWN });
  seatAirframe(s, 'striker2500');
  check('a thumb pilot with own quad rates starts a plane on the thumb rates, not 670 deg/s', same(s.rates, TOUCH_RATE_DEFAULTS), show(s.rates.roll));
  navigator.maxTouchPoints = 0;
  /* The hot swap (src/main.js hotSwap) seats a copy and assigns it back. */
  const live = profile('7inch', { rates: RATE_DEFAULTS, ratesFor: { multirotor: QUAD_OWN } });
  Object.assign(live, seatAirframe({ ...live }, 'bramor2300'));
  check('a swap that leaves nothing kept clears it on the profile the shell holds', live.ratesFor === undefined, show(live.ratesFor));
  const air = profile('7inch', { rates: QUAD_OWN });
  Object.assign(air, seatAirframe({ ...air }, 'striker2500'));
  check('and one that keeps the quad\'s keeps it there', same(air.ratesFor?.multirotor, QUAD_OWN) && same(air.rates, RATE_DEFAULTS));
}

console.log('\nthe profile keeps them');
{
  const s = profile('7inch', { rates: QUAD_OWN });
  seatAirframe(s, 'striker2500');
  store.set(SETTINGS_KEY, JSON.stringify(s));
  const back = loadSettings();
  check('a reload keeps the quad\'s rates under multirotor', same(back.ratesFor?.multirotor, QUAD_OWN));
  const odd = profile('7inch', { ratesFor: { multirotor: QUAD_OWN, boat: QUAD_OWN, plane: 'fast' } });
  check('a class that does not exist and a value that is not rates are dropped', show(Object.keys(odd.ratesFor)) === '["multirotor"]', show(odd.ratesFor));
  const none = profile('7inch', { ratesFor: {} });
  check('an empty one is not stored at all', none.ratesFor === undefined);
}

console.log('\nthe account syncs them per class');
{
  check('ratesFor is a synced section, keyed', SYNCED_SECTIONS.ratesFor === 'keyed');
  check('and is sent', show(pickSynced({ ratesFor: { plane: PLANE_OWN } }).ratesFor) === show({ plane: PLANE_OWN }));
  const a = { v: 1, data: { ratesFor: { multirotor: QUAD_OWN } }, stamps: { 'ratesFor/multirotor': 2000 } };
  const b = { v: 1, data: { ratesFor: { plane: PLANE_OWN } }, stamps: { 'ratesFor/plane': 1000 } };
  const merged = mergeBlobs(a, b);
  check('two computers\' classes merge, each kept', same(merged.data.ratesFor.multirotor, QUAD_OWN) && same(merged.data.ratesFor.plane, PLANE_OWN), show(merged.data.ratesFor));
  check('a class that does not exist is refused by the server', (blobRefusal({ data: { ratesFor: { boat: QUAD_OWN } } }) || {}).why === 'shape');
  check('a real one is not', blobRefusal({ data: { ratesFor: { glider: QUAD_OWN } } }) === null);
}

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
