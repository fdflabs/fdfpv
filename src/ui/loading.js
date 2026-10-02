import { str } from '../strings/index.js';
/*
 * loading.js: a loading screen that reports work, not time.
 *
 * WHY THIS IS NOT A SPINNER. The page fetches a 1.2 MB renderer from a CDN,
 * a WebAssembly module, a map module graph of up to sixty one files, and then
 * builds a world that generates a few hundred Canvas2D textures on the main
 * thread. On a slow link the first of those dominates; on a slow machine the
 * last does. A bar on a timer is wrong in both cases and, worse, it is wrong
 * in a way that hides which one is the problem. So every stage here is named
 * and every stage's progress comes from something that actually happened. The
 * player sees the stage by name, a bar and a percentage, and the bar tracks
 * real work, so a stall is a bar that stopped rather than a spinner that lied.
 *
 * WHERE THE PROGRESS COMES FROM, per stage:
 *
 *   Renderer   name and elapsed time only. Streaming the three.js module for
 *              byte progress was built and then withdrawn: measured, the
 *              browser made TWO resource requests for three.module.js, so the
 *              prefetch is not reliably free. See the note in src/boot.js.
 *              This stage does not pretend to know how far through it is.
 *   Simulator  bytes, from the same streamed fetch of dist/sim.wasm, which
 *              the shell needs anyway.
 *   Map        module count, from a PerformanceObserver on resource timing.
 *              The browser walks the import graph itself, so counting the
 *              entries under the map's path is a free and honest measure of
 *              how much of the graph has arrived.
 *   World      the map builder's own onProgress, which reports after each
 *              phase of construction.
 *   First frame  binary, and it is the last thing that happens.
 *
 * WEIGHTS ARE MEASURED, NOT GUESSED. A stage's share of the bar is its
 * measured duration over the total. The defaults below were measured in this
 * container; `planStages` scales the world stage by the map's own recorded
 * build time, so the city's world does not sit inside a slot sized for the
 * field's.
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

/*
 * Measured on this container at 1280 by 720, race field, in the run recorded
 * in PROGRESS.md:
 *
 *     run 1   three 56.6   sim 24.5   module 24.3   world 2885.8   frame 437.8
 *     run 2   three 89.4   sim 19.5   module 34.2   world 3042.4   frame 424.9
 *
 * and the values below are the mean of the two. Under a 1500 kbps throttle the
 * same boot measured three 90.3, sim 362.3, module 895.3, world 2965.9, frame
 * 391.5: the two fetch stages grow by an order of magnitude and the two main
 * thread stages do not move, which is the whole reason the stages are named
 * separately.
 *
 * ONE CAVEAT, and it is the reason the elapsed readout exists. The capture
 * harness serves the three.js CDN from a local cache, so 56.6 ms is a warm
 * fetch and a cold one over a real link is hundreds of milliseconds for
 * 1.2 MB. The weight below is the measured one; on a slow first visit the bar
 * will sit in that stage longer than its share, and the stage name and the
 * seconds beside it are what make that legible rather than mysterious.
 * Replace these with a re-measurement, never with a guess.
 */
export const MEASURED_MS = {
  three: 73,
  /* The board's own round trip on a warm local service. A sleeping Render
   * instance takes about a minute, which is exactly why this stage has a
   * name: the weight is what a healthy load costs, and the elapsed readout
   * beside the name is what carries an unhealthy one. */
  board: 60,
  sim: 22,
  module: 29,
  world: 2964,
  frame: 431,
};

const STAGE_NAMES = {
  three: 'Renderer',
  board: 'Board',
  sim: str('loading.flight_controller'),
  module: 'Map',
  world: 'World',
  frame: str('loading.first_frame'),
};

/*
 * WHAT IS HAPPENING, IN WORDS, AND IT IS ON SCREEN THE WHOLE TIME NOW.
 *
 * This screen used to say "loading" and nothing else until a stage had
 * outstayed STALL_MS, on the argument that a parade of stage names is noise
 * on a load where every stage is over in under a second. That argument was
 * right about a healthy load and wrong about the one the owner reported: the
 * world stage is most of the bar and most of the wall clock, and through all
 * of it the screen said one unchanging word.
 *
 * A line that CHANGES five times is the cheapest proof a page can offer that
 * it is getting somewhere, and the change lands at the moment the previous
 * thing finished, which is precisely the information a waiting visitor
 * wants. The stall behaviour is unchanged and sits on top: once a stage
 * outstays its welcome the line says so, and adds the detail the caller
 * passed, which is what separates a slow network from a slow machine.
 *
 * Present participles, because they name work in progress rather than a
 * component: "Building the world" is a thing happening to you, "World" is a
 * label on a box.
 */
const STAGE_DOING = {
  three: str('loading.loading_the_renderer'),
  board: str('loading.asking_the_leaderboard'),
  sim: str('loading.starting_the_flight_controller'),
  module: str('loading.loading_the_map'),
  world: str('loading.building_the_world'),
  frame: str('loading.drawing_the_first_frame'),
};

/*
 * How much of a stage's slot the bar may cover before the stage actually
 * reports anything.
 *
 * The bar is aimed at this fraction of the slot over the stage's MEASURED
 * duration, with an easing that covers most of the distance early and then
 * creeps. Two properties matter and both are deliberate. It never reaches
 * the end of a slot on the estimate alone, so a stage that overruns leaves a
 * bar still moving inside its own territory rather than a bar sitting on the
 * next stage's doorstep. And a real event always wins: progress() and done()
 * re-aim it forward the moment they arrive.
 *
 * 0.86 rather than something nearer 1 because the last tenth of a slot is
 * where a long stage lives, and a bar with nowhere left to go is the thing
 * this whole file exists to avoid.
 */
