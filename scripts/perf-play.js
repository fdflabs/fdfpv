/*
 * perf-play.js: what a frame of real play costs, flown, not parked.
 *
 * WHY NOT THE FIXED VIEWS. scripts/swiss2-perf.js and scripts/itaipu-views.js
 * time the GPU at a parked camera with the clocks held. That says what a
 * picture costs and nothing about what flying costs: the plant and
 * Betaflight stepping at 1000 Hz, the map streaming round a moving craft,
 * the war's attackers, explosions and HUD, the garbage all of that leaves
 * behind. This flies the real shell through a scenario on a scripted stick
 * and times every frame of it.
 *
 *     SIM_GPU=1 node scripts/perf-play.js [OUT_DIR] [--scenarios=itaipu-war,swiss-low,wing-cruise]
 *         [--seconds=30] [--preset=high] [--pace=free|raf] [--cap=90]
 *
 * Writes OUT_DIR/perf-play.json (every frame's numbers) and prints a table
 * per scenario. OUT_DIR defaults to a folder under the system temp dir; the
 * numbers worth keeping go in docs/PERF.md, not the frames.
 *
 * UNCAPPED. Headless Chrome hands requestAnimationFrame a 60 Hz beat that
 * no flag here removes (--disable-gpu-vsync and --disable-frame-rate-limit
 * were tried, 2026-10-05: the beat stayed 16.7 ms). With --pace=free (the
 * default) the page's requestAnimationFrame is replaced, for the recorded
 * window only, by a scheduler that runs the next frame as soon as the last
 * one is done, held back only by the GPU: a frame waits until the GPU has
 * finished the frame two before it (a fence), as a swap chain two deep
 * would. So the frame time is what this machine can do, not what the
 * display allows. --pace=raf keeps the browser's own beat. --cap=N, free
 * running, holds each frame back as the shell's own frame cap does, for
 * the tail a pilot with the cap on sees.
 *
 * WHAT A FRAME IS SPLIT INTO, all measured from outside the shell, so the
 * shell carries no hook for this:
 *
 *   physics   time inside sim.wasm's exports during the frame: the plant,
 *             Betaflight and the crash and water code, all one module
 *             (WebAssembly.instantiate is wrapped before the shell loads);
 *   render    time inside EffectComposer.render and WebGLRenderer.render,
 *             outermost call only: three.js walking the scene and handing
 *             WebGL its commands;
 *   scene     the rest of the shell's frame callbacks: input, the map's
 *             per frame update, the war, the HUD, audio, streaming;
 *   gpu wait  free running only: the time a frame waited for the GPU to
 *             finish the frame two before it;
 *   other     the frame interval less all of the above: other tasks
 *             (network, timers, input events, GC) and, with --pace=raf,
 *             the wait for the browser's next beat.
 *
 * A sampled DevTools profile over the same window names where the main
 * thread's time went, by function and by the shell function that called
 * it, so a native call that blocks (a WebGL readback) is charged to the
 * shell code that made it.
 *
 * GPU time is WebGL's timer queries (EXT_disjoint_timer_query_webgl2), as
 * swiss2-perf.js takes them: one query open at a time, the frame a run of
 * segments, a segment per composer pass and per shadow map render, `other`
 * for the rest (the lake's mirror, prepasses, anything outside the
 * composer). The card the page draws on is shared with the desktop (see
 * docs/PERF.md), and a query counts the desktop's work too, so beside the
 * median this reports a floor: each segment's tenth percentile, summed.
 *
 * Long tasks come from a PerformanceObserver, garbage collection from the
 * JS heap (performance.memory) falling between two frames.
 *
 * Multi pilot rooms are not flown: a second pilot is a second Chrome, and
 * this measures one browser at a time on purpose (docs/PERF.md).
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
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { loadavg, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { startRooms } from '../edge/rooms/node.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* The owner's target, 2026-10-05: 90 fps. */
const BUDGET_MS = 1000 / 90;

const opts = {
  scenarios: 'itaipu-war,swiss-low,wing-cruise', seconds: 30, preset: 'high', pace: 'free', repeat: 1, cap: 0,
};
const positional = [];
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([a-z]+)(?:=(.*))?$/);
  if (!m) {
    positional.push(a);
    continue;
  }
  if (!(m[1] in opts)) {
    throw new Error(`perf-play: unknown option --${m[1]}`);
  }
  opts[m[1]] = m[2] === undefined ? true : (/^\d+$/.test(m[2]) ? Number(m[2]) : m[2]);
}
if (process.env.SIM_GPU !== '1') {
  throw new Error('perf-play: run with SIM_GPU=1; a software rasteriser\'s timings say nothing about a GPU');
}
if (!['free', 'raf'].includes(opts.pace)) {
  throw new Error(`perf-play: --pace=${opts.pace}, want free or raf`);
}
const outDir = resolve(positional[0] || join(tmpdir(), 'fdfpv-perf-play'));
await mkdir(outDir, { recursive: true });

