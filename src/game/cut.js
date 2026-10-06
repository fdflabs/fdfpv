/*
 * cut.js: the rule that decides whether an aircraft in a room cut another
 * pilot's streamer, docs/COMBAT-PLAN.md section 4. Pure, like Phase 3's
 * src/game/midair.js, whose pieces it is built from: the room
 * (edge/rooms/combat.js) runs it, and so does the Node harness
 * (scripts/combat-harness.js).
 *
 * THE RULE. The cutter is its crash part boxes (configs/hulls.js through
 * midair.js hullFor: props, wings, fuselage, every part), posed from its
 * 30 Hz POSE samples as Phase 3 poses them. The streamer is its owner's 10
 * Hz STREAMER frames (src/share/roomwire.js), each node interpolated
 * linearly between the two frames round the moment. Both are stepped every
 * SUBSTEP_MS on the room clock; a link is cut when any part box comes
 * within REACH_M of the paper's centre line: three metres, the owner's
 * rule (docs/COMBAT-PLAN.md section 4.1, decided 2026-09-28: first a
 * metre, "if you get even within 1 m of the other person's line ... cut
 * it", then three times that). The first such
 * moment is the cut, and of the links it touches then, the one nearest
 * the tow point, because everything behind that falls.
 *
 * The reach is also the depth nothing may step over: 60 m/s of closing is
 * 1.5 cm a quarter millisecond, far inside it.
 *
 * The distance from a segment to a box is convex along the segment, so it
 * is found exactly by golden section search. No trigonometry anywhere: a
 * quaternion to a matrix is multiply and add.
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

import { bodyAxes } from './airframehull.js';
import { poseAt } from './midair.js';
import { FLAG_CRASHED, FLAG_SPAWNING } from '../share/roomwire.js';

/* Half of src/game/streamer.js WIDTH_M; rooms:selftest holds them equal.
 * Kept here so the room's bundle does not carry the paper's physics. */
export const PAPER_HALF_M = 0.0508;
/*
 * The owner's rule: within three metres of the line is a cut. Not grown for
 * lag: the room judges on the samples' own times, so a link's delay
 * changes when a cut is known, never whether, and the room's picture of
 * the paper is within 1.1 cm (codec) plus 2 cm (a turn between 10 Hz
 * frames) of its owner's. What the cutter DREW can be further off, and
 * scripts/combat-harness.js measures that against this reach.
 */
export const REACH_M = 3.0;
/* Two streamer frames further apart than this bracket nothing. */
export const FRAME_GAP_MS = 350;
export const SUBSTEP_MS = 0.25;
/* The rules' "multiple cuts on a single streamer in a single pass count as
 * one cut": the same cutter on the same streamer within this of its cut
 * is the same pass, and cuts nothing more. With three metres of reach, a
 * pass that followed the paper would otherwise chew all of it. A pass
 * across the paper is inside the reach for 6 m of its path, 0.4 s at 15
 * m/s, and one at 30 degrees to it 12 m, 0.8 s: 1.5 s covers both. A
 * pilot flying along another's paper cuts it again every 1.5 s, which is
 * chasing, not one pass. */
export const PASS_MS = 1500;
/* How much of a streamer's past the room keeps. */
export const KEEP_MS = 2000;

/* ------------------------------------------------------------ frames */

/*
 * One seat's streamer, oldest first, by room time: chain 0 of each
 * decoded STREAMER (the paper still on the aircraft; pieces falling are
 * not eligible), with its bounding box. A frame no newer than the newest
 * is dropped, as Phase 3's Track drops a pose.
 */
export class StreamerTrack {
  constructor() {
    this.f = [];
  }

