/*
 * world-worklet.js: everything in the world that makes a sound and is not
 * the pilot's own aircraft, one AudioWorkletProcessor (docs/AUDIO.md,
 * section 12, "the world").
 *
 * Why one node: the live graph's budget is 64 nodes (tests/thresholds.json
 * audio-bed max_nodes). A war has up to 120 attackers, a valley a dozen
 * vehicles; a node, let alone a chain, per source would be hundreds. Here
 * every source is a voice inside one processor, and the graph pays one node.
 *
 * TRANSPORT. Sources move on the main thread; their state comes here as
 * timestamped frames over the port (WorldAudio in src/render/world-audio.js
 * posts them), never as AudioParams, because a war has more sources than a
 * node can have params. A frame is stamped with the context time it
 * describes, and this processor reads every source's state at the time
 * its sound left it, interpolating between the frames it holds. So the
 * live page, which posts a frame as it draws one, and an offline render,
 * which posts the whole timeline before it starts, run exactly the same
 * code and hear the same samples (tools/audio/world.js proves it in Node).
 *
 * PROPAGATION, per voice, with no delay line: a voice is synthesised at
 * the source's RETARDED time, te = t - d(te) / c, solved by two fixed
 * point steps. Its phases advance at the source's own frequencies times
 * dte / dt, which is the Doppler factor exactly, from the same mechanism
 * that makes the arrival delay. Then spherical spreading, air absorption as
 * a lowpass whose corner falls with distance (the engine's ISO 9613-1 fit),
 * the ground's image through a short line (the comb of every real fly by),
 * an equal power pan and a darker far ear behind the head.
 *
 * CULLING. A fixed pool of voices goes to the sources loudest at the
 * listener, re-chosen every quantum with a hysteresis so a voice is not
 * traded back and forth; a voice that loses its source fades out. Every
 * other source is folded into a far bed per kind: its summed power at its
 * mean pan and distance, as a few detuned partials of the kind's note.
 * A swarm at two kilometres is a drone, not sixty engines.
 *
 * Outputs, each stereo: 0 other aircraft and vehicles, 1 ambience, 2
 * effects (explosions). MotorAudio.attachWorld(node) puts them on their
 * buses so the settings sliders keep meaning what they say.
 *
 * Determinism: every noise is a seeded integer xorshift; every source and
 * every explosion draws its own seed from its id, never from a clock. Not
 * the physics path, so Math.sin is allowed here (CLAUDE.md's rule is about
 * the plant).
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

import { KINDS as KIND_NAMES, WORLD_KINDS, SOURCE_STRIDE } from './world-kinds.js';
import { guard } from './worklet-guard.js';

const TAU = 2 * Math.PI;
/* Speed of sound, m/s, at 20 C. */
const C_AIR = 343;
/* The distance, metres, a source is heard at its own `lufs16` (its level in
 * world-kinds.js). The engine's REF_M: another aircraft at 16 m is as loud
 * as the pilot's own on board. */
const REF_M = 16;
/* Nearer than this a source is not louder: a car passing a hovering quad
 * at 2 m would otherwise be 18 dB over its 16 m figure, a jump scare,
 * not a pass. */
const NEAR_M = 6;
/* Past this a source is not voiced or bedded at all, metres. */
const FAR_M = 4000;
/* How long a source's sound outlives its last frame, s: its last sound is
 * still on the way, and then it fades rather than stops. */
const TAIL_S = 0.08;
/* A history keeps a row every HIST_DT seconds and forgets rows HIST_KEEP_S
 * behind the audio clock: 6 s is a source 2 km away heard from where it
 * was. Farther than that its oldest row is used. */
const HIST_DT = 0.05;
const HIST_KEEP_S = 6;
/* The ground image's line, samples: 85 ms, a path difference of 29 m,
 * more than a source 100 m up gives an ear 1.7 m up at any distance it is
 * loud at. A longer one is not tapped. */
const REFL_LEN = 4096;
/* A source holding a voice keeps it unless another is this many times
 * louder (about 3 dB): the hysteresis that stops two sources at the same
 * distance trading one voice every quantum. */
const KEEP = 2;
/* Voice fade in and out, s. */
const FADE_S = 0.06;
const FLUSH = 1e-20;
/* The mains a transformer's arc buzzes on twice of: Itaipu's switchyard
 * is on the Paraguayan side, 50 Hz. */
const MAINS_HZ = 50;
/* The far bed runs at this fraction of the rate (renderFar). */
const FAR_DECIMATE = 4;
/* The load guard (WorldProcessor.meter): the share of the audio's own
 * time the worklet may take, the render cost bar of tools/audio/world.js;
 * the quanta a measurement spans; the cool windows before a step back;
 * and the steps it sheds through, the voice pool, the ambience's pool
 * and whether the far bed keeps its partials. The first is the full pool: the full war (120
 * attackers and a boom every half second, tools/audio/world-scenes.js
 * war-full) renders under the cost bar with it on Chromium's worklet
 * (tools/audio/world.js --browser; docs/AUDIO.md section 12). */
const LOAD_BUDGET = 0.25;
/* The ambience's voices while the moving sources outnumber theirs. */
const BEDS_MASKED = 3;
const GUARD_QUANTA = 128;
const GUARD_COOL = 4;
const SHED = [
  { voices: 14, beds: 8, bedPartials: true },
  { voices: 10, beds: 6, bedPartials: false },
  { voices: 6, beds: 4, bedPartials: false },
  { voices: 4, beds: 3, bedPartials: false },
];
/* An explosion's trim, set by measurement (tools/audio/world.js): a
 * warhead (level 0.67) at 40 m reads momentary -14.6 LUFS in the Node mix
 * and -15.3 through the live graph, whose limiter takes the difference,
 * at the default volume: under the near explosion's -12, and its 2 to
 * 5 kHz share under the bar for every seed. */
const BLAST_GAIN = 1.8;
/* A breach's trim, by the same measurement (tools/audio/world.js): 10 t of
 * concrete breaking 60 m off reads momentary -16 LUFS or so, under a near
 * explosion, since a warhead is what broke it. */
const BREACH_GAIN = 1;

/* One cycle of a sine, tabled: the voices run hundreds of partials a
 * sample at a full war, and a lookup with linear interpolation is a few
 * times cheaper than Math.sin and 100 dB clean at this size. */
const SIN_N = 4096;
const SIN = new Float32Array(SIN_N + 1);
for (let i = 0; i <= SIN_N; i += 1) {
  SIN[i] = Math.sin((TAU * i) / SIN_N);
}
/* sin(2 pi ph), ph in cycles, any sign. */
function sinC(ph) {
  const x = (ph - Math.floor(ph)) * SIN_N;
  const i = x | 0;
  return SIN[i] + (SIN[i + 1] - SIN[i]) * (x - i);
}
/* The blowdown pulse over one firing cycle, exp(-phi / 0.05) sin(2 pi phi
 * / 0.14) (the engine's piston model), tabled the same way. */
const BD_N = 2048;
const BD = new Float32Array(BD_N + 1);
for (let i = 0; i <= BD_N; i += 1) {
  const phi = i / BD_N;
  BD[i] = Math.exp(-phi / 0.05) * Math.sin((TAU * phi) / 0.14);
}

/* A quad's prop over one blade pass: the pass and two harmonics. */
const ROTOR_N = 1024;
const ROTOR = new Float32Array(ROTOR_N + 1);
for (let i = 0; i <= ROTOR_N; i += 1) {
  const th = i / ROTOR_N;
  ROTOR[i] = sinC(th) + 0.35 * sinC(2 * th + 0.11) + 0.12 * sinC(3 * th + 0.3);
}
/* The far bed's note: four harmonics falling an octave each. */
const FAR = new Float32Array(ROTOR_N + 1);
for (let i = 0; i <= ROTOR_N; i += 1) {
  const th = i / ROTOR_N;
  FAR[i] = sinC(th) + 0.5 * sinC(2 * th) + 0.25 * sinC(3 * th) + 0.12 * sinC(4 * th);
}
/* A cow's bell: a hammered bell's four partials, their levels and their
 * decays, s (ESTIMATED, a 10 cm Swiss Treichel class bell). */
const BELL_RATIO = [1, 1.56, 2.18, 3.12];
const BELL_AMP = [1, 0.6, 0.4, 0.25];
const BELL_DECAY = [0.55, 0.32, 0.2, 0.12];
/* A bird's three shapes: a falling whistle (a blackbird's or a thrush's
 * phrase), a trill, a run of rising chirps; a note's length and the gap
 * after it, s, its sweep over the note, its trill rate, its pitch, Hz.
 * Songbirds sing between 2 and 8 kHz; these sit low in that. */
const SONGS = [
  { len: 0.22, gap: 0.12, sweep: -0.25, trill: 0, hz: 2600 },
  { len: 0.6, gap: 0.3, sweep: 0.05, trill: 28, hz: 4200 },
  { len: 0.05, gap: 0.06, sweep: 0.6, trill: 0, hz: 3100 },
];
/* A prop's own table, built per voice at bind: one revolution. */
const PROP_N = 1024;

/* Whether a[at .. at + n) are all finite numbers. */
function finiteRow(a, at, n) {
  for (let i = at; i < at + n; i += 1) {
    if (!Number.isFinite(a[i])) {
      return false;
    }
  }
  return true;
}

/* xorshift32, uniform in [-1, 1). */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 2147483648 - 1;
  };
}

/* A seed from an integer id, so the same source is the same engine every
 * run (splitmix32's finaliser). */
