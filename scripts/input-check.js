/*
 * input-check.js: the stick input's stories as the pilot meets them, in
 * the real page in headless Chromium.
 *
 * input-selftest.js tells the input layer's half of each ticket in plain
 * Node. This is the other half, the part that only exists in the DOM and
 * in main.js's frame loop: the buttons a step shows, the rows that must
 * repaint mid session, a menu that must not move under a still mouse, the
 * captions that follow the stick mode, the pointer capture for mouse
 * flight, and a standard gamepad flying a real quad, held at zero throttle
 * until its stick has been down.
 *
 * Three pages. The first boots with a synthetic six-axis radio installed
 * over navigator.getGamepads before the shell starts, yaw on axis 4 and a
 * still slider on axis 3: the radio AETR gets wrong, because one it gets
 * right exercises none of this. The second boots as a touch device. The
 * third boots with an Xbox pad reporting the standard layout.
 *
 * Not part of npm run verify; it says nothing about the flight model. Run
 * it on a change to src/input, the calibrate screen, the Settings room or
 * the title's trouble rows.
 *
 *   npm run lint:input
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

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

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
  failures.push(`${name}${detail ? `, ${detail}` : ''}`);
  console.log(`  FAIL  ${name}${detail ? `, ${detail}` : ''}`);
}
const heading = (t) => console.log(`\n${t}`);
const show = (v) => JSON.stringify(v);

/* ----------------------------------------------------------- the pages */

/* Low graphics, pinned, so every machine boots the same page and the run
 * is about the shell rather than the GPU. */
const GRAPHICS_LOW = `try {
  const k = ${show(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  s.graphics = 'low';
  s.graphicsAuto = false;
  localStorage.setItem(k, JSON.stringify(s));
} catch (e) { /* storage refused; the page still boots */ }`;

/* Installed before the app's first line, so the shell meets the device the
 * way it meets a real one: through navigator.getGamepads on a poll. */
const padSeed = (pad) => `window.__pad = ${pad};
navigator.getGamepads = () => [window.__pad];`;

/* Six axes, four buttons, throttle parked on 2, yaw on 4, and on 3 the
 * slider AETR calls yaw, which never moves. */
const SIX_AXIS_RADIO = padSeed(`{
  index: 0,
  id: 'Selftest six axis radio (Vendor: 1209 Product: 4f54)',
  connected: true,
  mapping: '',
  timestamp: 1,
  axes: [0, 0, -1, 0, 0, -1],
  buttons: [0, 1, 2, 3].map(() => ({ pressed: false, touched: false, value: 0 })),
}`);

/* What the browser reports for an Xbox pad: the W3C layout, every stick at
 * rest, which on the Mode 2 default is half throttle. */
const XBOX = padSeed(`{
  index: 0,
  id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
  connected: true,
  mapping: 'standard',
  timestamp: 1,
  axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
}`);

/* Every walk starts past the gate: the menus these checks are about sit
 * behind it. */
const PAST_GATE = "ui.firstRun = false; ui.craftGate = false; if (!ui.mode) { ui.mode = 'race'; }";

async function boot(extra = {}, pad = SIX_AXIS_RADIO) {
  const page = await openPage({
    root, width: 1600, height: 900, seed: [GRAPHICS_LOW, pad], ...extra,
  });
  await page.until('window.__shellReady === true', 90000);
  await page.until('!!window.__ui && !!window.__input', 10000);
  return page;
}

/* `ui` and `input` in scope for a snippet run in the page. */
const inPage = (page) => (body) => page.evaluate(`(() => { const ui = window.__ui; const input = window.__input; ${body} })()`);
const json = (p) => p.then(JSON.parse);
/* Waits for a page expression and answers whether it came true. */
const came = (page, expr, ms) => page.until(expr, ms).then(() => true, () => false);
const setAxis = (page, i, v) => page.evaluate(`window.__pad.axes[${i}] = ${v}; window.__pad.timestamp += 1; true`);

/*
 * The calibration wizard, driven inside the page on the page's own clock
 * (the pad is polled on a 2 ms timer there, so every hold below is real
 * time with room to spare). `lay` names each channel's axis, where the
 * throttle goes at its release, and, with holdAfter, where it is held from
 * then to the check step. Returns a log ending in 'done' when every step
 * arrived.
 */
const WIZARD = (lay) => `(async () => {
  const lay = ${show(lay)};
  const pad = window.__pad;
  const im = window.__input;
  const log = [];
  const nap = (ms) => new Promise((r) => setTimeout(r, ms));
  const put = (i, v) => { pad.axes[i] = v; pad.timestamp += 1; };
  const view = () => im.calibrationView();
  const wait = async (ok, limit = 8000) => {
    const t0 = performance.now();
    while (performance.now() - t0 < limit) {
      const v = view();
      if (v && ok(v)) { return true; }
      await nap(20);
    }
    return false;
  };
  const onStep = (name) => wait((v) => v.step === name && v.phase === 'hold');
  if (!await onStep('sweep')) { log.push('centre never settled'); return log; }
  const rest = pad.axes.slice();
  log.push('rest ' + JSON.stringify(rest));
  for (const i of [lay.roll, lay.pitch, lay.yaw, lay.thr]) {
    put(i, 1); await nap(60);
    put(i, -1); await nap(60);
    put(i, rest[i]); await nap(60);
  }
  if (!await onStep('throttle')) { log.push('sweep never completed: ' + JSON.stringify(view())); return log; }
  const asks = [
    ['throttle', lay.thr, 1, lay.thrReturn],
    ['roll', lay.roll, 1, rest[lay.roll]],
    ['pitch', lay.pitch, -1, rest[lay.pitch]],
    ['yaw', lay.yaw, 1, rest[lay.yaw]],
  ];
  for (const [name, axis, push, back] of asks) {
    if (view().step !== name) { log.push('expected ' + name + ', on ' + view().step); return log; }
    put(axis, push);
    if (!await wait((v) => v.phase === 'release')) { log.push(name + ' never identified'); return log; }
    put(axis, back);
    const steps = view().steps;
    const next = steps[steps.indexOf(name) + 1];
    if (!await onStep(next)) { log.push(name + ' never released to ' + next); return log; }
    /* The hand comes off: a sprung throttle held down as told springs back
     * here, one step too late to be seen, unless the pilot keeps holding. */
    put(axis, name === 'throttle' && lay.holdAfter !== undefined ? lay.holdAfter : rest[axis]);
    log.push(name + ' on axis ' + axis);
  }
  log.push('done');
  return log;
})()`;

