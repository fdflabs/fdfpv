/*
 * actions.js: the one table of what a pilot does in flight with a key or a
 * pad button, and the default of each.
 *
 * `key` is the code the readers compare against (main.js input.onKey and
 * input.keys); the pilot may move it (keybinds.js), and the moved key
 * arrives as this code. Null: the action's key is not the pilot's to move
 * (the replay's V is the builder's too, and N talks in the room's menus
 * as well, where the keyboard table does not translate).
 *
 * `pad` is the default button on a pad the browser maps to the W3C
 * standard layout (padbuttons.js names), null for none. Every action may
 * take a pad button (padbinds.js). A pad button bound to an action with a
 * key arrives as that key, pressed and released (InputManager.pollPadKeys),
 * so the key's readers serve the pad too; `own` marks the one action whose
 * pad button has a reader of its own instead (stepping out is a 500 ms hold
 * on the pad, a press on the keyboard). The rest have no key and are read
 * by name: input.padAction(id).
 *
 * A radio's buttons are never read through this table: a radio reports its
 * switches as buttons, latched, in whatever order its firmware chose.
 *
 * A new aircraft's key is one more row here.
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

export const ACTIONS = Object.freeze([
  { id: 'reset', key: 'KeyR', pad: null },
  { id: 'unstick', key: 'KeyX', pad: null },
  { id: 'flip', key: 'KeyT', pad: null },
  { id: 'launch', key: 'KeyL', pad: null },
  { id: 'chute', key: 'KeyP', pad: null },
  { id: 'flaps', key: 'KeyF', pad: null },
  { id: 'gear', key: 'KeyG', pad: null },
  { id: 'smoke', key: 'KeyO', pad: null },
  { id: 'view', key: 'KeyC', pad: null },
  /* Every letter is taken in flight (an action above, or RESERVED), and
   * F, the plan's first pick, is the flaps, which a pilot sets parked. */
  { id: 'foot', key: 'Digit1', pad: 'b', own: true },
  { id: 'replay', key: null, pad: 'x' },
  { id: 'talk', key: null, pad: 'lt' },
  { id: 'swap', key: null, pad: 'y' },
].map((a) => Object.freeze(a)));

export const ACTION_BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));
