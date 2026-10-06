/*
 * calibrate.js: the stick calibration wizard, and the check screen that
 * can also be opened on its own over a saved map.
 *
 * The wizard learns a map the way a transmitter's own calibration does,
 * one thing at a time, and never takes the next question until the sticks
 * are back where they rest:
 *
 *   centre    both gimbals still, throttle down, until the reading holds
 *             steady; that reading is rest
 *   sweep     every stick through its full travel, so each axis's two
 *             ends are known, then back to rest
 *   throttle, roll, pitch, yaw
 *             one named deflection each: the axis that moved, clearly
 *             further than any other, held for a moment, is that channel,
 *             and the direction pushed is its positive end
 *   select    only for a radio with no buttons and an axis to spare: the
 *             switch the pilot wants to press menus with
 *   confirm   live sticks through the new map; Save keeps it
 *
 * Nothing reaches the flying map until Save, so cancelling part way never
 * leaves half a mapping in the sticks.
 *
 * A throttle needs two kinds of care. A radio's has no spring and stays at
 * the bottom; a gamepad's springs to the middle, and if zero stays at the
 * bottom of its travel the craft takes off by itself. Where the throttle
 * settles when the pilot lets go tells the two apart, and a sprung one gets
 * zero at its rest. When that cannot be told (a pilot holding a sprung
 * throttle down because the prompt said so), the check screen shows the
 * throttle reading and offers to put zero where the stick is.
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

import { str } from '../strings/index.js';
import { stickCaption, stickSideOf } from './stickmode.js';
import {
  builtInMap, normaliseMap, reversals, readSticks,
} from './padmap.js';
import { watchedAxes, furthestFromRest } from './padpick.js';

export const CAL_STEPS = ['center', 'sweep', 'throttle', 'roll', 'pitch', 'yaw', 'confirm'];
export const SELECT_STEP = 'select';

/* The four channels the wizard asks for, in the order it asks. */
const ASKED = ['throttle', 'roll', 'pitch', 'yaw'];

/* Raw axis units unless noted. */
const STEADY_NOISE = 0.08;
const STEADY_MS = 900;
const FULL_TRAVEL = 0.55;
const AT_REST = 0.2;
const SWEEP_SETTLE_MS = 450;
const MOVED = 0.45;
const CLEAR_LEAD = 0.18;
const MOVED_FOR_MS = 400;
const RELEASED_FOR_MS = 280;
/* A rest further than this from the low end means the throttle springs. */
const SPRUNG_REST = 0.35;
/* Channel units, 0 to 1: a throttle above this at rest flies the craft. */
const IDLE_THROTTLE = 0.12;
/* Moving zero must leave at least this much travel. */
const LEAST_THROTTLE_RANGE = 0.3;
/* Channel units: naming the stick being moved on the check step asks the
 * same question as the identify steps, with the same feel. */
const NAMED = 0.45;
const NAMED_LEAD = 0.18;

/*
 * The steps for a given radio. A radio with buttons, or with no axis left
 * over once the four gimbal channels have theirs, is not asked for a menu
 * switch: the first does not need one and the second could never answer.
 */
export function calSteps(hasButtons, axisCount = 0) {
  if (hasButtons || axisCount <= ASKED.length) {
    return CAL_STEPS;
  }
  return [...CAL_STEPS.slice(0, -1), SELECT_STEP, 'confirm'];
}

/* The axes a draft has already given to a channel (or to the menu switch). */
function claimedAxes(draft) {
  const claimed = new Set();
  for (const ch of [...ASKED, SELECT_STEP]) {
    if (draft[ch] && Number.isInteger(draft[ch].axis)) {
      claimed.add(draft[ch].axis);
    }
  }
  return claimed;
}

/*
 * The unclaimed axis furthest from rest, how far, and how far the runner
 * up is. A move only counts when it leads the runner up clearly, so a
 * diagonal assigns nothing.
 */
