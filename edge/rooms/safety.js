/*
 * safety.js: the controls a room full of children needs (Phase 5,
 * docs/MULTIPLAYER-PLAN.md section 9), as one module the room core
 * (edge/rooms/core.js) calls from two places: every text message a seated
 * pilot sends, and every POSE. No Cloudflare API, so scripts/rooms-selftest.js
 * drives it in Node with the core.
 *
 *   quick chat and emotes   an index into a fixed list (src/share/roomwire.js),
 *                           rebuilt by the room from the index alone, never
 *                           relayed as the client wrote it; CHAT_BURST at
 *                           once, one per CHAT_EVERY_MS after
 *   mute                    a pilot's own set; the room sends a muted
 *                           seat's chat and emotes to nobody who muted it
 *   report                  a reason index; reports from distinct pilots
 *                           within REPORT_WINDOW_MS that reach max(2, a
 *                           third of the room) remove the target for
 *                           REMOVE_MS; a pilot files REPORTS_PER_WINDOW;
 *                           an unreport takes the sender's own report
 *                           back while it still counts
 *   the room's name         the reason ROOM_NAME_REPORT is against the
 *                           room's typed name, not a seat: the same count
 *                           of distinct pilots takes the name away for the
 *                           room's life, which then shows its picker name
 *                           and is never listed again (core.js hideName)
 *   ramming                 noteHit(), for the mid air referee (Phase 3):
 *                           a seat in more than RAM_HITS hits in
 *                           RAM_WINDOW_MS is benched, untouchable and
 *                           unable to touch, for BENCH_MS
 *   pose sanity             an impossible pose is dropped, and
 *                           IMPOSSIBLE_LIMIT of them in a minute removes
 *                           the seat; a teleport (a respawn, or a forgery)
 *                           makes the seat spawning for SPAWN_MS
 *
 * A seat that is spawning or benched has FLAG_SPAWNING set by the room on
 * every pose it relays, whatever the sender wrote, so every receiver and
 * the referee see the same thing.
 *
 * WHAT IS KEPT, AND WHERE. A pilot's mute set is in their seat record
 * (and so in their socket's attachment, which survives a hibernation):
 * seat tokens, nothing else. Reports, allowances, hits and pose history
 * are in this object's memory only and go with it; a removal is on the
 * core's kick list (core.js keepOut: the token kept out, the address's
 * new joins slowed), in memory, for REMOVE_MS. Nothing
 * here is written to storage or to a log.
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

import {
  CLOSE_REMOVED, FLAG_SPAWNING, POSE_BYTES, REPORT_REASONS, REPORT_WINDOW_MS, ROOM_NAME_REPORT,
  chatAllowance, eventPresetId, takeChat,
} from '../../src/share/roomwire.js';

export { REPORT_WINDOW_MS };
export const REPORTS_PER_WINDOW = 3;
export const REMOVE_MS = 30 * 60 * 1000;
export const RAM_WINDOW_MS = 5 * 60 * 1000;
export const RAM_HITS = 3;
export const BENCH_MS = 2 * 60 * 1000;
export const SPAWN_MS = 5000;
/* src/game/verify.js TELEPORT_SPEED, the same number the board refuses a
 * lap at: terminal velocity is 30 to 40 m/s and the fastest planes and race
 * lines sit under 50, so 100 m/s is flight on one side and a jump on the
 * other. Kept here, not imported, because verify.js pulls the race and the
 * builder into the Worker's bundle; rooms:selftest checks the two agree. */
export const POSE_MAX_SPEED = 100;
/* Further out than any world reaches (the Alps valley is six kilometres),
 * and a sample time further from the room's clock than any honest clock
 * estimate is: both are forgeries or a broken client, never flight. */
export const WORLD_LIMIT_M = 50000;
export const POSE_CLOCK_SLOP_MS = 10000;
export const IMPOSSIBLE_LIMIT = 30;

function recent(times, now, windowMs) {
  while (times.length && now - times[0] >= windowMs) {
    times.shift();
  }
  return times;
}

export class RoomSafety {
  constructor(core) {
    this.core = core;
    /* token -> what this module knows of that pilot, in memory only. */
    this.pilots = new Map();
    /* [{ target, seat, from, by, at }]: target the reported token (or
     * 'room') and seat its seat then, from the reporter's address or
     * token, by the reporter's own token, the one pilot who may take it
     * back (unreport). */
    this.reports = [];
  }

