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
import { createFloodHost } from '../../src/sim/water/host.js';

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
  /* dt at a Courant number of 0.44 on the deepest water, 8 m. */
  const nx = 64; const nz = 64; const dx = 4; const dt = 0.1;
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
  const steps = 6000;
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
    c('at a Courant number under 0.5', f.stat(1) < 0.5, f.stat(1).toFixed(3)),
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
 * again along z. The profile at 20 s against Ritter's, and the speed of
 * the flood's leading edge against the shallow water celerity: Ritter's
 * depth d travels at 2 sqrt(g h0) - 3 sqrt(g d), so each contour from a
 * tenth of a metre (1 % of h0) up must move at that speed. The last
 * centimetres of the tip are where every first order scheme smears a
 * front onto dry ground; their lag is measured and reported, not held
 * to Ritter's, and docs/FLOOD.md says what it means for a flood.
 */
const CONTOURS = [0.1, 0.5, 1, 2, 5];
const TIP = 0.01;

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
  /* The furthest point the depth d reaches, interpolated between cell
   * centres, metres from the gate. */
  const reach = (d) => {
    let s = L - 1;
    while (s > 0 && !(depth(s) > d)) s -= 1;
    const a = depth(s); const b2 = s + 1 < L ? depth(s + 1) : 0;
    return (s + 0.5 + (a - d) / (a - b2)) * dx - GATE;
  };
  const levels = [...CONTOURS, TIP];
  f.step(500);
  const t1 = 500 * dt; const at1 = levels.map(reach);
  f.step(500);
  const t2 = 1000 * dt; const at2 = levels.map(reach);
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
  const speeds = levels.map((d, k) => ({
    d, speed: (at2[k] - at1[k]) / (t2 - t1), want: celerity - 3 * Math.sqrt(G * d),
  }));
  const worst = speeds.slice(0, CONTOURS.length).reduce((m, s) => Math.max(m, Math.abs(s.speed - s.want) / s.want), 0);
  const tip = speeds[CONTOURS.length];
  const name = `Ritter dam break along ${along}`;
  return {
    ...result(name, [
      c(`${name}: the profile at ${t2} s within 2 % of Ritter's (L1)`, l1 < 0.02, `${(100 * l1).toFixed(2)} %`),
      c(`${name}: the flood's edge, every contour from ${CONTOURS[0]} m to ${CONTOURS[CONTOURS.length - 1]} m deep, moves within 3 % of 2 sqrt(g h0) - 3 sqrt(g d)`, worst < 0.03,
        speeds.slice(0, CONTOURS.length).map((s) => `${s.d} m ${s.speed.toFixed(2)}/${s.want.toFixed(2)}`).join(', ')),
    ], {
      l1, speeds, tip, celerity, worst,
    }, f),
    profile: Array.from({ length: L }, (_, s) => depth(s)),
  };
}

/*
 * NORMAL DEPTH: a wide channel on a uniform slope S with Manning's n,
 * fed q per metre by an INFLOW boundary at its head and let out by a
 * RATING boundary at its foot. Far from both it must run at Manning's
 * normal depth, h = (n q / sqrt(S))^(3/5), and what comes in must go
 * out.
 */
