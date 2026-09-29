/*
 * tag-harness.js: Catch the Ace's referee under lag, measured
 * (docs/TAG-PLAN.md, checks). npm run tag:harness.
 *
 * It drives the real room (edge/rooms/core.js with edge/rooms/tag.js) in
 * Node, the way scripts/midair-harness.js drives the mid air referee:
 * clients whose true paths are scripted on the whole millisecond, each
 * sampling its own at 30 Hz on a phase of its own and stamping the room
 * clock, over FIFO links (a base, a uniform jitter, and a 200 ms stall on
 * a quarter of the up links), with the room's messages coming back over
 * each client's own down link.
 *
 * Two kinds of run:
 *
 *   furball   four aircraft (planes and quads) on random smooth paths
 *             through one ball about 36 m across, so the Ace is passed
 *             round through its bubble; one of them crashes for 3 s and
 *             flies on spawning for 5 s, and one pauses (sends nothing)
 *             for 1 s. A match to GOAL points, played until the room says
 *             it is over.
 *   pass      the edges, scripted: a hunter passing the Ace head on with
 *             its nearest part at a truth reach of 5.0 to 7.0 m from the
 *             Ace's centre in 10 cm steps (is it a tag?), and a hunter
 *             that flies into the bubble and then keeps station 3 m from
 *             the Ace's centre (when is the tag back?).
 *
 * Every run is held to:
 *   1. every client's crown timeline and final scores are the room's
 *   2. the timeline and the scores are the zero latency run's, for every
 *      run whose samples all reached the room inside LATE_MS
 *   3. no false tag: at every tag the hunter's true hull is within
 *      BUBBLE_M (plus 5 cm, the 30 Hz interpolation) of the Ace's true
 *      centre
 *   4. no miss: a pass 15 cm or more inside BUBBLE_M is a tag, and the
 *      owner's two numbers: a pass at 6.5 m is never a tag, on any run,
 *      and one at 5.5 m always is, on every run inside LATE_MS
 *   5. tag back protection: no crown changes by a tag inside PROTECT_MS of
 *      the last change, and the station keeper's tag back is at exactly
 *      PROTECT_MS and a millisecond
 *   6. the scores add up: recounted from the script (the crown timeline,
 *      and the Ace's sampled flags and gaps), every seat's ms is the room's
 *   7. the match ends at exactly the goal: the winner has GOAL x 1000 ms,
 *      nobody else has as much, and the recount reaches it at endAt
 * and reports the decision delay (decided less the tag). Run 1 has
 * exact clocks; run 2 puts each client's clock off by up to 10 ms either
 * way, holds rows 1, 2, 5, 6, 7 and reports the band for 3 and 4.
 *
 *   node scripts/tag-harness.js [--seeds=12] [--runs=16] [--jobs=N] [--run=1|2]
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

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  FLAG_AIRBORNE, FLAG_CRASHED, FLAG_SPAWNING, PROTO, decodePose, encodePose,
} from '../src/share/roomwire.js';
import { RoomCore, PRIVATE_CAP } from '../edge/rooms/core.js';
import { COUNTDOWN_MS } from '../edge/rooms/race.js';
import { BUBBLE_M, POINT_MS, PROTECT_MS } from '../src/share/roomtag.js';
import {
  GAP_MS, LATE_MS, hullDistance, hullFor,
} from '../src/game/midair.js';

const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const SEEDS = Number(arg('seeds', 12));
const RUNS = Number(arg('runs', 16));
const BASES = [0, 25, 50, 100, 200, 300];
const JITTERS = [0, 10, 30, 60];
const SAMPLE_MS = 1000 / 30;
const STALL_MS = 200;
const STALL_P = 0.25;
const START_AT = 1000; /* the host presses start, room ms */
const GO = START_AT + COUNTDOWN_MS;
const GOAL = 40;
const FURBALL_END = GO + 240000; /* a match not over by then fails row 7 */
const Y = 100;
const DEEP_M = 0.15;
const INTERP_M = 0.05;
/* The furball's ball, as a multiple of two sines of 2.5 to 5 m a side,
 * each slowed by as much so the speeds are the small ball's: big enough
 * that a 6 m bubble is entered and left, not lived in. */
