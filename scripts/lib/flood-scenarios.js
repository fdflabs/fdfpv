/*
 * flood-scenarios.js: the shallow water solver's test cases with known
 * answers, for scripts/water-check.js and, in Chrome, for
 * tests/browser/flood-harness.js. Each builds a solver from dist/flood.wasm,
 * runs it, and returns named checks, the figures it measured and the
 * state's hash at the end, which must be the same in Node and in Chrome.
 *
 * Every bed and every starting state is made with integer arithmetic or
 * exact sums of binary fractions, never Math.sin or a host's libm, so
 * the module is handed the same bits on every host. The answers the
 * runs are held to (Ritter's profile, the weir and orifice formulas, the
 * critical flow over a crest) are computed here with Math.sqrt, which is
 * only ever compared with, never fed back.
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

import {
  BOUND, G, LINK, SIDE, loadFlood,
} from '../../src/sim/water/flood.js';

/* A cell's pseudo random bump in [0, 1), 1/1024 steps, from its indices
 * alone (a 32 bit integer hash). */
function bump(i, j, seed) {
  let x = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(j + 7, 0x85ebca77) ^ Math.imul(seed, 0xc2b2ae3d);
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
  x ^= x >>> 15;
  return ((x >>> 0) % 1024) / 1024;
}

async function solver(wasm, nx, nz, dx, dt) {
  const f = await loadFlood(wasm);
  f.init(nx, nz, 0, 0, dx, dt);
  return f;
}

function result(name, checks, figures, f) {
  return {
    name, checks, figures, hash: f.hash(),
  };
}

const c = (name, ok, detail = '') => ({ name, ok: Boolean(ok), detail });

/*
 * WELL BALANCED: a lake at rest for ten minutes over a bed of random
 * bumps two to eight metres high with islands standing out of it. Still
 * water must stay still: no current, no level moving, no volume lost.
 */
export async function restLake(wasm) {
  const nx = 64; const nz = 64; const dx = 4; const dt = 0.02;
  const f = await solver(wasm, nx, nz, dx, dt);
  const b = f.bed(); const h = f.h();
  const LEVEL = 10;
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const k = j * nx + i;
      b[k] = bump(i, j, 1) % (1 / 13) < 1 / 160 ? 12 : 2 + 6 * bump(i, j, 2);
      h[k] = Math.max(0, LEVEL - b[k]);
    }
  }
  f.setManning(0, 0.03);
  const v0 = f.volume();
  const steps = 30000;
  f.step(steps);
  let speed = 0; let level = 0; let islands = 0;
  const hu = f.hu(); const hv = f.hv(); const hh = f.h();
  for (let k = 0; k < nx * nz; k += 1) {
    if (b[k] >= LEVEL) {
      islands += 1;
      continue;
    }
    speed = Math.max(speed, Math.hypot(hu[k], hv[k]) / hh[k]);
    level = Math.max(level, Math.abs(hh[k] + b[k] - LEVEL));
  }
  const dv = Math.abs(f.volume() - v0) / v0;
  return result('lake at rest', [
    c(`still water stays still for ${(steps * dt) / 60} min over a random bed with ${islands} island cells: fastest current under 1e-9 m/s`, speed < 1e-9, `${speed.toExponential(2)} m/s`),
    c('the level stays within a nanometre of where it was', level < 1e-9, `${level.toExponential(2)} m`),
    c('and the volume to 1e-12', dv < 1e-12, `${dv.toExponential(2)}`),
  ], { speed, level, dv }, f);
}

/*
 * MASS: a closed basin, every edge a wall, with a column of water
 * released over a rough sloping bed onto dry ground, a wall across it
 * and an opening link through the wall, Manning friction everywhere,
 * for two minutes. Nothing comes in or goes out, so the volume must be
 * what it was to 1e-9 of itself.
 */
