/*
 * lakes.js: the lakes, flat at their surfaces, with a shore you can read.
 *
 * A lake is its outline triangulated at its surface y on a grid, so the
 * triangles are small enough to carry a distance to the shore at every
 * vertex. The fragment shader reads that distance: a pale wet line
 * at the edge, a band of shallows where the bottom shows through, deep
 * water beyond. From three kilometres up it is the shallows band that makes
 * Yellowstone Lake's outline read against the forest.
 *
 * The 3DEP ground under a lake is hydro flattened, level at the surface, so
 * the water is drawn a few centimetres over it with a depth bias rather
 * than a lift that would show at the shore.
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

import * as THREE from 'three';
import { paintMaterial, LAYER } from '../thermal/paint.js';
import { inLake } from './hydro.js';

/* A lake is cut into at most about this many grid cells, and none
 * smaller than MIN_CELL: Yellowstone Lake's cells come out near 370 m. */
const MAX_CELLS = 2500;
const MIN_CELL = 50;
/* Lakes are bucketed by squares of two level 0 tiles, and past FAR metres
 * a bucket draws only the lakes of at least FAR_AREA square metres. */
const BUCKET = 2 * 7680;
const FAR = 9000;
const FAR_AREA = 400000;
/* The 3DEP ground under a mapped lake is flattened to within a decimetre
 * of its surface (docs/YELLOWSTONE-DATA.md): the water stands above
 * that, and the depth bias keeps the shore line clean. */
const LIFT = 0.15;
export function lakeMaterial() {
  return paintMaterial({
    key: 'lake',
    attrs: ['float aShore'],
    bias: LAYER.water,
    cel: { rim: 0.3, rimColor: 0xdfeeff },
    body: /* glsl */ `
      vec2 w = vCelWorld.xz;
      /* The shallows' edge wanders on a scale of a few hundred metres: a
       * finer noise aliased into stripes across a lake seen from far off. */
      float d = vShore + (ysNoise(w * 0.004) - 0.5) * 50.0 * smoothstep(20.0, 80.0, vShore);
      vec3 deep = ysRgb(0.13, 0.30, 0.46);
      vec3 mid = ysRgb(0.20, 0.42, 0.55);
      vec3 shallow = ysRgb(0.42, 0.62, 0.60);
      vec3 sand = ysRgb(0.70, 0.70, 0.60);
      paint = mix(shallow, mid, smoothstep(25.0, 90.0, d));
      paint = mix(paint, deep, smoothstep(150.0, 600.0, d));
      /* Cat's paws: broad patches the wind darkens, big enough not to
       * shimmer at three kilometres. */
      paint *= 1.0 - 0.07 * smoothstep(0.5, 0.75, ysFbm(w * 0.0012)) * smoothstep(80.0, 200.0, d);
      /* The wet line. */
      paint = mix(paint, sand, 1.0 - smoothstep(1.5, 4.0, d));
    `,
  });
}

/*
 * The shore's edges binned by BIN metres, so the distance to the shore is
 * a look round a few bins and not a walk of every edge: Yellowstone Lake's
 * outline is thousands of edges and its grid thousands of vertices.
 * Beyond REACH the exact distance no longer changes the colour.
 */
const BIN = 250;
const REACH = 700;

