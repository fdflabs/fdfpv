/*
 * synthlap.js: a synthetic lap through a track document, for tests.
 *
 * From the timing gate, two metres out of every gate in flying order and
 * back through the timing gate, sampled at the ghost rate at a steady
 * speed and encoded with the real encoder. The splits and the lap time
 * are what the simulator's own detector measures when run over the same
 * path at a millisecond, not the waypoint times, because the detector has
 * rules a waypoint list does not know: a gate flown twice in a row is
 * scored the second time one step later, inside the slab.
 *
 * Used by scripts/lap-selftest.js here and by the board's selftest through
 * its pinned checkout of this repository, so both sides test the checker
 * against the same laps.
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

import { Race } from '../../src/game/race.js';
import { encodeGhost, GHOST_RATE_HZ } from '../../src/share/ghostdata.js';
import { raceFromDocument } from '../../src/game/verify.js';

function pointAt(pts, times, t) {
  let seg = 1;
  while (seg < pts.length - 1 && times[seg] < t) {
    seg += 1;
  }
  const a = pts[seg - 1];
  const b = pts[seg];
  const span = times[seg] - times[seg - 1];
  const u = span > 0 ? Math.min(1, Math.max(0, (t - times[seg - 1]) / span)) : 1;
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u };
}

/* Waypoints in flying order from the timing gate. opts.skip leaves out the
 * k-th gate after the start; opts.hoverAfterMs parks the craft past the
 * line for that long after the finish. */
function waypoints(race, opts) {
  const order = [];
  for (let k = 0; k < race.gates.length; k += 1) {
    order.push(race.gates[(race.timingIdx + k) % race.gates.length]);
  }
  const centre = (g) => ({ x: g.x, y: g.y + g.apertures[0].centreY, z: g.z });
  const along = (g, d) => {
    const c = centre(g);
    return { x: c.x + g.az.x * d, y: c.y + g.az.y * d, z: c.z + g.az.z * d };
  };
  const timing = order[0];
  const pts = [centre(timing), along(timing, 2)];
  for (let k = 1; k < order.length; k += 1) {
    if (opts.skip === k) {
      continue;
    }
    const g = order[k];
    pts.push(along(g, -2), centre(g), along(g, 2));
  }
  pts.push(along(timing, -2), centre(timing));
  if (opts.hoverAfterMs) {
    pts.push(along(timing, 2), { ...along(timing, 2), hold: opts.hoverAfterMs });
  }
  return pts;
}

function denseTruth(gates, trackClass, pts, times) {
  const truth = new Race(gates, trackClass);
  truth.next = truth.timingIdx;
  const end = times[times.length - 1];
  let prev = pointAt(pts, times, 0);
  const first = pointAt(pts, times, 1);
  const before = { x: 2 * prev.x - first.x, y: 2 * prev.y - first.y, z: 2 * prev.z - first.z };
  truth.update(before, prev, 0, 0);
  for (let t = 1; t <= end + 1; t += 1) {
    const curr = pointAt(pts, times, Math.min(t, end));
    truth.update(prev, curr, t, 0);
    prev = curr;
  }
  return { lapMs: truth.laps[0] ?? null, splits: truth.lastSplits.map((v) => Math.round(v)) };
}

/*
 * Returns { rateHz, durationMs, splits, count, pos, quat, lapMs, gates }:
 * the fields encodeGhost takes, plus the detector's lap time (null when the
 * path never closes a lap) and the gate count. opts: speed m/s (20), skip,
 * hoverAfterMs.
 */
export function syntheticLap(document, opts = {}) {
  const speed = opts.speed ?? 20;
  const course = raceFromDocument(document);
  const { gates } = course;
  const race = new Race(gates, course.trackClass);
  const pts = waypoints(race, opts);
  const times = [0];
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    times.push(times[i - 1] + (d / speed) * 1000 + (b.hold || 0));
  }
  const durationMs = times[times.length - 1];
  const truth = denseTruth(gates, course.trackClass, pts, times);
  const dt = 1000 / GHOST_RATE_HZ;
  const count = Math.floor(durationMs / dt) + 1;
  const pos = new Float32Array(count * 3);
  const quat = new Float32Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    const p = pointAt(pts, times, Math.min(i * dt, durationMs));
    pos[i * 3] = p.x;
    pos[i * 3 + 1] = p.y;
    pos[i * 3 + 2] = p.z;
    quat[i * 4 + 3] = 1;
  }
  return { rateHz: GHOST_RATE_HZ, durationMs, splits: truth.splits, count, pos, quat, lapMs: truth.lapMs, gates: gates.length };
}

/* The same lap as wire bytes, ready to post. */
export function syntheticLapBytes(document, opts = {}) {
  const lap = syntheticLap(document, opts);
  return { bytes: encodeGhost(lap), lapMs: lap.lapMs, durationMs: lap.durationMs, gates: lap.gates, lap };
}
