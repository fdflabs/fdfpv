/*
 * war.js: Defend Itaipu, the room's half of the war mode
 * (docs/WARFARE-PLAN.md sections 4 and 5.1). The client's half is
 * src/share/roomwar.js (package C); the attackers' paths are
 * src/share/war/routes.js, which both halves run.
 *
 * The room flies the attackers, judges every detonation, and keeps the
 * output, the rack and the scores:
 *
 *   waves     a mission's waves are born on the room clock at their `at`
 *             after the go, announced BIRTH_LEAD_MS early so every screen
 *             draws them from their first millisecond; a scripted
 *             attacker's pose is never sent (routes.js), a hunter's is
 *             (AGENTS, 0xA0), because the room steers it at the pilots
 *   warheads  a defender detonates when any part box of it comes within
 *             BLAST_M of an attacker's centre: src/game/midair.js within,
 *             tag's bubble, with the attacker as the Ace. It kills the
 *             attacker, the defender, and every other attacker within
 *             BLAST_M of that attacker's centre then. A hunter that
 *             reaches a pilot is the same test: both go.
 *   output    an attacker alive at the end of its route takes its
 *             target's mw once, when its seeded error left it within the
 *             target's r
 *   the rack  rack x pilots airframes at the go; every detonation and
 *             every crash takes one
 *   the end   won when every wave is born and none is left, with the
 *             output at or over floorMw; lost the instant the output is
 *             under it, or the rack is empty with attackers alive
 *
 * ONE TIMELINE, JUDGED IN ORDER: tag's (edge/rooms/tag.js). Everything is
 * decided on the room clock over the span every seat heard from in the
 * last WAIT_MS has covered, or LATE_MS behind the room clock, whichever is
 * later: the frontier f. The earliest event wins: a detonation (a tie to
 * the lower seat, then the lower attacker id), a crash, an arrival; then
 * the judgement goes on from there with what is left. The attackers are
 * the room's own samples, so they are never late: a scripted one is
 * sampled from its route on a fixed SAMPLE_MS grid, the same grid on
 * every run, so lag decides nothing; a hunter is sampled where the room
 * stepped it, on the room tick. The judgement runs on the room tick, not
 * on every pose: 30 times a second instead of 30 per pilot, and a tick is
 * as good as a pose for the answer, which is from the samples alone.
 *
 * A DEFENDER THAT WENT OFF is disarmed at once, and armed again only once
 * its own samples have shown it crashed or spawning after the blast and
 * then clean: its plant breaks when its client hears the boom, so the
 * samples between the blast and that are the same airframe, which has
 * already gone. Its crash is the blast's and takes nothing more from the
 * rack. A LOST LINK is the same: the pilot's own client says its airframe
 * is lost (section 6.4, the link down for 3 s), which takes one off the
 * rack and disarms the seat by the same rule, so saying it again, or the
 * wreck that follows, takes nothing more.
 *
 * What a client sends (JSON text): the host only, a private room only
 * (core.js hostCheck refuses 'private' in a public one, section 9),
 *
 *   { type: 'war', op: 'start', mission }   count down and fight it
 *   { type: 'war', op: 'end' }              stop now
 *
 * and any pilot, about its own seat, while a war is on and it is neither
 * spawning nor already a wreck:
 *
 *   { type: 'war', op: 'lost' }             my airframe is lost
 *
 * What the room sends, to everybody:
 *
 *   { type: 'war', war }                      the view (view()), on every
 *                                             change and in each welcome
 *   { type: 'war', op: 'born', agents }       [{ id, kind, route, t0, k,
 *                                             n, err, target }], routes.js
 *                                             planAgent's input
 *   { type: 'war', op: 'dead', ids, at, by, why, p }
 *                                             why 'boom' (by the seat),
 *                                             'arrive' (by 0, with target
 *                                             and hit) or 'leave' (by 0);
 *                                             scouts: true on the boom that
 *                                             killed a scout wave's last
 *   { type: 'war', op: 'boom', seat, at, p }  a defender detonated: that
 *                                             seat breaks its own craft
 *   { type: 'war', error }                    to a refused sender
 *
 * and AGENTS (0xA0) to each seat on the room tick, thinned by distance on
 * the core's INTEREST bands, each followed by HUNTS (0xA1): the same
 * hunters' target seats.
 *
 * WHAT OWNS WHAT. This object lives inside one RoomCore, which runs one
 * event at a time, so nothing here locks. The match (the attackers alive,
 * the output, the rack, the scores, the hunters' saved state) is handed
 * back as a { store: 'war' } action on every change, and to restore() by
 * edge/rooms/host.js after a restart; the samples are memory only, and a
 * scripted attacker's are rebuilt from its route.
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
  FLAG_AIRBORNE, FLAG_CRASHED, FLAG_SPAWNING, decodePose, encodeAgents, encodeHunts,
} from '../../src/share/roomwire.js';
import {
  LATE_MS, Track, hullDistance, hullFor, poseAt as trackPose, within,
} from '../../src/game/midair.js';
import {
  BLAST_M, KIND, KINDS, planAgent, poseAt,
} from '../../src/share/war/routes.js';
import { MISSIONS } from '../../src/share/war/missions/index.js';
import { COUNTDOWN_MS } from './race.js';
import { AHEAD_MS } from './referee.js';
import { WAIT_MS } from './tag.js';
import { POSE_MAX_SPEED } from './safety.js';
import { Hunters, loadHeight } from './warhunt.js';
import { HERE_MS, interestEvery } from './core.js';

export { MISSIONS };

/* A scripted attacker's samples: this far apart on the room clock, on
 * multiples of it, whatever the ticks do. The route's curvature between
 * two samples is a few millimetres at 20 ms. */