const BALL = 3;

/* ------------------------------------------------------------ helpers */

function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/* The Three.js body's nose is -z: a yaw about y taking it to the
 * horizontal heading (vx, vz). Harness only: trigonometry is fine here. */
function headingQ(vx, vz) {
  const psi = Math.atan2(-vx, -vz);
  return { qx: 0, qy: Math.sin(psi / 2), qz: 0, qw: Math.cos(psi / 2) };
}

/* A random smooth path through the ball: two sines on each axis. */
function wander(rand) {
  const terms = [0, 1, 2].map((k) => [0, 1].map(() => ({
    a: BALL * ((k === 1 ? 1 : 2.5) + rand() * (k === 1 ? 1.5 : 2.5)),
    w: (0.6 + rand() * 0.8) / BALL,
    p: rand() * 2 * Math.PI,
  })));
  return (t) => {
    const s = t / 1000;
    const pos = [0, Y, 0];
    const vel = [0, 0, 0];
    for (let k = 0; k < 3; k += 1) {
      for (const { a, w, p } of terms[k]) {
        pos[k] += a * Math.sin(w * s + p);
        vel[k] += a * w * Math.cos(w * s + p);
      }
    }
    return {
      px: pos[0], py: pos[1], pz: pos[2], vx: vel[0], vy: vel[1], vz: vel[2], ...headingQ(vel[0], vel[2]), flags: FLAG_AIRBORNE,
    };
  };
}

/* Level at Y along x at speed v (negative: toward -x), z to the side. */
function level(z, v, x0) {
  return (t) => ({
    px: x0 + v * t / 1000, py: Y, pz: z, vx: v, vy: 0, vz: 0, ...headingQ(v, 0), flags: FLAG_AIRBORNE,
  });
}

/* How far a pose's nearest part box is from the point (x, y, z): the
 * referee's own measure (src/game/midair.js hullDistance). */
function reachOf(airframe, pose, x, y, z) {
  return hullDistance(hullFor(airframe), pose, x, y, z);
}

/* The side offset, level at Y heading along x at speed v, that puts an
 * airframe's nearest part `reach` from a point on the line beside it, by
 * bisection: the reach only grows with the offset. */
function offsetFor(airframe, v, reach) {
  const q = headingQ(v, 0);
  let lo = 0;
  let hi = 30;
  while (hi - lo > 1e-9) {
    const mid = (lo + hi) / 2;
    if (reachOf(airframe, { px: 0, py: Y, pz: mid, ...q }, 0, Y, 0) < reach) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return hi;
}

/* A FIFO link: each message's arrival, from its send time, called in
 * send order; a stall holds everything from stallAt for STALL_MS. */
function link(base, jitter, stallAt, rand) {
  let last = -Infinity;
  return (send) => {
    let at = send + base + rand() * jitter;
    if (stallAt != null && at >= stallAt && at < stallAt + STALL_MS) {
      at = stallAt + STALL_MS;
    }
    at = Math.max(at, last);
    last = at;
    return at;
  };
}

const before = (x, y) => x.t < y.t || (x.t === y.t && x.k < y.k);
class Queue {
  constructor() {
    this.h = [];
    this.n = 0;
  }

  push(t, fn) {
    const h = this.h;
    const e = { t, k: this.n += 1, fn };
    let i = h.length;
    h.push(e);
    while (i > 0 && before(e, h[(i - 1) >> 1])) {
      h[i] = h[(i - 1) >> 1];
      i = (i - 1) >> 1;
    }
    h[i] = e;
  }

  pop() {
    const h = this.h;
    const top = h[0];
    const last = h.pop();
    if (!h.length) {
      return top;
    }
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      let m = l < h.length && before(h[l], last) ? l : -1;
      if (l + 1 < h.length && before(h[l + 1], m < 0 ? last : h[l])) {
        m = l + 1;
      }
      if (m < 0) {
        break;
      }
      h[i] = h[m];
      i = m;
    }
    h[i] = last;
    return top;
  }
}

