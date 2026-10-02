/*
 * plant.js: where every tree in the hero stands, from the data, and which
 * of them are colliders round the pilot. No three.js here: this is the
 * part of the vegetation the physics reads, so it is plain arithmetic on
 * the data (docs/ITAIPU-PLAN.md section 9).
 *
 * WHAT THE DATA SAYS. The canopy height model (canopy/i_j.bin, GLO-30
 * minus ANADEM on the 30 m grid) and package A's forest mask (masks/
 * hero.png, red) agree closely: 99.8 % of the samples 8 m and taller
 * are in the mask. Inside the mask the model's median is 8 m and its 90th
 * percentile 12 m, lower than the Atlantic forest stands (a radar surface
 * model sits inside a closed canopy), and the trees are drawn at it all
 * the same, so what is drawn, what is collided and the forest volume are
 * one height and every one of them can be checked against the file.
 *
 * WHAT IS PLANTED, all of it a pure function of the data and the hash
 * below, so a tree stands in the same place on every machine:
 *
 *   forest      the mask's forest on a jittered grid as close as the
 *               crowns are wide (6 to 10.5 m by the height), each cell
 *               kept with the mask's weight: a closed canopy. Height from
 *               the model, at least 5 m, one in twenty an emergent a
 *               third over the rest, and a palm here and there.
 *   the edge    a fringe of shrubby trees, field trees and palms just
 *               outside the forest's outline, so its edge is a wall of
 *               leaves to the ground.
 *   lone trees  the pastures' scattered trees (the reference photographs
 *               have them in every field), in loose groups, and their
 *               groves; OpenStreetMap's natural=tree nodes; and the
 *               parks' trees.
 *   eucalyptus  the plantations OpenStreetMap maps as landuse=forest, in
 *               rows, and a windbreak row along some edges of every
 *               landuse=farmland field.
 *
 * Nothing stands on water, a road (its width and a verge), a building or
 * within the dam's reach (its footprint, and each axis by the height the
 * embankment stands to), all read off one 5 m raster.
 *
 * THE FOREST VOLUME (canopyAt): where the mask is forest and the model is
 * at least DENSE_M tall, a point under ground + model is in the canopy.
 * It is read at the point, not off a grid, so it is a function of the
 * craft's position alone.
 *
 * THE COLLIDERS ROUND THE PILOT: the trees nearest a centre, ring by ring
 * of a 50 m grid, out to NEAR_R, until COLLIDER_BUDGET colliders (a trunk
 * post and four crown spheres a tree) or NEAR_MAX trees. In a closed
 * forest the budget ends the rings short of NEAR_R; the set then says how
 * far it reaches (`reach`) and wants a refill once the pilot is half way
 * there, rather than the 400 m the plan names, so the pilot never flies
 * out of the trees that can hold it.
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

export const HALF = 5120;

/* The forest volume starts where the canopy model stands this tall, m:
 * under it the mask's edges and young regrowth, which are near trees
 * only. */
export const DENSE_M = 5;
/* Section 9 and 13: near trees within 600 m, at most 4 000, rebuilt when
 * the pilot has moved 400 m. The collider budget is this part's share of
 * the streamed set's 25 000; the town's walls are the rest. */
export const NEAR_R = 600;
export const NEAR_MAX = 4000;
export const NEAR_MOVE = 400;
export const COLLIDER_BUDGET = 12500;
/* Colliders a tree adds: its trunk post and its crown's inner clumps. */
export const CROWN_SPHERES = 4;
export const PER_TREE = 1 + CROWN_SPHERES;
/* Trees a refill adds between yields: a slice of the part's own work. */
export const FILL_SLICE_TREES = 250;

/*
 * The kinds, in model units for swiss2's broadleaf generator
 * (swiss2/vegetation/species.js buildVariant; kind picks the leaf card),
 * but for the palm, which draw.js builds: two canopy trees for the
 * forest, which small are the forest edge's and a grove's undergrowth
 * and grown alone the pastures' spreading trees; a lone tree with its
 * crown high, the pastures' single trees and OpenStreetMap's; a
 * eucalyptus, a tall bare trunk under a narrow crown; an emergent, the
 * Atlantic forest's tall trees (peroba, cedro, timbauva) whose flat
 * crowns stand over the rest; and a jeriva palm. Each kind is a draw in
 * every pass it is seen in, so there are few of them and each serves
 * where it fits. `h` is the model's height; a tree is drawn at scale
 * height / h.
 */
