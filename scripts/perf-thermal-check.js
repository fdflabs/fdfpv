/*
 * perf-thermal-check.js: the sensor view's thermal draw of the swiss2
 * valley, with the meshes the thermal picture cannot see left out, must
 * give the picture the whole scene gives.
 *
 * With the avionics HUD up the inset is IR white hot, so every frame
 * draws the scene a second time with every material writing a
 * temperature (src/render/thermal.js), 640 pixels wide
 * (src/render/sensorview.js). Some of what it draws cannot show in that
 * picture. This parks the camera at the swiss2 views, holds the clocks,
 * and draws the thermal source as sensorview.js does (renderThermal, the
 * scene's onBeforeRender skipped, the shadow maps held) four times in
 * turn: whole, skipped, whole, skipped. Skipped is the draw with the
 * meshes named in --skip hidden. Both are read back as 32 bit floats and
 * their red, the temperature (the only channel the sensor reads), is
 * compared: the two whole draws and the two skipped ones each with each
 * other (the repeat) and the skipped with the whole (the change). A view
 * fails if the change is larger at any pixel than the repeat: the
 * temperatures must be bit for bit the same, since the gain stage reads
 * their mean and spread. Then each is timed, the two interleaved, --reps
 * rounds of --frames draws, with WebGL's timer queries.
 *
 * First run 2026-10-05, --skip=swiss2-lake-bed,swiss2-lake-near-bed: the
 * lake's bed is NOT invisible to the thermal draw. The water's sheet is
 * translucent there too, and the bed's pass multiplies what lies under it,
 * so leaving the bed out moved the whole lake's temperature by up to 0.5
 * (50 degrees) in every lake view. See docs/PERF.md, P3b. Since
 * thermal-true the water is opaque in the thermal picture and the bed
 * pass is left out of every thermal draw (thermalHide), so the same skip
 * changes nothing and the check passes.
 *
 *     SIM_GPU=1 node scripts/perf-thermal-check.js [OUT_DIR] --skip=a,b
 *         [--views=lake-high,low-south] [--waves] [--frames=40] [--reps=3]
 *
 * --waves hands the plant's waves to the lake first (window.__wavesOn), so
 * the lake's near patch, the water drawn round a craft on it, is drawn.
 * OUT_DIR gets ground-check style diff maps where a view changed; it stays
 * out of the repository.
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

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
if (process.env.SIM_GPU !== '1') {
  throw new Error('perf-thermal-check: run with SIM_GPU=1; it times the GPU');
}
const opts = { skip: '', views: '', waves: false, frames: 40, reps: 3 };
const positional = [];
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([a-z]+)(?:=(.*))?$/);
  if (!m) {
    positional.push(a);
    continue;
  }
  if (!(m[1] in opts)) {
    throw new Error(`perf-thermal-check: unknown option --${m[1]}`);
  }
  opts[m[1]] = m[2] === undefined ? true : typeof opts[m[1]] === 'number' ? Number(m[2]) : m[2];
}
const outDir = resolve(positional[0] || join(tmpdir(), 'fdfpv-thermal-check'));
await mkdir(outDir, { recursive: true });

/* The swiss2 views, as perf-ground-check.js reads them. */
const viewsSrc = await readFile(join(root, 'scripts/swiss2-views.js'), 'utf8');
const listSrc = viewsSrc.match(/const VIEWS = (\[[\s\S]*?\n\]);/);
const fovSrc = viewsSrc.match(/const FOV = ([0-9.]+);/);
if (!listSrc || !fovSrc) {
  throw new Error('perf-thermal-check: could not read VIEWS and FOV out of scripts/swiss2-views.js');
}
const FOV = Number(fovSrc[1]);
const ALL_VIEWS = [
  ...new Function(`return ${listSrc[1]};`)(),
  { id: 'low-south', cam: [0, 14, 900, 120, 8, 1600] },
  { id: 'low-southwest', cam: [300, 14, 1100, -100, 8, 1900] },
  /* Low over the water near the shore, where the bed shows most. */
  { id: 'lake-low', cam: [180, 3, 2000, 200, 0, 2200] },
];
const VIEWS = opts.views ? ALL_VIEWS.filter((v) => String(opts.views).split(',').includes(v.id)) : ALL_VIEWS;
if (!VIEWS.length) {
  throw new Error(`perf-thermal-check: no view among ${opts.views}`);
}
const skipNames = opts.skip ? String(opts.skip).split(',') : [];

