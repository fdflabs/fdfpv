/*
 * tag.js: Catch the Ace! (¡Atrapa al As!), a room's tag match
 * (docs/TAG-PLAN.md). The room's half; the client's is src/share/roomtag.js.
 *
 * One pilot is the Ace and scores a point a second; everybody else hunts
 * it, and the first hunter into its bubble takes the crown. An Ace that
 * crashes drops it: nobody is the Ace, its bubble (the orb) stays in the
 * air where it went down, and the first pilot flying into the orb is the
 * new Ace (the owner, 2026-09-29, docs/TAG-PLAN.md decision 14). The room is
 * the referee of every tag, on Phase 3's poses and hulls (src/game/
 * midair.js within): any part box of a hunter within BUBBLE_M of the
 * Ace's centre is a tag. Nothing has to touch, and a real collision is
 * still a mid air crash for both, as in free flight (below). The first to
 * reach the goal wins, the instant they reach it.
 *
 * ONE TIMELINE, JUDGED IN ORDER. The crown and the points are decided on
 * the room clock, millisecond by millisecond, over the span every seat
 * heard from in the last WAIT_MS has covered (or LATE_MS behind the room
 * clock, whichever is later): the frontier f. So a millisecond is decided
 * from the samples' contents and stamps only, never from when they
 * arrived, and every client is sent the one answer (docs/TAG-PLAN.md,
 * fairness).
 * Inside a span, the earliest tag of the Ace by any hunter wins, a tie
 * to the lower seat; the Ace's points are counted up to it; then the
 * judgement goes on from the tag with the new Ace.
 *
 * What a client sends (JSON text), the host only, public or private:
 *
 *   { type: 'tag', op: 'start', goal }   count down and play to goal points
 *   { type: 'tag', op: 'end' }           results now
 *
 * What the room sends: { type: 'tag', tag } (the view below, whose
 * `bubble` is BUBBLE_M: a client draws the bubble only for a room that
 * sends it, since a room from before it judges a touch, and whose `orb`
 * is the free orb while nobody is the Ace) to everybody on every change
 * of state, crown or orb and on every whole point the Ace adds,
 * { type: 'tag', error } to a refused sender, and the view in each
 * welcome. A collision in a match is a mid air crash all the same:
 * edge/rooms/core.js hands every pose to the mid air referee and to this
 * match, and a wreck is judged here as uncatchable until it has respawned
 * and its spawn protection is over (catchable, below).
 *
 * WHAT OWNS WHAT. This object lives inside one RoomCore, which runs one
 * event at a time, so nothing here locks. The match (small) is handed
 * back as a { store } action on every change of state or crown and every
 * STORE_POINTS points, and handed back to restore() by edge/rooms/host.js
 * after a hibernation or a restart; the samples are memory only, since a
 * room that slept had nobody flying.
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
  FLAG_AIRBORNE, FLAG_CRASHED, FLAG_SPAWNING, decodePose,
} from '../../src/share/roomwire.js';
import {
  LATE_MS, Track, hullDistance, hullFor, poseAt, within,
} from '../../src/game/midair.js';
import {
  BUBBLE_M, CROWNS_SHOWN, GOAL_MAX, GOAL_MIN, POINT_MS, PROTECT_MS, orderScores,
} from '../../src/share/roomtag.js';
import { COUNTDOWN_MS } from './race.js';
import { minPlayersFor } from '../../src/share/modes.js';
import { AHEAD_MS } from './referee.js';

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

/* Whether the track's pose at t is a wreck: either bracketing sample
 * crashed, as catchableAt reads the flags. */
function crashedAt(track, t) {
  const i = track.bracket(t);
  return i >= 0 && ((track.s[i].flags | track.s[i + 1].flags) & FLAG_CRASHED) !== 0;
}

/* Whether the track is flying at t, as a pilot catching the orb must be:
 * catchable, and airborne in both bracketing samples, so an aircraft
 * taxiing or sat on the ground under the orb does not take it. */
function flyingAt(track, t) {
  const i = track.bracket(t);
  return i >= 0 && catchable(track.s[i]) && catchable(track.s[i + 1])
    && (track.s[i].flags & track.s[i + 1].flags & FLAG_AIRBORNE) !== 0;
}

/* Whether the track's path over room ms [t0, t1] (straight between its
 * samples, as poses are interpolated) comes within `reach` of o. */
