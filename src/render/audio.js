/*
 * audio.js: the game's sound, the mix around it, and the public API the
 * rest of the shell plays it through (docs/AUDIO.md, section 11).
 *
 * THE AIRCRAFT. The pilot's own machine is one AudioWorkletNode,
 * src/render/engine-worklet.js, driven every frame from the plant's state
 * block: per motor RPM, the body frame velocity, the pack current. It is
 * the physics of the thing (blade pass and its harmonics, the motor's
 * whine, the engine's firing, the turbine's spool, the air over the
 * airframe, an impact's surface), not a loop or a filtered oscillator, so
 * nothing in it repeats and everything in it follows the stick. It
 * replaced the four oscillator chains and the wind loop the owner heard
 * as screaming, then as a hum (#349; the old sound is frozen in
 * tools/audio/old-audio.js for the listening page and nothing else).
 *
 * THE MIX. Every source lands on a bus a Settings slider moves:
 *
 *   motors   the pilot's engine            Motors and engines  motorLevel
 *   wind     the air over the airframe     Wind                windLevel
 *   other    other aircraft and vehicles   Other aircraft      otherLevel
 *   effects  impacts, wrecks, explosions,  Effects             effectsLevel
 *            the combat cut, the coin
 *   ambience the world's beds              Ambience            ambientLevel
 *   voice    the war radio                 Voice               voiceLevel
 *   music    the crates and the war's beds Music               musicLevel
 *
 * then through one limiter (a fast compressor holding the sum under
 * -6 dBFS), a tanh soft clip as the last safety net, and the master
 * (Volume). Action ducks what would mask it: a cue ducks the flight
 * stems, an impact or an explosion the music and the ambience as well.
 * The race cues (gate, graze, land, takeoff) and the menu taps are on no
 * bus at all: a cue the player has turned down is a cue that costs them a
 * race.
 *
 * The graph is built by attach(ctx), which takes any BaseAudioContext,
 * and update() takes the time to schedule at, so tools/audio/render.js
 * and src/replay/soundtrack.js can build this exact graph offline. The
 * engine arrives on `ready` (an AudioWorklet module loads asynchronously);
 * an offline render awaits it before scheduling anything.
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

import { Music } from './music.js';
import { WarRadio, VOICE_DUCK } from './warradio.js';

/*
 * THE VOICES the shell names a machine by (configs/airframes.js `voice`,
 * configs/power.js), and the one number the shell reads back from them:
 * `rpmFull`, the top of the hangar's rev (src/ui/hangar-polish.js revRpm).
 * What each one SOUNDS like is the engine model of the same name in
 * src/render/engine-worklet.js MODELS.
 */
export const VOICES = {
  quad: { rpmFull: 9000 },
  wing: { rpmFull: 17600 },
  glow4: { rpmFull: 9500 },
  glow2: { rpmFull: 9350 },
  edf: { rpmFull: 41700 },
};

/*
 * The engine's models (src/render/engine-worklet.js MODELS). A voice names
 * one by default; an aircraft whose voice is wrong for what it is says
 * which model it is through setEngineModel: the Striker's boxer twin is on
 * 'glow2' and its turbojet on 'edf', the ducted fan's, in VOICES, and the
 * engine voices them as what they are.
 */
/* The one shot mechanisms MotorAudio.mechanical knows, by the worklet's
 * codes. The flaps and the gear while they move are update()'s `air`. */
const MECH_KINDS = { gear: 2, catapult: 3, parachute: 4 };

export const ENGINE_MODELS = new Set(['quad', 'wing', 'edf', 'glow2', 'glow4', 'boxer2', 'turbojet']);
export function engineModelFor(voice) {
  const name = Object.keys(VOICES).find((k) => VOICES[k] === voice);
  return ENGINE_MODELS.has(name) ? name : 'quad';
}
/* The Striker's two propulsions as the engine hears them. */
export function engineModelForCraft(airframeId, propulsionId) {
  if (airframeId === 'striker2500') {
    return propulsionId === 'jet' ? 'turbojet' : 'boxer2';
  }
  return null;
}

/*
 * The master's ceiling: the Volume setting times this. With the soft clip
 * saturating, a render's true peak in dBTP came out equal to the master gain
 * in dB, so 1.0 measured 0.01 dBTP; 0.85 keeps the worst case under -1.4.
 */
/* A running context's clock standing still this long, s of the page's own
 * time, is a stalled renderer (MotorAudio.watchClock): ten frames' worth
 * of nothing is not a slow frame. */
const CLOCK_STALL_S = 1.5;
const MASTER_CEILING = 0.85;
/*
 * The binaural focus tone: a 6 Hz beat, in the theta band. Off by default,
 * a setting, and the interface says it needs headphones and claims nothing
 * else.
 */
/*
 * 1000 Hz, not 220 Hz, and the move is forced by a measurement.
 *
 * At 220 Hz the carrier sat inside the blade pass tone's own range. At hover
 * the left ear's motors run 209.4 and 211.7 Hz, 8 to 11 Hz from a 220 Hz
 * carrier, and a reviewer measured what that does: switching the focus tone on
 * raised the LEFT EAR'S OWN monaural amplitude modulation at 8.3 Hz by
 * 17.66 dB, to 10.8 percent depth. A binaural tone whose whole point is that
 * neither ear hears a modulation was generating a tremolo in one ear. It was
 * also 14.6 dB below the motor content in its own third octave, so it was
 * inaudible as a tone while being audible as an artefact.
 *
 * 1000 Hz is clear of the fundamental at every throttle setting and clear of
 * its second harmonic at full throttle, and it is below the 2 kHz floor of the
 * band A1 protects. Binaural beating is less effective this high, which is a
 * real cost, and it is the cost of not injecting a tremolo.
 */
const FOCUS_CARRIER_HZ = 1000;
const FOCUS_BEAT_HZ = 6;

/*
 * Keep 30 percent of the motor and wind stems: the owner asked to drop both
 * by 70 percent. The engine's model trims (engine-worklet.js MODELS `gain`)
 * were set by measurement THROUGH this, so it is part of the loudness
 * targets in docs/AUDIO.md and moves only with them.
 */
const FLIGHT_STEM = 0.3;
/*
 * The buses that arrived with the engine: a setting of 5 of 10 is unity,
 * so a returning player hears nothing move, and 10 is +6 dB.
 */
const BUS_UNITY_AT = 0.5;

/*
 * THE VOICE BUDGET for other pilots: how many are heard at once. Each is
 * one more engine node (an AudioWorkletNode, the pilot's own engine run
 * off board), so this is nodes and audio thread time, both measured in
 * docs/AUDIO.md section 13: a room of 32 costs what a room of 4 does. The
 * rest are culled smoothly: a voice that loses its place fades over
 * PEER_FADE_S, and a pilot takes a place only when clearly louder than the
 * one holding it (PEER_SWAP), so two pilots at the same distance do not
 * trade the voice back and forth.
 */
export const PEER_VOICES = 4;
const PEER_FADE_S = 0.3;
const PEER_SWAP = 1.5;
/* A pilot's voice level on the Other aircraft bus (unity at its default):
 * the Motors bus's default stem, 0.5 of FLIGHT_STEM, so that the engine's
 * REF_M holds, a pilot 16 m away as loud as this one's own engine. */
const PEER_LEVEL = 0.5 * FLIGHT_STEM;
/* Past this, a pilot is not heard at all, metres: an FPV quad at 400 m is
 * under the air and the wind of a real field. */
const PEER_RANGE_M = 400;
/* The nearest a pilot is heard from, metres: closer is inside the
 * engine's on board threshold (engine-worklet.js ONBOARD_M), which would
 * play another pilot as if it were this one. */
const ONBOARD_OFF_M = 1;

/*
 * The coin (coin()): the approved render's notes and timing, B5 988 Hz
 * then E6 1319 Hz at 80 ms, the E6 held 500 ms on a 180 ms decay.
 * COIN_PEAK is the E6's peak into the master at level 1, set by an
 * offline render of the real graph, over the first 300 ms: the SCHWING
 * measures -18.4 dBFS RMS and hover motors -28.1. A square puts its
 * energy at 1 to 4 kHz, where the ear is most sensitive, so the same RMS
 * reads louder than the sword; at 0.21 the coin measured -20.5 dBFS, 2 dB
 * under the SCHWING and 7.6 dB over the motors.
 */
const COIN_B5 = 988;
const COIN_E6 = 1319;
const COIN_STEP_S = 0.08;
const COIN_E6_S = 0.5;
const COIN_DECAY_S = 0.18;
const COIN_PEAK = 0.21;
/* The SCHWING's scrape gate, the square the coin borrows: its rate and
 * its swing either way. */