/* ---------------------------------------------------------- scenarios */

/*
 * A scenario: { name, kind, air: [airframe per seat], paths: [fn(t)],
 * events per seat: crash [t0, t1] (FLAG_CRASHED, then FLAG_SPAWNING for
 * 5 s, as the client sets them), pause [t0, t1] (nothing sent), ace: the
 * seat the first draw gives, end: room ms to fly to, and for a pass its
 * truth reach }.
 */
function furball(seed) {
  const rand = rng(seed * 31 + 7);
  const air = ['cub1400', '5inch', 'p51d1450', 'bombshell1118'];
  const paths = air.map(() => wander(rand));
  const crashSeat = Math.floor(rand() * 4);
  const crashAt = GO + 8000 + Math.floor(rand() * 20000);
  const pauseSeat = (crashSeat + 1 + Math.floor(rand() * 3)) % 4;
  const pauseAt = GO + 5000 + Math.floor(rand() * 25000);
  const events = air.map((_, i) => ({
    crash: i === crashSeat ? [crashAt, crashAt + 3000] : null,
    pause: i === pauseSeat ? [pauseAt, pauseAt + 1000] : null,
  }));
  return { name: `furball ${seed}`, kind: 'furball', air, paths, events, pick: rand(), end: FURBALL_END };
}

/* Head on, the hunter's nearest part passing `reach` from the Ace's
 * centre. */
function pass(reach) {
  const air = ['cub1400', 'cub1400'];
  const off = offsetFor(air[0], -20, reach);
  const meet = GO + PROTECT_MS + 2000;
  return {
    name: `pass ${reach.toFixed(2)} m`,
    kind: 'pass',
    reach,
    air,
    /* Seat 1 is the hunter, seat 2 the Ace (the draw is made to say so). */
    paths: [level(off, -20, 20 * meet / 1000), level(0, 20, -20 * meet / 1000)],
    events: air.map(() => ({})),
    pick: 0.99,
    meet,
    end: meet + 1500,
  };
}

/* The hunter slides in beside the Ace and keeps station 3 m from its
 * centre: a tag, then, PROTECT_MS later, the tag back. */
function station() {
  const air = ['cub1400', 'cub1400'];
  const off = offsetFor(air[0], 18, BUBBLE_M / 2);
  const from = GO + PROTECT_MS + 1000;
  const ace = level(0, 18, 0);
  return {
    name: 'station keeping',
    kind: 'station',
    air,
    paths: [(t) => ({ ...ace(t), pz: off + 20 * Math.max(0, 1 - (t - GO) / (from - GO)) }), ace],
    events: air.map(() => ({})),
    pick: 0.99,
    end: from + 2 * PROTECT_MS + 1500,
  };
}

function scenarios() {
  const out = [];
  for (let s = 1; s <= SEEDS; s += 1) {
    out.push(furball(s));
  }
  for (let dm = 50; dm <= 70; dm += 1) {
    out.push(pass(dm / 10));
  }
  out.push(station());
  return out;
}

/* A seat's flags at t, as its client stamps them. */
function flagsAt(ev, t) {
  if (ev.crash && t >= ev.crash[0] && t < ev.crash[1]) {
    return FLAG_CRASHED;
  }
  if (ev.crash && t >= ev.crash[1] && t < ev.crash[1] + 5000) {
    return FLAG_AIRBORNE | FLAG_SPAWNING;
  }
  return FLAG_AIRBORNE;
}

/* ---------------------------------------------------------------- run */

/*
 * One run: the clients, the room, the links. cfg: { sc, seed, links
 * ([{ base, jitter }] per seat), clock (0 exact, 1 skewed) }.
 */