export const KINDS = [
  { name: 'it-canopy-a', kind: 'maple', seed: 701, h: 14, trunk: 0.3, rx: 0.56, ry: 0.28 },
  { name: 'it-canopy-b', kind: 'beech', seed: 702, h: 14, trunk: 0.28, rx: 0.5, ry: 0.32 },
  { name: 'it-lone', kind: 'maple', seed: 703, h: 18, trunk: 0.4, rx: 0.42, ry: 0.22 },
  { name: 'it-eucalyptus', kind: 'beech', seed: 704, h: 22, trunk: 0.55, rx: 0.17, ry: 0.2 },
  { name: 'it-emergent', kind: 'beech', seed: 705, h: 26, trunk: 0.45, rx: 0.38, ry: 0.2 },
  { name: 'it-palm', kind: 'palm', seed: 708, h: 12, trunk: 0.84 },
];
/* The forest's grids: trees up to `below` metres tall stand `spacing`
 * apart, about their crowns' width (a canopy tree's crown is 1.1 to 1.2
 * times its height across). */
const FOREST_CLASSES = [
  { spacing: 6, below: 6.5 },
  { spacing: 8, below: 9.5 },
  { spacing: 10.5, below: Infinity },
];
export const K_CANOPY_A = 0;
export const K_CANOPY_B = 1;
export const K_LONE = 2;
export const K_EUCALYPTUS = 3;
export const K_EMERGENT = 4;
export const K_PALM = 5;

/*
 * Sixteen headings, cos and sin written out rather than computed: the
 * crown spheres are colliders, and the physics path takes no Math.sin or
 * Math.cos (CLAUDE.md), so the drawn tree and its colliders turn by the
 * same exact numbers on every engine.
 */
const C8 = [1, 0.9238795325112867, 0.7071067811865476, 0.38268343236508984];
export const YAW_COS = new Float64Array(16);
export const YAW_SIN = new Float64Array(16);
for (let k = 0; k < 16; k += 1) {
  const q = k & 3;
  const quadrant = k >> 2;
  const c = C8[q];
  const s = C8[(4 - q) & 3] * (q === 0 ? 0 : 1);
  /* (c, s) is the heading k within its quarter turn; turn it by the
   * quarter turns. */
  const cs = [[c, s], [-s, c], [-c, -s], [s, -c]][quadrant];
  YAW_COS[k] = cs[0];
  YAW_SIN[k] = cs[1];
}

/* A hash of three integers to [0, 1): integer arithmetic only. */
export function hash3(a, b, c) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* A length by sqrt, which IEEE rounds exactly, not Math.hypot, which no
 * standard pins to the bit: tree positions are collider positions. */
function len(dx, dz) {
  return Math.sqrt(dx * dx + dz * dz);
}

/*
 * A PNG as package A writes its masks: 8 bit RGBA, not interlaced.
 * Decoded here rather than through a canvas, because a canvas stores
 * premultiplied alpha and the mask's alpha is the urban weight: where it
 * is 0 the other three weights would be lost (look/ground.js says the
 * same). `inflate(bytes)` is the zlib inflater, async.
 */
export async function decodePng(bytes, inflate) {
  const u8 = new Uint8Array(bytes);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let w = 0;
  let h = 0;
  const idat = [];
  for (let i = 8; i < u8.length;) {
    const n = dv.getUint32(i);
    const type = String.fromCharCode(u8[i + 4], u8[i + 5], u8[i + 6], u8[i + 7]);
    if (type === 'IHDR') {
      w = dv.getUint32(i + 8);
      h = dv.getUint32(i + 12);
      const depth = u8[i + 16];
      const colour = u8[i + 17];
      const interlace = u8[i + 20];
      if (depth !== 8 || colour !== 6 || interlace !== 0) {
        throw new Error(`vegetation: a mask PNG must be 8 bit RGBA, not interlaced (depth ${depth}, colour ${colour}, interlace ${interlace})`);
      }
    } else if (type === 'IDAT') {
      idat.push(u8.subarray(i + 8, i + 8 + n));
    }
    i += 12 + n;
  }
  const packed = new Uint8Array(idat.reduce((s, a) => s + a.length, 0));
  let o = 0;
  for (const a of idat) {
    packed.set(a, o);
    o += a.length;
  }
  const raw = await inflate(packed);
  const stride = w * 4;
  if (raw.length !== h * (stride + 1)) {
    throw new Error(`vegetation: a ${w} x ${h} RGBA PNG inflated to ${raw.length} bytes`);
  }
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= 4 ? out[dst + x - 4] : 0;
      const b = y > 0 ? out[dst - stride + x] : 0;
      const c = x >= 4 && y > 0 ? out[dst - stride + x - 4] : 0;
      let p;
      if (f === 0) {
        p = 0;
      } else if (f === 1) {
        p = a;
      } else if (f === 2) {
        p = b;
      } else if (f === 3) {
        p = (a + b) >> 1;
      } else if (f === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        p = pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
      } else {
        throw new Error(`vegetation: PNG filter ${f} on row ${y}`);
      }
      out[dst + x] = (raw[src + x] + p) & 255;
    }
  }
  return { w, h, data: out };
}

/*
 * The canopy height model over the hero, from the level 0 tiles that
 * cover it (`tile(i, j)` a 257 x 257 Uint8Array, x fastest), on the
 * 30 m grid from x, z = -HALF. Tile (i, j) starts at -20480 + 7680 i.
 */
