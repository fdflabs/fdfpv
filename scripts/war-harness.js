/*
 * war-harness.js: the war mode's kamikaze referee under lag, measured, and
 * what a war room costs (docs/WARFARE-PLAN.md sections 4.3 and 4.4).
 * npm run war:harness.
 *
 * It drives the real room (edge/rooms/core.js with edge/rooms/war.js) in
 * Node the way scripts/tag-harness.js drives a tag match: clients whose
 * true paths are scripted on the whole millisecond, each sampling its own
 * at 30 Hz on a phase of its own and stamping the room clock, over FIFO
 * links (a base, a uniform jitter, and a 200 ms stall on a quarter of the
 * up links), the room's messages coming back over each client's down
 * link. The attackers' truth is src/share/war/routes.js on the
 * millisecond, the function every screen draws.
 *
 *   pass    a Strike flying level along +x and one defender head on, its
 *           nearest part passing a truth reach of 5.0 to 7.0 m from the
 *           Strike's centre in 10 cm steps: does it go off?
 *   swarm   four defenders (planes and quads) on random smooth paths
 *           through one ball about 36 m across, and waves of FPV swarms
 *           weaving through it from four sides: many detonations, blasts
 *           that take a swarm's neighbours, and each defender breaking
 *           and coming back REACT_MS after its own blast, as a client
 *           does on hearing its boom
 *   brief   the head on pass behind a briefing (the intro, section 7.1):
 *           the host starts with { intro: true }, the room holds INTRO_MS
 *           before its countdown, and the pass must go off as it does
 *           without one, INTRO_MS later, every client seeing the same
 *           briefing, countdown and go
 *   cost    eight pilots and sixty attackers at once: fifty two parked
 *           around the pilots just outside BLAST_M, none going off, and eight
 *           hunters steered by the room from far out. The room's CPU per
 *           second of play, against the plan's 60 ms.
 *
 * Every pass and swarm run is held to:
 *   1. every client has the room's booms and deaths
 *   2. the booms and deaths are the zero latency run's, for every run whose
 *      samples all reached the room inside LATE_MS
 *   3. no false detonation: at every boom the defender's true hull is
 *      within BLAST_M (plus 5 cm, the 30 Hz interpolation) of the
 *      attacker's true centre
 *   4. no miss: a pass whose truth reach is 15 cm or more inside BLAST_M
 *      goes off on every run inside LATE_MS
 *   5. no boom is decided later than LATE_MS and a tick after it happened
 * Run 1 has exact clocks; run 2 puts each client's clock off by up to 10 ms
 * either way and reports the bands of 3 and 4 rather than holding them.
 *
 *   node scripts/war-harness.js [--seeds=6] [--runs=16] [--run=1|2|cost]
 *
 * --run=cost measures the cost alone.
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
  FLAG_AIRBORNE, FLAG_CRASHED, FLAG_SPAWNING, PROTO, decodePose, encodePose,
} from '../src/share/roomwire.js';
import { PRIVATE_CAP, RoomCore } from '../edge/rooms/core.js';
import { COUNTDOWN_MS } from '../edge/rooms/race.js';
import { MISSIONS } from '../edge/rooms/war.js';
import { LATE_MS, hullDistance, hullFor } from '../src/game/midair.js';
import {
  BLAST_M, KIND, planAgent, poseAt,
} from '../src/share/war/routes.js';
import { INTRO_MS } from '../src/share/war/intro.js';

const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const SEEDS = Number(arg('seeds', 6));
const RUNS = Number(arg('runs', 16));
const BASES = [0, 25, 50, 100, 200, 300];
const JITTERS = [0, 10, 30, 60];
const SAMPLE_MS = 1000 / 30;
const STALL_MS = 200;
const STALL_P = 0.25;
const GO = COUNTDOWN_MS; /* the host starts at room ms 0 */
const Y = 300;
const DEEP_M = 0.15;
const INTERP_M = 0.05;
const BALL = 3;
/* A defender's client breaks its craft this long after its blast, on
 * the blast's own clock: later than any run's boom reaches it (checked),
 * so the samples it sends do not hang on its link. */
const REACT_MS = 1500;
const CRASH_MS = 800;
const SPAWN_FLAG_MS = 1500;
/* The plan's bound for a war room's referee (section 4.4). */
const CPU_MS_PER_S = 60;

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

/* A random smooth path through the ball round (cx, Y, cz): two sines on
 * each axis. */
