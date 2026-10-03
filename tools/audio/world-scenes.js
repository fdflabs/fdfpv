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
 * { seconds, frames: [{ t, lis, src }], booms, title, group, role, note,
 * pass }: `pass` the window a pass is judged in, [min, max] LUFS of its
 * loudest 400 ms, when not an aircraft's (tools/audio/world.js BARS).
 */
function scene({ title, group, seconds, lis, paths, booms = [], role = 'other', note = '', pass = null }) {
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
  return { title, group, seconds, frames, booms, role, note, pass };
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

/*
 * THE VALLEY'S SCENES. A street, a bus stop, a field, a gondola, a lake:
 * the Alps and Swiss valley's traffic as src/maps/alps/life.js drives it
 * (ROAD_V 14 m/s on the road, 8.5 in the village street, the bus's 20 s
 * at its stop, the tractor's 2.4, the cabins' 5 at 130 m spacing, the
 * sailing boat's 2.4). They are judged on a quieter window than an
 * aircraft's pass (VALLEY_PASS): a street at 30 m is there, under the
 * pilot's own aircraft, never over it.
 */
export const VALLEY_PASS = [-48, -27];

/* Along +x at speed v from x0, starting at t0 (before it, not there). */
function road(x0, z, y, v, t0 = 0) {
  return { at: (t) => [x0 + v * (t - t0), y, z], from: t0 };
}

/* A bus coming in at v to stop at x = 0 (z, y), its dwell, then away at
 * a constant pull to v again: [arrive, decelerate, dwell, accelerate]. */
function busStop(z, y, v, dwell) {
  const dec = 1.0;
  const acc = 1.2;
  const tDec = v / dec;
  const xDec = (v * tDec) / 2;
  const tIn = 6;
  const x0 = -(v * tIn + xDec);
  return (t) => {
    if (t < tIn) {
      return [x0 + v * t, y, z];
    }
    if (t < tIn + tDec) {
      const u = t - tIn;
      return [-xDec + v * u - (dec * u * u) / 2, y, z];
    }
    if (t < tIn + tDec + dwell) {
      return [0, y, z];
    }
    const u = t - tIn - tDec - dwell;
    const tAcc = v / acc;
    return [u < tAcc ? (acc * u * u) / 2 : (acc * tAcc * tAcc) / 2 + v * (u - tAcc), y, z];
  };
}

Object.assign(SCENES, {
  /* A village street at 30 m: the PostAuto at the street's 8.5 m/s, then
   * cars at the road's 14, a motorbike, a van, and one the other way. */
  'street-30': scene({
    title: 'Valley: a street at 30 m (the bus, cars, a motorbike, a van)', group: 'Valley', seconds: 36, lis: standing(0, 0, 0), pass: VALLEY_PASS,
    paths: [
      { id: 1, kind: 'bus', ...road(-150, -30, 1.2, 8.5) },
      { id: 2, kind: 'car', ...road(-230, -32, 0.6, 14, 6) },
      { id: 3, kind: 'motorbike', ...road(-230, -32, 0.6, 14, 12) },
      { id: 4, kind: 'van', ...road(-230, -32, 0.8, 14, 18) },
      { id: 5, kind: 'car', at: (t) => [230 - 14 * (t - 3), 0.6, -28], from: 3 },
    ],
  }),
  /* The PostAuto at its stop 12 m away: in, its 8 s at idle, and away. */
  'bus-stop': scene({
    title: 'Valley: the PostAuto stops 12 m away, idles, pulls away', group: 'Valley', seconds: 36, lis: standing(0, 0, 0), pass: VALLEY_PASS,
    paths: [{ id: 1, kind: 'bus', at: busStop(-12, 1.2, 8.5, 8) }],
  }),
  /* The tractor round its field, the listener 12 m outside its edge. */
  'tractor-field': scene({
    title: 'Valley: the tractor at work round its field', group: 'Valley', seconds: 30, lis: standing(0, 0, 0), pass: VALLEY_PASS,
    paths: [{ id: 1, kind: 'tractor', at: (t) => { const a = Math.PI / 2 + (2.4 * t) / 47; return [36 * Math.cos(a), 1, -70 + 58 * Math.sin(a)]; } }],
  }),
  /* Under the gondola near its bottom station: cabins up and down every
   * 26 s (130 m at 5 m/s) 18 m overhead, the drive 60 m off. */
  gondola: scene({
    title: 'Valley: under the gondola near its station', group: 'Valley', seconds: 40, lis: standing(0, 0, 0), pass: VALLEY_PASS,
    paths: [
      { id: 1, kind: 'liftdrive', at: () => [-60, 3, -10] },
      ...[0, 1, 2].map((k) => ({ id: 10 + k, kind: 'cabin', at: (t) => [-150 + 130 * k + 5 * t, 18, -3] })),
      ...[0, 1, 2].map((k) => ({ id: 20 + k, kind: 'cabin', at: (t) => [150 - 130 * k - 5 * t, 18, 3] })),
    ],
  }),
  /* The sailing boat past the shore at 25 m. */
  'lake-sail': scene({
    title: 'Valley: the sailing boat past the shore at 25 m', group: 'Valley', seconds: 30, lis: standing(0, 0, 0), pass: [-60, -27],
    paths: [{ id: 1, kind: 'sailboat', ...road(-36, -25, -1, 2.4) }],
  }),
  /*
   * THE COST SCENE for a busy valley: everything the valley drives at
   * once (the bus, eight cars on both lanes, the tractor, 30 cabins and
   * the drive, the boat) within a kilometre.
   */
  'valley-busy': (() => {
    const paths = [{ id: 1, kind: 'bus', ...road(-300, -30, 1.2, 8.5) }];
    const cars = ['car', 'car', 'van', 'car', 'car', 'motorbike', 'car', 'van'];
    cars.forEach((kind, k) => {
      const dir = k % 2 ? -1 : 1;
      paths.push({ id: 2 + k, kind, at: (t) => [dir * (-400 + 90 * k + 14 * t), 0.6, -30 + 4 * dir] });
    });
    paths.push({ id: 20, kind: 'tractor', at: (t) => [200 + 36 * Math.cos((2.4 * t) / 47), 1, 40 + 58 * Math.sin((2.4 * t) / 47)] });
    paths.push({ id: 30, kind: 'liftdrive', at: () => [-300, 3, 200] });
    for (let k = 0; k < 30; k += 1) {
      const up = k % 2 ? 1 : -1;
      paths.push({ id: 100 + k, kind: 'cabin', at: (t) => [-300 + up * ((65 * k + 5 * t) % 1900), 20 + 0.2 * ((65 * k + 5 * t) % 1900), 200 + 4 * up] });
    }
    paths.push({ id: 200, kind: 'sailboat', ...road(-200, -250, -1, 2.4) });
    return scene({ title: 'Valley: everything that drives (cost)', group: 'Budget', seconds: 18, lis: standing(0, 0, 0), paths, note: 'cost' });
  })(),
});

/*
 * THE AMBIENCE'S SCENES: a spillway approached from the air, a night by
 * the reservoir, a morning in the forest, under a power line, an alpine
 * meadow, a town at a distance. A bed is the place, never an event: they
 * are judged in AMBIENCE_PASS, under the pilot's own aircraft (-27) by at
 * least 1 LU at their loudest moment, and over -60, where they would be
 * nothing.
 */
export const AMBIENCE_PASS = [-60, -28];

/* A still source at (x, y, z). */
function still(id, kind, x, y, z) {
  return { id, kind, at: () => [x, y, z] };
}

/* A listener flying straight at v from p0 along -z, its ground at gy. */
function flying(p0, v, gy) {
  return (t) => [p0[0], p0[1], p0[2] - v * t, 0, 0, -1, 1, 0, 0, gy];
}

Object.assign(SCENES, {
  /* Flying at 30 m/s and 40 m up along the river below the dam toward
   * the spillway's three plunge pools, from 1.4 km to 200 m: the roar
   * rising out of the river's own running water. */
  'spillway-approach': (() => {
    const lis = flying([0, 40, 1400], 30, 0);
    return scene({
      title: 'Ambience: flying up the river to the spillway, 1.4 km to 200 m', group: 'Ambience', seconds: 40, lis, pass: AMBIENCE_PASS, role: 'bed',
      paths: [
        still(1, 'spillway', -40, 4, 0), still(2, 'spillway', 0, 4, 0), still(3, 'spillway', 40, 4, 0),
        { id: 4, kind: 'river', at: (t) => { const l = lis(t); return [l[0], 0, l[2]]; } },
      ],
    });
  })(),
  /* A night on the reservoir's shore: the lapping at the listener's
   * feet, crickets in the grass, frogs along the shore, the town 1.5 km
   * off and the spillway 3 km. */
  'night-reservoir': scene({
    title: 'Ambience: night by the reservoir', group: 'Ambience', seconds: 40, lis: standing(0, 0, 0), pass: AMBIENCE_PASS, role: 'bed',
    paths: [
      { id: 1, kind: 'lapping', at: () => [0, -0.5, -4] },
      still(2, 'crickets', 12, 0.3, 8), still(3, 'crickets', -25, 0.3, 14), still(4, 'crickets', 40, 0.3, 30), still(5, 'crickets', -55, 0.3, 45),
      still(6, 'frogs', 22, 0.3, -3), still(7, 'frogs', -48, 0.3, -6), still(8, 'frogs', 75, 0.3, -2),
      still(9, 'townhum', 900, 10, 1200),
      still(10, 'spillway', -2000, 4, 2200),
    ],
  }),
  /* A morning at the forest's edge by the river: birds in the trees
   * round, a cicada far off, the river 150 m away. */
  'morning-forest': scene({
    title: 'Ambience: morning at the forest edge (birds, the river below)', group: 'Ambience', seconds: 40, lis: standing(0, 0, 0), pass: AMBIENCE_PASS, role: 'bed',
    paths: [
      still(1, 'birds', 25, 6, -20), still(2, 'birds', -40, 7, -35), still(3, 'birds', 60, 5, 10), still(4, 'birds', -70, 8, 40),
      still(5, 'birds', 15, 6, 70), still(6, 'birds', -100, 6, -90), still(7, 'birds', 110, 7, -60), still(8, 'birds', 5, 5, -120),
      still(9, 'cicada', 140, 6, 90),
      { id: 10, kind: 'river', at: () => [0, -20, 150] },
    ],
  }),
  /* Walking at 1.4 m/s under a 500 kV line 25 m up, its nearest point
   * overhead. */
  'power-line': scene({
    title: 'Ambience: walking under a 500 kV line', group: 'Ambience', seconds: 30, lis: (t) => [1.4 * t, 1.7, 0, 0, 0, -1, 1, 0, 0, 0], pass: AMBIENCE_PASS, role: 'bed',
    paths: [
      { id: 1, kind: 'powerline', at: (t) => [1.4 * t, 25, 0] },
      still(2, 'birds', 50, 6, -40), still(3, 'birds', -60, 6, 30),
    ],
  }),
  /* An alpine meadow: cows grazing round, two walking the fence, the
   * stream 30 m off, a few birds. */
  'alpine-meadow': scene({
    title: 'Ambience: an alpine meadow (cow bells, the stream)', group: 'Ambience', seconds: 40, lis: standing(0, 0, 0), pass: AMBIENCE_PASS, role: 'bed',
    paths: [
      ...[[18, -10], [-25, -30], [40, 25], [-60, 15], [70, -50], [-90, -70], [110, 40], [-130, 60]].map(([x, z], k) => still(1 + k, 'cowbell', x, 1, z)),
      { id: 10, kind: 'cowbell', at: (t) => [-80 + 0.45 * t, 1, -20] },
      { id: 11, kind: 'cowbell', at: (t) => [-60 + 0.42 * t, 1, -22] },
      { id: 12, kind: 'river', at: () => [0, -1, 30] },
      still(13, 'birds', 45, 6, -60), still(14, 'birds', -70, 6, 80),
    ],
  }),
  /* A town 1.2 km off, by day: its murmur, a bird or two. */
  'town-distant': scene({
    title: 'Ambience: the town 1.2 km off', group: 'Ambience', seconds: 30, lis: standing(0, 0, 0), pass: AMBIENCE_PASS, role: 'bed',
    paths: [still(1, 'townhum', 0, 10, -1200), still(2, 'birds', 40, 6, 30)],
  }),
  /*
   * THE COST SCENE for a war over Itaipu as it would sound: the full war
   * (war-full's 120 attackers and its booms) with everything the map
   * gives the ambience at once (the spillway's three pools, the river,
   * the reservoir's shore, the town, a power line and a grid of singers).
   */
  'itaipu-war-full': (() => {
    const war = SCENES['war-full'];
    const extra = [
      [1, 'spillway', -40, 4, -800], [2, 'spillway', 0, 4, -800], [3, 'spillway', 40, 4, -800],
      [4, 'river', 0, -40, 200], [5, 'lapping', 300, -1, -200], [6, 'townhum', 1500, 10, 900], [7, 'powerline', -120, 30, 60],
      ...Array.from({ length: 14 }, (_, k) => [20 + k, k % 4 ? 'birds' : 'cicada', 120 * Math.cos(k * 1.7), 6, 120 * Math.sin(k * 1.7)]),
    ];
    const frames = war.frames.map((f) => {
      const src = new Float64Array(f.src.length + extra.length * SOURCE_STRIDE);
      src.set(f.src);
      extra.forEach(([id, kind, x, y, z], k) => {
        const o = f.src.length + k * SOURCE_STRIDE;
        src[o] = 2e6 + id;
        src[o + 1] = KIND_INDEX[kind];
        src[o + 2] = x;
        src[o + 3] = y;
        src[o + 4] = z;
      });
      return { ...f, src };
    });
    return { ...war, frames, title: 'War over Itaipu: the full war and all its ambience (cost)' };
  })(),
});

/* Where a kind's level is given: 16 m and its lufs16, or for a source as
 * big as a spillway its own `near` and lufsNear. */
export function calibrationOf(spec) {
  return spec.near > 16 ? { m: spec.near, lufs: spec.lufsNear } : { m: 16, lufs: spec.lufs16 };
}

/* The calibration scene for one kind: circling the listener at its
 * calibration distance and its own height (else the ear's), at its
 * cruise, for 6 s,
 * or 30 for the ambience, whose birds rest for seconds between phrases. */
export function calibrationScene(kind) {
  const spec = WORLD_KINDS[kind];
  const { m } = calibrationOf(spec);
  return scene({
    title: `calibration: ${kind}`, group: 'calibration', seconds: spec.bed ? 30 : 6, lis: standing(0, 0, 0),
    paths: [{ id: 1, kind, at: circle([0, 0, 0], m, spec.height ?? EAR_M, Math.max(0.5, spec.cruise)) }],
  });
}
