/*
 * nearfield.js: what the Interior's ground grows round a camera close to
 * it, which the ground's paint cannot carry once a pixel is a centimetre:
 * grass and weeds in clumps, the verge's tall weeds, reeds along a
 * creek's banks, and the shrubs and saplings under a forest's edge.
 *
 * Four layers of crossed cards, each scattered on square tiles round the
 * camera and drawn as one instanced mesh (reaches at High, Q below):
 *
 *   grass   clumps, verge weeds and creek reeds from swiss2's grass atlas,
 *           on tiles TILE metres square, to 44 m;
 *   meadow  the same clumps twice as wide on a grid three times as coarse,
 *           from where the grass thins out to 170 m;
 *   banks   reeds along the creeks and the river, to 320 m;
 *   shrubs  bushes from swiss2's foliage atlas (its broadleaf sprays)
 *           where a forest meets open ground and thinly under its roof,
 *           to 420 m.
 *
 * A tile is worked out once, when it first comes into range, from the
 * same data the room reads (world.js's land cover and ground, places.js's
 * roads and openings, hydro.js's water, canopy.js's crowns), its clumps'
 * places by hash, so every run and every screen grows the same clump in
 * the same place. A layer is refilled whenever the camera crosses into
 * another of its tiles. A clump shrinks into the ground over the outer
 * part of its layer's reach, each at its own distance, so the edge is no
 * line.
 *
 * ONLY WHEN THE CAMERA IS LOW. The layers are drawn while the camera is
 * under HIGH_M over the ground, the grass and the meadow reaching their
 * whole way below LOW_M and shrinking as it climbs, where a clump falls
 * under a pixel and the ground's paint carries it; the banks and the
 * shrubs reach as far whatever the height, since from higher up the
 * ground in view is further out. A survey, an orbit, low-camp or the
 * camera ball's standoff draws none of it.
 *
 * WHAT THE ROOM SEES IS NOT CHANGED. The room's line of sight tests the
 * crowns only (canopy.js canopyBlocks), so anything here that could stand
 * between a camera and a person would hide someone the room calls
 * visible. The invariant: no shrub within ROUTE_CLEAR metres of any
 * authored route (routes.js) or in a forest opening (places.js opened);
 * nothing in the kept open strips (canopy.js KEEP_OPEN, mirrored here as
 * OPEN_KEEP) and nothing in the grass layers stands higher than a
 * person's chest (CHEST, the height canopy-los.js looks at).
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { ALPHA_CUT, GRASS_REGIONS, REGIONS } from '../swiss2/vegetation/atlas.js';
import { gridToWorld } from '../../share/interior/frame.js';
import { LAND } from '../../share/interior/world.js';
import { hash01, noise } from '../../share/interior/canopy.js';
import { ROADS, PLACES, opened } from '../../share/interior/places.js';
import { RIVER, STREAMS } from '../../share/interior/hydro.js';
import { ROUTES } from '../../share/interior/routes.js';
import { thermalKind } from '../../render/thermal.js';

const TILE = 8;
/* The camera's height over the ground at which the near field is whole,
 * and at which it is gone, metres. */
const LOW_M = 16;
const HIGH_M = 50;
/* The grass layer's reach and spacing by quality, and the shrubs'. */
const Q = {
  high: {
    grassR: 44, grassStep: 0.42, grassCap: 60000, meadowR: 170, meadowCap: 50000, bankR: 320, bankCap: 20000, shrubR: 420, shrubCap: 16000,
  },
  medium: {
    grassR: 30, grassStep: 0.5, grassCap: 30000, meadowR: 90, meadowCap: 20000, bankR: 200, bankCap: 10000, shrubR: 260, shrubCap: 8000,
  },
  low: {
    grassR: 0, grassStep: 1, grassCap: 0, meadowR: 0, meadowCap: 0, bankR: 0, bankCap: 0, shrubR: 0, shrubCap: 0,
  },
};
const SHRUB_TILE = 16;
/* Main thread time a frame may spend making tiles while flying, and
 * how far the camera must move between two frames to count as a jump,
 * metres. */
