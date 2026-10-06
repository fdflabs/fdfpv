/*
 * ghost-golden.js: src/game/ghost.js held to the exact outputs it gave when
 * tests/fixtures/ghost-golden.json was written. npm run ghost:golden.
 *
 * ghost-selftest and live-selftest say what the ghost machines should do,
 * within tolerances. This says that they still do precisely what they did,
 * bit for bit, because the recorder's grid is what the board judges and
 * stores, and a rewrite that moved one keyframe by an ulp would change
 * every uploaded lap's bytes. It drives only what callers touch:
 *
 *   GhostRecorder  begin, push, cutHere, abort, finish, and the armed and
 *                  pos.length fields main.js reads, fed the way main.js
 *                  feeds it (a frame before the crossing at a negative lap
 *                  time, display rate jitter and hitches, crash recoveries,
 *                  the frame past the line, back to back laps). Every lap
 *                  record goes in the stream in full and as the bytes
 *                  encodeGhost makes of it.
 *   GhostLap       every field, the cut table, and every pose a caller
 *                  samples, over the session record and over the same lap
 *                  decoded from its bytes the way a board ghost arrives.
 *   GhostBook      keep, best and previous, labels in both locales, and
 *                  which object is which.
 *   LiveSender     every emitted payload and its wire frame.
 *   LiveGhost      every presence and pose over a seeded network: late,
 *                  duplicated, out of order and dropped frames, background
 *                  tab bursts, stale holes, clocks that step back.
 *
 * Real inputs: the gate sequences of the track documents in the repository,
 * flown as a polyline through the recorder, and tests/lib/synthlap.js laps
 * over the same documents as GhostLap input.
 *
 * Inputs are kept to what cannot hang the old code: a time step or a
 * duration of Infinity, or a rate of 0, makes the grid loops run forever.
 *
 * The record is written with --record; see scripts/lib/golden.js. Write it
 * again only on purpose, with the reason in the pull request.
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

import { readFileSync } from 'node:fs';

import * as ghostModule from '../src/game/ghost.js';
import {
  decodeGhost, decodeLiveFrame, encodeGhost, encodeLiveFrame, LIVE_PEER_BYTES,
} from '../src/share/ghostdata.js';
import { setLocale, useLocale } from '../src/strings/index.js';
import { syntheticLap } from '../tests/lib/synthlap.js';
import { goldenMain, seeded } from './lib/golden.js';

const {
  GHOST_CUT_SPEED, GhostBook, GhostLap, GhostRecorder, LIVE_CATCHUP_MS, LIVE_DELAY_MS, LIVE_STALE_MS, LiveGhost,
  LiveSender,
} = ghostModule;

const FIXTURE = new URL('../tests/fixtures/ghost-golden.json', import.meta.url);

/* The book's labels are looked up at keep time; loading Spanish once here
 * lets a case switch locale synchronously and switch back. */
await useLocale('es');
setLocale('en');

const TRACKS = [
  'docs/itaipu-courses/itaipu-run.json',
  'docs/itaipu-courses/powerhouse.json',
  'scripts/gatecards-track.json',
  'tests/fixtures/map-track-v4.json',
].map((path) => ({
  path,
  doc: JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')),
}));

const hex = (bytes) => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('hex');

/* An engine TypeError's text depends on the source expression that hit it,
 * which a rewrite does not share; that it throws, and what class, is the
 * contract. A thrown Error's message is the module's own words. */
function attempt(fn) {
  try {
    return { ok: fn() };
  } catch (err) {
    if (err instanceof TypeError || err instanceof RangeError) return { threw: err.name };
    return { threw: err.name, message: String(err.message) };
  }
}

/*
 * A smooth flight with no trigonometry, so every machine computes the same
 * doubles: position and an unnormalised quaternion are cubics in seconds
 * with seeded coefficients, the quaternion normalised here as a craft's
 * would be. Speeds stay mostly under the cut speed, sometimes near it.
 */
function polyFlight(rng) {
  const c = [];
  for (let k = 0; k < 3; k += 1) {
    c.push([rng.range(-50, 50), rng.range(-15, 15), rng.range(-1, 1), rng.range(-0.03, 0.03)]);
  }
  for (let k = 0; k < 4; k += 1) {
    c.push([rng.range(-1, 1), rng.range(-1, 1), rng.range(-0.2, 0.2), rng.range(-0.01, 0.01)]);
  }
  return (tMs) => {
    const t = tMs / 1000;
    const v = c.map(([a, b, d, e]) => a + t * (b + t * (d + t * e)));
    let n = Math.sqrt(v[3] * v[3] + v[4] * v[4] + v[5] * v[5] + v[6] * v[6]);
    if (!(n > 0)) n = 1;
    return [v[0], v[1], v[2], v[3] / n, v[4] / n, v[5] / n, v[6] / n];
  };
}

/* What main.js's ghostSample scratch looks like: one object reused for
 * every sample of every ghost. */
const scratch = () => ({ px: 0, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1, cut: false });

const AWKWARD_T = [-0, 0, -1e-300, 5e-324, -50, NaN, Infinity, -Infinity, 1e300];

/*
 * Every pose a chase would read: a dense sweep from before the start to
 * past the finish, every grid time (as i * step and as the accumulated
 * cursor), the edges and middle of every cut segment, and the awkward
 * times. One line per sample so a dump diff points at the time.
 */
function sweep(s, lap, tag, stepMs) {
  const out = scratch();
  let same = true;
  const one = (t) => {
    same = lap.sample(t, out) === out && same;
    s.say(tag, [t, out.px, out.py, out.pz, out.qx, out.qy, out.qz, out.qw, out.cut]);
  };
  for (let t = -40; t <= lap.durationMs + 120; t += stepMs) one(t);
  const gridStep = 1000 / lap.rateHz;
  let acc = 0;
  for (let i = 0; i < lap.count; i += 1) {
    one((i * 1000) / lap.rateHz);
    one(acc);
    acc += gridStep;
  }
  for (let i = 0; i < lap.cut.length; i += 1) {
    if (lap.cut[i] !== 1) continue;
    const a = (i * 1000) / lap.rateHz;
    one(a);
    one(a + gridStep / 2);
    one(a + gridStep - 1e-9);
    one(a + gridStep);
  }
  for (const t of [...AWKWARD_T, lap.durationMs, lap.durationMs - 1e-9, lap.durationMs + 1e-9]) one(t);
  s.say(`${tag}.returnsOut`, same);
  /* Key order of a fresh out, and of one that already has keys of its own
   * in another order (the shell's scratch, a board lap's extras). */
  s.say(`${tag}.fresh`, lap.sample(lap.durationMs * 0.37, {}));
  s.say(`${tag}.prefilled`, lap.sample(lap.durationMs * 0.61, { timeId: 'x', cut: 7, qw: 9 }));
}

