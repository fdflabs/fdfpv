/*
 * render-golden/music.js: src/render/music.js driven through a scripted
 * session against a fake media element and a fake audio context, with what
 * can be observed from outside written down after every step: the element
 * (source, preload, loop, volume, position, plays and pauses), the warming
 * element, every gain's value and scheduled automation, the statuses it
 * announces and status() itself. Random picks are seeded.
 *
 * The session crosses every path: attach before and after enabling, a
 * WebM browser and an mp3 one, swaps between the crates while playing,
 * while muted and before attach, a swap cancelled halfway, resumes inside
 * and past the outro, skips both ways, pinned and rotating flight tracks,
 * ended records, format and network errors until the crate gives up, play
 * promises that reject or never come, pauses under the bed, ducks with and
 * without cancelAndHoldAtTime, and the warm in both contexts, with and
 * without Save-Data.
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

import { Music } from '../../../src/render/music.js';

const path = (u) => {
  if (!u) {
    return u ?? null;
  }
  const url = new URL(u, location.href);
  return url.pathname + url.search;
};
const r6 = (v) => (typeof v === 'number' ? Number(v.toFixed(6)) : v);

class FakeParam {
  constructor(v, hold) {
    this.value = v;
    this.events = [];
    if (hold) {
      this.cancelAndHoldAtTime = (t) => this.events.push(['hold', r6(t)]);
    }
  }

  cancelScheduledValues(t) {
    this.events.push(['cancel', r6(t)]);
  }

  setValueAtTime(v, t) {
    this.events.push(['set', r6(v), r6(t)]);
  }

  linearRampToValueAtTime(v, t) {
    this.events.push(['ramp', r6(v), r6(t)]);
  }
}

class FakeNode {
  constructor(param) {
    this.gain = param;
    this.links = [];
  }

  connect(n) {
    this.links.push(n.label || 'dest');
  }
}

function fakeContext({ hold = true, mediaSource = true } = {}) {
  const ctx = { currentTime: 0, made: [] };
  ctx.createGain = () => {
    const n = new FakeNode(new FakeParam(1, hold));
    n.label = `gain${ctx.made.length}`;
    ctx.made.push(n);
    return n;
  };
  if (mediaSource) {
    ctx.createMediaElementSource = (el) => {
      const n = new FakeNode(null);
      n.label = 'source';
      n.el = el;
      ctx.made.push(n);
      return n;
    };
  }
  return ctx;
}

/* What a media element does about the things music.js touches. */
class FakeAudio {
  constructor() {
    FakeAudio.made.push(this);
    this.n = FakeAudio.made.length - 1;
    this._src = null;
    this.srcSets = 0;
    this.preload = 'auto';
    this.loop = false;
    this.muted = false;
    this.volume = 1;
    this.playsInline = false;
    this.attrs = {};
    this.listeners = {};
    this._time = 0;
    this.seeks = [];
    this.duration = NaN;
    this.paused = true;
    this.readyState = 0;
    this.ranges = [];
    this.error = null;
    this.plays = 0;
    this.pauses = 0;
    this.loads = 0;
    this.playMode = 'resolve';
    this.seekThrows = false;
  }

  get src() {
    return this._src ?? '';
  }

  set src(v) {
    this._src = v;
    this.srcSets += 1;
  }

  get currentTime() {
    return this._time;
  }

  set currentTime(v) {
    if (this.seekThrows) {
      throw new Error('not seekable');
    }
    this.seeks.push(r6(v));
    this._time = v;
  }

  get buffered() {
    return { length: this.ranges.length, end: (i) => this.ranges[i] };
  }

  canPlayType(type) {
    return FakeAudio.answer(type);
  }

  setAttribute(k, v) {
    this.attrs[k] = v;
  }

  removeAttribute(k) {
    if (k === 'src') {
      this._src = null;
    }
    delete this.attrs[k];
  }

  load() {
    this.loads += 1;
  }

  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }

  fire(type) {
    for (const fn of this.listeners[type] || []) {
      fn();
    }
  }

  play() {
    this.plays += 1;
    if (this.playMode === 'none') {
      this.paused = false;
      return undefined;
    }
    if (this.playMode === 'hang') {
      return new Promise(() => {});
    }
    if (this.playMode === 'reject') {
      return Promise.reject(new Error('NotAllowedError'));
    }
    this.paused = false;
    return Promise.resolve();
  }

  pause() {
    this.pauses += 1;
    this.paused = true;
  }

  state() {
    return {
      n: this.n,
      src: path(this._src),
      srcSets: this.srcSets,
      preload: this.preload,
      loop: this.loop,
      muted: this.muted,
      volume: r6(this.volume),
      inline: [this.playsInline, this.attrs.playsinline ?? null],
      t: r6(this._time),
      seeks: this.seeks.slice(),
      paused: this.paused,
      plays: this.plays,
      pauses: this.pauses,
      loads: this.loads,
      events: Object.keys(this.listeners).sort(),
    };
  }
}
FakeAudio.made = [];
FakeAudio.answer = () => 'probably';

