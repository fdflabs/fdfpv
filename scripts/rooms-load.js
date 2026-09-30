/*
 * rooms-load.js: rooms:load, the rooms server under load (docs/MULTIPLAYER-PLAN.md
 * section 12, Phase 6). Headless pilots speak the wire to a running server
 * the way the browser does, and the server's own counters
 * (edge/rooms/health.js, GET /v2/admin/health) say what it cost.
 *
 *   node scripts/rooms-load.js [origin] [options]     (npm run rooms:load)
 *
 *   --pilots=8,16,24,32  pilots a room; a list is one run after another
 *   --rooms=1            rooms at once, each with that many pilots
 *   --phase=20           seconds each phase is measured
 *   --phases=free,race,combat
 *   --spread=wide        free flight spread over kilometres (the thinning's
 *                        case), or near: everybody within 250 m
 *   --quick              CI: 32 pilots in one room, 5 s phases
 *   --json=file          the results, for the pull request
 *   --server=path        with no origin: a different edge/rooms/node.js to
 *                        start (an older checkout, to compare), with no
 *                        admin route; its CPU is read from /proc
 *   --pin=N              with no origin: the server on CPU N (taskset)
 *
 * With no origin it starts the rooms server itself (this checkout's, on a
 * scratch SQLite file, with a random admin secret and ROOM_CAP set to the
 * pilots a room, so it can measure rooms past the public cap). Against a
 * running server the admin secret comes from ADMIN_SECRET; its rooms are
 * public ones named "Load test" on the world "loadtest", which the room
 * browser lists while they last, and no quick join on a real world finds.
 *
 * EACH PILOT flies what a pilot flies, at the client's own rates
 * (src/main.js): a POSE at 30 Hz on its estimate of the room clock, eight
 * clock pings at the start and one every TRACK_MS after
 * (src/share/roomclock.js), a keepalive every 20 s, a quick chat every 8
 * to 20 s. The phases, every room in step:
 *
 *   free     free flight, spread as asked; every pilot crashes once: the
 *            crash event, PARTS at 10 Hz for 3 s, then flies on
 *   race     the host loads a six gate track, everybody says ready, the
 *            host starts three laps, every pilot reports its gates
 *   combat   the host starts a round; everybody tows a fifty link streamer
 *            at 10 Hz through the 20 s countdown and the round
 *
 * What it reports per phase: the server's CPU (a fraction of one core),
 * the loop's p99 delay, memory, messages and bytes out a second, per room
 * and per pilot; and what the pilots received: bytes a second each, the
 * rate and the worst gaps of a peer's poses in each interest band
 * (edge/rooms/core.js INTEREST), and how many pose entries the thinning
 * saved against sending every pose to everybody.
 *
 * THE CHECKS are about function, not speed, so a slow machine does not
 * fail them: every pilot seated, near peers at the full rate with no gap
 * past three ticks, mid and far peers at their bands' rates, and each
 * phase's traffic arrived (a chat, a wreck, a race start, a combat round
 * on). The speed is in the numbers, for a person to read with the load on
 * the machine it ran on, which is printed with them.
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

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import WebSocket from 'ws';
import {
  CHAT_PRESETS, FLAG_AIRBORNE, FLAG_CRASHED, FLAG_QUAD, PROTO, TYPE_BATCH, TYPE_PARTS_RELAY, TYPE_STREAMER_RELAY,
  BATCH_ENTRY, BATCH_HEAD, encodeParts, encodePose, encodeStreamer,
} from '../src/share/roomwire.js';
import { INTEREST, TICK_MS } from '../edge/rooms/core.js';
import { TRACK_MS } from '../src/share/roomclock.js';
import { mapTrackDocument } from '../tests/lib/maptrack.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WEB_ORIGIN = 'https://fdflabs.github.io';
const SETTLE_S = 3;
const COMBAT_COUNTDOWN_S = 21;
const GAP_BIN_MS = 5;
const GAP_BINS = 400;
const BANDS = INTEREST.length;
const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : NaN);
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '-');
const kb = (x) => (Number.isFinite(x) ? (x / 1000).toFixed(1) : '-');

/* A seeded random source, so a run flies the same paths every time. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* The band a pose at distance d came in, or -1 within EDGE of a band's
 * edge: the room judged it on its own newest poses, a moment apart from
 * the receiver's, so there it may have judged the other band. */
const EDGE = 0.1;
function bandOf(d) {
  const b = INTEREST.findIndex((x) => d <= x.m);
  const near = (m) => Number.isFinite(m) && Math.abs(d - m) <= EDGE * m;
  return near(INTEREST[b].m) || (b > 0 && near(INTEREST[b - 1].m)) ? -1 : b;
}

