/*
 * yards.js: what stands round the Interior's buildings, so the colonia
 * reads as lived in from the air and through the camera ball: a wire
 * fence on wooden posts round each yard with a gap for its gate, a water
 * tank up on a stand, the washing on a line, a motorcycle by the
 * veranda, a mango or a palm in the yard; the school's football pitch,
 * its lines and goals, and its flagpole; crates by the store; Sector
 * Alpha's tractor, grain trailer, pickup and diesel tank by its sheds.
 *
 * OUT OF THE WAY OF THE STORY. Nothing here stands near a route the room
 * walks its people on (src/share/interior/routes.js), near the family
 * render/interior/ambient.js sits outside colonia-house-3, on a road or
 * against a wall: clearance() below says where a thing may stand and
 * every placing asks it. A yard tree is decoration, not canopy, so it
 * keeps furthest away, TREE_CLEAR, from every route: from a survey
 * camera 25 degrees up, its crown hides the ground 13 m behind it, and
 * the room believes the colonia's ground is open.
 *
 * SOLID OR NOT. A tank on its stand, a motorcycle, a goal, a machine:
 * solid, drawn into the solid `kit` mesh with a turned box or a post
 * that fits it (interior:collide). A fence, a washing line, a crate, a
 * tree, a painted line: decoration, as thin as the forest's twigs.
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

import { gridToWorld } from '../../share/interior/frame.js';
import { BUILDINGS, ROADS } from '../../share/interior/places.js';
import { ROUTES } from '../../share/interior/routes.js';
import { boxInto, drumInto, frameOf, lineDistance, seeded } from './sink.js';

/* The football pitch's corners in the design grid, as places.js paints
 * its grass (LAND_EDITS). */
const PITCH = [[9.5, 6.06], [9.57, 6.02]];
/* Metres a thing keeps from a route, a tree more (above). */
const ROUTE_CLEAR = 6;
const TREE_CLEAR = 15;

/*
 * Where a thing may stand: { route(x, z), road(x, z), wall(x, z) }, each
 * the distance to the nearest route (or the ambient family), road edge
 * or building footprint. `footprints` are the buildings built.js stood,
 * its own outbuildings and chapel among them.
 */
export function clearance(footprints) {
  const lines = Object.values(ROUTES).map((r) => r.pts);
  /* ambient.js's family outside colonia-house-3: two sitting, a child
   * walking four metres either way along the house. */
  const h3 = BUILDINGS.find((b) => b.id === 'colonia-house-3');
  if (h3) {
    const [x, z] = h3.at;
    lines.push([[x + 6, z + 2]], [[x + 7, z + 3.5]], [[x, z + 5], [x + 8, z + 5]]);
  }
  const route = (x, z) => Math.min(...lines.map((l) => lineDistance(l, x, z)));
  const road = (x, z) => Math.min(...ROADS.map((r) => lineDistance(r.points, x, z) - r.width / 2));
  const wall = (x, z) => {
    let best = Infinity;
    for (const f of footprints) {
      const u = (x - f.cx) * f.dx + (z - f.cz) * f.dz;
      const v = -(x - f.cx) * f.dz + (z - f.cz) * f.dx;
      const du = Math.max(0, Math.abs(u) - f.w / 2);
      const dv = Math.max(0, Math.abs(v) - f.d / 2);
      best = Math.min(best, Math.hypot(du, dv));
    }
    return best;
  };
  return {
    route,
    road,
    wall,
    ok: (x, z, r = ROUTE_CLEAR, w = 1) => route(x, z) >= r && road(x, z) >= 2 && wall(x, z) >= w,
  };
}

