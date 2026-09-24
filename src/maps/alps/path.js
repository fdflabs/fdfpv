/*
 * path.js: a polyline something travels, and the timetable it keeps.
 *
 * Everything that moves in the valley is a pure function of the clock:
 * position = path.at(schedule.at(t)). No integration, no state, so a
 * replay, the title loop and a capture that jumps the clock all see the
 * same bus at the same stop, and a dropped frame changes nothing. That
 * is the rule the brief sets for the step clock and it costs nothing to
 * keep on the wall clock too.
 *
 * No three.js in here on purpose: node runs it, so the timetable can be
 * checked for two vehicles meeting without a browser.
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

/*
 * A polyline of { x, z } or { x, y, z } points with its cumulative
 * distance. at(s) is the point s metres along it and the yaw a vehicle
 * nosed along +x turns to face that way, the convention ribbon.js uses;
 * y is interpolated when the points carry one. A closed path wraps and
 * its last point joins its first; an open path clamps.
 */
export function makePath(points, closed = false) {
  const pts = closed ? [...points, points[0]] : points;
  const dist = [0];
  for (let i = 1; i < pts.length; i += 1) {
    dist.push(dist[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z, (pts[i].y ?? 0) - (pts[i - 1].y ?? 0)));
  }
  const length = dist[dist.length - 1];
  const at = (s) => {
    let d = s;
    if (closed) {
      d = s % length;
      if (d < 0) {
        d += length;
      }
    } else {
      d = Math.max(0, Math.min(length, s));
    }
    /* Binary search: a cabin on a kilometre of cable asks this every frame. */
    let lo = 1;
    let hi = dist.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (dist[mid] < d) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    const a = pts[lo - 1];
    const b = pts[lo];
    const span = dist[lo] - dist[lo - 1];
    const u = span > 0 ? (d - dist[lo - 1]) / span : 0;
    return {
      x: a.x + (b.x - a.x) * u,
      y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * u,
      z: a.z + (b.z - a.z) * u,
      yaw: Math.atan2(-(b.z - a.z), b.x - a.x),
    };
  };
  return { points: pts, dist, length, closed, at };
}

/* An arc of a circle in the ground plane, as points from angle a0 to a1
 * about (cx, cz), for building a corner or a turning loop. */
export function arc(cx, cz, r, a0, a1, n = 8) {
  const out = [];
  for (let k = 0; k <= n; k += 1) {
    const a = a0 + (a1 - a0) * (k / n);
    out.push({ x: cx + r * Math.cos(a), z: cz + r * Math.sin(a) });
  }
  return out;
}

/*
 * A timetable along a path: legs of { to, speed } drive from wherever the
 * last leg ended to distance `to` at `speed`; with `ramp: true` the speed
 * changes evenly from the last leg's to `speed` over the leg instead, so
 * a bus brakes into a turn and pulls away from a stop rather than
 * stepping between speeds. { dwell } waits, standing. The whole thing
 * repeats with period `period`. at(t) is the distance along the path at
 * time t and the leg index it is on.
 */
export function makeSchedule(legs, start = 0) {
  const steps = [];
  let s = start;
  let t = 0;
  let v = 0;
  for (const leg of legs) {
    if (leg.dwell !== undefined) {
      steps.push({ t0: t, t1: t + leg.dwell, s0: s, v0: 0, a: 0 });
      t += leg.dwell;
      v = 0;
      continue;
    }
    const d = leg.to - s;
    const v0 = leg.ramp ? v : leg.speed;
    if (!(d > 0) || !(v0 + leg.speed > 0)) {
      throw new Error(`path: a leg to ${leg.to} from ${s} at ${v0} to ${leg.speed} m/s goes nowhere`);
    }
    const dt = (2 * d) / (v0 + leg.speed);
    steps.push({ t0: t, t1: t + dt, s0: s, v0, a: (leg.speed - v0) / dt });
    s = leg.to;
    t += dt;
    v = leg.speed;
  }
  const period = t;
  const at = (time) => {
    let u = time % period;
    if (u < 0) {
      u += period;
    }
    let i = 0;
    while (i < steps.length - 1 && steps[i].t1 <= u) {
      i += 1;
    }
    const st = steps[i];
    const tau = Math.min(u, st.t1) - st.t0;
    return { s: st.s0 + st.v0 * tau + 0.5 * st.a * tau * tau, leg: i };
  };
  return { period, steps, length: s, at };
}
