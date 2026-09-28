/*
 * tag.js: Catch the Ace! (¡Atrapa al As!), a room's tag match
 * (docs/TAG-PLAN.md). The room's half; the client's is src/share/roomtag.js.
 *
 * One pilot is the Ace and scores a point a second; everybody else hunts
 * it, and the first hunter to touch it takes the crown. The room is the
 * referee of every touch, with Phase 3's rule (src/game/midair.js judge)
 * run with a gap instead of an overlap: any part box of a hunter within
 * TAG_M of any part box of the Ace, on every separating axis, is a tag.
 * The first to reach the goal wins, the instant they reach it.
 *
 * ONE TIMELINE, JUDGED IN ORDER. The crown and the points are decided on
 * the room clock, millisecond by millisecond, over the span every seat
 * heard from in the last WAIT_MS has covered (or LATE_MS behind the room
 * clock, whichever is later): the frontier f. So a millisecond is decided
 * from the samples' contents and stamps only, never from when they
 * arrived, and every client is sent the one answer (docs/TAG-PLAN.md,
 * fairness).
 * Inside a span, the earliest touch of the Ace by any hunter wins, a tie
 * to the lower seat; the Ace's points are counted up to it; then the
 * judgement goes on from the touch with the new Ace.
 *
 * What a client sends (JSON text), the host only, a private room only:
 *
 *   { type: 'tag', op: 'start', goal }   count down and play to goal points
 *   { type: 'tag', op: 'end' }           results now
 *
 * What the room sends: { type: 'tag', tag } (the view below) to everybody
 * on every change of state or crown and on every whole point the Ace adds,
 * { type: 'tag', error } to a refused sender, and the view in each
 * welcome. A touch in a match is never a mid air crash: edge/rooms/core.js
 * asks on() and sends no referee hit while it is true.
 *
 * WHAT OWNS WHAT. This object lives inside one RoomCore, which runs one
 * event at a time, so nothing here locks. The match (small) is handed
 * back as a { store } action on every change of state or crown and every
 * STORE_POINTS points, and handed back to restore() by edge/rooms/host.js
 * after a hibernation or a restart; the samples are memory only, since a
 * room that slept had nobody flying.
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

import { FLAG_CRASHED, FLAG_SPAWNING, decodePose } from '../../src/share/roomwire.js';
import {
  LATE_MS, Track, hullFor, judge,
} from '../../src/game/midair.js';
import {
  CROWNS_SHOWN, GOAL_MAX, GOAL_MIN, POINT_MS, PROTECT_MS, orderScores,
} from '../../src/share/roomtag.js';
import { COUNTDOWN_MS } from './race.js';
import { AHEAD_MS } from './referee.js';

/* How close is a touch: the gap between two part boxes on every
 * separating axis, metres. docs/TAG-PLAN.md decision 3: the near peer
 * drawing error (0.39 m in a 6 g turn) plus the clock's (0.36 m at 20 m/s),
 * measured by Phase 3, with a little over. */
export const TAG_M = 0.8;
/* An Ace nobody can catch for this long drops the crown (decision 8). */
export const DROP_MS = 10000;
/* A seat silent for longer than this (a menu, a tab in the background) is
 * not waited for. Shorter silences are, a stall or a pause for breath: a
 * seat that the frontier ran past while it was quiet would have its first
 * samples back judged as not there, by how late they are, and lag would
 * decide. The midair referee's KEEP_MS, how much past a room holds. */
export const WAIT_MS = 2000;
/* The match is written to storage on every STORE_POINTS points the Ace
 * adds, besides every change of state or crown. */
const STORE_POINTS = 10;

/* Whether a sample can touch or be touched: seen, not spawning or crashed. */
function catchable(p) {
  return (p.flags & (FLAG_SPAWNING | FLAG_CRASHED)) === 0;
}

/* Whether the track has a catchable pose at room ms t: bracketed by two
 * samples GAP_MS or less apart, neither spawning nor crashed (flags or'd,
 * as src/game/midair.js lerpPose does). */
function catchableAt(track, t) {
  const i = track.bracket(t);
  return i >= 0 && catchable(track.s[i]) && catchable(track.s[i + 1]);
}

export class RoomTag {
  constructor() {
    /*
     * { id, goal, goAt, state: 'countdown'|'live'|'results', ace,
     *   protectUntil, untouchSince, f, players: { seat: { ms } },
     *   crowns: [{ t, seat, from, why }] (the last CROWNS_SHOWN), winner,
     *   endAt }, or null before the first match.
     */
    this.match = null;
    this.nextId = 1;
    /* seat -> { airframe, hull, track, token }. Memory only. */
    this.seats = new Map();
    /* The draw of the first Ace and of a dropped crown. Math.random in the
     * room; the harness puts a seeded one here so its runs repeat. */
    this.random = Math.random;
    /* For the checks: every crown change this match, with when it was
     * decided on the room clock. Memory only. */
    this.log = [];
    this.sentPoints = -1;
    this.storedPoints = 0;
  }

  restore(saved) {
    if (!saved) {
      return;
    }
    this.match = saved.match ?? null;
    this.nextId = saved.nextId ?? 1;
  }

