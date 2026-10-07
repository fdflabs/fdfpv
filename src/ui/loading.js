import { str } from '../strings/index.js';
/*
 * loading.js: the PDCS bootloader, the overlay that stands over every load
 * and only ever reports work that has actually happened.
 *
 * One overlay (index.html #pdcs-loader, the owner's markup of 3 October)
 * serves the cold boot, every world swap and a room link being retried. It
 * has four screens, initial boot, system check, map loading and finalizing,
 * and a controller the spec names: show, hide, stage, setProgress,
 * progress, mapProgress, finalProgress, status, system, mapSystem,
 * finalSystem and complete. src/boot.js hangs the one instance on
 * window.loader, the spec's name, and on window.__loading, the harness's.
 * A load planned short, and a held room link, get the minimal loader: the
 * mark, one line and one bar.
 *
 * NO TIMERS MOVE ANYTHING. A boot spends its time in very different places
 * depending on the visitor: a slow link waits on the renderer and the wasm,
 * a slow machine on the world build, which paints hundreds of Canvas2D
 * textures on the main thread. A bar on a clock lies in both cases and
 * hides which case it is. So the load is a list of named stages, each
 * stage moves only when its caller reports progress, and the only interval
 * here is the one that notices a stage has gone quiet for STALL_MS and says
 * which stage it is.
 *
 * Who reports what:
 *
 *   three    the renderer import, start and end only. Byte progress from a
 *            streamed prefetch was tried and dropped: the browser fetched
 *            three.module.js twice (see src/boot.js).
 *   board    the published track's round trip, start and end.
 *   sim      bytes of dist/sim.wasm, through fetchWithProgress, which the
 *            shell needs to fetch anyway.
 *   module   resource timing entries under the map's path (moduleCounter):
 *            the browser walks the import graph, so counting what arrived
 *            costs nothing.
 *   world    the map builder's own progress callback, which names each
 *            phase as it starts it and yields to paint in between.
 *   frame    done when the first frame is drawn, the last thing a load does.
 *
 * Each bar draws the stages of its own screen (STAGE_SCREEN), weighted by
 * how long they measured: the boot bar the renderer, the map bar the module
 * graph and the build. The final bar instead counts the finalizing rows
 * that are over, a quarter each. The minimal loader's single bar is the
 * whole load.
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

/*
 * Stage durations in ms, the mean of two runs on this container at 1280 by
 * 720 on the race field (PROGRESS.md):
 *
 *     run 1   three 56.6   sim 24.5   module 24.3   world 2885.8   frame 437.8
 *     run 2   three 89.4   sim 19.5   module 34.2   world 3042.4   frame 424.9
 *
 * Throttled to 1500 kbps the same boot took three 90.3, sim 362.3, module
 * 895.3, world 2965.9 and frame 391.5: the fetches grew tenfold while the
 * main thread stages held still, which is why they are separate stages.
 * Change these only by measuring again.
 */
export const MEASURED_MS = {
  three: 73,
  /* A warm local board answering. A Render instance waking from sleep takes
   * about a minute; that is the stall line's job, not the weight's. */
  board: 60,
  sim: 22,
  module: 29,
  world: 2964,
  frame: 431,
};

const STAGE_LABEL = {
  three: 'Renderer',
  board: 'Board',
  sim: str('loading.flight_controller'),
  module: 'Map',
  world: 'World',
  frame: str('loading.first_frame'),
};

/*
 * Each stage's work in words. Nothing draws these yet; scripts/boot-loader-check
 * reads this block from the source to hold that every stage has them.
 */
const STAGE_DOING = {
  three: str('loading.loading_the_renderer'),
  board: str('loading.asking_the_leaderboard'),
  sim: str('loading.starting_the_flight_controller'),
  module: str('loading.loading_the_map'),
  world: str('loading.building_the_world'),
  frame: str('loading.drawing_the_first_frame'),
};

/* The screen a stage belongs to. A load only moves forward through them,
 * and the map's 'shaders' phase opens the finalizing screen early. */
const STAGE_SCREEN = { three: 1, board: 2, sim: 2, module: 3, world: 3, frame: 4 };

/*
 * Every stage is drawn at least this wide. A world build is most of any
 * load, so by measurement alone the cheap stages would share a sliver too
 * thin to see move. This shapes the drawing only; the timing is untouched.
 */
const SHARE_FLOOR = 0.05;

/*
 * A stage running longer than this gets named on the status line. The
 * slowest healthy stage here, a world build, takes about three seconds, so
 * a healthy load never gets there.
 */
export const STALL_MS = 6000;

/*
 * A warm load planned under this many ms shows the minimal loader, since
 * four screens flickering by in a second tell nobody anything. It is a plan
 * from the measurements, never a timer: the Alps plan about 1.4 s and stay
 * minimal, the Swiss valley and Itaipu show their screens. A cold boot
 * always shows all four; an Alps cold boot plans 1.53 s, too close to call.
 */
