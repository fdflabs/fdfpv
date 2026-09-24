/*
 * routes.js: where the traffic drives, as polylines with marks, and the
 * surface under it.
 *
 * No three.js in here, the same as path.js and for the same reason: a
 * route is a list of numbers, and node can lay the bus's loop out and
 * measure it against the square without a browser.
 *
 * The village hands back only the road, so where it put the street, the
 * bridge, the square, its fountain and the bus shelter is mirrored here
 * from village.js. If one moves there it has to move here too: nothing
 * but a look at the square will say that it did not.
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

import { arc, makePath } from './path.js';
import { streamX } from './terrain.js';

/* Lane centres off the road's and the street's centre lines. Traffic
 * keeps right. */
const ROAD_LANE = 1.7;
const ROAD_W = 6.5;
const STREET_LANE = 1.25;

/* From village.js: the street's line, its width and the ribbons' lift,
 * the square, the fountain in it, the shelter by the square's east edge,
 * the bridge's arch and ramps. */
export const STREET_Z = 115;
const STREET_W = 5;
const LIFT = 0.06;
const SQUARE = { x: -190, z: 115, w: 34, d: 30 };
const FOUNTAIN = { x: SQUARE.x + 2, z: SQUARE.z };
const SHELTER = { x: SQUARE.x + SQUARE.w / 2 + 7, z: STREET_Z + 6.5 };
const BRIDGE = { foot: 4.4, ramp: 7, deckY: 1.05, siteHW: 6, siteHD: 3 };

/* A straight run from a to b as points every `step` metres, a included,
 * b not, so runs and arcs chain without doubling a point. */
function run(a, b, step = 2) {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step));
  const out = [];
  for (let k = 0; k < n; k += 1) {
    out.push({ x: a.x + (b.x - a.x) * (k / n), z: a.z + (b.z - a.z) * (k / n) });
  }
  return out;
}

/* An arc as points about every two metres, both ends included. */
function bend(cx, cz, r, a0, a1) {
  return arc(cx, cz, r, a0, a1, Math.max(2, Math.ceil((Math.abs(a1 - a0) * r) / 2)));
}

/*
 * The ground a wheel meets at (x, z): the road ribbon where it is, the
 * street's, the bridge's deck and ramps, the square's cobbles, and the
 * terrain everywhere else. The ribbons are drawn from vertices tens of
 * metres apart, so between them the asphalt is a straight chord over
 * ground that sags, by half a metre on the road: a car stood on the
 * terrain sinks into it. This reads the chord.
 */
