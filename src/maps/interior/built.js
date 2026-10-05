/*
 * built.js: what places.js put on the Interior's land, drawn, solid and
 * landable: the roads, Río Sereno and its streams, Puente Doble, the
 * causeway on Arroyo Manso, the colonia's houses, school and store,
 * Sector Alpha's silo and sheds, and Pista Cero's container and tent.
 *
 * DRAWN CHEAPLY. Everything of a material is one merged mesh, a handful
 * of draws for the whole corridor: the walls, the tin roofs, the
 * concrete, the roads, the water. The buildings are low and plain, as the
 * region's are (TECH-NEEDS M1 assets: "fifteen to twenty low houses, a
 * school"), and seen mostly from hundreds of metres up.
 *
 * SOLID AS DRAWN (interior:collide). A building's walls are one turned box
 * under its eaves (src/game/collide.js addTurnedBox) and its roof a roof
 * record (src/maps/alps/roofs.js), so a craft lands on the roof it sees
 * and the walls under it pass while it stands there (rec.solids). The
 * bridge's deck is a roof record over a solid slab, its piers posts, its
 * rails boxes; an open shed's roof stands on posts with nothing under
 * it. The water is the plant's channel (rivers), not a solid.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import {
  BRIDGES, BUILDINGS, CROSSINGS, ROADS,
} from '../../share/interior/places.js';
import { RIVER, STREAMS } from '../../share/interior/hydro.js';
import { HALF } from '../../share/interior/frame.js';
import {
  recordAt, gableTop, shedTop, flatTop, pyramidTop,
} from '../alps/roofs.js';
import { thermalKind } from '../../render/thermal.js';

/* Linear colours. */
const ROAD_COL = [0.15, 0.08, 0.042];
const CONCRETE = [0.32, 0.31, 0.29];
const TIN = { red: [0.22, 0.07, 0.04], grey: [0.3, 0.31, 0.31], rust: [0.2, 0.1, 0.05] };
const srgb = (hex) => {
  const v = parseInt(hex.slice(1), 16);
  const f = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return [f((v >> 16) & 255), f((v >> 8) & 255), f(v & 255)];
};

/* A growing merged mesh: triangles with normals and colours. */
function makeSink() {
  const pos = [];
  const nrm = [];
  const col = [];
  return {
    pos,
    nrm,
    col,
    tri(a, b, c, colour) {
      const ux = b[0] - a[0];
      const uy = b[1] - a[1];
      const uz = b[2] - a[2];
      const vx = c[0] - a[0];
      const vy = c[1] - a[1];
      const vz = c[2] - a[2];
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
      for (const p of [a, b, c]) {
        pos.push(p[0], p[1], p[2]);
        nrm.push(nx, ny, nz);
        col.push(colour[0], colour[1], colour[2]);
      }
    },
    quad(a, b, c, d, colour) {
      this.tri(a, b, c, colour);
      this.tri(a, c, d, colour);
    },
  };
}

function meshOf(THREE, sink, mat, name) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(sink.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(sink.nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(sink.col, 3));
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat);
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/* A box in a building's frame: centre (cx, cz), long axis (dx, dz), w
 * along it, d across, from y0 to y1. Its corners, world. */
function corners(cx, cz, dx, dz, w, d, y) {
  const ax = dx * (w / 2);
  const az = dz * (w / 2);
  const bx = -dz * (d / 2);
  const bz = dx * (d / 2);
  return [
    [cx - ax - bx, y, cz - az - bz],
    [cx + ax - bx, y, cz + az - bz],
    [cx + ax + bx, y, cz + az + bz],
    [cx - ax + bx, y, cz - az + bz],
  ];
}

function boxInto(sink, cx, cz, dx, dz, w, d, y0, y1, colour, top = true) {
  const lo = corners(cx, cz, dx, dz, w, d, y0);
  const hi = corners(cx, cz, dx, dz, w, d, y1);
  for (let k = 0; k < 4; k += 1) {
    const k2 = (k + 1) % 4;
    sink.quad(lo[k], lo[k2], hi[k2], hi[k], colour);
  }
  if (top) {
    sink.quad(hi[3], hi[2], hi[1], hi[0], colour);
  }
}