const MINIMAL_UNDER_MS = 1500;

/* The hide fade: the class fades the overlay, then it is hidden outright so
 * nothing reading what is on top finds a transparent sheet over the menus. */
const FADE_MS = 400;

/* A row states only what happened on this load: OK once its step has run,
 * N/A when this load has no such step. */
const ROW_STATES = new Set(['wait', 'loading', 'ready', 'standby', 'na', 'fail']);
const COLOURED_STATES = ['ready', 'loading', 'fail'];

/*
 * Builder phases to the spec's map and final rows.
 *
 * Every world exports PHASES, the phases its builder runs in order, and
 * names each to its progress callback as it starts. Each phase stands
 * behind one or more rows:
 *
 *   valleys (src/maps/alps.js valleyPhases; swiss2 adds finish)
 *     look        sky, light, materials          ENVIRONMENT
 *     terrain     heightfield and ground         TERRAIN DATA, HEIGHTMAPS
 *     nature      forest, meadow, water          VEGETATION
 *     village     houses and the road            BUILDINGS, ROADS & INFRA
 *     life        traffic and people             ROADS & INFRA
 *     finish      huts, lake town, forest, the   BUILDINGS, VEGETATION,
 *                 mountains' light and shadow    ENVIRONMENT
 *   Itaipu (src/maps/itaipu.js)
 *     imagery     satellite photographs          SATELLITE IMAGERY
 *     data        vector data                    TERRAIN DATA
 *     heightmaps  elevation tiles                HEIGHTMAPS
 *     dam         the dam                        ROADS & INFRA
 *     water       the reservoir                  ENVIRONMENT
 *     town        buildings and roads            BUILDINGS, ROADS & INFRA
 *     vegetation                                 VEGETATION
 *     war         the switchyard                 ROADS & INFRA
 *   every world
 *     shaders     scene programs compiling       SCENE INTEGRATION
 *
 * WORLD DATA and SIMULATION CORE are not builder phases; src/main.js and
 * the frame stage set them.
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

/* Every row's element id, keyed the way PHASE_ROWS names rows. Insertion
 * order is the order a new load resets them in. */
const ROW_ELEMENT = {
  'system:flight': 'sys-flight',
  'system:physics': 'sys-physics',
  'system:input': 'sys-input',
  'system:audio': 'sys-audio',
  'system:telemetry': 'sys-telemetry',
  'system:online': 'sys-online',
  'map:terrain': 'map-terrain',
  'map:satellite': 'map-satellite',
  'map:height': 'map-height',
  'map:buildings': 'map-buildings',
  'map:vegetation': 'map-vegetation',
  'map:roads': 'map-roads',
  'final:world': 'final-world',
  'final:core': 'final-core',
  'final:environment': 'final-env',
  'final:scene': 'final-scene',
};

/* The rows builder phases drive, in the order they are painted. */
const PHASE_DRIVEN = [
  'map:terrain', 'map:satellite', 'map:height', 'map:buildings', 'map:vegetation', 'map:roads',
  'final:environment', 'final:scene',
];

/* The three bars, keyed by the screen each sits on. */
const BAR = {
  boot: { fill: 'boot-progress', text: 'boot-progress-text', label: 'loading.progress_label' },
  map: { fill: 'map-progress', text: 'map-progress-text', label: 'loading.pdcs_stage_3' },
  final: { fill: 'final-progress', text: 'final-progress-text', label: 'loading.pdcs_stage_4' },
};
const barKeyOf = (fillId) => Object.keys(BAR).find((key) => BAR[key].fill === fillId);

/*
 * Plans a load: one entry per stage id with its measured cost and its share
 * of the bar. `worldMs` is the map's own measured build time.
 */
export function planStages(ids, worldMs) {
  const cost = (id) => (id === 'world' ? worldMs ?? MEASURED_MS.world : MEASURED_MS[id]);
  const plan = ids.map((id) => ({ id, name: STAGE_LABEL[id] ?? id, ms: cost(id) }));
  const count = plan.length;
  const sum = plan.reduce((acc, stage) => acc + stage.ms, 0);
  const floor = Math.min(SHARE_FLOOR, 1 / (count || 1));
  const spare = 1 - floor * count;
  for (const stage of plan) {
    stage.weight = floor + (sum > 0 ? (stage.ms / sum) * spare : spare / count);
  }
  return plan;
}

/*
 * Fetches url and resolves to its bytes, calling onProgress(fraction, got,
 * total) as they arrive. Without a readable body or a usable
 * content-length there is nothing honest to report until the end, so it
 * reports once, complete, and the elapsed time carries the stage meanwhile.
 */
