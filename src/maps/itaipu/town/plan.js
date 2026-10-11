/*
 * plan.js: what each OpenStreetMap building in the hero square is, in
 * numbers: its footprint cleaned, its rectangle, its style, its heights,
 * the faces it is drawn with, its roof as ground (a roofs.js record) and
 * its walls as boxes for the streamed collider set.
 *
 * STYLE. Only 35 buildings in the extract carry a height or a level count
 * and none carries a roof shape (docs/ITAIPU-PLAN.md section 7), so what
 * a building looks like is decided here from what the region builds,
 * matched against the reference photographs (~/Desktop/fdfpv-photoref/
 * itaipu): the houses of Hernandarias and Foz do Iguacu are hipped red
 * clay tile over white or pale render, with flat concrete slabs among
 * them; Brazil adds grey fibre cement and paints its render in colours,
 * Paraguay leaves more brick bare; the big sheds are low gables of
 * galvanised sheet; Itaipu's own buildings are white concrete, flat. The
 * data's own roof (A's rule: hipped for a house under 150 m2) is kept
 * wherever the footprint can carry it. Every choice is a function of the
 * building's OSM id (hashOf), so the town is the same on every load and
 * every machine.
 *
 * COLLISION. The roof is ground for every building (a roofs.js record, a
 * grid entry each). The walls are axis aligned boxes, the one box the
 * shell has, stood under the roof, across whichever world axis needs
 * fewer. The footprint is cut at its corners into runs, and a run into
 * as many columns as keep every wall within STRAY of its box but none
 * narrower than COLUMN: a rectangle square to the axes is one box, a
 * wall a few degrees off them a few, and a building turned well off
 * them columns 1 m wide (section 7). Each column is a box per stretch
 * of it inside the outline, so an L, a U or a courtyard is not filled.
 * They are streamed: this file only says what they are.
 *
 * Pure: no THREE, so the checks run it in Node.
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

import { roofRecord, frameElements, roofTop, gableTop, insideSlabs } from '../../../render/library/roofs.js';

/* How far a wall may stand inside its box, metres: the wedge of solid a
 * craft can meet with nothing drawn there. A wall 30 m long 5 degrees
 * off the axis leaves 2.6 m in one box, so it is cut into six. */
const STRAY = 0.5;
/* The narrowest column, metres (section 7), which bounds the boxes a
 * building turned well off the axes costs: its walls stand up to about
 * COLUMN inside them rather than STRAY. */
export const COLUMN = 1;
/* Solids' tops under the roof's upper face, roofs.js SKIN. */
const SKIN = 0.02;
/* A footprint that fills this much of its rectangle is drawn as that
 * rectangle when its roof is pitched; less, and it keeps a flat roof on
 * its own outline. */
const RECT_FILL = 0.85;
const RECT_CORNERS = 8;
/* Pieces a gable is stood in, across its width. */
const GABLE_PIECES = 8;

/*
 * The styles: the roof, its slope (rise over run: clay tile at 20
 * degrees, fibre cement at 10, sheet at 8), the eaves' overhang and the
 * roof's thickness in metres, and the surfaces (swiss2/look.js building
 * keys, whose group and finish the mesh takes; the tint is ours).
 */
export const ROOFS = {
  tile: { shape: 'hip', slope: 0.364, over: 0.6, thick: 0.18, surface: 'tile', material: 'rock', key: 'tile' },
  fibre: { shape: 'hip', slope: 0.176, over: 0.35, thick: 0.1, surface: 'render', material: 'concrete', key: 'fibre' },
  sheet: { shape: 'gable', slope: 0.141, over: 0.4, thick: 0.12, surface: 'hangarRoof', material: 'metal', key: 'sheetRoof' },
  slab: { shape: 'flat', surface: 'render', material: 'concrete', key: 'slab' },
  sheetFlat: { shape: 'flat', surface: 'hangarRoof', material: 'metal', key: 'sheetRoof' },
};