export function makeSurface(road, heightAt, valleyAxis) {
  const rp = road.points;
  const half = ROAD_W / 2;
  /* The road's four vertex heights per segment, as ribbon.js lays them:
   * offset along each vertex's averaged tangent. */
  const edge = rp.map((p, i) => {
    const a = rp[Math.max(0, i - 1)];
    const b = rp[Math.min(rp.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const nx = -(b.z - a.z) / len;
    const nz = (b.x - a.x) / len;
    return {
      l: heightAt(p.x - nx * half, p.z - nz * half) + LIFT,
      r: heightAt(p.x + nx * half, p.z + nz * half) + LIFT,
    };
  });
  const roadY = (x, z) => {
    if (z < rp[0].z || z > rp[rp.length - 1].z) {
      return -Infinity;
    }
    let lo = 1;
    let hi = rp.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (rp[mid].z < z) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    const a = rp[lo - 1];
    const b = rp[lo];
    const u = (z - a.z) / (b.z - a.z || 1);
    const cx = a.x + (b.x - a.x) * u;
    const w = (x - cx) / half;
    if (Math.abs(w) > 1) {
      return -Infinity;
    }
    const f = (w + 1) / 2;
    const ya = edge[lo - 1].l + (edge[lo - 1].r - edge[lo - 1].l) * f;
    const yb = edge[lo].l + (edge[lo].r - edge[lo].l) * f;
    return ya + (yb - ya) * u;
  };
  /* The street is laid as village.js lays it: ten metre vertices from the
   * road to the bridge's east toe and from its west toe to the square. */
  const bx = streamX(STREET_Z);
  const reach = BRIDGE.foot + BRIDGE.ramp;
  const roadX = valleyAxis(STREET_Z) + 55;
  const squareEast = SQUARE.x + SQUARE.w / 2;
  const runs = [[roadX, bx + reach + 0.1], [bx - reach - 0.1, squareEast + 0.1]];
  const streetY = (x, z) => {
    if (Math.abs(z - STREET_Z) > STREET_W / 2) {
      return -Infinity;
    }
    for (const [x0, x1] of runs) {
      if (x > x0 || x < x1) {
        continue;
      }
      const n = Math.max(1, Math.round(Math.abs(x1 - x0) / 10));
      const step = (x1 - x0) / n;
      const k = Math.min(n - 1, Math.floor((x - x0) / step));
      const xa = x0 + k * step;
      const u = (x - xa) / step;
      const f = (z - (STREET_Z - STREET_W / 2)) / STREET_W;
      const at = (px) => {
        const l = heightAt(px, STREET_Z - STREET_W / 2);
        return l + (heightAt(px, STREET_Z + STREET_W / 2) - l) * f + LIFT;
      };
      return at(xa) + (at(xa + step) - at(xa)) * u;
    }
    return -Infinity;
  };
  /* The bridge stands on the highest ground under its site, the way
   * village.js's placer stands every building. */
  const site = [[1, 1], [1, -1], [-1, 1], [-1, -1], [0, 0]].map(([sx, sz]) => heightAt(bx + sx * BRIDGE.siteHW, STREET_Z + sz * BRIDGE.siteHD));
  const bridgeBase = Math.max(...site);
  const bridgeY = (x, z) => {
    const d = Math.abs(x - bx);
    if (d > reach || Math.abs(z - STREET_Z) > STREET_W / 2) {
      return -Infinity;
    }
    if (d <= BRIDGE.foot) {
      return bridgeBase + BRIDGE.deckY + 0.05;
    }
    return bridgeBase + BRIDGE.deckY * ((reach - d) / BRIDGE.ramp);
  };
  const cobbles = heightAt(SQUARE.x, SQUARE.z) + 0.06;
  const squareY = (x, z) => (Math.abs(x - SQUARE.x) <= SQUARE.w / 2 && Math.abs(z - SQUARE.z) <= SQUARE.d / 2 ? cobbles : -Infinity);
  return (x, z) => Math.max(heightAt(x, z), roadY(x, z), streetY(x, z), bridgeY(x, z), squareY(x, z));
}

/* Where a distance along the road lands in a lane: +1 keeps right going
 * down the valley (south), -1 coming up it. */
export function laneAt(road, s, dir) {
  const d = road.dist;
  const total = d[d.length - 1];
  const t = Math.max(0, Math.min(total, s));
  let i = 1;
  while (i < d.length - 1 && d[i] < t) {
    i += 1;
  }
  const a = road.points[i - 1];
  const b = road.points[i];
  const u = (t - d[i - 1]) / (d[i] - d[i - 1]);
  const len = d[i] - d[i - 1];
  const tx = (b.x - a.x) / len;
  const tz = (b.z - a.z) / len;
  /* Right of travel down the valley is (-tz, tx) in x and z. */
  return {
    x: a.x + (b.x - a.x) * u - tz * ROAD_LANE * dir,
    z: a.z + (b.z - a.z) * u + tx * ROAD_LANE * dir,
    yaw: Math.atan2(-tz * dir, tx * dir),
  };
}

/*
 * The PostAuto's detour, in lane coordinates: off the southbound lane
 * with a right turn into the street, west along it over the bridge to
 * the square, once round the fountain the way a bus turns round in a
 * square (anticlockwise on the map, keeping right), back out east to the
 * shelter, and a right turn onto the southbound lane again. The detour
 * leaves the road at road distance sIn and rejoins it at sOut, on the
 * lane exactly, so the timetable can hand the bus from the road to this
 * path and back without a jump. Marks are distances along the path.
 */
export function postbusDetour(road, valleyAxis, {
  turnR = 8.5, loopR = 12.2, filletR = 14, loopX = -7, runIn = 30, runOut = 30,
} = {}) {
  const pts = [];
  const marks = {};
  const mark = (name) => {
    marks[name] = pts.length - 1;
  };
  const zW = STREET_Z - STREET_LANE;
  const zE = STREET_Z + STREET_LANE;
  /* The road segment the junction is on, and its lane line. */
  const rp = road.points;
  let i = 1;
  while (rp[i].z < STREET_Z) {
    i += 1;
  }
  const A = rp[i - 1];
  const B = rp[i];
  const len = Math.hypot(B.x - A.x, B.z - A.z);
  const t = { x: (B.x - A.x) / len, z: (B.z - A.z) / len };
  const right = { x: -t.z, z: t.x };
  const lane0 = { x: A.x + right.x * ROAD_LANE, z: A.z + right.z * ROAD_LANE };
  /* A fillet centre R to the right of the lane line and at z0: solve for
   * the distance along the line. */
  const onLane = (zc, R) => {
    const u = (zc - lane0.z - right.z * R) / t.z;
    return { u, c: { x: lane0.x + t.x * u + right.x * R, z: zc } };
  };
  const dA = road.dist[i - 1];
  const lanePt = (u) => ({ x: lane0.x + t.x * u, z: lane0.z + t.z * u });
  const heading = Math.atan2(-right.z, -right.x);
  /* Chaining: a run holds its start and not its end, a bend holds both,
   * so each piece after a bend drops its first point. */
  const add = (list, name) => {
    const tail = pts[pts.length - 1];
    const head = list[0];
    pts.push(...(tail && Math.hypot(head.x - tail.x, head.z - tail.z) < 1e-6 ? list.slice(1) : list));
    if (name) {
      mark(name);
    }
  };

  /* In: down the lane, then a right turn swung wide onto the street's
   * south half, the way a bus takes a village street: a turn tight
   * enough to hold the north lane would sweep the place name board on
   * the junction's inside corner. Then it eases over to the north lane. */
  const fin = onLane(zE - turnR, turnR);
  const sIn = dA + fin.u - runIn;
  add(run(lanePt(fin.u - runIn), lanePt(fin.u)), 'turnIn');
  add(bend(fin.c.x, fin.c.z, turnR, heading, Math.PI / 2), 'street');
  const x0 = fin.c.x;
  for (let k = 1; k <= 12; k += 1) {
    const f = k / 12;
    add([{ x: x0 - 2 * k, z: zE - (zE - zW) * f * f * (3 - 2 * f) }]);
  }

  /* The loop: a circle round the fountain and the west benches, its
   * centre loopX west of the fountain so the east benches stand clear
   * of the fillets that join it to each lane, turning the other way.
   * |F - C| = loopR + filletR puts a fillet tangent to the circle. The
   * defaults are the ones that keep the bus, mirrors included, at least
   * thirty centimetres off every bench, the fountain, the Gasthof and
   * the place name board, measured by sweeping its footprint along the
   * path. */
  const C = { x: FOUNTAIN.x + loopX, z: FOUNTAIN.z };
  const F1 = { x: C.x + Math.sqrt((loopR + filletR) ** 2 - (zW - filletR - C.z) ** 2), z: zW - filletR };
  const F2 = { x: C.x + Math.sqrt((loopR + filletR) ** 2 - (zE + filletR - C.z) ** 2), z: zE + filletR };
  add(run(pts[pts.length - 1], { x: F1.x, z: zW }), 'square');
  const a1 = Math.atan2(C.z - F1.z, C.x - F1.x);
  const a2 = Math.atan2(C.z - F2.z, C.x - F2.x);
  add(bend(F1.x, F1.z, filletR, Math.PI / 2, a1));
  add(bend(C.x, C.z, loopR, a1 - Math.PI, a2 - Math.PI));
  add(bend(F2.x, F2.z, filletR, a2 + 2 * Math.PI, 3 * Math.PI / 2), 'unloop');

  /* Out: east along the south lane past the shelter, then a right turn
   * onto the southbound lane and a run down it. */
  const fout = onLane(zE + turnR, turnR);
  const east = run(pts[pts.length - 1], { x: fout.c.x, z: zE });
  /* The stop: the middle door, 0.7 m behind the bus's centre, at the
   * shelter. */
  const stop = SHELTER.x + 0.7;
  for (let k = 1; k < east.length; k += 1) {
    if (marks.shelter === undefined && east[k].x > stop) {
      add([{ x: stop, z: zE }], 'shelter');
    }
    add([east[k]]);
  }
  mark('turnOut');
  add(bend(fout.c.x, fout.c.z, turnR, -Math.PI / 2, heading), 'lane');
  add([...run(lanePt(fout.u), lanePt(fout.u + runOut)), lanePt(fout.u + runOut)]);
  const sOut = dA + fout.u + runOut;
  const path = makePath(pts, false);
  const at = {};
  for (const name of Object.keys(marks)) {
    at[name] = path.dist[marks[name]];
  }
  return { path, marks: at, sIn, sOut };
}
