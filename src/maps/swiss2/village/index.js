/*
 * village/: what makes the photographic village lived in. The houses are
 * buildings/'s; this is what stands between them: the square's café and
 * flag and lanterns, its kerbs, drains and puddles, the market stall by
 * the churchyard, the street's lamps
 * and gutters, and round every house a garden with its beds, its washing,
 * its bicycles and its wood.
 *
 *   furnish(ctx)  alps/village.js calls it through the buildings hook,
 *                 into the village's own bake before it is merged, so all
 *                 of it is drawn by the village's meshes and costs no draw
 *   yards.js      between the houses: the trees, sheds, hedges, shrubs,
 *                 plots, parked cars and the ground under them, laid last
 *   people.js     the villagers and hikers, posed each frame
 *
 * Nothing here draws the village's rng: every choice is a house's own
 * number or a fixed seed of this file's, so the layout, the colliders
 * and every later draw of the rng are the cel village's.
 *
 * What stands in the way of the PostAuto is the one thing that must not
 * be got wrong: its loop round the fountain covers most of the square.
 * Its path is swept here (alps/routes.js's own), and nothing is put, and
 * nobody walks, within its reach.
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
import { frame, box, near, detail, blob as blobOf, notes } from '../buildings/parts.js';
import { postbusDetour } from '../../alps/routes.js';
import {
  bicycle, lampPost, poleLamp, flagpole, cafeSet, gardenTable, vegBed, washingLine, picketFence,
  woodRick, planter, noticeBoard, hikeSign, hydrant, postBox, drain, puddle, marketStall,
} from './pieces.js';
import { yards } from './yards.js';

/* The bus's half width with its mirrors, and the clear air kept past it. */
const BUS_REACH = 1.25 + 0.3 + 0.9;

/* Distance from p to the polyline pts. */
function toPolyline(pts, x, z) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
    best = Math.min(best, Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)));
  }
  return best;
}

/*
 * Furnish the village. ctx is alps/village.js's: the bake, the ground,
 * the colliders, the road, and where it put the square, the street, the
 * lanes, the bridge, the street's telegraph poles and the benches.
 * Returns what people.js needs: the square, its café chairs and benches,
 * and the test that keeps a figure out of the bus's way.
 */