/* Linear tints on the photographed render, tile and sheet. */
const WALLS = {
  white: [0.78, 0.77, 0.73],
  offwhite: [0.72, 0.69, 0.62],
  cream: [0.74, 0.64, 0.45],
  yellow: [0.78, 0.6, 0.28],
  peach: [0.78, 0.55, 0.42],
  green: [0.52, 0.62, 0.48],
  blue: [0.52, 0.6, 0.68],
  grey: [0.5, 0.5, 0.48],
  brick: [0.56, 0.26, 0.15],
  concrete: [0.8, 0.8, 0.77],
};
const ROOF_TINTS = {
  tile: [[1.3, 0.55, 0.38], [1.1, 0.43, 0.3], [1.45, 0.66, 0.45], [0.95, 0.42, 0.32]],
  fibre: [[0.55, 0.56, 0.56], [0.46, 0.47, 0.47]],
  sheet: [[0.42, 0.44, 0.44], [0.55, 0.57, 0.57], [0.25, 0.32, 0.4], [0.47, 0.19, 0.09]],
  slab: [[0.55, 0.54, 0.5], [0.62, 0.61, 0.58], [0.45, 0.45, 0.43]],
  plant: [[0.72, 0.72, 0.7]],
};
/* Share of each wall colour by bank, of 1. */
const WALL_MIX = {
  py: [['white', 0.3], ['brick', 0.25], ['offwhite', 0.15], ['cream', 0.1], ['peach', 0.08], ['green', 0.06], ['blue', 0.06]],
  br: [['white', 0.35], ['offwhite', 0.15], ['cream', 0.12], ['yellow', 0.1], ['peach', 0.08], ['green', 0.07], ['blue', 0.07], ['grey', 0.06]],
};

/* FNV-1a over the id, then a second draw per `salt`: [0, 1). */
export function hashOf(id, salt = 0) {
  let h = 0x811c9dc5 ^ salt;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

function pick(mix, u) {
  let acc = 0;
  for (const [name, w] of mix) {
    acc += w;
    if (u < acc) {
      return name;
    }
  }
  return mix[mix.length - 1][0];
}

/*
 * Which bank: Paraguay west of the Parana, Brazil east. Below the dam the
 * river's middle runs from x -925 at z 400 to x -1506 at the Friendship
 * Bridge (frame.js LANDMARKS); above it the border is the reservoir's
 * middle, taken as x -600. Only colours ride on it.
 */
export function bankOf(x, z) {
  const riverX = z > -1700 ? -925 + ((z - 400) * (-1506 + 925)) / (9535 - 400) : -600;
  return x < riverX ? 'py' : 'br';
}

/* Signed area, positive counterclockwise with x right and z up the page. */
export function signedArea(ring) {
  let s = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    s += p[0] * q[1] - q[0] * p[1];
  }
  return s / 2;
}

/*
 * The footprint without its closing point, repeated corners or corners on
 * a straight run, wound with positive area. Throws on a footprint with
 * nothing left: the data is A's contract and a building that is not a
 * polygon is a pipeline bug, not something to draw round.
 */
export function cleanRing(outer, id) {
  let ring = outer.slice();
  const same = (a, b) => Math.abs(a[0] - b[0]) < 0.05 && Math.abs(a[1] - b[1]) < 0.05;
  if (ring.length > 1 && same(ring[0], ring[ring.length - 1])) {
    ring.pop();
  }
  ring = ring.filter((p, i) => !same(p, ring[(i + 1) % ring.length]));
  let changed = true;
  while (changed && ring.length > 3) {
    changed = false;
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[(i + ring.length - 1) % ring.length];
      const b = ring[i];
      const c = ring[(i + 1) % ring.length];
      const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (Math.abs(cr) < 0.01 * Math.hypot(c[0] - a[0], c[1] - a[1])) {
        ring.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  if (ring.length < 3 || !(Math.abs(signedArea(ring)) > 0.5)) {
    throw new Error(`town: building ${id} has no footprint left (${outer.length} points)`);
  }
  return signedArea(ring) < 0 ? ring.reverse() : ring;
}

/*
 * The smallest rectangle round the ring, from its edges' directions:
 * centre, the long axis (ux, uz), a unit vector, and the half long and
 * half short sides.
 */
export function rectOf(ring) {
  let best = null;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const c = (b[0] - a[0]) / len;
    const s = (b[1] - a[1]) / len;
    let u0 = Infinity;
    let u1 = -Infinity;
    let v0 = Infinity;
    let v1 = -Infinity;
    for (const p of ring) {
      const u = p[0] * c + p[1] * s;
      const v = -p[0] * s + p[1] * c;
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      v0 = Math.min(v0, v);
      v1 = Math.max(v1, v);
    }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area - 1e-9) {
      best = { area, c, s, u0, u1, v0, v1 };
    }
  }
  const { c, s, u0, u1, v0, v1 } = best;
  const um = (u0 + u1) / 2;
  const vm = (v0 + v1) / 2;
  const hu = (u1 - u0) / 2;
  const hv = (v1 - v0) / 2;
  const [ux, uz] = hu >= hv ? [c, s] : [-s, c];
  return {
    cx: um * c - vm * s,
    cz: um * s + vm * c,
    ux,
    uz,
    hl: Math.max(hu, hv),
    hs: Math.min(hu, hv),
    area: best.area,
  };
}