const BUILD_MS = 2;
const JUMP_M = 60;
/* The widest crown canopy.js grows, metres. */
const CROWN_R = 8;
/* Metres from any authored route inside which no shrub grows. */
const ROUTE_CLEAR = 20;
/* The person's chest, which no grass clump overtops where a route runs. */
const CHEST = 1.2;
/* What canopy.js keeps open for Mission 1's stage 3 (its KEEP_OPEN,
 * mirrored): the canada's strip and the anomaly corridor. Grass only,
 * under CHEST. */
const boxOf = ([ax, az], [bx, bz]) => [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)];
const OPEN_KEEP = [
  boxOf(gridToWorld(8.95, 10.65), gridToWorld(9.45, 7.95)),
  boxOf(...PLACES.anomalyCorridor.box),
];
const inKeep = (x, z) => OPEN_KEEP.some(([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1);
/* ribbons.js draws the river's water (width + LAP) wide with BANK metres
 * of sand either side, and a stream's water this wide. */
const RIVER_LAP = 8;
const RIVER_BANK = 9;
const streamHalf = (km2) => Math.min(7, 2.5 + km2 * 0.35) / 2;

/* The atlas's clumps and weeds, less the meadow flowers and the white
 * umbels an Alpine verge has and this one does not. */
const GRASS_KEYS = ['clump0', 'clump1', 'clump2', 'clump3', 'clump4', 'clump5', 'weed1', 'weed2', 'weed3'];
const G_SHORT = [0, 1, 2, 3];
const G_SEED = [4, 5];
const G_WEED = [6, 7, 8];
/* Reeds and sedge along water: the tall green clumps and the dock. */
const G_REED = [2, 3, 6];
const SHRUB_KEYS = ['beech', 'maple'];

/* Floats per clump: x, y, z, yaw, height, width, region, tint. */
const STRIDE = 8;

/*
 * The lines along which the ground is something else: the roads, the
 * river and the streams, bucketed by CELL so a point asks only the
 * segments near it. near(x, z, out) fills out with each kind's distance
 * from its edge (negative inside), metres, or Infinity past REACH.
 */
const CELL = 64;
const REACH = 24;
function lineIndex() {
  const map = new Map();
  const key = (i, j) => (i + 2048) * 4096 + (j + 2048);
  const add = (pts, halfOf, kind) => {
    for (let k = 0; k + 1 < pts.length; k += 1) {
      const [ax, az] = pts[k];
      const [bx, bz] = pts[k + 1];
      const half = halfOf(k);
      const pad = half + REACH;
      const seg = {
        ax, az, bx, bz, half, kind,
      };
      for (let i = Math.floor((Math.min(ax, bx) - pad) / CELL); i <= Math.floor((Math.max(ax, bx) + pad) / CELL); i += 1) {
        for (let j = Math.floor((Math.min(az, bz) - pad) / CELL); j <= Math.floor((Math.max(az, bz) + pad) / CELL); j += 1) {
          const kk = key(i, j);
          if (!map.has(kk)) {
            map.set(kk, []);
          }
          map.get(kk).push(seg);
        }
      }
    }
  };
  for (const r of ROADS) {
    add(r.points, () => r.width / 2, 'road');
  }
  add(RIVER.points, (k) => (RIVER.width[k] + RIVER_LAP) / 2, 'river');
  for (const s of STREAMS) {
    add(s.points, () => streamHalf(s.km2), 'stream');
  }
  return function near(x, z, out) {
    out.road = Infinity;
    out.river = Infinity;
    out.stream = Infinity;
    const list = map.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!list) {
      return out;
    }
    for (const s of list) {
      const dx = s.bx - s.ax;
      const dz = s.bz - s.az;
      const l2 = dx * dx + dz * dz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / l2)) : 0;
      const d = Math.hypot(x - s.ax - dx * t, z - s.az - dz * t) - s.half;
      if (d < out[s.kind]) {
        out[s.kind] = d;
      }
    }
    return out;
  };
}

/* The authored routes' segments, bucketed the same way: whether (x, z)
 * is within ROUTE_CLEAR of any of them. */
