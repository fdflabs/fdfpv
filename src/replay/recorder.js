/*
 * recorder.js: the last 30 seconds of what the pilot saw, as data.
 *
 * Always on in flight. Once a rendered frame, after the craft is posed, it
 * writes one row: the craft's drawn pose, its props and surfaces, the
 * plant's pose of the craft and of every part (so a replay can draw the
 * pieces through src/render/wreck.js exactly as the flight did), the
 * damage flags, the throttle, and where the plant's journal stood
 * (src/replay/journal.js), which is what TAKE OVER flies back to. Events
 * that are not a pose (a part leaving, a hit, a splash of debris, a crunch
 * on the sound) go in a list beside the rows, stamped with the same clock.
 *
 * Read only. Every number here is copied out of something the shell has
 * already computed; nothing is written back.
 *
 * Preallocated: the rows are columns of typed arrays sized once, a ring
 * over CAPACITY frames, so a frame costs a few hundred stores and no
 * allocation. The clock is the replay's own: the plant's time where it
 * advanced by a sane amount since the last row, the wall's otherwise (R
 * sets the plant's clock back to zero, and the pad does not step it), so
 * the timeline only ever moves forward.
 *
 * A Clip is the same columns, cut out of the ring in order: what the editor
 * plays and what a saved replay holds (src/replay/file.js).
 *
 * Each row also keeps the map's animation clock the frame was drawn at
 * (the ms view.updateAnim was given: the traffic, the gondola, the
 * geysers), so a replay draws the car the craft landed on where it was
 * then and not where it has driven to since. A clip carries that column
 * (`anim`) only when every row in it has one; one without it, from a
 * file saved before, is drawn at the live clock as it always was.
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

import { trimPeers } from './peers.js';
import { trimPaper } from './paper.js';

/* Seconds of flight a replay holds, and the most rows it takes to hold
 * them: 120 a second. A faster display is sampled down to that; a slower
 * one leaves the ring holding more, and a clip takes the last 30 s. */
export const WINDOW_S = 30;
export const MAX_HZ = 120;
export const CAPACITY = WINDOW_S * MAX_HZ + 2;
export const PARTS_MAX = 24;

/* Per frame, doubles. */
export const HEAD = {
  simT: 0, markSeg: 1, markPos: 2, spawn: 3, flags: 4, wrecked: 5, speed: 6, throttle: 7,
  stateHash: 8, parts: 9, agl: 10,
};
export const HEAD_N = 11;
/* Per frame, floats: the drawn craft. */
export const POSE = {
  pos: 0, quat: 3, rpm: 7, surf: 11, flaps: 15, prop: 16,
};
export const POSE_N = 17;
/* Per frame, doubles: the plant's craft, [1..3] and [7..10] of its state,
 * which is what wreck.js places attached pieces against. */
export const PLANT_N = 7;
/* Per part, floats. */
export const PART = {
  status: 0, kind: 1, parent: 2, body: 3, deform: 4, pos: 7, quat: 10,
};
export const PART_N = 14;

/* Offsets into the plant's part state (configs/parts.js STATE). */
const S_STATUS = 0;
const S_POS = 2;
const S_QUAT = 5;
const S_BODY = 15;
const S_DEFORM = 17;
const S_KIND = 21;
const S_PARENT = 22;
const S_DOUBLES = 24;

/* Per frame, floats: the smoke system (src/render/smoke.js), on or off,
 * its nozzle's world position and the aircraft's world velocity, which is
 * all the trail is made from. */
export const SMOKE = { on: 0, nozzle: 1, vel: 4 };
export const SMOKE_N = 7;

function columns(n) {
  return {
    time: new Float64Array(n),
    head: new Float64Array(n * HEAD_N),
    pose: new Float32Array(n * POSE_N),
    plant: new Float64Array(n * PLANT_N),
    parts: new Float32Array(n * PARTS_MAX * PART_N),
    smoke: new Float32Array(n * SMOKE_N),
    anim: new Float64Array(n),
  };
}

