/*
 * ghost.js: the pilot's own laps and other pilots' live flights, as poses
 * on a fixed time grid.
 *
 * A lap is recorded by resampling render frames (whatever the display rate)
 * onto a grid at GHOST_RATE_HZ, so the record that is uploaded, judged by
 * the board and replayed is the same no matter who flew it on what screen.
 * Replay splines between grid points and refuses to smooth across a
 * teleport. Live flights take the same grid over the network and play back
 * a little behind the newest frame so jitter does not show.
 *
 * The grid values are compared bit for bit by the golden record, so every
 * sum below keeps its written order.
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

import { GHOST_MAX_MS, GHOST_RATE_HZ } from '../share/ghostdata.js';
import { str } from '../strings/index.js';

export const GHOST_CUT_SPEED = 100;
export const LIVE_DELAY_MS = 150;
export const LIVE_STALE_MS = 2000;
export const LIVE_CATCHUP_MS = 100;

const LIVE_RING = 64;

/* Divide by the length rather than multiply by its inverse: the recorded
 * bytes depend on which. Returns null when the vector is too short to
 * point anywhere, and each caller picks its own fallback. */
function unit(x, y, z, w) {
  const n = Math.sqrt(x * x + y * y + z * z + w * w);
  if (!(n > 1e-6)) return null;
  return [x / n, y / n, z / n, w / n];
}

/* Blend two attitudes taking the short way round; a degenerate blend falls
 * back to b as given. a and b are [x, y, z, w]. */
function shortBlend(a, b, u) {
  const s = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
  return unit(
    a[0] + (b[0] * s - a[0]) * u,
    a[1] + (b[1] * s - a[1]) * u,
    a[2] + (b[2] * s - a[2]) * u,
    a[3] + (b[3] * s - a[3]) * u,
  ) || b;
}

/* A feed is [t, x, y, z, qx, qy, qz, qw]. Returns the pose
 * [x, y, z, qx, qy, qz, qw] at time g between feeds a and b. */
function between(a, b, g) {
  const span = b[0] - a[0];
  const u = span > 1e-9 ? (g - a[0]) / span : 1;
  const q = shortBlend(a.slice(4), b.slice(4), u);
  return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u, ...q];
}

export class GhostRecorder {
  constructor(rateHz = GHOST_RATE_HZ) {
    this.rateHz = rateHz;
    this.step = 1000 / rateHz;
    this.armed = false;
    this.pos = [];
    this.quat = [];
    this.overflow = false;
    this.last = null;
    this.cutPending = false;
    this.next = 0;
  }

  begin() {
    this.armed = true;
    this.overflow = false;
    this.clear();
    // The lap clock starts at the timing gate, so the grid does too.
    this.next = 0;
  }

  abort() {
    this.armed = false;
    this.clear();
  }

  clear() {
    this.pos.length = 0;
    this.quat.length = 0;
    this.last = null;
    this.cutPending = false;
  }

  cutHere() {
    if (this.armed) this.cutPending = true;
  }

  /* The grid cursor accumulates by addition, never i * step: the two differ
   * in the last bits, and the board has recorded laps made the first way. */
  fill(untilMs, poseAt) {
    while (this.next <= untilMs) {
      const p = poseAt(this.next);
      this.pos.push(p[0], p[1], p[2]);
      this.quat.push(p[3], p[4], p[5], p[6]);
      this.next += this.step;
    }
  }

  push(lapMs, x, y, z, qx, qy, qz, qw) {
    if (!this.armed || this.overflow) return;
    if (lapMs > GHOST_MAX_MS) {
      // Too long for the wire format: drop it now rather than at upload.
      this.overflow = true;
      this.pos.length = 0;
      this.quat.length = 0;
      return;
    }
    const feed = [lapMs, x, y, z, qx, qy, qz, qw];
    const prev = this.last;
    const jumped = this.cutPending;
    this.cutPending = false;
    if (!prev) {
      // A first feed before the gate writes nothing; t = 0 is interpolated later.
      this.fill(lapMs, () => feed.slice(1));
    } else if (jumped) {
      // Hold the near side so no grid point lands mid teleport.
      this.fill(lapMs, () => prev.slice(1));
    } else {
      this.fill(lapMs, (g) => between(prev, feed, g));
    }
    this.last = feed;
  }