function routeIndex() {
  const map = new Map();
  const key = (i, j) => (i + 2048) * 4096 + (j + 2048);
  for (const r of Object.values(ROUTES)) {
    const pts = r.pts;
    for (let k = 0; k < pts.length; k += 1) {
      const [ax, az] = pts[k];
      const [bx, bz] = pts[Math.min(k + 1, pts.length - 1)];
      const seg = {
        ax, az, bx, bz,
      };
      for (let i = Math.floor((Math.min(ax, bx) - ROUTE_CLEAR) / CELL); i <= Math.floor((Math.max(ax, bx) + ROUTE_CLEAR) / CELL); i += 1) {
        for (let j = Math.floor((Math.min(az, bz) - ROUTE_CLEAR) / CELL); j <= Math.floor((Math.max(az, bz) + ROUTE_CLEAR) / CELL); j += 1) {
          const kk = key(i, j);
          if (!map.has(kk)) {
            map.set(kk, []);
          }
          map.get(kk).push(seg);
        }
      }
    }
  }
  return function nearRoute(x, z) {
    const list = map.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!list) {
      return false;
    }
    for (const s of list) {
      const dx = s.bx - s.ax;
      const dz = s.bz - s.az;
      const l2 = dx * dx + dz * dz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / l2)) : 0;
      if (Math.hypot(x - s.ax - dx * t, z - s.az - dz * t) < ROUTE_CLEAR) {
        return true;
      }
    }
    return false;
  };
}

/* Three cards crossed at sixty degrees, a metre wide and a metre high,
 * standing on the origin; the instance scales them. A card's normal is
 * tipped toward the sky, so a clump is lit like the turf or the bush it
 * is and not like a sheet of paper. */
