/*
 * comfort-selftest.js: the camera comfort settings (src/render/comfort.js)
 * and how a stored profile reads them (src/ui/settings.js loadSettings).
 *
 *   npm run comfort:selftest
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

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
}

const store = new Map();
globalThis.localStorage = {
  get length() { return store.size; },
  key: (i) => [...store.keys()][i] ?? null,
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(String(k), String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => store.clear(),
};
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', maxTouchPoints: 0 }, configurable: true, writable: true });
let reduce = false;
globalThis.window = { matchMedia: (q) => ({ matches: reduce && q === '(prefers-reduced-motion: reduce)' }) };

const { SHAKE_LEVELS, shakeScale, normaliseShake, CHASE_SMOOTHING, chaseLagMs } = await import('../src/render/comfort.js');
const ui = await import('../src/ui/ui.js');

console.log('the shake scale');
check('on is the measured picture, whole', shakeScale('on') === 1);
check('reduced is a third', Math.abs(shakeScale('reduced') - 1 / 3) < 1e-12);
check('off is none', shakeScale('off') === 0);
check('an unknown level is the whole picture', shakeScale('wobbly') === 1 && shakeScale(undefined) === 1);
check('three levels, on first', JSON.stringify(SHAKE_LEVELS) === '["on","reduced","off"]');

console.log('the default');
check('no choice and no system request: on', normaliseShake(undefined, false) === 'on');
check('no choice and the system asks for reduced motion: reduced', normaliseShake(undefined, true) === 'reduced');
check('a stored on wins over the system request', normaliseShake('on', true) === 'on');
check('a stored off stays off', normaliseShake('off', false) === 'off');
check('junk is treated as no choice', normaliseShake('loud', true) === 'reduced' && normaliseShake(3, false) === 'on');

console.log('chase smoothing');
check('standard is the 120 ms the chase camera always had', chaseLagMs('standard') === 120);
check('tight lags less and smooth more', chaseLagMs('tight') < 120 && chaseLagMs('smooth') > 120);
check('an unknown choice is standard', chaseLagMs('nope') === 120);
check('three choices', JSON.stringify(CHASE_SMOOTHING) === '["tight","standard","smooth"]');

console.log('loadSettings');
const load = (profile) => {
  store.clear();
  if (profile) {
    store.set(ui.SETTINGS_KEY, JSON.stringify(profile));
  }
  return ui.loadSettings();
};
reduce = false;
let s = load(null);
check('a first visit: shake on, chase standard', s.cameraShake === 'on' && s.chaseSmooth === 'standard', JSON.stringify([s.cameraShake, s.chaseSmooth]));
reduce = true;
s = load(null);
check('a first visit asking for reduced motion: shake reduced', s.cameraShake === 'reduced');
s = load({ cameraShake: 'on', chaseSmooth: 'smooth' });
check('a profile that chose on keeps on under the request, and its chase', s.cameraShake === 'on' && s.chaseSmooth === 'smooth');
reduce = false;
s = load({ cameraShake: 'sideways', chaseSmooth: 'jelly' });
check('junk in a profile reads as the defaults', s.cameraShake === 'on' && s.chaseSmooth === 'standard');

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
