/*
 * controller-check.js: the new pilot's controller question and the
 * Controller screen in the real shell, headless Chromium through
 * tests/lib/page.js, every answer pressed with the pointer or a key the
 * way a pilot sends it. Run with npm run controller:check (local).
 *
 *  1. A first visit with nothing plugged in opens on "What will you fly
 *     with?", not the title: radio, gamepad, keyboard and mouse, skip
 *     (touch only on a touch screen), the cursor on keyboard and mouse.
 *  2. A standard pad plugged in lights A gamepad, live, and no picker
 *     opens over the question. Choosing it opens
 *     How to fly on the radio or gamepad tab; Back is the title, and a
 *     reload is the title: never asked again.
 *  3. A first visit with two EdgeTX radios plugged in (which queues the
 *     joystick picker at boot) opens on the question, never the picker
 *     first, and lights A radio;
 *     choosing it opens the calibration wizard, and Escape out of the
 *     wizard is the title.
 *  4. Escape on the question skips it, and the skip is kept.
 *  5. The Controller screen: Settings' Controller row opens it and Back
 *     returns to Settings; the Hangar's Controller card opens it and Back
 *     returns to the Hangar; Settings no longer lists what moved.
 *  6. A standard gamepad: recognised as one, with Expo; a dead zone of 2
 *     percent from the arrow key flies at once (a stick at 1.5 percent
 *     reads zero, 51 percent reads 50), is stored with the device, and
 *     leaves the built-in layout uncalibrated.
 *  7. An EdgeTX radio: recognised, no Expo, the built-in layout greyed
 *     until calibrated; the wizard opened here comes back here, and Keys
 *     and buttons backs out to here.
 *  8. Rates per aircraft class: own rates on the interceptor, the Cub
 *     chosen in the picker flies stock and the profile keeps the quad's
 *     under multirotor; the interceptor chosen again has them back. The
 *     Controller's rates heading names the class.
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

const root = dirname(dirname(fileURLToPath(import.meta.url)));

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}${detail ? `  (${detail})` : ''}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

const buttons = (n) => Array.from({ length: n }, () => ({ pressed: false, touched: false, value: 0 }));
const PADS = {
  gamepad: {
    index: 0, id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
    connected: true, mapping: 'standard', timestamp: 1, axes: [0, 0, 0, 0], buttons: buttons(17),
  },
  /* EdgeTX in USB joystick mode (src/input/padprofiles.js): AETR with the
   * throttle parked low, as a radio rests. */
  radio: {
    index: 0, id: 'RadioMaster Pocket Joystick (Vendor: 1209 Product: 4f54)',
    connected: true, mapping: '', timestamp: 1, axes: [0, 0, -1, 0, 0, 0, 0, 0], buttons: buttons(24),
  },
};

/* The pads a document starts with come from sessionStorage, so a reload
 * can begin with a radio already plugged in, as a pilot's boot does. */
const SEED = `window.__pads = (() => {
  try { return JSON.parse(sessionStorage.getItem('cc.pads') || '[]'); } catch (e) { return []; }
})();
navigator.getGamepads = () => window.__pads;`;

const page = await openPage({ root, width: 1280, height: 720, url: '/index.html', seed: [SEED], account: null, askFlyWith: true });

/* A first visit again: every trace of this one gone, these pads plugged. */
async function firstVisit(pads) {
  await page.evaluate(`(() => {
    localStorage.clear();
    sessionStorage.setItem('cc.pads', ${JSON.stringify(JSON.stringify(pads))});
    window.__beforeReload = true;
    return true;
  })()`);
  await page.cdp.send('Page.navigate', { url: `${page.origin}/index.html` }, page.sessionId);
  await page.until('window.__beforeReload !== true && !!window.__shellReady', 300000);
}

async function reload() {
  await page.evaluate('(() => { window.__beforeReload = true; return true; })()');
  await page.cdp.send('Page.navigate', { url: `${page.origin}/index.html` }, page.sessionId);
  await page.until('window.__beforeReload !== true && !!window.__shellReady', 300000);
}

async function clickRow(match) {
  const id = await page.evaluate(`(window.__ui.items().find((it) => ${match}) || {}).id || null`);
  return id ? page.click(`[data-row-id="${id}"]`) : false;
}

/* A picker the roster queued on a plugged pad answers first; skipping it
 * hands the screen back to what it opened over. */
