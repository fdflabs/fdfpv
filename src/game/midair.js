/*
 * midair.js: the rule that decides whether two aircraft in a room met in
 * the air, and what a pilot's plant does about it when they did.
 * docs/MULTIPLAYER-PLAN.md section 6.
 *
 * ONE DECISION, IN ONE PLACE. The room (edge/rooms/referee.js) holds every
 * seat's POSE samples (src/share/roomwire.js) on the room clock and runs
 * judge() over the newest span both of a pair cover. It sends one `hit` to
 * both, so both screens agree by construction; the rule runs in one
 * engine, so no two engines have to agree on its arithmetic, and the same
 * module runs in the Node harnesses (scripts/midair-harness.js,
 * scripts/midair-plant.js).
 *
 * THE RULE. Each aircraft is its crash part boxes (configs/hulls.js, read
 * out of the module the crash physics runs in, so a wing is met where the
 * plant would break it, and fitted to the drawn machine where the plant's
 * box stands off it, configs/hullfit.js; a folding prop is not there
 * while its motor is stopped). Both poses are interpolated between their
 * bracketing 30 Hz samples (position linear, attitude nlerp, as
 * src/game/peer.js draws them), stepped on the whole room millisecond, and
 * at each step every part box of one is tested against every part box of
 * the other with the separating axis test. The first millisecond where
 * some pair of boxes overlaps by more than MARGIN_M on every axis is the
 * contact. No trigonometry anywhere: a quaternion to a matrix is multiply
 * and add.
 *
 * MARGIN_M is a penetration, not a shrink. The plan's "each box shrunk by
 * 5 cm" would erase a five inch's every part (its frame box is 38 mm
 * wide) and a quad could never be hit. What the margin has to cover is the
 * gap between the interpolated path and the true one, a.dt^2/8 between
 * 30 Hz samples: 7 mm at 5 g, 14 mm for a quad at 10 g. 2 cm covers both.
 *
 * WHAT A HIT CARRIES TO EACH SIDE, in that side's own plant body frame
 * (x forward, y left, z up, metres): the part it was struck on, the
 * material of the part that struck it, the contact point as an arm from
 * its CG, the contact normal out of the other aircraft into it, and its
 * velocity relative to the pair's centre of mass. The hit arrives 100 to
 * 200 ms after the contact (section 6.4) and the pilot has flown on, so
 * contactFor() rotates all three by the aircraft's attitude NOW: the hit
 * lands where the aircraft is, with the geometry and the closing speed of
 * the moment it happened. The surface velocity handed to the plant is the
 * aircraft's own velocity less that relative velocity, which is the
 * pair's centre of mass velocity when the pilot has not changed course
 * since, and in every case gives the plant exactly the closing speed of
 * the true contact (section 6.3: an infinitely heavy surface moving with
 * the centre of mass hits A as hard as B really would along the normal).
 *
 * The plant side is multiply and add on numbers that came off the
 * network; the shell makes the two module calls through the replay
 * journal (src/replay/journal.js), which records their exact doubles, so
 * a replay of a flight in a room is bit identical without the network
 * (section 6.7). A flight that never receives a hit never calls them.
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

import { HULLS } from '../../configs/hulls.js';
import { airframeHull, bodyAxes, THREE_BODY } from './airframehull.js';
import { FLAG_AIRBORNE, FLAG_CRASHED, FLAG_SPAWNING } from '../share/roomwire.js';
import { PARTS_MAX, SURFACE } from '../../configs/parts.js';

/* A seat whose samples lag the room clock by more than this is not waited
 * for: what it has not covered by then is judged as no contact. */
export const LATE_MS = 400;
/* How far two boxes must overlap, on every axis, to count. */
export const MARGIN_M = 0.02;
/* Two samples further apart than this bracket nothing: a stall, a
 * reconnect or a paused tab is an interval nobody knows, so no contact. */
export const GAP_MS = 250;
/* After a hit the pair is left alone this long, sample time: its two
 * streams fly on through each other until the hit has reached both plants. */
