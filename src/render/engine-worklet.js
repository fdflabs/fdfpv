/*
 * engine-worklet.js: the physically driven aircraft voice, one
 * AudioWorkletProcessor (docs/AUDIO.md, "the model per source class").
 *
 * Why one worklet and not a graph of oscillators: the live graph's budget is
 * 64 nodes (tests/thresholds.json audio-bed max_nodes, scripts/war-boom.js)
 * and it already stands near it. Four motors with harmonics, a motor whine,
 * blade vortex noise, prop wash, the wind and impacts would be well over a
 * hundred nodes as a graph. Here they are one node, and the flag's path
 * removes the 21 the old motor and wind chains used.
 *
 * Every per frame quantity is an AudioParam, never a port message: messages
 * are not sample accurate in an OfflineAudioContext, and the offline renders
 * (tools/audio/render.js, tools/audio/listen.html) must hear exactly what the
 * live page hears. The model (which machine) arrives once, in
 * processorOptions or by a port message, because it is not time critical.
 *
 * Outputs, each stereo: 0 the engine (motors, piston, turbine), 1 the air
 * (wind over the airframe, prop wash), 2 effects (impacts). src/render/audio.js
 * puts 0 on the Motors bus, 1 on the Wind bus and 2 beside the cues, so the
 * settings sliders keep meaning what they say.
 *
 * Determinism: every noise generator is a seeded integer xorshift, so the
 * same trace renders the same samples. Not the physics path, so Math.sin is
 * allowed here (CLAUDE.md's rule is about the plant).
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

const TAU = 2 * Math.PI;
/* Speed of sound, m/s, at 20 C. */
const C_AIR = 343;
/* The longest propagation delay the line holds, s: 340 m. Past that a
 * source is a far off murmur and its delay is clamped. */
const DELAY_MAX_S = 1.0;
/* Below this distance, metres, the source is the aircraft the camera is
 * on: no delay line, no distance law. */
const ONBOARD_M = 0.5;
/* The distance, metres, at which a source heard off board is as loud as
 * the same source on board. The on board mix is set to a loudness target,
 * not to a pressure, so this is a matching point, and it is chosen so a
 * close pass (20 m) is about as loud as the cockpit: another aircraft is
 * then always audible and never louder than the pilot's own. */
const REF_M = 16;
/* Subnormal guard: a state variable decaying toward zero below this is
 * zeroed, so no filter tail ever reaches the slow denormal path. */
const FLUSH = 1e-20;

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

/* A Chamberlin state variable filter, run at most to rate / 6 so it stays
 * stable; low, band and high from one update. */
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

/* A one pole lowpass coefficient for a corner in Hz. */
function onePole(hz, rate) {
  return 1 - Math.exp((-TAU * hz) / rate);
}

/* A two pole resonator, struck by an impulse: a mode of a frame, a
 * muffler's ring. Frequency and decay set once per strike. */
class Mode {
  constructor() {
    this.y1 = 0;
    this.y2 = 0;
    this.a1 = 0;
    this.a2 = 0;
    this.b0 = 0;
  }

