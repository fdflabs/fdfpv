/*
 * editor-ui.js: a fake crash cam for the editor's screen.
 *
 * Mounts createEditor (src/replay/editor.js) on an api with the names and
 * meanings of docs/EDITOR-PLAN.md 4.3, over a small pure edit model with
 * the names and meanings of 4.1. The model here is the plan's, written
 * small: src/replay/edit.js is package A's and was not on main when this
 * page was written, so once it lands the functions below give way to an
 * import of it and the check keeps its assertions.
 *
 * window.__ui is the check's handle: the api, the calls made on it, the
 * downloads the screen started and a knob for the export's pace.
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

import { useLocale, str } from '../../src/strings/index.js';
import { HEAD_N, HEAD } from '../../src/replay/recorder.js';
import { RIGS, defaults } from '../../src/replay/cameras.js';

/* ---- the edit model, as the plan's 4.1 states it ---- */

const SPEEDS = [0.1, 0.25, 0.5, 1, 2];
const MIN_SHOT_S = 0.05;
const SHOTS_MAX = 64;
const HISTORY_MAX = 200;

const copyCam = (c) => ({ ...c, p: JSON.parse(JSON.stringify(c.p)) });
const copyShot = (s) => ({ ...s, cam: copyCam(s.cam), enter: { ...s.enter } });
const withShots = (e, shots) => ({ ...e, shots });
const endOf = (e, i) => (i + 1 < e.shots.length ? e.shots[i + 1].t0 : e.out);

function defaultEdit(duration, cam) {
  return { v: 1, out: duration, look: { letterbox: false }, shots: [{ t0: 0, cam: copyCam(cam), speed: 1, enter: { type: 'cut' } }] };
}

function shotAt(e, t) {
  let i = 0;
  while (i + 1 < e.shots.length && e.shots[i + 1].t0 <= t) {
    i += 1;
  }
  return i;
}

function cut(e, t) {
  const i = shotAt(e, t);
  const s = e.shots[i];
  if (e.shots.length >= SHOTS_MAX || t - s.t0 < MIN_SHOT_S || endOf(e, i) - t < MIN_SHOT_S) {
    return e;
  }
  const shots = e.shots.map(copyShot);
  shots.splice(i + 1, 0, { ...copyShot(s), t0: t, enter: { type: 'cut' } });
  return withShots(e, shots);
}

function removeCut(e, i) {
  if (i < 1 || i >= e.shots.length) {
    return e;
  }
  return withShots(e, e.shots.filter((_, k) => k !== i).map(copyShot));
}

function nearestCut(e, t) {
  let best = -1;
  for (let i = 1; i < e.shots.length; i += 1) {
    if (best < 0 || Math.abs(e.shots[i].t0 - t) < Math.abs(e.shots[best].t0 - t)) {
      best = i;
    }
  }
  return best;
}

function moveCut(e, i, t) {
  if (i < 1 || i >= e.shots.length) {
    return e;
  }
  const lo = e.shots[i - 1].t0 + MIN_SHOT_S;
  const hi = endOf(e, i) - MIN_SHOT_S;
  const shots = e.shots.map(copyShot);
  shots[i].t0 = Math.max(lo, Math.min(hi, t));
  return withShots(e, shots);
}

function setIn(e, t) {
  const shots = e.shots.map(copyShot);
  shots[0].t0 = Math.max(0, Math.min(endOf(e, 0) - MIN_SHOT_S, t));
  return withShots(e, shots);
}

function setOut(e, t, duration) {
  const last = e.shots[e.shots.length - 1].t0;
  return { ...e, shots: e.shots.map(copyShot), out: Math.max(last + MIN_SHOT_S, Math.min(duration, t)) };
}

function setShot(e, i, patch) {
  const shots = e.shots.map(copyShot);
  shots[i] = { ...shots[i], ...patch };
  return withShots(e, shots);
}

function movieDuration(e) {
  return e.shots.reduce((sum, s, i) => sum + (endOf(e, i) - s.t0) / s.speed, 0);
}