  push(t, n, x) {
    const last = this.f[this.f.length - 1];
    if (last && t <= last.t) {
      return false;
    }
    const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i += 1) {
      for (let k = 0; k < 3; k += 1) {
        const v = x[i * 3 + k];
        box[k] = Math.min(box[k], v);
        box[k + 3] = Math.max(box[k + 3], v);
      }
    }
    this.f.push({ t, n, x, box });
    let drop = 0;
    while (drop < this.f.length - 2 && this.f[drop + 1].t < t - KEEP_MS) {
      drop += 1;
    }
    if (drop) {
      this.f.splice(0, drop);
    }
    return true;
  }

  newest() {
    return this.f.length ? this.f[this.f.length - 1].t : -Infinity;
  }

  /*
   * The index of the frame before the room millisecond t whose successor
   * is at or after it (f[i].t < t <= f[i + 1].t), or -1 when no two frames
   * FRAME_GAP_MS or less apart bracket it. Frames are stamped on whole
   * milliseconds, so one bracket holds for every quarter step of the
   * millisecond (t - 1, t], whichever frames have arrived since: the
   * answer depends on the frames, never on when the question is asked.
   */
  bracket(t) {
    const f = this.f;
    let i = f.length - 2;
    while (i > 0 && f[i].t >= t) {
      i -= 1;
    }
    if (i < 0 || f[i].t >= t || f[i + 1].t < t || f[i + 1].t - f[i].t > FRAME_GAP_MS) {
      return -1;
    }
    return i;
  }
}

/* ------------------------------------------------------- the geometry */

const GOLD = 0.6180339887498949;

/* Squared distance from the point at u along a..b (box frame) to the box
 * of half extents h. */
function boxDist2(ax, ay, az, bx, by, bz, hx, hy, hz, u) {
  const x = ax + (bx - ax) * u;
  const y = ay + (by - ay) * u;
  const z = az + (bz - az) * u;
  const dx = Math.max(0, Math.abs(x) - hx);
  const dy = Math.max(0, Math.abs(y) - hy);
  const dz = Math.max(0, Math.abs(z) - hz);
  return dx * dx + dy * dy + dz * dz;
}

/*
 * The distance from the segment p..q (world) to the oriented box at
 * centre c with axes ax (three unit columns) and half extents h, and the
 * parameter along the segment where it is least. Convex in u, so golden
 * section finds the minimum; 40 rounds is 1e-8 of the segment.
 */
export function segmentBox(p, q, c, ax, h, out) {
  const px = p[0] - c[0];
  const py = p[1] - c[1];
  const pz = p[2] - c[2];
  const qx = q[0] - c[0];
  const qy = q[1] - c[1];
  const qz = q[2] - c[2];
  const ax0 = px * ax[0] + py * ax[1] + pz * ax[2];
  const ay0 = px * ax[3] + py * ax[4] + pz * ax[5];
  const az0 = px * ax[6] + py * ax[7] + pz * ax[8];
  const bx0 = qx * ax[0] + qy * ax[1] + qz * ax[2];
  const by0 = qx * ax[3] + qy * ax[4] + qz * ax[5];
  const bz0 = qx * ax[6] + qy * ax[7] + qz * ax[8];
  let lo = 0;
  let hi = 1;
  let u1 = hi - GOLD * (hi - lo);
  let u2 = lo + GOLD * (hi - lo);
  let f1 = boxDist2(ax0, ay0, az0, bx0, by0, bz0, h[0], h[1], h[2], u1);
  let f2 = boxDist2(ax0, ay0, az0, bx0, by0, bz0, h[0], h[1], h[2], u2);
  for (let k = 0; k < 40; k += 1) {
    if (f1 <= f2) {
      hi = u2;
      u2 = u1;
      f2 = f1;
      u1 = hi - GOLD * (hi - lo);
      f1 = boxDist2(ax0, ay0, az0, bx0, by0, bz0, h[0], h[1], h[2], u1);
    } else {
      lo = u1;
      u1 = u2;
      f1 = f2;
      u2 = lo + GOLD * (hi - lo);
      f2 = boxDist2(ax0, ay0, az0, bx0, by0, bz0, h[0], h[1], h[2], u2);
    }
  }
  /* The ends too: a flat minimum can sit on one. */
  const u = (lo + hi) / 2;
  let best = boxDist2(ax0, ay0, az0, bx0, by0, bz0, h[0], h[1], h[2], u);
  let bu = u;
  for (const e of [0, 1]) {
    const d = boxDist2(ax0, ay0, az0, bx0, by0, bz0, h[0], h[1], h[2], e);
    if (d < best) {
      best = d;
      bu = e;
    }
  }
  out.d = Math.sqrt(best);
  out.u = bu;
  return out;
}

