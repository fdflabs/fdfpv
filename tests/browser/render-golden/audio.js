/*
 * render-golden/audio.js: src/render/audio.js (MotorAudio and its exports)
 * driven through scripted sessions against a fake audio context, with what
 * can be observed from outside written down after every step: every node
 * the mix made (its kind, settings, connections, starts), every param's
 * value and the automation scheduled on it, what was posted to a worklet
 * port, the context's resume and suspend calls, the calls the mix made
 * into the bed, the war radio and the replay's beds, what it logged, and
 * the instance's public fields.
 *
 * Automation is kept per param, in the order it was scheduled on that
 * param, because that is what Web Audio plays; the order in which two
 * different params were touched within one call is not audible and is not
 * pinned. The noise buffer, the soft clip's curve and the scrape gate's
 * wave are pinned by content, because the offline renders (audio:flights,
 * audio:world) hear them.
 *
 * The bed (src/render/music.js), the radio (warradio.js) and the replay's
 * beds (replaybeds.js) run for real: only the calls the mix makes into
 * them are logged, never their own fields, so a rewrite of one of them
 * that keeps its own goldens leaves these alone.
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

import {
  MotorAudio, VOICES, ENGINE_MODELS, PEER_VOICES, engineModelFor, engineModelForCraft,
} from '../../../src/render/audio.js';
import { Music } from '../../../src/render/music.js';
import { FLIGHT, MENU } from '../../fixtures/music-crates.js';
import { WarRadio } from '../../../src/render/warradio.js';
import { ReplayBeds } from '../../../src/render/replaybeds.js';

/* FNV-1a over the float bits: a content pin that fits in a line. */
function hashF32(a) {
  if (!a) {
    return null;
  }
  const u = new Uint32Array(a.buffer, a.byteOffset, a.length);
  let h = 0x811c9dc5;
  for (let i = 0; i < u.length; i += 1) {
    h = Math.imul(h ^ u[i], 0x01000193) >>> 0;
  }
  return `${a.length}:${h.toString(16)}:${Array.from(a.slice(0, 3)).join(',')}`;
}

let stage = null;

class FakeParam {
  constructor(owner, name, v, hold) {
    this.label = `${owner.id}.${name}`;
    this.value = v;
    this.ev = [];
    if (hold) {
      this.cancelAndHoldAtTime = (t) => this.ev.push(['hold', t]);
    }
  }

  cancelScheduledValues(t) {
    this.ev.push(['cancel', t]);
  }

  setValueAtTime(v, t) {
    this.ev.push(['set', v, t]);
  }

  linearRampToValueAtTime(v, t) {
    this.ev.push(['lin', v, t]);
  }

  exponentialRampToValueAtTime(v, t) {
    this.ev.push(['exp', v, t]);
  }

  setTargetAtTime(v, t, tau) {
    this.ev.push(['target', v, t, tau]);
  }
}

const PARAMS = {
  gain: { gain: 1 },
  biquad: { frequency: 350, Q: 1, gain: 0, detune: 0 },
  osc: { frequency: 440, detune: 0 },
  comp: { threshold: -24, knee: 30, ratio: 12, attack: 0.003, release: 0.25 },
};

class FakeNode {
  constructor(ctx, kind, extra = {}) {
    this.id = `${kind}${ctx.made.length}`;
    this.kind = kind;
    ctx.made.push(this);
    this.links = [];
    this.starts = 0;
    this.disconnects = 0;
    this.params = [];
    for (const [k, v] of Object.entries(PARAMS[kind] || {})) {
      this[k] = new FakeParam(this, k, v, ctx.hold);
      this.params.push(k);
    }
    Object.assign(this, extra);
  }

  connect(dest, out = 0, inp = 0) {
    this.links.push([dest.label || dest.id, out, inp]);
    return dest;
  }

  disconnect() {
    this.disconnects += 1;
    this.links = [];
  }

  start() {
    this.starts += 1;
  }

  setPeriodicWave(w) {
    this.wave = w;
  }

  state() {
    const s = { links: this.links.slice(), starts: this.starts };
    if (this.disconnects) {
      s.disconnects = this.disconnects;
    }
    for (const k of ['type', 'oversample', 'loop', 'inputs', 'el']) {
      if (this[k] !== undefined) {
        s[k] = this[k];
      }
    }
    if (this.kind === 'shaper') {
      s.curve = hashF32(this.curve);
    }
    if (this.kind === 'source') {
      s.buffer = this.buffer ? [this.buffer.id, this.buffer.channels.length, this.buffer.sampleRate, hashF32(this.buffer.channels[0])] : null;
    }
    if (this.wave) {
      s.wave = this.wave;
    }
    if (this.worklet) {
      s.worklet = this.worklet;
      s.portStarts = this.portStarts;
      s.listeners = this.listenerKinds();
    }
    s.p = Object.fromEntries(this.params.map((k) => [k, this[k].value]));
    return s;
  }
}

const WORKLET_PARAMS = ['rpm0', 'rpm1', 'rpm2', 'rpm3', 'u', 'v', 'w', 'amps', 'servo', 'retract', 'dist', 'dist2', 'pan',
  'hardness', 'impactSpeed', 'impact', 'mech', 'strike', 'level'];

/* The global AudioWorkletNode while a session runs: made on the context
 * it is handed, so it is numbered with that context's other nodes. */
class FakeWorkletNode extends FakeNode {
  constructor(ctx, name, opts) {
    super(ctx, 'worklet');
    this.worklet = { name, opts: JSON.parse(JSON.stringify(opts)) };
    this.parameters = new Map();
    for (const k of WORKLET_PARAMS) {
      const p = new FakeParam(this, k, 0, ctx.hold);
      this.parameters.set(k, p);
      this[k] = p;
      this.params.push(k);
    }
    this.on = {};
    this.portOn = {};
    this.portStarts = 0;
    this.posts = [];
    this.port = {
      postMessage: (m) => this.posts.push(JSON.parse(JSON.stringify(m))),
      addEventListener: (type, fn) => (this.portOn[type] ||= []).push(fn),
      start: () => {
        this.portStarts += 1;
      },
    };
  }

