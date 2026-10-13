/*
 * keybinds.js: the flight keys a pilot may move to other keys, and the
 * translation that makes a moved key work everywhere the old one did.
 *
 * Every flight action is read in main.js by the code of its default key
 * (input.onKey, `code === 'KeyR'`, and input.keys for the held ones). So
 * a binding does not teach those readers a new key: InputManager.keyDown
 * asks translate() first, and the physical key the pilot chose arrives as
 * the default code. The default key itself, once moved away, arrives as
 * nothing, so it no longer fires the action. With no bindings the
 * translation is the identity and nothing else changes.
 *
 * A binding is for every aircraft or for one airframe id; the airframe's
 * own wins. The stored shape (settings.keybinds, synced as a whole):
 *   { v: 1, all: { <action id>: <code> }, by: { <airframe id>: { <action id>: <code> } } }
 * Only moved actions are stored, so a reset is a delete, and a profile
 * that moved none has no field at all.
 *
 * Keys the flight shell reads for anything not in ACTIONS (the sticks,
 * pause, the swap, the avionics and camera ball keys) are RESERVED and
 * cannot be chosen: a moved action there would take the key from them.
 *
 * Pad buttons are padbinds.js, over the same table (src/input/actions.js)
 * and the same rules (src/input/bindings.js).
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

import { ACTIONS as TABLE } from './actions.js';
import { BINDINGS_VERSION, bindingTable } from './bindings.js';

export const KEYBINDS_VERSION = BINDINGS_VERSION;

/* The flight actions a pilot may move to another key, by the default key
 * main.js reads them at (src/input/actions.js). */
export const ACTIONS = TABLE.filter((a) => a.key).map((a) => ({ id: a.id, code: a.key }));

/* Read in flight for something else (src/input/keyboard.js, main.js
 * input.onKey and its held keys, src/ui/keys.js flightKey, the builder,
 * the crash cam's V, push to talk's N (src/share/voice.js PTT_KEY), F3
 * and F8). */
export const RESERVED = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyZ', 'KeyQ', 'KeyE',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
  'Escape', 'Tab', 'BracketLeft', 'BracketRight', 'Space', 'Enter', 'Backspace', 'Backquote',
  'KeyH', 'KeyJ', 'KeyK', 'KeyI', 'KeyU', 'KeyY', 'KeyM', 'KeyB', 'KeyV', 'KeyN', 'Period', 'Equal', 'Minus', 'PageUp', 'PageDown',
  'F3', 'F8',
]);

/* Keys a pilot can choose: letters, digits, the punctuation on the main
 * block and the function keys, less the reserved ones. */
const CHOOSABLE = /^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-2])|Comma|Slash|Semicolon|Quote|Backslash)$/;

const table = bindingTable(ACTIONS.map((a) => ({ id: a.id, def: a.code })), (code) => CHOOSABLE.test(code) && !RESERVED.has(code));

/* Whether any key is moved; settings keep no field until one is. */
export const hasKeybinds = table.has;
export const emptyKeybinds = table.empty;
/* A profile saved before N was reserved may hold an action on N, which
 * took push to talk away in flight; it is dropped, and said so. */
export function normaliseKeybinds(raw) {
  const onN = (m) => Boolean(m) && typeof m === 'object' && Object.values(m).includes('KeyN');
  if (raw && typeof raw === 'object' && (onN(raw.all) || Object.values(raw.by || {}).some(onN))) {
    console.warn('keybinds: a binding on N is dropped; N is push to talk');
  }
  return table.normalise(raw);
}
/* Each action's key on `airframe` (null: the every-aircraft bindings). */
export const effectiveKeys = table.effective;
export const boundForAircraft = table.boundForAircraft;
/* Refused as 'reserved' (the game reads that key for something else) or
 * 'taken' (bindings.js bind). */
export const bind = table.bind;
export const resetAction = table.reset;

/*
 * The code a physical key stands for on `airframe`: the default code of
 * the action bound to it, null for a default key whose action moved away,
 * otherwise the key itself.
 */
export function translate(binds, airframe, code) {
  const eff = effectiveKeys(binds, airframe);
  for (const a of ACTIONS) {
    if (eff[a.id] === code) {
      return a.code;
    }
  }
  if (ACTIONS.some((a) => a.code === code)) {
    return null;
  }
  return code;
}

/* A key code as the pilot reads it on the key: 'KeyR' is R, 'Digit4' 4. */
export function keyLabel(code) {
  const m = /^(?:Key|Digit)(.+)$/.exec(code);
  if (m) {
    return m[1];
  }
  return { Comma: ',', Slash: '/', Semicolon: ';', Quote: "'", Backslash: '\\' }[code] || code;
}