const SPLIT_KS = [-1, -0, 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 12, 300, NaN, Infinity, -Infinity];

function lapFacts(s, tag, lap, data) {
  s.say(`${tag}.keys`, Object.keys(lap));
  s.say(`${tag}.fields`, {
    rateHz: lap.rateHz,
    durationMs: lap.durationMs,
    count: lap.count,
    splits: lap.splits,
    label: lap.label,
    name: lap.name,
    source: lap.source,
  });
  s.say(`${tag}.cut`, lap.cut);
  s.say(`${tag}.cutCalls`, {
    every0: lap.cut.every((v) => v === 0),
    some1: lap.cut.some((v) => v === 1),
    sum: lap.cut.reduce((a, b) => a + b, 0),
    first: lap.cut.indexOf(1),
  });
  s.say(`${tag}.shared`, {
    pos: lap.pos === data.pos, quat: lap.quat === data.quat, splits: lap.splits === data.splits,
  });
  s.say(`${tag}.splitMs`, SPLIT_KS.map((k) => lap.splitMs(k)));
}

/*
 * A recorded lap's whole afterlife: the record, its bytes, the session
 * GhostLap over it (which main.js re-encodes for upload), and the board
 * ghost decoded from the bytes, each sampled.
 */
function afterlife(s, record, splitsArg, sampleStep = 7.3) {
  s.say('record', record);
  s.say('splitsArg', splitsArg);
  if (!record) return;
  const enc = attempt(() => hex(encodeGhost(record)));
  s.say('bytes', enc);
  const lap = new GhostLap(record);
  lapFacts(s, 'lap', lap, record);
  s.say('lap.reencode', enc.ok !== undefined ? attempt(() => hex(encodeGhost(lap)) === enc.ok) : 'n/a');
  sweep(s, lap, 'lap.s', sampleStep);
  if (enc.ok === undefined) return;
  const decoded = decodeGhost(encodeGhost(record));
  const board = new GhostLap(decoded, { label: 'Board', name: 'pilot', source: 'board' });
  board.timeId = 'tm-1';
  s.say('board.timeId', board.timeId);
  lapFacts(s, 'board', board, decoded);
  sweep(s, board, 'board.s', sampleStep * 3.1);
}

/* push with what the debug hook reads afterwards, on one line. */
function push(s, rec, t, p) {
  const r = rec.push(t, p[0], p[1], p[2], p[3], p[4], p[5], p[6]);
  s.say('push', [t, r, rec.armed, rec.pos.length]);
}

function finish(s, rec, dur, splits) {
  const res = attempt(() => rec.finish(dur, splits));
  s.say('finish.after', [rec.armed, rec.pos.length]);
  if (res.threw) {
    s.say('finish', res);
    return null;
  }
  return res.ok;
}

function makeSplits(rng, dur) {
  const kind = rng.int(0, 9);
  if (kind === 0) return null;
  if (kind === 1) return undefined;
  if (kind === 2) return [];
  const n = rng.int(1, 9);
  const list = [];
  for (let i = 0; i < n - 1; i += 1) list.push(rng.range(0, dur));
  list.sort((a, b) => a - b);
  list.push(dur);
  if (kind === 3) list.reverse();
  if (kind === 4) list[0] = -rng.range(0, 40);
  if (kind === 5) for (let i = 0; i < list.length; i += 1) list[i] = Math.floor(list[i]) + 0.5;
  if (kind === 6) for (let i = 0; i < list.length; i += 1) list[i] = -(Math.floor(list[i]) + 0.5);
  return list;
}

/*
 * One lap the way main.js records it. Display frames at feedHz with seeded
 * jitter and the odd hitch; the frame before the crossing fed at its
 * negative lap time (or not, when there was none); crash recoveries as
 * cutHere, a lockout with no feeds, and a teleported pose from then on;
 * the frame just past the line on the old lap clock; then finish.
 */
function recordedLap(seed, o) {
  return (s) => {
    const rng = seeded(seed);
    const flight = polyFlight(rng);
    const rec = new GhostRecorder(...(o.rateHz ? [o.rateHz] : []));
    const step = 1000 / o.feedHz;
    let dur = o.short ? rng.range(1, 60) : rng.range(800, 16000);
    if (o.halfMs) dur = Math.floor(dur) + 0.5;
    const splits = makeSplits(rng, dur);
    const splitsCopy = splits ? splits.slice() : splits;
    if (o.cutFirst) rec.cutHere();
    rec.begin();
    if (o.cutFirst) rec.cutHere();
    const off = [0, 0, 0];
    const pose = (t) => {
      const p = flight(t);
      p[0] += off[0];
      p[1] += off[1];
      p[2] += off[2];
      if (o.flips && rng.chance(0.3)) for (let k = 3; k < 7; k += 1) p[k] = -p[k];
      return p;
    };
    let t = o.seedFrame ? -rng.range(0, step) : rng.range(0, step);
    push(s, rec, t, pose(t));
    const crashAt = [];
    for (let k = 0; k < (o.crashes || 0); k += 1) crashAt.push(rng.range(0.05, 0.85) * dur);
    crashAt.sort((a, b) => a - b);
    const jump = () => (rng.chance(0.5) ? 1 : -1) * rng.range(15, 60);
    while (t <= dur) {
      let dt = step * (1 + o.jitter * (rng.next() - 0.5));
      if (rng.chance(o.hitch || 0)) dt *= rng.int(2, 6);
      t += dt;
      if (crashAt.length && t >= crashAt[0]) {
        crashAt.shift();
        rec.cutHere();
        if (rng.chance(0.5)) rec.cutHere();
        t += rng.range(300, 2500);
        off[0] += jump();
        off[1] += rng.range(-10, 10);
        off[2] += jump();
      }
      push(s, rec, t, pose(t));
    }
    const record = finish(s, rec, dur, splits);
    s.say('splitsUnchanged', canonSame(splits, splitsCopy));
    afterlife(s, record, splits, o.sampleStep);
  };
}

function canonSame(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((v, i) => Object.is(v, b[i]));
}

/* The craft's heading as a quaternion turning -z onto d, from the half
 * vector with a square root only (no trig to drift between engines). */
function headingQuat(d) {
  const w = 1 - d.z;
  const x = d.y;
  const y = -d.x;
  const n = Math.sqrt(x * x + y * y + w * w);
  if (n < 1e-9) return [0, 1, 0, 0];
  return [x / n, y / n, 0, w / n];
}

/* A track document's gate sequence as scene points (y up), closed back to
 * the timing gate. */
function trackPolyline(doc) {
  const byId = new Map(doc.elements.map((e) => [e.id, e.position]));
  const pts = doc.sequence.map((q) => {
    const p = byId.get(q.elementId);
    return { x: p.x, y: p.z + 1.5, z: -p.y };
  });
  pts.push(pts[0]);
  return pts;
}

