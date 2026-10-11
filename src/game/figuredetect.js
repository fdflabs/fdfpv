/*
 * figuredetect.js: names the aerobatic figures a fixed wing flies and
 * grades them as a judge would (docs/TRICKS-CATALOG.md).
 *
 * Three layers. Every 10 ms of physics the flight state becomes one
 * sample with a token: what the aircraft is doing right then (rolling,
 * curving its path, hanging, spinning, sliding back on its tail...).
 * Runs of one token are primitives, each carrying the measures a judge
 * looks at (rotation about each axis, the path swept and its radius, the
 * line's angle, height in and out). The figure table names the longest
 * run of primitives it can, once the aircraft has flown straight for a
 * moment or the buffer is full, and grades it.
 *
 * Deterministic: the same state stream always gives the same figures,
 * because everything is decided on physics steps, never on frames, and
 * the arithmetic is +, -, *, / and sqrt only (IEEE exact in every engine,
 * CLAUDE.md). Angles are compared as cosines against the literal table
 * below, never through Math.acos.
 *
 * The plant's frame (src/render/frame.js): z up, x forward, y left; the
 * state array is [t, x, y, z, vx, vy, vz, qw, qx, qy, qz, p, q, r, ...]
 * with the quaternion body to world and the rates in the body frame.
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

import { figureTrickName } from './figures.js';

const TURN = 6.283185307179586;

/* cos(k x 7.5 deg), k = 0..12. A judge takes 1 point per 15 deg off
 * (F3A Annex 5B), so half a point per 7.5 deg band. */
const COS_BAND = [
  1, 0.9914448613738104, 0.9659258262890683, 0.9238795325112867, 0.8660254037844387,
  0.7933533402912352, 0.7071067811865476, 0.6087614290087207, 0.5, 0.38268343236508984,
  0.25881904510252074, 0.1305261922200517, 0,
];
/* 7.5 deg in radians, for angles the detector already holds as turns. */
const BAND_RAD = 0.1308996938995747;

const COS15 = COS_BAND[2];
const COS25 = 0.9063077870366499;
const COS30 = COS_BAND[4];
const COS45 = COS_BAND[6];
const SIN15 = COS_BAND[10];

/* Physics steps per sample: 10 ms at 1000 Hz. */
export const SAMPLE_MS = 10;
/* A new token must hold this many samples before it opens a primitive. */
const HOLD = 4;
/* A roll may pause this long and still be one roll (point rolls). */
const ROLL_BRIDGE_MS = 800;
const PAUSE_MIN_MS = 100;
/* A point is the roll stopped, not slowed: a barrel roll's rate sags as
 * the pilot pulls through the bottom without stopping (figures-plant-sweep.js). */
const ROLL_STOP = 0.35;
/* Straight flight this long ends a figure. */
const SETTLE_MS = 700;
const BUFFER_MAX = 10;
const LINE_PART_MAX_MS = 3000;
/* Lines shorter than this between two parts are a connector, not a line. */
const CONNECTOR_MS = 250;

const ROLL_ON = 1.2;
const ARC_ON = 0.4;
const ARC_OFF = 0.25;

const abs = (x) => (x < 0 ? -x : x);

/* Half a point per 7.5 deg band the angle whose cosine is c reaches. */
export function bandDeduction(c) {
  let k = 0;
  while (k < 12 && c < COS_BAND[k + 1]) k += 1;
  return k * 0.5;
}

/* Half a point per 7.5 deg of an angle held in radians. */
function radDeduction(rad) {
  return Math.floor(abs(rad) / BAND_RAD) * 0.5;
}

function norm3(v) {
  const m = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  return m > 0 ? [v[0] / m, v[1] / m, v[2] / m] : [0, 0, 0];
}

function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/* The cosine between two directions' horizontal parts, 1 when either is vertical. */
function headingCos(a, b) {
  const ma = Math.sqrt(a[0] * a[0] + a[1] * a[1]);
  const mb = Math.sqrt(b[0] * b[0] + b[1] * b[1]);
  if (ma < 0.2 || mb < 0.2) return 1;
  return (a[0] * b[0] + a[1] * b[1]) / (ma * mb);
}