export function heroCanopy(tile) {
  const CELL = 30;
  const n = Math.ceil((2 * HALF) / CELL) + 1;
  const data = new Float32Array(n * n);
  for (let v = 0; v < n; v += 1) {
    for (let u = 0; u < n; u += 1) {
      const x = -HALF + u * CELL + 20480;
      const z = -HALF + v * CELL + 20480;
      const ti = Math.min(5, Math.floor(x / 7680));
      const tj = Math.min(5, Math.floor(z / 7680));
      const su = Math.round((x - ti * 7680) / CELL);
      const sv = Math.round((z - tj * 7680) / CELL);
      data[v * n + u] = tile(ti, tj)[sv * 257 + su];
    }
  }
  return { n, cell: CELL, data };
}

/* A raster over the hero, `cell` metres a texel, north west first. */
function raster(cell) {
  const n = Math.round((2 * HALF) / cell);
  return { n, cell, data: new Uint8Array(n * n) };
}

function texel(r, x, z) {
  const i = Math.floor((x + HALF) / r.cell);
  const j = Math.floor((z + HALF) / r.cell);
  return i >= 0 && j >= 0 && i < r.n && j < r.n ? j * r.n + i : -1;
}

/* Every texel whose centre is inside the rings (even odd, so a hole is a
 * hole), set to `value`. Scanline: each row's crossings, sorted. */
function fillRings(r, rings, value) {
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const ring of rings) {
    for (const [, z] of ring) {
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
    }
  }
  const j0 = Math.max(0, Math.floor((z0 + HALF) / r.cell));
  const j1 = Math.min(r.n - 1, Math.floor((z1 + HALF) / r.cell));
  const xs = [];
  for (let j = j0; j <= j1; j += 1) {
    const z = -HALF + (j + 0.5) * r.cell;
    xs.length = 0;
    for (const ring of rings) {
      for (let a = 0, b = ring.length - 1; a < ring.length; b = a, a += 1) {
        const [xa, za] = ring[a];
        const [xb, zb] = ring[b];
        if ((za > z) !== (zb > z)) {
          xs.push(xa + ((z - za) * (xb - xa)) / (zb - za));
        }
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] + HALF) / r.cell - 0.5));
      const i1 = Math.min(r.n - 1, Math.floor((xs[k + 1] + HALF) / r.cell - 0.5));
      for (let i = i0; i <= i1; i += 1) {
        r.data[j * r.n + i] = value;
      }
    }
  }
}

/* Every texel within `rad` of the polyline, set to `value`. */
function stampLine(r, pts, rad, value) {
  for (let k = 1; k < pts.length; k += 1) {
    const [ax, az] = pts[k - 1];
    const [bx, bz] = pts[k];
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - rad + HALF) / r.cell));
    const i1 = Math.min(r.n - 1, Math.floor((Math.max(ax, bx) + rad + HALF) / r.cell));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - rad + HALF) / r.cell));
    const j1 = Math.min(r.n - 1, Math.floor((Math.max(az, bz) + rad + HALF) / r.cell));
    const dx = bx - ax;
    const dz = bz - az;
    const ll = dx * dx + dz * dz || 1;
    for (let j = j0; j <= j1; j += 1) {
      const z = -HALF + (j + 0.5) * r.cell;
      for (let i = i0; i <= i1; i += 1) {
        const x = -HALF + (i + 0.5) * r.cell;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / ll));
        const ex = ax + t * dx - x;
        const ez = az + t * dz - z;
        if (ex * ex + ez * ez <= rad * rad) {
          r.data[j * r.n + i] = value;
        }
      }
    }
  }
}

/* The raster grown by one texel in each direction: a building's margin. */
function grow(r, value) {
  const { n, data } = r;
  const src = data.slice();
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      if (src[j * n + i] !== value) {
        continue;
      }
      for (let dj = -1; dj <= 1; dj += 1) {
        for (let di = -1; di <= 1; di += 1) {
          const ii = i + di;
          const jj = j + dj;
          if (ii >= 0 && jj >= 0 && ii < n && jj < n && data[jj * n + ii] === 0) {
            data[jj * n + ii] = value;
          }
        }
      }
    }
  }
}

/* A verge either side of a road, m, past its drawn half width. */
const ROAD_VERGE = 2;
/* The reach of an embankment's slopes from its axis, per metre of its
 * height (a rockfill dam's faces are about 1 in 1.5), and the least. */
const DAM_SLOPE = 1.6;
const DAM_MIN = 40;
/* The dam's grounds, m from its footprints and axes: the binational
 * entity's mown lawns round the structures, where the pastures' groves
 * and scattered trees (a farm's) do not grow. */
const DAM_GROUNDS = 350;

