/*
 * perf-latency.js: how long a stick movement takes to reach the picture.
 *
 *     SIM_GPU=1 node scripts/perf-latency.js [OUT_DIR] [--seconds=30] [--map=swiss2]
 *         [--period=300] [--preset=high] [--late=0|1] [--hz=0]
 *
 * A quad hovers on a scripted throttle in angle mode while the yaw stick
 * steps between two values at random moments, from a timer, as a thumb
 * would: not on a frame. For every step it finds, from outside the shell
 * (nothing in src/ carries a hook for this):
 *
 *   the frame that handed the new value to sim_input, its slot on the RC
 *   grid (main.js RC_HZ), and the first frame whose plant state (read
 *   through sim_state) is a whole step past that slot, i.e. the first
 *   frame drawn with the input in it.
 *
 * Per frame it records the requestAnimationFrame timestamp the shell is
 * handed (nowWall, the frame's start on the display's beat), when the
 * callback actually ran, when it first stepped the plant, when it started
 * the composer's render and when it returned.
 *
 * WHAT THIS CANNOT SEE. The GPU's own time and the compositor's are after
 * the callback returns, the same for every way of feeding the plant, so the
 * numbers end at the frame's submit. The browser's beat in headless Chrome
 * is 60 Hz (docs/PERF.md), so the per frame wait is measured at 16.7 ms;
 * at 90 fps it scales with the interval.
 *
 * --hz=N replaces the browser's beat with one of N Hz, kept by timers:
 * frames are handed the beat's time as their timestamp and start when the
 * page is free after it, as they would on an N Hz display. A model of the
 * main thread's side only (the compositor still runs at 60), and it is
 * how a 90 Hz number is taken here.
 *
 * --late=1 seeds the low latency input setting (latencyMode: 'low'; without it 'standard', now that low is the default) before
 * boot, so the same script measures it.
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
import { mkdir, writeFile } from 'node:fs/promises';
import { loadavg, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const opts = { seconds: 30, map: 'swiss2', period: 300, preset: 'high', late: 0, hz: 0 };
const positional = [];
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([a-z]+)(?:=(.*))?$/);
  if (!m) {
    positional.push(a);
    continue;
  }
  if (!(m[1] in opts)) {
    throw new Error(`perf-latency: unknown option --${m[1]}`);
  }
  opts[m[1]] = m[2] === undefined ? 1 : (/^\d+$/.test(m[2]) ? Number(m[2]) : m[2]);
}
if (process.env.SIM_GPU !== '1') {
  throw new Error('perf-latency: run with SIM_GPU=1; a software rasteriser\'s frames say nothing about a GPU');
}
const outDir = resolve(positional[0] || join(tmpdir(), 'fdfpv-perf-latency'));
await mkdir(outDir, { recursive: true });

/* The two yaw values the stick steps between: a slow turn either way of
 * none, small enough not to unsettle the hover, and exact in a double so
 * the value sim_input is handed can be matched. */
const YAW = [0.0625, 0.125];

