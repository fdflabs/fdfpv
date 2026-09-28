/*
 * combat.js: a room's toilet paper combat (docs/COMBAT-PLAN.md): the round
 * and its clock, the scores by the AMA RC combat sheet, the referee that
 * decides every cut, and the relay of every pilot's streamer.
 *
 * THE REFEREE is Phase 3's pattern on Phase 3's pieces (src/game/midair.js
 * Track, hullFor, LATE_MS): every seat's POSE samples and STREAMER frames
 * on the room clock; for every ordered pair, cutter and streamer, a
 * frontier that moves on the whole millisecond as the samples of both
 * cover it, and never less than COMBAT_LATE_MS behind the clock, so arrival
 * times never decide whether a cut happened, only when it is known. The
 * rule is src/game/cut.js. It keeps its own samples rather than the mid
 * air referee's because a friendly room's mid air referee keeps none, and
 * a friendly room plays combat.
 *
 * WHO SAYS WHAT. A client never sends a cut: the room judges the poses and
 * the paper it was sent and tells everyone. The owner applies the cut to
 * its own paper, and the room also trims every frame it relays to the
 * links its cuts left, so a client that ignored the cut still shows the
 * short streamer. A streamer shorter than the room owes (the paper tore
 * by itself) is read from the owner's own frames: "denied any positive
 * scoring until a new streamer is attached", which a respawn is.
 *
 * WHAT OWNS WHAT. The RoomCore owns this object (core.combat); a Durable
 * Object runs one event at a time, so nothing here is shared. None of it
 * is written to storage: a room that hibernated had nobody flying, and a
 * round is minutes long.
 *
 * Each entry point returns core actions (see core.js).
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
  FLAG_AIRBORNE, FLAG_CRASHED, STREAMER_HZ, TYPE_STREAMER, decodePose, decodeStreamer, relayStreamer, trimStreamer,
} from '../../src/share/roomwire.js';
import { LATE_MS, Track, hullFor } from '../../src/game/midair.js';
import { PASS_MS, StreamerTrack, judgeCut } from '../../src/game/cut.js';

/* The owner's fifty metres, in one metre links. */
export const FULL_LINKS = 50;
export const ROUND_MINUTES = [3, 5];
export const COUNTDOWN_MS = 20000;
/* The AMA RC combat sheet (docs/COMBAT-PLAN.md section 5.1). */
export const POINTS_CUT = 100;
export const POINTS_LAUNCH = 20;
export const POINTS_FLIGHT = 20;
/* "+4 points per foot ... (+120 max.)" on thirty feet: the same 120 for a
 * whole streamer, on fifty metres. */
export const POINTS_PER_METRE = 120 / FULL_LINKS;
/* A crash this soon after a Phase 3 hit on the seat is the mid air's, and
 * "the pilot shall earn +20 points for continuous flight" all the same. */
export const MIDAIR_GRACE_MS = 5000;
/* The owner sends at 10 Hz; a little over, and the rest are dropped. */
export const STREAMER_PER_S = 15;
/* Phase 3's LATE_MS, plus a streamer frame's interval: a moment is covered
 * only once the frame after it has arrived, up to 100 ms after the moment,
 * so an owner on a link Phase 3 would wait for is waited for here too. */
export const COMBAT_LATE_MS = LATE_MS + 1000 / STREAMER_HZ;

function bump(counter, now) {
  if (now - counter.since >= 1000) {
    counter.since = now;
    counter.n = 0;
  }
  counter.n += 1;
  return counter.n;
}

export class RoomCombat {
  constructor(meta) {
    this.meta = meta;
    this.round = { n: 0, state: 'idle', startsAt: 0, endsAt: 0, minutes: 0 };
    this.seats = new Map(); /* seat -> record, below */
    this.pairs = new Map(); /* 'cutter>victim' -> frontier, room ms */
    this.nextId = 1;
    /* For the checks: every cut this room has decided. */
    this.log = [];
  }

  record(seat) {
    let r = this.seats.get(seat);
    if (!r) {
      r = {
        airframe: null, hull: null, poses: new Track(), paper: new StreamerTrack(),
        owed: FULL_LINKS, links: 0, points: 0, cuts: 0, crashed: false, flying: false,
        rate: { since: 0, n: 0 }, pass: new Map(),
      };
      this.seats.set(seat, r);
    }
    return r;
  }