function movieTime(e, t) {
  if (t < e.shots[0].t0 || t > e.out) {
    return NaN;
  }
  let m = 0;
  for (let i = 0; i < e.shots.length; i += 1) {
    const s = e.shots[i];
    const t1 = endOf(e, i);
    if (t < t1 || i === e.shots.length - 1) {
      return m + (t - s.t0) / s.speed;
    }
    m += (t1 - s.t0) / s.speed;
  }
  return m;
}

function createHistory(first) {
  const list = [first];
  let at = 0;
  let gestureFrom = null;
  return {
    get current() { return list[at]; },
    get canUndo() { return at > 0; },
    get canRedo() { return at < list.length - 1; },
    commit(e) {
      if (e === list[at]) {
        return;
      }
      list.splice(at + 1);
      list.push(e);
      if (list.length > HISTORY_MAX) {
        list.shift();
      }
      at = list.length - 1;
    },
    preview(e) {
      list[at] = e;
    },
    begin() {
      gestureFrom = list[at];
    },
    end() {
      if (gestureFrom === null) {
        return;
      }
      const e = list[at];
      list[at] = gestureFrom;
      gestureFrom = null;
      this.commit(e);
    },
    inGesture() {
      return gestureFrom !== null;
    },
    undo() {
      at = Math.max(0, at - 1);
    },
    redo() {
      at = Math.min(list.length - 1, at + 1);
    },
  };
}

/* ---- the clip ---- */

const DUR = 30;
const MARKERS = [
  { type: 'off', t: 12.4, part: 3, label: 'left wing' },
  { type: 'impact', t: 14.1 },
];
const readout = new Float64Array(HEAD_N);
readout[HEAD.speed] = 11.7;
readout[HEAD.agl] = 2.8;
readout[HEAD.throttle] = 0.62;

const params = Object.fromEntries(RIGS.map((r) => [r, defaults(r, 1)]));
const camOf = (rig, target = -1) => ({ rig, target, watch: 0, p: { ...params[rig] } });

const calls = [];
const downloads = [];
const held = new Set();
const S = {
  t: 0,
  playing: false,
  osd: true,
  bare: false,
  toast: null,
  exporting: null,
  history: createHistory(defaultEdit(DUR, camOf('chase'))),
};
const edit = () => S.history.current;
const shotNow = () => shotAt(edit(), S.t);

/* A change is one undo step, unless a gesture from the screen is open. */
function apply(next) {
  if (S.history.inGesture()) {
    S.history.preview(next);
  } else {
    S.history.commit(next);
  }
}

function toast(text) {
  S.toast = { text, until: performance.now() + 2200 };
}

function seek(t) {
  S.t = Math.max(0, Math.min(DUR, t));
  S.playing = false;
}

/* ---- the export, faked: frames at a pace the check sets ---- */

const exportPace = { framesPerTick: 25 };
let job = null;

function tickExport(now) {
  if (!job) {
    return;
  }
  job.done = Math.min(job.total, job.done + exportPace.framesPerTick);
  const elapsed = (now - job.started) / 1000;
  S.exporting = { done: job.done, total: job.total, etaS: job.done ? (elapsed / job.done) * (job.total - job.done) : NaN, realtime: job.realtime };
  if (job.done >= job.total) {
    const j = job;
    job = null;
    S.exporting = null;
    j.resolve({ name: `fdfpv-test-${j.opts.size}p${j.opts.fps}.${j.opts.format}`, bytes: new Blob([new Uint8Array(1024)], { type: 'video/mp4' }) });
  }
}

const params0 = new URLSearchParams(location.search);
const webcodecs = params0.get('realtime') !== '1';

function record(name) {
  return (...args) => {
    calls.push({ name, args });
    return api[`_${name}`](...args);
  };
}