function leadingAxis(axes, rest, claimed) {
  const lead = { axis: -1, by: 0, next: 0 };
  for (let i = 0; i < Math.min(axes.length, rest.length); i += 1) {
    if (claimed.has(i)) {
      continue;
    }
    const d = Math.abs(axes[i] - rest[i]);
    if (d > lead.by) {
      lead.next = lead.by;
      lead.by = d;
      lead.axis = i;
    } else if (d > lead.next) {
      lead.next = d;
    }
  }
  return lead;
}

/* The channel the pilot is moving on the check step, or null when none
 * leads clearly. */
function movingChannel(channels) {
  let name = null;
  let mag = 0;
  let next = 0;
  for (const ch of ASKED) {
    const m = Math.abs(channels[ch] || 0);
    if (m > mag) {
      next = mag;
      mag = m;
      name = ch;
    } else if (m > next) {
      next = m;
    }
  }
  return name && mag >= NAMED && mag - next >= NAMED_LEAD ? name : null;
}

const fullTravelCount = (low, high) => low.filter((v, i) => high[i] - v >= FULL_TRAVEL).length;

export class CalibrationWizard {
  /* A fresh run on `gp` (which may be absent; the wizard then waits). */
  static fresh(gp) {
    const steps = calSteps(Boolean(gp && gp.buttons && gp.buttons.length), gp ? watchedAxes(gp).length : 0);
    return new CalibrationWizard('center', steps, {
      roll: null, pitch: null, yaw: null, throttle: null, select: null, reverse: reversals(null),
    }, null);
  }

  /* The check step alone, over a saved map, with rest taken from where the
   * sticks are now: there is no centre step to measure it. */
  static checkOf(gp, map) {
    const w = new CalibrationWizard('confirm', ['confirm'], normaliseMap(map), watchedAxes(gp));
    w.checkOnly = true;
    return w;
  }

  constructor(step, steps, draft, rest) {
    this.step = step;
    this.phase = 'hold';
    this.steps = steps;
    this.draft = draft;
    this.waiting = false;
    this.checkOnly = false;
    this.timerMs = 0;
    this.rest = rest ? rest.slice() : null;
    this.low = rest ? rest.slice() : null;
    this.high = rest ? rest.slice() : null;
    this.steadyAt = null;
    this.parked = null;
  }

  advance() {
    this.step = this.steps[this.steps.indexOf(this.step) + 1] || 'confirm';
    this.phase = 'hold';
    this.timerMs = 0;
  }

  /* Holds the timer while `ok`, resets it otherwise; true once it has run
   * for `ms`. */
  sustained(ok, dtMs, ms) {
    if (!ok) {
      this.timerMs = 0;
      return false;
    }
    this.timerMs += dtMs;
    return this.timerMs >= ms;
  }

  poll(gp, dtMs) {
    if (!gp) {
      this.waiting = true;
      return;
    }
    this.waiting = false;
    const axes = watchedAxes(gp);
    if (this.rest) {
      /* Comparisons rather than Math.min and max, so a NaN reading never
       * erases a range already seen. */
      for (let i = 0; i < Math.min(axes.length, this.low.length); i += 1) {
        if (axes[i] < this.low[i]) {
          this.low[i] = axes[i];
        }
        if (axes[i] > this.high[i]) {
          this.high[i] = axes[i];
        }
      }
    }
    if (this.step === 'center') {
      this.findRest(axes, dtMs);
    } else if (this.step === 'sweep') {
      this.watchSweep(axes, dtMs);
    } else if (this.step !== 'confirm') {
      this.identify(axes, dtMs);
    }
  }

  findRest(axes, dtMs) {
    const g = this.steadyAt;
    if (!g || g.length !== axes.length || furthestFromRest(axes, g) > STEADY_NOISE) {
      this.steadyAt = axes.slice();
      this.timerMs = 0;
      return;
    }
    this.timerMs += dtMs;
    if (this.timerMs < STEADY_MS) {
      return;
    }
    this.rest = g.slice();
    this.low = g.slice();
    this.high = g.slice();
    this.step = 'sweep';
    this.timerMs = 0;
  }

