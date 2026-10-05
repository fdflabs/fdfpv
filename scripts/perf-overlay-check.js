/*
 * perf-overlay-check.js: the frame readout (src/ui/perfoverlay.js) is off
 * until asked for, F3 and the setting both show and hide it, and what it
 * prints agrees with the shell's own numbers and with frame intervals this
 * script times itself.
 *
 *     node scripts/perf-overlay-check.js        (npm run perf:overlay)
 *
 * It seeds Quality mode, where dynamic resolution never acts, so a GPU
 * number on the readout proves the readout's own request for the timer
 * (dynres.js setWatch), not the controller's. On a software rasteriser,
 * which has no timer, the GPU line must say so instead. SIM_GPU=1 runs it
 * on this machine's GPU.
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

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';
import { str } from '../src/strings/index.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const page = await openPage({
  root,
  width: 1600,
  height: 900,
  url: '/index.html?map=alps',
  seed: [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    if (!sessionStorage.getItem('ovSeeded')) {
      sessionStorage.setItem('ovSeeded', '1');
      const s = JSON.parse(localStorage.getItem(k) || '{}');
      Object.assign(s, { graphics: 'high', graphicsAuto: false, perfMode: 'quality', fpsCap: 0 });
      delete s.perfOverlay;
      localStorage.setItem(k, JSON.stringify(s));
    }
  } catch (e) { /* Storage refused. The run still boots. */ }
  /* Every animation frame's timestamp, for the fps this script works out
   * itself. */
  (() => {
    const ts = globalThis.__ovTs = [];
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { if (cb.name === 'frame') { ts.push(t); if (ts.length > 4000) { ts.splice(0, 2000); } } return cb(t); });
  })();`],
});

let failed = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`);
  if (!ok) {
    failed += 1;
  }
}
const read = async () => JSON.parse(await page.evaluate('JSON.stringify(window.__perfOverlay())'));
const shown = () => page.evaluate("getComputedStyle(document.querySelector('.perf-ov')).display !== 'none'");

