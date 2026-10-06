/*
 * input-selftest.js: the stick input (src/input) told as stories, in plain
 * Node, one assertion for each defect that has shipped once.
 *
 * Every story here is a ticket from the board that was reproduced, fixed
 * and closed. A fix with no test is undone the first time somebody tidies
 * the code, so the reproduction lives on here.
 *
 * Two rules shape the file. The radios are awkward on purpose: yaw on axis
 * 4 with a slider on axis 3, throttles that spring to the middle, a gimbal
 * wound in to half travel, a pilot who holds the throttle down because the
 * prompt said so. A synthetic radio that rests at 0 and sweeps evenly
 * agrees with whatever the code assumes. And values are asserted at the
 * stops (full stick is exactly 1) rather than inside a band the arithmetic
 * happens to land in. Every latch is driven both ways.
 *
 * input-trace-selftest.js pins the same module frame by frame; the screens
 * and the touch page are scripts/input-check.js.
 *
 *   npm run input:selftest
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

let failed = 0;
let passed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}`);
    return;
  }
  failed += 1;
  failures.push(`${name}${detail ? `  (${detail})` : ''}`);
  console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
}
const heading = (t) => console.log(`\n${t}`);
const near = (a, b) => Math.abs(a - b) < 1e-9;
const show = (v) => JSON.stringify(v);

/* --------------------------------------------------------- the world */

/* An in-memory localStorage. `refuse` makes every write to a key holding
 * that text throw, as a private window or a full quota does. */
function storage(refuse = null) {
  const items = new Map();
  return {
    getItem: (k) => (items.has(k) ? items.get(k) : null),
    setItem: (k, v) => {
      if (refuse && String(k).includes(refuse)) {
        throw new Error('QuotaExceededError');
      }
      items.set(k, String(v));
    },
    removeItem: (k) => { items.delete(k); },
  };
}

/* The globals the module touches, for one radio (or none). */
function world(radio, store) {
  globalThis.localStorage = store || storage();
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  const pads = () => (radio ? [radio] : []);
  try {
    navigator.getGamepads = pads;
  } catch (e) {
    globalThis.navigator = { getGamepads: pads };
  }
}

function radio(axes, buttons = 0, id = 'Selftest radio') {
  return {
    index: 0,
    id,
    connected: true,
    mapping: '',
    timestamp: 1,
    axes: axes.slice(),
    buttons: Array.from({ length: buttons }, () => ({ pressed: false, value: 0 })),
  };
}

function gamepad(id = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)') {
  return Object.assign(radio([0, 0, 0, 0], 17, id), { mapping: 'standard' });
}

world(null);
const { InputManager, calSteps, SELECT_STEP } = await import('../src/input/input.js');
const {
  stickChannels, stickCaption, stickSideOf, normaliseStickMode, STICK_MODES,
} = await import('../src/input/stickmode.js');

/*
 * One InputManager on one radio, on a clock this file steps by hand at a
 * frame's 16 ms, so every hold and settle time runs at a real cadence and
 * nothing depends on this machine's speed.
 */
class Bench {
  constructor(pad, store) {
    world(pad, store);
    this.pad = pad;
    this.im = new InputManager();
    this.clock = performance.now();
  }

  set(axis, v) {
    this.pad.axes[axis] = v;
    this.pad.timestamp += 1;
  }

  tick(ms = 16) {
    this.clock += ms;
    this.im.poll(this.clock);
  }

  run(ms) {
    for (let t = 0; t < ms; t += 16) {
      this.tick();
    }
  }

  get view() {
    return this.im.calibrationView();
  }

  /* Ticks until `test(view)` holds, up to `limitMs` of bench time. */
  until(test, limitMs = 6000) {
    for (let t = 0; t < limitMs; t += 16) {
      this.tick();
      const v = this.view;
      if (v && test(v)) {
        return true;
      }
    }
    return false;
  }

  reach(step, limitMs) {
    return this.until((v) => v.step === step && v.phase === 'hold', limitMs);
  }

  released(limitMs) {
    return this.until((v) => v.phase === 'release', limitMs);
  }

  /* Every axis to both ends and back, then on to the throttle step. `ends`
   * says how far each axis reaches (1 unless wound in) and `home` where
   * each goes back to. */
  sweep(axes, ends = () => 1, home = (i) => this.pad.axes[i]) {
    const back = axes.map((i) => home(i));
    axes.forEach((i, k) => {
      this.set(i, ends(i)); this.tick();
      this.set(i, -ends(i)); this.tick();
      this.set(i, back[k]); this.tick();
    });
  }

  /* One identify step: push, hold until taken, let go, wait for `next`. */
  identify(axis, push, back, next) {
    this.set(axis, push);
    const took = this.released();
    this.set(axis, back);
    return took && this.reach(next);
  }
}

/*
 * The whole wizard as a pilot does it. `layout` names the axis of each
 * channel; `thrBack` is where the throttle goes at its release (a parked
 * radio: the bottom; a gamepad: back to rest), `thrHeld`, when given, where
 * it is held from then until the check step, and `reach` how far the
 * sticks travel. Returns true, or the step it got stuck on.
 */
function calibrate(bench, layout) {
  const reach = layout.reach ?? 1;
  const { im } = bench;
  im.startCalibration();
  if (!bench.reach('sweep')) {
    return 'centre never settled';
  }
  const rest = bench.pad.axes.slice();
  bench.sweep([layout.roll, layout.pitch, layout.yaw, layout.thr], () => reach, (i) => rest[i]);
  if (!bench.reach('throttle')) {
    return 'the sweep never finished';
  }
  const asks = [
    ['throttle', layout.thr, reach, layout.thrBack ?? rest[layout.thr]],
    ['roll', layout.roll, reach, rest[layout.roll]],
    ['pitch', layout.pitch, -reach, rest[layout.pitch]],
    ['yaw', layout.yaw, reach, rest[layout.yaw]],
  ];
  for (const [channel, axis, push, back] of asks) {
    if (bench.view.step !== channel) {
      return `wanted ${channel}, on ${bench.view.step}`;
    }
    bench.set(axis, push);
    if (!bench.released()) {
      return `${channel} never taken`;
    }
    bench.set(axis, back);
    const steps = bench.view.steps;
    const next = steps[steps.indexOf(channel) + 1];
    if (!bench.reach(next)) {
      return `${channel} never let go to ${next}`;
    }
    /* Then the hand comes off: a sprung throttle held down as told springs
     * back now, one step too late to be seen, unless the pilot keeps
     * holding it. */
    const after = channel === 'throttle' && layout.thrHeld !== undefined ? layout.thrHeld : rest[axis];
    bench.set(axis, after);
    bench.tick();
  }
  return true;
}

const plainRadio = { roll: 0, pitch: 1, yaw: 3, thr: 2, thrBack: -1 };
const sweepFour = (bench, thrHome = -1) => bench.sweep([0, 1, 2, 3], () => 1, (i) => (i === 2 ? thrHome : 0));

/* -------------------------------------------- the steps a radio is asked */

heading('a menu switch is asked for only when an axis is free to answer (bug-89b2c85c)');
check('never of a radio with buttons', !calSteps(true, 8).includes(SELECT_STEP));
check('never of a four-axis radio with no buttons, whose axes the gimbals take', !calSteps(false, 4).includes(SELECT_STEP));
check('of a six-axis radio with no buttons, just before the check step',
  calSteps(false, 6).indexOf(SELECT_STEP) === calSteps(false, 6).indexOf('confirm') - 1);

