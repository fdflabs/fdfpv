/*
 * roomclock-check.js: how far a page's room clock (src/share/roomclock.js)
 * is from the room's. npm run rooms:clock.
 *
 * Two ways, each against the clock as it was before roomclock.js (eight
 * pings at a join, the tightest believed, then one ping every 30 s moving
 * it at most 2 ms, "before" below) and the clock now ("now"):
 *
 *   model     a page and a room exchanging pings over a modelled network
 *             for five minutes, the error read every 50 ms: a LAN (0.25 ms
 *             each way, 0.1 ms of jitter, one reply in twenty held up to
 *             5 ms) and the internet (18 ms up, 22 ms down, so 2 ms of
 *             asymmetry no page can see, 3 ms of jitter, one in ten held
 *             up to 40 ms), each with a page at 60 fps busy for half of
 *             every frame and at 5 fps busy for 90 percent of every frame.
 *             A busy page reads a reply only when its frame's work is
 *             done, and its timers fire only then too. The page's clock
 *             runs 20 ppm off the room's. Seeded: the same numbers every
 *             run.
 *   loopback  the real server (edge/rooms/node.js) in a process of its
 *             own on this machine, and this process as a page speaking
 *             the wire to it, idle and then busy 170 ms of every 200 ms
 *             (a 5 fps page). Both read this machine's one clock, so the
 *             room's time is known here exactly (its epoch, over IPC), and
 *             the error is measured, not modelled. 40 s each.
 *
 * Checks: on the LAN, and on the loopback, the error is under TARGET_MS at
 * p95 at both frame rates; on the modelled internet it is within a
 * millisecond of half the asymmetry at p95; and on the model, whose runs
 * are seeded, "now" is no worse than "before" at p95. On the loopback both
 * are a few tenths of a millisecond, under the whole millisecond a POSE
 * stamp carries, and which is lower is the run's luck, so there only the
 * target is held. Exit 1 on a failure.
 *
 *   node scripts/roomclock-check.js [--only=model|loopback]
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

import { fork } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import { RoomClock, SYNC_GAP_MS, SYNC_PINGS } from '../src/share/roomclock.js';

export const TARGET_MS = 2;

const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};

/* ---------------------------------------------------------------- shared */

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) {
    failed += 1;
  }
}

/* The clock before roomclock.js, as src/share/rooms.js had it: the
 * tightest of SYNC_PINGS pings, then one every 30 s moving it at most
 * 2 ms toward that one exchange's estimate. */
class OldClock {
  constructor() {
    this.offset = null;
    this.best = Infinity;
    this.n = 0;
  }

  nextPingMs() {
    return this.n < SYNC_PINGS - 1 ? SYNC_GAP_MS : 30000;
  }

  sample(c, s, r) {
    const rtt = r - c;
    if (!(rtt >= 0)) {
      return;
    }
    this.n += 1;
    const est = s + rtt / 2 - r;
    if (this.n <= SYNC_PINGS) {
      if (rtt < this.best) {
        this.best = rtt;
        this.offset = est;
      }
      return;
    }
    this.offset += Math.max(-2, Math.min(2, est - this.offset));
  }

  roomAt(t) {
    return this.offset == null ? null : t + this.offset;
  }
}