const CREEP_TO = 0.86;

/*
 * And how long the creep takes, as a multiple of the measured duration.
 *
 * MUCH longer than the measurement, and the asymmetry is the point. A creep
 * that is too slow costs a jump at the end, at the moment the screen is
 * about to fade out anyway. A creep that is too fast costs a bar parked
 * against the top of its slot with the load still running, which is the
 * exact complaint this file is answering, moved higher up the track.
 *
 * At 3.5 the bar is about three fifths of the way through a stage's slot
 * when that stage was expected to finish, and still moving at three times
 * its estimate. Measured against the town on this container's software
 * rasteriser, which takes about twice its recorded build time: the bar
 * moves for the whole of it.
 */
const CREEP_FACTOR = 3.5;

/*
 * The easing. Fast out of the gate, then progressively slower, so the bar
 * spends its time where the stage does. A linear creep to the same place
 * looks confident for a second and then wrong for five.
 */
const CREEP_EASE = str('loading.cubic_bezier_0_2_0_4');

/*
 * THE FLOOR UNDER A STAGE'S SHARE OF THE BAR.
 *
 * The weights are measured durations and the town's build is nine seconds of
 * the ten, so on that map the world stage owns 94 percent of the bar and the
 * four stages before it share the first six. Honest, and useless: four
 * things really did happen in the first second and the bar could not show
 * any of them, so the load began with a bar that appeared not to move.
 *
 * Every stage gets at least this much of the track, and the rest is shared
 * out by measurement as before. It is a floor on the DRAWING, not a guess
 * about the timing: the bar stops being linear in seconds and starts being
 * legible in stages, which is the trade this screen wants. Six stages at
 * five percent is thirty, so the world still owns most of what is left.
 */
const MIN_SHARE = 0.05;

/*
 * How long a single stage may run before the line says it is stalled.
 *
 * A stall in the CDN fetch and a stall in the world build have completely
 * different answers, so once a stage has outstayed its welcome the line says
 * "still loading" and adds the detail the caller passed, which is exactly
 * when a player has started to wonder.
 *
 * Six seconds because the slowest stage on this container, the city's world
 * build, measures about three, so a healthy load never reaches this.
 */
export const STALL_MS = 6000;

/*
 * WHICH SCREEN EACH STAGE IS ON. The bootloader has four screens, one per
 * part of the real load: the renderer's fetch is the initial boot; the
 * board and the simulator are the system check; the map's module graph and
 * its build are the map loading; the first frame is the finalizing, which
 * the map's own last phase (its shader compile, 'shaders') opens early. A
 * load only ever moves forward through them.
 */
const SCREEN_OF = { three: 1, board: 2, sim: 2, module: 3, world: 3, frame: 4 };

/*
 * A LOAD PLANNED UNDER THIS SHOWS THE FIRST SCREEN ONLY: the boot mark, the
 * line and the bar, because four screens flashing past in a second are
 * noise. Planned, from the measured stage durations above and the map's
 * MAP_BUILD_MS, never from a timer: a swap to the Alps plans about 1.4 s
 * (module 29, world 917, frame 431) and stays minimal; a swap to the Swiss
 * valley (2.5 s of world) or Itaipu shows its screens. A cold boot (a plan
 * with the renderer's stage) always shows all four, whatever it plans: an
 * Alps cold boot plans 1.53 s, too near this line to leave to the numbers.
 */
const MINIMAL_MS = 1500;

/* What a row says in each state. A row says OK only once the step it names
 * has happened on this load, and N/A when this load has no such step. */
const ROW_STATES = ['wait', 'loading', 'ready', 'standby', 'na', 'fail'];

/*
 * Stage plan for one load. `worldMs` is the map's own measured build time, so
 * the world stage takes the share it actually needs.
 */
export function planStages(ids, worldMs) {
  const stages = ids.map((id) => ({
    id,
    name: STAGE_NAMES[id] ?? id,
    ms: id === 'world' ? (worldMs ?? MEASURED_MS.world) : MEASURED_MS[id],
  }));
  const total = stages.reduce((a, s) => a + s.ms, 0);
  /* The floor first, then the measurement over what is left. See MIN_SHARE. */
  const floor = Math.min(MIN_SHARE, 1 / (stages.length || 1));
  const room = 1 - floor * stages.length;
  for (const s of stages) {
    s.weight = floor + (total > 0 ? (s.ms / total) * room : room / stages.length);
  }
  return stages;
}

/*
 * Fetch with byte progress. Returns the bytes. Falls back to a plain fetch on
 * a response with no body reader or no content-length, in which case progress
 * stays at zero for the stage and the elapsed readout is what carries it,
 * which is honest: we do not know, and pretending would be worse.
 */