/*
 * The in page half, installed before the shell's first line runs. It owns
 * globalThis.__PP and nothing in the shell reads it. Until record() is
 * called it only counts; requestAnimationFrame keeps the browser's beat so
 * the shell boots as it always does.
 */
const INSTRUMENT = /* js */ `(() => {
  const PP = globalThis.__PP = {
    gl: null, ext: null, renderer: null, inFrame: false, wasmMs: 0, renderMs: 0,
    wDepth: 0, wT: 0, rDepth: 0, rT: 0, rec: null, free: false, capMs: 0, pilot: null, errors: [],
  };
  const now = () => performance.now();

  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...a) {
    const c = getContext.call(this, type, ...a);
    if (c && type === 'webgl2' && this.id === 'view' && !PP.gl) {
      PP.gl = c;
      PP.ext = c.getExtension('EXT_disjoint_timer_query_webgl2');
    }
    return c;
  };

  /* The exports object of an instance is frozen, so the shell is handed a
   * plain one with each function wrapped. Nested export calls (an export
   * the plant calls back through JS) count once. */
  const wrapExport = (f) => function (...a) {
    if (PP.wDepth++ === 0) { PP.wT = now(); }
    try { return f.apply(this, a); } finally {
      if (--PP.wDepth === 0 && PP.inFrame) { PP.wasmMs += now() - PP.wT; }
    }
  };
  const instantiate = WebAssembly.instantiate;
  WebAssembly.instantiate = async function (src, imports) {
    const r = await instantiate.call(WebAssembly, src, imports);
    const instance = r instanceof WebAssembly.Instance ? r : r.instance;
    const exports = {};
    for (const [k, v] of Object.entries(instance.exports)) {
      exports[k] = typeof v === 'function' ? wrapExport(v) : v;
    }
    const shim = { exports };
    return r instanceof WebAssembly.Instance ? shim : { module: r.module, instance: shim };
  };

  /* GPU segments, as swiss2-perf.js: one TIME_ELAPSED query open at a
   * time, a frame is a list of them, never a nest. */
  let frameSegs = null;
  let open = false;
  let label = 'other';
  const seg = (name) => {
    const gl = PP.gl;
    if (open) { gl.endQuery(PP.ext.TIME_ELAPSED_EXT); open = false; }
    if (name === null || frameSegs === null) { return; }
    const q = gl.createQuery();
    gl.beginQuery(PP.ext.TIME_ELAPSED_EXT, q);
    open = true;
    frameSegs.push({ name, q });
  };
  PP.within = (name, fn) => {
    if (frameSegs === null) { return fn(); }
    const prev = label;
    label = name;
    seg(name);
    try { return fn(); } finally { label = prev; seg(prev); }
  };
  /* Render CPU time: the outermost composer or renderer call. */
  PP.timedRender = (fn) => {
    if (PP.rDepth++ === 0) { PP.rT = now(); }
    try { return fn(); } finally {
      if (--PP.rDepth === 0 && PP.inFrame) { PP.renderMs += now() - PP.rT; }
    }
  };

  const queue = [];
  let nextId = 1;
  let scheduled = false;
  const nativeRaf = window.requestAnimationFrame.bind(window);
  const port = new MessageChannel();
  const fences = [];
  let lastStart = 0;
  let waitFrom = 0;
  const pendingGpu = [];

  const resolveGpu = () => {
    const gl = PP.gl;
    while (pendingGpu.length) {
      const f = pendingGpu[0];
      const lastQ = f.segs[f.segs.length - 1].q;
      if (!gl.getQueryParameter(lastQ, gl.QUERY_RESULT_AVAILABLE)) { return false; }
      pendingGpu.shift();
      const parts = {};
      let total = 0;
      for (const { name, q } of f.segs) {
        const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
        gl.deleteQuery(q);
        parts[name] = (parts[name] || 0) + ms;
        total += ms;
      }
      f.row.gpu = total;
      f.row.gpuParts = parts;
      f.row.disjoint = Boolean(gl.getParameter(PP.ext.GPU_DISJOINT_EXT));
    }
    return true;
  };

  const tick = () => {
    scheduled = false;
    const gl = PP.gl;
    /* --cap: no frame starts sooner after the last than the shell's own
     * frame cap would draw it (main.js: 1000 / cap less 1 ms of slack). */
    if (PP.free && PP.capMs && lastStart && now() - lastStart < PP.capMs) {
      kick();
      return;
    }
    /* Free running, a frame waits for the GPU to finish the frame two
     * before it, or the command queue grows without bound. */
    if (PP.free && fences.length >= 2) {
      if (gl.getSyncParameter(fences[0], gl.SYNC_STATUS) !== gl.SIGNALED) {
        if (!waitFrom) { waitFrom = now(); }
        kick();
        return;
      }
      gl.deleteSync(fences.shift());
    }
    const waited = waitFrom ? now() - waitFrom : 0;
    waitFrom = 0;
    const list = queue.splice(0);
    if (PP.pilot) {
      try { PP.pilot(); } catch (e) { PP.errors.push('pilot: ' + e.message); PP.pilot = null; }
    }
    const t0 = now();
    const rec = PP.rec;
    const timing = rec && gl && PP.ext;
    PP.inFrame = true;
    PP.wasmMs = 0;
    PP.renderMs = 0;
    if (timing) { frameSegs = []; label = 'other'; seg('other'); }
    for (const { cb } of list) {
      try { cb(t0); } catch (e) { setTimeout(() => { throw e; }); }
    }
    let segs = null;
    if (timing) { seg(null); segs = frameSegs; frameSegs = null; }
    PP.inFrame = false;
    if (PP.free && gl) { fences.push(gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)); gl.flush(); }
    const t1 = now();
    if (rec) {
      const info = PP.renderer ? PP.renderer.info.render : null;
      const row = {
        start: t0, interval: lastStart ? t0 - lastStart : null, cb: t1 - t0, wait: waited, wasm: PP.wasmMs, render: PP.renderMs,
        calls: info ? info.calls : null, tris: info ? info.triangles : null,
        heap: performance.memory ? performance.memory.usedJSHeapSize : null, gpu: null,
      };
      rec.push(row);
      if (segs && segs.length) { pendingGpu.push({ segs, row }); }
    }
    lastStart = t0;
    if (gl && PP.ext && pendingGpu.length) { resolveGpu(); }
  };
  const kick = () => {
    if (scheduled) { return; }
    scheduled = true;
    if (PP.free) { port.port2.postMessage(0); } else { nativeRaf(tick); }
  };
  port.port1.onmessage = tick;
  window.requestAnimationFrame = (cb) => { const id = nextId++; queue.push({ id, cb }); kick(); return id; };
  window.cancelAnimationFrame = (id) => {
    const i = queue.findIndex((q) => q.id === id);
    if (i >= 0) { queue.splice(i, 1); }
  };

  const longTasks = [];
  try {
    new PerformanceObserver((l) => {
      if (PP.rec) { for (const e of l.getEntries()) { longTasks.push({ start: e.startTime, ms: e.duration }); } }
    }).observe({ type: 'longtask', buffered: false });
  } catch (e) { PP.errors.push('longtask observer: ' + e.message); }

  /* Called once the map is up: three's prototypes are reachable through
   * the page's import map by then, the same module instances the shell
   * holds. */
  PP.hookThree = async () => {
    const { EffectComposer } = await import('three/addons/postprocessing/EffectComposer.js');
    const NAMES = { RenderPass: 'scene', AoPass: 'ao', CloudPass: 'clouds', MeterPass: 'meter', UnrealBloomPass: 'bloom', PhotoPass: 'photo', OutputPass: 'output' };
    const seen = new WeakSet();
    /* three's WebGLRenderer defines render() in its constructor, not on
     * the prototype, so the shell's renderer is wrapped where a composer
     * first hands it over. */
    const hookRenderer = (r) => {
      if (seen.has(r) || r.getContext() !== PP.gl) { return; }
      seen.add(r);
      PP.renderer = r;
      const rRender = r.render;
      r.render = function (...a) { return PP.timedRender(() => rRender.apply(this, a)); };
      const sm = r.shadowMap;
      const smRender = sm.render;
      sm.render = function (...b) { return PP.within('shadow', () => smRender.apply(this, b)); };
    };
    const cRender = EffectComposer.prototype.render;
    EffectComposer.prototype.render = function (...a) {
      hookRenderer(this.renderer);
      for (const pass of this.passes) {
        if (seen.has(pass)) { continue; }
        seen.add(pass);
        const name = NAMES[pass.constructor.name] || pass.constructor.name;
        const orig = pass.render;
        pass.render = function (...b) { return PP.within(name, () => orig.apply(this, b)); };
      }
      return PP.timedRender(() => cRender.apply(this, a));
    };
    return { gl: Boolean(PP.gl), timer: Boolean(PP.ext) };
  };

  PP.record = async (seconds, free, cap) => {
    const heap0 = performance.memory ? performance.memory.usedJSHeapSize : null;
    longTasks.length = 0;
    PP.dist = 0;
    PP.rec = [];
    PP.free = free;
    PP.capMs = cap > 0 ? 1000 / cap - 1.0 : 0;
    lastStart = 0;
    if (free) { scheduled = false; kick(); }
    await new Promise((done) => setTimeout(done, seconds * 1000));
    const rows = PP.rec;
    PP.rec = null;
    PP.free = false;
    scheduled = false;
    kick();
    for (const f of fences.splice(0)) { PP.gl.deleteSync(f); }
    for (let k = 0; k < 200 && pendingGpu.length && !resolveGpu(); k += 1) {
      await new Promise((done) => setTimeout(done, 20));
    }
    let uaMemory = 'unavailable: not cross origin isolated';
    if (crossOriginIsolated && performance.measureUserAgentSpecificMemory) {
      uaMemory = (await performance.measureUserAgentSpecificMemory()).bytes;
    }
    return { rows, longTasks: longTasks.slice(), heap0, uaMemory, lostGpu: pendingGpu.length, errors: PP.errors.slice() };
  };
})();`;