/* ------------------------------------------------------------------ */
/* The server, when this starts one: node scripts/rooms-load.js --serve */

if (process.argv.includes('--serve')) {
  const { startRooms } = await import('../edge/rooms/node.js');
  const running = await startRooms({
    db: process.env.LOAD_DB, port: 0, adminSecret: process.env.ADMIN_SECRET, roomCap: Number(process.env.LOAD_CAP || 0),
  });
  console.log(`fdfpv rooms on 127.0.0.1:${running.port}`);
  const quit = async () => {
    await running.stop();
    process.exit(0);
  };
  process.on('SIGTERM', quit);
  /* The driver holds our stdin: when it goes, however it went, so do we. */
  process.stdin.on('end', quit);
  process.stdin.resume();
} else if (!isMainThread) {
  await pilotsWorker(workerData);
} else {
  await main();
}

/* ------------------------------------------------------------------ */
/* The pilots: one worker thread holds some rooms' pilots. */

/* Where pilot i of a room flies in each phase: a circle, its centre by
 * the phase and the spread. Returns { at(ms) -> { p, v, heading, rate } }. */
function flightPlan(room, i, n, spread, rand) {
  const plans = {};
  const circle = (cx, cy, cz, radius, speed, phase) => ({
    at(ms) {
      const w = speed / radius;
      const a = phase + (ms / 1000) * w;
      const p = [cx + radius * Math.cos(a), cy, cz + radius * Math.sin(a)];
      const v = [-Math.sin(a) * speed, 0, Math.cos(a) * speed];
      return { p, v, heading: Math.atan2(v[0], v[2]), rate: w, radius, speed, a, w };
    },
  });
  /* Free flight: half the room within 250 m of the middle, a quarter 300 m
   * to 1.5 km out, a quarter 1.5 to 4 km: a big map's evening. */
  const ring = spread === 'near' || i < n / 2 ? [0, 250] : i < (3 * n) / 4 ? [300, 1500] : [1500, 4000];
  const r0 = ring[0] + rand() * (ring[1] - ring[0]);
  const b0 = rand() * Math.PI * 2;
  plans.free = circle(Math.cos(b0) * r0, 150 + 10 * i, Math.sin(b0) * r0, 40 + rand() * 80, 20 + rand() * 15, rand() * 6.28);
  /* The race: everybody on the track's ring, 6 m apart in height. */
  plans.race = circle(120, 640 + 6 * i, -80, 150, 30, (i / n) * Math.PI * 2);
  /* Combat: one piece of sky 200 m across, 4 m apart in height. */
  plans.combat = circle(rand() * 60 - 30, 200 + 4 * i, rand() * 60 - 30, 60 + rand() * 40, 25, rand() * 6.28);
  return plans;
}

function crashTable() {
  const table = [{ kind: 0, parent: -1, cg: [0, 0, 0], boxMin: [-0.3, -0.1, -0.1], boxMax: [0.3, 0.1, 0.1] }];
  for (let k = 1; k < 10; k += 1) {
    table.push({ kind: k % 6, parent: 0, cg: [0, 0.1 * k, 0], boxMin: [-0.1, -0.05, -0.02], boxMax: [0.1, 0.05, 0.02] });
  }
  return table;
}

/* A streamer towed behind a circle: fifty one-metre links back along the
 * path, sagging. */
function towed(f, links = 50) {
  const x = new Float64Array((links + 1) * 3);
  for (let k = 0; k <= links; k += 1) {
    const a = f.a - (k / f.radius);
    x[k * 3] = f.p[0] - f.radius * Math.cos(f.a) + f.radius * Math.cos(a);
    x[k * 3 + 1] = f.p[1] - 0.15 * k;
    x[k * 3 + 2] = f.p[2] - f.radius * Math.sin(f.a) + f.radius * Math.sin(a);
  }
  return [{ id: 0, n: links + 1, x }];
}

function emptyPhaseStats() {
  return {
    rxBytes: 0, rxMsgs: 0, batches: 0, texts: 0, parts: 0, streamers: 0, chats: 0, crashes: 0, cuts: 0,
    txPoses: 0, txMsgs: 0, txBytes: 0,
    entries: new Array(BANDS).fill(0),
    gaps: Array.from({ length: BANDS }, () => new Uint32Array(GAP_BINS + 1)),
    gapMax: new Array(BANDS).fill(0),
    raceOn: 0, combatOn: 0,
  };
}

