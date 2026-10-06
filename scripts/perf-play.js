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
 *         [--mode=quality|balanced|performance] [--objects]
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
 * the tail a pilot with the cap on sees. --mode seeds the performance
 * mode; quality holds the resolution at the preset's, so a before and an
 * after draw the same pixels and dynamic resolution cannot hide a cost.
 * Left out, the settings' default (balanced) applies.
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
 * segments, a segment per composer pass and per shadow map render, a
 * segment per renderer.render outside the composer named `draw <src file>`
 * after the code that made it (the lake's mirror, the sensor view's scene
 * draws), and `other` for the rest (full screen quads, uploads). The card
 * the page draws on is shared with the desktop (see docs/PERF.md), and a
 * query counts the desktop's work too, so beside the median this reports
 * a floor: each segment's tenth percentile, summed. --objects also splits
 * every draw by mesh (`scene:<top>/<mesh>`, `draw ...:<top>/<mesh>`) with
 * the mesh's onBeforeRender and onAfterRender, as swiss2-perf.js does:
 * a diagnostic, its hundreds of queries a frame cost time of their own,
 * so its frame times are not comparable with a run without it.
 *
 * Long tasks come from a PerformanceObserver, garbage collection from the
 * JS heap (performance.memory) falling between two frames.
 *
 * HITCHES. Every texture upload, buffer upload and program link on the
 * view's context is timed and sized per frame, and each one over 1 ms is
 * named (a texture by its size, a program by the defines that tell its
 * variant apart and by the object being drawn when it was needed). The sampled profile is cut into busy runs, a run being
 * the samples between two idle ones, and every run over 16.7 ms is
 * reported with the shell subsystem its time went to. That needs idle
 * time between frames, so read it from a --pace=raf run: free running
 * never idles, and its runs are the whole window. raf's own "over 16.7
 * ms" count is the beat's jitter round 16.7, not a result; the frame
 * tail and the max are read from a free running run.
 *
 * itaipu-stream (not in the default list) flies Itaipu flat out across
 * its town for the world streaming round a fast craft.
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
import { PERF_MODES } from '../src/render/dynres.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* The owner's target, 2026-10-05: 90 fps. */
const BUDGET_MS = 1000 / 90;

