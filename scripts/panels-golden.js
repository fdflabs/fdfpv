/*
 * panels-golden.js: the Rates curve panel (src/ui/ratespanel.js) and the
 * PIDs bar panel (src/ui/pidspanel.js) held to the outputs they gave when
 * tests/fixtures/panels-golden.json was written. npm run panels:golden.
 *
 * What it pins, in English and in Spanish:
 *
 *   the palette exports     exact strings.
 *   ratesCurves             each curve's id, label, colour, dash, type and
 *                           axis, by field, so key order stays free.
 *   mountRatesPanel         the DOM it builds (tags, classes, attributes,
 *                           styles, hidden flags, text) after every paint,
 *                           whether a paint reused the nodes or rebuilt them,
 *                           and the PICTURE every paint and paintStick draws,
 *                           over rate profiles of every type, split and
 *                           joined pitch, every throttle cap, airframes,
 *                           live sticks in and out of range, canvas sizes
 *                           and device pixel ratios.
 *   mountPidsPanel          the same, over module readbacks and captions,
 *                           plus the resize listener it installs.
 *
 * HOW A PICTURE IS PINNED. The fake 2D context below keeps the state a real
 * one keeps (styles, line state, dash, font, alignment, transform, current
 * path) and writes a line only when paint lands: a clear, a rect fill, a
 * fill, a stroke, a text fill. Each line carries what decides those pixels,
 * in device space. Two drawings that put the same paint in the same places
 * in the same order write the same stream however they set the state up.
 * The context lives as long as its canvas, as a real one does, and a width
 * or height assignment resets it, as a real one does, so a drawing that
 * leans on state left over from the last frame is held to that too.
 *
 * Geometry is written to 10 significant digits with anything under 1e-9
 * written as 0: a rewrite that multiplies in another order moves a
 * coordinate by an ulp, which is not a pixel. Everything else is exact.
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

import { goldenMain, seeded } from './lib/golden.js';
import { setLocale, useLocale } from '../src/strings/index.js';
import { RATE_DEFAULTS, RATE_TYPES, THROTTLE_CAP_CHOICES } from '../configs/rates.js';
import { AIRFRAME_IDS } from '../configs/airframes.js';
import { STOCK_PIDS } from '../configs/pids.js';

const g = (x) => {
  if (typeof x !== 'number' || !Number.isFinite(x)) return x;
  return Math.abs(x) < 1e-9 ? 0 : Number(x.toPrecision(10));
};

/* Where the fakes report. Each case points it at its own stream. */
let say = () => {};

/* ------------------------------------------------------------------ *
 * A 2D context that records paint, not calls.
 * ------------------------------------------------------------------ */

const IDENTITY = [1, 0, 0, 1, 0, 0];

