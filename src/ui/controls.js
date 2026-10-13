/*
 * controls.js: Settings > Controls, where a pilot moves a flight key or
 * pad button. The actions are src/input/actions.js; the rules (what may be
 * bound, clashes, per aircraft) are src/input/keybinds.js and padbinds.js;
 * this is the screen's rows, its press to bind and its word on a refusal.
 * docs/KEYBINDS.md is the contract.
 *
 * A row's Enter (or a click, or a pad's A) arms it: the next key or
 * standard pad button binds it, Escape cancels, Backspace puts its
 * defaults back. The Keys for row says whether a binding is for every
 * aircraft or only the one seated.
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

import { airframeById } from '../../configs/airframes.js';
import { ACTIONS } from '../input/actions.js';
import { bind, boundForAircraft, effectiveKeys, hasKeybinds, keyLabel, resetAction } from '../input/keybinds.js';
import {
  bindButton, buttonLabel, buttonName, effectiveButtons, hasPadbinds, padBoundForAircraft, resetButton,
} from '../input/padbinds.js';
import { str } from '../strings/index.js';
import { choice } from './rows.js';

export const KEYBIND_PREFIX = 'keybind:';
export const KEYBIND_RESET_ALL = 'keybind:*';

/* The airframe the bindings shown are for, or null for every aircraft. */
const scopeOf = (ui) => (ui.keysScope === 'aircraft' ? ui.settings.airframe : null);

/* settings.keybinds and settings.padbinds are absent until something
 * moves, so a profile that moved nothing is stored as before. */
function store(ui, field, binds, has) {
  if (has(binds)) {
    ui.settings[field] = binds;
  } else {
    delete ui.settings[field];
  }
  ui.persistSettings();
}
const storeKeys = (ui, binds) => store(ui, 'keybinds', binds, hasKeybinds);
const storePad = (ui, binds) => store(ui, 'padbinds', binds, hasPadbinds);

/* "R", "R, pad A", "Pad X": the key and the button an action is on. */
function controlLabel(key, pad) {
  if (key && pad) {
    return str('keybinds.key_and_pad', { key, pad });
  }
  return key || str('keybinds.pad_button', { pad });
}

export function controlsRows(ui, s) {
  const airframe = scopeOf(ui);
  const keys = effectiveKeys(s.keybinds, airframe);
  const pads = effectiveButtons(s.padbinds, airframe);
  const plane = airframeById(s.airframe).name;
  const rows = [
    choice(str('keybinds.scope'), str('keybinds.scope_note'), ['all', 'aircraft'], airframe ? 'aircraft' : 'all',
      (id) => (id === 'all' ? str('keybinds.scope_all') : plane), (id) => {
        ui.keysScope = id;
        ui.binding = null;
      }),
  ];
  if (ui.keybindMsg) {
    rows.push({ label: str('keybinds.refused'), value: '', note: ui.keybindMsg, info: true });
  }
  for (const a of ACTIONS) {
    const armed = ui.binding === a.id;
    const own = airframe && (boundForAircraft(s.keybinds, airframe, a.id) || padBoundForAircraft(s.padbinds, airframe, a.id));
    const now = controlLabel(a.key && keyLabel(keys[a.id]), buttonLabel(pads[a.id]));
    rows.push({
      label: str(`keybinds.${a.id}`),
      value: armed ? str(a.key ? 'keybinds.press_a_key' : 'keybinds.press_a_button') : (own ? str('keybinds.own_key', { key: now }) : now),
      note: str(a.key ? 'keybinds.row_note' : 'keybinds.row_note_pad', { key: controlLabel(a.key && keyLabel(a.key), buttonLabel(a.pad)) }),
      action: `${KEYBIND_PREFIX}${a.id}`,
    });
  }
  rows.push({ label: str('keybinds.reset_all'), note: str('keybinds.reset_all_note'), action: KEYBIND_RESET_ALL });
  rows.push({ label: str('ui.back'), action: 'back' });
  return rows;
}

/* A row pressed: arm it, or with the reset row, put every key back. */
export function keybindAction(ui, action, id) {
  ui.keybindMsg = null;
  if (action === KEYBIND_RESET_ALL) {
    ui.binding = null;
    storeKeys(ui, undefined);
    storePad(ui, undefined);
  } else {
    ui.binding = ui.binding === id ? null : id;
  }
  ui.renderMenu();
}

/* The key after a row was armed. True: the screen took it. */
export function bindKey(ui, code) {
  if (!ui.binding || ui.screen !== 'controls') {
    return false;
  }
  const id = ui.binding;
  const airframe = scopeOf(ui);
  ui.binding = null;
  ui.keybindMsg = null;
  if (code === 'Escape') {
    ui.renderMenu();
    return true;
  }
  if (code === 'Backspace') {
    if (ACTIONS.find((a) => a.id === id).key) {
      storeKeys(ui, resetAction(ui.settings.keybinds, id, airframe));
    }
    storePad(ui, resetButton(ui.settings.padbinds, id, airframe));
    ui.renderMenu();
    return true;
  }
  if (!ACTIONS.find((a) => a.id === id).key) {
    ui.keybindMsg = str('keybinds.pad_only', { action: str(`keybinds.${id}`) });
    ui.renderMenu();
    return true;
  }
  const got = bind(ui.settings.keybinds, id, code, airframe);
  if (got.ok) {
    storeKeys(ui, got.binds);
  } else {
    ui.keybindMsg = got.reason === 'taken'
      ? str('keybinds.taken', { key: keyLabel(code), action: str(`keybinds.${got.other}`) })
      : str('keybinds.reserved', { key: keyLabel(code) });
  }
  ui.renderMenu();
  return true;
}

/*
 * A standard pad's buttons (input.padHeld) while a row is armed, every
 * frame in place of the menus' pad: the first press binds the row, and
 * the menus then only learn what is still held, so that press does not
 * also select a row. True: the screen took the pad this frame. With no
 * standard pad the menus keep it (a radio's switches are never bound).
 */
export function bindPad(ui, held) {
  if (!ui.binding || ui.screen !== 'controls' || !held.length) {
    ui.padBindWas = null;
    return false;
  }
  const was = ui.padBindWas;
  ui.padBindWas = held;
  /* The press that armed the row may still be down. */
  if (!was) {
    return true;
  }
  const name = buttonName(held.findIndex((on, i) => on && !was[i]));
  if (!name) {
    return true;
  }
  const id = ui.binding;
  ui.binding = null;
  ui.padBindWas = null;
  ui.padRearm = true;
  const got = bindButton(ui.settings.padbinds, id, name, scopeOf(ui));
  if (got.ok) {
    storePad(ui, got.binds);
  } else {
    ui.keybindMsg = got.reason === 'taken'
      ? str('keybinds.taken', { key: buttonLabel(name), action: str(`keybinds.${got.other}`) })
      : str('keybinds.pad_reserved', { button: buttonLabel(name) });
  }
  ui.renderMenu();
  return true;
}