/* sensorview.js's thermal core width. */
const sensorSrc = await readFile(join(root, 'src/render/sensorview.js'), 'utf8');
const THERMAL_W = Number((sensorSrc.match(/const THERMAL_W = (\d+);/) || [])[1]);
if (!THERMAL_W) {
  throw new Error('perf-thermal-check: no THERMAL_W in src/render/sensorview.js');
}

const INSTALL = /* js */ `(async (skipNames, thermalW) => {
  const P = globalThis.__SWISS2_PERF;
  const THREE = window.__three;
  const r = P.renderer;
  const gl = r.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) { throw new Error('no EXT_disjoint_timer_query_webgl2'); }
  if (!gl.getExtension('EXT_color_buffer_float')) { throw new Error('no EXT_color_buffer_float'); }
  /* The module sensorview.js imports, by the same URL, so the same instance. */
  const { renderThermal } = await import(new URL('/src/render/thermal.js', location.origin).href);
  const skipped = [];
  P.scene.traverse((m) => {
    if (skipNames.includes(m.name)) { skipped.push(m); }
  });
  const w = thermalW;
  const h = Math.max(1, Math.round(w / P.camera.aspect));
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType, samples: 0 });
  const sm = r.shadowMap;
  /* The thermal draw as sensorview.js's drawScene makes it, with the
   * skipped meshes hidden or not. */
  const draw = (skip) => {
    const was = skipped.map((m) => m.visible);
    if (skip) { for (const m of skipped) { m.visible = false; } }
    const hook = P.scene.onBeforeRender;
    P.scene.onBeforeRender = THREE.Object3D.prototype.onBeforeRender;
    try {
      renderThermal(r, P.scene, P.camera, rt);
    } finally {
      P.scene.onBeforeRender = hook;
      skipped.forEach((m, k) => { m.visible = was[k]; });
      r.setRenderTarget(null);
    }
  };
  const read = () => {
    const px = new Float32Array(w * h * 4);
    r.setRenderTarget(rt);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, px);
    r.setRenderTarget(null);
    return px;
  };
  const diff = (a, b) => {
    let max = 0;
    let n = 0;
    for (let k = 0; k < a.length; k += 4) {
      const d = Math.abs(a[k] - b[k]);
      if (d > 0 || Number.isNaN(d)) { n += 1; if (!(d <= max)) { max = d; } }
    }
    return { max, channels: n };
  };
  const map = (a, b) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const k = ((h - 1 - y) * w + x) * 4;
        const o = (y * w + x) * 4;
        const t = Math.min(255, Math.max(0, a[k] * 400));
        const moved = a[k] !== b[k];
        img.data[o] = moved ? 255 : t * 0.5;
        img.data[o + 1] = moved ? 0 : t * 0.5;
        img.data[o + 2] = moved ? 0 : t * 0.5;
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  };
  const hold = (fn) => {
    sm.needsUpdate = true;
    const keepAuto = sm.autoUpdate;
    try {
      draw(false);
      sm.autoUpdate = false;
      return fn();
    } finally {
      sm.autoUpdate = keepAuto;
    }
  };
  window.__thermalCompare = (t) => hold(() => {
    P.updateWind(t);
    draw(false);
    draw(true);
    const f = [];
    for (const skip of [false, true, false, true]) { draw(skip); f.push(read()); }
    const out = { repeatWhole: diff(f[0], f[2]), repeatSkip: diff(f[1], f[3]), change: diff(f[0], f[1]) };
    out.drawn = skipped.filter((m) => m.visible).map((m) => m.name);
    if (out.change.channels) { out.png = map(f[0], f[1]); }
    return out;
  });
  const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
  const nextTask = () => new Promise((done) => setTimeout(done, 20));
  window.__thermalTime = async (n, reps, t) => {
    const acc = { whole: [], skip: [] };
    for (let k = 0; k < reps; k += 1) {
      for (const skip of [false, true]) {
        const qs = [];
        hold(() => {
          P.updateWind(t);
          draw(skip);
          gl.finish();
          for (let i = 0; i < n; i += 1) {
            const q = gl.createQuery();
            gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
            draw(skip);
            gl.endQuery(ext.TIME_ELAPSED_EXT);
            qs.push(q);
          }
        });
        gl.flush();
        const last = qs[qs.length - 1];
        for (let tries = 0; !gl.getQueryParameter(last, gl.QUERY_RESULT_AVAILABLE); tries += 1) {
          if (tries > 500) { throw new Error('timer queries never became available'); }
          await nextTask();
        }
        const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
        const ms = qs.map((q) => gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
        for (const q of qs) { gl.deleteQuery(q); }
        if (!disjoint) { acc[skip ? 'skip' : 'whole'].push(median(ms)); }
      }
    }
    return { whole: median(acc.whole), skip: median(acc.skip), rounds: acc.whole.length };
  };
  return JSON.stringify({ w, h, skipped: skipped.map((m) => m.name), quality: P.quality });
})`;

