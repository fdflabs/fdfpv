/*
 * schedule.js: when a geyser erupts and how high it is at any moment, as a
 * pure function of the simulator's clock.
 *
 * Nothing here integrates anything. Eruption k starts at
 * offset + k * interval + jitter(k) * interval, with the jitter a hash of k
 * bounded well inside half an interval, so the starts stay in order and the
 * eruption in progress at any time t is found from floor(t / interval) and
 * its neighbour without walking a history. A replay, a title loop and a
 * capture that jumps the clock all see the same column at the same height,
 * which is the rule for anything driven from updateAnim.
 *
 * The phases are from the published behaviour of each geyser (NPS and the
 * Geyser Observation and Study Association, as summarised on Wikipedia,
 * 2026-09): Old Faithful every 92 minutes on average, 1.5 to 5 minutes of
 * water to 32 to 56 m after a few minutes of splashing preplay; Castle a
 * twenty minute water phase to 27 m then a thirty to forty minute roaring
 * steam phase, every 16 to 17 hours; Grand one to four bursts to 61 m over
 * nine to twelve minutes, every six to seven hours; Riverside twenty
 * minutes to 23 m arched over the Firehole, every five and a half to seven
 * hours; Beehive five minutes to 61 m in a narrow column, every ten to
 * twenty hours, its Indicator splashing a few metres for fifteen to twenty
 * minutes before. A demo interval compresses the wait and, only as far as
 * it must, the phases.
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

/* A hash of an integer and a seed to [0, 1). */
export function hash01(k, seed) {
  let h = Math.imul((k | 0) ^ Math.imul(seed | 0, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/*
 * The styles. Times in seconds, heights in metres. `pre` is the splashing
 * before the column, `rise` the climb to full height, `water` the whole
 * water phase (a [min, max] range dealt per eruption), `steam` the steam
 * phase after it, `height` the column's range, and `bursts` for Grand.
 */
export const STYLES = {
  'old-faithful': {
    interval: 92 * 60, jitter: 0.18, pre: 150, rise: 12, water: [90, 300], steam: 90, height: [32, 56],
  },
  castle: {
    interval: 16.5 * 3600, jitter: 0.05, pre: 240, rise: 40, water: [1080, 1320], steam: 2100, height: [20, 27],
  },
  grand: {
    interval: 6.5 * 3600, jitter: 0.1, pre: 300, rise: 8, water: [540, 720], steam: 240, height: [45, 61], bursts: [1, 4],
  },
  riverside: {
    interval: 6.2 * 3600, jitter: 0.08, pre: 600, rise: 60, water: [1140, 1260], steam: 300, height: [20, 23],
  },
  beehive: {
    interval: 15 * 3600, jitter: 0.2, pre: 1080, rise: 6, water: [270, 330], steam: 60, height: [50, 61],
  },
  /* A small geyser from the inventory with a published interval: a short
   * column, no preplay, a little steam after. */
  minor: {
    interval: 3600, jitter: 0.15, pre: 0, rise: 3, water: [60, 180], steam: 30, height: [2, 8],
  },
};

/* The demo intervals the map can switch to, in seconds: short enough that
 * a pilot who waits over Old Faithful sees it go. */
export const DEMO_INTERVALS = {
  'old-faithful': 240, castle: 720, grand: 540, riverside: 600, beehive: 660,
};

const smooth = (a, b, v) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/*
 * One geyser's clock. `interval`, `duration` and `height` from the
 * inventory ({ mean, min, max }) override the style's when given. Returns an object whose at(t) is the state at t
 * seconds of simulator time: the phase, the water column as a fraction of
 * this eruption's full height (`power`), that height in metres, and how much
 * steam is pouring off (0 to 1).
 */
export function makeSchedule(styleName, { seed = 1, offset, interval, duration, height } = {}) {
  const base = STYLES[styleName];
  if (!base) {
    throw new Error(`schedule: no style ${styleName}`);
  }
  /* The inventory's published ranges, { mean, min, max }, override the
   * style's: the interval's spread becomes the jitter (bounded so the
   * eruptions stay in order), the durations and heights are dealt from
   * their ranges. */
  const style = { ...base };
  if (interval) {
    style.interval = interval.mean;
    style.jitter = Math.min(0.3, Math.max(0.02, (interval.max - interval.min) / (2 * interval.mean)));
  }
  if (duration) {
    style.water = [duration.min, Math.max(duration.max, duration.min + 1)];
  }
  if (height) {
    style.height = [height.min * (height.min === height.max ? 0.85 : 1), height.max];
  }
  const realInterval = style.interval;
  let period = realInterval;
  let squeeze = 1;
  const start0 = offset ?? hash01(0, seed) * period;

  /* The span one eruption occupies: preplay, the longest water, the steam. */
  const span = () => (style.pre + style.water[1] + style.steam) * squeeze;

  function setInterval(seconds) {
    period = seconds ?? realInterval;
    /* Phases squeezed only when the demo interval cannot hold them with
     * the jitter's room either side. */
    const room = period * (1 - 2 * style.jitter) * 0.85;
    squeeze = Math.min(1, room / (style.pre + style.water[1] + style.steam));
  }
  setInterval(null);

  const startOf = (k) => start0 + k * period + (hash01(k, seed + 17) * 2 - 1) * style.jitter * period;

  /* The eruption whose window holds t, or the next one. */
  function eruptionAt(t) {
    const k0 = Math.floor((t - start0) / period);
    for (const k of [k0 + 1, k0, k0 - 1]) {
      const s = startOf(k);
      if (t >= s - style.pre * squeeze && t < s + span() - style.pre * squeeze) {
        return k;
      }
    }
    return null;
  }

  function params(k) {
    const water = (style.water[0] + (style.water[1] - style.water[0]) * hash01(k, seed + 29)) * squeeze;
    const peak = style.height[0] + (style.height[1] - style.height[0]) * hash01(k, seed + 41);
    const bursts = style.bursts
      ? style.bursts[0] + Math.floor(hash01(k, seed + 53) * (style.bursts[1] - style.bursts[0] + 1))
      : 1;
    return { water, peak, bursts, pre: style.pre * squeeze, rise: style.rise * Math.max(0.5, squeeze), steam: style.steam * squeeze };
  }

  /* The water column's fraction of peak at tau seconds into eruption k. */
  function column(p, tau, k) {
    if (tau < 0) {
      /* Preplay: splashes a few metres high, coming and going, growing
       * more frequent toward the start. */
      if (tau < -p.pre) {
        return 0;
      }
      const u = 1 + tau / p.pre;
      const beat = Math.sin(tau * (1.1 + 1.4 * u) + hash01(k, seed + 3) * 6.28);
      return Math.max(0, beat) ** 3 * (0.05 + 0.13 * u);
    }
    if (tau > p.water) {
      return 0;
    }
    const flicker = 0.93 + 0.07 * Math.sin(tau * 2.3 + k) * Math.sin(tau * 0.71);
    if (styleName === 'grand') {
      /* Bursts: each rises hard and tapers, with a short lull between. */
      const n = p.bursts;
      const each = p.water / n;
      const b = Math.min(n - 1, Math.floor(tau / each));
      const u = (tau - b * each) / each;
      const strength = 1 - 0.15 * b * hash01(k * 7 + b, seed + 61);
      return strength * smooth(0, 0.06, u) * (1 - smooth(0.55, 0.92, u)) * flicker;
    }
    const up = smooth(0, p.rise, tau);
    let down;
    if (styleName === 'old-faithful') {
      /* Full height for the first third or so, then a long decline to
       * short splashes before the steam phase. */
      down = 1 - 0.85 * smooth(p.water * 0.3, p.water, tau);
    } else if (styleName === 'castle') {
      down = 1 - 0.7 * smooth(p.water * 0.8, p.water, tau);
    } else {
      down = 1 - smooth(p.water * 0.85, p.water, tau);
    }
    return up * down * flicker;
  }

  function at(t) {
    const k = eruptionAt(t);
    if (k === null) {
      return { phase: 'quiet', power: 0, height: 0, steam: 0.15, k: null, tau: null };
    }
    const p = params(k);
    const tau = t - startOf(k);
    const power = column(p, tau, k);
    let phase;
    let steam;
    if (tau < 0) {
      /* Preplay steams no more than a quiet vent: the plume proper
       * (gain over 0.2) waits for the column. */
      phase = 'splash';
      steam = 0.16 + 0.03 * (1 + tau / p.pre);
    } else if (tau <= p.water) {
      phase = 'erupt';
      steam = 0.6 + 0.4 * power;
    } else {
      phase = 'steam';
      steam = styleName === 'castle' ? 1 : 0.7 * (1 - smooth(p.water, p.water + p.steam, tau));
    }
    return { phase, power, height: power * p.peak, peak: p.peak, steam: Math.max(0.15, steam), k, tau, water: p.water, pre: p.pre };
  }

  return {
    at,
    setInterval,
    get interval() {
      return period;
    },
    /* The start time of the next eruption after t, for the preview and for
     * a map that wants to put its title camera on one. */
    nextStart(t) {
      let k = Math.floor((t - start0) / period) - 1;
      while (startOf(k) <= t) {
        k += 1;
      }
      return startOf(k);
    },
    style: styleName,
  };
}
