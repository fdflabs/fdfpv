/*
 * ghost-selftest.js: the ghost pipeline end to end in plain Node, no browser, no GL.
 * Run with npm run ghost:selftest.
 *
 * A lap with a known analytic path is fed to the recorder at display rates, finished,
 * encoded, carried through base64, decoded and replayed, and every replay is measured
 * against the path it came from. Then the blob validator is handed tampered blobs, the
 * recorder's edges are poked and the per-course book is exercised. A ghost that drifts
 * from the line it was flown on, or a blob the board would accept but the shell would
 * misread, shows up here before anyone races against it. Exit code is the number of
 * failed checks; an exception crashes the run, which is also a failure.
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

import {
  decodeGhost,
  encodeGhost,
  ghostFromBase64,
  ghostToBase64,
  GHOST_HEADER_BYTES,
  GHOST_RATE_HZ,
  GHOST_SAMPLE_BYTES,
  inspectGhostBytes,
} from '../src/share/ghostdata.js';
import { GhostBook, GhostLap, GhostRecorder } from '../src/game/ghost.js';

let failures = 0;
function report(ok, label) {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${label}`);
}

const LAP_MS = 12000;
const RADIUS = 20;
const BANK = 0.35;
const SPLITS = [3000, 6000, 9000, 12000];

/* The reference lap: a 20 m circle at 3 m with a vertical wobble at twice the lap rate,
 * yawing along the tangent with a constant bank. */
function phase(t) {
  return (t / LAP_MS) * Math.PI * 2;
}
function truePos(t) {
  const a = phase(t);
  return { x: Math.cos(a) * RADIUS, y: 3 + Math.sin(a * 2) * 0.5, z: Math.sin(a) * RADIUS };
}
function trueQuat(t) {
  const half = (phase(t) + Math.PI / 2) / 2;
  const cy = Math.cos(half);
  const sy = Math.sin(half);
  const cb = Math.cos(BANK / 2);
  const sb = Math.sin(BANK / 2);
  return { x: sy * sb, y: sy * cb, z: cy * sb, w: cy * cb };
}

/* NaN must lose: a comparison against NaN is false, so these return Infinity instead. */
function distance(dx, dy, dz) {
  const d = Math.hypot(dx, dy, dz);
  return Number.isNaN(d) ? Infinity : d;
}
function angleDeg(a, b) {
  const dot = Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w);
  const deg = (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI;
  return Number.isNaN(deg) ? Infinity : deg;
}
function posError(s, t) {
  const p = truePos(t);
  return distance(s.px - p.x, s.py - p.y, s.pz - p.z);
}
function quatError(s, t) {
  return angleDeg({ x: s.qx, y: s.qy, z: s.qz, w: s.qw }, trueQuat(t));
}

/* Worst of fn(t) over t = 0, step, 2 step, ... up to and including the lap length. */
function worstOver(step, fn) {
  let worst = 0;
  for (let t = 0; t <= LAP_MS; t += step) worst = Math.max(worst, fn(t));
  return worst;
}

/* Feeds the reference lap the way the shell does at a display rate of hz. With seeded,
 * one frame lands half a step before the gate so the t = 0 grid point is interpolated
 * across the crossing. With cutAt, cutHere() is called once at the first feed at or past
 * that time and the craft is moved 60 m along +x from then on. Feed times accumulate by
 * repeated addition on purpose: that is the exact grid geometry the thresholds were set on. */
function recordLap(hz, { cutAt = null, seeded = true } = {}) {
  const rec = new GhostRecorder();
  rec.begin();
  const step = 1000 / hz;
  const feed = (t, shift) => {
    const p = truePos(t);
    const q = trueQuat(t);
    rec.push(t, p.x + shift, p.y, p.z, q.x, q.y, q.z, q.w);
  };
  if (seeded) feed(-step * 0.5, 0);
  let cutDone = false;
  for (let t = step * 0.5; t <= LAP_MS + step; t += step) {
    const past = cutAt !== null && t >= cutAt;
    if (past && !cutDone) {
      rec.cutHere();
      cutDone = true;
    }
    feed(t, past ? 60 : 0);
  }
  return rec.finish(LAP_MS, SPLITS);
}

