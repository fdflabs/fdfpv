/*
 * springs.js: the inventory's ordinary features, built a region at a time.
 *
 * About ten thousand entries are not landmarks: hot springs from a hand's
 * width to forty metres across, fumaroles, mud pots, small geysers and
 * travertine. Each is a few rings of vertex coloured triangles laid on the
 * ground (a pool's deep centre, its paler edge, a sinter lip, the bacterial
 * mat round it), merged by 960 m chunk into one mesh per chunk with a far
 * version that keeps only the big ones. Per region, one draw each: a
 * sinter flat painted on the drape grid under the basin, the steam of
 * every feature (and of the landmarks' quiet vents), the small geysers'
 * columns and the mud pots' bubbles.
 *
 * Colour. A pool's colour follows its temperature: the hottest water is too
 * hot for anything to live in and is the deep blue of clear water, and the
 * cooler rings outward are coloured by the bacteria and archaea that live
 * at each temperature, green, yellow, orange and brown as it falls. The
 * inventory's colour class is used where it has one (acid springs get a
 * milky palette of their own), then its hottest recorded temperature, and
 * failing both a temperature dealt from the feature's id, so a pool is the
 * same colour on every load and the basin as a whole has the right mix.
 * Most of the inventory's kinds are inferred from names (reported: false);
 * such an entry is drawn as the modest hot spring it most likely is.
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
import { celMaterial } from '../../../render/celmat.js';
import { CellSet, buildCells } from './grid.js';
import { paintMaterial, LAYER } from './paint.js';
import { SteamBuilder } from './steam.js';
import { JetBuilder } from './jets.js';
import { hash01 } from './schedule.js';

export const CHUNK = 960;
/* Past this the chunk's small features are dropped and only pools of at
 * least BIG_R metres are drawn; past FAR_CUT nothing but the sinter flat
 * and the far plumes. The near steam fades out from NEAR_CUT. */
const NEAR_CUT = 900;
const FAR_CUT = 4200;
const BIG_R = 3;

/* Deep centre, middle, edge, then the mat just outside and the mat's outer
 * reach: one palette per colour class. */
export const PALETTES = {
  blue: [0x14609f, 0x2f93bf, 0x7fcfcb, 0xd8b54e, 0xc9772f],
  turquoise: [0x2a8eab, 0x55b9b8, 0xa3d8c0, 0xc9bb56, 0xbf7a34],
  green: [0x3f8a66, 0x78ad5c, 0xb7c86a, 0xcf9e3e, 0xa9602d],
  yellow: [0xb89f3c, 0xcdb756, 0xdccb7c, 0xc98a37, 0x9a5a2e],
  orange: [0xbf6a2a, 0xcf8a3a, 0xd9a758, 0xa5552b, 0x7e4a2e],
  brown: [0x6f5236, 0x8a6a43, 0xa48459, 0x7b5a3a, 0x6c5a45],
  grey: [0x8fa3a6, 0xaebbb8, 0xcbd0c8, 0xb9ae96, 0xa89f8c],
  milky: [0x7fb7c2, 0xa7cfd0, 0xcfe2dc, 0xc4b27a, 0xa9895a],
  /* Acid springs: milky, grey green, sulphur yellow at the edge, the
   * ground round them bleached and stained, as at Norris. */
  acid: [0x8fb3aa, 0xb7cabd, 0xd6d7b9, 0xd2c160, 0xb8a36a],
};
const SINTER = 0xe2ddcf;
const SINTER_DARK = 0xc9c2b1;

/* A temperature in Celsius for a pool with no colour class, from its id:
 * most small springs are warm rather than boiling, a third are near
 * boiling. */
export function dealTemperature(id) {
  let h = 0;
  for (let k = 0; k < id.length; k += 1) {
    h = Math.imul(h ^ id.charCodeAt(k), 16777619);
  }
  const u = hash01(h, 7);
  return 42 + 51 * Math.sqrt(u);
}