/* The bytes one frame costs, for the memory report. */
export const FRAME_BYTES = 8 + HEAD_N * 8 + POSE_N * 4 + PLANT_N * 8 + PARTS_MAX * PART_N * 4 + SMOKE_N * 4 + 8;

/* FNV-1a over a state vector's bytes: what TAKE OVER checks the plant
 * against once it is put back. */
export function stateHash(st) {
  const b = new Uint8Array(st.buffer, st.byteOffset, st.byteLength);
  let h = 0x811c9dc5;
  for (let i = 0; i < b.length; i += 1) {
    h = Math.imul(h ^ b[i], 0x01000193) >>> 0;
  }
  return h;
}

export function createRecorder(capacity = CAPACITY) {
  const c = columns(capacity);
  let head = 0;
  let size = 0;
  let clock = 0;
  let lastSimT = NaN;
  let lastWall = NaN;
  const events = [];
  const spawns = [];

  /*
   * Where the next row goes, and its time, or -1 when it is too soon
   * after the last one. `simT` is the plant's time of the drawn pose,
   * `wallMs` the frame's wall clock.
   */
  function begin(simT, wallMs) {
    if (size > 0 && wallMs - lastWall < 1000 / MAX_HZ - 0.5) {
      return -1;
    }
    const dSim = simT - lastSimT;
    const dWall = (wallMs - lastWall) / 1000;
    let dt = 0;
    if (size > 0) {
      dt = dSim > 0 && dSim <= 0.1 ? dSim : Math.min(Math.max(dWall, 0), 0.1);
    }
    clock += dt;
    lastSimT = simT;
    lastWall = wallMs;
    const i = head;
    head = (head + 1) % capacity;
    size = Math.min(size + 1, capacity);
    c.time[i] = clock;
    const h = i * HEAD_N;
    c.head[h + HEAD.simT] = simT;
    c.head[h + HEAD.parts] = 0;
    c.anim[i] = NaN;
    const cutoff = clock - WINDOW_S - 2;
    while (events.length && events[0].t < cutoff) {
      events.shift();
    }
    return i;
  }

  /* The map's animation clock this frame is drawn at, ms. */
  function anim(i, ms) {
    c.anim[i] = ms;
  }

  /* The craft as drawn: a Three.js position and quaternion. */
  function pose(i, p, q) {
    const o = i * POSE_N;
    c.pose[o] = p.x;
    c.pose[o + 1] = p.y;
    c.pose[o + 2] = p.z;
    c.pose[o + 3] = q.x;
    c.pose[o + 4] = q.y;
    c.pose[o + 5] = q.z;
    c.pose[o + 6] = q.w;
  }

  /* The motors, the surfaces (or null), the flaps and the folding prop. */
  function drive(i, rpm0, rpm1, rpm2, rpm3, surf, flaps, prop) {
    const o = i * POSE_N;
    c.pose[o + POSE.rpm] = rpm0;
    c.pose[o + POSE.rpm + 1] = rpm1;
    c.pose[o + POSE.rpm + 2] = rpm2;
    c.pose[o + POSE.rpm + 3] = rpm3;
    for (let k = 0; k < 4; k += 1) {
      c.pose[o + POSE.surf + k] = surf ? surf[k] : 0;
    }
    c.pose[o + POSE.flaps] = flaps;
    c.pose[o + POSE.prop] = prop;
  }

  /* The smoke: `on`, and while it is, the nozzle and the velocity (world
   * frame, Three.js vectors). */
  function smoke(i, on, nozzle, vel) {
    const o = i * SMOKE_N;
    c.smoke[o + SMOKE.on] = on ? 1 : 0;
    c.smoke[o + SMOKE.nozzle] = on ? nozzle.x : 0;
    c.smoke[o + SMOKE.nozzle + 1] = on ? nozzle.y : 0;
    c.smoke[o + SMOKE.nozzle + 2] = on ? nozzle.z : 0;
    c.smoke[o + SMOKE.vel] = on ? vel.x : 0;
    c.smoke[o + SMOKE.vel + 1] = on ? vel.y : 0;
    c.smoke[o + SMOKE.vel + 2] = on ? vel.z : 0;
  }

  /* The plant's state block: its craft pose, and its hash. */
  function plant(i, st) {
    const o = i * PLANT_N;
    c.plant[o] = st[1];
    c.plant[o + 1] = st[2];
    c.plant[o + 2] = st[3];
    c.plant[o + 3] = st[7];
    c.plant[o + 4] = st[8];
    c.plant[o + 5] = st[9];
    c.plant[o + 6] = st[10];
    c.head[i * HEAD_N + HEAD.stateHash] = stateHash(st);
  }

  /* Everything else a row carries. `mark` is the journal's [seg, pos]. */
  function status(i, mark, spawn, flags, wrecked, speed, throttle, agl) {
    const h = i * HEAD_N;
    c.head[h + HEAD.markSeg] = mark[0];
    c.head[h + HEAD.markPos] = mark[1];
    c.head[h + HEAD.spawn] = spawn;
    c.head[h + HEAD.flags] = flags;
    c.head[h + HEAD.wrecked] = wrecked ? 1 : 0;
    c.head[h + HEAD.speed] = speed;
    c.head[h + HEAD.throttle] = throttle;
    c.head[h + HEAD.agl] = agl;
  }

  /* The plant's part state (count x 24 doubles), when anything is damaged. */
  function parts(i, ps, count) {
    const n = Math.min(count, PARTS_MAX);
    c.head[i * HEAD_N + HEAD.parts] = n;
    const base = i * PARTS_MAX * PART_N;
    for (let k = 0; k < n; k += 1) {
      const s = k * S_DOUBLES;
      const o = base + k * PART_N;
      c.parts[o + PART.status] = ps[s + S_STATUS];
      c.parts[o + PART.kind] = ps[s + S_KIND];
      c.parts[o + PART.parent] = ps[s + S_PARENT];
      c.parts[o + PART.body] = ps[s + S_BODY];
      c.parts[o + PART.deform] = ps[s + S_DEFORM];
      c.parts[o + PART.deform + 1] = ps[s + S_DEFORM + 1];
      c.parts[o + PART.deform + 2] = ps[s + S_DEFORM + 2];
      c.parts[o + PART.pos] = ps[s + S_POS];
      c.parts[o + PART.pos + 1] = ps[s + S_POS + 1];
      c.parts[o + PART.pos + 2] = ps[s + S_POS + 2];
      c.parts[o + PART.quat] = ps[s + S_QUAT];
      c.parts[o + PART.quat + 1] = ps[s + S_QUAT + 1];
      c.parts[o + PART.quat + 2] = ps[s + S_QUAT + 2];
      c.parts[o + PART.quat + 3] = ps[s + S_QUAT + 3];
    }
  }

  /* The spawn frame a row's plant poses are relative to: its index in a
   * short list, added to when the pad moves. */
  function spawnIndex(x, y, z, qx, qy, qz, qw, alt) {
    const last = spawns[spawns.length - 1];
    if (last && last[0] === x && last[1] === y && last[2] === z && last[3] === qx
      && last[4] === qy && last[5] === qz && last[6] === qw && last[7] === alt) {
      return spawns.length - 1;
    }
    spawns.push([x, y, z, qx, qy, qz, qw, alt]);
    return spawns.length - 1;
  }

  /* An event at the current clock: { type, ...data }. */
  function event(type, data) {
    events.push({ t: clock, type, ...data });
  }

  /* Forget the newest `count` rows: a take over flies on from before
   * them, so they are no longer what happened. */
  function dropNewest(count) {
    const k = Math.min(count, size);
    head = (head - k + capacity) % capacity;
    size -= k;
    if (size > 0) {
      const i = (head - 1 + capacity) % capacity;
      clock = c.time[i];
      lastSimT = c.head[i * HEAD_N + HEAD.simT];
    }
    while (events.length && events[events.length - 1].t > clock) {
      events.pop();
    }
  }

  function clear() {
    head = 0;
    size = 0;
    events.length = 0;
    spawns.length = 0;
    lastSimT = NaN;
    lastWall = NaN;
  }

  /* Where the last WINDOW_S seconds start in the ring, how many rows they
   * are, and the clock at the first and the last: what clip() cuts, for
   * anything kept beside the rows by the same index or the same clock
   * (src/replay/peers.js, src/replay/paper.js). */
  function span() {
    let first = (head - size + capacity) % capacity;
    let n = size;
    const newest = n ? c.time[(head - 1 + capacity) % capacity] : 0;
    while (n > 0 && c.time[first] < newest - WINDOW_S) {
      first = (first + 1) % capacity;
      n -= 1;
    }
    return [first, n, n ? c.time[first] : 0, newest];
  }

  /* The last WINDOW_S seconds of the ring in order, oldest first, as a
   * Clip, its clock starting at zero. */
  function clip(meta = {}) {
    const [first, n] = span();
    const out = columns(n);
    const t0 = n ? c.time[first] : 0;
    let animated = n > 0;
    for (let k = 0; k < n; k += 1) {
      const i = (first + k) % capacity;
      out.time[k] = c.time[i] - t0;
      out.head.set(c.head.subarray(i * HEAD_N, (i + 1) * HEAD_N), k * HEAD_N);
      out.pose.set(c.pose.subarray(i * POSE_N, (i + 1) * POSE_N), k * POSE_N);
      out.plant.set(c.plant.subarray(i * PLANT_N, (i + 1) * PLANT_N), k * PLANT_N);
      const np = c.head[i * HEAD_N + HEAD.parts];
      out.parts.set(c.parts.subarray(i * PARTS_MAX * PART_N, i * PARTS_MAX * PART_N + np * PART_N), k * PARTS_MAX * PART_N);
      out.smoke.set(c.smoke.subarray(i * SMOKE_N, (i + 1) * SMOKE_N), k * SMOKE_N);
      out.anim[k] = c.anim[i];
      animated = animated && Number.isFinite(c.anim[i]);
    }
    if (!animated) {
      delete out.anim;
    }
    const evs = events.filter((e) => n && e.t >= t0).map((e) => ({ ...e, t: e.t - t0 }));
    return { n, ...out, events: evs, spawns: spawns.map((s) => s.slice()), meta: { ...meta } };
  }

  return {
    begin, anim, pose, drive, plant, smoke, status, parts, spawnIndex, event, clear, clip, span, dropNewest,
    size: () => size,
    capacity,
    bytes: capacity * FRAME_BYTES,
    now: () => clock,
  };
}