  /* Unity gain at the peak: an undamped two pole's gain at resonance is
   * about 1 / ((1 - r) sin w), tens of thousands for a slow low mode, and a
   * strike scaled by hand to that is a strike that clips the next time a
   * decay changes. */
  tune(hz, decayS, rate) {
    const r = Math.exp(-1 / (decayS * rate));
    const w = (TAU * hz) / rate;
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
 * THE MODELS. Numbers with a source in docs/AUDIO.md; the ones marked
 * ESTIMATED there are tuning, not measurement.
 *
 *   multirotor  per motor: blade pass B f_rot with its harmonics, shaft
 *               orders between them from blade to blade imbalance, the
 *               motor's electrical whine at (poles / 2) f_rot, broadband
 *               blade vortex noise chopped at the blade pass, and prop
 *               wash when the craft sinks into its own wake
 *   piston      exhaust pulses at the firing rate, each a little different,
 *               ringing a muffler; the prop's blade pass and its broadband
 *   turbojet    the shaft's tone, the compressor's blade pass whine, the
 *               jet's mixing roar and combustion rumble, all off the spool
 */
const MODELS = {
  quad: {
    kind: 'multirotor', motors: 4, blades: 3, poles: 14, rpmRef: 9400,
    /* Induced velocity at the reference rpm, m/s: hover thrust of 1.6 N a
     * motor through a 5.1 in disc, v = sqrt(T / (2 rho A)). */
    washV: 7.2, pan: [0.42, 0.3, -0.42, -0.3], gain: 0.27,
  },
  wing: { kind: 'multirotor', motors: 1, blades: 2, poles: 14, rpmRef: 12000, washV: 0, pan: [0, 0, 0, 0], gain: 1 },
  edf: { kind: 'multirotor', motors: 1, blades: 12, poles: 14, rpmRef: 30000, washV: 0, pan: [0, 0, 0, 0], gain: 0.5 },
  /* The Striker's 110 cc boxer twin: a two stroke whose cylinders fire
   * together, so one pulse a revolution (ASSUMED, docs/AUDIO.md). */
  boxer2: { kind: 'piston', firesPerRev: 1, blades: 2, rpmRef: 5000, idleRpm: 1250, muffler: [115, 420, 1500], gain: 1.2 },
  glow2: { kind: 'piston', firesPerRev: 1, blades: 2, rpmRef: 9350, idleRpm: 2600, muffler: [210, 760, 2400], gain: 1 },
  glow4: { kind: 'piston', firesPerRev: 0.5, blades: 2, rpmRef: 9500, idleRpm: 2300, muffler: [140, 520, 1800], gain: 1 },
  /* The Striker's 140 N class turbojet: 125,000 rpm at full, a radial
   * compressor of 7 main and 7 splitter blades, a 60 mm nozzle. */
  turbojet: { kind: 'turbojet', rpmRef: 125000, idleRpm: 25000, compBlades: 14, nozzleM: 0.06, vjFull: 420, gain: 11 },
};

const PARAMS = [
  'rpm0', 'rpm1', 'rpm2', 'rpm3',
  /* Body frame velocity, m/s: forward, left, up. */
  'u', 'v', 'w',
  /* Pack current, A. */
  'amps',
  /* An off board listener: distance, the ground reflection's path, and
   * the pan the listener hears it at. 0 distance is on board. */
  'dist', 'dist2', 'pan',
  /* An impact: impulse in N s, rising edge triggered; the surface's
   * hardness 0..1 (sim_material_info) and the closing speed, m/s. */
  'impact', 'hardness', 'impactSpeed',
];

class EngineProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return PARAMS.map((name) => ({ name, defaultValue: 0, automationRate: 'k-rate' }));
  }

  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.rate = sampleRate;
    this.bladeScale = o.bladeScale > 0 ? o.bladeScale : 1;
    this.setModel(o.model || 'quad');
    this.port.onmessage = (e) => {
      if (!e.data) {
        return;
      }
      if (e.data.bladeScale > 0) {
        this.bladeScale = e.data.bladeScale;
      }
      if (e.data.model) {
        this.setModel(e.data.model);
      }
    };
    const rate = this.rate;
    this.noise = [rng(0x9e3779b9), rng(0x85ebca6b), rng(0xc2b2ae35), rng(0x27d4eb2f), rng(0x165667b1), rng(0xd3a2646c)];
    /* Per motor: the shaft phase in revolutions, the harmonic weights the
     * blade to blade imbalance gives each shaft order, and a slow random
     * wander of the shaft speed. Seeded per motor so four motors are four
     * different props. */
    this.motor = [0, 1, 2, 3].map((m) => {
      const r = rng(0x1234567 + 7919 * m);
      const orders = 48;
      const phase = new Float64Array(orders + 1);
      const imb = new Float64Array(orders + 1);
      for (let n = 1; n <= orders; n += 1) {
        phase[n] = Math.PI * r();
        imb[n] = 0.5 + 0.5 * Math.abs(r());
      }
      return {
        theta: Math.abs(r()), phase, imb, rpm: 0, rpmPrev: 0, load: 0,
        wander: 0, wanderRng: rng(0xabcdef + 31 * m), whine: 0, whinePhase: 0,
        cos: new Float64Array(orders + 1), sin: new Float64Array(orders + 1),
        amp: new Float64Array(orders + 1), level: 0,
      };
    });
    this.orders = 48;
    this.bb = [new Svf(), new Svf()];
    this.washLp = 0;
    this.washRumble = new Svf();
    this.washAm = 0;
    this.wind = [new Svf(), new Svf()];
    this.windHp = [0, 0];
    this.gust = 0;
    this.windLevel = 0;
    /* Piston: cycle phase, this cycle's strength and timing, the muffler. */
    this.cycle = 0;
    this.cycleAmp = 1;
    this.cycleLag = 0;
    this.muff = [new Mode(), new Mode(), new Mode()];
    this.pulse = 0;
    /* Turbojet. */
    this.jetPhase = 0;
    this.jetRoar = [new Svf(), new Svf()];
    this.jetTilt = [0, 0];
    this.jetRumble = new Svf();
    /* Impacts: a struck frame (three modes), a noise burst, a skitter. */
    this.hitModes = [new Mode(), new Mode(), new Mode(), new Mode()];
    this.hitEnv = 0;
    this.hitDecay = 0;
    this.hitTone = new Svf();
    this.hitBright = 0;
    this.hitLevel = 0;
    this.hitThump = 0;
    this.hitThumpDecay = 0;
    this.hitThumpPhase = 0;
    this.hitThumpHz = 0;
    this.lastImpact = 0;
    this.hitRng = rng(0x51ed270b);
    /* Propagation: a mono line the engine and air are written into and
     * read back at the delay the distance sets, which is also what makes
     * the Doppler shift, since a delay that shortens is a pitch that
     * rises. */
    this.lineLen = Math.ceil(DELAY_MAX_S * rate) + 4;
    this.line = new Float32Array(this.lineLen);
    this.lineAt = 0;
    this.absorb = [0, 0];
    this.reflAbsorb = 0;
    this.distPrev = 0;
    this.dist2Prev = 0;
    /* The harshness guard: the 2 to 5 kHz band's envelope against the
     * whole signal's, per output side of the engine. */
    this.harsh = new Svf();
    this.envBand = 0;
    this.envAll = 0;
    this.harshGain = 1;
  }

  setModel(name) {
    const m = MODELS[name];
    if (!m) {
      throw new Error(`engine-worklet: no model ${name}`);
    }
    this.model = m;
    this.modelName = name;
    /* A prop's blade count, times the hangar prop's over the stock one
     * (MotorAudio.setBladeScale), whole blades. */
    this.blades = Math.max(1, Math.round((m.blades || 2) * this.bladeScale));
  }

  /*
   * One multirotor motor's shaft order amplitudes for this quantum. The
   * blade pass harmonics (orders B, 2B, ...) fall off at a slope that eases
   * as the prop loads up: a prop pulling hard puts more energy in its upper
   * harmonics, which is the "bite" of a punch. The orders between them are
   * the imbalance, a few percent. Level grows as rpm to the 0.6, a punch
   * from hover to three times the rpm about 6 dB, the span the owner
   * already approved for the shipped voice: the aeroacoustic
   * literature's fourth to sixth power would be 30 dB, which is the
   * physics and also exactly the fatigue the owner reported. The pitch and
   * the brightening carry the throttle; the level only follows it.
   */
  motorAmps(mo, blades, rpmRef) {
    const x = mo.rpm / rpmRef;
    const load = Math.max(0, Math.min(2, mo.load));
    /* -12 dB an octave of blade pass harmonics at rest, -9 when the prop
     * is loaded hard; above the first few the broadband carries the top. */
    const slope = 2.0 - 0.5 * Math.min(1, load);
    const level = x ** 0.6;
    const fRot = Math.max(1, mo.rpm / 60);
    const nyq = this.rate / 2.4;
    for (let n = 1; n <= this.orders; n += 1) {
      const f = n * fRot;
      /* Tones fade out between 6 and 9 kHz rather than stopping at an
       * order, which would be an edge the ear finds, and never reach
       * Nyquist. Above them the broadband is the prop. */
      const fade = f >= nyq ? 0 : f < 6000 ? 1 : f < 9000 ? (9000 - f) / 3000 : 0;
      let a = 0;
      if (n % blades === 0) {
        const k = n / blades;
        a = 1 / k ** slope;
      } else {
        /* A shaft order: the props' imbalance, strongest at once a rev
         * and gone within a few orders. */
        a = 0.06 * mo.imb[n] / n ** 1.5;
      }
      mo.amp[n] = a * fade * level * mo.imb[n];
      /* Weighted once a quantum so the sample loop is two multiplies an
       * order: a sin(n theta + phi) = a cos(phi) sin(n theta) + a sin(phi)
       * cos(n theta). */
      mo.sin[n] = mo.amp[n] * Math.cos(mo.phase[n]);
      mo.cos[n] = mo.amp[n] * Math.sin(mo.phase[n]);
    }
    mo.level = level;
  }

  process(inputs, outputs, params) {
    const out = outputs;
    const eng = out[0];
    const air = out[1];
    const fx = out[2];
    const n = eng[0].length;
    const rate = this.rate;
    const m = this.model;
    const p = (k) => params[k][0];
    const u = p('u');
    const v = p('v');
    const w = p('w');
    const speed = Math.hypot(u, v, w);
    /* Sideslip, rad: the angle between the velocity and the body x axis in
     * the body's horizontal plane. Meaningful only with way on. */
    const beta = speed > 2 ? Math.atan2(v, Math.max(0.5, Math.abs(u))) : 0;
    const amps = p('amps');
    const dist = p('dist');
    const dist2 = p('dist2');
    const pan = Math.max(-1, Math.min(1, p('pan')));
    const dtq = n / rate;

    /* ---- the impact trigger: a rising edge on the impulse param ---- */
    const imp = p('impact');
    if (imp > 0 && this.lastImpact <= 0) {
      this.strike(imp, p('hardness'), p('impactSpeed'));
    }
    this.lastImpact = imp;

    /* ---- per quantum state ---- */
    let rpmSum = 0;
    let motorsLive = 0;
    const motors = m.kind === 'multirotor' ? m.motors : 1;
    for (let k = 0; k < motors; k += 1) {
      const mo = this.motor[k];
      const r = Math.max(0, p(`rpm${k}`));
      /* Load: thrust proxy (rpm over the reference, squared) plus how fast
       * the motor is being driven up, which is the prop biting harder than
       * its steady state. Smoothed over a few quanta. */
      const accel = (r - mo.rpmPrev) / Math.max(dtq, 1e-4) / Math.max(m.rpmRef, 1);
      const want = (r / m.rpmRef) ** 2 + 0.6 * Math.max(-0.5, Math.min(2, accel * 0.25));
      mo.load += 0.2 * (want - mo.load);
      mo.rpmPrev = r;
      mo.rpm = r;
      rpmSum += r;
      if (r > 300) {
        motorsLive += 1;
      }
      if (m.kind !== 'turbojet') {
        this.motorAmps(mo, this.blades, m.rpmRef);
      }
      if (m.kind === 'multirotor') {
        /* The motor's whine follows its current: the pack's, shared out in
         * proportion to each motor's thrust proxy. */
        const share = motors > 0 ? amps / motors : 0;
        mo.whine += 0.2 * (Math.min(1, share / 40) * (r > 300 ? 1 : 0) - mo.whine);
      }
    }
    const rpmMean = motors > 0 ? rpmSum / motors : 0;

    /* Prop wash: sinking along the thrust axis into the rotors' own wake.
     * x is the descent rate over the induced velocity at this rpm; the
     * vortex ring state lives around x = 1 (Johnson, Helicopter Theory,
     * 4.1), so the shake is a bump there and nothing when climbing. */
    let wash = 0;
    if (m.kind === 'multirotor' && m.washV > 0 && rpmMean > 600) {
      const vi = m.washV * (rpmMean / m.rpmRef);
      const x = -w / Math.max(1, vi);
      wash = x > 0.15 ? Math.exp(-(((x - 1) / 0.7) ** 2)) : 0;
    }

    /* Wind over the airframe: level with speed to the 1.2 (aerodynamic
     * noise goes as a high power of speed; compressed for the same reason as
     * the motors), louder and gustier in a sideslip, brighter with speed. */
    const vRef = m.kind === 'multirotor' && m.motors === 4 ? 30 : 40;
    const windWant = Math.min(1.6, (speed / vRef) ** 1.2) * (1 + 1.5 * Math.min(0.6, Math.abs(beta)));
    const windF = svfF(Math.min(1800, 200 + 35 * speed), rate);
    const windQ = 1.2;
    const gustDepth = Math.min(0.6, 0.15 + Math.abs(beta));
    const windPanL = 1 - 0.35 * Math.max(0, Math.sin(beta));
    const windPanR = 1 - 0.35 * Math.max(0, -Math.sin(beta));

    /* Broadband blade vortex noise: one shared band of noise for all the
     * motors, centred a few blade passes up, level with tip speed. */
    const bladesBb = this.blades;
    const bbHz = Math.min(5200, Math.max(400, (rpmMean / 60) * bladesBb * 5));
    const bbF = svfF(bbHz, rate);
    let bbLevel = 0;
    for (let k = 0; k < motors; k += 1) {
      bbLevel += (this.motor[k].rpm / m.rpmRef) ** 0.9;
    }
    bbLevel = motors > 0 ? bbLevel / motors : 0;

    const nz = this.noise;
    const onboard = !(dist > ONBOARD_M);
    const winL = this.wind[0];
    const winR = this.wind[1];
    const washF = svfF(180, rate);
    const lpWash = onePole(14, rate);
    const lpWind = onePole(3, rate);
    const lpGust = onePole(6, rate);
    const harshF = svfF(3200, rate);
    const envK = onePole(8, rate);

    for (let i = 0; i < n; i += 1) {
      let eL = 0;
      let eR = 0;

      if (m.kind === 'multirotor') {
        /* Wash: a random amplitude modulation of the tones, 5 to 15 Hz,
         * the shudder a pilot hears as the props chew dirty air. */
        this.washLp += lpWash * (nz[3]() - this.washLp);
        const am = 1 + 1.6 * wash * this.washLp;
        let chop = 0;
        for (let k = 0; k < motors; k += 1) {
          const mo = this.motor[k];
          if (mo.rpm < 300) {
            continue;
          }
          mo.wander += 0.00002 * (mo.wanderRng() - 400 * mo.wander);
          const fRot = (mo.rpm / 60) * (1 + mo.wander);
          mo.theta += fRot / rate;
          if (mo.theta >= 1) {
            mo.theta -= Math.floor(mo.theta);
          }
          /* e^(i n theta) by recurrence: one sin and cos a motor a sample. */
          const c1 = Math.cos(TAU * mo.theta);
          const s1 = Math.sin(TAU * mo.theta);
          let c = c1;
          let s = s1;
          let y = 0;
          const top = this.orders;
          const ws = mo.sin;
          const wc = mo.cos;
          for (let o = 1; o <= top; o += 1) {
            y += ws[o] * s + wc[o] * c;
            const c2 = c * c1 - s * s1;
            s = s * c1 + c * s1;
            c = c2;
          }
          y *= am;
          /* The blade pass phase, for chopping the broadband. */
          chop += Math.cos(TAU * mo.theta * this.blades);
          /* The whine: the electrical frequency and its second harmonic. */
          if (mo.whine > 0.001) {
            mo.whinePhase += (fRot * m.poles / 2) / rate;
            if (mo.whinePhase >= 1) {
              mo.whinePhase -= Math.floor(mo.whinePhase);
            }
            y += mo.level * mo.whine * (0.05 * Math.sin(TAU * mo.whinePhase) + 0.025 * Math.sin(2 * TAU * mo.whinePhase));
          }
          const pk = m.pan[k];
          eL += y * (1 - pk) * 0.5;
          eR += y * (1 + pk) * 0.5;
        }
        /* Blade vortex noise, chopped at the blade pass. */
        if (bbLevel > 1e-5) {
          const ch = motorsLive > 0 ? chop / motorsLive : 0;
          const g = 0.16 * bbLevel * (1 + 0.45 * ch) * am;
          const b0 = this.bb[0];
          b0.run(nz[0](), bbF, 0.9);
          const b1 = this.bb[1];
          b1.run(nz[1](), bbF, 0.9);
          eL += g * b0.bp;
          eR += g * b1.bp;
        }
      } else if (m.kind === 'piston') {
        const mo = this.motor[0];
        const r = mo.rpm;
        if (r > 200) {
          const fRot = r / 60;
          const x = Math.min(1.2, r / m.rpmRef);
          /* The firing cycle: a pulse each time it wraps, its strength and
           * timing varied cycle to cycle, most at idle (Heywood 1988, 9.4). */
          const idleness = Math.max(0, Math.min(1, 1 - (r - m.idleRpm) / (m.rpmRef - m.idleRpm)));
          this.cycle += (fRot * m.firesPerRev) / rate * (1 + this.cycleLag);
          let exc = 0;
          if (this.cycle >= 1) {
            this.cycle -= Math.floor(this.cycle);
            const jit = 0.05 + 0.2 * idleness;
            this.cycleAmp = 1 + jit * nz[4]();
            this.cycleLag = 0.3 * jit * nz[4]();
            /* A miss now and then at idle: a two stroke's four stroking. */
            if (idleness > 0.6 && nz[5]() > 0.86) {
              this.cycleAmp *= 0.25;
            }
            this.pulse = this.cycleAmp;
            for (let q = 0; q < 3; q += 1) {
              const hz = m.muffler[q] * (1 + 0.15 * x) * (1 + 0.01 * nz[5]());
              this.muff[q].tune(hz, [0.03, 0.012, 0.004][q], rate);
            }
          }
          /* The blowdown: a fast decaying pulse with a little noise in it. */
          exc = this.pulse * (0.7 + 0.3 * nz[4]());
          this.pulse *= 0.86;
          if (this.pulse < FLUSH) {
            this.pulse = 0;
          }
          const load = Math.max(0.2, Math.min(1.5, mo.load));
          const ex = 1.0 * this.muff[0].run(exc) + 0.6 * load * this.muff[1].run(exc) + 0.4 * load * this.muff[2].run(exc);
          /* The prop: blade pass and harmonics by the same recurrence. */
          mo.theta += fRot / rate;
          if (mo.theta >= 1) {
            mo.theta -= Math.floor(mo.theta);
          }
          const c1 = Math.cos(TAU * mo.theta);
          const s1 = Math.sin(TAU * mo.theta);
          let c = c1;
          let s = s1;
          let y = 0;
          for (let o = 1; o <= 16; o += 1) {
            y += mo.sin[o] * s + mo.cos[o] * c;
            const c2 = c * c1 - s * s1;
            s = s * c1 + c * s1;
            c = c2;
          }
          const level = 0.5 + 0.5 * x;
          const b0 = this.bb[0];
          b0.run(nz[0](), bbF, 0.9);
          const prop = 0.45 * y + 0.06 * x * x * b0.bp * (1 + 0.5 * Math.cos(TAU * mo.theta * this.blades));
          /* The blowdown itself, the pressure pulse as the port opens:
           * the same physics as the shipped glow voices' wave (Heywood,
           * 1988), here per cycle, so every cycle's strength and timing is
           * its own and the note is a series on the firing rate. */
          const phi = this.cycle;
          const bd = Math.exp(-phi / 0.05) * Math.sin((TAU * phi) / 0.14);
          const direct = this.cycleAmp * bd * (0.6 + 0.4 * Math.min(1, load));
          const sum = 0.5 * direct + ex * (0.5 + 0.5 * x) + prop * level;
          eL += sum;
          eR += sum;
        }
      } else if (m.kind === 'turbojet') {
        const r = this.motor[0].rpm;
        if (r > 500) {
          const x = Math.min(1.1, r / m.rpmRef);
          const fS = r / 60;
          this.jetPhase += fS / rate;
          if (this.jetPhase >= 1) {
            this.jetPhase -= Math.floor(this.jetPhase);
          }
          /* The compressor's blade pass: a whine at 14 shaft orders, faded
           * as it climbs out of hearing past 16 kHz, and the shaft's own
           * once per rev, faint. */
          const fBp = fS * m.compBlades;
          const audible = fBp < 16000 ? 1 : fBp < 19000 ? (19000 - fBp) / 3000 : 0;
          const whine = 0.03 * audible * Math.sin(TAU * this.jetPhase * m.compBlades) * (0.4 + 0.6 * x)
            + 0.004 * x * Math.sin(TAU * this.jetPhase);
          /* The jet's mixing noise: broadband, peaking near a Strouhal
           * number of 0.2 on the jet's velocity over its nozzle. */
          const vj = m.vjFull * x ** 1.2;
          const fp = Math.max(120, (0.2 * vj) / m.nozzleM);
          const fr = svfF(fp, rate);
          const r0 = this.jetRoar[0];
          const r1 = this.jetRoar[1];
          r0.run(nz[0](), fr, 1.3);
          r1.run(nz[1](), fr, 1.3);
          const roar = 0.22 * (vj / m.vjFull) ** 2.2;
          /* Combustion rumble, with the fuel flow. */
          const ru = this.jetRumble;
          ru.run(nz[2](), svfF(110, rate), 1.0);
          const rumble = 0.18 * x * x * ru.lo;
          /* A first order tilt above 2.5 kHz: the roar's hiss is real, and
           * it is also the band a long session tires in, so it slopes off
           * rather than sitting flat to 10 kHz. */
          const kt = onePole(2500, rate);
          this.jetTilt[0] += kt * (r0.bp - this.jetTilt[0]);
          this.jetTilt[1] += kt * (r1.bp - this.jetTilt[1]);
          eL += whine + roar * this.jetTilt[0] + rumble;
          eR += whine + roar * this.jetTilt[1] + rumble;
        }
      }

      /* The model's trim, set by measurement so each machine meets its
       * loudness target at its reference flight (docs/AUDIO.md). */
      eL *= m.gain;
      eR *= m.gain;

      /* ---- the air ---- */
      this.windLevel += lpWind * (windWant - this.windLevel);
      let aL = 0;
      let aR = 0;
      if (this.windLevel > 1e-4) {
        this.gust += lpGust * (nz[2]() - this.gust);
        const g = 0.3 * this.windLevel * (1 + gustDepth * 2.5 * this.gust);
        winL.run(nz[4](), windF, windQ);
        winR.run(nz[5](), windF, windQ);
        /* A first order high pass at 40 Hz: the rumble under the hiss is
         * buffeting a headphone cannot reproduce as anything but pressure. */
        const hl = winL.lo - this.windHp[0];
        const hr = winR.lo - this.windHp[1];
        this.windHp[0] += 0.005 * hl;
        this.windHp[1] += 0.005 * hr;
        aL += g * hl * windPanL;
        aR += g * hr * windPanR;
      }
      if (wash > 0.01) {
        const ru = this.washRumble;
        ru.run(nz[3](), washF, 0.8);
        const g = 0.25 * wash * (rpmMean / m.rpmRef) * (1 + 1.5 * this.washLp);
        aL += g * ru.lo;
        aR += g * ru.lo;
      }

      /* ---- the harshness guard on the engine ---- */
      const mono = 0.5 * (eL + eR);
      this.harsh.run(mono, harshF, 1.4);
      const band = this.harsh.bp;
      this.envBand += envK * (Math.abs(band) - this.envBand);
      this.envAll += envK * (Math.abs(mono) - this.envAll);
      /* More than 30 percent of the engine's envelope in the band pulls the
       * band down, by at most 9 dB. */
      const ratio = this.envAll > 1e-9 ? this.envBand / this.envAll : 0;
      const want = ratio > 0.3 ? Math.max(0.35, 0.3 / ratio) : 1;
      this.harshGain += 0.001 * (want - this.harshGain);
      const cut = (1 - this.harshGain) * band;
      eL -= cut;
      eR -= cut;

      /* ---- propagation, for a source off board ---- */
      if (!onboard) {
        /* Coming from on board, the line starts at the distance rather
         * than gliding out to it: a glide would be a delay sweeping
         * hundreds of milliseconds in one frame, a pitch slide no
         * aircraft makes. */
        if (!(this.distPrev > ONBOARD_M)) {
          this.distPrev = dist;
          this.dist2Prev = dist2;
        }
        const t = i / n;
        const d = this.distPrev + (dist - this.distPrev) * t;
        const d2 = this.dist2Prev + (dist2 - this.dist2Prev) * t;
        const src = 0.5 * (eL + eR) + 0.5 * (aL + aR) * 0.3;
        this.line[this.lineAt] = src;
        const direct = this.tap(d);
        const refl = this.tap(d2 > d ? d2 : d);
        /* Air absorption as a lowpass whose corner falls with distance:
         * ISO 9613-1 gives about 0.03 dB/m at 4 kHz and 0.1 dB/m at
         * 8 kHz at 20 C and 50 percent humidity; a corner of 24 kHz times
         * (10 / d)^0.7 matches those within a few dB from 10 to 300 m. */
        const fc = Math.min(20000, 24000 * (10 / Math.max(10, d)) ** 0.7);
        const k = onePole(fc, rate);
        this.absorb[0] += k * (direct - this.absorb[0]);
        const fc2 = Math.min(20000, 24000 * (10 / Math.max(10, d2)) ** 0.7) * 0.6;
        this.reflAbsorb += onePole(fc2, rate) * (refl - this.reflAbsorb);
        /* Spherical spreading against REF_M, where an aircraft off board
         * is as loud as it is on board, and the ground's image at half
         * pressure (grass reflects about that much). Equal power pan,
         * unity in the centre. */
        const s = this.absorb[0] / Math.max(1, d) + 0.5 * this.reflAbsorb / Math.max(1, d2);
        const gl = Math.sqrt(1 - pan);
        const gr = Math.sqrt(1 + pan);
        eL = REF_M * s * gl;
        eR = REF_M * s * gr;
        aL = 0;
        aR = 0;
        this.lineAt = (this.lineAt + 1) % this.lineLen;
      }

      eng[0][i] = eL;
      eng[1][i] = eR;
      air[0][i] = aL;
      air[1][i] = aR;

      /* ---- the impact ---- */
      let h = 0;
      if (this.hitEnv > 1e-5 || this.hitThump > 1e-5) {
        const nzv = this.hitRng();
        const t0 = this.hitTone;
        t0.run(nzv, this.hitBright, 0.7);
        const burst = this.hitEnv * (t0.lo + 0.5 * t0.bp);
        this.hitEnv *= this.hitDecay;
        let modes = 0;
        const ex = burst * 0.3;
        for (const md of this.hitModes) {
          modes += md.run(ex);
        }
        this.hitThumpPhase += this.hitThumpHz / rate;
        const th = this.hitThump * Math.sin(TAU * this.hitThumpPhase);
        this.hitThump *= this.hitThumpDecay;
        this.hitThumpHz *= 0.99995;
        h = this.hitLevel * (burst + 0.02 * modes + th);
      } else {
        this.hitEnv = 0;
        this.hitThump = 0;
      }
      fx[0][i] = h;
      fx[1][i] = h;
    }
    this.distPrev = dist;
    this.dist2Prev = dist2;
    return true;
  }

  /* The line, read `d` metres back: linear interpolation at the fractional
   * sample delay, which is what turns a changing distance into a Doppler
   * shift without computing one. */
  tap(d) {
    const delay = Math.min(DELAY_MAX_S, d / C_AIR) * this.rate;
    let pos = this.lineAt - delay;
    while (pos < 0) {
      pos += this.lineLen;
    }
    const i0 = Math.floor(pos);
    const fr = pos - i0;
    const a = this.line[i0 % this.lineLen];
    const b = this.line[(i0 + 1) % this.lineLen];
    return a + (b - a) * fr;
  }

  /*
   * One impact. Hardness is the surface's (grass 0.05, concrete 1): it sets
   * how sharp the onset is, how bright the burst, and how much of the
   * frame's own ring a hit excites, because a soft surface takes the
   * energy over milliseconds and a hard one gives it back in one. The level
   * is the impulse on a log law. Every strike draws its own mode tuning and
   * decay, so no two hits are the same sample.
   */
  strike(impulse, hardness, speed) {
    const rate = this.rate;
    const r = this.hitRng;
    const hd = Math.max(0, Math.min(1, hardness));
    /* A hard surface stops the craft in a fraction of the time a soft one
     * does, so the same impulse is a far higher peak force: louder as well
     * as brighter. */
    const lv = Math.max(0.15, Math.min(1, 0.3 + 0.2 * Math.log10(Math.max(0.05, impulse) / 0.5) + 0.015 * speed + 0.3 * hd));
    this.hitLevel = 0.4 * lv;
    this.hitEnv = 1;
    /* The burst's decay: 60 ms on grass, 25 ms on concrete. */
    const decayS = 0.06 - 0.035 * hd;
    this.hitDecay = Math.exp(-1 / (decayS * rate * (1 + 0.15 * r())));
    this.hitBright = svfF(500 + 7500 * hd ** 1.3 * (1 + 0.1 * r()), rate);
    /* The thump: the ground giving, low and short, more on soft ground. */
    this.hitThump = 0.9 * (1 - 0.6 * hd);
    this.hitThumpHz = 70 + 50 * hd + 10 * r();
    this.hitThumpPhase = 0;
    this.hitThumpDecay = Math.exp(-1 / ((0.05 + 0.03 * (1 - hd)) * rate));
    /* The frame's plate modes, ESTIMATED for a 5 mm carbon X: struck
     * harder the harder the surface. */
    const base = [820, 1930, 3310, 4870];
    for (let q = 0; q < 4; q += 1) {
      this.hitModes[q].tune(base[q] * (1 + 0.05 * r()), (0.05 - 0.008 * q) * (0.3 + 0.7 * hd) * (1 + 0.2 * r()), rate);
    }
  }
}

registerProcessor('fdfpv-engine', EngineProcessor);