const seated = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'sky1800');
const seed = [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(seated)}, { graphics: 'high', graphicsAuto: false, perfMode: 'quality', airframeAsked: true });
    localStorage.setItem(k, JSON.stringify(s));
  } catch (e) { /* Storage refused: the quality check below fails the run. */ }
  globalThis.__SWISS2_PERF = {};`];

const page = await openPage({ root, width: 1600, height: 900, url: '/index.html?map=swiss2', seed });
const stop = () => page.close().finally(() => process.exit(1));
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
let failed = 0;
const report = [];
try {
  await page.until('window.__map && window.__map().id === "swiss2" && window.__map().ready', 300000);
  await page.evaluate('(document.getElementById("ui").style.display = "none", "")');
  if (opts.waves && !(await page.evaluate('window.__wavesOn()'))) {
    throw new Error('perf-thermal-check: --waves, and the map took no waves');
  }
  const info = JSON.parse(await page.evaluate(`${INSTALL}(${JSON.stringify(skipNames)}, ${THERMAL_W})`));
  if (info.quality !== 'high') {
    throw new Error(`perf-thermal-check: the map was built at ${info.quality}, not High`);
  }
  if (!info.skipped.length) {
    throw new Error('perf-thermal-check: no mesh in the scene is named in --skip');
  }
  console.log(`swiss2 High, thermal ${info.w}x${info.h}${opts.waves ? ', waves on' : ''}, skipping ${info.skipped.join(', ')}`);
  await page.sleep(2500);
  for (const v of VIEWS) {
    await page.evaluate(`(window.__setCam(${v.cam.join(',')}, ${FOV}), "")`);
    await page.sleep(2500);
    await page.evaluate('window.__drawOff(true)');
    try {
      const t = await page.evaluate('performance.now() / 1000');
      const c = await page.evaluate(`JSON.stringify(window.__thermalCompare(${t}))`).then(JSON.parse);
      const noise = Math.max(c.repeatWhole.max, c.repeatSkip.max);
      const ok = c.change.max <= noise;
      failed += ok ? 0 : 1;
      if (c.png) {
        await writeFile(join(outDir, `${v.id}-thermal-diff.png`), Buffer.from(c.png.split(',')[1], 'base64'));
      }
      const tm = await page.evaluate(`window.__thermalTime(${opts.frames}, ${opts.reps}, ${t}).then(JSON.stringify)`).then(JSON.parse);
      report.push({ id: v.id, change: c.change, noise, drawn: c.drawn, time: tm });
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${v.id.padEnd(18)} skipped vs whole: ${c.change.channels} temperatures differ, max ${c.change.max.toPrecision(3)}; repeat ${noise}; `
        + `GPU ms whole ${tm.whole.toFixed(3)} skipped ${tm.skip.toFixed(3)} (${tm.rounds} rounds); skipped meshes in view: ${c.drawn.length ? c.drawn.join(' ') : 'none visible'}`);
    } finally {
      await page.evaluate('window.__drawOff(false)');
    }
  }
} finally {
  process.removeListener('SIGTERM', stop);
  process.removeListener('SIGINT', stop);
  await page.close();
}
await writeFile(join(outDir, 'thermal-check.json'), JSON.stringify(report, null, 1));
console.log(`-> ${outDir}`);
if (failed) {
  console.error(`perf-thermal-check: ${failed} view(s) changed with the skip`);
  process.exit(1);
}