function runOne(cfg) {
  const { sc } = cfg;
  const n = sc.air.length;
  const rand = rng(cfg.seed * 7919 + 17);
  /* The seed's, not the link's: sampling phases, clock errors, stalls. */
  const phase = sc.air.map(() => rand() * SAMPLE_MS);
  const skew = sc.air.map(() => (cfg.clock ? (rand() - 0.5) * 20 : 0));
  const stalls = sc.air.map((_, i) => (rand() < STALL_P ? GO + rand() * 30000 + cfg.links[i].base : null));
  const linkRand = rng(cfg.seed * 104729 + 1);
  const up = sc.air.map((_, i) => link(cfg.links[i].base, cfg.links[i].jitter, stalls[i], linkRand));
  const down = sc.air.map((_, i) => link(cfg.links[i].base, cfg.links[i].jitter, null, linkRand));

  const q = new Queue();
  const room = new RoomCore({ code: 'K7PZ2M', cap: PRIVATE_CAP, friendly: false, map: 'swiss2', epoch: 0 });
  room.tag.random = () => sc.pick;
  let tokens = 0;
  const newToken = () => (tokens += 1).toString(16).padStart(32, '0');
  const clients = sc.air.map((_, i) => ({
    i, conn: { i }, seat: 0, crowns: new Map(), last: null, hits: [], sent: [],
  }));
  /* The last view the room sent: what every client must end up with. */
  let sentView = null;
  const deliver = (actions, now) => {
    for (const a of actions) {
      if (!a.send || typeof a.data !== 'string') {
        continue;
      }
      if (a.data.startsWith('{"type":"tag","tag"')) {
        sentView = JSON.parse(a.data).tag;
      }
      const c = clients[a.send.i];
      const at = down[c.i](now);
      const data = a.data;
      q.push(at, () => {
        const m = JSON.parse(data);
        if (m.type === 'welcome') {
          c.seat = m.seat;
        } else if (m.type === 'hit') {
          c.hits.push(m.id);
        } else if (m.type === 'tag' && m.tag && m.tag.id != null) {
          c.last = m.tag;
          for (const cr of m.tag.crowns) {
            c.crowns.set(`${cr.t}:${cr.seat}`, cr);
          }
        }
      });
    }
  };
  for (const c of clients) {
    deliver(room.open(c.conn, 0), 0);
    deliver(room.message(c.conn, JSON.stringify({
      type: 'hello', proto: PROTO, build: 'harness', name: [c.i, 2, 40 + c.i], profile: { airframe: sc.air[c.i], map: 'swiss2', figure: 0, livery: null, parts: null },
    }), 0, `10.9.0.${c.i + 1}`, newToken), 0);
  }
  while (q.h.length) {
    q.pop().fn();
  }
  /* The host's start reaches the room at START_AT on every run: its
   * latency only moves the go, which every seat is told, and runs are
   * compared on one go. */
  q.push(START_AT, () => deliver(room.message(clients[0].conn, JSON.stringify({ type: 'tag', op: 'start', goal: GOAL }), START_AT, '10.9.0.1'), START_AT));
  /* Every client's samples, each put on its up link in send order. */
  const sends = [];
  for (const c of clients) {
    const ev = sc.events[c.i];
    for (let k = 0; ; k += 1) {
      const send = Math.round(phase[c.i] + k * SAMPLE_MS);
      if (send > sc.end) {
        break;
      }
      if (ev.pause && send >= ev.pause[0] && send < ev.pause[1]) {
        continue;
      }
      sends.push({ c, send });
    }
  }
  sends.sort((x, y) => x.send - y.send || x.c.i - y.c.i);
  for (const { c, send } of sends) {
    const truth = sc.paths[c.i](send);
    const flags = flagsAt(sc.events[c.i], send);
    const stamp = send + skew[c.i];
    const bytes = encodePose({
      ...truth, flags, seq: 1, t: stamp, wx: 0, wy: 0, wz: 0, c0: 0, c1: 0, c2: 0, c3: 0, motor: 0, flaps: 0,
    });
    const at = up[c.i](send);
    /* The stamp as the wire carries it, a whole millisecond. */
    c.sent.push({ t: decodePose(bytes).t, at, flags });
    q.push(at, () => deliver(room.message(c.conn, bytes, at), at));
  }
  for (let t = SAMPLE_MS; t < sc.end + 1000; t += SAMPLE_MS) {
    q.push(t, () => deliver(room.tick(t), t));
  }
  while (q.h.length) {
    q.pop().fn();
  }
  /* A collision in a match is a mid air crash (docs/TAG-PLAN.md decision
   * 1): the referee's hits between the go and the end, and whether every
   * client got exactly those. The scripted clients fly on through a hit,
   * so this counts contacts, not wrecks. */
  const m = room.tag.match;
  const inMatch = (tc) => m && tc >= m.goAt && (m.endAt == null || tc <= m.endAt);
  const refereed = room.referee.log.map((h) => h.id);
  const hits = room.referee.log.filter((h) => inMatch(h.tc)).length;
  const hitsMissed = clients.filter((c) => c.hits.join() !== refereed.join()).length;
  return {
    clients, room, skew, log: room.tag.log.map((c) => ({ ...c })), view: room.tag.view(room), sentView, hits, hitsMissed,
  };
}