async function pilotsWorker({ origin, rooms, pilots, spread, local, seed, id }) {
  const wsOrigin = origin.replace(/^http/, 'ws');
  const all = [];
  let plan = null;
  const phaseAt = (wall) => {
    if (!plan) {
      return null;
    }
    const ph = plan.phases.find((x) => wall >= x.from && wall < x.to);
    return ph ? ph.name : null;
  };
  const stats = new Map();
  const statsFor = (name) => {
    if (!stats.has(name)) {
      stats.set(name, emptyPhaseStats());
    }
    return stats.get(name);
  };

  function pilotOf(room, i) {
    const rand = rng(seed * 1000003 + room.index * 1009 + i);
    const c = {
      room, i, rand, ws: null, welcome: null, offset: null, bestRtt: Infinity, pings: 0, closed: null,
      plans: flightPlan(room, i, pilots, spread, rand), seq: 0, nextPose: 0, nextChat: 0, nextKeep: 0, nextStreamer: 0,
      last: new Map(), wreck: null, crashAt: null, raceId: null, trackId: null, gates: 0, lastGateA: null,
      quad: i % 2 === 0,
    };
    c.roomNow = () => Date.now() + c.offset;
    c.sendText = (obj) => c.send(JSON.stringify(obj));
    c.send = (data) => {
      if (c.ws.readyState !== 1) {
        return;
      }
      c.ws.send(data);
      const s = plan ? statsFor(phaseAt(Date.now()) || 'between') : null;
      if (s) {
        s.txMsgs += 1;
        s.txBytes += typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength;
      }
    };
    return c;
  }

  function onMessage(c, data, binary) {
    const wall = Date.now();
    const ph = phaseAt(wall);
    const s = ph ? statsFor(ph) : null;
    if (s) {
      s.rxMsgs += 1;
      s.rxBytes += data.length;
    }
    if (binary) {
      const type = data[0];
      if (type === TYPE_BATCH) {
        if (!s) {
          return;
        }
        s.batches += 1;
        const count = data[1];
        const flying = c.flying;
        for (let k = 0; k < count; k += 1) {
          const at = BATCH_HEAD + k * BATCH_ENTRY;
          const seat = data[at];
          const px = data.readFloatLE(at + 8);
          const py = data.readFloatLE(at + 12);
          const pz = data.readFloatLE(at + 16);
          const band = flying ? bandOf(Math.hypot(px - flying[0], py - flying[1], pz - flying[2])) : 0;
          s.entries[Math.max(0, band)] += 1;
          const prev = c.last.get(seat);
          c.last.set(seat, wall);
          if (band >= 0 && prev != null && wall - prev < 5000) {
            const gap = wall - prev;
            s.gaps[band][Math.min(GAP_BINS, Math.floor(gap / GAP_BIN_MS))] += 1;
            s.gapMax[band] = Math.max(s.gapMax[band], gap);
          }
        }
      } else if (type === TYPE_PARTS_RELAY && s) {
        s.parts += 1;
      } else if (type === TYPE_STREAMER_RELAY && s) {
        s.streamers += 1;
      }
      return;
    }
    const text = data.toString();
    if (text === 'pong') {
      return;
    }
    if (s) {
      s.texts += 1;
    }
    const m = JSON.parse(text);
    if (m.type === 'welcome') {
      c.welcome = m;
      c.offset = m.roomMs - wall;
    } else if (m.type === 't') {
      const rtt = wall - m.c;
      if (rtt < c.bestRtt) {
        c.bestRtt = rtt;
        c.offset = m.s + rtt / 2 - wall;
      }
    } else if (m.type === 'host' && c.welcome) {
      c.welcome.host = m.seat;
    } else if (m.type === 'track' && m.track) {
      c.trackId = m.track.id;
    } else if (m.type === 'race' && m.race) {
      c.raceId = m.race.id;
      c.goAt = m.race.goAt;
      /* Said during the phase's lead, so counted against the phase. */
      if (plan && m.race.state === 'on') {
        statsFor('race').raceOn += 1;
      }
    } else if (m.type === 'combat' && plan && m.state === 'on') {
      statsFor('combat').combatOn += 1;
    } else if (m.type === 'event' && s) {
      if (m.kind === 'chat') {
        s.chats += 1;
      } else if (m.kind === 'crash' && !m.clear) {
        s.crashes += 1;
      } else if (m.kind === 'cut') {
        s.cuts += 1;
      }
    }
  }

  function connect(c) {
    return new Promise((resolve) => {
      /* Locally each pilot has an address of its own, as a room of real
       * pilots does; through Caddy the header is the connection's. */
      const headers = { origin: WEB_ORIGIN, ...(local ? { 'cf-connecting-ip': `10.${id}.${c.room.index % 250}.${c.i + 1}` } : {}) };
      const ws = new WebSocket(`${wsOrigin}/v2/room/${c.room.code}`, { headers });
      c.ws = ws;
      ws.on('open', () => {
        c.sendText({ type: 'hello', proto: PROTO, build: 'load', name: [c.i % 24, (c.i * 7) % 24, 10 + (c.i % 90)], profile: {
          airframe: c.quad ? '5inch' : 'cub1400', map: c.room.map, figure: c.i % 12, livery: null, parts: null,
        } });
      });
      ws.on('message', (data, binary) => {
        onMessage(c, data, binary);
        if (c.welcome && c.offset != null) {
          resolve();
        }
      });
      ws.on('close', (code, reason) => {
        c.closed = { code, reason: reason.toString() };
        resolve();
      });
      ws.on('error', () => {});
    });
  }

  for (const room of rooms) {
    for (let i = 0; i < pilots; i += 1) {
      all.push(pilotOf(room, i));
    }
  }
  /* Seated one by one, as people arrive, then the clock pings. */
  for (const c of all) {
    await connect(c);
  }
  for (let k = 0; k < 8; k += 1) {
    for (const c of all) {
      if (!c.closed) {
        c.sendText({ type: 't', c: Date.now() });
      }
    }
    await sleep(250);
  }
  parentPort.postMessage({ ready: all.filter((c) => c.welcome && !c.closed).length, closed: all.filter((c) => c.closed).map((c) => c.closed) });
  plan = await new Promise((resolve) => parentPort.once('message', resolve));

  const isHost = (c) => c.welcome && c.welcome.host === c.welcome.seat;
  const hostOf = (room) => all.find((c) => c.room === room && isHost(c));
  const phaseOf = (name) => plan.phases.find((p) => p.name === name);
  const done = new Set();
  const once = (key, fn) => {
    if (!done.has(key)) {
      done.add(key);
      fn();
    }
  };

  /* The rooms' hosts: loading, starting and ending each game. */
  function hostActions(wall) {
    for (const room of rooms) {
      const h = hostOf(room);
      if (!h) {
        continue;
      }
      const race = phaseOf('race');
      if (race && wall >= race.lead) {
        once(`track${room.index}`, () => h.sendText({
          type: 'track', doc: mapTrackDocument({ id: 'trk-load001', name: 'Load', gates: 6, radius: 150 }),
        }));
      }
      if (race && wall >= race.lead + 1500) {
        once(`start${room.index}`, () => h.sendText({ type: 'race', op: 'start', laps: 3 }));
      }
      const combat = phaseOf('combat');
      if (race && wall >= race.to - 200) {
        once(`end${room.index}`, () => h.sendText({ type: 'race', op: 'end' }));
      }
      if (combat && wall >= combat.lead) {
        once(`combat${room.index}`, () => h.sendText({ type: 'combat', op: 'start', minutes: 3 }));
      }
      if (combat && wall >= combat.to - 200) {
        once(`stop${room.index}`, () => h.sendText({ type: 'combat', op: 'stop' }));
      }
    }
  }

  /* The phase a wall time flies in, counting a phase's lead (the host's
   * set up) as that phase. */
  const flyingIn = (wall) => {
    const ph = plan.phases.find((p) => wall >= (p.lead ?? p.from) && wall < p.to);
    return ph ? ph.name : null;
  };

  function frame(c, wall) {
    const name = flyingIn(wall);
    if (!name || c.closed) {
      c.flying = null;
      return;
    }
    const s = statsFor(phaseAt(wall) || 'between');
    const t = c.roomNow();
    const f = c.plans[name].at(t);
    c.flying = f.p;
    /* The race: ready as soon as the track is here, then every gate. */
    if (name === 'race' && c.trackId && !c.ready) {
      c.ready = true;
      c.sendText({ type: 'race', op: 'ready', track: c.trackId, ready: true });
    }
    if (name === 'race' && c.raceId && c.goAt != null && t > c.goAt) {
      const gate = Math.floor(((f.a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI / 3));
      if (c.lastGateA !== null && gate !== c.lastGateA) {
        c.gates += 1;
        c.sendText({
          type: 'event', kind: 'gate', race: c.raceId, lap: Math.floor(c.gates / 6), gate: c.gates % 6, t: Math.round(t - c.goAt), points: 0,
        });
      }
      c.lastGateA = gate;
    }
    /* Free flight: one crash, somewhere in the phase. */
    if (name === 'free') {
      const ph = phaseOf('free');
      c.crashAt ??= ph.from + 1000 + c.rand() * Math.max(0, ph.to - ph.from - 6000);
      if (!c.wreck && !c.crashed && wall >= c.crashAt) {
        c.crashed = true;
        c.wreck = { until: wall + 3000, at: f.p, next: wall };
        c.sendText({ type: 'event', kind: 'crash', table: crashTable() });
      }
    }
    if (c.wreck && wall >= c.wreck.until) {
      c.wreck = null;
      c.sendText({ type: 'event', kind: 'crash', clear: true });
    }
    if (wall >= c.nextPose) {
      c.nextPose = Math.max(c.nextPose + 1000 / 30, wall - 1000 / 30);
      const w = c.wreck;
      const p = w ? w.at : f.p;
      const v = w ? [0, 0, 0] : f.v;
      const h = f.heading / 2;
      c.seq = (c.seq + 1) & 0xffff;
      c.send(encodePose({
        flags: (w ? FLAG_CRASHED : FLAG_AIRBORNE) | (c.quad ? FLAG_QUAD : 0), seq: c.seq, t,
        px: p[0], py: p[1], pz: p[2], qx: 0, qy: Math.sin(h), qz: 0, qw: Math.cos(h),
        vx: v[0], vy: v[1], vz: v[2], wx: 0, wy: w ? 0 : f.rate, wz: 0, c0: 0, c1: 0, c2: 0, c3: 0, motor: 400, flaps: 0,
      }));
      s.txPoses += 1;
    }
    if (c.wreck && wall >= c.wreck.next) {
      c.wreck.next = wall + 100;
      const fall = (3000 - (c.wreck.until - wall)) / 1000;
      const pieces = [];
      for (let k = 1; k < 10; k += 1) {
        pieces.push({ part: k, x: c.wreck.at[0] + k * 0.3, y: Math.max(0, c.wreck.at[1] - 4.9 * fall * fall), z: c.wreck.at[2], qx: 0, qy: 0, qz: 0, qw: 1 });
      }
      c.send(encodeParts(t, pieces));
    }
    if (name === 'combat' && wall >= c.nextStreamer) {
      c.nextStreamer = Math.max(c.nextStreamer + 100, wall - 100);
      c.send(encodeStreamer(t, towed(f)));
    }
    c.nextClock ||= wall + c.rand() * TRACK_MS;
    if (wall >= c.nextClock) {
      c.sendText({ type: 't', c: Date.now() });
      c.nextClock = wall + TRACK_MS;
    }
    c.nextChat ||= wall + c.rand() * 6000;
    if (wall >= c.nextChat) {
      c.sendText({ type: 'event', kind: 'chat', id: Math.floor(c.rand() * CHAT_PRESETS.length) });
      c.nextChat = wall + 8000 + c.rand() * 12000;
    }
    if (wall >= c.nextKeep) {
      if (c.nextKeep) {
        c.send('ping');
      }
      c.nextKeep = wall + 20000;
    }
  }

  /* A few milliseconds a turn: every pilot sends when its own clock says,
   * so the room sees them spread as real clients are. */
  const end = plan.phases[plan.phases.length - 1].to;
  await new Promise((resolve) => {
    const timer = setInterval(() => {
      const wall = Date.now();
      hostActions(wall);
      for (const c of all) {
        frame(c, wall);
      }
      if (wall >= end) {
        clearInterval(timer);
        resolve();
      }
    }, 4);
  });
  const closedLate = all.filter((c) => c.closed).map((c) => c.closed);
  for (const c of all) {
    c.ws.terminate();
  }
  parentPort.postMessage({ stats: Object.fromEntries(stats), closed: closedLate });
}

/* ------------------------------------------------------------------ */
/* The driver. */

function argsOf(argv) {
  const a = { origin: null, pilots: [8, 16, 24, 32], rooms: 1, phase: 20, phases: ['free', 'race', 'combat'], spread: 'wide', json: null, server: null, pin: null };
  for (const arg of argv) {
    const [k, v] = arg.replace(/^--/, '').split('=');
    if (!arg.startsWith('--')) {
      a.origin = arg.replace(/\/+$/, '');
    } else if (k === 'quick') {
      Object.assign(a, { pilots: [32], rooms: 1, phase: 5 });
    } else if (k === 'pilots') {
      a.pilots = v.split(',').map(Number);
    } else if (k === 'rooms' || k === 'phase' || k === 'pin') {
      a[k] = Number(v);
    } else if (k === 'phases') {
      a.phases = v.split(',');
    } else if (k === 'spread' || k === 'json' || k === 'server') {
      a[k] = v;
    } else {
      throw new Error(`unknown option ${arg}`);
    }
  }
  if (!a.pilots.every((n) => Number.isInteger(n) && n >= 2 && n <= 64) || !(a.rooms >= 1) || !(a.phase >= 3)) {
    throw new Error('--pilots 2 to 64 each, --rooms 1 or more, --phase 3 s or more');
  }
  if (!['wide', 'near'].includes(a.spread) || !a.phases.every((p) => ['free', 'race', 'combat'].includes(p))) {
    throw new Error('--spread wide|near, --phases of free,race,combat');
  }
  return a;
}

/* /proc/<pid>: CPU seconds and resident bytes, or null off Linux. */
function procOf(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const f = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    const rss = Number(readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/)[1]) * 1024;
    return { cpuS: (Number(f[11]) + Number(f[12])) / 100, rss };
  } catch (e) {
    return null;
  }
}