function sameBytes(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
function quatAt(arr, i) {
  return { x: arr[i * 4], y: arr[i * 4 + 1], z: arr[i * 4 + 2], w: arr[i * 4 + 3] };
}
function dot4(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}
/* Every consecutive pair on the same hemisphere; NaN counts as a break. */
function oneHemisphere(quat, count) {
  for (let i = 1; i < count; i += 1) {
    if (!(dot4(quatAt(quat, i - 1), quatAt(quat, i)) >= 0)) return false;
  }
  return true;
}

const s = {};

console.log('recording and replay');
const lap144 = recordLap(144);
report(lap144 !== null, 'a 144 Hz lap finishes into a record');
report(lap144.rateHz === GHOST_RATE_HZ, `it is stored on the ${GHOST_RATE_HZ} Hz grid`);
report(lap144.durationMs === LAP_MS, 'with the lap time it was given');
const minFrames = Math.floor((LAP_MS * GHOST_RATE_HZ) / 1000);
report(lap144.count >= minFrames, `and at least ${minFrames} frames (${lap144.count})`);
report(lap144.splits.length === 4 && lap144.splits[3] === LAP_MS, 'and the four splits, last one at the line');

const replay144 = new GhostLap(lap144);
const err144 = worstOver(37, (t) => {
  replay144.sample(t, s);
  return posError(s, t);
});
report(err144 < 0.05, `replay follows the flown path within 5 cm (worst ${(err144 * 100).toFixed(2)} cm)`);
const ang144 = worstOver(53, (t) => {
  replay144.sample(t, s);
  return quatError(s, t);
});
report(ang144 < 1, `and its attitude within a degree (worst ${ang144.toFixed(3)} deg)`);
replay144.sample(LAP_MS + 5000, s);
report(posError(s, LAP_MS) < 0.2, 'sampling after the finish holds the finish pose');
report(replay144.cut.every((c) => c === 0), 'a clean lap has no teleport segments');

const replay20 = new GhostLap(recordLap(20));
const err20 = worstOver(41, (t) => {
  replay20.sample(t, s);
  return posError(s, t);
});
report(err20 < 0.05, `a 20 Hz display under the grid still replays within 5 cm (worst ${(err20 * 100).toFixed(1)} cm)`);

const replayBare = new GhostLap(recordLap(20, { seeded: false }));
replayBare.sample(0, s);
const errBare = posError(s, 0);
report(errBare < 0.55, `with no frame before the gate the start is off by under a feed step (${(errBare * 100).toFixed(1)} cm)`);

console.log('teleports');
const replayCut = new GhostLap(recordLap(144, { cutAt: 6000 }));
report(replayCut.cut.some((c) => c === 1), 'a cut mid lap marks a segment');
report(replayCut.cut.reduce((n, c) => n + c, 0) === 1, 'exactly one segment');
const seg = replayCut.cut.indexOf(1);
const segMid = ((seg + 0.5) * 1000) / replayCut.rateHz;
replayCut.sample(segMid, s);
report(s.cut === true, 'sampling inside it says so');
report(Math.abs(s.px - replayCut.pos[seg * 3]) < 1e-6, 'and holds the near side instead of sliding across');
const before = segMid - 1000 / replayCut.rateHz;
replayCut.sample(before, s);
const pBefore = truePos(before);
report(Math.hypot(s.px - pBefore.x, s.pz - pBefore.z) < 0.6, 'the segment before it does not bend toward the far side');

console.log('blob');
const wireLap = recordLap(144);
const blob = encodeGhost(wireLap);
report(inspectGhostBytes(blob) === null, 'an encoded lap passes inspection');
const expectBytes = GHOST_HEADER_BYTES + 4 * 4 + wireLap.count * GHOST_SAMPLE_BYTES;
report(blob.length === expectBytes, `it is header plus splits plus frames (${blob.length} bytes)`);
report(sameBytes(encodeGhost(wireLap), blob), 'encoding twice gives the same bytes');
const carried = ghostFromBase64(ghostToBase64(blob));
report(sameBytes(carried, blob), 'base64 carries it unchanged');
const dec = decodeGhost(carried);
report(dec.rateHz === wireLap.rateHz && dec.count === wireLap.count && dec.durationMs === wireLap.durationMs,
  'decoding restores rate, frame count and lap time');
report(dec.splits.length === 4 && dec.splits[1] === 6000, 'and the splits');
let posDrift = 0;
for (let i = 0; i < wireLap.count * 3; i += 1) {
  posDrift = Math.max(posDrift, distance(dec.pos[i] - wireLap.pos[i], 0, 0));
}
report(posDrift < 1e-4, 'and the positions');
const replayDec = new GhostLap(dec);
const angDec = worstOver(97, (t) => {
  replayDec.sample(t, s);
  return quatError(s, t);
});
report(angDec < 1, `a decoded replay keeps its attitude within a degree (worst ${angDec.toFixed(3)} deg)`);
let normDrift = 0;
for (let i = 0; i < dec.count; i += 1) {
  const q = quatAt(dec.quat, i);
  normDrift = Math.max(normDrift, distance(Math.hypot(q.x, q.y, q.z, q.w) - 1, 0, 0));
}
report(normDrift <= 1e-3, 'decoded quaternions are unit length');
report(oneHemisphere(dec.quat, dec.count), 'and stay on one hemisphere');

const flipper = new GhostRecorder();
flipper.begin();
for (let t = 8; t <= 2000; t += 16) {
  const q = trueQuat(t);
  const sign = Math.floor(t / 100) % 2 === 0 ? 1 : -1;
  flipper.push(t, t / 1000, 3, 0, q.x * sign, q.y * sign, q.z * sign, q.w * sign);
}
const flipped = decodeGhost(encodeGhost(flipper.finish(2000, [2000])));
report(oneHemisphere(flipped.quat, flipped.count), 'the encoder unflips a quaternion stream that keeps changing sign');

console.log('tampered blobs');
const good = encodeGhost(recordLap(60));
function withU32(offset, value) {
  const copy = good.slice();
  new DataView(copy.buffer).setUint32(offset, value, true);
  return copy;
}
report(inspectGhostBytes(good.subarray(0, 40)) !== null, 'a truncated blob is refused');
report(inspectGhostBytes(new Uint8Array(0)) !== null, 'an empty blob is refused');
const badMagic = good.slice();
badMagic[0] = 88;
report(inspectGhostBytes(badMagic) === 'wrong magic', 'a bad magic is named as such');
report(inspectGhostBytes(withU32(8, 9)) !== null, 'an unknown version is refused');
report(inspectGhostBytes(withU32(12, 100000)) !== null, 'an absurd rate is refused');
report(inspectGhostBytes(withU32(16, 7)) !== null, 'a frame count that disagrees with the size is refused');
report(inspectGhostBytes(withU32(20, 100)) === null
  && inspectGhostBytes(withU32(20, 590000)) === 'grid ends before the lap does',
  'a short claimed lap is fine, one longer than the grid is refused by name');
report(inspectGhostBytes(withU32(24, 4096)) !== null, 'an absurd split count is refused');
let threw = false;
try {
  encodeGhost({ ...recordLap(60), durationMs: 7_200_000 });
} catch {
  threw = true;
}
report(threw, 'encoding a two hour lap throws');

console.log('recorder edges');
const edge = new GhostRecorder();
edge.begin();
report(edge.finish(1000, []) === null, 'nothing fed, nothing recorded');
edge.begin();
edge.push(700000, 0, 0, 0, 0, 0, 0, 1);
report(edge.finish(700000, []) === null, 'frames past the ten minute cap are dropped');
const idle = new GhostRecorder();
idle.push(50, 1, 2, 3, 0, 0, 0, 1);
report(idle.pos.length === 0, 'a recorder that was never armed ignores pushes');

console.log('session book');
const book = new GhostBook();
const timed = (ms) => {
  const lap = recordLap(60);
  lap.durationMs = ms;
  return lap;
};
const slow = timed(14000);
const fast = timed(11000);
const slower = timed(15000);
report(book.keep('field', slow).best === true, 'the first lap is the best so far');
report(book.keep('field', fast).best === true, 'a faster lap takes the best');
report(book.keep('field', slower).best === false, 'a slower one does not');
report(book.previous('field').durationMs === 15000, 'previous is the latest lap kept');
report(book.best('field').durationMs === 11000, 'best is the fastest');
report(book.best('city') === null, 'another course has its own empty slot');

console.log('');
console.log(failures === 0 ? 'all passed' : `${failures} FAILED`);
process.exit(failures);
