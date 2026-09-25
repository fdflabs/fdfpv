/*
 * airframehull.js: a fixed wing's shape against the world, from its parts.
 *
 * The shell used to meet the world with one hull for every aircraft: the
 * prop discs about the CG, which for a plane (arm 0, a hull radius of its
 * half span) is a disc as wide as the wingspan. A pole or a building
 * corner met that disc about half a metre before the drawn wing did, and
 * the contact point it handed the plant stood in the air ahead of the
 * aircraft: on the Slow Stick and the Bramor nearest the nose, so the Slow
 * Stick lost its motor to a pole its wing should have taken and the Bramor
 * stopped dead at 1357 g (docs/CRASH-STAGE1.md section 3, the wing clip).
 *
 * So a fixed wing is met by its parts: one box per part of the crash
 * core's own table (src/native/crash_parts.h, read back through
 * sim_part_info), the fuselage, each wing panel, the tail surfaces, the
 * prop's disc, in the body frame, moved by the craft's travel. A pole is
 * met by the panel where the panel is, and a part that has broken off is
 * no longer in the shape, which the plant's readback says (sim_parts_state).
 *
 * The travel is a translation at a fixed attitude, as it is for the discs:
 * the shell sweeps every 4 ms of sim time, and the turn in that time is a
 * few millimetres at a wingtip. Against a box (every city wall and roof,
 * the moving train) the sweep is exact: two boxes, one translating, first
 * touch where the last of the fifteen separating axes closes. Against a
 * capsule (a pole, a trunk, a gate member, a crown ball) it is a
 * conservative advance on the exact distance from the capsule's axis to
 * the part's box, which is a convex function of the travel, so the advance
 * never passes the first touch and stops when it grows.
 *
 * Every function here works in whatever right handed frame its caller
 * uses: the shell's Three.js world, or the plant's frame in the crash
 * suite. The hull is built into that frame once (THREE_BODY or
 * PLANT_BODY), and the attitude is given as the body axes in the world.
 * Nothing allocates after airframeHull: collide.js calls this from the
 * contact pass on the sim clock.
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

/*
 * How a plant body vector (x forward, y left, z up) is written in the
 * hull's frame: out[k] = sign[k] * in[from[k]]. The Three.js body frame is
 * src/render/frame.js's permutation (simPosToThree): x = -y, y = z, z = -x.
 */
export const PLANT_BODY = { from: [0, 1, 2], sign: [1, 1, 1] };
export const THREE_BODY = { from: [1, 2, 0], sign: [-1, 1, -1] };

/* The capsule advance stops within this of the surface, world metres. */
const TOUCH_TOL = 1e-4;
/* And gives up after this many steps: only a travel that grazes a solid
 * almost tangentially takes more, and then the gap left is under a
 * millimetre or the travel is going past. */
const ADVANCE_MAX = 40;
const GRAZE_TOL = 1e-3;
/* Vertices this close to the deepest along the normal share the patch,
 * as src/game/collide.js CONTACT_PATCH_BAND does for the discs. */
const PATCH_BAND = 0.015;

/*
 * The hull from a part table (src/game/damage.js table(): each part's
 * hull box, boxMin and boxMax, body frame, plant metres), in `frame`,
 * lengths times `scale` (the world's metres per plant metre). Every part
 * starts on the craft, with the table's CG where the plant's is.
 */