try {
  await page.until('!!window.__perfOverlay && !!window.__boot && window.__boot().frames > 30', 180000);
  await page.until('window.__map && window.__map().ready', 300000);
  const gpu = JSON.parse(await page.evaluate('JSON.stringify({ timer: window.__dynres().gpu, name: window.__gpu && window.__gpu.raw })'));
  console.log(`renderer ${JSON.stringify(gpu.name)}; timer query ${gpu.timer ? 'present' : 'absent'}`);

  const o0 = await read();
  check('off by default', o0.on === false && !(await shown()), `on ${o0.on}`);
  check('nothing asks for the GPU timer while it is off, in Quality', (await page.evaluate('window.__dynres().watch')) === false
    && (await page.evaluate('window.__dynres().enabled')) === false, 'watch false, enabled false');

  await page.tap('F3');
  await page.until('window.__perfOverlay().on === true', 5000);
  check('F3 shows it', await shown(), 'display block');
  check('and keeps it, in the settings', await page.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})).perfOverlay === true`), 'stored perfOverlay true');

  /* Two seconds of frames, then the readout against the shell and
   * against the frame timestamps taken above. */
  await page.sleep(2500);
  /* A software rasteriser draws a few frames a second and hitches past the
   * readout's two second gap while it compiles; wait for ten in a row. */
  await page.until('window.__perfOverlay().frames >= 10', 60000);
  const o = await read();
  const stats = JSON.parse(await page.evaluate('JSON.stringify({ r: window.__renderStats(), d: window.__dynres(), cap: window.__ui.settings.fpsCap })'));
  const own = JSON.parse(await page.evaluate(`(() => {
    const ts = globalThis.__ovTs;
    const iv = [];
    for (let i = 1; i < ts.length; i += 1) { iv.push(ts[i] - ts[i - 1]); }
    /* The readout's own window: newest back until a second is covered. */
    let sum = 0;
    let k = 0;
    for (; k < iv.length && sum < 1000; k += 1) { sum += iv[iv.length - 1 - k]; }
    return JSON.stringify({ fps: (1000 * k) / sum, n: k });
  })()`));
  console.log(`readout:\n${o.text}`);
  const lines = o.text.split('\n');
  check('four lines of text', lines.length === 4 && lines.every((l) => l.trim().length > 0), JSON.stringify(lines));
  check('fps, 1% low and frame ms are real numbers', o.fps > 1 && o.low > 0 && o.frameMs > 0 && Math.abs(o.fps * o.frameMs - 1000) < 1,
    `fps ${o.fps.toFixed(1)}, 1% low ${o.low.toFixed(1)}, frame ${o.frameMs.toFixed(2)} ms over ${o.frames} frames`);
  check('the 1% low is no faster than the mean', o.low <= o.fps * 1.02, `${o.low.toFixed(1)} against ${o.fps.toFixed(1)}`);
  /* The two windows end up to a quarter second apart (the text is rebuilt
   * four times a second), so they may differ by a frame or so: 10 percent,
   * or a frame and a half of the window where a second holds few frames. */
  const tol = Math.max(0.1, 1.5 / own.n);
  check('its fps agrees with the frame timestamps', Math.abs(o.fps - own.fps) / own.fps < tol,
    `${o.fps.toFixed(1)} against ${own.fps.toFixed(1)} over the last ${own.n} intervals, within ${(tol * 100).toFixed(0)} %`);
  check('CPU is the callback\'s time, inside the frame', o.cpuMs > 0 && o.cpuMs <= o.frameMs * 1.05, `${o.cpuMs.toFixed(2)} ms`);
  check('draw calls and triangles are the renderer\'s', o.calls > 0 && o.tris > 0
    && Math.abs(o.calls - stats.r.calls) <= Math.max(10, stats.r.calls * 0.3), `readout ${o.calls} calls ${o.tris} tris, renderer ${stats.r.calls} calls ${stats.r.triangles} tris`);
  check('render scale and cap are dynres\'s and the setting\'s', o.scale === stats.d.scale && o.cap === stats.cap, `scale ${o.scale}, cap ${o.cap}`);
  const software = /swiftshader/i.test(String(gpu.name));
  if (gpu.timer && !software) {
    check('GPU time in Quality, from the readout\'s own request', stats.d.watch === true && o.gpuMs > 0 && o.gpuMs < 200, `${o.gpuMs.toFixed(2)} ms, watch ${stats.d.watch}`);
  } else {
    /* SwiftShader offers the extension and answers some of the time. */
    check('no GPU timer, or a software one: a time, or the GPU line says there is none',
      o.gpuMs > 0 || lines[1].includes(str('perf.na')), lines[1]);
  }
  const box = JSON.parse(await page.evaluate("JSON.stringify(document.querySelector('.perf-ov').getBoundingClientRect())"));
  check('small, low on the left, over the pack readout', box.left < 40 && box.bottom <= 900 - 90 && box.bottom > 900 - 200 && box.width < 420 && box.height < 120,
    `${Math.round(box.width)} by ${Math.round(box.height)} at ${Math.round(box.left)}, ${Math.round(box.top)}`);
  check('never takes a click', (await page.evaluate("getComputedStyle(document.querySelector('.perf-ov')).pointerEvents")) === 'none', 'pointer-events none');

  await page.tap('F3');
  await page.until('window.__perfOverlay().on === false', 5000);
  check('F3 again hides it', !(await shown()), 'display none');
  check('and lets the timer go', (await page.evaluate('window.__dynres().watch')) === false, 'watch false');

  await page.evaluate('window.__ui.settings.perfOverlay = true; window.__ui.onSettings(window.__ui.settings); true');
  check('the setting shows it', (await read()).on === true && (await shown()), 'on');
  await page.evaluate('window.__ui.settings.perfOverlay = false; window.__ui.onSettings(window.__ui.settings); true');
  check('and hides it', (await read()).on === false && !(await shown()), 'off');
} finally {
  await page.close();
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