class Prim {
  constructor(kind, s) {
    this.kind = kind;
    this.t0 = s.t;
    this.t1 = s.t;
    this.z0 = s.z;
    this.z1 = s.z;
    this.x0 = s.x;
    this.y0 = s.y;
    this.x1 = s.x;
    this.y1 = s.y;
    this.d0 = s.d;
    this.d1 = s.d;
    this.n0 = s.n;
    this.n1 = s.n;
    this.u0 = s.u;
    this.u1 = s.u;
    this.tot0 = s.tot;
    this.roll = 0;
    this.pitch = 0;
    this.yaw = 0;
    this.worldYaw = 0;
    this.heading = 0;
    this.swept = 0;
    this.nrm = [0, 0, 0];
    this.liftU = 0;
    this.liftL = 0;
    this.rN = 0;
    this.rSum = 0;
    this.rSq = 0;
    this.pN = 0;
    this.pSum = 0;
    this.pSq = 0;
    this.maxP = 0;
    this.maxQ = 0;
    this.maxR = 0;
    this.dSum = [0, 0, 0];
    this.n = 0;
    this.nzMin = 1;
    this.nzSum = 0;
    this.dzAbsSum = 0;
    this.uzSum = 0;
    this.lzSum = 0;
    this.lzMax = 0;
    this.alphaSum = 0;
    this.stalled = 0;
    this.pauses = 0;
    this.stoppedMs = 0;
    this.pausedMs = 0;
    this.sMin = Infinity;
  }

  get ms() {
    return this.t1 - this.t0;
  }

  /* Mean path direction (unit). */
  get dir() {
    return norm3(this.dSum);
  }

  add(s, prev) {
    this.t1 = s.t;
    this.z1 = s.z;
    this.x1 = s.x;
    this.y1 = s.y;
    this.d1 = s.d;
    this.n1 = s.n;
    this.u1 = s.u;
    this.n += 1;
    this.dSum[0] += s.d[0];
    this.dSum[1] += s.d[1];
    this.dSum[2] += s.d[2];
    if (s.n[2] < this.nzMin) this.nzMin = s.n[2];
    this.nzSum += s.n[2];
    this.dzAbsSum += abs(s.d[2]);
    this.uzSum += s.u[2];
    this.lzSum += abs(s.l[2]);
    if (abs(s.l[2]) > this.lzMax) this.lzMax = abs(s.l[2]);
    this.alphaSum += s.alphaPos ? 1 : -1;
    if (s.stalled) this.stalled += 1;
    if (s.speed < this.sMin) this.sMin = s.speed;
    const ap = abs(s.p);
    if (ap > this.maxP) this.maxP = ap;
    if (abs(s.q) > this.maxQ) this.maxQ = abs(s.q);
    if (abs(s.r) > this.maxR) this.maxR = abs(s.r);
    if (ap >= ROLL_ON) {
      this.pN += 1;
      this.pSum += ap;
      this.pSq += ap * ap;
    }
    if (!prev) return;
    this.swept += s.pathRad / TURN;
    /* The radius only where the path curves as an arc opens (ARC_ON): the
     * arc keeps its hysteresis tail so a loop stays one piece, but a judge
     * grades the loop's roundness, not the pull-out where it straightens
     * (F3A Annex 5B, IMAC), and one tail sample there is tens of metres. */
    if (s.pathRate >= ARC_ON) {
      const r = s.speed / s.pathRate;
      this.rN += 1;
      this.rSum += r;
      this.rSq += r * r;
    }
    const c = [s.d[0] - prev.d[0], s.d[1] - prev.d[1], s.d[2] - prev.d[2]];
    this.liftU += dot3(c, s.u);
    this.liftL += dot3(c, s.l);
    this.nrm[0] += prev.d[1] * s.d[2] - prev.d[2] * s.d[1];
    this.nrm[1] += prev.d[2] * s.d[0] - prev.d[0] * s.d[2];
    this.nrm[2] += prev.d[0] * s.d[1] - prev.d[1] * s.d[0];
    this.heading += s.headRad / TURN;
  }

  /* Rotation totals from the per step integrals. */
  close(tot) {
    this.roll = (tot[0] - this.tot0[0]) / TURN;
    this.pitch = (tot[1] - this.tot0[1]) / TURN;
    this.yaw = (tot[2] - this.tot0[2]) / TURN;
    this.worldYaw = (tot[3] - this.tot0[3]) / TURN;
    this.pathRoll = (tot[4] - this.tot0[4]) / TURN;
  }

  /* Coefficient of variation of the loop radius. */
  radiusCv() {
    if (this.rN < 3) return 0;
    const m = this.rSum / this.rN;
    const v = this.rSq / this.rN - m * m;
    return v > 0 && m > 0 ? Math.sqrt(v) / m : 0;
  }

