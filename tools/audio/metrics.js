/*
 * metrics.js: what a rendered buffer measures, the same in Node and in a
 * page. tools/audio/render.js reads every scripted flight through it and
 * tools/audio/listen.html matches OLD and NEW by it, so the number that
 * decides a check and the number the owner's comparison is levelled on are
 * one function.
 *
 *   loudness(chans, rate)    ITU-R BS.1770-4: integrated (gated), the
 *                            loudest 3 s short term and 400 ms momentary
 *                            block, LUFS, and the loudness range's spread
 *   truePeak(chans)          dBTP, four times oversampled (BS.1770-4 annex 2)
 *   bands(mono, rate)        share of the power per band, percent, with the
 *                            2 to 5 kHz share named on its own because that
 *                            is the band a long session tires in
 *   repetition(mono, rate)   the highest autocorrelation of the onset
 *                            envelope between 0.25 and 4 s lags: 1 is a
 *                            loop that repeats exactly, near 0 is none
 *   hygiene(chans)           non finite and subnormal samples, which are the
 *                            two ways a DSP loop stalls or poisons a mix
 *
 * No imports, no Node API: a page loads this file as it is.
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

/*
 * The K weighting's two stages for any sample rate, from the analogue
 * prototypes BS.1770-4 tabulates at 48 kHz (the same derivation the
 * reference implementations use): a high shelf of +4 dB above about
 * 1.7 kHz, the head's own boost, then a 38 Hz high pass. At 48 kHz these
 * give the standard's printed coefficients to seven places.
 */
function kStages(rate) {
  const f1 = 1681.974450955533;
  const g1 = 3.999843853973347;
  const q1 = 0.7071752369554196;
  const k1 = Math.tan((Math.PI * f1) / rate);
  const vh = 10 ** (g1 / 20);
  const vb = vh ** 0.4996667741545416;
  const a01 = 1 + k1 / q1 + k1 * k1;
  const shelf = {
    b0: (vh + (vb * k1) / q1 + k1 * k1) / a01,
    b1: (2 * (k1 * k1 - vh)) / a01,
    b2: (vh - (vb * k1) / q1 + k1 * k1) / a01,
    a1: (2 * (k1 * k1 - 1)) / a01,
    a2: (1 - k1 / q1 + k1 * k1) / a01,
  };
  const f2 = 38.13547087602444;
  const q2 = 0.5003270373238773;
  const k2 = Math.tan((Math.PI * f2) / rate);
  const a02 = 1 + k2 / q2 + k2 * k2;
  const hp = {
    b0: 1, b1: -2, b2: 1,
    a1: (2 * (k2 * k2 - 1)) / a02,
    a2: (1 - k2 / q2 + k2 * k2) / a02,
  };
  return [shelf, hp];
}

