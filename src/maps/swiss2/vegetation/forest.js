/*
 * forest.js: where every tree in the valley stands, and which of its
 * three drawings each one gets this frame.
 *
 * PLANTING follows nature.js's rules with the density a real forest has.
 * nature.js could afford 3300 trees; a closed spruce stand is four to
 * five hundred stems a hectare, so here the forest is a jittered grid a
 * few metres a cell, each cell kept with the chance forestDensity gives
 * it (terrain.js's, the same density the ground's paint is made from),
 * steepened so a stand is closed where the density is high and its edge
 * is the sharp line a grazed pasture leaves. Species by nature.js's
 * bands: beech low on gentle ground, larch toward the tree line, spruce
 * everywhere between, silver fir mixed through the middle slopes, and
 * sycamore among the beeches. A tree in a closed stand is a forest grown
 * variant with a bare lower trunk; one at an edge or alone is an open
 * grown one. nature.js's broadleaf clumps along the stream and scattered
 * over the floor are planted the same way. Nothing stands where keepOff
 * says, in water, on the stream, or on the map's own solid things
 * (layout.solidAt: the hay huts).
 *
 * STRUCTURE. Planted by density alone, round 2's forest was one even
 * wall: the same trees at the same heights to a ruled edge. A managed
 * mountain forest is a patchwork of stands of different ages, so the
 * height of the canopy steps from stand to stand, with young stands of
 * small close trees among old tall ones; it has clearings and the gaps a
 * storm leaves; its edge wanders, and in front of it a mantle of young
 * trees and bushes steps out into the meadow; it runs down the gullies
 * in fingers where the ground holds water and the mower cannot reach;
 * larches stand in groups through the spruce well below the tree line,
 * lighter and yellower; and dead trees stand in it, grey, most of them
 * up where the forest thins. Along the stream the trees are a gallery of
 * clumps and gaps, bushes at the water and trees of every size behind.
 *
 * DRAWING. Each tree is drawn at one of three levels by its distance
 * from the camera: the whole model near, a third of its cards in the
 * middle distance, and beyond that a camera facing impostor. The
 * impostors are static, every tree in the valley in a few big chunks,
 * and dissolve themselves out inside their band in the shader. The two
 * model levels are instanced meshes refilled from a grid of the trees
 * whenever the camera has moved a few metres or turned a few degrees;
 * the bands overlap by a fade width and the materials dissolve across it
 * (plantmat.js). Only the trees in the camera's view, or whose shadow
 * falls into it, are filled: the meshes are not frustum culled as a whole
 * (they span the camera), so without this every tree within the mid band,
 * behind the camera too, was drawn once for the view and once for each
 * shadow map, which was 7.6 M triangles over the waterfall's forest.
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

import * as THREE from 'three';
import { noise2, smoothstep } from '../../alps/noise.js';
import { FIELD, HALF, LAKE_Y, TREE_LINE, treeLine, forestDensity, valleyAxis } from '../../alps/terrain.js';
import { VARIANTS } from './species.js';
import { meadowCuts } from './zones.js';

const V = Object.fromEntries(VARIANTS.map((v, k) => [v.name, k]));
const OPEN = VARIANTS.map((v) => v.name.endsWith('-open') || v.kind === 'maple');
/* Colliders stop here, as nature.js's do. */
const COLLIDE_R = 700;
/* The density is read on a grid this fine and interpolated: the terms
 * in it vary over two hundred metres and more. */
const DGRID = 20;

/*
 * Plant the valley. `spacing` is the jittered grid's cell in metres: the
 * spacing of a closed stand. Returns the trees as parallel arrays (x, y,
 * z, scale s, yaw, variant v) and counts by species.
 */
