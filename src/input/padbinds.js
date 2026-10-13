/*
 * padbinds.js: the pad buttons a pilot may move, over the same action
 * table as the keys (src/input/actions.js) and the same rules
 * (src/input/bindings.js): for every aircraft or one, no two actions on
 * one button. Stored as settings.padbinds, the shape keybinds has, with
 * button names (padbuttons.js) for codes.
 *
 * Only a pad the browser maps to the W3C standard layout is read by name,
 * so one binding serves every such pad: the layout is the same on each by
 * definition. A radio's switches are never bound.
 *
 * The buttons the flight shell reads for anything else are RESERVED: Start
 * pauses, Back enters the builder, the shoulders step the aircraft swap,
 * and the d-pad, the right trigger and the stick clicks fly the camera
 * ball (main.js ballPad). The left trigger is push to talk's default and
 * the ball's zoom out too, so it stays choosable.
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

import { ACTIONS } from './actions.js';
import { bindingTable } from './bindings.js';
import { PAD_BUTTONS } from './padbuttons.js';

export const PAD_RESERVED = new Set(['start', 'back', 'lb', 'rb', 'up', 'down', 'left', 'right', 'rt', 'ls', 'rs']);

const table = bindingTable(ACTIONS.map((a) => ({ id: a.id, def: a.pad })),
  (name) => Object.hasOwn(PAD_BUTTONS, name) && !PAD_RESERVED.has(name));

export const hasPadbinds = table.has;
export const emptyPadbinds = table.empty;
export const normalisePadbinds = table.normalise;
/* Each action's button name on `airframe`, null for none. */
export const effectiveButtons = table.effective;
export const padBoundForAircraft = table.boundForAircraft;
export const bindButton = table.bind;
export const resetButton = table.reset;

/* The name a pilot reads on the pad: A, LT. Only choosable buttons are
 * ever shown, and each is printed on the pad as these letters. */
export function buttonLabel(name) {
  return name ? name.toUpperCase() : '';
}

/* A pressed button's name, for the screen that binds one: the lowest
 * pressed index of a standard pad, null for none. */
export function buttonName(index) {
  return Object.keys(PAD_BUTTONS).find((n) => PAD_BUTTONS[n] === index) || null;
}