const api = {
  speeds: SPEEDS,
  rigs: RIGS,
  view() {
    const e = edit();
    return {
      t: S.t,
      drawn: S.t,
      dur: DUR,
      playing: S.playing,
      markers: MARKERS,
      parts: [{ part: 3, label: 'left wing', t: 12.4 }],
      peers: [],
      osd: S.osd,
      bare: S.bare,
      letterbox: e.look.letterbox,
      live: true,
      canTakeOver: true,
      exporting: S.exporting,
      readout,
      toast: S.toast,
      name: 'Skyhunter at 14:02',
      edit: e,
      shot: shotAt(e, S.t),
      movie: { t: movieTime(e, S.t), dur: movieDuration(e) },
      canUndo: S.history.canUndo,
      canRedo: S.history.canRedo,
      saved: false,
      pad: padConnected(),
    };
  },
  togglePlay() {
    S.playing = !S.playing;
  },
  seek,
  step: (d) => seek(S.t + d / 60),
  seekBy: (d) => seek(S.t + d),
  jumpTo: (t) => seek(t),
  prevMarker() {
    const m = [...MARKERS].reverse().find((x) => x.t - 0.5 < S.t - 0.05);
    if (m) {
      seek(m.t - 0.5);
    }
  },
  nextMarker() {
    const m = MARKERS.find((x) => x.t - 0.5 > S.t + 0.05);
    if (m) {
      seek(m.t - 0.5);
    }
  },
  setSpeed(s) {
    const i = shotNow();
    const cur = edit().shots[i].speed;
    const next = s === 1 || s === -1
      ? SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, SPEEDS.indexOf(cur) + s))]
      : s;
    apply(setShot(edit(), i, { speed: next }));
  },
  setRig(rig) {
    const i = shotNow();
    const cam = edit().shots[i].cam;
    apply(setShot(edit(), i, { cam: camOf(rig, rig === 'follow' ? 3 : cam.target) }));
  },
  follow: (part) => apply(setShot(edit(), shotNow(), { cam: camOf('follow', part) })),
  watch() {},
  nextPart() {},
  nextWatch() {},
  cut: record('cut'),
  _cut() {
    apply(cut(edit(), S.t));
  },
  removeCut: record('removeCut'),
  _removeCut(i) {
    apply(removeCut(edit(), i === undefined ? nearestCut(edit(), S.t) : i));
  },
  moveCut: (i, t) => apply(moveCut(edit(), i, t)),
  setEdge: (which, t) => apply(which === 'in' ? setIn(edit(), t) : setOut(edit(), t, DUR)),
  setIn: () => apply(setIn(edit(), S.t)),
  setOut: () => apply(setOut(edit(), S.t, DUR)),
  begin: record('begin'),
  _begin() {
    S.history.begin();
  },
  end: record('end'),
  _end() {
    S.history.end();
  },
  setEnter: (i, enter) => apply(setShot(edit(), i, { enter: { ...enter } })),
  cycleEnter() {
    const i = shotNow();
    if (i < 1) {
      return;
    }
    const order = ['cut', 'blend', 'glide'];
    const type = order[(order.indexOf(edit().shots[i].enter.type) + 1) % order.length];
    apply(setShot(edit(), i, { enter: type === 'blend' ? { type, d: 0.5 } : { type } }));
  },
  undo: () => S.history.undo(),
  redo: () => S.history.redo(),
  jumpCut(dir) {
    const ts = edit().shots.slice(1).map((s) => s.t0);
    const next = dir > 0 ? ts.find((t) => t > S.t + 1e-9) : [...ts].reverse().find((t) => t < S.t - 1e-9);
    if (next !== undefined) {
      seek(next);
    }
  },
  toggleOsd() {
    S.osd = !S.osd;
  },
  toggleLetterbox() {
    const e = edit();
    apply({ ...e, look: { letterbox: !e.look.letterbox } });
  },
  toggleBare() {
    S.bare = !S.bare;
  },
  photo: () => toast(str('replay.photo_saved')),
  saveReplay: () => toast(str('replay.saved')),
  takeOver() {},
  close: record('close'),
  _close() {},
  drag(dx) {
    const i = shotNow();
    const cam = edit().shots[i].cam;
    if (cam.rig === 'orbit') {
      apply(setShot(edit(), i, { cam: { ...cam, p: { ...cam.p, az: cam.p.az + dx * 0.01 } } }));
    }
  },
  wheel() {},
  exportOptions: async () => ({
    webcodecs,
    sizes: [720, 1080],
    fps: [30, 60],
    formats: [{ id: 'mp4', ok: true, why: '' }, { id: 'webm', ok: true, why: '' }],
    sound: { ok: true, why: '' },
  }),
  exportMovie: record('exportMovie'),
  _exportMovie(opts) {
    const total = Math.max(1, Math.round(movieDuration(edit()) * opts.fps));
    return new Promise((resolve) => {
      job = { opts, total, done: 0, started: performance.now(), realtime: !webcodecs, resolve };
      S.exporting = { done: 0, total, etaS: NaN, realtime: !webcodecs };
    });
  },
  cancelExport: record('cancelExport'),
  _cancelExport() {
    if (job) {
      const j = job;
      job = null;
      S.exporting = null;
      j.resolve(null);
    }
  },
  shiftHeld: () => held.has('ShiftLeft') || held.has('ShiftRight'),
  ctrlHeld: () => held.has('ControlLeft') || held.has('ControlRight'),
  listClips: async () => [],
  playSaved: async () => {},
  renameSaved: async () => {},
  deleteSaved: async () => {},
  exportSaved: async () => {},
  importFile: async () => '',
  mapName: (id) => id,
};