/*
 * Where no tree stands, on a 5 m raster: the water bodies, the dam, the
 * roads, the buildings and the rock the ground was cut back to round the
 * concrete (`cut`, the hero samples terrain/conform.js lowered, each
 * CUT_REACH round it, value CUT: two steps of the canopy's shell, draw.js
 * TIERS shell, so the shell's last vertex at the canopy's height is a
 * step from any vertex down in the cut, and its edge face falls to the
 * lip rather than hanging down the cut's face); and, as `grounds` on a
 * 25 m raster, the dam's grounds, where no pasture tree stands.
 */
export const CUT = 5;
const CUT_REACH = 40;
export function keepOff({
  water, dam, roads, buildings, cut = [],
}) {
  const r = raster(5);
  for (const b of buildings) {
    fillRings(r, [b.outer, ...(b.holes || [])], 1);
  }
  grow(r, 1);
  for (const body of water) {
    fillRings(r, [body.outline, ...(body.holes || [])], 2);
  }
  for (const p of dam) {
    if (p.footprint) {
      fillRings(r, [p.footprint], 3);
      stampLine(r, [...p.footprint, p.footprint[0]], 20, 3);
    }
    if (p.axis && p.axis.length > 1) {
      const hgt = p.baseY != null ? p.crestY - p.baseY : 0;
      stampLine(r, p.axis, Math.max(DAM_MIN, Math.min(150, hgt * DAM_SLOPE)), 3);
    }
  }
  for (const w of roads) {
    if (w.tunnel) {
      continue;
    }
    stampLine(r, w.points, w.width / 2 + ROAD_VERGE, 4);
  }
  /* Last, over the dam's and the water's: onCut reads this value. */
  for (const [x, z] of cut) {
    fillRings(r, [[[x - CUT_REACH, z - CUT_REACH], [x + CUT_REACH, z - CUT_REACH], [x + CUT_REACH, z + CUT_REACH], [x - CUT_REACH, z + CUT_REACH]]], CUT);
  }
  r.grounds = raster(25);
  for (const p of dam) {
    if (p.footprint) {
      fillRings(r.grounds, [p.footprint], 1);
      stampLine(r.grounds, [...p.footprint, p.footprint[0]], DAM_GROUNDS, 1);
    }
    if (p.axis && p.axis.length > 1) {
      stampLine(r.grounds, p.axis, DAM_GROUNDS, 1);
    }
  }
  return r;
}

/* Whether (x, z) is on the cut rock of keepOff's raster `off`. */
export function onCut(off, x, z) {
  if (!off) {
    return false;
  }
  const t = texel(off, x, z);
  return t >= 0 && off.data[t] === CUT;
}

/* A point in a polygon (even odd), for the few landuse areas. */
function inside(ring, x, z) {
  let c = false;
  for (let a = 0, b = ring.length - 1; a < ring.length; b = a, a += 1) {
    const [xa, za] = ring[a];
    const [xb, zb] = ring[b];
    if ((za > z) !== (zb > z) && x < xa + ((z - za) * (xb - xa)) / (zb - za)) {
      c = !c;
    }
  }
  return c;
}

/*
 * The planted hero. `mask` is the decoded masks/hero.png (1024 x 1024 at
 * 10 m), `canopy` heroCanopy's grid, `ground(x, z)` the terrain the trees
 * stand on, `landuse` and `osmTrees` osm/landuse.json's and
 * osm/trees.json's features, `off` keepOff's raster.
 */
