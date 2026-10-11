#!/usr/bin/env node
/*
 * foot-walk-check.js: `npm run foot:walk`, the pilot on foot in the real
 * shell, headless, on swiss2 in free flight (docs/ON-FOOT.md).
 *
 *     SIM_GPU=1 node scripts/foot-walk-check.js [OUT_DIR] [--only=keyboard,pad,touch]
 *
 * keyboard  An Extra parked at the spawn. Rolling, the foot key is
 *           refused. Stopped, it steps out onto the pilot's spot: the
 *           camera at 1.64 m over the ground, the sticks centred. The
 *           crash cam's ring stops at the step out. Held W walks 1.4 m/s
 *           and Shift W runs 2.5 m/s, each within 7 %, measured after the
 *           half second ramp. Run at the hangar, the eye stays 1.64 m over
 *           the terrain every sample of the way, and the hangar's wall
 *           stops the body outside it. The foot key flies again: the
 *           aircraft as it was left, the pilot view from where the pilot
 *           stands, a new clip, and a recovery of the craft (resetCraft
 *           with a new spot, what a clip crash does) leaves the pilot
 *           where they stood. Escape on foot pauses and resumes on foot.
 * pad       A standard pad: B held steps out, the left stick walks,
 *           the right stick turns, View held flies again.
 * touch     A phone: the Step out chip, the left thumb walks, the right
 *           thumb turns, the Fly chip.
 * Pictures go to OUT_DIR.
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

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openPage, keyInfo } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { EYE_HEIGHT, RUN_SPEED, WALK_SPEED } from '../src/game/human.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : join(tmpdir(), 'foot-walk-check');
mkdirSync(out, { recursive: true });

/* The swiss2 field hangar's centre and its footprint's smaller half
 * (24 x 30 m, src/maps/alps/village.js and swiss2/buildings/hangar.js). */
const HANGAR = { x: 44, z: -70, half: 12 };
const PACE_TOL = 0.07;
const EYE_TOL = 0.02;

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
}

function seedFor(lang) {
  const s = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'extra3d1308');
  Object.assign(s, {
    map: 'swiss2', graphics: 'low', fpsCap: 0, airframeAsked: true, wingView: 'pilot',
  });
  return `try {
    const s = JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}) || '{}');
    Object.assign(s, ${JSON.stringify(s)});
    localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, JSON.stringify(s));
    localStorage.setItem('fdfpv.lang', ${JSON.stringify(lang)});
  } catch (e) { /* storage refused */ }`;
}

/* A standard pad the page reads through getGamepads, its buttons and
 * axes set by the check. */
const PAD = `(() => {
  const pad = {
    id: 'foot check pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
    axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  };
  window.__pad = pad;
  navigator.getGamepads = () => [pad];
})();`;

async function fly(page) {
  await page.until('!!window.__shellReady', 300000);
  await page.until('window.__map && window.__map().ready', 400000);
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight' && window.__map().ready", 400000);
  await page.sleep(1000);
}

const footState = (page) => page.evaluate('window.__foot.state()');
const craft = (page) => page.evaluate(`(() => { const c = window.__craftState();
  return { landed: c.landed, x: c.worldX, y: c.worldY, z: c.worldZ, camera: c.camera, notice: c.notice, speed: c.speed }; })()`);
const frames = (page) => page.evaluate('window.__crashCam.stats().frames');
const ringFrames = (page) => page.evaluate('window.__crashCam.stats().ringFrames');
async function shot(page, name) {
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  writeFileSync(join(out, `${name}.png`), Buffer.from(data, 'base64'));
}
const towardHangar = (w) => Math.atan2(HANGAR.x - w.x, -(HANGAR.z - w.z));

/* Pace over a window after the ramp, on the walk's own clock and on the
 * wall's (which a frame capped at 100 ms would make short). */