const INSTRUMENT = /* js */ `(() => {
  const L = globalThis.__LAT = { frames: [], events: [], on: false, frame: null, wired: false, yaw: ${YAW[0]}, pilot: null };
  const now = () => performance.now();

  /* The plant's module is the first one with sim_input; a test stand's
   * second copy is left alone. Its exports object is frozen, so the shell
   * is handed a plain copy with three wrapped. */
  const instantiate = WebAssembly.instantiate;
  WebAssembly.instantiate = async function (src, imports) {
    const r = await instantiate.call(WebAssembly, src, imports);
    const instance = r instanceof WebAssembly.Instance ? r : r.instance;
    if (L.wired || typeof instance.exports.sim_input !== 'function') { return r; }
    L.wired = true;
    const ex = { ...instance.exports };
    const inp = ex.sim_input;
    const step = ex.sim_step;
    const st = ex.sim_state;
    const mem = ex.memory;
    ex.sim_input = function (ts, ro, pi, ya, th) {
      const f = L.frame;
      if (f) { if (f.tIn < 0) { f.tIn = now(); } f.inputs.push(ts, ya); }
      return inp(ts, ro, pi, ya, th);
    };
    ex.sim_step = function (n) {
      const f = L.frame;
      if (f && f.tStep < 0) { f.tStep = now(); }
      return step(n);
    };
    ex.sim_state = function (ptr) {
      const c = st(ptr);
      const f = L.frame;
      if (f && c === 0) { f.simT = new Float64Array(mem.buffer, ptr, 1)[0]; }
      return c;
    };
    const shim = { exports: ex };
    return r instanceof WebAssembly.Instance ? shim : { module: r.module, instance: shim };
  };

  /* --hz: a beat of its own, kept by timers, each frame handed the beat's
   * time. Every callback asked for before a beat runs on it. */
  let nativeRaf = window.requestAnimationFrame.bind(window);
  const HZ = ${Number(opts.hz) || 0};
  if (HZ > 0) {
    const period = 1000 / HZ;
    let queue = [];
    let t0 = 0;
    let k = 0;
    let scheduled = false;
    /* A beat that fires late (the page was busy) is handed the latest
     * beat already past, as a display's next vsync would be. */
    const beat = () => {
      scheduled = false;
      const list = queue;
      queue = [];
      k = Math.max(k, Math.floor((performance.now() - t0) / period));
      const ts = t0 + k * period;
      k += 1;
      for (const cb of list) { try { cb(ts); } catch (e) { setTimeout(() => { throw e; }); } }
      if (queue.length) { schedule(); }
    };
    const schedule = () => {
      if (scheduled) { return; }
      scheduled = true;
      if (!t0) { t0 = performance.now(); k = 1; }
      setTimeout(beat, Math.max(0, t0 + k * period - performance.now()));
    };
    nativeRaf = (cb) => { queue.push(cb); schedule(); return 0; };
  }
  /* The shell's frame is the callback named frame; anything else asking
   * for a frame passes through untouched. */
  window.requestAnimationFrame = (cb) => nativeRaf((ts) => {
    if (!L.on || cb.name !== 'frame') { return cb(ts); }
    if (L.pilot) { try { L.pilot(); } catch (e) { L.pilot = null; L.err = e.message; } }
    const f = { ts, entry: now(), tIn: -1, tStep: -1, tRender: -1, exit: 0, simT: NaN, inputs: [] };
    L.frame = f;
    try { return cb(ts); } finally { f.exit = now(); L.frame = null; L.frames.push(f); }
  });

  L.hookThree = async () => {
    const { EffectComposer } = await import('three/addons/postprocessing/EffectComposer.js');
    const cRender = EffectComposer.prototype.render;
    EffectComposer.prototype.render = function (...a) {
      const f = L.frame;
      if (f && f.tRender < 0) { f.tRender = now(); }
      return cRender.apply(this, a);
    };
    return true;
  };

  /* Hover: throttle on height and climb rate, sticks level, the yaw the
   * last step left. Runs before each frame, outside its timing. */
  L.fly = (target) => {
    let ti = 0;
    let lastY = null;
    let lastT = now();
    L.pilot = () => {
      const c = window.__craftState();
      const t = now();
      const dt = Math.max(1e-3, (t - lastT) / 1000);
      lastT = t;
      const clr = c.worldY - window.__heightAt(c.worldX, c.worldZ);
      const vy = lastY === null ? 0 : (c.worldY - lastY) / dt;
      lastY = c.worldY;
      const err = target - clr;
      ti = Math.max(-0.4, Math.min(0.4, ti + err * dt * 0.02));
      L.thr = Math.max(0.05, Math.min(1, 0.3 + ti + err * 0.04 - vy * 0.06));
      L.clr = clr;
      window.__stick(0, 0, L.yaw, L.thr);
    };
  };

  /* The steps, at random moments period ms apart give or take a quarter:
   * the stick moves when the timer fires, which the shell's 2 ms poll
   * (input.js startPolling) then samples, as it would a thumb. */
  L.record = (seconds, period) => new Promise((done) => {
    L.frames.length = 0;
    L.events.length = 0;
    L.on = true;
    const end = now() + seconds * 1000;
    let k = 0;
    const next = () => {
      if (now() > end) { L.on = false; done({ frames: L.frames, events: L.events, err: L.err || null }); return; }
      k += 1;
      L.yaw = k % 2 ? ${YAW[1]} : ${YAW[0]};
      L.events.push({ tSet: now(), yaw: L.yaw });
      window.__stick(0, 0, L.yaw, L.thr ?? 0.3);
      setTimeout(next, period * (0.75 + Math.random() * 0.5));
    };
    setTimeout(next, period);
  });
})();`;