/*
 * A track lap: the polyline flown at speed m/s, timed from the timing gate,
 * split at every gate. Crash recoveries put the craft back 40 m short of
 * the gate it was flying to, lap clock still running, as resetCraft does.
 */
function trackLap(track, o) {
  return (s) => {
    const rng = seeded(o.seed);
    const pts = trackPolyline(track.doc);
    const along = [0];
    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1];
      const b = pts[i];
      along.push(along[i - 1] + Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y) + (b.z - a.z) * (b.z - a.z)));
    }
    const total = along[along.length - 1];
    const at = (m) => {
      const d = Math.max(0, Math.min(total, m));
      let k = 1;
      while (k < pts.length - 1 && along[k] < d) k += 1;
      const a = pts[k - 1];
      const b = pts[k];
      const len = along[k] - along[k - 1];
      const u = len > 0 ? (d - along[k - 1]) / len : 0;
      const dir = len > 0 ? { x: (b.x - a.x) / len, y: (b.y - a.y) / len, z: (b.z - a.z) / len } : { x: 0, y: 0, z: -1 };
      return [a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u, ...headingQuat(dir)];
    };
    const rec = new GhostRecorder();
    rec.begin();
    const step = 1000 / o.feedHz;
    let metres = -o.speed * step * 0.5 / 1000;
    let t = (metres / o.speed) * 1000;
    push(s, rec, t, at(metres));
    const splits = [];
    let gate = 1;
    let crashes = o.crashes || 0;
    while (metres < total) {
      const dt = step * (1 + o.jitter * (rng.next() - 0.5));
      t += dt;
      metres += (o.speed * dt) / 1000;
      while (gate < along.length && metres >= along[gate]) {
        splits.push(t - ((metres - along[gate]) / o.speed) * 1000);
        gate += 1;
      }
      if (crashes > 0 && gate > 1 && gate < along.length && rng.chance(0.01)) {
        crashes -= 1;
        rec.cutHere();
        t += rng.range(800, 1500);
        metres = Math.max(along[gate - 1], along[gate] - 40);
      }
      push(s, rec, t, at(metres));
    }
    const dur = splits[splits.length - 1];
    const record = finish(s, rec, dur, splits);
    afterlife(s, record, splits, o.sampleStep);
  };
}

const cases = [];

/* What the module exports, and the four constants' values. */
cases.push({
  id: 'exports',
  run: (s) => {
    s.say('exports', Object.keys(ghostModule).sort().map((k) => `${k}:${typeof ghostModule[k]}`));
    s.say('constants', {
      GHOST_CUT_SPEED, LIVE_CATCHUP_MS, LIVE_DELAY_MS, LIVE_STALE_MS,
    });
  },
});

/*
 * Seeded laps over every display rate a player runs at, with and without
 * the pre-crossing frame, with jitter, hitches, crashes, sign flipped
 * attitude, a cut marked before the lap, fractional and .5 durations,
 * laps shorter than a grid step, splits of every awkward shape, and the
 * recorder at other grid rates.
 */
const RATES = [20, 24, 30, 48, 60, 75, 90, 100, 120, 144, 165, 240];
let seed = 100;
for (const feedHz of RATES) {
  cases.push({ id: `rec-${feedHz}hz-clean`, run: recordedLap(seed += 1, { feedHz, jitter: 0, seedFrame: true }) });
  cases.push({ id: `rec-${feedHz}hz-jitter`, run: recordedLap(seed += 1, { feedHz, jitter: 0.6, hitch: 0.01, seedFrame: true }) });
  cases.push({ id: `rec-${feedHz}hz-noseed`, run: recordedLap(seed += 1, { feedHz, jitter: 0.2, seedFrame: false }) });
  cases.push({ id: `rec-${feedHz}hz-crash`, run: recordedLap(seed += 1, { feedHz, jitter: 0.3, seedFrame: true, crashes: 3 }) });
  cases.push({ id: `rec-${feedHz}hz-flips`, run: recordedLap(seed += 1, { feedHz, jitter: 0.4, seedFrame: true, flips: true, halfMs: true }) });
}
for (let k = 0; k < 8; k += 1) {
  cases.push({ id: `rec-short-${k}`, run: recordedLap(seed += 1, { feedHz: RATES[k], jitter: 0.5, seedFrame: k % 2 === 0, short: true }) });
  cases.push({ id: `rec-cutfirst-${k}`, run: recordedLap(seed += 1, { feedHz: RATES[k + 2], jitter: 0.5, seedFrame: k % 2 === 1, cutFirst: true, crashes: 2 }) });
}
for (const rateHz of [1, 10, 25, 50, 60, 120, 240]) {
  cases.push({ id: `rec-grid${rateHz}`, run: recordedLap(seed += 1, { feedHz: 144, jitter: 0.5, seedFrame: true, rateHz, crashes: 1, sampleStep: 11.9 }) });
}
/* A grid rate the wire cannot carry: the recorder still records it, and
 * encodeGhost's refusal is part of what a caller sees. */
cases.push({ id: 'rec-grid29.97', run: recordedLap(seed += 1, { feedHz: 60, jitter: 0.2, seedFrame: true, rateHz: 29.97 }) });

/* Real courses: the gate sequences in the repository, flown clean, with
 * jitter and crashes, and at a crawl. Itaipu at 8 m/s outlasts the wire's
 * ten minutes, which is the overflow path reached the honest way. */
for (const [n, track] of TRACKS.entries()) {
  const big = n < 2;
  const fast = big ? 40 : 14;
  cases.push({ id: `track-${n}-clean144`, run: trackLap(track, { seed: 500 + n, feedHz: 144, jitter: 0, speed: fast, sampleStep: big ? 97.1 : 9.7 }) });
  cases.push({ id: `track-${n}-jitter60-crash`, run: trackLap(track, { seed: 510 + n, feedHz: 60, jitter: 0.7, speed: fast * 0.8, crashes: 2, sampleStep: big ? 97.1 : 9.7 }) });
  cases.push({ id: `track-${n}-slow30`, run: trackLap(track, { seed: 520 + n, feedHz: 30, jitter: 0.3, speed: big ? 8 : 4, sampleStep: big ? 331.3 : 23.3 }) });
}
for (const [n, track] of TRACKS.entries()) {
  cases.push({
    id: `synthlap-${n}`,
    run: (s) => {
      const data = syntheticLap(track.doc);
      s.say('data', { rateHz: data.rateHz, durationMs: data.durationMs, count: data.count, splits: data.splits });
      const lap = new GhostLap(data, { label: 'Board', name: 'synth', source: 'board' });
      lapFacts(s, 'lap', lap, data);
      sweep(s, lap, 'lap.s', n < 2 ? 211.7 : 13.1);
    },
  });
}