async function measurePace(page, keys, ms) {
  const key = (type, code) => page.cdp.send('Input.dispatchKeyEvent', { type, ...keyInfo(code) }, page.sessionId);
  for (const k of keys) {
    await key('keyDown', k);
  }
  await page.sleep(1200);
  const a = (await footState(page)).walker;
  await page.sleep(ms);
  const b = (await footState(page)).walker;
  for (const k of keys.slice().reverse()) {
    await key('keyUp', k);
  }
  await page.sleep(800);
  return (b.odo - a.odo) / (b.t - a.t);
}

async function keyboardCase() {
  console.log('keyboard:');
  const page = await openPage({ root, width: 1280, height: 720, url: '/index.html', seed: [seedFor('en')] });
  const key = (type, code) => page.cdp.send('Input.dispatchKeyEvent', { type, ...keyInfo(code) }, page.sessionId);
  try {
    await fly(page);
    let f = await footState(page);
    check('free flight on swiss2 allows a step out, and parked at the spawn it may', f.allowed && f.could);

    /* Rolling: refused. */
    await page.evaluate('window.__stick(0, 0, 0, 0.8)');
    await page.until('!window.__craftState().landed', 15000).catch(() => {});
    await page.sleep(300);
    await page.tap('Digit1');
    await page.sleep(300);
    f = await footState(page);
    const rolling = await craft(page);
    check('rolling under power, the foot key is refused', !f.on && !rolling.landed, `speed ${rolling.speed.toFixed(2)}, "${rolling.notice}"`);
    await page.evaluate('window.__stick()');
    await page.tap('KeyR');
    await page.until('window.__craftState().landed && window.__foot.state().could', 20000);
    await page.sleep(500);

    /* Out. */
    const parked = await craft(page);
    const framesOut = await frames(page);
    await page.tap('Digit1');
    await page.until('window.__foot.state().on', 5000);
    f = await footState(page);
    check('stopped, the foot key steps out onto the pilot\'s spot', Math.hypot(f.walker.x - f.spot.x, f.walker.z - f.spot.z) < 0.01,
      `at ${f.walker.x.toFixed(2)}, ${f.walker.z.toFixed(2)}`);
    check('the camera is the pilot\'s eye, 1.64 m over the ground', Math.abs(f.camera[1] - f.ground - EYE_HEIGHT) < 1e-6 && f.fov === 70,
      `eye ${(f.camera[1] - f.ground).toFixed(3)} m, fov ${f.fov}`);
    check('the sticks are the walk\'s, not the aircraft\'s', f.source === 'the pilot on foot', f.source);
    await shot(page, 'stepped-out');
    await page.sleep(1000);
    const framesOn = await frames(page);
    check('the crash cam\'s clip ends at the step out', framesOn - framesOut <= 2, `${framesOn - framesOut} frames recorded on foot`);

    /* Pace. */
    await page.evaluate(`window.__foot.face(${towardHangar(f.walker)})`);
    const walk = await measurePace(page, ['KeyW'], 4000);
    check(`held W walks ${WALK_SPEED} m/s within 7 %`, Math.abs(walk / WALK_SPEED - 1) <= PACE_TOL, `${walk.toFixed(3)} m/s`);
    f = await footState(page);
    await page.evaluate(`window.__foot.face(${towardHangar(f.walker)})`);
    const run = await measurePace(page, ['ShiftLeft', 'KeyW'], 4000);
    check(`Shift W runs ${RUN_SPEED} m/s within 7 %`, Math.abs(run / RUN_SPEED - 1) <= PACE_TOL, `${run.toFixed(3)} m/s`);

    /* At the hangar, the eye on the terrain all the way. */
    f = await footState(page);
    const odo0 = f.walker.odo;
    let worstEye = 0;
    let samples = 0;
    let lastOdo = -1;
    let stalledMs = 0;
    await key('keyDown', 'ShiftLeft');
    await key('keyDown', 'KeyW');
    const t0 = Date.now();
    while (Date.now() - t0 < 120000 && stalledMs < 1500) {
      f = await footState(page);
      await page.evaluate(`window.__foot.face(${towardHangar(f.walker)})`);
      if (f.walker.vy === 0) {
        worstEye = Math.max(worstEye, Math.abs(f.camera[1] - f.ground - EYE_HEIGHT));
        samples += 1;
      }
      stalledMs = f.walker.odo - lastOdo < 0.02 ? stalledMs + 200 : 0;
      lastOdo = f.walker.odo;
      await page.sleep(200);
    }
    await key('keyUp', 'KeyW');
    await key('keyUp', 'ShiftLeft');
    await page.sleep(500);
    f = await footState(page);
    const path = f.walker.odo;
    check('the eye stays 1.64 m over the terrain on the way', worstEye <= EYE_TOL && samples > 50,
      `worst off ${worstEye.toFixed(4)} m over ${samples} samples, ${path.toFixed(1)} m walked in all (${(path - odo0).toFixed(1)} m on this leg)`);
    const fromHangar = Math.hypot(f.walker.x - HANGAR.x, f.walker.z - HANGAR.z);
    check('the hangar\'s wall stops the body outside it', f.touching === 'wall' && f.inside <= 1e-4 && fromHangar >= HANGAR.half,
      `against ${f.touching}, ${fromHangar.toFixed(2)} m from the hangar's centre, ${f.inside.toExponential(1)} m in`);
    await shot(page, 'at-the-hangar');

    /* Pause on foot. */
    await page.tap('Escape');
    const paused = await page.until("window.__ui.screen === 'paused'", 5000).then(() => true, () => false);
    await page.tap('Escape');
    const back = await page.until("window.__ui.screen === 'flight'", 5000).then(() => true, () => false);
    check('Escape on foot pauses, and resumes on foot', paused && back && (await footState(page)).on);

    /* Fly again from here. */
    const stood = (await footState(page)).walker;
    const framesBefore = await ringFrames(page);
    await page.tap('Digit1');
    await page.until('!window.__foot.state().on', 5000);
    await page.sleep(800);
    f = await footState(page);
    const again = await craft(page);
    check('the foot key flies again with the aircraft as it was left',
      again.landed && Math.hypot(again.x - parked.x, again.y - parked.y, again.z - parked.z) < 1e-6 && f.source !== 'the pilot on foot',
      `moved ${Math.hypot(again.x - parked.x, again.z - parked.z).toExponential(1)} m, sticks from ${f.source}`);
    check('the pilot view looks from where the pilot stands', Math.hypot(again.camera.x - stood.x, again.camera.z - stood.z) < 1e-6
      && Math.abs(again.camera.y - stood.feet - EYE_HEIGHT) < 1e-6, `camera ${again.camera.x.toFixed(2)}, ${again.camera.y.toFixed(2)}, ${again.camera.z.toFixed(2)}`);
    const framesAfter = await ringFrames(page);
    check('flying again starts a new clip', framesAfter < framesBefore, `${framesBefore} rows at the step out, ${framesAfter} now`);
    await page.evaluate(`window.__respawn(${parked.x + 30}, ${parked.z - 20}, 1.0)`);
    await page.sleep(800);
    const moved = await craft(page);
    check('a recovery of the craft leaves the pilot where they stood (the teleport, main.js:12626)',
      Math.hypot(moved.camera.x - stood.x, moved.camera.z - stood.z) < 1e-6 && Math.hypot(moved.x - parked.x, moved.z - parked.z) > 20,
      `camera ${moved.camera.x.toFixed(2)}, ${moved.camera.z.toFixed(2)}; craft ${moved.x.toFixed(1)}, ${moved.z.toFixed(1)}`);
    await shot(page, 'flying-again');
    const faults = page.errors.filter((e) => !e.startsWith('network:'));
    check('no console error', faults.length === 0, faults[0] || '');
  } finally {
    await page.close();
  }
}

