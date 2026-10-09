/*
 * canopy.js: the Interior's trees, and whether their crowns hide a point
 * from a point (TECH-NEEDS N2): one generator that both the room's line
 * of sight and every screen's drawing read, so what a pilot sees through
 * the forest is what the room decides they saw.
 *
 * THE TREES. The world is cut into TREE_CELL squares; each may hold one
 * tree, its place jittered inside the square, its crown and height drawn
 * from an integer hash of the square's indices: no state, no order, the
 * same tree whoever asks and whenever. Whether a square holds one is its
 * stand's density (STAND): the forest nearly closed; gallery forest along
 * the river and the streams through open land; low scrub on the river's
 * flood bank and shrubs along a forest's edge; clumps of trees in some
 * paddocks; a lone tree now and then in a pasture, palms in the marsh.
 * No trunk stands in the water or on the river's bare bank, and none
 * where an opening places.js cuts would be overhung (the camp's
 * clearing, the concealment routes' gaps and clearings, the logging cut,
 * the roads), though a bush may stand at its edge. The forest's height
 * rolls over hundreds of metres on a value noise of the same hash, its
 * stands differ in height, depth and crown size, and one square in forty
 * holds an emergent over the roof. Beside the concealment routes the
 * crowns are round 0's (ROUTE_KEEP), and where the mission needs open
 * grass (KEEP_OPEN) the open land grows only its lone trees.
 *
 * A crown is an ellipsoid: horizontal radius r, vertical semi axis ry,
 * its top at the tree's height over the ground under its trunk. A line of
 * sight is blocked when it passes through any crown. Trunks and branches
 * under the crown are left out: from the air, the crowns are what hides.
 *
 * WORLD METRES, Y UP (frame.js): a point is [x, y, z], x east, z south,
 * y height above the datum, the frame the room's pilot poses are in.
 *
 * Arithmetic only (+ - * /, Math.sqrt, Math.floor, Math.imul): the same
 * answer to the bit in Node and every browser. Measured by
 * scripts/canopy-los.js, which also holds the drawn trees to it.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { HALF, gridToWorld } from './frame.js';
import { LAND } from './world.js';
import { PLACES, opened } from './places.js';
import { RIVER, STREAMS } from './hydro.js';
import { ROUTES } from './routes.js';
import { hash01 } from '../../render/library/hash.js';

export { hash01 };

/* One tree a square this size at most, metres: a semi deciduous forest's
 * crowns are 5 to 11 m across. */
export const TREE_CELL = 8;
/* No crown top stands higher over its ground than this, metres. */
export const MAX_TREE_H = 32;
/* No crown is wider than this, metres: places.js's CROWN_REACH, which its
 * openings are bucketed by, holds it. */
const MAX_CROWN_R = 8;
/* A crown reaches at most this far from its square's middle: the jitter's
 * reach plus the widest crown. */
const CROWN_REACH = TREE_CELL * 0.38 + MAX_CROWN_R;
/* Steps along a line's ground track, metres: under half a square, so no
 * square a crown could stand in is stepped over. */
const STEP = 3;
/* A target within this of a crown's edge (horizontally) is in the trees,
 * so a clear line to it is a gap rather than open ground, metres. */
const GAP_NEAR = 6;

/* Metres either way the land class is read off a trunk (treeAt). */
const EDGE_JITTER = 16;

/* The drawn river's water reaches (width + WATER_LAP) / 2 from its line
 * and its bare bank BANK_M past that (ribbons.js LAP and BANK); a
 * stream's water half its ribbon's width (ribbons.js buildWater). No
 * trunk stands on either. */
const WATER_LAP = 8;
const BANK_M = 9;
const STREAM_FOOT = 1;
/* The lines are bucketed in squares this size, metres; a water line is
 * asked about out to WATER_REACH from its edge. */
const LINE_BUCKET = 64;
const WATER_REACH = 48;
/* Round 0's crown footprints are kept within ROUTE_KEEP of the pair's
 * concealment routes and their alternates, and the stands' smaller crowns
 * come in over ROUTE_FADE past it, metres: the gaps the follow was tuned
 * on (MISSIONS M1, the 60 s hard threshold) are those crowns' gaps. */