/* The part of a clip from t0 to t1, its clock starting at zero again. */
export function trimClip(clip, t0, t1) {
  let a = 0;
  while (a < clip.n - 1 && clip.time[a + 1] <= t0) {
    a += 1;
  }
  let b = clip.n - 1;
  while (b > a && clip.time[b - 1] >= t1) {
    b -= 1;
  }
  const n = b - a + 1;
  const base = clip.time[a];
  const time = clip.time.slice(a, b + 1).map((x) => x - base);
  return {
    ...clip,
    n,
    time,
    head: clip.head.slice(a * HEAD_N, (b + 1) * HEAD_N),
    pose: clip.pose.slice(a * POSE_N, (b + 1) * POSE_N),
    plant: clip.plant.slice(a * PLANT_N, (b + 1) * PLANT_N),
    parts: clip.parts.slice(a * PARTS_MAX * PART_N, (b + 1) * PARTS_MAX * PART_N),
    smoke: clip.smoke.slice(a * SMOKE_N, (b + 1) * SMOKE_N),
    ...(clip.anim ? { anim: clip.anim.slice(a, b + 1) } : {}),
    events: clip.events.filter((e) => e.t >= base && e.t <= clip.time[b]).map((e) => ({ ...e, t: e.t - base })),
    keys: (clip.keys || []).filter((k) => k.t >= base && k.t <= clip.time[b]).map((k) => ({ ...k, t: k.t - base })),
    meta: { ...clip.meta, duration: time[n - 1] },
    ...(clip.peers ? { peers: trimPeers(clip.peers, a, b) } : {}),
    ...(clip.paper ? { paper: trimPaper(clip.paper, a, b, base, clip.time[b]) } : {}),
  };
}

