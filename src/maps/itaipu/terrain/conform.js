/*
 * conform.js: the ground cut to the concrete it meets.
 *
 * The terrain is a 10 m grid and the dam's walls are not on it. Where a
 * hillside stands against a wall (the spillway chute's west side, the
 * powerhouse's east end), a cell straddling the wall is one triangle from
 * a sample up the hill to one on the flattened footprint inside, and it
 * passes over the wall's top and into what the wall holds: the sawtooth
 * of grass and rock over the chute's west training wall, bare wall
 * between the teeth, that the owner saw from the air (1 October).
 *
 * So, before a chunk is built, every sample near a rim (dam/index.js
 * junctionRims) is held under the rim's bound, the excavation a builder
 * cuts round a structure: outside the rim, the concrete's top at the
 * nearest point of the rim, rising OUT_SLOPE per metre (the basalt cut
 * back at about 63 degrees) to wherever it meets the hill; inside, under
 * that top, falling IN_SLOPE per metre, to the part's floor. Ground lower
 * than the bound is left as it is; the only ground raised is the fill under
 * the embankments' crests (THE FILL UNDER A CREST, below).
 *
 * WHY THE CHORD MEETS THE CONCRETE AT ITS TOP. A cell is drawn as the
 * plane through its samples, so it is the bound at the samples that has
 * to keep the cell under the concrete where the cell crosses it. Along a
 * straight stretch of rim the bound is two planes meeting on the line;
 * a chord from a sample a metres out (top + OUT a) to one b metres in
 * (top - IN b) crosses the line at top + a b (OUT - IN) / (a + b), at or
 * under the top while IN_SLOPE is at least OUT_SLOPE. Past where the
 * inside plane meets the part's floor, the sample in is at the floor, and
 * the chord stays under the top while the cut rises no faster than the
 * top stands over the floor per cell diagonal: so the cut's first cell
 * diagonal is that much gentler where the concrete is low over its floor
 * (the chute's last hundred metres). Round a corner two samples outside
 * the rim, one either side of it, span the corner between them, and both
 * are held at the top on a bench a cell's diagonal wide, which fades out
 * away from the corner (the powerhouse's east end stood 5.5 m over its
 * roof without it). A sample further than a cell's diagonal from the rim
 * has no cell over the concrete, so past that the cut is OUT_SLOPE
 * everywhere. Coarser levels' cells are wider; they are drawn only a
 * kilometre and more from the camera.
 *
 * Applied to every level's samples alike, as a function of where each
 * sample is, so level 0 is still the hero at every sample they share.
 * Plain arithmetic and square roots only: the ground is the plant's, and
 * Node (the check) and every browser must cut the same tiles.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import {
  HERO, TILE_CELLS, TILE_SAMPLES, cellOf, decode,
} from '../../terrain/frame.js';

/* Metres of rise per metre out from the rim, and of fall per metre in. */
const OUT_SLOPE = 2;
const IN_SLOPE = 10;
/* The hero ground's cell diagonal, the most a cell reaches; a corner's
 * bench, held to CORNER_NEAR from the corner and gone by CORNER_FAR. A
 * rim's corner is a turn of more than CORNER_TURN (the sine) in plan. */
const BENCH = 10 * Math.SQRT2;
const CORNER_NEAR = 2 * BENCH;
const CORNER_FAR = CORNER_NEAR + 30;
const CORNER_TURN = 0.2;
/* How near a kept outline the cut eases off, m, and how fast. */
const KEEP_REACH = 15;
const KEEP_RISE = 3;
/* How far out a rim can cut: the bound has risen past any ground on the
 * map (the plateau's 300 m) from the lowest rim (the chute's lips, 107). */
const REACH = 120;

/* One rim as { segs: [{ ax, az, ay, ex, ez, ey, l2 }], corners: [[x, z]]
 * (its convex ones), ring (for inside), box, floor }. */
function prepare({ ring, floor }) {
  const segs = [];
  for (let i = 0; i < ring.length; i += 1) {
    const [ax, az, ay] = ring[i];
    const [bx, bz, by] = ring[(i + 1) % ring.length];
    const ex = bx - ax;
    const ez = bz - az;
    const l2 = ex * ex + ez * ez;
    if (l2 > 1e-6) {
      segs.push({
        ax, az, ay, ex, ez, ey: by - ay, l2,
      });
    }
  }
  let twice = 0;
  segs.forEach((s) => {
    twice += s.ax * (s.az + s.ez) - (s.ax + s.ex) * s.az;
  });
  const corners = [];
  segs.forEach((s, i) => {
    const n = segs[(i + 1) % segs.length];
    const turn = (s.ex * n.ez - s.ez * n.ex) / Math.sqrt(s.l2 * n.l2);
    /* Turning the way the ring winds is round the outside of a corner. */
    if ((twice > 0 ? turn : -turn) > CORNER_TURN) {
      corners.push([s.ax + s.ex, s.az + s.ez]);
    }
  });
  const xs = ring.map((p) => p[0]);
  const zs = ring.map((p) => p[1]);
  return {
    out: [Infinity, Infinity],
    segs,
    corners,
    ring,
    floor,
    box: [Math.min(...xs) - REACH, Math.max(...xs) + REACH, Math.min(...zs) - REACH, Math.max(...zs) + REACH],
  };
}

