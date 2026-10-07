/*
 * loading-golden.js: src/ui/loading.js held to the outputs it gave when
 * tests/fixtures/loading-golden.json was written. npm run loading:golden.
 *
 * What it pins:
 *
 *   the data          MEASURED_MS, STALL_MS, PHASE_ROWS and the export list.
 *   planStages        every field of every stage, for cold boots, swaps and
 *                     edge lists, from a module loaded under English and one
 *                     loaded under Spanish (stage names are read at load).
 *   fetchWithProgress the bytes and every progress call, streamed and not,
 *                     and the exact message of a failed fetch.
 *   moduleCounter     every progress call and stop()'s count, with and
 *                     without a PerformanceObserver.
 *   yieldToPaint      that it resolves after two frames and a task, and not
 *                     before.
 *   probeBrowser      the whole report under faked browsers, each probe
 *                     failing on its own, and the storage key it touches.
 *   recoveryAdvice    why and steps for every branch, in both languages.
 *   Loading           the overlay itself, driven through scripted loads on
 *                     a fake DOM built from a copy of index.html's
 *                     #pdcs-loader markup.
 *
 * HOW THE OVERLAY IS PINNED. After every call a case writes the whole tree
 * under the overlay (tag, id, classes, attributes, inline style, own text),
 * the timers still pending, and the fields other code reads off the object
 * (index, stages, timings, detail). Between snapshots it writes the events a
 * snapshot cannot show: every data-state write with its old value (what
 * boot-loader-check rebuilds a row's history from), the transition being
 * switched off and the forced reflow before it is switched back on, timers
 * set and cleared, focus, the clipboard and reloads. Time is a fake clock
 * that moves only when a case moves it, so every duration is exact.
 *
 * The markup below is a copy, not a parse of index.html, so an unrelated
 * edit to the page cannot fail this check; boot-loader-check drives the real
 * page in Chromium and holds the markup itself.
 *
 * The record is written with --record; see scripts/lib/golden.js. Write it
 * again only on purpose, with the reason in the pull request.
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

import { goldenMain, Stream, canon } from './lib/golden.js';
import { setLocale, useLocale } from '../src/strings/index.js';

const FIXTURE = new URL('../tests/fixtures/loading-golden.json', import.meta.url);

/* ------------------------------------------------------------------ *
 * The event log every fake writes into, drained by each snapshot.
 * ------------------------------------------------------------------ */

let events = [];
const note = (line) => events.push(line);

/* ------------------------------------------------------------------ *
 * A fake clock and the timers on it.
 * ------------------------------------------------------------------ */

const clock = { t: 0, next: 1, timers: new Map(), frames: [] };

function resetClock() {
  clock.t = 1000;
  clock.next = 1;
  clock.timers = new Map();
  clock.frames = [];
}

function addTimer(kind, fn, ms) {
  const id = clock.next++;
  const delay = Number(ms) || 0;
  clock.timers.set(id, { id, kind, fn, ms: delay, due: clock.t + delay });
  note(`${kind} ${delay}`);
  return id;
}

function dropTimer(kind, id) {
  const timer = clock.timers.get(id);
  if (timer) {
    clock.timers.delete(id);
    note(`clear ${timer.kind} ${timer.ms}`);
  } else {
    note(`clear ${kind} nothing`);
  }
}

function advance(ms) {
  const until = clock.t + ms;
  for (;;) {
    const due = [...clock.timers.values()].filter((x) => x.due <= until)
      .sort((a, b) => a.due - b.due || a.id - b.id)[0];
    if (!due) break;
    clock.t = due.due;
    if (due.kind === 'interval') {
      due.due += Math.max(1, due.ms);
    } else {
      clock.timers.delete(due.id);
    }
    due.fn();
  }
  clock.t = until;
}

function flushFrame() {
  const run = clock.frames;
  clock.frames = [];
  for (const fn of run) fn(clock.t);
}

function pendingTimers() {
  return [...clock.timers.values()].sort((a, b) => a.due - b.due || a.id - b.id)
    .map((x) => `${x.kind} ${x.ms} in ${x.due - clock.t}`);
}

/* ------------------------------------------------------------------ *
 * A fake DOM: just enough elements and selectors for the overlay.
 * ------------------------------------------------------------------ */

class TextNode {
  constructor(text) {
    this.data = String(text);
    this.parentNode = null;
  }

  get textContent() {
    return this.data;
  }
}

function makeStyle(el) {
  const props = {};
  const style = { props };
  for (const name of ['transform', 'transition']) {
    Object.defineProperty(style, name, {
      get: () => props[name] ?? '',
      set: (v) => {
        props[name] = String(v);
        if (name === 'transition') note(`${ref(el)} style.transition=${JSON.stringify(String(v))}`);
      },
    });
  }
  return style;
}

class El {
  constructor(tag) {
    this.tagName = tag;
    this.attrs = new Map();
    this.childNodes = [];
    this.parentNode = null;
    this.style = makeStyle(this);
    this.listeners = {};
  }

  get parentElement() {
    return this.parentNode instanceof El ? this.parentNode : null;
  }

  get children() {
    return this.childNodes.filter((n) => n instanceof El);
  }

  get lastElementChild() {
    const kids = this.children;
    return kids.length ? kids[kids.length - 1] : null;
  }

  getAttribute(name) {
    return this.attrs.has(name) ? this.attrs.get(name) : null;
  }

  setAttribute(name, value) {
    const v = String(value);
    if (name === 'data-state') note(`${ref(this)} data-state ${this.getAttribute(name)} -> ${v}`);
    this.attrs.set(name, v);
  }

  removeAttribute(name) {
    this.attrs.delete(name);
  }

  hasAttribute(name) {
    return this.attrs.has(name);
  }

  get id() { return this.getAttribute('id') || ''; }
  set id(v) { this.setAttribute('id', v); }
  get className() { return this.getAttribute('class') || ''; }
  set className(v) { this.setAttribute('class', v); }
  get type() { return this.getAttribute('type') || ''; }
  set type(v) { this.setAttribute('type', v); }
  get src() { return this.getAttribute('src') || ''; }
  set src(v) { this.setAttribute('src', v); }
  get hidden() { return this.attrs.has('hidden'); }
  set hidden(v) { if (v) this.setAttribute('hidden', ''); else this.removeAttribute('hidden'); }

  get classList() {
    const el = this;
    const list = () => el.className.split(/\s+/).filter(Boolean);
    const write = (names) => el.setAttribute('class', names.join(' '));
    return {
      contains: (n) => list().includes(n),
      add: (...ns) => write([...list(), ...ns.filter((n) => !list().includes(n))]),
      remove: (...ns) => write(list().filter((n) => !ns.includes(n))),
      toggle(n, force) {
        const on = force === undefined ? !list().includes(n) : Boolean(force);
        if (on) this.add(n); else this.remove(n);
        return on;
      },
    };
  }