function biquad(x, c) {
  const y = new Float64Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i += 1) {
    const v = c.b0 * x[i] + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

const LUFS_OFFSET = -0.691;
const ABS_GATE = -70;
const REL_GATE = -10;

/* Mean square of each channel's K weighted signal over blocks of `blockS`
 * stepping `hopS`, summed over channels (weight 1 each: left and right). */
function blockPowers(chans, rate, blockS, hopS) {
  const [shelf, hp] = kStages(rate);
  const weighted = chans.map((c) => biquad(biquad(c, shelf), hp));
  const n = chans[0].length;
  const block = Math.round(blockS * rate);
  const hop = Math.round(hopS * rate);
  const out = [];
  if (n < block) {
    return out;
  }
  /* Running sums of squares so a 3 s window at a 100 ms hop costs a pass. */
  const cum = weighted.map((w) => {
    const c = new Float64Array(n + 1);
    for (let i = 0; i < n; i += 1) {
      c[i + 1] = c[i] + w[i] * w[i];
    }
    return c;
  });
  for (let s = 0; s + block <= n; s += hop) {
    let z = 0;
    for (const c of cum) {
      z += (c[s + block] - c[s]) / block;
    }
    out.push(z);
  }
  return out;
}

const toLufs = (z) => (z > 0 ? LUFS_OFFSET + 10 * Math.log10(z) : -Infinity);

/* BS.1770-4's two gates over 400 ms blocks at 75 percent overlap. */
function gatedMean(powers) {
  const abs = powers.filter((z) => toLufs(z) > ABS_GATE);
  if (!abs.length) {
    return -Infinity;
  }
  const rel = toLufs(abs.reduce((a, z) => a + z, 0) / abs.length) + REL_GATE;
  const kept = abs.filter((z) => toLufs(z) > rel);
  if (!kept.length) {
    return -Infinity;
  }
  return toLufs(kept.reduce((a, z) => a + z, 0) / kept.length);
}

/*
 * Loudness, LUFS. `chans` is one Float32Array or Float64Array per channel
 * (one channel is read as a mono signal on the left, as the standard
 * weights it). Integrated is gated; shortTermMax is the loudest 3 s window
 * at a 100 ms hop and momentaryMax the loudest 400 ms block, ungated,
 * because those two are what the ear notices as "that part was too loud".
 * range is EBU R 128's loudness range (LRA): the spread between the 10th
 * and 95th percentiles of the relatively gated short term values, LU.
 */
export function loudness(chans, rate) {
  const integrated = gatedMean(blockPowers(chans, rate, 0.4, 0.1));
  const st = blockPowers(chans, rate, 3, 0.1);
  const mom = blockPowers(chans, rate, 0.4, 0.1);
  const shortTermMax = st.length ? toLufs(Math.max(...st)) : -Infinity;
  const momentaryMax = mom.length ? toLufs(Math.max(...mom)) : -Infinity;
  let range = 0;
  const stAbs = st.filter((z) => toLufs(z) > ABS_GATE);
  if (stAbs.length) {
    const rel = toLufs(stAbs.reduce((a, z) => a + z, 0) / stAbs.length) - 20;
    const kept = stAbs.map(toLufs).filter((l) => l > rel).sort((a, b) => a - b);
    if (kept.length > 1) {
      const pick = (p) => kept[Math.min(kept.length - 1, Math.max(0, Math.round(p * (kept.length - 1))))];
      range = pick(0.95) - pick(0.1);
    }
  }
  return { integrated, shortTermMax, momentaryMax, range };
}

/*
 * True peak, dBTP: four times oversampled through a 48 tap windowed sinc
 * per phase, every sample, with the signal zero outside its extent so a
 * transient at either end is not skipped. A sample peak says nothing about
 * what a converter's reconstruction does between two samples.
 */
const TP_TAPS = 48;
const TP_PHASES = 4;
let tpKernel = null;
function tpRows() {
  if (tpKernel) {
    return tpKernel;
  }
  const half = TP_TAPS / 2;
  tpKernel = [];
  for (let p = 0; p < TP_PHASES; p += 1) {
    const row = new Float64Array(TP_TAPS);
    let sum = 0;
    for (let m = 0; m < TP_TAPS; m += 1) {
      const t = m - half + 1 - p / TP_PHASES;
      const s = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
      const u = m / (TP_TAPS - 1);
      const win = 0.42 - 0.5 * Math.cos(2 * Math.PI * u) + 0.08 * Math.cos(4 * Math.PI * u);
      row[m] = s * win;
      sum += row[m];
    }
    for (let m = 0; m < TP_TAPS; m += 1) {
      row[m] /= sum;
    }
    tpKernel.push(row);
  }
  return tpKernel;
}

export function truePeak(chans) {
  const rows = tpRows();
  const half = TP_TAPS / 2;
  let peak = 0;
  for (const x of chans) {
    const n = x.length;
    for (let i = 0; i < n; i += 1) {
      const a = Math.abs(x[i]);
      if (a > peak) {
        peak = a;
      }
      for (let p = 1; p < TP_PHASES; p += 1) {
        const row = rows[p];
        let y = 0;
        const j0 = i - half + 1;
        for (let m = 0; m < TP_TAPS; m += 1) {
          const j = j0 + m;
          if (j >= 0 && j < n) {
            y += row[m] * x[j];
          }
        }
        const b = Math.abs(y);
        if (b > peak) {
          peak = b;
        }
      }
    }
  }
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}

/* ---------- spectrum ---------- */

function fftInPlace(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr0 = Math.cos(ang);
    const wi0 = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wr = 1;
      let wi = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const a = i + k;
        const b = a + len / 2;
        const vr = re[b] * wr - im[b] * wi;
        const vi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - vr;
        im[b] = im[a] - vi;
        re[a] += vr;
        im[a] += vi;
        const t = wr * wr0 - wi * wi0;
        wi = wr * wi0 + wi * wr0;
        wr = t;
      }
    }
  }
}