async function padCase() {
  console.log('pad:');
  const page = await openPage({ root, width: 1280, height: 720, url: '/index.html', seed: [seedFor('es'), PAD] });
  const holdB = (on) => page.evaluate(`(window.__pad.buttons[1] = { pressed: ${on}, value: ${on ? 1 : 0} }, window.__pad.timestamp += 1, true)`);
  const axes = (a) => page.evaluate(`(window.__pad.axes = ${JSON.stringify(a)}, window.__pad.timestamp += 1, true)`);
  try {
    await fly(page);
    await holdB(true);
    const out = await page.until('window.__foot.state().on', 5000).then(() => true, () => false);
    await holdB(false);
    check('B held steps out', out);
    if (!out) {
      return;
    }
    const a = (await footState(page)).walker;
    await axes([0, -1, 1, 0]);
    await page.sleep(2000);
    await axes([0, 0, 0, 0]);
    await page.sleep(600);
    const b = (await footState(page)).walker;
    check('the left stick walks and the right stick turns', b.odo - a.odo > 1 && Math.abs(b.heading - a.heading) > 1,
      `${(b.odo - a.odo).toFixed(2)} m, turned ${(b.heading - a.heading).toFixed(2)} rad`);
    await holdB(true);
    const back = await page.until('!window.__foot.state().on', 5000).then(() => true, () => false);
    await holdB(false);
    check('B held again flies', back);
    const faults = page.errors.filter((e) => !e.startsWith('network:'));
    check('no console error', faults.length === 0, faults[0] || '');
  } finally {
    await page.close();
  }
}