function hash(x) {
  let h = (x | 0) + 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/* Chamberlin state variable filter, kept below rate / 6 so it is stable. */
class Svf {
  constructor() {
    this.lo = 0;
    this.bp = 0;
  }

  run(x, f, q) {
    this.lo += f * this.bp;
    const hi = x - this.lo - q * this.bp;
    this.bp += f * hi;
    if (Math.abs(this.lo) < FLUSH) {
      this.lo = 0;
    }
    if (Math.abs(this.bp) < FLUSH) {
      this.bp = 0;
    }
    return hi;
  }
}
function svfF(hz, rate) {
  return 2 * Math.sin(Math.PI * Math.min(hz, rate / 6) / rate);
}
function onePole(hz, rate) {
  return 1 - Math.exp((-TAU * hz) / rate);
}

/* A two pole resonator with unity gain at its peak (engine-worklet.js
 * Mode, which says why). */
class Mode {
  constructor() {
    this.y1 = 0;
    this.sinW = 0;
    this.y2 = 0;
    this.a1 = 0;
    this.a2 = 0;
    this.b0 = 0;
  }

  tune(hz, decayS, rate) {
    const r = Math.exp(-1 / (decayS * rate));
    const w = (TAU * Math.min(hz, rate / 2.5)) / rate;
    this.sinW = Math.sin(w);
    this.a1 = 2 * r * Math.cos(w);
    this.a2 = -r * r;
    this.b0 = (1 - r) * Math.sqrt(1 - 2 * r * Math.cos(2 * w) + r * r);
  }

  /* Struck: a decaying sine of amplitude a starts from here, on top of
   * whatever still rings (an impulse through the unity peak gain above
   * would be b0 small, a few hundred times too quiet). */
  strike(a) {
    this.y1 += a * this.sinW;
  }

  run(x) {
    const y = this.b0 * x + this.a1 * this.y1 + this.a2 * this.y2;
    this.y2 = this.y1;
    this.y1 = Math.abs(y) < FLUSH ? 0 : y;
    return y;
  }
}

/*
 * The explosions' soft knee: linear to KNEE_T, then bending toward KNEE_K
 * and never past it. A near blast is a few milliseconds of noise peaks 14
 * dB over its own loudness; at the momentary level it is meant to have,
 * those peaks would cross full scale. Rounding them here, where they are
 * made, keeps the loudness and the true peak bar both, rather than handing
 * the master limiter a transient its 2 ms attack lets through. In the
 * worklet's units, which the effects bus at its default hands the limiter
 * as they are: the knee starts at the limiter's threshold (-6 dBFS) and
 * never passes -0.9 dBFS.
 */
const KNEE_T = 0.5;
const KNEE_K = 0.9;
function knee(x) {
  const a = x < 0 ? -x : x;
  if (a <= KNEE_T) {
    return x;
  }
  const over = a - KNEE_T;
  const y = KNEE_T + over / (1 + over / (KNEE_K - KNEE_T));
  return x < 0 ? -y : y;
}

/* Spreading to d metres against REF_M, never nearer than NEAR_M (or the
 * kind's own `near`, for a source as big as a spillway or a town): a point
 * source's 1 / d, a line's or an area's (a river, a shore, a power line
 * heard from its nearest point; a spillway; a town) 1 / sqrt(d), 3 dB a
 * doubling. */
function spread(spec, d) {
  const r = REF_M / Math.max(spec.near || NEAR_M, d);
  return spec.line ? Math.sqrt(r) : r;
}

/* Air absorption's lowpass corner at d metres: engine-worklet.js's fit to
 * ISO 9613-1 (20 C, 50 percent), within a few dB from 10 to 300 m. */
function absorbHz(d) {
  return Math.min(20000, 24000 * (10 / Math.max(10, d)) ** 0.7);
}

/*
 * A history of timed rows (t, then `w` numbers), kept a row every HIST_DT
 * and pruned to HIST_KEEP_S behind the audio clock. Live, frames arrive as
 * they are drawn and it holds a few seconds; an offline render posts its
 * whole timeline first and it holds all of it until the clock passes.
 * Rows are found by bisection.
 */
class History {
  constructor(w) {
    this.w = w;
    this.s = w + 1;
    this.h = new Float64Array(64 * this.s);
    this.start = 0;
    this.end = 0;
  }

  push(t, row) {
    const s = this.s;
    let o = this.end * s;
    /* Within a row's spacing the newest replaces the last kept one, so the
     * history is sparse in time but always ends at the newest frame. */
    if (this.end - this.start > 1 && t - this.h[(this.end - 2) * s] < HIST_DT) {
      o = (this.end - 1) * s;
    } else {
      if (o + s > this.h.length) {
        this.compact();
        o = this.end * s;
      }
      this.end += 1;
    }
    this.h[o] = t;
    for (let k = 0; k < this.w; k += 1) {
      this.h[o + 1 + k] = row[k];
    }
  }

  compact() {
    const s = this.s;
    const live = this.end - this.start;
    const h = live * s * 2 > this.h.length ? new Float64Array(this.h.length * 2) : this.h;
    h.set(this.h.subarray(this.start * s, this.end * s));
    this.h = h;
    this.start = 0;
    this.end = live;
  }

  /* Forget rows older than t, keeping one at or before it. */
  prune(t) {
    const s = this.s;
    while (this.end - this.start > 2 && this.h[(this.start + 1) * s] <= t) {
      this.start += 1;
    }
  }

  /* The last row at or before t, by bisection; the oldest if none. */
  find(t) {
    const s = this.s;
    let lo = this.start;
    let hi = this.end - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.h[mid * s] <= t) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  }

  /* Row i's time and the row after it, linearly, at t into out. */
  lerp(t, out) {
    const s = this.s;
    const i = this.find(t);
    const a = i * s;
    const h = this.h;
    if (i === this.end - 1 || h[a] >= t) {
      for (let k = 0; k < this.w; k += 1) {
        out[k] = h[a + 1 + k];
      }
      return out;
    }
    const b = a + s;
    const u = (t - h[a]) / (h[b] - h[a]);
    for (let k = 0; k < this.w; k += 1) {
      out[k] = h[a + 1 + k] + (h[b + 1 + k] - h[a + 1 + k]) * u;
    }
    return out;
  }
}

/*
 * One source's track: its kind, and a history of (t, position, velocity,
 * drive): `drive` is what a source's level and character follow when not
 * its speed (a breach's discharge, m3/s), 0 for the rest.
 * Positions are scene world metres, y up (src/render/frame.js), the frame
 * every caller already has; nothing here converts.
 */
class Track {
  constructor(id, kind) {
    this.id = id;
    this.kind = kind;
    this.seed = hash(id * 31 + kind);
    this.hist = new History(7);
    this.row = new Float64Array(7);
    this.seen = -Infinity;
    this.first = Infinity;
    this.voice = null;
    this.loud = 0;
    this.dNow = 0;
  }

  push(t, x, y, z, vx, vy, vz, drive) {
    const r = this.row;
    r[6] = drive;
    r[0] = x;
    r[1] = y;
    r[2] = z;
    r[3] = vx;
    r[4] = vy;
    r[5] = vz;
    this.hist.push(t, r);
    this.seen = Math.max(this.seen, t);
    this.first = Math.min(this.first, t);
  }

  /* The state at time t into out [x, y, z, vx, vy, vz, drive]: cubic Hermite
   * between the two rows either side (positions and velocities, so a
   * 20 Hz history still turns smoothly), on from the newest along its
   * velocity for at most 0.25 s, or the oldest before it. */
  at(t, out) {
    const H = this.hist;
    const h = H.h;
    const s = H.s;
    const i = H.find(t);
    const a = i * s;
    if (i === H.end - 1 || h[a] > t) {
      const ahead = h[a] > t ? 0 : Math.min(0.25, t - h[a]);
      for (let k = 0; k < 3; k += 1) {
        out[k] = h[a + 1 + k] + h[a + 4 + k] * ahead;
        out[k + 3] = h[a + 4 + k];
      }
      out[6] = h[a + 7];
      return out;
    }
    const b = a + s;
    const dt = h[b] - h[a];
    const u = dt > 0 ? (t - h[a]) / dt : 0;
    const u2 = u * u;
    const u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1;
    const h10 = u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2;
    const h11 = u3 - u2;
    for (let k = 0; k < 3; k += 1) {
      out[k] = h00 * h[a + 1 + k] + h10 * dt * h[a + 4 + k] + h01 * h[b + 1 + k] + h11 * dt * h[b + 4 + k];
      out[k + 3] = h[a + 4 + k] + (h[b + 4 + k] - h[a + 4 + k]) * u;
    }
    out[6] = h[a + 7] + (h[b + 7] - h[a + 7]) * u;
    return out;
  }
}

/*
 * THE SOURCE MODELS. One synthesiser class drives every kind; the kind's
 * table in world-kinds.js says which parts it has and their numbers:
 *
 *   firing    an engine's exhaust pulses at cylinders x rpm / 60 / (2 for a
 *             four stroke), each cycle a little different (Heywood 1988,
 *             9.4), ringing a muffler's resonances
 *   prop      a propeller's blade pass and harmonics, its broadband chopped
 *             at the blade pass
 *   electric  a motor's whine at (poles / 2) times the shaft rate
 *   mesh      a gearbox's teeth passing
 *   rotors    four small props a few percent apart, beating (a quad)
 *   knock     a diesel's combustion tick on each firing
 *   tyres     rolling noise, a band near 1 kHz, level with speed
 *   rope      a gondola cabin's haul rope rumble
 *   water     a hull's wash and slap, level with speed
 *
 * and the ambience's (output 1, spec.bed):
 *
 *   roar      falling water: a spillway, a waterfall
 *   flow      running water and its bubbles
 *   lap       small waves on a shore
 *   hum       a town far off, its murmur and its mains
 *   corona    a high voltage line's hum and crackle
 *   bell      a cow's bell, struck as it moves
 *   song      a bird's phrases
 *   chirp     a cricket; croak, a frog; buzz, a cicada
 *
 * Everything is synthesised at the source's own time and frequencies times
 * the Doppler factor `dop`, so a pass falls in pitch as it does outside.
 */
class Voice {
  constructor(rate) {
    this.rate = rate;
    this.track = null;
    this.fade = 0;
    this.fadeTo = 0;
    this.teEnd = 0;
    this.distPrev = -1;
    this.panPrev = 0;
    this.gainPrev = 0;
    this.muff = [new Mode(), new Mode(), new Mode()];
    this.knock = new Mode();
    this.bb = new Svf();
    this.wash = new Svf();
    this.tyre = new Svf();
    this.rope = new Svf();
    this.roarLo = new Svf();
    this.roarMid = new Svf();
    this.roarHi = new Svf();
    this.flowBand = new Svf();
    this.bubble = new Mode();
    this.lapBand = new Svf();
    this.clop = new Mode();
    this.humBand = new Svf();
    this.crackBand = new Svf();
    this.bellModes = [new Mode(), new Mode(), new Mode(), new Mode()];
    this.croak = new Mode();
    this.absorb = 0;
    this.reflAbsorb = 0;
    this.back = [0, 0];
    this.line = new Float32Array(REFL_LEN);
    this.lineAt = 0;
    this.rotor = new Float64Array(4);
    this.rotorRpm = new Float64Array(4);
    this.propWave = new Float32Array(PROP_N + 1);
  }

