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
 * says, in water, or on the stream.
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

const V = Object.fromEntries(VARIANTS.map((v, k) => [v.name, k]));
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
      dens[j * n + i] = y < TREE_LINE + 70 && s < 0.95 ? forestDensity(x, y, z, s, sz) : 0;
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
      live[j * n + i] = m > 0.06 ? 1 : 0;
    }
  }

  const xs = [];
  const ys = [];
  const zs = [];
  const ss = [];
  const yaws = [];
  const vs = [];
  const counts = { spruce: 0, fir: 0, larch: 0, beech: 0, maple: 0 };
  const add = (x, y, z, s, v) => {
    xs.push(x);
    ys.push(y - 0.2);
    zs.push(z);
    ss.push(s);
    yaws.push(rng() * Math.PI * 2);
    vs.push(v);
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
      const d = sample(dens, x, z);
      if (rng() > smoothstep(0.07, 0.5, d) || keepOff(x, z)) {
        continue;
      }
      const y = heightAt(x, z);
      if (y < LAKE_Y + 2.5 || streamDist(x, z) < 6) {
        continue;
      }
      const s = sample(slope, x, z);
      const line = treeLine(x, z);
      const larchP = 0.85 * smoothstep(line - 320, line - 60, y);
      const beechP = 0.4 * (1 - smoothstep(90, 200, y)) * (1 - smoothstep(0.35, 0.6, s));
      const firP = 0.3 * smoothstep(60, 160, y) * (1 - smoothstep(420, 620, y));
      /* Closed: in the stand, not on its edge. An edge tree grew in the
       * light and keeps its branches to the ground, the mantle a forest
       * shows a meadow. */
      const edge = Math.min(sample(dens, x + 14, z), sample(dens, x - 14, z), sample(dens, x, z + 14), sample(dens, x, z - 14));
      const closed = d > 0.42 && edge > 0.22;
      /* Stunted toward the tree line, as they are. */
      const scale = (0.75 + 0.45 * rng()) * (1 - 0.35 * smoothstep(line - 180, line + 40, y));
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
        add(x, y, z, scale, rng() < 0.68 ? V['spruce-forest'] : V['spruce-young']);
      } else {
        add(x, y, z, scale, rng() < 0.6 ? V['spruce-open'] : V['spruce-young']);
      }
    }
  }
  /* The floor, nature.js's way: beech and sycamore in clumps along the
   * stream's banks and alone in the fields. */
  for (let k = 0; k < 1100; k += 1) {
    let x;
    let z;
    if (rng() < 0.65) {
      const at = lower[Math.floor(rng() * lower.length)];
      const side = rng() < 0.5 ? -1 : 1;
      x = at.x + side * (6 + rng() * 22);
      z = at.z + (rng() - 0.5) * 30;
    } else {
      z = (rng() - 0.5) * FIELD * 0.8;
      x = valleyAxis(z) + (rng() - 0.5) * 700;
      if (noise2(x / 120 + 7.7, z / 120 + 1.1) < 0.6) {
        continue;
      }
    }
    const y = heightAt(x, z);
    if (y < LAKE_Y + 2.5 || y > 60 || keepOff(x, z) || streamDist(x, z) < 5) {
      continue;
    }
    const s = 0.8 + rng() * 0.5;
    const r = rng();
    add(x, y, z, s, r < 0.35 ? V.maple : r < 0.75 ? V['beech-open'] : V['beech-tall']);
  }
  return {
    x: Float32Array.from(xs),
    y: Float32Array.from(ys),
    z: Float32Array.from(zs),
    s: Float32Array.from(ss),
    yaw: Float32Array.from(yaws),
    v: Uint8Array.from(vs),
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
          if (!seen(t, VARIANTS[v].h * forest.s[t], d)) {
            continue;
          }
          const L = levels[v];
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
