/*
 * turned-box-check.js: a turned box (src/game/collide.js addTurnedBox) is
 * met exactly as the axis aligned box it is in its own frame. In Node,
 * against collide.js and crashworld.js alone.
 *
 *   node scripts/turned-box-check.js
 *
 *   square    a turned box square to the world, u = (1, 0), against the
 *             same box from addBox: every query (hit with a quad's discs
 *             and with a fixed wing's parts, gapAt, axisAt, interiorAt,
 *             crossedStatic) gives the same answer, number for number
 *             (===), over seeded boxes and travels;
 *   turned    a box turned by a seeded angle, against the axis aligned box
 *             in its frame with every query turned into that frame (the
 *             travel, and the craft's attitude, so the discs' reach along
 *             the box's axes is the same): the same contacts, with the
 *             normal, the arm and the axis turned back, within TOL;
 *   grid      a long turned box is found from every cell its bounding box
 *             covers: a travel into its far end meets it;
 *   again     the turned sweep run twice gives the same numbers;
 *   pose      crashworld.js turnedBoxPose: square to the world it is the
 *             axis aligned box's middle and half extents and no turn at
 *             all, (0, 0, 0, 1); turned, its quaternion takes the world's
 *             x and z onto the box's u and w.
 *
 * Exits 1 on any failure.
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

import { Colliders, TURNED, setCraftParts } from '../src/game/collide.js';
import { airframeHull, THREE_BODY } from '../src/game/airframehull.js';
import { turnedBoxPose } from '../src/game/crashworld.js';

/* Cases per sweep, and how far a turned answer may stand from the axis
 * aligned one in its frame: the frame's single precision axis against a
 * double precision turn of the query, metres (or a cosine), at a few
 * hundred metres from the origin. */
const CASES = 4000;
const TOL = 2e-5;

const failures = [];
function check(name, ok, detail) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
  if (!ok) {
    failures.push(name);
  }
}

let seed = 20261001;
const rnd = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const range = (a, b) => a + (b - a) * rnd();

/* A wing of three parts, as the shell seats a fixed wing's hull. */
const WING = airframeHull([
  { cg: [0, 0, 0], boxMin: [-0.1, -0.08, -0.6], boxMax: [0.1, 0.08, 0.4] },
  { cg: [0, 0, 0], boxMin: [-0.7, -0.02, -0.15], boxMax: [0.7, 0.02, 0.15] },
  { cg: [0, 0, 0], boxMin: [-0.25, -0.02, 0.35], boxMax: [0.25, 0.15, 0.5] },
], THREE_BODY, 1);

function unitQuat() {
  const q = [range(-1, 1), range(-1, 1), range(-1, 1), range(-1, 1)];
  const l = Math.hypot(...q);
  return q.map((v) => v / l);
}

/* Hamilton product a b, [x, y, z, w]. */
function qmul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] + a[1] * b[3] + a[2] * b[0] - a[0] * b[2],
    a[3] * b[2] + a[2] * b[3] + a[0] * b[1] - a[1] * b[0],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

/* A box, its middle within `far` of (ox, oz), and a travel that starts
 * near it and often reaches it. */
function caseAt(ox, oz, far, long) {
  const h = [range(0.1, long ? 40 : 8), range(0.1, 6), range(0.1, 8)];
  const c = [ox + range(-far, far), range(-5, 30), oz + range(-far, far)];
  const p = [0, 1, 2].map((k) => c[k] + range(-1.3, 1.3) * (h[k] + 1));
  const toward = [0, 1, 2].map((k) => c[k] + range(-1, 1) * h[k] - p[k]);
  const s = range(0, 1.6) / Math.max(1e-9, Math.hypot(...toward)) * range(0.2, 6);
  const q = [0, 1, 2].map((k) => p[k] + toward[k] * s);
  return {
    lo: [c[0] - h[0], c[1] - h[1], c[2] - h[2]], hi: [c[0] + h[0], c[1] + h[1], c[2] + h[2]], p, q, att: unitQuat(), vOff: range(-0.02, 0.02),
  };
}

/* Every answer a set of colliders gives about collider 0 for one case,
 * the query's points turned by `to` (world to the set's frame) and its
 * attitude by `turn`; the answers' directions turned back by `back`. */