export function airframeHull(table, frame, scale) {
  const n = table.length;
  const hull = {
    n,
    frame,
    scale,
    /* The table's boxes, centre and half extents, in the hull's frame. */
    cx: new Float64Array(n),
    cy: new Float64Array(n),
    cz: new Float64Array(n),
    hx: new Float64Array(n),
    hy: new Float64Array(n),
    hz: new Float64Array(n),
    /* Each box's half diagonal: the sphere a sweep rejects it by first. */
    rho: new Float64Array(n),
    live: new Uint8Array(n).fill(1),
    /* The plant moves its origin to what is left's CG when a part leaves
     * (crash.c, THE LIVE AIRFRAME); a table point is at point - shift in
     * the live body frame. */
    shift: new Float64Array(3),
    reach: 0,
    tableCg0: table.length ? table[0].cg.slice() : [0, 0, 0],
  };
  const c = [0, 0, 0];
  const h = [0, 0, 0];
  for (let i = 0; i < n; i += 1) {
    const p = table[i];
    for (let a = 0; a < 3; a += 1) {
      c[a] = (p.boxMin[a] + p.boxMax[a]) * 0.5 * scale;
      h[a] = (p.boxMax[a] - p.boxMin[a]) * 0.5 * scale;
    }
    hull.cx[i] = frame.sign[0] * c[frame.from[0]];
    hull.cy[i] = frame.sign[1] * c[frame.from[1]];
    hull.cz[i] = frame.sign[2] * c[frame.from[2]];
    hull.hx[i] = h[frame.from[0]];
    hull.hy[i] = h[frame.from[1]];
    hull.hz[i] = h[frame.from[2]];
    hull.rho[i] = Math.sqrt(h[0] * h[0] + h[1] * h[1] + h[2] * h[2]);
  }
  hullReach(hull);
  return hull;
}

/* The farthest any live part reaches from the live CG. */
function hullReach(hull) {
  let reach = 0;
  for (let i = 0; i < hull.n; i += 1) {
    if (!hull.live[i]) {
      continue;
    }
    const x = hull.cx[i] - hull.shift[0];
    const y = hull.cy[i] - hull.shift[1];
    const z = hull.cz[i] - hull.shift[2];
    const r = Math.sqrt(x * x + y * y + z * z) + hull.rho[i];
    if (r > reach) {
      reach = r;
    }
  }
  hull.reach = reach;
}

/* Every part back on, the origin at the table's CG: a reset. */
export function hullIntact(hull) {
  hull.live.fill(1);
  hull.shift.fill(0);
  hullReach(hull);
}

/*
 * What is still on the craft, from the plant's parts state
 * (sim_parts_state: `stride` doubles a part, status at `statusAt`, the
 * part's centre of mass, world, at `posAt`) and the craft's own state
 * block (position at 1..3, attitude w x y z at 7..10, plant frame). The
 * root never leaves, so where its centre is against the craft's origin
 * gives the plant's origin shift. Returns whether anything changed.
 */
export function hullFromPartsState(hull, parts, stride, statusAt, posAt, st) {
  let changed = false;
  for (let i = 0; i < hull.n; i += 1) {
    const on = parts[i * stride + statusAt] === 0 ? 1 : 0;
    if (on !== hull.live[i]) {
      hull.live[i] = on;
      changed = true;
    }
  }
  if (!changed) {
    return false;
  }
  /* Body = R^T world, R from the attitude. */
  const w = st[7];
  const x = st[8];
  const y = st[9];
  const z = st[10];
  const dx = parts[posAt] - st[1];
  const dy = parts[posAt + 1] - st[2];
  const dz = parts[posAt + 2] - st[3];
  const bx = (1 - 2 * (y * y + z * z)) * dx + 2 * (x * y + w * z) * dy + 2 * (x * z - w * y) * dz;
  const by = 2 * (x * y - w * z) * dx + (1 - 2 * (x * x + z * z)) * dy + 2 * (y * z + w * x) * dz;
  const bz = 2 * (x * z + w * y) * dx + 2 * (y * z - w * x) * dy + (1 - 2 * (x * x + y * y)) * dz;
  const g = hull.tableCg0;
  const s = [g[0] - bx, g[1] - by, g[2] - bz];
  const f = hull.frame;
  for (let k = 0; k < 3; k += 1) {
    hull.shift[k] = f.sign[k] * s[f.from[k]] * hull.scale;
  }
  hullReach(hull);
  return true;
}

/*
 * The body axes in the world from an attitude quaternion (x, y, z, w) in
 * the caller's frame, into ax (9 numbers: body x, body y, body z).
 */