async function settle() {
  await page.sleep(500);
  if (await page.evaluate("window.__ui.screen === 'padpick'")) {
    await page.evaluate("window.__ui.act('padpick-skip'); true");
    await page.until("window.__ui.screen !== 'padpick'", 5000);
  }
}

const rowsNow = () => page.evaluate("JSON.stringify(window.__ui.items().map((it) => [it.action, it.value || '']))");
const cursorAction = () => page.evaluate('(window.__ui.items()[window.__ui.cursor] || {}).action || null');
const answer = () => page.evaluate("localStorage.getItem('fdfpv.flywith.v1')");

try {
  await page.until('!!window.__shellReady', 300000);

  console.log('1. the question, nothing plugged in');
  check('a first visit opens on the question', await page.evaluate("window.__ui.screen === 'flywith'"), await page.evaluate('window.__ui.screen'));
  const rows = JSON.parse(await rowsNow());
  check('four answers, no touch on a desktop', JSON.stringify(rows.map((r) => r[0])) === JSON.stringify(['flywith:radio', 'flywith:gamepad', 'flywith:keys', 'flywith:skip']), JSON.stringify(rows));
  check('the cursor is on keyboard and mouse', (await cursorAction()) === 'flywith:keys');
  check('nothing says plugged in', rows.every((r) => r[1] === ''));

  console.log('2. a gamepad');
  await page.evaluate(`window.__pads.push(${JSON.stringify(PADS.gamepad)}); true`);
  await page.until("window.__ui.padInfo.device === 'gamepad'", 10000);
  await page.sleep(1000);
  check('plugging it in opens no picker over the question', await page.evaluate("window.__ui.screen === 'flywith'"), await page.evaluate('window.__ui.screen'));
  const lit = JSON.parse(await rowsNow()).find((r) => r[0] === 'flywith:gamepad');
  check('A gamepad says plugged in', lit && lit[1] === 'Plugged in', JSON.stringify(lit));
  check('A gamepad is clicked', await clickRow("it.action === 'flywith:gamepad'"));
  await page.until("window.__ui.screen === 'howto'", 5000);
  check('How to fly opens on the radio or gamepad tab', await page.evaluate("window.__ui.howtoSource === 'radio'"));
  check('the answer is kept', (await answer()) === 'gamepad');
  await page.tap('Escape');
  await page.until("window.__ui.screen !== 'howto'", 5000);
  check('Back is the title', await page.evaluate("window.__ui.screen === 'title'"), await page.evaluate('window.__ui.screen'));
  await reload();
  await settle();
  check('a reload is the title: never asked again', await page.evaluate("window.__ui.screen === 'title'"), await page.evaluate('window.__ui.screen'));

  console.log('3. a radio');
  /* Two devices: the roster queues its picker at boot only for two or
   * more (src/input/padpick.js seed). */
  await firstVisit([PADS.radio, { ...PADS.radio, index: 1, id: 'TX16S Joystick (Vendor: 1209 Product: 4f54)' }]);
  await page.until("window.__ui.padInfo.device === 'radio'", 10000);
  await page.sleep(1000);
  check('a radio plugged in at boot: the question first, no picker before it', await page.evaluate("window.__ui.screen === 'flywith'"), await page.evaluate('window.__ui.screen'));
  const radio = JSON.parse(await rowsNow()).find((r) => r[0] === 'flywith:radio');
  check('A radio says plugged in', radio && radio[1] === 'Plugged in', JSON.stringify(radio));
  const onRadio = await cursorAction();
  check('and the cursor is on it', onRadio === 'flywith:radio', `${onRadio}, cursor ${await page.evaluate('window.__ui.cursor')}`);
  await page.tap('Enter');
  await page.until("window.__ui.screen === 'calibrate'", 5000);
  check('Enter opens the calibration wizard', true);
  check('the answer is kept', (await answer()) === 'radio');
  await page.tap('Escape');
  await page.until("window.__ui.screen !== 'calibrate'", 5000);
  check('Escape out of the wizard is the title', await page.evaluate("window.__ui.screen === 'title'"), await page.evaluate('window.__ui.screen'));

  console.log('4. skipped');
  await firstVisit([]);
  check('the question again', await page.evaluate("window.__ui.screen === 'flywith'"));
  await page.tap('Escape');
  await page.until("window.__ui.screen !== 'flywith'", 5000);
  check('Escape skips to the title', await page.evaluate("window.__ui.screen === 'title'"), await page.evaluate('window.__ui.screen'));
  check('the skip is kept', (await answer()) === 'skip');

  console.log('5. the Controller screen, from Settings and from the Hangar');
  await page.evaluate("window.__ui.show('pilot'); true");
  await page.until("window.__ui.screen === 'pilot'", 5000);
  const settingsActions = await page.evaluate("JSON.stringify(window.__ui.items().map((it) => it.action).filter(Boolean))");
  check('Settings lists none of what moved', !['choosepad', 'calibrate', 'calibrate-check', 'controls'].some((a) => settingsActions.includes(`"${a}"`)), settingsActions);
  check('Settings has a Controller row, clicked', await clickRow("it.action === 'controller'"));
  await page.until("window.__ui.screen === 'controller'", 5000);
  await page.tap('Escape');
  await page.until("window.__ui.screen !== 'controller'", 5000);
  check('Back is Settings', await page.evaluate("window.__ui.screen === 'pilot'"), await page.evaluate('window.__ui.screen'));
  await page.evaluate("window.__ui.show('title'); window.__ui.craftGate = true; window.__ui.mode = null; window.__ui.openHub('hangar'); true");
  const cards = await page.evaluate("JSON.stringify(window.__ui.hangarCards().map((c) => c.action))");
  check('the Hangar has one Controller card and no joystick or sticks cards',
    cards.includes('"controller"') && !cards.includes('"choosepad"') && !cards.includes('"calibrate"'), cards);
  await page.evaluate("window.__ui.act('controller'); true");
  await page.until("window.__ui.screen === 'controller'", 5000);
  await page.tap('Escape');
  await page.until("window.__ui.screen !== 'controller'", 5000);
  check('Back is the Hangar', await page.evaluate("window.__ui.screen === 'title' && window.__ui.hub === 'hangar'"), await page.evaluate('`${window.__ui.screen} ${window.__ui.hub}`'));

  console.log('6. a gamepad: recognised, its dead zone and expo');
  await page.evaluate(`window.__pads.length = 0; window.__pads.push(${JSON.stringify(PADS.gamepad)}); true`);
  await page.until("window.__ui.padInfo.device === 'gamepad'", 10000);
  await settle();
  await page.evaluate("window.__ui.act('controller'); true");
  await page.until("window.__ui.screen === 'controller'", 5000);
  const row = (action) => page.evaluate(`JSON.stringify(window.__ui.items().find((it) => ${action}) || null)`);
  const recognised = JSON.parse(await row("it.label === 'Recognised as'"));
  check('recognised as a standard gamepad', recognised && recognised.value === 'Standard gamepad', JSON.stringify(recognised));
  check('it has an Expo row', JSON.parse(await row("it.label === 'Expo'")) !== null);
  const dz = await page.evaluate("window.__ui.items().findIndex((it) => it.label === 'Dead zone')");
  await page.evaluate(`window.__ui.setCursor(${dz}); true`);
  await page.tap('ArrowRight');
  await page.until('window.__input.feel.deadZone === 2', 5000);
  check('the arrow key sets a 2 percent dead zone', true);
  check('the row says so', JSON.parse(await row("it.label === 'Dead zone'")).value === '2%');
  const stick = async (v) => {
    await page.evaluate(`(() => { const p = window.__pads[0]; p.axes[2] = ${v}; p.timestamp += 1; return true; })()`);
    await page.sleep(150);
    return page.evaluate('window.__input.channels.roll');
  };
  const small = await stick(0.015);
  const half = await stick(0.51);
  await stick(0);
  check('a stick at 1.5 percent reads zero', small === 0, String(small));
  check('a stick at 51 percent reads 50', Math.abs(half - 0.5) < 1e-9, String(half));
  const stored = await page.evaluate("localStorage.getItem('fdfpv.stick_maps.v2')");
  check('stored with the device, beside its calibrations', /"feel":\{"045e:0b13:Xbox Wireless Controller":\{"deadZone":2,"expo":0\}\}/.test(stored || ''), stored);
  check('and its built-in layout is still uncalibrated', await page.evaluate('window.__input.map.stored === false'));

  console.log('7. a radio: no expo, the wizard and keys come back here');
  await page.evaluate(`window.__pads.length = 0; window.__pads.push(${JSON.stringify(PADS.radio)}); true`);
  await page.until("window.__ui.padInfo.device === 'radio'", 10000);
  await settle();
  if (await page.evaluate("window.__ui.screen !== 'controller'")) {
    await page.evaluate("window.__ui.act('controller'); true");
    await page.until("window.__ui.screen === 'controller'", 5000);
  }
  const radioRow = JSON.parse(await row("it.label === 'Recognised as'"));
  check('recognised as an EdgeTX or OpenTX radio', radioRow && radioRow.value === 'EdgeTX or OpenTX radio', JSON.stringify(radioRow));
  check('no Expo row on a radio', JSON.parse(await row("it.label === 'Expo'")) === null);
  const builtin = JSON.parse(await row("it.action === 'controller-builtin'"));
  check('the built-in layout is greyed until calibrated', builtin && builtin.disabled === true && builtin.value === 'In use', JSON.stringify(builtin));
  check('Calibrate sticks, clicked', await clickRow("it.action === 'calibrate'"));
  await page.until("window.__ui.screen === 'calibrate'", 5000);
  await page.tap('Escape');
  await page.until("window.__ui.screen !== 'calibrate'", 5000);
  check('Escape out of the wizard is the Controller', await page.evaluate("window.__ui.screen === 'controller'"), await page.evaluate('window.__ui.screen'));
  check('Keys and buttons, clicked', await clickRow("it.action === 'controls'"));
  await page.until("window.__ui.screen === 'controls'", 5000);
  await page.tap('Escape');
  await page.until("window.__ui.screen !== 'controls'", 5000);
  check('Back from Keys and buttons is the Controller', await page.evaluate("window.__ui.screen === 'controller'"), await page.evaluate('window.__ui.screen'));

  console.log('8. rates per aircraft class');
  const pickCraft = (id) => page.evaluate(`(() => {
    const ui = window.__ui;
    ui.openCraftRow(false);
    const c = ui.carousel;
    c.setFilter('all');
    c.goTo(c.ids.indexOf('${id}'));
    c.chooseBtn.click();
    return ui.settings.airframe;
  })()`);
  const OWN = { type: 'ACTUAL', roll: { rcRate: 8, srate: 80, expo: 20 }, pitch: { rcRate: 8, srate: 80, expo: 20 }, yaw: { rcRate: 6, srate: 50, expo: 10 } };
  const profileNow = () => page.evaluate("JSON.parse(localStorage.getItem('webfpv.settings.v3'))");
  const ratesHeading = () => page.evaluate("(window.__ui.items().find((it) => it.id === 'controller:s-rates') || {}).label || null");
  await page.evaluate("window.__ui.act('controller'); true");
  await page.until("window.__ui.screen === 'controller'", 5000);
  check('the interceptor is chosen in the picker', (await pickCraft('interceptor')) === 'interceptor');
  check('the heading names its class', (await ratesHeading()) === 'How the sticks fly, every multirotor', await ratesHeading());
  await page.evaluate(`(() => { const ui = window.__ui; ui.settings.rates = { ...ui.settings.rates, ...${JSON.stringify(OWN)} }; ui.writeSettings(); return true; })()`);
  const own = (await profileNow()).rates;
  check('own rates on it', own.roll.srate === 80, JSON.stringify(own.roll));
  check('the Cub is chosen in the picker', (await pickCraft('cub1400')) === 'cub1400');
  let st = await profileNow();
  check('the Cub flies stock rates, not the quad\'s', st.rates.roll.srate === 67 && st.rates.yaw.srate === 67, JSON.stringify(st.rates.roll));
  check('the quad\'s are kept under multirotor', st.ratesFor && st.ratesFor.multirotor && st.ratesFor.multirotor.roll.srate === 80, JSON.stringify(st.ratesFor));
  check('the heading is the Cub\'s own throws', (await ratesHeading()) === 'How the sticks fly, this aircraft', await ratesHeading());
  check('the interceptor is chosen again', (await pickCraft('interceptor')) === 'interceptor');
  st = await profileNow();
  check('its own rates are back', st.rates.roll.srate === 80 && st.rates.yaw.srate === 50, JSON.stringify(st.rates.roll));

  const errs = page.errors.filter((e) => !e.startsWith('network:'));
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) {
  failed += 1;
  console.log(`  FAIL  ${e.message}`);
  console.log(`  note  page errors: ${page.errors.slice(0, 5).join(' | ')}`);
} finally {
  await page.close();
}

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