function inside(ring, x, z) {
  let odd = false;
  for (let j = 0, k = ring.length - 1; j < ring.length; k = j, j += 1) {
    if ((ring[j][1] > z) !== (ring[k][1] > z)
      && x < ring[j][0] + ((z - ring[j][1]) * (ring[k][0] - ring[j][0])) / (ring[k][1] - ring[j][1])) {
      odd = !odd;
    }
  }
  return odd;
}

/* The bound one rim puts on the ground at (x, z), or Infinity, and how
 * far the rim is, as r.out = [bound, distance]. */
function rimBound(r, x, z) {
  if (x < r.box[0] || x > r.box[1] || z < r.box[2] || z > r.box[3]) {
    r.out[0] = Infinity;
    r.out[1] = Infinity;
    return r.out;
  }
  let best = Infinity;
  let top = 0;
  for (const s of r.segs) {
    let t = ((x - s.ax) * s.ex + (z - s.az) * s.ez) / s.l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - s.ax - s.ex * t;
    const dz = z - s.az - s.ez * t;
    const d2 = dx * dx + dz * dz;
    /* At a corner two segments are as near: the lower top. */
    const y = s.ay + s.ey * t;
    if (d2 < best - 1e-9 || (d2 < best + 1e-9 && y < top)) {
      best = d2;
      top = y;
    }
  }
  const d = Math.sqrt(best);
  r.out[1] = d;
  if (inside(r.ring, x, z)) {
    const y = top - IN_SLOPE * d;
    r.out[0] = y > r.floor ? y : r.floor;
    return r.out;
  }
  let c2 = Infinity;
  for (const [cx, cz] of r.corners) {
    c2 = Math.min(c2, (x - cx) * (x - cx) + (z - cz) * (z - cz));
  }
  const c = Math.sqrt(c2);
  /* Within a cell's diagonal of the rim, where a cell can reach over the
   * concrete: flat near a corner (its bench), and elsewhere no steeper
   * than the room under the top lets a chord be (WHY THE CHORD, above).
   * Past it, no cell reaches the concrete, and the cut is OUT_SLOPE. */
  const bench = c <= CORNER_NEAR ? BENCH : c >= CORNER_FAR ? 0 : (BENCH * (CORNER_FAR - c)) / (CORNER_FAR - CORNER_NEAR);
  /* The cut from every stretch of the rim, not only the nearest: where
   * the rim steps down (an outer pier's 225 to the sill's 199 beside it)
   * the lower top holds the ground round the step too, or a cell from
   * beside the pier reaches over the gate next to it. */
  let b = Infinity;
  for (const s of r.segs) {
    let t = ((x - s.ax) * s.ex + (z - s.az) * s.ez) / s.l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - s.ax - s.ex * t;
    const dz = z - s.az - s.ez * t;
    const ds = Math.sqrt(dx * dx + dz * dz);
    const y = s.ay + s.ey * t;
    const near = Math.min(OUT_SLOPE, (y - r.floor) / BENCH);
    const v = y + near * Math.max(0, Math.min(ds, BENCH) - bench) + OUT_SLOPE * Math.max(0, ds - BENCH);
    if (v < b) {
      b = v;
    }
  }
  r.out[0] = b;
  return r.out;
}

/* The shortest distance from (x, z) to an outline's edges. */
function toEdges(o, x, z) {
  let best = Infinity;
  for (let i = 0, k = o.length - 1; i < o.length; k = i, i += 1) {
    const ex = o[i][0] - o[k][0];
    const ez = o[i][1] - o[k][1];
    const l2 = ex * ex + ez * ez;
    let t = l2 > 0 ? ((x - o[k][0]) * ex + (z - o[k][1]) * ez) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - o[k][0] - ex * t;
    const dz = z - o[k][1] - ez * t;
    best = Math.min(best, dx * dx + dz * dz);
  }
  return Math.sqrt(best);
}

/* The bound the rims (dam/index.js junctionRims) put on the ground: a
 * function of (x, z), Infinity where none reaches. `keep` is a list of
 * outlines [[x, z]...] the cut eases off under and toward: the
 * embankments' crest roads (dam/index.js embankmentCrests), where an
 * earth dam's fill stands against the concrete under a drawn road. The
 * bound rises KEEP_RISE per metre nearer one than KEEP_REACH, so the
 * fill climbs to the road on a slope rather than standing round its
 * edges in the grid's teeth. */
