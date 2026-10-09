import { str } from '../strings/index.js';
/*
 * input.js: every stick the pilot can fly with, turned into one stream of
 * timestamped samples for the flight controller.
 *
 * Exactly one source flies at a time, chosen fresh on every poll:
 *
 *   1. the harness stick, written by a capture through window.__stick
 *   2. the joystick picker or the calibration wizard, while open (the
 *      sticks are theirs and the craft gets centre and zero throttle)
 *   3. mouse flight, when the pilot picked it in Settings
 *   4. a radio or gamepad, through the map in force (padmap.js); stick
 *      keys still override it channel by channel
 *   5. the thumb sticks on a touch device
 *   6. the keyboard (keyboard.js)
 *
 * The pad is polled on its own timer, faster than the frame rate, and
 * every sample carries the wall time it was read at; main.js maps those
 * onto the RC grid. A sample is queued when anything changed and as a
 * heartbeat every 100 ms otherwise.
 *
 * A standard gamepad on its built-in map rests its throttle at half. So
 * at a spawn or a landing the shell asks for the throttle to be held at
 * zero until the stick has been down, which is Betaflight refusing to arm
 * with throttle up, for the one device that needs it. Anything else flying
 * ends the hold, so a pad plugged back in mid air is never cut.
 *
 * Channels follow sim_abi.h: roll +1 right, pitch +1 nose up, yaw +1 nose
 * right, throttle 0 to 1.
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

import { DEFAULT_STICK_MODE, normaliseStickMode } from './stickmode.js';
import {
  FLIGHT_CHANNELS, builtInKind, builtInMap, normaliseMap, readSticks,
} from './padmap.js';
import { migrateStickStorage, loadStickMap, saveStickMap } from './stickstore.js';
import { KeyboardSticks } from './keyboard.js';
import { MouseStick, MOUSE_CENTRE_KEY } from './mouse.js';
import { PadRoster, connectedPads, shortPadName } from './padpick.js';
import { CalibrationWizard } from './calibrate.js';
import { GuessEvidence } from './guess.js';
import { PadMenus, altButton, floatsButton, lookClick, lookStick, padDirections, startButton, swapButtons } from './menus.js';

export { standardPadMap } from './padmap.js';
export { CAL_STEPS, SELECT_STEP, calSteps } from './calibrate.js';
export {
  MOUSE_SENS, MOUSE_EXPOS, MOUSE_CENTRES, MOUSE_CENTRE_KEY,
} from './mouse.js';
export { NAV_DEFLECT } from './menus.js';
export { throttleKeys } from './keyboard.js';

/* A poll never integrates more than this, however late it comes. */
const LONGEST_POLL_MS = 100;
const HEARTBEAT_MS = 100;
/* Nothing drains the queue while the craft sits landed; past the cap the
 * oldest samples go and the newest are kept. */
const QUEUE_CAP = 2048;
const QUEUE_KEEP = 512;
/* The pad and sample rates are measured over windows this long. */
const RATE_WINDOW_MS = 500;
/* Keys whose browser default (scrolling) would fight the menus. */
const SWALLOWED = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

const CENTRED = () => ({ roll: 0, pitch: 0, yaw: 0, throttle: 0 });
const isTyping = (t) => Boolean(t) && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