heading('the whole wizard on a radio AETR gets wrong: yaw on 4, a still slider on 3, no buttons');
{
  const b = new Bench(radio([0, 0, -1, 0, 0, -1], 0, 'Pocket'));
  b.im.startCalibration();
  check('eight steps for six axes and no buttons', b.view.stepCount === 8);
  check('the axis strip shows all six from the first step', b.view.axes.length === 6);
  const done = calibrate(b, { roll: 0, pitch: 1, yaw: 4, thr: 2, thrBack: -1 });
  check('all four flight channels are taken and let go', done === true, String(done));
  const v = b.view;
  check('then it asks for the menu switch', v.step === SELECT_STEP);
  check('and offers Skip', v.canSkip === true);
  check('the strip shows yaw\'s sweep as its two ends, -1 to 1', v.axes[4] && v.axes[4].lo === -1 && v.axes[4].hi === 1, show(v.axes[4]));
  check('and the slider that never moved as 0 to 0', v.axes[3] && v.axes[3].lo === 0 && v.axes[3].hi === 0, show(v.axes[3]));
  check('axes taken by a channel are marked', v.axes[0].mapped && v.axes[4].mapped && !v.axes[3].mapped);
  check('Skip goes to the check step', b.im.skipCalibrationSelect() && b.view.step === 'confirm');
  check('which can save', b.view.canSave === true);
  check('and saving keeps the map', b.im.acceptCalibration() === true);
  check('yaw is axis 4, not AETR\'s 3', b.im.map.yaw.axis === 4);
  check('no menu switch, as on a radio with buttons', b.im.map.select === null);
  check('and storage took it', b.im.calResult === 'saved');
}

heading('the gimbal previews the movement being asked for, on the sweep\'s ruler (bug-122503e9)');
{
  const b = new Bench(radio([0, 0, -1, 0], 4));
  b.im.startCalibration();
  b.reach('sweep');
  sweepFour(b);
  b.reach('throttle');
  /* Rest -1, reach +1: two units. A raw-unit ruler read 0.3 here. */
  b.set(2, -0.4); b.tick();
  check('throttle 0.6 into a two-unit reach previews 0.30', near(b.view.channels.throttle, 0.3), String(b.view.channels.throttle));
  b.identify(2, 1, -1, 'roll');
  b.set(0, 0.3); b.tick();
  check('roll 0.3 into a one-unit reach previews 0.30, not zero', near(b.view.channels.roll, 0.3), String(b.view.channels.roll));
  check('and only the channel asked for moves', b.view.channels.pitch === 0 && b.view.channels.yaw === 0);
}
{
  /* Endpoints wound in to half: full stick is 0.5 raw and must read 1. */
  const b = new Bench(radio([0, 0, -1, 0], 4, 'Wound in'));
  b.im.startCalibration();
  b.reach('sweep');
  b.sweep([0, 1, 2, 3], (i) => (i === 2 ? 1 : 0.5), (i) => (i === 2 ? -1 : 0));
  b.reach('throttle');
  b.identify(2, 1, -1, 'roll');
  b.set(0, 0.5); b.tick();
  check('full stick on a wound-in gimbal previews exactly 1', b.view.channels.roll === 1, String(b.view.channels.roll));
}

heading('a gamepad throttle that springs back, and the pilot lets go (bug-93400859)');
{
  const b = new Bench(radio([0, 0, 0, 0], 4, 'Xbox'));
  const done = calibrate(b, { roll: 0, pitch: 1, yaw: 3, thr: 2, thrBack: 0 });
  check('the wizard finishes', done === true, String(done));
  check('the spring was caught by itself: the check step offers nothing', b.view.canZeroThrottle === false);
  b.im.acceptCalibration();
  const t = b.im.map.throttle;
  check('zero is at rest, not at the bottom of the stick', t.low === 0 && t.high === 1 && t.sprung === true, show(t));
  b.set(2, 0); b.tick();
  check('hands off reads exactly 0, where it read 0.5', b.im.channels.throttle === 0);
  b.set(2, 1); b.tick();
  check('full up reads exactly 1', b.im.channels.throttle === 1);
  b.set(2, -1); b.tick();
  check('past centre the other way is idle, not negative', b.im.channels.throttle === 0);
}

heading('a radio throttle that parks at the bottom is left exactly as it is');
{
  const b = new Bench(radio([0, 0, -1, 0], 4, 'TX16S'));
  const done = calibrate(b, plainRadio);
  check('the wizard finishes', done === true, String(done));
  b.im.acceptCalibration();
  const t = b.im.map.throttle;
  check('the plain map', t.low === -1 && t.high === 1 && !t.sprung, show(t));
  b.set(2, -1); b.tick();
  check('the bottom reads 0', b.im.channels.throttle === 0);
  b.set(2, 0); b.tick();
  check('the middle reads 0.5, because on this throttle it is half', b.im.channels.throttle === 0.5);
}

heading('a radio throttle that springs, held down as the prompt says (bug-851a43b7)');
{
  const b = new Bench(radio([0, 0, 0, 0], 2, 'LiteRadio 3'));
  const done = calibrate(b, { roll: 0, pitch: 1, yaw: 3, thr: 2, thrBack: -1 });
  check('the wizard finishes', done === true, String(done));
  /* The hand comes off on the check step and the stick springs to the
   * middle: the case no instant can see, so the way out is asserted. */
  b.set(2, 0); b.tick();
  const v = b.view;
  check('the check step reads 50 percent at rest', v.throttlePercent === 50 && v.channels.throttle === 0.5, String(v.throttlePercent));
  check('and offers to move zero here', v.canZeroThrottle === true);
  check('and says the number', /50 percent/.test(v.hint), v.hint);
  const lowWas = b.im.calibration.draft.throttle.low;
  b.set(2, 0.9); b.tick();
  check('the offer is refused with the stick most of the way up',
    b.im.zeroThrottleHere() === false && b.im.calibration.draft.throttle.low === lowWas);
  b.set(2, 0); b.tick();
  check('and taken at rest', b.im.zeroThrottleHere() === true);
  check('after which it reads 0 and stops offering', b.view.channels.throttle === 0 && b.view.canZeroThrottle === false);
  b.im.acceptCalibration();
  const t = b.im.map.throttle;
  check('the saved map has zero at rest and says sprung', t.low === 0 && t.high === 1 && t.sprung === true, show(t));
  b.set(2, 0); b.tick();
  check('hands off reads exactly 0', b.im.channels.throttle === 0);
  b.set(2, 1); b.tick();
  check('full up reads exactly 1', b.im.channels.throttle === 1);
  b.set(2, -1); b.tick();
  check('full down reads 0', b.im.channels.throttle === 0);
}