export function plantForest({ heightAt, layout, rng, spacing, colliders }) {
  const { keepOff, streamDist, lower } = layout;
  const solidAt = layout.solidAt || (() => false);
  /* The density and slope on a grid, once. */
  const n = Math.round(FIELD / DGRID) + 1;
  const dens = new Float32Array(n * n);
  const slope = new Float32Array(n * n);
  for (let j = 0; j < n; j += 1) {
    const z = -HALF + j * DGRID;
    for (let i = 0; i < n; i += 1) {
      const x = -HALF + i * DGRID;
      const y = heightAt(x, z);
      const sx = (heightAt(x + 10, z) - heightAt(x - 10, z)) / 20;
      const sz = (heightAt(x, z + 10) - heightAt(x, z - 10)) / 20;
      const s = Math.hypot(sx, sz);
      slope[j * n + i] = s;
      if (y >= TREE_LINE + 70 || s >= 0.95) {
        continue;
      }
      let d = forestDensity(x, y, z, s, sz);
      /* The fingers: forestDensity starts thirty metres up the walls,
       * which drew the forest's foot as a contour. In a gully (the ground
       * forty metres either side along the contour higher than the
       * middle, by more than a metre or two; along the fall line the foot
       * of every wall is hollow, and that would draw the contour again)
       * the forest the slope above would carry runs on down to the foot
       * of the wall. */
      if (y < 110 && s > 0.04) {
        const tx = -sz / s;
        const tz = sx / s;
        const hollow = (heightAt(x + 40 * tx, z + 40 * tz) + heightAt(x - 40 * tx, z - 40 * tz)) / 2 - y;
        const above = forestDensity(x, Math.max(y, 95), z, s, sz);
        d = Math.max(d, above * smoothstep(0.8, 4, hollow) * smoothstep(3, 16, y));
      }
      dens[j * n + i] = d;
    }
  }
  const sample = (arr, x, z) => {
    const u = Math.max(0, Math.min(n - 1.001, (x + HALF) / DGRID));
    const v = Math.max(0, Math.min(n - 1.001, (z + HALF) / DGRID));
    const i = Math.floor(u);
    const j = Math.floor(v);
    const fu = u - i;
    const fv = v - j;
    const a = arr[j * n + i];
    const b = arr[j * n + i + 1];
    const c = arr[(j + 1) * n + i];
    const d = arr[(j + 1) * n + i + 1];
    return (a + (b - a) * fu) * (1 - fv) + (c + (d - c) * fu) * fv;
  };
  /* A cell of the density grid with nothing in it or its neighbours is
   * skipped whole, which is most of the valley: the floor, the rock and
   * the snow. */
  const live = new Uint8Array(n * n);
  for (let j = 0; j < n - 1; j += 1) {
    for (let i = 0; i < n - 1; i += 1) {
      const m = Math.max(dens[j * n + i], dens[j * n + i + 1], dens[(j + 1) * n + i], dens[(j + 1) * n + i + 1]);
      live[j * n + i] = m > 0.025 ? 1 : 0;
    }
  }

  const xs = [];
  const ys = [];
  const zs = [];
  const ss = [];
  const yaws = [];
  const vs = [];
  const opens = [];
  const counts = { spruce: 0, fir: 0, larch: 0, beech: 0, maple: 0, snag: 0 };
  /*
   * The fall's foot. Under the Staubbach the ground is a steep meadow
   * with broadleaf trees round it, sycamore and beech in the spray, and
   * the spruce stand only further off: a dark closed stand at the foot
   * of a white fall read as a hole. So near the pool no tree stands, and
   * out to a couple of hundred metres more and more of the conifers are
   * broadleaves, in groups. -1 for no tree, else the variant to plant.
   */
  const pool = layout.pool;
  const CONIFER = new Set(['spruce', 'fir', 'larch']);
  const fallFoot = (x, z, v) => {
    if (!pool) {
      return v;
    }
    const d = Math.hypot(x - pool.x, z - pool.z) + 30 * (noise2(x / 40 + 2.7, z / 40 + 6.1) - 0.5);
    if (d < 50) {
      return -1;
    }
    if (!CONIFER.has(VARIANTS[v].kind)) {
      return v;
    }
    const share = 0.85 * (1 - smoothstep(90, 230, d));
    const pick = noise2(x / 13 + 0.3, z / 13 + 5.9);
    if (smoothstep(0.35, 0.65, noise2(x / 55 + 8.1, z / 55 + 1.9)) * 0.4 + pick * 0.6 > 1 - share) {
      return pick > 0.55 ? V.maple : V['beech-open'];
    }
    return v;
  };
  /* `open`: the tree grew in the open (the open grown variants, and
   * whatever stands in the meadow, the mantle and the gallery included),
   * and alone of the far trees throws a shadow. */
  const add = (x, y, z, s, v0, open0) => {
    /* The yaw is drawn first and always, so a tree the fall's foot turns
     * away or changes, or the carved rock turns away, costs the rest of
     * the valley nothing: every tree after it stands where it stood. */
    const yaw = rng();
    const v = fallFoot(x, z, v0);
    if (v < 0 || (layout.carved && layout.carved(x, z))) {
      return;
    }
    const open = v === v0 && open0 !== undefined ? open0 : OPEN[v];
    xs.push(x);
    ys.push(y - 0.2);
    zs.push(z);
    ss.push(s);
    yaws.push(yaw * Math.PI * 2);
    vs.push(v);
    opens.push(open ? 1 : 0);
    counts[VARIANTS[v].kind] += 1;
    if (colliders && Math.hypot(x, z) < COLLIDE_R) {
      const spec = VARIANTS[v];
      const h = spec.h * s;
      if (spec.kind === 'beech' || spec.kind === 'maple') {
        colliders.addPost('tree', x, z, y, y + spec.trunk * h, 0.35 * s);
        colliders.addSphere('canopy', x, y + 0.6 * h, z, spec.rx * h * 0.85);
      } else {
        colliders.addPost('tree', x, z, y, y + h * 0.95, 0.45 * spec.reach * (spec.h / 26) * s);
      }
    }
  };

  /* A bush: an open grown broadleaf a fifth the size, sunk to its skirt
   * so its leaves come down into the grass, hazel and young sycamore
   * rather than a small tree on a stick. */
  const bush = (x, y, z, s) => {
    const v = rng() < 0.5 ? V.maple : V['beech-open'];
    add(x, y - 0.3 * VARIANTS[v].h * s, z, s, v, true);
  };

  const cells = Math.floor(FIELD * 0.97 / spacing);
  const x0 = -cells * spacing / 2;
  for (let cj = 0; cj < cells; cj += 1) {
    for (let ci = 0; ci < cells; ci += 1) {
      const x = x0 + (ci + 0.15 + 0.7 * rng()) * spacing;
      const z = x0 + (cj + 0.15 + 0.7 * rng()) * spacing;
      const gi = Math.floor((x + HALF) / DGRID);
      const gj = Math.floor((z + HALF) / DGRID);
      if (!live[gj * n + gi]) {
        continue;
      }
      const d0 = sample(dens, x, z);
      /* The edge wanders by tens of metres, and storms and fellings have
       * opened the stand here and there. */
      const ragged = 0.2 * (noise2(x / 48 + 3.1, z / 48 + 8.2) - 0.5) + 0.1 * (noise2(x / 15 + 1.7, z / 15 + 4.4) - 0.5);
      const clearing = smoothstep(0.66, 0.74, noise2(x / 120 + 9.3, z / 120 + 2.6)) + smoothstep(0.76, 0.82, noise2(x / 34 + 5.2, z / 34 + 7.9));
      const d = (d0 + ragged * smoothstep(0.02, 0.2, d0)) * (1 - 0.92 * Math.min(1, clearing));
      const keep = smoothstep(0.07, 0.5, d);
      /* The mantle: just outside the stand's edge, where it is not kept,
       * young trees and bushes stand out into the meadow in groups, and
       * more of them in a clearing, which is growing back. */
      const group = smoothstep(0.55, 0.75, noise2(x / 22 + 0.9, z / 22 + 3.3));
      const mantle = keep < 0.5
        ? group * (0.18 * smoothstep(0.035, 0.08, d0) * (1 - smoothstep(0.12, 0.2, d0)) + 0.1 * Math.min(1, clearing) * smoothstep(0.1, 0.4, d0))
        : 0;
      const r0 = rng();
      if ((r0 > keep && r0 > keep + mantle) || keepOff(x, z) || solidAt(x, z)) {
        continue;
      }
      const y = heightAt(x, z);
      if (y < LAKE_Y + 2.5 || streamDist(x, z) < 6) {
        continue;
      }
      const line = treeLine(x, z);
      if (r0 > keep) {
        /* A mantle tree: a young spruce, or up to a hundred metres over
         * the floor a hazel or sycamore bush. */
        if (y < 100 + 60 * noise2(x / 80, z / 80) && rng() < 0.55) {
          bush(x, y, z, 0.18 + 0.2 * rng());
        } else {
          add(x, y, z, 0.25 + 0.35 * rng(), V['spruce-young'], true);
        }
        continue;
      }
      const s = sample(slope, x, z);
      /* Larch among the spruce well below the tree line, in groups. */
      const larchP = 0.85 * smoothstep(line - 320, line - 60, y)
        + 0.3 * smoothstep(110, 220, y) * smoothstep(0.55, 0.75, noise2(x / 140 + 6.6, z / 140 + 0.7));
      const beechP = 0.4 * (1 - smoothstep(90, 200, y)) * (1 - smoothstep(0.35, 0.6, s));
      const firP = 0.3 * smoothstep(60, 160, y) * (1 - smoothstep(420, 620, y));
      /* Closed: in the stand, not on its edge. An edge tree grew in the
       * light and keeps its branches to the ground, the mantle a forest
       * shows a meadow. */
      const edge = Math.min(sample(dens, x + 14, z), sample(dens, x - 14, z), sample(dens, x, z + 14), sample(dens, x, z - 14));
      const closed = d > 0.42 && edge > 0.22;
      /* The stand's age: the canopy steps from a stand of young trees to
       * an old one. Stunted toward the tree line, as they are. */
      const age = smoothstep(0.25, 0.75, noise2(x / 170 + 2.2, z / 170 + 5.5));
      const scale = (0.8 + 0.4 * rng()) * (0.76 + 0.36 * age) * (1 - 0.35 * smoothstep(line - 180, line + 40, y));
      /* The dead, standing: one in a hundred in a closed stand, one in
       * twelve toward the tree line. */
      if (rng() < (closed ? 0.012 : 0.004) + 0.07 * smoothstep(line - 260, line - 20, y)) {
        add(x, y, z, 0.6 + 0.5 * rng(), V.snag);
        continue;
      }
      const pick = rng();
      if (pick < beechP) {
        if (rng() < 0.3) {
          add(x, y, z, scale, V.maple);
        } else {
          add(x, y, z, scale, closed ? V['beech-tall'] : V['beech-open']);
        }
      } else if (pick < beechP + larchP) {
        add(x, y, z, scale, closed && y < line - 120 ? V['larch-tall'] : V['larch-open']);
      } else if (rng() < firP) {
        add(x, y, z, scale, closed ? V['fir-forest'] : V['fir-open']);
      } else if (closed) {
        add(x, y, z, scale, rng() < 0.3 + 0.5 * age ? V['spruce-forest'] : V['spruce-young']);
      } else {
        add(x, y, z, scale, rng() < 0.6 ? V['spruce-open'] : V['spruce-young']);
      }
    }
  }
  /* Field and bank trees grew in the open: the open grown forms only,
   * the tall forest beech being a trunk under a ball out here. */
  const floorOk = (x, y, z) => y >= LAKE_Y + 2.5 && y <= 60 && !keepOff(x, z) && !solidAt(x, z) && streamDist(x, z) >= 4.5;
  /* The stream's gallery. nature.js scattered its bank trees evenly
   * along both banks, which from the meadow was one row of the same
   * tree: here each bank has its own clumps and gaps down the valley,
   * bushes at the water's edge (hazel, young sycamore) and behind them
   * trees of every age, with a young spruce among them now and then. */
  for (const at of lower) {
    for (const side of [-1, 1]) {
      const clump = smoothstep(0.38, 0.62, noise2(at.z / 60 + 4.1 + side * 13, side * 3.7 + 2.2));
      if (clump <= 0) {
        continue;
      }
      const bushes = Math.round(clump * (1 + 2.5 * rng()));
      for (let k = 0; k < bushes; k += 1) {
        const x = at.x + side * (4.6 + rng() * 4);
        const z = at.z + (rng() - 0.5) * 12;
        const y = heightAt(x, z);
        if (floorOk(x, y, z)) {
          bush(x, y, z, 0.16 + 0.22 * rng());
        }
      }
      const trees = Math.round(clump * (1 + 2.5 * rng()));
      for (let k = 0; k < trees; k += 1) {
        const x = at.x + side * (7 + rng() * 20);
        const z = at.z + (rng() - 0.5) * 12;
        const y = heightAt(x, z);
        if (!floorOk(x, y, z)) {
          continue;
        }
        const r = rng();
        if (r < 0.1) {
          add(x, y, z, 0.45 + 0.4 * rng(), V['spruce-young'], true);
        } else {
          add(x, y, z, 0.5 + 0.85 * rng(), r < 0.45 ? V.maple : V['beech-open']);
        }
      }
    }
  }
  /* And alone or in twos and threes out in the fields. */
  for (let k = 0; k < 385; k += 1) {
    const z = (rng() - 0.5) * FIELD * 0.8;
    const x = valleyAxis(z) + (rng() - 0.5) * 700;
    if (noise2(x / 120 + 7.7, z / 120 + 1.1) < 0.6) {
      continue;
    }
    const y = heightAt(x, z);
    if (floorOk(x, y, z) && streamDist(x, z) >= 5) {
      add(x, y, z, 0.8 + rng() * 0.5, rng() < 0.4 ? V.maple : V['beech-open']);
    }
  }
  /* The gardens. No house in the reference photographs stands on bare
   * lawn: most have a tree or two beside them, kept small and clear of
   * the roof. Planted round the village's own walls (a parked car or a
   * church is too small or too big to be a house), a crown's width off
   * every wall, never on a road, the square or the strip. */
  const walls = layout.gardens || layout.footprints || [];
  const clearOf = (x, z, d) => walls.every((f) => Math.hypot(Math.max(f.minX - x, 0, x - f.maxX), Math.max(f.minZ - z, 0, z - f.maxZ)) >= d);
  for (const f of walls) {
    const area = (f.maxX - f.minX) * (f.maxZ - f.minZ);
    if (area < 20 || area > 450) {
      continue;
    }
    const n = rng() < 0.3 ? 0 : rng() < 0.6 ? 1 : 2;
    for (let k = 0; k < n; k += 1) {
      const a = rng() * Math.PI * 2;
      const out = 6 + rng() * 6;
      const x = Math.max(f.minX, Math.min(f.maxX, (f.minX + f.maxX) / 2 + Math.cos(a) * 50)) + Math.cos(a) * out;
      const z = Math.max(f.minZ, Math.min(f.maxZ, (f.minZ + f.maxZ) / 2 + Math.sin(a) * 50)) + Math.sin(a) * out;
      if (layout.coverOff(x, z) || !clearOf(x, z, 5.5) || streamDist(x, z) < 5) {
        continue;
      }
      add(x, heightAt(x, z), z, 0.5 + rng() * 0.25, rng() < 0.5 ? V.maple : V['beech-open']);
    }
  }
  /* Planted after everything above, so none of it moves. */
  const floorTree = (x, z, s, v) => {
    const y = heightAt(x, z);
    if (floorOk(x, y, z) && !layout.coverOff(x, z) && streamDist(x, z) >= 6) {
      add(x, y, z, s, v);
    }
  };
  /* Hedgerows. The references' floor has trees everywhere, and most of
   * them stand on the lines between the fields: a row of ash, sycamore
   * and hazel along a ditch or a fence, gapped where a gate or a track
   * goes through. A quarter of the lines between the paint's fields
   * (zones.js meadowCuts) grow one, a couple of metres to one side, a
   * tree every nine to twenty five metres with bushes between. */
  meadowCuts(heightAt).forEach((line, li) => {
    const pick = noise2(li * 0.731 + 0.5, 3.3);
    if (pick < 0.62) {
      return;
    }
    const side = pick > 0.81 ? 1 : -1;
    let next = rng() * 10;
    for (let k = 1; k < line.length; k += 1) {
      if (k < next) {
        continue;
      }
      next = k + 9 + 16 * rng();
      const a = line[k - 1];
      const b = line[k];
      const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const off = side * (1.6 + rng());
      const x = b.x - ((b.z - a.z) / l) * off;
      const z = b.z + ((b.x - a.x) / l) * off;
      if (noise2(x / 45 + 2.9, z / 45 + 6.6) < 0.38) {
        continue;
      }
      if (rng() < 0.4) {
        const y = heightAt(x, z);
        if (floorOk(x, y, z) && !layout.coverOff(x, z)) {
          bush(x, y, z, 0.18 + 0.2 * rng());
        }
      } else {
        floorTree(x, z, 0.55 + 0.6 * rng(), rng() < 0.5 ? V.maple : V['beech-open']);
      }
    }
  });
  /* Orchards: standard fruit trees, the Hochstamm every Bernese farm
   * keeps in the meadow beside it, a few rows eleven metres apart with a
   * tree missing here and there, round crowns on two metre trunks. By the
   * east farm and on the village's outskirts. */
  const orchard = (cx, cz, yaw, cols, rows) => {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    for (let i = 0; i < cols; i += 1) {
      for (let j = 0; j < rows; j += 1) {
        const u = (i - (cols - 1) / 2) * 11 + (rng() - 0.5) * 1.5;
        const v = (j - (rows - 1) / 2) * 11 + (rng() - 0.5) * 1.5;
        if (rng() < 0.15) {
          continue;
        }
        floorTree(cx + u * c - v * s, cz + u * s + v * c, 0.46 + 0.1 * rng(), rng() < 0.7 ? V['beech-open'] : V.maple);
      }
    }
  };
  const farm = layout.eastFarm;
  orchard(farm.x + 10, farm.z + 112, 0.1, 5, 3);
  orchard(farm.x - 20, farm.z - 110, -0.15, 4, 3);
  orchard(-300, 405, 0.3, 4, 4);
  orchard(-150, 390, -0.2, 5, 3);
  orchard(-250, -365, 0.05, 5, 3);
  return {
    x: Float32Array.from(xs),
    y: Float32Array.from(ys),
    z: Float32Array.from(zs),
    s: Float32Array.from(ss),
    yaw: Float32Array.from(yaws),
    v: Uint8Array.from(vs),
    open: Uint8Array.from(opens),
    count: xs.length,
    counts,
  };
}

