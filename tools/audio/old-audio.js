/*
 * old-audio.js: THE BASELINE, frozen. src/render/audio.js as it shipped
 * before the physically driven engine became the game's sound (commit
 * 55849520, fdflabs/fdfpv#349), kept for one job: tools/audio/drive.js
 * renders OLD from it, so the listening page and tools/audio/render.js can
 * still put the old sound beside the new one. The game never loads it.
 *
 * Not maintained and not to be fixed: its float LCG noise repeats every
 * 10466 samples and that is part of what it is the baseline of. Only its
 * two imports were repointed. Its own header follows unchanged.
 */
/*
 * audio.js: motor noise as a flight instrument, and a mix around it.
 *
 * Pilots fly quads by ear as much as by eye: the blade pass tone tells you
 * what the throttle is doing before the picture does, and the beat between
 * four slightly different motor speeds is what makes a quad sound like a
 * quad instead of a drone. So this is per motor, driven by that motor's own
 * RPM, not a single throttle-scaled loop.
 *
 * THE MOTOR REGISTER, and why it is low. An earlier round's graph put the
 * oscillators in the kilohertz range with square partials to 8 kHz, and the
 * owner called it loud screaming. The fundamental IS the blade pass
 * frequency now, motor RPM over 60 times the blade count, which on this
 * plant is 130 to 430 Hz in flight: a hum with body rather than a saw in
 * the presence band. A chosen periodic wave through a lowpass whose corner
 * tracks the fundamental but is CAPPED gives the harmonics that make it
 * read as a motor and nothing above them. An earlier round lowered the cap
 * from 1150 to 1000 Hz and the default motor stem from 0.6 to 0.5, in the
 * owner's words "low softened quiet, not obtrusive", which is also how the
 * shipping simulators mix it: motors just audible under the wind, never
 * the loudest thing in the render.
 *
 * IT WAS STILL THE LOUDEST THING IN THE RENDER. On a flight trace the
 * motor stem measured -18.45 dBFS against the music's -28.34 and the
 * wind's -32.99, so every one of those claims was aspiration rather than
 * measurement, and the owner came back with a number: the motors need to be
 * about 70 percent quieter than the music. 70 percent quieter in amplitude
 * is a factor of 0.3, so 10.5 dB of RATIO, and it is split rather than
 * taken all from one side: 4.0 dB off the motor voice gains here, 6.5 dB on
 * to the bed in music.js. The split is forced. The motors were carrying
 * the mix's loudness, and taking the whole 10.5 dB off them alone measured
 * a flight render at -24.7 dBFS, outside the -20 to -14 dBFS band the
 * loudness bar asks for. Every figure is in PROGRESS.md either side of
 * the change. The flight instrument survives because the information is
 * in the PITCH, which is untouched.
 *
 * THE AMBIENCE IS GONE. It was a looped lowpassed-noise buffer with a
 * handful of sine birds, and the owner heard it as a hum. The stem, the
 * bake, the settings row and the airspeed fade are all removed. A saved
 * ambienceLevel is ignored.
 *
 * MOTORS AND WIND, 70 PERCENT DOWN. Applied on the stem buses as
 * FLIGHT_STEM 0.3, so a Motors or Wind setting of 5 is the same ratio
 * it always was, just 10.5 dB quieter against the music. The blade pass
 * pitch and the 6 dB throttle span are the voice law, not the bus, and
 * they do not move.
 *
 * THE CUES. A gate pass is a satisfying CLICK now, a knuckle of filtered
 * noise over a falling tick, not a synth blip; a frame graze is the same
 * family an octave and a half down, so the reward and the penalty cannot
 * be confused. The menu makes small clicks of the same family through
 * ui(). All of it runs on the two pooled cue voices that already existed:
 * no event creates a node.
 *
 * Music is the recorded crates in assets/music, Opus in a WebM with an mp3
 * fallback, played by src/render/music.js through one MediaElementSource
 * on this same mix. Cues still duck it. The generated drum and bass crate
 * is gone. There are two crates and setMusicContext says which one is
 * wanted: the flight records while the pilot is flying, a quieter two
 * record bed everywhere else. Cues only ever fire in flight, so the duck
 * is a flight thing and the menu bed never sees it.
 *
 * The graph is built by attach(ctx), which takes any BaseAudioContext, and
 * update() takes the time to schedule at. Both exist so that
 * scripts/audio-probe.js can build this exact graph on an
 * OfflineAudioContext, drive it from a scripted RPM trace, and render it to a
 * buffer an FFT can read. A claim about the mix with no rendered buffer
 * behind it is a claim about nothing, and there is no way to hear this
 * container. The live path passes no time and reads ctx.currentTime, which is
 * what it did before.
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

import { Music } from '../../src/render/music.js';
import { WarRadio, VOICE_DUCK } from '../../src/render/warradio.js';

/*
 * THE VOICE, which is the machine's shape as the ear hears it. The blade
 * pass frequency is what a motor's fundamental IS: each blade passing a
 * fixed point pushes one pressure pulse, so a prop with B blades at N
 * revolutions per minute radiates at BN/60 Hz. Everything else here that
 * depends on the aircraft rather than on the mix is beside it.
 *
 *   quad  Three blades, because the prop the plant is built around is a
 *         5 x 4.3 x 3. Four motors spread across the stereo field so the
 *         beat between them is audible. The loudness law tops out at 9000
 *         RPM and the wind at 32 m/s, the numbers every figure in
 *         PROGRESS.md was measured at, and the wind's lowpass stays where
 *         it was measured too.
 *   wing  One motor, a 6 x 4 two blade, in the centre of the field because
 *         a pusher sits on the centre line behind the camera. Slots 1 to 3
 *         arrive at zero RPM from the plant and fall under MOTOR_MUTE_RPM,
 *         so they are silent by the same rule that silences a parked quad;
 *         nothing here special cases them. The loudness law tops out at the
 *         plant's 17,600 RPM, which is 0.85 of the no load figure at full
 *         duty, and the wind at the wing's 24 m/s top speed. The wind is
 *         the instrument on a wing, since a glide has no motor at all, so
 *         its lowpass opens with airspeed: a hiss that brightens as the
 *         wing speeds up, under 2 kHz still so the cues keep their band.
 *   glow4 A four stroke glow engine, the Kadet Senior's O.S. FS-52 Surpass
 *         (docs/KADET-STAGE1.md). What the ear hears of a single cylinder
 *         four stroke is not its prop but its exhaust: one blowdown pulse
 *         per power stroke, and a four stroke fires once every OTHER
 *         revolution, so its note is rpm / 120, a thump rather than a
 *         tone, an octave under a two stroke glow engine at the same rpm,
 *         which fires every revolution. The prop's two blades are in the
 *         wave as the firing rate's fourth harmonic. `perRev` is an
 *         eighth: one period of the wave is four firing cycles, eight
 *         revolutions, each a little different, so the lope a pilot hears
 *         at idle is in the wave (fourStrokeWave). The loudness law tops
 *         out at the plant's full throttle rpm on the ground.
 *   glow2 A two stroke glow engine, the Buzzard Bombshell's Cox .049 or a
 *         two stroke on the Kadet Senior (docs/POWER-STAGE1.md). A two
 *         stroke fires every revolution, so its note is rpm / 60, the
 *         octave over a four stroke at the same rpm: the exhaust port's
 *         blowdown once a turn, the prop's two blades twice a turn under
 *         it, and a smaller cycle to cycle spread than the four stroke's
 *         lope, because a two stroke at speed fires every turn and its
 *         misses are an idle's (Heywood, 1988, 9.4, as above). `perRev` is
 *         a quarter: one period of the wave is four firing cycles.
 *   edf   A ducted fan, the F-16's 70 mm twelve blade rotor
 *         (docs/F16-STAGE1.md). What makes a fan a whine and not a prop's
 *         buzz is its blade pass: twelve blades at 41,700 rpm pass 8.3 kHz,
 *         a tone high in the ear's most sensitive band, over a little of
 *         the shaft's own rate, which an unbalanced rotor and the motor's
 *         poles put there. The wave is one revolution long (`perRev` 1, so
 *         its fundamental is the shaft rate the plant reports), its twelfth
 *         harmonic the blade pass and its twenty fourth the pass's octave
 *         (fanWave). The lowpass cap that keeps the props' 2 to 8 kHz band
 *         quiet would take the whine away, so this voice carries its own,
 *         `lpCap`, over the blade pass at full throttle, and a `gain` that
 *         takes the stem 9.5 dB under a prop's so a tone that high is not
 *         a hurt. The fan spools behind the stick in the plant, so the
 *         whine rises and falls a beat after the throttle, as a real one
 *         does.
 *
 * `perRev` is how many periods of the voice's wave one revolution makes,
 * which for a prop's own tone is its blade count; `lpTrack` is where the
 * motor lowpass sits as a multiple of that frequency; `lpCap`, where given,
 * replaces MOTOR_LP_CAP for that voice, and `gain` scales its stem.
 */