heading('the same throttle held down all the way to the check step');
{
  /* The roll step's release used to wait for the held throttle to come back
   * to a rest nobody had mentioned. A taken throttle at its bottom counts
   * as parked. */
  const b = new Bench(radio([0, 0, 0, 0], 2, 'LiteRadio 3, held'));
  const done = calibrate(b, { roll: 0, pitch: 1, yaw: 3, thr: 2, thrBack: -1, thrHeld: -1 });
  check('the wizard finishes with the throttle held down throughout', done === true, String(done));
  check('the check step reads 0 while held, and offers nothing', b.view.throttlePercent === 0 && b.view.canZeroThrottle === false);
  b.set(2, 0); b.tick();
  check('let go: 50 percent, and the offer', b.view.throttlePercent === 50 && b.view.canZeroThrottle === true);
  check('which is taken', b.im.zeroThrottleHere() === true && b.view.throttlePercent === 0);
  b.im.acceptCalibration();
  const t = b.im.map.throttle;
  check('and saved with zero at rest', t.low === 0 && t.high === 1 && t.sprung === true, show(t));
}
{
  /* A spring already caught (low moved to rest), then the stick held at
   * its physical bottom: the release looks at the sweep's far end. */
  const b = new Bench(radio([0, 0, 0, 0], 4, 'Xbox, stick held down'));
  const done = calibrate(b, { roll: 0, pitch: 1, yaw: 3, thr: 2, thrBack: 0, thrHeld: -1 });
  check('a caught spring, then the stick held at the bottom: still finishes', done === true, String(done));
  b.im.acceptCalibration();
  const t = b.im.map.throttle;
  check('with the gamepad\'s map', t.low === 0 && t.high === 1 && t.sprung === true, show(t));
}
{
  /* Every other axis keeps the strict rule: a sprung stick held during
   * another channel's release is a hold, and blocks it. */
  const b = new Bench(radio([0, 0, -1, 0], 4, 'TX16S, roll held'));
  b.im.startCalibration();
  b.reach('sweep');
  sweepFour(b);
  b.reach('throttle');
  b.identify(2, 1, -1, 'roll');
  b.identify(0, 1, 0, 'pitch');
  b.set(1, -1); b.released();
  b.set(1, 0); b.set(0, 0.6);
  check('roll held while pitch comes back: yaw is not asked for', b.reach('yaw', 1500) === false);
  check('and the throttle at its bottom is not why', b.pad.axes[2] === -1 && b.view.step === 'pitch');
  b.set(0, 0);
  check('roll let go: yaw is asked for', b.reach('yaw') === true);
}

heading('a channel that came out backwards, and reversing it (bug-b0d085f0)');
{
  /* Pitch pushed forward on the step that said pull back. */
  const b = new Bench(radio([0, 0, -1, 0], 4, 'Pushed the wrong way'));
  b.im.startCalibration();
  b.reach('sweep');
  sweepFour(b);
  b.reach('throttle');
  b.identify(2, 1, -1, 'roll');
  b.identify(0, 1, 0, 'pitch');
  b.identify(1, 1, 0, 'yaw');
  b.identify(3, 1, 0, 'confirm');
  b.set(1, 1); b.tick();
  check('the wrong push is kept faithfully: pitch reads backwards', b.view.channels.pitch === 1, String(b.view.channels.pitch));
  check('the check step names the stick being moved', b.view.moving === 'pitch', String(b.view.moving));
  check('offers to reverse it', b.view.canReverse === true);
  check('and says how', /press R to reverse pitch/.test(b.view.hint), b.view.hint);
  check('reversing answers with the channel it turned round', b.im.reverseMovingChannel() === 'pitch');
  check('the same stick now reads the other way', b.view.channels.pitch === -1, String(b.view.channels.pitch));
  check('and the screen shows it reversed', /Un-reverse|reversed/.test(b.view.hint) || b.view.reverse.pitch === true);
  b.im.acceptCalibration();
  check('the saved map carries it', b.im.map.reverse.pitch === true && b.im.map.reverse.roll === false, show(b.im.map.reverse));
  b.set(1, 1); b.tick();
  check('flight reads it reversed', b.im.channels.pitch === -1, String(b.im.channels.pitch));
  b.set(1, -1); b.tick();
  check('both ways', b.im.channels.pitch === 1, String(b.im.channels.pitch));
}
{
  /* All four, the throttle included: a backwards throttle is full power
   * with the stick down. */
  const b = new Bench(radio([0, 0, -1, 0], 4, 'All four'));
  const done = calibrate(b, plainRadio);
  check('the wizard finishes', done === true, String(done));
  b.im.acceptCalibration();
  check('nothing starts reversed', Object.values(b.im.map.reverse).every((v) => v === false), show(b.im.map.reverse));
  b.set(0, 1); b.set(3, 1); b.set(1, -1); b.set(2, 1); b.tick();
  const fwd = { ...b.im.channels };
  check('all four read full one way', fwd.roll === 1 && fwd.yaw === 1 && fwd.pitch === 1 && fwd.throttle === 1, show(fwd));
  b.im.map.reverse = {
    roll: true, pitch: true, yaw: true, throttle: true,
  };
  b.tick();
  const rev = { ...b.im.channels };
  check('reversed, the centred three negate', rev.roll === -1 && rev.yaw === -1 && rev.pitch === -1, show(rev));
  check('and the throttle counts down from one instead of going negative', rev.throttle === 0, String(rev.throttle));
  b.set(2, -1); b.tick();
  check('a reversed throttle reads FULL at the bottom, which is why it can be reversed at all', b.im.channels.throttle === 1);
  /* poll compares with !==, and -0 would look unchanged there while
   * Object.is says otherwise. */
  b.set(0, 0); b.set(1, 0); b.set(3, 0); b.tick();
  check('a reversed channel at rest is +0, never -0',
    Object.is(b.im.channels.roll, 0) && Object.is(b.im.channels.pitch, 0) && Object.is(b.im.channels.yaw, 0),
    show([b.im.channels.roll, b.im.channels.pitch]));
  const before = b.im.queue.length;
  b.run(200);
  check('and does not report a change on every poll', b.im.queue.length - before < 4, `${b.im.queue.length - before} in 200 ms`);
}
{
  /* The moving stick is the pointer, so two live channels name nothing. */
  const b = new Bench(radio([0, 0, -1, 0], 4, 'Diagonal'));
  calibrate(b, plainRadio);
  b.set(0, 1); b.set(1, -1); b.tick();
  check('roll and pitch at once name nothing', b.view.moving === null, String(b.view.moving));
  check('so nothing is offered', b.view.canReverse === false);
  check('and the key does nothing', b.im.reverseMovingChannel() === null);
  b.set(1, 0); b.tick();
  check('one stick alone is named again', b.view.moving === 'roll', String(b.view.moving));
  b.set(0, 0.2); b.tick();
  check('a stick barely off centre is not an aim', b.view.moving === null, String(b.view.moving));
}

heading('the check step on its own, over the saved map');
{
  const b = new Bench(radio([0, 0, -1, 0], 4, 'Already calibrated'));
  calibrate(b, plainRadio);
  b.im.acceptCalibration();
  const saved = show(b.im.map);
  check('it opens', b.im.startCalibrationCheck() === true);
  const v = b.view;
  check('straight onto the check step, one step long', v.step === 'confirm' && v.stepCount === 1, show([v.step, v.stepCount]));
  check('and says it is the check alone', v.checkOnly === true);
  check('with the saved map in it', b.im.calibration.draft.yaw.axis === b.im.map.yaw.axis);
  check('the strip still shows every axis', v.axes.length === 4);
  b.set(3, 1); b.tick();
  check('a stick names its channel', b.view.moving === 'yaw', String(b.view.moving));
  check('reversing works here too', b.im.reverseMovingChannel() === 'yaw');
  check('the SAVED map is untouched until Save', show(b.im.map) === saved);
  b.im.cancelCalibration();
  check('Escape leaves it exactly as it was', show(b.im.map) === saved && b.im.map.reverse.yaw === false, show(b.im.map.reverse));
  b.im.startCalibrationCheck();
  b.set(3, 1); b.tick();
  b.im.reverseMovingChannel();
  check('Save writes it back', b.im.acceptCalibration() === true && b.im.map.reverse.yaw === true);
  check('without moving an axis', b.im.map.yaw.axis === 3 && b.im.map.roll.axis === 0);
}
{
  const b = new Bench(null);
  check('with no radio it refuses rather than opening', b.im.startCalibrationCheck() === false && b.im.calibration === null);
}
{
  /* A map saved before reversal existed has no reverse block at all. */
  const store = storage();
  store.setItem('webfpv_stick_map_v1', show({
    roll: { axis: 0, center: 0, pos: 1, neg: -1 },
    pitch: { axis: 1, center: 0, pos: -1, neg: 1 },
    yaw: { axis: 3, center: 0, pos: 1, neg: -1 },
    throttle: { axis: 2, low: -1, high: 1 },
  }));
  const b = new Bench(radio([0, 0, -1, 0], 4, 'Old map'), store);
  check('an old saved map loads with all four the right way round',
    show(b.im.map.reverse) === show({ roll: false, pitch: false, yaw: false, throttle: false }), show(b.im.map.reverse));
  b.set(0, 1); b.tick();
  check('and flies as it always did', b.im.channels.roll === 1, String(b.im.channels.roll));
}