function answers(col, k, to, turn, back) {
  const p = to(k.p);
  const q = to(k.q);
  const a = turn(k.att);
  const out = {};
  const hit = (prefix) => {
    const kind = col.hit(p[0], p[1], p[2], q[0], q[1], q[2], undefined, a[0], a[1], a[2], a[3], k.vOff);
    out[`${prefix}kind`] = kind;
    if (kind < 0) {
      return;
    }
    const n = back([col.hitNx, col.hitNy, col.hitNz]);
    Object.assign(out, {
      [`${prefix}t`]: col.hitT, [`${prefix}nx`]: n[0], [`${prefix}ny`]: n[1], [`${prefix}nz`]: n[2],
      [`${prefix}pen`]: col.hitPen, [`${prefix}overlap`]: col.hitOverlap, [`${prefix}dot`]: col.hitNormalDot,
    });
    if (col.hitArm) {
      const arm = back([col.hitArmX, col.hitArmY, col.hitArmZ]);
      Object.assign(out, {
        [`${prefix}armx`]: arm[0], [`${prefix}army`]: arm[1], [`${prefix}armz`]: arm[2], [`${prefix}part`]: col.hitPart,
      });
    }
  };
  hit('quad.');
  setCraftParts(WING);
  hit('wing.');
  setCraftParts(null);
  out.gap = col.gapAt(p[0], p[1], p[2], 50);
  out.axis = col.axisAt(p[0], p[1], p[2], 50);
  if (out.axis) {
    const d = back([col.axisDx, col.axisDy, col.axisDz]);
    const at = back([col.axisCx, col.axisCy, col.axisCz]);
    Object.assign(out, {
      axisGap: col.axisGap, axisDx: d[0], axisDy: d[1], axisDz: d[2], axisCx: at[0], axisCy: at[1], axisCz: at[2],
    });
  }
  out.interior = col.interiorAt(0, p[0], p[1], p[2]);
  out.crossed = col.crossedStatic(0, p[0], p[1], p[2], q[0], q[1], q[2]);
  return out;
}

const same = (v) => v;
function compare(a, b, tol) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const x = a[key];
    const y = b[key];
    const near = tol > 0 && typeof x === 'number' && typeof y === 'number' && !/kind|part/.test(key);
    const ok = near ? Math.abs(x - y) <= tol * Math.max(1, Math.abs(x)) : x === y;
    if (!ok) {
      return `${key}: ${x} against ${y}`;
    }
  }
  return null;
}

/* ---- square */
{
  let hits = 0;
  let wingHits = 0;
  let worst = null;
  for (let n = 0; n < CASES; n += 1) {
    const k = caseAt(range(-600, 600), range(-1800, 1800), 30, n % 5 === 0);
    const A = new Colliders();
    A.addBox('wall', ...k.lo, ...k.hi);
    A.build();
    const B = new Colliders();
    B.addTurnedBox('wall', 1, 0, k.lo[0], k.hi[0], k.lo[1], k.hi[1], k.lo[2], k.hi[2]);
    B.build();
    const a = answers(A, k, same, same, same);
    const b = answers(B, k, same, same, same);
    hits += a['quad.kind'] >= 0 ? 1 : 0;
    wingHits += a['wing.kind'] >= 0 ? 1 : 0;
    const d = compare(a, b, 0);
    if (d && !worst) {
      worst = `case ${n}, ${d}`;
    }
  }
  check(`square: a turned box at u = (1, 0) answers ${CASES} cases as addBox's box does, number for number`, !worst,
    worst ?? `the discs met it in ${hits}, the wing in ${wingHits}`);
  check('square: the cases reach the box', hits > CASES / 5 && wingHits > CASES / 5, `${hits} and ${wingHits} of ${CASES}`);
}

/* ---- turned */
function turnedSweep(cases) {
  let hits = 0;
  let wingHits = 0;
  let first = null;
  const log = [];
  for (let n = 0; n < cases; n += 1) {
    const ox = range(-600, 600);
    const oz = range(-1800, 1800);
    const k = caseAt(0, 0, 0, n % 5 === 0);
    /* The case is drawn in the box's frame round the origin and put in
     * the world turned by phi round (ox, oz); in the box's frame the
     * world's (ox, oz) is wherever the turn takes it, which addTurnedBox's
     * extents carry. */
    const phi = range(-Math.PI, Math.PI);
    const B = new Colliders();
    const ox2 = ox * Math.cos(phi) + oz * Math.sin(phi);
    const oz2 = oz * Math.cos(phi) - ox * Math.sin(phi);
    B.addTurnedBox('wall', Math.cos(phi), Math.sin(phi), k.lo[0] + ox2, k.hi[0] + ox2, k.lo[1], k.hi[1], k.lo[2] + oz2, k.hi[2] + oz2);
    B.build();
    const tx = B.fux[0];
    const tz = B.fuz[0];
    if (B.fbox[0] !== TURNED) {
      first = first ?? 'addTurnedBox did not make a turned box';
    }
    /* World points of the case: frame (u, y, w) to world. */
    const world = ([u, y, w]) => [(u + ox2) * tx - (w + oz2) * tz, y, (u + ox2) * tz + (w + oz2) * tx];
    const wk = { ...k, p: world(k.p), q: world(k.q) };
    /* The attitude in the world: the frame's attitude turned by the box's
     * turn, world x onto u (crashworld.js turnedBoxPose's quaternion). */
    const pose = turnedBoxPose(B, 0, {});
    const R = [0, pose.qy, 0, pose.qw];
    const Rinv = [0, -pose.qy, 0, pose.qw];
    wk.att = qmul(R, k.att);
    const A = new Colliders();
    A.addBox('wall', k.lo[0] + ox2, k.lo[1], k.lo[2] + oz2, k.hi[0] + ox2, k.hi[1], k.hi[2] + oz2);
    A.build();
    const toFrame = ([x, y, z]) => [x * tx + z * tz, y, z * tx - x * tz];
    const toWorld = ([u, y, w]) => [u * tx - w * tz, y, u * tz + w * tx];
    const a = answers(A, wk, toFrame, (q) => qmul(Rinv, q), toWorld);
    const b = answers(B, wk, same, same, same);
    log.push(b);
    hits += a['quad.kind'] >= 0 ? 1 : 0;
    wingHits += a['wing.kind'] >= 0 ? 1 : 0;
    const d = compare(a, b, TOL);
    if (d && !first) {
      first = `case ${n} at ${(phi * 180 / Math.PI).toFixed(1)} degrees, ${d}`;
    }
  }
  return { hits, wingHits, first, log };
}
{
  const s0 = seed;
  const r = turnedSweep(CASES);
  check(`turned: ${CASES} boxes at seeded turns meet every query as the axis aligned box in their frame, within ${TOL}`, !r.first,
    r.first ?? `the discs met them in ${r.hits}, the wing in ${r.wingHits}`);
  check('turned: the cases reach the box', r.hits > CASES / 5 && r.wingHits > CASES / 5, `${r.hits} and ${r.wingHits} of ${CASES}`);
  seed = s0;
  const again = turnedSweep(CASES);
  check('again: the same sweep twice gives the same numbers', JSON.stringify(again.log) === JSON.stringify(r.log));
}