export function plantHero({
  mask, canopy, ground, landuse, osmTrees, off,
}) {
  const xs = [];
  const zs = [];
  const ys = [];
  const ss = [];
  const ks = [];
  const yaws = [];
  const fars = [];
  const counts = {
    forest: 0, emergent: 0, fringe: 0, lone: 0, single: 0, grove: 0, osm: 0, park: 0, plantation: 0, windbreak: 0, refused: 0,
  };
  const chm = (x, z) => canopyHeight(canopy, x, z);
  const weight = (x, z, ch) => {
    const i = Math.floor((x + HALF) / 10);
    const j = Math.floor((z + HALF) / 10);
    if (i < 0 || j < 0 || i >= mask.w || j >= mask.h) {
      return 0;
    }
    return mask.data[(j * mask.w + i) * 4 + ch] / 255;
  };
  const free = (x, z) => {
    const t = texel(off, x, z);
    return t >= 0 && off.data[t] === 0;
  };
  /* Is any of the four points `r` metres off (x, z) on the other side of
   * the forest's outline from it? */
  const across = (x, z, r, inForest) => {
    for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
      if ((weight(x + dx, z + dz, 0) >= 0.5) !== inForest) {
        return true;
      }
    }
    return false;
  };
  /* `k` the kind, `hgt` the tree's height in metres, `seed` its own
   * hash stream for the heading, `far` whether it is drawn past the
   * models' band (draw.js): every tree but the closed forest's inside,
   * which the canopy draws there. */
  const add = (x, z, k, hgt, seed, what, far = true) => {
    if (!free(x, z)) {
      counts.refused += 1;
      return;
    }
    xs.push(x);
    zs.push(z);
    ys.push(ground(x, z));
    ss.push(hgt / KINDS[k].h);
    ks.push(k);
    yaws.push(Math.floor(hash3(seed, 91, 7) * 16));
    fars.push(far ? 1 : 0);
    counts[what] += 1;
  };

  /* The forest: a jittered grid whose spacing follows the canopy's
   * height, each cell kept with the mask's weight at its tree. A crown is
   * about as wide as its tree is tall (KINDS: rx over h), so a stand of
   * short trees is a close one and a stand of tall ones is open between
   * the trunks: each class of height is planted on its own grid, and a
   * cell of a class's grid is kept only where the model says that class.
   * The canopy closes at every height. One tree in twenty is an emergent,
   * a third taller with its own flat crown; the rest are the two canopy
   * trees. */
  FOREST_CLASSES.forEach(({ spacing: S, below }, cls) => {
    const above = cls > 0 ? FOREST_CLASSES[cls - 1].below : -Infinity;
    const cells = Math.floor((2 * HALF) / S);
    for (let cj = 0; cj < cells; cj += 1) {
      for (let ci = 0; ci < cells; ci += 1) {
        const x = -HALF + (ci + 0.05 + 0.9 * hash3(ci, cj, 1 + cls * 16)) * S;
        const z = -HALF + (cj + 0.05 + 0.9 * hash3(ci, cj, 2 + cls * 16)) * S;
        const w = weight(x, z, 0);
        if (w <= 0 || hash3(ci, cj, 3 + cls * 16) >= w) {
          continue;
        }
        const h0 = Math.max(5, chm(x, z));
        if (!(h0 > above && h0 <= below)) {
          continue;
        }
        const seed = (cls + 1) * 10000000 + ci * 7919 + cj;
        const size = hash3(ci, cj, 5 + cls * 16);
        if (hash3(ci, cj, 4 + cls * 16) < 0.05) {
          add(x, z, K_EMERGENT, h0 * (1.3 + 0.25 * size), seed, 'emergent');
          continue;
        }
        const k = hash3(ci, cj, 6 + cls * 16) < 0.5 ? K_CANOPY_A : K_CANOPY_B;
        add(x, z, k, h0 * (0.78 + 0.4 * size), seed, 'forest', across(x, z, 12, true));
      }
    }
  });

  /* The forest's edge, where it meets a field: a wall of foliage down to
   * the ground, not a row of trunks. On a jittered 7 m grid just outside
   * the outline (a point with the forest within 9 m), about half the
   * cells: young canopy trees, their crowns near the ground, and palms. */
  const FR = 7;
  const fc = Math.floor((2 * HALF) / FR);
  for (let cj = 0; cj < fc; cj += 1) {
    for (let ci = 0; ci < fc; ci += 1) {
      const x = -HALF + (ci + 0.1 + 0.8 * hash3(ci, cj, 61)) * FR;
      const z = -HALF + (cj + 0.1 + 0.8 * hash3(ci, cj, 62)) * FR;
      if (weight(x, z, 0) >= 0.5 || hash3(ci, cj, 63) >= 0.55 || weight(x, z, 3) > 0.25 || !across(x, z, 9, false)) {
        continue;
      }
      const r = hash3(ci, cj, 64);
      const q = hash3(ci, cj, 65);
      const seed = 4000000 + ci * 7919 + cj;
      if (r < 0.6) {
        add(x, z, K_CANOPY_B, 4 + 4 * q, seed, 'fringe');
      } else if (r < 0.82) {
        add(x, z, K_CANOPY_A, 7 + 5 * q, seed, 'fringe');
      } else if (r < 0.92) {
        add(x, z, K_PALM, 7 + 6 * q, seed, 'fringe');
      } else {
        add(x, z, K_CANOPY_B, 8 + 4 * q, seed, 'fringe');
      }
    }
  }

  /* The fields' single trees: a 30 m grid, kept where the mask is field
   * and a slow hash says a group stands, a few in a hundred. A lone tree
   * stands alone: nothing else in the pastures is planted within LONE_ROOM
   * of one (loneNear), so its crown is the only one over its grass. */
  const L = 30;
  const lc = Math.floor((2 * HALF) / L);
  const pasture = (x, z) => {
    const field = weight(x, z, 1);
    return field >= 0.5 && weight(x, z, 0) <= 0.2 && weight(x, z, 3) <= 0.25 ? field : 0;
  };
  const loneAt = (ci, cj) => {
    const x = -HALF + (ci + 0.2 + 0.6 * hash3(ci, cj, 11)) * L;
    const z = -HALF + (cj + 0.2 + 0.6 * hash3(ci, cj, 12)) * L;
    const field = pasture(x, z);
    /* Groups: the chance is higher in one 150 m block in four. */
    const group = hash3(Math.floor(ci / 5), Math.floor(cj / 5), 13) < 0.25 ? 0.12 : 0.025;
    return field && hash3(ci, cj, 14) < group * field ? [x, z] : null;
  };
  const LONE_ROOM = 22;
  const loneNear = (x, z) => {
    const ci = Math.floor((x + HALF) / L);
    const cj = Math.floor((z + HALF) / L);
    for (let dj = -1; dj <= 1; dj += 1) {
      for (let di = -1; di <= 1; di += 1) {
        const p = loneAt(ci + di, cj + dj);
        if (p && (p[0] - x) * (p[0] - x) + (p[1] - z) * (p[1] - z) < LONE_ROOM * LONE_ROOM) {
          return true;
        }
      }
    }
    return false;
  };
  /* A pasture tree's place: pasture, not the dam's grounds, and not in a
   * lone tree's room. */
  const farmed = (x, z) => {
    const t = texel(off.grounds, x, z);
    return t >= 0 && !off.grounds.data[t] && !loneNear(x, z) ? pasture(x, z) : 0;
  };
  for (let cj = 0; cj < lc; cj += 1) {
    for (let ci = 0; ci < lc; ci += 1) {
      const p = loneAt(ci, cj);
      if (p) {
        add(p[0], p[1], K_LONE, 14 + 8 * hash3(ci, cj, 15), 500000 + ci * 7919 + cj, 'lone');
      }
    }
  }

  /* The pastures' other single trees, on the same grid by other hashes:
   * a spreading canopy tree or a palm (the jeriva stands in every pasture
   * of the reference photographs), two cells in a hundred. */
  for (let cj = 0; cj < lc; cj += 1) {
    for (let ci = 0; ci < lc; ci += 1) {
      const x = -HALF + (ci + 0.2 + 0.6 * hash3(ci, cj, 17)) * L;
      const z = -HALF + (cj + 0.2 + 0.6 * hash3(ci, cj, 18)) * L;
      const field = farmed(x, z);
      if (!field || hash3(ci, cj, 19) >= 0.02 * field) {
        continue;
      }
      const q = hash3(ci, cj, 20);
      const seed = 5500000 + ci * 7919 + cj;
      if (hash3(ci, cj, 22) < 0.6) {
        add(x, z, K_CANOPY_A, 10 + 7 * q, seed, 'single');
      } else {
        add(x, z, K_PALM, 8 + 6 * q, seed, 'single');
      }
    }
  }

  /* The pastures' groves, the reference photographs' clumps of trees in
   * the fields: on a 90 m grid, about one cell in five of pasture, three
   * to eleven trees within 8 to 22 m of a centre, none closer than 4.5 m
   * to another, of every open ground kind. */
  const G = 90;
  const gc = Math.floor((2 * HALF) / G);
  for (let cj = 0; cj < gc; cj += 1) {
    for (let ci = 0; ci < gc; ci += 1) {
      const cx = -HALF + (ci + 0.25 + 0.5 * hash3(ci, cj, 71)) * G;
      const cz = -HALF + (cj + 0.25 + 0.5 * hash3(ci, cj, 72)) * G;
      const field = farmed(cx, cz);
      if (!field || hash3(ci, cj, 73) >= 0.2 * field) {
        continue;
      }
      const n = 3 + Math.floor(9 * hash3(ci, cj, 74));
      const R = 8 + 14 * hash3(ci, cj, 75);
      const placed = [];
      for (let m = 0; m < n * 3 && placed.length < n; m += 1) {
        const dx = (2 * hash3(ci * 37 + m, cj, 76) - 1) * R;
        const dz = (2 * hash3(ci * 37 + m, cj, 77) - 1) * R;
        if (dx * dx + dz * dz > R * R || placed.some(([px, pz]) => (px - dx) * (px - dx) + (pz - dz) * (pz - dz) < 4.5 * 4.5)) {
          continue;
        }
        placed.push([dx, dz]);
        const x = cx + dx;
        const z = cz + dz;
        if (!farmed(x, z)) {
          continue;
        }
        const r = hash3(ci * 37 + m, cj, 78);
        const q = hash3(ci * 37 + m, cj, 79);
        const seed = 6000000 + (ci * 37 + m) * 7919 + cj;
        if (r < 0.4) {
          add(x, z, K_CANOPY_A, 9 + 7 * q, seed, 'grove');
        } else if (r < 0.62) {
          add(x, z, K_CANOPY_B, 4 + 4 * q, seed, 'grove');
        } else if (r < 0.8) {
          add(x, z, K_PALM, 8 + 6 * q, seed, 'grove');
        } else if (r < 0.9) {
          add(x, z, K_EMERGENT, 16 + 8 * q, seed, 'grove');
        } else {
          add(x, z, K_LONE, 13 + 7 * q, seed, 'grove');
        }
      }
    }
  }

  for (const [n, t] of osmTrees.entries()) {
    add(t.x, t.z, K_LONE, 12 + 6 * hash3(n, 0, 21), 900000 + n, 'osm');
  }

  landuse.forEach((f, fi) => {
    const ring = f.outer;
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
    if (f.key === 'leisure' && f.value === 'park') {
      const P = 16;
      for (let z = z0 + P / 2; z < z1; z += P) {
        for (let x = x0 + P / 2; x < x1; x += P) {
          const i = Math.round(x);
          const j = Math.round(z);
          const px = x + (hash3(i, j, 31) - 0.5) * 8;
          const pz = z + (hash3(i, j, 32) - 0.5) * 8;
          if (hash3(i, j, 33) < 0.4 && inside(ring, px, pz)) {
            /* A park's trees: shade trees and the palms every park here
             * has. */
            const r = hash3(i, j, 35);
            const k = r < 0.4 ? K_LONE : r < 0.7 ? K_CANOPY_A : K_PALM;
            const hgt = k === K_PALM ? 8 + 6 * hash3(i, j, 34) : 9 + 7 * hash3(i, j, 34);
            add(px, pz, k, hgt, 1000000 + fi * 4096 + i, 'park');
          }
        }
      }
    } else if (f.key === 'landuse' && f.value === 'forest') {
      /* A plantation's rows run along its longest edge, 5 m apart, a
       * tree every 4 m. */
      let best = 0;
      let ux = 1;
      let uz = 0;
      for (let a = 1; a < ring.length; a += 1) {
        const dx = ring[a][0] - ring[a - 1][0];
        const dz = ring[a][1] - ring[a - 1][1];
        const l = len(dx, dz);
        if (l > best) {
          best = l;
          ux = dx / l;
          uz = dz / l;
        }
      }
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const reach = len(x1 - x0, z1 - z0) / 2;
      for (let v = -reach; v <= reach; v += 5) {
        for (let u = -reach; u <= reach; u += 4) {
          const x = cx + u * ux - v * uz;
          const z = cz + u * uz + v * ux;
          const i = Math.round(u * 4);
          const j = Math.round(v * 4);
          if (!inside(ring, x, z) || hash3(fi, i * 131 + j, 41) < 0.06) {
            continue;
          }
          const hgt = Math.max(14, chm(x, z)) * (0.9 + 0.2 * hash3(fi, i * 131 + j, 42));
          add(x, z, K_EUCALYPTUS, hgt, 2000000 + fi * 65536 + i * 131 + j, 'plantation');
        }
      }
    } else if (f.key === 'landuse' && f.value === 'farmland') {
      /* A windbreak along some of the field's edges, 3 m in from it, a
       * tree every 4 m. */
      for (let a = 1; a < ring.length; a += 1) {
        const [ax, az] = ring[a - 1];
        const [bx, bz] = ring[a];
        const l = len(bx - ax, bz - az);
        if (l < 40 || hash3(fi, a, 51) < 0.55) {
          continue;
        }
        const ux = (bx - ax) / l;
        const uz = (bz - az) / l;
        for (let t = 2; t < l - 2; t += 4) {
          for (const side of [-3, 3]) {
            const x = ax + ux * t - uz * side;
            const z = az + uz * t + ux * side;
            if (inside(ring, x, z)) {
              const q = Math.round(t);
              add(x, z, K_EUCALYPTUS, 16 + 8 * hash3(fi, a * 4096 + q, 52), 3000000 + fi * 65536 + a * 1024 + q, 'windbreak');
            }
          }
        }
      }
    }
  });

  return {
    count: xs.length,
    x: Float32Array.from(xs),
    z: Float32Array.from(zs),
    y: Float32Array.from(ys),
    s: Float32Array.from(ss),
    k: Uint8Array.from(ks),
    yaw: Uint8Array.from(yaws),
    far: Uint8Array.from(fars),
    counts,
    grid: treeGrid(xs, zs),
  };
}