/* A grid over the trees, so the camera's neighbourhood is read without
 * touching the whole forest. */
function treeGrid(forest, cell) {
  const n = Math.ceil(FIELD / cell) + 1;
  const counts = new Uint32Array(n * n + 1);
  const key = (t) => {
    const i = Math.max(0, Math.min(n - 1, Math.floor((forest.x[t] + HALF) / cell)));
    const j = Math.max(0, Math.min(n - 1, Math.floor((forest.z[t] + HALF) / cell)));
    return j * n + i;
  };
  for (let t = 0; t < forest.count; t += 1) {
    counts[key(t) + 1] += 1;
  }
  for (let k = 1; k <= n * n; k += 1) {
    counts[k] += counts[k - 1];
  }
  const fill = counts.slice();
  const items = new Uint32Array(forest.count);
  for (let t = 0; t < forest.count; t += 1) {
    items[fill[key(t)]++] = t;
  }
  return { n, cell, start: counts, items };
}

/*
 * The two model levels. `builds[v]` holds each variant's near and mid
 * geometry; `mats` the materials: nearFoliage, nearBark, mid (and their
 * depth materials). `bands` is { near, mid } in metres: the near level
 * draws to near, the mid level from near to mid, each with `fade` of
 * overlap. `sunDir` points toward the sun, for the shadows the view must
 * keep. Returns the meshes (added to `group`) and update(camera).
 */
