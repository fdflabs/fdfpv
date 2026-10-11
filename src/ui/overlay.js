/*
 * overlay.js: what the Ui draws over a flight, and the two input screens
 * that set flight up, as Ui methods installed onto the class at the end
 * of ui.js.
 *
 * The flight part (OSD readouts, banner, target mark, stick ghosts, air
 * slider, score overlay) is called from main.js's frame loop, so it is
 * written to the rule ui.js's Ui.text, Ui.klass and Ui.bar exist for: a
 * frame that changes nothing writes nothing to the DOM, and a frame
 * allocates as little as the readouts allow. Constant tables live at
 * module level for the same reason.
 *
 * The calibration and pad pick screens are fed a view by the input layer
 * on every frame they are up; the stick mode, pad roster, GPU and stick
 * path facts feed the menus.
 *
 * `this` is the Ui. Names and arguments are the callers' (main.js, the
 * Ui's menus, checks through window.__ui) and must not change.
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

import { CAL_STEPS } from '../input/input.js';
import { STICK_MODES, normaliseStickMode, stickCaption } from '../input/stickmode.js';
import { boardConfigured } from '../share/board.js';
import { boardFlightSeconds } from '../share/stats.js';
import { str } from '../strings/index.js';
import { formatRunClock, formatTime } from './format.js';
import { WEIGHT_STOCK, airHintSeen, clampWeight, markAirHintSeen, saveSettings } from './settings.js';
import { el, makePadCard, placeNub, placeSticks } from './widgets.js';
/* A cycle (ui.js installs these methods), so only read inside methods. */
import { Ui, padTroubleItem } from './ui.js';

/* Owner, 2026-10-06: the air hint card closes itself after ten seconds
 * untouched, and that counts as read, so it is shown once ever. */
const AIR_HINT_MS = 10000;

/* The scored freestyle run is two minutes; the clock shows this until the
 * first trick starts it. */
const RUN_CLOCK_FULL = '2:00';
const RUN_LATE_MS = 10_000;

/* String keys, resolved per frame through str() so a locale change reads
 * right on the next frame. */
const FLIGHT_MODE_KEYS = { angle: 'ui.angle', stab: 'ui.stabilised', manual: 'ui.manual', as3x: 'ui.as3x' };
const FLAP_KEYS = ['ui.flaps_up', 'ui.flaps_half', 'ui.flaps_full'];
const GEAR_KEYS = { up: 'ui.gear_up', down: 'ui.gear_down' };

/* Wording for input.js's calibration steps; the order is CAL_STEPS. */
const CAL_LABELS = {
  center: 'Centre',
  sweep: str('ui.full_range'),
  throttle: 'Throttle',
  roll: 'Roll',
  pitch: 'Pitch',
  yaw: 'Yaw',
  /* Asked only of a radio with no buttons (SELECT_STEP in input.js). */
  select: str('ui.menu_switch'),
  confirm: 'Check',
};

const NO_CHANNELS = Object.freeze({ roll: 0, pitch: 0, yaw: 0, throttle: 0 });
const NO_AXES = Object.freeze([]);
const PAD_REST = Object.freeze([0, 0, 0, 0]);

const unit = (v) => Math.max(-1, Math.min(1, v));
/* An axis value on the -1..1 track, as a left offset in per cent. */
const trackPct = (v) => `${Math.max(0, Math.min(100, ((v + 1) / 2) * 100)).toFixed(1)}%`;

/* Writes `value` to node.style[prop] unless the memo already holds it
 * under `key`. The target mark's memo, since its nodes are its own. */
function styleOnce(memo, key, node, prop, value) {
  if (memo[key] !== value) {
    memo[key] = value;
    node.style[prop] = value;
  }
}

/*
 * The clock slot, top centre. One clock on screen whatever the mode:
 *   race: the lap, dim at 0.00 before the first gate;
 *   freestyle, scoring off: the time in the air, same face;
 *   freestyle, free flight: no clock, and it says so rather than going blank;
 *   freestyle, scored: the run's time LEFT, because the last seconds are
 *   when a pilot decides on the big line. Dim at 2:00 until the first
 *   trick, warm in the last ten seconds.
 */