/* The canopy model at a point, bilinear on its 30 m grid, m. */
export function canopyHeight(canopy, x, z) {
  const { n, cell, data } = canopy;
  const u = Math.max(0, Math.min(n - 1.000001, (x + HALF) / cell));
  const v = Math.max(0, Math.min(n - 1.000001, (z + HALF) / cell));
  const i = Math.floor(u);
  const j = Math.floor(v);
  const fu = u - i;
  const fv = v - j;
  const a = data[j * n + i];
  const b = data[j * n + i + 1];
  const c = data[(j + 1) * n + i];
  const d = data[(j + 1) * n + i + 1];
  return (a + (b - a) * fu) * (1 - fv) + (c + (d - c) * fu) * fv;
}

/*
 * The forest volume: the top of the canopy at (x, z), or -Infinity where
 * there is no closed forest. `mask` and `canopy` as plantHero's, `off`
 * keepOff's raster, whose cut rock has none.
 */
export function makeCanopyAt({
  mask, canopy, ground, off = null,
}) {
  return (x, z) => {
    const i = Math.floor((x + HALF) / 10);
    const j = Math.floor((z + HALF) / 10);
    if (i < 0 || j < 0 || i >= mask.w || j >= mask.h || mask.data[(j * mask.w + i) * 4] < 128 || onCut(off, x, z)) {
      return -Infinity;
    }
    const h = canopyHeight(canopy, x, z);
    return h >= DENSE_M ? ground(x, z) + h : -Infinity;
  };
}