export function bodyAxes(qx, qy, qz, qw, ax) {
  const xx = qx * qx;
  const yy = qy * qy;
  const zz = qz * qz;
  const xy = qx * qy;
  const xz = qx * qz;
  const yz = qy * qz;
  const wx = qw * qx;
  const wy = qw * qy;
  const wz = qw * qz;
  ax[0] = 1 - 2 * (yy + zz);
  ax[1] = 2 * (xy + wz);
  ax[2] = 2 * (xz - wy);
  ax[3] = 2 * (xy - wz);
  ax[4] = 1 - 2 * (xx + zz);
  ax[5] = 2 * (yz + wx);
  ax[6] = 2 * (xz + wy);
  ax[7] = 2 * (yz - wx);
  ax[8] = 1 - 2 * (xx + yy);
  return ax;
}

/*
 * One contact's answer, reused: the travel parameter, the unit normal out
 * of the solid toward the part, how far the part is into the solid at
 * that parameter (above 0 only when it started inside), and the contact
 * point, world. `part` is the table index.
 */
export function hullContact() {
  return { t: -1, nx: 0, ny: 0, nz: 0, depth: 0, px: 0, py: 0, pz: 0, part: -1 };
}

/* Scratch, one set for the module: every caller is on the main thread. */
const W = new Float64Array(3);

/* Part i's centre at the travel's start, world, into out. */
export function partCentre(hull, i, ax, px, py, pz, out = W) {
  const bx = hull.cx[i] - hull.shift[0];
  const by = hull.cy[i] - hull.shift[1];
  const bz = hull.cz[i] - hull.shift[2];
  out[0] = px + bx * ax[0] + by * ax[3] + bz * ax[6];
  out[1] = py + bx * ax[1] + by * ax[4] + bz * ax[7];
  out[2] = pz + bx * ax[2] + by * ax[5] + bz * ax[8];
  return out;
}

/*
 * The patch where part i, its centre at (cx, cy, cz), meets a solid whose
 * normal toward the part is n: the centroid of its box corners within
 * PATCH_BAND of the deepest, clamped into the solid's box [lo, hi] if it
 * has one (a wall met by a wingtip is met at the wall's corner, not at mid
 * span), then back onto the part's box. Into out.px..pz.
 */
function patchPoint(hull, i, ax, cx, cy, cz, nx, ny, nz, lo, hi, out) {
  const hx = hull.hx[i];
  const hy = hull.hy[i];
  const hz = hull.hz[i];
  /* Depth of a corner along -n: -(corner . n), the corner as offsets. */
  const ex = hx * (ax[0] * nx + ax[1] * ny + ax[2] * nz);
  const ey = hy * (ax[3] * nx + ax[4] * ny + ax[5] * nz);
  const ez = hz * (ax[6] * nx + ax[7] * ny + ax[8] * nz);
  const deepest = Math.abs(ex) + Math.abs(ey) + Math.abs(ez);
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let m = 0;
  for (let k = 0; k < 8; k += 1) {
    const u = (k & 1) ? 1 : -1;
    const v = (k & 2) ? 1 : -1;
    const w = (k & 4) ? 1 : -1;
    const dep = -(u * ex + v * ey + w * ez);
    if (dep >= deepest - PATCH_BAND) {
      sx += u;
      sy += v;
      sz += w;
      m += 1;
    }
  }
  /* The centroid in the part's own coordinates. */
  let lx = hx * sx / m;
  let ly = hy * sy / m;
  let lz = hz * sz / m;
  let wx = cx + lx * ax[0] + ly * ax[3] + lz * ax[6];
  let wy = cy + lx * ax[1] + ly * ax[4] + lz * ax[7];
  let wz = cz + lx * ax[2] + ly * ax[5] + lz * ax[8];
  if (lo) {
    wx = wx < lo[0] ? lo[0] : wx > hi[0] ? hi[0] : wx;
    wy = wy < lo[1] ? lo[1] : wy > hi[1] ? hi[1] : wy;
    wz = wz < lo[2] ? lo[2] : wz > hi[2] ? hi[2] : wz;
    const rx = wx - cx;
    const ry = wy - cy;
    const rz = wz - cz;
    lx = rx * ax[0] + ry * ax[1] + rz * ax[2];
    ly = rx * ax[3] + ry * ax[4] + rz * ax[5];
    lz = rx * ax[6] + ry * ax[7] + rz * ax[8];
    lx = lx < -hx ? -hx : lx > hx ? hx : lx;
    ly = ly < -hy ? -hy : ly > hy ? hy : ly;
    lz = lz < -hz ? -hz : lz > hz ? hz : lz;
    wx = cx + lx * ax[0] + ly * ax[3] + lz * ax[6];
    wy = cy + lx * ax[1] + ly * ax[4] + lz * ax[7];
    wz = cz + lx * ax[2] + ly * ax[5] + lz * ax[8];
  }
  out.px = wx;
  out.py = wy;
  out.pz = wz;
}