export async function closedBasin(wasm) {
  const nx = 96; const nz = 64; const dx = 2; const dt = 0.01;
  const f = await solver(wasm, nx, nz, dx, dt);
  const b = f.bed(); const h = f.h();
  const WALL = 60;
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const k = j * nx + i;
      b[k] = i === WALL || i === WALL + 1 ? 30 : 2 + (i / 32) + 2 * bump(i, j, 3);
      h[k] = i < 24 ? Math.max(0, 9 - b[k]) : 0;
    }
  }
  f.setManning(0, 0.03);
  const up = []; const down = [];
  for (let j = 20; j < 44; j += 1) {
    up.push(j * nx + WALL - 2);
    down.push(j * nx + WALL + 3);
  }
  const link = f.link(LINK.opening, up, down);
  f.linkBands(link, [[3, 6, 10, 0.61]]);
  f.linkDir(link, 1, 0);
  const v0 = f.volume();
  f.step(12000);
  const dv = Math.abs(f.volume() - v0) / v0;
  const through = f.linkVol(link);
  const courant = f.stat(1);
  return result('closed basin', [
    c('two minutes of a dam break, wet and dry fronts, friction and a link through a wall: the volume to 1e-9', dv < 1e-9, `${dv.toExponential(2)} of ${v0.toFixed(1)} m3`),
    c('water went through the link', through > 1, `${through.toFixed(1)} m3`),
    c('the Courant number stayed under 0.5, which the scheme\'s positivity needs', courant < 0.5, courant.toFixed(3)),
    c('no depth went negative past rounding', f.stat(5) < 1e-9 * v0, `${f.stat(5).toExponential(2)} m3 raised`),
  ], { dv, through, courant }, f);
}

/* Ritter's dam break onto a dry, flat, frictionless bed (1892): water h0
 * deep for x < 0 released at t = 0. The depth at (x, t). */
function ritter(h0, x, t) {
  const c0 = Math.sqrt(G * h0);
  if (x <= -c0 * t) return h0;
  if (x >= 2 * c0 * t) return 0;
  const a = 2 * c0 - x / t;
  return (a * a) / (9 * G);
}

/*
 * RITTER: a 10 m column released down a 1 m channel, run along x and
 * again along z. The profile at 20 s against Ritter's, the front (the
 * furthest cell a centimetre deep) against where Ritter puts a
 * centimetre, and the front's speed against the shallow water celerity,
 * 2 sqrt(g h0).
 */
export async function dambreak(wasm, along = 'x') {
  const L = 1200; const W = 4; const dx = 1; const dt = 0.02; const h0 = 10; const GATE = 400;
  const nx = along === 'x' ? L : W; const nz = along === 'x' ? W : L;
  const f = await solver(wasm, nx, nz, dx, dt);
  const h = f.h();
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const s = along === 'x' ? i : j;
      h[j * nx + i] = s < GATE ? h0 : 0;
    }
  }
  const depth = (s) => (along === 'x' ? f.h()[s] : f.h()[s * nx]);
  const front = () => {
    let s = L - 1;
    while (s > 0 && !(depth(s) > 0.01)) s -= 1;
    return (s + 1) * dx;
  };
  f.step(500);
  const t1 = 500 * dt; const front1 = front();
  f.step(500);
  const t2 = 1000 * dt; const front2 = front();
  let err = 0; let mass = 0;
  for (let s = 0; s < L; s += 1) {
    const x = (s + 0.5) * dx - GATE;
    /* The cell's mean of Ritter's depth, by Simpson's rule over it. */
    const exact = (ritter(h0, x - 0.5 * dx, t2) + 4 * ritter(h0, x, t2) + ritter(h0, x + 0.5 * dx, t2)) / 6;
    err += Math.abs(depth(s) - exact) * dx;
    mass += exact * dx;
  }
  const l1 = err / mass;
  const celerity = 2 * Math.sqrt(G * h0);
  /* Where Ritter puts the centimetre: 2 c0 - x / t = sqrt(9 g 0.01). */
  const cmSpeed = celerity - Math.sqrt(9 * G * 0.01);
  const speed = (front2 - front1) / (t2 - t1);
  const at = GATE + cmSpeed * t2;
  const name = `Ritter dam break along ${along}`;
  return {
    ...result(name, [
      c(`${name}: the profile at ${t2} s within 2 % of Ritter's (L1)`, l1 < 0.02, `${(100 * l1).toFixed(2)} %`),
      c(`${name}: the 1 cm front at ${t2} s within 2 % of Ritter's ${at.toFixed(1)} m`, Math.abs(front2 - at) < 0.02 * (at - GATE), `${front2.toFixed(1)} m`),
      c(`${name}: the front's speed within 3 % of the celerity 2 sqrt(g h0) = ${celerity.toFixed(2)} m/s`, Math.abs(speed - celerity) < 0.03 * celerity,
        `${speed.toFixed(2)} m/s, Ritter's 1 cm contour ${cmSpeed.toFixed(2)}`),
    ], {
      l1, front: front2, at, speed, celerity, cmSpeed,
    }, f),
    profile: Array.from({ length: L }, (_, s) => depth(s)),
  };
}