/* The recorder at its edges, one scenario per case. */
const P = (x, qw = 1) => [x, 0, 0, 0, 0, 0, qw];
const EDGE = {
  /* Pushes, cuts and finishes before any begin are ignored. */
  unarmed: (s, rec) => {
    rec.cutHere();
    push(s, rec, 10, P(1));
    s.say('abort', rec.abort());
    s.say('finish', finish(s, rec, 100, []));
  },
  /* 600000 ms is the last accepted time; a hair past it drops the lap but
   * leaves the recorder armed, swallowing pushes until finish says null. */
  overflow: (s, rec) => {
    rec.begin();
    push(s, rec, 0, P(0));
    push(s, rec, 599999.9, P(1));
    push(s, rec, 600000, P(2));
    push(s, rec, 600000.000001, P(3));
    push(s, rec, 600000.1, P(4));
    rec.cutHere();
    push(s, rec, 5, P(5));
    s.say('finish', finish(s, rec, 600000, [1, 2]));
    rec.begin();
    push(s, rec, 0, P(0));
    push(s, rec, 50, P(1));
    s.say('afterRebegin', finish(s, rec, 40, [40]));
  },
  overflowFirst: (s, rec) => {
    rec.begin();
    push(s, rec, 700000, P(0));
    s.say('finish', finish(s, rec, 700000, []));
  },
  unfed: (s, rec) => {
    rec.begin();
    rec.cutHere();
    s.say('finish', finish(s, rec, 1000, []));
  },
  /* Durations that leave fewer than two points or are not positive. */
  durations: (s, rec) => {
    for (const d of [0, -0, -5, 0.4, 0.5, 1, NaN, -1e-9, 33.3, 33.4, 66.7]) {
      rec.begin();
      push(s, rec, 0, P(0));
      s.say(`finish(${String(d)})`, finish(s, rec, d, [d]));
    }
    rec.begin();
    push(s, rec, -10, P(0));
    s.say('negOnly', finish(s, rec, 20, [20]));
  },
  /* Feeds at the same time, going back in time, and less than 1e-9 ms
   * apart just under a grid point (the u = 1 branch). */
  times: (s, rec) => {
    rec.begin();
    push(s, rec, 0, P(0));
    push(s, rec, 0, P(1));
    push(s, rec, 30, P(2));
    push(s, rec, 25, P(3));
    push(s, rec, 25, P(4));
    push(s, rec, 66.66666666666666, P(5));
    push(s, rec, 66.6666666666667, P(6));
    push(s, rec, 99.99999999995, P(7));
    push(s, rec, 100, P(8));
    push(s, rec, NaN, P(9));
    push(s, rec, 140, P(10));
    s.say('finish', finish(s, rec, 140, [70, 140]));
  },
  tinySpan50: (s) => {
    const rec = new GhostRecorder(50);
    rec.begin();
    push(s, rec, 0, P(0));
    push(s, rec, 39.9999999995, P(1));
    push(s, rec, 40, P(2, -1));
    push(s, rec, 60, P(3));
    s.say('finish', finish(s, rec, 60, []));
  },
  /* -0 positions, NaN poses, a zero quaternion (the raw fallback), an
   * antipodal pair (the blend passes through zero), unnormalised input. */
  poses: (s, rec) => {
    rec.begin();
    push(s, rec, -5, [-0, -0, -0, 0, 0, 0, 1]);
    push(s, rec, 40, [1, 2, 3, 0, 0, 0, 0]);
    push(s, rec, 80, [2, 2, 3, 0, 0, 0, 1]);
    push(s, rec, 120, [3, 2, 3, 0, 0, 0, -1]);
    push(s, rec, 160, [4, 2, 3, 1, 0, 0, 0]);
    push(s, rec, 200, [5, 2, 3, -1, 0, 0, 0]);
    push(s, rec, 240, [6, 2, 3, 3, 4, 0, 0]);
    push(s, rec, 280, [7, NaN, 3, 0, NaN, 0, 1]);
    push(s, rec, 320, [8, 2, 3, 0, 0, 0, 1]);
    push(s, rec, 360, [1e-7, 0, 0, 1e-7, 0, 0, 1e-7]);
    push(s, rec, 400, [0, 0, 0, -1e-7, 0, 0, 1e-7]);
    s.say('finish', finish(s, rec, 390, null));
  },
  /* Cuts: before the first feed (forgotten), doubled, cut then a feed at
   * the same time, two cuts in a row of feeds, a cut while overflowed. */
  cuts: (s, rec) => {
    rec.begin();
    rec.cutHere();
    push(s, rec, 3, P(0));
    rec.cutHere();
    rec.cutHere();
    push(s, rec, 100, [9, 9, 9, 0, 1, 0, 0]);
    push(s, rec, 140, [9.1, 9, 9, 0, 1, 0, 0]);
    rec.cutHere();
    push(s, rec, 140, [50, 9, 9, 0, 1, 0, 0]);
    rec.cutHere();
    push(s, rec, 141, [90, 9, 9, 0, 1, 0, 0]);
    push(s, rec, 300, [91, 9, 9, 0, 0, 1, 0]);
    s.say('finish', finish(s, rec, 290, [120, 290]));
  },
  /* Abort mid lap: nothing recorded, pushes ignored, a later begin starts
   * clean; finish twice; begin twice; back to back laps the way main.js
   * closes one and opens the next in the same frame. */
  lifecycle: (s, rec) => {
    rec.begin();
    push(s, rec, 0, P(0));
    push(s, rec, 50, P(1));
    s.say('abort', rec.abort());
    rec.cutHere();
    push(s, rec, 60, P(2));
    s.say('afterAbort', finish(s, rec, 60, []));
    rec.begin();
    push(s, rec, 0, P(0));
    rec.begin();
    push(s, rec, -3, P(1));
    push(s, rec, 70, P(2));
    s.say('first', finish(s, rec, 65.5, [65.5]));
    s.say('again', finish(s, rec, 65.5, [65.5]));
    for (let lap = 0; lap < 3; lap += 1) {
      rec.begin();
      push(s, rec, -7, P(lap));
      for (let t = 9; t < 400; t += 16.7) push(s, rec, t, P(lap + t / 100));
      s.say(`lap${lap}`, finish(s, rec, 380 + lap, [190, 380 + lap]));
    }
  },
  /* splits as a caller can pass them: missing, empty, halves either
   * side of zero, out of order. A typed array or a string is not pinned:
   * no caller passes one and the spec leaves what comes back open. */
  splits: (s, rec) => {
    const variants = [undefined, null, [], [0], [-0.5, 0.5, 1.5, -1.5], [10, 5, 20]];
    for (const sp of variants) {
      rec.begin();
      push(s, rec, 0, P(0));
      push(s, rec, 50, P(1));
      s.say('finish', finish(s, rec, 50, sp));
      s.say('arg', sp);
    }
  },
  /* The constructor's rate, including one the default would never pick. */
  rates: (s) => {
    for (const r of [1, 2, 7, 29.97, 30, 60, 240]) {
      const rec = new GhostRecorder(r);
      s.say('rateHz', [rec.rateHz, rec.armed, rec.pos.length]);
      rec.begin();
      push(s, rec, -1, P(0));
      push(s, rec, 1100, P(11));
      push(s, rec, 2050, P(20));
      s.say('finish', finish(s, rec, 2000, [1000, 2000]));
    }
  },
};
for (const [name, fn] of Object.entries(EDGE)) {
  cases.push({
    id: `rec-edge-${name}`,
    run: (s) => {
      const rec = new GhostRecorder();
      s.say('fresh', [rec.rateHz, rec.armed, rec.pos.length, Array.isArray(rec.pos)]);
      fn(s, rec);
    },
  });
}