function settingsSeed(s) {
  return `try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    if (!s.latSeeded) {
      Object.assign(s, ${JSON.stringify(s)}, { latSeeded: true });
      localStorage.setItem(k, JSON.stringify(s));
    }
  } catch (e) { /* Storage refused: the preset check below fails the run. */ }`;
}

const pct = (a, p) => {
  const s = a.filter(Number.isFinite).sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN;
};
const mean = (a) => {
  const s = a.filter(Number.isFinite);
  return s.length ? s.reduce((x, y) => x + y, 0) / s.length : NaN;
};
const sd = (a) => {
  const m = mean(a);
  return Math.sqrt(mean(a.map((x) => (x - m) * (x - m))));
};
const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '-');

/*
 * Each step's path. The frame that took it into the plant is the first
 * after the step whose sim_input calls carry the new yaw; the frame that
 * shows it is the first from there whose plant state is a whole step past
 * the slot, since the picture is drawn between the last two states.
 */
function analyse(raw) {
  const frames = raw.frames.filter((fr) => Number.isFinite(fr.simT));
  const steps = [];
  for (let e = 0; e < raw.events.length; e += 1) {
    const ev = raw.events[e];
    const until = e + 1 < raw.events.length ? raw.events[e + 1].tSet : Infinity;
    let i = frames.findIndex((fr) => fr.exit > ev.tSet && fr.inputs.some((v, k) => k % 2 === 1 && v === ev.yaw));
    if (i < 0 || frames[i].entry > until) {
      continue;
    }
    const inputs = frames[i].inputs;
    let ts = NaN;
    for (let k = 0; k < inputs.length; k += 2) {
      if (inputs[k + 1] === ev.yaw) {
        ts = inputs[k];
        break;
      }
    }
    let j = i;
    while (j < frames.length && !(frames[j].simT - 0.001 >= ts - 1e-9)) {
      j += 1;
    }
    if (j >= frames.length) {
      continue;
    }
    const fi = frames[i];
    const fj = frames[j];
    /* The step's moment on the sim clock, by the frame's own mapping:
     * the block's end is that frame's nowWall. */
    const setSim = ev.tSet + (fi.simT * 1000 - fi.ts);
    steps.push({
      toPlant: fi.tIn - ev.tSet,
      toSubmit: fj.exit - ev.tSet,
      toRender: fj.tRender > 0 ? fj.tRender - ev.tSet : NaN,
      slotLate: ts * 1000 - setSim,
      framesLater: j - i,
      beforeFrameStart: fi.ts - ev.tSet,
    });
  }
  const iv = [];
  for (let k = 1; k < frames.length; k += 1) {
    iv.push(frames[k].ts - frames[k - 1].ts);
  }
  const entry = frames.map((fr) => fr.entry - fr.ts);
  const step = frames.map((fr) => (fr.tStep >= 0 ? fr.tStep - fr.ts : NaN));
  const render = frames.map((fr) => (fr.tRender >= 0 ? fr.tRender - fr.ts : NaN));
  const cb = frames.map((fr) => fr.exit - fr.entry);
  const jitter = (a) => {
    const d = [];
    for (let k = 1; k < a.length; k += 1) {
      if (Number.isFinite(a[k]) && Number.isFinite(a[k - 1])) {
        d.push(a[k] - a[k - 1]);
      }
    }
    return sd(d);
  };
  return {
    frames: frames.length,
    steps: steps.length,
    events: raw.events.length,
    interval: { mean: mean(iv), p95: pct(iv, 0.95) },
    afterTs: {
      entry: { mean: mean(entry), p95: pct(entry, 0.95), jitter: jitter(entry) },
      step: { mean: mean(step), p95: pct(step, 0.95), jitter: jitter(step) },
      render: { mean: mean(render), p95: pct(render, 0.95), jitter: jitter(render) },
      cb: { mean: mean(cb), p95: pct(cb, 0.95) },
    },
    latency: Object.fromEntries(['toPlant', 'toRender', 'toSubmit', 'slotLate', 'beforeFrameStart', 'framesLater'].map((k) => {
      const a = steps.map((s) => s[k]);
      return [k, { mean: mean(a), p50: pct(a, 0.5), p95: pct(a, 0.95), min: pct(a, 0), max: pct(a, 1) }];
    })),
  };
}

