/*
 * input-trace-selftest.js: the InputManager (src/input/input.js) pinned
 * step by step against a golden trace, in plain Node.
 *
 * input-selftest.js asserts the stories behind the input tickets one at a
 * time. This records everything the shell can read back from the input
 * after every poll of a long list of scripted sessions, and hashes it: the
 * samples queued for the flight controller with their wall stamps, the
 * channels, the source, the stats, the throttle hold, the calibration
 * wizard's view on every frame of several complete runs, the joystick
 * picker's view, the pad summary, the menu buttons and cursor, mouse
 * flight, the thumb-stick rung, the keyboard collective in every stick
 * mode, and what lands in storage. Any change in what reaches the flight
 * controller, or in what the screens are told, is a different hash.
 *
 * The clock is the test's, never the machine's: performance.now is
 * replaced, so every hold, spring and cooldown is exactly reproducible.
 * Storage is read back by meaning (the stick map, the pad choice) rather
 * than by key name.
 *
 * tests/fixtures/input-trace.json was written from the shipped module
 * before it was rewritten. `--write` regenerates it; only ever from a
 * module whose behaviour is the one players already have. `--dump <dir>`
 * writes every scenario's rows as text, to diff two modules.
 *
 *   node scripts/input-trace-selftest.js
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

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GOLDEN = fileURLToPath(new URL('../tests/fixtures/input-trace.json', import.meta.url));
const WRITE = process.argv.includes('--write');
const DUMP = process.argv.includes('--dump') ? process.argv[process.argv.indexOf('--dump') + 1] : null;
const MODULE = process.env.INPUT_MODULE || '../src/input/input.js';

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

/* ------------------------------------------------------------ environment */

/* Storage keys by meaning. Both spellings are read, so the trace is the
 * same before and after the keys were renamed; a key present under both
 * spellings at once is reported, because that is a migration bug. */
const STORE_NAMES = {
  stickmap: ['webfpv_stick_map_v1', 'fdfpv.stick_map.v1'],
  pad: ['webfpv.pad.v1', 'fdfpv.pad.v1'],
};

const env = {
  now: 1000,
  pads: [],
  store: new Map(),
  listeners: {},
  intervals: [],
  quota: false,
};
Object.defineProperty(globalThis, 'performance', {
  value: { now: () => env.now }, configurable: true, writable: true,
});
globalThis.localStorage = {
  getItem: (k) => (env.store.has(k) ? env.store.get(k) : null),
  setItem: (k, v) => {
    if (env.quota) {
      throw new Error('QuotaExceededError');
    }
    env.store.set(k, String(v));
  },
  removeItem: (k) => { env.store.delete(k); },
  key: (i) => [...env.store.keys()][i] ?? null,
  get length() { return env.store.size; },
};
globalThis.window = {
  addEventListener: (type, fn) => { (env.listeners[type] ||= []).push(fn); },
  removeEventListener: (type, fn) => {
    env.listeners[type] = (env.listeners[type] || []).filter((f) => f !== fn);
  },
};
Object.defineProperty(globalThis, 'navigator', {
  value: { getGamepads: () => env.pads }, configurable: true, writable: true,
});
globalThis.setInterval = (fn, ms) => {
  env.intervals.push({ fn, ms, live: true });
  return env.intervals.length;
};
globalThis.clearInterval = (id) => {
  if (env.intervals[id - 1]) {
    env.intervals[id - 1].live = false;
  }
};

function fire(type, init = {}) {
  let prevented = false;
  const e = {
    type, repeat: false, target: null, ...init, preventDefault() { prevented = true; },
  };
  for (const fn of [...(env.listeners[type] || [])]) {
    fn(e);
  }
  return prevented;
}

function resetEnv(seed = {}) {
  env.now = 1000;
  env.pads = [];
  env.store = new Map(Object.entries(seed));
  env.listeners = {};
  env.intervals = [];
  env.quota = false;
}

function makePad({
  id = 'Test radio', index = 0, axes = [0, 0, -1, 0], buttons = 0, mapping = '',
} = {}) {
  return {
    index,
    id,
    connected: true,
    mapping,
    timestamp: 1,
    axes: axes.slice(),
    buttons: Array.from({ length: buttons }, () => ({ pressed: false, touched: false, value: 0 })),
  };
}

const { InputManager, ...exported } = await import(MODULE);

/* --------------------------------------------------------------- recording */

const bits = new DataView(new ArrayBuffer(8));
/* Every number as its exact bit pattern, so a last-bit difference in a
 * stick value is a different trace. */
function exact(x) {
  if (typeof x !== 'number') {
    return x;
  }
  if (Object.is(x, -0)) {
    return '-0';
  }
  bits.setFloat64(0, x);
  return `#${bits.getBigUint64(0).toString(16)}`;
}
function deep(v) {
  if (typeof v === 'number') {
    return exact(v);
  }
  if (Array.isArray(v)) {
    return v.map(deep);
  }
  if (v instanceof Set) {
    return { set: [...v].map(deep) };
  }
  if (v instanceof Map) {
    return { map: [...v].map(deep) };
  }
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)]));
  }
  return v;
}

function storage() {
  const out = {};
  for (const [name, keys] of Object.entries(STORE_NAMES)) {
    const present = keys.filter((k) => env.store.has(k));
    out[name] = present.length > 1 ? 'BOTH SPELLINGS' : (present.length ? env.store.get(present[0]) : null);
  }
  return out;
}

/*
 * A session: a fresh InputManager in a fresh environment, and a recorder.
 * `snap` records what the shell would read. `extra` adds the readers that
 * have side effects of their own (the menu buttons latch, the cursor
 * learns rest), which only the scenarios about menus call, at the cadence
 * main.js calls them.
 */