export const COOLDOWN_MS = 1500;
/* Both on the ground and both slower than this: taxiing wingtips. */
export const TAXI_MPS = 3;
/* How much of a seat's past the room keeps. */
export const KEEP_MS = 2000;
/*
 * BOTH BREAK. The owner's rule is that two aircraft that meet in the air
 * both break. The contact through the plant breaks what its limits say
 * (scripts/midair-plant.js measures it), and a nose to nose meeting of two
 * props, or a wingtip clipped far from the CG, can leave one side with
 * nothing past its limits, since the plant solves each side against an
 * infinitely heavy surface (section 6.3). So at this closing speed or
 * more, each side also breaks off the part it was struck on
 * (sim_part_break, the crash core's own forced break), or the nearest part
 * to the contact when the root was struck. Under it, a formation nudge,
 * the physics alone decides. The one number to change if the owner wants
 * the rule gentler or harsher.
 */
export const BREAK_MPS = 10;

/*
 * CRASH DAMAGE IS ON IN A ROOM THAT JUDGES MID AIRS. applyHit breaks the
 * struck part through sim_part_break, which a plant with crash damage off
 * refuses (SIM_ERR_BAD_STATE), so a pilot who turned damage off bounced
 * off a mid air the other pilot broke in: the both break rule held on one
 * side (scripts/collide-audit-air.js, damage). So the shell flies every
 * room whose referee judges (every room but a friendly one, whose pilots
 * pass through each other) with damage on, as a war already did, and
 * never writes the pilot's own setting, which is theirs again once they
 * leave (src/main.js crashDamageWanted). welcome: the room's, or null.
 */
export function roomForcesDamage(welcome) {
  return Boolean(welcome) && !welcome.friendly;
}

/*
 * Which surface each airframe material is to the plant when it strikes
 * another aircraft (configs/parts.js MATERIALS to SURFACES, the ids
 * sim_contact_at_mat takes). The number that sets a contact's peak force
 * is the surface's stiffness in series with the part's own (crash.c
 * series_k), so each material takes the existing surface whose stiffness
 * is the one crash_parts.h gives that material's parts: foam fuselages
 * are 2e5 N/m, which is the gate's PVC; a carbon frame 5e6, which is
 * wood's; a motor bell or a wire leg is metal. The plan's new
 * SIM_SURF_FOAM and SIM_SURF_CARBON would have carried these same
 * stiffnesses, so they were not added: no ABI change, and dist/sim.wasm
 * is the module single player already flies.
 */
export const MAT_SURFACE = {
  'cf-plate': 'wood',
  'cf-tube': 'wood',
  epo: 'pvc',
  epp: 'pvc',
  'nylon-gf': 'pvc',
  alu: 'metal',
  lipo: 'pvc',
  pc: 'pvc',
  electronics: 'pvc',
  wire: 'metal',
  ply: 'wood',
  balsa: 'wood',
};

/* ---------------------------------------------------------------- hulls */

const hulls = new Map();

/* An airframe's hull in the Three.js body frame the POSE quaternion
 * turns, its mass, and each part's material; null for an id this build
 * does not know. Built once per airframe. */
export function hullFor(airframe) {
  if (hulls.has(airframe)) {
    return hulls.get(airframe);
  }
  const src = Object.prototype.hasOwnProperty.call(HULLS, airframe) ? HULLS[airframe] : null;
  const out = src ? {
    id: airframe,
    mass: src.mass,
    mats: src.parts.map((p) => p.mat),
    kinds: src.parts.map((p) => p.kind),
    /* A prop that folds (configs/hullfit.js) is not there while the
     * pose's motor reads zero (folded()). */
    folds: src.parts.map((p) => p.folds === true),
    boxes: src.parts.map((p) => [p.min, p.max]),
    hull: airframeHull(src.parts.map((p) => ({ boxMin: p.min, boxMax: p.max, cg: [0, 0, 0] })), THREE_BODY, 1),
  } : null;
  hulls.set(airframe, out);
  return out;
}

/* ---------------------------------------------------------- the samples */

/*
 * One seat's samples, oldest first, by room time: decoded POSEs (px..qw
 * scene world, v in m/s, flags). A sample no newer than the newest is
 * dropped: a TCP stream cannot reorder, so it is a reconnect's leftover.
 */
export class Track {
  constructor(keepMs = KEEP_MS) {
    this.s = [];
    this.keep = keepMs;
  }

  push(pose) {
    const last = this.s[this.s.length - 1];
    if (last && pose.t <= last.t) {
      return false;
    }
    this.s.push(pose);
    let drop = 0;
    while (drop < this.s.length - 2 && this.s[drop + 1].t < pose.t - this.keep) {
      drop += 1;
    }
    if (drop) {
      this.s.splice(0, drop);
    }
    return true;
  }