const opts = {
  scenarios: 'itaipu-war,swiss-low,wing-cruise', seconds: 30, preset: 'high', pace: 'free', repeat: 1, cap: 0, mode: '', objects: false,
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
if (opts.mode && !PERF_MODES.includes(opts.mode)) {
  throw new Error(`perf-play: --mode=${opts.mode}, want one of ${PERF_MODES.join(', ')}`);
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
      wrapUploads(c);
    }
    return c;
  };

  /* WHAT A FRAME HANDED THE GPU. Texture uploads, buffer uploads and
   * program links on the view's context, timed and sized per frame, and
   * every one that took over 1 ms in a frame of the window named in
   * PP.events: a texture by its size and format, a program by the
   * SHADER_NAME three writes into its source. getProgramInfoLog is where
   * three blocks on a link the driver runs in parallel, so the link's
   * cost is charged there. The wrappers sit on the context object, so
   * they see three's calls and nothing else's. */
  PP.up = { texMs: 0, texBytes: 0, texN: 0, bufMs: 0, bufBytes: 0, progMs: 0, progN: 0 };
  PP.events = [];
  function wrapUploads(gl) {
    const bytesOf = (a) => {
      for (let k = a.length - 1; k >= 0; k -= 1) {
        const v = a[k];
        if (v && typeof v === 'object') {
          if (ArrayBuffer.isView(v)) { return v.byteLength; }
          if (typeof v.width === 'number' && typeof v.height === 'number') { return v.width * v.height * 4; }
        }
      }
      return 0;
    };
    const describe = (a) => {
      const src = a.find((v) => v && typeof v === 'object' && !ArrayBuffer.isView(v) && typeof v.width === 'number');
      const nums = a.filter((v) => typeof v === 'number');
      return (src ? (src.constructor && src.constructor.name) + ' ' + src.width + 'x' + src.height : 'data ' + nums.slice(0, 8).join(','));
    };
    const note = (kind, ms, what) => {
      if (PP.rec && ms > 1) { PP.events.push({ t: now(), kind, ms: Math.round(ms * 100) / 100, what }); }
    };
    for (const name of ['texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'compressedTexImage2D', 'compressedTexSubImage2D', 'compressedTexImage3D', 'compressedTexSubImage3D', 'texStorage2D', 'texStorage3D', 'generateMipmap']) {
      const f = gl[name].bind(gl);
      gl[name] = (...a) => {
        const t = now();
        try { return f(...a); } finally {
          const ms = now() - t;
          const b = name.startsWith('texStorage') || name === 'generateMipmap' ? 0 : bytesOf(a);
          PP.up.texMs += ms; PP.up.texBytes += b; PP.up.texN += 1;
          if (ms > 1) { note(name, ms, describe(a) + ' ' + Math.round(b / 1024) + ' KB'); }
        }
      };
    }
    for (const name of ['bufferData', 'bufferSubData']) {
      const f = gl[name].bind(gl);
      gl[name] = (...a) => {
        const t = now();
        try { return f(...a); } finally {
          const ms = now() - t;
          const b = a[1] && a[1].byteLength ? a[1].byteLength : (typeof a[1] === 'number' ? a[1] : 0);
          PP.up.bufMs += ms; PP.up.bufBytes += b;
          if (ms > 1) { note(name, ms, Math.round(b / 1024) + ' KB'); }
        }
      };
    }
    /* three's SHADER_NAME is the material's name, empty for most, so a
     * program is also named by the defines that tell variants apart:
     * the material's kind, fog, the thermal kind, and the colour space
     * it writes (a screen and a render target differ there). */
    const drawingName = () => {
      const chain = [];
      for (let o = PP.drawing; o && chain.length < 5; o = o.parent) { chain.push(o.name || o.type); }
      const m = PP.drawingMat;
      return chain.join(' < ') + (m ? ' [' + m.type + (m.name ? ' ' + m.name : '') + ']' : '');
    };
    const shaderName = (p) => {
      try {
        const src = (gl.getAttachedShaders(p) || []).map((sh) => gl.getShaderSource(sh) || '').join('\\n');
        const name = (/#define SHADER_NAME (.*)/.exec(src) || [])[1] || '';
        const kind = (/#define (STANDARD|PHYSICAL|PHONG|LAMBERT|TOON|MATCAP|BASIC|DEPTH|DISTANCE|NORMAL)\\b/.exec(src) || [])[1] || 'shader';
        const tags = [];
        if (/#define USE_FOG\\b/.test(src)) { tags.push('fog'); }
        const th = /#define THERMAL_KIND (\\S+)/.exec(src);
        if (th) { tags.push('thermal ' + th[1]); }
        if (/#define USE_INSTANCING\\b/.test(src)) { tags.push('instanced'); }
        if (/#define USE_SHADOWMAP\\b/.test(src)) { tags.push('shadowed'); }
        const out = /linearToOutputTexel\\( vec4 value \\) \\{ return \\( sRGBTransferOETF/.test(src) ? 'srgb out' : 'linear out';
        return [name || '(unnamed)', kind, out, ...tags].join(' ');
      } catch (e) { /* A deleted program has no shaders to name it by. */ }
      return '?';
    };
    for (const name of ['linkProgram', 'getProgramInfoLog', 'compileShader', 'getShaderInfoLog', 'getProgramParameter']) {
      const f = gl[name].bind(gl);
      gl[name] = (...a) => {
        const t = now();
        try { return f(...a); } finally {
          const ms = now() - t;
          PP.up.progMs += ms;
          if (name === 'linkProgram') { PP.up.progN += 1; }
          if (ms > 1) { note(name, ms, (name.includes('Program') ? shaderName(a[0]) : '') + ' for ' + drawingName()); }
        }
      };
    }
  }

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
        up: PP.up,
      };
      rec.push(row);
      if (segs && segs.length) { pendingGpu.push({ segs, row }); }
    }
    lastStart = t0;
    /* Uploads since the last frame ended, between frames included. */
    PP.up = { texMs: 0, texBytes: 0, texN: 0, bufMs: 0, bufBytes: 0, progMs: 0, progN: 0 };
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
      /* A draw outside every composer pass (label still 'other') gets a
       * segment of its own, named after the src/ file that made it, so
       * the lake's mirror and the sensor view's scene draws are told
       * apart. The name is taken from a stack once per render target. */
      const named = new WeakMap();
      const SCREEN = {};
      const drawer = () => {
        const key = r.getRenderTarget() || SCREEN;
        let name = named.get(key);
        if (name === undefined) {
          const lines = String(new Error().stack).split('\\n');
          const own = lines.find((l) => /\\/src\\//.test(l) && !/\\/vendor\\/|three/.test(l)) || '';
          const m = own.match(/\\/src\\/([^:?]+)/);
          name = m ? 'draw ' + m[1].replace(/\\.js$/, '') : 'draw other';
          named.set(key, name);
        }
        return name;
      };
      r.render = function (...a) {
        if (label !== 'other') { return PP.timedRender(() => rRender.apply(this, a)); }
        return PP.within(drawer(), () => PP.timedRender(() => rRender.apply(this, a)));
      };
      /* The object being drawn, so a program linked in a frame can be
       * named after what needed it. */
      const rbd = r.renderBufferDirect;
      r.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
        PP.drawing = object;
        PP.drawingMat = material;
        return rbd.call(this, camera, scene, geometry, material, object, group);
      };
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
        if (name === 'scene' && !PP.scene) { PP.scene = pass.scene; }
        const orig = pass.render;
        pass.render = function (...b) { return PP.within(name, () => orig.apply(this, b)); };
      }
      return PP.timedRender(() => cRender.apply(this, a));
    };
    return { gl: Boolean(PP.gl), timer: Boolean(PP.ext) };
  };

  /* --objects: each mesh in the scene is its own segment inside
   * whichever draw is drawing it. Meshes the map streams in after this
   * count toward the draw round them. */
  PP.tagObjects = () => {
    let n = 0;
    PP.scene.children.forEach((top) => {
      top.traverse((m) => {
        if (!m.isMesh && !m.isLine && !m.isPoints) { return; }
        const name = (top === m ? '' : (top.name || top.type) + '/') + (m.name || m.type);
        const before = m.onBeforeRender;
        const after = m.onAfterRender;
        m.onBeforeRender = function (...a) { before.apply(this, a); if (frameSegs !== null) { seg(label + ':' + name); } };
        m.onAfterRender = function (...a) { after.apply(this, a); if (frameSegs !== null) { seg(label); } };
        n += 1;
      });
    });
    return n;
  };

  PP.record = async (seconds, free, cap) => {
    const heap0 = performance.memory ? performance.memory.usedJSHeapSize : null;
    longTasks.length = 0;
    PP.events.length = 0;
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
    const t0 = rows.length ? rows[0].start : 0;
    const events = PP.events.splice(0).map((e) => ({ ...e, t: Math.round(e.t - t0) / 1000 }));
    return { rows, events, longTasks: longTasks.slice(), heap0, uaMemory, lostGpu: pendingGpu.length, errors: PP.errors.slice() };
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

/* A quad through a list of waypoints, world x and z: the yaw stick
 * turns the nose toward the next one, the pitch is held, and a waypoint
 * within 150 m is passed. Past the last it holds the last heading. */
const QUAD_TO = (pitch, points) => /* js */ `
    const P2 = globalThis.__PP;
    const pts = ${JSON.stringify(points)};
    P2.wp = P2.wp || 0;
    if (P2.wp < pts.length - 1 && Math.hypot(pts[P2.wp][0] - c.worldX, pts[P2.wp][1] - c.worldZ) < 150) { P2.wp += 1; }
    const goal = pts[P2.wp];
    const want = Math.atan2(goal[0] - c.worldX, goal[1] - c.worldZ);
    const have = Math.atan2(c.fwd.x, c.fwd.z);
    const turn = Math.atan2(Math.sin(want - have), Math.cos(want - have));
    const yaw = Math.max(-0.5, Math.min(0.5, -turn * 0.6));
    const thr = Math.max(0.05, Math.min(1, 0.45 + ti + err * 0.04 - vy * 0.06));
    window.__stick(0, ${pitch}, yaw, thr);`;

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
    fpsCap: 0, airframeAsked: true, warConsent: true, ...(opts.mode ? { perfMode: opts.mode } : {}),
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
  /* Itaipu at speed: thrown at 30 m/s over the river below the dam and
   * flown flat out, 50 m up, north east across Hernandarias, the town's
   * densest blocks (osm/buildings.json: 977 footprints in the square
   * kilometre at x 1 to 2 km, z 3 to 4 km), toward the hero square's
   * edge. What it measures is the world streaming round a fast craft:
   * the terrain's chunk builds, the town's and the trees' collider
   * refills, whatever the map uploads on the way. Free flight, no war. */
  'itaipu-stream': {
    map: 'itaipu',
    airframe: '7inch',
    async start(page) {
      await fly(page, 'itaipu');
      const from = [-600, 1200];
      const path = [[1500, 3500], [3200, 4300], [5000, 5000]];
      const h = await page.evaluate(`window.__heightAt(${from[0]}, ${from[1]})`);
      const d = Math.hypot(path[0][0] - from[0], path[0][1] - from[1]);
      const vx = (30 * (path[0][0] - from[0])) / d;
      const vz = (30 * (path[0][1] - from[1])) / d;
      const yaw = (Math.atan2(-vx, -vz) * 180) / Math.PI;
      const thrown = await page.evaluate(`window.__crashThrow({ fresh: true, x: ${from[0]}, y: ${h + 50}, z: ${from[1]}, yaw: ${yaw}, pitch: 0, vx: ${vx}, vy: 0, vz: ${vz} }).ok`);
      if (!thrown) {
        throw new Error('perf-play: itaipu-stream: __crashThrow refused the throw');
      }
      await page.evaluate(PILOT(50, QUAD_TO(-0.9, path)));
      /* No settling wait: the streaming is the point. */
      await page.sleep(1000);
    },
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
    uploads: {
      texMb: rows.reduce((a, r) => a + (r.up ? r.up.texBytes : 0), 0) / 1048576,
      texMs: rows.reduce((a, r) => a + (r.up ? r.up.texMs : 0), 0),
      texN: rows.reduce((a, r) => a + (r.up ? r.up.texN : 0), 0),
      bufMb: rows.reduce((a, r) => a + (r.up ? r.up.bufBytes : 0), 0) / 1048576,
      bufMs: rows.reduce((a, r) => a + (r.up ? r.up.bufMs : 0), 0),
      progN: rows.reduce((a, r) => a + (r.up ? r.up.progN : 0), 0),
      progMs: rows.reduce((a, r) => a + (r.up ? r.up.progMs : 0), 0),
      maxFrameMs: Math.max(0, ...rows.map((r) => (r.up ? r.up.texMs + r.up.bufMs + r.up.progMs : 0))),
      events: (raw.events || []).slice().sort((a, b) => b.ms - a.ms).slice(0, 20),
    },
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
  return {
    functions: top(fns, 15), files: top(files, 10), shell: top(callers, 10), hitches: hitchesOf(profile, byId, parent, nameOf),
  };
}

/*
 * WHAT THE LONG STRETCHES WERE. The table above averages the window, and a
 * hitch is a tenth of a percent of it. So the samples are walked in time
 * order and cut into busy runs: consecutive samples that are not
 * "(idle)". A run is one task, a frame or whatever ran between two
 * frames (a fetch's continuation, a decode, a collection), and one over
 * HITCH_MS is a hitch whatever it was. Each is reported with the shell
 * functions its time went to, each sample charged to the OUTERMOST src/
 * frame under the map or main.js's frame callback that is not the frame
 * loop itself, and to the innermost src/ frame, so "terrain buildSome"
 * and "three's uploadTexture under look/ground.js" can both be read off.
 */
const HITCH_MS = 1000 / 60;

function hitchesOf(profile, byId, parent, nameOf) {
  const src = (cf) => /\/src\//.test(cf.url);
  /* The innermost src/ frame, and the frame under main.js nearest the
   * root that is not main.js itself: which subsystem the frame loop
   * called. */
  const chargeCache = new Map();
  const charge = (id) => {
    if (chargeCache.has(id)) { return chargeCache.get(id); }
    let inner = null;
    let outer = null;
    for (let p = id; p != null; p = parent.get(p)) {
      const cf = byId.get(p).callFrame;
      if (!src(cf)) { continue; }
      if (!inner) { inner = nameOf(cf); }
      if (!/\/src\/main\.js$/.test(cf.url.replace(/\?.*$/, ''))) { outer = nameOf(cf); }
    }
    const leaf = byId.get(id).callFrame;
    const c = { inner: inner || leaf.functionName || '(native)', outer: outer || inner || leaf.functionName || '(native)', leaf: nameOf(leaf) };
    chargeCache.set(id, c);
    return c;
  };
  const runs = [];
  let run = null;
  let t = profile.startTime;
  for (let k = 0; k < profile.samples.length; k += 1) {
    t += profile.timeDeltas[k] ?? 0;
    const id = profile.samples[k];
    const dt = (profile.timeDeltas[k + 1] ?? 0) / 1000;
    const idle = byId.get(id).callFrame.functionName === '(idle)';
    if (idle) {
      if (run) { runs.push(run); run = null; }
      continue;
    }
    if (!run) { run = { at: (t - profile.startTime) / 1e6, ms: 0, samples: [] }; }
    run.ms += dt;
    run.samples.push([id, dt]);
  }
  if (run) { runs.push(run); }
  const add = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
  const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([what, ms]) => ({ what, ms: Math.round(ms * 10) / 10 }));
  const all = { outer: new Map(), inner: new Map(), leaf: new Map() };
  /* The last run is the profiler being stopped and the window's result
   * handed back, not the shell. */
  const end = (profile.endTime - profile.startTime) / 1e6 - 0.3;
  const list = runs.filter((r) => r.ms > HITCH_MS && r.at < end).map((r) => {
    const outer = new Map();
    const inner = new Map();
    const leaf = new Map();
    for (const [id, dt] of r.samples) {
      const c = charge(id);
      add(outer, c.outer, dt);
      add(inner, c.inner, dt);
      add(leaf, c.leaf, dt);
      add(all.outer, c.outer, dt);
      add(all.inner, c.inner, dt);
      add(all.leaf, c.leaf, dt);
    }
    return { at: Math.round(r.at * 100) / 100, ms: Math.round(r.ms * 10) / 10, outer: top(outer, 4), inner: top(inner, 4), leaf: top(leaf, 4) };
  });
  return {
    count: list.length,
    over33: list.filter((h) => h.ms > 1000 / 30).length,
    totalMs: Math.round(list.reduce((a, h) => a + h.ms, 0)),
    byOuter: top(all.outer, 10),
    byInner: top(all.inner, 10),
    byLeaf: top(all.leaf, 10),
    worst: list.sort((a, b) => b.ms - a.ms).slice(0, 12),
  };
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
    `  gpu parts  ${Object.entries(s.gpuParts).sort((a, b) => b[1].mean - a[1].mean).slice(0, opts.objects ? 40 : Infinity).map(([k, v]) => `${k} ${f(v.mean)}/${f(v.p10)}`).join(opts.objects ? '\n             ' : '  ')}`,
    `  draws      calls avg ${f(s.calls.avg, 0)} max ${s.calls.max}  tris avg ${f(s.trisM.avg)} M max ${f(s.trisM.max)} M`,
    `  main       long tasks ${s.longTasks.count} (${f(s.longTasks.totalMs, 0)} ms, max ${f(s.longTasks.maxMs, 0)})  gc ${s.gc.count} (${f(s.gc.mb, 0)} MB)  heap ${f(s.gc.heapMb, 0)} MB`,
    `  uploads    textures ${s.uploads.texN} (${f(s.uploads.texMb, 1)} MB, ${f(s.uploads.texMs, 1)} ms)  buffers ${f(s.uploads.bufMb, 1)} MB (${f(s.uploads.bufMs, 1)} ms)  programs linked ${s.uploads.progN} (${f(s.uploads.progMs, 1)} ms)  worst frame ${f(s.uploads.maxFrameMs, 1)} ms`,
    ...s.uploads.events.slice(0, 8).map((e) => `    at ${f(e.t, 1).padStart(5)} s  ${f(e.ms, 1).padStart(6)} ms  ${e.kind} ${e.what}`),
    `  hotspots   ${s.hotspots.map((h, i) => `${i + 1}. ${h.what} ${f(h.ms)}`).join('  ')}`,
    '  main thread self time, ms per second:',
    ...s.profile.files.slice(0, 6).map((x) => `    file ${f(x.msPerS, 1).padStart(6)}  ${x.what}`),
    ...s.profile.functions.slice(0, 8).map((x) => `    fn   ${f(x.msPerS, 1).padStart(6)}  ${x.what}`),
    ...s.profile.shell.slice(0, 8).map((x) => `    from ${f(x.msPerS, 1).padStart(6)}  ${x.what}`),
    `  hitches    main thread runs over ${f(HITCH_MS, 1)} ms: ${s.profile.hitches.count} (${s.profile.hitches.over33} over 33.3), ${s.profile.hitches.totalMs} ms in all; by subsystem, ms:`,
    ...s.profile.hitches.byOuter.slice(0, 6).map((x) => `    sub  ${f(x.ms, 1).padStart(7)}  ${x.what}`),
    ...s.profile.hitches.byLeaf.slice(0, 6).map((x) => `    leaf ${f(x.ms, 1).padStart(7)}  ${x.what}`),
    ...s.profile.hitches.worst.slice(0, 6).map((h) => `    at ${f(h.at, 1).padStart(5)} s  ${f(h.ms, 1).padStart(6)} ms  ${h.outer.slice(0, 2).map((x) => `${x.what} ${f(x.ms, 1)}`).join('; ')}`),
  ];
  return lines.join('\n');
}

/* The swiss2 meadow's streaming counters (vegetation/grass.js), by
 * layer; maxFrameMs is since the map was built. */
const GRASS_STATS = `(() => {
  const out = {};
  if (window.__PP.scene) {
    window.__PP.scene.traverse((o) => { if (o.userData && o.userData.grassStats) { out[o.name] = { ...o.userData.grassStats }; } });
  }
  return out;
})()`;

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
    if (opts.objects) {
      const n = await page.evaluate('window.__PP.tagObjects()');
      console.log(`  objects: ${n} meshes tagged`);
    }
    const grassBefore = await page.evaluate(GRASS_STATS);
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
    /* The swiss2 meadow's streaming (vegetation/grass.js stats), where
     * the map has it: tiles worked out, how many in the frame that
     * needed them, and the main thread time that cost. */
    const grassAfter = await page.evaluate(GRASS_STATS);
    s.grass = {};
    for (const [name, g] of Object.entries(grassAfter)) {
      const g0 = grassBefore[name] || { built: 0, forced: 0, buildMs: 0 };
      s.grass[name] = { ...g, built: g.built - g0.built, forced: g.forced - g0.forced, buildMs: g.buildMs - g0.buildMs };
    }
    s.load = { before: loadBefore, after: loadAfter };
    s.consoleErrors = page.errors.filter((e) => !String(e).startsWith('network:')).slice(0, 5);
    console.log(table(id, s));
    for (const [name, g] of Object.entries(s.grass)) {
      console.log(`  ${name}: tiles built ${g.built} (${g.forced} in the frame that needed them), ${f(g.buildMs, 0)} ms in all, ${f(g.buildMs / Math.max(1, g.built), 2)} ms a tile, worst frame since the build ${f(g.maxFrameMs, 1)} ms, pending ${g.pending}`);
    }
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
/* The war scenario's rooms server leaves its room's purge alarm
 * (edge/rooms/node.js Room.schedule) on the event loop after stop(),
 * which held this process open once the report was written. */
process.exit(0);