export async function fetchWithProgress(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch ${url}: ${res.status}`);
  }
  const totalHeader = Number(res.headers.get('content-length'));
  const total = Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : 0;
  if (!res.body || !total) {
    const buf = await res.arrayBuffer();
    if (onProgress) {
      onProgress(1, buf.byteLength, buf.byteLength);
    }
    return new Uint8Array(buf);
  }
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    got += value.length;
    if (onProgress) {
      onProgress(Math.min(1, got / total), got, total);
    }
  }
  const out = new Uint8Array(got);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/*
 * Count modules arriving under a path prefix, using the browser's own
 * resource timing. Costs nothing and needs no cooperation from the modules.
 */
export function moduleCounter(prefix, expected, onProgress) {
  const seen = new Set();
  const note = (name) => {
    if (!name.includes(prefix) || seen.has(name)) {
      return;
    }
    seen.add(name);
    onProgress(Math.min(1, seen.size / expected), seen.size, expected);
  };
  for (const e of performance.getEntriesByType('resource')) {
    note(e.name);
  }
  let observer = null;
  if (typeof PerformanceObserver === 'function') {
    observer = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        note(e.name);
      }
    });
    try {
      observer.observe({ type: 'resource', buffered: true });
    } catch (e) {
      observer = null;
    }
  }
  return {
    stop() {
      if (observer) {
        observer.disconnect();
      }
      return seen.size;
    },
  };
}

/*
 * Give the browser a chance to actually PAINT before the caller blocks the
 * main thread.
 *
 * This is not a nicety, it is the difference between a loading screen and no
 * loading screen. Building the city is about nine seconds of synchronous work
 * on the main thread, and a screenshot taken during it showed the previous
 * frame with no loading screen on it at all: the DOM had been updated, and
 * nothing had been composited. One requestAnimationFrame is not enough
 * either, because a rAF callback runs BEFORE the paint of the frame it is
 * scheduled in, so resolving there and blocking immediately skips that paint
 * as well. Two frames and then a task is the shortest sequence that
 * guarantees the pixels are on screen.
 */
export function yieldToPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 0);
      });
    });
  });
}

/*
 * WHAT THIS BROWSER CAN ACTUALLY DO, asked at the moment of failure.
 *
 * A boot can die for a handful of reasons and they have completely different
 * answers. No WebGL2 is a graphics driver or a hardware acceleration switch.
 * No WebAssembly is a locked down browser or an ancient one. A CDN that never
 * answered is a network, a blocker or a corporate proxy. Telling a stranded
 * visitor to "try Chrome" when their Chrome has hardware acceleration turned
 * off is advice that wastes their time, so every line below is a thing the
 * page checked rather than a thing it assumed.
 *
 * Each probe is wrapped, because a browser hostile enough to break the boot
 * is hostile enough to throw from feature detection.
 */
export function probeBrowser() {
  const out = {
    webgl2: false, webgl1: false, wasm: false, storage: false,
    online: true, softwareRenderer: false, renderer: '', engine: '', version: '',
  };
  try {
    const c = document.createElement('canvas');
    const gl2 = c.getContext('webgl2');
    out.webgl2 = Boolean(gl2);
    out.webgl1 = Boolean(gl2 || c.getContext('webgl'));
    const gl = gl2 || c.getContext('webgl');
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        out.renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
        /* SwiftShader, llvmpipe and ANGLE's software backend all mean the
         * GPU is not being used, which on this workload is the difference
         * between flying and a slideshow. */
        out.softwareRenderer = /swiftshader|llvmpipe|software|basic render/i.test(out.renderer);
      }
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) {
        lose.loseContext();
      }
    }
  } catch (e) { /* Canvas or WebGL refused outright. The flags stay false. */ }
  try {
    out.wasm = typeof WebAssembly === 'object'
      && typeof WebAssembly.instantiate === 'function';
  } catch (e) { /* Same. */ }
  try {
    const k = 'webfpv.probe';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    out.storage = true;
  } catch (e) { /* Private window, or site data blocked. */ }
  try {
    out.online = navigator.onLine !== false;
  } catch (e) { /* No navigator worth reading. Assume online. */ }
  try {
    const ua = navigator.userAgent || '';
    /* Order matters: Edge and Opera both carry "Chrome", and every iOS
     * browser carries "Safari" while actually being Safari's engine. */
    const m = ua.match(/(Edg|OPR|Firefox|Chrome|Version)\/([0-9]+)/);
    if (m) {
      out.engine = { Edg: 'Edge', OPR: 'Opera', Version: 'Safari' }[m[1]] || m[1];
      out.version = m[2];
    }
  } catch (e) { /* No user agent. The advice below still works. */ }
  return out;
}

/*
 * The advice, ordered by what the probe found rather than by a fixed script.
 * Returns { why, steps }: one sentence naming the likely cause when there is
 * one, and the things to try, most likely to fix it first.
 */
export function recoveryAdvice(probe, message) {
  const steps = [];
  let why = '';
  const text = String(message || '');
  const looksNetwork = /fetch|network|load|import|CDN|cdn|jsdelivr|timeout|Failed to/i.test(text);

  if (!probe.wasm) {
    why = str('loading.this_browser_cannot_run_webassembly_which');
    steps.push(str('loading.open_the_simulator_in_a_b'));
  } else if (!probe.webgl2) {
    why = probe.webgl1
      ? str('loading.this_browser_has_webgl_1_but')
      : str('loading.this_browser_is_not_giving_the');
    steps.push(str('loading.turn_b_hardware_acceleration_b_back'));
    steps.push(str('loading.update_your_b_graphics_driver_b'));
    steps.push(str('loading.try_a_different_browser_b_chrome'));
  } else if (looksNetwork || !probe.online) {
    why = probe.online
      ? str('loading.something_the_page_needed_did_not')
      : str('loading.this_device_looks_offline');
    steps.push(str('loading.check_the_connection_then_b_reload'));
    steps.push(str('loading.turn_off_b_ad_blockers_and'));
    steps.push(str('loading.if_you_are_on_a_work'));
  } else {
    why = str('loading.the_page_got_far_enough_to');
    steps.push('<b>Reload without the cache</b>: Ctrl and Shift and R, or Cmd and Shift and R on a Mac.');
    steps.push(str('loading.try_a_b_private_window_b'));
    steps.push(str('loading.try_b_chrome_edge_or_firefox'));
  }

  /* Conditions that do not stop the boot on their own but make it fragile,
   * so they are worth saying once the real cause is named. */
  if (probe.softwareRenderer) {
    steps.push(str('loading.your_browser_is_drawing_with_the', { v1: probe.renderer ? ` (${probe.renderer})` : '' }));
  }
  if (!probe.storage) {
    steps.push(str('loading.this_browser_is_b_blocking_site'));
  }
  steps.push(str('loading.if_none_of_that_works_the'));
  return { why, steps };
}

/*
 * The quiet line at the foot of the screen. A deployed page carries the
 * commit it was built from in <meta name="fdfpv-version">, which
 * scripts/stamp-version.js writes; a page served from a checkout has none.
 */
function buildLine() {
  const meta = document.querySelector('meta[name="fdfpv-version"]');
  const version = meta ? meta.getAttribute('content') : '';
  return version ? str('loading.build', { version }) : str('loading.local_build');
}

export class Loading {
  constructor(root) {
    this.root = root;
    this.bar = root.querySelector('.loading-fill');
    this.sweepEl = root.querySelector('.loading-sweep');
    this.track = root.querySelector('.loading-track');
    this.stageEl = root.querySelector('.loading-stage');
    this.pctEl = root.querySelector('.loading-pct');
    this.errorEl = root.querySelector('.loading-error');
    this.elapsedEl = root.querySelector('.loading-elapsed');
    this.stepEl = root.querySelector('.pdcs-step');
    this.stageNameEl = root.querySelector('.pdcs-stage-name');
    this.mapRowsEl = root.querySelector('.pdcs-rows[data-group="map"]');
    this.mapNameEl = root.querySelector('.pdcs-map-name');
    this.mapImg = root.querySelector('.pdcs-map');
    this.screen = 1;
    /* The phases the map being built declared, in the order it builds
     * them (its module's PHASES). */
    this.phases = [];
    /* The percentage last written. The text and aria-valuenow only ever
     * rise within a load, the same rule as the bar they describe. */
    this.shownPct = 0;
    const build = root.querySelector('.loading-build');
    if (build) {
      build.textContent = buildLine();
    }
    /* Where the bar has been TOLD to go, which is not where it is: the
     * transition between the two is the whole point, and it runs on the
     * compositor. Kept so the bar can never be aimed backwards, which is
     * the one thing a progress bar must never do. */
    this.aimed = 0;
    this.stages = [];
    this.index = -1;
    this.frac = 0;
    this.failed = false;
    this.startedAt = 0;
    this.stageStartedAt = 0;
    /* Every stage's real duration, for the harness and for re-measuring the
     * weights above. Read through window.__loading. */
    this.timings = {};
    this.ticker = null;
    this.visible = !root.hidden;
    /*
     * The pending hide from the last finish().
     *
     * Without this the screen races itself. finish() fades out and then hides
     * the element 320 ms later to match the CSS transition. Choosing a map
     * from the title screen starts a new load well inside that window, so
     * run() would make the screen visible and the stale timeout would then
     * hide it again, leaving an eight second city build behind a frozen
     * picture of the map that was just disposed. Measured exactly that way:
     * the capture at two seconds into a swap showed the race field with the
     * title menu over it and no loading screen at all.
     */
    this.hideTimer = null;
  }

  run(stages) {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.stages = stages;
    this.index = -1;
    this.frac = 0;
    this.failed = false;
    this.startedAt = performance.now();
    this.timings = {};
    this.root.hidden = false;
    this.root.style.opacity = '1';
    this.bar.style.background = '';
    this.root.classList.remove('is-failed');
    if (this.errorEl) {
      this.errorEl.hidden = true;
      this.errorEl.textContent = '';
    }
    this.visible = true;
    this.stageEl.textContent = 'loading';
    this.shownPct = 0;
    this.writePct(0);
    const planned = stages.reduce((a, s) => a + (s.ms || 0), 0);
    const cold = stages.some((s) => s.id === 'three');
    this.root.classList.toggle('is-minimal', !cold && planned < MINIMAL_MS);
    this.root.classList.remove('is-stalled');
    this.labelScreens();
    for (const li of this.root.querySelectorAll('.pdcs-rows li[data-row]')) {
      this.setRow(li, 'wait');
    }
    this.phases = [];
    if (this.mapRowsEl) {
      this.mapRowsEl.textContent = '';
    }
    if (this.mapNameEl) {
      this.mapNameEl.textContent = '';
    }
    if (this.mapImg) {
      this.mapImg.hidden = true;
      this.mapImg.removeAttribute('src');
    }
    this.screen = 0;
    this.showScreen(stages.length ? SCREEN_OF[stages[0].id] || 1 : 1);
    /* The markup carries the English for the first paint, before any
     * locale has loaded; a later load, a map swap, says it in the pilot's. */
    if (this.track) {
      this.track.setAttribute('aria-label', str('loading.progress_label'));
    }
    /* Back to nothing, with no transition, or the new load's first aim is a
     * five second slide back from wherever the last one finished. */
    this.aimed = 0;
    this.bar.style.transition = 'none';
    this.bar.style.transform = 'scaleX(0)';
    /* Read it back, which forces the style to be applied before the next
     * line makes it transitionable again. Without this the browser coalesces
     * the two and the reset never happens. */
    void this.bar.offsetWidth;
    if (this.sweepEl) {
      this.sweepEl.style.display = '';
    }
    this.paint();
    if (!this.ticker) {
      this.ticker = setInterval(() => {
        /* All of them, because a stalled stage is by definition one that has
         * stopped calling progress(), so the tick is the only thing still
         * running. */
        this.paintStage();
        this.paintMeta();
        this.creepOn();
      }, 250);
    }
  }

  start(id) {
    const i = this.stages.findIndex((s) => s.id === id);
    if (i < 0) {
      return;
    }
    this.index = i;
    this.frac = 0;
    this.stageStartedAt = performance.now();
    this.showScreen(SCREEN_OF[id] || this.screen);
    if (id === 'frame') {
      this.final('frame', 'loading');
    }
    this.paint();
    /*
     * And set the bar creeping across the slot this stage has just been
     * given, over the time the stage is expected to take.
     *
     * This is the half of the bar the main thread cannot draw. Every stage
     * that reports from inside itself, the two fetches and the module count,
     * will overtake this within a frame or two and the creep is invisible.
     * The world stage does not: it is one call into a synchronous builder
     * and it reports once, at the end. That is the stage a visitor sits
     * through, and it is the stage this is for.
     */
    const stage = this.stages[i];
    this.aim(this.base(i) + stage.weight * CREEP_TO, stage.ms * CREEP_FACTOR, CREEP_EASE);
  }

  progress(id, frac, detail) {
    if (this.index < 0 || this.stages[this.index].id !== id) {
      this.start(id);
    }
    this.frac = Math.max(0, Math.min(1, frac));
    if (detail !== undefined) {
      /* Shown only once the stage has stalled, by paintStage. Five callers
       * were already setting this and getting nothing; on a healthy load
       * they still get nothing, which is correct, and on a slow one the
       * value they were passing all along is what tells a player which
       * part is slow. */
      this.detail = detail;
    }
    this.paint();
  }

  done(id) {
    const i = this.stages.findIndex((s) => s.id === id);
    if (i < 0) {
      return;
    }
    this.timings[id] = performance.now() - this.stageStartedAt;
    this.index = i;
    this.frac = 1;
    if (id === 'world') {
      this.closePhases(this.phases);
    }
    if (id === 'frame') {
      this.final('frame', 'ready');
    }
    this.paint();
  }

  /*
   * THE BOOTLOADER'S SCREENS AND ROWS. Everything below only writes what a
   * caller reports: a screen when its stage starts, a row when the step it
   * names starts or ends. Nothing here moves on a timer.
   */

  /* Forward only, like the bar: a load never goes back a screen. */
  showScreen(n) {
    if (!n || n <= this.screen) {
      return;
    }
    this.screen = n;
    this.root.dataset.screen = String(n);
    /* Again on every screen: a cold boot's first screen is up before the
     * pilot's locale has loaded, and the next one is not. */
    this.labelScreens();
    if (this.stepEl) {
      this.stepEl.textContent = `[ 0${n} ]`;
    }
    if (this.stageNameEl) {
      this.stageNameEl.textContent = str(`loading.pdcs_stage_${n}`);
    }
  }

  /* The static markup is English for the first paint; a later load says
   * the screens' words in the pilot's language. */
  labelScreens() {
    const set = (sel, key) => {
      const n = this.root.querySelector(sel);
      if (n) {
        n.textContent = str(key);
      }
    };
    set('.pdcs-init', 'loading.pdcs_initializing');
    for (const n of [2, 3, 4]) {
      set(`.pdcs-screen[data-n="${n}"] .pdcs-title`, `loading.pdcs_title_${n}`);
    }
    for (const li of this.root.querySelectorAll('.pdcs-rows[data-group="system"] li, .pdcs-rows[data-group="final"] li')) {
      li.querySelector('.pdcs-row-name').textContent = str(`loading.row_${li.dataset.row}`);
    }
    for (const li of this.root.querySelectorAll('.pdcs-rows li[data-state]')) {
      li.querySelector('.pdcs-row-state').textContent = str(`loading.state_${li.dataset.state}`);
    }
  }

  setRow(li, state) {
    if (!li || !ROW_STATES.includes(state)) {
      return;
    }
    li.dataset.state = state;
    const label = li.querySelector('.pdcs-row-state');
    if (label) {
      label.textContent = str(`loading.state_${state}`);
    }
  }

  /* A system check row: fc, physics, input, audio, online. */
  system(id, state) {
    this.setRow(this.root.querySelector(`.pdcs-rows[data-group="system"] li[data-row="${id}"]`), state);
  }

  /* A finalizing row: shaders, world, frame. */
  final(id, state) {
    this.setRow(this.root.querySelector(`.pdcs-rows[data-group="final"] li[data-row="${id}"]`), state);
  }

  mapRow(id, state) {
    if (!this.mapRowsEl) {
      return;
    }
    this.setRow(this.mapRowsEl.querySelector(`li[data-row="${id}"]`), state);
  }

  /*
   * The map about to be loaded: its name, and its card's poster for the
   * preview when it has one. Asked before the module graph, so the picture
   * has arrived by the time the build blocks the thread.
   */
  mapInfo({ name, poster }) {
    if (this.mapNameEl) {
      this.mapNameEl.textContent = name || '';
    }
    if (this.mapImg && poster) {
      this.mapImg.src = poster;
      this.mapImg.hidden = false;
    }
  }

  /*
   * Once the map's module has arrived: one row per phase its builder
   * declares (PHASES in the map's module), each waiting.
   */
  mapPhases(phases) {
    this.phases = (phases || []).filter((ph) => ph !== 'shaders');
    if (!this.mapRowsEl) {
      return;
    }
    this.mapRowsEl.textContent = '';
    for (const ph of this.phases) {
      const li = document.createElement('li');
      li.dataset.row = ph;
      const label = document.createElement('span');
      label.className = 'pdcs-row-name';
      label.textContent = str(`loading.phase_${ph}`);
      const state = document.createElement('span');
      state.className = 'pdcs-row-state';
      li.append(label, state);
      this.mapRowsEl.append(li);
      this.setRow(li, 'wait');
    }
  }

  /*
   * The builder has started a phase, or several at once. Every phase it
   * declared before them is over, because a builder runs its phases in the
   * order it declared them. 'shaders' is the last: the world is built and
   * its programs are compiling, which is the finalizing screen's first row.
   */
  phase(ids) {
    const started = [].concat(ids).filter(Boolean);
    if (!started.length) {
      return;
    }
    if (started.includes('shaders')) {
      this.closePhases(this.phases);
      this.showScreen(4);
      this.final('shaders', 'loading');
      return;
    }
    const known = started.map((ph) => this.phases.indexOf(ph)).filter((k) => k >= 0);
    if (!known.length) {
      return;
    }
    const first = Math.min(...known);
    this.closePhases(this.phases.filter((ph, k) => k < first && !started.includes(ph)));
    for (const ph of started) {
      this.mapRow(ph, 'loading');
    }
  }

  /*
   * Phases the builder has moved past. One it started is done; one it
   * declared and never started did not happen on this load, so it says
   * N/A rather than OK.
   */
  closePhases(ids) {
    for (const ph of ids) {
      const li = this.mapRowsEl && this.mapRowsEl.querySelector(`li[data-row="${ph}"]`);
      if (li && li.dataset.state === 'loading') {
        this.setRow(li, 'ready');
      } else if (li && li.dataset.state === 'wait') {
        this.setRow(li, 'na');
      }
    }
  }

  /*
   * KEEP GOING WHEN THE ESTIMATE RUNS OUT.
   *
   * A transition arrives. That is the one thing a transition does that an
   * asymptote does not, and a stage that outlives its estimate would
   * otherwise leave the bar parked at the top of its own slot with the load
   * still running, which is the failure this whole file is about, just later
   * and higher up the track.
   *
   * So once the aim has had its time, aim again at HALF the distance left to
   * the end of the slot, over three seconds. Each chain halves the remainder,
   * so the bar always moves and never reaches the next stage's territory.
   *
   * This runs on the ticker, so it only fires when the main thread is free.
   * Inside one long synchronous block nothing here runs and the transition
   * already in flight is what is moving: that is why its duration is a
   * multiple of the measurement rather than the measurement itself.
   */
  creepOn() {
    if (this.failed || this.index < 0 || !this.stages.length) {
      return;
    }
    const stage = this.stages[this.index];
    const running = this.stageStartedAt ? performance.now() - this.stageStartedAt : 0;
    const creepEnd = this.base(this.index) + stage.weight * CREEP_TO;
    /*
     * RE-ARM. A real report that overtook the creep also ended it, because a
     * transition has one target and that report is now it. Without this the
     * bar stops dead after the last thing a stage had to say, which on a
     * world build is four fifths of the way through the longest wait on the
     * screen.
     */
    if (this.aimed < creepEnd - 0.001) {
      const left = Math.max(600, stage.ms * CREEP_FACTOR - running);
      this.aim(creepEnd, left, CREEP_EASE);
      return;
    }
    if (running < stage.ms * CREEP_FACTOR) {
      return;
    }
    /* Past the estimate altogether: halve what is left of the slot, every
     * time, so the bar always moves and never reaches the next stage. */
    const end = this.base(this.index) + stage.weight;
    const left = end - this.aimed;
    /* Under a thousandth of the track is a pixel on a 420 px bar, and
     * re-aiming at it every quarter second is a transition that restarts
     * more often than it moves. */
    if (left < 0.001) {
      return;
    }
    this.aim(this.aimed + left * 0.5, 3000, str('loading.cubic_bezier_0_2_0_6'));
  }

  /* Where this stage's slot starts: every earlier stage's weight. */
  base(i) {
    let v = 0;
    for (let k = 0; k < i && k < this.stages.length; k += 1) {
      v += this.stages[k].weight;
    }
    return v;
  }

  /* Fraction of the whole bar: every completed stage's weight, plus this
   * stage's weight times how far into it we are. */
  value() {
    if (this.index < 0) {
      return 0;
    }
    const stage = this.stages[this.index];
    return this.base(this.index) + (stage ? stage.weight * this.frac : 0);
  }

  /*
   * What the bar is SHOWING right now, which is not what it was last aimed
   * at: the whole point of this screen is the distance between the two.
   *
   * Stale while the main thread is blocked, because this is the main
   * thread's copy of a composited animation, and that is fine: nothing calls
   * it during a block, because nothing runs during a block.
   */
  current() {
    try {
      const m = new DOMMatrix(getComputedStyle(this.bar).transform);
      return Math.max(0, Math.min(1, m.a));
    } catch (e) {
      /* No DOMMatrix, or a transform this cannot parse. The last aim is the
       * best answer available and it is never behind the truth by much. */
      return this.aimed;
    }
  }

  /*
   * Point the bar at a value and give it a time to get there. Returns
   * whether it took.
   *
   * FORWARD ONLY, AND AGAINST WHAT IS DRAWN rather than against the last
   * aim. That distinction is the bug this comment is here to stop coming
   * back: the creep is aimed at the far end of a stage's slot, so comparing
   * against the aim meant every real report for the rest of that stage was
   * dropped as "behind", and a screen that had measured four honest phases
   * of a world build drew none of them. Compared against the position, a
   * report that is ahead of the creep overtakes it and a report that is
   * behind is correctly ignored.
   *
   * The value is a scale, not a width. See the stylesheet: the transition
   * has to be composited or it stops with the main thread, and the main
   * thread is what this screen is waiting for.
   */
  aim(to, ms, ease = 'linear') {
    const want = Math.max(0, Math.min(1, to));
    if (want <= this.current()) {
      return false;
    }
    this.aimed = want;
    this.bar.style.transition = `transform ${Math.max(0, Math.round(ms))}ms ${ease}`;
    this.bar.style.transform = `scaleX(${want.toFixed(4)})`;
    /*
     * AND START IT NOW, IN THIS TASK.
     *
     * A transition does not begin when the style is set, it begins at the
     * next style recalc, and the next style recalc is a rendering step the
     * main thread has to run. Set an aim and then block for four seconds
     * building a world and the transition has still not started when the
     * block begins, so there is nothing for the compositor to carry through
     * it: measured, and it is exactly the window this screen exists for.
     *
     * Reading a computed style forces the recalc here instead, so the
     * animation is handed to the compositor before the caller gets the
     * thread back. One forced recalc per aim, a handful per load.
     */
    void getComputedStyle(this.bar).transform;
    return true;
  }

  paint() {
    if (!this.visible) {
      return;
    }
    /*
     * A REAL EVENT ALWAYS WINS, and it wins by being ahead.
     *
     * Everything the loader actually knows arrives here: bytes read, modules
     * counted, a stage finished. If that is further along than the estimate
     * has crept to, the bar is re-aimed at it over a fifth of a second, and
     * a fast stage simply overtakes its own creep. If it is behind, aim()
     * drops it and the creep carries on, because a stage reporting 0.3 while
     * the estimate has reached 0.5 has not told us anything new.
     */
    this.aim(this.value(), 200, 'linear');
    this.paintStage();
    this.paintMeta();
  }

  /*
   * How far through the load, as a number, and how long it has taken.
   *
   * The percentage is read off the bar as DRAWN, not as aimed: the aim is
   * the far end of a creep that may take seconds to get there, and a number
   * that ran ahead of the bar beside it would be the lie this file exists to
   * avoid. Both the number and the seconds are main thread text, so they
   * stop while the world build blocks the thread and catch up when it
   * returns; the composited bar and the sweep carry that window, and a
   * frozen number next to a moving bar is the honest picture of a thread
   * that is busy rather than gone.
   */
  paintMeta() {
    if (!this.failed) {
      this.writePct(Math.floor(this.current() * 100));
    }
    if (!this.elapsedEl) {
      return;
    }
    const secs = this.startedAt ? Math.floor((performance.now() - this.startedAt) / 1000) : 0;
    /* Nothing at all for the first couple of seconds. A healthy load is over
     * in about three, and a stopwatch on a screen that is about to vanish
     * reads as a warning about a wait that never happened. */
    const text = secs >= 2 ? `${secs}s` : '';
    if (this.elapsedEl.textContent !== text) {
      this.elapsedEl.textContent = text;
    }
  }

  /*
   * What is being done, named, for the whole of the load. See STAGE_DOING.
   *
   * Once a stage outstays STALL_MS the line says so and adds the detail the
   * caller passed, which is the one thing that separates a slow network from
   * a slow machine: "still loading the map, 31 of 72 modules" is a
   * diagnosis, and a bar cannot make one.
   */
  paintStage() {
    if (this.failed) {
      return;
    }
    const stage = this.index >= 0 ? this.stages[this.index] : null;
    const running = this.stageStartedAt ? performance.now() - this.stageStartedAt : 0;
    let text = 'loading';
    this.root.classList.toggle('is-stalled', Boolean(stage && running > STALL_MS));
    if (stage && running > STALL_MS) {
      const name = (STAGE_NAMES[stage.id] || stage.id).toLowerCase();
      text = str('loading.still_loading_the', { name });
      if (this.detail) {
        text += `, ${this.detail}`;
      }
    } else if (stage) {
      text = STAGE_DOING[stage.id] || str('loading.loading_the', { v1: (STAGE_NAMES[stage.id] || stage.id).toLowerCase() });
    }
    if (this.stageEl.textContent !== text) {
      this.stageEl.textContent = text;
    }
  }

  /*
   * The number beside the bar and the progressbar's aria-valuenow, always
   * the same value. Never backwards within a load: run() resets shownPct.
   */
  writePct(pct) {
    const v = Math.max(this.shownPct, Math.min(100, Math.max(0, Math.round(pct))));
    this.shownPct = v;
    if (this.pctEl && this.pctEl.textContent !== `${v}%`) {
      this.pctEl.textContent = `${v}%`;
    }
    if (this.track && this.track.getAttribute('aria-valuenow') !== String(v)) {
      this.track.setAttribute('aria-valuenow', String(v));
    }
  }

  /*
   * The dead end, made an exit.
   *
   * This used to be a red bar, one sentence and nothing to press. A visitor
   * whose boot died had no way to tell a blocked CDN from a missing driver,
   * no way to retry without knowing to reload, and no idea which browser
   * would have worked. Everything below is either something the page just
   * measured or an action the visitor can take.
   */
  fail(message) {
    this.failed = true;
    this.stageEl.textContent = str('loading.could_not_start');
    if (this.errorEl) {
      this.errorEl.textContent = message;
      this.errorEl.hidden = false;
    }
    this.root.classList.add('is-failed');
    for (const li of this.root.querySelectorAll('.pdcs-rows li[data-state="loading"]')) {
      this.setRow(li, 'fail');
    }
    /* Full, red, and STILL: a sweep under a dead end is a page pretending to
     * work on something. transition none as well as the aim, because the
     * creep it interrupts would otherwise take five seconds to arrive. */
    this.aimed = 0;
    this.bar.style.transition = 'none';
    this.bar.style.transform = 'scaleX(1)';
    this.bar.style.background = '#e8503a';
    if (this.sweepEl) {
      this.sweepEl.style.display = 'none';
    }
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
    /* The screen may have been faded out by a previous finish(). A failure
     * has to be visible whatever the last load did. */
    this.root.hidden = false;
    this.root.style.opacity = '1';
    this.visible = true;
    this.paintHelp(message);
  }

  paintHelp(message) {
    const help = this.root.querySelector('.loading-help');
    if (!help) {
      return;
    }
    let probe;
    let advice;
    try {
      probe = probeBrowser();
      advice = recoveryAdvice(probe, message);
    } catch (e) {
      /* The advice must never be the thing that fails. A visitor who got
       * here is already having a bad time. */
      probe = {};
      advice = {
        why: '',
        steps: [str('loading.reload_the_page_if_it_keeps')],
      };
    }

    help.textContent = '';
    const h = document.createElement('h3');
    h.textContent = str('loading.what_to_try');
    help.append(h);

    if (advice.why) {
      const why = document.createElement('p');
      why.className = 'loading-why';
      why.textContent = advice.why;
      help.append(why);
    }

    const ol = document.createElement('ol');
    for (const step of advice.steps) {
      const li = document.createElement('li');
      /* The steps are authored above in this file, not user input, and the
       * only markup in them is <b>. Built as elements rather than assigned
       * as HTML so nothing here is an injection point if a step ever grows
       * a value from somewhere else. */
      for (const part of String(step).split(/(<b>.*?<\/b>)/)) {
        if (!part) {
          continue;
        }
        const bold = part.startsWith('<b>');
        const node = bold ? document.createElement('b') : document.createTextNode(part);
        if (bold) {
          node.textContent = part.slice(3, -4);
        }
        li.append(node);
      }
      ol.append(li);
    }
    help.append(ol);

    const actions = document.createElement('div');
    actions.className = 'loading-actions';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = str('loading.try_again');
    retry.addEventListener('click', () => {
      /* A plain reload. The cache-bypassing one needs a keystroke the page
       * cannot send, which is why it is step one in the list above. */
      window.location.reload();
    });
    actions.append(retry);

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'quiet';
    copy.textContent = str('loading.copy_the_details');
    copy.addEventListener('click', async () => {
      const report = [
        str('loading.fdfpv_failed_to_start', { message }),
        str('loading.browser', { v1: probe.engine || 'unknown', v2: probe.version || '' }).trim(),
        str('loading.webgl2_webgl1_wasm', { webgl2: probe.webgl2, webgl1: probe.webgl1, wasm: probe.wasm }),
        str('loading.storage_online', { storage: probe.storage, online: probe.online }),
        probe.renderer ? str('loading.renderer', { renderer: probe.renderer }) : '',
        str('loading.url', { href: window.location.href }),
        str('loading.agent', { userAgent: navigator.userAgent }),
      ].filter(Boolean).join('\n');
      try {
        await navigator.clipboard.writeText(report);
        copy.textContent = str('loading.copied');
      } catch (e) {
        /* Clipboard refused, which is common without a secure context. Show
         * the text instead so it can still be selected by hand. */
        copy.textContent = str('loading.select_and_copy');
        const pre = document.createElement('div');
        pre.className = 'loading-detail';
        pre.textContent = report;
        help.append(pre);
      }
    });
    actions.append(copy);
    help.append(actions);

    const detail = document.createElement('div');
    detail.className = 'loading-detail';
    detail.textContent = [
      probe.engine ? `${probe.engine} ${probe.version}` : '',
      str('loading.webgl2', { v1: probe.webgl2 ? 'yes' : 'no' }),
      str('loading.webassembly', { v1: probe.wasm ? 'yes' : 'no' }),
      `site data ${probe.storage ? 'yes' : 'blocked'}`,
    ].filter(Boolean).join('  .  ');
    help.append(detail);

    help.hidden = false;
    /* Focus the way out, so a keyboard visitor is not left hunting for it
     * and a screen reader lands on something actionable. */
    try {
      retry.focus();
    } catch (e) { /* Not focusable yet. The button is still clickable. */ }
  }

  finish() {
    this.frac = 1;
    this.index = this.stages.length - 1;
    this.paint();
    /* All the way, quickly. paint() aims at value(), which is 1 here, but
     * only if the last stage was planned; a load that finished early leaves
     * the creep somewhere short and the screen fades out over a bar that
     * never arrived. */
    this.aim(1, 180, 'linear');
    /* Written here rather than left to a tick: the screen is about to go,
     * and the last thing it says is that the load is complete. */
    this.writePct(100);
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
    this.visible = false;
    this.root.style.opacity = '0';
    /* Matches the CSS transition. Hidden as well as transparent, because a
     * transparent overlay still eats pointer events on some browsers even at
     * pointer-events none if a child sets it back. */
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      this.root.hidden = true;
    }, 320);
    this.timings.total = performance.now() - this.startedAt;
  }
}