export async function fetchWithProgress(url, onProgress) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`fetch ${url}: ${response.status}`);
  }
  const tell = onProgress || (() => {});
  const declared = Number(response.headers.get('content-length'));
  const expected = Number.isFinite(declared) && declared > 0 ? declared : 0;

  if (!response.body || expected === 0) {
    const whole = new Uint8Array(await response.arrayBuffer());
    tell(1, whole.length, whole.length);
    return whole;
  }

  const reader = response.body.getReader();
  const parts = [];
  let received = 0;
  for (let step = await reader.read(); !step.done; step = await reader.read()) {
    parts.push(step.value);
    received += step.value.length;
    tell(Math.min(1, received / expected), received, expected);
  }
  const bytes = new Uint8Array(received);
  parts.reduce((offset, part) => {
    bytes.set(part, offset);
    return offset + part.length;
  }, 0);
  return bytes;
}

/*
 * Counts distinct resources whose URL contains prefix, from resource timing
 * entries already recorded and those still to come, and reports
 * onProgress(fraction, seen, expected) on each new one. stop() ends the
 * watch and returns how many were seen.
 */
export function moduleCounter(prefix, expected, onProgress) {
  const arrived = new Set();
  const take = (entries) => {
    for (const { name } of entries) {
      if (arrived.has(name) || !name.includes(prefix)) continue;
      arrived.add(name);
      onProgress(Math.min(1, arrived.size / expected), arrived.size, expected);
    }
  };
  take(performance.getEntriesByType('resource'));

  let watcher = null;
  if (typeof PerformanceObserver === 'function') {
    watcher = new PerformanceObserver((list) => take(list.getEntries()));
    try {
      watcher.observe({ type: 'resource', buffered: true });
    } catch (e) {
      /* An engine without resource observation: the entries counted above
       * are all this stage will report, and the stage still ends on done. */
      watcher = null;
    }
  }
  return {
    stop() {
      if (watcher) watcher.disconnect();
      return arrived.size;
    },
  };
}

/*
 * Resolves once the browser has really painted what is in the DOM, so a
 * caller about to block the main thread (a world build is seconds of it)
 * does not block it over a screen that was never composited. A shot taken
 * mid build once showed the previous frame and no overlay at all. A rAF
 * callback runs before its frame's paint, so one is not enough: the second
 * frame's callback proves the first was painted, and the task after it
 * lets that second paint land too.
 */
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

export async function yieldToPaint() {
  await nextFrame();
  await nextFrame();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/*
 * What a failed boot is really up against, asked of the browser at the
 * moment it failed, because no WebGL 2, no WebAssembly and a blocked CDN
 * each need different advice. Every question is asked on its own and may
 * throw on its own: a browser hostile enough to break the boot can break
 * feature detection too, and one refusal must not hide the other answers.
 */
const SOFTWARE_GL = /swiftshader|llvmpipe|software|basic render/i;
const UA_ENGINE = /(Edg|OPR|Firefox|Chrome|Version)\/([0-9]+)/;
const ENGINE_NAME = { Edg: 'Edge', OPR: 'Opera', Version: 'Safari' };

function ask(question) {
  try {
    question();
  } catch (e) {
    /* The answer stays at its default, which is what the advice reads. */
  }
}

export function probeBrowser() {
  const found = {
    webgl2: false, webgl1: false, wasm: false, storage: false,
    online: true, softwareRenderer: false, renderer: '', engine: '', version: '',
  };
  ask(() => {
    const canvas = document.createElement('canvas');
    const modern = canvas.getContext('webgl2');
    found.webgl2 = Boolean(modern);
    const gl = modern || canvas.getContext('webgl');
    found.webgl1 = Boolean(gl);
    if (!gl) return;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    if (info) {
      found.renderer = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) || '');
      /* SwiftShader, llvmpipe and friends mean no GPU, and this workload
       * on the CPU is a slideshow. */
      found.softwareRenderer = SOFTWARE_GL.test(found.renderer);
    }
    /* Hand the probe's context back rather than wait for collection: the
     * page is about to want one for real. */
    const release = gl.getExtension('WEBGL_lose_context');
    if (release) release.loseContext();
  });
  ask(() => {
    found.wasm = typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function';
  });
  ask(() => {
    /* The key is written and removed at once; src/share/move.js lists it so
     * a storage move never carries it. */
    localStorage.setItem('webfpv.probe', '1');
    localStorage.removeItem('webfpv.probe');
    found.storage = true;
  });
  ask(() => {
    found.online = navigator.onLine !== false;
  });
  ask(() => {
    /* The leftmost token wins: Edge and Opera also say Chrome, and every
     * iOS browser says Safari while running Safari's engine. */
    const hit = (navigator.userAgent || '').match(UA_ENGINE);
    if (!hit) return;
    found.engine = ENGINE_NAME[hit[1]] || hit[1];
    found.version = hit[2];
  });
  return found;
}