/*
 * The scripted pilots. Each runs in the page before every frame, outside
 * the frame's timing, and flies on feedback (height over the ground, read
 * with __heightAt) so the same script flies the same path whatever the
 * frame rate. Angle mode, so the stick is an attitude and the craft cannot
 * tumble. A crash is counted, not hidden: the table says how many.
 */
const PILOT = (target, cruise) => /* js */ `(() => {
  let ti = 0;
  let lastY = null;
  let lastT = performance.now();
  globalThis.__PP.crashes = 0;
  let wasCrashed = false;
  globalThis.__PP.pilot = () => {
    const c = window.__craftState();
    if (c.crashed && !wasCrashed) { globalThis.__PP.crashes += 1; }
    wasCrashed = c.crashed;
    const t = performance.now();
    const dt = Math.max(1e-3, (t - lastT) / 1000);
    lastT = t;
    const clr = c.worldY - window.__heightAt(c.worldX, c.worldZ);
    const P = globalThis.__PP;
    if (P.at) { P.dist = (P.dist || 0) + Math.hypot(c.worldX - P.at[0], c.worldZ - P.at[1]); }
    P.at = [c.worldX, c.worldZ];
    P.clr = clr;
    const vy = lastY === null ? 0 : (c.worldY - lastY) / dt;
    lastY = c.worldY;
    const err = ${target} - clr;
    ti = Math.max(-0.4, Math.min(0.4, ti + err * dt * 0.02));
    ${cruise}
  };
  return true;
})()`;

