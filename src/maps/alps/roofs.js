/*
 * roofs.js: the buildings' roofs as surfaces a craft can land on, and the
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
 * So a roof is now what the drawn roof is: its upper faces, each a plane
 * over a convex plan, in the frame the builder put it in. Most are the
 * shell alps/kit.js roofShell builds; the rest (a lean-to, a hut's two
 * slabs, a spire, the city's drawn roof triangles) are made from the same
 * numbers their drawing is made from (gableTop, shedTop, flatTop,
 * pyramidTop, recordAt). The map's height(x, z, fromY) offers the highest
 * roof within a step of fromY, the same rule the city's decks and the
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
 * plane is the only contact there is. A building's other solid parts (a
 * bus shelter's three walls, a lean-to's posts, a spire's inside) are
 * noted by its builder as boxes in its own frame and stood the same way
 * (partSolids); a chimney through the roof is one too, and stays solid
 * while the roof is ground, because it stands on the roof. A balcony is
 * not: a box against the wall's face made an inside corner a wreck was
 * pushed out of into the wall (a Cub into a swiss2 house's eave wall came
 * out inside the house), so the balconies stay drawn and not solid.
 *
 * Everything evaluated per step is + - * / and comparisons on numbers fixed
 * when the map was built, so the ground the plant is given is the same on
 * every machine (CLAUDE.md, determinism).
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
 * by SURFACE_BIAS, 0.4 m, so for a craft a roof up to 0.15 m over its
 * centre is its ground). */
const STEP = 0.55;
/* The roof lookup's cell, metres. The biggest roof here is under 30 m. */
const CELL = 8;
/* How far past a roof's edge a craft over its level still has the solids
 * under its eaves as cover, metres: the swept ellipsoid reaches a wing's
 * half span ahead of the craft, 0.9 m on the Skyhunter, and a hut's walls
 * stand 0.55 m in from its eaves and a lean-to's posts 0.2 m. Only what
 * stands no higher than the plate: a gable stands higher than the eaves a
 * reach away, and passing it from beside the eaves opened the attic to a
 * craft flying at the gable. */
const COVER_REACH = 1.0;
/* And how far under that roof's edge the craft may be, metres: a plane
 * climbing onto a steep roof with short eaves (a boathouse's, 36 degrees
 * over half a metre) is under the edge's level until it is at the edge,
 * where the roof over it becomes its ground. Only a craft with no roof
 * over it at all has it: under the eaves, the walls stand. */
const REACH_DROP = 0.5;
/* Looked for at a third, two thirds and all of the reach, each way along
 * the world's axes: a steep roof a whole reach in is already over the
 * craft, where its eaves a hand in are not. */
const REACH = [];
for (const r of [COVER_REACH / 3, (2 * COVER_REACH) / 3, COVER_REACH]) {
  REACH.push([r, 0], [-r, 0], [0, r], [0, -r]);
}
/* The walls' columns and the gables' pieces, metres. Each box's top is
 * held under the roof's upper face at every corner it has (cutOf), so on
 * a turned building a column under the eaves stops short of the plate by
 * what the roof falls over the column's reach past the wall, and a finer
 * stair costs boxes for nothing a craft could fit through. */
const STAIR = 0.25;
/* How far under the roof's upper face a solid's top is held, metres. */
const SKIN = 0.02;
/* A gable's thickness into the house, metres: more than the thinnest
 * craft's sweep, so a turned gable's pieces meet with no gap between. */
const GABLE_T = 0.4;

/*
 * What a roof covering is to the crash physics, by the key it was drawn
 * in (configs/parts.js SURFACES). Shingles are larch, slate is a rock (the
 * Oberland's eternit slate board is fibre cement, the same class), a
 * hangar's standing seam and a shed's tin are steel, and the lake
 * hamlet's and the city's clay tiles are fired clay, the nearest of which
 * the module has is rock. The module has no tile, slate or shingle of its
 * own: src/maps/README.md, Roofs, says what that costs.
 */