/*
 * What to tell a visitor whose boot died, from what the probe found and the
 * error message: { why, steps }, the likely cause in one sentence, then
 * things to try with the likeliest fix first. The first cause that applies
 * wins.
 */
const NETWORK_WORDS = /fetch|network|load|import|cdn|jsdelivr|timeout|failed to/i;

const CAUSES = [
  {
    applies: (probe) => !probe.wasm,
    why: () => str('loading.this_browser_cannot_run_webassembly_which'),
    steps: () => [str('loading.open_the_simulator_in_a_b')],
  },
  {
    applies: (probe) => !probe.webgl2,
    why: (probe) => str(probe.webgl1 ? 'loading.this_browser_has_webgl_1_but' : 'loading.this_browser_is_not_giving_the'),
    steps: () => [
      str('loading.turn_b_hardware_acceleration_b_back'),
      str('loading.update_your_b_graphics_driver_b'),
      str('loading.try_a_different_browser_b_chrome'),
    ],
  },
  {
    applies: (probe, network) => network || !probe.online,
    why: (probe) => str(probe.online ? 'loading.something_the_page_needed_did_not' : 'loading.this_device_looks_offline'),
    steps: () => [
      str('loading.check_the_connection_then_b_reload'),
      str('loading.turn_off_b_ad_blockers_and'),
      str('loading.if_you_are_on_a_work'),
    ],
  },
  {
    applies: () => true,
    why: () => str('loading.the_page_got_far_enough_to'),
    steps: () => [
      '<b>Reload without the cache</b>: Ctrl and Shift and R, or Cmd and Shift and R on a Mac.',
      str('loading.try_a_b_private_window_b'),
      str('loading.try_b_chrome_edge_or_firefox'),
    ],
  },
];

export function recoveryAdvice(probe, message) {
  const network = NETWORK_WORDS.test(String(message || ''));
  const cause = CAUSES.find((c) => c.applies(probe, network));
  const steps = cause.steps();
  /* Not causes on their own, but they make a boot fragile, so they follow
   * the real cause. */
  if (probe.softwareRenderer) {
    steps.push(str('loading.your_browser_is_drawing_with_the', { v1: probe.renderer ? ` (${probe.renderer})` : '' }));
  }
  if (!probe.storage) {
    steps.push(str('loading.this_browser_is_b_blocking_site'));
  }
  steps.push(str('loading.if_none_of_that_works_the'));
  return { why: cause.why(probe), steps };
}

/* The footer's build: a deployed page carries its commit in <meta
 * name="fdfpv-version"> (scripts/stamp-version.js); a checkout has none. */
function buildLine() {
  const stamp = document.querySelector('meta[name="fdfpv-version"]');
  const version = stamp ? stamp.getAttribute('content') : '';
  return version ? str('loading.build', { version }) : str('loading.local_build');
}

/* A step's text as nodes: plain text, with <b>...</b> runs as real <b>
 * elements, so a step never goes through innerHTML. */
function stepNodes(step) {
  const nodes = [];
  for (const piece of String(step).split(/(<b>.*?<\/b>)/)) {
    if (!piece) continue;
    if (!piece.startsWith('<b>')) {
      nodes.push(document.createTextNode(piece));
      continue;
    }
    const bold = document.createElement('b');
    bold.textContent = piece.slice('<b>'.length, -'</b>'.length);
    nodes.push(bold);
  }
  return nodes;
}

function element(tag, props = {}) {
  const el = document.createElement(tag);
  Object.assign(el, props);
  return el;
}

/* A phase's rows from the phases behind each: loading while any runs or
 * some are over and some still to come, OK once those that ran are over,
 * WAIT while all are still to come, N/A when none stands behind it. */
function rowFromPhases(states) {
  const has = new Set(states);
  if (has.has('run') || (has.has('done') && has.has('wait'))) return 'loading';
  if (has.has('done')) return 'ready';
  if (has.has('wait')) return 'wait';
  return 'na';
}