async function startServer(a, cap, scratch) {
  const secret = randomBytes(24).toString('base64');
  const db = join(scratch, `rooms-${cap}.db`);
  const entry = a.server ? [a.server] : [fileURLToPath(import.meta.url), '--serve'];
  const node = [process.execPath, '--disable-warning=ExperimentalWarning', ...entry];
  const cmd = a.pin != null ? ['taskset', '-c', String(a.pin), ...node] : node;
  const child = spawn(cmd[0], cmd.slice(1), {
    cwd: root,
    env: { ...process.env, LOAD_DB: db, ROOMS_DB: db, LOAD_CAP: String(cap), ADMIN_SECRET: secret, PORT: '0', HOST: '127.0.0.1' },
    stdio: [a.server ? 'ignore' : 'pipe', 'pipe', 'inherit'],
  });
  const port = await new Promise((resolve, reject) => {
    let out = '';
    child.stdout.on('data', (d) => {
      out += d;
      const m = out.match(/on [\d.]+:(\d+)/);
      if (m) {
        resolve(Number(m[1]));
      }
    });
    child.on('exit', (code) => reject(new Error(`the server exited ${code}`)));
  });
  return { child, origin: `http://127.0.0.1:${port}`, secret: a.server ? null : secret };
}

async function makeRooms(origin, n, local, remote) {
  const out = [];
  for (let k = 0; k < n; k += 1) {
    const body = remote ? { map: 'loadtest', public: true, name: 'Load test' } : { map: 'swiss2', public: true, name: `Load ${k + 1}` };
    for (;;) {
      const res = await fetch(`${origin}/v2/create`, {
        method: 'POST',
        headers: { origin: WEB_ORIGIN, 'content-type': 'application/json', ...(local ? { 'cf-connecting-ip': `10.200.${k >> 8}.${k & 255}` } : {}) },
        body: JSON.stringify(body),
      });
      if (res.status === 429) {
        /* Six rooms a minute from one address (edge/rooms/front.js). */
        await sleep(11000);
        continue;
      }
      const got = await res.json();
      if (!res.ok) {
        throw new Error(`create: ${res.status} ${JSON.stringify(got)}`);
      }
      out.push({ code: got.code, map: body.map, index: k });
      break;
    }
  }
  return out;
}