/* A turned box collider for the same box; returns its index. */
function solidBox(colliders, kind, cx, cz, dx, dz, w, d, y0, y1) {
  const u = cx * dx + cz * dz;
  const v = -cx * dz + cz * dx;
  return colliders.addTurnedBox(kind, dx, dz, u - w / 2, u + w / 2, y0, y1, v - d / 2, v + d / 2);
}

/* A ribbon along a polyline (world [x, z]) conformed to `yAt`, every
 * `step` metres, `width` wide. */
function ribbon(sink, points, width, yAt, colour, step = 8, skip = null) {
  const pts = [];
  for (let k = 0; k + 1 < points.length; k += 1) {
    const [ax, az] = points[k];
    const [bx, bz] = points[k + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let t = 0; t < n; t += 1) {
      pts.push([ax + ((bx - ax) * t) / n, az + ((bz - az) * t) / n]);
    }
  }
  pts.push(points[points.length - 1]);
  let prev = null;
  for (let k = 0; k < pts.length; k += 1) {
    const [x, z] = pts[k];
    const [px, pz] = pts[Math.max(0, k - 1)];
    const [nx, nz] = pts[Math.min(pts.length - 1, k + 1)];
    let tx = nx - px;
    let tz = nz - pz;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    const w = typeof width === 'function' ? width(k / (pts.length - 1)) : width;
    const lx = x - tz * (w / 2);
    const lz = z + tx * (w / 2);
    const rx = x + tz * (w / 2);
    const rz = z - tx * (w / 2);
    const cur = [[lx, yAt(lx, lz, k / (pts.length - 1)), lz], [rx, yAt(rx, rz, k / (pts.length - 1)), rz]];
    if (prev && !(skip && skip(x, z))) {
      sink.quad(prev[0], cur[0], cur[1], prev[1], colour);
    }
    prev = cur;
  }
}

/* Four slopes in roofs.js's convention (x across, z along, the plate at
 * y 0): a ridge along z at height r, the ends sloping down to the eaves
 * like the sides, so nothing under it is a wall above the plate. */
function hipTop(hw, hd, r) {
  const k = Math.max(0, hd - hw);
  return [
    [[-hw, 0, -hd], [-hw, 0, hd], [0, r, k], [0, r, -k]],
    [[hw, 0, hd], [hw, 0, -hd], [0, r, -k], [0, r, k]],
    [[-hw, 0, hd], [hw, 0, hd], [0, r, k]],
    [[hw, 0, -hd], [-hw, 0, -hd], [0, r, -k]],
  ];
}

/* A turn about y, as roofs.js frameElements takes it: local +z along
 * (dx, dz). */
const yawOf = (dx, dz) => Math.atan2(dx, dz);

/*
 * The built parts: { group, rivers (the plant's channels), view(camera),
 * update(step), stats(), dispose() }. Adds its colliders to `colliders`
 * and its roof records to `roofs`.
 */
