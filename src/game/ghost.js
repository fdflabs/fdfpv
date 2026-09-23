/*
 * ghost.js: recording a lap and flying it back.
 *
 * Three small machines, all downstream of the physics and all feeding
 * nothing back into it, the same standing as race.js:
 *
 *   GhostRecorder resamples the rendered pose onto the fixed ghost grid
 *   while a lap runs. It is fed once per rendered frame with the same
 *   interpolated world pose the hero craft and the race scoring get, at
 *   whatever rate the display runs, and writes 30 Hz keyframes by linear
 *   interpolation between consecutive feeds. Frames are denser than the
 *   grid on any playable machine, so the grid error is bounded by one
 *   display frame of curvature, far under what a translucent craft shows.
 *
 *   GhostLap answers "where was the ghost at t". Position is a Catmull-Rom
 *   spline through the grid, attitude is normalised lerp between
 *   neighbours, hemisphere-aligned at encode time. Time is clamped to the
 *   lap, so a caller can ask past the finish and get the finish.
 *
 *   GhostBook keeps this session's laps per course: the best and the
 *   previous. Deliberately memory only: the leaderboard is where a lap
 *   outlives the tab, and a stale ghost from a redesigned course chasing
 *   the player through new scenery is worse than no ghost.
 *
 * A recorded lap can contain a teleport: a crash recovery moves the craft
 * to the approach of the gate it was flying (see resetCraft in main.js),
 * and the lap legitimately continues. Splining across that jump would sweep
 * the ghost through the scenery at hundreds of metres a second, so segments
 * faster than any flyable speed are treated as CUTS: the sampler holds the
 * pose on the near side and reports the cut, and the shell fades the ghost
 * across it, which is what the recovery looked like to the pilot who flew
 * it.
 *
 * No import of three.js on purpose. Everything here is plain arrays, which
 * is what lets scripts/ghost-selftest.js drive all three machines in Node
 * with no browser and no GL, and lets main.js copy a sample into whatever
 * scratch objects it already owns.
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

import { GHOST_MAX_MS, GHOST_RATE_HZ } from '../share/ghostdata.js';
import { str } from '../strings/index.js';

/*
 * A grid segment faster than this is a teleport, not flight. Terminal
 * velocity is verified between 30 and 40 m/s (tests/lib/checks.js) and the
 * fastest race lines sit under 50; a crash recovery jump is RECOVER_BACK
 * plus the distance back to the gate, metres in a thirtieth of a second.
 * 100 m/s splits the two populations by a factor of two on each side.
 */
export const GHOST_CUT_SPEED = 100;

export class GhostRecorder {
  constructor(rateHz = GHOST_RATE_HZ) {
    this.rateHz = rateHz;
    this.stepMs = 1000 / rateHz;
    this.armed = false;
    this.overflowed = false;
    this.pos = [];
    this.quat = [];
    this.prev = null;
  }

  /* Arm at a lap start. Time from here on is ms from that start. */
  begin() {
    this.armed = true;
    this.overflowed = false;
    this.pos.length = 0;
    this.quat.length = 0;
    this.prev = null;
    this.pendingCut = false;
    this.nextMs = 0;
  }

  abort() {
    this.armed = false;
    this.pos.length = 0;
    this.quat.length = 0;
    this.prev = null;
    this.pendingCut = false;
  }

  /*
   * The next push is the far side of a teleport, not flight. A crash
   * recovery moves the craft with the lap still running, and the recorder
   * is not fed through the lockout; interpolating across that span would
   * write a slow glide through the scenery that no cut detector could tell
   * from flying. Instead the wreck's pose is held up to the respawn, so the
   * whole jump lands in one grid segment, which is exactly the shape the
   * replayer's cut detection is built to catch.
   */
  cutHere() {
    if (this.armed) {
      this.pendingCut = true;
    }
  }