export const SAMPLE_MS = 20;
/* A wave is announced this long before its birth, so a screen that hears
 * it draws the attacker from its first millisecond. */
export const BIRTH_LEAD_MS = 2000;
/* An assist: within this of a kill's point, in the ASSIST_MS before it. */
export const ASSIST_M = 50;
export const ASSIST_MS = 3000;
/* A defender's positions are kept this long for the assists, apart from
 * its Track: within() finds its place in a Track by walking it, so a
 * Track holds no more than the judgement needs. */
const TRAIL_MS = ASSIST_MS + 1000;
/* An attacker's samples: the frontier is never more than LATE_MS and a
 * tick behind the room clock. */
const AGENT_KEEP_MS = 1000;
/* The fastest an attacker moves, the dive and a weave on top, with room
 * to spare: the cheap distance test before within() uses it. */
const AGENT_MAX_MPS = 80;
/* within() needs a hull for its A side only to be there: the attacker is
 * a point, its centre. */
const POINT = { id: 'point' };

const KIND_ID = new Map(KINDS.map((k, i) => [k, i]));

/*
 * The most any point of a hull reaching `reach` from its centre moves,
 * over the poses a Track interpolates for the milliseconds [first, last],
 * from the pose p0: its centre's displacement plus 2 x reach x the
 * attitude's chord from p0's (a rotation by q moves a point x by
 * 2|x| sin(half the angle), at most |x| |q - q0| x 2). An interpolated
 * position lies between its two samples, and an interpolated attitude on
 * the arc between them, so the samples' largest spread plus the largest
 * chord of one step bounds every millisecond. Infinity when the Track
 * does not cover `first`.
 */
function spread(track, first, last, p0, reach) {
  const s = track.s;
  let i = track.bracket(first);
  if (i < 0) {
    return Infinity;
  }
  let far = 0;
  let turn = 0;
  let step = 0;
  let prev = null;
  for (; i < s.length; i += 1) {
    const q = s[i];
    far = Math.max(far, Math.sqrt((q.px - p0.px) ** 2 + (q.py - p0.py) ** 2 + (q.pz - p0.pz) ** 2));
    turn = Math.max(turn, chord(q, p0));
    if (prev) {
      step = Math.max(step, chord(q, prev));
    }
    prev = q;
    if (q.t >= last) {
      break;
    }
  }
  return far + 2 * reach * (turn + step);
}

/* |a - b| between two attitude quaternions, on the same hemisphere. */
function chord(a, b) {
  const sg = a.qx * b.qx + a.qy * b.qy + a.qz * b.qz + a.qw * b.qw < 0 ? -1 : 1;
  return Math.sqrt((a.qx * sg - b.qx) ** 2 + (a.qy * sg - b.qy) ** 2 + (a.qz * sg - b.qz) ** 2 + (a.qw * sg - b.qw) ** 2);
}

const D0 = {};
const A0 = {};

/*
 * THE HULL'S BROADPHASE. Whether no part box of hull h can come within
 * BLAST_M of the attacker's centre in (t0, t1], so within() need not
 * measure the hull on every millisecond: the hull's distance at the
 * span's first millisecond, less the most either side can move in the
 * span (spread), is still outside BLAST_M. A hull's distance to a point
 * changes by no more than the point and the parts move, so this never
 * skips a detonation; an attacker parked just outside the bubble costs
 * one hullDistance a span instead of one a millisecond. within()'s own
 * broadphase, on the centres, passes such a pair every millisecond,
 * since its centre is inside BLAST_M plus the hull's reach.
 */
