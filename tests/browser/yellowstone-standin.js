/*
 * yellowstone-standin.js: a stand in for the terrain engine, for building
 * the thermal features and the water before the engine exists.
 *
 * An analytic ground in the contract's frame, sampled on the contract's
 * grid (origin -50000, the (i, j + 1) to (i + 1, j) split) at 10 m near the
 * place being looked at and 30 m round it, like a hero tile inside level 0;
 * heightAt reads the triangles of whichever is drawn there, which is what
 * the contract says the engine's ground does. The shape is only what the
 * features need to be judged against: the geyser basins nearly flat at
 * their real heights, the rivers in channels, Excelsior's crater, a hill
 * for Mammoth's terraces to climb, the Grand Canyon of the Yellowstone with
 * the Lower Falls' 94 m step in it, and Yellowstone Lake flattened at its
 * surface as the 3DEP data is. Not loaded by the game.
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
import { celMaterial } from '../../src/render/celmat.js';
import { ORIGIN, triangleHeight } from '../../src/maps/yellowstone/thermal/grid.js';
import { inLake } from '../../src/maps/yellowstone/water/hydro.js';

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

/* Real heights, contract y (metres above 2200): Old Faithful 2245, Midway
 * 2216, the Lower basin 2200, Mammoth's terraces about 1970, the canyon rim
 * by the falls 2400 with the lip at 2330, Yellowstone Lake 2357. */
const ANCHORS = [
  { x: -26325, z: 17964, y: 45 },
  { x: -27143, z: 10790, y: 16 },
  { x: -24718, z: 7841, y: 0 },
  { x: -16630, z: -39394, y: -230 },
  { x: -83, z: -10748, y: 200 },
  { x: 11718, z: 18939, y: 160 },
  { x: -49335, z: -7343, y: -175 },
];