export function roofMaterial(key) {
  const name = String(key).split(':')[0];
  if (/^shingle/.test(name)) {
    return 'wood';
  }
  if (/^(slate|tile)/.test(name)) {
    return 'rock';
  }
  if (/roof$|Roof$|metal|^tin/.test(name)) {
    return 'metal';
  }
  return 'wood';
}

/*
 * Upper faces for the shapes a builder draws other than with roofShell,
 * in the roofShell convention: the plate is y = 0, x runs across the
 * ridge, z along it. Each face is a convex polygon of [x, y, z] points,
 * wound either way.
 */
/* Two slopes meeting at a ridge along z at x = 0: the eaves at +-ex, yT
 * high, the ridge yR, from zA to zB. */
export function gableTop(ex, yT, yR, zA, zB) {
  return [
    [[-ex, yT, zA], [-ex, yT, zB], [0, yR, zB], [0, yR, zA]],
    [[ex, yT, zB], [ex, yT, zA], [0, yR, zA], [0, yR, zB]],
  ];
}
/* One slope from (x0, y0) to (x1, y1) across x, from zA to zB. */
export function shedTop(x0, y0, x1, y1, zA, zB) {
  return [[[x0, y0, zA], [x0, y0, zB], [x1, y1, zB], [x1, y1, zA]]];
}
/* A flat top at y over x0..x1, z0..z1. */
export function flatTop(x0, z0, x1, z1, y) {
  return [[[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]]];
}
/* An n sided pyramid (a spire) round the origin: its base corners r out
 * at y0, the first at angle a0 from +x toward +z, its apex at y1. */
export function pyramidTop(n, r, y0, y1, a0 = 0) {
  const out = [];
  for (let k = 0; k < n; k += 1) {
    const a = a0 + (k / n) * Math.PI * 2;
    const b = a0 + ((k + 1) / n) * Math.PI * 2;
    out.push([[Math.cos(a) * r, y0, Math.sin(a) * r], [Math.cos(b) * r, y0, Math.sin(b) * r], [0, y1, 0]]);
  }
  return out;
}

/*
 * A spire's inside as solid parts, boxes in its frame: its faces are too
 * steep to be ground a fast craft can meet level (a face that rises more
 * than the plant's step between two of its 1 ms steps is not offered, and
 * at 77 degrees that is 40 m/s), so under them it is a wall. An octagon
 * with its flats on the frame's axes, r to its corners, from y0 to the
 * apex at y1, in bands of `band` metres, each band three boxes (a cross
 * reaching the flats on the axes and a square reaching the diagonal
 * ones) sized to the octagon at the band's top, so none stands out of it.
 */
export function spireCore(r, y0, y1, band = 0.5) {
  const out = [];
  const rho0 = r * Math.cos(Math.PI / 8);
  for (let y = y0; y < y1 - band; y += band) {
    const rho = rho0 * (1 - (y + band - y0) / (y1 - y0));
    const arm = rho * (Math.SQRT2 - 1);
    const sq = rho / Math.SQRT2;
    out.push([-rho, y, -arm, rho, y + band, arm], [-arm, y, -rho, arm, y + band, rho], [-sq, y, -sq, sq, y + band, sq]);
  }
  return out;
}

/*
 * One roof, from its local top faces and the matrix it was put with (bake
 * space: y is over the village's datum, which standWalls sets as `lift`;
 * a roof put in world space keeps lift 0). The shape is { top, dy, hw, hd }
 * and optionally `open` (a roof on posts, nothing under it to stand),
 * `base` (where its walls start, under the plate, for one standing on
 * another roof: a dormer) and `kind` (what the building is, for the
 * checks). dy is the shell's depth
 * under its top, hw by hd the walls it stands on. `sag` is the swiss2 old
 * roof's dip, { zA, zB, drop } in the roof's own z (parts.js sagFrame).
 * The matrix must be a turn about y and a move: every frame in the kit
 * is, and a roof that is not would need a real inverse here.
 */