export class Loading {
  constructor(root) {
    this.root = root;
    const find = (selector) => root.querySelector(selector);
    this.screens = [
      [1, find('#screen-boot')],
      [2, find('#screen-check')],
      [3, find('#screen-map')],
      [4, find('#screen-final')],
    ];
    this.headNumber = find('#loader-stage-number');
    this.headName = find('#loader-stage-name');
    this.actionEl = find('.boot-action');
    this.statusEl = find('.loader-status');
    this.footLeft = find('#loader-footer-left');
    this.errorEl = find('.loading-error');
    this.mapNameEl = find('.map-name');
    this.mapImg = find('#map-preview img');
    const buildEl = find('#loader-footer-center');
    if (buildEl) buildEl.textContent = buildLine();

    /* The plan of the current load, the stage under way (its position in
     * stages, -1 before any) and how far through it is. Read by the
     * harness through window.__loading. */
    this.stages = [];
    this.index = -1;
    this.frac = 0;
    this.finished = new Set();
    /* Each stage's measured duration, and the total, for the harness and
     * for re-measuring MEASURED_MS. */
    this.timings = {};
    /* What the stall line adds after the stage's name. Callers set it. */
    this.detail = '';
    this.loadStart = 0;
    this.stageStart = 0;

    /* 'idle', 'loading' or 'failed'. A held room link is separate: it can
     * only be held while idle, and a load or a failure takes over. */
    this.phaseOfLoad = 'idle';
    this.held = null;
    this.minimal = false;
    this.screen = 1;
    /* Where each bar was last aimed on this load: bars never go back. */
    this.barAt = { boot: 0, map: 0, final: 0 };
    /* The builder's declared phases, in order, each 'wait', 'run', 'done'
     * or 'skip'. */
    this.phases = new Map();
    this.ticker = null;
    /*
     * The pending fade from hide() or complete(). It has to be cancellable:
     * picking a map from the title starts a load inside the 400 ms after
     * the previous load's complete(), and a stale timer firing then hid the
     * overlay over a world being built. That happened, and was measured.
     */
    this.fadeTimer = null;
  }

  get loading() {
    return this.phaseOfLoad === 'loading';
  }

  get failed() {
    return this.phaseOfLoad === 'failed';
  }

  /* The fade timer: one at a time, a newer one replacing the older. */
  afterFade(then) {
    if (this.fadeTimer !== null) clearTimeout(this.fadeTimer);
    this.fadeTimer = setTimeout(() => {
      this.fadeTimer = null;
      then();
    }, FADE_MS);
  }

  /* The spec's controller. */

  show() {
    if (this.fadeTimer !== null) {
      clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }
    this.root.hidden = false;
    this.root.classList.remove('hidden');
  }

  hide() {
    this.root.classList.add('hidden');
    this.afterFade(() => {
      this.root.hidden = true;
    });
  }

  stage(number) {
    for (const [n, screenEl] of this.screens) {
      screenEl.classList.toggle('active', n === number);
    }
    this.headNumber.textContent = `[ 0${number} ]`;
    this.headName.textContent = str(`loading.pdcs_stage_${number}`);
  }

  /* The fill is scaled, not sized: see .progress-fill in index.html. One
   * of the three bars only ever moves forward within a load. */
  setProgress(barId, textId, amount) {
    const fill = this.root.querySelector(`#${barId}`);
    if (!fill) return;
    const key = barKeyOf(barId);
    let percent = Math.min(100, Math.max(0, Number(amount) || 0));
    if (key) {
      percent = Math.max(percent, this.barAt[key]);
      this.barAt[key] = percent;
    }
    fill.style.transform = `scaleX(${(percent / 100).toFixed(4)})`;
    const shown = Math.round(percent);
    const text = this.root.querySelector(`#${textId}`);
    if (text) text.textContent = `${shown}%`;
    const track = fill.parentElement;
    if (track && track.getAttribute('role') === 'progressbar') {
      track.setAttribute('aria-valuenow', String(shown));
    }
  }

  progress(amount) {
    this.setProgress(BAR.boot.fill, BAR.boot.text, amount);
  }

  mapProgress(amount) {
    this.setProgress(BAR.map.fill, BAR.map.text, amount);
  }

  finalProgress(amount) {
    this.setProgress(BAR.final.fill, BAR.final.text, amount);
  }

  /* The spec's OK, LOADING and WAIT plus STANDBY (built, waiting on
   * something outside the load), N/A and FAILED. The row element carries
   * the state as data-state for the label colour and the harness, written
   * only on a change because the harness reads a row's history from those
   * writes. */
  status(elementId, state) {
    const label = this.root.querySelector(`#${elementId}`);
    if (!label || !ROW_STATES.has(state)) return;
    label.classList.remove(...COLOURED_STATES);
    if (COLOURED_STATES.includes(state)) label.classList.add(state);
    label.textContent = str(`loading.state_${state}`);
    const row = label.parentElement;
    if (row && row.dataset.state !== state) row.dataset.state = state;
  }

  row(group, name, state) {
    const id = ROW_ELEMENT[`${group}:${name}`];
    if (id) this.status(id, state);
  }

  system(name, state) {
    this.row('system', name, state);
  }

  mapSystem(name, state) {
    this.row('map', name, state);
  }

  /* The final bar is the share of finalizing rows that are over. */
  finalSystem(name, state) {
    this.row('final', name, state);
    const rows = [...this.root.querySelectorAll('[data-group="final"] .system-row')];
    const over = rows.filter((r) => r.dataset.state === 'ready' || r.dataset.state === 'na');
    this.finalProgress((over.length / rows.length) * 100);
  }