function wander(rand, scale = BALL, cx = 0, cz = 0) {
  const terms = [0, 1, 2].map((k) => [0, 1].map(() => ({
    a: scale * ((k === 1 ? 1 : 2.5) + rand() * (k === 1 ? 1.5 : 2.5)),
    w: (0.6 + rand() * 0.8) / scale,
    p: rand() * 2 * Math.PI,
  })));
  return (t) => {
    const s = t / 1000;
    const pos = [cx, Y, cz];
    const vel = [0, 0, 0];
    for (let k = 0; k < 3; k += 1) {
      for (const { a, w, p } of terms[k]) {
        pos[k] += a * Math.sin(w * s + p);
        vel[k] += a * w * Math.cos(w * s + p);
      }
    }
    return {
      px: pos[0], py: pos[1], pz: pos[2], vx: vel[0], vy: vel[1], vz: vel[2], ...headingQ(vel[0], vel[2]),
    };
  };
}

/* Level at Y along x at speed v, z to the side. */
function level(z, v, x0) {
  return (t) => ({
    px: x0 + v * t / 1000, py: Y, pz: z, vx: v, vy: 0, vz: 0, ...headingQ(v, 0),
  });
}

function hover(p) {
  return () => ({
    px: p[0], py: p[1], pz: p[2], vx: 0, vy: 0, vz: 0, qx: 0, qy: 0, qz: 0, qw: 1,
  });
}

/* How far a pose's nearest part box is from (x, y, z): the referee's own
 * measure (src/game/midair.js hullDistance). */
function reachOf(airframe, pose, x, y, z) {
  return hullDistance(hullFor(airframe), pose, x, y, z);
}

/* The side offset, level at Y heading along x at v, that puts the
 * airframe's nearest part `reach` from a point beside it, by bisection. */
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

/* A FIFO link: each message's arrival from its send time, called in send
 * order; a stall holds everything from stallAt for STALL_MS. */
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

function mission(id, waves, routes) {
  return {
    id, map: 'itaipu', targets: {}, output: 1000, floorMw: 0, rack: 1000, waves, routes,
  };
}

/* Head on: the Strike along +x through the origin, 300 m after its birth
 * at GO + 1 s, the defender along -x with its nearest part passing `reach` from it. `lead`
 * is a briefing before the countdown (INTRO_MS, or 0 for none). */
function pass(reach, lead = 0) {
  const air = ['cub1400'];
  const off = offsetFor(air[0], -20, reach);
  const meet = GO + lead + 1000 + (300 / KIND.strike.speed) * 1000;
  const m = mission('pass', [{ at: 1, kind: 'strike', n: 1, route: 'line' }], { line: [[-300, Y, 0], [300, Y, 0]] });
  const sc = {
    name: `${lead ? 'briefed ' : ''}pass ${reach.toFixed(2)} m`, kind: 'pass', reach, air, mission: m, paths: [level(off, -20, 20 * meet / 1000)], end: meet + 1500, lead,
  };
  /* The truth: the closest the scripted pair comes, on the millisecond. */
  const plan = planAgent(m, {
    id: 1, kind: 'strike', route: 'line', t0: GO + lead + 1000, k: 0, n: 1, err: 0, target: null,
  });
  let best = Infinity;
  for (let t = meet - 500; t <= meet + 500; t += 1) {
    const a = poseAt(plan, t).p;
    best = Math.min(best, reachOf(air[0], sc.paths[0](t), a[0], a[1], a[2]));
  }
  sc.truthMin = best;
  return sc;
}

/* Waves of six FPVs through the ball from four sides, every 2.5 s. */
function swarm(seed) {
  const rand = rng(seed * 31 + 7);
  const air = ['cub1400', '5inch', 'p51d1450', 'bombshell1118'];
  const L = 700;
  const routes = {
    e: [[-L, Y, 0], [L, Y, 0]], w: [[L, Y + 2, 0], [-L, Y + 2, 0]], n: [[0, Y - 2, L], [0, Y - 2, -L]], s: [[3, Y, -L], [3, Y, L]],
  };
  const names = Object.keys(routes);
  const waves = [];
  for (let i = 0; i < 12; i += 1) {
    waves.push({
      at: 1 + i * 2.5 + Math.floor(rand() * 10) / 10, kind: i % 3 === 2 ? 'strike' : 'fpv', n: i % 3 === 2 ? 2 : 6, route: names[Math.floor(rand() * 4)],
    });
  }
  waves.sort((a, b) => a.at - b.at);
  return {
    name: `swarm ${seed}`, kind: 'swarm', air, mission: mission('swarm', waves, routes), paths: air.map(() => wander(rand)), end: GO + 36000,
  };
}

