/*
 * swiss2-perf.js: what each fixed view of the swiss2 valley costs the GPU,
 * pass by pass, with the frame uncapped.
 *
 * WHY NOT THE VIEWS' FRAME TIME. scripts/swiss2-views.js reports the
 * median time between animation frames, which the display caps at
 * 16.7 ms: a view that costs the GPU 4 ms and one that costs 16 read the
 * same, and a view that costs 17 reads 33. It can show a drop and
 * nothing else. This times the GPU itself, with WebGL's timer queries
 * (EXT_disjoint_timer_query_webgl2), around each part of the frame, and
 * draws the frames back to back in one task with the shell's own draw
 * switched off, so nothing waits on the display.
 *
 *     SIM_GPU=1 node scripts/swiss2-perf.js OUT_DIR [--presets=high,medium,low]
 *         [--views=strip,waterfall] [--frames=40] [--repeat=3] [--objects]
 *
 * Writes OUT_DIR/perf.json and prints a table: per view and preset, the
 * GPU milliseconds of each part (the two shadow cascades, the lake's
 * mirror, the scene, the occlusion, the cloud march, the meter, the
 * bloom, the photographic pass, FXAA), their total, and the main thread's
 * milliseconds to submit the frame. Each number is the median over
 * `frames` frames, and the run is repeated `repeat` times so a number that
 * moves between repeats can be seen to (the GPU is shared with whatever
 * else the desktop draws: every repeat records the GPUs' load from
 * nvidia-smi and the host's load average beside it). --objects also
 * times every mesh's own draws at High, in the scene and in the mirror,
 * and lists those over a tenth of a millisecond.
 *
 * The views are swiss2-views.js's own list, read from that file, so the
 * two can never measure different places. The page is the real shell at
 * 1600 by 900, as the views are shot; the swiss2 map hands this script
 * its renderer, composer and sun through globalThis.__SWISS2_PERF, which
 * it fills only when asked before the map is built (src/maps/swiss2.js).
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

import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { loadavg } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const opts = {
  presets: 'high,medium,low', views: '', frames: 40, repeat: 3, objects: false,
};
const positional = [];
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([a-z]+)(?:=(.*))?$/);
  if (m) {
    opts[m[1]] = m[2] === undefined ? true : (/^\d+$/.test(m[2]) ? Number(m[2]) : m[2]);
  } else {
    positional.push(a);
  }
}
if (process.env.SIM_GPU !== '1') {
  throw new Error('swiss2-perf: run with SIM_GPU=1; a software rasteriser\'s timings say nothing about a GPU');
}
const outDir = resolve(positional[0] || join(root, 'tmp', 'swiss2-perf'));
await mkdir(outDir, { recursive: true });

/* The views and their lens, out of swiss2-views.js's source: its list is
 * a plain array literal and the file runs its capture when imported. */
const viewsSrc = await readFile(join(root, 'scripts/swiss2-views.js'), 'utf8');
const listSrc = viewsSrc.match(/const VIEWS = (\[[\s\S]*?\n\]);/);
const fovSrc = viewsSrc.match(/const FOV = (\d+(?:\.\d+)?);/);
if (!listSrc || !fovSrc) {
  throw new Error('swiss2-perf: could not read VIEWS and FOV out of scripts/swiss2-views.js');
}
/* eslint-disable-next-line no-new-func */
const ALL_VIEWS = new Function(`return ${listSrc[1]};`)();
const FOV = Number(fovSrc[1]);
const wanted = opts.views ? String(opts.views).split(',') : ALL_VIEWS.map((v) => v.id);
const VIEWS = ALL_VIEWS.filter((v) => wanted.includes(v.id));

/* Both GPUs' load and this run's share of each, for the record beside
 * every measurement. */