/* ------------------------------------------------- the six-axis radio */

/* Every sign that names the calibrate room names the room that holds it,
 * asserted as agreement between rooms rather than as strings. ("there is
 * no menu item to calibrate my radio", and the rename after it.) */
async function signposts(page, ev) {
  heading('signposts: every sign that names the calibrate room names the room that holds it');
  const s = await json(ev(`
    ${PAST_GATE}
    const holders = [];
    for (const name of Object.keys(ui.screens)) {
      if (['title', 'flight', 'calibrate', 'padpick'].includes(name)) { continue; }
      try {
        ui.show(name);
        if (ui.items().some((it) => it && it.action === 'calibrate')) { holders.push(name); }
      } catch (e) { /* a screen with no item list */ }
    }
    const room = holders[0];
    ui.show(room);
    const here = ui.crumb.querySelector('.crumb-here');
    const h2 = ui.screens[room].querySelector('h2');
    const out = { holders, roomName: here ? here.textContent : '', roomHeading: h2 ? h2.textContent : '' };
    ui.show('title');
    const row = ui.items().find((it) => it && it.action === room);
    out.titleRow = row ? { label: row.label, note: row.note || '' } : null;
    ui.show('rates');
    out.ratesTrail = Array.from(ui.crumb.querySelectorAll('.crumb-up, .crumb-here')).map((n) => n.textContent);
    ui.show('howto');
    ui.setHowtoSource('radio');
    out.howtoRadio = Array.from(ui.howtoKeys.querySelectorAll('dd')).map((n) => n.textContent).join(' ');
    ui.setHowtoSource('keyboard');
    ui.show('title');
    return JSON.stringify(out);
  `));
  check('exactly one room holds the Calibrate sticks row', s.holders.length === 1, show(s.holders));
  check('that room is named in its crumb', Boolean(s.roomName), show(s));
  check('the title has a row that opens it, named the same', Boolean(s.titleRow) && s.titleRow.label === s.roomName, show(s.titleRow));
  check('and that row\'s note says calibration is inside', /Calibrate sticks/.test(s.titleRow ? s.titleRow.note : ''),
    s.titleRow ? s.titleRow.note : 'no row');
  check('the Rates room\'s trail starts in it', s.ratesTrail[0] === s.roomName, show(s.ratesTrail));
  check('the how-to for a radio sends the pilot there by the same name',
    s.howtoRadio.includes(`Calibrate sticks in ${s.roomName}`), s.howtoRadio.slice(0, 200));
  check('the room is called Settings, which is what the pilot asked for', s.roomName === 'Settings', s.roomName);
}

/*
 * "the menu jumps when I move the mouse over it". The help note changed
 * height with every row the pointer crossed, the list moved under the
 * pointer, a new row landed under it, and so on. It must move 0 px. Only
 * at the reporter's 1358 by 602 window can this fail: in a tall window the
 * list outgrows every note and the defect hides (the same walk measured 0
 * at 1600 by 900 with the fix removed). Real DevTools mouse events,
 * because the bug was in what a pointer does.
 */
async function hover(page, ev) {
  heading('hover: rows stay put under the mouse while the help note changes, at 1358 by 602');
  const resize = (width, height) => page.cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: false,
  }, page.sessionId);
  const pointTo = (x, y) => page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, page.sessionId);
  await resize(1358, 602);
  await ev(`${PAST_GATE} ui.show('rates');`);
  await page.sleep(400);
  const win = await json(ev('return JSON.stringify({ w: window.innerWidth, h: window.innerHeight });'));
  check('the window is the reporter\'s', win.w === 1358 && win.h === 602, show(win));
  for (const screen of ['rates', 'pids']) {
    const rows = await json(ev(`
      ${PAST_GATE}
      ui.show('${screen}');
      ui.setCursor(ui.firstStop(ui.items()));
      const menu = ui.screens['${screen}'].querySelector('.menu');
      const box = menu.getBoundingClientRect();
      return JSON.stringify(Array.from(menu.querySelectorAll('.row')).map((r, k) => {
        const b = r.getBoundingClientRect();
        return { k, top: b.top, x: b.left + Math.min(80, b.width / 2), y: b.top + b.height / 2,
          inside: b.top >= box.top && b.bottom <= box.bottom };
      }));
    `));
    const firstTops = rows.map((r) => r.top);
    const visible = rows.filter((r) => r.inside);
    let landed = 0;
    let notes = 0;
    let lastNote = null;
    let worst = 0;
    for (const r of visible) {
      /* Two moves: the shell ignores a pointer that has not moved since it
       * last saw it, so a rebuilt row under a still mouse does nothing. */
      await pointTo(Math.round(r.x), Math.round(r.y) - 1);
      await page.sleep(20);
      await pointTo(Math.round(r.x), Math.round(r.y));
      const t0 = Date.now();
      let state = null;
      while (Date.now() - t0 < 1500) {
        state = await json(ev(`
          const rows = Array.from(ui.screens['${screen}'].querySelectorAll('.menu .row'));
          return JSON.stringify({ lit: rows.findIndex((n) => n.getAttribute('aria-selected') === 'true'),
            note: ui.screens['${screen}'].querySelector('.menu-help').textContent });
        `));
        if (state.lit === r.k) {
          break;
        }
        await page.sleep(50);
      }
      if (!state || state.lit !== r.k) {
        continue;
      }
      landed += 1;
      if (state.note !== lastNote) {
        notes += 1;
        lastNote = state.note;
      }
      const tops = await json(ev(`return JSON.stringify(Array.from(ui.screens['${screen}'].querySelectorAll('.menu .row')).map((n) => n.getBoundingClientRect().top));`));
      for (let k = 0; k < Math.min(tops.length, firstTops.length); k += 1) {
        worst = Math.max(worst, Math.abs(Math.round(tops[k] - firstTops[k])));
      }
    }
    /* Guards against a vacuous pass: the shift check means nothing unless
     * the pointer landed and the note changed. With the fix removed the
     * pointer lands on two of seventeen rates rows, because the rows leave
     * from under it. */
    check(`${screen}: the pointer landed on ${landed} of ${visible.length} visible rows, enough to mean something`,
      landed >= Math.min(3, visible.length), `${landed} of ${visible.length}`);
    check(`${screen}: the help note changed as the pointer moved, ${notes} distinct notes`, notes >= 2, `${notes} distinct notes`);
    check(`${screen}: worst row shift under the pointer is 0 px`, worst === 0, `${worst} px`);
  }
  /* Park the pointer off the menus and give the window back. */
  await pointTo(5, 5);
  await resize(1600, 900);
  await page.sleep(400);
}