function paintClock(ui, freestyle, lapMs, runScored, runTimed, runState, runRemainMs) {
  let label;
  let face;
  let cls;
  if (!freestyle || runScored === false) {
    const timing = Number.isFinite(lapMs);
    label = freestyle ? 'Air' : 'Lap';
    face = timing ? formatTime(lapMs) : '0.00';
    cls = timing ? 'osd-timer' : 'osd-timer waiting';
  } else if (runTimed === false) {
    label = 'Run';
    face = 'Free';
    cls = 'osd-timer waiting';
  } else {
    const started = runState === 'flying' || runState === 'over';
    const left = Number.isFinite(runRemainMs) ? runRemainMs : 0;
    label = 'Run';
    face = started ? formatRunClock(left) : RUN_CLOCK_FULL;
    if (!started) {
      cls = 'osd-timer waiting';
    } else {
      cls = left <= RUN_LATE_MS ? 'osd-timer is-late' : 'osd-timer';
    }
  }
  Ui.text(ui.osdClockLabel, label);
  Ui.text(ui.osdTimer, face);
  Ui.klass(ui.osdTimer, cls);
}

/* The gap to the ghost, signed so it can never be read as a lap time:
 * minus is you ahead. */
function paintGhost(node, gapMs, final) {
  if (gapMs == null) {
    Ui.klass(node, 'osd-ghost is-off');
    Ui.text(node, '');
    return;
  }
  const ahead = gapMs <= 0;
  const seconds = (Math.abs(gapMs) / 1000).toFixed(2);
  Ui.text(node, `${str(final ? 'ui.ghost_lap' : 'ui.ghost')} ${ahead ? '-' : '+'}${seconds}`);
  Ui.klass(node, ahead ? 'osd-ghost ahead' : 'osd-ghost behind');
}

function flightModeText(flightMode, launchState) {
  if (flightMode === 'turtle') {
    return str('ui.turtle');
  }
  if (launchState === 1 || launchState === 2) {
    return str('ui.launch_2');
  }
  const key = FLIGHT_MODE_KEYS[flightMode];
  return str(key || 'ui.acro');
}

/* Launch control: 0 off, 1 armed, 2 held hot, 3 released. Armed and hot
 * show the nose up angle once it is worth reading. */
function paintLaunch(node, state, pitch) {
  let cls = 'osd-launch';
  if (!(state > 0)) {
    cls += ' is-off';
  } else if (state === 2) {
    cls += ' is-hot';
  } else if (state === 3) {
    cls += ' is-go';
  }
  Ui.klass(node, cls);
  let text = '';
  if (state === 3) {
    text = 'GO';
  } else if (state > 0) {
    const deg = Math.round(pitch || 0);
    text = deg > 2 ? str('ui.launch', { deg }) : 'LAUNCH';
  }
  Ui.text(node, text);
}

function gearText(gear) {
  if (gear == null) {
    return '';
  }
  return str(GEAR_KEYS[gear] || 'ui.gear_moving');
}

/* Whether the cards on screen are already one per pad in view. A loop,
 * not every(), because this runs every frame the screen is up. */
function sameRoster(nodes, pads) {
  if (pads.length !== nodes.size) {
    return false;
  }
  for (const pad of pads) {
    if (!nodes.has(pad.key)) {
      return false;
    }
  }
  return true;
}

/* The row the Rates screen shows for each way sticks reach the quad. */
function stickPathItem(value, note, rowClass) {
  const item = { label: str('ui.stick_path'), value, info: true };
  if (rowClass !== undefined) {
    item.rowClass = rowClass;
  }
  item.note = note;
  return item;
}