async function touchCase() {
  console.log('touch:');
  const page = await openPage({
    root, width: 844, height: 390, touch: true, url: '/index.html', seed: [seedFor('es')],
  });
  const finger = (type, points) => page.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points }, page.sessionId);
  const chip = () => page.evaluate(`(() => { const b = document.querySelector('.touch-foot');
    if (!b || b.hidden) { return null; } const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: b.textContent }; })()`);
  async function tapChip() {
    const at = await chip();
    if (!at) {
      return null;
    }
    await finger('touchStart', [{ x: at.x, y: at.y }]);
    await page.sleep(80);
    await finger('touchEnd', []);
    return at.text;
  }
  try {
    await fly(page);
    const said = await tapChip();
    const out = await page.until('window.__foot.state().on', 5000).then(() => true, () => false);
    check('the Step out chip steps out', out && said === 'Bajarse', `chip "${said}"`);
    if (!out) {
      return;
    }
    const a = (await footState(page)).walker;
    /* Left thumb up, right thumb right, together. */
    await finger('touchStart', [{ x: 150, y: 250, id: 1 }, { x: 690, y: 250, id: 2 }]);
    for (let k = 1; k <= 5; k += 1) {
      await finger('touchMove', [{ x: 150, y: 250 - k * 20, id: 1 }, { x: 690 + k * 15, y: 250, id: 2 }]);
      await page.sleep(40);
    }
    await page.sleep(2000);
    await finger('touchEnd', []);
    await page.sleep(600);
    const b = (await footState(page)).walker;
    check('the left thumb walks and the right thumb turns', b.odo - a.odo > 1 && b.heading - a.heading > 0.5,
      `${(b.odo - a.odo).toFixed(2)} m, turned ${(b.heading - a.heading).toFixed(2)} rad`);
    await shot(page, 'touch-on-foot');
    const fly2 = await tapChip();
    const back = await page.until('!window.__foot.state().on', 5000).then(() => true, () => false);
    check('the Fly chip flies again', back && fly2 === 'Volar', `chip "${fly2}"`);
    const faults = page.errors.filter((e) => !e.startsWith('network:'));
    check('no console error', faults.length === 0, faults[0] || '');
  } finally {
    await page.close();
  }
}

/* Cases by --only=keyboard,pad, never by position: a folder path with a
 * space, split by a shell, once made its second half a case filter that
 * matched nothing and passed. */
const CASES = [['keyboard', keyboardCase], ['pad', padCase], ['touch', touchCase]];
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.slice('--only='.length).split(',') : CASES.map(([id]) => id);
const unknown = only.filter((id) => !CASES.some(([c]) => c === id));
if (unknown.length) {
  console.error(`foot-walk-check: no case ${unknown.join(', ')}`);
  process.exit(1);
}
for (const [id, run] of CASES) {
  if (only.includes(id)) {
    await run();
  }
}
console.log(`foot-walk-check: ${passed} passed, ${failed} failed; pictures in ${out}`);
process.exit(failed || !passed ? 1 : 0);