function pathNear(track, t0, t1, o, reach) {
  const s = track.s;
  for (let k = 0; k + 1 < s.length; k += 1) {
    if (s[k + 1].t < t0 || s[k].t > t1) {
      continue;
    }
    const a = s[k];
    const b = s[k + 1];
    const dx = b.px - a.px;
    const dy = b.py - a.py;
    const dz = b.pz - a.pz;
    const len2 = dx * dx + dy * dy + dz * dz;
    const u = len2 > 0 ? Math.max(0, Math.min(1, ((o.px - a.px) * dx + (o.py - a.py) * dy + (o.pz - a.pz) * dz) / len2)) : 0;
    if ((a.px + dx * u - o.px) ** 2 + (a.py + dy * u - o.py) ** 2 + (a.pz + dz * u - o.pz) ** 2 <= reach * reach) {
      return true;
    }
  }
  return false;
}

/* The pose's place, { px, py, pz }. */
function placeOf(p) {
  return { px: p.px, py: p.py, pz: p.pz };
}

export class RoomTag {
  constructor() {
    /*
     * { id, goal, goAt, state: 'countdown'|'live'|'results', ace,
     *   protectUntil, orb, f, players: { seat: { ms, token } }, crowns:
     *   [{ t, seat, from, why }] (the last CROWNS_SHOWN), winner, endAt },
     *   or null before the first match. ace is null while the orb is
     *   free: orb { t, from, px, py, pz }, when and where the Ace `from`
     *   dropped it, else null.
     */
    this.match = null;
    this.nextId = 1;
    /* seat -> { airframe, hull, track, token }. Memory only. */
    this.seats = new Map();
    /* The draw of the first Ace and of a dropped crown. Math.random in the
     * room; the harness puts a seeded one here so its runs repeat. */
    this.random = Math.random;
    /* For the checks: every crown change this match, with when it was
     * decided on the room clock, and every drop. Memory only. */
    this.log = [];
    this.drops = [];
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

  /* Whether a match is counting down or on: the room runs no other game. */
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
    const here = new Set(this.players(core));
    return {
      state: m.state,
      id: m.id,
      goal: m.goal,
      goAt: m.goAt,
      ace: m.ace,
      bubble: BUBBLE_M,
      orb: m.state === 'live' && m.orb ? m.orb : null,
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
    if (s.seat !== core.host()) {
      return [];
    }
    if (msg.op === 'start') {
      return this.start(core, conn, msg, now);
    }
    if (msg.op === 'end' && this.on()) {
      const out = this.advance(core, now);
      return this.on() ? [...out, ...this.abandon(core, now)] : out;
    }
    return [];
  }

  /* The match's players who are here: their seat, held by the same pilot
   * (the seat's token), not a newcomer given a seat a player left. */
  players(core) {
    const m = this.match;
    if (!m) {
      return [];
    }
    return [...core.seats.values()]
      .filter((t) => m.players[t.seat] && (m.players[t.seat].token == null || m.players[t.seat].token === t.token))
      .map((t) => t.seat);
  }

  /* Ended before anybody won: by the host, or by the room when too few of
   * its players are left (core.js settleGames). Results as they stand. */
  abandon(core, now) {
    if (!this.on()) {
      return [];
    }
    this.finish(Math.min(this.match.f, core.roomMs(now)), null);
    return this.changed(core);
  }

  start(core, conn, msg, now) {
    const game = core.game();
    if (game) {
      return this.error(conn, 'busy');
    }
    if (!Number.isInteger(msg.goal) || msg.goal < GOAL_MIN || msg.goal > GOAL_MAX) {
      return this.error(conn, 'goal');
    }
    /* Alone only in a room made for it (the mode registry, core.js games()). */
    if (core.seats.size < minPlayersFor('tag', core.meta.mode)) {
      return this.error(conn, 'alone');
    }
    /* A whole room millisecond: the judgement steps on them. */
    const goAt = Math.ceil(core.roomMs(now)) + COUNTDOWN_MS;
    const players = {};
    for (const t of core.seats.values()) {
      players[t.seat] = { ms: 0, token: t.token };
    }
    this.match = {
      id: this.nextId,
      goal: msg.goal,
      goAt,
      state: 'countdown',
      ace: null,
      protectUntil: goAt,
      orb: null,
      f: goAt,
      players,
      crowns: [],
      winner: null,
      endAt: null,
    };
    this.nextId += 1;
    this.log = [];
    this.drops = [];
    return this.changed(core);
  }

  /*
   * A seat's POSE, as the room relays it (Phase 5 has set FLAG_SPAWNING on
   * a spawning seat). Kept while a match is on, for the seats
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
      this.match.players[s.seat] ??= { ms: 0, token: s.token };
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
      m.players[s.seat] = { ms: 0, token: s.token };
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

  /* The crown to `seat` at t; `from` is the Ace it was taken from, or
   * the one that dropped the orb it was caught from. */
  crown(seat, t, why) {
    const m = this.match;
    const from = m.orb ? m.orb.from : m.ace;
    m.crowns.push({ t, seat, from, why });
    if (m.crowns.length > CROWNS_SHOWN) {
      m.crowns.splice(0, m.crowns.length - CROWNS_SHOWN);
    }
    this.log.push({ t, seat, from, why });
    m.ace = seat;
    m.orb = null;
    m.players[seat] ??= { ms: 0, token: null };
    m.protectUntil = t + PROTECT_MS;
  }

  /* The Ace drops the crown at t: nobody is the Ace, and the orb is free
   * at `at` ({ px, py, pz }). */
  drop(t, at) {
    const m = this.match;
    m.orb = {
      t, from: m.ace, px: at.px, py: at.py, pz: at.pz,
    };
    this.drops.push({ ...m.orb });
    m.ace = null;
  }

  /*
   * The first room millisecond in (t0, t1] at which a flying pilot (not
   * crashed, not spawning, off the ground) has any part box within
   * BUBBLE_M of the free orb's centre: the steal's rule (src/game/midair.js
   * within) round a centre that does not move. { tc, seat }, a tie to the
   * lower seat, or null. The crashed Ace may catch it too, once it flies.
   */
  catchOrb(fly, t0, t1) {
    const o = this.match.orb;
    const first = Math.floor(t0) + 1;
    const last = Math.floor(t1);
    const p = {};
    let best = null;
    for (const h of fly) {
      const reach = BUBBLE_M + h.hull.hull.reach;
      if (!pathNear(h.track, first, last, o, reach)) {
        continue;
      }
      for (let t = first; t <= last && (!best || t < best.tc || (t === best.tc && h.seat < best.seat)); t += 1) {
        if (!flyingAt(h.track, t) || !poseAt(h.track, t, p)) {
          continue;
        }
        if ((p.px - o.px) ** 2 + (p.py - o.py) ** 2 + (p.pz - o.pz) ** 2 > reach * reach) {
          continue;
        }
        if (hullDistance(h.hull, p, o.px, o.py, o.pz) <= BUBBLE_M) {
          best = { tc: t, seat: h.seat };
          break;
        }
      }
    }
    return best;
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
    const orbWas = m.orb;
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
    if (m.state !== state || m.crowns.at(-1) !== crownWas || m.orb !== orbWas) {
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
    if (m.ace != null && ![...core.seats.values()].some((s) => s.seat === m.ace)) {
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

  /* One step of the judgement from m.f toward t1: up to the first tag,
   * the goal, a drop, a catch of the orb, or t1. What is left is judged
   * again with the Ace (or the orb) the step ended with. */
  span(fly, t1) {
    const m = this.match;
    if (m.orb) {
      /* Nobody scores while the orb is free. */
      const c = this.catchOrb(fly, m.f, t1);
      m.f = c ? c.tc : t1;
      if (c) {
        this.crown(c.seat, c.tc, 'catch');
      }
      return;
    }
    const ace = fly.find((f) => f.seat === m.ace) || null;
    const from = m.f;
    let tag = null;
    const start = Math.max(from, m.protectUntil);
    if (ace && start < t1) {
      for (const h of fly) {
        if (h.seat === m.ace) {
          continue;
        }
        const c = within(ace.hull, h.hull, ace.track, h.track, start, t1, BUBBLE_M);
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
        if (player.ms >= goalMs) {
          this.finish(t, m.ace);
          return;
        }
        continue;
      }
      /* The Ace crashed: the orb is free where it went down. Uncatchable
       * any other way (spawning, not seen) it keeps the crown and scores
       * nothing: the owner took the timeout that used to hand it on out. */
      if (ace && crashedAt(ace.track, t)) {
        m.f = t;
        this.drop(t, placeOf(poseAt(ace.track, t)));
        return;
      }
    }
    m.f = until;
    if (tag) {
      this.crown(tag.seat, tag.tc, 'tag');
    }
  }
}
