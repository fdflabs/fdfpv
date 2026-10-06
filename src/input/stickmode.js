/*
 * stickmode.js: which thumb flies which channel.
 *
 * The four transmitter modes are two independent swaps. Modes 1 and 2 put
 * yaw on the left stick's horizontal and roll on the right's; Modes 3 and
 * 4 trade them. Modes 2 and 4 put throttle on the left stick's vertical
 * and pitch on the right's; Modes 1 and 3 trade those. So a layout is two
 * bits, and the right stick is always whatever the left one is not.
 *
 * Every consumer (keyboard, touch sticks, the calibration wizard, the
 * Settings captions) asks here instead of keeping its own copy, so the
 * layouts cannot drift apart. The mode arrives from stored settings and
 * may be a number, a numeric string or rubbish; anything that is not one
 * of the four is the default.
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

/* Settings cycles through this list in order. */
export const STICK_MODES = [1, 2, 3, 4];

/* Mode 2 is what nearly every FPV pilot flies. */
export const DEFAULT_STICK_MODE = 2;

/* Number() rather than parseInt: a stored ' 4' is Mode 4, '2x' is not a
 * mode at all. */
export function normaliseStickMode(mode) {
  const n = Number(mode);
  return STICK_MODES.includes(n) ? n : DEFAULT_STICK_MODE;
}

const yawOnLeft = (mode) => mode <= 2;
const throttleOnLeft = (mode) => mode % 2 === 0;

/* A fresh object every call, because callers keep and edit the layout. */
export function stickChannels(mode) {
  const m = normaliseStickMode(mode);
  const [leftH, rightH] = yawOnLeft(m) ? ['yaw', 'roll'] : ['roll', 'yaw'];
  const [leftV, rightV] = throttleOnLeft(m) ? ['throttle', 'pitch'] : ['pitch', 'throttle'];
  return {
    mode: m,
    left: { horiz: leftH, vert: leftV },
    right: { horiz: rightH, vert: rightV },
  };
}

/* Channels that are not on a stick at all (aux switches) report 'right',
 * which is where the screens draw everything that is not the left stick. */
export function stickSideOf(mode, channel) {
  const { left } = stickChannels(mode);
  return channel === left.horiz || channel === left.vert ? 'left' : 'right';
}

/* "Yaw, throttle": horizontal first, capitalised. Channel names stay
 * English in every locale; the sentence around them is translated. */
export function stickCaption(mode, side, sep = ', ') {
  const layout = stickChannels(mode);
  const stick = side === 'right' ? layout.right : layout.left;
  return `${stick.horiz[0].toUpperCase()}${stick.horiz.slice(1)}${sep}${stick.vert}`;
}