  /*
   * One rendered frame's pose, at lapMs on the lap clock. Grid points that
   * fell between the previous feed and this one are written by linear
   * interpolation; the quaternion is nlerped, short way, and normalised, so
   * the stored keyframe is unit whatever the blend produced.
   */
  push(lapMs, x, y, z, qx, qy, qz, qw) {
    if (!this.armed || this.overflowed) {
      return;
    }
    if (lapMs > GHOST_MAX_MS) {
      /* A lap too long for the wire format. Stop recording rather than
       * truncating: a ghost that vanishes mid-lap on replay would read as a
       * bug, an absent ghost reads as a long lap. */
      this.overflowed = true;
      this.pos.length = 0;
      this.quat.length = 0;
      return;
    }
    const p = this.prev;
    if (p !== null && this.pendingCut) {
      this.pendingCut = false;
      while (this.nextMs <= lapMs) {
        this.writeFrame(p.x, p.y, p.z, p.qx, p.qy, p.qz, p.qw);
        this.nextMs += this.stepMs;
      }
      this.prev = { t: lapMs, x, y, z, qx, qy, qz, qw };
      return;
    }
    this.pendingCut = false;
    if (p === null) {
      /* First feed of the lap. The lap started mid-frame at the gate
       * crossing, so the first grid point (t = 0) is behind this feed;
       * holding this pose for it is at most one display frame of error. */
      while (this.nextMs <= lapMs) {
        this.writeFrame(x, y, z, qx, qy, qz, qw);
        this.nextMs += this.stepMs;
      }
    } else {
      while (this.nextMs <= lapMs) {
        const span = lapMs - p.t;
        const u = span > 1e-9 ? (this.nextMs - p.t) / span : 1;
        const px = p.x + (x - p.x) * u;
        const py = p.y + (y - p.y) * u;
        const pz = p.z + (z - p.z) * u;
        /* Short-way nlerp between the two feeds. */
        const dot = p.qx * qx + p.qy * qy + p.qz * qz + p.qw * qw;
        const s = dot < 0 ? -1 : 1;
        let bx = p.qx + (qx * s - p.qx) * u;
        let by = p.qy + (qy * s - p.qy) * u;
        let bz = p.qz + (qz * s - p.qz) * u;
        let bw = p.qw + (qw * s - p.qw) * u;
        const n = Math.sqrt(bx * bx + by * by + bz * bz + bw * bw);
        if (n > 1e-6) {
          bx /= n;
          by /= n;
          bz /= n;
          bw /= n;
        } else {
          bx = qx;
          by = qy;
          bz = qz;
          bw = qw;
        }
        this.writeFrame(px, py, pz, bx, by, bz, bw);
        this.nextMs += this.stepMs;
      }
    }
    this.prev = { t: lapMs, x, y, z, qx, qy, qz, qw };
  }

  writeFrame(x, y, z, qx, qy, qz, qw) {
    this.pos.push(x, y, z);
    this.quat.push(qx, qy, qz, qw);
  }

  /*
   * The lap is over; durationMs is the race's own interpolated crossing
   * time, splits its gate times. Returns the plain lap record encodeGhost
   * takes, or null when there is nothing worth keeping. The grid is
   * extended to cover the duration by holding the last feed: the finish
   * crossing happened inside the final display frame, so the hold is
   * shorter than that frame.
   */
  finish(durationMs, splits) {
    if (!this.armed || this.overflowed || this.prev === null) {
      this.abort();
      return null;
    }
    const last = this.prev;
    while (this.nextMs <= durationMs + this.stepMs) {
      this.writeFrame(last.x, last.y, last.z, last.qx, last.qy, last.qz, last.qw);
      this.nextMs += this.stepMs;
    }
    const count = this.pos.length / 3;
    const lap = count >= 2 && durationMs > 0
      ? {
        rateHz: this.rateHz,
        durationMs: Math.round(durationMs),
        splits: (splits || []).map((s) => Math.round(s)),
        count,
        pos: Float32Array.from(this.pos),
        quat: Float32Array.from(this.quat),
      }
      : null;
    this.abort();
    return lap;
  }
}

