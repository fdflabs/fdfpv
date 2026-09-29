/*
 * streamer.js: fifty metres of toilet paper towed behind an aircraft, the
 * combat mode's streamer (docs/COMBAT-PLAN.md section 2). Pure: no Three.js,
 * no DOM, so the Node selftest (scripts/streamer-selftest.js) runs the
 * very code the browser does.
 *
 * THE MODEL. The paper is a chain of nodes SEG_M apart, the first one
 * pinned to the tow point on the aircraft's tail. Each 1 ms step:
 *
 *   1. Every free node feels gravity and the air. The air is split along
 *      the paper and across it (the drag of a ribbon in line with the flow
 *      is a small fraction of its drag broadside), and applied implicitly,
 *      v / (1 + dt k / m), so a light node in a fast flow slows towards the
 *      air and never overshoots it, at any speed.
 *   2. Every node moves by its velocity.
 *   3. The segments are put back toward their length, all at once, as
 *      springs of the paper's own stiffness (XPBD): the constraint
 *      equations of a chain are tridiagonal, so one direct solve (the
 *      Thomas algorithm) per iteration handles all fifty links, where a
 *      Gauss-Seidel sweep would need hundreds to stop a fifty link chain
 *      stretching (Goldenthal et al., "Efficient simulation of inextensible
 *      cloth", 2007, the fast projection). A segment only pulls: paper
 *      cannot push, so a segment shorter than its length is slack and left
 *      out of the solve.
 *   4. The velocity is what the positions did.
 *
 * The solve's multipliers are the tensions, in newtons, for free: lambda
 * over dt squared. The paper tears by the owner's rule, not its strength:
 * only once the tow point has gone faster than 120 km/h for 0.3 s, at the
 * link pulling hardest (TEAR_SPEED_MPS below); the part behind comes off
 * and falls, as a cut does.
 *
 * DETERMINISM (CLAUDE.md). Fixed 1 ms steps, one per plant step, driven by
 * the shell's own accumulator and fed the plant's pose of that step, so a
 * frame's length changes nothing. Only add, multiply, divide, sqrt and
 * abs, which IEEE 754 fixes to the bit in every engine: no Math.sin, cos
 * or pow anywhere here. The flutter and the twist a viewer sees are drawn
 * by the renderer, off the physics path.
 *
 * WHAT IT DOES NOT TOUCH. The aircraft: the plant never learns there is a
 * streamer (section 2.4 says why), so a flight with one is the flight
 * without it, bit for bit.
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

import { STREAMER_PIECES, STREAMER_SEG_M, STREAMER_SEGS } from '../share/roomwire.js';

/* The owner's numbers: fifty metres, of toilet paper. */
export const LENGTH_M = 50;
export const SEG_M = STREAMER_SEG_M;
export const SEGS = LENGTH_M / SEG_M;
export const STEP_S = 0.001;
export const G = 9.81;
/* ISA sea level. */
export const RHO = 1.225;

/* The paper, two ply bath tissue (docs/COMBAT-PLAN.md section 2.1 gives
 * each source): a 4 inch roll, 38 g/m2, 131 N/m dry tensile. */
export const WIDTH_M = 0.1016;
export const AREAL_KG_M2 = 0.038;
export const TENSILE_N_PER_M = 131;
/* What real paper this wide breaks at; the game's rule below replaces it
 * (docs/COMBAT-PLAN.md section 2.5), and it is kept for the comparison. */
export const TEAR_N = TENSILE_N_PER_M * WIDTH_M;
/*
 * Drag, each on the paper's plan area (one side, Carruthers and
 * Filippone's reference). Along the paper, turbulent skin friction on both
 * sides; on the free end's last TAIL_M, the flutter of a streamer of
 * aspect ratio 30 as Carruthers and Filippone measured it instead; across
 * the paper, a flat plate broadside (Hoerner).
 */
export const CD_FRICTION = 0.0042;
export const TAIL_M = 30 * WIDTH_M;
export const CD_FLUTTER = 0.0755;
/*
 * THE TEAR RULE (the owner, 2026-09-28: "the paper only gets dropped over
 * 120 km/h"). A game rule, not a strength: the paper tears when the tow
 * point has gone faster than TEAR_SPEED_MPS for TEAR_HOLD_S together (a
 * brief spike through it is not flight at that speed), and then at the
 * link pulling hardest, the tow point's. Below it the paper never tears,
 * whatever its length or tension; the tension still shows on the HUD and
 * still shapes the paper.
 */