export const VOICES = {
  quad: { perRev: 3, wave: 'blade', lpTrack: 3.4, rpmFull: 9000, speedFull: 32, pan: [0.45, 0.32, -0.45, -0.32], windCorner: 900, windOpen: 0 },
  wing: { perRev: 2, wave: 'blade', lpTrack: 3.4, rpmFull: 17600, speedFull: 24, pan: [0, 0, 0, 0], windCorner: 600, windOpen: 1100 },
  glow4: { perRev: 1 / 8, wave: 'fourStroke', lpTrack: 48, rpmFull: 9500, speedFull: 24, pan: [0, 0, 0, 0], windCorner: 600, windOpen: 1100 },
  glow2: { perRev: 1 / 4, wave: 'twoStroke', lpTrack: 24, rpmFull: 9350, speedFull: 24, pan: [0, 0, 0, 0], windCorner: 600, windOpen: 1100 },
  edf: { perRev: 1, wave: 'fan', lpTrack: 14, lpCap: 10000, gain: 0.335, rpmFull: 41700, speedFull: 46, pan: [0, 0, 0, 0], windCorner: 600, windOpen: 1100 },
};

/*
 * The prototype's models (src/render/engine-worklet.js MODELS). A shipped
 * voice names one by default; an aircraft whose voice is wrong for what it
 * is says which model it is through setLabModel: the Striker's boxer twin
 * is on 'glow2' and its turbojet on 'edf', the ducted fan's, in VOICES,
 * and the prototype voices them as what they are.
 */
export const LAB_MODELS = new Set(['quad', 'wing', 'edf', 'glow2', 'glow4', 'boxer2', 'turbojet']);
export function labModelFor(voice) {
  const name = Object.keys(VOICES).find((k) => VOICES[k] === voice);
  return LAB_MODELS.has(name) ? name : 'quad';
}
/* The Striker's two propulsions as the prototype hears them. */
export function labModelForCraft(airframeId, propulsionId) {
  if (airframeId === 'striker2500') {
    return propulsionId === 'jet' ? 'turbojet' : 'boxer2';
  }
  return null;
}

/*
 * The motor lowpass tracks the fundamental so the timbre holds across the
 * throttle range, but it is capped, and the cap is the single number that
 * decides whether this mix hurts. 1000 Hz keeps at most the first six
 * harmonics of a 165 Hz hover tone and nothing at all in the 2 to 8 kHz band
 * the ear complains about first. It was 1150; the owner asked for softer
 * still, and dropping the cap is the honest way to do it because it takes
 * edge off the timbre without touching the pitch the pilot flies on.
 */