/* The no-yaw trouble row is decided in input.js and must be painted by the
 * frame loop without leaving the title, and taken down the same way when
 * the guessed yaw finally moves. (bug-3d72d9a4, bug-94f7e52b,
 * bug-13519874.) Nothing here calls show() or renderMenu(). */
async function noYawRow(page, ev) {
  heading('title: the no-yaw row appears on its own, and goes away on its own');
  await ev(`${PAST_GATE} ui.show('title');`);
  await came(page, 'window.__input.padSummary().mapUsable === true', 5000);
  const start = await json(ev(`
    const s = input.padSummary();
    return JSON.stringify({ usable: s.mapUsable, calibrated: s.calibrated,
      warn: Array.from(ui.screens.title.querySelectorAll('.row-warn .row-label')).map((n) => n.textContent) });
  `));
  check('the throttle parked, so the guess counts as a radio and nothing warns', start.usable && !start.calibrated && start.warn.length === 0,
    show(start));
  const ROW = 'This browser cannot see your yaw stick';
  const rowUp = `Array.from(window.__ui.screens.title.querySelectorAll('.row-warn .row-label')).some((n) => n.textContent === ${show(ROW)})`;
  await page.evaluate(`(async () => {
    const pad = window.__pad;
    for (const v of [0.2, 0.45, 0.7, 0.95, 0.45, -0.3, -0.75, 0]) {
      pad.axes[4] = v; pad.timestamp += 1; await new Promise((r) => setTimeout(r, 40));
    }
  })()`);
  check('sweeping the real yaw stick, on an axis the guess does not name, paints the row without leaving the screen',
    await came(page, rowUp, 5000));
  check('and input.js agrees', await ev('return input.padSummary().guessNoYaw === true;'));
  await page.evaluate(`(async () => {
    const pad = window.__pad;
    pad.axes[3] = 0.5; pad.timestamp += 1; await new Promise((r) => setTimeout(r, 60));
    pad.axes[3] = 0; pad.timestamp += 1; await new Promise((r) => setTimeout(r, 60));
  })()`);
  check('moving the axis the guess calls yaw takes the row down again, without leaving the screen', await came(page, `!(${rowUp})`, 5000));
  check('and it stays down', await ev('return input.padSummary().guessNoYaw === false && input.padSummary().mapUsable === true;'));
}

const onCalStep = (step) => `(() => { const v = window.__input.calibrationView(); return v && v.step === '${step}'; })()`;

/* "at step 7 of calibration i can't continue, i don't have any button on
 * my radio" (bug-89b2c85c), and the axis strip (bug-27386f07). The menu
 * switch step is only asked of a radio with no buttons, so the pad loses
 * its buttons for this run. Skip and Enter must both get past it. */
async function wizardNoButtons(page, ev) {
  heading('calibrate: the axis strip, the Skip on the menu switch step, and Enter through to Save');
  await page.evaluate('window.__pad.buttons = []; window.__pad.timestamp += 1;');
  await ev(`${PAST_GATE} ui.show('pilot'); ui.act('calibrate');`);
  await page.until("window.__ui.screen === 'calibrate' && !!window.__input.calibration", 5000);
  /* A focused text field would own the keys sent below. */
  check('no text field has focus, so the keys reach the shell',
    await ev("const a = document.activeElement; return !a || !['INPUT', 'TEXTAREA'].includes(a.tagName);"));
  await came(page, "window.__ui.calAxes && window.__ui.calAxes.querySelectorAll('.cal-axis').length > 0", 5000);
  const strip = await json(ev('return JSON.stringify({ cells: ui.calAxes.querySelectorAll(\'.cal-axis\').length, kicker: ui.calKicker.textContent, hiddenStrip: ui.calAxes.hidden });'));
  check('the strip shows one cell per axis, six, on the first step', strip.cells === 6 && !strip.hiddenStrip, show(strip));
  check('and the wizard says it has eight steps', /of 8,/.test(strip.kicker), strip.kicker);
  const log = await page.evaluate(WIZARD({ roll: 0, pitch: 1, yaw: 4, thr: 2, thrReturn: -1 }));
  check('every flight channel identified and released', log[log.length - 1] === 'done', log.join(' | '));
  await came(page, onCalStep('select'), 3000);
  await came(page, '!window.__ui.calSkipBtn.hidden', 3000);
  const sel = await json(ev(`
    const v = input.calibrationView();
    return JSON.stringify({ step: v && v.step, skipHidden: ui.calSkipBtn.hidden, saveDisabled: ui.calSaveBtn.disabled,
      mapped: v ? v.axes.filter((a) => a.mapped).map((a) => a.i) : [] });
  `));
  check('it is on the menu switch step', sel.step === 'select', show(sel));
  check('the Skip button is showing and Save is not yet offered', sel.skipHidden === false && sel.saveDisabled === true, show(sel));
  check('the strip marks the four claimed axes, yaw among them on axis 4', sel.mapped.join() === '0,1,2,4', show(sel.mapped));
  await page.tap('Enter');
  check('Enter on that step skips it', await came(page, onCalStep('confirm'), 3000));
  await came(page, '!window.__ui.calSaveBtn.disabled', 3000);
  const conf = await json(ev('return JSON.stringify({ saveDisabled: ui.calSaveBtn.disabled, skipHidden: ui.calSkipBtn.hidden, zeroHidden: ui.calZeroBtn.hidden });'));
  check('the check step offers Save, and neither Skip nor the throttle zero button',
    conf.saveDisabled === false && conf.skipHidden && conf.zeroHidden, show(conf));
  await page.tap('Enter');
  check('Enter on the check step saves and returns to the room it came from',
    await came(page, "window.__ui.screen === 'pilot' && window.__input.calibration === null", 3000));
  const map = await json(ev('return JSON.stringify({ yaw: input.map.yaw.axis, stored: input.map.stored, select: input.map.select, thr: input.map.throttle });'));
  check('the saved map has yaw on axis 4, no menu switch, and a parked throttle',
    map.yaw === 4 && map.stored === true && map.select === null && map.thr.low === -1 && !map.thr.sprung, show(map));
  /* Buttons back for the rest of the run. */
  await page.evaluate('window.__pad.buttons = [0, 1, 2, 3].map(() => ({ pressed: false, touched: false, value: 0 })); window.__pad.timestamp += 1;');
  await ev("ui.show('title');");
  /* The trouble row comes down on the next frame, not on show(). */
  await came(page, "window.__ui.screens.title.querySelectorAll('.row-warn').length === 0", 4000);
  const rows = await json(ev("return JSON.stringify(Array.from(ui.screens.title.querySelectorAll('.row-warn .row-label')).map((n) => n.textContent));"));
  check('a calibrated radio has no trouble row', rows.length === 0, show(rows));
}

