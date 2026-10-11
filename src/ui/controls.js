/*
 * controls.js: Settings > Controls, where a pilot moves a flight key.
 * The rules (what may be bound, clashes, per aircraft) are
 * src/input/keybinds.js; this is the screen's rows, its press to bind and
 * its word on a refusal. docs/KEYBINDS.md is the contract.
 *
 * A row's Enter (or a click) arms it: the next key binds it, Escape
 * cancels, Backspace puts its default back. The Keys for row says whether
 * a binding is for every aircraft or only the one seated.
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
import { ACTIONS, bind, boundForAircraft, effectiveKeys, hasKeybinds, keyLabel, resetAction } from '../input/keybinds.js';
import { str } from '../strings/index.js';
import { choice } from './rows.js';

export const KEYBIND_PREFIX = 'keybind:';
export const KEYBIND_RESET_ALL = 'keybind:*';

/* The airframe the bindings shown are for, or null for every aircraft. */
const scopeOf = (ui) => (ui.keysScope === 'aircraft' ? ui.settings.airframe : null);

function store(ui, binds) {
  if (hasKeybinds(binds)) {
    ui.settings.keybinds = binds;
  } else {
    delete ui.settings.keybinds;
  }
  ui.persistSettings();
}

export function controlsRows(ui, s) {
  const airframe = scopeOf(ui);
  const keys = effectiveKeys(s.keybinds, airframe);
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
    const own = airframe && boundForAircraft(s.keybinds, airframe, a.id);
    rows.push({
      label: str(`keybinds.${a.id}`),
      value: armed ? str('keybinds.press_a_key') : (own ? str('keybinds.own_key', { key: keyLabel(keys[a.id]) }) : keyLabel(keys[a.id])),
      note: str('keybinds.row_note', { key: keyLabel(a.code) }),
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
    store(ui, undefined);
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
    store(ui, resetAction(ui.settings.keybinds, id, airframe));
    ui.renderMenu();
    return true;
  }
  const got = bind(ui.settings.keybinds, id, code, airframe);
  if (got.ok) {
    store(ui, got.binds);
  } else {
    ui.keybindMsg = got.reason === 'taken'
      ? str('keybinds.taken', { key: keyLabel(code), action: str(`keybinds.${got.other}`) })
      : str('keybinds.reserved', { key: keyLabel(code) });
  }
  ui.renderMenu();
  return true;
}