/*
 * Part i, travelling from p by d at the attitude ax, against the box
 * [lo, hi] (world, axis aligned, lo and hi of three each). The earliest
 * parameter in [0, 1] at which they touch, or -1, with out filled.
 *
 * Two convex boxes, one translating: along each candidate axis L (the
 * box's three, the part's three, their nine cross products) the two
 * projections overlap for one interval of t; the boxes touch on the
 * intersection of the fifteen intervals, and first touch is its start,
 * the axis that closed last being the contact normal. Already overlapping
 * at t = 0, the normal is the axis of least overlap and depth is that
 * overlap. Exact, closed form.
 */
const SAT = new Float64Array(45);
export function sweepPartBox(hull, i, ax, px, py, pz, dx, dy, dz, lo, hi, out) {
  partCentre(hull, i, ax, px, py, pz);
  const c0x = W[0];
  const c0y = W[1];
  const c0z = W[2];
  const bx = (lo[0] + hi[0]) * 0.5;
  const by = (lo[1] + hi[1]) * 0.5;
  const bz = (lo[2] + hi[2]) * 0.5;
  const hbx = (hi[0] - lo[0]) * 0.5;
  const hby = (hi[1] - lo[1]) * 0.5;
  const hbz = (hi[2] - lo[2]) * 0.5;
  const hx = hull.hx[i];
  const hy = hull.hy[i];
  const hz = hull.hz[i];
  let n = 0;
  for (let k = 0; k < 3; k += 1) {
    SAT[n] = k === 0 ? 1 : 0;
    SAT[n + 1] = k === 1 ? 1 : 0;
    SAT[n + 2] = k === 2 ? 1 : 0;
    n += 3;
  }
  for (let k = 0; k < 3; k += 1) {
    SAT[n] = ax[3 * k];
    SAT[n + 1] = ax[3 * k + 1];
    SAT[n + 2] = ax[3 * k + 2];
    n += 3;
  }
  for (let a = 0; a < 3; a += 1) {
    for (let k = 0; k < 3; k += 1) {
      /* world axis a cross part axis k */
      const ux = a === 0 ? 1 : 0;
      const uy = a === 1 ? 1 : 0;
      const uz = a === 2 ? 1 : 0;
      const vx = ax[3 * k];
      const vy = ax[3 * k + 1];
      const vz = ax[3 * k + 2];
      SAT[n] = uy * vz - uz * vy;
      SAT[n + 1] = uz * vx - ux * vz;
      SAT[n + 2] = ux * vy - uy * vx;
      n += 3;
    }
  }
  let tIn = -Infinity;
  let tOut = Infinity;
  let inAxis = -1;
  let inSign = 1;
  let minOver = Infinity;
  let minAxis = -1;
  let minSign = 1;
  for (let k = 0; k < 15; k += 1) {
    let lx = SAT[3 * k];
    let ly = SAT[3 * k + 1];
    let lz = SAT[3 * k + 2];
    const l2 = lx * lx + ly * ly + lz * lz;
    /* A cross product of two nearly parallel axes says nothing that the
     * face axes have not. */
    if (l2 < 1e-6) {
      continue;
    }
    const inv = 1 / Math.sqrt(l2);
    lx *= inv;
    ly *= inv;
    lz *= inv;
    const rA = hbx * Math.abs(lx) + hby * Math.abs(ly) + hbz * Math.abs(lz);
    const rB = hx * Math.abs(ax[0] * lx + ax[1] * ly + ax[2] * lz)
      + hy * Math.abs(ax[3] * lx + ax[4] * ly + ax[5] * lz)
      + hz * Math.abs(ax[6] * lx + ax[7] * ly + ax[8] * lz);
    const R = rA + rB;
    const d0 = (c0x - bx) * lx + (c0y - by) * ly + (c0z - bz) * lz;
    const v = dx * lx + dy * ly + dz * lz;
    const over = R - Math.abs(d0);
    if (over < minOver) {
      minOver = over;
      minAxis = k;
      minSign = d0 >= 0 ? 1 : -1;
    }
    if (v > -1e-12 && v < 1e-12) {
      if (over < 0) {
        return -1;
      }
      continue;
    }
    let t1 = (-R - d0) / v;
    let t2 = (R - d0) / v;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    if (t1 > tIn) {
      tIn = t1;
      inAxis = k;
      /* Where the part is along L at first touch, against the box. */
      inSign = d0 + t1 * v >= 0 ? 1 : -1;
    }
    if (t2 < tOut) {
      tOut = t2;
    }
    if (tIn > tOut || tOut < 0 || tIn > 1) {
      return -1;
    }
  }
  let t;
  let axis;
  let sign;
  if (tIn <= 0 || inAxis < 0) {
    /* Overlapping already: out along the least overlap. */
    t = 0;
    axis = minAxis;
    sign = minSign;
    out.depth = minOver > 0 ? minOver : 0;
  } else {
    t = tIn;
    axis = inAxis;
    sign = inSign;
    out.depth = 0;
  }
  const l2 = SAT[3 * axis] * SAT[3 * axis] + SAT[3 * axis + 1] * SAT[3 * axis + 1] + SAT[3 * axis + 2] * SAT[3 * axis + 2];
  const inv = sign / Math.sqrt(l2);
  out.t = t;
  out.nx = SAT[3 * axis] * inv;
  out.ny = SAT[3 * axis + 1] * inv;
  out.nz = SAT[3 * axis + 2] * inv;
  out.part = i;
  patchPoint(hull, i, ax, c0x + dx * t, c0y + dy * t, c0z + dz * t, out.nx, out.ny, out.nz, lo, hi, out);
  return t;
}

