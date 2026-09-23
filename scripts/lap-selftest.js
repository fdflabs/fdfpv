/*
 * lap-selftest.js: the headless lap check against laps it must accept and
 * laps it must refuse.
 *
 * A synthetic lap is threaded through the reference course: from the timing
 * gate, two metres out of every gate in flying order, back through the
 * timing gate, sampled at the ghost rate at a steady speed and encoded with
 * the real encoder. Then the same lap is broken one way at a time, and each
 * break must be refused for the reason the check names. Run with
 * npm run lap:selftest.
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

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { courseFromDocument } from '../src/game/trackdoc.js';
import { Race } from '../src/game/race.js';
import { encodeGhost, GHOST_RATE_HZ } from '../src/share/ghostdata.js';
import { checkLap, gatesFromCourse, LAP_TOLERANCE_MS } from '../src/game/verify.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const doc = JSON.parse(await readFile(join(root, 'tests/fixtures/course-reference.json'), 'utf8'));

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

/* Waypoints in flying order from the timing gate: on the line, then two
 * metres past each gate and two metres before the next, then on the line. */
function waypoints(gates, race, opts = {}) {
  const order = [];
  for (let k = 0; k < race.gates.length; k += 1) {
    order.push(race.gates[(race.timingIdx + k) % race.gates.length]);
  }
  const centre = (g) => ({ x: g.x, y: g.y + g.apertures[0].centreY, z: g.z });
  const along = (g, d) => {
    const c = centre(g);
    return { x: c.x + g.az.x * d, y: c.y + g.az.y * d, z: c.z + g.az.z * d };
  };
  const pts = [];
  const timing = order[0];
  pts.push(centre(timing));
  pts.push(along(timing, 2));
  for (let k = 1; k < order.length; k += 1) {
    if (opts.skip === k) {
      continue;
    }
    const g = order[k];
    pts.push(along(g, -2));
    pts.push(centre(g));
    pts.push(along(g, 2));
  }
  pts.push(along(timing, -2));
  pts.push(centre(timing));
  if (opts.hoverAfterMs) {
    /* Past the line, then sit still: the ghost outlasts the lap. */
    pts.push(along(timing, 2));
    pts.push({ ...along(timing, 2), hold: opts.hoverAfterMs });
  }
  return pts;
}

/* Where the polyline is at time t, by linear interpolation. */
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

/*
 * The truth the checker is measured against: the same detector run over the
 * polyline at a millisecond, which is how the simulator scores. Not the
 * waypoint times, because the detector has rules of its own that a waypoint
 * list does not know: a gate flown twice in a row is scored the second time
 * one step after the first, while the craft is still inside the slab, rather
 * than on the return through the centre.
 */
function denseTruth(gates, race, pts, times) {
  const truth = new Race(gatesFromCourse(courseFromDocument(doc)), race.micro ? 'micro' : 'full');
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

/* Sample a polyline at the ghost rate at a steady speed. Returns the fields
 * encodeGhost takes, with the splits and lap the detector itself measured. */
function ghostFromPath(gates, race, pts, speed = 20) {
  const times = [0];
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    times.push(times[i - 1] + (d / speed) * 1000 + (b.hold || 0));
  }
  const durationMs = times[times.length - 1];
  const truth = denseTruth(gates, race, pts, times);
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
  return { rateHz: GHOST_RATE_HZ, durationMs, splits: truth.splits, count, pos, quat, lapMs: truth.lapMs };
}

console.log('lap check');
const course = courseFromDocument(doc);
const gates = gatesFromCourse(course);
const race = new Race(gates, course.trackClass);
check('the reference course has gates', gates.length > 0, `${gates.length}`);

const honest = ghostFromPath(gates, race, waypoints(gates, race));
const honestBytes = encodeGhost(honest);
const ok = checkLap(doc, honestBytes, honest.lapMs);
check('an honest lap is accepted', ok.ok === true, ok.reason);
check('and it passed every gate', ok.gates === gates.length, `${ok.gates}`);
check('and the course clock agrees with the ghost clock',
  ok.ok && Math.abs(ok.lapMs - honest.lapMs) <= LAP_TOLERANCE_MS, `${ok.lapMs} vs ${honest.lapMs}`);
check('and the top speed is the flown speed', ok.ok && Math.abs(ok.topSpeed - 20) < 0.5, `${ok.topSpeed}`);

const skipK = Math.max(1, Math.floor(gates.length / 2));
const skipped = ghostFromPath(gates, race, waypoints(gates, race, { skip: skipK }));
/* The detector never closes this lap, so there is no measured time; the
 * forger claims the ghost's own length, which the duration check lets
 * through and the gates do not. */
const bad1 = checkLap(doc, encodeGhost(skipped), skipped.durationMs);
check('a lap that skips a gate is refused', bad1.ok === false && /never closed/.test(bad1.reason), bad1.reason);

const teleported = { ...honest, pos: Float32Array.from(honest.pos) };
const mid = Math.floor(honest.count / 2);
teleported.pos[mid * 3] += 40;
const bad2 = checkLap(doc, encodeGhost(teleported), honest.lapMs);
check('a lap with a 40 m jump between two samples is refused', bad2.ok === false && /jump/.test(bad2.reason), bad2.reason);

const bad3 = checkLap(doc, honestBytes, honest.lapMs - 500);
check('a claim 500 ms faster than its own ghost is refused', bad3.ok === false && /claimed lap/.test(bad3.reason), bad3.reason);

const hovered = ghostFromPath(gates, race, waypoints(gates, race, { hoverAfterMs: 1500 }));
const bad4 = checkLap(doc, encodeGhost(hovered), hovered.durationMs);
check('a ghost that outlasts its lap by 1.5 s cannot claim the long time', bad4.ok === false && /measures/.test(bad4.reason), bad4.reason);

const wrongSplits = { ...honest, splits: honest.splits.map((s, i) => (i === 0 ? s + 400 : s)) };
const bad5 = checkLap(doc, encodeGhost(wrongSplits), honest.lapMs);
check('a ghost whose first split disagrees with the course by 400 ms is refused', bad5.ok === false && /split 1/.test(bad5.reason), bad5.reason);

const reversed = { ...honest, pos: new Float32Array(honest.pos.length) };
for (let i = 0; i < honest.count; i += 1) {
  const j = honest.count - 1 - i;
  reversed.pos.set(honest.pos.subarray(j * 3, j * 3 + 3), i * 3);
}
const bad6 = checkLap(doc, encodeGhost(reversed), honest.lapMs);
check('the lap flown backwards is refused', bad6.ok === false, bad6.reason);

const junk = checkLap(doc, new Uint8Array(10), honest.lapMs);
check('ten bytes of nothing are refused as a ghost', junk.ok === false && /^ghost:/.test(junk.reason), junk.reason);

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
