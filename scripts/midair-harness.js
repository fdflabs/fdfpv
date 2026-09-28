/*
 * midair-harness.js: the mid air referee's fairness, measured
 * (docs/MULTIPLAYER-PLAN.md section 6.6). npm run midair:harness.
 *
 * It drives the real room (edge/rooms/core.js, with its referee) in Node
 * with two clients whose true trajectories are scripted on the whole
 * millisecond: each samples its own at 30 Hz, on a phase of its own, the
 * way src/main.js roomSendPose does, stamps each POSE with its estimate of
 * the room clock, and sends it over a simulated link. A link is FIFO (a
 * TCP stream cannot reorder), its delay a base plus a uniform jitter, and
 * a 200 ms stall (head of line blocking) lands on a quarter of the links
 * at a random moment. The room's batches and hits come back over each
 * client's own down link. Scenarios: head on, crossing at 90 degrees,
 * overtaking from behind, crossing a 6 g turn (the path the interpolation
 * is furthest off), a wingtip graze head on at depths from -20 to +20 cm in
 * 1 cm steps, a crossing graze from -40 to +40 cm in 2 cm steps (the one
 * a clock error moves), formation at 1 m, one client stalled mid pass, one
 * client reconnecting mid pass. Grid: base latency 0, 25, 50, 100, 200 and
 * 300 ms, independently per client, jitter 0, 10, 30 and 60 ms, SEEDS
 * seeds each, and each run again with the two links swapped.
 *
 * Twice. Run 1, exact clocks: every client knows the room clock. Run 2,
 * synced clocks: each client's clock is off by half its link's asymmetry,
 * 0 to 20 ms (section 7), which is what clock sync leaves.
 *
 * What each run is held to, as the plan's table:
 *   1. both seats got the same set of hits
 *   2. the hit set is the zero latency run's, for every run whose samples
 *      all reached the room inside LATE_MS by its own clock
 *   3. swapping the two clients' links changes nothing
 *   4. lag above LATE_MS never crashes anyone: no hit is decided later
 *      than LATE_MS (and a tick, the late cut's grain) after its contact
 *   5. a truth clearance of any size is never judged a hit
 *   6. a truth overlap of 15 cm or more is never judged a miss (the graze
 *      depth; the head on, crossing and overtaking passes are all deeper)
 *   7. decision delay over max(LA, LB), p95, under 60 ms
 *   8. the peer each pilot drew at the moment of contact, near peers on
 *      50 ms links, within a median of 1 m of where the referee had it
 * Rows 5 to 8 are exact on run 1; on run 2 they are reported as a band,
 * the graze depth at which false hits start and misses stop, which is the
 * rule's real resolution against the clock.
 *
 *   node scripts/midair-harness.js [--seeds=20] [--jobs=N] [--run=1|2] [--only=name]
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

import { FLAG_AIRBORNE, PROTO, decodeBatch, encodePose } from '../src/share/roomwire.js';
import { RoomCore, PRIVATE_CAP } from '../edge/rooms/core.js';
import { PeerTrack } from '../src/game/peer.js';
import { LATE_MS, MARGIN_M, Track, hullFor, judge, poseAt } from '../src/game/midair.js';

const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const SEEDS = Number(arg('seeds', 20));
const BASES = [0, 25, 50, 100, 200, 300];
const JITTERS = [0, 10, 30, 60];
const T0 = 1500; /* the true moment of the pass, ms */
const END = 3200; /* how long each run flies */
const SAMPLE_MS = 1000 / 30;
const STALL_MS = 200;
const STALL_P = 0.25;
const DEEP_M = 0.15;

/* ---------------------------------------------------------- scenarios */

/* A level flight along a heading, through `at` at T0: a pose at t. The
 * Three.js body's forward is -z, so a heading d is a yaw about y of the
 * angle taking (0, 0, -1) to d. Harness only: trigonometry is fine here. */