  pilot(s, now) {
    let p = this.pilots.get(s.token);
    if (!p) {
      if (this.pilots.size > 4 * this.core.meta.cap) {
        const seated = new Set([...this.core.seats.values()].map((x) => x.token));
        for (const token of this.pilots.keys()) {
          if (!seated.has(token)) {
            this.pilots.delete(token);
          }
        }
      }
      p = { chat: chatAllowance(now), filed: [], hits: [], bad: [], benchUntil: 0, spawnUntil: 0, last: null };
      this.pilots.set(s.token, p);
    }
    return p;
  }

  seatConn(seat) {
    for (const [conn, s] of this.core.seats) {
      if (s.seat === seat) {
        return conn;
      }
    }
    return null;
  }

  /*
   * A text message from a seated pilot: the actions, or null when the
   * message is not this module's (the core, or another phase, handles it).
   * A malformed one of ours is refused with no actions at all.
   */
  text(conn, s, msg, now) {
    if (msg.type === 'event' && (msg.kind === 'chat' || msg.kind === 'emote')) {
      return this.event(conn, s, msg, now);
    }
    if (msg.type === 'mute') {
      return this.mute(conn, s, msg);
    }
    if (msg.type === 'report') {
      return this.report(conn, s, msg, now);
    }
    if (msg.type === 'unreport') {
      return this.unreport(conn, s, msg, now);
    }
    return null;
  }

  event(conn, s, msg, now) {
    const id = eventPresetId(msg);
    if (id < 0 || !takeChat(this.pilot(s, now).chat, now)) {
      return [];
    }
    const data = JSON.stringify({ type: 'event', kind: msg.kind, seat: s.seat, id });
    const out = [];
    for (const [other, t] of this.core.seats) {
      if (other !== conn && !(t.muted && t.muted.includes(s.token))) {
        out.push({ send: other, data });
      }
    }
    return out;
  }

  /* The pilot's whole mute set, by seat, kept as the seats' tokens so a
   * muted pilot who drops and takes their seat back is still muted. */
  mute(conn, s, msg) {
    if (!Array.isArray(msg.seats) || msg.seats.length > this.core.meta.cap) {
      return [];
    }
    const tokens = [];
    for (const [, t] of this.core.seats) {
      if (t !== s && msg.seats.includes(t.seat)) {
        tokens.push(t.token);
      }
    }
    s.muted = tokens;
    return [{ attach: conn, value: this.core.attachmentOf(s) }];
  }

  report(conn, s, msg, now) {
    const reason = msg.reason;
    if (!Number.isInteger(reason) || reason < 0 || reason >= REPORT_REASONS.length) {
      return [];
    }
    /* The room's name: its target is the room, its seat 0 on the reply. */
    const naming = reason === ROOM_NAME_REPORT;
    const targetConn = naming ? null : this.seatConn(msg.seat);
    if (naming ? this.core.meta.name == null : (!targetConn || msg.seat === s.seat)) {
      return [];
    }
    const filed = recent(this.pilot(s, now).filed, now, REPORT_WINDOW_MS);
    if (filed.length >= REPORTS_PER_WINDOW) {
      return [];
    }
    filed.push(now);
    /* A token, or 'room' for the name, which no token can be. */
    const target = naming ? 'room' : this.core.seats.get(targetConn).token;
    /* Distinct by address where there is one, so two tabs on one machine
     * are one reporter. */
    const from = s.address || s.token;
    this.reports = this.reports.filter((r) => now - r.at < REPORT_WINDOW_MS);
    if (!this.reports.some((r) => r.target === target && r.from === from)) {
      this.reports.push({ target, seat: naming ? 0 : msg.seat, from, by: s.token, at: now });
    }
    const out = [{ send: conn, data: JSON.stringify({ type: 'reported', seat: naming ? 0 : msg.seat }) }];
    if (this.reports.filter((r) => r.target === target).length < this.reportsToRemove()) {
      return out;
    }
    if (naming) {
      this.reports = this.reports.filter((r) => r.target !== 'room');
      return [...out, ...this.core.hideName()];
    }
    return [...out, ...this.remove(targetConn, now)];
  }