heading('no yaw on an uncalibrated radio, and the verdict both ways (bug-3d72d9a4, bug-94f7e52b, bug-13519874)');
{
  const b = new Bench(radio([0, 0, -1, 0, 0, -1], 4, 'Pocket'));
  b.run(100);
  check('the throttle parked, so the guess counts as usable', b.im.padSummary().mapUsable === true && b.im.padSummary().calibrated === false);
  check('nothing swept yet, so no verdict', b.im.padSummary().guessNoYaw === false);
  const swing = () => {
    for (const v of [0.2, 0.45, 0.7, 0.95, 0.45, -0.3, -0.75, 0]) {
      b.set(4, v); b.tick();
    }
  };
  swing();
  check('axis 4 swept like a gimbal while AETR\'s yaw sat still: the verdict', b.im.padSummary().guessNoYaw === true);
  check('while the parked-throttle check still calls it usable, which is the gap', b.im.padSummary().mapUsable === true);
  b.set(3, 0.5); b.tick(); b.set(3, 0); b.tick();
  check('AETR\'s yaw moves once: the verdict clears', b.im.padSummary().guessNoYaw === false);
  swing();
  check('and stays clear however much the stray axis sweeps', b.im.padSummary().guessNoYaw === false);
}
{
  const b = new Bench(radio([0, 0, -1, 0, 0, -1], 4, 'Switchy'));
  b.run(100);
  for (let k = 0; k < 6; k += 1) {
    b.set(5, 1); b.tick(); b.set(5, -1); b.tick();
  }
  check('a two-way switch thrown six times is not a swept stick', b.im.padSummary().guessNoYaw === false);
}

heading('saving when storage refuses (bug-ed4d2bce)');
{
  const b = new Bench(radio([0, 0, -1, 0], 4), storage('stick_map'));
  const done = calibrate(b, plainRadio);
  check('the wizard finishes', done === true, String(done));
  check('Save still succeeds', b.im.acceptCalibration() === true);
  check('but says the map did not reach storage', b.im.calResult === 'saved-unstored');
  check('while the map stays calibrated this session', b.im.map.stored === true);
  check('and saveMap itself says false', b.im.saveMap() === false);
}

heading('the stick mode table (bug-94da186c, bug-a8cd61db)');
{
  const want = {
    1: ['yaw', 'pitch', 'roll', 'throttle'],
    2: ['yaw', 'throttle', 'roll', 'pitch'],
    3: ['roll', 'pitch', 'yaw', 'throttle'],
    4: ['roll', 'throttle', 'yaw', 'pitch'],
  };
  for (const m of STICK_MODES) {
    const c = stickChannels(m);
    const got = [c.left.horiz, c.left.vert, c.right.horiz, c.right.vert];
    check(`Mode ${m} is ${want[m].join('/')}`, got.join() === want[m].join(), got.join('/'));
  }
  check('anything else is Mode 2', ['x', 9, null, undefined].every((v) => normaliseStickMode(v) === 2));
  check('Mode 1 puts pitch left and throttle right', stickSideOf(1, 'pitch') === 'left' && stickSideOf(1, 'throttle') === 'right');
  check('captions name the horizontal first', stickCaption(1, 'right') === 'Roll, throttle' && stickCaption(2, 'left') === 'Yaw, throttle');
}

heading('the keyboard follows the stick mode, forward meaning forward');
{
  const b = new Bench(null);
  const { im } = b;
  const hold = (code, ms) => { im.keys.add(code); b.run(ms); };
  const lift = (code, ms = 400) => { im.keys.delete(code); b.run(ms); };
  check('Mode 2 by default: W and S are the throttle', im.throttleKeys.up === 'KeyW' && im.throttleKeys.down === 'KeyS');
  const t0 = im.channels.throttle;
  hold('KeyW', 700);
  check('Mode 2: W raises the throttle', im.channels.throttle > t0 + 0.2, `${t0} -> ${im.channels.throttle}`);
  check('and nothing else', im.channels.pitch === 0 && im.channels.roll === 0);
  lift('KeyW');
  hold('ArrowUp', 700);
  check('Mode 2: up arrow is pitch forward, nose down, NEGATIVE', im.channels.pitch < -0.2, String(im.channels.pitch));
  /* Change mode with the arrow still held: that deflection must not be
   * stranded with no key left to return it. */
  const thrBefore = im.kb.throttle;
  im.setStickMode(1);
  check('a mode change centres the sprung channels', im.kb.pitch === 0 && im.kb.roll === 0);
  check('and leaves the collective where it was', im.kb.throttle === thrBefore);
  lift('ArrowUp');
  check('Mode 1: the arrows are the throttle', im.throttleKeys.up === 'ArrowUp' && im.throttleKeys.down === 'ArrowDown');
  check('Mode 1: W and S are pitch, W the negative key', im.keyAxes.some(([ch, neg, pos]) => ch === 'pitch' && neg === 'KeyW' && pos === 'KeyS'));
  const t1 = im.channels.throttle;
  hold('ArrowUp', 700);
  check('Mode 1: up arrow raises the throttle', im.channels.throttle > t1 + 0.2, `${t1} -> ${im.channels.throttle}`);
  check('and does not pitch', im.channels.pitch === 0);
  lift('ArrowUp');
  hold('KeyW', 700);
  check('Mode 1: W is pitch, and forward is still nose down', im.channels.pitch < -0.2, String(im.channels.pitch));
  lift('KeyW');
  im.setStickMode(3);
  check('Mode 3: A and D roll, the side arrows yaw',
    im.keyAxes.some(([ch, neg, pos]) => ch === 'roll' && neg === 'KeyA' && pos === 'KeyD')
    && im.keyAxes.some(([ch, neg, pos]) => ch === 'yaw' && neg === 'ArrowLeft' && pos === 'ArrowRight'));
}

heading('the wizard names the hand the stick mode puts the channel on');
{
  const b = new Bench(radio([0, 0, -1, 0], 4));
  b.im.startCalibration();
  b.reach('sweep');
  sweepFour(b);
  b.reach('throttle');
  b.identify(2, 1, -1, 'roll');
  b.identify(0, 1, 0, 'pitch');
  check('Mode 2: pitch is the right stick', /right stick/.test(b.view.prompt), b.view.prompt);
  b.im.setStickMode(1);
  check('Mode 1: pitch is the left stick', /left stick/.test(b.view.prompt), b.view.prompt);
  b.im.setStickMode(2);
}

/* ------------------------------------------------------- mouse flight */

const MOUSE_EVENTS = ['mousemove', 'wheel', 'mousedown', 'mouseup', 'contextmenu'];

