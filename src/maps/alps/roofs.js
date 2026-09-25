/*
 * roofs.js: the village's roofs as surfaces a craft can land on, and the
 * solids under them.
 *
 * The owner's report: "buildings' roofs don't seem to work: when I approach
 * them the airplane crashes. I'd like to use the building roofs as ramps of
 * sorts, to make airplanes able to skid or bounce off them." Measured on
 * swiss2 before this file existed: every building was ONE axis aligned box
 * round its rotated footprint, balconies included, from the foundation to
 * 0.9 m over the ridge. A Cub gliding in at 7 degrees met a vertical face of
 * that box a metre outside the drawn eave and a metre above the ridge, and
 * was a wreck; one diving onto the same roof came to rest sliding along the
 * box's flat top 2.1 m over the tiles. The roof was never ground at all: the
 * map's height() was the terrain and nothing else.
 *
 * So a roof is now what the drawn roof is: the upper faces of the shell
 * alps/kit.js roofShell builds, each a plane over a convex plan, in the
 * frame the builder put it in. The map's height(x, z, fromY) offers the
 * highest roof within a step of fromY, the same rule the city's decks and the
 * field's launch stands use, so the plant's own ground contact slides,
 * bounces and rests the craft on it exactly as it does on a hillside, with
 * the roof's material for its friction (src/maps/README.md, Roofs).
 *
 * The WALLS under a roof stay walls: the walls up to the plate and a thin
 * wall under each gable, in axis aligned boxes because that is the one box
 * src/game/collide.js has, each under the shell's underside so no solid
 * stands proud of the roof a craft sees (roofSolids). They are inside the
 * shell, but a craft riding the roof would still reach them with its swept
 * ellipsoid, which grows to the wing's half span as it banks onto the
 * slope, so a roof that is the craft's ground lends its solids the
 * collider's pass flag (cover()) and the plant's contact with the roof
 * plane is the only contact there is.
 *
 * Everything evaluated per step is + - * / and comparisons on numbers fixed
 * when the village was built, so the ground the plant is given is the same
 * on every machine (CLAUDE.md, determinism).
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/* The step a roof must be within of the query's fromY to be offered, the
 * walker's rule the city and the field already use (main.js biases fromY
 * by SURFACE_BIAS, so for a craft this is 0.15 m under its centre). */
const STEP = 0.55;
/* The roof lookup's cell, metres. The biggest roof here is under 30 m. */
const CELL = 8;
/* The walls' columns and the gables' pieces, metres. Each box's top sits
 * under the lowest point of the underside over its corners, so what is
 * left open under the roof grows with it: at a quarter metre the steepest
 * turned barn (pitch 0.72, 0.5 rad off the axes) keeps its walls within
 * 0.2 m of the plate and its gables within 0.4 m of the verge, and a
 * building square to the world within 0.01 m and 0.13 m. */
const STAIR = 0.25;
/* A gable's thickness into the house, metres: more than the thinnest
 * craft's sweep, so a turned gable's pieces meet with no gap between. */
const GABLE_T = 0.4;

/*
 * What a roof covering is to the crash physics, by the bake key it was
 * drawn in (configs/parts.js SURFACES). Shingles are larch, slate is a rock
 * (the Oberland's eternit slate board is fibre cement, the same class), a
 * hangar's standing seam is steel. There is no clay tile anywhere in these
 * two villages, and the module has no tile, slate or shingle of its own:
 * src/maps/README.md, Roofs, says what that costs.
 */
export function roofMaterial(key) {
  const name = String(key).split(':')[0];
  if (/^shingle/.test(name)) {
    return 'wood';
  }
  if (/^slate/.test(name)) {
    return 'rock';
  }
  if (/roof$|Roof$|metal/.test(name)) {
    return 'metal';
  }
  return 'wood';
}

/*
 * One roof, from the local top faces of a roofShell and the matrix it was
 * put with (bake space: y is over the village's datum). `sag` is the
 * swiss2 old roof's dip, { zA, zB, drop } in the roof's own z (parts.js
 * sagFrame). The matrix must be a turn about y and a move: every frame in
 * the kit is, and a roof that is not would need a real inverse here.
 */