/* The flags a defender's client stamps at t, given the blasts it has
 * heard of (their room ms). */
function flagsAt(blasts, t) {
  for (const tc of blasts) {
    const r = t - (tc + REACT_MS);
    if (r >= 0 && r < CRASH_MS) {
      return FLAG_CRASHED;
    }
    if (r >= CRASH_MS && r < CRASH_MS + SPAWN_FLAG_MS) {
      return FLAG_AIRBORNE | FLAG_SPAWNING;
    }
  }
  return FLAG_AIRBORNE;
}

/* ---------------------------------------------------------------- run */

/* One run. cfg: { sc, seed, links ([{ base, jitter }] per seat), clock }. */
function runOne(cfg) {
  const { sc } = cfg;
  const rand = rng(cfg.seed * 7919 + 17);
  const phase = sc.air.map(() => rand() * SAMPLE_MS);
  const skew = sc.air.map(() => (cfg.clock ? (rand() - 0.5) * 20 : 0));
  const stalls = sc.air.map((_, i) => (rand() < STALL_P ? GO + rand() * 20000 + cfg.links[i].base : null));
  const linkRand = rng(cfg.seed * 104729 + 1);
  const up = sc.air.map((_, i) => link(cfg.links[i].base, cfg.links[i].jitter, stalls[i], linkRand));
  const down = sc.air.map((_, i) => link(cfg.links[i].base, cfg.links[i].jitter, null, linkRand));
  const q = new Queue();
  const room = new RoomCore({
    code: 'W4RH00', cap: PRIVATE_CAP, friendly: false, map: 'itaipu', epoch: 0,
  });
  room.war.missions = { ...MISSIONS, [sc.mission.id]: sc.mission };
  room.war.random = () => 0.5;
  let tokens = 0;
  const newToken = () => (tokens += 1).toString(16).padStart(32, '0');
  const clients = sc.air.map((_, i) => ({
    i, conn: { i }, seat: 0, events: [], blasts: [], late: 0, sent: [], born: new Map(), states: [], early: 0,
  }));
  const deliver = (actions, now) => {
    for (const a of actions) {
      if (!a.send || typeof a.data !== 'string') {
        continue;
      }
      const c = clients[a.send.i];
      const at = down[c.i](now);
      const data = a.data;
      q.push(at, () => {
        const m = JSON.parse(data);
        if (m.type === 'welcome') {
          c.seat = m.seat;
        } else if (m.type === 'war' && m.war) {
          const st = `${m.war.state}:${m.war.goAt}`;
          if (c.states.at(-1) !== st) {
            c.states.push(st);
          }
        } else if (m.type === 'war' && m.op === 'born') {
          for (const a of m.agents) {
            c.born.set(a.id, a);
            c.early += a.t0 < GO + (sc.lead || 0) ? 1 : 0;
          }
        } else if (m.type === 'war' && (m.op === 'boom' || m.op === 'dead')) {
          c.events.push(m.op === 'boom' ? `boom:${m.seat}:${m.at}` : `dead:${m.ids.join('+')}:${m.at}:${m.by}`);
          if (m.op === 'boom' && m.seat === c.seat) {
            c.blasts.push(m.at);
            c.late = Math.max(c.late, at - m.at);
          }
        }
      });
    }
  };
  for (const c of clients) {
    deliver(room.open(c.conn, 0), 0);
    deliver(room.message(c.conn, JSON.stringify({
      type: 'hello', proto: PROTO, build: 'harness', name: [c.i, 2, 40 + c.i], profile: { airframe: sc.air[c.i], map: 'itaipu', figure: 0, livery: null, parts: null },
    }), 0, `10.9.0.${c.i + 1}`, newToken), 0);
  }
  while (q.h.length) {
    q.pop().fn();
  }
  deliver(room.message(clients[0].conn, JSON.stringify({
    type: 'war', op: 'start', mission: sc.mission.id, ...(sc.lead ? { intro: true } : {}),
  }), 0, '10.9.0.1'), 0);
  /* Samples are made as the clock passes them, since a client's flags
   * hang on the booms it has heard. */
  for (const c of clients) {
    for (let k = 0; ; k += 1) {
      const send = Math.round(phase[c.i] + k * SAMPLE_MS);
      if (send > sc.end) {
        break;
      }
      q.push(send, () => {
        const truth = sc.paths[c.i](send);
        const flags = flagsAt(c.blasts, send);
        const bytes = encodePose({
          ...truth, flags, seq: 1, t: send + skew[c.i], wx: 0, wy: 0, wz: 0, c0: 0, c1: 0, c2: 0, c3: 0, motor: 0, flaps: 0,
        });
        const at = up[c.i](send);
        c.sent.push({ t: decodePose(bytes).t, at });
        q.push(at, () => deliver(room.message(c.conn, bytes, at), at));
      });
    }
  }
  for (let t = SAMPLE_MS; t < sc.end + 1000; t += SAMPLE_MS) {
    q.push(t, () => deliver(room.tick(t), t));
  }
  while (q.h.length) {
    q.pop().fn();
  }
  const events = [];
  for (const e of room.war.log) {
    if (e.what === 'boom') {
      events.push(`boom:${e.seat}:${e.t}`, `dead:${e.ids.join('+')}:${e.t}:${e.seat}`);
    }
  }
  return { clients, room, log: room.war.log.map((e) => ({ ...e })), events };
}