/* The crown timeline and the scores, as the checks compare them. */
const timeline = (log) => log.map((c) => `${c.t}:${c.seat}:${c.why}`).join(',');
const scoresKey = (view) => (view.scores || []).map((r) => `${r.seat}=${r.ms}`).join(',');

/* Whether every sample reached the room inside LATE_MS by the room's own
 * reckoning, less a tick, the late cut's grain. */
function allOnTime(res) {
  return res.clients.every((c) => c.sent.every((s) => s.at - s.t < LATE_MS - SAMPLE_MS));
}

/*
 * The scores recounted from the script: the crown timeline the room
 * decided, and on it, for every room ms from the go to the last one
 * judged, whether the Ace's two bracketing samples (as sent, by their
 * stamps) were GAP_MS or less apart and neither crashed nor spawning.
 */
function recount(res, sc) {
  const crowns = res.log;
  const stamps = res.clients.map((c) => c.sent.map((s) => ({ t: s.t, ok: (s.flags & (FLAG_CRASHED | FLAG_SPAWNING)) === 0 })));
  const ms = {};
  const until = res.view.state === 'results' ? res.view.endAt : res.view.f;
  let k = 0;
  const idx = sc.air.map(() => 0);
  let reachedAt = null;
  for (let t = GO + 1; t <= until; t += 1) {
    while (k + 1 < crowns.length && crowns[k + 1].t < t) {
      k += 1;
    }
    const seat = crowns[k].seat;
    const i = seat - 1;
    const s = stamps[i];
    let j = idx[i];
    while (j + 1 < s.length && s[j + 1].t < t) {
      j += 1;
    }
    idx[i] = j;
    const covered = j + 1 < s.length && s[j].t <= t && s[j + 1].t >= t && s[j + 1].t - s[j].t <= GAP_MS;
    if (covered && s[j].ok && s[j + 1].ok) {
      ms[seat] = (ms[seat] || 0) + 1;
      if (ms[seat] === GOAL * POINT_MS && reachedAt == null) {
        reachedAt = t;
      }
    }
  }
  return { ms, reachedAt };
}

/* The truth reach at t: how far the hunter's nearest part is from the
 * Ace's centre, on the scripted paths themselves on the millisecond. */
function truthReach(sc, ace, hunter, t) {
  const a = sc.paths[ace - 1](t);
  return reachOf(sc.air[hunter - 1], sc.paths[hunter - 1](t), a.px, a.py, a.pz);
}

/* One scenario over RUNS random latency assignments and a zero latency
 * reference, for one clock mode. */