/*
 * The squared distance from the segment A + u E, u in [0, 1], to the box
 * of half extents h about the origin, all in the box's own coordinates;
 * the segment's nearest point goes to S and the box's to Q.
 *
 * Per axis the squared excess past the slab is a piecewise quadratic in u
 * with at most two breakpoints, so the sum is a convex piecewise quadratic
 * with at most six: walk the pieces and take each one's own minimum.
 */
const BRK = new Float64Array(8);
const S = new Float64Array(3);
const Q = new Float64Array(3);
function segBoxDist2(a0, a1, a2, e0, e1, e2, h0, h1, h2) {
  let n = 0;
  BRK[n] = 0;
  n += 1;
  BRK[n] = 1;
  n += 1;
  for (let k = 0; k < 3; k += 1) {
    const e = k === 0 ? e0 : k === 1 ? e1 : e2;
    if (e === 0) {
      continue;
    }
    const a = k === 0 ? a0 : k === 1 ? a1 : a2;
    const h = k === 0 ? h0 : k === 1 ? h1 : h2;
    const u1 = (h - a) / e;
    if (u1 > 0 && u1 < 1) {
      BRK[n] = u1;
      n += 1;
    }
    const u2 = (-h - a) / e;
    if (u2 > 0 && u2 < 1) {
      BRK[n] = u2;
      n += 1;
    }
  }
  for (let j = 1; j < n; j += 1) {
    const v = BRK[j];
    let m = j - 1;
    while (m >= 0 && BRK[m] > v) {
      BRK[m + 1] = BRK[m];
      m -= 1;
    }
    BRK[m + 1] = v;
  }
  let best = Infinity;
  let bestU = 0;
  for (let j = 0; j + 1 < n; j += 1) {
    const u0 = BRK[j];
    const u1 = BRK[j + 1];
    if (u1 < u0) {
      continue;
    }
    const um = (u0 + u1) * 0.5;
    let qa = 0;
    let qb = 0;
    let qc = 0;
    for (let k = 0; k < 3; k += 1) {
      const a = k === 0 ? a0 : k === 1 ? a1 : a2;
      const e = k === 0 ? e0 : k === 1 ? e1 : e2;
      const h = k === 0 ? h0 : k === 1 ? h1 : h2;
      const x = a + e * um;
      let off;
      if (x > h) {
        off = a - h;
      } else if (x < -h) {
        off = a + h;
      } else {
        continue;
      }
      qa += e * e;
      qb += 2 * off * e;
      qc += off * off;
    }
    let u = u0;
    if (qa > 0) {
      u = -qb / (2 * qa);
      u = u < u0 ? u0 : u > u1 ? u1 : u;
    }
    const f = qa * u * u + qb * u + qc;
    if (f < best) {
      best = f;
      bestU = u;
    }
  }
  S[0] = a0 + e0 * bestU;
  S[1] = a1 + e1 * bestU;
  S[2] = a2 + e2 * bestU;
  Q[0] = S[0] < -h0 ? -h0 : S[0] > h0 ? h0 : S[0];
  Q[1] = S[1] < -h1 ? -h1 : S[1] > h1 ? h1 : S[1];
  Q[2] = S[2] < -h2 ? -h2 : S[2] > h2 ? h2 : S[2];
  const g0 = S[0] - Q[0];
  const g1 = S[1] - Q[1];
  const g2 = S[2] - Q[2];
  return g0 * g0 + g1 * g1 + g2 * g2;
}