export async function normalDepth(wasm) {
  const nx = 400; const nz = 8; const dx = 5; const dt = 0.1;
  const S = 1e-3; const N = 0.03; const Q = 4;
  const f = await solver(wasm, nx, nz, dx, dt);
  const b = f.bed(); const h = f.h();
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      b[j * nx + i] = S * dx * (nx - i);
      /* Started near the answer: the channel settles on it
       * exponentially, a factor of e every 500 s or so. */
      h[j * nx + i] = 2;
    }
  }
  f.setManning(0, N);
  const inlet = f.bound(SIDE.west, 0, nz - 1, BOUND.inflow, Q * nz * dx);
  const outlet = f.bound(SIDE.east, 0, nz - 1, BOUND.rating, S);
  f.step(40000);
  const want = ((N * Q) / Math.sqrt(S)) ** 0.6;
  const k = 3 * nx + nx / 2;
  const got = f.h()[k];
  const inn = f.boundRate(inlet); const out = -f.boundRate(outlet);
  return result('normal depth', [
    c(`a sloped channel between an INFLOW and a RATING runs at Manning's normal depth ${want.toFixed(4)} m, to 1 %`, Math.abs(got - want) < 0.01 * want, `${got.toFixed(4)} m`),
    c('steady: the RATING lets out what the INFLOW brings, to 0.1 %', Math.abs(inn - out) < 1e-3 * inn, `in ${inn.toFixed(3)}, out ${out.toFixed(3)} m3/s`),
    c('at a Courant number under 0.5', f.stat(1) < 0.5, f.stat(1).toFixed(3)),
  ], { got, want }, f);
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
  /* Settle for 400 s, then 200 s more in 40 samples: at each, the
   * discharge against the formula at the levels the link read, and over
   * the window the mean flows in, through and out, since a basin with a
   * held level at one end and a wall at the other sloshes about its
   * mean for a long time after. */
  f.step(20000);
  const v0 = [f.boundVol(inlet), f.linkVol(link), f.boundVol(outlet)];
  let worst = 0; let q = 0; let want = 0; let e1 = 0; let e2 = 0; let e1Sum = 0;
  for (let k = 0; k < 40; k += 1) {
    f.step(250);
    [e1, e2] = f.linkLevels(link);
    q = f.linkQ(link);
    want = openingQ(CD, B, SILL, hi, e1, e2);
    worst = Math.max(worst, Math.abs(q - want) / want);
    e1Sum += e1;
  }
  const span = 40 * 250 * dt;
  const inn = (f.boundVol(inlet) - v0[0]) / span;
  const through = (f.linkVol(link) - v0[1]) / span;
  const out = (v0[2] - f.boundVol(outlet)) / span;
  const e1Mean = e1Sum / 40;
  const name = `opening, ${regime}`;
  return result(name, [
    c(`${name}: the link's discharge is the strips formula at the levels it read, to 1e-12`, worst < 1e-12, `${q.toFixed(3)} m3/s, by hand ${want.toFixed(3)} at ${e1.toFixed(3)} / ${e2.toFixed(3)} m`),
    c(`${name}: over 200 s the reservoir supplies what the link passes, to 2 %`, Math.abs(inn - through) < 0.02 * through, `in ${inn.toFixed(2)}, link ${through.toFixed(2)} m3/s`),
    c(`${name}: and the channel lets out what the link passes, to 2 %`, Math.abs(out - through) < 0.02 * through, `out ${out.toFixed(2)} m3/s`),
    c(`${name}: the level at the opening within 2 % of the head over the sill of the reservoir's`, Math.abs(e1Mean - LEVEL) < 0.02 * (LEVEL - SILL), `${e1Mean.toFixed(3)} m`),
  ], {
    q: through, want, e1: e1Mean, e2, inn, out,
  }, f);
}

/*
 * THE JOIN: a fine block of 2 m cells over a coarse block of 4 m, joined
 * (flood.c BLOCKS). Three things must hold across it. Still water over a
 * random bed with islands, ten minutes, stays still. A column released
 * in the fine block runs through the join into the coarse one and the
 * volume is what it was. And a sloped channel running down through the
 * join, an INFLOW at its head in the fine block and a RATING at its foot
 * in the coarse one, runs at Manning's normal depth in both blocks, with
 * what comes in going out.
 */
async function joinedGrid(wasm, nxF, nzF, nzC, dx, dt) {
  const f = await loadFlood(wasm);
  f.init(nxF, nzF, 0, 0, dx, dt);
  const coarse = f.addBlock(nxF / 2, nzC, 0, nzF * dx, 2 * dx);
  f.join(0, coarse);
  /* Each cell's centre, block after block. */
  const centres = [];
  for (let j = 0; j < nzF; j += 1) for (let i = 0; i < nxF; i += 1) centres.push([(i + 0.5) * dx, (j + 0.5) * dx]);
  for (let j = 0; j < nzC; j += 1) for (let i = 0; i < nxF / 2; i += 1) centres.push([(i + 0.5) * 2 * dx, nzF * dx + (j + 0.5) * 2 * dx]);
  return { f, coarse, centres, nF: nxF * nzF };
}