/*
 * Ear clipping, for a flat roof over a footprint that may be concave:
 * triangles as index triples into `ring` (positive area). Throws if an
 * ear cannot be found, which only a self crossing footprint does.
 */
export function triangulate(ring, id) {
  const idx = ring.map((_, i) => i);
  const out = [];
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inTri = (p, a, b, c) => cross(a, b, p) > 1e-9 && cross(b, c, p) > 1e-9 && cross(c, a, p) > 1e-9;
  let guard = 0;
  while (idx.length > 3) {
    let cut = false;
    for (let k = 0; k < idx.length; k += 1) {
      const ia = idx[(k + idx.length - 1) % idx.length];
      const ib = idx[k];
      const ic = idx[(k + 1) % idx.length];
      const [a, b, c] = [ring[ia], ring[ib], ring[ic]];
      if (!(cross(a, b, c) > 1e-9)) {
        continue;
      }
      if (idx.some((j) => j !== ia && j !== ib && j !== ic && inTri(ring[j], a, b, c))) {
        continue;
      }
      out.push([ia, ib, ic]);
      idx.splice(k, 1);
      cut = true;
      break;
    }
    guard += 1;
    if (!cut || guard > 10000) {
      /* Only a footprint crossing itself has no ear left; OSM validators
       * let a few through. Its remaining corners are fanned, which covers
       * the crossing twice but leaves no hole in the roof. */
      for (let k = 1; k + 1 < idx.length; k += 1) {
        out.push([idx[0], idx[k], idx[k + 1]]);
      }
      return { tris: out, crossed: true, id };
    }
  }
  out.push([idx[0], idx[1], idx[2]]);
  return { tris: out, crossed: false, id };
}

/*
 * A footprint's triangles (triangulate) merged into convex pieces, as
 * index lists into `ring`: two pieces sharing an edge are one while the
 * union stays convex (Hertel and Mehlhorn), so a convex footprint is one
 * piece and a concave one at most four times the fewest it could be cut
 * into.
 */
export function convexPieces(ring, tris) {
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  /* Wound the way triangulate winds, positive, with collinear corners
   * allowed: a footprint's straight run is cut by its triangles too. */
  const convex = (piece) => piece.every((k, i) => cross(ring[piece[(i + piece.length - 1) % piece.length]], ring[k], ring[piece[(i + 1) % piece.length]]) >= -1e-9);
  const pieces = tris.map((t) => t.slice());
  for (let merged = true; merged;) {
    merged = false;
    for (let a = 0; a < pieces.length && !merged; a += 1) {
      for (let b = a + 1; b < pieces.length && !merged; b += 1) {
        const P = pieces[a];
        const Q = pieces[b];
        /* An edge P[i] to P[i + 1] that Q has the other way round. */
        for (let i = 0; i < P.length && !merged; i += 1) {
          const p0 = P[i];
          const p1 = P[(i + 1) % P.length];
          const j = Q.findIndex((k, jj) => k === p1 && Q[(jj + 1) % Q.length] === p0);
          if (j < 0) {
            continue;
          }
          /* P from p1 round to p0, then Q's corners strictly between p0
           * and p1 going round from p0. */
          const U = [];
          for (let k = 0; k < P.length; k += 1) {
            U.push(P[(i + 1 + k) % P.length]);
          }
          for (let k = 2; k < Q.length; k += 1) {
            U.push(Q[(j + k) % Q.length]);
          }
          if (convex(U)) {
            pieces[a] = U;
            pieces.splice(b, 1);
            merged = true;
          }
        }
      }
    }
  }
  return pieces;
}