function untouchable(p) {
  return (p.flags & (FLAG_SPAWNING | FLAG_CRASHED)) !== 0;
}

/* The squared distance from a point to a box [minx, miny, minz, maxx,
 * maxy, maxz]. */
function pointBox2(x, y, z, b) {
  const dx = Math.max(0, b[0] - x, x - b[3]);
  const dy = Math.max(0, b[1] - y, y - b[4]);
  const dz = Math.max(0, b[2] - z, z - b[5]);
  return dx * dx + dy * dy + dz * dz;
}

/* ------------------------------------------------------------ the judge */

const PA = {};
const PB = {};
const AX = new Float64Array(9);
const CEN = new Float64Array(3);
const HALF = new Float64Array(3);
const P = new Float64Array(3);
const Q = new Float64Array(3);
const SB = { d: 0, u: 0 };
const UNION = new Float64Array(6);

/* Metres a part's sphere test leaves to segmentBox: far above rounding,
 * far below anything a cut is decided by. */
const SPHERE_SLACK_M = 1e-6;

/* The squared distance from the point c to the segment p..q. */
function pointSegment2(c, p, q) {
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const dz = q[2] - p[2];
  const len2 = dx * dx + dy * dy + dz * dz;
  const along = len2 > 0 ? ((c[0] - p[0]) * dx + (c[1] - p[1]) * dy + (c[2] - p[2]) * dz) / len2 : 0;
  const u = Math.min(1, Math.max(0, along));
  const ex = p[0] + dx * u - c[0];
  const ey = p[1] + dy * u - c[1];
  const ez = p[2] + dz * u - c[2];
  return ex * ex + ey * ey + ez * ez;
}

/* Node i of the streamer at t, between frames fa and fb, into out. */
function nodeAt(fa, fb, t, i, out) {
  const span = fb.t - fa.t;
  const u = span > 0 ? (t - fa.t) / span : 0;
  const o = i * 3;
  out[0] = fa.x[o] + (fb.x[o] - fa.x[o]) * u;
  out[1] = fa.x[o + 1] + (fb.x[o + 1] - fa.x[o + 1]) * u;
  out[2] = fa.x[o + 2] + (fb.x[o + 2] - fa.x[o + 2]) * u;
}

/*
 * Judge the cutter (hullFor answer hA, pose Track tA) against a victim's
 * streamer (StreamerTrack sB, its owner's pose Track tB, for the flags)
 * over the room milliseconds (t0, t1], whole ms. links is how many of the
 * streamer's links are still the victim's (the referee's cuts); links from
 * there on are gone. Returns the first cut or null:
 *
 *   { tc, link, part, d, p: [3] }
 *
 * tc in room ms (a quarter ms step), link the index of the link cut (the
 * streamer keeps `link` links), part the cutter's part index, d the
 * distance, p the point on the paper.
 */