function mul(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

const at = (m, x, y) => [g(m[0] * x + m[2] * y + m[4]), g(m[1] * x + m[3] * y + m[5])];

function defaults() {
  return {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    lineJoin: 'miter',
    lineCap: 'butt',
    globalAlpha: 1,
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    dash: [],
    m: IDENTITY.slice(),
  };
}

const TRACKED = ['fillStyle', 'strokeStyle', 'lineWidth', 'lineJoin', 'lineCap', 'globalAlpha',
  'font', 'textAlign', 'textBaseline'];

function fakeContext() {
  let st = defaults();
  const stack = [];
  let path = [];
  const box = (x, y, w, h) => [at(st.m, x, y), at(st.m, x + w, y), at(st.m, x + w, y + h), at(st.m, x, y + h)];
  const ink = () => ({
    style: st.strokeStyle,
    width: g(st.lineWidth),
    join: st.lineJoin,
    cap: st.lineCap,
    dash: st.dash.map(g),
    alpha: g(st.globalAlpha),
    lin: st.m.slice(0, 4).map(g),
  });
  const ctx = {
    reset() { st = defaults(); stack.length = 0; path = []; },
    save() { stack.push({ ...st, m: st.m.slice(), dash: st.dash.slice() }); },
    restore() { if (stack.length) st = stack.pop(); },
    translate(x, y) { st.m = mul(st.m, [1, 0, 0, 1, x, y]); },
    scale(x, y) { st.m = mul(st.m, [x, 0, 0, y, 0, 0]); },
    rotate(a) { st.m = mul(st.m, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]); },
    setTransform(a, b, c, d, e, f) { st.m = [a, b, c, d, e, f]; },
    setLineDash(d) { st.dash = Array.from(d); },
    getLineDash() { return st.dash.slice(); },
    beginPath() { path = []; },
    moveTo(x, y) { path.push(['M', at(st.m, x, y)]); },
    lineTo(x, y) { path.push(['L', at(st.m, x, y)]); },
    closePath() { path.push(['Z']); },
    arc(x, y, r, a0, a1, ccw) {
      path.push(['A', at(st.m, x, y), st.m.slice(0, 4).map(g), g(r), g(a0), g(a1), Boolean(ccw)]);
    },
    rect(x, y, w, h) { path.push(['R', ...box(x, y, w, h)]); },
    fill() { say('paint fill', { style: st.fillStyle, alpha: g(st.globalAlpha), path }); },
    stroke() { say('paint stroke', { ...ink(), path }); },
    clearRect(x, y, w, h) { say('paint clearRect', box(x, y, w, h)); },
    fillRect(x, y, w, h) {
      say('paint fillRect', { style: st.fillStyle, alpha: g(st.globalAlpha), at: box(x, y, w, h) });
    },
    strokeRect(x, y, w, h) { say('paint strokeRect', { ...ink(), at: box(x, y, w, h) }); },
    fillText(text, x, y) {
      say('paint fillText', {
        text: String(text),
        style: st.fillStyle,
        alpha: g(st.globalAlpha),
        font: st.font,
        align: st.textAlign,
        baseline: st.textBaseline,
        at: at(st.m, x, y),
        lin: st.m.slice(0, 4).map(g),
      });
    },
  };
  for (const p of TRACKED) {
    Object.defineProperty(ctx, p, { get: () => st[p], set: (v) => { st[p] = v; } });
  }
  /* A call the fake does not model is a loud line, so a rewrite reaching
   * for something the old code never did cannot pass quietly. */
  return new Proxy(ctx, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => say('paint unmodelled', { key: String(key), args: args.map(g) });
    },
    set(target, key, v) {
      if (key in target) {
        target[key] = v;
      } else {
        say('paint unmodelled-set', { key: String(key), v: g(v) });
      }
      return true;
    },
  });
}

/* ------------------------------------------------------------------ *
 * Just enough DOM.
 * ------------------------------------------------------------------ */

class FakeText {
  constructor(text) { this.text = text; }

  get textContent() { return this.text; }
}

class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.childNodes = [];
    this.className = '';
    this.attrs = {};
    this.style = {};
    this.hidden = false;
    this.clientWidth = 0;
    this.clientHeight = 0;
  }

  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }

  set textContent(v) {
    const s = v == null ? '' : String(v);
    this.childNodes = s ? [new FakeText(s)] : [];
  }

  append(...nodes) {
    for (const n of nodes) this.childNodes.push(typeof n === 'string' ? new FakeText(n) : n);
  }

  setAttribute(k, v) { this.attrs[k] = String(v); }

  getAttribute(k) { return Object.hasOwn(this.attrs, k) ? this.attrs[k] : null; }
}

class FakeCanvas extends FakeElement {
  constructor() {
    super('canvas');
    this.w = 300;
    this.h = 150;
    this.ctx = null;
    this.noContext = false;
  }

  get width() { return this.w; }

  set width(v) { say('canvas width=', v); this.w = v; if (this.ctx) this.ctx.reset(); }

  get height() { return this.h; }

