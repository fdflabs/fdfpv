/*
 * fixtures/interior-1.js: A TEST FIXTURE, NOT THE MAP. Mission 1's
 * corridor as the fixture world draws it (fixtures/world.js: flat ground,
 * a forest of discs with gaps, polyline routes), on MISSIONS.md 1.9's
 * design grid, so the room's checks fly The Old War before track WORLD's
 * map, canopy and routes exist. Every route id the mission asks for is
 * here (src/share/interior/missions/interior-1.js lists them); the shapes
 * are a stand in and WORLD's replace them at src/share/ops/missions.js.
 *
 * The pair walks at 1.3 m/s (MISSIONS.md M1, stage 4).
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

import { makeWorld } from './world.js';
import { G } from '../../interior/missions/interior-1.js';

const WALK = 1.3;
const CAMP = G(11.9, 10.5);
const EDGE = G(11.85, 10.38);
/* The pair's second walker keeps 3 m east of the first. */
const beside = (pts) => pts.map(([x, y]) => [x + 3, y]);

const CONCEAL = {
  west: [G(10.8, 9.1), G(10.95, 9.45), G(11.3, 9.8), G(11.55, 10.15), EDGE],
  mid: [G(10.8, 9.1), G(11.05, 9.4), G(11.3, 9.8), G(11.6, 10.05), EDGE],
  east: [G(10.8, 9.1), G(11.15, 9.3), G(11.3, 9.8), G(11.7, 10.0), EDGE],
};
/* Each route's alternate reacquisition point: the cañada (west, east) or
 * a second path crossing (mid). */
const ALT = { west: G(12.0, 9.8), mid: G(11.5, 10.2), east: G(12.05, 9.9) };
const OUT = {
  n: [0, 1], e: [1, 0], s: [0, -1], w: [-1, 0],
};
const OUT_M = 300;

/* A camp person's loop: a square of side 2r about an offset from the
 * camp's centre, with a dwell at its first corner. */
function loop(dx, dy, r) {
  const [x, y] = [CAMP[0] + dx, CAMP[1] + dy];
  return {
    pts: [[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r], [x - r, y - r]], speed: 0.6, loop: true, dwell: [{ i: 0, s: 20, action: 'sit' }],
  };
}
const LOOPS = {
  'camp-look': [0, 55, 3],
  'camp-tarp': [-15, -5, 8],
  'camp-up': [10, 10, 12],
  'camp-mast': [-12, 25, 6],
  'camp-moto-1': [25, -20, 10],
  'camp-moto-2': [-25, -20, 10],
  'camp-1': [5, -10, 15],
  'camp-2': [-5, 15, 20],
};

const routes = {
  'bravo-moto': { pts: [G(7.0, 7.91), G(9.6, 10.04)], speed: 12 },
  'camp-tarp-move': { pts: [[CAMP[0] - 15, CAMP[1] - 5], [CAMP[0] - 12, CAMP[1] - 1]], speed: 0.5, end: 'stay' },
};
for (const [k, pts] of Object.entries(CONCEAL)) {
  const dwell = [{ i: 2, s: 15, action: 'stand' }];
  routes[`conceal-${k}-a`] = {
    pts, speed: WALK, end: 'stay', dwell,
  };
  routes[`conceal-${k}-b`] = {
    pts: beside(pts), speed: WALK, end: 'stay', dwell,
  };
  routes[`conceal-${k}-alt-a`] = { pts: [ALT[k], EDGE], speed: WALK, end: 'stay' };
  routes[`conceal-${k}-alt-b`] = { pts: beside([ALT[k], EDGE]), speed: WALK, end: 'stay' };
}
for (const [id, [dx, dy, r]] of Object.entries(LOOPS)) {
  routes[`camp-${id}-loop`] = loop(dx, dy, r);
}
const ends = [];
for (const [d, [ux, uy]] of Object.entries(OUT)) {
  for (const [k, side] of [['a', -4], ['b', 4]]) {
    const end = [CAMP[0] + ux * OUT_M + uy * side, CAMP[1] + uy * OUT_M + ux * side];
    routes[`out-${d}-${k}`] = { pts: [[CAMP[0] + uy * side, CAMP[1] + ux * side], end], speed: 1.2 };
    ends.push({ at: end, r: 25 });
  }
}
for (const k of ['a', 'b']) {
  const x = EDGE[0] + (k === 'a' ? -3 : 3);
  routes[`pair-out-${k}`] = { pts: [[x, EDGE[1]], [x - 250, EDGE[1] + 150]], speed: 1.2 };
  ends.push({ at: [x - 250, EDGE[1] + 150], r: 25 });
}

/* Monte Cerrado: one wide disc of crowns north of the corridor, with the
 * camp's clearing, the narrow opening, a gap at each alternate point and
 * at each route's middle bend, and one where each dispersal route ends. */
/* The dappled canopy along each concealment route: a small gap every
 * DAPPLE_M, so a pilot overhead glimpses the pair more often than the
 * hard threshold (MISSIONS.md M1: reacquisition through gaps). */
const DAPPLE_M = 40;
function dapple(pts) {
  const out = [];
  for (let i = 0; i + 1 < pts.length; i += 1) {
    const [a, b] = [pts[i], pts[i + 1]];
    const len = Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2);
    for (let d = 0; d < len; d += DAPPLE_M) {
      out.push({ at: [a[0] + ((b[0] - a[0]) * d) / len + 1.5, a[1] + ((b[1] - a[1]) * d) / len], r: 12 });
    }
  }
  return out;
}

const gaps = [
  { at: CAMP, r: 70 },
  ...Object.values(CONCEAL).flatMap(dapple),
  ...Object.values(ALT).flatMap((at) => dapple([at, EDGE])),
  { at: G(11.3, 9.8), r: 30 },
  ...Object.values(ALT).map((at) => ({ at, r: 30 })),
  ...Object.values(CONCEAL).map((pts) => ({ at: pts[3], r: 25 })),
  ...ends,
];

export const WORLD = makeWorld({
  forests: [{
    at: G(11.6, 10.5), r: 1300, base: 5, top: 20, gaps,
  }],
  routes,
});
