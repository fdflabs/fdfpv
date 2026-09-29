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
 * short streamer. A streamer the owner's frames show shorter than the room
 * owes tore by itself (only above 120 km/h, src/game/streamer.js): the
 * room's list is cut to it, and the torn paper is gone for that life. A
 * pilot can always cut and score, paper or none (the lead's and the
 * owner's decision, 2026-09-28).
 *
 * A RESTART GIVES THE TAIL BACK (the lead's rule, 2026-09-29, after the
 * owner's "after a while, even after restarts, everyone starts back up
 * without a tail"). The owner's client says { op: 'respawn' } when its
 * plant starts again (a crash and restart, R, a fresh flight), and the
 * room tops its list up to FULL_LINKS in the pilot's own colour, at the
 * tow point; captured paper past that is kept. The room says so to
 * everyone, so every screen draws the same length and the next cut
 * splits the right runs. A cut or a tear still costs the paper for the
 * rest of that life.
 *
 * WHAT OWNS WHAT. The RoomCore owns this object (core.combat); a Durable
 * Object runs one event at a time, so nothing here is shared. The round
 * and every seat's score go out as a { store: 'combat', value } action
 * with every change the room announces (core.js), and restore() takes
 * them back after a restart (edge/rooms/host.js hands every stored key to
 * core[key].restore on load), so a deploy mid round loses no points. The samples and frames are not kept:
 * they are seconds old, and a restart is a gap the rule already treats as
 * no cut.
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
  FLAG_AIRBORNE, FLAG_CRASHED, STREAMER_HZ, TYPE_STREAMER, appendRuns, checkRuns, decodePose, runsLinks, splitRuns, decodeStreamer, relayStreamer, trimStreamer,
} from '../../src/share/roomwire.js';
import { LATE_MS, Track, hullFor } from '../../src/game/midair.js';
import { PASS_MS, StreamerTrack, judgeCut } from '../../src/game/cut.js';

/* The owner's fifty metres, in one metre links. */
export const FULL_LINKS = 50;
export const ROUND_MINUTES = [3, 5];
export const COUNTDOWN_MS = 20000;
/* Continuous play (the lead's decision, 2026-09-28): a round's results
 * stand this long, then the next round of the same length counts down,
 * unless the host stopped play or fewer than two pilots are here. */
export const RESULTS_MS = 15000;
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

/*
 * The owner's capture (2026-09-28): B's paper parts at `link`, and what the
 * cut took, colours and all, goes onto the far end of A's; past
 * PAPER_CAP_LINKS, A's far end falls. a and b are the seats' records.
 */
export function capture(a, b, link) {
  const [keep, taken] = splitRuns(b.runs, link);
  b.runs = keep;
  b.owed = runsLinks(keep);
  b.links = Math.min(b.links, b.owed);
  const [grown] = appendRuns(a.runs, taken);
  a.runs = grown;
  a.owed = runsLinks(grown);
  a.links = Math.min(a.links, a.owed);
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
        runs: [[seat, FULL_LINKS]], owed: FULL_LINKS, links: 0, lastLinks: 0,
        points: 0, cuts: 0, crashed: false, flying: false, rate: { since: 0, n: 0 },
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
      nextAt: r.nextAt || 0,
      minutes: r.minutes,
      scores: [...this.seats.entries()].sort((a, b) => a[0] - b[0]).map(([seat, s]) => ({
        seat, points: s.points, cuts: s.cuts, owed: s.owed, links: s.links, runs: s.runs,
      })),
    };
  }

  /* Every change the room announces is also kept. */
  broadcast(core) {
    return [this.store(), ...core.others(null, JSON.stringify(this.view()))];
  }

  store() {
    const seats = [...this.seats.entries()].map(([seat, s]) => ({
      seat, runs: s.runs, links: s.links, points: s.points, cuts: s.cuts, crashed: s.crashed,
    }));
    return { store: 'combat', value: { round: { ...this.round }, seats, nextId: this.nextId } };
  }

  /* What store() kept, after a restart; undefined when nothing was. */
  restore(saved) {
    if (!saved || !saved.round) {
      return;
    }
    this.round = { ...saved.round };
    this.nextId = saved.nextId || 1;
    for (const k of saved.seats || []) {
      const runs = checkRuns(k.runs) || [[k.seat, FULL_LINKS]];
      Object.assign(this.record(k.seat), {
        runs, owed: runsLinks(runs), links: k.links, points: k.points, cuts: k.cuts, crashed: k.crashed,
      });
    }
  }

  /* The round put away: by the host's stop, or by the room when too few
   * of its pilots are left (core.js settleGames). */
  stop(core) {
    this.round.state = 'idle';
    this.round.nextAt = 0;
    return this.broadcast(core);
  }

  /* Whether the room's clock must keep running with nobody flying: the
   * results stand and the next round is due (core.js waiting()). */
  waiting() {
    return this.round.state === 'over' && this.round.nextAt > 0;
  }

  /* A new round of `minutes`: counting down from now, fresh paper for all. */
  begin(core, now, minutes) {
    const r = this.round;
    const t = core.roomMs(now);
    r.n += 1;
    r.state = 'countdown';
    r.minutes = minutes;
    r.startsAt = t + COUNTDOWN_MS;
    r.endsAt = r.startsAt + minutes * 60000;
    r.nextAt = 0;
    for (const [seat, rec] of this.seats) {
      Object.assign(rec, {
        runs: [[seat, FULL_LINKS]], owed: FULL_LINKS, links: 0, lastLinks: 0,
        points: 0, cuts: 0, crashed: false, paper: new StreamerTrack(),
      });
      for (const key of [...this.pairs.keys()]) {
        if (key.startsWith(`${seat}>`)) {
          this.pairs.delete(key);
        }
      }
    }
    return this.broadcast(core);
  }

  /* The seats with a streamer record (core.js game() counts who is here). */
  players() {
    return [...this.seats.keys()];
  }

  /* Whether a round is out: counting down or on. */
  on() {
    return this.round.state === 'countdown' || this.round.state === 'on';
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
    if (r.state === 'over' && r.nextAt > 0 && t >= r.nextAt) {
      /* Continuous play, while two can play and nothing else is on. */
      if (core.present(this.players()) < 2 || core.game()) {
        return this.stop(core);
      }
      return this.begin(core, now, r.minutes);
    }
    if (r.state === 'on' && t >= r.endsAt) {
      r.state = 'over';
      r.nextAt = t + RESULTS_MS;
      for (const s of this.seats.values()) {
        /* All the paper towed, captured colours included. */
        s.points += Math.floor(POINTS_PER_METRE * Math.min(s.owed, s.links));
        if (!s.crashed) {
          s.points += POINTS_FLIGHT;
        }
      }
      /* The room's clock keeps running for the next round, flying or not. */
      return [...this.broadcast(core), ...core.wake()];
    }
    return [];
  }

  /* { type: 'combat', op: 'respawn' } from any pilot; { op: 'start',
   * minutes } or { op: 'stop' }, the room's host only, public or private. */
  message(core, conn, s, msg, now) {
    const out = this.advance(core, now);
    if (msg.op === 'respawn') {
      return [...out, ...this.respawn(core, s.seat)];
    }
    if (s.seat !== core.host()) {
      return out;
    }
    const r = this.round;
    if (msg.op === 'stop' && r.state !== 'idle') {
      return [...out, ...this.stop(core)];
    }
    /* One game at a time (core.js game()): no round under a race or a tag
     * match. */
    if (msg.op !== 'start' || !ROUND_MINUTES.includes(msg.minutes) || core.game()) {
      return out;
    }
    return [...out, ...this.begin(core, now, msg.minutes)];
  }

  /* A pilot's plant started again: its list topped up to FULL_LINKS, the
   * new links its own colour at the tow point, where a fresh roll's are.
   * The owner's streamer grows to it from the view (roomcombat.js
   * follow()), as it does for a capture, so a client that never sends
   * this still draws what the room holds. */
  respawn(core, seat) {
    const rec = this.seats.get(seat);
    if (!this.on() || !rec || rec.owed >= FULL_LINKS) {
      return [];
    }
    [rec.runs] = appendRuns([[seat, FULL_LINKS - rec.owed]], rec.runs);
    rec.owed = FULL_LINKS;
    return this.broadcast(core);
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
    /* Outside a round's countdown and play there is no paper: what an
     * owner still sends then is pieces falling, never a streamer on. */
    const live = this.round.state === 'countdown' || this.round.state === 'on';
    /* Tore by itself: shorter than its last frame and than the room owes.
     * The list is cut to what is left, and the rest is gone for good. A
     * frame shorter than owed and no shorter than the last is paper the
     * room just added (a capture) that the owner has not grown yet. */
    let tore = false;
    if (live && links < rec.lastLinks && links < rec.owed) {
      rec.runs = splitRuns(rec.runs, links)[0];
      rec.owed = links;
      tore = true;
    }
    rec.lastLinks = links;
    rec.links = Math.min(links, rec.owed);
    if (chain && rec.links > 0) {
      rec.paper.push(got.t, rec.links + 1, chain.x);
    }
    out.push(...core.others(conn, relayStreamer(s.seat, trimStreamer(bytes, live ? rec.owed : 0))));
    const cuts = this.judgeAll(core, now, s.seat);
    /* A tear: everyone's lists and scoreboards say so. */
    if (!cuts.length && tore) {
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
    /* One pass, one cut (the rules' "multiple cuts on a single streamer in
     * a single pass count as one cut"): this cutter cuts this streamer
     * nothing more until PASS_MS after, on the samples' own clock. */
    this.pairs.set(key, Math.floor(c.tc + PASS_MS));
    /* Always scores, paper or none: a tear costs only the paper. */
    const points = POINTS_CUT;
    capture(a, b, c.link);
    a.points += points;
    a.cuts += 1;
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