  meanRadius() {
    return this.rN ? this.rSum / this.rN : 0;
  }

  rateCv() {
    if (this.pN < 3) return 0;
    const m = this.pSum / this.pN;
    const v = this.pSq / this.pN - m * m;
    return v > 0 && m > 0 ? Math.sqrt(v) / m : 0;
  }

  /* The unit normal of the path's plane, z of it near 0 for a loop. */
  plane() {
    return norm3(this.nrm);
  }

  frac(sum) {
    return this.n ? sum / this.n : 0;
  }
}

/* ---- The figure table. ---- */

const near = (x, want, tol) => abs(abs(x) - want) <= tol;
function lineClass(p) {
  const dz = p.dir[2];
  if (dz > COS25) return 'up';
  if (dz < -COS25) return 'down';
  if (abs(dz) < 0.45) return 'level';
  if (dz > 0) return 'up45';
  return 'down45';
}
const inverted = (u) => u[2] < 0;

/* Step predicates. A step's `skip` is the kinds it steps over to find its
 * primitive: by default the straight bits between a figure's parts. */
const step = (is, skip = ['line']) => ({ is, skip });
const line = (cls) => step((p) => (p.kind === 'line' || p.kind === 'arc') && p.swept < 0.15 && lineClass(p) === cls, []);
const arc = (lo, hi, more = () => true) => step((p) => p.kind === 'arc' && p.swept >= lo && p.swept <= hi
  && abs(p.plane()[2]) < 0.6 && more(p));
const rollOf = (turns, tol, more = () => true) => step((p) => p.kind === 'roll' && near(p.roll, turns, tol) && more(p));
const kind = (k, more = () => true, skip = ['line']) => step((p) => p.kind === k && more(p), skip);

/* Deductions shared by the figures, in points. */
function lineDeduction(p, cls) {
  const d = p.dir;
  const h = Math.sqrt(d[0] * d[0] + d[1] * d[1]);
  let c = 1;
  if (cls === 'up') c = d[2];
  else if (cls === 'down') c = -d[2];
  else if (cls === 'level') c = h;
  else if (cls === 'up45') c = COS45 * (h + d[2]);
  else if (cls === 'down45') c = COS45 * (h - d[2]);
  return bandDeduction(c);
}

/* A loop: one radius (1 point per 10 % spread of it), in one plane, and
 * for a whole loop out at the height and heading it went in (1 point per
 * tenth of its diameter, 1 per 15 deg), F3A Annex 5B and IMAC. */
function loopDeduction(p, whole) {
  let pts = Math.floor(p.radiusCv() * 10);
  const pz = p.plane()[2];
  pts += bandDeduction(Math.sqrt(1 - pz * pz));
  if (!whole) return pts;
  const dia = 2 * p.meanRadius();
  if (dia > 1) pts += Math.floor(abs(p.z1 - p.z0) / (0.1 * dia));
  return pts + bandDeduction(headingCos(p.d0, p.d1));
}

/* A roll: a constant rate (IMAC takes a point per change of rate; here a
 * point per 15 % spread of it), stopped on the attitude and the line held
 * through it (a point per 15 deg each). */
function rollDeduction(p, turns) {
  return Math.floor(p.rateCv() / 0.15) + radDeduction((abs(p.roll) - turns) * TURN)
    + bandDeduction(headingCos(p.d0, p.d1)) + bandDeduction(dot3(p.d0, p.d1)) * 0.5;
}

/* A held attitude: the wings level (a point per 15 deg of bank at worst)
 * and the heading kept. */
function holdDeduction(p) {
  return bandDeduction(Math.sqrt(1 - p.lzMax * p.lzMax)) + bandDeduction(headingCos(p.d0, p.d1));
}

/* A hover: the nose on the vertical (a point per 15 deg at worst) and a
 * point per 2 m it drifted from where it was put. */
function hoverDeduction(p) {
  const dx = p.x1 - p.x0;
  const dy = p.y1 - p.y0;
  return bandDeduction(p.nzMin) + Math.floor(Math.sqrt(dx * dx + dy * dy) / 2);
}

/* Stop accuracy of a rotation counted in turns, to the nearest quarter. */
function stopDeduction(turns) {
  const a = abs(turns) * 4;
  return radDeduction(((a - Math.floor(a + 0.5)) / 4) * TURN);
}