function inside(ring, x, z) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      c = !c;
    }
  }
  return c;
}

/* Is (x, z) inside any of the landuse areas `areas` ([{ outer, box }]). */
function within(areas, x, z) {
  return areas.some((a) => x >= a.box[0] && x <= a.box[2] && z >= a.box[1] && z <= a.box[3] && inside(a.outer, x, z));
}

export function landuseAreas(features, value) {
  return features.filter((f) => f.key === 'landuse' && f.value === value).map((f) => {
    let box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, z] of f.outer) {
      box = [Math.min(box[0], x), Math.min(box[1], z), Math.max(box[2], x), Math.max(box[3], z)];
    }
    return { id: f.id, outer: f.outer, box };
  });
}

/*
 * The style of one building: its roof (a ROOFS key), whether it is drawn
 * on its rectangle, the wall and roof tints, and what kind of building
 * the roof record says it is.
 */
export function styleOf(f, ring, rect, industrial) {
  const bank = bankOf(rect.cx, rect.cz);
  const u = hashOf(f.id);
  const fill = Math.abs(signedArea(ring)) / rect.area;
  const rectLike = fill >= RECT_FILL && ring.length <= RECT_CORNERS && rect.hs >= 1.5;
  const tintOf = (list, salt) => list[Math.floor(hashOf(f.id, salt) * list.length)];
  const plant = within(industrial, rect.cx, rect.cz);
  let roof;
  if (plant) {
    roof = 'slab';
  } else if (f.building === 'industrial' || f.building === 'warehouse' || f.area >= 1200) {
    roof = rectLike ? 'sheet' : 'sheetFlat';
  } else if (!rectLike || f.area > 400 || f.building === 'apartments') {
    roof = 'slab';
  } else if (f.roof === 'hipped') {
    roof = 'tile';
  } else if (bank === 'br') {
    roof = u < 0.55 ? 'tile' : u < 0.8 ? 'fibre' : 'slab';
  } else {
    roof = u < 0.7 ? 'tile' : 'slab';
  }
  const spec = ROOFS[roof];
  const wall = plant ? WALLS.concrete : WALLS[pick(WALL_MIX[bank], hashOf(f.id, 1))];
  let roofTint;
  if (plant) {
    roofTint = ROOF_TINTS.plant[0];
  } else if (roof === 'sheet' || roof === 'sheetFlat') {
    roofTint = tintOf(ROOF_TINTS.sheet, 2);
  } else {
    roofTint = tintOf(ROOF_TINTS[roof], 2);
  }
  const kind = spec.shape === 'hip' ? 'house' : spec.shape === 'gable' ? 'shed' : 'flat';
  return {
    roof, spec, bank, wall, roofTint, kind, onRect: spec.shape !== 'flat', plant,
  };
}

/*
 * Where the building stands: its walls from a little under the lowest
 * ground at a corner (so no gap shows on a slope) to the plate, its
 * height over the mean ground at its corners, and at least a storey over
 * the highest corner, so a house on a steep lot is not a slot.
 */
export function heightsOf(ring, ground, height) {
  let lo = Infinity;
  let hi = -Infinity;
  let sum = 0;
  for (const [x, z] of ring) {
    const g = ground(x, z);
    lo = Math.min(lo, g);
    hi = Math.max(hi, g);
    sum += g;
  }
  const mean = sum / ring.length;
  return { base: lo - 0.3, plate: Math.max(mean + height, hi + 2.4) };
}

/* The rectangle's four corners, counterclockwise. */
export function rectRing(rect) {
  const at = (u, v) => [rect.cx + u * rect.ux - v * rect.uz, rect.cz + u * rect.uz + v * rect.ux];
  return [at(-rect.hl, -rect.hs), at(rect.hl, -rect.hs), at(rect.hl, rect.hs), at(-rect.hl, rect.hs)];
}

/*
 * The roof as ground, a roofs.js record, and the faces it is drawn with
 * (world [x, y, z] polygons, each with the way it faces).
 *
 * A pitched roof is in roofs.js's frame: x across the ridge, z along it,
 * y from the plate; the ridge along the rectangle's long side. The upper
 * face stands `thick` over the plate at the wall line and runs out over
 * the eaves; the drawn roof is a slab `thick` deep with its fascia.
 */