export function makeStandin(hydro) {
  const rivers = hydro.rivers;
  const lakes = hydro.lakes;
  const falls = { x: -83, z: -10748 };
  const LIP = 130;
  const segDist = (p, a, b) => {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
    return { d: Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t), t, len: Math.sqrt(l2) };
  };
  /* Every segment, with its distance along its river, binned by 500 m
   * over the reach a river shapes the ground (its channel, or the
   * canyon's walls): the real hydro.json is seventy six thousand
   * segments, and every sample looking at all of them took minutes. */
  const BIN = 500;
  const REACH = 700;
  const bins = new Map();
  const segs = [];
  for (const r of rivers) {
    let along = 0;
    for (let i = 1; i < r.points.length; i += 1) {
      const a = r.points[i - 1];
      const b = r.points[i];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      segs.push({ r, a, b, along });
      along += len;
    }
  }
  for (const sg of segs) {
    for (let i = Math.floor((Math.min(sg.a.x, sg.b.x) - REACH) / BIN); i <= Math.floor((Math.max(sg.a.x, sg.b.x) + REACH) / BIN); i += 1) {
      for (let j = Math.floor((Math.min(sg.a.z, sg.b.z) - REACH) / BIN); j <= Math.floor((Math.max(sg.a.z, sg.b.z) + REACH) / BIN); j += 1) {
        const key = i * 100003 + j;
        if (!bins.has(key)) {
          bins.set(key, []);
        }
        bins.get(key).push(sg);
      }
    }
  }
  /* Per river near (x, z): the distance to it and how far along it. */
  const nearRivers = (x, z) => {
    const out = new Map();
    for (const sg of bins.get(Math.floor(x / BIN) * 100003 + Math.floor(z / BIN)) ?? []) {
      const q = segDist({ x, z }, sg.a, sg.b);
      const best = out.get(sg.r);
      if (!best || q.d < best.d) {
        out.set(sg.r, { d: q.d, s: sg.along + q.t * q.len, w: sg.a.w + (sg.b.w - sg.a.w) * q.t });
      }
    }
    return out;
  };
  /* The falls are on whichever Yellowstone River line passes nearest
   * the published position. */
  let yRiver = null;
  let fallsAlong = 0;
  for (const [r, n] of nearRivers(falls.x, falls.z)) {
    if (r.name === 'Yellowstone River' && (!yRiver || n.d < nearRivers(falls.x, falls.z).get(yRiver).d)) {
      yRiver = r;
      fallsAlong = n.s;
    }
  }

  function base(x, z) {
    let wsum = 0;
    let ysum = 0;
    for (const a of ANCHORS) {
      const d2 = ((x - a.x) ** 2 + (z - a.z) ** 2) / (5000 * 5000);
      const w = Math.exp(-d2) + 1e-6;
      wsum += w;
      ysum += w * a.y;
    }
    let y = ysum / wsum;
    y += 2.2 * (noise(x / 220, z / 220) - 0.5) + 14 * (noise(x / 2600 + 11, z / 2600 + 5) - 0.5);
    /* Mammoth: the terraces climb a hill that rises to the west. */
    const dm = Math.hypot(x + 16630, z + 39394);
    y += (-(x + 16630) * 0.2 + 12 * (noise(x / 150, z / 150) - 0.5)) * (1 - smooth(600, 1400, dm));
    /* Excelsior's crater, four metres down. */
    const ex = (x + 27043) / 45;
    const ez = (z - 10647) / 30;
    y -= 4.2 * (1 - smooth(0.82, 1.0, Math.sqrt(ex * ex + ez * ez)));
    return y;
  }

  /* The stand in's heights are made up away from its anchors, so only a
   * lake whose surface is near the made up ground there is flattened into
   * it; the rest would stand on plateaus hundreds of metres high. */
  const flatLakes = lakes.filter((l) => {
    const cx = (l.box.x0 + l.box.x1) / 2;
    const cz = (l.box.z0 + l.box.z1) / 2;
    return Math.abs(base(cx, cz) - l.y) < 25;
  });

  function ground(x, z) {
    let y = base(x, z);
    for (const [r, n] of nearRivers(x, z)) {
      const half = (n.w ?? 4) / 2;
      if (r === yRiver) {
        const s = n.s - fallsAlong;
        if (s > -1500 && s < 4000) {
          /* The canyon: the bed at the lip above the falls, 94 m lower
           * past them and falling on, walls steep to the rim. */
          const bed = s < 0 ? LIP - 2 + (-s) * 0.012 : LIP - 2 - 94 * smooth(0, 22, s) - Math.max(0, s - 22) * 0.02;
          const wall = s < 0 ? 0.9 : 1.5;
          const floor = half + (s < 0 ? 4 : 10);
          const canyon = bed + Math.max(0, n.d - floor) * wall + 8 * noise(x / 60, z / 60) * smooth(floor, floor + 40, n.d);
          const blend = smooth(-1500, -1100, s) * (1 - smooth(3500, 4000, s));
          y = Math.min(y, canyon * blend + y * (1 - blend));
          continue;
        }
      }
      /* A channel two metres down with banks a few metres wide. */
      y -= 2 * (1 - smooth(half * 0.7, half + 6, n.d));
    }
    for (const l of flatLakes) {
      if (inLake(l, x, z)) {
        y = l.y;
      }
    }
    return y;
  }

  /* Windows of fine ground: each the region the preview is looking at. */
  const windows = [];
  const sampleCache = new Map();
  const sample = (cell) => (i, j) => {
    const key = `${cell}:${i}:${j}`;
    let v = sampleCache.get(key);
    if (v === undefined) {
      v = ground(ORIGIN + i * cell, ORIGIN + j * cell);
      sampleCache.set(key, v);
    }
    return v;
  };
  const fine = sample(10);
  const coarse = sample(30);
  function heightAt(x, z) {
    for (const w of windows) {
      if (Math.abs(x - w.x) <= w.half && Math.abs(z - w.z) <= w.half) {
        return triangleHeight(fine, 10, x, z);
      }
    }
    return triangleHeight(coarse, 30, x, z);
  }

  const groundMat = celMaterial({ color: 0xffffff, rim: 0.08 });
  groundMat.vertexColors = true;
  /* A grid mesh of `cell` over the box, coloured by slope and noise: dry
   * meadow, lodgepole forest in patches, rock where it is steep. */
  function gridMesh(cell, x0, z0, x1, z1, hole) {
    const at = sample(cell);
    const i0 = Math.floor((x0 - ORIGIN) / cell);
    const i1 = Math.ceil((x1 - ORIGIN) / cell);
    const j0 = Math.floor((z0 - ORIGIN) / cell);
    const j1 = Math.ceil((z1 - ORIGIN) / cell);
    const nx = i1 - i0 + 1;
    const pos = [];
    const col = [];
    const c = new THREE.Color();
    const meadow = new THREE.Color(0x9b9a5c);
    const forest = new THREE.Color(0x3e5a34);
    const rock = new THREE.Color(0x9a8a74);
    for (let j = j0; j <= j1; j += 1) {
      for (let i = i0; i <= i1; i += 1) {
        const x = ORIGIN + i * cell;
        const z = ORIGIN + j * cell;
        const y = at(i, j);
        pos.push(x, y, z);
        const sx = (at(i + 1, j) - at(i - 1, j)) / (2 * cell);
        const sz = (at(i, j + 1) - at(i, j - 1)) / (2 * cell);
        const slope = Math.hypot(sx, sz);
        const f = smooth(0.45, 0.62, noise(x / 180, z / 180));
        c.copy(meadow).lerp(forest, f).lerp(rock, smooth(0.6, 1.0, slope));
        c.multiplyScalar(0.92 + 0.12 * noise(x / 23, z / 23));
        col.push(c.r, c.g, c.b);
      }
    }
    const idx = [];
    for (let j = 0; j < j1 - j0; j += 1) {
      for (let i = 0; i < i1 - i0; i += 1) {
        const cx = ORIGIN + (i0 + i + 0.5) * cell;
        const cz = ORIGIN + (j0 + j + 0.5) * cell;
        if (hole && Math.abs(cx - hole.x) < hole.half && Math.abs(cz - hole.z) < hole.half) {
          continue;
        }
        const a = j * nx + i;
        const b = a + 1;
        const cc = a + nx;
        const d = cc + 1;
        idx.push(a, cc, b, cc, d, b);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, groundMat);
    m.receiveShadow = true;
    m.name = 'standin-ground';
    return m;
  }

  /* Ground round (x, z): 10 m within `fineHalf`, 30 m out to `coarseHalf`.
   * Only one window is live at a time in the preview. */
  function groundAround(x, z, fineHalf, coarseHalf) {
    windows.length = 0;
    const cx = ORIGIN + Math.round((x - ORIGIN) / 30) * 30;
    const cz = ORIGIN + Math.round((z - ORIGIN) / 30) * 30;
    const w = { x: cx, z: cz, half: fineHalf };
    windows.push(w);
    const g = new THREE.Group();
    g.name = 'standin';
    g.add(gridMesh(10, cx - fineHalf, cz - fineHalf, cx + fineHalf, cz + fineHalf));
    g.add(gridMesh(30, cx - coarseHalf, cz - coarseHalf, cx + coarseHalf, cz + coarseHalf, w));
    return g;
  }

  return { heightAt, ground, groundAround, windows };
}