/*
 * THE CREST: water from a reservoir held at 4 m over a channel's bed,
 * over a frictionless broad crest 2 m high and off its end into a free
 * fall. Nothing but the shallow water equations decides the discharge;
 * at steady state it must be critical flow over the crest, q = sqrt(g)
 * (2 E / 3)^1.5, E the energy head over the crest upstream.
 */
export async function crest(wasm) {
  const nx = 320; const nz = 4; const dx = 1; const dt = 0.02;
  const f = await solver(wasm, nx, nz, dx, dt);
  const b = f.bed(); const h = f.h();
  const LEVEL = 4; const CREST = 2;
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const k = j * nx + i;
      let y = 0;
      if (i >= 120 && i < 140) y = CREST * ((i - 119) / 20);
      else if (i >= 140 && i < 200) y = CREST;
      else if (i >= 200) y = CREST - 8 * ((i - 199) / 120);
      b[k] = y;
      h[k] = i < 140 ? Math.max(0, LEVEL - y) : 0;
    }
  }
  const inlet = f.bound(SIDE.west, 0, nz - 1, BOUND.stage, LEVEL);
  const outlet = f.bound(SIDE.east, 0, nz - 1, BOUND.stage, -100);
  f.step(15000);
  const q = -f.boundRate(outlet) / (nz * dx);
  const qIn = f.boundRate(inlet) / (nz * dx);
  const k = 2 * nx + 60;
  const u = f.hu()[k] / f.h()[k];
  const E = f.h()[k] + b[k] + (u * u) / (2 * G) - CREST;
  const want = Math.sqrt(G) * ((2 * E) / 3) ** 1.5;
  const err = Math.abs(q - want) / want;
  return result('crest', [
    c(`critical flow over a broad crest: q within 2 % of sqrt(g) (2E/3)^1.5 = ${want.toFixed(3)} m2/s`, err < 0.02, `${q.toFixed(3)} m2/s, E ${E.toFixed(3)} m`),
    c('steady: what comes in goes out, to 0.1 %', Math.abs(qIn - q) < 1e-3 * q, `in ${qIn.toFixed(4)}, out ${q.toFixed(4)}`),
  ], { q, want, E }, f);
}

/* The strips formula for a rectangular opening by hand: Cd b sqrt(2g)
 * times the integral of sqrt(e1 - max(z, e2)) dz over [lo, min(hi, e1)]. */
export function openingQ(cd, b, lo, hi, e1, e2) {
  const top = Math.min(hi, e1);
  if (!(top > lo)) return 0;
  let s = 0; let from = lo;
  if (e2 > lo) {
    const t = Math.min(e2, top);
    s += (t - lo) * Math.sqrt(e1 - e2);
    from = t;
  }
  if (top > from) s += (2 / 3) * ((e1 - from) ** 1.5 - (e1 - top) ** 1.5);
  return cd * b * Math.sqrt(2 * G) * s;
}

/*
 * THE OPENING: a reservoir held at 10 m behind a wall, an opening link
 * through it into a channel. Three regimes: a weir (the water under the
 * opening's top), an orifice (over it) and drowned (the tailwater over
 * the sill). Each at steady state: the link's discharge is the formula
 * at the levels on either side, what leaves the channel is what the link
 * passes, and the approach keeps the level at the opening near the
 * reservoir's.
 */