  /*
   * Enough full travel, then back to rest. One axis may come back to
   * somewhere new, because a throttle without a spring stays wherever the
   * thumb left it; it has to hold as still as the centre step demanded,
   * and where it stopped becomes its rest.
   */
  watchSweep(axes, dtMs) {
    const away = [];
    axes.forEach((v, i) => {
      if (Math.abs(v - this.rest[i]) >= AT_REST) {
        away.push(i);
      }
    });
    const alone = away.length === 1 ? away[0] : -1;
    let shifted = false;
    if (alone >= 0) {
      const p = this.parked;
      shifted = !p || p.axis !== alone || Math.abs(axes[alone] - p.at) > STEADY_NOISE;
      if (shifted) {
        this.parked = { axis: alone, at: axes[alone] };
      }
    }
    const ready = fullTravelCount(this.low, this.high) >= Math.min(4, this.low.length) && away.length <= 1 && !shifted;
    if (!this.sustained(ready, dtMs, alone >= 0 ? STEADY_MS : SWEEP_SETTLE_MS)) {
      return;
    }
    if (alone >= 0) {
      this.rest[alone] = this.parked.at;
    }
    this.step = 'throttle';
    this.phase = 'hold';
    this.timerMs = 0;
  }

  identify(axes, dtMs) {
    const ch = this.step;
    if (this.phase === 'hold') {
      const lead = leadingAxis(axes, this.rest, claimedAxes(this.draft));
      const clear = lead.axis >= 0 && lead.by >= MOVED && lead.by - lead.next >= CLEAR_LEAD;
      if (this.sustained(clear, dtMs, MOVED_FOR_MS)) {
        this.draft[ch] = this.specFor(ch, lead.axis, axes[lead.axis]);
        this.phase = 'release';
        this.timerMs = 0;
      }
      return;
    }
    const spec = this.draft[ch];
    if (!this.sustained(this.released(axes, spec), dtMs, RELEASED_FOR_MS)) {
      return;
    }
    if (ch === 'throttle' && spec) {
      this.judgeThrottle(spec, axes);
    }
    this.advance();
  }

  /* The pushed direction is the positive end (for the throttle, full). */
  specFor(ch, axis, sample) {
    const pushedUp = sample >= this.rest[axis];
    const pushedEnd = pushedUp ? this.high[axis] : this.low[axis];
    const otherEnd = pushedUp ? this.low[axis] : this.high[axis];
    if (ch === 'throttle') {
      return { axis, low: otherEnd, high: pushedEnd };
    }
    return {
      axis, center: this.rest[axis], pos: pushedEnd, neg: otherEnd,
    };
  }

  /*
   * Back at rest: every other axis at its rest, an identified throttle at
   * either the bottom of its travel or its rest (a pilot told to put it
   * down holds it there), and the channel just asked for home too.
   */
  released(axes, spec) {
    const own = spec ? spec.axis : -1;
    const thr = this.draft.throttle;
    const thrAxis = thr && Number.isInteger(thr.axis) && thr.axis !== own ? thr.axis : -1;
    const near = (i, where) => Math.abs(axes[i] - where) <= AT_REST;
    for (let i = 0; i < Math.min(axes.length, this.rest.length); i += 1) {
      if (i !== own && i !== thrAxis && !near(i, this.rest[i])) {
        return false;
      }
    }
    if (thrAxis >= 0) {
      const r = this.rest[thrAxis];
      const bottom = thr.high >= r ? this.low[thrAxis] : this.high[thrAxis];
      if (!near(thrAxis, bottom) && !near(thrAxis, r)) {
        return false;
      }
    }
    if (!spec) {
      return true;
    }
    if (this.step === 'throttle' && near(spec.axis, spec.low)) {
      return true;
    }
    return near(spec.axis, this.rest[spec.axis]);
  }

  /* Settled back at a rest well above the low end: a sprung throttle, and
   * zero belongs at rest. Recorded, so a saved map says which it was. */
  judgeThrottle(spec, axes) {
    const r = this.rest[spec.axis];
    if (Math.abs(axes[spec.axis] - r) > AT_REST || Math.abs(r - spec.low) <= SPRUNG_REST) {
      return;
    }
    spec.low = r;
    spec.sprung = true;
  }