export async function buildBuilt({
  THREE, scene, world, colliders, roofs,
}) {
  const group = new THREE.Group();
  group.name = 'interior-built';
  scene.add(group);
  const ground = world.groundAt;
  const vc = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, ...o });
  const wallMat = vc({});
  const roofMat = vc({ roughness: 0.55, metalness: 0.5 });
  const concreteMat = vc({ roughness: 0.85 });
  const roadMat = vc({ roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  /* A slow brown river: silt colours it and its surface is never still
   * enough to be a mirror. */
  const waterMat = thermalKind(vc({ roughness: 0.32, envMapIntensity: 0.6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), 'water');
  const walls = makeSink();
  const tin = makeSink();
  const concrete = makeSink();
  const roads = makeSink();
  const water = makeSink();
  let solidCount = 0;

  /* THE BRIDGE: deck, two spans on a pier mid river and an abutment each
   * end, rails both sides. */
  const decks = [];
  for (const b of BRIDGES) {
    const [ax, az] = b.from;
    const [bx, bz] = b.to;
    const [dx, dz] = b.dir;
    const len = Math.hypot(bx - ax, bz - az);
    const cx = (ax + bx) / 2;
    const cz = (az + bz) / 2;
    const top = b.deckY;
    const bot = top - b.deckThick;
    boxInto(concrete, cx, cz, dx, dz, len, b.width, bot, top, CONCRETE);
    const slab = solidBox(colliders, 'wall', cx, cz, dx, dz, len, b.width, bot, top);
    const solids = [slab];
    for (const side of [-1, 1]) {
      const ox = -dz * side * (b.width / 2 - 0.15);
      const oz = dx * side * (b.width / 2 - 0.15);
      boxInto(concrete, cx + ox, cz + oz, dx, dz, len, 0.3, top, top + b.rail, CONCRETE);
      solids.push(solidBox(colliders, 'wall', cx + ox, cz + oz, dx, dz, len, 0.3, top, top + b.rail));
    }
    for (const f of [0, 0.5, 1]) {
      const px = ax + (bx - ax) * f;
      const pz = az + (bz - az) * f;
      const g = ground(px, pz);
      const pw = f === 0.5 ? 1.6 : 2.4;
      boxInto(concrete, px, pz, dx, dz, pw, b.width - 0.6, Math.min(g, bot) - 2, bot, CONCRETE, false);
      solids.push(solidBox(colliders, 'wall', px, pz, dx, dz, pw, b.width - 0.6, Math.min(g, bot) - 2, bot));
    }
    const rec = recordAt({ top: flatTop(-b.width / 2, -len / 2, b.width / 2, len / 2, 0), dy: b.deckThick, hw: b.width / 2, hd: len / 2, kind: 'bridge' },
      'concrete:bridge', cx, top, cz, yawOf(dx, dz));
    rec.material = 'rock';
    rec.solids = solids;
    rec.eaves = [];
    roofs.push(rec);
    decks.push({ b, cx, cz, len });
    solidCount += solids.length;
  }
  const onDeck = (x, z) => decks.some(({ b, cx, cz, len }) => {
    const u = (x - cx) * b.dir[0] + (z - cz) * b.dir[1];
    const v = -(x - cx) * b.dir[1] + (z - cz) * b.dir[0];
    return Math.abs(u) < len / 2 + 1 && Math.abs(v) < b.width / 2 + 2;
  });

  /* THE ROADS, on the ground, not drawn across the bridge's deck. */
  for (const r of ROADS) {
    ribbon(roads, r.points, r.width, (x, z) => ground(x, z) + 0.08, ROAD_COL, 8, onDeck);
  }
  for (const b of BRIDGES) {
    const [dx, dz] = b.dir;
    const len = Math.hypot(b.to[0] - b.from[0], b.to[1] - b.from[1]);
    const cx = (b.from[0] + b.to[0]) / 2;
    const cz = (b.from[1] + b.to[1]) / 2;
    const c = corners(cx, cz, dx, dz, len, b.width - 0.6, b.deckY + 0.02);
    roads.quad(c[3], c[2], c[1], c[0], [0.2, 0.19, 0.18]);
  }
  for (const c of CROSSINGS) {
    const [dx, dz] = c.dir;
    const y = ground(c.at[0], c.at[1]) + 0.3;
    boxInto(concrete, c.at[0], c.at[1], dx, dz, c.length, c.width, y - 0.8, y, CONCRETE);
    const slab = solidBox(colliders, 'wall', c.at[0], c.at[1], dx, dz, c.length, c.width, y - 0.8, y);
    const rec = recordAt({ top: flatTop(-c.width / 2, -c.length / 2, c.width / 2, c.length / 2, 0), dy: 0.8, hw: c.width / 2, hd: c.length / 2, kind: 'causeway' },
      `concrete:${c.id}`, c.at[0], y, c.at[1], yawOf(dx, dz));
    rec.material = 'rock';
    rec.solids = [slab];
    rec.eaves = [];
    roofs.push(rec);
    solidCount += 1;
  }

  /* RIO SERENO, its water at its level, a little wider than its channel
   * so it laps its banks, and its streams on their beds. */
  const inSquare = RIVER.points.map(([x, z]) => Math.abs(x) < HALF && Math.abs(z) < HALF);
  const first = inSquare.indexOf(true);
  const lastIn = inSquare.lastIndexOf(true);
  const rpts = RIVER.points.slice(first, lastIn + 1);
  const rlev = RIVER.level.slice(first, lastIn + 1);
  const rwid = RIVER.width.slice(first, lastIn + 1);
  const at = (f) => Math.min(rpts.length - 1, Math.round(f * (rpts.length - 1)));
  ribbon(water, rpts, (f) => rwid[at(f)] + 8, (x, z, f) => rlev[at(f)], [0.075, 0.052, 0.03], 10);
  for (const s of STREAMS) {
    const w = Math.min(7, 2.5 + s.km2 * 0.35);
    ribbon(water, s.points, w, (x, z) => ground(x, z) + 0.15, [0.045, 0.04, 0.03], 10);
  }
  const rivers = [{
    line: rpts.map(([x, z], k) => ({ x, y: rlev[k], z })),
    width: Math.min(...rwid) + 4,
  }];

  /* THE BUILDINGS. */
  for (const b of BUILDINGS) {
    const [cx, cz] = b.at;
    const [dx, dz] = b.dir;
    /* On the lowest ground of the footprint, so no corner floats. */
    const foot = corners(cx, cz, dx, dz, b.w, b.d, 0);
    const g = Math.min(...foot.map(([x, , z]) => ground(x, z)));
    const wallCol = b.colour ? srgb(b.colour) : CONCRETE;
    const eaves = g + b.h;
    const tinCol = b.kind === 'house' || b.kind === 'store' ? (cx > 0 ? TIN.red : TIN.rust) : TIN.grey;
    if (b.kind === 'silo') {
      const r = b.w / 2;
      const n = 14;
      for (let k = 0; k < n; k += 1) {
        const a0 = (k / n) * Math.PI * 2;
        const a1 = ((k + 1) / n) * Math.PI * 2;
        const p0 = [cx + r * Math.cos(a0), g - 0.5, cz + r * Math.sin(a0)];
        const p1 = [cx + r * Math.cos(a1), g - 0.5, cz + r * Math.sin(a1)];
        walls.quad(p0, p1, [p1[0], eaves, p1[2]], [p0[0], eaves, p0[2]], wallCol);
        tin.tri([p1[0], eaves, p1[2]], [p0[0], eaves, p0[2]], [cx, eaves + b.ridge, cz], TIN.grey);
      }
      /* The drum as strips inscribed in its circle, half a metre wide,
       * along x and along z: their union is never outside the drawn wall
       * and never more than 0.21 m inside it (measured). The cone is a
       * roof record over it, so a craft lands on it. */
      const posts = [];
      for (const along of [[1, 0], [0, 1]]) {
        for (let z0 = -r; z0 < r - 1e-9; z0 += 0.5) {
          const z1 = Math.min(r, z0 + 0.5);
          const zm = Math.max(Math.abs(z0), Math.abs(z1));
          const half = Math.sqrt(Math.max(0, r * r - zm * zm));
          if (half < 0.05) {
            continue;
          }
          const mid = (z0 + z1) / 2;
          posts.push(solidBox(colliders, 'wall', cx - along[1] * mid, cz + along[0] * mid, along[0], along[1], 2 * half, z1 - z0, g - 1, eaves));
        }
      }
      solidCount += posts.length;
      const rec = recordAt({ top: pyramidTop(14, r, 0, b.ridge), dy: 0.2, hw: r, hd: r, kind: 'silo' }, `metal:${b.id}`, cx, eaves, cz, 0);
      rec.solids = posts;
      rec.eaves = posts;
      roofs.push(rec);
      continue;
    }
    const open = b.kind === 'openshed';
    if (open) {
      for (const [ox, oz] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [0, -0.5], [0, 0.5]]) {
        const px = cx + dx * b.w * ox * 0.96 - dz * b.d * oz * 0.96;
        const pz = cz + dz * b.w * ox * 0.96 + dx * b.d * oz * 0.96;
        boxInto(walls, px, pz, dx, dz, 0.3, 0.3, g - 0.3, eaves, [0.25, 0.26, 0.26]);
        colliders.addPost('pole', px, pz, g - 0.3, eaves, 0.2);
        solidCount += 1;
      }
    } else {
      boxInto(walls, cx, cz, dx, dz, b.w, b.d, g - 0.4, eaves, wallCol, b.roof === 'flat');
    }
    const solids = [];
    if (!open) {
      solids.push(solidBox(colliders, 'wall', cx, cz, dx, dz, b.w, b.d, g - 0.4, b.roof === 'flat' ? eaves : eaves - 0.05));
      solidCount += 1;
    }
    /* The roof, local x across the ridge, z along it (the long axis). */
    const hw = b.d / 2 + 0.4;
    const hd = b.w / 2 + 0.4;
    let top;
    if (b.roof === 'hip') {
      top = hipTop(hw, hd, b.ridge);
    } else if (b.roof === 'gable') {
      top = gableTop(hw, 0, b.ridge, -hd, hd);
    } else if (b.roof === 'shed') {
      top = shedTop(-hw, b.ridge, hw, 0, -hd, hd);
    } else {
      top = flatTop(-b.d / 2, -b.w / 2, b.d / 2, b.w / 2, 0);
    }
    const ry = yawOf(dx, dz);
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    /* roofs.js's frame: local x is world (c, -s), local z world (s, c). */
    const toWorld = ([lx, ly, lz]) => [c * lx + s * lz + cx, eaves + ly, -s * lx + c * lz + cz];
    for (const face of top) {
      const w = face.map(toWorld);
      tin.tri(w[0], w[1], w[2], b.roof === 'flat' ? wallCol : tinCol);
      if (w.length === 4) {
        tin.tri(w[0], w[2], w[3], b.roof === 'flat' ? wallCol : tinCol);
      }
      /* The underside, for a roof seen from under its eaves. */
      tin.tri(w[2], w[1], w[0], [0.1, 0.1, 0.1]);
      if (w.length === 4) {
        tin.tri(w[3], w[2], w[0], [0.1, 0.1, 0.1]);
      }
    }
    if (b.roof === 'gable' && !open) {
      /* The gable ends' triangles. */
      for (const z of [-b.w / 2, b.w / 2]) {
        walls.tri(toWorld([-b.d / 2, 0, z]), toWorld([b.d / 2, 0, z]), toWorld([0, b.ridge * (b.d / 2) / hw, z]), wallCol);
        walls.tri(toWorld([b.d / 2, 0, z]), toWorld([-b.d / 2, 0, z]), toWorld([0, b.ridge * (b.d / 2) / hw, z]), wallCol);
      }
    }
    const rec = recordAt({ top, dy: 0.15, hw, hd, open, kind: b.kind }, `${b.kind === 'container' ? 'metal' : 'tin'}:${b.id}`, cx, eaves, cz, ry);
    rec.solids = solids;
    rec.eaves = solids;
    roofs.push(rec);
  }

  const meshes = [
    meshOf(THREE, walls, wallMat, 'interior-walls'),
    meshOf(THREE, tin, roofMat, 'interior-roofs'),
    meshOf(THREE, concrete, concreteMat, 'interior-concrete'),
    meshOf(THREE, roads, roadMat, 'interior-roads'),
    meshOf(THREE, water, waterMat, 'interior-water'),
  ];
  meshes[3].castShadow = false;
  meshes[4].castShadow = false;
  for (const m of meshes) {
    group.add(m);
  }
  const tris = meshes.reduce((n, m) => n + m.geometry.attributes.position.count / 3, 0);
  return {
    group,
    rivers,
    view() {},
    update() {},
    stats: () => ({ meshes: meshes.length, triangles: tris, solids: solidCount, roofs: roofs.length }),
    dispose() {
      for (const m of meshes) {
        m.geometry.dispose();
      }
      for (const m of [wallMat, roofMat, concreteMat, roadMat, waterMat]) {
        m.dispose();
      }
      group.removeFromParent();
    },
  };
}