export async function joinRest(wasm) {
  const { f, centres } = await joinedGrid(wasm, 64, 32, 24, 2, 0.05);
  const b = f.bed(); const h = f.h();
  const LEVEL = 10;
  centres.forEach(([x, z], k) => {
    const i = Math.floor(x / 2); const j = Math.floor(z / 2);
    b[k] = bump(i, j, 1) % (1 / 13) < 1 / 160 ? 12 : 2 + 6 * bump(i, j, 2);
    h[k] = Math.max(0, LEVEL - b[k]);
  });
  f.setManning(0, 0.03);
  const v0 = f.volume();
  f.step(12000);
  let speed = 0; let level = 0;
  const hu = f.hu(); const hv = f.hv(); const hh = f.h();
  for (let k = 0; k < centres.length; k += 1) {
    if (b[k] >= LEVEL) continue;
    speed = Math.max(speed, Math.sqrt(hu[k] * hu[k] + hv[k] * hv[k]) / hh[k]);
    level = Math.max(level, Math.abs(hh[k] + b[k] - LEVEL));
  }
  const dv = Math.abs(f.volume() - v0) / v0;
  return result('join at rest', [
    c('across a join of 2 m and 4 m cells, still water over a random bed stays still for 10 min: under 1e-9 m/s', speed < 1e-9, `${speed.toExponential(2)} m/s`),
    c('and its level within a nanometre, its volume to 1e-12', level < 1e-9 && dv < 1e-12, `${level.toExponential(2)} m, ${dv.toExponential(2)}`),
  ], { speed, level, dv }, f);
}

export async function joinMass(wasm) {
  const { f, centres, nF } = await joinedGrid(wasm, 32, 60, 60, 2, 0.02);
  const b = f.bed(); const h = f.h();
  centres.forEach(([x, z], k) => {
    b[k] = 2 * bump(Math.floor(x), Math.floor(z), 3) - z / 200;
    h[k] = z < 40 ? Math.max(0, 8 - b[k]) : 0;
  });
  f.setManning(0, 0.03);
  const v0 = f.volume();
  f.step(6000);
  const dv = Math.abs(f.volume() - v0) / v0;
  let below = 0;
  for (let k = nF; k < centres.length; k += 1) below += f.h()[k] * 16;
  return result('join mass', [
    c('a dam break in the fine block runs into the coarse one, and the volume is what it was to 1e-12', dv < 1e-12, `${dv.toExponential(2)}`),
    c('water crossed the join', below > 0.1 * v0, `${((100 * below) / v0).toFixed(0)} % of it now in the coarse block`),
  ], { dv, below }, f);
}

export async function joinNormal(wasm) {
  const S = 1e-3; const N = 0.03; const Q = 4; const dx = 2;
  const nx = 8; const nzF = 200; const nzC = 100;
  const { f, coarse, centres } = await joinedGrid(wasm, nx, nzF, nzC, dx, 0.05);
  const b = f.bed(); const h = f.h();
  const L = nzF * dx + nzC * 2 * dx;
  centres.forEach(([, z], k) => {
    b[k] = S * (L - z);
    h[k] = 2;
  });
  f.setManning(0, N);
  const inlet = f.bound(SIDE.north, 0, nx - 1, BOUND.inflow, Q * nx * dx);
  const outlet = f.boundIn(coarse, SIDE.south, 0, nx / 2 - 1, BOUND.rating, S);
  f.step(60000);
  const want = ((N * Q) / Math.sqrt(S)) ** 0.6;
  const fine = f.h()[(nzF / 2) * nx + 3];
  const coarseDepth = f.h()[nx * nzF + (nzC / 2) * (nx / 2) + 1];
  const inn = f.boundRate(inlet); const out = -f.boundRate(outlet);
  return result('join normal depth', [
    c(`a channel down through the join runs at Manning's normal depth ${want.toFixed(4)} m in the fine block and in the coarse one, to 1 %`,
      Math.abs(fine - want) < 0.01 * want && Math.abs(coarseDepth - want) < 0.01 * want, `fine ${fine.toFixed(4)} m, coarse ${coarseDepth.toFixed(4)} m`),
    c('steady: the coarse block lets out what the fine one takes in, to 0.1 %', Math.abs(inn - out) < 1e-3 * inn, `in ${inn.toFixed(3)}, out ${out.toFixed(3)} m3/s`),
  ], { fine, coarseDepth, want }, f);
}