  set height(v) { say('canvas height=', v); this.h = v; if (this.ctx) this.ctx.reset(); }

  getContext(kind) {
    say('canvas getContext', kind);
    if (this.noContext) return null;
    if (!this.ctx) this.ctx = fakeContext();
    return this.ctx;
  }
}

const listeners = [];
globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? new FakeCanvas() : new FakeElement(tag)),
};
globalThis.window = {
  devicePixelRatio: 1,
  addEventListener(type, fn, ...rest) {
    say('window addEventListener', [type, typeof fn, ...rest]);
    listeners.push({ type, fn });
  },
};

function nodesOf(n, out = []) {
  out.push(n);
  if (n.childNodes) for (const c of n.childNodes) nodesOf(c, out);
  return out;
}

function shape(n) {
  if (n instanceof FakeText) return n.text;
  const style = Object.keys(n.style).sort().map((k) => `${k}:${n.style[k]}`);
  const attrs = Object.keys(n.attrs).sort().map((k) => `${k}=${n.attrs[k]}`);
  const own = [n.tagName];
  if (n.className) own.push(`.${n.className}`);
  if (attrs.length) own.push(`[${attrs.join(' ')}]`);
  if (style.length) own.push(`{${style.join(';')}}`);
  if (n.hidden) own.push('hidden');
  return [own.join(' '), ...n.childNodes.map(shape)];
}

const find = (root, cls) => nodesOf(root).find((n) => n.className && n.className.split(' ').includes(cls));

/* A mounted panel plus what the cases need to poke at it: its graph wrap
 * for sizing, its canvas, and the node set of the last snapshot. */
function harness(s, mount) {
  const panel = mount();
  s.say('mount keys', Object.keys(panel).sort());
  const wrap = find(panel.root, 'rates-graph-wrap');
  const canvas = nodesOf(panel.root).find((n) => n instanceof FakeCanvas);
  let last = null;
  /* Elements only: writing textContent replaces the text node in a real
   * DOM too, so a text node's identity says nothing about a rebuild. */
  const snap = (label) => {
    const nodes = nodesOf(panel.root).filter((n) => n instanceof FakeElement);
    const same = last !== null && last.length === nodes.length && nodes.every((n, i) => n === last[i]);
    last = nodes;
    s.say(`${label} dom`, shape(panel.root));
    s.say(`${label} sameNodes`, same);
  };
  return { panel, wrap, canvas, snap };
}

function size(h, w, hgt, dpr) {
  h.wrap.clientWidth = w;
  h.wrap.clientHeight = hgt;
  window.devicePixelRatio = dpr;
}

/* ------------------------------------------------------------------ *
 * Inputs
 * ------------------------------------------------------------------ */

const axis = (rcRate, srate, expo) => ({ rcRate, srate, expo });
const profile = (type, roll, pitch, yaw, extra = {}) => ({ type, roll, pitch, yaw, ...extra });

const TYPED = {
  BETAFLIGHT: profile('BETAFLIGHT', axis(100, 70, 0), axis(100, 70, 0), axis(100, 70, 0)),
  RACEFLIGHT: profile('RACEFLIGHT', axis(37, 80, 50), axis(37, 80, 50), axis(37, 80, 50)),
  KISS: profile('KISS', axis(100, 70, 0), axis(100, 70, 0), axis(100, 70, 0)),
  ACTUAL: profile('ACTUAL', axis(7, 67, 0), axis(7, 67, 0), axis(5, 50, 20)),
  QUICK: profile('QUICK', axis(100, 67, 0), axis(120, 80, 30), axis(100, 50, 0)),
};

const SPLIT = profile('ACTUAL', axis(7, 67, 0), axis(9, 80, 25), axis(7, 67, 0));
const HOT = profile('ACTUAL', axis(20, 200, 100), axis(1, 1, 0), axis(200, 200, 0));
const ALL_SAME = profile('BETAFLIGHT', axis(255, 100, 100), axis(255, 100, 100), axis(255, 100, 100));
const SLOW = profile('ACTUAL', axis(1, 1, 0), axis(1, 1, 0), axis(1, 1, 0));