function flight(at, dir, speed) {
  const n = Math.hypot(dir[0], dir[2]);
  const dx = dir[0] / n;
  const dz = dir[2] / n;
  const psi = Math.atan2(-dx, -dz);
  const q = { qx: 0, qy: Math.sin(psi / 2), qz: 0, qw: Math.cos(psi / 2) };
  return (t) => {
    const s = (t - T0) / 1000;
    return {
      px: at[0] + dx * speed * s, py: at[1], pz: at[2] + dz * speed * s,
      ...q, vx: dx * speed, vy: 0, vz: dz * speed, flags: FLAG_AIRBORNE,
    };
  };
}

/* A level turn at `speed` and `g` through `at` at T0, heading +x there,
 * banked into it: the path the interpolation is furthest off. */
function turn(at, speed, g) {
  const r = (speed * speed) / (g * 9.81);
  const w = speed / r;
  const bank = Math.atan(g);
  return (t) => {
    const s = (t - T0) / 1000;
    const th = w * s;
    const dir = [Math.cos(th), 0, -Math.sin(th)];
    const psi = Math.atan2(-dir[0], -dir[2]);
    const cy = Math.cos(psi / 2);
    const sy = Math.sin(psi / 2);
    const cr = Math.cos(bank / 2);
    const sr = Math.sin(bank / 2);
    /* yaw about y, then roll about the body's own z */
    return {
      px: at[0] + r * Math.sin(th), py: at[1], pz: at[2] - r + r * Math.cos(th),
      qx: sy * sr, qy: sy * cr, qz: cy * sr, qw: cy * cr,
      vx: dir[0] * speed, vy: 0, vz: dir[2] * speed, flags: FLAG_AIRBORNE,
    };
  };
}