export const TEAR_SPEED_MPS = 120 / 3.6;
export const TEAR_HOLD_S = 0.3;
/* The hardest steady pull the rule allows: a full hundred metres (the cap)
 * towed level at TEAR_SPEED_MPS, drag and weight together. */
const CAP_M = 100;
const CAP_DRAG_N = 0.5 * RHO * WIDTH_M * (CD_FRICTION * CAP_M + (CD_FLUTTER - CD_FRICTION) * TAIL_M) * TEAR_SPEED_MPS * TEAR_SPEED_MPS;
const CAP_WEIGHT_N = AREAL_KG_M2 * WIDTH_M * CAP_M * G;
export const MAX_PULL_N = Math.sqrt(CAP_DRAG_N * CAP_DRAG_N + CAP_WEIGHT_N * CAP_WEIGHT_N);
/* Creped tissue stretches: the finished toilet paper Vieira et al.
 * measured broke at 19.9 percent along the machine direction. The paper
 * here stretches that far at MAX_PULL_N, the most the rule lets it be
 * pulled, and linearly below it, so no paper ever stretches further than
 * paper does. COMPLIANCE is the inverse of that spring, a metre long. */
export const STRETCH_AT_TEAR = 0.199;
export const COMPLIANCE = (STRETCH_AT_TEAR * SEG_M) / MAX_PULL_N;
export const CD_ACROSS = 1.17;
/* Paper on the ground: sliding friction. */
export const GROUND_MU = 0.5;

/* Each node's ground height is asked for once every this many steps and
 * held between: in 10 ms paper at 30 m/s crosses 30 cm of ground, over
 * which a terrain's height changes by centimetres. */
const GROUND_EVERY = 10;
const ITERATIONS = 2;
/* A piece is dropped this long after it came to rest, or this long after
 * it came off at all. */
const REST_KEEP_S = 20;
const PIECE_MAX_S = 90;
const REST_SPEED = 0.05;

/* A chain of n nodes: x, v (3 n), inverse masses w (n), tension of each
 * segment (n - 1). pinned: node 0 is the tow point, moved by the caller. */
function chain(n, pinned, id) {
  return {
    id,
    n,
    pinned,
    x: new Float64Array(n * 3),
    v: new Float64Array(n * 3),
    x0: new Float64Array(n * 3),
    w: new Float64Array(n),
    ground: new Float64Array(n).fill(-Infinity),
    tension: new Float64Array(Math.max(0, n - 1)),
    lambda: new Float64Array(Math.max(0, n - 1)),
    /* Each link's colour, the seat whose paper it was (captured paper keeps
     * its colour). Drawing only: the physics never reads it. */
    col: new Uint8Array(Math.max(0, n - 1)),
    age: 0,
    still: 0,
  };
}

/* Each node carries half of each segment it ends: the ends half as much. */
function massesFor(c) {
  const segMass = AREAL_KG_M2 * WIDTH_M * SEG_M;
  for (let i = 0; i < c.n; i += 1) {
    const share = (i > 0 ? 0.5 : 0) + (i < c.n - 1 ? 0.5 : 0);
    c.w[i] = share > 0 ? 1 / (segMass * share) : 0;
  }
  if (c.pinned) {
    c.w[0] = 0;
  }
}

/* A chain from nodes [from, to] of c, velocities and all. */
function slice(c, from, to, pinned, id) {
  const out = chain(to - from + 1, pinned, id);
  out.x.set(c.x.subarray(from * 3, (to + 1) * 3));
  out.v.set(c.v.subarray(from * 3, (to + 1) * 3));
  out.ground.set(c.ground.subarray(from, to + 1));
  out.col.set(c.col.subarray(from, to));
  massesFor(out);
  return out;
}