export function roofOf(style, ring, rect, plate, id) {
  const { spec } = style;
  if (spec.shape === 'flat') {
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const [x, z] of ring) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
    }
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const { tris } = triangulate(ring, id);
    const top = tris.map((t) => t.map((k) => [ring[k][0] - cx, 0, ring[k][1] - cz]));
    const rec = roofRecord({ top, dy: 0.15, hw: (x1 - x0) / 2, hd: (z1 - z0) / 2, kind: style.kind }, frameElements(cx, plate, cz, 0), spec.key);
    rec.material = spec.material;
    const faces = tris.map((t) => ({ pts: t.map((k) => [ring[k][0], plate, ring[k][1]]), n: [0, 1, 0] }));
    /* The crash physics' slabs (roofs.js insideSlabs), two inside each of
     * the roof's convex pieces rather than one round each triangle:
     * roofSlabs' rectangle round a triangle reached 57.7 m past a roof's
     * edge, and a triangle's largest rectangle is half of it. Two to a
     * piece are as many slabs as there were and under 80 % of the plan,
     * where one is 72 % (scripts/collide-audit-itaipu.js roofslabs). */
    rec.slabs = insideSlabs(convexPieces(ring, tris).map((piece) => piece.map((k) => [ring[k][0], plate, ring[k][1]])), 0, 2);
    return { rec, faces, gables: [] };
  }
  const hw = rect.hs;
  const hd = rect.hl;
  const { slope } = spec;
  const ex = hw + spec.over;
  const ez = hd + spec.over;
  const t = spec.thick;
  const yEave = t - spec.over * slope;
  const yRidge = t + hw * slope;
  let top;
  if (spec.shape === 'hip') {
    const zr = hd - hw;
    top = [
      [[ex, yEave, -ez], [ex, yEave, ez], [0, yRidge, zr], [0, yRidge, -zr]],
      [[-ex, yEave, ez], [-ex, yEave, -ez], [0, yRidge, -zr], [0, yRidge, zr]],
      [[-ex, yEave, ez], [0, yRidge, zr], [ex, yEave, ez]],
      [[ex, yEave, -ez], [0, yRidge, -zr], [-ex, yEave, -ez]],
    ];
  } else {
    top = gableTop(ex, yEave, yRidge, -ez, ez);
  }
  /* roofs.js's frame (frameElements) put by its cosine and sine rather
   * than its angle: local z, along the ridge, is world (s, c), which is
   * the rectangle's long axis, and local x is world (c, -s). */
  const e = [rect.uz, 0, -rect.ux, 0, 0, 1, 0, 0, rect.ux, 0, rect.uz, 0, rect.cx, plate, rect.cz, 1];
  const rec = roofRecord({ top, dy: 0.3, hw, hd, kind: style.kind }, e, spec.key);
  rec.material = spec.material;
  const c = e[0];
  const s = e[8];
  const world = ([lx, ly, lz]) => [c * lx + s * lz + rect.cx, plate + ly, -s * lx + c * lz + rect.cz];
  const turnN = ([nx, ny, nz]) => [c * nx + s * nz, ny, -s * nx + c * nz];
  /* The crash physics' slabs inside the upper faces (roofs.js insideSlabs):
   * roofSlabs' rectangle round a hip's end runs on up through the slopes
   * beside it, 3.8 m over the tiles at worst. One to a face, as many as
   * before: they are under 56 % of a hipped roof's plan, and two to a face
   * would be 65 % for twice the slabs, which share the crash physics' 64
   * obstacles with the walls. */
  rec.slabs = insideSlabs(top.map((poly) => poly.map(world)));
  const faces = [];
  for (const poly of top) {
    /* The face's own normal, up out of the roof. */
    const [a, b, d] = poly;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (n[1] < 0) {
      n = n.map((q) => -q);
    }
    faces.push({ pts: poly.map(world), n: turnN(n) });
    faces.push({ pts: poly.map(([x, y, z]) => world([x, y - t, z])), n: turnN(n.map((q) => -q)) });
  }
  /* The fascia round the eaves: the slab's edge where it is lowest, and
   * on a gable the verges, where it runs up to the ridge. */
  const edge = (p, q, out) => faces.push({
    pts: [world(p), world(q), world([q[0], q[1] - t, q[2]]), world([p[0], p[1] - t, p[2]])], n: turnN(out),
  });
  edge([ex, yEave, -ez], [ex, yEave, ez], [1, 0, 0]);
  edge([-ex, yEave, ez], [-ex, yEave, -ez], [-1, 0, 0]);
  const gables = [];
  if (spec.shape === 'hip') {
    edge([-ex, yEave, ez], [ex, yEave, ez], [0, 0, 1]);
    edge([ex, yEave, -ez], [-ex, yEave, -ez], [0, 0, -1]);
  } else {
    for (const sz of [-1, 1]) {
      edge([-ex, yEave, sz * ez], [0, yRidge, sz * ez], [0, 0, sz]);
      edge([0, yRidge, sz * ez], [ex, yEave, sz * ez], [0, 0, sz]);
      /* The gable wall, from the plate up to the roof's underside, which
       * meets the plate at the wall line and rises to the ridge. */
      const apex = yRidge - t;
      gables.push({
        pts: [world([-hw, 0, sz * hd]), world([hw, 0, sz * hd]), world([0, apex, sz * hd])], n: turnN([0, 0, sz]),
      });
    }
  }
  return {
    rec, faces, gables, frame: { c, s, hw, hd, slope, yRidge, t, world },
  };
}