/* Profiles off a seeded generator: random types, uint8s across and past
 * each column's range, sometimes a shared roll and pitch. */
function randomProfiles(n, seed) {
  const r = seeded(seed);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const ax = () => axis(r.int(0, 260), r.int(0, 260), r.int(0, 110));
    const roll = ax();
    const pitch = r.chance(0.4) ? { ...roll } : ax();
    out.push(profile(r.pick(RATE_TYPES), roll, pitch, ax(), {
      throttleCap: r.pick([...THROTTLE_CAP_CHOICES, 55, 101, 0]),
    }));
  }
  return out;
}

const STICKS = [
  { roll: 0, pitch: 0, yaw: 0 },
  { roll: 0.3, pitch: -0.6, yaw: 0.9 },
  { roll: -1, pitch: 1, yaw: -0.25 },
  { roll: 1.7, pitch: -3, yaw: 1.0000001 },
  { roll: NaN, pitch: 0.5, yaw: Infinity },
  { pitch: 0.2 },
  { roll: '0.5', pitch: null, yaw: -0.75 },
  { roll: -0, pitch: 0.125, yaw: -0.999 },
];

const SIZES = [
  [0, 0, 1], [520, 240, 1], [520, 240, 2], [333, 191, 1.5], [150, 100, 1],
  [199, 149, 1], [1203, 517, 1], [640, 300, 0], [640, 300, undefined], [455.5, 233.25, 1.25],
];

function pidsRow(p, i, d, dmax, f) {
  return { p, i, d, dmax, f };
}

const READBACKS = [
  ['stock', { tune: 'x', pids: STOCK_PIDS }],
  ['hot', { tune: 'x', pids: { roll: pidsRow(90, 160, 60, 80, 240), pitch: pidsRow(94, 168, 68, 92, 250), yaw: pidsRow(90, 160, 0, 0, 240) } }],
  ['zeros', { pids: { roll: pidsRow(0, 0, 0, 0, 0), pitch: pidsRow(0, 0, 0, 0, 0), yaw: pidsRow(0, 0, 0, 0, 0) } }],
  ['edges', { pids: { roll: pidsRow(1, 255, 1000, 1, 0), pitch: pidsRow(250, 1, 0, 255, 1000), yaw: pidsRow(45, 80, 30, 40, 120) } }],
  ['soft', { pids: { roll: pidsRow(22, 40, 15, 20, 60), pitch: pidsRow(23, 42, 17, 23, 62), yaw: pidsRow(22, 40, 0, 0, 60) } }],
];

/* ------------------------------------------------------------------ *
 * Cases
 * ------------------------------------------------------------------ */

await useLocale('es');
setLocale('en');
const rp = await import('../src/ui/ratespanel.js');
const pp = await import('../src/ui/pidspanel.js');
/* Second instances loaded while Spanish is current, for anything read
 * once at load time. */
setLocale('es');
const rpEs = await import('../src/ui/ratespanel.js?locale=es');
const ppEs = await import('../src/ui/pidspanel.js?locale=es');
setLocale('en');

const LOCALES = [['en', rp, pp], ['es', rpEs, ppEs]];

function curvesSummary(curves) {
  return curves.map((c) => ({
    id: c.id, label: c.label, color: c.color, dash: c.dash, type: c.type, axis: c.axis,
  }));
}

const cases = [];
const add = (id, run) => cases.push({
  id,
  run(s) {
    say = (label, value) => s.say(label, value);
    window.devicePixelRatio = 1;
    listeners.length = 0;
    try {
      run(s);
    } finally {
      setLocale('en');
      say = () => {};
    }
  },
});

