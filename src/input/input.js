import { str } from '../strings/index.js';
/*
 * input.js: stick input for the shell.
 *
 * Sources, in priority order:
 *   1. A radio or controller in joystick mode via the Gamepad API. The
 *      first pad in navigator.getGamepads() is the OS order, which on
 *      Windows follows the Game Controllers list and is not something a
 *      pilot can rearrange without unplugging. Settings, Choose joystick
 *      and the boot/hotplug picker learn which device they meant by a
 *      wiggle, then store id plus index. Axis order and polarity still
 *      differ per radio, so a calibration wizard (Settings, Calibrate
 *      sticks) learns the mapping the usual way: centre, full range, then
 *      one named deflection per channel with a return to rest between
 *      each, then a live check before anything is saved. Until calibrated
 *      a common AETR guess is used for flight, and menu navigation falls
 *      back to any axis at all, so the wizard is always reachable. The
 *      guess is not treated as broken on principle: a radio's throttle is
 *      parked off centre because it has no centring spring, and a guess
 *      seen doing that is trusted for the menus too. See mapUsable.
 *   2. Keyboard: WASD plus arrows mimic a Mode 2 radio. A/D are yaw,
 *      arrows are the right stick: up arrow pushes the stick forward
 *      (nose down), left and right arrows roll. Rate limited so it is
 *      flyable. W/S are a collective, not a latched slider: a radio
 *      throttle is analog and stays where the stick is, a key is digital
 *      and cannot. Hold time is the analog: a tap is a nudge, a longer
 *      hold moves the stick further, a long hold opens to full, and
 *      letting go springs back (to centre on the right stick, to hover
 *      on throttle once airborne). A connected radio keeps its own
 *      analog throttle.
 *
 * Channels are the sim_abi.h convention: roll +1 right, pitch +1 nose up
 * (stick pulled back), yaw +1 nose right, throttle 0..1.
 *
 * Every change is queued as a sample stamped with performance.now(); the
 * main loop maps those wall timestamps onto the simulated clock and the
 * module consumes them by timestamp, per STAGE1.md. WebHID raw report
 * input arrives in a later turn; joystick mode radios are gamepads and
 * take this path.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import {
  DEFAULT_STICK_MODE, normaliseStickMode,
} from './stickmode.js';
import {
  builtInKind, builtInMap, normaliseMap, centredReading, readSticks,
} from './padmap.js';
import {
  migrateStickStorage, loadStickMap, saveStickMap,
} from './stickstore.js';
import { KeyboardSticks } from './keyboard.js';
import { MouseStick, MOUSE_CENTRE_KEY } from './mouse.js';
import {
  PadRoster, connectedPads, shortPadName,
} from './padpick.js';
import { CalibrationWizard } from './calibrate.js';

export { CAL_STEPS, SELECT_STEP, calSteps } from './calibrate.js';

export {
  MOUSE_SENS, MOUSE_EXPOS, MOUSE_CENTRES, MOUSE_CENTRE_KEY,
} from './mouse.js';

export { throttleKeys } from './keyboard.js';

export { standardPadMap } from './padmap.js';


/* How long any axis must be held off rest to count as one select, on a
 * radio that reports no buttons and has no menu switch assigned. */
const SELECT_HOLD_MS = 700;

/* How far a stick has to leave centre to count as a menu keypress. Shared
 * with main.js padNav, which used to spell it out four more times. */
export const NAV_DEFLECT = 0.55;
const IDENT_CHANNELS = ['throttle', 'roll', 'pitch', 'yaw'];

/* When the AETR guess is describing somebody else's radio. See
 * noteGuessOrder for what each of these is watching for. */
const GUESS = {
  /* Yaw counts as alive once it has swept this far. A deliberate yaw input
   * is a whole stick: trim, noise and a knocked gimbal are nowhere near it. */
  YAW_ALIVE: 0.30,
  /* An axis the guess does not name has swept this far. The same number the
   * wizard calls a full stick, the 0.55 of calibrate.js. */
  STRAY_SWEPT: 0.55,
  /* And has been seen at this many distinct levels, which is what tells a
   * gimbal from a switch. A two position switch offers two, a three
   * position switch three, a swept stick dozens. */
  STRAY_LEVELS: 6,
  /* The quantiser those levels are counted in. Coarse enough that jitter on
   * a float axis cannot manufacture them. */
  LEVEL_STEP: 1 / 16,
};