export class GhostLap {
  /*
   * data is the decoded record: { rateHz, durationMs, count, splits, pos,
   * quat }. label and name are display strings the shell shows beside the
   * gap; lapMs is the time this ghost stands for, which is durationMs for a
   * recorded lap and the board's own figure for a downloaded one.
   */
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
    /* Which grid segments are teleports, judged once so sampling stays a
     * couple of multiplies per frame. */
    const stepS = 1 / this.rateHz;
    this.cut = new Uint8Array(Math.max(0, this.count - 1));
    for (let i = 0; i < this.count - 1; i += 1) {
      const dx = this.pos[(i + 1) * 3] - this.pos[i * 3];
      const dy = this.pos[(i + 1) * 3 + 1] - this.pos[i * 3 + 1];
      const dz = this.pos[(i + 1) * 3 + 2] - this.pos[i * 3 + 2];
      const speed = Math.sqrt(dx * dx + dy * dy + dz * dz) / stepS;
      this.cut[i] = speed > GHOST_CUT_SPEED ? 1 : 0;
    }
  }

  /*
   * Pose at tMs from lap start, written into out = { px, py, pz, qx, qy,
   * qz, qw, cut }. Clamped to the lap at both ends. cut is true while t
   * sits inside a teleport segment, which is the shell's cue to fade.
   */
  sample(tMs, out) {
    const t = Math.max(0, Math.min(this.durationMs, tMs));
    const s = (t * this.rateHz) / 1000;
    let i = Math.floor(s);
    if (i >= this.count - 1) {
      i = this.count - 2;
    }
    const u = Math.min(1, Math.max(0, s - i));
    const inCut = this.cut[i] === 1;
    if (inCut) {
      /* Hold the near side of the jump. The far side arrives when t enters
       * the next segment, and the shell has faded across the seam. */
      out.px = this.pos[i * 3];
      out.py = this.pos[i * 3 + 1];
      out.pz = this.pos[i * 3 + 2];
    } else {
      /*
       * Catmull-Rom through the four surrounding keyframes, falling back to
       * the segment's own line at the lap ends and beside a cut: a spline
       * tangent built from a teleported neighbour would bend this segment
       * toward the jump.
       */
      const p1x = this.pos[i * 3];
      const p1y = this.pos[i * 3 + 1];
      const p1z = this.pos[i * 3 + 2];
      const p2x = this.pos[(i + 1) * 3];
      const p2y = this.pos[(i + 1) * 3 + 1];
      const p2z = this.pos[(i + 1) * 3 + 2];
      const okBefore = i > 0 && this.cut[i - 1] === 0;
      const okAfter = i + 2 <= this.count - 1 && this.cut[i + 1] === 0;
      if (okBefore && okAfter) {
        const p0x = this.pos[(i - 1) * 3];
        const p0y = this.pos[(i - 1) * 3 + 1];
        const p0z = this.pos[(i - 1) * 3 + 2];
        const p3x = this.pos[(i + 2) * 3];
        const p3y = this.pos[(i + 2) * 3 + 1];
        const p3z = this.pos[(i + 2) * 3 + 2];
        const u2 = u * u;
        const u3 = u2 * u;
        out.px = 0.5 * ((2 * p1x) + (p2x - p0x) * u
          + (2 * p0x - 5 * p1x + 4 * p2x - p3x) * u2
          + (3 * p1x - p0x - 3 * p2x + p3x) * u3);
        out.py = 0.5 * ((2 * p1y) + (p2y - p0y) * u
          + (2 * p0y - 5 * p1y + 4 * p2y - p3y) * u2
          + (3 * p1y - p0y - 3 * p2y + p3y) * u3);
        out.pz = 0.5 * ((2 * p1z) + (p2z - p0z) * u
          + (2 * p0z - 5 * p1z + 4 * p2z - p3z) * u2
          + (3 * p1z - p0z - 3 * p2z + p3z) * u3);
      } else {
        out.px = p1x + (p2x - p1x) * u;
        out.py = p1y + (p2y - p1y) * u;
        out.pz = p1z + (p2z - p1z) * u;
      }
    }
    /* Attitude: nlerp, already short-way from the encoder's hemisphere
     * pass. Across a cut this blends the two real attitudes, which is fine
     * under a fade. */
    const a = i * 4;
    const b = (i + 1) * 4;
    let qx = this.quat[a] + (this.quat[b] - this.quat[a]) * u;
    let qy = this.quat[a + 1] + (this.quat[b + 1] - this.quat[a + 1]) * u;
    let qz = this.quat[a + 2] + (this.quat[b + 2] - this.quat[a + 2]) * u;
    let qw = this.quat[a + 3] + (this.quat[b + 3] - this.quat[a + 3]) * u;
    const n = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw);
    if (n > 1e-6) {
      qx /= n;
      qy /= n;
      qz /= n;
      qw /= n;
    } else {
      qx = 0;
      qy = 0;
      qz = 0;
      qw = 1;
    }
    out.qx = qx;
    out.qy = qy;
    out.qz = qz;
    out.qw = qw;
    out.cut = inCut;
    return out;
  }

  /* The ghost's time at gate k of a lap (0-based), or null past its data.
   * The player's k-th crossing against this is the gap readout. */
  splitMs(k) {
    return k >= 0 && k < this.splits.length ? this.splits[k] : null;
  }
}