const halfRollOn = (cls) => rollOf(0.5, 0.15, (p) => lineClass(p) === cls);
const snapish = (p) => abs(p.roll) >= 0.7;

/*
 * Each row: the figure, its steps in flight order, and its deductions
 * over the primitives the steps took. Longest figures first: the first
 * row that matches at the head of the buffer wins.
 */
const TABLE = [
  ['cuban_8', [arc(0.5, 0.75), halfRollOn('down45'), arc(0.6, 0.9), halfRollOn('down45')],
    ([a1, r1, a2, r2]) => loopDeduction(a1) + loopDeduction(a2) + rollDeduction(r1, 0.5) + rollDeduction(r2, 0.5)
      + lineDeduction(r1, 'down45') + lineDeduction(r2, 'down45')],
  ['reverse_cuban_8', [halfRollOn('up45'), arc(0.5, 0.9), halfRollOn('up45'), arc(0.5, 0.9)],
    ([r1, a1, r2, a2]) => loopDeduction(a1) + loopDeduction(a2) + rollDeduction(r1, 0.5) + rollDeduction(r2, 0.5)
      + lineDeduction(r1, 'up45') + lineDeduction(r2, 'up45')],
  ['avalanche', [arc(0.3, 0.7), kind('snap', snapish), arc(0.3, 0.7)],
    ([a1, s, a2]) => loopDeduction(a1) + loopDeduction(a2) + stopDeduction(s.roll) + bandDeduction(headingCos(a1.d0, a2.d1))
      + (near(a1.swept + a2.swept, 1, 0.15) ? 0 : 2)],
  ['hammerhead', [line('up'), kind('yawover', () => true, ['line', 'hover']), line('down')],
    ([up, , down]) => lineDeduction(up, 'up') + lineDeduction(down, 'down') + bandDeduction(-dot3(up.n1, down.n0))],
  ['humpty_bump', [line('up'), arc(0.35, 0.65), line('down')],
    ([up, a, down]) => lineDeduction(up, 'up') + lineDeduction(down, 'down') + loopDeduction(a)],
  ['blender', [rollOf(2.5, 1, (p) => lineClass(p) === 'down'), kind('spin', (p) => abs(p.frac(p.nzSum)) < 0.5, [])],
    ([r, s]) => lineDeduction(r, 'down') + stopDeduction(s.worldYaw)],
  ['half_cuban', [arc(0.5, 0.75), halfRollOn('down45')],
    ([a, r]) => loopDeduction(a) + rollDeduction(r, 0.5) + lineDeduction(r, 'down45')],
  ['reverse_half_cuban', [halfRollOn('up45'), arc(0.5, 0.9)],
    ([r, a]) => loopDeduction(a) + rollDeduction(r, 0.5) + lineDeduction(r, 'up45')],
  ['immelmann', [arc(0.4, 0.62, (p) => inverted(p.u1)), halfRollOn('level')],
    ([a, r]) => loopDeduction(a) + rollDeduction(r, 0.5) + bandDeduction(-headingCos(a.d0, r.d1))],
  ['split_s', [rollOf(0.5, 0.15, (p) => lineClass(p) === 'level' && inverted(p.u1)), arc(0.4, 0.62, (p) => !inverted(p.u1))],
    ([r, a]) => loopDeduction(a) + rollDeduction(r, 0.5) + bandDeduction(-headingCos(r.d0, a.d1))],
  ['tailslide', [line('up'), kind('tailslide', (p) => p.ms >= 300, ['line', 'hover'])],
    ([up]) => lineDeduction(up, 'up')],
  ['pop_top', [line('up'), step((p) => (p.kind === 'snap' && snapish(p)) || (p.kind === 'pitchover' && abs(p.pitch) >= 0.75), [])],
    ([up, x]) => lineDeduction(up, 'up') + stopDeduction(x.kind === 'snap' ? x.roll : x.pitch)],
  ['parachute', [line('down'), step((p) => p.kind === 'elevator' || ((p.kind === 'arc' || p.kind === 'pitchover') && p.frac(p.stalled) > 0.5), [])],
    ([down]) => lineDeduction(down, 'down')],
  ['wall', [step((p) => (p.kind === 'arc' || p.kind === 'pitchover') && near(p.swept, 0.25, 0.1) && p.ms <= 700),
    step((p) => (p.kind === 'hover' || p.kind === 'harrier') && p.ms >= 1000, [])],
    ([, h]) => (h.kind === 'hover' ? hoverDeduction(h) : holdDeduction(h))],
  ['loop', [arc(0.85, 1.2, (p) => p.liftU > 0 && abs(p.liftL) <= abs(p.liftU))], ([a]) => loopDeduction(a, true)],
  ['outside_loop', [arc(0.85, 1.2, (p) => p.liftU < 0 && abs(p.liftL) <= abs(p.liftU))], ([a]) => loopDeduction(a, true)],
  ['ke_loop', [arc(0.85, 1.2, (p) => abs(p.liftL) > abs(p.liftU))], ([a]) => loopDeduction(a, true)],
  ['rolling_circle', [kind('roll', (p) => abs(p.roll) >= 0.85 && abs(p.heading) >= 0.85)],
    ([r]) => {
      const climb = r.frac(r.dzAbsSum);
      return Math.floor(r.rateCv() / 0.15) + radDeduction((abs(r.heading) - 1) * TURN) + bandDeduction(Math.sqrt(1 - climb * climb));
    }],
  /* A barrel roll's path is a helix: its direction sweeps a cone, so it
   * turns a third of a turn or more where an aileron roll's barely moves. */
  ['barrel_roll', [rollOf(1, 0.25, (p) => p.pauses === 0 && p.swept >= 0.3 && abs(p.heading) <= 0.3)],
    ([r]) => Math.floor(r.rateCv() / 0.15) + bandDeduction(headingCos(r.d0, r.d1))],
  ['eight_point_roll', [rollOf(1, 0.2, (p) => p.pauses === 7)], ([r]) => rollDeduction(r, 1)],
  ['four_point_roll', [rollOf(1, 0.2, (p) => p.pauses === 3)], ([r]) => rollDeduction(r, 1)],
  ['two_point_roll', [rollOf(1, 0.2, (p) => p.pauses === 1)], ([r]) => rollDeduction(r, 1)],
  ['double_roll', [rollOf(2, 0.25, (p) => p.pauses === 0)], ([r]) => rollDeduction(r, 2)],
  ['slow_roll', [rollOf(1, 0.2, (p) => p.pauses === 0 && p.ms >= 3000)], ([r]) => rollDeduction(r, 1)],
  ['aileron_roll', [rollOf(1, 0.2, (p) => p.pauses === 0)], ([r]) => rollDeduction(r, 1)],
  ['half_roll', [rollOf(0.5, 0.12, (p) => p.pauses === 0)], ([r]) => rollDeduction(r, 0.5)],
  ['snap_roll', [kind('snap', (p) => snapish(p) && p.alphaSum >= 0)],
    ([s]) => stopDeduction(s.roll) + bandDeduction(headingCos(s.d0, s.d1))],
  ['negative_snap_roll', [kind('snap', (p) => snapish(p) && p.alphaSum < 0)],
    ([s]) => stopDeduction(s.roll) + bandDeduction(headingCos(s.d0, s.d1))],
  ['ke_spin', [kind('spin', (p) => abs(p.worldYaw) >= 0.9 && p.frac(p.lzSum) >= 0.8)], ([s]) => stopDeduction(s.worldYaw)],
  ['inverted_flat_spin', [kind('spin', (p) => abs(p.worldYaw) >= 0.9 && abs(p.frac(p.nzSum)) < 0.5 && p.frac(p.uzSum) < 0)],
    ([s]) => stopDeduction(s.worldYaw)],
  ['flat_spin', [kind('spin', (p) => abs(p.worldYaw) >= 0.9 && abs(p.frac(p.nzSum)) < 0.5)], ([s]) => stopDeduction(s.worldYaw)],
  ['inverted_spin', [kind('spin', (p) => abs(p.worldYaw) >= 0.9 && p.alphaSum < 0)], ([s]) => stopDeduction(s.worldYaw)],
  ['spin', [kind('spin', (p) => abs(p.worldYaw) >= 0.9)], ([s]) => stopDeduction(s.worldYaw)],
  ['torque_roll', [kind('hover', (p) => p.ms >= 2000 && abs(p.roll) >= 0.9)], ([h]) => hoverDeduction(h)],
  ['hover', [kind('hover', (p) => p.ms >= 3000)], ([h]) => hoverDeduction(h)],
  ['rolling_harrier', [kind('harrier', (p) => p.ms >= 2000 && abs(p.pathRoll) >= 0.9)],
    ([h]) => Math.floor(h.rateCv() / 0.15) + bandDeduction(headingCos(h.d0, h.d1))],
  ['inverted_harrier', [kind('harrier', (p) => p.ms >= 3000 && p.frac(p.uzSum) < 0)], ([h]) => holdDeduction(h)],
  ['harrier', [kind('harrier', (p) => p.ms >= 3000)], ([h]) => holdDeduction(h)],
  ['knife_edge_pass', [kind('knife', (p) => p.ms >= 2000)],
    ([k]) => lineDeduction(k, 'level') + bandDeduction(k.frac(k.lzSum)) + bandDeduction(headingCos(k.d0, k.d1))],
  ['elevator', [kind('elevator', (p) => p.ms >= 2000)], ([e]) => holdDeduction(e)],
  ['lomcevak', [kind('pitchover', (p) => abs(p.pitch) >= 0.9 && abs(p.roll) >= 0.5)], ([t]) => stopDeduction(t.pitch)],
  ['tumble', [kind('pitchover', (p) => abs(p.pitch) >= 0.9 && p.maxQ >= 6)], ([t]) => stopDeduction(t.pitch)],
  ['waterfall', [kind('pitchover', (p) => abs(p.pitch) >= 0.9 && abs(p.roll) <= 0.25)],
    ([t]) => stopDeduction(t.pitch) + bandDeduction(Math.sqrt(1 - t.plane()[2] * t.plane()[2]))],
];

