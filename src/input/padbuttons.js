/*
 * padbuttons.js: the buttons of a pad the browser reports in the W3C
 * standard layout, by name.
 *
 * The numbers are the Gamepad specification's "Standard Gamepad" mapping
 * (w3.org/TR/gamepad, section Remapping): a browser that sets
 * `mapping === 'standard'` has already put each physical button at this
 * index. Only those pads are read by name; a radio reports its switches as
 * buttons in whatever order its firmware chose, latched, so nothing reads
 * a radio's buttons through this table. The menus' select and back and the
 * joystick picker's answer (menus.js PadMenus, padpick.js) are not in it on
 * purpose: they read the first four buttons of any device by position,
 * radios included.
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

export const PAD_BUTTONS = Object.freeze({
  a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, back: 8, start: 9, ls: 10, rs: 11,
  up: 12, down: 13, left: 14, right: 15,
});