  addEventListener(type, fn) {
    (this.on[type] ||= []).push(fn);
  }

  listenerKinds() {
    return [Object.keys(this.on).sort(), Object.keys(this.portOn).sort()];
  }

  fire(type, e) {
    for (const fn of this.on[type] || []) {
      fn(e);
    }
  }

  message(data) {
    for (const fn of this.portOn.message || []) {
      fn({ data });
    }
  }
}

/* The context's surface MotorAudio, Music and WarRadio touch. `offline`
 * makes it an OfflineAudioContext as instanceof sees it. */
function makeCtx({
  hold = true, sampleRate = 48000, offline = false, fail = false, noEvents = false,
} = {}) {
  const ctx = offline ? Object.create(OfflineAudioContext.prototype) : {};
  const own = {
    made: [],
    hold,
    refuse: false,
    calls: [],
    listeners: {},
    waves: 0,
    buffers: 0,
    currentTime: 0,
    sampleRate,
    state: 'running',
    destination: { id: 'destination' },
    audioWorklet: {
      addModule: (url) => {
        ctx.calls.push(['addModule', new URL(url).pathname]);
        return fail ? Promise.reject(new Error('no such module')) : Promise.resolve();
      },
    },
    createGain: () => new FakeNode(ctx, 'gain'),
    createBiquadFilter: () => new FakeNode(ctx, 'biquad', { type: 'lowpass' }),
    createDynamicsCompressor: () => new FakeNode(ctx, 'comp'),
    createWaveShaper: () => new FakeNode(ctx, 'shaper', { curve: null, oversample: 'none' }),
    createBufferSource: () => new FakeNode(ctx, 'source', { buffer: null, loop: false }),
    createOscillator: () => new FakeNode(ctx, 'osc', { type: 'sine' }),
    createChannelMerger: (n) => new FakeNode(ctx, 'merger', { inputs: n }),
    createMediaElementSource: (el) => new FakeNode(ctx, 'media', { el: el.n }),
    createBuffer: (channels, length, rate) => {
      ctx.buffers += 1;
      const b = { id: `buffer${ctx.buffers}`, sampleRate: rate, channels: [] };
      for (let i = 0; i < channels; i += 1) {
        b.channels.push(new Float32Array(length));
      }
      b.getChannelData = (i) => b.channels[i];
      return b;
    },
    createPeriodicWave: (real, imag, opts) => {
      ctx.waves += 1;
      return { id: `wave${ctx.waves}`, real: Array.from(real), imag: Array.from(imag), opts: opts ? { ...opts } : null };
    },
    resume: () => {
      ctx.calls.push(['resume']);
      if (ctx.refuse) {
        return Promise.reject(new Error('device gone'));
      }
      ctx.state = 'running';
      return Promise.resolve();
    },
    suspend: () => {
      ctx.calls.push(['suspend']);
      if (ctx.refuse) {
        return Promise.reject(new Error('device gone'));
      }
      ctx.state = 'suspended';
      return Promise.resolve();
    },
  };
  if (!offline && !noEvents) {
    own.addEventListener = (type, fn) => (ctx.listeners[type] ||= []).push(fn);
  }
  for (const [k, v] of Object.entries(own)) {
    Object.defineProperty(ctx, k, { value: v, writable: true, configurable: true, enumerable: true });
  }
  ctx.fire = (type) => {
    for (const fn of ctx.listeners[type] || []) {
      fn();
    }
  };
  return ctx;
}

/* Enough of a media element for the bed and the radio to run on. */
class FakeAudio {
  constructor() {
    FakeAudio.count += 1;
    this.n = FakeAudio.count;
    this.src = '';
    this.preload = 'auto';
    this.loop = false;
    this.muted = false;
    this.volume = 1;
    this.playsInline = false;
    this.currentTime = 0;
    this.duration = NaN;
    this.paused = true;
    this.readyState = 0;
    this.error = null;
    this.buffered = { length: 0, end: () => 0 };
  }

  canPlayType() {
    return 'probably';
  }

  setAttribute() {}

  removeAttribute() {}

  load() {}

  addEventListener() {}

  removeEventListener() {}

  play() {
    this.paused = false;
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
  }
}
FakeAudio.count = 0;