/*
 * Part i, travelling from p by d at the attitude ax, against the capsule
 * from a to b of radius r (world; a sphere when a is b). The earliest
 * parameter in [0, 1] at which they touch, or -1, with out filled.
 *
 * The gap g(t), the distance from the capsule's axis to the part's box
 * less r, is convex in t (the distance from a convex set to a translating
 * convex set is), and falls no faster than the travel's length |d|. So
 * t += g / |d| never steps past the first touch, and a step on which g
 * does not fall means it never will.
 */
export function sweepPartCapsule(hull, i, ax, px, py, pz, dx, dy, dz, ax0, ay0, az0, bx0, by0, bz0, r, out) {
  partCentre(hull, i, ax, px, py, pz);
  const c0x = W[0];
  const c0y = W[1];
  const c0z = W[2];
  const hx = hull.hx[i];
  const hy = hull.hy[i];
  const hz = hull.hz[i];
  /* The capsule's axis in the part's coordinates at t = 0, and how it
   * moves there per unit t (the part moves by d, so the axis by -d). */
  const rx = ax0 - c0x;
  const ry = ay0 - c0y;
  const rz = az0 - c0z;
  const A0 = rx * ax[0] + ry * ax[1] + rz * ax[2];
  const A1 = rx * ax[3] + ry * ax[4] + rz * ax[5];
  const A2 = rx * ax[6] + ry * ax[7] + rz * ax[8];
  const ex = bx0 - ax0;
  const ey = by0 - ay0;
  const ez = bz0 - az0;
  const E0 = ex * ax[0] + ey * ax[1] + ez * ax[2];
  const E1 = ex * ax[3] + ey * ax[4] + ez * ax[5];
  const E2 = ex * ax[6] + ey * ax[7] + ez * ax[8];
  const D0 = dx * ax[0] + dy * ax[1] + dz * ax[2];
  const D1 = dx * ax[3] + dy * ax[4] + dz * ax[5];
  const D2 = dx * ax[6] + dy * ax[7] + dz * ax[8];
  const speed = Math.sqrt(dx * dx + dy * dy + dz * dz);
  let t = 0;
  let gap = Math.sqrt(segBoxDist2(A0, A1, A2, E0, E1, E2, hx, hy, hz)) - r;
  if (gap > 0) {
    if (!(speed > 1e-12)) {
      return -1;
    }
    let k = 0;
    for (; k < ADVANCE_MAX && gap > TOUCH_TOL; k += 1) {
      const tn = t + gap / speed;
      if (tn > 1) {
        return -1;
      }
      const g = Math.sqrt(segBoxDist2(A0 - D0 * tn, A1 - D1 * tn, A2 - D2 * tn, E0, E1, E2, hx, hy, hz)) - r;
      if (g >= gap) {
        return -1;
      }
      t = tn;
      gap = g;
    }
    if (gap > GRAZE_TOL) {
      return -1;
    }
  }
  /* S and Q hold the last evaluation's, which is at t. */
  const qx = Q[0];
  const qy = Q[1];
  const qz = Q[2];
  let n0 = qx - S[0];
  let n1 = qy - S[1];
  let n2 = qz - S[2];
  let nl = Math.sqrt(n0 * n0 + n1 * n1 + n2 * n2);
  let depth = gap < 0 ? -gap : 0;
  if (!(nl > 1e-9)) {
    /* The axis runs through the box: out through the nearest face, away
     * from where the axis is. */
    const f0 = hx - Math.abs(S[0]);
    const f1 = hy - Math.abs(S[1]);
    const f2 = hz - Math.abs(S[2]);
    n0 = 0;
    n1 = 0;
    n2 = 0;
    if (f0 <= f1 && f0 <= f2) {
      n0 = S[0] >= 0 ? -1 : 1;
      depth = f0 + r;
    } else if (f1 <= f2) {
      n1 = S[1] >= 0 ? -1 : 1;
      depth = f1 + r;
    } else {
      n2 = S[2] >= 0 ? -1 : 1;
      depth = f2 + r;
    }
    nl = 1;
  }
  n0 /= nl;
  n1 /= nl;
  n2 /= nl;
  const cx = c0x + dx * t;
  const cy = c0y + dy * t;
  const cz = c0z + dz * t;
  out.t = t;
  out.nx = n0 * ax[0] + n1 * ax[3] + n2 * ax[6];
  out.ny = n0 * ax[1] + n1 * ax[4] + n2 * ax[7];
  out.nz = n0 * ax[2] + n1 * ax[5] + n2 * ax[8];
  out.depth = depth;
  out.px = cx + qx * ax[0] + qy * ax[3] + qz * ax[6];
  out.py = cy + qx * ax[1] + qy * ax[4] + qz * ax[7];
  out.pz = cz + qx * ax[2] + qy * ax[5] + qz * ax[8];
  out.part = i;
  return t;
}