/* A quad: hold the height on throttle, pitch forward (negative pitch is
 * nose down, measured), a slow yaw so the path circles rather than
 * leaving the map. */
const QUAD = (pitch, yaw) => /* js */ `
    const thr = Math.max(0.05, Math.min(1, 0.3 + ti + err * 0.04 - vy * 0.06));
    window.__stick(0, ${pitch}, ${yaw}, thr);`;
/* A wing: full throttle, wings level, the height held on the elevator.
 * The Skyhunter's stick is a rate even in angle mode (measured: a held
 * 0.3 kept pitching it up), so the elevator chases a climb angle and the
 * ailerons chase a level right wing. */
const WING = /* js */ `
    const f = c.fwd;
    const u = c.up;
    const climbSin = Math.max(-0.15, Math.min(0.15, err * 0.01 - vy * 0.01));
    const pitch = Math.max(-0.4, Math.min(0.4, (climbSin - f.y) * 2));
    const rightY = f.z * u.x - f.x * u.z;
    const roll = Math.max(-0.3, Math.min(0.3, rightY * 2));
    window.__stick(roll, pitch, 0, 1);`;

function settingsSeed(s) {
  return `try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    if (!s.perfSeeded) {
      Object.assign(s, ${JSON.stringify(s)}, { perfSeeded: true });
      localStorage.setItem(k, JSON.stringify(s));
    }
  } catch (e) { /* Storage refused: the preset check below fails the run. */ }`;
}

function seated(airframe, map) {
  const s = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, airframe);
  return Object.assign(s, {
    map, freestyleMap: map, graphics: opts.preset, graphicsAuto: false, flightMode: 'angle',
    fpsCap: 0, airframeAsked: true, warConsent: true,
  });
}