function clumpGeometry(THREE, tip) {
  const pos = [];
  const uv = [];
  const nrm = [];
  const idx = [];
  for (let k = 0; k < 3; k += 1) {
    const a = (k / 3) * Math.PI + 0.3;
    const cx = Math.cos(a) * 0.5;
    const cz = Math.sin(a) * 0.5;
    const base = pos.length / 3;
    pos.push(-cx, 0, -cz, cx, 0, cz, -cx, 1, -cz, cx, 1, cz);
    uv.push(0, 0, 1, 0, 0, 1, 1, 1);
    for (let q = 0; q < 4; q += 1) {
      nrm.push(-Math.sin(a) * tip, 1, Math.cos(a) * tip);
    }
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

/*
 * One layer of cards: { mesh, fill(list of tile arrays), dispose }.
 * `regions` the atlas's uv rectangles in the order a clump's region
 * index names them; `radius` the reach its clumps shrink out to;
 * `tints` vec3 per tint index, linear multipliers on the atlas.
 */
function cardLayer(THREE, {
  atlas, regions, cap, radius, tip, tints, name, rough,
}) {
  const geo = clumpGeometry(THREE, tip);
  const buf = new THREE.InstancedInterleavedBuffer(new Float32Array(Math.max(1, cap) * STRIDE), STRIDE, 1);
  buf.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aCard', new THREE.InterleavedBufferAttribute(buf, 4, 0));
  geo.setAttribute('aCard2', new THREE.InterleavedBufferAttribute(buf, 4, 4));
  geo.instanceCount = 0;
  const mat = new THREE.MeshStandardMaterial({
    map: atlas, alphaTest: ALPHA_CUT, side: THREE.DoubleSide, roughness: rough, metalness: 0,
  });
  const uniforms = {
    uNfRegions: { value: regions.map((r) => new THREE.Vector4(r.u0, r.v0, r.du, r.dv)) },
    uNfTints: { value: tints.map((t) => new THREE.Vector3(...t)) },
    uNfReach: { value: new THREE.Vector2(0, radius) },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aCard;
        attribute vec4 aCard2;
        uniform vec4 uNfRegions[${regions.length}];
        uniform vec3 uNfTints[${tints.length}];
        uniform vec2 uNfReach;
        varying vec3 vNfTint;
        varying float vNfUp;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vec4 nfReg = uNfRegions[int(aCard2.z + 0.5)];
        vMapUv = nfReg.xy + uv * nfReg.zw;
        vNfUp = uv.y;
        vNfTint = uNfTints[int(floor(aCard2.w))] * (0.82 + 0.36 * fract(aCard2.w));`)
      .replace('#include <beginnormal_vertex>', `
        float nfC = cos(aCard.w);
        float nfS = sin(aCard.w);
        vec3 objectNormal = vec3(nfC * normal.x + nfS * normal.z, normal.y, -nfS * normal.x + nfC * normal.z);`)
      .replace('#include <begin_vertex>', `
        float nfD = distance(cameraPosition.xz, aCard.xz);
        /* Each clump its own edge, between seven tenths of the reach and
         * all of it, so the layer thins out instead of stopping; and a
         * layer that takes over from a nearer one grows in where that one
         * thins out (uNfReach.x, its inner edge). */
        float nfJit = fract(aCard.x * 12.9898 + aCard.z * 78.233);
        float nfEdge = uNfReach.y * (0.7 + 0.3 * nfJit);
        float nfGrow = (1.0 - smoothstep(nfEdge * 0.7, nfEdge, nfD)) * smoothstep(uNfReach.x * (0.6 + 0.3 * nfJit), uNfReach.x * (0.9 + 0.3 * nfJit), nfD);
        vec3 transformed = vec3(
          (nfC * position.x + nfS * position.z) * aCard2.y,
          position.y * aCard2.x * nfGrow,
          (-nfS * position.x + nfC * position.z) * aCard2.y) * step(0.001, nfGrow) + aCard.xyz;`)
      .replace('#include <project_vertex>', `
        vec4 mvPosition = viewMatrix * vec4(transformed, 1.0);
        gl_Position = projectionMatrix * mvPosition;`)
      .replace('#include <worldpos_vertex>', `
        vec4 worldPosition = vec4(transformed, 1.0);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vNfTint;
        varying float vNfUp;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        /* Darker at the root, where the clump shades itself. */
        diffuseColor.rgb *= vNfTint * mix(0.45, 1.0, smoothstep(0.0, 0.7, vNfUp));`);
  };
  mat.customProgramCacheKey = () => `interior-near-${name}`;
  const mesh = new THREE.Mesh(geo, thermalKind(mat, 'vegetation'));
  mesh.name = `interior-near-${name}`;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  function fill(tiles) {
    const arr = buf.array;
    let n = 0;
    for (const t of tiles) {
      const k = Math.min(t.length / STRIDE, cap - n);
      arr.set(k * STRIDE === t.length ? t : t.subarray(0, k * STRIDE), n * STRIDE);
      n += k;
    }
    buf.clearUpdateRanges();
    buf.addUpdateRange(0, n * STRIDE);
    buf.needsUpdate = true;
    geo.instanceCount = n;
    return n;
  }
  return {
    mesh,
    fill,
    uniforms,
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

/* Grass tints, linear multipliers on the atlas's greens: the dry
 * season's end, a pasture green going olive and straw, the verge's weeds
 * dustier, the creek's reeds lusher. */
const GRASS_TINTS = [
  [1.0, 1.15, 0.66], [1.2, 1.15, 0.62], [1.45, 1.25, 0.68], [0.62, 0.74, 0.44], [1.3, 1.15, 0.8],
];
const T_PASTURE = 0;
const T_DRY = 1;
const T_STRAW = 2;
const T_LUSH = 3;
const T_DUSTY = 4;
const SHRUB_TINTS = [[0.46, 0.52, 0.32], [0.56, 0.54, 0.32], [0.4, 0.48, 0.32]];

/*
 * The near field: { group, view(camera), stats(), dispose() }. `atlases`
 * swiss2 loadAtlases's, owned by the caller; `world` world.js's
 * makeWorld; `canopy` canopy.js's makeCanopy.
 */
export function buildNearField({
  THREE, scene, world, canopy, quality, atlases,
}) {
  const q = Q[quality] || Q.high;
  const group = new THREE.Group();
  group.name = 'interior-near';
  scene.add(group);
  const lines = lineIndex();
  const nearRoute = routeIndex();
  const grass = cardLayer(THREE, {
    atlas: atlases.grass,
    regions: GRASS_KEYS.map((k) => GRASS_REGIONS[k]),
    cap: q.grassCap,
    radius: q.grassR,
    tip: 0.35,
    tints: GRASS_TINTS,
    name: 'grass',
    rough: 0.85,
  });
  const meadow = cardLayer(THREE, {
    atlas: atlases.grass,
    regions: GRASS_KEYS.map((k) => GRASS_REGIONS[k]),
    cap: q.meadowCap,
    radius: q.meadowR,
    tip: 0.35,
    tints: GRASS_TINTS,
    name: 'meadow',
    rough: 0.85,
  });
  const banks = cardLayer(THREE, {
    atlas: atlases.grass,
    regions: GRASS_KEYS.map((k) => GRASS_REGIONS[k]),
    cap: q.bankCap,
    radius: q.bankR,
    tip: 0.35,
    tints: GRASS_TINTS,
    name: 'banks',
    rough: 0.85,
  });
  const shrubs = cardLayer(THREE, {
    atlas: atlases.foliage,
    regions: SHRUB_KEYS.map((k) => REGIONS[k]),
    cap: q.shrubCap,
    radius: q.shrubR,
    tip: 0.6,
    tints: SHRUB_TINTS,
    name: 'shrubs',
    rough: 0.9,
  });
  group.add(grass.mesh, meadow.mesh, banks.mesh, shrubs.mesh);
  const at = { road: 0, river: 0, stream: 0 };
  const camp = PLACES.claroViejo.at;

  /* What the ground grows at (x, z): { p, h, kind, tint } or null, p the
   * chance a clump stands on a candidate, h its height in metres, kind 0
   * short grass, 1 seeding tussock, 2 weed, 3 reed. */
  const pick = { p: 0, h: 0, kind: 0, tint: 0 };
  /* The crowns near the tile being worked out, so asking whether a
   * point is under one is a short list and not canopy.js's search. */
  let crowns = [];
  function underCrown(x, z) {
    for (const t of crowns) {
      if ((x - t.x) ** 2 + (z - t.z) ** 2 < t.r * t.r) {
        return true;
      }
    }
    return false;
  }
  function coverAt(x, z) {
    lines(x, z, at);
    if (at.road < 0 || at.river < RIVER_BANK || at.stream < 0) {
      return null;
    }
    const cls = world.landAt(x, z);
    const patch = noise(x, z, 9, 61);
    const lush = noise(x, z, 37, 63);
    pick.kind = 0;
    pick.tint = lush > 0.6 ? T_PASTURE : lush > 0.35 ? T_DRY : T_STRAW;
    if (at.stream < 2.6) {
      /* The creek's banks: reeds and long grass, lush, under a chest. */
      pick.p = 0.95;
      pick.h = 0.75 + 0.3 * patch;
      pick.kind = 3;
      pick.tint = T_LUSH;
      return pick;
    }
    if (at.road < 3) {
      /* The road's cleared verge, trodden dust with the odd tuft. */
      pick.p = 0.14 + 0.5 * (at.road / 3) ** 2;
      pick.h = 0.18 + 0.12 * patch;
      pick.tint = T_DUSTY;
      return pick;
    }
    if (at.road < 7) {
      /* Past the verge, the weeds no mower reaches, knee to waist high. */
      pick.p = 0.95;
      pick.h = 0.55 + 0.45 * patch;
      pick.kind = patch > 0.45 ? 2 : 1;
      pick.tint = T_DRY;
      return pick;
    }
    /* Forest land with no roof over it (an opening, Pista Cero's field,
     * or a gap in the roof) grows what a pasture does. */
    const roofed = (cls === LAND.forest || cls === LAND.shrub) && underCrown(x, z);
    switch (roofed || (cls !== LAND.forest && cls !== LAND.shrub) ? cls : LAND.pasture) {
      case LAND.pasture:
      case LAND.wetland:
        pick.p = 0.7 + 0.3 * patch;
        pick.h = 0.2 + 0.2 * patch * patch;
        if (patch > 0.8) {
          pick.kind = 1;
          pick.h = 0.45 + 0.3 * (patch - 0.8) * 5;
        }
        if (cls === LAND.wetland) {
          pick.h *= 1.6;
          pick.tint = T_LUSH;
        }
        return pick;
      case LAND.forest:
      case LAND.shrub:
        /* Under the roof, a few shade plants. */
        pick.p = 0.12 * patch;
        pick.h = 0.25;
        pick.tint = T_LUSH;
        return pick;
      case LAND.crop:
        pick.p = 0.08;
        pick.h = 0.2;
        pick.tint = T_STRAW;
        return pick;
      case LAND.bare:
        /* A cleared strip: tufts only, more toward its sides, where the
         * wheels do not run. */
        pick.p = 0.05 + 0.25 * patch * patch;
        pick.h = 0.14 + 0.1 * patch;
        pick.tint = T_STRAW;
        return pick;
      case LAND.built:
        pick.p = 0.3;
        pick.h = 0.15;
        pick.tint = T_DRY;
        return pick;
      default:
        return null;
    }
  }

  /* A grass layer's tile maker: candidates every `step` metres on tiles
   * `size` square, each clump `wide` times as wide and `tall` times as
   * high as the ground's cover says. */
  const grassTiles = (size, step, wide, tall) => (ti, tj) => {
    const out = [];
    const n = Math.round(size / step);
    crowns = canopy.treesIn(ti * size - CROWN_R, tj * size - CROWN_R, (ti + 1) * size + CROWN_R, (tj + 1) * size + CROWN_R, []);
    for (let b = 0; b < n; b += 1) {
      for (let a = 0; a < n; a += 1) {
        const gi = ti * n + a;
        const gj = tj * n + b;
        const x = (gi + 0.1 + 0.8 * hash01(gi, gj, 71)) * step;
        const z = (gj + 0.1 + 0.8 * hash01(gi, gj, 72)) * step;
        const c = coverAt(x, z);
        if (!c || !(hash01(gi, gj, 73) < c.p)) {
          continue;
        }
        if (Math.hypot(x - camp[0], z - camp[1]) < 26) {
          continue;
        }
        const r = hash01(gi, gj, 74);
        /* A tussock is a tall clump of the short grass, now and then gone
         * to seed. */
        const set = [G_SHORT, r > 0.7 ? G_SEED : G_SHORT, G_WEED, G_REED][c.kind];
        const h = Math.min((CHEST - 0.1) / tall, c.h * (0.75 + 0.5 * r));
        out.push(
          x, world.groundAt(x, z) - 0.04, z, hash01(gi, gj, 75) * 6.283,
          h * tall, Math.max(0.6, h * (c.kind >= 2 ? 0.6 : 2.6)) * wide * (0.8 + 0.4 * hash01(gi, gj, 76)),
          set[Math.floor(hash01(gi, gj, 77) * set.length)], c.tint + Math.min(0.999, hash01(gi, gj, 78)),
        );
      }
    }
    return new Float32Array(out);
  };

  /* What stands under a forest's edge, where the trunks would show: a
   * bush or a sapling a square in the forest's last few metres, fewer
   * further in; never by a route, in an opening or on the canada. */
  function shrubTile(ti, tj) {
    const out = [];
    const step = 2.4;
    const n = Math.round(SHRUB_TILE / step);
    for (let b = 0; b < n; b += 1) {
      for (let a = 0; a < n; a += 1) {
        const gi = ti * n + a;
        const gj = tj * n + b;
        const x = (gi + 0.1 + 0.8 * hash01(gi, gj, 81)) * step;
        const z = (gj + 0.1 + 0.8 * hash01(gi, gj, 82)) * step;
        const cls = world.landAt(x, z);
        if (cls !== LAND.forest && cls !== LAND.shrub) {
          continue;
        }
        if (opened(x, z, 2)) {
          continue;
        }
        /* In the kept open strip, only what a person stands over. */
        const low = inKeep(x, z);
        lines(x, z, at);
        if (at.road < 4 || at.river < RIVER_BANK + 2 || at.stream < 2) {
          continue;
        }
        /* The edge: open ground within 12 m. */
        const edge = world.landAt(x + 12, z) !== cls || world.landAt(x - 12, z) !== cls
          || world.landAt(x, z + 12) !== cls || world.landAt(x, z - 12) !== cls;
        const p = edge ? 0.85 : 0.18;
        if (!(hash01(gi, gj, 83) < p) || nearRoute(x, z)) {
          continue;
        }
        const r = hash01(gi, gj, 84);
        const h = Math.min(low ? CHEST - 0.1 : Infinity, (edge ? 1.6 : 1.0) + (edge ? 2.2 : 1.4) * r);
        out.push(
          x, world.groundAt(x, z) - 0.1, z, hash01(gi, gj, 85) * 6.283,
          h, h * (1.0 + 0.5 * hash01(gi, gj, 86)),
          Math.floor(hash01(gi, gj, 87) * SHRUB_KEYS.length), Math.floor(hash01(gi, gj, 88) * SHRUB_TINTS.length) + hash01(gi, gj, 89) * 0.999,
        );
      }
    }
    return new Float32Array(out);
  }

  /* The reeds and long grass along a creek's banks and the river's,
   * past the grass's reach: what tells a creek in the grass from a
   * kilometre of pasture, seen from forty metres up. */
  function bankTile(ti, tj) {
    const out = [];
    const step = 0.8;
    const n = Math.round(SHRUB_TILE / step);
    lines((ti + 0.5) * SHRUB_TILE, (tj + 0.5) * SHRUB_TILE, at);
    if (Math.min(at.stream, at.river - RIVER_BANK) > SHRUB_TILE) {
      return new Float32Array(0);
    }
    for (let b = 0; b < n; b += 1) {
      for (let a = 0; a < n; a += 1) {
        const gi = ti * n + a;
        const gj = tj * n + b;
        const x = (gi + 0.1 + 0.8 * hash01(gi, gj, 91)) * step;
        const z = (gj + 0.1 + 0.8 * hash01(gi, gj, 92)) * step;
        lines(x, z, at);
        const onStream = at.stream >= 0 && at.stream < 2.6;
        const onRiver = at.river >= RIVER_BANK && at.river < RIVER_BANK + 4;
        if (!(onStream || onRiver) || !(hash01(gi, gj, 93) < 0.8)) {
          continue;
        }
        const h = Math.min(CHEST - 0.1, 0.7 + 0.4 * hash01(gi, gj, 94));
        out.push(
          x, world.groundAt(x, z) - 0.05, z, hash01(gi, gj, 95) * 6.283,
          h, h * 0.9,
          G_REED[Math.floor(hash01(gi, gj, 96) * G_REED.length)], T_LUSH + Math.min(0.999, hash01(gi, gj, 97)),
        );
      }
    }
    return new Float32Array(out);
  }

  /* The tiles a layer wants round (x, z) out to reach, nearest first,
   * made on demand and kept while they stay near. */
  /* The tiles a layer wants round (x, z) out to reach, nearest first,
   * made on demand while the frame's time allows (`until`, a
   * performance.now() deadline) and kept while they stay near. Returns
   * { tiles, pending }: pending the tiles in reach not made yet. */
  function tilesFor(cache, make, size, x, z, reach, until) {
    const i0 = Math.floor((x - reach) / size);
    const i1 = Math.floor((x + reach) / size);
    const j0 = Math.floor((z - reach) / size);
    const j1 = Math.floor((z + reach) / size);
    const list = [];
    for (let j = j0; j <= j1; j += 1) {
      for (let i = i0; i <= i1; i += 1) {
        const cx = (i + 0.5) * size - x;
        const cz = (j + 0.5) * size - z;
        const d = Math.hypot(cx, cz) - size * 0.71;
        if (d <= reach) {
          list.push({ i, j, d, k: (i + 4096) * 8192 + (j + 4096) });
        }
      }
    }
    list.sort((a, b) => a.d - b.d);
    const tiles = [];
    let pending = 0;
    for (const e of list) {
      let t = cache.get(e.k);
      if (!t && performance.now() < until) {
        t = make(e.i, e.j);
        cache.set(e.k, t);
      }
      if (t) {
        tiles.push(t);
      } else {
        pending += 1;
      }
    }
    /* Forget what is far: a flight across the map keeps no more than
     * a few times what one place needs. */
    if (cache.size > list.length * 4) {
      const keep = new Set(list.map((e) => e.k));
      for (const k of cache.keys()) {
        if (!keep.has(k)) {
          cache.delete(k);
        }
      }
    }
    return { tiles, pending };
  }

  /* The layers, each with the tiles it keeps and how far it reaches
   * for a camera `over` metres above the ground: the grass's whole
   * reach low down, shrinking as the camera climbs and a clump falls
   * under a pixel; the banks' reeds and the shrubs past it, reaching as
   * far out whatever the height, since from higher up the ground in
   * view is further out. */
  const layers = [
    {
      name: 'grass', layer: grass, tiles: new Map(), make: grassTiles(TILE, q.grassStep, 1, 1), size: TILE, reach: (k) => [0, q.grassR * k],
    },
    {
      name: 'meadow',
      layer: meadow,
      tiles: new Map(),
      make: grassTiles(SHRUB_TILE, q.grassStep * 3, 2, 1.15),
      size: SHRUB_TILE,
      reach: (k) => [q.grassR * k * 0.8, q.meadowR * Math.max(0, 2 * k - 1)],
    },
    {
      name: 'banks', layer: banks, tiles: new Map(), make: bankTile, size: SHRUB_TILE, reach: (k) => [q.grassR * k * 0.85, q.bankR],
    },
    {
      name: 'shrubs', layer: shrubs, tiles: new Map(), make: shrubTile, size: SHRUB_TILE, reach: () => [0, q.shrubR],
    },
  ];
  const stats = {
    grass: 0, meadow: 0, banks: 0, shrubs: 0, scale: 0, pending: 0, lastMs: 0,
  };
  const last = { x: Infinity, z: 0 };
  function view(camera) {
    const cam = camera.position;
    const over = cam.y - world.groundAt(cam.x, cam.z);
    const scale = 1 - Math.min(1, Math.max(0, (over - LOW_M) / (HIGH_M - LOW_M)));
    const on = scale > 0 && q.grassR > 0;
    stats.scale = scale;
    for (const l of layers) {
      l.layer.mesh.visible = on;
    }
    if (!on) {
      for (const l of layers) {
        l.key = '';
        stats[l.name] = 0;
      }
      return;
    }
    /* A layer is refilled when the camera crosses into another of its
     * tiles, its height band changes how far the grass reaches, or tiles
     * it was waiting for are made. Flying, tiles are made BUILD_MS a
     * frame and the nearest first, so crossing a tile is no hitch; a
     * jump (a new view, a respawn) makes them all at once, as the trees
     * settle, so the first frame there has its grass. */
    const t0 = performance.now();
    const jumped = Math.hypot(cam.x - last.x, cam.z - last.z) > JUMP_M;
    last.x = cam.x;
    last.z = cam.z;
    const until = jumped ? Infinity : t0 + BUILD_MS;
    const band = Math.round(scale * 8) / 8;
    let pending = 0;
    for (const l of layers) {
      const key = `${Math.floor(cam.x / l.size)},${Math.floor(cam.z / l.size)},${band}`;
      if (key === l.key) {
        continue;
      }
      const [inner, outer] = l.reach(band);
      l.layer.uniforms.uNfReach.value.set(inner, outer);
      const got = tilesFor(l.tiles, l.make, l.size, cam.x, cam.z, outer + l.size, until);
      stats[l.name] = l.layer.fill(got.tiles);
      l.key = got.pending ? '' : key;
      pending += got.pending;
    }
    stats.pending = pending;
    stats.lastMs = performance.now() - t0;
  }

  return {
    group,
    view,
    stats: () => ({ ...stats }),
    dispose() {
      for (const l of layers) {
        l.layer.dispose();
      }
      group.removeFromParent();
    },
  };
}