/*
 * Hand built laps for GhostLap alone: every spline fallback (cut at the
 * first and last segment, cuts side by side, alternating), speeds an ulp
 * either side of the cut speed at several rates, zero and unnormalised
 * quaternions, plain arrays as well as Float32Arrays, two points only, and
 * the options a caller can pass.
 */
function handLap(rateHz, xs, quats) {
  const count = xs.length;
  const pos = [];
  const quat = [];
  for (let i = 0; i < count; i += 1) {
    pos.push(xs[i], i * 0.25, -i * 0.5);
    quat.push(...(quats ? quats[i % quats.length] : [0, 0, 0, 1]));
  }
  return { rateHz, durationMs: Math.round(((count - 1) * 1000) / rateHz), count, splits: [10, 20], pos, quat };
}
const HAND = {
  twoPoints: handLap(30, [0, 1]),
  cutFirst: handLap(30, [0, 50, 51, 52, 53, 54]),
  cutLast: handLap(30, [0, 1, 2, 3, 4, 90]),
  cutAdjacent: handLap(30, [0, 1, 2, 60, 120, 121, 122, 123]),
  cutAlternate: handLap(30, [0, 10, 10.5, 30, 30.5, 50, 50.5, 70]),
  allCut: handLap(30, [0, 10, 20, 30]),
  zeroQuat: handLap(30, [0, 1, 2, 3], [[0, 0, 0, 0], [0, 0, 0, 1], [0, 0, 0, -1], [1, 0, 0, 0]]),
  unnormQuat: handLap(30, [0, 1, 2, 3, 4], [[0, 3, 0, 4], [1, 1, 1, 1], [0, 0, 0, 1e-7], [2, 0, 0, 0]]),
  nanPos: handLap(30, [0, NaN, 2, 3, 4]),
  negZero: handLap(30, [-0, -0, -0]),
  rate1: handLap(1, [0, 50, 99, 100.0001, 300]),
  rate240: handLap(240, [0, 0.1, 0.2, 0.62, 0.63, 0.64]),
};
for (const [name, data] of Object.entries(HAND)) {
  cases.push({
    id: `lap-hand-${name}`,
    run: (s) => {
      const lap = new GhostLap(data);
      lapFacts(s, 'lap', lap, data);
      sweep(s, lap, 'lap.s', 1.7);
      const f32 = { ...data, pos: Float32Array.from(data.pos), quat: Float32Array.from(data.quat) };
      const lap32 = new GhostLap(f32);
      s.say('f32.cut', lap32.cut);
      sweep(s, lap32, 'f32.s', 5.3);
    },
  });
}
cases.push({
  id: 'lap-threshold',
  run: (s) => {
    for (const rateHz of [1, 24, 30, 50, 60, 100, 144, 240]) {
      const d0 = GHOST_CUT_SPEED / rateHz;
      for (let k = -4; k <= 4; k += 1) {
        const d = d0 * (1 + k * Number.EPSILON);
        for (const axis of [0, 1, 2]) {
          const pos = [0, 0, 0, 0, 0, 0, 0, 0, 0];
          pos[3 + axis] = d;
          pos[6 + axis] = d * 1.5;
          const lap = new GhostLap({ rateHz, durationMs: 2000 / rateHz, count: 3, splits: null, pos, quat: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] });
          s.say(`r${rateHz} k${k} a${axis}`, [d, lap.cut[0], lap.cut[1], lap.splits]);
        }
      }
      const diag = d0 / Math.sqrt(3);
      const lap = new GhostLap({ rateHz, durationMs: 1000 / rateHz, count: 2, pos: [0, 0, 0, diag, diag, diag], quat: [0, 0, 0, 1, 0, 0, 0, 1] });
      s.say(`r${rateHz} diag`, [diag, lap.cut[0]]);
    }
  },
});
cases.push({
  id: 'lap-options',
  run: (s) => {
    const data = handLap(30, [0, 1, 2]);
    const variants = [
      ['none', () => new GhostLap(data)],
      ['empty', () => new GhostLap(data, {})],
      ['undefinedArg', () => new GhostLap(data, undefined)],
      ['undefinedFields', () => new GhostLap(data, { label: undefined, name: undefined, source: undefined })],
      ['nullFields', () => new GhostLap(data, { label: null, name: null, source: null })],
      ['board', () => new GhostLap(data, { label: 'Best', name: 'Ana', source: 'board', extra: 1 })],
      ['nullArg', () => new GhostLap(data, null)],
    ];
    for (const [tag, make] of variants) {
      const r = attempt(make);
      if (r.threw) {
        s.say(tag, r);
        continue;
      }
      s.say(tag, [Object.keys(r.ok), r.ok.label, r.ok.name, r.ok.source]);
    }
    /* Fields are copied at construction; the arrays are the caller's. */
    const copy = { ...data, splits: [1, 2] };
    const lap = new GhostLap(copy);
    copy.durationMs = 1;
    copy.rateHz = 60;
    copy.splits.push(3);
    s.say('afterMutation', [lap.durationMs, lap.rateHz, lap.splits, lap.splitMs(2)]);
    lap.timeId = 'tm-9';
    s.say('timeId', [lap.timeId, Object.keys(lap)]);
  },
});

/*
 * The session book: seeded keeps over several courses, including keys that
 * Map treats specially (-0 and 0 are one key, NaN is one key, objects by
 * identity), falsy records, ties and slower laps, with after every keep
 * the result and every course's two slots: which record each wraps,
 * whether they are the same object as before, and their labels.
 */