/* Welch power spectrum, Hann, half overlap: one value per bin, summing to
 * the mean square of the signal. */
export function powerSpectrum(x, rate, frame = 4096) {
  const w = new Float64Array(frame);
  let wsq = 0;
  for (let i = 0; i < frame; i += 1) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / frame);
    wsq += w[i] * w[i];
  }
  const acc = new Float64Array(frame / 2 + 1);
  const re = new Float64Array(frame);
  const im = new Float64Array(frame);
  let frames = 0;
  for (let off = 0; off + frame <= x.length; off += frame / 2) {
    for (let i = 0; i < frame; i += 1) {
      re[i] = x[off + i] * w[i];
      im[i] = 0;
    }
    fftInPlace(re, im);
    for (let k = 0; k <= frame / 2; k += 1) {
      const p = (re[k] * re[k] + im[k] * im[k]) / (frame * wsq);
      acc[k] += k > 0 && k < frame / 2 ? 2 * p : p;
    }
    frames += 1;
  }
  if (frames) {
    for (let k = 0; k < acc.length; k += 1) {
      acc[k] /= frames;
    }
  }
  return { power: acc, binHz: rate / frame };
}

/* The bands the design doc names, Hz, half open. */
export const BANDS = [
  ['sub', 0, 60],
  ['low', 60, 250],
  ['lowmid', 250, 1000],
  ['mid', 1000, 2000],
  ['harsh', 2000, 5000],
  ['air', 5000, 24000],
];

/*
 * Share of the signal's power in each band, percent, plain and A weighted
 * (IEC 61672). The A weighted share is the one the harshness bar reads: a
 * share of raw power says where the energy is, the A weighted one says
 * where the ear is hearing it, and 2 to 5 kHz is where the ear is most
 * sensitive, which is why it is where fatigue lives.
 */
export function bands(mono, rate) {
  const spec = powerSpectrum(mono, rate);
  const aW = (f) => {
    if (f <= 0) {
      return 0;
    }
    const f2 = f * f;
    const ra = (12194 ** 2 * f2 * f2) / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2));
    return (ra / 0.7943282347242815) ** 2;
  };
  let total = 0;
  let totalA = 0;
  const sums = BANDS.map(() => 0);
  const sumsA = BANDS.map(() => 0);
  let num = 0;
  for (let k = 1; k < spec.power.length; k += 1) {
    const f = k * spec.binHz;
    const p = spec.power[k];
    const pa = p * aW(f);
    total += p;
    totalA += pa;
    num += f * p;
    for (let b = 0; b < BANDS.length; b += 1) {
      if (f >= BANDS[b][1] && f < BANDS[b][2]) {
        sums[b] += p;
        sumsA[b] += pa;
      }
    }
  }
  const share = {};
  const shareA = {};
  for (let b = 0; b < BANDS.length; b += 1) {
    share[BANDS[b][0]] = total > 0 ? (100 * sums[b]) / total : 0;
    shareA[BANDS[b][0]] = totalA > 0 ? (100 * sumsA[b]) / totalA : 0;
  }
  return { share, shareA, harshA: shareA.harsh, centroidHz: total > 0 ? num / total : 0 };
}

/*
 * Repetition: the onset envelope (half wave rectified spectral flux over
 * 1024 sample frames at a 512 hop), mean removed, and its autocorrelation
 * normalised by the zero lag. The highest value between 0.25 and 4 s is
 * reported with its lag. A machine gun loop of one sample scores near 1;
 * a steady drone with no onsets scores near 0, which is right, because
 * the fatigue complaint is about the SAME event coming back the same way.
 */