export function conformBound(rims, keep) {
  const prepared = rims.map(prepare);
  const boxes = prepared.map((r) => r.box);
  const near = keep.map((o) => {
    const xs = o.map((p) => p[0]);
    const zs = o.map((p) => p[1]);
    return {
      o,
      box: [Math.min(...xs) - KEEP_REACH, Math.max(...xs) + KEEP_REACH, Math.min(...zs) - KEEP_REACH, Math.max(...zs) + KEEP_REACH],
    };
  }).filter(({ box }) => boxes.some(([x0, x1, z0, z1]) => box[0] <= x1 && box[1] >= x0 && box[2] <= z1 && box[3] >= z0));
  const bound = (x, z) => {
    let b = Infinity;
    let rim = Infinity;
    for (const r of prepared) {
      const [v, d] = rimBound(r, x, z);
      b = Math.min(b, v);
      rim = Math.min(rim, d);
    }
    if (b === Infinity) {
      return b;
    }
    let raise = 0;
    for (const { o, box } of near) {
      if (x < box[0] || x > box[1] || z < box[2] || z > box[3]) {
        continue;
      }
      const d = inside(o, x, z) ? 0 : toEdges(o, x, z);
      if (d < KEEP_REACH) {
        raise = Math.max(raise, KEEP_RISE * (KEEP_REACH - d));
      }
    }
    /* Never within a cell's diagonal of the rim, where the cut is what
     * keeps the grid's chords under the concrete: there the cut wins. */
    return b + Math.min(raise, KEEP_RISE * Math.max(0, rim - BENCH));
  };
  return bound;
}

/*
 * THE FILL UNDER A CREST. The embankments' crest roads are drawn (dam/
 * index.js): a flat road and a rock edge falling down the fill on either
 * side. Where the ground under them is lower than they are, the edge's
 * lip and the road's end hang over nothing: the black void under the
 * right bank earth dam's road where it meets the spillway's west pier,
 * and a metre or two all along the crests' lips. The ground under a crest
 * is held at least FILL_UNDER under its drawn top, and past the lip for a
 * cell's diagonal on an apron falling no faster than the edge's fall over
 * that diagonal, then FILL_TOE per metre to the ground: the fill's face.
 * The apron is what keeps a cell across the lip from sagging under it:
 * a chord from a sample b inside the lip (at least the edge's fall over
 * it, the road's sample at least its whole fall) to one a past it on the
 * apron (s a under the lip) meets the lip at a (rise - s b) / (a + b) over
 * it, at or over while s b is no more than the rise, for every b up to a
 * cell's diagonal. The drawn crest stops square across an axis's end,
 * and past the end the fill goes on as past a lip. Where the fill and a
 * rim's cut both reach, the cut wins. A function of (x, z), -Infinity
 * where no crest is near.
 */
const FILL_UNDER = 0.3;
const FILL_TOE = 2;
const FILL_REACH = 60;
export function fillUnder({
  axes, crestY, half, edge,
}) {
  const lip = half + edge.out;
  const fall = edge.down / edge.out;
  const lines = axes.map((pts) => {
    const xs = pts.map((p) => p[0]);
    const zs = pts.map((p) => p[1]);
    return {
      pts, box: [Math.min(...xs) - FILL_REACH, Math.max(...xs) + FILL_REACH, Math.min(...zs) - FILL_REACH, Math.max(...zs) + FILL_REACH],
    };
  });
  return (x, z) => {
    let d = Infinity;
    for (const { pts, box } of lines) {
      if (x < box[0] || x > box[1] || z < box[2] || z > box[3]) {
        continue;
      }
      let best = Infinity;
      for (let i = 0; i + 1 < pts.length; i += 1) {
        const [ax, az] = pts[i];
        const ex = pts[i + 1][0] - ax;
        const ez = pts[i + 1][1] - az;
        const l2 = ex * ex + ez * ez;
        let t = l2 > 0 ? ((x - ax) * ex + (z - az) * ez) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = x - ax - ex * t;
        const dz = z - az - ez * t;
        best = Math.min(best, dx * dx + dz * dz);
      }
      /* Past an end, the end is a lip: from it the apron and the face, as
       * at the sides, over the end's line run on. */
      for (const [a, b] of [[pts[1], pts[0]], [pts[pts.length - 2], pts[pts.length - 1]]]) {
        const ex = b[0] - a[0];
        const ez = b[1] - a[1];
        const l = Math.sqrt(ex * ex + ez * ez);
        const past = ((x - b[0]) * ex + (z - b[1]) * ez) / l;
        if (past > 0) {
          const side = Math.abs((x - b[0]) * ez - (z - b[1]) * ex) / l;
          const m = Math.max(side, lip + past);
          best = Math.min(best, m * m);
        }
      }
      d = Math.min(d, Math.sqrt(best));
    }
    if (!(d <= FILL_REACH)) {
      return -Infinity;
    }
    const lipY = crestY - edge.down;
    const apron = edge.down / BENCH;
    let top;
    if (d <= half) {
      top = crestY;
    } else if (d <= lip) {
      top = crestY - fall * (d - half);
    } else if (d <= lip + BENCH) {
      top = lipY - apron * (d - lip);
    } else {
      top = lipY - edge.down - FILL_TOE * (d - lip - BENCH);
    }
    return top - FILL_UNDER;
  };
}