function gpuLoad(chromePid) {
  const q = spawnSync('nvidia-smi', ['--query-gpu=index,utilization.gpu,memory.used,clocks.gr', '--format=csv,noheader,nounits'], { encoding: 'utf8' });
  const gpus = (q.stdout || '').trim().split('\n').filter(Boolean).map((l) => {
    const [index, util, mem, clock] = l.split(',').map((s) => Number(s.trim()));
    return { index, util, mem, clock };
  });
  /* Which card this run's Chrome draws on: its GPU process is a child of
   * the browser, and nvidia-smi lists it against the card. */
  const kids = new Set((spawnSync('ps', ['-o', 'pid=', '--ppid', String(chromePid)], { encoding: 'utf8' }).stdout || '').split('\n').map((s) => s.trim()).filter(Boolean));
  const apps = (spawnSync('nvidia-smi', ['--query-compute-apps=pid,gpu_bus_id', '--format=csv,noheader'], { encoding: 'utf8' }).stdout || '')
    .split('\n').map((l) => l.split(',').map((s) => s.trim())).filter(([pid]) => kids.has(pid));
  return { gpus, load: loadavg().map((x) => Math.round(x * 10) / 10), ours: apps.map(([, bus]) => bus) };
}

/*
 * The in page half. Installed once per page: it wraps each composer pass,
 * the shadow map's render (one light at a time, so each cascade is timed
 * on its own) and the water's update (which draws the lake's mirror), so
 * each opens a timer query of its own and hands the frame back to the
 * label it interrupted. WebGL has one TIME_ELAPSED query open at a time,
 * so the frame is a sequence of segments, never a nest.
 */