function sweep(sc, clock) {
  const r = {
    name: sc.name, kind: sc.kind, reach: sc.reach ?? null, runs: 0, disagree: 0, notRef: 0, lateRuns: 0, falseTags: 0, misses: 0,
    owner: 0, protect: 0, badScores: 0, badEnd: 0, notOver: 0, hits: 0, hitsMissed: 0, tags: 0, tagRuns: 0, onTimeRuns: 0, delays: [], reaches: [], stationBack: [],
    examples: [],
  };
  const seeds = sc.kind === 'furball' ? [Number(sc.name.split(' ')[1])] : [1, 2, 3];
  for (const seed of seeds) {
    const ref = runOne({ sc, seed, clock, links: sc.air.map(() => ({ base: 0, jitter: 0 })) });
    const refKey = `${timeline(ref.log)}|${scoresKey(ref.view)}`;
    const pick = rng(seed * 9973 + clock);
    for (let k = 0; k < RUNS; k += 1) {
      const links = sc.air.map(() => ({ base: BASES[Math.floor(pick() * BASES.length)], jitter: JITTERS[Math.floor(pick() * JITTERS.length)] }));
      const res = runOne({ sc, seed, clock, links });
      r.runs += 1;
      const room = `${timeline(res.log)}|${scoresKey(res.view)}`;
      const note = (what) => {
        if (r.examples.length < 3) {
          r.examples.push(`${what}, seed ${seed}, links ${links.map((l) => `${l.base}/${l.jitter}`).join(' ')}`);
        }
      };
      /* 1. every client has the room's timeline and scores. */
      for (const c of res.clients) {
        const got = [...c.crowns.values()].sort((x, y) => x.t - y.t);
        if (timeline(got) !== timeline(res.log) || !c.last || JSON.stringify(c.last) !== JSON.stringify(res.sentView)) {
          r.disagree += 1;
          note(`client ${c.i + 1} disagrees`);
          break;
        }
      }
      const onTime = allOnTime(res);
      r.onTimeRuns += onTime ? 1 : 0;
      r.lateRuns += onTime ? 0 : 1;
      /* 2. inside LATE_MS, lag decides nothing. */
      if (onTime && room !== refKey) {
        r.notRef += 1;
        note(`not the reference: ${room.slice(0, 120)} vs ${refKey.slice(0, 120)}`);
      }
      r.hits += res.hits;
      r.hitsMissed += res.hitsMissed;
      const tags = res.log.filter((c) => c.why === 'tag');
      r.tags += tags.length;
      r.tagRuns += tags.length ? 1 : 0;
      /* 3. no false tag: the truth reach at every tag. */
      for (const c of tags) {
        const g = truthReach(sc, c.from, c.seat, c.t);
        r.reaches.push(g);
        if (g > BUBBLE_M + INTERP_M) {
          r.falseTags += 1;
          note(`false tag at ${c.t}: truth reach ${g.toFixed(3)} m`);
        }
        r.delays.push(c.decided - c.t);
      }
      /* 4. a pass deep inside BUBBLE_M is a tag, when the run is on time;
       * the owner's 6.5 m never is and 5.5 m always is. */
      if (sc.kind === 'pass' && onTime && sc.reach <= BUBBLE_M - DEEP_M && !tags.length) {
        r.misses += 1;
        note(`miss at ${sc.reach} m`);
      }
      if (sc.kind === 'pass' && ((sc.reach === 6.5 && tags.length) || (sc.reach === 5.5 && onTime && !tags.length))) {
        r.owner += 1;
        note(`${tags.length ? 'a tag' : 'no tag'} at ${sc.reach} m`);
      }
      /* 5. protection. */
      for (let i = 1; i < res.log.length; i += 1) {
        if (res.log[i].why === 'tag' && res.log[i].t - res.log[i - 1].t <= PROTECT_MS) {
          r.protect += 1;
          note(`tag ${res.log[i].t - res.log[i - 1].t} ms after the last crown`);
        }
      }
      if (sc.kind === 'station') {
        const [t1, t2] = tags;
        r.stationBack.push(t1 && t2 ? t2.t - t1.t : null);
        if (!t1 || !t2 || t2.t - t1.t !== PROTECT_MS + 1 || t2.seat !== t1.from) {
          r.protect += 1;
          note(`station keeper's tag back ${t1 && t2 ? t2.t - t1.t : 'missing'}`);
        }
      }
      /* 6. the scores add up, on every run the room saw whole (a late
       * sample was judged without, which the recount cannot know). */
      const re = recount(res, sc);
      const mismatch = (res.view.scores || []).filter((row) => row.ms !== (re.ms[row.seat] || 0));
      if (onTime && mismatch.length) {
        r.badScores += 1;
        note(`scores ${scoresKey(res.view)} recounted ${JSON.stringify(re.ms)}`);
      }
      /* 7. the end at exactly the goal. */
      if (sc.kind === 'furball') {
        const v = res.view;
        if (v.state !== 'results') {
          r.notOver += 1;
          note(`not over by ${sc.end} (f ${v.f})`);
        } else {
          const win = v.scores.find((row) => row.seat === v.winner);
          if (!win || win.ms !== GOAL * POINT_MS || v.scores.some((row) => row.seat !== v.winner && row.ms >= GOAL * POINT_MS) || (onTime && re.reachedAt !== v.endAt)) {
            r.badEnd += 1;
            note(`end ${v.endAt} winner ${v.winner} ${win && win.ms}, recount reached at ${re.reachedAt}`);
          }
        }
      }
    }
  }
  return r;
}