export class InputManager {
  constructor() {
    migrateStickStorage();
    this.channels = CENTRED();
    this.queue = [];
    this.source = str('input.the_keyboard');
    this.keys = new Set();
    /* main.js hooks non-stick keys here as (code, repeat). */
    this.onKey = null;
    /* main.js sets this in flight: a physical key to the code it stands
     * for under the pilot's bindings, or null for none (keybinds.js).
     * Unset, every key is itself. */
    this.translateKey = null;
    /* The code each held physical key went down as, so its release lets
     * go of that same code. */
    this.downAs = new Map();
    this.stickMode = DEFAULT_STICK_MODE;
    this.keyboard = new KeyboardSticks(this.stickMode);
    this.mouseStick = new MouseStick();
    /* The thumb sticks, attached by the shell on a touch device. */
    this.touchSource = null;
    /* The harness stick: when set it IS the channels, held until the next
     * write, above every source. Nothing in the shell writes it. */
    this.harnessChannels = null;
    this.map = this.loadMap();
    /* Which built-in layout this.map is while nothing is saved; see
     * builtInKind. 0 is the AETR guess. */
    this.defaultMode = 0;
    this.guess = new GuessEvidence();
    this.menus = new PadMenus();
    this.roster = new PadRoster(() => this.forgetPadFacts());
    this.calibration = null;
    this.calResult = null;
    this.throttleHeld = false;
    this.throttleLow = 0;
    this.throttleWaiting = false;
    this.lastWall = performance.now();
    this.sinceSampleMs = 0;
    this.padFlying = false;
    this.timer = null;
    /* Rates: how often the browser refreshed the pad, how often a sample
     * was queued. A pad rate stuck at the frame rate is a browser that
     * only refreshes pads per frame. */
    this.padStamp = -1;
    this.padRefreshes = 0;
    this.samplesQueued = 0;
    this.rateMs = 0;
    this.padHz = 0;
    this.sampleHz = 0;
    /* The smallest step seen on any mapped axis: a lower bound on the
     * radio's quantum (noise only pushes it down), so a coarse reading is
     * evidence of a coarse radio and a fine one proves nothing. */
    this.lastAxis = new Map();
    this.axisStepMin = 0;
    /* Bound once: the keyboard asks these on every 2 ms poll. */
    this.isHeld = (code) => this.held(code);
    this.isKeyDown = (code) => this.keys.has(code);
    window.addEventListener('keydown', (e) => this.keyDown(e));
    window.addEventListener('keyup', (e) => this.keyUp(e));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.downAs.clear();
    });
    this.roster.seed();
  }

  /*
   * A text field owns its keys: sticks are not flown from a text box, and
   * swallowing the space bar there stopped a pilot typing their own name.
   * Escape still reaches the menus. Elsewhere repeats are swallowed too,
   * or a held arrow scrolls the page under the menu cursor.
   */
  keyDown(e) {
    const { repeat } = e;
    const typing = isTyping(e.target);
    const code = typing ? e.code : this.keyAs(e.code, repeat);
    if (!typing && SWALLOWED.has(e.code)) {
      e.preventDefault();
    }
    if (code === null) {
      return;
    }
    if (!typing && !repeat) {
      this.keys.add(code);
    }
    const heard = typing ? code === 'Escape' && !repeat : true;
    if (heard && this.onKey) {
      this.onKey(code, typing ? false : repeat);
    }
  }

  /* A repeat keeps the code its first press went down as, even if the
   * translation changed under it (the screen left flight). */
  keyAs(physical, repeat) {
    if (repeat && this.downAs.has(physical)) {
      return this.downAs.get(physical);
    }
    const code = this.translateKey ? this.translateKey(physical) : physical;
    this.downAs.set(physical, code);
    return code;
  }

  keyUp(e) {
    const code = this.downAs.has(e.code) ? this.downAs.get(e.code) : e.code;
    this.downAs.delete(e.code);
    if (code !== null) {
      this.keys.delete(code);
    }
  }

  /* ------------------------------------------------- state others read */

  get kb() {
    return this.keyboard.stick;
  }

  get keyAxes() {
    return this.keyboard.springs;
  }

  get throttleKeys() {
    return this.keyboard.throttlePair;
  }

  /* Launch control holding on the pad: the keyboard collective rests at
   * zero, never hover. */
  get forcePadRest() {
    return this.keyboard.padRest;
  }

  set forcePadRest(on) {
    this.keyboard.padRest = on;
  }

  get mouseEnabled() {
    return this.mouseStick.enabled;
  }

  get mouseLive() {
    return this.mouseStick.live;
  }

  get mouseCfg() {
    return this.mouseStick.cfg;
  }

  get mouse() {
    return this.mouseStick.stick;
  }

  get padPick() {
    return this.roster.pick;
  }

  get padPickResult() {
    return this.roster.result;
  }

  get padChoice() {
    return this.roster.choice;
  }

  get mapSeenParked() {
    return this.guess.parked;
  }

  /* --------------------------------------------------------- the map */

  loadMap() {
    return loadStickMap();
  }

  /* A failed write leaves the map calibrated and flying for this tab; the
   * false return lets the shell say it will not outlive it. */
  saveMap() {
    this.map.stored = true;
    return saveStickMap(this.map);
  }

  readGamepad(gp, map = this.map) {
    return readSticks(gp.axes, map);
  }

  /* Trusted for the menus too: the pilot's own map, or the guess once its
   * throttle has been seen parked like a radio's. */
  mapUsable() {
    return Boolean(this.map.stored || this.guess.parked);
  }

  /* Known to fit the device: the pilot's own map, or a layout the device
   * vouches for. The guess's evidence is not gathered on a known map. */
  mapKnown() {
    return Boolean(this.map.stored || this.defaultMode);
  }

  /* While nothing is saved, the built-in map follows the device and the
   * stick mode; the evidence gathered against the old map goes with it. */
  followDefaultMap(gp) {
    if (!gp || this.map.stored) {
      return;
    }
    const kind = builtInKind(gp, this.stickMode);
    if (kind === this.defaultMode) {
      return;
    }
    this.defaultMode = kind;
    this.map = normaliseMap({ ...builtInMap(gp, this.stickMode), stored: false });
    this.guess.forget();
    this.forgetAxisResolution();
  }

  /* ------------------------------------------------- the throttle hold */

  /* At a spawn or landing: hold the throttle at zero until it has been at
   * or below `low`, if (and only if) the pad's throttle rests at half. */
  holdThrottleLow(low) {
    this.throttleLow = low;
    this.throttleHeld = this.throttleRestsHalf();
    this.throttleWaiting = false;
  }

  /* An air start or a take over is already flying. */
  releaseThrottleHold() {
    this.throttleHeld = false;
    this.throttleWaiting = false;
  }

  throttleRestsHalf() {
    const gp = this.firstGamepad();
    return Boolean(gp && gp.mapping === 'standard' && !this.map.stored && this.defaultMode);
  }

  gateThrottle(throttle) {
    if (!this.throttleHeld) {
      return throttle;
    }
    if (throttle <= this.throttleLow) {
      this.releaseThrottleHold();
      return throttle;
    }
    this.throttleWaiting = true;
    return 0;
  }

  /* ------------------------------------------- devices and the picker */

  firstGamepad() {
    return this.roster.selected();
  }

  /* A different device is a different machine: where its sticks rest, the
   * guess's evidence and the measured resolution all start again. */
  forgetPadFacts() {
    this.menus.forget();
    this.guess.forget();
    this.forgetAxisResolution();
  }

  setPadChoice(choice) {
    this.roster.setChoice(choice);
  }

  takePadPickQueue() {
    return this.roster.take();
  }

  requestPadPick(reason) {
    this.roster.request(reason);
  }

  startPadPick(reason) {
    return this.roster.start(reason);
  }

  cancelPadPick() {
    this.roster.cancel();
  }

  skipPadPick() {
    this.roster.skip();
  }

  acceptPadPick() {
    return this.roster.accept();
  }

  rejectPadPick() {
    this.roster.refuse();
  }

  padPickView() {
    return this.roster.view();
  }

  runPadPick(dtMs) {
    this.roster.run(dtMs);
  }

  /*
   * What the shell says about the stick in use: which device, how many
   * buttons (0 means every switch is an axis), whether a menu switch is
   * assigned, whether the map is calibrated, usable or known, and whether
   * the guess has caught a radio with no yaw.
   */
  padSummary() {
    const pads = connectedPads();
    const gp = this.firstGamepad();
    let using = 'Keyboard';
    if (gp) {
      const n = pads.findIndex((p) => p.index === gp.index && p.id === gp.id) + 1;
      const name = shortPadName(gp.id);
      using = n > 0 ? str('input.joystick_2', { n, shortPadName: name }) : name;
    }
    return {
      count: pads.length,
      using,
      buttons: gp && gp.buttons ? gp.buttons.length : 0,
      hasSelect: Boolean(this.map && this.map.select),
      calibrated: Boolean(this.map && this.map.stored),
      mapUsable: this.mapUsable(),
      guessNoYaw: this.guess.noYaw,
      mapKnown: this.mapKnown(),
    };
  }

  /* ---------------------------------------------------------- menus */

  /* On a radio with no buttons, the wizard's freshly assigned switch works
   * on its own check step, before it is saved. */
  padMenuButtons() {
    const c = this.calibration;
    const spec = c && c.draft ? (c.draft.select || this.map.select) : this.map.select;
    return this.menus.buttons(this.firstGamepad(), spec);
  }

  navRaw() {
    return this.menus.cursor(this.firstGamepad());
  }

  padSwapButtons() {
    return swapButtons(this.firstGamepad());
  }

  padAltButton() {
    return altButton(this.firstGamepad());
  }

  padLookStick() {
    return lookStick(this.firstGamepad());
  }

  padStartButton() {
    return startButton(this.firstGamepad());
  }

  padFloatsButton() {
    return floatsButton(this.firstGamepad());
  }

  padLookClick() {
    return lookClick(this.firstGamepad());
  }

  padDirections() {
    return padDirections(this.firstGamepad());
  }

  /* ------------------------------------------------ the calibration */

  startCalibration() {
    this.calResult = null;
    this.calibration = CalibrationWizard.fresh(this.firstGamepad());
  }

  /* The check step alone, over the saved map. */
  startCalibrationCheck() {
    this.calResult = null;
    const gp = this.firstGamepad();
    if (!gp) {
      return false;
    }
    this.calibration = CalibrationWizard.checkOf(gp, this.map);
    return true;
  }

  reverseChannel(channel) {
    return Boolean(this.calibration) && this.calibration.reverse(channel);
  }

  /* Reverses whichever channel the pilot is moving, and names it. */
  reverseMovingChannel() {
    const moving = this.calibrationView()?.moving;
    return moving && this.reverseChannel(moving) ? moving : null;
  }

  cancelCalibration() {
    this.calibration = null;
    this.calResult = 'cancelled';
  }

  skipCalibrationSelect() {
    return Boolean(this.calibration) && this.calibration.skipMenuSwitch();
  }

  zeroThrottleHere() {
    return Boolean(this.calibration) && this.calibration.zeroThrottleAt(this.firstGamepad());
  }

  /*
   * The draft becomes the flying map. A new map is a new transducer and
   * answers the guess by existing, so what was learned against the old one
   * goes. calResult says whether it reached storage ('saved') or only this
   * tab ('saved-unstored').
   */
  acceptCalibration() {
    const c = this.calibration;
    if (!c || !c.complete()) {
      return false;
    }
    this.map = normaliseMap({ ...c.draft, stored: true });
    this.forgetAxisResolution();
    this.guess.forget();
    this.calResult = this.saveMap() ? 'saved' : 'saved-unstored';
    this.calibration = null;
    return true;
  }

  calibrationView() {
    return this.calibration ? this.calibration.view(this.firstGamepad(), this.stickMode) : null;
  }

  runCalibration(gp, dtMs) {
    this.calibration.poll(gp, dtMs);
  }

  /* ------------------------------------------- keyboard, mouse, touch */

  readKeyboard(dtMs, springThr = false) {
    return this.keyboard.read(dtMs, this.isHeld, this.isKeyDown, springThr);
  }

  /* A key, or a mouse button standing in for one. */
  held(code) {
    return this.keys.has(code) || this.mouseStick.buttonKeys.has(code);
  }

  throttleKeyHeld() {
    return this.keys.has(this.throttleKeys.up) || this.keys.has(this.throttleKeys.down);
  }

  /* After a reset or a harness poke nothing may spring back toward hover,
   * the wheel's held throttle comes down, and the thumbs' sticky throttle
   * too, or a crash recovery relaunches the wreck by itself. */
  resetKeyboardSticks() {
    this.keyboard.reset();
    this.mouseStick.zero();
    if (this.touchSource) {
      this.touchSource.reset();
    }
  }

  setMouseConfig(cfg) {
    this.mouseStick.configure(cfg, this);
  }

  setMouseLive(live) {
    this.mouseStick.setLive(live);
  }

  /* From the SETTING, so a turtle recovery does not change the feel. */
  setMouseCraft(wing, rates) {
    this.mouseStick.setCraft(wing, rates);
  }

  mouseCentring() {
    return this.mouseStick.centring();
  }

  mouseThrottleStep() {
    return this.mouseStick.throttleStep();
  }

  mouseMove(dx, dy) {
    this.mouseStick.move(dx, dy);
  }

  mouseWheel(deltaY, deltaMode = 0) {
    this.mouseStick.wheel(deltaY, deltaMode);
  }

  mouseButton(button, down) {
    const [, minus, plus] = this.keyAxes.find(([ch]) => ch === 'yaw');
    this.mouseStick.button(button, down, [minus, plus]);
  }

  /* The mouse rung: the wheel's throttle moves with the throttle keys at
   * the slider's rate, and a held stick key wins its channel. */
  readMouse(dtMs) {
    const m = this.mouseStick;
    m.settle(dtMs, this.keys.has(MOUSE_CENTRE_KEY));
    this.kb.throttle = m.stick.thr;
    const keys = this.readKeyboard(dtMs, false);
    if (this.throttleKeyHeld()) {
      m.stick.thr = keys.throttle;
    }
    return this.overKeys({ ...m.shapedStick(), yaw: 0, throttle: m.stick.thr }, keys);
  }

  /* Any stick key held wins its channel over the source underneath. */
  overKeys(next, keys) {
    for (const ch of ['roll', 'pitch', 'yaw']) {
      if (keys[ch] !== 0) {
        next[ch] = keys[ch];
      }
    }
    return next;
  }

  attachTouch(source) {
    this.touchSource = source;
    this.tellTouchMode();
  }

  tellTouchMode() {
    if (this.touchSource && typeof this.touchSource.setStickMode === 'function') {
      this.touchSource.setStickMode(this.stickMode);
    }
  }

  /*
   * The pilot's stick mode reaches the keyboard and the thumb sticks (a
   * radio applies its own). A key may now mean another channel, so the
   * sprung keyboard channels restart from centre; the collective carries
   * over, as a radio's throttle does not jump.
   */
  setStickMode(mode) {
    const m = normaliseStickMode(mode);
    if (m !== this.stickMode) {
      this.stickMode = m;
      this.keyboard.setMode(m);
      this.keyboard.centreSprings();
      this.tellTouchMode();
    }
    return m;
  }

  /* ------------------------------------------------- who is flying */

  /* Picking the mouse is a choice; a radio is merely present. The picker
   * and the wizard still come first because they are on the screen. */
  isMousePrimary() {
    return this.mouseEnabled && !this.harnessChannels && !this.padPick && !this.calibration;
  }

  /* The keyboard with no radio enumerated; keys over a radio do not count. */
  isKeyboardPrimary() {
    return this.firstGamepad() === null;
  }

  isTouchPrimary() {
    return this.firstGamepad() === null && !this.mouseEnabled
      && Boolean(this.touchSource && this.touchSource.active());
  }

  /* ---------------------------------------------------------- polling */

  /*
   * One reading of whatever is flying. `nowWall` may come from the frame
   * (its start) or the timer; a reading is never stamped before the last
   * one, so neither springs nor stamps ever run backwards.
   */
  poll(nowWall) {
    const t = Math.max(nowWall, this.lastWall);
    const dtMs = Math.min(t - this.lastWall, LONGEST_POLL_MS);
    this.lastWall = t;
    const gp = this.firstGamepad();
    this.roster.track();
    this.followDefaultMap(gp);
    this.measureRates(gp, dtMs);
    const next = this.readSource(gp, dtMs);
    if (!this.padFlying) {
      this.releaseThrottleHold();
    }
    const was = this.channels;
    const moved = next.roll !== was.roll || next.pitch !== was.pitch || next.yaw !== was.yaw || next.throttle !== was.throttle;
    this.sinceSampleMs += dtMs;
    if (!moved && this.sinceSampleMs < HEARTBEAT_MS) {
      return;
    }
    this.sinceSampleMs = 0;
    this.channels = next;
    this.queue.push({ wallT: t, ...next });
    this.samplesQueued += 1;
    if (this.queue.length > QUEUE_CAP) {
      this.queue.splice(0, this.queue.length - QUEUE_KEEP);
    }
  }

  measureRates(gp, dtMs) {
    if (gp && gp.timestamp !== this.padStamp) {
      this.padStamp = gp.timestamp;
      this.padRefreshes += 1;
      this.noteAxisResolution(gp);
    }
    this.rateMs += dtMs;
    if (this.rateMs >= RATE_WINDOW_MS) {
      this.padHz = Math.round((this.padRefreshes * 1000) / this.rateMs);
      this.sampleHz = Math.round((this.samplesQueued * 1000) / this.rateMs);
      this.padRefreshes = 0;
      this.samplesQueued = 0;
      this.rateMs = 0;
    }
  }

  /* The ladder in the header, top rung first. */
  readSource(gp, dtMs) {
    if (this.harnessChannels) {
      const next = { ...this.harnessChannels };
      /* So releasing the harness hands the collective back where it was. */
      this.kb.throttle = next.throttle;
      return this.from(str('input.the_harness_override'), next);
    }
    if (this.padPick) {
      this.runPadPick(dtMs);
      return this.from(str('input.the_joystick_picker'), CENTRED());
    }
    if (this.calibration) {
      this.runCalibration(gp, dtMs);
      return this.from(str('input.the_calibration_wizard'), CENTRED());
    }
    if (this.mouseEnabled) {
      return this.from(str('input.the_mouse'), this.readMouse(dtMs));
    }
    if (gp) {
      this.padFlying = true;
      return this.readPad(gp, dtMs);
    }
    if (this.touchSource && this.touchSource.active()) {
      /* Every poll, not only on touches: the spring back is time. */
      return this.from(str('input.the_touch_sticks'), this.touchSource.sample(dtMs));
    }
    return this.from(str('input.the_keyboard'), this.readKeyboard(dtMs, true));
  }

  /* Any rung but the pad's: the throttle hold is the pad's alone. */
  from(source, next) {
    this.source = source;
    this.padFlying = false;
    return next;
  }

  readPad(gp, dtMs) {
    const next = this.readGamepad(gp);
    next.throttle = this.gateThrottle(next.throttle);
    if (!this.mapKnown()) {
      this.guess.observe(gp, this.map);
    }
    this.source = this.mapUsable() || this.mapKnown() ? str('input.a_radio') : str('input.a_radio_whose_stick_order_is');
    const keys = this.readKeyboard(dtMs, false);
    this.overKeys(next, keys);
    if (this.throttleKeyHeld()) {
      next.throttle = keys.throttle;
    } else {
      /* The keys' slider follows the pad, so pressing one starts there. */
      this.kb.throttle = next.throttle;
    }
    return next;
  }

  /* 2 ms is asked for; browsers clamp it and a busy frame delays it,
   * which is why every sample is stamped. Polling from the frame as well
   * is harmless: dt is measured from the last reading either way. */
  startPolling(periodMs = 2) {
    if (this.timer === null) {
      this.timer = setInterval(() => this.poll(performance.now()), periodMs);
    }
  }

  stopPolling() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /* --------------------------------------------------- measurements */

  /* On a pad refresh only: re-reading an unchanged axis says nothing. */
  noteAxisResolution(gp) {
    const m = this.map;
    if (!m) {
      return;
    }
    for (let k = 0; k < FLIGHT_CHANNELS.length; k += 1) {
      const a = m[FLIGHT_CHANNELS[k]] && m[FLIGHT_CHANNELS[k]].axis;
      if (!Number.isInteger(a) || a >= gp.axes.length || !Number.isFinite(gp.axes[a]) || this.axisSeenBefore(k, a)) {
        continue;
      }
      const now = gp.axes[a];
      const was = this.lastAxis.get(a);
      this.lastAxis.set(a, now);
      const step = was === undefined ? 0 : Math.abs(now - was);
      if (step > 0 && (this.axisStepMin === 0 || step < this.axisStepMin)) {
        this.axisStepMin = step;
      }
    }
  }

  /* Two channels on one axis are one transducer: measure it once. */
  axisSeenBefore(k, axis) {
    for (let j = 0; j < k; j += 1) {
      const spec = this.map[FLIGHT_CHANNELS[j]];
      if (spec && spec.axis === axis) {
        return true;
      }
    }
    return false;
  }

  /* A new device or map is a new transducer. */
  forgetAxisResolution() {
    this.lastAxis.clear();
    this.axisStepMin = 0;
  }

  /* stickLevels is the smallest step as steps across the full -1..1
   * travel ("256" reads better in a report than "0.0078"); 0 means the
   * stick has not moved enough to say. */
  stats() {
    const step = this.axisStepMin;
    const { padHz, sampleHz, source } = this;
    return {
      padHz, sampleHz, queued: this.queue.length, source, axisStepMin: step, stickLevels: step > 0 ? Math.round(2 / step) : 0,
    };
  }

  drain() {
    const q = this.queue;
    this.queue = [];
    return q;
  }
}