/* Scratch for the solve, big enough for the longest chain. */
const MAXN = STREAMER_SEGS + 1;
const NX = new Float64Array(MAXN * 3);
const DIAG = new Float64Array(MAXN);
const RHS = new Float64Array(MAXN);
const CP = new Float64Array(MAXN);
const UP = new Float64Array(MAXN);
const DL = new Float64Array(MAXN);
const CC = new Float64Array(MAXN);
const ACT = new Uint8Array(MAXN);

/* Gravity and air on every free node, implicitly. */
function forces(c, dt) {
  const x = c.x;
  const v = c.v;
  const n = c.n;
  const half = 0.5 * RHO * WIDTH_M * SEG_M;
  for (let i = 0; i < n; i += 1) {
    const w = c.w[i];
    if (w === 0) {
      continue;
    }
    const o = i * 3;
    v[o + 1] -= G * dt;
    /* The paper's direction here: from the node before to the node after. */
    const a = i > 0 ? i - 1 : i;
    const b = i < n - 1 ? i + 1 : i;
    let tx = x[b * 3] - x[a * 3];
    let ty = x[b * 3 + 1] - x[a * 3 + 1];
    let tz = x[b * 3 + 2] - x[a * 3 + 2];
    const tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (tl > 1e-9) {
      tx /= tl;
      ty /= tl;
      tz /= tl;
    }
    const vx = v[o];
    const vy = v[o + 1];
    const vz = v[o + 2];
    const along = vx * tx + vy * ty + vz * tz;
    const ax = along * tx;
    const ay = along * ty;
    const az = along * tz;
    const nx = vx - ax;
    const ny = vy - ay;
    const nz = vz - az;
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
    /* The node's share of the paper: half a segment at each end. */
    const share = (i > 0 ? 0.5 : 0) + (i < n - 1 ? 0.5 : 0);
    const m = 1 / w;
    /* The free end flutters: its last TAIL_M carries the flutter drag, by
     * how much of the node's own share of paper lies in it. A piece's free
     * end is its last node too (its first is where it parted). */
    const len = (n - 1) * SEG_M;
    const lo = Math.max(0, (i - 0.5) * SEG_M);
    const hi = Math.min(len, (i + 0.5) * SEG_M);
    const inTail = Math.max(0, hi - Math.max(lo, len - TAIL_M));
    const cdArea = share * SEG_M * CD_FRICTION + inTail * (CD_FLUTTER - CD_FRICTION);
    const kAlong = (0.5 * RHO * WIDTH_M * cdArea * Math.abs(along) * dt) / m;
    const kAcross = (half * share * CD_ACROSS * nl * dt) / m;
    const fa = 1 / (1 + kAlong);
    const fn = 1 / (1 + kAcross);
    v[o] = ax * fa + nx * fn;
    v[o + 1] = ay * fa + ny * fn;
    v[o + 2] = az * fa + nz * fn;
  }
}

/* The tridiagonal solve (J W J^T + a) dl = -C - a lambda over the rows
 * ACT marks, into DL (unmarked rows 0). NX and CC hold each row's unit
 * direction and stretch; a is the paper's compliance over dt squared. */
function solveRows(c, m, a) {
  const w = c.w;
  for (let i = 0; i < m; i += 1) {
    if (ACT[i]) {
      DIAG[i] = w[i] + w[i + 1] + a;
      RHS[i] = -CC[i] - a * c.lambda[i];
    } else {
      DIAG[i] = 1;
      RHS[i] = 0;
    }
  }
  /* Off diagonal (i, i + 1): -w_{i+1} n_i . n_{i+1}, both rows active. */
  for (let i = 0; i < m - 1; i += 1) {
    const p = i * 3;
    CP[i] = ACT[i] && ACT[i + 1] ? -w[i + 1] * (NX[p] * NX[p + 3] + NX[p + 1] * NX[p + 4] + NX[p + 2] * NX[p + 5]) : 0;
  }
  /* Thomas: a forward sweep (the modified upper diagonal in UP, the
   * modified right side in DL), then back substitution. */
  let prevUpper = 0;
  let prevRhs = 0;
  for (let i = 0; i < m; i += 1) {
    const lower = i > 0 ? CP[i - 1] : 0;
    const den = DIAG[i] - lower * prevUpper;
    const upper = i < m - 1 ? CP[i] / den : 0;
    const r = (RHS[i] - lower * prevRhs) / den;
    UP[i] = upper;
    DL[i] = r;
    prevUpper = upper;
    prevRhs = r;
  }
  for (let i = m - 2; i >= 0; i -= 1) {
    DL[i] -= UP[i] * DL[i + 1];
  }
}