function session(seed, build) {
  resetEnv(seed);
  const rows = [];
  const s = {
    im: null,
    rows,
    make() {
      s.im = new InputManager();
      return s.im;
    },
    tick(ms = 16) {
      env.now += ms;
      s.im.poll(env.now);
    },
    snap(label, extra = null) {
      const im = s.im;
      const row = {
        label,
        now: env.now,
        samples: im.drain().map((q) => [q.wallT, q.roll, q.pitch, q.yaw, q.throttle]),
        channels: im.channels,
        stats: im.stats(),
        held: { throttleWaiting: im.throttleWaiting, calResult: im.calResult, padPickResult: im.padPickResult },
        primary: [im.isKeyboardPrimary(), im.isMousePrimary(), im.isTouchPrimary()],
        usable: [im.mapUsable(), im.mapKnown()],
        pad: (() => {
          const gp = im.firstGamepad();
          return gp ? `${gp.index}:${gp.id}` : null;
        })(),
        summary: im.padSummary(),
        cal: im.calibrationView(),
        pick: im.padPickView(),
        map: im.map,
        storage: storage(),
        listeners: Object.fromEntries(Object.entries(env.listeners).map(([k, v]) => [k, v.length]).filter(([, n]) => n)),
      };
      if (extra) {
        row.extra = extra(im);
      }
      rows.push(deep(row));
    },
    run(ms, step = 16, label = null, extra = null) {
      for (let e = 0; e < ms; e += step) {
        s.tick(step);
        if (label) {
          s.snap(`${label} +${e + step}`, extra);
        }
      }
    },
    key(code, down = true, init = {}) {
      return fire(down ? 'keydown' : 'keyup', { code, ...init });
    },
  };
  build(s);
  return rows;
}

const menuReaders = (im) => ({
  buttons: im.padMenuButtons(),
  nav: im.navRaw(),
  swap: im.padSwapButtons(),
  alt: im.padAltButton(),
  look: im.padLookStick(),
  floats: im.padFloatsButton(),
});

/* Moves a pad's axes and stamps the change as a browser refresh would. */
function setAxes(gp, values) {
  values.forEach((v, i) => {
    if (v !== undefined) {
      gp.axes[i] = v;
    }
  });
  gp.timestamp += 1;
}
function press(gp, i, down) {
  gp.buttons[i].pressed = down;
  gp.buttons[i].value = down ? 1 : 0;
  gp.timestamp += 1;
}

/* --------------------------------------------------------------- scenarios */

const SCENARIOS = {};

SCENARIOS['the exports'] = () => [deep({
  names: Object.keys(exported).sort(),
  standard: [1, 2, 3, 4, 'x'].map((m) => exported.standardPadMap(m)),
  CAL_STEPS: exported.CAL_STEPS,
  SELECT_STEP: exported.SELECT_STEP,
  calSteps: [[true, 0], [true, 8], [false, 0], [false, 4], [false, 5], [false, 8], [0, 6], [1, 3]]
    .map(([b, n]) => exported.calSteps(b, n)),
  calStepsDefault: exported.calSteps(false),
  NAV_DEFLECT: exported.NAV_DEFLECT,
  MOUSE_SENS: exported.MOUSE_SENS,
  MOUSE_EXPOS: exported.MOUSE_EXPOS,
  MOUSE_CENTRES: exported.MOUSE_CENTRES,
  MOUSE_CENTRE_KEY: exported.MOUSE_CENTRE_KEY,
})];

/* The keyboard as the only stick, every key, in Mode 2, with taps, holds,
 * long holds, releases and the collective's hover latch. */