function shoreIndex(lake) {
  const bins = new Map();
  const edges = [];
  for (const ring of [lake.outer, ...lake.holes]) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const e = { a: ring[j], b: ring[i] };
      edges.push(e);
      const x0 = Math.floor(Math.min(e.a.x, e.b.x) / BIN);
      const x1 = Math.floor(Math.max(e.a.x, e.b.x) / BIN);
      const z0 = Math.floor(Math.min(e.a.z, e.b.z) / BIN);
      const z1 = Math.floor(Math.max(e.a.z, e.b.z) / BIN);
      for (let bi = x0; bi <= x1; bi += 1) {
        for (let bj = z0; bj <= z1; bj += 1) {
          const key = bi * 100003 + bj;
          if (!bins.has(key)) {
            bins.set(key, []);
          }
          bins.get(key).push(e);
        }
      }
    }
  }
  const seg = (e, x, z) => {
    const dx = e.b.x - e.a.x;
    const dz = e.b.z - e.a.z;
    const l2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - e.a.x) * dx + (z - e.a.z) * dz) / l2));
    return Math.hypot(x - e.a.x - dx * t, z - e.a.z - dz * t);
  };
  return {
    edges,
    /* Distance to the shore, capped at REACH. */
    distance(x, z) {
      let best = REACH;
      const r = Math.ceil(REACH / BIN);
      const bi = Math.floor(x / BIN);
      const bj = Math.floor(z / BIN);
      for (let di = -r; di <= r; di += 1) {
        for (let dj = -r; dj <= r; dj += 1) {
          for (const e of bins.get((bi + di) * 100003 + bj + dj) ?? []) {
            best = Math.min(best, seg(e, x, z));
          }
        }
      }
      return best;
    },
    /* Whether any shore edge enters the square. */
    crosses(x0, z0, x1, z1) {
      for (let bi = Math.floor(x0 / BIN); bi <= Math.floor(x1 / BIN); bi += 1) {
        for (let bj = Math.floor(z0 / BIN); bj <= Math.floor(z1 / BIN); bj += 1) {
          for (const e of bins.get(bi * 100003 + bj) ?? []) {
            if (Math.max(e.a.x, e.b.x) >= x0 && Math.min(e.a.x, e.b.x) <= x1 && Math.max(e.a.z, e.b.z) >= z0 && Math.min(e.a.z, e.b.z) <= z1) {
              return true;
            }
          }
        }
      }
      return false;
    },
  };
}

/* Sutherland and Hodgman: a ring clipped to an axis aligned square. */
function clipRing(ring, x0, z0, x1, z1) {
  let out = ring;
  const planes = [
    [(p) => p.x >= x0, (a, b) => ({ x: x0, z: a.z + ((b.z - a.z) * (x0 - a.x)) / (b.x - a.x) })],
    [(p) => p.x <= x1, (a, b) => ({ x: x1, z: a.z + ((b.z - a.z) * (x1 - a.x)) / (b.x - a.x) })],
    [(p) => p.z >= z0, (a, b) => ({ x: a.x + ((b.x - a.x) * (z0 - a.z)) / (b.z - a.z), z: z0 })],
    [(p) => p.z <= z1, (a, b) => ({ x: a.x + ((b.x - a.x) * (z1 - a.z)) / (b.z - a.z), z: z1 })],
  ];
  for (const [inside, cut] of planes) {
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i += 1) {
      const a = src[(i + src.length - 1) % src.length];
      const b = src[i];
      if (inside(b)) {
        if (!inside(a)) {
          out.push(cut(a, b));
        }
        out.push(b);
      } else if (inside(a)) {
        out.push(cut(a, b));
      }
    }
    if (out.length === 0) {
      break;
    }
  }
  return out;
}

/*
 * A lake as triangles on a grid of `cell` metres: a cell wholly in the
 * water is two triangles; a cell the shore crosses is the outline and its
 * islands clipped to the cell and triangulated there. Earcut over the
 * whole lake with a lattice of Steiner points did this first, and bridged
 * every point to the outline with triangles a lake long, which drew the
 * shallows as stripes across the water.
 */
function lakeTriangles(lake, cell, index, push) {
  const b = lake.box;
  const i0 = Math.floor(b.x0 / cell);
  const i1 = Math.floor(b.x1 / cell);
  const j0 = Math.floor(b.z0 / cell);
  const j1 = Math.floor(b.z1 / cell);
  for (let i = i0; i <= i1; i += 1) {
    for (let j = j0; j <= j1; j += 1) {
      const x0 = i * cell;
      const z0 = j * cell;
      const x1 = x0 + cell;
      const z1 = z0 + cell;
      if (!index.crosses(x0, z0, x1, z1)) {
        if (inLake(lake, x0 + cell / 2, z0 + cell / 2)) {
          push([{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x0, z: z1 }]);
          push([{ x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }]);
        }
        continue;
      }
      const outer = clipRing(lake.outer, x0, z0, x1, z1);
      if (outer.length < 3) {
        continue;
      }
      const holes = lake.holes.map((h) => clipRing(h, x0, z0, x1, z1)).filter((h) => h.length >= 3);
      const contour = outer.map((p) => new THREE.Vector2(p.x, p.z));
      const hv = holes.map((h) => h.map((p) => new THREE.Vector2(p.x, p.z)));
      const verts = [contour, ...hv].flat();
      for (const t of THREE.ShapeUtils.triangulateShape(contour, hv)) {
        const tri = t.map((k) => ({ x: verts[k].x, z: verts[k].y }));
        /* A clipped ring that ran out of the cell and back leaves a
         * sliver along the cell's edge that is not water. */
        const cx = (tri[0].x + tri[1].x + tri[2].x) / 3;
        const cz = (tri[0].z + tri[1].z + tri[2].z) / 3;
        if (inLake(lake, cx, cz)) {
          push(tri);
        }
      }
    }
  }
}