function gpuLoad() {
  const q = spawnSync('nvidia-smi', ['--query-gpu=index,utilization.gpu', '--format=csv,noheader,nounits'], { encoding: 'utf8' });
  return {
    gpus: (q.stdout || '').trim().split('\n').filter(Boolean).map((l) => l.split(',').map((x) => Number(x.trim()))),
    load: loadavg().map((x) => Math.round(x * 10) / 10),
  };
}

const settings = Object.assign(
  seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, '7inch'),
  {
    map: opts.map, freestyleMap: opts.map, graphics: opts.preset, graphicsAuto: false, flightMode: 'angle',
    fpsCap: 0, airframeAsked: true, latencyMode: opts.late ? 'low' : 'standard',
  },
);
const page = await openPage({
  root, width: 1600, height: 900, url: `/index.html?map=${opts.map}`, seed: [settingsSeed(settings), INSTRUMENT],
});
const stop = () => page.close().finally(() => process.exit(1));
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
let result = null;
try {
  await page.until('window.__shellReady === true', 300000);
  await page.until('window.__map && window.__map().ready', 600000);
  await page.evaluate('window.__LAT.hookThree()');
  const wired = await page.evaluate('window.__LAT.wired');
  if (!wired) {
    throw new Error('perf-latency: the plant\'s module was not wrapped');
  }
  await page.until(`window.__map().id === ${JSON.stringify(opts.map)}`, 10000);
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight' && window.__map().ready", 400000);
  await page.evaluate('window.__LAT.fly(5); true');
  /* The hover's own loop needs frames, and frames are what L.on counts:
   * the pilot runs only while recording, so take off for a few seconds
   * on a throwaway recording first. */
  await page.evaluate('window.__LAT.record(6, 100000).then(() => true)');
  const before = gpuLoad();
  const raw = await page.evaluate(`window.__LAT.record(${opts.seconds}, ${opts.period})`);
  const after = gpuLoad();
  const late = await page.evaluate('window.__ui.settings.latencyMode ?? null');
  const state = await page.evaluate('(() => { const c = window.__craftState(); return { mode: c.mode, crashed: c.crashed, landed: c.landed, clr: window.__LAT.clr }; })()');
  result = { when: new Date().toISOString(), opts, latencyMode: late, state, load: { before, after }, ...analyse(raw) };
  if (raw.err) {
    result.pilotError = raw.err;
  }
} finally {
  process.removeListener('SIGTERM', stop);
  process.removeListener('SIGINT', stop);
  await page.close();
}

const r = result;
console.log(`perf-latency  map ${opts.map}  latencyMode ${r.latencyMode ?? 'default'}  beat ${opts.hz ? `${opts.hz} Hz, timers` : 'the browser\'s'}  ${r.frames} frames, ${r.steps} of ${r.events} steps traced`);
console.log(`  frame interval ${f(r.interval.mean)} ms (p95 ${f(r.interval.p95)})  callback ${f(r.afterTs.cb.mean)} ms (p95 ${f(r.afterTs.cb.p95)})`);
console.log('  after the frame\'s timestamp (ms)   mean    p95   frame to frame sd');
for (const k of ['entry', 'step', 'render']) {
  const a = r.afterTs[k];
  console.log(`    ${k.padEnd(31)} ${f(a.mean).padStart(6)} ${f(a.p95).padStart(6)} ${f(a.jitter).padStart(8)}`);
}
console.log('  per stick step (ms)                 mean    p50    p95    min    max');
const label = {
  beforeFrameStart: 'step to next frame timestamp',
  toPlant: 'step to sim_input',
  slotLate: 'slot after the step, sim clock',
  toRender: 'step to render start',
  toSubmit: 'step to frame submitted',
  framesLater: 'frames from sim_input to shown',
};
for (const k of Object.keys(label)) {
  const a = r.latency[k];
  console.log(`    ${label[k].padEnd(31)} ${f(a.mean).padStart(6)} ${f(a.p50).padStart(6)} ${f(a.p95).padStart(6)} ${f(a.min).padStart(6)} ${f(a.max).padStart(6)}`);
}
console.log(`  state ${JSON.stringify(r.state)}  gpu ${r.load.before.gpus.map((g) => `${g[0]}:${g[1]}%`).join(' ')} host ${r.load.before.load[0]}`);
await writeFile(join(outDir, `perf-latency-${opts.late ? 'low' : 'default'}${opts.hz ? `-${opts.hz}hz` : ''}.json`), JSON.stringify(r, null, 1));
console.log(`-> ${outDir}`);
process.exit(0);