export function furnish(ctx) {
  const { bake, onGround, villageY, colliders, road, valleyAxis, square, streetZ, bridgeX, lanes } = ctx;
  const built = notes(bake);
  const bus = postbusDetour(road, valleyAxis).path.points;
  const sq = {
    x0: square.x - square.w / 2, x1: square.x + square.w / 2, z0: square.z - square.d / 2, z1: square.z + square.d / 2,
  };
  const slabY = onGround(square.x, square.z) + 0.06;

  /* Everything a new thing must keep off, in the plan: the houses and
   * barns under their roofs, the road, the street, the lanes, the square
   * (unless it is meant to stand on it), the bus's sweep, and whatever
   * was put here before it. A box is { x, z, ry, hw, hd }; a thing
   * placed is taken as its circle's square. */
  const houseBoxes = built.houses.map((h) => {
    const ry = Math.atan2(-h.m.elements[2], h.m.elements[0]);
    return { x: h.at.x, z: h.at.z, ry, hw: h.ext.hw + 0.4, hd: h.ext.hd + 0.4, house: h };
  });
  const taken = [];
  const inBox = (b, x, z, r) => {
    const dx = x - b.x;
    const dz = z - b.z;
    const c = Math.cos(b.ry);
    const s = Math.sin(b.ry);
    return Math.abs(dx * c - dz * s) < b.hw + r && Math.abs(dx * s + dz * c) < b.hd + r;
  };
  const inHouse = (x, z, r, own = null) => houseBoxes.some((b) => b.house !== own && inBox(b, x, z, r));
  const onRoads = (x, z, r) => {
    if (Math.abs(x - (valleyAxis(z) + 55)) < 5 + r) {
      return true;
    }
    if (x > sq.x1 - 1 && x < bridgeX + 8 && Math.abs(z - streetZ) < 6.8 + r) {
      return true;
    }
    if (Math.abs(x - lanes.north) < 2.8 + r && z < streetZ && z > 30) {
      return true;
    }
    return Math.abs(x - lanes.south) < 2.8 + r && z > streetZ && z < 200;
  };
  const inSquare = (x, z, r) => x > sq.x0 - r - 0.5 && x < sq.x1 + r + 0.5 && z > sq.z0 - r - 0.5 && z < sq.z1 + r + 0.5;
  const busClear = (x, z, r) => toPolyline(bus, x, z) > BUS_REACH + r;
  const free = (x, z, r, { square: onSquare = false, own = null } = {}) => !inHouse(x, z, r, own)
    && busClear(x, z, r)
    && (onSquare || (!onRoads(x, z, r) && !inSquare(x, z, r)))
    && !taken.some((b) => inBox(b, x, z, r));
  const take = (x, z, r, ry = 0, hd = r) => taken.push({ x, z, ry, hw: r, hd });
  const houseY = (x, z) => villageY + onGround(x, z);
  /* A frame on the ground at (x, z), or on the square's slab. */
  const at = (x, z, ry, onSlab = false) => frame(bake, x, onSlab ? slabY : onGround(x, z), z, ry);
  const post = (kind, x, z, h, r) => colliders.addPost(kind, x, z, houseY(x, z), houseY(x, z) + h, r);

  /*
   * THE SQUARE. Its edge set with granite, the café outside the
   * Gasthof's east end where the bus's fillet leaves a corner free, a
   * lantern at each corner, the flag in the middle of the loop, planters
   * by the fountain, bicycles by the bakery, the notice board and the
   * hiking sign where the street comes in, a hydrant, the post box.
   */
  const edge = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 1.2));
    for (let k = 0; k < n; k += 1) {
      const x = x0 + (x1 - x0) * ((k + 0.5) / n);
      const z = z0 + (z1 - z0) * ((k + 0.5) / n);
      const ground = onGround(x, z);
      const top = Math.max(slabY, ground + 0.03) + 0.02;
      const low = Math.min(slabY, ground) - 0.25;
      /* Each stone set by hand: a few millimetres proud or sunk, a
       * little off the line. */
      const q = own2(x, z);
      bake.push(near('kerb'), box(len / n - 0.03, top - low + 0.012 * (q - 0.5), 0.28), x, (top + low) / 2, z, Math.atan2(-(z1 - z0), x1 - x0) + 0.012 * (own2(z, x) - 0.5));
    }
  };
  const streetHalf = 2.6;
  edge(sq.x0, sq.z0, sq.x1, sq.z0);
  edge(sq.x0, sq.z1, sq.x1, sq.z1);
  edge(sq.x0, sq.z0, sq.x0, sq.z1 - 3.5);
  edge(sq.x1, sq.z0, sq.x1, streetZ - streetHalf);
  edge(sq.x1, streetZ + streetHalf, sq.x1, sq.z1);

  let tables = 0;
  const chairs = [];
  for (const [dx, dz] of [[-6, 0], [-2.6, 0], [-6, 3.4], [-2.6, 3.4]]) {
    const x = sq.x1 + dx;
    const z = sq.z0 + 2.6 + dz;
    if (free(x, z, 1.35, { square: true })) {
      chairs.push(...cafeSet(at(x, z, own2(x, z) * 6, true), { chairs: 3, parasol: tables % 3 ? 'canvas' : 'canvasRed' }));
      tables += 1;
      take(x, z, 1.3);
      for (let k = 0; k < 4; k += 1) {
        const a = (k / 4) * Math.PI * 2;
        colliders.add('canopy', x, villageY + slabY + 2.75, z, x + Math.cos(a) * 1.1, villageY + slabY + 2.75, z + Math.sin(a) * 1.1, 0.3);
      }
      post('pole', x, z, 2.7, 0.04);
    }
  }
  const standing = [
    [(f) => lampPost(f), sq.x1 - 0.8, sq.z0 + 0.8, 0.3, 4.3, 0.12, 'pole'],
    [(f) => lampPost(f), sq.x1 - 0.8, sq.z1 - 0.8, 0.3, 4.3, 0.12, 'pole'],
    [(f) => lampPost(f), sq.x0 + 0.8, sq.z0 + 0.8, 0.3, 4.3, 0.12, 'pole'],
    [(f) => lampPost(f), sq.x0 + 0.8, sq.z1 - 0.8, 0.3, 4.3, 0.12, 'pole'],
    [(f) => flagpole(f, 8.5), square.x - 7.5, square.z - 5, 0.4, 9.2, 0.08, 'pole', -Math.PI / 2 + 0.35],
    [(f) => planter(f, 1.4, 'geranium', 'stone'), square.x - 1.5, square.z - 6.2, 0.8, 0, 0, null],
    [(f) => planter(f, 1.4, 'geraniumPink', 'stone'), square.x - 1.5, square.z + 6.2, 0.8, 0, 0, null],
    [(f) => noticeBoard(f), sq.x1 - 2.6, sq.z1 - 1.2, 0.9, 2.3, 0, 'board'],
    [(f) => hikeSign(f, [2.4, -0.3, 1.2]), sq.x0 + 2.6, sq.z1 - 2.2, 0.3, 2.7, 0.05, 'pole'],
    [(f) => hydrant(f), sq.x1 - 0.9, streetZ - 4.4, 0.25, 0.9, 0.12, 'pole'],
    [(f) => postBox(f), sq.x1 - 5.5, sq.z1 - 0.8, 0.3, 1.5, 0.15, 'pole'],
  ];
  for (const [build, x, z, r, h, pr, kind, ry = 0] of standing) {
    if (!free(x, z, r, { square: true })) {
      continue;
    }
    build(at(x, z, ry, inSquare(x, z, -1)));
    take(x, z, r);
    if (kind === 'pole') {
      post('pole', x, z, h, pr);
    } else if (kind === 'board') {
      const y = houseY(x, z);
      colliders.addBox('wall', x - 0.85, y, z - 0.1, x + 0.85, y + 2.4, z + 0.3);
    }
  }
  for (let k = 0; k < 4; k += 1) {
    const x = sq.x1 - 9.5 + k * 0.75;
    const z = sq.z1 - 1.4;
    if (free(x, z, 0.4, { square: true })) {
      bicycle(at(x, z, Math.PI / 2 + (own2(x, z) - 0.5) * 0.2, true));
      take(x, z, 0.35);
    }
  }
  /* Rain lies where the paving has settled: by the kerbs, round the
   * fountain's step, in the street's gutters. */
  for (const [x, z, r] of [[square.x + 6.5, square.z - 9, 0.9], [square.x - 9, square.z + 10, 1.3], [square.x + 12, square.z + 11.5, 0.7],
    [square.x - 13, square.z - 3, 0.8], [square.x + 3.5, square.z + 3.8, 0.5]]) {
    puddle(at(x, z, 0, true), r);
  }
  for (const [x, z] of [[sq.x1 - 0.6, streetZ - 2.2], [square.x - 3, square.z + 7.5], [square.x - 3, square.z - 7.5]]) {
    drain(at(x, z, 0, true));
  }
  /* The market stall in the lane between the square and the churchyard
   * wall, its front to the square, where the square-eye view sees it
   * between the flag and the café. The customers and the stallholder
   * are people.js's; `stall` tells them where it stands. Its colliders
   * are capsules, not a wall box: a wall is noted as a garden, and one
   * more garden moves hundreds of the forest's trees. */
  let stall = null;
  {
    const x = sq.x0 - 2.8;
    const z = sq.z0 + 1.2;
    if (free(x, z, 1.5)) {
      const ry = Math.PI / 2;
      marketStall(at(x, z, ry));
      take(x, z, 1.5);
      stall = { x, z, ry };
      const y = houseY(x, z);
      for (const dz of [-1.35, 1.35]) {
        post('pole', x - 0.6, z + dz, 2.35, 0.05);
        post('pole', x + 0.85, z + dz, 2.05, 0.05);
      }
      colliders.add('canopy', x + 0.12, y + 2.2, z - 1.45, x + 0.12, y + 2.2, z + 1.45, 0.75);
      colliders.add('obstacle', x, y + 0.55, z - 1.1, x, y + 0.55, z + 1.1, 0.55);
    }
  }

  /*
   * THE STREET. Kerbs of granite down both sides from the square to the
   * bridge, broken at the lanes' mouths; a drain in the gutter every
   * twenty five metres; puddles in the gutters; a lamp on its arm off
   * each telegraph pole in the village.
   */
  for (const side of [-1, 1]) {
    const z = streetZ + side * (streetHalf + 0.1);
    const laneX = side < 0 ? lanes.north : lanes.south;
    for (let x = sq.x1 + 1; x < bridgeX - 7; x += 2) {
      if (Math.abs(x + 1 - laneX) < 3.5) {
        continue;
      }
      const g = onGround(x + 1, z);
      bake.push(near('kerb'), box(1.98, 0.3 + 0.012 * (own2(x, z) - 0.5), 0.2), x + 1, g - 0.02, z, 0.01 * (own2(z, x) - 0.5));
    }
    for (let x = sq.x1 + 12; x < bridgeX - 10; x += 25) {
      if (Math.abs(x - laneX) > 4) {
        drain(at(x, z - side * 0.4, 0));
      }
    }
  }
  for (const [x, z, r] of [[-150, streetZ + 2.1, 0.8], [-121, streetZ - 2.0, 1.1], [-95, streetZ + 2.2, 0.7], [-66, streetZ - 2.1, 0.9]]) {
    puddle(at(x, z, own2(x, z) * 3), r);
  }
  for (const p of ctx.streetPoles) {
    if (p.x < sq.x1 + 25 || p.x > bridgeX - 5) {
      continue;
    }
    poleLamp(at(p.x, p.z, 0), 6.2);
  }

  /*
   * THE GARDENS. Each house keeps the ground behind it fenced: beds of
   * vegetables in rows, the washing out on its line, wood stacked by the
   * gable, a table on the other side, a border of flowers along the
   * front, a gravel path from the door to the street and the bicycles
   * by it. What a house has is its own number's choice, and a thing that
   * would stand on a road, in another house or in the bus's way is left
   * out.
   */
  for (const h of built.houses.filter((b) => b.garden)) {
    const m = h.m;
    const ry = Math.atan2(-m.elements[2], m.elements[0]);
    const local = (lx, lz) => new THREE.Vector3(lx, 0, lz).applyMatrix4(m);
    const hash = (salt) => {
      const v = Math.sin(h.at.x * 12.9898 + h.at.z * 78.233 + salt * 37.719) * 43758.5453;
      return v - Math.floor(v);
    };
    const hw = h.ext.hw;
    const hd = h.ext.hd;
    const put = (lx, lz, lry, r, build, collider, own = null) => {
      const p = local(lx, lz);
      if (!free(p.x, p.z, r, { own })) {
        return false;
      }
      build(at(p.x, p.z, ry + lry));
      take(p.x, p.z, r);
      if (collider) {
        collider(p);
      }
      return true;
    };
    const low = (hx, hz, top) => (p) => {
      const y = houseY(p.x, p.z);
      colliders.addBox('wall', p.x - hx, y, p.z - hz, p.x + hx, y + top, p.z + hz);
    };

    /* The plot behind the house: as deep as the ground allows, up to
     * eight metres, all of it clear. */
    const gz = Math.min(hd - 0.6, 6.5);
    const x0 = -(hw + 0.3);
    let depth = 0;
    for (const want of [8, 6, 4.5]) {
      let ok = true;
      for (let u = 0; u <= want && ok; u += 1.5) {
        for (const z of [-gz, 0, gz]) {
          const p = local(x0 - u, z);
          ok = ok && free(p.x, p.z, 0.4, { own: h });
        }
      }
      if (ok) {
        depth = want;
        break;
      }
    }
    if (depth > 0) {
      const mid = local(x0 - depth / 2, 0);
      take(mid.x, mid.z, depth / 2 + 0.3, ry, gz + 0.3);
      const x1 = x0 - depth;
      const fenceKey = hash(10) < 0.6 ? 'fenceWhite' : 'fence';
      picketFence(at(local(x1, 0).x, local(x1, 0).z, ry + Math.PI / 2), 2 * gz, fenceKey);
      for (const s of [-1, 1]) {
        const p = local(x0 - depth / 2, s * gz);
        picketFence(at(p.x, p.z, ry), depth, fenceKey);
      }
      /* Beds along the plot, the washing across its far end or the
       * wood; which is the house's own choice. */
      const beds = depth >= 6 ? 3 : 2;
      const bedL = Math.min(2 * gz - 1.2, 4.2);
      for (let k = 0; k < beds; k += 1) {
        if (hash(20 + k) < 0.8) {
          const p = local(x0 - 1.2 - k * 1.6, -gz + 0.6 + bedL / 2);
          vegBed(at(p.x, p.z, ry + Math.PI / 2), bedL, 1.1);
          const y = houseY(p.x, p.z);
          colliders.addBox('wall', p.x - 1.2, y, p.z - 1.2, p.x + 1.2, y + 0.28, p.z + 1.2);
        }
      }
      if (hash(4) < 0.7) {
        const p = local(x1 + 1.2, gz * 0.35);
        const len = Math.min(2 * gz * 0.6, 4.2);
        washingLine(at(p.x, p.z, ry + Math.PI / 2), len);
        const c = Math.cos(ry + Math.PI / 2);
        const sn = Math.sin(ry + Math.PI / 2);
        for (const e of [-len / 2, len / 2]) {
          post('pole', p.x + e * c, p.z - e * sn, 1.9, 0.05);
        }
      } else {
        const p = local(x1 + 0.8, gz * 0.4);
        woodRick(at(p.x, p.z, ry - Math.PI / 2), 2.4);
      }
    }

    /* Beside the gables: the table on one side, the wood on the other. */
    if (hash(6) < 0.7) {
      put(h.w * 0.15, hd + 1.9, (hash(11) - 0.5) * 0.4, 1.2, (f) => gardenTable(f), null);
    }
    if (hash(7) < 0.6) {
      put(-h.w * 0.2, -(hd + 1.0), 0, 1.4, (f) => woodRick(f, 2.4), low(1.3, 0.35, 1.25));
    }

    /* The front: a border of flowers along the wall either side of the
     * door and the bench, and bicycles leant by the door. */
    const front = h.w / 2 + 0.8;
    for (let z = -h.d / 2 + 0.6; z < h.d / 2 - 0.6; z += 0.5) {
      if (Math.abs(z - h.door) < 1.0 || Math.abs(z - h.bench) < 1.0 || hash(30) < 0.25) {
        continue;
      }
      const p = local(front, z);
      const f = at(p.x, p.z, ry);
      const q = own2(p.x, p.z);
      f.put(detail('leaf'), blobOf(), 0, 0.12, 0, q * 5, 0, 0, 0.26, 0.2, 0.3);
      f.put(detail(q < 0.5 ? 'geranium' : q < 0.75 ? 'rose' : 'clothYellow'), blobOf(), 0.05, 0.28, 0.1 - 0.2 * q, q, 0.4, 0, 0.1, 0.08, 0.1);
      f.put(detail(q < 0.3 ? 'roseWhite' : 'geraniumPink'), blobOf(), -0.05, 0.25, -0.12 + 0.2 * q, q * 3, 0, 0, 0.08, 0.07, 0.08);
    }
    if (hash(8) < 0.7) {
      const n = hash(9) < 0.5 ? 1 : 2;
      for (let k = 0; k < n; k += 1) {
        put(h.w / 2 + 0.75 + k * 0.12, h.door - 1.6 - k * 0.75, Math.PI / 2 + 0.06 * k, 0.3, (f) => bicycle(f), null, h);
      }
    }
    /* The path from the door, a metre of gravel at a time, to the road
     * it meets within fifteen metres; none if it meets none. */
    const run = [];
    for (let u = h.w / 2 + 0.6; u < h.w / 2 + 16; u += 1) {
      const p = local(u + 0.5, h.door);
      if (onRoads(p.x, p.z, -0.8)) {
        break;
      }
      run.push(p);
    }
    const end = local(h.w / 2 + 0.6 + run.length + 0.5, h.door);
    if (run.length && onRoads(end.x, end.z, -0.8)) {
      for (const p of run) {
        bake.push('pathGravel', box(1.02, 0.06, 1.1), p.x, onGround(p.x, p.z) + 0.01, p.z, ry);
      }
      /* The front yard's fence along the road, the gate left open where
       * the path goes through. */
      const fx = h.w / 2 + 0.6 + run.length - 0.6;
      if (fx > hw + 0.5 && hash(12) < 0.75) {
        const fenceKey = hash(10) < 0.6 ? 'fenceWhite' : 'fence';
        for (const [z0, z1] of [[-h.d / 2 - 1, h.door - 0.7], [h.door + 0.7, h.d / 2 + 1]]) {
          const len = z1 - z0;
          const p = local(fx, (z0 + z1) / 2);
          let clear = len > 1;
          for (let z = z0; z <= z1 && clear; z += 1) {
            const q = local(fx, z);
            clear = !inHouse(q.x, q.z, 0.1, h) && !onRoads(q.x, q.z, 0.2) && !inSquare(q.x, q.z, 0.1) && busClear(q.x, q.z, 0.1);
          }
          if (clear) {
            picketFence(at(p.x, p.z, ry + Math.PI / 2), len, fenceKey);
          }
        }
      }
    }
  }

  /* THE YARDS, last, so nothing above moves (village/yards.js). */
  const yard = yards({
    houses: built.houses, at, houseY, free, take, onRoads, inSquare,
  });

  return {
    square,
    villageY,
    slabY,
    chairs,
    benches: ctx.benches,
    stall,
    busClear,
    yards: yard,
  };
}

/* A number in [0, 1) that is a spot's own. */
function own2(x, z) {
  const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return v - Math.floor(v);
}