heading('mouse flight: off unless picked, and then only while live');
{
  const b = new Bench(null);
  const { im } = b;
  const listening = new Map();
  window.addEventListener = (type) => listening.set(type, (listening.get(type) || 0) + 1);
  window.removeEventListener = (type) => listening.set(type, (listening.get(type) || 0) - 1);
  b.run(100);
  check('off by default, with the keyboard flying', !im.mouseEnabled && !im.isMousePrimary() && im.stats().source === 'the keyboard', im.stats().source);
  im.setMouseLive(true);
  im.mouseMove(300, 0);
  im.mouseWheel(-100);
  b.run(100);
  check('off, a live mouse moves nothing', im.channels.roll === 0 && im.channels.throttle === 0, show(im.channels));
  check('and there was never a wheel listener', !listening.get('wheel'));
  im.setMouseConfig({ enabled: true, sens: 100, expo: 0, invert: false, centre: 'auto' });
  check('on, all five listeners are added', MOUSE_EVENTS.every((t) => listening.get(t) === 1));
  b.run(50);
  check('on, the mouse is the source', im.isMousePrimary() && im.stats().source === 'the mouse', im.stats().source);
  im.mouseMove(150, 0);
  im.mouseWheel(-100);
  b.run(50);
  check('not live (no pointer lock): movement and wheel belong to the menus', im.channels.roll === 0 && im.channels.throttle === 0, show(im.channels));
  im.setMouseConfig({ enabled: false, sens: 100, expo: 0, invert: false, centre: 'auto' });
  check('off again, every listener is gone', MOUSE_EVENTS.every((t) => listening.get(t) === 0));
  window.addEventListener = () => {};
  window.removeEventListener = () => {};
}

function mouseBench({ wing = false, rates = true, cfg = {}, pad = null } = {}) {
  const b = new Bench(pad);
  b.im.setMouseConfig({ enabled: true, sens: 100, expo: 0, invert: false, centre: 'auto', ...cfg });
  b.im.setMouseCraft(wing, rates);
  b.im.setMouseLive(true);
  b.run(50);
  return b;
}

heading('mouse flight: the wheel is a throttle that stays put');
{
  const b = mouseBench();
  const { im } = b;
  const notches = (n, dy = -100, mode = 0) => {
    for (let k = 0; k < n; k += 1) {
      im.mouseWheel(dy, mode);
    }
    b.run(20);
  };
  notches(11);
  check('a quad: eleven notches up is exactly 22 percent', near(im.channels.throttle, 0.22), String(im.channels.throttle));
  b.run(3000);
  check('three seconds on it is still 22: no spring to hover or zero', near(im.channels.throttle, 0.22), String(im.channels.throttle));
  notches(1, 53);
  check('a 53-pixel notch down (Linux) is one notch: 20', near(im.channels.throttle, 0.2), String(im.channels.throttle));
  notches(1, -120);
  check('a 120-pixel notch up is one notch: 22', near(im.channels.throttle, 0.22), String(im.channels.throttle));
  notches(9, -10);
  check('nine 10-pixel trackpad strokes are not yet a notch', near(im.channels.throttle, 0.22), String(im.channels.throttle));
  notches(1, -10);
  check('the tenth makes one', near(im.channels.throttle, 0.24), String(im.channels.throttle));
  notches(1, -3, 1);
  check('three lines (Firefox\'s notch) is one notch', near(im.channels.throttle, 0.26), String(im.channels.throttle));
  notches(80);
  check('it stops at full', im.channels.throttle === 1, String(im.channels.throttle));
  notches(80, 100);
  check('and at zero', im.channels.throttle === 0, String(im.channels.throttle));
  im.setMouseCraft(true, false);
  notches(3);
  check('a plane steps 5 percent: three notches is 15', near(im.channels.throttle, 0.15), String(im.channels.throttle));
  im.resetKeyboardSticks();
  b.run(20);
  check('a reset takes the wheel\'s throttle down, so a wreck cannot relaunch', im.channels.throttle === 0, String(im.channels.throttle));
}

heading('mouse flight: movement is roll and pitch, springing or holding');
{
  const b = mouseBench();
  const { im } = b;
  check('a quad on Acro springs by default', im.mouseCentring() === 'spring');
  im.mouseMove(150, 0);
  b.tick(1);
  check('150 counts right at 100 percent is half right roll', Math.abs(im.channels.roll - 0.5) < 0.01, String(im.channels.roll));
  b.run(1000);
  check('a second later it is back to exactly +0', im.channels.roll === 0 && Object.is(im.channels.roll, 0), String(im.channels.roll));
  const before = im.queue.length;
  b.run(1000);
  check('and at rest only the heartbeat is queued', im.queue.length - before <= 11, `${im.queue.length - before}`);
  im.setMouseCraft(false, false);
  check('a quad on Angle holds', im.mouseCentring() === 'hold');
  im.setMouseCraft(true, true);
  check('every plane holds, even with the quad on Acro', im.mouseCentring() === 'hold');
  im.mouseMove(150, 0);
  b.run(2000);
  check('held: half right roll is still exactly half two seconds on', near(im.channels.roll, 0.5), String(im.channels.roll));
  im.mouseMove(0, 150);
  b.run(20);
  check('mouse pulled back 150 is half back stick, nose up, +pitch', near(im.channels.pitch, 0.5), String(im.channels.pitch));
  im.mouseButton(1, true);
  im.mouseButton(1, false);
  b.run(20);
  check('the middle button centres both', im.channels.roll === 0 && im.channels.pitch === 0, show(im.channels));
  im.mouseMove(-600, -600);
  b.run(20);
  check('past full it stops at full: left roll, nose down', im.channels.roll === -1 && im.channels.pitch === -1, show(im.channels));
  im.keys.add('KeyZ');
  b.run(20);
  im.keys.delete('KeyZ');
  b.run(20);
  check('Z centres it too', im.channels.roll === 0 && im.channels.pitch === 0, show(im.channels));
  im.setMouseConfig({ enabled: true, sens: 100, expo: 0, invert: false, centre: 'spring' });
  check('the pilot can pin springing on a plane', im.mouseCentring() === 'spring');
}

heading('mouse flight: invert, sensitivity, expo, and settings off the list');
{
  const inv = mouseBench({ wing: true, cfg: { invert: true } });
  inv.im.mouseMove(0, 150);
  inv.run(20);
  check('inverted, pulling back is nose DOWN', near(inv.im.channels.pitch, -0.5), String(inv.im.channels.pitch));
  const fast = mouseBench({ wing: true, cfg: { sens: 200 } });
  fast.im.mouseMove(75, 0);
  fast.run(20);
  check('at 200 percent, 75 counts is half stick', near(fast.im.channels.roll, 0.5), String(fast.im.channels.roll));
  const soft = mouseBench({ wing: true, cfg: { expo: 50 } });
  soft.im.mouseMove(150, 0);
  soft.run(20);
  check('expo 50 makes half stick 0.3125', near(soft.im.channels.roll, 0.3125), String(soft.im.channels.roll));
  soft.im.mouseMove(600, 0);
  soft.run(20);
  check('and full stays full', soft.im.channels.roll === 1, String(soft.im.channels.roll));
  const odd = mouseBench({ cfg: { sens: 7, expo: 99, centre: 'sideways' } });
  check('a setting not on the list falls back to the default',
    odd.im.mouseCfg.sens === 100 && odd.im.mouseCfg.expo === 0 && odd.im.mouseCfg.centre === 'auto', show(odd.im.mouseCfg));
}