  get dataset() {
    const el = this;
    const attr = (k) => `data-${String(k).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
    return new Proxy({}, {
      get: (_, k) => (typeof k === 'string' && el.hasAttribute(attr(k)) ? el.getAttribute(attr(k)) : undefined),
      set: (_, k, v) => { el.setAttribute(attr(k), v); return true; },
    });
  }

  get textContent() {
    return this.childNodes.map((n) => n.textContent).join('');
  }

  set textContent(v) {
    for (const n of this.childNodes) n.parentNode = null;
    const text = v === null || v === undefined ? '' : String(v);
    this.childNodes = text ? [new TextNode(text)] : [];
    for (const n of this.childNodes) n.parentNode = this;
  }

  get offsetWidth() {
    note(`${ref(this)} reflow`);
    return 0;
  }

  append(...nodes) {
    for (const raw of nodes) {
      const n = typeof raw === 'string' ? new TextNode(raw) : raw;
      if (n.parentNode) n.parentNode.childNodes = n.parentNode.childNodes.filter((c) => c !== n);
      n.parentNode = this;
      this.childNodes.push(n);
    }
  }

  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }

  click() {
    return Promise.all((this.listeners.click || []).map((fn) => fn({ type: 'click', target: this })));
  }

  focus() {
    note(`${ref(this)} focus`);
  }

  descendants() {
    const out = [];
    const walk = (el) => {
      for (const c of el.children) {
        out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }

  querySelectorAll(selector) {
    const chain = selector.trim().split(/\s+/).map(parseCompound);
    return this.descendants().filter((el) => matchChain(el, chain, this));
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

function parseCompound(text) {
  const out = { tag: null, id: null, classes: [], attrs: [] };
  const tag = text.match(/^[a-z][a-z0-9]*/);
  let rest = text;
  if (tag) {
    out.tag = tag[0];
    rest = rest.slice(tag[0].length);
  }
  const re = /#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]/y;
  while (rest.length) {
    re.lastIndex = 0;
    const m = re.exec(rest);
    if (!m) throw new Error(`fake DOM: selector it cannot read: ${text}`);
    if (m[1]) out.id = m[1];
    else if (m[2]) out.classes.push(m[2]);
    else out.attrs.push([m[3], m[4]]);
    rest = rest.slice(m[0].length);
  }
  return out;
}

function matchOne(el, c) {
  if (c.tag && el.tagName !== c.tag) return false;
  if (c.id && el.id !== c.id) return false;
  if (c.classes.some((n) => !el.classList.contains(n))) return false;
  return c.attrs.every(([k, v]) => el.hasAttribute(k) && (v === undefined || el.getAttribute(k) === v));
}

function matchChain(el, chain, scope) {
  if (!matchOne(el, chain[chain.length - 1])) return false;
  let at = el.parentElement;
  for (let i = chain.length - 2; i >= 0; i -= 1) {
    while (at && at !== scope && !matchOne(at, chain[i])) at = at.parentElement;
    if (!at || at === scope) return false;
    at = at.parentElement;
  }
  return true;
}

/* An element's name in the log: its id, or its path of tags and classes. */
function ref(el) {
  if (el.id) return `#${el.id}`;
  const parts = [];
  for (let at = el; at && !at.id; at = at.parentElement) {
    const cls = at.className ? `.${at.className.split(/\s+/)[0]}` : '';
    const sib = at.parentElement ? at.parentElement.children.indexOf(at) : 0;
    parts.unshift(`${at.tagName}${cls}:${sib}`);
    if (!at.parentElement) break;
  }
  const anchor = (() => {
    for (let at = el.parentElement; at; at = at.parentElement) if (at.id) return `#${at.id} `;
    return '';
  })();
  return anchor + parts.join('>');
}

/* The tree as lines, one per element, and the text it holds directly. */
function tree(root) {
  const lines = [];
  const walk = (el, depth) => {
    const attrs = [...el.attrs].filter(([k]) => k !== 'id' && k !== 'class').sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => (v === '' ? k : `${k}=${JSON.stringify(v)}`));
    const style = Object.entries(el.style.props).filter(([, v]) => v !== '').map(([k, v]) => `${k}:${v}`);
    const text = el.childNodes.filter((n) => n instanceof TextNode).map((n) => n.data).join('');
    lines.push(`${' '.repeat(depth)}${el.tagName}${el.id ? `#${el.id}` : ''}${el.className ? `.${el.className.split(/\s+/).join('.')}` : ''}`
      + `${attrs.length ? ` [${attrs.join(' ')}]` : ''}${style.length ? ` {${style.join(';')}}` : ''}${text ? ` ${JSON.stringify(text)}` : ''}`);
    for (const c of el.children) walk(c, depth + 1);
  };
  walk(root, 0);
  return lines;
}