export function roofRecord({ top, dy, hw, hd }, e, key, sag = null) {
  if (Math.abs(e[5] - 1) > 1e-6 || Math.abs(e[1]) > 1e-6 || Math.abs(e[9]) > 1e-6) {
    throw new Error('roofs: a roof put with a tilt or a scale');
  }
  const faces = [];
  for (const poly of top) {
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      nx += (a[1] - b[1]) * (a[2] + b[2]);
      ny += (a[2] - b[2]) * (a[0] + b[0]);
      nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    if (!(ny > 1e-9)) {
      continue;
    }
    const [x0, y0, z0] = poly[0];
    const a = -nx / ny;
    const b = -nz / ny;
    faces.push({ pts: poly.map((p) => [p[0], p[2]]), a, b, d: y0 - a * x0 - b * z0 });
  }
  const rec = {
    key, material: roofMaterial(key), c: e[0], s: e[8], tx: e[12], ty: e[13], tz: e[14],
    faces, dy, hw, hd, sag: null, solids: [], minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity,
  };
  if (sag && sag.drop > 0) {
    /* The drawn dip is a half sine cut at the thirds (sagFrame), so the
     * shell between the cuts is straight: the knots carry sin(pi / 3). */
    const v = sag.drop * Math.sqrt(3) * 0.5;
    rec.sag = { z0: sag.zA, z1: sag.zA + (sag.zB - sag.zA) / 3, z2: sag.zA + (2 * (sag.zB - sag.zA)) / 3, z3: sag.zB, v };
  }
  for (const f of faces) {
    for (const [lx, lz] of f.pts) {
      const x = rec.c * lx + rec.s * lz + rec.tx;
      const z = -rec.s * lx + rec.c * lz + rec.tz;
      rec.minX = Math.min(rec.minX, x);
      rec.maxX = Math.max(rec.maxX, x);
      rec.minZ = Math.min(rec.minZ, z);
      rec.maxZ = Math.max(rec.maxZ, z);
    }
  }
  return rec;
}

/* Is (x, z) inside the convex polygon pts, either winding, edges in. */
function inside(pts, x, z) {
  let pos = false;
  let neg = false;
  const n = pts.length;
  for (let i = 0; i < n; i += 1) {
    const a = pts[i];
    const b = pts[i + 1 === n ? 0 : i + 1];
    const cr = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (cr > 1e-7) {
      pos = true;
    } else if (cr < -1e-7) {
      neg = true;
    }
    if (pos && neg) {
      return false;
    }
  }
  return true;
}

function sagDrop(g, lz) {
  if (lz <= g.z0 || lz >= g.z3) {
    return 0;
  }
  if (lz < g.z1) {
    return (g.v * (lz - g.z0)) / (g.z1 - g.z0);
  }
  if (lz > g.z2) {
    return (g.v * (g.z3 - lz)) / (g.z3 - g.z2);
  }
  return g.v;
}

/* The roof's top at a world (x, z), world y (plus `lift`, the village's
 * datum), or NaN off its plan. */
export function roofTop(rec, x, z, lift = 0) {
  const dx = x - rec.tx;
  const dz = z - rec.tz;
  const lx = rec.c * dx - rec.s * dz;
  const lz = rec.s * dx + rec.c * dz;
  let best = -Infinity;
  for (const f of rec.faces) {
    if (!inside(f.pts, lx, lz)) {
      continue;
    }
    const y = f.a * lx + f.b * lz + f.d;
    if (y > best) {
      best = y;
    }
  }
  if (best === -Infinity) {
    return NaN;
  }
  return lift + rec.ty + best - (rec.sag ? sagDrop(rec.sag, lz) : 0);
}

