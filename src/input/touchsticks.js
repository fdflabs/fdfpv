/*
 * touchsticks.js: two on-screen gimbals for flying with thumbs on glass.
 *
 * Each stick is a catchment zone with a drawn plate in the OSD gimbal's
 * style. A thumb that lands anywhere in the zone owns that stick until it
 * lifts; where it landed is the stick's centre, so the pilot never has to
 * find the plate by eye. Sprung channels read the drag from that point and
 * run back to centre when the thumb lifts, like a gimbal spring. Throttle
 * has no spring: it stays where it was left, and a new touch carries on
 * from there instead of snapping to the bottom.
 *
 * The zones answer only to touch pointers, so a touchscreen laptop keeps
 * its mouse and keyboard. The input ladder in input.js reads sample()
 * once a frame; main.js decides visibility and calls paint().
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

import { stickChannels, stickCaption, DEFAULT_STICK_MODE, normaliseStickMode } from './stickmode.js';
import { str } from '../strings/index.js';

/* Full scale per second back towards centre after a lift: about 125 ms
 * from the stop, so the D term sees a ramp instead of a step. */
const RETURN_PER_SEC = 8;

/* Drag for full deflection on a sprung channel, as a share of the plate's
 * width. Half a plate made a millimetre of thumb shake tens of degrees a
 * second on a phone; this gives more glass per degree while the stop stays
 * within a thumb's reach. The floor keeps an unlaid-out or tiny plate from
 * turning a twitch into full stick. */
const SPRUNG_SPAN_OF_WIDTH = 0.72;
const SPRUNG_SPAN_MIN_PX = 40;

/* Throttle spans the plate's full height, bottom to top, with the same
 * kind of floor. */
const THROTTLE_SPAN_MIN_PX = 60;

const CAPTION_SEP = ' · ';

/* A phone or tablet reports touch points; a desktop reports none. A
 * touchscreen laptop reports them too and gets the sticks alongside its
 * keyboard. Some embedded browsers throw on the property itself. */
export function touchWanted() {
  let points = 0;
  try {
    points = Number(navigator.maxTouchPoints) || 0;
  } catch (e) {
    /* No navigator to ask: no thumbs. */
  }
  return points > 0;
}

function node(tag, classes, text) {
  const n = document.createElement(tag);
  n.className = classes;
  if (text !== undefined) {
    n.textContent = text;
  }
  return n;
}

