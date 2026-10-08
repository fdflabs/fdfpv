/*
 * menus.js: a joystick driving the menus.
 *
 * SELECT AND BACK. Button 1 goes back and buttons 0, 2 and 3 select. Not
 * every button: a radio in joystick mode reports its switches as buttons,
 * and a latched arm switch reads as pressed for ever. For the same reason
 * nothing counts until the pad has been seen with those four released.
 *
 * A RADIO WITH NO BUTTONS AT ALL reports every switch as an axis. Once a
 * menu switch is assigned in the wizard it selects whenever it is thrown
 * past the cursor's own threshold. Until then any axis held away from
 * where it rested for SELECT_HOLD_MS presses once, and not again until it
 * comes back, so a flick moves the cursor and a hold presses.
 *
 * THE CURSOR on a radio whose axis order is not known yet: any axis pushed
 * away from where it rested moves it, and the sign of that push is the
 * direction. Calibration is itself a menu item, so the menus cannot wait
 * for calibration.
 *
 * STANDARD GAMEPAD EXTRAS (the aircraft swap, the hangar camera) are bound
 * to button numbers only on a pad that reports the standard layout: on a
 * radio a button number can be the arm switch.
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

import { centredReading } from './padmap.js';

/* How far a stick has to leave rest to count as a menu keypress. main.js
 * reads the same number for its own stick navigation. */
export const NAV_DEFLECT = 0.55;
const SELECT_HOLD_MS = 700;
/* The hold clock never advances more than this per read, so a tab coming
 * back from the background does not arrive with a press already banked. */
const HOLD_STEP_MAX_MS = 100;
/* The hangar camera ignores the middle fifth of the right stick. */
const LOOK_DEADZONE = 0.2;

const NOTHING = () => ({ select: false, back: false });
const pressed = (gp, i) => Boolean(gp.buttons[i] && gp.buttons[i].pressed);
const standard = (gp) => Boolean(gp) && gp.mapping === 'standard';

/* Y opens the aircraft picker, the shoulders step through it. */
export function swapButtons(gp) {
  if (!standard(gp) || !gp.buttons) {
    return null;
  }
  return { open: pressed(gp, 3), prev: pressed(gp, 4), next: pressed(gp, 5) };
}

/* X, which the aircraft picker takes as Customise. */
export function altButton(gp) {
  return standard(gp) && Boolean(gp.buttons) && pressed(gp, 2);
}

/* Y, which the aircraft picker takes as its Floats switch. */
export function floatsButton(gp) {
  return standard(gp) && Boolean(gp.buttons) && pressed(gp, 3);
}

/* The right stick pressed in (R3), which the hangar takes as Flip. */
export function lookClick(gp) {
  return standard(gp) && Boolean(gp.buttons) && pressed(gp, 11);
}

/* The right stick, right and down positive, for orbiting the hangar. */
export function lookStick(gp) {
  if (!standard(gp) || !gp.axes || gp.axes.length < 4) {
    return { x: 0, y: 0 };
  }
  const live = (v) => (Math.abs(v) < LOOK_DEADZONE ? 0 : v);
  return { x: live(gp.axes[2] || 0), y: live(gp.axes[3] || 0) };
}

export class PadMenus {
  constructor() {
    this.armed = false;
    this.rest = null;
    this.heldMs = 0;
    this.pressedOnce = false;
    this.lastAt = 0;
  }

  /* A different device starts again: its rest, its arming. A hold in
   * progress needs nothing, because without a rest it cannot count. */
  forget() {
    this.armed = false;
    this.rest = null;
  }

  /* Select and back, as levels; the caller turns them into edges.
   * `switchSpec` is the assigned menu switch, if any. */
  buttons(gp, switchSpec) {
    if (gp && gp.axes && !(gp.buttons && gp.buttons.length)) {
      return { select: switchSpec ? switchThrown(gp, switchSpec) : this.holdToSelect(gp), back: false };
    }
    if (!gp || !gp.buttons) {
      /* Disarm too: a pad unplugged with a switch held must earn its
       * arming again when it comes back. */
      this.armed = false;
      return NOTHING();
    }
    const b = [0, 1, 2, 3].map((i) => pressed(gp, i));
    if (!this.armed) {
      this.armed = !b.some(Boolean);
      return NOTHING();
    }
    return { select: b[0] || b[2] || b[3], back: b[1] };
  }

  /* On its own clock: nothing here reaches the flight path. */
  holdToSelect(gp) {
    const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    const stepMs = this.lastAt ? Math.min(HOLD_STEP_MAX_MS, Math.max(0, now - this.lastAt)) : 0;
    this.lastAt = now;
    const off = this.rest && this.rest.length === gp.axes.length ? furthest(gp.axes, this.rest) : -1;
    if (off < NAV_DEFLECT) {
      this.heldMs = 0;
      this.pressedOnce = false;
      return false;
    }
    this.heldMs += stepMs;
    if (this.heldMs < SELECT_HOLD_MS || this.pressedOnce) {
      return false;
    }
    this.pressedOnce = true;
    return true;
  }

  /* Up and down from whichever axis is furthest from where the sticks
   * rested when first seen; no device forgets that rest. */
  cursor(gp) {
    if (!gp) {
      this.rest = null;
      return { up: false, down: false };
    }
    if (!this.rest || this.rest.length !== gp.axes.length) {
      this.rest = Array.from(gp.axes);
      return { up: false, down: false };
    }
    let push = 0;
    for (let i = 0; i < gp.axes.length; i += 1) {
      const d = gp.axes[i] - this.rest[i];
      if (Math.abs(d) > Math.abs(push)) {
        push = d;
      }
    }
    return { up: push > NAV_DEFLECT, down: push < -NAV_DEFLECT };
  }
}

function furthest(axes, rest) {
  let far = 0;
  for (let i = 0; i < axes.length; i += 1) {
    const d = Math.abs(axes[i] - rest[i]);
    if (d > far) {
      far = d;
    }
  }
  return far;
}

/* The menu switch reads through the same centring as a gimbal, so a switch
 * assigned by flicking it up reads positive when up. */
function switchThrown(gp, spec) {
  if (!Number.isInteger(spec.axis) || spec.axis >= gp.axes.length) {
    return false;
  }
  return centredReading(gp.axes[spec.axis], spec) >= NAV_DEFLECT;
}