/* A convex polygon [[x, z]...] clipped to x0..x1, z0..z1. */
function clip(poly, x0, z0, x1, z1) {
  let out = poly;
  const edges = [[0, x0, 1], [0, x1, -1], [1, z0, 1], [1, z1, -1]];
  for (const [axis, v, sign] of edges) {
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i += 1) {
      const a = src[i];
      const b = src[(i + 1) % src.length];
      const da = (a[axis] - v) * sign;
      const db = (b[axis] - v) * sign;
      if (da >= 0) {
        out.push(a);
      }
      if ((da >= 0) !== (db >= 0)) {
        const t = da / (da - db);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    if (!out.length) {
      return out;
    }
  }
  return out;
}

/*
 * The solids under one roof, as axis aligned boxes [x0, y0, z0, x1, y1, z1]
 * in world space. `lift` is the village's datum, as for roofTop. The wall
 * rectangle is the roofShell's own hw by hd: the wall plate the roof sits
 * on, which is the storey under it on every building in the kit.
 *
 * The house is closed by three things: the walls from `bottom` up to the
 * plate, the roof shell over the plate, which is ground the plant keeps a
 * craft out of from above, and at each end the gable, which is the one face
 * above the plate a craft can fly square into. So the solids are the walls,
 * cut into columns across the world's x wherever the building is turned,
 * and each gable as a thin wall standing on the plate, cut along its length
 * with each piece's top under the lowest point of the underside over it.
 * The attic between them is empty: nothing gets into it but through them.
 * Filling it instead cost 700 boxes on a turned barn, because a pitched
 * tent turned off the world's axes is a box per half metre square.
 */
export function roofSolids(rec, bottom, lift = 0) {
  const world = (lx, lz) => [rec.c * lx + rec.s * lz + rec.tx, -rec.s * lx + rec.c * lz + rec.tz];
  const underside = (x, z) => {
    const t = roofTop(rec, x, z, lift);
    return (Number.isNaN(t) ? lift + rec.ty + rec.dy : t) - rec.dy;
  };
  /* An old roof dips between its gables, and its plate with it. */
  const plate = lift + rec.ty - (rec.sag ? rec.sag.v : 0);
  const out = [];
  if (!(plate > bottom + 0.05)) {
    return out;
  }
  const rect = [world(rec.hw, rec.hd), world(rec.hw, -rec.hd), world(-rec.hw, -rec.hd), world(-rec.hw, rec.hd)];
  const xs = rect.map((p) => p[0]);
  const x0 = Math.min(...xs);
  const n = Math.max(1, Math.ceil((Math.max(...xs) - x0) / STAIR));
  /* A box stands under the roof at every corner it has, and on a turned
   * building a box's corners reach past the walls under the eaves, where
   * the roof comes down lower than the plate. */
  const under = (box, top) => Math.min(top, underside(box[0], box[1]), underside(box[2], box[1]),
    underside(box[0], box[3]), underside(box[2], box[3]));
  const column = (b) => [b[0], bottom, b[1], b[2], under(b, plate), b[3]];
  let run = null;
  for (let i = 0; i < n; i += 1) {
    const q = clip(rect, x0 + i * STAIR, -Infinity, x0 + (i + 1) * STAIR, Infinity);
    if (q.length < 3) {
      continue;
    }
    const qx = q.map((p) => p[0]);
    const qz = q.map((p) => p[1]);
    const col = [Math.min(...qx), Math.min(...qz), Math.max(...qx), Math.max(...qz)];
    /* A building square to the world is one column the whole way. */
    if (run && Math.abs(run[1] - col[1]) < 1e-6 && Math.abs(run[3] - col[3]) < 1e-6) {
      run[2] = col[2];
      continue;
    }
    if (run) {
      out.push(column(run));
    }
    run = col;
  }
  if (run) {
    out.push(column(run));
  }
  const pieces = Math.max(1, Math.ceil((2 * rec.hw) / STAIR));
  for (const side of [-1, 1]) {
    const zo = side * rec.hd;
    const zi = side * (rec.hd - GABLE_T);
    for (let k = 0; k < pieces; k += 1) {
      const a = -rec.hw + (2 * rec.hw * k) / pieces;
      const b = -rec.hw + (2 * rec.hw * (k + 1)) / pieces;
      const q = [world(a, zo), world(b, zo), world(b, zi), world(a, zi)];
      let top = Infinity;
      for (const [x, z] of q) {
        top = Math.min(top, underside(x, z));
      }
      if (!(top > plate + 0.05)) {
        continue;
      }
      const qx = q.map((p) => p[0]);
      const qz = q.map((p) => p[1]);
      const box = [Math.min(...qx), Math.min(...qz), Math.max(...qx), Math.max(...qz)];
      top = under(box, top);
      if (top > plate + 0.05) {
        out.push([box[0], plate, box[1], box[2], top, box[3]]);
      }
    }
  }
  return out;
}

/*
 * Stand a building's walls: `box` is the old keep out box round its
 * footprint, [x0, y0, z0, x1, y1, z1], and `roofs` the records its builder
 * put. A building with no roof keeps the box. One with roofs gets the
 * walls under each (roofSolids), and its footprint is noted as the box's,
 * so a style that keeps things off the walls (swiss2.js) keeps them off
 * exactly what it always did; the `true` tells that style's addBox the footprint
 * is already noted. The collider indices go on the roof, for cover().
 */
export function standWalls(colliders, box, roofs, lift) {
  if (!roofs.length) {
    colliders.addBox('wall', ...box);
    return;
  }
  colliders.noteFootprint?.(box[0], box[2], box[3], box[5]);
  for (const r of roofs) {
    r.solids = roofSolids(r, box[1], lift).map((b) => colliders.addBox('wall', ...b, true));
  }
}

/*
 * The map's roofs: `records` from the village bake, each with the collider
 * indices of its own solids in `solids` (possibly none), and `lift`, the
 * village's datum. Build once; the queries allocate nothing.
 */
export function makeRoofs(records, lift) {
  const grid = new Map();
  const key = (cx, cz) => (cx + 4096) * 8192 + (cz + 4096);
  records.forEach((r, i) => {
    for (let cx = Math.floor(r.minX / CELL); cx <= Math.floor(r.maxX / CELL); cx += 1) {
      for (let cz = Math.floor(r.minZ / CELL); cz <= Math.floor(r.maxZ / CELL); cz += 1) {
        const k = key(cx, cz);
        if (!grid.has(k)) {
          grid.set(k, []);
        }
        grid.get(k).push(i);
      }
    }
  });
  const set = {
    records,
    /* Which roof the last height() answered with, or -1 for the ground. */
    last: -1,
    covering: -1,
    /*
     * The highest roof at (x, z) within a step of fromY, if it is over
     * `ground`; `ground` otherwise. fromY null offers every roof, the
     * city's rule for a caller asking what is on top.
     */
    height(x, z, fromY, ground) {
      set.last = -1;
      const list = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
      if (!list) {
        return ground;
      }
      let best = ground;
      for (let k = 0; k < list.length; k += 1) {
        const i = list[k];
        const r = records[i];
        if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) {
          continue;
        }
        const h = roofTop(r, x, z, lift);
        if (!(h > best) || (fromY != null && fromY + STEP < h)) {
          continue;
        }
        best = h;
        set.last = i;
      }
      return best;
    },
    /* The material of the roof under (x, z) whose top is y, or null. */
    materialAt(x, z, y) {
      set.height(x, z, y + 0.01 - STEP, -Infinity);
      if (set.last < 0 || Math.abs(roofTop(records[set.last], x, z, lift) - y) > 0.01) {
        return null;
      }
      return records[set.last].material;
    },
    /*
     * The craft is at (x, z) and its ground query is made from fromY: if
     * that ground is a roof, its solids let the sweep through, and every
     * other roof's are solid again. The pass flags are src/game/collide.js
     * Colliders.pass, which only hit() reads; crashworld's trees own other
     * indices of the same array.
     */
    cover(colliders, x, z, fromY) {
      set.height(x, z, fromY, -Infinity);
      const want = set.last;
      if (want === set.covering) {
        return;
      }
      const flag = (i, v) => {
        for (const c of i >= 0 ? records[i].solids : []) {
          colliders.pass[c] = v;
        }
      };
      flag(set.covering, 0);
      flag(want, 1);
      set.covering = want;
    },
  };
  return set;
}