/* ---- reading a clip ---- */

/* The row at or before t, and how far t is towards the next: [k, a]. */
export function locate(clip, t) {
  const n = clip.n;
  if (n === 0) {
    return [0, 0];
  }
  const time = clip.time;
  if (t <= time[0]) {
    return [0, 0];
  }
  if (t >= time[n - 1]) {
    return [n - 1, 0];
  }
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (time[mid] <= t) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const span = time[hi] - time[lo];
  return [lo, span > 0 ? (t - time[lo]) / span : 0];
}

/* Quaternion slerp on the shorter arc, into out[o..o+3] as x, y, z, w. */
export function slerp(ax, ay, az, aw, bx, by, bz, bw, a, out, o) {
  let cos = ax * bx + ay * by + az * bz + aw * bw;
  if (cos < 0) {
    cos = -cos;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  let ka;
  let kb;
  if (cos > 0.9995) {
    ka = 1 - a;
    kb = a;
  } else {
    const th = Math.acos(cos);
    const s = Math.sin(th);
    ka = Math.sin((1 - a) * th) / s;
    kb = Math.sin(a * th) / s;
  }
  let x = ka * ax + kb * bx;
  let y = ka * ay + kb * by;
  let z = ka * az + kb * bz;
  let w = ka * aw + kb * bw;
  const len = Math.hypot(x, y, z, w) || 1;
  x /= len;
  y /= len;
  z /= len;
  w /= len;
  out[o] = x;
  out[o + 1] = y;
  out[o + 2] = z;
  out[o + 3] = w;
}

/* A sample of the clip at time t, interpolated between the two rows round
 * it: what the editor draws, at any speed. Reuses `out` when given. */
export function createSample() {
  return {
    k: 0,
    a: 0,
    pose: new Float64Array(POSE_N),
    plant: new Float64Array(PLANT_N),
    head: new Float64Array(HEAD_N),
    parts: new Float64Array(PARTS_MAX * S_DOUBLES),
    count: 0,
    smoke: new Float64Array(SMOKE_N),
    anim: null,
  };
}

/* The longest step between two rows' animation clocks that is the clock
 * running, ms; a longer one, or one back, is the clock being set (R puts
 * the lap clock back to zero) and is not drawn as traffic driving between
 * the two. A frame steps the clock at most 100 ms. */
const ANIM_RUN_MS = 250;

export function sampleAt(clip, t, s = createSample()) {
  const [k, a] = locate(clip, t);
  const k1 = Math.min(k + 1, clip.n - 1);
  s.k = k;
  s.a = a;
  if (clip.n === 0) {
    s.count = 0;
    s.anim = null;
    return s;
  }
  if (clip.anim) {
    const m0 = clip.anim[k];
    const d = clip.anim[k1] - m0;
    s.anim = d >= 0 && d <= ANIM_RUN_MS ? m0 + d * a : m0;
  } else {
    s.anim = null;
  }
  const P = clip.pose;
  const p0 = k * POSE_N;
  const p1 = k1 * POSE_N;
  for (let i = 0; i < 3; i += 1) {
    s.pose[i] = P[p0 + i] + (P[p1 + i] - P[p0 + i]) * a;
  }
  slerp(P[p0 + 3], P[p0 + 4], P[p0 + 5], P[p0 + 6], P[p1 + 3], P[p1 + 4], P[p1 + 5], P[p1 + 6], a, s.pose, 3);
  for (let i = 7; i < POSE_N; i += 1) {
    s.pose[i] = P[p0 + i] + (P[p1 + i] - P[p0 + i]) * a;
  }
  const L = clip.plant;
  const l0 = k * PLANT_N;
  const l1 = k1 * PLANT_N;
  for (let i = 0; i < 3; i += 1) {
    s.plant[i] = L[l0 + i] + (L[l1 + i] - L[l0 + i]) * a;
  }
  /* The plant's quaternion is w x y z; slerp takes x y z w. */
  const tmp = sampleQuat;
  slerp(L[l0 + 4], L[l0 + 5], L[l0 + 6], L[l0 + 3], L[l1 + 4], L[l1 + 5], L[l1 + 6], L[l1 + 3], a, tmp, 0);
  s.plant[3] = tmp[3];
  s.plant[4] = tmp[0];
  s.plant[5] = tmp[1];
  s.plant[6] = tmp[2];
  s.head.set(clip.head.subarray(k * HEAD_N, (k + 1) * HEAD_N));
  const h1 = k1 * HEAD_N;
  s.head[HEAD.speed] += (clip.head[h1 + HEAD.speed] - s.head[HEAD.speed]) * a;
  s.head[HEAD.throttle] += (clip.head[h1 + HEAD.throttle] - s.head[HEAD.throttle]) * a;
  s.head[HEAD.agl] += (clip.head[h1 + HEAD.agl] - s.head[HEAD.agl]) * a;
  /* The smoke: on as the row before has it, the nozzle and the velocity
   * between the two rows while both have it on. */
  const m0 = k * SMOKE_N;
  const m1 = k1 * SMOKE_N;
  const M = clip.smoke;
  const bothOn = M[m0 + SMOKE.on] !== 0 && M[m1 + SMOKE.on] !== 0;
  s.smoke[SMOKE.on] = M[m0 + SMOKE.on];
  for (let i = 1; i < SMOKE_N; i += 1) {
    s.smoke[i] = bothOn ? M[m0 + i] + (M[m1 + i] - M[m0 + i]) * a : M[m0 + i];
  }
  /* Parts: the row before's status and structure, the pose between. A
   * part only in the later row (the first frame of a crash) is not drawn
   * until that row. */
  const n0 = clip.head[k * HEAD_N + HEAD.parts];
  const n1 = clip.head[h1 + HEAD.parts];
  const n = n0;
  s.count = n;
  const R = clip.parts;
  const b0 = k * PARTS_MAX * PART_N;
  const b1 = k1 * PARTS_MAX * PART_N;
  const both = n1 === n0;
  for (let i = 0; i < n; i += 1) {
    const o0 = b0 + i * PART_N;
    const o1 = both ? b1 + i * PART_N : o0;
    const w = i * S_DOUBLES;
    s.parts[w + S_STATUS] = R[o0 + PART.status];
    s.parts[w + S_KIND] = R[o0 + PART.kind];
    s.parts[w + S_PARENT] = R[o0 + PART.parent];
    s.parts[w + S_BODY] = R[o0 + PART.body];
    for (let j = 0; j < 3; j += 1) {
      s.parts[w + S_DEFORM + j] = R[o0 + PART.deform + j] + (R[o1 + PART.deform + j] - R[o0 + PART.deform + j]) * a;
      s.parts[w + S_POS + j] = R[o0 + PART.pos + j] + (R[o1 + PART.pos + j] - R[o0 + PART.pos + j]) * a;
    }
    slerp(R[o0 + PART.quat + 1], R[o0 + PART.quat + 2], R[o0 + PART.quat + 3], R[o0 + PART.quat],
      R[o1 + PART.quat + 1], R[o1 + PART.quat + 2], R[o1 + PART.quat + 3], R[o1 + PART.quat], a, sampleQuat, 0);
    s.parts[w + S_QUAT] = sampleQuat[3];
    s.parts[w + S_QUAT + 1] = sampleQuat[0];
    s.parts[w + S_QUAT + 2] = sampleQuat[1];
    s.parts[w + S_QUAT + 3] = sampleQuat[2];
  }
  return s;
}

const sampleQuat = new Float64Array(4);

export { S_DOUBLES as PART_STATE_STRIDE };