/* ------------------------------------------------------------ report */

const pct = (xs, p) => {
  if (!xs.length) {
    return NaN;
  }
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

function report(clock, results) {
  let failed = 0;
  const row = (name, ok, detail) => {
    console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}  (${detail})`);
    failed += ok ? 0 : 1;
  };
  const sum = (f, list = results) => list.reduce((n, r) => n + r[f], 0);
  const all = (f) => results.flatMap((r) => r[f]);
  const furballs = results.filter((r) => r.kind === 'furball');
  const passes = results.filter((r) => r.kind === 'pass');
  console.log(`\nrun ${clock + 1}, ${clock ? 'clocks off by up to 10 ms either way' : 'exact clocks'}: ${sum('runs')} runs, ${sum('onTimeRuns')} of them inside LATE_MS`);
  console.log(`    furballs: ${furballs.length} seeds x ${RUNS} runs, ${sum('tags', furballs)} tags in ${sum('tagRuns', furballs)} runs, mid air hits sent during the matches: ${sum('hits', furballs)}`);
  const band = passes.map((r) => `${r.reach.toFixed(1)}:${Math.round((100 * r.tagRuns) / Math.max(1, r.runs))}%`).join(' ');
  console.log(`    head on pass, truth reach from the Ace's centre in m: percent of runs judged a tag (BUBBLE_M ${BUBBLE_M} m)\n      ${band}`);
  const station = results.find((r) => r.kind === 'station');
  if (station) {
    console.log(`    station keeping: the tag back came ${[...new Set(station.stationBack)].join(', ')} ms after the tag (PROTECT_MS ${PROTECT_MS})`);
  }
  for (const r of results) {
    for (const e of r.examples) {
      console.log(`      ${r.name}: ${e}`);
    }
  }
  const runs = sum('runs');
  row('every client has the room\'s crown timeline and scores', sum('disagree') === 0, `${sum('disagree')} of ${runs} disagree`);
  row('the timeline and scores are the zero latency run\'s, every run inside LATE_MS', sum('notRef') === 0, `${sum('notRef')} differ`);
  row('a collision in a match is a mid air crash: the furballs collide, and every client gets every hit the referee sends',
    sum('hits', furballs) > 0 && sum('hitsMissed') === 0, `${sum('hits', furballs)} hits in the furballs, ${sum('hitsMissed')} client lists short or different`);
  row('tag back protection honoured', sum('protect') === 0, `${sum('protect')} early tags`);
  row('the scores add up to the recount from the script', sum('badScores') === 0, `${sum('badScores')} of ${runs} runs off`);
  row(`every furball ends at exactly ${GOAL} points, the first to get there`, sum('badEnd') === 0 && sum('notOver') === 0,
    `${sum('badEnd')} wrong ends, ${sum('notOver')} not over`);
  const reaches = all('reaches').filter(Number.isFinite);
  const accuracy = (name, ok, detail) => (clock ? console.log(`  band  ${name}  (${detail})`) : row(name, ok, detail));
  accuracy(`no false tag: the truth reach at every tag is within BUBBLE_M plus ${INTERP_M * 100} cm`, sum('falseTags') === 0,
    `${sum('falseTags')} false of ${reaches.length}; truth reach at the tag max ${pct(reaches, 1).toFixed(3)} m, p95 ${pct(reaches, 0.95).toFixed(3)} m`);
  accuracy(`no miss: a pass ${DEEP_M * 100} cm or more inside BUBBLE_M is a tag`, sum('misses') === 0, `${sum('misses')} misses`);
  row('a pass 6.5 m from the Ace\'s centre is never a tag, and one at 5.5 m always is', sum('owner') === 0,
    `${sum('owner')} wrong; 6.5 m tagged in ${passes.find((x) => x.reach === 6.5).tagRuns} of ${passes.find((x) => x.reach === 6.5).runs}, 5.5 m in ${passes.find((x) => x.reach === 5.5).tagRuns} of ${passes.find((x) => x.reach === 5.5).runs}`);
  const d = all('delays');
  console.log(`  info  decision delay, tag decided less the tag: median ${pct(d, 0.5).toFixed(0)} ms, p95 ${pct(d, 0.95).toFixed(0)} ms, max ${pct(d, 1).toFixed(0)} ms over ${d.length} tags (LATE_MS ${LATE_MS})`);
  row('no tag is decided later than LATE_MS and a tick after it happened', !(pct(d, 1) > LATE_MS + SAMPLE_MS), `max ${pct(d, 1).toFixed(0)} ms`);
  return failed;
}

/* ------------------------------------------------------------- driver */

/* --one="furball 12" --links=200/60,25/10,25/60,50/30 [--seed=12]: one
 * run again, as a failure's example names it, with its timeline. */
if (isMainThread && arg('one', null)) {
  const sc = scenarios().find((x) => x.name === arg('one', ''));
  const seed = Number(arg('seed', sc.kind === 'furball' ? sc.name.split(' ')[1] : 1));
  const links = arg('links', '').split(',').map((l) => l.split('/').map(Number)).map(([base, jitter]) => ({ base, jitter }));
  const clock = Number(arg('run', 1)) - 1;
  for (const [what, l] of [['zero latency', sc.air.map(() => ({ base: 0, jitter: 0 }))], ['these links', links]]) {
    const res = runOne({ sc, seed, clock, links: l });
    console.log(`${what}: on time ${allOnTime(res)}\n  ${timeline(res.log)}\n  ${scoresKey(res.view)}`);
    for (const c of res.clients) {
      const late = c.sent.filter((s) => s.at - s.t >= LATE_MS - SAMPLE_MS).length;
      console.log(`  seat ${c.i + 1}: ${c.sent.length} sent, worst ${Math.max(...c.sent.map((s) => s.at - s.t)).toFixed(0)} ms, ${late} late`);
    }
  }
  process.exit(0);
}

if (!isMainThread) {
  const { names, clock } = workerData;
  const list = scenarios().filter((s) => names.includes(s.name));
  parentPort.postMessage(list.map((sc) => sweep(sc, clock)));
} else {
  const clocks = arg('run', 'both') === 'both' ? [0, 1] : [Number(arg('run', 1)) - 1];
  const jobs = Math.max(1, Number(arg('jobs', Math.max(1, Math.floor(availableParallelism() / 2)))));
  const names = scenarios().map((s) => s.name);
  const started = Date.now();
  console.log(`tag harness: ${names.length} scenarios, ${RUNS} random link sets each (bases ${BASES.join('/')} ms, jitter ${JITTERS.join('/')} ms), ${SEEDS} furball seeds, goal ${GOAL}, ${jobs} jobs`);
  let failed = 0;
  for (const clock of clocks) {
    const chunks = Array.from({ length: jobs }, (_, k) => names.filter((_, i) => i % jobs === k)).filter((c) => c.length);
    const parts = await Promise.all(chunks.map((chunk) => new Promise((resolve, reject) => {
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: { names: chunk, clock }, argv: process.argv.slice(2) });
      w.once('message', resolve);
      w.once('error', reject);
    })));
    const byName = new Map(parts.flat().map((r) => [r.name, r]));
    failed += report(clock, names.map((n) => byName.get(n)));
  }
  console.log(`\n${failed ? `${failed} FAILED` : 'all passed'} in ${Math.round((Date.now() - started) / 1000)} s`);
  process.exit(failed ? 1 : 0);
}