const MOTOR_LP_CAP = 1000;
const MOTOR_LP_FLOOR = 220;
/*
 * Below this the motor stem is silent. A stationary quad was not quiet: with
 * the oscillator floored at 20 Hz and a 0.119 idle gain, the title screen
 * measured -21.5 dBFS of 20 to 46 Hz drone, which is louder than the entire
 * music bed at maximum and sits directly on top of the bass line. No headphone
 * reproduces it as pitch, so it was pure wasted headroom.
 */
const MOTOR_MUTE_RPM = 600;
/*
 * The motor voice as a chosen spectrum rather than a filtered sawtooth.
 *
 * A sawtooth through two lowpasses gave harmonics at exact integer multiples
 * with the first three within 7.5 dB of each other and nothing modulating
 * them, which a reviewer correctly called a nasal synth buzz rather than air
 * being moved. These are the amplitudes a blade pass tone actually wants, with
 * the phases scrambled across real and imaginary so the waveform is not a
 * sawtooth's sharp ramp. Magnitudes come out at 1.0, 0.50, 0.28, 0.10, 0.04.
 */
const MOTOR_WAVE_REAL = [0, 0.0, 0.35, -0.10, 0.06, -0.02];
const MOTOR_WAVE_IMAG = [0, 1.0, -0.36, 0.26, -0.08, 0.03];

/*
 * A single cylinder four stroke's exhaust, four firing cycles long, as a
 * spectrum for createPeriodicWave.
 *
 * Each cycle, 720 degrees of crank, is the exhaust valve's blowdown: a
 * pressure pulse as it opens that rings down in the header and muffler (a
 * damped sine ringing at five times the firing rate and gone within a
 * quarter of the cycle), a weaker suck back half a cycle later as the
 * valves overlap, and the prop's two blades, four passes a cycle, under
 * it. Combustion does not repeat: the cycle to cycle variation of a spark
 * or glow engine's peak pressure is several percent and is largest at
 * idle (Heywood, Internal Combustion Engine Fundamentals, 1988, 9.4), so
 * the four cycles differ by that much in strength and a little in timing,
 * and the pattern they repeat in is the lope. Shaped from that physics,
 * not fitted to a recording: there is none in this repository.
 */
const FOUR_STROKE_CYCLES = [
  { amp: 1.00, lag: 0.000 },
  { amp: 0.84, lag: 0.014 },
  { amp: 1.09, lag: -0.009 },
  { amp: 0.91, lag: 0.006 },
];
const FOUR_STROKE_HARMONICS = 48;
function blowdown(x) {
  return x >= 0 ? Math.exp(-x / 0.08) * Math.sin((2 * Math.PI * x) / 0.2) : 0;
}
/* A two stroke's four cycles: the same kind of spread, smaller, and no
 * suck back, since the port scavenges rather than overlapping valves. */
const TWO_STROKE_CYCLES = [
  { amp: 1.00, lag: 0.000 },
  { amp: 0.95, lag: 0.006 },
  { amp: 1.04, lag: -0.004 },
  { amp: 0.97, lag: 0.003 },
];
function fourStrokeWave() {
  return exhaustWave(FOUR_STROKE_CYCLES, 0.25, 4);
}
function twoStrokeWave() {
  return exhaustWave(TWO_STROKE_CYCLES, 0, 2);
}
/* One firing cycle per quarter of the wave: the blowdown pulse, a suck
 * back half a cycle later at `suckBack` of it, and `bladePasses` blade
 * passes a cycle under them, as a spectrum for createPeriodicWave. */
function exhaustWave(cyclesTable, suckBack, bladePasses) {
  const n = 4096;
  const cycles = cyclesTable.length;
  const wave = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const u = (i / n) * cycles;
    const k = Math.floor(u);
    const phi = u - k;
    const { amp, lag } = cyclesTable[k];
    const pulse = amp * (blowdown(phi - lag) + blowdown(phi - lag + 1));
    const suck = -suckBack * amp * (blowdown(phi - lag - 0.5) + blowdown(phi - lag + 0.5));
    const blades = 0.14 * Math.sin(2 * Math.PI * bladePasses * phi);
    wave[i] = pulse + suck + blades;
  }
  const real = new Float32Array(FOUR_STROKE_HARMONICS + 1);
  const imag = new Float32Array(FOUR_STROKE_HARMONICS + 1);
  for (let h = 1; h <= FOUR_STROKE_HARMONICS; h += 1) {
    let a = 0;
    let b = 0;
    for (let i = 0; i < n; i += 1) {
      const w = (2 * Math.PI * h * i) / n;
      a += wave[i] * Math.cos(w);
      b += wave[i] * Math.sin(w);
    }
    real[h] = (2 * a) / n;
    imag[h] = (2 * b) / n;
  }
  return { real, imag };
}
/* A twelve blade fan, one revolution long: the shaft's rate and its
 * first harmonics faint, the blade pass (the twelfth) the tone, its
 * octave and twelfth under it, and a sideband either side of the pass
 * where the rotor's small imbalance modulates it. Magnitudes from the
 * shape of a ducted rotor's published spectra, tonal at the blade pass
 * over a broadband floor (Weinstein et al.'s EDF, and the aeroacoustics of
 * electric ducted fans surveyed in Aerospace Science and Technology,
 * 2024); no recording was used. */