  reverse(ch) {
    if (this.step !== 'confirm' || !ASKED.includes(ch)) {
      return false;
    }
    if (!this.draft.reverse) {
      this.draft.reverse = reversals(null);
    }
    this.draft.reverse[ch] = !this.draft.reverse[ch];
    return true;
  }

  skipMenuSwitch() {
    if (this.step !== SELECT_STEP) {
      return false;
    }
    this.draft.select = null;
    this.advance();
    return true;
  }

  /* Puts throttle zero where the stick is, unless that would leave it
   * almost no travel. */
  zeroThrottleAt(gp) {
    const spec = this.draft.throttle;
    if (this.step !== 'confirm' || !spec || !gp || !Number.isInteger(spec.axis)) {
      return false;
    }
    const v = watchedAxes(gp)[spec.axis];
    if (!Number.isFinite(v) || Math.abs(spec.high - v) < LEAST_THROTTLE_RANGE) {
      return false;
    }
    spec.low = v;
    spec.sprung = true;
    return true;
  }

  complete() {
    const d = this.draft;
    return this.step === 'confirm' && Boolean(d.roll && d.pitch && d.yaw && d.throttle);
  }

  /*
   * Everything the calibrate screen draws. The gimbals show the built-in
   * map until the identify steps begin and the draft after; on an identify
   * step the channel being asked for previews the axis that is moving, as
   * a share of the reach the sweep measured, with the prompt's sign (the
   * polarity is exactly what is not known yet). The strip shows every raw
   * axis with its rest and range, whatever the map says.
   */
  view(gp, mode) {
    const steps = this.steps;
    const travelled = this.low && this.high ? fullTravelCount(this.low, this.high) : 0;
    const need = this.low ? Math.min(4, this.low.length) : 4;
    let channels = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
    const axes = [];
    if (gp) {
      const live = watchedAxes(gp);
      const rest = this.rest || live;
      const claimed = claimedAxes(this.draft);
      live.forEach((v, i) => {
        const seen = (ends) => (ends && i < ends.length ? ends[i] : v);
        axes.push({
          i, v, rest: rest[i] ?? 0, lo: seen(this.low), hi: seen(this.high), mapped: claimed.has(i),
        });
      });
      const early = this.step === 'center' || this.step === 'sweep';
      channels = readSticks(gp.axes, early ? builtInMap(gp, mode) : this.draft);
      const asking = !early && this.phase === 'hold' && this.rest && ASKED.includes(this.step) && !this.draft[this.step];
      if (asking) {
        const lead = leadingAxis(live, this.rest, claimedAxes(this.draft));
        if (lead.axis >= 0) {
          const a = lead.axis;
          const moved = Math.abs(live[a] - this.rest[a]);
          const reach = Math.max(Math.abs(this.high[a] - this.rest[a]), Math.abs(this.rest[a] - this.low[a]), moved) || 1;
          channels = { ...channels, [this.step]: Math.min(1, moved / reach) };
        }
      }
    }
    const checking = this.step === 'confirm';
    const moving = checking ? movingChannel(channels) : null;
    return {
      step: this.step,
      phase: this.phase,
      stepIndex: Math.max(0, steps.indexOf(this.step)),
      stepCount: steps.length,
      steps: steps.slice(),
      waiting: Boolean(this.waiting) || !gp,
      travelled,
      need,
      canSave: checking,
      canSkip: this.step === SELECT_STEP,
      canZeroThrottle: checking && channels.throttle > IDLE_THROTTLE,
      throttlePercent: Math.round(channels.throttle * 100),
      channels,
      axes,
      moving,
      canReverse: Boolean(moving),
      reverse: reversals(this.draft && this.draft.reverse),
      checkOnly: Boolean(this.checkOnly),
      title: this.title(),
      prompt: this.prompt(mode),
      hint: this.hint(travelled, need, gp, checking ? channels.throttle : 0, moving),
    };
  }

