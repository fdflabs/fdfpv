/*
 * trickfilm-golden.js: src/ui/trickfilm.js held to the outputs it gave when
 * tests/fixtures/trickfilm-golden.json was written. npm run trickfilm:golden.
 *
 * What it pins, for every step list src/game/trickdetect.js defines and for a
 * set of made up lists that reach the branches the catalogue does not:
 *
 *   viewFor, describeSteps   exactly, in English and in Spanish.
 *   VIEW_LABEL               as loaded under each locale, because it is read
 *                            once when the module loads.
 *   filmFor                  the fields its callers read (view, caption,
 *                            totalMs, obstacle, steps by identity, and each
 *                            segment's kind, ms and tap). The craft's path
 *                            is pinned through the pictures instead, so the
 *                            segment's inner representation stays free.
 *   drawFilm                 the PICTURE, at several times and sizes.
 *   TrickFilmPlayer          sizing, the frame loop, stop, reduced motion,
 *                            driven through a fake canvas, window and
 *                            requestAnimationFrame.
 *
 * HOW A PICTURE IS PINNED. The fake 2D context below does not log the calls
 * it receives. It keeps the state a real context keeps (styles, line state,
 * dash, alpha, the transform, the clip, the current path) and writes a line
 * only when something reaches the pixels: a clear, a fill, a stroke, a rect
 * fill or stroke, or a clip. Each line carries everything that decides those
 * pixels: the path in device space, the style, and for a stroke the line
 * width, join, cap, dash and the transform's linear part (a stroke drawn
 * under scale(1, 0.4) is an ellipse of ink, not a circle). Two drawings that
 * put the same paint in the same places in the same order write the same
 * stream however differently they set the state up, which is what lets a
 * rewrite be structured its own way and still be held to the same picture.
 *
 * Geometry is written to 10 significant digits, and anything smaller than
 * 1e-9 is written as 0 (which also folds -0 away): a rewrite that multiplies
 * in another order moves a coordinate by an ulp, and the sine of a heading
 * that should be zero comes out as 6e-17 by one route and -4e-17 by another.
 * Neither is a pixel. Everything that is not geometry (strings, counts,
 * durations, booleans) is exact.
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

import { goldenMain } from './lib/golden.js';
import { setLocale, useLocale } from '../src/strings/index.js';
import { PATTERNS } from '../src/game/trickdetect.js';

await useLocale('es');
setLocale('en');
const tf = await import('../src/ui/trickfilm.js');
/* A second instance of the module loaded while Spanish is current, so the
 * load time VIEW_LABEL is pinned in both languages. */
setLocale('es');
const tfEs = await import('../src/ui/trickfilm.js?locale=es');
setLocale('en');

const FIXTURE = new URL('../tests/fixtures/trickfilm-golden.json', import.meta.url);

const g = (x) => {
  if (typeof x !== 'number' || !Number.isFinite(x)) return x;
  return Math.abs(x) < 1e-9 ? 0 : Number(x.toPrecision(10));
};

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

function apply(m, x, y) {
  return [g(m[0] * x + m[2] * y + m[4]), g(m[1] * x + m[3] * y + m[5])];
}

const linear = (m) => m.slice(0, 4).map(g);

function freshState() {
  return {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    lineJoin: 'miter',
    lineCap: 'butt',
    globalAlpha: 1,
    dash: [],
    m: IDENTITY.slice(),
    clip: [],
  };
}

const STYLE_PROPS = ['fillStyle', 'strokeStyle', 'lineWidth', 'lineJoin', 'lineCap', 'globalAlpha'];