function seededRandom() {
  let s = 0x9e3779b9;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/* Runs a session with window.Audio, Math.random and navigator.connection
 * replaced, recording a snapshot after every step. */
async function session(steps, { answer = () => 'probably', hold = true, mediaSource = true, saveData = false } = {}) {
  const realAudio = window.Audio;
  const realRandom = Math.random;
  const realConn = Object.getOwnPropertyDescriptor(Navigator.prototype, 'connection');
  FakeAudio.made = [];
  FakeAudio.answer = answer;
  window.Audio = FakeAudio;
  Math.random = seededRandom();
  Object.defineProperty(Navigator.prototype, 'connection', { configurable: true, get: () => ({ saveData }) });
  const log = [];
  try {
    const m = new Music();
    const ctx = fakeContext({ hold, mediaSource });
    const kept = [];
    const announced = [];
    m.onChange = (s) => announced.push(s);
    const world = { m, ctx, kept, el: () => m.el, warm: () => FakeAudio.made.find((a) => a !== m.el && a.preload === 'auto' && a.muted) };
    for (const [label, act] of steps) {
      await act(world);
      await Promise.resolve();
      await Promise.resolve();
      log.push({
        step: label,
        status: m.status(),
        announced: announced.splice(0),
        gains: ctx.made.filter((n) => n.gain).map((n) => ({ label: n.label, v: r6(n.gain.value), ev: n.gain.events.splice(0), to: n.links })),
        source: ctx.made.filter((n) => !n.gain).map((n) => n.links),
        kept: kept.length,
        elements: FakeAudio.made.map((a) => (a === m.el ? 'bed' : 'other')),
        bed: m.el ? m.el.state() : null,
        others: FakeAudio.made.filter((a) => a !== m.el).map((a) => a.state()),
      });
    }
  } finally {
    window.Audio = realAudio;
    Math.random = realRandom;
    if (realConn) {
      Object.defineProperty(Navigator.prototype, 'connection', realConn);
    } else {
      delete Navigator.prototype.connection;
    }
  }
  return log;
}

const at = (t) => (w) => { w.ctx.currentTime = t; };
const tick = (t) => (w) => { w.ctx.currentTime = t; w.m.tick(t); };
const attach = (w) => w.m.attach(w.ctx, { label: 'dest' }, (n) => { w.kept.push(n.label); return n; });
const meta = (dur, ready = 4) => (w) => { w.el().duration = dur; w.el().readyState = ready; w.el().fire('loadedmetadata'); };
const playing = (w) => w.el().fire('playing');
const playhead = (t, bufferedTo) => (w) => { w.el()._time = t; w.el().ranges = bufferedTo === undefined ? [] : [bufferedTo]; };

/* The main session: menus, a flight, back, a pinned track, the warm. */
const MAIN = [
  ['new', () => {}],
  ['level before attach', (w) => w.m.setLevel(0.8)],
  ['track before attach', (w) => w.m.setTrack('prop-wash')],
  ['enable before attach', (w) => w.m.setEnabled(true)],
  ['attach', attach],
  ['playing', playing],
  ['meta', meta(180)],
  ['tick 0.1', tick(0.1)],
  ['level 1.5', (w) => w.m.setLevel(1.5)],
  ['level -1', (w) => w.m.setLevel(-1)],
  ['level 0.6', (w) => w.m.setLevel(0.6)],
  ['menu ahead 5', playhead(10, 15)],
  ['tick warm none', tick(1)],
  ['menu ahead 30', playhead(12, 42)],
  ['tick warm flight', tick(2)],
  ['tick warm again', tick(2.5)],
  ['saveData off still', tick(3)],
  ['to flight', (w) => { w.ctx.currentTime = 4; w.m.setContext('flight'); }],
  ['to flight again', (w) => w.m.setContext('flight')],
  ['tick mid fade', tick(4.1)],
  ['tick after fade', tick(4.3)],
  ['playing flight', playing],
  ['meta flight', meta(200)],
  ['flight near end not buffered', playhead(180, 190)],
  ['tick', tick(5)],
  ['flight near end buffered', playhead(181, 199.8)],
  ['tick warm next', tick(6)],
  ['skip forward', (w) => w.m.skip(1)],
  ['skip back', (w) => w.m.skip(-1)],
  ['skip back again', (w) => w.m.skip(-3)],
  ['pin rotation', (w) => w.m.setTrack('rotation')],
  ['pin bogus', (w) => w.m.setTrack('no-such-track')],
  ['pin neon-horizon', (w) => w.m.setTrack('neon-horizon')],
  ['pin same', (w) => w.m.setTrack('neon-horizon')],
  ['ended pinned', (w) => w.el().fire('ended')],
  ['skip while pinned', (w) => w.m.skip(1)],
  ['rotation', (w) => w.m.setTrack('rotation')],
  ['ended rotation', (w) => w.el().fire('ended')],
  ['duck', (w) => w.m.duckNow(7, 0.4, 1.5)],
  ['duck deeper source', (w) => { w.m.duck.gain.value = 0.2; w.m.duckNow(7.5, 0.4, 1); }],
  ['to menu', (w) => { w.ctx.currentTime = 8; w.el()._time = 33; w.m.setContext('menu'); }],
  ['back to flight mid fade', (w) => { w.ctx.currentTime = 8.1; w.m.setContext('flight'); }],
  ['tick lands', tick(8.4)],
  ['to menu 2', (w) => { w.ctx.currentTime = 9; w.m.setContext('menu'); }],
  ['tick lands 2', tick(9.3)],
  ['menu meta resume', meta(150)],
  ['menu near end', playhead(130, 140)],
  ['tick warm next menu', tick(10)],
  ['back to flight', (w) => { w.ctx.currentTime = 11; w.m.setContext('flight'); }],
  ['tick swap', tick(11.3)],
  ['flight meta resume', meta(200)],
  ['pause', (w) => w.m.pause()],
  ['tick paused', tick(12)],
  ['resume', (w) => w.m.resume()],
  ['element paused under us', (w) => { w.el().paused = true; w.el().readyState = 1; }],
  ['tick not ready', tick(13)],
  ['ready', (w) => { w.el().readyState = 2; }],
  ['tick resumes', tick(13.5)],
  ['playing while unwanted', (w) => { w.m.pause(); w.el().fire('playing'); }],
  ['disable', (w) => w.m.setEnabled(false)],
  ['context while off', (w) => w.m.setContext('menu')],
  ['tick off', tick(14)],
  ['enable', (w) => w.m.setEnabled(true)],
  ['tick on', tick(14.5)],
];

/* Errors: the WebM demotion once, then a crate that will not load. */
const ERRORS = [
  ['attach', attach],
  ['enable', (w) => w.m.setEnabled(true)],
  ['decode error', (w) => { w.el().error = { code: 4 }; w.el().fire('error'); }],
  ['decode error again', (w) => { w.el().error = { code: 3 }; w.el().fire('error'); }],
  ['network error', (w) => { w.el().error = { code: 2 }; w.el().fire('error'); }],
  ['no error object', (w) => { w.el().error = null; w.el().fire('error'); }],
  ['playing resets', playing],
  ['network error after', (w) => { w.el().error = { code: 2 }; w.el().fire('error'); }],
  ['to flight muted swap', (w) => { w.m.setContext('flight'); }],
  ['tick', tick(1)],
  ['play rejects', (w) => { w.el().playMode = 'reject'; w.m.skip(1); }],
  ['tick pending cleared', tick(2)],
  ['play hangs', (w) => { w.el().playMode = 'hang'; w.m.skip(1); }],
  ['tick while pending', tick(3)],
  ['play returns nothing', (w) => { w.el().playMode = 'none'; w.m.skip(1); }],
  ['seek throws', (w) => { w.el().seekThrows = true; w.el()._time = 50; w.m.setContext('menu'); }],
  ['tick swap', tick(4)],
  ['back', (w) => w.m.setContext('flight')],
  ['tick back', tick(5)],
  ['meta seek throws', meta(300)],
  ['meta infinite', (w) => { w.m.seekTo = 40; meta(Infinity)(w); }],
  ['meta inside outro', (w) => { w.m.seekTo = 290; meta(300)(w); }],
];

const LEAN = [
  ['context before attach', (w) => w.m.setContext('flight')],
  ['skip before attach', (w) => w.m.skip(1)],
  ['tick before attach', tick(1)],
  ['duck before attach', (w) => w.m.duckNow(1, 0.5, 1)],
  ['attach without media source', attach],
  ['enable', (w) => w.m.setEnabled(true)],
  ['level', (w) => w.m.setLevel(0.3)],
  ['duck', (w) => w.m.duckNow(2, 0.5, 1)],
  ['context', (w) => w.m.setContext('menu')],
  ['tick', tick(3)],
];

export function cases() {
  return {
    main: () => session(MAIN),
    mainMp3SaveData: () => session(MAIN, { answer: () => '', saveData: true }),
    mainNoHold: () => session(MAIN.slice(0, 45), { hold: false }),
    errors: () => session(ERRORS),
    errorsMp3: () => session(ERRORS.slice(0, 8), { answer: () => '' }),
    lean: () => session(LEAN, { mediaSource: false }),
    askedFor: () => {
      const asked = [];
      const real = window.Audio;
      window.Audio = class extends FakeAudio {
        canPlayType(type) {
          asked.push(type);
          return 'maybe';
        }
      };
      try {
        const m = new Music();
        m.attach(fakeContext(), {}, (n) => n);
        /* Which records the unseeded picks land on is not the question. */
        return { asked, ext: m.ext };
      } finally {
        window.Audio = real;
      }
    },
  };
}