  /* A new source on this voice: its engine's character from its seed. */
  bind(track, spec) {
    this.track = track;
    this.spec = spec;
    const r = rng(track.seed);
    this.nz = rng(track.seed ^ 0x5bd1e995);
    /* This one's own engine: a few percent off the kind's rpm (no two in a
     * swarm turn alike, which is the beating that makes a swarm a swarm),
     * its own muffler tuning and prop imbalance. */
    this.rpmTrim = 1 + 0.06 * r();
    this.cycle = Math.abs(r());
    this.cycleAmp = 1;
    this.cycleLag = 0;
    this.pulse = 0;
    this.shaft = Math.abs(r());
    this.whine = Math.abs(r());
    this.muffTrim = [1 + 0.05 * r(), 1 + 0.05 * r(), 1 + 0.05 * r()];
    /* The prop's harmonics: the blade pass and its overtones falling as
     * their order to the 1.8, the shaft orders between them a few percent
     * (blade to blade imbalance), each with its own phase and weight. */
    this.propWave.fill(0);
    if (spec.blades) {
      for (let k = 1; k <= 8; k += 1) {
        const ph = Math.abs(r());
        const w = 0.5 + 0.5 * Math.abs(r());
        const a = w * (k % spec.blades === 0 ? 1 / (k / spec.blades) ** 1.8 : 0.05 / k);
        for (let i = 0; i <= PROP_N; i += 1) {
          this.propWave[i] += a * sinC((k * i) / PROP_N + ph);
        }
      }
    }
    this.slap = 0;
    this.roarScale = 1;
    this.meshPh = 0;
    this.swing = Math.abs(r());
    /* The ambience's parts: their states, and what of each is this
     * source's own (a bell's pitch, a bird's species and pitch, a
     * cricket's tone, a frog's throat). */
    this.surge = 0;
    this.lapIn = Math.abs(r()) * this.rate;
    this.lapEnv = 0;
    this.mains = 0;
    this.crackEnv = 0;
    this.tone = 0;
    this.am = 0;
    const bellHz = 420 + 340 * Math.abs(r());
    for (let q = 0; q < 4; q += 1) {
      this.bellModes[q].tune(bellHz * BELL_RATIO[q] * (1 + 0.02 * r()), BELL_DECAY[q] * (0.8 + 0.4 * Math.abs(r())), this.rate);
    }
    this.songShape = SONGS[Math.floor(Math.abs(r()) * SONGS.length) % SONGS.length];
    this.songHz = this.songShape.hz * (1 + 0.15 * r());
    this.noteT = 0;
    this.noteLen = 0;
    this.notesLeft = 0;
    this.gapT = Math.abs(r()) * 3;
    this.chirpT = Math.abs(r()) * 0.4;
    this.chirpGap = 0.4;
    this.chirpHz = 4200 + 800 * Math.abs(r());
    this.croakT = Math.abs(r()) * 2;
    this.croakGap = 2;
    this.croakHz = 380 + 260 * Math.abs(r());
    this.buzzT = 0;
    this.buzzOn = r() > 0;
    this.buzzLen = 1 + 4 * Math.abs(r());
    this.buzzHz = 5200 + 900 * Math.abs(r());
    this.speed = undefined;
    for (let m = 0; m < 4; m += 1) {
      this.rotor[m] = Math.abs(r());
      this.rotorRpm[m] = 1 + 0.035 * r();
    }
    this.rpm = 0;
    this.load = 0.5;
    this.distPrev = -1;
    this.fade = 0;
    this.fadeTo = 1;
    this.absorb = 0;
    this.reflAbsorb = 0;
    this.back[0] = 0;
    this.back[1] = 0;
    this.line.fill(0);
    this.teEnd = 0;
  }

  /*
   * The engine's state at the emission time, `state` [x, y, z, vx, vy,
   * vz]: its rpm, its load and its level.
   *
   *   a road vehicle (gears)  rpm climbs through each gear with the speed
   *                           and drops at the change up, idles at a
   *                           standstill; its load is how hard it is
   *                           accelerating, so a bus pulling away from its
   *                           stop is loud and one coasting in is not
   *   a machine (fixed)       its rpm, whatever its speed: a generator, a
   *                           lift's drive, a tractor on its work
   *   an aircraft or a boat   near its cruise rpm, a little over in a
   *                           climb, under in a glide or a dive (which
   *                           windmills it); a munition that powers into
   *                           its dive (powerDive) winds up instead, the
   *                           rising whine of its terminal run
   */
  drive(state, dt) {
    const s = this.spec;
    const sp = Math.sqrt(state[3] * state[3] + state[4] * state[4] + state[5] * state[5]);
    const step = Math.max(1e-3, dt);
    let rpm = 0;
    let want = 0.6;
    if (s.gears) {
      if (sp < 0.5) {
        rpm = s.idleRpm;
      } else {
        let g = 0;
        while (g < s.gears.length - 1 && sp > s.gears[g]) {
          g += 1;
        }
        const lo = g === 0 ? 0 : s.gears[g - 1] * 0.82;
        const x = Math.max(0, Math.min(1, (sp - lo) / Math.max(0.1, s.gears[g] - lo)));
        rpm = s.idleRpm + (s.shiftRpm - s.idleRpm) * (0.35 + 0.65 * x);
      }
      const accel = this.speed === undefined ? 0 : (sp - this.speed) / step;
      want = 0.5 + 0.5 * Math.max(-0.6, Math.min(1, accel / 1.2));
    } else if (s.fixed) {
      rpm = s.cruiseRpm;
    } else if (s.cruiseRpm) {
      const climb = sp > 1 ? state[4] / sp : 0;
      const x = Math.min(1.3, sp / Math.max(1, s.cruise));
      rpm = s.cruiseRpm * (0.75 + 0.25 * x) * (1 + 0.12 * (s.powerDive ? Math.abs(climb) : climb));
      want = 0.6 + 0.5 * (state[4] / Math.max(4, sp));
    }
    rpm *= this.rpmTrim;
    const ref = s.gears ? s.shiftRpm : s.cruiseRpm || 1;
    if (!s.gears && s.cruiseRpm) {
      const spin = (rpm - this.rpm) / step / ref;
      want += 0.4 * Math.sign(spin) * Math.min(1, Math.abs(spin));
    }
    this.rpm = this.rpm === 0 ? rpm : this.rpm + 0.3 * (rpm - this.rpm);
    this.load += 0.1 * (Math.max(0.2, Math.min(1.5, want)) - this.load);
    this.speed = sp;
    /* Level with rpm to the first power (about 2 dB from cruise to a
     * powered dive), compressed from the aeroacoustic fourth to sixth for
     * the reason the engine's own law is (engine-worklet.js motorAmps);
     * a road vehicle's with its load as well: a bus idling at its stop
     * measures 5 dB under the same bus pulling away (the bus-stop scene;
     * the street's figures, idle 65 to 70 dB(A) at 7.5 m and a pull away
     * 75 to 80, say up to 10, which this leaves the owner to call). A source with no engine is its parts' own level. */
    if (s.gears) {
      this.level = (0.4 + 0.6 * this.rpm / s.shiftRpm) * (0.45 + 0.55 * this.load);
    } else if (s.flowRef) {
      /* Water through a breach: its level with the discharge to the 0.3
       * (the falling water's power goes as the flow; compressed, as every
       * law here is, so a breach ten times the flow is 6 dB and not 10),
       * nothing when nothing flows; and its roar a little lower the more
       * there is, a bigger jet's eddies being bigger. */
      const q = Math.max(0, state[6]) / s.flowRef;
      this.level = Math.min(2.5, q ** 0.3);
      this.roarScale = Math.max(0.6, Math.min(1.4, q ** -0.12));
    } else {
      this.level = s.cruiseRpm ? Math.min(1.6, this.rpm / s.cruiseRpm) : 1;
    }
  }

  /* Everything a quantum holds still: the shaft rate with the Doppler
   * factor `dop` in it, the noise bands' tunings, the levels. */
  prepare(dop) {
    const s = this.spec;
    const rate = this.rate;
    this.fRot = (this.rpm / 60) * dop;
    this.dop = dop;
    const bladesBb = s.blades || s.rotorBlades || 2;
    this.fBb = svfF(Math.min(5000, Math.max(300, this.fRot * bladesBb * (s.rotors ? 5 : 4))), rate);
    this.fWash = svfF(350 * dop, rate);
    this.gWash = s.water ? s.water * Math.min(1.5, this.speed / 10) : 0;
    this.fTyre = svfF(900 * dop, rate);
    this.gTyre = s.tyres ? s.tyres * Math.min(1.5, (this.speed / 14) ** 1.5) : 0;
    this.fRope = svfF(140 * dop, rate);
    this.gRope = s.rope ? s.rope * Math.min(1.5, this.speed / 5) : 0;
    const rs = dop * this.roarScale;
    this.fRoarLo = svfF(170 * rs, rate);
    this.fRoarMid = svfF(650 * rs, rate);
    this.fRoarHi = svfF(2400 * rs, rate);
    this.kSurge = onePole(0.4, rate);
    this.kSwell = onePole(0.05, rate);
    this.fFlow = svfF(900 * dop, rate);
    this.bubbleOdds = 1 - (s.bubbles || 0) / rate;
    this.fLap = svfF(380 * dop, rate);
    this.kLap = Math.exp(-1 / (0.35 * rate));
    this.fHum = svfF(170 * dop, rate);
    this.crackOdds = 1 - 40 / rate;
    this.fCrack = svfF(6500 * dop, rate);
    this.bellOdds = 1 - (0.15 + 4 * this.speed) / rate;
    this.ld = Math.max(0.2, Math.min(1.5, this.load));
  }