const SCRAPE_GATE_HZ = 380;
const SCRAPE_GATE_AMP = 0.375;

/*
 * Duck a bus, starting from where it actually IS.
 *
 * cancelScheduledValues followed by setValueAtTime(1) is a JUMP TO UNITY
 * whenever a second cue arrives while the first one is still ducking: the
 * bus is at 0.28, the schedule is cleared, and the next sample is 1. That
 * is a step on the motors, the wind and the music, at the exact instant a
 * cue is playing over them, and a step is a click. Two gates a tenth of a
 * second apart put one in. It has to start from the current value.
 *
 * Deeper wins. If the bus is already further down than this cue asks for,
 * the duck stays where it is and only the release is rescheduled: raising
 * it to the shallower depth would be the same step in the other direction.
 */
function duckParam(g, t, depth, seconds, attack) {
  const from = g.value;
  if (typeof g.cancelAndHoldAtTime === 'function') {
    g.cancelAndHoldAtTime(t);
  } else {
    g.cancelScheduledValues(t);
  }
  g.setValueAtTime(from, t);
  const to = from < depth ? from : depth;
  g.linearRampToValueAtTime(to, t + attack);
  g.linearRampToValueAtTime(1, t + seconds);
}

export class MotorAudio {
  constructor() {
    this.ctx = null;
    /* What the worklets said went wrong (watchNode), and the context's
     * state changes, newest last: for the checks and a bug report. */
    this.faults = [];
    this.states = [];
    /* The clock watch (watchClock): the context's time and the page's
     * when it last moved, and how many stalls it has seen. */
    this.clock = { ctx: 0, wall: 0, kicked: false };
    this.stalls = 0;
    this.enabled = false;
    this.master = null;
    this.level = 0.5; /* mix level, driven by the volume setting */
    /* Per bus, each 0 to 1, driven by their own settings rows: the DEFAULTS
     * in src/ui/ui.js divided by ten. */
    this.mix = { motors: 0.5, wind: 0.5, music: 0.5, focus: 1, effects: 0.5, voice: 0.5, ambience: 0.5, other: 0.5 };
    this.focusOn = false;
    this.voice = VOICES.quad;
    /* The engine model the shell asked for, or null for the voice's own
     * (setEngineModel), and the hangar prop's blade count over the stock
     * prop's (setBladeScale). */
    this.engineModel = null;
    this.engineParams = null;
    this.bladeScale = 1;
    /* A seeded generator for the cues' variation, Math.imul so it does not
     * repeat in a few thousand draws; seeded so an offline render is the
     * same render twice. */
    this.vary = 0x6a09e667;
    this.music = new Music();
    /* The war mode's radio and music (src/render/warradio.js), made on
     * the first war, and whether the music setting wants a bed at all:
     * while the war's music plays, the crate's is held off. */
    this.warRadio = null;
    this.warBed = false;
    this.musicWanted = false;
    /* Every AudioNode this instance owns, for P12. A node created and
     * dropped without being counted is exactly the leak P12 forbids, so
     * the count is kept where the nodes are made rather than derived by
     * reading the file later. */
    this.nodes = [];
    /* The pilot's engine (src/render/engine-worklet.js), there once
     * `ready` resolves. */
    this.engine = null;
    this.ready = Promise.resolve();
    /* A world node handed to attachWorld before the graph existed. */
    this.worldNode = null;
    /* Other pilots: the listener (setListener) and the voice pool
     * (updatePeers), made on the first frame with a pilot to hear. */
    this.listener = { x: 0, y: 0, z: 0, rx: 1, ry: 0, rz: 0, ground: null };
    this.peerSlots = null;
    this.peerRank = [];
  }

  /* Which machine the engine voices, ENGINE_MODELS; null is the voice's
   * own. Safe either side of attach. */
  setEngineModel(name) {
    if (name != null && !ENGINE_MODELS.has(name)) {
      throw new Error(`audio: no engine model ${name}`);
    }
    this.engineModel = name;
    this.postEngineModel();
  }

  /*
   * PUBLIC API: the flown aircraft's own numbers on its model, from
   * src/render/enginespec.js engineSpecFor: { motors, blades, poles,
   * rpmRef, washV, rpmScale, idleRpm, gain }, any subset, or null for the
   * model's own. The engine refuses any other key. Safe either side of
   * attach.
   */
  setEngineParams(params) {
    this.engineParams = params ? { ...params } : null;
    this.postEngineModel();
  }

  /* The whole engine choice at once: { model, params } as engineSpecFor
   * returns it. */
  setEngineSpec(spec) {
    this.engineModel = spec && spec.model ? spec.model : null;
    if (this.engineModel != null && !ENGINE_MODELS.has(this.engineModel)) {
      throw new Error(`audio: no engine model ${this.engineModel}`);
    }
    this.setEngineParams(spec ? spec.params : null);
  }

  postEngineModel() {
    if (this.engine) {
      this.engine.port.postMessage(this.engineMessage());
    }
  }

  engineMessage() {
    return { model: this.engineModel ?? engineModelFor(this.voice), params: this.engineParams, bladeScale: this.bladeScale };
  }

  /* 0 to 1, for a cue's variation. */
  jitter() {
    this.vary = (Math.imul(this.vary, 1664525) + 1013904223) >>> 0;
    return this.vary / 4294967296;
  }

  /* P12: steady state AudioNode count. */
  nodeCount() {
    return this.nodes.length;
  }

  /* Volume from the settings screen, zero to one. */
  setLevel(v) {
    this.level = Math.max(0, Math.min(1, v));
  }

  setEnabled(on) {
    this.enabled = Boolean(on) && Boolean(this.ctx);
    if (!this.enabled) {
      this.music.pause();
    } else {
      this.music.resume();
    }
  }

  /*
   * Per bus levels, 0 to 1: motors, wind, music, focus, effects, voice,
   * ambience, other. Any subset; a missing key is left alone, an unknown
   * one refused. Each lands on a real bus gain rather than on a label.
   */
  setMix(m) {
    if (!m) {
      return;
    }
    for (const [k, v] of Object.entries(m)) {
      if (!(k in this.mix)) {
        throw new Error(`audio: no bus named ${k}`);
      }
      if (typeof v === 'number') {
        this.mix[k] = Math.max(0, Math.min(1, v));
      }
    }
    if (typeof m.music === 'number') {
      this.music.setLevel(this.mix.music);
      if (this.warRadio) {
        this.warRadio.setMusicLevel(this.musicWanted ? this.mix.music : 0);
      }
    }
    this.applyBuses();
  }

  setMusicEnabled(on) {
    this.musicWanted = Boolean(on);
    this.music.setEnabled(this.musicWanted && !this.warBed);
    if (this.warRadio) {
      this.warRadio.setMusicLevel(this.musicWanted ? this.mix.music : 0);
    }
  }

  /*
   * The war mode's radio (src/render/warradio.js), made the first time a
   * war asks for it once the context is up. Its two media elements play
   * THROUGH the graph: the calls onto the Voice bus, the war's music into
   * the crate's own duck, so the limiter, the Volume, the sound switch and
   * the action ducks hold for them as for everything else. The radio's
   * own share of the level is then 1. A call ducks the motors and the wind
   * as a cue does.
   */
  war() {
    if (!this.warRadio) {
      this.warRadio = new WarRadio();
      this.warRadio.onSpeak = () => this.duckFlight(this.ctx.currentTime, VOICE_DUCK, 2.5);
    }
    if (this.ctx && !this.warRadio.ready) {
      this.warRadio.attach();
      this.warRadio.route(this.ctx, this.voiceBus, this.music.duck, (n) => {
        this.nodes.push(n);
        return n;
      });
      this.warRadio.setMusicLevel(this.musicWanted ? this.mix.music : 0);
      this.warRadio.setOutput(1);
    }
    return this.warRadio;
  }

  /* The war's music on, or off and the crate's back; `at` seconds into
   * the track (the intro film's late start). */
  setWarBed(track, at = 0) {
    const radio = this.war();
    this.warBed = Boolean(track);
    this.music.setEnabled(this.musicWanted && !this.warBed);
    radio.music(track, at);
  }

  /*
   * Which machine the mix is the sound of, see VOICES. Safe before attach.
   * An unknown name is refused rather than defaulted, because a silent
   * fallback to the quad's voice on a wing is exactly the kind of wrong
   * nobody hears.
   */
  setVoice(name) {
    const voice = VOICES[name];
    if (!voice) {
      throw new Error(`audio: no voice named ${name}`);
    }
    this.voice = voice;
    this.postEngineModel();
  }