async function freePort() {
  const srv = createServer();
  await new Promise((done) => srv.listen(0, '127.0.0.1', done));
  const { port } = srv.address();
  await new Promise((done) => srv.close(done));
  return port;
}

async function fly(page, map) {
  await page.until(`window.__map().id === ${JSON.stringify(map)}`, 10000);
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight' && window.__map().ready", 400000);
}

/* Climb out on the pilot and give the map a few seconds to stream round
 * the craft before the window opens. */
async function climb(page, pilot) {
  await page.evaluate(pilot);
  await page.sleep(8000);
}

const SCENARIOS = {
  /* Defend the Paraná, mission 1, First Light, alone in a private room on
   * a rooms server this run starts. Explosions: whatever the attackers
   * bring, plus a burst of ten every ten seconds (__warFxBurst), so every
   * run has the same explosions in it. */
  'itaipu-war': {
    map: 'itaipu',
    airframe: '7inch',
    async setup() {
      const dir = await mkdtemp(join(tmpdir(), 'perf-rooms-'));
      const port = await freePort();
      const server = await startRooms({ db: join(dir, 'rooms.db'), port });
      return {
        url: `/index.html?rooms=${encodeURIComponent(`http://127.0.0.1:${port}`)}`,
        async stop() { await server.stop(); await rm(dir, { recursive: true, force: true }); },
      };
    },
    async start(page) {
      await page.evaluate("window.__roomCreate({ map: 'itaipu' })");
      await page.until("window.__rooms().phase === 'open' && window.__rooms().roomNow != null", 30000);
      await page.evaluate("window.__ui.act('friends'); true");
      await page.sleep(500);
      await page.evaluate("window.__warDo('start', 'itaipu-1')");
      await page.until("window.__craftState().mode === 'flight' && window.__ui.screen === 'flight'", 120000);
      await page.until("window.__war().view.state === 'live' && window.__map().id === 'itaipu' && window.__map().ready", 600000);
      await climb(page, PILOT(30, QUAD(-0.3, 0.08)));
    },
    during: /* js */ `(async (seconds) => {
      for (let t = 5; t < seconds; t += 10) {
        await new Promise((done) => setTimeout(done, t === 5 ? 5000 : 10000));
        window.__warFxBurst(10);
      }
      return true;
    })`,
    summary: "(() => { const w = window.__war(); return { state: w.view.state, mission: w.view.mission || null, fx: w.fx, booms: w.log.filter((e) => e.type === 'boom').length }; })()",
  },
  /* The Swiss valley at eight metres, forward and circling. */
  'swiss-low': {
    map: 'swiss2',
    airframe: '7inch',
    async start(page) {
      await fly(page, 'swiss2');
      await climb(page, PILOT(8, QUAD(-0.6, 0.06)));
    },
  },
  /* The Skyhunter cruising the Swiss valley at forty metres in a gentle
   * bank. */
  'wing-cruise': {
    map: 'swiss2',
    airframe: 'sky1800',
    async start(page) {
      await fly(page, 'swiss2');
      /* Thrown at cruise speed sixty metres over the pad, as
       * scripts/crashcam-e2e.js throws it: a hand launch is the pilot's
       * arm, which a script does not have. */
      await page.evaluate('window.__stick(0, 0, 0, 1)');
      const pad = await page.evaluate('(() => { const s = window.__craftState(); return { x: s.worldX, z: s.worldZ, g: s.worldY - s.groundClearance }; })()');
      const thrown = await page.evaluate(`window.__crashThrow({ fresh: true, x: ${pad.x}, y: ${pad.g + 60}, z: ${pad.z}, yaw: 30, pitch: 0, vx: -9, vy: 0, vz: -15.6 }).ok`);
      if (!thrown) {
        throw new Error('perf-play: wing-cruise: __crashThrow refused the throw');
      }
      await climb(page, PILOT(40, WING));
    },
  },
};

function gpuLoad() {
  const q = spawnSync('nvidia-smi', ['--query-gpu=index,utilization.gpu', '--format=csv,noheader,nounits'], { encoding: 'utf8' });
  return {
    gpus: (q.stdout || '').trim().split('\n').filter(Boolean).map((l) => l.split(',').map((x) => Number(x.trim()))),
    load: loadavg().map((x) => Math.round(x * 10) / 10),
  };
}

const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : null);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const sortNum = (a) => a.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y);