  newest() {
    return this.s.length ? this.s[this.s.length - 1].t : -Infinity;
  }

  /* The index of the sample at or before t whose successor is after it,
   * or -1 when t is not bracketed by two samples GAP_MS or less apart.
   * `from` is where to start looking; the sweep walks forward. */
  bracket(t, from = 0) {
    const s = this.s;
    let i = Math.max(0, Math.min(from, s.length - 2));
    while (i > 0 && s[i].t > t) {
      i -= 1;
    }
    while (i < s.length - 1 && s[i + 1].t < t) {
      i += 1;
    }
    if (i >= s.length - 1 || s[i].t > t || s[i + 1].t < t || s[i + 1].t - s[i].t > GAP_MS) {
      return -1;
    }
    return i;
  }
}

/* The pose at t between samples a and b, into out. */
function lerpPose(a, b, t, out) {
  const span = b.t - a.t;
  const u = span > 0 ? (t - a.t) / span : 0;
  out.px = a.px + (b.px - a.px) * u;
  out.py = a.py + (b.py - a.py) * u;
  out.pz = a.pz + (b.pz - a.pz) * u;
  out.vx = a.vx + (b.vx - a.vx) * u;
  out.vy = a.vy + (b.vy - a.vy) * u;
  out.vz = a.vz + (b.vz - a.vz) * u;
  const sg = a.qx * b.qx + a.qy * b.qy + a.qz * b.qz + a.qw * b.qw < 0 ? -1 : 1;
  const x = a.qx + (b.qx * sg - a.qx) * u;
  const y = a.qy + (b.qy * sg - a.qy) * u;
  const z = a.qz + (b.qz * sg - a.qz) * u;
  const w = a.qw + (b.qw * sg - a.qw) * u;
  const n = Math.sqrt(x * x + y * y + z * z + w * w) || 1;
  out.qx = x / n;
  out.qy = y / n;
  out.qz = z / n;
  out.qw = w / n;
  out.flags = a.flags | b.flags;
  /* Turning if either sample says so: a prop is left out only once both
   * say it has stopped. A pose without one (a harness's) is turning. */
  out.motor = Math.max(a.motor ?? 1, b.motor ?? 1);
  return out;
}

/* The pose at room time t, or null when the track does not cover it. */
export function poseAt(track, t, out = {}) {
  const i = track.bracket(t);
  return i < 0 ? null : lerpPose(track.s[i], track.s[i + 1], t, out);
}

/* Whether part i of hull h (a hullFor() answer) is folded away at pose
 * p: a folding prop, its motor stopped. */
function folded(h, i, p) {
  return h.folds[i] && p.motor === 0;
}

/* Whether a pose may touch or be touched at all. */
function untouchable(p) {
  return (p.flags & (FLAG_SPAWNING | FLAG_CRASHED)) !== 0;
}

function taxiing(p) {
  return (p.flags & FLAG_AIRBORNE) === 0 && p.vx * p.vx + p.vy * p.vy + p.vz * p.vz < TAXI_MPS * TAXI_MPS;
}

/* --------------------------------------------------- separating axes */

/*
 * One oriented box: centre c[3], axes a[9] (three unit columns), half
 * extents e[3]. Scratch, reused: the rule runs one pair at a time.
 */
function box() {
  return { c: new Float64Array(3), a: new Float64Array(9), e: new Float64Array(3) };
}

/* Every part's centre, world, for a pose with body axes ax, into c. */
function partCentres(h, ax, p, c) {
  for (let i = 0; i < h.n; i += 1) {
    const bx = h.cx[i];
    const by = h.cy[i];
    const bz = h.cz[i];
    c[i * 3] = p.px + bx * ax[0] + by * ax[3] + bz * ax[6];
    c[i * 3 + 1] = p.py + bx * ax[1] + by * ax[4] + bz * ax[7];
    c[i * 3 + 2] = p.pz + bx * ax[2] + by * ax[5] + bz * ax[8];
  }
}

/* Part i as an oriented box, its centre from c; the axes are the
 * aircraft's, set once per step. */
