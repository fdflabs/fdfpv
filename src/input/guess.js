/*
 * guess.js: evidence about whether the AETR guess fits the radio in use.
 *
 * An uncalibrated radio flies on AETR, which is right for most
 * transmitters in USB joystick mode and wrong for some. Two cheap
 * observations tell a pilot's radio from somebody else's without asking
 * them to calibrate:
 *
 *   A throttle does not spring back. On a real transmitter the axis AETR
 *   calls the throttle sits parked near one end with nobody touching it;
 *   on a gamepad that axis is half of a sprung stick and rests at zero.
 *   Seeing it parked once makes the guess trustworthy for the menus.
 *
 *   Yaw has to move eventually. If the axis AETR calls yaw has never left
 *   centre while some axis AETR does not use at all has swept a stick's
 *   worth through enough distinct levels to be a gimbal (not a switch),
 *   the pilot is flying with no yaw and is told so. Yaw moving even once
 *   settles the question for good and takes the warning down.
 *
 * Both verdicts are sticky, because a warning that blinks is worse than
 * either answer, and both start again with a different device or a
 * different map. Neither runs on a map known to fit (a calibration or a
 * standard gamepad's layout), whose sprung sticks would only mislead it.
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

/* Further than this from centre, the guessed throttle axis is parked. */
const PARKED = 0.35;
/* Yaw has moved once it has swept this far. */
const YAW_MOVED = 0.30;
/* An unused axis that swept this far, through at least this many levels
 * of LEVEL_SIZE, is a gimbal the guess cannot see. A switch has two or
 * three levels; jitter on a float axis cannot make six. */
const STRAY_SWEEP = 0.55;
const STRAY_LEVELS = 6;
const LEVEL_SIZE = 1 / 16;
const AXES_WATCHED = 8;

const axisOf = (spec) => (spec && Number.isInteger(spec.axis) ? spec.axis : -1);

export class GuessEvidence {
  constructor() {
    this.forget();
  }

  forget() {
    this.parked = false;
    this.ranges = null;
    this.yawMoved = false;
    this.noYaw = false;
  }

  /* One reading of `gp` through `map`. */
  observe(gp, map) {
    this.watchThrottle(gp, map);
    this.watchYaw(gp, map);
  }

  watchThrottle(gp, map) {
    const axis = axisOf(map.throttle);
    if (this.parked || axis < 0 || axis >= gp.axes.length) {
      return;
    }
    this.parked = Math.abs(gp.axes[axis]) > PARKED;
  }

  watchYaw(gp, map) {
    if (this.yawMoved) {
      return;
    }
    const n = Math.min(gp.axes.length, AXES_WATCHED);
    if (!this.ranges || this.ranges.length !== n) {
      this.ranges = Array.from({ length: n }, (_, i) => ({ lo: gp.axes[i], hi: gp.axes[i], levels: new Set() }));
    }
    for (let i = 0; i < n; i += 1) {
      const r = this.ranges[i];
      const v = gp.axes[i];
      if (v < r.lo) {
        r.lo = v;
      }
      if (v > r.hi) {
        r.hi = v;
      }
      if (r.levels.size < STRAY_LEVELS) {
        r.levels.add(Math.round(v / LEVEL_SIZE));
      }
    }
    const yaw = axisOf(map.yaw);
    if (yaw < 0 || yaw >= n) {
      return;
    }
    const swept = (r) => r.hi - r.lo;
    if (swept(this.ranges[yaw]) >= YAW_MOVED) {
      this.yawMoved = true;
      this.noYaw = false;
      return;
    }
    if (this.noYaw) {
      return;
    }
    const used = new Set(['throttle', 'roll', 'pitch', 'yaw'].map((ch) => axisOf(map[ch])));
    this.noYaw = this.ranges.some((r, i) => !used.has(i) && swept(r) >= STRAY_SWEEP && r.levels.size >= STRAY_LEVELS);
  }
}