function summarise(raw) {
  /* The first frame of the window has no interval of its own. */
  const rows = raw.rows.filter((r) => r.interval != null);
  const iv = sortNum(rows.map((r) => r.interval));
  const worst = iv.slice(Math.floor(iv.length * 0.99));
  const cpu = {
    physics: mean(rows.map((r) => r.wasm)),
    scene: mean(rows.map((r) => r.cb - r.wasm - r.render)),
    render: mean(rows.map((r) => r.render)),
    gpuWait: mean(rows.map((r) => r.wait)),
    other: mean(rows.map((r) => r.interval - r.cb - r.wait)),
  };
  const timed = rows.filter((r) => r.gpu != null && !r.disjoint);
  const gpuParts = {};
  for (const r of timed) {
    for (const [k, v] of Object.entries(r.gpuParts)) { (gpuParts[k] ||= []).push(v); }
  }
  const parts = {};
  for (const [k, v] of Object.entries(gpuParts)) {
    const s = sortNum(v.concat(new Array(timed.length - v.length).fill(0)));
    parts[k] = { mean: mean(s), p10: pct(s, 0.1) };
  }
  const gpu = sortNum(timed.map((r) => r.gpu));
  /* A heap that falls between two frames was collected. */
  let gcCount = 0;
  let gcMb = 0;
  for (let k = 1; k < rows.length; k += 1) {
    const d = (rows[k - 1].heap ?? 0) - (rows[k].heap ?? 0);
    if (d > 256 * 1024) { gcCount += 1; gcMb += d / 1048576; }
  }
  const p95 = pct(iv, 0.95);
  return {
    frames: rows.length,
    seconds: rows.length ? (rows[rows.length - 1].start - rows[0].start + rows[0].interval) / 1000 : 0,
    frameMs: {
      avg: mean(iv), p50: pct(iv, 0.5), p95, p99: pct(iv, 0.99), max: iv[iv.length - 1],
    },
    low1Fps: worst.length ? 1000 / mean(worst) : null,
    over: {
      budget: iv.filter((x) => x > BUDGET_MS).length, ms16: iv.filter((x) => x > 1000 / 60).length, ms33: iv.filter((x) => x > 1000 / 30).length,
    },
    headroomMs: { avg: BUDGET_MS - mean(iv), p95: BUDGET_MS - p95 },
    cpu,
    gpuMs: {
      frames: gpu.length, disjoint: rows.filter((r) => r.disjoint).length, avg: mean(gpu), p50: pct(gpu, 0.5), p95: pct(gpu, 0.95),
      floor: Object.values(parts).reduce((a, p) => a + p.p10, 0),
    },
    gpuParts: parts,
    calls: { avg: mean(rows.map((r) => r.calls ?? 0)), max: Math.max(...rows.map((r) => r.calls ?? 0)) },
    trisM: { avg: mean(rows.map((r) => (r.tris ?? 0) / 1e6)), max: Math.max(...rows.map((r) => (r.tris ?? 0) / 1e6)) },
    longTasks: { count: raw.longTasks.length, totalMs: raw.longTasks.reduce((a, t) => a + t.ms, 0), maxMs: Math.max(0, ...raw.longTasks.map((t) => t.ms)) },
    gc: { count: gcCount, mb: gcMb, heapMb: rows.length && rows[rows.length - 1].heap ? rows[rows.length - 1].heap / 1048576 : null },
    uaMemory: raw.uaMemory,
    lostGpu: raw.lostGpu,
    errors: raw.errors,
  };
}

/*
 * The main thread's sampled profile over the window (DevTools Profiler,
 * a sample every half millisecond): self time per function and per source
 * file, in milliseconds per frame second, so "scene update" can be named.
 * Time the main thread spent blocked inside a WebGL call is the caller's
 * self time, or "(program)".
 */