export function repetition(mono, rate) {
  const frame = 1024;
  const hop = 512;
  const w = new Float64Array(frame);
  for (let i = 0; i < frame; i += 1) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / frame);
  }
  const re = new Float64Array(frame);
  const im = new Float64Array(frame);
  let prev = null;
  const flux = [];
  for (let off = 0; off + frame <= mono.length; off += hop) {
    for (let i = 0; i < frame; i += 1) {
      re[i] = mono[off + i] * w[i];
      im[i] = 0;
    }
    fftInPlace(re, im);
    const mag = new Float64Array(frame / 2);
    let f = 0;
    for (let k = 0; k < frame / 2; k += 1) {
      mag[k] = Math.log1p(1000 * Math.hypot(re[k], im[k]));
      if (prev) {
        const d = mag[k] - prev[k];
        if (d > 0) {
          f += d;
        }
      }
    }
    flux.push(f);
    prev = mag;
  }
  const n = flux.length;
  if (n < 8) {
    return { peak: 0, lagS: 0 };
  }
  const mean = flux.reduce((a, v) => a + v, 0) / n;
  const e = flux.map((v) => v - mean);
  let r0 = 0;
  for (let i = 0; i < n; i += 1) {
    r0 += e[i] * e[i];
  }
  if (!(r0 > 0)) {
    return { peak: 0, lagS: 0 };
  }
  const fps = rate / hop;
  const lo = Math.max(1, Math.round(0.25 * fps));
  const hi = Math.min(n - 1, Math.round(4 * fps));
  let peak = 0;
  let lagS = 0;
  for (let lag = lo; lag <= hi; lag += 1) {
    let r = 0;
    for (let i = 0; i + lag < n; i += 1) {
      r += e[i] * e[i + lag];
    }
    /* Unbiased, so a long lag is not favoured or penalised by its overlap. */
    r = (r / (n - lag)) / (r0 / n);
    if (r > peak) {
      peak = r;
      lagS = lag / fps;
    }
  }
  return { peak, lagS };
}

/* Non finite and subnormal samples. A subnormal float32 is |x| under
 * 2^-126 and not zero: x87 and some SIMD paths take a slow microcode trap
 * on every one, which is how a decaying filter tail stalls a thread. */
export function hygiene(chans) {
  let nonFinite = 0;
  let subnormal = 0;
  const tiny = 1.1754943508222875e-38;
  for (const x of chans) {
    for (let i = 0; i < x.length; i += 1) {
      const v = x[i];
      if (!Number.isFinite(v)) {
        nonFinite += 1;
      } else if (v !== 0 && Math.abs(v) < tiny) {
        subnormal += 1;
      }
    }
  }
  return { nonFinite, subnormal };
}

export function monoOf(chans) {
  const n = chans[0].length;
  const m = new Float64Array(n);
  for (const c of chans) {
    for (let i = 0; i < n; i += 1) {
      m[i] += c[i] / chans.length;
    }
  }
  return m;
}

/* Everything above for one render, rounded for a table. */
export function measure(chans, rate) {
  const mono = monoOf(chans);
  const l = loudness(chans, rate);
  const b = bands(mono, rate);
  const r = repetition(mono, rate);
  const h = hygiene(chans);
  const round = (v, d = 2) => (Number.isFinite(v) ? Number(v.toFixed(d)) : v === -Infinity ? -999 : null);
  return {
    lufs: round(l.integrated),
    lufsShortMax: round(l.shortTermMax),
    lufsMomentaryMax: round(l.momentaryMax),
    lra: round(l.range),
    truePeakDbtp: round(truePeak(chans)),
    harshShareA: round(b.harshA, 1),
    bandShareA: Object.fromEntries(Object.entries(b.shareA).map(([k, v]) => [k, round(v, 1)])),
    centroidHz: Math.round(b.centroidHz),
    repetition: round(r.peak, 3),
    repetitionLagS: round(r.lagS, 2),
    nonFinite: h.nonFinite,
    subnormal: h.subnormal,
  };
}
