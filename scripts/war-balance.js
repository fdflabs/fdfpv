/*
 * war-balance.js: mission 1 flown by bot squads on the real room, for
 * tuning its numbers (docs/WARFARE-PLAN.md sections 3 and 4.5;
 * src/share/war/missions/itaipu-1.js).
 *
 * It drives edge/rooms/core.js with edge/rooms/war.js in Node, as
 * scripts/war-harness.js does, on zero latency links: every bot sends a
 * POSE and the room ticks every TICK_MS, so the referee, the hunters, the
 * rounds, the airframes, the output and the end are the room's own. What
 * is made up is the pilots:
 *
 *   flight    a point at SPEED m/s turning at most TURN_RATE, held over
 *             the hunters' floor (itaipu-height.bin), with a 5 inch
 *             quad's hull for the referee
 *   the pick  "fly at the nearest threat to the dam": the attacker alive
 *             nearest the dam's middle, a Hunter within HUNTED_M of the
 *             bot first; each bot takes one no other bot has taken while
 *             there is one, and a good pilot skips one it cannot reach
 *             before it arrives or whose target is already down
 *   the pass  a good pilot leads it (the attacker's future pose, which
 *             the radar shows), a careless one chases where it is now;
 *             each pass is off by a random 3D error of AIM_M (per skill),
 *             drawn again after each miss, so passes miss as they do
 *   losses    a crash takes the airframe at CRASH_PER_MIN (per skill);
 *             after a blast or a crash the pilot is back at the spawn
 *             (--spawn) DOWN_MS later (the room marks it spawning for 5 s),
 *             unless it has spent every airframe of the round: then it
 *             sits grounded until the next round
 *
 * Skills: good (lead, AIM_M 3, a crash every 10 minutes, 4 s down),
 * average (lead, AIM_M 5, a crash every 3.3 minutes, 6 s down) and
 * careless (no lead, AIM_M 6, a crash every 1.5 minutes, 8 s down, and
 * it chases what it cannot catch and what is going for a burning target).
 *
 *   node scripts/war-balance.js [--runs=12] [--pilots=1,2,4,8] [--skill=good,average,careless] [--jobs=N] [--spawn=x,z]
 *   BAL_DEBUG=good,8,10 node scripts/war-balance.js    one game (skill,
 *                                        pilots, seed), the hunters and
 *                                        bots every 10 s, and its result
 *
 * Prints, per squad size and skill: the mission's win rate and length,
 * the output at the end, how the rounds ended (win, damaged, lost), each
 * round's length, the airframes earned a round, the share of a live
 * round a pilot sat grounded with every airframe spent and its longest
 * such stretch, and how each game ended.
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

import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

import {
  FLAG_AIRBORNE, FLAG_CRASHED, PROTO, encodePose,
} from '../src/share/roomwire.js';
import { PRIVATE_CAP, RoomCore } from '../edge/rooms/core.js';
import { RESULT_MS } from '../edge/rooms/war.js';
import { COUNTDOWN_MS } from '../edge/rooms/race.js';
import { loadHeight } from '../edge/rooms/warhunt.js';
import { poseAt } from '../src/share/war/routes.js';
import itaipu1 from '../src/share/war/missions/itaipu-1.js';

const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};

/* Where the bots take off and come back: seat k at the k-th of the crest
 * road's seats (src/maps/itaipu/spawns.js CREST_SPAWN, as laid out in a
 * room: 20 m apart east along the road), or all at --spawn=x,z. */
const CREST_SEATS = [[574.93, -1622.45], [594.68, -1619.16], [613.8, -1612.94], [633.76, -1610.63],
  [652.88, -1604.41], [672.84, -1602.1], [691.96, -1595.88], [711.92, -1593.57]];
function spawnArg() {
  const v = arg('spawn', null);
  return v ? [v.split(',').map(Number)] : CREST_SEATS;
}