const key = (res) => res.log.map((e) => `${e.what}:${e.seat ?? ''}:${e.t}:${(e.ids || [e.id]).join('+')}`).join(',');

function allOnTime(res) {
  return res.clients.every((c) => c.sent.every((s) => s.at - s.t < LATE_MS - SAMPLE_MS));
}

/* The truth reach at a boom: the defender's true hull from the attacker's
 * true centre, both on the scripted paths on the millisecond. */
function truthReach(sc, res, e) {
  const birth = res.clients[0].born.get(e.id);
  const a = poseAt(planAgent(sc.mission, birth), e.t).p;
  return reachOf(sc.air[e.seat - 1], sc.paths[e.seat - 1](e.t), a[0], a[1], a[2]);
}

function sweep(sc, clock) {
  const r = {
    name: sc.name, kind: sc.kind, reach: sc.truthMin ?? null, runs: 0, onTime: 0, disagree: 0, notRef: 0, falseBooms: 0, misses: 0,
    booms: 0, boomRuns: 0, delays: [], reaches: [], examples: [], slowBoom: 0,
  };
  const seeds = sc.kind === 'swarm' ? [Number(sc.name.split(' ')[1])] : [1, 2, 3];
  for (const seed of seeds) {
    const ref = runOne({ sc, seed, clock, links: sc.air.map(() => ({ base: 0, jitter: 0 })) });
    const pick = rng(seed * 9973 + clock);
    for (let k = 0; k < RUNS; k += 1) {
      const links = sc.air.map(() => ({ base: BASES[Math.floor(pick() * BASES.length)], jitter: JITTERS[Math.floor(pick() * JITTERS.length)] }));
      const res = runOne({ sc, seed, clock, links });
      r.runs += 1;
      const note = (what) => {
        if (r.examples.length < 3) {
          r.examples.push(`${what}, seed ${seed}, links ${links.map((l) => `${l.base}/${l.jitter}`).join(' ')}`);
        }
      };
      const room = res.events.join(',');
      for (const c of res.clients) {
        if (c.events.join(',') !== room) {
          r.disagree += 1;
          note(`client ${c.i + 1} disagrees`);
          break;
        }
        if (c.late >= REACT_MS) {
          r.slowBoom += 1;
          note(`client ${c.i + 1} heard its boom ${c.late} ms after it`);
        }
      }
      const onTime = allOnTime(res);
      r.onTime += onTime ? 1 : 0;
      if (onTime && key(res) !== key(ref)) {
        r.notRef += 1;
        note(`not the reference: ${key(res).slice(0, 160)} vs ${key(ref).slice(0, 160)}`);
      }
      const booms = res.log.filter((e) => e.what === 'boom');
      r.booms += booms.length;
      r.boomRuns += booms.length ? 1 : 0;
      for (const e of booms) {
        const g = truthReach(sc, res, e);
        r.reaches.push(g);
        if (g > BLAST_M + INTERP_M) {
          r.falseBooms += 1;
          note(`false boom at ${e.t}: truth reach ${g.toFixed(3)} m`);
        }
        r.delays.push(e.decided - e.t);
      }
      if (sc.kind === 'pass' && onTime && sc.truthMin <= BLAST_M - DEEP_M && !booms.length) {
        r.misses += 1;
        note(`miss at ${sc.truthMin.toFixed(3)} m`);
      }
    }
  }
  return r;
}