export function buildLakes(lakes) {
  const material = lakeMaterial();
  const group = new THREE.Group();
  group.name = 'lakes';
  /*
   * One mesh per BUCKET square of the park, not one per lake: 328 lakes
   * were 328 draw calls, 200 of them in one view over the Upper Geyser
   * Basin. Not one for the park either: that is every lake's triangles in
   * every frame, 77 000 of them, however few are in view. A bucket is two
   * level 0 tiles square, so a view sees a handful, and each has a far
   * version past FAR that keeps only the lakes big enough to see from
   * there. A lake goes in the bucket its middle is in.
   */
  const buckets = new Map();
  for (const lake of lakes) {
    const cx = (lake.box.x0 + lake.box.x1) / 2;
    const cz = (lake.box.z0 + lake.box.z1) / 2;
    const key = `${Math.floor(cx / BUCKET)},${Math.floor(cz / BUCKET)}`;
    if (!buckets.has(key)) {
      buckets.set(key, []);
    }
    buckets.get(key).push(lake);
  }
  let triangles = 0;
  for (const [key, list] of buckets) {
    const near = { pos: [], shore: [] };
    const far = { pos: [], shore: [] };
    for (const lake of list) {
      const index = shoreIndex(lake);
      const cell = Math.max(MIN_CELL, Math.sqrt(lake.area / MAX_CELLS));
      const cache = new Map();
      const dist = (x, z) => {
        const k = `${x.toFixed(2)},${z.toFixed(2)}`;
        let d = cache.get(k);
        if (d === undefined) {
          d = index.distance(x, z);
          cache.set(k, d);
        }
        return d;
      };
      const into = lake.area >= FAR_AREA ? [near, far] : [near];
      lakeTriangles(lake, cell, index, (tri) => {
        /* Wound to face up whichever way the clipping left it. */
        const [a, b, c] = tri;
        const up = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
        for (const p of up < 0 ? [a, b, c] : [a, c, b]) {
          const d = dist(p.x, p.z);
          for (const t of into) {
            t.pos.push(p.x, lake.y + LIFT, p.z);
            t.shore.push(d);
          }
        }
        triangles += 1;
      });
    }
    const [bi, bj] = key.split(',').map(Number);
    const lod = new THREE.LOD();
    lod.name = `lakes-${key}`;
    lod.position.set((bi + 0.5) * BUCKET, 0, (bj + 0.5) * BUCKET);
    lod.addLevel(lakeMesh(near, material, lod.position) ?? new THREE.Group(), 0);
    lod.addLevel(lakeMesh(far, material, lod.position) ?? new THREE.Group(), FAR);
    group.add(lod);
  }
  return { group, material, triangles };
}

/* One bucket's water, positioned relative to its LOD's centre. */
function lakeMesh(t, material, at) {
  if (!t.pos.length) {
    return null;
  }
  for (let k = 0; k < t.pos.length; k += 3) {
    t.pos[k] -= at.x;
    t.pos[k + 2] -= at.z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(t.pos, 3));
  geo.setAttribute('aShore', new THREE.Float32BufferAttribute(t.shore, 1));
  /* Flat water: every normal is straight up. */
  const nrm = new Float32Array(t.pos.length);
  for (let k = 1; k < nrm.length; k += 3) {
    nrm[k] = 1;
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'lakes';
  mesh.receiveShadow = true;
  /* Colour pass only. The ground under a lake is flattened at its
   * surface, so the ink prepass would learn nothing from the water it
   * does not already have from the ground, and drawing it there doubled
   * the lakes' triangles in every view. */
  mesh.layers.set(1);
  return mesh;
}