const TICK_MS = 1000 / 30;
const GO = COUNTDOWN_MS;
const LIMIT_MS = 15 * 60 * 1000;
const SPEED = 35;
const TURN_RATE = 3;
const HUNTED_M = 400;
const STUCK_MS = 10000;
const BREAK_MS = 3000;
const FLOOR_CLEAR_M = 8;
const AIRFRAME = '5inch';
/* The dam's middle, between intake 9 and 10 on the upstream face. */
const DAM = [120, 200, -1755];
const SKILLS = {
  good: {
    lead: true, aim: 3, crashPerMin: 0.1, downMs: 4000, reach: true,
  },
  average: {
    lead: true, aim: 5, crashPerMin: 0.3, downMs: 6000, reach: true,
  },
  careless: {
    lead: false, aim: 6, crashPerMin: 0.67, downMs: 8000, reach: false,
  },
};

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

function gauss(rand) {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

/* A yaw and pitch attitude with the nose (-z) along v. Balance tool only:
 * trigonometry is fine here. */
function noseQ(v) {
  const h = Math.hypot(v[0], v[2]);
  const psi = Math.atan2(-v[0], -v[2]);
  const th = Math.atan2(v[1], h);
  const cy = Math.cos(psi / 2);
  const sy = Math.sin(psi / 2);
  const cp = Math.cos(th / 2);
  const sp = Math.sin(th / 2);
  return {
    qx: cy * sp, qy: sy * cp, qz: -sy * sp, qw: cy * cp,
  };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (v) => Math.hypot(v[0], v[1], v[2]);

function runOne({
  pilots, skill, seed, floorBuf, spawn,
}) {
  const floor = loadHeight(floorBuf);
  const S = SKILLS[skill];
  const rand = rng(seed * 7919 + pilots * 31 + Object.keys(SKILLS).indexOf(skill));
  const room = new RoomCore({
    code: 'W4RB00', cap: PRIVATE_CAP, friendly: false, map: 'itaipu', epoch: 0,
  });
  const seedDraw = rng(seed * 104729 + 3);
  room.war.random = seedDraw;
  let tokens = 0;
  const newToken = () => (tokens += 1).toString(16).padStart(32, '0');
  const spawnAt = (i) => {
    const [x, z] = spawn[i % spawn.length];
    const off = spawn.length > 1 ? 0 : i * 6;
    return [x + off, floor.floorAt(x, z) + 2, z];
  };
  const bots = Array.from({ length: pilots }, (_, i) => ({
    i, conn: { i }, seat: 0, p: spawnAt(i), v: [0, 0, -1], downUntil: -1, crashed: false, target: null, err: [0, 0, 0], best: Infinity, closedAt: 0, breakUntil: 0, groundedMs: 0, liveMs: 0, stretch: 0, longest: 0,
  }));
  const byConn = new Map(bots.map((b) => [b.conn, b]));
  let now = 0;
  const handle = (actions) => {
    for (const a of actions) {
      if (!a.send || typeof a.data !== 'string') {
        continue;
      }
      const b = byConn.get(a.send);
      const m = JSON.parse(a.data);
      if (m.type === 'welcome') {
        b.seat = m.seat;
      } else if (m.type === 'war' && m.op === 'boom' && m.seat === b.seat) {
        b.downUntil = now + S.downMs;
        b.crashed = true;
        b.target = null;
      }
    }
  };
  for (const b of bots) {
    handle(room.open(b.conn, 0));
    handle(room.message(b.conn, JSON.stringify({
      type: 'hello', proto: PROTO, build: 'balance', name: [b.i, 2, 40 + b.i], profile: {
        airframe: AIRFRAME, map: 'itaipu', figure: 0, livery: null, parts: null,
      },
    }), 0, `10.9.2.${b.i + 1}`, newToken));
  }
  handle(room.message(bots[0].conn, JSON.stringify({ type: 'war', op: 'start', mission: itaipu1.id }), 0, '10.9.2.1'));
  const w = room.war;
  const crashP = (S.crashPerMin / 60) * (TICK_MS / 1000);

  /* Where attacker x will be at room ms t (a hunter: where it is). */
  const at = (x, t) => {
    if (x.a.kind === 'hunter') {
      const h = w.lastPoses.find((q) => q.id === x.a.id);
      return h ? h.p : null;
    }
    const o = poseAt(x.plan, Math.min(t, x.plan.tEnd));
    return o ? o.p : null;
  };
  /* When a bot at p meets x flying SPEED, from now: the first time it can
   * be where x is, or null. */
  const meet = (p, x) => {
    for (let dt = 0; dt <= 120000; dt += 250) {
      const q = at(x, now + dt);
      if (!q) {
        return null;
      }
      if (len(sub(q, p)) <= (SPEED * dt) / 1000 + 5) {
        return { dt, q };
      }
      if (x.a.kind === 'hunter' || now + dt > x.plan.tEnd) {
        return x.a.kind === 'hunter' ? { dt: len(sub(q, p)) / SPEED * 1000, q } : null;
      }
    }
    return null;
  };

  const pick = (b, taken) => {
    const live = [...w.live.values()].filter((x) => x.a.t0 <= now);
    const scored = [];
    for (const x of live) {
      const q = at(x, now);
      if (!q) {
        continue;
      }
      const dMe = len(sub(q, b.p));
      const hunterNear = x.a.kind === 'hunter' && dMe < HUNTED_M;
      scored.push({ x, key: hunterNear ? -1e9 + dMe : len(sub(q, DAM)) });
    }
    scored.sort((u, v) => u.key - v.key);
    let fallback = null;
    for (const s of scored) {
      /* A good pilot lets go what it cannot catch, and what goes for a
       * target already down, which costs nothing more. */
      if (S.reach && s.x.a.kind !== 'hunter' && (!meet(b.p, s.x) || w.match.down.includes(s.x.a.target))) {
        continue;
      }
      fallback ??= s.x;
      if (!taken.has(s.x.a.id)) {
        return s.x;
      }
    }
    return fallback;
  };

  const newErr = () => [gauss(rand), gauss(rand), gauss(rand)].map((g) => (g * S.aim) / Math.sqrt(3));

  while (now < GO + LIMIT_MS) {
    now += TICK_MS;
    const t = Math.round(now);
    const live = w.match && w.match.state === 'live';
    const taken = new Set();
    for (const b of bots) {
      let flags = FLAG_AIRBORNE;
      const roundLive = live && w.match.roundState === 'live';
      const out = live && w.spentOut(b.seat);
      if (b.downUntil > now) {
        flags = FLAG_CRASHED;
      } else if (b.crashed && out) {
        /* Every airframe of the round spent: grounded till the next. */
        flags = FLAG_CRASHED;
        if (roundLive) {
          b.groundedMs += TICK_MS;
          b.stretch += TICK_MS;
          b.longest = Math.max(b.longest, b.stretch);
        }
      } else if (b.crashed) {
        b.stretch = 0;
        b.crashed = false;
        b.p = spawnAt(b.i);
        b.v = [0, 0, -1];
        b.target = null;
      } else if (roundLive && rand() < crashP) {
        b.downUntil = now + S.downMs;
        b.crashed = true;
        flags = FLAG_CRASHED;
      }
      if (roundLive) {
        b.liveMs += TICK_MS;
      }
      if (flags === FLAG_AIRBORNE && live) {
        if (!b.target || !w.live.has(b.target.a.id) || (b.target.a.kind !== 'hunter' && Math.round(now) % 1000 < TICK_MS)) {
          const next = pick(b, taken);
          if (next !== b.target) {
            b.target = next;
            b.err = newErr();
            b.best = Infinity;
            b.closedAt = now;
          }
        }
        let aim = null;
        if (b.target) {
          taken.add(b.target.a.id);
          const x = b.target;
          const cur = at(x, now);
          if (cur) {
            const d = len(sub(cur, b.p));
            aim = S.lead ? (meet(b.p, x) || { q: cur }).q : cur;
            aim = [aim[0] + b.err[0], aim[1] + b.err[1], aim[2] + b.err[2]];
            /* A pass that missed: once past the closest, draw again. A
             * chase that has not closed for STUCK_MS (a Hunter's tail, as
             * fast as the bot) breaks off for BREAK_MS and comes back head
             * on. */
            if (d < b.best - 5) {
              b.best = d;
              b.closedAt = now;
            } else if (b.best < 40 && d > b.best + 20) {
              b.err = newErr();
              b.best = Infinity;
              b.closedAt = now;
            } else if (now - b.closedAt > STUCK_MS) {
              b.breakUntil = now + BREAK_MS;
              b.best = Infinity;
              b.closedAt = now + BREAK_MS;
            }
            if (b.breakUntil > now) {
              aim = [2 * b.p[0] - cur[0], b.p[1], 2 * b.p[2] - cur[2]];
            }
          }
        }
        if (!aim) {
          aim = [DAM[0], DAM[1] + 80, DAM[2] + 300];
        }
        const want = sub(aim, b.p);
        const wl = len(want);
        if (wl > 1e-6) {
          const d = want.map((c) => c / wl);
          const c = Math.max(-1, Math.min(1, d[0] * b.v[0] + d[1] * b.v[1] + d[2] * b.v[2]));
          const ang = Math.acos(c);
          const max = TURN_RATE * (TICK_MS / 1000);
          if (ang <= max) {
            b.v = d;
          } else {
            const f = max / ang;
            const nv = b.v.map((vv, k) => vv + (d[k] - vv) * f);
            const nl = len(nv);
            b.v = nl > 1e-6 ? nv.map((vv) => vv / nl) : d;
          }
        }
        const step = SPEED * (TICK_MS / 1000);
        for (let k = 0; k < 3; k += 1) {
          b.p[k] += b.v[k] * step;
        }
        const low = floor.floorAt(b.p[0], b.p[2]) + FLOOR_CLEAR_M;
        const aimLow = b.target && aim[1] < low;
        if (b.p[1] < low && !aimLow) {
          b.p[1] = low;
        }
      }
      const moving = flags === FLAG_AIRBORNE && live;
      const vel = moving ? b.v.map((c) => c * SPEED) : [0, 0, 0];
      const bytes = encodePose({
        px: b.p[0], py: b.p[1], pz: b.p[2], vx: vel[0], vy: vel[1], vz: vel[2], ...noseQ(b.v), flags, seq: 1, t, wx: 0, wy: 0, wz: 0, c0: 0, c1: 0, c2: 0, c3: 0, motor: 0, flaps: 0,
      });
      handle(room.message(b.conn, bytes, t));
    }
    handle(room.tick(t));
    if (process.env.BAL_DEBUG && Math.round(now) % 10000 < TICK_MS) {
      for (const h of w.lastPoses) {
        console.log(`t ${((now - GO) / 1000).toFixed(0)} hunter ${h.id} at ${h.p.map((v) => v.toFixed(0)).join(',')} target ${h.target}; bots ${bots.map((b) => `${b.seat}:${b.p.map((v) => v.toFixed(0)).join(',')}${b.downUntil > now ? 'D' : ''}`).join(' ')}`);
      }
    }
    if (w.match && (w.match.state === 'won' || w.match.state === 'lost')) {
      break;
    }
  }
  const m = w.match;
  const kills = w.log.filter((e) => e.what === 'boom').reduce((s, e) => s + e.ids.length, 0);
  /* Each round's result and length: round k starts at the go, or
   * RESULT_MS after round k - 1 ended. */
  const rounds = [];
  let from = m.goAt;
  for (const e of w.log.filter((x) => x.what === 'round')) {
    rounds.push({
      result: e.result, secs: (e.t - from) / 1000, mw: e.mw, earned: e.earned,
    });
    from = e.t + RESULT_MS;
  }
  return {
    rounds,
    grounded: bots.reduce((sum, b) => sum + b.groundedMs, 0) / Math.max(1, bots.reduce((sum, b) => sum + b.liveMs, 0)),
    longest: Math.max(...bots.map((b) => b.longest)) / 1000,
    pilots,
    skill,
    seed,
    state: m.state,
    why: m.why,
    secs: ((m.endAt ?? now) - m.goAt) / 1000,
    output: m.output,
    kills,
    booms: w.log.filter((e) => e.what === 'boom').length,
    crashes: w.log.filter((e) => e.what === 'crash').length,
    hits: w.log.filter((e) => (e.what === 'arrive') && e.hit).length,
    alive: m.agents.length,
    left: m.agents.map((a) => {
      const x = w.live.get(a.id);
      const q = x && (a.kind === 'hunter' ? w.lastPoses.find((h) => h.id === a.id)?.p : null);
      return `${a.kind}${q ? `@${q.map((v) => v.toFixed(0)).join(',')}` : ''}`;
    }).join(' '),
    wave: m.wave,
  };
}

if (process.env.BAL_DEBUG) {
  const [skill, pilots, seed] = process.env.BAL_DEBUG.split(',');
  console.log(runOne({
    skill, pilots: Number(pilots), seed: Number(seed), floorBuf: readFileSync(new URL('../src/share/war/itaipu-height.bin', import.meta.url)), spawn: spawnArg(),
  }));
} else if (!isMainThread) {
  parentPort.postMessage(runOne(workerData));
} else {
  const RUNS = Number(arg('runs', 12));
  const PILOTS = arg('pilots', '1,2,4,8').split(',').map(Number);
  const SKILL = arg('skill', 'good,average,careless').split(',');
  const SPAWN = spawnArg();
  const JOBS = Number(arg('jobs', Math.max(1, Math.min(12, availableParallelism() - 8))));
  const floorBuf = readFileSync(new URL('../src/share/war/itaipu-height.bin', import.meta.url));
  const jobs = [];
  for (const skill of SKILL) {
    for (const pilots of PILOTS) {
      for (let seed = 1; seed <= RUNS; seed += 1) {
        jobs.push({
          pilots, skill, seed, floorBuf, spawn: SPAWN,
        });
      }
    }
  }
  const started = Date.now();
  const results = [];
  let next = 0;
  const self = fileURLToPath(import.meta.url);
  await new Promise((resolve, reject) => {
    let running = 0;
    const launch = () => {
      if (next >= jobs.length && running === 0) {
        resolve();
        return;
      }
      while (running < JOBS && next < jobs.length) {
        const job = jobs[next];
        next += 1;
        running += 1;
        const wk = new Worker(self, { workerData: job, argv: [] });
        wk.once('message', (r) => results.push(r));
        wk.once('error', reject);
        wk.once('exit', () => {
          running -= 1;
          launch();
        });
      }
    };
    launch();
  });
  for (const r of results.filter((x) => x.state === 'live')) {
    console.log(`  unfinished: ${r.skill} ${r.pilots} seed ${r.seed}, left ${r.left}`);
  }
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
  const pct = (k, n) => `${Math.round((100 * k) / Math.max(1, n))}%`;
  const nRounds = Math.max(...itaipu1.waves.map((wv) => wv.round ?? 0)) + 1;
  console.log(`mission ${itaipu1.id}: ${nRounds} rounds, ${itaipu1.airframes} airframes a pilot a round, floor ${itaipu1.floorMw} of ${itaipu1.output} MW; `
    + `spawn ${SPAWN.length > 1 ? 'the crest seats' : SPAWN[0].join(', ')}; ${RUNS} runs a row, ${JOBS} at once, ${((Date.now() - started) / 1000).toFixed(0)} s`);
  console.log('  skill     pilots  mission  min   output  rounds win/damaged/lost        round s (by round)             earned a round  grounded  longest s  ends');
  for (const skill of SKILL) {
    for (const pilots of PILOTS) {
      const rs = results.filter((r) => r.pilots === pilots && r.skill === skill).sort((a, b) => a.seed - b.seed);
      const won = rs.filter((r) => r.state === 'won');
      const ends = {};
      for (const r of rs) {
        const k = `${r.state}:${r.why}`;
        ends[k] = (ends[k] || 0) + 1;
      }
      const all = rs.flatMap((r) => r.rounds);
      const by = (res) => pct(all.filter((x) => x.result === res).length, all.length);
      const lens = Array.from({ length: nRounds }, (_, k) => {
        const xs = rs.map((r) => r.rounds[k]).filter(Boolean).map((x) => x.secs);
        return xs.length ? mean(xs).toFixed(0) : '-';
      }).join('/');
      console.log(`  ${skill.padEnd(9)} ${String(pilots).padStart(6)}  ${`${won.length}/${rs.length}`.padEnd(7)} ${(mean(rs.map((r) => r.secs)) / 60).toFixed(1).padStart(4)}  `
        + `${mean(rs.map((r) => r.output)).toFixed(0).padStart(6)}  ${`${by('win')} / ${by('damaged')} / ${by('lost')}`.padEnd(26)} ${lens.padEnd(30)} `
        + `${mean(all.map((x) => x.earned)).toFixed(1).padStart(8)}        `
        + `${(100 * mean(rs.map((r) => r.grounded))).toFixed(1).padStart(6)}%  ${mean(rs.map((r) => r.longest)).toFixed(0).padStart(4)} (max ${Math.max(...rs.map((r) => r.longest)).toFixed(0)})  `
        + `${Object.entries(ends).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    }
  }
}