const WOOD = [0.13, 0.09, 0.06];
const WIRE = [0.04, 0.04, 0.04];
const CLOTH = [[0.5, 0.06, 0.05], [0.06, 0.15, 0.45], [0.6, 0.58, 0.52], [0.55, 0.4, 0.05], [0.12, 0.3, 0.12], [0.45, 0.2, 0.3]];
const MOTO = [[0.4, 0.03, 0.02], [0.02, 0.06, 0.25], [0.03, 0.03, 0.03], [0.45, 0.45, 0.43]];
const TANK = [[0.03, 0.03, 0.035], [0.04, 0.1, 0.28], [0.55, 0.55, 0.52]];
const DARK = [0.025, 0.025, 0.025];
const LEAF = [[0.016, 0.045, 0.014], [0.022, 0.055, 0.016], [0.018, 0.04, 0.016]];
const FROND = [0.07, 0.1, 0.03];
const TRUNK = [0.11, 0.09, 0.07];
const LINE = [0.75, 0.75, 0.72];
const GRASS = [[0.06, 0.095, 0.03], [0.07, 0.108, 0.034]];
const WORN = [0.14, 0.075, 0.04];

/* A quad lying on the ground, wound to face up whichever way its
 * corners were given. */
function upQuad(s, a, b, c, d, colour) {
  const up = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]) > 0;
  if (up) {
    s.quad(a, b, c, d, colour);
  } else {
    s.quad(d, c, b, a, colour);
  }
}

/* A thin level strip from a to b at heights y0..y1 (a wire, a line): a
 * single quad, the props material is double sided. */
function strip(s, a, b, y0, y1, colour) {
  s.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], colour);
}

/*
 * Dress the yards. `sink(x, z, type)` is built.js's sink for the site at
 * (x, z); `box` and `post` add a solid and count it. Returns { stats }.
 */