function placeBox(h, i, c, out) {
  out.c[0] = c[i * 3];
  out.c[1] = c[i * 3 + 1];
  out.c[2] = c[i * 3 + 2];
  out.e[0] = h.hx[i];
  out.e[1] = h.hy[i];
  out.e[2] = h.hz[i];
  return out;
}

const SAT = { depth: 0, nx: 0, ny: 0, nz: 0 };

/* Overlap of A and B along unit axis (lx, ly, lz), and keep the least. */
function axisOverlap(A, B, lx, ly, lz, dx, dy, dz) {
  const a = A.a;
  const b = B.a;
  const ra = A.e[0] * Math.abs(a[0] * lx + a[1] * ly + a[2] * lz)
    + A.e[1] * Math.abs(a[3] * lx + a[4] * ly + a[5] * lz)
    + A.e[2] * Math.abs(a[6] * lx + a[7] * ly + a[8] * lz);
  const rb = B.e[0] * Math.abs(b[0] * lx + b[1] * ly + b[2] * lz)
    + B.e[1] * Math.abs(b[3] * lx + b[4] * ly + b[5] * lz)
    + B.e[2] * Math.abs(b[6] * lx + b[7] * ly + b[8] * lz);
  const d = dx * lx + dy * ly + dz * lz;
  const o = ra + rb - Math.abs(d);
  if (o < SAT.depth) {
    SAT.depth = o;
    /* Oriented from B toward A: d is A's centre less B's along the axis. */
    const s = d < 0 ? -1 : 1;
    SAT.nx = lx * s;
    SAT.ny = ly * s;
    SAT.nz = lz * s;
  }
  return o;
}

/*
 * The separating axis test on two oriented boxes: true with the least
 * overlap over the fifteen axes in SAT (depth, and the axis from B toward
 * A) when every axis overlaps by more than `need`; false as soon as one
 * does not.
 */
function overlapBoxes(A, B, need) {
  const dx = A.c[0] - B.c[0];
  const dy = A.c[1] - B.c[1];
  const dz = A.c[2] - B.c[2];
  SAT.depth = Infinity;
  for (let k = 0; k < 3; k += 1) {
    if (axisOverlap(A, B, A.a[k * 3], A.a[k * 3 + 1], A.a[k * 3 + 2], dx, dy, dz) <= need) {
      return false;
    }
    if (axisOverlap(A, B, B.a[k * 3], B.a[k * 3 + 1], B.a[k * 3 + 2], dx, dy, dz) <= need) {
      return false;
    }
  }
  for (let i = 0; i < 3; i += 1) {
    const ax = A.a[i * 3];
    const ay = A.a[i * 3 + 1];
    const az = A.a[i * 3 + 2];
    for (let j = 0; j < 3; j += 1) {
      const bx = B.a[j * 3];
      const by = B.a[j * 3 + 1];
      const bz = B.a[j * 3 + 2];
      let lx = ay * bz - az * by;
      let ly = az * bx - ax * bz;
      let lz = ax * by - ay * bx;
      const n = Math.sqrt(lx * lx + ly * ly + lz * lz);
      /* Parallel edges: the face axes already decided it. */
      if (n < 1e-6) {
        continue;
      }
      lx /= n;
      ly /= n;
      lz /= n;
      if (axisOverlap(A, B, lx, ly, lz, dx, dy, dz) <= need) {
        return false;
      }
    }
  }
  return true;
}

/* The point of box X nearest the world point (px, py, pz), into out. */
function nearestOnBox(X, px, py, pz, out, at) {
  const dx = px - X.c[0];
  const dy = py - X.c[1];
  const dz = pz - X.c[2];
  let x = X.c[0];
  let y = X.c[1];
  let z = X.c[2];
  for (let k = 0; k < 3; k += 1) {
    const ux = X.a[k * 3];
    const uy = X.a[k * 3 + 1];
    const uz = X.a[k * 3 + 2];
    const e = X.e[k];
    const d = Math.max(-e, Math.min(e, dx * ux + dy * uy + dz * uz));
    x += ux * d;
    y += uy * d;
    z += uz * d;
  }
  out[at] = x;
  out[at + 1] = y;
  out[at + 2] = z;
}

/* ---------------------------------------------------------- the judge */

const PA = {};
const PB = {};
const BOXA = box();
const BOXB = box();
const CA = new Float64Array(3 * PARTS_MAX);
const CB = new Float64Array(3 * PARTS_MAX);
const CP = new Float64Array(6);