/*
 * Part i at the attitude ax, its craft at p, against the half space
 * behind the plane through q with unit normal n (the crash suite's
 * walls). Returns how deep its deepest corner is, 0 when clear, with out
 * filled when it is in (t 0, the normal n, the patch's point).
 */
export function partIntoPlane(hull, i, ax, px, py, pz, qx, qy, qz, nx, ny, nz, out) {
  partCentre(hull, i, ax, px, py, pz);
  const cx = W[0];
  const cy = W[1];
  const cz = W[2];
  const reach = hull.hx[i] * Math.abs(ax[0] * nx + ax[1] * ny + ax[2] * nz)
    + hull.hy[i] * Math.abs(ax[3] * nx + ax[4] * ny + ax[5] * nz)
    + hull.hz[i] * Math.abs(ax[6] * nx + ax[7] * ny + ax[8] * nz);
  const depth = reach - ((cx - qx) * nx + (cy - qy) * ny + (cz - qz) * nz);
  if (!(depth > 0)) {
    return 0;
  }
  out.t = 0;
  out.nx = nx;
  out.ny = ny;
  out.nz = nz;
  out.depth = depth;
  out.part = i;
  patchPoint(hull, i, ax, cx, cy, cz, nx, ny, nz, null, null, out);
  return depth;
}