const KEEP_ROUTES = ['west', 'mid', 'east'].flatMap((k) => [`conceal-${k}-a`, `conceal-${k}-alt-a`]);
const ROUTE_KEEP = 20;
const ROUTE_FADE = 20;

/* The tree kinds, for the drawing. */
export const KIND = {
  broadleaf: 0, palm: 1, lone: 2, emergent: 3, shrub: 4,
};
/* What a square grows, before its land class's density: the closed
 * forest's roof; gallery forest along the river and the streams through
 * open land; scrub on the river's flood bank; shrubs along a forest's
 * edge; a clump of trees in a paddock; or the open land's lone trees and
 * palms. */
export const STAND = {
  closed: 0, gallery: 1, scrub: 2, edge: 3, clump: 4, open: 5,
};
/* Chance a square holds a tree, by stand where not by land class. */
const STAND_DENSITY = [];
STAND_DENSITY[STAND.gallery] = 0.93;
STAND_DENSITY[STAND.scrub] = 0.7;
STAND_DENSITY[STAND.edge] = 0.45;
STAND_DENSITY[STAND.clump] = 0.55;
/* The river's flood bank, scrub up to SCRUB_M from the water's edge
 * (past its BANK_M of bare bank), then gallery forest to GALLERY_RIVER,
 * metres; a stream's gallery reaches galleryHalf from its water. */
const SCRUB_M = 24;
const GALLERY_RIVER = 48;
function galleryHalf(km2) {
  const g = 10 + 0.2 * km2;
  return g < 30 ? g : 30;
}
/* A shrub stands on open land when the forest is this near, metres. */
const EDGE_REACH = 10;
/* The paddocks' clumps: a noise CLUMP_CELL metres a feature over
 * CLUMP_AT. */
const CLUMP_CELL = 36;
const CLUMP_AT = 0.84;
/* The share of an opening's edge squares that hold a bush. */
const UNDERSTORY = 0.6;
/* Where the mission needs open grass: the canada's strip (WORLD.md 5,
 * the grass along the creek at 9.0 to 9.4 east, 8.0 to 10.6 north, and
 * a margin) and the anomaly corridor where stage 3's pair is spawned.
 * The stands this round added (gallery, scrub, edge, clump) are not
 * grown there: stage 3's discovery and the alternates' reacquisition on
 * the canada were tuned on it open. [x0, z0, x1, z1], world metres. */
const boxOf = ([ax, az], [bx, bz]) => [ax < bx ? ax : bx, az < bz ? az : bz, ax > bx ? ax : bx, az > bz ? az : bz];
const KEEP_OPEN = [
  boxOf(gridToWorld(8.95, 10.65), gridToWorld(9.45, 7.95)),
  boxOf(...PLACES.anomalyCorridor.box),
];
function keptOpen(x, z) {
  for (const [x0, z0, x1, z1] of KEEP_OPEN) {
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1) {
      return true;
    }
  }
  return false;
}
/* The share of forest squares whose tree stands over the roof, on
 * average: more in some stretches of the forest than others. */
const EMERGENT = 0.025;

/* Chance a square holds a tree, by land class. */
const DENSITY = [];
DENSITY[LAND.water] = 0;
DENSITY[LAND.forest] = 0.93;
DENSITY[LAND.pasture] = 0.008;
DENSITY[LAND.crop] = 0;
DENSITY[LAND.shrub] = 0.25;
DENSITY[LAND.wetland] = 0.05;
DENSITY[LAND.bare] = 0.004;
DENSITY[LAND.built] = 0.05;
DENSITY[LAND.burned] = 0;

/* Value noise in [0, 1) on a lattice `cell` metres apart, smoothstepped.
 * Exported for the drawing's stands of one tone (trees.js). */
