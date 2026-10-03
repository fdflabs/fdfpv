import { str } from '../strings/index.js';
/*
 * loading.js: the PDCS bootloader, a loading screen that reports work, not
 * time.
 *
 * THE SCREEN is the owner's bootloader of 3 October (index.html
 * #pdcs-loader): four screens, initial boot, system check, map loading and
 * finalizing, each with the rows the spec names, and its controller API,
 * show, hide, stage, setProgress, progress, mapProgress, finalProgress,
 * status, system, mapSystem, finalSystem and complete, all on the one
 * object, which is window.loader as the spec has it and window.__loading as
 * the harness has always read it. The same overlay is the cold boot, every
 * world swap, and a room link being retried (hold); a load planned short
 * and a held link show the minimal loader, the mark, a line and a bar.
 *
 * WHY THIS IS NOT A SPINNER. The page fetches a 1.2 MB renderer from a CDN,
 * a WebAssembly module, a map module graph of up to sixty one files, and then
 * builds a world that generates a few hundred Canvas2D textures on the main
 * thread. On a slow link the first of those dominates; on a slow machine the
 * last does. A bar on a timer is wrong in both cases and, worse, it is wrong
 * in a way that hides which one is the problem. So every stage here is named
 * and every stage's progress comes from something that actually happened,
 * and nothing on the screen moves on a timer: a stall is a bar that stopped,
 * with a sweep inside its track saying the page is still alive, and once the
 * stage has outstayed STALL_MS a line that names it.
 *
 * WHERE THE PROGRESS COMES FROM, per stage:
 *
 *   Renderer   start and end only. Streaming the three.js module for byte
 *              progress was built and then withdrawn: measured, the browser
 *              made TWO resource requests for three.module.js, so the
 *              prefetch is not reliably free. See the note in src/boot.js.
 *   Board      start and end, the published track's round trip.
 *   Simulator  bytes, from the same streamed fetch of dist/sim.wasm, which
 *              the shell needs anyway.
 *   Map        module count, from a PerformanceObserver on resource timing.
 *              The browser walks the import graph itself, so counting the
 *              entries under the map's path is a free and honest measure of
 *              how much of the graph has arrived.
 *   World      the map builder's own onProgress, which names each phase as
 *              it starts it and yields to paint between them.
 *   First frame  binary, and it is the last thing that happens.
 *
 * WHICH BAR SHOWS WHAT. The spec draws a bar on the boot, map and final
 * screens. Each shows the stages that belong to its screen (SCREEN_OF),
 * weighted by their measured durations: the boot bar the renderer, the map
 * bar the module graph and the build; the final bar is the finalizing rows
 * done, one quarter each, as the spec's integration steps it. The minimal
 * loader's one bar is the whole load.
 *
 * WEIGHTS ARE MEASURED, NOT GUESSED. A stage's share of a bar is its
 * measured duration over the total. The defaults below were measured in this
 * container; `planStages` scales the world stage by the map's own recorded
 * build time.
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
 * separately. Replace these with a re-measurement, never with a guess.
 */
