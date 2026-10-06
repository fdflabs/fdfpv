/*
 * fixtures/world.js: A TEST FIXTURE, NOT THE MAP. A stand in for track
 * WORLD's two functions (docs/campaign/interior/CONTRACT-P0.md section 2)
 * until src/share/interior/canopy.js and routes.js land, so the room's
 * logic and its checks run now. A flat world at z 0: forests as discs of
 * crowns between two heights with round gaps in them, and routes as
 * polylines walked at a speed with dwells.
 *
 *   makeWorld({ forests, routes }) -> { canopyBlocks, poseOnRoute }
 *
 *   forests  [{ at: [x, y], r, base, top, gaps: [{ at: [x, y], r }] }]:
 *            crowns fill the disc from base to top metres, except over a
 *            gap
 *   routes   { id: { pts: [[x, y], ...], speed (m/s), dwell?: [{ i, s,
 *            action }], loop?: true, end?: 'gone' | 'stay', z? } }: walked
 *            from pts[0]; a dwell holds at point i for s seconds; a loop
 *            starts again at the end; otherwise the route is over at its
 *            end ('gone', the default: null from then) or stays there
 *
 * Both are pure and use no Math.sin, Math.cos or Math.pow (CLAUDE.md):
 * the room runs them. heading is Math.atan2's, for a screen to draw; the
 * room never reads it.
 *
 * Where the real ones plug in: src/share/ops/missions.js worldFor().
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

/* Crowns are tested this often along the part of a sight line that is
 * inside a forest's crown layer, metres. */
const STEP_M = 1;

/* The [lo, hi] of u in [0, 1] where a + u (b - a) is within r of c,
 * horizontally, or null. */
function discSpan(a, b, c, r) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const fx = a[0] - c[0];
  const fy = a[1] - c[1];
  const A = dx * dx + dy * dy;
  const B = 2 * (fx * dx + fy * dy);
  const C = fx * fx + fy * fy - r * r;
  if (A === 0) {
    return C <= 0 ? [0, 1] : null;
  }
  const disc = B * B - 4 * A * C;
  if (disc < 0) {
    return null;
  }
  const q = Math.sqrt(disc);
  const lo = Math.max(0, (-B - q) / (2 * A));
  const hi = Math.min(1, (-B + q) / (2 * A));
  return lo <= hi ? [lo, hi] : null;
}

/* The [lo, hi] of u where a + u (b - a) has z in [z0, z1], or null. */
function bandSpan(a, b, z0, z1) {
  const dz = b[2] - a[2];
  if (dz === 0) {
    return a[2] >= z0 && a[2] <= z1 ? [0, 1] : null;
  }
  const u0 = (z0 - a[2]) / dz;
  const u1 = (z1 - a[2]) / dz;
  const lo = Math.max(0, Math.min(u0, u1));
  const hi = Math.min(1, Math.max(u0, u1));
  return lo <= hi ? [lo, hi] : null;
}

/* Gaps are looked up in cells of this many metres, so a forest with
 * hundreds of them answers a sight line quickly. */
const CELL_M = 50;
const cellKey = (x, y) => `${Math.floor(x / CELL_M)},${Math.floor(y / CELL_M)}`;

function bucket(gaps) {
  const cells = new Map();
  for (const g of gaps ?? []) {
    for (let cx = Math.floor((g.at[0] - g.r) / CELL_M); cx <= Math.floor((g.at[0] + g.r) / CELL_M); cx += 1) {
      for (let cy = Math.floor((g.at[1] - g.r) / CELL_M); cy <= Math.floor((g.at[1] + g.r) / CELL_M); cy += 1) {
        const k = `${cx},${cy}`;
        cells.set(k, [...(cells.get(k) ?? []), g]);
      }
    }
  }
  return cells;
}

function inGap(cells, x, y) {
  return (cells.get(cellKey(x, y)) ?? []).some((g) => (x - g.at[0]) ** 2 + (y - g.at[1]) ** 2 <= g.r * g.r);
}

/* A route walked: its legs' lengths and when each starts, ms. */
function plan(route) {
  const legs = [];
  let t = 0;
  const dwellAt = new Map((route.dwell ?? []).map((d) => [d.i, d]));
  for (let i = 0; i < route.pts.length; i += 1) {
    const d = dwellAt.get(i);
    if (d) {
      legs.push({
        hold: true, i, t0: t, t1: t + d.s * 1000, action: d.action ?? 'stand',
      });
      t += d.s * 1000;
    }
    if (i < route.pts.length - 1) {
      const a = route.pts[i];
      const b = route.pts[i + 1];
      const len = Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2);
      const ms = (len / route.speed) * 1000;
      legs.push({
        hold: false, i, t0: t, t1: t + ms, action: 'walk',
      });
      t += ms;
    }
  }
  return { legs, total: t };
}

export function makeWorld({ forests = [], routes = {} }) {
  const plans = new Map(Object.entries(routes).map(([id, r]) => [id, plan(r)]));
  const cells = new Map(forests.map((f) => [f, bucket(f.gaps)]));

  function canopyBlocks(from, to) {
    for (const f of forests) {
      const d = discSpan(from, to, f.at, f.r);
      const z = d && bandSpan(from, to, f.base, f.top);
      if (!z) {
        continue;
      }
      const lo = Math.max(d[0], z[0]);
      const hi = Math.min(d[1], z[1]);
      if (lo > hi) {
        continue;
      }
      const len = Math.sqrt((to[0] - from[0]) ** 2 + (to[1] - from[1]) ** 2 + (to[2] - from[2]) ** 2) * (hi - lo);
      const n = Math.max(1, Math.ceil(len / STEP_M));
      for (let k = 0; k <= n; k += 1) {
        const u = lo + ((hi - lo) * k) / n;
        if (!inGap(cells.get(f), from[0] + u * (to[0] - from[0]), from[1] + u * (to[1] - from[1]))) {
          return true;
        }
      }
    }
    return false;
  }

  function poseOnRoute(routeId, ms) {
    const route = routes[routeId];
    if (!route) {
      throw new Error(`fixture world: no route ${routeId}`);
    }
    const { legs, total } = plans.get(routeId);
    let t = ms;
    if (route.loop && total > 0) {
      t = ((ms % total) + total) % total;
    } else if (t >= total) {
      if ((route.end ?? 'gone') === 'gone') {
        return null;
      }
      const p = route.pts.at(-1);
      return {
        x: p[0], y: p[1], z: route.z ?? 0, heading: 0, action: 'stand',
      };
    }
    t = Math.max(0, t);
    const leg = legs.find((l) => t < l.t1) ?? legs.at(-1);
    const a = route.pts[leg.i];
    if (leg.hold) {
      return {
        x: a[0], y: a[1], z: route.z ?? 0, heading: 0, action: leg.action,
      };
    }
    const b = route.pts[leg.i + 1];
    const u = leg.t1 > leg.t0 ? (t - leg.t0) / (leg.t1 - leg.t0) : 1;
    return {
      x: a[0] + u * (b[0] - a[0]), y: a[1] + u * (b[1] - a[1]), z: route.z ?? 0, heading: Math.atan2(b[1] - a[1], b[0] - a[0]), action: 'walk',
    };
  }

  return { canopyBlocks, poseOnRoute };
}