/* The walls' faces from `base` to `plate`, outward, over a ring. */
export function wallFaces(ring, base, plate) {
  const out = [];
  for (let i = 0; i < ring.length; i += 1) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % ring.length];
    const len = Math.hypot(bx - ax, bz - az);
    out.push({
      pts: [[ax, base, az], [bx, base, bz], [bx, plate, bz], [ax, plate, az]],
      n: [(bz - az) / len, 0, -(bx - ax) / len],
    });
  }
  return out;
}

/*
 * What of the ring lies within [a, b] of `axis`'s other, as spans across
 * `axis` (0 x, 1 z): the inside's own intervals, so an L, a U or a
 * courtyard is not filled. Between two corners the inside is trapezoids,
 * each between a pair of edges (even-odd), and a trapezoid's span is its
 * four corners' extent; the spans of all of them, merged where they
 * overlap, are the projection of the ring's piece of the slab.
 */
function spansIn(ring, axis, a, b) {
  const o = 1 - axis;
  const n = ring.length;
  const ts = [a, b];
  for (const p of ring) {
    if (p[o] > a && p[o] < b) {
      ts.push(p[o]);
    }
  }
  ts.sort((u, v) => u - v);
  const raw = [];
  const at = (p, q, t) => p[axis] + ((q[axis] - p[axis]) * (t - p[o])) / (q[o] - p[o]);
  for (let k = 0; k + 1 < ts.length; k += 1) {
    const t0 = ts[k];
    const t1 = ts[k + 1];
    if (!(t1 > t0)) {
      continue;
    }
    const mid = (t0 + t1) / 2;
    const cut = [];
    for (let i = 0; i < n; i += 1) {
      const p = ring[i];
      const q = ring[(i + 1) % n];
      if ((p[o] < mid) !== (q[o] < mid)) {
        cut.push([at(p, q, mid), at(p, q, t0), at(p, q, t1)]);
      }
    }
    cut.sort((u, v) => u[0] - v[0]);
    for (let i = 0; i + 1 < cut.length; i += 2) {
      const [, l0, l1] = cut[i];
      const [, h0, h1] = cut[i + 1];
      raw.push([Math.min(l0, l1, h0, h1), Math.max(l0, l1, h0, h1)]);
    }
  }
  raw.sort((u, v) => u[0] - v[0]);
  const out = [];
  for (const s of raw) {
    const last = out[out.length - 1];
    if (last && s[0] <= last[1] + 1e-9) {
      last[1] = Math.max(last[1], s[1]);
    } else {
      out.push(s);
    }
  }
  return out;
}

/*
 * How many columns [a, b] is cut into: enough that no edge through it
 * strays more than STRAY across a column (an edge whose piece in the run
 * is `w` long across the columns and turned `phi` off them leaves a
 * wedge w sin(phi) deep between itself and the box), and none narrower
 * than COLUMN. A run between the corners of a square building is one.
 */