/* A sprung throttle whose pilot did as told (bug-851a43b7): the check step
 * reads 50 percent hands off, says so, shows the button, and T moves zero.
 * The input layer cannot see this case, so the screen is the fix. Rest is
 * measured at the centre step, so the throttle rests at the middle first;
 * the pilot then holds it down from the release prompt to the check step,
 * which used to strand the wizard at roll. */
async function throttleZero(page, ev) {
  heading('calibrate: the check step offers to move throttle zero, and T takes it');
  await setAxis(page, 2, 0);
  await ev("ui.show('pilot'); ui.act('calibrate');");
  await page.until("window.__ui.screen === 'calibrate' && !!window.__input.calibration", 5000);
  const log = await page.evaluate(WIZARD({ roll: 0, pitch: 1, yaw: 4, thr: 2, thrReturn: -1, holdAfter: -1 }));
  check('the wizard ran through with the sprung throttle held down the whole way', log[log.length - 1] === 'done', log.join(' | '));
  /* Buttons are back, so seven steps: already on the check. */
  await came(page, onCalStep('confirm'), 3000);
  await came(page, 'window.__ui.calCanSave === true', 3000);
  const held = await json(ev('const v = input.calibrationView(); return JSON.stringify({ pct: v.throttlePercent, zeroHidden: ui.calZeroBtn.hidden });'));
  check('still held down, the check step reads 0 and offers nothing', held.pct === 0 && held.zeroHidden === true, show(held));
  await setAxis(page, 2, 0);
  await came(page, '!window.__ui.calZeroBtn.hidden', 3000);
  const offer = await json(ev(`
    const v = input.calibrationView();
    return JSON.stringify({ pct: v.throttlePercent, zeroHidden: ui.calZeroBtn.hidden, hint: ui.calHint.textContent });
  `));
  check('the check step reads 50 percent with the stick at rest', offer.pct === 50, show(offer));
  check('the button is showing', offer.zeroHidden === false, show(offer));
  check('and the hint says the number and names the key', /50 percent/.test(offer.hint) && /press T/.test(offer.hint), offer.hint);
  await page.tap('KeyT');
  check('T moves zero to where the stick rests and the offer goes away',
    await came(page, 'window.__input.calibrationView().throttlePercent === 0 && window.__ui.calZeroBtn.hidden', 3000));
  const draft = await json(ev('return JSON.stringify(input.calibration.draft.throttle);'));
  check('the draft has zero at rest and is marked sprung', draft.low === 0 && draft.high === 1 && draft.sprung === true, show(draft));
  await page.tap('Escape');
  await came(page, "window.__ui.screen === 'pilot'", 3000);
  check('Escape cancels without keeping it', await ev("return input.calibration === null && input.map.throttle.low === -1 && ui.screen === 'pilot';"));
  await setAxis(page, 2, -1);
}

/* "some are inverted and there's no option to change it" (bug-b0d085f0)
 * and "i pushed the left stick but the right stick moved" (bug-873a84ec,
 * a Mode 1 pilot on a Mode 2 drawing), reached from the Settings row with
 * the arrows and Enter, as a pilot would. */
async function checkSticks(page, ev) {
  heading('check sticks: reaching the repair from Settings, reversing a channel, swapping the hands');
  const row = await json(ev(`
    ${PAST_GATE}
    ui.show('pilot');
    const items = ui.items();
    const i = items.findIndex((it) => it && it.action === 'calibrate-check');
    if (i >= 0) { ui.setCursor(i); }
    return JSON.stringify({ i, note: i >= 0 ? (items[i].note || '') : '', stop: i >= 0 ? ui.isStop(items[i]) : false, calibrated: input.map.stored });
  `));
  check('there is a row in Settings for it', row.i >= 0 && row.stop, show(row));
  check('and its note says what it is for', /reverses that channel/.test(row.note), row.note.slice(0, 120));
  check('the radio is calibrated going in, so there is a mapping to check', row.calibrated === true);
  await page.tap('Enter');
  check('Enter on that row opens the check', await came(page, "window.__ui.screen === 'calibrate' && !!window.__input.calibration", 4000));
  /* The view answers at once; the kicker and buttons wait for the frame. */
  await came(page, '/Check sticks/.test(window.__ui.calKicker.textContent)', 5000);
  const open = await json(ev(`
    const v = input.calibrationView();
    return JSON.stringify({ step: v.step, count: v.stepCount, checkOnly: v.checkOnly, kicker: ui.calKicker.textContent,
      canSave: ui.calCanSave, revHidden: ui.calRevBtn.hidden, modeHidden: ui.calModeBtn.hidden,
      yaw: input.calibration.draft.yaw.axis, axes: v.axes.length });
  `));
  check('it opens straight on the check step, one step long', open.step === 'confirm' && open.count === 1 && open.checkOnly === true, show(open));
  check('named as the check rather than as the wizard', /Check sticks/.test(open.kicker), open.kicker);
  check('carrying the saved mapping, yaw still on axis 4', open.yaw === 4 && open.axes === 6, show(open));
  check('Save is offered and the stick mode button is up; Reverse waits for a stick',
    open.canSave === true && open.modeHidden === false && open.revHidden === true, show(open));
  await setAxis(page, 0, 1);
  /* R is gated on the shell's calCanReverse, painted by the frame loop
   * after the view knows; the button label settles last, so wait on it. */
  await came(page, "window.__ui.calCanReverse === true && window.__ui.calRevBtn.textContent === 'Reverse roll'", 5000);
  const live = await json(ev(`
    const v = input.calibrationView();
    return JSON.stringify({ moving: v.moving, canReverse: v.canReverse, hint: ui.calHint.textContent,
      revHidden: ui.calRevBtn.hidden, revLabel: ui.calRevBtn.textContent, roll: v.channels.roll });
  `));
  check('holding one stick names its channel', live.moving === 'roll' && live.canReverse === true, show(live));
  check('the button appears and names it', live.revHidden === false && live.revLabel === 'Reverse roll', live.revLabel);
  check('the hint offers both keys', /press R to reverse roll/.test(live.hint) && /press M/.test(live.hint), live.hint);
  check('and roll reads full one way', live.roll === 1, String(live.roll));
  await page.tap('KeyR');
  check('R turns it round under the stick they are still holding',
    await came(page, "window.__input.calibrationView().channels.roll === -1 && window.__ui.calRevBtn.textContent === 'Un-reverse roll'", 5000));
  const turned = await json(ev(`
    const v = input.calibrationView();
    return JSON.stringify({ rev: v.reverse, label: ui.calRevBtn.textContent, savedRev: input.map.reverse.roll });
  `));
  check('the draft records it', turned.rev.roll === true && turned.rev.pitch === false, show(turned.rev));
  check('the button becomes the way back', turned.label === 'Un-reverse roll', turned.label);
  check('and the SAVED map is untouched until Save', turned.savedRev === false);
  const was = await json(ev('return JSON.stringify({ mode: ui.settings.stickMode, left: ui.calStickLeft.cap.textContent });'));
  await page.tap('KeyM');
  check('M moves the stick mode on', await came(page, `window.__ui.settings.stickMode !== ${was.mode}`, 4000), show(was));
  const now = await json(ev('return JSON.stringify({ mode: ui.settings.stickMode, left: ui.calStickLeft.cap.textContent, inputMode: input.stickMode, btn: ui.calModeBtn.textContent });'));
  check('the drawn gimbal is re-captioned where they can see it', now.left !== was.left, `${was.left} -> ${now.left}`);
  check('and the input layer and the button agree with the setting', now.inputMode === now.mode && now.btn === `Stick mode ${now.mode}`, show(now));
  await page.tap('Enter');
  check('Enter saves and returns to Settings', await came(page, "window.__ui.screen === 'pilot' && window.__input.calibration === null", 4000));
  const kept = await json(ev('return JSON.stringify({ rev: input.map.reverse, yaw: input.map.yaw.axis, thr: input.map.throttle.low });'));
  check('the reversal is kept and no axis assignment moved', kept.rev.roll === true && kept.yaw === 4 && kept.thr === -1, show(kept));
  await setAxis(page, 0, 0);
  /* Mode 2 again for the next section. */
  await ev('ui.settings.stickMode = 2; ui.writeSettings();');
}

