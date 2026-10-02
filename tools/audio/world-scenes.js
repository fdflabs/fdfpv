/*
 * world-scenes.js: the scripted scenes the world's sound is judged on
 * (docs/AUDIO.md section 12), as the frames src/render/world-audio.js
 * would post: a listener and every source's position and velocity at
 * 60 Hz, and the explosions with their times. Plain arithmetic, Node and
 * browser alike: tools/audio/world.js renders them in Node against the
 * bars, tools/audio/drive.js in the browser for the listening page.
 *
 * Positions are scene world metres, y up, the frame the game posts in.
 * The listener faces -z (Three.js's camera forward) with +x to its right.
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

import { KIND_INDEX, SOURCE_STRIDE, WORLD_KINDS } from '../../src/render/world-kinds.js';

export const FRAME_HZ = 60;
/* The listener's ear over its ground, metres. */
const EAR_M = 1.7;

/* A listener standing at (x, gy + EAR_M, z), facing -z. */
function standing(x, gy, z) {
  return [x, gy + EAR_M, z, 0, 0, -1, 1, 0, 0, gy];
}

/* A seeded uniform in [0, 1), for scenes with many sources. */
function prng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/*
 * Build a scene from `paths`: [{ id, kind, at(t) -> [x, y, z], from, to }]
 * with velocities by central difference, a listener, and booms. Returns
 * { seconds, frames: [{ t, lis, src }], booms, title, group, listen }.
 */
function scene({ title, group, seconds, lis, paths, booms = [], role = 'other', note = '' }) {
  const frames = [];
  const n = Math.round(seconds * FRAME_HZ);
  const h = 1e-3;
  for (let i = 0; i <= n; i += 1) {
    const t = i / FRAME_HZ;
    const live = paths.filter((p) => t >= (p.from ?? 0) && t <= (p.to ?? Infinity));
    const src = new Float64Array(live.length * SOURCE_STRIDE);
    live.forEach((p, k) => {
      const a = p.at(t);
      const b = p.at(t + h);
      const o = k * SOURCE_STRIDE;
      src[o] = p.id;
      src[o + 1] = KIND_INDEX[p.kind];
      src[o + 2] = a[0];
      src[o + 3] = a[1];
      src[o + 4] = a[2];
      src[o + 5] = (b[0] - a[0]) / h;
      src[o + 6] = (b[1] - a[1]) / h;
      src[o + 7] = (b[2] - a[2]) / h;
    });
    frames.push({ t, lis: typeof lis === 'function' ? lis(t) : lis, src });
  }
  return { title, group, seconds, frames, booms, role, note };
}

/* A straight line at speed v from p0 along unit d. */
function line(p0, d, v, t0 = 0) {
  const m = Math.hypot(...d);
  return (t) => [0, 1, 2].map((k) => p0[k] + (d[k] / m) * v * (t - t0));
}

/* A circle of radius r about c at height y, speed v: constant distance
 * and no radial speed, so no Doppler; the calibration path. */
function circle(c, r, y, v, phase = 0) {
  const w = v / r;
  return (t) => [c[0] + r * Math.cos(phase + w * t), y, c[2] + r * Math.sin(phase + w * t)];
}

