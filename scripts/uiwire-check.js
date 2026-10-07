/*
 * uiwire-check.js: the menu's actions and the flight keys, fired one at a
 * time into the real page, with what each one left behind compared to a
 * recorded walk.
 *
 * main.js answers ui.act through ui.onAction and the keyboard through
 * input.onKey, and the pad picker, the calibration wizard, the Flight
 * controller's Save and the audio mix all hang off those two. Each step
 * below fires one action or key in a fixed state and records the screen,
 * the run mode, the notice the pilot is shown, the intro shot's clock, the
 * settings it can move, and every call it made on the audio engine. The
 * record lives in tests/uiwire-golden.json and was written on the code
 * before any of this wiring was rewritten, so a rewrite that changes what
 * a pilot sees fails here.
 *
 *   npm run uiwire:check            compare against the record
 *   npm run uiwire:check -- --write rewrite the record (only on purpose)
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

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const GOLDEN = join(root, 'tests', 'uiwire-golden.json');
const WRITE = process.argv.includes('--write');

const GRAPHICS_LOW = `try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  s.graphics = 'low';
  s.graphicsAuto = false;
  localStorage.setItem(k, JSON.stringify(s));
} catch (e) { /* storage refused; the page still boots */ }`;

const NO_PAD = 'navigator.getGamepads = () => [];';


/* The radio input-check.js boots with: six axes, throttle parked on 2, so
 * nothing about it is mapped and the pad picker has a device to offer. */
const RADIO = `window.__pad = {
  index: 0,
  id: 'Selftest six axis radio (Vendor: 1209 Product: 4f54)',
  connected: true,
  mapping: '',
  timestamp: 1,
  axes: [0, 0, -1, 0, 0, -1],
  buttons: [0, 1, 2, 3].map(() => ({ pressed: false, touched: false, value: 0 })),
};
navigator.getGamepads = () => [window.__pad];`;

/*
 * Installed once per page: every audio engine method the wiring calls is
 * wrapped so a step can say which ones it reached and with what, and the
 * last menu intent handed to ui.pollPad is kept for the pad rows.
 */
const SPIES = `(() => {
  const a = window.__audio;
  window.__calls = [];
  for (const m of ['start', 'setLevel', 'setEnabled', 'setMix', 'setMusicEnabled', 'setMusicTrack',
    'setMusicContext', 'setFocusEnabled', 'ui']) {
    const f = a[m];
    if (typeof f !== 'function') { continue; }
    a[m] = function (...args) {
      window.__calls.push([m, JSON.parse(JSON.stringify(args.length ? args : null))]);
      return f.apply(this, args);
    };
  }
  const ui = window.__ui;
  const poll = ui.pollPad.bind(ui);
  window.__navSeen = new Set();
  ui.pollPad = (nav) => {
    for (const [k, v] of Object.entries(nav)) {
      if (v === true) { window.__navSeen.add(k); }
    }
    return poll(nav);
  };
  return true;
})()`;

/* Settles two frames, then reads the state a step is judged on. The notice
 * is reported only when the step changed it, so one left over from an
 * earlier step and still on its timer is not credited to this one. */
const STARTS = /fly|restart|resume/;
const SNAP = (before, label) => `(async () => {
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  await frame(); await frame(); await frame();
  const ui = window.__ui;
  const s = ui.settings;
  const notice = window.__craftState().notice || '';
  const intro = window.__intro().ms;
  const dialog = ui.nameDialog && !ui.nameDialog.hidden;
  /* The intro shot ends on the wall clock, so it is read only by the steps
   * that start a run, a few frames in, long before it could have ended. */
  const shot = ${STARTS}.test(${JSON.stringify(label)}) ? { intro: intro < 0 ? 'off' : 'on' } : {};
  return JSON.stringify({
    ...shot,
    screen: ui.screen,
    mode: window.__mode,
    notice: notice === ${JSON.stringify(before)} ? '' : notice,
    dialog,
    airframe: s.airframe,
    tune: s.tune,
    stickMode: s.stickMode,
    launchControl: s.launchControl,
    fcRunActive: ui.fc ? ui.fc.runActive : null,
    calls: window.__calls.splice(0),
  });
})()`;

async function bootPage(seed) {
  const page = await openPage({ root, width: 1280, height: 720, seed: [GRAPHICS_LOW, ...seed] });
  await page.until('window.__shellReady === true', 90000);
  await page.until('!!window.__ui && !!window.__input && !!window.__audio', 10000);
  await page.evaluate(SPIES);
  return page;
}

/*
 * One step: a label and the snippet that fires it, with ui, input and s
 * (a copy of the settings) in scope. A step whose state needs time to
 * arrive (whenConfigReady, the intro) names the expression to wait on.
 */
const act = (name, extra = '') => [`act ${name}${extra ? ` ${extra}` : ''}`, `ui.onAction(${JSON.stringify(name)}${extra ? `, ${extra}` : ''});`];
const key = (code) => [`key ${code}`, `input.onKey(${JSON.stringify(code)}, false);`];
const run = (label, body, wait = null) => [label, body, wait];
const CLEAR_NAV = 'window.__navSeen.clear(); ';
const FLYING = "window.__screen === 'flight' && window.__mode === 'flight'";

const KEYBOARD_WALK = [
  run('to the title past the gate', "ui.firstRun = false; ui.craftGate = false; if (!ui.mode) { ui.mode = 'race'; } ui.show('title'); ui.renderMenu();"),
  /* A quad, so L reaches launch control rather than a wing's hand launch. */
  run('a quad is chosen', "ui.settings.airframe = '7inch'; ui.onAction('noop', ui.settings);"),
  act('calibrate'),
  act('calibrate-cancel'),
  act('choosepad'),
  act('calibrate-check'),
  act('downloadflightlog'),
  act('padpick-cancel'),
  run('a setting rides in with an action', 'ui.onAction("noop", { ...ui.settings, musicLevel: 3, motorLevel: 7, focusTone: true });'),
  run('sound off rides in', 'ui.onAction("noop", { ...ui.settings, sound: false });'),
  key('KeyQ'),
  run('sound back on', 'ui.onAction("noop", { ...ui.settings, sound: true });'),
  key('KeyQ'),
  run('a click is heard', "ui.onUiSound('move');"),
  [...act('fly'), FLYING],
  key('KeyX'),
  run('launch control off, L', 'ui.settings.launchControl = false; input.onKey("KeyL", false);'),
  run('launch control on, L on the pad', 'ui.settings.launchControl = true; input.onKey("KeyL", false);'),
  key('KeyL'),
  key('KeyR'),
  run('a repeated R is ignored', 'input.onKey("KeyR", true);'),
  act('pause'),
  [...act('resume'), FLYING],
  [...act('restart'), FLYING],
  run('the FC opens on a live run', "ui.onFcOpen('pids');"),
  act('title'),
  run('the FC opens on the title', "ui.onFcOpen('pids');"),
  run('the FC saves its draft', 'ui.onFcSave(ui.fc.draft, {});'),
  run('the FC saves and restarts', 'ui.onFcSave(ui.fc.draft, { restart: true });', FLYING),
  run('the FC angle switch', 'ui.onFcAngle(true); ui.onFcAngle(false);'),
  act('title'),
  act('postrun'),
  act('posttime'),
  run('a standings ghost with no id', "ui.onStandingsGhost({ id: 't' }, {});"),
  act('setname'),
  run('the name dialog closes', 'ui.closeNameDialog(null);'),
  act('importkey'),
  run('the key dialog closes', 'ui.closeNameDialog(null);'),
];

const RADIO_WALK = [
  run('booted with a radio', ''),
  act('padpick-cancel'),
  run('to the title past the gate', "ui.firstRun = false; ui.craftGate = false; if (!ui.mode) { ui.mode = 'race'; } ui.show('title'); ui.renderMenu();"),
  act('calibrate'),
  act('calibrate-reverse'),
  act('calibrate-zero-throttle'),
  act('calibrate-stick-mode'),
  act('calibrate-stick-mode'),
  act('calibrate-stick-mode'),
  act('calibrate-stick-mode'),
  act('calibrate-skip'),
  act('calibrate-save'),
  act('choosepad'),
  act('padpick-cancel'),
  act('calibrate-cancel'),
  act('calibrate-check'),
  act('calibrate-cancel'),
  run('to the title', "ui.show('title'); ui.renderMenu();"),
  run('pitch up on an unmapped radio', `${CLEAR_NAV}window.__pad.axes[1] = -1; window.__pad.timestamp += 1;`),
  run('stick back to centre', 'window.__pad.axes[1] = 0; window.__pad.timestamp += 1;'),
  run('pitch down on an unmapped radio', `${CLEAR_NAV}window.__pad.axes[1] = 1; window.__pad.timestamp += 1;`),
  run('roll on an unmapped radio', `${CLEAR_NAV}window.__pad.axes[1] = 0; window.__pad.axes[0] = 1; window.__pad.timestamp += 1;`),
  run('roll back to centre', 'window.__pad.axes[0] = 0; window.__pad.timestamp += 1;'),
  act('choosepad'),
  act('choosepad'),
  act('padpick-no'),
  act('padpick-skip'),
  act('choosepad'),
  act('padpick-yes'),
  act('padpick-cancel'),
  [...act('fly'), FLYING],
  act('choosepad'),
  act('padpick-cancel'),
  act('resume'),
  key('KeyL'),
];

async function walk(page, steps, out) {
  for (const [label, body, wait] of steps) {
    const before = JSON.parse(await page.evaluate("JSON.stringify(window.__craftState().notice || '')"));
    await page.evaluate(`(() => { const ui = window.__ui; const input = window.__input; ${body} return true; })()`);
    if (wait) {
      await page.until(wait, 20000);
    }
    const snap = JSON.parse(await page.evaluate(SNAP(before, label)));
    if (label.startsWith('pitch')) {
      snap.nav = JSON.parse(await page.evaluate('JSON.stringify([...window.__navSeen].sort())'));
    }
    out.push({ step: label, ...snap });
  }
}

async function main() {
  const t0 = Date.now();
  const got = {};
  for (const [name, seed, steps] of [['keyboard', [NO_PAD], KEYBOARD_WALK], ['radio', [RADIO], RADIO_WALK]]) {
    const page = await bootPage(seed);
    try {
      got[name] = [];
      await walk(page, steps, got[name]);
      const uncaught = page.errors.filter((e) => e.startsWith('uncaught:'));
      got[name].push({ step: 'uncaught exceptions', count: uncaught.length });
    } finally {
      await page.close();
    }
  }
  if (WRITE) {
    writeFileSync(GOLDEN, `${JSON.stringify(got, null, 1)}\n`);
    console.log(`wrote ${GOLDEN}, ${Date.now() - t0} ms`);
    return;
  }
  const want = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  let passed = 0;
  const failures = [];
  for (const name of Object.keys(want)) {
    want[name].forEach((row, i) => {
      const have = (got[name] || [])[i];
      const ok = JSON.stringify(have) === JSON.stringify(row);
      const label = `${name} ${i + 1}: ${row.step}`;
      if (ok) {
        passed += 1;
        console.log(`  pass  ${label}`);
      } else {
        failures.push(label);
        console.log(`  FAIL  ${label}\n    want ${JSON.stringify(row)}\n    have ${JSON.stringify(have)}`);
      }
    });
  }
  const secs = Math.round((Date.now() - t0) / 1000);
  if (failures.length) {
    console.log(`\n${failures.length} failed, ${passed} passed, ${secs}s`);
    process.exit(1);
  }
  console.log(`\nall ${passed} passed, ${secs}s`);
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