/*
 * Judge one pair over the room milliseconds (t0, t1], whole ms. hA, hB
 * are hullFor() answers, tA, tB their Tracks; margin is MARGIN_M but for
 * the harness's truth. Returns the first contact, or null:
 *
 *   { tc, partA, partB, depth,
 *     n: [3]  world, from B toward A, unit (approachNormal)
 *     p: [3]  world, the contact point
 *     pa, pb  that pose of each at tc: { px..qw, vx..vz } }
 *
 * The broadphase is a sphere per aircraft round its whole hull, grown by
 * its travel over the span; almost every span stops there.
 */
export function judge(hA, hB, tA, tB, t0, t1, margin = MARGIN_M) {
  const first = Math.floor(t0) + 1;
  const last = Math.floor(t1);
  if (last < first || !hA || !hB) {
    return null;
  }
  const A = hA.hull;
  const B = hB.hull;
  const reach = A.reach + B.reach;
  /* The coarse test on the span's two ends, each grown by what either
   * could travel in it at the fastest either sample says. */
  const a0 = poseAt(tA, first, PA);
  const b0 = poseAt(tB, first, PB);
  if (a0 && b0) {
    const va = Math.sqrt(a0.vx * a0.vx + a0.vy * a0.vy + a0.vz * a0.vz);
    const vb = Math.sqrt(b0.vx * b0.vx + b0.vy * b0.vy + b0.vz * b0.vz);
    /* A factor of two on the sampled speeds covers a sample's speed being
     * behind its motion; the span is at most a few tens of ms. */
    const grow = 2 * (va + vb) * (last - first) / 1000 + 1;
    const dx = a0.px - b0.px;
    const dy = a0.py - b0.py;
    const dz = a0.pz - b0.pz;
    if (dx * dx + dy * dy + dz * dz > (reach + grow) * (reach + grow)) {
      return null;
    }
  }
  let ia = 0;
  let ib = 0;
  for (let t = first; t <= last; t += 1) {
    const ja = tA.bracket(t, ia);
    const jb = tB.bracket(t, ib);
    if (ja < 0 || jb < 0) {
      continue;
    }
    ia = ja;
    ib = jb;
    const pa = lerpPose(tA.s[ja], tA.s[ja + 1], t, PA);
    const pb = lerpPose(tB.s[jb], tB.s[jb + 1], t, PB);
    if (untouchable(pa) || untouchable(pb) || (taxiing(pa) && taxiing(pb))) {
      continue;
    }
    const dx = pa.px - pb.px;
    const dy = pa.py - pb.py;
    const dz = pa.pz - pb.pz;
    if (dx * dx + dy * dy + dz * dz > reach * reach) {
      continue;
    }
    bodyAxes(pa.qx, pa.qy, pa.qz, pa.qw, BOXA.a);
    bodyAxes(pb.qx, pb.qy, pb.qz, pb.qw, BOXB.a);
    partCentres(A, BOXA.a, pa, CA);
    partCentres(B, BOXB.a, pb, CB);
    let best = null;
    for (let i = 0; i < A.n; i += 1) {
      if (folded(hA, i, pa)) {
        continue;
      }
      for (let j = 0; j < B.n; j += 1) {
        if (folded(hB, j, pb)) {
          continue;
        }
        const rr = A.rho[i] + B.rho[j];
        const ex = CA[i * 3] - CB[j * 3];
        const ey = CA[i * 3 + 1] - CB[j * 3 + 1];
        const ez = CA[i * 3 + 2] - CB[j * 3 + 2];
        if (ex * ex + ey * ey + ez * ez > rr * rr) {
          continue;
        }
        placeBox(A, i, CA, BOXA);
        placeBox(B, j, CB, BOXB);
        if (!overlapBoxes(BOXA, BOXB, margin)) {
          continue;
        }
        /* The deepest pair of parts at this millisecond; the first found
         * on a tie, in table order, so the answer is one answer. */
        if (!best || SAT.depth > best.depth) {
          nearestOnBox(BOXA, BOXB.c[0], BOXB.c[1], BOXB.c[2], CP, 0);
          nearestOnBox(BOXB, BOXA.c[0], BOXA.c[1], BOXA.c[2], CP, 3);
          best = {
            tc: t,
            partA: i,
            partB: j,
            depth: SAT.depth,
            n: [SAT.nx, SAT.ny, SAT.nz],
            p: [(CP[0] + CP[3]) / 2, (CP[1] + CP[4]) / 2, (CP[2] + CP[5]) / 2],
          };
        }
      }
    }
    if (best) {
      best.pa = { ...pa };
      best.pb = { ...pb };
      approachNormal(A, B, tA, tB, t - 1, best);
      return best;
    }
  }
  return null;
}