export const SCENES = {
  /*
   * An attack wave passing a pilot standing on the dam's crest: six
   * Strikers in a line abreast 25 m apart at 40 m, their nearest pass
   * 30 m to the side; four electric loiterers higher and behind them;
   * five FPV quads weaving low; two boats on the water below.
   */
  'war-wave': (() => {
    const paths = [];
    let id = 1;
    for (let k = 0; k < 6; k += 1) {
      paths.push({ id: id++, kind: 'strike', at: line([-520 + 6 * k, 40, -30 - 25 * k], [1, 0, 0.02], 26.6) });
    }
    for (let k = 0; k < 4; k += 1) {
      paths.push({ id: id++, kind: 'loiter', at: line([-600 - 30 * k, 110 + 5 * k, -40 - 40 * k], [1, 0, 0], 19.6) });
    }
    for (let k = 0; k < 5; k += 1) {
      const base = line([-480 - 15 * k, 20 + 3 * k, -30 - 8 * k], [1, 0, 0], 21);
      paths.push({ id: id++, kind: 'fpv', at: (t) => { const p = base(t); p[2] += 8 * Math.sin(t * 2.1 + k); return p; } });
    }
    for (let k = 0; k < 2; k += 1) {
      paths.push({ id: id++, kind: 'boat', at: line([-200 - 40 * k, -58, -160 - 30 * k], [1, 0, 0], 9.8) });
    }
    return scene({ title: 'War: an attack wave passing (6 Strikers, 4 loiterers, 5 FPV, 2 boats)', group: 'War', seconds: 30, lis: standing(0, 0, 0), paths });
  })(),
  /* One Striker past at 20 m, as the engine's own fly by is flown. */
  'strike-pass': scene({
    title: 'War: one Strike attacker past at 20 m', group: 'War', seconds: 12, lis: standing(0, 0, 0),
    paths: [{ id: 1, kind: 'strike', at: line([-160, 18, -10], [1, 0, 0], 26.6) }],
  }),
  /* A loiterer's dive onto a point 25 m in front, and its warhead. */
  'loiter-dive': (() => {
    /* Its circle, then a straight dive at the kind's 28 m/s
     * (routes.js KIND.loiter.dive) onto the point. */
    const orbit = circle([0, 0, -25], 120, 150, 19.6);
    const top = orbit(9);
    const diveS = Math.hypot(top[0], top[1], top[2] + 25) / 28;
    const at = (t) => {
      if (t < 9) {
        return orbit(t);
      }
      const u = Math.min(1, (t - 9) / diveS);
      return [top[0] * (1 - u), top[1] * (1 - u), -25 + (top[2] + 25) * (1 - u)];
    };
    return scene({
      title: 'War: a loiterer circles and dives on a point 25 m away', group: 'War', seconds: 9 + diveS + 4, lis: standing(0, 0, 0),
      paths: [{ id: 1, kind: 'loiter', at, to: 9 + diveS }],
      booms: [{ t: 9 + diveS, p: [0, 0, -25], level: 0.67, seed: 11 }],
    });
  })(),
  /* A warhead 40 m away: the near explosion, judged on the bar. */
  'boom-40': scene({ title: 'Explosions: one at 40 m (the near one)', group: 'Explosions', seconds: 5, lis: standing(0, 0, 0), paths: [], booms: [{ t: 0.5, p: [15, 3, -37], level: 0.67, seed: 4 }], role: 'fx' }),
  /* Explosions at 100, 300 and 1000 m, the warhead's level. */
  'boom-100': scene({ title: 'Explosions: one at 100 m', group: 'Explosions', seconds: 6, lis: standing(0, 0, 0), paths: [], booms: [{ t: 0.5, p: [0, 5, -100], level: 0.67, seed: 1 }], role: 'fx' }),
  'boom-300': scene({ title: 'Explosions: one at 300 m', group: 'Explosions', seconds: 7, lis: standing(0, 0, 0), paths: [], booms: [{ t: 0.3, p: [120, 5, -275], level: 0.67, seed: 2 }], role: 'fx' }),
  'boom-1000': scene({ title: 'Explosions: one at 1000 m', group: 'Explosions', seconds: 9, lis: standing(0, 0, 0), paths: [], booms: [{ t: 0.2, p: [-300, 5, -954], level: 0.87, seed: 3 }], role: 'fx' }),
  /* The same 300 m one with the dam's face 200 m behind the listener:
   * its image comes back off the concrete, later and darker. */
  'boom-300-dam': scene({
    title: 'Explosions: 300 m, with the dam behind (its echo)', group: 'Explosions', seconds: 8, lis: standing(0, 0, 0), paths: [], role: 'fx',
    booms: [{ t: 0.3, p: [120, 5, -275], level: 0.67, seed: 2, images: [[120, 5, 675, 0.6]] }],
  }),
  /* Ten in a row 400 m off, none the same samples. */
  'boom-salvo': scene({
    title: 'Explosions: ten in two seconds at 400 m (no two alike)', group: 'Explosions', seconds: 8, lis: standing(0, 0, 0), paths: [], role: 'fx',
    booms: Array.from({ length: 10 }, (_, k) => ({ t: 0.3 + 0.2 * k, p: [-200 + 40 * k, 5, -350], level: 0.55, seed: 100 + k })),
  }),
  /*
   * THE COST SCENE, not for listening: the full war, 120 attackers spread
   * over three kilometres around the listener, every kind, and a boom
   * every half second, so the pool and the far bed are both full. Its
   * render cost is the budget's measurement.
   */
  'war-full': (() => {
    const r = prng(0xfeed);
    const mix = ['strike', 'strike', 'strike', 'fpv', 'fpv', 'fpv', 'loiter', 'loiter', 'boat', 'scout', 'hunter', 'decoy'];
    const paths = [];
    for (let k = 0; k < 120; k += 1) {
      const kind = mix[k % mix.length];
      const ang = r() * 2 * Math.PI;
      const dist = 60 + 2900 * r() ** 1.5;
      const y = kind === 'boat' ? -58 : 20 + 140 * r();
      const head = r() * 2 * Math.PI;
      paths.push({ id: 1000 + k, kind, at: line([dist * Math.cos(ang), y, dist * Math.sin(ang)], [Math.cos(head), 0, Math.sin(head)], WORLD_KINDS[kind].cruise) });
    }
    const booms = Array.from({ length: 36 }, (_, k) => ({ t: 0.5 + 0.5 * k, p: [600 * Math.cos(k), 5, 600 * Math.sin(k)], level: 0.6, seed: 500 + k }));
    return scene({ title: 'War: the full war, 120 attackers (cost)', group: 'Budget', seconds: 18, lis: standing(0, 0, 0), paths, booms, note: 'cost' });
  })(),
};

/* The calibration scene for one kind: circling the listener at 16 m and
 * the listener's height, at its cruise, for 6 s. */
export function calibrationScene(kind) {
  const spec = WORLD_KINDS[kind];
  return scene({
    title: `calibration: ${kind}`, group: 'calibration', seconds: 6, lis: standing(0, 0, 0),
    paths: [{ id: 1, kind, at: circle([0, 0, 0], 16, EAR_M, Math.max(0.5, spec.cruise)) }],
  });
}
