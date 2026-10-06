/*
 * keyboard.js: two sticks made of keys.
 *
 * WASD is the left gimbal and the arrows the right one; the pilot's stick
 * mode decides which channel each carries (see stickmode.js). Forward is
 * the up key on both, so the vertical pair is read by direction: forward
 * on a pitch stick is nose down, the negative end, while forward on a
 * throttle is more throttle.
 *
 * A key is digital and a stick is not, so HOW LONG a key is held is the
 * analog. A tap nudges, a short hold settles at a flyable cruise and stays
 * there, and only a long hold reaches the stop. Letting go springs the
 * channel back to centre. The hold clock advances at most 40 ms per read
 * and the spring at most 0.18 of travel, so a slow frame can neither skip
 * the nudge band nor fling the stick.
 *
 * The throttle has two behaviours. Over a radio or the mouse it is a
 * latched slider the keys move at a fixed rate. As the only stick it is a
 * collective: the same hold-time analog, resting at zero on the ground and
 * at hover once the craft has left it, so letting go holds height. Launch
 * control pins the rest to zero so a tap cannot fire a launch.
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

import { stickChannels } from './stickmode.js';

const PADS = {
  left: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' },
  right: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' },
};

/*
 * Stick travel against hold time, as [ms, travel] corners joined by
 * straight lines: a ~90 ms tap is 0.16, 240 ms is a 0.34 cruise that holds
 * through 750 ms, and full travel takes 1250 ms.
 */
const HOLD_CURVE = [[0, 0], [90, 0.16], [240, 0.34], [750, 0.34], [1250, 1]];

export function travelForHold(ms) {
  if (ms <= 0) {
    return 0;
  }
  const last = HOLD_CURVE[HOLD_CURVE.length - 1];
  if (ms >= last[0]) {
    return last[1];
  }
  let k = 1;
  while (ms > HOLD_CURVE[k][0]) {
    k += 1;
  }
  const [x0, y0] = HOLD_CURVE[k - 1];
  const [x1, y1] = HOLD_CURVE[k];
  return y0 + (y1 - y0) * ((ms - x0) / (x1 - x0));
}

/* The forward and back keys of whichever gimbal carries the throttle in
 * `mode`. main.js names the key on the first flight's card. */
export function throttleKeys(mode) {
  const { left } = stickChannels(mode);
  const keys = left.vert === 'throttle' ? PADS.left : PADS.right;
  return { up: keys.up, down: keys.down };
}

const SPRING_PER_SEC = 9;
const SLIDER_PER_SEC = 0.9;
const COLLECTIVE_SPRING_PER_SEC = 2.6;
const MOST_PER_READ = 0.18;
const HOLD_CLOCK_MAX_MS = 40;
/* A hair over the five inch's measured hover, 0.2051, so letting go holds
 * height rather than sinking. */
const HOVER = 0.22;
/* Released above this after a climb, the craft counts as airborne. */
const AIRBORNE = 0.18;
/* A descent this close to zero is a landing. */
const LANDED = 0.04;

/* Steps v toward target without passing it; v already there is returned
 * as it is, so a -0 stays -0 and the poll sees no change. */
function toward(v, target, by) {
  if (v > target) {
    return Math.max(target, v - by);
  }
  return v < target ? Math.min(target, v + by) : v;
}

export class KeyboardSticks {
  constructor(mode) {
    this.stick = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
    this.pressMs = { roll: 0, pitch: 0, yaw: 0 };
    this.pressSign = { roll: 0, pitch: 0, yaw: 0 };
    this.upMs = 0;
    this.downMs = 0;
    this.airborne = false;
    /* Set once the throttle keys have actually flown the collective, so a
     * throttle written from outside (a harness stick) is not sprung away. */
    this.collectiveUsed = false;
    this.padRest = false;
    this.setMode(mode);
  }