function mergeStats(list) {
  const out = {};
  for (const one of list) {
    for (const [name, s] of Object.entries(one)) {
      const m = (out[name] ??= emptyPhaseStats());
      for (const [k, v] of Object.entries(s)) {
        if (k === 'gaps') {
          v.forEach((h, b) => h.forEach((x, i) => {
            m.gaps[b][i] += x;
          }));
        } else if (k === 'gapMax') {
          v.forEach((x, b) => {
            m.gapMax[b] = Math.max(m.gapMax[b], x);
          });
        } else if (k === 'entries') {
          v.forEach((x, b) => {
            m.entries[b] += x;
          });
        } else {
          m[k] += v;
        }
      }
    }
  }
  return out;
}

function gapStats(hist) {
  const total = hist.reduce((x, y) => x + y, 0);
  if (!total) {
    return null;
  }
  let sum = 0;
  let seen = 0;
  let p50 = null;
  let p99 = null;
  hist.forEach((n, i) => {
    const ms = (i + 0.5) * GAP_BIN_MS;
    sum += n * ms;
    seen += n;
    if (p50 === null && seen >= total * 0.5) {
      p50 = ms;
    }
    if (p99 === null && seen >= total * 0.99) {
      p99 = ms;
    }
  });
  return { n: total, meanMs: sum / total, hz: 1000 / (sum / total), p50Ms: p50, p99Ms: p99 };
}