/* The wizard pins the channels at zero while it is up, so the menu's edge
 * tracker took a stick still held when it closed for a fresh flick on the
 * next screen (saving the check with roll held went Back, off Settings).
 * Both halves: a held stick does nothing, a real flick still navigates. */
async function padEdges(page, ev) {
  heading('the pad edge tracker: a held stick is not a gesture, a fresh one still is');
  const e = await json(ev(`
    ${PAST_GATE}
    const out = {};
    ui.show('pilot');
    ui.pollPad({ left: true });
    out.heldOnce = ui.screen;
    ui.pollPad({ left: true });
    out.heldTwice = ui.screen;
    ui.pollPad({});
    ui.pollPad({ left: true });
    out.afterFlick = ui.screen;
    ui.show('pilot');
    const start = ui.cursor;
    ui.pollPad({ down: true });
    out.cursorHeld = ui.cursor - start;
    ui.pollPad({ down: true });
    out.cursorStillHeld = ui.cursor - start;
    ui.pollPad({});
    ui.pollPad({ down: true });
    out.cursorFlicked = ui.cursor - start;
    ui.pollPad({});
    ui.show('title');
    return JSON.stringify(out);
  `));
  check('a stick already held when the screen opened does nothing', e.heldOnce === 'pilot' && e.heldTwice === 'pilot', show(e));
  check('releasing and flicking again still navigates', e.afterFlick !== 'pilot', e.afterFlick);
  check('and the cursor obeys the same rule', e.cursorHeld === 0 && e.cursorStillHeld === 0 && e.cursorFlicked > 0, show(e));
}

/* "when I really hardly crash the drone the game just freezes"
 * (bug-579a663f): main.js records the first thrown frame fault on
 * window.__frameFault, and the F8 report has to carry it. */
async function frameFault(page, ev) {
  heading('a frozen frame reports itself');
  const plain = await json(ev('return JSON.stringify(Object.keys(ui.bugSnapshot()));'));
  check('an ordinary report carries no fault field', !plain.includes('fault'), plain.join(','));
  const f = await json(ev(`
    const NL = String.fromCharCode(10);
    window.__frameFault = { message: 'sim_state: SIM_ERR_STATE',
      stack: ['Error: sim_state', '  at readState (main.js:2747)', '  at frameBody (main.js:5940)',
        '  at frame (main.js:5758)', '  at deeper (main.js:1)'].join(NL), atMs: 12345 };
    const snap = ui.bugSnapshot();
    const keys = Object.keys(snap);
    delete window.__frameFault;
    return JSON.stringify({ keys, fault: snap.fault, chars: JSON.stringify(snap).length });
  `));
  check('once one is recorded, the report carries it', Boolean(f.fault), show(f.keys));
  check('with the message that names the throwing call', f.fault && f.fault.message === 'sim_state: SIM_ERR_STATE', show(f.fault));
  check('and the top frames only, so a stack cannot blow the size cap',
    f.fault && f.fault.stack.split(' | ').length === 4 && !/deeper/.test(f.fault.stack), f.fault ? f.fault.stack : 'none');
  check('and when it happened', f.fault && f.fault.atMs === 12345);
  /* The board caps a context at 32 keys and 8000 characters, and the feel
   * form adds five keys of its own. */
  check(`a faulted report is ${f.keys.length} keys and ${f.chars} chars, inside the board's 32 and 8000`,
    f.keys.length + 5 <= 32 && f.chars < 8000, `${f.keys.length} keys, ${f.chars} chars`);
}

/* Mouse flight, the half main.js owns: the Settings row and its memory,
 * the how-to tab, and the pointer capture in flight with the two ways it
 * is lost. On the radio page on purpose: picked, the mouse flies over a
 * connected radio. */