export function forestLod({ forest, builds, mats, bands, fade, caps, group, sunDir }) {
  const grid = treeGrid(forest, 50);
  const nearOn = bands.near > 0;
  const levels = [];
  const mk = (geo, mat, depth, cap, name) => {
    const m = new THREE.InstancedMesh(geo, mat, cap);
    m.count = 0;
    m.frustumCulled = false;
    m.castShadow = true;
    m.receiveShadow = true;
    m.customDepthMaterial = depth;
    m.name = name;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(m);
    return m;
  };
  builds.forEach((b, v) => {
    const name = VARIANTS[v].name;
    const entry = { near: null, bark: null, mid: null };
    if (VARIANTS[v].impostorOnly) {
      levels.push(entry);
      return;
    }
    if (nearOn) {
      entry.near = mk(b.near.foliage, mats.nearFoliage, mats.foliageDepth, caps.near, `${name}-near`);
      if (b.near.bark) {
        entry.bark = mk(b.near.bark, mats.nearBark, mats.barkDepth, caps.near, `${name}-bark`);
        entry.bark.instanceMatrix = entry.near.instanceMatrix;
      }
    }
    entry.mid = mk(b.mid.foliage, mats.mid, mats.foliageDepth, caps.mid, `${name}-mid`);
    levels.push(entry);
  });
  const reachNear = bands.near + fade;
  const midFrom = Math.max(0, bands.near - fade);
  const reach = bands.mid + fade;
  const last = new THREE.Vector3(Infinity, 0, 0);
  const lastDir = new THREE.Vector3();
  const here = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const frustum = new THREE.Frustum();
  const viewProj = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  /* Where a tree's shadow falls, per metre of the tree's height: away
   * from the sun, along the ground, at the sun's elevation. */
  const shadowRun = new THREE.Vector3();
  if (sunDir) {
    const flat = Math.hypot(sunDir.x, sunDir.z);
    const run = flat / Math.max(sunDir.y, 0.2);
    shadowRun.set(-sunDir.x / flat, 0, -sunDir.z / flat).multiplyScalar(run);
  }
  const put = (arr, k, t) => {
    const s = forest.s[t];
    const c = Math.cos(forest.yaw[t]) * s;
    const sn = Math.sin(forest.yaw[t]) * s;
    const o = k * 16;
    arr[o] = c;
    arr[o + 1] = 0;
    arr[o + 2] = -sn;
    arr[o + 3] = 0;
    arr[o + 4] = 0;
    arr[o + 5] = s;
    arr[o + 6] = 0;
    arr[o + 7] = 0;
    arr[o + 8] = sn;
    arr[o + 9] = 0;
    arr[o + 10] = c;
    arr[o + 11] = 0;
    arr[o + 12] = forest.x[t];
    arr[o + 13] = forest.y[t];
    arr[o + 14] = forest.z[t];
    arr[o + 15] = 1;
  };
  let dropped = 0;
  const stats = { near: 0, mid: 0, dropped: 0 };
  /*
   * Whether tree t, `h` metres tall, or its shadow, is in the frustum: one
   * sphere round the crown and the ground its shadow covers, grown by a
   * margin so a camera turning between refills does not show the edge.
   */
  const seen = (t, h, d) => {
    const x = forest.x[t];
    const y = forest.y[t];
    const z = forest.z[t];
    const top = y + h;
    const sx = x + shadowRun.x * h;
    const sz = z + shadowRun.z * h;
    sphere.center.set((x + sx) * 0.5, (y + top) * 0.5, (z + sz) * 0.5);
    sphere.radius = 0.5 * Math.hypot(sx - x, h, sz - z) + 0.25 * h + 4 + 0.06 * d;
    return frustum.intersectsSphere(sphere);
  };
  /* The camera's position and view: refilled when it has moved three
   * metres or turned two degrees. */
  const update = (camera, force = false) => {
    const pos = camera.getWorldPosition(here);
    camera.getWorldDirection(dir);
    if (!force && pos.distanceToSquared(last) < 9 && dir.dot(lastDir) > 0.9994) {
      return;
    }
    last.copy(pos);
    lastDir.copy(dir);
    camera.updateMatrixWorld();
    viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProj);
    const nNear = new Uint32Array(levels.length);
    const nMid = new Uint32Array(levels.length);
    const { n, cell, start, items } = grid;
    const i0 = Math.max(0, Math.floor((pos.x - reach + HALF) / cell));
    const i1 = Math.min(n - 1, Math.floor((pos.x + reach + HALF) / cell));
    const j0 = Math.max(0, Math.floor((pos.z - reach + HALF) / cell));
    const j1 = Math.min(n - 1, Math.floor((pos.z + reach + HALF) / cell));
    dropped = 0;
    for (let j = j0; j <= j1; j += 1) {
      for (let i = i0; i <= i1; i += 1) {
        const k = j * n + i;
        for (let q = start[k]; q < start[k + 1]; q += 1) {
          const t = items[q];
          const dx = forest.x[t] - pos.x;
          const dy = forest.y[t] + 10 * forest.s[t] - pos.y;
          const dz = forest.z[t] - pos.z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d > reach) {
            continue;
          }
          const v = forest.v[t];
          const L = levels[v];
          if (!L.mid || !seen(t, VARIANTS[v].h * forest.s[t], d)) {
            continue;
          }
          if (nearOn && d < reachNear) {
            if (nNear[v] < caps.near) {
              put(L.near.instanceMatrix.array, nNear[v], t);
              nNear[v] += 1;
            } else {
              dropped += 1;
            }
          }
          if (d > midFrom) {
            if (nMid[v] < caps.mid) {
              put(L.mid.instanceMatrix.array, nMid[v], t);
              nMid[v] += 1;
            } else {
              dropped += 1;
            }
          }
        }
      }
    }
    stats.near = 0;
    stats.mid = 0;
    levels.forEach((L, v) => {
      for (const [m, count] of [[L.near, nNear[v]], [L.bark, nNear[v]], [L.mid, nMid[v]]]) {
        if (!m) {
          continue;
        }
        m.count = count;
        m.visible = count > 0;
        m.instanceMatrix.clearUpdateRanges();
        m.instanceMatrix.addUpdateRange(0, count * 16);
        m.instanceMatrix.needsUpdate = true;
      }
      stats.near += nNear[v];
      stats.mid += nMid[v];
    });
    stats.dropped = dropped;
  };
  return { update, stats, levels };
}