  /* A seat's airframe, on its hello, its profile and a restore. */
  seat(seat, airframe) {
    const r = this.record(seat);
    if (r.airframe !== airframe) {
      r.airframe = airframe;
      r.hull = hullFor(airframe);
      r.poses = new Track();
    }
  }

  leave(seat) {
    this.seats.delete(seat);
    for (const key of [...this.pairs.keys()]) {
      const [a, b] = key.split('>').map(Number);
      if (a === seat || b === seat) {
        this.pairs.delete(key);
      }
    }
  }

  view() {
    const r = this.round;
    return {
      type: 'combat',
      round: r.n,
      state: r.state,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      minutes: r.minutes,
      scores: [...this.seats.entries()].sort((a, b) => a[0] - b[0]).map(([seat, s]) => ({
        seat, points: s.points, cuts: s.cuts, owed: s.owed, links: s.links, lost: s.links < s.owed,
      })),
    };
  }

  broadcast(core) {
    return core.others(null, JSON.stringify(this.view()));
  }

  /* For a pilot just seated: the round as it stands. */
  join(core, conn) {
    return this.round.state === 'idle' ? [] : [{ send: conn, data: JSON.stringify(this.view()) }];
  }

  /* The round's clock: countdown to on, on to over. */
  advance(core, now) {
    const r = this.round;
    const t = core.roomMs(now);
    if (r.state === 'countdown' && t >= r.startsAt) {
      r.state = 'on';
      /* "airborne with a complete streamer when Start Combat is called". */
      for (const s of this.seats.values()) {
        if (s.flying && s.links >= FULL_LINKS) {
          s.points += POINTS_LAUNCH;
        }
      }
      return this.broadcast(core);
    }
    if (r.state === 'on' && t >= r.endsAt) {
      r.state = 'over';
      for (const s of this.seats.values()) {
        s.points += Math.floor(POINTS_PER_METRE * Math.min(s.owed, s.links));
        if (!s.crashed) {
          s.points += POINTS_FLIGHT;
        }
      }
      return this.broadcast(core);
    }
    return [];
  }

  /* { type: 'combat', op: 'start', minutes } or { op: 'stop' }, a private
   * room's host only. */
  message(core, conn, s, msg, now) {
    const out = this.advance(core, now);
    if (core.meta.public || s.seat !== core.host()) {
      return out;
    }
    const r = this.round;
    if (msg.op === 'stop' && r.state !== 'idle') {
      r.state = 'idle';
      return [...out, ...this.broadcast(core)];
    }
    const racing = core.race && core.race.race && core.race.race.state === 'on';
    if (msg.op !== 'start' || !ROUND_MINUTES.includes(msg.minutes) || r.state === 'countdown' || r.state === 'on' || racing) {
      return out;
    }
    const t = core.roomMs(now);
    r.n += 1;
    r.state = 'countdown';
    r.minutes = msg.minutes;
    r.startsAt = t + COUNTDOWN_MS;
    r.endsAt = r.startsAt + msg.minutes * 60000;
    for (const [seat, rec] of this.seats) {
      Object.assign(rec, {
        owed: FULL_LINKS, links: 0, points: 0, cuts: 0, crashed: false, paper: new StreamerTrack(), pass: new Map(),
      });
      for (const key of [...this.pairs.keys()]) {
        if (key.startsWith(`${seat}>`)) {
          this.pairs.delete(key);
        }
      }
    }
    return [...out, ...this.broadcast(core)];
  }