  /* One sample of the source, mono, at the source. */
  sample() {
    const s = this.spec;
    const rate = this.rate;
    const nz = this.nz;
    let y = 0;
    const fRot = this.fRot;
    if (s.fires) {
      /* The firing cycle. */
      this.cycle += (fRot * s.fires) / rate * (1 + this.cycleLag);
      if (this.cycle >= 1) {
        this.cycle -= Math.floor(this.cycle);
        this.fire();
      }
      const exc = this.pulse * (0.7 + 0.3 * nz());
      this.pulse *= s.pulseDecay;
      if (this.pulse < FLUSH) {
        this.pulse = 0;
      }
      const ld = this.ld;
      const ex = this.muff[0].run(exc) + 0.6 * ld * this.muff[1].run(exc) + 0.35 * ld * this.muff[2].run(exc);
      /* The blowdown itself, the port opening (the engine's glow and boxer
       * models): a short decaying half wave each cycle. */
      const bd = BD[(this.cycle * BD_N) | 0] * this.cycleAmp;
      y += s.exhaust * (0.5 * bd + ex);
      if (s.knock) {
        /* A diesel's combustion knock: the pressure rise's tick, the
         * block's ring struck by the square of the pulse so only the
         * firing's peak reaches it. */
        y += s.knockLevel * this.knock.run(exc * exc);
      }
    }
    if (s.blades) {
      /* The prop: its harmonics from this one's own table, and its
       * broadband chopped at the blade pass. */
      this.shaft += fRot / rate;
      if (this.shaft >= 1) {
        this.shaft -= Math.floor(this.shaft);
      }
      const x = this.shaft * PROP_N;
      const i = x | 0;
      const p = this.propWave[i] + (this.propWave[i + 1] - this.propWave[i]) * (x - i);
      this.bb.run(nz(), this.fBb, 0.9);
      const chop = 1 + 0.5 * sinC(this.shaft * s.blades + 0.25);
      y += s.prop * (p + 0.4 * this.bb.bp * chop);
    }
    if (s.whine) {
      /* An electric motor: its electrical frequency and second harmonic,
       * with the prop it turns already above. */
      this.whine += (fRot * s.poles / 2) / rate;
      if (this.whine >= 1) {
        this.whine -= Math.floor(this.whine);
      }
      y += s.whine * (sinC(this.whine) + 0.4 * sinC(2 * this.whine));
    }
    if (s.mesh) {
      /* A gearbox's mesh: its teeth passing, a tone at teeth x the shaft
       * rate and a little of its second. */
      this.meshPh += (fRot * s.teeth) / rate;
      if (this.meshPh >= 1) {
        this.meshPh -= Math.floor(this.meshPh);
      }
      y += s.mesh * (sinC(this.meshPh) + 0.3 * sinC(2 * this.meshPh));
    }
    if (s.rotors) {
      /* A quad: four props a few percent apart, beating, each a blade
       * pass with two harmonics (ROTOR); the vortex noise is the bb band. */
      let q = 0;
      for (let m = 0; m < 4; m += 1) {
        this.rotor[m] += (fRot * this.rotorRpm[m] * s.rotorBlades) / rate;
        if (this.rotor[m] >= 1) {
          this.rotor[m] -= Math.floor(this.rotor[m]);
        }
        const x = this.rotor[m] * ROTOR_N;
        const i = x | 0;
        q += ROTOR[i] + (ROTOR[i + 1] - ROTOR[i]) * (x - i);
      }
      this.bb.run(nz(), this.fBb, 0.9);
      y += s.rotors * (0.25 * q + 0.5 * this.bb.bp);
    }
    if (this.gTyre > 1e-4) {
      /* Tyre and road: broadband near 1 kHz, its level with speed to the
       * 2.5 power compressed to the 1.5 (a tyre's noise is the larger
       * part of a car's above about 40 km/h, Sandberg and Ejsmont 2002). */
      this.tyre.run(nz(), this.fTyre, 1.1);
      y += this.gTyre * this.tyre.bp;
    }
    if (this.gRope > 1e-4) {
      /* A cabin on its rope: the haul rope's low rumble through the grip
       * and the hanger's slow swing. */
      this.rope.run(nz(), this.fRope, 1.0);
      this.swing += 0.35 / rate;
      y += this.gRope * this.rope.lo * (1 + 0.4 * sinC(this.swing));
    }
    if (this.gWash > 1e-4) {
      /* A hull: the wash, and the slap of the hull meeting the chop a few
       * times a second, faster the faster it goes. */
      this.wash.run(nz(), this.fWash, 1.4);
      this.slap += (1.2 + 0.25 * this.speed) / rate;
      const slap = 1 + 0.6 * sinC(this.slap) * (0.5 + 0.5 * sinC(0.37 * this.slap));
      y += this.gWash * this.wash.lo * slap;
    }
    if (s.roar) {
      /* Falling water: the plunge's thunder under the spray's hiss, three
       * bands of one noise, the low heaviest, surging slowly. */
      const w = nz();
      this.roarLo.run(w, this.fRoarLo, 0.8);
      this.roarMid.run(w, this.fRoarMid, 1.1);
      this.roarHi.run(w, this.fRoarHi, 1.2);
      this.surge += this.kSurge * (nz() - this.surge);
      y += s.roar * (1 + 1.2 * this.surge) * (this.roarLo.lo + 0.4 * this.roarMid.bp + 0.05 * this.roarHi.bp);
    }
    if (s.flow) {
      /* Running water: a band of noise and the bubbles in it, each a short
       * ring at the pitch its size gives it (Minnaert: 3.26 m/s over the
       * radius, so 2 to 10 mm rings 330 Hz to 1.6 kHz). */
      this.flowBand.run(nz(), this.fFlow, 0.8);
      if (nz() > this.bubbleOdds) {
        this.bubble.tune(330 + 1300 * Math.abs(nz()) ** 2, 0.006 + 0.012 * Math.abs(nz()), rate);
        this.bubble.strike(0.3 + 0.7 * Math.abs(nz()));
      }
      y += s.flow * (0.5 * this.flowBand.bp + 0.4 * this.bubble.run(0));
    }
    if (s.lap) {
      /* Small waves on a shore: one every second or two, each a slap, a
       * clop off the stones and its wash back. */
      if ((this.lapIn -= 1) <= 0) {
        this.lapIn = (0.9 + 1.8 * Math.abs(nz())) * rate;
        this.lapEnv = 0.4 + 0.6 * Math.abs(nz());
        this.clop.tune(160 + 260 * Math.abs(nz()), 0.025, rate);
        this.clop.strike(this.lapEnv);
      }
      this.lapEnv = this.lapEnv * this.kLap < FLUSH ? 0 : this.lapEnv * this.kLap;
      this.lapBand.run(nz(), this.fLap, 0.9);
      y += s.lap * (this.lapEnv * this.lapBand.lo + 0.3 * this.clop.run(0));
    }
    if (s.hum) {
      /* A town far off: its traffic's murmur, low and swelling, and the
       * mains' hum of its transformers. */
      this.humBand.run(nz(), this.fHum, 0.7);
      this.surge += this.kSwell * (nz() - this.surge);
      this.mains += (2 * s.mainsHz) / rate;
      y += s.hum * ((0.8 + 2 * this.surge) * this.humBand.lo + 0.08 * sinC(this.mains));
    }
    if (s.corona) {
      /* A high voltage line: the hum at twice its mains, and corona's
       * fizz and crackle, which a damp day makes worse; the crackle kept
       * high, over the band the ear tires in. */
      this.mains += (2 * s.mainsHz) / rate;
      if (nz() > this.crackOdds) {
        this.crackEnv = 0.5 + 0.5 * Math.abs(nz());
      }
      this.crackEnv = this.crackEnv < FLUSH ? 0 : this.crackEnv * 0.93;
      this.crackBand.run(nz(), this.fCrack, 1.0);
      y += s.corona * (0.5 * sinC(this.mains) + 0.2 * sinC(2 * this.mains) + (0.15 + this.crackEnv) * this.crackBand.bp);
    }
    if (s.bell) {
      /* A cow's bell: struck as it moves its head, more often walking,
       * four inharmonic partials of a hammered bell, each its own decay. */
      if (nz() > this.bellOdds) {
        const k = 0.4 + 0.6 * Math.abs(nz());
        for (let q = 0; q < 4; q += 1) {
          this.bellModes[q].strike(k * BELL_AMP[q]);
        }
      }
      for (let q = 0; q < 4; q += 1) {
        y += s.bell * this.bellModes[q].run(0);
      }
    }
    if (s.song) {
      y += s.song * this.songSample(nz);
    }
    if (s.chirp) {
      /* A cricket: a chirp of three pulses of its tone, two or three
       * chirps a second, the tone its own. */
      this.chirpT += 1 / rate;
      if (this.chirpT >= this.chirpGap) {
        this.chirpT = 0;
        this.chirpGap = 0.35 + 0.15 * Math.abs(nz());
      }
      const pulse = this.chirpT < 0.09 ? Math.max(0, sinC(this.chirpT * 33)) : 0;
      this.tone += this.chirpHz / rate;
      y += s.chirp * pulse * sinC(this.tone);
    }
    if (s.croak) {
      /* A frog: a croak, a train of pulses at 30 a second through its
       * throat's resonance, every few seconds. */
      this.croakT += 1 / rate;
      if (this.croakT >= this.croakGap) {
        this.croakT = 0;
        this.croakGap = 1.2 + 2.5 * Math.abs(nz());
        this.croak.tune(this.croakHz, 0.012, rate);
      }
      if (this.croakT < 0.35 && ((this.croakT * 30) % 1) < 30 / rate) {
        this.croak.strike(1);
      }
      y += s.croak * this.croak.run(0);
    }
    if (s.buzz) {
      /* A cicada: its tymbals' buzz, a high carrier amplitude modulated a
       * few hundred times a second, in long calls with rests between. */
      this.buzzT += 1 / rate;
      if (this.buzzT >= this.buzzLen) {
        this.buzzT = 0;
        this.buzzOn = !this.buzzOn;
        this.buzzLen = this.buzzOn ? 3 + 5 * Math.abs(nz()) : 2 + 6 * Math.abs(nz());
      }
      if (this.buzzOn) {
        const ramp = Math.min(1, this.buzzT / 0.6, (this.buzzLen - this.buzzT) / 0.4);
        this.tone += this.buzzHz / rate;
        this.am += 210 / rate;
        y += s.buzz * ramp * (0.5 + 0.5 * sinC(this.am)) * sinC(this.tone);
      }
    }
    return y;
  }

  /* A bird: phrases of notes, each a sweep of its species' shape, with a
   * rest before each phrase; three shapes (a falling whistle, a trill, a
   * run of rising chirps) by the voice's seed, its pitch its own. */
  songSample(nz) {
    const rate = this.rate;
    const sh = this.songShape;
    if (this.noteT >= this.noteLen) {
      if (this.gapT > 0) {
        this.gapT -= 1 / rate;
        return 0;
      }
      if (this.notesLeft <= 0) {
        this.notesLeft = 2 + Math.floor(6 * Math.abs(nz()));
        this.gapT = 1.5 + 5 * Math.abs(nz());
        return 0;
      }
      this.notesLeft -= 1;
      this.noteT = 0;
      this.noteLen = sh.len * (0.8 + 0.4 * Math.abs(nz()));
      this.noteHz = this.songHz * (1 + 0.08 * nz());
      this.gapT = sh.gap * (0.7 + 0.6 * Math.abs(nz()));
    }
    const u = this.noteT / this.noteLen;
    this.noteT += 1 / rate;
    this.tone += (this.noteHz * (1 + sh.sweep * u)) / rate;
    let env = sinC(0.5 * u);
    if (sh.trill) {
      env *= 0.5 + 0.5 * sinC(this.noteT * sh.trill);
    }
    return env * (sinC(this.tone) + 0.15 * sinC(2 * this.tone));
  }

  /* A firing: this cycle's strength and timing (Heywood 1988, 9.4), a
   * misfire now and then, the muffler struck afresh. */
  fire() {
    const s = this.spec;
    const nz = this.nz;
    const rpm = this.rpm;
    const ref = s.gears ? s.shiftRpm : s.cruiseRpm;
    const idle = Math.max(0, 1 - rpm / ref);
    const jit = s.jitter * (0.5 + idle);
    this.cycleAmp = 1 + jit * nz();
    this.cycleLag = 0.3 * jit * nz();
    if (s.miss && nz() > 1 - s.miss) {
      this.cycleAmp *= 0.25;
    }
    this.pulse = this.cycleAmp;
    const lift = 1 + 0.15 * Math.min(1.2, rpm / ref);
    for (let q = 0; q < 3; q += 1) {
      this.muff[q].tune(s.muffler[q] * lift * this.muffTrim[q] * this.dop, s.mufflerDecay[q], this.rate);
    }
    if (s.knock) {
      this.knock.tune(s.knock * this.dop * (1 + 0.04 * nz()), 0.0025, this.rate);
    }
  }
}

