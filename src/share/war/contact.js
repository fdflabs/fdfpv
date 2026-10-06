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
 * A spillway gate's leaf is met where it stands when the attacker gets
 * there: its chunks (`m`, frame.hinge) turned on their trunnions to the
 * opening the match's gate state (`gates`, src/share/war/hoist.js
 * openAt) gives at that room ms, as the room's warhead takes them
 * (damage.js blast). The state is the one known at birth: a gate the
 * stage moves later than that is met where the earlier state had it.
 *
 * THE TEST. The plan is sampled every SAMPLE_MS and each segment between
 * two samples is cut against every chunk's box grown by CONTACT_M on
 * every side (slabs in the box's frame), the earliest entry winning; the
 * room ms is floored to the millisecond, so the pose drawn there is at
 * most a millisecond's flight into the grown box. Only + - * /, on
 * numbers routes.js computes the same way on every engine (CLAUDE.md,
 * determinism).
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

import { openAt } from './hoist.js';
import { leafTurn, turnPoint, unturn } from './leaf.js';
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
/* The plan cells the structures are filed in, metres: a segment looks
 * only at the structures in the cells its bounds touch. */
const CELL = 64;
/* A leaf's swing, for its structure's bounds: every LEAF_STEP_M of its
 * lip's travel from shut to its hinge's max. */
const LEAF_STEP_M = 0.5;

/* Each chunk's box in a form the test reads, each structure's
 * axis-aligned bounds (a leaf's whole swing in them) grown by CONTACT_M,
 * and the cells each structure's bounds touch: built once per map. The
 * bounds and cells only skip what cannot be met, so they change no
 * answer. */
const BOXES = new Map();
function boxesOf(map) {
  let out = BOXES.get(map);
  if (out) {
    return out;
  }
  const list = [];
  for (const [id, s] of Object.entries(MAPS[map] ?? {})) {
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    const hinge = s.frame.hinge ?? null;
    const turns = [];
    if (hinge) {
      for (let o = 0; o < hinge.max; o += LEAF_STEP_M) {
        turns.push(leafTurn(hinge, o));
      }
      turns.push(leafTurn(hinge, hinge.max));
    }
    const boxes = s.chunks.map((ch, i) => {
      const e = ch.e;
      const ax = [
        [e[0], e[1], e[2]],
        [e[3], e[4], e[5]],
        [e[1] * e[5] - e[2] * e[4], e[2] * e[3] - e[0] * e[5], e[0] * e[4] - e[1] * e[3]],
      ];
      const h = ch.h.map((v) => v + CONTACT_M);
      const moves = Boolean(hinge && ch.m);
      if (moves) {
        /* Every place the leaf takes the box, as spheres about its
         * centre turned. A point at the leaf's radius moves at most 1.3
         * times its lip's travel (where the lip is nearest the top of
         * its arc), so between two steps it is within 0.35 m of one:
         * the slack, 2 LEAF_STEP_M, covers that with room to spare. */
        const r = Math.sqrt(h[0] * h[0] + h[1] * h[1] + h[2] * h[2]) + 2 * LEAF_STEP_M;
        for (const t of turns) {
          const c = turnPoint(hinge, t, ch.c);
          for (let j = 0; j < 3; j += 1) {
            lo[j] = Math.min(lo[j], c[j] - r);
            hi[j] = Math.max(hi[j], c[j] + r);
          }
        }
      } else {
        for (let j = 0; j < 3; j += 1) {
          /* The box's half reach along world axis j. */
          const r = (ax[0][j] < 0 ? -ax[0][j] : ax[0][j]) * h[0]
            + (ax[1][j] < 0 ? -ax[1][j] : ax[1][j]) * h[1]
            + (ax[2][j] < 0 ? -ax[2][j] : ax[2][j]) * h[2];
          lo[j] = Math.min(lo[j], ch.c[j] - r);
          hi[j] = Math.max(hi[j], ch.c[j] + r);
        }
      }
      return {
        i, c: ch.c, ax, h, moves,
      };
    });
    list.push({
      id, k: list.length, hinge, lo, hi, boxes,
    });
  }
  const cells = new Map();
  for (const st of list) {
    for (let i = Math.floor(st.lo[0] / CELL); i <= Math.floor(st.hi[0] / CELL); i += 1) {
      for (let j = Math.floor(st.lo[2] / CELL); j <= Math.floor(st.hi[2] / CELL); j += 1) {
        const key = `${i},${j}`;
        if (!cells.has(key)) {
          cells.set(key, []);
        }
        cells.get(key).push(st);
      }
    }
  }
  out = { list, cells };
  BOXES.set(map, out);
  return out;
}

/* The structures whose cells the bounds of a and b touch, each once, in
 * the order the map lists them. */
function near(cells, a, b) {
  const out = [];
  for (let i = Math.floor(Math.min(a[0], b[0]) / CELL); i <= Math.floor(Math.max(a[0], b[0]) / CELL); i += 1) {
    for (let j = Math.floor(Math.min(a[2], b[2]) / CELL); j <= Math.floor(Math.max(a[2], b[2]) / CELL); j += 1) {
      for (const st of cells.get(`${i},${j}`) ?? []) {
        if (!out.includes(st)) {
          out.push(st);
        }
      }
    }
  }
  return out.sort((x, y) => x.k - y.k);
}

/* Point p taken into a leaf's rest frame, where its chunks are written,
 * the leaf standing as `gates` has it at room ms t. */
function atRest(st, gates, p, t) {
  return turnPoint(st.hinge, unturn(leafTurn(st.hinge, openAt(gates, st.id, t))), p);
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
 * structure of `map`, its gates' leaves standing as `gates` (the match's,
 * null for Free Flight's) has them: { t (room ms, whole), target, chunk },
 * or null when its flight meets none before it ends. A plan that never
 * ends (a jammer's park, a hunter's steer) has none.
 */
export function contactAt(map, plan, gates = null) {
  if (!Number.isFinite(plan.tEnd)) {
    return null;
  }
  const { list, cells } = boxesOf(map);
  if (!list.length) {
    return null;
  }
  const end = plan.tEnd;
  let a = poseAt(plan, plan.t0).p.slice();
  for (let t0 = plan.t0; t0 < end; t0 += SAMPLE_MS) {
    const t1 = t0 + SAMPLE_MS < end ? t0 + SAMPLE_MS : end;
    const b = poseAt(plan, t1).p.slice();
    let best = null;
    for (const s of near(cells, a, b)) {
      if (Math.max(a[0], b[0]) < s.lo[0] || Math.min(a[0], b[0]) > s.hi[0]
        || Math.max(a[1], b[1]) < s.lo[1] || Math.min(a[1], b[1]) > s.hi[1]
        || Math.max(a[2], b[2]) < s.lo[2] || Math.min(a[2], b[2]) > s.hi[2]) {
        continue;
      }
      /* The segment in the leaf's rest frame, each end where the leaf
       * stands then. */
      const ar = s.hinge ? atRest(s, gates, a, t0) : null;
      const br = s.hinge ? atRest(s, gates, b, t1) : null;
      for (const bx of s.boxes) {
        const e = bx.moves ? entry(ar, br, bx) : entry(a, b, bx);
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