function seededRandom() {
  let s = 0x2545f491;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/* What a value looks like in a log line: nodes and params by label. */
function show(v) {
  if (v === null || v === undefined || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') {
    return v ?? null;
  }
  if (typeof v === 'function') {
    return 'fn';
  }
  if (v.label || v.id) {
    return v.label || v.id;
  }
  if (v.made) {
    return 'ctx';
  }
  if (Array.isArray(v)) {
    return v.map(show);
  }
  return JSON.parse(JSON.stringify(v));
}

/*
 * Calls the mix makes into its collaborators. Only a call whose caller is
 * src/render/audio.js is logged, so the collaborators' calls to
 * themselves (which their own rewrites may change) stay out of it.
 */
function spyOn(classes, log) {
  const undo = [];
  for (const [name, C] of classes) {
    for (const k of Object.getOwnPropertyNames(C.prototype)) {
      const d = Object.getOwnPropertyDescriptor(C.prototype, k);
      if (k === 'constructor' || typeof d.value !== 'function') {
        continue;
      }
      const real = d.value;
      C.prototype[k] = function spied(...args) {
        const caller = (new Error().stack || '').split('\n')[2] || '';
        if (caller.includes('/src/render/audio.js')) {
          log.push([`${name}.${k}`, ...args.map(show)]);
        }
        return real.apply(this, args);
      };
      undo.push(() => {
        C.prototype[k] = real;
      });
    }
  }
  return () => undo.forEach((f) => f());
}

const voiceName = (v) => Object.keys(VOICES).find((k) => VOICES[k] === v) || null;
const ids = (list) => (list ? list.map((n) => (n ? n.id || 'node' : null)) : null);

/* The instance as the shell, the checks and the replay read it. */
function publicState(a) {
  const peerSlots = a.peerSlots
    ? a.peerSlots.map((s) => ({ node: s.node.id, id: s.id, score: s.score, freeAt: s.freeAt, linked: s.linked, model: s.model }))
    : null;
  return {
    hasCtx: Boolean(a.ctx),
    enabled: a.enabled,
    level: a.level,
    mix: { ...a.mix },
    focusOn: a.focusOn,
    voice: voiceName(a.voice),
    engineModel: a.engineModel,
    engineParams: a.engineParams,
    bladeScale: a.bladeScale,
    vary: a.vary,
    warBed: a.warBed,
    replaying: a.replaying,
    musicWanted: a.musicWanted,
    hasWarRadio: Boolean(a.warRadio),
    warRadioReady: a.warRadio ? a.warRadio.ready : null,
    hasReplayRadio: Boolean(a.replayRadio),
    replayOpen: a.replayRadio ? a.replayRadio.open : null,
    replayLiveTrack: a.replayRadio ? a.replayRadio.liveTrack : null,
    nodes: ids(a.nodes),
    nodeCount: a.nodeCount(),
    engine: a.engine ? a.engine.id : null,
    worldNode: a.worldNode ? a.worldNode.id : null,
    engineLinked: a.engineLinked ?? null,
    faults: a.faults.slice(),
    states: a.states.slice(),
    stalls: a.stalls,
    clock: { ...a.clock },
    listener: { ...a.listener },
    peerSlots,
    peerRank: a.peerRank.length,
    schwings: a.schwings ?? null,
    coins: a.coins ?? null,
    booms: a.booms ?? null,
    fields: {
      master: a.master ? a.master.id : null,
      preMaster: a.preMaster ? a.preMaster.id : null,
      inlet: a.inlet ? a.inlet.id : null,
      flightDuck: a.flightDuck ? a.flightDuck.id : null,
      ambienceDuck: a.ambienceDuck ? a.ambienceDuck.id : null,
      buses: ['motorBus', 'windBus', 'otherBus', 'effectsBus', 'voiceBus', 'ambienceBus', 'focusBus'].map((k) => (a[k] ? a[k].id : null)),
      focusOscs: ids(a.focusOscs),
      cue: [a.cueOsc, a.cueGain, a.crashGain, a.crashLp, a.wreckGain, a.wreckBp].map((n) => (n ? n.id : null)),
      schwingVoice: a.schwingVoice
        ? {
          ...Object.fromEntries(['scrapeBp', 'scrapeEnv', 'whooshBp', 'whooshEnv', 'shingBp', 'shingEnv', 'ringEnv'].map((k) => [k, a.schwingVoice[k].id])),
          partials: a.schwingVoice.partials.map((p) => ({ g: p.g.id, oscs: p.oscs.map((o) => [o.o.id, o.mult]), amp: p.amp, rate: p.rate })),
        }
        : null,
      coinVoice: a.coinVoice ? { osc: a.coinVoice.osc.id, env: a.coinVoice.env.id } : null,
    },
  };
}

/*
 * One session: globals replaced (AudioContext, AudioWorkletNode, Audio,
 * Math.random, performance.now, console.error and warn), the steps run in
 * order, and after each one what changed is written down: a node's state
 * whenever it differs from the last snapshot, every param's automation
 * since the last one, posts, context calls, collaborator calls, logs and
 * the public fields that moved.
 */
async function session(steps, opts = {}) {
  const saved = {
    AudioContext: window.AudioContext,
    webkitAudioContext: window.webkitAudioContext,
    AudioWorkletNode: window.AudioWorkletNode,
    Audio: window.Audio,
    random: Math.random,
    error: console.error,
    warn: console.warn,
  };
  const calls = [];
  const logged = [];
  const w = { wall: 0, ctx: null, made: [] };
  const undo = spyOn([['music', Music], ['radio', WarRadio], ['beds', ReplayBeds]], calls);
  FakeAudio.count = 0;
  window.Audio = FakeAudio;
  window.AudioWorkletNode = FakeWorkletNode;
  if (opts.noContext) {
    window.AudioContext = undefined;
    window.webkitAudioContext = opts.webkit ? function Webkit() { return (w.ctx = makeCtx(opts.ctx)); } : undefined;
  } else {
    window.AudioContext = function Live() {
      w.ctx = makeCtx(opts.ctx);
      return w.ctx;
    };
  }
  Math.random = seededRandom();
  Object.defineProperty(performance, 'now', { configurable: true, value: () => w.wall * 1000 });
  const text = (x) => (x instanceof Error ? `Error: ${x.message}` : String(x));
  console.error = (...args) => logged.push(['error', ...args.map(text)]);
  console.warn = (...args) => logged.push(['warn', ...args.map(text)]);
  const log = [];
  const last = {};
  try {
    const a = new MotorAudio();
    /* The real crates are empty (NOTICE); the bed runs on the crates as
     * they were recorded. Made before any step and with no random drawn
     * in between, so the seeded picks are the ones recorded. */
    a.music = new Music({ menu: MENU, flight: FLIGHT });
    w.a = a;
    for (const [label, act] of steps) {
      let ret;
      try {
        ret = show(await act(w));
      } catch (e) {
        ret = { threw: e.message };
      }
      await new Promise((r) => {
        setTimeout(r, 0);
      });
      const entry = { step: label };
      if (ret !== null) {
        entry.ret = ret;
      }
      const ctx = w.ctx;
      if (ctx) {
        const changed = {};
        const ev = {};
        const posts = {};
        for (const n of ctx.made) {
          const s = JSON.stringify(n.state());
          if (last[n.id] !== s) {
            changed[n.id] = JSON.parse(s);
            last[n.id] = s;
          }
          for (const k of n.params) {
            if (n[k].ev.length) {
              ev[n[k].label] = n[k].ev.splice(0);
            }
          }
          if (n.posts && n.posts.length) {
            posts[n.id] = n.posts.splice(0);
          }
        }
        for (const [k, v] of [['nodes', changed], ['ev', ev], ['posts', posts]]) {
          if (Object.keys(v).length) {
            entry[k] = v;
          }
        }
        if (ctx.calls.length) {
          entry.ctx = ctx.calls.splice(0);
        }
        entry.time = ctx.currentTime;
        entry.state = ctx.state;
      }
      if (calls.length) {
        entry.calls = calls.splice(0);
      }
      if (logged.length) {
        entry.logged = logged.splice(0);
      }
      const pub = publicState(a);
      const moved = {};
      for (const [k, v] of Object.entries(pub)) {
        const s = JSON.stringify(v);
        if (last[`a.${k}`] !== s) {
          moved[k] = v;
          last[`a.${k}`] = s;
        }
      }
      if (Object.keys(moved).length) {
        entry.a = moved;
      }
      log.push(entry);
    }
  } finally {
    undo();
    window.AudioContext = saved.AudioContext;
    window.webkitAudioContext = saved.webkitAudioContext;
    window.AudioWorkletNode = saved.AudioWorkletNode;
    window.Audio = saved.Audio;
    Math.random = saved.random;
    console.error = saved.error;
    console.warn = saved.warn;
    delete performance.now;
  }
  return log;
}

const at = (t) => (w) => {
  w.ctx.currentTime = t;
};
const RPM = [9000, 9100, 9200, 9300];
const AIR = { u: 12, v: -1.5, w: 0.25, amps: 31, dist: 3.5, dist2: 9, pan: -0.4, flapsMoving: true, gearMoving: false };
const ready = async (w) => {
  await w.a.ready;
};
const live = [
  ['start', (w) => w.a.start()],
  ['ready', ready],
];

/* Everything callable before there is a context. */
const BEFORE = [
  ['new', () => {}],
  ['jitter', (w) => [w.a.jitter(), w.a.jitter(), w.a.jitter()]],
  ['setEngineModel edf', (w) => w.a.setEngineModel('edf')],
  ['setEngineModel null', (w) => w.a.setEngineModel(null)],
  ['setEngineModel bogus', (w) => w.a.setEngineModel('rotary')],
  ['setEngineParams', (w) => w.a.setEngineParams({ motors: 2, blades: 3, gain: 0.8 })],
  ['setEngineParams null', (w) => w.a.setEngineParams(null)],
  ['setEngineSpec', (w) => w.a.setEngineSpec({ model: 'boxer2', params: { idleRpm: 1800 } })],
  ['setEngineSpec no model', (w) => w.a.setEngineSpec({ params: { gain: 2 } })],
  ['setEngineSpec null', (w) => w.a.setEngineSpec(null)],
  ['setEngineSpec bogus', (w) => w.a.setEngineSpec({ model: 'steam', params: { gain: 3 } })],
  ['engineMessage', (w) => w.a.engineMessage()],
  ['setEngineSpec reset', (w) => w.a.setEngineSpec(null)],
  ['setVoice wing', (w) => w.a.setVoice('wing')],
  ['engineMessage wing', (w) => w.a.engineMessage()],
  ['setVoice bogus', (w) => w.a.setVoice('jet')],
  ['setBladeScale 1.5', (w) => w.a.setBladeScale(1.5)],
  ['setBladeScale 0', (w) => w.a.setBladeScale(0)],
  ['setBladeScale NaN', (w) => w.a.setBladeScale(NaN)],
  ['setBladeScale Infinity', (w) => w.a.setBladeScale(Infinity)],
  ['setBladeScale -2', (w) => w.a.setBladeScale(-2)],
  ['setLevel 1.4', (w) => w.a.setLevel(1.4)],
  ['setLevel -1', (w) => w.a.setLevel(-1)],
  ['setLevel 0.7', (w) => w.a.setLevel(0.7)],
  ['setMix null', (w) => w.a.setMix(null)],
  ['setMix subset', (w) => w.a.setMix({ motors: 0.8, wind: 1.7, other: -0.2 })],
  ['setMix non numbers', (w) => w.a.setMix({ effects: '0.9', voice: null })],
  ['setMix bogus', (w) => w.a.setMix({ ambience: 0.2, drums: 0.5 })],
  ['setMix music', (w) => w.a.setMix({ music: 0.9 })],
  ['setMix music string', (w) => w.a.setMix({ music: 'x' })],
  ['setFocusEnabled', (w) => w.a.setFocusEnabled(1)],
  ['setEnabled true', (w) => w.a.setEnabled(true)],
  ['setEnabled false', (w) => w.a.setEnabled(0)],
  ['setMusicEnabled', (w) => w.a.setMusicEnabled('yes')],
  ['setMusicTrack', (w) => w.a.setMusicTrack('rotation')],
  ['setMusicContext', (w) => w.a.setMusicContext('flight')],
  ['skipMusic', (w) => w.a.skipMusic(1)],
  ['musicStatus', (w) => w.a.musicStatus()],
  ['nodeCount', (w) => w.a.nodeCount()],
  ['event', (w) => w.a.event('gate', 1, 0.5)],
  ['ui', (w) => w.a.ui('select')],
  ['wreck', (w) => w.a.wreck('snap', 1, 1)],
  ['schwing', (w) => w.a.schwing(1, 1)],
  ['coin', (w) => w.a.coin(1, 1)],
  ['boom', (w) => w.a.boom(1, 10, 1)],
  ['impact', (w) => w.a.impact(1, 0.5, 3, 1)],
  ['mechanical gear', (w) => w.a.mechanical('gear', 1)],
  ['mechanical bogus', (w) => w.a.mechanical('flaps', 1)],
  ['propStrike', (w) => w.a.propStrike(0.5, 0.5, 1)],
  ['duckFlight', (w) => w.a.duckFlight(1, 0.5, 1)],
  ['duckAction', (w) => w.a.duckAction(1, 0.5, 1)],
  ['update', (w) => w.a.update(RPM, 3, 1, AIR)],
  ['updatePeers', (w) => w.a.updatePeers([{ id: 'p', rpm: RPM, x: 1, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }], 1)],
  ['setListener', (w) => w.a.setListener(1, 2, 3, 0, 0, 1, 0.5)],
  ['setListener default ground', (w) => w.a.setListener(4, 5, 6, 1, 0, 0)],
  ['replayBeds', (w) => w.a.replayBeds()],
  ['setWarBed before ctx', (w) => w.a.setWarBed('combat', 4)],
  ['war again', (w) => w.a.war() === w.a.warRadio],
  ['attachWorld before attach', (w) => {
    w.pending = { id: 'world', connect() { this.n = (this.n || 0) + 1; }, disconnect() { throw new Error('not before attach'); } };
    return w.a.attachWorld(w.pending);
  }],
  ['attachWorld again before attach', (w) => w.a.attachWorld({ id: 'world2', connect() {}, disconnect() { throw new Error('not before attach'); } })],
  ['toggle starts', (w) => w.a.toggle()],
  ['ready', ready],
  ['war after start', (w) => w.a.war() === w.a.warRadio],
  ['setWarBed after start', (w) => w.a.setWarBed('combat', 4)],
];

/* The live mix: the frame loop, the switches, the context's moods. */
const LIVE = [
  ['new', () => {}],
  ['setFocusEnabled before', (w) => w.a.setFocusEnabled(true)],
  ['setMix before', (w) => w.a.setMix({ motors: 0.6, wind: 0.4, other: 0.9, effects: 0.7, voice: 0.3, ambience: 0.8, focus: 0.5 })],
  ['setVoice glow4 before', (w) => w.a.setVoice('glow4')],
  ['start', (w) => w.a.start()],
  ['enabled at start', (w) => w.a.enabled],
  ['update before ready', (w) => w.a.update(RPM, 4, 0.05, AIR)],
  ['ready', ready],
  ['update', (w) => w.a.update(RPM, 4, 0.1, null)],
  ['update air', (w) => w.a.update(RPM, 4, 0.2, AIR)],
  ['update air again', (w) => w.a.update([8000, 8000, 8000, 8000], 5, 0.25, { ...AIR, dist: 4, flapsMoving: false, gearMoving: true })],
  ['update garbage', (w) => w.a.update([-50, NaN, Infinity, 2000], NaN, 0.3, { u: NaN, v: undefined, w: Infinity, amps: -3, dist: NaN, pan: Infinity })],
  ['update no air after air', (w) => w.a.update(RPM, 6, 0.35)],
  ['update live time', (w) => {
    w.ctx.currentTime = 0.4;
    w.wall = 1;
    return w.a.update(RPM, 6);
  }],
  ['setLevel', (w) => w.a.setLevel(0.9)],
  ['update after level', (w) => w.a.update(RPM, 6, 0.5)],
  ['setMix all', (w) => w.a.setMix({ motors: 1, wind: 0, other: 0.25, effects: 1, voice: 0.75, ambience: 0, focus: 1, music: 0.2 })],
  ['setFocusEnabled off', (w) => w.a.setFocusEnabled(false)],
  ['setFocusEnabled on', (w) => w.a.setFocusEnabled(true)],
  ['setEnabled false', (w) => w.a.setEnabled(false)],
  ['update disabled', (w) => w.a.update(RPM, 6, 0.6, AIR)],
  ['update disabled again', (w) => w.a.update(RPM, 6, 0.7, AIR)],
  ['ui while disabled', (w) => w.a.ui('move')],
  ['toggle on', (w) => w.a.toggle()],
  ['toggle off', (w) => w.a.toggle()],
  ['toggle on again', (w) => w.a.toggle()],
  ['setEnabled true', (w) => w.a.setEnabled(true)],
  ['update enabled', (w) => w.a.update(RPM, 6, 0.8, AIR)],
  ['start running', (w) => w.a.start()],
  ['suspended', (w) => {
    w.ctx.state = 'suspended';
    w.ctx.fire('statechange');
  }],
  ['start suspended', (w) => {
    w.a.enabled = false;
    return w.a.start();
  }],
  ['interrupted', (w) => {
    w.ctx.state = 'interrupted';
    w.wall = 2.5;
    w.ctx.fire('statechange');
  }],
  ['start interrupted', (w) => w.a.start()],
  ['closed', (w) => {
    w.ctx.state = 'closed';
    w.ctx.fire('statechange');
  }],
  ['start closed', (w) => w.a.start()],
  ['start refused', (w) => {
    w.ctx.state = 'suspended';
    w.ctx.refuse = true;
    return w.a.start();
  }],
  ['running', (w) => {
    w.ctx.refuse = false;
    w.ctx.state = 'running';
    w.ctx.fire('statechange');
  }],
  ['statechange 60 times', (w) => {
    for (let i = 0; i < 60; i += 1) {
      w.wall = 3 + i / 100;
      w.ctx.state = i % 2 ? 'running' : 'suspended';
      w.ctx.fire('statechange');
    }
    w.ctx.state = 'running';
  }],
  ['setEngineModel edf', (w) => w.a.setEngineModel('edf')],
  ['setEngineParams', (w) => w.a.setEngineParams({ blades: 5, rpmRef: 30000 })],
  ['setEngineSpec', (w) => w.a.setEngineSpec({ model: 'turbojet', params: null })],
  ['setEngineSpec bogus', (w) => w.a.setEngineSpec({ model: 'steam', params: { gain: 1 } })],
  ['setEngineSpec null', (w) => w.a.setEngineSpec(null)],
  ['setVoice glow2', (w) => w.a.setVoice('glow2')],
  ['setBladeScale', (w) => w.a.setBladeScale(0.75)],
  ['impact', (w) => w.a.impact(2.5, 0.8, 9, 1)],
  ['impact tiny now', (w) => {
    w.ctx.currentTime = 1.2;
    return w.a.impact(0, 0.1, 1);
  }],
  ['mechanical gear', (w) => w.a.mechanical('gear', 1.3)],
  ['mechanical catapult now', (w) => w.a.mechanical('catapult')],
  ['mechanical parachute', (w) => w.a.mechanical('parachute', 1.4)],
  ['mechanical bogus', (w) => w.a.mechanical('flaps', 1.4)],
  ['propStrike', (w) => w.a.propStrike(2, 0.4, 1.5)],
  ['propStrike low now', (w) => w.a.propStrike(-1, 0.9)],
  ['propStrike mid', (w) => w.a.propStrike(0.5, 0.2, 1.6)],
  ['attachWorld', (w) => {
    w.world1 = w.ctx.createGain();
    return w.a.attachWorld(w.world1);
  }],
  ['attachWorld same', (w) => w.a.attachWorld(w.world1)],
  ['attachWorld other', (w) => {
    w.world2 = w.ctx.createGain();
    return w.a.attachWorld(w.world2);
  }],
  ['music passthroughs', (w) => {
    w.a.setMusicTrack('neon-horizon');
    w.a.setMusicContext('menu');
    w.a.skipMusic(-1);
    return typeof w.a.musicStatus();
  }],
  ['setMusicEnabled true', (w) => w.a.setMusicEnabled(true)],
  ['setMix music', (w) => w.a.setMix({ music: 0.65 })],
  ['setMusicEnabled false', (w) => w.a.setMusicEnabled(false)],
  ['update ticks music', (w) => w.a.update(RPM, 6, 1.7, AIR)],
  ['nodeCount', (w) => w.a.nodeCount()],
];

/* The cues: every kind, every level shape, and their ducks. */
const CUES = [
  ...live,
  ['enable', (w) => w.a.setEnabled(true)],
  ['crash', (w) => w.a.event('crash', 1)],
  ['crash level', (w) => w.a.event('crash', 2, 0.3)],
  ['crash level NaN', (w) => w.a.event('crash', 3, NaN)],
  ['gate', (w) => w.a.event('gate', 4)],
  ['gate level ignored', (w) => w.a.event('gate', 4.1, 0.2)],
  ['clip', (w) => w.a.event('clip', 5)],
  ['clip level', (w) => w.a.event('clip', 5.1, 0.5)],
  ['clip level negative', (w) => w.a.event('clip', 5.2, -3)],
  ['clip level over', (w) => w.a.event('clip', 5.3, 7)],
  ['land', (w) => w.a.event('land', 6, 0.1)],
  ['takeoff', (w) => w.a.event('takeoff', 7)],
  ['unknown kind', (w) => w.a.event('fanfare', 8)],
  ['gate now', (w) => {
    w.ctx.currentTime = 9;
    return w.a.event('gate');
  }],
  ['gate deeper wins', (w) => {
    w.a.flightDuck.gain.value = 0.2;
    w.a.music.duck.gain.value = 0.1;
    return w.a.event('gate', 9.05);
  }],
  ['ui move', (w) => {
    w.ctx.currentTime = 10;
    return w.a.ui('move');
  }],
  ['ui adjust', (w) => w.a.ui('adjust')],
  ['ui select', (w) => w.a.ui('select')],
  ['ui back', (w) => w.a.ui('back')],
  ['ui unknown', (w) => w.a.ui('shout')],
  ['wreck snap', (w) => w.a.wreck('snap', 0.5, 11)],
  ['wreck snap null level', (w) => w.a.wreck('snap', null, 11.2)],
  ['wreck crunch', (w) => w.a.wreck('crunch', 2, 12)],
  ['wreck chip', (w) => w.a.wreck('chip', -1, 13)],
  ['wreck splash NaN', (w) => w.a.wreck('splash', NaN, 14)],
  ['wreck unknown now', (w) => {
    w.ctx.currentTime = 15;
    return w.a.wreck('fizz', 0.25);
  }],
  ['schwing', (w) => w.a.schwing(1, 16)],
  ['schwing quiet', (w) => w.a.schwing(0.01, 17)],
  ['schwing loud now', (w) => {
    w.ctx.currentTime = 18;
    return w.a.schwing(3);
  }],
  ['schwing default', (w) => w.a.schwing()],
  ['coin', (w) => w.a.coin(1, 19)],
  ['coin quiet', (w) => w.a.coin(0, 20)],
  ['coin half now', (w) => {
    w.ctx.currentTime = 21;
    return w.a.coin(0.5);
  }],
  ['coin default', (w) => w.a.coin()],
  ['boom near', (w) => w.a.boom(1, 0, 22)],
  ['boom mid', (w) => w.a.boom(0.6, 120, 25)],
  ['boom far', (w) => w.a.boom(0.3, 1500, 30)],
  ['boom negative distance', (w) => w.a.boom(2, -50, 35)],
  ['boom default now', (w) => {
    w.ctx.currentTime = 40;
    return w.a.boom();
  }],
  ['duckFlight', (w) => w.a.duckFlight(41, 0.4, 0.8)],
  ['duckAction', (w) => w.a.duckAction(42, 0.3, 1)],
  ['duckAction now', (w) => {
    w.ctx.currentTime = 43;
    w.a.ambienceDuck.gain.value = 0.15;
    return w.a.duckAction(null, 0.5, 2);
  }],
  ['counters', (w) => [w.a.schwings, w.a.coins, w.a.booms]],
];

/* Other pilots: the pool, the ranking, the hand over, the propagation. */
const peer = (id, x, extra = {}) => ({
  id, spec: { model: 'quad', params: null }, rpm: [6000, 6000, 6000, 6000], x, y: 2, z: 0, vx: 3, vy: 0, vz: 4, ...extra,
});
const PEERS = [
  ...live,
  ['setListener', (w) => w.a.setListener(0, 1, 0, 1, 0, 0, 0)],
  ['no peers yet', (w) => w.a.updatePeers([], 0)],
  ['six peers', (w) => w.a.updatePeers([
    peer('a', 10), peer('b', -20), peer('c', 30, { spec: { model: 'wing', params: { gain: 0.5 } } }), peer('d', 40, { spec: null }),
    peer('e', 60), peer('f', 500),
  ], 0.1)],
  ['e closer, not enough', (w) => w.a.updatePeers([peer('a', 10), peer('b', -20), peer('c', 30), peer('d', 40), peer('e', 35)], 0.2)],
  ['e much closer', (w) => w.a.updatePeers([peer('a', 10), peer('b', -20), peer('c', 30), peer('d', 40), peer('e', 5)], 0.3)],
  ['slot still fading', (w) => w.a.updatePeers([peer('a', 10), peer('b', -20), peer('c', 30), peer('d', 40), peer('e', 5)], 0.4)],
  ['slot free', (w) => w.a.updatePeers([peer('a', 10), peer('b', -20), peer('c', 30), peer('d', 40), peer('e', 5)], 0.65)],
  ['b gone, idle g, NaN h', (w) => w.a.updatePeers([
    peer('a', 0.2), peer('c', 30, { rpm: [100, 200, 250, 280] }), peer('e', 5, { rpm: [NaN, -5, 7000, Infinity], vx: NaN }),
    peer('g', 2, { rpm: [0, 0, 0, 0] }), peer('h', NaN),
  ], 0.8)],
  ['no ground', (w) => {
    w.a.setListener(1, 3, 2, 0, 0, -1);
    return w.a.updatePeers([peer('a', 4), peer('c', 30), peer('e', 5), peer('g', 2)], 1.2);
  }],
  ['live time', (w) => {
    w.ctx.currentTime = 1.5;
    return w.a.updatePeers([peer('a', 4), peer('c', 30), peer('e', 5), peer('g', 2)]);
  }],
  ['everyone gone', (w) => w.a.updatePeers([], 2)],
  ['back', (w) => w.a.updatePeers([peer('a', 4), peer('z', 8)], 2.5)],
];

/* The war's radio and the crash cam's replay over it. */
const WAR = [
  ...live,
  ['enable', (w) => w.a.setEnabled(true)],
  ['setMusicEnabled', (w) => w.a.setMusicEnabled(true)],
  ['war', (w) => w.a.war() === w.a.warRadio],
  ['war again', (w) => w.a.war() === w.a.warRadio],
  ['radio speaks', (w) => {
    w.ctx.currentTime = 1;
    w.a.warRadio.onSpeak();
  }],
  ['setWarBed combat', (w) => w.a.setWarBed('combat', 2)],
  ['setMix music', (w) => w.a.setMix({ music: 0.4 })],
  ['setMix no music', (w) => w.a.setMix({ wind: 0.4 })],
  ['setMusicEnabled false', (w) => w.a.setMusicEnabled(false)],
  ['setMix music while off', (w) => w.a.setMix({ music: 0.8 })],
  ['setMusicEnabled true', (w) => w.a.setMusicEnabled(true)],
  ['replay opens', (w) => w.a.setReplaying(true)],
  ['setWarBed intro under replay', (w) => w.a.setWarBed('intro', 5)],
  ['replayBeds while open', (w) => w.a.replayBeds() === w.a.replayRadio],
  ['replay closes', (w) => w.a.setReplaying(false)],
  ['replay closes again', (w) => w.a.setReplaying(false)],
  ['replayBeds closed', (w) => w.a.replayBeds() === w.a.replayRadio],
  ['setWarBed off', (w) => w.a.setWarBed('')],
  ['setWarBed off default', (w) => w.a.setWarBed(null)],
  ['nodeCount', (w) => w.a.nodeCount()],
];

/* A replay opening before any war: nothing to hand over. */
const REPLAY_NO_WAR = [
  ...live,
  ['replay opens', (w) => w.a.setReplaying(1)],
  ['replay closes', (w) => w.a.setReplaying(0)],
  ['replayBeds', (w) => w.a.replayBeds() === w.a.replayRadio],
  ['replay opens with beds', (w) => w.a.setReplaying(true)],
  ['replay closes with beds', (w) => w.a.setReplaying(false)],
];

/* The clock watch on a context that says running and has stopped. */
const CLOCK = [
  ...live,
  ['enable', (w) => w.a.setEnabled(true)],
  ['first frame', (w) => {
    w.wall = 1;
    return w.a.update(RPM, 1);
  }],
  ['same clock 0.5 s', (w) => {
    w.wall = 1.5;
    return w.a.update(RPM, 1);
  }],
  ['same clock 1.6 s', (w) => {
    w.wall = 2.6;
    return w.a.update(RPM, 1);
  }],
  ['resumed but still stuck', (w) => {
    w.ctx.state = 'running';
    w.wall = 4.5;
    return w.a.update(RPM, 1);
  }],
  ['clock moves', (w) => {
    w.ctx.currentTime = 0.25;
    w.wall = 5;
    return w.a.update(RPM, 1);
  }],
  ['stuck again', (w) => {
    w.wall = 7;
    return w.a.update(RPM, 1);
  }],
  ['scheduled frames do not watch', (w) => {
    w.wall = 20;
    return w.a.update(RPM, 1, 0.25);
  }],
  ['suspended resets', (w) => {
    w.ctx.state = 'suspended';
    w.wall = 30;
    return w.a.update(RPM, 1);
  }],
  ['running, wall later', (w) => {
    w.ctx.state = 'running';
    w.wall = 32;
    return w.a.update(RPM, 1);
  }],
  ['kick refused', (w) => {
    w.ctx.currentTime = 0.4;
    w.wall = 33;
    w.a.update(RPM, 1);
    w.ctx.refuse = true;
    w.wall = 34.6;
    return w.a.update(RPM, 1);
  }],
  ['update when disabled still watches', (w) => {
    w.ctx.refuse = false;
    w.ctx.currentTime = 0.5;
    w.a.setEnabled(false);
    w.wall = 35;
    return w.a.update(RPM, 1);
  }],
];

/* What the worklets say when they go wrong. */
const FAULTS = [
  ...live,
  ['processorerror', (w) => {
    w.wall = 1;
    w.a.engine.fire('processorerror', { message: 'out of range' });
  }],
  ['processorerror bare', (w) => w.a.engine.fire('processorerror', null)],
  ['fault message', (w) => w.a.engine.message({ fault: { kind: 'scrubbed', faults: 3, scrubbed: 7, message: 'NaN', context: 'rpm0' } })],
  ['fault minimal', (w) => w.a.engine.message({ fault: { kind: 'threw' } })],
  ['other message', (w) => w.a.engine.message({ level: 0.5 })],
  ['empty message', (w) => w.a.engine.message(null)],
  ['peer pool', (w) => w.a.updatePeers([peer('a', 3)], 0.5)],
  ['peer fault', (w) => w.ctx.made.find((n) => n.worklet && n.worklet.opts.processorOptions.model === 'quad' && n !== w.a.engine).message({ fault: { kind: 'died' } })],
  ['55 faults', (w) => {
    for (let i = 0; i < 55; i += 1) {
      w.wall = 2 + i;
      w.a.engine.message({ fault: { kind: 'scrubbed', faults: i } });
    }
  }],
];

/* An offline render: a destination of its own, no state listener, the
 * world node handed over first, every frame scheduled. */
const OFFLINE = [
  ['setVoice edf', (w) => w.a.setVoice('edf')],
  ['setBladeScale', (w) => w.a.setBladeScale(2)],
  ['setEngineSpec', (w) => w.a.setEngineSpec({ model: 'wing', params: { gain: 0.6 } })],
  ['attachWorld first', (w) => {
    w.ctx = makeCtx({ offline: true, sampleRate: 44100 });
    w.world = w.ctx.createGain();
    return w.a.attachWorld(w.world);
  }],
  ['attach', (w) => w.a.attach(w.ctx, { id: 'render-dest' })],
  ['enabled after attach', (w) => w.a.enabled],
  ['crash before ready', (w) => w.a.event('crash', 0.01, 1)],
  ['ready', ready],
  ['setLevel', (w) => w.a.setLevel(1)],
  ['setMix', (w) => w.a.setMix({ motors: 1, wind: 0 })],
  ['setEnabled', (w) => w.a.setEnabled(true)],
  ['frames', (w) => {
    for (let i = 0; i < 4; i += 1) {
      w.a.update([7000 + i * 100, 7100, 7200, 7300], 10 + i, i / 60, { ...AIR, dist: 2 + i, pan: i / 10 });
    }
  }],
  ['peers', (w) => w.a.updatePeers([peer('x', 12)], 4 / 60)],
  ['impact', (w) => w.a.impact(3, 0.7, 11, 5 / 60)],
  ['clip', (w) => w.a.event('clip', 6 / 60, 0.7)],
  ['crash', (w) => w.a.event('crash', 7 / 60, 0.9)],
  ['nodeCount', (w) => w.a.nodeCount()],
];

/* A context whose engine never loads. */
const ENGINE_FAILS = [
  ['attach', (w) => {
    w.ctx = makeCtx({ fail: true, hold: false, noEvents: true });
    return w.a.attach(w.ctx);
  }],
  ['ready rejects', async (w) => {
    try {
      await w.a.ready;
      return 'resolved';
    } catch (e) {
      return `rejected: ${e.message}`;
    }
  }],
  ['setEnabled', (w) => w.a.setEnabled(true)],
  ['update', (w) => w.a.update(RPM, 3, 0.1, AIR)],
  ['crash', (w) => w.a.event('crash', 0.2)],
  ['impact', (w) => w.a.impact(1, 1, 1, 0.3)],
  ['propStrike', (w) => w.a.propStrike(1, 1, 0.3)],
  ['mechanical', (w) => w.a.mechanical('gear', 0.3)],
  ['peers', (w) => w.a.updatePeers([peer('a', 3)], 0.4)],
  ['gate without hold', (w) => w.a.event('gate', 0.5)],
  ['gate again without hold', (w) => {
    w.a.flightDuck.gain.value = 0.3;
    return w.a.event('gate', 0.52);
  }],
  ['impact duck without hold', (w) => {
    w.a.ambienceDuck.gain.value = 0.9;
    return w.a.duckAction(0.6, 0.3, 0.55);
  }],
];

/* No Web Audio at all, then only the prefixed one. */
const NO_CONTEXT = [
  ['start', (w) => w.a.start()],
  ['toggle', (w) => w.a.toggle()],
  ['setEnabled', (w) => w.a.setEnabled(true)],
];
const WEBKIT = [
  ['toggle', (w) => w.a.toggle()],
  ['ready', ready],
  ['toggle again', (w) => w.a.toggle()],
];

export function cases(s) {
  stage = s;
  return {
    exports: () => ({
      VOICES,
      ENGINE_MODELS: [...ENGINE_MODELS],
      PEER_VOICES,
      engineModelFor: [...Object.values(VOICES), { rpmFull: 9000 }, null, undefined].map((v) => engineModelFor(v)),
      engineModelForCraft: [['striker2500', 'jet'], ['striker2500', 'boxer'], ['striker2500', undefined], ['cub', 'jet'], [undefined, undefined]]
        .map(([a, p]) => engineModelForCraft(a, p)),
      stage: Boolean(stage),
    }),
    before: () => session(BEFORE),
    live: () => session(LIVE),
    cues: () => session(CUES),
    cuesNoHold: () => session(CUES, { ctx: { hold: false, sampleRate: 22050 } }),
    peers: () => session(PEERS),
    war: () => session(WAR),
    replayNoWar: () => session(REPLAY_NO_WAR),
    clock: () => session(CLOCK),
    faults: () => session(FAULTS),
    offline: () => session(OFFLINE),
    engineFails: () => session(ENGINE_FAILS),
    noContext: () => session(NO_CONTEXT, { noContext: true }),
    webkit: () => session(WEBKIT, { noContext: true, webkit: true }),
  };
}