  title() {
    const titles = {
      center: 'Centre',
      sweep: str('ui.full_range'),
      throttle: 'Throttle',
      roll: 'Roll',
      pitch: 'Pitch',
      yaw: 'Yaw',
      select: str('ui.menu_switch'),
      confirm: this.checkOnly ? str('ui.check_sticks') : str('input.check'),
    };
    return titles[this.step] || '';
  }

  /* Prompts name the stick from the pilot's stick mode, so a Mode 1 pilot
   * is told to move the hand that really carries the channel. */
  prompt(mode) {
    switch (this.step) {
      case 'center':
        return str('input.both_sticks_in_the_centre_throttle');
      case 'sweep':
        return str('input.move_both_sticks_through_every_corner');
      case 'confirm':
        return str('input.move_the_sticks_left_is', { v1: stickCaption(mode, 'left').toLowerCase() })
          + str('input.right_is', { v1: stickCaption(mode, 'right').toLowerCase() });
      default:
        break;
    }
    const side = (ch) => ({ side: stickSideOf(mode, ch) });
    if (this.phase === 'release') {
      return {
        throttle: () => str('input.now_put_the_throttle_all_the'),
        roll: () => str('input.let_the_stick_come_back_to', side('roll')),
        pitch: () => str('input.let_the_stick_come_back_to', side('pitch')),
        yaw: () => str('input.let_the_stick_come_back_to', side('yaw')),
        select: () => str('input.put_it_back_where_it_was'),
      }[this.step]?.() ?? str('input.return_to_rest');
    }
    return {
      throttle: () => str('input.push_the_throttle_all_the_way'),
      roll: () => str('input.hold_the_stick_fully_to_the', side('roll')),
      pitch: () => str('input.pull_the_stick_fully_back_toward', side('pitch')),
      yaw: () => str('input.hold_the_stick_fully_to_the', side('yaw')),
      select: () => str('input.throw_the_switch_you_want_to'),
    }[this.step]?.() ?? '';
  }

  hint(travelled, need, gp, idleThrottle, moving) {
    if (!gp) {
      return str('input.radio_disconnected_plug_it_back_in');
    }
    if (this.step === 'center') {
      return str('input.waiting_until_the_reading_is_steady');
    }
    if (this.step === 'sweep') {
      return travelled < need
        ? str('input.keep_going_full_travel_on_of', { travelled, need })
        : str('input.back_to_rest_to_continue');
    }
    if (this.step === 'confirm') {
      return this.checkHint(idleThrottle, moving);
    }
    if (this.step === SELECT_STEP) {
      return str('input.this_radio_reports_no_buttons_so')
        + str('input.no_switch_to_spare_skip_holding')
        + str('input.a_second_counts_as_a_press');
    }
    return this.phase === 'release'
      ? str('input.one_direction_at_a_time_diagonals')
      : str('input.hold_it_there_diagonals_are_ignored');
  }

  /* On the check step: a throttle flying the craft at rest comes first,
   * then the stick being moved with the key that reverses it, then how to
   * keep the mapping. */
  checkHint(idleThrottle, moving) {
    if (idleThrottle > IDLE_THROTTLE) {
      return str('input.throttle_is_reading_percent_right_now', { v1: Math.round(idleThrottle * 100) })
        + str('input.if_that_is_where_your_throttle')
        + str('input.throttle_zero_is_here');
    }
    if (moving) {
      const flipped = this.draft && this.draft.reverse && this.draft.reverse[moving];
      return str('input.moving', { moving, v2: flipped ? str('input.reversed') : '' })
        + str('input.if_the_wrong_stick_moved_on')
        + str('input.if_it_moved_the_wrong_way', { moving });
    }
    let keep = str('input.enter_or_save_mapping_keeps_it');
    if (this.checkOnly) {
      keep = str('input.enter_or_save_mapping_keeps_the');
    } else if (this.draft && this.draft.select) {
      keep = str('input.enter_save_mapping_or_the_switch');
    }
    return str('input.move_one_stick_at_a_time', { keep });
  }
}