  store() {
    return { store: 'tag', value: { match: this.match, nextId: this.nextId } };
  }

  /* Whether a match is counting down or on: the room runs no other game
   * and its referee sends no crash. */
  on() {
    const m = this.match;
    return Boolean(m) && (m.state === 'countdown' || m.state === 'live');
  }

  /* The match as every client sees it: no token, nothing typed. */
  view(core) {
    const m = this.match;
    if (!m) {
      return { state: 'lobby' };
    }
    const here = new Set([...core.seats.values()].map((s) => s.seat));
    return {
      state: m.state,
      id: m.id,
      goal: m.goal,
      goAt: m.goAt,
      ace: m.ace,
      protectUntil: m.protectUntil,
      f: m.f,
      scores: orderScores(Object.entries(m.players).map(([seat, p]) => ({ seat: Number(seat), ms: p.ms, gone: !here.has(Number(seat)) }))),
      crowns: m.crowns.slice(-CROWNS_SHOWN),
      winner: m.winner,
      endAt: m.endAt,
    };
  }

  welcome(core) {
    return { tag: this.view(core) };
  }

  broadcast(core, msg) {
    const data = JSON.stringify(msg);
    return [...core.seats.keys()].map((conn) => ({ send: conn, data }));
  }

  changed(core) {
    const m = this.match;
    this.sentPoints = m && m.ace != null && m.players[m.ace] ? Math.floor(m.players[m.ace].ms / POINT_MS) : -1;
    this.storedPoints = this.sentPoints;
    return [this.store(), ...this.broadcast(core, { type: 'tag', tag: this.view(core) })];
  }

  error(conn, error) {
    return [{ send: conn, data: JSON.stringify({ type: 'tag', error }) }];
  }

  /* One text message of type 'tag' from seat s. */
  message(core, conn, s, msg, now) {
    if (core.meta.public) {
      return this.error(conn, 'public');
    }
    if (s.seat !== core.host()) {
      return [];
    }
    if (msg.op === 'start') {
      return this.start(core, conn, msg, now);
    }
    if (msg.op === 'end' && this.on()) {
      const out = this.advance(core, now);
      if (!this.on()) {
        return out;
      }
      this.finish(Math.min(this.match.f, core.roomMs(now)), null);
      return [...out, ...this.changed(core)];
    }
    return [];
  }

  start(core, conn, msg, now) {
    const game = core.game();
    if (game) {
      return this.error(conn, 'busy');
    }
    if (!Number.isInteger(msg.goal) || msg.goal < GOAL_MIN || msg.goal > GOAL_MAX) {
      return this.error(conn, 'goal');
    }
    if (core.seats.size < 2) {
      return this.error(conn, 'alone');
    }
    /* A whole room millisecond: the judgement steps on them. */
    const goAt = Math.ceil(core.roomMs(now)) + COUNTDOWN_MS;
    const players = {};
    for (const t of core.seats.values()) {
      players[t.seat] = { ms: 0 };
    }
    this.match = {
      id: this.nextId,
      goal: msg.goal,
      goAt,
      state: 'countdown',
      ace: null,
      protectUntil: goAt,
      untouchSince: null,
      f: goAt,
      players,
      crowns: [],
      winner: null,
      endAt: null,
    };
    this.nextId += 1;
    this.log = [];
    return this.changed(core);
  }

  /*
   * A seat's POSE, as the room relays it (Phase 5 has set FLAG_SPAWNING on
   * a spawning or benched seat). Kept while a match is on, for the seats
   * flying the room's world.
   */
  pose(core, s, bytes, now) {
    if (!this.on()) {
      return [];
    }
    const roomNow = core.roomMs(now);
    const p = decodePose(bytes);
    if (p && p.t <= roomNow + AHEAD_MS && s.profile.map === core.meta.map) {
      this.seatOf(s).track.push(p);
      /* A pilot who joined during the match hunts, from nothing. */
      this.match.players[s.seat] ??= { ms: 0 };
    }
    return this.advance(core, now);
  }

  tick(core, now) {
    return this.on() ? this.advance(core, now) : [];
  }

  /* A seat's samples and hull, new when its airframe or its pilot is. */
  seatOf(s) {
    const had = this.seats.get(s.seat);
    if (had && had.airframe === s.profile.airframe && had.token === s.token) {
      return had;
    }
    const m = this.match;
    if (had && had.token !== s.token && m && m.players[s.seat] && m.ace !== s.seat) {
      /* The seat went to a new pilot: they start with nothing. */
      m.players[s.seat] = { ms: 0 };
    }
    const next = { airframe: s.profile.airframe, hull: hullFor(s.profile.airframe), track: new Track(), token: s.token };
    this.seats.set(s.seat, next);
    return next;
  }

  /* The seats here, in the room's world, by seat, with their samples. */
  flying(core) {
    const out = [];
    for (const s of core.seats.values()) {
      const t = this.seats.get(s.seat);
      if (t && t.hull && s.profile.map === core.meta.map && t.token === s.token) {
        out.push({ seat: s.seat, ...t });
      }
    }
    return out.sort((a, b) => a.seat - b.seat);
  }