/*
 * How far the nearest part box of hull h (a hullFor() answer) posed at p
 * is from the world point (x, y, z), metres, 0 inside one.
 */
export function hullDistance(h, p, x, y, z) {
  const H = h.hull;
  bodyAxes(p.qx, p.qy, p.qz, p.qw, BOXB.a);
  partCentres(H, BOXB.a, p, CB);
  let best = Infinity;
  for (let i = 0; i < H.n; i += 1) {
    if (folded(h, i, p)) {
      continue;
    }
    const ex = CB[i * 3] - x;
    const ey = CB[i * 3 + 1] - y;
    const ez = CB[i * 3 + 2] - z;
    const far = best + H.rho[i];
    if (ex * ex + ey * ey + ez * ez > far * far) {
      continue;
    }
    placeBox(H, i, CB, BOXB);
    nearestOnBox(BOXB, x, y, z, CP, 0);
    best = Math.min(best, Math.hypot(CP[0] - x, CP[1] - y, CP[2] - z));
  }
  return best;
}

/*
 * The bubble rule (a tag, edge/rooms/tag.js): the first room millisecond
 * in (t0, t1] at which some part box of B comes within r metres of A's
 * centre, the point its pose carries, or null: { tc, d } with d that
 * distance. The poses, the untouchable flags and the taxiing pair are
 * judge()'s, so only the distance is new.
 */
export function within(hA, hB, tA, tB, t0, t1, r) {
  const first = Math.floor(t0) + 1;
  const last = Math.floor(t1);
  if (last < first || !hA || !hB) {
    return null;
  }
  const reach = r + hB.hull.reach;
  const a0 = poseAt(tA, first, PA);
  const b0 = poseAt(tB, first, PB);
  if (a0 && b0) {
    const va = Math.sqrt(a0.vx * a0.vx + a0.vy * a0.vy + a0.vz * a0.vz);
    const vb = Math.sqrt(b0.vx * b0.vx + b0.vy * b0.vy + b0.vz * b0.vz);
    const grow = 2 * (va + vb) * (last - first) / 1000 + 1;
    const dx = a0.px - b0.px;
    const dy = a0.py - b0.py;
    const dz = a0.pz - b0.pz;
    if (dx * dx + dy * dy + dz * dz > (reach + grow) * (reach + grow)) {
      return null;
    }
  }
  let ia = 0;
  let ib = 0;
  for (let t = first; t <= last; t += 1) {
    const ja = tA.bracket(t, ia);
    const jb = tB.bracket(t, ib);
    if (ja < 0 || jb < 0) {
      continue;
    }
    ia = ja;
    ib = jb;
    const pa = lerpPose(tA.s[ja], tA.s[ja + 1], t, PA);
    const pb = lerpPose(tB.s[jb], tB.s[jb + 1], t, PB);
    if (untouchable(pa) || untouchable(pb) || (taxiing(pa) && taxiing(pb))) {
      continue;
    }
    const dx = pa.px - pb.px;
    const dy = pa.py - pb.py;
    const dz = pa.pz - pb.pz;
    if (dx * dx + dy * dy + dz * dz > reach * reach) {
      continue;
    }
    const d = hullDistance(hB, pb, pa.px, pa.py, pa.pz);
    if (d <= r) {
      return { tc: t, d };
    }
  }
  return null;
}

/*
 * THE NORMAL IS THE AXIS THAT WAS CROSSED. The least overlap axis at the
 * first millisecond of contact is the textbook normal for boxes that met
 * slowly; at 16 m/s closing two five inch motors 26 mm tall go 16 mm into
 * each other in a millisecond, so the least overlap is often their height
 * and the normal came out vertical, square to the closing velocity, and
 * both plants were handed a contact with nothing to stop. So the normal is
 * the axis that separated the two parts a millisecond before (the one they
 * were furthest apart on), oriented from B toward A. Only when the
 * millisecond before is not covered does the least overlap one stand.
 */