/* ---- grid */
{
  const c = new Colliders();
  /* 120 m long, 0.6 m thick, turned 37 degrees, its far end 2 000 m out. */
  const phi = (37 * Math.PI) / 180;
  const u0 = 1900;
  c.addTurnedBox('wall', Math.cos(phi), Math.sin(phi), u0, u0 + 120, 0, 10, -0.3, 0.3);
  c.build();
  const ux = c.fux[0];
  const uz = c.fuz[0];
  let met = 0;
  let tried = 0;
  for (let u = u0 + 1; u < u0 + 120; u += 7) {
    const x = u * ux;
    const z = u * uz;
    /* Across it along w, from 3 m out to 3 m past. */
    const kind = c.hit(x + 3 * uz, 5, z - 3 * ux, x - 3 * uz, 5, z + 3 * ux);
    tried += 1;
    met += kind >= 0 ? 1 : 0;
  }
  check('grid: a turned box 120 m long is met along all its length', met === tried, `${met} of ${tried}`);
}

/* ---- pose */
{
  const A = new Colliders();
  A.addBox('wall', -3.25, 1, 7.5, 12.75, 4, 9.125);
  A.build();
  const B = new Colliders();
  B.addTurnedBox('wall', 1, 0, -3.25, 12.75, 1, 4, 7.5, 9.125);
  B.build();
  const p = turnedBoxPose(B, 0, {});
  const ok = p.cx === (A.fax[0] + A.fbx[0]) / 2 && p.cy === (A.fay[0] + A.fby[0]) / 2 && p.cz === (A.faz[0] + A.fbz[0]) / 2
    && p.hu === Math.abs(A.fbx[0] - A.fax[0]) / 2 && p.hy === Math.abs(A.fby[0] - A.fay[0]) / 2 && p.hw === Math.abs(A.fbz[0] - A.faz[0]) / 2
    && p.qy === 0 && p.qw === 1 && !Object.is(p.qy, -0);
  check('pose: square to the world, the axis aligned box\'s middle and half extents and no turn', ok, JSON.stringify(p));
  let worst = 0;
  for (let n = 0; n < 1000; n += 1) {
    const phi = range(-Math.PI, Math.PI);
    const C = new Colliders();
    C.addTurnedBox('wall', Math.cos(phi), Math.sin(phi), 0, 1, 0, 1, 0, 1);
    C.build();
    const q = turnedBoxPose(C, 0, {});
    const R = [0, q.qy, 0, q.qw];
    const Rc = [0, -q.qy, 0, q.qw];
    const rot = (v) => qmul(qmul(R, [...v, 0]), Rc).slice(0, 3);
    const x = rot([1, 0, 0]);
    const z = rot([0, 0, 1]);
    const tx = C.fux[0];
    const tz = C.fuz[0];
    worst = Math.max(worst, Math.hypot(x[0] - tx, x[1], x[2] - tz), Math.hypot(z[0] + tz, z[1], z[2] - tx));
  }
  check('pose: turned, the quaternion takes the world\'s x and z onto the box\'s u and w', worst < 1e-6, `${worst.toExponential(2)} at worst`);
}

console.log(failures.length ? `${failures.length} failed` : 'passed');
process.exit(failures.length ? 1 : 0);