async function mouseFlight(page, ev) {
  const mouse = (params) => page.cdp.send('Input.dispatchMouseEvent', { x: 800, y: 450, ...params }, page.sessionId);
  const click = async () => {
    await mouse({ type: 'mousePressed', button: 'left', clickCount: 1 });
    await mouse({ type: 'mouseReleased', button: 'left', clickCount: 1 });
  };
  const SUB_ROWS = '/^(Mouse sensitivity|Mouse expo|Invert mouse pitch|Mouse stick)$/';

  heading('mouse flight: the Settings row, off by default and remembered');
  const row = await json(ev(`
    ${PAST_GATE}
    ui.show('pilot');
    const items = ui.items();
    const i = items.findIndex((it) => it && it.label === 'Mouse flight');
    const joy = items.findIndex((it) => it && it.action === 'choosepad');
    ui.setCursor(i);
    return JSON.stringify({ i, joy, value: i >= 0 ? items[i].value : null, on: input.mouseEnabled,
      subRows: items.filter((it) => it && ${SUB_ROWS}.test(it.label)).length });
  `));
  check('there is a Mouse flight row, right under Choose joystick', row.i >= 0 && row.i === row.joy + 1, show(row));
  check('it is Off, and the input manager agrees', row.value === 'Off' && row.on === false, show(row));
  check('off, its four adjustments are not in the list', row.subRows === 0, String(row.subRows));
  await page.tap('ArrowRight');
  check('Right turns it on, and the input manager follows', await came(page, 'window.__input.mouseEnabled === true', 3000));
  const on = await json(ev(`
    const items = ui.items();
    const stored = JSON.parse(localStorage.getItem(${show(SETTINGS_KEY)}) || '{}');
    return JSON.stringify({ stored: stored.mouseFlight,
      rows: items.filter((it) => it && ${SUB_ROWS}.test(it.label)).map((it) => it.label + '=' + it.value) });
  `));
  check('it is stored in the settings', on.stored === true, show(on));
  check('on, sensitivity, expo, invert and the stick\'s centring appear with their defaults',
    on.rows.join() === 'Mouse sensitivity=100%,Mouse expo=0%,Invert mouse pitch=Off,Mouse stick=Auto', on.rows.join());
  await page.cdp.send('Page.reload', {}, page.sessionId);
  await page.until('window.__shellReady === true', 90000);
  await page.until('!!window.__ui && !!window.__input', 10000);
  check('after a reload it is still on', await ev('return ui.settings.mouseFlight === true && input.mouseEnabled === true;'));

  heading('mouse flight: the how-to has a Mouse tab');
  const howto = await json(ev(`
    ${PAST_GATE}
    ui.show('howto');
    const tab = ui.howtoTabs.mouse;
    ui.setHowtoSource('mouse');
    const dt = Array.from(ui.howtoKeys.querySelectorAll('dt')).map((n) => n.textContent);
    const dd = Array.from(ui.howtoKeys.querySelectorAll('dd')).map((n) => n.textContent);
    ui.show('pilot');
    return JSON.stringify({ tab: tab ? tab.textContent : null, dt, dd });
  `));
  check('the tab is there', howto.tab === 'Mouse', String(howto.tab));
  check('it names the wheel, the buttons, the centring and Escape',
    ['Wheel', 'Left and right buttons', 'Middle button or Z', 'Esc'].every((k) => howto.dt.includes(k)), howto.dt.join(' | '));
  check('and sends the pilot to the room that holds the row', howto.dd.some((d) => d.startsWith('Settings, Sticks, Mouse flight')),
    howto.dd.join(' | '));

  heading('mouse flight: the pointer is captured in flight and freed by Escape');
  const lock = () => json(ev('return JSON.stringify(window.__mouseLock());'));
  await ev(`${PAST_GATE} ui.onAction('fly', ui.settings); return true;`);
  await page.until("window.__craftState().mode === 'flight' && window.__ui.screen === 'flight'", 120000);
  await page.until('window.__mouseLock().wants', 20000);
  /* The banner follows the wish by a frame. */
  await came(page, "/Click to fly/.test(window.__ui.banner ? window.__ui.banner.textContent : '')", 10000);
  const pre = await json(ev("return JSON.stringify({ lock: window.__mouseLock(), banner: ui.banner ? ui.banner.textContent : '' });"));
  check('in flight it wants the pointer, and with no click yet the mouse flies nothing', pre.lock.wants && !pre.lock.live, show(pre.lock));
  check('the source is the mouse, over the connected radio', pre.lock.source === 'the mouse', pre.lock.source);
  check('the banner asks for the click', /Click to fly with the mouse/.test(pre.banner), pre.banner);
  await click();
  check('one click captures it', await came(page, 'window.__mouseLock().live', 5000));
  for (let k = 0; k < 5; k += 1) {
    await mouse({ type: 'mouseWheel', deltaX: 0, deltaY: -100 });
  }
  await came(page, 'window.__input.channels.throttle > 0.09', 3000);
  const notch = await json(ev('const l = window.__mouseLock(); return JSON.stringify({ thr: l.channels.throttle, step: l.step, af: window.__craft().run });'));
  check('five notches up is five steps of the aircraft\'s notch, 2 percent on a quad and 5 on a plane',
    Math.abs(notch.thr - 5 * notch.step) < 1e-9 && notch.step === (/inch|whoop/.test(notch.af) ? 0.02 : 0.05), show(notch));
  await page.tap('Escape');
  check('Escape pauses and lets the pointer go', await came(page, "window.__ui.screen === 'paused' && !window.__mouseLock().locked", 5000),
    await ev("return ui.screen + ' ' + JSON.stringify(window.__mouseLock());"));
  check('and the throttle is kept for the resume', await ev('return window.__mouseLock().channels.throttle;') === notch.thr);
  await ev("ui.act('resume'); return true;");
  await page.until("window.__ui.screen === 'flight'", 5000);
  await click();
  /* Owned, not just held: Chrome sets pointerLockElement before it tells
   * the shell the capture is its own. */
  check('back in flight, a click captures it again, and the shell owns it',
    await came(page, 'window.__mouseLock().live && window.__mouseLock().mine', 5000), show(await lock()));
  /* The browser's own release (a real Escape spent on the lock, a window
   * switch): a pause, and that Escape must not resume. */
  await ev('document.exitPointerLock(); return true;');
  check('losing the capture in flight pauses, like a hidden tab', await came(page, "window.__ui.screen === 'paused'", 5000),
    await ev('return ui.screen;'));
  await page.tap('Escape');
  await page.sleep(100);
  check('and the Escape that caused it does not resume straight back', await ev('return ui.screen;') === 'paused');
  await ev("ui.show('pilot'); return true;");
  const at = await ev("const i = ui.items().findIndex((it) => it && it.label === 'Mouse flight'); ui.setCursor(i); return i;");
  check('the row is still there to turn it off', at >= 0);
  await page.tap('ArrowLeft');
  check('Left turns it off', await came(page, 'window.__input.mouseEnabled === false', 3000));
  await ev(`${PAST_GATE} ui.onAction('fly', ui.settings); return true;`);
  await page.until("window.__craftState().mode === 'flight' && window.__ui.screen === 'flight'", 120000);
  await click();
  await page.sleep(500);
  const off = await lock();
  check('off, a click in flight captures nothing and the radio is the source again',
    !off.locked && !off.wants && off.source !== 'the mouse', show(off));
  await ev("ui.onAction('title', ui.settings); return true;");
}