  complete() {
    this.finalProgress(100);
    this.afterFade(() => this.hide());
  }

  /* The load. Nothing below moves unless a caller reports a stage or a
   * step starting, progressing or ending. */

  run(stages) {
    this.show();
    Object.assign(this, {
      stages,
      index: -1,
      frac: 0,
      finished: new Set(),
      phaseOfLoad: 'loading',
      held: null,
      detail: '',
      loadStart: performance.now(),
      stageStart: 0,
      timings: {},
    });
    this.root.classList.remove('is-failed', 'is-stalled', 'is-held');
    if (this.errorEl) {
      this.errorEl.hidden = true;
      this.errorEl.textContent = '';
    }
    const help = this.root.querySelector('.loading-help');
    if (help) help.hidden = true;

    const cold = stages.some((s) => s.id === 'three');
    const planned = stages.reduce((acc, s) => acc + (s.ms || 0), 0);
    this.minimal = !cold && planned < MINIMAL_UNDER_MS;
    this.root.classList.toggle('is-minimal', this.minimal);
    if (this.footLeft) this.footLeft.textContent = str(cold ? 'loading.foot_boot' : 'loading.foot_map');

    this.labelScreens();
    for (const id of Object.values(ROW_ELEMENT)) this.status(id, 'wait');
    this.phases = new Map();
    if (this.mapNameEl) this.mapNameEl.textContent = '';
    if (this.mapImg) {
      this.mapImg.hidden = true;
      this.mapImg.removeAttribute('src');
    }
    for (const key of Object.keys(BAR)) this.resetBar(key);
    this.statusLine('');
    this.screen = 0;
    this.showScreen(stages.length ? STAGE_SCREEN[stages[0].id] || 1 : 1);
    /* The stall line's tick, and it moves no bar and no row: a stalled
     * stage is one that has stopped reporting, so only a clock can notice. */
    if (!this.ticker) this.ticker = setInterval(() => this.paintStall(), 250);
  }

  /* A bar back to empty without sliding back from where the last load left
   * it: transitions off, the width read back so the style lands, then the
   * transition restored. */
  resetBar(key) {
    const { fill, text } = BAR[key];
    const fillEl = this.root.querySelector(`#${fill}`);
    fillEl.style.transition = 'none';
    this.barAt[key] = 0;
    this.setProgress(fill, text, 0);
    void fillEl.offsetWidth;
    fillEl.style.transition = '';
  }

  start(id) {
    const at = this.stages.findIndex((s) => s.id === id);
    if (at < 0) return;
    this.index = at;
    this.frac = 0;
    this.stageStart = performance.now();
    this.showScreen(STAGE_SCREEN[id] || this.screen);
    if (id === 'frame') this.finalSystem('core', 'loading');
    this.paint();
  }

  /* How far through the stage is, 0 to 1, and optionally what the stall
   * line should add. A report for a planned stage that is not the current
   * one starts it. */
  report(id, frac, detail) {
    const current = this.index >= 0 ? this.stages[this.index].id : null;
    if (current !== id) this.start(id);
    this.frac = Math.max(0, Math.min(1, frac));
    if (detail !== undefined) this.detail = detail;
    this.paint();
  }

  done(id) {
    const at = this.stages.findIndex((s) => s.id === id);
    if (at < 0) return;
    this.timings[id] = performance.now() - this.stageStart;
    this.index = at;
    this.frac = 1;
    this.finished.add(id);
    if (id === 'world') this.closePhases();
    if (id === 'frame') this.finalSystem('core', 'ready');
    this.paint();
  }

  /* Screens only go forward within a load, and a minimal load keeps the
   * first one's header whatever stage it is on. */
  showScreen(n) {
    if (!n || n <= this.screen) return;
    this.screen = n;
    this.root.dataset.screen = String(n);
    /* Relabelled on every screen, because a cold boot's first screen goes
     * up before the pilot's locale has loaded. */
    this.labelScreens();
    this.stage(this.minimal ? 1 : n);
  }

  /* The markup is English for the very first paint; from then on every
   * label is said in the pilot's language. */
  labelScreens() {
    const say = (selector, key) => {
      const el = this.root.querySelector(selector);
      if (el) el.textContent = str(key);
    };
    if (!this.held) say('.boot-action', 'loading.pdcs_initializing');
    say('#map-title', 'loading.pdcs_title_3');
    say('#final-title', 'loading.pdcs_title_4');
    for (const el of this.root.querySelectorAll('[data-label]')) {
      el.textContent = str(`loading.${el.dataset.label}`);
    }
    for (const row of this.root.querySelectorAll('.system-row[data-state]')) {
      row.lastElementChild.textContent = str(`loading.state_${row.dataset.state}`);
    }
    for (const { fill, label } of Object.values(BAR)) {
      this.root.querySelector(`#${fill}`).parentElement.setAttribute('aria-label', str(label));
    }
  }