/* Matches a row at the head of the buffer: [primitives used, parts] or null. */
function matchRow(steps, b) {
  const parts = [];
  let i = 0;
  for (const st of steps) {
    while (i < b.length && st.skip.includes(b[i].kind) && !st.is(b[i])) i += 1;
    if (i >= b.length || !st.is(b[i])) return null;
    parts.push(b[i]);
    i += 1;
  }
  return [i, parts];
}

export const FIGURE_IDS = TABLE.map(([id]) => id);

/* Judges score in half points from 10. */
function gradeOf(deduction) {
  const g = 10 - deduction;
  return g <= 0 ? 0 : Math.round(g * 2) / 2;
}

/*
 * The detector. onFigure gets { name, figure, grade, execution, startMs,
 * endMs, turns, faults } where name is the scorer's catalogue name
 * (figures.js figureTrickName), grade 0..10 in halves, and execution the
 * scorer's word the grade maps to, so the streak rules stay the sheet's.
 */
export class FigureDetector {
  constructor(onFigure) {
    this.onFigure = onFigure;
    this.restart();
  }

  restart() {
    this.nowMs = 0;
    this.stepInSample = 0;
    /* Per step integrals: body roll, pitch, yaw, world yaw, rotation
     * about the flight path (radians). */
    this.tot = [0, 0, 0, 0, 0];
    this.reset();
  }