/* ----------------------------------------------------------- the cost */

/*
 * Eight pilots, sixty attackers: fifty two jammers parked and eight hunters
 * born 1.4 km out (too far to arrive in the thirty seconds measured). Two
 * layouts of the Cubs and the parked jammers:
 *
 *   crowd  the eight Cubs holding still on a circle 4 m across the middle,
 *          the jammers on a shell 11.5 m round it: every one of the 416
 *          pairs is near enough to pass the room's cheap test and be
 *          judged by within() on every millisecond, none within reach
 *   shell  a Cub every 120 m, and over and under each, six or seven
 *          jammers 6.45 to 6.6 m from its centre: outside BLAST_M of any
 *          part, inside BLAST_M plus the hull's reach, where within()
 *          would measure the hull (hullDistance) on every millisecond,
 *          held for thirty seconds by all 52: what the room's hull
 *          broadphase (edge/rooms/war.js clearOf) is there to make cheap
 *
 * The CPU the room spends in its own calls (poses and ticks), per second
 * of play from the go.
 */
function cost(layout) {
  const seats = 8;
  const air = Array.from({ length: seats }, () => 'cub1400');
  const crowd = layout === 'crowd';
  const at = air.map((_, i) => (crowd ? [2 * Math.cos(i * Math.PI / 4), Y, 2 * Math.sin(i * Math.PI / 4)] : [i * 120 - 420, Y, 0]));
  const routes = {};
  const waves = [];
  for (let n = 0; n < 52; n += 1) {
    let p;
    if (crowd) {
      /* A Fibonacci sphere: evenly round the middle. */
      const yv = 1 - (2 * (n + 0.5)) / 52;
      const rr = Math.sqrt(1 - yv * yv);
      const ang = n * 2.399963;
      p = [11.5 * rr * Math.cos(ang), Y + 11.5 * yv, 11.5 * rr * Math.sin(ang)];
    } else {
      const i = n % seats;
      const k = Math.floor(n / seats);
      const ang = (k * 2 * Math.PI) / 7 + i;
      const up = k % 2 ? -1 : 1;
      p = [at[i][0] + 0.3 * Math.cos(ang), Y + up * (6.45 + 0.02 * k), at[i][2] + 0.3 * Math.sin(ang)];
    }
    routes[`j${n}`] = [[p[0] - 0.5, p[1], p[2]], p];
    waves.push({ at: 0.5, kind: 'jammer', n: 1, route: `j${n}` });
  }
  routes.far = [[0, Y + 200, -1400]];
  waves.push({ at: 1, kind: 'hunter', n: 8, route: 'far' });
  const m = mission('cost', waves, routes);
  const room = new RoomCore({
    code: 'W4RC00', cap: PRIVATE_CAP, friendly: false, map: 'itaipu', epoch: 0,
  });
  room.war.missions = { ...MISSIONS, cost: m };
  let tokens = 0;
  const conns = air.map((_, i) => ({ i }));
  for (const c of conns) {
    room.open(c, 0);
    room.message(c, JSON.stringify({
      type: 'hello', proto: PROTO, build: 'harness', name: [c.i, 2, 40 + c.i], profile: { airframe: air[c.i], map: 'itaipu', figure: 0, livery: null, parts: null },
    }), 0, `10.9.1.${c.i + 1}`, () => (tokens += 1).toString(16).padStart(32, '0'));
  }
  room.message(conns[0], JSON.stringify({ type: 'war', op: 'start', mission: 'cost' }), 0, '10.9.1.1');
  const from = GO + 2000;
  const to = from + 30000;
  let pairsNear = 0;
  let aliveSum = 0;
  let ticks = 0;
  const q = new Queue();
  for (const c of conns) {
    const phaseMs = (c.i * 4.1) % SAMPLE_MS;
    for (let t = phaseMs; t <= to; t += SAMPLE_MS) {
      const send = Math.round(t);
      q.push(send, () => {
        const bytes = encodePose({
          ...hover(at[c.i])(), flags: FLAG_AIRBORNE, seq: 1, t: send, wx: 0, wy: 0, wz: 0, c0: 0, c1: 0, c2: 0, c3: 0, motor: 0, flaps: 0,
        });
        room.message(c, bytes, send + 40);
      });
    }
  }
  for (let t = SAMPLE_MS; t <= to; t += SAMPLE_MS) {
    q.push(t + 40, () => {
      room.tick(t + 40);
      if (t >= from) {
        ticks += 1;
        aliveSum += room.war.match.agents.length;
        pairsNear = Math.max(pairsNear, room.war.match.agents.length * seats);
      }
    });
  }
  while (q.h.length && q.h[0].t < from) {
    q.pop().fn();
  }
  /* The whole thread's CPU from here: the room's calls, and the clients'
   * encoding and the queue, which are a few per cent of it (profiled), so
   * the number is the room's with a little to spare. */
  const c0 = process.cpuUsage();
  while (q.h.length) {
    q.pop().fn();
  }
  const c1 = process.cpuUsage(c0);
  const cpu = (c1.user + c1.system) / 1000;
  const booms = room.war.log.filter((e) => e.what === 'boom').length;
  return {
    msPerS: cpu / ((to - from) / 1000), alive: aliveSum / Math.max(1, ticks), pairs: pairsNear, booms, state: room.war.match.state,
  };
}