/* The trees on a 50 m grid over the hero: the cells' starts and the
 * trees in cell order. */
export const GRID_CELL = 50;
function treeGrid(xs, zs) {
  const n = Math.ceil((2 * HALF) / GRID_CELL);
  const key = (t) => {
    const i = Math.max(0, Math.min(n - 1, Math.floor((xs[t] + HALF) / GRID_CELL)));
    const j = Math.max(0, Math.min(n - 1, Math.floor((zs[t] + HALF) / GRID_CELL)));
    return j * n + i;
  };
  const start = new Uint32Array(n * n + 1);
  for (let t = 0; t < xs.length; t += 1) {
    start[key(t) + 1] += 1;
  }
  for (let c = 1; c <= n * n; c += 1) {
    start[c] += start[c - 1];
  }
  const at = start.slice();
  const items = new Uint32Array(xs.length);
  for (let t = 0; t < xs.length; t += 1) {
    items[at[key(t)]++] = t;
  }
  return { n, cell: GRID_CELL, start, items };
}

/* The grid's cells round a centre cell, nearest first (by their centres,
 * ties by row then column), out to NEAR_R and a cell's diagonal. */
const RING = (() => {
  const r = Math.ceil(NEAR_R / GRID_CELL) + 1;
  const out = [];
  for (let dj = -r; dj <= r; dj += 1) {
    for (let di = -r; di <= r; di += 1) {
      const d = len(di, dj) * GRID_CELL;
      if (d <= NEAR_R + GRID_CELL) {
        out.push({ di, dj, d });
      }
    }
  }
  out.sort((a, b) => a.d - b.d || a.dj - b.dj || a.di - b.di);
  return out;
})();

