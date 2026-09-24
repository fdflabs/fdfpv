/*
 * mammoth.js: the travertine terraces of Mammoth Hot Springs.
 *
 * Hot water full of dissolved limestone comes out on the hillside above
 * the village and lays travertine down as it cools and spills, building a
 * staircase of flat topped terraces whose fronts are scalloped curtains a
 * metre to several metres high, each flat holding shallow pools behind a
 * rimstone lip. Where the water runs now the travertine is bright white and
 * the pools pale blue, with orange and brown bacteria streaking the fronts;
 * where it has moved on the rock weathers to grey and cream and the trees
 * it drowned stand dead and grey. Main Terrace is the big central
 * staircase, Minerva and Canary Spring its lobes.
 *
 * The staircase is a heightfield over the hillside: at every point the
 * ground's own height, shifted by a slow lobed noise, rounded UP to the
 * next step, so the flats run along the contours and the fronts fall
 * where the steps change, in scalloped lines. Rounding up keeps every
 * vertex at or above the ground. It is laid on a 2 m drape grid, fine
 * enough that a 3 m step is a steep curtain rather than a ramp, and faded
 * back to the ground at the edges of the terrace complex.
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
import { paintMaterial, LAYER } from '../paint.js';
import { SteamBuilder } from '../steam.js';
import { CellSet } from '../grid.js';
import { hash01 } from '../schedule.js';
import { patch, lathe, rockMaterial } from './kit.js';

const STEP = 4.2;
const GRID = 2;
/* The fraction of a step's run the front takes: at the hill's slope of
 * about 0.2 a step runs twenty metres, so a front is about five. */
const FRONT = 0.24;