/*
 * Hold one tile's samples (`data`, the tile's Uint16Array as stored, in
 * place) up to `fill` (fillUnder) as far as `bound` (conformBound) lets
 * it, or else under `bound`. `half` is the frame's half extent.
 * Each hero sample lowered under the file's ground is added to `cut` as
 * [x, z] (the planting keeps off the fresh rock), and each raised to
 * `raised`. Returns { cut, raised },
 * how many samples each changed.
 */
export function conformTile(level, i, j, data, half, { bound, fill }, cut = null, raised = null) {
  const cell = cellOf(level);
  const x0 = -half + i * TILE_CELLS * cell;
  const z0 = -half + j * TILE_CELLS * cell;
  const out = { cut: 0, raised: 0 };
  for (let r = 0; r < TILE_SAMPLES; r += 1) {
    for (let q = 0; q < TILE_SAMPLES; q += 1) {
      const x = x0 + q * cell;
      const z = z0 + r * cell;
      const k = r * TILE_SAMPLES + q;
      const y = decode(data[k]);
      const f = fill(x, z);
      const b = bound(x, z);
      const up = f > y ? Math.min(f, b) : -Infinity;
      if (up > y) {
        /* Up to the encoding's step at or under the fill. */
        data[k] = Math.min(65535, Math.floor((up + 1000) * 10));
        out.raised += 1;
        if (raised && level === HERO) {
          raised.push([x, z]);
        }
      } else if (y > b) {
        /* Down to the encoding's step at or under the bound. */
        data[k] = Math.max(0, Math.floor((b + 1000) * 10));
        out.cut += 1;
        if (cut && level === HERO) {
          cut.push([x, z]);
        }
      }
    }
  }
  return out;
}

/*
 * THE BUILDINGS OVER THE CUT. A building is drawn down to the lowest
 * ground at its corners (town/plan.js heightsOf), so one whose footprint
 * the cut lowered stands as a tall face over the excavation (OpenStreetMap
 * way 186671808, 5 m from the chute's west wall on the plateau 40 m over
 * it). No building stands over the real chute: one whose outline reaches
 * the cell round any lowered hero sample (`cut`, CELL either side, where
 * the drawn ground changed) is not built. Returns { kept, dropped } of
 * `features` (osm/buildings.json's, each with `outer`).
 */
const CELL = 10;
export function offCut(features, cut) {
  const near = new Map();
  for (const [x, z] of cut) {
    const k = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    if (!near.has(k)) {
      near.set(k, []);
    }
    near.get(k).push([x, z]);
  }
  const touches = (o, [x, z]) => {
    const [x0, x1, z0, z1] = [x - CELL, x + CELL, z - CELL, z + CELL];
    if (inside(o, x, z)) {
      return true;
    }
    for (let i = 0, k = o.length - 1; i < o.length; k = i, i += 1) {
      /* The edge clipped to the square (Liang and Barsky). */
      const [ax, az] = o[k];
      const dx = o[i][0] - ax;
      const dz = o[i][1] - az;
      let t0 = 0;
      let t1 = 1;
      let hit = true;
      for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dz, az - z0], [dz, z1 - az]]) {
        if (p === 0) {
          hit = hit && q >= 0;
        } else if (p < 0) {
          t0 = Math.max(t0, q / p);
        } else {
          t1 = Math.min(t1, q / p);
        }
      }
      if (hit && t0 <= t1) {
        return true;
      }
    }
    return false;
  };
  const kept = [];
  const dropped = [];
  for (const f of features) {
    const o = f.outer;
    const xs = o.map((p) => p[0]);
    const zs = o.map((p) => p[1]);
    let over = false;
    for (let a = Math.floor((Math.min(...xs) - CELL) / CELL); a <= Math.floor((Math.max(...xs) + CELL) / CELL) && !over; a += 1) {
      for (let b = Math.floor((Math.min(...zs) - CELL) / CELL); b <= Math.floor((Math.max(...zs) + CELL) / CELL) && !over; b += 1) {
        over = (near.get(`${a},${b}`) || []).some((s) => touches(o, s));
      }
    }
    (over ? dropped : kept).push(f);
  }
  return { kept, dropped };
}