for (const [loc, R, P] of LOCALES) {
  add(`exports.${loc}`, (s) => {
    setLocale(loc);
    for (const k of Object.keys(R).sort()) s.say(`rates export ${k}`, typeof R[k] === 'function' ? `fn/${R[k].length}` : R[k]);
    for (const k of Object.keys(P).sort()) s.say(`pids export ${k}`, typeof P[k] === 'function' ? `fn/${P[k].length}` : P[k]);
    const inputs = [['null', null], ['undefined', undefined], ['empty', {}], ['defaults', RATE_DEFAULTS],
      ['split', SPLIT], ['hot', HOT], ['bogus', { type: 'NOPE', roll: axis(1, 2, 3) }], ['string', 'x'],
      ...Object.entries(TYPED)];
    for (const [name, v] of inputs) s.call(`ratesCurves ${name}`, () => curvesSummary(R.ratesCurves(v)));
    randomProfiles(30, 0x4a7e).forEach((v, i) => s.call(`ratesCurves random ${i}`, () => curvesSummary(R.ratesCurves(v))));
  });

  /* The screen as the menu drives it: mount, the first paint, knob steps
   * that keep the shape, a split pitch, a rejoin, a type change. */
  add(`rates.walk.${loc}`, (s) => {
    setLocale(loc);
    const h = harness(s, R.mountRatesPanel);
    h.snap('mounted');
    size(h, 520, 240, 1);
    h.panel.paintStick({ roll: 0.5, pitch: 0, yaw: 0 });
    h.snap('stick before paint');
    h.panel.paint(RATE_DEFAULTS, { roll: 0, pitch: 0, yaw: 0 });
    h.snap('defaults');
    h.panel.paint({ ...RATE_DEFAULTS, roll: axis(7, 68, 0), pitch: axis(7, 68, 0) }, null);
    h.snap('knob step');
    h.panel.paint(SPLIT, { roll: 0.2, pitch: -0.4, yaw: 0.1 });
    h.snap('split');
    h.panel.paint({ ...SPLIT, pitch: axis(9, 81, 25) });
    h.snap('split knob');
    h.panel.paint(RATE_DEFAULTS);
    h.snap('rejoined');
    for (const type of RATE_TYPES) {
      h.panel.paint(TYPED[type], STICKS[1], 'interceptor');
      h.snap(`type ${type}`);
    }
    h.panel.paint(null);
    h.snap('null');
    h.panel.paint(HOT);
    h.snap('hot');
    h.panel.paint(ALL_SAME);
    h.snap('all same');
    h.panel.paint(SLOW);
    h.snap('slow');
  });

  add(`rates.hover.${loc}`, (s) => {
    setLocale(loc);
    const h = harness(s, R.mountRatesPanel);
    for (const cap of [...THROTTLE_CAP_CHOICES, 0, 55, 101, undefined, NaN]) {
      for (const af of [...AIRFRAME_IDS, undefined, 'nope']) {
        h.panel.paint({ ...RATE_DEFAULTS, throttleCap: cap }, null, af);
        s.say(`hover ${cap} ${af}`, find(h.panel.root, 'rates-readout').textContent);
      }
    }
    h.snap('after hover');
  });

  add(`rates.random.${loc}`, (s) => {
    setLocale(loc);
    const h = harness(s, R.mountRatesPanel);
    size(h, 480, 220, 1);
    randomProfiles(40, 0x9e1).forEach((v, i) => {
      h.panel.paint(v, STICKS[i % STICKS.length], i % 3 ? undefined : 'nope');
      h.snap(`random ${i}`);
    });
  });

  add(`pids.walk.${loc}`, (s) => {
    setLocale(loc);
    const h = harness(s, P.mountPidsPanel);
    h.snap('mounted');
    size(h, 520, 220, 1);
    h.panel.paint(null, 'Loading');
    h.snap('null');
    h.panel.paint({}, undefined);
    h.snap('no pids');
    for (const [name, live] of READBACKS) {
      h.panel.paint(live, `caption ${name}`);
      h.snap(name);
    }
    h.panel.paint(READBACKS[1][1], null);
    h.snap('null caption');
    h.panel.paint(READBACKS[1][1], '');
    h.snap('empty caption');
    h.panel.paint(undefined);
    h.snap('undefined');
  });
}