function profileTop(profile, seconds) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  for (let k = 0; k < profile.samples.length; k += 1) {
    const id = profile.samples[k];
    self.set(id, (self.get(id) || 0) + (profile.timeDeltas[k + 1] ?? 0) / 1000);
  }
  const parent = new Map();
  for (const n of profile.nodes) {
    for (const c of n.children || []) { parent.set(c, n.id); }
  }
  const fileOf = (cf) => (cf.url ? cf.url.replace(/^.*?\/\/[^/]+\//, '').replace(/\?.*$/, '') : cf.functionName || '(native)');
  const nameOf = (cf) => `${cf.functionName || '(anonymous)'} ${fileOf(cf)}${cf.url ? `:${cf.lineNumber + 1}` : ''}`;
  /* A native call (a WebGL readback, say) is charged to the shell code
   * that made it: the nearest caller in src/. */
  const shellCaller = (id) => {
    for (let p = id; p != null; p = parent.get(p)) {
      const cf = byId.get(p).callFrame;
      if (/\/src\//.test(cf.url)) { return nameOf(cf); }
    }
    return null;
  };
  const fns = new Map();
  const files = new Map();
  const callers = new Map();
  for (const [id, ms] of self) {
    const cf = byId.get(id).callFrame;
    const file = fileOf(cf);
    const fn = nameOf(cf);
    fns.set(fn, (fns.get(fn) || 0) + ms);
    files.set(file, (files.get(file) || 0) + ms);
    const by = shellCaller(id);
    if (by) { callers.set(by, (callers.get(by) || 0) + ms); }
  }
  const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([what, ms]) => ({ what, msPerS: ms / seconds }));
  return { functions: top(fns, 15), files: top(files, 10), shell: top(callers, 10) };
}

/* Every bucket a frame's time was measured in, CPU and GPU, by mean ms. */
function hotspots(s) {
  const list = [
    ['CPU physics + Betaflight (sim.wasm)', s.cpu.physics],
    ['CPU scene update (shell frame JS less physics and render)', s.cpu.scene],
    ['CPU render submit (three.js)', s.cpu.render],
    ['CPU other (tasks between frames, GC)', s.cpu.other],
    ['waiting on the GPU (frame two back not done)', s.cpu.gpuWait],
    ...Object.entries(s.gpuParts).map(([k, v]) => [`GPU ${k}`, v.mean]),
  ];
  return list.sort((a, b) => b[1] - a[1]).slice(0, 5).map(([what, ms]) => ({ what, ms }));
}

const f = (x, d = 2) => (x == null ? 'n/a' : x.toFixed(d));

function table(id, s) {
  const lines = [
    `${id}: ${s.frames} frames in ${f(s.seconds, 1)} s, preset ${opts.preset}, pace ${opts.pace}${opts.cap ? `, cap ${opts.cap}` : ''}`,
    `  frame ms   avg ${f(s.frameMs.avg)}  p50 ${f(s.frameMs.p50)}  p95 ${f(s.frameMs.p95)}  p99 ${f(s.frameMs.p99)}  max ${f(s.frameMs.max)}  1% low ${f(s.low1Fps, 1)} fps`,
    `  over       11.1 ms ${s.over.budget}  16.7 ms ${s.over.ms16}  33.3 ms ${s.over.ms33}   headroom vs 11.1: avg ${f(s.headroomMs.avg)}  p95 ${f(s.headroomMs.p95)}`,
    `  cpu ms     physics ${f(s.cpu.physics)}  scene ${f(s.cpu.scene)}  render ${f(s.cpu.render)}  other ${f(s.cpu.other)}  gpu wait ${f(s.cpu.gpuWait)}`,
    `  gpu ms     avg ${f(s.gpuMs.avg)}  p50 ${f(s.gpuMs.p50)}  p95 ${f(s.gpuMs.p95)}  floor ${f(s.gpuMs.floor)}  (${s.gpuMs.frames} timed, ${s.gpuMs.disjoint} disjoint)`,
    `  gpu parts  ${Object.entries(s.gpuParts).sort((a, b) => b[1].mean - a[1].mean).map(([k, v]) => `${k} ${f(v.mean)}/${f(v.p10)}`).join('  ')}`,
    `  draws      calls avg ${f(s.calls.avg, 0)} max ${s.calls.max}  tris avg ${f(s.trisM.avg)} M max ${f(s.trisM.max)} M`,
    `  main       long tasks ${s.longTasks.count} (${f(s.longTasks.totalMs, 0)} ms, max ${f(s.longTasks.maxMs, 0)})  gc ${s.gc.count} (${f(s.gc.mb, 0)} MB)  heap ${f(s.gc.heapMb, 0)} MB`,
    `  hotspots   ${s.hotspots.map((h, i) => `${i + 1}. ${h.what} ${f(h.ms)}`).join('  ')}`,
    '  main thread self time, ms per second:',
    ...s.profile.files.slice(0, 6).map((x) => `    file ${f(x.msPerS, 1).padStart(6)}  ${x.what}`),
    ...s.profile.functions.slice(0, 8).map((x) => `    fn   ${f(x.msPerS, 1).padStart(6)}  ${x.what}`),
    ...s.profile.shell.slice(0, 8).map((x) => `    from ${f(x.msPerS, 1).padStart(6)}  ${x.what}`),
  ];
  return lines.join('\n');
}

async function runScenario(id) {
  const sc = SCENARIOS[id];
  if (!sc) {
    throw new Error(`perf-play: no scenario ${id}; have ${Object.keys(SCENARIOS).join(', ')}`);
  }
  const env = sc.setup ? await sc.setup() : null;
  const url = env ? env.url : `/index.html?map=${sc.map}`;
  const page = await openPage({
    root, width: 1600, height: 900, url, seed: [settingsSeed(seated(sc.airframe, sc.map)), INSTRUMENT],
  });
  const stop = () => page.close().finally(() => process.exit(1));
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  try {
    await page.until('window.__shellReady === true', 300000);
    /* The war's room picks its own map, so only the first map is waited
     * for here; each start() waits for its own. */
    await page.until('window.__map && window.__map().ready', 600000);
    const hooked = await page.evaluate('window.__PP.hookThree().then(JSON.stringify)');
    const setup = JSON.parse(hooked);
    if (!setup.gl || !setup.timer) {
      throw new Error(`perf-play: ${id}: no WebGL2 context or no timer queries (${hooked})`);
    }
    const quality = await page.evaluate('window.__ui.settings.graphics');
    if (quality !== opts.preset) {
      throw new Error(`perf-play: asked for ${opts.preset}, the page has ${quality}`);
    }
    await sc.start(page);
    const loadBefore = gpuLoad();
    if (sc.during) {
      page.evaluate(`${sc.during}(${opts.seconds})`).catch(() => {});
    }
    await page.cdp.send('Profiler.enable', {}, page.sessionId);
    await page.cdp.send('Profiler.setSamplingInterval', { interval: 500 }, page.sessionId);
    await page.cdp.send('Profiler.start', {}, page.sessionId);
    const raw = await page.evaluate(`window.__PP.record(${opts.seconds}, ${opts.pace === 'free'}, ${Number(opts.cap) || 0})`);
    const { profile } = await page.cdp.send('Profiler.stop', {}, page.sessionId);
    const loadAfter = gpuLoad();
    const s = summarise(raw);
    s.profile = profileTop(profile, s.seconds);
    s.hotspots = hotspots(s);
    s.crashes = await page.evaluate('window.__PP.crashes || 0');
    s.path = await page.evaluate('({ metres: window.__PP.dist || 0, clearance: window.__PP.clr })');
    s.pace = await page.evaluate('(() => { const p = window.__dynres(); const c = document.getElementById(\'view\'); return { scale: p.scale, rw: c.width, rh: c.height, gpu: window.__gpu && window.__gpu.name }; })()');
    s.state = sc.summary ? await page.evaluate(sc.summary) : await page.evaluate('(() => { const c = window.__craftState(); return { mode: c.mode, crashed: c.crashed, speed: c.speed }; })()');
    s.load = { before: loadBefore, after: loadAfter };
    s.consoleErrors = page.errors.filter((e) => !String(e).startsWith('network:')).slice(0, 5);
    console.log(table(id, s));
    console.log(`  crashes ${s.crashes}  flown ${f(s.path.metres, 0)} m, ending ${f(s.path.clearance, 1)} m up  pace scale ${f(s.pace.scale)} (${s.pace.rw}x${s.pace.rh})  gpu load ${loadBefore.gpus.map((g) => `${g[0]}:${g[1]}%`).join(' ')} host ${loadBefore.load[0]}  state ${JSON.stringify(s.state)}`);
    return { id, map: sc.map, airframe: sc.airframe, summary: s, rows: raw.rows, longTasks: raw.longTasks };
  } finally {
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
    await page.close();
    if (env) {
      await env.stop();
    }
  }
}

const report = {
  when: new Date().toISOString(), budgetMs: BUDGET_MS, preset: opts.preset, pace: opts.pace, seconds: opts.seconds, scenarios: [],
};
/* Each scenario flown `repeat` times: the card is shared, so the run with
 * the least frame time is the one the desktop disturbed least, and the
 * spread says how much it disturbed the others. */
for (const id of String(opts.scenarios).split(',')) {
  const runs = [];
  for (let k = 0; k < opts.repeat; k += 1) {
    runs.push(await runScenario(id));
    report.scenarios.push(runs[runs.length - 1]);
    await writeFile(join(outDir, 'perf-play.json'), JSON.stringify(report));
  }
  if (runs.length > 1) {
    const avgs = runs.map((r) => r.summary.frameMs.avg);
    const floors = runs.map((r) => r.summary.gpuMs.floor);
    console.log(`${id}: best of ${runs.length}: frame avg ${f(Math.min(...avgs))} ms (runs ${avgs.map((x) => f(x)).join(', ')}), gpu floor ${f(Math.min(...floors))} ms (runs ${floors.map((x) => f(x)).join(', ')})`);
  }
}
console.log(`-> ${join(outDir, 'perf-play.json')}`);