const Y = 100;
const CUB_TIP = 0.7;
function scenarios() {
  const out = [
    { name: 'head on', a: 'cub1400', b: 'p51d1450', A: flight([0, Y, 0], [1, 0, 0], 20), B: flight([0, Y, 0], [-1, 0, 0], 25), deep: true },
    { name: 'crossing 90', a: '5inch', b: 'sky1800', A: flight([0, Y, 0], [1, 0, 0], 25), B: flight([0, Y, 0], [0, 0, 1], 18), deep: true },
    { name: 'overtaking', a: '5inch', b: '5inch', A: flight([0, Y, 0], [1, 0, 0], 35), B: flight([0, Y, 0], [1, 0, 0], 20), deep: true },
    { name: 'turning crossing', a: '5inch', b: 'cub1400', A: turn([0, Y, 0], 30, 6), B: flight([0, Y, 0], [0, 0, 1], 20), deep: true },
    { name: 'formation 1 m', a: 'cub1400', b: 'cub1400', A: flight([0, Y, 0], [1, 0, 0], 20), B: flight([0, Y, 2 * CUB_TIP + 1], [1, 0, 0], 20), clear: true },
    { name: 'stalled mid pass', a: 'cub1400', b: 'p51d1450', A: flight([0, Y, 0], [1, 0, 0], 20), B: flight([0, Y, 0], [-1, 0, 0], 25), stallA: T0 - 60 },
    { name: 'reconnect mid pass', a: 'cub1400', b: 'p51d1450', A: flight([0, Y, 0], [1, 0, 0], 20), B: flight([0, Y, 0], [-1, 0, 0], 25), dropA: [T0 - 500, T0 + 900] },
  ];
  for (let cm = -20; cm <= 20; cm += 1) {
    const d = cm / 100;
    /* Wingtip into wingtip, opposite ways, the tips overlapping by d
     * across the span. */
    out.push({
      name: `graze ${cm} cm`, a: 'cub1400', b: 'cub1400', graze: d, series: 'head on',
      A: flight([0, Y, 0], [1, 0, 0], 20), B: flight([0, Y, 2 * CUB_TIP - d], [-1, 0, 0], 20),
    });
  }
  /* A crossing graze: B's wing sweeps across A's path just ahead of its
   * nose. Unlike the head on graze, a clock error moves the answer here,
   * since each seat's error slides it along its own path (section 6.6,
   * promise 4). d is how far B's track is moved back from the one where
   * the truth first touches, along A's path: over 0 they overlap. */
  const cross = (x) => ({ a: 'cub1400', b: 'cub1400', A: flight([0, Y, 0], [1, 0, 0], 20), B: flight([x, Y, 0], [0, 0, 1], 20) });
  let lo = 0;
  let hi = 4;
  while (hi - lo > 1e-4) {
    const mid = (lo + hi) / 2;
    if (truthOf(cross(mid)).touch) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  for (let cm = -40; cm <= 40; cm += 2) {
    const d = cm / 100;
    out.push({ name: `crossing graze ${cm} cm`, graze: d, series: 'crossing', ...cross(lo - d) });
  }
  return out;
}

/* ------------------------------------------------------------- truth */

/* The truth: the scripted poses themselves on every millisecond, the same
 * boxes, no margin. Whether they ever overlap, and how deep at most. */
function truthOf(sc) {
  const hA = hullFor(sc.a);
  const hB = hullFor(sc.b);
  const tA = new Track(Infinity);
  const tB = new Track(Infinity);
  for (let t = 0; t <= END; t += 1) {
    tA.push({ t, ...sc.A(t) });
    tB.push({ t, ...sc.B(t) });
  }
  const c = judge(hA, hB, tA, tB, 0, END, 0);
  return { touch: Boolean(c), tc: c ? c.tc : null };
}

/* ------------------------------------------------------------- links */

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

/* A FIFO link: each message's arrival, from its send time, called in
 * send order. A stall delivers nothing from stallAt for STALL_MS; what
 * would have arrived in it arrives as it ends, in order. */
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

/* Events by time, then by insertion. */
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

/* ---------------------------------------------------------------- run */

const PROFILE = (airframe) => ({ airframe, map: 'swiss2', figure: 0, livery: null, parts: null });

/*
 * One run: two clients, the room, the links. cfg: { sc, seed, la, lb
 * (each { base, jitter }), clock (0 exact, 1 synced), swap }.
 * Returns what the checks need.
 */
function runOne(cfg) {
  const { sc, seed } = cfg;
  const rand = rng(seed * 7919 + 17);
  /* What is the seed's and not the link's: the sampling phases, the
   * clock errors, where the random stalls fall. Drawn first, the same for
   * a run and its swap. */
  const phase = [rand() * SAMPLE_MS, rand() * SAMPLE_MS];
  const skew = cfg.clock ? [(rand() - 0.5) * 20, (rand() - 0.5) * 20] : [0, 0];
  const lk = cfg.swap ? [cfg.lb, cfg.la] : [cfg.la, cfg.lb];
  /* A stall is placed on the samples' arrival, so it lands on the pass
   * whatever the base latency. */
  const stalls = [0, 1].map((i) => (rand() < STALL_P ? T0 - 400 + rand() * 800 + lk[i].base : null));
  if (sc.stallA != null) {
    stalls[0] = sc.stallA + lk[0].base;
  }
  const linkRand = rng(seed * 104729 + (cfg.swap ? 3 : 1));
  const up = [0, 1].map((i) => link(lk[i].base, lk[i].jitter, stalls[i], linkRand));
  const down = [0, 1].map((i) => link(lk[i].base, lk[i].jitter, null, linkRand));

  const q = new Queue();
  const room = new RoomCore({ code: 'K7PZ2M', cap: PRIVATE_CAP, friendly: Boolean(cfg.friendly), map: 'swiss2', epoch: 0 });
  let tokens = 0;
  const newToken = () => (tokens += 1).toString(16).padStart(32, '0');
  const clients = [0, 1].map((i) => ({
    i, seat: 0, token: null, hits: [], batches: [], sent: [], conn: { i, epoch: 0 },
  }));
  const deliver = (actions, now) => {
    for (const a of actions) {
      if (!a.send) {
        continue;
      }
      const c = clients[a.send.i];
      if (a.send !== c.conn) {
        continue;
      }
      const at = down[c.i](now);
      const data = a.data;
      q.push(at, () => {
        if (typeof data !== 'string') {
          /* Decoded only where a check reads it. */
          c.batches.push({ at, data });
          return;
        }
        const m = JSON.parse(data);
        if (m.type === 'welcome') {
          c.seat = m.seat;
          c.token = m.token;
        } else if (m.type === 'hit') {
          c.hits.push({ ...m, at });
        }
      });
    }
  };
  const helloMsg = (c, airframe) => JSON.stringify({
    type: 'hello', proto: PROTO, build: 'harness', name: [1, 2, 42], profile: PROFILE(airframe), ...(c.token ? { token: c.token } : {}),
  });
  const air = [sc.a, sc.b];
  for (const c of clients) {
    deliver(room.open(c.conn, 0), 0);
    deliver(room.message(c.conn, helloMsg(c, air[c.i]), 0, `10.0.0.${c.i + 1}`, newToken), 0);
  }
  /* The welcome reaches each client before any pose is sent. */
  while (q.h.length) {
    q.pop().fn();
  }
  const truths = [sc.A, sc.B];
  for (const c of clients) {
    let seq = 0;
    for (let k = 0; ; k += 1) {
      const send = Math.round(phase[c.i] + k * SAMPLE_MS);
      if (send > END) {
        break;
      }
      const drop = c.i === 0 && sc.dropA && send >= sc.dropA[0] && send < sc.dropA[1];
      if (drop) {
        continue;
      }
      const truth = truths[c.i](send);
      seq += 1;
      const bytes = encodePose({ ...truth, seq, t: send + skew[c.i], c0: 0, c1: 0, c2: 0, c3: 0, motor: 0, flaps: 0 });
      const at = up[c.i](send);
      c.sent.push({ t: send, at });
      q.push(at, () => deliver(room.message(c.conn, bytes, at), at));
    }
  }
  if (sc.dropA) {
    /* The socket drops as the gap starts and a new one takes the seat
     * back with the token as it ends. */
    const c = clients[0];
    const gone = sc.dropA[0] + lk[0].base;
    q.push(gone, () => {
      deliver(room.close(c.conn, gone), gone);
    });
    const back = sc.dropA[1] + lk[0].base - 5;
    q.push(back, () => {
      c.conn = { i: 0 };
      deliver(room.open(c.conn, back), back);
      deliver(room.message(c.conn, helloMsg(c, air[0]), back, '10.0.0.1', newToken), back);
    });
  }
  for (let t = SAMPLE_MS; t < END + 1000; t += SAMPLE_MS) {
    q.push(t, () => deliver(room.tick(t), t));
  }
  while (q.h.length) {
    q.pop().fn();
  }
  return { clients, log: room.referee.log, skew };
}

/* The hit set as the checks compare it: the contacts' times. */
const key = (hits) => hits.map((h) => `${h.tc}`).join(',');

/* Whether every sample within 400 ms of the pass reached the room inside
 * LATE_MS by the room's own reckoning (its clock less the sample's
 * stamp), less a tick, which is how late the late cut can fall. */
function allOnTime(res) {
  return res.clients.every((c) => c.sent.filter((s) => Math.abs(s.t - T0) < 400)
    .every((s) => s.at - (s.t + res.skew[c.i]) < LATE_MS - SAMPLE_MS));
}

/* One scenario over the whole grid, for one clock mode. */
function sweep(sc, clock) {
  const truth = truthOf(sc);
  const r = {
    name: sc.name, graze: sc.graze ?? null, series: sc.series ?? null, truth, runs: 0, disagree: 0, notRef: 0, swapChanged: 0,
    falseHits: 0, deepMisses: 0, lateHits: 0, hitRuns: 0, missRuns: 0, delays: [], drawn: [], latency: [], examples: [],
  };
  for (let seed = 1; seed <= SEEDS; seed += 1) {
    const ref = runOne({ sc, seed, clock, la: { base: 0, jitter: 0 }, lb: { base: 0, jitter: 0 } });
    const refKey = key(ref.clients[0].hits);
    for (const ba of BASES) {
      for (const bb of BASES) {
        for (const j of JITTERS) {
          const cfg = { sc, seed, clock, la: { base: ba, jitter: j }, lb: { base: bb, jitter: j } };
          const res = runOne(cfg);
          const swapped = runOne({ ...cfg, swap: true });
          r.runs += 1;
          const [ca, cb] = res.clients;
          const kA = key(ca.hits);
          const kB = key(cb.hits);
          if (kA !== kB) {
            r.disagree += 1;
            if (r.examples.length < 3) {
              r.examples.push(`disagree seed ${seed} ${ba}/${bb}/${j}: ${kA} vs ${kB}`);
            }
          }
          const onTime = allOnTime(res) && !sc.dropA;
          if (onTime && kA !== refKey) {
            r.notRef += 1;
            if (r.examples.length < 3) {
              r.examples.push(`not the reference seed ${seed} ${ba}/${bb}/${j}: ${kA} vs ${refKey}`);
            }
          }
          if (key(swapped.clients[0].hits) !== kA && allOnTime(swapped) === onTime && onTime) {
            r.swapChanged += 1;
          }
          const hit = ca.hits.length > 0;
          if (hit) {
            r.hitRuns += 1;
          } else {
            r.missRuns += 1;
          }
          /* Promise 3: a contact is judged only while both streams cover
           * it inside LATE_MS, so no hit is ever decided later than that
           * (and one tick, the cut's grain) after its contact. */
          if (res.log.some((h) => h.decided - h.tc > LATE_MS + SAMPLE_MS)) {
            r.lateHits += 1;
          }
          if (hit && !truth.touch) {
            r.falseHits += 1;
          }
          const deep = sc.deep || (sc.graze != null && sc.graze >= DEEP_M);
          if (!hit && deep && onTime) {
            r.deepMisses += 1;
            if (r.examples.length < 3) {
              r.examples.push(`deep miss seed ${seed} ${ba}/${bb}/${j} skew ${res.skew.map((x) => x.toFixed(1))}`);
            }
          }
          if (!hit || !onTime) {
            continue;
          }
          const h = ca.hits[0];
          const decided = res.log[0].decided;
          const lat = [0, 1].map((i) => {
            const s = res.clients[i].sent.find((x) => x.t >= h.tc);
            return s ? s.at - s.t : 0;
          });
          r.delays.push(decided - h.tc - Math.max(lat[0], lat[1]));
          if (ba === 50 && bb === 50) {
            r.latency.push(ca.hits[0].at - h.tc, cb.hits[0].at - h.tc);
            /* What each drew of the other at the moment of contact, on its
             * own clock, from what had reached it by then. */
            for (const c of res.clients) {
              const arrivals = c.batches.flatMap(({ at, data }) => decodeBatch(data).poses.map((pose) => ({ at, pose })));
              const trueNow = h.tc - res.skew[c.i];
              const pt = new PeerTrack();
              for (const { at, pose } of arrivals) {
                if (at <= trueNow) {
                  pt.push(pose, at + res.skew[c.i]);
                }
              }
              const drawn = {};
              if (!pt.sample(h.tc, 1, drawn)) {
                continue;
              }
              const ref2 = new Track();
              for (const { pose } of arrivals) {
                ref2.push(pose);
              }
              const at = poseAt(ref2, h.tc);
              if (at) {
                r.drawn.push(Math.hypot(drawn.px - at.px, drawn.py - at.py, drawn.pz - at.pz));
              }
            }
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
    if (!ok) {
      failed += 1;
    }
  };
  const sum = (f) => results.reduce((n, r) => n + r[f], 0);
  const runs = sum('runs');
  const all = (f) => results.flatMap((r) => r[f]);
  console.log(`\nrun ${clock + 1}, ${clock ? 'synced clocks, 0 to 20 ms asymmetry' : 'exact clocks'}: ${runs} runs over ${results.length} scenarios`);
  for (const r of results) {
    if (r.graze == null) {
      console.log(`    ${r.name.padEnd(20)} truth ${r.truth.touch ? `touch at ${r.truth.tc} ms` : 'clear'}, judged a hit in ${r.hitRuns} of ${r.runs}`);
    }
    for (const e of r.examples) {
      console.log(`      ${e}`);
    }
  }
  for (const series of ['head on', 'crossing']) {
    const grazes = results.filter((r) => r.series === series);
    const band = grazes.map((r) => `${Math.round(r.graze * 100)}:${Math.round((100 * r.hitRuns) / r.runs)}%`).join(' ');
    console.log(`    ${series} graze, depth cm: percent of runs judged a hit\n      ${band}`);
    const falseStart = grazes.find((r) => r.hitRuns > 0);
    const missStop = [...grazes].reverse().find((r) => r.missRuns > 0);
    console.log(`    band: hits start at ${falseStart ? Math.round(falseStart.graze * 100) : 'none'} cm, misses stop past ${missStop ? Math.round(missStop.graze * 100) : 'none'} cm (margin ${MARGIN_M * 100} cm)`);
  }
  row('both seats got the same set of hits', sum('disagree') === 0, `${sum('disagree')} of ${runs} disagree`);
  row('the hit set is the zero latency run\'s, every run inside LATE_MS', sum('notRef') === 0, `${sum('notRef')} differ`);
  row('swapping A and B\'s links changes the hit set: never', sum('swapChanged') === 0, `${sum('swapChanged')} changed`);
  row('lag above LATE_MS never crashes anyone', sum('lateHits') === 0, `${sum('lateHits')} hits decided over LATE_MS after the contact`);
  const accuracy = (name, ok, detail) => (clock ? console.log(`  band  ${name}  (${detail})`) : row(name, ok, detail));
  accuracy('a truth clearance of any size judged a hit', sum('falseHits') === 0, `${sum('falseHits')} false hits`);
  accuracy(`a truth overlap of ${DEEP_M * 100} cm or more judged a miss`, sum('deepMisses') === 0, `${sum('deepMisses')} misses`);
  const d95 = pct(all('delays'), 0.95);
  accuracy('decision delay over max(LA, LB), p95, under 60 ms', d95 < 60, `${d95.toFixed(1)} ms over ${all('delays').length} hits`);
  const dm = pct(all('drawn'), 0.5);
  const turning = (results.find((r) => r.name === 'turning crossing') || { drawn: [] }).drawn;
  accuracy('near peer drawn at the contact, 50 ms links, median under 1 m', dm < 1,
    `median ${dm.toFixed(2)} m, p95 ${pct(all('drawn'), 0.95).toFixed(2)} m over ${all('drawn').length}; in the 6 g turn median ${pct(turning, 0.5).toFixed(2)} m, worst ${pct(turning, 1).toFixed(2)} m`);
  const lat = all('latency');
  console.log(`  info  hit latency, contact to each screen, 50 ms links: median ${pct(lat, 0.5).toFixed(0)} ms, p95 ${pct(lat, 0.95).toFixed(0)} ms`);
  return failed;
}

/* ------------------------------------------------------------- driver */

if (!isMainThread) {
  const { names, clock } = workerData;
  const list = scenarios().filter((s) => names.includes(s.name));
  parentPort.postMessage(list.map((sc) => sweep(sc, clock)));
} else {
  const clocks = arg('run', 'both') === 'both' ? [0, 1] : [Number(arg('run', 1)) - 1];
  const jobs = Math.max(1, Number(arg('jobs', Math.max(1, Math.floor(availableParallelism() / 2)))));
  const only = arg('only', null);
  const names = scenarios().map((s) => s.name).filter((n) => !only || n === only);
  const started = Date.now();
  console.log(`midair harness: ${names.length} scenarios, ${BASES.length}x${BASES.length} base latencies, ${JITTERS.length} jitters, ${SEEDS} seeds, ${jobs} jobs`);
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
  console.log(`\n${failed ? `${failed} FAILED` : 'all passed'} in ${((Date.now() - started) / 1000).toFixed(0)} s`);
  process.exit(failed ? 1 : 0);
}