add('rates.sizes', (s) => {
  const h = harness(s, rp.mountRatesPanel);
  for (const [w, hgt, dpr] of SIZES) {
    size(h, w, hgt, dpr);
    h.panel.paint(SPLIT, STICKS[1]);
    h.panel.paintStick(STICKS[2]);
  }
  h.snap('after sizes');
});

add('rates.sticks', (s) => {
  const h = harness(s, rp.mountRatesPanel);
  size(h, 400, 200, 1);
  h.panel.paint(RATE_DEFAULTS, STICKS[0]);
  for (const st of STICKS) h.panel.paintStick(st);
  h.panel.paintStick(null);
  h.panel.paintStick();
  h.panel.paint(SPLIT, null);
  for (const st of STICKS) h.panel.paintStick(st);
  /* ui.js hands the same stick object to both calls and mutates it from
   * the frame loop, so a paintStick with no argument draws where it is
   * now, not where it was when it was handed over. */
  const live = { roll: 0.1, pitch: 0.1, yaw: 0.1 };
  h.panel.paint(TYPED.QUICK, live);
  live.roll = -0.8;
  live.yaw = 0.6;
  h.panel.paintStick();
  h.snap('after sticks');
});

add('rates.nocontext', (s) => {
  const h = harness(s, rp.mountRatesPanel);
  h.canvas.noContext = true;
  size(h, 500, 250, 2);
  h.panel.paint(SPLIT, STICKS[1]);
  h.panel.paintStick(STICKS[2]);
  h.snap('no context');
});

add('pids.sizes', (s) => {
  const h = harness(s, pp.mountPidsPanel);
  for (const [w, hgt, dpr] of SIZES) {
    size(h, w, hgt, dpr);
    h.panel.paint(READBACKS[1][1], 'sized');
  }
  h.snap('after sizes');
});

add('pids.resize', (s) => {
  const h = harness(s, pp.mountPidsPanel);
  const mine = listeners.filter((l) => l.type === 'resize');
  s.say('resize listeners', mine.length);
  const fire = (label) => {
    s.say('fire', label);
    for (const l of mine) l.fn({ type: 'resize' });
  };
  fire('hidden before paint');
  size(h, 600, 230, 1);
  fire('shown before paint');
  h.panel.paint(READBACKS[3][1], 'x');
  size(h, 0, 230, 1);
  fire('hidden after paint');
  size(h, 700, 260, 2);
  fire('shown after paint');
  h.panel.paint(null, 'y');
  size(h, 300, 0, 1);
  fire('shown empty');
});

add('pids.nocontext', (s) => {
  const h = harness(s, pp.mountPidsPanel);
  h.canvas.noContext = true;
  size(h, 500, 250, 2);
  h.panel.paint(READBACKS[1][1], 'c');
  h.snap('no context');
});

add('mounts.independent', (s) => {
  const a = harness(s, rp.mountRatesPanel);
  const b = harness(s, rp.mountRatesPanel);
  size(a, 520, 240, 1);
  size(b, 300, 160, 1);
  a.panel.paint(SPLIT, STICKS[1]);
  b.panel.paint(RATE_DEFAULTS, STICKS[2]);
  a.panel.paintStick();
  a.snap('a');
  b.snap('b');
  const c = harness(s, pp.mountPidsPanel);
  const d = harness(s, pp.mountPidsPanel);
  c.panel.paint(READBACKS[0][1], 'c');
  d.panel.paint(null, 'd');
  c.snap('c');
  d.snap('d');
});

goldenMain('panels:golden', new URL('../tests/fixtures/panels-golden.json', import.meta.url), cases);