function bookCase(bseed, locale) {
  return (s) => {
    setLocale(locale);
    try {
      const rng = seeded(bseed);
      const objKey = { course: 1 };
      const KEYS = ['trk-a', 'trk-b', 0, -0, NaN, objKey, ''];
      const book = new GhostBook();
      const records = [];
      const last = new Map();
      const results = [];
      for (let i = 0; i < 40; i += 1) {
        const key = rng.pick(KEYS);
        let record;
        const roll = rng.next();
        if (roll < 0.1) {
          record = rng.pick([null, undefined, 0, '', false]);
        } else {
          const count = rng.int(2, 5);
          const xs = [];
          for (let k = 0; k < count; k += 1) xs.push(k * rng.range(0, 5));
          record = handLap(30, xs);
          record.durationMs = rng.pick([9000, 9000, 8999, 9001, 12000, rng.int(5000, 15000)]);
          records.push(record);
        }
        const r = book.keep(key, record);
        results.push(r);
        s.say('keep', [KEYS.indexOf(key), String(key), r, results.indexOf(r) === results.length - 1]);
        for (const k of KEYS) {
          const best = book.best(k);
          const prev = book.previous(k);
          const view = (lap) => (lap ? {
            rec: records.findIndex((x) => x.pos === lap.pos),
            label: lap.label,
            name: lap.name,
            source: lap.source,
            durationMs: lap.durationMs,
            sharesSplits: lap.splits === records.find((x) => x.pos === lap.pos).splits,
          } : null);
          const was = last.get(k) || [null, null];
          s.say(`slot ${String(k)}`, {
            best: view(best),
            previous: view(prev),
            same: best !== null && best === prev,
            bestKept: best === was[0],
            previousKept: prev === was[1],
            stable: book.best(k) === best && book.previous(k) === prev,
          });
          last.set(k, [best, prev]);
        }
      }
      /* A record changed after keep does not move the laps already made. */
      const rec = records[records.length - 1];
      if (rec) {
        rec.durationMs = 1;
        s.say('afterMutation', KEYS.map((k) => (book.best(k) ? book.best(k).durationMs : null)));
      }
      s.say('unknown', [book.best('nope'), book.previous('nope'), book.best(undefined)]);
    } finally {
      setLocale('en');
    }
  };
}
for (let k = 0; k < 6; k += 1) cases.push({ id: `book-en-${k}`, run: bookCase(700 + k, 'en') });
for (let k = 0; k < 2; k += 1) cases.push({ id: `book-es-${k}`, run: bookCase(800 + k, 'es') });
cases.push({
  id: 'book-recorded',
  run: (s) => {
    /* The book over real recorder output, as main.js keeps it, and the
     * board re-encode of each slot (main.js uploads book laps). */
    const book = new GhostBook();
    const rng = seeded(901);
    const flight = polyFlight(rng);
    const rec = new GhostRecorder();
    for (const dur of [5000.4, 4999.6, 5000.5, 4999.5, 6000]) {
      rec.begin();
      for (let t = -3; t <= dur + 10; t += 16.6) {
        const p = flight(t);
        rec.push(t, p[0], p[1], p[2], p[3], p[4], p[5], p[6]);
      }
      const record = rec.finish(dur, [dur / 2, dur]);
      s.say('keep', book.keep('trk', record));
      const best = book.best('trk');
      const prev = book.previous('trk');
      s.say('slots', [best.durationMs, prev.durationMs, best.label, prev.label, best.pos === record.pos, prev.pos === record.pos]);
      s.say('bestBytes', hex(encodeGhost(best)));
    }
  },
});

/* Sender: one line per emit, payload and wire frame. */
function senderSay(s, label = 'emit') {
  return (...args) => {
    s.say(label, args);
    s.say('wire', hex(encodeLiveFrame(...args)));
  };
}

/*
 * Seeded sender runs: render frames at a display rate with jitter, hitches
 * and pauses (the sender's own tab in the background), sign flipped
 * attitude, resets when leaving and rejoining a room, and other rates.
 */
function senderCase(sseed, o) {
  return (s) => {
    const rng = seeded(sseed);
    const flight = polyFlight(rng);
    const sender = new LiveSender(senderSay(s), ...(o.rateHz ? [o.rateHz] : []));
    let t = rng.range(1000, 900000);
    const t0 = t;
    const step = 1000 / o.feedHz;
    for (let i = 0; i < o.frames; i += 1) {
      const p = flight(t - t0);
      if (o.flips && rng.chance(0.4)) for (let k = 3; k < 7; k += 1) p[k] = -p[k];
      s.say('feed', [t, sender.feed(t, ...p)]);
      t += step * (1 + o.jitter * (rng.next() - 0.5));
      if (rng.chance(o.pause || 0)) t += rng.range(500, 4000);
      if (rng.chance(o.reset || 0)) {
        s.say('reset', sender.reset());
        t += rng.range(0, 3000);
      }
    }
  };
}
for (const [k, feedHz] of [24, 30, 60, 75, 90, 144, 165, 240].entries()) {
  cases.push({ id: `send-${feedHz}hz`, run: senderCase(1000 + k, { feedHz, jitter: 0.5, frames: 300 }) });
  cases.push({ id: `send-${feedHz}hz-rough`, run: senderCase(1100 + k, { feedHz, jitter: 0.9, frames: 300, pause: 0.01, reset: 0.01, flips: true }) });
}
for (const rateHz of [1, 15, 60, 120, 240]) {
  cases.push({ id: `send-grid${rateHz}`, run: senderCase(1200 + rateHz, { feedHz: 144, jitter: 0.4, frames: 200, rateHz, reset: 0.02 }) });
}
cases.push({
  id: 'send-edges',
  run: (s) => {
    const a = new LiveSender(senderSay(s));
    /* Same time twice, time going back, a feed under 1e-9 ms after the last
     * just below the grid point, zero and antipodal quaternions. */
    a.feed(1000, 0, 0, 0, 0, 0, 0, 1);
    a.feed(1000, 1, 0, 0, 0, 0, 0, 1);
    a.feed(990, 2, 0, 0, 0, 0, 0, -1);
    a.feed(1033.3333333328, 3, 0, 0, 0, 0, 0, 1);
    a.feed(1033.3333333333333, 4, 0, 0, 0, 0, 0, 1);
    a.feed(1100, 5, 0, 0, 0, 0, 0, 0);
    a.feed(1200, 6, -0, 0, 1, 0, 0, 0);
    a.feed(1300, 7, 0, 0, -1, 0, 0, 0);
    a.feed(1400, 8, 0, 0, 0, 0, 0, -1);
    a.feed(NaN, 9, 0, 0, 0, 0, 0, 1);
    a.feed(1500, 10, 0, 0, 0, 0, 0, 1);
    s.say('reset', a.reset());
    /* The hemisphere reference survives a reset. */
    a.feed(5000, 11, 0, 0, 0, 0, 0, -1);
    a.feed(5040, 12, 0, 0, 0, 0, 0, -1);
    const b = new LiveSender(senderSay(s, 'emitB'));
    b.feed(0, 0, 0, 0, 0, 0, 0, -1);
    b.feed(-0, 1, 0, 0, 0, 0, 0, 1);
    b.feed(100, 2, 0, 0, 0.6, 0, 0, -0.8);
    /* What live-selftest feeds. */
    const c = new LiveSender(senderSay(s, 'emitC'));
    for (let i = 0; i <= 20; i += 1) c.feed(i * 16.6667, i * 0.5, 0, 0, 0, 0, 0, 1);
    /* emit's return value is ignored, and emit sees exactly eight args. */
    const d = new LiveSender(function emit(...args) {
      s.say('emitD', [args.length, this === undefined || this === d]);
      return 'ignored';
    });
    s.say('feedD', d.feed(10, 1, 2, 3, 0, 0, 0, 1));
  },
});
cases.push({
  id: 'send-throw',
  run: (s) => {
    /* A throwing emit propagates; the next feed shows where the sender
     * stood (the point that threw is emitted again). */
    let fail = 2;
    const sender = new LiveSender((...args) => {
      s.say('emit', args);
      fail -= 1;
      if (fail === 0) throw new Error('link down');
    });
    s.say('f1', attempt(() => sender.feed(0, 0, 0, 0, 0, 0, 0, 1)));
    s.say('f2', attempt(() => sender.feed(100, 3, 0, 0, 0, 0, 0, -1)));
    s.say('f3', attempt(() => sender.feed(140, 4, 0, 0, 0, 0, 0, -1)));
  },
});

