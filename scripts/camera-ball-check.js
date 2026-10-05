#!/usr/bin/env node
/*
 * camera-ball-check.js: `SIM_GPU=1 npm run camera:ball -- <outdir>`, the
 * camera ball in the real shell (src/avionics/camball.js wired by
 * src/main.js). One headless page: the Bramor on swiss2, its fourth view
 * on C, and the keys.
 *
 *   - C reaches the ball's view on an aircraft that carries one; the
 *     quiet HUD (src/ui/opshud.js) is up over it and nowhere else
 *   - Q / E pan, Y / H tilt, = / - zoom the lens: the screen's camera
 *     follows, its field narrowing with the zoom
 *   - U locks the ground under the cross: through the screen's own
 *     camera (three.js's projection) the locked point sits inside 1 % of
 *     the frame from centre, as camera:lock's Node half says it must
 *   - the camera the room would be told (aim, tanHalf, aspect) is the
 *     screen's: tanHalf is the lens's over the sensor's digital zoom (K)
 *   - J changes the sensor's mode; leaving the view gives the sensor its
 *     own settings back; no page errors
 * Pictures of the view in EO and white hot go to <outdir>, outside the
 * repository.
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

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { ballFor } from '../src/avionics/camball.js';
import { worldFor } from '../src/share/ops/missions.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outArg = process.argv[2];
if (!outArg) {
  throw new Error('camera-ball-check: name a folder for the pictures, outside the repository');
}
const outDir = resolve(outArg);
if (outDir === root || outDir.startsWith(`${root}/`)) {
  throw new Error(`camera-ball-check: ${outDir} is inside the repository; pictures go outside it`);
}
await mkdir(outDir, { recursive: true });

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
}

const seated = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'bramor2300');
Object.assign(seated, {
  map: 'swiss2', graphics: 'low', graphicsAuto: false, fpsCap: 0, airframeAsked: true, wingView: 'fpv',
});
const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, ${JSON.stringify(seated)});
  localStorage.setItem(k, JSON.stringify(s));
  localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
} catch (e) { /* storage refused */ }`];

const W = 1280;
const H = 720;
const page = await openPage({
  root, width: W, height: H, url: '/index.html?rooms=off', seed,
});
async function hold(code, ms, key = code, vk = 0) {
  const info = {
    code, key, windowsVirtualKeyCode: vk,
  };
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...info }, page.sessionId);
  await page.sleep(ms);
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...info }, page.sessionId);
  await page.sleep(80);
}
async function shot(name) {
  const r = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(outDir, name), Buffer.from(r.data, 'base64'));
}
const ball = () => page.evaluate('window.__ops.ball()');

try {
  await page.until('!!window.__shellReady', 300000);
  await page.until('window.__map && window.__map().ready', 400000);
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight' && window.__map().ready", 400000);
  await page.sleep(1500);
  check('the Bramor carries a ball', Boolean(ballFor('bramor2300')));
  for (let i = 0; i < 3; i += 1) {
    await page.tap('KeyC');
    await page.sleep(150);
  }
  /* The intro shot (src/main.js INTRO_TOTAL) holds the camera first. */
  await page.until('window.__ops.ball() && window.__ops.ball().on', 60000).catch(() => {});
  await page.sleep(600);
  const s0 = await page.evaluate('({ view: window.__ui.settings.wingView, hud: window.__opsHud(), sensor: window.__sensors.state.mainView, stab: window.__sensors.state.stab })');
  const b0 = await ball();
  check('C reaches the ball\'s view', s0.view === 'ball' && b0 && b0.on, JSON.stringify({ view: s0.view, on: b0 && b0.on }));
  check('the quiet HUD is up over it', s0.hud.on && s0.hud.marks.some((m) => m.kind === 'reticle') && s0.hud.marks.some((m) => m.kind === 'survey'));
  check('the sensor is full screen with no electronic turn on the gimbal', s0.sensor === 'sensor' && s0.stab === false);
  await shot('ball-eo.png');

  await hold('KeyE', 600, 'e', 69);
  const b1 = await ball();
  check('E pans right', b1.pan > b0.pan + 0.05, `${b0.pan.toFixed(3)} to ${b1.pan.toFixed(3)}`);
  await hold('KeyH', 600, 'h', 72);
  const b2 = await ball();
  check('H tilts down', b2.tilt < b1.tilt - 0.05, `${b1.tilt.toFixed(3)} to ${b2.tilt.toFixed(3)}`);
  await hold('Equal', 900, '=', 187);
  const b3 = await ball();
  check('= zooms the lens in', b3.zoom > b2.zoom * 1.5, `${b2.zoom.toFixed(2)}x to ${b3.zoom.toFixed(2)}x`);
  const cam1 = await page.evaluate('window.__ops.cam()');
  const lens = Math.tan(ballFor('bramor2300').hfov / 2) / b3.zoom;
  check('the room\'s tanHalf is the lens\'s at 1x digital', cam1 && Math.abs(cam1.tanHalf - lens) / lens < 0.02, `${cam1 && cam1.tanHalf.toFixed(4)} vs ${lens.toFixed(4)}`);
  check('the room\'s aspect is the screen\'s', cam1 && Math.abs(cam1.aspect - W / H) < 0.01, cam1 && cam1.aspect.toFixed(3));
  await page.tap('KeyK');
  await page.sleep(200);
  const cam2 = await page.evaluate('window.__ops.cam()');
  const b4 = await ball();
  const lens2 = Math.tan(ballFor('bramor2300').hfov / 2) / b4.zoom;
  check('K: the digital zoom halves the room\'s tanHalf', Math.abs(cam2.tanHalf - lens2 / 2) / lens2 < 0.02, `${cam2.tanHalf.toFixed(4)} vs ${(lens2 / 2).toFixed(4)}`);

  await page.tap('KeyU');
  await page.sleep(300);
  const b5 = await ball();
  check('U locks the ground under the cross', Boolean(b5.lock), JSON.stringify(b5.lock));
  let worst = 0;
  for (let i = 0; i < 20; i += 1) {
    const n = await page.evaluate('window.__ops.lockNdc()');
    worst = Math.max(worst, n ? Math.max(Math.abs(n.x), Math.abs(n.y)) : Infinity);
    await page.sleep(100);
  }
  check('the lock sits inside 1 % of centre through the screen\'s own camera', worst <= 0.01, `worst ${worst.toExponential(2)}`);
  const hud1 = await page.evaluate('window.__opsHud()');
  check('the HUD says the ball is locked', hud1.marks.some((m) => m.kind === 'lock') && Boolean(hud1.read.lock));
  await page.tap('KeyJ');
  await page.sleep(400);
  const mode = await page.evaluate('window.__sensors.state.mode');
  check('J changes the sensor\'s mode', mode !== 'eo', mode);
  await page.sleep(600);
  await shot('ball-ir-locked.png');
  await page.tap('KeyU');
  await page.sleep(200);
  check('U again frees it', !(await ball()).lock);

  await page.tap('KeyC');
  await page.sleep(500);
  const s1 = await page.evaluate('({ view: window.__ui.settings.wingView, hud: window.__opsHud().on, sensor: window.__sensors.state.mainView, stab: window.__sensors.state.stab, on: window.__ops.ball().on })');
  check('C leaves the ball: its HUD down, the sensor its own again', s1.view === 'fpv' && !s1.hud && !s1.on && s1.sensor === 'eo' && s1.stab === true, JSON.stringify(s1));
  /* The ops world a screen frames and captures against
   * (src/share/opsworlds.js), built in the page from the bytes it fetches,
   * agrees with the room's built from disk: ground, crowns, a route. */
  const OW = worldFor('interior');
  const probes = [[2000, 3000], [9000, 9000], [11900, 10500], [6000, 4000], [11300, 9800]];
  const pairs = probes.map(([x, y]) => [[x, y, OW.groundAt(x, y) + 400], [x + 30, y + 20, OW.groundAt(x + 30, y + 20) + 1]]);
  const room = {
    ground: probes.map(([x, y]) => OW.groundAt(x, y)),
    blocks: pairs.map(([a, b]) => OW.canopyBlocks(a, b)),
    route: OW.poseOnRoute('conceal-mid-a', 60000),
  };
  const browser = await page.evaluate(`(async () => {
    const { opsWorldOf } = await import('/src/share/opsworlds.js');
    let w = null;
    for (let i = 0; i < 200 && !w; i += 1) {
      w = opsWorldOf('interior');
      if (!w) { await new Promise((r) => setTimeout(r, 100)); }
    }
    if (!w) { return null; }
    return {
      ground: ${JSON.stringify(probes)}.map(([x, y]) => w.groundAt(x, y)),
      blocks: ${JSON.stringify(pairs)}.map(([a, b]) => w.canopyBlocks(a, b)),
      route: w.poseOnRoute('conceal-mid-a', 60000),
    };
  })()`);
  check('the ops world builds in the page from the fetched bytes and agrees with the room\'s', browser && JSON.stringify(browser) === JSON.stringify(room),
    JSON.stringify({ room, browser }).slice(0, 300));
  const errs = page.errors.filter((e) => !e.startsWith('network:'));
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await page.close();
}
console.log(`\n${passed} passed, ${failed} failed (pictures in ${outDir})`);
process.exit(failed ? 1 : 0);