function paintContext(out) {
  let st = freshState();
  const stack = [];
  let path = [];
  const rectPath = (x, y, w, h) => [
    'rect', apply(st.m, x, y), apply(st.m, x + w, y), apply(st.m, x + w, y + h), apply(st.m, x, y + h),
  ];
  const strokeLook = () => ({
    style: st.strokeStyle,
    width: g(st.lineWidth),
    join: st.lineJoin,
    cap: st.lineCap,
    dash: st.dash.map(g),
    alpha: g(st.globalAlpha),
    lin: linear(st.m),
  });
  const ctx = {
    save() { stack.push({ ...st, m: st.m.slice(), dash: st.dash.slice(), clip: st.clip.slice() }); },
    restore() { if (stack.length) st = stack.pop(); },
    translate(x, y) { st.m = mul(st.m, [1, 0, 0, 1, x, y]); },
    rotate(a) { st.m = mul(st.m, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]); },
    scale(x, y) { st.m = mul(st.m, [x, 0, 0, y, 0, 0]); },
    setTransform(a, b, c, d, e, f) { st.m = [a, b, c, d, e, f]; },
    setLineDash(d) { st.dash = d.slice(); },
    beginPath() { path = []; },
    moveTo(x, y) { path.push(['M', apply(st.m, x, y)]); },
    lineTo(x, y) { path.push(['L', apply(st.m, x, y)]); },
    closePath() { path.push(['Z']); },
    arc(x, y, r, a0, a1, ccw) {
      path.push(['A', apply(st.m, x, y), linear(st.m), g(r), g(a0), g(a1), Boolean(ccw)]);
    },
    rect(x, y, w, h) { path.push(rectPath(x, y, w, h)); },
    clip() { st.clip = st.clip.concat([path.slice()]); out('clip', { path }); },
    fill() { out('fill', { style: st.fillStyle, alpha: g(st.globalAlpha), path, clip: st.clip }); },
    stroke() { out('stroke', { ...strokeLook(), path, clip: st.clip }); },
    clearRect(x, y, w, h) { out('clearRect', { at: rectPath(x, y, w, h), clip: st.clip }); },
    fillRect(x, y, w, h) {
      out('fillRect', { style: st.fillStyle, alpha: g(st.globalAlpha), at: rectPath(x, y, w, h), clip: st.clip });
    },
    strokeRect(x, y, w, h) { out('strokeRect', { ...strokeLook(), at: rectPath(x, y, w, h), clip: st.clip }); },
  };
  for (const p of STYLE_PROPS) {
    Object.defineProperty(ctx, p, {
      get: () => st[p],
      set: (v) => { st[p] = v; },
    });
  }
  /* Anything the fake does not model is a loud line in the stream, so a
   * rewrite reaching for a call the old code never made cannot pass quietly. */
  return new Proxy(ctx, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => out('unmodelled', { key: String(key), args: args.map(g) });
    },
    set(target, key, v) {
      if (key in target) {
        target[key] = v;
      } else {
        out('unmodelled-set', { key: String(key), v: g(v) });
      }
      return true;
    },
  });
}

const sayTo = (s, prefix) => (op, data) => s.say(`${prefix} ${op}`, data);

/* ------------------------------------------------------------------ *
 * Inputs
 * ------------------------------------------------------------------ */

/* Step lists the catalogue never writes, for the branches it never reaches:
 * an empty trick, odd and missing turn counts, a missing or unknown axis,
 * negative turns, a tapped rotation (the only thing that draws a wall and
 * flashes it), a stall, a post lap held on screen and one with a floor, a
 * lap of no stated size, rotations either side of a lap, and the mixed axis
 * views. */
const MADE_UP = [
  ['empty', []],
  ['odd-turns', [{ axis: 'roll', turns: 1.5 }]],
  ['no-axis', [{ turns: 1 }]],
  ['no-turns', [{ axis: 'yaw' }]],
  ['negative', [{ axis: 'pitch', turns: -0.5 }]],
  ['unknown-axis', [{ axis: 'corkscrew', turns: 1 }]],
  ['tapped-roll', [{ axis: 'roll', turns: 1, inverted: true, tap: true }]],
  ['tapped-pitch', [{ axis: 'pitch', turns: 0.5, tap: true }, { axis: 'pitch', turns: 0.5, sameAs: 0 }]],
  ['stall-yaw', [{ axis: 'yaw', turns: 1, stallMs: 500 }, { axis: 'yaw', turns: 1, oppTo: 0 }]],
  ['behind-back', [{ axis: 'roll', turns: 0.5 }, { axis: 'roll', turns: 0.5, oppTo: 0 }]],
  ['pole-two-track', [{ path: 'pole', turns: 2, track: true }]],
  ['pole-floor', [{ path: 'pole', turnsAtLeast: 1, inverted: true, from: 'over' }]],
  ['bar-three-quarter', [{ path: 'bar', turns: 0.75, from: 'under', rot: { roll: 0.25, pitch: 0.75 } }]],
  ['bar-bare', [{ path: 'bar' }]],
  ['bar-over-track', [{ path: 'bar', turns: 1, from: 'over', track: true, rot: { yaw: 0.5 } }]],
  ['around-lap', [{ axis: 'roll', turns: 1 }, { path: 'bar', turns: 1, from: 'under' }, { axis: 'roll', turns: 0.5 }]],
  ['pitch-and-roll', [{ axis: 'pitch', turns: 1, sameAs: 0 }, { axis: 'roll', turns: 0.25 }]],
  ['roll-then-yaw', [{ axis: 'roll', turns: 1 }, { axis: 'yaw', turns: 0.5, stallMs: 400 }]],
  ['above-pitchless', [{ axis: 'yaw', turns: 2 }, { axis: 'roll', turns: 0.75, tap: true }]],
];