/* The screen's download goes through an anchor with a download name. */
const realClick = HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click = function click() {
  if (this.download) {
    downloads.push({ name: this.download });
    return;
  }
  realClick.call(this);
};

/* ---- the pad, as crashcam.js hands it over: button edges ---- */

let padPrev = 0;
function standardPad() {
  for (const gp of navigator.getGamepads ? navigator.getGamepads() : []) {
    if (gp && gp.connected && gp.mapping === 'standard') {
      return gp;
    }
  }
  return null;
}
function padConnected() {
  return Boolean(standardPad());
}
function padEdges() {
  const gp = standardPad();
  let now = 0;
  if (gp) {
    gp.buttons.forEach((b, i) => {
      if (b && b.pressed && i < 31) {
        now |= 1 << i;
      }
    });
  }
  const edges = now & ~padPrev;
  padPrev = now;
  return edges;
}

/* ---- a picture to put the screen over ---- */

const canvas = document.getElementById('scene');
const g = canvas.getContext('2d');
function drawScene(v) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#6f9fc6');
  sky.addColorStop(0.55, '#c9dbe3');
  sky.addColorStop(0.56, '#6f8a4f');
  sky.addColorStop(1, '#3a4a2b');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  const rig = v.edit.shots[v.shot].cam.rig;
  const x = w * (0.3 + 0.4 * (v.t / DUR));
  g.save();
  g.translate(x, h * 0.42);
  g.rotate(-0.12 + 0.02 * RIGS.indexOf(rig));
  g.fillStyle = '#f0f0ea';
  g.fillRect(-90, -6, 180, 12);
  g.fillRect(-14, -30, 28, 60);
  g.fillStyle = '#e0503c';
  g.fillRect(-90, -6, 22, 12);
  g.restore();
}

/* ---- run ---- */

await useLocale(params0.get('lang') || 'en');
const { createEditor } = await import('../../src/replay/editor.js');
const editor = createEditor(api);
editor.open('Skyhunter at 14:02');

window.addEventListener('keydown', (ev) => {
  held.add(ev.code);
  if (editor.onKey(ev.code, ev.repeat)) {
    ev.preventDefault();
  }
});
window.addEventListener('keyup', (ev) => held.delete(ev.code));
window.addEventListener('blur', () => held.clear());

let lastNow = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - lastNow) / 1000);
  lastNow = now;
  if (S.playing) {
    const e = edit();
    S.t += dt * e.shots[shotAt(e, S.t)].speed;
    if (S.t >= e.out) {
      S.t = e.out;
      S.playing = false;
    }
  }
  tickExport(now);
  editor.onPad(padEdges());
  const v = api.view();
  drawScene(v);
  editor.tick(v);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__ui = { api, calls, downloads, exportPace, editor, ready: true };
