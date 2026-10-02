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

import { KINDS as KIND_NAMES, WORLD_KINDS, SOURCE_STRIDE } from './world-kinds.js';

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
/* The voice pool: the full war (120 attackers and a boom every half
 * second, tools/audio/world-scenes.js war-full) renders under the cost
 * bar with this many on Chromium's worklet (tools/audio/world.js
 * --browser; docs/AUDIO.md section 12). */
const VOICES = 14;
/* A source holding a voice keeps it unless another is this many times
 * louder (about 3 dB): the hysteresis that stops two sources at the same
 * distance trading one voice every quantum. */
const KEEP = 2;
/* Voice fade in and out, s. */
const FADE_S = 0.06;
const FLUSH = 1e-20;
/* The far bed runs at this fraction of the rate (renderFar). */
const FAR_DECIMATE = 4;
/* An explosion's trim, set by measurement (tools/audio/world.js): a
 * warhead (level 0.67) at 40 m reads momentary -14.6 LUFS in the Node mix
 * and -15.3 through the live graph, whose limiter takes the difference,
 * at the default volume: under the near explosion's -12, and its 2 to
 * 5 kHz share under the bar for every seed. */
const BLAST_GAIN = 1.8;

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
/* A prop's own table, built per voice at bind: one revolution. */
const PROP_N = 1024;

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
    this.y2 = 0;
    this.a1 = 0;
    this.a2 = 0;
    this.b0 = 0;
  }

  tune(hz, decayS, rate) {
    const r = Math.exp(-1 / (decayS * rate));
    const w = (TAU * Math.min(hz, rate / 2.5)) / rate;
    this.a1 = 2 * r * Math.cos(w);
    this.a2 = -r * r;
    this.b0 = (1 - r) * Math.sqrt(1 - 2 * r * Math.cos(2 * w) + r * r);
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
 * One source's track: its kind, and a history of (t, position, velocity).
 * Positions are scene world metres, y up (src/render/frame.js), the frame
 * every caller already has; nothing here converts.
 */
class Track {
  constructor(id, kind) {
    this.id = id;
    this.kind = kind;
    this.seed = hash(id * 31 + kind);
    this.hist = new History(6);
    this.row = new Float64Array(6);
    this.seen = -Infinity;
    this.first = Infinity;
    this.voice = null;
    this.loud = 0;
    this.dNow = 0;
  }

  push(t, x, y, z, vx, vy, vz) {
    const r = this.row;
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

  /* The state at time t into out [x, y, z, vx, vy, vz]: cubic Hermite
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
 *   rotors    four small props a few percent apart, beating (a quad)
 *   water     a hull's wash and slap, level with speed
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
    this.bb = new Svf();
    this.wash = new Svf();
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
   * The engine's state at the emission time: rpm from the speed through
   * the air, load from the climb and the acceleration. `state` is [x, y,
   * z, vx, vy, vz]. The engine sits near its cruise rpm, a little over in
   * a climb, under in a glide or a dive (which windmills it); a munition
   * that powers into its dive (powerDive) winds up instead, the rising
   * whine of its terminal run.
   */
  drive(state, dt) {
    const s = this.spec;
    const sp = Math.sqrt(state[3] * state[3] + state[4] * state[4] + state[5] * state[5]);
    const climb = sp > 1 ? state[4] / sp : 0;
    const x = Math.min(1.3, sp / Math.max(1, s.cruise));
    let rpm = s.cruiseRpm * (0.75 + 0.25 * x) * (1 + 0.12 * (s.powerDive ? Math.abs(climb) : climb));
    rpm *= this.rpmTrim;
    const accel = (rpm - this.rpm) / Math.max(1e-3, dt) / s.cruiseRpm;
    this.rpm = this.rpm === 0 ? rpm : this.rpm + 0.3 * (rpm - this.rpm);
    const want = Math.max(0.2, Math.min(1.5, 0.6 + 0.4 * Math.sign(accel) * Math.min(1, Math.abs(accel)) + 0.5 * (state[4] / Math.max(4, sp))));
    this.load += 0.1 * (want - this.load);
    this.speed = sp;
    /* Level with rpm to the first power: about 2 dB from cruise to a
     * powered dive, compressed from the aeroacoustic fourth to sixth
     * for the reason the engine's own law is (engine-worklet.js
     * motorAmps). */
    this.level = Math.min(1.6, this.rpm / s.cruiseRpm);
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
    if (this.gWash > 1e-4) {
      /* A hull: the wash, and the slap of the hull meeting the chop a few
       * times a second, faster the faster it goes. */
      this.wash.run(nz(), this.fWash, 1.4);
      this.slap += (1.2 + 0.25 * this.speed) / rate;
      const slap = 1 + 0.6 * sinC(this.slap) * (0.5 + 0.5 * sinC(0.37 * this.slap));
      y += this.gWash * this.wash.lo * slap;
    }
    return y;
  }

  /* A firing: this cycle's strength and timing (Heywood 1988, 9.4), a
   * misfire now and then, the muffler struck afresh. */
  fire() {
    const s = this.spec;
    const nz = this.nz;
    const rpm = this.rpm;
    const ref = s.cruiseRpm;
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

class WorldProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.rate = sampleRate;
    this.poolSize = o.voices || VOICES;
    this.tracks = new Map();
    this.voices = [];
    for (let i = 0; i < this.poolSize; i += 1) {
      this.voices.push(new Voice(this.rate));
    }
    /* The listener's history: x, y, z, forward, right, its ground's y. */
    this.lis = new History(10);
    this.heard = false;
    this.blasts = [];
    this.pending = [];
    this.rumbleL = new Svf();
    this.rumbleR = new Svf();
    this.rumbleNz = [rng(0x27d4eb2f), rng(0x165667b1)];
    this.stateA = new Float64Array(6);
    this.stateB = new Float64Array(6);
    this.far = new Map();
    this.stats = { voiced: 0, voicedMax: 0, bedded: 0, tracks: 0 };
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
    if (m.stats) {
      this.port.postMessage({ stats: { ...this.stats } });
    }
  }

  frame(f) {
    this.lis.push(f.t, f.lis);
    this.heard = true;
    const s = f.src;
    if (!s) {
      return;
    }
    for (let i = 0; i + SOURCE_STRIDE <= s.length; i += SOURCE_STRIDE) {
      const id = s[i];
      const kind = s[i + 1];
      let tr = this.tracks.get(id);
      if (!tr || tr.kind !== kind) {
        tr = new Track(id, kind);
        this.tracks.set(id, tr);
      }
      tr.push(f.t, s[i + 2], s[i + 3], s[i + 4], s[i + 5], s[i + 6], s[i + 7]);
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
    return d;
  }

  process(inputs, outputs) {
    const out0 = outputs[0];
    const out2 = outputs[2];
    const n = out0[0].length;
    const rate = this.rate;
    const t0 = currentTime;
    const t1 = t0 + n / rate;
    this.ingestBooms(t0);
    if (!this.heard) {
      this.renderBlasts(out2, t0, n);
      return true;
    }
    const L = this.listener(t1, this.lisNow || (this.lisNow = new Float64Array(10)));
    this.lis.prune(t1 - HIST_KEEP_S);

    /* ---- who is heard: every track's loudness at the listener ---- */
    const live = [];
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
      const g = spec.amp * REF_M / Math.max(NEAR_M, dNow);
      tr.loud = g * g * Math.min(1, absorbHz(dNow) / 2000);
      tr.dNow = dNow;
      live.push(tr);
    }
    live.sort((a, b) => (b.loud * (b.voice ? KEEP : 1)) - (a.loud * (a.voice ? KEEP : 1)));
    const want = new Set(live.slice(0, this.poolSize));
    /* Free the voices whose source fell out of the set: they fade. */
    for (const v of this.voices) {
      if (v.track && !want.has(v.track)) {
        v.fadeTo = 0;
      }
      if (v.track && v.track.seen + TAIL_S < v.teEnd) {
        /* The source is gone and its last sound has arrived. */
        v.fadeTo = 0;
      }
    }
    for (const tr of want) {
      if (tr.voice && tr.voice.track === tr) {
        tr.voice.fadeTo = tr.voice.track.seen + TAIL_S < tr.voice.teEnd ? 0 : 1;
        continue;
      }
      const v = this.voices.find((x) => !x.track) || null;
      if (!v) {
        continue;
      }
      v.bind(tr, WORLD_KINDS[KIND_NAMES[tr.kind]]);
      tr.voice = v;
    }

    /* ---- the voices ---- */
    for (const v of this.voices) {
      if (!v.track) {
        continue;
      }
      this.renderVoice(v, out0, t0, t1, n, L);
      if (v.fade <= 0 && v.fadeTo === 0) {
        v.track.voice = null;
        v.track = null;
      }
    }

    /* ---- the far bed: everyone without a voice ---- */
    this.renderFar(live, out0, n, L);
    this.renderBlasts(out2, t0, n);
    let voiced = 0;
    for (const v of this.voices) {
      voiced += v.track ? 1 : 0;
    }
    this.stats.voiced = voiced;
    this.stats.voicedMax = Math.max(this.stats.voicedMax, voiced);
    this.stats.tracks = this.tracks.size;
    this.stats.bedded = Math.max(0, live.length - voiced);
    return true;
  }

  renderVoice(v, out, t0, t1, n, L) {
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
    const front = (dx * L[3] + dy * L[4] + dz * L[5]) * inv;
    const back = front < 0 ? -front : 0;
    /* The ground's image under the listener's ground: its path's extra
     * length is the reflection's delay. */
    const gy = L[9];
    const iy = 2 * gy - st[1];
    const d2 = Math.hypot(dx, iy - L[1], dz);
    const extra = Math.max(0, (d2 - d) / C_AIR) * rate;
    const reflG = extra < REFL_LEN - 2 ? v.spec.ground * d / Math.max(d, d2) : 0;
    const g1 = v.spec.amp * v.level * REF_M / Math.max(NEAR_M, d);
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
      v.back[0] += kB * (l - v.back[0]);
      v.back[1] += kB * (r - v.back[1]);
      oL[i] += v.back[0];
      oR[i] += v.back[1];
    }
    if (Math.abs(v.absorb) < FLUSH) {
      v.absorb = 0;
    }
    if (Math.abs(v.reflAbsorb) < FLUSH) {
      v.reflAbsorb = 0;
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
      const gl = Math.sqrt(0.5 * (1 - f.pan));
      const gr = Math.sqrt(0.5 * (1 + f.pan));
      for (let i = 0; i < n; i += FAR_DECIMATE) {
        let y = 0;
        for (let k = 0; k < 3; k += 1) {
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
        this.blasts.push(new Blast(this.rate, hash((b.seed >>> 0) + 977 * k), b.t + d / C_AIR, (b.level ?? 1) * g, d, pan, image));
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