async function oneRun(a, pilots, report) {
  const scratch = mkdtempSync(join(os.tmpdir(), 'fdfpv-load-'));
  let server = null;
  let origin = a.origin;
  let secret = process.env.ADMIN_SECRET || null;
  const local = !a.origin;
  if (local) {
    server = await startServer(a, pilots, scratch);
    origin = server.origin;
    secret = server.secret;
  }
  const rooms = await makeRooms(origin, a.rooms, local, !local);
  /* A worker for every 48 pilots or so, whole rooms each. */
  const perWorker = Math.max(1, Math.floor(48 / pilots));
  const workers = [];
  for (let k = 0; k < rooms.length; k += perWorker) {
    workers.push(new Worker(fileURLToPath(import.meta.url), {
      workerData: { origin, rooms: rooms.slice(k, k + perWorker), pilots, spread: a.spread, local, seed: 7, id: workers.length + 1 },
    }));
  }
  const ready = await Promise.all(workers.map((w) => new Promise((resolve) => w.once('message', resolve))));
  const seated = ready.reduce((x, r) => x + r.ready, 0);
  const refused = ready.flatMap((r) => r.closed);
  report.check(`${a.rooms} room(s) of ${pilots}: every pilot seated`, seated === a.rooms * pilots, `${seated} seated, closed ${JSON.stringify(refused.slice(0, 3))}`);

  /* The timeline, the same wall clock for every worker. A race's lead is
   * the host's load and start (6 s countdown); combat's the round's 20 s. */
  const phases = [];
  let at = Date.now() + 1000;
  for (const name of a.phases) {
    const lead = name === 'race' ? 9 : name === 'combat' ? COMBAT_COUNTDOWN_S : 0;
    phases.push({ name, lead: at, from: at + lead * 1000, to: at + (lead + a.phase) * 1000 });
    at += (lead + a.phase) * 1000 + 1000;
  }
  const load0 = os.loadavg()[0];
  const samples = [];
  const poll = async () => {
    const wall = Date.now();
    const proc = server ? procOf(server.child.pid) : null;
    let h = null;
    if (secret) {
      try {
        const res = await fetch(`${origin}/v2/admin/health`, { headers: { authorization: `Bearer ${secret}` } });
        h = res.ok ? await res.json() : null;
      } catch (e) {
        h = null;
      }
    }
    samples.push({ wall, proc, h });
  };
  const poller = setInterval(poll, 1000);
  const results = await Promise.all(workers.map((w) => {
    const got = new Promise((resolve) => w.once('message', resolve));
    w.postMessage({ phases });
    return got;
  }));
  clearInterval(poller);
  await Promise.all(workers.map((w) => w.terminate()));
  const load1 = os.loadavg()[0];
  const lateClosed = results.flatMap((r) => r.closed);
  report.check(`${a.rooms} room(s) of ${pilots}: nobody was closed while flying`, lateClosed.length === 0, JSON.stringify(lateClosed.slice(0, 3)));
  const merged = mergeStats(results.map((r) => r.stats));
  const n = a.rooms * pilots;

  const rows = [];
  for (const ph of phases) {
    const from = ph.from + SETTLE_S * 1000;
    const win = samples.filter((x) => x.wall >= from && x.wall <= ph.to);
    const s = merged[ph.name] || emptyPhaseStats();
    const secs = (ph.to - ph.from) / 1000;
    /* /proc: CPU seconds over the window, from its first to its last sample. */
    const procs = win.filter((x) => x.proc);
    const procCpu = procs.length > 1 ? (procs.at(-1).proc.cpuS - procs[0].proc.cpuS) / ((procs.at(-1).wall - procs[0].wall) / 1000) : NaN;
    const hs = win.filter((x) => x.h && x.h.now).map((x) => x.h);
    const bands = s.gaps.map(gapStats);
    const sent = s.txPoses;
    const every = sent * (pilots - 1);
    const got = s.entries.reduce((x, y) => x + y, 0);
    const row = {
      phase: ph.name,
      rooms: a.rooms,
      pilots,
      seconds: secs,
      cpu: hs.length ? mean(hs.map((h) => h.now.cpu)) : procCpu,
      procCpu,
      hostCpu: hs.length ? mean(hs.map((h) => h.now.hostCpu)) : NaN,
      lagP99Ms: hs.length ? Math.max(...hs.map((h) => h.now.lagP99Ms)) : NaN,
      lagP99MeanMs: hs.length ? mean(hs.map((h) => h.now.lagP99Ms)) : NaN,
      lagMaxMs: hs.length ? Math.max(...hs.map((h) => h.now.lagMaxMs)) : NaN,
      rssMB: (hs.length ? Math.max(...hs.map((h) => h.memory.rss)) : Math.max(...procs.map((x) => x.proc.rss))) / 1e6,
      outBytesPerS: hs.length ? mean(hs.map((h) => h.now.outBytesPerS)) : s.rxBytes / secs,
      outMsgsPerS: hs.length ? mean(hs.map((h) => h.now.outMsgsPerS)) : s.rxMsgs / secs,
      inMsgsPerS: hs.length ? mean(hs.map((h) => h.now.inMsgsPerS)) : s.txMsgs / secs,
      rxBytesPerPilotS: s.rxBytes / secs / n,
      bands: bands.map((b, i) => (b ? { m: INTEREST[i].m, hz: b.hz, p50Ms: b.p50Ms, p99Ms: b.p99Ms, maxMs: s.gapMax[i], n: b.n } : null)),
      entriesSaved: every ? 1 - got / every : 0,
      chats: s.chats, crashes: s.crashes, parts: s.parts, streamers: s.streamers, cuts: s.cuts, raceOn: s.raceOn, combatOn: s.combatOn,
      loadAvg: [load0, load1],
    };
    rows.push(row);
    const near = row.bands[0];
    report.check(`${ph.name}, ${a.rooms}x${pilots}: near peers at the full rate`, near && near.hz > 26 && near.p99Ms <= 3 * TICK_MS + GAP_BIN_MS,
      near ? `${f1(near.hz)} Hz, p99 gap ${near.p99Ms} ms` : 'no near peers');
    for (let b = 1; b < BANDS; b += 1) {
      const band = row.bands[b];
      if (band && band.n > 20) {
        const want = 1000 / (INTEREST[b].every * TICK_MS);
        report.check(`${ph.name}, ${a.rooms}x${pilots}: peers within ${INTEREST[b].m} m at ${f1(want)} Hz`, band.hz > want * 0.8 && band.hz < want * 1.25, `${f1(band.hz)} Hz`);
      }
    }
    if (ph.name === 'free') {
      report.check(`free, ${a.rooms}x${pilots}: chat and wrecks passed on`, s.chats > 0 && s.crashes >= n && s.parts > 0, `${s.chats} chats, ${s.crashes} crashes, ${s.parts} parts`);
    } else if (ph.name === 'race') {
      report.check(`race, ${a.rooms}x${pilots}: the race ran`, s.raceOn > 0, `${s.raceOn}`);
    } else if (ph.name === 'combat') {
      report.check(`combat, ${a.rooms}x${pilots}: the round went on and every streamer was relayed`, s.combatOn > 0 && s.streamers > 0, `${s.combatOn} on, ${s.streamers} streamers`);
    }
  }
  if (server) {
    server.child.kill('SIGTERM');
    await new Promise((resolve) => server.child.once('exit', resolve));
  }
  rmSync(scratch, { recursive: true, force: true });
  return rows;
}