const SIZES = [[448, 280], [560, 280], [160, 110], [1120, 700], [137.5, 110]];

/* Times through the film: fractions of its length, the middle of every
 * segment (where a tap flashes), each segment boundary, and the hold. */
function timesFor(film) {
  const ts = [0, 0.13, 0.37, 0.5, 0.71, 0.9].map((f) => f * film.totalMs);
  let acc = 0;
  for (const seg of film.segs) {
    ts.push(acc + seg.ms * 0.5, acc + seg.ms * 0.47, acc);
    acc += seg.ms;
  }
  ts.push(acc, film.totalMs - 1);
  return ts;
}

function filmSummary(film, steps) {
  return {
    view: film.view,
    caption: film.caption,
    totalMs: film.totalMs,
    obstacle: film.obstacle,
    sameSteps: film.steps === steps,
    segs: film.segs.map((seg) => ({ kind: seg.kind, ms: seg.ms, tap: seg.tap })),
  };
}

function stepsCase(id, steps) {
  return {
    id,
    run(s) {
      s.call('viewFor', () => tf.viewFor(steps));
      s.call('describe.en', () => tf.describeSteps(steps));
      setLocale('es');
      s.call('describe.es', () => tf.describeSteps(steps));
      const filmEs = tf.filmFor(steps);
      setLocale('en');
      s.say('film.es', filmSummary(filmEs, steps));
      const film = tf.filmFor(steps);
      s.say('film.en', filmSummary(film, steps));
      for (const [W, H] of SIZES) {
        for (const t of timesFor(film)) {
          const label = `draw ${W}x${H} t=${g(t)}`;
          s.say(label, 'begin');
          tf.drawFilm(paintContext(sayTo(s, label)), film, t, W, H);
        }
      }
    },
  };
}

/* ------------------------------------------------------------------ *
 * The player, in a fake browser
 * ------------------------------------------------------------------ */