  finish(durationMs, splits) {
    const last = this.last;
    if (!this.armed || this.overflow || !last) {
      this.abort();
      return null;
    }
    // One step past the finish so replay at the very end has a segment to sit in.
    this.fill(durationMs + this.step, () => last.slice(1));
    const count = this.pos.length / 3;
    let record = null;
    if (count >= 2 && durationMs > 0) {
      record = {
        rateHz: this.rateHz,
        durationMs: Math.round(durationMs),
        splits: (splits || []).map((s) => Math.round(s)),
        count,
        pos: Float32Array.from(this.pos),
        quat: Float32Array.from(this.quat),
      };
    }
    this.abort();
    return record;
  }
}

export class GhostLap {
  constructor(data, { label = 'Ghost', name = '', source = 'session' } = {}) {
    this.rateHz = data.rateHz;
    this.durationMs = data.durationMs;
    this.count = data.count;
    this.splits = data.splits || [];
    this.pos = data.pos;
    this.quat = data.quat;
    this.label = label;
    this.name = name;
    this.source = source;
    this.cut = new Uint8Array(Math.max(0, this.count - 1));
    // Divide by the step in seconds, not multiply by the rate: the rounding differs.
    const stepS = 1 / this.rateHz;
    const p = this.pos;
    for (let i = 0; i < this.cut.length; i += 1) {
      const a = 3 * i;
      const dx = p[a + 3] - p[a];
      const dy = p[a + 4] - p[a + 1];
      const dz = p[a + 5] - p[a + 2];
      this.cut[i] = Math.sqrt(dx * dx + dy * dy + dz * dz) / stepS > GHOST_CUT_SPEED ? 1 : 0;
    }
  }

  sample(tMs, out) {
    const { count, cut, pos: p, quat: q } = this;
    // Math.max/min rather than comparisons, so a NaN time stays NaN.
    const t = Math.max(0, Math.min(this.durationMs, tMs));
    const s = (t * this.rateHz) / 1000;
    let i = Math.floor(s);
    if (i >= count - 1) i = count - 2;
    const u = Math.min(1, Math.max(0, s - i));
    const inCut = cut[i] === 1;
    const smooth = !inCut && i > 0 && cut[i - 1] === 0 && i + 2 <= count - 1 && cut[i + 1] === 0;
    const xyz = [0, 1, 2].map((k) => {
      const p1 = p[3 * i + k];
      if (inCut) return p1;
      const p2 = p[3 * i + 3 + k];
      if (!smooth) return p1 + (p2 - p1) * u;
      const p0 = p[3 * i - 3 + k];
      const p3 = p[3 * i + 6 + k];
      const u2 = u * u;
      const u3 = u2 * u;
      return 0.5 * (((2 * p1 + (p2 - p0) * u) + (((2 * p0 - 5 * p1) + 4 * p2) - p3) * u2)
        + (((3 * p1 - p0) - 3 * p2) + p3) * u3);
    });
    const a = 4 * i;
    const b = a + 4;
    const att = unit(
      q[a] + (q[b] - q[a]) * u,
      q[a + 1] + (q[b + 1] - q[a + 1]) * u,
      q[a + 2] + (q[b + 2] - q[a + 2]) * u,
      q[a + 3] + (q[b + 3] - q[a + 3]) * u,
    ) || [0, 0, 0, 1];
    out.px = xyz[0];
    out.py = xyz[1];
    out.pz = xyz[2];
    out.qx = att[0];
    out.qy = att[1];
    out.qz = att[2];
    out.qw = att[3];
    out.cut = inCut;
    return out;
  }

  splitMs(k) {
    return k >= 0 && k < this.splits.length ? this.splits[k] : null;
  }
}

export class GhostBook {
  constructor() {
    this.courses = new Map();
  }