/* A small reader for the well formed markup below. */
const VOID = new Set(['img', 'meta', 'br', 'input']);
const ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"' };
const unescape = (s) => s.replace(/&(#\d+|[a-z]+);/g, (m, e) => (e[0] === '#' ? String.fromCodePoint(Number(e.slice(1))) : ENTITY[e] ?? m));

function parseMarkup(html) {
  const top = new El('#root');
  let at = top;
  const re = /<!--[\s\S]*?-->|<\/([a-z0-9]+)\s*>|<([a-z0-9]+)((?:\s+[a-z-]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g;
  for (const m of html.matchAll(re)) {
    if (m[0].startsWith('<!--')) continue;
    if (m[1]) {
      if (at.tagName !== m[1]) throw new Error(`fake DOM: </${m[1]}> closes <${at.tagName}>`);
      at = at.parentNode;
    } else if (m[2]) {
      const el = new El(m[2]);
      for (const a of m[3].matchAll(/([a-z-]+)(?:="([^"]*)")?/g)) el.attrs.set(a[1], unescape(a[2] ?? ''));
      at.append(el);
      if (!m[4] && !VOID.has(m[2])) at = el;
    } else if (m[5].trim()) {
      at.append(unescape(m[5]));
    }
  }
  return top.children[0];
}

/* index.html's #pdcs-loader, copied. See the note at the top. */
const LOADER_MARKUP = `
<div id="pdcs-loader" class="pdcs-loader">
  <div class="loader-noise"></div>
  <div class="loader-grid"></div>
  <header class="loader-header">
    <div class="loader-stage">
      <span id="loader-stage-number">[ 01 ]</span>
      <span id="loader-stage-name">INITIAL BOOT</span>
    </div>
    <div class="loader-brand">
      <div class="py-flag" aria-hidden="true"><span></span><span></span><span></span></div>
      <span>PDCS // SIMULATION CORE</span>
    </div>
  </header>
  <main class="loader-content">
    <section id="screen-boot" class="loader-screen active">
      <div class="initial-center">
        <div class="pdcs-mark" aria-hidden="true">&#9651;</div>
        <div class="core-name">PDCS // SIMULATION CORE</div>
        <div class="py-flag py-flag-center" aria-hidden="true"><span></span><span></span><span></span></div>
        <div class="boot-action">INITIALIZING...</div>
        <div class="progress-row">
          <div class="progress-track" role="progressbar" aria-label="Loading" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div id="boot-progress" class="progress-fill"></div><div class="progress-sweep"></div></div>
          <span id="boot-progress-text">0%</span>
        </div>
      </div>
    </section>
    <section id="screen-check" class="loader-screen">
      <div class="systems-layout">
        <div class="systems-list" data-group="system">
          <div class="system-row" data-row="flight" data-state="wait"><span data-label="row_flight">FLIGHT CONTROLLER</span><span id="sys-flight">WAIT</span></div>
          <div class="system-row" data-row="physics" data-state="wait"><span data-label="row_physics">PHYSICS ENGINE</span><span id="sys-physics">WAIT</span></div>
          <div class="system-row" data-row="input" data-state="wait"><span data-label="row_input">INPUT DEVICES</span><span id="sys-input">WAIT</span></div>
          <div class="system-row" data-row="audio" data-state="wait"><span data-label="row_audio">AUDIO SYSTEM</span><span id="sys-audio">WAIT</span></div>
          <div class="system-row" data-row="telemetry" data-state="wait"><span data-label="row_telemetry">TELEMETRY</span><span id="sys-telemetry">WAIT</span></div>
          <div class="system-row" data-row="online" data-state="wait"><span data-label="row_online">ONLINE SERVICES</span><span id="sys-online">WAIT</span></div>
        </div>
        <div class="drone-wireframe" aria-hidden="true"><img src="assets/boot/drone.svg" alt="" width="360" height="240" decoding="async" /></div>
      </div>
    </section>
    <section id="screen-map" class="loader-screen">
      <div class="map-layout">
        <div>
          <h2 id="map-title">LOADING ENVIRONMENT</h2>
          <div class="map-name"></div>
          <div class="progress-row large">
            <div class="progress-track" role="progressbar" aria-label="Map loading" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div id="map-progress" class="progress-fill"></div><div class="progress-sweep"></div></div>
            <span id="map-progress-text">0%</span>
          </div>
          <div class="systems-list compact" data-group="map">
            <div class="system-row" data-row="terrain" data-state="wait"><span data-label="row_terrain">TERRAIN DATA</span><span id="map-terrain">WAIT</span></div>
            <div class="system-row" data-row="satellite" data-state="wait"><span data-label="row_satellite">SATELLITE IMAGERY</span><span id="map-satellite">WAIT</span></div>
            <div class="system-row" data-row="height" data-state="wait"><span data-label="row_height">HEIGHTMAPS</span><span id="map-height">WAIT</span></div>
            <div class="system-row" data-row="buildings" data-state="wait"><span data-label="row_buildings">BUILDINGS</span><span id="map-buildings">WAIT</span></div>
            <div class="system-row" data-row="vegetation" data-state="wait"><span data-label="row_vegetation">VEGETATION</span><span id="map-vegetation">WAIT</span></div>
            <div class="system-row" data-row="roads" data-state="wait"><span data-label="row_roads">ROADS &amp; INFRA</span><span id="map-roads">WAIT</span></div>
          </div>
        </div>
        <div id="map-preview" class="map-preview" aria-hidden="true"><img alt="" hidden decoding="async" /></div>
      </div>
    </section>
    <section id="screen-final" class="loader-screen">
      <div class="final-layout">
        <div>
          <h2 id="final-title">FINALIZING SIMULATION ENVIRONMENT</h2>
          <div class="progress-row large">
            <div class="progress-track" role="progressbar" aria-label="Finalizing" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div id="final-progress" class="progress-fill"></div></div>
            <span id="final-progress-text">0%</span>
          </div>
          <div class="systems-list compact" data-group="final">
            <div class="system-row" data-row="world" data-state="wait"><span data-label="row_world">WORLD DATA</span><span id="final-world">WAIT</span></div>
            <div class="system-row" data-row="core" data-state="wait"><span data-label="row_core">SIMULATION CORE</span><span id="final-core">WAIT</span></div>
            <div class="system-row" data-row="environment" data-state="wait"><span data-label="row_environment">ENVIRONMENT</span><span id="final-env">WAIT</span></div>
            <div class="system-row" data-row="scene" data-state="wait"><span data-label="row_scene">SCENE INTEGRATION</span><span id="final-scene">WAIT</span></div>
          </div>
        </div>
        <div class="final-reticle" aria-hidden="true"><div></div></div>
      </div>
    </section>
    <section class="loader-fail">
      <div class="loader-fail-inner">
        <div class="progress-row"><div class="progress-track"><div class="progress-fill"></div></div></div>
        <div class="loading-error" hidden></div>
        <div class="loading-help" hidden role="alert" aria-live="assertive"></div>
      </div>
    </section>
    <div class="loader-status" aria-live="polite"></div>
  </main>
  <footer class="loader-footer">
    <span id="loader-footer-left">SYS INIT</span>
    <span id="loader-footer-center"></span>
    <span id="loader-footer-right">BOOTLOADER</span>
  </footer>
</div>`;

/* ------------------------------------------------------------------ *
 * The browser around the module: every global it may touch, faked.
 * ------------------------------------------------------------------ */

const GOOD_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

const BROWSER = {
  gl2: { renderer: 'ANGLE (NVIDIA GeForce RTX 3060 Ti)', lose: true },
  gl1: { renderer: 'ANGLE (NVIDIA GeForce RTX 3060 Ti)', lose: true },
  canvasThrows: false,
  wasm: 'yes',
  storage: 'ok',
  online: true,
  ua: GOOD_UA,
  clipboard: 'ok',
  meta: null,
};
let env = { ...BROWSER };

function fakeContext(spec, kind) {
  return {
    getExtension(name) {
      if (name === 'WEBGL_debug_renderer_info') {
        if (spec.renderer === null) return null;
        return { UNMASKED_RENDERER_WEBGL: 0x9246 };
      }
      if (name === 'WEBGL_lose_context') {
        return spec.lose ? { loseContext: () => note(`${kind} loseContext`) } : null;
      }
      return null;
    },
    getParameter(p) {
      if (spec.renderer === 'throw') throw new Error('getParameter refused');
      return p === 0x9246 ? spec.renderer : null;
    },
  };
}

let html = null;
const fakeDocument = {
  createElement(tag) {
    const el = new El(tag);
    if (tag === 'canvas') {
      el.getContext = (kind) => {
        if (env.canvasThrows) throw new Error('canvas refused');
        const spec = kind === 'webgl2' ? env.gl2 : kind === 'webgl' ? env.gl1 : null;
        return spec ? fakeContext(spec, kind) : null;
      };
    }
    return el;
  },
  createTextNode: (text) => new TextNode(text),
  querySelector(sel) {
    if (sel === 'meta[name="fdfpv-version"]') {
      if (!env.meta) return null;
      const m = new El('meta');
      m.attrs.set('name', 'fdfpv-version');
      m.attrs.set('content', env.meta);
      return m;
    }
    return html ? html.querySelector(sel) : null;
  },
  get documentElement() {
    return { lang: 'en' };
  },
};

const fakeStorage = {
  setItem(k, v) {
    if (env.storage === 'throw') throw new Error('QuotaExceededError');
    note(`localStorage.setItem ${JSON.stringify(k)} ${JSON.stringify(v)}`);
  },
  removeItem(k) {
    note(`localStorage.removeItem ${JSON.stringify(k)}`);
  },
  getItem: () => null,
};

const fakeNavigator = {
  get onLine() {
    if (env.online === 'throw') throw new Error('no onLine');
    return env.online;
  },
  get userAgent() {
    if (env.ua === 'throw') throw new Error('no userAgent');
    return env.ua;
  },
  language: 'en',
  clipboard: {
    writeText(text) {
      note(`clipboard.writeText ${JSON.stringify(text)}`);
      return env.clipboard === 'ok' ? Promise.resolve() : Promise.reject(new Error('NotAllowedError'));
    },
  },
};

let resourceEntries = [];
let observers = [];
class FakePerformanceObserver {
  constructor(cb) {
    this.cb = cb;
    this.live = false;
    observers.push(this);
  }

  observe(opts) {
    note(`observe ${canon(opts)}`);
    if (env.observeThrows) throw new Error('observe refused');
    this.live = true;
  }

  disconnect() {
    note('disconnect');
    this.live = false;
  }
}

function emitResources(names) {
  for (const o of observers) {
    if (o.live) o.cb({ getEntries: () => names.map((name) => ({ name })) });
  }
}

const realWasm = globalThis.WebAssembly;
const define = (name, get) => Object.defineProperty(globalThis, name, { configurable: true, get });
define('document', () => fakeDocument);
define('window', () => ({ location: { href: 'https://example.test/?map=alps', reload: () => note('location.reload') } }));
define('navigator', () => fakeNavigator);
define('localStorage', () => {
  if (env.storage === 'absent') throw new Error('localStorage is not available');
  return fakeStorage;
});
define('performance', () => ({
  now: () => clock.t,
  getEntriesByType: (type) => (type === 'resource' ? resourceEntries.map((name) => ({ name })) : []),
}));
define('PerformanceObserver', () => (env.noObserver ? undefined : FakePerformanceObserver));
define('WebAssembly', () => {
  if (env.wasm === 'throw') throw new Error('WebAssembly refused');
  if (env.wasm === 'absent') return undefined;
  if (env.wasm === 'no-instantiate') return { compile() {} };
  return realWasm;
});
define('requestAnimationFrame', () => (fn) => {
  note('requestAnimationFrame');
  clock.frames.push(fn);
  return clock.frames.length;
});
define('setTimeout', () => (fn, ms) => addTimer('timeout', fn, ms));
define('clearTimeout', () => (id) => dropTimer('timeout', id));
define('setInterval', () => (fn, ms) => addTimer('interval', fn, ms));
define('clearInterval', () => (id) => dropTimer('interval', id));
let fetchImpl = null;
define('fetch', () => (url) => fetchImpl(url));

/* Lets an async handler run to its end without touching the fake timers. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

/* ------------------------------------------------------------------ *
 * The module, under each locale.
 * ------------------------------------------------------------------ */

await useLocale('es');
setLocale('en');
const L = await import('../src/ui/loading.js');
setLocale('es');
const Les = await import('../src/ui/loading.js?locale=es');
setLocale('en');

/* ------------------------------------------------------------------ *
 * Cases. Each is async; all run before goldenMain, which only compares.
 * ------------------------------------------------------------------ */

const asyncCases = [];
const add = (id, run) => asyncCases.push({ id, run });

add('data', async (s) => {
  s.say('exports', Object.keys(L).sort());
  s.say('MEASURED_MS', L.MEASURED_MS);
  s.say('STALL_MS', L.STALL_MS);
  s.say('PHASE_ROWS', L.PHASE_ROWS);
  s.say('frozen', [Object.isFrozen(L.MEASURED_MS), Object.isFrozen(L.PHASE_ROWS)]);
});

const PLANS = [
  [['three', 'board', 'sim', 'module', 'world', 'frame'], 2964],
  [['three', 'board', 'sim', 'module', 'world', 'frame'], undefined],
  [['three', 'board', 'sim', 'module', 'world', 'frame'], 917],
  [['three', 'board', 'sim', 'module', 'world', 'frame'], 0],
  [['three', 'board', 'sim', 'module', 'world', 'frame'], null],
  [['module', 'world', 'frame'], 900],
  [['module', 'world', 'frame'], 2500],
  [['module', 'world', 'frame'], undefined],
  [['module', 'world', 'frame'], 917],
  [[], 100],
  [['world'], 0],
  [['world'], undefined],
  [['frame'], undefined],
  [['bogus'], 10],
  [['bogus', 'sim'], 10],
  [['frame', 'frame'], 5],
  [Array(25).fill('sim'), 1],
  [Array(20).fill('board'), 1],
  [['world', 'world'], 1e9],
];

for (const [mod, tag] of [[L, 'en'], [Les, 'es']]) {
  add(`plan-${tag}`, async (s) => {
    for (const [ids, ms] of PLANS) s.call(`planStages ${canon(ids)} ${canon(ms)}`, () => mod.planStages(ids, ms));
  });
}

function fakeResponse({ ok = true, status = 200, length = null, chunks = [], body = true }) {
  const all = chunks.flat();
  const headers = { get: (name) => (String(name).toLowerCase() === 'content-length' ? length : null) };
  return {
    ok,
    status,
    headers,
    body: body ? {
      getReader() {
        let i = 0;
        return { read: async () => (i < chunks.length ? { done: false, value: Uint8Array.from(chunks[i++]) } : { done: true, value: undefined }) };
      },
    } : null,
    arrayBuffer: async () => Uint8Array.from(all).buffer,
  };
}

const FETCHES = [
  ['not-ok', { ok: false, status: 404 }],
  ['server-error', { ok: false, status: 503, length: '10', chunks: [[1, 2]] }],
  ['no-length', { chunks: [[1, 2, 3], [4, 5]] }],
  ['bad-length', { length: 'abc', chunks: [[9, 8]] }],
  ['zero-length', { length: '0', chunks: [[7]] }],
  ['negative-length', { length: '-5', chunks: [[7, 6]] }],
  ['no-body', { length: '3', chunks: [[1, 2, 3]], body: false }],
  ['empty-no-length', { chunks: [] }],
  ['streamed', { length: '10', chunks: [[1, 2, 3], [4, 5, 6, 7], [8, 9, 10]] }],
  ['short-length', { length: '4', chunks: [[1, 2, 3], [4, 5, 6]] }],
  ['long-length', { length: '100', chunks: [[1], [2, 3]] }],
  ['streamed-nothing', { length: '5', chunks: [] }],
  ['fractional-length', { length: '2.5', chunks: [[1], [2], [3]] }],
];

add('fetch', async (s) => {
  for (const [name, spec] of FETCHES) {
    for (const withProgress of [true, false]) {
      const calls = [];
      fetchImpl = async (url) => {
        calls.push(`fetch ${url}`);
        return fakeResponse(spec);
      };
      try {
        const out = await L.fetchWithProgress(`dist/${name}.wasm`, withProgress ? (...a) => calls.push(canon(a)) : undefined);
        s.say(`${name} ${withProgress}`, { calls, out, isU8: out instanceof Uint8Array });
      } catch (e) {
        s.say(`${name} ${withProgress} threw`, { calls, message: e.message });
      }
    }
  }
  fetchImpl = async () => { throw new TypeError('Failed to fetch'); };
  try {
    await L.fetchWithProgress('dist/sim.wasm', () => {});
    s.say('rejected', 'resolved');
  } catch (e) {
    s.say('rejected', e.message);
  }
});

add('modules', async (s) => {
  const run = (label, opts, initial, later, expected = 4) => {
    events = [];
    observers = [];
    env = { ...BROWSER, ...opts };
    resourceEntries = initial;
    const calls = [];
    const counter = L.moduleCounter('src/maps/alps', expected, (...a) => calls.push(canon(a)));
    for (const batch of later) emitResources(batch);
    const stopped = counter.stop();
    emitResources(['https://x/src/maps/alps/late.js']);
    s.say(label, { calls, stopped, events, keys: Object.keys(counter) });
  };
  const initial = ['https://x/src/maps/alps.js', 'https://x/src/render/frame.js', 'https://x/src/maps/alps.js', 'https://x/src/maps/alps/sky.js'];
  const later = [['https://x/src/maps/alps/sky.js', 'https://x/src/maps/alps/trees.js'], [], ['https://x/three.module.js', 'https://x/src/maps/alps/a.js', 'https://x/src/maps/alps/b.js']];
  run('observer', {}, initial, later);
  run('no observer', { noObserver: true }, initial, later);
  run('observe throws', { observeThrows: true }, initial, later);
  run('expected zero', {}, initial, later, 0);
  run('nothing matches', {}, ['https://x/other.js'], [['https://x/more.js']]);
  env = { ...BROWSER };
});

add('yield', async (s) => {
  resetClock();
  events = [];
  let resolved = false;
  const p = L.yieldToPaint().then(() => { resolved = true; });
  await settle();
  s.say('asked', { resolved, events });
  events = [];
  flushFrame();
  await settle();
  s.say('one frame', { resolved, events, timers: pendingTimers() });
  events = [];
  flushFrame();
  await settle();
  s.say('two frames', { resolved, events, timers: pendingTimers() });
  events = [];
  advance(0);
  await p;
  s.say('the task', { resolved, events, timers: pendingTimers() });
});

const PROBES = [
  ['good', {}],
  ['webgl1 only', { gl2: null }],
  ['no webgl', { gl2: null, gl1: null }],
  ['canvas throws', { canvasThrows: true }],
  ['no debug info', { gl2: { renderer: null, lose: true } }],
  ['no lose', { gl2: { renderer: 'Apple GPU', lose: false } }],
  ['param throws', { gl2: { renderer: 'throw', lose: true } }],
  ['swiftshader', { gl2: { renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))', lose: true } }],
  ['llvmpipe', { gl2: null, gl1: { renderer: 'llvmpipe (LLVM 15.0.7, 256 bits)', lose: false } }],
  ['software', { gl2: { renderer: 'Software Adapter', lose: true } }],
  ['basic render', { gl2: { renderer: 'Microsoft Basic Render Driver', lose: true } }],
  ['empty renderer', { gl2: { renderer: '', lose: true } }],
  ['null renderer', { gl2: { renderer: undefined, lose: true } }],
  ['no wasm', { wasm: 'absent' }],
  ['wasm without instantiate', { wasm: 'no-instantiate' }],
  ['wasm throws', { wasm: 'throw' }],
  ['storage throws', { storage: 'throw' }],
  ['storage absent', { storage: 'absent' }],
  ['offline', { online: false }],
  ['online undefined', { online: undefined }],
  ['online throws', { online: 'throw' }],
  ['edge', { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.2792.52' }],
  ['opera', { ua: 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 OPR/114.0.0.0' }],
  ['firefox', { ua: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0' }],
  ['safari', { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15' }],
  ['ios chrome', { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1' }],
  ['curl', { ua: 'curl/8.5.0' }],
  ['empty ua', { ua: '' }],
  ['undefined ua', { ua: undefined }],
  ['ua throws', { ua: 'throw' }],
  ['everything wrong', { canvasThrows: true, wasm: 'throw', storage: 'absent', online: 'throw', ua: 'throw' }],
];

add('probe', async (s) => {
  for (const [name, opts] of PROBES) {
    env = { ...BROWSER, ...opts };
    events = [];
    const out = L.probeBrowser();
    s.say(name, { out, events });
  }
  env = { ...BROWSER };
});

const P = {
  good: { webgl2: true, webgl1: true, wasm: true, storage: true, online: true, softwareRenderer: false, renderer: 'ANGLE', engine: 'Chrome', version: '129' },
};
const ADVICE_PROBES = [
  ['good', P.good],
  ['no wasm', { ...P.good, wasm: false }],
  ['no wasm no webgl offline', { ...P.good, wasm: false, webgl2: false, webgl1: false, online: false }],
  ['webgl1', { ...P.good, webgl2: false }],
  ['no webgl', { ...P.good, webgl2: false, webgl1: false }],
  ['offline', { ...P.good, online: false }],
  ['software', { ...P.good, softwareRenderer: true, renderer: 'SwiftShader' }],
  ['software unnamed', { ...P.good, softwareRenderer: true, renderer: '' }],
  ['no storage', { ...P.good, storage: false }],
  ['all extras', { ...P.good, webgl2: false, softwareRenderer: true, renderer: 'llvmpipe', storage: false }],
  ['empty', {}],
];
const MESSAGES = [
  undefined, null, '', 'boom', 0, 42, 'fetch failed', 'NetworkError when attempting', 'Failed to load module script',
  'error loading dynamically imported module', 'import of x', 'CDN unreachable', 'cdn', 'cdn.jsdelivr.net', 'timeout after 8s',
  'Failed to', 'LOAD', 'TypeError: x is not a function', 'world build threw', 'Download stalled',
];

for (const [mod, tag, lang] of [[L, 'en', 'en'], [L, 'es', 'es']]) {
  add(`advice-${tag}`, async (s) => {
    setLocale(lang);
    for (const [name, probe] of ADVICE_PROBES) {
      for (const m of MESSAGES) s.call(`${name} ${canon(m)}`, () => mod.recoveryAdvice(probe, m));
    }
    setLocale('en');
  });
}

/* ------------------------------------------------------------------ *
 * The overlay.
 * ------------------------------------------------------------------ */

function loaderCase(id, opts, script) {
  add(id, async (s) => {
    resetClock();
    env = { ...BROWSER, ...(opts.env || {}) };
    setLocale(opts.lang || 'en');
    let markup = LOADER_MARKUP;
    for (const cut of opts.cut || []) markup = markup.replace(cut, '');
    const root = parseMarkup(markup);
    html = new El('html');
    const body = new El('body');
    html.append(body);
    body.append(root);
    events = [];
    const mod = opts.mod || L;
    let ld = null;
    const snap = (label) => {
      s.say(`${label} events`, events);
      events = [];
      s.say(`${label} tree`, tree(root));
      s.say(`${label} timers`, pendingTimers());
      if (ld) {
        s.say(`${label} fields`, { index: ld.index, stages: ld.stages, timings: ld.timings, detail: ld.detail, sameRoot: ld.root === root });
      }
    };
    s.call('construct', () => { ld = new mod.Loading(root); return 'ok'; });
    snap('constructed');
    const t = {
      ld,
      mod,
      root,
      step(label, fn) {
        s.call(label, () => fn(ld));
        snap(label);
      },
      async stepAsync(label, fn) {
        let v;
        try {
          v = await fn(ld);
        } catch (e) {
          v = `threw ${e.message}`;
        }
        await settle();
        s.say(label, v);
        snap(label);
      },
      wait(ms, label = `wait ${ms}`) {
        advance(ms);
        snap(label);
      },
      say: (label, v) => s.say(label, v),
    };
    await script(t);
    setLocale('en');
    env = { ...BROWSER };
    html = null;
  });
}

const VALLEY = ['look', 'terrain', 'nature', 'village', 'life', 'shaders'];
const SWISS = ['look', 'terrain', 'nature', 'village', 'life', 'finish', 'shaders'];
const ITAIPU = ['imagery', 'data', 'heightmaps', 'dam', 'water', 'town', 'vegetation', 'war', 'shaders'];
const INTERIOR = ['data', 'heightmaps', 'vegetation', 'town', 'shaders'];
const COLD = ['three', 'board', 'sim', 'module', 'world', 'frame'];

/* A full cold boot in the order boot.js and main.js drive it. */
async function coldBoot(t, phases, worldMs) {
  const { mod } = t;
  t.step('run', (ld) => ld.run(mod.planStages(COLD, worldMs)));
  t.wait(5);
  t.step('start three', (ld) => { ld.start('three'); ld.detail = 'r170'; });
  t.wait(73);
  t.step('done three', (ld) => { ld.done('three'); ld.detail = ''; });
  t.step('start board', (ld) => { ld.start('board'); ld.system('online', 'loading'); });
  t.wait(60);
  t.step('board answered', (ld) => { ld.system('online', 'na'); ld.done('board'); });
  t.step('audio standby', (ld) => ld.system('audio', 'standby'));
  t.step('start sim', (ld) => { ld.start('sim'); ld.system('physics', 'loading'); ld.report('sim', 0.25, '1.2 of 4.8 MB'); });
  t.wait(11);
  t.step('sim bytes', (ld) => ld.report('sim', 0.75, '3.6 of 4.8 MB'));
  t.step('physics ready', (ld) => { ld.system('physics', 'ready'); ld.system('flight', 'loading'); });
  t.wait(11);
  t.step('done sim', (ld) => { ld.system('flight', 'ready'); ld.done('sim'); ld.detail = ''; });
  await swapBody(t, phases, true);
}

/* The part of a load main.js drives, from the map's module to the frame. */
async function swapBody(t, phases, cold) {
  t.step('map info', (ld) => { ld.mapInfo({ name: 'Swiss valley', poster: 'assets/cards/swiss2.webp' }); ld.start('module'); });
  t.wait(10);
  t.step('modules 1', (ld) => ld.report('module', 1 / 3, '1 of 3 modules'));
  t.step('modules 3', (ld) => ld.report('module', 1, '3 of 3 modules'));
  t.wait(19);
  t.step('done module', (ld) => { ld.done('module'); ld.detail = ''; ld.mapPhases(phases); ld.start('world'); });
  let k = 0;
  for (const ph of phases) {
    k += 1;
    t.wait(100);
    t.step(`phase ${ph}`, (ld) => { ld.phase(ph); ld.report('world', k / (phases.length + 1)); });
  }
  t.wait(50);
  t.step('built', (ld) => { ld.closePhases(); ld.finalSystem('world', 'loading'); });
  t.step('world data', (ld) => { ld.finalSystem('world', 'ready'); ld.done('world'); });
  if (cold) {
    t.step('input', (ld) => { ld.system('input', 'loading'); ld.system('input', 'ready'); });
    t.step('telemetry', (ld) => { ld.system('telemetry', 'loading'); ld.system('telemetry', 'ready'); });
  }
  t.step('start frame', (ld) => ld.start('frame'));
  t.wait(431);
  t.step('finish', (ld) => { ld.done('frame'); ld.finish(); });
  t.wait(399);
  t.wait(1, 'complete fires');
  t.wait(399);
  t.wait(1, 'hidden');
}

loaderCase('cold-swiss', {}, async (t) => coldBoot(t, SWISS, 2500));
loaderCase('cold-alps', { env: { meta: 'abc1234' } }, async (t) => coldBoot(t, VALLEY, 917));
loaderCase('cold-itaipu-es', { lang: 'es' }, async (t) => coldBoot(t, ITAIPU, 5200));
loaderCase('cold-itaipu-es-module', { lang: 'es', mod: Les }, async (t) => coldBoot(t, ITAIPU, 5200));

for (const [name, phases, ms] of [['alps', VALLEY, 900], ['swiss', SWISS, 2500], ['itaipu', ITAIPU, 5200], ['interior', INTERIOR, 1100]]) {
  loaderCase(`swap-${name}`, {}, async (t) => {
    t.step('run', (ld) => ld.run(t.mod.planStages(['module', 'world', 'frame'], ms)));
    await swapBody(t, phases, false);
  });
}

loaderCase('phases-odd', {}, async (t) => {
  t.step('run', (ld) => ld.run(t.mod.planStages(['module', 'world', 'frame'], 3000)));
  t.step('phases before any', (ld) => ld.phase('terrain'));
  t.step('mapPhases null', (ld) => ld.mapPhases(null));
  t.step('mapPhases undefined', (ld) => ld.mapPhases());
  t.step('mapPhases unknown', (ld) => ld.mapPhases(['bogus', 'nope']));
  t.step('mapPhases mixed', (ld) => ld.mapPhases(['bogus', ...ITAIPU, 'extra']));
  t.step('phase unknown', (ld) => ld.phase('bogus'));
  t.step('phase empty', (ld) => ld.phase([]));
  t.step('phase two at once', (ld) => ld.phase(['data', 'heightmaps']));
  t.step('phase skipping', (ld) => ld.phase('town'));
  t.step('phase back', (ld) => ld.phase('imagery'));
  t.step('phase with unknown', (ld) => ld.phase(['vegetation', 'bogus']));
  t.step('phase again', (ld) => ld.phase('vegetation'));
  t.step('phase three', (ld) => ld.phase(['war', 'dam', 'water']));
  t.step('shaders', (ld) => ld.phase('shaders'));
  t.step('close', (ld) => ld.closePhases());
  t.step('close again', (ld) => ld.closePhases());
  t.step('phase after close', (ld) => ld.phase('imagery'));
  t.step('repaint', (ld) => ld.paintPhaseRows());
  t.step('new phases', (ld) => ld.mapPhases(SWISS));
  t.step('finish first', (ld) => ld.phase('finish'));
  t.step('close swiss', (ld) => ld.closePhases());
  t.step('done world', (ld) => ld.done('world'));
});

loaderCase('stall', {}, async (t) => {
  t.step('run', (ld) => ld.run(t.mod.planStages(COLD, 2964)));
  t.step('start three', (ld) => { ld.start('three'); ld.detail = 'r170'; });
  t.wait(5999);
  t.wait(2, 'past the line, before a tick');
  t.wait(249, 'the tick');
  t.step('report keeps it stalled', (ld) => ld.report('three', 0.5, 'half'));
  t.step('report no detail', (ld) => ld.report('three', 0.6));
  t.step('report empty detail', (ld) => ld.report('three', 0.6, ''));
  t.wait(250);
  t.step('next stage', (ld) => ld.start('board'));
  t.wait(7000);
  t.step('sim stalls by report', (ld) => ld.report('sim', 0.1, '0.5 of 4.8 MB'));
  t.wait(6500);
  t.step('frame', (ld) => { ld.start('frame'); });
  t.wait(6500);
  t.step('world', (ld) => { ld.start('world'); ld.detail = 'town'; });
  t.wait(6500);
  t.step('module', (ld) => { ld.start('module'); ld.detail = '31 of 72 modules'; });
  t.wait(6500);
  t.step('finish clears', (ld) => ld.finish());
  t.wait(7000);
});

for (const [name, lang, mod] of [['stall-es', 'es', L], ['stall-es-module', 'es', Les]]) {
  loaderCase(name, { lang, mod }, async (t) => {
    t.step('run', (ld) => ld.run(t.mod.planStages(COLD, 2964)));
    for (const id of COLD) {
      t.step(`start ${id}`, (ld) => { ld.start(id); ld.detail = id === 'module' ? 'x' : ''; });
      t.wait(6250);
    }
    t.step('fail', (ld) => ld.fail('boom'));
  });
}

loaderCase('hold', {}, async (t) => {
  t.step('hold before any load', (ld) => ld.hold('reconnect', 'attempt 1 of 5'));
  t.step('release', (ld) => ld.release());
  t.step('release again', (ld) => ld.release());
  t.wait(400);
  t.step('run', (ld) => ld.run(t.mod.planStages(['module', 'world', 'frame'], 900)));
  t.step('hold during a load', (ld) => ld.hold('restart', 'attempt 2 of 5'));
  t.step('start module', (ld) => ld.start('module'));
  t.step('finish', (ld) => ld.finish());
  t.step('hold restart', (ld) => ld.hold('restart', 'attempt 3 of 5'));
  t.wait(10000);
  t.step('hold default detail', (ld) => ld.hold('reconnect'));
  t.step('stray start while held', (ld) => ld.start('frame'));
  t.step('stray phase while held', (ld) => { ld.mapPhases(VALLEY); ld.phase('shaders'); });
  t.step('release', (ld) => ld.release());
  t.wait(400);
  t.step('hold, then a load', (ld) => ld.hold('reconnect', 'attempt 1 of 3'));
  t.step('run over it', (ld) => ld.run(t.mod.planStages(['module', 'world', 'frame'], 2500)));
  t.step('release during the load', (ld) => ld.release());
  t.step('fail', (ld) => ld.fail('fetch failed'));
  t.step('hold after fail', (ld) => ld.hold('reconnect', 'attempt 1 of 3'));
  t.step('release after fail', (ld) => ld.release());
});

loaderCase('hold-es', { lang: 'es' }, async (t) => {
  t.step('hold', (ld) => ld.hold('restart', 'intento 1 de 5'));
  t.step('run', (ld) => ld.run(t.mod.planStages(COLD, 2964)));
  t.step('three', (ld) => ld.start('three'));
});

loaderCase('fail-network', {}, async (t) => {
  t.step('run', (ld) => ld.run(t.mod.planStages(COLD, 2964)));
  t.step('rows loading', (ld) => {
    ld.start('board');
    ld.system('online', 'loading');
    ld.system('physics', 'loading');
    ld.mapSystem('terrain', 'loading');
    ld.finalSystem('world', 'loading');
    ld.system('audio', 'standby');
  });
  t.wait(300);
  t.step('fail', (ld) => ld.fail('fetch https://cdn.jsdelivr.net/npm/three: Failed to fetch'));
  await t.stepAsync('copy', (ld) => ld.root.querySelector('.loading-actions button.quiet').click());
  env.clipboard = 'refuse';
  await t.stepAsync('copy refused', (ld) => ld.root.querySelector('.loading-actions button.quiet').click());
  await t.stepAsync('retry', (ld) => ld.root.querySelector('.loading-actions button').click());
  t.step('paint after fail', (ld) => { ld.report('board', 0.5); ld.done('board'); ld.paint(); });
  t.wait(7000);
  t.step('fail again', (ld) => ld.fail('second'));
});

loaderCase('fail-after-complete', { env: { gl2: null, gl1: { renderer: 'llvmpipe (LLVM 15)', lose: false }, storage: 'throw', ua: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', clipboard: 'refuse' } }, async (t) => {
  t.step('run', (ld) => ld.run(t.mod.planStages(['module', 'world', 'frame'], 900)));
  t.step('finish', (ld) => ld.finish());
  t.wait(500);
  t.step('fail while fading', (ld) => ld.fail('world build threw'));
  t.wait(1000);
  await t.stepAsync('copy refused', (ld) => ld.root.querySelector('.loading-actions button.quiet').click());
  t.step('run after fail', (ld) => ld.run(t.mod.planStages(['module', 'world', 'frame'], 900)));
});

for (const [name, envOpts, msg] of [
  ['fail-no-wasm', { wasm: 'absent', ua: 'throw' }, 'WebAssembly is not defined'],
  ['fail-offline', { online: false, storage: 'absent' }, 'boom'],
  ['fail-generic', { gl2: { renderer: 'Apple M2', lose: true }, ua: 'Mozilla/5.0 (Macintosh) Version/17.6 Safari/605.1.15' }, 'x is not a function'],
  ['fail-no-webgl', { gl2: null, gl1: null, canvasThrows: false }, 'import failed'],
  ['fail-odd-message', {}, 42],
]) {
  loaderCase(name, { env: envOpts }, async (t) => {
    t.step('fail', (ld) => ld.fail(msg));
  });
}

loaderCase('fail-es', { lang: 'es', env: { gl2: null } }, async (t) => {
  t.step('run', (ld) => ld.run(t.mod.planStages(COLD, 2964)));
  t.step('fail', (ld) => ld.fail('no webgl2'));
  await t.stepAsync('copy', (ld) => ld.root.querySelector('.loading-actions button.quiet').click());
});

loaderCase('fail-bare-root', { cut: [/<div class="loading-help"[^>]*><\/div>/, /<div class="loading-error" hidden><\/div>/, /<span id="loader-footer-center"><\/span>/] }, async (t) => {
  t.step('run', (ld) => ld.run(t.mod.planStages(COLD, 2964)));
  t.step('fail', (ld) => ld.fail('boom'));
});

loaderCase('race', {}, async (t) => {
  t.step('run', (ld) => ld.run(t.mod.planStages(['module', 'world', 'frame'], 900)));
  t.step('finish', (ld) => ld.finish());
  t.wait(200);
  t.step('run inside the hide', (ld) => ld.run(t.mod.planStages(['module', 'world', 'frame'], 2500)));
  t.wait(1000);
  t.step('finish', (ld) => ld.finish());
  t.wait(500);
  t.step('run inside the fade', (ld) => ld.run(t.mod.planStages(COLD, 2964)));
  t.wait(1000);
  t.step('complete twice', (ld) => { ld.complete(); ld.complete(); });
  t.wait(600);
  t.step('show', (ld) => ld.show());
  t.step('hide twice', (ld) => { ld.hide(); ld.hide(); });
  t.wait(399);
  t.step('show inside the fade', (ld) => ld.show());
  t.wait(1000);
});

/* Either side of the line between the minimal loader and the full one. */
loaderCase('minimal-line', {}, async (t) => {
  for (const ms of [1039, 1040, 1041]) {
    t.step(`run ${ms}`, (ld) => ld.run(t.mod.planStages(['module', 'world', 'frame'], ms)));
    t.step(`world ${ms}`, (ld) => ld.start('world'));
  }
  t.step('cold under the line', (ld) => ld.run(t.mod.planStages(['three', 'world'], 10)));
  t.step('warm under the line, no ms', (ld) => ld.run([{ id: 'world', weight: 1 }]));
});

loaderCase('api', {}, async (t) => {
  for (const v of [50, 30, 'abc', NaN, -5, 150, '70.456', 99.5, null, undefined, 12.34567]) {
    t.step(`boot ${canon(v)}`, (ld) => ld.setProgress('boot-progress', 'boot-progress-text', v));
  }
  t.step('map no text', (ld) => ld.setProgress('map-progress', 'nope', 10));
  t.step('unknown bar', (ld) => ld.setProgress('nope', 'boot-progress-text', 10));
  t.step('fail bar', (ld) => ld.setProgress('final-progress', 'map-progress-text', 33.3));
  t.step('aliases', (ld) => { ld.progress(10); ld.mapProgress(60); ld.finalProgress(25); });
  t.step('aliases lower', (ld) => { ld.progress(5); ld.mapProgress(40); ld.finalProgress(0); });
  for (const st of ['wait', 'loading', 'ready', 'standby', 'na', 'fail', 'bogus', '', 'loading']) {
    t.step(`status ${st}`, (ld) => ld.status('sys-flight', st));
  }
  t.step('status no element', (ld) => ld.status('nope', 'ready'));
  t.step('system unknown', (ld) => ld.system('bogus', 'ready'));
  t.step('mapSystem', (ld) => { ld.mapSystem('satellite', 'na'); ld.mapSystem('roads', 'ready'); ld.mapSystem('bogus', 'ready'); });
  t.step('final quarter', (ld) => ld.finalSystem('world', 'ready'));
  t.step('final na', (ld) => ld.finalSystem('scene', 'na'));
  t.step('final fail', (ld) => ld.finalSystem('core', 'fail'));
  t.step('final bad', (ld) => ld.finalSystem('environment', 'bogus'));
  t.step('final unknown', (ld) => ld.finalSystem('bogus', 'ready'));
  t.step('final all', (ld) => { ld.finalSystem('core', 'ready'); ld.finalSystem('environment', 'ready'); });
  t.step('final back', (ld) => ld.finalSystem('core', 'loading'));
  for (const n of [1, 2, 3, 4, 0, 7, '3']) t.step(`stage ${canon(n)}`, (ld) => ld.stage(n));
  t.step('statusLine', (ld) => { ld.statusLine('hello'); ld.statusLine('hello'); });
  t.step('labelScreens', (ld) => ld.labelScreens());
  t.step('showScreen', (ld) => { ld.showScreen(3); ld.showScreen(2); ld.showScreen(0); ld.showScreen(4); });
  t.step('screenValue', (ld) => [1, 2, 3, 4].map((n) => ld.screenValue(n)));
  t.step('resetBar', (ld) => ld.resetBar('map'));
  t.step('resetBar unknown', (ld) => ld.resetBar('nope'));
  t.step('mapInfo', (ld) => ld.mapInfo({ name: 'Itaipu', poster: 'assets/cards/itaipu.webp' }));
  t.step('mapInfo no poster', (ld) => ld.mapInfo({ name: 'Alps' }));
  t.step('mapInfo empty', (ld) => ld.mapInfo({ poster: '' }));
  t.step('mapInfo nothing', (ld) => ld.mapInfo({}));
  t.step('complete', (ld) => ld.complete());
  t.wait(1000);
});

loaderCase('stages-odd', {}, async (t) => {
  t.step('before run', (ld) => { ld.start('three'); ld.report('three', 0.5); ld.done('three'); return ld.screenValue(1); });
  t.step('run', (ld) => ld.run(t.mod.planStages(COLD, 2964)));
  t.wait(40);
  t.step('report starts', (ld) => ld.report('sim', 0.4, 'auto'));
  t.step('report range', (ld) => { ld.report('sim', -1); ld.report('sim', 2); });
  t.step('report NaN', (ld) => ld.report('sim', NaN));
  t.step('report string', (ld) => ld.report('sim', '0.3'));
  t.step('start unknown', (ld) => ld.start('bogus'));
  t.step('done unknown', (ld) => ld.done('bogus'));
  t.wait(12);
  t.step('done unstarted', (ld) => ld.done('world'));
  t.step('report unknown', (ld) => ld.report('bogus', 0.5, 'x'));
  t.step('done earlier stage', (ld) => ld.done('three'));
  t.step('start earlier stage', (ld) => ld.start('board'));
  t.step('start frame', (ld) => ld.start('frame'));
  t.step('done frame', (ld) => ld.done('frame'));
  t.step('finish', (ld) => ld.finish());
  t.step('finish twice', (ld) => ld.finish());
  t.step('run empty', (ld) => ld.run([]));
  t.step('start in empty', (ld) => ld.start('three'));
  t.step('finish empty', (ld) => ld.finish());
  t.step('run unknown ids', (ld) => ld.run([{ id: 'bogus', ms: 10, weight: 1 }, { id: 'sim', ms: 10, weight: 1 }]));
  t.step('unknown first', (ld) => { ld.start('bogus'); ld.report('bogus', 0.5); });
  t.step('run no ms', (ld) => ld.run([{ id: 'module', weight: 0.5 }, { id: 'frame', weight: 0.5 }]));
  t.step('run planned zero', (ld) => ld.run([{ id: 'world', ms: 0, weight: 0 }]));
  t.step('paint zero weight', (ld) => { ld.start('world'); ld.report('world', 0.5); });
});

loaderCase('relabel', {}, async (t) => {
  t.step('run en', (ld) => ld.run(t.mod.planStages(['module', 'world', 'frame'], 2500)));
  t.step('switch to es', () => setLocale('es'));
  t.step('screen 4 relabels', (ld) => ld.start('frame'));
  t.step('run es', (ld) => ld.run(t.mod.planStages(COLD, 2964)));
  t.step('switch to en', () => setLocale('en'));
  t.step('screen 2', (ld) => ld.start('board'));
});

/* ------------------------------------------------------------------ */

const ran = [];
for (const c of asyncCases) {
  const s = new Stream();
  await c.run(s);
  ran.push({ id: c.id, lines: s.lines });
}

goldenMain('loading:golden', FIXTURE, ran.map((r) => ({
  id: r.id,
  run(s) {
    s.lines.push(...r.lines);
  },
})));