function fakeBrowser(s, { dpr, reduced, box, noWindow = false }) {
  const frames = new Map();
  let nextId = 1;
  globalThis.requestAnimationFrame = (cb) => {
    const id = nextId;
    nextId += 1;
    frames.set(id, cb);
    s.say('raf', id);
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => {
    s.say('cancel', id);
    frames.delete(id);
  };
  if (noWindow) {
    delete globalThis.window;
  } else {
    globalThis.window = {
      devicePixelRatio: dpr,
      matchMedia: (q) => {
        s.say('matchMedia', q);
        return { matches: reduced };
      },
    };
  }
  const size = { width: 300, height: 150 };
  const canvas = {
    box,
    getBoundingClientRect() { return { width: this.box.width, height: this.box.height }; },
    getContext(kind) {
      s.say('getContext', kind);
      return paintContext(sayTo(s, 'paint'));
    },
  };
  for (const k of ['width', 'height']) {
    Object.defineProperty(canvas, k, {
      get: () => size[k],
      set: (v) => { s.say(`canvas.${k}=`, v); size[k] = v; },
    });
  }
  /* Runs every frame callback pending now, at time `now`, the way a browser
   * runs one batch per refresh. */
  const tick = (now) => {
    const batch = [...frames.entries()];
    frames.clear();
    s.say('tick', { now, pending: batch.map(([id]) => id) });
    for (const [, cb] of batch) cb(now);
  };
  return {
    canvas, box, tick, pending: () => [...frames.keys()],
  };
}

function cleanBrowser() {
  delete globalThis.requestAnimationFrame;
  delete globalThis.cancelAnimationFrame;
  delete globalThis.window;
}

const byName = (name) => PATTERNS.find((p) => p.name === name).steps;

function playerCase(id, opts, script) {
  return {
    id,
    run(s) {
      const b = fakeBrowser(s, opts);
      try {
        const p = new tf.TrickFilmPlayer(b.canvas);
        script(s, p, b);
        s.say('pending', b.pending());
      } finally {
        cleanBrowser();
      }
    },
  };
}

const powerloop = tf.filmFor(byName('Powerloop'));
const rollFilm = tf.filmFor([{ axis: 'roll', turns: 1 }, { axis: 'roll', turns: 1, oppTo: 0 }]);
const longFilm = tf.filmFor([
  { axis: 'pitch', turns: 0.5 }, { axis: 'pitch', turns: 0.5 }, { axis: 'roll', turns: 1 },
  { axis: 'pitch', turns: 0.25 }, { axis: 'yaw', turns: 1 },
]);
const emptyFilm = tf.filmFor([]);

const PLAYER_CASES = [
  playerCase('player-loop', { dpr: 1.5, reduced: false, box: { width: 448, height: 280 } }, (s, p, b) => {
    p.show(powerloop);
    b.tick(1000);
    b.tick(1016.7);
    b.tick(1000 + powerloop.totalMs + 50);
    s.say('switch', 'rollFilm');
    p.show(rollFilm);
    b.tick(5000);
    b.tick(5100);
    p.stop();
    b.tick(5200);
    p.stop();
    p.show(powerloop);
    b.tick(9000);
    b.tick(9500);
  }),
  playerCase('player-floor-and-cap', { dpr: 3, reduced: false, box: { width: 100.4, height: 50 } }, (s, p, b) => {
    p.show(rollFilm);
    b.tick(16);
    b.box.width = 159.6;
    b.tick(32);
  }),
  playerCase('player-height-only', { dpr: 1, reduced: false, box: { width: 448, height: 280 } }, (s, p, b) => {
    p.show(powerloop);
    b.box.height = 224;
    b.tick(100);
    b.box.width = 360;
    b.tick(200);
  }),
  playerCase('player-time-zero', { dpr: 2, reduced: false, box: { width: 320, height: 200 } }, (s, p, b) => {
    p.show(rollFilm);
    b.tick(0);
    b.tick(16);
    b.tick(48);
  }),
  playerCase('player-start-twice', { dpr: 1, reduced: false, box: { width: 320, height: 200 } }, (s, p, b) => {
    p.start();
    p.draw(10);
    p.show(rollFilm);
    p.start();
    b.tick(400);
    p.draw(123);
  }),
  playerCase('player-reduced', { dpr: 2, reduced: true, box: { width: 560, height: 280 } }, (s, p, b) => {
    p.show(powerloop);
    p.show(longFilm);
    p.show(emptyFilm);
    p.show(rollFilm);
    p.start();
    p.stop();
  }),
  playerCase('player-no-window', { noWindow: true, box: { width: 448, height: 280 } }, (s, p, b) => {
    p.show(longFilm);
    b.tick(77);
    b.tick(longFilm.totalMs * 1.5);
    p.stop();
  }),
];

/* ------------------------------------------------------------------ */

const cases = [
  {
    id: 'view-label',
    run(s) {
      s.say('en', tf.VIEW_LABEL);
      s.say('es', tfEs.VIEW_LABEL);
      s.say('exports', Object.keys(tf).sort());
    },
  },
  ...PATTERNS.map((p, i) => stepsCase(`pattern-${String(i).padStart(2, '0')}-${p.name.replace(/[^A-Za-z0-9]+/g, '-')}`, p.steps)),
  ...MADE_UP.map(([id, steps]) => stepsCase(`made-up-${id}`, steps)),
  ...PLAYER_CASES,
];

goldenMain('trickfilm:golden', FIXTURE, cases);