/* ------------------------------------------------------------ report */

const pct = (xs, p) => {
  if (!xs.length) {
    return NaN;
  }
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

function scenarios() {
  const out = [];
  for (let dm = 50; dm <= 70; dm += 1) {
    out.push(pass(dm / 10));
  }
  for (let s = 1; s <= SEEDS; s += 1) {
    out.push(swarm(s));
  }
  return out;
}

function report(clock, results) {
  let failed = 0;
  const row = (name, ok, detail) => {
    console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}  (${detail})`);
    failed += ok ? 0 : 1;
  };
  const sum = (f, list = results) => list.reduce((n, r) => n + r[f], 0);
  const all = (f) => results.flatMap((r) => r[f]);
  const passes = results.filter((r) => r.kind === 'pass');
  const swarms = results.filter((r) => r.kind === 'swarm');
  console.log(`\nrun ${clock + 1}, ${clock ? 'clocks off by up to 10 ms either way' : 'exact clocks'}: ${sum('runs')} runs, ${sum('onTime')} of them inside LATE_MS`);
  console.log(`    swarms: ${swarms.length} seeds x ${RUNS} runs, ${sum('booms', swarms)} detonations in ${sum('boomRuns', swarms)} runs`);
  const band = passes.map((r) => `${r.reach.toFixed(2)}:${Math.round((100 * r.boomRuns) / Math.max(1, r.runs))}%`).join(' ');
  console.log(`    head on pass, closest truth reach from the Strike's centre in m: percent of runs that went off (BLAST_M ${BLAST_M} m)\n      ${band}`);
  for (const r of results) {
    for (const e of r.examples) {
      console.log(`      ${r.name}: ${e}`);
    }
  }
  const runs = sum('runs');
  row('every client has the room\'s booms and deaths', sum('disagree') === 0, `${sum('disagree')} of ${runs} disagree`);
  row('the booms and deaths are the zero latency run\'s, every run inside LATE_MS', sum('notRef') === 0, `${sum('notRef')} differ`);
  row(`every defender heard its own boom inside REACT_MS (${REACT_MS} ms), so its wreck is the blast's`, sum('slowBoom') === 0, `${sum('slowBoom')} late`);
  row('the swarms go off: detonations happen', sum('booms', swarms) > 0, `${sum('booms', swarms)}`);
  const reaches = all('reaches');
  const accuracy = (name, ok, detail) => (clock ? console.log(`  band  ${name}  (${detail})`) : row(name, ok, detail));
  accuracy(`no false detonation: the truth reach at every boom is within BLAST_M plus ${INTERP_M * 100} cm`, sum('falseBooms') === 0,
    `${sum('falseBooms')} false of ${reaches.length}; truth reach at the boom max ${pct(reaches, 1).toFixed(3)} m, p95 ${pct(reaches, 0.95).toFixed(3)} m`);
  accuracy(`no miss: a pass ${DEEP_M * 100} cm or more inside BLAST_M goes off`, sum('misses') === 0, `${sum('misses')} misses`);
  const d = all('delays');
  console.log(`  info  decision delay, boom decided less the boom: median ${pct(d, 0.5).toFixed(0)} ms, p95 ${pct(d, 0.95).toFixed(0)} ms, max ${pct(d, 1).toFixed(0)} ms over ${d.length} booms (LATE_MS ${LATE_MS})`);
  row('no boom is decided later than LATE_MS and a tick after it happened', !(pct(d, 1) > LATE_MS + SAMPLE_MS), `max ${pct(d, 1).toFixed(0)} ms`);
  return failed;
}

/*
 * The briefing: passes inside and outside BLAST_M behind INTRO_MS of it,
 * over the same random link sets, against the same passes with none.
 */
function briefing() {
  let failed = 0;
  const row = (name, ok, detail) => {
    console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}  (${detail})`);
    failed += ok ? 0 : 1;
  };
  const go = GO + INTRO_MS;
  const reaches = [5.5, 6.5];
  const briefed = reaches.map((r) => sweep(pass(r, INTRO_MS), 0));
  let shifted = 0;
  let states = 0;
  let early = 0;
  let clients = 0;
  const want = [`briefing:${go}`, `countdown:${go}`, `live:${go}`];
  for (const r of reaches) {
    for (const seed of [1, 2, 3]) {
      const zero = (sc) => runOne({ sc, seed, clock: 0, links: sc.air.map(() => ({ base: 0, jitter: 0 })) });
      const plain = zero(pass(r)).log.map((e) => `${e.what}:${e.seat}:${e.t + INTRO_MS}`).join(',');
      const withIt = zero(pass(r, INTRO_MS));
      shifted += withIt.log.map((e) => `${e.what}:${e.seat}:${e.t}`).join(',') === plain ? 0 : 1;
      for (const c of withIt.clients) {
        clients += 1;
        states += c.states.slice(0, 3).join() === want.join() ? 0 : 1;
        early += c.early;
      }
    }
  }
  const sum = (f) => briefed.reduce((n, x) => n + x[f], 0);
  console.log(`\nthe briefing: INTRO_MS ${INTRO_MS} ms before the countdown, head on passes at ${reaches.join(' and ')} m, ${sum('runs')} runs`);
  row('every client has the room\'s booms and deaths', sum('disagree') === 0, `${sum('disagree')} of ${sum('runs')} disagree`);
  row('the booms and deaths are the zero latency run\'s, every run inside LATE_MS', sum('notRef') === 0, `${sum('notRef')} differ`);
  row('the pass inside BLAST_M goes off and the one outside does not', briefed[0].boomRuns === briefed[0].runs && briefed[1].booms === 0,
    `${briefed[0].boomRuns} of ${briefed[0].runs}, ${briefed[1].booms} booms`);
  row('behind a briefing, the zero latency run is the one without, INTRO_MS later', shifted === 0, `${shifted} of ${reaches.length * 3} differ`);
  row('every client sees briefing, countdown and live, to one go', states === 0 && clients > 0, `${states} of ${clients} otherwise`);
  row('nothing is born for the go before it', early === 0, `${early} early births`);
  return failed;
}

const clocks = arg('run', 'both') === 'both' ? [0, 1] : arg('run', '') === 'cost' ? [] : [Number(arg('run', 1)) - 1];
const started = Date.now();
const list = scenarios();
console.log(`war harness: ${list.length} scenarios, ${RUNS} random link sets each (bases ${BASES.join('/')} ms, jitter ${JITTERS.join('/')} ms), ${SEEDS} swarm seeds`);
let failed = 0;
for (const clock of clocks) {
  failed += report(clock, list.map((sc) => sweep(sc, clock)));
}
if (arg('run', 'both') !== 'cost') {
  failed += briefing();
}
console.log('\nthe cost of a war room: 8 pilots, 60 attackers, 30 s of play');
for (const layout of ['crowd', 'shell']) {
  const c = cost(layout);
  const ok = c.msPerS < CPU_MS_PER_S && c.alive >= 59 && c.booms === 0;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${layout}: the room's CPU for 8 pilots and 60 attackers is under ${CPU_MS_PER_S} ms a second  (${c.msPerS.toFixed(1)} ms a second; ${c.alive.toFixed(1)} alive, ${c.pairs} pairs, ${c.booms} detonations)`);
  failed += ok ? 0 : 1;
}
console.log(`\n${failed ? `${failed} FAILED` : 'all passed'} in ${Math.round((Date.now() - started) / 1000)} s`);
process.exit(failed ? 1 : 0);