/* Value noise, the same shape as the shader's, for the terrace lobes. */
function hash2(ix, iz) {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
const smooth = (a, b, v) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function buildMammoth(env, f) {
  const { heightAt } = env;
  const { x, z } = f;
  const group = new THREE.Group();
  group.name = 'mammoth';
  /* Downhill, from the ground's own fall across a hundred metres: the
   * lobes are laid out along it. */
  const gx = (heightAt(x + 60, z) - heightAt(x - 60, z)) / 120;
  const gz = (heightAt(x, z + 60) - heightAt(x, z - 60)) / 120;
  const g = Math.hypot(gx, gz) || 1;
  const down = { x: -gx / g, z: -gz / g };
  const side = { x: -down.z, z: down.x };
  const at = (u, v) => ({ x: x + down.x * u + side.x * v, z: z + down.z * u + side.z * v });
  /* Main Terrace in the middle, Minerva down and to one side, Canary up
   * and to the other, as ellipses in the down and side frame. */
  const lobes = [
    { c: at(0, 0), a: 150, b: 105 },
    { c: at(95, -95), a: 70, b: 55 },
    { c: at(-80, 90), a: 85, b: 60 },
  ];
  const weight = (px, pz) => {
    let w = 0;
    for (const l of lobes) {
      const dx = px - l.c.x;
      const dz = pz - l.c.z;
      const u = (dx * down.x + dz * down.z) / l.a;
      const v = (dx * side.x + dz * side.z) / l.b;
      const r = Math.hypot(u, v) * (1 + 0.18 * (noise(px / 35, pz / 35) - 0.5));
      w = Math.max(w, 1 - smooth(0.7, 1.0, r));
    }
    return w;
  };
  const lobeNoise = (px, pz) => STEP * (1.6 * noise(px / 38 + 3.1, pz / 38 + 7.7) + 0.7 * noise(px / 11, pz / 11));
  /* The stepped surface and what the shader needs of it: how far across
   * its flat a point is (0 at the back, 1 at the drop), the blend weight,
   * and whether the water runs here now. */
  const surface = (px, pz) => {
    const h = heightAt(px, pz);
    const w = weight(px, pz);
    if (w <= 0) {
      return { y: h, frac: 0, w: 0 };
    }
    /* Over one step, f from 0 at the foot of a front to 1 at the back of
     * the flat above it: the front climbs a whole step in the first FRONT
     * of that, steep but continuous (a sheer step sampled on the grid came
     * out as a saw tooth), and never below the ground (the max with f). */
    const n = lobeNoise(px, pz);
    const q = (h + n) / STEP;
    const f = q - Math.floor(q);
    const rise = Math.max(f, smooth(0, FRONT, f));
    const back = f < FRONT ? 0 : 1 - (f - FRONT) / (1 - FRONT);
    const lip = 0.3 * smooth(0.8, 0.97, back) * (f < FRONT ? 0 : 1);
    return { y: h + w * ((Math.floor(q) + rise) * STEP - n - h + lip), frac: back, w };
  };

  const set = new CellSet(GRID);
  for (const l of lobes) {
    const r = Math.max(l.a, l.b) * 1.05;
    for (let i = set.index(l.c.x - r); i <= set.index(l.c.x + r); i += 1) {
      for (let j = set.index(l.c.z - r); j <= set.index(l.c.z + r); j += 1) {
        if (weight(set.coord(i) + GRID / 2, set.coord(j) + GRID / 2) > 0) {
          set.add(i, j);
        }
      }
    }
  }
  const mat = paintMaterial({
    key: 'mammoth-terraces',
    attrs: ['vec4 aTer'],
    bias: LAYER.patch,
    cel: { rim: 0.14 },
    body: /* glsl */ `
      vec2 w = vCelWorld.xz;
      float frac = vTer.x;
      float weight = vTer.y;
      float steep = vTer.z;
      float live = vTer.w;
      if (weight < 0.08 + 0.12 * ysNoise(w * 0.08)) {
        discard;
      }
      vec3 white = ysRgb(0.95, 0.93, 0.88);
      vec3 cream = ysRgb(0.88, 0.84, 0.74);
      vec3 grey = ysRgb(0.70, 0.68, 0.64);
      vec3 pool = ysRgb(0.56, 0.78, 0.82);
      vec3 orange = ysRgb(0.86, 0.55, 0.24);
      vec3 brown = ysRgb(0.55, 0.38, 0.24);
      /* Old rock: cream and grey. Live rock: bright white. */
      vec3 top = mix(mix(cream, grey, smoothstep(0.4, 0.8, ysFbm(w * 0.03))), white, live);
      /* Pools on the live flats, a band just behind each lip. */
      float wet = live * smoothstep(0.55, 0.65, frac) * (1.0 - smoothstep(0.86, 0.9, frac)) * smoothstep(0.4, 0.6, ysNoise(w * 0.15));
      top = mix(top, pool, wet);
      /* The fronts: curtains streaked down their height, orange and
       * brown where the water runs, weathered grey and tan where it has
       * stopped, always darker than the flats so the stairs read. */
      float streak = ysNoise(vec2(w.x * 0.9 + w.y * 0.4, vCelWorld.y * 0.25));
      vec3 deadFace = mix(ysRgb(0.66, 0.62, 0.55), ysRgb(0.58, 0.50, 0.40), streak);
      vec3 liveFace = mix(mix(orange, brown, smoothstep(0.3, 0.8, streak)), white, (1.0 - smoothstep(0.2, 0.4, streak)) * 0.7);
      vec3 face = mix(deadFace, liveFace, live);
      paint = mix(top, face, smoothstep(0.45, 0.8, steep));
      /* The lip of each flat catches the light. */
      paint = mix(paint, white, smoothstep(0.86, 0.95, frac) * (1.0 - smoothstep(0.55, 0.9, steep)) * 0.7);
      paint = mix(ysRgb(0.78, 0.76, 0.70), paint, smoothstep(0.1, 0.45, weight));
    `,
  });
  const liveAt = (px, pz) => smooth(0.4, 0.55, noise(px / 90 + 1.3, pz / 90 + 4.4));
  const mesh = patch(set, heightAt, mat, {
    name: 'mammoth-terraces',
    lift: (px, pz) => surface(px, pz).y - heightAt(px, pz),
    attrs: { aTer: 4 },
    fill: (px, pz, py, out) => {
      const s = surface(px, pz);
      const sx = (surface(px + 1, pz).y - surface(px - 1, pz).y) / 2;
      const sz = (surface(px, pz + 1).y - surface(px, pz - 1).y) / 2;
      out.aTer = [s.frac, s.w, Math.min(1, Math.hypot(sx, sz) / 1.6), liveAt(px, pz)];
    },
  });
  mesh.castShadow = true;
  group.add(mesh);

  /* Steam off the live springs: a handful of vents on live flats. */
  /* Into the region's ambient steam when there is one: one draw for the
   * basin. */
  const steam = env.ambient ?? new SteamBuilder();
  const steamBefore = steam.count;
  let vents = 0;
  for (let k = 0; k < 400 && vents < 14; k += 1) {
    const u = (hash01(k, 21) - 0.5) * 280;
    const v = (hash01(k, 22) - 0.5) * 220;
    const p = at(u, v);
    const s = surface(p.x, p.z);
    if (s.w < 0.7 || liveAt(p.x, p.z) < 0.6) {
      continue;
    }
    steam.vent({ x: p.x, y: s.y, z: p.z, spread: 4, count: 4, size: 2.4, rise: 9, life: 9, alpha: 0.4, rng: env.rng });
    vents += 1;
  }
  const sm = env.ambient ? null : steam.build(env, { name: 'mammoth-steam' });
  if (sm) {
    group.add(sm);
  }

  /* Dead trees: grey snags standing in the old travertine. */
  const snags = [];
  for (let k = 0; k < 600 && snags.length < 28; k += 1) {
    const u = (hash01(k, 31) - 0.5) * 300;
    const v = (hash01(k, 32) - 0.5) * 240;
    const p = at(u, v);
    const s = surface(p.x, p.z);
    if (s.w < 0.6 || liveAt(p.x, p.z) > 0.2 || s.frac > 0.7) {
      continue;
    }
    const h = 6 + 7 * hash01(k, 33);
    snags.push(lathe([[0.22, -0.3, 0x8d877d], [0.16, h * 0.5, 0x9a948a], [0.04, h, 0xa7a197]], { x: p.x, z: p.z, foot: s.y, segs: 5 }));
  }
  if (snags.length) {
    const merged = mergeLathes(snags);
    const trees = new THREE.Mesh(merged, rockMaterial());
    trees.name = 'mammoth-snags';
    trees.castShadow = true;
    group.add(trees);
  }
  const top = surface(x, z).y;
  return { id: 'mammoth', group, update() {}, particles: steam.count - steamBefore, focus: { x, y: top, z, r: 180, height: 40 }, snags: snags.length };
}

function mergeLathes(list) {
  const pos = [];
  const col = [];
  const idx = [];
  for (const g of list) {
    const base = pos.length / 3;
    pos.push(...g.getAttribute('position').array);
    col.push(...g.getAttribute('color').array);
    for (const i of g.index.array) {
      idx.push(i + base);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