function clearOf(h, dTrack, aTrack, t0, t1) {
  const first = Math.floor(t0) + 1;
  const last = Math.floor(t1);
  const d0 = trackPose(dTrack, first, D0);
  const a0 = trackPose(aTrack, first, A0);
  if (!d0 || !a0) {
    return false;
  }
  const gap = hullDistance(h, d0, a0.px, a0.py, a0.pz);
  const move = spread(dTrack, first, last, d0, h.hull.reach) + spread(aTrack, first, last, a0, 0);
  /* A micrometre for the rounding between a sample and its lerp. */
  return gap - move > BLAST_M + 1e-6;
}

/* Whether a sample can go off: seen, neither spawning nor crashed. */
function clean(p) {
  return (p.flags & (FLAG_SPAWNING | FLAG_CRASHED)) === 0;
}

/* A number a message carries, to the millimetre. */
const mm = (v) => Math.round(v * 1000) / 1000;

/* A seeded draw in [0, 1) from two integers, the same on every engine. */
function draw(seed, id) {
  let h = Math.imul((seed ^ Math.imul(id, 0x9e3779b1)) >>> 0, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/*
 * The floor each map's hunters hold over (edge/rooms/warhunt.js), read once
 * per process. Node reads Itaipu's heightfield from beside the missions
 * (the VM's deploy copies src/ whole); a Cloudflare Worker has no files, so
 * there it is null and the hunters fly over flat ground at 0. That is by
 * decision (the lead's, 2026-09-29): production is the Node VM, and the
 * Worker, the retired platform (edge/rooms/README.md), is not where a war
 * is fought. getBuiltinModule rather than an import, so the Worker's
 * bundle never meets node:fs.
 */
const FLOORS = new Map();
function floorOf(map) {
  if (FLOORS.has(map)) {
    return FLOORS.get(map);
  }
  const fs = map === 'itaipu' && globalThis.process && process.getBuiltinModule ? process.getBuiltinModule('node:fs') : null;
  const floor = fs ? loadHeight(fs.readFileSync(new URL('../../src/share/war/itaipu-height.bin', import.meta.url))) : null;
  FLOORS.set(map, floor);
  return floor;
}

export class RoomWar {
  constructor(meta) {
    this.meta = meta;
    /*
     * { id, mission, seed, goAt, state: 'countdown'|'live'|'won'|'lost'|
     *   'ended', why, f, wave (the next to be born), output, down (target
     *   ids hit), rack, rackMax, players: { seat: { kills, assists, mw,
     *   token } }, agents: [birth records alive], nextAgent, scouts: { n,
     *   killed } of the last scout wave or null, hunters (Hunters save),
     *   endAt }, or null before the first game.
     */
    this.match = null;
    this.nextId = 1;
    this.missions = MISSIONS;
    /* The seed of a game's error draws. Math.random in the room; the
     * checks put a fixed one here so their runs repeat. */
    this.random = Math.random;
    this.hunters = new Hunters(null);
    /* id -> { a (birth record), plan, track, next, spawned }. Memory. */
    this.live = new Map();
    /* seat -> { airframe, hull, track, token, down, armFrom, crashT }. */
    this.seats = new Map();
    /* seat -> Map(agent id -> tickNo sent), for the AGENTS thinning. */
    this.sent = new Map();
    this.lastStep = -Infinity;
    this.lastPoses = [];
    /* For the checks: every detonation, arrival and crash, with when it
     * was decided. Memory only. */
    this.log = [];
  }

  mission() {
    return this.match ? this.missions[this.match.mission] : null;
  }

  restore(saved) {
    if (!saved) {
      return;
    }
    this.match = saved.match ?? null;
    this.nextId = saved.nextId ?? 1;
    this.live = new Map();
    if (!this.match || !this.missions[this.match.mission]) {
      this.match = null;
      return;
    }
    this.hunters = new Hunters(floorOf(this.mission().map));
    this.hunters.restore(this.match.hunters);
    for (const a of this.match.agents) {
      this.adopt(a, true);
    }
  }

  store() {
    const m = this.match;
    if (m) {
      m.hunters = this.hunters.save();
    }
    return { store: 'war', value: { match: m, nextId: this.nextId } };
  }

  /* Counting down or on: the room runs no other game. */
  on() {
    const m = this.match;
    return Boolean(m) && (m.state === 'countdown' || m.state === 'live');
  }

  view(core) {
    const m = this.match;
    if (!m) {
      return { state: 'lobby' };
    }
    const here = new Set(this.players(core));
    const mission = this.mission();
    return {
      state: m.state,
      id: m.id,
      mission: m.mission,
      goAt: m.goAt,
      f: m.f,
      wave: m.wave,
      waves: mission.waves.length,
      output: m.output,
      floor: mission.floorMw,
      down: m.down.slice(),
      rack: m.rack,
      rackMax: m.rackMax,
      alive: m.agents.length,
      blast: BLAST_M,
      scores: Object.entries(m.players).map(([seat, p]) => ({
        seat: Number(seat), kills: p.kills, assists: p.assists, mw: p.mw, gone: !here.has(Number(seat)),
      })).sort((a, b) => b.kills - a.kills || b.mw - a.mw || a.seat - b.seat),
      why: m.why,
      endAt: m.endAt,
    };
  }

  welcome(core) {
    return { war: this.view(core) };
  }

  broadcast(core, msg) {
    const data = JSON.stringify(msg);
    return [...core.seats.keys()].map((conn) => ({ send: conn, data }));
  }

  changed(core) {
    return [this.store(), ...this.broadcast(core, { type: 'war', war: this.view(core) })];
  }

  error(conn, error) {
    return [{ send: conn, data: JSON.stringify({ type: 'war', error }) }];
  }

  /* A pilot just seated mid game: every attacker alive, as births. */
  join(core, conn) {
    if (!this.on() || !this.match.agents.length) {
      return [];
    }
    return [{ send: conn, data: JSON.stringify({ type: 'war', op: 'born', agents: this.match.agents }) }];
  }

  /* The match's players who are here, by the seat's token (tag's rule). */
  players(core) {
    const m = this.match;
    if (!m) {
      return [];
    }
    return [...core.seats.values()]
      .filter((t) => m.players[t.seat] && (m.players[t.seat].token == null || m.players[t.seat].token === t.token))
      .map((t) => t.seat);
  }

  leave(seat) {
    this.seats.delete(seat);
    this.sent.delete(seat);
  }

  /* One text message of type 'war' from seat s. */
  message(core, conn, s, msg, now) {
    if (msg.op === 'lost') {
      return this.lost(core, conn, s, now);
    }
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

  /* A pilot's own airframe lost to its link (section 6.4). Refused
   * outside a live war ('off'), before the room has its poses ('unseen'),
   * while spawning ('spawning') or as a wreck ('wreck', whose crash the
   * room counts); nothing at all for a seat already disarmed, so it is
   * once a life. */
  lost(core, conn, s, now) {
    const m = this.match;
    if (!m || m.state !== 'live') {
      return this.error(conn, 'off');
    }
    const rec = this.seats.get(s.seat);
    const p = rec && rec.token === s.token ? rec.track.s.at(-1) : null;
    if (!p) {
      return this.error(conn, 'unseen');
    }
    if (rec.down) {
      return [];
    }
    if (p.flags & FLAG_SPAWNING) {
      return this.error(conn, 'spawning');
    }
    if (p.flags & FLAG_CRASHED) {
      return this.error(conn, 'wreck');
    }
    const out = this.advance(core, now);
    if (m.state !== 'live') {
      return out;
    }
    rec.down = { at: p.t, seen: false };
    m.rack = Math.max(0, m.rack - 1);
    this.log.push({
      what: 'lost', t: p.t, seat: s.seat, decided: core.roomMs(now),
    });
    this.settle(m.f);
    return [...out, ...this.changed(core)];
  }

  /* Ended before it was won or lost: by the host, or by the room when
   * nobody is left to play it (core.js settleGames). */
  abandon(core, now) {
    if (!this.on()) {
      return [];
    }
    this.finish(Math.min(this.match.f, core.roomMs(now)), 'ended', 'end');
    return this.changed(core);
  }

  start(core, conn, msg, now) {
    /* core.js hostCheck refuses it first; this holds without it. */
    if (this.meta.public) {
      return this.error(conn, 'private');
    }
    if (core.game()) {
      return this.error(conn, 'busy');
    }
    const mission = typeof msg.mission === 'string' && Object.hasOwn(this.missions, msg.mission) ? this.missions[msg.mission] : null;
    if (!mission) {
      return this.error(conn, 'mission');
    }
    if (mission.map !== core.meta.map) {
      return this.error(conn, 'map');
    }
    const goAt = Math.ceil(core.roomMs(now)) + COUNTDOWN_MS;
    const players = {};
    for (const t of core.seats.values()) {
      players[t.seat] = {
        kills: 0, assists: 0, mw: 0, token: t.token,
      };
    }
    this.match = {
      id: this.nextId,
      mission: mission.id,
      seed: Math.floor(this.random() * 4294967296) >>> 0,
      goAt,
      state: 'countdown',
      why: null,
      f: goAt,
      wave: 0,
      output: mission.output,
      down: [],
      rack: 0,
      rackMax: 0,
      players,
      agents: [],
      nextAgent: 1,
      scouts: null,
      spawned: [],
      hunters: null,
      endAt: null,
    };
    this.nextId += 1;
    this.live = new Map();
    this.hunters = new Hunters(floorOf(mission.map));
    this.lastStep = -Infinity;
    this.lastPoses = [];
    this.sent = new Map();
    this.log = [];
    for (const r of this.seats.values()) {
      r.down = null;
      r.armFrom = -Infinity;
      r.crashT = -Infinity;
    }
    return this.changed(core);
  }

  /* A seat's samples and hull, new when its airframe or its pilot is. */
  seatOf(s) {
    const had = this.seats.get(s.seat);
    if (had && had.airframe === s.profile.airframe && had.token === s.token) {
      return had;
    }
    const next = {
      airframe: s.profile.airframe, hull: hullFor(s.profile.airframe), track: new Track(), trail: [], token: s.token,
      down: null, armFrom: -Infinity, crashT: -Infinity,
    };
    this.seats.set(s.seat, next);
    return next;
  }

  /* A seat's POSE as the room relays it (spawning set by safety.js). */
  pose(core, s, bytes, now) {
    if (!this.on()) {
      return [];
    }
    const p = decodePose(bytes);
    if (!p || p.t > core.roomMs(now) + AHEAD_MS || s.profile.map !== core.meta.map) {
      return [];
    }
    const rec = this.seatOf(s);
    if (!rec.track.push(p)) {
      return [];
    }
    rec.trail.push([p.t, p.px, p.py, p.pz]);
    if (rec.trail[0][0] < p.t - TRAIL_MS - 1000) {
      rec.trail = rec.trail.filter(([t]) => t >= p.t - TRAIL_MS);
    }
    this.match.players[s.seat] ??= {
      kills: 0, assists: 0, mw: 0, token: s.token,
    };
    /* Down after a blast until its own samples show the wreck and then a
     * clean airframe again. */
    if (rec.down && p.t > rec.down.at) {
      if (!clean(p)) {
        rec.down.seen = true;
      } else if (rec.down.seen) {
        rec.armFrom = p.t;
        rec.down = null;
      }
    }
    return [];
  }

  tick(core, now) {
    if (!this.on()) {
      return [];
    }
    return [...this.advance(core, now), ...this.agentsOut(core, core.roomMs(now))];
  }

  /* The seats here, in the room's world, by seat, with their samples. */
  flying(core) {
    const out = [];
    for (const s of core.seats.values()) {
      const t = this.seats.get(s.seat);
      if (t && t.hull && s.profile.map === core.meta.map && t.token === s.token) {
        out.push({ seat: s.seat, ...t, rec: t });
      }
    }
    return out.sort((a, b) => a.seat - b.seat);
  }

  /* An attacker's working state from its birth record; `restored` starts
   * its samples wherever the judgement has got to. */
  adopt(a, restored = false) {
    const plan = planAgent(this.mission(), a);
    const x = {
      a, plan, track: new Track(AGENT_KEEP_MS), next: null, spawned: this.match.spawned.includes(a.id), restored,
    };
    this.live.set(a.id, x);
    return x;
  }

  /* The waves due, announced BIRTH_LEAD_MS ahead of their birth. */
  births(core, roomNow) {
    const m = this.match;
    const mission = this.mission();
    const born = [];
    while (m.wave < mission.waves.length && roomNow >= m.goAt + mission.waves[m.wave].at * 1000 - BIRTH_LEAD_MS) {
      const w = mission.waves[m.wave];
      const t0 = m.goAt + w.at * 1000;
      /* While a scout of the last scout wave lives (or got away), the
       * waves fly their routes exactly; once all of them are dead, each
       * attacker draws its error (section 4.2). */
      const blind = Boolean(m.scouts) && m.scouts.killed >= m.scouts.n;
      for (let k = 0; k < w.n; k += 1) {
        const id = m.nextAgent;
        m.nextAgent += 1;
        const err = blind && w.spread ? mm(w.spread * (2 * draw(m.seed, id) - 1)) : 0;
        const a = {
          id, kind: w.kind, route: w.route, t0, k, n: w.n, err, target: w.target ?? null, wave: m.wave,
        };
        m.agents.push(a);
        this.adopt(a);
        born.push(a);
      }
      if (w.kind === 'scout') {
        m.scouts = { wave: m.wave, n: w.n, killed: 0 };
      }
      m.wave += 1;
    }
    if (!born.length) {
      return [];
    }
    return this.broadcast(core, { type: 'war', op: 'born', agents: born });
  }

  /* A scripted attacker's samples, on the SAMPLE_MS grid, up to t. */
  fill(x, t) {
    const plan = x.plan;
    if (x.a.kind === 'hunter') {
      return;
    }
    if (x.next == null) {
      x.next = x.restored ? Math.max(plan.t0, Math.floor((this.match.f - SAMPLE_MS) / SAMPLE_MS) * SAMPLE_MS) : plan.t0;
    }
    /* One sample at or past t, so every millisecond up to t is between
     * two: the span's last ones are judged now, never skipped. The end on
     * the millisecond, so its arrival is covered. */
    while (x.track.newest() < t && x.next <= plan.tEnd) {
      this.sample(x, x.next);
      x.next = (Math.floor(x.next / SAMPLE_MS) + 1) * SAMPLE_MS;
    }
    if (x.track.newest() < t && x.track.newest() < plan.tEnd) {
      this.sample(x, plan.tEnd);
      x.next = Infinity;
    }
  }

  sample(x, t) {
    const o = poseAt(x.plan, t);
    x.track.push({
      t, px: o.p[0], py: o.p[1], pz: o.p[2], qx: o.q[0], qy: o.q[1], qz: o.q[2], qw: o.q[3], vx: o.v[0], vy: o.v[1], vz: o.v[2], flags: FLAG_AIRBORNE,
    });
  }

  /* The hunters, one step to the room's now, on the room tick. */
  hunt(core, roomNow) {
    const defenders = [];
    for (const f of this.flying(core)) {
      const s = f.track.s.at(-1);
      if (s) {
        defenders.push({
          seat: f.seat, p: [s.px, s.py, s.pz], v: [s.vx, s.vy, s.vz], live: clean(s) && !f.down && roomNow - s.t <= HERE_MS,
        });
      }
    }
    for (const x of this.live.values()) {
      if (x.a.kind === 'hunter' && !x.spawned && roomNow >= x.a.t0) {
        this.hunters.spawn(x.a.id, poseAt(x.plan, x.a.t0).p.slice(), x.a.t0);
        x.spawned = true;
        this.match.spawned.push(x.a.id);
      }
    }
    if (![...this.live.values()].some((x) => x.spawned)) {
      this.lastPoses = [];
      return;
    }
    this.lastPoses = this.hunters.step(roomNow, defenders);
    this.lastStep = roomNow;
    for (const h of this.lastPoses) {
      const x = this.live.get(h.id);
      if (!x) {
        continue;
      }
      const prev = x.track.s.at(-1);
      let v;
      if (prev && roomNow > prev.t) {
        const dt = (roomNow - prev.t) / 1000;
        v = [(h.p[0] - prev.px) / dt, (h.p[1] - prev.py) / dt, (h.p[2] - prev.pz) / dt];
      } else {
        /* The nose, -z turned by q, at the kind's speed. */
        const [qx, qy, qz, qw] = h.q;
        const f = [-(2 * (qx * qz + qw * qy)), -(2 * (qy * qz - qw * qx)), -(1 - 2 * (qx * qx + qy * qy))];
        v = f.map((c) => c * KIND.hunter.speed);
      }
      x.track.push({
        t: roomNow, px: h.p[0], py: h.p[1], pz: h.p[2], qx: h.q[0], qy: h.q[1], qz: h.q[2], qw: h.q[3], vx: v[0], vy: v[1], vz: v[2], flags: FLAG_AIRBORNE,
      });
    }
  }

  /* Move the game on to what the room now knows. */
  advance(core, now) {
    const m = this.match;
    const roomNow = core.roomMs(now);
    const state = m.state;
    const out = [];
    if (m.state === 'countdown' && roomNow >= m.goAt) {
      m.state = 'live';
      const here = this.players(core);
      m.rackMax = this.mission().rack * Math.max(1, here.length);
      m.rack = m.rackMax;
    }
    let dirty = m.state !== state;
    if (m.state === 'live') {
      const born = this.births(core, roomNow);
      dirty ||= born.length > 0;
      out.push(...born);
      this.hunt(core, roomNow);
      const judged = this.judge(core, roomNow);
      dirty ||= judged.dirty;
      out.push(...judged.out);
    }
    return dirty ? [...this.changed(core), ...out] : out;
  }

  /*
   * Judge the room milliseconds (f, t1] that every seat heard from in the
   * last WAIT_MS has covered, or that are LATE_MS old, and that the
   * hunters' steps have reached. Returns the messages of what happened.
   */
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
    if ([...this.live.values()].some((x) => x.spawned)) {
      t1 = Math.min(t1, Math.floor(this.lastStep));
    }
    if (!(t1 > m.f)) {
      return { out: [], dirty: false };
    }
    for (const x of this.live.values()) {
      this.fill(x, t1);
    }
    const out = [];
    let dirty = false;
    let from = m.f;
    while (m.state === 'live' && from < t1) {
      const next = this.step(core, fly, from, t1, roomNow);
      if (!next) {
        break;
      }
      dirty = true;
      out.push(...next.out);
      from = next.from;
    }
    m.f = m.state === 'live' ? t1 : m.f;
    return { out, dirty };
  }

  /*
   * The first thing to happen in (from, t1]: a detonation, a crash, or an
   * attacker at the end of its route. Applies it and returns { out, from }
   * to go on from, or null when nothing happens before t1.
   */
  step(core, fly, from, t1, roomNow) {
    let boom = null;
    for (const d of fly) {
      if (d.down) {
        continue;
      }
      const start = Math.max(from, d.armFrom);
      if (!(start < t1)) {
        continue;
      }
      const dLast = d.track.s.at(-1);
      if (!dLast) {
        continue;
      }
      for (const x of this.live.values()) {
        const aLast = x.track.s.at(-1);
        if (!aLast) {
          continue;
        }
        /* Too far apart for anything in the span: each side has moved at
         * most its top speed since the span's start. */
        const reach = BLAST_M + d.hull.hull.reach + 1
          + (AGENT_MAX_MPS * Math.max(0, aLast.t - start) + POSE_MAX_SPEED * Math.max(0, dLast.t - start)) / 1000;
        const dx = aLast.px - dLast.px;
        const dy = aLast.py - dLast.py;
        const dz = aLast.pz - dLast.pz;
        if (dx * dx + dy * dy + dz * dz > reach * reach) {
          continue;
        }
        const end = boom ? Math.min(t1, boom.tc) : t1;
        if (clearOf(d.hull, d.track, x.track, start, end)) {
          continue;
        }
        const c = within(POINT, d.hull, x.track, d.track, start, end, BLAST_M);
        if (c && (!boom || c.tc < boom.tc)) {
          boom = { tc: c.tc, d, x };
        }
      }
    }
    const until = boom ? boom.tc : t1;
    /* A crash: the first sample showing it, after the last one not. */
    let crash = null;
    for (const d of fly) {
      if (d.down) {
        continue;
      }
      const s = d.track.s;
      for (let i = 1; i < s.length; i += 1) {
        const t = s[i].t;
        /* A crash on `from` itself is another seat's on the same
         * millisecond as the event before: crashT keeps each seat's to one. */
        if (t < from || t <= d.armFrom || t <= d.crashT) {
          continue;
        }
        /* On a boom's millisecond the crash sample made it untouchable,
         * so the boom cannot be there: nothing to order. */
        if (t > until || (crash && t >= crash.t)) {
          break;
        }
        if ((s[i].flags & FLAG_CRASHED) && !(s[i - 1].flags & FLAG_CRASHED)) {
          crash = { t, d };
          break;
        }
      }
    }
    /* An arrival on the millisecond of a boom or a crash comes after it:
     * the defender's. With neither, the span's last one counts. An
     * attacker still alive past its end (restored after a restart) arrives
     * now. */
    const limit = crash ? crash.t : until;
    const last = !crash && !boom;
    let arrive = null;
    for (const x of this.live.values()) {
      const e = x.plan.tEnd;
      if ((e < limit || (last && e <= limit)) && (!arrive || e < arrive.plan.tEnd || (e === arrive.plan.tEnd && x.a.id < arrive.a.id))) {
        arrive = x;
      }
    }
    if (arrive) {
      return { out: this.arrival(core, arrive, roomNow), from: arrive.plan.tEnd };
    }
    if (crash) {
      return { out: this.crashed(core, crash, roomNow), from: crash.t };
    }
    if (boom) {
      /* Others may go off on the same millisecond: judged again from
       * the one before it, without the dead. */
      return { out: this.detonate(core, boom, fly, roomNow), from: boom.tc - 1 };
    }
    return null;
  }

  /* Take attackers off: the samples, the hunters, and, when a warhead
   * `killed` them, the scouts' count (a scout that got away is not dead,
   * section 4.2). */
  remove(ids, killed = false) {
    const m = this.match;
    const gone = new Set(ids);
    for (const a of m.agents) {
      if (killed && gone.has(a.id) && m.scouts && a.kind === 'scout' && a.wave === m.scouts.wave) {
        m.scouts.killed += 1;
      }
    }
    m.agents = m.agents.filter((a) => !gone.has(a.id));
    m.spawned = m.spawned.filter((id) => !gone.has(id));
    for (const id of ids) {
      this.live.delete(id);
      this.hunters.kill(id);
    }
  }

  detonate(core, boom, fly, roomNow) {
    const m = this.match;
    const mission = this.mission();
    const { tc, d, x } = boom;
    const c = trackPose(x.track, tc);
    const p = [c.px, c.py, c.pz];
    const killed = [];
    for (const y of this.live.values()) {
      const q = y === x ? c : trackPose(y.track, tc, {});
      if (q && (y === x || Math.hypot(q.px - p[0], q.py - p[1], q.pz - p[2]) <= BLAST_M)) {
        killed.push(y.a);
      }
    }
    killed.sort((a, b) => a.id - b.id);
    const player = m.players[d.seat] ??= {
      kills: 0, assists: 0, mw: 0, token: d.token,
    };
    player.kills += killed.length;
    for (const a of killed) {
      player.mw += a.target != null ? mission.targets[a.target].mw : 0;
    }
    for (const o of fly) {
      if (o.seat === d.seat || !m.players[o.seat]) {
        continue;
      }
      if (o.trail.some(([t, x, y, z]) => t >= tc - ASSIST_MS && t <= tc && Math.hypot(x - p[0], y - p[1], z - p[2]) <= ASSIST_M)) {
        m.players[o.seat].assists += 1;
      }
    }
    d.rec.down = { at: tc, seen: false };
    d.down = d.rec.down;
    m.rack = Math.max(0, m.rack - 1);
    const ids = killed.map((a) => a.id);
    const scoutsWere = m.scouts ? m.scouts.killed : 0;
    this.remove(ids, true);
    const scoutsDown = Boolean(m.scouts) && scoutsWere < m.scouts.n && m.scouts.killed >= m.scouts.n;
    this.log.push({
      what: 'boom', t: tc, seat: d.seat, id: x.a.id, ids, decided: roomNow,
    });
    const at = p.map(mm);
    const out = [
      ...this.broadcast(core, {
        type: 'war', op: 'boom', seat: d.seat, at: tc, p: at,
      }),
      ...this.broadcast(core, {
        type: 'war', op: 'dead', ids, at: tc, by: d.seat, why: 'boom', p: at, ...(scoutsDown ? { scouts: true } : {}),
      }),
    ];
    this.settle(tc);
    return out;
  }

  crashed(core, crash, roomNow) {
    const m = this.match;
    crash.d.rec.crashT = crash.t;
    crash.d.crashT = crash.t;
    m.rack = Math.max(0, m.rack - 1);
    this.log.push({
      what: 'crash', t: crash.t, seat: crash.d.seat, decided: roomNow,
    });
    this.settle(crash.t);
    return [];
  }

  arrival(core, x, roomNow) {
    const m = this.match;
    const a = x.a;
    const t = x.plan.tEnd;
    const o = poseAt(x.plan, t);
    const target = a.target != null ? this.mission().targets[a.target] : null;
    const hit = Boolean(target) && Math.abs(a.err) <= target.r;
    if (hit && !m.down.includes(a.target)) {
      m.down.push(a.target);
      m.output = Math.max(0, m.output - target.mw);
    }
    this.remove([a.id]);
    this.log.push({
      what: x.plan.end, t, id: a.id, target: a.target, hit, decided: roomNow,
    });
    const msg = {
      type: 'war', op: 'dead', ids: [a.id], at: mm(t), by: 0, why: x.plan.end, p: o.p.map(mm),
    };
    if (target) {
      msg.target = a.target;
      msg.hit = hit;
    }
    this.settle(t);
    return this.broadcast(core, msg);
  }

  /* Won or lost, at t, after anything that changed the count. */
  settle(t) {
    const m = this.match;
    const mission = this.mission();
    if (m.output < mission.floorMw) {
      this.finish(t, 'lost', 'output');
    } else if (m.wave >= mission.waves.length && !m.agents.length) {
      this.finish(t, 'won', 'waves');
    } else if (m.rack <= 0 && m.agents.length) {
      this.finish(t, 'lost', 'rack');
    }
  }

  finish(t, state, why) {
    const m = this.match;
    m.state = state;
    m.why = why;
    m.endAt = t;
    m.f = t;
  }

  /*
   * AGENTS to every seat: the hunters' newest poses, each at its interest
   * band's rate by the distance from the seat's own newest pose (core.js
   * INTEREST), every one to a seat not flying.
   */
  agentsOut(core, roomNow) {
    if (!this.lastPoses.length) {
      return [];
    }
    const out = [];
    for (const [conn, s] of core.seats) {
      const rec = this.seats.get(s.seat);
      const here = rec && rec.token === s.token ? rec.track.s.at(-1) : null;
      const at = here && roomNow - here.t <= HERE_MS ? [here.px, here.py, here.pz] : null;
      let sent = this.sent.get(s.seat);
      if (!sent) {
        sent = new Map();
        this.sent.set(s.seat, sent);
      }
      const list = [];
      for (const h of this.lastPoses) {
        const last = sent.get(h.id);
        if (last != null && core.tickNo - last < interestEvery(at, h.p)) {
          continue;
        }
        sent.set(h.id, core.tickNo);
        list.push({ id: h.id, kind: KIND_ID.get('hunter'), p: h.p, q: h.q, target: h.target });
      }
      if (list.length) {
        out.push({ send: conn, data: encodeAgents(this.lastStep, list) });
        out.push({ send: conn, data: encodeHunts(this.lastStep, list) });
      }
    }
    return out;
  }
}