/* A relayed frame as the receiver gets it: the relay's peer id ahead of the
 * sender's bytes. */
function relayed(peer, bytes) {
  const out = new Uint8Array(LIVE_PEER_BYTES + bytes.length);
  new DataView(out.buffer).setUint16(0, peer, true);
  out.set(bytes, LIVE_PEER_BYTES);
  return out;
}

/*
 * The live pipeline end to end over a seeded network. The sending pilot's
 * render frames go through LiveSender and encodeLiveFrame; each packet gets
 * a latency (a base, jitter, and now and then a late spike), some are lost,
 * some arrive twice, and spikes reorder them. The receiver renders at its
 * own rate, takes every packet due by its frame (pushing with that wall
 * time, as the socket stamps it), and samples. Its tab can go to the
 * background (no frames for seconds, then a burst of more than the ring
 * holds), its clock can step back, and the sender can pause or leave and
 * rejoin. Every push's newestMs and every sample's presence and pose go in
 * the stream.
 */
function liveCase(lseed, o) {
  return (s) => {
    const rng = seeded(lseed);
    const flight = polyFlight(rng);
    const packets = [];
    let seq = 0;
    let now = 0;
    const sender = new LiveSender((...args) => {
      s.say('emit', args);
      const bytes = encodeLiveFrame(...args);
      if (rng.chance(o.drop)) return;
      let lat = o.base + rng.range(0, o.jitter);
      if (rng.chance(o.late)) lat += rng.range(150, 900);
      const msg = relayed(o.peer, bytes);
      packets.push({ at: now + lat, seq: seq += 1, msg });
      if (rng.chance(o.dup)) packets.push({ at: now + lat + rng.range(0, 300), seq: seq += 1, msg });
    });
    const live = new LiveGhost();
    const out = scratch();
    const sendOrigin = rng.range(0, 1e6);
    const recvOrigin = rng.range(0, 1e6);
    const sendStep = 1000 / o.sendHz;
    const recvStep = 1000 / o.recvHz;
    let nextSend = 0;
    let nextRecv = rng.range(0, recvStep);
    let recvBack = 0;
    while (now < o.durationMs) {
      if (nextSend <= nextRecv) {
        now = nextSend;
        const p = flight(now);
        sender.feed(sendOrigin + now, ...p);
        nextSend += sendStep * (1 + o.sendJitter * (rng.next() - 0.5));
        if (rng.chance(o.senderPause)) nextSend += rng.range(2200, 5000);
        if (rng.chance(o.senderReset)) {
          sender.reset();
          s.say('senderReset', now);
          nextSend += rng.range(0, 2500);
        }
        continue;
      }
      now = nextRecv;
      const wall = recvOrigin + now - recvBack;
      const due = packets.filter((q) => q.at <= now).sort((a, b) => a.at - b.at || a.seq - b.seq);
      for (const q of due) {
        packets.splice(packets.indexOf(q), 1);
        const frame = decodeLiveFrame(q.msg);
        live.push(frame, wall);
        s.say('push', [frame.tMs, live.newestMs()]);
      }
      const presence = live.sample(wall, out);
      s.say('sample', [wall, presence, out.px, out.py, out.pz, out.qx, out.qy, out.qz, out.qw, out.cut, live.newestMs()]);
      nextRecv += recvStep * (1 + o.recvJitter * (rng.next() - 0.5));
      if (rng.chance(o.background)) nextRecv += rng.range(2500, 9000);
      if (rng.chance(o.clockBack)) recvBack += rng.range(1, 120);
    }
  };
}
const NET = {
  calm: { base: 30, jitter: 10, late: 0, drop: 0, dup: 0 },
  wifi: { base: 60, jitter: 80, late: 0.03, drop: 0.03, dup: 0.02 },
  mobile: { base: 120, jitter: 200, late: 0.08, drop: 0.08, dup: 0.04 },
  awful: { base: 200, jitter: 400, late: 0.2, drop: 0.2, dup: 0.1 },
};
let lseed = 2000;
for (const [net, n] of Object.entries(NET)) {
  for (const [recvHz, sendHz] of [[60, 60], [144, 60], [60, 144], [30, 240]]) {
    cases.push({
      id: `live-${net}-r${recvHz}-s${sendHz}`,
      run: liveCase(lseed += 1, {
        ...n, peer: 3, recvHz, sendHz, sendJitter: 0.4, recvJitter: 0.4, durationMs: 8000,
        background: 0, clockBack: 0, senderPause: 0, senderReset: 0,
      }),
    });
  }
  cases.push({
    id: `live-${net}-rough`,
    run: liveCase(lseed += 1, {
      ...n, peer: 65535, recvHz: 90, sendHz: 75, sendJitter: 0.8, recvJitter: 0.8, durationMs: 30000,
      background: 0.002, clockBack: 0.01, senderPause: 0.002, senderReset: 0.001,
    }),
  });
}

/*
 * LiveGhost on hand made frames, for the thresholds a seeded run only
 * brushes: stale at exactly LIVE_STALE_MS and past it, catch-up at exactly
 * LIVE_CATCHUP_MS and past it, the playhead clamped at its target, a wall
 * clock that steps back, the 64 frame ring, a single frame, duplicates,
 * zero and antipodal quaternions, frames with extra keys, NaN times.
 */