  /* A seat at random from a list sorted by seat. */
  draw(list) {
    return list.length ? list[Math.min(list.length - 1, Math.floor(this.random() * list.length))] : null;
  }

  crown(seat, t, why) {
    const m = this.match;
    m.crowns.push({ t, seat, from: m.ace, why });
    if (m.crowns.length > CROWNS_SHOWN) {
      m.crowns.splice(0, m.crowns.length - CROWNS_SHOWN);
    }
    this.log.push({ t, seat, from: m.ace, why });
    m.ace = seat;
    m.players[seat] ??= { ms: 0 };
    m.protectUntil = t + PROTECT_MS;
    m.untouchSince = null;
  }

  finish(t, winner) {
    const m = this.match;
    m.state = 'results';
    m.winner = winner;
    m.endAt = t;
    m.f = t;
  }

  /*
   * Move the match on to what the room now knows. Returns the room's
   * actions: the view when the state or the crown changed or the Ace added
   * a whole point.
   */
  advance(core, now) {
    const m = this.match;
    const roomNow = core.roomMs(now);
    const crownWas = m.crowns.at(-1);
    const state = m.state;
    if (m.state === 'countdown' && roomNow >= m.goAt) {
      m.state = 'live';
      const here = this.flying(core).map((f) => f.seat);
      const pool = here.length ? here : [...core.seats.values()].map((s) => s.seat).sort((a, b) => a - b);
      const first = this.draw(pool);
      if (first == null) {
        this.finish(m.goAt, null);
      } else {
        this.crown(first, m.goAt, 'start');
      }
    }
    if (m.state === 'live') {
      this.judge(core, roomNow);
    }
    if (m.state !== state || m.crowns.at(-1) !== crownWas) {
      for (const e of this.log) {
        e.decided ??= roomNow;
      }
      return this.changed(core);
    }
    const points = m.ace != null && m.players[m.ace] ? Math.floor(m.players[m.ace].ms / POINT_MS) : -1;
    if (points === this.sentPoints) {
      return [];
    }
    this.sentPoints = points;
    const out = this.broadcast(core, { type: 'tag', tag: this.view(core) });
    if (points - this.storedPoints >= STORE_POINTS) {
      this.storedPoints = points;
      out.unshift(this.store());
    }
    return out;
  }

  /* Judge the room milliseconds (f, t1] that every seat heard from in the
   * last WAIT_MS has covered, or that are LATE_MS old. */
  judge(core, roomNow) {
    const m = this.match;
    const cut = Math.floor(roomNow - LATE_MS);
    const fly = this.flying(core);
    let t1 = Infinity;
    for (const f of fly) {
      const n = f.track.newest();
      if (n >= roomNow - WAIT_MS) {
        t1 = Math.min(t1, n);
      }
    }
    t1 = Math.floor(Math.min(roomNow, Math.max(cut, t1 === Infinity ? cut : t1)));
    /* The Ace left the room: the crown goes on at once, where the room
     * has got to. */
    if (![...core.seats.values()].some((s) => s.seat === m.ace)) {
      const next = this.draw(fly.filter((f) => catchableAt(f.track, m.f)).map((f) => f.seat))
        ?? this.draw(fly.map((f) => f.seat))
        ?? this.draw([...core.seats.values()].map((s) => s.seat).sort((a, b) => a - b));
      if (next == null) {
        return;
      }
      this.crown(next, m.f, 'leave');
    }
    while (m.state === 'live' && m.f < t1) {
      this.span(fly, t1);
    }
  }

  /* One step of the judgement from m.f toward t1: up to the first touch,
   * the goal, a drop, or t1. What is left is judged again with the Ace
   * the step ended with. */
  span(fly, t1) {
    const m = this.match;
    const ace = fly.find((f) => f.seat === m.ace) || null;
    const from = m.f;
    let tag = null;
    const start = Math.max(from, m.protectUntil);
    if (ace && start < t1) {
      for (const h of fly) {
        if (h.seat === m.ace) {
          continue;
        }
        const c = judge(ace.hull, h.hull, ace.track, h.track, start, t1, -TAG_M);
        if (c && (!tag || c.tc < tag.tc)) {
          tag = { tc: c.tc, seat: h.seat };
        }
      }
    }
    const until = tag ? tag.tc : t1;
    const player = m.players[m.ace];
    const goalMs = m.goal * POINT_MS;
    for (let t = from + 1; t <= until; t += 1) {
      if (ace && catchableAt(ace.track, t)) {
        player.ms += 1;
        m.untouchSince = null;
        if (player.ms >= goalMs) {
          this.finish(t, m.ace);
          return;
        }
        continue;
      }
      m.untouchSince ??= t;
      if (t - m.untouchSince >= DROP_MS) {
        const next = this.draw(fly.filter((h) => h.seat !== m.ace && catchableAt(h.track, t)).map((h) => h.seat));
        if (next != null) {
          m.f = t;
          this.crown(next, t, 'drop');
          return;
        }
      }
    }
    m.f = until;
    if (tag) {
      this.crown(tag.seat, tag.tc, 'tag');
    }
  }
}