  /* Forget the figure in progress (a crash, a respawn). */
  reset() {
    this.prev = null;
    this.open = null;
    this.cand = null;
    this.candS = [];
    this.paused = [];
    this.buffer = [];
  }

  /*
   * One physics step. st is the plant's state array; dt in seconds. The
   * world yaw rate is the body rate turned into the world, z row only.
   */
  step(dt, st) {
    const w = st[7], x = st[8], y = st[9], z = st[10];
    const p = st[11], q = st[12], r = st[13];
    const wzWorld = 2 * (x * z - w * y) * p + 2 * (y * z + w * x) * q + (1 - 2 * (x * x + y * y)) * r;
    this.tot[0] += p * dt;
    this.tot[1] += q * dt;
    this.tot[2] += r * dt;
    this.tot[3] += wzWorld * dt;
    /* Rotation about the flight path, the rolling harrier's roll. */
    const sp2 = st[4] * st[4] + st[5] * st[5] + st[6] * st[6];
    if (sp2 > 1) {
      const n0 = 1 - 2 * (y * y + z * z), n1 = 2 * (x * y + w * z), n2 = 2 * (x * z - w * y);
      const l0 = 2 * (x * y - w * z), l1 = 1 - 2 * (x * x + z * z), l2 = 2 * (y * z + w * x);
      const u0 = 2 * (x * z + w * y), u1 = 2 * (y * z - w * x), u2 = 1 - 2 * (x * x + y * y);
      const along = (p * (n0 * st[4] + n1 * st[5] + n2 * st[6]) + q * (l0 * st[4] + l1 * st[5] + l2 * st[6])
        + r * (u0 * st[4] + u1 * st[5] + u2 * st[6])) / Math.sqrt(sp2);
      this.tot[4] += along * dt;
    }
    this.nowMs += dt * 1000;
    this.stepInSample += 1;
    if (this.stepInSample * dt * 1000 < SAMPLE_MS - 1e-9) return;
    this.stepInSample = 0;
    this.sample(st, p, q, r, wzWorld);
  }