/*
 * The near trees round (cx, cz): the nearest first, ring by ring, within
 * NEAR_R, until the collider budget or NEAR_MAX. Returns the trees'
 * indices and how far the set is whole: NEAR_R when every tree in reach
 * is in it, else the nearest ring it could not finish less a cell's whole
 * diagonal: half for a tree's place in its cell, and half for (cx, cz)'s
 * in the centre cell, which the rings are measured from.
 */
export function nearTrees(forest, cx, cz) {
  const { n, cell, start, items } = forest.grid;
  const ci = Math.floor((cx + HALF) / cell);
  const cj = Math.floor((cz + HALF) / cell);
  const cap = Math.min(NEAR_MAX, Math.floor(COLLIDER_BUDGET / PER_TREE));
  const out = [];
  let reach = NEAR_R;
  for (const { di, dj, d } of RING) {
    const i = ci + di;
    const j = cj + dj;
    if (i < 0 || j < 0 || i >= n || j >= n) {
      continue;
    }
    const c = j * n + i;
    const begin = out.length;
    for (let q = start[c]; q < start[c + 1]; q += 1) {
      const t = items[q];
      const dx = forest.x[t] - cx;
      const dz = forest.z[t] - cz;
      if (dx * dx + dz * dz <= NEAR_R * NEAR_R) {
        out.push(t);
      }
    }
    if (out.length > cap) {
      out.length = begin;
      reach = Math.max(0, d - cell * Math.SQRT2);
      break;
    }
  }
  return { trees: out, reach };
}

/*
 * One tree's colliders, as swiss2's broadleaves (swiss2/vegetation/
 * forest.js add and crownColliders): a trunk post, then a 'canopy'
 * sphere round each of its crown's inner clumps, in that order, which is
 * how src/game/crashworld.js collectTrees knows them for its crown.
 * `crowns[k]` is kind k's { trunkTop, trunkR, clumps: [{ x, y, z, r }] } in
 * the model's own frame. Placed by the drawn instance's own numbers:
 * Float32 position and scale, the heading table.
 */
export function addTree(list, forest, t, crowns) {
  const f = Math.fround;
  const k = forest.k[t];
  const crown = crowns[k];
  const x = f(forest.x[t]);
  const z = f(forest.z[t]);
  const y = f(forest.y[t]);
  const S = f(forest.s[t]);
  list.addPost('tree', x, z, y, y + crown.trunkTop * S, crown.trunkR * S);
  const c = YAW_COS[forest.yaw[t]] * S;
  const sn = YAW_SIN[forest.yaw[t]] * S;
  const y0 = y - 0.2;
  for (const q of crown.clumps) {
    list.addSphere('canopy', x + c * q.x + sn * q.z, y0 + S * q.y, z - sn * q.x + c * q.z, q.r * S);
  }
}