/*
 * One explosion as heard: layers whose balance the distance sets. The
 * crack (the shock's N wave, only near), the body (a burst of noise whose
 * top falls fast), the thump (a falling low sine, the ground pushed), the
 * rumble (a long low tail from both sides, longer the farther: the
 * terrain scattering it back), and a crackle of debris and burning near.
 * Every one draws its own numbers from its seed: no two are the same
 * samples. An image (a reflection off the dam or a canyon wall) is another
 * Blast, darker, no crack, later. Envelopes are recursive, one multiply a
 * sample each.
 */
class Blast {
  constructor(rate, seed, at, level, dist, pan, image) {
    const r = rng(seed);
    this.nz = rng(seed ^ 0x27d4eb2f);
    this.rate = rate;
    this.at = at;
    this.done = false;
    this.started = false;
    const d = Math.max(1, dist);
    /* Spreading from 60 m, nearer not louder (the target for a near
     * explosion is momentary -12 LUFS, the biggest thing in the game by
     * 2 dB and not by 12, docs/AUDIO.md section 6). At 4.5 dB a doubling,
     * not spherical spreading's 6: a real warhead at 300 m is still far
     * louder than an aircraft at 16 m, and a mix that keeps the aircraft
     * at its level has to compress the explosions' range to keep a boom
     * across the valley a boom (ESTIMATED, a mix decision for the owner's
     * ears; the air's lowpass still takes its top). */
    const spread = Math.min(1, (60 / d) ** 0.75);
    this.amp = BLAST_GAIN * Math.max(0, Math.min(1.4, level)) * spread * (image ? 0.5 : 1);
    const near = Math.max(0, 1 - d / 500);
    this.crack = image ? 0 : near * near;
    /* The top: what the air leaves of a broadband burst at this distance,
     * and an image darker again for the wall it came off. */
    this.top = Math.min(absorbHz(d), 1600 * (1 + 0.25 * r())) * (image ? 0.5 : 1);
    this.topNow = this.top;
    const bodyDecay = (0.22 + 0.12 * Math.abs(r())) * (1 + d / 800);
    const rumbleDecay = (0.55 + 0.35 * Math.abs(r())) * (1 + d / 900);
    this.life = 0.6 + 5 * rumbleDecay;
    this.rumbleLevel = 0.35 + 0.4 * Math.min(1, d / 600);
    this.thumpHz = 55 + 20 * r();
    this.thumpPhase = 0;
    this.crackleLevel = image ? 0 : near * (0.5 + 0.3 * r());
    this.crackS = 0.0025 + 0.0015 * Math.abs(r());
    /* Per sample decays. */
    const k = (s) => Math.exp(-1 / (s * rate));
    this.kBody = k(bodyDecay);
    this.kRumble = k(rumbleDecay);
    this.kAtk = k(0.003);
    this.kRAtk = k(0.08);
    this.kThump = k(0.12);
    this.kSweep = k(0.15);
    this.kCrackle = k(0.8);
    this.kCrackSvf = k(0.006);
    this.eBody = 1;
    this.eAtk = 1;
    this.eRumble = 1;
    this.eRAtk = 1;
    this.eThump = 1;
    this.eSweep = 1;
    this.eCrackleRate = 1;
    this.eCrackSvf = 1;
    this.crackleEnv = 0;
    this.t = 0;
    this.body = new Svf();
    this.crackSvf = new Svf();
    this.crackleSvf = new Svf();
    this.gl = Math.sqrt(0.5 * (1 - pan));
    this.gr = Math.sqrt(0.5 * (1 + pan));
  }

  /* Adds this blast's quantum, starting at context time t0, to L and R,
   * and its rumble's envelope to E: every blast's rumble is the same
   * diffuse low noise, so the processor runs one for all of them
   * (renderBlasts), shaped by the sum of their envelopes. */
  render(t0, n, L, R, E) {
    const rate = this.rate;
    const dt = 1 / rate;
    let i = 0;
    if (!this.started) {
      i = Math.ceil((this.at - t0) * rate);
      if (i >= n) {
        return;
      }
      i = Math.max(0, i);
      this.started = true;
    }
    const nz = this.nz;
    const a = this.amp;
    const fCrack = svfF(3500, rate);
    const fCrackle = svfF(1600, rate);
    let fBody = svfF(this.topNow, rate);
    for (; i < n; i += 1) {
      const t = this.t;
      this.t += dt;
      let y = 0;
      if (this.crack > 0 && t < 0.02) {
        const u = t / this.crackS;
        const nw = u < 1 ? 1 - 2 * u : u < 1.2 ? -1 + (u - 1) * 5 : 0;
        this.crackSvf.run(nz(), fCrack, 0.8);
        y += this.crack * (0.45 * nw + 0.5 * this.crackSvf.bp * this.eCrackSvf);
        this.eCrackSvf *= this.kCrackSvf;
      }
      /* The body: noise, its corner falling from the top to 120 Hz,
       * retuned every 16 samples. */
      if ((i & 15) === 0) {
        this.topNow = 120 + (this.top - 120) * Math.exp(-t / 0.12);
        fBody = svfF(this.topNow, rate);
      }
      if (this.eBody > 1e-4) {
        this.body.run(nz(), fBody, 0.9);
        y += 1.6 * (1 - this.eAtk) * this.eBody * this.body.lo;
        this.eAtk *= this.kAtk;
        this.eBody *= this.kBody;
      }
      /* The thump: a low sine falling an octave. */
      if (t < 0.6) {
        this.thumpPhase += (this.thumpHz * (0.5 + 0.5 * this.eSweep)) / rate;
        y += 0.3 * this.eThump * sinC(this.thumpPhase);
        this.eThump *= this.kThump;
        this.eSweep *= this.kSweep;
      }
      /* The crackle: sparse ticks, rarer as it dies. */
      if (this.crackleLevel > 0 && t < 2.5) {
        if (nz() > 1 - 0.004 * this.eCrackleRate) {
          this.crackleEnv = 0.5 + 0.5 * Math.abs(nz());
        }
        this.eCrackleRate *= this.kCrackle;
        this.crackleEnv *= 0.993;
        this.crackleSvf.run(nz(), fCrackle, 1.5);
        y += this.crackleLevel * this.crackleEnv * this.crackleSvf.bp;
      }
      E[i] += a * 1.54 * this.rumbleLevel * (1 - this.eRAtk) * this.eRumble;
      this.eRAtk *= this.kRAtk;
      this.eRumble *= this.kRumble;
      L[i] += a * y * this.gl;
      R[i] += a * y * this.gr;
    }
    if (this.t > this.life) {
      this.done = true;
    }
  }
}

/*
 * One structure breaking, as heard (WorldAudio.breach): what the war's
 * damage breaks off the dam, its gates and its switchyard. By material:
 *
 *   concrete     the fracture running through it (a few sharp cracks in
 *                its first 0.4 s), the mass letting go (a low rumble that
 *                lasts as long as a bigger piece takes to come down), and
 *                the pieces landing, each a thud and a tick, from when the
 *                first reaches the ground to when the last does
 *   steel        plate tearing (a band of noise in stick slip bursts), the
 *                structure groaning (three of its low modes driven by the
 *                friction, gliding down as it gives) and a clang when it
 *                lets go, its pieces landing after
 *   transformer  the arc (a buzz on twice the mains, a sizzle, flickering
 *                as the arc strikes and goes out), the oil flashing over
 *                (a thump and a roar) and the fire after (a low roar and
 *                its crackle, for seconds)
 *
 * The mass sets the level (a log law: ten times the mass about 4 dB) and
 * how long it takes: a bigger piece rumbles longer and falls with more
 * pieces. The fall height (metres down to the ground under it) sets when
 * the pieces land: sqrt(2 h / g). Every number draws on the seed, so no
 * two breaks are the same samples. ESTIMATED, every level and time: no
 * recording of a dam breaking was measured.
 */
class Breach {
  constructor(rate, seed, at, b, gain, dist, pan, image) {
    const r = rng(seed);
    this.nz = rng(seed ^ 0x2c1b3c6d);
    this.rate = rate;
    this.at = at;
    this.done = false;
    this.started = false;
    /* Late: how far into its own sound it already is. */
    this.t = Math.max(0, b.late || 0);
    this.material = b.material;
    const d = Math.max(1, dist);
    const mass = Math.max(1, b.mass || 1000);
    const lv = Math.max(0.15, Math.min(1.3, 0.55 + 0.2 * Math.log10(mass / 10000)));
    const spread = Math.min(1, (60 / d) ** 0.75);
    this.amp = BREACH_GAIN * lv * spread * gain * (image ? 0.5 : 1);
    /* What the air leaves at this distance, and an image darker again for
     * the wall it came off. */
    this.kTop = onePole(Math.min(absorbHz(d), 9000) * (image ? 0.5 : 1), rate);
    this.lp = 0;
    this.gl = Math.sqrt(0.5 * (1 - pan));
    this.gr = Math.sqrt(0.5 * (1 + pan));
    /* How long the mass takes to go, s: a cube root law, 1 t about 0.8 s,
     * 1000 t about 8. */
    const size = Math.cbrt(mass / 1000);
    this.rumbleS = Math.min(10, 0.8 * size * (0.8 + 0.4 * Math.abs(r())));
    /* The pieces: when they land, sqrt(2 h / g) for the first, the rest
     * strung out after it (they come off over time), and how many. */
    const fall = Math.sqrt((2 * Math.max(1, b.fall || 10)) / 9.81);
    const pieces = Math.min(40, Math.round(6 + 10 * size));
    this.hits = [];
    for (let k = 0; k < pieces; k += 1) {
      const u = Math.abs(r());
      this.hits.push({
        at: fall * (0.7 + 0.9 * u) + 0.15 * Math.abs(r()),
        amp: (0.25 + 0.75 * Math.abs(r())) * (1 - 0.5 * u),
        hz: 70 + 260 * Math.abs(r()) ** 2,
      });
    }
    this.hits.sort((a, c) => a.at - c.at);
    this.nextHit = 0;
    this.thud = [new Mode(), new Mode(), new Mode(), new Mode()];
    this.thudAt = 0;
    this.tick = new Svf();
    this.fTick = svfF(2200, rate);
    this.tickEnv = 0;
    this.kTick = Math.exp(-1 / (0.006 * rate));
    this.life = Math.max(fall * 1.5 + 1.5, this.rumbleS * 1.6 + 0.5);
    /* The low end, every material: a rumble whose envelope rises in
     * 60 ms and decays over rumbleS. */
    this.low = new Svf();
    this.kLow = Math.exp(-1 / (this.rumbleS * 0.45 * rate));
    this.eLow = 1;
    this.eLowAtk = 1;
    this.kLowAtk = Math.exp(-1 / (0.06 * rate));
    this.fLow = svfF(85 + 40 * Math.abs(r()), rate);
    if (b.material === 'concrete') {
      this.cracks = [];
      const n = 3 + Math.floor(4 * Math.abs(r()));
      for (let k = 0; k < n; k += 1) {
        this.cracks.push({ at: k === 0 ? 0 : 0.4 * Math.abs(r()), amp: k === 0 ? 1 : 0.3 + 0.5 * Math.abs(r()) });
      }
      this.cracks.sort((a, c) => a.at - c.at);
      this.nextCrack = 0;
      this.crack = new Svf();
      this.crackEnv = 0;
      this.kCrack = Math.exp(-1 / (0.012 * rate));
      this.fCrack = svfF(900 + 700 * Math.abs(r()), rate);
      this.lowLevel = 1.0;
    } else if (b.material === 'steel') {
      this.tearS = 0.4 + 0.8 * Math.abs(r());
      this.tear = new Svf();
      this.fTear = svfF(900 + 900 * Math.abs(r()), rate);
      this.slipIn = 0;
      this.slipEnv = 0;
      this.kSlip = Math.exp(-1 / (0.008 * rate));
      this.groanHz = 70 + 90 * Math.abs(r());
      this.groan = [new Mode(), new Mode(), new Mode()];
      this.groanRatio = [1, 2.31, 3.87];
      this.groanS = this.tearS + 1.2 + 1.2 * Math.abs(r());
      this.clang = [new Mode(), new Mode(), new Mode(), new Mode()];
      const base = 280 + 420 * Math.abs(r());
      [1, 1.47, 2.09, 2.83].forEach((q, k) => this.clang[k].tune(base * q, 1.4 / (1 + k * 0.6), rate));
      this.clanged = false;
      this.lowLevel = 0.5;
      this.life = Math.max(this.life, this.groanS + 2);
    } else {
      this.arcS = 0.5 + 1.0 * Math.abs(r());
      this.arcPh = 0;
      this.arcOn = 1;
      this.flickIn = 0;
      this.sizzle = new Svf();
      this.fSizzle = svfF(3800, rate);
      this.flash = false;
      this.fire = new Svf();
      this.fFire = svfF(260, rate);
      this.fireS = 6 + 4 * Math.abs(r());
      this.crackle = new Svf();
      this.fCrackle = svfF(1800, rate);
      this.crackleEnv = 0;
      this.lowLevel = 0.6;
      this.life = Math.max(this.life, this.arcS + this.fireS);
    }
  }