function stats(errs) {
  const a = errs.map(Math.abs).sort((x, y) => x - y);
  const q = (p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
  return { p50: q(0.5), p95: q(0.95), max: a[a.length - 1], n: a.length };
}
const fmt = (s) => `p50 ${s.p50.toFixed(2)}  p95 ${s.p95.toFixed(2)}  max ${s.max.toFixed(2)} ms`;

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/* ----------------------------------------------------------------- model */

const NETS = {
  lan: { up: 0.25, down: 0.25, jitter: 0.1, spikeP: 0.05, spikeMs: 5 },
  internet: { up: 18, down: 22, jitter: 3, spikeP: 0.1, spikeMs: 40 },
};
const PAGES = {
  '60 fps': { frame: 1000 / 60, busy: 0.5 },
  '5 fps': { frame: 200, busy: 0.9 },
};
const DRIFT = 20e-6;
const RUN_MS = 300000;
const SETTLE_MS = 3000;

const SEEDS = [7, 11, 13];

/*
 * One run: true time T in ms. The room's clock is T + 12345.678, read as
 * Date.now() is, whole ms. The page's is (T - 777.7) (1 + DRIFT). The page
 * is busy for the first `busy` of each frame; a reply that lands then is
 * read when the frame's work ends, and a ping due then goes out then.
 * With roomRtt, each reply carries a round trip the room measured with
 * a ping frame, which the browser answers whatever its page is doing
 * (edge/rooms/node.js): one fresh pair of legs, never held by a frame.
 * Returns every error read.
 */
function modelRun(Clock, net, page, seed, roomRtt) {
  const r = rng(seed);
  const dither = rng(seed + 1);
  const leg = (base) => base + -Math.log(1 - r()) * net.jitter + (r() < net.spikeP ? r() * net.spikeMs : 0);
  const room = (T) => T + 12345.678;
  const pageAt = (T) => (T - 777.7) * (1 + DRIFT);
  const idleAt = (T) => {
    const k = Math.floor(T / page.frame);
    const busyEnd = k * page.frame + page.busy * page.frame;
    return T < busyEnd ? busyEnd : T;
  };
  const clock = new Clock(dither);
  const errs = [];
  let nextPing = idleAt(10);
  let nextRead = SETTLE_MS;
  /* Replies in flight: { readAt, c, s, rtt }, in the order they are read. */
  const flying = [];
  for (let T = 0; T < RUN_MS; T += 0.05) {
    if (T >= nextPing) {
      const c = pageAt(T);
      const arrive = T + leg(net.up);
      const s = Math.floor(room(arrive));
      const rtt = roomRtt ? leg(net.up) + leg(net.down) : null;
      flying.push({ readAt: idleAt(arrive + leg(net.down)), c, s, rtt });
      flying.sort((x, y) => x.readAt - y.readAt);
      nextPing = idleAt(T + clock.nextPingMs() / (1 + DRIFT));
    }
    while (flying.length && flying[0].readAt <= T) {
      const f = flying.shift();
      clock.sample(f.c, f.s, pageAt(T), f.rtt);
    }
    if (T >= nextRead) {
      nextRead += 50;
      const est = clock.roomAt(pageAt(T));
      if (est != null) {
        errs.push(est - room(T));
      }
    }
  }
  return errs;
}

function modelSection() {
  console.log(`\nmodel: ${RUN_MS / 1000} s each of seeds ${SEEDS.join(', ')}, error read every 50 ms after the first ${SETTLE_MS / 1000} s, page clock ${DRIFT * 1e6} ppm off`);
  console.log('  before: the clock before roomclock.js; own: roomclock.js on its own round trips (the Durable Object, or a server before');
  console.log('  edge/rooms/node.js measured them); room: roomclock.js with the room\'s round trip (edge/rooms/node.js now)');
  const pool = (Clock, net, page, roomRtt) => stats(SEEDS.flatMap((seed) => modelRun(Clock, net, page, seed, roomRtt)));
  for (const [netName, net] of Object.entries(NETS)) {
    const asym = Math.abs(net.down - net.up) / 2;
    for (const [pageName, page] of Object.entries(PAGES)) {
      const before = pool(OldClock, net, page, false);
      const own = pool(RoomClock, net, page, false);
      const room = pool(RoomClock, net, page, true);
      console.log(`  ${netName.padEnd(8)} ${pageName.padEnd(6)}  before  ${fmt(before)}`);
      console.log(`  ${''.padEnd(15)}  own     ${fmt(own)}`);
      console.log(`  ${''.padEnd(15)}  room    ${fmt(room)}`);
      if (netName === 'lan') {
        check(`${netName} ${pageName}: under ${TARGET_MS} ms at p95, own and room`, own.p95 < TARGET_MS && room.p95 < TARGET_MS, `${own.p95.toFixed(2)}, ${room.p95.toFixed(2)}`);
      } else {
        check(`${netName} ${pageName}: with the room's round trip, within 1 ms of half the asymmetry (${asym} ms) at p95`, room.p95 <= asym + 1, room.p95.toFixed(2));
      }
      check(`${netName} ${pageName}: no worse than before at p95, own and room`, own.p95 <= before.p95 && room.p95 <= before.p95,
        `${own.p95.toFixed(2)}, ${room.p95.toFixed(2)} against ${before.p95.toFixed(2)}`);
    }
  }
}


/* -------------------------------------------------------------- loopback */

async function loopbackSection() {
  console.log('\nloopback: the real server in its own process, this process as the page');
  const { default: WebSocket } = await import('ws');
  const { PROTO, ROOM_LEVEL } = await import('../src/share/roomwire.js');
  const scratch = mkdtempSync(join(tmpdir(), 'roomclock-'));
  const child = fork(fileURLToPath(import.meta.url), ['--serve'], { env: { ...process.env, ROOMCLOCK_DB: join(scratch, 'rooms.db') }, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  const ask = (m, key) => new Promise((resolve) => {
    const on = (x) => {
      if (x && x[key] !== undefined) {
        child.off('message', on);
        resolve(x[key]);
      }
    };
    child.on('message', on);
    if (m) {
      child.send(m);
    }
  });
  try {
    const port = await ask(null, 'port');
    const origin = `http://127.0.0.1:${port}`;
    const res = await fetch(`${origin}/v2/create`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1' }, body: JSON.stringify({ map: 'swiss2' }),
    });
    const { code } = await res.json();
    const epochs = await ask('epochs', 'epochs');
    const epoch = Object.values(epochs)[0];
    /* The room's time now, on this machine's clock, which the room reads
     * as Date.now(): sub-millisecond here. */
    const truth = () => performance.timeOrigin + performance.now() - epoch;
    for (const [label, busyMs] of [['idle page', 0], ['5 fps page, busy 170 ms of 200', 170]]) {
      /* One seat per clock, so each pings on its own schedule within the
       * room's allowance (edge/rooms/core.js CLOCK_PER_S). */
      const clocks = { before: new OldClock(), now: new RoomClock() };
      const errs = { before: [], now: [] };
      const sockets = [];
      const timers = [];
      for (const clock of Object.values(clocks)) {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/v2/room/${code}`);
        sockets.push(ws);
        await new Promise((resolve, reject) => {
          ws.on('open', resolve);
          ws.on('error', reject);
        });
        const ping = () => {
          ws.send(JSON.stringify({ type: 't', c: performance.now() }));
          timers.push(setTimeout(ping, clock.nextPingMs()));
        };
        ws.on('message', (data, binary) => {
          if (binary) {
            return;
          }
          const r = performance.now();
          const m = JSON.parse(String(data));
          if (m.type === 'welcome') {
            ping();
          } else if (m.type === 't') {
            clock.sample(m.c, m.s, r);
          }
        });
        ws.send(JSON.stringify({
          type: 'hello', proto: PROTO, build: 'fdfpv', level: ROOM_LEVEL, name: [1, 2, 42], profile: { airframe: 'interceptor', map: 'swiss2', figure: 0, livery: null, parts: null },
        }));
      }
      const t0 = performance.now();
      const RUN = 40000;
      await new Promise((resolve) => {
        const frame = () => {
          const start = performance.now();
          if (start - t0 > RUN) {
            resolve();
            return;
          }
          if (start - t0 > SETTLE_MS) {
            for (const k of Object.keys(clocks)) {
              const est = clocks[k].roomAt(performance.now());
              if (est != null) {
                errs[k].push(est - truth());
              }
            }
          }
          while (performance.now() - start < busyMs) {
            /* The frame's work: the event loop is held, as a busy page's is. */
          }
          setTimeout(frame, busyMs ? 200 - busyMs : 50);
        };
        frame();
      });
      timers.forEach(clearTimeout);
      sockets.forEach((ws) => ws.close());
      const before = stats(errs.before);
      const now = stats(errs.now);
      console.log(`  ${label}`);
      console.log(`    before  ${fmt(before)}`);
      console.log(`    now     ${fmt(now)}  (best round trip ${clocks.now.bestRtt().toFixed(2)} ms)`);
      check(`${label}: under ${TARGET_MS} ms at p95`, now.p95 < TARGET_MS, now.p95.toFixed(2));
    }
  } finally {
    child.send('stop');
    await new Promise((resolve) => child.on('exit', resolve));
    rmSync(scratch, { recursive: true, force: true });
  }
}

async function main() {
  const only = arg('only', 'model,loopback').split(',');
  console.log(`roomclock-check: target under ${TARGET_MS} ms at p95 on a LAN`);
  if (only.includes('model')) {
    modelSection();
  }
  if (only.includes('loopback')) {
    await loopbackSection();
  }
  console.log(`\n${failed ? `${failed} failed` : 'all passed'}`);
  process.exit(failed ? 1 : 0);
}

/* The server, when this file is its own child (loopbackSection). */
async function serve() {
  const { startRooms } = await import('../edge/rooms/node.js');
  const running = await startRooms({ db: process.env.ROOMCLOCK_DB, port: 0 });
  process.on('message', (m) => {
    if (m === 'epochs') {
      const out = {};
      for (const [name, room] of running.env.ROOMS.objects) {
        const core = room.host.core;
        if (core) {
          out[name] = core.meta.epoch;
        }
      }
      process.send({ epochs: out });
    } else if (m === 'stop') {
      running.stop().then(() => process.exit(0));
    }
  });
  process.send({ port: running.port });
}

if (process.argv.includes('--serve')) {
  await serve();
} else {
  await main();
}
