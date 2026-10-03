/*
 * contact.js: where a scripted attacker of the war mode first meets a
 * structure (src/share/war/damage.js's chunks: the dam's targets and the
 * right bank switchyard's equipment). Its warhead goes off there, never
 * past it: a Striker's last leg into the switchyard comes down at about
 * 6 degrees onto the middle of the transformer rows, and flew through
 * tanks and bushings for up to 27 m before it reached its aim point (the
 * owner, 2026-10-03: "shahed should have exploded by now").
 *
 * Pure, as wires.js is: the room (edge/rooms/war.js) finds the contact at
 * an attacker's birth and puts its room ms in the birth record (`meet`);
 * routes.js planAgent ends the flight there ('arrive'), so every client
 * draws it to the same point, the room's warhead goes off there and a
 * replay stops it there. A birth record without `meet` (a game recorded
 * before it) flies on to its aim point as it did.
 *
 * The structure is the one as built: a chunk broken before the attacker
 * gets there still stops it. The room decides at birth, and a birth
 * record carries one number, not the match's damage as it will be.
 *
 * THE TEST. The plan is sampled every SAMPLE_MS and each segment between
 * two samples is cut against every chunk's box grown by CONTACT_M on
 * every side (slabs in the box's frame), the earliest entry winning; the
 * room ms is floored to the millisecond, so the pose drawn there is at
 * most a millisecond's flight into the grown box. Only + - * /, on
 * numbers routes.js computes the same way on every engine (CLAUDE.md,
 * determinism).
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

import { poseAt } from './routes.js';
import ITAIPU from './itaipu-chunks.js';

/* The structures each map's attackers can meet (scripts/war-targets.js
 * writes Itaipu's). */
const MAPS = { itaipu: ITAIPU };

/* How far from a chunk's box the attacker's centre meets it: half a
 * Shahed class Striker's 2.5 m span, the largest airframe that flies a
 * script. A smaller one goes off up to a metre short of the box. */
export const CONTACT_M = 1.25;
export const SAMPLE_MS = 50;

/* Each chunk's box in a form the test reads, and each structure's
 * axis-aligned bounds, grown by CONTACT_M: built once per map. */
const BOXES = new Map();
function boxesOf(map) {
  let out = BOXES.get(map);
  if (out) {
    return out;
  }
  out = [];
  for (const [id, s] of Object.entries(MAPS[map] ?? {})) {
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    const boxes = s.chunks.map((ch, i) => {
      const e = ch.e;
      const ax = [
        [e[0], e[1], e[2]],
        [e[3], e[4], e[5]],
        [e[1] * e[5] - e[2] * e[4], e[2] * e[3] - e[0] * e[5], e[0] * e[4] - e[1] * e[3]],
      ];
      const h = ch.h.map((v) => v + CONTACT_M);
      for (let j = 0; j < 3; j += 1) {
        /* The box's half reach along world axis j. */
        const r = (ax[0][j] < 0 ? -ax[0][j] : ax[0][j]) * h[0]
          + (ax[1][j] < 0 ? -ax[1][j] : ax[1][j]) * h[1]
          + (ax[2][j] < 0 ? -ax[2][j] : ax[2][j]) * h[2];
        lo[j] = Math.min(lo[j], ch.c[j] - r);
        hi[j] = Math.max(hi[j], ch.c[j] + r);
      }
      return { i, c: ch.c, ax, h };
    });
    out.push({ id, lo, hi, boxes });
  }
  BOXES.set(map, out);
  return out;
}

/* Where along the segment a to b (0 at a, 1 at b) it first enters box
 * bx, or null. */
function entry(a, b, bx) {
  let lo = 0;
  let hi = 1;
  for (let j = 0; j < 3; j += 1) {
    const u = bx.ax[j];
    const p = (a[0] - bx.c[0]) * u[0] + (a[1] - bx.c[1]) * u[1] + (a[2] - bx.c[2]) * u[2];
    const d = (b[0] - a[0]) * u[0] + (b[1] - a[1]) * u[1] + (b[2] - a[2]) * u[2];
    const h = bx.h[j];
    if (d === 0) {
      if (p < -h || p > h) {
        return null;
      }
      continue;
    }
    let s0 = (-h - p) / d;
    let s1 = (h - p) / d;
    if (s0 > s1) {
      const s = s0;
      s0 = s1;
      s1 = s;
    }
    lo = s0 > lo ? s0 : lo;
    hi = s1 < hi ? s1 : hi;
    if (lo > hi) {
      return null;
    }
  }
  return lo;
}

/*
 * The first contact of a planned attacker (routes.js planAgent) with a
 * structure of `map`: { t (room ms, whole), target, chunk }, or null when
 * its flight meets none before it ends. A plan that never ends (a
 * jammer's park, a hunter's steer) has none.
 */
export function contactAt(map, plan) {
  if (!Number.isFinite(plan.tEnd)) {
    return null;
  }
  const structures = boxesOf(map);
  if (!structures.length) {
    return null;
  }
  const end = plan.tEnd;
  let a = poseAt(plan, plan.t0).p.slice();
  for (let t0 = plan.t0; t0 < end; t0 += SAMPLE_MS) {
    const t1 = t0 + SAMPLE_MS < end ? t0 + SAMPLE_MS : end;
    const b = poseAt(plan, t1).p.slice();
    let best = null;
    for (const s of structures) {
      if (Math.max(a[0], b[0]) < s.lo[0] || Math.min(a[0], b[0]) > s.hi[0]
        || Math.max(a[1], b[1]) < s.lo[1] || Math.min(a[1], b[1]) > s.hi[1]
        || Math.max(a[2], b[2]) < s.lo[2] || Math.min(a[2], b[2]) > s.hi[2]) {
        continue;
      }
      for (const bx of s.boxes) {
        const e = entry(a, b, bx);
        if (e !== null && (!best || e < best.e)) {
          best = { e, target: s.id, chunk: bx.i };
        }
      }
    }
    if (best) {
      return { t: Math.floor(t0 + (t1 - t0) * best.e), target: best.target, chunk: best.chunk };
    }
    a = b;
  }
  return null;
}