export class InputManager {
  constructor() {
    migrateStickStorage();
    this.channels = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
    this.queue = [];
    this.source = str('input.the_keyboard');
    /* The thumb sticks, when a touch device mounted them: an object with
     * active(), sample(dtMs) and reset(), from src/input/touchsticks.js.
     * Sits under a radio and over the keyboard in poll()'s ladder. */
    this.touchSource = null;
    this.keys = new Set();
    this.keyboard = new KeyboardSticks(DEFAULT_STICK_MODE);
    /*
     * The harness stick, set through window.__stick and nothing else. When
     * non-null it IS the channels, held like a radio's gimbals until the
     * next write, above every source in poll()'s ladder. It exists because
     * the keyboard path recomputes its axes from held KEYS every poll, so a
     * value written into this.kb evaporated one poll later and a capture
     * literally could not hold a stick: the og card round measured the
     * fallout, several runs of a craft that could not leave the grass.
     * Nothing in the shell writes this; a pilot never meets it.
     */
    this.harnessChannels = null;
    this.map = this.loadMap();
    this.roster = new PadRoster(() => this.forgetPadFacts());
    this.calibration = null;
    this.calResult = null;
    this.lastWall = performance.now();
    this.padArmed = false; /* set once the pad's menu buttons are seen released */
    this.navRest = null;   /* axis rest values, for uncalibrated menu nav */
    /* Whether the axis the AETR guess calls the throttle has ever been seen
     * parked away from centre. See mapUsable. Reset with the pad, because it
     * is a fact about one radio and not about this browser. */
    this.mapSeenParked = false;
    /* The travel seen on every axis while flying an uncalibrated map, and
     * the two verdicts drawn from it. Reset with the pad, same reason. See
     * noteGuessOrder. */
    this.guessSpan = null;
    this.guessYawAlive = false;
    this.guessWrongOrder = false;
    /* Which built in map this.map is while nothing is stored: the stick
     * mode it was built for when the pad is a standard one, 0 for AETR.
     * See followDefaultMap. */
    this.defaultMode = 0;
    /* The throttle hold for a pad whose throttle rests at half: set by the
     * shell at a spawn or a landing, cleared by the throttle going low. See
     * holdThrottleLow. `throttleLow` is the level that clears it, and
     * throttleWaiting is whether a throttle is being held back right now. */
    this.throttleHeld = false;
    this.throttleLow = 0;
    this.throttleWaiting = false;
    /* The hold-to-select bootstrap for a radio reporting zero buttons.
     * See SELECT_STEP. */
    this.holdMs = 0;
    this.holdFired = false;
    this.holdAt = 0;
    this.onKey = null; /* main.js hooks non stick keys here; (code, repeat) */
    /* Which stick carries which channel, for the keyboard and for every
     * gimbal this shell draws. A radio's mode lives in the radio. See
     * stickmode.js. */
    this.stickMode = DEFAULT_STICK_MODE;
    /* Mouse flight, off unless picked in Settings. The shell owns the
     * pointer lock and says through setMouseLive when the mouse is flying. */
    this.mouseStick = new MouseStick();

    /*
     * STICK RATE, AND WHY IT IS NOT THE FRAME RATE ANY MORE.
     *
     * poll() used to be called once per rendered frame and main.js used the
     * newest sample for every RC frame in that render frame. At 60 fps the
     * flight controller therefore saw the same stick value four times and
     * then a jump, while updateRcRefreshRate told it the link was 250 Hz.
     * Two things follow, and the second is the one a pilot feels.
     *
     * Betaflight auto-tunes its rc smoothing cutoffs from the interval it
     * measures, so it filtered for a 250 Hz link and the 60 Hz staircase
     * walked through it. And feedforward is the DERIVATIVE of the setpoint
     * between rc frames, so it saw zero, zero, zero, spike: an impulse train
     * at frame rate instead of a signal. Feedforward is most of what makes a
     * quad feel connected to your thumb.
     *
     * So the pad is polled on its own timer now, independent of
     * requestAnimationFrame, and every sample carries the wall clock time it
     * was taken at. main.js maps those onto the RC grid by timestamp.
     *
     * Whether that actually yields fresher data is a property of the browser
     * and the device, not something this file can assert, so it is MEASURED:
     * padHz counts how often the Gamepad object's own timestamp changes, and
     * sampleHz counts what reaches the queue. If padHz sits at the frame rate
     * the browser is rAF-locked and only WebHID will fix it.
     */
    this.timer = null;
    this.padStamp = -1;
    this.padUpdates = 0;
    this.samplesTaken = 0;
    this.rateWindowMs = 0;
    this.padHz = 0;
    this.sampleHz = 0;

    /*
     * STICK RESOLUTION, AND WHY THE MEASUREMENT IS ONE SIDED.
     *
     * padHz says how OFTEN the browser refreshes a stick. It says nothing
     * about how FINELY. A radio in USB joystick mode reports each axis with
     * whatever bit depth its firmware chose, the browser normalises that to
     * a float, and two radios on the same desk can hand this page travel
     * quantised to 256 steps or to 65,536. The coarse one steps its way
     * through a rate curve, and feedforward is the DERIVATIVE of the
     * setpoint, so a step is a spike. That is one of the two ways a report
     * can say "twitchy" about code that did not change.
     *
     * What is recorded is the smallest non-zero change seen on any mapped
     * axis since the pad was picked. For a genuine quantiser that IS the
     * step, because every change is a whole number of them.
     *
     * READ IT IN ONE DIRECTION ONLY. Noise, a browser's own normalisation
     * arithmetic and a float axis all push the minimum DOWN, never up. So a
     * coarse reading is evidence and a fine one is not: 0.0078 means eight
     * bits and can be believed, while 1e-7 means only "nothing coarse was
     * seen yet", which is the answer before the stick has properly moved.
     */
    this.axisPrev = new Map();
    this.axisStepMin = 0;

    window.addEventListener('keydown', (e) => {
      /*
       * A text field owns its own keys. This listener is on the window and
       * the fields below it (the pilot name, the course name, the board
       * address, the FC dump) do not stop propagation for anything but
       * Enter and Escape, so without this bail out the preventDefault below
       * ate the space bar: a pilot could not type a space in their own name,
       * and the arrows could not move the caret. Sticks are not flown from a
       * text box, so swallowing the whole event here is right.
       */
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        /* Escape still belongs to the menu: a focused rates field or CLI
         * dump used to swallow it, so the FC screen had no leave key. */
        if (e.code === 'Escape' && !e.repeat && this.onKey) {
          this.onKey(e.code, false);
        }
        return;
      }
      if (!e.repeat) {
        this.keys.add(e.code);
      }
      if (this.onKey) {
        this.onKey(e.code, e.repeat);
      }
      /* Repeats must preventDefault too. Skipping them used to let ArrowDown
       * scroll the menu while the cursor stayed put, then a synthetic
       * mousemove snapped the highlight back to the row under the mouse. */
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    this.roster.seed();
  }

  /* The keyboard's state, where main.js and the checks have always read it. */
  /* Mouse flight's state, where main.js and the checks read it. */
  /* The picker's state, where main.js reads it. */
  get padPick() {
    return this.roster.pick;
  }

  get padPickResult() {
    return this.roster.result;
  }

  get padChoice() {
    return this.roster.choice;
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

  get kb() {
    return this.keyboard.stick;
  }

  get keyAxes() {
    return this.keyboard.springs;
  }

  get throttleKeys() {
    return this.keyboard.throttlePair;
  }

  /* Launch control holding on the pad: the collective rests at zero. */
  get forcePadRest() {
    return this.keyboard.padRest;
  }

  set forcePadRest(on) {
    this.keyboard.padRest = on;
  }

  loadMap() {
    return loadStickMap();
  }

  /*
   * A failed write still leaves the map stored = true and flying: it is
   * calibrated, it just will not outlive this tab. The false return is what
   * lets the shell tell the pilot so instead of claiming it was saved.
   */
  saveMap() {
    this.map.stored = true;
    return saveStickMap(this.map);
  }

  /*
   * IS THE BUILT IN GUESS ACTUALLY THIS RADIO'S STICK ORDER?
   *
   * AETR_MAP is not a placeholder, it is AETR: the order every real
   * transmitter in joystick mode reports, and the order this page's own
   * advice tells a pilot to put their radio in. A pilot with such a radio
   * plugs it in, the sticks fly the quad correctly, and they never open the
   * wizard because nothing is wrong. The shell called that pilot's radio
   * "not calibrated yet" on the front page, in red, forever. Reported as a
   * bug, and it is one: the claim was about a FLAG, `map.stored`, which
   * records whether somebody has been through the wizard, not whether the
   * mapping is right.
   *
   * There is a cheap observation that tells the two apart, and it is the
   * throttle. A THROTTLE DOES NOT SPRING BACK. On a Mode 2 transmitter the
   * left gimbal has no vertical centring spring, so a parked radio leaves
   * that axis sitting at one end, and the axis AETR_MAP calls the
   * throttle reads near -1 with nobody touching it. Every other axis on the
   * machine is spring centred and reads about zero. So if the guessed
   * throttle axis is parked off centre, the guess is describing a real
   * throttle and the mapping is behaving like a radio's.
   *
   * If it is NOT, the guess is wrong in the way that matters most: a
   * gamepad, where axis 2 is half of the right stick, would have "throttle"
   * spring centred at half power. That pilot does need the wizard and is
   * told so.
   *
   * Sticky, because a pilot who moves the throttle through centre has not
   * suddenly acquired a different radio, and a warning that blinks is worse
   * than either answer.
   */
  noteThrottleParked(gp) {
    if (this.mapSeenParked || this.mapKnown()) {
      return;
    }
    const spec = this.map.throttle;
    if (!gp || !spec || !Number.isInteger(spec.axis) || spec.axis >= gp.axes.length) {
      return;
    }
    if (Math.abs(gp.axes[spec.axis]) > 0.35) {
      this.mapSeenParked = true;
    }
  }

  /*
   * AND IS THE GUESS'S YAW REALLY THIS RADIO'S YAW?
   *
   * noteThrottleParked asks the best single question there is about the
   * guess, and a parked throttle is a real answer. But it is ONE AXIS OUT
   * OF FOUR, and it is the only one anything was ever asking about. A radio
   * can satisfy it and still be wrong everywhere else: AETR puts yaw on
   * axis 3, and plenty of transmitters in joystick mode put a slider, a
   * knob or a switch there and yaw further out. That pilot flies with roll,
   * pitch and throttle correct and NO YAW AT ALL, and because the throttle
   * parked, the shell has already decided the guess is behaving like a
   * radio and says nothing at all.
   *
   * Three tickets off the board are this, and none of them knew it:
   * "My yaw doesn't work", "Cant yaw", "No yaw, automatic eject". The third
   * is the same fault read from the other end, a spring centred axis being
   * flown as a throttle, which is a quad that takes off on its own.
   *
   * The observation needs no wizard and costs one pass over the axes. Watch
   * how far each axis has ever travelled. If the axis the guess calls yaw
   * has never left centre, while an axis the guess does not name has swept
   * a full stick's worth AND has been seen at enough distinct levels to be
   * a gimbal rather than a switch, then the pilot is flying a map that does
   * not describe their radio, and the thing they cannot do is yaw.
   *
   * ALIVE LATCHES AND ALIVE WINS. The moment yaw moves once the question is
   * settled in the guess's favour for good, and nothing this function could
   * see afterwards is allowed to reopen it, for the reason on
   * noteThrottleParked: a warning that blinks is worse than either answer.
   *
   * The wrong verdict is NOT a latch of the same kind. It holds until yaw
   * moves, and then it clears, once, permanently. The first draft latched
   * both and returned early on either, which meant the one false positive
   * this can produce, a pilot whose yaw is mapped correctly, who has not
   * touched it yet, and who has swept some other proportional control a
   * long way, got a warning that STAYED UP after they went on to yaw and
   * proved it wrong, until they calibrated or re-picked the pad. The row's
   * own words are "has not moved once", and a row that keeps saying that
   * after it has moved is the blinking warning's uglier cousin. So the
   * spans keep being watched while the row is up, and yaw moving takes it
   * down. That is one transition, not a blink, and it is the transition
   * the sentence above says matters most.
   *
   * What is left is that same pilot seeing the row until the first time
   * they yaw. They get a row offering calibration, and calibration is not a
   * wrong thing to offer them.
   */
  noteGuessOrder(gp) {
    if (this.mapKnown() || this.guessYawAlive) {
      return;
    }
    const n = Math.min(gp.axes.length, 8);
    if (!this.guessSpan || this.guessSpan.length !== n) {
      this.guessSpan = [];
      for (let i = 0; i < n; i += 1) {
        this.guessSpan.push({ lo: gp.axes[i], hi: gp.axes[i], levels: new Set() });
      }
    }
    for (let i = 0; i < n; i += 1) {
      const v = gp.axes[i];
      const seen = this.guessSpan[i];
      if (v < seen.lo) {
        seen.lo = v;
      }
      if (v > seen.hi) {
        seen.hi = v;
      }
      /* Bounded: once it is proportional enough, stop counting. */
      if (seen.levels.size < GUESS.STRAY_LEVELS) {
        seen.levels.add(Math.round(v / GUESS.LEVEL_STEP));
      }
    }
    const yawAxis = this.map.yaw && Number.isInteger(this.map.yaw.axis)
      ? this.map.yaw.axis
      : -1;
    if (yawAxis < 0 || yawAxis >= n) {
      return;
    }
    if (this.guessSpan[yawAxis].hi - this.guessSpan[yawAxis].lo >= GUESS.YAW_ALIVE) {
      this.guessYawAlive = true;
      this.guessWrongOrder = false;
      return;
    }
    /* Decided, and still watching yaw above: nothing below can change. */
    if (this.guessWrongOrder) {
      return;
    }
    const named = new Set();
    for (const ch of IDENT_CHANNELS) {
      const spec = this.map[ch];
      if (spec && Number.isInteger(spec.axis)) {
        named.add(spec.axis);
      }
    }
    for (let i = 0; i < n; i += 1) {
      if (named.has(i)) {
        continue;
      }
      const seen = this.guessSpan[i];
      if (seen.hi - seen.lo >= GUESS.STRAY_SWEPT && seen.levels.size >= GUESS.STRAY_LEVELS) {
        this.guessWrongOrder = true;
        return;
      }
    }
  }

  /* Can the mapping be trusted for more than flying: a pilot's own map
   * always, and the AETR guess once it has behaved like a radio. This is
   * what decides whether the menus let the sticks move left and right, and
   * whether the front page says anything at all. */
  mapUsable() {
    return Boolean(this.map.stored || this.mapSeenParked);
  }

  /*
   * Is the map in force known to describe this device, rather than a guess
   * waiting on evidence: the pilot's own, or a standard pad's default,
   * whose layout the browser vouches for. The two radio heuristics above
   * do not run on a known map, because a gamepad's sprung sticks would feed
   * them a parked throttle or a stray gimbal that is neither. It is
   * deliberately NOT mapUsable: that one also decides how the menus read
   * the sticks, and a standard pad's menus stay as they were.
   */
  mapKnown() {
    return Boolean(this.map.stored || this.defaultMode);
  }

  /*
   * THROTTLE LOW FIRST, which is Betaflight refusing to arm with the
   * throttle up, for the one stick that needs it.
   *
   * A standard pad on its default map rests its throttle at half, which is
   * past the shell's takeoff threshold, so every spawn and every landing
   * launched the aircraft with nobody touching anything: a quad lifted off,
   * a wing was thrown, a plane on wheels began its roll. So at a spawn or a
   * landing the shell calls this, and until the pad's throttle has been at
   * or below `low` the throttle it reports is zero. The plant is fed from
   * those samples, so what it never sees it never flies on.
   *
   * ONLY THAT PAD. A radio parks its throttle at the bottom, the keyboard,
   * the mouse wheel and the thumbs start from zero or hold what the pilot
   * set, and a calibrated gamepad already has zero at rest, so for all of
   * them this sets nothing and every sample is what it was before. The
   * decision is taken now, at the spawn or landing, so a hold can never
   * start in the air.
   */
  holdThrottleLow(low) {
    this.throttleLow = low;
    this.throttleHeld = this.throttleRestsHalf();
    this.throttleWaiting = false;
  }

  /* An aircraft put straight into the air (an air start, a take over) is
   * flying, and a throttle held at zero would drop it. */
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

  /*
   * Keep the built in map matched to the pad and the stick mode, while
   * nothing is stored. Run from poll, so a pad swapped for a radio, or a
   * mode changed in Settings, takes effect on the next sample. The guess's
   * evidence is dropped with the map it was gathered against, as
   * acceptCalibration drops it.
   */
  followDefaultMap(gp) {
    if (!gp || this.map.stored) {
      return;
    }
    const mode = builtInKind(gp, this.stickMode);
    if (mode === this.defaultMode) {
      return;
    }
    this.defaultMode = mode;
    this.map = normaliseMap({ ...builtInMap(gp, this.stickMode), stored: false });
    this.mapSeenParked = false;
    this.guessSpan = null;
    this.guessYawAlive = false;
    this.guessWrongOrder = false;
    this.forgetAxisResolution();
  }

  firstGamepad() {
    return this.roster.selected();
  }

  /* A different device is a different machine: everything learned about
   * the last one (where its sticks rest, whether its throttle parks, how
   * its axes have moved, how finely it reports) starts again. */
  forgetPadFacts() {
    this.navRest = null;
    this.padArmed = false;
    this.mapSeenParked = false;
    this.guessSpan = null;
    this.guessYawAlive = false;
    this.guessWrongOrder = false;
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

  padSummary() {
    const pads = connectedPads();
    const selected = this.firstGamepad();
    let using = 'Keyboard';
    if (selected) {
      const n = pads.findIndex((g) => g.index === selected.index && g.id === selected.id) + 1;
      using = n > 0 ? str('input.joystick_2', { n, shortPadName: shortPadName(selected.id) }) : shortPadName(selected.id);
    } else if (this.roster.choice && this.roster.choice.kind === 'none') {
      using = 'Keyboard';
    }
    return {
      count: pads.length,
      using,
      /*
       * What the shell needs to say when a radio cannot be used, rather
       * than leaving the pilot to work it out from a cursor that moves and
       * an Enter that does nothing. See SELECT_STEP.
       *
       * buttons     0 means every switch on this radio arrives as an axis.
       * hasSelect   a menu switch has been assigned in the wizard.
       * calibrated  the axis map is this pilot's, not the AETR guess. Until
       *             it is, navRaw gives up and down only, so no value row
       *             can be adjusted from the sticks.
       */
      buttons: selected && selected.buttons ? selected.buttons.length : 0,
      hasSelect: Boolean(this.map && this.map.select),
      calibrated: Boolean(this.map && this.map.stored),
      /* mapUsable  the mapping is this pilot's, or the AETR guess has been
       *            seen behaving like a radio. See mapUsable. */
      mapUsable: this.mapUsable(),
      /* guessNoYaw the guess's yaw axis has never moved while another axis
       *            the guess cannot see has been swept like a gimbal. The
       *            pilot has no yaw and does not know why. See
       *            noteGuessOrder. */
      guessNoYaw: this.guessWrongOrder,
      /* mapKnown   the pilot's own map, or a standard pad's default. See
       *            mapKnown. Neither is a guess to warn about. */
      mapKnown: this.mapKnown(),
    };
  }

  /*
   * Menu buttons on the first gamepad: index 1 goes back, indices 0, 2
   * and 3 select. Not every button, because a radio in joystick mode
   * reports its switches as buttons and a latched arming switch reads as
   * pressed forever: counting every button made a latched switch fire the
   * first menu item before the player saw the title.
   *
   * Nothing counts until the pad has been seen with both buttons
   * released, for the same reason.
   */
  /*
   * Is the assigned menu switch thrown? centredReading turns the raw axis into
   * the same -1..1 the gimbals use, so a switch assigned by flicking it up
   * reads positive when it is up, whichever way round the hardware sends it.
   * NAV_DEFLECT is the threshold the cursor already uses, so a switch and a
   * stick agree about how far is far enough.
   */
  selectAxisThrown(gp, spec) {
    if (!gp || !spec || !Number.isInteger(spec.axis) || spec.axis >= gp.axes.length) {
      return false;
    }
    return centredReading(gp.axes[spec.axis], spec) >= NAV_DEFLECT;
  }

  /*
   * The bootstrap for a radio with no buttons and no menu switch yet: any
   * axis held away from rest counts as ONE select, once, until it comes
   * back. See calibrate.js and SELECT_HOLD_MS for why this exists and why it is armed
   * only in that case.
   *
   * navRest is the resting snapshot navRaw already keeps, so this and the
   * cursor agree about where the sticks live and a stick parked off centre
   * at page load does not press anything.
   */
  holdSelect(gp) {
    /*
     * Its own clock, rather than a frame delta threaded down from main.js
     * through padNav. This is the MENU, not the physics path: nothing here
     * reaches the integrator, and the alternative is a new argument on a
     * call chain that has no delta to give it. Clamped, so a backgrounded
     * tab coming forward does not arrive with a two second hold already
     * banked and press whatever the cursor is on.
     */
    const now = (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now();
    const dtMs = this.holdAt ? Math.min(100, Math.max(0, now - this.holdAt)) : 0;
    this.holdAt = now;
    if (!this.navRest || this.navRest.length !== gp.axes.length) {
      this.holdMs = 0;
      this.holdFired = false;
      return false;
    }
    let worst = 0;
    for (let i = 0; i < gp.axes.length; i += 1) {
      const d = Math.abs(gp.axes[i] - this.navRest[i]);
      if (d > worst) {
        worst = d;
      }
    }
    if (worst < NAV_DEFLECT) {
      this.holdMs = 0;
      this.holdFired = false;
      return false;
    }
    this.holdMs += dtMs;
    if (this.holdMs < SELECT_HOLD_MS || this.holdFired) {
      return false;
    }
    /* Latched until release, so a stick left leaning does not press the
     * same row sixty times a second. */
    this.holdFired = true;
    return true;
  }

  /*
   * The aircraft swap's buttons in flight, as levels: Y opens the picker,
   * the shoulders step through the aircraft. A STANDARD GAMEPAD ONLY. A
   * radio in joystick mode reports its switches as buttons at whatever
   * index its firmware chose, latched, and one of them is the arm switch:
   * binding a swap to a button number would fire it on a radio the moment
   * the pilot armed. A radio reaches the swap from the pause menu.
   */
  padSwapButtons() {
    const gp = this.firstGamepad();
    if (!gp || gp.mapping !== 'standard' || !gp.buttons) {
      return null;
    }
    const at = (i) => Boolean(gp.buttons[i] && gp.buttons[i].pressed);
    return { open: at(3), prev: at(4), next: at(5) };
  }

  /* A standard pad's X, which the aircraft picker takes as Customise.
   * Standard only, for the reason padSwapButtons gives. */
  padAltButton() {
    const gp = this.firstGamepad();
    if (!gp || gp.mapping !== 'standard' || !gp.buttons) {
      return false;
    }
    return Boolean(gp.buttons[2] && gp.buttons[2].pressed);
  }

  /* A standard pad's right stick, which the hangar's camera orbits on:
   * { x, y }, each -1 to 1 with the middle fifth read as centred, right
   * and down positive. Standard only, for the reason padSwapButtons
   * gives. */
  padLookStick() {
    const gp = this.firstGamepad();
    if (!gp || gp.mapping !== 'standard' || !gp.axes || gp.axes.length < 4) {
      return { x: 0, y: 0 };
    }
    const dead = (v) => (Math.abs(v) < 0.2 ? 0 : v);
    return { x: dead(gp.axes[2] || 0), y: dead(gp.axes[3] || 0) };
  }

  /* A standard pad's Y, which the aircraft picker takes as its Floats
   * switch. Standard only, for the reason padSwapButtons gives. */
  padFloatsButton() {
    const gp = this.firstGamepad();
    if (!gp || gp.mapping !== 'standard' || !gp.buttons) {
      return false;
    }
    return Boolean(gp.buttons[3] && gp.buttons[3].pressed);
  }

  padMenuButtons() {
    const gp = this.firstGamepad();
    if (gp && gp.axes && (!gp.buttons || !gp.buttons.length)) {
      /*
       * ZERO BUTTONS. Everything below reads buttons and would return a
       * permanent no, which is the dead end: a cursor that walks and an
       * Enter that never happens.
       */
      const spec = this.calibration && this.calibration.draft
        ? (this.calibration.draft.select || this.map.select)
        : this.map.select;
      if (spec) {
        /* Level, not an edge. The caller latches edges through padPrev,
         * exactly as it does for a real button. */
        return { select: this.selectAxisThrown(gp, spec), back: false };
      }
      return { select: this.holdSelect(gp), back: false };
    }
    if (!gp || !gp.buttons) {
      /* Disarm as well as bail. The release guard below only runs once per
       * arming, so a pad that goes away and comes back with a latched
       * switch still held would have kept the arming it earned before it
       * was unplugged, and fired the first menu item on sight. */
      this.padArmed = false;
      return { select: false, back: false };
    }
    const at = (i) => Boolean(gp.buttons[i] && gp.buttons[i].pressed);
    const b = [at(0), at(1), at(2), at(3)];
    if (!this.padArmed) {
      if (!b.some(Boolean)) {
        this.padArmed = true;
      }
      return { select: false, back: false };
    }
    /* Button 1 goes back, the rest select. A radio's switches land
     * anywhere in this range, so more than one selects; the release guard
     * above is what makes that safe. */
    return { select: b[0] || b[2] || b[3], back: b[1] };
  }

  /*
   * Cursor movement for a radio whose axis order is not known yet.
   *
   * Menu navigation cannot depend on calibration, because the way to
   * calibrate is a menu item: if the AETR guess is wrong the cursor will
   * not move and the fix is unreachable by the only device that needs
   * it. So while uncalibrated, ANY axis pushed away from where it rested
   * at page load moves the cursor, and the sign of that excursion is the
   * direction. It cannot tell pitch from roll without calibration, and it
   * does not need to.
   */
  navRaw() {
    const gp = this.firstGamepad();
    if (!gp) {
      /* Forget where the sticks rested. A different radio with the same
       * axis count would otherwise be measured against the last one's
       * resting position and read as permanently deflected. */
      this.navRest = null;
      return { up: false, down: false };
    }
    const axes = gp.axes;
    if (!this.navRest || this.navRest.length !== axes.length) {
      this.navRest = Array.from(axes);
      return { up: false, down: false };
    }
    let worst = 0;
    for (let i = 0; i < axes.length; i += 1) {
      const d = axes[i] - this.navRest[i];
      if (Math.abs(d) > Math.abs(worst)) {
        worst = d;
      }
    }
    return { up: worst > 0.55, down: worst < -0.55 };
  }

  /*
   * The calibration wizard (calibrate.js). The flying map is not touched
   * until acceptCalibration, so cancelling part way leaves it as it was.
   */
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
    const view = this.calibrationView();
    if (!view || !view.moving) {
      return null;
    }
    return this.reverseChannel(view.moving) ? view.moving : null;
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
   * answers the AETR guess's questions by existing, so what was learned
   * against the old one goes. calResult says whether it also reached
   * storage ('saved') or only this tab ('saved-unstored').
   */
  acceptCalibration() {
    const c = this.calibration;
    if (!c || !c.complete()) {
      return false;
    }
    this.map = normaliseMap({ ...c.draft, stored: true });
    this.forgetAxisResolution();
    this.guessSpan = null;
    this.guessYawAlive = false;
    this.guessWrongOrder = false;
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

  readGamepad(gp, map = this.map) {
    return readSticks(gp.axes, map);
  }

  readKeyboard(dtMs, springThr = false) {
    return this.keyboard.read(dtMs, (code) => this.held(code), (code) => this.keys.has(code), springThr);
  }

  /* Zero the sticks and the collective so a reset or a harness poke
   * cannot be sprung toward hover on the next poll. The thumb sticks
   * reset with the keys and for the same reason, plus one of their own:
   * their throttle is sticky, and a crash recovery that kept it high
   * would relaunch the wreck by itself. */
  resetKeyboardSticks() {
    this.keyboard.reset();
    /* The wheel's throttle holds, so a reset has to take it down or the
     * craft relaunches from the pad by itself, the touch throttle's bug. */
    this.mouseStick.zero();
    if (this.touchSource) {
      this.touchSource.reset();
    }
  }

  /* A key, or a mouse button standing in for one. */
  held(code) {
    return this.keys.has(code) || this.mouseStick.buttonKeys.has(code);
  }

  setMouseConfig(cfg) {
    this.mouseStick.configure(cfg, this);
  }

  setMouseLive(live) {
    this.mouseStick.setLive(live);
  }

  /* A plane or a quad sets the wheel's step, and with `rates` (a quad on
   * Acro) what 'auto' centring means. The shell passes the SETTING, so a
   * turtle recovery does not change the feel. */
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
    const yaw = this.keyAxes.find(([ch]) => ch === 'yaw');
    this.mouseStick.button(button, down, [yaw[1], yaw[2]]);
  }

  /*
   * The mouse rung of the poll. Every key still works on top, as over a
   * radio: a held stick key wins its channel, and the throttle keys move
   * the wheel's throttle at the radio slider's rate, so a pilot with no
   * wheel can still fly all four channels.
   */
  readMouse(dtMs) {
    const m = this.mouseStick;
    m.settle(dtMs, this.keys.has(MOUSE_CENTRE_KEY));
    this.kb.throttle = m.stick.thr;
    const kb = this.readKeyboard(dtMs, false);
    if (this.keys.has(this.throttleKeys.up) || this.keys.has(this.throttleKeys.down)) {
      m.stick.thr = kb.throttle;
    }
    const next = { ...m.shapedStick(), yaw: 0, throttle: m.stick.thr };
    for (const ch of ['roll', 'pitch', 'yaw']) {
      if (kb[ch] !== 0) {
        next[ch] = kb[ch];
      }
    }
    return next;
  }

  /*
   * Whether the mouse is the stick source. It sits above a connected radio
   * because picking it is a choice the pilot made in Settings, where a
   * radio is merely present; the joystick picker and the wizard still come
   * first because they are open on the screen.
   */
  isMousePrimary() {
    return this.mouseEnabled && !this.harnessChannels && !this.padPick && !this.calibration;
  }

  /* The thumb sticks, mounted by the shell on a touch device. */
  attachTouch(source) {
    this.touchSource = source;
    if (source && typeof source.setStickMode === 'function') {
      source.setStickMode(this.stickMode);
    }
  }

  /*
   * THE PILOT'S STICK MODE, which reaches the keyboard and the thumb sticks
   * and nothing else. A radio has already applied its own before the browser
   * sees an axis, and the wizard learns whatever comes out of it.
   *
   * The spring centred channels are ZEROED on a change, and they have to be.
   * The keyboard integrates per channel: hold the arrow that was pitch,
   * change mode so that key is now throttle, and pitch would have kept
   * whatever deflection it was carrying with no key left able to return it.
   * Throttle survives deliberately, because it is the same collective either
   * way and a radio's throttle does not jump when you put the radio down.
   */
  setStickMode(mode) {
    const m = normaliseStickMode(mode);
    if (m === this.stickMode) {
      return m;
    }
    this.stickMode = m;
    this.keyboard.setMode(m);
    this.keyboard.centreSprings();
    if (this.touchSource && typeof this.touchSource.setStickMode === 'function') {
      this.touchSource.setStickMode(m);
    }
    return m;
  }

  /*
   * Whether the thumbs are the stick source right now. Split from
   * isKeyboardPrimary because the two answer different questions: the
   * keyboard forces angle mode and draws its ghost gimbals, while the
   * thumb sticks are a proportional stick like a radio, fly whichever
   * flight mode the setting says, and draw themselves.
   */
  isTouchPrimary() {
    return this.firstGamepad() === null && !this.mouseEnabled
      && Boolean(this.touchSource && this.touchSource.active());
  }

  /* Called once per animation frame. Emits one timestamped sample when
   * anything changed, plus a heartbeat sample every 100 ms. */
  poll(nowWall) {
    /* Never back in time. The frame polls with its requestAnimationFrame
     * timestamp, the frame's start, which can be before the 2 ms timer's
     * last performance.now() (startPolling): read raw, that made dtMs
     * negative (the keyboard's spring and the mouse's ran backwards for a
     * poll) and stamped a newer reading older than the one queued before
     * it. A reading is stamped no earlier than the last one was taken. */
    const t = Math.max(nowWall, this.lastWall);
    const dtMs = Math.min(t - this.lastWall, 100);
    this.lastWall = t;

    const gp = this.firstGamepad();
    this.roster.track();
    this.followDefaultMap(gp);
    /* The Gamepad object's own timestamp is the only honest statement of when
     * the browser last refreshed it. Counting its changes is how we find out
     * whether polling faster than the frame rate buys anything at all. */
    if (gp && gp.timestamp !== this.padStamp) {
      this.padStamp = gp.timestamp;
      this.padUpdates += 1;
      /* Only on a refresh: re-reading an unchanged axis says nothing, and
       * doing this every 2 ms would be three quarters wasted work. */
      this.noteAxisResolution(gp);
    }
    this.rateWindowMs += dtMs;
    if (this.rateWindowMs >= 500) {
      this.padHz = Math.round((this.padUpdates * 1000) / this.rateWindowMs);
      this.sampleHz = Math.round((this.samplesTaken * 1000) / this.rateWindowMs);
      this.padUpdates = 0;
      this.samplesTaken = 0;
      this.rateWindowMs = 0;
    }
    let next;
    let padFlies = false;
    if (this.harnessChannels) {
      /* The harness override, above everything: a capture wrote a stick
       * and means it. Mirrored into kb.throttle so releasing the override
       * hands the collective back where it left it rather than springing. */
      next = { ...this.harnessChannels };
      this.kb.throttle = next.throttle;
      this.source = str('input.the_harness_override');
    } else if (this.padPick) {
      this.runPadPick(dtMs);
      next = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
      this.source = str('input.the_joystick_picker');
    } else if (this.calibration) {
      /* Unconditional: runCalibration's own first line sets waiting when
       * there is no pad, so the else arm here was a second copy that could
       * only ever agree with it. */
      this.runCalibration(gp, dtMs);
      next = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
      this.source = str('input.the_calibration_wizard');
    } else if (this.mouseEnabled) {
      next = this.readMouse(dtMs);
      this.source = str('input.the_mouse');
    } else if (gp) {
      next = this.readGamepad(gp);
      next.throttle = this.gateThrottle(next.throttle);
      padFlies = true;
      this.noteThrottleParked(gp);
      this.noteGuessOrder(gp);
      this.source = this.mapUsable() || this.mapKnown() ? str('input.a_radio') : str('input.a_radio_whose_stick_order_is');
      /* Keyboard still works while a pad is plugged in: any held stick
       * key overrides that channel. */
      const kb = this.readKeyboard(dtMs, false);
      for (const ch of ['roll', 'pitch', 'yaw']) {
        if (kb[ch] !== 0) {
          next[ch] = kb[ch];
        }
      }
      if (this.keys.has(this.throttleKeys.up) || this.keys.has(this.throttleKeys.down)) {
        next.throttle = kb.throttle;
      } else {
        this.kb.throttle = next.throttle;
      }
    } else if (this.touchSource && this.touchSource.active()) {
      /* The thumbs. Sample every poll, not only on events, because the
       * spring back to centre is time, not touches, and the sticky
       * throttle has to keep feeding while no finger is down at all. */
      next = this.touchSource.sample(dtMs);
      this.source = str('input.the_touch_sticks');
    } else {
      next = this.readKeyboard(dtMs, true);
      this.source = str('input.the_keyboard');
    }
    /* The hold is about the pad's throttle. Anything else flying, even for
     * a moment, ends it, so a pad plugged back in mid air is never cut. */
    if (!padFlies) {
      this.releaseThrottleHold();
    }

    const changed =
      next.roll !== this.channels.roll ||
      next.pitch !== this.channels.pitch ||
      next.yaw !== this.channels.yaw ||
      next.throttle !== this.channels.throttle;
    this.heartbeatMs = (this.heartbeatMs ?? 0) + dtMs;
    if (changed || this.heartbeatMs >= 100) {
      this.heartbeatMs = 0;
      this.channels = next;
      this.queue.push({ wallT: t, ...next });
      this.samplesTaken += 1;
      /* The integrator is frozen while the craft sits landed, so nothing
       * drains then. Bound it: the newest samples are the ones worth keeping. */
      if (this.queue.length > 2048) {
        this.queue.splice(0, this.queue.length - 512);
      }
    }
  }

  /*
   * Poll independently of the render loop. 2 ms is asked for; browsers clamp
   * setInterval and a busy frame delays it, which is exactly why every sample
   * is timestamped rather than assumed to be on a grid. Calling poll() from
   * the frame as well is harmless: dtMs is measured off lastWall, so the
   * keyboard integration cannot be double counted.
   */
  startPolling(periodMs = 2) {
    if (this.timer !== null) {
      return;
    }
    this.timer = setInterval(() => this.poll(performance.now()), periodMs);
  }

  stopPolling() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /*
   * Keyboard is the stick source when no radio has enumerated. WASD and
   * the arrows still overlay a connected pad channel by channel, but that
   * is not "using the keyboard rather than a controller": the pad is the
   * primary, and angle mode follows the setting.
   */
  isKeyboardPrimary() {
    return this.firstGamepad() === null;
  }

  /*
   * The smallest step this radio has been seen to take, over the mapped
   * axes only: an unmapped axis is a switch or a pot and its travel is not
   * a stick's. See the note on axisStepMin: noise can only push this BELOW
   * the true step, so it is a lower bound on the step and therefore an
   * upper bound on how fine the stick really is.
   */
  noteAxisResolution(gp) {
    const m = this.map;
    if (!m) {
      return;
    }
    for (const ch of ['roll', 'pitch', 'yaw', 'throttle']) {
      const spec = m[ch];
      if (!spec || !Number.isInteger(spec.axis) || spec.axis >= gp.axes.length) {
        continue;
      }
      const v = gp.axes[spec.axis];
      if (!Number.isFinite(v)) {
        continue;
      }
      const prev = this.axisPrev.get(spec.axis);
      this.axisPrev.set(spec.axis, v);
      if (prev === undefined || v === prev) {
        continue;
      }
      const d = Math.abs(v - prev);
      if (this.axisStepMin === 0 || d < this.axisStepMin) {
        this.axisStepMin = d;
      }
    }
  }

  /* A new radio, or a new map for the same one, is a new transducer: the
   * step measured through the old one says nothing about this one. */
  forgetAxisResolution() {
    this.axisPrev.clear();
    this.axisStepMin = 0;
  }

  stats() {
    /*
     * stickLevels is axisStepMin expressed as the number of steps across an
     * axis's full -1..1 travel, because "256" is a sentence a pilot and a
     * bug report can both read and "0.0078" is not. Zero means the stick has
     * not moved enough to say, which is a different answer from "fine" and
     * has to stay distinguishable from it.
     */
    return {
      padHz: this.padHz,
      sampleHz: this.sampleHz,
      queued: this.queue.length,
      source: this.source,
      axisStepMin: this.axisStepMin,
      stickLevels: this.axisStepMin > 0 ? Math.round(2 / this.axisStepMin) : 0,
    };
  }

  drain() {
    const q = this.queue;
    this.queue = [];
    return q;
  }
}