  /*
   * A report taken back by the pilot who filed it (a report sent by
   * accident): their own report on that seat, while it still counts, is
   * gone, so it helps remove nobody. Only by, the reporter's token, takes
   * it back: a second tab on the same address was never a second reporter
   * and cannot undo the first's. The filed allowance is not given back,
   * so reporting and taking it back over and over costs the reporter
   * their reports. The mute that came with the report is the client's,
   * sent as a mute of its own.
   */
  unreport(conn, s, msg, now) {
    if (!Number.isInteger(msg.seat) || msg.seat < 1) {
      return [];
    }
    const counting = this.reports.filter((r) => now - r.at < REPORT_WINDOW_MS);
    const mine = (r) => r.by === s.token && r.seat === msg.seat;
    const undone = counting.some(mine);
    this.reports = counting.filter((r) => !mine(r));
    return [{ send: conn, data: JSON.stringify({ type: 'unreported', seat: msg.seat, undone }) }];
  }

  reportsToRemove() {
    return Math.max(2, Math.ceil(this.core.seats.size / 3));
  }

  /* Out of the room, and kept out for REMOVE_MS (core.js keepOut). */
  remove(conn, now) {
    const s = this.core.seats.get(conn);
    if (!s) {
      return [];
    }
    this.core.keepOut(s, now, REMOVE_MS);
    this.core.seats.delete(conn);
    this.reports = this.reports.filter((r) => r.target !== s.token);
    return [
      { close: conn, code: CLOSE_REMOVED, reason: 'removed' },
      ...this.core.others(conn, JSON.stringify({ type: 'leave', seat: s.seat, host: this.core.host() })),
    ];
  }

  /*
   * A POSE from a seated pilot, already the right length and under the
   * rate: { bytes, actions }, bytes null when it is not relayed. The bytes
   * are the sender's, or a copy with FLAG_SPAWNING set.
   */
  pose(conn, s, bytes, now) {
    const p = this.pilot(s, now);
    const v = new DataView(bytes.buffer, bytes.byteOffset, POSE_BYTES);
    const t = v.getUint32(4, true);
    const x = v.getFloat32(8, true);
    const y = v.getFloat32(12, true);
    const z = v.getFloat32(16, true);
    const speed = Math.hypot(v.getInt16(28, true), v.getInt16(30, true), v.getInt16(32, true)) / 100;
    const possible = Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
      && Math.abs(x) < WORLD_LIMIT_M && Math.abs(y) < WORLD_LIMIT_M && Math.abs(z) < WORLD_LIMIT_M
      && speed <= POSE_MAX_SPEED
      && Math.abs(t - this.core.roomMs(now)) <= POSE_CLOCK_SLOP_MS;
    if (!possible) {
      const bad = recent(p.bad, now, 60000);
      bad.push(now);
      return { bytes: null, actions: bad.length >= IMPOSSIBLE_LIMIT ? this.remove(conn, now) : [] };
    }
    /* The first pose is a spawn, and a jump faster than flight is a
     * respawn or a forgery: either way the seat cannot touch anyone for
     * SPAWN_MS. */
    const last = p.last;
    if (!last || (t > last.t && Math.hypot(x - last.x, y - last.y, z - last.z) / ((t - last.t) / 1000) > POSE_MAX_SPEED)) {
      p.spawnUntil = now + SPAWN_MS;
    }
    if (!last || t > last.t) {
      p.last = { t, x, y, z };
    }
    if (now >= p.spawnUntil && now >= p.benchUntil) {
      return { bytes, actions: [] };
    }
    const marked = bytes.slice();
    marked[1] |= FLAG_SPAWNING;
    return { bytes: marked, actions: [] };
  }

  /* The mid air referee's hit between two seats. Both sides count: a
   * pilot rammed over and over is benched too, which is protection, not
   * punishment, since benched means nobody can touch them. */
  noteHit(seatA, seatB, now) {
    for (const seat of [seatA, seatB]) {
      const conn = this.seatConn(seat);
      if (!conn) {
        continue;
      }
      const p = this.pilot(this.core.seats.get(conn), now);
      const hits = recent(p.hits, now, RAM_WINDOW_MS);
      hits.push(now);
      if (hits.length > RAM_HITS) {
        p.benchUntil = now + BENCH_MS;
      }
    }
  }

  /* Whether the referee must leave this seat out: spawning or benched. */
  untouchable(seat, now) {
    const conn = this.seatConn(seat);
    const p = conn ? this.pilots.get(this.core.seats.get(conn).token) : null;
    return Boolean(p) && (now < p.spawnUntil || now < p.benchUntil);
  }
}