  sample(st, p, q, r, wzWorld) {
    const w = st[7], x = st[8], y = st[9], z = st[10];
    const n = [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)];
    const l = [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)];
    const u = [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)];
    const v = [st[4], st[5], st[6]];
    const speed = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    const prev = this.prev;
    const d = speed > 0.5 ? [v[0] / speed, v[1] / speed, v[2] / speed] : (prev ? prev.d : n);
    let pathRad = 0;
    let headRad = 0;
    if (prev) {
      const cx = d[0] - prev.d[0], cy = d[1] - prev.d[1], cz = d[2] - prev.d[2];
      pathRad = Math.sqrt(cx * cx + cy * cy + cz * cz);
      const h0 = Math.sqrt(prev.d[0] * prev.d[0] + prev.d[1] * prev.d[1]);
      const h1 = Math.sqrt(d[0] * d[0] + d[1] * d[1]);
      if (h0 > 0.3 && h1 > 0.3) headRad = (prev.d[0] * d[1] - prev.d[1] * d[0]) / (h0 * h1);
    }
    const cosA = speed > 1 ? dot3(n, d) : 1;
    const s = {
      t: this.nowMs, x: st[1], y: st[2], z: st[3], n, l, u, d, speed, p, q, r, wzWorld,
      pathRad, pathRate: pathRad / (SAMPLE_MS / 1000), headRad,
      alphaPos: dot3(d, u) <= 0, stalled: speed > 1 && cosA < COS25, cosA,
      tot: this.tot.slice(),
    };
    this.advance(s, this.token(s));
    this.prev = s;
  }

  /* What the aircraft is doing at this sample, in priority order. */
  token(s) {
    const { speed, n, u, l, d, p, q, r, cosA } = s;
    const ap = abs(p), aq = abs(q), ar = abs(r);
    if (s.stalled && d[2] < -0.6 && abs(s.wzWorld) >= 1.5 && speed < 25) return 'spin';
    if (speed < 10 && aq >= 2.5 && aq >= 1.5 * ap && aq >= ar) return 'pitchover';
    /* A snap is the wing stalled at speed while it rolls: the angle of
     * attack itself (the flow under the wing, -d.u), not the nose to path
     * angle, which a fast aileron roll on the Extra pushes past 15 deg with
     * sideslip alone (figures-plant-sweep.js). */
    if (speed >= 6 && abs(dot3(d, u)) > SIN15 && ap >= 4) return 'snap';
    if (n[2] > 0.5 && dot3(d, n) * speed < -1) return 'tailslide';
    if (speed < 3 && n[2] > COS30) return 'hover';
    if (speed < 8 && ar >= 1.2 && ar >= 2 * aq && ap < 1.5) return 'yawover';
    if (d[2] * speed < -2 && speed < 12 && cosA < COS45 && u[2] > 0.7) return 'elevator';
    /* Slow, nose high over a level path: a harrier, wings level or rolling. */
    if (speed >= 1 && speed < 10 && cosA < COS30 && abs(d[2]) < 0.5 && (ap >= ROLL_ON || (n[2] > 0.1 && abs(l[2]) < 0.6))) return 'harrier';
    if (abs(l[2]) > 0.9 && abs(d[2]) < SIN15 && speed >= 5 && ap < 1 && s.pathRate < ARC_OFF) return 'knife';
    if (ap >= ROLL_ON) return 'roll';
    const arcing = this.open && this.open.kind === 'arc' ? s.pathRate >= ARC_OFF : s.pathRate >= ARC_ON;
    return arcing ? 'arc' : 'line';
  }

  advance(s, tok) {
    const open = this.open;
    if (!open) {
      this.start(tok, [s]);
      return;
    }
    /* A roll paused on a point (a line, a knife edge at the quarter, the
     * path sagging while it waits) is still the same roll until the pause
     * outlasts ROLL_BRIDGE_MS; then the pause was the next part, and it
     * opens from where it began. */
    if (open.kind === 'roll' && (tok === 'line' || tok === 'knife' || tok === 'arc')) {
      if (open.pausedMs === 0) {
        this.paused = [];
        open.stoppedMs = 0;
      }
      open.pausedMs += SAMPLE_MS;
      if (abs(s.p) < ROLL_STOP) open.stoppedMs += SAMPLE_MS;
      this.paused.push(s);
      this.cand = null;
      if (open.pausedMs <= ROLL_BRIDGE_MS) return;
      this.closeOpen(this.paused[0]);
      this.start(tok, this.paused);
      return;
    }
    if (open.kind === 'roll' && open.pausedMs > 0) {
      if (tok === 'roll' && open.stoppedMs >= PAUSE_MIN_MS) open.pauses += 1;
      /* The pause was part of the roll (or of what ends it, below). */
      let prev = this.prev && this.paused.length ? null : this.prev;
      for (const c of this.paused) {
        open.add(c, prev);
        prev = c;
      }
      this.paused = [];
      open.pausedMs = 0;
    }
    if (tok === open.kind) {
      /* A candidate that did not hold was part of this one after all. */
      if (this.cand) for (const c of this.candS) open.add(c, null);
      this.cand = null;
      open.add(s, this.prev);
      this.settle(s, open);
      return;
    }
    if (this.cand !== tok) {
      if (this.cand) for (const c of this.candS) open.add(c, null);
      this.cand = tok;
      this.candS = [];
    }
    this.candS.push(s);
    if (this.candS.length < HOLD) return;
    this.closeOpen(this.candS[0]);
    this.start(tok, this.candS);
  }

  /* Opens a primitive on the samples it began with. */
  start(tok, samples) {
    const first = samples[0];
    this.open = new Prim(tok, first);
    let prev = null;
    for (const c of samples) {
      this.open.add(c, prev);
      prev = c;
    }
    this.cand = null;
  }

  closeOpen(s) {
    const open = this.open;
    open.close(s.tot);
    this.open = null;
    if ((open.kind === 'line' || open.kind === 'arc') && open.ms < CONNECTOR_MS && open.swept < 0.05) return;
    const last = this.buffer[this.buffer.length - 1];
    /* A short line between two arcs of one loop belongs to the loop. */
    this.buffer.push(open);
    if (last && last.kind === 'line' && open.kind === 'line') this.merge();
    if (this.buffer.length >= BUFFER_MAX) this.drain();
  }

  merge() {
    const b = this.buffer;
    const two = b.pop();
    const one = b[b.length - 1];
    one.t1 = two.t1;
    one.z1 = two.z1;
    one.d1 = two.d1;
    one.dSum[0] += two.dSum[0];
    one.dSum[1] += two.dSum[1];
    one.dSum[2] += two.dSum[2];
  }

  /* Straight flight long enough ends whatever figure was flying. */
  settle(s, open) {
    if (open.kind !== 'line' || this.buffer.length === 0) return;
    /* A climbing or diving line is usually the middle of a figure (a
     * humpty's, a Cuban's 45), so only a long one ends it. */
    const wait = lineClass(open) === 'level' ? SETTLE_MS : LINE_PART_MAX_MS;
    if (s.t - open.t0 >= wait) this.drain();
  }

  /* Names figures from the front of the buffer until nothing matches. */
  drain() {
    const b = this.buffer;
    while (b.length) {
      const hit = this.match(b);
      if (!hit) {
        b.shift();
        continue;
      }
      const [id, used, deduction] = hit;
      const parts = b.splice(0, used);
      this.emit(id, parts, deduction);
    }
  }

  match(b) {
    for (const [id, steps, deduct] of TABLE) {
      const hit = matchRow(steps, b);
      if (hit) return [id, hit[0], deduct(hit[1])];
    }
    return null;
  }

  emit(id, parts, deduction) {
    const grade = gradeOf(deduction);
    const first = parts[0];
    const last = parts[parts.length - 1];
    this.onFigure({
      name: figureTrickName(id),
      figure: id,
      grade,
      execution: grade >= 6 ? 'CLEAN' : grade > 0 ? 'SLOPPY' : 'MISSED',
      startMs: first.t0,
      endMs: last.t1,
      turns: parts.reduce((a, p2) => a + abs(p2.roll), 0),
      axis: 'figure',
      primitives: parts.length,
      obstacle: null,
    });
  }

  /* End of a run: whatever is flying is named now. */
  flush() {
    if (this.prev && this.open) this.closeOpen(this.prev);
    this.drain();
  }
}