function fanWave() {
  const real = new Float32Array(37);
  const imag = new Float32Array(37);
  const tone = { 1: 0.10, 2: 0.06, 3: 0.03, 11: 0.10, 12: 1.0, 13: 0.10, 24: 0.28, 36: 0.08 };
  let k = 0;
  for (const [h, a] of Object.entries(tone)) {
    const phase = 0.7 * k;
    real[Number(h)] = a * Math.cos(phase);
    imag[Number(h)] = a * Math.sin(phase);
    k += 1;
  }
  return { real, imag };
}
const WAVES = {
  blade: () => ({ real: new Float32Array(MOTOR_WAVE_REAL), imag: new Float32Array(MOTOR_WAVE_IMAG) }),
  fan: fanWave,
  fourStroke: fourStrokeWave,
  twoStroke: twoStrokeWave,
};
/*
 * How far the blade pass tone wanders, in cents, driven by slow noise. Real
 * blades do not pass at mathematically constant intervals, and this is the
 * difference between a synthesiser and a motor.
 */
const MOTOR_DETUNE_CENTS = 5.2;

/*
 * The binaural focus tone. 6 Hz is in the theta band, 4 to 8 Hz, and 220 Hz
 * is the carrier, chosen high enough to sit above the motor fundamental's
 * hover range and low enough that a binaural difference is a difference of
 * carriers rather than of overtones. It is off by default, it is a setting,
 * and the interface says it needs headphones and claims nothing else.
 */
const MASTER_CEILING = 0.85;
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
 * Keep 30 percent of the motor and wind stems. The owner asked to drop
 * both by 70 percent, relative to the rest of the mix. Applied on the
 * stem buses so the RPM-to-gain law, the 6 dB throttle span, and the
 * pitch the pilot flies on are untouched. Music and cues do not ride
 * these buses.
 */