  /* The hangar's prop (configs/hangar-parts.js): its blade count over
   * the one the aircraft's own prop has. The engine scales the blade
   * count of a prop's model by it; an engine's firing does not move. */
  setBladeScale(k) {
    if (!(k > 0) || !Number.isFinite(k)) {
      throw new Error(`audio: blade scale ${k}`);
    }
    this.bladeScale = k;
    this.postEngineModel();
  }

  /* Which music track, or 'rotation' for a random start then the crate
   * in order. A setting, safe before attach: the player object holds it
   * as data. This is the FLIGHT crate. The menu bed is not selectable. */
  setMusicTrack(sel) {
    this.music.setTrack(sel);
  }

  /*
   * 'flight' or 'menu': which crate the bed should be playing. Driven off
   * the screen by the shell, because the shell is the only side that
   * knows what is on screen, and safe before attach for the same reason
   * setMusicTrack is.
   */
  setMusicContext(name) {
    this.music.setContext(name);
  }

  skipMusic(dir) {
    this.music.skip(dir);
  }

  musicStatus() {
    return this.music.status();
  }

  setFocusEnabled(on) {
    this.focusOn = Boolean(on);
    this.applyBuses();
  }

  applyBuses() {
    if (!this.motorBus) {
      return;
    }
    this.motorBus.gain.value = this.mix.motors * FLIGHT_STEM;
    this.windBus.gain.value = this.mix.wind * FLIGHT_STEM;
    this.otherBus.gain.value = this.mix.other / BUS_UNITY_AT;
    this.effectsBus.gain.value = this.mix.effects / BUS_UNITY_AT;
    this.voiceBus.gain.value = this.mix.voice / BUS_UNITY_AT;
    this.ambienceBus.gain.value = this.mix.ambience / BUS_UNITY_AT;
    /* The focus tone is quiet on purpose. It is a tone under a mix, not a
     * test signal, and two steady carriers at any real level would mask the
     * flight instrument. */
    this.focusBus.gain.value = this.focusOn ? this.mix.focus * 0.15 : 0;
  }