/*
 * The paper's segments as springs of the paper's own stiffness, solved
 * implicitly (XPBD: Macklin, Mueller and Chentanez, "XPBD: Position Based
 * Simulation of Compliant Constrained Dynamics", 2016), every segment of
 * the chain at once: C_i = |d_i| - L, (J W J^T + a) dl = -C - a lambda,
 * x += W J^T dl. A rigid link would make a slack streamer snapping taut
 * deliver its whole jerk in one millisecond, so the tension it reported
 * would be set by the step, not by the paper; the paper's own stretch
 * spreads it over the tens of milliseconds a real one takes. Paper only
 * pulls, so a segment that would have to push (dl > 0) is left slack and
 * the rest solved again without it: one round of an active set method.
 * Tension accumulates in lambda (negative is a pull).
 */
function project(c) {
  const x = c.x;
  const m = c.n - 1;
  if (m < 1) {
    return;
  }
  c.lambda.fill(0);
  const L = SEG_M;
  const a = COMPLIANCE / (STEP_S * STEP_S);
  for (let it = 0; it < ITERATIONS; it += 1) {
    for (let i = 0; i < m; i += 1) {
      const p = i * 3;
      const dx = x[p + 3] - x[p];
      const dy = x[p + 4] - x[p + 1];
      const dz = x[p + 5] - x[p + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      CC[i] = d - L;
      const inv = d > 1e-12 ? 1 / d : 0;
      NX[p] = dx * inv;
      NX[p + 1] = dy * inv;
      NX[p + 2] = dz * inv;
      ACT[i] = 1;
    }
    solveRows(c, m, a);
    let pushed = false;
    for (let i = 0; i < m; i += 1) {
      if (DL[i] + c.lambda[i] > 0) {
        ACT[i] = 0;
        pushed = true;
      }
    }
    if (pushed) {
      solveRows(c, m, a);
    }
    const w = c.w;
    for (let i = 0; i < m; i += 1) {
      const d = DL[i];
      if (d === 0) {
        continue;
      }
      const p = i * 3;
      const wa = w[i];
      const wb = w[i + 1];
      x[p] -= wa * NX[p] * d;
      x[p + 1] -= wa * NX[p + 1] * d;
      x[p + 2] -= wa * NX[p + 2] * d;
      x[p + 3] += wb * NX[p] * d;
      x[p + 4] += wb * NX[p + 1] * d;
      x[p + 5] += wb * NX[p + 2] * d;
      c.lambda[i] += d;
    }
  }
  const dt2 = STEP_S * STEP_S;
  for (let i = 0; i < m; i += 1) {
    c.tension[i] = c.lambda[i] < 0 ? -c.lambda[i] / dt2 : 0;
  }
}

/* The ground under every node, refreshed every GROUND_EVERY steps, and
 * paper that went under it put back on it, sliding. */
function groundContact(c, groundAt, refresh, dt) {
  const x = c.x;
  const v = c.v;
  let resting = true;
  for (let i = 0; i < c.n; i += 1) {
    const o = i * 3;
    if (refresh && groundAt) {
      c.ground[i] = groundAt(x[o], x[o + 2]);
    }
    const h = c.ground[i];
    if (c.w[i] === 0) {
      continue;
    }
    if (x[o + 1] < h) {
      x[o + 1] = h;
      if (v[o + 1] < 0) {
        v[o + 1] = 0;
      }
      const sx = v[o];
      const sz = v[o + 2];
      const s = Math.sqrt(sx * sx + sz * sz);
      const slow = GROUND_MU * G * dt;
      const k = s > slow ? (s - slow) / s : 0;
      v[o] = sx * k;
      v[o + 2] = sz * k;
    }
    if (x[o + 1] > h + 0.01 || v[o] * v[o] + v[o + 1] * v[o + 1] + v[o + 2] * v[o + 2] > REST_SPEED * REST_SPEED) {
      resting = false;
    }
  }
  return resting;
}

function stepChain(c, groundAt, refresh) {
  const dt = STEP_S;
  forces(c, dt);
  c.x0.set(c.x);
  const x = c.x;
  const v = c.v;
  for (let i = 0; i < c.n; i += 1) {
    if (c.w[i] === 0) {
      continue;
    }
    const o = i * 3;
    x[o] += v[o] * dt;
    x[o + 1] += v[o + 1] * dt;
    x[o + 2] += v[o + 2] * dt;
  }
  project(c);
  for (let i = 0; i < c.n * 3; i += 1) {
    v[i] = (x[i] - c.x0[i]) / dt;
  }
  return groundContact(c, groundAt, refresh, dt);
}

export class Streamer {
  /* length: metres of paper, a whole number of segments. */
  constructor(length = LENGTH_M) {
    this.segs = Math.max(0, Math.min(STREAMER_SEGS, Math.floor(length / SEG_M)));
    this.attached = null;
    this.pieces = [];
    this.nextId = 1;
    this.steps = 0;
    /* The tow point's speed the last step, m/s, and how long it has been
     * over TEAR_SPEED_MPS, s. */
    this.speed = 0;
    this.over = 0;
    /* What came off, for the owner's shell to report: { kind, segs, step }. */
    this.news = [];
  }

  /*
   * The paper laid out straight from the tow point (ax, ay, az) along the
   * unit direction (dx, dy, dz), moving with the aircraft's velocity v
   * ([vx, vy, vz], at rest by default: a paper at rest behind an aircraft
   * already flying would snatch and tear at once), keeping its current
   * length (a respawn), or `segs` when given (a new round).
   */
  lay(ax, ay, az, dx, dy, dz, segs = this.segs, groundAt = null, v = null) {
    this.segs = Math.max(0, Math.min(STREAMER_SEGS, segs));
    this.attached = this.segs > 0 ? chain(this.segs + 1, true, 0) : null;
    this.pieces = [];
    this.over = 0;
    if (!this.attached) {
      return;
    }
    const c = this.attached;
    for (let i = 0; i <= this.segs; i += 1) {
      const o = i * 3;
      c.x[o] = ax + dx * SEG_M * i;
      c.x[o + 1] = ay + dy * SEG_M * i;
      c.x[o + 2] = az + dz * SEG_M * i;
      if (v) {
        c.v[o] = v[0];
        c.v[o + 1] = v[1];
        c.v[o + 2] = v[2];
      }
      if (groundAt) {
        c.ground[i] = groundAt(c.x[o], c.x[o + 2]);
        if (c.x[o + 1] < c.ground[i]) {
          c.x[o + 1] = c.ground[i];
        }
      }
    }
    massesFor(c);
  }

  /*
   * Captured paper (docs/COMBAT-PLAN.md section 5.5): the streamer grows
   * to `segs` links at its far end, each new link laid on along the last
   * one's direction (straight down from a lone tow point) and moving with
   * the far end, so it trails on as paper that was always there.
   */
  extendTo(segs) {
    const c = this.attached;
    const want = Math.min(STREAMER_SEGS, segs);
    if (!c || want <= c.n - 1) {
      return;
    }
    const out = chain(want + 1, true, 0);
    out.x.set(c.x);
    out.v.set(c.v);
    out.ground.set(c.ground);
    out.col.set(c.col);
    const e = (c.n - 1) * 3;
    let dx = 0;
    let dy = -1;
    let dz = 0;
    if (c.n > 1) {
      dx = c.x[e] - c.x[e - 3];
      dy = c.x[e + 1] - c.x[e - 2];
      dz = c.x[e + 2] - c.x[e - 1];
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (l > 1e-9) {
        dx /= l;
        dy /= l;
        dz /= l;
      } else {
        dx = 0;
        dy = -1;
        dz = 0;
      }
    }
    for (let i = c.n; i <= want; i += 1) {
      const o = i * 3;
      const k = (i - (c.n - 1)) * SEG_M;
      out.x[o] = c.x[e] + dx * k;
      out.x[o + 1] = c.x[e + 1] + dy * k;
      out.x[o + 2] = c.x[e + 2] + dz * k;
      out.v[o] = c.v[e];
      out.v[o + 1] = c.v[e + 1];
      out.v[o + 2] = c.v[e + 2];
      out.ground[i] = c.ground[c.n - 1];
    }
    massesFor(out);
    this.attached = out;
    this.segs = want;
  }

  /* Each link's colour seat, tow point first (a Uint8Array or array). */
  setColours(cols) {
    const c = this.attached;
    if (c) {
      for (let i = 0; i < c.col.length; i += 1) {
        c.col[i] = cols[Math.min(i, cols.length - 1)] || 0;
      }
    }
  }

  /* Metres still on the aircraft. */
  length() {
    return this.attached ? (this.attached.n - 1) * SEG_M : 0;
  }

  /* The tension at the tow point, newtons: what the paper pulls the
   * aircraft with. Reported, never applied (section 2.4). */
  towTension() {
    return this.attached && this.attached.n > 1 ? this.attached.tension[0] : 0;
  }

  /*
   * One 1 ms step, the tow point at (ax, ay, az) scene world metres at the
   * end of it. groundAt(x, z) is the ground's height there, or null for no
   * ground.
   */
  step(ax, ay, az, groundAt = null) {
    const refresh = this.steps % GROUND_EVERY === 0;
    this.steps += 1;
    const c = this.attached;
    if (c) {
      const dx = ax - c.x[0];
      const dy = ay - c.x[1];
      const dz = az - c.x[2];
      this.speed = Math.sqrt(dx * dx + dy * dy + dz * dz) / STEP_S;
      c.x[0] = ax;
      c.x[1] = ay;
      c.x[2] = az;
      stepChain(c, groundAt, refresh);
      this.over = this.speed > TEAR_SPEED_MPS ? this.over + STEP_S : 0;
      if (this.over >= TEAR_HOLD_S && c.n > 1) {
        let worst = 0;
        for (let i = 1; i < c.n - 1; i += 1) {
          if (c.tension[i] > c.tension[worst]) {
            worst = i;
          }
        }
        const speed = this.speed;
        this.split(worst, 'tear');
        this.news[this.news.length - 1].speed = speed;
        this.over = 0;
      }
    }
    for (const p of this.pieces) {
      p.age += STEP_S;
      p.still = stepChain(p, groundAt, refresh) ? p.still + STEP_S : 0;
    }
    if (this.pieces.length) {
      this.pieces = this.pieces.filter((p) => p.still < REST_KEEP_S && p.age < PIECE_MAX_S);
    }
  }

  /* The streamer parts in segment k (between nodes k and k + 1): nodes 0
   * to k stay on, and k onwards, the parting node shared, falls. */
  split(k, kind) {
    const c = this.attached;
    if (!c || k < 0 || k >= c.n - 1) {
      return null;
    }
    const piece = slice(c, k, c.n - 1, false, this.nextId);
    this.nextId = this.nextId >= 255 ? 1 : this.nextId + 1;
    this.pieces.push(piece);
    while (this.pieces.length > STREAMER_PIECES) {
      this.pieces.shift();
    }
    this.attached = k > 0 ? slice(c, 0, k, true, 0) : null;
    this.segs = k;
    this.news.push({ kind, segs: k, step: this.steps });
    return piece.id;
  }

  /* The referee's cut: at most `segs` segments stay on. Nothing when the
   * streamer is already that short (another cut or a tear got there). */
  cutTo(segs) {
    const c = this.attached;
    if (!c || segs >= c.n - 1) {
      return null;
    }
    return this.split(Math.max(0, segs), 'cut');
  }

  /* Every chain as the wire takes them: [{ id, n, x }], the streamer first. */
  chains() {
    const out = [];
    if (this.attached) {
      out.push(this.attached);
    }
    out.push(...this.pieces);
    return out;
  }
}

/* A hash of every chain's positions and velocities, bit exact (FNV-1a
 * over their bytes): what the selftest and the browser check compare. */
export function streamerTrace(s) {
  let h = 0x811c9dc5;
  for (const c of s.chains()) {
    for (const arr of [c.x, c.v]) {
      const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
      for (let i = 0; i < bytes.length; i += 1) {
        h ^= bytes[i];
        h = Math.imul(h, 0x01000193) >>> 0;
      }
    }
  }
  return h.toString(16).padStart(8, '0');
}