/* ------------------------------------------------------ the touch page */

/* Mode 1 on a phone (bug-94da186c, bug-a8cd61db): one row in Settings, and
 * the thumb sticks' captions, the keyboard's throttle keys, the how-to and
 * every drawn gimbal follow it. Driven through the row with an arrow. */
async function touchModes(page, ev) {
  heading('touch: the stick mode row reaches the thumbs, the keys, the how-to and the drawn gimbals');
  const plate = "const cap = (side) => { const n = document.querySelector('.touch-zone-' + side + ' .osd-gimbal-cap'); return n ? n.textContent : null; };";
  const start = await json(ev(`
    ${PAST_GATE}
    ${plate}
    ui.show('pilot');
    const items = ui.items();
    const i = items.findIndex((it) => it && it.label === 'Stick mode');
    ui.setCursor(i);
    return JSON.stringify({ row: i, mode: ui.settings.stickMode, value: i >= 0 ? items[i].value : null, left: cap('left'), right: cap('right'),
      thrUp: input.throttleKeys.up, mounted: Boolean(document.querySelector('.touch-fly')) });
  `));
  check('the thumb sticks are mounted on a touch device', start.mounted);
  check('there is a Stick mode row in Settings', start.row >= 0, show(start));
  check('it starts on Mode 2, and the plates say so',
    start.mode === 2 && start.value === 'Mode 2' && start.left === 'Yaw · throttle' && start.right === 'Roll · pitch', show(start));
  check('and W is the throttle', start.thrUp === 'KeyW', start.thrUp);
  await page.tap('ArrowLeft');
  check('one arrow left is Mode 1', await came(page, 'window.__ui.settings.stickMode === 1', 3000));
  await came(page, "document.querySelector('.touch-zone-left .osd-gimbal-cap').textContent === 'Yaw · pitch'", 3000);
  const m1 = await json(ev(`
    ${plate}
    ui.show('howto');
    ui.setHowtoSource('touch');
    const dd = Array.from(ui.howtoKeys.querySelectorAll('dd')).map((n) => n.textContent);
    ui.show('pilot');
    return JSON.stringify({ left: cap('left'), right: cap('right'), thrUp: input.throttleKeys.up, thrDown: input.throttleKeys.down,
      inputMode: input.stickMode, howtoLeft: dd[0] || '', howtoRight: dd[1] || '',
      calLeft: ui.calStickLeft.cap.textContent, calRight: ui.calStickRight.cap.textContent,
      osdLeft: ui.osdStickLeft.cap.textContent, osdRight: ui.osdStickRight.cap.textContent,
      value: ui.items()[ui.cursor].value });
  `));
  check('the plates now read yaw and pitch on the left, roll and throttle on the right',
    m1.left === 'Yaw · pitch' && m1.right === 'Roll · throttle', show(m1));
  check('the input manager has the mode and the arrows are the throttle',
    m1.inputMode === 1 && m1.thrUp === 'ArrowUp' && m1.thrDown === 'ArrowDown', show(m1));
  check('the how-to for thumbs names the same hands',
    m1.howtoLeft.startsWith('Yaw, pitch') && m1.howtoRight.startsWith('Roll, throttle'), show([m1.howtoLeft, m1.howtoRight]));
  check('the calibrate and OSD gimbals are captioned the same way',
    m1.calLeft === 'Yaw, pitch' && m1.calRight === 'Roll, throttle' && m1.osdLeft === 'Yaw, pitch' && m1.osdRight === 'Roll, throttle', show(m1));
  check('and the row reads Mode 1', m1.value === 'Mode 1', m1.value);
  await page.tap('ArrowRight');
  await came(page, 'window.__ui.settings.stickMode === 2', 3000);
  check('one arrow right puts it back', await ev("return ui.settings.stickMode === 2 && input.throttleKeys.up === 'KeyW';"));
}

/* ------------------------------------------------------- the Xbox page */

/*
 * Holds one stick direction until the craft has turned far enough for its
 * sign to be unambiguous (about nine degrees, long before an acro roll
 * could come round and flip it), then lets go. Waiting on attitude rather
 * than a clock keeps it independent of a headless frame's length.
 *   yaw    the nose against where the right wing pointed
 *   roll   the top against where the right wing pointed
 *   pitch  the nose against where the top pointed
 */
const TURN = (axis, value, measure) => `(async () => {
  const pad = window.__pad;
  const put = (v) => { pad.axes[${axis}] = v; pad.timestamp += 1; };
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
  const s0 = window.__craftState();
  const right0 = cross(s0.fwd, s0.up);
  const read = (s) => ({ yaw: dot(s.fwd, right0), roll: dot(s.up, right0), pitch: dot(s.fwd, s0.up) })[${show(measure)}];
  put(${value});
  const t0 = performance.now();
  let m = 0;
  let s = s0;
  while (performance.now() - t0 < 90000) {
    await new Promise((r) => setTimeout(r, 5));
    s = window.__craftState();
    m = read(s);
    if (Math.abs(m) > 0.15) { break; }
  }
  put(0);
  return { m, dt: s.simS - s0.simS, crashed: s.crashed, landed: s.landed };
})()`;