export const MEASURED_MS = {
  three: 73,
  /* The board's own round trip on a warm local service. A sleeping Render
   * instance takes about a minute, which is exactly why this stage has a
   * name: the weight is what a healthy load costs, and the stall line is
   * what carries an unhealthy one. */
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
 * What each stage is doing, in words, for the status line once a stage has
 * stalled: "still loading the map, 31 of 72 modules" is a diagnosis, and a
 * bar cannot make one. Present participles, because they name work in
 * progress rather than a component.
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
 * THE FLOOR UNDER A STAGE'S SHARE OF THE BAR.
 *
 * The weights are measured durations, and a world's build is most of a
 * load, so without a floor the cheap stages would share a sliver nobody
 * could see move. Every stage gets at least this much, and the rest is
 * shared out by measurement. It is a floor on the DRAWING, not a guess about
 * the timing.
 */
const MIN_SHARE = 0.05;

/*
 * How long a single stage may run before the status line says it is
 * stalled. A stall in the CDN fetch and a stall in the world build have
 * completely different answers, so the line names the stage and adds the
 * detail the caller passed. Six seconds because the slowest stage on this
 * container, a world build, measures about three, so a healthy load never
 * reaches this.
 */
export const STALL_MS = 6000;

/*
 * WHICH SCREEN EACH STAGE IS ON. The renderer's fetch is the initial boot;
 * the board and the simulator are the system check; the map's module graph
 * and its build are the map loading; the first frame is the finalizing,
 * which the map's own last phase (its shader compile, 'shaders') opens
 * early. A load only ever moves forward through them.
 */
const SCREEN_OF = { three: 1, board: 2, sim: 2, module: 3, world: 3, frame: 4 };

/*
 * A LOAD PLANNED UNDER THIS SHOWS THE MINIMAL LOADER: the mark, the line
 * and the bar, because four screens flashing past in a second are noise.
 * Planned, from the measured stage durations above and the map's
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
 * THE SPEC'S MAP AND FINAL ROWS, FROM THE PHASES A BUILDER REALLY RUNS.
 *
 * Every world declares the phases its builder runs, in order (PHASES in
 * its module), and names each to its progress callback as it starts it.
 * Each phase is the work behind one or more of the spec's rows:
 *
 *   the valleys (src/maps/alps.js valleyPhases; swiss2 adds finish)
 *     look      sky, light and materials          ENVIRONMENT
 *     terrain   the heightfield and its ground    TERRAIN DATA, HEIGHTMAPS
 *     nature    forests, meadows and water        VEGETATION
 *     village   houses and the road               BUILDINGS, ROADS & INFRA
 *     life      traffic and people                ROADS & INFRA
 *     finish    huts, lake town, forests, the     BUILDINGS, VEGETATION,
 *               mountains' shadow and light       ENVIRONMENT
 *   Itaipu (src/maps/itaipu.js)
 *     imagery   the satellite photographs         SATELLITE IMAGERY
 *     data      the map's vector data             TERRAIN DATA
 *     heightmaps  the elevation tiles             HEIGHTMAPS
 *     dam       the dam                           ROADS & INFRA
 *     water     the reservoir                     ENVIRONMENT
 *     town      buildings and roads               BUILDINGS, ROADS & INFRA
 *     vegetation                                  VEGETATION
 *     war       the switchyard                    ROADS & INFRA
 *   both
 *     shaders   the scene's programs compiled     SCENE INTEGRATION
 *
 * A row is LOADING from the first of its phases starting until the last of
 * them has ended, OK once all have, and N/A when the world being built has
 * none of them: the valleys have no satellite imagery, and say so. WORLD
 * DATA (the world's water and ground handed to the simulator) and
 * SIMULATION CORE (the run seated on the world, until its first frame) are
 * not builder phases; src/main.js sets them as they happen.
 */
export const PHASE_ROWS = {
  look: ['final:environment'],
  terrain: ['map:terrain', 'map:height'],
  nature: ['map:vegetation'],
  village: ['map:buildings', 'map:roads'],
  life: ['map:roads'],
  finish: ['map:buildings', 'map:vegetation', 'final:environment'],
  imagery: ['map:satellite'],
  data: ['map:terrain'],
  heightmaps: ['map:height'],
  dam: ['map:roads'],
  water: ['final:environment'],
  town: ['map:buildings', 'map:roads'],
  vegetation: ['map:vegetation'],
  war: ['map:roads'],
  shaders: ['final:scene'],
};

/* The spec's element ids, by group and row name (its system, mapSystem and
 * finalSystem tables). */
const ROW_IDS = {
  system: {
    flight: 'sys-flight', physics: 'sys-physics', input: 'sys-input',
    audio: 'sys-audio', telemetry: 'sys-telemetry', online: 'sys-online',
  },
  map: {
    terrain: 'map-terrain', satellite: 'map-satellite', height: 'map-height',
    buildings: 'map-buildings', vegetation: 'map-vegetation', roads: 'map-roads',
  },
  final: {
    world: 'final-world', core: 'final-core', environment: 'final-env', scene: 'final-scene',
  },
};

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

/* The three bars the spec draws, by the screen each is on. */
const BARS = {
  boot: ['boot-progress', 'boot-progress-text'],
  map: ['map-progress', 'map-progress-text'],
  final: ['final-progress', 'final-progress-text'],
};

export class Loading {
  constructor(root) {
    this.root = root;
    this.screens = {
      1: root.querySelector('#screen-boot'),
      2: root.querySelector('#screen-check'),
      3: root.querySelector('#screen-map'),
      4: root.querySelector('#screen-final'),
    };
    this.stageNumber = root.querySelector('#loader-stage-number');
    this.stageName = root.querySelector('#loader-stage-name');
    this.actionEl = root.querySelector('.boot-action');
    this.statusEl = root.querySelector('.loader-status');
    this.footLeft = root.querySelector('#loader-footer-left');
    this.errorEl = root.querySelector('.loading-error');
    this.mapNameEl = root.querySelector('.map-name');
    this.mapImg = root.querySelector('#map-preview img');
    const build = root.querySelector('#loader-footer-center');
    if (build) {
      build.textContent = buildLine();
    }
    this.screen = 1;
    this.minimal = false;
    /* Where each bar has been told to go on this load. A bar only ever
     * moves forward within a load, the one thing a progress bar must never
     * get wrong; run() puts them back to nothing. */
    this.barAt = { boot: 0, map: 0, final: 0 };
    /* The phases the world being built declared (its module's PHASES),
     * each 'wait', 'run' or 'done', in the order it runs them. */
    this.phases = new Map();
    this.stages = [];
    this.index = -1;
    this.frac = 0;
    this.doneIds = new Set();
    this.failed = false;
    this.startedAt = 0;
    this.stageStartedAt = 0;
    this.detail = '';
    /* Every stage's real duration, for the harness and for re-measuring the
     * weights above. Read through window.__loading. */
    this.timings = {};
    this.ticker = null;
    /* A load is running: from run() until finish() or fail(). A held link
     * never takes the screen from one. */
    this.loading = false;
    /* 'reconnect' or 'restart' while the screen is held for a room link
     * being retried, null otherwise. */
    this.held = null;
    /*
     * The pending hide from the last complete().
     *
     * Without this the screen races itself. complete() hides the screen a
     * moment after the last frame, and choosing a map from the title starts
     * a new load well inside that window, so run() would show the screen
     * and the stale timeout would then hide it again, leaving a world build
     * behind a frozen picture of the map that was just disposed. Measured
     * exactly that way once.
     */
    this.hideTimer = null;
  }

  /* THE SPEC'S CONTROLLER. */

  show() {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.root.hidden = false;
    this.root.classList.remove('hidden');
  }

  /* Faded by the class, as the spec has it, and then hidden outright once
   * the fade is over: a transparent overlay at this z-index would still sit
   * over every menu for anything that reads what is on top. */
  hide() {
    this.root.classList.add('hidden');
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
    }
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      this.root.hidden = true;
    }, 400);
  }

  stage(number) {
    for (const [n, el] of Object.entries(this.screens)) {
      el.classList.toggle('active', Number(n) === number);
    }
    this.stageNumber.textContent = `[ 0${number} ]`;
    this.stageName.textContent = str(`loading.pdcs_stage_${number}`);
  }

  /* Forward only within a load. The fill is a scale rather than a width:
   * see .progress-fill in index.html. */
  setProgress(barId, textId, amount) {
    const fill = this.root.querySelector(`#${barId}`);
    const key = Object.keys(BARS).find((k) => BARS[k][0] === barId);
    if (!fill) {
      return;
    }
    let percent = Math.max(0, Math.min(100, Number(amount) || 0));
    if (key) {
      percent = Math.max(this.barAt[key], percent);
      this.barAt[key] = percent;
    }
    fill.style.transform = `scaleX(${(percent / 100).toFixed(4)})`;
    const text = this.root.querySelector(`#${textId}`);
    if (text) {
      text.textContent = `${Math.round(percent)}%`;
    }
    const track = fill.parentElement;
    if (track && track.getAttribute('role') === 'progressbar') {
      track.setAttribute('aria-valuenow', String(Math.round(percent)));
    }
  }

  progress(amount) {
    this.setProgress(...BARS.boot, amount);
  }

  mapProgress(amount) {
    this.setProgress(...BARS.map, amount);
  }

  finalProgress(amount) {
    this.setProgress(...BARS.final, amount);
  }

  /* The spec's states, OK, LOADING and WAIT, and this game's three more:
   * STANDBY (built, waiting on something outside the load), N/A (this load
   * has no such step) and FAILED. The row carries the state too, for the
   * label's colour and for the harness. */
  status(elementId, state) {
    const el = this.root.querySelector(`#${elementId}`);
    if (!el || !ROW_STATES.includes(state)) {
      return;
    }
    el.classList.remove('ready', 'loading', 'fail');
    if (state === 'ready' || state === 'loading' || state === 'fail') {
      el.classList.add(state);
    }
    el.textContent = str(`loading.state_${state}`);
    if (el.parentElement && el.parentElement.dataset.state !== state) {
      el.parentElement.dataset.state = state;
    }
  }

  system(name, state) {
    this.status(ROW_IDS.system[name], state);
  }

  mapSystem(name, state) {
    this.status(ROW_IDS.map[name], state);
  }

  /* Each finalizing row is a quarter of the final bar, as the spec's
   * integration steps it: the bar is the rows that are over. */
  finalSystem(name, state) {
    this.status(ROW_IDS.final[name], state);
    const rows = [...this.root.querySelectorAll('[data-group="final"] .system-row')];
    const over = rows.filter((r) => r.dataset.state === 'ready' || r.dataset.state === 'na').length;
    this.finalProgress((over / rows.length) * 100);
  }

  complete() {
    this.finalProgress(100);
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
    }
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      this.hide();
    }, 400);
  }

  /* THE LOAD. Everything below only writes what a caller reports: a stage
   * starting, reporting and ending, a row's step starting and ending. */

  run(stages) {
    this.show();
    this.stages = stages;
    this.index = -1;
    this.frac = 0;
    this.doneIds = new Set();
    this.failed = false;
    this.loading = true;
    this.held = null;
    this.detail = '';
    this.startedAt = performance.now();
    this.stageStartedAt = 0;
    this.timings = {};
    this.root.classList.remove('is-failed', 'is-stalled', 'is-held');
    if (this.errorEl) {
      this.errorEl.hidden = true;
      this.errorEl.textContent = '';
    }
    const help = this.root.querySelector('.loading-help');
    if (help) {
      help.hidden = true;
    }
    const planned = stages.reduce((a, s) => a + (s.ms || 0), 0);
    const cold = stages.some((s) => s.id === 'three');
    this.minimal = !cold && planned < MINIMAL_MS;
    this.root.classList.toggle('is-minimal', this.minimal);
    if (this.footLeft) {
      this.footLeft.textContent = str(cold ? 'loading.foot_boot' : 'loading.foot_map');
    }
    this.labelScreens();
    for (const group of Object.keys(ROW_IDS)) {
      for (const name of Object.keys(ROW_IDS[group])) {
        this.status(ROW_IDS[group][name], 'wait');
      }
    }
    this.phases = new Map();
    if (this.mapNameEl) {
      this.mapNameEl.textContent = '';
    }
    if (this.mapImg) {
      this.mapImg.hidden = true;
      this.mapImg.removeAttribute('src');
    }
    for (const key of Object.keys(BARS)) {
      this.resetBar(key);
    }
    this.statusLine('');
    this.screen = 0;
    this.showScreen(stages.length ? SCREEN_OF[stages[0].id] || 1 : 1);
    if (!this.ticker) {
      /* The stall line, and nothing else: a stalled stage is by definition
       * one that has stopped reporting, so the tick is the only thing that
       * can notice. It moves no bar and no row. */
      this.ticker = setInterval(() => this.paintStall(), 250);
    }
  }

  /* A bar back to nothing, with no transition, or the next aim is a slide
   * back from wherever the last load finished. Read back, which forces the
   * style to apply before the transition is restored. */
  resetBar(key) {
    const [barId, textId] = BARS[key];
    const fill = this.root.querySelector(`#${barId}`);
    fill.style.transition = 'none';
    this.barAt[key] = 0;
    this.setProgress(barId, textId, 0);
    void fill.offsetWidth;
    fill.style.transition = '';
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
      this.finalSystem('core', 'loading');
    }
    this.paint();
  }

  /* A stage's own measure of how far through it is, 0 to 1, and the detail
   * the stall line adds if the stage outstays its welcome. */
  report(id, frac, detail) {
    if (this.index < 0 || this.stages[this.index].id !== id) {
      this.start(id);
    }
    this.frac = Math.max(0, Math.min(1, frac));
    if (detail !== undefined) {
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
    this.doneIds.add(id);
    if (id === 'world') {
      this.closePhases();
    }
    if (id === 'frame') {
      this.finalSystem('core', 'ready');
    }
    this.paint();
  }

  /* Forward only, like the bars: a load never goes back a screen. A
   * minimal load stays on the first. */
  showScreen(n) {
    if (!n || n <= this.screen) {
      return;
    }
    this.screen = n;
    this.root.dataset.screen = String(n);
    /* Again on every screen: a cold boot's first screen is up before the
     * pilot's locale has loaded, and the next one is not. */
    this.labelScreens();
    this.stage(this.minimal ? 1 : n);
  }

  /* The static markup is English for the first paint; a later screen, and
   * any later load, says the words in the pilot's language. */
  labelScreens() {
    const set = (sel, key) => {
      const n = this.root.querySelector(sel);
      if (n) {
        n.textContent = str(key);
      }
    };
    if (!this.held) {
      set('.boot-action', 'loading.pdcs_initializing');
    }
    set('#map-title', 'loading.pdcs_title_3');
    set('#final-title', 'loading.pdcs_title_4');
    for (const label of this.root.querySelectorAll('[data-label]')) {
      label.textContent = str(`loading.${label.dataset.label}`);
    }
    for (const row of this.root.querySelectorAll('.system-row[data-state]')) {
      row.lastElementChild.textContent = str(`loading.state_${row.dataset.state}`);
    }
    const labels = { boot: 'loading.progress_label', map: 'loading.pdcs_stage_3', final: 'loading.pdcs_stage_4' };
    for (const [key, [barId]] of Object.entries(BARS)) {
      const track = this.root.querySelector(`#${barId}`).parentElement;
      track.setAttribute('aria-label', str(labels[key]));
    }
  }

  /*
   * The map about to be loaded: its name, and its card's poster for the
   * preview. Asked before the module graph, so the picture has arrived by
   * the time the build blocks the thread.
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
   * Once the map's module has arrived: the phases its builder declares
   * (PHASES in the map's module). A spec row none of them stands behind
   * says N/A from here on.
   */
  mapPhases(phases) {
    this.phases = new Map((phases || []).filter((ph) => PHASE_ROWS[ph]).map((ph) => [ph, 'wait']));
    this.paintPhaseRows();
  }

  /*
   * The builder has started a phase, or several at once. Every phase it
   * declared before them is over, because a builder runs its phases in the
   * order it declared them. 'shaders' is the last: the world is built and
   * its programs are compiling, which opens the finalizing screen.
   */
  phase(ids) {
    const started = [].concat(ids).filter((ph) => this.phases.has(ph));
    if (!started.length) {
      return;
    }
    const order = [...this.phases.keys()];
    const first = Math.min(...started.map((ph) => order.indexOf(ph)));
    for (const ph of order.slice(0, first)) {
      this.phases.set(ph, this.phases.get(ph) === 'run' ? 'done' : this.phases.get(ph) === 'wait' ? 'skip' : this.phases.get(ph));
    }
    for (const ph of started) {
      this.phases.set(ph, 'run');
    }
    if (started.includes('shaders')) {
      this.showScreen(4);
    }
    this.paintPhaseRows();
  }

  /* The builder has returned: every phase it ran is over, and one it
   * declared and never started did not happen on this load. */
  closePhases() {
    for (const [ph, st] of this.phases) {
      this.phases.set(ph, st === 'run' || st === 'done' ? 'done' : 'skip');
    }
    this.paintPhaseRows();
  }

  /* Each spec row from the phases behind it. See PHASE_ROWS. */
  paintPhaseRows() {
    const rows = { map: Object.keys(ROW_IDS.map), final: ['environment', 'scene'] };
    for (const [group, names] of Object.entries(rows)) {
      for (const name of names) {
        const behind = [...this.phases.entries()].filter(([ph]) => PHASE_ROWS[ph].includes(`${group}:${name}`)).map(([, st]) => st);
        let state = 'na';
        if (behind.some((st) => st === 'run') || (behind.includes('done') && behind.includes('wait'))) {
          state = 'loading';
        } else if (behind.includes('done') && behind.every((st) => st === 'done' || st === 'skip')) {
          state = 'ready';
        } else if (behind.includes('wait')) {
          state = 'wait';
        }
        if (group === 'final') {
          this.finalSystem(name, state);
        } else {
          this.mapSystem(name, state);
        }
      }
    }
  }

  /* How far through its own screen's stages the load is, 0 to 1: every
   * stage of that screen weighted, each done, under way or not begun. A
   * minimal load's one screen is all of them. */
  screenValue(n) {
    let have = 0;
    let all = 0;
    this.stages.forEach((s, i) => {
      if (!this.minimal && (SCREEN_OF[s.id] || 1) !== n) {
        return;
      }
      all += s.weight;
      if (this.doneIds.has(s.id)) {
        have += s.weight;
      } else if (i === this.index) {
        have += s.weight * this.frac;
      }
    });
    return all > 0 ? have / all : 0;
  }

  paint() {
    if (this.failed) {
      return;
    }
    this.progress(this.screenValue(1) * 100);
    if (!this.minimal) {
      this.mapProgress(this.screenValue(3) * 100);
    }
    this.paintStall();
  }

  statusLine(text) {
    if (this.statusEl && this.statusEl.textContent !== text) {
      this.statusEl.textContent = text;
    }
  }

  /*
   * Once a stage outstays STALL_MS the status line says so and adds the
   * detail the caller passed, which is the one thing that separates a slow
   * network from a slow machine.
   */
  paintStall() {
    if (this.failed || this.held || !this.loading) {
      return;
    }
    const stage = this.index >= 0 ? this.stages[this.index] : null;
    const stalled = Boolean(stage && this.stageStartedAt && performance.now() - this.stageStartedAt > STALL_MS);
    this.root.classList.toggle('is-stalled', stalled);
    if (!stalled) {
      this.statusLine('');
      return;
    }
    const name = (STAGE_NAMES[stage.id] || stage.id).toLowerCase();
    this.statusLine(str('loading.still_loading_the', { name }) + (this.detail ? `, ${this.detail}` : ''));
  }

  /*
   * THE SAME SCREEN FOR A ROOM LINK BEING RETRIED: 'reconnect' after a drop,
   * 'restart' when the rooms server said it was restarting (close 1012,
   * edge/rooms/node.js). The minimal loader with the line saying which, a
   * bar that sweeps and claims no amount, because a retry has none, and the
   * status line naming the attempt. Never over a load: a world being built
   * owns the screen, and the next retry asks again once it is done.
   */
  hold(kind, detail = '') {
    if (this.loading || this.failed) {
      return false;
    }
    this.held = kind;
    this.show();
    this.root.classList.add('is-minimal', 'is-held');
    this.root.classList.remove('is-stalled');
    this.stage(1);
    this.resetBar('boot');
    if (this.actionEl) {
      this.actionEl.textContent = str(`loading.held_${kind}`);
    }
    this.statusLine(detail);
    return true;
  }

  /* The link is back, or given up on: the screen goes if it was held. */
  release() {
    if (!this.held) {
      return;
    }
    this.held = null;
    if (this.loading || this.failed) {
      return;
    }
    this.root.classList.remove('is-held');
    this.hide();
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
    this.loading = false;
    this.held = null;
    if (this.errorEl) {
      this.errorEl.textContent = message;
      this.errorEl.hidden = false;
    }
    this.root.classList.remove('is-minimal', 'is-held', 'is-stalled');
    this.root.classList.add('is-failed');
    this.statusLine(str('loading.could_not_start'));
    for (const row of this.root.querySelectorAll('.system-row[data-state="loading"]')) {
      this.status(row.lastElementChild.id, 'fail');
    }
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
    /* The screen may have been faded out by a previous complete(). A
     * failure has to be visible whatever the last load did. */
    this.show();
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

  /* The first frame is on screen: every bar to its end, and the screen
   * goes the spec's way, complete(). */
  finish() {
    for (const s of this.stages) {
      this.doneIds.add(s.id);
    }
    this.index = this.stages.length - 1;
    this.frac = 1;
    this.paint();
    this.loading = false;
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
    this.root.classList.remove('is-stalled');
    this.statusLine('');
    this.timings.total = performance.now() - this.startedAt;
    this.complete();
  }
}