export function paletteOf(f) {
  if (f.colour && PALETTES[f.colour]) {
    return f.colour;
  }
  const t = f.temp ?? dealTemperature(f.id);
  if (t > 84) {
    return 'blue';
  }
  if (t > 76) {
    return 'turquoise';
  }
  if (t > 68) {
    return 'green';
  }
  if (t > 60) {
    return 'yellow';
  }
  if (t > 52) {
    return 'orange';
  }
  return 'brown';
}

/* Arrays that grow into one vertex coloured mesh. */
export class Batch {
  constructor() {
    this.pos = [];
    this.col = [];
    this.idx = [];
  }

  vert(x, y, z, hex) {
    const k = this.pos.length / 3;
    this.pos.push(x, y, z);
    const c = COLOURS.get(hex) ?? cacheColour(hex);
    this.col.push(c.r, c.g, c.b);
    return k;
  }

  get triangles() {
    return this.idx.length / 3;
  }

  mesh(material, name) {
    if (this.idx.length === 0) {
      return null;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.setIndex(this.idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, material);
    m.name = name;
    m.receiveShadow = true;
    return m;
  }
}
const COLOURS = new Map();
function cacheColour(hex) {
  const c = new THREE.Color(hex);
  COLOURS.set(hex, c);
  return c;
}

/*
 * A disc of rings round (x, z), each ring { r, lift, hex } with r in metres;
 * ring 0 is the centre point. The outline wanders by `wobble` of the radius
 * with a shape of its own from `seed`, more at the outer rings, so no two
 * pools are the same circle. Every vertex stands at the ground plus its
 * ring's lift.
 */
export function disc(batch, heightAt, x, z, rings, seed, wobble = 0.12, segs) {
  const r0 = rings[rings.length - 1].r;
  const seg = segs ?? Math.max(8, Math.min(32, Math.round(6 + r0 * 2.2)));
  const phase = [hash01(seed, 1) * 6.28, hash01(seed, 2) * 6.28, hash01(seed, 3) * 6.28];
  const shape = (a, reach) => 1 + wobble * reach * (0.55 * Math.sin(a * 2 + phase[0]) + 0.3 * Math.sin(a * 3 + phase[1]) + 0.15 * Math.sin(a * 5 + phase[2]));
  const centre = batch.vert(x, heightAt(x, z) + rings[0].lift, z, rings[0].hex);
  let prev = null;
  for (let q = 1; q < rings.length; q += 1) {
    const ring = [];
    const reach = q / (rings.length - 1);
    for (let s = 0; s < seg; s += 1) {
      const a = (s / seg) * Math.PI * 2;
      const rr = rings[q].r * shape(a, reach);
      const vx = x + Math.cos(a) * rr;
      const vz = z + Math.sin(a) * rr;
      ring.push(batch.vert(vx, heightAt(vx, vz) + rings[q].lift, vz, rings[q].hex));
    }
    for (let s = 0; s < seg; s += 1) {
      const n = (s + 1) % seg;
      if (!prev) {
        batch.idx.push(centre, ring[n], ring[s]);
      } else {
        batch.idx.push(prev[s], ring[n], ring[s], prev[s], prev[n], ring[n]);
      }
    }
    prev = ring;
  }
}

/* A small sinter cone: a lathe standing on the lowest ground under it so
 * no side of it floats, with a dark vent on top. */
function cone(batch, heightAt, x, z, base, height, seed) {
  const seg = 9;
  let foot = Infinity;
  for (let s = 0; s < seg; s += 1) {
    const a = (s / seg) * Math.PI * 2;
    foot = Math.min(foot, heightAt(x + Math.cos(a) * base, z + Math.sin(a) * base));
  }
  foot = Math.min(foot, heightAt(x, z)) - 0.15;
  const profile = [
    [base, 0, SINTER_DARK], [base * 0.78, height * 0.45, SINTER], [base * 0.5, height * 0.85, SINTER],
    [base * 0.36, height, 0xd6cdb8], [base * 0.2, height * 0.96, 0x57504a],
  ];
  const rings = profile.map(([r, h, hex], q) => {
    const ring = [];
    for (let s = 0; s < seg; s += 1) {
      const a = (s / seg) * Math.PI * 2 + hash01(seed, q) * 0.3;
      const wob = 1 + 0.12 * Math.sin(a * 3 + seed);
      ring.push(batch.vert(x + Math.cos(a) * r * wob, foot + 0.15 + h, z + Math.sin(a) * r * wob, hex));
    }
    return ring;
  });
  for (let q = 1; q < rings.length; q += 1) {
    for (let s = 0; s < seg; s += 1) {
      const n = (s + 1) % seg;
      batch.idx.push(rings[q - 1][s], rings[q][s], rings[q][n], rings[q - 1][s], rings[q][n], rings[q - 1][n]);
    }
  }
  const top = batch.vert(x, foot + 0.15 + height * 0.8, z, 0x3a3531);
  const last = rings[rings.length - 1];
  for (let s = 0; s < seg; s += 1) {
    batch.idx.push(last[s], top, last[(s + 1) % seg]);
  }
}

/* The rings of each kind. `f.r` is the feature's radius estimate. */
function springRings(f) {
  const p = PALETTES[paletteOf(f)];
  const r = f.r;
  const mat = r * (1.4 + 0.5 * hash01(f.seed, 9)) + 0.4;
  if (r < 1.2) {
    return [
      { r: 0, lift: 0.03, hex: p[0] },
      { r: r * 0.6, lift: 0.03, hex: p[1] },
      { r, lift: 0.06, hex: p[2] },
      { r: r * 1.12, lift: 0.07, hex: SINTER },
      { r: mat, lift: 0.03, hex: p[4] },
    ];
  }
  return [
    { r: 0, lift: 0.03, hex: p[0] },
    { r: r * 0.42, lift: 0.03, hex: p[0] },
    { r: r * 0.46, lift: 0.03, hex: p[1] },
    { r: r * 0.8, lift: 0.03, hex: p[2] },
    { r, lift: 0.05, hex: p[2] },
    { r: r * 1.06, lift: 0.1, hex: SINTER },
    { r: r * 1.16, lift: 0.05, hex: p[3] },
    { r: mat, lift: 0.03, hex: p[4] },
  ];
}

const MUDS = [0xb8a194, 0xcbbca6, 0x9d968c, 0xb99a86];

/*
 * One region's features. `feats` are catalog features; `env` carries
 * heightAt, the clock, the wind and the sun. Returns { group, stats,
 * dispose }.
 */
export function buildRegionFeatures(feats, env, region) {
  const { heightAt } = env;
  const group = new THREE.Group();
  group.name = `thermal-${region.key}`;
  const chunks = new Map();
  for (const f of feats) {
    const key = `${Math.floor(f.x / CHUNK)},${Math.floor(f.z / CHUNK)}`;
    if (!chunks.has(key)) {
      chunks.set(key, []);
    }
    chunks.get(key).push(f);
  }
  const rng = rngFrom(region.i * 131 + region.j * 7 + 1);
  const jets = new JetBuilder('water');
  const muds = new JetBuilder('mud');
  const stats = { features: feats.length, chunks: chunks.size, triangles: 0, particles: 0, apronCells: 0, draws: 0 };
  const poolMat = env.materials.pools;
  /* Steam and the sinter flat are one draw each for the whole region: a
   * draw per chunk bought culling of a few hundred small puffs and cost a
   * draw call a chunk, twice over for the flat, which the ink prepass
   * draws again. The near steam fades out past NEAR_CUT instead. */
  const steam = env.ambient ?? new SteamBuilder();
  for (const [key, list] of chunks) {
    const near = new Batch();
    const big = new Batch();
    for (const f of list) {
      f.seed = f.seed ?? idSeed(f.id);
      const target = f.r >= BIG_R ? [near, big] : [near];
      addFeature(f, target, heightAt, steam, jets, muds, rng);
    }
    const lod = new THREE.LOD();
    lod.name = `chunk-${key}`;
    const nearMesh = near.mesh(poolMat, 'springs-near');
    const bigMesh = big.mesh(poolMat, 'springs-far');
    lod.addLevel(nearMesh ?? new THREE.Group(), 0);
    lod.addLevel(bigMesh ?? new THREE.Group(), NEAR_CUT);
    lod.addLevel(new THREE.Group(), FAR_CUT);
    /* LOD measures from its own position, so it stands at the chunk's
     * middle rather than the world origin. */
    const [ci, cj] = key.split(',').map(Number);
    const cx = (ci + 0.5) * CHUNK;
    const cz = (cj + 0.5) * CHUNK;
    lod.position.set(cx, 0, cz);
    for (const m of [nearMesh, bigMesh]) {
      if (m) {
        m.geometry.translate(-cx, 0, -cz);
        m.geometry.computeBoundingSphere();
      }
    }
    group.add(lod);
    stats.triangles += near.triangles;
  }
  for (const m of steam.buildSplit(env, { name: 'steam-near', fade: [NEAR_CUT * 1.6, NEAR_CUT] })) {
    group.add(m);
  }
  stats.particles += steam.count;
  const apron = sinterFlat(feats, heightAt, env);
  if (apron) {
    group.add(apron.mesh);
    stats.apronCells += apron.cells;
    stats.triangles += apron.cells * 2;
  }
  const jetMesh = jets.build(env, 'minor-geysers');
  if (jetMesh) {
    group.add(jetMesh);
    stats.particles += jets.count;
  }
  const mudMesh = muds.build(env, 'mud-bubbles');
  if (mudMesh) {
    group.add(mudMesh);
    stats.particles += muds.count;
  }
  return { group, stats };
}

export function idSeed(id) {
  let h = 2166136261;
  for (let k = 0; k < id.length; k += 1) {
    h = Math.imul(h ^ id.charCodeAt(k), 16777619);
  }
  return h >>> 0;
}

export function rngFrom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function addFeature(f, batches, heightAt, steam, jets, muds, rng) {
  const y = heightAt(f.x, f.z);
  if (f.kind === 'spring') {
    const rings = springRings(f);
    for (const b of batches) {
      disc(b, heightAt, f.x, f.z, rings, f.seed, 0.14);
    }
    const t = f.temp ?? (f.colour ? { blue: 88, turquoise: 80, milky: 85, green: 72, yellow: 64, orange: 56, brown: 48, grey: 70, acid: 80 }[f.colour] ?? 70 : dealTemperature(f.id));
    /* Only the hot ones steam where it can be seen; a warm spring's
     * vapour does not show on a summer day. */
    if (t > 70) {
      const hot = Math.min(1, (t - 70) / 23);
      steam.vent({
        x: f.x, y: y + 0.2, z: f.z, spread: f.r * 0.6, count: 1 + Math.round(hot * 2 + Math.min(4, f.r / 3)),
        size: 0.5 + Math.min(4, f.r * 0.35), rise: 2 + Math.min(10, f.r * 0.8) + hot * 3, life: 6 + Math.min(6, f.r * 0.3), alpha: 0.3 + 0.35 * hot, rng,
      });
    }
    return;
  }
  if (f.kind === 'fumarole') {
    const r = Math.max(0.5, f.r);
    const rings = [
      { r: 0, lift: 0.02, hex: 0x3b3632 },
      { r: r * 0.25, lift: 0.04, hex: 0x5d544a },
      { r: r * 0.6, lift: 0.04, hex: 0xd4bf4f },
      { r: r * 1.5, lift: 0.03, hex: 0xb9b2a2 },
    ];
    for (const b of batches) {
      disc(b, heightAt, f.x, f.z, rings, f.seed, 0.25, 8);
    }
    steam.vent({ x: f.x, y: y + 0.2, z: f.z, spread: r * 0.3, count: 6, size: 0.8 + r * 0.5, rise: 8 + r * 3, life: 6, alpha: 0.6, rng });
    return;
  }
  if (f.kind === 'mudpot') {
    const r = f.r;
    const mud = MUDS[f.seed % MUDS.length];
    const rings = [
      { r: 0, lift: 0.02, hex: mud },
      { r: r * 0.95, lift: 0.04, hex: mud },
      { r: r * 1.1, lift: 0.18, hex: 0xa99d8e },
      { r: r * 1.6, lift: 0.03, hex: 0xbdb5a6 },
    ];
    for (const b of batches) {
      disc(b, heightAt, f.x, f.z, rings, f.seed, 0.18);
    }
    muds.mud({ x: f.x, y: y + 0.05, z: f.z, r, blobs: Math.min(10, 2 + Math.round(r * 2)), size: Math.min(0.5, 0.12 + r * 0.08), life: 2.2, tint: mud, rng });
    steam.vent({ x: f.x, y: y + 0.2, z: f.z, spread: r * 0.5, count: 1, size: 0.8 + r * 0.3, rise: 5, life: 8, alpha: 0.3, rng });
    return;
  }
  if (f.kind === 'geyser') {
    const r = Math.max(0.6, Math.min(f.r, 6));
    const apron = [
      { r: 0, lift: 0.04, hex: SINTER_DARK },
      { r: r * 1.8, lift: 0.04, hex: SINTER },
      { r: r * 2.6, lift: 0.03, hex: 0xc98a45 },
      { r: r * 3.2, lift: 0.03, hex: 0xb09a7c },
    ];
    for (const b of batches) {
      disc(b, heightAt, f.x, f.z, apron, f.seed, 0.2);
      cone(b, heightAt, f.x, f.z, r, 0.3 + 1.2 * hash01(f.seed, 4), f.seed);
    }
    steam.vent({ x: f.x, y: y + 0.8, z: f.z, spread: 0.4, count: 4, size: 1.0, rise: 7, life: 6, alpha: 0.5, rng });
    if (f.interval) {
      const peak = Math.min(40, f.height ? f.height.mean : 3 + r * 3 + 8 * hash01(f.seed, 5));
      const every = f.interval.mean;
      jets.geyser({
        x: f.x, y: y + 0.8, z: f.z, width: 0.3, peak, interval: every,
        duration: f.duration ? f.duration.mean : Math.min(every * 0.2, 180), offset: hash01(f.seed, 6) * every,
        drops: Math.round(14 + peak * 1.5), size: 0.35 + peak * 0.015, rng,
      });
    }
    return;
  }
  if (f.kind === 'terrace') {
    const r = f.r;
    const rings = [
      { r: 0, lift: 0.9, hex: 0x9fd0d2 },
      { r: r * 0.3, lift: 0.9, hex: 0xe8e2d2 },
      { r: r * 0.36, lift: 0.6, hex: 0xd9a65a },
      { r: r * 0.6, lift: 0.6, hex: 0xefe9dc },
      { r: r * 0.66, lift: 0.3, hex: 0xc98b4b },
      { r: r * 0.9, lift: 0.3, hex: 0xe9e3d4 },
      { r, lift: 0.04, hex: 0xb9a78a },
    ];
    for (const b of batches) {
      disc(b, heightAt, f.x, f.z, rings, f.seed, 0.22);
    }
    steam.vent({ x: f.x, y: y + 1, z: f.z, spread: r * 0.4, count: 2, size: 1.5, rise: 6, life: 8, alpha: 0.3, rng });
  }
}

/*
 * THE SINTER FLAT: the grey white ground of a geyser basin, on the drape
 * grid so it lies exactly on the terrain. Every feature spreads a kernel
 * round itself; the flat is where their sum passes a threshold, cut ragged
 * per pixel by noise, so a basin reads as one bleached plain with the pools
 * set in it, which is what it is from the air, and a lone spring in the
 * forest gets a small pale collar.
 */
function sinterFlat(list, heightAt, env) {
  const set = new CellSet(10);
  /* Reach: far enough that the inventory's springs, twenty to fifty
   * metres apart across a basin, run together into one plain. */
  const reachOf = (f) => Math.min(80, f.r * 2 + (f.kind === 'geyser' ? 26 : f.kind === 'terrace' ? 14 : 18));
  const BIN = 50;
  const bins = new Map();
  for (const f of list) {
    const R = reachOf(f);
    set.addDisc(f.x, f.z, R);
    for (let i = Math.floor((f.x - R) / BIN); i <= Math.floor((f.x + R) / BIN); i += 1) {
      for (let j = Math.floor((f.z - R) / BIN); j <= Math.floor((f.z + R) / BIN); j += 1) {
        const k = `${i},${j}`;
        if (!bins.has(k)) {
          bins.set(k, []);
        }
        bins.get(k).push(f);
      }
    }
  }
  if (set.size === 0) {
    return null;
  }
  const built = buildCells(set, (x, z, out) => {
    let field = 0;
    for (const f of bins.get(`${Math.floor(x / BIN)},${Math.floor(z / BIN)}`) ?? []) {
      const R = reachOf(f);
      const d = Math.hypot(x - f.x, z - f.z);
      if (d < R) {
        const u = 1 - d / R;
        field += u * u * (f.kind === 'fumarole' ? 0.7 : 1.2);
      }
    }
    out.aApron = [field];
    return heightAt(x, z);
  }, { aApron: 1 });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(built.position, 3));
  geo.setAttribute('aApron', new THREE.BufferAttribute(built.attrs.aApron, 1));
  geo.setIndex(new THREE.BufferAttribute(built.index, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, env.materials.sinter);
  mesh.name = 'sinter-flat';
  mesh.receiveShadow = true;
  return { mesh, cells: set.size };
}

/* The shared materials of every region: made once per map. */
export function regionMaterials() {
  const pools = celMaterial({ color: 0xffffff, rim: 0.12, rimColor: 0xdfeeff });
  pools.vertexColors = true;
  pools.polygonOffset = true;
  pools.polygonOffsetFactor = -1;
  pools.polygonOffsetUnits = -LAYER.pools;
  const sinter = paintMaterial({
    key: 'sinter-flat',
    attrs: ['float aApron'],
    bias: LAYER.sinter,
    cel: { rim: 0.05 },
    body: /* glsl */ `
      vec2 w = vCelWorld.xz;
      float ragged = ysFbm(w * 0.09) * 0.55 + ysNoise(w * 0.7) * 0.2;
      float edge = vApron - (0.18 + ragged * 0.5);
      if (edge < 0.0) {
        discard;
      }
      vec3 bleached = ysRgb(0.87, 0.85, 0.80);
      vec3 grey = ysRgb(0.74, 0.72, 0.67);
      vec3 buff = ysRgb(0.82, 0.73, 0.58);
      float patchy = ysFbm(w * 0.035 + 3.1);
      paint = mix(bleached, grey, smoothstep(0.45, 0.75, patchy));
      paint = mix(paint, buff, smoothstep(0.55, 0.8, ysFbm(w * 0.06 + 9.7)) * 0.6);
      /* The outer fringe is thin crust over soil, a shade darker. */
      paint *= mix(0.9, 1.0, smoothstep(0.0, 0.25, edge));
    `,
  });
  return { pools, sinter };
}