function approachNormal(A, B, tA, tB, t, best) {
  const pa = poseAt(tA, t, PA);
  const pb = poseAt(tB, t, PB);
  if (!pa || !pb) {
    return;
  }
  bodyAxes(pa.qx, pa.qy, pa.qz, pa.qw, BOXA.a);
  bodyAxes(pb.qx, pb.qy, pb.qz, pb.qw, BOXB.a);
  partCentres(A, BOXA.a, pa, CA);
  partCentres(B, BOXB.a, pb, CB);
  placeBox(A, best.partA, CA, BOXA);
  placeBox(B, best.partB, CB, BOXB);
  overlapBoxes(BOXA, BOXB, -Infinity);
  best.n = [SAT.nx, SAT.ny, SAT.nz];
}

/* ------------------------------------------------------- one side's hit */

/* A world vector into the body frame of a pose (axes ax), then from the
 * Three.js body axes to the plant's (x forward, y left, z up): x = -z3,
 * y = -x3, z = y3 (src/render/frame.js threeDirToSim). */
function toPlantBody(ax, x, y, z) {
  const b0 = ax[0] * x + ax[1] * y + ax[2] * z;
  const b1 = ax[3] * x + ax[4] * y + ax[5] * z;
  const b2 = ax[6] * x + ax[7] * y + ax[8] * z;
  return [-b2, -b0, b1];
}

/*
 * The hit message for a contact between seats a and b (hA, hB their
 * hullFor answers), as the room sends it:
 *
 *   { type: 'hit', id, tc, a, b, n, p, va, vb, ma, mb,
 *     A: side, B: side }
 *
 * n, p, va, vb world (the scene's, y up), for drawing and for the checks;
 * a side is what one pilot's plant needs, in its own plant body frame:
 *   { seat, part, brk, mat, arm: [3], n: [3], dv: [3] }
 * mat is the material of the OTHER aircraft's part, the surface it met;
 * brk the part it breaks off at BREAK_MPS or more, -1 under it.
 */
export function hitMessage(id, c, a, b, hA, hB) {
  const ma = hA.mass;
  const mb = hB.mass;
  const pa = c.pa;
  const pb = c.pb;
  const kA = mb / (ma + mb);
  const kB = ma / (ma + mb);
  const rvx = pa.vx - pb.vx;
  const rvy = pa.vy - pb.vy;
  const rvz = pa.vz - pb.vz;
  const axA = bodyAxes(pa.qx, pa.qy, pa.qz, pa.qw, new Float64Array(9));
  const axB = bodyAxes(pb.qx, pb.qy, pb.qz, pb.qw, new Float64Array(9));
  const [nx, ny, nz] = c.n;
  const [px, py, pz] = c.p;
  const round = (v) => Math.round(v * 1e6) / 1e6;
  const r3 = (v) => v.map(round);
  const hard = rvx * rvx + rvy * rvy + rvz * rvz >= BREAK_MPS * BREAK_MPS;
  const armA = r3(toPlantBody(axA, px - pa.px, py - pa.py, pz - pa.pz));
  const armB = r3(toPlantBody(axB, px - pb.px, py - pb.py, pz - pb.pz));
  return {
    type: 'hit',
    id,
    tc: c.tc,
    a,
    b,
    n: r3(c.n),
    p: r3(c.p),
    va: r3([pa.vx, pa.vy, pa.vz]),
    vb: r3([pb.vx, pb.vy, pb.vz]),
    ma: round(ma),
    mb: round(mb),
    A: {
      seat: a,
      part: c.partA,
      brk: hard ? partToBreak(hA, c.partA, armA) : -1,
      mat: hB.mats[c.partB],
      arm: armA,
      n: r3(toPlantBody(axA, nx, ny, nz)),
      dv: r3(toPlantBody(axA, rvx * kA, rvy * kA, rvz * kA)),
    },
    B: {
      seat: b,
      part: c.partB,
      brk: hard ? partToBreak(hB, c.partB, armB) : -1,
      mat: hA.mats[c.partA],
      arm: armB,
      n: r3(toPlantBody(axB, -nx, -ny, -nz)),
      dv: r3(toPlantBody(axB, -rvx * kB, -rvy * kB, -rvz * kB)),
    },
  };
}