async function xbox(page, ev) {
  heading('an Xbox pad on the default map: the sticks are where the pilot\'s hands are');
  const start = await json(ev(`
    return JSON.stringify({ s: input.padSummary(), thr: input.map.throttle, yaw: input.map.yaw, roll: input.map.roll, pitch: input.map.pitch,
      mode: ui.settings.stickMode });
  `));
  check('Mode 2 on a standard pad: left stick yaw and throttle, right stick roll and pitch',
    start.mode === 2 && start.yaw.axis === 0 && start.thr.axis === 1 && start.roll.axis === 2 && start.pitch.axis === 3, show(start));
  check('it is not called a guess, and it is not called calibrated',
    start.s.mapKnown === true && start.s.calibrated === false && start.s.guessNoYaw === false, show(start.s));
  await ev(`${PAST_GATE} ui.show('title');`);
  /* The frame loop repaints the rows from padSummary. */
  await page.sleep(1000);
  const warn = await json(ev("return JSON.stringify(Array.from(ui.screens.title.querySelectorAll('.row-warn .row-label')).map((n) => n.textContent));"));
  check('the title carries no calibration warning for it', warn.length === 0, show(warn));

  await ev(`${PAST_GATE} ui.onAction('fly', ui.settings); return true;`);
  await page.until("window.__craftState().mode === 'flight' && window.__ui.screen === 'flight'", 120000);
  /* Throttle low first: hands off the pad reads half, which used to launch
   * the quad on the spot. It is held at zero until the stick has been
   * down, and the banner says so. */
  await page.sleep(3000);
  const sat = await page.evaluate(`({ c: window.__craftState(), thr: window.__input.channels.throttle,
    src: window.__input.stats().source, waiting: window.__input.throttleWaiting,
    banner: window.__ui.banner ? window.__ui.banner.textContent : '' })`);
  check('sticks centred at spawn: throttle held at 0 and the quad stays on the ground',
    sat.thr === 0 && sat.waiting === true && sat.c.landed === true && !sat.c.flownThisRun,
    show({ thr: sat.thr, waiting: sat.waiting, landed: sat.c.landed }));
  check('and the banner tells the pilot why', sat.banner === 'Throttle down to start', sat.banner);
  check('the source is the pad, not a guess', sat.src === 'a radio', sat.src);
  await setAxis(page, 1, -1);
  await page.sleep(1500);
  const early = await page.evaluate('({ c: window.__craftState(), thr: window.__input.channels.throttle })');
  check('full up without having been down first: still held, still on the ground',
    early.thr === 0 && early.c.landed === true, show({ thr: early.thr, landed: early.c.landed }));
  await setAxis(page, 1, 1);
  /* The banner repaints on the frame loop, and a headless frame can last a
   * second, so it is waited on. */
  const bannerGone = await came(page,
    "window.__input.throttleWaiting === false && (window.__ui.banner ? window.__ui.banner.textContent : '') !== 'Throttle down to start'", 15000);
  check('pulled down: the hold is gone and so is the banner', bannerGone, await page.evaluate("window.__ui.banner ? window.__ui.banner.textContent : ''"));
  await setAxis(page, 1, -1);
  /* The plant's own height, z up: the drawn pose may still be settling. */
  const z0 = sat.c.plantPos.z;
  const climbed = await came(page, `window.__craftState().plantPos.z - ${z0} > 3`, 120000);
  const up = await page.evaluate('({ c: window.__craftState(), thr: window.__input.channels.throttle })');
  check('left stick up is full throttle and the quad climbs', climbed && up.thr === 1 && !up.c.landed && !up.c.crashed,
    show({ thr: up.thr, dz: up.c.plantPos.z - z0, landed: up.c.landed, crashed: up.c.crashed }));
  /* Let the stick spring back to half: a gentle climb that keeps the quad
   * clear of the ground for the three turns. */
  await setAxis(page, 1, 0);
  await page.sleep(300);
  const yaw = await page.evaluate(TURN(0, 1, 'yaw'));
  check('left stick right yaws the nose right', yaw.m > 0.15 && !yaw.crashed, show(yaw));
  const roll = await page.evaluate(TURN(2, 0.5, 'roll'));
  check('right stick right rolls right', roll.m > 0.15 && !roll.crashed, show(roll));
  const pitch = await page.evaluate(TURN(3, -0.5, 'pitch'));
  check('right stick up pitches the nose down', pitch.m < -0.15 && !pitch.crashed, show(pitch));

  /* And a radio is not held: the same slot reports a radio, throttle
   * parked, R puts it back on the pad, and throttle straight up takes off
   * as ever, with no banner. */
  await page.evaluate(`(() => { const p = window.__pad; p.mapping = ''; p.id = 'Selftest radio (Vendor: 1209 Product: 4f54)';
    p.axes = [0, 0, -1, 0]; p.timestamp += 1; return true; })()`);
  await page.sleep(300);
  await page.tap('KeyR');
  await came(page, 'window.__craftState().landed === true', 20000);
  await page.sleep(500);
  const r0 = await page.evaluate('({ c: window.__craftState(), waiting: window.__input.throttleWaiting, held: window.__input.throttleHeld, map: window.__input.map.throttle })');
  check('a radio after R: back on the ground, AETR, and not held', r0.c.landed && !r0.waiting && !r0.held && r0.map.axis === 2,
    show({ landed: r0.c.landed, waiting: r0.waiting, held: r0.held, map: r0.map }));
  await setAxis(page, 2, 1);
  const rose = await came(page, `window.__craftState().plantPos.z - ${r0.c.plantPos.z} > 1`, 120000);
  const r1 = await page.evaluate("({ c: window.__craftState(), thr: window.__input.channels.throttle, banner: window.__ui.banner ? window.__ui.banner.textContent : '' })");
  check('throttle straight up from the bottom: full throttle and it climbs, as ever',
    rose && r1.thr === 1 && !r1.c.landed && r1.banner !== 'Throttle down to start', show({ thr: r1.thr, landed: r1.c.landed, banner: r1.banner }));
  await ev("ui.onAction('title', ui.settings); return true;");
}

/* --------------------------------------------------------------- the run */

const PAGES = [
  ['booting the shell with a six axis radio', 'the mouse page', {}, SIX_AXIS_RADIO,
    [signposts, hover, noYawRow, wizardNoButtons, throttleZero, checkSticks, padEdges, frameFault, mouseFlight]],
  ['booting the shell as a touch device', 'the touch page', { touch: true }, SIX_AXIS_RADIO, [touchModes]],
  ['booting the shell with an Xbox pad', 'the Xbox page', {}, XBOX, [xbox]],
];

async function main() {
  const t0 = Date.now();
  let page = null;
  try {
    for (const [banner, name, extra, pad, walks] of PAGES) {
      console.log(`${page === null && banner === PAGES[0][0] ? '' : '\n'}${banner}`);
      page = await boot(extra, pad);
      const ev = inPage(page);
      for (const walk of walks) {
        await walk(page, ev);
      }
      const uncaught = page.errors.filter((e) => e.startsWith('uncaught:'));
      check(`no uncaught exception on ${name}`, uncaught.length === 0, uncaught.slice(0, 3).join(' | '));
      await page.close();
      page = null;
    }
  } catch (e) {
    check('the run completed', false, String(e && e.stack ? e.stack : e));
    if (page) {
      await page.close().catch(() => {});
    }
  }
  const secs = Math.round((Date.now() - t0) / 1000);
  console.log(failed ? `\n${failed} failed, ${passed} passed, ${secs}s` : `\nall ${passed} passed, ${secs}s`);
  for (const f of failures) {
    console.log(`  FAIL ${f}`);
  }
  process.exitCode = failed ? 1 : 0;
}

main();
