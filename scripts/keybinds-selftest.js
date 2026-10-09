/*
 * keybinds-selftest.js: the flight key bindings (src/input/keybinds.js)
 * and their translation in InputManager.keyDown, in plain Node. Run with
 * npm run keybinds:selftest (CI).
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

import { ACTIONS, RESERVED, bind, boundForAircraft, effectiveKeys, emptyKeybinds, keyLabel, normaliseKeybinds, resetAction, translate } from '../src/input/keybinds.js';
import { SYNCED_SECTIONS, pickSynced } from '../src/share/progressmerge.js';

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
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('the table');
check('every action has its own default key', new Set(ACTIONS.map((a) => a.code)).size === ACTIONS.length);
check('no default key is reserved', ACTIONS.every((a) => !RESERVED.has(a.code)));
check('the defaults are the keys main.js reads', same(ACTIONS.map((a) => a.code), ['KeyR', 'KeyX', 'KeyT', 'KeyL', 'KeyP', 'KeyF', 'KeyG', 'KeyO', 'KeyC']));

console.log('no bindings: the identity');
const none = emptyKeybinds();
const codes = ['KeyR', 'KeyX', 'KeyN', 'KeyW', 'Escape', 'Digit4', 'Space', 'F8'];
check('every key is itself, on any aircraft', codes.every((c) => translate(none, null, c) === c && translate(none, 'timber1500', c) === c));
check('and with no profile field at all', codes.every((c) => translate(undefined, 'cub1400', c) === c));

console.log('a binding for every aircraft');
let r = bind(none, 'reset', 'KeyN');
check('reset moves to N', r.ok && same(r.binds.all, { reset: 'KeyN' }), JSON.stringify(r));
let b = r.binds;
check('N now resets', translate(b, 'timber1500', 'KeyN') === 'KeyR');
check('R no longer does', translate(b, 'timber1500', 'KeyR') === null);
check('other keys are untouched', translate(b, null, 'KeyX') === 'KeyX' && translate(b, null, 'KeyW') === 'KeyW');
check('the label reads N', keyLabel(effectiveKeys(b).reset) === 'N' && keyLabel('Digit7') === '7');

console.log('conflicts');
r = bind(b, 'unstick', 'KeyN');
check('a key another action holds is refused, naming it', !r.ok && r.reason === 'taken' && r.other === 'reset', JSON.stringify(r));
r = bind(b, 'unstick', 'KeyR');
check('a default key freed by a move can be taken', r.ok && translate(r.binds, null, 'KeyR') === 'KeyX' && translate(r.binds, null, 'KeyX') === null);
r = bind(b, 'unstick', 'KeyP');
check('a default key still in use is refused', !r.ok && r.other === 'chute');
for (const k of ['KeyW', 'Escape', 'Tab', 'Space', 'KeyJ', 'ArrowUp', 'F8']) {
  const got = bind(b, 'reset', k);
  check(`a reserved key (${k}) is refused`, !got.ok && got.reason === 'reserved');
}
check('a key that is no key is refused', !bind(b, 'reset', 'MetaLeft').ok);

console.log('a binding for one aircraft');
r = bind(none, 'chute', 'KeyN', 'bramor');
check('the Bramor pulls its chute on N', r.ok && translate(r.binds, 'bramor', 'KeyN') === 'KeyP' && translate(r.binds, 'bramor', 'KeyP') === null);
check('every other aircraft is as it was', translate(r.binds, 'timber1500', 'KeyN') === 'KeyN' && translate(r.binds, 'timber1500', 'KeyP') === 'KeyP');
check('it is marked as the aircraft\'s own', boundForAircraft(r.binds, 'bramor', 'chute') && !boundForAircraft(r.binds, 'timber1500', 'chute'));
const own = r.binds;
r = bind(own, 'reset', 'KeyN');
check('an every-aircraft move onto a key an aircraft uses is refused', !r.ok && r.other === 'chute');
r = bind(b, 'smoke', 'KeyN', 'edge1524');
check('an aircraft move onto the every-aircraft key of another action is refused', !r.ok && r.other === 'reset');
check('reserved for an aircraft too', !bind(b, 'reset', 'KeyK', 'edge1524').ok);
r = bind(b, 'reset', 'KeyV', 'edge1524');
check('V is reserved (the builder)', !r.ok);
r = bind(b, 'reset', 'KeyB', 'edge1524');
check('B is reserved (the builder)', !r.ok);
r = bind(b, 'reset', 'Digit9', 'edge1524');
check('an aircraft may move an every-aircraft binding again', r.ok && translate(r.binds, 'edge1524', 'Digit9') === 'KeyR'
  && translate(r.binds, 'edge1524', 'KeyN') === 'KeyN' && translate(r.binds, 'edge1524', 'KeyR') === null
  && translate(r.binds, 'cub1400', 'KeyN') === 'KeyR');

console.log('reset to defaults');
const both = bind(bind(b, 'flaps', 'Digit1').binds, 'chute', 'Digit2', 'bramor').binds;
let back = resetAction(both, 'reset');
check('one action back, for every aircraft', same(back.all, { flaps: 'Digit1' }) && translate(back, null, 'KeyR') === 'KeyR');
back = resetAction(both, 'chute', 'bramor');
check('one action back on one aircraft, which then follows every aircraft', !back.by.bramor && translate(back, 'bramor', 'KeyP') === 'KeyP');
check('binding the default key is the same as a reset', same(bind(b, 'reset', 'KeyR').binds, emptyKeybinds()));
check('reset all is the empty value', same(normaliseKeybinds(emptyKeybinds()), { v: 1, all: {}, by: {} }));

console.log('stored and synced');
check('an old profile with no field reads as none', same(normaliseKeybinds(undefined), emptyKeybinds()) && same(normaliseKeybinds(null), emptyKeybinds()));
check('junk reads entry by entry', same(normaliseKeybinds({ v: 9, all: { reset: 'KeyN', nope: 'KeyM', flip: 'KeyW', gear: 3 }, by: { 'Bad Id': { chute: 'KeyN' }, bramor: { chute: 'Digit3' } } }),
  { v: 1, all: { reset: 'KeyN' }, by: { bramor: { chute: 'Digit3' } } }));
check('a stored clash keeps the first', same(normaliseKeybinds({ all: { reset: 'KeyN', unstick: 'KeyN' } }).all, { reset: 'KeyN' }));
check('a stored default key is dropped (it is no move)', same(normaliseKeybinds({ all: { reset: 'KeyR' } }).all, {}));
check('keybinds is a synced section, whole', SYNCED_SECTIONS.keybinds === 'whole' && same(pickSynced({ keybinds: b, graphics: 'low' }), { keybinds: b }));

console.log('InputManager.keyDown');
globalThis.window = { addEventListener() {}, removeEventListener() {} };
const items = new Map();
globalThis.localStorage = { getItem: (k) => (items.has(k) ? items.get(k) : null), setItem: (k, v) => items.set(k, String(v)), removeItem: (k) => items.delete(k) };
try {
  navigator.getGamepads = () => [];
} catch (e) {
  globalThis.navigator = { getGamepads: () => [] };
}
const { InputManager } = await import('../src/input/input.js');
const im = new InputManager();
const heard = [];
im.onKey = (code, repeat) => heard.push([code, repeat]);
const ev = (code, repeat = false) => ({ code, repeat, target: null, preventDefault() {} });
im.keyDown(ev('KeyR'));
im.keyUp(ev('KeyR'));
check('unset: R arrives as R', same(heard, [['KeyR', false]]) && im.keys.size === 0);
let flying = true;
im.translateKey = (code) => (flying ? translate(b, 'timber1500', code) : code);
heard.length = 0;
im.keyDown(ev('KeyN'));
check('in flight N arrives as R and is held as R', same(heard, [['KeyR', false]]) && im.keys.has('KeyR') && !im.keys.has('KeyN'));
flying = false;
im.keyDown(ev('KeyN', true));
check('its repeat stays R after flight ends', same(heard.at(-1), ['KeyR', true]));
im.keyUp(ev('KeyN'));
check('its release lets go of R', !im.keys.has('KeyR'));
flying = true;
heard.length = 0;
im.keyDown(ev('KeyR'));
check('the moved default key arrives as nothing', heard.length === 0 && im.keys.size === 0);
im.keyUp(ev('KeyR'));
im.keyDown({ code: 'KeyN', repeat: false, target: { tagName: 'INPUT' }, preventDefault() {} });
check('a text field gets its keys untranslated (and only Escape reaches onKey)', heard.length === 0);

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