export function dressYards({
  THREE, world, sink, dwellings, footprints, box, post,
}) {
  const ground = world.groundAt;
  const room = clearance(footprints);
  const counts = {
    fences: 0, tanks: 0, washing: 0, motorcycles: 0, trees: 0, machines: 0,
  };

  /* A motorcycle parked, heading (hx, hz): wheels, engine, tank, seat,
   * bars, all inside its solid. */
  const motorcycle = (x, z, hx, hz, colour) => {
    const g = ground(x, z);
    const s = sink(x, z, 'kit');
    const F = frameOf(x, z, hx, hz);
    for (const u of [-0.68, 0.68]) {
      const [wx, , wz] = F.at(u, 0, 0);
      boxInto(s, wx, wz, hx, hz, 0.6, 0.1, g, g + 0.6, DARK);
    }
    const [ex, , ez] = F.at(-0.05, 0, 0);
    boxInto(s, ex, ez, hx, hz, 0.55, 0.26, g + 0.25, g + 0.6, [0.12, 0.12, 0.12]);
    const [tx, , tz] = F.at(0.22, 0, 0);
    boxInto(s, tx, tz, hx, hz, 0.5, 0.28, g + 0.6, g + 0.85, colour);
    const [sx, , sz] = F.at(-0.35, 0, 0);
    boxInto(s, sx, sz, hx, hz, 0.7, 0.26, g + 0.66, g + 0.82, DARK);
    const [bx, , bz] = F.at(0.55, 0, 0);
    boxInto(s, bx, bz, hx, hz, 0.06, 0.62, g + 0.98, g + 1.03, DARK);
    boxInto(s, bx, bz, hx, hz, 0.06, 0.06, g + 0.55, g + 1.0, [0.3, 0.3, 0.3]);
    box(x, z, hx, hz, 1.95, 0.5, g, g + 1.03);
    counts.motorcycles += 1;
  };

  /* A water tank on a stand of four posts and a slab. */
  const tank = (x, z, colour, legH = 2.6) => {
    const g = ground(x, z);
    const s = sink(x, z, 'kit');
    for (const [ox, oz] of [[-0.6, -0.6], [0.6, -0.6], [0.6, 0.6], [-0.6, 0.6]]) {
      boxInto(s, x + ox, z + oz, 1, 0, 0.1, 0.1, g - 0.2, g + legH, WOOD);
      post(x + ox, z + oz, g - 0.2, g + legH, 0.06);
    }
    boxInto(s, x, z, 1, 0, 1.45, 1.45, g + legH, g + legH + 0.12, [0.3, 0.29, 0.27]);
    box(x, z, 1, 0, 1.45, 1.45, g + legH, g + legH + 0.12);
    drumInto(s, x, z, 0.58, g + legH + 0.12, g + legH + 1.32, 10, colour, { cap: colour });
    box(x, z, 1, 0, 0.82, 0.82, g + legH + 0.12, g + legH + 1.32);
    counts.tanks += 1;
  };

  /* A mango: a dense dome of leaf clusters on a short trunk, each
   * cluster a lumpy ball, shaded as one crown (normals out from the
   * crown's middle) so it reads round, not faceted. */
  const ico = new THREE.IcosahedronGeometry(1, 1).toNonIndexed();
  const icoPos = ico.attributes.position;
  const mango = (x, z, size) => {
    const g = ground(x, z);
    const s = sink(x, z, 'leaves');
    const key = `${Math.round(x)},${Math.round(z)}`;
    boxInto(s, x, z, 1, 0, 0.3, 0.3, g - 0.2, g + 2.6 * size, TRUNK);
    const RX = 2.7 * size;
    const RY = 2.0 * size;
    const C = [x, g + 3.9 * size, z];
    const tone = LEAF[Math.floor(seeded(key, 1) * LEAF.length)];
    const n = 8;
    for (let li = 0; li < n; li += 1) {
      /* Cluster centres on a spiral over the dome, the last on top. */
      const t = (li + 0.5) / n;
      const el = li === n - 1 ? Math.PI / 2 : 0.15 + 0.9 * t;
      const az = li * 2.4 + seeded(key, 2) * 6;
      const dir = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
      const r = (0.5 + 0.15 * seeded(key, 10 + li)) * RX;
      const lc = [C[0] + dir[0] * RX * 0.5, C[1] + dir[1] * RY * 0.45, C[2] + dir[2] * RX * 0.5];
      const vert = (k) => {
        const px = icoPos.getX(k);
        const py = icoPos.getY(k);
        const pz = icoPos.getZ(k);
        const j = 1 + 0.3 * (seeded(`${Math.round(px * 100)},${Math.round(py * 100)},${Math.round(pz * 100)}`, li) - 0.5);
        const p = [lc[0] + px * r * j, lc[1] + py * r * 0.8 * j, lc[2] + pz * r * j];
        let nx = (p[0] - C[0]) / RX + px * 0.6;
        let ny = (p[1] - C[1]) / RY + py * 0.6;
        let nz = (p[2] - C[2]) / RX + pz * 0.6;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l;
        ny /= l;
        nz /= l;
        const lit = (0.55 + 0.5 * (ny * 0.5 + 0.5)) * (0.85 + 0.3 * seeded(`${k}`, li));
        return { p, n: [nx, ny, nz], c: tone.map((v) => v * lit) };
      };
      for (let k = 0; k < icoPos.count; k += 3) {
        const a = vert(k);
        const b = vert(k + 1);
        const c = vert(k + 2);
        s.triN(a.p, b.p, c.p, a.n, b.n, c.n, a.c, b.c, c.c);
      }
    }
    counts.trees += 1;
  };

  /* A palm: a tall bare trunk and a head of arching fronds. */
  const palm = (x, z, h) => {
    const g = ground(x, z);
    const s = sink(x, z, 'leaves');
    drumInto(s, x, z, 0.16, g - 0.2, g + h, 6, TRUNK, { top: false });
    const n = 11;
    const radii = [0, 1.1, 2.2, 3.1];
    const drops = [0, 0.45, 0.1, -0.9];
    const widths = [0.12, 0.55, 0.45, 0.06];
    for (let k = 0; k < n; k += 1) {
      const a = (k / n) * Math.PI * 2 + seeded(`${x},${z}`, 2) * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const lean = 0.8 + 0.4 * seeded(`${x},${z}`, 3 + k);
      for (let i = 0; i + 1 < radii.length; i += 1) {
        const p = (j, side) => [
          x + ca * radii[j] * lean - sa * widths[j] * side,
          g + h + drops[j] * lean,
          z + sa * radii[j] * lean + ca * widths[j] * side,
        ];
        const tone = FROND.map((t) => t * (0.85 + 0.3 * (i / 3)));
        s.quad(p(i, -1), p(i + 1, -1), p(i + 1, 1), p(i, 1), tone);
      }
    }
    counts.trees += 1;
  };

  /* THE HOUSES' YARDS. */
  for (const h of dwellings) {
    const { b, front, frame: F } = h;
    const [dx, dz] = b.dir;
    const id = b.id;
    if (b.kind === 'house') {
      /* The fence: posts every 2.5 m round the yard, two wires, a gap
       * for the gate on the road side. */
      const U = b.w / 2 + 6;
      const vF = front * (b.d / 2 + 5);
      const vB = -front * (b.d / 2 + 8);
      const ring = [[-U, vF], [U, vF], [U, vB], [-U, vB], [-U, vF]];
      const props = sink(b.at[0], b.at[1], 'props');
      let last = null;
      for (let k = 0; k + 1 < ring.length; k += 1) {
        const [u0, v0] = ring[k];
        const [u1, v1] = ring[k + 1];
        const len = Math.hypot(u1 - u0, v1 - v0);
        const n = Math.round(len / 2.5);
        for (let i = 0; i < n; i += 1) {
          const t = i / n;
          const u = u0 + (u1 - u0) * t;
          const v = v0 + (v1 - v0) * t;
          const [px, , pz] = F.at(u, v, 0);
          const gate = k === 0 && Math.abs(u) < 1.8;
          if (gate || !room.ok(px, pz, 2.5, 0.8)) {
            last = null;
            continue;
          }
          const gp = ground(px, pz);
          boxInto(props, px, pz, dx, dz, 0.09, 0.09, gp - 0.1, gp + 1.25, WOOD.map((c) => c * (0.8 + 0.4 * seeded(id, 100 + k * 50 + i))));
          if (last) {
            for (const y of [0.62, 1.08]) {
              strip(props, last.p, [px, pz], last.g + y, gp + y + 0.015, WIRE);
            }
          }
          last = { p: [px, pz], g: gp };
        }
      }
      counts.fences += 1;
      /* The washing, on a line across the back yard. */
      if (seeded(id, 30) < 0.6) {
        const v = -front * (b.d / 2 + 2.8);
        const a = F.at(-2.6, v, 0);
        const c = F.at(2.6, v - front * 0.6, 0);
        if (room.ok(a[0], a[2]) && room.ok(c[0], c[2])) {
          const ga = ground(a[0], a[2]);
          const gc = ground(c[0], c[2]);
          for (const [p, gp] of [[a, ga], [c, gc]]) {
            boxInto(props, p[0], p[2], dx, dz, 0.06, 0.06, gp - 0.1, gp + 1.9, WOOD);
          }
          strip(props, [a[0], a[2]], [c[0], c[2]], ga + 1.84, gc + 1.86, WIRE);
          const pieces = 3 + Math.floor(seeded(id, 31) * 3);
          for (let i = 0; i < pieces; i += 1) {
            const t0 = (i + 0.15) / pieces;
            const t1 = (i + 0.85) / pieces;
            const p0 = [a[0] + (c[0] - a[0]) * t0, a[2] + (c[2] - a[2]) * t0];
            const p1 = [a[0] + (c[0] - a[0]) * t1, a[2] + (c[2] - a[2]) * t1];
            const top = ga + (gc - ga) * ((t0 + t1) / 2) + 1.84;
            const drop = 0.5 + 0.4 * seeded(id, 32 + i);
            strip(props, p0, p1, top - drop, top, CLOTH[Math.floor(seeded(id, 40 + i) * CLOTH.length)]);
          }
          counts.washing += 1;
        }
      }
      /* The tank, by a back corner. */
      if (seeded(id, 50) < 0.5) {
        const side = seeded(id, 51) < 0.5 ? -1 : 1;
        const [tx, , tz] = F.at(side * (b.w / 2 + 1.8), -front * (b.d / 2 - 1.2), 0);
        if (room.ok(tx, tz, ROUTE_CLEAR, 1.2)) {
          tank(tx, tz, TANK[Math.floor(seeded(id, 52) * TANK.length)]);
        }
      }
      /* A motorcycle, out front by the veranda. */
      if (seeded(id, 60) < 0.5) {
        const [mx, , mz] = F.at((seeded(id, 61) - 0.5) * b.w * 0.6, front * (b.d / 2 + 1.7), 0);
        const a = (seeded(id, 62) - 0.5) * 1.2;
        const hx = dx * Math.cos(a) + dz * Math.sin(a);
        const hz = dz * Math.cos(a) - dx * Math.sin(a);
        if (room.ok(mx, mz, ROUTE_CLEAR, 0.6)) {
          motorcycle(mx, mz, hx, hz, MOTO[Math.floor(seeded(id, 63) * MOTO.length)]);
        }
      }
      /* The yard's trees: a mango behind, a palm at a front corner. */
      const trees = [
        [mango, F.at((seeded(id, 70) < 0.5 ? -1 : 1) * (b.w / 2 + 3.2), -front * (b.d / 2 + 5.2), 0), 0.85 + 0.3 * seeded(id, 71)],
        [palm, F.at((seeded(id, 72) < 0.5 ? -1 : 1) * (b.w / 2 + 2.2), front * (b.d / 2 + 2.6), 0), 7.5 + 2.5 * seeded(id, 73)],
      ];
      trees.forEach(([kind, [tx, , tz], size], k) => {
        if (seeded(id, 74 + k) < 0.75 && room.ok(tx, tz, TREE_CLEAR, 3)) {
          kind(tx, tz, size);
        }
      });
    }
    if (b.kind === 'school') {
      /* The flagpole, out front. */
      const [fx, , fz] = F.at(0, front * (b.d / 2 + 6), 0);
      if (room.ok(fx, fz)) {
        const gf = ground(fx, fz);
        boxInto(sink(fx, fz, 'kit'), fx, fz, dx, dz, 0.08, 0.08, gf - 0.2, gf + 7, [0.6, 0.6, 0.58]);
        post(fx, fz, gf - 0.2, gf + 7, 0.05);
      }
      const [tx, , tz] = F.at(b.w / 2 + 2, -front * (b.d / 2 - 1.2), 0);
      if (room.ok(tx, tz, ROUTE_CLEAR, 1.2)) {
        tank(tx, tz, TANK[2], 3.2);
      }
    }
    if (b.kind === 'store') {
      /* Crates stacked at one end: soft drinks' empties. */
      const props = sink(b.at[0], b.at[1], 'props');
      for (let i = 0; i < 5; i += 1) {
        const [cx, , cz] = F.at(b.w / 2 + 0.6, front * (b.d / 2 - 0.6 - 0.62 * (i % 3)), 0);
        if (!room.ok(cx, cz, ROUTE_CLEAR, 0.3)) {
          continue;
        }
        const level = i < 3 ? 0 : 1;
        const gc = ground(cx, cz);
        boxInto(props, cx, cz, dx, dz, 0.55, 0.55, gc + level * 0.32, gc + level * 0.32 + 0.3, i % 2 ? [0.4, 0.05, 0.03] : [0.05, 0.14, 0.05]);
      }
    }
  }

  /* THE PITCH, by the school: its lines painted on the grass, a goal at
   * each end. Its rectangle is places.js's pasture painting. */
  {
    /* places.js's rectangle, a metre and a half in from its edge. */
    const [ax, az] = gridToWorld(PITCH[0][0], PITCH[0][1]);
    const [bx, bz] = gridToWorld(PITCH[1][0], PITCH[1][1]);
    const x0 = Math.min(ax, bx) + 1.5;
    const x1 = Math.max(ax, bx) - 1.5;
    const z0 = Math.min(az, bz) + 1.5;
    const z1 = Math.max(az, bz) - 1.5;
    const xm = (x0 + x1) / 2;
    const zm = (z0 + z1) / 2;
    const marks = sink(xm, zm, 'marks');
    const line = (ax, az, bx, bz) => {
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(len / 3));
      const nx = (-(bz - az) / len) * 0.06;
      const nz = ((bx - ax) / len) * 0.06;
      for (let i = 0; i < n; i += 1) {
        const p = (t, side) => {
          const x = ax + (bx - ax) * t + nx * side;
          const z = az + (bz - az) * t + nz * side;
          return [x, ground(x, z) + 0.05, z];
        };
        upQuad(marks, p(i / n, 1), p((i + 1) / n, 1), p((i + 1) / n, -1), p(i / n, -1), LINE);
      }
    };
    /* The grass, mown in stripes across the pitch, worn bare in each
     * goal mouth: what reads of a pitch from a survey's range. */
    const stripes = 12;
    for (let i = 0; i < stripes; i += 1) {
      const xa = x0 - 1.5 + ((x1 - x0 + 3) * i) / stripes;
      const xb = x0 - 1.5 + ((x1 - x0 + 3) * (i + 1)) / stripes;
      const colour = i % 2 ? GRASS[0] : GRASS[1];
      for (let z = z0 - 1.5; z < z1 + 1.5 - 1e-6; z += 4) {
        const za = z;
        const zb = Math.min(z1 + 1.5, z + 4);
        const at = (x, zz) => [x, ground(x, zz) + 0.03, zz];
        upQuad(marks, at(xa, za), at(xb, za), at(xb, zb), at(xa, zb), colour);
      }
    }
    for (const xe of [x0, x1]) {
      const e = xe === x0 ? 1 : -1;
      const at = (x, zz) => [x, ground(x, zz) + 0.04, zz];
      upQuad(marks, at(xe, zm - 3.5), at(xe + e * 4, zm - 3.5), at(xe + e * 4, zm + 3.5), at(xe, zm + 3.5), WORN);
    }
    line(x0, z0, x1, z0);
    line(x1, z0, x1, z1);
    line(x1, z1, x0, z1);
    line(x0, z1, x0, z0);
    line(xm, z0, xm, z1);
    const n = 24;
    for (let k = 0; k < n; k += 1) {
      const a0 = (k / n) * Math.PI * 2;
      const a1 = ((k + 1) / n) * Math.PI * 2;
      line(xm + 6 * Math.cos(a0), zm + 6 * Math.sin(a0), xm + 6 * Math.cos(a1), zm + 6 * Math.sin(a1));
    }
    for (const [xe, e] of [[x0, 1], [x1, -1]]) {
      line(xe, zm - 7, xe + e * 6, zm - 7);
      line(xe + e * 6, zm - 7, xe + e * 6, zm + 7);
      line(xe + e * 6, zm + 7, xe, zm + 7);
      /* The goal: two posts and a bar, 5 m by 2 m. */
      const kit = sink(xe, zm, 'kit');
      const gz = [zm - 2.5, zm + 2.5].map((z) => ground(xe, z));
      for (const [k, z] of [[0, zm - 2.5], [1, zm + 2.5]]) {
        boxInto(kit, xe, z, 1, 0, 0.1, 0.1, gz[k] - 0.1, gz[k] + 2.0, LINE);
        post(xe, z, gz[k] - 0.1, gz[k] + 2.0, 0.06);
      }
      const top = Math.max(...gz) + 2.0;
      boxInto(kit, xe, zm, 0, 1, 5.1, 0.1, top - 0.1, top, LINE);
      box(xe, zm, 0, 1, 5.1, 0.1, top - 0.1, top);
    }
  }

  /* SECTOR ALPHA'S MACHINES, under and by the sheds. */
  {
    const shed1 = BUILDINGS.find((b) => b.id === 'alpha-shed-1');
    const shed2 = BUILDINGS.find((b) => b.id === 'alpha-shed-2');
    const machine = (x, z, hx, hz, parts, solids) => {
      const g = ground(x, z);
      const s = sink(x, z, 'kit');
      const F = frameOf(x, z, hx, hz);
      for (const [u, v, w, d, y0, y1, colour] of parts) {
        const [px, , pz] = F.at(u, v, 0);
        boxInto(s, px, pz, hx, hz, w, d, g + y0, g + y1, colour);
      }
      for (const [u, v, w, d, y0, y1] of solids) {
        const [px, , pz] = F.at(u, v, 0);
        box(px, pz, hx, hz, w, d, g + y0, g + y1);
      }
      counts.machines += 1;
    };
    const green = [0.04, 0.16, 0.03];
    const [sx, sz] = shed1.at;
    /* A tractor: hood, cab, big rear wheels, small front ones. */
    machine(sx - 8, sz, 1, 0, [
      [0.4, 0, 2.2, 1.0, 0.7, 1.55, green],
      [-0.85, 0, 1.2, 1.25, 1.45, 2.75, [0.05, 0.06, 0.07]],
      [-0.85, 0, 1.4, 1.4, 2.75, 2.85, [0.6, 0.6, 0.58]],
      [-0.85, -0.95, 1.5, 0.5, 0, 1.5, DARK],
      [-0.85, 0.95, 1.5, 0.5, 0, 1.5, DARK],
      [1.15, -0.78, 0.9, 0.3, 0, 0.9, DARK],
      [1.15, 0.78, 0.9, 0.3, 0, 0.9, DARK],
    ], [[-0.1, 0, 3.2, 2.4, 0, 1.55], [-0.85, 0, 1.4, 1.4, 1.55, 2.85]]);
    /* A grain trailer. */
    machine(sx + 4, sz + 0.5, 1, 0, [
      [0, 0, 4.2, 2.2, 0.9, 2.1, [0.32, 0.04, 0.02]],
      [-1.2, -0.95, 0.9, 0.3, 0, 0.9, DARK],
      [-1.2, 0.95, 0.9, 0.3, 0, 0.9, DARK],
      [1.0, -0.95, 0.9, 0.3, 0, 0.9, DARK],
      [1.0, 0.95, 0.9, 0.3, 0, 0.9, DARK],
      [2.7, 0, 1.2, 0.12, 0.55, 0.65, DARK],
    ], [[0.1, 0, 4.4, 2.2, 0, 2.1], [2.7, 0, 1.2, 0.3, 0.45, 0.75]]);
    /* A pickup beside the second shed. */
    const [px, pz] = shed2.at;
    machine(px + 9, pz - 3, 0, 1, [
      [0, 0, 4.9, 1.8, 0.45, 1.1, [0.6, 0.6, 0.58]],
      [0.55, 0, 1.6, 1.7, 1.1, 1.8, [0.08, 0.09, 0.1]],
      [-1.5, -0.8, 0.7, 0.24, 0, 0.7, DARK],
      [-1.5, 0.8, 0.7, 0.24, 0, 0.7, DARK],
      [1.55, -0.8, 0.7, 0.24, 0, 0.7, DARK],
      [1.55, 0.8, 0.7, 0.24, 0, 0.7, DARK],
    ], [[0, 0, 4.9, 1.85, 0, 1.1], [0.55, 0, 1.6, 1.7, 1.1, 1.8]]);
    /* The diesel tank, a drum on its side up on legs. */
    const tx = (sx + px) / 2 + 2;
    const tz = sz - 14;
    const gt = ground(tx, tz);
    const s = sink(tx, tz, 'kit');
    const n = 10;
    const r = 0.7;
    const yc = gt + 2.0;
    for (let k = 0; k < n; k += 1) {
      const a0 = (k / n) * Math.PI * 2;
      const a1 = ((k + 1) / n) * Math.PI * 2;
      const at = (a, x) => [x, yc + r * Math.sin(a), tz + r * Math.cos(a)];
      s.quad(at(a1, tx - 1.5), at(a0, tx - 1.5), at(a0, tx + 1.5), at(a1, tx + 1.5), [0.45, 0.42, 0.3]);
      s.tri([tx + 1.5, yc, tz], at(a1, tx + 1.5), at(a0, tx + 1.5), [0.45, 0.42, 0.3]);
      s.tri([tx - 1.5, yc, tz], at(a0, tx - 1.5), at(a1, tx - 1.5), [0.45, 0.42, 0.3]);
    }
    box(tx, tz, 1, 0, 3.0, 1.0, yc - 0.5, yc + 0.5);
    for (const [ox, oz] of [[-1.1, -0.4], [1.1, -0.4], [1.1, 0.4], [-1.1, 0.4]]) {
      boxInto(s, tx + ox, tz + oz, 1, 0, 0.12, 0.12, gt - 0.2, yc - 0.5, [0.2, 0.2, 0.2]);
      post(tx + ox, tz + oz, gt - 0.2, yc - 0.5, 0.07);
    }
    counts.machines += 1;
  }

  ico.dispose();
  return { stats: () => ({ yards: counts }) };
}