heading('mouse flight: the buttons are yaw, and every key still flies');
{
  const b = mouseBench({ wing: true });
  const { im } = b;
  im.mouseButton(0, true);
  b.run(400);
  check('left button held is left yaw, on the keys\' own ramp', im.channels.yaw < -0.3, String(im.channels.yaw));
  im.mouseButton(0, false);
  b.run(400);
  check('let go, yaw springs to zero', im.channels.yaw === 0, String(im.channels.yaw));
  im.mouseButton(2, true);
  b.run(400);
  check('right button is right yaw', im.channels.yaw > 0.3, String(im.channels.yaw));
  im.setMouseLive(false);
  b.run(400);
  check('losing the pointer lets go of a held button', im.channels.yaw === 0, String(im.channels.yaw));
  im.setMouseLive(true);
  im.keys.add('KeyD');
  b.run(400);
  check('D is right yaw, as on the keyboard', im.channels.yaw > 0.3, String(im.channels.yaw));
  im.keys.delete('KeyD');
  im.mouseMove(150, 0);
  im.keys.add('ArrowLeft');
  b.run(400);
  check('a held arrow wins its channel over the mouse', im.channels.roll < -0.3, String(im.channels.roll));
  im.keys.delete('ArrowLeft');
  b.run(400);
  check('let go, the mouse\'s held roll is back', near(im.channels.roll, 0.5), String(im.channels.roll));
  im.keys.add('ArrowUp');
  b.run(400);
  check('up arrow is nose down', im.channels.pitch < -0.3, String(im.channels.pitch));
  im.keys.delete('ArrowUp');
  im.keys.add('KeyW');
  b.run(500);
  im.keys.delete('KeyW');
  const thr = im.channels.throttle;
  check('W raises the throttle with no wheel at all', thr > 0.3, String(thr));
  b.run(2000);
  check('and it stays when W is let go, like the wheel', im.channels.throttle === thr, `${thr} -> ${im.channels.throttle}`);
  im.mouseWheel(-100);
  b.run(20);
  check('the next notch steps from where W left it', im.channels.throttle > thr, `${thr} -> ${im.channels.throttle}`);
  im.keys.add('KeyS');
  b.run(2000);
  im.keys.delete('KeyS');
  b.run(20);
  check('S takes it all the way down', im.channels.throttle === 0, String(im.channels.throttle));
  im.setStickMode(3);
  im.mouseButton(0, true);
  b.run(400);
  check('in Mode 3 the buttons are still yaw, on that mode\'s yaw keys', im.channels.yaw < -0.3 && im.channels.roll !== -1, show(im.channels));
  im.mouseButton(0, false);
}

heading('mouse flight: its place among the sources');
{
  const b = mouseBench({ pad: radio([0.4, 0, 1, 0], 4) });
  const { im } = b;
  check('picked, the mouse flies over a plugged-in radio',
    im.stats().source === 'the mouse' && im.channels.roll === 0 && im.channels.throttle === 0, show([im.stats().source, im.channels]));
  im.harnessChannels = { roll: 0.1, pitch: 0.2, yaw: 0.3, throttle: 0.4 };
  b.run(20);
  check('the harness stick is still above everything', im.channels.throttle === 0.4 && !im.isMousePrimary());
  im.harnessChannels = null;
  im.setMouseConfig({ enabled: false, sens: 100, expo: 0, invert: false, centre: 'auto' });
  b.run(20);
  check('switched off, the radio flies again', im.channels.roll === 0.4 && im.channels.throttle === 1, show(im.channels));
}

/* ------------------------------------------------ the standard gamepad */

/* What each physical stick does in each mode, from the table in
 * stickmode.js's header, and the W3C layout written out here rather than
 * read from the code under test: axes 0 and 1 the left stick, 2 and 3 the
 * right, right and down positive. */
const MODE_STICKS = {
  1: { left: ['yaw', 'pitch'], right: ['roll', 'throttle'] },
  2: { left: ['yaw', 'throttle'], right: ['roll', 'pitch'] },
  3: { left: ['roll', 'pitch'], right: ['yaw', 'throttle'] },
  4: { left: ['roll', 'throttle'], right: ['yaw', 'pitch'] },
};
const W3C = { left: { x: 0, y: 1 }, right: { x: 2, y: 3 } };

heading('a standard gamepad flies the pilot\'s mode on its physical sticks ("finding the order of sticks")');
for (const mode of [1, 2, 3, 4]) {
  const b = new Bench(gamepad());
  b.im.setStickMode(mode);
  b.run(50);
  const { im } = b;
  const push = (axis, v) => {
    b.set(axis, v); b.tick();
    const c = { ...im.channels };
    b.set(axis, 0); b.tick();
    return c;
  };
  const rest = { ...im.channels };
  check(`Mode ${mode}: hands off, the sprung channels 0 and throttle half`,
    rest.roll === 0 && rest.pitch === 0 && rest.yaw === 0 && rest.throttle === 0.5, show(rest));
  for (const side of ['left', 'right']) {
    const [horiz, vert] = MODE_STICKS[mode][side];
    const right = push(W3C[side].x, 1);
    check(`Mode ${mode}: ${side} stick right is ${horiz} +1 and nothing else moves`,
      right[horiz] === 1 && ['roll', 'pitch', 'yaw'].filter((ch) => ch !== horiz).every((ch) => right[ch] === 0) && right.throttle === 0.5,
      show(right));
    const left = push(W3C[side].x, -1);
    check(`Mode ${mode}: ${side} stick left is ${horiz} -1`, left[horiz] === -1, show(left));
    const up = push(W3C[side].y, -1);
    const down = push(W3C[side].y, 1);
    if (vert === 'throttle') {
      check(`Mode ${mode}: ${side} stick up is full throttle, down is zero`,
        up.throttle === 1 && down.throttle === 0 && up.pitch === 0 && up.roll === 0 && up.yaw === 0, show([up, down]));
    } else {
      check(`Mode ${mode}: ${side} stick up is pitch forward (-1), down pulled back (+1)`,
        up.pitch === -1 && down.pitch === 1 && up.throttle === 0.5, show([up, down]));
    }
  }
  const thrSide = MODE_STICKS[mode].left[1] === 'throttle' ? 'left' : 'right';
  check(`Mode ${mode}: the throttle is on the ${thrSide} stick`, stickSideOf(mode, 'throttle') === thrSide);
}

heading('a standard gamepad on its own layout is not a guess');
{
  const b = new Bench(gamepad());
  b.run(50);
  let s = b.im.padSummary();
  check('known, not calibrated, and nothing warns', s.mapKnown === true && s.calibrated === false && s.guessNoYaw === false, show(s));
  check('the source is a radio, not a guess', b.im.stats().source === 'a radio', b.im.stats().source);
  /* AETR's throttle axis is the right stick's horizontal, so a hard roll
   * used to "park the throttle", and AETR's yaw is the right stick's
   * vertical, so the no-yaw check watched the wrong axis. */
  for (const v of [0.2, 0.6, 1, 0.6, -0.4, -1, 0]) {
    b.set(2, v); b.tick();
    b.set(1, v); b.tick();
  }
  s = b.im.padSummary();
  check('hard roll and throttle do not look like a parked radio throttle', b.im.mapSeenParked === false && s.mapUsable === false, show(s));
  check('and raise no no-yaw verdict', s.guessNoYaw === false);
  check('the menus still read any stick, as on a standard pad', b.im.mapUsable() === false);
}