const FLIGHT_STEM = 0.3;

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
    this.motors = [];
    this.enabled = false;
    this.master = null;
    this.noiseGain = null;
    this.level = 0.5; /* mix level, driven by the volume setting */
    /* Per stem, each 0 to 1, driven by their own settings rows. These
     * mirror the DEFAULTS in src/ui/ui.js divided by ten, and the probe
     * measures at exactly these values when no mix argument is given. */
    this.mix = { motors: 0.5, wind: 0.5, music: 0.5, focus: 1, ambience: 0 };
    this.focusOn = false;
    this.voice = VOICES.quad;
    /* A prop with another blade count than the voice's own: its blade
     * pass is this many times the voice's (setBladeScale). 1 always for
     * an engine, whose note is its firing, not its blades. */
    this.bladeScale = 1;
    /* The periodic waves the voices use, built for a context on first use. */
    this.waves = null;
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
    /* The physically driven prototype (src/render/engine-worklet.js,
     * docs/AUDIO.md), off unless the page asked for it before attach. */
    this.lab = false;
    this.labModel = null;
    this.engine = null;
    this.ready = Promise.resolve();
  }

  /*
   * THE AUDIOLAB PROTOTYPE, behind a flag that is off for every player.
   * Read once, by attach(): the graph is built one way or the other. With
   * it on, the four motor chains and the wind chain are not built and one
   * AudioWorkletNode replaces them, with a limiter in front of the soft
   * clip. With it off, attach() builds exactly what it always has.
   */
  setLab(on) {
    if (this.ctx) {
      throw new Error('audio: setLab after attach');
    }
    this.lab = Boolean(on);
  }

  /* Which machine the prototype voices, LAB_MODELS below; null is the
   * voice's own. Safe either side of attach. */
  setLabModel(name) {
    if (name != null && !LAB_MODELS.has(name)) {
      throw new Error(`audio: no lab model ${name}`);
    }
    this.labModel = name;
    this.postLabModel();
  }

  postLabModel() {
    if (this.engine) {
      this.engine.port.postMessage({ model: this.labModel ?? labModelFor(this.voice) });
    }
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
   * Per stem levels. Any subset; a missing key is left alone. Each one has
   * to make a MEASURABLE difference in the probe output, so each lands on a
   * real bus gain rather than on a label.
   */
  setMix(m) {
    if (!m) {
      return;
    }
    if (typeof m.motors === 'number') {
      this.mix.motors = Math.max(0, Math.min(1, m.motors));
    }
    if (typeof m.wind === 'number') {
      this.mix.wind = Math.max(0, Math.min(1, m.wind));
    }
    if (typeof m.music === 'number') {
      this.mix.music = Math.max(0, Math.min(1, m.music));
      this.music.setLevel(this.mix.music);
      if (this.warRadio) {
        this.warRadio.setMusicLevel(this.musicWanted ? this.mix.music : 0);
      }
    }
    if (typeof m.focus === 'number') {
      this.mix.focus = Math.max(0, Math.min(1, m.focus));
    }
    if (typeof m.ambience === 'number') {
      /* Kept so the probe can still name the stem. Always silent. */
      this.mix.ambience = 0;
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
   * war asks for it once the context is up. Its two elements play beside
   * the graph, not in it (the node budget is spent), at the volume
   * setting and silent with the sound off, which update() hands it every
   * frame as the master's own target. A call ducks the motors and the
   * wind as a cue does.
   */
  war() {
    if (!this.warRadio) {
      this.warRadio = new WarRadio();
      this.warRadio.onSpeak = () => this.duckFlight(this.ctx.currentTime, VOICE_DUCK, 2.5);
    }
    if (this.ctx && !this.warRadio.ready) {
      this.warRadio.attach();
      this.warRadio.setMusicLevel(this.musicWanted ? this.mix.music : 0);
      this.warRadio.setOutput(this.enabled ? this.level * MASTER_CEILING : 0);
    }
    return this.warRadio;
  }

  /* The war's music on, or off and the crate's back. */
  setWarBed(track) {
    const radio = this.war();
    this.warBed = Boolean(track);
    this.music.setEnabled(this.musicWanted && !this.warBed);
    radio.music(track);
  }

  /*
   * Which machine the mix is the sound of: 'quad' or 'wing', see VOICES.
   * Safe before attach, since the voice is data until update() reads it;
   * after attach it re-seats the motor pans, which are the one part of the
   * voice that lives in the graph rather than in the law. An unknown name
   * is refused rather than defaulted, because a silent fallback to the
   * quad's voice on a wing is exactly the kind of wrong nobody hears.
   */
  setVoice(name) {
    const voice = VOICES[name];
    if (!voice) {
      throw new Error(`audio: no voice named ${name}`);
    }
    const waveChanged = voice.wave !== this.voice.wave;
    this.voice = voice;
    this.postLabModel();
    const wave = waveChanged && this.ctx ? this.waveFor(voice) : null;
    for (let m = 0; m < this.motors.length; m += 1) {
      const { pan, osc } = this.motors[m];
      if (pan) {
        pan.pan.value = voice.pan[m];
      }
      if (wave) {
        osc.setPeriodicWave(wave);
      }
    }
  }

  /* The hangar's prop (configs/hangar-parts.js): its blade count over
   * the one the aircraft's own prop has. Only a prop's own tone, the
   * 'blade' wave, follows it. */
  setBladeScale(k) {
    if (!(k > 0) || !Number.isFinite(k)) {
      throw new Error(`audio: blade scale ${k}`);
    }
    this.bladeScale = k;
  }

  /* The voice's wave on this context, built once per context and kind: a
   * PeriodicWave is not an AudioNode, so it costs P12 nothing. */
  waveFor(voice) {
    if (!this.waves || this.waves.ctx !== this.ctx) {
      this.waves = { ctx: this.ctx };
    }
    if (!this.waves[voice.wave]) {
      const { real, imag } = WAVES[voice.wave]();
      this.waves[voice.wave] = this.ctx.createPeriodicWave(real, imag);
    }
    return this.waves[voice.wave];
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
    /* The focus tone is quiet on purpose. It is a tone under a mix, not a
     * test signal, and two steady carriers at any real level would mask the
     * flight instrument. */
    this.focusBus.gain.value = this.focusOn ? this.mix.focus * 0.15 : 0;
  }

  /* Browsers require a user gesture before audio starts. */
  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
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
   * AudioContext and by the probe with an OfflineAudioContext. Does not
   * set enabled: the caller decides, because the probe wants the mix up
   * from sample zero and the shell wants it to follow a setting.
   */
  attach(ctx, destination) {
    this.ctx = ctx;
    const out = destination || ctx.destination;
    /* One place where nodes come into existence, so the P12 count cannot
     * drift from the graph. */
    const keep = (n) => {
      this.nodes.push(n);
      return n;
    };

    /*
     * Master, and a soft clip in front of it.
     *
     * A3 wants a normal flight render between -20 and -14 dBFS with a true
     * peak below -1 and not one sample at or over full scale, and the mix now
     * has four stems and two one shot cues that can all peak together. A soft
     * knee at the end is what makes that hold at every stem setting instead
     * of only at the ones that were measured.
     */
    const shaper = keep(ctx.createWaveShaper());
    const CURVE = 1024;
    const curve = new Float32Array(CURVE);
    for (let i = 0; i < CURVE; i += 1) {
      const x = (i / (CURVE - 1)) * 2 - 1;
      /* tanh, normalised so the curve still passes through plus and minus
       * one: linear to about half scale, then bending. */
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
    /*
     * The prototype's master limiter, ahead of the soft clip: a fast, high
     * ratio compressor that holds the sum under -6 dBFS so the tanh is a
     * safety net rather than a sound (docs/AUDIO.md, the mix). Everything
     * that went to the shaper goes here instead.
     */
    let inlet = shaper;
    if (this.lab) {
      inlet = keep(ctx.createDynamicsCompressor());
      inlet.threshold.value = -6;
      inlet.knee.value = 3;
      inlet.ratio.value = 20;
      inlet.attack.value = 0.002;
      inlet.release.value = 0.2;
      inlet.connect(shaper);
    }

    /* Stem buses. Everything a setting can move lands on one of these. */
    /*
     * The flight duck. A cue used to duck the MUSIC, and the music was the one
     * stem that never masked anything: enabling the bed changes a full throttle
     * render's total RMS by 0.014 dB, because it sits 26 dB below the motors.
     * What masks a cue is the motors and the wind, so those are what a cue
     * ducks now. Measured before the change: a gate cue had -0.13 dB of
     * advantage over its own masking and a crash had -17.29 dB, so on a full
     * throttle crash the player was told nothing at all.
     */
    const flightDuck = keep(ctx.createGain());
    flightDuck.gain.value = 1;
    flightDuck.connect(inlet);
    this.flightDuck = flightDuck;

    const motorBus = keep(ctx.createGain());
    motorBus.gain.value = this.mix.motors * FLIGHT_STEM;
    /* Nothing below 60 Hz from the motors. The blade pass fundamental is
     * 130 Hz at the bottom of the flight range, so everything this removes is
     * either the idle drone or rumble no headphone renders as pitch, and it is
     * exactly the band the bass line needs. */
    const motorHp = keep(ctx.createBiquadFilter());
    motorHp.type = 'highpass';
    motorHp.frequency.value = 60;
    motorHp.Q.value = 0.7;
    motorBus.connect(motorHp);
    motorHp.connect(flightDuck);
    this.motorBus = motorBus;
    const windBus = keep(ctx.createGain());
    windBus.gain.value = this.mix.wind * FLIGHT_STEM;
    windBus.connect(flightDuck);
    this.windBus = windBus;
    const focusBus = keep(ctx.createGain());
    focusBus.gain.value = 0;
    focusBus.connect(inlet);
    this.focusBus = focusBus;

    /* One second of deterministic noise: the wind's loop and every cue's
     * noise voice below. */
    const len = Math.floor(ctx.sampleRate);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < len; i += 1) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      ch[i] = (s / 0x3fffffff) - 1.0;
    }

    if (this.lab) {
      this.attachEngine(ctx, keep, motorBus, windBus, inlet);
    } else {
      this.attachVoices(ctx, keep, motorBus, windBus, buf);
    }

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
    wreckGain.connect(inlet);
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
    scrapeEnv.connect(inlet);
    const whooshBp = bandOf('bandpass', 1.6);
    const whooshEnv = envOf();
    wreckSrc.connect(whooshBp);
    whooshBp.connect(whooshEnv);
    whooshEnv.connect(inlet);
    const shingBp = bandOf('bandpass', 3);
    shingBp.frequency.value = 6500;
    const shingEnv = envOf();
    wreckSrc.connect(shingBp);
    shingBp.connect(shingEnv);
    shingEnv.connect(inlet);
    const ringEnv = envOf();
    ringEnv.connect(inlet);
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
    coinEnv.connect(inlet);
    this.coinVoice = { osc: gateOsc, env: coinEnv };
    this.coins = 0;
    this.booms = 0;

    /* The bed. It brings its own nodes and counts them through keep. */
    this.music.attach(ctx, inlet, keep);
    this.music.setLevel(this.mix.music);
    this.applyBuses();
  }

  /*
   * The shipped voices: four motor chains and the wind chain, 21 nodes.
   * Built where attach() always built them, so with the lab off the graph
   * and its node order are what they were.
   */
  attachVoices(ctx, keep, motorBus, windBus, buf) {
    /*
     * One slow noise source feeding every motor's detune, so the blade pass
     * tone wanders instead of sitting on an exact frequency. One buffer and one
     * gain rather than one per motor, which costs two nodes instead of five;
     * the wobble is therefore common in CENTS across the four, and since each
     * motor runs at its own RPM the resulting frequency deviation still
     * differs. Correlated wobble is the honest cost of the node budget.
     */
    const dLen = Math.floor(ctx.sampleRate * 4);
    const dBuf = ctx.createBuffer(1, dLen, ctx.sampleRate);
    const dCh = dBuf.getChannelData(0);
    let ds = 24680;
    let dSmooth = 0;
    for (let i = 0; i < dLen; i += 1) {
      ds = (ds * 1103515245 + 12345) & 0x7fffffff;
      /* One pole smoothing so the detune wanders over tenths of a second
       * rather than buzzing: a fast random detune is just noise. */
      dSmooth += 0.0009 * (((ds / 0x3fffffff) - 1.0) - dSmooth);
      dCh[i] = dSmooth * 12;
    }
    const detuneSrc = keep(ctx.createBufferSource());
    detuneSrc.buffer = dBuf;
    detuneSrc.loop = true;
    const detuneGain = keep(ctx.createGain());
    detuneGain.gain.value = MOTOR_DETUNE_CENTS;
    detuneSrc.connect(detuneGain);
    detuneSrc.start();

    const motorWave = this.waveFor(this.voice);
    for (let m = 0; m < 4; m += 1) {
      const osc = keep(ctx.createOscillator());
      osc.setPeriodicWave(motorWave);
      osc.frequency.value = 120;
      detuneGain.connect(osc.detune);
      /* One lowpass now, not two. The spectrum is chosen rather than carved
       * out of a sawtooth, so there is almost nothing above the fifth harmonic
       * to remove and a single pole is enough of a safety net. */
      const lp1 = keep(ctx.createBiquadFilter());
      lp1.type = 'lowpass';
      lp1.frequency.value = 600;
      lp1.Q.value = 0.7;
      const gain = keep(ctx.createGain());
      gain.gain.value = 0.0;
      /* Spread the four motors across the stereo field so the beating
       * between them is audible, the way it is behind real goggles. */
      const pan = ctx.createStereoPanner ? keep(ctx.createStereoPanner()) : null;
      if (pan) {
        pan.pan.value = this.voice.pan[m];
      }
      osc.connect(lp1);
      lp1.connect(gain);
      if (pan) {
        gain.connect(pan);
        pan.connect(motorBus);
      } else {
        gain.connect(motorBus);
      }
      osc.start();
      this.motors.push({ osc, lp1, gain, pan });
    }

    /* Air rush: the shared noise, looped. Lowpassed, not bandpassed: a
     * bandpass on noise is a whistle, and what a pilot hears at speed is
     * broadband air. */
    const noise = keep(ctx.createBufferSource());
    noise.buffer = buf;
    noise.loop = true;
    const nf = keep(ctx.createBiquadFilter());
    nf.type = 'lowpass';
    nf.frequency.value = this.voice.windCorner;
    nf.Q.value = 0.6;
    const ng = keep(ctx.createGain());
    ng.gain.value = 0.0;
    noise.connect(nf);
    nf.connect(ng);
    ng.connect(windBus);
    noise.start();
    this.noiseGain = ng;
    this.noiseFilter = nf;
  }
  /*
   * The prototype's voice: one AudioWorkletNode (src/render/engine-worklet.js)
   * for the motors, the engine, the air and the impacts. addModule is
   * async and attach() is not, so the node arrives on `ready`, which the
   * offline renderers await before they schedule anything; update() and
   * impact() do nothing until it is there. A load failure rejects `ready`
   * and is logged, loudly, rather than leaving a silent aircraft.
   */
  attachEngine(ctx, keep, motorBus, windBus, inlet) {
    const url = new URL('./engine-worklet.js', import.meta.url);
    this.ready = ctx.audioWorklet.addModule(url).then(() => {
      const node = keep(new AudioWorkletNode(ctx, 'fdfpv-engine', {
        numberOfInputs: 0,
        numberOfOutputs: 3,
        outputChannelCount: [2, 2, 2],
        processorOptions: { model: this.labModel ?? labModelFor(this.voice) },
      }));
      node.connect(motorBus, 0);
      node.connect(windBus, 1);
      node.connect(inlet, 2);
      this.engine = node;
    });
    this.ready.catch((e) => console.error('audio: the audiolab engine failed to load', e));
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
    /* The prototype strikes its own impact. The shell's crash call knows
     * how hard but not on what, so the surface is a middling one until
     * the contact path hands its material over (docs/AUDIO.md, roll out). */
    if (kind === 'crash' && this.engine) {
      this.impact(4 * lv, 0.5, 12 * lv, t);
      return;
    }
    if (kind === 'crash') {
      const g = this.crashGain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(0.0001, t);
      /*
       * A crash is broadband and low, so it lands in the same 200 to 1800 Hz
       * region the motors own, which means ducking the motors also removes the
       * band the crash lives in. Measured at 0.85 the crash raised its own band
       * by 0.03 dB at maximum stems, and with the duck in place it read 0.81 dB
       * DOWN: the mix got quieter and nothing arrived. The cue has to carry the
       * level itself. The soft clip and MASTER_CEILING bound what this can do
       * to the true peak.
       */
      g.exponentialRampToValueAtTime(2.6 * lv, t + 0.006);
      g.exponentialRampToValueAtTime(0.0001, t + 0.42);
      const f = this.crashLp.frequency;
      f.cancelScheduledValues(t);
      /* A harder hit is brighter as well as louder, and it rings longer.
       * Level alone reads as a volume knob rather than as a bigger event. */
      f.setValueAtTime(900 + 900 * lv, t);
      f.exponentialRampToValueAtTime(220, t + 0.4);
      /* The click cues lean on this filter's Q, so a crash states its own
       * rather than inheriting whatever the last click left. */
      this.crashLp.Q.cancelScheduledValues(t);
      this.crashLp.Q.setValueAtTime(1.1, t);
      /* Duck the MOTORS and the WIND, which are what mask a crash, and duck
       * them hard: a crash is the one moment the player must not miss. */
      this.duckFlight(t, 0.28, 0.5);
      this.music.duckNow(t, 0.25, 0.55);
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
       * The click's energy sits between 2 and 5 kHz where the motors (capped
       * at 1 kHz) and the wind (lowpassed at 900 Hz) have nothing, which is
       * why it reads through a full throttle mix with a LIGHTER duck than
       * the old blip needed.
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
      f.setValueAtTime(3800, t);
      f.exponentialRampToValueAtTime(1500, t + 0.05);
      q.setValueAtTime(2.2, t);
      g.exponentialRampToValueAtTime(3.2 * lv, t + 0.0015);
      g.exponentialRampToValueAtTime(0.0001, t + 0.09);
      this.duckFlight(t, 0.5, 0.25);
      return;
    }
    if (kind === 'crunch') {
      /* Foam gives in grains: three quick bumps in the mids. */
      f.setValueAtTime(900, t);
      q.setValueAtTime(0.9, t);
      for (let k = 0; k < 3; k += 1) {
        const tk = t + k * 0.028;
        g.setValueAtTime(0.0001, tk);
        g.exponentialRampToValueAtTime((2.0 - 0.45 * k) * lv, tk + 0.004);
        g.exponentialRampToValueAtTime(0.0001, tk + 0.026);
      }
      return;
    }
    if (kind === 'chip') {
      f.setValueAtTime(3000, t);
      q.setValueAtTime(3.0, t);
      g.exponentialRampToValueAtTime(1.4 * lv, t + 0.001);
      g.exponentialRampToValueAtTime(0.0001, t + 0.025);
      return;
    }
    /* A splash: a wide burst that darkens as the water falls back. */
    f.setValueAtTime(2200, t);
    f.exponentialRampToValueAtTime(420, t + 0.55);
    q.setValueAtTime(0.6, t);
    g.exponentialRampToValueAtTime(2.2 * lv, t + 0.012);
    g.exponentialRampToValueAtTime(0.0001, t + 0.6);
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
      s = (s * 1103515245 + 12345) >>> 0;
      gate.setValueAtTime(11 + 38 * ((s >>> 8) / 16777216), t + k * 0.11);
    }
    gate.setValueAtTime(SCRAPE_GATE_HZ, t + 2.9);
    this.booms += 1;
    this.duckFlight(t, 0.35 + 0.35 * (1 - lv), 1.2);
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
   * The prototype's per frame state, as AudioParams on the engine node so
   * an offline render schedules it sample accurately. `air`, when given, is
   * { u, v, w, amps, dist, dist2, pan }: body frame velocity, m/s, the pack
   * current, A, and an off board listener's distance, ground reflection
   * path and pan. Without it the airspeed is taken as straight ahead and
   * the listener as on board.
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
   * An impact for the prototype: `impulse` N s, the surface's `hardness`
   * 0..1 (sim_material_info), the closing `speed` m/s. A rising edge on the
   * engine's impact param; the duck is the crash cue's.
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
    this.music.duckNow(t, 0.3, 0.55);
  }

  /* rpm is the four motor RPM values, speed is airspeed in m/s. atTime is
   * the context time to schedule at, for offline rendering; the live path
   * omits it and gets ctx.currentTime. `air` is the prototype's extra
   * state, updateEngine; the shipped voices ignore it. */
  update(rpm, speed, atTime, air) {
    if (!this.ctx || !this.master) {
      return;
    }
    const t = atTime == null ? this.ctx.currentTime : atTime;
    /*
     * MASTER_CEILING is headroom, and it is the number that makes A3's true
     * peak bar hold at every volume setting rather than only at the default.
     * Measured: with the soft clip saturating, the render's true peak in dBTP
     * comes out equal to the master gain in dB, so a master of 1.0 measures
     * 0.01 dBTP and a player on volume 10 clips a converter. 0.85 puts the
     * worst case at -1.41 dBTP, and the stem gains carry 1.5 dB more to keep
     * a normal flight render inside the -20 to -14 dBFS band.
     */
    const target = this.enabled ? this.level * MASTER_CEILING : 0.0;
    this.master.gain.setTargetAtTime(target, t, 0.05);
    if (this.warRadio) {
      this.warRadio.setOutput(target);
    }
    if (!this.enabled) {
      this.music.pause();
      return;
    }
    if (this.lab) {
      this.updateEngine(rpm, speed, t, air);
      this.music.tick(t);
      return;
    }
    const voice = this.voice;
    let loudest = 0;
    for (let m = 0; m < 4; m += 1) {
      const r = Math.max(0, rpm[m]);
      const node = this.motors[m];
      /*
       * A stopped motor is silent. Below MOTOR_MUTE_RPM the stem is faded out
       * rather than floored at 20 Hz, which is what put a -21.5 dBFS subsonic
       * drone under the title screen and on top of the bass line during every
       * spool down.
       */
      if (r < MOTOR_MUTE_RPM) {
        node.gain.gain.setTargetAtTime(0, t, 0.06);
        continue;
      }
      /* THE fundamental. No register correction, no scale factor: this is
       * the blade pass frequency, or a four stroke's firing pattern, and A2
       * asserts it against the RPM the module reports to within one
       * percent. */
      const hz = (r / 60) * voice.perRev * (voice.wave === 'blade' ? this.bladeScale : 1);
      /* setTargetAtTime, not linearRamp: the ear hears a step in
       * frequency as a click, and the motors change fast. */
      node.osc.frequency.setTargetAtTime(hz, t, 0.012);
      const corner = Math.min(voice.lpCap ?? MOTOR_LP_CAP, Math.max(MOTOR_LP_FLOOR, hz * voice.lpTrack));
      node.lp1.frequency.setTargetAtTime(corner, t, 0.03);
      /*
       * Loudness, LINEAR in throttle rather than squared.
       *
       * The squared law swung the stem 11.6 dB across the throttle range, which
       * meant the thing the pilot flies on was being delivered mostly as volume
       * while the pitch cue, which is the informative one, rode underneath it.
       * A linear law with a high floor keeps the stem inside 6.0 dB, twenty log
       * of 0.44 over 0.22, and lets 1.79 octaves of pitch carry the
       * information instead. It also takes the peak drive well off the soft
       * clip's clamp, which was manufacturing distortion in the 2 to 2.5 kHz
       * bands at shipped defaults.
       *
       * SCALED BY 0.63 in this round, which is 4.0 dB off the stem and
       * nothing off the law: both terms move together, so the span stays
       * exactly 6.0 dB and the pitch, which is the information, is
       * untouched. See the header for where the other 6.5 dB of the owner's
       * 70 percent went and why it could not all come off here.
       */
      const loud = Math.min(1, r / voice.rpmFull);
      node.gain.gain.setTargetAtTime((0.139 + 0.139 * loud) * (voice.gain ?? 1), t, 0.03);
      if (loud > loudest) {
        loudest = loud;
      }
    }
    /*
     * The wind, scaled by 1.41, which is 3.0 dB up.
     *
     * This file has said since round 11 that the shipping sims put the
     * motors just audible UNDER the wind. It has never been true here: on a
     * flight render the motor stem measured -18.45 dBFS against the wind's
     * -32.99, so the motors were fourteen and a half dB over the thing they
     * were supposed to be under. Four dB off the motors and three on to the
     * wind closes half of that. The rest is left for a round that can listen
     * to it, because the wind is broadband and raising it further is how a
     * mix gets hissy.
     */
    const rush = Math.min(1, speed / voice.speedFull);
    /* The wing's wind brightens with speed; the quad's corner is a
     * constant the graph was built with and is left alone, so its
     * measured render does not move. */
    if (voice.windOpen > 0) {
      this.noiseFilter.frequency.setTargetAtTime(voice.windCorner + voice.windOpen * rush, t, 0.08);
    }
    /*
     * THE 0.085 IS THE AIR A FLYING QUAD SITS IN, NOT A HUM THE PAGE MAKES.
     *
     * It was an unconditional term, so the wind bed never went below it, and
     * with the motors muted it was the ONLY thing left in the graph. Measured
     * offline through this very class with the motors stopped and the
     * airspeed zero: -57.77 dBFS RMS at the default volume, and zeroing the
     * wind stem alone took the render to exact digital silence while zeroing
     * the motor stem changed nothing at all. So after the round that stopped
     * the motors droning on the results screen the owner still heard
     * something, "lower in pitch and quieter", and that is what it was: a
     * dead flat band of noise under a 900 Hz lowpass, running under the
     * title screen, under the results table and through every crash lockout,
     * never changing, which is exactly the kind of sound an ear locks on to.
     *
     * Stopped air is silent, for the same reason a stopped motor is. The
     * floor stays whenever anything is actually moving, which includes a
     * hover, where `loudest` is what carries the prop wash; it is gone only
     * when every motor is below MOTOR_MUTE_RPM and the craft is not moving
     * either. The 0.06 tau takes it down over about 200 ms rather than
     * cutting, the same way the motor stem goes.
     */
    const bed = loudest > 0 || rush > 0 ? 0.085 : 0;
    this.noiseGain.gain.setTargetAtTime(bed + 0.71 * rush * rush + 0.17 * loudest, t, 0.06);
    /* The bed. Ticked from here so a paused element is restarted while
     * the mix is live, and so the probe still exercises the same update. */
    this.music.tick(t);
  }
}