/*
 * This session's recorded laps, per course. Two slots each: the previous
 * lap, which is always the one just flown, and the best, which only moves
 * for a faster one.
 */
export class GhostBook {
  constructor() {
    this.byCourse = new Map();
  }

  courseSlot(key) {
    let slot = this.byCourse.get(key);
    if (!slot) {
      slot = { best: null, previous: null };
      this.byCourse.set(key, slot);
    }
    return slot;
  }

  /* A finished lap record (GhostRecorder.finish output). Returns what
   * changed, so the shell can say "new session best" only when it is. */
  keep(key, lapRecord) {
    if (!lapRecord) {
      return { best: false };
    }
    const slot = this.courseSlot(key);
    const lap = new GhostLap(lapRecord, {
      label: str('ghost.previous_lap'),
      source: 'session',
    });
    slot.previous = lap;
    if (!slot.best || lapRecord.durationMs < slot.best.durationMs) {
      /* Two GhostLap wrappers over the same arrays, so retiring the
       * previous slot cannot retire the best. The arrays are shared and
       * immutable from here on. */
      slot.best = new GhostLap(lapRecord, {
        label: str('ghost.session_best'),
        source: 'session',
      });
      return { best: true };
    }
    return { best: false };
  }

  best(key) {
    const slot = this.byCourse.get(key);
    return slot ? slot.best : null;
  }

  previous(key) {
    const slot = this.byCourse.get(key);
    return slot ? slot.previous : null;
  }
}

/*
 * A peer's craft, live. Frames arrive at the ghost rate on the sender's
 * clock, over a network that reorders nothing but delays everything by a
 * varying amount. The playhead runs on the sender's clock too, LIVE_DELAY_MS
 * behind the newest frame, and advances by the local frame time, so a
 * frame that is late by less than the delay is never waited for and a burst
 * does not make the craft leap. Position is lerped and attitude nlerped
 * between the two frames around the playhead, as GhostRecorder resamples;
 * past the newest frame the craft holds its last pose, and a hole longer
 * than LIVE_STALE_MS makes it fade.
 */
export const LIVE_DELAY_MS = 150;
export const LIVE_STALE_MS = 2000;
/* The playhead may trail its target by this much before it snaps forward,
 * which is what happens after a tab was in the background. */
export const LIVE_CATCHUP_MS = 100;
const LIVE_RING = 64;

export class LiveGhost {
  constructor() {
    this.frames = [];       /* newest last, at most LIVE_RING */
    this.playhead = null;   /* sender ms */
    this.lastWall = null;
    this.lastArrival = null; /* local ms of the newest frame */
  }

  push(frame, wallMs) {
    const last = this.frames[this.frames.length - 1];
    if (last && frame.tMs <= last.tMs) {
      return; /* older than what is here: dropped, never reordered */
    }
    this.frames.push(frame);
    this.lastArrival = wallMs;
    if (this.frames.length > LIVE_RING) {
      this.frames.splice(0, this.frames.length - LIVE_RING);
    }
  }

  newestMs() {
    return this.frames.length ? this.frames[this.frames.length - 1].tMs : null;
  }