  /* Browsers require a user gesture before audio starts. */
  start() {
    if (this.ctx) {
      /* 'suspended' (the browser's, after a device change or a sleep) or
       * 'interrupted' (another app took the audio device): a gesture is
       * the one thing that may start it again. Every key and press comes
       * here (src/main.js wakeAudio). */
      if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') {
        this.ctx.resume().catch((e) => console.error('audio: the context would not resume', e));
      }
      this.enabled = true;
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      return;
    }
    this.attach(new Ctx());
    this.enabled = true;
  }

  /*
   * Build the graph on any BaseAudioContext. Called by start() with a live
   * AudioContext and by the offline renderers with an OfflineAudioContext.
   * Does not set enabled: the caller decides, because a render wants the
   * mix up from sample zero and the shell wants it to follow a setting.
   */
  attach(ctx, destination) {
    this.ctx = ctx;
    const out = destination || ctx.destination;
    /* Every time the context stops or starts, said and kept: a context
     * that left 'running' is the first thing to look at when the sound
     * stops (window.__audio.states). */
    if (typeof ctx.addEventListener === 'function' && !(typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext)) {
      ctx.addEventListener('statechange', () => {
        this.states.push({ at: Math.round(performance.now()), state: ctx.state });
        if (this.states.length > 50) {
          this.states.shift();
        }
        if (ctx.state !== 'running') {
          console.warn(`audio: the context is ${ctx.state}; the next key or press resumes it`);
        }
      });
    }
    /* One place where nodes come into existence, so the P12 count cannot
     * drift from the graph. */
    const keep = (n) => {
      this.nodes.push(n);
      return n;
    };

    /*
     * The master: a limiter, a soft clip, the Volume.
     *
     * The limiter is a fast, high ratio compressor holding the sum under
     * -6 dBFS, so the tanh after it is a safety net rather than a sound;
     * every render's true peak is held to -1 dBTP (tools/audio/render.js).
     * The tanh is normalised so the curve still passes through plus and
     * minus one: linear to about half scale, then bending.
     */
    const shaper = keep(ctx.createWaveShaper());
    const CURVE = 1024;
    const curve = new Float32Array(CURVE);
    for (let i = 0; i < CURVE; i += 1) {
      const x = (i / (CURVE - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 1.6) / Math.tanh(1.6);
    }
    shaper.curve = curve;
    shaper.oversample = '2x';
    const master = keep(ctx.createGain());
    master.gain.value = 0.0;
    shaper.connect(master);
    master.connect(out);
    this.master = master;
    this.preMaster = shaper;
    const inlet = keep(ctx.createDynamicsCompressor());
    inlet.threshold.value = -6;
    inlet.knee.value = 3;
    inlet.ratio.value = 20;
    inlet.attack.value = 0.002;
    inlet.release.value = 0.2;
    inlet.connect(shaper);
    this.inlet = inlet;

    /*
     * The flight duck: what masks a cue is the motors, the wind and the
     * other aircraft, so those are what a cue ducks. Measured before it
     * existed: a gate cue had -0.13 dB of advantage over its own masking and
     * a crash -17.29 dB, so on a full throttle crash the player was told
     * nothing at all.
     */
    const flightDuck = keep(ctx.createGain());
    flightDuck.gain.value = 1;
    flightDuck.connect(inlet);
    this.flightDuck = flightDuck;
    /* The ambience's duck, under impacts and explosions. */
    const ambienceDuck = keep(ctx.createGain());
    ambienceDuck.gain.value = 1;
    ambienceDuck.connect(inlet);
    this.ambienceDuck = ambienceDuck;
    const bus = (to, value) => {
      const g = keep(ctx.createGain());
      g.gain.value = value;
      g.connect(to);
      return g;
    };
    /* Nothing below 60 Hz from the motors: everything it removes is rumble
     * no headphone renders as pitch, and it is exactly the band the bass
     * line needs. The engine's loudness targets were measured through it. */
    const motorHp = keep(ctx.createBiquadFilter());
    motorHp.type = 'highpass';
    motorHp.frequency.value = 60;
    motorHp.Q.value = 0.7;
    motorHp.connect(flightDuck);
    this.motorBus = bus(motorHp, this.mix.motors * FLIGHT_STEM);
    this.windBus = bus(flightDuck, this.mix.wind * FLIGHT_STEM);
    this.otherBus = bus(flightDuck, this.mix.other / BUS_UNITY_AT);
    this.effectsBus = bus(inlet, this.mix.effects / BUS_UNITY_AT);
    this.voiceBus = bus(inlet, this.mix.voice / BUS_UNITY_AT);
    this.ambienceBus = bus(ambienceDuck, this.mix.ambience / BUS_UNITY_AT);
    const focusBus = bus(inlet, 0);
    this.focusBus = focusBus;

    /*
     * One second of noise for the cue voices. Math.imul, not a float
     * multiply: s * 1103515245 passes 2^53 and loses its low bits, and the
     * float version of this generator repeats every 10466 samples, which
     * the ear hears as a 4.6 Hz buzz (docs/AUDIO.md, the audit).
     */
    const len = Math.floor(ctx.sampleRate);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < len; i += 1) {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      ch[i] = s / 2147483648 - 1.0;
    }

    this.attachEngine(ctx, keep);

    /*
     * The binaural focus tone: one carrier per ear, differing by the beat
     * frequency, merged so the left oscillator reaches only the left channel
     * and the right only the right. That separation is the whole thing: a
     * monaural beat puts both carriers in both ears and each ear hears the
     * modulation, while a binaural beat gives each ear one steady tone and
     * neither ear hears any modulation at all.
     *
     * Note for anyone measuring this: the mono SUM of a binaural pair does
     * beat, because two carriers a few Hz apart added together are an
     * amplitude modulation at their difference by simple trigonometry. The
     * discriminator is per channel absence, not mono sum absence. The
     * derivation is in .loop/threshold-disputes.md entry 5.
     */
    const merger = keep(ctx.createChannelMerger(2));
    this.focusOscs = [];
    for (let e = 0; e < 2; e += 1) {
      const osc = keep(ctx.createOscillator());
      osc.type = 'sine';
      osc.frequency.value = FOCUS_CARRIER_HZ + (e === 1 ? FOCUS_BEAT_HZ : 0);
      const g = keep(ctx.createGain());
      g.gain.value = 0.5;
      osc.connect(g);
      g.connect(merger, 0, e);
      osc.start();
      this.focusOscs.push(osc);
    }
    merger.connect(focusBus);

    /*
     * One shot cues, pooled: a persistent oscillator and a persistent noise
     * chain, shared by the gate and graze clicks, the landing and takeoff
     * blips, the crash, and the menu's ui() taps. Nothing is created per
     * event, which is what A10 asks for by name.
     *
     * They go in AHEAD of the soft clip but not through a stem bus, because
     * a cue the player has turned down is a cue that costs them a race.
     */
    const cueOsc = keep(ctx.createOscillator());
    cueOsc.type = 'triangle';
    cueOsc.frequency.value = 880;
    const cueGain = keep(ctx.createGain());
    cueGain.gain.value = 0;
    cueOsc.connect(cueGain);
    cueGain.connect(inlet);
    cueOsc.start();
    this.cueOsc = cueOsc;
    this.cueGain = cueGain;

    const crashSrc = keep(ctx.createBufferSource());
    crashSrc.buffer = buf;
    crashSrc.loop = true;
    const crashLp = keep(ctx.createBiquadFilter());
    crashLp.type = 'lowpass';
    crashLp.frequency.value = 1400;
    crashLp.Q.value = 1.1;
    const crashGain = keep(ctx.createGain());
    crashGain.gain.value = 0;
    crashSrc.connect(crashLp);
    crashLp.connect(crashGain);
    crashGain.connect(inlet);
    crashSrc.start();
    this.crashGain = crashGain;
    this.crashLp = crashLp;

    /*
     * The wreck's voice: a third pooled noise chain, band passed, for the
     * sounds a breaking aircraft makes that the crash cue's low thump does
     * not: a carbon arm or a prop snapping (a hard, bright crack), foam
     * crushing (a short grainy crunch), a blade chipping on the ground (a
     * tick) and a splash. Its own chain so a snap and the thump of the same
     * hit sound together rather than one cancelling the other's envelope.
     * Three nodes, created once, like every cue here.
     */
    const wreckSrc = keep(ctx.createBufferSource());
    wreckSrc.buffer = buf;
    wreckSrc.loop = true;
    const wreckBp = keep(ctx.createBiquadFilter());
    wreckBp.type = 'bandpass';
    wreckBp.frequency.value = 2400;
    wreckBp.Q.value = 1.2;
    const wreckGain = keep(ctx.createGain());
    wreckGain.gain.value = 0;
    wreckSrc.connect(wreckBp);
    wreckBp.connect(wreckGain);
    wreckGain.connect(this.effectsBus);
    wreckSrc.start();
    this.wreckGain = wreckGain;
    this.wreckBp = wreckBp;

    /*
     * The combat cut's SCHWING (docs/COMBAT-PLAN.md section 5.4), a sword
     * drawn, all synthesis, no sample: the lead's recipe, which the owner
     * heard rendered and chose. A blade scrape (the wreck's noise, band
     * passed and swept up, gated at 380 Hz into a rasp), a whoosh (a lower
     * band swept up), a shing (a high band struck), and the blade's ring:
     * four partials at the inharmonic 1, 2.76, 5.40, 8.93 of a thin bar,
     * the fundamental doubled 0.35 percent sharp for its shimmer, each
     * higher partial dying faster, into the master's tanh. Eighteen nodes,
     * made once, fed by the wreck voice's noise loop; schwing() only moves
     * their envelopes. Only the fundamental is doubled: the graph's budget
     * is 64 nodes (tests/thresholds.json max_nodes), and a pair on every
     * partial would pass it.
     */
    const bandOf = (type, q) => {
      const f = keep(ctx.createBiquadFilter());
      f.type = type;
      f.Q.value = q;
      return f;
    };
    const envOf = () => {
      const g = keep(ctx.createGain());
      g.gain.value = 0;
      return g;
    };
    const scrapeBp = bandOf('bandpass', 2.2);
    const scrapeGate = keep(ctx.createGain());
    scrapeGate.gain.value = 0.625;
    const gateOsc = keep(ctx.createOscillator());
    /* A square of amplitude 0.375 about 0.625: the gate's 1.0 and 0.25. */
    const sq = new Float32Array(16);
    const sqIm = new Float32Array(16);
    for (let k = 1; k < 16; k += 2) {
      sqIm[k] = (SCRAPE_GATE_AMP * 4) / (Math.PI * k);
    }
    gateOsc.setPeriodicWave(ctx.createPeriodicWave(sq, sqIm, { disableNormalization: true }));
    gateOsc.frequency.value = SCRAPE_GATE_HZ;
    gateOsc.connect(scrapeGate.gain);
    gateOsc.start();
    const scrapeEnv = envOf();
    wreckSrc.connect(scrapeBp);
    scrapeBp.connect(scrapeGate);
    scrapeGate.connect(scrapeEnv);
    scrapeEnv.connect(this.effectsBus);
    const whooshBp = bandOf('bandpass', 1.6);
    const whooshEnv = envOf();
    wreckSrc.connect(whooshBp);
    whooshBp.connect(whooshEnv);
    whooshEnv.connect(this.effectsBus);
    const shingBp = bandOf('bandpass', 3);
    shingBp.frequency.value = 6500;
    const shingEnv = envOf();
    wreckSrc.connect(shingBp);
    shingBp.connect(shingEnv);
    shingEnv.connect(this.effectsBus);
    const ringEnv = envOf();
    ringEnv.connect(this.effectsBus);
    const partials = [];
    for (const [k, ratio] of [1, 2.76, 5.4, 8.93].entries()) {
      const g = envOf();
      g.connect(ringEnv);
      const oscs = [];
      for (const detune of k === 0 ? [1, 1.0035] : [1]) {
        const o = keep(ctx.createOscillator());
        o.type = 'sine';
        o.frequency.value = 560 * ratio * detune;
        o.connect(g);
        o.start();
        oscs.push({ o, mult: ratio * detune });
      }
      partials.push({ g, oscs, amp: [1, 0.7, 0.45, 0.28][k], rate: 1.2 + 1.8 * k });
    }
    this.schwingVoice = {
      scrapeBp, scrapeEnv, whooshBp, whooshEnv, shingBp, shingEnv, ringEnv, partials,
    };
    this.schwings = 0;

    /*
     * Catch the Ace's coin (docs/TAG-PLAN.md), the crown changing hands:
     * the owner's pick of four renders, "b arcade coin", the classic two
     * note square wave coin. B5 for 80 ms, then E6 struck and dying at a
     * 180 ms time constant, gone by 580 ms.
     *
     * ONE NODE, its envelope. The tone is the SCHWING's scrape gate above,
     * already a square (fifteen harmonics, 0.375 each way): coin() tunes
     * it to the notes and puts it back to SCRAPE_GATE_HZ after, and the
     * scrape stays silent meanwhile because its own envelope is shut. A
     * room runs one game at a time (docs/TAG-PLAN.md decision 10), so a
     * SCHWING and a coin never sound together. The graph's budget is 64
     * nodes (tests/thresholds.json max_nodes) and it stood at 63, so an
     * oscillator of the coin's own would have passed it.
     */
    const coinEnv = envOf();
    gateOsc.connect(coinEnv);
    coinEnv.connect(this.effectsBus);
    this.coinVoice = { osc: gateOsc, env: coinEnv };
    this.coins = 0;
    this.booms = 0;

    /* The bed. It brings its own nodes and counts them through keep. */
    this.music.attach(ctx, inlet, keep);
    this.music.setLevel(this.mix.music);
    this.applyBuses();
  }

  /*
   * The pilot's engine: one AudioWorkletNode (src/render/engine-worklet.js)
   * for the motors or the engine, the air over the airframe and the
   * impacts. addModule is async and attach() is not, so the node arrives
   * on `ready`, which the offline renderers await before they schedule
   * anything; update() and impact() do nothing until it is there. A load
   * failure rejects `ready` and is logged, loudly, rather than leaving a
   * silent aircraft.
   */
  attachEngine(ctx, keep) {
    const url = new URL('./engine-worklet.js', import.meta.url);
    this.ready = ctx.audioWorklet.addModule(url).then(() => {
      const node = keep(new AudioWorkletNode(ctx, 'fdfpv-engine', {
        numberOfInputs: 0,
        numberOfOutputs: 3,
        outputChannelCount: [2, 2, 2],
        processorOptions: this.engineMessage(),
      }));
      this.watchNode(node, 'engine');
      node.connect(this.motorBus, 0);
      node.connect(this.windBus, 1);
      node.connect(this.effectsBus, 2);
      this.engine = node;
      if (this.worldNode) {
        this.connectWorld(this.worldNode);
      }
    });
    this.ready.catch((e) => console.error('audio: the engine failed to load', e));
  }

  /*
   * PUBLIC API: where the player hears from, once a frame before
   * updatePeers: the camera's position and its right hand unit vector, in
   * any one right handed frame the peers' positions are in too (the shell
   * uses the scene's, metres, y up), and `ground`, the height of the ground
   * under the listener on the frame's up axis (y), for the reflection, or
   * null for none.
   */
  setListener(x, y, z, rx, ry, rz, ground = null) {
    const l = this.listener;
    l.x = x;
    l.y = y;
    l.z = z;
    l.rx = rx;
    l.ry = ry;
    l.rz = rz;
    l.ground = ground;
  }

  /*
   * PUBLIC API: the other pilots this frame, `peers` an array of
   * { id, spec, rpm: [4], x, y, z, vx, vy, vz }: an id that stays the
   * same for a pilot, the engine spec of their aircraft (enginespec.js
   * engineSpecFor), their four motor RPMs (a plane's engine in slot 0),
   * and their position and velocity, metres and m/s, in the listener's
   * frame. The PEER_VOICES nearest and loudest are heard, through the
   * propagation (distance, the air, the delay, the Doppler, the ground's
   * reflection), on the Other aircraft bus; the rest are culled smoothly.
   * A pilot not in the list is gone. The pool's nodes are made once, on
   * the first frame with a pilot in it.
   */
  updatePeers(peers, atTime) {
    if (!this.ctx || !this.engine) {
      return;
    }
    const t = atTime == null ? this.ctx.currentTime : atTime;
    if (!this.peerSlots) {
      if (!peers.length) {
        return;
      }
      this.peerSlots = [];
      for (let k = 0; k < PEER_VOICES; k += 1) {
        const node = new AudioWorkletNode(this.ctx, 'fdfpv-engine', {
          numberOfInputs: 0,
          numberOfOutputs: 3,
          outputChannelCount: [2, 2, 2],
          processorOptions: { model: 'quad' },
        });
        this.nodes.push(node);
        this.watchNode(node, `peer ${k}`);
        node.parameters.get('level').setValueAtTime(0, t);
        node.connect(this.otherBus, 0);
        this.peerSlots.push({ node, id: null, score: 0, freeAt: 0, linked: false, model: '' });
      }
    }
    /* Each pilot's place: nearer and turning is louder; out of range is
     * not heard. `rank` holds the pilots in range, loudest first. */
    const l = this.listener;
    const rank = this.peerRank;
    rank.length = 0;
    for (const pr of peers) {
      const d = Math.hypot(pr.x - l.x, pr.y - l.y, pr.z - l.z);
      /* A pilot with no finite position is not anywhere to be heard from;
       * NaN fails the range test and is dropped with the far ones. */
      if (!(d <= PEER_RANGE_M)) {
        continue;
      }
      const turning = pr.rpm[0] > 300 || pr.rpm[1] > 300 || pr.rpm[2] > 300 || pr.rpm[3] > 300;
      rank.push({ pr, d, score: (turning ? 1 : 0.3) / Math.max(1, d) });
    }
    rank.sort((a, b) => b.score - a.score);
    const heldBy = (id) => this.peerSlots.find((x) => x.id === id) || null;
    const entryOf = (id) => rank.find((e) => e.pr.id === id) || null;
    /* The loudest pilot in range with no voice: the one a holder that has
     * fallen out of the top PEER_VOICES must beat to keep its place. */
    let challenger = null;
    for (let k = 0; k < rank.length && k < PEER_VOICES; k += 1) {
      if (!heldBy(rank[k].pr.id)) {
        challenger = rank[k];
        break;
      }
    }
    for (const slot of this.peerSlots) {
      if (!slot.id) {
        continue;
      }
      const e = entryOf(slot.id);
      const top = e && rank.indexOf(e) < PEER_VOICES;
      if (e && (top || !challenger || challenger.score < e.score * PEER_SWAP)) {
        continue;
      }
      slot.node.parameters.get('level').setTargetAtTime(0, t, PEER_FADE_S / 3);
      slot.id = null;
      slot.freeAt = t + PEER_FADE_S;
      slot.linked = false;
    }
    for (let k = 0; k < rank.length && k < PEER_VOICES; k += 1) {
      const pr = rank[k].pr;
      if (heldBy(pr.id)) {
        continue;
      }
      const slot = this.peerSlots.find((x) => !x.id && x.freeAt <= t);
      if (!slot) {
        break;
      }
      slot.id = pr.id;
      slot.linked = false;
      const model = pr.spec && pr.spec.model ? pr.spec.model : 'quad';
      slot.node.port.postMessage({ model, params: pr.spec ? pr.spec.params : null, bladeScale: 1 });
      slot.node.parameters.get('level').setTargetAtTime(PEER_LEVEL, t, PEER_FADE_S / 3);
    }
    for (const slot of this.peerSlots) {
      const e = slot.id ? entryOf(slot.id) : null;
      if (e) {
        this.voicePeer(slot, e.pr, e.d, t);
      }
    }
  }

  /* One held voice's state: its motors, its airspeed, and where it is to
   * the listener. */
  voicePeer(slot, pr, dist, t) {
    const p = slot.node.parameters;
    const l = this.listener;
    /* The same rule as updateEngine: a value that is not a number is 0. */
    const num = (v) => (Number.isFinite(v) ? v : 0);
    for (let m = 0; m < 4; m += 1) {
      p.get(`rpm${m}`).setTargetAtTime(Math.max(0, num(pr.rpm[m])), t, 0.03);
    }
    p.get('u').setTargetAtTime(num(Math.hypot(pr.vx, pr.vy, pr.vz)), t, 0.05);
    const dx = pr.x - l.x;
    const dy = pr.y - l.y;
    const dz = pr.z - l.z;
    const d = Math.max(ONBOARD_OFF_M, dist);
    let d2 = 0;
    if (l.ground != null) {
      /* The image under the ground plane y = ground. */
      const hs = pr.y - l.ground;
      const hl = l.y - l.ground;
      d2 = Math.hypot(dx, hs + hl, dz);
    }
    const pan = Math.max(-1, Math.min(1, (dx * l.rx + dy * l.ry + dz * l.rz) / d));
    const set = (k, v) => {
      if (slot.linked) {
        p.get(k).linearRampToValueAtTime(v, t);
      } else {
        p.get(k).setValueAtTime(v, t);
      }
    };
    set('dist', d);
    set('dist2', d2);
    set('pan', pan);
    slot.linked = true;
  }

  /*
   * THE CLOCK WATCH. A context the browser has stopped rendering (its
   * output device went away, a Bluetooth headset switched profile when a
   * microphone opened) can still say 'running' while its clock stands
   * still, and then nothing on the page makes a sound until a reload. Once
   * a frame, live only: a clock that has not moved in CLOCK_STALL_S of the
   * page's own time while it says running is a stall, logged loudly, kept
   * in this.states, and kicked with a suspend and a resume, which is what
   * starts a stalled renderer on a new device. A hidden tab draws no
   * frames, so it never trips this.
   */
  watchClock() {
    const ctx = this.ctx;
    const wall = performance.now() / 1000;
    const c = this.clock;
    if (ctx.state !== 'running' || ctx.currentTime !== c.ctx || !(c.wall > 0)) {
      c.ctx = ctx.currentTime;
      c.wall = wall;
      c.kicked = false;
      return;
    }
    if (wall - c.wall < CLOCK_STALL_S || c.kicked) {
      return;
    }
    c.kicked = true;
    this.stalls += 1;
    this.states.push({ at: Math.round(wall * 1000), state: 'stalled' });
    console.error(`audio: the context says running but its clock has stood at ${ctx.currentTime.toFixed(3)} s for ${(wall - c.wall).toFixed(1)} s; suspending and resuming it`);
    ctx.suspend().then(() => ctx.resume()).catch((e) => console.error('audio: the stalled context would not restart', e));
  }

  /*
   * PUBLIC API: hear what a worklet node says when it goes wrong. Its
   * processor guards itself (worklet-guard.js) and posts { fault } on its
   * port; a processor that died anyway fires processorerror. Both are
   * logged loudly and kept in this.faults (window.__audio.faults, the
   * checks', at most 50), never dropped.
   */
  watchNode(node, name) {
    const note = (f) => {
      this.faults.push({ at: Math.round(performance.now()), node: name, ...f });
      if (this.faults.length > 50) {
        this.faults.shift();
      }
      console.error(`audio: the ${name} worklet ${f.kind}`, f.message || '', f.context || '', `fault ${f.faults || 1}, ${f.scrubbed || 0} values scrubbed`);
    };
    node.addEventListener('processorerror', (e) => note({ kind: 'died', message: String((e && e.message) || 'processorerror') }));
    node.port.addEventListener('message', (e) => {
      if (e.data && e.data.fault) {
        note(e.data.fault);
      }
    });
    node.port.start();
  }

  /*
   * PUBLIC API: the world's sound (src/render/world-worklet.js, the other
   * aircraft, the vehicles, the ambience and the explosions). `node` is any
   * AudioNode with three stereo outputs: 0 other aircraft and vehicles,
   * 1 ambience, 2 effects. Each lands on its own Settings bus, through the
   * limiter and the ducks. Safe before attach: the node is held and
   * connected when the graph exists. One world node; a second call
   * replaces the first. The caller owns the node and counts it (P12) in
   * its own budget; nodeCount() counts it too once it is connected.
   */
  attachWorld(node) {
    if (this.worldNode && this.worldNode !== node && this.otherBus) {
      this.worldNode.disconnect();
    }
    this.worldNode = node;
    if (this.otherBus) {
      this.connectWorld(node);
    }
  }

  connectWorld(node) {
    node.connect(this.otherBus, 0);
    node.connect(this.ambienceBus, 1);
    node.connect(this.effectsBus, 2);
    if (!this.nodes.includes(node)) {
      this.nodes.push(node);
    }
  }

  toggle() {
    if (!this.ctx) {
      this.start();
      return this.enabled;
    }
    this.enabled = !this.enabled;
    return this.enabled;
  }

  /*
   * A one shot cue. kind is 'crash', 'gate', 'clip', 'land' or 'takeoff'.
   * Safe to call before attach, and it creates no nodes: every cue is an
   * envelope on a voice that already exists. `level` is optional and only
   * the contact cues read it; see the note in the body.
   *
   * A cue also ducks the bed, which is what keeps it audible with everything
   * else at maximum.
   */
  event(kind, atTime, level) {
    if (!this.ctx || !this.cueGain) {
      return;
    }
    const t = atTime == null ? this.ctx.currentTime : atTime;
    /*
     * `level` is how hard the thing that caused this cue actually was, 0
     * to 1, and it exists because the on-screen hit text is gone: the
     * sound is now the whole of what a pilot is told about a contact, so
     * it has to say how hard as well as that it happened. Absent, every
     * cue plays at its written level, which is what every caller outside
     * the contact path wants: a gate is a gate.
     *
     * The floor is deliberate. A cue scaled to nothing is a cue the
     * player will swear did not fire, and this one is carrying the
     * message on its own.
     */
    let lv = 1;
    if (level != null && level === level) {
      lv = level < 0 ? 0 : level > 1 ? 1 : level;
      lv = 0.42 + 0.58 * lv;
    }
    /* A crash is the engine's impact. The shell's crash call knows how hard
     * but not on what, so the surface is a middling one until the contact
     * path hands its material over (docs/AUDIO.md, roll out). */
    if (kind === 'crash') {
      this.impact(4 * lv, 0.5, 12 * lv, t);
      return;
    }
    if (kind === 'gate' || kind === 'clip') {
      /*
       * The gate click, which the owner asked for by feel: a satisfying
       * click, not a beep. Two layers on the two pooled voices. The crash
       * chain plays a resonant knuckle of noise a few tens of milliseconds
       * long, and the cue oscillator drops through it like a tongue click.
       * 'clip', the frame graze penalty, is the same gesture an octave and
       * a half down with a duller filter: unmistakably the same family,
       * unmistakably not the reward.
       *
       * The click's energy sits between 2 and 5 kHz, the band the engine
       * keeps its own tones out of (engine-worklet.js, the harshness guard),
       * which is why it reads through a full throttle mix with a light duck.
       */
      const gate = kind === 'gate';
      const nf = this.crashLp.frequency;
      nf.cancelScheduledValues(t);
      nf.setValueAtTime(gate ? 4200 : 900, t);
      this.crashLp.Q.cancelScheduledValues(t);
      this.crashLp.Q.setValueAtTime(gate ? 1.6 : 0.8, t);
      const ng = this.crashGain.gain;
      ng.cancelScheduledValues(t);
      ng.setValueAtTime(0.0001, t);
      ng.exponentialRampToValueAtTime((gate ? 1.35 : 1.1) * (gate ? 1 : lv), t + 0.002);
      ng.exponentialRampToValueAtTime(0.0001, t + (gate ? 0.045 : 0.11));
      const f = this.cueOsc.frequency;
      f.cancelScheduledValues(t);
      f.setValueAtTime(gate ? 1500 : 300, t);
      f.exponentialRampToValueAtTime(gate ? 720 : 170, t + (gate ? 0.03 : 0.06));
      const g = this.cueGain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(0.0001, t);
      g.exponentialRampToValueAtTime((gate ? 0.75 : 0.6) * (gate ? 1 : lv), t + 0.003);
      g.exponentialRampToValueAtTime(0.0001, t + (gate ? 0.075 : 0.12));
      this.duckFlight(t, gate ? 0.55 : 0.5, gate ? 0.22 : 0.3);
      this.music.duckNow(t, gate ? 0.5 : 0.45, gate ? 0.25 : 0.3);
      return;
    }
    /* The blips. A landing is a low settle, a takeoff is a rising pair. */
    let hz = 620;
    let dur = 0.14;
    if (kind === 'land') {
      hz = 400;
      dur = 0.16;
    }
    const f = this.cueOsc.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(hz, t);
    if (kind === 'takeoff') {
      f.exponentialRampToValueAtTime(hz * 1.6, t + dur);
    }
    const g = this.cueGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(0.62, t + 0.004);
    g.exponentialRampToValueAtTime(0.0001, t + dur);
    this.duckFlight(t, 0.66, 0.26);
    this.music.duckNow(t, 0.6, 0.3);
  }

  /*
   * A part of the aircraft breaking, crushing or chipping, or a splash:
   * kind is 'snap', 'crunch', 'chip' or 'splash', `level` 0 to 1 how hard.
   * On the wreck's own voice, so it lays over the crash cue's thump rather
   * than replacing it. Only a snap and a splash duck the flight, and
   * lightly: a chip is a tick the motors should not dip for.
   */
  wreck(kind, level, atTime) {
    if (!this.ctx || !this.wreckGain) {
      return;
    }
    const t = atTime == null ? this.ctx.currentTime : atTime;
    const lv = level == null || level !== level ? 1 : 0.35 + 0.65 * Math.min(1, Math.max(0, level));
    /* No two the same: every break is a few percent off the last in its
     * pitch and its length. */
    const fv = 0.9 + 0.2 * this.jitter();
    const dv = 0.85 + 0.3 * this.jitter();
    const g = this.wreckGain.gain;
    const f = this.wreckBp.frequency;
    const q = this.wreckBp.Q;
    g.cancelScheduledValues(t);
    f.cancelScheduledValues(t);
    q.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    if (kind === 'snap') {
      /* Carbon and nylon fail in a crack well above the motors' band,
       * falling fast as the pieces separate. */
      f.setValueAtTime(3800 * fv, t);
      f.exponentialRampToValueAtTime(1500 * fv, t + 0.05 * dv);
      q.setValueAtTime(2.2, t);
      g.exponentialRampToValueAtTime(3.2 * lv, t + 0.0015);
      g.exponentialRampToValueAtTime(0.0001, t + 0.09 * dv);
      this.duckFlight(t, 0.5, 0.25);
      return;
    }
    if (kind === 'crunch') {
      /* Foam gives in grains: three quick bumps in the mids. */
      f.setValueAtTime(900 * fv, t);
      q.setValueAtTime(0.9, t);
      for (let k = 0; k < 3; k += 1) {
        const tk = t + k * 0.028 * dv;
        g.setValueAtTime(0.0001, tk);
        g.exponentialRampToValueAtTime((2.0 - 0.45 * k) * lv, tk + 0.004);
        g.exponentialRampToValueAtTime(0.0001, tk + 0.026);
      }
      return;
    }
    if (kind === 'chip') {
      f.setValueAtTime(3000 * fv, t);
      q.setValueAtTime(3.0, t);
      g.exponentialRampToValueAtTime(1.4 * lv, t + 0.001);
      g.exponentialRampToValueAtTime(0.0001, t + 0.025 * dv);
      return;
    }
    /* A splash: a wide burst that darkens as the water falls back. */
    f.setValueAtTime(2200 * fv, t);
    f.exponentialRampToValueAtTime(420 * fv, t + 0.55 * dv);
    q.setValueAtTime(0.6, t);
    g.exponentialRampToValueAtTime(2.2 * lv, t + 0.012);
    g.exponentialRampToValueAtTime(0.0001, t + 0.6 * dv);
    this.duckFlight(t, 0.6, 0.4);
  }

  /*
   * A combat cut: level 1 for the pilot who made it, lower for everyone
   * else who saw it. On its own voice, and through the master like every
   * cue, so the sound setting and the volume hold for it too.
   */
  schwing(level = 1, atTime) {
    if (!this.ctx || !this.schwingVoice) {
      return;
    }
    const t = atTime == null ? this.ctx.currentTime : atTime;
    const lv = Math.max(0.05, Math.min(1, level));
    const v = this.schwingVoice;
    const params = [v.scrapeBp.frequency, v.scrapeEnv.gain, v.whooshBp.frequency, v.whooshEnv.gain, v.shingEnv.gain, v.ringEnv.gain];
    for (const p of v.partials) {
      params.push(p.g.gain, ...p.oscs.map((x) => x.o.frequency));
    }
    for (const p of params) {
      p.cancelScheduledValues(t);
    }
    /* (a) The scrape, 0 to 170 ms: 900 Hz to 4.5 kHz, up to 1.3 at 50 ms. */
    v.scrapeBp.frequency.setValueAtTime(900, t);
    v.scrapeBp.frequency.exponentialRampToValueAtTime(4500, t + 0.15);
    v.scrapeEnv.gain.setValueAtTime(0.0001, t);
    v.scrapeEnv.gain.exponentialRampToValueAtTime(1.3 * lv, t + 0.05);
    v.scrapeEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
    /* (b) The whoosh: 350 Hz to 3.5 kHz over 160 ms, 1.4 at 100 ms. */
    v.whooshBp.frequency.setValueAtTime(350, t);
    v.whooshBp.frequency.exponentialRampToValueAtTime(3500, t + 0.16);
    v.whooshEnv.gain.setValueAtTime(0.0001, t);
    v.whooshEnv.gain.exponentialRampToValueAtTime(1.4 * lv, t + 0.1);
    v.whooshEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    /* (c) The shing, struck at 100 ms: 4 ms to 0.5, gone over 450 ms. */
    const at = t + 0.1;
    v.shingEnv.gain.setValueAtTime(0.0001, at);
    v.shingEnv.gain.exponentialRampToValueAtTime(0.5 * lv, at + 0.004);
    v.shingEnv.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
    /* (d) The ring, struck at 100 ms: the base swept 560 to 1150 Hz in 40
     * ms, each partial dying at its own rate, the whole 4 ms to 0.6 and
     * silent by 1.5 s. */
    for (const p of v.partials) {
      for (const { o, mult } of p.oscs) {
        o.frequency.setValueAtTime(560 * mult, at);
        o.frequency.exponentialRampToValueAtTime(1150 * mult, at + 0.04);
      }
      p.g.gain.setValueAtTime(p.amp / p.oscs.length, at);
      p.g.gain.setTargetAtTime(0.0001, at, 1 / p.rate);
    }
    v.ringEnv.gain.setValueAtTime(0.0001, at);
    v.ringEnv.gain.exponentialRampToValueAtTime(0.6 * lv, at + 0.004);
    v.ringEnv.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    this.schwings += 1;
    this.duckFlight(t, 0.7, 0.3);
  }

  /*
   * The crown changing hands in Catch the Ace: level 1 for the new Ace,
   * lower for everyone else. On its own voice, through the master.
   */
  coin(level = 1, atTime) {
    if (!this.ctx || !this.coinVoice) {
      return;
    }
    const t = atTime == null ? this.ctx.currentTime : atTime;
    const lv = (COIN_PEAK / SCRAPE_GATE_AMP) * Math.max(0.05, Math.min(1, level));
    const { osc, env } = this.coinVoice;
    const g = env.gain;
    osc.frequency.cancelScheduledValues(t);
    g.cancelScheduledValues(t);
    osc.frequency.setValueAtTime(COIN_B5, t);
    osc.frequency.setValueAtTime(COIN_E6, t + COIN_STEP_S);
    /* The B5 at 0.7 of the E6, as the approved render has it, each note
     * with a millisecond's attack so neither clicks in. */
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(0.7 * lv, t + 0.001);
    g.setValueAtTime(0.7 * lv, t + COIN_STEP_S);
    g.linearRampToValueAtTime(lv, t + COIN_STEP_S + 0.001);
    g.setTargetAtTime(0, t + COIN_STEP_S + 0.001, COIN_DECAY_S);
    /* The render stops the E6 at 500 ms; a 5 ms fade instead of its
     * step, so the end does not click. */
    const end = t + COIN_STEP_S + COIN_E6_S;
    g.setValueAtTime(lv * Math.exp(-(COIN_E6_S - 0.001) / COIN_DECAY_S), end);
    g.linearRampToValueAtTime(0, end + 0.005);
    osc.frequency.setValueAtTime(SCRAPE_GATE_HZ, end + 0.006);
    this.coins += 1;
    this.duckFlight(t, 0.6, 0.3);
  }

  /*
   * An explosion in a war (src/render/explosion.js): `level` 0 to 1, 1 for
   * this pilot's own warhead, and `distM` how far off it went, metres.
   * A thump (the ring's fundamental pair retuned to a falling sub bass), a
   * roar (the whoosh band swept down), a crack at the front (the shing
   * band, only near) and a crackle tail (the scrape's noise, its gate
   * stepped between irregular low rates so it spits rather than buzzes).
   * Far off it arrives late, at the speed of sound, darker and quieter.
   *
   * NO NEW NODES: the graph stands at its budget of 64 (tests/thresholds.
   * json max_nodes), so this plays on the SCHWING's and the coin's voice,
   * which a war never uses (a room runs one game at a time), and puts
   * back the two settings those read without setting (the shing's band
   * and the gate's rate) once it is done.
   */
  boom(level = 1, distM = 0, atTime) {
    if (!this.ctx || !this.schwingVoice) {
      return;
    }
    const now = atTime == null ? this.ctx.currentTime : atTime;
    const d = Math.max(0, distM);
    const t = now + Math.min(2.5, d / 343);
    const lv = Math.max(0.05, Math.min(1, level)) / (1 + d / 250);
    const near = Math.max(0, 1 - d / 400);
    /* A far one has lost its top: every band a fraction lower. */
    const dark = 0.45 + 0.55 * near;
    const v = this.schwingVoice;
    const gate = this.coinVoice.osc.frequency;
    const params = [v.scrapeBp.frequency, v.scrapeEnv.gain, v.whooshBp.frequency, v.whooshEnv.gain, v.shingEnv.gain, v.ringEnv.gain, gate];
    for (const p of v.partials) {
      params.push(p.g.gain, ...p.oscs.map((x) => x.o.frequency));
    }
    for (const p of params) {
      p.cancelScheduledValues(now);
    }
    this.coinVoice.env.gain.cancelScheduledValues(now);
    this.coinVoice.env.gain.setValueAtTime(0, now);
    /* The thump: 110 Hz falling to 38 in a third of a second. */
    for (const [k, p] of v.partials.entries()) {
      p.g.gain.setValueAtTime(k === 0 ? 0.5 : 0, t);
      if (k === 0) {
        for (const { o } of p.oscs) {
          o.frequency.setValueAtTime(110, t);
          o.frequency.exponentialRampToValueAtTime(38, t + 0.35);
        }
      }
    }
    v.ringEnv.gain.setValueAtTime(0.0001, t);
    v.ringEnv.gain.exponentialRampToValueAtTime(1.8 * lv, t + 0.008);
    v.ringEnv.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    /* The roar: a wide band from 700 Hz down to 140 over 1.4 s. */
    v.whooshBp.frequency.setValueAtTime(700 * dark, t);
    v.whooshBp.frequency.exponentialRampToValueAtTime(140, t + 1.4);
    v.whooshEnv.gain.setValueAtTime(0.0001, t);
    v.whooshEnv.gain.exponentialRampToValueAtTime(2.4 * lv, t + 0.012);
    v.whooshEnv.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    /* The crack, only close. */
    v.shingBp.frequency.setValueAtTime(2600, t);
    v.shingEnv.gain.setValueAtTime(0.0001, t);
    if (near > 0) {
      v.shingEnv.gain.exponentialRampToValueAtTime(Math.max(0.0002, 3.0 * lv * near), t + 0.002);
      v.shingEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    }
    v.shingBp.frequency.setValueAtTime(6500, t + 0.5);
    /* The crackle: the scrape's band falling, its gate stepped at
     * irregular rates for 2.5 s, then back at its own. */
    v.scrapeBp.frequency.setValueAtTime(3200 * dark, t);
    v.scrapeBp.frequency.exponentialRampToValueAtTime(900, t + 2.6);
    v.scrapeEnv.gain.setValueAtTime(0.0001, t);
    v.scrapeEnv.gain.exponentialRampToValueAtTime(1.1 * lv, t + 0.25);
    v.scrapeEnv.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
    let s = 0x9e3779b9;
    for (let k = 0; k < 24; k += 1) {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      gate.setValueAtTime(11 + 38 * ((s >>> 8) / 16777216), t + k * 0.11);
    }
    gate.setValueAtTime(SCRAPE_GATE_HZ, t + 2.9);
    this.booms += 1;
    this.duckFlight(t, 0.35 + 0.35 * (1 - lv), 1.2);
    this.duckAction(t, 0.4 + 0.4 * (1 - lv), 1.6);
  }

  /*
   * Menu sounds: the same click family as the gate, small and dry. kind is
   * 'move', 'adjust', 'select' or 'back'. Runs on the same two pooled cue
   * voices, so it creates nothing; it never ducks anything, because a menu
   * is not a race. Quiet by design: these are fingernail taps, and the row
   * under the pointer is the loudest thing a menu should ever say.
   */
  ui(kind) {
    if (!this.ctx || !this.cueGain || !this.enabled) {
      return;
    }
    const t = this.ctx.currentTime;
    let oscHz = 1900;
    let oscTo = 0;
    let oscPeak = 0.085;
    let oscDur = 0.030;
    let nHz = 5200;
    let nPeak = 0.10;
    let nDur = 0.016;
    if (kind === 'select') {
      oscHz = 1350;
      oscTo = 850;
      oscPeak = 0.16;
      oscDur = 0.055;
      nHz = 4400;
      nPeak = 0.18;
      nDur = 0.028;
    } else if (kind === 'adjust') {
      oscHz = 2100;
      oscPeak = 0.10;
      oscDur = 0.035;
      nPeak = 0.12;
      nDur = 0.018;
    } else if (kind === 'back') {
      oscHz = 950;
      oscTo = 700;
      oscPeak = 0.12;
      oscDur = 0.05;
      nHz = 3400;
      nDur = 0.022;
    }
    const nf = this.crashLp.frequency;
    nf.cancelScheduledValues(t);
    nf.setValueAtTime(nHz, t);
    this.crashLp.Q.cancelScheduledValues(t);
    this.crashLp.Q.setValueAtTime(1.3, t);
    const ng = this.crashGain.gain;
    ng.cancelScheduledValues(t);
    ng.setValueAtTime(0.0001, t);
    ng.exponentialRampToValueAtTime(nPeak, t + 0.0015);
    ng.exponentialRampToValueAtTime(0.0001, t + nDur);
    const f = this.cueOsc.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(oscHz, t);
    if (oscTo > 0) {
      f.exponentialRampToValueAtTime(oscTo, t + oscDur * 0.6);
    }
    const g = this.cueGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(oscPeak, t + 0.002);
    g.exponentialRampToValueAtTime(0.0001, t + oscDur);
  }

  /*
   * Pull the motors and the wind down so a cue can be heard through them, then
   * let them back up. Depth and duration in the caller, because a crash needs
   * more than a gate does.
   */
  duckFlight(atTime, depth, seconds) {
    if (!this.flightDuck) {
      return;
    }
    duckParam(this.flightDuck.gain, atTime, depth, seconds, 0.010);
  }

  /*
   * The engine's per frame state, as AudioParams on the engine node so an
   * offline render schedules it sample accurately. `air`, when given, is
   * { u, v, w, amps, dist, dist2, pan, flapsMoving, gearMoving }: body frame
   * velocity, m/s, the pack current, A, an off board listener's distance,
   * ground reflection path and pan, and whether the flaps and the gear are
   * travelling this frame. Without it the airspeed is taken as straight
   * ahead and the listener as on board.
   */
  updateEngine(rpm, speed, t, air) {
    const node = this.engine;
    if (!node) {
      return;
    }
    const p = node.parameters;
    const set = (name, v, tau) => {
      p.get(name).setTargetAtTime(Number.isFinite(v) ? v : 0, t, tau);
    };
    for (let m = 0; m < 4; m += 1) {
      set(`rpm${m}`, Math.max(0, rpm[m]), 0.012);
    }
    const a = air || null;
    set('u', a ? a.u : speed, 0.03);
    set('v', a ? a.v : 0, 0.03);
    set('w', a ? a.w : 0, 0.03);
    set('amps', a ? a.amps : 0, 0.05);
    set('servo', a && a.flapsMoving ? 1 : 0, 0.02);
    set('retract', a && a.gearMoving ? 1 : 0, 0.02);
    /* Distance moves as a straight line between frames, not as a lag:
     * a lagged distance is a lagged delay, and its Doppler would be wrong. */
    for (const k of ['dist', 'dist2', 'pan']) {
      const v = a && Number.isFinite(a[k]) ? a[k] : 0;
      if (this.engineLinked) {
        p.get(k).linearRampToValueAtTime(v, t);
      } else {
        p.get(k).setValueAtTime(v, t);
      }
    }
    this.engineLinked = true;
  }

  /*
   * PUBLIC API: an impact on the pilot's own aircraft. `impulse` N s, the
   * surface's `hardness` 0..1 (sim_material_info), the closing `speed` m/s.
   * A rising edge on the engine's impact param; it ducks the flight, the
   * music and the ambience.
   */
  impact(impulse, hardness, speed, atTime) {
    if (!this.engine) {
      return;
    }
    const t = atTime == null ? this.ctx.currentTime : atTime;
    const p = this.engine.parameters;
    p.get('hardness').setValueAtTime(hardness, t);
    p.get('impactSpeed').setValueAtTime(speed, t);
    p.get('impact').setValueAtTime(Math.max(1e-3, impulse), t);
    p.get('impact').setValueAtTime(0, t + 0.03);
    this.duckFlight(t, 0.35, 0.5);
    this.duckAction(t, 0.3, 0.55);
  }

  /*
   * PUBLIC API: a one shot mechanism of the pilot's aircraft, on the
   * Effects bus: 'gear' (a leg locking), 'catapult' (the shuttle's
   * release), 'parachute' (the hatch and the canopy filling). The flaps'
   * servos and the retracts' motor while they move are update()'s `air`
   * (flapsMoving, gearMoving). Unknown kinds throw.
   */
  mechanical(kind, atTime) {
    const code = MECH_KINDS[kind];
    if (!code) {
      throw new Error(`audio: no mechanism named ${kind}`);
    }
    if (!this.engine) {
      return;
    }
    const t = atTime == null ? this.ctx.currentTime : atTime;
    const p = this.engine.parameters;
    p.get('mech').setValueAtTime(code, t);
    p.get('mech').setValueAtTime(0, t + 0.03);
  }

  /*
   * PUBLIC API: a prop strike on the pilot's aircraft: `level` 0 to 1, the
   * surface's `hardness` 0 to 1. The blades tick at the rate the motors
   * were turning, slowing.
   */
  propStrike(level, hardness, atTime) {
    if (!this.engine) {
      return;
    }
    const t = atTime == null ? this.ctx.currentTime : atTime;
    const p = this.engine.parameters;
    p.get('hardness').setValueAtTime(hardness, t);
    p.get('strike').setValueAtTime(Math.max(0.01, Math.min(1, level)), t);
    p.get('strike').setValueAtTime(0, t + 0.03);
  }

  /*
   * PUBLIC API: duck the music and the ambience under action, depth 0..1
   * (the gain at the bottom), recovering over `seconds`. Deeper wins over
   * a duck already running (duckParam). For the world's explosions as well
   * as for this file's.
   */
  duckAction(atTime, depth, seconds) {
    if (!this.ambienceDuck) {
      return;
    }
    const t = atTime == null ? this.ctx.currentTime : atTime;
    this.music.duckNow(t, depth, seconds);
    duckParam(this.ambienceDuck.gain, t, depth, seconds, 0.010);
  }

  /*
   * PUBLIC API, once a frame: rpm is the four motor RPM values (a fixed
   * wing's engine in slot 0), speed the airspeed in m/s, atTime the context
   * time to schedule at (omitted live: ctx.currentTime), air the body frame
   * state updateEngine reads.
   */
  update(rpm, speed, atTime, air) {
    if (!this.ctx || !this.master) {
      return;
    }
    if (atTime == null) {
      this.watchClock();
    }
    const t = atTime == null ? this.ctx.currentTime : atTime;
    const target = this.enabled ? this.level * MASTER_CEILING : 0.0;
    this.master.gain.setTargetAtTime(target, t, 0.05);
    if (!this.enabled) {
      this.music.pause();
      return;
    }
    this.updateEngine(rpm, speed, t, air);
    /* The bed. Ticked from here so a paused element is restarted while
     * the mix is live. */
    this.music.tick(t);
  }
}