export const overlayMethods = {
  /*
   * The banner stands under the OSD's top block, whose height depends on
   * how it wraps (three lines on a desktop, six on an upright phone), so a
   * fixed offset would land it on the lap lines. One layout read while a
   * banner is up, and a style write only when the bottom moved.
   */
  seatBannerUnderOsd(on) {
    const banner = this.banner;
    const block = this.osdTopBlock;
    const holder = banner.offsetParent;
    let top = null;
    if (on && block && holder && block.offsetHeight > 0) {
      top = Math.round(block.getBoundingClientRect().bottom - holder.getBoundingClientRect().top + 10);
    }
    if (banner.__seatTop !== top) {
      banner.__seatTop = top;
      banner.style.top = top == null ? '' : `${top}px`;
    }
  },

  /*
   * The banner line. `panelled` true boxes it mid frame; 'edge' is one
   * compact line under the OSD block, for a message about a craft in view
   * (a wreck) that a box would cover. Called per frame as well as on
   * events, so every write is guarded.
   */
  setBanner(text, panelled = false) {
    const words = text || '';
    /* The FPV OSD draws the banner in its own type while this element is
     * hidden (src/ui/fpvhud.js), and reads the words from here. */
    this.bannerText = words;
    const banner = this.banner;
    Ui.text(banner, words);
    const opacity = words ? '1' : '0';
    if (banner.__shownOpacity !== opacity) {
      banner.__shownOpacity = opacity;
      banner.style.opacity = opacity;
    }
    let cls = 'banner';
    if (panelled === 'edge') {
      cls = 'banner edge';
    } else if (panelled) {
      cls = 'banner panel';
    }
    Ui.klass(banner, cls);
    this.seatBannerUnderOsd(Boolean(words) && panelled !== true);
    if (words) {
      this.announce(words);
    }
  },

  /* The live region a screen reader hears. Guarded because setBanner runs
   * per frame and a live region speaks every change. */
  announce(text) {
    const words = text == null ? '' : String(text);
    const region = this.announcer;
    if (!region || region.__spoken === words) {
      return;
    }
    region.__spoken = words;
    region.textContent = words;
  },

  /*
   * The target mark, the answer to "where is the next one": a bracket
   * sized to the opening while it is in frame, a chevron pinned inside the
   * edge pointing the short way round when it is not, both with the range
   * under them and coloured by the same side test the gate uses. main.js
   * lets go inside 6 m, where a bracket would just outline the frame.
   */
  buildTargetLock() {
    const lock = el('div', 'lock is-off');
    const box = el('div', 'lock-box');
    box.append(el('i', 'lc tl'), el('i', 'lc tr'), el('i', 'lc bl'), el('i', 'lc br'));
    const arrow = el('div', 'lock-arrow');
    const dist = el('div', 'lock-dist', '');
    lock.append(box, arrow, dist);
    this.lock = lock;
    this.lockBox = box;
    this.lockArrow = arrow;
    this.lockDist = dist;
    /* The mark is up for a whole race, and each of its values is a style
     * write per frame unless remembered. A fresh node's opacity is already
     * unset, which is what full strength writes. */
    this.lockMemo = { fade: '' };
    return lock;
  },

  /* `x`, `y`: CSS px from the canvas's top left, already clamped by the
   * shell. `size`: the aperture in CSS px. `angle`: the chevron's heading,
   * degrees clockwise from up. `fade`: 0..1. */
  setTargetLock({ show, x, y, size, angle, edge, wrong, distance, fade }) {
    const lock = this.lock;
    if (!lock) {
      return;
    }
    const memo = this.lockMemo;
    let cls = 'lock is-off';
    if (show) {
      cls = `lock${edge ? ' is-edge' : ''}${wrong ? ' is-wrong' : ''}`;
    }
    if (memo.cls !== cls) {
      memo.cls = cls;
      lock.className = cls;
    }
    if (!show) {
      return;
    }
    styleOnce(memo, 'at', lock, 'transform', `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`);
    styleOnce(memo, 'fade', lock, 'opacity', fade < 0.995 ? fade.toFixed(2) : '');
    if (edge) {
      styleOnce(memo, 'turn', this.lockArrow, 'transform', `translate(-50%, -50%) rotate(${angle.toFixed(1)}deg)`);
    } else {
      const side = `${size.toFixed(0)}px`;
      styleOnce(memo, 'w', this.lockBox, 'width', side);
      styleOnce(memo, 'h', this.lockBox, 'height', side);
    }
    /* The range sits under whichever mark shows, and the two are different
     * heights, so it is placed rather than laid out. */
    const below = (edge ? 15 : size * 0.5) + 11;
    styleOnce(memo, 'under', this.lockDist, 'transform', `translate(-50%, ${below.toFixed(0)}px)`);
    /* Whole metres: tenths at racing speed are a smear. */
    const range = `${Math.round(distance)} m`;
    if (memo.range !== range) {
      memo.range = range;
      this.lockDist.textContent = range;
    }
  },

  /*
   * The flight readouts, every frame. Units a pilot reads (seconds, volts,
   * metres, km/h), never raw state. A freestyle world has no gates, laps,
   * last lap or ghost, so those slots go empty rather than lie; altitude is
   * above the surface under the craft (the collision query's own), which
   * is the number that means something over a roof.
   */
  setOsd({ mode, lapMs, lastLapMs, gate, gateCount, gateCue, volts, packFrac, altitude, speedKph, throttle, flightMode, flaps = null, gear = null, bounces, launchState, launchPitch, ghostGapMs, ghostFinal, runState, runRemainMs, runTimed, runScored }) {
    const freestyle = mode === 'freestyle';
    paintClock(this, freestyle, lapMs, runScored, runTimed, runState, runRemainMs);
    let gateLine = '';
    if (!freestyle) {
      gateLine = gateCue
        ? str('ui.gate_of', { gate, gateCount, gateCue })
        : str('ui.gate_of_2', { gate, gateCount });
    }
    Ui.text(this.osdGate, gateLine);
    Ui.text(this.osdLast, !freestyle && lastLapMs != null ? str('ui.last_lap', { formatTime: formatTime(lastLapMs) }) : '');
    if (this.osdGhost) {
      paintGhost(this.osdGhost, freestyle ? null : ghostGapMs, ghostFinal);
    }
    Ui.text(this.osdPack, `${volts.toFixed(1)} volts`);
    Ui.bar(this.osdPackBar, packFrac);
    Ui.text(this.osdSpeed, str('ui.km_h', { speedKph: speedKph.toFixed(0) }));
    Ui.text(this.osdAlt, str('ui.m_above_the_ground', { altitude: altitude.toFixed(1) }));
    Ui.bar(this.osdThrBar, throttle);
    if (this.osdFlight) {
      Ui.text(this.osdFlight, flightModeText(flightMode, launchState));
    }
    if (this.osdFlaps) {
      const key = flaps == null ? null : FLAP_KEYS[flaps];
      Ui.text(this.osdFlaps, key ? str(key) : '');
    }
    if (this.osdGear) {
      Ui.text(this.osdGear, gearText(gear));
    }
    if (this.osdLaunch) {
      paintLaunch(this.osdLaunch, launchState, launchPitch);
    }
    /* Contacts cost nothing now (no wreck, nothing to spend), so this only
     * counts bounces, in the neutral colour, and is blank until there is
     * one. */
    if (this.osdHits) {
      Ui.text(this.osdHits, bounces ? `${bounces} ${bounces === 1 ? 'bounce' : 'bounces'}` : '');
      if (bounces) {
        Ui.klass(this.osdHits, 'osd-sub osd-hits');
      }
    }
  },

  /*
   * The freestyle score overlay, in four calls because they run at four
   * rates: visibility on a screen or mode change, the view per frame, the
   * events when something happened, the reset per run.
   */
  syncScoreVisible() {
    if (!this.scoreHud) {
      return;
    }
    /* Scoring off has no overlay at all: a zero that can never move reads
     * as a fault. */
    const flying = this.screen === 'flight' || this.screen === 'paused';
    this.scoreHud.setVisible(this.osdMode === 'freestyle' && this.settings.freestyleScoring !== 'off' && flying);
  },

  setScore(view) {
    this.scoreHud.update(view);
  },

  scoreEvents(list) {
    this.scoreHud.events(list);
  },

  resetScore() {
    this.scoreHud.reset();
    /* A new run has posted nothing; without this the second run's results
     * showed the first one's "Run posted". */
    this.freestyleRun = null;
    this.runPosted = null;
  },

  /*
   * The keyboard's stick ghosts, in the pilot's stick mode. `show` hides
   * the two gimbals only: the block also holds the air slider, which is
   * setAirSlider's to show. The view itself carries the four channels, so
   * it is handed on as is.
   */
  setStickOverlay(view) {
    if (!this.osdSticks) {
      return;
    }
    const cls = view.show ? 'osd-gimbal' : 'osd-gimbal is-off';
    Ui.klass(this.osdStickLeft.box, cls);
    Ui.klass(this.osdStickRight.box, cls);
    if (view.show) {
      placeSticks(this.osdStickLeft, this.osdStickRight, view, this.settings.stickMode);
    }
  },

  /*
   * The air (weight) slider on the flight screen. It commits on every
   * input, not on release: it stores one number into the plant, and the
   * point of having it in flight is feeling the change arrive.
   *
   * It must never hold focus. input.js listens for keys on the window and
   * ignores INPUT targets, and a range is an INPUT, so a focused slider
   * turned the arrows into weight changes and swallowed Escape. Focus is
   * dropped on release and Tab cannot land here; a pointer drag keeps
   * implicit capture without focus.
   */
  bindAirSlider() {
    const air = this.osdAir;
    if (!air) {
      return;
    }
    const range = air.range;
    range.addEventListener('input', () => {
      const weight = clampWeight(range.value);
      /* Repainted even when unchanged: a drag between two steps snaps back,
       * and the caption has to follow it. */
      if (weight !== this.settings.weight) {
        this.settings.weight = weight;
        this.paintAir();
        saveSettings(this.settings);
        if (this.onSettings) {
          this.onSettings(this.settings);
        }
        return;
      }
      this.paintAir();
    });
    /* Touching the track answers the hint's question either way. The flight
     * screen treats clicks as its own, so they stop here. */
    range.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.dismissAirHint();
    });
    range.addEventListener('click', (e) => e.stopPropagation());
    const letGo = () => {
      if (document.activeElement === range) {
        range.blur();
      }
    };
    for (const type of ['pointerup', 'pointercancel', 'change']) {
      range.addEventListener(type, letGo);
    }
    range.tabIndex = -1;
    air.dismiss.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dismissAirHint();
    });
    this.paintAir();
  },

  /*
   * Whether the slider block is up (from the frame loop, beside
   * setStickOverlay), and the hint's one appearance: the first flight this
   * browser has seen, once the craft is in the air (`ready`), because a
   * card about how the air feels means nothing on the start block. It does
   * not wait for the banner to clear: on a map with nothing built the note
   * never clears, and a short screen's overlap is solved in the stylesheet.
   */
  setAirSlider(show, ready = true) {
    const air = this.osdAir;
    if (!air) {
      return;
    }
    Ui.klass(air.box, show ? 'osd-air' : 'osd-air is-off');
    Ui.klass(this.osdSticks, show ? 'osd-sticks' : 'osd-sticks is-off');
    if (!show || !ready || this.airHintDone || !air.hint.hidden || airHintSeen()) {
      return;
    }
    air.hint.hidden = false;
    this.airHintTimer = setTimeout(() => this.dismissAirHint(), AIR_HINT_MS);
  },

  dismissAirHint() {
    const air = this.osdAir;
    if (!air || this.airHintDone) {
      return;
    }
    this.airHintDone = true;
    clearTimeout(this.airHintTimer);
    air.hint.hidden = true;
    markAirHintSeen();
  },

  /*
   * The track and caption from settings, on every settings write, so the
   * slider agrees with a change made anywhere. Slate at stock (nothing to
   * say: every record was set there), amber off it, as every instrument
   * reading on this overlay is. No board warning here: the pilot had it
   * removed, and it is said where a record is actually decided.
   */
  paintAir() {
    const air = this.osdAir;
    if (!air) {
      return;
    }
    const weight = this.settings.weight;
    if (Number(air.range.value) !== weight) {
      air.range.value = String(weight);
    }
    air.cap.textContent = str('ui.weight_2', { v: weight });
    Ui.klass(air.cap, weight === WEIGHT_STOCK ? 'osd-air-cap is-stock' : 'osd-air-cap');
  },

  /*
   * One cell per axis the radio reports: a dot at the live value and a bar
   * over the range seen so far, on a fixed -1..1 track. Built when the axis
   * count changes and only moved after, so the dot keeps its transition and
   * the strip does not churn at the frame rate.
   */
  setCalAxes(axes) {
    const strip = this.calAxes;
    if (!strip) {
      return;
    }
    if (this.calAxisCells.length !== axes.length) {
      strip.textContent = '';
      this.calAxisCells = axes.map((axis) => {
        const cellNode = el('div', 'cal-axis');
        const track = el('span', 'cal-axis-track');
        const span = el('i', 'cal-axis-span');
        const dot = el('i', 'cal-axis-dot');
        track.append(span, dot);
        cellNode.append(el('span', 'cal-axis-n', String(axis.i)), track);
        strip.append(cellNode);
        return { cell: cellNode, span, dot };
      });
    }
    /* A radio that went away leaves an empty strip, not stale dots. */
    strip.hidden = axes.length === 0;
    for (let k = 0; k < axes.length; k++) {
      const axis = axes[k];
      const cells = this.calAxisCells[k];
      cells.dot.style.left = trackPct(axis.v);
      const lo = Number.isFinite(axis.lo) ? axis.lo : axis.v;
      const hi = Number.isFinite(axis.hi) ? axis.hi : axis.v;
      cells.span.style.left = trackPct(lo);
      /* One axis unit is half the track. */
      cells.span.style.width = `${Math.max(0, Math.min(100, (hi - lo) * 50)).toFixed(1)}%`;
      const live = Math.abs(axis.v - (axis.rest || 0)) > 0.15;
      Ui.klass(cells.cell, `cal-axis${axis.mapped ? ' is-mapped' : ''}${live ? ' is-live' : ''}`);
    }
  },

  /*
   * The calibration screen from input.js's view, every frame it is up; null
   * closes it. The cal* flags are what the Ui's keys and pad buttons read
   * (and scripts/input-check.js), so they are set either way.
   */
  setCalibration(view) {
    if (!this.calPrompt) {
      return;
    }
    const on = view || {};
    this.calCanSave = Boolean(on.canSave);
    this.calCanSkip = Boolean(on.canSkip);
    this.calCanZeroThrottle = Boolean(on.canZeroThrottle);
    this.calCanReverse = Boolean(on.canReverse);
    this.calMoving = on.moving || null;
    this.calOnConfirm = on.step === 'confirm';
    if (this.calSaveBtn) {
      this.calSaveBtn.disabled = !this.calCanSave;
    }
    if (this.calSkipBtn) {
      this.calSkipBtn.hidden = !this.calCanSkip;
    }
    if (this.calZeroBtn) {
      this.calZeroBtn.hidden = !this.calCanZeroThrottle;
    }
    if (this.calRevBtn) {
      this.calRevBtn.hidden = !this.calCanReverse;
    }
    if (this.calModeBtn) {
      this.calModeBtn.hidden = !this.calOnConfirm;
    }
    if (!view) {
      return;
    }
    this.calKicker.textContent = str('ui.step_of', { n: view.stepIndex + 1, stepCount: view.stepCount, title: view.title });
    this.calPrompt.textContent = view.prompt;
    this.calHint.textContent = view.hint;
    if (this.calRevBtn && this.calCanReverse) {
      /* It says which way it goes: a pilot who pressed it once needs to
       * know this puts it back. */
      const reversed = view.reverse && view.reverse[view.moving];
      Ui.text(this.calRevBtn, `${reversed ? 'Un-reverse' : str('ui.reverse')} ${view.moving}`);
    }
    if (this.calModeBtn) {
      Ui.text(this.calModeBtn, str('ui.stick_mode_2', { normaliseStickMode: normaliseStickMode(this.settings.stickMode) }));
    }
    placeSticks(this.calStickLeft, this.calStickRight, view.channels || NO_CHANNELS, this.settings.stickMode);
    this.setCalAxes(view.axes || NO_AXES);
    /* The steps this run asks (one more for a radio with no buttons), in
     * input.js's order; CAL_STEPS if the view does not say. */
    const steps = view.steps && view.steps.length ? view.steps : CAL_STEPS;
    this.calList.textContent = '';
    steps.forEach((id, i) => {
      const item = el('li', null, CAL_LABELS[id] ?? id);
      if (id === view.step) {
        item.className = 'on';
      } else if (i < view.stepIndex) {
        item.className = 'done';
      }
      this.calList.append(item);
    });
  },

  /*
   * The stick mode applied to everything that draws or names a pair of
   * sticks (captions and the how-to prose; the channels are input.js's).
   * main.js's applySettings calls it on every settings write, so it does
   * nothing unless the mode moved.
   */
  setStickMode(mode) {
    const m = normaliseStickMode(mode);
    this.settings.stickMode = m;
    if (this.stickModeDrawn === m) {
      return;
    }
    this.stickModeDrawn = m;
    for (const gimbal of [this.osdStickLeft, this.howtoStickLeft, this.calStickLeft]) {
      if (gimbal && gimbal.cap) {
        Ui.text(gimbal.cap, stickCaption(m, 'left'));
      }
    }
    for (const gimbal of [this.osdStickRight, this.howtoStickRight, this.calStickRight]) {
      if (gimbal && gimbal.cap) {
        Ui.text(gimbal.cap, stickCaption(m, 'right'));
      }
    }
    /* The how-to prose is built from a table, not the DOM. */
    if (this.howtoKeys) {
      this.renderHowto();
    }
  },

  /* The next mode round (the M key and the check step's button), through
   * writeSettings so the input layer, every gimbal and storage follow. */
  cycleStickMode() {
    const at = STICK_MODES.indexOf(normaliseStickMode(this.settings.stickMode));
    const next = STICK_MODES[(at + 1) % STICK_MODES.length];
    this.settings.stickMode = next;
    this.writeSettings();
    return next;
  },

  /*
   * The pad roster from main.js, every frame. The title's trouble row is
   * part of its item list, which only becomes DOM in renderMenu, and some
   * troubles are decided mid session (no yaw: noteGuessOrder in input.js),
   * so a changed row asks for the paint. Compared on the row's label, since
   * the info itself moves every frame.
   */
  setPadInfo(info) {
    const before = padTroubleItem(this.padInfo);
    this.padInfo = info || { count: 0, using: str('ui.keyboard') };
    const after = padTroubleItem(this.padInfo);
    const changed = (before ? before.label : '') !== (after ? after.label : '');
    if (changed && this.screen === 'title') {
      this.renderMenu();
    }
  },

  /* The pad pick screen from input.js's view, every frame; null closes it.
   * A card per pad, rebuilt only when the set of pads changes. */
  setPadPick(view) {
    if (!this.padPrompt) {
      return;
    }
    if (!view) {
      this.padCardNodes = new Map();
      if (this.padCards) {
        this.padCards.textContent = '';
      }
      return;
    }
    const pads = view.pads;
    let kicker = str('ui.no_joystick');
    if (pads.length > 1) {
      kicker = str('ui.joysticks_plugged_in', { length: pads.length });
    } else if (pads.length === 1) {
      kicker = str('ui.one_joystick_plugged_in');
    }
    this.padKicker.textContent = kicker;
    this.padPrompt.textContent = view.prompt;
    this.padHint.textContent = view.hint;
    for (const button of [this.padYesBtn, this.padNoBtn]) {
      if (button) {
        button.disabled = !view.canAccept;
      }
    }
    if (this.padSkipBtn) {
      this.padSkipBtn.textContent = view.skipLabel;
    }
    this.padPickPhase = view.phase;
    this.padPickReason = view.reason;
    if (!sameRoster(this.padCardNodes || new Map(), pads)) {
      this.padCards.textContent = '';
      this.padCardNodes = new Map();
      for (const pad of pads) {
        const card = makePadCard();
        this.padCards.append(card.card);
        this.padCardNodes.set(pad.key, card);
      }
    }
    for (const pad of pads) {
      const card = this.padCardNodes.get(pad.key);
      card.title.textContent = pad.title;
      card.name.textContent = pad.name;
      let status = str('ui.resting');
      if (pad.chosen) {
        status = str('ui.use_this_one');
      } else if (pad.live) {
        status = str('ui.moving');
      }
      card.status.textContent = status;
      card.card.classList.toggle('is-live', Boolean(pad.live && !pad.chosen));
      card.card.classList.toggle('is-on', Boolean(pad.chosen));
      const ax = pad.axes || PAD_REST;
      placeNub(card.left.nub, unit(ax[0]), unit(-ax[1]));
      placeNub(card.right.nub, unit(ax[2]), unit(-ax[3]));
    }
  },

  persistSettings() {
    saveSettings(this.settings);
  },

  /* The board's all time flight seconds for the Pilot screen, asked once a
   * page: null until it answers, and for good if it cannot. */
  everyoneFlight() {
    if (this.everyoneFlightAsked) {
      return this.everyoneFlightS;
    }
    this.everyoneFlightAsked = true;
    this.everyoneFlightS = null;
    if (boardConfigured()) {
      boardFlightSeconds().then((seconds) => {
        this.everyoneFlightS = seconds;
        if (seconds != null && this.screen === 'pilot') {
          this.renderMenu();
        }
      });
    }
    return null;
  },

  setGpuInfo(info) {
    this.gpuInfo = info || null;
    if (this.screen === 'pilot') {
      this.renderMenu();
    }
  },

  /*
   * The stick path is a function, not a value: the pad rate is recounted
   * every 500 ms, the source changes when a radio is plugged in or a thumb
   * lands on glass, and stick resolution is unknown until a stick moves. A
   * boot snapshot would say "keyboard, 0 Hz" for everyone. main.js
   * registers the probe; the bug report and the Rates row call it.
   */
  setStickProbe(fn) {
    this.stickProbe = typeof fn === 'function' ? fn : null;
  },

  /*
   * The Rates screen's row on how the sticks reach the quad, for a pilot
   * who went there because the feel is wrong. Each transducer gets what
   * can honestly be said of it: the keyboard's ramp and the thumb sticks'
   * spring are facts about this shell; a radio's rate can only be measured.
   * A rate sitting on the frame rate means the browser hands over one
   * value per frame whatever the radio does, which only WebHID fixes, so
   * only that gets the warning. No probe (the harness) means no row.
   */
  stickPathRow() {
    const probe = this.stickProbe ? this.stickProbe() : null;
    if (!probe) {
      return [];
    }
    const source = String(probe.source);
    if (source.includes('touch')) {
      return [stickPathItem(str('ui.thumb_sticks'), str('ui.a_thumb_on_glass_has_about'))];
    }
    if (source.includes('keyboard')) {
      return [stickPathItem(str('ui.keyboard'), str('ui.a_key_is_not_a_stick'))];
    }
    const padHz = Number(probe.padHz) || 0;
    const fps = Number(probe.fps) || 0;
    const levels = Number(probe.stickLevels) || 0;
    const perFrame = padHz > 0 && fps > 0 && Math.abs(padHz - fps) <= Math.max(6, fps * 0.15);
    const said = [padHz > 0
      ? str('ui.your_radio_is_refreshing_times_a', { padHz })
      : str('ui.waiting_for_the_radio_to_report')];
    if (perFrame) {
      said.push(str('ui.that_is_your_frame_rate_per', { fps }));
    }
    if (levels > 0 && levels < 512) {
      said.push(str('ui.this_radio_reports_about_steps_across', { levels }));
    }
    const value = padHz > 0 ? str('ui.radio_hz', { padHz }) : str('ui.radio');
    return [stickPathItem(value, said.join(' '), perFrame ? 'row-warn' : undefined)];
  },
};