  /* A STREAMER frame from seat s: kept, trimmed to what the room owes it,
   * relayed, and judged against every other aircraft. */
  frame(core, conn, s, bytes, now) {
    const out = this.advance(core, now);
    if (this.round.state === 'idle' || bytes[0] !== TYPE_STREAMER) {
      return out;
    }
    const rec = this.record(s.seat);
    if (bump(rec.rate, now) > STREAMER_PER_S) {
      return out;
    }
    const got = decodeStreamer(bytes);
    if (!got) {
      return out;
    }
    const chain = got.chains.find((c) => c.id === 0);
    const links = chain ? chain.n - 1 : 0;
    const wasLost = rec.links < rec.owed;
    rec.links = Math.min(links, rec.owed);
    if (chain && rec.links > 0) {
      rec.paper.push(got.t, rec.links + 1, chain.x);
    }
    out.push(...core.others(conn, relayStreamer(s.seat, trimStreamer(bytes, rec.owed))));
    const cuts = this.judgeAll(core, now, s.seat);
    /* A streamer the owner's own frames show shorter than owed tore by
     * itself: everyone's scoreboard says so. */
    if (!cuts.length && wasLost !== rec.links < rec.owed && this.round.state !== 'over') {
      out.push(...this.broadcast(core));
    }
    return [...out, ...cuts];
  }

  /* A POSE from seat s (its relayed bytes, flags as the room set them). */
  pose(core, s, now) {
    const out = this.advance(core, now);
    if (this.round.state === 'idle') {
      return out;
    }
    const rec = this.record(s.seat);
    const p = decodePose(s.pose);
    if (!p || !rec.poses.push(p)) {
      return out;
    }
    rec.flying = (p.flags & FLAG_AIRBORNE) !== 0;
    if (this.round.state === 'on' && (p.flags & FLAG_CRASHED) && !rec.crashed) {
      const t = core.roomMs(now);
      const hits = core.referee && core.referee.log ? core.referee.log : [];
      const midair = hits.some((h) => (h.a === s.seat || h.b === s.seat) && t - h.decided < MIDAIR_GRACE_MS);
      if (!midair) {
        rec.crashed = true;
      }
    }
    return [...out, ...this.judgeAll(core, now, s.seat)];
  }

  /* Every pair with `seat` on either side, over what both now cover. */
  judgeAll(core, now, seat) {
    if (this.round.state !== 'on') {
      return [];
    }
    const out = [];
    for (const other of this.seats.keys()) {
      if (other === seat) {
        continue;
      }
      out.push(...this.judge(core, now, seat, other), ...this.judge(core, now, other, seat));
    }
    return out;
  }

  judge(core, now, cutter, victim) {
    const a = this.seats.get(cutter);
    const b = this.seats.get(victim);
    if (!a || !b || !a.hull || b.owed < 1) {
      return [];
    }
    const key = `${cutter}>${victim}`;
    const r = this.round;
    /* Nothing is waited for past COMBAT_LATE_MS: what a side has not
     * covered by then is judged as no cut, and a late sample for it never
     * is. */
    const f = Math.max(this.pairs.get(key) ?? -Infinity, r.startsAt, Math.floor(core.roomMs(now) - COMBAT_LATE_MS));
    const t1 = Math.min(a.poses.newest(), b.poses.newest(), b.paper.newest(), r.endsAt);
    if (!(t1 > f)) {
      return [];
    }
    const c = judgeCut(a.hull, a.poses, b.poses, b.paper, f, t1, b.owed);
    this.pairs.set(key, Math.floor(t1));
    if (!c) {
      return [];
    }
    /* The rest of the span is judged again from the cut on, against the
     * shorter streamer. */
    this.pairs.set(key, Math.floor(c.tc));
    const same = a.pass.has(victim) && c.tc - a.pass.get(victim) < PASS_MS;
    a.pass.set(victim, c.tc);
    const points = same || a.links < a.owed ? 0 : POINTS_CUT;
    b.owed = c.link;
    b.links = Math.min(b.links, b.owed);
    a.points += points;
    if (!same) {
      a.cuts += 1;
    }
    const ev = {
      type: 'event',
      kind: 'cut',
      id: this.nextId,
      round: r.n,
      tc: Math.round(c.tc * 4) / 4,
      cutter,
      victim,
      keep: c.link,
      part: a.hull.kinds[c.part] || 'part',
      p: c.p.map((v) => Math.round(v * 1000) / 1000),
      points,
      pass: same,
    };
    this.nextId += 1;
    this.log.push({ ...ev, decided: core.roomMs(now) });
    return [...core.others(null, JSON.stringify(ev)), ...this.broadcast(core)];
  }

  /* The room tick: the round's clock. */
  tick(core, now) {
    return this.advance(core, now);
  }
}