const INSTALL = /* js */ `(() => {
  const P = globalThis.__SWISS2_PERF;
  const r = P.renderer;
  const gl = r.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) { throw new Error('no EXT_disjoint_timer_query_webgl2'); }
  let frame = null;
  let open = false;
  let label = 'other';
  const seg = (name) => {
    if (open) { gl.endQuery(ext.TIME_ELAPSED_EXT); open = false; }
    if (name === null || frame === null) { return; }
    const q = gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    open = true;
    frame.push({ name, q });
  };
  const within = (name, fn) => {
    if (frame === null) { return fn(); }
    const prev = label;
    label = name;
    seg(name);
    try { return fn(); } finally { label = prev; seg(prev); }
  };
  const NAMES = { RenderPass: 'scene', AoPass: 'ao', CloudPass: 'clouds', MeterPass: 'meter', UnrealBloomPass: 'bloom', PhotoPass: 'photo', ShaderPass: 'fxaa' };
  for (const pass of P.post.composer.passes) {
    const name = NAMES[pass.constructor.name] || pass.constructor.name;
    const orig = pass.render.bind(pass);
    pass.render = (...a) => within(name, () => orig(...a));
  }
  const sm = r.shadowMap;
  const smRender = sm.render.bind(sm);
  sm.render = (lights, scene, camera) => {
    if (frame === null || !sm.enabled || (!sm.autoUpdate && !sm.needsUpdate) || lights.length === 0) {
      return smRender(lights, scene, camera);
    }
    const was = sm.needsUpdate;
    for (const l of lights) {
      sm.needsUpdate = was;
      within('shadow' + P.sun.lights.indexOf(l), () => smRender([l], scene, camera));
    }
  };
  const water = P.stage.water;
  const wUpdate = water.update;
  water.update = (dt, cam) => within('mirror', () => wUpdate(dt, cam));

  const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
  const nextTask = () => new Promise((done) => setTimeout(done, 20));
  /* n frames back to back, each one the shell's frame (updateWind, then
   * the composer) with the clocks held, so every frame draws the same
   * picture. The CPU time is the main thread's, after gl.finish so the
   * submit does not wait on the frames before it. */
  window.__s2measure = async (n) => {
    const frames = [];
    const cpu = [];
    const t = performance.now() / 1000;
    let calls = 0;
    let triangles = 0;
    for (let k = 0; k < n; k += 1) {
      gl.finish();
      frame = [];
      label = 'other';
      r.info.reset();
      const t0 = performance.now();
      seg('other');
      P.updateWind(t);
      P.post.render();
      seg(null);
      cpu.push(performance.now() - t0);
      calls = r.info.render.calls;
      triangles = r.info.render.triangles;
      frames.push(frame);
      frame = null;
    }
    gl.flush();
    const last = frames[frames.length - 1];
    const lastQ = last[last.length - 1].q;
    for (let tries = 0; !gl.getQueryParameter(lastQ, gl.QUERY_RESULT_AVAILABLE); tries += 1) {
      if (tries > 500) { throw new Error('timer queries never became available'); }
      await nextTask();
    }
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
    const per = {};
    const totals = [];
    for (const f of frames) {
      const sums = {};
      let total = 0;
      for (const { name, q } of f) {
        const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
        gl.deleteQuery(q);
        sums[name] = (sums[name] || 0) + ms;
        total += ms;
      }
      for (const [k, v] of Object.entries(sums)) { (per[k] ||= []).push(v); }
      totals.push(total);
    }
    const parts = {};
    const partsMin = {};
    for (const [k, v] of Object.entries(per)) { parts[k] = median(v); partsMin[k] = Math.min(...v); }
    /* The desktop's own drawing lands inside whichever query is open when
     * the GPU switches to it, so it only ever adds: each part's least over
     * the frames is its cost with the least of that in it, and their sum
     * the frame's floor. */
    const floor = Object.values(partsMin).reduce((a, b) => a + b, 0);
    return { disjoint, gpu: median(totals), floor, gpuMin: Math.min(...totals), gpuMax: Math.max(...totals), cpu: median(cpu), parts, partsMin, calls, triangles };
  };
  /* Each mesh's own draws, timed where they are drawn: a mesh's
   * onBeforeRender opens a query of its own inside whichever part is
   * drawing it (the scene or the mirror) and its onAfterRender hands the
   * GPU back. The name is the scene's top level object and the mesh's
   * own, and a mesh's time is its least over the frames, as the parts'
   * are. Shadow draws are not in it: three draws those without the
   * callbacks, and the cascades are timed whole above. */
  window.__s2objects = async (n) => {
    const tagged = [];
    P.scene.children.forEach((top) => {
      top.traverse((m) => {
        if (!m.isMesh && !m.isLine && !m.isPoints) { return; }
        const name = (top === m ? '' : (top.name || top.type) + '/') + (m.name || m.type);
        const before = m.onBeforeRender;
        const after = m.onAfterRender;
        tagged.push([m, before, after]);
        m.onBeforeRender = function (...a) { before.apply(this, a); if (frame !== null) { seg(label + ':' + name); } };
        m.onAfterRender = function (...a) { after.apply(this, a); if (frame !== null) { seg(label); } };
      });
    });
    try {
      const reps = [];
      for (let k = 0; k < 3; k += 1) { reps.push(await window.__s2measure(n)); }
      const least = {};
      for (const r of reps) {
        for (const [k, ms] of Object.entries(r.partsMin)) { least[k] = Math.min(least[k] ?? Infinity, ms); }
      }
      const rows = Object.entries(least).filter(([k]) => k.includes(':')).map(([k, ms]) => ({ part: k.slice(0, k.indexOf(':')), name: k.slice(k.indexOf(':') + 1), ms }));
      rows.sort((x, y) => y.ms - x.ms);
      return { rows };
    } finally {
      for (const [m, before, after] of tagged) { m.onBeforeRender = before; m.onAfterRender = after; }
    }
  };
  return JSON.stringify({ renderer: gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL), quality: P.quality });
})()`;

const PARTS = ['shadow0', 'shadow1', 'mirror', 'scene', 'ao', 'clouds', 'meter', 'bloom', 'photo', 'fxaa', 'other'];