heading('a radio still gets AETR, exactly');
{
  const b = new Bench(radio([0, 0, -1, 0], 4, 'TX16S'));
  b.run(50);
  const m = b.im.map;
  check('roll 0, pitch 1 reversed, throttle 2 from -1, yaw 3',
    m.roll.axis === 0 && m.roll.full === 1 && m.pitch.axis === 1 && m.pitch.full === -1
      && m.throttle.axis === 2 && m.throttle.low === -1 && m.throttle.high === 1 && m.yaw.axis === 3 && m.yaw.full === 1, show(m));
  check('throttle parked at the bottom reads 0', b.im.channels.throttle === 0);
  b.im.setStickMode(1);
  b.run(20);
  check('a mode change leaves a radio\'s map alone', b.im.map.throttle.axis === 2 && b.im.map.pitch.axis === 1);
  check('and it is still the guess the checks watch', b.im.mapKnown() === false);
}

heading('the built-in map follows the device and the mode; a saved map wins');
{
  const pad = gamepad();
  const b = new Bench(pad);
  b.run(20);
  check('Mode 2: throttle on axis 1', b.im.map.throttle.axis === 1);
  b.im.setStickMode(1);
  b.run(20);
  check('Mode 1 in Settings: throttle moves to axis 3', b.im.map.throttle.axis === 3 && b.im.map.pitch.axis === 1);
  pad.mapping = '';
  pad.axes = [0, 0, -1, 0];
  b.run(20);
  check('a radio in the same slot gets AETR back', b.im.map.throttle.axis === 2 && b.im.map.throttle.low === -1);
}
{
  const store = storage();
  store.setItem('webfpv_stick_map_v1', show({
    roll: { axis: 0, center: 0, full: 1 },
    pitch: { axis: 1, center: 0, full: -1 },
    yaw: { axis: 3, center: 0, full: 1 },
    throttle: { axis: 2, low: 0, high: 1, sprung: true },
  }));
  const b = new Bench(gamepad(), store);
  b.run(20);
  check('a saved map on a standard pad is the one flown',
    b.im.map.stored === true && b.im.map.throttle.axis === 2 && b.im.map.roll.axis === 0, show(b.im.map.throttle));
  b.im.setStickMode(1);
  b.run(20);
  check('and a mode change does not replace it', b.im.map.stored === true && b.im.map.throttle.axis === 2);
  check('hands off it reads its own zero', b.im.channels.throttle === 0);
}
{
  const b = new Bench(gamepad());
  b.run(20);
  const done = calibrate(b, { roll: 2, pitch: 3, yaw: 0, thr: 1, thrBack: 0 });
  check('the wizard finishes on a standard pad', done === true, String(done));
  b.im.acceptCalibration();
  check('and its map is saved over the built-in one', b.im.map.stored === true && b.im.map.yaw.axis === 0 && b.im.map.roll.axis === 2);
}

heading('throttle low first: a standard pad at rest is held until it has been down');
{
  const b = new Bench(gamepad());
  b.run(20);
  b.im.drain();
  b.im.holdThrottleLow(0.18);
  b.run(20);
  check('centred at a spawn: throttle 0, and the shell told it is waiting',
    b.im.channels.throttle === 0 && b.im.throttleWaiting === true, show(b.im.channels));
  b.set(1, -1); b.tick();
  check('full up without having been down: still 0', b.im.channels.throttle === 0);
  check('and every sample for the plant says 0', b.im.drain().every((q) => q.throttle === 0));
  b.set(1, 1); b.tick();
  check('pulled down: 0, and no longer waiting', b.im.channels.throttle === 0 && b.im.throttleWaiting === false);
  b.set(1, -1); b.tick();
  check('then up: full', b.im.channels.throttle === 1);
  b.set(1, 0); b.tick();
  check('let go: half; the hold does not come back by itself', b.im.channels.throttle === 0.5);
  b.im.holdThrottleLow(0.18);
  b.set(1, 0.8); b.tick();
  check('a landing with the stick near the bottom (0.1) clears at once',
    Math.abs(b.im.channels.throttle - 0.1) < 1e-9 && !b.im.throttleWaiting, String(b.im.channels.throttle));
  b.set(1, 0);
  b.im.holdThrottleLow(0.18);
  b.tick();
  b.im.releaseThrottleHold();
  b.tick();
  check('an air start releases it: half at once', b.im.channels.throttle === 0.5);
  b.im.holdThrottleLow(0.18);
  b.tick();
  b.im.keys.add('KeyW');
  b.run(200);
  const thrW = b.im.channels.throttle;
  b.im.keys.delete('KeyW');
  check('W still drives the throttle over a held pad', thrW > 0, String(thrW));
}
{
  const b = new Bench(radio([0, 0, 0, 0], 4, 'LiteRadio 3, sprung, uncalibrated'));
  b.run(20);
  b.im.holdThrottleLow(0.18);
  b.run(20);
  check('a radio is never held, even one resting at half',
    b.im.throttleHeld === false && b.im.channels.throttle === 0.5 && !b.im.throttleWaiting, show(b.im.channels));
}
{
  const b = new Bench(radio([0, 0, -1, 0], 4, 'TX16S'));
  b.run(20);
  b.im.holdThrottleLow(0.18);
  b.set(2, 0.5); b.tick();
  check('a parked radio pushed straight up after a spawn flies as always', b.im.channels.throttle === 0.75);
}
{
  const b = new Bench(null);
  b.im.holdThrottleLow(0.18);
  b.im.keys.add('KeyW');
  b.run(300);
  check('no pad: the keyboard is never held', b.im.throttleHeld === false && b.im.channels.throttle > 0, String(b.im.channels.throttle));
}
{
  const store = storage();
  store.setItem('webfpv_stick_map_v1', show({
    roll: { axis: 2, center: 0, full: 1 },
    pitch: { axis: 3, center: 0, full: 1 },
    yaw: { axis: 0, center: 0, full: 1 },
    throttle: { axis: 1, low: 0, high: -1, sprung: true },
  }));
  const b = new Bench(gamepad(), store);
  b.run(20);
  b.im.holdThrottleLow(0.18);
  b.set(1, -1); b.tick();
  check('a calibrated standard pad, zero at rest, is not held', b.im.channels.throttle === 1);
}
{
  const b = new Bench(gamepad());
  b.run(20);
  b.im.holdThrottleLow(0.18);
  b.tick();
  b.im.harnessChannels = { roll: 0, pitch: 0, yaw: 0, throttle: 0.6 };
  b.tick();
  b.im.harnessChannels = null;
  b.tick();
  check('anything else flying, even once, ends the hold, so a pad is never cut in the air',
    b.im.throttleHeld === false && b.im.channels.throttle === 0.5);
}

heading('an ExpressLRS radio over Bluetooth flies its own layout uncalibrated ("its like the axis are all flipped")');
/* The device as measured, 2026-10-05, Chrome on macOS, with its aux switch
 * on axis 2 left high so that AETR would read full throttle from it. */