/* The part a side breaks: the one struck, or, when that is the root
 * (which never leaves), the part whose box is nearest the contact. The
 * box distance is in the plant body frame, the arm's. */
function partToBreak(h, part, arm) {
  if (part > 0) {
    return part;
  }
  let best = -1;
  let bestD = Infinity;
  for (let i = 1; i < h.boxes.length; i += 1) {
    const [lo, hi] = h.boxes[i];
    let d = 0;
    for (let k = 0; k < 3; k += 1) {
      const out = Math.max(lo[k] - arm[k], 0, arm[k] - hi[k]);
      d += out * out;
    }
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/* The side of a hit that is this seat's, or null. */
export function sideFor(hit, seat) {
  if (hit && hit.A && hit.A.seat === seat) {
    return hit.A;
  }
  if (hit && hit.B && hit.B.seat === seat) {
    return hit.B;
  }
  return null;
}

/*
 * What to hand the plant for one side of a hit, from the plant's state
 * block now (sim_state: position at 1..3, velocity at 4..6, attitude w x
 * y z at 7..10, plant frame). Returns the arguments of
 * sim_contact_at_mat after `mat`, in the plant's world frame:
 *   { n: [3], p: [3], vs: [3], r: [3] }
 * Multiply and add only (CLAUDE.md, determinism): the attitude now turns
 * the side's body vectors into the world.
 */
export function contactFor(side, st) {
  const w = st[7];
  const x = st[8];
  const y = st[9];
  const z = st[10];
  const r00 = 1 - 2 * (y * y + z * z);
  const r01 = 2 * (x * y - w * z);
  const r02 = 2 * (x * z + w * y);
  const r10 = 2 * (x * y + w * z);
  const r11 = 1 - 2 * (x * x + z * z);
  const r12 = 2 * (y * z - w * x);
  const r20 = 2 * (x * z - w * y);
  const r21 = 2 * (y * z + w * x);
  const r22 = 1 - 2 * (x * x + y * y);
  const rot = (v) => [
    r00 * v[0] + r01 * v[1] + r02 * v[2],
    r10 * v[0] + r11 * v[1] + r12 * v[2],
    r20 * v[0] + r21 * v[1] + r22 * v[2],
  ];
  const n = rot(side.n);
  const nl = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]) || 1;
  const dv = rot(side.dv);
  return {
    n: [n[0] / nl, n[1] / nl, n[2] / nl],
    p: [st[1], st[2], st[3]],
    vs: [st[4] - dv[0], st[5] - dv[1], st[6] - dv[2]],
    r: rot(side.arm),
  };
}

/*
 * Apply one side of a hit to a plant now: `e` the module's exports (the
 * shell's are the replay journal's, so the calls are recorded), `st` its
 * sim_state block now. The contact through the damage mode, then the
 * owner's both break rule. Returns the module's answers.
 */
export function applyHit(e, side, st) {
  const c = contactFor(side, st);
  e.sim_contact_part(side.part);
  const rc = e.sim_contact_at_mat(c.n[0], c.n[1], c.n[2], SURFACE[MAT_SURFACE[side.mat]],
    c.p[0], c.p[1], c.p[2], c.vs[0], c.vs[1], c.vs[2], c.r[0], c.r[1], c.r[2]);
  /* SIM_ERR_BAD_STATE with the damage mode off: a pilot who turned crash
   * damage off bounces, and nothing breaks. */
  const brk = side.brk > 0 ? e.sim_part_break(side.brk) : null;
  return { rc, brk, contact: c };
}

/* Whether a hit message has the shape a client can act on: every number
 * finite, the parts whole numbers, the materials known. The room is the
 * only sender, but a client validates at its boundary all the same. */
export function checkHit(m) {
  const v3 = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
  const side = (s) => s && Number.isInteger(s.seat) && Number.isInteger(s.part) && s.part >= 0
    && Number.isInteger(s.brk) && s.brk >= -1 && s.brk < PARTS_MAX
    && Object.prototype.hasOwnProperty.call(MAT_SURFACE, s.mat) && v3(s.arm) && v3(s.n) && v3(s.dv);
  return Boolean(m && m.type === 'hit' && Number.isFinite(m.tc) && Number.isInteger(m.id)
    && v3(m.n) && v3(m.p) && v3(m.va) && v3(m.vb) && side(m.A) && side(m.B));
}