/*
 * THE CLOCK: one flood, five clients. A basin held at 10 m behind a wall
 * with an opening link through it that each opening widens (2 m, then
 * 6, then 12, the last torn 40 ms after the second). Every client steps
 * it on the room's clock through src/sim/water/host.js: one hears each
 * opening as it happens, one hears each 3 s late (past the delay, so it
 * rewinds), one joins after the last and hears them all at once, one
 * hears them in reverse order, and one is slow, a few steps a call. At
 * the same room time all five must hold the same water to the bit.
 */
export async function hostClock(wasm) {
  const nx = 60; const nz = 16; const dx = 2; const dtMs = 20; const WALL = 20;
  const OPENINGS = [
    { id: 'w', at: 4000, width: 2 },
    { id: 'w', at: 9000, width: 6 },
    { id: 'v', at: 9040, width: 12 },
  ];
  const END = 16000;
  const client = async () => {
    const f = await solver(wasm, nx, nz, dx, dtMs / 1000);
    const b = f.bed(); const h = f.h();
    for (let j = 0; j < nz; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const k = j * nx + i;
        const wall = i === WALL || i === WALL + 1;
        b[k] = wall ? 30 : 0;
        h[k] = wall ? 0 : i < WALL ? 10 : 1;
      }
    }
    f.setManning(0, 0.03);
    const up = []; const down = [];
    for (let j = 2; j < nz - 2; j += 1) {
      up.push(j * nx + WALL - 1);
      down.push(j * nx + WALL + 2);
    }
    const link = f.link(LINK.opening, up, down);
    f.linkDir(link, 1, 0);
    let width = 0;
    const flood = {
      f,
      apply(o) {
        width = Math.max(width, o.width);
        f.linkBands(link, [[2, 9, width, 0.61]]);
      },
      reset() {
        width = 0;
        f.linkBands(link, []);
      },
    };
    flood.reset();
    /* A checkpoint every 6 s, so one falls between the openings and a
     * clip in this 12 s war. */
    return { f, host: createFloodHost(flood, { dtMs, checkSteps: 300 }) };
  };
  const tick = 100;
  const live = await client();
  const late = await client();
  const joiner = await client();
  const reverse = await client();
  const slow = await client();
  for (let now = 0; now <= END; now += tick) {
    for (const o of OPENINGS) {
      if (o.at <= now && o.at > now - tick) live.host.open(o);
      if (o.at + 3000 <= now && o.at + 3000 > now - tick) late.host.open(o);
      if (o.at <= now && o.at > now - tick) slow.host.open(o);
    }
    live.host.advance(now);
    late.host.advance(now);
    slow.host.advance(now, { maxSteps: 3 });
  }
  for (const o of OPENINGS) joiner.host.open(o);
  joiner.host.advance(END);
  for (const o of OPENINGS.slice().reverse()) reverse.host.open(o);
  reverse.host.advance(END);
  while (slow.host.behind(END) > 0) slow.host.advance(END, { maxSteps: 3 });
  /* A replay: the clock back 5 s (inside the snapshots) and 12 s (past
   * them), each against a client stepped straight there, and forward to
   * the end again. */
  const replay = await client();
  for (const o of OPENINGS) replay.host.open(o);
  replay.host.advance(END);
  const back = [];
  for (const ago of [5000, 12000]) {
    replay.host.advance(END - ago);
    const fresh = await client();
    for (const o of OPENINGS) fresh.host.open(o);
    fresh.host.advance(END - ago);
    back.push({
      ago, same: replay.f.hash() === fresh.f.hash() && replay.host.step() === fresh.host.step(), step: replay.host.step(),
    });
  }
  replay.host.advance(END);
  /* A replay's own flood (water/live.js fork): started from the live
   * client's checkpoint before a clip that starts at CLIP ms, against a
   * client stepped from the origin to the clip's start; then on to the
   * end. One that heard other openings before the checkpoint is
   * refused it. */
  const CLIP = 12000;
  const cp = live.host.checkpoint(CLIP);
  const fork = await client();
  for (const o of OPENINGS) fork.host.open(o);
  const resumed = fork.host.resume(cp);
  fork.host.advance(CLIP);
  const atClip = await client();
  for (const o of OPENINGS) atClip.host.open(o);
  atClip.host.advance(CLIP);
  const forkAtClip = { hash: fork.f.hash(), step: fork.host.step() };
  fork.host.advance(END);
  const other = await client();
  other.host.open(OPENINGS[0]);
  other.host.open({ ...OPENINGS[1], id: 'x' });
  other.host.open(OPENINGS[2]);
  const refused = !other.host.resume(cp);
  /* The control: the later openings applied where a client heard them,
   * 3 s after the first, must not be the same water. (All of them 3 s
   * late is the same water 3 s later: the origin moves with them.) */
  const wrong = await client();
  OPENINGS.forEach((o, k) => wrong.host.open(k ? { ...o, at: o.at + 3000 } : o));
  wrong.host.advance(END);
  const clients = {
    live, late, joiner, reverse, slow,
  };
  const hash = Object.fromEntries(Object.entries(clients).map(([k, v]) => [k, v.f.hash()]));
  const steps = Object.fromEntries(Object.entries(clients).map(([k, v]) => [k, v.host.step()]));
  const same = Object.values(hash).every((x) => x === hash.live) && Object.values(steps).every((x) => x === steps.live);
  const through = live.f.linkVol(0);
  return result('the room clock', [
    c('five clients that heard the same openings at different times hold the same water at the same room time, to the bit', same,
      Object.entries(hash).map(([k, v]) => `${k} ${v} @${steps[k]}`).join(', ')),
    c('the late client rewound and the reverse client started again, and still agree', late.host.stats.rewinds > 0 && reverse.host.stats.restarts > 0,
      `late ${late.host.stats.rewinds} rewinds, reverse ${reverse.host.stats.restarts} restarts`),
    c('water went through the openings', through > 100, `${through.toFixed(0)} m3`),
    c('a replay\'s clock back 5 s and 12 s holds the water of then, and forward again the water of now', back.every((x) => x.same) && replay.f.hash() === hash.live && replay.host.step() === steps.live,
      `${back.map((x) => `${x.ago / 1000} s back: step ${x.step} ${x.same ? 'same' : 'DIFFERENT'}`).join(', ')}; ${replay.host.stats.rewinds} rewinds, ${replay.host.stats.restarts} restarts`),
    c('and the control, the openings applied 3 s late, is other water', wrong.f.hash() !== hash.live, wrong.f.hash()),
    c('a replay\'s flood started at the live checkpoint before its clip is the live water at the clip\'s start and at the end, to the bit', resumed && cp && cp.step > 0
      && forkAtClip.hash === atClip.f.hash() && forkAtClip.step === atClip.host.step() && fork.f.hash() === hash.live && fork.host.step() === steps.live,
    `checkpoint step ${cp ? cp.step : 'none'}, ${fork.host.step() - (cp ? cp.step : 0)} steps from it; at the clip ${forkAtClip.hash} / ${atClip.f.hash()} @${forkAtClip.step}; at the end ${fork.f.hash()}`),
    c('and one that heard other openings before the checkpoint is refused it', refused),
  ], { hash, steps }, live.f);
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
  ['normal depth', normalDepth],
  ['crest', crest],
  ['opening, weir', (w) => opening(w, 'weir')],
  ['opening, orifice', (w) => opening(w, 'orifice')],
  ['opening, drowned', (w) => opening(w, 'drowned')],
  ['join at rest', joinRest],
  ['join mass', joinMass],
  ['join normal depth', joinNormal],
  ['the room clock', hostClock],
];