  /* Adds this breach's quantum, starting at context time t0, to L and R
   * (renderBlasts runs it with the explosions; it has no share of their
   * rumble). */
  render(t0, n, L, R) {
    const rate = this.rate;
    const dt = 1 / rate;
    let i = 0;
    if (!this.started) {
      i = Math.ceil((this.at - t0) * rate);
      if (i >= n) {
        return;
      }
      i = Math.max(0, i);
      this.started = true;
    }
    const nz = this.nz;
    for (; i < n; i += 1) {
      const t = this.t;
      this.t += dt;
      let y = 0;
      /* The low end. */
      this.low.run(nz(), this.fLow, 1.0);
      y += 1.8 * this.lowLevel * (1 - this.eLowAtk) * this.eLow * this.low.lo;
      this.eLowAtk *= this.kLowAtk;
      this.eLow *= this.kLow;
      if (this.material === 'concrete') {
        while (this.nextCrack < this.cracks.length && this.cracks[this.nextCrack].at <= t) {
          this.crackEnv = Math.max(this.crackEnv, this.cracks[this.nextCrack].amp);
          this.nextCrack += 1;
        }
        if (this.crackEnv > 1e-4) {
          this.crack.run(nz(), this.fCrack, 0.7);
          y += 0.9 * this.crackEnv * (this.crack.bp + 0.4 * this.crack.lo);
          this.crackEnv *= this.kCrack;
        } else {
          this.crackEnv = 0;
        }
      } else if (this.material === 'steel') {
        if (t < this.tearS) {
          /* Stick slip: a burst every 12 to 35 ms, each its own size. */
          if ((this.slipIn -= 1) <= 0) {
            this.slipIn = (0.012 + 0.023 * Math.abs(nz())) * rate;
            this.slipEnv = 0.4 + 0.6 * Math.abs(nz());
          }
          this.tear.run(nz(), this.fTear, 1.2);
          y += 0.7 * this.slipEnv * this.tear.bp;
          this.slipEnv *= this.kSlip;
        }
        if (t < this.groanS) {
          if ((i & 63) === 0) {
            const glide = 1 - 0.3 * Math.min(1, t / this.groanS);
            for (let q = 0; q < 3; q += 1) {
              this.groan[q].tune(this.groanHz * this.groanRatio[q] * glide, 0.08, rate);
            }
          }
          const env = Math.min(1, t / 0.15) * Math.min(1, (this.groanS - t) / 0.4);
          const ex = nz() * env;
          y += 0.3 * (this.groan[0].run(ex) + 0.6 * this.groan[1].run(ex) + 0.35 * this.groan[2].run(ex));
        } else if (!this.clanged) {
          this.clanged = true;
          for (let q = 0; q < 4; q += 1) {
            this.clang[q].strike(0.12 / (1 + q));
          }
        }
        if (this.clanged) {
          for (let q = 0; q < 4; q += 1) {
            y += this.clang[q].run(0);
          }
        }
      } else {
        if (t < this.arcS) {
          /* The arc: on and off in 10 to 40 ms flickers, a buzz on twice
           * the mains (a rectified sine's harmonics, 1 / k^1.3) and its
           * sizzle. */
          if ((this.flickIn -= 1) <= 0) {
            this.flickIn = (0.01 + 0.03 * Math.abs(nz())) * rate;
            this.arcOn = nz() > -0.6 ? 1 : 0.15;
          }
          this.arcPh += (2 * MAINS_HZ) / rate;
          let buzz = 0;
          for (let k = 1; k <= 8; k += 1) {
            buzz += sinC(k * this.arcPh) / k ** 1.3;
          }
          this.sizzle.run(nz(), this.fSizzle, 1.0);
          y += this.arcOn * (0.18 * buzz + 0.22 * this.sizzle.bp);
        } else {
          if (!this.flash) {
            this.flash = true;
            this.eLow = 1;
            this.eLowAtk = 1;
            this.lowLevel = 1.3;
          }
          /* The fire: a low roar and its crackle, dying over fireS. */
          const ft = t - this.arcS;
          const fe = Math.min(1, ft / 0.3) * Math.exp(-ft / (0.45 * this.fireS));
          this.fire.run(nz(), this.fFire, 0.9);
          if (nz() > 1 - 0.003 * fe) {
            this.crackleEnv = 0.4 + 0.6 * Math.abs(nz());
          }
          this.crackleEnv *= 0.992;
          this.crackle.run(nz(), this.fCrackle, 1.4);
          y += fe * (0.4 * this.fire.lo + 0.25 * this.crackleEnv * this.crackle.bp);
        }
      }
      /* The pieces landing: a thud, the piece's own pitch, and a tick. */
      while (this.nextHit < this.hits.length && this.hits[this.nextHit].at <= t) {
        const h = this.hits[this.nextHit];
        const m = this.thud[this.thudAt];
        this.thudAt = (this.thudAt + 1) % this.thud.length;
        m.tune(h.hz, 0.05 + 0.04 * Math.abs(nz()), rate);
        m.strike(0.35 * h.amp);
        this.tickEnv = Math.max(this.tickEnv, 0.5 * h.amp);
        this.nextHit += 1;
      }
      for (const m of this.thud) {
        y += m.run(0);
      }
      if (this.tickEnv > 1e-4) {
        this.tick.run(nz(), this.fTick, 0.8);
        y += this.tickEnv * this.tick.bp;
        this.tickEnv *= this.kTick;
      } else {
        this.tickEnv = 0;
      }
      y *= this.amp;
      /* What the air leaves of it at this distance. */
      this.lp += this.kTop * (y - this.lp);
      if (this.lp < FLUSH && this.lp > -FLUSH) {
        this.lp = 0;
      }
      L[i] += this.lp * this.gl;
      R[i] += this.lp * this.gr;
    }
    if (this.t > this.life) {
      this.done = true;
    }
  }
}

class WorldProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.rate = sampleRate;
    this.poolSize = o.voices || SHED[0].voices;
    this.tracks = new Map();
    /* Two pools: the things that move (output 0) and the ambience's beds
     * and emitters (output 1, spec.bed), so a dawn chorus never takes an
     * attacker's voice nor a swarm a river's. */
    this.voices = [];
    for (let i = 0; i < this.poolSize; i += 1) {
      this.voices.push(new Voice(this.rate));
    }
    this.beds = [];
    for (let i = 0; i < SHED[0].beds; i += 1) {
      this.beds.push(new Voice(this.rate));
    }
    /* The listener's history: x, y, z, forward, right, its ground's y. */
    this.lis = new History(10);
    this.heard = false;
    this.blasts = [];
    this.pending = [];
    this.rumbleL = new Svf();
    this.rumbleR = new Svf();
    this.rumbleNz = [rng(0x27d4eb2f), rng(0x165667b1)];
    this.stateA = new Float64Array(7);
    this.stateB = new Float64Array(7);
    this.far = new Map();
    this.stats = { voiced: 0, voicedMax: 0, bedded: 0, beds: 0, bedsMax: 0, tracks: 0, load: 0, step: 0, stepMax: 0, rejected: 0 };
    /* The load guard (meter): on unless the options say otherwise, with a
     * budget of the audio's own time. */
    this.guard = o.guard !== false;
    this.loadBudget = o.loadBudget ?? LOAD_BUDGET;
    this.step = 0;
    this.cool = 0;
    this.busyMs = 0;
    this.audioMs = 0;
    this.quanta = 0;
    this.port.onmessage = (e) => this.message(e.data);
    /* An offline render's whole timeline, { frames, booms }, here rather
     * than by message so it is in place before the first quantum. */
    if (o.timeline) {
      this.message(o.timeline);
    }
  }

  /*
   * { frame: { t, lis: [x, y, z, fx, fy, fz, rx, ry, rz, groundY],
   *            src: Float64Array of SOURCE_STRIDE per source } }, or
   *   { frames: [...] } for many
   * { boom: { t, p: [x, y, z], level, seed, dist?, images: [[x, y, z,
   *           gain], ...] } }, or { booms: [...] }; `dist` 0 is the
   *   pilot's own warhead, on board
   * { breach: { t, p, material, mass, fall, late, seed, images } }, or
   *   { breaches: [...] }: a structure breaking (the Breach class), at t
   *   context seconds, `late` seconds into its own sound already
   * { stats: true }, answered with { stats: this.stats }
   * t is context seconds: when the frame was true, when the boom went off.
   */
  message(m) {
    if (m.frames) {
      for (const f of m.frames) {
        this.frame(f);
      }
    }
    if (m.frame) {
      this.frame(m.frame);
    }
    if (m.boom) {
      this.pending.push(m.boom);
    }
    if (m.booms) {
      this.pending.push(...m.booms);
    }
    if (m.breach) {
      this.pending.push(m.breach);
    }
    if (m.breaches) {
      this.pending.push(...m.breaches);
    }
    if (m.stats) {
      this.port.postMessage({ stats: { ...this.stats } });
    }
  }

  /* The boundary: a frame whose listener or time is not finite is not
   * taken, nor a source with a number that is not, and both are counted
   * (stats.rejected). One NaN position would otherwise be a NaN distance,
   * gain and filter state, for good (worklet-guard.js). */
  frame(f) {
    if (!Number.isFinite(f.t) || !f.lis || !finiteRow(f.lis, 0, f.lis.length)) {
      this.stats.rejected += 1;
      return;
    }
    this.lis.push(f.t, f.lis);
    this.heard = true;
    const s = f.src;
    if (!s) {
      return;
    }
    for (let i = 0; i + SOURCE_STRIDE <= s.length; i += SOURCE_STRIDE) {
      if (!finiteRow(s, i, SOURCE_STRIDE)) {
        this.stats.rejected += 1;
        continue;
      }
      const id = s[i];
      const kind = s[i + 1];
      let tr = this.tracks.get(id);
      if (!tr || tr.kind !== kind) {
        tr = new Track(id, kind);
        this.tracks.set(id, tr);
      }
      tr.push(f.t, s[i + 2], s[i + 3], s[i + 4], s[i + 5], s[i + 6], s[i + 7], s[i + 8]);
    }
  }

  /* The listener at t: [x, y, z, fx, fy, fz, rx, ry, rz, groundY]. */
  listener(t, out) {
    return this.lis.lerp(t, out);
  }

  /* Retarded time for a track heard at t from L: te = t - |x(te) - L| / c,
   * two fixed point steps from the present. Returns the distance; the
   * state at te is in this.stateA. */
  retard(tr, t, L) {
    let te = t;
    let d = 0;
    for (let k = 0; k < 3; k += 1) {
      tr.at(te, this.stateA);
      d = Math.hypot(this.stateA[0] - L[0], this.stateA[1] - L[1], this.stateA[2] - L[2]);
      te = t - d / C_AIR;
    }
    tr.at(te, this.stateA);
    this.te = te;
    /* The distance to the state returned, not to the last iterate's: when
     * a source jumps (a stream's nearest point as the camera teleports),
     * the iterates land either side of the jump, and a direction over the
     * wrong distance is longer than 1, which made the far ear's filter
     * unstable (renderSource). */
    return Math.hypot(this.stateA[0] - L[0], this.stateA[1] - L[1], this.stateA[2] - L[2]);
  }

  /* Through worklet-guard.js: a throw or a non-finite quantum is a 3 ms
   * gap and a { fault } on the port, never a dead node or a NaN latched
   * into the master limiter. */
  process(inputs, outputs) {
    const started = this.guard ? Date.now() : 0;
    guard(this, inputs, outputs);
    if (this.guard) {
      this.meter(Date.now() - started, outputs[0][0].length);
    }
    return true;
  }

  /* For worklet-guard.js: the listener, and every voiced source's state
   * at the time it is heard from, the first non-finite one marked. */
  faultContext() {
    const L = this.lisNow ? Array.from(this.lisNow) : null;
    const voices = [];
    for (const v of [...this.voices, ...this.beds]) {
      if (!v.track) {
        continue;
      }
      const st = Array.from(v.track.at(currentTime, new Float64Array(7)));
      voices.push({ id: v.track.id, kind: KIND_NAMES[v.track.kind], state: st, level: v.level, rpm: v.rpm, dist: v.distPrev, fade: v.fade });
    }
    return { listener: L, voices, blasts: this.blasts.length, tracks: this.tracks.size };
  }

  /* After a fault (worklet-guard.js): every source and voice starts over
   * from the next frame, the explosions under way are dropped. */
  reset() {
    for (const v of [...this.voices, ...this.beds]) {
      v.track = null;
    }
    this.tracks.clear();
    this.far.clear();
    this.blasts = [];
  }

  /*
   * THE LOAD GUARD. The worklet times its own quanta and, when a window of
   * them took more than its budget of the audio's own time, sheds a step:
   * fewer voices (a voice that loses its source fades out as ever, its
   * source going to the bed) and a far bed of noise only. It gives a step
   * back after several cool windows in a row, so it does not hunt. Date.now
   * is all an AudioWorkletGlobalScope has (no performance.now), a
   * millisecond, so the window is 128 quanta, 341 ms at 48 kHz, which
   * measures to a fraction of a percent. Off for an offline render
   * (processorOptions.guard false): a render is not real time, and a
   * check must hear the same samples every time.
   */
  meter(ms, n) {
    this.busyMs += ms;
    this.audioMs += (n / this.rate) * 1000;
    this.quanta += 1;
    if (this.quanta < GUARD_QUANTA) {
      return;
    }
    const load = this.busyMs / this.audioMs;
    this.stats.load = Number(load.toFixed(3));
    if (load > this.loadBudget && this.step < SHED.length - 1) {
      this.step += 1;
      this.cool = 0;
    } else if (load < 0.5 * this.loadBudget && this.step > 0) {
      this.cool += 1;
      if (this.cool >= GUARD_COOL) {
        this.step -= 1;
        this.cool = 0;
      }
    } else {
      this.cool = 0;
    }
    this.stats.step = this.step;
    this.stats.stepMax = Math.max(this.stats.stepMax, this.step);
    this.busyMs = 0;
    this.audioMs = 0;
    this.quanta = 0;
  }

  work(inputs, outputs) {
    const out0 = outputs[0];
    const out2 = outputs[2];
    const n = out0[0].length;
    const rate = this.rate;
    const t0 = currentTime;
    const t1 = t0 + n / rate;
    this.ingestBooms(t0);
    if (!this.heard) {
      this.renderBlasts(out2, t0, n);
      return;
    }
    const L = this.listener(t1, this.lisNow || (this.lisNow = new Float64Array(10)));
    this.lis.prune(t1 - HIST_KEEP_S);

    /* ---- who is heard: every track's loudness at the listener ---- */
    const live = [];
    const ambient = [];
    for (const [id, tr] of this.tracks) {
      /* Gone: its last frame is more than its travel time and a tail old. */
      const spec = WORLD_KINDS[KIND_NAMES[tr.kind]];
      tr.hist.prune(t1 - HIST_KEEP_S);
      tr.at(t1, this.stateB);
      const dNow = Math.hypot(this.stateB[0] - L[0], this.stateB[1] - L[1], this.stateB[2] - L[2]);
      if (t1 - dNow / C_AIR > tr.seen + TAIL_S + 0.1 && !tr.voice) {
        this.tracks.delete(id);
        continue;
      }
      if (!spec || dNow > FAR_M || t1 - dNow / C_AIR < tr.first) {
        tr.loud = 0;
        continue;
      }
      const g = spec.amp * spread(spec, dNow);
      tr.loud = g * g * Math.min(1, absorbHz(dNow) / 2000);
      tr.dNow = dNow;
      (spec.bed ? ambient : live).push(tr);
    }
    const shed = SHED[this.step];
    this.choose(this.voices, live, Math.min(this.poolSize, shed.voices));
    /* Under a swarm the place is masked: with more sources moving than
     * the voices for them, the ambience keeps only its loudest few, and
     * a war's worth of work is not spent on birds no one hears. */
    this.choose(this.beds, ambient, live.length > this.voices.length ? Math.min(shed.beds, BEDS_MASKED) : shed.beds);

    /* ---- the voices ---- */
    for (const v of this.voices) {
      this.renderVoice(v, out0, t0, t1, n, L);
    }
    for (const v of this.beds) {
      this.renderVoice(v, outputs[1], t0, t1, n, L);
    }

    /* ---- the far bed: everyone without a voice that moves ---- */
    this.renderFar(live, out0, n, L);
    this.renderBlasts(out2, t0, n);
    let voiced = 0;
    for (const v of this.voices) {
      voiced += v.track ? 1 : 0;
    }
    this.stats.voiced = voiced;
    this.stats.voicedMax = Math.max(this.stats.voicedMax, voiced);
    let beds = 0;
    for (const v of this.beds) {
      beds += v.track ? 1 : 0;
    }
    this.stats.beds = beds;
    this.stats.bedsMax = Math.max(this.stats.bedsMax, beds);
    this.stats.tracks = this.tracks.size;
    this.stats.bedded = Math.max(0, live.length - voiced);
  }

  /*
   * Give a pool's voices to the `size` loudest of `tracks`, the ones
   * holding a voice favoured by KEEP; a voice whose source fell out of the
   * set, or whose source is gone and its last sound arrived, fades.
   */
  choose(pool, tracks, size) {
    tracks.sort((a, b) => (b.loud * (b.voice ? KEEP : 1)) - (a.loud * (a.voice ? KEEP : 1)));
    const want = new Set(tracks.slice(0, size));
    for (const v of pool) {
      if (v.track && (!want.has(v.track) || v.track.seen + TAIL_S < v.teEnd)) {
        v.fadeTo = 0;
      }
    }
    for (const tr of want) {
      if (tr.voice && tr.voice.track === tr) {
        tr.voice.fadeTo = tr.seen + TAIL_S < tr.voice.teEnd ? 0 : 1;
        continue;
      }
      const v = pool.find((x) => !x.track);
      if (!v) {
        continue;
      }
      v.bind(tr, WORLD_KINDS[KIND_NAMES[tr.kind]]);
      tr.voice = v;
    }
  }

  renderVoice(v, out, t0, t1, n, L) {
    if (!v.track) {
      return;
    }
    this.renderSource(v, out, t0, t1, n, L);
    if (v.fade <= 0 && v.fadeTo === 0) {
      v.track.voice = null;
      v.track = null;
    }
  }

  renderSource(v, out, t0, t1, n, L) {
    const rate = this.rate;
    const tr = v.track;
    const d = this.retard(tr, t1, L);
    const te1 = this.te;
    const st = this.stateA;
    const fresh = v.distPrev < 0;
    if (fresh) {
      v.distPrev = d;
      v.teEnd = te1 - n / rate;
    }
    /* The Doppler factor: emission time elapsed over listening time. */
    const dop = Math.max(0.5, Math.min(2, (te1 - v.teEnd) / (n / rate)));
    v.drive(st, n / rate);
    /* Direction, as heard: the source at te from the listener now. */
    const dx = st[0] - L[0];
    const dy = st[1] - L[1];
    const dz = st[2] - L[2];
    const inv = 1 / Math.max(1e-6, d);
    const pan = Math.max(-1, Math.min(1, (dx * L[6] + dy * L[7] + dz * L[8]) * inv));
    /* Clamped as the pan is: a cosine past 1 (a listener forward that is
     * not a unit vector) would put the far ear's corner below 0 Hz, where
     * its one pole feeds back over 1 and runs away to infinity. */
    const front = Math.max(-1, Math.min(1, (dx * L[3] + dy * L[4] + dz * L[5]) * inv));
    const back = front < 0 ? -front : 0;
    /* The ground's image under the listener's ground: its path's extra
     * length is the reflection's delay. */
    /* The reflecting plane: the listener's ground, or the source's own
     * level when it is lower (a boat on a lake below the bank, a shore's
     * water), where its image all but coincides with it: the pressure
     * doubling of a source on a hard surface. */
    const gy = Math.min(L[9], st[1]);
    const iy = 2 * gy - st[1];
    const d2 = Math.hypot(dx, iy - L[1], dz);
    const extra = Math.max(0, (d2 - d) / C_AIR) * rate;
    const reflG = extra < REFL_LEN - 2 ? v.spec.ground * d / Math.max(d, d2) : 0;
    const g1 = v.spec.amp * v.level * spread(v.spec, d);
    const kA = onePole(absorbHz(d), rate);
    const kR = onePole(absorbHz(d2) * 0.5, rate);
    const kB = onePole(1800 + 12000 * (1 - back), rate);
    const fadeStep = 1 / (FADE_S * rate);
    const p0 = fresh ? pan : v.panPrev;
    const gPrev = fresh ? g1 : v.gainPrev;
    const oL = out[0];
    const oR = out[1];
    /* Equal power gains at both ends of the quantum, ramped between. */
    const l0 = gPrev * Math.sqrt(0.5 * (1 - p0));
    const r0 = gPrev * Math.sqrt(0.5 * (1 + p0));
    const dl = (g1 * Math.sqrt(0.5 * (1 - pan)) - l0) / n;
    const dr = (g1 * Math.sqrt(0.5 * (1 + pan)) - r0) / n;
    v.prepare(dop);
    for (let i = 0; i < n; i += 1) {
      let x = v.sample();
      v.line[v.lineAt] = x;
      let refl = 0;
      if (reflG > 0) {
        let pos = v.lineAt - extra;
        if (pos < 0) {
          pos += REFL_LEN;
        }
        const i0 = Math.floor(pos);
        const fr = pos - i0;
        const a = v.line[i0 % REFL_LEN];
        const b = v.line[(i0 + 1) % REFL_LEN];
        refl = a + (b - a) * fr;
      }
      v.lineAt = (v.lineAt + 1) % REFL_LEN;
      v.absorb += kA * (x - v.absorb);
      v.reflAbsorb += kR * (refl - v.reflAbsorb);
      x = v.absorb + reflG * v.reflAbsorb;
      if (v.fade < v.fadeTo) {
        v.fade = Math.min(v.fadeTo, v.fade + fadeStep);
      } else if (v.fade > v.fadeTo) {
        v.fade = Math.max(v.fadeTo, v.fade - fadeStep);
      }
      x *= v.fade;
      /* The far ear and the back of the head: darker, by a one pole on
       * each side that opens fully in front. */
      const l = x * (l0 + dl * i);
      const r = x * (r0 + dr * i);
      /* Flushed a sample at a time: a voice that has gone quiet (a
       * cricket between chirps) decays through float32's subnormals
       * within a quantum otherwise. */
      let bl = v.back[0] + kB * (l - v.back[0]);
      let br = v.back[1] + kB * (r - v.back[1]);
      if (bl < FLUSH && bl > -FLUSH) {
        bl = 0;
      }
      if (br < FLUSH && br > -FLUSH) {
        br = 0;
      }
      v.back[0] = bl;
      v.back[1] = br;
      oL[i] += bl;
      oR[i] += br;
    }
    if (Math.abs(v.absorb) < FLUSH) {
      v.absorb = 0;
    }
    if (Math.abs(v.reflAbsorb) < FLUSH) {
      v.reflAbsorb = 0;
    }
    for (let c = 0; c < 2; c += 1) {
      if (Math.abs(v.back[c]) < FLUSH) {
        v.back[c] = 0;
      }
    }
    v.distPrev = d;
    v.panPrev = pan;
    v.gainPrev = g1;
    v.teEnd = te1;
  }

  /*
   * The far bed: per kind, the power of every source without a voice, at
   * its power weighted pan and distance, as three detuned partials of the
   * kind's note and a band of noise, lowpassed by that distance's air.
   */
  renderFar(live, out, n, L) {
    const sums = new Map();
    for (const tr of live) {
      if (tr.voice) {
        continue;
      }
      const name = KIND_NAMES[tr.kind];
      let s = sums.get(name);
      if (!s) {
        s = { p: 0, pan: 0, d: 0 };
        sums.set(name, s);
      }
      this.stateB.fill(0);
      tr.at(currentTime, this.stateB);
      const dx = this.stateB[0] - L[0];
      const dy = this.stateB[1] - L[1];
      const dz = this.stateB[2] - L[2];
      const pan = (dx * L[6] + dy * L[7] + dz * L[8]) / Math.max(1, tr.dNow);
      s.p += tr.loud;
      s.pan += tr.loud * pan;
      s.d += tr.loud * tr.dNow;
    }
    const rate = this.rate;
    for (const [name, f] of this.far) {
      if (!sums.has(name)) {
        sums.set(name, { p: 0, pan: f.pan, d: f.d });
      }
    }
    for (const [name, s] of sums) {
      const spec = WORLD_KINDS[name];
      let f = this.far.get(name);
      if (!f) {
        f = { g: 0, pan: 0, d: 1000, ph: [0, 0.33, 0.71], lp: 0, nzLp: new Svf(), nz: rng(hash(name.length * 7919 + name.charCodeAt(0))) };
        this.far.set(name, f);
      }
      const gWant = Math.sqrt(s.p) * spec.farGain;
      const panWant = s.p > 0 ? s.pan / s.p : f.pan;
      const dWant = s.p > 0 ? s.d / s.p : f.d;
      const g0 = f.g;
      const kG = 1 - Math.exp(-n / (0.3 * rate));
      f.g += kG * (gWant - f.g);
      f.pan += kG * (panWant - f.pan);
      f.d += kG * (dWant - f.d);
      if (f.g < 1e-6 && g0 < 1e-6) {
        f.g = 0;
        continue;
      }
      /* Run at a quarter of the rate and interpolated: the bed is under
       * 1.5 kHz by its lowpass and its highest partial (the quads' fourth
       * harmonic, 4 kHz) is under the reduced rate's 6 kHz Nyquist, and it
       * is a quarter of the work. */
      const note = spec.farHz;
      const sub = rate / FAR_DECIMATE;
      const kA = onePole(Math.min(absorbHz(f.d), 1500), sub);
      const fN = svfF(note * 3, sub);
      const partials = SHED[this.step].bedPartials ? 3 : 0;
      const gl = Math.sqrt(0.5 * (1 - f.pan));
      const gr = Math.sqrt(0.5 * (1 + f.pan));
      for (let i = 0; i < n; i += FAR_DECIMATE) {
        let y = 0;
        for (let k = 0; k < partials; k += 1) {
          f.ph[k] += (note * (1 + 0.013 * (k - 1))) / sub;
          if (f.ph[k] >= 1) {
            f.ph[k] -= 1;
          }
          const x = f.ph[k] * ROTOR_N;
          const j = x | 0;
          y += FAR[j] + (FAR[j + 1] - FAR[j]) * (x - j);
        }
        f.nzLp.run(f.nz(), fN, 1.2);
        y = 0.18 * y + 0.6 * f.nzLp.bp;
        const prev = f.lp;
        f.lp += kA * (y - f.lp);
        for (let q = 0; q < FAR_DECIMATE; q += 1) {
          const v = prev + (f.lp - prev) * ((q + 1) / FAR_DECIMATE);
          const g = g0 + (f.g - g0) * ((i + q) / n);
          out[0][i + q] += g * v * gl;
          out[1][i + q] += g * v * gr;
        }
      }
      if (Math.abs(f.lp) < FLUSH) {
        f.lp = 0;
      }
    }
  }

  /* Booms posted for a time: placed once the listener is known, at their
   * arrival (t + d / c), each with its images. */
  ingestBooms(now) {
    if (!this.pending.length || !this.heard) {
      return;
    }
    const L = new Float64Array(10);
    const later = [];
    for (const b of this.pending) {
      /* Placed when it goes off, from where the listener was then: an
       * offline render posts its booms ahead. */
      if (b.t > now + 0.01) {
        later.push(b);
        continue;
      }
      this.listener(b.t, L);
      const paths = [[b.p[0], b.p[1], b.p[2], 1, false], ...(b.images || []).map((m) => [m[0], m[1], m[2], m[3], true])];
      let k = 0;
      for (const [x, y, z, g, image] of paths) {
        const dx = x - L[0];
        const dy = y - L[1];
        const dz = z - L[2];
        const d = b.dist != null && !image ? b.dist : Math.hypot(dx, dy, dz);
        const pan = d > 0.5 ? Math.max(-1, Math.min(1, (dx * L[6] + dy * L[7] + dz * L[8]) / d)) : 0;
        const seed = hash((b.seed >>> 0) + 977 * k);
        this.blasts.push(b.material
          ? new Breach(this.rate, seed, b.t + d / C_AIR, b, g, d, pan, image)
          : new Blast(this.rate, seed, b.t + d / C_AIR, (b.level ?? 1) * g, d, pan, image));
        k += 1;
      }
    }
    this.pending = later;
  }

  renderBlasts(out, t0, n) {
    if (!this.blasts.length) {
      return;
    }
    const L = this.blastL || (this.blastL = new Float32Array(n));
    const R = this.blastR || (this.blastR = new Float32Array(n));
    const E = this.blastE || (this.blastE = new Float32Array(n));
    L.fill(0);
    R.fill(0);
    E.fill(0);
    for (const b of this.blasts) {
      b.render(t0, n, L, R, E);
    }
    /* The rumble: from both sides, its own noise each, the terrain giving
     * it back from everywhere. */
    const f = svfF(140, this.rate);
    const rl = this.rumbleL;
    const rr = this.rumbleR;
    for (let i = 0; i < n; i += 1) {
      rl.run(this.rumbleNz[0](), f, 1.2);
      rr.run(this.rumbleNz[1](), f, 1.2);
      out[0][i] += knee(L[i] + E[i] * rl.lo);
      out[1][i] += knee(R[i] + E[i] * rr.lo);
    }
    this.blasts = this.blasts.filter((b) => !b.done);
  }
}

registerProcessor('fdfpv-world', WorldProcessor);