async function runPreset(preset) {
  const seated = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, 'sky1800');
  const seed = [`try {
      const k = ${JSON.stringify(SETTINGS_KEY)};
      const s = JSON.parse(localStorage.getItem(k) || '{}');
      s.graphics = ${JSON.stringify(preset)};
      s.graphicsAuto = false;
      Object.assign(s, ${JSON.stringify(seated)});
      s.airframeAsked = true;
      localStorage.setItem(k, JSON.stringify(s));
    } catch (e) { /* Storage refused; the run would measure the wrong preset, and the check below says so. */ }
    globalThis.__SWISS2_PERF = {};`];
  const page = await openPage({ root, width: 1600, height: 900, url: '/index.html?map=swiss2', seed });
  /* A run stopped by a signal still closes its Chrome and its profile. */
  const stop = () => page.close().finally(() => process.exit(1));
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  const out = { preset, views: [] };
  try {
    await page.until('window.__map && window.__map().id === "swiss2" && window.__map().ready', 180000);
    await page.evaluate('(document.getElementById("ui").style.display = "none", "")');
    const info = JSON.parse(await page.evaluate(INSTALL));
    if (info.quality !== preset) {
      throw new Error(`swiss2-perf: asked for ${preset}, the map was built at ${info.quality}`);
    }
    out.renderer = info.renderer;
    out.viewport = await page.evaluate('JSON.stringify({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio })');
    await page.sleep(2500);
    for (const v of VIEWS) {
      const above = await page.evaluate(`window.__heightAt(${v.cam[0]}, ${v.cam[2]}) < ${v.cam[1] - 1}`);
      if (!above) {
        throw new Error(`swiss2-perf: ${v.id}'s camera is within a metre of the ground`);
      }
      await page.evaluate(`(window.__setCam(${v.cam.join(',')}, ${FOV}), "")`);
      /* The shell draws the view long enough for the meter and the
       * shadows to settle, then stops drawing while it is timed. */
      await page.sleep(2500);
      await page.evaluate('window.__drawOff(true)');
      const reps = [];
      for (let k = 0; k < opts.repeat; k += 1) {
        const m = await page.evaluate(`window.__s2measure(${opts.frames})`);
        reps.push({ ...m, load: gpuLoad(page.proc.pid) });
      }
      let objects = null;
      if (opts.objects && preset === 'high') {
        objects = await page.evaluate(`window.__s2objects(${Math.max(10, opts.frames >> 1)})`);
      }
      await page.evaluate('window.__drawOff(false)');
      /* The repeat with the least GPU time is the one least disturbed by
       * the desktop; the spread says how much the others were. */
      const best = reps.reduce((a, b) => (b.gpu < a.gpu ? b : a));
      /* Each part's least over every frame of every repeat. */
      const partsMin = {};
      for (const r of reps) {
        for (const [k, ms] of Object.entries(r.partsMin)) {
          partsMin[k] = Math.min(partsMin[k] ?? Infinity, ms);
        }
      }
      best.partsMin = partsMin;
      best.floor = Object.values(partsMin).reduce((a, b) => a + b, 0);
      const row = {
        id: v.id, best, spread: Math.max(...reps.map((r) => r.gpu)) - best.gpu, reps, objects,
      };
      out.views.push(row);
      const p = best.parts;
      console.log(`${preset.padEnd(6)} ${v.id.padEnd(12)} gpu ${best.gpu.toFixed(2).padStart(6)} (+${row.spread.toFixed(2)}) floor ${best.floor.toFixed(2).padStart(6)} cpu ${best.cpu.toFixed(2).padStart(5)} | ${PARTS.map((k) => `${k} ${(p[k] || 0).toFixed(2)}/${(best.partsMin[k] || 0).toFixed(2)}`).join(' ')}${best.disjoint ? ' DISJOINT' : ''} | gpu load ${best.load.gpus.map((g) => `${g.index}:${g.util}%`).join(' ')} host ${best.load.load[0]}`);
      if (objects) {
        for (const o of objects.rows.filter((r) => r.ms >= 0.1)) {
          console.log(`         ${o.part.padEnd(7)} ${o.ms.toFixed(2).padStart(6)} ${o.name}`);
        }
      }
    }
    out.errors = page.errors.length;
    out.warnings = page.warnings.length;
    console.log(`${preset}: ${page.errors.length} console errors, ${page.warnings.length} warnings${[...new Set([...page.errors, ...page.warnings].map(String))].slice(0, 4).map((w) => `\n  ${w.slice(0, 200)}`).join('')}`);
  } finally {
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
    await page.close();
  }
  return out;
}

const report = { when: new Date().toISOString(), frames: opts.frames, repeat: opts.repeat, presets: [] };
for (const preset of String(opts.presets).split(',')) {
  report.presets.push(await runPreset(preset));
}
await writeFile(join(outDir, 'perf.json'), JSON.stringify(report, null, 2));
console.log(`-> ${join(outDir, 'perf.json')}`);