for (const mode of [2, 1, 3, 4]) {
  SCENARIOS[`keyboard flight, Mode ${mode}`] = () => session({}, (s) => {
    const im = s.make();
    s.snap('fresh');
    check(`Mode ${mode}: setStickMode answers the normalised mode`, im.setStickMode(mode) === mode);
    s.snap('mode set');
    const hold = (code, ms, label) => {
      s.key(code);
      s.run(ms, 16, `${label} held`);
      s.key(code, false);
      s.run(160, 16, `${label} released`);
    };
    hold('KeyW', 90, 'W tap');
    hold('KeyW', 1500, 'W long');
    hold('KeyS', 300, 'S');
    hold('KeyW', 400, 'W again');
    for (const code of ['KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      hold(code, 60, `${code} tap`);
      hold(code, 900, `${code} hold`);
    }
    /* Both keys of a pair, then a reversal mid hold. */
    s.key('KeyA');
    s.key('KeyD');
    s.run(100, 16, 'A and D');
    s.key('KeyA', false);
    s.run(100, 16, 'D after A lifts');
    s.key('KeyD', false);
    s.key('KeyW');
    s.key('KeyS');
    s.run(100, 16, 'W and S');
    s.key('KeyW', false);
    s.key('KeyS', false);
    /* Uneven frames, a stall, and a clock that goes backwards. */
    s.key('ArrowRight');
    for (const dt of [5, 33, 150, 1, 0, -20, 7, 400]) {
      s.tick(dt);
      s.snap(`ArrowRight, frame of ${dt} ms`);
    }
    s.key('ArrowRight', false);
    s.run(300, 16, 'settle');
    s.key('KeyW');
    s.run(500, 16, 'W before a mode change');
    im.setStickMode(mode === 1 ? 2 : 1);
    s.snap('mode changed while W held');
    s.run(300, 16, 'after the mode change');
    s.key('KeyW', false);
    s.run(800, 16, 'heartbeat while still');
  });
}

SCENARIOS['keyboard: launch hold, reset, harness stick'] = () => session({}, (s) => {
  const im = s.make();
  im.forcePadRest = true;
  s.key('KeyW');
  s.run(700, 16, 'W on the pad under launch control');
  s.key('KeyW', false);
  s.run(400, 16, 'released under launch control');
  im.forcePadRest = false;
  s.key('KeyW');
  s.run(700, 16, 'W free');
  s.key('KeyW', false);
  s.run(400, 16, 'hover latch');
  im.resetKeyboardSticks();
  s.snap('reset');
  s.run(200, 16, 'after reset');
  im.harnessChannels = { roll: 0.25, pitch: -0.5, yaw: 0.125, throttle: 0.6 };
  s.run(200, 16, 'harness stick');
  s.key('ArrowLeft');
  s.run(100, 16, 'a key under the harness stick');
  s.key('ArrowLeft', false);
  im.harnessChannels = null;
  s.run(300, 16, 'harness released');
});

SCENARIOS['keyboard: text fields, repeats, blur, the key hook'] = () => session({}, (s) => {
  const im = s.make();
  const heard = [];
  im.onKey = (code, repeat) => heard.push(`${code}${repeat ? '*' : ''}`);
  const field = { tagName: 'INPUT' };
  const area = { tagName: 'TEXTAREA' };
  const editable = { tagName: 'DIV', isContentEditable: true };
  const prevented = [];
  for (const [code, init] of [
    ['Space', {}], ['ArrowUp', {}], ['ArrowUp', { repeat: true }], ['KeyQ', {}],
    ['Space', { target: field }], ['Escape', { target: field }], ['Escape', { target: area, repeat: true }],
    ['ArrowLeft', { target: editable }], ['KeyW', { target: area }], ['Escape', {}], ['ArrowDown', { repeat: true }],
  ]) {
    prevented.push(`${code}:${s.key(code, true, init)}`);
  }
  s.run(64, 16, 'keys from fields and the page', () => ({ keys: [...im.keys].sort(), heard: heard.slice(), prevented }));
  fire('blur');
  s.run(64, 16, 'after blur', () => ({ keys: [...im.keys].sort() }));
  im.onKey = null;
  s.key('KeyD');
  s.run(48, 16, 'no hook', () => ({ keys: [...im.keys].sort() }));
});

/* Mouse flight, through the window listeners the module adds. */
for (const cfg of [
  { enabled: true, sens: 100, expo: 0, invert: false, centre: 'auto' },
  { enabled: true, sens: 300, expo: 75, invert: true, centre: 'spring' },
  { enabled: true, sens: 50, expo: 25, invert: false, centre: 'hold' },
  { enabled: true, sens: 123, expo: 33, invert: 'yes', centre: 'wobbly' },
]) {
  SCENARIOS[`mouse flight ${JSON.stringify(cfg)}`] = () => session({}, (s) => {
    const im = s.make();
    im.setMouseConfig(cfg);
    s.snap('enabled', () => ({ cfg: im.mouseCfg, centring: im.mouseCentring(), step: im.mouseThrottleStep() }));
    fire('mousemove', { movementX: 50, movementY: 20 });
    s.run(48, 16, 'moved before live');
    im.setMouseLive(true);
    for (const [craft, rates] of [[false, true], [false, false], [true, true]]) {
      im.setMouseCraft(craft, rates);
      s.snap(`craft wing=${craft} rates=${rates}`, () => ({ centring: im.mouseCentring(), step: im.mouseThrottleStep() }));
      for (const [dx, dy] of [[30, 0], [0, -45], [400, 400], [-1000, 10]]) {
        fire('mousemove', { movementX: dx, movementY: dy });
        s.run(32, 16, `move ${dx},${dy}`);
      }
      s.run(400, 16, 'let go');
      for (const [dy, mode] of [[-100, 0], [-120, 0], [-53, 0], [-3, 1], [-1, 2], [-10, 0], [-10, 0], [-10, 0], [-10, 0],
        [-15, 0], [100, 0], [0, 0], [NaN, 0], [-250, 0], [-39, 0], [-41, 0], [5000, 0]]) {
        const prevented = fire('wheel', { deltaY: dy, deltaMode: mode });
        s.tick(16);
        s.snap(`wheel ${dy} mode ${mode} prevented=${prevented}`, () => ({ mouse: im.mouse }));
      }
      for (const [b, down] of [[0, true], [0, false], [2, true], [2, false], [1, true], [1, false], [3, true], [0, true]]) {
        fire(down ? 'mousedown' : 'mouseup', { button: b });
        s.run(64, 16, `button ${b} ${down ? 'down' : 'up'}`);
      }
      fire('mouseup', { button: 0 });
      fire('mousemove', { movementX: 120, movementY: -60 });
      s.key('KeyZ');
      s.run(48, 16, 'centre key');
      s.key('KeyZ', false);
      s.key('KeyW');
      s.run(300, 16, 'W over the mouse');
      s.key('KeyW', false);
      s.key('KeyS');
      s.run(100, 16, 'S over the mouse');
      s.key('KeyS', false);
      s.key('ArrowLeft');
      s.run(200, 16, 'a stick key over the mouse');
      s.key('ArrowLeft', false);
      s.snap('context menu', () => ({ prevented: fire('contextmenu') }));
    }
    fire('mousedown', { button: 2 });
    im.setMouseLive(false);
    s.run(64, 16, 'live lost with a button down', () => ({ contextPrevented: fire('contextmenu'), wheelPrevented: fire('wheel', { deltaY: -100 }) }));
    im.setMouseConfig({ ...cfg, enabled: false });
    s.run(64, 16, 'disabled');
    im.setMouseConfig({ ...cfg, enabled: false, sens: 200 });
    im.setMouseConfig(cfg);
    s.snap('enabled again', () => ({ cfg: im.mouseCfg }));
    im.setMouseLive(true);
    fire('wheel', { deltaY: -500 });
    s.run(32, 16, 'wheel up');
    im.resetKeyboardSticks();
    s.run(32, 16, 'reset takes the wheel down');
  });
}

/* The thumb sticks rung: a stand-in source that plays back a script. */
SCENARIOS['touch sticks rung'] = () => session({}, (s) => {
  const im = s.make();
  const log = [];
  let active = false;
  let i = 0;
  const source = {
    active: () => active,
    sample: (dt) => {
      log.push(`sample ${dt}`);
      i += 1;
      return { roll: Math.sin(i) / 2, pitch: i % 3 === 0 ? 0 : -0.25, yaw: 0, throttle: Math.min(1, i / 50) };
    },
    reset: () => log.push('reset'),
    setStickMode: (m) => log.push(`mode ${m}`),
  };
  im.setStickMode(3);
  im.attachTouch(source);
  s.run(48, 16, 'attached, inactive', () => ({ log: log.splice(0) }));
  active = true;
  s.run(160, 16, 'active', () => ({ log: log.splice(0) }));
  im.setStickMode(1);
  im.setStickMode(1);
  s.key('KeyD');
  s.run(48, 16, 'a key while the thumbs fly', () => ({ log: log.splice(0) }));
  s.key('KeyD', false);
  im.resetKeyboardSticks();
  s.snap('reset', () => ({ log: log.splice(0) }));
  env.pads = [makePad()];
  s.run(48, 16, 'a radio arrives', () => ({ log: log.splice(0) }));
  env.pads = [];
  im.setMouseConfig({ enabled: true });
  s.run(48, 16, 'mouse picked', () => ({ log: log.splice(0) }));
  im.setMouseConfig({ enabled: false });
  active = false;
  s.run(48, 16, 'inactive again', () => ({ log: log.splice(0) }));
  const plain = { active: () => true, sample: () => ({ roll: 0.5, pitch: 0, yaw: 0, throttle: 0.5 }), reset() {} };
  im.attachTouch(plain);
  im.setStickMode(4);
  s.run(32, 16, 'a source with no setStickMode');
});

/* An uncalibrated radio flown on the AETR guess: the parked throttle
 * that makes the guess usable, a yaw that never moves while a stray
 * gimbal sweeps, then yaw moving and clearing the warning. Keyboard keys
 * over the pad, and the pad's own resolution. */
SCENARIOS['radio on the AETR guess'] = () => session({}, (s) => {
  const gp = makePad({ id: 'Generic radio (Vendor: 1209 Product: 4f54)', axes: [0, 0, 0, 0, 0, 0] });
  env.pads = [gp];
  const im = s.make();
  s.run(48, 16, 'throttle centred');
  setAxes(gp, [undefined, undefined, -1]);
  s.run(48, 16, 'throttle parked low');
  for (let k = 0; k <= 20; k += 1) {
    setAxes(gp, [undefined, undefined, undefined, undefined, -1 + k / 10]);
    s.tick(16);
    s.snap(`stray axis 4 at ${(-1 + k / 10).toFixed(1)}`);
  }
  setAxes(gp, [0.5, -0.25, 0.1, 0]);
  s.run(48, 16, 'sticks');
  setAxes(gp, [undefined, undefined, undefined, 0.6]);
  s.run(48, 16, 'yaw moves');
  setAxes(gp, [undefined, undefined, undefined, 0]);
  s.run(32, 16, 'yaw back');
  for (let k = 0; k < 12; k += 1) {
    setAxes(gp, [Math.round(Math.sin(k) * 128) / 128, Math.round(Math.cos(k) * 64) / 64, -1 + (k % 4) / 256, (k % 3) / 2048]);
    s.tick(7);
    s.snap(`quantised sweep ${k}`);
  }
  s.key('ArrowLeft');
  s.key('KeyW');
  s.run(200, 16, 'keys over the radio');
  s.key('ArrowLeft', false);
  s.key('KeyW', false);
  s.run(100, 16, 'keys lifted');
  gp.axes[1] = 0.004;
  gp.axes[0] = -0.011;
  s.run(32, 16, 'inside the deadband');
  env.pads = [];
  s.run(48, 16, 'unplugged');
  env.pads = [gp];
  s.run(48, 16, 'back');
});

/* A standard gamepad: the default map for each stick mode, the throttle
 * hold at a spawn, the swap and hangar buttons, and the menus. */
SCENARIOS['standard gamepad'] = () => session({}, (s) => {
  const gp = makePad({ id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', axes: [0, 0, 0, 0], buttons: 17, mapping: 'standard' });
  env.pads = [gp];
  const im = s.make();
  s.run(48, 16, 'rest', menuReaders);
  for (const mode of [1, 3, 4, 2]) {
    im.setStickMode(mode);
    setAxes(gp, [0.3, -0.6, 0.45, 0.9]);
    s.run(32, 16, `Mode ${mode} sticks`, menuReaders);
    setAxes(gp, [0, 0, 0, 0]);
    s.run(32, 16, `Mode ${mode} rest`, menuReaders);
  }
  im.holdThrottleLow(0.05);
  s.run(48, 16, 'held at the spawn', menuReaders);
  setAxes(gp, [undefined, -0.5]);
  s.run(48, 16, 'throttle up, still held', menuReaders);
  setAxes(gp, [undefined, 1]);
  s.run(48, 16, 'throttle to the bottom', menuReaders);
  setAxes(gp, [undefined, -0.5]);
  s.run(48, 16, 'released, throttle up', menuReaders);
  im.holdThrottleLow(0.05);
  s.key('KeyW');
  s.run(64, 16, 'held, and W pressed', menuReaders);
  s.key('KeyW', false);
  im.releaseThrottleHold();
  s.run(48, 16, 'released by the shell', menuReaders);
  im.holdThrottleLow(0.05);
  env.pads = [];
  s.run(32, 16, 'pad gone while held', menuReaders);
  env.pads = [gp];
  setAxes(gp, [0, 0, 0, 0]);
  s.run(32, 16, 'pad back', menuReaders);
  for (const b of [0, 1, 2, 3, 4, 5, 9]) {
    press(gp, b, true);
    s.run(32, 16, `button ${b} down`, menuReaders);
    press(gp, b, false);
    s.run(32, 16, `button ${b} up`, menuReaders);
  }
  setAxes(gp, [0.1, 0.7, -0.19, 0.21]);
  s.run(32, 16, 'left stick down, look stick', menuReaders);
  setAxes(gp, [0, -0.7, 0.9, -0.9]);
  s.run(32, 16, 'left stick up, look stick', menuReaders);
  setAxes(gp, [0, 0, 0, 0]);
  im.setPadChoice({ kind: 'none' });
  s.run(32, 16, 'pad declined', menuReaders);
  im.setPadChoice({ kind: 'auto' });
  s.run(32, 16, 'pad on auto', menuReaders);
});

SCENARIOS['ExpressLRS joystick over Bluetooth'] = () => session({}, (s) => {
  const gp = makePad({ id: 'ExpressLRS Joystick', axes: [0, 0, 0, -1, 0, 0, 0, 0] });
  env.pads = [gp];
  const im = s.make();
  s.run(32, 16, 'rest');
  setAxes(gp, [0.4, 0.3, 1, -0.5, -0.7]);
  s.run(48, 16, 'sticks');
  const short = makePad({ id: 'ExpressLRS Joystick', axes: [0, 0, -1, 0] });
  env.pads = [short];
  im.setPadChoice({ kind: 'auto' });
  s.run(32, 16, 'four axes only');
});

/* A radio that reports every switch as an axis and no buttons: the hold
 * to select, and the menu switch once one is stored. */
SCENARIOS['radio with no buttons'] = () => session({}, (s) => {
  const gp = makePad({ id: 'Switches as axes', axes: [0, 0, -1, 0, -1, -1] });
  env.pads = [gp];
  const im = s.make();
  s.run(48, 16, 'rest', menuReaders);
  setAxes(gp, [0.9]);
  s.run(1000, 16, 'held right', menuReaders);
  setAxes(gp, [0]);
  s.run(64, 16, 'let go', menuReaders);
  setAxes(gp, [undefined, -0.8]);
  s.run(300, 100, 'pushed in big frames', menuReaders);
  s.run(600, 16, 'pushed', menuReaders);
  setAxes(gp, [undefined, 0]);
  s.run(32, 16, 'back', menuReaders);
  im.map.select = { axis: 5, center: 0, pos: 1, neg: -1 };
  for (const v of [-1, 0.2, 0.6, 1, -1]) {
    setAxes(gp, [undefined, undefined, undefined, undefined, undefined, v]);
    s.run(32, 16, `menu switch at ${v}`, menuReaders);
  }
});

/* The wizard, start to finish, on several radios. `lay` is where each
 * channel lives and how the pilot moves it. */
function wizard(s, gp, lay, opts = {}) {
  const im = s.im;
  const n = gp.axes.length;
  const rest = gp.axes.slice();
  const put = (vals) => setAxes(gp, vals);
  const at = (i, v) => {
    const arr = new Array(n).fill(undefined);
    arr[i] = v;
    put(arr);
  };
  const frames = (ms, label) => s.run(ms, 16, label);
  im.startCalibration();
  frames(80, 'centre, settling');
  at(lay.roll, rest[lay.roll] + 0.03);
  frames(300, 'centre, a twitch inside the noise');
  at(lay.roll, rest[lay.roll] + 0.3);
  frames(64, 'centre, a real move restarts it');
  at(lay.roll, rest[lay.roll]);
  frames(1100, 'centre held');
  /* Full range: every gimbal axis to both ends, then back. */
  for (const ch of ['roll', 'pitch', 'yaw', 'throttle']) {
    const i = lay[ch];
    for (const v of [1, -1]) {
      at(i, v);
      frames(48, `sweep ${ch} ${v}`);
    }
    at(i, ch === 'throttle' ? (opts.thrParkAfterSweep ?? rest[i]) : rest[i]);
    frames(32, `sweep ${ch} back`);
  }
  frames(1100, 'sweep, at rest');
  const ident = (ch, v, back) => {
    at(lay[ch], v);
    frames(500, `${ch} held`);
    at(lay[ch], back);
    frames(400, `${ch} released`);
  };
  ident('throttle', lay.thrPush ?? 1, lay.thrReturn ?? rest[lay.throttle]);
  ident('roll', lay.rollSign ?? 1, rest[lay.roll]);
  ident('pitch', lay.pitchSign ?? 1, rest[lay.pitch]);
  ident('yaw', lay.yawSign ?? 1, rest[lay.yaw]);
}

const CAL_PROBES = (im) => ({ calibration: im.calibration ? { step: im.calibration.step, phase: im.calibration.phase } : null });

SCENARIOS['calibration: radio with yaw on axis 4, parked throttle'] = () => session({}, (s) => {
  const gp = makePad({ id: 'Wizard radio', axes: [0, 0, -1, 0.5, 0, 0], buttons: 4 });
  env.pads = [gp];
  s.make();
  wizard(s, gp, { roll: 0, pitch: 1, throttle: 2, yaw: 4, pitchSign: -1, thrReturn: -1 });
  s.run(64, 16, 'on the check step', CAL_PROBES);
  setAxes(gp, [0.8]);
  s.run(48, 16, 'check: roll moving', CAL_PROBES);
  check('reverseMovingChannel names roll on the check step', s.im.reverseMovingChannel() === 'roll');
  s.run(32, 16, 'roll reversed', CAL_PROBES);
  check('reverseChannel refuses a made-up channel', s.im.reverseChannel('aux') === false);
  s.im.reverseChannel('roll');
  setAxes(gp, [0, 0, 0.2]);
  s.run(32, 16, 'throttle up a little', CAL_PROBES);
  check('zeroThrottleHere refuses with the stick near the top', (() => {
    setAxes(gp, [undefined, undefined, 0.9]);
    return s.im.zeroThrottleHere() === false;
  })());
  setAxes(gp, [undefined, undefined, -1]);
  check('the wizard saves', s.im.acceptCalibration() === true);
  s.run(64, 16, 'saved', CAL_PROBES);
  setAxes(gp, [0.5, -0.5, 0, 0.5, -0.25]);
  s.run(64, 16, 'flying the new map');
  check('accept with no wizard open refuses', s.im.acceptCalibration() === false);
});

SCENARIOS['calibration: gamepad with a sprung throttle, reverse and zero'] = () => session({}, (s) => {
  const gp = makePad({ id: 'Pad without standard mapping', axes: [0, 0, 0, 0], buttons: 12 });
  env.pads = [gp];
  s.make();
  wizard(s, gp, { roll: 2, pitch: 3, throttle: 1, yaw: 0, thrPush: -1, thrReturn: 0, rollSign: -1 });
  s.run(32, 16, 'check', CAL_PROBES);
  setAxes(gp, [undefined, -0.6]);
  s.run(32, 16, 'throttle up on the check step', CAL_PROBES);
  check('zeroThrottleHere moves zero to the stick', s.im.zeroThrottleHere() === true);
  s.run(32, 16, 'zero moved', CAL_PROBES);
  setAxes(gp, [undefined, 0]);
  setAxes(gp, [0.7, undefined, 0.5, 0.5]);
  s.run(32, 16, 'two sticks: nothing named', CAL_PROBES);
  s.snap('reverse on a diagonal', (im) => ({ reversed: im.reverseMovingChannel() }));
  setAxes(gp, [0, 0, 0, 0]);
  env.quota = true;
  check('accept with storage full still accepts', s.im.acceptCalibration() === true);
  s.run(32, 16, 'saved but not stored');
  env.quota = false;
  check('the check on its own opens', s.im.startCalibrationCheck() === true);
  s.run(32, 16, 'check only', CAL_PROBES);
  s.im.reverseChannel('throttle');
  s.im.reverseChannel('yaw');
  setAxes(gp, [0.9]);
  s.run(32, 16, 'check only, reversed', CAL_PROBES);
  s.im.acceptCalibration();
  setAxes(gp, [0.9, -0.3, 0.2, -0.2]);
  s.run(32, 16, 'flying reversed');
  s.im.startCalibrationCheck();
  s.im.cancelCalibration();
  s.run(32, 16, 'check cancelled');
});

SCENARIOS['calibration: no buttons, a spare axis, the menu switch'] = () => session({}, (s) => {
  const gp = makePad({ id: 'Buttonless radio', axes: [0, 0, -1, 0, -1, -1] });
  env.pads = [gp];
  s.make();
  wizard(s, gp, { roll: 0, pitch: 1, throttle: 2, yaw: 3, thrReturn: -1 });
  s.run(64, 16, 'menu switch step', CAL_PROBES);
  setAxes(gp, [undefined, undefined, undefined, undefined, undefined, 1]);
  s.run(600, 16, 'switch thrown', CAL_PROBES);
  setAxes(gp, [undefined, undefined, undefined, undefined, undefined, -1]);
  s.run(400, 16, 'switch back', CAL_PROBES);
  s.im.acceptCalibration();
  s.run(32, 16, 'saved with a switch', (im) => ({ ...menuReaders(im), ...CAL_PROBES(im) }));
  setAxes(gp, [undefined, undefined, undefined, undefined, undefined, 1]);
  s.run(32, 16, 'switch selects', menuReaders);
});

SCENARIOS['calibration: skipping the menu switch, cancelling, no radio'] = () => session({}, (s) => {
  const gp = makePad({ id: 'Buttonless radio', axes: [0, 0, -1, 0, -1] });
  env.pads = [gp];
  const im = s.make();
  check('skip refuses before its step', im.skipCalibrationSelect() === false);
  wizard(s, gp, { roll: 0, pitch: 1, throttle: 2, yaw: 3, thrReturn: -1 });
  check('skip passes the menu switch step', im.skipCalibrationSelect() === true);
  s.run(32, 16, 'skipped', CAL_PROBES);
  im.acceptCalibration();
  s.run(32, 16, 'saved without a switch', menuReaders);
  im.startCalibration();
  s.run(200, 16, 'second run', CAL_PROBES);
  env.pads = [];
  s.run(64, 16, 'radio unplugged mid wizard', CAL_PROBES);
  env.pads = [gp];
  s.run(64, 16, 'radio back', CAL_PROBES);
  im.cancelCalibration();
  s.run(32, 16, 'cancelled', CAL_PROBES);
  env.pads = [];
  check('the check alone needs a radio', im.startCalibrationCheck() === false);
  im.startCalibration();
  s.run(64, 16, 'wizard with no radio at all', CAL_PROBES);
  check('zero refuses off the check step', im.zeroThrottleHere() === false);
  im.cancelCalibration();
});

SCENARIOS['calibration: a sprung throttle held down, a diagonal, a lopsided gimbal'] = () => session({}, (s) => {
  const gp = makePad({ id: 'LiteRadio', axes: [0.05, -0.02, 0, 0.01], buttons: 2 });
  env.pads = [gp];
  const im = s.make();
  im.startCalibration();
  s.run(1100, 16, 'centre');
  for (const [i, lo, hi] of [[0, -0.8, 0.95], [1, -1, 1], [2, -1, 1], [3, -0.7, 0.7]]) {
    setAxes(gp, i === 0 ? [lo] : i === 1 ? [undefined, lo] : i === 2 ? [undefined, undefined, lo] : [undefined, undefined, undefined, lo]);
    s.run(32, 16, `sweep ${i} low`);
    setAxes(gp, i === 0 ? [hi] : i === 1 ? [undefined, hi] : i === 2 ? [undefined, undefined, hi] : [undefined, undefined, undefined, hi]);
    s.run(32, 16, `sweep ${i} high`);
  }
  setAxes(gp, [0.05, -0.02, 0, 0.01]);
  s.run(600, 16, 'sweep: back at rest');
  setAxes(gp, [undefined, undefined, 1]);
  s.run(500, 16, 'throttle up');
  setAxes(gp, [undefined, undefined, -1]);
  s.run(500, 16, 'throttle held at the bottom');
  setAxes(gp, [0.7, 0.6]);
  s.run(500, 16, 'a diagonal on the roll step');
  setAxes(gp, [0.9, -0.02]);
  s.run(500, 16, 'roll alone');
  setAxes(gp, [0.05]);
  s.run(400, 16, 'roll back, throttle still down');
  setAxes(gp, [undefined, undefined, 0]);
  s.run(200, 16, 'throttle let go');
  im.cancelCalibration();
});

SCENARIOS['calibration: the throttle parks somewhere new after the sweep'] = () => session({}, (s) => {
  const gp = makePad({ id: 'Radio, throttle mid at the centre step', axes: [0, 0, 0.1, 0], buttons: 4 });
  env.pads = [gp];
  const im = s.make();
  im.startCalibration();
  s.run(1100, 16, 'centre with the throttle at mid');
  for (const i of [0, 1, 2, 3]) {
    for (const v of [1, -1]) {
      const arr = [undefined, undefined, undefined, undefined];
      arr[i] = v;
      setAxes(gp, arr);
      s.run(32, 16, `sweep ${i} ${v}`);
    }
    const back = [undefined, undefined, undefined, undefined];
    back[i] = i === 2 ? -0.95 : 0;
    setAxes(gp, back);
  }
  s.run(300, 16, 'throttle left low, not settled yet');
  setAxes(gp, [undefined, undefined, -0.98]);
  s.run(300, 16, 'it creeps inside the noise');
  setAxes(gp, [undefined, undefined, -0.7]);
  s.run(200, 16, 'it moves');
  setAxes(gp, [undefined, undefined, -0.98]);
  s.run(1100, 16, 'parked');
  setAxes(gp, [0.4, 0.4]);
  s.run(300, 16, 'two axes away');
  im.cancelCalibration();
});

/* The joystick picker: two radios at boot, a wiggle, the buttons, a
 * rejection and its cooldown, a skip, a hotplug and a radio going
 * missing, and the choice landing in storage. */
SCENARIOS['joystick picker'] = () => session({}, (s) => {
  const a = makePad({ id: 'Radio A (Vendor: 1)', index: 0, axes: [0, 0, -1, 0], buttons: 4 });
  const b = makePad({ id: 'Radio B with a rather long product name that goes on and on', index: 1, axes: [0, 0, -1, 0, 0], buttons: 4 });
  env.pads = [a, b];
  const im = s.make();
  s.snap('boot', (x) => ({ queued: x.takePadPickQueue(), again: x.takePadPickQueue() }));
  check('the picker starts', im.startPadPick('boot') === true);
  s.run(64, 16, 'picker open');
  setAxes(b, [0.9]);
  s.run(300, 16, 'B wiggles');
  s.run(500, 16, 'B held');
  press(b, 1, true);
  s.run(32, 16, 'No');
  press(b, 1, false);
  s.run(400, 16, 'cooling down, B still moved');
  setAxes(b, [0]);
  s.run(400, 16, 'B back');
  setAxes(a, [undefined, -0.9]);
  press(a, 0, true);
  s.run(600, 16, 'A wiggles with a button already down');
  press(a, 0, false);
  s.run(32, 16, 'A button released');
  s.snap('accept while A wiggles', (x) => ({ accepted: x.acceptPadPick() }));
  setAxes(a, [undefined, 0]);
  s.run(32, 16, 'accepted');
  check('accept with no picker refuses', im.acceptPadPick() === false);
  im.requestPadPick('menu');
  im.requestPadPick('other');
  s.snap('requested', (x) => ({ queued: x.takePadPickQueue() }));
  im.startPadPick();
  im.requestPadPick('ignored while open');
  setAxes(b, [0.9]);
  s.run(800, 16, 'menu picker, B');
  press(b, 2, true);
  s.run(32, 16, 'B picked by button, before arming');
  press(b, 2, false);
  s.run(32, 16, 'armed');
  press(b, 3, true);
  s.run(32, 16, 'B picked by button');
  press(b, 3, false);
  setAxes(b, [0]);
  im.startPadPick('menu');
  s.run(32, 16, 'picker again');
  im.cancelPadPick();
  s.run(32, 16, 'cancelled');
  im.startPadPick('hotplug');
  im.skipPadPick();
  s.run(32, 16, 'skipped to the keyboard');
  im.setPadChoice({ kind: 'pad', id: a.id, index: 0 });
  s.run(32, 16, 'A chosen');
  env.pads = [b];
  s.run(32, 16, 'A unplugged', (x) => ({ queued: x.takePadPickQueue() }));
  const a2 = makePad({ id: a.id, index: 3, axes: [0, 0, -1, 0], buttons: 4 });
  env.pads = [b, a2];
  s.run(32, 16, 'A back on another index', (x) => ({ queued: x.takePadPickQueue() }));
  const c = makePad({ id: 'Radio C', index: 2, axes: [0, 0, -1, 0] });
  env.pads = [b, a2, c];
  s.run(32, 16, 'C hotplugged', (x) => ({ queued: x.takePadPickQueue() }));
  im.startPadPick('hotplug');
  setAxes(c, [undefined, undefined, 0.5]);
  s.run(600, 16, 'C wiggles');
  env.pads = [b, a2];
  s.run(64, 16, 'C pulled during confirm');
  env.pads = [];
  check('no picker with nothing plugged in', im.startPadPick() === false);
  s.run(32, 16, 'nothing plugged in');
  im.cancelPadPick();
  env.pads = [makePad({ id: 'tiny', axes: [0, 0, 0] }), makePad({ id: 'ok', index: 1, axes: [0, 0, 0, 0] })];
  s.run(32, 16, 'a three axis device is not a joystick');
});

SCENARIOS['one radio at boot, stored choices, stored maps'] = () => {
  const rows = [];
  const runs = [
    ['no storage, one radio', {}],
    ['a stored pad choice that is plugged in', { 'webfpv.pad.v1': JSON.stringify({ kind: 'pad', id: 'Solo', index: 0 }) }],
    ['a stored pad choice that is not', { 'webfpv.pad.v1': JSON.stringify({ kind: 'pad', id: 'Elsewhere', index: 2 }) }],
    ['a stored keyboard choice', { 'webfpv.pad.v1': JSON.stringify({ kind: 'none' }) }],
    ['a garbage pad choice', { 'webfpv.pad.v1': '{nope' }],
    ['a pad choice of the wrong shape', { 'webfpv.pad.v1': JSON.stringify({ kind: 'pad', id: 7, index: '0' }) }],
    ['a legacy map with full', {
      webfpv_stick_map_v1: JSON.stringify({
        roll: { axis: 0, center: 0, full: -1 }, pitch: { axis: 1, center: 0.1, full: 0.8 },
        yaw: { axis: 3, center: 0, full: 1 }, throttle: { axis: 2, low: 1, high: -1 },
      }),
    }],
    ['a partial map', { webfpv_stick_map_v1: JSON.stringify({ yaw: { axis: 2, center: 0, pos: -1, neg: 1 } }) }],
    ['a map with reverse and select', {
      webfpv_stick_map_v1: JSON.stringify({
        roll: { axis: 0, center: 0, pos: 1, neg: -1 }, pitch: { axis: 1, center: 0, pos: -1, neg: 1 },
        yaw: { axis: 3, center: 0, pos: 1, neg: -1 }, throttle: { axis: 2, low: -1, high: 1, sprung: true },
        select: { axis: 4, center: -1, pos: 1, neg: -1 }, reverse: { roll: true, yaw: 1, aux: true },
        stored: false,
      }),
    }],
    ['a garbage map', { webfpv_stick_map_v1: 'not json' }],
    ['a null map', { webfpv_stick_map_v1: 'null' }],
  ];
  for (const [label, seed] of runs) {
    rows.push(...session(seed, (s) => {
      env.pads = [makePad({ id: 'Solo', axes: [0.2, -0.4, 0.5, 0.3, 0.7] })];
      const im = s.make();
      s.run(48, 16, label);
      im.saveMap();
      s.snap(`${label}, saved`);
    }));
  }
  return rows;
};

SCENARIOS['polling, heartbeat, the queue bound'] = () => session({}, (s) => {
  const im = s.make();
  im.startPolling(2);
  im.startPolling(5);
  s.snap('polling', () => ({ intervals: env.intervals.map((i) => [i.ms, i.live]) }));
  const timer = env.intervals[0];
  for (let k = 0; k < 10; k += 1) {
    env.now += 2;
    timer.fn();
  }
  s.snap('ten timer polls');
  im.stopPolling();
  im.stopPolling();
  s.snap('stopped', () => ({ intervals: env.intervals.map((i) => [i.ms, i.live]) }));
  s.key('ArrowRight');
  for (let k = 0; k < 2600; k += 1) {
    s.tick(k % 2 ? 1 : 3);
  }
  s.snap('long run without a drain', () => ({ queued: im.queue.length }));
  s.key('ArrowRight', false);
  s.run(500, 50, 'heartbeat');
});

/* ------------------------------------------------------------------ the run */

const got = {};
for (const [name, run] of Object.entries(SCENARIOS)) {
  const rows = run();
  const text = rows.map((r) => JSON.stringify(r));
  got[name] = {
    rows: rows.length,
    hash: createHash('sha256').update(text.join('\n')).digest('hex'),
  };
  if (DUMP) {
    mkdirSync(DUMP, { recursive: true });
    writeFileSync(join(DUMP, `${name.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 80)}.txt`), `${text.join('\n')}\n`);
  }
}

console.log('\ngolden');
if (WRITE) {
  writeFileSync(GOLDEN, `${JSON.stringify(got, null, 1)}\n`);
  console.log(`wrote ${Object.keys(got).length} scenarios to ${GOLDEN}`);
}
const want = JSON.parse(readFileSync(GOLDEN, 'utf8'));
check('the same scenarios as the golden', JSON.stringify(Object.keys(want)) === JSON.stringify(Object.keys(got)),
  Object.keys(got).filter((k) => !(k in want)).join(', '));
for (const [name, w] of Object.entries(want)) {
  const g = got[name];
  check(`${name}: ${w.rows} steps`, Boolean(g) && g.hash === w.hash && g.rows === w.rows,
    g ? `got ${g.rows} steps, hash ${g.hash.slice(0, 12)} against ${w.hash.slice(0, 12)}` : 'missing');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