export function noise(x, z, cell, salt) {
  const fx = (x + HALF) / cell;
  const fz = (z + HALF) / cell;
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  let tx = fx - i;
  let tz = fz - j;
  tx = tx * tx * (3 - 2 * tx);
  tz = tz * tz * (3 - 2 * tz);
  const a = hash01(i, j, salt);
  const b = hash01(i + 1, j, salt);
  const c = hash01(i, j + 1, salt);
  const d = hash01(i + 1, j + 1, salt);
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

function streamHalf(km2) {
  const w = 2.5 + km2 * 0.35;
  return (w < 7 ? w : 7) / 2;
}

/* The lines a tree asks how near it stands to: the river's water, a
 * stream's, and the concealment routes. */
const LINE = { river: 0, stream: 1, route: 2 };

/* Polylines as a lookup: near(x, z, out) sets out.d[tag] to the distance
 * from (x, z) to the nearest edge (its line less its half width, so
 * negative inside) of each tag's lines, Infinity past a segment's
 * `reach`, and out.km2 to the nearest stream's catchment. segs: [{ ax, az,
 * bx, bz, half, reach, tag, km2 }]. */
function makeLines(segs) {
  const buckets = new Map();
  const keyOf = (i, j) => (i + 1024) * 4096 + (j + 1024);
  for (const sg of segs) {
    const pad = sg.half + sg.reach;
    const i0 = Math.floor(((sg.ax < sg.bx ? sg.ax : sg.bx) - pad) / LINE_BUCKET);
    const i1 = Math.floor(((sg.ax > sg.bx ? sg.ax : sg.bx) + pad) / LINE_BUCKET);
    const j0 = Math.floor(((sg.az < sg.bz ? sg.az : sg.bz) - pad) / LINE_BUCKET);
    const j1 = Math.floor(((sg.az > sg.bz ? sg.az : sg.bz) + pad) / LINE_BUCKET);
    for (let j = j0; j <= j1; j += 1) {
      for (let i = i0; i <= i1; i += 1) {
        const key = keyOf(i, j);
        let b = buckets.get(key);
        if (!b) {
          b = [];
          buckets.set(key, b);
        }
        b.push(sg);
      }
    }
  }
  return function near(x, z, out) {
    out.d[0] = Infinity;
    out.d[1] = Infinity;
    out.d[2] = Infinity;
    out.km2 = 0;
    const b = buckets.get(keyOf(Math.floor(x / LINE_BUCKET), Math.floor(z / LINE_BUCKET)));
    if (!b) {
      return out;
    }
    for (const sg of b) {
      const ux = sg.bx - sg.ax;
      const uz = sg.bz - sg.az;
      const l2 = ux * ux + uz * uz;
      let t = l2 > 0 ? ((x - sg.ax) * ux + (z - sg.az) * uz) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = x - sg.ax - ux * t;
      const ez = z - sg.az - uz * t;
      const d = Math.sqrt(ex * ex + ez * ez) - sg.half;
      if (d < out.d[sg.tag]) {
        out.d[sg.tag] = d;
        if (sg.tag === LINE.stream) {
          out.km2 = sg.km2;
        }
      }
    }
    return out;
  };
}

/* The segments of a polyline [[x, z]] for makeLines. */
function segmentsOf(pts, halfOf, reach, tag, km2 = 0) {
  const out = [];
  for (let k = 0; k + 1 < pts.length; k += 1) {
    out.push({
      ax: pts[k][0], az: pts[k][1], bx: pts[k + 1][0], bz: pts[k + 1][1], half: halfOf(k), reach, tag, km2,
    });
  }
  return out;
}

/* The river, the streams and the routes' lines, once. */
let lines = null;
function linesNear() {
  if (!lines) {
    const riverHalf = (k) => ((RIVER.width[k] > RIVER.width[k + 1] ? RIVER.width[k] : RIVER.width[k + 1]) + WATER_LAP) / 2;
    lines = makeLines([
      ...segmentsOf(RIVER.points, riverHalf, WATER_REACH, LINE.river),
      ...STREAMS.flatMap((st) => segmentsOf(st.points, () => streamHalf(st.km2), WATER_REACH, LINE.stream, st.km2)),
      ...KEEP_ROUTES.flatMap((id) => segmentsOf(ROUTES[id].pts, () => 0, ROUTE_KEEP + ROUTE_FADE, LINE.route)),
    ]);
  }
  return lines;
}

/*
 * The canopy over a world (world.js makeWorld, with places.js's landEdit
 * as its edits). Returns:
 *
 *   treeAt(ci, cj)          the tree of square (ci, cj), or null:
 *                           { x, z, ground, h, r, ry, cy, kind, tint }
 *                           (x, z its trunk; h its top over ground; r the
 *                           crown's radius, ry its vertical semi axis, cy
 *                           its centre's world y; tint in [0, 1) for the
 *                           drawing)
 *   treesIn(x0, z0, x1, z1, out)   every tree whose trunk is in the box
 *   canopyBlocks(from, to)  true when a crown stands between the two
 *                           world points [x, y, z]
 *   canopyLos(from, to)     'blocked', 'gap' (clear, but the target is in
 *                           the trees) or 'open' (clear, open ground)
 *   crownTopAt(x, z)        the highest crown over (x, z), world y, or
 *                           -Infinity where no crown covers it
 *   standAt(x, z)           the STAND that grows at (x, z), its land class
 *                           read there (the drawing's far forest)
 */
export function makeCanopy(world) {
  const { groundAt, landAt } = world;
  const cellOf = (v) => Math.floor((v + HALF) / TREE_CELL);
  const near = linesNear();
  const at = { d: [0, 0, 0], km2: 0 };

  /* Whether the forest stands within EDGE_REACH of (x, z). */
  const forestNear = (x, z) => landAt(x + EDGE_REACH, z) === LAND.forest || landAt(x - EDGE_REACH, z) === LAND.forest
    || landAt(x, z + EDGE_REACH) === LAND.forest || landAt(x, z - EDGE_REACH) === LAND.forest;

  /* What grows at (x, z), whose land class is cls, with `at` near()'s
   * there (STAND). */
  function standOf(x, z, cls) {
    const keep = keptOpen(x, z);
    if (!keep && at.d[LINE.river] < SCRUB_M) {
      return STAND.scrub;
    }
    if (cls === LAND.forest || cls === LAND.shrub) {
      return STAND.closed;
    }
    if (keep || cls === LAND.built) {
      return STAND.open;
    }
    if (at.d[LINE.river] < GALLERY_RIVER || at.d[LINE.stream] < galleryHalf(at.km2)) {
      return STAND.gallery;
    }
    if (cls === LAND.water || cls === LAND.wetland) {
      return STAND.open;
    }
    if (forestNear(x, z)) {
      return STAND.edge;
    }
    if (cls === LAND.pasture && noise(x, z, CLUMP_CELL, 15) > CLUMP_AT) {
      return STAND.clump;
    }
    return STAND.open;
  }

  /* The stand at a point, its class read there: for the drawing's far
   * blocks, which stand in for the closed and gallery stands' trees. */
  function standAt(x, z) {
    near(x, z, at);
    if (at.d[LINE.river] < BANK_M) {
      return STAND.open;
    }
    return standOf(x, z, landAt(x, z));
  }

  function treeAt(ci, cj) {
    const u = hash01(ci, cj, 1);
    const x = -HALF + (ci + 0.12 + 0.76 * hash01(ci, cj, 2)) * TREE_CELL;
    const z = -HALF + (cj + 0.12 + 0.76 * hash01(ci, cj, 3)) * TREE_CELL;
    /* Never on the water or the river's bare bank, whatever the land
     * cover's 10 m squares say there. */
    if (landAt(x, z) === LAND.water) {
      return null;
    }
    near(x, z, at);
    if (at.d[LINE.river] < BANK_M || at.d[LINE.stream] < STREAM_FOOT) {
      return null;
    }
    /* The class is read EDGE_JITTER off the trunk, so a forest's edge on
     * the land cover's 10 m squares comes out ragged, not stepped. */
    const cls = landAt(x + EDGE_JITTER * (hash01(ci, cj, 9) - 0.5), z + EDGE_JITTER * (hash01(ci, cj, 10) - 0.5));
    const stand = standOf(x, z, cls);
    const density = stand === STAND.closed || stand === STAND.open ? DENSITY[cls] : STAND_DENSITY[stand];
    if (!(u < density)) {
      return null;
    }
    const v = hash01(ci, cj, 4);
    const w = hash01(ci, cj, 5);
    let keep = (at.d[LINE.route] - ROUTE_KEEP) / ROUTE_FADE;
    keep = keep < 0 ? 0 : keep > 1 ? 1 : keep;
    let kind;
    let h;
    let r;
    let ry;
    if (stand === STAND.closed || stand === STAND.gallery) {
      kind = KIND.broadleaf;
      /* Its stand, a noise 90 m a feature: some stands of tall wide
       * crowns, some of close small ones, as species and age group. */
      const sn = noise(x, z, 90, 12);
      let tall = 6;
      if (stand === STAND.gallery) {
        tall = 9 + 6 * noise(x, z, 160, 7) + 2 * noise(x, z, 40, 8);
      } else if (cls === LAND.forest) {
        tall = 11 + 9 * noise(x, z, 160, 7) + 3 * noise(x, z, 40, 8);
      }
      h = tall + 4 * (v - 0.5) + 3 * (sn - 0.5);
      /* Crowns wider than their squares and deep, overlapping into a
       * closed roof from a few metres up: a semi deciduous forest's
       * canopy and the layer under it, as one crown a square. Round 0's
       * footprint by the routes (ROUTE_KEEP), four fifths of it in the
       * closest stands elsewhere. */
      r = (3.6 + 2.4 * w) * (1 - keep * 0.2 * (1 - sn));
      ry = (0.36 + 0.12 * hash01(ci, cj, 12)) * h;
      /* An emergent: a broad flat crown 6 to 12 m over the roof (the
       * lapachos, the timbo), never beside the routes. */
      if (stand === STAND.closed && cls === LAND.forest && hash01(ci, cj, 13) < EMERGENT * 2 * noise(x, z, 300, 14) * keep) {
        kind = KIND.emergent;
        const top = tall + 6 + 6 * hash01(ci, cj, 14);
        h = top < MAX_TREE_H ? top : MAX_TREE_H;
        r = 6 + 2 * w;
        ry = 0.3 * h;
      }
    } else if (stand === STAND.scrub || stand === STAND.edge) {
      kind = KIND.shrub;
      h = 2.5 + 2 * v;
      r = 1.6 + 1.2 * w;
      ry = 0.45 * h;
    } else if (cls === LAND.wetland || v < (stand === STAND.clump ? 0.15 : 0.3)) {
      kind = KIND.palm;
      h = 8 + 6 * v;
      r = 2.5 + 0.9 * w;
      ry = 1.5;
    } else {
      kind = KIND.lone;
      h = 7 + 7 * v;
      r = 3.4 + 2.6 * w;
      ry = 0.34 * h;
    }
    if (opened(x, z, r)) {
      /* The understory at an opening's edge, where no crown of the roof
       * may reach over it: a bush, away from the routes. */
      if (!(stand === STAND.closed || stand === STAND.gallery) || !(hash01(ci, cj, 15) < UNDERSTORY * keep)) {
        return null;
      }
      kind = KIND.shrub;
      h = 2 + 2 * v;
      r = 1.4 + 1.0 * w;
      ry = 0.45 * h;
      if (opened(x, z, r)) {
        return null;
      }
    }
    const ground = groundAt(x, z);
    return {
      x, z, ground, h, r, ry, cy: ground + h - ry, kind, tint: hash01(ci, cj, 6),
    };
  }

  function treesIn(x0, z0, x1, z1, out) {
    for (let cj = cellOf(z0); cj <= cellOf(z1); cj += 1) {
      for (let ci = cellOf(x0); ci <= cellOf(x1); ci += 1) {
        const t = treeAt(ci, cj);
        if (t && t.x >= x0 && t.x < x1 && t.z >= z0 && t.z < z1) {
          out.push(t);
        }
      }
    }
    return out;
  }

  /* The segment from p to p + d (t in [0, 1]) against a tree's crown. */
  function hits(t, px, py, pz, dx, dy, dz) {
    const ox = (px - t.x) / t.r;
    const oy = (py - t.cy) / t.ry;
    const oz = (pz - t.z) / t.r;
    const ex = dx / t.r;
    const ey = dy / t.ry;
    const ez = dz / t.r;
    const a = ex * ex + ey * ey + ez * ez;
    const b = 2 * (ox * ex + oy * ey + oz * ez);
    const c = ox * ox + oy * oy + oz * oz - 1;
    if (c <= 0) {
      return true;
    }
    if (a === 0) {
      return false;
    }
    const disc = b * b - 4 * a * c;
    if (disc < 0) {
      return false;
    }
    const s = Math.sqrt(disc);
    const t1 = (-b - s) / (2 * a);
    const t2 = (-b + s) / (2 * a);
    return t2 >= 0 && t1 <= 1;
  }

  /* The squares whose trees could meet the segment: every square within
   * a crown's reach of a point of its ground track where the line is low
   * enough to be among the crowns. */
  function squaresAlong(from, to) {
    const dx = to[0] - from[0];
    const dz = to[2] - from[2];
    const len = Math.sqrt(dx * dx + dz * dz);
    const n = Math.floor(len / STEP) + 1;
    const seen = new Set();
    const out = [];
    for (let k = 0; k <= n; k += 1) {
      const t = k / n;
      const x = from[0] + dx * t;
      const z = from[2] + dz * t;
      const y = from[1] + (to[1] - from[1]) * t;
      if (y - groundAt(x, z) > MAX_TREE_H + 0.5) {
        continue;
      }
      for (let cj = cellOf(z - CROWN_REACH); cj <= cellOf(z + CROWN_REACH); cj += 1) {
        for (let ci = cellOf(x - CROWN_REACH); ci <= cellOf(x + CROWN_REACH); ci += 1) {
          const key = ci * 8192 + cj;
          if (!seen.has(key)) {
            seen.add(key);
            out.push(ci, cj);
          }
        }
      }
    }
    return out;
  }

  function canopyBlocks(from, to) {
    const sq = squaresAlong(from, to);
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const dz = to[2] - from[2];
    for (let k = 0; k < sq.length; k += 2) {
      const t = treeAt(sq[k], sq[k + 1]);
      if (t && hits(t, from[0], from[1], from[2], dx, dy, dz)) {
        return true;
      }
    }
    return false;
  }

  function inTrees(x, z) {
    const reach = MAX_CROWN_R + GAP_NEAR + TREE_CELL;
    for (let cj = cellOf(z - reach); cj <= cellOf(z + reach); cj += 1) {
      for (let ci = cellOf(x - reach); ci <= cellOf(x + reach); ci += 1) {
        const t = treeAt(ci, cj);
        if (t && (t.kind === KIND.broadleaf || t.kind === KIND.emergent)) {
          const ex = x - t.x;
          const ez = z - t.z;
          const lim = t.r + GAP_NEAR;
          if (ex * ex + ez * ez < lim * lim) {
            return true;
          }
        }
      }
    }
    return false;
  }

  function canopyLos(from, to) {
    if (canopyBlocks(from, to)) {
      return 'blocked';
    }
    return inTrees(to[0], to[2]) ? 'gap' : 'open';
  }

  function crownTopAt(x, z) {
    let top = -Infinity;
    for (let cj = cellOf(z - CROWN_REACH); cj <= cellOf(z + CROWN_REACH); cj += 1) {
      for (let ci = cellOf(x - CROWN_REACH); ci <= cellOf(x + CROWN_REACH); ci += 1) {
        const t = treeAt(ci, cj);
        if (!t) {
          continue;
        }
        const ex = (x - t.x) / t.r;
        const ez = (z - t.z) / t.r;
        const q = 1 - ex * ex - ez * ez;
        if (q > 0) {
          const y = t.cy + t.ry * Math.sqrt(q);
          top = y > top ? y : top;
        }
      }
    }
    return top;
  }

  return {
    treeAt, treesIn, canopyBlocks, canopyLos, crownTopAt, cellOf, standAt,
  };
}