  /* [channel, negative key, positive key] for every sprung channel, and
   * the forward and back keys of whichever gimbal carries the throttle. */
  setMode(mode) {
    const layout = stickChannels(mode);
    this.springs = [];
    this.throttlePair = throttleKeys(mode);
    for (const side of ['left', 'right']) {
      const keys = PADS[side];
      const { horiz, vert } = layout[side];
      this.springs.push([horiz, keys.left, keys.right]);
      if (vert !== 'throttle') {
        this.springs.push([vert, keys.up, keys.down]);
      }
    }
  }

  /* After a mode change a key may now mean another channel, so every
   * sprung channel starts again from centre. The collective carries over. */
  centreSprings() {
    for (const ch of ['roll', 'pitch', 'yaw']) {
      this.stick[ch] = 0;
      this.pressMs[ch] = 0;
      this.pressSign[ch] = 0;
    }
  }

  reset() {
    Object.assign(this.stick, { roll: 0, pitch: 0, yaw: 0, throttle: 0 });
    this.pressMs = { roll: 0, pitch: 0, yaw: 0 };
    this.pressSign = { roll: 0, pitch: 0, yaw: 0 };
    this.upMs = 0;
    this.downMs = 0;
    this.airborne = false;
    this.collectiveUsed = false;
    this.padRest = false;
  }

  /*
   * One read, `dtMs` after the last. `down(code)` says whether a stick key
   * is held (a mouse button standing in for a rudder key counts);
   * `keyDown(code)` is the keyboard alone, which is all the throttle
   * listens to. With `collective` false the throttle is the latched slider.
   */
  read(dtMs, down, keyDown, collective) {
    const holdStep = Math.min(dtMs, HOLD_CLOCK_MAX_MS);
    const seconds = dtMs / 1000;
    for (const [ch, minusKey, plusKey] of this.springs) {
      const sign = (down(plusKey) ? 1 : 0) - (down(minusKey) ? 1 : 0);
      if (sign === 0) {
        this.pressMs[ch] = 0;
        this.pressSign[ch] = 0;
        this.stick[ch] = toward(this.stick[ch], 0, Math.min(SPRING_PER_SEC * seconds, MOST_PER_READ));
        continue;
      }
      if (sign !== this.pressSign[ch]) {
        this.pressSign[ch] = sign;
        this.pressMs[ch] = 0;
      }
      this.pressMs[ch] += holdStep;
      this.stick[ch] = sign * travelForHold(this.pressMs[ch]);
    }
    const up = keyDown(this.throttlePair.up);
    const back = keyDown(this.throttlePair.down);
    if (collective) {
      this.flyCollective(holdStep, up, back, Math.min(COLLECTIVE_SPRING_PER_SEC * seconds, MOST_PER_READ));
    } else {
      const push = (up ? 1 : 0) - (back ? 1 : 0);
      this.stick.throttle = Math.max(0, Math.min(1, this.stick.throttle + push * Math.min(SLIDER_PER_SEC * seconds, MOST_PER_READ)));
    }
    return { ...this.stick };
  }

  flyCollective(holdStep, up, back, springBy) {
    /* Where rest is for this whole read; becoming airborne below takes
     * effect from the next one. */
    const rest = !this.padRest && this.airborne ? HOVER : 0;
    if (up !== back) {
      this.collectiveUsed = true;
      if (up) {
        this.upMs += holdStep;
        this.downMs = 0;
        const travel = travelForHold(this.upMs);
        this.stick.throttle = rest ? HOVER + travel * (1 - HOVER) : travel;
        return;
      }
      this.downMs += holdStep;
      this.upMs = 0;
      this.stick.throttle = rest * (1 - travelForHold(this.downMs));
      if (this.stick.throttle <= LANDED) {
        this.airborne = false;
        this.stick.throttle = 0;
      }
      return;
    }
    if (up) {
      this.collectiveUsed = true;
    }
    if (!this.padRest && this.upMs > 0 && this.stick.throttle >= AIRBORNE) {
      this.airborne = true;
    }
    this.upMs = 0;
    this.downMs = 0;
    if (this.collectiveUsed) {
      this.stick.throttle = toward(this.stick.throttle, rest, springBy);
    }
  }
}