function columnsIn(ring, axis, a, b) {
  const o = 1 - axis;
  const n = ring.length;
  let stray = 0;
  for (let i = 0; i < n; i += 1) {
    const p = ring[i];
    const q = ring[(i + 1) % n];
    const w = Math.min(b, Math.max(p[o], q[o])) - Math.max(a, Math.min(p[o], q[o]));
    if (!(w > 0)) {
      continue;
    }
    const da = q[axis] - p[axis];
    const dz = q[o] - p[o];
    stray = Math.max(stray, (w * Math.abs(da)) / Math.sqrt(da * da + dz * dz));
  }
  const most = Math.max(1, Math.ceil((b - a) / COLUMN - 1e-9));
  return Math.max(1, Math.min(most, Math.ceil(stray / STRAY - 1e-9)));
}

/*
 * The ring cut across `axis`'s other into columns, each with its spans
 * across `axis`: [a, b, spans]. A cut at every corner, so between two
 * cuts the inside is trapezoids and nothing fills a notch, and each run
 * between cuts in columnsIn's columns. Where that comes to columns
 * COLUMN wide (a building turned off the axes), the building is columns
 * COLUMN wide from end to end, cut only at its inside corners: an
 * outside corner within a column leaves solid no deeper than the column
 * is wide, which the column's slant leaves anyway, and cutting there
 * too would cost a box a corner. Then fewer: a sliver goes into a
 * neighbour whose spans hold its own to within STRAY (the sliver a few
 * degrees of turn leaves at each end of a rectangle, which a box of its
 * own buys nothing for), and neighbours whose spans' ends all lie within
 * STRAY of each other are one column.
 */
function runsOf(ring, axis) {
  const o = 1 - axis;
  const n = ring.length;
  const wind = Math.sign(signedArea(ring));
  const at = [...new Set(ring.map((p) => p[o]))].sort((u, v) => u - v);
  const inside = new Set();
  ring.forEach((q, i) => {
    const p = ring[(i + n - 1) % n];
    const r = ring[(i + 1) % n];
    if (Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])) === -wind) {
      inside.add(q[o]);
    }
  });
  let runs = [];
  for (let k = 0; k + 1 < at.length; k += 1) {
    runs.push([at[k], at[k + 1], columnsIn(ring, axis, at[k], at[k + 1])]);
  }
  if (runs.some(([a, b, cols]) => cols > 1 && cols === Math.ceil((b - a) / COLUMN - 1e-9))) {
    const cuts = at.filter((c, k) => k === 0 || k === at.length - 1 || inside.has(c));
    runs = [];
    for (let k = 0; k + 1 < cuts.length; k += 1) {
      runs.push([cuts[k], cuts[k + 1], Math.max(1, Math.ceil((cuts[k + 1] - cuts[k]) / COLUMN - 1e-9))]);
    }
  }
  const cols = [];
  for (const [a, b, count] of runs) {
    for (let j = 0; j < count; j += 1) {
      const c0 = a + ((b - a) * j) / count;
      const c1 = j + 1 === count ? b : a + ((b - a) * (j + 1)) / count;
      cols.push([c0, c1, spansIn(ring, axis, c0, c1), count === 1 && b - a < COLUMN]);
    }
  }
  const holds = (big, small) => small.every(([lo, hi]) => big.some(([l, h]) => lo >= l - STRAY && hi <= h + STRAY));
  const union = (p, q) => {
    const out = [];
    for (const s of [...p, ...q].sort((u, v) => u[0] - v[0])) {
      const last = out[out.length - 1];
      if (last && s[0] <= last[1]) {
        last[1] = Math.max(last[1], s[1]);
      } else {
        out.push([s[0], s[1]]);
      }
    }
    return out;
  };
  /* A sliver (a run between two corners narrower than COLUMN, left
   * whole by columnsIn) into the column before it, or one before into
   * the column after; at most COLUMN of slivers into any one column, so
   * a run of them cannot carry a box out a sliver at a time. */
  const folded = [];
  let slivers = 0;
  for (const [c0, c1, spans, sliver] of cols) {
    const last = folded[folded.length - 1];
    if (last && sliver && slivers + c1 - c0 <= COLUMN && holds(last[2], spans)) {
      slivers += c1 - c0;
    } else if (last && last[3] && slivers === 0 && holds(spans, last[2])) {
      slivers = last[1] - last[0];
    } else {
      folded.push([c0, c1, spans.map((q) => [...q]), sliver]);
      slivers = 0;
      continue;
    }
    last[1] = c1;
    last[2] = union(last[2], spans);
    last[3] = false;
  }
  /* Near alike neighbours: each span's ends' least and most so far. */
  const out = [];
  let lohi = null;
  for (const c of folded) {
    const last = out[out.length - 1];
    const alike = last && last[2].length === c[2].length && c[2].every(([lo, hi], i) => {
      const [l0, l1, h0, h1] = lohi[i];
      return Math.max(l1, lo) - Math.min(l0, lo) <= STRAY && Math.max(h1, hi) - Math.min(h0, hi) <= STRAY;
    });
    if (alike) {
      last[1] = c[1];
      c[2].forEach(([lo, hi], i) => {
        const r = lohi[i];
        lohi[i] = [Math.min(r[0], lo), Math.max(r[1], lo), Math.min(r[2], hi), Math.max(r[3], hi)];
        last[2][i] = [lohi[i][0], lohi[i][3]];
      });
      continue;
    }
    out.push(c);
    lohi = c[2].map(([lo, hi]) => [lo, lo, hi, hi]);
  }
  return out;
}