export function roofRecord({ top, dy, hw, hd, open = false, base = null, kind = null }, e, key, sag = null) {
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
    /* Wound either way; a face standing on edge is a wall, not ground. */
    if (!(Math.abs(ny) > 1e-9)) {
      continue;
    }
    const [x0, y0, z0] = poly[0];
    const a = -nx / ny;
    const b = -nz / ny;
    faces.push({ pts: poly.map((p) => [p[0], p[2]]), a, b, d: y0 - a * x0 - b * z0 });
  }
  const rec = {
    key, kind, open, base, material: roofMaterial(key), c: e[0], s: e[8], tx: e[12], ty: e[13], tz: e[14], lift: 0,
    faces, dy, hw, hd, sag: null, solids: [], eaves: [], minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity,
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

/* The matrix elements roofRecord reads for a frame at (x, y, z) turned ry
 * about y, the kit's frame() convention: local +x is world (cos, -sin). */
export function frameElements(x, y, z, ry) {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, x, y, z, 1];
}

/* A roof put at a frame given by its place and turn rather than by a
 * matrix: what a builder that draws its own triangles records. */
export function recordAt(shape, key, x, y, z, ry) {
  return roofRecord(shape, frameElements(x, y, z, ry), key);
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

/* The roof's top at a world (x, z), world y, or NaN off its plan. */
export function roofTop(rec, x, z) {
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
  return rec.lift + rec.ty + best - (rec.sag ? sagDrop(rec.sag, lz) : 0);
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
 * A turned rectangle (its four world corners [x, z]) as axis aligned
 * plan boxes [x0, z0, x1, z1]: cut into columns across the world's x
 * wherever it is turned, one box the whole way where it is square to the
 * world.
 */
function columns(rect) {
  const xs = rect.map((p) => p[0]);
  const x0 = Math.min(...xs);
  const n = Math.max(1, Math.ceil((Math.max(...xs) - x0) / STAIR));
  const out = [];
  let run = null;
  for (let i = 0; i < n; i += 1) {
    const q = clip(rect, x0 + i * STAIR, -Infinity, x0 + (i + 1) * STAIR, Infinity);
    if (q.length < 3) {
      continue;
    }
    const qx = q.map((p) => p[0]);
    const qz = q.map((p) => p[1]);
    const col = [Math.min(...qx), Math.min(...qz), Math.max(...qx), Math.max(...qz)];
    if (run && Math.abs(run[1] - col[1]) < 1e-6 && Math.abs(run[3] - col[3]) < 1e-6) {
      run[2] = col[2];
      continue;
    }
    if (run) {
      out.push(run);
    }
    run = col;
  }
  if (run) {
    out.push(run);
  }
  return out;
}

/* The roof's frame: local (lx, lz) to world [x, z]. */
function worldOf(rec) {
  return (lx, lz) => [rec.c * lx + rec.s * lz + rec.tx, -rec.s * lx + rec.c * lz + rec.tz];
}

/*
 * The solids under one roof, as axis aligned boxes [x0, y0, z0, x1, y1, z1]
 * in world space. The wall rectangle is the roof's own hw by hd: the wall
 * plate the roof sits on, which is the storey under it on every building
 * in the kit. An open roof stands on posts and has none.
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
export function roofSolids(rec, foot) {
  if (rec.open) {
    return [];
  }
  const bottom = rec.base != null ? rec.lift + rec.ty + rec.base : foot;
  const cut = cutOf(rec);
  const out = [];
  if (!(cut.plate > bottom + 0.05)) {
    return out;
  }
  const { world } = cut;
  const rect = [world(rec.hw, rec.hd), world(rec.hw, -rec.hd), world(-rec.hw, -rec.hd), world(-rec.hw, rec.hd)];
  for (const b of columns(rect)) {
    out.push([b[0], bottom, b[1], b[2], cut.under(b, cut.plate), b[3]]);
  }
  return out.concat(gableSolids(rec, cut));
}

/*
 * What a roof's solids are cut to: its frame, its underside and top at a
 * point (Infinity off its plan: a corner out past a gable the roof ends
 * flush with, a station's, says nothing about the roof over the box), and
 * a plan box's top held into the shell, never over the roof's upper face
 * at any corner, so no solid stands proud of the roof a craft sees. On a
 * turned building a box's corners reach past the walls under the eaves,
 * where the roof comes down lower than the plate.
 */
function cutOf(rec) {
  const topAt = (x, z) => {
    const t = roofTop(rec, x, z);
    return Number.isNaN(t) ? Infinity : t;
  };
  const under = (box, top) => Math.min(top, topAt(box[0], box[1]) - SKIN, topAt(box[2], box[1]) - SKIN,
    topAt(box[0], box[3]) - SKIN, topAt(box[2], box[3]) - SKIN);
  /* An old roof dips between its gables, and its plate with it. */
  const plate = rec.lift + rec.ty - (rec.sag ? rec.sag.v : 0);
  return {
    world: worldOf(rec), underside: (x, z) => topAt(x, z) - rec.dy, under, plate,
  };
}

/*
 * The thin wall under each gable of a roof, standing on its plate, cut
 * along its length, each piece up to the highest point of the underside
 * over it and held into the shell (cutOf): a piece topped at the lowest
 * point left a slot under the verge a quad could fly into the attic
 * through. None under a hip, whose ends come down to the eaves.
 */
export function gableSolids(rec, cut = cutOf(rec)) {
  const { world, underside, under, plate } = cut;
  const out = [];
  const pieces = Math.max(1, Math.ceil((2 * rec.hw) / STAIR));
  for (const side of [-1, 1]) {
    const zo = side * rec.hd;
    const zi = side * (rec.hd - GABLE_T);
    for (let k = 0; k < pieces; k += 1) {
      const a = -rec.hw + (2 * rec.hw * k) / pieces;
      const b = -rec.hw + (2 * rec.hw * (k + 1)) / pieces;
      const q = [world(a, zo), world(b, zo), world(b, zi), world(a, zi)];
      let top = -Infinity;
      for (const [x, z] of q) {
        const u = underside(x, z);
        if (u !== Infinity && u > top) {
          top = u;
        }
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
 * A solid part a builder noted in its own frame, { e, box, cover }: e the
 * frame's matrix elements (bake space, a turn about y and a move), box
 * [x0, y0, z0, x1, y1, z1] local to it, `lift` the datum its y is over.
 * As world boxes, in columns wherever it is turned.
 */
export function partSolids({ e, box }, lift) {
  const rec = { c: e[0], s: e[8], tx: e[12], tz: e[14] };
  const world = worldOf(rec);
  const [x0, y0, z0, x1, y1, z1] = box;
  const rect = [world(x1, z1), world(x1, z0), world(x0, z0), world(x0, z1)];
  const y = lift + e[13];
  return columns(rect).map((b) => [b[0], y + y0, b[1], b[2], y + y1, b[3]]);
}

/*
 * Stand a building's walls: `box` is the old keep out box round its
 * footprint, [x0, y0, z0, x1, y1, z1], `roofs` the records its builder
 * put and `parts` the solids it noted, over the datum `lift`. A building
 * with no roof keeps the box. One with roofs gets the walls under each
 * (roofSolids) and its parts, and its footprint is noted as the box's,
 * so a style that keeps things off the walls (swiss2.js) keeps them off
 * exactly what it always did; the `true` tells that style's addBox the
 * footprint is already noted, and `note: false` is for a building whose
 * footprint its builder notes itself. The collider indices go on the
 * roof, for cover(): a part that covers goes on the roof over its middle
 * (or the first that stands on walls), and one that does not (a chimney)
 * on none.
 */
export function standWalls(colliders, box, roofs, lift, { parts = [], note = true } = {}) {
  if (!roofs.length) {
    colliders.addBox('wall', ...box);
    return;
  }
  if (note) {
    colliders.noteFootprint?.(box[0], box[2], box[3], box[5]);
  }
  for (const r of roofs) {
    r.lift = lift;
  }
  /* Each solid goes on its roof's list, and on its list of what is
   * under the eaves when it stands no higher than the plate. */
  const put = (r, boxes) => {
    const plate = r.lift + r.ty;
    for (const b of boxes) {
      const i = colliders.addBox('wall', ...b, true);
      r.solids.push(i);
      if (b[4] <= plate + 0.05) {
        r.eaves.push(i);
      }
    }
  };
  for (const r of roofs) {
    r.solids = [];
    r.eaves = [];
    put(r, roofSolids(r, box[1]));
  }
  for (const p of parts) {
    const boxes = partSolids(p, lift);
    if (!p.cover) {
      for (const b of boxes) {
        colliders.addBox('wall', ...b, true);
      }
      continue;
    }
    const x = p.e[0] * (p.box[0] + p.box[3]) * 0.5 + p.e[8] * (p.box[2] + p.box[5]) * 0.5 + p.e[12];
    const z = -p.e[8] * (p.box[0] + p.box[3]) * 0.5 + p.e[0] * (p.box[2] + p.box[5]) * 0.5 + p.e[14];
    const over = roofs.find((r) => !Number.isNaN(roofTop(r, x, z))) ?? roofs.find((r) => !r.open) ?? roofs[0];
    put(over, boxes);
  }
}

/*
 * The map's roofs: `records`, each with the collider indices of its own
 * solids in `solids` (possibly none) and its datum in `lift`. Build once;
 * the queries allocate nothing.
 */
export function makeRoofs(records) {
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
    /* Which roof's solids pass, and whether all of them or only those
     * under its eaves (a reach off its edge). */
    covering: -1,
    coveringAll: false,
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
        const h = roofTop(r, x, z);
        if (!(h > best) || (fromY != null && fromY + STEP < h)) {
          continue;
        }
        best = h;
        set.last = i;
      }
      return best;
    },
    /* Roof i's own top at (x, z), NaN off it: for the checks. */
    top(i, x, z) {
      return roofTop(records[i], x, z);
    },
    /* The material of the roof under (x, z) whose top is y, or null. */
    materialAt(x, z, y) {
      set.height(x, z, y + 0.01 - STEP, -Infinity);
      if (set.last < 0 || Math.abs(roofTop(records[set.last], x, z) - y) > 0.01) {
        return null;
      }
      return records[set.last].material;
    },
    /*
     * The craft is at (x, z) and its ground query is made from fromY: if
     * that ground is a roof, or a roof on posts a reach away is, its
     * solids let the sweep through, and every other roof's are solid
     * again. The pass flags are src/game/collide.js Colliders.pass, which
     * only hit() reads; crashworld's trees own other indices of the same
     * array.
     */
    cover(colliders, x, z, fromY) {
      set.height(x, z, fromY, -Infinity);
      const all = set.last >= 0;
      /* Just off a roof's edge, with no roof over it and not far under
       * the edge's level, the roof it is about to be on covers what is
       * under its eaves: that is under the roof, and so, when the craft
       * is over it, under the craft. */
      if (!all) {
        set.height(x, z, null, -Infinity);
        const under = set.last >= 0;
        set.last = -1;
        for (let k = 0; k < REACH.length && !under && set.last < 0; k += 1) {
          set.height(x + REACH[k][0], z + REACH[k][1], fromY + REACH_DROP, -Infinity);
        }
      }
      const want = set.last;
      if (want === set.covering && all === set.coveringAll) {
        return;
      }
      const flag = (i, every, v) => {
        for (const c of i < 0 ? [] : every ? records[i].solids : records[i].eaves) {
          colliders.pass[c] = v;
        }
      };
      flag(set.covering, set.coveringAll, 0);
      flag(want, all, 1);
      set.covering = want;
      set.coveringAll = all;
    },
  };
  return set;
}