const ELRS_NAME = 'ExpressLRS Joystick (Vendor: e502 Product: bbab)';
const elrs = () => radio([0, 0, 1, -1, 0, 0, 0, 0, 0, 0], 16, ELRS_NAME);
const POCKET_USB = 'Radiomaster Pocket Joystick (Vendor: 1209 Product: 4f54)';
{
  const b = new Bench(elrs());
  b.run(100);
  check('throttle down is exactly 0, whatever the aux switch on axis 2 says', b.im.channels.throttle === 0, String(b.im.channels.throttle));
  b.set(3, 1); b.tick();
  check('throttle up on axis 3 is exactly 1', b.im.channels.throttle === 1, String(b.im.channels.throttle));
  check('and the throttle stick is not yaw', b.im.channels.yaw === 0, String(b.im.channels.yaw));
  b.set(3, -1); b.set(4, 1); b.tick();
  check('yaw right on axis 4 is exactly 1', b.im.channels.yaw === 1, String(b.im.channels.yaw));
  b.set(4, 0); b.set(0, 1); b.tick();
  check('roll right on axis 0 is exactly 1', b.im.channels.roll === 1, String(b.im.channels.roll));
  b.set(0, 0); b.set(1, 1); b.tick();
  check('stick forward on axis 1 is nose down, exactly -1', b.im.channels.pitch === -1, String(b.im.channels.pitch));
  check('recognised, not guessed: nothing asks for calibration', b.im.mapKnown() === true);
}
{
  const pad = radio([0, 0, -1, 0, 0, 0, 0, 0, 0, 0], 16, POCKET_USB);
  const b = new Bench(pad);
  b.run(100);
  b.set(2, 1); b.tick();
  check('the same radio on its cable is still AETR, throttle on axis 2', b.im.channels.throttle === 1, String(b.im.channels.throttle));
  Object.assign(pad, elrs());
  b.run(100);
  b.set(3, 1); b.tick();
  check('cable out, Bluetooth in: the throttle follows to axis 3', b.im.channels.throttle === 1, String(b.im.channels.throttle));
  pad.id = POCKET_USB;
  pad.axes = [0, 0, 1, -1, 0, 0, 0, 0];
  b.run(100);
  check('and back on the cable it is AETR again', b.im.channels.throttle === 1 && b.im.channels.yaw === -1, show(b.im.channels));
}
{
  const store = storage();
  store.setItem('webfpv_stick_map_v1', show({
    roll: { axis: 4, center: 0, full: 1 },
    pitch: { axis: 1, center: 0, full: -1 },
    yaw: { axis: 0, center: 0, full: 1 },
    throttle: { axis: 3, low: -1, high: 1 },
  }));
  const b = new Bench(elrs(), store);
  b.run(100);
  b.set(0, 1); b.tick();
  check('a saved calibration still wins over the recognised layout', b.im.channels.yaw === 1 && b.im.channels.roll === 0, show(b.im.channels));
}

heading('the sweep lets a throttle with no spring stop somewhere new, and only that');
{
  /* Recorded live: rest 0.735, left at 0.361, and "Back to rest to
   * continue." for as long as anyone watched. */
  const b = new Bench(radio([0, 0, 0.735, 0, 0, 0], 4));
  b.im.startCalibration();
  check('the centre step settles with the throttle up, as ever', b.reach('sweep'));
  b.sweep([0, 1, 2, 3], () => 1, (i) => (i === 2 ? 0.361 : 0));
  check('a throttle left somewhere else no longer strands the sweep', b.reach('throttle'));
  b.run(1500);
  check('and resting there is not a throttle deflection', b.view.step === 'throttle' && b.view.phase === 'hold', `${b.view.step} ${b.view.phase}`);
  b.set(2, 1);
  check('pushed up from there, it is taken', b.released());
  b.set(2, -1);
  check('and let down to the bottom, roll is next', b.reach('roll'));
  let ok = true;
  for (const [name, axis, push] of [['roll', 0, 1], ['pitch', 1, -1], ['yaw', 3, 1]]) {
    b.set(axis, push);
    ok = ok && b.released();
    b.set(axis, 0);
    ok = ok && b.until((v) => v.phase === 'hold');
    ok = ok && b.view.step !== name;
  }
  check('the wizard reaches the check step', ok && b.view.step === 'confirm', b.view.step);
  b.im.acceptCalibration();
  b.set(2, -1); b.tick();
  check('the bottom reads exactly 0', b.im.channels.throttle === 0, String(b.im.channels.throttle));
  b.set(2, 1); b.tick();
  check('the top reads exactly 1', b.im.channels.throttle === 1, String(b.im.channels.throttle));
}
{
  /* Two axes off rest is a stick held in a corner, not a parked throttle. */
  const b = new Bench(radio([0, 0, -1, 0, 0, 0], 4));
  b.im.startCalibration();
  b.reach('sweep');
  sweepFour(b);
  b.set(0, 1); b.set(1, 1);
  b.run(3000);
  check('a stick held in a corner still waits', b.view.step === 'sweep', b.view.step);
  b.set(1, 0);
  for (let k = 0; k < 180; k += 1) {
    b.set(0, k % 2 ? 0.9 : 0.6); b.tick();
  }
  check('one axis off rest but still moving still waits', b.view.step === 'sweep', b.view.step);
  b.set(0, 0);
  check('and back at rest it carries on', b.reach('throttle'));
}

heading('edges the stories above leave open');
{
  const b = new Bench(radio([0, 0, -1, 0], 4, 'Deadband'));
  b.set(0, 0.011); b.tick();
  check('a gimbal resting a hair off centre (0.011) reads exactly 0', b.im.channels.roll === 0, String(b.im.channels.roll));
  b.set(0, 0.013); b.tick();
  check('and just past the deadband (0.013) reads what it says', b.im.channels.roll === 0.013, String(b.im.channels.roll));
  b.set(0, 0.4); b.tick();
  b.im.keys.add('ArrowLeft');
  b.run(200);
  check('a held stick key overrides the radio\'s own channel', b.im.channels.roll < 0, String(b.im.channels.roll));
  b.im.keys.delete('ArrowLeft');
  b.run(400);
  check('and the radio has it back once the key is up', b.im.channels.roll === 0.4, String(b.im.channels.roll));
}
{
  const store = storage();
  store.setItem('webfpv_stick_map_v1', show({ yaw: { axis: 2, center: 0, pos: -1, neg: 1 } }));
  const b = new Bench(radio([0, 0, 0, 0], 4, 'Partial map'), store);
  check('a saved map missing channels takes them from AETR',
    b.im.map.roll.axis === 0 && b.im.map.pitch.axis === 1 && b.im.map.throttle.axis === 2 && b.im.map.yaw.axis === 2, show(b.im.map));
}
{
  const b = new Bench(null);
  b.im.keys.add('ArrowRight');
  b.run(96);
  const tap = b.im.channels.roll;
  b.run(592);
  const cruise = b.im.channels.roll;
  b.run(600);
  const full = b.im.channels.roll;
  b.im.keys.delete('ArrowRight');
  check('a key held about a tap is a nudge', tap > 0.1 && tap < 0.2, String(tap));
  check('held 700 ms it is still the cruise, not the stop', near(cruise, 0.34), String(cruise));
  check('and only a hold past 1250 ms is full stick', full === 1, String(full));
}
{
  const b = new Bench(radio([0, 0, -1, 0], 4, 'Too early'));
  b.im.startCalibration();
  b.run(100);
  check('no channel can be reversed before the check step', b.im.reverseChannel('roll') === false);
  b.im.cancelCalibration();
}
{
  const b = new Bench(radio([0, 0, -1, 0, 0, -1], 4, 'Pocket, then calibrated'));
  b.run(100);
  for (const v of [0.2, 0.45, 0.7, 0.95, 0.45, -0.3, -0.75, 0]) {
    b.set(4, v); b.tick();
  }
  check('the no-yaw verdict is up before calibrating', b.im.padSummary().guessNoYaw === true);
  const done = calibrate(b, { roll: 0, pitch: 1, yaw: 4, thr: 2, thrBack: -1 });
  b.im.skipCalibrationSelect();
  check('the wizard finishes', done === true, String(done));
  b.im.acceptCalibration();
  check('and a saved calibration takes the verdict down with the guess', b.im.padSummary().guessNoYaw === false);
}

console.log(failed ? `\n${failed} failed, ${passed} passed` : `\nall ${passed} passed`);
for (const f of failures) {
  console.log(`  FAIL ${f}`);
}
process.exitCode = failed ? 1 : 0;