/*
 * The walls as boxes [x0, y0, z0, x1, y1, z1] from `base`, each topped
 * SKIN under the roof's upper face at every corner it has and never over
 * the plate: a column's corners can reach past a slanted wall under the
 * eaves, where the roof is lower than the plate. Across whichever world
 * axis needs fewer. Then the gables' pieces, marked, for the roof's
 * eaves list (roofs.js cover): GABLE_PIECES across each, each topped at
 * its lower end so none stands out of the roof.
 */
export function wallBoxes(ring, base, plate, rec, gables) {
  const byX = runsOf(ring, 1);
  const byZ = runsOf(ring, 0);
  const count = (runs) => runs.reduce((s, r) => s + r[2].length, 0);
  const useX = count(byX) <= count(byZ);
  const topAt = (x, z) => {
    const t = rec ? roofTop(rec, x, z) : NaN;
    return Number.isNaN(t) ? Infinity : t - SKIN;
  };
  const cap = (x0, z0, x1, z1) => Math.min(plate - SKIN, topAt(x0, z0), topAt(x1, z0), topAt(x0, z1), topAt(x1, z1));
  const boxes = [];
  for (const [a, b, spans] of useX ? byX : byZ) {
    for (const [lo, hi] of spans) {
      const [x0, z0, x1, z1] = useX ? [a, lo, b, hi] : [lo, a, hi, b];
      const top = cap(x0, z0, x1, z1);
      if (top > base + 0.05) {
        boxes.push([x0, base, z0, x1, top, z1]);
      }
    }
  }
  const eaves = boxes.length;
  for (const g of gables) {
    const [p, q, apex] = g.pts;
    for (let k = 0; k < GABLE_PIECES; k += 1) {
      const t0 = k / GABLE_PIECES;
      const t1 = (k + 1) / GABLE_PIECES;
      const a = [p[0] + (q[0] - p[0]) * t0, p[2] + (q[2] - p[2]) * t0];
      const b = [p[0] + (q[0] - p[0]) * t1, p[2] + (q[2] - p[2]) * t1];
      /* The piece's top under the underside at its lower end. */
      const mid = Math.abs(t0 - 0.5) > Math.abs(t1 - 0.5) ? t0 : t1;
      const top = Math.min(apex[1], plate + (apex[1] - plate) * (1 - Math.abs(mid - 0.5) * 2));
      const x0 = Math.min(a[0], b[0]) - 0.2;
      const x1 = Math.max(a[0], b[0]) + 0.2;
      const z0 = Math.min(a[1], b[1]) - 0.2;
      const z1 = Math.max(a[1], b[1]) + 0.2;
      const t = Math.min(top, topAt(x0, z0), topAt(x1, z0), topAt(x0, z1), topAt(x1, z1));
      if (t > plate + 0.05) {
        boxes.push([x0, plate - SKIN, z0, x1, t, z1]);
      }
    }
  }
  return { boxes, eaves };
}