const within = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function mountTouchSticks({ onPause, onSwap } = {}) {
  const root = node('div', 'touch-fly');
  root.hidden = true;

  let layout = stickChannels(DEFAULT_STICK_MODE);
  const value = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };

  /* One gimbal: its elements, and the thumb that holds it, if any. */
  function buildStick(side) {
    const zone = node('div', `touch-zone touch-zone-${side}`);
    const gimbal = node('div', 'touch-gimbal');
    const plate = node('div', 'osd-gimbal-plate touch-plate');
    const nub = node('div', 'osd-nub touch-nub');
    plate.append(node('div', 'osd-cross-x'), node('div', 'osd-cross-y'), nub);
    const cap = node('div', 'osd-gimbal-cap', stickCaption(layout.mode, side, CAPTION_SEP));
    gimbal.append(plate, cap);
    zone.append(gimbal);
    return { side, zone, plate, nub, cap, thumb: null };
  }
  const sticks = [buildStick('left'), buildStick('right')];
  const channelsOf = (stick) => layout[stick.side];

  function letGo(stick) {
    stick.thumb = null;
    stick.plate.classList.remove('is-held');
  }

  /* Releases every thumb and puts the sprung channels straight back to
   * centre; used when the sticks change meaning or leave the screen, where
   * a slow spring would fly the craft on input nobody is giving. */
  function dropAll() {
    for (const stick of sticks) {
      letGo(stick);
    }
    value.roll = 0;
    value.pitch = 0;
    value.yaw = 0;
  }

  function follow(stick, e) {
    const t = stick.thumb;
    const { horiz, vert } = channelsOf(stick);
    value[horiz] = within((e.clientX - t.x0) / t.sprungSpan, -1, 1);
    const dy = e.clientY - t.y0;
    value[vert] = vert === 'throttle'
      ? within(t.throttleAtDown - dy / t.throttleSpan, 0, 1)
      : within(dy / t.sprungSpan, -1, 1);
  }

  for (const stick of sticks) {
    const { zone } = stick;
    zone.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || stick.thumb) {
        return;
      }
      e.preventDefault();
      zone.setPointerCapture(e.pointerId);
      /* Spans are fixed at touchdown so a layout change mid drag cannot
       * move the stick under a still thumb. */
      const box = stick.plate.getBoundingClientRect();
      stick.thumb = {
        id: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        sprungSpan: Math.max(SPRUNG_SPAN_OF_WIDTH * box.width, SPRUNG_SPAN_MIN_PX),
        throttleSpan: Math.max(box.height, THROTTLE_SPAN_MIN_PX),
        throttleAtDown: value.throttle,
      };
      stick.plate.classList.add('is-held');
    });
    zone.addEventListener('pointermove', (e) => {
      if (!stick.thumb || stick.thumb.id !== e.pointerId) {
        return;
      }
      e.preventDefault();
      follow(stick, e);
    });
    const lift = (e) => {
      if (stick.thumb && stick.thumb.id === e.pointerId) {
        letGo(stick);
      }
    };
    zone.addEventListener('pointerup', lift);
    zone.addEventListener('pointercancel', lift);
    /* A long press on glass opens a context menu over the stick. */
    zone.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  const pause = node('button', 'bug-chip touch-pause', str('ui.pause'));
  pause.addEventListener('click', () => {
    if (onPause) {
      onPause();
    }
  });
  const swap = node('button', 'bug-chip touch-swap', str('ui.aircraft'));
  swap.addEventListener('click', () => {
    if (onSwap) {
      onSwap();
    }
  });
  /* Shown by the stylesheet in portrait, where two thumbs do not fit. */
  const rotate = node('div', 'touch-rotate', str('touchsticks.turn_your_phone_sideways_to_fly'));
  root.append(sticks[0].zone, sticks[1].zone, pause, swap, rotate);

  /* Where a channel sits on its plate's vertical, -1 bottom to 1 top.
   * Throttle runs 0 to 1, and pushing a pitch stick up is negative pitch. */
  const upness = (ch) => (ch === 'throttle' ? value.throttle * 2 - 1 : -value[ch]);

  return {
    root,
    active() {
      return !root.hidden;
    },
    /* The sticks as of this frame, after `dtMs` of spring on any channel
     * whose thumb has lifted. Throttle never springs. */
    sample(dtMs) {
      const step = (RETURN_PER_SEC * dtMs) / 1000;
      for (const stick of sticks) {
        if (stick.thumb) {
          continue;
        }
        for (const ch of [channelsOf(stick).horiz, channelsOf(stick).vert]) {
          if (ch !== 'throttle') {
            const v = value[ch];
            value[ch] = v > 0 ? Math.max(0, v - step) : Math.min(0, v + step);
          }
        }
      }
      return { roll: value.roll, pitch: value.pitch, yaw: value.yaw, throttle: value.throttle };
    },
    setStickMode(mode) {
      if (normaliseStickMode(mode) === layout.mode) {
        return;
      }
      layout = stickChannels(mode);
      dropAll();
      for (const stick of sticks) {
        stick.cap.textContent = stickCaption(layout.mode, stick.side, CAPTION_SEP);
      }
    },
    setVisible(on) {
      root.hidden = !on;
      if (!on) {
        dropAll();
      }
    },
    paint() {
      if (root.hidden) {
        return;
      }
      for (const stick of sticks) {
        const { horiz, vert } = channelsOf(stick);
        stick.nub.style.left = `${50 + value[horiz] * 50}%`;
        stick.nub.style.top = `${50 - upness(vert) * 50}%`;
      }
    },
    reset() {
      dropAll();
      value.throttle = 0;
    },
    debug() {
      return {
        visible: !root.hidden,
        channels: { ...value },
        held: { left: Boolean(sticks[0].thumb), right: Boolean(sticks[1].thumb) },
      };
    },
  };
}