export async function opening(wasm, regime) {
  const nx = 120; const nz = 24; const dx = 2; const dt = 0.02;
  const f = await solver(wasm, nx, nz, dx, dt);
  const b = f.bed(); const h = f.h();
  const WALL = 40; const LEVEL = 10; const SILL = 6;
  const hi = regime === 'orifice' ? 8 : 30;
  const tail = regime === 'drowned' ? 8 : -100;
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const k = j * nx + i;
      const wall = i >= WALL && i < WALL + 2;
      b[k] = wall ? 40 : 0;
      h[k] = wall ? 0 : i < WALL ? LEVEL : Math.max(0, tail);
    }
  }
  f.setManning(0, 0.02);
  const inlet = f.bound(SIDE.west, 0, nz - 1, BOUND.stage, LEVEL);
  const outlet = f.bound(SIDE.east, 0, nz - 1, BOUND.stage, tail);
  const up = []; const down = [];
  for (let j = 8; j < 16; j += 1) {
    up.push(j * nx + WALL - 1);
    down.push(j * nx + WALL + 2);
  }
  const link = f.link(LINK.opening, up, down);
  const B = 8; const CD = 0.74;
  f.linkBands(link, [[SILL, hi, B, CD]]);
  f.linkDir(link, 1, 0);
  f.step(9000);
  const mean = (cells) => {
    let s = 0; let n = 0;
    for (const k of cells) {
      if (f.h()[k] > 1e-4) {
        s += f.h()[k] + b[k];
        n += 1;
      }
    }
    return n ? s / n : Math.max(...cells.map((k) => b[k]));
  };
  /* The link reads the levels before it moves the step's water: step
   * once more and compare with the levels read now. */
  const e1 = mean(up); const e2 = mean(down);
  f.step(1);
  const q = f.linkQ(link);
  const want = openingQ(CD, B, SILL, hi, e1, e2);
  const out = -f.boundRate(outlet);
  const inn = f.boundRate(inlet);
  const name = `opening, ${regime}`;
  return result(name, [
    c(`${name}: the link's discharge is the formula at the levels it sees, to 1e-9`, Math.abs(q - want) <= 1e-9 * want, `${q.toFixed(3)} m3/s, by hand ${want.toFixed(3)}`),
    c(`${name}: steady, the reservoir supplies what the link passes, to 1 %`, Math.abs(inn - q) < 0.01 * q, `in ${inn.toFixed(2)}, link ${q.toFixed(2)}`),
    c(`${name}: and the channel lets out what the link passes, to 1 %`, Math.abs(out - q) < 0.01 * q, `out ${out.toFixed(2)}`),
    c(`${name}: the level at the opening within 2 % of the reservoir's head over the sill`, Math.abs(e1 - LEVEL) < 0.02 * (LEVEL - SILL), `${e1.toFixed(3)} m`),
  ], {
    q, want, e1, e2, inn, out,
  }, f);
}

/* The cost: a 256 by 256 grid all wet and all moving (a dam break in a
 * box), ns per cell per step, after a warm up. */
export async function cost(wasm, now) {
  const n = 256; const dx = 4; const dt = 0.02;
  const f = await solver(wasm, n, n, dx, dt);
  const b = f.bed(); const h = f.h();
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const k = j * n + i;
      b[k] = 2 * bump(i, j, 5);
      h[k] = (i < 128 ? 20 : 5) - b[k];
    }
  }
  f.setManning(0, 0.03);
  f.step(20);
  const t0 = now();
  const steps = 200;
  f.step(steps);
  const ms = now() - t0;
  return { nsPerCell: (ms * 1e6) / (steps * n * n), msPerStep: ms / steps, cells: n * n };
}

/* Every scenario whose hash Node and Chrome must agree on. */
export const SCENARIOS = [
  ['lake at rest', restLake],
  ['closed basin', closedBasin],
  ['Ritter along x', (w) => dambreak(w, 'x')],
  ['Ritter along z', (w) => dambreak(w, 'z')],
  ['crest', crest],
  ['opening, weir', (w) => opening(w, 'weir')],
  ['opening, orifice', (w) => opening(w, 'orifice')],
  ['opening, drowned', (w) => opening(w, 'drowned')],
];