  /* The map about to load: its name and its card's poster. Asked before
   * the module graph so the picture is in before the build blocks. */
  mapInfo({ name, poster }) {
    if (this.mapNameEl) this.mapNameEl.textContent = name || '';
    if (this.mapImg && poster) {
      this.mapImg.src = poster;
      this.mapImg.hidden = false;
    }
  }

  /* The phases the map's builder declares (its module's PHASES). A row
   * none of them stands behind says N/A from now on. */
  mapPhases(phases) {
    this.phases = new Map();
    for (const ph of phases || []) {
      if (PHASE_ROWS[ph] && !this.phases.has(ph)) this.phases.set(ph, 'wait');
    }
    this.paintPhaseRows();
  }

  /*
   * The builder started one phase or several. A builder runs its phases in
   * the order it declared them, so every phase declared before the first
   * of these is behind it: over if it ran, skipped if it never did.
   * 'shaders' means the world is built and compiling, which is the
   * finalizing screen.
   */
  phase(ids) {
    const order = [...this.phases.keys()];
    const begun = [].concat(ids).filter((ph) => this.phases.has(ph));
    if (begun.length === 0) return;
    const earliest = Math.min(...begun.map((ph) => order.indexOf(ph)));
    for (const ph of order.slice(0, earliest)) {
      const was = this.phases.get(ph);
      if (was === 'run') this.phases.set(ph, 'done');
      else if (was === 'wait') this.phases.set(ph, 'skip');
    }
    for (const ph of begun) this.phases.set(ph, 'run');
    if (begun.includes('shaders')) this.showScreen(4);
    this.paintPhaseRows();
  }

  /* The builder returned: what ran is over, what never started was not
   * part of this load. */
  closePhases() {
    for (const [ph, was] of this.phases) {
      this.phases.set(ph, was === 'run' || was === 'done' ? 'done' : 'skip');
    }
    this.paintPhaseRows();
  }

  paintPhaseRows() {
    for (const rowKey of PHASE_DRIVEN) {
      const behind = [...this.phases].filter(([ph]) => PHASE_ROWS[ph].includes(rowKey)).map(([, st]) => st);
      const [group, name] = rowKey.split(':');
      const state = rowFromPhases(behind);
      if (group === 'final') this.finalSystem(name, state);
      else this.mapSystem(name, state);
    }
  }

  /* Progress through screen n's stages, 0 to 1, each weighted by its plan.
   * The minimal loader's one screen counts every stage. */
  screenValue(n) {
    let total = 0;
    let reached = 0;
    this.stages.forEach((stage, i) => {
      if (!this.minimal && (STAGE_SCREEN[stage.id] || 1) !== n) return;
      total += stage.weight;
      if (this.finished.has(stage.id)) reached += stage.weight;
      else if (i === this.index) reached += stage.weight * this.frac;
    });
    return total > 0 ? reached / total : 0;
  }

  paint() {
    if (this.failed) return;
    this.progress(this.screenValue(1) * 100);
    if (!this.minimal) this.mapProgress(this.screenValue(3) * 100);
    this.paintStall();
  }

  statusLine(text) {
    if (this.statusEl && this.statusEl.textContent !== text) this.statusEl.textContent = text;
  }

  /* After STALL_MS on one stage, the status line names it and the detail
   * its caller gave: what tells a slow network from a slow machine. */
  paintStall() {
    if (!this.loading || this.held) return;
    const stage = this.index >= 0 ? this.stages[this.index] : null;
    const stalled = Boolean(stage && this.stageStart && performance.now() - this.stageStart > STALL_MS);
    this.root.classList.toggle('is-stalled', stalled);
    if (!stalled) {
      this.statusLine('');
      return;
    }
    const name = (STAGE_LABEL[stage.id] || stage.id).toLowerCase();
    const tail = this.detail ? `, ${this.detail}` : '';
    this.statusLine(`${str('loading.still_loading_the', { name })}${tail}`);
  }

  /*
   * The overlay held for a room link being retried: 'reconnect' after a
   * drop, 'restart' when the rooms server closed with 1012 because it is
   * restarting (edge/rooms/node.js). The minimal loader, its line naming
   * which, a sweeping bar that claims no amount because a retry has none,
   * and the attempt on the status line. A load or a failure owns the
   * overlay, so a hold is refused then and the retry asks again later.
   */
  hold(kind, detail = '') {
    if (this.phaseOfLoad !== 'idle') return false;
    this.held = kind;
    this.show();
    this.root.classList.add('is-minimal', 'is-held');
    this.root.classList.remove('is-stalled');
    this.stage(1);
    this.resetBar('boot');
    if (this.actionEl) this.actionEl.textContent = str(`loading.held_${kind}`);
    this.statusLine(detail);
    return true;
  }