  /* Writes the pose at the playhead into out and returns the presence,
   * 0 to 1: nothing yet, or gone stale, is 0. wallMs is the local clock. */
  sample(wallMs, out) {
    if (this.frames.length === 0) {
      return 0;
    }
    const newest = this.newestMs();
    const target = newest - LIVE_DELAY_MS;
    if (this.playhead == null || this.lastWall == null) {
      this.playhead = target;
    } else {
      this.playhead += Math.max(0, wallMs - this.lastWall);
      if (this.playhead > target) {
        this.playhead = target;
      } else if (target - this.playhead > LIVE_CATCHUP_MS) {
        this.playhead = target - LIVE_CATCHUP_MS;
      }
    }
    this.lastWall = wallMs;
    const t = this.playhead;
    let i = this.frames.length - 1;
    while (i > 0 && this.frames[i - 1].tMs > t) {
      i -= 1;
    }
    /* frames[i-1].tMs <= t < frames[i].tMs when both exist */
    const b = this.frames[i];
    const a = i > 0 ? this.frames[i - 1] : b;
    const span = b.tMs - a.tMs;
    const u = span > 0 ? Math.min(1, Math.max(0, (t - a.tMs) / span)) : 1;
    out.px = a.px + (b.px - a.px) * u;
    out.py = a.py + (b.py - a.py) * u;
    out.pz = a.pz + (b.pz - a.pz) * u;
    const dot = a.qx * b.qx + a.qy * b.qy + a.qz * b.qz + a.qw * b.qw;
    const s = dot < 0 ? -1 : 1;
    let qx = a.qx + (b.qx * s - a.qx) * u;
    let qy = a.qy + (b.qy * s - a.qy) * u;
    let qz = a.qz + (b.qz * s - a.qz) * u;
    let qw = a.qw + (b.qw * s - a.qw) * u;
    const n = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw);
    if (n > 1e-6) {
      qx /= n;
      qy /= n;
      qz /= n;
      qw /= n;
    } else {
      qx = b.qx;
      qy = b.qy;
      qz = b.qz;
      qw = b.qw;
    }
    out.qx = qx;
    out.qy = qy;
    out.qz = qz;
    out.qw = qw;
    out.cut = false;
    if (this.lastArrival != null && wallMs - this.lastArrival > LIVE_STALE_MS) {
      return 0;
    }
    return 1;
  }
}

/*
 * The sender's side: render frames arrive at whatever rate the screen
 * runs, and the wire wants the ghost rate. Same resampling as
 * GhostRecorder.push, one grid step at a time, handed to emit as
 * (tMs, x, y, z, qx, qy, qz, qw) with the quaternion hemisphere aligned to
 * the previous emitted frame.
 */
export class LiveSender {
  constructor(emit, rateHz = GHOST_RATE_HZ) {
    this.emit = emit;
    this.stepMs = 1000 / rateHz;
    this.prev = null;
    this.nextMs = null;
    this.lastQ = { x: 0, y: 0, z: 0, w: 1 };
  }

  reset() {
    this.prev = null;
    this.nextMs = null;
  }

  feed(tMs, x, y, z, qx, qy, qz, qw) {
    if (this.prev === null) {
      this.prev = { t: tMs, x, y, z, qx, qy, qz, qw };
      this.nextMs = tMs;
      this.write(tMs, x, y, z, qx, qy, qz, qw);
      this.nextMs += this.stepMs;
      return;
    }
    const p = this.prev;
    while (this.nextMs <= tMs) {
      const span = tMs - p.t;
      const u = span > 1e-9 ? (this.nextMs - p.t) / span : 1;
      const dot = p.qx * qx + p.qy * qy + p.qz * qz + p.qw * qw;
      const s = dot < 0 ? -1 : 1;
      let bx = p.qx + (qx * s - p.qx) * u;
      let by = p.qy + (qy * s - p.qy) * u;
      let bz = p.qz + (qz * s - p.qz) * u;
      let bw = p.qw + (qw * s - p.qw) * u;
      const n = Math.sqrt(bx * bx + by * by + bz * bz + bw * bw);
      if (n > 1e-6) {
        bx /= n;
        by /= n;
        bz /= n;
        bw /= n;
      } else {
        bx = qx;
        by = qy;
        bz = qz;
        bw = qw;
      }
      this.write(this.nextMs, p.x + (x - p.x) * u, p.y + (y - p.y) * u, p.z + (z - p.z) * u, bx, by, bz, bw);
      this.nextMs += this.stepMs;
    }
    this.prev = { t: tMs, x, y, z, qx, qy, qz, qw };
  }

  write(tMs, x, y, z, qx, qy, qz, qw) {
    const l = this.lastQ;
    if (qx * l.x + qy * l.y + qz * l.z + qw * l.w < 0) {
      qx = -qx;
      qy = -qy;
      qz = -qz;
      qw = -qw;
    }
    this.lastQ = { x: qx, y: qy, z: qz, w: qw };
    this.emit(tMs, x, y, z, qx, qy, qz, qw);
  }
}