const fr = (tMs, px, q = [0, 0, 0, 1], extra = {}) => ({
  peer: 1, tMs, px, py: px * 0.5, pz: -px, qx: q[0], qy: q[1], qz: q[2], qw: q[3], ...extra,
});
function liveSample(s, live, wall, label = 'sample') {
  const out = scratch();
  const presence = live.sample(wall, out);
  s.say(label, [wall, presence, out.px, out.py, out.pz, out.qx, out.qy, out.qz, out.qw, out.cut, live.newestMs()]);
}
const LIVE_EDGE = {
  empty: (s) => {
    const live = new LiveGhost();
    const out = { untouched: true };
    s.say('empty', [live.sample(0, out), out, live.newestMs()]);
    s.say('fresh', [live.sample(5, {}), live.newestMs()]);
  },
  single: (s) => {
    const live = new LiveGhost();
    s.say('push', live.push(fr(500, 2, [0, 0, 0, 2]), 10));
    liveSample(s, live, 10);
    liveSample(s, live, 20);
    s.say('fresh', live.sample(30, {}));
  },
  stale: (s) => {
    const live = new LiveGhost();
    live.push(fr(1000, 0), 1000);
    live.push(fr(1033, 1), 1000);
    for (const w of [1000, 2999, 3000, 3000.0000000000005, 3001, 9000]) liveSample(s, live, w);
    /* A dropped frame does not refresh the arrival time. */
    live.push(fr(1033, 2), 9500);
    live.push(fr(10, 3), 9600);
    liveSample(s, live, 9700);
    live.push(fr(1066, 4), 9800);
    liveSample(s, live, 9800);
    liveSample(s, live, 11800);
    liveSample(s, live, 11800.001);
  },
  catchup: (s) => {
    const live = new LiveGhost();
    live.push(fr(1000, 0), 0);
    live.push(fr(1100, 10), 0);
    liveSample(s, live, 0);
    /* target moves 100 ahead with no wall time passing: exactly the
     * catch-up, kept; one more ms and the playhead snaps. */
    live.push(fr(1200, 20), 0);
    liveSample(s, live, 0);
    live.push(fr(1301, 30), 0);
    liveSample(s, live, 0);
    live.push(fr(1400, 40), 0);
    liveSample(s, live, 50);
    liveSample(s, live, 99.5);
    liveSample(s, live, 1000);
    live.push(fr(1400.5, 41), 1001);
    liveSample(s, live, 1001);
  },
  clockBack: (s) => {
    const live = new LiveGhost();
    for (let i = 0; i < 10; i += 1) live.push(fr(1000 + i * 33.4, i), 100);
    liveSample(s, live, 100);
    for (const w of [90, 80, 120, 110, 150, NaN, 200, 300]) liveSample(s, live, w);
  },
  nanWall: (s) => {
    const live = new LiveGhost();
    live.push(fr(1000, 0), NaN);
    live.push(fr(1100, 5), NaN);
    liveSample(s, live, 0);
    liveSample(s, live, 10);
    live.push(fr(1200, 9), 20);
    liveSample(s, live, 30);
    liveSample(s, live, 3000);
  },
  nanFrames: (s) => {
    const live = new LiveGhost();
    live.push(fr(1000, 0), 0);
    live.push(fr(NaN, 1), 0);
    s.say('newest', live.newestMs());
    live.push(fr(900, 2), 0);
    s.say('newest', live.newestMs());
    liveSample(s, live, 5);
    live.push(fr(2000, NaN), 6);
    liveSample(s, live, 10);
  },
  ring: (s) => {
    /* More frames than the ring holds, 1 ms apart: the playhead sits
     * before the oldest kept frame, so the pose is the oldest kept one. */
    const live = new LiveGhost();
    for (let i = 0; i < 100; i += 1) {
      live.push(fr(5000 + i, i), 0);
    }
    s.say('newest', live.newestMs());
    liveSample(s, live, 0);
    liveSample(s, live, 40);
    liveSample(s, live, 400);
    for (let i = 0; i < 70; i += 1) live.push(fr(6000 + i * 33.3, 200 + i), 500);
    for (let w = 500; w < 900; w += 16.7) liveSample(s, live, w);
  },
  quats: (s) => {
    const live = new LiveGhost();
    const qs = [[0, 0, 0, 1], [0, 0, 0, -1], [0, 0, 0, 0], [1, 0, 0, 0], [-1, 0, 0, 0], [0, 0.6, 0, 0.8], [0, 0, 0, 1e-7], [0, 0, 0, -1e-7]];
    for (let i = 0; i < qs.length; i += 1) live.push(fr(1000 + i * 40, i, qs[i]), 0);
    let w = 0;
    liveSample(s, live, w);
    /* Walk the playhead back over the run by feeding more frames slowly. */
    for (let i = 0; i < 40; i += 1) {
      w += 7;
      if (i % 5 === 0) live.push(fr(1320 + i * 8, 100 + i, qs[i % qs.length]), w);
      liveSample(s, live, w);
    }
  },
  extras: (s) => {
    const live = new LiveGhost();
    const out = { cut: true, timeId: 3 };
    live.push(fr(1000, 1, [0, 0, 0, 1], { tag: 'x' }), 0);
    live.push({ tMs: 1050, px: 2, py: 2, pz: 2, qx: 0, qy: 0, qz: 0, qw: 1 }, 0);
    s.say('presence', live.sample(0, out));
    s.say('out', out);
  },
  selftest: (s) => {
    /* The playback live-selftest runs, through the real wire. */
    const stepMs = 1000 / 30;
    const wire = (t, x) => decodeLiveFrame(relayed(1, encodeLiveFrame(t, x, 0, 0, 0, 0, 0, 1)));
    const live = new LiveGhost();
    liveSample(s, live, 0);
    for (let i = 0; i < 12; i += 1) live.push(wire(1000 + i * stepMs, i), 5000);
    liveSample(s, live, 5000);
    liveSample(s, live, 5010);
    live.push(wire(1000 + 12 * stepMs, 12), 5015);
    liveSample(s, live, 5020);
    for (let k = 0; k < 20; k += 1) liveSample(s, live, 5030 + k * 16);
    liveSample(s, live, 5030 + 20 * 16 + 100);
    liveSample(s, live, 5000 + LIVE_STALE_MS + 200);
    live.push(wire(500, 99), 9000);
    s.say('newest', live.newestMs());
    const late = new LiveGhost();
    late.push(wire(1000, 0), 0);
    late.push(wire(1000 + stepMs, 1), 0);
    liveSample(s, late, 0);
    for (let i = 2; i < 40; i += 1) late.push(wire(1000 + i * stepMs, i), 10);
    liveSample(s, late, 10);
  },
};
for (const [name, fn] of Object.entries(LIVE_EDGE)) cases.push({ id: `live-edge-${name}`, run: fn });

goldenMain('ghost:golden', FIXTURE, cases);