  /* The link is back or given up: a held overlay goes. */
  release() {
    if (!this.held) return;
    this.held = null;
    if (this.phaseOfLoad !== 'idle') return;
    this.root.classList.remove('is-held');
    this.hide();
  }

  /*
   * A boot that died: say what failed, what this browser turned out to
   * lack, and give a way out. It used to be a red bar and one sentence, and
   * a visitor could not tell a blocked CDN from a missing driver or know
   * that reloading was the answer.
   */
  fail(message) {
    this.phaseOfLoad = 'failed';
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
    this.stopTicker();
    /* A previous complete() may have faded the overlay out; a failure is
     * shown whatever came before it. */
    this.show();
    this.paintHelp(message);
  }

  stopTicker() {
    if (!this.ticker) return;
    clearInterval(this.ticker);
    this.ticker = null;
  }

  paintHelp(message) {
    const help = this.root.querySelector('.loading-help');
    if (!help) return;
    let probe = {};
    let advice = { why: '', steps: [str('loading.reload_the_page_if_it_keeps')] };
    try {
      probe = probeBrowser();
      advice = recoveryAdvice(probe, message);
    } catch (e) {
      /* The help must not be what fails next; the plain advice above
       * stands, and the message on screen still says what broke. */
      probe = {};
    }

    help.textContent = '';
    help.append(element('h3', { textContent: str('loading.what_to_try') }));
    if (advice.why) help.append(element('p', { className: 'loading-why', textContent: advice.why }));
    const list = element('ol');
    for (const step of advice.steps) {
      const item = element('li');
      item.append(...stepNodes(step));
      list.append(item);
    }
    help.append(list);

    const actions = element('div', { className: 'loading-actions' });
    /* A plain reload: the cache-bypassing one is a keystroke the page
     * cannot send, which is why it heads the list when it applies. */
    const retry = element('button', { type: 'button', textContent: str('loading.try_again') });
    retry.addEventListener('click', () => {
      window.location.reload();
    });
    const copy = element('button', { type: 'button', className: 'quiet', textContent: str('loading.copy_the_details') });
    copy.addEventListener('click', () => this.copyReport(copy, help, probe, message));
    actions.append(retry, copy);
    help.append(actions);

    const facts = [
      probe.engine ? `${probe.engine} ${probe.version}` : '',
      str('loading.webgl2', { v1: probe.webgl2 ? 'yes' : 'no' }),
      str('loading.webassembly', { v1: probe.wasm ? 'yes' : 'no' }),
      `site data ${probe.storage ? 'yes' : 'blocked'}`,
    ];
    help.append(element('div', { className: 'loading-detail', textContent: facts.filter(Boolean).join('  .  ') }));
    help.hidden = false;
    /* The way out takes focus, so a keyboard or screen reader visitor
     * lands on something to press. */
    try {
      retry.focus();
    } catch (e) {
      /* Not focusable yet; it is still there to click. */
    }
  }

  /* The failure as text a visitor can paste into a report. Without a
   * secure context the clipboard is often refused, so the text is then put
   * on screen to select by hand. */
  async copyReport(button, help, probe, message) {
    const lines = [
      str('loading.fdfpv_failed_to_start', { message }),
      str('loading.browser', { v1: probe.engine || 'unknown', v2: probe.version || '' }).trim(),
      str('loading.webgl2_webgl1_wasm', { webgl2: probe.webgl2, webgl1: probe.webgl1, wasm: probe.wasm }),
      str('loading.storage_online', { storage: probe.storage, online: probe.online }),
      probe.renderer ? str('loading.renderer', { renderer: probe.renderer }) : '',
      str('loading.url', { href: window.location.href }),
      str('loading.agent', { userAgent: navigator.userAgent }),
    ];
    const text = lines.filter(Boolean).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = str('loading.copied');
    } catch (e) {
      button.textContent = str('loading.select_and_copy');
      help.append(element('div', { className: 'loading-detail', textContent: text }));
    }
  }

  /* The first frame is up: every stage done, every bar to its end, and the
   * overlay leaves the spec's way, through complete(). */
  finish() {
    for (const stage of this.stages) this.finished.add(stage.id);
    this.index = this.stages.length - 1;
    this.frac = 1;
    this.paint();
    if (this.phaseOfLoad === 'loading') this.phaseOfLoad = 'idle';
    this.stopTicker();
    this.root.classList.remove('is-stalled');
    this.statusLine('');
    this.timings.total = performance.now() - this.loadStart;
    this.complete();
  }
}