export function judgeCut(hA, tA, tB, sB, t0, t1, links, reach = REACH_M) {
  const first = Math.floor(t0) + 1;
  const last = Math.floor(t1);
  if (last < first || !hA || links < 1) {
    return null;
  }
  const H = hA.hull;
  const R = H.reach + reach;
  /* The coarse test: the cutter's sphere at the span's ends, grown by its
   * travel, against the box round every frame that could be used. */
  const a0 = poseAt(tA, first, PA);
  if (a0) {
    const va = Math.sqrt(a0.vx * a0.vx + a0.vy * a0.vy + a0.vz * a0.vz);
    const grow = 2 * va * (last - first + 1) / 1000 + 1;
    let near = false;
    for (const f of sB.f) {
      if (f.t < first - FRAME_GAP_MS || f.t > last + FRAME_GAP_MS) {
        continue;
      }
      if (pointBox2(a0.px, a0.py, a0.pz, f.box) <= (R + grow) * (R + grow)) {
        near = true;
        break;
      }
    }
    if (!near) {
      return null;
    }
  }
  for (let t = first; t <= last; t += 1) {
    const i = sB.bracket(t);
    if (i < 0 || !poseAt(tA, t, PA) || !poseAt(tB, t, PB)) {
      continue;
    }
    if (untouchable(PA) || untouchable(PB)) {
      continue;
    }
    const fa = sB.f[i];
    const fb = sB.f[i + 1];
    const n = Math.min(fa.n, fb.n, links + 1);
    /* This millisecond's reach: the hull's sphere and the paper's reach,
     * grown by what the cutter travels in the millisecond before. Every
     * node between two frames is inside the box round both. */
    const va = Math.sqrt(PA.vx * PA.vx + PA.vy * PA.vy + PA.vz * PA.vz);
    const Rt = R + va * 0.002 + 0.01;
    UNION[0] = Math.min(fa.box[0], fb.box[0]);
    UNION[1] = Math.min(fa.box[1], fb.box[1]);
    UNION[2] = Math.min(fa.box[2], fb.box[2]);
    UNION[3] = Math.max(fa.box[3], fb.box[3]);
    UNION[4] = Math.max(fa.box[4], fb.box[4]);
    UNION[5] = Math.max(fa.box[5], fb.box[5]);
    if (pointBox2(PA.px, PA.py, PA.pz, UNION) > Rt * Rt) {
      continue;
    }
    /* The links within reach this millisecond: their four ends' box. */
    const cand = [];
    for (let k = 0; k < n - 1; k += 1) {
      const o = k * 3;
      let mnx = Math.min(fa.x[o], fa.x[o + 3], fb.x[o], fb.x[o + 3]);
      let mxx = Math.max(fa.x[o], fa.x[o + 3], fb.x[o], fb.x[o + 3]);
      let mny = Math.min(fa.x[o + 1], fa.x[o + 4], fb.x[o + 1], fb.x[o + 4]);
      let mxy = Math.max(fa.x[o + 1], fa.x[o + 4], fb.x[o + 1], fb.x[o + 4]);
      let mnz = Math.min(fa.x[o + 2], fa.x[o + 5], fb.x[o + 2], fb.x[o + 5]);
      let mxz = Math.max(fa.x[o + 2], fa.x[o + 5], fb.x[o + 2], fb.x[o + 5]);
      mnx -= Rt;
      mny -= Rt;
      mnz -= Rt;
      mxx += Rt;
      mxy += Rt;
      mxz += Rt;
      if (PA.px >= mnx && PA.px <= mxx && PA.py >= mny && PA.py <= mxy && PA.pz >= mnz && PA.pz <= mxz) {
        cand.push(k);
      }
    }
    if (!cand.length) {
      continue;
    }
    for (let s = 1; s <= 1 / SUBSTEP_MS; s += 1) {
      const ts = t - 1 + s * SUBSTEP_MS;
      if (!poseAt(tA, ts, PA)) {
        continue;
      }
      bodyAxes(PA.qx, PA.qy, PA.qz, PA.qw, AX);
      for (const k of cand) {
        nodeAt(fa, fb, ts, k, P);
        nodeAt(fa, fb, ts, k + 1, Q);
        for (let j = 0; j < H.n; j += 1) {
          const bx = H.cx[j];
          const by = H.cy[j];
          const bz = H.cz[j];
          CEN[0] = PA.px + bx * AX[0] + by * AX[3] + bz * AX[6];
          CEN[1] = PA.py + bx * AX[1] + by * AX[4] + bz * AX[7];
          CEN[2] = PA.pz + bx * AX[2] + by * AX[5] + bz * AX[8];
          /* The part's sphere (half diagonal rho) is a bound on the box:
           * a link that clears the sphere by the reach clears the box, and
           * segmentBox would only say so forty rounds later. SPHERE_SLACK_M
           * keeps rounding from ever skipping a box segmentBox would cut. */
          const clear = H.rho[j] + reach + SPHERE_SLACK_M;
          if (pointSegment2(CEN, P, Q) > clear * clear) {
            continue;
          }
          HALF[0] = H.hx[j];
          HALF[1] = H.hy[j];
          HALF[2] = H.hz[j];
          segmentBox(P, Q, CEN, AX, HALF, SB);
          if (SB.d < reach) {
            return {
              tc: ts,
              link: k,
              part: j,
              d: SB.d,
              p: [P[0] + (Q[0] - P[0]) * SB.u, P[1] + (Q[1] - P[1]) * SB.u, P[2] + (Q[2] - P[2]) * SB.u],
            };
          }
        }
      }
    }
  }
  return null;
}