  keep(key, record) {
    if (!record) return { best: false };
    let slot = this.courses.get(key);
    if (!slot) {
      slot = { best: null, previous: null };
      this.courses.set(key, slot);
    }
    slot.previous = new GhostLap(record, { label: str('ghost.previous_lap'), source: 'session' });
    if (slot.best && !(record.durationMs < slot.best.durationMs)) return { best: false };
    slot.best = new GhostLap(record, { label: str('ghost.session_best'), source: 'session' });
    return { best: true };
  }

  best(key) {
    return this.courses.get(key)?.best ?? null;
  }

  previous(key) {
    return this.courses.get(key)?.previous ?? null;
  }
}

const frameQuat = (f) => [f.qx, f.qy, f.qz, f.qw];

export class LiveGhost {
  constructor() {
    this.frames = [];
    this.playhead = null;
    this.lastWall = null;
    this.arrivedWall = null;
  }

  push(frame, wallMs) {
    const newest = this.frames[this.frames.length - 1];
    if (newest && frame.tMs <= newest.tMs) return;
    this.frames.push(frame);
    this.arrivedWall = wallMs;
    if (this.frames.length > LIVE_RING) this.frames.shift();
  }

  newestMs() {
    const n = this.frames.length;
    return n ? this.frames[n - 1].tMs : null;
  }

  sample(wallMs, out) {
    const frames = this.frames;
    if (!frames.length) return 0;
    let j = frames.length - 1;
    const target = frames[j].tMs - LIVE_DELAY_MS;
    if (this.playhead == null || this.lastWall == null) {
      this.playhead = target;
    } else {
      // Follow the local clock, but never run ahead of the delayed target
      // nor lag it by more than the catch-up window after a burst.
      let ph = this.playhead + Math.max(0, wallMs - this.lastWall);
      if (ph > target) ph = target;
      else if (target - ph > LIVE_CATCHUP_MS) ph = target - LIVE_CATCHUP_MS;
      this.playhead = ph;
    }
    this.lastWall = wallMs;
    const ph = this.playhead;
    while (j > 0 && frames[j - 1].tMs > ph) j -= 1;
    const B = frames[j];
    const A = frames[j > 0 ? j - 1 : 0];
    const span = B.tMs - A.tMs;
    const u = span > 0 ? Math.min(1, Math.max(0, (ph - A.tMs) / span)) : 1;
    const q = shortBlend(frameQuat(A), frameQuat(B), u);
    out.px = A.px + (B.px - A.px) * u;
    out.py = A.py + (B.py - A.py) * u;
    out.pz = A.pz + (B.pz - A.pz) * u;
    out.qx = q[0];
    out.qy = q[1];
    out.qz = q[2];
    out.qw = q[3];
    out.cut = false;
    const stale = this.arrivedWall != null && wallMs - this.arrivedWall > LIVE_STALE_MS;
    return stale ? 0 : 1;
  }
}

export class LiveSender {
  constructor(emit, rateHz = GHOST_RATE_HZ) {
    this.emit = emit;
    this.step = 1000 / rateHz;
    this.last = null;
    this.next = null;
    // The last attitude sent, so consecutive frames stay in one hemisphere
    // and the wire's quantised quaternions do not flip sign mid flight.
    this.ref = [0, 0, 0, 1];
  }

  reset() {
    this.last = null;
    this.next = null;
  }

  send(t, x, y, z, q) {
    const r = this.ref;
    if (q[0] * r[0] + q[1] * r[1] + q[2] * r[2] + q[3] * r[3] < 0) q = q.map((c) => -c);
    this.ref = q;
    this.emit(t, x, y, z, q[0], q[1], q[2], q[3]);
  }

  feed(tMs, x, y, z, qx, qy, qz, qw) {
    const feed = [tMs, x, y, z, qx, qy, qz, qw];
    const prev = this.last;
    if (!prev) {
      // Unlike a lap, the live grid is anchored at the first frame's own time.
      this.last = feed;
      this.next = tMs;
      this.send(tMs, x, y, z, feed.slice(4));
      this.next += this.step;
      return;
    }
    while (this.next <= tMs) {
      const p = between(prev, feed, this.next);
      this.send(this.next, p[0], p[1], p[2], p.slice(3));
      this.next += this.step;
    }
    this.last = feed;
  }
}