async function main() {
  const a = argsOf(process.argv.slice(2).filter((x) => x !== '--serve'));
  if (a.origin && !process.env.ADMIN_SECRET) {
    console.log('  (no ADMIN_SECRET: the server\'s own numbers will be missing)');
  }
  if (a.server && !existsSync(a.server)) {
    throw new Error(`no server at ${a.server}`);
  }
  let failed = 0;
  let passed = 0;
  const report = {
    check(name, ok, detail = '') {
      console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
      if (ok) {
        passed += 1;
      } else {
        failed += 1;
      }
    },
  };
  console.log(`rooms:load against ${a.origin || 'edge/rooms/node.js started here'}${a.server ? ` (${a.server})` : ''}; ${os.cpus().length} cores, load ${os.loadavg().map((x) => x.toFixed(1)).join(' ')}`);
  const all = [];
  for (const pilots of a.pilots) {
    console.log(`\n${a.rooms} room(s) of ${pilots} pilots, ${a.spread} free flight, ${a.phase} s a phase`);
    all.push(...await oneRun(a, pilots, report));
  }
  console.log('\nphase    rooms x pilots  cpu    lag p99 (max)  rss MB  out kB/s  out msg/s  per pilot kB/s  near Hz/p99  mid Hz  far Hz  saved  load');
  for (const r of all) {
    const b = r.bands;
    console.log(`${r.phase.padEnd(8)} ${String(r.rooms).padStart(5)} x ${String(r.pilots).padEnd(6)} ${(r.cpu * 100).toFixed(1).padStart(5)}%  ${f1(r.lagP99MeanMs).padStart(5)} (${f1(r.lagP99Ms)})  ${f1(r.rssMB).padStart(6)}  ${kb(r.outBytesPerS).padStart(8)}  ${f1(r.outMsgsPerS).padStart(9)}  ${kb(r.rxBytesPerPilotS).padStart(14)}  `
      + `${b[0] ? `${f1(b[0].hz)}/${b[0].p99Ms}` : '-'}`.padStart(11) + `  ${b[1] ? f1(b[1].hz) : '-'}`.padStart(8) + `  ${b[2] ? f1(b[2].hz) : '-'}`.padStart(7)
      + `  ${(r.entriesSaved * 100).toFixed(0).padStart(4)}%  ${r.loadAvg.map((x) => x.toFixed(0)).join('/')}`);
  }
  if (a.json) {
    writeFileSync(a.json, JSON.stringify({ at: new Date().toISOString(), args: a, cores: os.cpus().length, cpu: os.cpus()[0].model, rows: all }, null, 1));
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
